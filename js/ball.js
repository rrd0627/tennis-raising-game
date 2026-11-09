// 공의 물리(중계 전용). 승패와 엔진 난수에는 쓰지 않는다.
// 중력, 공기 저항(항력), 회전이 만드는 마그누스 힘, 바운드(바닥 마찰이 회전과 주고받는 힘), 굴러가기, 펜스.
// 테니스공 풍동 실험식(Štěpánek 1988)을 쓴다. S = rω/v(회전 빠르기 ÷ 공 빠르기)일 때
//   항력 계수 CD = 0.508 + 1 / (22.503 + 4.196·S^-2.5)^0.4,  양력 계수 CL = 1 / (2.022 + 0.981/S)
// 마그누스 힘은 회전축 × 진행 방향 쪽으로 걸린다: 탑스핀은 아래로(빨리 떨어진다), 백스핀은 위로(뜬다).
// 바운드: 위아래는 반발 계수만큼 튀고, 바닥에 닿는 점이 미끄러지는 만큼 마찰이 공을 늦추고 회전을 바꾼다.
//   탑스핀은 닿는 점이 덜 미끄러져 속도를 덜 잃고 앞으로 튀어 나가며, 백스핀은 많이 미끄러져 속도를 잃고 낮게 깔린다.
//
// 엔진이 정한 것(친 곳, 바운드, 받는 곳, 걸리는 시간)은 그대로 둔다. 회전수는 샷과 정확도로 정하고,
// 그 회전으로 정해진 시간에 바운드 지점에 떨어지도록 라켓을 떠나는 속도와 각도를 푼다.
// 받는 높이는 물리가 정하고(그 높이가 다음 샷이 치는 높이), 다음 샷에 맞지 않거나 네트에 걸리면 회전을 조금 바꿔 다시 푼다.
import { flightTime, flightParts, BALL_V } from './rally.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 코트: mu = 바닥 마찰, e = 반발(약 6m/s로 떨어질 때), roll = 굴러갈 때 줄어드는 속도(m/s²). 초안
export const SURF = {
  hard: { mu: 0.6, e: 0.8, roll: 0.9 },
  clay: { mu: 0.75, e: 0.84, roll: 1.6 },
  turf: { mu: 0.5, e: 0.72, roll: 1.3 },   // 모래 인조잔디: 덜 튀고 깔린다
};
const G = 9.81, R = 0.0335, MASS = 0.0577, KA = 1.2 * Math.PI * R * R / (2 * MASS), ALPHA = 0.55, DECAY = 0.02;
const DT = 1 / 120;
const RPM = Math.PI / 30;   // rpm → rad/s

// 샷별 회전(부호: + 탑스핀, - 백스핀)과 rpm(정확도 55%일 때, 90%일 때). 잘 치는 사람일수록 회전이 많다.
// 여자 동호인 기준 초안. 프로 포핸드는 2500~3300rpm쯤이다
export const SPIN = {
  serve: [1, 700, 1500], serve2: [1, 1300, 2400], smash: [1, 300, 800],
  fh_drive: [1, 1300, 2500], bh_drive: [1, 1100, 2100], passing: [1, 1300, 2400], return: [1, 1000, 1900],
  swing_volley: [1, 900, 1700], half_volley: [1, 300, 700], topspin_lob: [1, 1700, 3000],
  fh_volley: [-1, 300, 800], bh_volley: [-1, 300, 800], low_volley: [-1, 500, 1000], moon_volley: [-1, 200, 600], drop_volley: [-1, 900, 1700],
  fh_slice: [-1, 900, 1900], bh_slice: [-1, 900, 1900], chip_return: [-1, 800, 1500], def_lob: [-1, 500, 1200], dropshot: [-1, 1300, 2300],
};
export function rpmOf(type, acc = 70) {
  const [sg, a, b] = SPIN[type] || [1, 500, 1000];
  return sg * (a + (b - a) * clamp((acc - 55) / 35, 0, 1));
}

// 다음 샷을 치는 높이(m): [낮게, 높게, 알맞게]. 물리로 나온 높이가 이 안에 들도록 회전을 고른다
const HIT = {
  smash: [2.0, 3.0, 2.45], moon_volley: [1.5, 2.5, 1.9], swing_volley: [0.9, 1.8, 1.3],
  fh_volley: [0.6, 1.6, 1.05], bh_volley: [0.6, 1.6, 1.0], drop_volley: [0.5, 1.4, 0.85], low_volley: [0.15, 0.7, 0.4], half_volley: [0.1, 0.55, 0.3],
};
const GROUND = [0.35, 1.9, 1.1];   // 동호인 공은 높이 떴다가 튀어서 가슴 높이에서 치는 일도 많다
const hitRange = type => HIT[type] || GROUND;

// 항력·양력 계수 표(S 0~1.5)
const NS = 600, SMAX = 1.5, CDT = new Float64Array(NS + 2), CLT = new Float64Array(NS + 2);
for (let i = 0; i <= NS + 1; i++) {
  const S = Math.max(1e-4, (i / NS) * SMAX);
  CDT[i] = 0.508 + 1 / Math.pow(22.503 + 4.196 * Math.pow(S, -2.5), 0.4);
  CLT[i] = i === 0 ? 0 : 1 / (2.022 + 0.981 / S);
}
let cd = 0.508, cl = 0;
function coef(S) {
  const f = Math.min(NS, (S / SMAX) * NS), i = f | 0, u = f - i;
  cd = CDT[i] + (CDT[i + 1] - CDT[i]) * u; cl = CLT[i] + (CLT[i + 1] - CLT[i]) * u;
}
export function coefOf(S) { coef(S); return { cd, cl }; }

// 상태: [x, y, z, vx, vy, vz, wx, wy, wz] (y가 높이, w = 회전 벡터 rad/s)
function deriv(s, d) {
  const vx = s[3], vy = s[4], vz = s[5], wx = s[6], wy = s[7], wz = s[8];
  const v = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-6, w = Math.sqrt(wx * wx + wy * wy + wz * wz);
  coef((R * w) / v);
  const kd = KA * cd * v;
  let ax = -kd * vx, ay = -kd * vy - G, az = -kd * vz;
  if (w > 1e-3) {
    const km = (KA * cl * v) / w;   // a = KA·CL·v² · (w × v)/|w × v|
    ax += km * (wy * vz - wz * vy); ay += km * (wz * vx - wx * vz); az += km * (wx * vy - wy * vx);
  }
  d[0] = vx; d[1] = vy; d[2] = vz; d[3] = ax; d[4] = ay; d[5] = az; d[6] = -DECAY * wx; d[7] = -DECAY * wy; d[8] = -DECAY * wz;
}
const K1 = new Float64Array(9), K2 = new Float64Array(9), K3 = new Float64Array(9), K4 = new Float64Array(9), TMP = new Float64Array(9);
function rk4(s, h) {
  deriv(s, K1); for (let i = 0; i < 9; i++) TMP[i] = s[i] + K1[i] * h * 0.5;
  deriv(TMP, K2); for (let i = 0; i < 9; i++) TMP[i] = s[i] + K2[i] * h * 0.5;
  deriv(TMP, K3); for (let i = 0; i < 9; i++) TMP[i] = s[i] + K3[i] * h;
  deriv(TMP, K4); for (let i = 0; i < 9; i++) s[i] += (h / 6) * (K1[i] + 2 * K2[i] + 2 * K3[i] + K4[i]);
}

// 바운드(공이 y=0에서 아래로 올 때). 닿는 점의 미끄러짐을 마찰이 줄이고, 다 줄이면 구르기 시작한다(grip)
function bounce(s, sf) {
  const vin = -s[4];
  if (vin <= 0) return;
  const e = clamp(sf.e + 0.01 * (6 - vin), sf.e - 0.08, sf.e + 0.06);
  s[1] = 0; s[4] = vin * e;
  const cx = s[3] + R * s[8], cz = s[5] - R * s[6], c = Math.sqrt(cx * cx + cz * cz);
  if (c > 1e-6) {
    const j = Math.min((ALPHA / (1 + ALPHA)) * c, sf.mu * (1 + e) * vin), jx = (-j * cx) / c, jz = (-j * cz) / c;
    s[3] += jx; s[5] += jz;
    s[6] += -jz / (ALPHA * R); s[8] += jx / (ALPHA * R);
  }
  if (s[4] < 0.35) s[4] = 0;   // 거의 안 튀면 구른다
}
const netH = x => 0.914 + 0.156 * Math.min(1, (x / 6.4) ** 2);

// 한 걸음(굴러가기·펜스·네트 포함). 공이 끝난 뒤 굴러가는 데 쓴다
const PREV = new Float64Array(9);
export function stepFree(s, h, surface) { stepWith(s, h, SURF[surface] || SURF.turf); }
function stepWith(s, h, sf) {
  if (s[1] <= 0 && s[4] <= 0) {
    const vx = s[3], vz = s[5], sp = Math.sqrt(vx * vx + vz * vz), ns = Math.max(0, sp - sf.roll * h);
    if (sp > 1e-6) { s[3] = (vx / sp) * ns; s[5] = (vz / sp) * ns; }
    s[0] += s[3] * h; s[2] += s[5] * h; s[1] = 0; s[4] = 0;
    s[6] = s[5] / R; s[7] = 0; s[8] = -s[3] / R;
  } else {
    PREV.set(s); rk4(s, h);
    if (s[1] < 0) {
      const f = PREV[1] / (PREV[1] - s[1] || 1);
      s.set(PREV); rk4(s, h * f); s[1] = 0;
      if (s[4] < 0) bounce(s, sf);
    }
    // 네트: 아래로 지나가려는 공은 걸려서 힘없이 떨어진다
    if (PREV[2] * s[2] < 0 && Math.abs(s[0]) < 6.4 && s[1] < netH(s[0])) { s[2] = PREV[2]; s[5] *= -0.08; s[3] *= 0.3; s[4] = Math.min(s[4], 0) * 0.3; }
  }
  if (Math.abs(s[0]) > 10.85) { s[0] = Math.sign(s[0]) * 10.85; s[3] *= -0.25; s[5] *= 0.6; s[6] *= 0.3; s[8] *= 0.3; }
  if (s[2] < -19.35) { s[2] = -19.35; s[5] *= -0.25; s[3] *= 0.6; s[6] *= 0.3; s[8] *= 0.3; }
  if (s[2] > 21) { s[2] = 21; s[5] = 0; }
}
// 네트에 걸린 공: 앞으로 가던 힘을 잃고 떨어진다
export function netHit(s) { s[5] *= -0.08; s[3] *= 0.3; s[4] = Math.min(s[4], 0) * 0.3; s[6] *= 0.2; s[8] *= 0.2; }

// ── 궤적 풀기 ─────────────────────────────────────
// ctx: 친 곳(x0, z0), 높이 h0, 가는 방향(ux, uz). 회전축은 진행 방향과 수직(옆으로 휘는 회전은 아직 없다)
const SS = new Float64Array(9);
let netY = 9, netX = 0;
function launchState(out, c, vs, vy, w) {
  out[0] = c.x0; out[1] = c.h0; out[2] = c.z0; out[3] = c.ux * vs; out[4] = vy; out[5] = c.uz * vs;
  out[6] = w * c.uz; out[7] = 0; out[8] = -w * c.ux;
}
const along = (c, s) => (s[0] - c.x0) * c.ux + (s[2] - c.z0) * c.uz;
// t초 뒤의 상태(SS). 바닥은 보지 않는다(바운드 전까지만 쓴다). 네트를 지나는 높이를 netY에 적는다
function stateAt(c, vs, vy, w, t) {
  launchState(SS, c, vs, vy, w);
  const n = Math.max(1, Math.ceil(t / DT)), h = t / n;
  netY = 9; netX = 0;
  for (let i = 0; i < n; i++) {
    const z0 = SS[2], y0 = SS[1], x0 = SS[0];
    rk4(SS, h);
    if (z0 * SS[2] < 0) { const f = z0 / (z0 - SS[2]); netY = y0 + (SS[1] - y0) * f; netX = x0 + (SS[0] - x0) * f; }
  }
  return SS;
}
// 거리 d, 높이 yEnd에 t초에 닿는 발사 속도 [앞, 위]. 처음 자코비안을 계속 쓴다(거의 선형이라 빨리 맞는다)
function aim(c, w, d, yEnd, t, guess) {
  let vs, vy;
  if (guess) [vs, vy] = guess;
  else {
    const v = d / t, k = KA * 0.56;
    vs = d > 0.3 ? (Math.exp(k * d) - 1) / (k * t) : v;
    coef((R * Math.abs(w)) / Math.max(v, 1));
    vy = (yEnd - c.h0 + (G + Math.sign(w) * KA * cl * v * v) * t * t * 0.5) / t;
  }
  let J = null, last = 1e9;
  for (let it = 0; it < 10; it++) {
    const S = stateAt(c, vs, vy, w, t), e0 = along(c, S) - d, e1 = S[1] - yEnd, err = Math.abs(e0) + Math.abs(e1);
    if (err < 0.006) break;
    if (!J || err > last * 0.5) {
      const sa = stateAt(c, vs + 0.05, vy, w, t), a = (along(c, sa) - d - e0) / 0.05, cc = (sa[1] - yEnd - e1) / 0.05;
      const sb = stateAt(c, vs, vy + 0.05, w, t), b = (along(c, sb) - d - e0) / 0.05, dd = (sb[1] - yEnd - e1) / 0.05;
      J = [a, b, cc, dd];
    }
    last = err;
    const [a, b, cc, dd] = J, det = a * dd - b * cc;
    if (Math.abs(det) < 1e-9) break;
    let dvs = -(dd * e0 - b * e1) / det, dvy = -(-cc * e0 + a * e1) / det;
    const L = Math.hypot(dvs, dvy);
    if (L > 8) { dvs *= 8 / L; dvy *= 8 / L; }
    vs += dvs; vy += dvy;
  }
  return [vs, vy];
}
// 바운드 뒤 거리 sC까지 가는 시간과 그때 높이
const ST = new Float64Array(9);
function afterBounce(c, land, sC, sf) {
  ST.set(land); ST[1] = 0; bounce(ST, sf);
  let t = 0, sp = along(c, ST), yp = ST[1];
  if (sp >= sC) return { t2: 0, hc: 0 };
  while (t < 3) {
    PREV.set(ST); rk4(ST, DT); t += DT;
    if (ST[1] < 0) { ST[1] = 0; if (ST[4] < 0) bounce(ST, sf); }
    const s = along(c, ST);
    if (s >= sC) { const f = (sC - sp) / (s - sp || 1); return { t2: t - DT + DT * f, hc: yp + (ST[1] - yp) * f }; }
    if (s - sp < 1e-4 && ST[4] <= 0 && ST[1] <= 0) break;
    sp = s; yp = ST[1];
  }
  return { t2: 99, hc: 0 };
}
// 바운드 뒤 받는 곳까지 합친 시간이 T가 되도록 바운드까지 시간 t1을 고른다(할선법)
function matchTime(c, T, w, sf) {
  const lo = 0.22, hi = Math.max(0.3, T - 0.05);
  const ev = (t1, guess) => {
    const g = aim(c, w, c.d1, 0, t1, guess), land = stateAt(c, g[0], g[1], w, t1);
    const ny = netY, nx = netX, a = afterBounce(c, land, c.sC, sf);
    return { t1, g, t2: a.t2, hc: a.hc, F: t1 + a.t2 - T, margin: c.net ? ny - netH(nx) : 9 };
  };
  let A = ev(clamp(T * c.split, lo, hi));
  if (Math.abs(A.F) < 0.01) return A;
  let B = ev(clamp(A.t2 >= 99 ? A.t1 * 0.85 : A.t1 - A.F * 0.6, lo, hi), A.g);
  for (let it = 0; it < 7 && Math.abs(B.F) > 0.01; it++) {
    let t;
    if (B.t2 >= 99) t = B.t1 * 0.85;
    else { const sl = (B.F - A.F) / (B.t1 - A.t1 || 1e-3); t = A.t2 < 99 && sl > 0.2 ? B.t1 - B.F / sl : B.t1 - B.F * 0.6; }
    t = clamp(t, lo, hi);
    if (Math.abs(t - B.t1) < 1e-4) break;
    A = B; B = ev(t, B.g);
  }
  return Math.abs(B.F) < Math.abs(A.F) ? B : A;
}
const CLEAR = 0.1;   // 네트 위로 이만큼은 지나가야 한다(공 크기)
const SKIM = 0.03;   // 넷 코드: 테이프를 스친다

// 샷 하나의 궤적. s = 엔진 샷, next = 그 공을 받는 샷(없으면 끝나는 공), h0 = 치는 높이
export function solveShot(s, next, h0, surface = 'turf', skim = false) {
  const sf = SURF[surface] || SURF.turf;
  const from = s.from, v = s.v || BALL_V[s.type] || 16, rpm0 = rpmOf(s.type, s.info?.acc ?? 70);
  if (s.res === 'net') {
    const np = [from[0] + (s.to[0] - from[0]) * 0.9, 0.15 * Math.sign(from[1])];
    const c = ctxOf(from, np, h0), T = flightTime(from, np, null, v, s.type), w = rpm0 * RPM;
    const g = aim(c, w, c.dC, 0.6, T);
    return record(c, g, w, { t1: T, end: 'net', sf, T });
  }
  const B = s.bounce, C = s.to;
  if (B) {
    const c = ctxOf(from, B, h0), d2 = Math.max(0, (C[0] - B[0]) * c.ux + (C[1] - B[1]) * c.uz);
    c.d1 = c.dC; c.sC = c.d1 + d2; c.net = from[1] * B[1] < 0;
    const T = flightTime(from, C, B, v, s.type), [r1, r2] = flightParts(from, C, B, v, s.type);
    c.split = r1 / (r1 + r2 || 1);
    if (next && d2 > 0.05) {
      // 받는 사람이 있다: 걸리는 시간 T와 받는 높이, 네트를 함께 맞춘다. 늦게 오는 것(받는 사람이 기다림)은 괜찮고, 일찍 오면 안 된다
      const [lo, hi, tg] = hitRange(next.type);
      const pen = r => (skim ? Math.abs(r.margin - SKIM) * 60 : Math.max(0, CLEAR - r.margin) * 60)
        + Math.max(0, lo - r.hc, r.hc - hi) * 4 + Math.abs(r.hc - tg) * 0.15 + (r.late > 0 ? r.late * 1.2 : -r.late * 8) + Math.abs(r.k - 1) * 0.4;
      const tryK = (k, tf = 1) => { const r = matchTime(c, T * tf, rpm0 * k * RPM, sf); r.k = k; r.late = r.t1 + r.t2 - T; r.pen = pen(r); return r; };
      let best = tryK(1);
      if (skim) {
        // 넷 코드: 회전을 바꿔 테이프 높이로 지나가게(같은 시간이면 아래로 누르는 힘이 클수록 네트 위로 높이 지나간다)
        const dn = rpm0 >= 0 ? 1 : -1;
        let a = best, b = tryK(best.margin > SKIM ? 1 - 0.6 * dn : 1 + 0.6 * dn);
        for (let it = 0; it < 5 && Math.abs(b.margin - SKIM) > 0.015; it++) {
          const sl = (b.margin - a.margin) / (b.k - a.k || 1e-3);
          if (Math.abs(sl) < 1e-3) break;
          const k = clamp(b.k - (b.margin - SKIM) / sl, -1.5, 2.5);
          a = b; b = tryK(k);
        }
        best = Math.abs(b.margin - SKIM) < Math.abs(a.margin - SKIM) ? b : a;
      } else if (best.pen > 0.35) {
        for (const [k, tf] of rpm0 >= 0 ? SEQ_TOP : SEQ_BACK) { const r = tryK(k, tf); if (r.pen < best.pen) best = r; if (best.pen < 0.35) break; }
      }
      return record(c, best.g, rpm0 * best.k * RPM, { t1: best.t1, end: 'contact', sf, T });
    }
    // 끝나는 공(위너·아웃·에이스): 바운드까지는 엔진 시간대로, 그 뒤는 물리대로 간다
    const t1 = T * c.split;
    let best = null;
    for (const [k, tf] of UP(rpm0 >= 0)) {
      const w = rpm0 * k * RPM, g = aim(c, w, c.d1, 0, t1 * tf);
      stateAt(c, g[0], g[1], w, t1 * tf);
      const m = c.net ? netY - netH(netX) : 9;
      if (!best || (best.m < CLEAR && m > best.m)) best = { g, k, t1: t1 * tf, m };
      if (m >= CLEAR) break;
    }
    return record(c, best.g, rpm0 * best.k * RPM, { t1: best.t1, end: d2 > 0.05 ? 'run' : 'land', sF: c.d1 + d2, sf, T });
  }
  // 바운드 없이 받는 공(발리·스매시·포치·나가는 공을 쳐 버림): 받는 곳에 그 높이로 T초에 닿는다
  const c = ctxOf(from, C, h0), T = flightTime(from, C, null, v, s.type);
  c.net = from[1] * C[1] < 0;
  const tg = next ? hitRange(next.type)[2] : 1.0;
  let best = null;
  for (const [k, tf] of UP(rpm0 >= 0)) {
    const w = rpm0 * k * RPM, g = aim(c, w, c.dC, tg, T * tf);
    stateAt(c, g[0], g[1], w, T * tf);
    const m = c.net ? netY - netH(netX) : 9;
    if (!best || (best.m < CLEAR && m > best.m)) best = { g, w, t: T * tf, m };
    if (m >= CLEAR) break;
  }
  return record(c, best.g, best.w, { t1: best.t, end: 'contact', sf, T });
}
// 다시 풀 때 바꿔 보는 [회전 배율, 시간 배율]. 받는 높이를 맞추려고 회전을 이쪽저쪽으로, 그래도 안 되면 조금 높이 띄운다(늦게 온다)
const SEQ_TOP = [[0.7, 1], [1.35, 1], [0.45, 1], [1.7, 1], [1, 1.15], [1.35, 1.15], [0.7, 1.15], [1, 1.3], [1.7, 1.3], [1, 1.5], [1.7, 1.5]];
const SEQ_BACK = [[0.7, 1], [1.35, 1], [0.45, 1], [1.7, 1], [0.6, 1.15], [1, 1.15], [0.3, 1.3], [1, 1.3], [0.3, 1.5], [0, 1.5]];
// 네트를 넘기려고: 같은 시간이면 아래로 누르는 힘이 클수록(탑스핀은 더 많이, 백스핀은 더 적게) 네트 위로 높이 지나간다. 그래도 안 되면 높이 띄운다
const UP = top => (top ? [[1, 1], [1.35, 1], [1.7, 1], [2.1, 1], [2.1, 1.15], [2.1, 1.3], [2.1, 1.5], [2.1, 1.75]] : [[1, 1], [0.6, 1], [0.3, 1], [0, 1], [0.3, 1.15], [0.3, 1.3], [0.3, 1.5], [0.3, 1.75]]);
function ctxOf(from, to, h0) {
  const dx = to[0] - from[0], dz = to[1] - from[1], d = Math.hypot(dx, dz) || 1e-3;
  return { x0: from[0], z0: from[1], h0, ux: dx / d, uz: dz / d, dC: d, d1: d, sC: d, net: false, split: 1 };
}

// 풀린 발사로 실제 궤적을 적어 둔다. at(t) = [x, z, y]
function record(c, g, w, o) {
  const st = new Float64Array(9);
  launchState(st, c, g[0], g[1], w);
  const ts = [0], ps = [st[0], st[2], st[1]];
  const put = (t) => { ts.push(t); ps.push(st[0], st[2], st[1]); };
  const n = Math.max(1, Math.ceil(o.t1 / DT)), h = o.t1 / n;
  let tn = -1;
  for (let i = 0; i < n; i++) {
    const z0 = st[2]; rk4(st, h); put((i + 1) * h);
    if (tn < 0 && z0 * st[2] < 0) tn = (i + (z0 / (z0 - st[2]))) * h;
  }
  let t = o.t1, h1 = st[1], end = st;
  if (o.end === 'contact' && c.sC > c.d1 + 0.05) {
    // 바운드하고 받는 곳까지
    st[1] = 0; bounce(st, o.sf);
    let sp = along(c, st);
    while (t < o.t1 + 3) {
      PREV.set(st); rk4(st, DT);
      if (st[1] < 0) { st[1] = 0; if (st[4] < 0) bounce(st, o.sf); }
      const s = along(c, st);
      if (s >= c.sC) {
        const f = (c.sC - sp) / (s - sp || 1);
        st.set(PREV); rk4(st, DT * f); t += DT * f; put(t); break;
      }
      t += DT; put(t);
      if (s - sp < 1e-4 && st[4] <= 0 && st[1] <= 0) break;   // 멈춰 버렸다
      sp = s;
    }
    h1 = Math.max(0, st[1]);
  } else if (o.end === 'run') {
    // 끝나는 공: 바운드하고 엔진이 정한 끝(펜스 쪽)까지 물리대로 간다. 그 뒤는 굴러간다(stepFree)
    st[1] = 0; bounce(st, o.sf);
    while (t < o.t1 + 3.5 && along(c, st) < o.sF) {
      stepWith(st, DT, o.sf); t += DT; put(t);
      if (st[4] === 0 && st[1] === 0 && Math.hypot(st[3], st[5]) < 0.3) break;
    }
  } else if (o.end === 'land') {
    st[1] = 0; bounce(st, o.sf);   // 떨어진 곳에서 끝난다. 다음 걸음은 튀어 오르며 시작한다
  } else if (o.end === 'net') netHit(st);
  const kmh = Math.round(Math.hypot(g[0], g[1]) * 3.6);
  return {
    dur: t, t1: o.t1, tn, h0: c.h0, h1, end: st, kmh, rpm: Math.round(w / RPM), T: o.T,
    at(q) {
      if (q <= 0) return [ps[0], ps[1], ps[2]];
      let a = 0, b = ts.length - 1;
      if (q >= ts[b]) return [ps[3 * b], ps[3 * b + 1], ps[3 * b + 2]];
      while (b - a > 1) { const m = (a + b) >> 1; if (ts[m] <= q) a = m; else b = m; }
      const u = (q - ts[a]) / (ts[b] - ts[a] || 1);
      return [ps[3 * a] + (ps[3 * b] - ps[3 * a]) * u, ps[3 * a + 1] + (ps[3 * b + 1] - ps[3 * a + 1]) * u, ps[3 * a + 2] + (ps[3 * b + 2] - ps[3 * a + 2]) * u];
    },
  };
}

// 포인트 하나의 공을 처음부터 끝까지 차례로 푼다(받은 높이가 다음 샷이 치는 높이). skims = 넷 코드로 보일 샷들
const FLY = new WeakMap();
export function planPoint(pt, surface, skims = new Set()) {
  let h = 2.6;
  for (let i = 0; i < pt.shots.length; i++) {
    const s = pt.shots[i], serve = /^serve/.test(s.type);
    const next = s.res === 'fault' || s.res === 'df' ? null : pt.shots[i + 1];
    const f = solveShot(s, next, serve ? 2.6 : h, surface, skims.has(s));
    FLY.set(s, f);
    h = clamp(f.h1, 0.1, 3.2);
  }
}
export const flyOf = s => FLY.get(s);
// 화면 숫자: 스피드건처럼 라켓을 떠나는 순간의 빠르기(km/h)와 회전(rpm, + 탑스핀)
export function launchKmh(s) { return FLY.get(s)?.kmh ?? Math.round((s.v || BALL_V[s.type] || 16) * 4.6); }
export function spinRpm(s) { return FLY.get(s)?.rpm ?? Math.round(rpmOf(s.type, s.info?.acc ?? 70)); }

// 아무 데서나 아무 데로: 높이 h0에서 to에 T초 뒤 떨어지는 공(라켓·몸에 맞고 튕긴 공)
export function dropArc(from, h0, to, T, type, surface = 'turf') {
  const c = ctxOf(from, to, h0), w = rpmOf(type, 60) * RPM, g = aim(c, w, c.dC, 0, T);
  return record(c, g, w, { t1: T, end: 'land', sf: SURF[surface] || SURF.turf, T });
}
