/**
 * 使用引导（Coach Mark）：聚光灯 + 气泡提示。
 *
 * - 用一个全屏 SVG（fill-rule=evenodd）挖出目标元素的「洞」来制造聚光：
 *   洞外区域被半透明深色覆盖并拦截点击；洞内（目标元素）保持可点击，
 *   方便用户直接按提示操作（点颜色 / 点箭头 / 点「下一步」）。
 * - 气泡带箭头，靠近目标，视口不足时自动翻向。
 * - 每一步既可点击气泡按钮推进，也可直接点击高亮目标推进（advanceOnTargetClick）。
 */
export type CoachPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface CoachStep {
  /** 要高亮指向的元素；函数形式会在每次渲染时惰性解析（适合稍后才出现的元素）。 */
  target: HTMLElement | (() => HTMLElement | null);
  /** 气泡正文（允许内联 HTML）。 */
  text: string;
  /** 气泡相对目标的位置，默认 top。 */
  placement?: CoachPlacement;
  /** 主按钮文字，默认最后一步「知道了」、其余「下一步」。 */
  button?: string;
  /** 点击高亮目标时也会推进 / 结束引导。 */
  advanceOnTargetClick?: boolean;
}

const NS = 'http://www.w3.org/2000/svg';
const PAD = 8; // 贴边时的视口留白
const GAP = 14; // 目标与气泡间距
const PAD2 = 6; // 洞 / 高亮环相对目标的外扩

export class CoachMark {
  private parent: HTMLElement;
  private root: HTMLDivElement;
  private mask: SVGSVGElement;
  private path: SVGPathElement;
  private ring: HTMLDivElement;
  private tip: HTMLDivElement;
  private arrow: HTMLDivElement;
  private textEl: HTMLDivElement;
  private btn: HTMLButtonElement;
  private skip: HTMLAnchorElement;

  private steps: CoachStep[] = [];
  private index = 0;
  private active = false;
  private onDismissCb: (() => void) | null = null;
  private targetEl: HTMLElement | null = null;
  private targetClickFn: ((e: Event) => void) | null = null;
  private readonly onResize = () => this.layout();

  constructor(parent: HTMLElement) {
    this.parent = parent;
    // --- 构建 DOM ---
    this.root = document.createElement('div');
    this.root.className = 'coach-root';
    this.root.hidden = true;

    this.mask = document.createElementNS(NS, 'svg') as unknown as SVGSVGElement;
    this.mask.setAttribute('class', 'coach-mask');
    this.mask.setAttribute('width', '100%');
    this.mask.setAttribute('height', '100%');
    this.path = document.createElementNS(NS, 'path');
    this.path.setAttribute('fill-rule', 'evenodd');
    this.path.setAttribute('fill', 'rgba(6,8,12,0.66)');
    this.mask.appendChild(this.path);
    this.root.appendChild(this.mask);

    this.ring = document.createElement('div');
    this.ring.className = 'coach-ring';
    this.ring.style.display = 'none';
    this.root.appendChild(this.ring);

    this.tip = document.createElement('div');
    this.tip.className = 'coach-tip';
    this.arrow = document.createElement('div');
    this.arrow.className = 'coach-arrow';
    this.textEl = document.createElement('div');
    this.textEl.className = 'coach-text';
    const actions = document.createElement('div');
    actions.className = 'coach-actions';
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'primary';
    this.skip = document.createElement('a');
    this.skip.href = '#';
    this.skip.className = 'coach-skip';
    this.skip.textContent = '跳过引导';
    this.tip.append(this.arrow, this.textEl, actions);
    actions.append(this.btn, this.skip);
    this.root.appendChild(this.tip);

    parent.appendChild(this.root);

    this.btn.addEventListener('click', () => this.advance());
    this.skip.addEventListener('click', (e) => {
      e.preventDefault();
      this.finish();
    });
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this.onResize);
  }

  isActive(): boolean {
    return this.active;
  }

  /** 展示一组步骤；onDismiss 在正常结束或跳过时触发（用于标记「已看过」）。 */
  show(steps: CoachStep[], onDismiss?: () => void): void {
    if (this.active) this.cleanup();
    this.steps = steps;
    this.index = 0;
    this.onDismissCb = onDismiss ?? null;
    this.active = true;
    this.root.hidden = false;
    this.render();
  }

  /** 上下文切换（如重置 / 退出引导）时清理，但不标记已看过。 */
  cancel(): void {
    if (this.active) this.cleanup();
  }

  private render(): void {
    const step = this.steps[this.index];
    if (!step) {
      this.finish();
      return;
    }
    const last = this.index >= this.steps.length - 1;
    this.textEl.innerHTML = step.text;
    this.btn.textContent = step.button ?? (last ? '知道了' : '下一步');

    this.unbindTargetClick();
    this.targetEl = typeof step.target === 'function' ? step.target() : step.target;
    if (step.advanceOnTargetClick && this.targetEl) {
      this.targetClickFn = () => this.advance();
      this.targetEl.addEventListener('click', this.targetClickFn, { capture: true, once: true });
    }
    this.layout();
  }

  private unbindTargetClick(): void {
    if (this.targetClickFn && this.targetEl) {
      this.targetEl.removeEventListener('click', this.targetClickFn, { capture: true });
    }
    this.targetClickFn = null;
  }

  private advance(): void {
    this.unbindTargetClick();
    if (this.index >= this.steps.length - 1) {
      this.finish();
      return;
    }
    this.index++;
    this.render();
  }

  private finish(): void {
    this.cleanup();
    this.onDismissCb?.();
  }

  private cleanup(): void {
    this.unbindTargetClick();
    this.active = false;
    this.root.hidden = true;
    this.ring.style.display = 'none';
    this.arrow.style.display = '';
  }

  private layout(): void {
    if (!this.active) return;
    const step = this.steps[this.index];
    const W = this.parent.clientWidth;
    const H = this.parent.clientHeight;

    const target = this.targetEl;
    if (!target) {
      // 没有目标：整体压暗，气泡居中
      this.path.setAttribute('d', `M0 0 H${W} V${H} H0 Z`);
      this.ring.style.display = 'none';
      this.arrow.style.display = 'none';
      this.tip.style.left = '0px';
      this.tip.style.top = '0px';
      this.tip.style.left = `${clamp((W - this.tip.offsetWidth) / 2, PAD, W - PAD)}px`;
      this.tip.style.top = `${clamp((H - this.tip.offsetHeight) / 2, PAD, H - PAD)}px`;
      return;
    }

    const pr = this.parent.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const x = tr.left - pr.left;
    const y = tr.top - pr.top;
    const w = tr.width;
    const h = tr.height;

    const hx = x - PAD2;
    const hy = y - PAD2;
    const hw = w + PAD2 * 2;
    const hh = h + PAD2 * 2;
    // 外圈顺时针 + 内圈顺时针，evenodd 形成挖洞
    this.path.setAttribute(
      'd',
      `M0 0 H${W} V${H} H0 Z M${hx} ${hy} H${hx + hw} V${hy + hh} H${hx} Z`,
    );

    this.ring.style.display = '';
    this.ring.style.left = `${hx}px`;
    this.ring.style.top = `${hy}px`;
    this.ring.style.width = `${hw}px`;
    this.ring.style.height = `${hh}px`;

    this.placeTip(x, y, w, h, step.placement ?? 'top', W, H);
  }

  private placeTip(
    tx: number,
    ty: number,
    tw: number,
    th: number,
    placement: CoachPlacement,
    W: number,
    H: number,
  ): void {
    const tip = this.tip;
    const arrow = this.arrow;
    arrow.style.display = '';
    arrow.style.left = '';
    arrow.style.top = '';
    // 先放到 0,0 以便准确量取尺寸
    tip.style.left = '0px';
    tip.style.top = '0px';
    const twp = tip.offsetWidth;
    const thp = tip.offsetHeight;

    // 空间不足则翻向
    let p = placement;
    if (p === 'top' && ty - GAP - thp < PAD) p = 'bottom';
    else if (p === 'bottom' && ty + th + GAP + thp > H - PAD) p = 'top';
    else if (p === 'left' && tx - GAP - twp < PAD) p = 'right';
    else if (p === 'right' && tx + tw + GAP + twp > W - PAD) p = 'left';

    const cx = tx + tw / 2;
    const cy = ty + th / 2;
    // 箭头朝向目标：提示在目标上方(p=top)→箭头向下，以此类推。
    const arrowDir: Record<CoachPlacement, 'down' | 'up' | 'right' | 'left'> = {
      top: 'down',
      bottom: 'up',
      left: 'right',
      right: 'left',
    };
    arrow.classList.remove('down', 'up', 'right', 'left');
    arrow.classList.add(arrowDir[p]);

    let left: number;
    let top: number;
    if (p === 'top' || p === 'bottom') {
      left = clamp(cx - twp / 2, PAD, W - twp - PAD);
      top = p === 'top' ? ty - thp - GAP : ty + th + GAP;
      arrow.style.left = `${clamp(cx - left, 9, twp - 9)}px`;
      arrow.style.top = '';
    } else {
      top = clamp(cy - thp / 2, PAD, H - thp - PAD);
      left = p === 'left' ? tx - twp - GAP : tx + tw + GAP;
      arrow.style.top = `${clamp(cy - top, 9, thp - 9)}px`;
      arrow.style.left = '';
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
