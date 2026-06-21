import * as THREE from 'three';

export type Face = 'U' | 'D' | 'R' | 'L' | 'F' | 'B';

export const FACES: Face[] = ['U', 'D', 'R', 'L', 'F', 'B'];

export interface ParsedMove {
  face: Face;
  prime: boolean;
  double: boolean;
}

export interface PaletteColor {
  id: number;
  name: string;
  hex: number;
}

// 调色板：默认配色（U 白 / D 黄 / F 绿 / B 蓝 / R 红 / L 橙）
export const PALETTE: PaletteColor[] = [
  { id: 0, name: '白', hex: 0xf5f5f5 },
  { id: 1, name: '黄', hex: 0xffd23f },
  { id: 2, name: '绿', hex: 0x009e47 },
  { id: 3, name: '蓝', hex: 0x0051ba },
  { id: 4, name: '红', hex: 0xc41e3a },
  { id: 5, name: '橙', hex: 0xff5800 },
];

// 未填涂的"灰色"占位色（不属于真实配色）
export const GRAY_ID = 6;
export const GRAY_HEX = 0x8c929c;

// 全部颜色（含灰色）的 hex 查找表，供材质按 colorId 取色
export const COLOR_HEX: number[] = [...PALETTE.map((p) => p.hex), GRAY_HEX];

export const COLOR_PER_FACE = 9;

export const DEFAULT_FACE_COLOR: Record<Face, number> = {
  U: 0,
  D: 1,
  F: 2,
  B: 3,
  R: 4,
  L: 5,
};

const FACE_AXIS_LAYER: Record<Face, { axis: 'x' | 'y' | 'z'; layer: number; label: string }> = {
  U: { axis: 'y', layer: 1, label: '顶层' },
  D: { axis: 'y', layer: -1, label: '底层' },
  R: { axis: 'x', layer: 1, label: '右层' },
  L: { axis: 'x', layer: -1, label: '左层' },
  F: { axis: 'z', layer: 1, label: '前层' },
  B: { axis: 'z', layer: -1, label: '后层' },
};

export function faceLabel(face: Face): string {
  return FACE_AXIS_LAYER[face].label;
}

export function axisIndex(face: Face): 0 | 1 | 2 {
  const a = FACE_AXIS_LAYER[face].axis;
  return a === 'x' ? 0 : a === 'y' ? 1 : 2;
}

export function parseAlgorithm(algorithm: string): ParsedMove[] {
  return algorithm
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const face = token[0] as Face;
      if (!FACES.includes(face)) throw new Error(`无法识别的步骤：${token}`);
      const double = token.includes('2');
      const prime = !double && token.includes("'");
      return { face, prime, double };
    });
}

export function invertMove(m: ParsedMove): ParsedMove {
  if (m.double) return { face: m.face, prime: false, double: true };
  return { face: m.face, prime: !m.prime, double: false };
}

export function moveToString(m: ParsedMove): string {
  return m.face + (m.double ? '2' : m.prime ? "'" : '');
}

export interface MoveGeometry {
  axis: THREE.Vector3;
  layerValue: number;
  angle: number; // 弧度，最终总角度
}

// 顺时针（从面外侧看）= 绕 +轴 -90° × sign(layer)
export function moveGeometry(m: ParsedMove): MoveGeometry {
  const info = FACE_AXIS_LAYER[m.face];
  const axis = new THREE.Vector3(
    info.axis === 'x' ? 1 : 0,
    info.axis === 'y' ? 1 : 0,
    info.axis === 'z' ? 1 : 0,
  );
  const sign = Math.sign(info.layer);
  let angle = (-Math.PI / 2) * sign;
  if (m.prime) angle = -angle;
  if (m.double) angle *= 2;
  return { axis, layerValue: info.layer, angle };
}

export function moveDescription(m: ParsedMove): string {
  const dir = m.double ? '180°' : m.prime ? '逆时针' : '顺时针';
  return `转动${faceLabel(m.face)}（${dir}）`;
}

// 54 个面贴描述符：位置 + 外法向，顺序严格匹配 cubejs 的 URFDLB 面贴串
export interface Descriptor {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  face: Face;
}

function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

const RAW: Array<{ face: Face; normal: THREE.Vector3; stickers: THREE.Vector3[] }> = [
  { face: 'U', normal: v(0, 1, 0), stickers: [v(-1, 1, -1), v(0, 1, -1), v(1, 1, -1), v(-1, 1, 0), v(0, 1, 0), v(1, 1, 0), v(-1, 1, 1), v(0, 1, 1), v(1, 1, 1)] },
  { face: 'R', normal: v(1, 0, 0), stickers: [v(1, 1, 1), v(1, 1, 0), v(1, 1, -1), v(1, 0, 1), v(1, 0, 0), v(1, 0, -1), v(1, -1, 1), v(1, -1, 0), v(1, -1, -1)] },
  { face: 'F', normal: v(0, 0, 1), stickers: [v(-1, 1, 1), v(0, 1, 1), v(1, 1, 1), v(-1, 0, 1), v(0, 0, 1), v(1, 0, 1), v(-1, -1, 1), v(0, -1, 1), v(1, -1, 1)] },
  { face: 'D', normal: v(0, -1, 0), stickers: [v(-1, -1, 1), v(0, -1, 1), v(1, -1, 1), v(-1, -1, 0), v(0, -1, 0), v(1, -1, 0), v(-1, -1, -1), v(0, -1, -1), v(1, -1, -1)] },
  { face: 'L', normal: v(-1, 0, 0), stickers: [v(-1, 1, -1), v(-1, 1, 0), v(-1, 1, 1), v(-1, 0, -1), v(-1, 0, 0), v(-1, 0, 1), v(-1, -1, -1), v(-1, -1, 0), v(-1, -1, 1)] },
  { face: 'B', normal: v(0, 0, -1), stickers: [v(1, 1, -1), v(0, 1, -1), v(-1, 1, -1), v(1, 0, -1), v(0, 0, -1), v(-1, 0, -1), v(1, -1, -1), v(0, -1, -1), v(-1, -1, -1)] },
];

export const DESCRIPTORS: Descriptor[] = RAW.flatMap((d) =>
  d.stickers.map((s) => ({ pos: s, normal: d.normal, face: d.face })),
);

export const CENTER_FACE: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
export const CENTER_DESCRIPTOR_INDEX = [4, 13, 22, 31, 40, 49];

// 用 "px,py,pz|nx,ny,nz" 做键，便于按 (位置,法向) 查面贴索引
export const DESCRIPTOR_KEY_MAP: Map<string, number> = new Map();
DESCRIPTORS.forEach((d, i) => {
  const key = `${d.pos.x},${d.pos.y},${d.pos.z}|${d.normal.x},${d.normal.y},${d.normal.z}`;
  DESCRIPTOR_KEY_MAP.set(key, i);
});

export function descriptorKey(px: number, py: number, pz: number, nx: number, ny: number, nz: number): string {
  return `${px},${py},${pz}|${nx},${ny},${nz}`;
}
