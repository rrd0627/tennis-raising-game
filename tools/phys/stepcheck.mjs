import loadMujoco from '@mujoco/mujoco';
import { readFileSync } from 'node:fs';

const P3 = await import(new URL('../../js/phys3d.js', import.meta.url).href);
const mj = await loadMujoco(); P3.setMJ(mj);
const spec = JSON.parse(readFileSync(new URL('./spec.json', import.meta.url)));
const R = JSON.parse(readFileSync(new URL('./stepcheck.json', import.meta.url)));
const pb = new P3.PhysBody(mj, spec);
R.jax.forEach((c, k) => {
  const q = pb.d.qpos, v = pb.d.qvel; c.qpos.forEach((x, i) => q[i] = x); c.qvel.forEach((x, i) => v[i] = x); mj.mj_forward(pb.m, pb.d);
  pb.pol = { run: () => Float32Array.from(c.a) }; pb.tg = Float64Array.from(c.prev); pb.sub = 0; pb.acc = 0; pb.refPrev = { p: c.T.p, q: c.T.q }; pb.prev = { p: c.T.p, q: c.T.q, j: c.T.j };
  pb.stepPolicy(1 / 30, { p: c.T.p, q: c.T.q, j: Float64Array.from(c.T.j) });
  const q1 = Array.from(pb.d.qpos);
  const dj = Math.max(...q1.map((x, i) => Math.abs(x - c.qpos1[i]))), dw = Math.max(...q1.map((x, i) => Math.abs(x - R.warp[k].qpos1[i])));
  const moved = Math.max(...q1.map((x, i) => Math.abs(x - c.qpos[i])));
  console.log('case', k, 'JS moved', moved.toFixed(3), '| vs jax', dj.toFixed(4), '| vs warp', dw.toFixed(4), 'resets', pb.resets || 0, 'argmax', q1.map((x, i) => Math.abs(x - c.qpos1[i])).indexOf(dj));
});
