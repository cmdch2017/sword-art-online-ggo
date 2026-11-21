import assert from "node:assert/strict";
import test from "node:test";
import {
  TRAINING_PROFILE,
  pickAimAssistTarget
} from "../src/difficulty.mjs";

test("training profile is deliberately more forgiving than the original balance", () => {
  assert.ok(TRAINING_PROFILE.playerMaxHealth >= 160);
  assert.ok(TRAINING_PROFILE.enemy.damageScale <= 0.6);
  assert.ok(TRAINING_PROFILE.bossMaxHealth <= 800);
  assert.ok(TRAINING_PROFILE.blade.damage[0] >= 55);
});

test("aim assist selects the nearest target inside the allowed cone", () => {
  const result = pickAimAssistTarget(
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 0, z: -1 },
    [
      { id: "far", x: 4, y: 1.2, z: -30 },
      { id: "near", x: -1, y: 1.2, z: -12 }
    ],
    { maxAngle: 0.25, maxDistance: 50 }
  );

  assert.equal(result?.candidate.id, "near");
});

test("aim assist ignores targets behind the player or outside the cone", () => {
  const result = pickAimAssistTarget(
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 0, z: -1 },
    [
      { id: "behind", x: 0, y: 1.2, z: 12 },
      { id: "outside", x: 20, y: 1.2, z: -12 }
    ],
    { maxAngle: 0.2, maxDistance: 50 }
  );

  assert.equal(result, null);
});
