# 刀剑神域 GGO

一个使用 Three.js 和 WebGL2 编写的非官方、非商业 3D FPS 学习项目。它不是一张预设动画或孤立的视觉 Demo，而是把实时游戏循环、玩家控制、敌人状态、目标交互、程序化材质、后处理和音频反馈组合在一起的可运行原型。

公开版只包含原创代码、程序化场景和合成音效，不包含原作角色模型、动画、纹理、音乐或其他第三方美术资源。项目名称中使用 `刀剑神域` 和 `GGO` 仅用于说明学习主题；相关商标和世界观权利归各自权利人所有。

## 立即运行

需要 Node.js 18 或更高版本。

```powershell
npm install
npm run build
npm run serve
```

然后打开 `http://127.0.0.1:4173/docs/index.html`。

公开版默认不加载音乐。进入页面后可以在标题页或暂停菜单选择你合法持有的本地音频，音频只在当前浏览器中播放，不会上传到服务器。

## 操作

| 输入 | 功能 |
| --- | --- |
| `WASD` | 移动 |
| 鼠标 | 视角 |
| 鼠标左键 | 射击 / 光刃攻击 / 魔法蓄力 |
| 鼠标右键 | 瞄准 / 格挡 |
| `1` / `2` / `3` | 枪械 / 光刃 / 精灵魔法 |
| `Q` | 循环武器 |
| `R` | 换弹；魔法模式下循环元素 |
| `E` | 接入终端；完成三组链路后进入 Boss 区域 |
| `Space` | 跳跃 |
| `Shift` | 冲刺 |
| `C` | 蹲伏 |
| `Esc` | 暂停 |

触屏设备会显示虚拟摇杆和攻击、跳跃、格挡、魔法、元素、蹲伏按钮。标准 Gamepad 也会被轮询处理。

## 通关流程

进入战区后，前往地图中的三个终端并按住 `E` 完成接入。三组链路都断开后，前往中央区域击破 `NOCTIS // 断界机兵`，再返回出生点完成撤离。

终端参考坐标：

| 目标 | 坐标 |
| --- | --- |
| 终端 A | `(-33, 16)` |
| 终端 B | `(22, 2)` |
| 终端 C | `(-12, -21)` |
| Boss | `(0, -42)` |
| 撤离点 | `(0, 47)` |

## 技术结构

- `src/main.js`：游戏循环、玩家控制、敌人和 Boss、目标交互、武器、魔法、输入、音频反馈与渲染管线。
- `src/core.mjs`：纯逻辑层面的任务、武器和弹反状态。
- `src/magic-state.mjs`：火、冰、风、雷四元素的蓄力、MP、冷却和投射物状态。
- `src/combat-feedback.mjs`：后坐力、镜头反馈、准星扩散和命中反馈。
- `src/movement-feedback.mjs`：步态相位、脚步事件、身体起伏和落地反馈。
- `src/bgm-controller.mjs`：本地 BGM 的加载、播放、暂停和错误状态。
- `src/model-loader.js`：可选的本地角色模型适配层；公开构建不会调用它。
- `src/vendor/mmd`：来自 Three.js 示例的 MMD 适配代码，遵循 MIT 许可证。

渲染部分包含程序化金属、湿润地面、裂缝、积水、雨滴和天空材质；后处理包含环境光遮蔽、Bloom、FXAA、自动曝光、ACES/软胶片色调映射、色彩分级、胶片颗粒和暗角。音效通过 Web Audio API 合成，不依赖公开 BGM 文件。

## 构建版本

```powershell
npm test
npm run build
node tests/browser-public.mjs
```

公开构建输出到 `docs/index.html`，适合直接作为 GitHub Pages 的静态入口。

如果本地拥有合法使用权的私人学习资源，可以自行准备 `assets/ggo-bgm.mp3` 和 `models/manifest.json`，然后执行：

```powershell
npm run build:private
npm run serve:private
```

私人构建输出到根目录的 `刀剑神域GGO.html`。该文件、模型、音乐和清单都已被 `.gitignore` 排除，不应提交到公开仓库。

## 许可证与素材边界

原创代码和程序化资产采用 [MIT License](LICENSE)。第三方依赖和 Three.js 示例适配代码的许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

本项目不授予任何 SAO 角色、名称、世界观、美术、音乐或商标的使用权。请不要把无权再发布的模型、音乐、纹理或其他素材提交到公开仓库。
