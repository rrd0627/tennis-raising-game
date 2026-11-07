// 화면 — 타이틀, 인트로, 주간 행동, 결과, 메신저, 대회·랭킹, 능력치, 대회/경기, 엔딩
import * as G from './game.js';
import {
  STAT_GROUPS, STAT_NAME, GROUP_BY_ID, ACT, TRAIN_SPOTS, BOND_AT, REST_RESULTS, OUTINGS, CONDS, SURFACES, OPP_ARCH, ARCH, REGIONS, TIMES, LEVELS, regionGap, HOME_REGION, GOALS, SKILLS, SKILL_LV_NAME, LESSONS, BIG_STATS, INTRO_SCENES, PROFILE, DAY_NAMES, PARTNERS, PARTNER,
  grade, weekInfo, STAGE_NAME,
} from './data.js';
import { MatchSim, aiChoices, CHOICE_DEFS, DEFAULT_CHOICES, LOCKED_SHOT_OPTS, PLAN_OPTS, PLAN_SET, SHOT_NAME } from './sim.js';
import { MatchView, webglOK } from './match3d.js';
import { portraitURL, heroURL, sceneURL, bgPath, fairyURL, introURL, PLAYER_LOOK, oppLook } from './art.js';
import { HOME_LINES, STATE_LINES, LOCK_LINES, FAIL_WORD, PARTY_LINES, PARTY_WORD, TOUR_JOY, END_LINES } from './scenes.js';
import { CHECKS } from './checks.js';
import * as CMT_TEXT from './commentary.js';

const app = document.getElementById('app');
let S = null;
const V = { check: location.search.includes('check'), screen: 'title', train: false, tourStep: 0, tourReply: null, tid: null, pickTid: null, tab: null, thread: null, sheet: null, scene: 0, detail: false, profile: null, pick: null, note: null, step: 0, wipe: false, evtDone: null, turnWord: null };
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
  if (V.wipe) { app.querySelector('.screen.home')?.insertAdjacentHTML('beforeend', '<div class="wipe"></div>'); V.wipe = false; }
  V.turnWord = null;
  hydratePortraits();
  runFx();
  typeLines();
}
// ── 대사는 한 글자씩 나온다. 다 나오기 전에 누르면 글을 다 보여 주고, 다 나온 뒤에 눌러야 넘어간다 ──
// 화면이 바뀐 직후의 누름은 잠깐 무시해서, 이전 화면에서 누른 손가락에 대사가 그냥 지나가지 않게 한다.
const ADVANCE = new Set(['resnext', 'evtnext', 'evt', 'tourstep', 'introNext']);
const TYPE_MS = 28, TAP_GUARD = 300;
let typing = null, shownAt = 0;
function typeLines() {
  if (typing) { clearTimeout(typing.timer); typing = null; }
  shownAt = performance.now();
  if (S?.fast || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const nodes = [];
  for (const p of app.querySelectorAll('.dialog p, .scene p, .talkline')) {
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) { nodes.push({ n, chars: [...n.data] }); n.data = ''; }
  }
  if (!nodes.length) return;
  const screen = app.querySelector('.screen');
  screen?.classList.add('typing');
  let i = 0, k = 0;
  const step = () => {
    const cur = nodes[i];
    cur.n.data = cur.chars.slice(0, ++k).join('');
    if (k >= cur.chars.length) { i++; k = 0; }
    if (i >= nodes.length) { finishTyping(); return; }
    typing.timer = setTimeout(step, TYPE_MS);
  };
  typing = { nodes, screen, timer: setTimeout(step, 90) };
}
function finishTyping() {
  if (!typing) return;
  clearTimeout(typing.timer);
  for (const x of typing.nodes) x.n.data = x.chars.join('');
  typing.screen?.classList.remove('typing');
  typing = null;
  shownAt = performance.now();
}
// 결과 화면 연출: 체력 바가 차오르고 큰 숫자가 올라간다. 탭이 숨겨져 있어도 끝 값에 도착한다.
function runFx() {
  const bar = app.querySelector('.ebar i[data-to]');
  if (bar) setTimeout(() => { bar.style.width = bar.dataset.to + '%'; }, 80);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of app.querySelectorAll('[data-count]')) {
    const to = +el.dataset.count, t0 = performance.now() + 220;
    el.textContent = '+0';
    const tick = () => {
      if (!el.isConnected) return;
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / 650));
      el.textContent = `+${Math.round(to * (1 - (1 - k) ** 2))}`;
      if (k < 1) setTimeout(tick, 30);
    };
    tick();
  }
}

// ── 타이틀 ────────────────────────────────────────────────
const SCREENS = {
  title: () => V.check ? checkListHTML() : `
    <div class="screen title${bgPath('title') ? ' hasbg' : ''}" data-a="titleStart">
      ${bgPath('title') ? `<img class="bgimg" decoding="sync" src="${bgPath('title')}" alt="">` : ''}
      <div class="logo"><div class="ball">🎾</div><h1>테니스 선수<br>키우기</h1><p>간절히 바라는 사람에게 테니스의 요정이 찾아간다</p></div>
      ${portrait('me', 'smile', 'title-pt')}
      <p class="tapstart">${S && !S.ending ? '화면을 눌러 이어 하기' : '화면을 눌러 시작'}</p>
      ${S && !S.ending ? `<p class="tiny">${esc(S.name)} · ${weekInfo(Math.min(S.week, 156)).label}</p>` : ''}
    </div>`,

    intro: () => {
    const s = INTRO_SCENES[V.scene], img = introURL(V.scene);
    return `<div class="screen intro${img ? ' hasimg' : ''}" data-a="introNext" style="--bg:${s.bg}">
      ${img ? `<img class="introimg" decoding="sync" src="${img}" alt="">` : ''}
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
      line = '누, 누구세요? 테니스의 요정이요? 진짜요? 아, 저는…';
      body = `<div class="nameline"><input id="pname" maxlength="8" placeholder="이 사람의 이름" value="" autocomplete="off"><button class="btn primary" data-a="profileName">이에요</button></div>`;
    } else if (q) {
      line = `${P.reply} ${q.ask}`;
      body = `<p class="hint">다음 날 첫 레슨. 코치 눈에는 요정이 안 보인다. 이 사람은 어떤 사람일까요? 골라 주세요.</p><div class="opts">${q.options.map(o => `<button class="opt" data-a="profileOpt" data-id="${o.id}">${o.name}</button>`).join('')}</div>`;
    } else {
      line = `${P.reply} 좋아요, ${P.name} 님. 오늘은 포핸드부터 해 봐요!`;
      body = `<p class="hint">${esc(P.name)}: (요정님, 저 잘할 수 있을까요?)</p><button class="btn primary big" data-a="profileDone">나만 믿어!</button>`;
    }
    return `<div class="screen talk">
      ${portrait(P.step === 0 ? 'me' : 'coach', 'smile', 'title-pt')}
      <div class="talkline">${esc(line)}</div>
      ${body}
    </div>`;
  },

  // 주간 화면: 우마무스메 육성 화면처럼 장소와 캐릭터가 화면을 채우고, UI는 그 위에 얹는다
  week: () => {
    if (V.evtDone) return eventDoneScreen(V.evtDone);
    if (S.pendingEvents.length) return eventScreen(S.pendingEvents[0]);
    const wi = weekInfo(S.week), tw = G.tournamentThisWeek(S), say = homeLine(tw), pick = V.pick, training = V.train && !tw && !S.overtime;
    let moves;
    const goalT = !tw && G.goalTourNow(S);
    if (tw) moves = `<button class="btn primary big" data-a="tourgo">대회 출전하기 ▶</button>`;
    else if (goalT) moves = `<button class="btn primary big" data-a="tourinfo" data-tid="${goalT.id}">${esc(goalT.finale ? goalT.name : `목표 대회: ${goalT.name}`)} ▶</button>`;
    else if (S.overtime) moves = `<button class="btn primary big" data-a="act" data-id="overtime">야근하러 가기 ▶</button>`;
    else if (training) moves = trainGrid();
    else moves = `<div class="gbtns">${BTN_ROWS.map((row, i) => `<div class="grow ${i ? 'sub' : ''}">${row.map(gameButton).join('')}</div>`).join('')}</div>`;
    const place = tw ? 'tour' : S.overtime ? 'overtime' : pick;
    const pose = POSE_OF[place] || (S.injury || S.slump || S.fatigue >= 60 ? 'sad' : S.condition > 0 ? 'cheer' : 'ready');
    const pv = pick && pick !== 'tour' ? G.previewAction(S, pick) : null;
    const riskPct = pv && ACT[pick].risk ? Math.round(pv.fail * 100) : null;
    const title = tw ? `🏆 ${tw.t.name} · 파트너 ${PARTNER[tw.entry.partner].name}` : S.overtime ? '💼 마감 야근' : pick === 'tour' ? `🏆 ${G.openTournament(S).name}` : pick ? actTitle(pick, pv.topic) : training ? '🎾 무슨 훈련을 할까' : '';
    const bubble = pick ? pickInfo() : V.note ? `<div class="say"><span>${esc(V.note)}</span></div>` : `<div class="say">${say.who !== 'me' ? portrait(say.who, 'smile', 'pt xs') : ''}<span>${esc(say.text)}</span></div>`;
    return `
    <div class="screen home">
      ${bgHTML(SCENE_OF[place] || 'home', wi)}
      ${hudHTML()}
      <div class="hero">
        ${heroHTML(pose, LOOK_OF[place])}
        ${title ? `<div class="ribbon">${esc(title)}</div>` : ''}
        <div class="sidebtns">
          <button class="sidebtn" data-a="go" data-s="stats" aria-label="능력치">📊</button>
          <button class="sidebtn" data-a="go" data-s="tours" aria-label="대회와 랭킹">🏆</button>
          <button class="sidebtn" data-a="go" data-s="msg" aria-label="메신저">💬${G.unread(S) ? `<i>${G.unread(S)}</i>` : ''}</button>
        </div>
        ${bubble}
        ${riskPct !== null ? `<div class="risk lv${riskPct < 5 ? 0 : riskPct < 15 ? 1 : 2}"><small>실패 위험</small><b>${riskPct}%</b></div>` : ''}
      </div>
      <div class="homepanel">
        ${statRow(pv ? Object.fromEntries(pv.gains) : {}, true)}
        ${moves}
      </div>
      ${V.sheet === 'partner' ? pickerHTML() : V.sheet === 'tourinfo' ? tourInfoHTML() : V.sheet === 'lesson' ? lessonHTML() : V.sheet === 'skills' ? skillsHTML() : V.sheet === 'settings' || V.sheet === 'restart' ? settingsHTML() : ''}
      ${V.turnWord ? `<div class="turnword ${V.turnWord.big ? 'big' : ''}">${esc(V.turnWord.text)}</div>` : ''}
    </div>`;
  },

    // 결과: 게임 대화창. 아무 곳이나 누르면 다음으로 넘어간다
  result: () => {
    const L = S.weekLog, steps = resultSteps(L), step = steps[Math.min(V.step, steps.length - 1)];
    const done = step === 'result', after = done || step === 'rank' || step === 'joy' || step === 'joyreply';
    const rest = REST_RESULTS.find(r => r.id === L.rest);
    const outing = OUTINGS.find(o => o.id === L.outing);
    const pose = L.fail && step !== 'desc' ? 'sad' : step === 'mile' || step === 'rank' || step === 'bond' || step === 'hint' || step === 'joy' || step === 'joyreply' ? 'cheer' : rest && step !== 'desc' ? REST_POSE[rest.id] : POSE_OF[L.act] || 'ready';
    const fatigue0 = S.fatigue - L.fatigue;
    const big = done ? bigResult(L) : null, ranks = step === 'rank' ? rankUps(L) : [];
    const moving = step === 'desc' || step === 'talk';
    return `
    <div class="screen home ${step === 'choice' ? 'askmode' : ''} ${done ? 'hopping' : ''}" ${step === 'choice' || step === 'joy' ? '' : 'data-a="resnext"'}>
      ${bgHTML(OUTING_SCENE[L.outing] || SCENE_OF[L.act] || 'home', weekInfo(L.week), (rest?.id === 'poor' || L.fail) && step !== 'desc' ? 'dim' : '')}
      ${hudHTML(false, after ? { fatigue: done ? fatigue0 : S.fatigue, ...(done ? { to: S.fatigue } : {}) } : { fatigue: fatigue0, cond: L.cond0, conds: L.conds0, injury: L.injury0 })}
      <div class="hero">
        ${moving ? actorHTML(L, pose) : heroHTML(pose, LOOK_OF[L.act])}
        ${done && (rest || outing) ? `<div class="ribbon evt"><small>${ACT[L.act].icon} ${ACT[L.act].name}</small><b>${esc((rest || outing).name)}</b></div>` : `<div class="ribbon">${esc(actTitle(L.act, L.topic))}</div>`}
        ${step === 'fail' ? `<div class="bigword bad">${esc(FAIL_WORD[L.fail])}</div>` : ''}
        ${step === 'mile' ? `<div class="bigword good"><small>★ 처음 해낸 순간</small>${esc(L.mile.title)}</div>` : ''}
        ${step === 'hint' ? `<div class="bigword good"><small>기술 힌트</small>${esc(SKILLS[L.hint.skill].name)}</div>` : ''}
        ${step === 'bond' ? `<div class="bigword good"><small>${esc(namesOf(L.bonds))}</small>호흡 훈련!</div>` : ''}
        ${done && stampWord(L) ? `<div class="stamp">${esc(stampWord(L))}</div>` : ''}
        ${big ? `<div class="burst ${rest?.id || ''}"><b data-count="${big.n}">+${big.n}</b><small>${esc(big.label)}</small></div>` : ''}
        ${done && L.mood ? `<div class="moodband ${L.mood < 0 ? 'down' : 'up'}">${L.mood < 0 ? '↘ 기분이 가라앉았다' : '↗ 기분이 좋아졌다'}</div>` : ''}
        ${ranks.length ? `<div class="rankpop"><small>${esc(ranks[0].name)}</small><b class="r-${ranks[0].to}">${ranks[0].to}</b><span>등급 상승!</span></div>` : ''}
      </div>
      <div class="homepanel">
        ${statRow(done ? L.gains : {}, false, after ? null : L.before)}
        ${stepDialog(step, L)}
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
    const up = S.calendar.filter(t => t.week >= S.week && t.week < S.week + 20);
    return `<div class="screen tours">${V.sheet === 'partner' ? pickerHTML() : V.sheet === 'tourinfo' ? tourInfoHTML() : ''}${head}
      <p class="hint">개나리부 <b>전국대회</b>에서 우승하면 국화로 승급합니다. 대회를 누르면 특징을 보고 미리 파트너를 구할 수 있어요. 파트너가 없으면 나갈 수 없어요.</p>
      <div class="cal">${up.map(t => {
        const e = S.entries[t.id];
        const act = e ? `<span class="ok">출전 · ${esc(PARTNER[e.partner].name)}</span>` : t.week === S.week ? `<span class="muted">이번 주</span>` : '';
        return `<div class="trow ${t.type} ${G.isGoalTour(S, t) ? 'goalrow' : ''}" data-a="tourinfo" data-tid="${t.id}"><div class="tw">${weekInfo(t.week).season !== weekInfo(S.week).season ? `${weekInfo(t.week).season}년차 ` : ''}${weekInfo(t.week).label.split(' · ')[1]}<small>${DAY_NAMES[t.day]}요일</small></div><div class="tn"><b>${esc(t.name)}</b><small><span class="tag ${t.type}">${t.type === 'national' ? '전국' : '비전국'}</span> ${G.isGoalTour(S, t) ? '<span class="tag goal">목표</span> ' : ''}${t.finale ? '마지막 무대' : `${REGIONS[t.region]} · ${SURFACES[t.surface]} · ${TIMES[t.time]} · ${t.draw}강`}</small></div><div class="ta">${act}</div></div>`;
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
        ${Object.keys(S.skills || {}).length ? `<p>기술: ${Object.keys(S.skills).map(id => `${SKILLS[id].name} ${SKILL_LV_NAME[S.skills[id]]}`).join(', ')}</p>` : ''}
        <p>경험 <b>${Math.round(S.exp || 0)}</b> · 인맥 <b>${Math.round(S.fame || 0)}</b> · 받은 상품 ${(S.prizes || []).length}개</p>
        <p>코트 ${Object.keys(SURFACES).map(id => `${SURFACES[id]} ${grade(G.famOf(S, 'surface', id))}`).join(' · ')}</p>
        <p>상대의 공 ${OPP_ARCH.map(a => `${a.name} ${grade(G.famOf(S, 'opp', a.id))}`).join(' · ')}</p>
        ${Object.keys(S.growBig || {}).length ? `<p>잘 늘어나는 쪽: ${Object.keys(S.growBig).map(id => BIG_NAME[id]).join(', ')}</p>` : ''}
        <p>훈련 ${TRAIN_SPOTS.map(id => `${ACT[id].name} Lv${G.spotLevel(S, id)}`).join(' · ')}</p>
        <p>종합 능력 <b>${G.overall(S.stats).toFixed(1)}</b> (${grade(G.overall(S.stats))}) · 부상 이력 ${S.injuries}회</p>
        ${S.unlocks.length ? `<p>코치 비기: ${S.unlocks.map(u => CHOICE_DEFS[2].opts.find(o => o[0] === u)?.[1]).join(', ')}</p>` : ''}</div>`;
    } else {
      body = PARTNERS.filter(p => S.partners[p.id].known).map(p => { const ps = S.partners[p.id]; return `<div class="card prow">${portrait(p.id, 'smile', 'pt sm')}<div><b>${p.name}</b> <small>${p.arch} · ${p.style} · ${ps.div} · 자주 가는 곳 ${ACT[p.spec].name}${G.hasBond(S, p.id) ? ' · <span class="pos">호흡이 맞는다</span>' : ''}</small>${statBar('실력', ps.level)}${statBar('친밀도', ps.aff)}${statBar('콤비', ps.combo)}</div></div>`; }).join('') + `<p class="hint">훈련을 계속하다 보면 새 파트너를 만날 수 있습니다. 친밀도가 ${BOND_AT}을 넘으면 호흡이 맞습니다.</p>`;
    }
    return `<div class="screen stats"><header class="topbar"><button class="back" data-a="go" data-s="week">‹</button><div class="wk">능력치</div><div class="sub">종합 ${G.overall(S.stats).toFixed(1)}</div></header>
      <div class="tabs scroll">${tabs.map(([id, n]) => `<button class="${tab === id ? 'on' : ''}" data-a="tab" data-id="${id}">${n}</button>`).join('')}</div>${body}
    </div>`;
  },

  tourIntro: () => {
    const tr = S.tournament;
    const opps = tr.stage === 'group' ? tr.group.opps : [];
    return `<div class="screen tour">
      <div class="tour-head ${tr.type}"><small>${tr.finale ? '마지막 무대' : `${tr.type === 'national' ? '전국대회' : '비전국대회'} · ${tr.div}부 · 본선 ${tr.draw}강`}</small><h2>${esc(tr.name)}</h2>
      <p>${tr.seed ? `시드 ${tr.seed}번${tr.bye ? ' · 예선 면제' : ''}` : '노시드'}</p></div>
      <div class="vs">${portrait('me', 'focus', 'pt')}${portrait(tr.partner, 'smile', 'pt')}<div><b>${esc(S.name)} · ${esc(PARTNER[tr.partner].name)}</b><small>콤비 ${Math.round(S.partners[tr.partner].combo)} · 컨디션 ${COND[S.condition + 2]}${tr.spare ? ' · 예비 라켓' : ''}${G.hasBond(S, tr.partner) ? ' · <span class="pos">호흡이 맞는다</span>' : ''}${G.condList(S).map(c => ` · ${esc(c.name)}`).join('')}</small></div></div>
      ${opps.length ? `<div class="card"><h3>예선 상대 (1승이면 본선)</h3>${opps.map(o => oppRow(o)).join('')}</div>` : `<div class="card"><p>${tr.finale ? '지면 여기서 끝이다. 파트너와 끝까지 간다.' : '상위 시드라 예선 없이 본선부터 시작합니다.'}</p></div>`}
      ${envHTML(tr, opps[0] || G.currentOpponent(tr))}
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
      ${envHTML(tr, opp)}
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
        <div class="rally" id="rally"></div>
        <div class="pointtext" id="pointtext"></div>
        <div class="shotcard" id="shotcard"></div>
      </div>
      <div class="hud">
        <div class="mentals" id="mentals"></div>
        <div class="ctrl">
          <button class="chip sm on" data-a="spd" data-v="hl">하이라이트</button><button class="chip sm" data-a="spd" data-v="1">전체 1×</button><button class="chip sm" data-a="spd" data-v="3">전체 3×</button>
          <button class="chip sm" data-a="skipgame">게임 스킵</button><button class="chip sm" data-a="skipmatch">결과 보기</button>
        </div>
        <div class="cmt" id="cmt"></div>
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
      <div class="result-banner ${R.won ? 'win' : 'lose'}">${R.comeback ? '역전승!' : R.won ? '승리!' : '패배'}<small>${R.games[0]} - ${R.games[1]} · ${esc(R.oppName)}</small></div>
      <div class="vs">${portrait('me', R.won ? 'joy' : 'down', 'pt')}${portrait('coach', R.won ? 'smile' : 'focus', 'pt')}<div class="bubble">${esc(R.coachLine)}</div></div>
      <div class="card"><table class="rep"><tr><th></th><th>${esc(S.name)}</th><th>${esc(PARTNER[tr.partner].name)}</th></tr>
        ${row('퍼스트 서브', pct(p.fsIn, p.fsTot), pct(q.fsIn, q.fsTot))}
        ${row('에이스 / 더블폴트', `${p.aces} / ${p.df}`, `${q.aces} / ${q.df}`)}
        ${row('위너', p.winners, q.winners)}${row('범실', p.errors, q.errors)}
        ${row('포치 성공', `${p.poachWin}/${p.poachTry}`, `${q.poachWin}/${q.poachTry}`)}
        ${row('어시스트', p.assists, q.assists)}
      </table><p>브레이크 성공 ${R.bp[0]}/${R.bp[1]}</p>${R.oppErr ? `<p>상대 범실 초반 ${R.oppErr[0]}개, 후반 ${R.oppErr[1]}개</p>` : ''}</div>
      <div class="card shine"><h3>오늘 빛난 능력치</h3>${R.shine?.length ? R.shine.map((x, i) => `<div class="shinerow"><b class="rk">${i + 1}</b><span class="callpop us static"><span>${esc(x.t)}</span><b class="g${x.g}">${x.g}</b></span><small>${esc(x.name)} · ${x.n}번 승부를 갈랐다</small></div>`).join('') : '<p class="muted">아직 경기에서 이름이 뜬 능력치가 없다. 능력치가 C 등급을 넘으면 경기에서 이름이 뜬다.</p>'}</div>
      ${Object.keys(p.skillUse || {}).length ? `<div class="card"><h3>쓴 기술</h3><p>${Object.entries(p.skillUse).map(([id, n]) => `${SKILLS[id].name} ${n}번`).join(' · ')}</p></div>` : ''}
      ${counters.length ? `<div class="card"><h3>대처 성공률 (${esc(S.name)})</h3>${counters.map(([c, v]) => `<div class="cbar"><span>${STAT_NAME[c]}</span><div class="bar"><i style="width:${v.ok / v.tot * 100}%"></i></div><b>${v.ok}/${v.tot}</b></div>`).join('')}</div>` : ''}
      <div class="actions"><button class="btn primary big" data-a="aftermatch">${tr.finished ? '대회 결과 보기' : '다음 경기로'}</button></div>
    </div>`;
  },

  // 목표가 걸린 경기에서 졌을 때: 그 경기만 다시 할지 묻는다
  tourRetry: () => {
    const tr = S.tournament, ask = tr.retryAsk, g = GOALS.find(x => x.id === tr.goal);
    const can = S.retries > 0;
    const body = can
      ? `코치: "${esc(ask.opp)}에게 ${ask.games[0]}-${ask.games[1]}로 졌어요. 여기서 끝나면 목표(${esc(g?.text || '')})를 놓쳐요. 그 경기만 한 번 더 해 볼래요?" 남은 기회 ${S.retries}번.`
      : `코치: "${esc(ask.opp)}에게 ${ask.games[0]}-${ask.games[1]}로 졌어요. 이번 목표(${esc(g?.text || '')})는 여기까지네요."`;
    return `<div class="screen home askmode">
      ${bgHTML('venue', weekInfo(S.week), 'dim')}
      <div class="hero">${heroHTML('sad')}<div class="ribbon evt"><small>${esc(tr.name)}</small><b>목표가 걸린 경기</b></div><div class="bigword bad">졌다</div></div>
      <div class="homepanel"><div class="dialog ask">${portrait('coach', 'tired', 'pt sm')}<div><p>${body}</p><div class="picks">${can ? '<button class="pickbtn" data-a="retrymatch" data-yes="1">한 번 더 한다</button>' : ''}<button class="pickbtn" data-a="retrymatch" data-yes="0">${can ? '여기까지 할래요' : '받아들인다'}</button></div></div></div></div>
    </div>`;
  },

  // 대회가 끝난 뒤: 결과 → (입상이면) 축하 자리 → 남은 것. 눌러서 넘긴다.
  tourResult: () => {
    const tr = S.tournament, steps = tourSteps(tr), step = steps[Math.min(V.tourStep, steps.length - 1)], last = V.tourStep >= steps.length - 1;
    const party = isParty(tr.final), promo = tr.final === 'W' && tr.type === 'national' && tr.div === '개나리';
    const wi = weekInfo(S.week), R = tr.rewards || {}, pname = PARTNER[tr.partner].name;
    const fill = t => t.replaceAll('{p}', pname);
    const myPose = party ? 'cheer' : 'sad';
    const foot = `<div class="dfoot"><span></span><small class="tapnext">눌러서 계속 ▼</small></div>`;
    let hero, dialog, extra = '';
    if (step === 'joy') {
      const talk = tourTalk(tr.final);
      hero = heroHTML(myPose);
      dialog = `<div class="dialog ask"><div><b class="namechip">${esc(S.name)}</b><p>${esc(talk.line)}</p><div class="picks">${talk.options.map((o, i) => `<button class="pickbtn" data-a="tourjoy" data-i="${i}">${esc(o.label)}</button>`).join('')}</div></div></div>`;
    } else if (step === 'party') {
      const lines = PARTY_LINES[tr.final], n = lines[S.results.length % lines.length];
      hero = `<div class="duo"><img class="heroimg a" decoding="sync" src="${heroURL(PLAYER_LOOK, 'cheer')}" alt="${esc(S.name)}"><img class="heroimg b" decoding="sync" src="${heroURL(lookOf(tr.partner), 'cheer', tr.partner)}" alt="${esc(pname)}"></div>${fairyHTML('joy')}`;
      extra = `${confettiHTML()}<div class="spots"><i></i><i></i></div>${tr.final === 'W' ? '<div class="trophy">🏆</div>' : ''}<div class="bigword good">${esc(PARTY_WORD[tr.final])}</div>`;
      dialog = `<div class="dialog"><div><p>${esc(fill(n))}</p>${foot}</div></div>`;
    } else if (step === 'rewards') {
      hero = heroHTML(party ? 'ready' : 'relax');
      const lines = [
        `경험 <b class="up">+${R.exp || 0}</b>`,
        R.fame ? `인맥 <b class="up">+${R.fame}</b>${party && !tr.finale ? ' · 같이 나가자는 사람이 생긴다' : ''}` : '',
        `상품 <b class="up">${esc(R.prize || '')}</b>`,
        tr.pts ? `랭킹 포인트 <b class="up">+${tr.pts}</b>` : '',
        `${esc(SURFACES[tr.surface] || '하드')} 코트와 이번에 만난 공이 조금 익숙해졌다.`,
        tr.moodLine ? esc(tr.moodLine) : '',
      ].filter(Boolean);
      dialog = `<div class="dialog"><div>${V.tourReply ? `<b class="namechip">${esc(S.name)}</b><p>${esc(V.tourReply)}</p>` : ''}<ul class="reslines">${lines.map(x => `<li>${x}</li>`).join('')}</ul>${foot}</div></div>`;
      extra = `<div class="bigword ${party ? 'good' : ''}"><small>대회에서 남은 것</small></div>`;
    } else {
      hero = heroHTML(myPose);
      dialog = `<div class="dialog"><div><p>${esc(tr.scene)}</p>${foot}</div></div>`;
      extra = `<div class="bigword ${party ? 'good' : 'bad'}">${promo ? '<small>🌼 이제 국화부에 나갑니다</small>' : ''}${esc(STAGE_NAME[tr.final])}${party ? '!' : ''}</div>`;
    }
    return `<div class="screen home ${step === 'party' ? 'party' : ''}" ${step === 'joy' ? '' : `data-a="${last ? 'endweek' : 'tourstep'}"`}>
      ${bgHTML(party ? 'venue' : 'cafe', wi, party ? '' : 'dim')}
      <div class="hero">
        ${hero}
        <div class="ribbon evt"><small>${esc(tr.name)} · ${tr.div}부</small><b>${esc(STAGE_NAME[tr.final])}</b></div>
        ${extra}
      </div>
      <div class="homepanel">${dialog}</div>
    </div>`;
  },

  ending: () => {
    const e = S.ending, r = e.rank || G.finalRank(S), wi = weekInfo(Math.min(e.week || S.week, 156));
    return `<div class="screen ending">
      <div class="logo"><small>${e.quit ? `${wi.season}년차 ${wi.quarter}, 여기까지` : '3년 뒤…'}</small><h1>${esc(e.name)}</h1></div>
      ${portrait('me', ['injury', 'burnout', 'quit'].includes(e.id) ? 'tired' : 'joy', 'title-pt')}
      <div class="talkline">${esc(S.name)}: ${esc(e.id === 'queen' ? END_LINES.win : e.quit ? END_LINES.quit : END_LINES.done)}</div>
      <div class="card"><p>${esc(e.text)}</p>${e.partner ? `<p>파트너: ${esc(e.partner)}</p>` : ''}</div>
      <div class="card rankcard"><small>최종 평가</small><b class="r r-${r.letter[0]}">${r.letter}</b><div><p>${r.score.toLocaleString()}점 · 능력 ${r.stat.toLocaleString()} + 기술 ${r.skill.toLocaleString()}</p><p class="muted">NTRP로 치면 ${r.ntrp.toFixed(1)} 정도</p></div></div>
      <div class="card"><p>최종 부서: ${S.division}부 · 종합 능력 ${G.overall(S.stats).toFixed(1)}</p><p>우승: 개나리 비전국 ${S.titles.local} · 전국 ${S.titles.national} · 국화 비전국 ${S.titles.gukwhaLocal} · 전국 ${S.titles.gukwhaNational}</p><p>출전 ${S.results.length}회 · 부상 ${S.injuries}회 · 계단 ${S.stair?.n || 0}번</p></div>
      <p class="hint nextwish">🧚 어디선가 또 누군가 간절히 빌고 있다…</p>
      <button class="btn primary big" data-a="restart">다음 사람에게 가기</button>
    </div>`;
  },
};

function statBar(n, v, hint = '') { return `<div class="stat"><span>${esc(n)}${hint ? `<small>${hint}</small>` : ''}</span><div class="bar"><i style="width:${Math.min(100, v)}%"></i></div><b>${Math.round(v)}<em class="g g-${grade(v)}">${grade(v)}</em></b></div>`; }
function counterHint(id) { return { c_moon: '↔ 문발리', c_slice: '↔ 슬라이스·칩', c_lob: '↔ 로브', c_drop: '↔ 드롭샷', c_angle: '↔ 앵글', c_power: '↔ 강서브', c_poach: '↔ 포치', c_body: '↔ 바디샷' }[id] || ''; }
function logRow(l) { return `<div class="resrow"><span>${l.stage}</span><b>${esc(l.opp)}</b>${l.auto ? '<small>결과만</small>' : ''}<span>${l.games[0]}-${l.games[1]}</span><b class="${l.won ? 'pos' : 'neg'}">${l.won ? '승' : '패'}</b></div>`; }
function oppRow(o) {
  const h = G.h2hOf(S, o), styles = o.styles ? [...new Set(o.styles)].join('·') : o.archName;
  return `<div class="opp">${portrait(`opp:${o.seed % 997}:0`, 'focus', 'pt sm')}${portrait(`opp:${o.seed % 997}:1`, 'base', 'pt sm')}<div><b>${esc(o.names.join(' · '))}</b><small>${esc(o.club)} · ${esc(styles)} · ${grade(o.rating)}급${h ? ` · 전적 ${h.w}승 ${h.l}패` : ''}</small></div></div>`;
}

// 대회 뒤 화면
const isParty = stage => ['W', 'F', 'SF', 'QF', 'FP', 'FF', 'FW'].includes(stage);
function tourSteps(tr) { return isParty(tr.final) ? ['result', 'party', 'joy', 'rewards'] : ['result', 'joy', 'rewards']; }
// 대회 결과에 따라 주인공이 건네는 말
function tourTalk(stage) { return ['W', 'FW'].includes(stage) ? TOUR_JOY.top : ['F', 'FF'].includes(stage) ? TOUR_JOY.second : ['SF', 'QF', 'FP'].includes(stage) ? TOUR_JOY.deep : TOUR_JOY.low; }
function confettiHTML() {
  const colors = ['#ff5f8f', '#ffd24d', '#5fb8ff', '#7fe08a', '#ffffff'];
  return `<div class="confetti">${Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${colors[i % 5]};animation-delay:${-(i * 0.23).toFixed(2)}s"></i>`).join('')}</div>`;
}
// 오늘의 환경: 내가 하던 환경과 얼마나 다른가
function envHTML(tr, opp) {
  if (!opp) return '';
  const e = G.envOf(S, tr, opp);
  const word = v => (v >= 70 ? '익숙하다' : v >= 35 ? '겪어 봤다' : '낯설다');
  const row = (label, name, v) => `<div class="envrow"><span>${label}</span><b>${esc(name)}</b><em class="g g-${grade(v)}">${grade(v)}</em><small class="${v < 35 ? 'neg' : ''}">${word(v)}</small></div>`;
  return `<div class="card env">${row('코트', e.surfaceName, e.surfaceFam)}${row('상대의 공', e.archName, e.oppFam)}</div>`;
}

// 주간 화면 조각
const SCENE_OF = { lesson: 'court', gym: 'gym', practice: 'wall', club: 'club', home: 'room', rest: 'room', family: 'cafe', clinic: 'clinic', tour: 'venue', overtime: 'office' };
const OUTING_SCENE = { trip: 'sea', play: 'cafe', home: 'room' };
const POSE_OF = { lesson: 'fh', gym: 'stretch', practice: 'bh', club: 'volley', home: 'stretch', rest: 'relax', family: 'relax', clinic: 'relax', tour: 'serve', overtime: 'tired' };
const REST_POSE = { poor: 'tired', fine: 'relax', deep: 'stretch' };
// 코트 밖에서는 옷이 다르다 (임시 그림)
const OFF_COURT = { band: PLAYER_LOOK.hair };
const LOOK_OF = { clinic: { ...PLAYER_LOOK, ...OFF_COURT, outfit: '#a9c7ea' }, gym: { ...PLAYER_LOOK, ...OFF_COURT, outfit: '#e86a8a' }, home: { ...PLAYER_LOOK, ...OFF_COURT, outfit: '#a9c7ea' }, rest: { ...PLAYER_LOOK, ...OFF_COURT, outfit: '#a9c7ea' }, family: { ...PLAYER_LOOK, ...OFF_COURT, outfit: '#f3b94f' }, overtime: { ...PLAYER_LOOK, ...OFF_COURT, outfit: '#5b6b84' } };
const BTN_ROWS = [['rest', 'train', 'skill'], ['clinic', 'family', 'tour']];
const namesOf = ids => ids.map(id => PARTNER[id].name).join(', ');
const MOOD = [['↓', '최악'], ['↘', '나쁨'], ['→', '보통'], ['↗', '좋음'], ['↑', '최고']];
const BIG_SHORT = { stroke: '스트로크', net: '네트', serve: '서브', physical: '피지컬', tactics: '전술', mental: '멘탈' };
function bgHTML(kind, wi, cls = '') { return `<img class="bgimg ${cls}" decoding="sync" src="${sceneURL(kind, wi.quarter)}" alt="">`; }
// 요정(플레이어)은 늘 곁에 있다. 임시 그림.
// 요정: 실제 그림(manifest.fairy)이 있으면 그 그림, 없으면 임시 이모지. 주인공 자세에 맞춰 표정을 고른다.
const FAIRY_EXPR = { cheer: 'joy', sad: 'worry', tired: 'worry' };
function fairyHTML(expr = 'base') {
  const u = fairyURL(expr);
  return u ? `<img class="fairy img" decoding="sync" src="${u}" alt="" aria-hidden="true">` : '<div class="fairy" aria-hidden="true">🧚</div>';
}
function heroHTML(pose, look = PLAYER_LOOK) { return `<img class="heroimg" decoding="sync" src="${heroURL(look, pose)}" alt="${esc(S.name)}">${fairyHTML(FAIRY_EXPR[pose])}`; }
// ── 결과 단계: 설명 → (가끔) 선택 → 대사 → 결과 ─────────────
function resultSteps(L) {
  return [L.desc && 'desc', L.fail && 'fail', L.choice && L.picked == null && 'choice', (L.reply || L.scene) && 'talk', L.mile && 'mile', L.hint && 'hint', L.bonds?.length && 'bond', 'result', rankUps(L).length && 'rank', L.joy && (L.joyPicked == null ? 'joy' : 'joyreply')].filter(Boolean);
}
// 이번 턴에 등급이 오른 능력치
function rankUps(L) {
  if (!L.before) return [];
  const now = G.bigValues(S.stats);
  return BIG_STATS.filter(b => grade(now[b.id]) !== grade(L.before[b.id]) && now[b.id] > L.before[b.id]).map(b => ({ name: b.name, from: grade(L.before[b.id]), to: grade(now[b.id]) }));
}
// 결과 단계의 도장. 쉬는 행동에는 찍지 않는다.
function stampWord(L) {
  if (!ACT[L.act].train) return '';
  if (L.fail) return '';
  if (L.bonds?.length) return '호흡 훈련!';
  if (L.feel === 'good') return '잘 나왔다!';
  if (L.feel === 'bad') return '안 나왔다…';
  if (S.slump) return '그럭저럭…';
  return { lesson: '성공!', gym: '운동 완료!', practice: '연습 완료!', club: '좋은 게임!', home: '오늘도 완료!' }[L.act];
}
// 행동 중의 움직임 (임시 그림): 테니스는 두 자세가 번갈아 나오고 공이 오간다
const SWING = { lesson: ['fh', 'bh'], gym: ['stretch', 'tired'], practice: ['bh', 'fh'], club: ['volley', 'fh'], home: ['stretch', 'relax'] };
const FLOAT = { rest: 'Z', family: '♥', clinic: '+', overtime: '…' };
function actorHTML(L, pose) {
  const pair = SWING[L.act], fl = FLOAT[L.act], look = LOOK_OF[L.act] || PLAYER_LOOK;
  if (pair) return `<img class="heroimg fa" decoding="sync" src="${heroURL(look, pair[0])}" alt="${esc(S.name)}"><img class="heroimg fb" decoding="sync" src="${heroURL(look, pair[1])}" alt="">${ACT[L.act].tennis ? '<i class="fxball"></i>' : ''}${fairyHTML()}`;
  return heroHTML(pose, LOOK_OF[L.act]) + (fl ? `<div class="floaty"><i>${fl}</i><i>${fl}</i><i>${fl}</i></div>` : '');
}
// 빨리 넘기기: 설명과 대사를 건너뛴다. 선택, 이정표, 결과, 등급 상승은 건너뛰지 않는다.
function skipFast() {
  if (!S.fast) return;
  const steps = resultSteps(S.weekLog);
  while (V.step < steps.length - 1 && (steps[V.step] === 'desc' || steps[V.step] === 'talk')) V.step++;
}
function nextStep() {
  if (V.step >= resultSteps(S.weekLog).length - 1) return false;
  V.step++;
  skipFast();
  return true;
}
// "코치: 말" 꼴의 글을 이름표와 말로 나눈다
function speech(text) {
  const m = /^([^\s:"]{1,8}(?: [^\s:"]{1,6})?): ([\s\S]*)$/.exec(text);
  return m ? { name: m[1], text: m[2] } : { name: null, text };
}
function stepDialog(step, L) {
  const foot = `<div class="dfoot"><button class="fastbtn ${S.fast ? 'on' : ''}" data-a="fasttoggle">${S.fast ? '빨리 ▶▶' : '빨리 끔'}</button><small class="tapnext">눌러서 계속 ▼</small></div>`;
  const face = (who, name) => (who === 'me' && name ? '' : portrait(who, 'smile', 'pt sm'));
  if (step === 'desc') return `<div class="dialog narr"><div><p>${esc(L.desc)}</p>${foot}</div></div>`;
  if (step === 'choice') {
    const s = speech(L.choice.prompt);
    return `<div class="dialog ask">${face(L.choice.who, s.name || 'x')}<div>${s.name ? `<b class="namechip">${esc(s.name)}</b>` : ''}<p>${esc(s.text)}</p><div class="picks">${L.choice.options.map((o, i) => `<button class="pickbtn" data-a="scenepick" data-i="${i}">${esc(o)}</button>`).join('')}</div></div></div>`;
  }
  if (step === 'talk') {
    const line = L.reply || L.scene, s = speech(line.text);
    return `<div class="dialog">${face(line.who, s.name)}<div>${s.name ? `<b class="namechip">${esc(s.name)}</b>` : ''}<p>${esc(s.text)}</p>${L.people?.length ? `<small class="withline">${esc(withJosa(namesOf(L.people)))} 같이 했다</small>` : ''}${foot}</div></div>`;
  }
  if (step === 'mile') {
    const s = speech(L.mile.text);
    return `<div class="dialog"><div><p>${esc(L.mile.text)}</p>${foot}</div></div>`;
  }
  if (step === 'joy') return `<div class="dialog ask"><div><b class="namechip">${esc(S.name)}</b><p>${esc(L.joy.line)}</p><div class="picks">${L.joy.options.map((o, i) => `<button class="pickbtn" data-a="joypick" data-i="${i}">${esc(o.label)}</button>`).join('')}</div></div></div>`;
  if (step === 'joyreply') return `<div class="dialog"><div><b class="namechip">${esc(S.name)}</b><p>${esc(L.joy.options[L.joyPicked].reply)}</p>${foot}</div></div>`;
  if (step === 'hint') return `<div class="dialog">${L.hint.who === 'me' ? '' : portrait(L.hint.who, 'smile', 'pt sm')}<div><p>${esc(L.hint.line)}</p><small class="withline">${L.hint.first ? '기술 버튼에서 경험으로 배울 수 있다' : '더 잘 알게 됐다. 배우는 데 드는 경험이 줄었다'}</small>${foot}</div></div>`;
  if (step === 'fail') return `<div class="dialog"><div><p>${esc(L.failLine)}</p>${foot}</div></div>`;
  if (step === 'bond') return `<div class="dialog">${portrait(L.bonds[0], 'joy', 'pt sm')}<div><p>${esc(L.bondLine)}</p>${foot}</div></div>`;
  if (step === 'rank') return `<div class="dialog"><div><ul class="reslines">${rankUps(L).map(r => `<li>${esc(r.name)} 등급이 <b class="up">${r.from}</b>에서 <b class="up">${r.to}</b>로 올랐다.</li>`).join('')}</ul>${foot}</div></div>`;
  return `<div class="dialog"><div><ul class="reslines">${resultLines(L).map(x => `<li>${x}</li>`).join('')}</ul>${foot}</div></div>`;
}
// ── 이벤트: 팝업이 아니라 전체 화면. 선택지에는 효과를 쓰지 않고, 고른 뒤에 드러낸다 ──
// [배경, 자세, 분위기(good·bad면 큰 글자)]
const EVENT_LOOK = {
  plateau: ['court', 'sad', 'bad'], stair: ['court', 'cheer', 'good'], callout: ['club', 'ready', ''], yipsOn: ['court', 'sad', 'bad'], hint: ['court', 'cheer', 'good'],
  deadline: ['office', 'tired', 'bad'], dinner: ['office', 'ready', ''], boss: ['office', 'ready', ''], string: ['court', 'sad', 'bad'],
  wedding: ['cafe', 'relax', ''], secretary: ['club', 'ready', ''], coachMove: ['court', 'sad', 'bad'], injury: ['room', 'sad', 'bad'],
  slump: ['court', 'sad', 'bad'], secret: ['court', 'cheer', 'good'], promotion: ['venue', 'cheer', 'good'], rival: ['venue', 'ready', 'bad'],
  invite: ['court', 'ready', ''], meet: ['club', 'ready', ''], withdraw: ['room', 'sad', 'bad'], goal: ['court', 'cheer', 'good'],
  goalMiss: ['court', 'sad', 'bad'], story: ['home', 'ready', ''], realize: ['court', 'ready', 'good'], lessonsOpen: ['court', 'cheer', 'good'],
};
const BG_LOOK = { office: 'overtime', room: 'rest', cafe: 'family' };
function eventLook(ev) {
  if (ev.id === 'promo') return S.work >= 65 ? ['office', 'cheer', 'good'] : ['office', 'sad', 'bad'];
  if (ev.id === 'bond') return ev.step >= 1 ? ['court', 'cheer', 'good'] : ['court', 'ready', ''];
  return EVENT_LOOK[ev.id] || ['home', 'ready', ''];
}
function eventFrame(look, title, inner, attrs = '', cls = '', big = '') {
  const [bg, pose] = look;
  return `<div class="screen home ${cls}" ${attrs}>
    ${bgHTML(bg, weekInfo(S.week))}
    ${hudHTML(false)}
    <div class="hero">
      ${heroHTML(pose, LOOK_OF[BG_LOOK[bg]])}
      <div class="ribbon evt"><small>이벤트</small><b>${esc(title)}</b></div>
      ${big}
    </div>
    <div class="homepanel">${statRow({}, false)}${inner}</div>
  </div>`;
}
function eventScreen(ev) {
  const v = G.eventView(S, ev), look = eventLook(ev), s = speech(v.text), single = v.choices.length === 1;
  const label = t => t.replace(/\s*\([^)]*\)\s*$/, '');
  const head = `${v.who === 'me' ? '' : portrait(v.who, look[2] === 'bad' ? 'tired' : 'smile', 'pt sm')}<div>${s.name ? `<b class="namechip">${esc(s.name)}</b>` : ''}<p>${esc(s.text)}</p>`;
  const big = look[2] ? `<div class="bigword ${look[2]}">${esc(v.title)}</div>` : '';
  if (single) return eventFrame(look, v.title, `<div class="dialog">${head}<div class="dfoot"><span></span><small class="tapnext">${esc(label(v.choices[0][1]))} ▼</small></div></div></div>`, `data-a="evt" data-c="${v.choices[0][0]}"`, '', big);
  return eventFrame(look, v.title, `<div class="dialog ask">${head}<div class="picks">${v.choices.map(([c, n]) => `<button class="pickbtn" data-a="evt" data-c="${c}">${esc(label(n))}</button>`).join('')}</div></div></div>`, '', 'askmode', big);
}
function eventDoneScreen(d) {
  return eventFrame(d.look, d.title, `<div class="dialog"><div><ul class="reslines">${d.lines.map(x => `<li>${x}</li>`).join('')}</ul><div class="dfoot"><span></span><small class="tapnext">눌러서 계속 ▼</small></div></div></div>`, 'data-a="evtnext"');
}
// 이벤트로 바뀐 수치를 글로 보여 준다
const EVENT_STATS = [['work', '직장 평판', 1], ['club', '클럽 명성', 1], ['coach', '코치 신뢰', 1], ['confidence', '자신감', 1], ['fatigue', '피로', -1], ['stress', '스트레스', -1]];
function statusSnap() { return Object.fromEntries(EVENT_STATS.map(([k]) => [k, S[k]])); }
function eventLines(s0) {
  const out = [];
  for (const [k, name, good] of EVENT_STATS) {
    const d = Math.round(S[k] - s0[k]);
    if (!d) continue;
    out.push(`${withSubj(name)} <b class="${d * good > 0 ? 'up' : 'down'}">${Math.abs(d)}</b> ${good > 0 ? (d > 0 ? '올랐다' : '떨어졌다') : (d > 0 ? '늘었다' : '줄었다')}.`);
  }
  return out;
}
// 받침에 맞는 주격 조사: 네트가, 멘탈이
const withSubj = name => { const c = name.charCodeAt(name.length - 1) - 0xAC00; return name + (c >= 0 && c % 28 ? '이' : '가'); };
// 결과 글: 가장 중요한 변화부터 짧게. 능력치는 위쪽 줄에 모두 보이고, 기분은 띠로 보인다.
function resultLines(L) {
  const out = [], on = L.condOn || [], off = L.condOff || [];
  if (L.healed) out.push(`${withSubj(L.healed)} 나았다.`);
  else if (L.act === 'clinic') out.push('치료를 받았다. 곧 나을 것 같다.');
  // 되는 줄 알았다가 안 되는 순간은 한 줄로 보여 준다
  if (on.includes('doubt') && off.includes('sure')) out.push(`"${esc(CONDS.sure.name)}"가 "<b class="down">${esc(CONDS.doubt.name)}</b>"로 바뀌었다.`);
  else {
    for (const c of on) out.push(`"<b class="${CONDS[c].kind === 'good' ? 'up' : 'down'}">${esc(CONDS[c].name)}</b>" 상태가 됐다.`);
    for (const c of off) out.push(`"${esc(CONDS[c].name)}" 상태가 풀렸다.`);
  }
  for (const [id, g] of Object.entries(L.gains).filter(([, v]) => v >= 0.5).sort((x, y) => y[1] - x[1]).slice(0, 2)) out.push(`${withSubj(BIG_NAME[id])} <b class="up">${Math.round(g)}</b> 올랐다.`);
  const f = Math.round(-L.fatigue), st = Math.round(L.stress);
  if (f >= 1) out.push(`체력이 <b class="up">${f}</b> 회복됐다.`);
  if (f <= -1) out.push(`체력이 <b class="down">${-f}</b> 줄었다.`);
  if (st <= -5) out.push(`스트레스가 <b class="up">${-st}</b> 줄었다.`);
  if (st >= 5) out.push(`스트레스가 <b class="down">${st}</b> 늘었다.`);
  if (L.people?.length) out.push(`${esc(withJosa(namesOf(L.people)))} 더 가까워졌다.`);
  if (L.exp) out.push(`경험 <b class="up">+${L.exp}</b>`);
  if (L.spotUp) out.push(`${withSubj(ACT[L.act].name)} <b class="up">Lv${L.spotUp}</b>로 올랐다.`);
  if (!out.length) out.push(L.act === 'rest' ? '체력은 이미 가득하다.' : '별다른 변화는 없었다.');
  return out;
}
// 결과 단계의 큰 숫자: 쉬는 행동은 체력, 테니스는 가장 많이 오른 능력치
function bigResult(L) {
  if (L.act === 'family') { const n = Math.round(-L.stress); return n >= 1 ? { n, label: '마음 비우기' } : null; }
  if (L.act === 'rest' || L.act === 'clinic') { const n = Math.round(-L.fatigue); return n >= 1 ? { n, label: '체력' } : null; }
  const top = Object.entries(L.gains).sort((x, y) => y[1] - x[1])[0];
  return top && top[1] >= 0.5 ? { n: Math.round(top[1]), label: BIG_NAME[top[0]] } : null;
}
function actTitle(id, topic) {
  const a = ACT[id], n = LESSONS[topic]?.name;
  if (id === 'lesson') return `${a.icon} 레슨 · ${n}`;
  return `${a.icon} ${a.name}`;
}
// 위쪽: 목표까지 남은 턴, 목표, 체력, 기분
// view: 결과 단계에서 아직 안 바뀐 값을 보여 줄 때 쓴다 (fatigue, to, cond)
function hudHTML(gear = true, view = {}) {
  const wi = weekInfo(S.week), goal = G.currentGoal(S);
  const left = Math.max(1, Math.floor(((goal ? goal.by : G.TOTAL_WEEKS) - S.week) / 2) + 1);
  const nextT = Object.entries(S.entries).map(([tid]) => G.tour(S, tid)).filter(t => t.week > S.week).sort((a, b) => a.week - b.week)[0];
  const cond = view.cond ?? S.condition;
  const [arrow, word] = MOOD[cond + 2];
  const shown = view.conds ? view.conds.map(id => CONDS[id]) : G.condList(S), hurtName = view.conds ? view.injury : S.injury?.name;
  const chips = [...shown.map(c => `<span class="cchip ${c.kind}">${esc(c.name)}</span>`), hurtName ? `<span class="cchip bad">${esc(hurtName)}</span>` : '', S.slump ? '<span class="cchip bad">슬럼프</span>' : ''].join('');
  return `<div class="uhud">
    <div class="hudtop"><span class="yr">${wi.label}</span><span class="badge div-${S.division}">${S.division === '국화' ? '🌼' : '🌱'} ${S.division}</span>${nextT ? `<span class="yr">📅 ${nextT.week - S.week}주 뒤 ${esc(nextT.name)}</span>` : ''}</div>
    ${gear ? `<button class="gearbtn" data-a="settings" aria-label="설정">⚙️</button>` : ''}
    <div class="hudmain">
      <div class="ucal ${left <= 3 ? 'urgent' : ''}"><b>${left}</b><small>턴 남음</small></div>
      <div class="hudr">
        <div class="goalbar"><i>목표</i><span>${esc(goal ? goal.text : '3년의 끝까지')}</span></div>
        <div class="energy"><small>체력</small><div class="ebar"><i style="width:${Math.round(view.fatigue ?? S.fatigue)}%" ${view.to === undefined ? '' : `data-to="${Math.round(view.to)}"`}></i></div><span class="mood m${cond + 2}">${arrow} ${word}</span></div>
      </div>
    </div>
    ${chips ? `<div class="condchips">${chips}</div>` : ''}
  </div>`;
}
// 큰 능력치 한 줄. plus에 값이 있으면 위에 +숫자가 뜬다
function statRow(plus = {}, tappable = true, values = null) {
  const big = values || G.bigValues(S.stats);
  const cells = BIG_STATS.map(b => {
    const v = big[b.id], g = plus[b.id], gr = grade(v);
    return `<span class="ust"><small>${BIG_SHORT[b.id]}</small><span class="v"><b class="r r-${gr}">${gr}</b>${Math.round(v)}</span>${g >= 0.5 ? `<em>+${Math.round(g)}</em>` : ''}</span>`;
  }).join('');
  return tappable ? `<button class="statrow" data-a="go" data-s="stats" aria-label="능력치 자세히">${cells}</button>` : `<div class="statrow">${cells}</div>`;
}
// 행동 버튼. 아직 못 하는 것도 자리를 지키고, 눌러 보면 이유를 말해 준다
const MAIN_BTN = { train: { name: '훈련', icon: '🎾' }, skill: { name: '기술', icon: '📘' }, clinic: { name: '병원', icon: '🏥' }, tour: { name: '대회', icon: '🏆', risk: true } };
function openSpots() { return G.visibleActions(S).filter(a => a.train); }
function gameButton(id) {
  if (id === 'train') {
    const can = !S.injury || openSpots().some(a => !a.risk);
    const glow = can && !S.injury && openSpots().some(a => G.bondsAt(S, a.id).length);
    return `<button class="gbtn g-train ${can ? '' : 'off'} ${glow ? 'hot' : ''}" data-a="${can ? 'train' : 'nope'}" data-id="train"><span class="gi">${MAIN_BTN.train.icon}</span><b>${MAIN_BTN.train.name}</b></button>`;
  }
  // 기술은 힌트를 얻으면 열린다. 턴을 쓰지 않는다.
  if (id === 'skill') {
    const known = G.skillsKnown(S), can = Object.keys(SKILLS).some(k => G.canBuySkill(S, k));
    return `<button class="gbtn g-skill ${known ? '' : 'off'} ${can ? 'hot' : ''}" data-a="${known ? 'skills' : 'nope'}" data-id="skill"><span class="gi">${MAIN_BTN.skill.icon}</span>${known ? '' : '<span class="lock">🔒</span>'}<b>${MAIN_BTN.skill.name}</b></button>`;
  }
  // 병원은 아플 때만 열린다
  if (id === 'clinic') {
    const can = G.clinicOpen(S), on = V.pick === 'clinic';
    return `<button class="gbtn g-clinic ${on ? 'on' : ''} ${can ? '' : 'off'} ${can && !on ? 'hot' : ''}" data-a="${can ? 'act' : 'nope'}" data-id="clinic"><span class="gi">${MAIN_BTN.clinic.icon}</span>${can ? '' : '<span class="lock">🔒</span>'}<b>${on ? '이걸로 ▶' : MAIN_BTN.clinic.name}</b></button>`;
  }
  const isTour = id === 'tour', open = isTour && G.openTournament(S);
  const a = MAIN_BTN[id] || ACT[id];
  const locked = isTour && !open;
  const hurt = S.injury && a.risk, off = locked || hurt, on = V.pick === id;
  return `<button class="gbtn g-${id} ${on ? 'on' : ''} ${off ? 'off' : ''} ${open && !hurt ? 'hot' : ''}" data-a="${off ? 'nope' : isTour ? 'tourinfo' : 'act'}" data-id="${id}"><span class="gi">${a.icon}</span><b>${on ? '이걸로 ▶' : a.name}</b></button>`;
}
// 훈련 칸 5개. 칸마다 이번 턴에 와 있는 사람이 뜬다. 얼굴 아래는 친밀도, 빛나면 호흡 훈련.
function trainGrid() {
  const open = openSpots().map(a => a.id);
  const cell = id => {
    const a = ACT[id], locked = !open.includes(id), off = locked || (S.injury && a.risk), on = V.pick === id;
    const people = off ? [] : S.faces[id] || [], bonds = off ? [] : G.bondsAt(S, id);
    const mark = off ? null : S.hintAt?.[id];
    const faces = people.map(pid => {
      const aff = S.partners[pid].aff;
      return `<span class="tf ${bonds.includes(pid) ? 'bond' : ''}">${mark?.who === pid ? '<b class="hintmark">!</b>' : ''}${portrait(pid, 'smile', 'pt xs')}<i class="${aff >= BOND_AT ? 'full' : ''}"><u style="width:${Math.min(100, aff)}%"></u></i></span>`;
    }).join('');
    return `<div class="tcell"><div class="tfaces">${faces}</div><button class="gbtn g-${id} ${on ? 'on' : ''} ${off ? 'off' : ''} ${bonds.length && !on ? 'hot' : ''}" data-a="${off ? 'nope' : 'act'}" data-id="${id}"><span class="gi">${a.icon}</span>${mark?.who === 'coach' ? '<b class="hintmark onbtn">!</b>' : ''}${locked ? '<span class="lock">🔒</span>' : `<span class="lvl">Lv${G.spotLevel(S, id)}</span>`}<b>${on ? '이걸로 ▶' : a.name}</b></button></div>`;
  };
  return `<div class="tgrid"><button class="tback" data-a="trainback" aria-label="돌아가기">‹</button>${TRAIN_SPOTS.map(cell).join('')}</div>`;
}
// 설정. 지우기 전에 한 번 더 묻는다
function settingsHTML() {
  if (V.sheet === 'restart') return `<div class="overlay ev"><div class="sheet event"><h3>맨 처음부터 할까요?</h3><p>지금까지의 기록이 모두 사라지고 되돌릴 수 없어요.</p><div class="choices"><button class="btn" data-a="cancelsheet">계속 할게요</button><button class="btn danger" data-a="restart">처음부터 하기</button></div></div></div>`;
  return `<div class="overlay" data-a="closesheet"><div class="sheet" data-stop="1"><h3>설정</h3>${V.check ? '<button class="btn primary" data-a="checkhome">확인할 장면 목록으로</button>' : ''}<button class="btn danger" data-a="restartAsk">맨 처음부터 하기</button><p class="hint">타이틀 화면으로 돌아가 이름을 정하는 것부터 다시 시작합니다.</p><button class="btn" data-a="cancelsheet">닫기</button></div></div>`;
}
// 못 고르는 버튼을 눌렀을 때 하는 혼잣말
function nopeLine(id) {
  if (id === 'skill' || id === 'clinic') return LOCK_LINES[id];
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
  const goalT = !tw && G.goalTourNow(S);
  if (goalT) return { who: 'me', text: goalT.finale ? STATE_LINES.finale : STATE_LINES.goalTour.replace('{name}', goalT.name) };
  if (G.hasCond(S, 'boost')) return { who: 'me', text: STATE_LINES.boost };
  if (G.hasCond(S, 'plateau')) return { who: 'me', text: G.stairNear(S) ? STATE_LINES.plateauNear : STATE_LINES.plateau };
  if (G.hasCond(S, 'doubt')) return { who: 'me', text: STATE_LINES.doubt };
  if (G.hasCond(S, 'yips')) return { who: 'me', text: STATE_LINES.yips };
  if (G.hasCond(S, 'sore')) return { who: 'me', text: STATE_LINES.sore };
  if (G.hasCond(S, 'sure')) return { who: 'me', text: STATE_LINES.sure };
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
  const p = G.previewAction(S, V.pick), people = S.faces[V.pick] || [], bonds = ACT[V.pick].train ? G.bondsAt(S, V.pick) : [];
  const topicName = id => LESSONS[id]?.name || '기본기';
  const text = {
    lesson: () => S.lessons.length ? `코치님 추천은 ${topicName(p.topic)}래요. 요정님이 정해 주셔도 돼요.` : `이번엔 코치님이 정해 준대요. ${topicName(p.topic)}!`,
    gym: () => '퇴근하고 헬스장 갈게요. 몸이 튼튼해져요.',
    practice: () => '벽치기 하고 올게요. 혼자서도 스트로크가 늘어요.',
    home: () => '집에서 몸 풀게요. 혼자 하지만 거의 안 지쳐요.',
    club: () => '클럽 사람들이랑 게임할게요. 실전 감각이 붙어요.',
    rest: () => '오늘은 쉴게요. 잘 자면 체력이 크게 회복돼요.',
    family: () => '어디 좀 놀러 갔다 올게요. 마음이 비워져요.',
    clinic: () => S.injury ? `${S.injury.name}, 치료받고 올게요. 더 빨리 나아요.` : '물리치료 받고 올게요. 쑤시는 게 풀려요.',
  }[V.pick]();
  const tire = p.fatigue >= 16 ? '많이 지칠 것 같아요.' : p.fatigue > 2 ? '조금 지칠 것 같아요.' : '';
  const fc = bonds.length ? `${withJosa(namesOf(bonds))} 호흡이 맞아요!` : people.length ? `${withJosa(namesOf(people))} 같이 해요.` : '';
  const mark = S.hintAt?.[V.pick], fc2 = mark ? `${withSubj(mark.who === 'coach' ? '코치님' : PARTNER[mark.who].name)} 뭔가 알려 줄 것 같아요.` : '';
  return `<div class="say info"><span>${esc(text)} ${tire}</span>${fc ? `<span class="fc">${esc(fc)}</span>` : ''}${fc2 ? `<span class="fc">${esc(fc2)}</span>` : ''}</div>`;
}
function doAction(id, topic) { G.runWeek(S, id, topic); S.phase = 'result'; G.save(S); V.sheet = null; V.pick = null; V.train = false; V.screen = 'result'; V.step = 0; V.wipe = true; skipFast(); }

function finishWeek() {
  const q0 = weekInfo(S.week).quarter;
  S.tournament = null; S.phase = 'plan'; V.pick = null; V.note = null; V.train = false;
  G.endWeek(S);
  G.save(S);
  V.screen = S.ending ? 'ending' : 'week';
  V.wipe = true;
  if (S.ending) return;
  // 시간이 흘렀다는 표시. 이벤트가 먼저면 넘어간다.
  const q1 = weekInfo(S.week).quarter;
  if (!S.pendingEvents.length) V.turnWord = q1 !== q0 ? { text: `${q1}이 왔다`, big: true } : { text: '2주가 지났다' };
}
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
// 기술 배우기. 턴을 쓰지 않는다.
function skillsHTML() {
  const rows = Object.entries(SKILLS).map(([id, k]) => {
    const lv = G.skillLv(S, id), h = S.hints[id] || 0;
    if (!h && !lv) return `<div class="skillrow unknown"><div><b>???</b><small>아직 모른다. 치다 보면 알게 되거나 누군가 알려 줄 수도 있다.</small></div></div>`;
    const need = lv < 2 && h < lv + 1, price = G.skillPrice(S, id), can = G.canBuySkill(S, id);
    const act = lv >= 2 ? '' : need ? '<small class="needhint">힌트가 더 필요하다</small>' : `<button class="btn sm ${can ? 'primary' : ''}" ${can ? '' : 'disabled'} data-a="buyskill" data-id="${id}">배우기<br>경험 ${price}</button>`;
    return `<div class="skillrow"><div><b>${esc(k.name)}</b> <em class="lv${lv}">${SKILL_LV_NAME[lv]}</em><small>${esc(k.desc)}</small></div>${act}</div>`;
  }).join('');
  return `<div class="overlay" data-a="closesheet"><div class="sheet" data-stop="1"><h3>기술</h3><p class="muted">경험 <b>${Math.round(S.exp)}</b> · 배워도 턴은 그대로예요. 대회에서 경험이 가장 많이 쌓여요.</p>${rows}<button class="btn" data-a="cancelsheet">닫기</button></div></div>`;
}
// 경기 전 작전. 안 고르면 코치 추천으로 나간다.
function planHTML(opp) {
  const ch = { ...DEFAULT_CHOICES, ...(S.choices || {}) };
  const rec = opp ? coachRecommend(opp.arch) : null, now = ch.plan || rec?.plan;
  const picked = PLAN_OPTS.find(p => p.id === now);
  return `<div class="card plan"><h3>오늘의 작전</h3>
    ${rec ? `<div class="coachrec">${portrait('coach', 'focus', 'pt xs')}<span>${esc(rec.line)}</span></div>` : ''}
    <div class="tempo four">${PLAN_OPTS.map(p => `<button class="tempobtn t-${p.id} ${now === p.id ? 'on' : ''}" data-a="tempo" data-v="${p.id}">${p.name}${rec?.plan === p.id ? '<small>코치 추천</small>' : ''}</button>`).join('')}</div>
    ${picked ? `<p class="plandesc">${esc(picked.desc)}</p>` : ''}
    <button class="chip sm morebtn ${V.detail ? 'on' : ''}" data-a="plandetail">세부 작전</button>
    ${V.detail ? `<div class="pdetail">${CHOICE_DEFS.filter(def => def.key === 'attack' || def.key === 'shot').map(def => `<div class="crow"><span>${def.name}</span><div>${def.opts.filter(([v]) => !(def.key === 'shot' && LOCKED_SHOT_OPTS.includes(v) && !S.unlocks.includes(v))).map(([v, n]) => `<button class="chip sm ${ch[def.key] === v ? 'on' : ''}" data-a="choice" data-k="${def.key}" data-v="${v}">${n}</button>`).join('')}</div></div>`).join('')}</div>` : ''}
  </div>`;
}
function setPlan(id) { S.choices = { ...DEFAULT_CHOICES, ...(S.choices || {}), ...PLAN_SET[id], plan: id, mental: id === 'lob' ? 'breathe' : 'keep' }; }

// 확인 링크(?check)의 첫 화면. 플레이 순서대로 장면을 바로 연다.
function checkListHTML() {
  let group = '';
  const rows = CHECKS.map((c, i) => {
    const head = c.group !== group ? `<h3>${esc(c.group)}</h3>` : '';
    group = c.group;
    return `${head}<button class="lessonrow" data-a="checkgo" data-i="${i}"><b>${esc(c.label)}</b><small>${esc(c.hint)}</small></button>`;
  }).join('');
  return `<div class="screen stats"><header class="topbar"><div class="wk">확인할 장면</div><div class="sub">플레이 순서대로</div></header>
    <p class="hint">눌러서 그 장면으로 바로 갑니다. 실제 저장에는 영향이 없어요. 돌아오려면 ⚙️ 설정을 누르세요.</p>
    <div class="checklist">${rows}</div>
  </div>`;
}

function bubble(m) {
  return `<div class="bub">${portrait(m.from, 'smile', 'pt xs')}<div><p>${esc(m.text)}</p><small class="when">${weekInfo(m.week).label}</small></div></div>`;
}

// 대회 정보: 사는 곳, 코트, 시간, 레벨, 규모, 주요 출전 선수
function tourCard(t) {
  const gap = regionGap(HOME_REGION, t.region), fam = G.famOf(S, 'surface', t.surface), e = S.entries[t.id], goal = G.isGoalTour(S, t);
  const row = (k, v, note = '') => `<div class="envrow"><span>${k}</span><b>${esc(v)}</b>${note ? `<small class="${note.bad ? 'neg' : ''}">${esc(note.text)}</small>` : ''}</div>`;
  const tops = G.topEntrants(t, S.division, 3);
  const g = GOALS[S.goalIdx];
  return `<div class="card tourcard">
    <h3>${esc(t.name)}${goal ? ' <span class="tag goal">목표</span>' : ''}</h3>
    ${goal && g ? `<p class="plandesc">${esc(g.text)}</p>` : ''}
    ${row('어디', REGIONS[t.region], { text: ['가깝다', '조금 멀다', '멀어서 더 피곤하다'][gap], bad: gap === 2 })}
    ${row('코트', SURFACES[t.surface], { text: `${grade(fam)} ${fam >= 70 ? '익숙하다' : fam >= 35 ? '겪어 봤다' : '낯설다'}`, bad: fam < 35 })}
    ${row('시간', TIMES[t.time], t.time === 'weekday' ? { text: '연차를 써야 한다', bad: true } : '')}
    ${row('레벨', LEVELS[t.level].name)}
    ${row('규모', t.finale ? '마지막 무대' : `본선 ${t.draw}강`)}
    <p class="muted topplayers">주요 출전: ${tops.map(p => `${esc(p.name)}(${esc(ARCH[p.style].name)})`).join(', ')}</p>
    ${e ? `<p class="plandesc">${esc(withJosa(PARTNER[e.partner].name))} 신청했다.</p>` : t.week >= S.week ? `<button class="btn primary" data-a="pickpartner" data-tid="${t.id}">파트너 구하기</button>` : ''}
  </div>`;
}
function tourInfoHTML() {
  const list = V.tid ? [G.tour(S, V.tid)] : G.openTournaments(S);
  return `<div class="overlay" data-a="closesheet"><div class="sheet" data-stop="1">${list.map(tourCard).join('')}<button class="btn" data-a="cancelsheet">닫기</button></div></div>`;
}
function pickerHTML() {
  const t = G.tour(S, V.pickTid) || G.openTournament(S);
  const list = PARTNERS.filter(p => S.partners[p.id].known);
  const rows = list.map(p => {
    const ps = S.partners[p.id];
    const why = G.partnerAvailable(S, p.id, t.week) || (S.asked[`${t.id}:${p.id}`] ? '이미 거절함' : null);
    const ch = why ? null : Math.round(G.acceptChance(S, p.id, t) * 100);
    return { why, html: `<div class="prow">${portrait(p.id, 'smile', 'pt sm')}<div><b>${p.name}</b> <small>${p.style} · 실력 ${grade(ps.level)} · 친밀도 ${Math.round(ps.aff)}${G.hasBond(S, p.id) ? ' · 호흡' : ''} · ${REGIONS[p.region]}</small><small>${why ? `<span class="neg">${why}</span>` : `수락 확률 ${ch}%`}</small></div>${why ? '' : `<button class="btn sm primary" data-a="ask" data-pid="${p.id}" data-tid="${t.id}">연락</button>`}</div>` };
  });
  const stuck = G.isGoalTour(S, t) && t.week === S.week && rows.every(r => r.why);
  return `<div class="overlay" data-a="closesheet"><div class="sheet" data-stop="1">
    <h3>${esc(t.name)} · 파트너 구하기</h3><p class="muted">복식이라 파트너가 없으면 나갈 수 없어요. 사는 곳, 시간, 대회 수준이 안 맞으면 거절할 수 있어요.</p>
    ${rows.map(r => r.html).join('')}
    ${stuck ? `<button class="btn danger" data-a="nopartner" data-tid="${t.id}">같이 나갈 사람이 없다</button>` : ''}
    <button class="btn" data-a="cancelsheet">닫기</button>
  </div></div>`;
}

// ── 인트로 ────────────────────────────────────────────────
function showScene(i) {
  clearTimeout(introTimer);
  if (i >= INTRO_SCENES.length) { V.profile = { step: 0 }; V.screen = 'profile'; render(); return; }
  V.scene = i; V.screen = 'intro';
  render();
  introTimer = setTimeout(() => showScene(i + 1), 2600 + INTRO_SCENES[i].text.length * 110);
}

// ── 입력 처리 ─────────────────────────────────────────────
function beginTournament(tid) { G.startTournament(S, tid); G.save(S); V.sheet = null; V.detail = false; V.screen = 'tourIntro'; }
// 8강 전 본선은 결과만 처리하고 다음 화면을 정한다
function nextTourScreen() {
  const tr = S.tournament;
  V.tourStep = 0;
  while (G.isAutoRound(tr) && !tr.retryAsk) G.playAutoMatch(S, tr);
  G.save(S);
  V.screen = tr.retryAsk ? 'tourRetry' : tr.finished ? 'tourResult' : 'between';
}
async function onClick(e) {
  const stop = e.target.closest('[data-stop]');
  const t = e.target.closest('[data-a]');
  // 대사가 나오는 중에 화면이나 넘김·선택 자리를 누르면 대사만 다 보여 준다 (건너뛰기, 빨리 같은 버튼은 그대로 동작)
  if (typing && (!t || ADVANCE.has(t.dataset.a) || t.classList.contains('pickbtn'))) { finishTyping(); return; }
  if (t && ADVANCE.has(t.dataset.a) && performance.now() - shownAt < TAP_GUARD) return;
  if (!t) return;
  if (stop && !stop.contains(t)) return;
  if (stop && t.dataset.a.startsWith('close')) return;
  const a = t.dataset.a, d = t.dataset;
  switch (a) {
    case 'checkgo': {
      S = G.newGame('확인', { job: 'sales', past: 'sport', why: 'friend' });
      const scr = CHECKS[+d.i].make(S, G);
      S.phase = 'plan'; V.screen = scr || 'week'; V.tourStep = 0; V.sheet = null; V.pick = null; V.note = null; V.train = false; V.wipe = false;
      G.save(S);
      break;
    }
    case 'checkhome': V.sheet = null; V.screen = 'title'; break;
    case 'titleStart':
      if (S && !S.ending) { V.screen = S.tournament ? (S.tournament.retryAsk ? 'tourRetry' : S.tournament.finished ? 'tourResult' : 'between') : S.phase === 'result' ? 'result' : 'week'; break; }
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
    case 'restart': G.clearSave(); S = null; V.sheet = null; V.pick = null; V.train = false; V.note = null; V.screen = 'title'; break;
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
    case 'train': {
      if (S.pendingEvents.length) return;
      V.train = true; V.note = null;
      const last = openSpots().find(a => a.id === S.lastSpot && !(S.injury && a.risk));
      V.pick = last ? last.id : openSpots().find(a => !(S.injury && a.risk))?.id || null;
      break;
    }
    case 'tourinfo': if (S.pendingEvents.length) return; V.note = null; V.pick = null; V.tid = d.tid || null; V.sheet = 'tourinfo'; break;
    case 'pickpartner': V.pickTid = d.tid; V.sheet = 'partner'; break;
    case 'nopartner': S.pendingEvents.push({ id: 'noPartner', tid: d.tid }); G.save(S); V.sheet = null; V.screen = 'week'; break;
    case 'retrymatch': { const again = G.retryMatch(S, S.tournament, d.yes === '1'); G.save(S); if (again) { V.screen = 'between'; break; } V.tourStep = 0; V.screen = 'tourResult'; break; }
    case 'skills': if (S.pendingEvents.length) return; V.note = null; V.pick = null; V.sheet = 'skills'; break;
    case 'buyskill': if (G.buySkill(S, d.id)) { G.save(S); toast(`요정님! ${SKILLS[d.id].name}, ${SKILL_LV_NAME[G.skillLv(S, d.id)]}!`); } break;
    case 'trainback': V.train = false; V.pick = null; V.note = null; break;
    case 'nope': if (S.pendingEvents.length) return; V.pick = null; V.note = nopeLine(d.id); break;
    case 'lessonpick': doAction('lesson', d.topic); break;
    case 'closesheet': V.sheet = null; break;
    case 'ask': {
      const tour = G.tour(S, d.tid);
      const r = G.askPartner(S, tour.id, d.pid);
      G.save(S);
      if (r.ok) {
        toast(`${PARTNER[d.pid].name}: 좋아요! 같이 나가요`);
        if (tour.week === S.week) beginTournament(tour.id); else V.sheet = 'tourinfo';
      } else toast(`${PARTNER[d.pid].name}: ${esc(r.line)}`);
      break;
    }
    case 'tourgo': beginTournament(G.tournamentThisWeek(S).t.id); break;
    case 'evt': {
      const ev = S.pendingEvents[0], v = G.eventView(S, ev), look = eventLook(ev), s0 = statusSnap();
      S.pendingEvents.shift();
      G.resolveEvent(S, ev, d.c);
      G.save(S);
      if (S.ending) { V.screen = 'ending'; V.evtDone = null; break; }
      const lines = eventLines(s0);
      if (S.eventNote) { lines.unshift(esc(S.eventNote)); S.eventNote = null; G.save(S); }
      if (lines.length) V.evtDone = { look, title: v.title, lines };
      else V.wipe = true;
      break;
    }
    case 'evtnext': V.evtDone = null; V.wipe = true; break;
    case 'thread': V.thread = d.id || null; break;
    case 'match':
      if (!S.choices?.plan) { const o = G.currentOpponent(S.tournament); setPlan(coachRecommend(o?.arch).plan); }
      if (G.isAutoRound(S.tournament)) { nextTourScreen(); break; }
      V.screen = 'match'; render(); runMatch(); return;
    case 'aftermatch': nextTourScreen(); break;
    case 'tempo': setPlan(d.v); G.save(S); break;
    case 'choice': S.choices = { ...DEFAULT_CHOICES, ...(S.choices || {}), [d.k]: d.v }; G.save(S); break;
    case 'plandetail': V.detail = !V.detail; break;
    case 'tourstep': V.tourStep++; break;
    case 'tourjoy': V.tourReply = tourTalk(S.tournament.final).options[+d.i].reply; G.tourJoy(S); V.tourStep++; break;
    case 'joypick': G.chooseJoy(S, +d.i); G.save(S); break;
    case 'endweek': V.tourStep = 0; V.tourReply = null; finishWeek(); break;
    case 'resnext': if (!nextStep()) finishWeek(); break;
    case 'scenepick': G.chooseScene(S, +d.i); G.save(S); skipFast(); break;
    case 'fasttoggle': S.fast = !S.fast; G.save(S); skipFast(); break;
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
  M = { sim, speed: 1, hl: true, skipGame: false, skipMatch: false, opp, minDiff: 0, chased: false, shine: {}, flow: 0, flowSide: 0, surge: [null, null] };
  const stage = document.getElementById('stage');
  const players = [
    { charId: 'player', look: PLAYER_LOOK }, { charId: tr.partner, look: { ...PARTNER[tr.partner].color, band: '#ffffff' } },
    { charId: 'oppa', look: oppLook(opp.seed % 997, 0) }, { charId: 'oppb', look: oppLook(opp.seed % 997, 1) },
  ];
  if (webglOK()) {
    try {
      M.view = new MatchView(stage, { surface: tr.surface || 'hard', banner: `${tr.name} ${tr.div}부` });
      await M.view.setPlayers(players);
    } catch (err) { console.warn(err); M.view = null; }
  }
  if (!M.view) stage.classList.add('textmode');
  hud(null);
  // 해설(캐스터와 해설). 글은 js/commentary.js
  cmtReset();
  M.cmt = CMT_TEXT.newCommentary({
    names: sim.P.map(p => p.name), tourName: tr.name, stage: G.stageLabel(tr), archId: opp.arch, archName: opp.archName,
    plan: [sim.teams[0].choices.plan, ARCH[opp.arch]?.plan], h2h: G.h2hOf(S, opp),
  });
  say(CMT_TEXT.matchIntro(M.cmt));
  if (M.view) await vsSplash(tr, opp, M.cmt);
  while (!sim.over) {
    sim.teams[1].choices = aiChoices(sim, 1);
    M.curServe = sim.serveTeam;
    surgeCheck(sim);
    const g = sim.playGame();
    for (const [pi, pt] of g.points.entries()) {
      const lastOfGame = pi === g.points.length - 1;
      for (const sh of pt.shots) for (const c of sh.call || []) if (c.j < 2) { const k = c.j + '|' + c.t, o = M.shine[k] || (M.shine[k] = { j: c.j, t: c.t, g: c.g, n: 0 }); o.n++; o.g = c.g; }
      flowTick(pt);
      if (M.hl && M.view && !M.skipGame && !pt.big && !pt.skill && !lastOfGame) {
        // 하이라이트에서 건너뛰는 포인트: 결과만 짧게. 해설 기록(연속 득점 등)은 같이 쌓는다
        CMT_TEXT.afterPoint(pt, M.cmt);
        setLog(pt.text, false); say([{ who: 'c', text: pt.text, pri: 0 }]); hud(pt); await sleep(450); continue;
      }
      if (M.skipGame || !M.view) { if (!M.view && !M.skipGame) { setLog(pt.text); hud(pt); await sleep(380 / M.speed); } continue; }
      if (pt.big && pt.label) showBig(pt.label);
      const prevScore = pi ? g.points[pi - 1].score : '0 - 0';
      await M.view.playPoint(pt, {
        onCutin: cutin,
        onShot: (s, i) => { rallyTick(s, i, pt); shotCard(s); if (i === 0) say(CMT_TEXT.beforePoint(pt, prevScore, M.cmt)); say(CMT_TEXT.duringShot(s, i, pt, M.cmt)); },
        onNetCord: () => say(CMT_TEXT.netCordLine()),
      });
      say(CMT_TEXT.afterPoint(pt, M.cmt));
      crowd(pt);
      setLog(pt.text, false); hud(pt);
      hideBig();
    }
    if (M.view) M.view.speed = M.speed;
    M.skipGame = M.skipMatch;
    M.curServe = sim.serveTeam;
    hud(null);
    const diff = sim.games[0] - sim.games[1];
    M.minDiff = Math.min(M.minDiff, diff);
    // 뒤지다가 따라붙는 순간
    const chasing = !M.chased && M.minDiff <= -2 && diff >= M.minDiff + 2;
    if (sim.over) break;
    if (!M.skipMatch) {
      setLog(`게임 ${g.gameWinner === 0 ? '획득!' : '내줌'} ${sim.games[0]} - ${sim.games[1]}`, !M.view);
      say(CMT_TEXT.afterGame(g, sim.games, sim.gameNo, M.cmt));
      if ((sim.games[0] + sim.games[1]) % 2 === 1) say(CMT_TEXT.changeover(sim.games, M.cmt, sim.P[1].stats.comm, grade(sim.P[1].stats.comm)));
      if (chasing) { M.chased = true; say(CMT_TEXT.chaseLine(M.cmt)); showBig('끈질기게 따라붙는다!'); await sleep(1100); hideBig(); }
      await sleep(M.hl ? 700 : 400);
    }
  }
  if (M.view && !M.skipMatch) {
    say(CMT_TEXT.matchEnd(sim.winner, sim.games, sim.winner === 0 && M.minDiff <= -2, M.cmt));
    for (let t = 0; t < 70 && (CMT.cur || CMT.q.length); t++) await sleep(100);
  }
  cmtReset();
  // 기록
  S.choices = { ...sim.teams[0].choices, mental: sim.teams[0].choices.tempo === 'safe' ? 'breathe' : 'keep' };
  const me = sim.P[0], pa = sim.P[1];
  const firstWin = sim.winner === 0 && !S.flags.firstWin;
  const comeback = sim.winner === 0 && M.minDiff <= -2;
  const coachLine = firstWin ? '대회 첫 승이에요! 오늘 일은 오래 기억날 거예요.' : comeback ? '초반엔 밀렸는데 끈질기게 버틴 게 통했어요. 후반에 상대 실수가 늘었죠?' : coachSays(sim);
  const opps = sim.P.filter(p => p.team === 1);
  // 오늘 빛난 능력치: 주인공 것(키운 능력치) 두 개를 먼저, 나머지 자리는 파트너까지 많이 뜬 순서로
  const byN = (a, b) => b.n - a.n || 'SABC'.indexOf(a.g) - 'SABC'.indexOf(b.g);
  const all = Object.values(M.shine).sort(byN), mine = all.filter(o => o.j === 0).slice(0, 2);
  const shine = [...mine, ...all.filter(o => !mine.includes(o))].slice(0, 3).map(o => ({ name: sim.P[o.j].name, t: o.t, g: o.g, n: o.n }));
  V.report = { shine, won: sim.winner === 0, comeback, oppErr: comeback ? [opps.reduce((a, p) => a + p.rec.errEarly, 0), opps.reduce((a, p) => a + p.rec.errLate, 0)] : null, games: [...sim.games], oppName: opp.names.join(' · '), me: me.rec, partner: pa.rec, bp: [sim.bp.won[0], sim.bp.tot[0]], coachLine };
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
    <div class="sr"><span>${sv === 1 && !sim.over ? '●' : ''}</span><b>${esc(P[2].name)} · ${esc(P[3].name)}</b><em>${gm[1]}</em><i>${pt ? ps[1] : ''}</i></div>
    <div class="flowbar"><span>흐름</span><div><i class="${(M.flow || 0) >= 0 ? 'us' : 'them'}" style="left:${(50 + Math.min(0, M.flow || 0) * 50).toFixed(1)}%;width:${(Math.abs(M.flow || 0) * 50).toFixed(1)}%"></i></div></div>`;
  const ms = document.getElementById('mentals');
  const gs = pt ? pt.gauges : P.map(p => Math.round(p.gauge));
  const lbl = g => g >= 80 ? '몰입' : g < 10 ? '틸트' : g < 30 ? '흔들림' : '보통';
  ms.innerHTML = P.map((p, i) => `<div class="mg ${i < 2 ? 'us' : 'them'}"><span>${esc(p.name)}</span><div class="bar"><i class="m-${lbl(gs[i])}" style="width:${gs[i]}%"></i></div><small>${lbl(gs[i])}</small></div>`).join('');
}
function setLog(t, pop = true) { const l = document.getElementById('logline'); if (l) l.textContent = t; const p = document.getElementById('pointtext'); if (p && pop) { p.textContent = t; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); } }
function showBig(label) { const b = document.getElementById('biglabel'); if (b) { b.textContent = label; b.classList.add('show'); } }
function hideBig() { const b = document.getElementById('biglabel'); if (b) b.classList.remove('show'); }
// ── 박진감 연출 ──
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function flash(label, ms = 1300) {
  const b = document.getElementById('biglabel');
  if (!b || M?.skipGame) return;
  showBig(label);
  setTimeout(() => { if (b.textContent === label) hideBig(); }, ms);
}
// 흐름: 이긴 쪽으로 기울고 조금씩 가운데로 돌아온다. 한쪽으로 넘어가면 알린다
function flowTick(pt) {
  M.flow = clampN(M.flow * 0.8 + (pt.winner === 0 ? 0.2 : -0.2) * (pt.big ? 1.5 : 1), -1, 1);
  const side = M.flow >= 0.45 ? 1 : M.flow <= -0.45 ? -1 : 0;
  if (side && side !== M.flowSide) {
    if (M.flowSide) { flash(side > 0 ? '흐름이 넘어왔다!' : '흐름이 넘어갔다…'); say(CMT_TEXT.flowLine(side > 0 ? 0 : 1, M.cmt)); }
    M.flowSide = side;
  }
}
// 작전이 힘을 내는 때(각질): 뒤질 때 끈질김, 후반 스퍼트, 초반 러시. 발밑 고리와 큰 글자로 알린다
function surgeCheck(sim) {
  const plans = [sim.teams[0].choices.plan, ARCH[M.opp.arch]?.plan];
  for (const t of [0, 1]) {
    const plan = plans[t], behind = sim.games[1 - t] - sim.games[t], gn = sim.gameNo;
    const kind = (plan === 'twoback' || plan === 'lob') && behind >= 2 ? 'grit' : (plan === 'twoback' || plan === 'lob') && gn >= 5 ? 'late' : plan === 'power' && gn <= 2 ? 'rush' : null;
    if (kind === M.surge[t]) continue;
    M.surge[t] = kind;
    M.view?.setAura(t * 2, !!kind); M.view?.setAura(t * 2 + 1, !!kind);
    if (!kind || M.skipGame) continue;
    if (kind !== 'rush' || gn > 0) flash((t === 0 ? '' : '상대 ') + CMT_TEXT.SURGE_LABEL[kind]);
    say(CMT_TEXT.surgeLine(kind, t, M.cmt));
  }
}
// 관중석: 아는 사람들의 외침
function crowd(pt) {
  const stage = document.getElementById('stage');
  if (!stage || M.skipGame) return;
  const us = pt.winner === 0, shot = ['win', 'ace', 'poach', 'center'].includes(pt.endType), r = Math.random();
  let words = null;
  if (us && shot) words = pt.big ? ['와아아!', '나이스!!', '최고!'] : ['나이스!', '나이스 샷!', '와!'];
  else if (us) words = pt.big ? ['좋아!!', '그렇지!'] : r < 0.5 ? ['좋아!', '그렇지!'] : null;
  else if (pt.by < 2 && !shot) words = pt.big ? ['괜찮아!', '아…'] : r < 0.4 ? ['괜찮아!', '다음!'] : null;
  else if (shot && r < 0.4) words = ['오…'];
  if (!words) return;
  // 같은 말이 겹치지 않게 섞어서 앞에서부터
  const pool = [...words].sort(() => Math.random() - 0.5), n = Math.min(pool.length, pt.big ? 3 : 1 + (r < 0.5 ? 1 : 0));
  for (let k = 0; k < n; k++) {
    const el = document.createElement('div');
    el.className = `crowdpop ${us ? 'us' : ''} ${pt.big ? 'big' : ''}`;
    el.textContent = pool[k];
    el.style.left = `${12 + Math.random() * 70}%`; el.style.top = `${14 + Math.random() * 16}%`;
    el.style.animationDelay = `${k * 0.12}s`;
    stage.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
}
// 샷 카드: 칠 때마다 누가 무슨 샷을, 얼마나 빠르게(km/h), 얼마나 정확하게(%) 쳤는지와 쓰인 능력치(등급)
let shotTimer = null;
function shotCard(s) {
  const el = document.getElementById('shotcard');
  if (!el || !s.info || M?.skipGame) return;
  const us = s.h < 2, kmh = Math.round((s.v || 16) * 3.6 * 1.12), a = s.info.acc;
  el.innerHTML = `<div class="sc-head"><b>${esc(M.sim.P[s.h].name)}</b><span>${esc(SHOT_NAME[s.type] || '')}${s.info.stance ? ` · <u>${esc(s.info.stance)}</u>` : ''}</span></div>
    <div class="sc-nums"><em>${kmh}<small>km/h</small></em><div class="sc-acc"><small>정확도</small><div class="bar"><i style="width:${a}%"></i></div><b>${a}%</b></div></div>
    <div class="sc-use">${s.info.use.map(([n, g]) => `<span>${esc(n)}<b class="g${g}">${g}</b></span>`).join('')}</div>`;
  el.className = `shotcard ${us ? 'us' : 'them'}`; void el.offsetWidth; el.className = `shotcard ${us ? 'us' : 'them'} show`;
  clearTimeout(shotTimer);
  shotTimer = setTimeout(() => el.classList.remove('show'), 2600 / (M?.speed || 1));
}
// 경기 전 VS 화면. 눌러서 넘길 수 있다
async function vsSplash(tr, opp, st) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const k = opp.seed % 997;
  const pics = await Promise.all([
    portraitURL('player', PLAYER_LOOK, 'joy'), portraitURL(tr.partner, lookOf(tr.partner), 'joy'),
    portraitURL(`opp:${k}:0`, oppLook(k, 0), 'focus'), portraitURL(`opp:${k}:1`, oppLook(k, 1), 'focus'),
  ]);
  const myPlan = PLAN_OPTS.find(p => p.id === st.plan[0]);
  const h = st.h2h && st.h2h.w + st.h2h.l > 0 ? `전적 ${st.h2h.w}승 ${st.h2h.l}패` : '첫 만남';
  const el = document.createElement('div');
  el.className = 'vsplash';
  el.innerHTML = `<div class="vs-side us"><div class="pics"><img src="${pics[0]}"><img src="${pics[1]}"></div><b>${esc(st.names[0])} · ${esc(st.names[1])}</b><small>${esc(myPlan?.name || '')}${CMT_TEXT.PLAN_STYLE[st.plan[0]] ? ' · ' + CMT_TEXT.PLAN_STYLE[st.plan[0]] : ''}</small></div>
    <div class="vs-mid">VS<small>${h}</small></div>
    <div class="vs-side them"><div class="pics"><img src="${pics[2]}"><img src="${pics[3]}"></div><b>${esc(st.names[2])} · ${esc(st.names[3])}</b><small>${esc(opp.archName || '')}${CMT_TEXT.PLAN_STYLE[st.plan[1]] ? ' · ' + CMT_TEXT.PLAN_STYLE[st.plan[1]] : ''}</small></div>`;
  stage.appendChild(el);
  await new Promise(res => { const t = setTimeout(res, 1900); el.addEventListener('click', () => { clearTimeout(t); res(); }); });
  el.classList.add('out');
  setTimeout(() => el.remove(), 300);
}
// ── 해설 자막 ──
// 한 줄씩 차례로 보여 준다. 밀리면 덜 중요한 줄(pri가 낮은 것)부터 버리고,
// 지금 줄보다 중요한 줄이 오면 0.7초 뒤 바로 넘긴다. 경기는 기다리지 않는다
const CMT = { q: [], cur: null, since: 0, timer: null };
function cmtReset() { clearTimeout(CMT.timer); CMT.q = []; CMT.cur = null; }
function say(lines) {
  if (!M || !M.view || M.skipGame || !lines?.length) return;
  for (const l of lines) {
    if (l.pri > 0) CMT.q = CMT.q.filter(x => x.pri > 0);   // 새 줄이 오면 지나간 점수 요약은 버린다
    CMT.q.push(l);
  }
  while (CMT.q.length > 3) {
    let k = 0; CMT.q.forEach((x, i) => { if (x.pri < CMT.q[k].pri) k = i; });
    CMT.q.splice(k, 1);
  }
  if (!CMT.cur) nextLine();
  else if (CMT.q.some(x => x.pri > CMT.cur.pri)) {
    clearTimeout(CMT.timer);
    CMT.timer = setTimeout(nextLine, Math.max(0, 700 - (performance.now() - CMT.since)));
  }
}
function nextLine() {
  clearTimeout(CMT.timer);
  const el = document.getElementById('cmt');
  if (!el || !M) { CMT.q = []; CMT.cur = null; return; }
  if (!CMT.q.length) { CMT.cur = null; el.classList.remove('show'); return; }
  const l = CMT.q.shift();
  CMT.cur = l; CMT.since = performance.now();
  el.className = 'cmt'; void el.offsetWidth; el.className = `cmt show ${l.who}`;
  el.innerHTML = `<i>${l.who === 'c' ? '캐스터' : l.who === 'p' ? esc(l.name) : '해설'}</i><span>${esc(l.text)}</span>`;
  CMT.timer = setTimeout(nextLine, (1100 + l.text.length * 45) / (M.speed || 1));
}
// 랠리 수: 공이 네트를 넘은 횟수. 4번부터 보인다
function rallyTick(s, i, pt) {
  const el = document.getElementById('rally');
  if (!el) return;
  const n = pt.shots.slice(0, i + 1).filter(x => x.res !== 'fault').length;
  if (n < 4) { el.className = 'rally'; return; }
  el.textContent = `랠리 ${n}`;
  el.className = 'rally show'; void el.offsetWidth; el.className = 'rally show bump';
}
async function cutin(s) {
  const c = document.getElementById('cutin');
  if (!c || M.skipGame) return;
  const h = s.skillBy ?? s.h;
  const who = h === 0 ? 'me' : h === 1 ? S.tournament.partner : `opp:${M.opp.seed % 997}:${h - 2}`;
  const look = h === 0 ? PLAYER_LOOK : h === 1 ? lookOf(S.tournament.partner) : oppLook(M.opp.seed % 997, h - 2);
  const src = await portraitURL(h === 0 ? 'player' : who, look, h < 2 ? 'joy' : 'focus');
  c.className = `cutin show ${h < 2 ? 'us' : 'them'}`;
  c.innerHTML = `<img src="${src}"><b>${s.skill ? SKILLS[s.skill].name : SHOT_NAME[s.type] || ''}!</b>`;
  await sleep(950 / M.speed);
  c.className = 'cutin';
}

// 상대 특징에 맞는 코치 조언. plan은 추천하는 작전
function coachRecommend(archId) {
  return {
    allround: { line: '약점이 없는 팀이에요. 끈질기게 넘기면서 실수를 기다려요.', plan: 'twoback' },
    defense: { line: '수비형이에요. 기다리면 끝이 없어요. 둘 다 앞으로 나가요.', plan: 'twoup' },
    attack: { line: '공격형이에요. 초반엔 밀려도 괜찮아요. 끈질기게 넘기면 실수가 나와요.', plan: 'lob' },
    speed: { line: '발이 빨라서 웬만한 공은 다 받아요. 세게 쳐서 먼저 끝내요.', plan: 'power' },
    smash: { line: '스매시가 좋아요. 공을 띄우지 말고 둘 다 뒤에서 낮게 깔아요.', plan: 'twoback' },
    control: { line: '코스가 좋아요. 좌우로 흔들리기 전에 앞으로 나가 끊어요.', plan: 'twoup' },
  }[archId] || { line: '하던 대로 끈질기게 해요.', plan: 'twoback' };
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
