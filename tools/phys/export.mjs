// 학습용으로 몸 모델(XML)과 관절 근육 값(ctrl.json)을 게임과 같은 코드(js/phys3d.js)로 만든다. node phys/export.mjs outdir [key=value ...]
import loadMujoco from '@mujoco/mujoco';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const P3 = await import(new URL('../../js/phys3d.js', import.meta.url).href);
const mj = await loadMujoco(); P3.setMJ(mj);
const out = process.argv[2]; mkdirSync(out, { recursive: true });
for (const a of process.argv.slice(3)) { const m = a.match(/^(\w+)=(.+)$/); if (m) P3.PHYS[m[1]] = JSON.parse(m[2]); }
const spec = JSON.parse(readFileSync(new URL('./spec.json', import.meta.url)));
const pb = new P3.PhysBody(mj, spec);
writeFileSync(out + '/model.xml', P3.buildXML(spec));
writeFileSync(out + '/ctrl.json', JSON.stringify({ PHYS: P3.PHYS, spec, M: pb.M, root: pb.root, J: pb.J.map(J => ({ n: J.n, k: J.k, qa: J.qa, da: J.da, bid: J.bid, kp: J.kp, kd: J.kd, tm: J.tm, I: J.I })), nq: pb.m.nq, nv: pb.m.nv, nbody: pb.m.nbody, bodies: Array.from({ length: pb.m.nbody }, (_, i) => pb.m.body(i).name) }, null, 1));
console.log('nq', pb.m.nq, 'nv', pb.m.nv, 'nbody', pb.m.nbody);
