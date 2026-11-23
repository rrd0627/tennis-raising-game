// 게임의 관측(obsOf)·제어기(Policy)가 학습 환경과 같은지 본다
import loadMujoco from '@mujoco/mujoco';
import { readFileSync } from 'node:fs';

const P3 = await import(new URL('../../js/phys3d.js', import.meta.url).href);
const mj = await loadMujoco(); P3.setMJ(mj);
const spec = JSON.parse(readFileSync(new URL('./spec.json', import.meta.url)));
const pol = new P3.Policy(JSON.parse(readFileSync(process.argv[2] || new URL('../../art/char3d/policy.json', import.meta.url))));
const cases = JSON.parse(readFileSync(process.argv[3] || 'check.json'));
const pb = new P3.PhysBody(mj, spec); pb.usePolicy(pol);
for (const c of cases) {
  const q = pb.d.qpos, v = pb.d.qvel; c.qpos.forEach((x, i) => q[i] = x); c.qvel.forEach((x, i) => v[i] = x);
  const o = pb.obsOf(c.R);
  let worst = 0, wi = -1; o.forEach((x, i) => { const e = Math.abs(x - c.obs[i]); if (e > worst) { worst = e; wi = i; } });
  const a = pol.run(o); let wa = 0; a.forEach((x, i) => wa = Math.max(wa, Math.abs(x - c.act[i])));
  console.log('obs', o.length, 'vs', c.obs.length, 'max diff', worst.toExponential(2), 'at', wi, '| action max diff', wa.toExponential(2));
}
