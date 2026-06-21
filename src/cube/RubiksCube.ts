import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  DEFAULT_FACE_COLOR,
  DESCRIPTORS,
  COLOR_HEX,
  GRAY_ID,
  ParsedMove,
  moveGeometry,
  axisIndex,
  FACES,
  Face,
} from './notation';

const SPACING = 1.0;
const BODY_SIZE = 0.96;
const BODY_RADIUS = 0.05; // 魔方体边缘圆角半径（原 0.09 太大，挤压平面区域使贴纸缩小、缝隙变宽）
const ROUND = 4;
// 贴纸贴齐魔方体平面区域（半边 = BODY_SIZE/2 - BODY_RADIUS），为边缘圆角预留距离；
// 用表达式联动 BODY_RADIUS，调圆角时贴纸自动跟随，不会悬空产生厚度感
const STICKER_SIZE = BODY_SIZE - 2 * BODY_RADIUS;
const STICKER_CORNER_R = 0.14; // 贴纸圆角半径
const STICKER_OFFSET = BODY_SIZE / 2 + 0.001; // 贴纸凸出魔方体表面的距离，越小越薄（防 z-fighting）

export interface Sticker {
  mesh: THREE.Mesh;
  cubie: THREE.Object3D;
  localNormal: THREE.Vector3;
  colorId: number;
}

const IDENTITY = new THREE.Quaternion();

// 未填色贴纸用的灰白斜条纹纹理（区别于实色白）
let stripeTex: THREE.Texture | null = null;
function getStripeTexture(): THREE.Texture {
  if (stripeTex) return stripeTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e6e9ee'; // 浅灰底
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1f2024'; // 黑色斜条
  const pitch = 26;
  const w = 13;
  for (let i = -size; i < size * 2; i += pitch) {
    ctx.save();
    ctx.translate(i, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(0, -size, w, size * 3);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  stripeTex = tex;
  return tex;
}

export class RubiksCube {
  readonly root: THREE.Group = new THREE.Group();
  readonly cubies: THREE.Object3D[] = [];
  readonly stickers: Sticker[] = [];
  readonly stickerMeshes: THREE.Object3D[] = [];

  private bodyGeo: RoundedBoxGeometry;
  private bodyMat: THREE.MeshStandardMaterial;
  private matCache = new Map<number, THREE.MeshStandardMaterial>();

  private animating = false;
  animDuration = 300; // ms

  constructor() {
    this.bodyGeo = new RoundedBoxGeometry(BODY_SIZE, BODY_SIZE, BODY_SIZE, ROUND, BODY_RADIUS);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      roughness: 0.35, // 低粗糙度，配合 RoomEnvironment 产生清晰的黑色塑料高光
      metalness: 0.1,
    });
    this.rebuild();
  }

  private rebuild(): void {
    for (const c of this.cubies) this.root.remove(c);
    this.cubies.length = 0;
    this.stickers.length = 0;
    this.stickerMeshes.length = 0;

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          this.root.add(this.makeCubie(x, y, z));
        }
      }
    }
  }

  private makeCubie(x: number, y: number, z: number): THREE.Object3D {
    const group = new THREE.Group();
    group.position.set(x * SPACING, y * SPACING, z * SPACING);

    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const dirs: THREE.Vector3[] = [];
    if (x !== 0) dirs.push(new THREE.Vector3(x, 0, 0));
    if (y !== 0) dirs.push(new THREE.Vector3(0, y, 0));
    if (z !== 0) dirs.push(new THREE.Vector3(0, 0, z));

    for (const n of dirs) {
      const { g1, g2 } = gridCoords(n, x, y, z);
      const mesh = new THREE.Mesh(buildStickerGeometry(n, g1, g2), this.createMaterial(GRAY_ID));
      mesh.position.copy(n.clone().multiplyScalar(STICKER_OFFSET));
      mesh.castShadow = false; // 贴纸不投影，消除凸起阴影带来的"厚度"视觉
      mesh.receiveShadow = true;
      mesh.visible = false; // 未填色时不显示贴纸，露出黑色底座（raycaster 仍可命中以供涂色）
      group.add(mesh);

      const sticker: Sticker = {
        mesh,
        cubie: group,
        localNormal: n.clone(),
        colorId: GRAY_ID,
      };
      this.stickers.push(sticker);
      this.stickerMeshes.push(mesh);
      mesh.userData.sticker = sticker;
    }

    this.cubies.push(group);
    return group;
  }

  private createMaterial(colorId: number): THREE.MeshStandardMaterial {
    let m = this.matCache.get(colorId);
    if (m) return m;
    m =
      colorId === GRAY_ID
        ? new THREE.MeshStandardMaterial({
            map: getStripeTexture(),
            roughness: 0.92,
            metalness: 0.0,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            color: COLOR_HEX[colorId],
            emissive: COLOR_HEX[colorId], // 自发光增强颜色鲜艳度，不引入高光
            emissiveIntensity: 0.18,
            roughness: 0.92, // 高粗糙度保持哑光、无高光斑点
            metalness: 0.0,
            envMapIntensity: 0.35, // 减弱灰白环境反射对颜色的稀释
            side: THREE.DoubleSide,
          });
    this.matCache.set(colorId, m);
    return m;
  }

  setColor(sticker: Sticker, colorId: number): void {
    sticker.colorId = colorId;
    sticker.mesh.material = this.createMaterial(colorId);
    sticker.mesh.visible = colorId !== GRAY_ID; // 未填色隐藏贴纸，填色后显示
  }

  isAnimating(): boolean {
    return this.animating;
  }

  /** 旋转一层并播放动画；完成后吸附所有 cubie 的世界坐标与朝向。onProgress 报告整体进度 0..1。 */
  async rotateLayer(move: ParsedMove, duration = this.animDuration, onProgress?: (p: number) => void): Promise<void> {
    if (this.animating) return;
    this.animating = true;

    const { axis, layerValue, angle } = moveGeometry(move);
    const ai = axisIndex(move.face);
    const layerCubies = this.cubies.filter(
      (c) => Math.round(c.position.getComponent(ai)) === layerValue,
    );

    const pivot = new THREE.Group();
    this.root.add(pivot);
    for (const c of layerCubies) pivot.attach(c);

    // 按 90° 分步：单步=1，双步(180°)=2，中间停顿一下，呈现"一面一面"转动
    const step = Math.sign(angle) * (Math.PI / 2);
    const steps = Math.max(1, Math.round(Math.abs(angle) / (Math.PI / 2)));
    for (let i = 1; i <= steps; i++) {
      const from = i === 1 ? IDENTITY : new THREE.Quaternion().setFromAxisAngle(axis, step * (i - 1));
      const to = new THREE.Quaternion().setFromAxisAngle(axis, step * i);
      await tween(duration, (t) => {
        pivot.quaternion.slerpQuaternions(from, to, easeInOut(t));
        onProgress?.((i - 1 + t) / steps);
      });
      if (i < steps) await new Promise((r) => setTimeout(r, 150));
    }
    onProgress?.(1);

    // 吸附到精确总角度，防止浮点漂移
    pivot.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axis, angle));

    for (const c of layerCubies) {
      this.root.attach(c);
      c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
      snapQuaternion(c);
    }
    this.root.remove(pivot);
    this.animating = false;
  }

  /** 找到指定 (逻辑位置, 外法向) 上的贴纸。 */
  findSticker(pos: THREE.Vector3, normal: THREE.Vector3): Sticker | null {
    const px = Math.round(pos.x);
    const py = Math.round(pos.y);
    const pz = Math.round(pos.z);
    const tmp = new THREE.Vector3();
    for (const st of this.stickers) {
      const c = st.cubie.position;
      if (Math.round(c.x) !== px || Math.round(c.y) !== py || Math.round(c.z) !== pz) continue;
      tmp.copy(st.localNormal).applyQuaternion(st.cubie.quaternion);
      if (
        Math.round(tmp.x) === Math.round(normal.x) &&
        Math.round(tmp.y) === Math.round(normal.y) &&
        Math.round(tmp.z) === Math.round(normal.z)
      ) {
        return st;
      }
    }
    return null;
  }

  /** 导出 54 字符面贴串（URFDLB 顺序，字母由中心色映射得出）。 */
  extractFaceletString(): string {
    const colorToFace: Record<number, Face> = {};
    for (const face of FACES) {
      const center = DESCRIPTORS.find((d) => d.face === face && d.pos.equals(d.normal));
      if (!center) continue;
      const st = this.findSticker(center.pos, center.normal);
      if (!st) continue;
      colorToFace[st.colorId] = face;
    }

    let out = '';
    for (const d of DESCRIPTORS) {
      const st = this.findSticker(d.pos, d.normal);
      if (!st) return '';
      const face = colorToFace[st.colorId];
      if (!face) return '';
      out += face;
    }
    return out;
  }

  /**
   * 显示转动指示箭头：弧长 = 实际转动角度（90°=1/4 圈，180°=1/2 圈）。
   * 返回控制器：update(progress) 随转动进度(0..1)让箭头从尾部向头部逐渐缩短消失；remove() 清除。
   */
  showTurnArrow(move: ParsedMove): { update: (p: number) => void; remove: () => void } {
    const { axis, layerValue, angle } = moveGeometry(move);
    const faceSign = Math.sign(layerValue);
    const dirSign = angle >= 0 ? 1 : -1;
    const totalSpan = Math.abs(angle); // 弧长 = 实际角度
    const endTheta = dirSign * (Math.PI / 2); // 头部固定在面的边中（基数角度），保证端点都在边中而非尖角

    const u = perpendicularTo(axis);
    const w = new THREE.Vector3().crossVectors(axis, u).normalize();
    const center = axis.clone().multiplyScalar(faceSign * ARROW_OFFSET);
    const mat = new THREE.MeshBasicMaterial({ color: 0x49e0ff, transparent: true });

    const group = new THREE.Group();
    this.root.add(group);

    // 头部锥（固定在 endTheta）
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 18), mat);
    cone.position.copy(arcPoint(center, u, w, endTheta));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arcTangent(u, w, endTheta, dirSign));
    group.add(cone);

    let tube: THREE.Mesh | null = null;
    const rebuild = (progress: number) => {
      if (tube) {
        group.remove(tube);
        tube.geometry.dispose();
        tube = null;
      }
      const remaining = totalSpan * (1 - progress);
      if (remaining <= 1e-3) return;
      const startTheta = endTheta - dirSign * remaining;
      const N = Math.max(2, Math.ceil(remaining * 18));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const th = startTheta + (endTheta - startTheta) * (i / N);
        pts.push(arcPoint(center, u, w, th));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false);
      tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(64, N * 2), 0.055, 10, false), mat);
      group.add(tube);
    };
    rebuild(0);

    return {
      update: (p: number) => {
        rebuild(p);
        mat.opacity = p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.25);
      },
      remove: () => {
        if (tube) tube.geometry.dispose();
        cone.geometry.dispose();
        mat.dispose();
        this.root.remove(group);
      },
    };
  }

  /** 清空为全灰（并复位所有 cubie 到已解位置/朝向）。 */
  blank(): void {
    this.rebuild();
  }

  /** 设为标准已解配色（用于"打乱"演示的起点）。 */
  setSolved(): void {
    this.rebuild();
    for (const st of this.stickers) {
      this.setColor(st, DEFAULT_FACE_COLOR[normalToFace(st.localNormal)]);
    }
  }

  /** 当前未涂色（灰色）贴纸数量。 */
  countGray(): number {
    let n = 0;
    for (const st of this.stickers) if (st.colorId === GRAY_ID) n++;
    return n;
  }
}

function normalToFace(n: THREE.Vector3): Face {
  if (n.y > 0.5) return 'U';
  if (n.y < -0.5) return 'D';
  if (n.x > 0.5) return 'R';
  if (n.x < -0.5) return 'L';
  if (n.z > 0.5) return 'F';
  return 'B';
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function tween(durationMs: number, onTick: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    if (durationMs <= 0) {
      onTick(1);
      resolve();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      onTick(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** 把四元数吸附到最近的 90° 倍数，避免浮点漂移累积。 */
function snapQuaternion(obj: THREE.Object3D): void {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(obj.quaternion);
  const e = m.elements;
  for (let i = 0; i < 16; i++) e[i] = Math.round(e[i]);
  obj.quaternion.setFromRotationMatrix(m);
}

/** 求与 v 垂直的单位向量。 */
function perpendicularTo(v: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  const other = ax <= ay && ax <= az ? new THREE.Vector3(1, 0, 0) : ay <= az ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3().crossVectors(v, other).normalize();
}

const ARROW_OFFSET = 1.95; // 箭头沿面法向外移
const ARROW_R = 1.45; // 弧半径

/** 弧上某角度处的点（center 在面外侧，u/w 为面内右手系基）。 */
function arcPoint(center: THREE.Vector3, u: THREE.Vector3, w: THREE.Vector3, th: number): THREE.Vector3 {
  return center
    .clone()
    .add(u.clone().multiplyScalar(Math.cos(th) * ARROW_R))
    .add(w.clone().multiplyScalar(Math.sin(th) * ARROW_R));
}

/** 弧上某角度处沿扫掠方向（dirSign）的单位切向。 */
function arcTangent(u: THREE.Vector3, w: THREE.Vector3, th: number, dirSign: number): THREE.Vector3 {
  return u
    .clone()
    .multiplyScalar(-Math.sin(th))
    .add(w.clone().multiplyScalar(Math.cos(th)))
    .multiplyScalar(dirSign)
    .normalize();
}

// ---- 贴纸形状生成：按贴纸在面内 3×3 网格的位置决定各角圆角 ----

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/** 选一组右手系面内基 (a1, a2)，满足 a1 × a2 = normal。 */
function inPlaneAxes(n: THREE.Vector3): { a1: THREE.Vector3; a2: THREE.Vector3 } {
  if (n.x > 0.5) return { a1: AXIS_Y, a2: AXIS_Z };
  if (n.x < -0.5) return { a1: AXIS_Z, a2: AXIS_Y };
  if (n.y > 0.5) return { a1: AXIS_Z, a2: AXIS_X };
  if (n.y < -0.5) return { a1: AXIS_X, a2: AXIS_Z };
  if (n.z > 0.5) return { a1: AXIS_X, a2: AXIS_Y };
  return { a1: AXIS_Y, a2: AXIS_X };
}

/** 贴纸在其所在面 3×3 网格内的坐标 (g1,g2) ∈ {-1,0,1}²，分别沿 a1、a2 轴。 */
function gridCoords(n: THREE.Vector3, x: number, y: number, z: number): { g1: number; g2: number } {
  if (n.x !== 0) return n.x > 0 ? { g1: y, g2: z } : { g1: z, g2: y };
  if (n.y !== 0) return n.y > 0 ? { g1: z, g2: x } : { g1: x, g2: z };
  return n.z > 0 ? { g1: x, g2: y } : { g1: y, g2: x };
}

/**
 * 生成带分角圆角的贴纸几何：
 *  - 中心贴纸 (g1=g2=0)：四角全圆角；
 *  - 周围贴纸：只有朝向面中心的内侧角为小圆角，外侧角为直角。
 * 角 (cu,cv) 是否"朝中心"= cu*g1 + cv*g2 < 0（中心贴纸则全部圆角）。
 */
function buildStickerGeometry(normal: THREE.Vector3, g1: number, g2: number): THREE.ShapeGeometry {
  const s = STICKER_SIZE / 2;
  const R = STICKER_CORNER_R;
  const isCenter = g1 === 0 && g2 === 0;
  const rounded = (cu: number, cv: number) => (isCenter || cu * g1 + cv * g2 < 0 ? R : 0);
  const rBl = rounded(-1, -1);
  const rBr = rounded(1, -1);
  const rTr = rounded(1, 1);
  const rTl = rounded(-1, 1);

  const shape = new THREE.Shape();
  shape.moveTo(-s + rBl, -s);
  shape.lineTo(s - rBr, -s);
  shape.quadraticCurveTo(s, -s, s, -s + rBr);
  shape.lineTo(s, s - rTr);
  shape.quadraticCurveTo(s, s, s - rTr, s);
  shape.lineTo(-s + rTl, s);
  shape.quadraticCurveTo(-s, s, -s, s - rTl);
  shape.lineTo(-s, -s + rBl);
  shape.quadraticCurveTo(-s, -s, -s + rBl, -s);

  const geo = new THREE.ShapeGeometry(shape, 6);
  const { a1, a2 } = inPlaneAxes(normal);
  const m = new THREE.Matrix4().makeBasis(a1, a2, normal);
  geo.applyMatrix4(m);
  return geo;
}
