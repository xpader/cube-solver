// 验证 validateFacelets 的正确性：有效状态通过，各种非法状态被识别。
import Cube from 'cubejs';

Cube.initSolver();

const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const cornerFacelet = [
  [8,9,20],[6,18,38],[0,36,47],[2,45,11],
  [29,26,15],[27,44,24],[33,53,42],[35,17,51],
];
const cornerColor = [
  ['U','R','F'],['U','F','L'],['U','L','B'],['U','B','R'],
  ['D','F','R'],['D','L','F'],['D','B','L'],['D','R','B'],
];
const edgeFacelet = [
  [5,10],[7,19],[3,37],[1,46],
  [32,16],[28,25],[30,43],[34,52],
  [23,12],[21,41],[50,39],[48,14],
];
const edgeColor = [
  ['U','R'],['U','F'],['U','L'],['U','B'],
  ['D','R'],['D','F'],['D','L'],['D','B'],
  ['F','R'],['F','L'],['B','L'],['B','R'],
];
function permParity(p){const q=p.slice();let s=0;for(let i=0;i<q.length;i++){while(q[i]!==i){const t=q[i];q[i]=q[t];q[t]=t;s^=1;}}return s;}
function validate(str){
  if(str.length!==54) return 'len';
  const cnt={}; for(const c of str) cnt[c]=(cnt[c]||0)+1;
  for(const f of FACES) if(cnt[f]!==9) return 'count '+f;
  const cp=new Array(8),co=new Array(8); const cs=new Set();
  for(let i=0;i<8;i++){let ori=-1;for(let k=0;k<3;k++){const ch=str[cornerFacelet[i][k]];if(ch==='U'||ch==='D'){ori=k;break;}}if(ori<0)return 'corner noUD '+i;const c1=str[cornerFacelet[i][(ori+1)%3]],c2=str[cornerFacelet[i][(ori+2)%3]];let j=-1;for(let jj=0;jj<8;jj++)if(cornerColor[jj][1]===c1&&cornerColor[jj][2]===c2){j=jj;break;}if(j<0)return 'corner bad '+i;if(cs.has(j))return 'corner dup';cs.add(j);cp[i]=j;co[i]=ori%3;}
  const ep=new Array(12),eo=new Array(12); const es=new Set();
  for(let i=0;i<12;i++){const a=str[edgeFacelet[i][0]],b=str[edgeFacelet[i][1]];let j=-1,o=0;for(let jj=0;jj<12;jj++){if(edgeColor[jj][0]===a&&edgeColor[jj][1]===b){j=jj;o=0;break;}if(edgeColor[jj][0]===b&&edgeColor[jj][1]===a){j=jj;o=1;break;}}if(j<0)return 'edge bad '+i;if(es.has(j))return 'edge dup';es.add(j);ep[i]=j;eo[i]=o;}
  if(co.reduce((s,x)=>s+x,0)%3!==0) return 'corner orient';
  if(eo.reduce((s,x)=>s+x,0)%2!==0) return 'edge orient';
  if(permParity(cp)!==permParity(ep)) return 'parity';
  return 'OK';
}

let pass=true;
function check(name,cond){console.log((cond?'PASS':'FAIL')+' - '+name); if(!cond)pass=false;}

const solved='UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
check('solved OK', validate(solved)==='OK');

// 多个有效乱态
let okN=0;
for(let i=0;i<30;i++){const c=new Cube(); c.randomize(); if(validate(c.asString())==='OK') okN++;}
check('30 random valid states all OK', okN===30);

// 破坏1：交换两个不同色的贴纸（计数仍各9，但破坏结构/奇偶）
let s=solved.split('');
[s[0],s[9]]=[s[9],s[0]]; // U<->R
check('swap two different-colored stickers -> invalid', validate(s.join(''))!=='OK');

// 破坏2：翻转一个棱块（颜色互换使 orientation 错）
s=solved.split('');
// UF edge facelets = [7,19]; solved both are U and F. swap them? that creates U at F pos & F at U pos => duplicate detection likely. instead change one sticker color
// 把 U8(idx7, U色) 改成 F 色，F2(idx19,F色) 改成 U 色 —— 等于翻转该棱
s[7]='F'; s[19]='U';
check('flip UF edge -> invalid', validate(s.join(''))!=='OK');

// 破坏3：扭转一个角块
s=solved.split('');
// URF corner facelets [8,9,20] = U,R,F. cyclic shift to twist
const a=s[8],b=s[9],c=s[20]; s[8]=c;s[9]=a;s[20]=b;
check('twist URF corner -> invalid', validate(s.join(''))!=='OK');

// 破坏4：制造不合法角块颜色组合（把一个角块的面贴改成不可能的三色）
s=solved.split('');
s[8]='F'; s[9]='U'; s[20]='R'; // URF 变成 F,U,R 循环 —— 实际仍是同色集合，只是朝向不同 -> 可能被朝向检查拦
check('rearrange corner colors -> invalid', validate(s.join(''))!=='OK');

// 破坏5：随机改一个贴纸颜色（制造计数错误）
s=solved.split(''); s[0]='R';
check('change one sticker -> invalid (count)', validate(s.join(''))!=='OK');

console.log('\n'+(pass?'ALL PASS':'SOME FAILED'));
process.exit(pass?0:1);
