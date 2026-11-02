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

// 주인공(A1)이 항상 같은 샷을 고를 때 같은 실력끼리 승률. 어느 하나가 지나치게 높으면 안 된다.
function runIntent(name, input, r = 40, n = 1500) {
  let wins = 0, errs = 0, shots = 0;
  for (let i = 0; i < n; i++) {
    const A = makeNpcTeam(rng, r, ['A1', 'A2']), B = makeNpcTeam(rng, r, ['B1', 'B2']);
    const sim = new MatchSim(A, B, { rng });
    while (!sim.over) {
      sim.playGame(ev => (ev.kind === 'rally' && ev.next === 0 ? (typeof input === 'function' ? input(sim) : input) : undefined));
      [0, 1].forEach(t => { sim.teams[t].choices = aiChoices(sim, t, rng); });
    }
    if (sim.winner === 0) wins++;
    const rec = sim.P[0].rec;
    errs += rec.errors; shots += Object.values(rec.shots).reduce((a, s) => a + s.n + s.err, 0);
  }
  console.log(`${name}: 승률 ${(wins / n * 100).toFixed(1)}% | 범실률 ${(errs / shots * 100).toFixed(1)}%`);
}
console.log('--- 직접 고른 샷 (40 vs 40)');
const safe = { lead: Infinity };
runIntent('자동', { shot: 'auto', dir: 'auto', ...safe });
for (const shot of ['drive', 'slice', 'lob', 'drop']) runIntent(shot, { shot, dir: 'auto', ...safe });
for (const dir of ['cross', 'dtl', 'center', 'angle']) runIntent(`드라이브+${dir}`, { shot: 'drive', dir, ...safe });
const cycle = dirs => { let i = 0; return () => ({ shot: 'auto', dir: dirs[i++ % dirs.length], ...safe }); };
runIntent('코스 번갈아 (크로스·센터)', cycle(['cross', 'center']));
runIntent('코스 번갈아 (크로스·다운더라인·센터·앵글)', cycle(['cross', 'dtl', 'center', 'angle']));
const netUp = sim => sim.P.filter(p => p.team === 1).some(p => p.pos === 'net');
runIntent('상대 네트면 로브', sim => ({ shot: netUp(sim) ? 'lob' : 'auto', dir: 'auto', ...safe }));
runIntent('상대 둘 다 뒤면 드롭', sim => ({ shot: netUp(sim) ? 'auto' : 'drop', dir: 'auto', ...safe }));
console.log('--- 늦게 바꾼 경우 (매번 자동 샷을 치기 직전에 변경)');
for (const lead of [0.6, 0.45, 0.3, 0.15, 0]) runIntent(`${lead}초 전`, { shot: 'auto', dir: 'auto', lead });
