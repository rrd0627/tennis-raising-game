// 화면 — 타이틀, 인트로, 주간 행동, 결과, 메신저, 대회·랭킹, 능력치, 대회/경기, 엔딩
import * as G from './game.js';
import {
  STAT_GROUPS, STAT_NAME, GROUP_BY_ID, ACT, LESSONS, BIG_STATS, INTRO_SCENES, PROFILE, DAY_NAMES, PARTNERS, PARTNER,
  grade, weekInfo, STAGE_NAME,
} from './data.js';
import { MatchSim, aiChoices, CHOICE_DEFS, DEFAULT_CHOICES, LOCKED_SHOT_OPTS, TEMPO_OPTS, SHOT_NAME } from './sim.js';
import { MatchView, webglOK } from './match3d.js';
import { portraitURL, heroURL, sceneURL, PLAYER_LOOK, oppLook } from './art.js';
import { HOME_LINES, STATE_LINES, LOCK_LINES } from './scenes.js';

const app = document.getElementById('app');
let S = null;
const V = { screen: 'title', tab: null, thread: null, sheet: null, scene: 0, detail: false, profile: null, pick: null, note: null };
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
  app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pname') app.querySelector('[data-a=profileName]')?.click(); });
}

function render() {
  const fn = SCREENS[V.screen] || SCREENS.title;
  app.innerHTML = fn();
  app.scrollTop = 0;
  hydratePortraits();
}

// ── 타이틀 ────────────────────────────────────────────────
const SCREENS = {
  title: () => `
    <div class="screen title" data-a="titleStart">
      <div class="logo"><div class="ball">🎾</div><h1>테니스 선수<br>키우기</h1><p>개나리에서 국화까지, 직장인 3년 육성기</p></div>
      ${portrait('me', 'smile', 'title-pt')}
      <p class="tapstart">${S && !S.ending ? '화면을 눌러 이어 하기' : '화면을 눌러 시작'}</p>
      ${S && !S.ending ? `<p class="tiny">${esc(S.name)} · ${weekInfo(Math.min(S.week, 156)).label}</p>` : ''}
    </div>`,

    intro: () => {
    const s = INTRO_SCENES[V.scene];
    return `<div class="screen intro" data-a="introNext" style="--bg:${s.bg}">
      <button class="introskip" data-a="introSkip">건너뛰기 ›</button>
      <div class="scene"><div class="ic">${s.icon}</div><p>${esc(s.text)}</p></div>
      <div class="dots">${INTRO_SCENES.map((_, i) => `<i class="${i === V.scene ? 'on' : ''}"></i>`).join('')}</div>
    </div>`;
  },

  // 레슨 첫날 코치와의 대화: 이름 → 직장 → 운동 경험 → 시작한 이유
  profile: () => {
    const P = V.profile, q = PROFILE[P.step - 1];
    let line, body;
    if (P.step === 0) {
      line = '안녕하세요! 오늘부터 같이 할 코치예요. 성함이 어떻게 되세요?';
      body = `<div class="nameline"><input id="pname" maxlength="8" placeholder="이름" value="" autocomplete="off"><button class="btn primary" data-a="profileName">이에요</button></div>`;
    } else if (q) {
      line = `${P.reply} ${q.ask}`;
      body = `<div class="opts">${q.options.map(o => `<button class="opt" data-a="profileOpt" data-id="${o.id}">${o.name}</button>`).join('')}</div>`;
    } else {
      line = `${P.reply} 좋아요, ${P.name} 님. 오늘은 포핸드부터 해 봐요!`;
      body = `<button class="btn primary big" data-a="profileDone">네, 잘 부탁드려요!</button>`;
    }
    return `<div class="screen talk">
      ${portrait('coach', 'smile', 'title-pt')}
      <div class="talkline">${esc(line)}</div>
      ${body}
    </div>`;
  },

  // 주간 화면: 우마무스메 육성 화면처럼 장소와 캐릭터가 화면을 채우고, UI는 그 위에 얹는다
  week: () => {
    const wi = weekInfo(S.week), tw = G.tournamentThisWeek(S), say = homeLine(tw), pick = V.pick;
    let moves;
    if (tw) moves = `<button class="btn primary big" data-a="tourgo">대회 출전하기 ▶</button>`;
    else if (S.overtime) moves = `<button class="btn primary big" data-a="act" data-id="overtime">야근하러 가기 ▶</button>`;
    else moves = `<div class="gbtns">${BTN_ROWS.map((row, i) => `<div class="grow ${i ? 'sub' : ''}">${row.map(gameButton).join('')}</div>`).join('')}</div>`;
    const place = tw ? 'tour' : S.overtime ? 'overtime' : pick;
    const pose = POSE_OF[place] || (S.injury || S.slump || S.fatigue >= 60 ? 'sad' : S.condition > 0 ? 'cheer' : 'ready');
    const pv = pick && pick !== 'tour' ? G.previewAction(S, pick) : null;
    const riskPct = pv && ACT[pick].tennis ? Math.round(pv.injury * 100) : null;
    const title = tw ? `🏆 ${tw.t.name} · 파트너 ${PARTNER[tw.entry.partner].name}` : S.overtime ? '💼 마감 야근' : pick === 'tour' ? `🏆 ${G.openTournament(S).name}` : pick ? actTitle(pick, pick === 'practice' ? S.lastTopic : pv.topic) : '';
    const bubble = pick ? pickInfo() : V.note ? `<div class="say"><span>${esc(V.note)}</span></div>` : `<div class="say">${say.who !== 'me' ? portrait(say.who, 'smile', 'pt xs') : ''}<span>${esc(say.text)}</span></div>`;
    return `
    <div class="screen home">
      ${bgHTML(SCENE_OF[place] || 'home', wi)}
      ${hudHTML()}
      <div class="hero">
        ${heroHTML(pose)}
        ${title ? `<div class="ribbon">${esc(title)}</div>` : ''}
        <div class="sidebtns">
          <button class="sidebtn" data-a="go" data-s="stats" aria-label="능력치">📊</button>
          <button class="sidebtn" data-a="go" data-s="tours" aria-label="대회와 랭킹">🏆</button>
          <button class="sidebtn" data-a="go" data-s="msg" aria-label="메신저">💬${G.unread(S) ? `<i>${G.unread(S)}</i>` : ''}</button>
        </div>
        ${bubble}
        ${riskPct !== null ? `<div class="risk lv${riskPct < 5 ? 0 : riskPct < 15 ? 1 : 2}"><small>부상 위험</small><b>${riskPct}%</b></div>` : ''}
      </div>
      <div class="homepanel">
        ${statRow(pv ? Object.fromEntries(pv.gains) : {}, true)}
        ${moves}
      </div>
      ${V.sheet === 'partner' ? pickerHTML() : V.sheet === 'lesson' ? lessonHTML() : V.sheet === 'settings' || V.sheet === 'restart' ? settingsHTML() : ''}
      ${S.pendingEvents.length ? eventHTML(S.pendingEvents[0]) : ''}
    </div>`;
  },

    // 결과: 게임 대화창. 아무 곳이나 누르면 다음으로 넘어간다
  result: () => {
    const L = S.weekLog;
    const pose = L.mile ? 'cheer' : POSE_OF[L.act] || 'ready';
    const scene = L.scene || { who: 'me', text: '' };
    return `
    <div class="screen home" data-a="endweek">
      ${bgHTML(SCENE_OF[L.act] || 'home', weekInfo(L.week))}
      ${hudHTML(false)}
      <div class="hero">
        ${heroHTML(pose)}
        <div class="ribbon">${esc(actTitle(L.act, L.topic))}</div>
        ${L.mile ? `<div class="mile"><small>★ 처음 해낸 순간</small><b>${esc(L.mile.title)}</b><p>${esc(L.mile.text)}</p></div>` : ''}
        ${Math.abs(L.fatigue) >= 1 ? `<div class="risk cost"><small>체력</small><b>${signed(-L.fatigue)}</b></div>` : ''}
      </div>
      <div class="homepanel">
        ${statRow(L.gains, false)}
        <div class="dialog">
          ${portrait(scene.who, 'smile', 'pt sm')}
          <div>
            <p>${esc(scene.text)}</p>
            ${L.with ? `<small class="withline">${esc(withJosa(PARTNER[L.with].name))} 같이 했다</small>` : ''}
            <small class="tapnext">눌러서 계속 ▼</small>
          </div>
        </div>
      </div>
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
      <p class="hint">개나리부 <b>전국대회</b>에서 우승하면 국화로 승급합니다. 대회가 열리는 턴에 출전을 고르면 파트너에게 연락할 수 있어요. 두 달에 한 번쯤이 적당합니다.</p>
      <div class="cal">${up.map(t => {
        const e = S.entries[t.id];
        const act = e ? `<span class="ok">출전 · ${esc(PARTNER[e.partner].name)}</span>` : t.week === S.week ? `<span class="muted">이번 주</span>` : '';
        return `<div class="trow ${t.type}"><div class="tw">${weekInfo(t.week).label.split(' · ')[1]}<small>${DAY_NAMES[t.day]}요일</small></div><div class="tn"><b>${esc(t.name)}</b><small><span class="tag ${t.type}">${t.type === 'national' ? '전국' : '비전국'}</span> 본선 ${t.draw}강</small></div><div class="ta">${act}</div></div>`;
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
      <div class="tabs scroll">${tabs.map(([id, n]) => `<button class="${tab === id ? 'on' : ''}" data-a="tab" data-id="${id}">${n}</button>`).join('')}</div>${body}
    </div>`;
  },

  tourIntro: () => {
    const tr = S.tournament;
    const opps = tr.stage === 'group' ? tr.group.opps : [];
    return `<div class="screen tour">
      <div class="tour-head ${tr.type}"><small>${tr.type === 'national' ? '전국대회' : '비전국대회'} · ${tr.div}부 · 본선 ${tr.draw}강</small><h2>${esc(tr.name)}</h2>
      <p>${tr.seed ? `시드 ${tr.seed}번${tr.bye ? ' · 예선 면제' : ''}` : '노시드'}</p></div>
      <div class="vs">${portrait('me', 'focus', 'pt')}${portrait(tr.partner, 'smile', 'pt')}<div><b>${esc(S.name)} · ${esc(PARTNER[tr.partner].name)}</b><small>콤비 ${Math.round(S.partners[tr.partner].combo)} · 컨디션 ${COND[S.condition + 2]}${tr.spare ? ' · 예비 라켓' : ''}</small></div></div>
      ${opps.length ? `<div class="card"><h3>예선 상대 (1승이면 본선)</h3>${opps.map(o => oppRow(o)).join('')}</div>` : `<div class="card"><p>상위 시드라 예선 없이 본선부터 시작합니다.</p></div>`}
      ${planHTML(opps[0] || G.currentOpponent(tr))}
      <div class="actions"><button class="btn primary big" data-a="match">${opps.length ? '첫 경기 시작 ▶' : '본선 시작 ▶'}</button></div>
    </div>`;
  },

  between: () => {
    const tr = S.tournament;
    const opp = G.currentOpponent(tr);
    return `<div class="screen tour">
      <div class="tour-head ${tr.type}"><small>${esc(tr.name)} · ${tr.div}부</small><h2>${G.stageLabel(tr)}</h2></div>
      ${tr.log.length ? `<div class="card"><h3>지금까지</h3>${tr.log.map(logRow).join('')}</div>` : ''}
      <div class="card"><h3>다음 상대</h3>${oppRow(opp)}</div>
      ${planHTML(opp)}
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
        <div class="ctrl">
          <button class="chip sm on" data-a="spd" data-v="hl">하이라이트</button><button class="chip sm" data-a="spd" data-v="1">전체 1×</button><button class="chip sm" data-a="spd" data-v="3">전체 3×</button>
          <button class="chip sm" data-a="skipgame">게임 스킵</button><button class="chip sm" data-a="skipmatch">결과 보기</button>
        </div>
        <div class="logline" id="logline">경기 시작!</div>
      </div>
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
      </table><p>브레이크 성공 ${R.bp[0]}/${R.bp[1]}</p></div>
      ${counters.length ? `<div class="card"><h3>대처 성공률 (${esc(S.name)})</h3>${counters.map(([c, v]) => `<div class="cbar"><span>${STAT_NAME[c]}</span><div class="bar"><i style="width:${v.ok / v.tot * 100}%"></i></div><b>${v.ok}/${v.tot}</b></div>`).join('')}</div>` : ''}
      <div class="actions"><button class="btn primary big" data-a="aftermatch">${tr.finished ? '대회 결과 보기' : '다음 경기로'}</button></div>
    </div>`;
  },

  tourResult: () => {
    const tr = S.tournament;
    const promo = tr.final === 'W' && tr.type === 'national' && tr.div === '개나리';
    return `<div class="screen tour">
      <div class="tour-head ${tr.type}"><small>${esc(tr.name)} · ${tr.div}부</small><h2>${STAGE_NAME[tr.final]}${tr.final === 'W' ? ' 🏆' : ''}</h2></div>
      <div class="vs">${portrait('me', tr.final === 'W' ? 'joy' : ['F', 'SF'].includes(tr.final) ? 'smile' : 'cry', 'pt')}${portrait(tr.partner, tr.final === 'W' ? 'joy' : 'smile', 'pt')}<div><b>랭킹 포인트 +${tr.pts}</b><small>피로 +${tr.fatigue}, 실전 경험으로 멘탈·전술·대처 상승</small></div></div>
      <div class="scenecard"><p>${esc(tr.scene)}</p></div>
      ${promo ? `<div class="alert good big">🌼 국화 승급! 이제 국화부 대회에만 나갑니다.</div>` : ''}
      <div class="card">${tr.log.map(logRow).join('')}</div>
      <div class="actions"><button class="btn primary big" data-a="endweek">다음으로 ▶</button></div>
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

function statBar(n, v, hint = '') { return `<div class="stat"><span>${esc(n)}${hint ? `<small>${hint}</small>` : ''}</span><div class="bar"><i style="width:${Math.min(100, v)}%"></i></div><b>${Math.round(v)}<em class="g g-${grade(v)}">${grade(v)}</em></b></div>`; }
function counterHint(id) { return { c_moon: '↔ 문발리', c_slice: '↔ 슬라이스·칩', c_lob: '↔ 로브', c_drop: '↔ 드롭샷', c_angle: '↔ 앵글', c_power: '↔ 강서브', c_poach: '↔ 포치', c_body: '↔ 바디샷' }[id] || ''; }
function logRow(l) { return `<div class="resrow"><span>${l.stage}</span><b>${esc(l.opp)}</b>${l.auto ? '<small>결과만</small>' : ''}<span>${l.games[0]}-${l.games[1]}</span><b class="${l.won ? 'pos' : 'neg'}">${l.won ? '승' : '패'}</b></div>`; }
function oppRow(o) { return `<div class="opp">${portrait(`opp:${o.seed % 997}:0`, 'focus', 'pt sm')}${portrait(`opp:${o.seed % 997}:1`, 'base', 'pt sm')}<div><b>${esc(o.names.join(' · '))}</b><small>${esc(o.club)} · ${esc(o.archName)} · ${grade(o.rating)}급</small></div></div>`; }

// 주간 화면 조각
const SCENE_OF = { lesson: 'court', practice: 'wall', club: 'club', rest: 'room', family: 'cafe', tour: 'venue', overtime: 'office' };
const POSE_OF = { lesson: 'fh', practice: 'bh', club: 'volley', rest: 'ready', family: 'cheer', tour: 'serve', overtime: 'sad' };
const BTN_ROWS = [['rest', 'lesson', 'practice'], ['family', 'club', 'tour']];
const MOOD = [['↓', '최악'], ['↘', '나쁨'], ['→', '보통'], ['↗', '좋음'], ['↑', '최고']];
const BIG_SHORT = { stroke: '스트로크', net: '네트', serve: '서브', physical: '피지컬', tactics: '전술', mental: '멘탈' };
function bgHTML(kind, wi) { return `<img class="bgimg" decoding="sync" src="${sceneURL(kind, wi.quarter)}" alt="">`; }
function heroHTML(pose) { return `<img class="heroimg" decoding="sync" src="${heroURL(PLAYER_LOOK, pose)}" alt="${esc(S.name)}">`; }
function actTitle(id, topic) {
  const a = ACT[id], n = LESSONS[topic]?.name;
  if (id === 'lesson') return `${a.icon} 레슨 · ${n}`;
  if (id === 'practice') return `${a.icon} 혼자 연습 · ${n || '기본기'} 복습`;
  return `${a.icon} ${a.name}`;
}
// 위쪽: 목표까지 남은 턴, 목표, 체력, 기분
function hudHTML(gear = true) {
  const wi = weekInfo(S.week), goal = G.currentGoal(S);
  const left = Math.max(1, Math.floor(((goal ? goal.by : G.TOTAL_WEEKS) - S.week) / 2) + 1);
  const nextT = Object.entries(S.entries).map(([tid]) => G.tour(S, tid)).filter(t => t.week > S.week).sort((a, b) => a.week - b.week)[0];
  const [arrow, word] = MOOD[S.condition + 2];
  return `<div class="uhud">
    <div class="hudtop"><span class="yr">${wi.label}</span><span class="badge div-${S.division}">${S.division === '국화' ? '🌼' : '🌱'} ${S.division}</span>${nextT ? `<span class="yr">📅 ${nextT.week - S.week}주 뒤 ${esc(nextT.name)}</span>` : ''}</div>
    ${gear ? `<button class="gearbtn" data-a="settings" aria-label="설정">⚙️</button>` : ''}
    <div class="hudmain">
      <div class="ucal ${left <= 3 ? 'urgent' : ''}"><b>${left}</b><small>턴 남음</small></div>
      <div class="hudr">
        <div class="goalbar"><i>목표</i><span>${esc(goal ? goal.text : '3년의 끝까지')}</span></div>
        <div class="energy"><small>체력</small><div class="ebar"><i style="width:${Math.round(S.fatigue)}%"></i></div><span class="mood m${S.condition + 2}">${arrow} ${word}</span></div>
      </div>
    </div>
  </div>`;
}
// 큰 능력치 한 줄. plus에 값이 있으면 위에 +숫자가 뜬다
function statRow(plus = {}, tappable = true) {
  const big = G.bigValues(S.stats);
  const cells = BIG_STATS.map(b => {
    const v = big[b.id], g = plus[b.id], gr = grade(v);
    return `<span class="ust"><small>${BIG_SHORT[b.id]}</small><span class="v"><b class="r r-${gr}">${gr}</b>${Math.round(v)}</span>${g >= 0.5 ? `<em>+${Math.round(g)}</em>` : ''}</span>`;
  }).join('');
  return tappable ? `<button class="statrow" data-a="go" data-s="stats" aria-label="능력치 자세히">${cells}</button>` : `<div class="statrow">${cells}</div>`;
}
// 행동 버튼. 아직 못 하는 것도 자리를 지키고, 눌러 보면 이유를 말해 준다
function gameButton(id) {
  const isTour = id === 'tour', open = isTour && G.openTournament(S);
  const a = isTour ? { name: '대회', icon: '🏆', tennis: true } : ACT[id];
  const locked = isTour ? !open : !G.visibleActions(S).some(x => x.id === id);
  const hurt = S.injury && a.tennis, off = locked || hurt, on = V.pick === id;
  const face = !off && S.faces[id];
  return `<button class="gbtn g-${id} ${on ? 'on' : ''} ${off ? 'off' : ''} ${open && !hurt ? 'hot' : ''}" data-a="${off ? 'nope' : 'act'}" data-id="${id}"><span class="gi">${a.icon}</span>${locked && !isTour ? '<span class="lock">🔒</span>' : ''}${face ? portrait(face, 'smile', 'pt xs') : ''}<b>${on ? (isTour ? '연락 ▶' : '이걸로 ▶') : a.name}</b></button>`;
}
// 설정. 지우기 전에 한 번 더 묻는다
function settingsHTML() {
  if (V.sheet === 'restart') return `<div class="overlay ev"><div class="sheet event"><h3>맨 처음부터 할까요?</h3><p>지금까지의 기록이 모두 사라지고 되돌릴 수 없어요.</p><div class="choices"><button class="btn" data-a="cancelsheet">계속 할게요</button><button class="btn danger" data-a="restart">처음부터 하기</button></div></div></div>`;
  return `<div class="overlay" data-a="closesheet"><div class="sheet" data-stop="1"><h3>설정</h3><button class="btn danger" data-a="restartAsk">맨 처음부터 하기</button><p class="hint">타이틀 화면으로 돌아가 이름을 정하는 것부터 다시 시작합니다.</p><button class="btn" data-a="cancelsheet">닫기</button></div></div>`;
}
// 못 고르는 버튼을 눌렀을 때 하는 혼잣말
function nopeLine(id) {
  if (S.injury) return LOCK_LINES.injured;
  if (id !== 'tour') return LOCK_LINES[id];
  const n = G.nextTournament(S);
  return n ? LOCK_LINES.noTour.replace('{weeks}', n.week - S.week).replace('{name}', n.name) : LOCK_LINES.noMoreTour;
}
// 말풍선: 지금 상태가 먼저, 평소에는 혼잣말
function homeLine(tw) {
  const open = G.openTournament(S);
  if (S.week === 3) return { who: 'coach', text: STATE_LINES.tutorial };
  if (S.injury) return { who: 'me', text: STATE_LINES.injury.replace('{name}', S.injury.name) };
  if (tw) return { who: 'me', text: STATE_LINES.entered.replace('{name}', tw.t.name) };
  if (S.overtime) return { who: 'me', text: STATE_LINES.overtime };
  if (S.stress >= 50) return { who: 'me', text: STATE_LINES.stressed };
  if (S.slump) return { who: 'me', text: STATE_LINES.slump };
  if (open) return { who: 'me', text: STATE_LINES.open.replace('{name}', open.name) };
  if (S.fatigue >= 60) return { who: 'me', text: STATE_LINES.tired };
  if (S.condition > 0) return { who: 'me', text: STATE_LINES.good };
  return { who: 'me', text: HOME_LINES[Math.floor(S.week / 2) % HOME_LINES.length] };
}
// 고른 행동의 설명. 같은 버튼을 한 번 더 누르면 결정.
function pickInfo() {
  if (V.pick === 'tour') {
    const t = G.openTournament(S);
    return `<div class="say info"><span>${t.type === 'national' ? '전국대회' : '비전국대회'} · 본선 ${t.draw}강. 같이 나갈 사람에게 연락해요.</span></div>`;
  }
  const p = G.previewAction(S, V.pick), face = S.faces[V.pick];
  const topicName = id => LESSONS[id]?.name || '기본기';
  const text = {
    lesson: () => S.lessons.length ? `코치 추천은 ${topicName(p.topic)}. 직접 고를 수도 있어요.` : `이번엔 코치님이 정해 줘요. ${topicName(p.topic)}!`,
    practice: () => `지난 레슨(${topicName(S.lastTopic)})을 혼자 복습해요.`,
    club: () => '클럽 사람들과 게임해요. 실전 감각이 붙어요.',
    rest: () => '푹 쉬어요. 체력이 크게 회복돼요.',
    family: () => '가족·친구를 만나요. 스트레스가 풀려요.',
  }[V.pick]();
  const tire = p.fatigue >= 16 ? '많이 지쳐요.' : p.fatigue > 0 ? '조금 지쳐요.' : '';
  return `<div class="say info"><span>${esc(text)} ${tire}</span>${face ? `<span class="fc">${esc(withJosa(whoName(face)))} 같이 해요. 더 잘 늘 거예요.</span>` : ''}</div>`;
}
function doAction(id, topic) { G.runWeek(S, id, topic); S.phase = 'result'; G.save(S); V.sheet = null; V.pick = null; V.screen = 'result'; }
function confirmPick() {
  const id = V.pick;
  V.pick = null;
  if (id === 'tour') V.sheet = 'partner';
  else if (id === 'lesson' && S.lessons.length) V.sheet = 'lesson';
  else doAction(id);
}
// 레슨에서 뭘 배울지 고르기 (깨달음이 생긴 뒤부터)
function lessonHTML() {
  const rec = G.coachTopic(S);
  const row = (topic, label) => {
    const p = G.previewAction(S, 'lesson', topic);
    return `<button class="lessonrow" data-a="lessonpick" data-topic="${topic}"><b>${esc(label)}</b><small>${p.gains.slice(0, 2).map(([b]) => BIG_NAME[b]).join(' · ')}</small></button>`;
  };
  return `<div class="overlay" data-a="closesheet"><div class="sheet" data-stop="1">
    <h3>이번 레슨에서 뭘 배울까요?</h3>
    ${row(rec, `코치님께 맡기기 (${LESSONS[rec].name})`)}
    ${S.lessons.filter(t => t !== rec).map(t => row(t, LESSONS[t].name)).join('')}
    <p class="hint">경기에서 약점을 깨달을 때마다 배울 수 있는 것이 늘어납니다.</p>
  </div></div>`;
}
// 경기 전 작전
function planHTML(opp) {
  const ch = { ...DEFAULT_CHOICES, ...(S.choices || {}) };
  const rec = opp ? coachRecommend(opp.arch) : null;
  return `<div class="card plan"><h3>오늘의 작전</h3>
    ${rec ? `<div class="coachrec">${portrait('coach', 'focus', 'pt xs')}<span>${esc(rec.line)}</span></div>` : ''}
    <div class="tempo">${TEMPO_OPTS.map(([v, n]) => `<button class="tempobtn t-${v} ${ch.tempo === v ? 'on' : ''}" data-a="tempo" data-v="${v}">${n}${rec?.tempo === v ? '<small>코치 추천</small>' : ''}</button>`).join('')}</div>
    <button class="chip sm morebtn ${V.detail ? 'on' : ''}" data-a="plandetail">세부 작전</button>
    ${V.detail ? `<div class="pdetail">${CHOICE_DEFS.filter(def => def.key !== 'tempo' && def.key !== 'mental').map(def => `<div class="crow"><span>${def.name}</span><div>${def.opts.filter(([v]) => !(def.key === 'shot' && LOCKED_SHOT_OPTS.includes(v) && !S.unlocks.includes(v))).map(([v, n]) => `<button class="chip sm ${ch[def.key] === v ? 'on' : ''}" data-a="choice" data-k="${def.key}" data-v="${v}">${n}</button>`).join('')}</div></div>`).join('')}</div>` : ''}
  </div>`;
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
  if (i >= INTRO_SCENES.length) { V.profile = { step: 0 }; V.screen = 'profile'; render(); return; }
  V.scene = i; V.screen = 'intro';
  render();
  introTimer = setTimeout(() => showScene(i + 1), 3800);
}

// ── 입력 처리 ─────────────────────────────────────────────
function beginTournament(tid) { G.startTournament(S, tid); G.save(S); V.sheet = null; V.detail = false; V.screen = 'tourIntro'; }
// 8강 전 본선은 결과만 처리하고 다음 화면을 정한다
function nextTourScreen() {
  const tr = S.tournament;
  while (G.isAutoRound(tr)) G.playAutoMatch(S, tr);
  G.save(S);
  V.screen = tr.finished ? 'tourResult' : 'between';
}
async function onClick(e) {
  const stop = e.target.closest('[data-stop]');
  const t = e.target.closest('[data-a]');
  if (!t) return;
  if (stop && !stop.contains(t)) return;
  if (stop && t.dataset.a.startsWith('close')) return;
  const a = t.dataset.a, d = t.dataset;
  switch (a) {
    case 'titleStart':
      if (S && !S.ending) { V.screen = S.tournament ? (S.tournament.finished ? 'tourResult' : 'between') : S.phase === 'result' ? 'result' : 'week'; break; }
      showScene(0); return;
    case 'introNext': showScene(V.scene + 1); return;
    case 'introSkip': showScene(INTRO_SCENES.length); return;
    case 'profileName': V.profile = { step: 1, name: (document.getElementById('pname').value || '').trim() || '나', answers: {} }; V.profile.reply = `${V.profile.name} 님, 반가워요.`; break;
    case 'profileOpt': {
      const P = V.profile, q = PROFILE[P.step - 1];
      P.answers[q.key] = d.id; P.reply = q.options.find(o => o.id === d.id).reply; P.step++;
      break;
    }
    case 'profileDone': S = G.newGame(V.profile.name, V.profile.answers); V.profile = null; doAction('lesson'); break;
    case 'settings': if (S.pendingEvents.length) return; V.pick = null; V.note = null; V.sheet = 'settings'; break;
    case 'restartAsk': V.sheet = 'restart'; break;
    case 'cancelsheet': V.sheet = null; break;
    case 'restart': G.clearSave(); S = null; V.sheet = null; V.pick = null; V.note = null; V.screen = 'title'; break;
    case 'go': V.screen = d.s; V.tab = null; V.thread = null; V.sheet = null; break;
    case 'tab': V.tab = d.id; break;
    case 'act':
      if (S.pendingEvents.length) return;
      V.note = null;
      if (d.id === 'overtime') { doAction('overtime'); break; }
      // 첫 탭은 미리보기, 같은 버튼을 한 번 더 누르면 결정
      if (V.pick !== d.id) { V.pick = d.id; break; }
      confirmPick();
      break;
    case 'nope': if (S.pendingEvents.length) return; V.pick = null; V.note = nopeLine(d.id); break;
    case 'lessonpick': doAction('lesson', d.topic); break;
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
    case 'match':
      if (G.isAutoRound(S.tournament)) { nextTourScreen(); break; }
      V.screen = 'match'; render(); runMatch(); return;
    case 'aftermatch': nextTourScreen(); break;
    case 'tempo': S.choices = { ...DEFAULT_CHOICES, ...(S.choices || {}), tempo: d.v, mental: d.v === 'safe' ? 'breathe' : 'keep' }; G.save(S); break;
    case 'choice': S.choices = { ...DEFAULT_CHOICES, ...(S.choices || {}), [d.k]: d.v }; G.save(S); break;
    case 'plandetail': V.detail = !V.detail; break;
    case 'endweek': {
      S.tournament = null; S.phase = 'plan'; V.pick = null; V.note = null;
      G.endWeek(S);
      G.save(S);
      V.screen = S.ending ? 'ending' : 'week';
      break;
    }
    case 'spd': if (M) { M.hl = d.v === 'hl'; M.speed = M.hl ? 1 : +d.v; if (M.view) M.view.speed = M.speed; app.querySelectorAll('[data-a=spd]').forEach(b => b.classList.toggle('on', b.dataset.v === d.v)); } return;
    case 'skipgame': if (M) { M.skipGame = true; M.view && (M.view.speed = 20); } return;
    case 'skipmatch': if (M) { M.skipMatch = true; M.skipGame = true; M.view && (M.view.speed = 20); } return;
    default: return;
  }
  render();
}

// ── 경기 진행 ─────────────────────────────────────────────
async function runMatch() {
  const tr = S.tournament;
  const { human, npc, opp } = G.buildTeams(S, tr);
  const sim = new MatchSim(human, npc, { startFatigue: G.startFatigue(S, tr) });
  M = { sim, speed: 1, hl: true, skipGame: false, skipMatch: false, opp };
  const stage = document.getElementById('stage');
  const players = [
    { charId: 'player', look: PLAYER_LOOK }, { charId: tr.partner, look: { ...PARTNER[tr.partner].color, band: '#ffffff' } },
    { charId: 'npc', look: oppLook(opp.seed % 997, 0) }, { charId: 'npc', look: oppLook(opp.seed % 997, 1) },
  ];
  if (webglOK()) {
    try {
      M.view = new MatchView(stage, { surface: tr.type === 'national' ? 'hard' : (opp.seed % 5 === 0 ? 'clay' : 'turf'), banner: `${tr.name} ${tr.div}부` });
      await M.view.setPlayers(players);
    } catch (err) { console.warn(err); M.view = null; }
  }
  if (!M.view) stage.classList.add('textmode');
  hud(null);
  while (!sim.over) {
    sim.teams[1].choices = aiChoices(sim, 1);
    M.curServe = sim.serveTeam;
    const g = sim.playGame();
    for (const [pi, pt] of g.points.entries()) {
      const lastOfGame = pi === g.points.length - 1;
      if (M.hl && M.view && !M.skipGame && !pt.big && !lastOfGame) { setLog(pt.text); hud(pt); await sleep(450); continue; }
      if (M.skipGame || !M.view) { if (!M.view && !M.skipGame) { setLog(pt.text); hud(pt); await sleep(380 / M.speed); } continue; }
      if (pt.big && pt.label) showBig(pt.label);
      await M.view.playPoint(pt, { onCutin: cutin });
      setLog(pt.text); hud(pt);
      if (pt.big && ['win', 'ace', 'poach'].includes(pt.endType) && M.speed === 1 && !M.skipGame) await M.view.replay(pt);
      hideBig();
    }
    if (M.view) M.view.speed = M.speed;
    M.skipGame = M.skipMatch;
    M.curServe = sim.serveTeam;
    hud(null);
    if (sim.over) break;
    if (!M.skipMatch) { setLog(`게임 ${g.gameWinner === 0 ? '획득!' : '내줌'} ${sim.games[0]} - ${sim.games[1]}`); await sleep(M.hl ? 700 : 400); }
  }
  // 기록
  S.choices = { ...sim.teams[0].choices, mental: sim.teams[0].choices.tempo === 'safe' ? 'breathe' : 'keep' };
  const me = sim.P[0], pa = sim.P[1];
  const firstWin = sim.winner === 0 && !S.flags.firstWin;
  const coachLine = firstWin ? '대회 첫 승이에요! 오늘 일은 오래 기억날 거예요.' : coachSays(sim);
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

// 상대 성향에 맞는 코치 조언. tempo는 추천하는 작전
function coachRecommend(archId) {
  return {
    moon: { line: '문발리를 쓰는 팀이에요. 높은 공에 물러서지 말고 먼저 끝내요.', tempo: 'attack' },
    slice: { line: '슬라이스가 낮게 깔려요. 침착하게 버티면 기회가 와요.', tempo: 'safe' },
    power: { line: '강타형이에요. 맞불 놓지 말고 평소대로 낮게 깔아요.', tempo: 'normal' },
    net: { line: '전위가 세요. 평소대로 치되 로브로 넘겨 봐요.', tempo: 'normal' },
    wall: { line: '수비형이에요. 기다리면 끝이 없어요. 먼저 공격해요.', tempo: 'attack' },
  }[archId] || { line: '하던 대로 해요.', tempo: 'normal' };
}
function coachSays(sim) {
  const me = sim.P[0].rec;
  const weak = Object.entries(me.counter).filter(([, v]) => v.tot >= 3).sort((a, b) => a[1].ok / a[1].tot - b[1].ok / b[1].tot)[0];
  if (weak && weak[1].ok / weak[1].tot < 0.6) return `${STAT_NAME[weak[0]]}가 제일 약했어요 (${weak[1].ok}/${weak[1].tot}). 레슨에서 같이 잡아 봐요.`;
  if (me.df >= 4) return '더블폴트가 많았어요. 서브 레슨부터 다시 해요.';
  if (me.errors > me.winners * 3) return '범실이 많았어요. 다음엔 침착하게 가 봐요.';
  if (sim.winner === 0) return '좋았어요! 이 감각 기억해요.';
  return '상대가 한 수 위였어요. 지금은 쌓는 시기예요.';
}
