// 3년 자동 플레이: 성장 곡선, 돈, 대회 성적 확인
import * as G from '../js/game.js';
import { MatchSim, quickMatch, aiChoices } from '../js/sim.js';
import { PARTNERS } from '../js/data.js';
const ROUTINE = ['gym', 'group_lesson', 'stretch', 'private_lesson', 'gym', 'group_lesson', 'meditate', 'video', 'rest', 'rally', 'club', 'private_lesson', 'rally', 'family'];
function play(seedTag) {
  const s = G.newGame('테스트');
  s.routine = [...ROUTINE];
  const out = [];
  let matches = 0, wins = 0;
  while (!s.ending) {
    // 이벤트는 기본 선택
    while (s.pendingEvents.length) G.resolveEvent(s, s.pendingEvents.shift(), 'accept');
    // 초대 수락
    for (const m of s.inbox.filter(m => m.kind === 'invite' && m.status === 'pending')) G.answerInvite(s, m.id, 'accept');
    // 2주 뒤 대회에 직접 연락 (전국 우선)
    const up = s.calendar.filter(t => t.week === s.week + 2);
    for (const t of up.sort((a, b) => (a.type === 'national' ? -1 : 1))) {
      if (!G.canRegisterWeek(s, t.week)) break;
      const cands = PARTNERS.filter(p => !G.partnerAvailable(s, p.id, t.week)).sort((a, b) => s.partners[b.id].level - s.partners[a.id].level);
      if (cands[0]) G.requestPartner(s, t.id, cands[0].id);
    }
    G.runWeek(s);
    const tw = G.tournamentThisWeek(s);
    if (tw) {
      const tr = G.startTournament(s, tw.t.id);
      while (!tr.finished) {
        const { human, npc } = G.buildTeams(s, tr);
        const sim = new MatchSim(human, npc, { startFatigue: [tr.matchIdx * 2.5, tr.matchIdx * 2] });
        quickMatch(sim, () => { sim.teams[1].choices = aiChoices(sim, 1); });
        matches++; if (sim.winner === 0) wins++;
        G.recordMatch(s, tr, sim);
      }
      s.tournament = null;
    }
    G.endWeek(s);
    if ([13, 26, 52, 78, 104, 130, 156].includes(s.week - 1)) out.push(`w${s.week - 1}: 종합 ${G.overall(s.stats).toFixed(1)} 기술 ${['stroke','net','serve','course','counter'].map(g => G.groupAvg(s.stats, g).toFixed(0)).join('/')} 돈 ${(s.money / 10000).toFixed(0)}만 피로 ${s.fatigue.toFixed(0)} 스트레스 ${s.stress.toFixed(0)} ${s.division} 부상${s.injuries}`);
  }
  const by = {}; s.results.forEach(r => { const k = `${r.div}-${r.type}`; by[k] = by[k] || {}; by[k][r.stage] = (by[k][r.stage] || 0) + 1; });
  console.log(out.join('\n'));
  console.log('대회:', JSON.stringify(by), `경기 ${wins}/${matches}`, '국화 승급 주:', s.promotedWeek || '-', '엔딩:', s.ending.name);
}
for (let i = 0; i < 3; i++) { console.log(`--- run ${i}`); play(i); }
