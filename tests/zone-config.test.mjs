import assert from "node:assert/strict";
import test from "node:test";

import {
  ZONES,
  ZONE_IDS,
  getZoneById,
  validateZones
} from "../src/zone-config.mjs";

function pointInBounds(point, bounds) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.z) &&
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.z >= bounds.minZ &&
    point.z <= bounds.maxZ
  );
}

test("three zones have unique ids and continuous order", () => {
  assert.deepEqual(ZONE_IDS, ["ggo-harbor", "alo-sky", "world-tree-core"]);
  assert.equal(new Set(ZONES.map((zone) => zone.id)).size, 3);
  assert.deepEqual(ZONES.map((zone) => zone.order), [1, 2, 3]);
  assert.equal(validateZones().valid, true);
});

test("every configured coordinate is finite and inside its zone bounds", () => {
  for (const zone of ZONES) {
    assert.equal(pointInBounds(zone.spawn, zone.bounds), true, zone.id);
    assert.equal(pointInBounds(zone.extraction, zone.bounds), true, zone.id);
    for (const objective of zone.objectivePoints) {
      assert.equal(pointInBounds(objective, zone.bounds), true, objective.id);
    }
    for (const enemy of zone.enemySpawns) {
      assert.equal(pointInBounds(enemy, zone.bounds), true, zone.id);
    }
  }
});

test("harbor keeps three terminals and a boss extraction chain", () => {
  const harbor = getZoneById("ggo-harbor");
  assert.equal(harbor.objectiveCount, 3);
  assert.deepEqual(harbor.objectivePoints.map((point) => point.id), ["A", "B", "C"]);
  assert.equal(harbor.boss.id, "noctis");
  assert.equal(harbor.environment, "harbor");
});

test("ALO declares wind objectives, updraft mechanics and a guardian", () => {
  const alo = getZoneById("alo-sky");
  assert.equal(alo.objectiveCount, 3);
  assert.equal(alo.mechanics.some((mechanic) => mechanic.type === "updraft"), true);
  assert.equal(alo.mechanics.some((mechanic) => mechanic.element === "wind"), true);
  assert.equal(alo.boss.id, "wind-guardian");
  assert.equal(alo.environment, "floating-island");
});

test("world tree is final and owns the two-phase final boss", () => {
  const worldTree = getZoneById("world-tree-core");
  assert.equal(worldTree.order, ZONES.length);
  assert.equal(worldTree.objectiveCount, 2);
  assert.equal(worldTree.boss.id, "yggdrasil-core");
  assert.equal(worldTree.boss.phases, 2);
  assert.equal(worldTree.environment, "world-tree-root");
});

test("invalid zone duplicates and out-of-bounds points are reported", () => {
  const invalid = structuredClone(ZONES);
  invalid[1].id = invalid[0].id;
  invalid[1].spawn.x = invalid[1].bounds.maxX + 100;
  const result = validateZones(invalid);

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.includes("duplicate zone id")), true);
  assert.equal(result.errors.some((error) => error.includes("outside bounds")), true);
});
