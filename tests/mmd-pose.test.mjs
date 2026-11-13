import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { MmdPoseController } from "../src/mmd-pose.js";

function createSkeletonRoot() {
  const root = new THREE.Group();
  const bones = {};
  for (const name of [
    "センター",
    "上半身",
    "上半身2",
    "首",
    "頭",
    "左腕",
    "左ひじ",
    "右腕",
    "右ひじ",
    "左足",
    "左ひざ",
    "右足",
    "右ひざ"
  ]) {
    const bone = new THREE.Bone();
    bone.name = name;
    root.add(bone);
    bones[name] = bone;
  }
  return { root, bones };
}

test("procedural MMD pose moves an unanimated model out of its T-pose", () => {
  const { root, bones } = createSkeletonRoot();
  const controller = new MmdPoseController(root);

  controller.update({ state: "idle", moving: 0, elapsed: 0 }, 1);

  assert.notDeepEqual(
    bones["右腕"].quaternion.toArray(),
    [0, 0, 0, 1]
  );
  assert.notDeepEqual(
    bones["左腕"].quaternion.toArray(),
    [0, 0, 0, 1]
  );
  controller.dispose();
});

test("procedural MMD pose reacts to aiming and locomotion", () => {
  const { root, bones } = createSkeletonRoot();
  const controller = new MmdPoseController(root);

  controller.update({ state: "aim", moving: 0, elapsed: 0.4 }, 1);
  const aimedArm = bones["右腕"].quaternion.clone();
  controller.update(
    { state: "run", moving: 5, elapsed: 1.2, stridePhase: Math.PI / 2 },
    1
  );

  assert.notDeepEqual(bones["右腕"].quaternion.toArray(), aimedArm.toArray());
  assert.notDeepEqual(bones["左足"].quaternion.toArray(), [0, 0, 0, 1]);
  assert.ok(Math.abs(bones["センター"].position.y) > 0.001);
  controller.dispose();
});

test("blade attacks drive the left sword arm more than the gun arm", () => {
  const { root, bones } = createSkeletonRoot();
  const controller = new MmdPoseController(root);

  controller.update({ state: "idle", moving: 0, elapsed: 0 }, 1);
  const leftIdle = bones["左腕"].quaternion.clone();
  const rightIdle = bones["右腕"].quaternion.clone();

  controller.update(
    { state: "bladeAttack", attackProgress: 0.65, elapsed: 0.2 },
    1
  );

  const leftTravel = bones["左腕"].quaternion.angleTo(leftIdle);
  const rightTravel = bones["右腕"].quaternion.angleTo(rightIdle);
  assert.ok(
    leftTravel > rightTravel * 1.5,
    `expected left arm to lead the attack, got left=${leftTravel}, right=${rightTravel}`
  );
  controller.dispose();
});

test("procedural MMD pose restores captured bone transforms", () => {
  const { root, bones } = createSkeletonRoot();
  const rightArm = bones["右腕"];
  rightArm.quaternion.setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
  const controller = new MmdPoseController(root);
  const original = rightArm.quaternion.clone();

  controller.update({ state: "bladeAttack", attackProgress: 0.5 }, 1);
  controller.restore();

  assert.deepEqual(rightArm.quaternion.toArray(), original.toArray());
  controller.dispose();
});
