// 육성 루프 — 2주 1턴 행동 선택, 깨달음과 레슨, 장면·이야기, 피로·부상, 파트너, 대회·랭킹·승급, 목표, 엔딩 (기획 문서 3·6·8·9·12장)
import {
  ALL_STATS, BIG_STATS, GROUP_BY_ID, ACT, ACTIONS, LESSONS, BASIC_LESSONS, PARTNERS, PARTNER, GOALS,
  OPP_ARCH, randomName, CLUB_NAMES, buildCalendar, POINTS, STAGE_NAME, weekInfo, COACH_SECRETS, ENDINGS, DAY_NAMES,
} from './data.js';
import { SCENES, MILESTONES, STORIES, REALIZE_LINES, TOUR_LINES } from './scenes.js';
import { MatchSim, quickMatch, aiChoices, makeStats, makeNpcTeam, mulberry32, gauss } from './sim.js';

export const TOTAL_WEEKS = 156;
export const WEEKS_PER_TURN = 2;
export const GROWTH = 9.5; // 행동 1회의 성장 속도 (tools/season.js 로 조정)
const SAVE_KEY = 'tennis-raising-save-v3';
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
export function newGame(name, background = 'none') {
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  const state = {
    v: 3, seed, rs: seed, name: name || '나', week: 1,
    fatigue: 10, stress: 15, confidence: 50, condition: 0,
    division: '개나리', work: 50, coach: 10, club: 5,
    stats: {}, faces: {}, overtime: false, injury: null, slump: false,
    unlocked: {}, lessons: [], lessonCount: 0, lastTopic: 'stroke', seen: [], miles: [], storiesDone: [],
    partners: {}, calendar: [], entries: {}, asked: {}, invited: [], inbox: [], msgSeq: 1,
    points: { 개나리: { national: [], local: [] }, 국화: { national: [], local: [] } }, npc: {},
    results: [], titles: { local: 0, national: 0, gukwhaLocal: 0, gukwhaNational: 0 },
    goalIdx: 0, goalsDone: [],
    injuries: 0, highStressWeeks: 0, flags: {}, unlocks: [], secretsGot: [], choices: null,
    pendingEvents: [], weekLog: null, ending: null, yips: 0,
  };
  const rng = rngOf(state);
  const bg = { none: {}, sport: { stamina: 8, speed: 6, power: 5, first_step: 5 }, badminton: { smash: 8, fh_volley: 5, first_step: 6, speed: 4 }, study: { analysis: 8, shot_sel: 6, focus: 6, composure: 4 } }[background] || {};
  for (const id of ALL_STATS) state.stats[id] = clamp(Math.round(14 + rng() * 10 + (bg[id] || 0)), 5, 40);
  for (const p of PARTNERS) state.partners[p.id] = { aff: p.aff, combo: 0, level: p.level, known: !!p.known, div: p.div, declines: 0, wins: 0, nationalWins: 0 };
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
export function load() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
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

// 연습과 클럽 게임에 함께할 사람이 턴마다 달라진다
function rollFaces(state, rng) {
  state.faces = {};
  const ks = PARTNERS.filter(p => !partnerAvailable(state, p.id, state.week));
  if (!ks.length) return;
  for (const id of ['practice', 'club']) if (rng() < 0.5) state.faces[id] = ks[Math.floor(rng() * ks.length)].id;
}
// 친밀도가 높을수록 같이 할 때 효과가 크다
export function faceBonus(state, pid) { return pid ? 1.15 + state.partners[pid].aff / 250 : 1; }
function actionK(state, id) {
  return (1 + state.condition * 0.08) * (state.slump ? 0.5 : 1) * faceBonus(state, state.faces[id]);
}
function isHeat(state) { const w = weekInfo(state.week).w; return w >= 21 && w <= 31; }
function injuryChance(state) { return state.week < 9 ? 0 : clamp((state.fatigue - 30) / 250, 0, 0.35) * (1 - state.stats.flex / 200); } // 첫 달은 다치지 않는다

// 코치가 정해 주는 레슨: 첫 턴들은 기본기, 이후엔 가장 약한 쪽
export function coachTopic(state) {
  if (state.lessonCount < 2) return 'stroke';
  if (state.lessonCount === 2) return 'serve';
  const b = bigValues(state.stats);
  const score = { stroke: b.stroke, net: b.net, serve: b.serve, physical: b.physical, mental: Math.min(b.mental, b.tactics) };
  return BASIC_LESSONS.reduce((x, y) => (score[y] < score[x] ? y : x));
}
// 행동의 실제 효과. 혼자 연습은 지난 레슨 복습이라 효과가 작다.
function effectOf(state, id, topic) {
  const a = ACT[id];
  if (id === 'lesson' || id === 'practice') {
    const l = LESSONS[id === 'lesson' ? topic : state.lastTopic], k = id === 'lesson' ? 1 : 0.6;
    const scale = o => Object.fromEntries(Object.entries(o || {}).map(([x, v]) => [x, v * k]));
    return { groups: scale(l.groups), stats: scale(l.stats), fatigue: a.fatigue + (id === 'lesson' ? l.fatigue || 0 : 0), stress: a.stress + (id === 'lesson' ? l.stress || 0 : 0) };
  }
  return { groups: a.groups || {}, stats: {}, fatigue: a.fatigue, stress: a.stress };
}
function fatigueOf(state, a, fx) { return fx.fatigue * (a.tennis && fx.fatigue > 0 && isHeat(state) ? 1.3 : 1); }

// 버튼에 보여 줄 예상치
export function previewAction(state, id, topic) {
  const a = ACT[id], t = id === 'lesson' ? topic || coachTopic(state) : null;
  const fx = effectOf(state, id, t), K = actionK(state, id), gains = [];
  for (const big of BIG_STATS) {
    let sum = 0;
    for (const gid of big.groups) {
      for (const [sid] of GROUP_BY_ID[gid].stats) {
        const amt = (fx.groups[gid] || 0) + (fx.stats[sid] || 0);
        if (amt) sum += GROWTH * amt * K * (1 - state.stats[sid] / 160);
      }
    }
    if (sum > 0) gains.push([big.id, sum / bigIds(big).length]);
  }
  gains.sort((x, y) => y[1] - x[1]);
  return { gains, topic: t, injury: a.tennis ? injuryChance(state) : 0, fatigue: fatigueOf(state, a, fx), stress: fx.stress };
}

function growStat(state, sid, amt, K, rng) {
  const v = state.stats[sid];
  state.stats[sid] = clamp(v + GROWTH * amt * K * (1 - v / 160) * (0.6 + rng() * 0.8), 1, 99);
}
function growGroup(state, gid, amt, K, rng) { for (const [sid] of GROUP_BY_ID[gid].stats) growStat(state, sid, amt, K, rng); }

export function runWeek(state, id, topic) {
  const rng = rngOf(state);
  const a = ACT[id];
  if (id === 'lesson') { topic = topic || coachTopic(state); state.lastTopic = topic; state.lessonCount++; state.coach += 1.5; }
  const fx = effectOf(state, id, topic);
  const log = { week: state.week, act: id, topic: id === 'lesson' ? topic : id === 'practice' ? state.lastTopic : null, gains: {}, with: null, scene: null, mile: null };
  const before = bigValues(state.stats), f0 = state.fatigue, s0 = state.stress;
  const K = actionK(state, id);
  for (const [gid, amt] of Object.entries(fx.groups)) growGroup(state, gid, amt, K, rng);
  for (const [sid, amt] of Object.entries(fx.stats)) growStat(state, sid, amt, K, rng);
  const face = state.faces[id];
  if (face) {
    const ps = state.partners[face];
    ps.aff = clamp(ps.aff + 3, 0, 100); ps.combo = clamp(ps.combo + 2, 0, 100);
    log.with = face;
  }
  if (a.tennis && rng() < injuryChance(state)) {
    const names = ['테니스 엘보', '발목 염좌', '손목 통증', '종아리 근육 경련', '어깨 통증'];
    state.injury = { name: names[Math.floor(rng() * names.length)], weeks: 2 * (1 + Math.floor(rng() * 3)) };
    state.injuries++;
    state.pendingEvents.push({ id: 'injury' });
  }
  state.fatigue += fatigueOf(state, a, fx) - 3;
  state.stress += fx.stress + 4; // 4는 회사 생활
  state.work += a.work || 0;
  state.overtime = false;
  if (a.tennis) state.club += id === 'club' ? 1 : 0.25;
  if (id === 'club' && rng() < 0.3) meetCheck(state, rng() < 0.5 ? 'club' : 'bungae', rng);
  if (id === 'rest' && state.injury) state.injury.weeks -= WEEKS_PER_TURN;
  clampStatus(state);
  const after = bigValues(state.stats);
  for (const b of BIG_STATS) { const g = after[b.id] - before[b.id]; if (g >= 0.05) log.gains[b.id] = g; }
  log.fatigue = state.fatigue - f0; log.stress = state.stress - s0;
  log.scene = pickScene(state, id, log.topic, face, after, rng);
  if (a.tennis) log.mile = checkMilestone(state, after, log.topic);
  state.weekLog = log;
  return log;
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
function pickScene(state, id, topic, face, big, rng) {
  const groupTopic = topic && LESSONS[topic]?.counter ? 'counter' : topic;
  const tier = sceneTier(id, topic, big);
  const fixed = SCENES.find(x => x.week === state.week && x.act === id);
  let list = fixed ? [fixed] : [];
  if (!list.length && face) list = SCENES.filter(x => x.act === id && x.withFace);
  if (!list.length) list = SCENES.filter(x => x.act === id && !x.week && !x.withFace && (x.tier === undefined || x.tier === tier) && (id !== 'lesson' || x.topic === groupTopic));
  if (!list.length) return null;
  const fresh = list.filter(x => !state.seen.includes(SCENES.indexOf(x)));
  const pool = fresh.length ? fresh : list;
  const sc = pool[Math.floor(rng() * pool.length)];
  state.seen.push(SCENES.indexOf(sc));
  if (state.seen.length > 24) state.seen.shift();
  const pName = face ? PARTNER[face].name : '';
  return { who: sc.who === 'partner' ? face : sc.who, text: sc.text.replaceAll('{p}', pName).replaceAll('{topic}', topic ? LESSONS[topic].name.replace(' 대처', '') : '') };
}
function checkMilestone(state, big, topic) {
  const m = MILESTONES.find(x => !state.miles.includes(x.id) && (!x.topic || x.topic === topic) && x.when(state, big));
  if (!m) return null;
  state.miles.push(m.id);
  return { title: m.title, text: m.text };
}
// 이어지는 이야기: 한 턴에 하나만
function checkStories(state) {
  const big = bigValues(state.stats), o = overall(state.stats);
  const st = STORIES.find(x => !state.storiesDone.includes(x.id) && x.when(state, big, o));
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
  let p = 0.4 + ps.aff / 170 + (me - ps.level) / 60 + state.club / 450;
  if (t.type === 'national') p += ps.level > me + 10 ? -0.08 : 0.06;
  return clamp(p, 0.05, 0.95);
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
  if (!state.results.length || Object.keys(state.entries).some(tid => tour(state, tid)?.week >= state.week)) return;
  const me = overall(state.stats);
  const upcoming = state.calendar.filter(t => t.week > state.week && t.week <= state.week + 6);
  const recent = state.results.slice(-3).reduce((a, r) => a + (['W', 'F', 'SF'].includes(r.stage) ? 1 : 0), 0);
  for (const t of upcoming) for (const p of PARTNERS) {
    if (partnerAvailable(state, p.id, t.week)) continue;
    if (state.partners[p.id].level > me + 12) continue; // 한참 위 고수는 먼저 부르지 않는다
    const key = `${t.id}:${p.id}`;
    if (state.invited.includes(key)) continue;
    const ps = state.partners[p.id];
    if (rng() < 0.6 * (0.04 + ps.aff / 700 + state.club / 600 + recent * 0.04)) {
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
  // 컨디션
  const c = Math.round(gauss(rng) * 0.8 + (state.fatigue < 40 ? 0.5 : 0) + (state.stress < 30 ? 0.5 : 0) - (state.fatigue > 70 ? 1 : 0) - (state.stress > 70 ? 1 : 0));
  state.condition = clamp(c, -2, 2);
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
  rollFaces(state, rng);
  checkStories(state);
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
  if (tw && rng() < 0.15) state.pendingEvents.push({ id: 'string' });
  if (tw && rng() < 0.04) state.pendingEvents.push({ id: 'wedding' });
  if (!state.flags.secretary && state.club >= 30 && rng() < 0.15) state.pendingEvents.push({ id: 'secretary' });
  if (state.week === 81 && !state.flags.coachMove) state.pendingEvents.push({ id: 'coachMove' });
  if (state.flags.secretary && wi.w % 8 === 1) state.fatigue = clamp(state.fatigue + 5, 0, 100);
}

export function eventView(state, ev) {
  const P = PARTNER;
  switch (ev.id) {
    case 'deadline': return { who: 'boss', title: '프로젝트 마감', text: '팀장: "이번 주는 다들 남아 줘야겠어."', choices: [['accept', '남는다 (이번 턴은 야근만, 평판 +8)'], ['refuse', '빠진다 (평판 -8)']] };
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
      return { who: ev.pid, title: `${p.name}의 대회 초대`, text: `"${weekInfo(t.week).label.split(' · ')[1]} ${t.name}(${t.type === 'national' ? '전국대회' : '비전국대회'}) ${state.division}부 같이 나갈래요?"`, choices: [['accept', '같이 나간다'], ['refuse', '이번엔 거절한다']] };
    }
    case 'meet': return { who: ev.pid, title: '새로운 인연', text: `${P[ev.pid].name} (${P[ev.pid].arch}): "${P[ev.pid].line}"`, choices: [['ok', '반가워요']] };
    case 'withdraw': return { who: ev.pid, title: '대회 기권', text: `부상으로 ${ev.tname}에 못 나간다고 ${P[ev.pid].name}에게 연락했다. (친밀도 -3)`, choices: [['ok', '확인']] };
    case 'goal': { const g = GOALS.find(x => x.id === ev.goal); return { who: 'coach', title: '목표 달성!', text: `코치: "${g.text}, 해냈어요!" (자신감 +10, 코치 신뢰 +3)`, choices: [['ok', '좋아!']] }; }
    case 'goalMiss': { const g = GOALS.find(x => x.id === ev.goal); return { who: 'coach', title: '목표를 놓쳤다', text: `코치: "이번 목표(${g.text})는 아쉬웠어요. 괜찮아요, 다음 목표로 가요."`, choices: [['ok', '다시 해 보자']] }; }
    case 'story': { const st = STORIES.find(x => x.id === ev.story); return { who: st.who, title: st.title, text: st.text + (st.note ? ` (${st.note})` : ''), choices: [['ok', st.ok]] }; }
    case 'realize': return { who: 'coach', title: '깨달음', text: `${REALIZE_LINES[ev.topic]} (레슨 선택지 추가: ${LESSONS[ev.topic].name})`, choices: [['ok', '배워 볼게요']] };
    case 'lessonsOpen': return { who: 'coach', title: '코치의 말', text: '코치: "이제 뭘 배울지 스스로 알겠죠? 레슨 내용은 직접 골라 봐요."', choices: [['ok', '네!']] };
    default: return { who: 'system', title: '알림', text: '', choices: [['ok', '확인']] };
  }
}

export function resolveEvent(state, ev, choice) {
  const yes = choice === 'accept';
  switch (ev.id) {
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
      if (st.unlock) state.unlocked[st.unlock] = true;
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
  const mu = (state.division === '국화' ? 60 : 37) + (t.type === 'national' ? (state.division === '국화' ? 3 : 1) : -3) - ramp;
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
    tid, name: t.name, type: t.type, div: state.division, partner: e.partner, seed, bye, draw: t.draw,
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
  const me = { id: 'me', name: state.name, stats: { ...state.stats }, conf: state.confidence, condition: cond };
  if (state.yips > 0) me.stats.second_serve = Math.max(5, me.stats.second_serve - 8);
  const ps = state.partners[tr.partner];
  const partner = { id: tr.partner, name: PARTNER[tr.partner].name, stats: partnerStats(state, tr.partner), conf: 45 + ps.aff / 5, condition: 0 };
  const human = { players: [me, partner], combo: ps.combo, isHuman: true, choices: { ...(state.choices || {}) } };
  return { human, npc, opp };
}
export function recordMatch(state, tr, sim, auto = false) {
  const won = sim.winner === 0;
  const opp = currentOpponent(tr);
  const me = sim.P[0];
  tr.log.push({ stage: stageLabel(tr), opp: opp.names.join('·'), club: opp.club, arch: opp.archName, won, auto, games: [...sim.games] });
  if (me.rec.df >= 5) state.yips = Math.max(state.yips, 3);
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
  const partnerEnd = PARTNERS.find(p => state.partners[p.id].aff >= 90 && state.partners[p.id].nationalWins >= 1);
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

export { STAGE_NAME, DAY_NAMES };
