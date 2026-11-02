// 육성 루프 — 주간 스케줄, 자원, 이벤트, 메신저, 대회·랭킹·승급, 엔딩 (기획 문서 3·5·6·8·9장)
import {
  ALL_STATS, STAT_GROUPS, GROUP_BY_ID, TECH_GROUPS, ACT, ACTIVITIES, slotType, DEFAULT_ROUTINE, PARTNERS, PARTNER,
  OPP_ARCH, randomName, CLUB_NAMES, buildCalendar, POINTS, PRIZE, STAGE_NAME, weekInfo, COACH_TASK_LINES, COACH_SECRETS, ENDINGS, DAY_NAMES,
} from './data.js';
import { makeStats, makeNpcTeam, mulberry32, gauss } from './sim.js';

export const TOTAL_WEEKS = 156;
export const GROWTH = 0.8; // 전체 성장 속도 (tools/season.js 로 조정)
const SAVE_KEY = 'tennis-raising-save-v1';
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
    v: 1, seed, rs: seed, name: name || '나', week: 1, money: 1500000, salary: 3000000, living: 2300000,
    fatigue: 15, stress: 20, confidence: 50, condition: 0,
    division: '개나리', work: 50, coach: 10, club: 5,
    stats: {}, focus: 'stroke', coachTask: 'stroke',
    routine: [...DEFAULT_ROUTINE], locks: {}, injury: null, forcedRest: false, slump: false,
    partners: {}, calendar: [], entries: {}, outgoing: [], inbox: [], msgSeq: 1,
    points: { 개나리: { national: [], local: [] }, 국화: { national: [], local: [] } }, npc: {},
    results: [], titles: { local: 0, national: 0, gukwhaLocal: 0, gukwhaNational: 0 },
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
  addMsg(state, 'coach', `${state.name} 님, 반가워요! 첫 달은 스트로크부터 잡아 봅시다. 주간 계획에서 활동을 칸에 넣고 '이번 주 시작'을 누르면 돼요.`);
  addMsg(state, 'hana', '나 이번에 테니스 시작했어! 우리 같이 대회도 나가 보자 😆');
  addMsg(state, 'system', '목표: 개나리부 전국대회 우승으로 국화가 되고, 국화부에서 우승하기. 기간은 3년(156주)입니다.');
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
export function unread(state) { return state.inbox.filter(m => !m.read || (m.kind === 'invite' && m.status === 'pending')).length; }

// ── 능력치 요약 ───────────────────────────────────────────
export function groupAvg(stats, gid) { return avg(GROUP_BY_ID[gid].stats.map(([id]) => stats[id])); }
export function overall(stats) { return avg(ALL_STATS.map(id => stats[id])); }
export function mentalAvg(stats) { return groupAvg(stats, 'mental'); }

export function partnerStats(state, pid) {
  const def = PARTNER[pid], ps = state.partners[pid];
  return makeStats(mulberry32(hashStr(pid)), ps.level, def.bias, 5);
}

// ── 주간 계획 ─────────────────────────────────────────────
export function tournamentThisWeek(state) {
  const e = Object.entries(state.entries).find(([tid]) => { const t = tour(state, tid); return t && t.week === state.week; });
  return e ? { t: tour(state, e[0]), entry: e[1] } : null;
}
export function tour(state, tid) { return state.calendar.find(t => t.id === tid); }

export function weekLocks(state) {
  const locks = { ...state.locks };
  const tw = tournamentThisWeek(state);
  if (tw) { locks[tw.t.day * 2] = { act: 'tournament', reason: tw.t.name }; locks[tw.t.day * 2 + 1] = { act: 'tournament', reason: tw.t.name }; }
  if (state.forcedRest) for (let i = 0; i < 14; i++) if (!locks[i]) locks[i] = { act: 'rest', reason: '강제 휴식' };
  return locks;
}

export function allowedActs(state, slot) {
  const type = slotType(slot);
  return ACTIVITIES.filter(a => a.slots.includes(type)).map(a => {
    let blocked = null;
    if (state.injury && (a.tennis || a.id === 'gym')) blocked = '부상 중';
    if (a.cost > 0 && state.money < a.cost) blocked = '돈 부족';
    return { ...a, blocked };
  });
}

// ── 주간 실행 ─────────────────────────────────────────────
export function runWeek(state) {
  const rng = rngOf(state);
  const wi = weekInfo(state.week);
  const locks = weekLocks(state);
  const log = { week: state.week, days: DAY_NAMES.map(d => ({ day: d, items: [] })), gains: {}, money: 0, notes: [], replies: [] };
  const startStats = { ...state.stats };
  const moneyStart = state.money;
  const startFat = state.fatigue, startStress = state.stress;
  const coachKOf = gid => (gid === state.coachTask ? 1.3 : 1);
  const condK = 1 + state.condition * 0.08;
  const slumpK = state.slump ? 0.5 : 1;
  const seen = {};
  const summer = wi.w >= 14 && wi.w <= 26;
  const rainy = wi.w >= 20 && wi.w <= 24;
  const heat = wi.w >= 22 && wi.w <= 30;

  const grow = (id, amt, K) => {
    const v = state.stats[id];
    const g = GROWTH * amt * K * (1 - v / 120) * (0.6 + rng() * 0.8);
    state.stats[id] = clamp(v + g, 1, 99);
  };

  for (let i = 0; i < 14; i++) {
    const d = Math.floor(i / 2);
    if (i % 2 === 0 && d < 5) { state.stress += 2; state.fatigue += 2; }
    const lk = locks[i];
    let id = lk ? lk.act : state.routine[i];
    if (id === 'tournament') continue;
    let a = ACT[id];
    if (!a) continue;
    let note = lk ? lk.reason : '';
    if (state.injury && (a.tennis || a.id === 'gym')) { a = ACT.rest; note = '부상으로 휴식'; }
    if (rainy && a.tennis && (a.id === 'club' || a.id === 'rally' || a.id === 'bungae') && rng() < 0.35) { a = ACT.rest; note = '장마로 코트 취소'; }
    if (a.cost > 0 && state.money < a.cost) { a = ACT.rest; note = '돈이 없어 쉬었음'; }
    state.money -= a.cost;
    seen[a.id] = (seen[a.id] || 0) + 1;
    const boreK = Math.max(0.5, 1 - (seen[a.id] - 1) * 0.07 * (a.bore || 1));
    const K = condK * slumpK * boreK;
    if (a.groups) for (const [gid, amt] of Object.entries(a.groups)) for (const [sid] of GROUP_BY_ID[gid].stats) grow(sid, amt, K * coachKOf(gid));
    if (a.stats) for (const [sid, amt] of Object.entries(a.stats)) grow(sid, amt * (state.coachTask === 'counter' && sid.startsWith('c_') ? 1.3 : 1), K);
    if (a.focus) {
      let gid = state.focus;
      if (a.id === 'machine' && (gid === 'counter' || gid === 'course')) gid = 'stroke';
      const ids = GROUP_BY_ID[gid].stats.map(s => s[0]).sort(() => rng() - 0.5).slice(0, 3);
      for (const sid of ids) grow(sid, a.focus, K * coachKOf(gid) * (a.id === 'private_lesson' || a.id === 'dawn_lesson' ? 1 + state.coach / 300 : 1));
    }
    let fat = a.fatigue || 0;
    if (heat && a.tennis && fat > 0) fat *= 1.5;
    if (slotType(i) === 'dawn' && fat > 0) fat += 2;
    state.fatigue += fat;
    state.stress += a.stress || 0;
    state.work += a.work || 0;
    state.coach += a.coach || 0;
    state.club += a.clubRep || 0;
    if (a.heal && state.injury) { state.injury.weeks -= a.heal; if (state.injury.weeks <= 0) { state.injury = null; log.notes.push('부상이 나았다!'); } }
    if (a.id === 'meditate' && state.yips > 0) { state.yips--; if (state.yips === 0) log.notes.push('서브 입스를 극복했다.'); }
    if (a.partnerAff) {
      const pid = bestPartner(state);
      if (pid) { state.partners[pid].aff = clamp(state.partners[pid].aff + a.partnerAff, 0, 100); state.partners[pid].combo = clamp(state.partners[pid].combo + 1.5, 0, 100); note = `${PARTNER[pid].name}와 함께`; }
    }
    if (a.id === 'club') meetCheck(state, 'club', rng, log);
    if (a.id === 'bungae') meetCheck(state, 'bungae', rng, log);
    log.days[d].items.push({ slot: i, act: a.id, note });
  }
  // 발신한 대회 요청 → 답장
  for (const o of state.outgoing.filter(o => !o.done)) resolveOutgoing(state, o, rng, log);
  state.outgoing = state.outgoing.filter(o => !o.done);
  // 주간 기본 회복
  state.fatigue -= 14; state.stress -= 3;
  state.fatigue = clamp(state.fatigue, 0, 100); state.stress = clamp(state.stress, 0, 100);
  state.work = clamp(state.work, 0, 100); state.coach = clamp(state.coach, 0, 100); state.club = clamp(state.club, 0, 100);
  for (const id of ALL_STATS) { const g = state.stats[id] - startStats[id]; if (g > 0.05) log.gains[id] = g; }
  log.money = state.money - moneyStart;
  log.fatigue = state.fatigue - startFat; log.stress = state.stress - startStress;
  state.weekLog = log;
  return log;
}

function bestPartner(state) {
  const ks = PARTNERS.filter(p => state.partners[p.id].known && state.partners[p.id].div === state.division);
  if (!ks.length) return null;
  return ks.reduce((a, b) => (state.partners[a.id].aff >= state.partners[b.id].aff ? a : b)).id;
}

function meetCheck(state, how, rng, log) {
  for (const p of PARTNERS) {
    const ps = state.partners[p.id];
    if (ps.known) continue;
    let ok = false;
    if (p.meet === how && how === 'club' && state.club >= 14 && rng() < 0.35) ok = true;
    if (p.meet === how && how === 'bungae' && rng() < 0.3) ok = true;
    if (p.meet === 'club2' && how === 'club' && state.club >= 40 && rng() < 0.2) ok = true;
    if (ok) {
      ps.known = true; ps.aff = 15;
      addMsg(state, p.id, `안녕하세요! ${how === 'club' ? '정모' : '번개'}에서 같이 쳤던 ${p.name}이에요. ${p.line}`);
      log.notes.push(`새 인맥: ${p.name} (${p.arch})`);
      return;
    }
  }
}

// ── 메신저: 대회 초대 ─────────────────────────────────────
export function partnerAvailable(state, pid, week) {
  const def = PARTNER[pid], ps = state.partners[pid];
  if (!ps.known) return '모르는 사람';
  if (ps.div !== state.division) return ps.div === '국화' ? '국화라 개나리부에 못 나감' : '개나리라 국화부에 못 나감';
  const w = ((week - 1) % 52) + 1;
  if (def.exams && def.exams.includes(w)) return '시험 기간';
  return null;
}
export function acceptChance(state, pid, t) {
  const ps = state.partners[pid];
  const me = overall(state.stats);
  let p = 0.28 + ps.aff / 170 + (me - ps.level) / 60 + state.club / 450;
  if (t.type === 'national') p += ps.level > me + 10 ? -0.08 : 0.06;
  return clamp(p, 0.05, 0.95);
}
export function canRegisterWeek(state, week) {
  return !Object.keys(state.entries).some(tid => tour(state, tid)?.week === week);
}
export function requestPartner(state, tid, pid) {
  const t = tour(state, tid);
  if (!t || t.week <= state.week) return '마감된 대회입니다.';
  if (!canRegisterWeek(state, t.week)) return '그 주에는 이미 출전하는 대회가 있습니다.';
  const why = partnerAvailable(state, pid, t.week);
  if (why) return why;
  if (state.outgoing.some(o => o.tid === tid && o.pid === pid)) return '이미 연락했습니다.';
  state.outgoing.push({ tid, pid, week: state.week });
  addMsg(state, 'me:' + pid, `${t.name} ${state.division}부 같이 나갈래요?`, { to: pid, mine: true, read: true });
  return null;
}
function resolveOutgoing(state, o, rng, log) {
  const t = tour(state, o.tid), ps = state.partners[o.pid], def = PARTNER[o.pid];
  o.done = true;
  if (!canRegisterWeek(state, t.week)) return;
  const ok = rng() < acceptChance(state, o.pid, t) && rng() > 0.12;
  if (ok) {
    register(state, t, o.pid);
    addMsg(state, o.pid, `좋아요! ${t.name} 같이 나가요. 접수는 제가 할게요 🎾`, { kind: 'reply' });
    log.replies.push(`${def.name}: ${t.name} 수락`);
  } else {
    const lines = ['아 그 주는 선약이 있어요 ㅠㅠ', '이번엔 다른 분이랑 나가기로 했어요. 다음에 해요!', '음… 다음에 하자. 실력 좀 더 늘면!'];
    const line = ps.level > overall(state.stats) + 12 ? lines[2] : lines[Math.floor(rng() * 2)];
    addMsg(state, o.pid, line, { kind: 'reply' });
    log.replies.push(`${def.name}: 거절`);
  }
}
function register(state, t, pid) {
  state.entries[t.id] = { partner: pid };
  state.money -= t.fee;
}
export function answerInvite(state, msgId, answer) {
  const m = state.inbox.find(x => x.id === msgId);
  if (!m || m.status !== 'pending') return;
  const t = tour(state, m.tid), ps = state.partners[m.from];
  m.read = true;
  if (answer === 'accept') {
    if (!canRegisterWeek(state, t.week)) { m.status = 'expired'; addMsg(state, m.from, '아 이미 다른 대회 잡혔구나! 다음에 같이 가요.'); return '그 주에는 이미 출전하는 대회가 있습니다.'; }
    m.status = 'accepted'; register(state, t, m.from); ps.aff = clamp(ps.aff + 3, 0, 100); ps.declines = 0;
    addMsg(state, m.from, '오예! 접수할게요. 그날 봐요 💪', { kind: 'reply' });
  } else if (answer === 'decline') {
    m.status = 'declined'; ps.declines++; ps.aff = clamp(ps.aff - (ps.declines >= 2 ? 8 : 3), 0, 100);
    addMsg(state, m.from, ps.declines >= 2 ? '…알겠어요. 바쁘신가 봐요.' : '앗 아쉽다. 다음에 같이 나가요!', { kind: 'reply' });
  } else if (answer === 'hold') {
    m.status = 'held';
  }
  return null;
}
function genInvites(state, rng) {
  let made = 0;
  const upcoming = state.calendar.filter(t => t.week >= state.week + 1 && t.week <= state.week + 3);
  const recent = state.results.slice(-3).reduce((a, r) => a + (['W', 'F', 'SF'].includes(r.stage) ? 1 : 0), 0);
  for (const t of upcoming) {
    if (made >= 2) break;
    if (!canRegisterWeek(state, t.week)) continue;
    for (const p of PARTNERS) {
      if (made >= 2) break;
      if (partnerAvailable(state, p.id, t.week)) continue;
      if (state.inbox.some(m => m.kind === 'invite' && m.tid === t.id && m.from === p.id)) continue;
      const ps = state.partners[p.id];
      const pr = 0.04 + ps.aff / 700 + state.club / 600 + recent * 0.04 + (t.type === 'national' ? -0.01 : 0);
      if (rng() < pr) {
        const pre = t.type === 'national' ? '전국대회' : '대회';
        addMsg(state, p.id, `${weekInfo(t.week).label.split(' · ')[1]} ${DAY_NAMES[t.day]}요일 ${t.name}(${pre}) ${state.division}부 같이 나갈래요?`, { kind: 'invite', tid: t.id, status: 'pending' });
        made++;
      }
    }
  }
}

// ── 주 마감 ───────────────────────────────────────────────
export function endWeek(state) {
  const rng = rngOf(state);
  const wi = weekInfo(state.week);
  const notes = [];
  // 월급
  if (wi.w % 4 === 0) { state.money += state.salary - state.living; notes.push(`월급 ${(state.salary / 10000).toFixed(0)}만 입금, 생활비 ${(state.living / 10000).toFixed(0)}만 차감`); }
  // 부상
  if (state.injury) { state.injury.weeks--; if (state.injury.weeks <= 0) { state.injury = null; notes.push('부상이 나았다.'); } }
  else if (state.fatigue >= 70) {
    const p = 0.05 + (state.fatigue - 70) / 200 - state.stats.flex / 1000;
    if (rng() < p) {
      const names = ['테니스 엘보', '발목 염좌', '손목 통증', '종아리 근육 경련', '어깨 통증'];
      state.injury = { name: names[Math.floor(rng() * names.length)], weeks: 2 + Math.floor(rng() * 4) };
      state.injuries++;
      state.pendingEvents.push({ id: 'injury' });
    }
  }
  state.forcedRest = state.fatigue >= 90;
  if (state.forcedRest) notes.push('피로가 한계다. 다음 주는 강제로 쉰다.');
  const mAvg = mentalAvg(state.stats);
  const wasSlump = state.slump;
  state.slump = state.stress > 45 + mAvg / 2;
  if (state.slump && !wasSlump) state.pendingEvents.push({ id: 'slump' });
  if (state.stress >= 85) state.highStressWeeks++;
  // 컨디션
  let c = Math.round(gauss(rng) * 0.8 + (state.fatigue < 40 ? 0.5 : 0) + (state.stress < 30 ? 0.5 : 0) - (state.fatigue > 70 ? 1 : 0) - (state.stress > 70 ? 1 : 0));
  state.condition = clamp(c, -2, 2);
  state.confidence += (50 - state.confidence) * 0.05;
  // 파트너 성장
  for (const p of PARTNERS) state.partners[p.id].level = clamp(state.partners[p.id].level + p.growth, 1, 95);
  // 보류한 초대 만료
  for (const m of state.inbox) if (m.kind === 'invite' && (m.status === 'held' || m.status === 'pending')) {
    const t = tour(state, m.tid);
    if (t.week <= state.week || (m.status === 'held' && rng() < 0.5)) { m.status = 'expired'; state.partners[m.from].aff = clamp(state.partners[m.from].aff - 2, 0, 100); }
  }
  // 승진 심사
  if ([26, 78, 130].includes(state.week)) state.pendingEvents.push({ id: 'promo' });
  // 코치 비기
  for (const s of COACH_SECRETS) if (state.coach >= s.at && !state.secretsGot.includes(s.id)) { state.pendingEvents.push({ id: 'secret', secret: s.id }); break; }
  // 라이벌 이적생
  if (state.flags.rivalMetWeek && !state.partners.arah.known && state.week >= state.flags.rivalMetWeek + 6 && state.division === '개나리') {
    state.partners.arah.known = true; state.partners.arah.aff = 20;
    addMsg(state, 'arah', `${PARTNER.arah.line} 그 팀 나왔어. 당신 경기 봤거든.`);
  }
  if (state.division === '국화' && !state.partners.yujin.known) { state.partners.yujin.known = true; state.partners.yujin.aff = 15; addMsg(state, 'yujin', '국화 된 거 축하해요. 언제 한번 같이 나가요.'); }
  if (state.division === '국화' && !state.partners.mikyung.known && state.club >= 25) { state.partners.mikyung.known = true; state.partners.mikyung.aff = 20; addMsg(state, 'mikyung', '정모에서 봤어요. 국화부 같이 나가 볼래요?'); }

  state.week++;
  state.locks = {};
  if (state.week > TOTAL_WEEKS) { state.ending = evaluateEnding(state); return notes; }
  const nwi = weekInfo(state.week);
  // 코치 월간 과제
  if (nwi.w % 4 === 1) {
    const weakest = TECH_GROUPS.reduce((a, b) => (groupAvg(state.stats, a) <= groupAvg(state.stats, b) ? a : b));
    state.coachTask = weakest;
    addMsg(state, 'coach', `${COACH_TASK_LINES[weakest]} (이번 달 과제: ${GROUP_BY_ID[weakest].name} 훈련 효율 +30%)`);
  }
  if (nwi.w === 20) addMsg(state, 'system', '장마가 시작됐다. 야외 코트 일정이 취소될 수 있다.');
  if (nwi.w === 22) addMsg(state, 'system', '폭염 주의. 테니스 활동의 피로가 50% 늘어난다.');
  genInvites(state, rng);
  rollEvents(state, rng);
  save(state);
  return notes;
}

// ── 이벤트 ────────────────────────────────────────────────
function rollEvents(state, rng) {
  const wi = weekInfo(state.week);
  const tw = tournamentThisWeek(state);
  if (rng() < 0.05 && !tw) state.pendingEvents.push({ id: 'deadline' });
  else if (rng() < 0.08) state.pendingEvents.push({ id: 'dinner' });
  if (!state.flags.boss && state.work >= 55 && state.week > 8 && rng() < 0.06) state.pendingEvents.push({ id: 'boss' });
  if (tw && rng() < 0.15) state.pendingEvents.push({ id: 'string' });
  if (tw && rng() < 0.04) state.pendingEvents.push({ id: 'wedding' });
  if (!state.flags.secretary && state.club >= 30 && rng() < 0.1) state.pendingEvents.push({ id: 'secretary' });
  if (state.week === 82 && !state.flags.coachMove) state.pendingEvents.push({ id: 'coachMove' });
  if (state.flags.secretary && wi.w % 4 === 2) state.locks[10] = { act: 'club', reason: '총무 업무' };
}

export function eventView(state, ev) {
  const P = PARTNER;
  switch (ev.id) {
    case 'deadline': return { who: 'boss', title: '프로젝트 마감 주간', text: '팀장: "이번 주는 다들 저녁에 좀 남아 줘야겠어."', choices: [['accept', '받아들인다 (평일 저녁 모두 야근, 평판↑)'], ['refuse', '빠진다 (평판 -8)']] };
    case 'dinner': return { who: 'boss', title: '회식 공지', text: '목요일 저녁 회식이 잡혔다.', choices: [['accept', '참석한다 (목요일 저녁 회식)'], ['refuse', '빠진다 (평판 -3)']] };
    case 'boss': return { who: 'boss', title: '팀장님도 테니스를?', text: '팀장: "자네 테니스 친다며? 나도 주말에 좀 쳐."', choices: [['accept', '같이 랠리 하자고 한다 (평판+6, 클럽 명성+2)'], ['refuse', '정중히 넘긴다']] };
    case 'string': return { who: 'system', title: '스트링이 끊어졌다!', text: '대회를 앞두고 연습하다 스트링이 끊어졌다.', choices: [['accept', '바로 교체한다 (3만 원)'], ['refuse', '예비 라켓으로 나간다 (대회 컨디션 -1)']] };
    case 'wedding': return { who: 'system', title: '친구 결혼식', text: '이번 주 대회 날, 오랜 친구의 결혼식이 겹쳤다.', choices: [['accept', '결혼식에 간다 (대회 기권, 파트너 친밀도 -6, 스트레스 -10)'], ['refuse', '대회에 나간다 (스트레스 +6)']] };
    case 'secretary': return { who: 'club', title: '클럽 총무 제안', text: '회장님: "총무 좀 맡아 줄 수 있어요?"', choices: [['accept', '맡는다 (클럽 명성 +10, 매달 토요일 오전 업무)'], ['refuse', '사양한다']] };
    case 'coachMove': return { who: 'coach', title: '코치님 이직', text: '코치: "저 다른 클럽으로 옮겨요. 레슨비가 좀 오르는데… 따라올래요?"', choices: [['accept', '따라간다 (레슨비 +20%, 코치 신뢰 유지)'], ['refuse', '새 코치를 찾는다 (코치 신뢰 20으로)']] };
    case 'promo': { const ok = state.work >= 65; return { who: 'boss', title: '승진 심사', text: ok ? '평판이 좋았다. 승진! 월급 +10%' : '이번 승진 심사는 아쉽게 떨어졌다.', choices: [['ok', '확인']] }; }
    case 'injury': return { who: 'system', title: `부상: ${state.injury?.name || ''}`, text: `${state.injury?.weeks || 0}주 동안 테니스와 헬스를 못 한다. 물리치료를 받으면 빨리 낫는다.`, choices: [['ok', '확인']] };
    case 'slump': return { who: 'coach', title: '슬럼프', text: '코치: "요즘 공이 안 맞죠? 스트레스가 너무 쌓였어요. 좀 쉬어요." (훈련 효율 절반)', choices: [['ok', '확인']] };
    case 'secret': { const s = COACH_SECRETS.find(x => x.id === ev.secret); return { who: 'coach', title: `코치 비기: ${s.name}`, text: `코치: "${s.text}" (경기 중 게임 사이 선택에 '${s.name}' 추가)`, choices: [['ok', '배운다']] }; }
    case 'promotion': return { who: 'system', title: '🌼 국화 승급!', text: `개나리부 전국대회 우승! 이제 ${state.name} 님은 국화입니다. 앞으로는 국화부 대회에만 나갑니다.`, choices: [['ok', '좋아!']] };
    case 'rival': return { who: 'arah', title: '라이벌 등장', text: `${P.arah.name}: "${ev.text || '다음엔 안 봐줘.'}"`, choices: [['ok', '…두고 보자']] };
    default: return { who: 'system', title: '알림', text: '', choices: [['ok', '확인']] };
  }
}

export function resolveEvent(state, ev, choice) {
  const yes = choice === 'accept';
  switch (ev.id) {
    case 'deadline': if (yes) { for (let d = 0; d < 5; d++) state.locks[d * 2 + 1] = { act: 'overtime', reason: '마감 야근' }; state.work += 8; } else state.work -= 8; break;
    case 'dinner': if (yes) state.locks[7] = { act: 'dinner', reason: '회식' }; else state.work -= 3; break;
    case 'boss': state.flags.boss = true; if (yes) { state.work += 6; state.club += 2; state.fatigue += 5; } break;
    case 'string': if (yes) state.money -= 30000; else state.flags.spareRacket = true; break;
    case 'wedding': {
      const tw = tournamentThisWeek(state);
      if (yes && tw) { state.partners[tw.entry.partner].aff -= 6; delete state.entries[tw.t.id]; state.stress -= 10; }
      else state.stress += 6;
      break;
    }
    case 'secretary': state.flags.secretary = yes; if (yes) state.club += 10; break;
    case 'coachMove': state.flags.coachMove = true; if (yes) state.flags.lessonUp = true; else state.coach = 20; break;
    case 'promo': if (state.work >= 65) state.salary = Math.round(state.salary * 1.1); break;
    case 'secret': {
      const s = COACH_SECRETS.find(x => x.id === ev.secret);
      state.secretsGot.push(s.id);
      state.unlocks.push(s.unlock);
      for (const [k, v] of Object.entries(s.stats)) state.stats[k] = clamp(state.stats[k] + v, 1, 99);
      break;
    }
    default: break;
  }
  state.work = clamp(state.work, 0, 100); state.club = clamp(state.club, 0, 100);
  state.stress = clamp(state.stress, 0, 100); state.fatigue = clamp(state.fatigue, 0, 100);
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
  const seed = teamSeed(state, t, e.partner);
  const mu = (state.division === '국화' ? 60 : 37) + (t.type === 'national' ? 3 : -3);
  const bye = seed !== null && seed <= 2;
  const mk = (rating) => {
    const club = CLUB_NAMES[Math.floor(rng() * CLUB_NAMES.length)];
    const arch = OPP_ARCH[Math.floor(rng() * OPP_ARCH.length)];
    return { names: [randomName(rng), randomName(rng)], rating: Math.round(rating), club, arch: arch.id, archName: arch.name, seed: rng() * 1e9 >>> 0 };
  };
  const groupOpps = bye ? [] : [mk(mu + gauss(rng) * 6 - (seed ? 3 : 0)), mk(mu + gauss(rng) * 6 - (seed ? 3 : 0))];
  const koRounds = t.type === 'national' ? 4 : 3;
  const ko = [];
  for (let r = 0; r < koRounds; r++) ko.push(mk(mu + 2 + 2.5 * r + gauss(rng) * 5 + (seed && r === 0 ? -3 : 0)));
  const tr = {
    tid, name: t.name, type: t.type, div: state.division, partner: e.partner, seed, bye,
    group: { opps: groupOpps, results: [], npcResult: null }, ko, koRound: 0, koRounds,
    stage: bye ? 'ko' : 'group', matchIdx: 0, finished: false, final: null, log: [],
  };
  if (!bye) {
    // NPC끼리의 조별 경기
    const [a, b] = groupOpps;
    const pa = 1 / (1 + Math.exp(-(a.rating - b.rating) / 5));
    tr.group.npcResult = rng() < pa ? 0 : 1;
  }
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
  if (tr.stage === 'group') return `예선 조별리그 ${tr.group.results.length + 1}경기`;
  const left = tr.koRounds - tr.koRound;
  return left === 1 ? '결승' : left === 2 ? '4강' : left === 3 ? '8강' : '16강';
}
export function buildTeams(state, tr) {
  const opp = currentOpponent(tr);
  const rng = mulberry32(opp.seed);
  const npc = makeNpcTeam(rng, opp.rating, opp.names, opp.arch);
  npc.players.forEach(p => { p.club = opp.club; });
  const cond = state.condition - (tr.spare ? 1 : 0);
  const me = { id: 'me', name: state.name, stats: { ...state.stats }, conf: state.confidence, condition: cond };
  if (state.yips > 0) me.stats.second_serve = Math.max(5, me.stats.second_serve - 8);
  if (state.injury) for (const k of Object.keys(me.stats)) me.stats[k] *= 0.85;
  const ps = state.partners[tr.partner];
  const partner = { id: tr.partner, name: PARTNER[tr.partner].name, stats: partnerStats(state, tr.partner), conf: 45 + ps.aff / 5, condition: 0 };
  const human = { players: [me, partner], combo: ps.combo, isHuman: true, choices: { ...(state.choices || {}) } };
  return { human, npc, opp };
}
export function recordMatch(state, tr, sim) {
  const won = sim.winner === 0;
  const opp = currentOpponent(tr);
  const me = sim.P[0];
  tr.log.push({ stage: stageLabel(tr), opp: opp.names.join('·'), club: opp.club, arch: opp.archName, won, games: [...sim.games], rec: { ...me.rec }, partnerRec: { ...sim.P[1].rec } });
  if (me.rec.df >= 5) state.yips = Math.max(state.yips, 3);
  state.confidence = clamp(state.confidence + (won ? 6 : -3), 0, 100);
  const ps = state.partners[tr.partner];
  ps.combo = clamp(ps.combo + 2, 0, 100); ps.aff = clamp(ps.aff + (won ? 2 : 0), 0, 100);
  tr.matchIdx++;
  if (tr.stage === 'group') {
    tr.group.results.push({ won, diff: sim.games[0] - sim.games[1] });
    if (tr.group.results.length === 2) {
      const myWins = tr.group.results.filter(r => r.won).length;
      // 3팀 조: 2승이면 1위, 1승이면 상대 결과로 판정, 0승 탈락
      let advance = myWins === 2;
      if (myWins === 1) {
        const lostTo = tr.group.results[0].won ? 1 : 0; // 내가 진 상대 index
        const oppWonNpc = tr.group.npcResult === lostTo;
        advance = !oppWonNpc ? true : (tr.group.results.reduce((a, r) => a + r.diff, 0) > 0 && Math.random() < 0.5);
      }
      if (advance) tr.stage = 'ko'; else finishTournament(state, tr, 'G');
    }
  } else {
    if (!won) {
      const left = tr.koRounds - tr.koRound;
      finishTournament(state, tr, left === 1 ? 'F' : left === 2 ? 'SF' : left === 3 ? 'QF' : 'R16');
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
  const prize = (PRIZE[tr.type] || {})[stage] || 0;
  state.money += prize;
  tr.prize = prize; tr.pts = pts;
  state.fatigue = clamp(state.fatigue + tr.matchIdx * 6, 0, 100);
  state.stress = clamp(state.stress + (stage === 'W' ? -15 : stage === 'G' ? 6 : 0), 0, 100);
  state.club = clamp(state.club + (stage === 'W' ? 8 : stage === 'F' ? 5 : stage === 'SF' ? 3 : 1), 0, 100);
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
      for (const tid of Object.keys(state.entries)) { const t = tour(state, tid); if (t.week > state.week) { delete state.entries[tid]; state.money += t.fee; } }
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

export { STAGE_NAME };
