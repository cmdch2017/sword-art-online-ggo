import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import {
  MISSION_PHASE,
  WEAPON_MODE,
  advanceMission,
  clamp,
  createMissionState,
  createWeaponState,
  nextBladeCombo,
  parryWindowOpen,
  reflectProjectile,
  resolveCircleRect,
  switchWeaponMode,
  tickWeapon
} from "./core.mjs";
import { AnimationController, chooseAnimationState } from "./animation-controller.js";
import { BGM_STATUS, createBgmController } from "./bgm-controller.mjs";
import { MmdPoseController } from "./mmd-pose.js";
import { loadModelAsset } from "./model-loader.js";
import { selectCharacterModel } from "./model-schema.mjs";
import {
  createCombatFeedback,
  fireCombatFeedback,
  hitCombatFeedback,
  sampleCombatShake,
  updateCombatFeedback
} from "./combat-feedback.mjs";
import {
  createMovementFeedback,
  updateMovementFeedback
} from "./movement-feedback.mjs";
import {
  MAGIC_ELEMENT,
  MAGIC_ELEMENT_ORDER,
  beginMagicCast,
  cancelMagicCast,
  createMagicState,
  cycleMagicElement,
  magicElementProfile,
  releaseMagicCast,
  tickMagicState
} from "./magic-state.mjs";
import {
  applyWeaponOffset,
  attachWeapon,
  findBone,
  restoreWeapon
} from "./weapon-attach.js";

const TAU = Math.PI * 2;
const WORLD_LIMIT = { minX: -54, maxX: 54, minZ: -49, maxZ: 54 };
const DEFAULT_BGM_LABEL = "刀剑神域 GGO BGM";
const COLORS = {
  ink: 0x050a0b,
  paper: 0xecf1ed,
  amber: 0xffac3d,
  amberHot: 0xffd08a,
  teal: 0x4fd1bd,
  danger: 0xff6048,
  violet: 0xb784ff,
  blue: 0x5ea8ff
};
const IS_PRIVATE_BUILD = __PRIVATE_BUILD__;
const IS_PUBLIC_BUILD = __PUBLIC_BUILD__;

const $ = (id) => document.getElementById(id);
const dom = {
  canvas: $("game"),
  hud: $("hud"),
  objective: $("objective-text"),
  pips: $("uplink-pips"),
  runTime: $("run-time"),
  crosshair: $("crosshair"),
  hitmarker: $("hitmarker"),
  parryCallout: $("parry-callout"),
  healthValue: $("health-value"),
  healthBar: $("health-bar"),
  staminaValue: $("stamina-value"),
  staminaBar: $("stamina-bar"),
  ammo: $("ammo-value"),
  reserve: $("reserve-value"),
  weaponName: $("weapon-name"),
  gunMode: $("gun-mode"),
  bladeMode: $("blade-mode"),
  magicMode: $("magic-mode"),
  magicHud: $("magic-hud"),
  magicElement: $("magic-element"),
  manaValue: $("mana-value"),
  manaBar: $("mana-bar"),
  magicChargeBar: $("magic-charge-bar"),
  interaction: $("interaction"),
  interactionLabel: $("interaction-label"),
  interactionBar: $("interaction-bar"),
  objectiveGuide: $("objective-guide"),
  bossHud: $("boss-hud"),
  bossBar: $("boss-bar"),
  bossPhase: $("boss-phase"),
  toast: $("toast"),
  damageIndicator: $("damage-indicator"),
  killCount: $("kill-count"),
  parryCount: $("parry-count"),
  title: $("title-screen"),
  pause: $("pause-screen"),
  end: $("end-screen"),
  endKicker: $("end-kicker"),
  endTitle: $("end-title"),
  endCopy: $("end-copy"),
  endTime: $("end-time"),
  endKills: $("end-kills"),
  endParries: $("end-parries"),
  start: $("start-button"),
  resume: $("resume-button"),
  restart: $("restart-button"),
  redeploy: $("redeploy-button"),
  quality: $("quality-select"),
  fov: $("fov-input"),
  fovValue: $("fov-value"),
  sensitivity: $("sensitivity-input"),
  sensitivityValue: $("sensitivity-value"),
  volume: $("volume-input"),
  volumeValue: $("volume-value"),
  bgm: $("bgm"),
  bgmFile: $("bgm-file"),
  bgmPickTitle: $("bgm-pick-title"),
  bgmPickPause: $("bgm-pick-pause"),
  bgmStatusTitle: $("bgm-status-title"),
  bgmStatusPause: $("bgm-status-pause"),
  modelAttribution: $("model-attribution"),
  buildLabel: $("build-label"),
  legalNotice: $("legal-notice"),
  touch: $("touch-controls"),
  moveStick: $("move-stick"),
  touchSwap: $("touch-swap"),
  touchReload: $("touch-reload"),
  touchMagic: $("touch-magic"),
  touchElement: $("touch-element"),
  touchCrouch: $("touch-crouch"),
  touchJump: $("touch-jump"),
  touchBlock: $("touch-block"),
  touchFire: $("touch-fire"),
  boot: $("boot"),
  bootProgress: $("boot-progress"),
  bootDetail: $("boot-detail"),
  fatal: $("fatal")
};

const isTouch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const app = {
  started: false,
  running: false,
  paused: false,
  ended: false,
  elapsed: 0,
  kills: 0,
  parries: 0,
  quality: "high",
  baseFov: 72,
  sensitivity: 1,
  volume: 0.7,
  cameraYaw: 0,
  cameraPitch: -0.12,
  cameraShake: 0,
  blockStartedAt: -Infinity,
  lastShotAt: -10,
  lastDamageAt: -10,
  bossUnlockAt: Infinity,
  toastTimer: 0,
  hitMarkerTimer: 0,
  parryCalloutTimer: 0,
  flash: 0,
  lightningIn: 9,
  lightning: 0,
  interactionTarget: null,
  interactionProgress: 0
};

const input = {
  forward: 0,
  backward: 0,
  left: 0,
  right: 0,
  sprint: false,
  fire: false,
  aim: false,
  block: false,
  crouch: false,
  interact: false,
  jumpQueued: false,
  touchForward: 0,
  touchRight: 0,
  pointerFire: false,
  pointerBlock: false,
  padForward: 0,
  padRight: 0,
  dragging: false,
  dragX: 0,
  dragY: 0
};

const mission = createMissionState(3);
const weapon = createWeaponState();
const magic = createMagicState();
const player = {
  position: new THREE.Vector3(0, 0, 47),
  velocity: new THREE.Vector3(),
  radius: 0.72,
  yaw: 0,
  facing: 0,
  verticalVelocity: 0,
  grounded: true,
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  dashCooldown: 0,
  invulnerable: 0,
  attack: null,
  attackQueued: false,
  comboResetAt: 0,
  hitSet: new Set(),
  moving: 0,
  strafe: 0,
  eyeHeight: 1.52,
  rig: null
};
let movementFeedback = createMovementFeedback();
let combatFeedback = createCombatFeedback();
let movementFrame = null;
let magicCastEffect = null;
const magicTelemetry = {
  casts: 0,
  impacts: 0,
  lastElement: null
};
const enemies = [];
const terminals = [];
const projectiles = [];
const transientEffects = [];
const obstacleColliders = [];
const obstacleBoxes = [];
const cameraObstacles = [];
let boss = null;
let extractionPoint = null;
let bossUnlockTimer = 0;
let gameOverTimer = 0;
let scene;
let camera;
let renderer;
let composer;
let bloomPass;
let aoPass;
let gradePass;
let tonePass;
let fxaaPass;
let depthTexture;
let clock;
let directionLight;
let hemisphereLight;
let rain;
let rainData;
let rainSplash;
let dust;
let playerMuzzle;
let muzzleLight;
let worldRoot;
let dynamicRoot;
let titleOrbit = 0;
let audio;
let bgmController;
let bgmObjectUrl = "";
let bgmSourceMode = IS_PRIVATE_BUILD ? "embedded-default" : "none";
let adaptedExposure = 1.08;
let selectedPlayerModel = null;
const atmosphereLightPosition = new THREE.Vector3(22, 36, -18);
const projectedAtmosphereLight = new THREE.Vector3();
const atmosphereForward = new THREE.Vector3();
const atmosphereToLight = new THREE.Vector3();

window.__danrenInputDebug = () => ({
  started: app.started,
  running: app.running,
  paused: app.paused,
  ended: app.ended,
  cameraYaw: app.cameraYaw,
  cameraPitch: app.cameraPitch,
  weaponMode: weapon.mode,
  attack: player.attack,
  fire: input.fire,
  pointerFire: input.pointerFire,
  pointerLock: document.pointerLockElement?.id || null,
  weaponName: dom.weaponName?.textContent || "",
  pauseHidden: dom.pause?.classList.contains("hidden")
});

window.__danrenFeedbackDebug = () => ({
  movement: {
    phase: movementFeedback.phase,
    steps: movementFeedback.stepIndex,
    lastFoot: movementFeedback.lastFoot,
    bobX: movementFeedback.bobX,
    bobY: movementFeedback.bobY,
    roll: movementFeedback.roll,
    landingDip: movementFeedback.landingDip
  },
  combat: {
    shots: combatFeedback.shots,
    burst: combatFeedback.burst,
    bloom: combatFeedback.bloom,
    crosshair: combatFeedback.crosshair,
    pitch: combatFeedback.pitch,
    yaw: combatFeedback.yaw,
    roll: combatFeedback.roll,
    shake: combatFeedback.shake
  },
  camera: {
    yaw: app.cameraYaw,
    pitch: app.cameraPitch,
    fov: camera?.fov || app.baseFov
  },
  crosshairGap: dom.crosshair?.style.getPropertyValue("--gap") || "0px"
});

window.__danrenMagicDebug = () => ({
  selectedElement: magic.selectedElement,
  profile: magicElementProfile(magic.selectedElement),
  mana: magic.mana,
  maxMana: magic.maxMana,
  charging: magic.charging,
  charge: magic.charge,
  cooldown: magic.cooldown,
  casts: magicTelemetry.casts,
  impacts: magicTelemetry.impacts,
  lastElement: magicTelemetry.lastElement
});

window.__danrenBgmDebug = () => ({
  backgroundMusicMode: bgmSourceMode,
  ambienceMode: "rain-only",
  ...(bgmController?.getState() || {
    status: BGM_STATUS.EMPTY,
    label: "",
    error: "",
    hasSource: false
  })
});

window.__danrenWeaponDebug = {
  snapshot() {
    const rig = player.rig;
    if (!rig) return null;
    const records = {};
    for (const [kind, object] of [
      ["gun", rig.gunGroup],
      ["blade", rig.bladePivot]
    ]) {
      const worldPosition = object.getWorldPosition(new THREE.Vector3());
      const worldQuaternion = object.getWorldQuaternion(new THREE.Quaternion());
      const worldScale = object.getWorldScale(new THREE.Vector3());
      records[kind] = {
        parent: object.parent?.name || null,
        visible: object.visible,
        position: object.position.toArray(),
        rotation: object.rotation.toArray().slice(0, 3),
        quaternion: object.quaternion.toArray(),
        worldPosition: worldPosition.toArray(),
        worldQuaternion: worldQuaternion.toArray(),
        worldScale: worldScale.toArray(),
        parentWorldPosition: object.parent?.getWorldPosition(new THREE.Vector3()).toArray() || null,
        parentWorldQuaternion: object.parent?.getWorldQuaternion(new THREE.Quaternion()).toArray() || null
      };
    }
    return records;
  },
  apply(kind, transform = {}) {
    const object = kind === "gun" ? player.rig?.gunGroup : player.rig?.bladePivot;
    if (!object) return false;
    if (transform.position) object.position.fromArray(transform.position);
    if (transform.rotation) object.rotation.fromArray(transform.rotation);
    if (transform.scale) object.scale.fromArray(transform.scale);
    object.updateMatrix();
    return true;
  },
  applyWorld(kind, transform = {}) {
    const object = kind === "gun" ? player.rig?.gunGroup : player.rig?.bladePivot;
    const parent = object?.parent;
    if (!object || !parent) return false;
    parent.updateWorldMatrix(true, false);
    const parentScale = parent.getWorldScale(object.scale.clone());
    const worldOrigin = parent.getWorldPosition(object.position.clone());
    const worldTarget = worldOrigin.add(
      object.position.clone().fromArray(transform.worldOffset || [0, 0, 0])
    );
    object.position.copy(parent.worldToLocal(worldTarget));
    if (transform.rotation) object.rotation.fromArray(transform.rotation);
    if (transform.worldScale != null) {
      object.scale.set(
        transform.worldScale / parentScale.x,
        transform.worldScale / parentScale.y,
        transform.worldScale / parentScale.z
      );
    }
    object.updateMatrix();
    return true;
  }
};

function fail(message) {
  dom.fatal.textContent = `启动失败\n\n${message}`;
  dom.fatal.classList.remove("hidden");
  dom.boot.classList.add("done");
  console.error(message);
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function dampVector(vector, target, lambda, dt) {
  const amount = 1 - Math.exp(-lambda * dt);
  vector.x = THREE.MathUtils.lerp(vector.x, target.x, amount);
  vector.z = THREE.MathUtils.lerp(vector.z, target.z, amount);
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function setBoot(percent, detail) {
  dom.bootProgress.style.width = `${percent}%`;
  if (detail) dom.bootDetail.textContent = detail;
}

function makeCanvasTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.86)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.16)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const particleTexture = makeCanvasTexture();

function initRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas: dom.canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setClearColor(COLORS.ink, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x061012);
  scene.fog = new THREE.FogExp2(0x071113, 0.017);
  camera = new THREE.PerspectiveCamera(app.baseFov, window.innerWidth / window.innerHeight, 0.08, 220);
  camera.position.set(0, 8, 58);

  const renderWidth = Math.round(window.innerWidth * getPixelRatio());
  const renderHeight = Math.round(window.innerHeight * getPixelRatio());
  depthTexture = new THREE.DepthTexture(renderWidth, renderHeight, THREE.UnsignedIntType);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;
  const renderTarget = new THREE.WebGLRenderTarget(
    renderWidth,
    renderHeight,
    {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture,
      stencilBuffer: false
    }
  );
  composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));

  aoPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: depthTexture },
      uResolution: { value: new THREE.Vector2(renderWidth, renderHeight) },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uRadius: { value: 1.7 },
      uStrength: { value: 0.82 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec2 uResolution;
      uniform float uNear;
      uniform float uFar;
      uniform float uRadius;
      uniform float uStrength;
      varying vec2 vUv;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float linearDepth(float depth) {
        return (uNear * uFar) / (uFar - depth * (uFar - uNear));
      }

      void main() {
        vec4 source = texture2D(tDiffuse, vUv);
        float rawDepth = texture2D(tDepth, vUv).x;
        if (uStrength < 0.001 || rawDepth > 0.999995) {
          gl_FragColor = source;
          return;
        }

        float centerZ = linearDepth(rawDepth);
        float radiusUv = clamp(uRadius / centerZ, 1.0 / uResolution.y, 0.045);
        float aspect = uResolution.x / uResolution.y;
        float rotation = hash12(gl_FragCoord.xy) * 6.2831853;
        float occlusion = 0.0;

        for (int index = 0; index < 8; index++) {
          float ring = (float(index) + 1.0) / 8.0;
          float angle = rotation + float(index) * 2.39996323;
          vec2 offset = vec2(cos(angle), sin(angle)) * radiusUv * ring;
          offset.x /= aspect;
          float sampleZ = linearDepth(texture2D(tDepth, vUv + offset).x);
          float delta = centerZ - sampleZ;
          float range = 1.0 - smoothstep(uRadius * 0.35, uRadius, abs(delta));
          occlusion += step(0.018, delta) * range * (1.0 - ring);
        }

        float ao = clamp(1.0 - occlusion * uStrength * 0.42, 0.38, 1.0);
        ao = mix(ao, 1.0, smoothstep(38.0, 105.0, centerZ));
        vec3 coolOcclusion = vec3(0.73, 0.9, 1.0);
        source.rgb *= mix(coolOcclusion, vec3(1.0), ao);
        gl_FragColor = source;
      }
    `
  });
  composer.addPass(aoPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.63,
    0.5,
    0.94
  );
  composer.addPass(bloomPass);

  gradePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uDamage: { value: 0 },
      uVignette: { value: 0.56 },
      uMotion: { value: 0 },
      uShaft: { value: 0 },
      uLightScreen: { value: new THREE.Vector2(0.76, 0.66) },
      uLightColor: { value: new THREE.Color(0x87ddd0) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform float uDamage;
      uniform float uVignette;
      uniform float uMotion;
      uniform float uShaft;
      uniform vec2 uLightScreen;
      uniform vec3 uLightColor;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec2 uv = vUv;
        vec2 center = uv - 0.5;
        float edge = clamp(dot(center, center) * 2.0, 0.0, 1.0);
        float aspect = uResolution.x / uResolution.y;
        vec3 base = texture2D(tDiffuse, uv).rgb;

        if (uMotion > 0.001) {
          vec3 blur = base;
          vec2 blurStep = center * uMotion * 0.012;
          for (int index = 1; index <= 4; index++) {
            float weight = 1.0 - float(index) * 0.16;
            blur += texture2D(tDiffuse, uv - blurStep * float(index)).rgb * weight;
          }
          blur /= 6.4;
          base = mix(base, blur, smoothstep(0.04, 0.72, edge));
        }

        float ab = 0.00035 + edge * 0.0014 + uDamage * 0.0009;
        vec3 color;
        color.r = texture2D(tDiffuse, uv + center * ab).r;
        color.g = base.g;
        color.b = texture2D(tDiffuse, uv - center * ab).b;

        vec2 lightDelta = (uv - uLightScreen) * vec2(aspect, 1.0);
        float lightDistance = length(lightDelta);
        float rays = pow(abs(sin(atan(lightDelta.y, lightDelta.x) * 5.0 + uTime * 0.18)), 7.0);
        float shaft = exp(-lightDistance * 4.8) * (0.55 + rays * 0.45);
        shaft += exp(-lightDistance * lightDistance * 24.0) * 0.34;
        color += uLightColor * shaft * uShaft * (0.38 + edge * 0.85);

        float grain = hash(uv * uResolution + fract(uTime) * 147.0) - 0.5;
        color += grain * 0.022;
        float vignette = smoothstep(1.0, 0.12, edge * (1.1 + uVignette));
        color *= mix(0.52, 1.0, vignette);
        float low = max(0.0, 1.0 - dot(color, vec3(0.2126, 0.7152, 0.0722)) * 3.8);
        color += vec3(0.002, 0.008, 0.011) * low;
        color.r += uDamage * (0.16 + edge * 0.82);
        color.g *= 1.0 - uDamage * 0.25;
        color.b *= 1.0 - uDamage * 0.3;
        gl_FragColor = vec4(max(color, 0.0), 1.0);
      }
    `
  });
  composer.addPass(gradePass);

  tonePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uExposure: { value: 1.08 },
      uToneMix: { value: 0.72 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uExposure;
      uniform float uToneMix;
      varying vec2 vUv;

      vec3 acesCurve(vec3 color) {
        return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
      }

      vec3 softFilmic(vec3 color) {
        vec3 shoulder = (color * (2.75 * color + 0.06)) / (color * (2.55 * color + 0.42) + 0.11);
        float luma = dot(shoulder, vec3(0.2126, 0.7152, 0.0722));
        shoulder = mix(vec3(luma), shoulder, 0.86);
        shoulder = pow(max(shoulder, 0.0), vec3(0.92));
        shoulder += vec3(0.0035, 0.008, 0.012) * (1.0 - smoothstep(0.0, 0.22, luma));
        return clamp(shoulder, 0.0, 1.0);
      }

      void main() {
        vec3 color = max(texture2D(tDiffuse, vUv).rgb, 0.0) * uExposure;
        vec3 mapped = mix(acesCurve(color), softFilmic(color), uToneMix);
        gl_FragColor = vec4(mapped, 1.0);
      }
    `
  });
  composer.addPass(tonePass);
  composer.addPass(new OutputPass());
  fxaaPass = new ShaderPass(FXAAShader);
  composer.addPass(fxaaPass);
  resize();
}

function getPixelRatio() {
  const device = Math.min(window.devicePixelRatio || 1, 2);
  if (app.quality === "low") return Math.min(device, 1);
  if (app.quality === "medium") return Math.min(device, 1.25);
  return Math.min(device, 1.65);
}

function resize() {
  if (!renderer || !camera || !composer) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = getPixelRatio();
  const renderWidth = Math.max(1, Math.round(width * pixelRatio));
  const renderHeight = Math.max(1, Math.round(height * pixelRatio));
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (aoPass) {
    aoPass.uniforms.uResolution.value.set(renderWidth, renderHeight);
    aoPass.uniforms.uNear.value = camera.near;
    aoPass.uniforms.uFar.value = camera.far;
    aoPass.uniforms.uRadius.value = app.quality === "high" ? 1.7 : 1.42;
    aoPass.uniforms.uStrength.value =
      app.quality === "high" ? 0.82 : app.quality === "medium" ? 0.58 : 0;
  }
  if (gradePass) gradePass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
  if (fxaaPass) {
    fxaaPass.material.uniforms.resolution.value.set(
      1 / (width * pixelRatio),
      1 / (height * pixelRatio)
    );
  }
}

function createSky() {
  const geometry = new THREE.SphereGeometry(150, 32, 18);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: new THREE.Color(0x010406) },
      uHorizon: { value: new THREE.Color(0x123033) },
      uAccent: { value: new THREE.Color(COLORS.teal) }
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uAccent;
      varying vec3 vWorld;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 34.56);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 5; i++) {
          value += noise(p) * amp;
          p = p * 2.03 + 11.7;
          amp *= 0.5;
        }
        return value;
      }

      void main() {
        vec3 direction = normalize(vWorld);
        float height = clamp(direction.y * 0.72 + 0.35, 0.0, 1.0);
        vec3 color = mix(uHorizon, uTop, smoothstep(0.0, 0.9, height));
        vec2 skyUv = vec2(atan(direction.z, direction.x) * 2.2, direction.y * 5.0);
        float cloud = fbm(skyUv * 2.4 + vec2(uTime * 0.008, 0.0));
        float band = smoothstep(0.52, 0.78, cloud) * smoothstep(0.0, 0.34, direction.y);
        color += uAccent * band * 0.09;
        float streak = smoothstep(0.88, 0.98, fbm(skyUv * 7.0 - uTime * 0.01));
        color += uAccent * streak * 0.035;
        float stars = step(0.994, hash(floor(vUv * vec2(760.0, 340.0)))) * smoothstep(0.16, 0.62, direction.y);
        color += vec3(0.36, 0.62, 0.62) * stars * 0.35;
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = "ProceduralSky";
  scene.add(sky);
  return material;
}

const shaderNoise = `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x), f.y);
  }

  float fbm21(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += noise21(p) * amplitude;
      p = p * 2.02 + 17.3;
      amplitude *= 0.5;
    }
    return value;
  }
`;

function createGroundMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWetness: { value: 0.56 },
      uRainIntensity: { value: 0.8 },
      uFogColor: { value: new THREE.Color(0x071113) },
      uFogDensity: { value: 0.017 },
      uAmber: { value: new THREE.Color(COLORS.amber) },
      uTeal: { value: new THREE.Color(COLORS.teal) },
      uSkyLight: { value: new THREE.Color(0x6eaaa7) },
      uLightDirection: { value: new THREE.Vector3(0.34, 0.82, 0.22).normalize() }
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormalWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      ${shaderNoise}
      uniform float uTime;
      uniform float uWetness;
      uniform float uRainIntensity;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform vec3 uAmber;
      uniform vec3 uTeal;
      uniform vec3 uSkyLight;
      uniform vec3 uLightDirection;
      varying vec3 vWorld;
      varying vec3 vNormalWorld;

      vec4 rainRipple(vec2 p, float time) {
        vec2 cell = floor(p);
        vec2 local = fract(p) - 0.5;
        float seed = hash21(cell);
        vec2 offset = vec2(hash21(cell + 17.1), hash21(cell + 42.7)) - 0.5;
        float phase = fract(time * (0.64 + seed * 0.48) + seed * 19.0);
        float radius = phase * 0.46;
        vec2 delta = local - offset * 0.56;
        float radiusLength = length(delta);
        float feather = mix(0.018, 0.055, phase);
        float ring = 1.0 - smoothstep(feather, feather + 0.035, abs(radiusLength - radius));
        float fade = (1.0 - phase) * (0.35 + seed * 0.65);
        vec2 slope = delta / max(radiusLength, 0.001) * ring * fade;
        return vec4(slope, ring * fade, phase);
      }

      void main() {
        vec2 p = vWorld.xz;
        float broad = fbm21(p * 0.09);
        float detail = fbm21(p * 0.72);
        float scratches = smoothstep(0.76, 0.96, fbm21(vec2(p.x * 2.8, p.y * 0.28)));
        float cracks = 1.0 - smoothstep(0.0, 0.035, abs(fbm21(p * 0.32) - 0.49));
        float puddleField = fbm21(p * 0.14 + 9.0) + detail * 0.12 + broad * 0.08;
        float puddle = smoothstep(0.54, 0.73, puddleField) * uWetness;
        float damp = smoothstep(0.36, 0.66, puddleField) * uWetness;
        float soaked = smoothstep(0.48, 0.7, puddleField) * uWetness;
        vec3 dry = mix(vec3(0.026, 0.035, 0.036), vec3(0.092, 0.105, 0.098), broad * 0.65 + detail * 0.2);
        dry = mix(dry, vec3(0.19, 0.13, 0.065), smoothstep(0.63, 0.86, broad) * 0.22);
        dry -= scratches * 0.035;
        dry -= cracks * vec3(0.035, 0.028, 0.02);
        vec3 wet = mix(vec3(0.009, 0.018, 0.021), vec3(0.028, 0.064, 0.069), detail);
        wet *= mix(0.76, 1.08, broad);
        vec3 color = mix(dry, wet, max(damp * 0.42, soaked * 0.68));
        color = mix(color, wet * vec3(0.62, 0.78, 0.8), puddle * 0.9);

        vec2 gridCoord = abs(fract(p * 0.24 - 0.5) - 0.5) / fwidth(p * 0.24);
        float gridLine = 1.0 - min(min(gridCoord.x, gridCoord.y), 1.0);
        color += vec3(0.10, 0.16, 0.15) * gridLine * (1.0 - puddle * 0.72) * 0.12;

        float laneA = 1.0 - smoothstep(0.0, 0.035, abs(p.x + 0.06));
        float laneB = 1.0 - smoothstep(0.0, 0.025, abs(p.x - 11.8));
        float dash = step(0.55, fract(p.y * 0.12));
        color += uAmber * (laneA + laneB * dash) * 0.16 * (1.0 - puddle * 0.55);

        vec4 rippleA = rainRipple(p * 0.72, uTime);
        vec4 rippleB = rainRipple(p.yx * 1.43 + vec2(4.7, 11.2), uTime * 1.17 + 3.0);
        float rippleMask = uRainIntensity * mix(0.22, 1.0, puddle) * smoothstep(0.02, 0.42, damp + puddle);
        vec2 rippleSlope = (rippleA.xy + rippleB.xy * 0.62) * rippleMask * 0.14;
        float rippleGlint = max(rippleA.z, rippleB.z * 0.7) * rippleMask;

        vec3 viewDirection = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(viewDirection, vNormalWorld), 0.0), 3.0);
        vec3 surfaceNormal = normalize(vec3(-rippleSlope.x, 1.0, -rippleSlope.y));
        vec3 halfVector = normalize(viewDirection + normalize(uLightDirection));
        float sharpGlint = pow(max(dot(surfaceNormal, halfVector), 0.0), mix(38.0, 118.0, puddle));
        float wetSpec = fresnel * (0.16 + soaked * 0.45 + puddle * 0.98);
        vec3 coolReflection = mix(uTeal, uSkyLight, 0.32 + broad * 0.5) * wetSpec * 0.62;
        float reflectedLamp = pow(0.5 + 0.5 * sin(p.y * 0.12 + broad * 5.0), 12.0) * puddle;
        coolReflection += mix(uTeal, uAmber, 0.34) * reflectedLamp * fresnel * 0.16;
        color += coolReflection;
        color += uSkyLight * sharpGlint * (0.035 + puddle * 0.18);
        color += uAmber * rippleGlint * 0.025;

        float distanceToCamera = distance(cameraPosition, vWorld);
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * distanceToCamera * distanceToCamera);
        color = mix(color, uFogColor, clamp(fog, 0.0, 0.92));
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
}

function createMetalMaterial(baseColor, accent = COLORS.amber, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    metalness: options.metalness ?? 0.78,
    roughness: options.roughness ?? 0.38,
    emissive: options.emissive ?? 0x020303,
    emissiveIntensity: options.emissiveIntensity ?? 0.18
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = { value: new THREE.Color(accent) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vProcWorld;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvProcWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vProcWorld;
        uniform vec3 uAccent;
        ${shaderNoise}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float metalNoise = fbm21(vProcWorld.xz * 1.7 + vProcWorld.y * 0.8);
        float rust = smoothstep(0.58, 0.79, fbm21(vProcWorld.xy * 0.9 + vProcWorld.zx * 0.35));
        float scrape = smoothstep(0.74, 0.92, fbm21(vec2(vProcWorld.x + vProcWorld.z, vProcWorld.y * 8.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.32, 1.18, 0.84), metalNoise * 0.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.065, 0.025), rust * 0.3);
        diffuseColor.rgb += scrape * 0.025;
        float stripe = step(0.92, fract(vProcWorld.y * 1.2 + vProcWorld.x * 0.08));
        diffuseColor.rgb += uAccent * stripe * 0.09;`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + metalNoise * 0.34 + rust * 0.4 - scrape * 0.16, 0.08, 1.0);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor = clamp(metalnessFactor - rust * 0.4 + scrape * 0.16, 0.0, 1.0);`
      );
  };
  material.customProgramCacheKey = () => `procedural-metal-${baseColor}-${accent}-${options.roughness ?? 0.38}`;
  return material;
}

function createEmissiveMaterial(color, intensity = 2.5, transparent = false, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent,
    opacity,
    blending: transparent ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !transparent,
    toneMapped: false
  });
}

function addLightStrip(parent, x, y, z, width, depth, color = COLORS.amber, vertical = false) {
  const geometry = vertical
    ? new THREE.BoxGeometry(0.055, width, depth)
    : new THREE.BoxGeometry(width, 0.055, depth);
  const mesh = new THREE.Mesh(geometry, createEmissiveMaterial(color, 3));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addObstacle(x, z, width, height, depth, color = 0x182326, accent = COLORS.amber) {
  const material = createMetalMaterial(color, accent);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  worldRoot.add(mesh);
  const collider = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    minY: 0,
    maxY: height
  };
  obstacleColliders.push(collider);
  obstacleBoxes.push(
    new THREE.Box3(
      new THREE.Vector3(collider.minX, 0, collider.minZ),
      new THREE.Vector3(collider.maxX, height, collider.maxZ)
    )
  );
  cameraObstacles.push(mesh);

  const rim = new THREE.Group();
  addLightStrip(rim, 0, height - 0.16, depth / 2 + 0.03, width * 0.74, 0.035, accent);
  addLightStrip(rim, width / 2 + 0.03, height * 0.58, 0, 0.035, depth * 0.62, accent, true);
  rim.position.set(x, 0, z);
  worldRoot.add(rim);
  return mesh;
}

function createTower(x, z, height, accent = COLORS.teal) {
  const group = new THREE.Group();
  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.5, height, 6),
    createMetalMaterial(0x111a1c, accent, { roughness: 0.52, metalness: 0.62 })
  );
  lower.position.y = height / 2;
  lower.castShadow = true;
  lower.receiveShadow = true;
  group.add(lower);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.65, 1.2, 6),
    createMetalMaterial(0x253032, accent)
  );
  cap.position.y = height + 0.35;
  cap.castShadow = true;
  group.add(cap);
  addLightStrip(group, 0, height + 0.98, 0, 1.25, 0.055, accent);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    createEmissiveMaterial(accent, 4)
  );
  beacon.position.y = height + 1.1;
  group.add(beacon);
  const light = new THREE.PointLight(accent, 11, 18, 2);
  light.position.y = height + 0.85;
  group.add(light);
  group.position.set(x, 0, z);
  worldRoot.add(group);
  return group;
}

function buildEnvironment() {
  worldRoot = new THREE.Group();
  dynamicRoot = new THREE.Group();
  scene.add(worldRoot, dynamicRoot);

  scene.userData.skyMaterial = createSky();

  const groundMaterial = createGroundMaterial();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150, 1, 1), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  ground.name = "ProceduralWetGround";
  worldRoot.add(ground);
  worldRoot.userData.groundMaterial = groundMaterial;

  hemisphereLight = new THREE.HemisphereLight(0x6c9896, 0x070606, 1.45);
  scene.add(hemisphereLight);

  directionLight = new THREE.DirectionalLight(0xb9e0d9, 3.1);
  directionLight.position.set(24, 42, 18);
  directionLight.castShadow = true;
  directionLight.shadow.mapSize.set(2048, 2048);
  directionLight.shadow.camera.left = -65;
  directionLight.shadow.camera.right = 65;
  directionLight.shadow.camera.top = 65;
  directionLight.shadow.camera.bottom = -65;
  directionLight.shadow.camera.near = 2;
  directionLight.shadow.camera.far = 120;
  directionLight.shadow.bias = -0.00035;
  scene.add(directionLight);

  const amberLight = new THREE.PointLight(COLORS.amber, 42, 34, 2);
  amberLight.position.set(-8, 8, 31);
  scene.add(amberLight);
  const tealLight = new THREE.PointLight(COLORS.teal, 38, 38, 2);
  tealLight.position.set(18, 6, -14);
  scene.add(tealLight);

  addObstacle(-42, 36, 13, 3.8, 9, 0x192326, COLORS.amber);
  addObstacle(38, 39, 11, 5.2, 12, 0x152124, COLORS.teal);
  addObstacle(-47, 8, 10, 4.4, 21, 0x182023, COLORS.teal);
  addObstacle(45, 5, 10, 5.8, 17, 0x172124, COLORS.amber);
  addObstacle(8, 31, 7, 3.2, 7, 0x1b2425, COLORS.amber);
  addObstacle(-24, 27, 8, 2.6, 5, 0x162022, COLORS.teal);
  addObstacle(-2, 7, 8, 3.1, 10, 0x1c2526, COLORS.amber);
  addObstacle(34, -14, 11, 5.4, 10, 0x182224, COLORS.teal);
  addObstacle(-37, -20, 12, 4.2, 14, 0x1a2224, COLORS.amber);
  addObstacle(-27, -42, 13, 4.8, 8, 0x141d20, COLORS.teal);
  addObstacle(28, -40, 13, 4.8, 9, 0x141d20, COLORS.amber);
  addObstacle(-5, -48, 16, 6.5, 6, 0x11191c, COLORS.danger);

  createTower(-51, -43, 18, COLORS.amber);
  createTower(51, -42, 21, COLORS.teal);
  createTower(-52, 50, 16, COLORS.teal);
  createTower(51, 50, 18, COLORS.amber);

  const perimeterMaterial = createMetalMaterial(0x101719, COLORS.teal, {
    roughness: 0.66,
    metalness: 0.46
  });
  const perimeterGeometry = new THREE.BoxGeometry(112, 6.5, 1.2);
  for (const [x, z, rotation] of [
    [0, -53, 0],
    [0, 58, 0],
    [-57, 2, Math.PI / 2],
    [57, 2, Math.PI / 2]
  ]) {
    const wall = new THREE.Mesh(perimeterGeometry, perimeterMaterial);
    wall.position.set(x, 3.25, z);
    wall.rotation.y = rotation;
    wall.receiveShadow = true;
    worldRoot.add(wall);
  }

  buildRunwayDetails();
  buildRain();
  buildRainSplash();
  buildDust();
  buildTitleSilhouettes();
}

function buildRunwayDetails() {
  const stripMaterial = createEmissiveMaterial(COLORS.amber, 2.3, true, 0.62);
  for (let index = 0; index < 18; index += 1) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 2.3), stripMaterial);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(-4.5, 0.025, 51 - index * 5.6);
    worldRoot.add(strip);
    const strip2 = strip.clone();
    strip2.position.x = 4.5;
    worldRoot.add(strip2);
  }

  const padMaterial = new THREE.MeshStandardMaterial({
    color: 0x131c1e,
    metalness: 0.84,
    roughness: 0.3,
    emissive: 0x081012,
    emissiveIntensity: 0.5
  });
  const startPad = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.8, 0.22, 12), padMaterial);
  startPad.position.set(0, 0.11, 48);
  startPad.receiveShadow = true;
  worldRoot.add(startPad);
  const rings = new THREE.Group();
  for (const radius of [3.1, 4.8]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.035, 5, 64),
      createEmissiveMaterial(radius > 4 ? COLORS.teal : COLORS.amber, 2, true, 0.78)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.24;
    rings.add(ring);
  }
  rings.position.set(0, 0, 48);
  worldRoot.add(rings);
}

function buildRain() {
  const count = 720;
  const positions = new Float32Array(count * 6);
  rainData = [];
  for (let index = 0; index < count; index += 1) {
    const x = randomRange(-74, 74);
    const y = randomRange(1, 42);
    const z = randomRange(-66, 64);
    const length = randomRange(0.42, 1.4);
    positions[index * 6] = x;
    positions[index * 6 + 1] = y;
    positions[index * 6 + 2] = z;
    positions[index * 6 + 3] = x + 0.06;
    positions[index * 6 + 4] = y - length;
    positions[index * 6 + 5] = z + 0.02;
    rainData.push({ x, y, z, length, speed: randomRange(17, 29) });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x8bc2c0,
    transparent: true,
    opacity: 0.23,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  rain = new THREE.LineSegments(geometry, material);
  rain.frustumCulled = false;
  scene.add(rain);
}

function buildRainSplash() {
  const count = 240;
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.attributes.position);
  geometry.setAttribute("uv", base.attributes.uv);
  geometry.instanceCount = count;

  const offsets = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    offsets[index * 3] = randomRange(-62, 62);
    offsets[index * 3 + 1] = 0;
    offsets[index * 3 + 2] = randomRange(-56, 62);
    seeds[index] = Math.random();
  }
  geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.72 },
      uColor: { value: new THREE.Color(0x8ac5bd) }
    },
    vertexShader: `
      attribute vec3 aOffset;
      attribute float aSeed;
      uniform float uTime;
      varying vec2 vUv;
      varying float vLife;
      varying float vFade;

      void main() {
        vUv = uv;
        float rate = 0.78 + fract(aSeed * 7.13) * 0.56;
        float life = fract(uTime * rate + aSeed * 19.0);
        float radius = mix(0.08, 0.62, life);
        vec3 world = aOffset + vec3(position.x * radius, 0.032 + life * 0.008, -position.y * radius);
        float distanceToCamera = distance(world, cameraPosition);
        vLife = life;
        vFade = (1.0 - smoothstep(5.0, 42.0, distanceToCamera)) * smoothstep(0.25, 1.8, distanceToCamera);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vLife;
      varying float vFade;

      void main() {
        float radial = length(vUv - 0.5) * 2.0;
        float ring = 1.0 - smoothstep(0.08, 0.17, abs(radial - 0.76));
        ring *= 1.0 - smoothstep(0.7, 1.0, radial);
        float crown = (1.0 - smoothstep(0.02, 0.2, abs(radial - 0.24))) * (1.0 - vLife) * 0.22;
        float alpha = (ring * 0.72 + crown) * (1.0 - vLife) * vFade * uIntensity;
        gl_FragColor = vec4(uColor * (0.7 + (1.0 - vLife) * 0.5), alpha);
      }
    `
  });
  rainSplash = new THREE.Mesh(geometry, material);
  rainSplash.name = "RainImpactRipples";
  rainSplash.frustumCulled = false;
  rainSplash.renderOrder = 2;
  rainSplash.userData.fullCount = count;
  scene.add(rainSplash);
}

function buildDust() {
  const count = 460;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = randomRange(-65, 65);
    positions[index * 3 + 1] = randomRange(0.15, 11);
    positions[index * 3 + 2] = randomRange(-52, 55);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xa5d0c8,
    size: 0.035,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: particleTexture,
    sizeAttenuation: true
  });
  dust = new THREE.Points(geometry, material);
  dust.frustumCulled = false;
  scene.add(dust);
}

function buildTitleSilhouettes() {
  const material = new THREE.MeshBasicMaterial({ color: 0x071012 });
  for (const [x, z, size] of [
    [-35, -58, 10],
    [-17, -61, 14],
    [5, -64, 18],
    [28, -60, 13],
    [47, -62, 16],
    [-55, -57, 11]
  ]) {
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(size, size * 2.8, 5), material);
    mountain.position.set(x, size * 0.55, z);
    mountain.scale.z = 0.7;
    worldRoot.add(mountain);
  }
}

function createPlayerRig() {
  const root = new THREE.Group();
  root.name = "PlayerRig";
  const importedModelRoot = new THREE.Group();
  importedModelRoot.name = "ImportedPlayerModel";
  root.add(importedModelRoot);

  const suit = new THREE.MeshStandardMaterial({
    color: 0x172124,
    metalness: 0.56,
    roughness: 0.38,
    emissive: 0x020505,
    emissiveIntensity: 0.2
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x232b2c,
    metalness: 0.08,
    roughness: 0.76
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xb9c5be,
    metalness: 0.35,
    roughness: 0.44
  });
  const amber = createEmissiveMaterial(COLORS.amber, 2.4);
  const teal = createEmissiveMaterial(COLORS.teal, 3.2);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.38), suit);
  torso.position.y = 1.27;
  torso.castShadow = true;
  root.add(torso);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.36, 0.44), white);
  chestPlate.position.set(0, 1.38, -0.015);
  chestPlate.castShadow = true;
  root.add(chestPlate);

  const chestLine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.31, 0.02), amber);
  chestLine.position.set(0.17, 1.38, -0.235);
  root.add(chestLine);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 9), white);
  head.position.y = 1.88;
  head.castShadow = true;
  root.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.07), amber);
  visor.position.set(0, 1.89, -0.215);
  root.add(visor);

  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.28, 0.34), cloth);
  hip.position.y = 0.81;
  root.add(hip);

  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 0.79, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.23), suit);
    thigh.position.y = -0.28;
    thigh.castShadow = true;
    pivot.add(thigh);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.19), cloth);
    shin.position.set(0, -0.71, -0.015);
    shin.castShadow = true;
    pivot.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.4), suit);
    boot.position.set(0, -0.96, -0.09);
    pivot.add(boot);
    root.add(pivot);
    return pivot;
  }

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.47, 1.52, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.42, 0.2), suit);
    upper.position.y = -0.22;
    upper.castShadow = true;
    pivot.add(upper);
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.18), white);
    forearm.position.set(0, -0.59, -0.02);
    forearm.castShadow = true;
    pivot.add(forearm);
    root.add(pivot);
    return pivot;
  }

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  const fallbackParts = [
    torso,
    chestPlate,
    chestLine,
    head,
    visor,
    hip,
    leftLeg,
    rightLeg,
    leftArm,
    ...rightArm.children.filter((child) => child.isMesh)
  ];

  const gunGroup = new THREE.Group();
  gunGroup.position.set(0, -0.73, -0.17);
  const gunBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.2, 0.78),
    createMetalMaterial(0x9ca9a2, COLORS.amber, {
      roughness: 0.29,
      metalness: 0.82,
      emissive: 0x111614,
      emissiveIntensity: 0.4
    })
  );
  gunBody.position.z = -0.36;
  gunBody.castShadow = true;
  gunGroup.add(gunBody);
  const gunReceiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.13, 0.45),
    createMetalMaterial(0x182427, COLORS.teal, { roughness: 0.38, metalness: 0.74 })
  );
  gunReceiver.position.set(0, -0.09, -0.29);
  gunReceiver.castShadow = true;
  gunGroup.add(gunReceiver);
  const gunStock = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.12, 0.28),
    createMetalMaterial(0x56655f, COLORS.amber, { roughness: 0.45, metalness: 0.68 })
  );
  gunStock.position.set(0, -0.015, 0.17);
  gunGroup.add(gunStock);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.62, 10),
    createMetalMaterial(0x263331, COLORS.teal, {
      roughness: 0.3,
      metalness: 0.84,
      emissive: 0x073431,
      emissiveIntensity: 1.2
    })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.98;
  gunGroup.add(barrel);
  const barrelGlow = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.54), teal);
  barrelGlow.position.set(0, 0.002, -0.99);
  gunGroup.add(barrelGlow);
  const muzzleBrake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.065, 0.1, 10),
    createMetalMaterial(0x293532, COLORS.amber, {
      roughness: 0.26,
      metalness: 0.9,
      emissive: 0x3b1d05,
      emissiveIntensity: 1.4
    })
  );
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.z = -1.31;
  gunGroup.add(muzzleBrake);
  const gunAccent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.56), teal);
  gunAccent.position.set(0.115, 0.055, -0.42);
  gunGroup.add(gunAccent);
  const gunRail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.48), white);
  gunRail.position.set(0, 0.125, -0.38);
  gunGroup.add(gunRail);
  const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.11), gunReceiver.material);
  gunGrip.position.set(0, -0.18, -0.08);
  gunGrip.rotation.x = -0.18;
  gunGroup.add(gunGrip);
  playerMuzzle = new THREE.Object3D();
  playerMuzzle.position.z = -1.34;
  gunGroup.add(playerMuzzle);
  rightArm.add(gunGroup);

  const bladePivot = new THREE.Group();
  bladePivot.position.set(0, -0.73, -0.06);
  bladePivot.rotation.set(-0.2, 0, -0.18);
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.32, 0.075),
    createMetalMaterial(0x101719, COLORS.amber)
  );
  bladePivot.add(grip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.09), amber);
  guard.position.y = 0.18;
  bladePivot.add(guard);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.065, 1.78, 0.035), teal);
  blade.position.y = 1.02;
  bladePivot.add(blade);
  const bladeCore = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.62, 0.045), white);
  bladeCore.position.y = 1.04;
  bladePivot.add(bladeCore);
  const bladeLight = new THREE.PointLight(COLORS.teal, 5.5, 4.5, 2);
  bladeLight.position.y = 0.95;
  bladePivot.add(bladeLight);
  leftArm.add(bladePivot);

  muzzleLight = new THREE.PointLight(COLORS.amberHot, 0, 7, 2);
  muzzleLight.position.set(0.52, 1.2, -1.3);
  root.add(muzzleLight);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  root.add(shadow);

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  player.rig = {
    root,
    importedModelRoot,
    importedModel: null,
    fallbackParts,
    torso,
    head,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    gunGroup,
    bladePivot,
    blade,
    bladeLight,
    bladeOffset: { x: 0, y: 0, z: 0 },
    shadow
  };
  captureWeaponRestPose(gunGroup);
  captureWeaponRestPose(bladePivot);
  scene.add(root);
  updateWeaponVisuals();
}

function setModelStatus(state, reason = null, modelId = null) {
  window.__danrenModelStatus = { state, reason, modelId };
}

function updateModelAttribution(entry = null) {
  if (!dom.modelAttribution) return;
  if (!IS_PRIVATE_BUILD) {
    dom.modelAttribution.textContent =
      "程序化原创角色 // 公开教育构建 // 不包含 SAO 原作模型或美术";
    dom.modelAttribution.removeAttribute("title");
    return;
  }
  if (!entry) {
    dom.modelAttribution.textContent = "刀剑神域 GGO 私人学习致敬作品 // PRIVATE STUDY BUILD";
    dom.modelAttribution.removeAttribute("title");
    return;
  }

  dom.modelAttribution.textContent =
    `${entry.label} // ${entry.author} // ${entry.license} // PRIVATE STUDY BUILD`;
  dom.modelAttribution.title = `${entry.sourceUrl}\n${entry.licenseUrl}`;
}

function configureBuildPresentation() {
  if (IS_PRIVATE_BUILD) {
    if (dom.buildLabel) dom.buildLabel.textContent = "PRIVATE STUDY BUILD / WEBGL2";
    if (dom.legalNotice) {
      dom.legalNotice.textContent =
        "非官方、非商业私人学习构建。项目未获 SAO 权利方授权；角色模型、原曲及商标权利归各自权利人，" +
        "请在本地学习使用，不得用于商业分发。";
    }
    return;
  }

  if (dom.buildLabel) {
    dom.buildLabel.textContent = "PUBLIC EDUCATIONAL BUILD / PROCEDURAL ASSETS";
  }
  if (dom.legalNotice) {
    dom.legalNotice.textContent =
      "非官方、非商业教育致敬项目。项目未获 SAO 权利方授权；公开版仅包含原创代码、" +
      "程序化场景与合成音效，不包含原作角色模型、原曲、纹理或其他美术资源。";
  }
  updateModelAttribution();
}

function restoreProceduralPlayerModel() {
  const rig = player.rig;
  if (!rig) return;

  if (rig.importedModel) {
    for (const record of [...rig.importedModel.weaponRecords].reverse()) {
      restoreWeapon(record);
    }
    rig.importedModel.animationController?.dispose();
    rig.importedModel.poseController?.dispose();
    rig.importedModel.asset.dispose();
    rig.importedModel = null;
  }

  captureWeaponRestPose(rig.gunGroup);
  captureWeaponRestPose(rig.bladePivot);
  for (const part of rig.fallbackParts) part.visible = true;
  updateModelAttribution(null);
  updateWeaponVisuals();
}

function activateImportedPlayerModel(asset) {
  const rig = player.rig;
  if (!rig) throw new Error("Player rig is not ready for an imported model");

  const entry = asset.entry;
  const weaponRecords = [];
  let animationController = null;
  let poseController = null;

  try {
    if (asset.animations.length > 0) {
      animationController = new AnimationController(
        asset.scene,
        asset.animations,
        entry.animations
      );
    } else {
      poseController = new MmdPoseController(asset.scene);
    }
    poseController?.update({ state: "idle", moving: 0, elapsed: 0 }, 1);

    for (const [weaponKind, weaponObject] of [
      ["gun", rig.gunGroup],
      ["blade", rig.bladePivot]
    ]) {
      const bone = findBone(asset.scene, entry.weaponBones?.[weaponKind] || []);
      if (!bone) continue;
      weaponRecords.push(
        attachWeapon(
          weaponObject,
          bone,
          entry.weaponTransforms?.[weaponKind] || {}
        )
      );
      captureWeaponRestPose(weaponObject);
    }

    rig.importedModelRoot.add(asset.scene);
    for (const part of rig.fallbackParts) part.visible = false;

    rig.importedModel = {
      asset,
      animationController,
      poseController,
      weaponRecords
    };
    animationController?.setState("idle");
    window.__danrenPoseDebug = poseController
      ? {
          controller: poseController,
          boneCount: Object.keys(poseController.bones).length
        }
      : null;
    rig.root.position.copy(player.position);
    rig.root.rotation.y = player.facing;
    updateModelAttribution(entry);
    setModelStatus("active", null, entry.id);
    return true;
  } catch (error) {
    for (const record of weaponRecords.reverse()) restoreWeapon(record);
    captureWeaponRestPose(rig.gunGroup);
    captureWeaponRestPose(rig.bladePivot);
    animationController?.dispose();
    poseController?.dispose();
    asset.dispose();
    for (const part of rig.fallbackParts) part.visible = true;
    updateModelAttribution(null);
    throw error;
  }
}

async function initializePlayerModel() {
  setModelStatus("loading");

  try {
    const response = await fetch("models/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Model manifest request failed: ${response.status}`);
    const manifest = await response.json();
    selectedPlayerModel = selectCharacterModel(
      manifest,
      manifest.defaultCharacter
    );

    if (!selectedPlayerModel) {
      setModelStatus("fallback", "No enabled character model");
      return;
    }

    setBoot(60, "LOADING LICENSED PLAYER MODEL");
    const asset = await loadModelAsset(selectedPlayerModel, {
      onProgress(event) {
        if (!event.total) return;
        const progress = clamp(event.loaded / event.total, 0, 1);
        setBoot(60 + progress * 14, "LOADING LICENSED PLAYER MODEL");
      }
    });
    activateImportedPlayerModel(asset);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[model] Procedural fallback active: ${reason}`);
    restoreProceduralPlayerModel();
    setModelStatus("fallback", reason, selectedPlayerModel?.id || null);
  }
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function lerpAngle(from, to, amount) {
  return from + angleDelta(from, to) * amount;
}

function resolvePlayerCollisions() {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const collider of obstacleColliders) {
      if (player.position.y > collider.maxY + 0.2) continue;
      const result = resolveCircleRect(
        { x: player.position.x, z: player.position.z, radius: player.radius },
        collider
      );
      if (result.collided) {
        player.position.x = result.x;
        player.position.z = result.z;
      }
    }
  }
  player.position.x = clamp(player.position.x, WORLD_LIMIT.minX + player.radius, WORLD_LIMIT.maxX - player.radius);
  player.position.z = clamp(player.position.z, WORLD_LIMIT.minZ + player.radius, WORLD_LIMIT.maxZ - player.radius);
}

function updatePlayer(dt) {
  const padForward = input.padForward || 0;
  const padRight = input.padRight || 0;
  let moveX = input.right - input.left + input.touchRight + padRight;
  let moveZ = input.forward - input.backward + input.touchForward + padForward;
  const moveLength = Math.hypot(moveX, moveZ);
  if (moveLength > 1) {
    moveX /= moveLength;
    moveZ /= moveLength;
  }

  const forward = new THREE.Vector3(-Math.sin(app.cameraYaw), 0, -Math.cos(app.cameraYaw));
  const right = new THREE.Vector3(Math.cos(app.cameraYaw), 0, -Math.sin(app.cameraYaw));
  const desiredDirection = forward.multiplyScalar(moveZ).add(right.clone().multiplyScalar(moveX));
  if (desiredDirection.lengthSq() > 1) desiredDirection.normalize();

  const sprinting = input.sprint && player.stamina > 1 && moveLength > 0.1;
  const baseSpeed =
    weapon.mode === WEAPON_MODE.BLADE
      ? 7.1
      : weapon.mode === WEAPON_MODE.MAGIC
        ? 6.05
        : 6.45;
  const speed = input.crouch ? 1.9 : baseSpeed * (sprinting ? 1.34 : 1);
  const targetVelocity = desiredDirection.multiplyScalar(speed);
  dampVector(player.velocity, targetVelocity, moveLength > 0.05 ? 14 : 10, dt);

  if (sprinting) {
    player.stamina = Math.max(0, player.stamina - dt * 22);
  } else {
    player.stamina = Math.min(player.maxStamina, player.stamina + dt * 16);
  }

  if (input.jumpQueued && player.grounded) {
    player.verticalVelocity = 7.4;
    player.grounded = false;
    audio?.jump();
  }
  input.jumpQueued = false;

  const impactSpeed = player.grounded ? 0 : Math.max(0, -player.verticalVelocity);
  player.verticalVelocity -= 20.5 * dt;
  player.position.y += player.verticalVelocity * dt;
  if (player.position.y <= 0) {
    player.position.y = 0;
    player.verticalVelocity = 0;
    player.grounded = true;
  }

  player.position.x += player.velocity.x * dt;
  player.position.z += player.velocity.z * dt;
  resolvePlayerCollisions();

  player.moving = Math.hypot(player.velocity.x, player.velocity.z);
  player.strafe = player.moving > 0.01
    ? clamp(player.velocity.dot(right) / Math.max(speed, 1), -1, 1)
    : 0;
  if (player.moving > 0.25) {
    const targetFacing = Math.atan2(-player.velocity.x, -player.velocity.z);
    player.facing = lerpAngle(player.facing, targetFacing, 1 - Math.exp(-12 * dt));
  } else if (input.aim || input.fire) {
    player.facing = lerpAngle(player.facing, app.cameraYaw, 1 - Math.exp(-16 * dt));
  }

  if (app.elapsed - app.lastDamageAt > 5) {
    player.health = Math.min(player.maxHealth, player.health + dt * 3.2);
  }
  player.invulnerable = Math.max(0, player.invulnerable - dt);

  movementFrame = updateMovementFeedback(movementFeedback, dt, {
    speed: player.moving,
    grounded: player.grounded,
    sprinting,
    crouching: input.crouch,
    strafe: player.strafe,
    impactSpeed,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  });
  if (movementFrame.step) audio?.footstep(movementFrame.step);
  if (movementFrame.landing) audio?.landing(movementFrame.landing);
  player.eyeHeight =
    (input.crouch ? 1.12 : 1.52) +
    movementFrame.bobY -
    movementFrame.landingDip;

  weapon.reloadRemaining = Math.max(0, weapon.reloadRemaining);
  updatePlayerRig(dt);
}

function updatePlayerRig(dt) {
  const rig = player.rig;
  if (!rig) return;
  rig.root.position.copy(player.position);
  if (input.crouch && player.grounded) rig.root.position.y -= 0.26;
  rig.root.rotation.y = player.facing;
  rig.shadow.position.y = 0.025 - rig.root.position.y;
  rig.shadow.material.opacity = clamp(0.34 - player.position.y * 0.08, 0.08, 0.34);

  if (rig.importedModel) {
    const state = chooseAnimationState({
      dead: player.health <= 0,
      hit: player.invulnerable > 0,
      attacking: Boolean(player.attack),
      firing:
        (input.fire && weapon.mode === WEAPON_MODE.GUN) ||
        (magic.charging && weapon.mode === WEAPON_MODE.MAGIC),
      blocking: input.block && weapon.mode === WEAPON_MODE.BLADE,
      aiming: input.aim && weapon.mode === WEAPON_MODE.GUN,
      sprinting: input.sprint && player.moving > 4,
      moving: player.moving > 0.25
    });
    if (rig.importedModel.poseController) {
      const attackProgress = player.attack
        ? clamp(player.attack.time / player.attack.duration, 0, 1)
        : 0;
      rig.importedModel.poseController.update(
        {
          state,
          moving: player.moving,
          elapsed: app.started ? app.elapsed : performance.now() / 1000,
          attackProgress
        },
        dt
      );
    } else {
      rig.importedModel.animationController?.setState(state);
      rig.importedModel.animationController?.update(dt);
    }
  } else {
    const stride = Math.sin(movementFeedback.phase) * clamp(player.moving / 6, 0, 1);
    rig.leftLeg.rotation.x = damp(rig.leftLeg.rotation.x, stride * 0.53, 14, dt);
    rig.rightLeg.rotation.x = damp(rig.rightLeg.rotation.x, -stride * 0.53, 14, dt);
    const recoilArm =
      weapon.mode === WEAPON_MODE.GUN
        ? -0.18
        : weapon.mode === WEAPON_MODE.MAGIC
          ? -1.2 - magic.charge * 0.3
          : -0.05;
    rig.rightArm.rotation.x = damp(rig.rightArm.rotation.x, recoilArm, 11, dt);
    rig.leftArm.rotation.x = damp(
      rig.leftArm.rotation.x,
      input.aim && weapon.mode === WEAPON_MODE.GUN ? -0.9 : -stride * 0.24,
      9,
      dt
    );
    rig.torso.rotation.z = damp(rig.torso.rotation.z, -moveXOrZero() * 0.04, 8, dt);
    rig.head.rotation.x = clamp(app.cameraPitch * 0.1, -0.18, 0.15);

    if (player.attack) {
      const attack = player.attack;
      const progress = clamp(attack.time / attack.duration, 0, 1);
      const swing = Math.sin(progress * Math.PI);
      if (attack.variant === 0) {
        setWeaponPose(
          rig,
          -0.7 - progress * 1.65,
          0.15,
          -0.18 - swing * 1.25
        );
      } else if (attack.variant === 1) {
        setWeaponPose(
          rig,
          -0.65 - progress * 1.3,
          -0.1,
          0.55 + swing * 0.95
        );
      } else {
        setWeaponPose(
          rig,
          -1.1 - progress * 1.9,
          progress * 0.8,
          -0.8 + progress * 1.45
        );
      }
      rig.leftArm.rotation.z = 0.4 + swing * 0.6;
    } else if (weapon.mode === WEAPON_MODE.BLADE) {
      const blocking = input.block;
      setWeaponPose(
        rig,
        damp(rig.bladeOffset.x, blocking ? -1.34 : 0.08, 16, dt),
        damp(rig.bladeOffset.y, blocking ? 0.08 : 0, 14, dt),
        damp(rig.bladeOffset.z, blocking ? -0.65 : 0.04, 14, dt)
      );
      rig.leftArm.rotation.z = damp(rig.leftArm.rotation.z, blocking ? 0.35 : 0, 12, dt);
    } else if (weapon.mode === WEAPON_MODE.MAGIC) {
      rig.leftArm.rotation.z = damp(
        rig.leftArm.rotation.z,
        -0.42 - magic.charge * 0.18,
        12,
        dt
      );
      setWeaponPose(rig, -0.28, -0.1, -0.16);
    } else {
      rig.leftArm.rotation.z = damp(rig.leftArm.rotation.z, 0, 12, dt);
      setWeaponPose(rig, 0.08, 0, 0.04);
    }
  }

  const selectedMagic = magicElementProfile(magic.selectedElement);
  rig.bladeLight.color.setHex(
    weapon.mode === WEAPON_MODE.MAGIC ? selectedMagic.color : COLORS.teal
  );
  rig.bladeLight.intensity =
    (weapon.mode === WEAPON_MODE.BLADE
      ? 6
      : weapon.mode === WEAPON_MODE.MAGIC
        ? 3.2 + magic.charge * 5
        : 2.4) +
    Math.sin(performance.now() * 0.016) * 0.8;
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 62);
}

function moveXOrZero() {
  return input.right - input.left + input.touchRight + (input.padRight || 0);
}

function captureWeaponRestPose(object) {
  object.userData.weaponRestQuaternion = object.quaternion.clone();
}

function setWeaponPose(rig, x, y, z) {
  rig.bladeOffset.x = x;
  rig.bladeOffset.y = y;
  rig.bladeOffset.z = z;
  const rest = rig.bladePivot.userData.weaponRestQuaternion;
  applyWeaponOffset(rig.bladePivot, rest, x, y, z);
}

function updateWeaponVisuals() {
  if (!player.rig) return;
  player.rig.gunGroup.visible = true;
  player.rig.bladePivot.visible = true;
}

function toggleWeapon(mode) {
  if (!app.running || player.attack) return;
  const nextMode =
    mode ||
    (weapon.mode === WEAPON_MODE.GUN
      ? WEAPON_MODE.BLADE
      : weapon.mode === WEAPON_MODE.BLADE
        ? WEAPON_MODE.MAGIC
        : WEAPON_MODE.GUN);
  if (nextMode === weapon.mode) return;
  if (magic.charging) {
    cancelMagicCast(magic, true);
    clearMagicChargeEffect();
  }
  Object.assign(weapon, switchWeaponMode(weapon, nextMode));
  updateWeaponVisuals();
  input.fire = false;
  input.pointerFire = false;
  input.aim = false;
  input.block = false;
  audio?.swap();
  const label =
    nextMode === WEAPON_MODE.GUN
      ? "ARC-9 脉冲步枪已就绪"
      : nextMode === WEAPON_MODE.BLADE
        ? "零界光刃已展开"
        : `${magicElementProfile(magic.selectedElement).label}术式已连接 // 按住左键蓄力`;
  showToast(label, 1400);
}

function startReload() {
  if (!app.running) return;
  if (weapon.mode === WEAPON_MODE.MAGIC) {
    cycleMagicElement(magic);
    const profile = magicElementProfile(magic.selectedElement);
    audio?.magicSelect(magic.selectedElement);
    showToast(`${profile.label} // ${profile.spellName}`, 1200);
    return;
  }
  if (weapon.mode !== WEAPON_MODE.GUN || weapon.reloadRemaining > 0) return;
  if (weapon.ammo >= weapon.magSize || weapon.reserve <= 0) return;
  weapon.reloadRemaining = weapon.reloadDuration;
  audio?.reloadStart();
}

function updatePlayerAttack(dt) {
  if (!player.attack) {
    if (input.fire && weapon.mode === WEAPON_MODE.GUN) tryFireGun();
    return;
  }

  const attack = player.attack;
  attack.time += dt;
  if (attack.time >= attack.duration * 0.2 && !attack.hit) {
    attack.hit = true;
    resolveBladeHit(attack.variant);
  }

  if (attack.time >= attack.duration) {
    player.attack = null;
    if (player.attackQueued) {
      player.attackQueued = false;
      startBladeAttack();
    }
  }
}

function triggerPrimaryPress() {
  if (!app.running) return;
  if (weapon.mode === WEAPON_MODE.BLADE) startBladeAttack();
  if (weapon.mode === WEAPON_MODE.MAGIC && !magic.charging) {
    const started = beginMagicCast(magic);
    if (!started.started) {
      if (started.reason === "mana") {
        showToast(`魔力不足 // 需要 ${started.required} 点`, 1100);
      } else if (started.reason === "cooldown") {
        showToast("术式冷却中", 800);
      }
      return;
    }
    startMagicChargeEffect(started);
  }
}

function triggerPrimaryRelease() {
  input.fire = false;
  input.pointerFire = false;
  if (weapon.mode !== WEAPON_MODE.MAGIC) return;
  const result = releaseMagicCast(magic);
  clearMagicChargeEffect();
  if (result.cast) {
    castMagicProjectile(result);
  } else if (result.reason === "undercharged") {
    showToast("术式未完成 // 按住蓄力后释放", 900);
  } else if (result.reason === "mana") {
    showToast(`魔力不足 // 需要 ${result.required} 点`, 1100);
  }
}

function startBladeAttack() {
  if (!app.running || weapon.mode !== WEAPON_MODE.BLADE) return;
  if (player.attack) {
    if (player.attack.time > player.attack.duration * 0.48) player.attackQueued = true;
    return;
  }
  const variant = weapon.combo;
  weapon.combo = nextBladeCombo(weapon.combo);
  player.attack = {
    variant,
    time: 0,
    duration: variant === 2 ? 0.43 : 0.34,
    hit: false
  };
  player.hitSet.clear();
  app.cameraShake = Math.max(app.cameraShake, 0.06);
  spawnBladeArc(variant);
  audio?.bladeSwing(variant);
}

function resolveBladeHit(variant) {
  const forward = new THREE.Vector3(-Math.sin(player.facing), 0, -Math.cos(player.facing));
  const reach = variant === 2 ? 4.1 : 3.35;
  const damage = [38, 43, 62][variant];
  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const dx = enemy.group.position.x - player.position.x;
    const dz = enemy.group.position.z - player.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > reach || distance < 0.3) continue;
    const dot = (dx / distance) * forward.x + (dz / distance) * forward.z;
    if (dot < Math.cos(1.35)) continue;
    hitEnemy(enemy, damage, false, true);
  }
  if (boss?.active && !boss.dying) {
    const dx = boss.group.position.x - player.position.x;
    const dz = boss.group.position.z - player.position.z;
    const distance = Math.hypot(dx, dz);
    const dot = distance > 0 ? (dx / distance) * forward.x + (dz / distance) * forward.z : 1;
    if (distance < reach + 1.8 && dot > Math.cos(1.2)) damageBoss(damage, true);
  }
}

function spawnBladeArc(variant) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(variant === 2 ? COLORS.amber : COLORS.teal) },
      uHotColor: { value: new THREE.Color(variant === 2 ? 0xffe3ad : 0xc8fff6) },
      uOpacity: { value: 1 },
      uProgress: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHotColor;
      uniform float uOpacity;
      uniform float uProgress;
      varying vec2 vUv;

      const float PI = 3.14159265359;

      void main() {
        vec2 p = (vUv - 0.5) * vec2(5.6, 3.8);
        float radius = length(p);
        float angle = atan(p.y, p.x);
        float arc = clamp((angle + 2.42) / 3.04, 0.0, 1.0);
        float arcEdge = smoothstep(0.0, 0.1, arc) * smoothstep(0.0, 0.1, 1.0 - arc);

        float headMask = 1.0 - smoothstep(uProgress - 0.018, uProgress + 0.03, arc);
        float tailMask = smoothstep(uProgress - 0.46, uProgress - 0.38, arc);
        float sweep = arcEdge * headMask * tailMask;

        float taper = sin(arc * PI);
        float halfWidth = mix(0.025, 0.115, taper);
        float band = 1.0 - smoothstep(halfWidth * 0.2, halfWidth, abs(radius - 1.72));
        float glow = 1.0 - smoothstep(halfWidth, halfWidth + 0.18, abs(radius - 1.72));
        float energy = clamp((band * 1.7 + glow * 0.3) * sweep, 0.0, 1.0);
        vec3 color = mix(uColor, uHotColor, band * 0.9);

        gl_FragColor = vec4(color * (0.9 + band * 1.4), energy * uOpacity * 0.82);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const arc = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 3.8, 1, 1),
    material
  );
  arc.position.set(0, 1.52, -0.92);
  arc.rotation.set(0, 0, variant * 0.42 - 0.38);
  arc.renderOrder = 8;
  player.rig.root.add(arc);
  transientEffects.push({
    object: arc,
    life: 0.2,
    maxLife: 0.2,
    update(effect) {
      const progress = 1 - effect.life / effect.maxLife;
      const reveal = clamp((progress - 0.03) / 0.78, 0, 1);
      const fade = Math.pow(clamp(effect.life / effect.maxLife, 0, 1), 0.6);
      effect.object.material.uniforms.uProgress.value = reveal;
      effect.object.material.uniforms.uOpacity.value = fade;
      effect.object.scale.setScalar(0.94 + progress * 0.08);
    },
    attachment: player.rig.root
  });
}

function tryFireGun() {
  if (weapon.reloadRemaining > 0 || weapon.fireCooldown > 0) return;
  if (weapon.ammo <= 0) {
    startReload();
    return;
  }

  weapon.ammo -= 1;
  weapon.fireCooldown = 0.105;
  app.lastShotAt = app.elapsed;
  const feedback = fireCombatFeedback(combatFeedback, {
    aiming: input.aim,
    crouching: input.crouch,
    sprinting: input.sprint && player.moving > 4,
    airborne: !player.grounded,
    moving: player.moving
  });

  const direction = camera.getWorldDirection(new THREE.Vector3());
  direction.x += randomRange(-feedback.spread, feedback.spread);
  direction.y += randomRange(-feedback.spread, feedback.spread);
  direction.z += randomRange(-feedback.spread, feedback.spread);
  direction.normalize();
  const ray = new THREE.Ray(camera.position, direction);
  const hit = findShotHit(ray);
  const muzzlePosition = playerMuzzle.getWorldPosition(new THREE.Vector3());
  spawnTracer(muzzlePosition, hit.point, COLORS.amberHot, 0.055);
  spawnMuzzleFlash();
  audio?.shoot();
  alertEnemies(player.position.x, player.position.z, 23);

  if (hit.enemy) {
    hitEnemy(hit.enemy, hit.headshot ? 34 : 18, hit.headshot, false);
  } else if (hit.boss) {
    damageBoss(18, false, hit.headshot);
  } else if (hit.point) {
    spawnImpact(hit.point, 0xb8c9c3, 5);
  }
}

function pulseCombatFeedback({ shake = 0, crosshair = 0, bloom = 0 } = {}) {
  combatFeedback.shake = Math.max(combatFeedback.shake, shake);
  combatFeedback.crosshair = Math.max(combatFeedback.crosshair, crosshair);
  combatFeedback.bloom = Math.max(combatFeedback.bloom, bloom);
}

function startMagicChargeEffect(started) {
  clearMagicChargeEffect();
  if (!player.rig?.root) return;

  const group = new THREE.Group();
  group.position.set(0, 1.32, -0.72);
  const profile = started.profile;
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.09, 2),
    createEmissiveMaterial(profile.hotColor, 7, true, 1)
  );
  group.add(core);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: profile.color,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.012, 6, 44), haloMaterial.clone());
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.008, 5, 52), haloMaterial.clone());
  ringA.rotation.x = Math.PI / 2;
  ringB.rotation.y = Math.PI / 2;
  group.add(ringA, ringB);

  const light = new THREE.PointLight(profile.color, 2.5, 5, 2);
  group.add(light);
  player.rig.root.add(group);
  magicCastEffect = {
    group,
    core,
    ringA,
    ringB,
    light,
    color: profile.color,
    spawnedAt: performance.now() / 1000
  };
}

function updateMagicChargeEffect(dt, now) {
  if (!magicCastEffect) return;
  const charge = clamp(magic.charge / magic.maxCharge, 0, 1);
  const group = magicCastEffect.group;
  group.position.y = 1.32 + Math.sin(now * 0.006) * 0.035;
  group.rotation.y += dt * (1.2 + charge * 3.5);
  magicCastEffect.ringA.rotation.z += dt * (2.2 + charge * 7);
  magicCastEffect.ringB.rotation.x -= dt * (1.8 + charge * 5.5);
  magicCastEffect.ringA.scale.setScalar(0.82 + charge * 0.38);
  magicCastEffect.ringB.scale.setScalar(1.05 - charge * 0.18);
  magicCastEffect.core.scale.setScalar(0.7 + charge * 1.25);
  magicCastEffect.light.intensity = 2.2 + charge * 10;
  audio?.magicCharge(charge, magic.selectedElement);
}

function clearMagicChargeEffect() {
  if (!magicCastEffect) return;
  const group = magicCastEffect.group;
  group.parent?.remove(group);
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  });
  magicCastEffect = null;
}

function castMagicProjectile(result) {
  const { profile, power, element } = result;
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const movementSpread = clamp(player.moving / 15, 0, 0.8);
  const spread =
    (1 - power) * 0.018 +
    movementSpread * 0.008 +
    (player.grounded ? 0 : 0.012);
  direction.x += randomRange(-spread, spread);
  direction.y += randomRange(-spread, spread);
  direction.z += randomRange(-spread, spread);
  direction.normalize();

  const origin = player.position.clone().add(new THREE.Vector3(
    direction.x * 0.75,
    player.eyeHeight - 0.2,
    direction.z * 0.75
  ));
  const projectile = spawnProjectile({
    owner: "player",
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: direction.x * profile.projectileSpeed,
    vy: direction.y * profile.projectileSpeed,
    vz: direction.z * profile.projectileSpeed,
    speed: profile.projectileSpeed,
    damage: Math.round(profile.damage * (0.72 + power * 0.53)),
    radius: 0.13 + power * 0.12,
    color: profile.color,
    life: 4.2,
    kind: "magic",
    element,
    magicProfile: profile,
    power,
    splashRadius: profile.radius * (0.58 + power * 0.42)
  });
  projectile.mesh.scale.setScalar(0.84 + power * 0.65);
  projectile.mesh.add(new THREE.Mesh(
    new THREE.TorusGeometry(0.23, 0.018, 5, 36),
    new THREE.MeshBasicMaterial({
      color: profile.hotColor,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  ));
  projectile.mesh.children[1].rotation.x = Math.PI / 2;

  magicTelemetry.casts += 1;
  magicTelemetry.lastElement = element;
  app.cameraShake = Math.max(app.cameraShake, 0.035 + power * 0.055);
  pulseCombatFeedback({
    shake: 0.08 + power * 0.16,
    crosshair: 0.26 + power * 0.34,
    bloom: 0.28 + power * 0.42
  });
  spawnBurst(origin, profile.color, 8 + Math.round(power * 12), 2.8 + power * 2.6, 0.32);
  alertEnemies(player.position.x, player.position.z, 25 + power * 8);
  audio?.magicRelease(element, power, origin);
}

function detonateMagicProjectile(projectile, position, directTargetId = null) {
  if (!projectile || projectile.detonated) return;
  projectile.detonated = true;
  const profile = projectile.magicProfile || magicElementProfile(projectile.element);
  const radius = projectile.splashRadius || profile.radius;
  const center = position.clone();
  magicTelemetry.impacts += 1;

  spawnMagicImpactEffect(center, projectile.element, profile, radius, projectile.power || 0);
  audio?.magicImpact(projectile.element, center, projectile.power || 0);
  app.cameraShake = Math.max(app.cameraShake, 0.035 + (projectile.power || 0) * 0.04);

  for (const enemy of enemies) {
    if (enemy.dead || enemy.id === directTargetId) continue;
    const distance = Math.hypot(
      enemy.group.position.x - center.x,
      enemy.group.position.z - center.z
    );
    if (distance > radius) continue;
    const falloff = 1 - clamp(distance / Math.max(radius, 0.01), 0, 1) * 0.55;
    hitEnemy(
      enemy,
      Math.round(projectile.damage * 0.58 * falloff),
      false,
      false,
      projectile.element
    );
    if (projectile.element === MAGIC_ELEMENT.ICE) {
      enemy.slowUntil = performance.now() + 1800 + (projectile.power || 0) * 900;
    }
    if (projectile.element === MAGIC_ELEMENT.WIND && distance > 0.1) {
      const push = (1 - distance / radius) * 1.15;
      enemy.group.position.x += ((enemy.group.position.x - center.x) / distance) * push;
      enemy.group.position.z += ((enemy.group.position.z - center.z) / distance) * push;
    }
  }

  if (
    boss?.active &&
    !boss.dying &&
    directTargetId !== "boss"
  ) {
    const distance = Math.hypot(
      boss.group.position.x - center.x,
      boss.group.position.z - center.z
    );
    if (directTargetId !== "boss" && distance <= radius + 1.4) {
      const falloff = 1 - clamp(distance / Math.max(radius + 1.4, 0.01), 0, 1) * 0.5;
      damageBoss(Math.round(projectile.damage * 0.5 * falloff), false, false);
    }
  }

  if (projectile.element === MAGIC_ELEMENT.LIGHTNING) {
    const chainTargets = enemies
      .filter((enemy) => !enemy.dead && enemy.id !== directTargetId)
      .map((enemy) => ({
        enemy,
        distance: Math.hypot(
          enemy.group.position.x - center.x,
          enemy.group.position.z - center.z
        )
      }))
      .filter(({ distance }) => distance <= radius * 1.35)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
    for (const { enemy } of chainTargets) {
      const target = enemy.group.position.clone().add(new THREE.Vector3(0, 1.05, 0));
      spawnTracer(center, target, profile.hotColor, 0.13);
      hitEnemy(enemy, Math.round(projectile.damage * 0.34), false, false, projectile.element);
    }
  }
}

function spawnMagicImpactEffect(position, element, profile, radius, power) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(profile.color) },
      uHotColor: { value: new THREE.Color(profile.hotColor) },
      uProgress: { value: 0 },
      uOpacity: { value: 1 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHotColor;
      uniform float uProgress;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.4);
        float bands = 0.62 + 0.38 * sin((vNormal.y + vNormal.x) * 18.0 - uProgress * 22.0);
        vec3 color = mix(uColor, uHotColor, fresnel * 0.85 + bands * 0.12);
        float alpha = (fresnel * 1.35 + 0.08) * uOpacity;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), material);
  sphere.position.copy(position);
  sphere.scale.setScalar(0.18);
  dynamicRoot.add(sphere);
  const life = 0.3 + power * 0.24;
  transientEffects.push({
    object: sphere,
    life,
    maxLife: life,
    update(effect) {
      const progress = 1 - effect.life / effect.maxLife;
      const scale = THREE.MathUtils.lerp(0.18, radius, Math.sin(progress * Math.PI * 0.72));
      effect.object.scale.setScalar(scale);
      effect.object.material.uniforms.uProgress.value = progress;
      effect.object.material.uniforms.uOpacity.value = Math.pow(1 - progress, 1.3);
    }
  });

  if (element === MAGIC_ELEMENT.WIND || element === MAGIC_ELEMENT.FIRE) {
    spawnShockwave(position.clone().setY(0.06), 0.4, radius, profile.color, 0.42, false);
  }
  spawnBurst(position, profile.hotColor, element === MAGIC_ELEMENT.LIGHTNING ? 34 : 24, 7, 0.58);
}

function findShotHit(ray) {
  const raycaster = new THREE.Raycaster(ray.origin, ray.direction, 0, 120);
  const point = new THREE.Vector3();
  let closestDistance = 120;
  let closestPoint = ray.at(115, new THREE.Vector3());
  let result = { point: closestPoint, enemy: null, boss: null, headshot: false };

  for (const box of obstacleBoxes) {
    const hitPoint = raycaster.ray.intersectBox(box, point.clone());
    if (hitPoint) {
      const distance = hitPoint.distanceTo(ray.origin);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPoint = hitPoint;
        result.point = closestPoint;
        result.enemy = null;
        result.boss = null;
      }
    }
  }

  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const center = enemy.group.position.clone().add(new THREE.Vector3(0, 1.06, 0));
    const sphere = new THREE.Sphere(center, enemy.type === "bulwark" ? 1.02 : 0.82);
    const hitPoint = raycaster.ray.intersectSphere(sphere, point.clone());
    if (hitPoint) {
      const distance = hitPoint.distanceTo(ray.origin);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPoint = hitPoint;
        result = {
          point: closestPoint,
          enemy,
          boss: null,
          headshot: hitPoint.y > center.y + 0.38
        };
      }
    }
  }

  if (boss?.active && !boss.dying) {
    const center = boss.group.position.clone().add(new THREE.Vector3(0, 2.25, 0));
    const sphere = new THREE.Sphere(center, 2.3);
    const hitPoint = raycaster.ray.intersectSphere(sphere, point.clone());
    if (hitPoint) {
      const distance = hitPoint.distanceTo(ray.origin);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPoint = hitPoint;
        result = {
          point: closestPoint,
          enemy: null,
          boss,
          headshot: hitPoint.y > center.y + 1.05
        };
      }
    }
  }

  result.point = closestPoint;
  return result;
}

function createTerminals() {
  for (const terminal of terminals) dynamicRoot.remove(terminal.group);
  terminals.length = 0;
  const definitions = [
    { id: "A", x: -33, z: 16 },
    { id: "B", x: 22, z: 2 },
    { id: "C", x: -12, z: -21 }
  ];
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const group = new THREE.Group();
    group.position.set(definition.x, 0, definition.z);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 2.0, 0.32, 8),
      createMetalMaterial(0x152124, COLORS.amber, { roughness: 0.42 })
    );
    base.position.y = 0.16;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const lowerRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.05, 6, 48),
      createEmissiveMaterial(COLORS.amber, 3.5)
    );
    lowerRing.rotation.x = Math.PI / 2;
    lowerRing.position.y = 0.34;
    group.add(lowerRing);

    const hologramMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.amber,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.73, 1.1, 3.6, 12, 1, true), hologramMaterial);
    column.position.y = 2.15;
    group.add(column);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34, 0),
      createEmissiveMaterial(COLORS.amber, 5)
    );
    core.position.y = 2.2;
    group.add(core);

    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.022, 5, 42),
      createEmissiveMaterial(COLORS.amber, 3)
    );
    ringA.position.y = 1.2;
    ringA.rotation.x = Math.PI / 2;
    group.add(ringA);
    const ringB = ringA.clone();
    ringB.position.y = 3.1;
    ringB.scale.setScalar(0.76);
    group.add(ringB);

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.amber,
      transparent: true,
      opacity: 0.065,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.5, 16, 12, 1, true), beamMaterial);
    beam.position.y = 8.35;
    group.add(beam);

    const light = new THREE.PointLight(COLORS.amber, 16, 15, 2);
    light.position.y = 2.2;
    group.add(light);

    dynamicRoot.add(group);
    terminals.push({
      id: definition.id,
      index,
      group,
      position: new THREE.Vector3(definition.x, 0, definition.z),
      core,
      ringA,
      ringB,
      column,
      lowerRing,
      beam,
      light,
      activated: false,
      activationFlash: 0
    });
  }
  createMissionPips();
}

function createMissionPips() {
  dom.pips.innerHTML = "";
  for (let index = 0; index < mission.totalUplinks; index += 1) {
    const pip = document.createElement("i");
    pip.classList.toggle("done", index < mission.uplinksDone);
    dom.pips.appendChild(pip);
  }
}

function updateTerminals(dt, now) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const terminal of terminals) {
    terminal.core.rotation.y += dt * 0.85;
    terminal.core.rotation.x += dt * 0.35;
    terminal.ringA.rotation.z += dt * 0.5;
    terminal.ringB.rotation.z -= dt * 0.62;
    terminal.lowerRing.rotation.z += dt * 0.2;
    const pulse = 1 + Math.sin(now * 0.004 + terminal.index * 1.4) * 0.06;
    terminal.core.scale.setScalar(pulse);
    terminal.light.intensity = terminal.activated ? 2 : 14 + Math.sin(now * 0.006 + terminal.index) * 3;
    terminal.activationFlash = Math.max(0, terminal.activationFlash - dt);
    terminal.core.material.opacity = 1;

    if (!terminal.activated) {
      const distance = Math.hypot(
        player.position.x - terminal.position.x,
        player.position.z - terminal.position.z
      );
      if (distance < 3.1 && distance < nearestDistance) {
        nearest = terminal;
        nearestDistance = distance;
      }
    }
  }
  app.interactionTarget = nearest;
  if (nearest && input.interact) {
    app.interactionProgress = Math.min(1, app.interactionProgress + dt / 1.45);
    if (audio) audio.terminalHum(app.interactionProgress);
    if (app.interactionProgress >= 1) activateTerminal(nearest);
  } else {
    app.interactionProgress = Math.max(0, app.interactionProgress - dt * 2.8);
  }
}

function activateTerminal(terminal) {
  if (!terminal || terminal.activated) return;
  terminal.activated = true;
  terminal.activationFlash = 1.6;
  terminal.core.material.color.setHex(COLORS.teal);
  terminal.lowerRing.material.color.setHex(COLORS.teal);
  terminal.ringA.material.color.setHex(COLORS.teal);
  terminal.ringB.material.color.setHex(COLORS.teal);
  terminal.column.material.color.setHex(COLORS.teal);
  terminal.beam.material.color.setHex(COLORS.teal);
  terminal.light.color.setHex(COLORS.teal);
  terminal.beam.material.opacity = 0.025;
  terminal.group.scale.setScalar(1.12);
  app.interactionProgress = 0;
  app.cameraShake = 0.16;
  advanceMission(mission, "uplink");
  createMissionPips();
  audio?.terminalComplete();
  spawnBurst(terminal.position.clone().add(new THREE.Vector3(0, 2.1, 0)), COLORS.teal, 30, 5.5);
  showToast(`上行链路 ${terminal.id} 已接入 // ${mission.uplinksDone}/${mission.totalUplinks}`, 2200);
  spawnTerminalWave(terminal.index);

  if (mission.phase === MISSION_PHASE.BOSS) {
    app.bossUnlockAt = app.elapsed + 2.2;
    bossUnlockTimer = app.bossUnlockAt;
    showToast("全部链路断开。警告：大型断界机兵正在解冻。", 3200);
  }
}

function spawnTerminalWave(terminalIndex) {
  const wavePoints = [
    [
      [-45, -3],
      [42, -12],
      [-2, -17]
    ],
    [
      [46, 19],
      [-20, -16],
      [10, -27]
    ],
    [
      [-31, 16],
      [34, 3],
      [0, -34]
    ]
  ][terminalIndex];
  for (let index = 0; index < wavePoints.length; index += 1) {
    const [x, z] = wavePoints[index];
    createEnemy(index === 2 ? "bulwark" : index === 1 ? "gull" : "hound", x, z, true);
  }
}

const enemyDefinitions = {
  hound: {
    health: 72,
    speed: 4.65,
    detect: 23,
    attackRange: 2.15,
    attackDelay: 1.15,
    damage: 13,
    color: 0xd25a46,
    scale: 0.92
  },
  gull: {
    health: 58,
    speed: 3.35,
    detect: 30,
    attackRange: 25,
    attackDelay: 1.62,
    damage: 11,
    color: 0xff9944,
    scale: 1
  },
  bulwark: {
    health: 148,
    speed: 2.45,
    detect: 27,
    attackRange: 23,
    attackDelay: 2.25,
    damage: 16,
    color: 0xd63d55,
    scale: 1.22
  }
};

function createEnemy(type, x, z, alerted = false) {
  const definition = enemyDefinitions[type] || enemyDefinitions.hound;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(definition.scale);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f2729,
    metalness: 0.68,
    roughness: 0.4,
    emissive: 0x020303,
    emissiveIntensity: 0.12
  });
  const plateMaterial = new THREE.MeshStandardMaterial({
    color: type === "bulwark" ? 0x3a2528 : 0x2b3030,
    metalness: 0.52,
    roughness: 0.48
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: definition.color,
    toneMapped: false
  });

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(type === "bulwark" ? 0.92 : 0.68, 0.72, 0.44),
    bodyMaterial
  );
  torso.position.y = 1.25;
  torso.castShadow = true;
  group.add(torso);

  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(type === "bulwark" ? 0.76 : 0.5, 0.32, 0.48),
    plateMaterial
  );
  chest.position.set(0, 1.38, -0.04);
  chest.castShadow = true;
  group.add(chest);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), bodyMaterial);
  head.position.y = 1.85;
  head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.07, 0.035), coreMaterial);
  visor.position.set(0, 1.87, -0.19);
  group.add(visor);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  for (const [leg, side] of [
    [leftLeg, -1],
    [rightLeg, 1]
  ]) {
    leg.position.set(side * 0.19, 0.78, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.66, 0.2), bodyMaterial);
    mesh.position.y = -0.34;
    mesh.castShadow = true;
    leg.add(mesh);
    group.add(leg);
  }

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.44, 1.48, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.18), plateMaterial);
  arm.position.y = -0.28;
  leftArm.add(arm);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.44, 1.48, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.18), plateMaterial);
  rightArmMesh.position.y = -0.28;
  rightArm.add(rightArmMesh);
  group.add(rightArm);

  let gunTip = null;
  let weaponMesh = null;
  if (type === "gull" || type === "bulwark") {
    weaponMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.17, type === "bulwark" ? 1.1 : 0.82),
      createMetalMaterial(0x515b5c, definition.color)
    );
    weaponMesh.position.set(0, -0.58, -0.42);
    rightArm.add(weaponMesh);
    gunTip = new THREE.Object3D();
    gunTip.position.set(0, -0.58, type === "bulwark" ? -1.02 : -0.89);
    rightArm.add(gunTip);
  } else {
    weaponMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.86, 0.095),
      createEmissiveMaterial(definition.color, 2.8)
    );
    weaponMesh.position.set(0, -0.72, -0.22);
    weaponMesh.rotation.x = -0.18;
    rightArm.add(weaponMesh);
  }

  const floorRing = new THREE.Mesh(
    new THREE.RingGeometry(0.56, 0.7, 24),
    new THREE.MeshBasicMaterial({
      color: definition.color,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.y = 0.026;
  group.add(floorRing);

  const alertMark = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.09, 0),
    createEmissiveMaterial(definition.color, 4)
  );
  alertMark.position.y = 2.3;
  group.add(alertMark);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  dynamicRoot.add(group);

  const enemy = {
    id: `enemy-${Math.random().toString(36).slice(2)}`,
    type,
    definition,
    group,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    coreMaterial,
    bodyMaterial,
    plateMaterial,
    weaponMesh,
    gunTip,
    floorRing,
    alertMark,
    home: new THREE.Vector2(x, z),
    health: definition.health,
    maxHealth: definition.health,
    dead: false,
    deathTimer: 0,
    state: alerted ? "chase" : "patrol",
    attackCooldown: randomRange(0.2, 1.2),
    attackTwitch: 0,
    hitFlash: 0,
    patrolAngle: Math.random() * TAU,
    strafeDirection: Math.random() > 0.5 ? 1 : -1,
    alertedAt: alerted ? performance.now() : 0
  };
  enemies.push(enemy);
  return enemy;
}

function spawnInitialEnemies() {
  const points = [
    ["hound", -28, 7],
    ["gull", -17, 14],
    ["hound", 32, 12],
    ["gull", 17, 23],
    ["hound", 7, -2],
    ["gull", -5, 28],
    ["bulwark", -26, -13],
    ["hound", 27, -20],
    ["gull", 9, -28],
    ["hound", -5, -34]
  ];
  for (const [type, x, z] of points) createEnemy(type, x, z, false);
}

function resolveEnemyCollisions(position, radius) {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const collider of obstacleColliders) {
      const result = resolveCircleRect(
        { x: position.x, z: position.z, radius },
        collider
      );
      if (result.collided) {
        position.x = result.x;
        position.z = result.z;
      }
    }
  }
  position.x = clamp(position.x, WORLD_LIMIT.minX + radius, WORLD_LIMIT.maxX - radius);
  position.z = clamp(position.z, WORLD_LIMIT.minZ + radius, WORLD_LIMIT.maxZ - radius);
}

function alertEnemies(x, z, radius) {
  for (const enemy of enemies) {
    if (enemy.dead || enemy.state === "chase") continue;
    if (Math.hypot(enemy.group.position.x - x, enemy.group.position.z - z) <= radius) {
      enemy.state = "chase";
      enemy.alertedAt = performance.now();
      enemy.alertMark.visible = true;
    }
  }
}

function updateEnemies(dt, now) {
  for (let index = enemies.length - 1; index >= 0; index -= 1) {
    const enemy = enemies[index];
    if (enemy.dead) {
      enemy.deathTimer -= dt;
      enemy.group.rotation.z = damp(enemy.group.rotation.z, 1.42, 5, dt);
      enemy.group.position.y = damp(enemy.group.position.y, -0.5, 4, dt);
      if (enemy.deathTimer <= 0) {
        dynamicRoot.remove(enemy.group);
        enemies.splice(index, 1);
      }
      continue;
    }

    const position = enemy.group.position;
    const dx = player.position.x - position.x;
    const dz = player.position.z - position.z;
    const distance = Math.hypot(dx, dz) || 1;
    const directionX = dx / distance;
    const directionZ = dz / distance;
    const movementSpeed =
      enemy.definition.speed * (enemy.slowUntil > now ? 0.52 : 1);
    const targetYaw = Math.atan2(-directionX, -directionZ);
    enemy.group.rotation.y = lerpAngle(
      enemy.group.rotation.y,
      targetYaw,
      1 - Math.exp(-7 * dt)
    );

    enemy.attackCooldown -= dt;
    enemy.attackTwitch = Math.max(0, enemy.attackTwitch - dt);
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    const flash = enemy.hitFlash > 0 ? 4.8 : 0.12;
    enemy.bodyMaterial.emissive.setHex(enemy.hitFlash > 0 ? COLORS.danger : 0x020303);
    enemy.bodyMaterial.emissiveIntensity = flash;
    enemy.coreMaterial.color.setHex(enemy.hitFlash > 0 ? 0xffffff : enemy.definition.color);

    if (enemy.state === "patrol") {
      if (distance < enemy.definition.detect || now - enemy.alertedAt < 700) {
        enemy.state = "chase";
        enemy.alertMark.visible = true;
        audio?.enemyAlert(position);
      } else {
        enemy.patrolAngle += dt * 0.36;
        const homeDistance = Math.hypot(position.x - enemy.home.x, position.z - enemy.home.y);
        const targetX =
          enemy.home.x + Math.cos(enemy.patrolAngle + enemy.id.length) * (2.5 + homeDistance * 0.2);
        const targetZ =
          enemy.home.y + Math.sin(enemy.patrolAngle * 1.2 + enemy.id.length) * (2.5 + homeDistance * 0.2);
        const patrolDx = targetX - position.x;
        const patrolDz = targetZ - position.z;
        const patrolLength = Math.hypot(patrolDx, patrolDz) || 1;
        position.x += (patrolDx / patrolLength) * movementSpeed * 0.24 * dt;
        position.z += (patrolDz / patrolLength) * movementSpeed * 0.24 * dt;
        resolveEnemyCollisions(position, 0.58);
      }
    } else {
      enemy.alertMark.visible = true;
      if (enemy.type === "hound") {
        if (distance > enemy.definition.attackRange * 0.82) {
          position.x += directionX * movementSpeed * dt;
          position.z += directionZ * movementSpeed * dt;
        }
        if (distance < enemy.definition.attackRange && enemy.attackCooldown <= 0) {
          enemy.attackCooldown = enemy.definition.attackDelay;
          enemy.attackTwitch = 0.28;
          damagePlayer(enemy.definition.damage, position);
          audio?.enemyMelee(position);
        }
      } else {
        let moveX = 0;
        let moveZ = 0;
        if (distance > 15) {
          moveX += directionX;
          moveZ += directionZ;
        } else if (distance < 7.5) {
          moveX -= directionX;
          moveZ -= directionZ;
        } else {
          moveX += -directionZ * enemy.strafeDirection * 0.7;
          moveZ += directionX * enemy.strafeDirection * 0.7;
        }
        position.x += moveX * movementSpeed * dt;
        position.z += moveZ * movementSpeed * dt;
        if (distance < enemy.definition.attackRange && enemy.attackCooldown <= 0) {
          enemy.attackCooldown = enemy.definition.attackDelay;
          enemy.attackTwitch = 0.2;
          fireEnemyProjectile(enemy);
        }
        if (Math.random() < dt * 0.22) enemy.strafeDirection *= -1;
      }
      resolveEnemyCollisions(position, 0.58);
    }

    const walk = Math.sin(now * 0.009 + enemy.id.length * 2.3) * 0.38;
    enemy.leftLeg.rotation.x = damp(
      enemy.leftLeg.rotation.x,
      enemy.state === "chase" ? walk : walk * 0.36,
      8,
      dt
    );
    enemy.rightLeg.rotation.x = damp(
      enemy.rightLeg.rotation.x,
      enemy.state === "chase" ? -walk : -walk * 0.36,
      8,
      dt
    );
    enemy.rightArm.rotation.x = damp(
      enemy.rightArm.rotation.x,
      enemy.attackTwitch > 0 ? -1.2 : enemy.type === "hound" ? -0.25 : -0.82,
      12,
      dt
    );
    enemy.alertMark.rotation.y += dt * 2.3;
    enemy.alertMark.position.y = 2.28 + Math.sin(now * 0.006 + enemy.id.length) * 0.08;
    enemy.floorRing.material.opacity = 0.2 + Math.sin(now * 0.006) * 0.08;
    enemy.floorRing.rotation.z += dt * 0.48;
  }
}

function fireEnemyProjectile(enemy) {
  if (!enemy.gunTip) return;
  const origin = enemy.gunTip.getWorldPosition(new THREE.Vector3());
  const target = player.position.clone().add(new THREE.Vector3(0, 1.05, 0));
  target.x += player.velocity.x * 0.08;
  target.z += player.velocity.z * 0.08;
  const direction = target.sub(origin).normalize();
  const spread = enemy.type === "bulwark" ? 0.035 : 0.018;
  direction.x += randomRange(-spread, spread);
  direction.y += randomRange(-spread * 0.5, spread * 0.5);
  direction.z += randomRange(-spread, spread);
  direction.normalize();
  const speed = enemy.type === "bulwark" ? 24 : 29;
  spawnProjectile({
    owner: "enemy",
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: direction.x * speed,
    vy: direction.y * speed,
    vz: direction.z * speed,
    speed,
    damage: enemy.definition.damage,
    radius: enemy.type === "bulwark" ? 0.18 : 0.13,
    color: enemy.definition.color,
    sourceEnemyId: enemy.id
  });
  audio?.enemyShoot(origin, enemy.type === "bulwark");
}

function hitEnemy(enemy, damage, headshot, melee, magicElement = null) {
  if (!enemy || enemy.dead) return;
  const finalDamage = Math.round(damage * (headshot ? 1.45 : 1));
  enemy.health -= finalDamage;
  enemy.hitFlash = 0.12;
  enemy.state = "chase";
  enemy.alertedAt = performance.now();
  alertEnemies(enemy.group.position.x, enemy.group.position.z, 10);
  showHitMarker(false);
  audio?.hit(headshot);
  const hitPulse = hitCombatFeedback({ enemy: true, headshot });
  pulseCombatFeedback(hitPulse);
  const hitPosition = enemy.group.position.clone().add(new THREE.Vector3(0, headshot ? 1.75 : 1.12, 0));
  const impactColor =
    magicElement
      ? magicElementProfile(magicElement).hotColor
      : headshot
        ? COLORS.amberHot
        : COLORS.danger;
  spawnImpact(hitPosition, impactColor, headshot ? 12 : 7);
  if (enemy.health <= 0) killEnemy(enemy, melee);
}

function killEnemy(enemy, melee = false) {
  if (enemy.dead) return;
  enemy.dead = true;
  enemy.deathTimer = 1.25;
  enemy.health = 0;
  app.kills += 1;
  app.cameraShake = Math.max(app.cameraShake, melee ? 0.16 : 0.08);
  showHitMarker(true);
  pulseCombatFeedback(hitCombatFeedback({ enemy: true, kill: true }));
  spawnBurst(
    enemy.group.position.clone().add(new THREE.Vector3(0, 1.05, 0)),
    enemy.definition.color,
    melee ? 34 : 23,
    melee ? 7 : 5
  );
  audio?.enemyDeath(enemy.group.position);
  if (Math.random() < 0.16) {
    player.health = Math.min(player.maxHealth, player.health + 10);
    showToast("拾取战场修复纳米单元 +10", 1100);
  }
}

function spawnProjectile(options) {
  const material = new THREE.MeshBasicMaterial({
    color: options.color,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(options.radius, 8, 6), material);
  mesh.position.set(options.x, options.y, options.z);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(options.radius * 2.8, 8, 6),
    new THREE.MeshBasicMaterial({
      color: options.color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  mesh.add(glow);
  dynamicRoot.add(mesh);
  const projectile = {
    ...options,
    mesh,
    life: options.life ?? 4.5,
    reflected: false,
    owner: options.owner
  };
  projectiles.push(projectile);
  return projectile;
}

function updateProjectiles(dt) {
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index];
    projectile.life -= dt;
    const previous = {
      x: projectile.x,
      z: projectile.z,
      y: projectile.y
    };
    projectile.x += projectile.vx * dt;
    projectile.y += (projectile.vy || 0) * dt;
    projectile.z += projectile.vz * dt;
    projectile.mesh.position.set(projectile.x, projectile.y, projectile.z);

    let remove = projectile.life <= 0;
    let directTargetId = null;
    if (
      projectile.x < WORLD_LIMIT.minX ||
      projectile.x > WORLD_LIMIT.maxX ||
      projectile.z < WORLD_LIMIT.minZ ||
      projectile.z > WORLD_LIMIT.maxZ ||
      projectile.y < 0 ||
      projectile.y > 18
    ) {
      remove = true;
    }

    if (!remove) {
      for (const collider of obstacleColliders) {
        if (
          projectile.y < collider.maxY &&
          projectile.x > collider.minX - projectile.radius &&
          projectile.x < collider.maxX + projectile.radius &&
          projectile.z > collider.minZ - projectile.radius &&
          projectile.z < collider.maxZ + projectile.radius
        ) {
          remove = true;
          break;
        }
      }
    }

    if (!remove && projectile.owner === "enemy") {
      if (sweptPointDistance(previous, projectile, player.position, 0.82)) {
        const perfectParry =
          weapon.mode === WEAPON_MODE.BLADE &&
          input.block &&
          parryWindowOpen(performance.now(), app.blockStartedAt, 0.22);
        if (perfectParry) {
          const reflected = reflectProjectile(projectile, player.position);
          Object.assign(projectile, reflected);
          projectile.y = Math.max(1.05, projectile.y);
          projectile.vy = -0.08;
          projectile.mesh.material.color.setHex(COLORS.amberHot);
          projectile.mesh.children[0].material.color.setHex(COLORS.amberHot);
          app.parries += 1;
          app.cameraShake = Math.max(app.cameraShake, 0.13);
          showParryCallout();
          spawnBurst(projectile.mesh.position.clone(), COLORS.amberHot, 18, 4.6);
          audio?.parry();
        } else {
          const blocked = weapon.mode === WEAPON_MODE.BLADE && input.block;
          damagePlayer(projectile.damage * (blocked ? 0.34 : 1), projectile.mesh.position);
          remove = true;
        }
      }
    } else if (!remove && projectile.owner === "player") {
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        if (
          sweptPointDistance(
            previous,
            projectile,
            enemy.group.position,
            enemy.type === "bulwark" ? 1.0 : 0.72
          )
        ) {
          hitEnemy(enemy, projectile.damage, false, true);
          directTargetId = enemy.id;
          if (projectile.kind === "magic") {
            detonateMagicProjectile(
              projectile,
              enemy.group.position.clone().add(new THREE.Vector3(0, 1.05, 0)),
              directTargetId
            );
          }
          remove = true;
          break;
        }
      }
      if (
        !remove &&
        boss?.active &&
        !boss.dying &&
        sweptPointDistance(previous, projectile, boss.group.position, 2.05)
      ) {
        damageBoss(projectile.damage, true);
        directTargetId = "boss";
        if (projectile.kind === "magic") {
          detonateMagicProjectile(projectile, boss.group.position.clone(), directTargetId);
        }
        remove = true;
      }
    }

    if (remove) {
      if (projectile.kind === "magic" && !projectile.detonated) {
        detonateMagicProjectile(projectile, projectile.mesh.position.clone(), directTargetId);
      }
      if (projectile.owner === "enemy") spawnImpact(projectile.mesh.position.clone(), projectile.color, 4);
      dynamicRoot.remove(projectile.mesh);
      disposeObject3D(projectile.mesh);
      projectiles.splice(index, 1);
    }
  }
}

function disposeObject3D(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  });
}

function sweptPointDistance(previous, current, target, radius) {
  const ax = previous.x;
  const az = previous.z;
  const bx = current.x;
  const bz = current.z;
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSquared = abx * abx + abz * abz || 1;
  const t = clamp(((target.x - ax) * abx + (target.z - az) * abz) / lengthSquared, 0, 1);
  const closestX = ax + abx * t;
  const closestZ = az + abz * t;
  return Math.hypot(target.x - closestX, target.z - closestZ) <= radius;
}

function damagePlayer(amount, sourcePosition) {
  if (!app.running || player.invulnerable > 0) return;
  player.health = Math.max(0, player.health - amount);
  player.invulnerable = 0.18;
  app.lastDamageAt = app.elapsed;
  app.cameraShake = Math.max(app.cameraShake, 0.18);
  app.flash = 0.75;
  dom.damageIndicator.classList.remove("on");
  void dom.damageIndicator.offsetWidth;
  dom.damageIndicator.classList.add("on");
  audio?.damage(sourcePosition);
  if (player.health <= 0) finishGame(false);
}

function createBoss() {
  if (boss?.group) dynamicRoot.remove(boss.group);
  const group = new THREE.Group();
  group.position.set(0, 0, -42);
  group.visible = false;

  const armor = createMetalMaterial(0x252a2b, COLORS.danger, {
    metalness: 0.86,
    roughness: 0.3
  });
  const darkArmor = createMetalMaterial(0x101719, COLORS.danger, {
    metalness: 0.72,
    roughness: 0.42
  });
  const coreMaterial = new THREE.MeshBasicMaterial({ color: COLORS.danger, toneMapped: false });
  const bladeMaterial = createEmissiveMaterial(COLORS.danger, 4.8, true, 0.9);

  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.35, 0.75, 8), darkArmor);
  pelvis.position.y = 1.4;
  pelvis.castShadow = true;
  group.add(pelvis);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.55, 2.15, 1.34), armor);
  torso.position.y = 2.85;
  torso.castShadow = true;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), coreMaterial);
  chest.position.set(0, 3.05, -0.78);
  group.add(chest);
  const coreLight = new THREE.PointLight(COLORS.danger, 18, 13, 2);
  coreLight.position.set(0, 3.05, -1.1);
  group.add(coreLight);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.64, 0.72), darkArmor);
  head.position.y = 4.25;
  head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.11, 0.06), coreMaterial);
  visor.position.set(0, 4.29, -0.39);
  group.add(visor);

  const leftShoulder = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.15), armor);
  leftShoulder.position.set(-1.75, 3.6, 0);
  leftShoulder.castShadow = true;
  group.add(leftShoulder);
  const rightShoulder = leftShoulder.clone();
  rightShoulder.position.x = 1.75;
  group.add(rightShoulder);

  const leftArm = new THREE.Group();
  leftArm.position.set(-1.82, 3.35, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.85, 0.72), armor);
  leftArmMesh.position.y = -0.95;
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(1.82, 3.35, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.8, 0.78), armor);
  rightArmMesh.position.y = -0.9;
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.48, 1.7, 8), darkArmor);
  cannon.rotation.x = Math.PI / 2;
  cannon.position.set(0, -1.52, -0.65);
  rightArm.add(cannon);
  const cannonCore = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10), coreMaterial);
  cannonCore.rotation.x = Math.PI / 2;
  cannonCore.position.set(0, -1.52, -1.52);
  rightArm.add(cannonCore);
  group.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.7, 1.18, 0);
  const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.55, 0.8), armor);
  legMesh.position.y = -0.72;
  legMesh.castShadow = true;
  leftLeg.add(legMesh);
  group.add(leftLeg);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.7;
  group.add(rightLeg);

  const sword = new THREE.Group();
  sword.position.set(-1.85, 2.05, -0.25);
  sword.rotation.z = 0.25;
  const swordBlade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 3.7, 0.1), bladeMaterial);
  swordBlade.position.y = -1.6;
  sword.add(swordBlade);
  group.add(sword);

  const targetBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 1.4, 18, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: COLORS.danger,
      transparent: true,
      opacity: 0.025,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  targetBeam.position.y = 9;
  group.add(targetBeam);

  for (const child of group.children) {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  }
  dynamicRoot.add(group);
  boss = {
    group,
    armor,
    torso,
    head,
    chest,
    coreLight,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    sword,
    targetBeam,
    health: 1100,
    maxHealth: 1100,
    phase: 1,
    active: false,
    dying: false,
    deathTimer: 0,
    attackCooldown: 2.4,
    attackIndex: 0,
    hitFlash: 0,
    chargeTime: 0,
    moveAngle: 0,
    activatedAt: 0
  };
}

function activateBoss() {
  if (!boss || boss.active) return;
  boss.group.visible = true;
  boss.active = true;
  boss.activatedAt = app.elapsed;
  boss.attackCooldown = 2.6;
  app.cameraShake = 0.34;
  spawnBurst(boss.group.position.clone().add(new THREE.Vector3(0, 2.8, 0)), COLORS.danger, 54, 8);
  audio?.bossRoar();
  showToast("NOCTIS // 断界机兵：解除限制", 2600);
}

function updateBoss(dt, now) {
  if (!boss || !boss.active) return;
  const position = boss.group.position;
  const dx = player.position.x - position.x;
  const dz = player.position.z - position.z;
  const distance = Math.hypot(dx, dz) || 1;
  const directionX = dx / distance;
  const directionZ = dz / distance;
  const targetYaw = Math.atan2(-directionX, -directionZ);
  boss.group.rotation.y = lerpAngle(
    boss.group.rotation.y,
    targetYaw,
    1 - Math.exp(-3.8 * dt)
  );
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  boss.armor.emissive.setHex(boss.hitFlash > 0 ? COLORS.danger : 0x020303);
  boss.armor.emissiveIntensity = boss.hitFlash > 0 ? 2.8 : 0.16;
  boss.chest.rotation.y += dt * 1.3;
  boss.chest.rotation.x += dt * 0.65;
  boss.coreLight.intensity = 15 + Math.sin(now * 0.008) * 4 + (boss.phase === 2 ? 8 : 0);
  boss.targetBeam.rotation.y -= dt * 0.2;

  if (boss.dying) {
    boss.deathTimer -= dt;
    boss.group.rotation.z = damp(boss.group.rotation.z, 0.42, 1.8, dt);
    boss.group.position.y = damp(boss.group.position.y, -1.1, 1.2, dt);
    if (Math.random() < dt * 9) {
      spawnBurst(
        boss.group.position.clone().add(new THREE.Vector3(randomRange(-1.8, 1.8), randomRange(0.5, 4), randomRange(-0.7, 0.7))),
        Math.random() > 0.5 ? COLORS.amber : COLORS.danger,
        12,
        5
      );
    }
    if (boss.deathTimer <= 0) {
      boss.group.visible = false;
      boss.active = false;
      completeMission();
    }
    return;
  }

  const healthRatio = boss.health / boss.maxHealth;
  if (healthRatio <= 0.48 && boss.phase === 1) {
    boss.phase = 2;
    boss.attackCooldown = 1.3;
    boss.targetBeam.material.color.setHex(COLORS.amber);
    app.cameraShake = 0.34;
    spawnShockwave(position.clone(), 1, 15, COLORS.amber, 1.3);
    showToast("NOCTIS 进入第二阶段 // 近界斩击模块激活", 2600);
    audio?.bossPhase();
  }

  const moveSpeed = boss.phase === 2 ? 2.35 : 1.55;
  if (distance > 10) {
    position.x += directionX * moveSpeed * dt;
    position.z += directionZ * moveSpeed * dt;
  } else {
    boss.moveAngle += dt * (boss.phase === 2 ? 0.85 : 0.48);
    position.x += Math.cos(boss.moveAngle) * moveSpeed * 0.48 * dt;
    position.z += Math.sin(boss.moveAngle) * moveSpeed * 0.38 * dt;
  }
  position.x = clamp(position.x, -15, 15);
  position.z = clamp(position.z, -44, -29);

  if (distance < 2.8 && boss.attackCooldown < 0.9) {
    damagePlayer(18, position);
  }

  boss.attackCooldown -= dt;
  if (boss.attackCooldown <= 0) {
    if (boss.phase === 1) {
      boss.attackCooldown = Math.max(1.25, 2.25 - boss.attackIndex * 0.05);
      boss.attackIndex += 1;
      bossBurstAttack();
    } else {
      boss.attackCooldown = 1.25;
      boss.attackIndex += 1;
      const pattern = boss.attackIndex % 4;
      if (pattern === 0) bossRadialAttack();
      else if (pattern === 1) bossBurstAttack(true);
      else if (pattern === 2) {
        spawnShockwave(position.clone(), 1.2, 14, COLORS.danger, 1.05);
        audio?.bossSlam();
      } else {
        bossBurstAttack(true);
        bossRadialAttack(6, 0.42);
      }
    }
    boss.rightArm.rotation.x = -0.8;
  }

  boss.rightArm.rotation.x = damp(boss.rightArm.rotation.x, -0.3, 7, dt);
  boss.leftArm.rotation.z = Math.sin(now * 0.003) * 0.05;
  boss.leftLeg.rotation.x = Math.sin(now * 0.0033) * 0.06;
  boss.rightLeg.rotation.x = -boss.leftLeg.rotation.x;
}

function getBossCorePosition() {
  return boss.group.position.clone().add(new THREE.Vector3(0, 3.03, -0.82));
}

function bossBurstAttack(phaseTwo = false) {
  if (!boss?.active || boss.dying) return;
  const origin = getBossCorePosition();
  const target = player.position.clone().add(new THREE.Vector3(0, 1.05, 0)).sub(origin).normalize();
  const count = phaseTwo ? 5 : 3;
  const speed = phaseTwo ? 25 : 22;
  for (let index = 0; index < count; index += 1) {
    const spread = (index - (count - 1) / 2) * (phaseTwo ? 0.07 : 0.055);
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const vx = (target.x * cos - target.z * sin) * speed;
    const vz = (target.x * sin + target.z * cos) * speed;
    spawnProjectile({
      owner: "enemy",
      x: origin.x,
      y: origin.y,
      z: origin.z,
      vx,
      vy: target.y * speed,
      vz,
      speed,
      damage: boss.phase === 2 ? 15 : 12,
      radius: boss.phase === 2 ? 0.17 : 0.15,
      color: boss.phase === 2 ? COLORS.amber : COLORS.danger
    });
  }
  spawnImpact(origin, boss.phase === 2 ? COLORS.amber : COLORS.danger, 12);
  audio?.bossShot(origin);
}

function bossRadialAttack(count = 12, speedScale = 1) {
  if (!boss?.active || boss.dying) return;
  const origin = getBossCorePosition();
  const offset = Math.random() * TAU;
  for (let index = 0; index < count; index += 1) {
    const angle = offset + (index / count) * TAU;
    const speed = 15 * speedScale;
    spawnProjectile({
      owner: "enemy",
      x: origin.x,
      y: 1.2,
      z: origin.z,
      vx: Math.cos(angle) * speed,
      vy: 0,
      vz: Math.sin(angle) * speed,
      speed,
      damage: 11,
      radius: 0.15,
      color: COLORS.danger
    });
  }
  audio?.bossShot(origin);
}

function damageBoss(damage, melee = false, headshot = false) {
  if (!boss?.active || boss.dying) return;
  const finalDamage = Math.round(damage * (headshot ? 1.35 : 1));
  boss.health = Math.max(0, boss.health - finalDamage);
  boss.hitFlash = 0.12;
  app.cameraShake = Math.max(app.cameraShake, melee ? 0.18 : 0.06);
  showHitMarker(false);
  audio?.hit(headshot);
  spawnImpact(
    boss.group.position.clone().add(new THREE.Vector3(randomRange(-1.2, 1.2), randomRange(1.8, 3.7), -0.9)),
    boss.phase === 2 ? COLORS.amber : COLORS.danger,
    melee ? 18 : 8
  );
  if (boss.health <= 0) {
    boss.dying = true;
    boss.deathTimer = 2.4;
    boss.attackCooldown = Infinity;
    app.cameraShake = 0.5;
    app.kills += 1;
    showHitMarker(true);
    showToast("NOCTIS 核心崩解 // 区域链路正在关闭", 2800);
    audio?.bossDeath();
    for (const projectile of projectiles) {
      if (projectile.owner === "enemy") projectile.life = Math.min(projectile.life, 0.3);
    }
  }
}

function spawnShockwave(
  position,
  startRadius,
  maxRadius,
  color,
  duration,
  damagePlayer = true
) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 72),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position);
  ring.position.y = 0.08;
  dynamicRoot.add(ring);
  let hitPlayer = false;
  transientEffects.push({
    object: ring,
    life: duration,
    maxLife: duration,
    update(effect, dt) {
      const progress = 1 - effect.life / effect.maxLife;
      const radius = THREE.MathUtils.lerp(startRadius, maxRadius, progress);
      effect.object.scale.setScalar(radius);
      effect.object.material.opacity = (1 - progress) * 0.92;
      const distance = Math.hypot(
        player.position.x - position.x,
        player.position.z - position.z
      );
      if (
        damagePlayer &&
        !hitPlayer &&
        Math.abs(distance - radius) < 1.05 &&
        player.position.y < 1.1
      ) {
        hitPlayer = true;
        damagePlayer(17, position);
      }
    }
  });
  audio?.shockwave(position);
}

function spawnTracer(start, end, color, life = 0.055) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const line = new THREE.Line(geometry, material);
  dynamicRoot.add(line);
  transientEffects.push({
    object: line,
    life,
    maxLife: life,
    update(effect) {
      effect.object.material.opacity = clamp(effect.life / effect.maxLife, 0, 1) * 0.92;
    }
  });
}

function spawnMuzzleFlash() {
  const flash = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18, 0),
    createEmissiveMaterial(COLORS.amberHot, 5, true, 1)
  );
  flash.position.copy(playerMuzzle.getWorldPosition(new THREE.Vector3()));
  flash.scale.set(1.4, 1.4, 3.5);
  dynamicRoot.add(flash);
  muzzleLight.intensity = 18;
  transientEffects.push({
    object: flash,
    life: 0.04,
    maxLife: 0.04,
    update(effect) {
      effect.object.material.opacity = clamp(effect.life / effect.maxLife, 0, 1);
    }
  });
}

function spawnImpact(position, color, count = 6) {
  spawnBurst(position, color, count, 3.6, 0.45);
}

function spawnBurst(position, color, count = 20, force = 5, life = 0.85) {
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = position.x;
    positions[index * 3 + 1] = position.y;
    positions[index * 3 + 2] = position.z;
    const direction = new THREE.Vector3(
      randomRange(-1, 1),
      randomRange(-0.25, 1),
      randomRange(-1, 1)
    ).normalize();
    direction.multiplyScalar(randomRange(force * 0.25, force));
    velocities.push(direction);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size: 0.09,
    map: particleTexture,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false
  });
  const points = new THREE.Points(geometry, material);
  dynamicRoot.add(points);
  transientEffects.push({
    object: points,
    life,
    maxLife: life,
    update(effect, dt) {
      const attribute = effect.object.geometry.attributes.position;
      for (let index = 0; index < count; index += 1) {
        const velocity = velocities[index];
        velocity.y -= 5.5 * dt;
        attribute.array[index * 3] += velocity.x * dt;
        attribute.array[index * 3 + 1] += velocity.y * dt;
        attribute.array[index * 3 + 2] += velocity.z * dt;
      }
      attribute.needsUpdate = true;
      effect.object.material.opacity = clamp(effect.life / effect.maxLife, 0, 1);
      effect.object.material.size = 0.09 * clamp(effect.life / effect.maxLife, 0.3, 1);
    }
  });
}

function updateTransientEffects(dt) {
  for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
    const effect = transientEffects[index];
    effect.life -= dt;
    effect.update?.(effect, dt);
    if (effect.life <= 0) {
      const parent = effect.object.parent || dynamicRoot;
      parent.remove(effect.object);
      effect.object.geometry?.dispose();
      if (Array.isArray(effect.object.material)) {
        effect.object.material.forEach((material) => material.dispose());
      } else {
        effect.object.material?.dispose();
      }
      transientEffects.splice(index, 1);
    }
  }
}

class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ambientStarted = false;
    this.lastHum = 0;
    this.lastMagicCharge = -Infinity;
  }

  init() {
    if (this.context) {
      this.resume();
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = app.volume;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.24;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer(2);
      this.startAmbient();
    } catch (error) {
      console.warn("Audio initialization failed", error);
    }
  }

  resume() {
    if (this.context?.state === "suspended") this.context.resume();
  }

  setVolume(value) {
    app.volume = value;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.04);
    }
  }

  createNoiseBuffer(seconds) {
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  startAmbient() {
    if (!this.context || this.ambientStarted) return;
    this.ambientStarted = true;
    // The ambience bed is rain only. Original music is never synthesized.
    const rainSource = this.context.createBufferSource();
    rainSource.buffer = this.noiseBuffer;
    rainSource.loop = true;
    const rainFilter = this.context.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 1450;
    rainFilter.Q.value = 0.35;
    const rainGain = this.context.createGain();
    rainGain.gain.value = 0.018;
    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(this.master);
    rainSource.start();
  }

  spatial(position) {
    if (!position) return { pan: 0, volume: 1 };
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const right = new THREE.Vector3().crossVectors(cameraDirection, camera.up).normalize();
    const delta = position.clone().sub(camera.position);
    const distance = delta.length();
    const pan = clamp(delta.normalize().dot(right), -1, 1) * 0.72;
    return {
      pan,
      volume: clamp(1 - distance / 48, 0.08, 1)
    };
  }

  noise({ duration = 0.1, gain = 0.1, frequency = 900, q = 0.7, type = "bandpass", position = null, slideTo = null }) {
    if (!this.context || !this.noiseBuffer || this.context.state !== "running") return;
    const spatial = this.spatial(position);
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = randomRange(0.88, 1.14);
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, this.context.currentTime);
    if (slideTo) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, slideTo),
        this.context.currentTime + duration
      );
    }
    filter.Q.value = q;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, this.context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, gain * spatial.volume),
      this.context.currentTime + 0.008
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    const panner = this.context.createStereoPanner();
    panner.pan.value = spatial.pan;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.master);
    source.start();
    source.stop(this.context.currentTime + duration + 0.02);
  }

  tone({ frequency = 220, endFrequency = null, duration = 0.16, gain = 0.05, type = "sine", position = null }) {
    if (!this.context || this.context.state !== "running") return;
    const spatial = this.spatial(position);
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        this.context.currentTime + duration
      );
    }
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, this.context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, gain * spatial.volume),
      this.context.currentTime + 0.008
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    const panner = this.context.createStereoPanner();
    panner.pan.value = spatial.pan;
    oscillator.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration + 0.02);
  }

  shoot() {
    this.noise({ duration: 0.07, gain: 0.15, frequency: 1900, q: 0.45, slideTo: 320 });
    this.tone({ frequency: 112, endFrequency: 54, duration: 0.09, gain: 0.12, type: "square" });
  }

  enemyShoot(position, heavy = false) {
    this.noise({
      duration: heavy ? 0.15 : 0.09,
      gain: heavy ? 0.11 : 0.065,
      frequency: heavy ? 650 : 1300,
      q: 0.6,
      slideTo: 200,
      position
    });
    this.tone({
      frequency: heavy ? 88 : 155,
      endFrequency: heavy ? 38 : 70,
      duration: heavy ? 0.18 : 0.1,
      gain: heavy ? 0.09 : 0.04,
      type: "sawtooth",
      position
    });
  }

  bladeSwing(variant) {
    this.noise({
      duration: variant === 2 ? 0.19 : 0.14,
      gain: variant === 2 ? 0.11 : 0.075,
      frequency: variant === 2 ? 260 : 620,
      q: 1.2,
      slideTo: variant === 2 ? 2300 : 1700
    });
    this.tone({
      frequency: variant === 2 ? 160 : 260,
      endFrequency: 640,
      duration: 0.11,
      gain: 0.018,
      type: "triangle"
    });
  }

  footstep(step) {
    if (!step) return;
    const intensity = clamp(Number(step.intensity) || 0.4, 0.15, 1.25);
    const frequency = step.crouching
      ? 380
      : step.sprinting
        ? 620
        : 520;
    this.noise({
      duration: step.sprinting ? 0.075 : 0.06,
      gain: 0.018 + intensity * 0.032,
      frequency,
      q: 0.72,
      type: "lowpass",
      slideTo: 180
    });
    this.tone({
      frequency: step.crouching ? 92 : step.sprinting ? 78 : 104,
      endFrequency: 52,
      duration: 0.055,
      gain: 0.01 + intensity * 0.014,
      type: "triangle"
    });
  }

  landing(landing) {
    const force = clamp(Number(landing?.force) || 0.25, 0.25, 1.25);
    this.noise({
      duration: 0.1 + force * 0.07,
      gain: 0.025 + force * 0.045,
      frequency: 280,
      q: 0.58,
      type: "lowpass",
      slideTo: 75
    });
    this.tone({
      frequency: 74 + force * 18,
      endFrequency: 32,
      duration: 0.11 + force * 0.08,
      gain: 0.025 + force * 0.035,
      type: "sine"
    });
  }

  magicSelect(element) {
    const profile = magicElementProfile(element);
    this.tone({
      frequency: 420,
      endFrequency: 760,
      duration: 0.1,
      gain: 0.024,
      type: "triangle"
    });
    this.tone({
      frequency: 780,
      endFrequency: 1120,
      duration: 0.14,
      gain: 0.014,
      type: "sine"
    });
    this.noise({
      duration: 0.08,
      gain: 0.016,
      frequency: 1800 + (profile.color & 0xff) * 3,
      q: 1.6,
      slideTo: 3200
    });
  }

  magicCharge(charge, element) {
    const now = performance.now();
    if (now - this.lastMagicCharge < 90) return;
    this.lastMagicCharge = now;
    const profile = magicElementProfile(element);
    const amount = clamp(Number(charge) || 0, 0, 1);
    this.tone({
      frequency: 210 + amount * 360,
      endFrequency: 250 + amount * 520,
      duration: 0.07,
      gain: 0.008 + amount * 0.018,
      type: element === MAGIC_ELEMENT.LIGHTNING ? "square" : "triangle"
    });
    this.noise({
      duration: 0.055,
      gain: 0.006 + amount * 0.012,
      frequency: 980 + amount * 1700,
      q: 2.2,
      slideTo: 2100 + (profile.color & 0xff) * 2
    });
  }

  magicRelease(element, power, position) {
    const profile = magicElementProfile(element);
    const strength = clamp(Number(power) || 0, 0, 1);
    this.noise({
      duration: 0.16 + strength * 0.1,
      gain: 0.055 + strength * 0.075,
      frequency: 1500 - strength * 600,
      q: 0.7,
      slideTo: 180,
      position
    });
    this.tone({
      frequency: 150 + (profile.color & 0xff) * 0.22,
      endFrequency: 52 + strength * 34,
      duration: 0.24 + strength * 0.12,
      gain: 0.05 + strength * 0.055,
      type: element === MAGIC_ELEMENT.ICE ? "sine" : "sawtooth",
      position
    });
  }

  magicImpact(element, position, power) {
    const strength = clamp(Number(power) || 0, 0, 1);
    this.noise({
      duration: 0.18 + strength * 0.15,
      gain: 0.045 + strength * 0.075,
      frequency: element === MAGIC_ELEMENT.LIGHTNING ? 2800 : 920,
      q: element === MAGIC_ELEMENT.ICE ? 1.8 : 0.58,
      slideTo: element === MAGIC_ELEMENT.WIND ? 220 : 90,
      position
    });
    this.tone({
      frequency: element === MAGIC_ELEMENT.LIGHTNING ? 920 : 118,
      endFrequency: element === MAGIC_ELEMENT.LIGHTNING ? 190 : 38,
      duration: 0.16 + strength * 0.2,
      gain: 0.035 + strength * 0.055,
      type: element === MAGIC_ELEMENT.LIGHTNING ? "square" : "triangle",
      position
    });
  }

  hit(headshot = false) {
    this.noise({ duration: 0.055, gain: headshot ? 0.06 : 0.038, frequency: 2700, q: 1.8 });
    this.tone({
      frequency: headshot ? 980 : 660,
      endFrequency: headshot ? 520 : 380,
      duration: 0.07,
      gain: headshot ? 0.04 : 0.024,
      type: "triangle"
    });
  }

  parry() {
    this.tone({ frequency: 1260, endFrequency: 2320, duration: 0.22, gain: 0.08, type: "sine" });
    this.tone({ frequency: 640, endFrequency: 1480, duration: 0.27, gain: 0.06, type: "triangle" });
    this.noise({ duration: 0.16, gain: 0.08, frequency: 3200, q: 2.2, slideTo: 800 });
  }

  reloadStart() {
    this.noise({ duration: 0.06, gain: 0.035, frequency: 1800, q: 2 });
    window.setTimeout(() => {
      this.tone({ frequency: 340, endFrequency: 190, duration: 0.08, gain: 0.025, type: "square" });
    }, 310);
  }

  swap() {
    this.noise({ duration: 0.07, gain: 0.025, frequency: 2400, q: 2.4 });
    this.tone({ frequency: 440, endFrequency: 880, duration: 0.12, gain: 0.02, type: "triangle" });
  }

  jump() {
    this.noise({ duration: 0.08, gain: 0.018, frequency: 420, q: 0.7, type: "lowpass" });
  }

  damage(position) {
    this.tone({ frequency: 96, endFrequency: 42, duration: 0.24, gain: 0.12, type: "sawtooth", position });
    this.noise({ duration: 0.18, gain: 0.08, frequency: 360, q: 0.5, type: "lowpass", position });
  }

  enemyAlert(position) {
    this.tone({ frequency: 560, endFrequency: 790, duration: 0.12, gain: 0.018, type: "square", position });
  }

  enemyMelee(position) {
    this.noise({ duration: 0.14, gain: 0.06, frequency: 680, q: 0.7, type: "lowpass", position });
  }

  enemyDeath(position) {
    this.noise({ duration: 0.36, gain: 0.1, frequency: 780, q: 0.45, type: "lowpass", slideTo: 90, position });
    this.tone({ frequency: 140, endFrequency: 42, duration: 0.32, gain: 0.06, type: "sawtooth", position });
  }

  terminalHum(progress) {
    const now = performance.now();
    if (now - this.lastHum < 180) return;
    this.lastHum = now;
    this.tone({
      frequency: 190 + progress * 420,
      endFrequency: 210 + progress * 460,
      duration: 0.09,
      gain: 0.012 + progress * 0.018,
      type: "triangle"
    });
  }

  terminalComplete() {
    this.tone({ frequency: 260, endFrequency: 820, duration: 0.38, gain: 0.05, type: "triangle" });
    this.tone({ frequency: 520, endFrequency: 1320, duration: 0.48, gain: 0.035, type: "sine" });
  }

  bossRoar() {
    this.tone({ frequency: 58, endFrequency: 28, duration: 1.2, gain: 0.16, type: "sawtooth" });
    this.noise({ duration: 1.1, gain: 0.16, frequency: 420, q: 0.38, type: "lowpass", slideTo: 80 });
  }

  bossPhase() {
    this.tone({ frequency: 118, endFrequency: 48, duration: 0.6, gain: 0.1, type: "square" });
    this.tone({ frequency: 760, endFrequency: 1260, duration: 0.45, gain: 0.045, type: "triangle" });
  }

  bossShot(position) {
    this.noise({ duration: 0.13, gain: 0.08, frequency: 660, q: 0.45, slideTo: 170, position });
    this.tone({ frequency: 82, endFrequency: 44, duration: 0.18, gain: 0.08, type: "sawtooth", position });
  }

  bossSlam() {
    this.tone({ frequency: 60, endFrequency: 24, duration: 0.7, gain: 0.16, type: "sine" });
    this.noise({ duration: 0.5, gain: 0.12, frequency: 260, q: 0.4, type: "lowpass" });
  }

  shockwave(position) {
    this.noise({ duration: 0.32, gain: 0.075, frequency: 310, q: 0.4, type: "lowpass", slideTo: 90, position });
  }

  bossDeath() {
    this.tone({ frequency: 92, endFrequency: 18, duration: 1.8, gain: 0.2, type: "sawtooth" });
    this.noise({ duration: 1.68, gain: 0.16, frequency: 520, q: 0.33, type: "lowpass", slideTo: 55 });
  }

  victory() {
    this.noise({
      duration: 0.42,
      gain: 0.04,
      frequency: 920,
      slideTo: 280,
      q: 0.5,
      type: "bandpass"
    });
  }

  updateListener() {
    if (!this.context) return;
    const listener = this.context.listener;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    if (listener.positionX) {
      listener.positionX.value = camera.position.x;
      listener.positionY.value = camera.position.y;
      listener.positionZ.value = camera.position.z;
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = camera.up.x;
      listener.upY.value = camera.up.y;
      listener.upZ.value = camera.up.z;
    } else if (listener.setPosition) {
      listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, camera.up.x, camera.up.y, camera.up.z);
    }
  }
}

function rotateCamera(deltaX, deltaY) {
  if (!app.started || app.paused || app.ended) return;
  app.cameraYaw -= deltaX * 0.00225 * app.sensitivity;
  app.cameraPitch -= deltaY * 0.00185 * app.sensitivity;
  app.cameraPitch = clamp(app.cameraPitch, -0.72, 0.55);
  app.cameraYaw %= TAU;
}

function updateCamera(dt, now) {
  if (!app.started) {
    titleOrbit += dt * 0.09;
    const compact = window.innerWidth <= 760;
    const radius = compact ? 7.4 : 5.6;
    const angle = 0.16 + Math.sin(titleOrbit) * 0.11;
    const focus = new THREE.Vector3(
      player.position.x - (compact ? 0.18 : 0.48),
      1.08,
      player.position.z
    );
    camera.position.set(
      player.position.x + Math.sin(angle) * radius,
      2.02 + Math.sin(titleOrbit * 0.72) * 0.08,
      player.position.z - Math.cos(angle) * radius
    );
    camera.lookAt(focus);
    camera.fov = damp(camera.fov, compact ? 50 : 43, 3, dt);
    camera.updateProjectionMatrix();
    return;
  }

  const shakeSample = sampleCombatShake(combatFeedback, app.elapsed);
  const motionRoll = movementFrame?.roll || 0;
  const viewYaw =
    app.cameraYaw +
    combatFeedback.yaw +
    shakeSample.yaw +
    motionRoll * 0.36;
  const viewPitch = clamp(
    app.cameraPitch +
      combatFeedback.pitch +
      shakeSample.pitch +
      (movementFrame?.landingDip || 0) * 0.26,
    -0.86,
    0.72
  );
  const flatForward = new THREE.Vector3(
    -Math.sin(viewYaw),
    0,
    -Math.cos(viewYaw)
  );
  const lookDirection = new THREE.Vector3(
    -Math.sin(viewYaw) * Math.cos(viewPitch),
    Math.sin(viewPitch),
    -Math.cos(viewYaw) * Math.cos(viewPitch)
  ).normalize();
  const shoulderRight = new THREE.Vector3(
    Math.cos(viewYaw),
    0,
    -Math.sin(viewYaw)
  );
  const target = player.position
    .clone()
    .add(new THREE.Vector3(0, player.eyeHeight, 0))
    .add(flatForward.multiplyScalar(1.25))
    .add(shoulderRight.multiplyScalar((movementFrame?.bobX || 0) * 0.7));
  const aimDistance = input.aim ? 2.8 : 4.45;
  const shoulder = shoulderRight.multiplyScalar(input.aim ? 0.58 : 0.42);
  const desired = target.clone().sub(lookDirection.multiplyScalar(aimDistance)).add(shoulder);
  const rayDirection = desired.clone().sub(target);
  const desiredDistance = rayDirection.length();
  rayDirection.normalize();
  const raycaster = new THREE.Raycaster(target, rayDirection, 0.2, desiredDistance);
  const intersections = raycaster.intersectObjects(cameraObstacles, false);
  if (intersections.length > 0) {
    desired.copy(target).add(rayDirection.multiplyScalar(Math.max(0.65, intersections[0].distance - 0.28)));
  }

  const shake = app.cameraShake;
  desired.x += randomRange(-shake, shake);
  desired.y += randomRange(-shake, shake);
  desired.z += randomRange(-shake, shake);
  const cameraLambda = app.paused ? 10 : 18;
  camera.position.lerp(desired, 1 - Math.exp(-cameraLambda * dt));
  camera.lookAt(target);
  camera.rotateZ(
    clamp(
      motionRoll + combatFeedback.roll + shakeSample.roll,
      -0.065,
      0.065
    )
  );
  const targetFov =
    app.baseFov -
    (input.aim ? 8 : 0) +
    (input.sprint && player.moving > 4 ? 3.5 : 0);
  camera.fov = damp(camera.fov, targetFov, 7, dt);
  camera.updateProjectionMatrix();
  app.cameraShake = damp(app.cameraShake, 0, 12, dt);
}

function setupControls() {
  const keyMap = {
    KeyW: "forward",
    KeyS: "backward",
    KeyA: "left",
    KeyD: "right"
  };

  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      if (app.started && !app.ended) togglePause();
      return;
    }
    if (!app.running) return;
    if (keyMap[event.code]) {
      input[keyMap[event.code]] = 1;
      event.preventDefault();
    }
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      input.sprint = true;
      event.preventDefault();
    }
    if (event.code === "KeyE") {
      input.interact = true;
      event.preventDefault();
    }
    if (event.repeat) return;
    if (event.code === "Space") {
      input.jumpQueued = true;
      event.preventDefault();
    }
    if (event.code === "KeyC") {
      input.crouch = !input.crouch;
      event.preventDefault();
    }
    if (event.code === "KeyR") {
      startReload();
      event.preventDefault();
    }
    if (event.code === "KeyQ") {
      toggleWeapon();
      event.preventDefault();
    }
    if (event.code === "Digit1") toggleWeapon(WEAPON_MODE.GUN);
    if (event.code === "Digit2") toggleWeapon(WEAPON_MODE.BLADE);
    if (event.code === "Digit3") toggleWeapon(WEAPON_MODE.MAGIC);
  });

  window.addEventListener("keyup", (event) => {
    if (keyMap[event.code]) input[keyMap[event.code]] = 0;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") input.sprint = false;
    if (event.code === "KeyE") input.interact = false;
  });

  window.addEventListener("blur", () => {
    clearTransientInput();
    if (app.running && !app.ended && !isTouch) togglePause(true);
  });

  document.addEventListener("mousedown", (event) => {
    if (!app.running || app.paused || event.target.closest("button, input, select")) return;
    if (!isTouch && document.pointerLockElement !== dom.canvas) {
      dom.canvas.requestPointerLock?.();
      if (!document.pointerLockElement) {
        input.dragging = true;
        input.dragX = event.clientX;
        input.dragY = event.clientY;
      }
    }
    if (event.button === 0) {
      input.pointerFire = true;
      input.fire = true;
      triggerPrimaryPress();
    }
    if (event.button === 2) {
      input.pointerBlock = true;
      input.aim = weapon.mode === WEAPON_MODE.GUN;
      input.block = weapon.mode === WEAPON_MODE.BLADE;
      app.blockStartedAt = performance.now();
    }
  });

  document.addEventListener("mouseup", (event) => {
    if (event.button === 0) {
      triggerPrimaryRelease();
    }
    if (event.button === 2) {
      input.pointerBlock = false;
      input.aim = false;
      input.block = false;
      input.dragging = false;
    }
  });

  document.addEventListener("mousemove", (event) => {
    if (!app.running) return;
    if (document.pointerLockElement === dom.canvas) {
      rotateCamera(event.movementX, event.movementY);
    } else if (input.dragging) {
      const deltaX = event.clientX - input.dragX;
      const deltaY = event.clientY - input.dragY;
      input.dragX = event.clientX;
      input.dragY = event.clientY;
      rotateCamera(deltaX, deltaY);
    }
  });

  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    if (
      app.running &&
      !app.paused &&
      !app.ended &&
      !isTouch &&
      document.pointerLockElement !== dom.canvas &&
      document.visibilityState === "visible"
    ) {
      togglePause(true);
    }
  });

  dom.canvas.addEventListener("click", () => {
    if (app.running && !isTouch && document.pointerLockElement !== dom.canvas) {
      dom.canvas.requestPointerLock?.();
    }
  });

  setupTouchControls();
  setupSettings();
}

function setupTouchControls() {
  let stickPointerId = null;
  let cameraPointerId = null;
  let cameraX = 0;
  let cameraY = 0;

  const updateStick = (event) => {
    const rect = dom.moveStick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.34;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    const scale = length > maxRadius ? maxRadius / length : 1;
    const knob = dom.moveStick.querySelector("i");
    knob.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
    input.touchRight = clamp((dx * scale) / maxRadius, -1, 1);
    input.touchForward = clamp((-dy * scale) / maxRadius, -1, 1);
  };

  dom.moveStick.addEventListener("pointerdown", (event) => {
    if (!app.running) return;
    stickPointerId = event.pointerId;
    dom.moveStick.setPointerCapture(event.pointerId);
    updateStick(event);
    event.preventDefault();
  });
  dom.moveStick.addEventListener("pointermove", (event) => {
    if (event.pointerId !== stickPointerId) return;
    updateStick(event);
    event.preventDefault();
  });
  const releaseStick = (event) => {
    if (event.pointerId !== stickPointerId) return;
    stickPointerId = null;
    input.touchForward = 0;
    input.touchRight = 0;
    dom.moveStick.querySelector("i").style.transform = "translate(-50%, -50%)";
  };
  dom.moveStick.addEventListener("pointerup", releaseStick);
  dom.moveStick.addEventListener("pointercancel", releaseStick);

  dom.canvas.addEventListener("pointerdown", (event) => {
    if (!app.running || event.pointerType === "mouse") return;
    cameraPointerId = event.pointerId;
    cameraX = event.clientX;
    cameraY = event.clientY;
    dom.canvas.setPointerCapture(event.pointerId);
  });
  dom.canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== cameraPointerId) return;
    const dx = event.clientX - cameraX;
    const dy = event.clientY - cameraY;
    cameraX = event.clientX;
    cameraY = event.clientY;
    rotateCamera(dx * 1.25, dy * 1.1);
  });
  const releaseCamera = (event) => {
    if (event.pointerId === cameraPointerId) cameraPointerId = null;
  };
  dom.canvas.addEventListener("pointerup", releaseCamera);
  dom.canvas.addEventListener("pointercancel", releaseCamera);

  const bindHoldButton = (element, down, up) => {
    element.addEventListener("pointerdown", (event) => {
      if (!app.running) return;
      element.setPointerCapture(event.pointerId);
      down();
      event.preventDefault();
    });
    const release = (event) => {
      up();
      event.preventDefault();
    };
    element.addEventListener("pointerup", release);
    element.addEventListener("pointercancel", release);
  };

  bindHoldButton(
    dom.touchFire,
    () => {
      input.fire = true;
      triggerPrimaryPress();
    },
    () => {
      triggerPrimaryRelease();
    }
  );
  bindHoldButton(
    dom.touchBlock,
    () => {
      input.block = weapon.mode === WEAPON_MODE.BLADE;
      input.aim = weapon.mode === WEAPON_MODE.GUN;
      app.blockStartedAt = performance.now();
    },
    () => {
      input.block = false;
      input.aim = false;
    }
  );
  dom.touchSwap.addEventListener("pointerdown", (event) => {
    toggleWeapon();
    event.preventDefault();
  });
  dom.touchReload.addEventListener("pointerdown", (event) => {
    startReload();
    event.preventDefault();
  });
  dom.touchMagic?.addEventListener("pointerdown", (event) => {
    toggleWeapon(WEAPON_MODE.MAGIC);
    event.preventDefault();
  });
  dom.touchElement?.addEventListener("pointerdown", (event) => {
    if (weapon.mode !== WEAPON_MODE.MAGIC || magic.charging) return;
    cycleMagicElement(magic);
    audio?.magicSelect(magic.selectedElement);
    event.preventDefault();
  });
  dom.touchCrouch?.addEventListener("pointerdown", (event) => {
    input.crouch = !input.crouch;
    event.preventDefault();
  });
  dom.touchJump.addEventListener("pointerdown", (event) => {
    input.jumpQueued = true;
    event.preventDefault();
  });
}

function setupSettings() {
  dom.start.addEventListener("click", startGame);
  dom.resume.addEventListener("click", () => togglePause(false));
  dom.restart.addEventListener("click", () => {
    resetGame();
    startGame();
  });
  dom.redeploy.addEventListener("click", () => {
    resetGame();
    startGame();
  });

  dom.quality.addEventListener("change", () => {
    app.quality = dom.quality.value;
    applyQuality();
  });
  dom.fov.addEventListener("input", () => {
    app.baseFov = Number(dom.fov.value);
    dom.fovValue.textContent = String(app.baseFov);
  });
  dom.sensitivity.addEventListener("input", () => {
    app.sensitivity = Number(dom.sensitivity.value);
    dom.sensitivityValue.textContent = app.sensitivity.toFixed(2);
  });
  dom.volume.addEventListener("input", () => {
    const volume = Number(dom.volume.value) / 100;
    dom.volumeValue.textContent = String(dom.volume.value);
    audio?.setVolume(volume);
    bgmController?.setVolume(volume);
  });
  dom.bgmPickTitle?.addEventListener("click", () => dom.bgmFile.click());
  dom.bgmPickPause?.addEventListener("click", () => dom.bgmFile.click());
  dom.bgmFile?.addEventListener("change", selectLocalBgm);
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => window.setTimeout(resize, 120));
  window.addEventListener("beforeunload", () => {
    if (bgmObjectUrl) URL.revokeObjectURL(bgmObjectUrl);
  });
}

function applyQuality() {
  const high = app.quality === "high";
  const low = app.quality === "low";
  const medium = app.quality === "medium";
  renderer.shadowMap.enabled = !low;
  directionLight.castShadow = !low;
  if (directionLight.shadow.mapSize.width !== (high ? 2048 : 1024)) {
    directionLight.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    directionLight.shadow.map?.dispose();
    directionLight.shadow.map = null;
  }
  bloomPass.strength = high ? 0.72 : low ? 0.35 : 0.53;
  bloomPass.radius = high ? 0.55 : 0.42;
  rain.material.opacity = high ? 0.23 : low ? 0.09 : 0.16;
  if (rainSplash) {
    rainSplash.visible = true;
    rainSplash.geometry.instanceCount = high
      ? rainSplash.userData.fullCount
      : medium
        ? Math.round(rainSplash.userData.fullCount * 0.62)
        : Math.round(rainSplash.userData.fullCount * 0.3);
    rainSplash.material.uniforms.uIntensity.value = high ? 0.78 : low ? 0.42 : 0.62;
  }
  const groundMaterial = worldRoot?.userData.groundMaterial;
  if (groundMaterial) {
    groundMaterial.uniforms.uRainIntensity.value = high ? 1 : low ? 0.38 : 0.72;
  }
  dust.material.opacity = high ? 0.3 : low ? 0.14 : 0.22;
  tonePass.uniforms.uToneMix.value = high ? 0.72 : low ? 0.86 : 0.8;
  resize();
}

let gamepadButtons = [];

function pollGamepad(dt) {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  const pad = Array.from(pads || []).find(Boolean);
  if (!pad) {
    input.padForward = 0;
    input.padRight = 0;
    return;
  }
  const deadzone = (value) => (Math.abs(value) < 0.16 ? 0 : value);
  input.padRight = deadzone(pad.axes[0] || 0);
  input.padForward = -deadzone(pad.axes[1] || 0);
  app.cameraYaw -= deadzone(pad.axes[2] || 0) * dt * 2.25 * app.sensitivity;
  app.cameraPitch -= deadzone(pad.axes[3] || 0) * dt * 1.7 * app.sensitivity;
  app.cameraPitch = clamp(app.cameraPitch, -0.72, 0.55);

  const pressed = (index) => Boolean(pad.buttons[index]?.pressed);
  const justPressed = (index) => pressed(index) && !gamepadButtons[index];
  const justReleased = (index) => !pressed(index) && gamepadButtons[index];
  input.fire = pressed(7) || input.pointerFire;
  input.block = pressed(6) && weapon.mode === WEAPON_MODE.BLADE;
  input.aim = pressed(6) && weapon.mode === WEAPON_MODE.GUN;
  if (justPressed(6)) app.blockStartedAt = performance.now();
  if (justPressed(7)) triggerPrimaryPress();
  if (justReleased(7)) triggerPrimaryRelease();
  if (justPressed(0)) input.jumpQueued = true;
  if (justPressed(2)) startReload();
  if (justPressed(3)) toggleWeapon();
  if (justPressed(1)) input.crouch = !input.crouch;
  gamepadButtons = Array.from(pad.buttons, (button) => button.pressed);
}

function clearTransientInput() {
  input.forward = 0;
  input.backward = 0;
  input.left = 0;
  input.right = 0;
  input.sprint = false;
  input.fire = false;
  input.pointerFire = false;
  input.aim = false;
  input.block = false;
  input.pointerBlock = false;
  input.interact = false;
  input.touchForward = 0;
  input.touchRight = 0;
  input.padForward = 0;
  input.padRight = 0;
  input.dragging = false;
  if (magic.charging) {
    cancelMagicCast(magic, true);
    clearMagicChargeEffect();
  }
}

function showToast(message, duration = 2200) {
  dom.toast.textContent = message;
  dom.toast.classList.add("on");
  app.toastTimer = duration / 1000;
}

function renderBgmStatus(state) {
  let title = "BGM 未载入";
  let pause = "未载入";

  if (state.status === BGM_STATUS.ERROR) {
    title = "BGM 加载失败";
    pause = "加载失败";
  } else if (state.hasSource) {
    const shortLabel =
      state.label.length > 42 ? `${state.label.slice(0, 39)}...` : state.label;
    title = shortLabel;
    pause = state.status === BGM_STATUS.PLAYING ? "播放中" : shortLabel;
  }

  if (dom.bgmStatusTitle) {
    dom.bgmStatusTitle.textContent = title;
    dom.bgmStatusTitle.title = state.error || state.label;
  }
  if (dom.bgmStatusPause) {
    dom.bgmStatusPause.textContent = pause;
    dom.bgmStatusPause.title = state.error || state.label;
  }
}

async function selectLocalBgm() {
  const file = dom.bgmFile?.files?.[0];
  if (!file || !bgmController) return;

  const acceptedExtension = /\.(mp3|ogg|m4a|aac|wav|flac)$/i.test(file.name);
  if (!file.size || (!file.type.startsWith("audio/") && !acceptedExtension)) {
    bgmController.markError("请选择浏览器可播放的本地音频文件");
    dom.bgmFile.value = "";
    return;
  }

  bgmController.pause();
  if (bgmObjectUrl) URL.revokeObjectURL(bgmObjectUrl);
  bgmObjectUrl = URL.createObjectURL(file);
  bgmSourceMode = "local-file";
  bgmController.setSource(bgmObjectUrl, file.name);
  bgmController.setVolume(Number(dom.volume.value) / 100);
  dom.bgmFile.value = "";

  if (app.running && !app.paused && !app.ended) {
    const played = await bgmController.play();
    if (!played) showToast("BGM 无法播放 // 请检查浏览器音频格式支持", 3200);
  }
}

function showHitMarker(kill = false) {
  dom.hitmarker.classList.remove("on", "kill");
  void dom.hitmarker.offsetWidth;
  dom.hitmarker.classList.toggle("kill", kill);
  dom.hitmarker.classList.add("on");
  app.hitMarkerTimer = 0.24;
}

function showParryCallout() {
  dom.parryCallout.classList.remove("on");
  void dom.parryCallout.offsetWidth;
  dom.parryCallout.classList.add("on");
  app.parryCalloutTimer = 0.68;
  showToast("完美弹反 // 动能弹体已反转", 1100);
}

function nearestPendingTerminal() {
  let nearest = null;
  let distance = Infinity;
  for (const terminal of terminals) {
    if (terminal.activated) continue;
    const nextDistance = Math.hypot(
      player.position.x - terminal.position.x,
      player.position.z - terminal.position.z
    );
    if (nextDistance < distance) {
      nearest = terminal;
      distance = nextDistance;
    }
  }
  return { terminal: nearest, distance };
}

function updateObjectiveGuide() {
  if (!dom.objectiveGuide) return;

  if (mission.phase === MISSION_PHASE.UPLINKS) {
    const { terminal, distance } = nearestPendingTerminal();
    if (!terminal) {
      dom.objectiveGuide.textContent = "链路扫描完成 // 准备迎战";
    } else if (distance <= 3.1) {
      dom.objectiveGuide.textContent = `终端 ${terminal.id} 已锁定 // 长按 E 接入`;
    } else {
      dom.objectiveGuide.textContent =
        `最近终端 ${terminal.id} // 距离 ${Math.ceil(distance)} m`;
    }
    return;
  }

  if (mission.phase === MISSION_PHASE.BOSS) {
    dom.objectiveGuide.textContent = boss?.active
      ? "NOCTIS 解除限制 // 注意弹幕与近界斩击"
      : "大型断界机兵正在解冻";
    return;
  }

  if (mission.phase === MISSION_PHASE.EXTRACTION) {
    const distance = Math.hypot(
      player.position.x - 0,
      player.position.z - 47
    );
    dom.objectiveGuide.textContent =
      distance <= 3
        ? "撤离信标已锁定 // 进入信标完成撤离"
        : `返回起点撤离 // 距离 ${Math.ceil(distance)} m`;
    return;
  }

  dom.objectiveGuide.textContent = "撤离成功 // 任务完成";
}

function updateUi(dt) {
  if (!app.started) return;
  dom.runTime.textContent = formatTime(app.elapsed);
  dom.healthValue.textContent = String(Math.ceil(player.health));
  dom.staminaValue.textContent = String(Math.ceil(player.stamina));
  dom.healthBar.style.width = `${(player.health / player.maxHealth) * 100}%`;
  dom.staminaBar.style.width = `${(player.stamina / player.maxStamina) * 100}%`;
  dom.healthBar.parentElement.parentElement.classList.toggle("critical", player.health <= 30);
  dom.killCount.textContent = String(app.kills);
  dom.parryCount.textContent = String(app.parries);

  const blade = weapon.mode === WEAPON_MODE.BLADE;
  const magicMode = weapon.mode === WEAPON_MODE.MAGIC;
  const magicProfile = magicElementProfile(magic.selectedElement);
  const magicColor = `#${magicProfile.color.toString(16).padStart(6, "0")}`;
  dom.magicHud?.style.setProperty("--magic-color", magicColor);
  dom.crosshair.style.setProperty("--magic-color", magicColor);
  dom.crosshair.classList.toggle("blade", blade);
  dom.crosshair.classList.toggle("magic", magicMode);
  dom.weaponName.textContent = magicMode
    ? `${magicProfile.label} // ${magicProfile.spellName}`
    : blade
      ? "零界光刃 // ARC BLADE"
      : weapon.reloadRemaining > 0
        ? "ARC-9 脉冲步枪 // 装填中"
        : "ARC-9 脉冲步枪";
  dom.ammo.textContent = magicMode
    ? String(Math.floor(magic.mana))
    : blade
      ? "∞"
      : String(weapon.ammo);
  dom.reserve.textContent = magicMode
    ? `/ ${magic.maxMana} MP`
    : blade
      ? "/ ∞"
      : `/ ${weapon.reserve}`;
  dom.gunMode.classList.toggle("active", weapon.mode === WEAPON_MODE.GUN);
  dom.bladeMode.classList.toggle("active", blade);
  dom.magicMode?.classList.toggle("active", magicMode);
  dom.magicHud?.classList.toggle("hidden", !magicMode);
  if (dom.magicElement) dom.magicElement.textContent = `${magicProfile.label} // ${magicProfile.spellName}`;
  if (dom.manaValue) dom.manaValue.textContent = String(Math.floor(magic.mana));
  if (dom.manaBar) dom.manaBar.style.width = `${(magic.mana / magic.maxMana) * 100}%`;
  if (dom.magicChargeBar) {
    dom.magicChargeBar.style.width =
      `${clamp(magic.charge / magic.maxCharge, 0, 1) * 100}%`;
  }
  if (dom.touchReload) dom.touchReload.textContent = magicMode ? "元素" : "装";
  if (dom.touchFire) dom.touchFire.textContent = magicMode ? "蓄力" : "攻击";
  if (dom.touchCrouch) dom.touchCrouch.classList.toggle("active", input.crouch);

  if (mission.phase === MISSION_PHASE.UPLINKS) {
    dom.objective.textContent = `接入战术上行链路 ${mission.uplinksDone}/${mission.totalUplinks}`;
  } else if (mission.phase === MISSION_PHASE.BOSS) {
    dom.objective.textContent = "击破断界机兵 NOCTIS";
  } else if (mission.phase === MISSION_PHASE.EXTRACTION) {
    dom.objective.textContent = "返回起点撤离";
  } else {
    dom.objective.textContent = "撤离成功";
  }
  updateObjectiveGuide();

  const showInteraction =
    Boolean(app.interactionTarget) &&
    !app.interactionTarget.activated &&
    mission.phase === MISSION_PHASE.UPLINKS &&
    app.running;
  dom.interaction.classList.toggle("hidden", !showInteraction);
  if (showInteraction) {
    dom.interactionLabel.textContent = `接入上行链路 ${app.interactionTarget.id} // 按住 E`;
    dom.interactionBar.style.width = `${app.interactionProgress * 100}%`;
  }

  const bossVisible = Boolean(boss?.active && mission.phase === MISSION_PHASE.BOSS);
  dom.bossHud.classList.toggle("hidden", !bossVisible);
  if (bossVisible) {
    dom.bossBar.style.width = `${(boss.health / boss.maxHealth) * 100}%`;
    dom.bossPhase.textContent = boss.phase === 2 ? "PHASE II" : "PHASE I";
  }

  dom.crosshair.style.opacity = app.paused ? "0" : "1";
  const crosshairGap =
    7 +
    combatFeedback.crosshair * 12 +
    (magicMode ? magic.charge * 4 : 0) +
    (player.moving > 1 ? 2.5 : 0);
  dom.crosshair.style.setProperty("--gap", `${crosshairGap.toFixed(2)}px`);
  if (app.toastTimer > 0) {
    app.toastTimer -= dt;
    if (app.toastTimer <= 0) dom.toast.classList.remove("on");
  }
  if (app.hitMarkerTimer > 0) {
    app.hitMarkerTimer -= dt;
    if (app.hitMarkerTimer <= 0) dom.hitmarker.classList.remove("on");
  }
  if (app.parryCalloutTimer > 0) {
    app.parryCalloutTimer -= dt;
    if (app.parryCalloutTimer <= 0) dom.parryCallout.classList.remove("on");
  }
}

function startGame() {
  audio?.init();
  audio?.setVolume(Number(dom.volume.value) / 100);
  bgmController?.setVolume(Number(dom.volume.value) / 100);
  if (app.ended) resetGame();
  app.started = true;
  app.running = true;
  app.paused = false;
  app.ended = false;
  player.facing = 0;
  dom.title.classList.add("hidden");
  dom.pause.classList.add("hidden");
  dom.end.classList.add("hidden");
  dom.hud.classList.remove("hidden");
  dom.boot.classList.add("done");
  dom.touch.classList.toggle("hidden", !isTouch);
  clearTransientInput();
  showToast("战区链路已建立 // 寻找三组上行终端", 2200);
  void bgmController?.play();
  if (!isTouch) dom.canvas.requestPointerLock?.();
}

function togglePause(force) {
  if (!app.started || app.ended) return;
  const nextPaused = typeof force === "boolean" ? force : !app.paused;
  if (nextPaused === app.paused) return;
  app.paused = nextPaused;
  app.running = !nextPaused;
  dom.pause.classList.toggle("hidden", !nextPaused);
  clearTransientInput();
  if (nextPaused) {
    bgmController?.pause();
    if (document.pointerLockElement === dom.canvas) document.exitPointerLock();
  } else {
    audio?.resume();
    void bgmController?.play();
    if (!isTouch) dom.canvas.requestPointerLock?.();
  }
}

function finishGame(victory) {
  if (app.ended) return;
  app.running = false;
  app.ended = true;
  app.paused = false;
  clearTransientInput();
  if (document.pointerLockElement === dom.canvas) document.exitPointerLock();
  dom.hud.classList.add("hidden");
  dom.touch.classList.add("hidden");
  dom.pause.classList.add("hidden");
  dom.end.classList.remove("hidden");
  dom.end.time = formatTime(app.elapsed);
  dom.endKicker.textContent = victory ? "撤离完成" : "连接中断";
  dom.endTitle.textContent = victory ? "撤离成功" : "意识连接终止";
  dom.endCopy.textContent = victory
    ? "NOCTIS 已崩解，三组战术链路全部关闭。你已返回起点，完成撤离。"
    : "生命维持系统归零。重新部署并调整近战与枪械的切换节奏。";
  dom.endTime.textContent = formatTime(app.elapsed);
  dom.endKills.textContent = String(app.kills);
  dom.endParries.textContent = String(app.parries);
  if (victory) audio?.victory();
}

function createExtractionPoint() {
  if (extractionPoint?.group) dynamicRoot.remove(extractionPoint.group);

  const group = new THREE.Group();
  group.position.set(0, 0, 47);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.teal,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const outerRing = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.12, 72), ringMaterial.clone());
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.06;
  group.add(outerRing);

  const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.76, 0.9, 56), ringMaterial.clone());
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.075;
  group.add(innerRing);

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.teal,
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.68, 14, 20, 1, true),
    beamMaterial
  );
  beam.position.y = 7;
  group.add(beam);

  const light = new THREE.PointLight(COLORS.teal, 18, 14, 2);
  light.position.y = 1.5;
  group.add(light);

  dynamicRoot.add(group);
  extractionPoint = {
    group,
    outerRing,
    innerRing,
    beam,
    light,
    position: new THREE.Vector3(0, 0, 47),
    activatedAt: app.elapsed
  };
}

function updateExtractionPoint(dt, now) {
  if (!extractionPoint || mission.phase !== MISSION_PHASE.EXTRACTION) return;
  const pulse = 1 + Math.sin(now * 0.006) * 0.08;
  extractionPoint.outerRing.scale.setScalar(pulse);
  extractionPoint.innerRing.rotation.z += dt * 0.8;
  extractionPoint.beam.material.opacity = 0.08 + Math.sin(now * 0.004) * 0.025;
  extractionPoint.light.intensity = 14 + Math.sin(now * 0.005) * 5;

  const distance = Math.hypot(
    player.position.x - extractionPoint.position.x,
    player.position.z - extractionPoint.position.z
  );
  if (distance <= 2.8) {
    advanceMission(mission, "extraction");
    showToast("撤离信标确认 // 任务完成", 1800);
    window.setTimeout(() => finishGame(true), 420);
  }
}

function completeMission() {
  if (mission.phase !== MISSION_PHASE.BOSS) return;
  advanceMission(mission, "boss");
  app.bossUnlockAt = Infinity;
  createExtractionPoint();
  showToast("NOCTIS 已击破 // 返回起点撤离信标", 3800);
}

function clearDynamicRoot() {
  dynamicRoot.traverse((child) => {
    if (!child.isMesh && !child.isPoints && !child.isLine) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  });
  dynamicRoot.clear();
  enemies.length = 0;
  terminals.length = 0;
  projectiles.length = 0;
  transientEffects.length = 0;
  extractionPoint = null;
}

function resetGame() {
  clearMagicChargeEffect();
  clearDynamicRoot();
  Object.assign(mission, createMissionState(3));
  Object.assign(weapon, createWeaponState());
  Object.assign(magic, createMagicState());
  magicTelemetry.casts = 0;
  magicTelemetry.impacts = 0;
  magicTelemetry.lastElement = null;
  movementFeedback = createMovementFeedback();
  movementFrame = null;
  combatFeedback = createCombatFeedback();
  player.position.set(0, 0, 47);
  player.velocity.set(0, 0, 0);
  player.yaw = 0;
  player.facing = Math.PI;
  player.verticalVelocity = 0;
  player.grounded = true;
  player.health = player.maxHealth;
  player.stamina = player.maxStamina;
  player.invulnerable = 0;
  player.attack = null;
  player.attackQueued = false;
  player.hitSet.clear();
  player.moving = 0;
  input.crouch = false;
  if (player.rig) {
    player.rig.root.position.copy(player.position);
    player.rig.root.rotation.set(0, 0, 0);
  }
  app.started = false;
  app.running = false;
  app.paused = false;
  app.ended = false;
  app.elapsed = 0;
  app.kills = 0;
  app.parries = 0;
  app.cameraYaw = 0;
  app.cameraPitch = -0.12;
  app.cameraShake = 0;
  app.lastDamageAt = -10;
  app.lastShotAt = -10;
  app.bossUnlockAt = Infinity;
  app.toastTimer = 0;
  app.hitMarkerTimer = 0;
  app.parryCalloutTimer = 0;
  app.interactionTarget = null;
  app.interactionProgress = 0;
  app.flash = 0;
  gameOverTimer = 0;
  boss = null;
  extractionPoint = null;
  bossUnlockTimer = 0;
  createTerminals();
  createBoss();
  spawnInitialEnemies();
  updateWeaponVisuals();
  clearTransientInput();
  dom.bossHud.classList.add("hidden");
  dom.interaction.classList.add("hidden");
  dom.toast.classList.remove("on");
  dom.hitmarker.classList.remove("on");
  dom.parryCallout.classList.remove("on");
  dom.end.classList.add("hidden");
  dom.pause.classList.add("hidden");
  dom.hud.classList.add("hidden");
  updateUi(0);
  updatePlayerRig(1 / 60);
}

function updateGame(dt, now) {
  app.elapsed += dt;
  tickMagicState(magic, dt);
  pollGamepad(dt);
  updatePlayer(dt);

  const wasReloading = weapon.reloadRemaining > 0;
  tickWeapon(weapon, dt);
  if (wasReloading && weapon.reloadRemaining <= 0) {
    audio?.reloadStart();
  }
  updatePlayerAttack(dt);
  updateTerminals(dt, now);
  updateEnemies(dt, now);
  updateBoss(dt, now);
  updateProjectiles(dt);
  updateExtractionPoint(dt, now);
  updateTransientEffects(dt);
  updateCombatFeedback(combatFeedback, dt);
  updateMagicChargeEffect(dt, now);

  if (app.elapsed >= app.bossUnlockAt) {
    app.bossUnlockAt = Infinity;
    activateBoss();
  }
  updateUi(dt);
}

function updateEnvironment(dt, now) {
  const elapsed = now * 0.001;
  const groundMaterial = worldRoot?.userData.groundMaterial;
  if (groundMaterial) groundMaterial.uniforms.uTime.value = elapsed;
  if (rainSplash) rainSplash.material.uniforms.uTime.value = elapsed;
  const skyMaterial = scene?.userData.skyMaterial;
  if (skyMaterial) skyMaterial.uniforms.uTime.value = elapsed;

  if (rain) {
    const positions = rain.geometry.attributes.position.array;
    for (let index = 0; index < rainData.length; index += 1) {
      const drop = rainData[index];
      drop.y -= drop.speed * dt;
      if (drop.y < 0.2) {
        drop.y = randomRange(24, 44);
        drop.x = randomRange(-74, 74);
        drop.z = randomRange(-66, 64);
      }
      positions[index * 6] = drop.x;
      positions[index * 6 + 1] = drop.y;
      positions[index * 6 + 2] = drop.z;
      positions[index * 6 + 3] = drop.x + 0.06;
      positions[index * 6 + 4] = drop.y - drop.length;
      positions[index * 6 + 5] = drop.z + 0.02;
    }
    rain.geometry.attributes.position.needsUpdate = true;
    rain.position.x = Math.sin(now * 0.00009) * 1.4;
  }
  if (dust) {
    dust.rotation.y += dt * 0.006;
    dust.rotation.x = Math.sin(now * 0.00008) * 0.015;
  }

  app.lightningIn -= dt;
  if (app.lightningIn <= 0) {
    app.lightningIn = randomRange(9, 18);
    app.lightning = 1;
  }
  app.lightning = Math.max(0, (app.lightning || 0) - dt * 4.8);
  directionLight.intensity = 3.1 + app.lightning * 6.2;
  app.flash = Math.max(0, app.flash - dt * 3.6);

  if (gradePass) {
    camera.updateMatrixWorld();
    camera.getWorldDirection(atmosphereForward);
    atmosphereToLight.copy(atmosphereLightPosition).sub(camera.position).normalize();
    const lightFacing = clamp(atmosphereToLight.dot(atmosphereForward), 0, 1);
    projectedAtmosphereLight.copy(atmosphereLightPosition).project(camera);
    const lightOnScreen =
      projectedAtmosphereLight.z > -1 &&
      projectedAtmosphereLight.z < 1 &&
      lightFacing > 0.02;
    gradePass.uniforms.uLightScreen.value.set(
      clamp(projectedAtmosphereLight.x * 0.5 + 0.5, -0.25, 1.25),
      clamp(projectedAtmosphereLight.y * 0.5 + 0.5, -0.25, 1.25)
    );
    const shaftTarget = lightOnScreen
      ? (0.07 + lightFacing * 0.3) * (0.82 + app.lightning * 0.55)
      : 0.025;
    gradePass.uniforms.uShaft.value = damp(gradePass.uniforms.uShaft.value, shaftTarget, 3.4, dt);

    const healthTension = player.health < 35 ? (1 - player.health / 35) * 0.2 : 0;
    gradePass.uniforms.uTime.value = elapsed;
    gradePass.uniforms.uDamage.value = Math.max(
      app.flash * 0.7,
      healthTension,
      player.health < 30 ? 0.16 : 0
    );
    const speedMotion = clamp((player.moving - 1.2) / 7.4, 0, 1) * 0.34;
    const sprintMotion = input.sprint && player.moving > 4 ? 0.16 : 0;
    const impactMotion = clamp(app.cameraShake * 2.1, 0, 0.42);
    const motionTarget = app.started && !app.paused
      ? clamp(speedMotion + sprintMotion + impactMotion + app.lightning * 0.06, 0, 0.72)
      : 0;
    gradePass.uniforms.uMotion.value = damp(
      gradePass.uniforms.uMotion.value,
      motionTarget,
      motionTarget > gradePass.uniforms.uMotion.value ? 9 : 3.5,
      dt
    );
  }

  const exposureTarget = 1.08 + app.lightning * 0.38 + app.flash * 0.08;
  adaptedExposure = damp(
    adaptedExposure,
    exposureTarget,
    exposureTarget > adaptedExposure ? 15 : 2.2,
    dt
  );
  if (tonePass) tonePass.uniforms.uExposure.value = adaptedExposure;
  audio?.updateListener();
}

let lastFrame = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  if (app.running && !app.paused && !app.ended) updateGame(dt, now);
  else if (!app.started) updatePlayerRig(dt);
  updateCamera(dt, now);
  updateEnvironment(dt, now);
  composer.render();
}

async function init() {
  try {
    setBoot(8, "INITIALIZING WEBGL2");
    initRenderer();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    setBoot(28, "BUILDING PROCEDURAL DISTRICT");
    buildEnvironment();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    setBoot(54, "COMPILING MATERIAL SHADERS");
    createPlayerRig();
    configureBuildPresentation();
    if (__PRIVATE_BUILD__) {
      await initializePlayerModel();
    } else {
      setModelStatus("procedural", "Public educational build", "procedural-operator");
      updateModelAttribution();
    }
    audio = new AudioSystem();
    bgmController = createBgmController(dom.bgm, { onStatus: renderBgmStatus });
    bgmController.setVolume(Number(dom.volume.value) / 100);
    const defaultBgmSource = dom.bgm?.getAttribute("src") || "";
    if (defaultBgmSource) {
      bgmSourceMode = "embedded-default";
      bgmController.setSource(defaultBgmSource, DEFAULT_BGM_LABEL);
    } else if (IS_PUBLIC_BUILD) {
      bgmSourceMode = "none";
    }
    renderBgmStatus(bgmController.getState());
    setupControls();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    setBoot(76, "DEPLOYING HOSTILES");
    resetGame();
    applyQuality();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    setBoot(94, "SYNCHRONIZING COMBAT LOOP");
    camera.position.set(24, 9, 42);
    camera.lookAt(0, 3, 18);
    composer.render();
    requestAnimationFrame(animate);
    window.setTimeout(() => {
      dom.boot.classList.add("done");
      setBoot(100, "LINK READY");
    }, 420);
  } catch (error) {
    fail(error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error));
  }
}

init();
