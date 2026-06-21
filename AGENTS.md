# AGENTS.md

Vite + TypeScript 应用：一个写实的 3D 三阶魔方。用户录入魔方当前状态，
随后获得逐步引导的解法。运行在浏览器中。

## 命令

- `npm run dev` — Vite 开发服务器（端口 5173，自动打开浏览器）。
- `npm run build` — 先 `tsc --noEmit` 再 `vite build`。类型错误会导致构建失败。
- `npm run typecheck` — 仅 `tsc --noEmit`。每次改动后都应运行（TS 严格模式：
  启用了 `noUnusedLocals`/`noUnusedParameters`，未使用的导入/变量会报错）。
- 无测试框架。验证依赖下面的三个 Node 脚本。

## 验证（无测试框架）

下面是直接用 node 运行的 ESM 脚本，是仅有的自动化检查——改动相应区域后请运行：

- `node scripts/test-rotation.mjs` — **编辑 `src/cube/notation.ts` 或任何旋转
  逻辑后必须运行。** 在无界面环境中镜像 3D 旋转数学，并验证完整闭环：
  打乱→导出面贴→cubejs 求解→应用→复原。
- `node scripts/test-validate.mjs` — 编辑 `src/solver/validate.ts` 后运行。
- `node scripts/test-solver.mjs` — cubejs `fromString`/`solve` 往返健全性检查。

## 架构：关键且不可破坏的事实

**求解在 Web Worker 中运行**（`src/solver/solver.worker.ts`）。`cubejs` 的
`Cube.initSolver()` 耗时约 4–5 秒，并在 worker 加载时同步执行；worker 只有
等它跑完才会 postMessage `{type:'ready'}`。`src/solver/solve.ts` 用 ready/
result 协议包装它，并带 15 秒超时（超时则终止 worker）。不要把求解挪到主线程
——会卡死界面。默认 `maxDepth=21`（在 `solve.ts`/`solver.worker.ts`），不是
cubejs 默认的 22——步数更少、耗时几乎不变；改到 20 会接近最优但偶发数秒求解。

**求解器是 `cubejs`，不是 `cube-solver`。** `cube-solver` 只接收打乱步骤
*序列*；而用户录入的是任意面贴*状态*，因此只有 `cubejs`
（`Cube.fromString(facelets).solve()`）可用。`cubejs` 不附带类型声明——见
`src/types/cubejs.d.ts`。`import Cube from 'cubejs'` 在 Vite dev（预打包）
和 Rollup build 下都能正确解析。

**`cubejs` 不校验状态可达性。** 对不可达输入，`Cube.fromString` 会静默构造一个
损坏的 cubie 状态，随后 `solve()` 无限循环（表现为「求解中…」永久卡住）。
因此 `src/solver/validate.ts` 是必须的：它在求解**之前**执行完整的 cubie 检查
（角块/棱块颜色组合、唯一性、朝向和 mod 3/2、排列奇偶）。求解路径中务必保留此检查。

## 魔方模型约定（极易被悄悄破坏）

- **面贴串顺序为 URFDLB**（每面 9 个），与 cubejs 一致。`src/cube/notation.ts`
  中的 54 个 `DESCRIPTORS` 以该顺序把每个面贴映射到 (位置, 法向)。重新排序会
  导致求解失败却无任何报错。中心块位于面贴索引 4、13、22、31、40、49。
- **旋转符号约定**（`moveGeometry`）：顺时针转动 = 绕 +轴 `-90° × sign(layer)`。
  已由 `test-rotation.mjs` 验证——改动它会让该脚本和 3D 动画都与 cubejs 脱节。
- **层动画**（`RubiksCube.rotateLayer`）：收集该层的 cubie，通过 `pivot.attach()`
  （保持世界变换）把它们挂到临时 `pivot` 下，动画 pivot 的 quaternion，再用
  `root.attach()` 把每个 cubie 挂回，最后**把位置取整、把 quaternion 吸附到 90°**。
  取整/吸附可防止多次转动后的浮点漂移——切勿移除。转动**按 90° 分步**：单步=1，
  双步(180°)=2 且中间停顿；`rotateLayer(move, duration, onProgress?)` 的
  `onProgress(p∈0..1)` 报告整步归一化进度，**驱动下方箭头的缩短**——改动画步进
  时要同步保持这个回调语义。
- **转动箭头**（`RubiksCube.showTurnArrow`）：返回**控制器 `{update, remove}`**
  （不是单一删除函数）。弧长 = 实际转动角度（90°→1/4 圈、180°→半圈），端点固定在
  面的"边中"（基数角度 `±π/2`）；`update(p)` 随 `onProgress` 从尾部向头部缩短并在
  末段淡出。`main.ts` 把它存为 `arrowCtl`，求解时把 `arrowCtl.update` 传给
  `rotateLayer` 的 `onProgress`。
- **贴纸是分角圆角的 ShapeGeometry**（`buildStickerGeometry`），不是简单方片：
  中心贴纸四角全圆角；周围贴纸只有朝面中心的内侧角为小圆角（规则
  `cu*g1 + cv*g2 < 0`）。形状在局部 XY 构造，再用 `Matrix4.makeBasis(a1,a2,normal)`
  旋转到对应面（a1×a2=normal 的右手系）。改动朝向/圆角规则要保证每张贴纸仍正对
  外侧。**材质按 colorId 共享缓存**（`matCache`），`setColor` **整体替换**材质而
  非改色——切勿 mutate 共享材质（高亮等曾因此全色串扰）。未填色用**灰白斜条纹**
  CanvasTexture（`getStripeTexture`）以区别于实色白。
- **状态从 cubie 的实时变换读取**，而非额外的旁路数组。`extractFaceletString`
  按 cubie 当前取整后的位置 + 世界法向来定位每个贴纸。转动后 cubie 不再停留在
  已解位置，所以读取状态时绝不要假设位置固定。

## 视角控制（易踩的坑）

**相机始终在 +Z 轴上、正对前面、不旋转**；但其**距离自适应**——
`CubeScene.computeFitDistance()` 按视口比例计算（桌面宽屏≈7.5，移动端竖屏后撤到
~12，让魔方连同层动画途经的 45° 边视图都能完整入镜），再乘滚轮缩放倍率
`userZoom`；**别再硬编码 7.5**。`applyFitDistance()` 在构造、`handleResize` 时调用。
底部灯光含一盏下方补光照亮 -Y 面，别去掉。

**魔方根节点 `cube.root` 既承担视角旋转（quaternion），也会做 `position.y` 垂直
平移**（`applyVerticalCentering`）：让魔方在屏幕上垂直居中于「顶部 `.hint` ↔
底部 `#bar`」之间的可用区域，而不是原始视口几何中心（否则在矮底栏的手机上会贴
底）。地面（`this.ground`）随之平移以保留阴影相对关系。`setViewTarget()` 与
`handleResize` 会重新应用该平移。

- **`#face-nav`（上下左右翻转箭头）的上下边界由 `applyVerticalCentering` 用内联
  样式动态对齐到可用区域**，内部 `top:50%` 即落在魔方中心，四个箭头随魔方一起
  移动——别用纯 CSS 重新定位它们。
- **状态读取（`findSticker`/`extractFaceletString`）用的是 cubie 的局部
  `position`/`quaternion`**（相对根节点），所以根节点的 `position.y` 平移不影响
  状态读取；改动时不要误改成世界坐标。

**所有视角旋转都累加到"意图目标" `targetQuat`，再从当前朝向 slerp 追向它**
（`CubeScene.animateToTarget`）。**绝不要**基于"动画中途的当前四元数"累加——
否则连点会丢失/漂移（曾出现的 bug）。`rotateStep(dir)`（上/下/左/右按钮）premultiply
一个 90° 步到 `targetQuat`；`viewFaceTo(face)` 用**当前朝向下最小的单轴旋转**把面
转到正对相机（相邻面=一次 90°倾转，对面=两步、中间面停顿）。

## 录入模型

- 初始状态为全灰（`notation.ts` 中 `GRAY_ID = 6`）；真实颜色为 `PALETTE` 中的
  id 0–5，每色 9 个配额。中心块可涂（用户自定义配色方案）。`StickerPainter`
  按色强制计数，某色放满 9 个后即禁用。
- 左键涂上所选颜色；右键（`contextmenu`，已阻止默认行为）擦除贴纸回灰并返还
  其颜色配额。

## 环境提示（Windows）

`npm` 是 `.cmd` 批处理，因此 `Start-Process -FilePath "npm" ...` 会失败。若要
后台启动开发服务器，请直接运行 `node node_modules/vite/bin/vite.js`。在普通
终端里 `npm run dev` 不受影响。
