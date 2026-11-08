// 중계에 보이는 공과 몸의 움직임. 엔진(sim.js)은 이걸로 공이 떨어질 곳과 선수가 뛸 곳을 정하고,
// 중계(match3d.js)는 같은 함수로 그린다. 승패와 난수에는 쓰지 않는다.
//
// 결과는 엔진이 먼저 정한다. 화면은 그 결과가 왜 났는지를 능력치로 보여 준다.
// - 첫발: 상대가 친 뒤 출발까지 걸리는 시간
// - 스피드(지치면 느려짐): 달리는 속도
// - 유연성: 팔을 뻗어 닿는 거리
// - 포지셔닝: 치고 나서 제자리로 돌아가는 빠르기
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// 샷 종류별 기본 공 빠르기(바운드까지 평균, m/s). 샷 품질과 파워로 조금 달라진다.
// 여자 동호인 공은 느리다(사용자 경험, 2026-11-08): 강하게 치는 공은 예전의 0.75배쯤, 발리·슬라이스는 0.85배쯤. 로브와 드롭은 그대로.
// 서브는 sim.js의 serveV가 정한다(여기 serve, serve2는 값이 없을 때만 쓴다)
export const BALL_V = { serve: 15, serve2: 12.5, smash: 17.5, fh_drive: 13.5, bh_drive: 12.8, passing: 14, return: 12.8, swing_volley: 15, fh_volley: 12.8, bh_volley: 12, low_volley: 10.5, half_volley: 10.5, fh_slice: 11, bh_slice: 11, chip_return: 10.5, topspin_lob: 11, def_lob: 9, moon_volley: 9, dropshot: 9, drop_volley: 8 };
export const AFTER_BOUNCE = 0.62;   // 바운드 뒤에는 공이 느려진다
export const START = 0.18;          // 멈춘 몸이 속도를 내기까지 잃는 시간

export function flightTime(from, to, bounce, v) {
  const d1 = bounce ? dist(from, bounce) : dist(from, to);
  const d2 = bounce ? dist(bounce, to) : 0;
  return Math.max(0.28, d1 / v + d2 / (v * AFTER_BOUNCE));
}

// 공의 높이는 중력으로 그린다. 시간은 flightTime과 같고, 높이만 물리대로 정한다.
// 탑스핀은 더 빨리 떨어지고(중력 배율이 큼) 슬라이스와 드롭은 뜬다. 공기 저항 때문에 앞쪽에서 빠르고 뒤에서 느려진다.
export const NET_CLEAR = 1.08;
const GRAV = 9.8;
const LOB_T = /lob|moon/;
const spinG = type => (/drive|passing|^return$/.test(type) ? 1.35 : /slice|chip|drop/.test(type) ? 0.8 : 1);
const dragOf = type => (LOB_T.test(type) ? 0.25 : /slice|chip|drop/.test(type) ? 0.55 : 0.45);
// 돌려주는 at(t)는 t초 뒤 [x, z, y]. t1 = 바운드까지 걸리는 시간, tn = 네트를 지나는 시간.
// skim이면 네트 테이프를 스치듯 지나간다(넷 코드 연출)
export function ballArc(from, to, bounce, type, h0, h1, v, overNet = true, skim = false) {
  const end = bounce || to;
  const dur = flightTime(from, to, bounce, v);
  const r1 = dist(from, end) / v, r2 = bounce ? dist(end, to) / (v * AFTER_BOUNCE) : 0;
  const t1 = bounce ? dur * r1 / (r1 + r2 || 1) : dur, t2 = dur - t1;
  const c = dragOf(type), E = 1 - Math.exp(-c * t1);
  const prog = t => (1 - Math.exp(-c * t)) / E;
  const yEnd = bounce ? 0 : h1;
  let g = GRAV * spinG(type);
  // 네트 위를 지나도록: 네트를 지나는 순간의 높이가 모자라면 더 높이 띄운다
  const uNet = from[1] * end[1] < 0 ? Math.abs(from[1]) / (Math.abs(from[1]) + Math.abs(end[1])) : -1;
  let tn = -1;
  if (overNet && uNet > 0) {
    tn = -Math.log(1 - uNet * E) / c;
    const line = h0 + (yEnd - h0) * tn / t1;
    const need = 2 * ((skim ? 0.97 : NET_CLEAR) - line) / (tn * (t1 - tn));
    g = clamp(skim ? need : Math.max(g, need), 4, 40);
  }
  const vy = (yEnd - h0 + g * t1 * t1 / 2) / t1;
  // 바운드 뒤: 바닥에서 받는 높이(h1)까지. 너무 튀어 오르지 않게 위로 가는 속도를 막는다
  let up = t2 > 0 ? (h1 + GRAV * t2 * t2 / 2) / t2 : 0;
  up = Math.min(up, 9);
  return {
    dur, t1, tn,
    at(t) {
      if (t <= t1) {
        const k = prog(Math.max(0, t));
        return [from[0] + (end[0] - from[0]) * k, from[1] + (end[1] - from[1]) * k, h0 + vy * t - g * t * t / 2];
      }
      const u = t - t1, k = t2 > 0 ? u / t2 : 1;
      return [end[0] + (to[0] - end[0]) * k, end[1] + (to[1] - end[1]) * k, Math.max(0, up * u - GRAV * u * u / 2)];
    },
  };
}

// 중계에서 공을 치는 높이(h0)와 받는 높이(h1). 중계와 속도 표시가 같은 값을 쓴다
export function ballHeights(s, next) {
  const serve = /^serve/.test(s.type);
  const h0 = serve || s.type === 'smash' ? 2.6 : /volley/.test(s.type) ? 1.25 : 0.9;
  const h1 = s.res === 'net' ? 0.5 : next ? (/volley/.test(next.type) ? 1.15 : next.type === 'smash' ? 2.4 : 0.85) : 0.0;
  return [h0, h1];
}
// 화면에 보이는 공 빠르기(km/h). 스피드건처럼 라켓을 떠나는 순간의 빠르기를 잰다. 중계가 그리는 공(ballArc)과 같은 계산이다
export function launchKmh(s, next) {
  const v = s.v || BALL_V[s.type] || 16, [h0, h1] = ballHeights(s, next);
  const arc = s.res === 'net'
    ? ballArc(s.from, [s.from[0] + (s.to[0] - s.from[0]) * 0.9, 0.15 * Math.sign(s.from[1])], null, s.type, h0, 0.6, v, false)
    : ballArc(s.from, s.to, s.bounce, s.type, h0, h1, v, true);
  const dt = 0.004, a = arc.at(0), b = arc.at(dt);
  return Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dt * 3.6);
}

// 공이 떨어진 곳에서 가장 가까운 선까지 거리(m). 복식 옆줄, 베이스라인, 서브면 서비스 라인과 센터 라인
export function lineGap(p, serve = false) {
  const ax = Math.abs(p[0]), az = Math.abs(p[1]);
  const gaps = [Math.abs(ax - 5.485), Math.abs(az - 11.885)];
  if (serve) gaps.push(Math.abs(az - 6.4), ax);
  return Math.min(...gaps);
}

// 아슬아슬한 공: 라인에 걸친 위너·에이스('line'), 조금 나간 공('out'). 중계와 해설이 같은 답을 내도록 위치로만 정한다
export const h01 = p => { const v = Math.sin(p[0] * 12.9898 + p[1] * 78.233) * 43758.5453; return v - Math.floor(v); };
export function closeCall(s) {
  const B = s.bounce || s.to;
  if (!B) return null;
  if ((s.res === 'win' || s.res === 'ace') && lineGap(B, /^serve/.test(s.type)) < 0.3 && h01(B) < 0.5) return 'line';
  if (s.res === 'out' && lineGap(B) < 0.45 && h01(B) < 0.7) return 'out';
  return null;
}

// 능력치 → 몸
export function bodyOf(st, F = 0) {
  const tired = 1 - clamp(F * 0.02, 0, 0.2);
  return {
    react: clamp(0.31 - st.first_step * 0.0018, 0.12, 0.3),
    top: (3.9 + st.speed * 0.03) * tired,
    reach: 0.85 + st.flex * 0.007,
    recov: (2.6 + st.positioning * 0.032) * tired,
  };
}
// 공이 오는 T초 동안 닿을 수 있는 거리. late = 그 공에 늦게 반응한 만큼
export function reachOf(body, T, late = 0) { return body.reach + Math.max(0, T - body.react - late - START) * body.top; }

// 포핸드 쪽인지 백핸드 쪽인지. before = 공을 향해 뛰기 시작한 곳
const RIGHT = team => (team === 0 ? 1 : -1);   // 앞쪽 팀은 +x가 오른손 쪽
export function wingOf(type, team, contact, before) {
  if (type === 'serve' || type === 'serve2' || type === 'smash') return 'over';
  if (/^fh_/.test(type)) return 'fh';
  if (/^bh_/.test(type)) return 'bh';
  return (contact[0] - before[0]) * RIGHT(team) >= -0.3 ? 'fh' : 'bh';
}
// 공을 치는 순간 몸이 서는 곳. 공은 몸 옆(팔과 라켓 길이만큼)에 있다. far = 쭉 뻗어 받을 때의 거리
export function standOf(contact, type, team, before, far = 0) {
  const wing = wingOf(type, team, contact, before);
  const zs = team === 0 ? 1 : -1;
  if (wing === 'over') return [contact[0] - 0.15 * RIGHT(team), contact[1] + zs * 0.25];
  const off = far || (/volley/.test(type) ? 0.55 : 0.75);
  return [contact[0] - off * RIGHT(team) * (wing === 'fh' ? 1 : -1), contact[1]];
}
