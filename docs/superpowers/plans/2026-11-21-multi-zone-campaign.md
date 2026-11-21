# 三区域连续战役 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单区域 GGO 原型扩展为在同一个 HTML 中连续运行的 GGO、ALO、世界树根三区域战役，并在最终撤离后结算全局胜利。

**Architecture:** 新增与 Three.js 解耦的战役状态层和区域配置层；现有 `src/main.js` 作为共享渲染运行时，通过 `loadZone()` 和 `disposeZone()` 替换区域场景。三个区域复用玩家、武器、魔法、输入、音频和后处理，只替换几何体、环境机制、目标、敌人、Boss 和撤离点。

**Tech Stack:** JavaScript ES modules、Three.js 0.180、Web Audio API、Node.js test runner、esbuild、Playwright Core。

## Global Constraints

- 一次战役固定按 `ggo-harbor`、`alo-sky`、`world-tree-core` 顺序运行。
- 第一区必须有 3 个目标、Boss `NOCTIS` 和撤离阶段。
- 第二区必须有 3 个风元素符文锚点、可识别上升气流和守卫，并允许非风元素路径完成目标。
- 第三区必须有 2 个核心封印、两阶段最终 Boss `YGGDRASIL CORE` 和最终撤离。
- 跨区保留生命、弹药、魔法 MP、计时、击破数和弹反数；进入新区时玩家位置、速度、攻击状态和区域目标进度重置。
- 每次切换区域必须清理旧 `worldRoot` 几何体、材质，以及 `enemies`、`projectiles`、`terminals`、`transientEffects` 和区域音源。
- 公开构建不得包含或请求 PMX、原作纹理、原作 BGM、角色模型绑定或其他未授权资源。
- 不新增联网、账号、云存档、多人模式或新的 Three.js 页面。
- 只提交原创代码、程序化场景、自动化测试、README 和自有截图；禁止 `git add -A`。
- 训练辅助参数继续位于 `TRAINING_PROFILE`，不得在区域场景中复制另一套难度系统。

## File Structure

- Create `src/campaign-state.mjs`：只负责区域索引、阶段、目标计数、区域完成顺序和全局胜利。
- Create `src/zone-config.mjs`：定义三区顺序、边界、目标坐标、出生点、撤离点、Boss、敌人和机制数据，并提供只读校验。
- Modify `src/main.js`：接入战役状态，建立 `loadZone()`、`disposeZone()`、三个场景构建器、区域机制更新和测试调试快照。
- Modify `src/index.template.html`：加入区域编号/名称节点和 Boss 名称节点。
- Modify `src/styles.css`：保证区域标题、目标文字和移动端控制不重叠。
- Create `tests/campaign-state.test.mjs`：验证状态机和最终胜利边界。
- Create `tests/zone-config.test.mjs`：验证三区顺序、坐标、目标数、机制和最终 Boss。
- Create `tests/browser-zones.mjs`：验证跨三区场景切换、对象清理、HUD 和最终胜利。
- Modify `tests/browser-public.mjs`：验证公开版不请求私用素材，并检查桌面/移动端区域 HUD。
- Modify `tests/browser-playthrough.mjs`：把原来的单区终点改为三区完整路线。
- Modify `README.md`：补充三区玩法、通关路线、调试快照和测试命令。

---

### Task 1: 战役状态机

**Files:**
- Create: `src/campaign-state.mjs`
- Create: `tests/campaign-state.test.mjs`

**Interfaces:**
- Consumes: 区域配置数组，每项至少包含 `id`、`objectiveCount` 和 `boss`。
- Produces: `CAMPAIGN_PHASE`；`createCampaignState(zones)`；`advanceCampaign(campaign, event)`；`currentZone(campaign, zones)`。
- State shape: `{ zoneIndex, phase, objectivesDone, completedZoneIds, finalVictory, zoneIds, zoneObjectiveCounts, zoneBossFlags }`。

- [ ] **Step 1: 写失败测试**

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_PHASE,
  advanceCampaign,
  createCampaignState,
  currentZone
} from "../src/campaign-state.mjs";

const zones = [
  {
    id: "ggo-harbor",
    objectiveCount: 2,
    boss: { id: "noctis" }
  },
  {
    id: "alo-sky",
    objectiveCount: 1,
    boss: { id: "wind-guardian" }
  },
  {
    id: "world-tree-core",
    objectiveCount: 2,
    boss: { id: "yggdrasil-core" }
  }
];

test("campaign starts in the first zone objectives phase", () => {
  const campaign = createCampaignState(zones);

  assert.equal(campaign.zoneIndex, 0);
  assert.equal(campaign.phase, CAMPAIGN_PHASE.OBJECTIVES);
  assert.equal(campaign.objectivesDone, 0);
  assert.deepEqual(campaign.completedZoneIds, []);
  assert.equal(campaign.finalVictory, false);
  assert.equal(currentZone(campaign, zones).id, "ggo-harbor");
});

test("objective events clamp at the configured count and advance to boss", () => {
  const campaign = createCampaignState(zones);

  advanceCampaign(campaign, "objective");
  assert.equal(campaign.objectivesDone, 1);
  assert.equal(campaign.phase, CAMPAIGN_PHASE.OBJECTIVES);

  advanceCampaign(campaign, "objective");
  advanceCampaign(campaign, "objective");
  assert.equal(campaign.objectivesDone, 2);
  assert.equal(campaign.phase, CAMPAIGN_PHASE.BOSS);
});

test("boss completion opens extraction and extraction advances zones", () => {
  const campaign = createCampaignState(zones);
  advanceCampaign(campaign, "objective");
  advanceCampaign(campaign, "objective");

  advanceCampaign(campaign, "boss");
  assert.equal(campaign.phase, CAMPAIGN_PHASE.EXTRACTION);

  advanceCampaign(campaign, "extraction");
  assert.deepEqual(campaign.completedZoneIds, ["ggo-harbor"]);
  assert.equal(campaign.zoneIndex, 1);
  assert.equal(campaign.objectivesDone, 0);
  assert.equal(campaign.phase, CAMPAIGN_PHASE.OBJECTIVES);
  assert.equal(currentZone(campaign, zones).id, "alo-sky");
  assert.equal(campaign.finalVictory, false);
});

test("only the final zone extraction produces global victory", () => {
  const campaign = createCampaignState(zones);

  for (const [index, zone] of zones.entries()) {
    for (let objective = 0; objective < zone.objectiveCount; objective += 1) {
      advanceCampaign(campaign, "objective");
    }
    advanceCampaign(campaign, "boss");
    advanceCampaign(campaign, "extraction");
    if (index < zones.length - 1) {
      assert.equal(campaign.finalVictory, false);
    }
  }

  assert.equal(campaign.phase, CAMPAIGN_PHASE.VICTORY);
  assert.equal(campaign.finalVictory, true);
  assert.deepEqual(campaign.completedZoneIds, zones.map((zone) => zone.id));
  assert.equal(currentZone(campaign, zones), null);
});

test("invalid and repeated phase events do not mutate the campaign", () => {
  const campaign = createCampaignState(zones);
  const before = structuredClone(campaign);

  advanceCampaign(campaign, "boss");
  advanceCampaign(campaign, "extraction");
  assert.deepEqual(campaign, before);

  advanceCampaign(campaign, "objective");
  advanceCampaign(campaign, "objective");
  advanceCampaign(campaign, "boss");
  advanceCampaign(campaign, "boss");
  assert.equal(campaign.phase, CAMPAIGN_PHASE.EXTRACTION);
});

test("a zone without a boss proceeds directly from objectives to extraction", () => {
  const campaign = createCampaignState([
    { id: "no-boss", objectiveCount: 1, boss: null },
    { id: "final", objectiveCount: 1, boss: null }
  ]);

  advanceCampaign(campaign, "objective");
  assert.equal(campaign.phase, CAMPAIGN_PHASE.EXTRACTION);
  advanceCampaign(campaign, "boss");
  assert.equal(campaign.phase, CAMPAIGN_PHASE.EXTRACTION);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --test tests/campaign-state.test.mjs
```

Expected: FAIL，错误包含 `Cannot find module ... campaign-state.mjs`。

- [ ] **Step 3: 写最小实现**

```javascript
export const CAMPAIGN_PHASE = Object.freeze({
  OBJECTIVES: "objectives",
  BOSS: "boss",
  EXTRACTION: "extraction",
  VICTORY: "victory"
});

function assertZones(zones) {
  if (!Array.isArray(zones) || zones.length === 0) {
    throw new TypeError("campaign requires at least one zone");
  }
  for (const zone of zones) {
    if (!zone?.id || !Number.isInteger(zone.objectiveCount) || zone.objectiveCount < 1) {
      throw new TypeError("each campaign zone requires an id and positive objectiveCount");
    }
  }
}

export function createCampaignState(zones) {
  assertZones(zones);
  return {
    zoneIndex: 0,
    phase: CAMPAIGN_PHASE.OBJECTIVES,
    objectivesDone: 0,
    completedZoneIds: [],
    finalVictory: false,
    zoneIds: zones.map((zone) => zone.id),
    zoneObjectiveCounts: zones.map((zone) => zone.objectiveCount),
    zoneBossFlags: zones.map((zone) => Boolean(zone.boss))
  };
}

export function currentZone(campaign, zones) {
  return zones[campaign.zoneIndex] ?? null;
}

export function advanceCampaign(campaign, event) {
  if (!campaign || campaign.finalVictory) return campaign;
  const objectiveCount = campaign.zoneObjectiveCounts[campaign.zoneIndex];
  const hasBoss = campaign.zoneBossFlags[campaign.zoneIndex];

  if (event === "objective" && campaign.phase === CAMPAIGN_PHASE.OBJECTIVES) {
    campaign.objectivesDone = Math.min(objectiveCount, campaign.objectivesDone + 1);
    if (campaign.objectivesDone === objectiveCount) {
      campaign.phase = hasBoss
        ? CAMPAIGN_PHASE.BOSS
        : CAMPAIGN_PHASE.EXTRACTION;
    }
    return campaign;
  }

  if (event === "boss" && campaign.phase === CAMPAIGN_PHASE.BOSS) {
    campaign.phase = CAMPAIGN_PHASE.EXTRACTION;
    return campaign;
  }

  if (event === "extraction" && campaign.phase === CAMPAIGN_PHASE.EXTRACTION) {
    campaign.completedZoneIds.push(campaign.zoneIds[campaign.zoneIndex]);
    if (campaign.zoneIndex === campaign.zoneIds.length - 1) {
      campaign.phase = CAMPAIGN_PHASE.VICTORY;
      campaign.finalVictory = true;
      return campaign;
    }
    campaign.zoneIndex += 1;
    campaign.objectivesDone = 0;
    campaign.phase = CAMPAIGN_PHASE.OBJECTIVES;
  }

  return campaign;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
node --test tests/campaign-state.test.mjs
```

Expected: 6 tests PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/campaign-state.mjs tests/campaign-state.test.mjs
git commit -m "feat: add multi-zone campaign state"
```

---

### Task 2: 三区域配置和合法性校验

**Files:**
- Create: `src/zone-config.mjs`
- Create: `tests/zone-config.test.mjs`

**Interfaces:**
- Consumes: `CAMPAIGN_PHASE` 的语义，但不导入 Three.js。
- Produces: `ZONES`、`ZONE_IDS`、`getZoneById(id)`、`validateZones(zones)`。
- Each zone produces: `{ id, name, shortName, order, objectiveLabel, objectiveCount, bounds, spawn, objectivePoints, extraction, boss, enemySpawns, environment, mechanics }`。

- [ ] **Step 1: 写失败测试**

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import { ZONES, ZONE_IDS, getZoneById, validateZones } from "../src/zone-config.mjs";

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
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --test tests/zone-config.test.mjs
```

Expected: FAIL，错误包含 `Cannot find module ... zone-config.mjs`。

- [ ] **Step 3: 写配置和校验实现**

`src/zone-config.mjs` 的完整骨架和关键数据如下；三个配置块必须全部填写：

```javascript
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
    boss: { id: "noctis", name: "NOCTIS // 断界机兵", maxHealth: 720, phases: 2 },
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
    boss: { id: "wind-guardian", name: "SYLPH GUARDIAN // 风之守卫", maxHealth: 780, phases: 2 },
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
      { id: "updraft-north", type: "updraft", x: 0, z: 23, radius: 7, lift: 11, height: 16 },
      { id: "updraft-west", type: "updraft", x: -25, z: 8, radius: 6, lift: 10, height: 14 },
      { id: "updraft-east", type: "updraft", x: 26, z: 3, radius: 6, lift: 10, height: 14 },
      { id: "wind-runes", type: "objective-element", element: "wind" }
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
    boss: { id: "yggdrasil-core", name: "YGGDRASIL CORE // 世界树核心", maxHealth: 980, phases: 2 },
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
      validatePoint(`${zone.id} objective ${objective.id}`, objective, zone.bounds, errors);
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
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
node --test tests/zone-config.test.mjs
```

Expected: 6 tests PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/zone-config.mjs tests/zone-config.test.mjs
git commit -m "feat: define three-zone campaign data"
```

---

### Task 3: 区域场景生命周期和 GGO 连续推进

**Files:**
- Modify: `src/main.js:20-70`
- Modify: `src/main.js:205-430`
- Modify: `src/main.js:1165-1420`
- Modify: `src/main.js:2764-2945`
- Modify: `src/main.js:3599-3805`
- Modify: `src/main.js:5136-5528`
- Create: `tests/browser-zones.mjs`

**Interfaces:**
- Consumes: `CAMPAIGN_PHASE`、`createCampaignState()`、`advanceCampaign()`、`currentZone()`、`ZONES`。
- Produces: `loadZone(zoneIndex)`、`disposeZone()`、`createZoneObjectives(zone)`、`activateObjective(objective, source)`、`completeZoneAndAdvance()`、`window.__danrenZoneDebug()`。
- Test-only interface: URL 含 `zone-test=1` 时暴露 `window.__danrenZoneTest = { activateNextObjective, defeatBoss, completeExtraction, snapshot }`；不提供一键胜利。

- [ ] **Step 1: 写区域生命周期失败测试**

创建 `tests/browser-zones.mjs`，先只验证初始区、GGO 切换和对象清理，后续任务继续扩展：

```javascript
import { chromium } from "playwright-core";

const url =
  process.env.PUBLIC_URL ||
  "http://127.0.0.1:4173/docs/index.html?zone-test=1";
const failures = [];

function check(condition, message, details = "") {
  if (!condition) failures.push(details ? `${message}: ${details}` : message);
}

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding"
  ]
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.querySelector("#boot")?.classList.contains("done"),
    null,
    { timeout: 60000 }
  );
  await page.locator("#quality-select").evaluate((element) => {
    element.value = "low";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#start-button").click();
  await page.waitForFunction(
    () => window.__danrenZoneDebug?.().zoneId === "ggo-harbor",
    null,
    { timeout: 30000 }
  );

  const initial = await page.evaluate(() => window.__danrenZoneDebug());
  check(initial.phase === "objectives", "harbor did not start in objectives");
  check(initial.objectiveCount === 3, "harbor objective count is wrong");
  check(initial.objectCounts.objectives === 3, "harbor objective objects are missing");
  check(initial.objectCounts.enemies > 0, "harbor enemy objects are missing");

  await page.evaluate(async () => {
    const test = window.__danrenZoneTest;
    test.activateNextObjective();
    test.activateNextObjective();
    test.activateNextObjective();
    test.defeatBoss();
    test.completeExtraction();
  });
  await page.waitForFunction(
    () => window.__danrenZoneDebug?.().zoneId === "alo-sky",
    null,
    { timeout: 15000 }
  );

  const alo = await page.evaluate(() => window.__danrenZoneDebug());
  check(alo.zoneIndex === 1, "zone index did not advance to ALO");
  check(alo.phase === "objectives", "ALO did not reset to objectives");
  check(alo.objectCounts.objectives === 3, "ALO objective count is wrong");
  check(alo.objectCounts.projectiles === 0, "old projectiles survived zone transition");
  check(alo.completedZoneIds[0] === "ggo-harbor", "harbor was not recorded complete");
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("zone lifecycle passed");
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npm run serve
```

在第二个 PowerShell 中运行：

```powershell
node tests/browser-zones.mjs
```

Expected: FAIL，`window.__danrenZoneDebug` 不是函数。

- [ ] **Step 3: 替换任务状态并加入运行时区域状态**

在 `src/main.js` 顶部导入：

```javascript
import {
  CAMPAIGN_PHASE,
  advanceCampaign,
  createCampaignState,
  currentZone
} from "./campaign-state.mjs";
import { ZONES, getZoneById } from "./zone-config.mjs";
```

把固定 `WORLD_LIMIT` 改为可变值，并把 `mission` 改为战役状态：

```javascript
let WORLD_LIMIT = { ...ZONES[0].bounds };
let campaign = createCampaignState(ZONES);
let activeZone = ZONES[0];
let zoneRoot = null;
let zoneMechanics = [];
let zoneTransitionTimer = 0;
const terminals = [];
```

移除 `createMissionState` 和 `advanceMission` 导入。新增辅助函数：

```javascript
function getPhase() {
  return campaign.phase;
}

function getObjectiveCount() {
  return activeZone.objectiveCount;
}

function syncCampaignPhase() {
  if (campaign.phase === CAMPAIGN_PHASE.OBJECTIVES) {
    app.bossUnlockAt = Infinity;
  }
}
```

`window.__danrenStateDebug` 的 `mission` 改为：

```javascript
mission: {
  phase: campaign.phase,
  uplinksDone: campaign.objectivesDone,
  totalUplinks: activeZone.objectiveCount,
  bossDefeated: campaign.phase === CAMPAIGN_PHASE.EXTRACTION ||
    campaign.phase === CAMPAIGN_PHASE.VICTORY
},
zone: {
  index: campaign.zoneIndex,
  id: activeZone.id,
  name: activeZone.name,
  completedZoneIds: [...campaign.completedZoneIds]
}
```

增加只读调试接口：

```javascript
window.__danrenZoneDebug = () => ({
  zoneIndex: campaign.zoneIndex,
  zoneId: activeZone.id,
  phase: campaign.phase,
  objectivesDone: campaign.objectivesDone,
  objectiveCount: activeZone.objectiveCount,
  completedZoneIds: [...campaign.completedZoneIds],
  finalVictory: campaign.finalVictory,
  mechanics: zoneMechanics.map((mechanic) => ({
    id: mechanic.id,
    type: mechanic.type,
    element: mechanic.element || null
  })),
  objectCounts: {
    enemies: enemies.length,
    projectiles: projectiles.length,
    objectives: terminals.length,
    zoneObjects: zoneRoot?.children.length || 0
  }
});
```

- [ ] **Step 4: 实现 `disposeZone()` 和 `loadZone()`**

用下面的函数替换 `clearDynamicRoot()` 的区域职责，并保留一个独立动态清理函数：

```javascript
function clearDynamicEntities() {
  clearMagicChargeEffect();
  while (dynamicRoot.children.length > 0) {
    const child = dynamicRoot.children.pop();
    disposeObject3D(child);
  }
  enemies.length = 0;
  terminals.length = 0;
  projectiles.length = 0;
  transientEffects.length = 0;
  extractionPoint = null;
  boss = null;
  app.interactionTarget = null;
  app.interactionProgress = 0;
}

function disposeZone() {
  clearDynamicEntities();
  if (worldRoot) {
    scene.remove(worldRoot);
    disposeObject3D(worldRoot);
    worldRoot = null;
  }
  obstacleColliders.length = 0;
  obstacleBoxes.length = 0;
  cameraObstacles.length = 0;
  zoneMechanics = [];
  rain = null;
  rainData = [];
  rainSplash = null;
  dust = null;
  app.bossUnlockAt = Infinity;
  app.lightningIn = 9;
  app.lightning = 0;
}

function loadZone(zoneIndex) {
  const zone = ZONES[zoneIndex];
  if (!zone) throw new RangeError(`Unknown zone index ${zoneIndex}`);
  disposeZone();
  activeZone = zone;
  WORLD_LIMIT = { ...zone.bounds };
  worldRoot = new THREE.Group();
  worldRoot.name = `ZoneRoot:${zone.id}`;
  scene.add(worldRoot);
  zoneMechanics = zone.mechanics.map((mechanic) => ({ ...mechanic }));

  player.position.set(zone.spawn.x, zone.spawn.y, zone.spawn.z);
  player.velocity.set(0, 0, 0);
  player.verticalVelocity = 0;
  player.grounded = true;
  player.attack = null;
  player.attackQueued = false;
  player.hitSet.clear();
  player.invulnerable = Math.max(player.invulnerable, 1.2);
  app.cameraYaw = 0;
  app.cameraPitch = -0.12;
  app.interactionTarget = null;
  app.interactionProgress = 0;

  const builders = {
    harbor: buildHarborZone,
    "floating-island": buildFloatingIslandZone,
    "world-tree-root": buildWorldTreeZone
  };
  builders[zone.environment](zone);
  createZoneObjectives(zone);
  for (const spawn of zone.enemySpawns) {
    createEnemy(spawn.type, spawn.x, spawn.z, false);
  }
  createBoss(zone);
  createMissionPips();
  updateZoneHud();
}
```

`dynamicRoot` 继续在初始化和重置时创建一次，但 `loadZone()` 不重建它。`buildEnvironment()` 拆成共享光照初始化 `buildSharedLighting()` 和 `buildHarborZone(zone)`；雨、雨滴、尘埃、天空材质全部加入 `worldRoot`，不再加入 `scene`。

在 Task 3 中先建立供后续区域扩展的稳定基础接口；Task 4 和 Task 5 会分别替换占位场景：

```javascript
function updateZoneHud() {
  updateUi(0);
}

function updateZoneMechanisms() {}

function buildFloatingIslandZone(zone) {
  buildZonePlaceholder(zone);
}

function buildWorldTreeZone(zone) {
  buildZonePlaceholder(zone);
}

function buildZonePlaceholder(zone) {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(
      zone.bounds.maxX - zone.bounds.minX,
      0.5,
      zone.bounds.maxZ - zone.bounds.minZ
    ),
    createMetalMaterial(0x27353a, COLORS.teal, {
      metalness: 0.1,
      roughness: 0.78
    })
  );
  floor.position.set(
    (zone.bounds.minX + zone.bounds.maxX) / 2,
    -0.25,
    (zone.bounds.minZ + zone.bounds.maxZ) / 2
  );
  floor.receiveShadow = true;
  worldRoot.add(floor);
}
```

- [ ] **Step 5: 把第一区对象创建改为配置驱动**

`createZoneObjectives(zone)` 保留现有终端外观，用配置生成三类视觉语义：

```javascript
const OBJECTIVE_STYLE = {
  "ggo-harbor": { color: COLORS.amber, label: "上行链路" },
  "alo-sky": { color: 0x72e6cf, label: "风元素符文" },
  "world-tree-core": { color: 0xd9d27b, label: "核心封印" }
};

function createZoneObjectives(zone) {
  for (const objective of terminals) dynamicRoot.remove(objective.group);
  terminals.length = 0;
  const style = OBJECTIVE_STYLE[zone.id];
  zone.objectivePoints.forEach((definition, index) => {
    const group = new THREE.Group();
    group.position.set(definition.x, 0, definition.z);
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.48, 0),
      createEmissiveMaterial(style.color, 4.8)
    );
    core.position.y = 2.2;
    group.add(core);
    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.035, 6, 48),
      createEmissiveMaterial(style.color, 3.2)
    );
    ringA.position.y = 2.2;
    ringA.rotation.x = Math.PI / 2;
    group.add(ringA);
    const ringB = ringA.clone();
    ringB.rotation.y = Math.PI / 2;
    group.add(ringB);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.62, 15, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: 0.075,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    beam.position.y = 8;
    group.add(beam);
    const light = new THREE.PointLight(style.color, 14, 14, 2);
    light.position.y = 2.2;
    group.add(light);
    dynamicRoot.add(group);
    terminals.push({
      id: definition.id,
      index,
      label: style.label,
      color: style.color,
      group,
      core,
      ringA,
      ringB,
      column: null,
      lowerRing: ringB,
      beam,
      light,
      position: new THREE.Vector3(definition.x, 0, definition.z),
      activated: false,
      activationFlash: 0
    });
  });
}
```

`activateTerminal()` 改名为 `activateObjective(objective, source = "interact")`，每次先调用 `advanceCampaign(campaign, "objective")`，再根据返回值更新 HUD。目标达到 `BOSS` 阶段时解锁 Boss；无 Boss 区直接创建撤离点。

魔法投射物命中或爆炸范围内有未激活目标且 `projectile.element === MAGIC_ELEMENT.WIND` 时，调用：

```javascript
function tryActivateObjectiveWithMagic(projectile, center, radius) {
  if (projectile.element !== MAGIC_ELEMENT.WIND) return false;
  if (campaign.phase !== CAMPAIGN_PHASE.OBJECTIVES) return false;
  const objective = terminals.find((candidate) => {
    if (candidate.activated) return false;
    return Math.hypot(candidate.position.x - center.x, candidate.position.z - center.z) <= radius + 1.2;
  });
  if (!objective) return false;
  activateObjective(objective, "wind");
  return true;
}
```

该函数在 `detonateMagicProjectile()` 开头调用；近身长按 `E` 路径始终保留。

- [ ] **Step 6: 实现区域完成和测试适配器**

把 `completeMission()` 改为：

```javascript
function completeZoneBoss() {
  if (campaign.phase !== CAMPAIGN_PHASE.BOSS) return;
  advanceCampaign(campaign, "boss");
  app.bossUnlockAt = Infinity;
  createExtractionPoint(activeZone.extraction);
  showToast(`${activeZone.boss.name} 已击破 // 前往区域撤离点`, 3600);
}

function completeZoneAndAdvance() {
  if (campaign.phase !== CAMPAIGN_PHASE.EXTRACTION) return;
  const completedName = activeZone.shortName;
  advanceCampaign(campaign, "extraction");
  if (campaign.finalVictory) {
    window.setTimeout(() => finishGame(true), 500);
    return;
  }
  zoneTransitionTimer = 1.1;
  showToast(`${completedName} 完成 // 正在重构下一战区`, 1200);
  window.setTimeout(() => {
    loadZone(campaign.zoneIndex);
    showZoneTitle();
    showToast(`${activeZone.name} // ${activeZone.objectiveLabel} 0/${activeZone.objectiveCount}`, 2800);
  }, 900);
}
```

测试适配器必须通过真实状态函数推进：

```javascript
if (new URLSearchParams(window.location.search).has("zone-test")) {
  window.__danrenZoneTest = {
    activateNextObjective() {
      const objective = terminals.find((candidate) => !candidate.activated);
      if (objective) activateObjective(objective, "test");
    },
    defeatBoss() {
      if (boss?.active && !boss.dying) {
        boss.health = 0;
        boss.dying = true;
        boss.deathTimer = Math.min(boss.deathTimer, 0.05);
      }
    },
    completeExtraction() {
      if (campaign.phase === CAMPAIGN_PHASE.EXTRACTION) completeZoneAndAdvance();
    },
    snapshot() {
      return window.__danrenZoneDebug();
    }
  };
}
```

- [ ] **Step 7: 运行区域生命周期测试**

Run:

```powershell
node tests/browser-zones.mjs
```

Expected: PASS，输出 `zone lifecycle passed`。

- [ ] **Step 8: 运行回归测试和构建**

Run:

```powershell
npm test
npm run build
```

Expected: 所有单元测试 PASS；构建输出 `docs/index.html` 且无 esbuild 错误。

- [ ] **Step 9: 提交**

```powershell
git add src/main.js tests/browser-zones.mjs
git commit -m "feat: add zone scene lifecycle"
```

---

### Task 4: ALO 风之浮岛场景、上升气流和风之守卫

**Files:**
- Modify: `src/main.js`
- Modify: `tests/browser-zones.mjs`

**Interfaces:**
- Consumes: `loadZone()`、`createEnemy()`、`createBoss()`、`activateObjective()`。
- Produces: `buildFloatingIslandZone(zone)`、`updateZoneMechanisms(dt, now)` 的 ALO 分支、`getZoneFloorHeight(x, z)` 的 ALO 分支。

- [ ] **Step 1: 扩展浏览器测试到 ALO 机制**

在 `tests/browser-zones.mjs` 的 ALO 断言后加入：

```javascript
check(
  alo.mechanics.some((mechanic) => mechanic.type === "updraft"),
  "ALO updraft mechanic is missing"
);
check(
  alo.mechanics.some((mechanic) => mechanic.element === "wind"),
  "ALO wind objective mechanic is missing"
);
check(
  documentText.includes("ALO 风之浮岛"),
  "ALO zone HUD title is missing"
);
check(alo.objectCounts.objectives === 3, "ALO rune count is wrong");
check(alo.objectCounts.enemies >= 4, "ALO guardians are missing");
```

在读取 `alo` 的同时读取 DOM：

```javascript
const documentText = await page.locator("#hud").innerText();
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node tests/browser-zones.mjs
```

Expected: FAIL，因为 ALO 机制数组为空或 HUD 仍是 GGO。

- [ ] **Step 3: 实现浮岛几何和区域光照**

新增完整构建函数：

```javascript
function buildFloatingIslandZone(zone) {
  scene.userData.skyMaterial = createSky();
  hemisphereLight.color.setHex(0x9ed8df);
  hemisphereLight.groundColor.setHex(0x132734);
  hemisphereLight.intensity = 1.8;
  directionLight.color.setHex(0xffe1b2);
  directionLight.intensity = 3.5;
  directionLight.position.set(-30, 46, 18);

  const islandMaterial = createMetalMaterial(0x3b8c77, 0x8af1d8, {
    metalness: 0.08,
    roughness: 0.72
  });
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x6e8f78,
    roughness: 0.82,
    metalness: 0.12
  });
  for (const [x, z, radius, height] of [
    [0, 10, 22, 3],
    [-26, 8, 10, 2.4],
    [26, 3, 10, 2.4],
    [0, -25, 13, 2.8]
  ]) {
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.58, height, 12),
      islandMaterial
    );
    island.position.set(x, -height / 2, z);
    island.receiveShadow = true;
    island.castShadow = true;
    worldRoot.add(island);
    const underside = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.56, height * 2.2, 12),
      stoneMaterial
    );
    underside.rotation.z = Math.PI;
    underside.position.set(x, -height * 1.45, z);
    worldRoot.add(underside);
  }

  const bridgeMaterial = new THREE.MeshStandardMaterial({
    color: 0xb9d8c6,
    roughness: 0.62,
    metalness: 0.18
  });
  for (const [x, z, width, depth, rotation] of [
    [-13, 9, 24, 4.2, 0.1],
    [13, 7, 24, 4.2, -0.1],
    [0, -10, 4.5, 28, 0]
  ]) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(width, 0.42, depth), bridgeMaterial);
    bridge.position.set(x, -0.18, z);
    bridge.rotation.y = rotation;
    bridge.receiveShadow = true;
    worldRoot.add(bridge);
  }

  for (const mechanic of zone.mechanics.filter((item) => item.type === "updraft")) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(mechanic.radius, 0.12, 8, 72),
      createEmissiveMaterial(0x71f5d8, 3.2)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(mechanic.x, 0.08, mechanic.z);
    worldRoot.add(ring);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(mechanic.radius * 0.82, mechanic.radius, mechanic.height, 24, 5, true),
      new THREE.MeshBasicMaterial({
        color: 0x78f4d8,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    column.position.set(mechanic.x, mechanic.height / 2, mechanic.z);
    worldRoot.add(column);
  }
  buildDust();
}
```

ALO 不调用 `buildRain()` 和 `buildRainSplash()`；`buildDust()` 把粒子加入当前 `worldRoot`。

- [ ] **Step 4: 实现上升气流和浮岛边界**

在 `updatePlayer()` 内，把固定地面判定替换为动态区域地面：

```javascript
const floorHeight = getZoneFloorHeight(player.position.x, player.position.z);
if (player.position.y <= floorHeight) {
  player.position.y = floorHeight;
  player.verticalVelocity = 0;
  player.grounded = true;
}
```

新增：

```javascript
function getZoneFloorHeight() {
  return 0;
}

function updateUpdraftMechanic(mechanic, dt) {
  const distance = Math.hypot(
    player.position.x - mechanic.x,
    player.position.z - mechanic.z
  );
  if (distance > mechanic.radius || player.position.y > mechanic.height) return;
  const influence = 1 - distance / mechanic.radius;
  player.verticalVelocity = Math.min(
    mechanic.lift,
    player.verticalVelocity + (mechanic.lift * (0.55 + influence) - 9) * dt
  );
  if (player.position.y > 0.15) player.grounded = false;
  player.position.y = Math.min(mechanic.height, player.position.y);
}
```

`updateZoneMechanisms(dt, now)` 的 ALO 分支对每个 `updraft` 调用 `updateUpdraftMechanic()`。浮岛边界由配置 bounds 控制；在 ALO 中 `getZoneFloorHeight()` 对四个圆形浮岛和三条桥面返回 `0`，其他位置返回 `-18`，玩家跌落后受到 24 点伤害并回到 `activeZone.spawn`。

```javascript
function getZoneFloorHeight(x, z) {
  if (activeZone.environment !== "floating-island") return 0;
  const islands = [
    { x: 0, z: 10, radius: 21 },
    { x: -26, z: 8, radius: 9 },
    { x: 26, z: 3, radius: 9 },
    { x: 0, z: -25, radius: 12 }
  ];
  if (islands.some((island) => Math.hypot(x - island.x, z - island.z) <= island.radius)) {
    return 0;
  }
  const bridges = [
    { minX: -25, maxX: -1, minZ: 6, maxZ: 12 },
    { minX: 1, maxX: 25, minZ: 4, maxZ: 10 },
    { minX: -2.4, maxX: 2.4, minZ: -25, maxZ: 3 }
  ];
  return bridges.some((bridge) =>
    x >= bridge.minX && x <= bridge.maxX && z >= bridge.minZ && z <= bridge.maxZ
  ) ? 0 : -18;
}

function recoverFromFalling() {
  if (player.position.y > -17) return;
  damagePlayer(24, new THREE.Vector3(activeZone.spawn.x, 0, activeZone.spawn.z));
  player.position.set(activeZone.spawn.x, activeZone.spawn.y, activeZone.spawn.z);
  player.velocity.set(0, 0, 0);
  player.verticalVelocity = 0;
  player.grounded = true;
}
```

在 `updateGame()` 中调用 `updateZoneMechanisms(dt, now)` 和 `recoverFromFalling()`。

- [ ] **Step 5: 强化第二区敌人和风之魔法反馈**

给 `enemyDefinitions` 增加 `sylph` 和 `floating-eye`：

```javascript
sylph: {
  health: 72,
  speed: 3.8,
  detect: 32,
  attackRange: 24,
  attackDelay: 1.48,
  damage: 10,
  color: 0x70f0d1,
  scale: 0.96
},
"floating-eye": {
  health: 64,
  speed: 2.7,
  detect: 34,
  attackRange: 30,
  attackDelay: 1.75,
  damage: 12,
  color: 0xa6ecff,
  scale: 1.08
}
```

把 ALO 配置的 `gull` 替换为 `floating-eye`，把两个 `hound` 替换为 `sylph`。风元素命中目标时增加额外风环：

```javascript
function spawnWindObjectiveFeedback(objective) {
  spawnShockwave(
    objective.position.clone().setY(0.08),
    0.5,
    5.8,
    0x70f0d1,
    0.72,
    false
  );
  spawnBurst(objective.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 0x70f0d1, 36, 8, 0.72);
}
```

`activateObjective(objective, "wind")` 时调用该反馈并把 HUD 提示改为“风元素共鸣”。

- [ ] **Step 6: 运行测试**

Run:

```powershell
node tests/browser-zones.mjs
npm test
npm run build
```

Expected: 浏览器测试通过 ALO 机制断言；单元测试和构建通过。

- [ ] **Step 7: 提交**

```powershell
git add src/main.js tests/browser-zones.mjs
git commit -m "feat: add ALO floating island zone"
```

---

### Task 5: 世界树根、最终 Boss 两阶段和全局胜利

**Files:**
- Modify: `src/main.js`
- Modify: `tests/browser-zones.mjs`

**Interfaces:**
- Consumes: `completeZoneAndAdvance()`、`createBoss(zone)`、`updateBoss()`、`campaign.finalVictory`。
- Produces: `buildWorldTreeZone(zone)`、最终 Boss 身份文案、核心脉冲机制、`finishGame(true)` 的三区结算文案。

- [ ] **Step 1: 扩展浏览器测试到世界树根和最终胜利**

把测试适配器路线继续写到三区结束：

```javascript
await page.evaluate(() => {
  const test = window.__danrenZoneTest;
  test.activateNextObjective();
  test.activateNextObjective();
  test.activateNextObjective();
  test.defeatBoss();
  test.completeExtraction();
});
await page.waitForFunction(
  () => window.__danrenZoneDebug?.().zoneId === "world-tree-core",
  null,
  { timeout: 15000 }
);

const core = await page.evaluate(() => window.__danrenZoneDebug());
check(core.zoneIndex === 2, "zone index did not advance to world tree");
check(core.objectiveCount === 2, "core seal count is wrong");
check(core.mechanics.some((mechanic) => mechanic.type === "pulse"), "core pulse is missing");
check(core.objectCounts.projectiles === 0, "ALO projectiles survived transition");

await page.evaluate(() => {
  const test = window.__danrenZoneTest;
  test.activateNextObjective();
  test.activateNextObjective();
  test.defeatBoss();
  test.completeExtraction();
});
await page.waitForFunction(
  () => window.__danrenZoneDebug?.().finalVictory === true,
  null,
  { timeout: 15000 }
);
await page.waitForFunction(
  () => document.querySelector("#end-screen")?.classList.contains("hidden") === false,
  null,
  { timeout: 15000 }
);

const final = await page.evaluate(() => window.__danrenZoneDebug());
check(final.phase === "victory", "campaign did not reach victory");
check(final.completedZoneIds.length === 3, "not all zones were recorded complete");
check(final.objectCounts.enemies === 0, "final boss scene did not clear entities");
await page.screenshot({ path: "artifacts/three-zone-victory.png" });
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node tests/browser-zones.mjs
```

Expected: FAIL，第三区最终 Boss 或最终胜利断言失败。

- [ ] **Step 3: 实现世界树根场景和核心脉冲**

新增构建函数：

```javascript
function buildWorldTreeZone(zone) {
  scene.userData.skyMaterial = createSky();
  hemisphereLight.color.setHex(0x4d5b63);
  hemisphereLight.groundColor.setHex(0x120c08);
  hemisphereLight.intensity = 1.05;
  directionLight.color.setHex(0xffc877);
  directionLight.intensity = 2.55;
  directionLight.position.set(18, 52, -14);

  const rootMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b2a20,
    roughness: 0.82,
    metalness: 0.08,
    emissive: 0x180b04,
    emissiveIntensity: 0.32
  });
  const coreMaterial = createEmissiveMaterial(0xe4cf74, 3.4);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * TAU;
    const root = new THREE.Mesh(
      new THREE.CylinderGeometry(
        randomRange(0.32, 0.7),
        randomRange(1.0, 2.2),
        randomRange(9, 18),
        6
      ),
      rootMaterial
    );
    root.position.set(
      Math.cos(angle) * randomRange(7, 29),
      randomRange(3, 8),
      Math.sin(angle) * randomRange(7, 34)
    );
    root.rotation.z = Math.cos(angle) * randomRange(0.25, 0.65);
    root.rotation.x = Math.sin(angle) * randomRange(0.2, 0.55);
    root.castShadow = true;
    root.receiveShadow = true;
    worldRoot.add(root);
  }
  for (let step = 0; step < 6; step += 1) {
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(8 - step * 0.45, 9 - step * 0.5, 0.36, 10),
      createMetalMaterial(0x27251f, 0xd7c66d, {
        metalness: 0.35,
        roughness: 0.64
      })
    );
    platform.position.set((step % 2 === 0 ? -1 : 1) * step, step * 1.1, 12 - step * 7);
    platform.receiveShadow = true;
    worldRoot.add(platform);
  }
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 7.5, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xf2d778,
      transparent: true,
      opacity: 0.075,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  column.position.set(0, 15, -30);
  worldRoot.add(column);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 1), coreMaterial);
  crystal.position.set(0, 9, -31);
  worldRoot.add(crystal);
  buildDust();
}
```

`updateWorldTreeMechanic()` 按 `core-pulse` 间隔产生：

```javascript
function updateWorldTreeMechanic(dt, now) {
  const pulse = zoneMechanics.find((mechanic) => mechanic.type === "pulse");
  if (!pulse) return;
  pulse.nextAt ??= now + pulse.interval * 1000;
  if (now < pulse.nextAt) return;
  pulse.nextAt = now + pulse.interval * 1000;
  spawnShockwave(
    new THREE.Vector3(0, 0.08, -20),
    0.8,
    26,
    0xe2cb70,
    1.1,
    true
  );
  if (
    player.position.y < 1.1 &&
    Math.hypot(player.position.x, player.position.z + 20) > 7
  ) {
    damagePlayer(9, new THREE.Vector3(0, 0, -20));
  }
}
```

- [ ] **Step 4: 让 Boss 创建和身份配置驱动**

`createBoss(zone)` 使用 `zone.boss.maxHealth`、`zone.boss.name` 和区域颜色：

```javascript
const accent = zone.id === "world-tree-core"
  ? 0xe5cb6a
  : zone.id === "alo-sky"
    ? 0x74efd0
    : COLORS.danger;
const bossHealth = zone.boss.maxHealth;
boss = {
  id: zone.boss.id,
  name: zone.boss.name,
  accent,
  group,
  armor,
  torso,
  head,
  chest,
  coreLight,
  leftArm,
  rightArm,
  leftLeg,
  rightLeg,
  sword,
  targetBeam,
  health: bossHealth,
  maxHealth: bossHealth,
  phase: 1,
  active: false,
  dying: false,
  deathTimer: 0,
  attackCooldown: 2.4,
  attackIndex: 0,
  hitFlash: 0,
  chargeTime: 0,
  moveAngle: 0,
  activatedAt: 0
};
```

`activateBoss()` 和阶段提示使用 `boss.name`。`updateBoss()` 在 `zone.id === "world-tree-core"` 的第二阶段把弹幕间隔设为 `0.95`，并每四次攻击插入一次 `bossRadialAttack(10, 0.36)`；第一区保持现有节奏。最终 Boss 的 `completeZoneBoss()` 走同一区域推进函数，只有 `advanceCampaign()` 设置 `finalVictory` 后才调用 `finishGame(true)`。

- [ ] **Step 5: 更新最终结算文案**

把 `finishGame(true)` 的文案改为：

```javascript
dom.endKicker.textContent = "全域撤离完成";
dom.endTitle.textContent = "世界树核心已静默";
dom.endCopy.textContent =
  "GGO 港湾、ALO 风之浮岛与世界树根的核心链路已全部切断。三区战役完成。";
```

失败文案保留训练建议，但补上“使用上升气流绕开地面封锁、核心脉冲前躲到根系掩体后”的区域提示。

- [ ] **Step 6: 运行测试**

Run:

```powershell
node tests/browser-zones.mjs
npm test
npm run build
```

Expected: 三区状态断言、最终胜利和构建全部通过。

- [ ] **Step 7: 提交**

```powershell
git add src/main.js tests/browser-zones.mjs
git commit -m "feat: add world tree final zone"
```

---

### Task 6: HUD、移动端布局和 README

**Files:**
- Modify: `src/index.template.html:25-35`
- Modify: `src/index.template.html:91-96`
- Modify: `src/styles.css:340-410`
- Modify: `src/styles.css:1170-1260`
- Modify: `src/main.js:5174-5278`
- Modify: `README.md`
- Modify: `tests/browser-public.mjs`

**Interfaces:**
- Consumes: `campaign`、`activeZone`、`getPhase()`。
- Produces: `#zone-label`、`#boss-name`、配置驱动的 pips 和交互文案、三区 README。

- [ ] **Step 1: 写失败 HUD 测试**

在 `tests/browser-public.mjs` 的桌面启动后加入：

```javascript
const zoneHud = await desktop.evaluate(() => ({
  zoneLabel: document.querySelector("#zone-label")?.textContent || "",
  objective: document.querySelector("#objective-text")?.textContent || "",
  pips: document.querySelectorAll("#uplink-pips i").length
}));
check(
  zoneHud.zoneLabel.includes("01") && zoneHud.zoneLabel.includes("GGO"),
  "desktop zone label is missing",
  JSON.stringify(zoneHud)
);
check(zoneHud.pips === 3, "desktop objective pips do not match harbor");
```

移动端启动后加入：

```javascript
const mobileLayout = await mobile.evaluate(() => {
  const zone = document.querySelector("#zone-label")?.getBoundingClientRect();
  const objective = document.querySelector("#objective-text")?.getBoundingClientRect();
  const touch = document.querySelector("#touch-controls")?.getBoundingClientRect();
  return {
    zoneText: document.querySelector("#zone-label")?.textContent || "",
    objectiveText: document.querySelector("#objective-text")?.textContent || "",
    overlaps:
      Boolean(zone && objective) &&
      !(zone.right <= objective.left || zone.left >= objective.right ||
        zone.bottom <= objective.top || zone.top >= objective.bottom),
    objectiveAboveTouch:
      Boolean(objective && touch) && objective.bottom < touch.top
  };
});
check(mobileLayout.zoneText.includes("GGO"), "mobile zone label is missing");
check(!mobileLayout.overlaps, "mobile zone label overlaps objective");
check(mobileLayout.objectiveAboveTouch, "mobile objective overlaps touch controls");
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npm run build
npm run serve
node tests/browser-public.mjs
```

Expected: FAIL，`#zone-label` 不存在。

- [ ] **Step 3: 更新 HTML 和 HUD**

目标块改为：

```html
<div class="objective-wrap">
  <span id="zone-label" class="zone-label">01 // GGO 港湾数据区</span>
  <strong id="objective-text">接入三组战术上行链路</strong>
  <small id="objective-guide">扫描最近的上行终端</small>
  <div id="uplink-pips" class="uplink-pips"></div>
</div>
```

Boss 名称改为节点：

```html
<strong id="boss-name">NOCTIS // 断界机兵</strong>
```

在 `dom` 中加入 `zoneLabel: $("zone-label")` 和 `bossName: $("boss-name")`。

`updateUi()` 使用：

```javascript
dom.zoneLabel.textContent =
  `${String(campaign.zoneIndex + 1).padStart(2, "0")} // ${activeZone.name}`;
dom.objective.textContent =
  campaign.phase === CAMPAIGN_PHASE.OBJECTIVES
    ? `${activeZone.objectiveLabel} ${campaign.objectivesDone}/${activeZone.objectiveCount}`
    : campaign.phase === CAMPAIGN_PHASE.BOSS
      ? `击破 ${activeZone.boss.name}`
      : campaign.phase === CAMPAIGN_PHASE.EXTRACTION
        ? `前往 ${activeZone.shortName} 撤离点`
        : "全域任务完成";
dom.bossName.textContent = boss?.name || activeZone.boss?.name || "区域守门者";
```

`createMissionPips()` 使用 `activeZone.objectiveCount` 和 `campaign.objectivesDone`。`updateObjectiveGuide()` 使用目标 `label`、当前区撤离坐标和 `boss.name`，不再写死终端、NOCTIS 或 `(0,47)`。

- [ ] **Step 4: 增加响应式样式**

```css
.zone-label {
  display: block;
  color: var(--teal);
  font: 700 10px/1.35 var(--font-mono);
  letter-spacing: 0;
}

@media (max-width: 760px) {
  .zone-label {
    max-width: 62vw;
    overflow: hidden;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .boss-hud {
    top: 96px;
    width: calc(100vw - 32px);
  }
}
```

- [ ] **Step 5: 更新 README**

把“通关流程”替换为以下完整内容：

```markdown
## 三区通关流程

一次战役在同一页面连续完成，不刷新页面：

1. `GGO 港湾数据区`：接入 A/B/C 三个上行终端，击破 NOCTIS，返回 `(0, 47)` 撤离。
2. `ALO 风之浮岛`：激活三个风元素符文，击破风之守卫，进入浮空撤离环。上升气流可以把角色托到高处；风元素命中符文会立即产生共鸣，其他元素和长按 `E` 仍可完成目标。
3. `断界核心 / 世界树根`：解除两个核心封印，击破两阶段 `YGGDRASIL CORE`，最后返回入口撤离。

生命、弹药、MP、作战时间、击破数和弹反数跨区保留。新区会重置玩家位置、速度、攻击状态和目标进度，并提供一次有限补给。
```

技术结构增加：

```markdown
- `src/campaign-state.mjs`：三区阶段、目标、区域完成和全局胜利状态机。
- `src/zone-config.mjs`：三区顺序、出生点、目标、敌人、Boss、边界和环境机制。
```

测试命令增加：

```powershell
npm test
npm run build
npm run serve
node tests/browser-zones.mjs
node tests/browser-public.mjs
node tests/browser-playthrough.mjs
```

- [ ] **Step 6: 运行测试**

Run:

```powershell
npm test
npm run build
node tests/browser-public.mjs
node tests/browser-zones.mjs
```

Expected: 单元测试、公开版桌面/移动端、三区生命周期测试全部 PASS。

- [ ] **Step 7: 提交**

```powershell
git add src/index.template.html src/styles.css src/main.js README.md tests/browser-public.mjs
git commit -m "feat: expose three-zone campaign HUD"
```

---

### Task 7: 三区真实路线验收和发布检查

**Files:**
- Modify: `tests/browser-playthrough.mjs`
- Modify: `docs/index.html` through build output

**Interfaces:**
- Consumes: `window.__danrenStateDebug()`、`window.__danrenZoneDebug()`、真实键盘鼠标输入。
- Produces: 完整桌面路线测试、桌面/移动端无错误验收、更新后的公开单文件构建。

- [ ] **Step 1: 写完整路线失败测试**

把 `tests/browser-playthrough.mjs` 第一区原先等待 `ended && victory` 的位置改为等待 ALO：

```javascript
await page.waitForFunction(
  () => window.__danrenZoneDebug?.().zoneId === "alo-sky",
  null,
  { timeout: 15000 }
);
const aloZone = await page.evaluate(() => window.__danrenZoneDebug());
check(aloZone.phase === "objectives", "ALO did not start objectives");
check(aloZone.objectCounts.projectiles === 0, "harbor projectiles survived");
```

然后加入 ALO 路线辅助函数：

```javascript
async function clearObjectives() {
  for (const objective of (await snapshot()).terminals.filter((item) => !item.activated)) {
    await moveTo(objective.x, objective.z, { tolerance: 1.4 });
    await clearNearby(24, 2);
    await page.keyboard.down("KeyE");
    try {
      await page.waitForFunction(
        (objectiveId) =>
          window.__danrenStateDebug?.().terminals.find(
            (candidate) => candidate.id === objectiveId
          )?.activated === true,
        objective.id,
        { timeout: 5000 }
      );
    } finally {
      await page.keyboard.up("KeyE");
    }
  }
}

async function defeatActiveBoss(timeout = 25000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const state = await snapshot();
    if (state.ended || state.mission.phase === "extraction") return;
    if (!state.boss?.active || state.boss.dying) {
      await page.waitForTimeout(120);
      continue;
    }
    await reloadIfNeeded();
    await page.mouse.down({ button: "left" });
    try {
      for (let burst = 0; burst < 10; burst += 1) {
        const aiming = await snapshot();
        if (!aiming.boss?.active || aiming.boss.dying) break;
        await setLookAt(aiming.boss);
        await page.waitForTimeout(65);
      }
    } finally {
      await page.mouse.up({ button: "left" });
    }
  }
}
```

用 `clearObjectives()` 和 `defeatActiveBoss()` 完成 ALO 三个符文、守卫和撤离，再完成世界树两个封印、最终 Boss 和最终撤离。

最后断言：

```javascript
const finalState = await snapshot();
const finalZone = await page.evaluate(() => window.__danrenZoneDebug());
check(finalZone.finalVictory === true, "three-zone campaign did not finish");
check(finalZone.completedZoneIds.length === 3, "zone completion history is incomplete");
check(finalState.ended && finalState.victory, "end screen did not report final victory");
await page.screenshot({ path: "artifacts/three-zone-public-playthrough.png" });
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node tests/browser-playthrough.mjs
```

Expected: FAIL，旧断言仍把第一次撤离当成整局结束。

- [ ] **Step 3: 运行实现后的完整测试**

Run:

```powershell
npm test
npm run build
node tests/browser-zones.mjs
node tests/browser-public.mjs
node tests/browser-playthrough.mjs
```

Expected:

- `npm test` 全部 PASS。
- `npm run build` 输出 `Built docs/index.html`，无 bundle 错误。
- `browser-zones` 输出 `three-zone lifecycle passed`。
- `browser-public` 输出 `public browser smoke passed`。
- `browser-playthrough` 输出 `three-zone public playthrough passed`。

若无头 SwiftShader 下真实完整路线因渲染性能超时，保留失败日志和具体卡点，单独运行场景生命周期测试；不得把未完成的真实路线写成已通过。

- [ ] **Step 4: 检查公开仓库素材边界**

Run:

```powershell
git status --short
git ls-files assets models 刀剑神域GGO.html
Select-String -Path docs/index.html -Pattern 'pmx|kirito-sugaki|ggo-bgm|data:audio' -CaseSensitive:$false
```

Expected:

- `git ls-files` 没有输出。
- `Select-String` 没有输出。
- `git status` 只包含本次代码、测试、README 和公开构建文件。

- [ ] **Step 5: 提交公开构建和验收**

```powershell
git add src/main.js src/index.template.html src/styles.css src/campaign-state.mjs src/zone-config.mjs
git add tests/campaign-state.test.mjs tests/zone-config.test.mjs tests/browser-zones.mjs tests/browser-public.mjs tests/browser-playthrough.mjs
git add README.md docs/index.html
git commit -m "feat: ship three-zone campaign"
```

- [ ] **Step 6: 推送前复核**

Run:

```powershell
git show --stat --oneline HEAD
git status --short --branch
```

Expected: 最新提交只包含计划列出的文件；未跟踪的私用素材和无关工作区文件仍未提交。

```powershell
git push origin codex/zone-campaign
```

Expected: 分支推送成功，GitHub 公开仓库可查看三区实现。

## Self-Review

- Spec coverage:
  - GGO、ALO、世界树根三区顺序：Task 1、Task 2、Task 3、Task 4、Task 5。
  - 无刷新连续运行和跨区统计保留：Task 3、Task 5。
  - 风元素符文和上升气流：Task 4。
  - 两阶段最终 Boss 和最终撤离：Task 5。
  - 真实销毁旧区域几何体、材质、敌人和投射物：Task 3。
  - HUD、移动端布局、README 和公开构建素材检查：Task 6、Task 7。
- Placeholder scan: 不含 TBD、TODO、稍后实现或“类似上一项”；每个代码或配置任务都有实际代码、命令和预期结果。
- Type consistency: `campaign.phase`、`campaign.objectivesDone`、`campaign.completedZoneIds`、`campaign.finalVictory`、`activeZone`、`loadZone()`、`disposeZone()`、`completeZoneAndAdvance()` 在任务间名称一致。
