import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  applyWeaponOffset,
  attachWeapon,
  findBone,
  restoreWeapon
} from "../src/weapon-attach.js";

test("bone lookup follows manifest alias order", () => {
  const root = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = "mixamorig:RightHand";
  root.add(hand);

  assert.equal(findBone(root, ["RightHand", "mixamorig:RightHand"]), hand);
});

test("bone lookup rejects unrelated names", () => {
  const root = new THREE.Group();
  const foot = new THREE.Object3D();
  foot.name = "LeftFoot";
  root.add(foot);

  assert.equal(findBone(root, ["RightHand"]), null);
});

test("weapon attachment restores the original parent and local transform", () => {
  const originalParent = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = "RightHand";
  originalParent.add(hand);
  const weapon = new THREE.Group();
  weapon.position.set(3, 4, 5);
  originalParent.add(weapon);

  const record = attachWeapon(weapon, hand, {
    position: [1, 2, 3],
    rotation: [0, Math.PI / 2, 0],
    scale: [0.5, 0.5, 0.5]
  });

  assert.equal(weapon.parent, hand);
  assert.deepEqual(weapon.position.toArray(), [1, 2, 3]);
  assert.deepEqual(weapon.scale.toArray(), [0.5, 0.5, 0.5]);

  restoreWeapon(record);
  assert.equal(weapon.parent, originalParent);
  assert.deepEqual(weapon.position.toArray(), [3, 4, 5]);
  assert.deepEqual(weapon.scale.toArray(), [1, 1, 1]);
});

test("weapon attachment preserves requested world scale under a scaled bone", () => {
  const root = new THREE.Group();
  root.scale.setScalar(0.1);
  const hand = new THREE.Bone();
  hand.name = "LeftHand";
  root.add(hand);
  const weapon = new THREE.Group();

  attachWeapon(weapon, hand, {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0.78, 0.78, 0.78]
  });
  root.updateMatrixWorld(true);

  const worldScale = weapon.getWorldScale(new THREE.Vector3());
  assert.ok(worldScale.distanceTo(new THREE.Vector3(0.78, 0.78, 0.78)) < 1e-6);
});

test("weapon attachment expresses requested rotation in world space", () => {
  const root = new THREE.Group();
  root.rotation.z = Math.PI / 2;
  const hand = new THREE.Bone();
  hand.name = "RightHand";
  root.add(hand);
  const weapon = new THREE.Group();

  attachWeapon(weapon, hand, {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  root.updateMatrixWorld(true);

  const worldQuaternion = weapon.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(worldQuaternion.angleTo(new THREE.Quaternion()) < 1e-6);
});

test("weapon attachment can offset from the bone in world space", () => {
  const root = new THREE.Group();
  root.position.set(3, 1, -2);
  root.rotation.y = Math.PI / 2;
  root.scale.setScalar(0.5);
  const hand = new THREE.Bone();
  hand.name = "RightHand";
  root.add(hand);
  const weapon = new THREE.Group();

  attachWeapon(weapon, hand, {
    position: [0, 0, 0],
    worldOffset: [0.25, 0.1, -0.05],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  root.updateMatrixWorld(true);

  const handWorld = hand.getWorldPosition(new THREE.Vector3());
  const weaponWorld = weapon.getWorldPosition(new THREE.Vector3());
  assert.ok(
    weaponWorld
      .clone()
      .sub(handWorld)
      .distanceTo(new THREE.Vector3(0.25, 0.1, -0.05)) < 1e-6
  );
});

test("weapon offset composes on top of the captured rest orientation", () => {
  const weapon = new THREE.Group();
  const rest = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.2, -0.3, 0.4)
  );

  applyWeaponOffset(weapon, rest, 0, 0, 0);
  assert.ok(weapon.quaternion.angleTo(rest) < 1e-6);

  applyWeaponOffset(weapon, rest, 0.35, 0, 0);
  assert.ok(weapon.quaternion.angleTo(rest) > 0.2);
});
