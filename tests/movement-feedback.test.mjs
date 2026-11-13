import assert from "node:assert/strict";
import test from "node:test";

import {
  createMovementFeedback,
  updateMovementFeedback
} from "../src/movement-feedback.mjs";

test("movement feedback keeps the camera still while the player is idle", () => {
  const feedback = createMovementFeedback();
  const frame = updateMovementFeedback(feedback, 1 / 60, {
    speed: 0,
    grounded: true
  });

  assert.equal(frame.step, null);
  assert.equal(frame.landing, null);
  assert.equal(frame.bobY, 0);
  assert.equal(frame.roll, 0);
});

test("walking emits alternating left and right footstep events", () => {
  const feedback = createMovementFeedback();
  const feet = [];

  for (let index = 0; index < 180; index += 1) {
    const frame = updateMovementFeedback(feedback, 1 / 60, {
      speed: 5.2,
      grounded: true
    });
    if (frame.step) feet.push(frame.step.side);
  }

  assert.ok(feet.length >= 4, `expected several footsteps, got ${feet.length}`);
  assert.notEqual(feet[0], feet[1]);
  assert.equal(feet[0], feet[2]);
  assert.ok(Math.abs(feedback.phase) > 0);
});

test("faster and sprinting movement produces stronger, quicker steps", () => {
  function sample(speed, sprinting) {
    const feedback = createMovementFeedback();
    const steps = [];
    for (let index = 0; index < 60; index += 1) {
      const frame = updateMovementFeedback(feedback, 1 / 60, {
        speed,
        sprinting,
        grounded: true
      });
      if (frame.step) steps.push(frame.step);
    }
    return steps;
  }

  const walking = sample(3.8, false);
  const sprinting = sample(7.2, true);
  assert.ok(sprinting.length > walking.length);
  assert.ok(sprinting[0].intensity > walking[0].intensity);
});

test("landing fires once and its camera dip settles over time", () => {
  const feedback = createMovementFeedback();
  updateMovementFeedback(feedback, 1 / 60, {
    speed: 4,
    grounded: false,
    impactSpeed: 7.4
  });

  const landing = updateMovementFeedback(feedback, 1 / 60, {
    speed: 0,
    grounded: true,
    impactSpeed: 7.4
  });
  const after = updateMovementFeedback(feedback, 0.2, {
    speed: 0,
    grounded: true
  });

  assert.ok(landing.landing);
  assert.equal(after.landing, null);
  assert.ok(Math.abs(landing.landingDip) > Math.abs(after.landingDip));
});

test("reduced motion lowers camera bob without suppressing footstep events", () => {
  function sample(reducedMotion) {
    const feedback = createMovementFeedback();
    let step = null;
    let maxBob = 0;
    for (let index = 0; index < 45; index += 1) {
      const frame = updateMovementFeedback(feedback, 1 / 60, {
        speed: 5,
        grounded: true,
        reducedMotion
      });
      step ||= frame.step;
      maxBob = Math.max(maxBob, Math.abs(frame.bobY));
    }
    return { step, maxBob };
  }

  const normal = sample(false);
  const reduced = sample(true);
  assert.ok(normal.step);
  assert.ok(reduced.step);
  assert.ok(reduced.maxBob < normal.maxBob * 0.35);
});
