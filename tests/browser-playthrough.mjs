import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const publicUrl =
  process.env.PUBLIC_URL || "http://127.0.0.1:4173/docs/index.html";
const defaultMoveTimeout = Number(
  process.env.PLAYTHROUGH_MOVE_TIMEOUT_MS || 60000
);
const headless = process.env.PLAYTHROUGH_HEADLESS !== "0";
const useSwiftShader = process.env.PLAYTHROUGH_SWIFTSHADER === "1";
const failures = [];

const zonePlans = [
  {
    id: "ggo-harbor",
    objectives: [
      {
        id: "A",
        route: [
          [-12, 42],
          [-28, 38],
          [-33, 20]
        ]
      },
      {
        id: "B",
        route: [
          [-20, 22],
          [-8, 15],
          [14, 9]
        ]
      },
      {
        id: "C",
        route: [
          [13, -5],
          [3, -13]
        ]
      }
    ],
    bossStage: [0, -24],
    retreatKey: "KeyS",
    retreatZ: 18,
    extractionRoute: [
      [-16, -4],
      [-16, 18],
      [-8, 38],
      [0, 47]
    ]
  },
  {
    id: "alo-sky",
    objectives: [
      {
        id: "WIND-A",
        route: [
          [0, 35],
          [0, 20],
          [-25, 8]
        ]
      },
      {
        id: "WIND-B",
        route: [
          [0, 12],
          [26, 3]
        ]
      },
      {
        id: "WIND-C",
        route: [
          [0, -8],
          [0, -25]
        ]
      }
    ],
    bossStage: [0, -14],
    retreatKey: "KeyS",
    retreatZ: 22,
    extractionRoute: [
      [0, -8],
      [0, 20],
      [0, 35],
      [0, 40]
    ]
  },
  {
    id: "world-tree-core",
    safePad: { x: 25, z: -20, radius: 3.2 },
    magicElement: "lightning",
    objectives: [
      {
        id: "SEAL-A",
        route: [
          [16, 25],
          [-25, 19],
          [-22, 8]
        ]
      },
      {
        id: "SEAL-B",
        route: [
          [0, 2],
          [25, -20],
          [22, -14]
        ]
      }
    ],
    bossStage: [25, -20],
    retreatKey: null,
    retreatZ: 0,
    extractionRoute: [
      [25, -16],
      [16, 25],
      [0, 36]
    ]
  }
];

function check(condition, message, details = "") {
  if (!condition) failures.push(details ? `${message}: ${details}` : message);
}

function angleDifference(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

await mkdir("artifacts", { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
    ...(useSwiftShader ? ["--use-angle=swiftshader"] : [])
  ]
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) =>
    failures.push(`pageerror: ${error.stack || error.message}`)
  );
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });

  await page.goto(publicUrl, { waitUntil: "networkidle" });
  const renderer = await page.evaluate(() => {
    const context = document.createElement("canvas").getContext("webgl2");
    const extension = context?.getExtension("WEBGL_debug_renderer_info");
    return extension
      ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : "unknown WebGL renderer";
  });
  console.log(`playthrough renderer: ${renderer}`);

  await page.waitForFunction(
    () => document.querySelector("#boot")?.classList.contains("done"),
    null,
    { timeout: 60000 }
  );
  await page.locator("#quality-select").evaluate((element) => {
    element.value = "low";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#start-button").click();
  await page.waitForFunction(
    () => window.__danrenInputDebug?.().running === true,
    null,
    { timeout: 30000 }
  );
  await page.waitForFunction(
    () => window.__danrenInputDebug?.().pointerLock === "game",
    null,
    { timeout: 10000 }
  );

  const snapshot = () => page.evaluate(() => window.__danrenStateDebug?.());
  const zoneState = () => page.evaluate(() => window.__danrenZoneDebug?.());
  const inputState = () => page.evaluate(() => window.__danrenInputDebug?.());

  async function logLoadout(label) {
    const [state, magicState] = await Promise.all([
      snapshot(),
      page.evaluate(() => window.__danrenMagicDebug?.())
    ]);
    console.log(
      `${label}: zone=${state.zone.id}, elapsed=${state.elapsed.toFixed(1)}, ` +
        `health=${state.player.health.toFixed(1)}, ` +
        `ammo=${state.weapon.ammo}/${state.weapon.reserve}, ` +
        `mana=${magicState?.mana?.toFixed(1) ?? "n/a"}`
    );
  }

  async function setLookAt(target) {
    for (let index = 0; index < 14; index += 1) {
      const [current, state] = await Promise.all([inputState(), snapshot()]);
      const player = state.player;
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const horizontal = Math.hypot(dx, dz);
      const targetYaw = Math.atan2(-dx, -dz);
      const eyeY = player.y + player.eyeHeight;
      const targetPitch = Math.atan2(
        (target.y ?? 1) - eyeY,
        Math.max(horizontal, 0.01)
      );
      const yawDelta = angleDifference(current.cameraYaw, targetYaw);
      const pitchDelta = targetPitch - current.cameraPitch;
      if (Math.abs(yawDelta) < 0.008 && Math.abs(pitchDelta) < 0.008) return;

      await page.evaluate(
        ({ movementX, movementY }) => {
          const event = new MouseEvent("mousemove", { bubbles: true });
          Object.defineProperty(event, "movementX", { value: movementX });
          Object.defineProperty(event, "movementY", { value: movementY });
          document.dispatchEvent(event);
        },
        {
          movementX: -yawDelta / 0.00225,
          movementY: -pitchDelta / 0.00185
        }
      );
      await page.waitForTimeout(35);
    }
  }

  async function moveTo(
    x,
    z,
    { tolerance = 1.15, sprint = true, timeout = defaultMoveTimeout } = {}
  ) {
    const startedAt = Date.now();
    const samples = [];
    let bestDistance = Infinity;
    let lastProgressAt = startedAt;
    const startingZoneId = (await snapshot())?.zone.id;
    await page.keyboard.down("KeyW");
    if (sprint) await page.keyboard.down("ShiftLeft");
    try {
      while (Date.now() - startedAt < timeout) {
        const state = await snapshot();
        if (!state) throw new Error("runtime state is unavailable");
        if (state.ended || state.paused) return state;
        if (state.zone.id !== startingZoneId) return state;
        if (samples.length < 5 || samples.length >= 295) {
          const input = await inputState();
          samples.push({
            x: state.player.x,
            z: state.player.z,
            yaw: input.cameraYaw,
            pitch: input.cameraPitch
          });
        }
        const dx = x - state.player.x;
        const dz = z - state.player.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= tolerance) return state;
        if (distance < bestDistance - 0.08) {
          bestDistance = distance;
          lastProgressAt = Date.now();
        } else if (Date.now() - lastProgressAt > 5000) {
          throw new Error(
            `Navigation stalled at (${x}, ${z}); zone=${state.zone.id}, ` +
              `player=(${state.player.x.toFixed(2)}, ${state.player.z.toFixed(2)}), ` +
              `velocity=(${state.player.velocityX.toFixed(2)}, ` +
              `${state.player.velocityZ.toFixed(2)}), input=${JSON.stringify(state.input)}`
          );
        }
        await setLookAt({ x, y: 0.2, z });
        await page.waitForTimeout(90);
      }
      const state = await snapshot();
      throw new Error(
        `Navigation timed out at (${x}, ${z}); zone=${state?.zone.id}, ` +
          `player=(${state?.player.x.toFixed(2)}, ${state?.player.z.toFixed(2)}), ` +
          `phase=${state?.mission.phase}, health=${state?.player.health.toFixed(1)}, ` +
          `velocity=(${state?.player.velocityX.toFixed(2)}, ` +
          `${state?.player.velocityZ.toFixed(2)}), input=${JSON.stringify(state?.input)}, ` +
          `samples=${JSON.stringify(samples)}`
      );
    } finally {
      await page.keyboard.up("KeyW");
      if (sprint) await page.keyboard.up("ShiftLeft");
    }
  }

  async function moveRoute(points) {
    for (const [x, z] of points) await moveTo(x, z);
  }

  async function ensureGun() {
    const state = await snapshot();
    if (state.weapon.mode === "gun") return;
    await page.keyboard.press("Digit1");
    await page.waitForFunction(
      () => window.__danrenStateDebug?.().weapon.mode === "gun",
      null,
      { timeout: 5000 }
    );
  }

  async function reloadIfNeeded() {
    await ensureGun();
    const state = await snapshot();
    if (state.weapon.ammo > 4 || state.weapon.reserve <= 0) return;
    await page.keyboard.press("KeyR");
    await page.waitForFunction(
      () => {
        const weapon = window.__danrenStateDebug?.().weapon;
        return weapon && weapon.reloadRemaining <= 0 && weapon.ammo > 0;
      },
      null,
      { timeout: 5000 }
    );
  }

  async function ensureMagic(element = "ice") {
    const state = await snapshot();
    if (state.weapon.mode !== "magic") {
      await page.keyboard.press("Digit3");
      await page.waitForFunction(
        () => window.__danrenStateDebug?.().weapon.mode === "magic",
        null,
        { timeout: 5000 }
      );
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const magicState = await page.evaluate(() =>
        window.__danrenMagicDebug?.()
      );
      if (magicState?.selectedElement === element) return;
      await page.keyboard.press("KeyR");
      await page.waitForTimeout(80);
    }
    const finalMagicState = await page.evaluate(() =>
      window.__danrenMagicDebug?.()
    );
    throw new Error(
      `magic selection did not reach ${element}: ` +
        JSON.stringify(finalMagicState)
    );
  }

  async function castMagicAtBoss(element = "ice", { dodge = false } = {}) {
    await ensureMagic(element);
    try {
      await page.waitForFunction(
        () => {
          const magicState = window.__danrenMagicDebug?.();
          return (
            magicState &&
            !magicState.charging &&
            magicState.cooldown <= 0 &&
            magicState.mana >= magicState.profile.manaCost
          );
        },
        null,
        { timeout: 12000 }
      );
    } catch (error) {
      const readiness = await page.evaluate(() => ({
        magic: window.__danrenMagicDebug?.(),
        state: window.__danrenStateDebug?.(),
        input: window.__danrenInputDebug?.(),
        pointerLock: document.pointerLockElement?.id || null
      }));
      throw new Error(
        `magic never became ready for ${element}: ${JSON.stringify(readiness)}: ` +
          error.message
      );
    }

    const initialCasts = await page.evaluate(
      () => window.__danrenMagicDebug?.().casts ?? 0
    );
    const initial = await snapshot();
    if (!initial.boss?.active || initial.boss.dying) return false;

    await setLookAt(initial.boss);
    await page.mouse.down({ button: "left" });
    const startedAt = Date.now();
    let beforeRelease = null;
    let dodgeKey = null;
    try {
      try {
        await page.waitForFunction(
          () => window.__danrenMagicDebug?.().charging === true,
          null,
          { timeout: 2500 }
        );
      } catch (error) {
        const inputDiagnostics = await page.evaluate(() => ({
          magic: window.__danrenMagicDebug?.(),
          input: window.__danrenInputDebug?.(),
          pointerLock: document.pointerLockElement?.id || null,
          target: document.elementFromPoint(
            window.innerWidth / 2,
            window.innerHeight / 2
          )?.id || document.elementFromPoint(
            window.innerWidth / 2,
            window.innerHeight / 2
          )?.tagName || null
        }));
        throw new Error(
          `magic charge did not start: ${JSON.stringify(inputDiagnostics)}: ` +
            error.message
        );
      }
      while (Date.now() - startedAt < 1350) {
        const state = await snapshot();
        if (state.ended || state.mission.phase === "extraction") break;
        if (state.boss?.active && !state.boss.dying) await setLookAt(state.boss);
        if (dodge) {
          const armedFor = Date.now() - startedAt;
          const nextDodgeKey =
            armedFor < 330 ? "KeyD" : armedFor < 990 ? "KeyA" : "KeyD";
          if (dodgeKey !== nextDodgeKey) {
            if (dodgeKey) await page.keyboard.up(dodgeKey);
            await page.keyboard.down(nextDodgeKey);
            dodgeKey = nextDodgeKey;
          }
        }
        await page.waitForTimeout(55);
      }
    } finally {
      if (dodgeKey) await page.keyboard.up(dodgeKey);
      beforeRelease = await page.evaluate(() => ({
        magic: window.__danrenMagicDebug?.(),
        state: window.__danrenStateDebug?.(),
        input: window.__danrenInputDebug?.(),
        pointerLock: document.pointerLockElement?.id || null
      }));
      await page.mouse.up({ button: "left" });
    }

    try {
      await page.waitForFunction(
        (previous) => {
          const state = window.__danrenStateDebug?.();
          return (
            state?.ended ||
            state?.mission.phase === "extraction" ||
            Number(window.__danrenMagicDebug?.().casts ?? 0) > previous
          );
        },
        initialCasts,
        { timeout: 5000 }
      );
    } catch (error) {
      const afterRelease = await page.evaluate(() => ({
        magic: window.__danrenMagicDebug?.(),
        state: window.__danrenStateDebug?.(),
        input: window.__danrenInputDebug?.(),
        pointerLock: document.pointerLockElement?.id || null
      }));
      throw new Error(
        `magic cast did not register for ${element}; initialCasts=${initialCasts}, ` +
          `beforeRelease=${JSON.stringify(beforeRelease)}, ` +
          `afterRelease=${JSON.stringify(afterRelease)}: ${error.message}`
      );
    }
    return true;
  }

  function nearestTarget(state, range) {
    const candidates = [...state.enemies.canAim];
    if (state.boss?.active && !state.boss.dying) candidates.push(state.boss);
    return (
      candidates
        .filter(
          (target) =>
            Math.hypot(target.x - state.player.x, target.z - state.player.z) <=
            range
        )
        .sort((a, b) => {
          const distanceA = Math.hypot(
            a.x - state.player.x,
            a.z - state.player.z
          );
          const distanceB = Math.hypot(
            b.x - state.player.x,
            b.z - state.player.z
          );
          return distanceA - distanceB;
        })[0] || null
    );
  }

  async function fireBurst(range = 34, duration = 800) {
    await ensureGun();
    await reloadIfNeeded();
    const initial = await snapshot();
    if (!nearestTarget(initial, range)) return false;

    await page.mouse.down({ button: "right" });
    await page.mouse.down({ button: "left" });
    const startedAt = Date.now();
    try {
      while (Date.now() - startedAt < duration) {
        const state = await snapshot();
        if (state.ended) return true;
        const target = nearestTarget(state, Math.max(range, 62));
        if (!target) break;
        await setLookAt(target);
        await page.waitForTimeout(45);
      }
    } finally {
      await page.mouse.up({ button: "left" });
      await page.mouse.up({ button: "right" });
    }
    await reloadIfNeeded();
    return true;
  }

  async function clearNearby(range = 24, bursts = 2) {
    for (let index = 0; index < bursts; index += 1) {
      const state = await snapshot();
      if (state.ended || !nearestTarget(state, range)) return;
      await fireBurst(range, 700);
    }
  }

  async function activateObjective(id) {
    const state = await snapshot();
    const objective = state.terminals.find((candidate) => candidate.id === id);
    check(Boolean(objective), `objective ${id} is missing in ${state.zone.id}`);
    if (!objective) return;
    await moveTo(objective.x, objective.z, { tolerance: 1.25 });
    await clearNearby(22, 2);
    await page.keyboard.down("KeyE");
    try {
      await page.waitForFunction(
        (terminalId) =>
          window.__danrenStateDebug?.().terminals.find(
            (candidate) => candidate.id === terminalId
          )?.activated === true,
        id,
        { timeout: 30000 }
      );
    } catch (error) {
      const failedState = await snapshot();
      const failedObjective = failedState.terminals.find(
        (candidate) => candidate.id === id
      );
      throw new Error(
        `Objective ${id} did not activate in ${failedState.zone.id}; ` +
          `player=(${failedState.player.x.toFixed(2)}, ` +
          `${failedState.player.z.toFixed(2)}), ` +
          `objective=(${failedObjective?.x.toFixed(2)}, ` +
          `${failedObjective?.z.toFixed(2)}), ` +
          `distance=${Math.hypot(
            failedState.player.x - failedObjective.x,
            failedState.player.z - failedObjective.z
          ).toFixed(2)}, progress=${failedState.interactionProgress.toFixed(3)}, ` +
          `health=${failedState.player.health.toFixed(1)}, ` +
          `phase=${failedState.mission.phase}: ${error.message}`
      );
    } finally {
      await page.keyboard.up("KeyE");
    }
  }

  async function activateZoneObjectives(plan) {
    for (const objective of plan.objectives) {
      await moveRoute(objective.route);
      await activateObjective(objective.id);
    }
    const state = await snapshot();
    check(
      state.mission.uplinksDone === state.mission.totalUplinks,
      `${plan.id} objective count did not complete`,
      JSON.stringify(state.mission)
    );
  }

  async function fightBoss(plan) {
    await page.waitForFunction(
      () => window.__danrenStateDebug?.().mission.phase === "boss",
      null,
      { timeout: 10000 }
    );
    await moveTo(plan.bossStage[0], plan.bossStage[1], { tolerance: 1.4 });
    await page.waitForFunction(
      () => window.__danrenStateDebug?.().boss?.active === true,
      null,
      { timeout: 30000 }
    );
    if (plan.safePad) {
      await moveTo(plan.safePad.x, plan.safePad.z, {
        tolerance: 1.4,
        sprint: false
      });
    }

    let retreating = Boolean(plan.retreatKey);
    let orbitKey = "KeyD";
    let nextOrbitSwapAt = Date.now() + 550;
    let safePadPatrolIndex = 0;
    const orbiting = !retreating && plan.orbitBoss;
    if (retreating) {
      await page.keyboard.down(plan.retreatKey);
      await page.keyboard.down("ShiftLeft");
    } else if (orbiting) {
      await page.keyboard.down(orbitKey);
    }

    const startedAt = Date.now();
    const telemetry = [];
    let nextTelemetryAt = 0;
    try {
      while (Date.now() - startedAt < 90000) {
        const state = await snapshot();
        if (Date.now() >= nextTelemetryAt) {
          const magicState = await page.evaluate(() =>
            window.__danrenMagicDebug?.()
          );
          telemetry.push({
            elapsed: Number(state.elapsed.toFixed(1)),
            health: Number(state.player.health.toFixed(1)),
            ammo: state.weapon.ammo,
            reserve: state.weapon.reserve,
            mana: Number(magicState?.mana?.toFixed(1) ?? -1),
            bossHealth: Number(state.boss?.health?.toFixed(1) ?? -1),
            bossPhase: state.boss?.phase ?? -1,
            bossAttack: state.boss?.attackIndex ?? -1,
            enemiesAlive: state.enemies.alive,
            x: Number(state.player.x.toFixed(1)),
            z: Number(state.player.z.toFixed(1))
          });
          nextTelemetryAt = Date.now() + 2000;
        }
        if (state.ended || state.mission.phase === "extraction") break;
        check(state.player.health > 0, `${plan.id} player died during boss fight`);
        if (state.player.health <= 0) break;

        if (retreating && state.player.z >= plan.retreatZ) {
          retreating = false;
          await page.keyboard.up("ShiftLeft");
          await page.keyboard.up(plan.retreatKey);
        }
        if (orbiting && Date.now() >= nextOrbitSwapAt) {
          const nextOrbitKey = orbitKey === "KeyD" ? "KeyA" : "KeyD";
          await page.keyboard.up(orbitKey);
          await page.keyboard.down(nextOrbitKey);
          orbitKey = nextOrbitKey;
          nextOrbitSwapAt = Date.now() + 550;
        }

        const boss = state.boss;
        if (!boss?.active || boss.dying) {
          await page.waitForTimeout(120);
          continue;
        }
        if (
          plan.safePad &&
          Math.hypot(
            state.player.x - plan.safePad.x,
            state.player.z - plan.safePad.z
          ) > plan.safePad.radius
        ) {
          await moveTo(plan.safePad.x, plan.safePad.z, {
            tolerance: 1.4,
            sprint: false
          });
          continue;
        }
        if (state.weapon.ammo <= 0 && state.weapon.reserve <= 0) {
          const magicState = await page.evaluate(() =>
            window.__danrenMagicDebug?.()
          );
          const magicReady =
            magicState &&
            !magicState.charging &&
            magicState.cooldown <= 0 &&
            magicState.mana >= magicState.profile.manaCost;
          if (!magicReady && plan.safePad) {
            const patrolPoints = [
              { x: plan.safePad.x + 2.4, z: plan.safePad.z },
              { x: plan.safePad.x, z: plan.safePad.z + 2.4 },
              { x: plan.safePad.x - 2.4, z: plan.safePad.z },
              { x: plan.safePad.x, z: plan.safePad.z - 2.4 }
            ];
            const patrol = patrolPoints[safePadPatrolIndex % patrolPoints.length];
            safePadPatrolIndex += 1;
            await moveTo(patrol.x, patrol.z, {
              tolerance: 0.9,
              sprint: false
            });
            continue;
          }
          await castMagicAtBoss(plan.magicElement || "ice", {
            dodge: Boolean(plan.safePad)
          });
          continue;
        }
        await reloadIfNeeded();
        await page.mouse.down({ button: "right" });
        await page.mouse.down({ button: "left" });
        try {
          for (let aim = 0; aim < 10; aim += 1) {
            const aimingState = await snapshot();
            if (
              aimingState.ended ||
              aimingState.mission.phase === "extraction" ||
              !aimingState.boss?.active ||
              aimingState.boss.dying
            ) {
              break;
            }
            await setLookAt(aimingState.boss);
            await page.waitForTimeout(55);
          }
        } finally {
          await page.mouse.up({ button: "left" });
          await page.mouse.up({ button: "right" });
        }
      }
    } finally {
      if (retreating) {
        await page.keyboard.up("ShiftLeft");
        await page.keyboard.up(plan.retreatKey);
      }
      if (orbiting) {
        await page.keyboard.up(orbitKey);
      }
      await page.mouse.up({ button: "left" }).catch(() => {});
      await page.mouse.up({ button: "right" }).catch(() => {});
    }

    try {
      await page.waitForFunction(
        () => window.__danrenStateDebug?.().mission.phase === "extraction",
        null,
        { timeout: 15000 }
      );
    } catch (error) {
      const failedState = await snapshot();
      await page.screenshot({
        path: `artifacts/playthrough-failed-${plan.id}.png`
      });
      console.error(`${plan.id} telemetry: ${JSON.stringify(telemetry)}`);
      throw new Error(
        `${plan.id} boss fight did not reach extraction; ` +
          `player=(${failedState.player.x.toFixed(2)}, ` +
          `${failedState.player.z.toFixed(2)}), health=${failedState.player.health.toFixed(1)}, ` +
          `ammo=${failedState.weapon.ammo}/${failedState.weapon.reserve}, ` +
          `boss=${failedState.boss?.health.toFixed(1)}/` +
          `${failedState.boss?.maxHealth}, active=${failedState.boss?.active}, ` +
          `dying=${failedState.boss?.dying}, phase=${failedState.mission.phase}: ` +
          error.message
      );
    }
  }

  async function extractZone(plan, nextZoneId) {
    await moveRoute(plan.extractionRoute);
    if (nextZoneId) {
      await page.waitForFunction(
        (zoneId) => window.__danrenZoneDebug?.().zoneId === zoneId,
        nextZoneId,
        { timeout: 15000 }
      );
      const loadout = await snapshot();
      check(
        loadout.weapon.ammo > 0 && loadout.weapon.reserve > 0,
        `${nextZoneId} did not receive a zone-entry ammunition resupply`,
        `ammo=${loadout.weapon.ammo}/${loadout.weapon.reserve}`
      );
      const magicState = await page.evaluate(() =>
        window.__danrenMagicDebug?.()
      );
      check(
        magicState?.mana === magicState?.maxMana,
        `${nextZoneId} did not receive a zone-entry mana resupply`,
        `mana=${magicState?.mana}/${magicState?.maxMana}`
      );
    }
  }

  for (let index = 0; index < zonePlans.length; index += 1) {
    const plan = zonePlans[index];
    await page.waitForFunction(
      (zoneId) => window.__danrenZoneDebug?.().zoneId === zoneId,
      plan.id,
      { timeout: 15000 }
    );
    const before = await zoneState();
    check(before.phase === "objectives", `${plan.id} did not start in objectives`);
    check(
      before.objectiveCount === plan.objectives.length,
      `${plan.id} objective count is wrong`
    );

    await logLoadout(`${plan.id} objectives start`);
    await activateZoneObjectives(plan);
    await logLoadout(`${plan.id} boss start`);
    await fightBoss(plan);
    await logLoadout(`${plan.id} extraction start`);

    const defeated = await snapshot();
    check(
      defeated.mission.phase === "extraction",
      `${plan.id} boss did not open extraction`,
      JSON.stringify(defeated.mission)
    );
    check(
      defeated.mission.bossDefeated,
      `${plan.id} boss was not recorded defeated`
    );

    const nextZoneId = zonePlans[index + 1]?.id || null;
    if (nextZoneId) {
      await extractZone(plan, nextZoneId);
    } else {
      await moveRoute(plan.extractionRoute);
      await page.waitForFunction(
        () => {
          const state = window.__danrenStateDebug?.();
          return state?.ended === true && state?.victory === true;
        },
        null,
        { timeout: 15000 }
      );
    }
  }

  const finalZone = await zoneState();
  const finalState = await snapshot();
  check(finalZone.finalVictory === true, "campaign did not report final victory");
  check(
    finalZone.completedZoneIds.length === 3,
    "not all three zones were recorded complete",
    JSON.stringify(finalZone.completedZoneIds)
  );
  check(finalState.ended && finalState.victory, "end screen did not report victory");
  await page.screenshot({
    path: "artifacts/three-zone-public-playthrough-victory.png"
  });
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("three-zone public playthrough passed");
}
