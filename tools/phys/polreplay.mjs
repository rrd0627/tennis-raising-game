// 녹화한 참고 동작(refs/rN.json)을 게임 코드(PhysBody + Policy, MuJoCo 웹어셈블리)로 따라가 본다
import loadMujoco from '@mujoco/mujoco';
import { readFileSync } from 'node:fs';

const P3 = await import(new URL('../../js/phys3d.js', import.meta.url).href);
const mj = await loadMujoco(); P3.setMJ(mj);
const R = JSON.parse(readFileSync(process.argv[2]));
const pol = new P3.Policy(JSON.parse(readFileSync(new URL('../../art/char3d/policy.json', import.meta.url))));
const usePol = process.argv[3] !== 'nopol', SYNC = process.argv[4] || 'bleed';
let falls = 0, frames = 0, err = [], offs = [];
for (let i = 0; i < 4; i++) {
  const pb = new P3.PhysBody(mj, R.spec); if (usePol) pb.usePolicy(pol);
  const F = R.frames.filter(f => f[0] === i).sort((a, b) => a[1] - b[1]);
  let prev = null, off = [0, 0];
  for (const f of F) {
    const [, bt, cut, p0, q, j] = f, p = [p0[0] + off[0], p0[1], p0[2] + off[1]], T = { p, pr: p0, q, j: Float64Array.from(j) };
    const jump2 = prev && (Math.hypot(p0[0] - prev.p0[0], p0[2] - prev.p0[2]) > 0.35 || cut || bt - prev.bt > 0.05);
    if (!prev || jump2) { off = [0, 0]; T.p = p0.slice(); pb.reset(T); } else { const r0 = pb.resets || 0; pb.step(bt - prev.bt, T); if ((pb.resets || 0) > r0) falls++; }
    const o = pb.out(); err.push(Math.hypot(o.p[0] - T.p[0], o.p[2] - T.p[2])); frames++;
    if (SYNC === 'sync') { off[0] += o.p[0] - T.p[0]; off[1] += o.p[2] - T.p[2]; }
    else if (SYNC === 'bleed') { const k = P3.PHYS.bleed; off[0] = (o.p[0] - p0[0]) * (1 - k); off[1] = (o.p[2] - p0[2]) * (1 - k); }
    offs.push(Math.hypot(o.p[0] - p0[0], o.p[2] - p0[2]));
    prev = { p0, bt };
  }
}
err.sort((a, b) => a - b);
offs.sort((a, b) => a - b);
console.log('offset from animation cm p50', (offs[offs.length >> 1] * 100).toFixed(1), 'p90', (offs[Math.floor(offs.length * 0.9)] * 100).toFixed(1));
console.log(usePol ? 'policy' : 'no policy', 'frames', frames, 'falls', falls, 'per min', (falls / (frames / 4 / 30 / 60)).toFixed(1), 'root err cm p50', (err[err.length >> 1] * 100).toFixed(1), 'p90', (err[Math.floor(err.length * 0.9)] * 100).toFixed(1));
