// 경기 해설(사용자 결정: 방송 캐스터와 해설). 캐스터는 상황과 결과를 부르고, 해설은 능력치와 작전을 짚는다.
// 글만 만든다. 화면에 띄우는 것은 ui.js(say). 승패와 엔진 난수에는 영향이 없다.
// 줄: { who: 'c'(캐스터) | 'a'(해설), text, pri } — pri가 높을수록 먼저 보이고, 낮은 줄은 밀리면 버린다.
import { STAT_GROUP_OF, STAT_NAME } from './data.js';
import { SHOT_NAME, PLAN_OPTS } from './sim.js';
import { closeCall } from './rally.js';

// 같은 말을 연달아 하지 않게 최근 줄은 피해서 고른다
let RECENT = [];
const pick = a => {
  const fresh = a.filter(x => !RECENT.includes(x));
  const t = (fresh.length ? fresh : a)[Math.floor(Math.random() * (fresh.length || a.length))];
  RECENT = [...RECENT.slice(-7), t];
  return t;
};
// 받침이 있으면 앞 글자, 없으면 뒤 글자: josa('포핸드', '이가') → '포핸드가'
export function josa(w, pair) {
  const c = w.charCodeAt(w.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return w + (has ? pair[0] : pair[1]);
}
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const C = (text, pri = 2) => ({ who: 'c', text, pri });
const A = (text, pri = 2) => ({ who: 'a', text, pri });
const GRADE_RANK = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
// 작전마다 힘을 내는 때(우마무스메의 각질 자리). 경기 전 VS 화면에 보인다
export const PLAN_STYLE = { power: '초반형', twoup: '속공형', twoback: '후반형', lob: '후반형' };

// 상대 성향 한마디 (data.js OPP_ARCH의 성향대로)
const ARCH_LINE = {
  allround: '크게 약한 데가 없는 팀이라 끈기 싸움이 될 거예요.',
  defense: '웬만한 공은 다 받아 내는 팀이에요. 서두르면 안 돼요.',
  attack: '초반부터 세게 칠 거예요. 첫 몇 게임을 잘 버텨야 해요.',
  speed: '발이 빨라서 웬만한 공은 다 쫓아가요.',
  smash: '네트로 나와서 높은 공을 때리는 팀이에요. 어설픈 로브는 위험해요.',
  control: '세지는 않은데 코스가 정말 좋아요. 구석구석 찔러 올 거예요.',
};
// 작전 한마디 (sim.js TUNE.plan의 성격대로)
const PLAN_LINE = {
  power: '초반에 밀어붙이는 작전인데, 길어지면 실수가 늘 수 있어요.',
  twoup: '둘이 네트로 나가서 빨리 끝내려는 거죠. 로브에 뒤가 빌 수 있어요.',
  twoback: '둘 다 뒤에서 버티는 작전이에요. 후반으로 갈수록 힘이 나요.',
  lob: '높고 느리게 넘기면서 상대가 먼저 무너지길 기다리는 거예요.',
};
const PLAN_LATE = {
  power: '강타로 밀어붙이던 {team}, 이제 실수가 조금씩 나올 때예요. 여기서 버텨야 해요.',
  twoup: '{team}, 네트 앞에서 계속 압박하고 있어요.',
  twoback: '이제부터가 끈질긴 작전의 시간이에요. {team} 힘이 나기 시작할 거예요.',
  lob: '느린 공에 상대가 지치기 시작할 때예요. {team} 작전이 먹힐 시간이에요.',
};

export function newCommentary(ctx) {
  // ctx: { names: [4], tourName, stage, archId, archName, plan: [우리, 상대], h2h }
  RECENT = [];
  return { ...ctx, streak: [0, 0], states: null, tbSaid: false, lateSaid: false, longSaid: false, calls: {} };
}
const teamName = (st, t) => `${st.names[t * 2]}·${st.names[t * 2 + 1]} 조`;
const who = (st, j) => `${st.names[j]} 선수`;

export function matchIntro(st) {
  const where = st.tourName.includes(st.stage) ? st.tourName : `${st.tourName} ${st.stage}`;   // '결승전 결승전'이 되지 않게
  const L = [C(`${where}, ${teamName(st, 0)}와 ${teamName(st, 1)}의 경기입니다.`, 3)];
  if (st.archName) L.push(A(`${teamName(st, 1)}는 ${st.archName} 스타일이에요. ${ARCH_LINE[st.archId] || ''}`, 3));
  if (st.h2h && st.h2h.w + st.h2h.l > 0) L.push(A(`두 팀은 전에 ${st.h2h.w + st.h2h.l}번 만났죠. ${st.h2h.w}승 ${st.h2h.l}패예요.`, 2));
  const plan = PLAN_OPTS.find(p => p.id === st.plan[0]);
  if (plan) L.push(A(`오늘 ${teamName(st, 0)}는 '${plan.name}' 작전으로 나왔어요. ${PLAN_LINE[plan.id]}`, 2));
  return L;
}

// 포인트 전 점수(prev: "40 - 30" 같은 글)로 누가 게임·매치 포인트인지
function pointsOf(prev, tb) {
  const p = (prev || '0 - 0').split(' - ');
  const m = { 0: 0, 15: 1, 30: 2, 40: 3 };
  return tb ? p.map(Number) : p.map(x => m[x] ?? 0);
}
function matchPointFor(pts, games, tb) {
  for (const t of [0, 1]) {
    const gp = tb ? pts[t] >= 6 && pts[t] > pts[1 - t] : pts[t] === 3;
    if (!gp) continue;
    const g = games[t] + 1, o = games[1 - t];
    if (tb || (g >= 6 && g - o >= 2) || g === 7) return t;
  }
  return null;
}

// 포인트 시작(서브 직전)
export function beforePoint(pt, prevScore, st) {
  const games = pt.games, tb = games[0] === 6 && games[1] === 6;
  const sTeam = pt.shots[0].h < 2 ? 0 : 1, rTeam = 1 - sTeam;
  if (tb && !st.tbSaid) { st.tbSaid = true; return [C('6 대 6! 타이브레이크에 들어갑니다.', 3)]; }
  const mp = matchPointFor(pointsOf(prevScore, tb), games, tb);
  if (mp !== null) return [C(pick([`매치 포인트! ${teamName(st, mp)}, 이 포인트면 승리입니다.`, `매치 포인트입니다. ${teamName(st, mp)}가 승리까지 한 포인트!`]), 3)];
  if (pt.label === '브레이크 포인트') return [C(pick([`브레이크 포인트! ${teamName(st, rTeam)}가 상대 서브 게임을 가져올 기회입니다.`, `브레이크 포인트입니다. ${teamName(st, sTeam)}, 여기서 지켜야 합니다.`]), 3)];
  if (pt.label === '듀스 결정 포인트') return [C(pick(['듀스! 이 한 포인트로 게임이 갈립니다.', '듀스입니다. 노애드라 이 포인트를 따는 쪽이 게임을 가져갑니다.']), 3)];
  return [];
}

// 샷 하나가 시작될 때 (랠리 중 짧은 외침)
export function duringShot(s, i, pt, st) {
  const n = pt.shots.slice(0, i + 1).filter(x => x.res !== 'fault').length;
  if (n === 6) return [C(pick(['랠리가 길어집니다.', '쉽게 끝나지 않네요.', '서로 물러서지 않습니다.']), 1)];
  if (n === 10) return [C(pick(['열 번째 랠리! 둘 다 물러서지 않습니다.', '랠리 10구째! 엄청난 집중력입니다.', '10구째! 누가 먼저 무너질까요.']), 1)];
  if (n === 15 || n === 20) {
    if (!st.longSaid) { st.longSaid = true; return [C(`${n}구째! 이런 랠리는 정말 보기 드뭅니다!`, 1)]; }
    return [C(pick([`${n}구째! 또 긴 랠리입니다.`, `${n}구째, 오늘 랠리가 정말 길어요.`, '끝까지 안 놓칩니다!']), 1)];
  }
  // 빗맞음(사용자 2026-11-13: 빗맞는 경우가 많다). 넘어가면 힘없는 공, 아니면 실수
  if (s.info?.mishit) return [C(s.res === 'in' ? pick(['빗맞았는데 넘어갑니다!', '아, 빗맞았어요. 공에 힘이 없습니다.']) : pick(['아, 빗맞았어요!', '라켓 가운데에 안 맞았네요.']), 1)];
  // 나가는 공을 쳐 버렸다(판단 실수)
  if (pt.shots[i - 1]?.outBall) return [C(pick(['아, 나가는 공인데 칩니다!', '나가는 공을 쳐 버렸어요!', '어, 그건 나가는 공이었는데요!']), 2)];
  const pj = (s.mv || []).findIndex(m => m && m.k === 'poach');
  if (pj >= 0) return [C(pick([`${who(st, pj)} 포치 나갑니다!`, `포치! ${who(st, pj)}가 가로질러 나옵니다!`]), 1)];
  if (/lob|moon/.test(s.type) && s.res === 'in' && i < pt.shots.length - 1 && st.lobPt !== pt && Math.random() < 0.35) { st.lobPt = pt; return [C(pick(['로브! 머리 위로 넘깁니다.', '높이 띄웁니다!']), 1)]; }
  return [];
}

// 능력치 글자 한 개에 대한 해설 한마디
function callLine(c, st) {
  const grp = STAT_GROUP_BY_NAME[c.t];
  const us = c.j < 2, nm = who(st, c.j), stat = c.t, gr = c.g;
  if (!us) return pick([`상대 ${nm}의 ${stat}, 무섭네요.`, `${teamName(st, 1)}, ${josa(stat, '이가')} 정말 좋아요.`]);
  if (grp === 'physical') {
    if (stat === '스태미나') return pick([`긴 랠리에도 지치지 않아요. 스태미나 ${gr}, 체력이 받쳐 주네요.`, `${nm}, 끝까지 발이 안 멈춰요. 스태미나가 좋은 선수예요.`]);
    if (stat === '파워') return pick([`공에 힘이 실려 있어요. 파워 ${gr}!`, `${nm}, 공이 묵직해요. 파워가 정말 좋아졌어요.`]);
    return pick([`그걸 받아 내네요! ${stat} ${gr}, ${nm} 발이 정말 좋아요.`, `저 공에 닿는 건 ${stat} 덕분이에요. ${josa(stat, '을를')} 많이 키웠나 봐요.`, `${nm}, ${stat} ${gr}! 끝까지 쫓아가요.`]);
  }
  if (grp === 'counter') return pick([`${stat} ${gr}! 까다로운 공을 편하게 받아요.`, `${josa(stat, '을를')} 연습한 보람이 있네요. 흔들림이 없어요.`]);
  if (grp === 'mental') {
    if (stat === '집중력') return pick([`끝까지 집중을 놓지 않네요. 집중력 ${gr}!`, `${nm}, 긴 랠리에서도 실수가 없어요. 집중력이 대단해요.`]);
    return pick([`이런 큰 포인트에서 흔들리지 않아요. ${stat} ${gr}!`, `${nm}, 큰 경기에 강한 선수예요. ${josa(stat, '이가')} 좋아요.`]);
  }
  if (stat === '샷 선택') return pick([`잘 봤어요! 끝까지 보고 보냈어요. 샷 선택 ${gr}.`, `${nm}, 나가는 공에 라켓을 안 대요. 판단이 좋아요.`]);
  if (grp === 'tactics') return pick([`${stat} ${gr}! 타이밍이 기가 막혀요.`, `${nm}, 읽고 움직이는 게 달라요. ${josa(stat, '이가')} 좋네요.`]);
  return pick([`${stat} ${gr}! 정말 잘 다듬어진 공이에요.`, `오늘 ${nm} ${josa(stat, '이가')} 좋네요.`, `${nm}의 ${stat}, 연습한 그대로 나오네요.`]);
}
// 능력치 이름 → 무리(글자에는 이름만 있어서 거꾸로 찾는다)
const STAT_GROUP_BY_NAME = Object.fromEntries(Object.entries(STAT_NAME).map(([k, v]) => [v, STAT_GROUP_OF[k]]));

// 포인트가 끝난 뒤: 캐스터가 결과를, 해설이 능력치를
export function afterPoint(pt, st) {
  const L = [];
  const last = pt.shots[pt.shots.length - 1];
  const by = who(st, pt.by), shot = SHOT_NAME[last.type] || '샷';
  const v = { by, shot, shotI: josa(shot, '이가') };
  const R = {
    ace: [`서브 에이스! ${by}, 손도 못 대게 합니다.`, `에이스! ${by}의 서브가 깨끗하게 꽂힙니다.`],
    df: [`더블폴트. ${by}, 아쉬운 실점입니다.`, '아, 더블폴트가 나옵니다.'],
    win: [pt.text, `${by}의 ${shot}! 위너입니다!`, `받을 수 없는 공! ${by}의 ${shot}!`],
    poach: [`${by} 포치! 가로채서 끝냅니다!`, `포치 성공! ${by}가 네트에서 끊어 냅니다!`],
    center: ['센터! 두 선수 사이로 빠집니다.', '가운데로! 서로 미루다 놓칩니다.'],
    err: last.res === 'net' ? [`${by}의 ${shot}, 네트에 걸립니다.`, '아, 네트!'] : [fill('{shotI} 라인을 벗어납니다.', v), `아웃! ${by}, 아쉽습니다.`],
  };
  L.push(C(pick(R[pt.endType] || [pt.text]), 2));
  // 위너가 곁을 지나가며 라켓이나 몸에 맞았다(중계가 정한다)
  if (last.touched === 'frame') L.push(C(pick([`${who(st, last.victim)}, 라켓에 맞았지만 밀렸어요!`, '건드렸어요! 하지만 공이 너무 셉니다.']), 2));
  else if (last.touched === 'body') L.push(C(pick([`아, ${who(st, last.victim)} 몸에 맞습니다!`, '몸에 맞았어요! 피할 틈이 없었네요.']), 2));
  // 나가는 공을 끝까지 보고 보냈다
  if (last.judge !== undefined && !(last.call || []).some(c => c.t === '샷 선택')) L.push(C(pick(['끝까지 보고 보냅니다. 아웃!', '잘 봤어요, 나가는 공이에요.']), 1));
  const cc = closeCall(last);
  if (cc === 'line') L.push(C(pick(['라인에 딱 걸칩니다!', '라인 위에 떨어집니다! 정말 아슬아슬해요.']), 2));
  else if (cc === 'out') L.push(C(pick(['아슬아슬하게 벗어납니다!', '정말 조금 나갔어요!']), 1));
  // 능력치 글자: 우리 팀 것이 있으면 그중 등급이 가장 높은 것, 없으면 가끔 상대 것
  const calls = pt.shots.flatMap(s => s.call || []);
  for (const c of calls) if (c.j < 2) st.calls[c.j + '|' + c.t] = { j: c.j, t: c.t, g: c.g, n: (st.calls[c.j + '|' + c.t]?.n || 0) + 1 };
  const best = list => list.reduce((a, b) => (!a || GRADE_RANK[b.g] >= GRADE_RANK[a.g] ? b : a), null);
  const mine = best(calls.filter(c => c.j < 2)), theirs = best(calls.filter(c => c.j >= 2));
  if (mine) L.push(A(callLine(mine, st), 2));
  else if (theirs && Math.random() < 0.5) L.push(A(callLine(theirs, st), 1));
  // 연속 득점
  const w = pt.winner;
  st.streak[w]++; st.streak[1 - w] = 0;
  if (st.streak[w] >= 3 && !mine) L.push(C(`${teamName(st, w)}, 연속 ${st.streak[w]}포인트!`, 1));
  // 몰입과 흔들림
  if (st.states) for (const j of [0, 1]) {
    const a = st.states[j], b = pt.states[j];
    if (a !== b && b === 'zone') L.push(A(`${who(st, j)} 지금 완전히 몰입했어요. 오늘 공이 잘 맞는 날이네요.`, 1));
    if (a !== b && b === 'tilt') L.push(A(`${who(st, j)}, 조금 흔들리는 것 같아요. 한 포인트씩 차분하게 가야 해요.`, 1));
  }
  st.states = pt.states;
  return L;
}

// 게임이 끝난 뒤
export function afterGame(g, games, gameNo, st) {
  const L = [];
  const w = g.gameWinner, held = w === g.serveTeam;
  L.push(C(held ? pick([`${teamName(st, w)}, 서브 게임을 지킵니다. 게임 스코어 ${games[0]} 대 ${games[1]}.`, `게임, ${teamName(st, w)}. ${games[0]} 대 ${games[1]}.`])
    : pick([`브레이크! ${teamName(st, w)}가 상대 서브 게임을 가져옵니다. ${games[0]} 대 ${games[1]}.`, `브레이크입니다! 게임 스코어 ${games[0]} 대 ${games[1]}.`]), 3));
  if (!st.lateSaid && gameNo >= 6) {
    st.lateSaid = true;
    const t = st.plan[0] === 'power' || st.plan[0] === 'twoback' || st.plan[0] === 'lob' ? 0 : st.plan[1] === 'power' ? 1 : 0;
    const line = PLAN_LATE[st.plan[t]];
    if (line) L.push(A(fill(line, { team: teamName(st, t) }), 2));
  }
  return L;
}
export function chaseLine(st) {
  return [A(st.plan[0] === 'twoback' || st.plan[0] === 'lob' ? '끈질기게 버틴 게 통하고 있어요. 상대 실수가 늘었어요.' : '흐름이 완전히 넘어왔어요! 따라붙습니다.', 3)];
}

// 경기가 끝난 뒤
export function matchEnd(winner, games, comeback, st) {
  const L = [C(`경기 끝! ${teamName(st, winner)}가 ${Math.max(...games)} 대 ${Math.min(...games)}로 이깁니다!`, 4)];
  const top = Object.values(st.calls).sort((a, b) => b.n - a.n || GRADE_RANK[b.g] - GRADE_RANK[a.g])[0];
  if (winner === 0 && comeback) L.push(A('초반에 밀렸는데 끝까지 버텨서 뒤집었어요. 대단한 경기였어요.', 4));
  else if (top && winner === 0) L.push(A(`오늘은 ${who(st, top.j)}의 ${josa(top.t, '이가')} 빛났어요. ${top.n}번이나 승부를 갈랐죠.`, 4));
  else if (top) L.push(A(`아쉽네요. 그래도 ${who(st, top.j)}의 ${josa(top.t, '은는')} 충분히 통했어요.`, 4));
  return L;
}

// 이 포인트의 무게(중계의 절정 연출용). L: 0 보통, 1 큰 포인트, 2 브레이크 포인트·늦은 듀스·타이브레이크 막판, 3 매치 포인트.
// for: 누구에게 기회인지(0 우리, 1 상대, null 둘 다). prevScore는 이 포인트 전 점수
export function stakesOf(pt, prevScore) {
  const games = pt.games, tb = games[0] === 6 && games[1] === 6;
  const p = pointsOf(prevScore, tb), sTeam = pt.shots[0].h < 2 ? 0 : 1;
  const mp = matchPointFor(p, games, tb);
  if (mp !== null) return { L: 3, for: mp, label: '매치 포인트' };
  if (!pt.big) return { L: 0, for: null, label: '' };
  if (pt.label === '브레이크 포인트') return { L: 2, for: 1 - sTeam, label: pt.label };
  if (tb && Math.max(...p) >= 5) return { L: 2, for: null, label: '타이브레이크' };
  if (pt.label === '듀스 결정 포인트' && games[0] + games[1] >= 8) return { L: 2, for: null, label: pt.label };
  return { L: 1, for: null, label: pt.label || '' };
}
// 이 게임으로 경기가 끝날 수 있나(승부처). games는 게임 시작 때 스코어
export function climaxOf(games) {
  const tb = games[0] === 6 && games[1] === 6;
  const can = [0, 1].map(t => { const g = games[t] + 1, o = games[1 - t]; return tb || (g >= 6 && g - o >= 2) || g === 7; });
  return { tb, can, on: can[0] || can[1] };
}
export function climaxLine(c, st) {
  if (c.tb || !c.on) return [];   // 타이브레이크는 beforePoint가 부른다
  if (c.can[0]) return [C(pick([`승리까지 한 게임! ${teamName(st, 0)}, 이 게임을 가져가면 경기가 끝납니다.`, `${teamName(st, 0)}, 여기서 끝낼 수 있을까요. 승부처입니다!`]), 3)];
  return [C(pick([`${teamName(st, 1)}가 이 게임을 가져가면 경기가 끝납니다. 버텨야 합니다.`, '벼랑 끝입니다. 이 게임을 내주면 끝입니다.']), 3)];
}

// 넷 코드(중계 연출)
export function netCordLine() { return [C(pick(['넷! 테이프를 맞고 넘어갑니다!', '넷 코드! 행운이 따릅니다.']), 2)]; }
// 흐름이 넘어갈 때
export function flowLine(team, st) {
  return [A(team === 0 ? pick(['흐름이 완전히 넘어왔어요!', '분위기가 바뀌었어요. 지금이 기회예요.']) : pick([`흐름이 ${teamName(st, 1)} 쪽으로 넘어갔어요.`, '분위기가 넘어갔어요. 한 포인트로 끊어야 해요.']), 3)];
}
// 작전이 힘을 낼 때: grit(뒤질 때 끈질김), late(후반 스퍼트), rush(초반 러시)
export const SURGE_LABEL = { grit: '끈질김 발동!', late: '후반 스퍼트!', rush: '초반 러시!' };
export function surgeLine(kind, team, st) {
  const tn = teamName(st, team);
  const T = {
    grit: `${tn}, 끈질김이 발동했어요! 뒤질수록 회복탄력성과 스태미나로 버텨요.`,
    late: `${tn}, 후반 스퍼트! 이제부터 작전이 힘을 내는 시간이에요.`,
    rush: `${tn}, 초반 러시예요. 강타가 가장 무서운 시간이에요.`,
  };
  return T[kind] ? [A(T[kind], 3)] : [];
}
// 코트 교대(홀수 게임 뒤): 파트너가 주인공에게 한마디. comm = 파트너 소통 능력치
export function changeover(games, st, comm, grade) {
  const d = games[0] - games[1];
  const t = d > 0 ? pick(['좋아요, 이대로만 가요!', '지금 공 좋아요. 계속 밀어붙여요.', '한 게임 한 게임, 지금처럼요.'])
    : d === 0 ? pick(['한 게임씩 가요.', '괜찮아요, 우리 할 수 있어요.', '지금부터예요. 집중해요.'])
    : pick(['괜찮아요, 아직 몰라요.', '하나씩 따라가요. 끝까지 가요!', '제가 더 움직일게요. 같이 버텨요.']);
  const L = [{ who: 'p', name: st.names[1], text: t, pri: 2 }];
  if (comm >= 55 && Math.random() < 0.5) L.push(A(`파트너 소통 ${grade}, 둘이 말이 잘 통하네요.`, 1));
  return L;
}
