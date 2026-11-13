export const WEAPON_MODE = Object.freeze({
  GUN: "gun",
  BLADE: "blade",
  MAGIC: "magic"
});

export const MISSION_PHASE = Object.freeze({
  UPLINKS: "uplinks",
  BOSS: "boss",
  EXTRACTION: "extraction",
  VICTORY: "victory"
});

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function circleVsRect(circle, rect) {
  const closestX = clamp(circle.x, rect.minX, rect.maxX);
  const closestZ = clamp(circle.z, rect.minZ, rect.maxZ);
  const dx = circle.x - closestX;
  const dz = circle.z - closestZ;
  return dx * dx + dz * dz < circle.radius * circle.radius;
}

export function resolveCircleRect(circle, rect) {
  if (!circleVsRect(circle, rect)) {
    return { x: circle.x, z: circle.z, collided: false };
  }

  const left = circle.x + circle.radius - rect.minX;
  const right = rect.maxX - (circle.x - circle.radius);
  const top = circle.z + circle.radius - rect.minZ;
  const bottom = rect.maxZ - (circle.z - circle.radius);
  const smallest = Math.min(left, right, top, bottom);
  let x = circle.x;
  let z = circle.z;

  if (smallest === left) x = rect.minX - circle.radius;
  else if (smallest === right) x = rect.maxX + circle.radius;
  else if (smallest === top) z = rect.minZ - circle.radius;
  else z = rect.maxZ + circle.radius;

  return { x, z, collided: true };
}

export function createWeaponState() {
  return {
    mode: WEAPON_MODE.GUN,
    ammo: 30,
    magSize: 30,
    reserve: 120,
    reserveMax: 120,
    reloadRemaining: 0,
    reloadDuration: 1.2,
    fireCooldown: 0,
    combo: 0
  };
}

export function switchWeaponMode(weapon, mode) {
  if (
    mode !== WEAPON_MODE.GUN &&
    mode !== WEAPON_MODE.BLADE &&
    mode !== WEAPON_MODE.MAGIC
  ) {
    return { ...weapon };
  }

  return {
    ...weapon,
    mode,
    reloadRemaining: 0,
    fireCooldown: 0
  };
}

export function tickWeapon(weapon, dt) {
  weapon.fireCooldown = Math.max(0, weapon.fireCooldown - dt);
  if (weapon.reloadRemaining <= 0) return weapon;

  weapon.reloadRemaining = Math.max(0, weapon.reloadRemaining - dt);
  if (weapon.reloadRemaining > 0) return weapon;

  const missing = weapon.magSize - weapon.ammo;
  const loaded = Math.min(missing, weapon.reserve);
  weapon.ammo += loaded;
  weapon.reserve -= loaded;
  return weapon;
}

export function nextBladeCombo(combo) {
  return (combo + 1) % 3;
}

export function parryWindowOpen(now, blockPressedAt, windowSeconds) {
  const elapsedSeconds = Math.abs(now - blockPressedAt) / 1000;
  return elapsedSeconds <= windowSeconds;
}

export function reflectProjectile(projectile, origin) {
  const dx = projectile.x - origin.x;
  const dz = projectile.z - origin.z;
  const length = Math.hypot(dx, dz) || 1;
  const speed = Math.max(projectile.speed * 1.35, 20);

  return {
    ...projectile,
    owner: "player",
    reflected: true,
    damage: Math.round(projectile.damage * 1.8),
    speed,
    vx: (dx / length) * speed,
    vz: (dz / length) * speed
  };
}

export function createMissionState(totalUplinks = 3) {
  return {
    phase: MISSION_PHASE.UPLINKS,
    totalUplinks,
    uplinksDone: 0,
    bossDefeated: false
  };
}

export function advanceMission(mission, event) {
  if (event === "uplink" && mission.phase === MISSION_PHASE.UPLINKS) {
    mission.uplinksDone = Math.min(mission.totalUplinks, mission.uplinksDone + 1);
    if (mission.uplinksDone >= mission.totalUplinks) {
      mission.phase = MISSION_PHASE.BOSS;
    }
  }

  if (event === "boss" && mission.phase === MISSION_PHASE.BOSS) {
    mission.bossDefeated = true;
    mission.phase = MISSION_PHASE.EXTRACTION;
  }

  if (event === "extraction" && mission.phase === MISSION_PHASE.EXTRACTION) {
    mission.phase = MISSION_PHASE.VICTORY;
  }

  return mission;
}
