import * as THREE from "three";

const BONE_ALIASES = {
  root: ["全ての親", "AllParent"],
  center: ["センター", "Center"],
  groove: ["グルーブ", "Groove"],
  waist: ["腰", "Waist"],
  lowerBody: ["下半身", "LowerBody"],
  chest: ["上半身", "UpperBody"],
  upperChest: ["上半身2", "UpperBody2"],
  neck: ["首", "Neck"],
  head: ["頭", "Head"],
  leftShoulder: ["左肩", "LeftShoulder"],
  rightShoulder: ["右肩", "RightShoulder"],
  leftUpperArm: ["左腕", "LeftUpperArm"],
  rightUpperArm: ["右腕", "RightUpperArm"],
  leftForearm: ["左ひじ", "LeftForearm"],
  rightForearm: ["右ひじ", "RightForearm"],
  leftHand: ["左手首", "LeftHand"],
  rightHand: ["右手首", "RightHand"],
  leftThigh: ["左足", "LeftThigh"],
  rightThigh: ["右足", "RightThigh"],
  leftShin: ["左ひざ", "LeftShin"],
  rightShin: ["右ひざ", "RightShin"],
  leftFoot: ["左足首", "LeftFoot"],
  rightFoot: ["右足首", "RightFoot"]
};

const scratchTarget = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchPosition = new THREE.Vector3();

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function findBone(root, aliases) {
  const exactAliases = new Set(aliases.map((alias) => alias.toLowerCase()));
  const normalizedAliases = new Set(
    aliases
      .map((alias) => alias.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter(Boolean)
  );
  let found = null;
  root.traverse((node) => {
    if (found || !node.isBone) return;
    const name = String(node.name || "").toLowerCase();
    if (exactAliases.has(name)) {
      found = node;
      return;
    }
    const normalized = name.replace(/[^a-z0-9]/g, "");
    if (normalized && normalizedAliases.has(normalized)) found = node;
  });
  return found;
}

export class MmdPoseController {
  constructor(root) {
    if (!root?.isObject3D) throw new Error("MMD pose root must be an Object3D");

    this.root = root;
    this.bones = {};
    this.originalTransforms = new Map();

    for (const [key, aliases] of Object.entries(BONE_ALIASES)) {
      const bone = findBone(root, aliases);
      if (!bone) continue;
      this.bones[key] = bone;
      this.originalTransforms.set(bone, {
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone()
      });
    }

    const center = this.bones.center;
    const head = this.bones.head;
    this.bodyUnit =
      center && head
        ? THREE.MathUtils.clamp(center.position.distanceTo(head.position), 1, 14)
        : 1;
    this.elapsed = 0;
    this.restored = false;
  }

  setRotation(key, x, y, z, dt, lambda = 12) {
    const bone = this.bones[key];
    if (!bone) return;
    const original = this.originalTransforms.get(bone).quaternion;
    scratchEuler.set(x, y, z, "XYZ");
    scratchTarget.setFromEuler(scratchEuler).multiply(original);
    bone.quaternion.slerp(scratchTarget, 1 - Math.exp(-lambda * dt));
  }

  setPositionOffset(key, x, y, z, dt, lambda = 12) {
    const bone = this.bones[key];
    if (!bone) return;
    const original = this.originalTransforms.get(bone).position;
    scratchPosition.set(original.x + x, original.y + y, original.z + z);
    bone.position.lerp(scratchPosition, 1 - Math.exp(-lambda * dt));
  }

  update(
    {
      state = "idle",
      moving = 0,
      elapsed = 0,
      stridePhase = null,
      attackProgress = 0
    } = {},
    dt = 1 / 60
  ) {
    this.restored = false;
    this.elapsed = elapsed;
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    const speedWeight = THREE.MathUtils.clamp(moving / 6, 0, 1);
    const phase = Number.isFinite(stridePhase)
      ? stridePhase
      : elapsed * (5.5 + speedWeight * 4.5);
    const stride = Math.sin(phase) * speedWeight;
    const bob =
      state === "run" || state === "sprint"
        ? Math.abs(Math.sin(phase)) * this.bodyUnit * 0.018
        : Math.sin(elapsed * 1.7) * this.bodyUnit * 0.006;
    const breathing = Math.sin(elapsed * 1.7) * 0.018;
    const aiming = state === "aim" || state === "fire";
    const blocking = state === "block";
    const bladeAttack = state === "bladeAttack";
    const attackSwing = Math.sin(
      THREE.MathUtils.clamp(attackProgress, 0, 1) * Math.PI
    );

    let leftArmZ = -1.22;
    let rightArmZ = 1.22;
    let leftArmX = -stride * 0.36;
    let rightArmX = stride * 0.36;
    let leftArmY = 0.05;
    let rightArmY = -0.05;
    let leftElbowX = -0.08;
    let rightElbowX = -0.08;
    let torsoX = 0.035 + breathing;
    let torsoZ = -stride * 0.06;
    let headX = -0.025;
    let headY = stride * 0.035;

    if (aiming) {
      leftArmZ = -0.72;
      rightArmZ = 0.58;
      leftArmY = 0.72;
      rightArmY = 1.05;
      leftArmX = -0.32;
      rightArmX = -0.18;
      leftElbowX = -0.52;
      rightElbowX = -0.32;
      torsoX = 0.06;
      torsoZ = 0.025;
      headX = 0.015;
      headY = -0.05;
    } else if (blocking) {
      leftArmZ = -0.86;
      rightArmZ = 0.82;
      leftArmY = 0.38;
      rightArmY = 0.42;
      leftArmX = -0.52;
      rightArmX = -0.48;
      leftElbowX = -0.92;
      rightElbowX = -0.88;
      torsoX = 0.08;
      headX = 0.02;
    } else if (bladeAttack) {
      const windup = Math.sin((1 - attackProgress) * Math.PI * 0.5);
      leftArmZ = -0.28 - attackSwing * 1.55;
      leftArmY = 0.25 + attackSwing * 0.8;
      leftArmX = -0.45 - windup * 0.35;
      leftElbowX = -0.36 - attackSwing * 0.28;
      rightArmZ = 1.08;
      rightArmY = -0.02;
      rightArmX = stride * 0.18;
      rightElbowX = -0.12;
      torsoX = 0.06 + attackSwing * 0.12;
      torsoZ = -0.06 - attackSwing * 0.28;
      headY = 0.12 + attackSwing * 0.16;
    } else if (state === "hit") {
      torsoX = -0.22;
      torsoZ = 0.08;
      leftArmZ = -0.95;
      rightArmZ = 1.02;
      headX = -0.16;
    } else if (state === "death") {
      torsoX = -0.55;
      torsoZ = 0.22;
      leftArmZ = -0.42;
      rightArmZ = 0.36;
      leftArmY = -0.25;
      rightArmY = 0.25;
      headX = -0.25;
    }

    this.setRotation("leftUpperArm", leftArmX, leftArmY, leftArmZ, safeDt);
    this.setRotation("rightUpperArm", rightArmX, rightArmY, rightArmZ, safeDt);
    this.setRotation("leftForearm", leftElbowX, 0, -0.16, safeDt);
    this.setRotation("rightForearm", rightElbowX, 0, 0.16, safeDt);
    this.setRotation("leftThigh", stride * 0.58, 0, -0.035, safeDt);
    this.setRotation("rightThigh", -stride * 0.58, 0, 0.035, safeDt);
    this.setRotation(
      "leftShin",
      Math.max(0, -stride) * 0.48,
      0,
      0,
      safeDt
    );
    this.setRotation(
      "rightShin",
      Math.max(0, stride) * 0.48,
      0,
      0,
      safeDt
    );
    this.setRotation("leftFoot", -stride * 0.16, 0, 0, safeDt);
    this.setRotation("rightFoot", stride * 0.16, 0, 0, safeDt);
    this.setRotation("lowerBody", -stride * 0.06, 0, 0, safeDt);
    this.setRotation("chest", torsoX, 0, torsoZ, safeDt, 9);
    this.setRotation(
      "upperChest",
      torsoX * 0.35 + breathing,
      0,
      torsoZ * 0.45,
      safeDt,
      9
    );
    this.setRotation("neck", headX * 0.4, headY * 0.4, 0, safeDt, 10);
    this.setRotation("head", headX, headY, 0, safeDt, 10);
    this.setPositionOffset("center", 0, bob, 0, safeDt, 10);
  }

  restore() {
    if (this.restored) return;
    for (const [bone, transform] of this.originalTransforms) {
      bone.position.copy(transform.position);
      bone.quaternion.copy(transform.quaternion);
      bone.scale.copy(transform.scale);
      bone.updateMatrix();
    }
    this.restored = true;
  }

  dispose() {
    this.restore();
    this.originalTransforms.clear();
    this.bones = {};
    this.root = null;
  }
}
