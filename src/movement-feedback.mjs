const TWO_PI = Math.PI * 2;
const STRIDE_LENGTH = Object.freeze({
  walk: 1.55,
  sprint: 2.1,
  crouch: 1.05
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createMovementFeedback() {
  return {
    phase: 0,
    stepProgress: 0,
    stepIndex: 0,
    lastFoot: null,
    previousGrounded: true,
    airImpactSpeed: 0,
    landingDip: 0,
    bobX: 0,
    bobY: 0,
    roll: 0
  };
}

export function updateMovementFeedback(
  feedback,
  dt,
  {
    speed = 0,
    grounded = true,
    sprinting = false,
    crouching = false,
    strafe = 0,
    impactSpeed = 0,
    reducedMotion = false
  } = {}
) {
  const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const safeSpeed = grounded ? Math.max(0, Number.isFinite(speed) ? speed : 0) : 0;
  const motionScale = reducedMotion ? 0.18 : 1;
  const strideLength = crouching
    ? STRIDE_LENGTH.crouch
    : sprinting
      ? STRIDE_LENGTH.sprint
      : STRIDE_LENGTH.walk;
  const speedWeight = clamp(safeSpeed / 6.4, 0, 1);

  let landing = null;
  if (!grounded) {
    feedback.previousGrounded = false;
    feedback.airImpactSpeed = Math.max(
      feedback.airImpactSpeed,
      Math.abs(Number.isFinite(impactSpeed) ? impactSpeed : 0)
    );
  } else {
    if (!feedback.previousGrounded) {
      const force = clamp(feedback.airImpactSpeed / 7.5, 0.25, 1.25);
      feedback.landingDip = 0.2 * force * motionScale;
      landing = {
        force,
        intensity: force
      };
    }
    feedback.previousGrounded = true;
    feedback.airImpactSpeed = 0;
  }

  const previousStep = Math.floor(feedback.stepProgress);
  feedback.stepProgress += (safeSpeed * safeDt * 2) / strideLength;
  const nextStep = Math.floor(feedback.stepProgress);
  let step = null;
  if (grounded && safeSpeed > 0.55 && nextStep > previousStep) {
    feedback.stepIndex += 1;
    const side = feedback.stepIndex % 2 === 0 ? "left" : "right";
    const intensity =
      clamp(safeSpeed / 6.4, 0.3, 1) *
      (sprinting ? 1.25 : 1) *
      (crouching ? 0.55 : 1);
    step = {
      side,
      intensity,
      sprinting,
      crouching
    };
    feedback.lastFoot = side;
  }

  const phase = ((feedback.stepProgress % 4096) + 4096) % 4096;
  feedback.phase = phase === 0 ? 0 : phase * Math.PI;
  const bobWeight = speedWeight * (sprinting ? 1.9 : 1) * motionScale;
  feedback.bobY = bobWeight === 0 ? 0 : -Math.cos(feedback.phase) * 0.024 * bobWeight;
  feedback.bobX = bobWeight === 0 ? 0 : Math.sin(feedback.phase) * 0.013 * bobWeight;
  const strafeRoll = clamp(strafe, -1, 1) * 0.02;
  feedback.roll = bobWeight === 0 && strafeRoll === 0
    ? 0
    : (Math.sin(feedback.phase) * 0.012 + strafeRoll) * motionScale;
  feedback.landingDip *= Math.exp(-9 * safeDt);

  return {
    step,
    landing,
    phase: feedback.phase,
    bobX: feedback.bobX,
    bobY: feedback.bobY,
    roll: feedback.roll,
    landingDip: feedback.landingDip,
    motionScale
  };
}
