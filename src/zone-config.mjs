function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

const DEFINITIONS = [
  {
    id: "ggo-harbor",
    name: "GGO 港湾数据区",
    shortName: "GGO HARBOR",
    order: 1,
    objectiveLabel: "战术上行链路",
    objectiveCount: 3,
    bounds: { minX: -54, maxX: 54, minZ: -49, maxZ: 54 },
    spawn: { x: 0, y: 0, z: 47 },
    objectivePoints: [
      { id: "A", x: -33, z: 16 },
      { id: "B", x: 22, z: 2 },
      { id: "C", x: -12, z: -21 }
    ],
    extraction: { x: 0, z: 47 },
    boss: {
      id: "noctis",
      name: "NOCTIS // 断界机兵",
      maxHealth: 720,
      phases: 2
    },
    enemySpawns: [
      { type: "hound", x: -28, z: 7 },
      { type: "gull", x: -17, z: 14 },
      { type: "hound", x: 32, z: 12 },
      { type: "gull", x: 17, z: 23 },
      { type: "hound", x: 7, z: -2 },
      { type: "gull", x: -5, z: 28 },
      { type: "bulwark", x: -26, z: -13 },
      { type: "hound", x: 27, z: -20 },
      { type: "gull", x: 9, z: -28 },
      { type: "hound", x: -5, z: -34 }
    ],
    environment: "harbor",
    mechanics: [{ id: "rain", type: "weather", element: null }]
  },
  {
    id: "alo-sky",
    name: "ALO 风之浮岛",
    shortName: "ALO SKY",
    order: 2,
    objectiveLabel: "风元素符文",
    objectiveCount: 3,
    bounds: { minX: -38, maxX: 38, minZ: -34, maxZ: 46 },
    spawn: { x: 0, y: 0, z: 40 },
    objectivePoints: [
      { id: "WIND-A", x: -25, z: 8 },
      { id: "WIND-B", x: 26, z: 3 },
      { id: "WIND-C", x: 0, z: -25 }
    ],
    extraction: { x: 0, z: 40 },
    boss: {
      id: "wind-guardian",
      name: "SYLPH GUARDIAN // 风之守卫",
      maxHealth: 780,
      phases: 2
    },
    enemySpawns: [
      { type: "gull", x: -28, z: 20 },
      { type: "gull", x: 28, z: 18 },
      { type: "hound", x: -18, z: -8 },
      { type: "hound", x: 18, z: -8 },
      { type: "gull", x: 0, z: -29 },
      { type: "bulwark", x: 24, z: -24 }
    ],
    environment: "floating-island",
    mechanics: [
      {
        id: "updraft-north",
        type: "updraft",
        x: 0,
        z: 23,
        radius: 7,
        lift: 11,
        height: 16
      },
      {
        id: "updraft-west",
        type: "updraft",
        x: -25,
        z: 8,
        radius: 6,
        lift: 10,
        height: 14
      },
      {
        id: "updraft-east",
        type: "updraft",
        x: 26,
        z: 3,
        radius: 6,
        lift: 10,
        height: 14
      },
      {
        id: "wind-runes",
        type: "objective-element",
        element: "wind"
      }
    ]
  },
  {
    id: "world-tree-core",
    name: "断界核心 / 世界树根",
    shortName: "WORLD TREE CORE",
    order: 3,
    objectiveLabel: "核心封印",
    objectiveCount: 2,
    bounds: { minX: -34, maxX: 34, minZ: -40, maxZ: 38 },
    spawn: { x: 0, y: 0, z: 36 },
    objectivePoints: [
      { id: "SEAL-A", x: -22, z: 8 },
      { id: "SEAL-B", x: 22, z: -14 }
    ],
    extraction: { x: 0, z: 36 },
    boss: {
      id: "yggdrasil-core",
      name: "YGGDRASIL CORE // 世界树核心",
      maxHealth: 980,
      phases: 2
    },
    enemySpawns: [
      { type: "hound", x: -16, z: 20 },
      { type: "hound", x: 16, z: 20 },
      { type: "gull", x: -25, z: -8 },
      { type: "gull", x: 25, z: -8 },
      { type: "bulwark", x: 0, z: -4 },
      { type: "bulwark", x: 0, z: -24 }
    ],
    environment: "world-tree-root",
    mechanics: [
      { id: "core-pulse", type: "pulse", interval: 4.5 },
      { id: "ascent", type: "vertical-ruin", steps: 6 }
    ]
  }
];

export const ZONES = freezeDeep(DEFINITIONS);
export const ZONE_IDS = Object.freeze(ZONES.map((zone) => zone.id));

export function getZoneById(id) {
  return ZONES.find((zone) => zone.id === id) ?? null;
}

function validatePoint(label, point, bounds, errors) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) {
    errors.push(`${label} has non-finite coordinates`);
    return;
  }
  if (
    point.x < bounds.minX ||
    point.x > bounds.maxX ||
    point.z < bounds.minZ ||
    point.z > bounds.maxZ
  ) {
    errors.push(`${label} is outside bounds`);
  }
}

export function validateZones(zones = ZONES) {
  const errors = [];
  const ids = new Set();
  const orders = [];
  for (const zone of zones) {
    if (ids.has(zone.id)) errors.push(`duplicate zone id: ${zone.id}`);
    ids.add(zone.id);
    orders.push(zone.order);
    if (!Number.isInteger(zone.objectiveCount) || zone.objectiveCount < 1) {
      errors.push(`${zone.id} has invalid objectiveCount`);
    }
    if (zone.objectivePoints.length !== zone.objectiveCount) {
      errors.push(`${zone.id} objective point count mismatch`);
    }
    validatePoint(`${zone.id} spawn`, zone.spawn, zone.bounds, errors);
    validatePoint(`${zone.id} extraction`, zone.extraction, zone.bounds, errors);
    for (const objective of zone.objectivePoints) {
      validatePoint(
        `${zone.id} objective ${objective.id}`,
        objective,
        zone.bounds,
        errors
      );
    }
    for (const enemy of zone.enemySpawns) {
      validatePoint(`${zone.id} enemy ${enemy.type}`, enemy, zone.bounds, errors);
    }
  }
  if (orders.join(",") !== orders.map((_, index) => index + 1).join(",")) {
    errors.push("zone order must be continuous");
  }
  return { valid: errors.length === 0, errors };
}
