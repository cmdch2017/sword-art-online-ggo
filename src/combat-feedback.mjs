function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createCombatFeedback() {
  return {
    pitch: 0,
    yaw: 0,
    roll: 0,
    hold: 0,
    burst: 0,
    recoilPhase: 0.37,
    shake: 0,
    bloom: 0,
    crosshair: 0,
    shots: 0
  };
}

export function fireCombatFeedback(
  feedback,
  {
    aiming = false,
    crouching = false,
    sprinting = false,
    airborne = false,
    moving = 0
  } = {},
  random = Math.random
) {
  const sample = clamp(Number(random()), 0, 1);
  const accuracyScale =
    (aiming ? 0.58 : 1) *
    (crouching ? 0.85 : 1) *
    (sprinting ? 1.18 : 1) *
    (airborne ? 1.32 : 1);
  const burstFalloff = feedback.burst < 9 ? 1 : 0.38;
  const pitchKick =
    0.0068 * burstFalloff * accuracyScale * (0.85 + sample * 0.3);
  const horizontalPattern =
    feedback.burst < 4
      ? (sample - 0.5) * 0.0022
      : Math.sin(feedback.burst * 0.57 + feedback.recoilPhase) * 0.0042 +
        (sample - 0.5) * 0.002;
  const yawKick = horizontalPattern * accuracyScale;

  feedback.shots += 1;
  feedback.burst += 1;
  feedback.pitch = clamp(feedback.pitch + pitchKick, 0, 0.095);
  feedback.yaw = clamp(feedback.yaw + yawKick, -0.032, 0.032);
  feedback.roll = clamp(feedback.roll - yawKick * 1.8, -0.038, 0.038);
  feedback.hold = 0.09;
  feedback.shake = Math.min(0.85, feedback.shake + 0.12 * accuracyScale);
  feedback.bloom = Math.min(1, feedback.bloom + 0.17);
  feedback.crosshair = Math.min(1, feedback.crosshair + 0.34);

  const movementSpread = clamp(moving / 6.4, 0, 1) * 0.0055;
  const spread =
    (aiming ? 0.0014 : 0.0065) *
      (crouching ? 0.72 : 1) +
    movementSpread +
    (airborne ? 0.007 : 0) +
    feedback.bloom * 0.0018;

  return {
    pitchKick,
    yawKick,
    shake: 0.12 * accuracyScale,
    spread,
    bloom: feedback.bloom,
    crosshair: feedback.crosshair
  };
}

export function updateCombatFeedback(feedback, dt) {
  const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const heldTime = Math.min(feedback.hold, safeDt);
  const recoveryTime = Math.max(0, safeDt - heldTime);
  feedback.hold = Math.max(0, feedback.hold - safeDt);

  if (recoveryTime > 0) {
    const recovery = Math.exp(-6.5 * recoveryTime);
    feedback.pitch *= recovery;
    feedback.yaw *= recovery;
    feedback.roll *= recovery;
    feedback.burst = Math.max(0, feedback.burst - recoveryTime * 7);
  }

  feedback.shake *= Math.exp(-1.7 * safeDt);
  feedback.bloom *= Math.exp(-8 * safeDt);
  feedback.crosshair *= Math.exp(-10 * safeDt);
  return feedback;
}

export function sampleCombatShake(feedback, elapsed) {
  const amplitude = clamp(feedback.shake, 0, 1) ** 2;
  return {
    pitch:
      amplitude *
      0.03 *
      (Math.sin(elapsed * 43.1) + 0.6 * Math.sin(elapsed * 71.7 + 1.3)),
    yaw:
      amplitude *
      0.03 *
      (Math.sin(elapsed * 37.3 + 2.1) + 0.6 * Math.sin(elapsed * 83.9)),
    roll:
      amplitude *
      0.045 *
      (Math.sin(elapsed * 29.7 + 0.7) + 0.5 * Math.sin(elapsed * 61.3 + 4))
  };
}

export function hitCombatFeedback({
  enemy = false,
  boss = false,
  headshot = false,
  kill = false
} = {}) {
  return {
    shake: enemy
      ? headshot
        ? 0.07
        : 0.035
      : boss
        ? 0.045
        : 0.012,
    crosshair: kill ? 0.8 : enemy || boss ? 0.42 : 0.12,
    pulse: headshot || kill ? 1 : enemy || boss ? 0.65 : 0.25
  };
}
