import './style.css';
import { CubeScene, StepDir } from './cube/CubeScene';
import { RubiksCube } from './cube/RubiksCube';
import { StickerPainter } from './input/StickerPainter';
import { initSolver, solveCube, onSolverError } from './solver/solve';
import { validateFacelets } from './solver/validate';
import {
  FACES,
  Face,
  ParsedMove,
  parseAlgorithm,
  invertMove,
  moveToString,
  moveDescription,
} from './cube/notation';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = $('stage');
const paletteEl = $('palette');
const btnReset = $<HTMLButtonElement>('btn-reset');
const btnScramble = $<HTMLButtonElement>('btn-scramble');
const hintEl = $('hint');
const barIdle = $('bar-idle');
const barGuide = $('bar-guide');
const btnSolve = $<HTMLButtonElement>('btn-solve');
const solveStatus = $('solve-status');
const btnPrev = $<HTMLButtonElement>('btn-prev');
const btnNext = $<HTMLButtonElement>('btn-next');
const btnAuto = $<HTMLButtonElement>('btn-auto');
const guideMove = $('guide-move');
const guideDesc = $('guide-desc');
const guideProgress = $('guide-progress');
const overlay = $('overlay');
const overlayText = $('overlay-text');
const confettiEl = $('confetti');

// 场景与魔方
const scene = new CubeScene(stage);
const cube = new RubiksCube(); // 初始：全部灰色
scene.add(cube.root);
scene.setPickables(cube.stickerMeshes);
scene.setViewTarget(cube.root);

// 视角按钮：pointerdown 即触发（避免慢按/触屏长按导致 click 丢失），click 作键盘兜底并去重
function bindPress(btn: HTMLElement, action: () => void): void {
  let last = 0;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    last = performance.now();
    action();
  });
  btn.addEventListener('click', (e) => {
    if (performance.now() - last < 600) {
      e.preventDefault();
      return;
    }
    action();
  });
}

document.querySelectorAll<HTMLButtonElement>('.face-btn').forEach((btn) => {
  bindPress(btn, () => {
    if (busy) return; // 解题动画期间禁用手动旋转
    const dir = btn.dataset.dir as StepDir | undefined;
    if (dir) scene.rotateStep(dir);
  });
});

const painter = new StickerPainter(cube, paletteEl);
painter.setEnabled(true); // 涂色默认开启，解魔方前的空闲态始终可涂
scene.onPick = (obj) => painter.tryPaint(obj);
scene.onRightPick = (obj) => painter.tryRemove(obj);

// 引导状态
let moves: ParsedMove[] = [];
let currentIndex = 0; // 已应用的步数
let autoRunning = false;
let arrowCtl: { update: (p: number) => void; remove: () => void } | null = null;

let solverReady = false;
let busy = false;

function setHint(text: string, isError = false): void {
  hintEl.textContent = text;
  hintEl.classList.toggle('error', isError);
}
function hideOverlay(): void {
  overlay.classList.add('hidden');
}
function showOverlay(text: string): void {
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
}
function setBusy(b: boolean): void {
  busy = b;
  updateButtons();
}

function updateButtons(): void {
  btnReset.disabled = busy;
  btnScramble.disabled = busy;

  if (busy) {
    btnSolve.disabled = true;
  } else if (!solverReady) {
    btnSolve.textContent = '准备求解器中…';
    btnSolve.disabled = true;
  } else if (barGuide.hidden === false) {
    // 引导中，solve 按钮不在当前面板
  } else {
    const gray = painter.getGrayCount();
    if (gray > 0) {
      btnSolve.textContent = `待涂色 ${gray}`;
      btnSolve.disabled = true;
      solveStatus.textContent = `录入中：还有 ${gray} 个贴纸待涂色`;
    } else {
      btnSolve.textContent = '解魔方';
      btnSolve.disabled = false;
      solveStatus.textContent = '状态完整，点击「解魔方」开始';
    }
  }

  btnPrev.disabled = busy || currentIndex <= 0;
  btnNext.disabled = busy || currentIndex >= moves.length;
  btnAuto.disabled = busy || currentIndex >= moves.length;
}

// 启动求解引擎（后台预热，不阻塞交互）
initSolver().then(() => {
  solverReady = true;
  updateButtons();
});

onSolverError((msg) => {
  hideOverlay();
  solveStatus.textContent = '求解引擎出错';
  btnSolve.textContent = '求解器不可用';
  btnSolve.disabled = true;
  setHint('求解引擎加载失败：' + msg + '。请刷新重试。', true);
});

painter.onChange(() => updateButtons());
painter.onWarn((msg) => setHint(msg, true));

// 重置：清空为全灰
btnReset.addEventListener('click', () => {
  if (busy) return;
  exitGuide();
  cube.blank();
  painter.recompute();
  updateButtons();
  setHint('已清空。选中顶部颜色，点击魔方贴纸上色（右键擦除）。');
});

// 打乱（演示）：先设为已解配色，再随机转动
btnScramble.addEventListener('click', async () => {
  if (busy) return;
  exitGuide();
  setBusy(true);
  cube.setSolved();
  painter.recompute();
  const seq: ParsedMove[] = [];
  let prev: Face | null = null;
  for (let i = 0; i < 22; i++) {
    let f: Face;
    do {
      f = FACES[Math.floor(Math.random() * FACES.length)];
    } while (f === prev);
    prev = f;
    const r = Math.random();
    seq.push({ face: f, prime: r < 0.4, double: r >= 0.7 });
  }
  const oldDur = cube.animDuration;
  cube.animDuration = 130;
  for (const m of seq) await cube.rotateLayer(m);
  cube.animDuration = oldDur;
  painter.recompute();
  setBusy(false);
  setHint('已打乱，点击「解魔方」查看解法并逐步还原。');
});

// 解魔方
btnSolve.addEventListener('click', async () => {
  if (busy) return;
  if (!painter.isComplete()) {
    setHint(`还有 ${painter.getGrayCount()} 个贴纸未涂色，无法求解。`, true);
    return;
  }
  const facelets = cube.extractFaceletString();
  const valid = validateFacelets(facelets);
  if (!valid.ok) {
    setHint(
      '这不是一个真实可达的魔方状态：' + (valid.reason ?? '未知错误') +
      '。请对照真实魔方逐块核对（每个角块的三色组合、每个棱块的双色与朝向是否一致）。',
      true,
    );
    return;
  }
  if (facelets === 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB') {
    setHint('魔方已经是复原状态啦。');
    return;
  }

  setBusy(true);
  showOverlay('求解中…');
  try {
    const { solution } = await solveCube(cube);
    enterGuide(parseAlgorithm(solution));
  } catch (err) {
    setHint('求解失败：' + (err instanceof Error ? err.message : String(err)) + '（状态不可达，请检查录入是否与真实魔方一致）', true);
  } finally {
    hideOverlay();
    setBusy(false);
  }
});

function enterGuide(parsed: ParsedMove[]): void {
  moves = parsed;
  currentIndex = 0;
  autoRunning = false;
  barIdle.hidden = true;
  barGuide.hidden = false;
  painter.setEnabled(false); // 引导中禁用涂色
  updateGuideDisplay();
  setHint('按提示一步步转动。可点「下一步」或「自动」播放，「上一步」回退。');
}

function exitGuide(): void {
  if (autoRunning) autoRunning = false;
  moves = [];
  currentIndex = 0;
  if (arrowCtl) {
    arrowCtl.remove();
    arrowCtl = null;
  }
  barGuide.hidden = true;
  barIdle.hidden = false;
  painter.setEnabled(true); // 退出引导，恢复涂色
  clearConfetti(); // 清除残留彩带，恢复初始
  solvedFlashed = false;
}

let solvedFlashed = false;
const CONFETTI_COLORS = ['#f5f5f5', '#ffd23f', '#009e47', '#0051ba', '#c41e3a', '#ff5800'];

interface Confetti {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  flutter: number;
  phase: number;
  born: number;
  life: number;
}
const confettiParts: Confetti[] = [];
let confettiRaf = 0;
let confettiLastT = 0;

/** 两门彩带炮（左下、右下）向上向内发射，真实抛物线 + 摇摆旋转。 */
function fireConfetti(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const origins = [
    { x: w * 0.08, y: h, dir: 1 },
    { x: w * 0.92, y: h, dir: -1 },
  ];
  const per = 75;
  const now = performance.now();
  for (const o of origins) {
    for (let i = 0; i < per; i++) {
      const speed = 820 + Math.random() * 720;
      const ang = -Math.PI / 2 + o.dir * (0.18 + Math.random() * 0.62);
      const el = document.createElement('i');
      const pw = 6 + Math.random() * 7;
      const ph = pw * (1.4 + Math.random() * 0.9);
      el.style.cssText = `width:${pw}px;height:${ph}px;background:${CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]};`;
      confettiEl.appendChild(el);
      confettiParts.push({
        el,
        x: o.x + (Math.random() * 30 - 15),
        y: o.y + (Math.random() * 20 - 10),
        vx: Math.cos(ang) * speed + (Math.random() * 80 - 40),
        vy: Math.sin(ang) * speed,
        rot: Math.random() * 360,
        vrot: Math.random() * 640 - 320,
        flutter: 50 + Math.random() * 110,
        phase: Math.random() * Math.PI * 2,
        born: now,
        life: 2600 + Math.random() * 1400,
      });
    }
  }
  if (!confettiRaf) {
    confettiLastT = 0;
    confettiRaf = requestAnimationFrame(stepConfetti);
  }
}

function stepConfetti(now: number): void {
  const dt = confettiLastT ? Math.min(0.05, (now - confettiLastT) / 1000) : 0.016;
  confettiLastT = now;
  const h = window.innerHeight;
  const G = 1500; // 重力 px/s²
  for (let i = confettiParts.length - 1; i >= 0; i--) {
    const p = confettiParts[i];
    p.vy += G * dt;
    p.phase += dt * 9;
    p.x += (p.vx + Math.sin(p.phase) * p.flutter) * dt;
    p.y += p.vy * dt;
    p.rot += p.vrot * dt;
    const age = now - p.born;
    const fadeStart = p.life - 450;
    const op = age < 120 ? age / 120 : age > fadeStart ? Math.max(0, 1 - (age - fadeStart) / 450) : 1;
    p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`;
    p.el.style.opacity = op.toFixed(3);
    if (p.y > h + 80 || age > p.life) {
      p.el.remove();
      confettiParts.splice(i, 1);
    }
  }
  if (confettiParts.length) confettiRaf = requestAnimationFrame(stepConfetti);
  else {
    confettiRaf = 0;
    confettiLastT = 0;
  }
}

function clearConfetti(): void {
  if (confettiRaf) {
    cancelAnimationFrame(confettiRaf);
    confettiRaf = 0;
    confettiLastT = 0;
  }
  for (const p of confettiParts) p.el.remove();
  confettiParts.length = 0;
}

function updateGuideDisplay(): void {
  if (arrowCtl) {
    arrowCtl.remove();
    arrowCtl = null;
  }
  if (currentIndex >= moves.length) {
    guideMove.textContent = '完成';
    guideDesc.textContent = '魔方已复原';
    btnAuto.textContent = '自动';
    if (!solvedFlashed) {
      solvedFlashed = true;
      fireConfetti();
    }
  } else {
    guideMove.classList.remove('solved');
    solvedFlashed = false;
    const m = moves[currentIndex];
    guideMove.textContent = moveToString(m);
    guideDesc.textContent = moveDescription(m);
    arrowCtl = cube.showTurnArrow(m);
    btnAuto.textContent = autoRunning ? '暂停' : '自动';
  }
  guideProgress.textContent = `第 ${currentIndex} / ${moves.length} 步`;
  updateButtons();
}

async function doNext(): Promise<void> {
  if (cube.isAnimating() || currentIndex >= moves.length) return;
  const m = moves[currentIndex];
  setBusy(true);
  if (!scene.faceFacingCamera(m.face)) {
    await scene.viewFaceTo(m.face); // 先把要操作的面转到正面
  }
  const onProg = arrowCtl ? (p: number) => arrowCtl!.update(p) : undefined;
  await cube.rotateLayer(m, 620, onProg); // 层旋转（放慢），同步缩短箭头
  currentIndex++;
  updateGuideDisplay();
  setBusy(false);
}

async function doPrev(): Promise<void> {
  if (cube.isAnimating() || currentIndex <= 0) return;
  currentIndex--;
  const target = moves[currentIndex];
  const m = invertMove(target);
  setBusy(true);
  if (!scene.faceFacingCamera(target.face)) {
    await scene.viewFaceTo(target.face);
  }
  const onProg = arrowCtl ? (p: number) => arrowCtl!.update(p) : undefined;
  await cube.rotateLayer(m, 620, onProg);
  updateGuideDisplay();
  setBusy(false);
}

btnNext.addEventListener('click', () => {
  autoRunning = false;
  void doNext();
});

btnPrev.addEventListener('click', () => {
  autoRunning = false;
  void doPrev();
});

btnAuto.addEventListener('click', async () => {
  if (currentIndex >= moves.length) return;
  autoRunning = !autoRunning;
  updateGuideDisplay();
  while (autoRunning && currentIndex < moves.length) {
    await doNext();
    if (!autoRunning) break;
    await delay(450);
  }
  autoRunning = false;
  updateGuideDisplay();
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 初始化
hideOverlay();
updateButtons();
setHint('选中顶部颜色，点击魔方贴纸上色（右键擦除）。用上/下/左/右箭头旋转查看各面。');
