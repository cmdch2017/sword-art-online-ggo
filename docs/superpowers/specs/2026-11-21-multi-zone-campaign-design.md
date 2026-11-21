# 刀剑神域 GGO：三区域连续战役设计

日期：2026-11-21

## 目标

把当前单区域 GGO 原型扩展为一条无需刷新页面即可连续游玩的三区域战役，同时保持单 HTML 构建方式。新增内容不是简单换色，而是让每个区域拥有独立的场景、目标、敌人组合、环境机制、撤离条件和通关状态。

公开仓库仍只包含原创代码、程序化资产、自动化测试和自有截图。角色模型、原作纹理、原作 BGM 和模型绑定不进入公开构建。

## 用户体验

一次完整战役按以下顺序进行：

1. `GGO 港湾数据区`：保留当前终端接入、NOCTIS Boss 战和撤离教学。
2. `ALO 风之浮岛`：使用浮岛气流、精灵魔法符文和风之守卫，完成空中区域目标。
3. `断界核心 / 世界树根`：进入纵向遗迹，解除核心封印并完成最终多阶段 Boss 战。
4. 完成第三区最终撤离后进入胜利结算。

区域切换时显示短暂的区域标题和任务提示，但不打开新页面、不重新加载游戏。玩家生命、弹药、魔法 MP、战役计时、击破数和弹反数跨区域延续；每个区域开始时可获得一次有限的补给，避免前一区残血导致后续不可玩。

## 区域定义

### 第一区：GGO 港湾数据区

- ID：`ggo-harbor`
- 目标数量：3 个上行终端。
- 环境机制：现有雨、湿地、港口设施和枪械战斗。
- 敌人：现有 `hound`、`gull`、`bulwark` 组合。
- 阶段：接入 3 个终端 -> 击破 `NOCTIS` -> 返回起点撤离。
- 区域完成：撤离信标确认后进入第二区，而不是结束整局。

### 第二区：ALO 风之浮岛

- ID：`alo-sky`
- 目标数量：3 个风元素符文锚点。
- 环境机制：
  - 可识别的上升气流区域会给空中玩家提供额外升力。
  - 浮岛边缘使用独立碰撞边界，不允许玩家通过旧港口世界边界移动。
  - 符文锚点对元素 `wind` 有反馈；玩家至少有两条可玩路径完成目标，避免必须精确命中。
- 敌人：风元素哨兵、远程浮游单位和一个风之守卫。
- 阶段：激活 3 个符文锚点 -> 击破风之守卫 -> 抵达浮空撤离环。
- 区域完成：进入第三区。

### 第三区：断界核心 / 世界树根

- ID：`world-tree-core`
- 目标数量：2 个核心封印。
- 环境机制：纵向阶梯、发光根系、逐渐增强的核心脉冲和掩体变化。
- 敌人：近距离守卫、远程炮台和最终 Boss `YGGDRASIL CORE`。
- 阶段：解除 2 个核心封印 -> 击破最终 Boss -> 抵达最终撤离点。
- Boss：至少两个阶段；第二阶段增加弹幕密度或攻击节奏，但必须保留可躲避的安全间隙。
- 区域完成：最终撤离后进入全局胜利结算。

## 状态模型

新增纯逻辑模块 `src/campaign-state.mjs`，与 Three.js 完全解耦。该模块负责“玩家在哪个区域、该区域目标完成多少、是否进入下一区、是否全局胜利”，不负责创建 Mesh 或读取 DOM。

建议导出：

```js
export const CAMPAIGN_PHASE = Object.freeze({
  OBJECTIVES: "objectives",
  BOSS: "boss",
  EXTRACTION: "extraction",
  VICTORY: "victory"
});

export function createCampaignState(zones);
export function advanceCampaign(campaign, event);
export function currentZone(campaign, zones);
```

状态至少包含：

```js
{
  zoneIndex: 0,
  phase: "objectives",
  objectivesDone: 0,
  completedZoneIds: [],
  finalVictory: false
}
```

事件规则：

- `objective` 只在该区 `OBJECTIVES` 阶段计数，达到目标数后进入 `BOSS`；若区域配置声明没有 Boss，则直接进入 `EXTRACTION`。
- `boss` 只在该区 `BOSS` 阶段生效，完成后进入 `EXTRACTION`。
- `extraction` 只在该区 `EXTRACTION` 阶段生效，完成后记录区域 ID。
- 还有下一区时，区域完成后重置 `zoneIndex`、`objectivesDone` 和阶段并开始下一区。
- 没有下一区时，进入 `VICTORY` 并设置 `finalVictory: true`。
- 非法阶段事件返回未改变的状态，重复完成事件不会重复计数。

保留现有 `createMissionState` / `advanceMission` 作为当前单区实现的兼容层也可以，但新区域逻辑不得继续把 `VICTORY` 硬编码在第一区撤离事件里。

## 区域配置

新增纯数据模块 `src/zone-config.mjs`。配置只描述区域，不直接持有 Three.js 对象：

```js
{
  id,
  name,
  shortName,
  order,
  objectiveLabel,
  objectiveCount,
  spawn: { x, y, z },
  objectivePoints: [{ id, x, z }],
  extraction: { x, z },
  boss: { id, name, maxHealth } | null,
  enemyPalette: [...],
  environment: "harbor" | "floating-island" | "world-tree-root"
}
```

区域配置必须通过单元测试验证：

- ID 唯一且顺序连续。
- 每个区域至少有一个目标和一个撤离点。
- 第一区保留 3 个终端目标。
- 第二区至少有一个风元素机制标识。
- 第三区配置最终 Boss，且只有最后一个区域完成时允许全局胜利。
- 所有坐标都是有限数值，并处于对应区域边界内。

## 运行时架构

`src/main.js` 继续作为唯一 Three.js 运行时，拆出以下职责：

1. `loadZone(zoneIndex)`：清理旧区域，应用配置，调用对应场景构建器，重置区域目标、敌人和撤离点。
2. `buildHarborZone()`：迁移现有港口环境、终端、敌人和 NOCTIS。
3. `buildFloatingIslandZone()`：创建浮岛几何体、气流区、符文锚点和风之守卫。
4. `buildWorldTreeZone()`：创建纵向遗迹、核心封印和最终 Boss。
5. `updateZoneMechanisms(dt, now)`：只运行当前区域的环境机制。
6. `completeZoneAndAdvance()`：调用战役状态层，显示区域过渡，加载下一区。

全局渲染器、相机、后处理、输入、武器和音频系统保持共享。区域专属对象统一挂在 `zoneRoot` 下；动态敌人、投射物、特效和目标继续挂在 `dynamicRoot` 下。区域切换必须清理：

- `zoneRoot` 的几何体、材质和纹理；
- `dynamicRoot` 中的敌人、目标、Boss、投射物和临时特效；
- 仍在播放的区域音源和环境计时器；
- 旧区域的交互目标、撤离点、碰撞体和气流区。

清理由一个明确的 `disposeZone()` 完成，禁止只把旧对象设为不可见。切换后检查对象数组为空，再由新区域构建器填充。

## 玩家与战斗延续

- 玩家控制、武器切换、魔法、敌人 AI 和后处理沿用现有系统。
- 区域配置只选择敌人组合和机制，不复制一套玩家控制器。
- 第二区必须让魔法模式有实际用途：风元素命中符文锚点触发额外进度或视觉反馈；其他元素仍能造成伤害，避免玩家卡死。
- 第三区 Boss 复用 Boss 通用血条和攻击投射物模型，但不复用 NOCTIS 的固定身份文案。
- 跨区时保留玩家位置以外的战役统计；进入新区后重置玩家位置、速度、攻击状态和区域交互进度。

## HUD 与反馈

在现有顶部目标区域加入：

- 当前区域序号和名称，例如 `02 // ALO 风之浮岛`；
- 当前区域目标标签，例如 `风元素符文 1/3`；
- 动态目标点进度，不再固定使用 `uplink-pips` 的 GGO 文案；
- 区域完成和加载过渡提示。

现有生命、能量、弹药、魔法、Boss 血条、交互提示、暂停和结算界面继续可用。区域标题不得遮挡手机端目标文字和虚拟按键。

## 调试接口

为浏览器验收提供只读调试快照：

```js
window.__danrenZoneDebug = () => ({
  zoneIndex,
  zoneId,
  phase,
  objectivesDone,
  objectiveCount,
  completedZoneIds,
  finalVictory,
  mechanics: [...],
  objectCounts: {
    enemies,
    projectiles,
    objectives,
    zoneObjects
  }
});
```

接口不提供“直接跳到胜利”的生产捷径；测试通过真实输入和现有状态推进事件完成区域切换。可以在测试环境中暴露受限的区域事件方法，但生产构建不应出现一键胜利按钮。

## 测试策略

按 TDD 顺序实施：

1. `tests/campaign-state.test.mjs`
   - 初始状态；
   - 目标计数上限；
   - Boss 到撤离；
   - 第一区撤离进入第二区；
   - 最后一区撤离才设置全局胜利；
   - 非法阶段和重复事件不改变状态。
2. `tests/zone-config.test.mjs`
   - 三区顺序、唯一 ID、坐标和机制配置合法；
   - 第一区仍是 3 个终端；
   - 第二区有风元素机制；
   - 第三区有最终 Boss。
3. `tests/browser-zones.mjs`
   - 启动公开构建；
   - 第一区完成终端、Boss 和撤离后进入第二区；
   - 检查切换后旧区域对象数量归零、第二区 HUD 和机制出现；
   - 第二区完成目标、守卫和撤离后进入第三区；
   - 第三区完成封印、Boss 和最终撤离后显示全局胜利；
   - 桌面和移动端均无页面错误、无外部素材请求。

若完整浏览器路线在无头 SwiftShader 下不稳定，必须保留状态层和场景切换层测试，并记录具体不可自动化的交互原因，不能把未验证写成已通过。

## 验收标准

- `npm test` 全部通过。
- `npm run build` 成功，`docs/index.html` 仍是单文件公开构建。
- 不刷新页面可以从 GGO 连续进入 ALO，再进入世界树根，最终完成全局胜利。
- 每次区域切换后旧区域的敌人、目标、投射物和区域几何体均被清理。
- 移动端触控、Gamepad、暂停、重开、画质和音量设置保持可用。
- 公开构建请求中不出现 PMX、原作纹理、原作 BGM 或其他私用素材。
- README 更新三区玩法、通关路线和测试命令。

## 非目标

- 不新增联网、账号、云存档或多人模式。
- 不把 Three.js 拆成多页面应用。
- 不在第一阶段重做角色模型、武器模型或原作音乐。
- 不公开分发任何未经授权的角色、纹理、动画或音频资源。
- 不为了追求画面堆叠而牺牲区域目标可读性和可通关性。
