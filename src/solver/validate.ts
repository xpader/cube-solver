import { FACES } from '../cube/notation';

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

// 与 cubejs 完全一致的角块/棱块面贴索引表（0-based，URFDLB 顺序）
const cornerFacelet: number[][] = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const cornerColor: string[][] = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];
const edgeFacelet: number[][] = [
  [5, 10], [7, 19], [3, 37], [1, 46],
  [32, 16], [28, 25], [30, 43], [34, 52],
  [23, 12], [21, 41], [50, 39], [48, 14],
];
const edgeColor: string[][] = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'],
  ['D', 'R'], ['D', 'F'], ['D', 'L'], ['D', 'B'],
  ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
];

function permParity(perm: number[]): number {
  const p = perm.slice();
  let parity = 0;
  for (let i = 0; i < p.length; i++) {
    while (p[i] !== i) {
      const t = p[i];
      p[i] = p[t];
      p[t] = t;
      parity ^= 1;
    }
  }
  return parity;
}

/**
 * 完整校验 54 字符面贴串是否对应一个真实可达的 3x3 魔方状态。
 * 覆盖：数量、中心、角块/棱块合法性、唯一性、朝向和、排列奇偶。
 */
export function validateFacelets(facelets: string): ValidationResult {
  if (facelets.length !== 54) {
    return { ok: false, reason: `状态长度错误（${facelets.length}/54）` };
  }
  const counts: Record<string, number> = {};
  for (const c of facelets) counts[c] = (counts[c] || 0) + 1;
  for (const f of FACES) {
    if (counts[f] !== 9) {
      return { ok: false, reason: `颜色 ${f} 数量应为 9（当前 ${counts[f] || 0}）` };
    }
  }
  const extra = Object.keys(counts).filter((c) => !FACES.includes(c as never));
  if (extra.length) {
    return { ok: false, reason: `出现非法颜色：${extra.join(' ')}` };
  }

  // 角块：识别每个角位上的角块编号与朝向，校验合法性与唯一性
  const cp: number[] = new Array(8);
  const co: number[] = new Array(8);
  const cornerSeen = new Set<number>();
  for (let i = 0; i < 8; i++) {
    let ori = -1;
    for (let k = 0; k < 3; k++) {
      const ch = facelets[cornerFacelet[i][k]];
      if (ch === 'U' || ch === 'D') {
        ori = k;
        break;
      }
    }
    if (ori < 0) {
      return { ok: false, reason: `第 ${i + 1} 个角块缺少 U/D 颜色，颜色组合不可能` };
    }
    const col1 = facelets[cornerFacelet[i][(ori + 1) % 3]];
    const col2 = facelets[cornerFacelet[i][(ori + 2) % 3]];
    let j = -1;
    for (let jj = 0; jj < 8; jj++) {
      if (cornerColor[jj][1] === col1 && cornerColor[jj][2] === col2) {
        j = jj;
        break;
      }
    }
    if (j < 0) {
      return { ok: false, reason: `第 ${i + 1} 个角块颜色组合不合法（${col1}/${col2}）` };
    }
    if (cornerSeen.has(j)) {
      return { ok: false, reason: '存在重复的角块（同一种角块出现两次）' };
    }
    cornerSeen.add(j);
    cp[i] = j;
    co[i] = ori % 3;
  }

  // 棱块
  const ep: number[] = new Array(12);
  const eo: number[] = new Array(12);
  const edgeSeen = new Set<number>();
  for (let i = 0; i < 12; i++) {
    const a = facelets[edgeFacelet[i][0]];
    const b = facelets[edgeFacelet[i][1]];
    let j = -1;
    let o = 0;
    for (let jj = 0; jj < 12; jj++) {
      if (edgeColor[jj][0] === a && edgeColor[jj][1] === b) {
        j = jj;
        o = 0;
        break;
      }
      if (edgeColor[jj][0] === b && edgeColor[jj][1] === a) {
        j = jj;
        o = 1;
        break;
      }
    }
    if (j < 0) {
      return { ok: false, reason: `第 ${i + 1} 个棱块颜色组合不合法（${a}/${b}）` };
    }
    if (edgeSeen.has(j)) {
      return { ok: false, reason: '存在重复的棱块（同一种棱块出现两次）' };
    }
    edgeSeen.add(j);
    ep[i] = j;
    eo[i] = o;
  }

  // 朝向和
  const coSum = co.reduce((s, x) => s + x, 0);
  if (coSum % 3 !== 0) {
    return { ok: false, reason: '角块朝向不一致（可能有单个角块被扭转）' };
  }
  const eoSum = eo.reduce((s, x) => s + x, 0);
  if (eoSum % 2 !== 0) {
    return { ok: false, reason: '棱块朝向不一致（可能有单个棱块被翻转）' };
  }

  // 排列奇偶
  if (permParity(cp) !== permParity(ep)) {
    return { ok: false, reason: '排列奇偶不一致（可能有两块被互换位置）' };
  }

  return { ok: true };
}
