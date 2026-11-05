// 3년 자동 플레이: 성장 곡선, 대회 성적, 승급 시점, 예상 플레이 시간
// node tools/season.js [횟수]  첫 회차만 곡선을 자세히 찍고, 나머지는 요약한다.
import * as G from '../js/game.js';
import { MatchSim, quickMatch, aiChoices } from '../js/sim.js';
import { PARTNERS, BIG_STATS, PROFILE } from '../js/data.js';

const RUNS = +process.argv[2] || 30;
const NATIONAL_GAP = 6, LOCAL_GAP = 10; // 출전 간격(주). 두 달에 한 번쯤을 적정선으로 본다

// 깨달은 레슨이 있으면 가장 약한 쪽을, 없으면 코치에게 맡긴다
function chooseLesson(s) {
  if (!s.lessons.length) return undefined;
  const score = t => {
    const p = G.previewAction(s, 'lesson', t);
    const big = G.bigValues(s.stats), avgBig = Object.values(big).reduce((a, b) => a + b, 0) / BIG_STATS.length;
    return p.gains.reduce((a, [b, g]) => a + g * Math.max(0.2, 1 + (avgBig - big[b]) / 15), 0);
  };
  return [G.coachTopic(s), ...s.lessons].reduce((a, b) => (score(b) > score(a) ? b : a));
}

// 열린 칸 중 약한 곳을 가장 많이 올리는 곳을 고른다. 호흡 훈련은 수치가 커서 자연히 먼저 고른다.
function chooseSpot(s) {
  const big = G.bigValues(s.stats), avgBig = Object.values(big).reduce((a, b) => a + b, 0) / BIG_STATS.length;
  // 피로는 나중에 쉬는 턴으로 돌아오므로 그만큼 값을 깎는다
  const score = (id, t) => { const p = G.previewAction(s, id, t); return p.gains.reduce((a, [b, g]) => a + g * Math.max(0.2, 1 + (avgBig - big[b]) / 15), 0) / (1 + Math.max(0, p.fatigue) / 45) * (0.85 + Math.random() * 0.3); };
  const open = G.visibleActions(s).filter(a => a.train && (!s.injury || !a.risk)).map(a => a.id);
  let best = null, bestV = -1, bestT;
  for (const id of open) {
    const t = id === 'lesson' ? chooseLesson(s) : undefined, v = score(id, t);
    if (v > bestV) { best = id; bestV = v; bestT = t; }
  }
  return [best, bestT];
}
const pick = xs => xs[Math.floor(Math.random() * xs.length)];
const randomProfile = () => Object.fromEntries(PROFILE.map(q => [q.key, pick(q.options).id]));
function play(detail) {
  const s = G.newGame('테스트', randomProfile());
  let matches = 0, watched = 0, wins = 0, last = -99, turn = 0, bondTurns = 0, firstBond = null;
  const used = {};
  const out = [];
  while (!s.ending) {
    turn++;
    while (s.pendingEvents.length) {
      const ev = s.pendingEvents.shift();
      const yes = ev.id === 'invite' ? G.tour(s, ev.tid).week - last >= NATIONAL_GAP && s.fatigue < 60 : true;
      G.resolveEvent(s, ev, yes ? 'accept' : 'refuse');
    }
    let tw = G.tournamentThisWeek(s);
    const open = G.openTournament(s);
    if (!tw && open && !s.injury && !s.overtime && s.fatigue < 60 && s.week - last >= (open.type === 'national' ? NATIONAL_GAP : LOCAL_GAP)) {
      const cands = PARTNERS.filter(p => !G.partnerAvailable(s, p.id, s.week)).sort((a, b) => s.partners[b.id].level - s.partners[a.id].level);
      for (const p of cands) { if (G.askPartner(s, open.id, p.id).ok) break; }
      tw = G.tournamentThisWeek(s);
    }
    if (tw) {
      const tr = G.startTournament(s, tw.t.id);
      last = s.week;
      while (!tr.finished) {
        if (!G.isAutoRound(tr)) watched++;
        const sim = G.playAutoMatch(s, tr);
        matches++; if (sim.winner === 0) wins++;
      }
      s.tournament = null;
    } else {
      let act = 'lesson', topic;
      if (s.overtime) act = 'overtime';
      else if (s.injury) act = s.stress > 50 ? 'family' : 'rest';
      else if (s.stress > 55) act = 'family';
      else if (s.fatigue > 45) act = 'rest';
      else [act, topic] = chooseSpot(s);
      G.runWeek(s, act, topic);
      used[act] = (used[act] || 0) + 1;
      if (s.weekLog.bonds?.length) { bondTurns++; firstBond = firstBond ?? s.weekLog.week; }
      if (s.weekLog.choice) G.chooseScene(s, turn % 2); // 선택은 번갈아 고른다
    }
    const wk = s.week;
    G.endWeek(s);
    if (detail && [13, 25, 39, 51, 77, 103, 129, 155].includes(wk)) {
      const b = G.bigValues(s.stats);
      out.push(`w${wk}: 종합 ${G.overall(s.stats).toFixed(1)} ${BIG_STATS.map(x => `${x.name} ${b[x.id].toFixed(0)}`).join(' ')} 피로 ${s.fatigue.toFixed(0)} 스트레스 ${s.stress.toFixed(0)} ${s.division} 부상${s.injuries} 깨달음${s.lessons.length}`);
    }
  }
  if (detail) console.log(out.join('\n'));
  return { job: s.job, past: s.past, why: s.why, promoted: s.promotedWeek || null, matches, watched, wins, tours: s.results.length, overall: G.overall(s.stats), injuries: s.injuries, ending: s.ending.name, goals: s.goalsDone.length, turns: turn, stories: s.storiesDone.length, miles: s.miles.length, bondTurns, firstBond, used, bonded: PARTNERS.filter(p => G.hasBond(s, p.id)).length, lv: Object.values(s.spots).map(x => x.lv).join('/') };
}

const rs = [];
for (let i = 0; i < RUNS; i++) rs.push(play(i === 0));
const med = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const range = xs => `${Math.min(...xs)}~${Math.max(...xs)} (중앙값 ${med(xs)})`;
const prom = rs.map(r => r.promoted).filter(Boolean);
const count = key => { const m = {}; rs.forEach(r => { m[r[key]] = (m[r[key]] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '); };
console.log(`--- ${RUNS}회 요약 (턴 ${med(rs.map(r => r.turns))})`);
console.log(`국화 승급 주: ${prom.length ? range(prom) : '없음'} | 승급 ${prom.length}/${RUNS}회 | 85~120주 ${prom.filter(w => w >= 85 && w <= 120).length}회`);
console.log(`대회: ${range(rs.map(r => r.tours))} | 경기: ${range(rs.map(r => r.matches))} | 중계 경기: ${range(rs.map(r => r.watched))} | 승률 ${(rs.reduce((a, r) => a + r.wins, 0) / rs.reduce((a, r) => a + r.matches, 0) * 100).toFixed(0)}%`);
console.log(`최종 종합: ${range(rs.map(r => Math.round(r.overall)))} | 부상: ${range(rs.map(r => r.injuries))} | 달성 목표: ${range(rs.map(r => r.goals))} | 이야기 ${med(rs.map(r => r.stories))} 이정표 ${med(rs.map(r => r.miles))}`);
const fb = rs.map(r => r.firstBond).filter(Boolean);
console.log(`호흡 훈련: ${range(rs.map(r => r.bondTurns))}턴 | 첫 호흡 훈련 주: ${fb.length ? range(fb) : '없음'} | 호흡 맞는 사람 ${range(rs.map(r => r.bonded))}명`);
console.log(`칸 사용 중앙값: ${['lesson', 'gym', 'practice', 'club', 'home', 'rest', 'family'].map(k => `${k} ${med(rs.map(r => r.used[k] || 0))}`).join(', ')} | 칸 레벨 예: ${rs[0].lv}`);
console.log(`엔딩: ${count('ending')}`);
for (const q of PROFILE) console.log(`${q.key} 승급 주 중앙값: ` + q.options.map(o => { const w = rs.filter(r => r[q.key] === o.id && r.promoted).map(r => r.promoted); return `${o.id} ${w.length ? med(w) : '-'}`; }).join(', '));
const min = med(rs.map(r => r.watched)) * 3 + med(rs.map(r => r.turns)) * 0.5 + 60;
console.log(`예상 1회차: ${(min / 60).toFixed(1)}시간 (중계 경기 3분, 턴 30초, 이벤트·메뉴 60분 가정)`);
