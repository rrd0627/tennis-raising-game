// 경기 시뮬레이션 엔진 — 포인트 단위, 공 먼저(노린 곳 → 닿는지로 위너·받기, 실수는 확률) (기획 문서 7장)
// 엔진은 결과와 포인트 로그만 만들고, 화면(match3d.js)은 로그를 재생만 한다.
import { COUNTER_OF, ALL_STATS, OPP_ARCH, STAT_NAME, grade } from './data.js';
import { BALL_V, flightTime, bodyOf, reachOf, standOf, runDist, backOf, bodyDir } from './rally.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(rng) { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 게임 점수(원듀스 노애드, KATO 본선 규정): 40-40(첫 듀스)에서는 두 포인트를 이어 따야 게임, 다시 듀스(두 번째)가 되면 다음 한 포인트로 결정.
// p = [포인트, 포인트]. 4-3은 어드밴티지, 4-4는 두 번째 듀스
export const gameWon = (a, b) => (Math.max(a, b) >= 4 && Math.abs(a - b) >= 2) || Math.max(a, b) >= 5;
// 이 포인트를 따면 게임을 가져가나
const gamePoint = (p, t) => { const q = [...p]; q[t]++; return gameWon(q[0], q[1]); };
// 밸런스 상수 (tools/balance.js 로 조정)
export const TUNE = {
  errBase: 0.11, errSlope: 0.0006, noise: 20, qD: 0.25, dCarry: 0.55, statW: 0.72,
  // 작전. err: 범실 배율, q: 샷 품질, serve: 퍼스트 서브 성공률. 얼마나 구석을 노리는지는 aim.tempo
  tempo: { safe: { err: 0.92, q: -8, serve: 0.03 }, normal: { err: 1, q: 0, serve: 0 }, attack: { err: 1.12, q: 8, serve: -0.03 } },
  // 공 먼저(사용자 2026-11-20: 게임보다 시뮬레이션처럼). 친 사람이 노리는 곳(aimAt)과 받는 사람이 닿는지(intercept)로 위너·받기가 나온다.
  // q0·qr: 샷 품질 → 노리는 정도 a(0~1.25). base·k: 노린 사람에게서 옆으로 몇 m 떨어뜨리나(a만큼 더), sig: 흔들림(m, 잘 칠수록 작다).
  // midZ·deepZ·angZ·lobZ: 네트에서 떨어지는 깊이(m), 뒤의 K는 a만큼 더 깊게. tempo·skill·poach: 노리는 정도 배율
  aim: { q0: 15, qr: 55, base: 0.5, k: 2.6, sig: 1.0, midZ: 8.4, midK: 2.2, deepZ: 9.8, deepK: 1.4, angZ: 5.4, lobZ: 9.2, lobK: 2.2,
    tempo: { safe: 0.88, normal: 1, attack: 1.15 }, skill: [1, 1.12, 1.22], poach: 1.1, poachZ: 6.5 },
  // 늦게 출발하는 만큼(초): 그 공의 대처가 mid보다 낮은 만큼 kc씩(대처 짝이 없는 공은 포지셔닝·샷 선택으로 읽어 k씩), 예측 수비 기술 한 단계마다 skill만큼 빨리
  read: { mid: 55, k: 0.006, kc: 0.012, lo: -0.12, hi: 0.2, skill: 0.07 },
  // 서브를 읽는 데 늦는 만큼(초): 퍼스트 late1, 세컨 late2에 강서브 대처가 55보다 낮은 만큼 k씩
  // wrong: 코스를 잘못 읽어 반대로 쏠렸을 때 더 늦는 만큼. 읽을 확률은 강서브 대처와 서브(퍼스트·코스)의 차이
  srv: { late1: 0.12, late2: 0.04, k: 0.006, wrong: 0.22, read: 0.6,
    // 라인 근처 서브를 아웃인 줄 알고 보내기(동호인 에이스는 대개 이렇다): 판단(샷 선택·집중력·강서브 대처)이 낮을수록,
    // 라인에서 misGap m 안으로 가까울수록, 서브가 빠를수록. mis - 판단 × misK가 라인 위에 떨어진 퍼스트 서브(18m/s)의 확률
    mis: 0.45, misK: 0.004, misGap: 0.6 },
  dGeo: 0.5,        // 받은 공의 부담 D 가운데 실제로 얼마나 뻗었나(공 먼저)의 몫. 나머지는 공의 질과 그 공의 대처
  jamD: 20,         // 몸쪽 공에 끼었을 때 더하는 부담
  overReach: 0.8,   // 떨어지는 로브를 머리 위에서 칠 때 몸에서 공까지(m)
  lunge: 0.6, lungeK: 0.005,   // 닿는지 셀 때 마지막 한 발 내딛고 라켓을 뻗는 만큼(m, 팔 길이 reach에 더한다). 유연성 40에서 lunge, 1마다 lungeK
  poachEarly: 0.15,  // 포치: 상대가 치기 전에 미리 움직이는 시간(초)
  poachQ: 8,        // 포치 발리의 샷 품질 보너스
  // 작전의 구간별 힘. early는 첫 게임, late는 planGames번째 게임부터. q: 샷 품질, err: 범실 배율, tire: 지치는 속도.
  // 강타는 초반에 밀어붙이지만 오래가면 실수가 늘고, 끈질기게 버티는 쪽은 후반에 힘이 난다.
  planGames: 8,
  plan: {
    power: { early: { q: 5, err: 0.92 }, late: { q: 2, err: 1.08 }, tire: 1.15 },
    twoup: { early: { q: 12, err: 1 }, late: { q: 11, err: 1.02 }, tire: 1.05 },
    twoback: { early: { q: 8, err: 0.98 }, late: { q: 12, err: 0.95 }, tire: 0.95 },
    lob: { early: { q: 5, err: 1 }, late: { q: 11, err: 0.93 }, tire: 0.9 },   // 2026-11-20 공 먼저(위너·받기를 실제로 닿는지로 정함)로 다시 맞춤: 둘 다 전위는 로브에 뒤가 비고, 둘 다 후위는 각도·빈 곳에 약해져 올렸다
  },
  rallyErr: 0.004, // 강타가 받혀서 랠리가 길어질수록 느는 범실
  // 뒤로 물러나며 치기(사용자 2026-11-13: 뒤로 가면서 치는 건 굉장히 어렵다). back = 깊은 공에 밀린 정도(0~1), 전위가 머리 위로 넘어간 로브를 쫓아가면 1.
  // 그 사람의 다음 샷 품질이 q만큼 낮아지고 범실이 err만큼 는다
  // 공 먼저: 받는 곳이 서 있던 곳보다 from m 넘게 뒤면 밀리기 시작해 span m 더 뒤면 1
  back: { q: 10, err: 0.07, from: 1.5, span: 3.5 },
  // 둘 다 받으러 가다 엉켰다(각자 판단, 사용자 2026-11-19): 치는 사람의 샷 품질과 범실
  clash: { q: 8, err: 0.06 },
  // 어려운 공·움직이며 치기·기술 샷·빗맞음(사용자 2026-11-13: 어려운 공인데 수비 범위가 너무 넓고 실수가 없다, 개나리는 하프 발리를 잘 못하고
  // 스매시 실수가 잦다, 빗맞는 경우가 많다, 치기 직전까지 움직이면 실수가 는다). 예전에는 쭉 뻗어 받은 공 범실 16.5%, 쉬운 공 14.5%로 거의 같았다
  hard: 0.004,        // 받은 공의 부담 D가 30을 넘는 만큼 범실(D 42 → +4.8%p, 60 → +12%p)
  rush: 0.07,         // 치는 순간까지 움직이고 있으면(여유 0.05초 안, 쭉 뻗어 받음) 범실 +7%p, 여유 0.15초 안·몸쪽 공은 절반
  // 그 샷 능력치가 35면 이만큼 범실이 늘고, 75면 거의 없다(기술이 있으면 TUNE.skill.risk만큼 줄어든다)
  tech: { half_volley: 0.3, smash: 0.1, low_volley: 0.04, swing_volley: 0.07, drop_volley: 0.06, dropshot: 0.06 },
  // 빗맞음: 그 샷 능력치 35에 여유 있는 공이면 샷의 5%, 움직이며·어려운 공일수록 많다. 그중 err만큼은 범실, 나머지는 힘없이 넘어간다(품질 q만큼 낮게)
  mis: { base: 0.05, err: 0.55, q: 22 },
  // 기술. 배운 사람만 쓴다. 안 배우면 기존과 같아서 승률 표는 기술 없는 기준이다. 배열은 수준 0, 1, 2.
  skill: {
    use: { drop: [1, 2, 3], smash: [1, 1.5, 2], swing: [1, 4, 7] }, // 고르는 빈도
    q: [0, 8, 14], risk: [1, 0.6, 0.35],   // 노리는 정도는 aim.skill
    readDef: [0, 4, 8], // 예측 수비: 수비값(받은 공의 부담). 먼저 출발하는 것은 read.skill
  },
  gritK: 0.06, // 2게임 이상 뒤질 때 끈질긴 작전에 붙는 힘. 회복탄력성과 스태미나에 비례
};
const avg = (...xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

const SKILL_OF = { dropshot: 'drop', drop_volley: 'drop', smash: 'smash', swing_volley: 'swing' };
export const SHOT_NAME = {
  serve: '서브', serve2: '세컨 서브', return: '리턴', chip_return: '칩 리턴',
  fh_drive: '포핸드', bh_drive: '백핸드', fh_slice: '포핸드 슬라이스', bh_slice: '백핸드 슬라이스',
  topspin_lob: '탑스핀 로브', def_lob: '수비 로브', dropshot: '드롭샷', passing: '패싱샷',
  fh_volley: '포 발리', bh_volley: '백 발리', low_volley: '로우 발리', half_volley: '하프발리',
  swing_volley: '스윙발리', moon_volley: '문발리', drop_volley: '드롭 발리', smash: '스매시',
};
const DIR_NAME = { cross: '크로스', dtl: '다운더라인', angle: '앵글', center: '센터', deep: '깊게', body: '몸쪽', short: '짧게' };
const COURSE_STAT = { cross: 'cross', dtl: 'dtl', angle: 'angle', center: 'center', deep: 'depth', short: 'depth', body: 'power' };
const HEIGHT = { topspin_lob: 'high', def_lob: 'high', moon_volley: 'high', fh_slice: 'low', bh_slice: 'low', chip_return: 'low', dropshot: 'low', drop_volley: 'low', low_volley: 'low' };
// 샷마다 노린 사람에게서 얼마나 멀리 떨어뜨릴 수 있나(배율). 공 빠르기는 ballV가 따로 정한다
const AIM_F = { smash: 1.2, swing_volley: 1.0, passing: 1.2, fh_volley: 0.75, bh_volley: 0.7, fh_drive: 1.0, bh_drive: 0.95, return: 0.9, fh_slice: 0.8, bh_slice: 0.8, chip_return: 0.75, low_volley: 0.45, half_volley: 0.35 };
const RISK = { dropshot: 0.06, drop_volley: 0.05, swing_volley: 0.06, passing: 0.04, topspin_lob: 0.04, half_volley: 0.05, smash: 0.02 };
const DIR_RISK = { dtl: 0.04, angle: 0.05, short: 0.03 };
const SPEED = { serve: 30, serve2: 20, smash: 28, fh_drive: 21, bh_drive: 19, passing: 22, return: 19, swing_volley: 24, fh_volley: 17, bh_volley: 16, low_volley: 13, half_volley: 13, fh_slice: 15, bh_slice: 15, chip_return: 14, topspin_lob: 13, def_lob: 10, moon_volley: 10, dropshot: 10, drop_volley: 9 };

export const CHOICE_DEFS = [
  { key: 'attack', name: '공략', opts: [['none', '기본'], ['back', '상대 백'], ['center', '센터'], ['alley', '다운더라인'], ['angle', '앵글'], ['weak', '약점 공략']] },
  { key: 'formation', name: '포메이션', opts: [['diag', '사선진'], ['back', '투백'], ['up', '투업'], ['iform', 'I포메이션']] },
  { key: 'shot', name: '샷 성향', opts: [['none', '기본'], ['moon', '문발리·로브'], ['slice', '슬라이스'], ['power', '강타'], ['dash', '네트 대시'], ['serve_volley', '서브 앤 발리'], ['lob_net', '로브 후 네트'], ['deep_slice', '낮고 깊은 슬라이스']] },
  { key: 'tempo', name: '템포', opts: [['safe', '안정'], ['normal', '보통'], ['attack', '공격']] },
  { key: 'mental', name: '멘탈', opts: [['keep', '그대로'], ['breathe', '심호흡'], ['cheer', '파트너 격려']] },
];
export const DEFAULT_CHOICES = { attack: 'none', formation: 'diag', shot: 'none', tempo: 'normal', mental: 'keep' };
export const LOCKED_SHOT_OPTS = ['serve_volley', 'lob_net', 'deep_slice'];
// 경기 전에 고르는 오늘의 작전. 경기가 시작되면 입력은 없다.
export const PLAN_OPTS = [
  { id: 'power', name: '강타 위주', desc: '초반부터 세게 밀어붙인다. 오래가면 실수가 늘 수 있다.' },
  { id: 'twoup', name: '둘 다 전위', desc: '둘이 네트로 나가 빨리 끝낸다. 로브에 뒤가 빈다.' },
  { id: 'twoback', name: '둘 다 후위', desc: '둘 다 뒤에서 끈질기게 넘긴다.' },
  { id: 'lob', name: '로브로 천천히', desc: '높고 느리게 넘긴다. 상대가 먼저 실수하기를 기다린다.' },
];
export const PLAN_SET = {
  power: { formation: 'diag', shot: 'power', tempo: 'attack' },
  twoup: { formation: 'up', shot: 'dash', tempo: 'normal' },
  twoback: { formation: 'back', shot: 'slice', tempo: 'normal' },
  lob: { formation: 'diag', shot: 'moon', tempo: 'safe' },
};

// ── 자리와 공 길 ─────────────────────
// 공 먼저(2026-11-20): 친 사람이 노린 곳과 흔들림으로 공이 떨어질 곳이 정해지고(aimAt), 받는 쪽 두 사람이 지금 선 곳(at)에서
// 몸(js/rally.js)으로 그 공에 닿는지(intercept)로 위너·받기가 나온다. 그래서 선 곳과 몸은 승패에 쓰인다. 중계 연출(sim.vis)만 따로 돈다.
const LOBS = new Set(['topspin_lob', 'def_lob', 'moon_volley']);
const r2 = v => Math.round(v * 100) / 100;
// 능력치가 결과를 가른 순간(중계용). 그 선수 머리 위에 능력치 이름과 등급이 뜬다.
// C(40) 이상일 때만 뜬다. 키운 능력치일수록 경기에서 자주 이름이 보인다
const CALL_MIN = 40;
const STAT_OF_SHOT = t => (t === 'serve' ? 'first_serve' : t === 'serve2' ? 'second_serve' : t);
const POWER_SHOTS = new Set(['serve', 'smash', 'fh_drive', 'bh_drive', 'passing', 'return', 'swing_volley']);
// 샷으로 득점했을 때 쓴 능력치들: 그 샷, 코스, 강한 샷이면 파워
const shotStats = (st, dir) => [STAT_OF_SHOT(st), COURSE_STAT[dir], POWER_SHOTS.has(st) ? 'power' : null].filter(Boolean);
// 이 샷에 쓰인 능력치(중계의 샷 카드용): 샷, 코스, 공 빠르기(파워), 큰 포인트면 압박감 내성
function shotUse(st, dir, forceBh, pressure) {
  const ids = st === 'return' ? ['return', forceBh ? 'bh_drive' : 'fh_drive']
    : st === 'passing' ? ['passing', 'fh_drive', COURSE_STAT[dir]]
    : st === 'chip_return' ? ['chip_return'] : [STAT_OF_SHOT(st), COURSE_STAT[dir]];
  if (POWER_SHOTS.has(st)) ids.push('power');   // 강하게 치는 샷은 파워가 공 빠르기를 정한다
  if (pressure) ids.push('clutch');
  return [...new Set(ids.filter(id => id && STAT_NAME[id]))];
}
// 스탠스(사용자 경험): 크로스(클로즈드), 뉴트럴, 세미오픈, 오픈, 달리면서.
// 여유 있게 멈춰 섰으면 슬라이스·백핸드는 크로스, 쉬운 공의 포핸드는 앞으로 디디는 뉴트럴, 보통은 세미오픈.
// 멀리 뻗거나 몸쪽 공, 여유가 거의 없으면 오픈, 공과 같이 도착하면 달리면서 친다
const NO_STANCE = /volley|smash|^serve/;
function stanceOf(st, mv, D) {
  if (NO_STANCE.test(st) || !mv) return null;
  if (mv.k === 'reach' || mv.k === 'jam') return '오픈';
  const m = mv.m ?? 0.3;
  if (m < 0.08) return '달리면서';
  if (/slice|chip|drop/.test(st)) return m >= 0.22 ? '크로스' : '뉴트럴';
  if (/^bh_/.test(st)) return m >= 0.22 ? '뉴트럴' : '오픈';
  if (m >= 0.3 && D < 30) return '뉴트럴';
  return m >= 0.12 ? '세미오픈' : '오픈';
}
// 샷 카드에 보일 것: acc(정확도 %), use([[능력치 이름, 등급], ...])
const shotInfo = (p, ids, acc) => ({ acc: Math.round(clamp(acc, 3, 99)), use: ids.map(id => [STAT_NAME[id], grade(p.stats[id] ?? 0)]) });
// 랠리 샷의 품질(Q) → 정확도. 중간값 쯤이 70%대
const accOfQ = Q => 70 + (Q - QMID) * 0.7;
const QMID = 40;
function addCall(P, shot, p, ids, end = false) {
  if (!shot || !p) return;
  const id = ids.reduce((a, b) => ((p.stats[b] ?? 0) > (p.stats[a] ?? 0) ? b : a));
  const v = p.stats[id] ?? 0;
  if (v < CALL_MIN || !STAT_NAME[id]) return;
  (shot.call ||= []).push({ j: P.indexOf(p), t: STAT_NAME[id], g: grade(v), ...(end ? { end: 1 } : {}) });
}
// 점 q에서 선분 a-b까지 거리
const segDist = (q, a, b) => {
  const wx = b[0] - a[0], wz = b[1] - a[1], L = wx * wx + wz * wz || 1;
  const t = clamp(((q[0] - a[0]) * wx + (q[1] - a[1]) * wz) / L, 0, 1);
  return Math.hypot(a[0] + wx * t - q[0], a[1] + wz * t - q[1]);
};
const unit = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
// 끝까지 간 공이 펜스(옆 x ±11, 먼 쪽 z -19.5)를 뚫지 않게 길이를 줄인다
function toFence(P, w, L) {
  let k = L;
  if (Math.abs(w[0]) > 1e-3) k = Math.min(k, (10.6 * Math.sign(w[0]) - P[0]) / w[0]);
  if (w[1] < -1e-3) k = Math.min(k, (-19.1 - P[1]) / w[1]);
  return [P[0] + w[0] * Math.max(0.5, k), P[1] + w[1] * Math.max(0.5, k)];
}
// 서브 리턴: 바운드 뒤 공이 떴다가 내려올 때 친다(바운드에서 받는 곳까지 m). 깊게 들어온 서브일수록 뒤에서 받는다
const retD = v => 5.4 + v * 0.05;
// 바운드에서 받는 곳까지(m). 이 수준(동호인)은 튀어 오르는 공(라이징)을 잘 못 치고 꼭대기를 지나 떨어지는 공을 친다(사용자 2026-11-09).
// 공이 튀어 오르는 모양은 들어온 공의 회전으로 다르다(js/ball.js로 잰 값): 탑스핀은 바운드 뒤 약 4.5m에서 꼭대기라 그 뒤 5~5.5m에서(꼭대기를 0.5~1m 지나서.
// 예전에는 6.5m에서 받아 꼭대기를 2m 지나 무릎 높이까지 떨어지기를 기다렸다. 사용자 2026-11-13: 바운드되고 공이 너무 느려진다),
// 슬라이스는 낮게 깔려 1.7m에서 꼭대기라 3m쯤에서, 발리처럼 회전이 적은 공은 그 사이, 스매시는 높이 튀어 멀리서 받는다
const bounceD = (v, st = '') => (/slice|chip/.test(st) ? 2.4 + v * 0.05 : /volley/.test(st) ? 2.6 + v * 0.05 : st === 'smash' ? 5.6 + v * 0.04 : 4.0 + v * 0.08);

// ── 선수 만들기 ───────────────────────────────────────────
export function makeStats(rng, rating, bias = {}, spread = 6) {
  const s = {};
  for (const id of ALL_STATS) s[id] = clamp(Math.round(rating + gauss(rng) * spread + (bias[id] || 0) * clamp(rating / 45, 0.5, 1.3)), 3, 99);
  return s;
}
export function makeNpcTeam(rng, rating, names, archId) {
  const arch = OPP_ARCH.find(a => a.id === archId) || OPP_ARCH[Math.floor(rng() * OPP_ARCH.length)];
  const players = names.map((n, i) => ({ id: `npc${i}`, name: n, stats: makeStats(rng, rating + gauss(rng) * 3, arch.bias), conf: 50, condition: 0 }));
  return { players, arch, rating, combo: clamp(30 + gauss(rng) * 15, 0, 80), isHuman: false };
}

// ── 경기 ─────────────────────────────────────────────────
export class MatchSim {
  constructor(teamA, teamB, opts = {}) {
    this.rng = opts.rng || Math.random;
    this.teams = [teamA, teamB];
    this.P = [];
    [teamA, teamB].forEach((t, ti) => t.players.forEach((p, k) => {
      this.P.push({
        ...p, team: ti, slot: k, side: k, gauge: clamp(40 + (p.conf ?? 50) * 0.4, 20, 85), F: opts.startFatigue?.[ti] ?? 0, pos: 'base',
        rec: { fsIn: 0, fsTot: 0, aces: 0, df: 0, winners: 0, errors: 0, errEarly: 0, errLate: 0, skillUse: {}, poachTry: 0, poachWin: 0, assists: 0, counter: {}, shots: {} },
      });
    }));
    teamA.choices = { ...DEFAULT_CHOICES, ...(teamA.choices || {}) };
    teamB.choices = { ...DEFAULT_CHOICES, ...(teamB.choices || {}) };
    teamA.found = null; teamB.found = null;
    this.games = [0, 0];
    this.serveTeam = this.rng() < 0.5 ? 0 : 1;
    this.serveCount = [0, 0];
    this.over = false; this.winner = null;
    this.gameNo = 0;
    this.history = [];
    this.bp = { won: [0, 0], tot: [0, 0] };
    this.vis = mulberry32(0x5eed);   // 중계 연출 전용 난수. 엔진 난수(this.rng)와 따로 돈다
  }
  team(i) { return this.teams[i]; }
  mate(p) { return this.P.find(q => q.team === p.team && q !== p); }
  opps(p) { return this.P.filter(q => q.team !== p.team); }
  zSign(t) { return t === 0 ? 1 : -1; }
  // 화면에서 서는 쪽. 엔진의 side(누구에게 크로스인지)와 따로, 포인트마다 서브하는 쪽 기준으로 정한다(vs)
  xSign(p, side = p.vs ?? p.side) { return (p.team === 0 ? 1 : -1) * (side === 0 ? 1 : -1); }
  anchor(p) {
    const zs = this.zSign(p.team), xs = this.xSign(p);
    if (p.pos === 'net') return [xs * 2.3, zs * 3.4];
    return [xs * 2.8, zs * 11.0];
  }
  snapshot() { return this.P.map(p => this.anchor(p)); }

  // ── 선 곳(공 먼저라 승패에 쓰인다) ──
  // 복식에서 서는 곳(초안). 둘이 공 쪽(bx)으로 같이 움직인다. press 1 = 우리가 밀어붙임(전위가 다가선다), -1 = 밀림.
  // press는 샷마다 조금씩만 바뀐다. 그래야 전위가 샷마다 앞뒤로 들썩이지 않는다
  homeOf(p, bx = 0, press = 0) {
    const zs = this.zSign(p.team), xs = this.xSign(p);
    bx = clamp(bx, -4.5, 4.5);   // 옆줄 밖으로 나가는 공까지 따라 옮기지 않는다
    if (p.pos === 'net') {
      const lean = 0.3 + Math.max(0, press) * p.stats.poach / 400;
      // 전위는 서비스 박스 가운데쯤, 네트에서 두세 걸음(3m, 2026-11-16 개나리 경기 비교: 예전 3.6m)
      return [clamp(xs * 2.2 + bx * lean, -4.4, 4.4), zs * (3.0 - Math.max(0, press) * 0.6 + Math.max(0, -press) * 0.6)];
    }
    return [clamp(xs * 2.7 + bx * 0.3, -5, 5), zs * 11.8];   // 후위는 베이스라인 위(개나리는 베이스라인 위·안쪽에 선다, 예전 12.2m)
  }
  // 공 빠르기: 샷 품질과 파워
  // 서브 공 빠르기(바운드까지 평균, m/s). 여자 동호인 서브는 느리다(사용자 경험, 2026-11-08).
  // 그런데 공에 실제 물리(중력·공기 저항)를 넣고 보니 60km/h대 서브는 3.5m 넘게 쳐 올려야 서비스 박스에 들어가 로브처럼 보였다(사용자 2026-11-11: 거의 로브).
  // 그래서 올렸다. 라켓을 떠날 때(화면 숫자) 첫 서브는 능력치 30이면 약 77km/h, 50이면 86, 70이면 100, 85면 110. 세컨은 70~94km/h. 파워가 조금 더한다
  serveV(p, first) { const s = p.stats; return (first ? 13.6 + s.first_serve * 0.105 : 11.2 + s.second_serve * 0.07) * (0.94 + s.power / 100 * 0.12); }
  // 랠리 공 빠르기(바운드까지 평균, m/s): 샷 품질(Q)과, 강하게 치는 샷이면 파워. 키운 만큼 공이 빨라 보이게 폭을 넓혔다(2026-11-08)
  ballV(H, st, Q) { return (BALL_V[st] || 16) * (0.86 + clamp((Q - 25) / 50, 0, 1) * 0.24) * (POWER_SHOTS.has(st) ? 0.86 + H.stats.power / 100 * 0.28 : 1); }
  // 서브가 떨어지는 곳. 서브 코스가 좋을수록 선에 가깝다
  serveSpot(server, cx, zs, kind) {
    const edge = clamp(0.2 + server.stats.serve_place / 140, 0.3, 0.85);
    const x = kind === 'wide' ? -cx * (2.4 + 1.5 * edge) : kind === 'T' ? -cx * (1.6 - 1.4 * edge) : -cx * 2.6;
    return [x, -zs * (4.6 + 1.5 * edge)];
  }
  // ── 공 먼저(사용자 2026-11-20: 게임보다 시뮬레이션처럼) ──
  // 예전에는 위너·받기를 확률로 먼저 정하고 공을 거기에 맞춰 놓았다. 위너는 받기로 정한 한 사람만 닿지 못하게 놓여서,
  // 뒤에 선 파트너 바로 앞에 느리게 떨어지는 문발리도 구경만 했다. 지금은 친 사람이 노린 곳과 흔들림으로 공이 떨어질 곳이 정해지고,
  // 상대 두 사람이 각자 몸(첫발·스피드·유연성)과 반응(그 공의 대처, 예측 수비)으로 닿는지 계산해서 위너인지 받는지가 나온다.
  // 친 사람이 노리는 곳: 노린 사람(R)에게서 코스 쪽으로 떨어뜨린다. 샷 품질이 좋을수록 멀리·깊게·덜 흔들리게.
  // R의 파트너가 전위면 그 손이 닿지 않게 비켜 노린다. 떨어지는 곳은 노린 곳에서 흔들리고 코트 안이다(아웃·네트는 범실로 따로 정한다)
  aimAt(H, st, dir, Q, from, R, at, toBh, mul, openOf = null) {
    const rng = this.rng, A = TUNE.aim, rz = this.zSign(R.team), side = this.xSign(R), rgt = R.team === 0 ? 1 : -1;
    const Ri = this.P.indexOf(R), P0 = at[Ri];
    const a = clamp((Q - A.q0) / A.qr, 0, 1.25), a1 = Math.min(1, a);
    // 흔들림은 각도 오차라 멀리 칠수록 크다(18m에서 sig). 네트 앞 발리는 덜 흔들린다
    const dist = Math.hypot(P0[0] - from[0], P0[1] - from[1]);
    const sig = A.sig * clamp(dist / 18, 0.35, 1.3) * (1.35 - 0.6 * a1), g1 = gauss(rng), g2 = gauss(rng), pick = rng();
    let x, z, kz = 0.7;
    if (openOf && dir !== 'body') {
      // 포치 발리: 네트 앞에서 코트가 다 보인다. 두 사람이 가장 닿기 어려운 곳(빈 곳)을 골라 친다(발밑을 노리는 것은 body)
      let bx = 0, bz = A.poachZ, bv = -1e9;
      for (const cx of [-4.4, -2.2, 0, 2.2, 4.4]) for (const cz of [4.5, 6.5, 8.5]) { const o = openOf([cx, rz * cz]); if (o > bv) { bv = o; bx = cx; bz = cz; } }
      x = bx; z = bz; kz = 0.5;
    } else if (LOBS.has(st)) { x = P0[0] * 0.75; z = A.lobZ + A.lobK * a1 * mul; }   // 노린 사람(대개 전위) 머리 위로, 좋을수록 깊게
    else if (st === 'dropshot' || st === 'drop_volley') { x = P0[0] * 0.5; z = 3.6 - 1.8 * a1 * mul; kz = 0.5; }
    else {
      const want = (A.base + A.k * a) * (AIM_F[st] ?? 1) * mul;
      // 노린 사람에게서 옆으로. side는 그 사람의 바깥(옆줄) 쪽
      const lx = dir === 'dtl' || dir === 'angle' ? side * want : dir === 'center' ? -side * want : dir === 'body' ? 0
        : dir === 'deep' ? (toBh ? -rgt : pick < 0.5 ? 1 : -1) * want * 0.35 : (toBh ? -rgt : pick < 0.5 ? 1 : -1) * want;
      x = P0[0] + lx;
      z = dir === 'angle' ? A.angZ + (1 - a1) * 2.2 : dir === 'body' ? clamp(Math.abs(P0[1]) - 2.5, 3.5, 9.5) : dir === 'deep' ? A.deepZ + A.deepK * a1 : A.midZ + A.midK * a1;
      if (dir === 'angle' || dir === 'body') kz = 0.5;
      // R의 파트너가 앞에 서 있으면 그 손이 닿지 않게 비켜 노린다(R이 전위면 그 뒤의 파트너는 공 길에 없다)
      const Mt = this.mate(R), mi = this.P.indexOf(Mt);
      if (Mt.pos === 'net' && R.pos !== 'net' && dir !== 'body') {
        const need = 0.85 + Mt.stats.flex * 0.007 + 0.5;
        for (let it = 0; it < 3; it++) {
          const B0 = [clamp(x, -5.35, 5.35), rz * clamp(z, 1.0, 11.75)];
          const d = segDist(at[mi], from, B0);
          if (d >= need) break;
          const sx = Math.sign(B0[0] - at[mi][0]) || -Math.sign(at[mi][0]) || 1;
          x = B0[0] + sx * (need - d) * 1.6;
        }
      }
    }
    return [clamp(x + g1 * sig, -5.35, 5.35), rz * clamp(z + g2 * sig * kz, 1.0, 11.75)];
  }
  // 공이 가는 길: from에서 B(바운드)를 지나 같은 방향으로 간다(바운드에서 꺾이지 않는다). s = from에서 땅 위로 간 거리.
  // ideal = 바운드 뒤 꼭대기를 지나 떨어질 때(이 수준은 그때 친다), s1 = 너무 낮아지거나 두 번 튀기 전까지
  pathOf(from, B, v, st) {
    const d1 = Math.hypot(B[0] - from[0], B[1] - from[1]), w = unit(from, B);
    const sNet = Math.abs(B[1] - from[1]) > 0.01 ? clamp(-from[1] / (B[1] - from[1]), 0, 1) * d1 : 0;
    const drop = st === 'dropshot' || st === 'drop_volley', srv = /^serve/.test(st), lob = LOBS.has(st);
    const bd = srv ? retD(v) : drop ? 1.4 : bounceD(v, st);
    const extra = srv ? 1.6 : drop ? 0.8 : lob ? 3.0 : st === 'smash' ? 3.4 : /slice|chip|volley/.test(st) ? 1.8 : 2.6;
    return { from, B, w, d1, v, st, sNet, lob, ideal: d1 + bd, s1: d1 + bd + extra };
  }
  // j가 이 공에 닿나: 공 길 위 여러 곳에서 공이 오는 시간과 그 사람이 그때까지 갈 수 있는 거리(가속도·최고 속도·팔 길이)를 견준다.
  // late = 늦게 출발한 만큼. 닿으면 가장 편한 곳을 고른다: 로브는 떨어지기 전에 스매시, 앞에 선 사람은 바운드 전에 발리,
  // 그 밖에는 바운드 뒤 꼭대기를 지나 떨어질 때. 닿지 못하면 가장 가까이 갈 수 있던 곳(near)과 모자란 거리(def)
  intercept(j, path, late, body, at, o = {}) {
    const P = this.P[j], pos = at[j], { from, w, d1, v, st } = path;
    const fwd = P.pos === 'net' || Math.abs(pos[1]) < 6.5;
    const smashW = 1.7 + (P.stats.smash - 40) * 0.03 + (P.skills?.smash || 0) * 0.5;   // 떨어지는 로브를 스매시할 수 있는 거리(바운드 전 m)
    const lunge = TUNE.lunge + (P.stats.flex - 40) * TUNE.lungeK;   // 마지막 한 발: 유연성이 좋을수록 멀리 뻗는다
    let best = null, near = null;
    const tryS = (s, air) => {
      const pt = [from[0] + w[0] * s, from[1] + w[1] * s];
      if (Math.abs(pt[0]) > 9.3 || Math.abs(pt[1]) > 17.6) return;
      const t = air ? flightTime(from, pt, null, v, st) : flightTime(from, pt, path.B, v, st);
      const bd = bodyDir(body[j], backOf(pos, pt)), tr = t - bd.react - late;
      // 떨어지는 로브를 머리 위에서 치려면 공 밑까지 가야 한다(옆으로 뻗어 닿는 만큼을 쓰지 못한다)
      const d = Math.hypot(pt[0] - pos[0], pt[1] - pos[1]), can = (air && path.lob ? TUNE.overReach : bd.reach + lunge) + runDist(tr, bd.top, bd.acc ?? 12.5), def = d - can;
      if (!near || def < near.def) near = { pt, def };
      if (def > 0) return;
      const f = clamp(d / Math.max(0.4, can), 0, 1);
      let cost = f * 1.2;
      if (air && path.lob) cost -= 1;   // 닿는 로브는 스매시
      else if (air && o.poach) cost = (s - path.sNet) * 0.12 + f * 0.3;   // 포치: 미리 가로질러 나가 네트 가까이에서 일찍
      else if (air) cost += (s - path.sNet) * 0.03 - 0.3;   // 앞에서 발리
      else cost += Math.abs(s - path.ideal) * 0.22 + Math.max(0, path.ideal - s) * 0.12;   // 튀어 오르는 공은 불편하다
      if (!best || cost < best.cost) best = { cost, s, C: pt, t, f, air };
    };
    if (!o.postOnly && st !== 'smash' && !/^serve/.test(st)) {
      // 떨어지는 로브 스매시. 뒤에 선 사람은 앞으로 나와 받을 짧은 로브만(머리 위로 넘어오는 깊은 로브는 바운드시킨다)
      if (path.lob) { if (fwd || Math.abs(path.B[1]) < Math.abs(pos[1]) - 4) for (let s = d1 - smashW; s <= d1 - 0.15; s += 0.25) if (s > path.sNet + 0.5) tryS(s, true); }
      else if (fwd || o.preOnly) for (let s = path.sNet + 0.4; s <= d1 - 0.3; s += 0.4) tryS(s, true);
    }
    if (!o.preOnly) for (let s = d1 + 0.5; s <= path.s1; s += 0.35) tryS(s, false);
    return best ? { ok: true, ...best } : { ok: false, near: near ? near.pt : path.B, def: near ? near.def : 9 };
  }
  // 받은 공의 부담 D: 실제로 얼마나 뻗었나(f)와 공의 질(Dq)을 섞는다
  mixD(I, Dq) { const Dg = clamp((I.f - 0.15) / 0.0136, 0, 95); return clamp(TUNE.dGeo * Dg + (1 - TUNE.dGeo) * Dq, 0, 95); }
  // 실수한 공이 나가는 곳: 노린 코스 쪽으로 벗어난다
  missSpot(H, st, dir, from, g, r) {
    const zo = -this.zSign(H.team), sx = Math.sign(from[0]) || 1;
    if (!LOBS.has(st) && (dir === 'dtl' || dir === 'angle' || (dir === 'cross' && r < 0.35))) {
      const aim = dir === 'dtl' ? sx : -sx;
      return [aim * (5.7 + Math.abs(g) * 0.6), zo * (dir === 'angle' ? 4 + r * 3 : 7 + r * 4.5)];
    }
    return [clamp(-from[0] * 0.6 + g * 1.5, -5.5, 5.5), zo * (12.3 + r * 1.4)];
  }

  gmod(p) {
    const g = p.gauge;
    if (g >= 80) return 0.06; if (g < 10) return -0.12; if (g < 30) return -0.06; return (g - 50) / 1000;
  }
  mentalState(p) { const g = p.gauge; return g >= 80 ? 'zone' : g < 10 ? 'tilt' : g < 30 ? 'shaky' : 'normal'; }

  applyGameStartChoices() {
    for (let ti = 0; ti < 2; ti++) {
      const t = this.teams[ti], ps = this.P.filter(p => p.team === ti);
      if (t.choices.mental === 'breathe') ps.forEach(p => { if (p.gauge < 60) p.gauge = clamp(p.gauge + 10 * (0.5 + p.stats.resilience / 100), 0, 100); });
      if (t.choices.mental === 'cheer') ps.forEach(p => { const m = this.mate(p); p.gauge = clamp(p.gauge + 7 * (0.5 + m.stats.comm / 100), 0, 100); });
    }
  }

  // 게임 하나 진행 → 포인트 로그 배열
  playGame() {
    if (this.over) return null;
    this.applyGameStartChoices();
    const tb = this.games[0] === 6 && this.games[1] === 6;
    const points = [];
    const st = { p: [0, 0] };
    const serveTeam = this.serveTeam;
    const serverK = this.serveCount[serveTeam] % 2;
    const tbOrder = [];
    if (tb) {
      // 타이브레이크 서브 순서: 다음 서버부터 두 팀 번갈아
      const a = this.P.filter(p => p.team === serveTeam), b = this.P.filter(p => p.team !== serveTeam);
      const bk = this.serveCount[1 - serveTeam] % 2;
      tbOrder.push(a[serverK], b[bk], a[1 - serverK], b[1 - bk]);
    }
    let streak = [0, 0];
    for (let n = 0; n < 60; n++) {
      let server;
      if (tb) server = tbOrder[Math.floor((n + 1) / 2) % 4];
      else server = this.P.filter(p => p.team === serveTeam)[serverK];
      const sTeam = server.team, rTeam = 1 - sTeam;
      const court = n % 2; // 0=듀스 1=애드
      const recvs = this.P.filter(p => p.team === rTeam);
      let receiver = recvs.find(p => p.side === court);
      const deciding = !tb && st.p[0] === 4 && st.p[1] === 4;   // 두 번째 듀스: 받는 팀이 받을 사람을 고른다
      if (deciding) receiver = recvs.reduce((a, b) => (a.stats.return >= b.stats.return ? a : b));
      // 상황 판단
      const ctx = this.situation(st, tb, sTeam);
      const pt = this.playPoint(server, receiver, court, ctx);
      const w = pt.winner;
      st.p[w]++;
      streak[w]++; streak[1 - w] = 0;
      if (streak[1 - w] === 0 && streak[w] >= 3) this.P.filter(p => p.team !== w).forEach(p => { p.gauge -= 4 * (1 - p.stats.resilience / 140); });
      if (ctx.bpFor !== null) { this.bp.tot[ctx.bpFor]++; if (w === ctx.bpFor) this.bp.won[ctx.bpFor]++; }
      pt.score = this.scoreText(st, tb);
      pt.games = [...this.games];
      points.push(pt);
      // 게임 종료?
      if (!tb && gameWon(st.p[0], st.p[1])) break;
      if (tb && (st.p[0] >= 7 || st.p[1] >= 7) && Math.abs(st.p[0] - st.p[1]) >= 2) break;
    }
    const gw = st.p[0] > st.p[1] ? 0 : 1;
    this.games[gw]++;
    if (!tb) this.serveCount[serveTeam]++;
    else { this.serveCount[serveTeam]++; }
    this.serveTeam = 1 - this.serveTeam;
    this.gameNo++;
    const [a, b] = this.games;
    if ((a >= 6 || b >= 6) && Math.abs(a - b) >= 2) { this.over = true; this.winner = a > b ? 0 : 1; }
    if (a === 7 || b === 7) { this.over = true; this.winner = a > b ? 0 : 1; }
    // 상대 분석: 약한 대처 발견
    for (let ti = 0; ti < 2; ti++) {
      const t = this.teams[ti];
      if (t.found) continue;
      const ps = this.P.filter(p => p.team === ti);
      if (this.rng() < avg(...ps.map(p => p.stats.analysis)) / 320) {
        const os = this.P.filter(p => p.team !== ti);
        const cs = ['c_moon', 'c_slice', 'c_lob', 'c_drop', 'c_angle', 'c_body'];
        t.found = cs.reduce((m, c) => (avg(...os.map(o => o.stats[c])) < avg(...os.map(o => o.stats[m])) ? c : m), cs[0]);
        t.foundAt = this.gameNo;
      }
    }
    const res = { points, gameWinner: gw, tiebreak: tb, games: [...this.games], over: this.over, winner: this.winner, serveTeam };
    this.history.push(res);
    return res;
  }

  situation(st, tb, sTeam) {
    const rTeam = 1 - sTeam;
    let bpFor = null, label = null, big = false, pressure = false;
    const [a, b] = this.games;
    if (!tb) {
      const ps = st.p;
      const rWins = gamePoint(ps, rTeam);   // 원듀스 노애드
      const decide = ps[0] === 4 && ps[1] === 4;
      if (rWins) { bpFor = rTeam; big = true; pressure = true; label = decide ? '듀스 결정 포인트' : '브레이크 포인트'; }
      else if (ps[0] === 3 && ps[1] === 3) { pressure = true; label = '듀스'; }
      // 매치 포인트
      for (const t of [0, 1]) {
        if (gamePoint(ps, t)) {
          const g2 = [...this.games]; g2[t]++;
          if ((g2[t] >= 6 && g2[t] - g2[1 - t] >= 2) || g2[t] === 7) { label = '매치 포인트'; big = true; pressure = true; }
        }
      }
    } else {
      pressure = st.p[0] >= 5 || st.p[1] >= 5;
      big = true; label = '타이브레이크';
      for (const t of [0, 1]) if (st.p[t] >= 6 && st.p[t] > st.p[1 - t]) label = '매치 포인트';
    }
    return { bpFor, label, big, pressure };
  }

  scoreText(st, tb) {
    if (tb) return `${st.p[0]} - ${st.p[1]}`;
    const n = ['0', '15', '30', '40'], [a, b] = st.p;
    if (gameWon(a, b)) return a > b ? `게임 - ${n[Math.min(3, b)]}` : `${n[Math.min(3, a)]} - 게임`;
    if (a >= 3 && b >= 3) return a === b ? '40 - 40' : a > b ? 'AD - 40' : '40 - AD';   // 듀스·어드밴티지
    return `${n[a]} - ${n[b]}`;
  }

  // ── 포인트 ─────────────────────────────────────────────
  playPoint(server, receiver, court, ctx) {
    const rng = this.rng;
    const sT = this.teams[server.team], rT = this.teams[receiver.team];
    const sMate = this.mate(server), rMate = this.mate(receiver);
    // 포메이션 → 시작 위치
    for (const p of this.P) p.pos = 'base';
    // 화면에서 서는 쪽: 서브하는 사람은 이번 포인트 코트 쪽, 파트너는 반대쪽 (리턴하는 쪽도 같다)
    server.vs = court; sMate.vs = 1 - court; receiver.vs = court; rMate.vs = 1 - court;
    if (sT.choices.formation !== 'back') sMate.pos = 'net';
    if (rT.choices.formation === 'up' || rT.choices.formation === 'diag' || rT.choices.formation === 'iform') rMate.pos = 'net';
    if (rT.choices.formation === 'back') rMate.pos = 'base';
    const pressure = ctx.pressure;
    const M = p => this.gmod(p) + (pressure ? (p.stats.clutch - 55) / 600 : 0) + (p.condition || 0) * 0.015;
    const shots = [];
    const zs = this.zSign(server.team);
    const cx = (server.team === 0 ? 1 : -1) * (court === 0 ? 1 : -1);
    const serverPos = [cx * 1.0, zs * 11.9];
    const rx = -cx * 3.0, rz = -zs * 11.2;
    const recvPos = [rx, rz];
    const pos0 = this.snapshot();
    const si = this.P.indexOf(server), ri = this.P.indexOf(receiver);
    pos0[si] = serverPos; pos0[ri] = recvPos;
    if (sT.choices.formation === 'iform') { const mi = this.P.indexOf(sMate); pos0[mi] = [0.3 * cx, zs * 3.0]; }
    // 리턴하는 쪽 파트너는 서비스 라인 근처에서 시작한다
    if (rMate.pos === 'net') pos0[this.P.indexOf(rMate)] = [this.xSign(rMate) * 2.4, -zs * 6.2];
    // ── 지금 선 곳, 몸, 공을 향해 뛰기 시작한 곳(공 먼저: 누가 닿는지 여기서 계산한다) ──
    const at = pos0.map(p => [...p]);
    const body = this.P.map(p => bodyOf(p.stats, p.F));
    const runFrom = pos0.map(p => [...p]);
    // 공이 나는 ft초 동안의 움직임을 적고, 각자 ft초 뒤에 있을 곳으로 옮겨 둔다
    const move = (plan, ft) => plan.map((m, j) => {
      if (!m) return null;
      runFrom[j] = [...at[j]];
      const d = Math.hypot(m.x - at[j][0], m.z - at[j][1]);
      const k = d > 0.01 ? Math.min(1, runDist(ft - m.t0, m.v, body[j].acc) / d) : 1;   // 가속도까지 넣어 실제로 갈 수 있는 만큼
      at[j] = [at[j][0] + (m.x - at[j][0]) * k, at[j][1] + (m.z - at[j][1]) * k];
      return { x: r2(m.x), z: r2(m.z), t0: r2(m.t0), v: r2(m.v), k: m.k, ...(m.top && !m.body ? { top: r2(m.top) } : {}), ...(m.far ? { far: r2(m.far) } : {}), ...(m.m !== undefined ? { m: r2(m.m) } : {}), ...(m.chase ? { chase: 1 } : {}), ...(m.body ? { top: r2(m.body.top), reach: r2(m.body.reach), react: r2(m.body.react) } : {}) };
    });
    // 팀마다 밀어붙이는 정도. 친 쪽의 공이 좋으면 오르고 상대는 내려가는데, 샷마다 조금씩만 움직인다
    const lvl = [0, 0];
    const pushLvl = (team, by) => {
      lvl[team] += (by - lvl[team]) * 0.45;
      lvl[1 - team] += (-by * 0.5 - lvl[1 - team]) * 0.45;
    };
    // 나머지 사람들은 공 쪽(bx)으로 같이 옮긴다
    const follow = (plan, bx) => {
      for (let j = 0; j < 4; j++) if (!plan[j]) {
        const p = this.P[j], [x, z] = this.homeOf(p, bx, lvl[p.team]);
        plan[j] = { x, z, t0: body[j].react * 1.2, v: body[j].recov, k: 'shift' };
      }
      return plan;
    };
    // 받는 사람이 C까지 가는 계획. 공보다 먼저 닿게 뛴다
    // 쉬운 공(set)은 전속력이 아니라 조금 여유 있게 닿을 만큼만 뛴다. 멀거나 몸쪽 공은 전속력
    // 가는 쪽의 최고 속도를 넘지 않는다(뒤로 가면 돌아서는 만큼 늦게 출발하고 느리다). 모자라면 팔을 뻗어 받는다
    const runAt = (j, C, ft, t0, k) => {
      const bd = bodyDir(body[j], backOf(at[j], C)), t0b = t0 + (bd.react - body[j].react);
      const d = Math.max(0, Math.hypot(C[0] - at[j][0], C[1] - at[j][1]) - 0.6), avail = Math.max(0.15, ft - t0b - 0.03), need = d / avail;
      const early = clamp((this.P[j].stats.positioning - 35) / 70, 0, 0.6);   // 포지셔닝 35 이하는 여유 없음, 77이면 60% 빨리
      const v = k === 'set' ? Math.min(bd.top, Math.max(need * (1 + early), d > 0.3 ? 1.6 : 0)) : bd.top;
      const vv = Math.min(Math.max(v, need), bd.top * 1.1), margin = vv > 0 ? avail - d / vv : avail;   // 공보다 몇 초 먼저 도착하나
      return { x: C[0], z: C[1], t0: t0b, v: vv, k, m: margin, top: bd.top, ...(k === 'reach' ? { far: body[j].reach * 0.85 } : {}) };
    };
    // 나가거나 걸릴 공: 가까운 사람이 받을 것처럼 움직이다가 마지막에 보낸다. 파트너는 조금 따라 옮긴다.
    // 공이 그 사람 곁을 지나간 뒤 떨어지면(길게 나가는 공) 공이 지나는 선 옆까지 가서 받을 준비를 하다가 보낸다.
    // 그 사람에게 오기 전에 떨어지면(옆줄 밖으로 나가는 공, 폴트 서브) 들어왔다면 칠 곳, 곧 떨어진 곳 너머(after m)로
    // 쫓아가다가 떨어진 것을 보고 멈춘다(chase, 사용자 경험 2026-11-09: 라인에 맞고 튀면 공이 많이 뒤로 온다)
    const letGo = (from, to, ft, team, who = -1, v = 0, after = 0) => {
      const plan = [], os = [0, 1, 2, 3].filter(j => this.P[j].team === team);
      const w = unit(from, to), L = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const proj = j => (at[j][0] - from[0]) * w[0] + (at[j][1] - from[1]) * w[1];
      const lands = j => after > 0 && proj(j) > L - 0.3;
      const near = j => { if (lands(j)) return [to[0] + w[0] * after, to[1] + w[1] * after]; const s = clamp(proj(j), 0, L); return [from[0] + w[0] * s, from[1] + w[1] * s]; };
      const gap = j => { const X = near(j); return Math.hypot(X[0] - at[j][0], X[1] - at[j][1]); };
      let j = os.includes(who) ? who : gap(os[0]) <= gap(os[1]) ? os[0] : os[1];
      // 앞에 떨어지는 공은 그쪽에 선 사람이 쫓는다(엔진이 판단을 맡긴 사람이 화면에서 반대편에 서 있을 수 있다)
      { const k = os[0] === j ? os[1] : os[0]; if (after > 0 && lands(k) && gap(k) < gap(j) - 0.5) j = k; }
      const o = os[0] === j ? os[1] : os[0];
      const X = near(j), bj = bodyDir(body[j], backOf(at[j], X)), t0 = bj.react, u = unit(at[j], X), ch = lands(j);
      const tAll = ch ? ft + after / Math.max(4, v * 0.55) : ft;
      const go = clamp(Math.min(gap(j) - 0.7, Math.max(0, tAll - t0 - 0.1) * bj.top * 0.9), 0.35, ch ? 7 : 4.5);
      // body: 중계가 실제 공 길을 보고 누가 어디까지 쫓을지 다시 정할 때 쓴다(js/match3d.js chasePlan)
      plan[j] = { x: at[j][0] + u[0] * go, z: at[j][1] + u[1] * go, t0, v: bj.top * (ch ? 0.95 : 0.85), k: 'let', ...(ch ? { chase: 1 } : {}), body: bj };
      plan[o] = { x: at[o][0] + (X[0] - at[o][0]) * 0.12, z: at[o][1], t0: body[o].react * 1.2, v: body[o].recov, k: 'shift', body: body[o] };
      plan.who = j;
      return plan;
    };
    // 닿지 못하는 사람: 공 쪽으로 뛰다가 몸을 던진다
    const missAt = (j, X, ft, late = 0) => {
      const bd = bodyDir(body[j], backOf(at[j], X)), t0 = bd.react + late, d = Math.hypot(X[0] - at[j][0], X[1] - at[j][1]);
      const go = Math.max(0, Math.min((ft - t0 - 0.18) * bd.top, d - bd.reach - 0.35));
      const w = unit(at[j], X);
      return { x: at[j][0] + w[0] * go, z: at[j][1] + w[1] * go, t0, v: bd.top, k: 'miss', body: bd };
    };
    let winner = null, endType = null, endBy = null, lastByTeam = [null, null];
    const tempoOf = t => TUNE.tempo[t.choices.tempo] || TUNE.tempo.normal;
    const fat = p => p.F;
    const rec = (p, type, k) => { const r = p.rec.shots[type] || (p.rec.shots[type] = { n: 0, win: 0, err: 0 }); r[k]++; };
    const recCounter = (p, c, ok) => { const r = p.rec.counter[c] || (p.rec.counter[c] = { tot: 0, ok: 0 }); r.tot++; if (ok) r.ok++; };
    const phase = Math.min(1, this.gameNo / TUNE.planGames);
    const planOf = t => TUNE.plan[t.choices.plan];
    const planVal = (t, key) => { const pl = planOf(t); return pl ? pl.early[key] + (pl.late[key] - pl.early[key]) * phase : key === 'err' ? 1 : 0; };
    const tire = p => { p.F += 0.035 * (1.6 - p.stats.stamina / 100) * (planOf(this.teams[p.team])?.tire ?? 1); };

    // 서브
    const s = server.stats, r = receiver.stats;
    // 서브 품질(중계의 샷 카드용): 퍼스트는 서브와 코스, 세컨은 세컨 서브와 코스
    const sq1 = 0.6 * s.first_serve + 0.4 * s.serve_place + M(server) * 100, sq2 = 0.7 * s.second_serve + 0.3 * s.serve_place + M(server) * 100;
    server.rec.fsTot++;
    // 퍼스트 서브 들어가는 비율: 동호인은 반쯤(NTRP 2.5~4.0 53~55%, 2026-11-16 자료 비교). 능력치 35 → 53%, 50 → 57%, 70 → 63%
    const pin = clamp(0.43 + s.first_serve / 350 + M(server) * 0.8 - fat(server) / 300 + tempoOf(sT).serve, 0.35, 0.85);
    let first = rng() < pin;
    let D, type = 'serve';
    const fault = () => [-cx * (0.8 + this.vis() * 3.6), -zs * (6.6 + this.vis() * 0.8)];
    if (first) server.rec.fsIn++;
    else {
      const fb = fault(), fv = this.serveV(server, true);
      shots.push({ h: si, type: 'serve', from: serverPos, bounce: fb, to: fb, res: 'fault', pos: pos0, v: r2(fv), info: shotInfo(server, ['first_serve', 'serve_place', 'power'], sq1 * 0.45), mv: move(letGo(serverPos, fb, flightTime(serverPos, fb, null, fv, 'serve'), receiver.team, ri, fv, retD(fv)), 0) });
      const pin2 = clamp(0.75 + s.second_serve / 500 + M(server) - fat(server) / 400, 0.65, 0.95);   // 세컨: 능력치 35 → 82%, 70 → 89%(미국 동호인 약 70%. 우리 동호인은 살살 넣는 세컨이 많다)
      if (rng() >= pin2) {
        server.rec.df++;
        server.gauge -= 8 * (1 - server.stats.composure / 170);
        const fb2 = fault(), fv2 = this.serveV(server, false);
        shots.push({ h: si, type: 'serve2', from: serverPos, bounce: fb2, to: fb2, res: 'df', pos: pos0, v: r2(fv2), info: shotInfo(server, ['second_serve', 'serve_place'], sq2 * 0.45), mv: move(letGo(serverPos, fb2, flightTime(serverPos, fb2, null, fv2, 'serve2'), receiver.team, ri, fv2, retD(fv2)), 0) });
        return this.finish(shots, receiver.team, 'df', server, ctx);
      }
      type = 'serve2';
    }
    // 서브 코스: 와이드 / 센터 / 몸쪽. 서브 코스가 좋을수록 선에 가깝고 덜 흔들린다(공 먼저, 2026-11-20. 예전에는 중계용 난수로 골랐고 에이스는 확률이었다)
    const isFirst = type === 'serve', sk = rng(), skind = sk < 0.4 ? 'wide' : sk < 0.75 ? 'T' : 'body';
    let svcBounce = this.serveSpot(server, cx, zs, skind);
    {
      const sg = 0.45 * (1.15 - s.serve_place / 150) * (isFirst ? 1 : 0.8), g1 = gauss(rng), g2 = gauss(rng);
      svcBounce = [-cx * clamp((svcBounce[0] + g1 * sg) * -cx, 0.2, 3.95), -zs * clamp((svcBounce[1] + g2 * sg) * -zs, 3.6, 6.25)];
    }
    const sv = this.serveV(server, isFirst);
    // 받는 사람이 서브를 읽는 데 걸리는 시간: 강서브 대처가 낮을수록 늦다. 세컨은 느려 덜 늦다
    let sLate = (isFirst ? TUNE.srv.late1 : TUNE.srv.late2) + (55 - r.c_power) * TUNE.srv.k - this.gmod(receiver) * 0.4;
    // 와이드·센터 서브는 코스를 미리 짐작한다. 잘못 짐작하면 반대로 쏠렸다가 늦게 출발한다(에이스는 대개 이렇게 나온다)
    if (skind !== 'body' && rng() > clamp(TUNE.srv.read + (r.c_power - (isFirst ? 0.6 * s.first_serve + 0.4 * s.serve_place : s.second_serve)) / 150, 0.3, 0.9)) sLate += TUNE.srv.wrong * (isFirst ? 1 : 0.6);
    const spath = this.pathOf(serverPos, svcBounce, sv, type);
    const Is = this.intercept(ri, spath, sLate, body, at, { postOnly: true });
    // 닿는 서브라도 라인 근처에 떨어지면 아웃인 줄 알고 보낼 수 있다(이 빠르기의 서브는 받는 사람이 거의 늘 닿는다. 동호인 에이스는 대개 이렇다)
    let misread = false;
    if (Is.ok) {
      const ax = Math.abs(svcBounce[0]), az = Math.abs(svcBounce[1]), gap = Math.min(Math.abs(ax - 4.115), Math.abs(az - 6.4), ax);
      const judge = r.shot_sel * 0.5 + r.focus * 0.3 + r.c_power * 0.2;
      const pm = clamp(TUNE.srv.mis - judge * TUNE.srv.misK, 0.04, 0.45) * clamp(1 - gap / TUNE.srv.misGap, 0, 1) * (isFirst ? 1 : 0.5) * (sv / 18);
      misread = rng() < pm;
    }
    if (!Is.ok || misread) {
      // 에이스: 받는 사람이 닿지 못했거나(손을 뻗다 놓친다) 아웃인 줄 알고 보냈다(받을 자리에서 준비하다 라켓을 거둔다)
      recCounter(receiver, 'c_power', false);
      server.rec.aces++;
      const B = svcBounce, to = toFence(B, spath.w, 6), ft = flightTime(serverPos, to, B, sv, type);
      let mvA;
      if (misread) mvA = move(letGo(serverPos, B, flightTime(serverPos, B, null, sv, type), receiver.team, ri, sv, retD(sv)), 0);
      else { const plan = []; plan[ri] = missAt(ri, Is.near, ft, sLate); mvA = move(plan, ft); }
      const ids = isFirst ? ['first_serve', 'serve_place', 'power'] : ['second_serve', 'serve_place'];
      shots.push({ h: si, type, from: serverPos, bounce: B, to, res: 'ace', pos: pos0, v: r2(sv), mv: mvA, victim: ri, ...(misread ? { misread: 1 } : {}), info: shotInfo(server, ids, Math.max(90, (isFirst ? sq1 : sq2) * 0.5 + 50)) });
      addCall(this.P, shots[shots.length - 1], server, ids);
      return this.finish(shots, server.team, 'ace', server, ctx);
    }
    if (isFirst) recCounter(receiver, 'c_power', true);
    // 리턴의 부담: 실제로 얼마나 뻗었나와 서브의 질
    D = this.mixD(Is, isFirst ? 22 + (0.6 * s.first_serve + 0.4 * s.serve_place) * 0.45 - r.c_power * 0.18 : 6 + s.second_serve * 0.28 + s.serve_place * 0.1);
    if (sT.choices.formation === 'iform') D += 8 * (server.stats.formation / 60);
    // 서브 앤 발리 / 대시
    const svMove = (sT.choices.shot === 'serve_volley' && rng() < 0.75) || (sT.choices.shot === 'dash' && rng() < 0.3);
    {
      // 공은 바운드 뒤 떴다가 내려올 때 받는다(retD). 닿는 곳 가운데 가장 편한 곳에서
      const C = Is.C, ft = Is.t;
      const kind = skind === 'body' && Is.f < 0.6 ? 'jam' : Is.f >= 0.72 ? 'reach' : 'set';
      if (kind === 'jam') D = clamp(D + TUNE.jamD * 0.5, 0, 95);
      const t0 = body[ri].react + sLate;
      if (svMove) server.pos = 'net';
      const plan = []; plan[ri] = runAt(ri, C, ft, t0, kind);
      if (svMove) { const [x, z] = this.homeOf(server); plan[si] = { x, z, t0: 0.3, v: body[si].top, k: 'back' }; }
      shots.push({ h: si, type, from: serverPos, bounce: svcBounce, to: C, res: 'in', pos: pos0, v: r2(sv), mv: move(follow(plan, C[0]), ft),
        info: type === 'serve' ? shotInfo(server, ['first_serve', 'serve_place', 'power'], 45 + sq1 * 0.5) : shotInfo(server, ['second_serve', 'serve_place'], 50 + sq2 * 0.4) });
    }
    tire(server);

    let H = receiver, inc = { D, height: 'mid', type, from: server, forceBh: false };
    let lastShooter = server;
    for (let k = 0; k < 40; k++) {
      const T = this.teams[H.team];
      // 포·백핸드: 공이 몸 어느 쪽으로 오는지로 정한다(사용자 2026-11-19: 저리로 오면 당연히 백핸드 치지 않겠어?). 예전에는 58% 확률로 포핸드를 골라
      // 백핸드 쪽 공도 포핸드로 쳤다. 시간이 남고(0.25초 넘게 먼저 닿고) 포핸드가 백핸드보다 6 넘게 나으면 돌아서 포핸드로 치기도 한다(동호인은 백핸드를 피한다)
      {
        const hw = this.P.indexOf(H), pw = shots[shots.length - 1], rf = runFrom[hw];
        inc.wing = null;
        if (pw && pw.to && rf) {
          const lat = (pw.to[0] - rf[0]) * (H.team === 0 ? 1 : -1), mg = pw.mv?.[hw]?.m ?? 0, gap = H.stats.fh_drive - H.stats.bh_drive;
          inc.wing = lat >= -0.3 ? 'fh' : 'bh';
          if (inc.wing === 'bh' && H.pos !== 'net' && !inc.smashable && lat > -1.6 && mg >= 0.25 && gap >= 6 && rng() < clamp(0.25 + gap / 40, 0.25, 0.7)) inc.wing = 'fh';
        }
      }
      const bhNow = inc.wing ? inc.wing === 'bh' : inc.forceBh;
      const choice = this.chooseShot(H, inc);
      const { type: st, dir } = choice;
      const skillKey = SKILL_OF[st], skillLv = (skillKey && H.skills?.[skillKey]) || 0;
      const S = this.statFor(H, st, inc);
      const Sc = st === 'return' || st === 'chip_return' ? S : H.stats[COURSE_STAT[dir] || 'cross'];
      const combo = (T.combo || 0) * 0.08;
      let Q = TUNE.statW * S + (1 - TUNE.statW) * Sc + gauss(rng) * TUNE.noise + M(H) * 100 + combo - fat(H) * 0.8 - inc.D * TUNE.qD;
      Q += tempoOf(T).q + planVal(T, 'q') + TUNE.skill.q[skillLv];
      // 뒤지고 있어도 끈질기게 버티는 힘
      if ((T.choices.plan === 'twoback' || T.choices.plan === 'lob') && this.games[1 - H.team] - this.games[H.team] >= 2) Q += Math.max(0, (H.stats.resilience + H.stats.stamina) / 2 - 25) * TUNE.gritK;
      if ((st === 'fh_slice' || st === 'bh_slice') && T.choices.shot === 'deep_slice') Q += 5;
      if (inc.poach) Q += TUNE.poachQ + (H.stats.poach - 40) * 0.2;   // 포치 발리: 미리 읽고 가로챈 공
      let err = (TUNE.errBase + (inc.D - S) * TUNE.errSlope + (RISK[st] || 0) * TUNE.skill.risk[skillLv] + (DIR_RISK[dir] || 0) - H.stats.focus / 1300 + fat(H) / 350 + (this.mentalState(H) === 'tilt' ? 0.06 : 0) + (T.choices.plan === 'power' && k >= 3 ? (k - 2) * TUNE.rallyErr : 0)) * tempoOf(T).err * planVal(T, 'err');
      if (inc.back) { Q -= TUNE.back.q * inc.back; err += TUNE.back.err * inc.back; }
      // 치는 순간까지 움직이고 있었나(받으러 갈 때 엔진이 정한 종류와 여유: 쭉 뻗어 받음, 몸쪽 공, 공보다 먼저 닿은 시간)
      const mvH = shots[shots.length - 1]?.mv?.[this.P.indexOf(H)];
      const rush = !mvH ? 0 : mvH.k === 'reach' ? 1 : mvH.k === 'jam' ? 0.5 : mvH.m === undefined ? 0 : mvH.m < 0.05 ? 1 : mvH.m < 0.15 ? 0.5 : 0;
      const hardD = Math.max(0, inc.D - 30), techK = clamp((75 - S) / 40, 0.1, 1.3);
      err += TUNE.hard * hardD + TUNE.rush * rush + (TUNE.tech[st] || 0) * techK * TUNE.skill.risk[skillLv];
      // 빗맞음: 능력치가 낮을수록, 움직이며 칠수록, 어려운 공일수록
      const mishit = rng() < TUNE.mis.base * clamp((75 - S) / 40, 0.15, 1.4) * (1 + rush + hardD / 40);
      const misErr = mishit && rng() < TUNE.mis.err;
      if (mishit && !misErr) Q -= TUNE.mis.q;
      err = clamp(err, 0.02, 0.75);
      if (misErr) err = 1;
      if (inc.clash) { Q -= TUNE.clash.q; if (!misErr) err = Math.min(0.75, err + TUNE.clash.err); }
      const info = shotInfo(H, shotUse(st, dir, bhNow, pressure), accOfQ(Q));
      if (mishit) info.mishit = 1;
      { const stn = stanceOf(st, shots[shots.length - 1]?.mv?.[this.P.indexOf(H)], inc.D); if (stn) info.stance = inc.back > 0.5 ? 'run' : stn; }   // 뒤로 밀리며 치면 달리면서
      tire(H);
      const posNow = this.snapshot();
      const hi = this.P.indexOf(H);
      const prev = shots[shots.length - 1];
      const from = prev && prev.to ? prev.to : posNow[hi];
      posNow[hi] = from;
      // 중계용: 친 사람은 공 옆에 서 있다
      at[hi] = standOf(from, st, H.team, runFrom[hi], prev?.mv?.[hi]?.far || 0, inc.wing);
      // 받은 쪽 대처 결과 기록 (직전 샷이 대처 짝이 있는 샷이었다면)
      if (inc.counter) recCounter(H, inc.counter, rng() >= err);
      if (rng() < err) {
        const isNet = st === 'dropshot' || st === 'drop_volley' || st === 'low_volley' || rng() < 0.45;
        const zs2 = this.zSign(H.team);
        // 아웃은 노린 코스 쪽으로 벗어난다 (난수 순서는 예전과 같다: gauss 다음 rng)
        const gg = isNet ? 0 : gauss(rng), rr = isNet ? 0 : rng();
        const to = isNet ? [from[0] * 0.6, zs2 * 0.3] : this.missSpot(H, st, dir, from, gg, rr);
        // 나가는 공을 쳐 버리는 판단 실수(사용자 경험: 동호인은 나가는 공을 꽤 친다).
        // 그 공을 받을 사람이 판단한다. 샷 선택·집중력이 좋을수록, 많이 나갈수록 잘 보낸다.
        // 승패는 엔진 값으로만 정하고(누가 받는지, 얼마나 나갔는지), 화면의 위치는 쓰지 않는다
        let judged = -1;
        if (!isNet && !LOBS.has(st)) {
          // 판단하는 사람: 공이 지나가는 길에 가장 가까이 선 사람(사용자 2026-11-19: 우리 파트너가 칠 곳인데 반대쪽 사람이 가로질러 왔다.
          // 예전에는 엔진의 크로스 상대 표시(side)로 골라 화면에서 반대쪽에 선 사람이 판단하러 오기도 했다)
          const os = this.opps(H), od = o => segDist(at[this.P.indexOf(o)], from, to), J = od(os[0]) <= od(os[1]) ? os[0] : os[1];
          const j0 = this.P.indexOf(J);
          const wide = dir === 'dtl' || dir === 'angle' || (dir === 'cross' && rr < 0.35);
          const by = wide ? 0.21 + Math.abs(gg) * 0.6 : 0.41 + rr * 1.4;   // 얼마나 나갔나(m), missSpot과 같은 값
          const judge = J.stats.shot_sel * 0.7 + J.stats.focus * 0.3;
          const pm = clamp(0.2 - judge * 0.0015, 0.04, 0.16) * clamp(1.5 - by * 0.6, 0.4, 1.4);
          if (rng() < pm) {
            // 그 사람 곁(공이 지나는 직선 위 가장 가까운 곳)에서 떨어지기 전에 받아 친다. 어려운 공을 받은 셈이다
            J.rec.misjudge = (J.rec.misjudge || 0) + 1; rec(H, st, 'n');
            const L = Math.hypot(to[0] - from[0], to[1] - from[1]), w = unit(from, to);
            const s0 = clamp((at[j0][0] - from[0]) * w[0] + (at[j0][1] - from[1]) * w[1], Math.min(4, L * 0.6), L - 0.6);
            const C = [from[0] + w[0] * s0, from[1] + w[1] * s0];
            const ev = this.ballV(H, st, Q), ft = flightTime(from, C, null, ev, st);
            const plan = [];
            plan[j0] = runAt(j0, C, ft, body[j0].react, 'set');
            const [hx, hz] = this.homeOf(H, C[0], lvl[H.team]);
            plan[hi] = { x: hx, z: hz, t0: 0.22, v: body[hi].recov, k: 'back' };
            shots.push({ h: hi, type: st, dir, from, bounce: null, to: C, res: 'in', outBall: true, pos: posNow, v: r2(ev), info: { ...info, acc: Math.min(info.acc, 45) }, mv: move(follow(plan, C[0]), ft), wing: inc.wing || undefined });
            lastByTeam[H.team] = H; lastShooter = H;
            inc = { D: clamp(48 + (Q - 40) * 0.35, 35, 75), height: 'mid', type: st, from: H, counter: null };
            H = J; continue;
          }
          judged = j0;
          // 조금 나간 공(1m 안)을 잘 보냈을 때만 판단이 돋보인다
          if (by >= 0.9) judged = -2 - j0;
        }
        H.rec.errors++; rec(H, st, 'err');
        if (this.gameNo < 5) H.rec.errEarly++; else H.rec.errLate++;
        // 상대는 받을 것처럼 가다가 멈춘다. 걸리는 공은 가려던 쪽으로, 나가는 공은 떨어지는 곳 쪽으로
        const ev = this.ballV(H, st, Q), aim = isNet ? [clamp(-from[0] * 0.6, -4.5, 4.5), -zs2 * 8] : to;
        // 아무도 멈춰 서지 않는다: 친 사람은 제자리로 돌아가고, 나머지도 공 쪽으로 옮긴다
        const lp = letGo(from, aim, flightTime(from, aim, null, ev, st) * (isNet ? 0.6 : 1), 1 - H.team, judged >= 0 ? judged : judged <= -2 ? -2 - judged : -1, ev, isNet ? 0 : 2.0 + ev * 0.06);
        { const [hx, hz] = this.homeOf(H, aim[0], lvl[H.team]); lp[hi] = { x: hx, z: hz, t0: 0.22, v: body[hi].recov, k: 'back' }; }
        shots.push({ h: hi, type: st, dir, from, to, bounce: isNet ? null : to, res: isNet ? 'net' : 'out', pos: posNow, v: r2(ev), info: { ...info, acc: Math.min(info.acc, 45) }, mv: move(follow(lp, aim[0]), 0), ...(judged >= 0 ? { judge: judged } : {}), wing: inc.wing || undefined });
        if (inc.D >= 45 && inc.from && inc.from.team !== H.team) addCall(this.P, shots[shots.length - 1], inc.from, shotStats(inc.type, prev?.dir), true);
        // 잘 보낸 공: 그 사람의 판단(샷 선택)이 C 이상이면 머리 위에 뜬다
        else if (judged >= 0 && lp.who === judged) addCall(this.P, shots[shots.length - 1], this.P[judged], ['shot_sel'], true);
        H.gauge -= 6 * (1 - H.stats.composure / 160);
        const m = this.mate(H); m.gauge -= 2 * (1 - m.stats.composure / 150);
        return this.finish(shots, 1 - H.team, 'err', H, ctx);
      }
      rec(H, st, 'n');
      if (prev && prev.mv?.[hi]?.k === 'reach') addCall(this.P, prev, H, ['first_step', 'speed', 'flex'], true);
      else if (prev && inc.counter && inc.D >= 40) addCall(this.P, prev, H, [inc.counter], true);
      if (skillLv) H.rec.skillUse[skillKey] = (H.rec.skillUse[skillKey] || 0) + 1;
      // 받는 쪽(공 먼저, 사용자 2026-11-20): 친 사람이 노린 사람(R)과 코스로 공이 떨어질 곳이 정해지고, 상대 두 사람이 각자 닿는지 계산한다
      let R = this.pickReceiver(H, st, dir);
      const Rteam = this.teams[R.team];
      const counter = COUNTER_OF[st] || (dir === 'angle' ? 'c_angle' : dir === 'body' ? 'c_body' : null);
      const lob = LOBS.has(st);
      const v = this.ballV(H, st, Q);
      const fbN = T.choices.attack === 'back' && rng() < 0.6;   // 백핸드 공략: 받는 사람의 백핸드 쪽으로 보낸다
      const mulA = (TUNE.aim.tempo[T.choices.tempo] ?? 1) * TUNE.aim.skill[skillLv] * (inc.poach ? TUNE.aim.poach : 1);
      // 늦게 출발하는 만큼: 그 공의 대처(대처 짝이 없으면 포지셔닝·샷 선택으로 읽기), 마음 상태, 예측 수비
      const readOf = P => (counter ? P.stats[counter] : (P.stats.positioning + P.stats.shot_sel) / 2);
      const lateOf = (P, noRead = false) => clamp((TUNE.read.mid - readOf(P)) * (counter ? TUNE.read.kc : TUNE.read.k), TUNE.read.lo, TUNE.read.hi) - this.gmod(P) * 0.4 - (noRead ? 0 : (P.skills?.read || 0) * TUNE.read.skill);
      // 포치 발리는 빈 곳을 골라 친다: 그곳에 떨어지면 두 사람이 얼마나 닿기 어려운가(닿으면 0 아래, 못 닿으면 모자란 거리)
      const openOf = !inc.poach ? null : B => Math.min(...this.opps(H).map(o => { const I = this.intercept(this.P.indexOf(o), this.pathOf(from, B, v, st), lateOf(o), body, at); return I.ok ? I.f - 1 : I.def; }));
      const path = this.pathOf(from, this.aimAt(H, st, dir, Q, from, R, at, fbN, mulA, openOf), v, st);
      // 포치: 전위가 상대가 치기 전에 미리 가로질러 나간다. 공 길에 닿을 때만 가로챈다(포치 발리가 끝내는지는 다음 샷에서 공 먼저로 정해진다)
      const isGround = !['topspin_lob', 'def_lob', 'moon_volley', 'smash', 'dropshot', 'drop_volley'].includes(st);
      const Rmate = this.mate(R);
      if (isGround && R.pos === 'base' && Rmate.pos === 'net' && (dir === 'cross' || dir === 'center' || dir === 'deep') && H.pos === 'base') {
        const pa = clamp(0.06 + Rmate.stats.poach / 320 + (Rteam.choices.formation === 'up' ? 0.04 : 0) + (Rteam.choices.tempo === 'attack' ? 0.03 : 0) - H.stats.c_poach / 450, 0.02, 0.35);
        if (rng() < pa) {
          const ni = this.P.indexOf(Rmate);
          const Ipo = this.intercept(ni, path, lateOf(Rmate) - TUNE.poachEarly, body, at, { preOnly: true, poach: true });
          if (Ipo.ok) {
            Rmate.rec.poachTry++;
            recCounter(H, 'c_poach', true);
            const contact = Ipo.C, ft1 = Ipo.t;
            const pvt = (contact[0] - at[ni][0]) * (R.team === 0 ? 1 : -1) >= -0.3 ? 'fh_volley' : 'bh_volley';   // 가로질러 나가는 쪽이 백핸드면 백핸드 발리
            const plan1 = [];
            plan1[ni] = { x: contact[0], z: contact[1], t0: 0.05, v: Math.max(body[ni].top, Math.hypot(contact[0] - at[ni][0], contact[1] - at[ni][1]) / Math.max(0.2, ft1 - 0.12)), k: 'poach' };
            pushLvl(R.team, 1);
            shots.push({ h: hi, type: st, dir, from, to: contact, bounce: null, res: 'in', pos: posNow, v: r2(v), info, mv: move(follow(plan1, contact[0]), ft1), wing: inc.wing || undefined });
            lastByTeam[H.team] = H; lastShooter = H;
            inc = { D: clamp(Q - Rmate.stats.poach * 0.3, 0, 90), height: 'mid', type: st, from: H, counter: null, poach: pvt };
            H = Rmate; continue;
          }
        }
      }
      // 받은 공의 무게(부담 D의 공의 질 몫): 그 공의 대처, 발
      const DefOf = P => {
        let d = counter ? P.stats[counter] * 0.7 + (P.stats.first_step + P.stats.speed) / 2 * 0.3 : (P.stats.first_step + P.stats.speed + P.stats.positioning) / 3;
        if (st === 'smash') d *= 0.72;
        if (dir === 'dtl' && P.pos === 'net') d -= 8;
        d += this.gmod(P) * 50 + TUNE.skill.readDef[P.skills?.read || 0];
        if (lob && P.pos === 'net') d = d * 0.75 + this.mate(P).stats.cover * 0.25;
        return d;
      };
      // 두 사람이 각자 이 공에 닿나
      const ids = this.opps(H).map(o => this.P.indexOf(o));
      const Ia = ids.map(j => this.intercept(j, path, lateOf(this.P[j]), body, at));
      const Iof = j => Ia[ids.indexOf(j)];
      if (!Ia[0].ok && !Ia[1].ok) {
        // 위너: 아무도 닿지 못했다. 닿을 뻔한 사람은 공 쪽으로 뛰다 몸을 던진다
        const pz = !!inc.poach;
        H.rec.winners++; rec(H, st, 'win');
        if (pz) H.rec.poachWin++;
        this.assist(H, lastByTeam);
        H.gauge += pz ? 5 : 4;
        const land = path.B, out = toFence(land, path.w, 7), ft = flightTime(from, out, land, v, st);
        const plan = []; ids.forEach((j, k) => { plan[j] = missAt(j, Ia[k].near, ft, lateOf(this.P[j])); });
        const vi = ids[Ia[0].def <= Ia[1].def ? 0 : 1];
        pushLvl(H.team, 1);
        shots.push({ h: hi, type: st, dir, from, bounce: land, to: out, res: pz ? 'poach' : 'win', pos: posNow, victim: vi, info: { ...info, acc: Math.max(info.acc, 88) }, skill: skillLv ? skillKey : undefined, v: r2(v), mv: move(follow(plan, land[0]), ft), wing: inc.wing || undefined });
        addCall(this.P, shots[shots.length - 1], H, pz ? ['poach', st] : shotStats(st, dir));
        if (counter) recCounter(this.P[vi], counter, false);
        return this.finish(shots, H.team, pz ? 'poach' : 'win', H, ctx);
      }
      // 누가 받나: 두 사람 다 닿으면 각자 판단한다(사용자 2026-11-19: 각자 주체성을 가지고. 불편하면 파트너에게 맡기고, 서로 칠 거라 생각해 둘 다 안 치거나 둘 다 치기도).
      // 각자 '얼마나 여유 있게 닿나 + 포핸드 쪽이면 더, 백핸드 쪽이면(백핸드가 약할수록) 덜 + 앞에서 발리할 수 있는 공은 전위가, 넘어간 로브는 뒤의 사람이'를 따지고,
      // 상대의 판단을 짐작하는 데 각자 흔들림이 있다(파트너 소통·호흡이 좋을수록 작다). 둘 다 가거나 둘 다 미루면 '내 거!'로 정리되기도 하고(소통이 좋을수록),
      // 안 되면 둘 다 가서 엉켜 약하게 치거나(TUNE.clash) 둘 다 미뤄 공이 지나간다(실점). 한 사람만 닿으면 그 사람이 받는다
      let Ri = this.P.indexOf(R), claim = null, clash = -1;
      if (Ia[0].ok && Ia[1].ok) {
        const Mt = this.mate(R), Mi = this.P.indexOf(Mt), IR = Iof(Ri), IM = Iof(Mi);
        const cl = (P, j, Ix) => {
          const lat = (Ix.C[0] - at[j][0]) * (P.team === 0 ? 1 : -1);
          let c = 1 - Ix.f;
          c += lat >= -0.3 ? 0.22 : -0.22 * clamp(0.6 + (P.stats.fh_drive - P.stats.bh_drive) / 20, 0.2, 1.4);
          if (Ix.air && !lob) c += 0.35;   // 앞에서 발리할 수 있는 공은 전위가
          if (Ix.air && lob) c += 0.3;     // 떨어지기 전에 스매시할 수 있으면 그 사람이
          if (P.pos === 'base' && lob && !Ix.air) c += 0.4;   // 머리 위로 넘어간 로브는 뒤의 사람이
          return c;
        };
        const cR = cl(R, Ri, IR), cM = cl(Mt, Mi, IM);
        const sync = clamp((R.stats.comm + Mt.stats.comm) / 2 + (Rteam.combo || 0) * 0.2, 0, 100);
        const sg = 0.06 + 0.5 * (1 - sync / 100);   // 소통 35 → 0.39, 65 → 0.24
        const goR = cR - cM + gauss(rng) * sg > -0.1, goM = cM - cR + gauss(rng) * sg > -0.1;
        const amb = Math.abs(cR - cM) < 0.3;
        let who = goR && !goM ? 'R' : goM && !goR ? 'M' : null, kind = who === 'M' ? (amb ? 'call' : 'pass') : who === 'R' && amb ? 'call' : null;
        if (!who) {
          if (rng() < 0.2 + sync / 120) { who = cR >= cM ? 'R' : 'M'; kind = 'call'; }   // 한 사람이 '내 거!'
          else if (goR && goM) { who = cR >= cM ? 'R' : 'M'; kind = 'both'; }
          else kind = 'none';
        }
        if (kind === 'none') {
          // 둘 다 미뤘다: 공이 둘 사이로 지나간다
          H.rec.winners++; rec(H, st, 'win');
          this.assist(H, lastByTeam);
          const land = path.B, out = toFence(land, path.w, 5.5), ft2 = flightTime(from, out, land, v, st);
          const plan = [];
          for (const [j, Ix] of [[Ri, IR], [Mi, IM]]) plan[j] = { ...missAt(j, Ix.C, ft2), k: 'confuse' };
          shots.push({ h: hi, type: st, dir, from, bounce: land, to: out, res: 'center', pos: posNow, v: r2(v), mv: move(follow(plan, land[0]), ft2), info, wing: inc.wing || undefined, claim: { kind: 'none', a: Ri, b: Mi } });
          return this.finish(shots, H.team, 'center', H, ctx);
        }
        const other = who === 'M' ? Ri : Mi;
        if (who === 'M') Ri = Mi;
        if (kind) claim = { kind, by: Ri, other };
        if (kind === 'both') clash = other;
      } else Ri = ids[Ia[0].ok ? 0 : 1];
      R = this.P[Ri];
      const Ip = Iof(Ri), contact = Ip.C, bounce = Ip.air ? null : path.B, ft = Ip.t, late = lateOf(R);
      const air = lob && Ip.air;   // 떨어지기 전에 스매시
      const kindR = dir === 'body' && !lob && Ip.f < 0.55 ? 'jam' : Ip.f >= 0.72 ? 'reach' : 'set';
      // 예측 수비: 그 기술이 없었다면 닿지 못했을 공을 받아 냈다
      const saved = !!R.skills?.read && !this.intercept(Ri, path, lateOf(R, true), body, at).ok;
      if (saved) R.rec.skillUse.read = (R.rec.skillUse.read || 0) + 1;
      const nextD = clamp(this.mixD(Ip, clamp(Q - DefOf(R) * TUNE.dCarry + 10, 0, 95)) + (kindR === 'jam' ? TUNE.jamD : 0), 0, 95);
      // 뒤로 밀리는 정도: 서 있던 곳보다 얼마나 뒤에서 받나(발이 좋을수록 덜 밀린다: 40 → 1배, 60 → 0.8배, 80 → 0.6배)
      const fw = clamp(1.4 - (R.stats.first_step + R.stats.speed + R.stats.positioning) / 300, 0.5, 1.2);
      const backN = air ? 0 : fw * clamp((Math.abs(contact[1]) - Math.abs(at[Ri][1]) - TUNE.back.from) / TUNE.back.span, 0, 1);
      if (!Ip.air && R.pos === 'net' && Math.abs(contact[1]) > 5.5) R.pos = 'base';   // 넘어간 로브·스매시·깊은 공은 물러나 받는다
      const shot = { h: hi, type: st, dir, from, bounce, to: contact, res: 'in', pos: posNow, info, skill: saved ? 'read' : undefined, skillBy: saved ? Ri : undefined, v: r2(v), wing: inc.wing || undefined, ...(claim ? { claim } : {}) };
      shots.push(shot);
      // 이동
      const wasNet = H.pos === 'net';
      if (st === 'chip_return' || (T.choices.shot === 'dash' && H.pos === 'base' && !lob && rng() < 0.45)) H.pos = 'net';
      if (st === 'topspin_lob' && T.choices.shot === 'lob_net') { H.pos = 'net'; this.mate(H).pos = 'net'; }
      {
        pushLvl(H.team, nextD > 45 ? 1 : nextD < 15 ? -0.6 : 0);
        const plan = [];
        plan[Ri] = runAt(Ri, contact, ft, Math.max(0.02, body[Ri].react + late), kindR);
        // 둘 다 가다 엉켰다: 다른 사람도 공 쪽으로 뛰다가 바로 앞에서 멈춘다
        if (clash >= 0) {
          const u = unit(contact, at[clash]), d = Math.hypot(contact[0] - at[clash][0], contact[1] - at[clash][1]), go = Math.max(0, d - 0.95);
          const bd = bodyDir(body[clash], backOf(at[clash], contact));
          plan[clash] = { x: contact[0] + u[0] * Math.min(d, 0.95), z: contact[1] + u[1] * Math.min(d, 0.95), t0: bd.react, v: Math.max(1.6, Math.min(bd.top, go / Math.max(0.2, ft - bd.react))), k: 'clash' };
        }
        // 친 사람이 제자리로: 네트로 나가는 사람은 전속력, 그 밖에는 친 자리에서 제자리 쪽으로 60%만, 조금 늦고 느리게
        // (2026-11-16 개나리 경기·동호인 자료 비교: 동호인은 친 자리 근처에 머무는 일이 많고 "발이 늦어 자리가 비어 보인다")
        let [hx, hz] = this.homeOf(H, contact[0], lvl[H.team]);
        const rush2Net = H.pos === 'net' && !wasNet;
        if (!rush2Net) { hx = from[0] + (hx - from[0]) * 0.6; hz = from[1] + (hz - from[1]) * 0.6; }
        plan[hi] = { x: hx, z: hz, t0: rush2Net ? 0.22 : 0.35, v: rush2Net ? body[hi].top : body[hi].recov * 0.85, k: 'back' };
        shot.mv = move(follow(plan, contact[0]), ft);
      }
      lastByTeam[H.team] = H; lastShooter = H;
      inc = {
        D: nextD, height: HEIGHT[st] || 'mid', type: st, from: H, counter, smashable: air, back: backN,
        forceBh: fbN, clash: clash >= 0,
      };
      H = R;
    }
    // 안전장치
    return this.finish(shots, rng() < 0.5 ? 0 : 1, 'err', H, ctx);
  }

  assist(H, lastByTeam) {
    const prev = lastByTeam[H.team];
    if (prev && prev !== H) prev.rec.assists++;
  }

  finish(shots, winner, endType, by, ctx) {
    {
      const last = shots[shots.length - 1], ws = this.P.filter(p => p.team === winner);
      const best = ids => ws.reduce((a, b) => (Math.max(...ids.map(i => b.stats[i])) > Math.max(...ids.map(i => a.stats[i])) ? b : a));
      if (ctx.big) addCall(this.P, last, best(['clutch', 'composure']), ['clutch', 'composure'], true);
      else if (shots.length >= 10) addCall(this.P, last, best(['stamina', 'focus']), ['stamina', 'focus'], true);
      // 한 포인트에 너무 많이 뜨지 않게: 끝을 가른 것은 두고, 랠리 중 것은 등급이 가장 높은 하나만(같으면 나중 것)
      const G = { S: 6, A: 5, B: 4, C: 3 };
      let keep = null;
      shots.slice(0, -1).forEach(sh => (sh.call || []).forEach(c => { if (!keep || G[c.g] >= G[keep.c.g]) keep = { sh, c }; }));
      shots.slice(0, -1).forEach(sh => { if (sh.call) { sh.call = sh.call.filter(c => keep && c === keep.c); if (!sh.call.length) delete sh.call; } });
    }
    for (const p of this.P) {
      p.gauge += p.team === winner ? 2 : -1.5;
      const base = 50 + ((p.conf ?? 50) - 50) / 3;
      p.gauge += (base - p.gauge) * 0.04 * (0.5 + p.stats.resilience / 100);
      p.gauge = clamp(p.gauge, 0, 100);
      p.F += 0.05;
    }
    const byIdx = this.P.indexOf(by);
    const text = this.describe(shots, winner, endType, by);
    return { shots, winner, endType, by: byIdx, label: ctx.label, big: ctx.big, skill: shots.find(x => x.skill)?.skill, text, gauges: this.P.map(p => Math.round(p.gauge)), states: this.P.map(p => this.mentalState(p)) };
  }

  describe(shots, winner, endType, by) {
    const last = shots[shots.length - 1];
    const nm = by.name;
    if (endType === 'ace') return `${nm} 서브 에이스!`;
    if (endType === 'df') return `${nm} 더블폴트…`;
    if (endType === 'center') return `${nm}의 ${SHOT_NAME[last.type] || ''} — 센터 혼선!`;
    if (endType === 'poach') return `${nm} 포치 성공!`;
    if (endType === 'win') {
      // 크로스와 다운더라인은 화면에서 공이 간 쪽으로 부른다(서브하는 쪽은 포인트마다 좌우가 바뀐다)
      let dn = DIR_NAME[last.dir];
      const B = last.bounce || last.to;
      if ((last.dir === 'cross' || last.dir === 'dtl') && Math.abs(last.from[0]) > 1 && Math.abs(B[0]) > 1) dn = last.from[0] * B[0] > 0 ? DIR_NAME.dtl : DIR_NAME.cross;
      return `${nm}의 ${dn ? dn + ' ' : ''}${SHOT_NAME[last.type] || ''} 위너!`;
    }
    return `${nm} ${SHOT_NAME[last.type] || ''} ${last.res === 'net' ? '네트' : '아웃'}`;
  }

  statFor(H, st, inc) {
    const s = H.stats;
    if (st === 'return') return 0.6 * s.return + 0.4 * ((inc.wing ? inc.wing === 'bh' : inc.forceBh) ? s.bh_drive : s.fh_drive);
    if (st === 'passing') return 0.6 * s.passing + 0.4 * s.fh_drive;
    return s[st] ?? 40;
  }

  pickReceiver(H, st, dir) {
    const os = this.opps(H);
    const net = os.find(o => o.pos === 'net');
    // 크로스 상대: 화면에서 대각선에 선 사람(서는 쪽 vs가 같으면 대각선이다. 예전에는 엔진의 side로 골라 절반쯤은 화면에서 정면에 선 사람이었다)
    const crossT = os.find(o => (o.vs ?? o.side) === (H.vs ?? H.side)) || os[0];
    const other = os.find(o => o !== crossT);
    if (st === 'topspin_lob' || st === 'def_lob' || st === 'moon_volley') return net || crossT;
    // 스매시는 뒤에 선 사람이 바운드 뒤에 받는다(사용자 2026-11-19: 스매시를 백발리·문발리로 받는다. 전위가 받을 공은 거의 위너다)
    if (st === 'smash' && net) { const back = os.find(o => o.pos === 'base'); if (back) return back; }
    if (dir === 'body') return net || crossT;
    // 네트에서 깊게 치는 발리는 뒤에 선 사람의 발밑으로(뒤로 묶어 둔다)
    if (dir === 'deep' && H.pos === 'net') { const back = os.find(o => o.pos === 'base'); if (back) return back; }
    if (dir === 'dtl') return other;
    if (dir === 'center') return this.rng() < 0.5 ? os[0] : os[1];
    // 대각선 상대가 전위이고 다른 한 명이 뒤에 있으면 크로스 공은 대개 뒤의 사람에게 간다(전위에게 곧장 치지 않는다, 2026-11-16 개나리 경기 비교)
    if (H.pos === 'base' && crossT.pos === 'net' && other.pos === 'base' && this.rng() < 0.8) return other;
    return crossT;
  }

  chooseShot(H, inc) {
    const rng = this.rng, T = this.teams[H.team], ch = T.choices, s = H.stats;
    // 포치로 가로챈 공: 그 발리로 빈 곳(앵글·가운데)이나 발밑으로
    if (inc.poach) { const r = rng(); return { type: inc.poach, dir: r < 0.45 ? 'angle' : r < 0.8 ? 'center' : 'body' }; }
    const os = this.opps(H);
    const oppNet = os.some(o => o.pos === 'net');
    const bothBase = os.every(o => o.pos === 'base');
    const w = {};
    const add = (k, v) => { if (v > 0) w[k] = (w[k] || 0) + v; };
    const fhR = rng(), fh = inc.wing ? inc.wing === 'fh' : fhR < (inc.forceBh ? 0.25 : 0.58);   // 공이 오는 쪽(inc.wing)이 있으면 그것
    const isReturn = inc.type === 'serve' || inc.type === 'serve2';
    if (inc.smashable) add('smash', 1);   // 닿는 로브는 스매시(사용자 2026-11-19: 탑스핀 로브를 문발리로 받는다. 예전 8%)
    else if (isReturn) {
      add('return', 0.5); add('chip_return', 0.26); if (oppNet) add('topspin_lob', 0.13); add('def_lob', inc.D > 60 ? 0.14 : 0.04);   // 개나리는 슬라이스·로브 리턴이 흔하다(2026-11-16)
    } else if (inc.type === 'smash') {
      // 스매시를 받았다: 바운드 뒤에 높이 띄워 버티거나(수비 로브) 막아 넘긴다. 발리·문발리로 받지 않는다(사용자 2026-11-19)
      add('def_lob', 0.45); add(fh ? 'fh_slice' : 'bh_slice', 0.3); add(fh ? 'fh_drive' : 'bh_drive', 0.2); add('topspin_lob', oppNet ? 0.05 : 0);
    } else if (H.pos === 'net') {
      // 개나리는 드롭 발리를 거의 안 한다(2026-11-16): 예전 샷의 5.6%
      // 문발리(높이 띄우는 발리)는 상대 전위 머리 위로 넘길 때만. 머리 위로 오는 공(로브)에는 하지 않는다(사용자 2026-11-19)
      if (inc.height === 'high') { add('smash', 0.85); add('drop_volley', 0.03); }
      else if (inc.height === 'low') { add('low_volley', 0.6); add('half_volley', 0.22); add('drop_volley', 0.05); add('moon_volley', oppNet ? 0.06 : 0); }
      else { add(fh ? 'fh_volley' : 'bh_volley', 0.66); add('drop_volley', 0.03); add('moon_volley', oppNet ? 0.1 : 0); add('swing_volley', 0.06); }
    } else {
      if (inc.height === 'high') { add('smash', 0.18); add('def_lob', 0.36); add(fh ? 'fh_drive' : 'bh_drive', 0.4); }
      else if (inc.D > 65) { add('def_lob', 0.35); add(fh ? 'fh_slice' : 'bh_slice', 0.35); add(fh ? 'fh_drive' : 'bh_drive', 0.25); }
      else {
        // 개나리는 로브(전위 머리 위로, 깊게)와 슬라이스(백핸드는 더)가 흔하다(2026-11-16 개나리 경기·동호인 자료 비교)
        add(fh ? 'fh_drive' : 'bh_drive', 0.5); add(fh ? 'fh_slice' : 'bh_slice', fh ? 0.22 : 0.38);
        add('topspin_lob', oppNet ? 0.26 : 0.05); add('def_lob', oppNet ? 0.06 : 0.02); add('dropshot', bothBase ? 0.05 : 0.02);
        add('passing', oppNet ? 0.14 : 0); add('swing_volley', inc.height === 'mid' && inc.D < 35 ? 0.05 : 0);
        add('half_volley', inc.height === 'low' ? 0.05 : 0);
      }
    }
    const mul = (keys, f) => keys.forEach(k => { if (w[k]) w[k] *= f; });
    // 배운 기술은 더 자주 쓴다
    if (H.skills) {
      const u = TUNE.skill.use, sk = H.skills;
      if (sk.drop) mul(['dropshot', 'drop_volley'], u.drop[sk.drop]);
      if (sk.smash) mul(['smash'], u.smash[sk.smash]);
      if (sk.swing) mul(['swing_volley'], u.swing[sk.swing]);
    }
    if (ch.shot === 'moon') mul(['topspin_lob', 'def_lob', 'moon_volley'], 2.5);
    if (ch.shot === 'slice' || ch.shot === 'deep_slice') mul(['fh_slice', 'bh_slice', 'chip_return'], 2.5);
    if (ch.shot === 'power') mul(['fh_drive', 'bh_drive', 'smash', 'swing_volley', 'return', 'passing'], 2);
    if (ch.shot === 'dash') mul(['swing_volley', 'half_volley', 'chip_return'], 2);
    if (ch.shot === 'lob_net') mul(['topspin_lob'], 2.5);
    if (ch.attack === 'weak' && T.found) {
      const hit = Object.keys(w).filter(k => COUNTER_OF[k] === T.found);
      mul(hit, 3);
    }
    // 샷 선택 능력: 기대값이 가장 좋은 샷을 고를 확률
    let type;
    const keys = Object.keys(w);
    if (rng() < s.shot_sel / 150) {
      type = keys.reduce((best, k) => {
        const c = COUNTER_OF[k];
        const def = c ? avg(...os.map(o => o.stats[c])) : avg(...os.map(o => o.stats.positioning));
        const v = this.statFor(H, k, inc) - def + (w[k] * 30);
        return v > best.v ? { k, v } : best;
      }, { k: keys[0], v: -1e9 }).k;
    } else {
      let tot = keys.reduce((a, k) => a + w[k], 0), r = rng() * tot;
      type = keys[keys.length - 1];
      for (const k of keys) { r -= w[k]; if (r <= 0) { type = k; break; } }
    }
    // 방향
    const d = {};
    const lob = type === 'topspin_lob' || type === 'def_lob' || type === 'moon_volley';
    if (lob) d.deep = 1;
    else if (type === 'dropshot' || type === 'drop_volley') d.short = 1;
    else if (H.pos === 'net' || type === 'smash') { if (oppNet) d.body = 0.12; d.center = 0.25; d.angle = 0.3; d.deep = 0.25; }   // 전위끼리 발리 싸움은 드물다(몸쪽 0.3 → 0.12, 2026-11-16)
    else {
      d.cross = 0.55; d.dtl = oppNet ? 0.15 : 0.08; d.center = 0.15; d.angle = 0.1; d.deep = 0.05;
      // 받은 공에 따라 공격 방향이 달라진다(사용자 경험): 쉬운 공은 다운더라인·앵글로 공격하고, 어려운 공은 크로스·깊게 안전하게 넘긴다
      if (inc.D < 25) { d.dtl *= 1.6; d.angle *= 1.5; d.deep *= 0.7; }
      else if (inc.D > 50) { d.dtl *= 0.5; d.angle *= 0.5; d.cross *= 1.1; d.deep *= 2; d.center *= 1.15; }
    }
    if (!lob) {
      if (ch.attack === 'center' && d.center) d.center *= 3;
      if (ch.attack === 'alley' && d.dtl) d.dtl *= 3;
      if (ch.attack === 'angle' && d.angle) d.angle *= 3;
      if (ch.attack === 'weak' && T.found === 'c_angle' && d.angle) d.angle *= 3;
      if (ch.attack === 'weak' && T.found === 'c_body' && d.body) d.body *= 3;
    }
    const dk = Object.keys(d);
    let tot = dk.reduce((a, k) => a + d[k], 0), r = rng() * tot, dir = dk[0];
    for (const k of dk) { r -= d[k]; if (r <= 0) { dir = k; break; } }
    return { type, dir };
  }

  report(teamIdx = 0) {
    return this.P.map(p => ({ name: p.name, team: p.team, ...p.rec, gauge: p.gauge }));
  }
}

// 빠른 전체 시뮬레이션 (밸런스 테스트, 건너뛰기용)
export function quickMatch(sim, onGame) {
  while (!sim.over) { const g = sim.playGame(); if (onGame) onGame(g); }
  return sim.winner;
}

export function aiChoices(sim, ti, rng = Math.random) {
  const t = sim.teams[ti];
  const ps = sim.P.filter(p => p.team === ti);
  const c = { ...t.choices };
  const arch = t.arch;
  if (arch) c.shot = arch.pref;
  if (t.found) c.attack = 'weak'; else if (rng() < 0.3) c.attack = ['back', 'center', 'alley', 'angle'][Math.floor(rng() * 4)];
  const diff = sim.games[ti] - sim.games[1 - ti];
  c.tempo = diff <= -2 ? 'attack' : diff >= 2 ? 'safe' : 'normal';
  const low = ps.find(p => p.gauge < 35);
  c.mental = low ? (rng() < 0.5 ? 'breathe' : 'cheer') : 'keep';
  c.formation = arch?.formation || 'diag';
  // 선수 특징에 따라 구간별 힘이 다르다. 공격형은 초반에 세고 오래가면 흔들린다.
  c.plan = arch?.plan;
  return c;
}
