// 3D 선수 물리 몸(MuJoCo, 1단계. 사용자 2026-11-23: 움직임을 애니메이션이 아니라 시뮬레이션처럼, 완전한 물리로).
// 선수 몸을 뼈마디 약 20개(질량·크기·관절)로 만들고 관절마다 근육(PD)을 단다. 지금 애니메이션(이동 엔진·모션캡처 스윙·IK)이 만든 자세는
// '목표'일 뿐이고, 화면에 그리는 몸은 근육으로 그 자세를 따라간다. 중력·바닥 마찰·충돌은 MuJoCo가 계산한다(발은 마찰로 땅에 붙고,
// 몸은 발로 땅을 밀어야 움직인다). 1단계라 넘어지지 않게 골반에 약한 보조 힘(목표 자리·방향 쪽 용수철, 크기 한도 있음)을 쓴다.
// 2단계에서 학습한 제어기(DReCon 방식)로 이 힘을 없앤다.
// 연출만이고 승패·난수와 상관없다. three.js 없이 돈다(tools/phys/에서 Node로 같은 코드를 돌려 맞춘다).
// MuJoCo: Google DeepMind, Apache-2.0 (vendor/mujoco/LICENSE)

export const PHYS = {
  dt: 1 / 600,          // 물리 한 걸음(초)
  maxSub: 24,           // 한 프레임에 최대 걸음 수
  mass: 55,             // 몸무게(kg)
  w: 60,                // 관절 근육의 고유 진동수(rad/s): 클수록 목표 자세를 빨리 따라간다
  zeta: 1.0,            // 감쇠비
  // 관절마다 최소 강성(Nm/rad): 몸무게를 받치는 다리·몸통은 자기 질량보다 훨씬 센 힘이 든다
  kpMin: { hips: 0, spine: 1800, chest: 1500, upperChest: 1200, neck: 250, head: 120, Shoulder: 300, UpperArm: 300, LowerArm: 200, Hand: 60, UpperLeg: 2600, LowerLeg: 2300, Foot: 900 },
  tauMax: { spine: 350, chest: 300, upperChest: 250, neck: 60, head: 40, Shoulder: 150, UpperArm: 150, LowerArm: 90, Hand: 40, UpperLeg: 350, LowerLeg: 350, Foot: 220 },
  armature: 0.004,      // 관절 회전자 관성(가벼운 손·발이 떨지 않게)
  // 골반 보조 힘(1단계): 목표 자리·방향 쪽 용수철. 한도는 몸무게(Mg) 비
  // 1단계 결과(2026-11-23, 확인 링크 40초): 보조 힘을 약하게 하면 몸이 애니메이션을 못 따라가 넘어진다(40초에 67번 다시 세움, 가로 0.35Mg).
  // 디딘 다리로 밀기(legs)도 넘어진다(79번, 센 보조 토크를 더해도 12~14번). 넘어지지 않을 만큼 세게 하면(아래 값) 보조 힘이 몸무게의 39%(가운데값,
  // 많을 때 1.5배)를 받치고 디딘 발이 11% 미끄러져(애니메이션은 0.1~4%) 물리 몸이 끌려다닐 뿐이다. 균형을 스스로 잡는 제어기(2단계, 학습)가 있어야 한다
  rootW: 10, rootZeta: 1.0, rootH: 1.5, rootUp: 1.2, rootDown: 0.2,
  rootWa: 14, rootTau: 800,
  sync: 1,              // 몸이 못 따라간 만큼 애니메이션을 물리 몸 쪽으로 옮기는 몫
  // 디딘 다리로 밀기(Coros 외 2010, 가상 힘): 골반을 목표 쪽으로 옮길 힘을 밖에서 주지 않고, 땅을 디딘 다리의 관절 힘(J^T f)으로 낸다.
  // 다리가 땅을 밀고 땅이 마찰로 받쳐 몸이 움직인다(마찰이 모자라면 발이 미끄러진다). 골반 기울기도 디딘 다리의 엉덩이 관절로 바로잡는다
  legs: false, legW: 7, legZeta: 1.0, legH: 0.9, legUp: 0.9, legDown: 0.5,
  residH: 0.04, residUp: 0.08, residTau: 50,   // 다리로 밀 때 남는 보조 힘(아주 작게)
  friction: 1.0,
};

let MJ = null, MJP = null;
// 브라우저: vendor/mujoco/mujoco.js(웹어셈블리)를 처음 부를 때 받는다. 못 받으면 null(물리 없이 예전 그대로)
export function loadMJ() {
  if (MJ) return Promise.resolve(MJ);
  if (!MJP) MJP = (async () => {
    try {
      const u = new URL('../vendor/mujoco/mujoco.js', import.meta.url).href;
      const mod = await import(/* 묶지 않는다 */ u);
      MJ = await mod.default();
    } catch (e) { console.warn('물리 엔진을 못 불러옴', e); MJ = null; }
    return MJ;
  })();
  return MJP;
}
export function setMJ(m) { MJ = m; }

// ── 몸 만들기 ──
// 리그의 처음(T 자세) 뼈 자리(리그 단위, 발 사이 바닥이 원점, +z 앞, +x 왼쪽)에서 몸 정의를 만든다(브라우저에서 한 번, Node에는 JSON으로 넘긴다)
export function restSpec(R, K) {
  const vrm = R.vrm, B = R.B;
  const names = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'].filter(n => B(n));
  const keep = [...names, 'leftToes', 'rightToes'].filter(n => B(n));
  const saved = keep.map(n => B(n).quaternion.clone()), sp0 = vrm.scene.position.clone(), sq0 = vrm.scene.quaternion.clone(), ss0 = vrm.scene.scale.clone();
  for (const n of R.ALLB) B(n).quaternion.identity();
  vrm.scene.position.set(0, 0, 0); vrm.scene.quaternion.identity(); vrm.scene.scale.setScalar(1); vrm.scene.updateMatrixWorld(true);
  const p = {};
  for (const n of keep) { const w = B(n).getWorldPosition(B(n).position.clone()); p[n] = [w.x, w.y, w.z]; }
  const bones = names.map(n => { let q = B(n).parent; while (q && !names.some(m => B(m) === q)) q = q.parent; return { n, parent: q ? names.find(m => B(m) === q) : null }; });
  keep.forEach((n, i) => B(n).quaternion.copy(saved[i]));
  vrm.scene.position.copy(sp0); vrm.scene.quaternion.copy(sq0); vrm.scene.scale.copy(ss0); vrm.scene.updateMatrixWorld(true);
  return { K, p, bones, ankle: R.ANKLE, grip: { pos: R.GRIP_POS.toArray(), shaft: [-0.45, 0, 0.89] } };
}

const MASS = { hips: 0.11, spine: 0.09, chest: 0.1, upperChest: 0.1, neck: 0.015, head: 0.055, Shoulder: 0.01, UpperArm: 0.027, LowerArm: 0.016, Hand: 0.006, UpperLeg: 0.14, LowerLeg: 0.043, Foot: 0.014 };
const RAD = { hips: 0.085, spine: 0.085, chest: 0.095, upperChest: 0.095, neck: 0.04, head: 0.09, Shoulder: 0.04, UpperArm: 0.038, LowerArm: 0.032, Hand: 0.026, UpperLeg: 0.062, LowerLeg: 0.045 };
const kindOf = n => n.replace(/^(left|right)/, '');
const RACKET = 0.3;   // 라켓 무게(kg): 오른손에 붙는다(휘두르는 팔이 그만큼 무겁다)

export function buildXML(sp, opt = {}) {
  const K = sp.K, P = n => sp.p[n], has = n => !!sp.p[n], f = x => (+x).toFixed(4), v = a => a.map(f).join(' ');
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => a.map(x => x * k);
  const kids = {}; for (const b of sp.bones) if (b.parent) (kids[b.parent] ||= []).push(b.n);
  const chestTop = has('upperChest') ? 'upperChest' : 'chest';
  const MAIN = { spine: 'chest', chest: has('upperChest') ? 'upperChest' : 'neck', upperChest: 'neck', neck: 'head' };
  for (const s of ['left', 'right']) Object.assign(MAIN, { [s + 'Shoulder']: s + 'UpperArm', [s + 'UpperArm']: s + 'LowerArm', [s + 'LowerArm']: s + 'Hand', [s + 'UpperLeg']: s + 'LowerLeg', [s + 'LowerLeg']: s + 'Foot' });
  let tot = 0; for (const b of sp.bones) tot += (kindOf(b.n) === 'chest' && !has('upperChest') ? 0.2 : MASS[kindOf(b.n)] || 0);
  const M = sp.mass || opt.mass || 55, mOf = n => M * (kindOf(n) === 'chest' && !has('upperChest') ? 0.2 : MASS[kindOf(n)]) / tot;
  const geoms = n => {
    const k = kindOf(n), m = mOf(n), r = (RAD[k] || 0.03) * K;
    if (n === 'hips') return `<geom name="g_hips" type="capsule" fromto="${v(mul(sub(P('leftUpperLeg'), P('hips')), K))} ${v(mul(sub(P('rightUpperLeg'), P('hips')), K))}" size="${f(r)}" mass="${f(m)}"/>`;
    if (k === 'head') return `<geom name="g_head" type="sphere" pos="${v([0, 0.09 * K, 0.01 * K])}" size="${f(r)}" mass="${f(m)}"/>`;
    if (k === 'Hand') {
      const s = n.startsWith('left') ? 1 : -1;
      let g = `<geom name="g_${n}" type="capsule" fromto="0 0 0 ${f(s * 0.08 * K)} 0 0" size="${f(r)}" mass="${f(m)}"/>`;
      if (n === 'rightHand' && sp.grip) {
        const gp = mul(sp.grip.pos, K), L = Math.hypot(...sp.grip.shaft), sh = sp.grip.shaft.map(x => x / L);
        const a = sub(gp, mul(sh, 0.1 * K)), b = [gp[0] + sh[0] * 0.6 * K, gp[1] + sh[1] * 0.6 * K, gp[2] + sh[2] * 0.6 * K];
        g += `<geom name="g_racket" type="capsule" fromto="${v(a)} ${v(b)}" size="0.012" mass="${RACKET}" contype="0" conaffinity="0"/>`;
      }
      return g;
    }
    if (k === 'Foot') {
      // 발: 발목(몸 원점) 아래 상자. 바닥은 처음 자세의 바닥(y = 0)에, 뒤꿈치부터 발끝까지(발가락 포함, 1단계는 발가락 관절 없이)
      const ank = P(n)[1], toe = has(n.replace('Foot', 'Toes')) ? sub(P(n.replace('Foot', 'Toes')), P(n)) : [0, -0.063, 0.11];
      const z0 = -0.07, z1 = toe[2] + 0.06, hy = 0.028;
      return `<geom name="g_${n}" type="box" pos="${v([toe[0] * 0.5 * K, (-ank + hy) * K, (z0 + z1) / 2 * K])}" size="${v([0.043 * K, hy * K, (z1 - z0) / 2 * K])}" mass="${f(m)}" friction="${PHYS.friction} 0.02 0.002"/>`;
    }
    const c = MAIN[n];
    if (!c) return '';
    return `<geom name="g_${n}" type="capsule" fromto="0 0 0 ${v(mul(sub(P(c), P(n)), K))}" size="${f(r)}" mass="${f(m)}"/>`;
  };
  const body = (n, parent) => {
    const rel = parent ? mul(sub(P(n), P(parent)), K) : mul(P(n), K);
    const jt = parent ? `<joint name="${n}" type="ball" armature="${PHYS.armature}"/>` : opt.fixRoot ? '' : '<freejoint name="root"/>';
    return `<body name="${n}" pos="${v(rel)}">${jt}${geoms(n)}${(kids[n] || []).map(c => body(c, n)).join('')}</body>`;
  };
  void chestTop;
  return `<mujoco model="player"><compiler angle="radian"/>
<option timestep="${PHYS.dt}" gravity="0 -9.81 0" integrator="implicitfast" iterations="30" ls_iterations="10"/>
<default><geom contype="0" conaffinity="1" condim="3" friction="${PHYS.friction} 0.02 0.002" solref="0.008 1" solimp="0.9 0.95 0.001"/></default>
<worldbody><geom name="floor" type="plane" size="40 40 0.1" euler="-1.5707963 0 0" contype="1" conaffinity="0"/>
${body('hips', null)}</worldbody></mujoco>`;
}

// ── 쿼터니언(w, x, y, z) ──
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qconj = a => [a[0], -a[1], -a[2], -a[3]];
const qnorm = a => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; };
const qrv = e => { if (e[0] < 0) e = [-e[0], -e[1], -e[2], -e[3]]; const s = Math.hypot(e[1], e[2], e[3]); if (s < 1e-9) return [2 * e[1], 2 * e[2], 2 * e[3]]; const a = 2 * Math.atan2(s, e[0]) / s; return [e[1] * a, e[2] * a, e[3] * a]; };
const qlerp = (a, b, u) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = d < 0 ? -1 : 1; return qnorm([a[0] + (s * b[0] - a[0]) * u, a[1] + (s * b[1] - a[1]) * u, a[2] + (s * b[2] - a[2]) * u, a[3] + (s * b[3] - a[3]) * u]); };
const qrot = (q, v) => { const t = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q)); return [t[1], t[2], t[3]]; };
const cap = (v, m) => { const l = Math.hypot(v[0], v[1], v[2]); return l > m ? v.map(x => x * m / l) : v; };

// 물리 몸 하나(선수 한 명). 목표: { p: 골반 세계 자리[3], q: 골반 세계 회전[w,x,y,z], j: 관절마다 부모 기준 회전(J 순서, 4개씩) }
export class PhysBody {
  constructor(mj, spec, opt = {}) {
    this.mj = mj; this.sp = spec; this.opt = opt;
    const m = this.m = mj.MjModel.from_xml_string(buildXML(spec, opt)), d = this.d = new mj.MjData(m);
    const jq = m.jnt_qposadr, jd = m.jnt_dofadr;
    this.root = opt.fixRoot ? null : { bid: m.body('hips').id, qa: jq[m.jnt('root').id], da: jd[m.jnt('root').id] };
    this.J = spec.bones.filter(b => b.parent).map(b => { const id = m.jnt(b.n).id; return { n: b.n, k: kindOf(b.n), qa: jq[id], da: jd[id], bid: m.body(b.n).id }; });
    const bm = m.body_mass; let M = 0; for (let i = 0; i < m.nbody; i++) M += bm[i]; this.M = M;
    // 관절마다 처음 자세에서 그 아래 몸 전체의 관성(관절 둘레)으로 근육 세기를 정한다
    mj.mj_forward(m, d);
    const par = m.body_parentid, xi = d.xipos, xp = d.xpos, bI = m.body_inertia;
    const under = (b, a) => { while (b > 0) { if (b === a) return true; b = par[b]; } return false; };
    const P = PHYS, h = P.dt;
    for (const J of this.J) {
      let I = P.armature;
      for (let b = 1; b < m.nbody; b++) if (under(b, J.bid)) { const dx = xi[3 * b] - xp[3 * J.bid], dy = xi[3 * b + 1] - xp[3 * J.bid + 1], dz = xi[3 * b + 2] - xp[3 * J.bid + 2]; I += bm[b] * (dx * dx + dy * dy + dz * dz) + (bI[3 * b] + bI[3 * b + 1] + bI[3 * b + 2]) / 3; }
      let kp = Math.max(I * P.w * P.w, P.kpMin[J.k] || 0);
      kp = Math.min(kp, I * (0.45 / h) ** 2);   // 명시적 용수철이 터지지 않게
      J.I = I; J.kp = kp; J.kd = 2 * P.zeta * Math.sqrt(kp * I); J.tm = P.tauMax[J.k] || 100;
      // 감쇠는 MuJoCo가 암시적으로(관절 damping) 계산한다. 직접 계산하면 가운데 가벼운 마디(척추·어깨)가 떨었다
      for (let k = 0; k < 3; k++) m.dof_damping[J.da + k] = J.kd;
    }
    this.prev = null; this.stat = { f: 0, t: 0, n: 0 };
    // 디딘 다리로 밀기: 다리마다 관절(엉덩이·무릎·발목)의 자유도, 발·허벅지 몸 번호
    this.jp = new mj.DoubleBuffer(3 * m.nv); this.jr = new mj.DoubleBuffer(3 * m.nv);
    const jOf = n => this.J.find(J => J.n === n);
    this.legs = ['left', 'right'].map(sd => ({ foot: m.body(sd + 'Foot').id, thigh: m.body(sd + 'UpperLeg').id, hip: jOf(sd + 'UpperLeg').da, dofs: ['UpperLeg', 'LowerLeg', 'Foot'].flatMap(k => { const J = jOf(sd + k); return [J.da, J.da + 1, J.da + 2]; }) }));
    this.footY = spec.ankle * spec.K;
  }
  // 목표 자세로 바로 옮긴다(처음, 화면을 끊고 자리를 옮길 때)
  reset(T) {
    const { m, d, mj } = this, q = d.qpos, qv = d.qvel, r = this.root;
    if (r) { q[r.qa] = T.p[0]; q[r.qa + 1] = T.p[1]; q[r.qa + 2] = T.p[2]; for (let k = 0; k < 4; k++) q[r.qa + 3 + k] = T.q[k]; }
    this.J.forEach((J, i) => { for (let k = 0; k < 4; k++) q[J.qa + k] = T.j[4 * i + k]; });
    for (let i = 0; i < m.nv; i++) qv[i] = 0;
    mj.mj_forward(m, d);
    this.prev = { p: T.p.slice(), q: T.q.slice(), j: Float64Array.from(T.j) };
  }
  // dt초 동안 목표를 따라간다(프레임 사이 목표는 앞 프레임 목표에서 고르게 넘어간다)
  step(dt, T) {
    if (!this.prev) { this.reset(T); return; }
    if (!(dt > 0)) return;
    const { m, d, mj } = this, P = PHYS, r = this.root, Pv = this.prev;
    const n = Math.max(1, Math.min(P.maxSub, Math.round(dt / P.dt))), h = dt / n;
    m.opt.timestep = h;
    const vT = cap([(T.p[0] - Pv.p[0]) / dt, (T.p[1] - Pv.p[1]) / dt, (T.p[2] - Pv.p[2]) / dt], 9);
    const wT = cap(qrv(qmul(qnorm(T.q), qconj(qnorm(Pv.q)))).map(x => x / dt), 25);   // 골반 목표 각속도(세계)
    const nj = this.J.length, wJ = new Float64Array(3 * nj);
    for (let i = 0; i < nj; i++) { const a = [Pv.j[4 * i], Pv.j[4 * i + 1], Pv.j[4 * i + 2], Pv.j[4 * i + 3]], b = [T.j[4 * i], T.j[4 * i + 1], T.j[4 * i + 2], T.j[4 * i + 3]]; const w = cap(qrv(qmul(qconj(a), b)).map(x => x / dt), 40); wJ.set(w, 3 * i); }
    const M = this.M, g = 9.81, kpl = M * P.rootW ** 2, kdl = 2 * P.rootZeta * M * P.rootW, Ib = 0.12 * M, kpa = Ib * P.rootWa ** 2, kda = 2 * Ib * P.rootWa;
    for (let s = 0; s < n; s++) {
      const u = (s + 1) / n, q = d.qpos, qv = d.qvel, qf = d.qfrc_applied, xf = d.xfrc_applied;
      // 관절 근육
      for (let i = 0; i < nj; i++) {
        const J = this.J[i], a = J.qa, cur = [q[a], q[a + 1], q[a + 2], q[a + 3]];
        const tg = qlerp([Pv.j[4 * i], Pv.j[4 * i + 1], Pv.j[4 * i + 2], Pv.j[4 * i + 3]], [T.j[4 * i], T.j[4 * i + 1], T.j[4 * i + 2], T.j[4 * i + 3]], u);
        const e = qrv(qmul(qconj(qnorm(cur)), tg));
        // 용수철(목표 쪽) + 목표 각속도만큼(감쇠 -kd·ω는 관절 damping이 한다)
        let tx = J.kp * e[0] + J.kd * wJ[3 * i], ty = J.kp * e[1] + J.kd * wJ[3 * i + 1], tz = J.kp * e[2] + J.kd * wJ[3 * i + 2];
        const l = Math.hypot(tx, ty, tz); if (l > J.tm) { tx *= J.tm / l; ty *= J.tm / l; tz *= J.tm / l; }
        qf[J.da] = tx; qf[J.da + 1] = ty; qf[J.da + 2] = tz;
      }
      // 골반 보조 힘(1단계): 목표 자리·방향 쪽으로, 한도 안에서
      if (!r) { mj.mj_step(m, d); continue; }
      const ra = r.qa, pT = [Pv.p[0] + (T.p[0] - Pv.p[0]) * u, Pv.p[1] + (T.p[1] - Pv.p[1]) * u, Pv.p[2] + (T.p[2] - Pv.p[2]) * u];
      const lv = [qv[r.da], qv[r.da + 1], qv[r.da + 2]];
      let F = [kpl * (pT[0] - q[ra]) + kdl * (vT[0] - lv[0]), kpl * (pT[1] - q[ra + 1]) + kdl * (vT[1] - lv[1]), kpl * (pT[2] - q[ra + 2]) + kdl * (vT[2] - lv[2])];
      const rq = qnorm([q[ra + 3], q[ra + 4], q[ra + 5], q[ra + 6]]), qT = qlerp(Pv.q, T.q, u);
      const wW = qrot(rq, [qv[r.da + 3], qv[r.da + 4], qv[r.da + 5]]), eW = qrv(qmul(qT, qconj(rq)));
      let Tq = [kpa * eW[0] + kda * (wT[0] - wW[0]), kpa * eW[1] + kda * (wT[1] - wW[1]), kpa * eW[2] + kda * (wT[2] - wW[2])];
      const xp = d.xpos, st = P.legs ? this.legs.filter(L => xp[3 * L.foot + 1] < this.footY + 0.015) : [];
      if (st.length) {
        // 디딘 다리로: 골반을 목표 쪽으로 옮길 힘(무게는 관절 근육이 받친다)을 다리 관절 힘으로. 다리가 땅을 그 반대로 민다
        const kv = M * P.legW ** 2, dv = 2 * P.legZeta * M * P.legW;
        let G = [kv * (pT[0] - q[ra]) + dv * (vT[0] - lv[0]), kv * (pT[1] - q[ra + 1]) + dv * (vT[1] - lv[1]), kv * (pT[2] - q[ra + 2]) + dv * (vT[2] - lv[2])];
        const gh = Math.hypot(G[0], G[2]), gm = P.legH * M * g; if (gh > gm) { G[0] *= gm / gh; G[2] *= gm / gh; }
        G[1] = Math.max(-P.legDown * M * g, Math.min(P.legUp * M * g, G[1]));
        const nv = m.nv, TqL = cap(Tq, P.rootTau);
        for (const L of st) {
          const fx = -G[0] / st.length, fy = -G[1] / st.length, fz = -G[2] / st.length;
          mj.mj_jac(m, d, this.jp, this.jr, [xp[3 * L.foot], xp[3 * L.foot + 1], xp[3 * L.foot + 2]], L.foot);
          const Jv = this.jp.GetView();
          for (const c of L.dofs) qf[c] += Jv[c] * fx + Jv[nv + c] * fy + Jv[2 * nv + c] * fz;
          // 골반 기울기: 디딘 엉덩이 관절이 허벅지를 반대로 돌리며 골반을 돌린다(허벅지 기준 축으로)
          const xq = d.xquat, tq = [xq[4 * L.thigh], xq[4 * L.thigh + 1], xq[4 * L.thigh + 2], xq[4 * L.thigh + 3]], tl = qrot(qconj(tq), TqL.map(x => -x / st.length));
          qf[L.hip] += tl[0]; qf[L.hip + 1] += tl[1]; qf[L.hip + 2] += tl[2];
        }
        this.stat.leg = (this.stat.leg || 0) + Math.hypot(...G) / (M * g);
        F = cap([F[0], 0, F[2]], P.residH * M * g).map((x, k) => k === 1 ? Math.max(-P.residUp * M * g, Math.min(P.residUp * M * g, F[1])) : x);
        Tq = cap(Tq, P.residTau);
      } else if (P.legs) {
        // 두 발이 다 떠 있으면 디딜 곳이 없다: 보조 힘만(작게)
        F = cap([F[0], 0, F[2]], P.residH * M * g).map((x, k) => k === 1 ? Math.max(-P.residUp * M * g, Math.min(P.residUp * M * g, F[1])) : x);
        Tq = cap(Tq, P.residTau);
      }
      if (!P.legs) {
        const fh = Math.hypot(F[0], F[2]), hm = P.rootH * M * g; if (fh > hm) { F[0] *= hm / fh; F[2] *= hm / fh; }
        F[1] = Math.max(-P.rootDown * M * g, Math.min(P.rootUp * M * g, F[1])); Tq = cap(Tq, P.rootTau);
      }
      const b6 = 6 * r.bid; xf[b6] = F[0]; xf[b6 + 1] = F[1]; xf[b6 + 2] = F[2]; xf[b6 + 3] = Tq[0]; xf[b6 + 4] = Tq[1]; xf[b6 + 5] = Tq[2];
      this.stat.f += Math.hypot(F[0], F[1], F[2]) / (M * g); this.stat.t += Math.hypot(...Tq); this.stat.n++;
      mj.mj_step(m, d);
    }
    // 넘어지거나 터지면(숫자가 이상하면) 목표 자세로 돌려놓는다
    const q = d.qpos; if (r && (!Number.isFinite(q[r.qa]) || Math.abs(q[r.qa + 1] - T.p[1]) > 0.6 || Math.hypot(q[r.qa] - T.p[0], q[r.qa + 2] - T.p[2]) > 1.2)) { this.resets = (this.resets || 0) + 1; this.reset(T); return; }
    this.prev = { p: T.p.slice(), q: T.q.slice(), j: Float64Array.from(T.j) };
  }
  // 지금 몸 자세(목표와 같은 꼴)
  out() {
    const q = this.d.qpos, r = this.root, o = { p: r ? [q[r.qa], q[r.qa + 1], q[r.qa + 2]] : this.prev?.p.slice() || [0, 0, 0], q: r ? qnorm([q[r.qa + 3], q[r.qa + 4], q[r.qa + 5], q[r.qa + 6]]) : [1, 0, 0, 0], j: new Float64Array(4 * this.J.length) };
    this.J.forEach((J, i) => { const a = qnorm([q[J.qa], q[J.qa + 1], q[J.qa + 2], q[J.qa + 3]]); o.j.set(a, 4 * i); });
    return o;
  }
  // 몸 부분의 세계 자리(잴 때)
  bodyPos(name) { const id = this.m.body(name).id, x = this.d.xpos; return [x[3 * id], x[3 * id + 1], x[3 * id + 2]]; }
  dispose() { try { this.d.delete(); this.m.delete(); } catch { } }
}
