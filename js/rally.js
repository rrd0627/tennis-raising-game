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

// 샷 종류별 기본 공 빠르기(m/s). 샷 품질과 파워로 조금 달라진다.
export const BALL_V = { serve: 26, serve2: 18, smash: 24, fh_drive: 18, bh_drive: 17, passing: 19, return: 17, swing_volley: 20, fh_volley: 15, bh_volley: 14, low_volley: 12, half_volley: 12, fh_slice: 13, bh_slice: 13, chip_return: 12, topspin_lob: 11, def_lob: 9, moon_volley: 9, dropshot: 9, drop_volley: 8 };
export const AFTER_BOUNCE = 0.62;   // 바운드 뒤에는 공이 느려진다
export const START = 0.18;          // 멈춘 몸이 속도를 내기까지 잃는 시간

export function flightTime(from, to, bounce, v) {
  const d1 = bounce ? dist(from, bounce) : dist(from, to);
  const d2 = bounce ? dist(bounce, to) : 0;
  return Math.max(0.28, d1 / v + d2 / (v * AFTER_BOUNCE));
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
