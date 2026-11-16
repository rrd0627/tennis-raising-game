// 3D 선수의 이동 엔진(모션 매칭, 사용자 2026-11-16: 트리플A 게임처럼 '어디로 갈지 정하고 → 자연스럽게 가고 → 도착하면 다음 동작').
// 자료: 사람이 걷고·달리고·옆으로·뒤로 가고·서 있는 모션캡처(100STYLE Neutral, CC BY 4.0, tools/char3d/mocap/loco.py가 art/char3d/loco.bin으로 만든다).
// 하는 일(트리플A의 방식을 따랐다):
//   1) 갈 길(목표가 0.2·0.4·0.6초 뒤 있을 자리와 바라볼 쪽)을 받아, 앞으로 갈 길과 지금 발·몸 빠르기가 가장 비슷한 프레임을 자료에서 찾는다(0.1초마다).
//   2) 그 프레임부터 이어 틀며, 몸(뿌리)은 동작 자체의 움직임(발이 밀어서 나오는 움직임)으로 간다. 동작이 바뀔 때는 앞 자세에서 이어지게(관성 이어붙이기).
//   3) 엔진이 정한 자리(목표)와의 차이는 빠르기에 비례해 조금씩만 당겨 맞추고(빠르기 제한 보정), 너무 벌어지면 그 거리 안으로 묶는다.
//   4) 자료보다 빨리 가야 하면 더 빨리 틀고(걸음이 잦아짐) 보폭을 늘린다(stride warping).
// 발은 자료의 '발 닿음'을 함께 내보내고, 닿은 발을 코트에 붙이는 일(발 고정 IK)은 players3d.js가 한다. 연출만이고 승패·난수와 상관없다
const FPS = 30, FUT = [6, 12, 18];   // 앞으로 갈 길을 보는 때(프레임, 0.2·0.4·0.6초)
const CAND_STEP = 2;                  // 찾을 때 프레임 간격
const SEARCH_EVERY = 0.1;             // 초
const BLEND = 0.22;                   // 동작이 바뀔 때 앞 자세에서 넘어가는 시간(초)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapR = a => Math.atan2(Math.sin(a), Math.cos(a));
const wrapD = a => ((a % 360) + 540) % 360 - 180;

export class LocoDB {
  constructor(buf) {
    const dv = new DataView(buf);
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'LOC1') throw new Error('loco.bin 형식이 아니다');
    const n = dv.getUint32(4, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
    let off = 8 + n; off += (4 - off % 4) % 4;
    this.meta = meta; this.C = meta.channels.length; this.N = meta.n; this.hipH = meta.hipH;
    this.A = new Float32Array(buf.slice(off, off + this.N * this.C * 4));
    const ch = {}; meta.channels.forEach((c, i) => { ch[c] = i; }); this.ch = ch;
    // 프레임마다 구간 끝(다음 구간으로 건너뛰지 않게)
    this.segEnd = new Int32Array(this.N); this.segBeg = new Int32Array(this.N);
    const S = meta.segs;
    for (let k = 0; k + 1 < S.length; k++) for (let i = S[k]; i < S[k + 1]; i++) { this.segBeg[i] = S[k]; this.segEnd[i] = S[k + 1]; }
    // 가슴 앞숙임 가운데값(골반 기준 가슴 각의 기준. 게임은 이 차이만 준비 자세에 더한다)
    const cps = []; for (let i = 0; i < this.N; i += 7) cps.push(this.v(i, 'cp')); cps.sort((a, b) => a - b); this.cp0 = cps[cps.length >> 1];
    // 서 있는 프레임(처음 자리 잡을 때)
    let best = 0, bs = 1e9;
    for (let i = this.segBeg[S[1]] + 30; i < S[2] - 30; i += 3) { const s = this.speedAt(i); if (s < bs) { bs = s; best = i; } }
    this.idle = best;
    // 찾을 프레임과 특징(앞으로 갈 길 6, 그때 바라볼 쪽 6, 발 자리 4, 발 빠르기 4, 몸 빠르기 2)
    const cand = [];
    for (let i = 0; i < this.N; i += CAND_STEP) if (i - 1 >= this.segBeg[i] && i + FUT[FUT.length - 1] + 1 < this.segEnd[i]) cand.push(i);
    this.cand = Int32Array.from(cand);
    this.D = 22; this.F = new Float32Array(cand.length * this.D);
    const tmp = new Float32Array(this.D);
    cand.forEach((i, j) => { this.feat(i, tmp); this.F.set(tmp, j * this.D); });
    // 묶음마다 크기를 맞추고(표준편차) 무게를 준다
    const groups = [[0, 6, 1.0], [6, 12, 1.4], [12, 16, 0.7], [16, 20, 0.9], [20, 22, 1.0]];
    this.W = new Float32Array(this.D); this.M = new Float32Array(this.D);
    for (const [a, b, wt] of groups) {
      let s = 0, s2 = 0, c = 0;
      for (let j = 0; j < cand.length; j++) for (let d = a; d < b; d++) { const v = this.F[j * this.D + d]; s += v; s2 += v * v; c++; }
      const m = s / c, sd = Math.sqrt(Math.max(1e-6, s2 / c - m * m));
      for (let d = a; d < b; d++) { this.W[d] = wt / sd; this.M[d] = 0; }
    }
    for (let j = 0; j < cand.length; j++) for (let d = 0; d < this.D; d++) this.F[j * this.D + d] *= this.W[d];
  }
  v(i, c) { return this.A[i * this.C + this.ch[c]]; }
  // 프레임 i(소수)의 값(선형). 구간을 넘지 않는다
  vf(f, c) {
    const i = Math.floor(f), u = f - i, e = this.segEnd[i] - 1, j = Math.min(i + 1, e);
    const a = this.v(i, c), b = this.v(j, c);
    if (c === 'ry') return a + (b - a) * u;
    if (c === 'hyaw' || c === 'cy' || c === 'cr' || c === 'cp' || c === 'rfy' || c === 'lfy') return a + wrapD(b - a) * u;
    return a + (b - a) * u;
  }
  speedAt(i) { const j = Math.min(i + 3, this.segEnd[i] - 1), k = Math.max(i - 3, this.segBeg[i]); return Math.hypot(this.v(j, 'rx') - this.v(k, 'rx'), this.v(j, 'rz') - this.v(k, 'rz')) / Math.max(1, j - k) * FPS; }
  // 세계 자리를 프레임 i의 뿌리 기준(x 왼쪽, z 앞)으로
  toLocal(i, wx, wz) { const ry = this.v(i, 'ry'), c = Math.cos(ry), s = Math.sin(ry), dx = wx - this.v(i, 'rx'), dz = wz - this.v(i, 'rz'); return [c * dx - s * dz, s * dx + c * dz]; }
  dirLocal(i, ry2) { const a = ry2 - this.v(i, 'ry'); return [Math.sin(a), Math.cos(a)]; }
  footW(i, side) { const ry = this.v(i, 'ry'), c = Math.cos(ry), s = Math.sin(ry), lx = this.v(i, side + 'fx'), lz = this.v(i, side + 'fz'); return [this.v(i, 'rx') + c * lx + s * lz, this.v(i, 'rz') - s * lx + c * lz]; }
  feat(i, out) {
    let d = 0;
    for (const k of FUT) { const p = this.toLocal(i, this.v(i + k, 'rx'), this.v(i + k, 'rz')); out[d++] = p[0]; out[d++] = p[1]; }
    for (const k of FUT) { const q = this.dirLocal(i, this.v(i + k, 'ry')); out[d++] = q[0]; out[d++] = q[1]; }
    this.featPose(i, out);
    return out;
  }
  // 지금 자세 특징(12~21): 발 자리, 발 빠르기, 몸 빠르기(뿌리 기준). i-1, i+1만 본다
  featPose(i, out) {
    i = clamp(i, this.segBeg[i] + 1, this.segEnd[i] - 2);
    let d = 12;
    out[d++] = this.v(i, 'rfx'); out[d++] = this.v(i, 'rfz'); out[d++] = this.v(i, 'lfx'); out[d++] = this.v(i, 'lfz');
    for (const sd of ['rf', 'lf']) {
      const a = this.footW(i - 1, sd[0]), b = this.footW(i + 1, sd[0]), v = this.toLocal(i, this.v(i, 'rx') + (b[0] - a[0]) * FPS / 2, this.v(i, 'rz') + (b[1] - a[1]) * FPS / 2);
      out[d++] = v[0]; out[d++] = v[1];
    }
    const rv = this.toLocal(i, this.v(i, 'rx') + (this.v(i + 1, 'rx') - this.v(i - 1, 'rx')) * FPS / 2, this.v(i, 'rz') + (this.v(i + 1, 'rz') - this.v(i - 1, 'rz')) * FPS / 2);
    out[d++] = rv[0]; out[d++] = rv[1];
    return out;
  }
  // 질의 q(이미 무게를 곱한 값)에 가장 가까운 후보 프레임
  search(q, skipA = -1, skipB = -1) {
    const F = this.F, D = this.D, n = this.cand.length; let best = -1, bc = Infinity;
    for (let j = 0; j < n; j++) {
      const i = this.cand[j]; if (i >= skipA && i <= skipB) continue;
      let c = 0; const o = j * D;
      for (let d = 0; d < D; d++) { const e = F[o + d] - q[d]; c += e * e; if (c >= bc) break; }
      if (c < bc) { bc = c; best = i; }
    }
    return { i: best, cost: bc };
  }
}

const URL_ = (() => { try { const u = new URL('../art/char3d/loco.bin', import.meta.url); u.search = new URL(import.meta.url).search; return u.href; } catch { return 'art/char3d/loco.bin'; } })();
let pending = null;
export function loadLoco() {
  if (!pending) pending = (async () => {
    if (typeof location !== 'undefined' && location.protocol === 'file:') return null;
    const r = await fetch(URL_); if (!r.ok) throw new Error('HTTP ' + r.status);
    return new LocoDB(await r.arrayBuffer());
  })().catch(e => { console.warn('이동 동작 자료를 못 불러왔다. 예전 걸음을 쓴다', e); pending = null; return null; });
  return pending;
}

// 선수 하나의 이동 상태. x, z, yaw = 뿌리(세계, 자료 단위 m를 게임 m로 옮기는 배율 sc를 곱해 움직인다)
export function locoState(db, x, z, yaw, sc) {
  return { f: db.idle, x, z, yaw, vx: 0, vz: 0, r: 1, w: 1, sc, tS: 9, off: null, offT: 0, q: new Float32Array(db.D), cur: new Float32Array(db.D) };
}
const KEYS = ['hx', 'hy', 'hz', 'hyaw', 'cy', 'cp', 'cr', 'rfx', 'rfz', 'rfy', 'rfl', 'rhe', 'lfx', 'lfz', 'lfy', 'lfl', 'lhe'];
const ANG = new Set(['hyaw', 'cy', 'cp', 'cr', 'rfy', 'lfy']);
function poseAt(db, f) { const o = {}; for (const k of KEYS) o[k] = db.vf(f, k); o.rc = db.vf(f, 'rc'); o.lc = db.vf(f, 'lc'); return o; }

// 한 프레임: Q = { fut(t) → [x, z] 목표가 t초 뒤 있을 자리(세계), face(t) → 그때 바라볼 쪽(라디안, 세계), tx, tz 지금 목표, maxOff 벌어져도 되는 거리, force 바로 찾기 }
// 돌려주는 값: 자세(자료 단위: 뿌리 기준 골반·가슴·발, 발 닿음 rc lc), 몸 빠르기
export function locoUpdate(db, s, dt, Q) {
  if (dt <= 0) return poseOut(db, s);
  const x0 = s.x, z0 = s.z;
  // 1) 이어 튼다(뿌리는 자료의 움직임대로, 보폭 배율 w)
  const end = db.segEnd[Math.floor(s.f)] - 1.001;
  let f1 = s.f + dt * FPS * s.r, force = !!Q.force;
  if (f1 >= end - FUT[FUT.length - 1] * 0.5) force = true;
  f1 = Math.min(f1, end);
  const a = s.f, ry0 = db.vf(a, 'ry'), ry1 = db.vf(f1, 'ry');
  const dxw = db.vf(f1, 'rx') - db.vf(a, 'rx'), dzw = db.vf(f1, 'rz') - db.vf(a, 'rz'), c0 = Math.cos(ry0), s0 = Math.sin(ry0);
  const lx = c0 * dxw - s0 * dzw, lz = s0 * dxw + c0 * dzw;   // 자료 뿌리 기준 움직임
  const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), k = s.w * s.sc;
  s.x += (cy * lx + sy * lz) * k; s.z += (-sy * lx + cy * lz) * k; s.yaw += ry1 - ry0;
  s.f = f1;
  // 2) 0.1초마다(또는 구간 끝, 크게 바뀌면) 앞으로 갈 길이 가장 비슷한 프레임을 찾는다
  s.tS += dt;
  if (force || s.tS >= SEARCH_EVERY) {
    s.tS = 0;
    const want = query(db, s, Q, s.q);
    const ci = Math.round(s.f / CAND_STEP) * CAND_STEP;
    let curCost = Infinity;
    if (ci - 1 >= db.segBeg[ci] && ci + FUT[FUT.length - 1] + 1 < db.segEnd[ci]) {
      db.feat(ci, s.cur); curCost = 0; for (let d = 0; d < db.D; d++) { const e = s.cur[d] * db.W[d] - want[d]; curCost += e * e; }
    }
    const b = db.search(want, Math.floor(s.f) - 8, Math.floor(s.f) + 8);
    if (b.i >= 0 && (force || b.cost < curCost * 0.85 - 0.05)) {
      // 관성 이어붙이기: 앞 자세와의 차이를 BLEND초에 걸쳐 0으로
      const p0 = poseOut(db, s, true), p1 = poseAt(db, b.i);
      s.off = {}; for (const kk of KEYS) s.off[kk] = ANG.has(kk) ? wrapD(p0[kk] - p1[kk]) : p0[kk] - p1[kk];
      s.offT = 0; s.f = b.i;
    }
    // 빠르기 맞추기: 자료가 가는 빠르기와 가려는 빠르기의 비. 더 빨리 틀고(걸음이 잦아짐) 보폭을 늘린다
    const vd = Math.hypot(...sub(Q.fut(0.3), Q.fut(0))) / 0.3, vf = db.speedAt(Math.floor(s.f)) * s.sc;
    const ratio = vf > 0.35 ? clamp(vd / vf, 0.8, 2.8) : 1;
    s.rT = clamp(Math.pow(ratio, 0.68), 0.85, 1.95); s.wT = clamp(Math.pow(ratio, 0.32), 0.92, 1.32);   // 보폭은 1.3배까지(더 늘리면 다리를 찢듯 벌렸다)
  }
  const kr = 1 - Math.exp(-dt / 0.12);
  s.r += ((s.rT ?? 1) - s.r) * kr; s.w += ((s.wT ?? 1) - s.w) * kr;
  // 3) 목표와의 차이를 조금씩: 반감기 0.25초, 한 프레임에 (몸 빠르기의 60% + 초속 0.3m)까지. 그래도 maxOff보다 벌어지면 그 안으로
  const ex = Q.tx - s.x, ez = Q.tz - s.z, el = Math.hypot(ex, ez);
  if (el > 1e-4) {
    const sp = Math.hypot(s.x - x0, s.z - z0) / dt, m = Math.min(el * (1 - Math.exp(-dt * Math.LN2 / 0.25)), (0.6 * sp + 0.3) * dt);
    s.x += ex / el * m; s.z += ez / el * m;
    const e2 = Math.hypot(Q.tx - s.x, Q.tz - s.z), mo = Q.maxOff ?? 0.45;
    if (e2 > mo) { const u = (e2 - mo) / e2; s.x += (Q.tx - s.x) * u; s.z += (Q.tz - s.z) * u; }
  }
  // 바라볼 쪽도 조금씩(반감기 0.15초, 초당 (자료가 도는 빠르기의 80% + 움직이는 빠르기에 따라 60~200도)까지. 서서 제자리에서 휙 돌지 않게, 달리면서는 빨리)
  const fy = Q.face(0), dy = wrapR(fy - s.yaw);
  if (Math.abs(dy) > 1e-4) {
    const om = Math.abs(ry1 - ry0) / dt, sp = Math.hypot(s.x - x0, s.z - z0) / dt, m = Math.min(Math.abs(dy) * (1 - Math.exp(-dt * Math.LN2 / 0.15)), (0.8 * om + (60 + 140 * clamp(sp / 2, 0, 1)) * Math.PI / 180) * dt);
    s.yaw += Math.sign(dy) * m;
  }
  s.vx = (s.x - x0) / dt; s.vz = (s.z - z0) / dt;
  if (s.off) { s.offT += dt; if (s.offT >= BLEND) s.off = null; }
  return poseOut(db, s);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
// 질의: 목표가 앞으로 갈 길(지금 뿌리 기준, 자료 단위). 빨리 틀고 보폭을 늘리는 만큼 자료 시간으로 바꿔 본다
function query(db, s, Q, q) {
  let d = 0; const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), k = 1 / (s.w * s.sc);
  const loc = (wx, wz) => { const dx = wx - s.x, dz = wz - s.z; return [(cy * dx - sy * dz) * k, (sy * dx + cy * dz) * k]; };
  for (const fr of FUT) { const t = fr / FPS / s.r, p = loc(...Q.fut(t)); q[d++] = p[0]; q[d++] = p[1]; }
  for (const fr of FUT) { const t = fr / FPS / s.r, a = Q.face(t) - s.yaw; q[d++] = Math.sin(a); q[d++] = Math.cos(a); }
  // 지금 자세(발 자리·발 빠르기·몸 빠르기)는 지금 틀고 있는 프레임 값
  db.featPose(Math.round(s.f), q);
  for (let j = 0; j < db.D; j++) q[j] *= db.W[j];
  return q;
}
// 지금 자세 + 이어붙이기 차이(남은 만큼). 보폭 배율은 움직이는 쪽으로 발 자리를 늘린다
function poseOut(db, s, raw = false) {
  const p = poseAt(db, s.f);
  if (s.off) { const u = Math.min(1, s.offT / BLEND), w = 1 - u * u * (3 - 2 * u); for (const kk of KEYS) p[kk] += s.off[kk] * w; }
  if (raw) return p;
  if (Math.abs(s.w - 1) > 1e-3) {
    const vl = db.toLocal(Math.floor(s.f), db.vf(Math.min(s.f + 3, db.segEnd[Math.floor(s.f)] - 1), 'rx'), db.vf(Math.min(s.f + 3, db.segEnd[Math.floor(s.f)] - 1), 'rz')), L = Math.hypot(...vl);
    if (L > 1e-3) { const ux = vl[0] / L, uz = vl[1] / L; for (const sd of ['rf', 'lf']) { const a = (p[sd + 'x'] - p.hx) * ux + (p[sd + 'z'] - p.hz) * uz, e = a * (s.w - 1); p[sd + 'x'] += ux * e; p[sd + 'z'] += uz * e; } }
  }
  return p;
}
