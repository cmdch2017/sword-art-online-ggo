import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  AnimationController,
  chooseAnimationState,
  normalizeClipName,
  resolveAnimationClip
} from "../src/animation-controller.js";

test("animation selection gives death and attack higher priority than movement", () => {
  assert.equal(chooseAnimationState({ dead: true, moving: true }), "death");
  assert.equal(
    chooseAnimationState({ attacking: true, firing: true, moving: true }),
    "bladeAttack"
  );
  assert.equal(chooseAnimationState({ moving: true, sprinting: true }), "sprint");
  assert.equal(chooseAnimationState({ aiming: true }), "aim");
  assert.equal(chooseAnimationState({}), "idle");
});

test("clip names normalize punctuation and case", () => {
  assert.equal(
    normalizeClipName("mixamorig:RightHand|Run_01"),
    "mixamorigrighthandrun01"
  );
});

test("clip resolution prefers an exact declared alias before normalization", () => {
  const clips = [{ name: "Run_01" }, { name: "Run" }];
  const clip = resolveAnimationClip(clips, ["Run", "Run_01"]);

  assert.equal(clip.name, "Run");
});

test("animation controller uses one-shot settings for combat actions", () => {
  const root = new THREE.Group();
  const idle = new THREE.AnimationClip("Idle", 1, []);
  const fire = new THREE.AnimationClip("Fire", 0.4, []);
  const controller = new AnimationController(root, [idle, fire], {
    idle: ["Idle"],
    fire: ["Fire"]
  });

  controller.setState("fire");
  assert.equal(controller.currentState, "fire");
  assert.equal(controller.currentAction.loop, THREE.LoopOnce);
  assert.equal(controller.currentAction.clampWhenFinished, true);

  controller.setState("idle");
  assert.equal(controller.currentState, "idle");
  assert.equal(controller.currentAction.loop, THREE.LoopRepeat);
  controller.dispose();
});
