import assert from "node:assert/strict";
import test from "node:test";

import {
  MISSION_PHASE,
  WEAPON_MODE,
  advanceMission,
  circleVsRect,
  clamp,
  createMissionState,
  createWeaponState,
  nextBladeCombo,
  parryWindowOpen,
  reflectProjectile,
  resolveCircleRect,
  switchWeaponMode,
  tickWeapon
} from "../src/core.mjs";

test("clamp keeps values inside the supplied range", () => {
  assert.equal(clamp(-4, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(clamp(14, 0, 10), 10);
});

test("circleVsRect detects overlap without mutating the circle", () => {
  const circle = { x: 2, z: 2, radius: 1 };
  const rect = { minX: 2.5, maxX: 5, minZ: 1, maxZ: 4 };

  assert.equal(circleVsRect(circle, rect), true);
  assert.deepEqual(circle, { x: 2, z: 2, radius: 1 });
});

test("resolveCircleRect pushes the circle along the shortest axis", () => {
  const circle = { x: 2.1, z: 2, radius: 1 };
  const rect = { minX: 3, maxX: 6, minZ: 0, maxZ: 4 };
  const result = resolveCircleRect(circle, rect);

  assert.equal(result.x, 2);
  assert.equal(result.z, 2);
  assert.equal(result.collided, true);
});

test("weapon switching never keeps a partially spent reload active", () => {
  const gun = createWeaponState();
  gun.ammo = 8;
  gun.reloadRemaining = 0.7;

  const blade = switchWeaponMode(gun, WEAPON_MODE.BLADE);
  assert.equal(blade.mode, WEAPON_MODE.BLADE);
  assert.equal(blade.reloadRemaining, 0);
  assert.equal(blade.ammo, 8);
});

test("weapon switching supports the ALO magic casting mode", () => {
  const weapon = createWeaponState();
  const magic = switchWeaponMode(weapon, WEAPON_MODE.MAGIC);

  assert.equal(magic.mode, WEAPON_MODE.MAGIC);
  assert.equal(magic.reloadRemaining, 0);
  assert.equal(magic.fireCooldown, 0);
});

test("reload completes after its duration and refills the magazine", () => {
  const weapon = createWeaponState();
  weapon.ammo = 3;
  weapon.reloadRemaining = 1.2;

  tickWeapon(weapon, 1.19);
  assert.ok(Math.abs(weapon.reloadRemaining - 0.01) < 1e-9);
  assert.equal(weapon.ammo, 3);

  tickWeapon(weapon, 0.02);
  assert.equal(weapon.reloadRemaining, 0);
  assert.equal(weapon.ammo, weapon.magSize);
  assert.equal(weapon.reserve, weapon.reserveMax - (weapon.magSize - 3));
});

test("blade combo cycles from the final strike back to the first", () => {
  assert.equal(nextBladeCombo(0), 1);
  assert.equal(nextBladeCombo(1), 2);
  assert.equal(nextBladeCombo(2), 0);
});

test("parry window accepts an incoming shot inside the timing window", () => {
  assert.equal(parryWindowOpen(100, 100, 0.22), true);
  assert.equal(parryWindowOpen(100, 80, 0.22), true);
  assert.equal(parryWindowOpen(100, -200, 0.22), false);
});

test("a parried projectile reverses direction and becomes player-owned", () => {
  const projectile = {
    owner: "enemy",
    x: 10,
    z: -4,
    vx: 10,
    vz: -4,
    speed: 18,
    damage: 14,
    reflected: false
  };

  const result = reflectProjectile(projectile, { x: 0, z: 0 });
  assert.equal(result.owner, "player");
  assert.equal(result.reflected, true);
  assert.ok(result.vx > 0);
  assert.ok(result.vz < 0);
  assert.ok(result.damage > projectile.damage);
});

test("mission requires extraction after the boss before victory", () => {
  const mission = createMissionState(2);
  assert.equal(mission.phase, MISSION_PHASE.UPLINKS);

  advanceMission(mission, "uplink");
  assert.equal(mission.uplinksDone, 1);
  assert.equal(mission.phase, MISSION_PHASE.UPLINKS);

  advanceMission(mission, "uplink");
  assert.equal(mission.uplinksDone, 2);
  assert.equal(mission.phase, MISSION_PHASE.BOSS);

  advanceMission(mission, "boss");
  assert.equal(mission.phase, MISSION_PHASE.EXTRACTION);
  assert.equal(mission.bossDefeated, true);

  advanceMission(mission, "extraction");
  assert.equal(mission.phase, MISSION_PHASE.VICTORY);
});
