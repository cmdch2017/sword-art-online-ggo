export const TRAINING_PROFILE = Object.freeze({
  label: "训练辅助",
  playerMaxHealth: 180,
  healthRegenDelay: 3,
  healthRegenPerSecond: 12,
  postHitInvulnerability: 0.32,
  spawnShieldSeconds: 3,
  terminalRepair: 50,
  gun: Object.freeze({
    damage: 26,
    headshotDamage: 42,
    bossDamage: 26,
    bossHeadshotDamage: 35,
    fireCooldown: 0.095,
    aimAssistHipAngle: 0.18,
    aimAssistAdsAngle: 0.3,
    aimAssistRange: 72
  }),
  blade: Object.freeze({
    reach: Object.freeze([4.15, 4.15, 4.75]),
    damage: Object.freeze([58, 70, 100]),
    duration: Object.freeze([0.3, 0.3, 0.38])
  }),
  enemy: Object.freeze({
    damageScale: 0.55,
    projectileSpeedScale: 0.82,
    attackDelayScale: 1.12,
    spread: Object.freeze({
      gull: 0.075,
      bulwark: 0.105
    })
  }),
  bossMaxHealth: 720
});

function vectorLength(x, y, z) {
  return Math.hypot(x, y, z);
}

export function pickAimAssistTarget(
  origin,
  direction,
  candidates,
  { maxAngle = 0.18, maxDistance = 72 } = {}
) {
  const directionLength = vectorLength(direction.x, direction.y, direction.z);
  if (directionLength <= 1e-6 || maxAngle <= 0 || maxDistance <= 0) return null;

  const dirX = direction.x / directionLength;
  const dirY = direction.y / directionLength;
  const dirZ = direction.z / directionLength;
  const minimumDot = Math.cos(Math.min(maxAngle, Math.PI));
  let best = null;

  candidates.forEach((candidate, index) => {
    const dx = candidate.x - origin.x;
    const dy = candidate.y - origin.y;
    const dz = candidate.z - origin.z;
    const distance = vectorLength(dx, dy, dz);
    if (distance <= 1e-6 || distance > maxDistance) return;

    const dot = (dx * dirX + dy * dirY + dz * dirZ) / distance;
    if (dot < minimumDot) return;

    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    const score = angle / maxAngle + (distance / maxDistance) * 0.08;
    if (best && score >= best.score) return;

    best = {
      index,
      candidate,
      angle,
      distance,
      score,
      x: candidate.x,
      y: candidate.y,
      z: candidate.z
    };
  });

  return best;
}
