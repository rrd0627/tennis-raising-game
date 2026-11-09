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

// 공이 가는 시간(초). 엔진과 중계가 같은 시간을 쓴다. 중계(js/ball.js)는 이 시간에 맞는 실제 궤적을 푼다.
// 강하게 치는 공은 라켓을 떠나는 빠르기(v × LAUNCH, 화면 km/h와 같다)로 나가 공기 저항을 받으며 느려지고,
// 바운드에서 바닥 마찰로 빠르기를 잃는다(탑스핀은 덜, 백스핀은 많이). 공기 저항 셈은 js/ball.js의 물리를 간단히 줄인 것이다.
// 로브와 드롭처럼 높이 뜨는 공은 예전처럼 평균 빠르기(v)로 센다. type이 없으면 예전 셈이다
// LAUNCH는 예전 화면 숫자(km/h)가 그대로 나오게 맞춘 값이다(2026-11-09, 사용자가 정한 공 빠르기를 지킨다)
export const LAUNCH = { serve: 1.32, serve2: 1.49, return: 1.48, fh_drive: 1.53, bh_drive: 1.57, passing: 1.48, swing_volley: 1.29, smash: 1.29, fh_slice: 1.69, bh_slice: 1.76, chip_return: 1.6, fh_volley: 1.22, bh_volley: 1.27, low_volley: 1.29, half_volley: 1.35 };
const KD = 0.022;   // 공기 저항(1/m): 테니스공 항력 계수 약 0.6
const KEEP = t => (/drive|passing|^return$|swing|serve2/.test(t) ? 0.78 : /slice|chip|volley/.test(t) ? 0.62 : 0.7);
// 회전이 많은 공은 항력이 크고 위로 떴다 내려오는 만큼 조금 더 걸린다(js/ball.js로 잰 값)
const SLOW = t => (/drive|passing|^return$|slice|chip|serve2|half/.test(t) ? 1.05 : 1);
export function flightParts(from, to, bounce, v, type) {
  const d1 = bounce ? dist(from, bounce) : dist(from, to), d2 = bounce ? dist(bounce, to) : 0;
  const L = LAUNCH[type];
  if (!L) return [d1 / v, d2 / (v * AFTER_BOUNCE)];
  const vh = (v * L * 0.97) / SLOW(type), e1 = Math.exp(KD * d1);
  return [(e1 - 1) / (KD * vh), d2 > 0 ? (Math.exp(KD * d2) - 1) / ((KD * vh * KEEP(type)) / e1) : 0];
}
export function flightTime(from, to, bounce, v, type) {
  const [a, b] = flightParts(from, to, bounce, v, type);
  return Math.max(0.28, a + b);
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
