# 魔方助手 · 3D 解魔方引导

> 项目地址：<https://github.com/xpader/cube-solver> · Build by [@xpader](https://github.com/xpader)

一个写实的 3D 三阶魔方网页应用。录入你手中魔方的当前状态，点击「解魔方」即可
获得**逐步引导的解法**——每一步都会把要转动的面转到正面、用弧形箭头指示方向，
并自动播放该层的转动；解完后还会放一场彩带庆祝。

纯前端，无后端、无密钥。求解在你的浏览器里完成。

## 功能特性

- **写实的 3D 魔方**：圆角塑料本体 + 分角圆角贴纸、磨砂哑光材质、软阴影、环境反射。
- **3D 点选录入**：初始全灰，选中颜色后点贴纸上色；右键擦除。
- **计数防错**：每种颜色 9 个配额，放满即禁用；徽章实时显示剩余。
- **可达性校验**：求解前做完整的魔方合法性检查（角块/棱块、朝向、奇偶），
  乱输会立刻提示，不会卡死。
- **Kociemba 近最优解法**：通常 19–21 步，在 Web Worker 中求解，不卡界面。
- **逐步引导**：自动把操作面转到正面 → 弧形箭头指示方向与角度 → 一面一面地转动
  （180° 会分两步、中间停顿）→ 箭头随转动逐渐缩短消失。
- **完成庆祝**：两门彩带炮抛物线喷射的物理彩带效果。
- **键盘/鼠标/触屏**均可操作。

## 技术栈

- [Vite](https://vitejs.dev/) + TypeScript（严格模式）
- [three.js](https://threejs.org/) 渲染
- [cubejs](https://github.com/ldez/cubejs)（Kociemba 两阶段算法）求解，跑在 Web Worker
- 依赖见 `package.json`

## 快速开始

```bash
npm install
npm run dev      # 启动开发服务器（默认 http://localhost:5173 ，自动打开浏览器）
```

构建生产版本：

```bash
npm run build    # tsc 类型检查 + vite 打包到 dist/
npm run preview  # 本地预览构建产物
```

## 使用方法

1. **录入状态**：在底部调色板选一种颜色，点击魔方贴纸上色；**右键**擦除。
   - 未填的贴纸显示为灰白斜条纹，便于和白色区分。
   - 用魔方周围的 **▲ ▼ ◀ ▶** 按钮逐面旋转视角，查看并录入各个面。
   - 中心块也可涂——按你魔方的实际配色填满 6 个中心。
2. **解魔方**：每种颜色都放满 9 个后，点「解魔方」。
3. **跟随引导**：点「下一步」逐步还原（或「自动」播放，「上一步」可回退）。
   每一步会先把要转的面转到正面、用箭头提示方向，再转动该层。
4. **重置**：清空回全灰，重新录入；「打乱」可随机打乱用于演示。

## 项目结构

```
src/
├── main.ts                 # 入口：UI、状态机、引导控制、彩带
├── cube/
│   ├── CubeScene.ts        # three.js 场景/灯光/相机、视角旋转、点击拾取
│   ├── RubiksCube.ts       # cubie 模型、层旋转动画、状态导出、转动箭头
│   └── notation.ts         # 记号解析、面贴描述符、配色
├── input/StickerPainter.ts # 涂色 + 计数配额
├── solver/
│   ├── solve.ts            # Web Worker 包装（ready/result 协议 + 超时）
│   ├── solver.worker.ts    # 在 worker 里跑 cubejs
│   └── validate.ts         # 魔方可达性校验
└── style.css
scripts/                    # 无测试框架；这些 node 脚本是自动化校验
├── test-rotation.mjs       # 旋转数学端到端：打乱→导出→求解→应用→复原
├── test-validate.mjs       # 合法性校验
└── test-solver.mjs         # cubejs 往返健全性
```

## 开发与校验

没有测试框架。改动相关区域后请运行对应的 node 脚本：

```bash
node scripts/test-rotation.mjs   # 改 notation.ts 或任何旋转逻辑后必跑
node scripts/test-validate.mjs   # 改 validate.ts 后跑
node scripts/test-solver.mjs     # cubejs 往返检查
npm run typecheck                # 每次改动后都应跑（TS 严格模式）
```

更多"为什么这么写、什么不能改"的内部约定见 [`AGENTS.md`](./AGENTS.md)。

## 致谢

- 求解算法：[cubejs](https://github.com/ldez/cubejs)（Petri Lehtinen / akheron 原作，
  ldez 维护），基于 Herbert Kociemba 的两阶段算法。
- 3D 渲染：[three.js](https://threejs.org/)。

## 许可证

MIT
