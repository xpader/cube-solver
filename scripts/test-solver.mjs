import Cube from 'cubejs';

Cube.initSolver();

const c = new Cube();
c.move("R U R' U' F2 B L'");
const s = c.asString();
console.log('scrambled facelet:', s);
console.log('solved?', c.isSolved());

const sol = Cube.fromString(s).solve();
console.log('solution:', sol);

const c2 = new Cube();
c2.move("R U R' U' F2 B L'");
c2.move(sol);
console.log('after applying solution -> solved?', c2.isSolved());

const solvedStr = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
console.log('solved roundtrip ok?', Cube.fromString(solvedStr).asString() === solvedStr);
console.log('center letters (expect URFDLB):', [4, 13, 22, 31, 40, 49].map((i) => solvedStr[i]).join(''));
