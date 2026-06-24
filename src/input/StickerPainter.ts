import type * as THREE from 'three';
import type { RubiksCube, Sticker } from '../cube/RubiksCube';
import { PALETTE, GRAY_ID, COLOR_PER_FACE } from '../cube/notation';

export class StickerPainter {
  private cube: RubiksCube;
  private el: HTMLElement;
  private selectedColorId = 0;
  private enabled = false;
  private eraseMode = false; // 橡皮擦模式：点击贴纸时移除颜色（变灰），供无右键的移动端使用
  private placed: number[] = new Array(PALETTE.length).fill(0);

  private onChangeCb: (() => void) | null = null;
  private onWarnCb: ((msg: string) => void) | null = null;

  private swatches: { el: HTMLElement; badge: HTMLElement; id: number }[] = [];
  private eraserEl: HTMLElement | null = null;

  constructor(cube: RubiksCube, container: HTMLElement) {
    this.cube = cube;
    this.el = container;
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';
    this.swatches = [];

    // 橡皮擦（移除颜色）：放在最左侧。无右键的移动端用它擦除贴纸颜色。
    const eraser = document.createElement('div');
    eraser.className = 'swatch swatch-eraser';
    eraser.title = '橡皮擦：点此后再点贴纸即可移除颜色';
    eraser.innerHTML = '<span class="eraser-icon"></span>';
    this.eraserEl = eraser;
    eraser.addEventListener('click', () => this.toggleErase());
    this.el.appendChild(eraser);

    for (const c of PALETTE) {
      const wrap = document.createElement('div');
      wrap.className = 'swatch';
      wrap.style.background = `#${c.hex.toString(16).padStart(6, '0')}`;
      wrap.title = c.name;
      const badge = document.createElement('span');
      badge.className = 'badge';
      wrap.appendChild(badge);
      wrap.addEventListener('click', () => this.select(c.id));
      this.el.appendChild(wrap);
      this.swatches.push({ el: wrap, badge, id: c.id });
    }
    this.updateUI();
  }

  /** 重新统计每种颜色已放置的数量（在外部改变状态后调用）。 */
  recompute(): void {
    const next = new Array(PALETTE.length).fill(0);
    for (const st of this.cube.stickers) {
      if (st.colorId >= 0 && st.colorId < PALETTE.length) next[st.colorId]++;
    }
    this.placed = next;
    this.updateUI();
  }

  private remaining(id: number): number {
    return COLOR_PER_FACE - this.placed[id];
  }

  private updateUI(): void {
    for (const s of this.swatches) {
      const rem = this.remaining(s.id);
      s.badge.textContent = String(rem);
      s.el.classList.toggle('depleted', rem <= 0);
      s.el.classList.toggle('selected', !this.eraseMode && s.id === this.selectedColorId);
    }
    if (this.eraserEl) this.eraserEl.classList.toggle('selected', this.eraseMode);
  }

  /** 切换橡皮擦模式：开启后点击贴纸即移除颜色（变灰）。 */
  toggleErase(): void {
    this.eraseMode = !this.eraseMode;
    this.updateUI();
  }

  isErasing(): boolean {
    return this.eraseMode;
  }

  select(colorId: number): void {
    if (this.remaining(colorId) <= 0) {
      this.onWarnCb?.('该颜色已全部放置完成');
      return;
    }
    this.selectedColorId = colorId;
    this.eraseMode = false; // 选颜色即退出橡皮擦模式
    this.updateUI();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    this.el.hidden = !v;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  onChange(cb: () => void): void {
    this.onChangeCb = cb;
  }

  onWarn(cb: (msg: string) => void): void {
    this.onWarnCb = cb;
  }

  getGrayCount(): number {
    return this.cube.countGray();
  }

  isComplete(): boolean {
    return this.getGrayCount() === 0;
  }

  /** 命中贴纸：橡皮擦模式下移除颜色（变灰），否则按选中色涂色（仅在启用时）。 */
  tryPaint(stickerObj: THREE.Object3D | null): boolean {
    if (!this.enabled || !stickerObj) return false;
    const sticker = stickerObj.userData.sticker as Sticker | undefined;
    if (!sticker) return false;

    if (this.eraseMode) return this.tryRemove(stickerObj);

    const newColor = this.selectedColorId;
    const oldColor = sticker.colorId;
    if (oldColor === newColor) return false;

    if (this.remaining(newColor) <= 0) {
      this.onWarnCb?.('该颜色已用完，请先擦除或选择其它颜色');
      return false;
    }

    this.cube.setColor(sticker, newColor);
    this.recompute();
    if (this.remaining(newColor) <= 0) this.autoAdvance();
    this.onChangeCb?.();
    return true;
  }

  /** 右键：擦除贴纸颜色（变灰）。 */
  tryRemove(stickerObj: THREE.Object3D | null): boolean {
    if (!this.enabled || !stickerObj) return false;
    const sticker = stickerObj.userData.sticker as Sticker | undefined;
    if (!sticker) return false;
    if (sticker.colorId === GRAY_ID) return false;

    this.cube.setColor(sticker, GRAY_ID);
    this.recompute();
    this.onChangeCb?.();
    return true;
  }

  /** 当前色用完时，自动切到下一个仍有剩余的颜色。 */
  private autoAdvance(): void {
    const n = PALETTE.length;
    for (let k = 1; k <= n; k++) {
      const id = (this.selectedColorId + k) % n;
      if (this.remaining(id) > 0) {
        this.selectedColorId = id;
        this.updateUI();
        return;
      }
    }
  }
}
