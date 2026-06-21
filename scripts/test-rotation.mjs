// 纯逻辑模拟 RubiksCube 的旋转约定，端到端验证求解闭环。
// 数学上与 RubiksCube.ts 严格一致（pos.applyQuaternion(deltaQuat)、quat.premultiply）。
import * as THREE from 'three';
import Cube from 'cubejs';

Cube.initSolver();

const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const FACE_AXIS_LAYER = {
  U: { axis: 'y', layer: 1 },
  D: { axis: 'y', layer: -1 },
  R: { axis: 'x', layer: 1 },
  L: { axis: 'x', layer: -1 },
  F: { axis: 'z', layer: 1 },
  B: { axis: 'z', layer: -1 },
};

function axisIndex(face) {
  const a = FACE_AXIS_LAYER[face].axis;
  return a === 'x' ? 0 : a === 'y' ? 1 : 2;
}

function moveGeometry(m) {
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

function v(x, y, z) { return new THREE.Vector3(x, y, z); }
const RAW = [
  { face: 'U', normal: v(0,1,0), stickers: [v(-1,1,-1),v(0,1,-1),v(1,1,-1),v(-1,1,0),v(0,1,0),v(1,1,0),v(-1,1,1),v(0,1,1),v(1,1,1)] },
  { face: 'R', normal: v(1,0,0), stickers: [v(1,1,1),v(1,1,0),v(1,1,-1),v(1,0,1),v(1,0,0),v(1,0,-1),v(1,-1,1),v(1,-1,0),v(1,-1,-1)] },
  { face: 'F', normal: v(0,0,1), stickers: [v(-1,1,1),v(0,1,1),v(1,1,1),v(-1,0,1),v(0,0,1),v(1,0,1),v(-1,-1,1),v(0,-1,1),v(1,-1,1)] },
  { face: 'D', normal: v(0,-1,0), stickers: [v(-1,-1,1),v(0,-1,1),v(1,-1,1),v(-1,-1,0),v(0,-1,0),v(1,-1,0),v(-1,-1,-1),v(0,-1,-1),v(1,-1,-1)] },
  { face: 'L', normal: v(-1,0,0), stickers: [v(-1,1,-1),v(-1,1,0),v(-1,1,1),v(-1,0,-1),v(-1,0,0),v(-1,0,1),v(-1,-1,-1),v(-1,-1,0),v(-1,-1,1)] },
  { face: 'B', normal: v(0,0,-1), stickers: [v(1,1,-1),v(0,1,-1),v(-1,1,-1),v(1,0,-1),v(0,0,-1),v(-1,0,-1),v(1,-1,-1),v(0,-1,-1),v(-1,-1,-1)] },
];
const DESCRIPTORS = RAW.flatMap((d) => d.stickers.map((s) => ({ pos: s, normal: d.normal, face: d.face })));

class Sim {
  constructor() { this.reset(); }
  reset() {
    this.cubies = [];
    this.stickers = [];
    for (let x=-1;x<=1;x++) for (let y=-1;y<=1;y++) for (let z=-1;z<=1;z++) {
      if (x===0&&y===0&&z===0) continue;
      const idx = this.cubies.length;
      const cubie = { pos: v(x,y,z), quat: new THREE.Quaternion() };
      this.cubies.push(cubie);
      if (x!==0) this.stickers.push({ cubie: idx, localNormal: v(x,0,0), face: x>0?'R':'L' });
      if (y!==0) this.stickers.push({ cubie: idx, localNormal: v(0,y,0), face: y>0?'U':'D' });
      if (z!==0) this.stickers.push({ cubie: idx, localNormal: v(0,0,z), face: z>0?'F':'B' });
    }
  }
  rotateLayer(m) {
    const { axis, layerValue, angle } = moveGeometry(m);
    const ai = axisIndex(m.face);
    const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    for (const c of this.cubies) {
      if (Math.round(c.pos.getComponent(ai)) !== layerValue) continue;
      c.pos.applyQuaternion(delta);
      c.quat.premultiply(delta);
      c.pos.set(Math.round(c.pos.x), Math.round(c.pos.y), Math.round(c.pos.z));
      snap(c.quat);
    }
  }
  findSticker(pos, normal) {
    const px=Math.round(pos.x),py=Math.round(pos.y),pz=Math.round(pos.z);
    const tmp=new THREE.Vector3();
    for (const st of this.stickers) {
      const c=this.cubies[st.cubie];
      if (Math.round(c.pos.x)!==px||Math.round(c.pos.y)!==py||Math.round(c.pos.z)!==pz) continue;
      tmp.copy(st.localNormal).applyQuaternion(c.quat);
      if (Math.round(tmp.x)===Math.round(normal.x)&&Math.round(tmp.y)===Math.round(normal.y)&&Math.round(tmp.z)===Math.round(normal.z)) return st;
    }
    return null;
  }
  extractFaceletString() {
    const colorToFace = {};
    for (const face of FACES) {
      const center = DESCRIPTORS.find((d)=>d.face===face && d.pos.equals(d.normal));
      const st = this.findSticker(center.pos, center.normal);
      if (!st) throw new Error('no center '+face);
      colorToFace[st.face] = face;
    }
    let out='';
    for (const d of DESCRIPTORS) {
      const st=this.findSticker(d.pos,d.normal);
      if (!st) return '';
      out += colorToFace[st.face];
    }
    return out;
  }
}
function snap(q) {
  const m=new THREE.Matrix4().makeRotationFromQuaternion(q);
  const e=m.elements; for(let i=0;i<16;i++) e[i]=Math.round(e[i]);
  q.setFromRotationMatrix(m);
}

function parse(alg){ return alg.trim().split(/\s+/).filter(Boolean).map(t=>({face:t[0], prime:!t.includes('2')&&t.includes("'"), double:t.includes('2')})); }

let allOk = true;
function check(name, cond) { console.log((cond?'PASS':'FAIL')+' - '+name); if(!cond) allOk=false; }

// 测试1：单步 R 面贴变化合理（UFR 角块 U 面贴纸移到 B 方向）
// 测试2：scramble -> extract -> solve -> apply -> solved
const scrambles = [
  "R U R' U' F2 B L'",
  "B2 L D' R' U F' L2 B R U2",
  "F R U R' U' F'",
  "U R U R' U' R' F R2 U' R' U' R U R' F'",
];
for (const sc of scrambles) {
  const sim = new Sim();
  for (const m of parse(sc)) sim.rotateLayer(m);
  const facelets = sim.extractFaceletString();
  const sol = Cube.fromString(facelets).solve();
  for (const m of parse(sol)) sim.rotateLayer(m);
  const final = sim.extractFaceletString();
  const ok = final === 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  check('solve-close '+sc.slice(0,18), ok);
}

// 测试3：逆向——应用 scramble 的逆应回到复原态
{
  const sim = new Sim();
  const moves = parse("R U R' U' F2 B L'");
  for (const m of moves) sim.rotateLayer(m);
  for (const m of [...moves].reverse().map((mm)=> mm.double?mm:(mm.prime?{...mm,prime:false}:{...mm,prime:true}))) sim.rotateLayer(m);
  const final = sim.extractFaceletString();
  check('invert returns solved', final === 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
}

// 测试4：打乱后直接读出的面贴串，喂回 cubejs 验证不是已解
{
  const sim = new Sim();
  for (const m of parse("R")) sim.rotateLayer(m);
  const f = sim.extractFaceletString();
  check('single R not solved', f !== 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
}

console.log('\n'+(allOk?'ALL PASS':'SOME FAILED'));
process.exit(allOk?0:1);
