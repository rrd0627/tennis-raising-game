// 경기 시뮬레이션 엔진 — 포인트 단위 확률 엔진 (기획 문서 7장)
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
// 밸런스 상수 (tools/balance.js 로 조정)
export const TUNE = {
  errBase: 0.15, errSlope: 0.0006, winBase: 0.05, winSlope: 0.0012, noise: 20, qD: 0.25, dCarry: 0.55, statW: 0.72,
  // 작전. err·win: 범실·위너 배율, q: 샷 품질, serve: 퍼스트 서브 성공률. 범실이 위너보다 많아 win을 크게 잡는다
  tempo: { safe: { err: 0.92, win: 0.8, q: -8, serve: 0.03 }, normal: { err: 1, win: 1, q: 0, serve: 0 }, attack: { err: 1.12, win: 1.4, q: 8, serve: -0.03 } },
  // 작전의 구간별 힘. early는 첫 게임, late는 planGames번째 게임부터. q: 샷 품질, err: 범실 배율, tire: 지치는 속도.
  // 강타는 초반에 밀어붙이지만 오래가면 실수가 늘고, 끈질기게 버티는 쪽은 후반에 힘이 난다.
  planGames: 8,
  plan: {
    power: { early: { q: 4, err: 0.92 }, late: { q: 0, err: 1.08 }, tire: 1.15 },
    twoup: { early: { q: 3, err: 1 }, late: { q: 2, err: 1.02 }, tire: 1.05 },
    twoback: { early: { q: -1, err: 0.98 }, late: { q: 3, err: 0.95 }, tire: 0.95 },
    lob: { early: { q: -1, err: 1 }, late: { q: 6, err: 0.93 }, tire: 0.9 },   // 2026-11-11: 닿는 로브를 스매시하게 되어 로브 작전을 올리고 강타를 내림. 2026-11-13: 뒤로 밀리며 치기가 어려워져(TUNE.back) 강타·로브를 조금 내리고 후위를 올림
  },
  rallyErr: 0.004, // 강타가 받혀서 랠리가 길어질수록 느는 범실
  // 뒤로 물러나며 치기(사용자 2026-11-13: 뒤로 가면서 치는 건 굉장히 어렵다). back = 깊은 공에 밀린 정도(0~1), 전위가 머리 위로 넘어간 로브를 쫓아가면 1.
  // 그 사람의 다음 샷 품질이 q만큼 낮아지고 범실이 err만큼 는다
  back: { q: 10, err: 0.07 },
  // 기술. 배운 사람만 쓴다. 안 배우면 기존과 같아서 승률 표는 기술 없는 기준이다. 배열은 수준 0, 1, 2.
  skill: {
    use: { drop: [1, 2, 3], smash: [1, 1.5, 2], swing: [1, 4, 7] }, // 고르는 빈도
    q: [0, 8, 14], win: [1, 1.5, 2], risk: [1, 0.6, 0.35],
    readDef: [0, 4, 8], readSave: [0, 0.25, 0.4], // 예측 수비: 수비값, 위너가 될 공을 받아 낼 확률
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
const WINNER_F = { smash: 2.2, swing_volley: 1.7, passing: 1.4, dropshot: 1.3, drop_volley: 1.3, fh_volley: 1.25, bh_volley: 1.1, topspin_lob: 1.0, fh_drive: 1.0, bh_drive: 0.9, return: 0.8, moon_volley: 0.7, fh_slice: 0.55, bh_slice: 0.55, chip_return: 0.5, low_volley: 0.5, half_volley: 0.35, def_lob: 0.15 };
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

// ── 중계용 위치 (승패와 난수에 영향 없음) ─────────────────────
// 결과는 위에서 확률로 정하고, 공이 떨어질 곳과 사람이 뛸 곳은 그 결과가 능력치로 설명되게 정한다(js/rally.js).
// 받는 사람의 부담(D)이 클수록 공은 그 사람이 닿을 수 있는 거리 끝으로 가고, 위너는 그 밖으로 간다.
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
// 부담 D(0~95) → 닿을 수 있는 거리 중 얼마나 멀리 오는가
const strain = D => clamp(0.15 + D * 0.0136, 0.15, 0.97);   // D 중간값 약 29 → 0.54, 상위 25%(42) → 0.72(쭉 뻗어 받음)
// 로브를 떨어지기 전에 스매시할 수 있는 부담의 끝. 스매시 능력치와 기술만큼 더 깊은 로브도 닿는다
const smashReach = p => 26 + (p.stats.smash - 40) * 0.35 + (p.skills?.smash || 0) * 6;
// 바운드 지점: 받는 곳보다 공 길이 쪽으로 조금 앞. 코트 안에 들어오게 받는 곳까지 같이 당긴다.
// from에서 C로 가는 직선 위, 깊이(z)가 z인 곳
function onLineAtZ(from, C, z) { const u = Math.abs(C[1] - from[1]) > 0.01 ? (z - from[1]) / (C[1] - from[1]) : 1; return [from[0] + (C[0] - from[0]) * u, z]; }
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
function bounceOf(from, C, v, rz, st) {
  const w = unit(from, C), bd = bounceD(v, st);
  let B = [C[0] - w[0] * bd, C[1] - w[1] * bd];
  let dx = 0, dz = 0;
  if (Math.abs(B[0]) > 5.25) dx = (Math.abs(B[0]) - 5.25) * -Math.sign(B[0]);
  if (B[1] * rz > 11.6) dz = -(B[1] * rz - 11.6) * rz;
  if (B[1] * rz < 0.9) dz = (0.9 - B[1] * rz) * rz;
  if (!dx && !dz) return { B, C };
  B = [B[0] + dx, B[1] + dz];
  const w2 = unit(from, B);
  return { B, C: [B[0] + w2[0] * bd, B[1] + w2[1] * bd] };
}

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

  // ── 중계용 위치 ──
  // 복식에서 서는 곳(초안). 둘이 공 쪽(bx)으로 같이 움직인다. press 1 = 우리가 밀어붙임(전위가 다가선다), -1 = 밀림.
  // press는 샷마다 조금씩만 바뀐다. 그래야 전위가 샷마다 앞뒤로 들썩이지 않는다
  homeOf(p, bx = 0, press = 0) {
    const zs = this.zSign(p.team), xs = this.xSign(p);
    if (p.pos === 'net') {
      const lean = 0.3 + Math.max(0, press) * p.stats.poach / 400;
      return [clamp(xs * 2.2 + bx * lean, -4.4, 4.4), zs * (3.6 - Math.max(0, press) * 0.8 + Math.max(0, -press) * 0.6)];
    }
    return [clamp(xs * 2.7 + bx * 0.3, -5, 5), zs * 12.2];   // 후위는 베이스라인 조금 뒤(떨어지는 공을 칠 자리)
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
  // 공이 갈 곳. 받는 사람이 지금 선 곳(P)에서 코스 쪽으로, 공이 오는 동안 닿을 수 있는 거리의 f배.
  // f가 1보다 크면 닿지 못한다(위너). 돌려주는 C는 받는 곳(위너면 공이 지나가는 곳), B는 바운드
  spot(R, st, dir, f, v, from, P, body, late, n1, u2, air = false) {
    const rz = this.zSign(R.team), side = this.xSign(R);
    const lob = LOBS.has(st), short = st === 'dropshot' || st === 'drop_volley';
    if (lob && air) {
      // 닿는 로브: 받는 사람이 뒤로 물러나며(전위는 1~5m) 떨어지기 전에 머리 위에서 친다(스매시)
      const back = R.pos === 'net' ? 1.2 + f * 4.2 : -2.6 + f * 3;
      const C = [clamp(P[0] + n1 * 0.9, -4.8, 4.8), rz * clamp(P[1] * rz + back, 3.2, 12.4)];
      return { C, B: null, T: flightTime(from, C, null, v, st) };
    }
    if (lob) {
      // 로브는 높이 튀어 오른다. 꼭대기를 지나 떨어질 때 치려고 바운드 뒤 4.4m쯤 물러나서 받는다
      let C = [clamp(P[0] + n1 * 1.5 * Math.min(f, 1.4), -5.4, 5.4), rz * (11.4 + Math.min(f, 1.3) * 2.6)], post = 4.4, bz = C[1] * rz - post;
      let B = onLineAtZ(from, C, rz * bz), T = flightTime(from, C, B, v, st);
      // 뒤로 뛰어(돌아서 달려) 닿을 수 있는 만큼만(사용자 2026-11-13: 최고 속도를 낮췄다). 모자라면 바운드 뒤 바로(1.2m까지) 치고, 그래도 모자라면 로브가 짧게 떨어진다
      if (f < 1) for (let it = 0; it < 4; it++) {
        const can = reachOf(bodyDir(body, backOf(P, C)), T, late), d = Math.hypot(C[0] - P[0], C[1] - P[1]);
        if (d <= can + 0.05) break;
        const cut = d - can, p2 = Math.max(1.2, post - cut);
        bz = Math.max(Math.abs(P[1]) + 0.6, bz - Math.max(0, cut - (post - p2))); post = p2;
        C = onLineAtZ(from, C, rz * (bz + post));
        B = onLineAtZ(from, C, rz * bz); T = flightTime(from, C, B, v, st);
      }
      return { C, B, T };
    }
    if (short) {
      // 짧은 공: 네트 가까이 떨어진다. 뒤에서 달려오는 사람이 닿을 수 있게, 바운드 뒤 죽어 가는 공을 조금 더 깊은 곳에서 받는다
      let C = [clamp(P[0] * 0.7 + n1 * 1.2, -5, 5), rz * clamp(4.6 - Math.min(f, 1.3) * 2.2, 1.9, 4.6)];
      let B = onLineAtZ(from, C, rz * Math.max(1.0, C[1] * rz - (st === 'drop_volley' ? 1.2 : 1.7)));
      let T = flightTime(from, C, B, v, st);
      for (let it = 0; it < 4 && f < 1; it++) {
        const can = reachOf(body, T, late) * Math.max(f, 0.6), d = Math.hypot(C[0] - P[0], C[1] - P[1]);
        if (d <= can) break;
        const w = unit(C, P), z = clamp((C[1] + w[1] * (d - can)) * rz, C[1] * rz, 7.5);
        C = [C[0] + w[0] * (d - can), rz * z];
        B = onLineAtZ(from, C, rz * Math.max(1.0, C[1] * rz - (st === 'drop_volley' ? 1.2 : 1.7)));
        T = flightTime(from, C, B, v, st);
      }
      return { C, B, T };
    }
    const volley = R.pos === 'net';
    let u;
    if (dir === 'dtl') u = [side, 0.15 * rz];
    else if (dir === 'angle') u = [side, -0.7 * rz];
    else if (dir === 'center') u = [-side, 0.15 * rz];
    else if (dir === 'deep') u = [n1 * 0.4, rz];
    else if (dir === 'body') u = [side * 0.4, 0.3 * rz];
    else u = [n1 >= 0 ? 1 : -1, (u2 - 0.5) * 0.8 * rz];
    const n = Math.hypot(u[0], u[1]); u = [u[0] / n, u[1] / n];
    const [z0, z1] = volley ? [1.3, 5.6] : [6.5, 15.0];   // 떨어지는 공을 치려고 베이스라인 뒤까지 물러난다
    // 받는 곳. 바운드 없이 받는 공(발리)은 옆줄 안쪽에서 받는다(옆줄 밖에서 발리하면 나가는 공을 친 것처럼 보인다, 사용자 2026-11-09)
    const xw = volley ? 5.25 : 6.4;
    const fit = c => [clamp(c[0], side > 0 ? -1.6 : -xw, side > 0 ? xw : 1.6), rz * clamp(c[1] * rz, z0, z1)];
    let C = P, B = null, T = 0.9;
    // 뒤로 가는 공은 뒤로 닿을 수 있는 거리로(돌아서는 데 늦고 느리다)
    const bodyU = bodyDir(body, Math.max(0, u[1] * rz));
    for (let it = 0; it < 3; it++) {
      const want = dir === 'body' ? Math.min(0.6, f * 0.6) : f * reachOf(bodyU, T, late);
      C = fit([P[0] + u[0] * want, P[1] + u[1] * want]);
      if (!volley) ({ B, C } = bounceOf(from, C, v, rz, st));
      T = flightTime(from, C, B, v, st);
    }
    return { C, B, T };
  }
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
      const deciding = !tb && st.p[0] === 3 && st.p[1] === 3;
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
      if (!tb && (st.p[0] === 4 || st.p[1] === 4)) break;
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
      const rWins = ps[rTeam] === 3; // 노애드: 3이면 다음 포인트로 게임
      const sWins = ps[sTeam] === 3;
      if (rWins) { bpFor = rTeam; big = true; pressure = true; label = ps[0] === 3 && ps[1] === 3 ? '듀스 결정 포인트' : '브레이크 포인트'; }
      else if (ps[0] === 3 && ps[1] === 3) { pressure = true; big = true; label = '듀스 결정 포인트'; }
      // 매치 포인트
      for (const t of [0, 1]) {
        if (ps[t] === 3) {
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
    const n = ['0', '15', '30', '40', '게임'];
    return `${n[Math.min(4, st.p[0])]} - ${n[Math.min(4, st.p[1])]}`;
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
    // ── 중계용: 지금 선 곳, 몸, 공을 향해 뛰기 시작한 곳 ──
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
    // 받지 않는 사람(대개 전위) 곁을 낮게 지나가면 그 사람이 쳤어야 할 공으로 보인다. 닿지 않게 옆으로 비킨다
    const clearOf = (R, from, sp, v, st) => {
      if (LOBS.has(st)) return sp;
      const m = this.mate(R), mi = this.P.indexOf(m), rz = this.zSign(R.team), need = body[mi].reach + 0.45;
      for (let it = 0; it < 3; it++) {
        const end = sp.B || sp.C, tgt = this.homeOf(m, sp.C[0], lvl[m.team]);
        const d = Math.min(...[at[mi], tgt, [(at[mi][0] + tgt[0]) / 2, (at[mi][1] + tgt[1]) / 2]].map(q => segDist(q, from, end)));
        if (d >= need) break;
        const sx = Math.sign(sp.C[0] - at[mi][0]) || -Math.sign(at[mi][0]) || 1;
        let C = [clamp(sp.C[0] + sx * (need - d) * 1.6, -5.4, 5.4), sp.C[1]], B = sp.B;
        if (B) ({ B, C } = bounceOf(from, C, v, rz, st));
        sp = { C, B, T: flightTime(from, C, B, v, st) };
      }
      return sp;
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
    const pin = clamp(0.47 + s.first_serve / 230 + M(server) * 0.8 - fat(server) / 300 + tempoOf(sT).serve, 0.35, 0.9);
    let first = rng() < pin;
    let D, type = 'serve';
    // 서브 코스(중계용): 와이드 / 센터 / 몸쪽
    const vk = this.vis();
    const svcBounce = this.serveSpot(server, cx, zs, vk < 0.4 ? 'wide' : vk < 0.75 ? 'T' : 'body');
    const fault = () => [-cx * (0.8 + this.vis() * 3.6), -zs * (6.6 + this.vis() * 0.8)];
    if (first) {
      server.rec.fsIn++;
      const pa = clamp((0.8 * s.first_serve + 0.2 * s.serve_place - r.c_power) / 260 + 0.035 + (sT.choices.formation === 'iform' ? 0.01 : 0) + M(server) * 0.3, 0.01, 0.22);
      if (rng() < pa) {
        recCounter(receiver, 'c_power', false);
        server.rec.aces++;
        // 에이스: 구석에 꽂히고, 받는 사람은 손을 뻗다 놓친다
        const side = rng() < 0.5 ? 1 : -1;
        const B = this.serveSpot(server, cx, zs, side > 0 ? 'wide' : 'T'), v = this.serveV(server, true);
        const w = unit(serverPos, B), to = toFence(B, w, 6);
        const ft = flightTime(serverPos, to, B, v, 'serve');
        const plan = []; plan[ri] = missAt(ri, [B[0] + w[0] * 3, B[1] + w[1] * 3], ft, clamp((55 - r.c_power) * 0.0015, -0.03, 0.08));
        shots.push({ h: si, type: 'serve', from: serverPos, bounce: B, to, res: 'ace', pos: pos0, v: r2(v), mv: move(plan, ft), victim: ri, info: shotInfo(server, ['first_serve', 'serve_place', 'power'], Math.max(90, sq1 * 0.5 + 50)) });
        addCall(this.P, shots[shots.length - 1], server, ['first_serve', 'serve_place', 'power']);
        return this.finish(shots, server.team, 'ace', server, ctx);
      }
      D = 22 + (0.6 * s.first_serve + 0.4 * s.serve_place) * 0.45 - r.c_power * 0.18;
      recCounter(receiver, 'c_power', true);
    } else {
      const fb = fault(), fv = this.serveV(server, true);
      shots.push({ h: si, type: 'serve', from: serverPos, bounce: fb, to: fb, res: 'fault', pos: pos0, v: r2(fv), info: shotInfo(server, ['first_serve', 'serve_place', 'power'], sq1 * 0.45), mv: move(letGo(serverPos, fb, flightTime(serverPos, fb, null, fv, 'serve'), receiver.team, ri, fv, retD(fv)), 0) });
      const pin2 = clamp(0.80 + s.second_serve / 600 + M(server) - fat(server) / 400, 0.72, 0.97);
      if (rng() >= pin2) {
        server.rec.df++;
        server.gauge -= 8 * (1 - server.stats.composure / 170);
        const fb2 = fault(), fv2 = this.serveV(server, false);
        shots.push({ h: si, type: 'serve2', from: serverPos, bounce: fb2, to: fb2, res: 'df', pos: pos0, v: r2(fv2), info: shotInfo(server, ['second_serve', 'serve_place'], sq2 * 0.45), mv: move(letGo(serverPos, fb2, flightTime(serverPos, fb2, null, fv2, 'serve2'), receiver.team, ri, fv2, retD(fv2)), 0) });
        return this.finish(shots, receiver.team, 'df', server, ctx);
      }
      type = 'serve2';
      D = 6 + s.second_serve * 0.28 + s.serve_place * 0.1;
    }
    if (sT.choices.formation === 'iform') D += 8 * (server.stats.formation / 60);
    // 서브 앤 발리 / 대시
    const svMove = (sT.choices.shot === 'serve_volley' && rng() < 0.75) || (sT.choices.shot === 'dash' && rng() < 0.3);
    {
      // 공은 바운드 뒤 떴다가 내려올 때 받는다(retD). 깊게 들어온 서브일수록 뒤에서 받는다. 강서브 대처가 낮으면 출발이 늦다
      const v = this.serveV(server, type === 'serve');
      const w = unit(serverPos, svcBounce), C = [svcBounce[0] + w[0] * retD(v), svcBounce[1] + w[1] * retD(v)];
      const ft = flightTime(serverPos, C, svcBounce, v, type);
      const kind = Math.abs(svcBounce[0] + cx * 2.6) < 0.01 ? 'jam' : strain(clamp(D, 0, 95)) >= 0.72 ? 'reach' : 'set';
      const t0 = body[ri].react + (type === 'serve' ? clamp((55 - r.c_power) * 0.0015, -0.03, 0.08) : 0);
      if (svMove) server.pos = 'net';
      const plan = []; plan[ri] = runAt(ri, C, ft, t0, kind);
      if (svMove) { const [x, z] = this.homeOf(server); plan[si] = { x, z, t0: 0.3, v: body[si].top, k: 'back' }; }
      shots.push({ h: si, type, from: serverPos, bounce: svcBounce, to: C, res: 'in', pos: pos0, v: r2(v), mv: move(follow(plan, C[0]), ft),
        info: type === 'serve' ? shotInfo(server, ['first_serve', 'serve_place', 'power'], 45 + sq1 * 0.5) : shotInfo(server, ['second_serve', 'serve_place'], 50 + sq2 * 0.4) });
    }
    tire(server);

    let H = receiver, inc = { D, height: 'mid', type, from: server, forceBh: false };
    let lastShooter = server;
    for (let k = 0; k < 40; k++) {
      const T = this.teams[H.team];
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
      let err = (TUNE.errBase + (inc.D - S) * TUNE.errSlope + (RISK[st] || 0) * TUNE.skill.risk[skillLv] + (DIR_RISK[dir] || 0) - H.stats.focus / 1300 + fat(H) / 350 + (this.mentalState(H) === 'tilt' ? 0.06 : 0) + (T.choices.plan === 'power' && k >= 3 ? (k - 2) * TUNE.rallyErr : 0)) * tempoOf(T).err * planVal(T, 'err');
      if (inc.back) { Q -= TUNE.back.q * inc.back; err += TUNE.back.err * inc.back; }
      err = clamp(err, 0.02, 0.65);
      const info = shotInfo(H, shotUse(st, dir, inc.forceBh, pressure), accOfQ(Q));
      { const stn = stanceOf(st, shots[shots.length - 1]?.mv?.[this.P.indexOf(H)], inc.D); if (stn) info.stance = inc.back > 0.5 ? 'run' : stn; }   // 뒤로 밀리며 치면 달리면서
      tire(H);
      const posNow = this.snapshot();
      const hi = this.P.indexOf(H);
      const prev = shots[shots.length - 1];
      const from = prev && prev.to ? prev.to : posNow[hi];
      posNow[hi] = from;
      // 중계용: 친 사람은 공 옆에 서 있다
      at[hi] = standOf(from, st, H.team, runFrom[hi], prev?.mv?.[hi]?.far || 0);
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
          const os = this.opps(H), crossT = os.find(o => o.side === H.side) || os[0], J = dir === 'dtl' ? os.find(o => o !== crossT) : crossT;
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
            shots.push({ h: hi, type: st, dir, from, bounce: null, to: C, res: 'in', outBall: true, pos: posNow, v: r2(ev), info: { ...info, acc: Math.min(info.acc, 45) }, mv: move(follow(plan, C[0]), ft) });
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
        shots.push({ h: hi, type: st, dir, from, to, bounce: isNet ? null : to, res: isNet ? 'net' : 'out', pos: posNow, v: r2(ev), info: { ...info, acc: Math.min(info.acc, 45) }, mv: move(follow(lp, aim[0]), 0), ...(judged >= 0 ? { judge: judged } : {}) });
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
      // 받는 사람
      let R = this.pickReceiver(H, st, dir);
      const Rteam = this.teams[R.team];
      // 센터 혼선
      if (dir === 'center') {
        const os = this.opps(H);
        const conf = clamp((62 - avg(...os.map(o => o.stats.comm)) - (Rteam.combo || 0) * 0.1) / 260, 0, 0.18);
        if (rng() < conf) {
          const to = [0, -this.zSign(H.team) * 7];
          H.rec.winners++; rec(H, st, 'win');
          this.assist(H, lastByTeam);
          // 둘 다 가다가 서로 미룬다
          const v = this.ballV(H, st, Q), out = toFence(to, unit(from, to), 5.5), ft = flightTime(from, out, to, v, st);
          const plan = [];
          for (const o of os) { const j = this.P.indexOf(o); plan[j] = { ...missAt(j, [0, to[1] * 1.3], ft), k: 'confuse' }; }
          shots.push({ h: hi, type: st, dir, from, bounce: to, to: out, res: 'center', pos: posNow, v: r2(v), mv: move(plan, ft), info });
          return this.finish(shots, H.team, 'center', H, ctx);
        }
      }
      // 포치
      const isGround = !['topspin_lob', 'def_lob', 'moon_volley', 'smash', 'dropshot', 'drop_volley'].includes(st);
      const Rmate = this.mate(R);
      if (isGround && R.pos === 'base' && Rmate.pos === 'net' && (dir === 'cross' || dir === 'center' || dir === 'deep') && H.pos === 'base') {
        const pa = clamp(0.06 + Rmate.stats.poach / 320 + (Rteam.choices.formation === 'up' ? 0.04 : 0) + (Rteam.choices.tempo === 'attack' ? 0.03 : 0) - H.stats.c_poach / 450, 0.02, 0.35);
        if (rng() < pa) {
          Rmate.rec.poachTry++;
          const pw = clamp((Rmate.stats.fh_volley * 0.5 + Rmate.stats.poach * 0.5 - Q * 0.6) / 120 + 0.14 + this.gmod(Rmate), 0.05, 0.55);
          recCounter(H, 'c_poach', true);
          const ni = this.P.indexOf(Rmate);
          const pa2 = this.anchor(Rmate);
          const contact = [pa2[0] * 0.2, pa2[1]];
          // 전위가 상대가 치는 순간 가로질러 나간다
          const v1 = this.ballV(H, st, Q), ft1 = flightTime(from, contact, null, v1, st);
          const plan1 = [];
          plan1[ni] = { x: contact[0], z: contact[1], t0: 0.05, v: Math.max(body[ni].top, Math.hypot(contact[0] - at[ni][0], contact[1] - at[ni][1]) / Math.max(0.2, ft1 - 0.12)), k: 'poach' };
          pushLvl(R.team, 1);
          const poachShot = { h: hi, type: st, dir, from, to: contact, bounce: null, res: 'in', pos: posNow, v: r2(v1), info, mv: move(follow(plan1, contact[0]), ft1) };
          if (rng() < pw) {
            Rmate.rec.poachWin++; Rmate.rec.winners++; rec(Rmate, 'fh_volley', 'n'); rec(Rmate, 'fh_volley', 'win');
            shots.push(poachShot);
            const p2 = this.snapshot(); p2[ni] = contact;
            const land = [-contact[0] * 2 + (rng() < 0.5 ? 2.5 : -2.5), this.zSign(H.team) * 6];
            at[ni] = standOf(contact, 'fh_volley', R.team, runFrom[ni]);
            const v2 = BALL_V.fh_volley * 1.2, out2 = toFence(land, unit(contact, land), 6), ft2 = flightTime(contact, out2, land, v2, 'fh_volley');
            const hs = this.P.filter(q => q.team === H.team).map(q => this.P.indexOf(q));
            const vi = hs.reduce((a, b) => (Math.hypot(at[a][0] - land[0], at[a][1] - land[1]) <= Math.hypot(at[b][0] - land[0], at[b][1] - land[1]) ? a : b));
            const plan2 = []; plan2[vi] = missAt(vi, land, ft2);
            shots.push({ h: ni, type: 'fh_volley', dir: 'body', from: contact, bounce: land, to: out2, res: 'poach', pos: p2, v: r2(v2), info: shotInfo(Rmate, ['fh_volley', 'poach', 'power'], 92), mv: move(plan2, ft2), victim: vi });
            addCall(this.P, shots[shots.length - 1], Rmate, ['poach', 'fh_volley']);
            Rmate.gauge += 5;
            return this.finish(shots, R.team, 'poach', Rmate, ctx);
          }
          shots.push(poachShot);
          lastByTeam[H.team] = H; lastShooter = H;
          inc = { D: clamp(Q - Rmate.stats.poach * 0.3, 0, 90), height: 'mid', type: st, from: H, counter: null };
          H = Rmate; continue;
        }
      }
      // 수비값
      const counter = COUNTER_OF[st] || (dir === 'angle' ? 'c_angle' : dir === 'body' ? 'c_body' : null);
      let Def;
      if (counter) Def = R.stats[counter] * 0.7 + (R.stats.first_step + R.stats.speed) / 2 * 0.3;
      else Def = (R.stats.first_step + R.stats.speed + R.stats.positioning) / 3;
      if (st === 'smash') Def *= 0.72;
      if (dir === 'dtl' && R.pos === 'net') Def -= 8;
      Def += this.gmod(R) * 50;
      const readLv = R.skills?.read || 0;
      Def += TUNE.skill.readDef[readLv];
      const lob = st === 'topspin_lob' || st === 'def_lob' || st === 'moon_volley';
      if (lob && R.pos === 'net') { Def = Def * 0.75 + this.mate(R).stats.cover * 0.25; }
      let w = clamp((TUNE.winBase + (Q - Def) * TUNE.winSlope) * (WINNER_F[st] || 1), 0, 0.5) * tempoOf(T).win * TUNE.skill.win[skillLv];
      if (st === 'def_lob') w = Math.min(w, 0.04);
      const Ri = this.P.indexOf(R);
      const rz = this.zSign(R.team);
      let hit = rng() < w, saved = false;
      // 예측 수비: 위너가 될 공을 미리 움직여 받아 낸다
      if (hit && readLv && rng() < TUNE.skill.readSave[readLv]) { hit = false; saved = true; R.rec.skillUse.read = (R.rec.skillUse.read || 0) + 1; }
      if (hit) {
        H.rec.winners++; rec(H, st, 'win');
        this.assist(H, lastByTeam);
        H.gauge += 4;
        // 위너: 받는 사람이 닿을 수 있는 거리 밖으로. 받는 사람은 뛰다가 몸을 던진다 (난수 순서는 예전과 같다)
        const drop = st === 'dropshot' || st === 'drop_volley';
        let a = 0.5, b = 0.5;
        if (!lob && !drop) { a = rng(); b = rng(); }
        const v = this.ballV(H, st, Q), fw = 1.3 + clamp((Q - Def) / 80, 0, 0.5);
        const sp = clearOf(R, from, this.spot(R, st, dir, fw, v, from, at[Ri], body[Ri], 0, a < 0.5 ? 1 : -1, b), v, st);
        let land = sp.B;
        if (!land) { const w0 = unit(from, sp.C); land = [sp.C[0] + w0[0] * 3, sp.C[1] + w0[1] * 3]; }
        land = [clamp(land[0], -5.25, 5.25), rz * clamp(land[1] * rz, 0.9, 11.6)];
        const w = unit(from, land), out = toFence(land, w, 7);
        const ft = flightTime(from, out, land, v, st);
        const plan = []; plan[Ri] = missAt(Ri, sp.C, ft);
        pushLvl(H.team, 1);
        shots.push({ h: hi, type: st, dir, from, bounce: land, to: out, res: 'win', pos: posNow, victim: Ri, info: { ...info, acc: Math.max(info.acc, 88) }, skill: skillLv ? skillKey : undefined, v: r2(v), mv: move(follow(plan, land[0]), ft) });
        addCall(this.P, shots[shots.length - 1], H, shotStats(st, dir));
        if (counter) recCounter(R, counter, false);
        return this.finish(shots, H.team, 'win', H, ctx);
      }
      // 계속
      // 중계용 흔들림. u1은 이제 쓰지 않지만 난수 순서를 지키려고 그대로 뽑는다
      const n1 = gauss(rng), u1 = R.pos === 'base' ? rng() : 0.5, u2 = R.pos === 'base' && !lob ? rng() : 0.5; void u1;
      const nextD = clamp(Q - Def * TUNE.dCarry + 10 - (saved ? 15 : 0), 0, 95);
      // 공은 받는 사람의 부담만큼 멀리 간다. 그 공의 대처가 낮으면 출발이 늦고, 예측 수비가 있으면 빠르다
      const v = this.ballV(H, st, Q), f = strain(nextD);
      const late = clamp((55 - (counter ? R.stats[counter] : 55)) * 0.0015, -0.03, 0.08) - readLv * 0.05;
      // 뒤로 오는 로브는 닿기만 하면 스매시로(사용자 2026-11-11). 덜 좋은 로브(부담이 작은 공)일수록, 스매시를 잘할수록 닿는다.
      // 뒤에 선 사람은 짧은 로브만. 닿지 않으면 예전처럼 뒤로 뛰어가 바운드된 공을 친다
      const air = lob && nextD <= smashReach(R) - (R.pos === 'net' ? 0 : 14);
      // 뒤로 밀리는 정도: 깊은 공에 밀린 후위, 머리 위로 넘어간 로브를 쫓는 전위(엔진 값으로만 정한다. 화면 위치는 승패에 쓰지 않는다)
      const backFw = clamp(1.4 - (R.stats.first_step + R.stats.speed + R.stats.positioning) / 300, 0.5, 1.2);   // 발이 좋을수록 덜 밀린다(40 → 1배, 60 → 0.8배, 80 → 0.6배)
      const backN = backFw * (lob ? (air ? 0 : R.pos === 'net' ? 1 : 0.4 * f) : dir === 'deep' && R.pos === 'base' ? f : 0);
      const { C: contact, B: bounce, T: ft } = clearOf(R, from, this.spot(R, st, dir, f, v, from, at[Ri], body[Ri], late, n1, u2, air), v, st);
      if (lob && R.pos === 'net' && !air) R.pos = 'base';
      const shot = { h: hi, type: st, dir, from, bounce, to: contact, res: 'in', pos: posNow, info, skill: saved ? 'read' : undefined, skillBy: saved ? Ri : undefined, v: r2(v) };
      shots.push(shot);
      // 이동
      const wasNet = H.pos === 'net';
      if (st === 'chip_return' || (T.choices.shot === 'dash' && H.pos === 'base' && !lob && rng() < 0.45)) H.pos = 'net';
      if (st === 'topspin_lob' && T.choices.shot === 'lob_net') { H.pos = 'net'; this.mate(H).pos = 'net'; }
      {
        pushLvl(H.team, nextD > 45 ? 1 : nextD < 15 ? -0.6 : 0);
        const plan = [];
        plan[Ri] = runAt(Ri, contact, ft, Math.max(0.02, body[Ri].react + late), dir === 'body' ? 'jam' : f >= 0.72 ? 'reach' : 'set');
        const [hx, hz] = this.homeOf(H, contact[0], lvl[H.team]);
        plan[hi] = { x: hx, z: hz, t0: 0.22, v: H.pos === 'net' && !wasNet ? body[hi].top : body[hi].recov, k: 'back' };
        shot.mv = move(follow(plan, contact[0]), ft);
      }
      lastByTeam[H.team] = H; lastShooter = H;
      inc = {
        D: nextD, height: HEIGHT[st] || 'mid', type: st, from: H, counter, smashable: air, back: backN,
        forceBh: T.choices.attack === 'back' && rng() < 0.6,
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
    if (st === 'return') return 0.6 * s.return + 0.4 * (inc.forceBh ? s.bh_drive : s.fh_drive);
    if (st === 'passing') return 0.6 * s.passing + 0.4 * s.fh_drive;
    return s[st] ?? 40;
  }

  pickReceiver(H, st, dir) {
    const os = this.opps(H);
    const net = os.find(o => o.pos === 'net');
    const crossT = os.find(o => o.side === H.side) || os[0];
    const other = os.find(o => o !== crossT);
    if (st === 'topspin_lob' || st === 'def_lob' || st === 'moon_volley') return net || crossT;
    if (dir === 'body') return net || crossT;
    if (dir === 'dtl') return other;
    if (dir === 'center') return this.rng() < 0.5 ? os[0] : os[1];
    return crossT;
  }

  chooseShot(H, inc) {
    const rng = this.rng, T = this.teams[H.team], ch = T.choices, s = H.stats;
    const os = this.opps(H);
    const oppNet = os.some(o => o.pos === 'net');
    const bothBase = os.every(o => o.pos === 'base');
    const w = {};
    const add = (k, v) => { if (v > 0) w[k] = (w[k] || 0) + v; };
    const fh = rng() < (inc.forceBh ? 0.25 : 0.58);
    const isReturn = inc.type === 'serve' || inc.type === 'serve2';
    if (inc.smashable) { add('smash', 0.85); add('moon_volley', 0.08); }   // 닿는 로브는 거의 스매시
    else if (isReturn) {
      add('return', 0.62); add('chip_return', 0.18); if (oppNet) add('topspin_lob', 0.08); add('def_lob', inc.D > 60 ? 0.12 : 0.02);
    } else if (H.pos === 'net') {
      if (inc.height === 'high') { add('smash', 0.75); add('moon_volley', 0.1); add('drop_volley', 0.08); }
      else if (inc.height === 'low') { add('low_volley', 0.55); add('half_volley', 0.2); add('drop_volley', 0.18); add('moon_volley', 0.07); }
      else { add(fh ? 'fh_volley' : 'bh_volley', 0.62); add('drop_volley', 0.1); add('moon_volley', 0.12); add('swing_volley', 0.06); }
    } else {
      if (inc.height === 'high') { add('smash', 0.18); add('def_lob', 0.3); add(fh ? 'fh_drive' : 'bh_drive', 0.4); add('moon_volley', 0.06); }
      else if (inc.D > 65) { add('def_lob', 0.35); add(fh ? 'fh_slice' : 'bh_slice', 0.35); add(fh ? 'fh_drive' : 'bh_drive', 0.25); }
      else {
        add(fh ? 'fh_drive' : 'bh_drive', 0.5); add(fh ? 'fh_slice' : 'bh_slice', 0.2);
        add('topspin_lob', oppNet ? 0.16 : 0.03); add('dropshot', bothBase ? 0.1 : 0.03);
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
    else if (H.pos === 'net' || type === 'smash') { if (oppNet) d.body = 0.3; d.center = 0.25; d.angle = 0.25; d.deep = 0.2; }
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
