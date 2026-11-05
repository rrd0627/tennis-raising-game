// 육성 루프 — 2주 1턴 행동 선택, 깨달음과 레슨, 장면·이야기, 피로·부상, 파트너, 대회·랭킹·승급, 목표, 엔딩 (기획 문서 3·6·8·9·12장)
import {
  ALL_STATS, BIG_STATS, GROUP_BY_ID, ACT, ACTIONS, OUTINGS, CONDS, SKILLS, SKILL_PRICE, EXP_OF, STAT_BIG, SURFACES, HOME_SURFACE, TOUR_EXP, TOUR_FAME, PRIZES, TRAIN_SPOTS, SPOT_USES_PER_LV, SPOT_MAX_LV, BOND_AT, REST_RESULTS, LESSONS, BASIC_LESSONS, PARTNERS, PARTNER, GOALS, PROFILE,
  OPP_ARCH, randomName, CLUB_NAMES, buildCalendar, POINTS, STAGE_NAME, weekInfo, COACH_SECRETS, ENDINGS, DAY_NAMES,
} from './data.js';
import { SCENES, DESC_LINES, DESC_SEASON, CHOICE_SCENES, MILESTONES, STORIES, PERSON_STORIES, BOND_TRAIN_LINES, REALIZE_LINES, TOUR_LINES, DESC_OUTING, FEEL_LINES, FAIL_LINES, HINT_LINES } from './scenes.js';
import { MatchSim, quickMatch, aiChoices, makeStats, makeNpcTeam, mulberry32, gauss } from './sim.js';

export const TOTAL_WEEKS = 156;
export const WEEKS_PER_TURN = 2;
export const GROWTH = 6.5; // 행동 1회의 성장 속도 (tools/season.js 로 조정)
// 확인 링크(?check)는 실제 저장을 건드리지 않도록 따로 저장한다
const SAVE_KEY = typeof location !== 'undefined' && location.search.includes('check') ? 'tennis-raising-save-check' : 'tennis-raising-save-v3';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

export function rngOf(state) {
  return () => {
    state.rs = (state.rs + 0x6D2B79F5) | 0;
    let t = state.rs;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ── 새 게임 ───────────────────────────────────────────────
// profile: 코치와의 첫 대화에서 고른 답 { job, past, why }
export function newGame(name, profile = {}) {
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  const state = {
    v: 3, seed, rs: seed, name: name || '나', week: 1,
    fatigue: 10, stress: 15, confidence: 50, condition: 0,
    division: '개나리', work: 50, coach: 10, club: 5,
    stats: {}, faces: {}, spots: freshSpots(), lastSpot: 'lesson', overtime: false, injury: null, slump: false,
    unlocked: {}, lessons: [], lessonCount: 0, lastTopic: 'stroke', seen: [], miles: [], storiesDone: [],
    partners: {}, calendar: [], entries: {}, asked: {}, invited: [], inbox: [], msgSeq: 1,
    points: { 개나리: { national: [], local: [] }, 국화: { national: [], local: [] } }, npc: {},
    results: [], titles: { local: 0, national: 0, gukwhaLocal: 0, gukwhaNational: 0 },
    goalIdx: 0, goalsDone: [],
    injuries: 0, highStressWeeks: 0, flags: {}, unlocks: [], secretsGot: [], choices: null,
    pendingEvents: [], weekLog: null, ending: null, conds: {},
    fam: { surface: { hard: 45, turf: 15, clay: 10 }, opp: { moon: 10, slice: 10, power: 10, net: 10, wall: 10 } }, growBig: {}, exp: 0, fame: 0, prizes: [], skills: {}, hints: {}, hintAt: {},
  };
  const rng = rngOf(state);
  for (const id of ALL_STATS) state.stats[id] = Math.round(14 + rng() * 10);
  for (const p of PARTNERS) state.partners[p.id] = { aff: p.aff, combo: 0, level: p.level, known: !!p.known, div: p.div, declines: 0, wins: 0, nationalWins: 0 };
  for (const q of PROFILE) {
    const o = q.options.find(x => x.id === profile[q.key]);
    if (!o) continue;
    state[q.key] = o.id;
    if (o.grow) state.growBig[o.grow] = (state.growBig[o.grow] || 1) + 0.1;
    for (const [k, v] of Object.entries(o.fam || {})) state.fam.opp[k] += v;
    for (const [id, v] of Object.entries(o.stats || {})) state.stats[id] = clamp(state.stats[id] + v, 5, 45);
    for (const [pid, v] of Object.entries(o.aff || {})) state.partners[pid].aff += v;
    state.stress += o.stress || 0; state.confidence += o.confidence || 0; state.work += o.work || 0; state.club += o.club || 0;
  }
  state.calendar = buildCalendar(rng, 3);
  for (const div of ['개나리', '국화']) {
    state.npc[div] = {};
    for (const type of ['national', 'local']) {
      const top = type === 'national' ? 1200 : 520;
      const arr = [];
      for (let i = 0; i < 300; i++) arr.push(Math.round(top * Math.pow(i + 1, -0.72) * (0.85 + rng() * 0.3)));
      state.npc[div][type] = arr.sort((a, b) => b - a);
    }
  }
  rollFaces(state, rng);
  addMsg(state, 'coach', `${state.name} 님, 반가워요! 처음에는 제가 시키는 것만 해 봐요. 뭘 배울지는 치다 보면 알게 돼요.`);
  addMsg(state, 'hana', '나 이번에 테니스 시작했어! 우리 같이 대회도 나가 보자 😆');
  addMsg(state, 'system', '최종 목표: 개나리부 전국대회 우승으로 국화가 되고, 국화부에서 우승하기. 기간은 3년입니다.');
  return state;
}

export function save(state) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; } }
export function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? migrate(JSON.parse(s)) : null; } catch { return null; } }
function freshSpots() { return Object.fromEntries(TRAIN_SPOTS.map(id => [id, { lv: 1, n: 0 }])); }
// 칸이 생기기 전 저장을 지금 구조로 맞춘다
function migrate(s) {
  s.spots = { ...freshSpots(), ...(s.spots || {}) };
  s.lastSpot = s.lastSpot || 'lesson';
  s.faces = Object.fromEntries(TRAIN_SPOTS.map(id => { const f = s.faces?.[id]; return [id, Array.isArray(f) ? f : f ? [f] : []]; }));
  s.conds = s.conds || {};
  s.fam = s.fam || { surface: { hard: 45, turf: 15, clay: 10 }, opp: { moon: 10, slice: 10, power: 10, net: 10, wall: 10 } };
  s.skills = s.skills || {}; s.hints = s.hints || {}; s.hintAt = s.hintAt || {};
  s.growBig = s.growBig || {}; s.exp = s.exp || 0; s.fame = s.fame || 0; s.prizes = s.prizes || [];
  for (const t of s.calendar || []) if (!t.surface) t.surface = ['hard', 'turf', 'clay'][hashStr(t.id) % 3];
  if (s.yips > 0 && !s.conds.yips) s.conds.yips = 3;
  delete s.yips; delete s.moodNudge;
  return s;
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { } }

export function addMsg(state, from, text, extra = {}) {
  const m = { id: state.msgSeq++, from, week: state.week, text, read: false, ...extra };
  state.inbox.push(m);
  return m;
}
export function unread(state) { return state.inbox.filter(m => !m.read).length; }

// ── 능력치 요약 ───────────────────────────────────────────
export function groupAvg(stats, gid) { return avg(GROUP_BY_ID[gid].stats.map(([id]) => stats[id])); }
export function overall(stats) { return avg(ALL_STATS.map(id => stats[id])); }
export function mentalAvg(stats) { return groupAvg(stats, 'mental'); }
const bigIds = big => big.groups.flatMap(gid => GROUP_BY_ID[gid].stats.map(([id]) => id));
export function bigValues(stats) { return Object.fromEntries(BIG_STATS.map(b => [b.id, avg(bigIds(b).map(id => stats[id]))])); }

export function partnerStats(state, pid) {
  const def = PARTNER[pid], ps = state.partners[pid];
  return makeStats(mulberry32(hashStr(pid)), ps.level, def.bias, 5);
}

// ── 대회 찾기 ─────────────────────────────────────────────
export function tour(state, tid) { return state.calendar.find(t => t.id === tid); }
export function tournamentThisWeek(state) {
  const e = Object.entries(state.entries).find(([tid]) => tour(state, tid)?.week === state.week);
  return e ? { t: tour(state, e[0]), entry: e[1] } : null;
}
export function openTournament(state) { return state.calendar.find(t => t.week === state.week) || null; }
export function nextTournament(state) { return state.calendar.find(t => t.week > state.week) || null; }

// ── 이번 턴 행동 ──────────────────────────────────────────
// 처음엔 레슨·휴식·가족뿐이고, 이야기가 진행되면 늘어난다
export function visibleActions(state) { return ACTIONS.filter(a => a.id !== 'overtime' && (!a.unlock || state.unlocked[a.unlock])); }

// 사람들이 턴마다 칸에 무작위로 나타난다. 자기 특기 칸(spec)에 더 자주 온다. 안 나오는 턴도 있다.
const SHOW_RATE = 0.7;
function rollFaces(state, rng) {
  state.faces = Object.fromEntries(TRAIN_SPOTS.map(id => [id, []]));
  if (state.week < 3) return; // 첫 레슨은 혼자 받는다
  const open = visibleActions(state).filter(a => a.train).map(a => a.id);
  const wk = ((state.week - 1) % 52) + 1;
  for (const p of PARTNERS) {
    if (!state.partners[p.id].known || p.exams?.includes(wk)) continue;
    const present = rng() < SHOW_RATE;
    const spots = open.filter(id => p.spots[id]);
    const total = spots.reduce((a, id) => a + p.spots[id], 0);
    let x = rng() * total;
    if (!present || !spots.length) continue;
    const at = spots.find(id => (x -= p.spots[id]) < 0) || spots[0];
    state.faces[at].push(p.id);
  }
  rollHints(state, rng, open);
}
// ── 기술 ──────────────────────────────────────────────────
// 자연스럽게 알게 되거나, 누군가 가르쳐 준다. 힌트가 있으면 경험으로 배운다.
const HINT_MAX = 5;
const hintable = (state, list) => list.filter(id => (state.hints[id] || 0) < HINT_MAX);
export function skillLv(state, id) { return state.skills?.[id] || 0; }
export function skillPrice(state, id) {
  const lv = skillLv(state, id);
  return lv >= 2 ? null : Math.round(SKILL_PRICE[lv] * (1 - Math.min(0.4, Math.max(0, (state.hints[id] || 0) - 1) * 0.1)));
}
export function canBuySkill(state, id) { const lv = skillLv(state, id); return lv < 2 && (state.hints[id] || 0) >= lv + 1 && state.exp >= skillPrice(state, id); }
export function buySkill(state, id) { if (!canBuySkill(state, id)) return false; state.exp -= skillPrice(state, id); state.skills[id] = skillLv(state, id) + 1; return true; }
export function skillsKnown(state) { return Object.keys(SKILLS).some(id => (state.hints[id] || 0) > 0); }
// 이번 턴에 누가 뭔가 알려 줄 것 같은 칸. 첫 대회 뒤부터 나온다.
function rollHints(state, rng, open) {
  state.hintAt = {};
  if (!state.results.length) return;
  for (const id of open) {
    for (const pid of state.faces[id] || []) {
      const list = hintable(state, PARTNER[pid].teaches || []);
      if (list.length && rng() < 0.08 + state.partners[pid].aff / 500) { state.hintAt[id] = { skill: list[Math.floor(rng() * list.length)], who: pid }; break; }
    }
  }
  if (open.includes('lesson') && !state.hintAt.lesson && rng() < 0.1) {
    const list = hintable(state, Object.keys(SKILLS));
    if (list.length) state.hintAt.lesson = { skill: list[Math.floor(rng() * list.length)], who: 'coach' };
  }
}
const NATURAL = { practice: ['drop'], club: ['read', 'swing', 'smash'], stroke: ['drop'], net: ['smash', 'swing'], mental: ['read'] };
function naturalHint(state, id, topic, rng) {
  if (!state.results.length || !ACT[id].tennis || rng() >= 0.05) return null;
  const list = hintable(state, NATURAL[id] || NATURAL[topic] || []);
  return list.length ? { skill: list[Math.floor(rng() * list.length)], who: 'me' } : null;
}
function hintLine(skill, who) {
  const l = HINT_LINES[skill];
  return who === 'me' ? l.self : l.teach.replaceAll('{p}', who === 'coach' ? '코치' : PARTNER[who].name);
}
// 호흡이 맞는 사람이 자기 특기 칸에 와 있으면 그 칸의 훈련이 크게 곱해진다
export function hasBond(state, pid) { return state.partners[pid].aff >= BOND_AT; }
export function bondsAt(state, id) { return (state.faces[id] || []).filter(pid => PARTNER[pid].spec === id && hasBond(state, pid)); }
const CROWD_K = 0.08, BOND_K = 1.4, SPOT_K = 0.08, AFF_PER_TRAIN = 9;
export function spotLevel(state, id) { return state.spots[id]?.lv || 1; }
// 몸과 마음의 상태
export function hasCond(state, id) { return (state.conds?.[id] || 0) > 0; }
export function condList(state) { return Object.keys(CONDS).filter(id => hasCond(state, id)).map(id => ({ id, ...CONDS[id] })); }
export function clinicOpen(state) { return !!state.injury || hasCond(state, 'sore'); }
function condK(state) { return condList(state).reduce((a, c) => a * (c.k || 1), 1); }
function actionK(state, id) {
  const base = (1 + state.condition * 0.1) * (state.slump ? 0.5 : 1) * condK(state);
  if (!ACT[id].train) return base;
  return base * (1 + (state.faces[id] || []).length * CROWD_K) * BOND_K ** bondsAt(state, id).length * (1 + (spotLevel(state, id) - 1) * SPOT_K);
}
function isHeat(state) { const w = weekInfo(state.week).w; return w >= 21 && w <= 31; }
// 무리한 훈련은 실패할 수 있다. 체력이 55 아래로 내려가면(피로 45 위) 위험이 급하게 오른다. 첫 달은 실패하지 않는다.
export function failChance(state, a) {
  if (!a.risk || state.week < 9) return 0;
  const f = state.fatigue + (hasCond(state, 'sore') ? 10 : 0) - (hasCond(state, 'light') ? 10 : 0);
  return (f <= 45 ? 0 : Math.min(0.85, ((f - 45) / 35) ** 1.5 * 0.67)) * (1 - state.stats.flex / 200);
}
// 실패의 모습: 제대로 운동이 안 되거나, 멘탈이 흔들리거나, 입스가 오거나, 다친다
function rollFailKind(rng) { const x = rng(); return x < 0.4 ? 'flop' : x < 0.6 ? 'doubt' : x < 0.7 ? 'yips' : 'injury'; }
const INJURY_NAMES = ['테니스 엘보', '발목 염좌', '손목 통증', '종아리 근육 경련', '어깨 통증', '허리 통증', '무릎 통증'];
function applyFail(state, kind, rng, on, off) {
  if (kind === 'injury') {
    state.injury = { name: INJURY_NAMES[Math.floor(rng() * INJURY_NAMES.length)], weeks: 2 * (2 + Math.floor(rng() * 3)) };
    state.injuries++;
    state.pendingEvents.push({ id: 'injury' });
  }
  if (kind === 'doubt') { off('sure'); on('doubt'); }
  if (kind === 'yips') on('yips');
  state.condition = clamp(state.condition - 1, -2, 2);
  state.stress += 3;
}
// 코트에서 연습한 대로 나왔는지. 게임에서 더 잘 갈린다.
function rollFeel(state, id, rng) {
  const club = id === 'club';
  // 잘되다가도 안 되는 날이 온다: 기분이 좋을수록 안 나올 확률이 오른다
  const good = (club ? 0.3 : 0.2) - state.condition * 0.02;
  const bad = (club ? 0.24 : 0.14) + Math.max(0, state.fatigue - 30) / 300 + state.condition * 0.03;
  const x = rng();
  return x < good ? 'good' : x < good + bad ? 'bad' : null;
}

// 코치가 정해 주는 레슨: 첫 턴들은 기본기, 이후엔 가장 약한 쪽
export function coachTopic(state) {
  if (state.lessonCount < 2) return 'stroke';
  if (state.lessonCount === 2) return 'serve';
  const b = bigValues(state.stats);
  const score = { stroke: b.stroke, net: b.net, serve: b.serve, physical: b.physical, mental: Math.min(b.mental, b.tactics) };
  return BASIC_LESSONS.reduce((x, y) => (score[y] < score[x] ? y : x));
}
// 행동의 기본 효과. 레슨은 배우는 내용을 따른다.
function effectOf(state, id, topic) {
  const a = ACT[id];
  if (id === 'lesson') {
    const l = LESSONS[topic];
    return { groups: l.groups, stats: l.stats || {}, fatigue: a.fatigue + (l.fatigue || 0), stress: a.stress + (l.stress || 0) };
  }
  return { groups: a.groups || {}, stats: a.stats || {}, fatigue: a.fatigue, stress: a.stress };
}
// 호흡이 맞으면: 뭘 할지 아니까 대처가 빠르고, 부담감이 줄어 편하게 친다
const BOND_COUNTER = 0.3, BOND_CALM = 0.6, BOND_STRESS = -3;
const CALM_STATS = ['clutch', 'composure', 'comm'];
// 능력치별 성장량: 기본 효과 + 같이 하는 사람이 주는 것 + 호흡
function growthPlan(state, id, fx) {
  const plan = {}, add = (sid, v) => { plan[sid] = (plan[sid] || 0) + v; };
  for (const [gid, amt] of Object.entries(fx.groups)) for (const [sid] of GROUP_BY_ID[gid].stats) add(sid, amt);
  for (const [sid, amt] of Object.entries(fx.stats)) add(sid, amt);
  for (const pid of state.faces[id] || []) for (const [sid, amt] of Object.entries(PARTNER[pid].gives)) add(sid, amt);
  const bonds = bondsAt(state, id).length;
  if (bonds) {
    for (const [sid] of GROUP_BY_ID.counter.stats) add(sid, BOND_COUNTER * bonds);
    for (const sid of CALM_STATS) add(sid, BOND_CALM * bonds);
  }
  return plan;
}
// 체력 소모: 코트는 여름에 더 힘들고, 칸 레벨이 오르면 더 힘들다
function fatigueOf(state, a, fx) {
  const lv = a.train && fx.fatigue > 2 ? (spotLevel(state, a.id) - 1) * 1.5 : 0;
  return (fx.fatigue + lv) * (a.tennis && fx.fatigue > 0 && isHeat(state) ? 1.3 : 1);
}

// 버튼에 보여 줄 예상치
export function previewAction(state, id, topic) {
  const a = ACT[id], t = id === 'lesson' ? topic || coachTopic(state) : null;
  const fx = effectOf(state, id, t), K = actionK(state, id), plan = growthPlan(state, id, fx), gains = [];
  for (const big of BIG_STATS) {
    let sum = 0;
    for (const sid of bigIds(big)) if (plan[sid]) sum += GROWTH * plan[sid] * K * growRate(state, sid) * (1 - state.stats[sid] / 160);
    if (sum > 0) gains.push([big.id, sum / bigIds(big).length]);
  }
  gains.sort((x, y) => y[1] - x[1]);
  return { gains, topic: t, fail: failChance(state, a), fatigue: fatigueOf(state, a, fx), stress: fx.stress + BOND_STRESS * bondsAt(state, id).length };
}

// 시작할 때 답한 프로필에 따라 잘 늘어나는 쪽이 있다
function growRate(state, sid) { return state.growBig?.[STAT_BIG[sid]] || 1; }
function growStat(state, sid, amt, K, rng) {
  const v = state.stats[sid];
  state.stats[sid] = clamp(v + GROWTH * amt * K * growRate(state, sid) * (1 - v / 160) * (0.6 + rng() * 0.8), 1, 99);
}
function growGroup(state, gid, amt, K, rng) { for (const [sid] of GROUP_BY_ID[gid].stats) growStat(state, sid, amt, K, rng); }

// 휴식 결과 뽑기. 첫 달에는 잠을 설치지 않는다.
function rollRest(state, rng) {
  let x = rng();
  const r = REST_RESULTS.find(o => (x -= o.rate) < 0) || REST_RESULTS[1];
  return r.id === 'poor' && state.week < 9 ? REST_RESULTS[1] : r;
}

function rollOuting(rng) {
  let x = rng();
  return OUTINGS.find(o => (x -= o.rate) < 0) || OUTINGS[1];
}
export function runWeek(state, id, topic) {
  const rng = rngOf(state);
  const a = ACT[id], force = state.force || {}; // force: 확인 링크에서 장면을 정해 보여 줄 때만 쓴다
  state.force = null;
  if (id === 'lesson') { topic = topic || coachTopic(state); state.lastTopic = topic; state.lessonCount++; state.coach += 1.5; }
  const fx = effectOf(state, id, topic);
  const cond0 = state.condition, condOn = [], condOff = [];
  const on = c => { if (!hasCond(state, c)) condOn.push(c); state.conds[c] = CONDS[c].turns; };
  const off = c => { if (hasCond(state, c)) { delete state.conds[c]; condOff.push(c); } };
  const log = { week: state.week, act: id, topic: id === 'lesson' ? topic : null, gains: {}, scene: null, mile: null, cond0, conds0: Object.keys(state.conds), injury0: state.injury?.name || null };
  if (id === 'rest') {
    const r = rollRest(state, rng);
    fx.fatigue = r.fatigue; fx.stress = r.stress;
    log.rest = r.id;
    state.condition = clamp(state.condition + r.mood, -2, 2);
    if (r.id === 'deep') on('light');
    if (r.id !== 'poor') off('sore');
  }
  if (id === 'family') {
    // 여행 가거나 놀러 가면 마음이 비워진다
    const o = OUTINGS.find(x => x.id === force.outing) || rollOuting(rng);
    fx.fatigue = o.fatigue; fx.stress = o.stress;
    log.outing = o.id;
    state.condition = clamp(state.condition + o.mood, -2, 2);
    off('doubt');
    if (o.id === 'trip') off('yips');
    else if (hasCond(state, 'yips')) state.conds.yips = Math.max(1, state.conds.yips - 2);
  }
  if (id === 'clinic') {
    off('sore');
    if (state.injury) { state.injury.weeks -= 4; if (state.injury.weeks <= 0) { log.healed = state.injury.name; state.injury = null; } }
  }
  // 무리하면 실패하고, 코트에서는 연습한 대로 나왔는지가 갈린다
  const fail = a.risk ? force.fail || (rng() < failChance(state, a) ? rollFailKind(rng) : null) : null;
  const feel = !fail && a.tennis && state.week >= 3 ? force.feel || rollFeel(state, id, rng) : null;
  const people = a.train ? [...(state.faces[id] || [])] : [], bonds = a.train && !fail ? bondsAt(state, id) : [];
  const lead = bonds[0] || people[0] || null;
  log.with = lead; log.people = people; log.bonds = bonds;
  // 기술 힌트: 칸에 와 있는 사람이 알려 주거나, 치다 보니 자연스럽게 알게 된다
  if (a.train && !fail) {
    const h = (force.hint && { skill: force.hint, who: 'me' }) || state.hintAt?.[id] || naturalHint(state, id, topic, rng);
    if (h) { state.hints[h.skill] = (state.hints[h.skill] || 0) + 1; log.hint = { ...h, line: hintLine(h.skill, h.who), first: state.hints[h.skill] === 1 }; }
  }
  // 경험: 대회 > 클럽 게임 > 레슨
  if (!fail && EXP_OF[id]) { state.exp += EXP_OF[id]; log.exp = EXP_OF[id]; }
  const before = bigValues(state.stats), f0 = state.fatigue, s0 = state.stress;
  const K = actionK(state, id) * (fail ? 0.3 : feel === 'good' ? 1.15 : feel === 'bad' ? 0.85 : 1), plan = growthPlan(state, id, fx);
  for (const [sid, amt] of Object.entries(plan)) growStat(state, sid, amt, K, rng);
  log.K = K; log.plan = plan;
  const fatigueNow = fatigueOf(state, a, fx);
  for (const pid of people) {
    const ps = state.partners[pid];
    ps.aff = clamp(ps.aff + AFF_PER_TRAIN, 0, 100); ps.combo = clamp(ps.combo + 2, 0, 100);
  }
  if (a.train && !fail) {
    state.lastSpot = id;
    const sp = state.spots[id];
    sp.n++;
    if (sp.n % SPOT_USES_PER_LV === 0 && sp.lv < SPOT_MAX_LV) { sp.lv++; log.spotUp = sp.lv; }
  }
  if (id === 'lesson' && topic === 'serve' && hasCond(state, 'yips')) { state.conds.yips -= 2; if (state.conds.yips <= 0) off('yips'); }
  if (fail) {
    log.fail = fail;
    log.failLine = FAIL_LINES[fail][Math.floor(rng() * FAIL_LINES[fail].length)];
    applyFail(state, fail, rng, on, off);
  }
  if (feel) {
    log.feel = feel;
    state.condition = clamp(state.condition + (feel === 'good' ? 1 : -1), -2, 2);
    if (feel === 'good') { if (hasCond(state, 'doubt')) off('doubt'); else if (rng() < 0.5) on('sure'); }
    else if (hasCond(state, 'sure')) { off('sure'); on('doubt'); } // 어제는 되는 줄 알았는데
    else if (rng() < 0.3) on('doubt');
  }
  state.fatigue += fatigueNow - 3;
  state.stress += fx.stress + BOND_STRESS * bonds.length + 4; // 4는 회사 생활
  state.work += a.work || 0;
  state.overtime = false;
  if (a.tennis) state.club += id === 'club' ? 1 : 0.25;
  // 치던 코트는 더 익숙해지고, 클럽 게임에서는 여러 공을 겪는다
  if (a.tennis) addFam(state, 'surface', HOME_SURFACE, 1);
  if (id === 'club') addFam(state, 'opp', OPP_ARCH[Math.floor(rng() * OPP_ARCH.length)].id, 2);
  if (id === 'club' && rng() < 0.3) meetCheck(state, rng() < 0.5 ? 'club' : 'bungae', rng);
  if (id === 'rest' && state.injury) state.injury.weeks -= WEEKS_PER_TURN;
  clampStatus(state);
  const after = bigValues(state.stats);
  for (const b of BIG_STATS) { const g = after[b.id] - before[b.id]; if (g >= 0.05) log.gains[b.id] = g; }
  log.fatigue = state.fatigue - f0; log.stress = state.stress - s0;
  log.mood = state.condition - cond0;
  log.condOn = condOn; log.condOff = condOff;
  if (feel) { const l = FEEL_LINES[id][feel]; log.scene = { who: 'me', text: l[Math.floor(rng() * l.length)] }; }
  else if (!fail) log.scene = pickScene(state, id, log.topic, lead, after, rng, log.rest, log.outing);
  if (a.train && !fail) log.mile = checkMilestone(state, after, log.topic || a.mile);
  log.before = before; log.f0 = f0; log.s0 = s0;
  log.desc = pickDesc(state, id, log.topic, people, rng, log.outing);
  if (bonds.length) log.bondLine = BOND_TRAIN_LINES[Math.floor(rng() * BOND_TRAIN_LINES.length)].replaceAll('{p}', PARTNER[bonds[0]].name);
  if (!fail && !feel && !log.mile && state.week >= 3 && !SCENES.some(x => x.week === state.week && x.act === id)) log.choice = pickChoice(state, id, lead, rng, log.outing);
  state.weekLog = log;
  return log;
}
// 결과의 첫 단계: 상황 설명
function pickDesc(state, id, topic, people, rng, outing) {
  if (state.week === 1) return DESC_LINES.first[0];
  const a = ACT[id];
  const pool = outing ? DESC_OUTING[outing] : [...(DESC_LINES[id] || []), ...(a.tennis ? DESC_SEASON[weekInfo(state.week).quarter] || [] : [])];
  if (!pool.length) return '';
  const name = topic ? LESSONS[topic].name : '';
  const line = pool[Math.floor(rng() * pool.length)].replaceAll('{topic}', name);
  return people.length ? `${line} ${people.map(p => PARTNER[p].name).join(', ')}도 온다고 했다.` : line;
}
// 세 턴에 한 번쯤 선택이 끼어든다. 안 나온 것부터 나온다.
const CHOICE_RATE = 0.45;
function pickChoice(state, id, face, rng, outing) {
  if (rng() >= CHOICE_RATE) return null;
  const list = CHOICE_SCENES.filter(c => c.act === id && (!c.withFace || face) && (!c.outing || c.outing === outing));
  if (!list.length) return null;
  state.seenChoices = state.seenChoices || [];
  const fresh = list.filter(c => !state.seenChoices.includes(c.id));
  const pool = fresh.length ? fresh : list;
  const c = pool[Math.floor(rng() * pool.length)];
  state.seenChoices.push(c.id);
  if (state.seenChoices.length > 16) state.seenChoices.shift();
  const fill = s => s.replaceAll('{p}', face ? PARTNER[face].name : '');
  return { id: c.id, who: c.who === 'partner' ? face : c.who, prompt: fill(c.prompt), options: c.options.map(o => o.label) };
}
// 선택을 적용한다. 효과는 결과 단계에서 드러난다.
export function chooseScene(state, i) {
  const log = state.weekLog;
  if (!log?.choice || log.picked != null) return;
  const o = CHOICE_SCENES.find(c => c.id === log.choice.id).options[i], fx = o.fx || {};
  const rng = rngOf(state), face = log.with;
  if (fx.grow) for (const [sid, amt] of Object.entries(log.plan || {})) growStat(state, sid, amt * fx.grow, log.K || 1, rng);
  for (const k of ['fatigue', 'stress', 'confidence', 'coach', 'club', 'work']) state[k] += fx[k] || 0;
  if (face) {
    const ps = state.partners[face];
    ps.aff = clamp(ps.aff + (fx.aff || 0), 0, 100); ps.combo = clamp(ps.combo + (fx.combo || 0), 0, 100);
  }
  clampStatus(state);
  const after = bigValues(state.stats);
  log.gains = {};
  for (const b of BIG_STATS) { const g = after[b.id] - log.before[b.id]; if (g >= 0.05) log.gains[b.id] = g; }
  log.fatigue = state.fatigue - log.f0; log.stress = state.stress - log.s0;
  log.picked = i;
  log.reply = { who: o.who === 'partner' ? face : o.who || 'me', text: o.reply.replaceAll('{p}', face ? PARTNER[face].name : '') };
}
function clampStatus(state) {
  state.fatigue = clamp(state.fatigue, 0, 100); state.stress = clamp(state.stress, 0, 100);
  state.work = clamp(state.work, 0, 100); state.coach = clamp(state.coach, 0, 100); state.club = clamp(state.club, 0, 100);
  state.confidence = clamp(state.confidence, 0, 100);
}

// ── 장면 ──────────────────────────────────────────────────
const tierOf = v => (v < 30 ? 0 : v < 55 ? 1 : 2);
function sceneTier(id, topic, big) {
  if (id === 'club') return tierOf(big.tactics);
  if (id === 'practice' || !topic) return tierOf(big.stroke);
  const key = { stroke: 'stroke', net: 'net', serve: 'serve', physical: 'physical', mental: 'mental' }[topic];
  return key ? tierOf(big[key]) : tierOf(big.tactics);
}
function pickScene(state, id, topic, face, big, rng, sleep, outing) {
  const job = jobOf(state);
  if (id === 'overtime' && job && rng() < 0.6) return { who: 'me', text: job.overtime };
  const groupTopic = topic && LESSONS[topic]?.counter ? 'counter' : topic;
  const tier = sceneTier(id, topic, big);
  const fixed = SCENES.find(x => x.week === state.week && x.act === id);
  let list = fixed ? [fixed] : [];
  if (!list.length && face) list = SCENES.filter(x => x.act === id && x.withFace);
  if (!list.length) list = SCENES.filter(x => x.act === id && !x.week && !x.withFace && (x.tier === undefined || x.tier === tier) && (id !== 'lesson' || x.topic === groupTopic) && (x.sleep === undefined || x.sleep === sleep) && (x.outing === undefined || x.outing === outing));
  if (!list.length) return null;
  const fresh = list.filter(x => !state.seen.includes(SCENES.indexOf(x)));
  const pool = fresh.length ? fresh : list;
  const sc = pool[Math.floor(rng() * pool.length)];
  state.seen.push(SCENES.indexOf(sc));
  if (state.seen.length > 24) state.seen.shift();
  const pName = face ? PARTNER[face].name : '';
  return { who: sc.who === 'partner' ? face : sc.who, text: sc.text.replaceAll('{p}', pName).replaceAll('{topic}', topic ? LESSONS[topic].name.replace(' 대처', '') : '') };
}
function jobOf(state) { return PROFILE[0].options.find(o => o.id === state.job); }
function checkMilestone(state, big, topic) {
  const m = MILESTONES.find(x => !state.miles.includes(x.id) && (!x.topic || x.topic === topic) && x.when(state, big));
  if (!m) return null;
  state.miles.push(m.id);
  return { title: m.title, text: m.text };
}
// 이어지는 이야기: 한 턴에 하나만
// 사람별 이야기: 친밀도가 다음 단계에 닿으면 나온다
function personStory(state) {
  for (const p of PARTNERS) {
    const ps = state.partners[p.id], i = ps.storyStep || 0, step = PERSON_STORIES[p.id]?.[i];
    if (!ps.known || !step || ps.aff < step.at) continue;
    ps.storyStep = i + 1;
    state.pendingEvents.push({ id: 'bond', pid: p.id, step: i });
    return true;
  }
  return false;
}
function checkStories(state) {
  const big = bigValues(state.stats), o = overall(state.stats);
  const st = STORIES.find(x => !state.storiesDone.includes(x.id) && x.when(state, big, o));
  // 행동을 여는 이야기가 먼저다
  if (!st?.unlock && personStory(state)) return;
  if (!st) return;
  state.storiesDone.push(st.id);
  state.pendingEvents.push({ id: 'story', story: st.id });
}

function meetCheck(state, how, rng) {
  for (const p of PARTNERS) {
    const ps = state.partners[p.id];
    if (ps.known) continue;
    let ok = false;
    if (p.meet === how && how === 'club' && state.club >= 14) ok = true;
    if (p.meet === how && how === 'bungae') ok = true;
    if (p.meet === 'club2' && how === 'club' && state.club >= 40) ok = true;
    if (ok) {
      ps.known = true; ps.aff = 15;
      addMsg(state, p.id, `안녕하세요! ${how === 'club' ? '정모' : '번개'}에서 같이 쳤던 ${p.name}이에요. ${p.line}`);
      state.pendingEvents.push({ id: 'meet', pid: p.id });
      return;
    }
  }
}

// ── 깨달음: 경기에서 드러난 약점이 레슨 선택지가 된다 ──────
function learnFrom(state, me, tr) {
  if (state.flags.realizedWeek === state.week) return;
  const r = me.rec, cands = [];
  const weak = Object.entries(r.counter).filter(([, v]) => v.tot >= 3 && v.ok / v.tot < 0.75).sort((a, b) => a[1].ok / a[1].tot - b[1].ok / b[1].tot);
  for (const [c] of weak) cands.push(c);
  if (r.df >= 2) cands.push('serve');
  const volleyErr = (r.shots.fh_volley?.err || 0) + (r.shots.bh_volley?.err || 0) + (r.shots.low_volley?.err || 0);
  if (volleyErr >= 2) cands.push('net');
  if (me.gauge < 35) cands.push('mental');
  if (tr.matchIdx >= 3) cands.push('physical');
  if (r.errors > r.winners * 2) cands.push('stroke');
  const topic = cands.find(c => !state.lessons.includes(c));
  if (!topic) return;
  state.flags.realizedWeek = state.week;
  state.lessons.push(topic);
  state.pendingEvents.push({ id: 'realize', topic });
}

// ── 파트너 ────────────────────────────────────────────────
export function partnerAvailable(state, pid, week) {
  const def = PARTNER[pid], ps = state.partners[pid];
  if (!ps.known) return '모르는 사람';
  if (ps.div !== state.division) return ps.div === '국화' ? '국화라 개나리부에 못 나감' : '개나리라 국화부에 못 나감';
  const w = ((week - 1) % 52) + 1;
  if (def.exams && def.exams.includes(w)) return '시험 기간';
  return null;
}
export function acceptChance(state, pid, t) {
  if (!state.results.length && pid === 'hana') return 1; // 첫 대회는 입문 동기가 함께 나가 준다
  const ps = state.partners[pid];
  const me = overall(state.stats);
  let p = 0.4 + ps.aff / 170 + (me - ps.level) / 60 + state.club / 450 + (state.fame || 0) / 300;
  if (t.type === 'national') p += ps.level > me + 10 ? -0.08 : 0.06;
  return clamp(p, 0.05, 0.95);
}
// ── 낯선 환경 ─────────────────────────────────────────────
// 실력과 별개로, 내가 하던 환경과 다르면 잘 안 된다. 코트 재질과 상대의 공. 겪을수록 익숙해진다.
export function famOf(state, kind, id) { return state.fam[kind][id] ?? 0; }
function addFam(state, kind, id, n) { state.fam[kind][id] = clamp(famOf(state, kind, id) + n * (1 - famOf(state, kind, id) / 120), 0, 100); }
const famDelta = v => (v - 60) * 0.05; // 10이면 -2.5, 60이면 0, 100이면 +2
export function envOf(state, tr, opp) {
  return { surface: tr.surface, surfaceName: SURFACES[tr.surface], surfaceFam: famOf(state, 'surface', tr.surface), arch: opp.arch, archName: opp.archName, oppFam: famOf(state, 'opp', opp.arch) };
}
export function famStats() { return ['cross', 'positioning', 'shot_sel', 'analysis']; }
function applyEnv(state, tr, opp, stats) {
  const dS = famDelta(famOf(state, 'surface', tr.surface)) * 0.8, dO = famDelta(famOf(state, 'opp', opp.arch)) * 1.6;
  for (const sid of ALL_STATS) stats[sid] = clamp(stats[sid] + dS, 1, 99);
  for (const [sid] of GROUP_BY_ID.counter.stats) stats[sid] = clamp(stats[sid] + dO, 1, 99);
  for (const sid of famStats()) stats[sid] = clamp(stats[sid] + dO, 1, 99);
}
function register(state, t, pid) { state.entries[t.id] = { partner: pid }; }
// 이번 턴 대회에 지금 같이 나가자고 연락한다. 답은 바로 온다.
export function askPartner(state, tid, pid) {
  const rng = rngOf(state), t = tour(state, tid), ps = state.partners[pid];
  state.asked[pid] = state.week;
  if (rng() < acceptChance(state, pid, t)) {
    register(state, t, pid);
    addMsg(state, pid, `좋아요! ${t.name} 같이 나가요 🎾`);
    return { ok: true };
  }
  const lines = ['아 이번 주는 선약이 있어요 ㅠㅠ', '이번엔 다른 분이랑 나가기로 했어요. 다음에 해요!', '음… 다음에 하자. 실력 좀 더 늘면!'];
  const line = ps.level > overall(state.stats) + 12 ? lines[2] : lines[Math.floor(rng() * 2)];
  addMsg(state, pid, line);
  return { ok: false, line };
}
function genInvites(state, rng) {
  if (!state.results.length || state.pendingEvents.some(e => e.id === 'invite') || Object.keys(state.entries).some(tid => tour(state, tid)?.week >= state.week)) return;
  const me = overall(state.stats);
  const upcoming = state.calendar.filter(t => t.week > state.week && t.week <= state.week + 6);
  const recent = state.results.slice(-3).reduce((a, r) => a + (['W', 'F', 'SF'].includes(r.stage) ? 1 : 0), 0);
  for (const t of upcoming) for (const p of PARTNERS) {
    if (partnerAvailable(state, p.id, t.week)) continue;
    if (state.partners[p.id].level > me + 12 + (state.fame || 0) / 10) continue; // 한참 위 고수는 먼저 부르지 않는다. 이름이 알려지면 달라진다
    const key = `${t.id}:${p.id}`;
    if (state.invited.includes(key)) continue;
    const ps = state.partners[p.id];
    if (rng() < 0.6 * (0.04 + ps.aff / 700 + state.club / 600 + recent * 0.04) * (1 + (state.fame || 0) / 60)) {
      state.invited.push(key);
      state.pendingEvents.push({ id: 'invite', tid: t.id, pid: p.id });
      return;
    }
  }
}

// ── 목표 ──────────────────────────────────────────────────
export function currentGoal(state) {
  const g = GOALS[state.goalIdx];
  return g ? { ...g, left: g.by - state.week + 1 } : null;
}
function goalDone(state, id) {
  if (id === 'first') return state.results.length > 0;
  if (id === 'local_qf') return state.results.some(r => r.type === 'local' && ['QF', 'SF', 'F', 'W'].includes(r.stage));
  if (id === 'promote' || id === 'promote_late') return state.division === '국화';
  return state.titles.gukwhaLocal + state.titles.gukwhaNational > 0;
}
function checkGoals(state) {
  for (let g = GOALS[state.goalIdx]; g; g = GOALS[state.goalIdx]) {
    if (g.id === 'promote_late' && state.goalsDone.includes('promote')) { state.goalIdx++; continue; }
    if (goalDone(state, g.id)) {
      state.goalIdx++; state.goalsDone.push(g.id);
      state.confidence += 10; state.coach += 3;
      state.pendingEvents.push({ id: 'goal', goal: g.id });
    } else if (state.week + WEEKS_PER_TURN > g.by) {
      state.goalIdx++;
      if (state.week + WEEKS_PER_TURN <= TOTAL_WEEKS) state.pendingEvents.push({ id: 'goalMiss', goal: g.id });
    } else return;
  }
}

// ── 턴 마감 ───────────────────────────────────────────────
export function endWeek(state) {
  const rng = rngOf(state);
  // 부상
  if (state.injury) { state.injury.weeks -= WEEKS_PER_TURN; if (state.injury.weeks <= 0) { state.injury = null; addMsg(state, 'system', '부상이 나았다. 다시 테니스를 칠 수 있다.'); } }
  const mAvg = mentalAvg(state.stats);
  const wasSlump = state.slump;
  state.slump = state.stress > 45 + mAvg / 2;
  if (state.slump && !wasSlump) state.pendingEvents.push({ id: 'slump' });
  if (state.stress >= 85) state.highStressWeeks += WEEKS_PER_TURN;
  // 기분은 쌓인다. 피로와 스트레스가 깎고, 아주 좋거나 나쁜 기분은 시간이 지나면 보통으로 돌아온다.
  let c = state.condition;
  if (state.stress > 70 && rng() < 0.5) c--;
  else if (state.fatigue > 70 && rng() < 0.4) c--;
  else if (c > 0 && rng() < 0.2) c--;
  else if (c < 0 && rng() < 0.25) c++;
  state.condition = clamp(c, -2, 2);
  // 상태는 턴이 지나면 풀린다
  for (const id of Object.keys(state.conds)) { state.conds[id]--; if (state.conds[id] <= 0) delete state.conds[id]; }
  state.confidence += (50 - state.confidence) * 0.1;
  // 파트너 성장
  for (const p of PARTNERS) state.partners[p.id].level = clamp(state.partners[p.id].level + p.growth * WEEKS_PER_TURN, 1, 95);
  // 승진 심사
  if ([25, 77, 129].includes(state.week)) state.pendingEvents.push({ id: 'promo' });
  // 코치 비기
  for (const s of COACH_SECRETS) if (state.coach >= s.at && !state.secretsGot.includes(s.id)) { state.pendingEvents.push({ id: 'secret', secret: s.id }); break; }
  // 라이벌 이적생
  if (state.flags.rivalMetWeek && !state.partners.arah.known && state.week >= state.flags.rivalMetWeek + 6 && state.division === '개나리') {
    state.partners.arah.known = true; state.partners.arah.aff = 20;
    addMsg(state, 'arah', `${PARTNER.arah.line} 그 팀 나왔어. 당신 경기 봤거든.`);
    state.pendingEvents.push({ id: 'meet', pid: 'arah' });
  }
  if (state.division === '국화' && !state.partners.yujin.known) { state.partners.yujin.known = true; state.partners.yujin.aff = 15; addMsg(state, 'yujin', '국화 된 거 축하해요. 언제 한번 같이 나가요.'); state.pendingEvents.push({ id: 'meet', pid: 'yujin' }); }
  if (state.division === '국화' && !state.partners.mikyung.known && state.club >= 25) { state.partners.mikyung.known = true; state.partners.mikyung.aff = 20; addMsg(state, 'mikyung', '정모에서 봤어요. 국화부 같이 나가 볼래요?'); state.pendingEvents.push({ id: 'meet', pid: 'mikyung' }); }
  checkGoals(state);
  clampStatus(state);

  state.week += WEEKS_PER_TURN;
  if (state.week > TOTAL_WEEKS) { state.ending = evaluateEnding(state); return; }
  const nwi = weekInfo(state.week);
  if (nwi.w === 21) addMsg(state, 'system', '폭염 주의. 여름 동안 테니스 훈련의 피로가 30% 늘어난다.');
  // 2년차부터는 뭘 배울지 직접 고를 수 있다
  if (state.week >= 53 && BASIC_LESSONS.some(t => !state.lessons.includes(t))) {
    for (const t of BASIC_LESSONS) if (!state.lessons.includes(t)) state.lessons.push(t);
    state.pendingEvents.push({ id: 'lessonsOpen' });
  }
  // 부상 중이면 잡아 둔 대회는 기권
  const tw = tournamentThisWeek(state);
  if (tw && state.injury) {
    state.partners[tw.entry.partner].aff = clamp(state.partners[tw.entry.partner].aff - 3, 0, 100);
    delete state.entries[tw.t.id];
    state.pendingEvents.push({ id: 'withdraw', tname: tw.t.name, pid: tw.entry.partner });
  }
  checkStories(state);
  rollFaces(state, rng);
  genInvites(state, rng);
  rollEvents(state, rng);
  save(state);
}

// ── 이벤트 ────────────────────────────────────────────────
function rollEvents(state, rng) {
  const wi = weekInfo(state.week);
  const tw = tournamentThisWeek(state);
  // 첫 달은 레슨과 첫 대회 이야기에 집중한다
  if (state.week > 8) {
    if (rng() < 0.08 && !tw) state.pendingEvents.push({ id: 'deadline' });
    else if (rng() < 0.12) state.pendingEvents.push({ id: 'dinner' });
  }
  if (!state.flags.boss && state.work >= 55 && state.week > 8 && rng() < 0.1) state.pendingEvents.push({ id: 'boss' });
  // 몸이 안 좋을 때 잘 치는 사람이 같이 치자고 부른다
  if (state.week > 8 && !tw && !state.overtime && !state.injury && state.fatigue >= 45 && rng() < 0.2) {
    const me = overall(state.stats), list = PARTNERS.filter(p => state.partners[p.id].known && state.partners[p.id].level >= me - 5);
    if (list.length) state.pendingEvents.push({ id: 'callout', pid: list[Math.floor(rng() * list.length)].id });
  }
  if (tw && rng() < 0.15) state.pendingEvents.push({ id: 'string' });
  if (tw && rng() < 0.04) state.pendingEvents.push({ id: 'wedding' });
  if (!state.flags.secretary && state.club >= 30 && rng() < 0.15) state.pendingEvents.push({ id: 'secretary' });
  if (state.week === 81 && !state.flags.coachMove) state.pendingEvents.push({ id: 'coachMove' });
  if (state.flags.secretary && wi.w % 8 === 1) state.fatigue = clamp(state.fatigue + 5, 0, 100);
}

export function eventView(state, ev) {
  const P = PARTNER;
  switch (ev.id) {
    case 'deadline': return { who: 'boss', title: '프로젝트 마감', text: jobOf(state)?.deadline || '팀장: "이번 주는 다들 남아 줘야겠어."', choices: [['accept', '남는다 (이번 턴은 야근만, 평판 +8)'], ['refuse', '빠진다 (평판 -8)']] };
    case 'dinner': return { who: 'boss', title: '회식 공지', text: '이번 주 회식이 잡혔다.', choices: [['accept', '참석한다 (평판 +3, 피로 +5)'], ['refuse', '빠진다 (평판 -3)']] };
    case 'boss': return { who: 'boss', title: '팀장님도 테니스를?', text: '팀장: "자네 테니스 친다며? 나도 주말에 좀 쳐."', choices: [['accept', '같이 랠리 하자고 한다 (평판 +6, 클럽 명성 +2)'], ['refuse', '정중히 넘긴다']] };
    case 'string': return { who: 'system', title: '스트링이 끊어졌다!', text: '대회를 앞두고 연습하다 스트링이 끊어졌다.', choices: [['accept', '바로 교체한다 (스트레스 +3)'], ['refuse', '예비 라켓으로 나간다 (대회 컨디션 -1)']] };
    case 'wedding': return { who: 'system', title: '친구 결혼식', text: '대회 날, 오랜 친구의 결혼식이 겹쳤다.', choices: [['accept', '결혼식에 간다 (대회 기권, 파트너 친밀도 -6, 스트레스 -10)'], ['refuse', '대회에 나간다 (스트레스 +6)']] };
    case 'secretary': return { who: 'club', title: '클럽 총무 제안', text: '회장님: "총무 좀 맡아 줄 수 있어요?"', choices: [['accept', '맡는다 (클럽 명성 +10, 가끔 피로 +5)'], ['refuse', '사양한다']] };
    case 'coachMove': return { who: 'coach', title: '코치님 이직', text: '코치: "저 다른 클럽으로 옮겨요. 좀 멀어지는데… 따라올래요?"', choices: [['accept', '따라간다 (코치 신뢰 유지, 스트레스 +5)'], ['refuse', '새 코치를 찾는다 (코치 신뢰 20으로)']] };
    case 'promo': { const ok = state.work >= 65; return { who: 'boss', title: '승진 심사', text: ok ? '평판이 좋았다. 승진! (자신감 +5)' : '이번 승진 심사는 아쉽게 떨어졌다.', choices: [['ok', '확인']] }; }
    case 'injury': return { who: 'system', title: `부상: ${state.injury?.name || ''}`, text: `${state.injury?.weeks || 0}주 동안 테니스를 못 한다. 쉬면 빨리 낫는다.`, choices: [['ok', '확인']] };
    case 'slump': return { who: 'coach', title: '슬럼프', text: '코치: "요즘 공이 안 맞죠? 스트레스가 너무 쌓였어요. 좀 쉬어요." (훈련 효과 절반)', choices: [['ok', '확인']] };
    case 'secret': { const s = COACH_SECRETS.find(x => x.id === ev.secret); return { who: 'coach', title: `코치 비기: ${s.name}`, text: `코치: "${s.text}" (대회 세부 작전에 '${s.name}' 추가)`, choices: [['ok', '배운다']] }; }
    case 'promotion': return { who: 'system', title: '🌼 국화 승급!', text: `개나리부 전국대회 우승! 이제 ${state.name} 님은 국화입니다. 앞으로는 국화부 대회에만 나갑니다.`, choices: [['ok', '좋아!']] };
    case 'rival': return { who: 'arah', title: '라이벌 등장', text: `${P.arah.name}: "${ev.text || '다음엔 안 봐줘.'}"`, choices: [['ok', '…두고 보자']] };
    case 'invite': {
      const t = tour(state, ev.tid), p = P[ev.pid];
      const seen = ev.after ? `${ev.after.name} ${STAGE_NAME[ev.after.stage]} 봤어요! ` : '';
      return { who: ev.pid, title: `${p.name}의 대회 초대`, text: `"${seen}${weekInfo(t.week).label.split(' · ')[1]} ${t.name}(${t.type === 'national' ? '전국대회' : '비전국대회'}) ${state.division}부 같이 나갈래요?"`, choices: [['accept', '같이 나간다'], ['refuse', '이번엔 거절한다']] };
    }
    case 'meet': return { who: ev.pid, title: '새로운 인연', text: `${P[ev.pid].name} (${P[ev.pid].arch}): "${P[ev.pid].line}"`, choices: [['ok', '반가워요']] };
    case 'withdraw': return { who: ev.pid, title: '대회 기권', text: `부상으로 ${ev.tname}에 못 나간다고 ${P[ev.pid].name}에게 연락했다. (친밀도 -3)`, choices: [['ok', '확인']] };
    case 'goal': { const g = GOALS.find(x => x.id === ev.goal); return { who: 'coach', title: '목표 달성!', text: `코치: "${g.text}, 해냈어요!" (자신감 +10, 코치 신뢰 +3)`, choices: [['ok', '좋아!']] }; }
    case 'goalMiss': { const g = GOALS.find(x => x.id === ev.goal); return { who: 'coach', title: '목표를 놓쳤다', text: `코치: "이번 목표(${g.text})는 아쉬웠어요. 괜찮아요, 다음 목표로 가요."`, choices: [['ok', '다시 해 보자']] }; }
    case 'story': { const st = STORIES.find(x => x.id === ev.story); return { who: st.who, title: st.title, text: st.text + (st.note ? ` (${st.note})` : ''), choices: [['ok', st.ok]] }; }
    case 'hint': return { who: 'me', title: `기술 힌트: ${SKILLS[ev.skill].name}`, text: `${hintLine(ev.skill, 'me')} (기술 버튼에서 경험으로 배울 수 있다)`, choices: [['ok', '다음에 또 해 봐야지']] };
    case 'callout': return { who: ev.pid, title: '번개 연락', text: `${P[ev.pid].name}: "오늘 한 게임 어때요? 한 자리 비어요." 몸이 좀 무겁긴 한데.`, choices: [['accept', '나간다'], ['refuse', '오늘은 못 나가요']] };
    case 'yipsOn': return { who: 'coach', title: '입스가 왔다', text: '코치: "서브 토스가 안 떨어지죠? 누구나 한 번은 와요. 서브 레슨으로 천천히 풀어요. 머리를 비우는 것도 좋아요."', choices: [['ok', '네…']] };
    case 'bond': { const st = PERSON_STORIES[ev.pid][ev.step], full = st.at >= BOND_AT; return { who: ev.pid, title: full ? '호흡이 맞기 시작했다' : '조금 가까워졌다', text: st.text + (full ? ' (같이 훈련하면 훨씬 잘 늘고, 같이 대회에 나가면 편하게 친다)' : ''), choices: [['ok', st.ok]] }; }
    case 'realize': return { who: 'coach', title: '깨달음', text: `${REALIZE_LINES[ev.topic]} (레슨 선택지 추가: ${LESSONS[ev.topic].name})`, choices: [['ok', '배워 볼게요']] };
    case 'lessonsOpen': return { who: 'coach', title: '코치의 말', text: '코치: "이제 뭘 배울지 스스로 알겠죠? 레슨 내용은 직접 골라 봐요."', choices: [['ok', '네!']] };
    default: return { who: 'system', title: '알림', text: '', choices: [['ok', '확인']] };
  }
}

export function resolveEvent(state, ev, choice) {
  const yes = choice === 'accept';
  switch (ev.id) {
    case 'callout': {
      const rng = rngOf(state), ps = state.partners[ev.pid];
      if (!yes) { ps.aff = clamp(ps.aff - 1, 0, 100); state.eventNote = '아쉬운 답장이 왔다. 그래도 몸이 먼저다.'; break; }
      ps.aff = clamp(ps.aff + 3, 0, 100); state.fatigue += 8;
      if (rng() < failChance(state, ACT.club)) {
        const kind = rollFailKind(rng), on = c => { state.conds[c] = CONDS[c].turns; }, off = c => { delete state.conds[c]; };
        applyFail(state, kind, rng, on, off);
        state.eventNote = FAIL_LINES[kind][Math.floor(rng() * FAIL_LINES[kind].length)];
      } else {
        const fx = effectOf(state, 'club');
        for (const [sid, amt] of Object.entries(growthPlan(state, 'club', fx))) growStat(state, sid, amt * 0.5, 1, rng);
        state.eventNote = '힘들었지만 나오길 잘했다. 잘 치는 사람과 치면 확실히 다르다.';
      }
      break;
    }
    case 'deadline': if (yes) { state.overtime = true; state.work += 8; } else state.work -= 8; break;
    case 'dinner': if (yes) { state.work += 3; state.fatigue += 5; } else state.work -= 3; break;
    case 'boss': state.flags.boss = true; if (yes) { state.work += 6; state.club += 2; state.fatigue += 5; } break;
    case 'string': if (yes) state.stress += 3; else state.flags.spareRacket = true; break;
    case 'wedding': {
      const tw = tournamentThisWeek(state);
      if (yes && tw) { state.partners[tw.entry.partner].aff -= 6; delete state.entries[tw.t.id]; state.stress -= 10; }
      else state.stress += 6;
      break;
    }
    case 'secretary': state.flags.secretary = yes; if (yes) state.club += 10; break;
    case 'coachMove': state.flags.coachMove = true; if (yes) state.stress += 5; else state.coach = 20; break;
    case 'promo': if (state.work >= 65) state.confidence += 5; break;
    case 'secret': {
      const s = COACH_SECRETS.find(x => x.id === ev.secret);
      state.secretsGot.push(s.id);
      state.unlocks.push(s.unlock);
      for (const [k, v] of Object.entries(s.stats)) state.stats[k] = clamp(state.stats[k] + v, 1, 99);
      break;
    }
    case 'invite': {
      const t = tour(state, ev.tid), ps = state.partners[ev.pid];
      if (yes) { register(state, t, ev.pid); ps.aff = clamp(ps.aff + 3, 0, 100); ps.declines = 0; addMsg(state, ev.pid, '오예! 접수할게요. 그날 봐요 💪'); }
      else { ps.declines++; ps.aff = clamp(ps.aff - (ps.declines >= 2 ? 8 : 3), 0, 100); addMsg(state, ev.pid, ps.declines >= 2 ? '…알겠어요. 바쁘신가 봐요.' : '앗 아쉽다. 다음에 같이 나가요!'); }
      break;
    }
    case 'story': {
      const st = STORIES.find(x => x.id === ev.story);
      if (st.unlock) { state.unlocked[st.unlock] = true; rollFaces(state, rngOf(state)); }
      for (const [pid, v] of Object.entries(st.aff || {})) state.partners[pid].aff = clamp(state.partners[pid].aff + v, 0, 100);
      if (st.club) state.club += st.club;
      break;
    }
    default: break;
  }
  clampStatus(state);
}

// ── 랭킹 ─────────────────────────────────────────────────
export function myPoints(state, div, type, week = state.week) {
  return state.points[div][type].filter(e => e.week > week - 52).reduce((a, e) => a + e.pts, 0);
}
export function rankOf(state, div, type, pts) {
  const arr = state.npc[div][type];
  let r = 1; for (const v of arr) if (v > pts) r++;
  return pts > 0 ? r : null;
}
export function partnerPoints(state, pid, type) {
  const ps = state.partners[pid];
  const base = ps.div === '국화' ? 50 : 30;
  const q = clamp((ps.level - base) / 35, 0, 0.98);
  const arr = state.npc[ps.div][type];
  return arr[Math.floor((1 - q) * (arr.length - 1))];
}
export function teamSeed(state, t, pid) {
  const mine = myPoints(state, state.division, t.type);
  const pp = partnerPoints(state, pid, t.type);
  const r = rankOf(state, state.division, t.type, (mine + pp) / 2) || 999;
  const seeds = t.type === 'national' ? 16 : 8;
  return r <= seeds ? r : null;
}

// ── 대회 ─────────────────────────────────────────────────
export function startTournament(state, tid) {
  const rng = rngOf(state);
  const t = tour(state, tid), e = state.entries[tid];
  state.stress += 4; // 대회 주에도 회사는 간다
  state.overtime = false;
  const seed = teamSeed(state, t, e.partner);
  // 입문기: 1년차 상반기 상대는 약하게 시작해 26주에 걸쳐 원래 수준으로 오른다
  const ramp = state.division === '개나리' ? clamp((26 - state.week) / 26, 0, 1) * 11 : 0;
  const mu = (state.division === '국화' ? 63 : 37) + (t.type === 'national' ? (state.division === '국화' ? 3 : 1) : -3) - ramp;
  const bye = seed !== null && seed <= 2;
  const mk = (rating) => {
    const club = CLUB_NAMES[Math.floor(rng() * CLUB_NAMES.length)];
    const arch = OPP_ARCH[Math.floor(rng() * OPP_ARCH.length)];
    return { names: [randomName(rng), randomName(rng)], rating: Math.round(rating), club, arch: arch.id, archName: arch.name, seed: rng() * 1e9 >>> 0 };
  };
  // 예선 2경기에서 1승 이상이면 본선. 본선 상대는 결승에 가까울수록 강하다.
  const groupOpps = bye ? [] : [mk(mu - 3 + gauss(rng) * 6 - (seed ? 3 : 0)), mk(mu - 3 + gauss(rng) * 6 - (seed ? 3 : 0))];
  const koRounds = Math.log2(t.draw);
  const ko = [];
  for (let r = 0; r < koRounds; r++) ko.push(mk(Math.max(mu - 6, mu + 7 - 2.5 * (koRounds - r - 1)) + gauss(rng) * 5 + (seed && r === 0 ? -3 : 0)));
  const tr = {
    tid, name: t.name, type: t.type, surface: t.surface || HOME_SURFACE, div: state.division, partner: e.partner, seed, bye, draw: t.draw,
    group: { opps: groupOpps, results: [] }, ko, koRound: 0, koRounds,
    stage: bye ? 'ko' : 'group', matchIdx: 0, finished: false, final: null, log: [],
  };
  if (state.flags.spareRacket) { tr.spare = true; state.flags.spareRacket = false; }
  state.tournament = tr;
  return tr;
}
export function currentOpponent(tr) {
  if (tr.finished) return null;
  if (tr.stage === 'group') return tr.group.opps[tr.group.results.length];
  return tr.ko[tr.koRound];
}
export function stageLabel(tr) {
  if (tr.stage === 'group') return `예선 ${tr.group.results.length + 1}경기`;
  const left = tr.koRounds - tr.koRound;
  return left === 1 ? '결승' : `${2 ** left}강`;
}
// 8강 전까지 본선은 결과만 보여 준다
export function isAutoRound(tr) { return !tr.finished && tr.stage === 'ko' && tr.koRounds - tr.koRound > 3; }
export function startFatigue(state, tr) { return [Math.min(8, tr.matchIdx * 1.2) + state.fatigue / 20, Math.min(8, tr.matchIdx)]; }
export function playAutoMatch(state, tr) {
  const { human, npc } = buildTeams(state, tr);
  const sim = new MatchSim(human, npc, { startFatigue: startFatigue(state, tr) });
  quickMatch(sim, () => { sim.teams[1].choices = aiChoices(sim, 1); });
  recordMatch(state, tr, sim, true);
  return sim;
}
export function buildTeams(state, tr) {
  const opp = currentOpponent(tr);
  const rng = mulberry32(opp.seed);
  const npc = makeNpcTeam(rng, opp.rating, opp.names, opp.arch);
  npc.players.forEach(p => { p.club = opp.club; });
  const cond = state.condition - (tr.spare ? 1 : 0);
  const me = { id: 'me', name: state.name, stats: { ...state.stats }, conf: state.confidence, condition: cond, skills: { ...(state.skills || {}) } };
  applyEnv(state, tr, opp, me.stats);
  if (hasCond(state, 'yips')) me.stats.second_serve = Math.max(5, me.stats.second_serve - 8);
  if (hasCond(state, 'sure')) me.conf = Math.min(100, me.conf + 6);
  if (hasCond(state, 'doubt')) me.conf = Math.max(0, me.conf - 8);
  const ps = state.partners[tr.partner];
  // 호흡이 맞는 사람과 나가면 뭘 할지 아니까 대처가 빠르고, 부담감이 줄어 편하게 친다
  if (hasBond(state, tr.partner)) {
    for (const [sid] of GROUP_BY_ID.counter.stats) me.stats[sid] = Math.min(99, me.stats[sid] + 4);
    for (const sid of ['clutch', 'composure']) me.stats[sid] = Math.min(99, me.stats[sid] + 6);
    for (const sid of ['cover', 'comm']) me.stats[sid] = Math.min(99, me.stats[sid] + 4);
    me.conf = Math.min(100, me.conf + 10);
  }
  const partner = { id: tr.partner, name: PARTNER[tr.partner].name, stats: partnerStats(state, tr.partner), conf: 45 + ps.aff / 5, condition: 0 };
  const human = { players: [me, partner], combo: ps.combo, isHuman: true, choices: { ...(state.choices || {}) } };
  return { human, npc, opp };
}
export function recordMatch(state, tr, sim, auto = false) {
  const won = sim.winner === 0;
  const opp = currentOpponent(tr);
  const me = sim.P[0];
  addFam(state, 'surface', tr.surface, 6);
  addFam(state, 'opp', opp.arch, 8);
  tr.log.push({ stage: stageLabel(tr), opp: opp.names.join('·'), club: opp.club, arch: opp.archName, won, auto, games: [...sim.games] });
  if (me.rec.df >= 5) { if (!hasCond(state, 'yips')) state.pendingEvents.push({ id: 'yipsOn' }); state.conds.yips = CONDS.yips.turns; }
  if (won && !state.flags.firstWin) state.flags.firstWin = state.week;
  state.confidence = clamp(state.confidence + (won ? 6 : -3), 0, 100);
  const ps = state.partners[tr.partner];
  ps.combo = clamp(ps.combo + 2, 0, 100); ps.aff = clamp(ps.aff + (won ? 2 : 0), 0, 100);
  tr.matchIdx++;
  learnFrom(state, me, tr);
  if (tr.stage === 'group') {
    tr.group.results.push({ won });
    if (tr.group.results.length === 2) {
      if (tr.group.results.some(r => r.won)) tr.stage = 'ko'; else finishTournament(state, tr, 'G');
    }
  } else {
    if (!won) {
      const left = tr.koRounds - tr.koRound;
      finishTournament(state, tr, { 1: 'F', 2: 'SF', 3: 'QF', 4: 'R16', 5: 'R32', 6: 'R64', 7: 'R128' }[left]);
    } else {
      tr.koRound++;
      if (tr.koRound >= tr.koRounds) finishTournament(state, tr, 'W');
    }
  }
  if (!tr.finished && !state.flags.rivalMetWeek && tr.type === 'national' && state.division === '개나리') {
    state.flags.rivalMetWeek = state.week;
    state.pendingEvents.push({ id: 'rival', text: won ? '이번엔 운이 좋았네. 다음 대회에서 봐.' : '개나리치곤 괜찮네. 더 올라와.' });
  }
}
function finishTournament(state, tr, stage) {
  tr.finished = true; tr.final = stage;
  const pts = POINTS[tr.type][stage];
  state.points[tr.div][tr.type].push({ week: state.week, pts, tid: tr.tid });
  tr.pts = pts;
  tr.fatigue = Math.min(30, tr.matchIdx * 4);
  const lines = TOUR_LINES[stage];
  tr.scene = lines[state.results.length % lines.length].replaceAll('{p}', PARTNER[tr.partner].name);
  state.fatigue = clamp(state.fatigue + tr.fatigue, 0, 100);
  // 대회에서 연습한 대로 나왔는지가 기분과 마음에 남는다
  const moved = { W: 2, F: 2, SF: 1, QF: 1, G: -1 }[stage] || 0;
  state.condition = clamp(state.condition + moved, -2, 2);
  tr.moodLine = moved > 0 ? '연습한 게 통했다. 기분이 좋아졌다.' : moved < 0 ? '연습한 게 안 나왔다. 기분이 가라앉았다.' : '';
  if (moved > 0) { delete state.conds.doubt; state.conds.sure = CONDS.sure.turns; }
  if (moved < 0) { delete state.conds.sure; state.conds.doubt = CONDS.doubt.turns; }
  if (tr.matchIdx >= 4) state.conds.sore = CONDS.sore.turns;
  // 대회에서 남는 것: 경험, 인맥, 상품
  const rngP = rngOf(state), prizePool = PRIZES[stage] || PRIZES.rest, prize = prizePool[Math.floor(rngP() * prizePool.length)];
  const exp = TOUR_EXP[tr.type][stage] || 0, fame = TOUR_FAME[tr.type][stage] || 0;
  state.exp = (state.exp || 0) + exp; state.fame = (state.fame || 0) + fame;
  state.prizes.push({ name: prize, tname: tr.name, week: state.week, stage });
  tr.rewards = { exp, fame, prize };
  // 대회에서 본 공이 기술의 힌트가 되기도 한다
  if (tr.matchIdx >= 2 && rngP() < 0.25) {
    const list = hintable(state, Object.keys(SKILLS));
    if (list.length) { const sk = list[Math.floor(rngP() * list.length)]; state.hints[sk] = (state.hints[sk] || 0) + 1; state.pendingEvents.push({ id: 'hint', skill: sk }); }
  }
  // 입상하면 같이 나가고 싶어 하는 사람이 생긴다
  if (['W', 'F', 'SF', 'QF'].includes(stage) && !(stage === 'W' && tr.type === 'national' && tr.div === '개나리')) {
    const next = state.calendar.find(t => t.week > state.week && t.week <= state.week + 12);
    const fans = next ? PARTNERS.filter(p => p.id !== tr.partner && !partnerAvailable(state, p.id, next.week) && !state.invited.includes(`${next.id}:${p.id}`)) : [];
    if (fans.length) {
      const p = fans[Math.floor(rngP() * fans.length)];
      state.invited.push(`${next.id}:${p.id}`);
      state.pendingEvents.push({ id: 'invite', tid: next.id, pid: p.id, after: { name: tr.name, stage } });
    }
    // 모르던 사람이 먼저 연락해 오기도 한다
    const stranger = PARTNERS.find(p => !state.partners[p.id].known && (p.meet === 'club' || p.meet === 'bungae'));
    if (stranger && rngP() < 0.5) {
      const ps2 = state.partners[stranger.id];
      ps2.known = true; ps2.aff = 15;
      addMsg(state, stranger.id, `대회에서 봤어요! ${stranger.name}이에요. ${stranger.line}`);
      state.pendingEvents.push({ id: 'meet', pid: stranger.id });
    }
  }
  state.stress = clamp(state.stress + (stage === 'W' ? -15 : stage === 'G' ? 6 : 0), 0, 100);
  state.club = clamp(state.club + (stage === 'W' ? 8 : stage === 'F' ? 5 : stage === 'SF' ? 3 : 1), 0, 100);
  // 실전 경험
  const rng = rngOf(state);
  for (const gid of ['mental', 'tactics', 'counter']) growGroup(state, gid, Math.min(0.2, 0.05 * tr.matchIdx), 1, rng);
  const ps = state.partners[tr.partner];
  ps.combo = clamp(ps.combo + 3, 0, 100);
  state.results.push({ week: state.week, tid: tr.tid, name: tr.name, type: tr.type, div: tr.div, stage, partner: tr.partner });
  if (stage === 'W') {
    ps.wins++;
    if (tr.div === '개나리') { state.titles[tr.type]++; }
    else { state.titles[tr.type === 'national' ? 'gukwhaNational' : 'gukwhaLocal']++; }
    if (tr.type === 'national') ps.nationalWins++;
    if (tr.div === '개나리' && tr.type === 'national') {
      state.division = '국화'; state.promotedWeek = state.week;
      if (ps.div === '개나리') ps.div = '국화';
      // 남은 개나리부 접수 취소
      for (const tid of Object.keys(state.entries)) { const t = tour(state, tid); if (t.week > state.week) delete state.entries[tid]; }
      state.pendingEvents.push({ id: 'promotion' });
    }
  }
}

// ── 엔딩 ─────────────────────────────────────────────────
export function evaluateEnding(state) {
  const gN = state.titles.gukwhaNational, gAny = gN + state.titles.gukwhaLocal;
  const rank = rankOf(state, '국화', 'national', myPoints(state, '국화', 'national', TOTAL_WEEKS));
  const partnerEnd = PARTNERS.find(p => state.partners[p.id].aff >= 90 && state.partners[p.id].nationalWins >= 1 && state.partners[p.id].combo >= 88);
  const tact = groupAvg(state.stats, 'tactics');
  let id = 'love';
  if (gN >= 1 && rank === 1) id = 'queen';
  else if (gAny >= 1) id = 'gukwha_champ';
  else if (partnerEnd) id = 'partner';
  else if (state.division === '국화') id = 'gukwha';
  else if (state.highStressWeeks >= 20) id = 'burnout';
  else if (state.injuries >= 3) id = 'injury';
  else if (state.coach >= 90 && tact >= 60) id = 'coach';
  else if (state.titles.local >= 3) id = 'local_hero';
  else if (state.club >= 90) id = 'club_head';
  else if (state.work >= 90) id = 'exec';
  else if (state.work >= 65 && overall(state.stats) >= 50) id = 'warrior';
  const e = ENDINGS.find(x => x.id === id);
  return { ...e, partner: partnerEnd ? PARTNER[partnerEnd.id].name : null };
}

// 확인 링크 전용: 대회를 바로 시작하거나 결과까지 건너뛴다
export function checkTour(state, type, stage, surface) {
  const t = state.calendar.find(x => x.type === type && x.week >= 9);
  state.week = t.week;
  if (surface) t.surface = surface;
  state.entries[t.id] = { partner: 'hana' };
  const tr = startTournament(state, t.id);
  if (stage) { tr.matchIdx = 4; tr.log.push({ stage: stage === 'G' ? '예선' : '결승', opp: '상대 팀', club: '', arch: '', won: stage === 'W', auto: true, games: stage === 'W' ? [6, 4] : [4, 6] }); finishTournament(state, tr, stage); }
  return tr;
}

export { STAGE_NAME, DAY_NAMES };
