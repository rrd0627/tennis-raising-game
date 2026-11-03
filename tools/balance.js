// 밸런스 테스트: 능력치 차이별 승률과 경기 통계
import { MatchSim, makeNpcTeam, quickMatch, mulberry32, aiChoices } from '../js/sim.js';
const rng = mulberry32(42);
function run(ra, rb, n = 1500) {
  let wins = 0, games = 0, pts = 0, shots = 0, aces = 0, df = 0, fsIn = 0, fsTot = 0, win = 0, err = 0, poach = 0;
  for (let i = 0; i < n; i++) {
    const A = makeNpcTeam(rng, ra, ['A1', 'A2']), B = makeNpcTeam(rng, rb, ['B1', 'B2']);
    const sim = new MatchSim(A, B, { rng });
    quickMatch(sim, g => { games++; pts += g.points.length; g.points.forEach(p => shots += p.shots.length); [0,1].forEach(t => sim.teams[t].choices = aiChoices(sim, t, rng)); });
    if (sim.winner === 0) wins++;
    sim.P.forEach(p => { aces += p.rec.aces; df += p.rec.df; fsIn += p.rec.fsIn; fsTot += p.rec.fsTot; win += p.rec.winners; err += p.rec.errors; poach += p.rec.poachWin; });
  }
  console.log(`${ra} vs ${rb}: A승률 ${(wins / n * 100).toFixed(1)}% | 게임/경기 ${(games / n).toFixed(1)} | 포인트/게임 ${(pts / games).toFixed(2)} | 샷/포인트 ${(shots / pts).toFixed(2)} | 1st% ${(fsIn / fsTot * 100).toFixed(0)} | 에이스 ${(aces / n).toFixed(1)} DF ${(df / n).toFixed(1)} 위너 ${(win / n).toFixed(1)} 범실 ${(err / n).toFixed(1)} 포치 ${(poach / n).toFixed(1)}`);
}
for (const [a, b] of [[40, 40], [45, 40], [50, 40], [55, 40], [60, 40], [30, 20], [75, 65], [70, 50]]) run(a, b);

// 플레이 방향을 고정했을 때와 주인공(A1)이 늦게 바꿨을 때 같은 실력끼리 승률
function runTempo(name, tempo, lead = Infinity, r = 40, n = 1500) {
  let wins = 0, errs = 0, shots = 0;
  for (let i = 0; i < n; i++) {
    const A = makeNpcTeam(rng, r, ['A1', 'A2']), B = makeNpcTeam(rng, r, ['B1', 'B2']);
    const sim = new MatchSim(A, B, { rng });
    if (tempo) A.choices.tempo = tempo;
    while (!sim.over) {
      sim.playGame(ev => (ev.kind === 'rally' && ev.next === 0 ? { lead } : undefined));
      sim.teams[1].choices = aiChoices(sim, 1, rng);
    }
    if (sim.winner === 0) wins++;
    const rec = sim.P[0].rec;
    errs += rec.errors; shots += Object.values(rec.shots).reduce((a, s) => a + s.n + s.err, 0);
  }
  console.log(`${name}: 승률 ${(wins / n * 100).toFixed(1)}% | 범실률 ${(errs / shots * 100).toFixed(1)}%`);
}
console.log('--- 플레이 방향 고정 (40 vs 40, 상대는 점수에 따라 바꿈)');
runTempo('공격적으로', 'attack');
runTempo('평소대로', 'normal');
runTempo('침착하게', 'safe');
console.log('--- 늦게 바꾼 경우 (주인공이 매번 치기 직전에 변경, 평소대로)');
for (const lead of [0.6, 0.45, 0.3, 0.15, 0]) runTempo(`${lead}초 전`, 'normal', lead);
