// 3년 자동 플레이: 성장 곡선, 대회 성적, 승급 시점, 예상 플레이 시간
// node tools/season.js [횟수]  첫 회차만 곡선을 자세히 찍고, 나머지는 요약한다.
import * as G from '../js/game.js';
import { MatchSim, quickMatch, aiChoices } from '../js/sim.js';
import { PARTNERS, TRAIN_IDS, BIG_STATS } from '../js/data.js';

const RUNS = +process.argv[2] || 30;
const TOUR_GAP = 4; // 월 1회 출전을 적정선으로 본다

function chooseTraining(s) {
  const big = G.bigValues(s.stats);
  const avgBig = Object.values(big).reduce((a, b) => a + b, 0) / BIG_STATS.length;
  const score = id => {
    const p = G.previewAction(s, id);
    // 낮은 능력치를 우선해서 고르게 키운다
    const gain = p.gains.reduce((a, [b, g]) => a + g * Math.max(0.2, 1 + (avgBig - big[b]) / 15), 0);
    return gain - p.injury * 8;
  };
  return TRAIN_IDS.reduce((a, b) => (score(b) > score(a) ? b : a));
}

function play(detail) {
  const s = G.newGame('테스트');
  let matches = 0, wins = 0, last = -99;
  const out = [];
  while (!s.ending) {
    while (s.pendingEvents.length) {
      const ev = s.pendingEvents.shift();
      const yes = ev.id === 'invite' ? s.week - last >= TOUR_GAP - 2 && s.fatigue < 60 : true;
      G.resolveEvent(s, ev, yes ? 'accept' : 'refuse');
    }
    let tw = G.tournamentThisWeek(s);
    const open = G.openTournament(s);
    if (!tw && open && !s.injury && !s.overtime && s.fatigue < 60 && (open.type === 'national' ? s.week - last >= 3 : s.week - last >= TOUR_GAP)) {
      const cands = PARTNERS.filter(p => !G.partnerAvailable(s, p.id, s.week)).sort((a, b) => s.partners[b.id].level - s.partners[a.id].level);
      for (const p of cands) { if (G.askPartner(s, open.id, p.id).ok) break; }
      tw = G.tournamentThisWeek(s);
    }
    if (tw) {
      const tr = G.startTournament(s, tw.t.id);
      last = s.week;
      while (!tr.finished) {
        const { human, npc } = G.buildTeams(s, tr);
        const sim = new MatchSim(human, npc, { startFatigue: [tr.matchIdx * 2.5 + s.fatigue / 20, tr.matchIdx * 2] });
        quickMatch(sim, () => { sim.teams[1].choices = aiChoices(sim, 1); });
        matches++; if (sim.winner === 0) wins++;
        G.recordMatch(s, tr, sim);
      }
      s.tournament = null;
    } else {
      let act;
      if (s.overtime) act = 'overtime';
      else if (s.injury) act = s.stress > 50 ? 'family' : 'rest';
      else if (s.stress > 55) act = 'family';
      else if (s.fatigue > 45) act = 'rest';
      else act = chooseTraining(s);
      G.runWeek(s, act);
    }
    G.endWeek(s);
    if (detail && [13, 26, 39, 52, 78, 104, 130, 156].includes(s.week - 1)) {
      const b = G.bigValues(s.stats);
      out.push(`w${s.week - 1}: 종합 ${G.overall(s.stats).toFixed(1)} ${BIG_STATS.map(x => `${x.name} ${b[x.id].toFixed(0)}`).join(' ')} 피로 ${s.fatigue.toFixed(0)} 스트레스 ${s.stress.toFixed(0)} ${s.division} 부상${s.injuries}`);
    }
  }
  if (detail) console.log(out.join('\n'));
  return { promoted: s.promotedWeek || null, matches, wins, tours: s.results.length, overall: G.overall(s.stats), injuries: s.injuries, ending: s.ending.name, goals: s.goalsDone.length, titles: s.titles };
}

const rs = [];
for (let i = 0; i < RUNS; i++) rs.push(play(i === 0));
const med = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const range = xs => `${Math.min(...xs)}~${Math.max(...xs)} (중앙값 ${med(xs)})`;
const prom = rs.map(r => r.promoted).filter(Boolean);
const count = key => { const m = {}; rs.forEach(r => { m[r[key]] = (m[r[key]] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '); };
console.log(`--- ${RUNS}회 요약`);
console.log(`국화 승급 주: ${prom.length ? range(prom) : '없음'} | 승급 ${prom.length}/${RUNS}회 | 85~120주 ${prom.filter(w => w >= 85 && w <= 120).length}회`);
console.log(`대회: ${range(rs.map(r => r.tours))} | 경기: ${range(rs.map(r => r.matches))} | 승률 ${(rs.reduce((a, r) => a + r.wins, 0) / rs.reduce((a, r) => a + r.matches, 0) * 100).toFixed(0)}%`);
console.log(`최종 종합: ${range(rs.map(r => Math.round(r.overall)))} | 부상: ${range(rs.map(r => r.injuries))} | 달성 목표: ${range(rs.map(r => r.goals))}`);
console.log(`엔딩: ${count('ending')}`);
const min = med(rs.map(r => r.matches)) * 3 + 156 * 0.5 + 60;
console.log(`예상 1회차: ${(min / 60).toFixed(1)}시간 (경기 3분, 턴 30초, 이벤트·메뉴 60분 가정)`);
