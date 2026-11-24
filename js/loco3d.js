// 3D 선수의 이동 엔진(모션 매칭, 사용자 2026-11-16: 트리플A 게임처럼 '어디로 갈지 정하고 → 자연스럽게 가고 → 도착하면 다음 동작').
// 자료: 사람이 걷고·달리고·옆으로·뒤로 가고·서 있는 모션캡처(100STYLE Neutral, CC BY 4.0)와 실제 빠르기의 달리기·출발·멈춤·꺾기·옆걸음(CMU 모션캡처),
//   tools/char3d/mocap/loco.py가 art/char3d/loco.bin으로 만든다.
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
    // 걸음 차례: 발마다 땅에 디딘 지(+) 또는 뜬 지(-) 몇 초인지(0.5초까지). 두 발이 다 땅에 있을 때도 어느 발이 막 디뎠는지 안다
    this.phR = new Float32Array(this.N); this.phL = new Float32Array(this.N);
    for (let k = 0; k + 1 < S.length; k++) for (const [c, A] of [['rc', this.phR], ['lc', this.phL]]) {
      let st = this.v(S[k], c) > 0.5, t = 0.25;
      for (let i = S[k]; i < S[k + 1]; i++) { const now = this.v(i, c) > 0.5; if (now !== st) { st = now; t = 0; } else if (i > S[k]) t += 1 / FPS; A[i] = st ? Math.min(t, 0.5) : -Math.min(t, 0.5); }
    }
    // 발마다 땅을 떠나기까지 남은 시간(초, 디딘 동안만. 뜬 동안 -1): 막 디딘 발을 곧 다시 드는 프레임은 찾지 않으려고
    this.leftR = new Float32Array(this.N); this.leftL = new Float32Array(this.N);
    for (let k = 0; k + 1 < S.length; k++) for (const [c, A] of [['rc', this.leftR], ['lc', this.leftL]]) {
      let t = 1;
      for (let i = S[k + 1] - 1; i >= S[k]; i--) { if (this.v(i, c) > 0.5) { t += 1 / FPS; A[i] = Math.min(t, 1); } else { A[i] = -1; t = 0; } }
    }
    // 찾을 프레임과 특징(앞으로 갈 길 6, 그때 바라볼 쪽 6, 발 자리 4, 발 빠르기 4, 몸 빠르기 2, 걸음 차례 2)
    const cand = [];
    for (let i = 0; i < this.N; i += CAND_STEP) if (i - 1 >= this.segBeg[i] && i + FUT[FUT.length - 1] + 1 < this.segEnd[i]) cand.push(i);
    this.cand = Int32Array.from(cand);
    this.D = 24; this.F = new Float32Array(cand.length * this.D);
    const tmp = new Float32Array(this.D);
    cand.forEach((i, j) => { this.feat(i, tmp); this.F.set(tmp, j * this.D); });
    // 묶음마다 크기를 맞추고(표준편차) 무게를 준다
    // 걸음 차례는 무겁게: 같은 걸음 차례에서 이어지게(사용자 2026-11-21: 가끔 깽깽이 뛰듯이 움직인다.
    // 0.1초마다 다른 프레임으로 건너뛰면서 막 디딘 발이 또 뜨는 프레임을 골라 같은 발이 연달아 걸음을 했다. 어느 발이 땅에 있나만으로는 두 발이 다 땅에 있을 때 구별이 안 됐다)
    const groups = [[0, 6, 1.0], [6, 12, 1.4], [12, 16, 0.7], [16, 20, 0.9], [20, 22, 1.0], [22, 24, 2.0]];
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
    out[d++] = this.phR[i]; out[d++] = this.phL[i];   // 걸음 차례(디딘 지 +초, 뜬 지 -초)
    return out;
  }
  // 질의 q(이미 무게를 곱한 값)에 가장 가까운 후보 프레임
  // keep = { r, l }: 막 디딘 발. 그 발을 0.2초 안에 드는 프레임은 건너뛴다(같은 발이 연달아 걸음을 하지 않게)
  search(q, skipA = -1, skipB = -1, keep = null) {
    const F = this.F, D = this.D, n = this.cand.length; let best = -1, bc = Infinity;
    for (let j = 0; j < n; j++) {
      const i = this.cand[j]; if (i >= skipA && i <= skipB) continue;
      if (keep && ((keep.r && this.leftR[i] < 0.2) || (keep.l && this.leftL[i] < 0.2))) continue;
      let c = 0; const o = j * D;
      for (let d = 0; d < D; d++) { const e = F[o + d] - q[d]; c += e * e; if (c >= bc) break; }
      if (c < bc) { bc = c; best = i; }
    }
    return { i: best, cost: bc };
  }
}

export const MMSTAT = { search: 0, force: 0, jump: 0, inf: 0, r: [] };   // 잰 값(찾기·건너뛰기 횟수)
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
  const xa = s.x, za = s.z;   // 동작(걸음)이 만든 움직임까지
  s.f = f1;
  // 2) 0.1초마다(또는 구간 끝, 크게 바뀌면) 앞으로 갈 길이 가장 비슷한 프레임을 찾는다
  s.tS += dt;
  if (force || s.tS >= SEARCH_EVERY) {
    s.tS = 0;
    const want = query(db, s, Q, s.q);
    const ci = Math.round(s.f / CAND_STEP) * CAND_STEP;
    let curCost = Infinity;
    if (ci - 1 >= db.segBeg[ci] && ci + FUT[FUT.length - 1] + 1 < db.segEnd[ci]) {
      // 지금 틀던 동작은 앞으로 갈 길만 비교한다(지금 자세는 곧 그 동작의 자세. 실제 발 상태와 자료가 조금만 달라도 지금 동작에 벌점이 붙어
      // 찾을 때마다 41%를 건너뛰었고, 건너뛸 때마다 걸음 차례가 깨졌다, 2026-11-21)
      db.feat(ci, s.cur); curCost = 0; for (let d = 0; d < 12; d++) { const e = s.cur[d] * db.W[d] - want[d]; curCost += e * e; }
    }
    let b = db.search(want, Math.floor(s.f) - 8, Math.floor(s.f) + 8, Q.keep && (Q.keep.r || Q.keep.l) ? Q.keep : null);
    if (b.i < 0) b = db.search(want, Math.floor(s.f) - 8, Math.floor(s.f) + 8);   // 맞는 프레임이 없으면 그대로 찾는다
    MMSTAT.search++; if (force) MMSTAT.force++; else if (b.i >= 0 && isFinite(curCost) && MMSTAT.r.length < 4000) MMSTAT.r.push(+(b.cost / Math.max(1e-6, curCost)).toFixed(3)); if (!isFinite(curCost)) MMSTAT.inf++;
    if (b.i >= 0 && (force || b.cost < curCost * 0.85 - 0.05)) {
      MMSTAT.jump++;
      // 관성 이어붙이기: 앞 자세와의 차이를 BLEND초에 걸쳐 0으로
      const p0 = poseOut(db, s, true), p1 = poseAt(db, b.i);
      s.off = {}; for (const kk of KEYS) s.off[kk] = ANG.has(kk) ? wrapD(p0[kk] - p1[kk]) : p0[kk] - p1[kk];
      s.offT = 0; s.f = b.i;
    }
    // 빠르기 맞추기: 자료가 가는 빠르기와 가려는 빠르기의 비. 더 빨리 틀고(걸음이 잦아짐) 보폭을 늘린다.
    // 가려는 빠르기는 지금 몸 자리에서 0.3초 뒤 목표까지(뒤처진 만큼도 걸음으로 메운다. 사용자 2026-11-20: 캐릭터를 옮기고 다리가 제멋대로 따라오는 느낌.
    // 예전에는 목표의 빠르기만 맞추고 뒤처진 만큼은 몸을 끌어 메워서, 움직임의 절반쯤만 걸음이 만들었다)
    // 달리며 칠 때(Q.due: 임팩트까지 남은 초)는 임팩트 때 설 자리까지 남은 시간에 닿는 빠르기로(트리플A의 거리 맞추기: 걸음이 칠 자리에 맞춰 닿는다)
    const fT = Q.due > 0 && Q.due < 0.3 ? Math.max(Q.due, 0.08) : 0.3;
    const fa = Q.fut(fT), fv = [fa[0] - s.x, fa[1] - s.z], vd = Math.hypot(...fv) / fT, vf = db.speedAt(Math.floor(s.f)) * s.sc;
    const ratio = vf > 0.35 ? clamp(vd / vf, 0.8, 3.2) : 1;
    // 옆으로 가는 몫(몸이 보는 쪽 기준, 1이면 곧장 옆): 옆걸음(사이드 스텝)은 보폭을 늘리지 않고 걸음을 잦게 한다
    // (사용자 2026-11-20: 옆으로 갈 때 다리가 옆으로 크게 벌어진다. 보폭을 1.3배 늘리면 두 발이 1m 넘게 벌어졌다. 실제 사이드 스텝은 폭은 그대로, 빨리 딛는다)
    const cyq = Math.cos(s.yaw), syq = Math.sin(s.yaw), lxq = cyq * fv[0] - syq * fv[1], lzq = syq * fv[0] + cyq * fv[1];
    const side = vd > 0.2 ? Math.abs(lxq) / Math.max(1e-6, Math.hypot(lxq, lzq)) : 0, sk = clamp((side - 0.5) / 0.4, 0, 1);
    // 앞으로 달릴 때는 사람처럼 보폭이 주로 늘고(빨리 달릴수록 걸음은 조금만 잦아진다), 옆걸음은 걸음만 잦아진다
    const we = 0.55 * (1 - 0.9 * sk);
    s.rT = clamp(Math.pow(ratio, 1 - we), 0.85, 1.75 + 0.6 * sk); s.wT = clamp(Math.pow(ratio, we), 0.92, 1.55 - 0.5 * sk);   // 보폭: 앞으로 1.55배, 옆걸음 1.05배까지
  }
  const kr = 1 - Math.exp(-dt / 0.12);
  s.r += ((s.rT ?? 1) - s.r) * kr; s.w += ((s.wT ?? 1) - s.w) * kr;
  // 3) 목표와의 차이를 조금씩(홀든의 adjustment): 반감기 0.3초, 한 프레임에 걸음 빠르기의 50%까지. 걸음이 멈춘(서 있는) 동안은 당기지 않는다
  //    (서 있는데 당기면 발은 그대로 몸만 옆으로 가 넘어질 자세가 됐다, 사용자 2026-11-16). 서 있을 때 차이는 동작 찾기가 걸음으로 메운다.
  //    maxOff는 비상용(예전 0.25~0.45m로 묶어 몸을 끌어 다녔다. 사용자 2026-11-20: 캐릭터를 옮기고 다리가 제멋대로 따라오는 느낌)
  const ex = Q.tx - s.x, ez = Q.tz - s.z, el = Math.hypot(ex, ez);
  if (el > 1e-4) {
    const sp = Math.hypot(s.x - x0, s.z - z0) / dt;
    // 달리며 칠 때는 남은 차이를 임팩트 때까지 다 메운다(라켓이 공에 오게. 반감기 0.3초로는 임팩트 때 13~27cm 모자랐다). 걸음 빠르기의 50% + 초속 0.8m까지
    const m = Q.due > 0 ? Math.min(el * Math.min(1, dt / Math.max(0.03, Q.due - 0.01)), (0.5 * sp + 0.8) * dt) : Math.min(el * (1 - Math.exp(-dt * Math.LN2 / 0.3)), 0.5 * sp * dt);
    s.x += ex / el * m; s.z += ez / el * m;
    const e2 = Math.hypot(Q.tx - s.x, Q.tz - s.z), mo = Q.maxOff ?? 0.45;
    if (e2 > mo) { const u = (e2 - mo) / e2; s.x += (Q.tx - s.x) * u; s.z += (Q.tz - s.z) * u; }
  }
  // 바라볼 쪽도 조금씩(반감기 0.15초, 초당 (자료가 도는 빠르기의 80% + 움직이는 빠르기에 따라 60~200도)까지. 서서 제자리에서 휙 돌지 않게, 달리면서는 빨리)
  const fy = Q.face(0), dy = wrapR(fy - s.yaw);
  if (Math.abs(dy) > 1e-4) {
    const om = Math.abs(ry1 - ry0) / dt, sp = Math.hypot(s.x - x0, s.z - z0) / dt;
    // 달리며 칠 때는 임팩트 때까지 칠 쪽을 다 보게(늦으면 라켓이 몸 둘레로 돌아 공을 비켰다, 임팩트 때 18도까지 어긋났다)
    const ku = Q.due > 0 ? Math.min(1, dt / Math.max(0.03, Q.due - 0.02)) : 1 - Math.exp(-dt * Math.LN2 / 0.15);
    const m = Math.min(Math.abs(dy) * ku, (0.8 * om + (Q.pivot || Q.due > 0 ? 360 : 60 + 140 * clamp(sp / 2, 0, 1)) * Math.PI / 180) * dt);   // pivot: 크로스 스텝 첫발은 골반을 빨리 돌린다
    s.yaw += Math.sign(dy) * m;
  }
  s.vx = (s.x - x0) / dt; s.vz = (s.z - z0) / dt;
  s.dA = Math.hypot(xa - x0, za - z0); s.dC = Math.hypot(s.x - xa, s.z - za);   // 잰 값: 걸음이 만든 움직임, 목표 쪽으로 당긴 움직임(m)
  if (s.off) { s.offT += dt; if (s.offT >= BLEND) s.off = null; }
  return poseOut(db, s);
}
// 이 발(side 'r'|'l')이 자료에서 땅을 떠나기까지 남은 시간(게임 초, 0.6초까지 본다). 지금 뜬 발이면 0
export function stanceLeft(db, s, side) {
  if (!db || !s) return 1;
  const c = side + 'c', end = db.segEnd[Math.floor(s.f)] - 1;
  for (let k = 0; k <= 18; k++) { const f = s.f + k; if (f >= end) return k / (FPS * s.r); if (db.v(Math.floor(f), c) <= 0.5) return k / (FPS * s.r); }
  return 18 / (FPS * s.r);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
// 질의: 목표가 앞으로 갈 길(지금 뿌리 기준, 자료 단위). 지금 빨리 틀고 보폭을 늘린 것은 빼고 실제 시간·거리로 본다
// (2026-11-24, 사용자: 뛰는 것을 다양한 애니메이션으로. 예전에는 지금 배율만큼 자료 시간으로 바꿔 봐서, 느린 동작을 빨리 틀고 있으면 목표도 느려 보여
//  빠른 달리기 동작(CMU)이 있어도 계속 느린 동작을 골라 1.6배로 틀었다)
function query(db, s, Q, q) {
  let d = 0; const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw), k = 1 / s.sc;
  const loc = (wx, wz) => { const dx = wx - s.x, dz = wz - s.z; return [(cy * dx - sy * dz) * k, (sy * dx + cy * dz) * k]; };
  for (const fr of FUT) { const t = fr / FPS, p = loc(...Q.fut(t)); q[d++] = p[0]; q[d++] = p[1]; }
  for (const fr of FUT) { const t = fr / FPS, a = Q.face(t) - s.yaw; q[d++] = Math.sin(a); q[d++] = Math.cos(a); }
  // 지금 자세(발 자리·발 빠르기·몸 빠르기)는 지금 틀고 있는 프레임 값
  db.featPose(Math.round(s.f), q);
  // 막 넘겨받았을 때(스윙·서브 뒤)는 지금 틀고 있는 프레임이 없으니 실제 발 자리·몸 빠르기로 찾는다(모션 매칭의 '지금 자세'는 캐릭터의 실제 자세.
  // 서 있는 프레임 값으로 찾으면 실제 발과 다른 자세에서 시작해 디딘 발이 끌려갔다, 2026-11-20)
  if (Q.pose) for (let j = 0; j < Q.pose.length; j++) q[12 + j] = Q.pose[j];
  // 걸음 차례는 실제로 디딘 발(발 고정)로: 자료와 실제가 다를 때도 지금 걸음 차례에서 이어지는 프레임을 찾는다
  if (Q.phase) { q[22] = Q.phase[0]; q[23] = Q.phase[1]; }
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
