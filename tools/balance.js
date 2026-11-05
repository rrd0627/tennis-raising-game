// 밸런스 테스트: 능력치 차이별 승률과 경기 통계
import { MatchSim, makeNpcTeam, quickMatch, mulberry32, aiChoices, PLAN_OPTS, PLAN_SET } from '../js/sim.js';
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

// 경기 전 작전별 같은 실력끼리 승률. 어느 하나가 지나치게 높으면 안 된다.
function runPlan(name, plan, r = 40, n = 1500, oppArch) {
  let wins = 0, errs = 0, shots = 0, comeback = 0;
  for (let i = 0; i < n; i++) {
    const A = makeNpcTeam(rng, r, ['A1', 'A2']), B = makeNpcTeam(rng, r, ['B1', 'B2'], oppArch);
    const sim = new MatchSim(A, B, { rng });
    Object.assign(A.choices, PLAN_SET[plan], { plan });
    let minDiff = 0;
    sim.teams[1].choices = aiChoices(sim, 1, rng);
    while (!sim.over) {
      sim.playGame();
      minDiff = Math.min(minDiff, sim.games[0] - sim.games[1]);
      sim.teams[1].choices = aiChoices(sim, 1, rng);
    }
    if (sim.winner === 0) { wins++; if (minDiff <= -2) comeback++; }
    const rec = sim.P[0].rec;
    errs += rec.errors; shots += Object.values(rec.shots).reduce((a, s) => a + s.n + s.err, 0);
  }
  console.log(`${name}: 승률 ${(wins / n * 100).toFixed(1)}% | 범실률 ${(errs / shots * 100).toFixed(1)}% | 2게임 뒤지다 역전 ${(comeback / n * 100).toFixed(1)}%`);
}
console.log('--- 경기 전 작전 (40 vs 40, 상대는 점수에 따라 바꿈)');
for (const p of PLAN_OPTS) runPlan(p.name, p.id);
console.log('--- 기술 (40 vs 40, 평소대로 사선진)');
function runSkill(name, skills, n = 1500) {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const A = makeNpcTeam(rng, 40, ['A1', 'A2']), B = makeNpcTeam(rng, 40, ['B1', 'B2']);
    A.players[0].skills = skills;
    const sim = new MatchSim(A, B, { rng });
    quickMatch(sim, () => { sim.teams[1].choices = aiChoices(sim, 1, rng); });
    if (sim.winner === 0) wins++;
  }
  console.log(`${name}: 승률 ${(wins / n * 100).toFixed(1)}%`);
}
runSkill('기술 없음', {});
for (const [k, n] of [['drop', '드롭'], ['smash', '스매시'], ['swing', '스윙발리'], ['read', '예측 수비']]) { runSkill(`${n} ○`, { [k]: 1 }); runSkill(`${n} ◎`, { [k]: 2 }); }
runSkill('전부 ○', { drop: 1, smash: 1, swing: 1, read: 1 });
runSkill('전부 ◎', { drop: 2, smash: 2, swing: 2, read: 2 });
console.log('--- 강타형 상대 (40 vs 40)');
for (const p of PLAN_OPTS) runPlan(p.name, p.id, 40, 1500, 'power');
