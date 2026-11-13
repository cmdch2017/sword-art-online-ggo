import assert from "node:assert/strict";
import test from "node:test";

import {
  createCombatFeedback,
  fireCombatFeedback,
  hitCombatFeedback,
  sampleCombatShake,
  updateCombatFeedback
} from "../src/combat-feedback.mjs";

test("sustained fire accumulates recoil with a bounded camera kick", () => {
  const feedback = createCombatFeedback();
  let firstKick = 0;
  for (let index = 0; index < 20; index += 1) {
    const shot = fireCombatFeedback(feedback, { aiming: false }, () => 0.75);
    if (index === 0) firstKick = shot.pitchKick;
  }

  assert.ok(firstKick > 0);
  assert.ok(feedback.pitch > firstKick * 3);
  assert.ok(feedback.pitch <= 0.095);
  assert.ok(Math.abs(feedback.yaw) <= 0.032);
  assert.ok(Math.abs(feedback.roll) <= 0.038);
});

test("aiming an automatic weapon produces less recoil than hip fire", () => {
  const hip = createCombatFeedback();
  const ads = createCombatFeedback();

  const hipShot = fireCombatFeedback(hip, { aiming: false }, () => 0.5);
  const adsShot = fireCombatFeedback(ads, { aiming: true }, () => 0.5);

  assert.ok(adsShot.pitchKick < hipShot.pitchKick);
  assert.ok(adsShot.spread < hipShot.spread);
  assert.ok(adsShot.shake < hipShot.shake);
});

test("recoil holds briefly then settles back toward the aiming point", () => {
  const feedback = createCombatFeedback();
  for (let index = 0; index < 6; index += 1) {
    fireCombatFeedback(feedback, {}, () => 0.5);
  }
  const kickedPitch = feedback.pitch;
  const kickedYaw = feedback.yaw;

  updateCombatFeedback(feedback, 0.08);
  assert.ok(Math.abs(feedback.pitch - kickedPitch) < 1e-9);

  updateCombatFeedback(feedback, 0.35);
  assert.ok(Math.abs(feedback.pitch) < Math.abs(kickedPitch) * 0.2);
  assert.ok(Math.abs(feedback.yaw) < Math.abs(kickedYaw) * 0.2);
});

test("movement and airborne state widen the shot cone while crouching tightens it", () => {
  const standing = fireCombatFeedback(createCombatFeedback(), {
    aiming: false
  });
  const crouched = fireCombatFeedback(createCombatFeedback(), {
    aiming: false,
    crouching: true
  });
  const moving = fireCombatFeedback(createCombatFeedback(), {
    aiming: false,
    moving: 6
  });
  const airborne = fireCombatFeedback(createCombatFeedback(), {
    aiming: false,
    moving: 6,
    airborne: true
  });

  assert.ok(crouched.spread < standing.spread);
  assert.ok(moving.spread > standing.spread);
  assert.ok(airborne.spread > moving.spread);
});

test("enemy and headshot impacts add more punch than a world hit", () => {
  assert.ok(hitCombatFeedback({ enemy: true }).shake > hitCombatFeedback({}).shake);
  assert.ok(
    hitCombatFeedback({ enemy: true, headshot: true }).shake >
      hitCombatFeedback({ enemy: true }).shake
  );
  assert.ok(
    hitCombatFeedback({ enemy: true, kill: true }).crosshair >
      hitCombatFeedback({ enemy: true }).crosshair
  );
});

test("camera shake is directional and settles after firing", () => {
  const feedback = createCombatFeedback();
  fireCombatFeedback(feedback, {}, () => 0.35);
  const initialShake = feedback.shake;
  const first = sampleCombatShake(feedback, 0.08);
  const second = sampleCombatShake(feedback, 0.12);

  assert.ok(initialShake > 0);
  assert.notDeepEqual(first, second);
  assert.ok(Math.abs(first.pitch) <= 0.04);
  assert.ok(Math.abs(first.yaw) <= 0.04);
  assert.ok(Math.abs(first.roll) <= 0.06);

  updateCombatFeedback(feedback, 0.6);
  assert.ok(feedback.shake < initialShake * 0.4);
});
