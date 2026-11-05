// 경기 시뮬레이션 엔진 — 포인트 단위 확률 엔진 (기획 문서 7장)
// 엔진은 결과와 포인트 로그만 만들고, 화면(match3d.js)은 로그를 재생만 한다.
import { COUNTER_OF, ALL_STATS, OPP_ARCH } from './data.js';

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
    power: { early: { q: 8, err: 0.92 }, late: { q: 2, err: 1.08 }, tire: 1.15 },
    twoup: { early: { q: 3, err: 1 }, late: { q: 2, err: 1.02 }, tire: 1.05 },
    twoback: { early: { q: -2, err: 0.98 }, late: { q: 2, err: 0.95 }, tire: 0.95 },
    lob: { early: { q: -4, err: 1 }, late: { q: 3, err: 0.93 }, tire: 0.9 },
  },
  rallyErr: 0.004, // 강타가 받혀서 랠리가 길어질수록 느는 범실
  gritK: 0.06, // 2게임 이상 뒤질 때 끈질긴 작전에 붙는 힘. 회복탄력성과 스태미나에 비례
};
const avg = (...xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

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

// 샷 종류와 코스에 맞는 낙하 지점과 받는 지점. 연출용이고 승패에는 영향을 주지 않는다.
function landingOf(st, dir, rPos, ra, rz, n, u1, u2) {
  const lob = st === 'topspin_lob' || st === 'def_lob' || st === 'moon_volley';
  const short = st === 'dropshot' || st === 'drop_volley';
  const low = HEIGHT[st] === 'low';
  const side = Math.sign(ra[0]) || 1;
  // 좌우: 코스에 따라
  let x = ra[0] + n * 0.9;
  if (dir === 'center') x = side * (0.5 + Math.abs(n) * 0.5);
  else if (dir === 'dtl') x = side * (4.2 + u1 * 0.8);
  else if (dir === 'angle') x = side * (4.6 + u1 * 0.6);
  x = clamp(x, -5.2, 5.2);
  // 앞뒤: 샷 종류에 따라
  if (lob) return { bounce: [x, rz * (9.6 + u2 * 1.6)], contact: [clamp(x * 1.05, -6, 6), rz * (11.6 + u1 * 1.0)] };
  if (short) return { bounce: [x * 0.8, rz * (1.8 + Math.abs(n) * 0.6)], contact: [x * 0.85, rz * (3.2 + Math.abs(n) * 0.7)] };
  if (rPos === 'net') return { bounce: null, contact: [clamp(x * 0.7, -4.8, 4.8), rz * (2.8 + u1 * 1.2)] };
  if (dir === 'angle') return { bounce: [x, rz * (4.4 + u2 * 1.6)], contact: [clamp(x * 1.3, -6.5, 6.5), rz * (7.2 + u1 * 1.4)] };
  if (low) return { bounce: [x, rz * (7.6 + u2 * 2.0)], contact: [clamp(x * 1.08, -6, 6), rz * (10.2 + u1 * 0.9)] };
  return { bounce: [x, rz * (8.2 + u2 * 2.4)], contact: [clamp(x * 1.1, -6.2, 6.2), rz * (11.2 + u1 * 1.2)] };
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
        rec: { fsIn: 0, fsTot: 0, aces: 0, df: 0, winners: 0, errors: 0, errEarly: 0, errLate: 0, poachTry: 0, poachWin: 0, assists: 0, counter: {}, shots: {} },
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
  }
  team(i) { return this.teams[i]; }
  mate(p) { return this.P.find(q => q.team === p.team && q !== p); }
  opps(p) { return this.P.filter(q => q.team !== p.team); }
  zSign(t) { return t === 0 ? 1 : -1; }
  xSign(p, side = p.side) { return (p.team === 0 ? 1 : -1) * (side === 0 ? 1 : -1); }
  anchor(p) {
    const zs = this.zSign(p.team), xs = this.xSign(p);
    if (p.pos === 'net') return [xs * 2.3, zs * 3.4];
    return [xs * 2.8, zs * 11.0];
  }
  snapshot() { return this.P.map(p => this.anchor(p)); }

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
    server.rec.fsTot++;
    const pin = clamp(0.47 + s.first_serve / 230 + M(server) * 0.8 - fat(server) / 300 + tempoOf(sT).serve, 0.35, 0.9);
    let first = rng() < pin;
    let D, type = 'serve';
    const svcBounce = [-cx * 2.2, -zs * 4.6];
    if (first) {
      server.rec.fsIn++;
      const pa = clamp((0.8 * s.first_serve + 0.2 * s.serve_place - r.c_power) / 260 + 0.035 + (sT.choices.formation === 'iform' ? 0.01 : 0) + M(server) * 0.3, 0.01, 0.22);
      if (rng() < pa) {
        recCounter(receiver, 'c_power', false);
        server.rec.aces++;
        shots.push({ h: si, type: 'serve', from: serverPos, bounce: svcBounce, to: [rx + (rng() < 0.5 ? 1.6 : -1.6), rz - zs * 1.2], res: 'ace', pos: pos0 });
        return this.finish(shots, server.team, 'ace', server, ctx);
      }
      D = 22 + (0.6 * s.first_serve + 0.4 * s.serve_place) * 0.45 - r.c_power * 0.18;
      recCounter(receiver, 'c_power', true);
    } else {
      shots.push({ h: si, type: 'serve', from: serverPos, bounce: [-cx * 2.2, -zs * 7.0], to: [-cx * 2.2, -zs * 7.0], res: 'fault', pos: pos0 });
      const pin2 = clamp(0.80 + s.second_serve / 600 + M(server) - fat(server) / 400, 0.72, 0.97);
      if (rng() >= pin2) {
        server.rec.df++;
        server.gauge -= 8 * (1 - server.stats.composure / 170);
        shots.push({ h: si, type: 'serve2', from: serverPos, bounce: [-cx * 2.6, -zs * 6.8], to: [-cx * 2.6, -zs * 6.8], res: 'df', pos: pos0 });
        return this.finish(shots, receiver.team, 'df', server, ctx);
      }
      type = 'serve2';
      D = 6 + s.second_serve * 0.28 + s.serve_place * 0.1;
    }
    if (sT.choices.formation === 'iform') D += 8 * (server.stats.formation / 60);
    // 서브 앤 발리 / 대시
    const svMove = (sT.choices.shot === 'serve_volley' && rng() < 0.75) || (sT.choices.shot === 'dash' && rng() < 0.3);
    shots.push({ h: si, type, from: serverPos, bounce: svcBounce, to: recvPos, res: 'in', pos: pos0 });
    if (svMove) server.pos = 'net';
    tire(server);

    let H = receiver, inc = { D, height: 'mid', type, from: server, forceBh: false };
    let lastShooter = server;
    for (let k = 0; k < 40; k++) {
      const T = this.teams[H.team];
      const choice = this.chooseShot(H, inc);
      const { type: st, dir } = choice;
      const S = this.statFor(H, st, inc);
      const Sc = st === 'return' || st === 'chip_return' ? S : H.stats[COURSE_STAT[dir] || 'cross'];
      const combo = (T.combo || 0) * 0.08;
      let Q = TUNE.statW * S + (1 - TUNE.statW) * Sc + gauss(rng) * TUNE.noise + M(H) * 100 + combo - fat(H) * 0.8 - inc.D * TUNE.qD;
      Q += tempoOf(T).q + planVal(T, 'q');
      // 뒤지고 있어도 끈질기게 버티는 힘
      if ((T.choices.plan === 'twoback' || T.choices.plan === 'lob') && this.games[1 - H.team] - this.games[H.team] >= 2) Q += Math.max(0, (H.stats.resilience + H.stats.stamina) / 2 - 25) * TUNE.gritK;
      if ((st === 'fh_slice' || st === 'bh_slice') && T.choices.shot === 'deep_slice') Q += 5;
      let err = (TUNE.errBase + (inc.D - S) * TUNE.errSlope + (RISK[st] || 0) + (DIR_RISK[dir] || 0) - H.stats.focus / 1300 + fat(H) / 350 + (this.mentalState(H) === 'tilt' ? 0.06 : 0) + (T.choices.plan === 'power' && k >= 3 ? (k - 2) * TUNE.rallyErr : 0)) * tempoOf(T).err * planVal(T, 'err');
      err = clamp(err, 0.02, 0.65);
      tire(H);
      const posNow = this.snapshot();
      const hi = this.P.indexOf(H);
      const prev = shots[shots.length - 1];
      const from = prev && prev.to ? prev.to : posNow[hi];
      posNow[hi] = from;
      // 받은 쪽 대처 결과 기록 (직전 샷이 대처 짝이 있는 샷이었다면)
      if (inc.counter) recCounter(H, inc.counter, rng() >= err);
      if (rng() < err) {
        const isNet = st === 'dropshot' || st === 'drop_volley' || st === 'low_volley' || rng() < 0.45;
        const zs2 = this.zSign(H.team);
        const to = isNet ? [from[0] * 0.6, zs2 * 0.3] : [clamp(from[0] * -1.1 + gauss(rng) * 2, -7, 7), -zs2 * (12.8 + rng() * 1.5)];
        H.rec.errors++; rec(H, st, 'err');
        if (this.gameNo < 5) H.rec.errEarly++; else H.rec.errLate++;
        shots.push({ h: hi, type: st, dir, from, to, bounce: isNet ? null : to, res: isNet ? 'net' : 'out', pos: posNow });
        H.gauge -= 6 * (1 - H.stats.composure / 160);
        const m = this.mate(H); m.gauge -= 2 * (1 - m.stats.composure / 150);
        return this.finish(shots, 1 - H.team, 'err', H, ctx);
      }
      rec(H, st, 'n');
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
          shots.push({ h: hi, type: st, dir, from, bounce: to, to: [0, -this.zSign(H.team) * 12.5], res: 'center', pos: posNow });
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
          if (rng() < pw) {
            Rmate.rec.poachWin++; Rmate.rec.winners++; rec(Rmate, 'fh_volley', 'n'); rec(Rmate, 'fh_volley', 'win');
            shots.push({ h: hi, type: st, dir, from, to: contact, bounce: null, res: 'in', pos: posNow });
            const p2 = this.snapshot(); p2[ni] = contact;
            const land = [-contact[0] * 2 + (rng() < 0.5 ? 2.5 : -2.5), this.zSign(H.team) * 6];
            shots.push({ h: ni, type: 'fh_volley', dir: 'body', from: contact, bounce: land, to: [land[0] * 1.2, this.zSign(H.team) * 12], res: 'poach', pos: p2 });
            Rmate.gauge += 5;
            return this.finish(shots, R.team, 'poach', Rmate, ctx);
          }
          shots.push({ h: hi, type: st, dir, from, to: contact, bounce: null, res: 'in', pos: posNow });
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
      const lob = st === 'topspin_lob' || st === 'def_lob' || st === 'moon_volley';
      if (lob && R.pos === 'net') { Def = Def * 0.75 + this.mate(R).stats.cover * 0.25; }
      let w = clamp((TUNE.winBase + (Q - Def) * TUNE.winSlope) * (WINNER_F[st] || 1), 0, 0.5) * tempoOf(T).win;
      if (st === 'def_lob') w = Math.min(w, 0.04);
      const Ri = this.P.indexOf(R);
      const rz = this.zSign(R.team);
      if (rng() < w) {
        H.rec.winners++; rec(H, st, 'win');
        this.assist(H, lastByTeam);
        H.gauge += 4;
        const ra = this.anchor(R);
        const land = lob ? [ra[0] * 0.6, rz * 10.5] : st === 'dropshot' || st === 'drop_volley' ? [ra[0] * 0.5, rz * 2.2] : [clamp(ra[0] + (rng() < 0.5 ? 3 : -3), -5, 5), rz * (5 + rng() * 4)];
        const out = [land[0] * 1.15, rz * 13.5];
        shots.push({ h: hi, type: st, dir, from, bounce: land, to: out, res: 'win', pos: posNow, victim: Ri });
        if (counter) recCounter(R, counter, false);
        return this.finish(shots, H.team, 'win', H, ctx);
      }
      // 계속
      const ra = this.anchor(R);
      const n1 = gauss(rng), u1 = R.pos === 'base' ? rng() : 0.5, u2 = R.pos === 'base' && !lob ? rng() : 0.5;
      const { contact, bounce } = landingOf(st, dir, R.pos, ra, rz, n1, u1, u2);
      if (lob && R.pos === 'net') R.pos = 'base';
      shots.push({ h: hi, type: st, dir, from, bounce, to: contact, res: 'in', pos: posNow });
      // 이동
      if (st === 'chip_return' || (T.choices.shot === 'dash' && H.pos === 'base' && !lob && rng() < 0.45)) H.pos = 'net';
      if (st === 'topspin_lob' && T.choices.shot === 'lob_net') { H.pos = 'net'; this.mate(H).pos = 'net'; }
      lastByTeam[H.team] = H; lastShooter = H;
      inc = {
        D: clamp(Q - Def * TUNE.dCarry + 10, 0, 95), height: HEIGHT[st] || 'mid', type: st, from: H, counter,
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
    for (const p of this.P) {
      p.gauge += p.team === winner ? 2 : -1.5;
      const base = 50 + ((p.conf ?? 50) - 50) / 3;
      p.gauge += (base - p.gauge) * 0.04 * (0.5 + p.stats.resilience / 100);
      p.gauge = clamp(p.gauge, 0, 100);
      p.F += 0.05;
    }
    const byIdx = this.P.indexOf(by);
    const text = this.describe(shots, winner, endType, by);
    return { shots, winner, endType, by: byIdx, label: ctx.label, big: ctx.big, text, gauges: this.P.map(p => Math.round(p.gauge)), states: this.P.map(p => this.mentalState(p)) };
  }

  describe(shots, winner, endType, by) {
    const last = shots[shots.length - 1];
    const nm = by.name;
    if (endType === 'ace') return `${nm} 서브 에이스!`;
    if (endType === 'df') return `${nm} 더블폴트…`;
    if (endType === 'center') return `${nm}의 ${SHOT_NAME[last.type] || ''} — 센터 혼선!`;
    if (endType === 'poach') return `${nm} 포치 성공!`;
    if (endType === 'win') return `${nm}의 ${DIR_NAME[last.dir] ? DIR_NAME[last.dir] + ' ' : ''}${SHOT_NAME[last.type] || ''} 위너!`;
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
    if (isReturn) {
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
    else { d.cross = 0.55; d.dtl = oppNet ? 0.15 : 0.08; d.center = 0.15; d.angle = 0.1; d.deep = 0.05; }
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
  c.formation = arch && arch.id === 'net' ? 'up' : arch && arch.id === 'wall' ? 'back' : 'diag';
  // 상대 성향에 따라 구간별 힘이 다르다. 강타형은 초반에 세고 오래가면 흔들린다.
  c.plan = arch ? { power: 'power', net: 'twoup', wall: 'twoback', moon: 'lob' }[arch.id] : undefined;
  return c;
}
