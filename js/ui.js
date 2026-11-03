// 화면 — 타이틀, 인트로, 주간 행동, 결과, 메신저, 대회·랭킹, 능력치, 대회/경기, 엔딩
import * as G from './game.js';
import {
  STAT_GROUPS, STAT_NAME, GROUP_BY_ID, ACT, ACTIONS, BIG_STATS, INTRO_SCENES, DAY_NAMES, PARTNERS, PARTNER,
  grade, weekInfo, STAGE_NAME,
} from './data.js';
import { MatchSim, aiChoices, CHOICE_DEFS, LOCKED_SHOT_OPTS, TEMPO_OPTS, SHOT_NAME, TUNE } from './sim.js';
import { MatchView, webglOK } from './match3d.js';
import { portraitURL, PLAYER_LOOK, oppLook } from './art.js';

const app = document.getElementById('app');
let S = null;
const V = { screen: 'title', tab: null, thread: null, sheet: null, bg: 'none', scene: 0 };
let M = null; // 경기 진행 상태
let introTimer = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => (b ? Math.round(a / b * 100) + '%' : '-');
const signed = v => `${v >= 0 ? '+' : ''}${Math.round(v)}`;
// 받침에 맞는 조사: 김하나와, 이수민과
const withJosa = name => { const c = name.charCodeAt(name.length - 1) - 0xAC00; return name + (c >= 0 && c % 28 ? '과' : '와'); };
const COND = ['😣', '😕', '🙂', '😊', '🤩'];
const BIG_NAME = Object.fromEntries(BIG_STATS.map(b => [b.id, b.name]));
const LOOKS = {
  me: () => PLAYER_LOOK, coach: () => ({ hair: '#2b2b2b', outfit: '#2f6fda', band: '#2f6fda' }),
  boss: () => ({ hair: '#5a5a5a', outfit: '#5b6270', band: '#5b6270', skin: '#f5d6c0' }), club: () => ({ hair: '#7a5230', outfit: '#9ad0a8', band: '#ffffff' }),
};
function lookOf(id) { if (LOOKS[id]) return LOOKS[id](); if (PARTNER[id]) return { ...PARTNER[id].color, band: '#ffffff' }; return PLAYER_LOOK; }
function whoName(id) { return { me: S?.name, coach: '코치님', boss: '팀장님', club: '클럽 회장님', system: '알림' }[id] || PARTNER[id]?.name || id; }
function portrait(id, expr = 'base', cls = 'pt') { return id === 'system' ? `<div class="${cls} sys">🎾</div>` : `<img class="${cls}" data-portrait="${id}" data-expr="${expr}" alt="${esc(whoName(id))}">`; }
async function hydratePortraits() {
  for (const img of app.querySelectorAll('img[data-portrait]')) {
    const id = img.dataset.portrait;
    if (id.startsWith('opp:')) { const [, seed, k] = id.split(':'); img.src = await portraitURL(id, oppLook(+seed, +k), img.dataset.expr); }
    else img.src = await portraitURL(id === 'me' ? 'player' : id, lookOf(id), img.dataset.expr);
  }
}
function toast(msg, ms = 2200) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg;
  document.body.appendChild(t); setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 400);
}

export function start() {
  S = G.load();
  V.screen = 'title';
  render();
  app.addEventListener('click', onClick);
}

function render() {
  const fn = SCREENS[V.screen] || SCREENS.title;
  app.innerHTML = fn();
  app.scrollTop = 0;
  hydratePortraits();
}

// ── 타이틀 ────────────────────────────────────────────────
const BGS = [['none', '평범한 직장인', '균형'], ['sport', '학창시절 운동부', '스태미나·스피드'], ['badminton', '배드민턴 경험자', '스매시·발리'], ['study', '공부 체질', '분석·샷 선택']];
const SCREENS = {
  title: () => `
    <div class="screen title">
      <div class="logo"><div class="ball">🎾</div><h1>테니스 선수<br>키우기</h1><p>개나리에서 국화까지, 직장인 3년 육성기</p></div>
      ${portrait('me', 'smile', 'title-pt')}
      ${S && !S.ending ? `<button class="btn primary big" data-a="continue">이어하기 · ${esc(S.name)} (${weekInfo(Math.min(S.week, 156)).label})</button>` : ''}
      <button class="btn ${S && !S.ending ? '' : 'primary'} big" data-a="new">새 게임</button>
      <p class="tiny">임시 그림으로 표시 중입니다.</p>
    </div>`,

  intro: () => {
    const s = INTRO_SCENES[V.scene];
    return `<div class="screen intro" data-a="introNext" style="--bg:${s.bg}">
      <button class="introskip" data-a="introSkip">건너뛰기 ›</button>
      <div class="scene"><div class="ic">${s.icon}</div><p>${esc(s.text)}</p></div>
      <div class="dots">${INTRO_SCENES.map((_, i) => `<i class="${i === V.scene ? 'on' : ''}"></i>`).join('')}</div>
    </div>`;
  },

  namein: () => `
    <div class="screen title">
      ${portrait('me', 'smile', 'title-pt')}
      <div class="card newgame">
        <label>이름 <input id="pname" maxlength="8" placeholder="주인공 이름" value=""></label>
        <div class="lbl">학창 시절</div>
        <div class="chips">${BGS.map(([id, n, d]) => `<button class="chip ${V.bg === id ? 'on' : ''}" data-a="bg" data-id="${id}">${n}<small>${d}</small></button>`).join('')}</div>
        <button class="btn primary big" data-a="start">레슨 첫날 ▶</button>
      </div>
    </div>`,

  week: () => {
    const wi = weekInfo(S.week);
    const big = G.bigValues(S.stats), goal = G.currentGoal(S), tw = G.tournamentThisWeek(S);
    const alerts = [];
    if (S.injury) alerts.push(`<div class="alert bad">🩹 ${esc(S.injury.name)} — ${S.injury.weeks}주 남음. 테니스 훈련과 대회를 못 한다.</div>`);
    if (S.slump) alerts.push(`<div class="alert bad">🌧️ 슬럼프 — 훈련 효과 절반. 스트레스를 낮추자.</div>`);
    const nextT = Object.entries(S.entries).map(([tid, e]) => ({ t: G.tour(S, tid), e })).filter(x => x.t.week > S.week).sort((a, b) => a.t.week - b.t.week)[0];
    if (nextT) alerts.push(`<div class="alert">📅 ${nextT.t.week - S.week}주 뒤 ${esc(nextT.t.name)} 출전 · ${esc(PARTNER[nextT.e.partner].name)}</div>`);
    let moves;
    if (tw) moves = `<div class="alert tour">🏆 이번 주 <b>${esc(tw.t.name)}</b> ${S.division}부 · 파트너 ${esc(PARTNER[tw.entry.partner].name)}</div><button class="btn primary big" data-a="tourgo">대회 출전하기 ▶</button>`;
    else if (S.overtime) moves = `<div class="alert bad">💼 이번 주는 마감 야근이다. 훈련은 다음 주로.</div><button class="btn primary big" data-a="act" data-id="overtime">야근하고 한 주 넘기기 ▶</button>`;
    else moves = `<div class="lbl">이번 주에 할 일 하나를 고르세요</div><div class="moves">${ACTIONS.filter(a => a.id !== 'overtime').map(moveCard).join('')}${tourCard()}</div>`;
    return `
    <div class="screen week">
      <header class="topbar">
        <div><div class="wk">${wi.label}</div><div class="sub">${S.week}/156주 · ${esc(S.name)}</div></div>
        <div class="badge div-${S.division}">${S.division === '국화' ? '🌼' : '🌱'} ${S.division}부</div>
      </header>
      ${goal ? `<div class="goal"><span>🎯</span><div><b>${esc(goal.text)}</b><small>${goal.left}주 남음</small></div></div>` : ''}
      <div class="status">
        ${portrait('me', S.fatigue >= 70 ? 'tired' : S.condition > 0 ? 'smile' : 'base', 'pt sm')}
        <div class="gauges">
          ${gauge('피로', S.fatigue, S.fatigue >= 60 ? 'bad' : '')}
          ${gauge('스트레스', S.stress, S.stress >= 60 ? 'bad' : '')}
        </div>
        <div class="cond" title="컨디션">${COND[S.condition + 2]}<small>컨디션</small></div>
      </div>
      <button class="bigstats" data-a="go" data-s="stats">${BIG_STATS.map(b => `<div><small>${b.name}</small><b>${Math.round(big[b.id])}<em class="g g-${grade(big[b.id])}">${grade(big[b.id])}</em></b></div>`).join('')}</button>
      ${alerts.join('')}
      ${moves}
      <nav class="bottom">
        <button class="nb" data-a="go" data-s="msg">💬<span>메신저</span>${G.unread(S) ? `<i>${G.unread(S)}</i>` : ''}</button>
        <button class="nb" data-a="go" data-s="tours">🏆<span>대회·랭킹</span></button>
        <button class="nb" data-a="go" data-s="stats">📊<span>능력치</span></button>
      </nav>
      ${V.sheet === 'partner' ? pickerHTML() : ''}
      ${S.pendingEvents.length ? eventHTML(S.pendingEvents[0]) : ''}
    </div>`;
  },

  result: () => {
    const L = S.weekLog, a = ACT[L.act];
    const gains = Object.entries(L.gains).sort((x, y) => y[1] - x[1]);
    return `
    <div class="screen result">
      <header class="topbar"><div><div class="wk">${weekInfo(L.week).label}</div><div class="sub">이번 주 결과</div></div></header>
      <div class="card resultcard">
        <div class="resulthead"><span>${a.icon}</span><h3>${a.name}${a.train ? ' 훈련' : ''}</h3></div>
        ${L.with ? `<div class="with">${portrait(L.with, 'smile', 'pt xs')}<span>${L.with === 'coach' ? '코치님과 함께 훈련했다 (효과 +20%)' : `${esc(withJosa(PARTNER[L.with].name))} 함께 훈련했다 (효과 +25%, 친밀도·콤비↑)`}</span></div>` : ''}
        ${gains.length ? `<div class="gains">${gains.map(([id, g]) => `<span>${BIG_NAME[id]} <b>+${g.toFixed(1)}</b></span>`).join('')}</div>` : ''}
        <div class="row2"><div><small>피로</small><b>${Math.round(S.fatigue)} (${signed(L.fatigue)})</b></div><div><small>스트레스</small><b>${Math.round(S.stress)} (${signed(L.stress)})</b></div></div>
      </div>
      <div class="actions"><button class="btn primary big" data-a="endweek">다음 주로 ▶</button></div>
    </div>`;
  },

  msg: () => {
    const threads = {};
    for (const m of S.inbox) { (threads[m.from] = threads[m.from] || []).push(m); }
    if (V.thread) {
      const list = threads[V.thread] || [];
      list.forEach(m => { m.read = true; });
      return `
      <div class="screen msg">
        <header class="topbar"><button class="back" data-a="thread" data-id="">‹</button><div class="wk">${esc(whoName(V.thread))}</div>${PARTNER[V.thread] ? `<div class="sub">${esc(PARTNER[V.thread].arch)}</div>` : ''}</header>
        <div class="chat">${list.map(m => bubble(m)).join('')}</div>
      </div>`;
    }
    const keys = Object.keys(threads).sort((a, b) => Math.max(...threads[b].map(m => m.id)) - Math.max(...threads[a].map(m => m.id)));
    return `
    <div class="screen msg">
      <header class="topbar"><button class="back" data-a="go" data-s="week">‹</button><div class="wk">메신저</div></header>
      <div class="threads">${keys.map(k => {
        const l = threads[k][threads[k].length - 1];
        const n = threads[k].filter(m => !m.read).length;
        return `<button class="thread" data-a="thread" data-id="${k}">${portrait(k, 'smile', 'pt sm')}<div><b>${esc(whoName(k))}</b><p>${esc(l.text)}</p></div>${n ? `<i>${n}</i>` : ''}</button>`;
      }).join('')}</div>
    </div>`;
  },

  tours: () => {
    const tab = V.tab || 'cal';
    const head = `<header class="topbar"><button class="back" data-a="go" data-s="week">‹</button><div class="wk">대회·랭킹</div><div class="badge div-${S.division}">${S.division}부</div></header>
      <div class="tabs"><button class="${tab === 'cal' ? 'on' : ''}" data-a="tab" data-id="cal">대회 달력</button><button class="${tab === 'rank' ? 'on' : ''}" data-a="tab" data-id="rank">랭킹</button></div>`;
    if (tab === 'rank') {
      const rows = ['national', 'local'].map(type => {
        const pts = G.myPoints(S, S.division, type);
        const r = G.rankOf(S, S.division, type, pts);
        return `<div class="rank"><div><b>${type === 'national' ? '전국 랭킹' : '비전국 랭킹'}</b><small>${type === 'national' ? '전국대회 시드 (상위 16팀)' : '비전국대회 시드 (상위 8팀)'}</small></div><div class="big">${r ? r + '위' : '-'}</div><div>${pts}점</div></div>`;
      }).join('');
      const res = [...S.results].reverse().slice(0, 30);
      return `<div class="screen tours">${head}
        <div class="card">${rows}<p class="muted">포인트는 1년이 지나면 사라집니다. 팀 시드는 두 사람 포인트의 합으로 정합니다.</p></div>
        <div class="card"><h3>우승 기록</h3><p>개나리부 비전국 ${S.titles.local}회 · 전국 ${S.titles.national}회 · 국화부 비전국 ${S.titles.gukwhaLocal}회 · 전국 ${S.titles.gukwhaNational}회</p></div>
        <div class="card"><h3>최근 성적</h3>${res.length ? res.map(r => `<div class="resrow"><span>${weekInfo(r.week).label}</span><b>${esc(r.name)}</b><span class="tag ${r.type}">${r.type === 'national' ? '전국' : '비전국'}</span><span>${r.div}부</span><b class="st st-${r.stage}">${STAGE_NAME[r.stage]}</b><span>${esc(PARTNER[r.partner].name)}</span></div>`).join('') : '<p class="muted">아직 출전 기록이 없다.</p>'}</div>
      </div>`;
    }
    const up = S.calendar.filter(t => t.week >= S.week && t.week < S.week + 12);
    return `<div class="screen tours">${head}
      <p class="hint">개나리부 <b>전국대회</b>에서 우승하면 국화로 승급합니다. 대회 주에 출전을 고르면 파트너에게 연락할 수 있어요. 한 달에 한 번쯤이 적당합니다.</p>
      <div class="cal">${up.map(t => {
        const e = S.entries[t.id];
        const act = e ? `<span class="ok">출전 · ${esc(PARTNER[e.partner].name)}</span>` : t.week === S.week ? `<span class="muted">이번 주</span>` : '';
        return `<div class="trow ${t.type}"><div class="tw">${weekInfo(t.week).label.split(' · ')[1]}<small>${DAY_NAMES[t.day]}요일</small></div><div class="tn"><b>${esc(t.name)}</b><small><span class="tag ${t.type}">${t.type === 'national' ? '전국' : '비전국'}</span></small></div><div class="ta">${act}</div></div>`;
      }).join('')}</div>
    </div>`;
  },

  stats: () => {
    const tab = V.tab || 'big';
    const tabs = [['big', '요약'], ...STAT_GROUPS.map(g => [g.id, g.name.replace('그라운드 ', '')]), ['rel', '관계'], ['partners', '파트너']];
    let body = '';
    if (tab === 'big') {
      const big = G.bigValues(S.stats);
      body = `<div class="card">${BIG_STATS.map(b => statBar(b.name, big[b.id])).join('')}</div><p class="hint">탭을 넘기면 세부 능력치를 볼 수 있습니다. 세부를 몰라도 플레이에 지장은 없어요.</p>`;
    } else if (GROUP_BY_ID[tab]) {
      const g = GROUP_BY_ID[tab];
      body = `<div class="card"><h3>${g.name} <small>평균 ${G.groupAvg(S.stats, tab).toFixed(1)}</small></h3>${g.stats.map(([id, n]) => statBar(n, S.stats[id], tab === 'counter' ? counterHint(id) : '')).join('')}</div>`;
    } else if (tab === 'rel') {
      body = `<div class="card">${statBar('직장 평판', S.work)}${statBar('코치 신뢰', S.coach)}${statBar('클럽 명성', S.club)}${statBar('자신감', S.confidence)}${statBar('피로', S.fatigue)}${statBar('스트레스', S.stress)}
        <p>종합 능력 <b>${G.overall(S.stats).toFixed(1)}</b> (${grade(G.overall(S.stats))}) · 부상 이력 ${S.injuries}회</p>
        ${S.unlocks.length ? `<p>코치 비기: ${S.unlocks.map(u => CHOICE_DEFS[2].opts.find(o => o[0] === u)?.[1]).join(', ')}</p>` : ''}</div>`;
    } else {
      body = PARTNERS.filter(p => S.partners[p.id].known).map(p => { const ps = S.partners[p.id]; return `<div class="card prow">${portrait(p.id, 'smile', 'pt sm')}<div><b>${p.name}</b> <small>${p.arch} · ${p.style} · ${ps.div}</small>${statBar('실력', ps.level)}${statBar('친밀도', ps.aff)}${statBar('콤비', ps.combo)}</div></div>`; }).join('') + `<p class="hint">훈련을 계속하다 보면 새 파트너를 만날 수 있습니다.</p>`;
    }
    return `<div class="screen stats"><header class="topbar"><button class="back" data-a="go" data-s="week">‹</button><div class="wk">능력치</div><div class="sub">종합 ${G.overall(S.stats).toFixed(1)}</div></header>
      <div class="tabs scroll">${tabs.map(([id, n]) => `<button class="${tab === id ? 'on' : ''}" data-a="tab" data-id="${id}">${n}</button>`).join('')}</div>${body}</div>`;
  },

  tourIntro: () => {
    const tr = S.tournament;
    const opps = tr.stage === 'group' ? tr.group.opps : [];
    return `<div class="screen tour">
      <div class="tour-head ${tr.type}"><small>${tr.type === 'national' ? '전국대회' : '비전국대회'} · ${tr.div}부</small><h2>${esc(tr.name)}</h2>
      <p>${tr.seed ? `시드 ${tr.seed}번${tr.bye ? ' · 예선 면제' : ''}` : '노시드'}</p></div>
      <div class="vs">${portrait('me', 'focus', 'pt')}${portrait(tr.partner, 'smile', 'pt')}<div><b>${esc(S.name)} · ${esc(PARTNER[tr.partner].name)}</b><small>콤비 ${Math.round(S.partners[tr.partner].combo)} · 컨디션 ${COND[S.condition + 2]}${tr.spare ? ' · 예비 라켓' : ''}</small></div></div>
      ${opps.length ? `<div class="card"><h3>예선 조 (3팀 중 1위 본선)</h3>${opps.map(o => oppRow(o)).join('')}</div>` : `<div class="card"><p>상위 시드라 예선 없이 본선부터 시작합니다.</p></div>`}
      <div class="card"><h3>대회 방식</h3><p>6게임 단세트 · 노애드 · 6:6 타이브레이크. 본선은 ${tr.koRounds === 4 ? '16강' : '8강'}부터.</p></div>
      <div class="actions"><button class="btn primary big" data-a="match">첫 경기 시작 ▶</button></div>
    </div>`;
  },

  between: () => {
    const tr = S.tournament;
    const opp = G.currentOpponent(tr);
    return `<div class="screen tour">
      <div class="tour-head ${tr.type}"><small>${esc(tr.name)} · ${tr.div}부</small><h2>${G.stageLabel(tr)}</h2></div>
      ${tr.log.length ? `<div class="card"><h3>지금까지</h3>${tr.log.map(l => `<div class="resrow"><span>${l.stage}</span><b>${esc(l.opp)}</b><span>${l.games[0]}-${l.games[1]}</span><b class="${l.won ? 'pos' : 'neg'}">${l.won ? '승' : '패'}</b></div>`).join('')}</div>` : ''}
      <div class="card"><h3>다음 상대</h3>${oppRow(opp)}</div>
      <div class="actions"><button class="btn primary big" data-a="match">경기 시작 ▶</button></div>
    </div>`;
  },

  match: () => `
    <div class="screen match">
      <div class="stage" id="stage">
        <div class="scorebox" id="scorebox"></div>
        <div class="biglabel" id="biglabel"></div>
        <div class="cutin" id="cutin"></div>
        <div class="pointtext" id="pointtext"></div>
      </div>
      <div class="hud">
        <div class="mentals" id="mentals"></div>
        <div class="timing" id="timing"><i></i><span>${TIMING_TEXT.idle}</span></div>
        <div class="tempo">${tempoButtons('normal')}</div>
        <div class="ctrl">
          <button class="chip sm on" data-a="spd" data-v="hl">하이라이트</button><button class="chip sm" data-a="spd" data-v="1">전체 1×</button><button class="chip sm" data-a="spd" data-v="3">전체 3×</button>
          <button class="chip sm" data-a="skipgame">게임 스킵</button><button class="chip sm" data-a="skipmatch">결과 보기</button>
        </div>
        <div class="logline" id="logline">경기 시작!</div>
      </div>
      <div class="panel" id="panel"></div>
    </div>`,

  report: () => {
    const R = V.report;
    const tr = S.tournament;
    const p = R.me, q = R.partner;
    const row = (n, a, b) => `<tr><td>${n}</td><td>${a}</td><td>${b}</td></tr>`;
    const counters = Object.entries(p.counter).filter(([, v]) => v.tot > 0);
    return `<div class="screen report">
      <div class="result-banner ${R.won ? 'win' : 'lose'}">${R.won ? '승리!' : '패배'}<small>${R.games[0]} - ${R.games[1]} · ${esc(R.oppName)}</small></div>
      <div class="vs">${portrait('me', R.won ? 'joy' : 'down', 'pt')}${portrait('coach', R.won ? 'smile' : 'focus', 'pt')}<div class="bubble">${esc(R.coachLine)}</div></div>
      <div class="card"><table class="rep"><tr><th></th><th>${esc(S.name)}</th><th>${esc(PARTNER[tr.partner].name)}</th></tr>
        ${row('퍼스트 서브', pct(p.fsIn, p.fsTot), pct(q.fsIn, q.fsTot))}
        ${row('에이스 / 더블폴트', `${p.aces} / ${p.df}`, `${q.aces} / ${q.df}`)}
        ${row('위너', p.winners, q.winners)}${row('범실', p.errors, q.errors)}
        ${row('포치 성공', `${p.poachWin}/${p.poachTry}`, `${q.poachWin}/${q.poachTry}`)}
        ${row('어시스트', p.assists, q.assists)}
      </table><p>브레이크 성공 ${R.bp[0]}/${R.bp[1]}</p>${p.late ? `<p>급하게 바꾼 샷 ${p.late}회 · 그중 범실 ${p.lateErr}회</p>` : ''}</div>
      ${counters.length ? `<div class="card"><h3>대처 성공률 (${esc(S.name)})</h3>${counters.map(([c, v]) => `<div class="cbar"><span>${STAT_NAME[c]}</span><div class="bar"><i style="width:${v.ok / v.tot * 100}%"></i></div><b>${v.ok}/${v.tot}</b></div>`).join('')}</div>` : ''}
      <div class="actions"><button class="btn primary big" data-a="aftermatch">${tr.finished ? '대회 결과 보기' : '다음 경기로'}</button></div>
    </div>`;
  },

  tourResult: () => {
    const tr = S.tournament;
    const promo = tr.final === 'W' && tr.type === 'national' && tr.div === '개나리';
    return `<div class="screen tour">
      <div class="tour-head ${tr.type}"><small>${esc(tr.name)} · ${tr.div}부</small><h2>${STAGE_NAME[tr.final]}${tr.final === 'W' ? ' 🏆' : ''}</h2></div>
      <div class="vs">${portrait('me', tr.final === 'W' ? 'joy' : ['F', 'SF'].includes(tr.final) ? 'smile' : 'cry', 'pt')}${portrait(tr.partner, tr.final === 'W' ? 'joy' : 'smile', 'pt')}<div><b>랭킹 포인트 +${tr.pts}</b><small>피로 +${tr.matchIdx * 6}, 실전 경험으로 멘탈·전술·대처 상승</small></div></div>
      ${promo ? `<div class="alert good big">🌼 국화 승급! 이제 국화부 대회에만 나갑니다.</div>` : ''}
      <div class="card">${tr.log.map(l => `<div class="resrow"><span>${l.stage}</span><b>${esc(l.opp)}</b><small>${esc(l.arch)}</small><span>${l.games[0]}-${l.games[1]}</span><b class="${l.won ? 'pos' : 'neg'}">${l.won ? '승' : '패'}</b></div>`).join('')}</div>
      <div class="actions"><button class="btn primary big" data-a="endweek">다음 주로 ▶</button></div>
    </div>`;
  },

  ending: () => {
    const e = S.ending;
    return `<div class="screen ending">
      <div class="logo"><small>3년 뒤…</small><h1>${esc(e.name)}</h1></div>
      ${portrait('me', ['injury', 'burnout'].includes(e.id) ? 'tired' : 'joy', 'title-pt')}
      <div class="card"><p>${esc(e.text)}</p>${e.partner ? `<p>파트너: ${esc(e.partner)}</p>` : ''}</div>
      <div class="card"><p>최종 부서: ${S.division}부 · 종합 능력 ${G.overall(S.stats).toFixed(1)}</p><p>우승: 개나리 비전국 ${S.titles.local} · 전국 ${S.titles.national} · 국화 비전국 ${S.titles.gukwhaLocal} · 전국 ${S.titles.gukwhaNational}</p><p>출전 ${S.results.length}회 · 부상 ${S.injuries}회</p></div>
      <button class="btn primary big" data-a="restart">새로 시작</button>
    </div>`;
  },
};

function gauge(n, v, cls) { return `<div class="gauge ${cls}"><small>${n}</small><div class="bar"><i style="width:${Math.round(v)}%"></i></div><b>${Math.round(v)}</b></div>`; }
function statBar(n, v, hint = '') { return `<div class="stat"><span>${esc(n)}${hint ? `<small>${hint}</small>` : ''}</span><div class="bar"><i style="width:${Math.min(100, v)}%"></i></div><b>${Math.round(v)}<em class="g g-${grade(v)}">${grade(v)}</em></b></div>`; }
function counterHint(id) { return { c_moon: '↔ 문발리', c_slice: '↔ 슬라이스·칩', c_lob: '↔ 로브', c_drop: '↔ 드롭샷', c_angle: '↔ 앵글', c_power: '↔ 강서브', c_poach: '↔ 포치', c_body: '↔ 바디샷' }[id] || ''; }
function oppRow(o) { return `<div class="opp">${portrait(`opp:${o.seed % 997}:0`, 'focus', 'pt sm')}${portrait(`opp:${o.seed % 997}:1`, 'base', 'pt sm')}<div><b>${esc(o.names.join(' · '))}</b><small>${esc(o.club)} · ${esc(o.archName)} · ${grade(o.rating)}급</small></div></div>`; }

// 주간 행동 카드
function moveCard(a) {
  const p = G.previewAction(S, a.id);
  const blocked = S.injury && a.tennis;
  const face = a.train ? S.faces[a.id] : null;
  const effect = a.train
    ? p.gains.slice(0, 2).map(([b, g]) => `${BIG_NAME[b]} +${g.toFixed(1)}`).join(' · ')
    : `피로 ${signed(a.fatigue)} · 스트레스 ${signed(a.stress)}`;
  const risk = a.tennis ? `피로 +${Math.round(p.fatigue)} · 부상 ${Math.round(p.injury * 100)}%` : a.train ? `피로 +${Math.round(p.fatigue)} · 스트레스 ${signed(a.stress)}` : '';
  return `<button class="move ${a.train ? '' : 'recover'} ${p.injury >= 0.1 ? 'risky' : ''}" data-a="act" data-id="${a.id}" ${blocked ? 'disabled' : ''}>
    <span class="mhead"><b>${a.icon}</b><span>${a.name}</span>${face ? portrait(face, 'smile', 'pt xs') : ''}</span>
    <small class="ef">${blocked ? '부상 중' : effect}</small>
    ${risk && !blocked ? `<small class="rk">${risk}</small>` : ''}
    ${face && !blocked ? `<small class="fc">${esc(withJosa(whoName(face)))} 같이 (효과↑)</small>` : ''}
  </button>`;
}
function tourCard() {
  const t = G.openTournament(S);
  if (!t) {
    const n = G.nextTournament(S);
    return `<button class="move tourmove" disabled><span class="mhead"><b>🏆</b><span>대회</span></span><small class="ef">이번 주 대회 없음</small>${n ? `<small class="rk">${n.week - S.week}주 뒤 ${esc(n.name)}</small>` : ''}</button>`;
  }
  return `<button class="move tourmove on" data-a="tourpick" ${S.injury ? 'disabled' : ''}><span class="mhead"><b>🏆</b><span>대회 출전</span></span><small class="ef">${esc(t.name)} (${t.type === 'national' ? '전국' : '비전국'})</small><small class="rk">파트너에게 연락하기</small></button>`;
}

function bubble(m) {
  return `<div class="bub">${portrait(m.from, 'smile', 'pt xs')}<div><p>${esc(m.text)}</p><small class="when">${weekInfo(m.week).label}</small></div></div>`;
}

function pickerHTML() {
  const t = G.openTournament(S);
  const list = PARTNERS.filter(p => S.partners[p.id].known);
  return `<div class="overlay" data-a="closesheet"><div class="sheet" data-stop="1">
    <h3>${esc(t.name)} · 파트너 구하기</h3><p class="muted">${t.type === 'national' ? '전국대회' : '비전국대회'} · 연락하면 바로 답이 옵니다. 거절당해도 다른 사람에게 물어볼 수 있어요.</p>
    ${list.map(p => {
      const ps = S.partners[p.id];
      const why = G.partnerAvailable(S, p.id, t.week) || (S.asked[p.id] === S.week ? '이번 주 이미 거절함' : null);
      const ch = why ? null : Math.round(G.acceptChance(S, p.id, t) * 100);
      return `<div class="prow">${portrait(p.id, 'smile', 'pt sm')}<div><b>${p.name}</b> <small>${p.arch} · 실력 ${grade(ps.level)} · 친밀도 ${Math.round(ps.aff)}</small><small>${why ? `<span class="neg">${why}</span>` : `수락 확률 ${ch}%`}</small></div>${why ? '' : `<button class="btn sm primary" data-a="ask" data-pid="${p.id}">연락</button>`}</div>`;
    }).join('')}
  </div></div>`;
}

function eventHTML(ev) {
  const v = G.eventView(S, ev);
  return `<div class="overlay ev"><div class="sheet event">
    ${portrait(v.who, ev.id === 'promotion' || ev.id === 'goal' ? 'joy' : ev.id === 'injury' || ev.id === 'slump' ? 'tired' : 'base', 'pt')}
    <h3>${esc(v.title)}</h3><p>${esc(v.text)}</p>
    <div class="choices">${v.choices.map(([c, n]) => `<button class="btn ${c === 'accept' || c === 'ok' ? 'primary' : ''}" data-a="evt" data-c="${c}">${esc(n)}</button>`).join('')}</div>
  </div></div>`;
}

// ── 인트로 ────────────────────────────────────────────────
function showScene(i) {
  clearTimeout(introTimer);
  if (i >= INTRO_SCENES.length) { V.screen = 'namein'; render(); return; }
  V.scene = i; V.screen = 'intro';
  render();
  introTimer = setTimeout(() => showScene(i + 1), 3800);
}

// ── 입력 처리 ─────────────────────────────────────────────
function beginTournament(tid) { G.startTournament(S, tid); G.save(S); V.sheet = null; V.screen = 'tourIntro'; }
async function onClick(e) {
  const stop = e.target.closest('[data-stop]');
  const t = e.target.closest('[data-a]');
  if (!t) return;
  if (stop && !stop.contains(t)) return;
  if (stop && t.dataset.a.startsWith('close')) return;
  const a = t.dataset.a, d = t.dataset;
  switch (a) {
    case 'new': showScene(0); return;
    case 'introNext': showScene(V.scene + 1); return;
    case 'introSkip': showScene(INTRO_SCENES.length); return;
    case 'bg': V.bg = d.id; app.querySelectorAll('.newgame .chip').forEach(c => c.classList.toggle('on', c.dataset.id === d.id)); return;
    case 'start': { const n = (document.getElementById('pname').value || '').trim() || '나'; S = G.newGame(n, V.bg); G.save(S); V.screen = 'week'; break; }
    case 'continue': V.screen = S.ending ? 'ending' : S.tournament ? (S.tournament.finished ? 'tourResult' : 'between') : S.phase === 'result' ? 'result' : 'week'; break;
    case 'restart': G.clearSave(); S = null; V.screen = 'title'; break;
    case 'go': V.screen = d.s; V.tab = null; V.thread = null; V.sheet = null; break;
    case 'tab': V.tab = d.id; break;
    case 'act': {
      if (S.pendingEvents.length) return;
      G.runWeek(S, d.id); S.phase = 'result'; G.save(S); V.screen = 'result'; break;
    }
    case 'tourpick': V.sheet = 'partner'; break;
    case 'closesheet': V.sheet = null; break;
    case 'ask': {
      const tour = G.openTournament(S);
      const r = G.askPartner(S, tour.id, d.pid);
      G.save(S);
      if (r.ok) { toast(`${PARTNER[d.pid].name}: 좋아요! 같이 나가요`); beginTournament(tour.id); }
      else toast(`${PARTNER[d.pid].name}: ${esc(r.line)}`);
      break;
    }
    case 'tourgo': beginTournament(G.tournamentThisWeek(S).t.id); break;
    case 'evt': { const ev = S.pendingEvents.shift(); G.resolveEvent(S, ev, d.c); G.save(S); break; }
    case 'thread': V.thread = d.id || null; break;
    case 'match': V.screen = 'match'; render(); runMatch(); return;
    case 'aftermatch': V.screen = S.tournament.finished ? 'tourResult' : 'between'; break;
    case 'endweek': {
      S.tournament = null; S.phase = 'plan';
      G.endWeek(S);
      G.save(S);
      V.screen = S.ending ? 'ending' : 'week';
      break;
    }
    case 'spd': if (M) { M.hl = d.v === 'hl'; M.speed = M.hl ? 1 : +d.v; if (M.view) M.view.speed = M.speed; app.querySelectorAll('[data-a=spd]').forEach(b => b.classList.toggle('on', b.dataset.v === d.v)); } return;
    case 'skipgame': if (M) { M.skipGame = true; M.view && (M.view.speed = 20); } return;
    case 'skipmatch': if (M) { M.skipMatch = true; M.skipGame = true; M.view && (M.view.speed = 20); M.resolvePanel && M.resolvePanel(); } return;
    case 'tempo': if (M) setTempo(d.v, !!t.closest('.panel')); return;
    case 'choice': if (M) { M.sim.teams[0].choices[d.k] = d.v; renderPanel(); } return;
    case 'coachrec': if (M && M.rec) { const { tempo, ...rest } = M.rec.set; Object.assign(M.sim.teams[0].choices, rest); if (tempo) setTempo(tempo, true); renderPanel(); } return;
    case 'paneldetail': if (M) { M.detail = !M.detail; renderPanel(); } return;
    case 'nextgame': if (M && M.resolvePanel) M.resolvePanel(); return;
    case 'autopanel': if (M) { M.auto = !M.auto; renderPanel(); } return;
    default: return;
  }
  render();
}

// ── 경기 진행 ─────────────────────────────────────────────
function tempoButtons(cur) { return TEMPO_OPTS.map(([v, n]) => `<button class="tempobtn t-${v} ${cur === v ? 'on' : ''}" data-a="tempo" data-v="${v}">${n}</button>`).join(''); }
// 플레이 방향은 언제든 바꿀 수 있다. 내가 치기 직전에 바꾸면 엔진이 범실 확률을 올린다.
function setTempo(v, paused) {
  const ch = M.sim.teams[0].choices;
  if (ch.tempo === v) return;
  ch.tempo = v;
  ch.mental = v === 'safe' ? 'breathe' : 'keep';
  if (!paused && M.view) M.tempoAt = M.view.gameTime;
  syncTempo();
}
function syncTempo() { const cur = M.sim.teams[0].choices.tempo; app.querySelectorAll('[data-a=tempo]').forEach(b => b.classList.toggle('on', b.dataset.v === cur)); }
function updateTiming() {
  const el = document.getElementById('timing');
  if (!el || !M?.view) return;
  const view = M.view, W = TUNE.lateWindow;
  const left = view.eta - view.gameTime;
  const state = !M.incoming ? 'idle' : view.eta - M.tempoAt < W ? 'rushed' : left <= W ? 'late' : 'safe';
  if (state !== M.timing) {
    M.timing = state;
    el.className = `timing ${state}`;
    el.lastElementChild.textContent = TIMING_TEXT[state];
    view.setRingDanger(state === 'late' || state === 'rushed');
  }
  el.firstElementChild.style.width = M.incoming ? `${Math.max(0, left / view.etaDur) * 100}%` : '0';
}
// 게임 하나를 샷 단위로 진행. 공이 날아가는 동안 엔진을 멈춰 두고, 도착하면 그 순간의 선택으로 친다.
async function playGameLive(sim) {
  const view = M.view;
  const it = sim.gameSteps();
  let r = it.next(), live = false, begun = false, played = 0;
  while (!r.done) {
    const ev = r.value;
    let input;
    if (ev.kind === 'pointStart') {
      live = !!view && !M.skipGame && (!M.hl || ev.ctx.big);
      begun = false; played = 0;
      if (live && ev.ctx.big && ev.ctx.label) showBig(ev.ctx.label);
    } else if (ev.kind === 'rally') {
      if (live) {
        if (!begun) { await view.beginPoint(ev.shots[0]); begun = true; }
        for (; played < ev.shots.length; played++) {
          const later = ev.shots[played + 1];
          M.incoming = !later && ev.next === 0;
          await view.playShot(ev.shots[played], later || { h: ev.next, contactH: ev.contactH });
        }
        M.incoming = false;
      }
      if (ev.next === 0) input = { lead: live ? view.gameTime - M.tempoAt : Infinity };
    } else if (live) {
      const pt = ev.pt;
      if (!begun) await view.beginPoint(pt.shots[0]);
      await view.playRest(pt, played, { onCutin: cutin });
      setLog(pt.text); hud(pt);
      if (pt.big && ['win', 'ace', 'poach'].includes(pt.endType) && M.speed === 1 && !M.skipGame) await view.replay(pt);
      hideBig();
    } else if (!M.skipGame) {
      // 하이라이트: 큰 포인트가 아니면 지금 고른 방향으로 바로 처리하고, 게임 마지막 포인트만 다시 보여 준다
      if (view && ev.last) await view.playPoint(ev.pt, { onCutin: cutin });
      setLog(ev.pt.text); hud(ev.pt);
      if (!view || !ev.last) await sleep(view ? 450 : 380 / M.speed);
    }
    r = it.next(input);
  }
  return r.value;
}
async function runMatch() {
  const tr = S.tournament;
  const { human, npc, opp } = G.buildTeams(S, tr);
  const sim = new MatchSim(human, npc, { startFatigue: [tr.matchIdx * 2.5 + S.fatigue / 20, tr.matchIdx * 2] });
  M = { sim, speed: 1, hl: true, skipGame: false, skipMatch: false, auto: false, detail: false, opp, tempoAt: -Infinity, incoming: false, timing: 'idle' };
  syncTempo();
  const stage = document.getElementById('stage');
  const players = [
    { charId: 'player', look: PLAYER_LOOK }, { charId: tr.partner, look: { ...PARTNER[tr.partner].color, band: '#ffffff' } },
    { charId: 'npc', look: oppLook(opp.seed % 997, 0) }, { charId: 'npc', look: oppLook(opp.seed % 997, 1) },
  ];
  if (webglOK()) {
    try {
      M.view = new MatchView(stage, { surface: tr.type === 'national' ? 'hard' : (opp.seed % 5 === 0 ? 'clay' : 'turf'), banner: `${tr.name} ${tr.div}부` });
      await M.view.setPlayers(players);
      M.view.onFrame = updateTiming;
    } catch (err) { console.warn(err); M.view = null; }
  }
  if (!M.view) stage.classList.add('textmode');
  hud(null);
  while (!sim.over) {
    sim.teams[1].choices = aiChoices(sim, 1);
    M.curServe = sim.serveTeam;
    const g = await playGameLive(sim);
    if (M.view) M.view.speed = M.speed;
    M.skipGame = M.skipMatch;
    M.curServe = sim.serveTeam;
    hud(null);
    if (sim.over) break;
    if (!M.skipMatch) await panel(g);
  }
  // 기록
  S.choices = { ...sim.teams[0].choices, mental: 'keep' };
  const me = sim.P[0], pa = sim.P[1];
  const coachLine = coachSays(sim);
  V.report = { won: sim.winner === 0, games: [...sim.games], oppName: opp.names.join(' · '), me: me.rec, partner: pa.rec, bp: [sim.bp.won[0], sim.bp.tot[0]], coachLine };
  G.recordMatch(S, tr, sim);
  G.save(S);
  await sleep(500);
  if (M.view) M.view.dispose();
  M = null;
  V.screen = 'report';
  render();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TIMING_TEXT = { idle: '공이 오기 전에 플레이 방향을 정해 두세요', safe: '공이 온다! 아직 바꿀 수 있어요', late: '지금 바꾸면 범실 위험!', rushed: '급하게 바꿨어요! 범실 위험' };

function hud(pt) {
  if (!M) return;
  const sim = M.sim, P = sim.P;
  const box = document.getElementById('scorebox');
  if (!box) return;
  const tr = S.tournament;
  const ps = pt ? pt.score.split(' - ') : ['', ''];
  const sv = M.curServe ?? sim.serveTeam;
  const gm = pt ? pt.games : sim.games;
  box.innerHTML = `<small>${esc(tr.name)} · ${G.stageLabel(tr)}</small>
    <div class="sr"><span>${sv === 0 && !sim.over ? '●' : ''}</span><b>${esc(P[0].name)} · ${esc(P[1].name)}</b><em>${gm[0]}</em><i>${pt ? ps[0] : ''}</i></div>
    <div class="sr"><span>${sv === 1 && !sim.over ? '●' : ''}</span><b>${esc(P[2].name)} · ${esc(P[3].name)}</b><em>${gm[1]}</em><i>${pt ? ps[1] : ''}</i></div>`;
  const ms = document.getElementById('mentals');
  const gs = pt ? pt.gauges : P.map(p => Math.round(p.gauge));
  const lbl = g => g >= 80 ? '몰입' : g < 10 ? '틸트' : g < 30 ? '흔들림' : '보통';
  ms.innerHTML = P.map((p, i) => `<div class="mg ${i < 2 ? 'us' : 'them'}"><span>${esc(p.name)}</span><div class="bar"><i class="m-${lbl(gs[i])}" style="width:${gs[i]}%"></i></div><small>${lbl(gs[i])}</small></div>`).join('');
}
function setLog(t) { const l = document.getElementById('logline'); if (l) l.textContent = t; const p = document.getElementById('pointtext'); if (p) { p.textContent = t; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); } }
function showBig(label) { const b = document.getElementById('biglabel'); if (b) { b.textContent = label; b.classList.add('show'); } }
function hideBig() { const b = document.getElementById('biglabel'); if (b) b.classList.remove('show'); }
async function cutin(s) {
  const c = document.getElementById('cutin');
  if (!c || M.skipGame) return;
  const who = s.h === 0 ? 'me' : s.h === 1 ? S.tournament.partner : `opp:${M.opp.seed % 997}:${s.h - 2}`;
  const look = s.h === 0 ? PLAYER_LOOK : s.h === 1 ? lookOf(S.tournament.partner) : oppLook(M.opp.seed % 997, s.h - 2);
  const src = await portraitURL(s.h === 0 ? 'player' : who, look, s.h < 2 ? 'joy' : 'focus');
  c.className = `cutin show ${s.h < 2 ? 'us' : 'them'}`;
  c.innerHTML = `<img src="${src}"><b>${SHOT_NAME[s.type] || ''}!</b>`;
  await sleep(950 / M.speed);
  c.className = 'cutin';
}

function coachRecommend(sim) {
  const t = sim.teams[1];
  const a = t.arch?.id;
  const rec = {
    moon: { line: '문발리로 띄워요. 투업으로 붙어서 스매시로 끝내요.', set: { formation: 'up', shot: 'power' } },
    slice: { line: '슬라이스가 낮게 와요. 침착하게 버티고 로브로 흔들어요.', set: { tempo: 'safe', shot: 'moon' } },
    power: { line: '강타형이에요. 슬라이스로 낮게 깔아요.', set: { shot: 'slice', tempo: 'normal' } },
    net: { line: '전위가 세요. 로브로 넘기고 다운더라인으로 앨리를 찔러요.', set: { shot: 'moon', attack: 'alley' } },
    wall: { line: '수비형이에요. 공격적으로 올라가서 먼저 끝내요.', set: { shot: 'dash', tempo: 'attack' } },
  }[a] || { line: '하던 대로 해요.', set: {} };
  if (sim.teams[0].found) { rec.line = `${STAT_NAME[sim.teams[0].found]}가 약해요. 약점 공략으로 가요!`; rec.set = { ...rec.set, attack: 'weak' }; }
  return rec;
}
function panel(g) {
  return new Promise(res => {
    if (M.auto) { setTimeout(res, 300); return; }
    M.resolvePanel = () => { M.resolvePanel = null; document.getElementById('panel')?.classList.remove('show'); res(); };
    M.lastGame = g;
    renderPanel();
    document.getElementById('panel').classList.add('show');
  });
}
function renderPanel() {
  const p = document.getElementById('panel');
  if (!p || !M) return;
  const sim = M.sim, T = sim.teams[0], ch = T.choices;
  M.rec = coachRecommend(sim);
  const gw = M.lastGame ? M.lastGame.gameWinner : 0;
  p.innerHTML = `<div class="ph"><b>게임 ${gw === 0 ? '획득!' : '내줌'}</b> <span>${sim.games[0]} - ${sim.games[1]}</span>${(sim.gameNo % 2 === 1) ? '<small>체인지오버</small>' : ''}</div>
    ${T.found ? `<div class="found">🔍 약점 발견: 상대의 <b>${STAT_NAME[T.found]}</b>가 약하다</div>` : ''}
    <div class="coachrec">${portrait('coach', 'focus', 'pt xs')}<span>${esc(M.rec.line)}</span></div>
    <div class="tempo">${tempoButtons(ch.tempo)}</div>
    ${M.detail ? `<div class="pdetail"><button class="btn sm" data-a="coachrec">코치 추천대로 맞추기</button>
      ${CHOICE_DEFS.filter(def => def.key !== 'tempo').map(def => `<div class="crow"><span>${def.name}</span><div>${def.opts.filter(([v]) => !(def.key === 'shot' && LOCKED_SHOT_OPTS.includes(v) && !S.unlocks.includes(v))).map(([v, n]) => {
        const dis = def.key === 'attack' && v === 'weak' && !T.found;
        return `<button class="chip sm ${ch[def.key] === v ? 'on' : ''}" ${dis ? 'disabled' : ''} data-a="choice" data-k="${def.key}" data-v="${v}">${n}</button>`;
      }).join('')}</div></div>`).join('')}</div>` : ''}
    <div class="pa"><button class="chip sm ${M.detail ? 'on' : ''}" data-a="paneldetail">세부 작전</button><button class="chip sm ${M.auto ? 'on' : ''}" data-a="autopanel">자동 진행</button><button class="btn primary" data-a="nextgame">다음 게임 ▶</button></div>`;
  hydratePortraits();
}
function coachSays(sim) {
  const me = sim.P[0].rec;
  if (me.lateErr >= 2) return `급하게 바꾸다 실수가 ${me.lateErr}번 나왔어요. 공이 오기 전에 미리 정해 둬요.`;
  const weak = Object.entries(me.counter).filter(([, v]) => v.tot >= 3).sort((a, b) => a[1].ok / a[1].tot - b[1].ok / b[1].tot)[0];
  if (weak && weak[1].ok / weak[1].tot < 0.6) return `${STAT_NAME[weak[0]]}가 제일 약했어요 (${weak[1].ok}/${weak[1].tot}). 네트·서브 훈련에서 같이 잡아 봐요.`;
  if (me.df >= 4) return '더블폴트가 많았어요. 서브·리턴 훈련부터 다시 해요.';
  if (me.errors > me.winners * 3) return '범실이 많았어요. 침착하게 가 봐요.';
  if (sim.winner === 0) return '좋았어요! 이 감각 기억해요.';
  return '상대가 한 수 위였어요. 지금은 쌓는 시기예요.';
}
