// 3D 중계 뷰 — 3D 코트 + 2D 빌보드 캐릭터 (기획 문서 7장)
// 엔진이 만든 포인트 로그를 받아 재생만 한다.
import * as THREE from 'three';
import { sdFrames, emoteCanvas } from './art.js';
import { BALL_V, flightTime, standOf, ballArc, closeCall, ballHeights } from './rally.js';

const COURT_W = 10.97, COURT_L = 23.77, SINGLES_W = 8.23, SERVICE = 6.40;
const SURFACE = {
  turf: { court: '#3f9d63', out: '#2f7d4c', line: '#ffffff', grain: 'rgba(255,255,255,0.05)' },
  hard: { court: '#3a6fb0', out: '#3d8a5a', line: '#ffffff', grain: 'rgba(255,255,255,0.03)' },
  clay: { court: '#c8693a', out: '#b85e33', line: '#f5efe6', grain: 'rgba(0,0,0,0.05)' },
};

const RUN_SPEED = 5.2, MAX_RUN_SPEED = 9.5, RUN_CAP = 8.5;   // RUN_CAP: 받으러 갈 때 이보다 빨리 뛰지 않는다
// 발: 출발해서 속도를 올리고(ACC), 멈출 때는 미리 줄인다(DEC). m/s²
const ACC = 22, DEC = 18;
// 거리 D를 T초 안에 가려면 얼마나 빨리 달려야 하나(속도를 올리는 시간, 멈추면 줄이는 시간까지 넣어서)
function cruise(D, T, brake) {
  const c = 1 / (2 * ACC) + (brake ? 1 / (2 * DEC) : 0), disc = T * T - 4 * c * D;
  const v = disc >= 0 ? (T - Math.sqrt(disc)) / (2 * c) : T / (2 * c);
  return Math.min(RUN_CAP, Math.max(1.2, v));
}
// 거리 D를 최고 속도 v로 달려가는 데 걸리는 시간(속도를 올리는 시간, 멈추면 줄이는 시간까지)
function runTime(D, v, brake) {
  const c = 1 / (2 * ACC) + (brake ? 1 / (2 * DEC) : 0);
  return D >= v * v * c ? D / v + v * c : 2 * Math.sqrt(D / c) * c;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 공이 오기 직전의 준비 자세
function prepFor(type) {
  if (!type) return 'ready';
  if (type === 'smash') return 'smash';
  if (/volley/.test(type)) return 'volley';
  return 'ready';
}
function poseFor(type, side) {
  if (type === 'serve' || type === 'serve2') return 'serve';
  if (type === 'smash') return 'smash';
  if (/volley/.test(type)) return 'volley';
  if (/^bh_/.test(type)) return 'bh';
  if (/^fh_/.test(type)) return 'fh';
  return side < 0 ? 'bh' : 'fh';
}
const lerp = (a, b, t) => a + (b - a) * t;
function glowCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,250,190,0.85)'); gr.addColorStop(1, 'rgba(255,240,120,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return c;
}
const ease = t => t * t * (3 - 2 * t);

export class MatchView {
  constructor(container, opts = {}) {
    this.el = container;
    this.speed = 1;
    this.surface = opts.surface || 'turf';
    this.banner = opts.banner || '';
    this.tweens = [];
    this.fx = [];
    this.pops = [];   // 능력치 글자와 타구 번쩍임
    this.shake = 0;
    this.alive = true;
    const w = container.clientWidth || 360, h = container.clientHeight || 400;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 300);
    this.camBase = new THREE.Vector3(0, 14.5, 22.5);
    this.camLook = new THREE.Vector3(0, 0, -1.4);
    this.camMode = 'main';
    this.camCut = true;   // 첫 장면부터 중계 자리에서 시작한다(가까이서 날아 들어오지 않게)
    this.fitCamera(w, h);
    this.buildWorld();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8ff3a }));
    this.ball.visible = false;
    this.scene.add(this.ball);
    this.ballShadow = this.blob(0.13, 0.35);
    this.ballShadow.visible = false;
    this.trailPts = [];
    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    this.scene.add(this.trail);
    this.clock = new THREE.Clock();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    const loop = () => { if (!this.alive) return; this.raf = requestAnimationFrame(loop); this.tick(); };
    loop();
  }

  fitCamera(w, h) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 근거리 베이스라인(복식 폭 + 여유)이 가로로 다 들어오도록 화각 계산
    const dist = this.camBase.distanceTo(new THREE.Vector3(0, 0, 11.9));
    const needW = COURT_W + 2.2;
    const hfov = 2 * Math.atan(needW / 2 / dist);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180 / Math.PI;
    this.camera.fov = Math.max(40, Math.min(70, vfov));
    this.camera.updateProjectionMatrix();
  }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.fitCamera(w, h);
  }

  blob(r, op) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: op, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.012;
    this.scene.add(m);
    return m;
  }

  canvasTex(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  }

  buildWorld() {
    const S = SURFACE[this.surface] || SURFACE.turf;
    // 하늘
    const sky = document.createElement('canvas'); sky.width = 4; sky.height = 256;
    const g = sky.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#7ec8f2'); gr.addColorStop(0.7, '#cfeefe'); gr.addColorStop(1, '#f6fbff');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    this.scene.background = this.canvasTex(sky);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa88, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(-8, 20, 10); this.scene.add(sun);
    // 바깥 바닥
    const outC = document.createElement('canvas'); outC.width = outC.height = 128;
    const oc = outC.getContext('2d'); oc.fillStyle = S.out; oc.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { oc.fillStyle = S.grain; oc.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(22, 40), new THREE.MeshLambertMaterial({ map: this.canvasTex(outC, [6, 10]) }));
    outer.rotation.x = -Math.PI / 2; this.scene.add(outer);
    // 코트 + 라인
    const cw = 512, ch = Math.round(512 * (COURT_L + 2) / (COURT_W + 2));
    const cc = document.createElement('canvas'); cc.width = cw; cc.height = ch;
    const c = cc.getContext('2d');
    c.fillStyle = S.court; c.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 4000; i++) { c.fillStyle = S.grain; c.fillRect(Math.random() * cw, Math.random() * ch, 2, 2); }
    const sx = cw / (COURT_W + 2), sz = ch / (COURT_L + 2);
    const X = x => (x + (COURT_W + 2) / 2) * sx, Z = z => (z + (COURT_L + 2) / 2) * sz;
    c.strokeStyle = S.line; c.lineWidth = 0.05 * sx * 1.6;
    const hw = COURT_W / 2, hs = SINGLES_W / 2, hl = COURT_L / 2;
    c.strokeRect(X(-hw), Z(-hl), X(hw) - X(-hw), Z(hl) - Z(-hl));
    c.beginPath();
    for (const x of [-hs, hs]) { c.moveTo(X(x), Z(-hl)); c.lineTo(X(x), Z(hl)); }
    for (const z of [-SERVICE, SERVICE]) { c.moveTo(X(-hs), Z(z)); c.lineTo(X(hs), Z(z)); }
    c.moveTo(X(0), Z(-SERVICE)); c.lineTo(X(0), Z(SERVICE));
    for (const z of [-hl, hl]) { c.moveTo(X(0), Z(z)); c.lineTo(X(0), Z(z - Math.sign(z) * 0.2)); }
    c.stroke();
    const court = new THREE.Mesh(new THREE.PlaneGeometry(COURT_W + 2, COURT_L + 2), new THREE.MeshLambertMaterial({ map: this.canvasTex(cc) }));
    court.rotation.x = -Math.PI / 2; court.position.y = 0.005; this.scene.add(court);
    // 네트
    const nc = document.createElement('canvas'); nc.width = 64; nc.height = 64;
    const n = nc.getContext('2d'); n.strokeStyle = 'rgba(20,20,20,0.85)'; n.lineWidth = 2;
    for (let i = 0; i <= 64; i += 8) { n.beginPath(); n.moveTo(i, 0); n.lineTo(i, 64); n.stroke(); n.beginPath(); n.moveTo(0, i); n.lineTo(64, i); n.stroke(); }
    const net = new THREE.Mesh(new THREE.PlaneGeometry(COURT_W + 1.8, 0.92), new THREE.MeshBasicMaterial({ map: this.canvasTex(nc, [40, 3]), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set(0, 0.46, 0); this.scene.add(net);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(COURT_W + 1.8, 0.07, 0.03), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    tape.position.set(0, 0.93, 0); this.scene.add(tape);
    for (const x of [-(COURT_W / 2 + 0.9), COURT_W / 2 + 0.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.07, 8), new THREE.MeshLambertMaterial({ color: 0x334433 }));
      post.position.set(x, 0.53, 0); this.scene.add(post);
    }
    // 펜스 + 배너
    const fc = document.createElement('canvas'); fc.width = 64; fc.height = 64;
    const f = fc.getContext('2d'); f.strokeStyle = 'rgba(40,60,50,0.55)'; f.lineWidth = 2;
    for (let i = -64; i <= 128; i += 12) { f.beginPath(); f.moveTo(i, 0); f.lineTo(i + 64, 64); f.stroke(); f.beginPath(); f.moveTo(i + 64, 0); f.lineTo(i, 64); f.stroke(); }
    const fenceMat = new THREE.MeshBasicMaterial({ map: this.canvasTex(fc, [30, 4]), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(22, 4), fenceMat);
    back.position.set(0, 2, -19.5); this.scene.add(back);
    for (const x of [-11, 11]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(40, 4), fenceMat); side.rotation.y = Math.PI / 2; side.position.set(x, 2, 0); this.scene.add(side); }
    const wind = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.6), new THREE.MeshLambertMaterial({ color: 0x1f5a3c }));
    wind.position.set(0, 0.8, -19.45); this.scene.add(wind);
    const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 96;
    const b = bc.getContext('2d'); b.fillStyle = '#ffffff'; b.fillRect(0, 0, 1024, 96);
    b.fillStyle = '#ff5b8a'; b.fillRect(0, 0, 1024, 12); b.fillRect(0, 84, 1024, 12);
    b.fillStyle = '#20324a'; b.font = 'bold 48px "Noto Sans KR", sans-serif'; b.textAlign = 'center'; b.textBaseline = 'middle';
    b.fillText(this.banner || '동호인 테니스 대회', 512, 50);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.1), new THREE.MeshBasicMaterial({ map: this.canvasTex(bc) }));
    banner.position.set(0, 1.0, -19.4); this.scene.add(banner);
    // 본부석 텐트 (2D 판)
    const tc = document.createElement('canvas'); tc.width = 256; tc.height = 192;
    const t = tc.getContext('2d');
    t.fillStyle = '#ffffff'; t.fillRect(30, 70, 196, 110); t.fillStyle = '#ff7aa2';
    t.beginPath(); t.moveTo(10, 76); t.lineTo(128, 10); t.lineTo(246, 76); t.closePath(); t.fill();
    t.fillStyle = '#20324a'; t.font = 'bold 30px sans-serif'; t.textAlign = 'center'; t.fillText('본부석', 128, 130);
    t.fillStyle = '#8b6b4a'; t.fillRect(40, 150, 176, 14);
    const tent = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.canvasTex(tc) }));
    tent.scale.set(5, 3.75, 1); tent.position.set(-7.5, 1.6, -22); this.scene.add(tent);
    // 관중 판
    const pc = document.createElement('canvas'); pc.width = 512; pc.height = 96;
    const p = pc.getContext('2d');
    const cols = ['#ff7aa2', '#6c8cff', '#ffd166', '#7ad3a8', '#c58cff', '#ff8f6b'];
    for (let i = 0; i < 18; i++) { const x = 14 + i * 28 + (i % 2) * 4; p.fillStyle = cols[i % cols.length]; p.beginPath(); p.roundRect(x - 11, 52, 22, 44, 8); p.fill(); p.fillStyle = '#ffe0cc'; p.beginPath(); p.arc(x, 40, 11, 0, Math.PI * 2); p.fill(); p.fillStyle = '#3a2a22'; p.beginPath(); p.arc(x, 35, 11, Math.PI, 0); p.fill(); }
    const crowd = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.canvasTex(pc), transparent: true }));
    crowd.scale.set(9, 1.7, 1); crowd.position.set(5.5, 0.85, -21); this.scene.add(crowd);
  }

  // players: [{look, facing, name}] ×4 (0,1 = 주인공 팀, 화면 아래쪽)
  async setPlayers(players) {
    // 그림을 다 불러온 뒤에 한꺼번에 넣는다. 도중에 넣으면 그리기 루프가 빈 자리를 읽는다.
    const list = [];
    for (let i = 0; i < 4; i++) {
      const info = players[i];
      const frames = await sdFrames(info.charId || `npc${i}`, info.look, i < 2 ? 'back' : 'front');
      const tex = {};
      for (const [k, cnv] of Object.entries(frames)) tex[k] = this.canvasTex(cnv);
      // alphaTest: 그림의 빈 곳이 뒤에 있는 것(발밑 고리, 그림자)을 가리지 않게
      const mat = new THREE.SpriteMaterial({ map: tex.ready, transparent: true, alphaTest: 0.08 });
      const sp = new THREE.Sprite(mat);
      sp.center.set(0.5, 0.02);
      const k = frames.real ? 2.5 : 2.0;
      sp.scale.set(k, k, 1);
      this.scene.add(sp);
      const shadow = this.blob(0.38, 0.26);
      const emote = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      emote.scale.set(0.7, 0.7, 1); emote.visible = false; this.scene.add(emote);
      // 첫 포인트 전(VS 화면, 소개 해설 동안)에도 복식 자리에 서 있게: 한 명은 뒤, 한 명은 네트 앞, 좌우로 갈라서
      const zs = i < 2 ? 1 : -1, xs = zs * (i % 2 === 0 ? 1 : -1);
      const x0 = xs * (i % 2 === 0 ? 2.8 : 2.3), z0 = zs * (i % 2 === 0 ? 11.2 : 3.6);
      list.push({ sp, tex, shadow, emote, base: k, x: x0, z: z0, tx: x0, tz: z0, speed: RUN_SPEED, vel: 0, brake: true, onArrive: null, sq: 0, crouch: 0, stride: 0, hop: 0, lean: 0, kick: 0, pose: 'ready', poseUntil: 0, emoteUntil: 0 });
    }
    this.players = list;
    this.emoteTex = {};
    for (const k of ['sweat', 'fire', 'cloud', 'heart', 'bang']) this.emoteTex[k] = this.canvasTex(emoteCanvas(k));
    // 주인공 표시 링
    this.myRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 28), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, depthWrite: false }));
    this.myRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.myRing);
    this.placeAll();
  }

  placeAll() {
    for (const p of this.players) {
      // 뛸 때 위아래로 들썩이고 앞으로 기운다. 스윙 순간에는 몸이 돌아간다.
      const y = Math.abs(Math.sin(p.stride)) * 0.14 + p.hop;
      p.sp.position.set(p.x, y, p.z);
      if (p.base) p.sp.scale.set(p.base * (1 + p.sq * 0.5 + p.crouch * 0.03), p.base * (1 - p.sq - p.crouch * 0.07), 1);
      p.sp.material.rotation = p.lean + p.kick;
      p.shadow.position.set(p.x, 0.012, p.z);
      p.emote.position.set(p.x, 2.35 + y, p.z);
    }
    this.myRing.position.set(this.players[0].x, 0.014, this.players[0].z);
    for (let i = 0; i < 4; i++) { const a = this.auras?.[i]; if (a) a.position.set(this.players[i].x, 0.016, this.players[i].z); }
  }
  // 작전이 힘을 내는 동안 발밑에 빛나는 고리(우리 팀 분홍, 상대 파랑). null이면 끈다
  setAura(i, on) {
    this.auras = this.auras || [];
    if (!on) { if (this.auras[i]) { this.scene.remove(this.auras[i]); this.auras[i] = null; } return; }
    if (this.auras[i]) return;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.95, 32), new THREE.MeshBasicMaterial({ color: i < 2 ? 0xff6f9c : 0x5b8cff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    this.auras[i] = m;
    this.placeAll();
  }
  // 코트 위 한 점에 짧은 글자(라인!, 넷!, 짝! 등)
  popText(x, y, z, text, cls = '') {
    const el = document.createElement('div');
    el.className = `textpop ${cls}`;
    el.textContent = text;
    this.el.appendChild(el);
    this.pops.push({ kind: 'text', el, at: [x, y, z], t: 0, life: 1.1 });
  }

  // 능력치가 결과를 가른 순간: 그 선수 머리 위에 능력치 이름과 등급이 톡 튀어 오른다.
  // 글자는 화면 위에 같은 크기로 그린다(먼 선수도 읽히게). 우리 팀은 분홍, 상대는 파랑
  popCall(c) {
    if (!this.players?.[c.j]) return;
    const el = document.createElement('div');
    el.className = `callpop ${c.j < 2 ? 'us' : 'them'}`;
    el.innerHTML = `<span>${c.t}</span><b class="g${c.g}">${c.g}</b>`;
    this.el.appendChild(el);
    // 같은 선수에게 이미 떠 있는 글자는 위로 비켜 준다
    for (const q of this.pops) if (q.kind === 'call' && q.j === c.j) q.lift += 28;
    this.pops.push({ kind: 'call', el, j: c.j, t: 0, life: 1.5, lift: 0 });
  }
  // 칠 때마다 그 선수 머리 위에 무엇을 쳤고 어떤 능력치가 쓰였는지 띄운다.
  // 한 번에 하나만 보인다(새로 치면 앞의 것은 바로 사라진다). 능력치가 결과를 가른 글자(popCall)는 그 위에 뜬다
  popTag(j, html) {
    if (!this.players?.[j]) return;
    for (const q of this.pops) if (q.kind === 'tag' && q.life - q.t > 0.15) q.t = q.life - 0.15;
    const el = document.createElement('div');
    el.className = `hittag ${j < 2 ? 'us' : 'them'}`;
    el.innerHTML = html;
    this.el.appendChild(el);
    this.pops.push({ kind: 'tag', el, j, t: 0, life: Math.max(0.8, 1.6 / Math.max(1, this.speed)) });
  }
  // 공을 맞히는 순간의 번쩍임. 빠른 공일수록 크다
  flash(x, y, z, v) {
    this.glowTex = this.glowTex || this.canvasTex(glowCanvas());
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, y, z); sp.renderOrder = 5;
    this.scene.add(sp);
    this.pops.push({ kind: 'flash', sp, t: 0, life: 0.2, size: clamp(0.5 + v * 0.04, 0.7, 1.7) });
  }

  setPose(i, pose, ms = 0) {
    const p = this.players[i];
    p.pose = pose; p.sp.material.map = p.tex[pose] || p.tex.ready; p.sp.material.needsUpdate = true;
    p.poseUntil = ms ? performance.now() + ms / this.speed : 0;
  }
  showEmote(i, kind, ms = 1600) {
    const p = this.players[i];
    if (!kind) { p.emote.visible = false; return; }
    p.emote.material.map = this.emoteTex[kind]; p.emote.material.needsUpdate = true; p.emote.visible = true;
    p.emoteUntil = performance.now() + ms;
  }

  // 선수는 목표 지점으로 뛰어간다. speed를 주면 그 속도로, within을 주면 그 시간 안에 닿게 뛴다.
  // opt: { brake: 도착 전에 속도를 줄여 멈춘다(기본), false면 달리던 속도 그대로 닿는다, onArrive: 멈춰 서면 할 일 }
  runTo(i, x, z, within = 0, speed = 0, opt = {}) {
    const p = this.players[i];
    p.tx = x; p.tz = z;
    p.brake = opt.brake ?? true; p.onArrive = opt.onArrive || null;
    const d = Math.hypot(x - p.x, z - p.z);
    p.speed = speed || (within > 0 ? clamp(d / within, RUN_SPEED * 0.6, MAX_RUN_SPEED) : RUN_SPEED);
  }
  // 상대가 치는 순간의 작은 스텝
  splitStep(i) { const p = this.players[i]; p.hop = 0.2; p.crouch = 0; p.splitting = true; }
  // 닿지 못한 공에 몸을 던진다
  lunge(i, toward) {
    const p = this.players[i], right = (i < 2 ? 1 : -1) * (toward[0] - p.x) >= 0;
    this.setPose(i, right ? 'fh' : 'bh', 700);
    p.kick = (i < 2 ? 1 : -1) * (right ? 0.5 : -0.5);
    p.tx = p.x + Math.sign(toward[0] - p.x) * 0.35; p.tz = p.z; p.speed = 3;
  }

  wait(sec) { return new Promise(res => this.tweens.push({ t: 0, dur: sec, step: () => { }, done: res })); }
  // 공 시간으로 sec초 뒤에 할 일
  later(sec, fn) { if (sec <= 0.001) { fn(); return; } this.tweens.push({ t: 0, dur: sec, step: () => { }, done: () => { if (this.alive) fn(); } }); }

  // 공 비행: from/to = [x,z]. 높이는 중력으로(js/rally.js ballArc), 시간은 엔진과 같다. v = 공 빠르기(엔진이 샷 품질로 정함)
  // opt: { skim: 네트 테이프를 스치게, onBounce(), onNet([x,y,z]) }
  flyBall(from, to, bounce, type, h0, h1, overNet = true, v = 0, opt = {}) {
    const arc = ballArc(from, to, bounce, type, h0, h1, v || BALL_V[type] || 16, overNet, !!opt.skim);
    this.ball.visible = true; this.ballShadow.visible = true;
    this.trailPts = [];
    // 꼬리 색으로 회전을 보여 준다: 탑스핀 주황, 슬라이스·드롭 하늘색, 나머지 흰색
    this.trail.material.color.setHex(/drive|passing|^return$|topspin/.test(type) ? 0xffb07a : /slice|chip|drop/.test(type) ? 0x9fd8ff : 0xffffff);
    const tail = Math.round(clamp(2 + (v || 16) * 0.45, 6, 15));   // 빠른 공은 꼬리가 길다
    this.trail.material.opacity = clamp(0.3 + (v || 16) * 0.016, 0.4, 0.75);
    return new Promise(res => {
      let bounced = false, netted = false;
      this.tweens.push({
        t: 0, dur: arc.dur,
        step: k => {
          const t = k * arc.dur;
          if (bounce && !bounced && t > arc.t1) { bounced = true; this.mark(bounce); opt.onBounce?.(); }
          if (opt.onNet && !netted && arc.tn > 0 && t > arc.tn) { netted = true; const [nx, nz, ny] = arc.at(arc.tn); opt.onNet([nx, ny, nz]); }
          const [x, z, y] = arc.at(t);
          this.ball.position.set(x, Math.max(0.11, y), z);
          this.ballShadow.position.set(x, 0.013, z);
          this.ballShadow.material.opacity = Math.max(0.12, 0.38 - y * 0.04);
          this.trailPts.push(new THREE.Vector3(x, Math.max(0.11, y), z));
          if (this.trailPts.length > tail) this.trailPts.shift();
          this.trail.geometry.setFromPoints(this.trailPts);
        },
        done: res,
      });
    });
  }

  mark(pt) {
    if (!pt) return;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pt[0], 0.015, pt[1]);
    this.scene.add(m);
    this.fx.push({ obj: m, life: 1.2 });
  }

  // 시점: main(중계), low(우리 서브 뒤 낮게), far(상대 서브 쪽으로 당겨서), high(긴 랠리를 높이서), push(결정적인 공 쪽으로 다가감)
  setCamera(mode, cut = false) { this.camMode = mode; if (cut) this.camCut = true; }
  camTarget() {
    const bx = this.ball.visible ? this.ball.position.x : 0, bz = this.ball.visible ? this.ball.position.z : 0;
    const t = new THREE.Vector3(), l = new THREE.Vector3();
    switch (this.camMode) {
      case 'side': t.set(15, 3.2, bz * 0.5); l.set(0, 1, bz * 0.6); break;
      case 'low': t.set((this.camX || 0) * 0.6, 4.6, 19.5); l.set((this.camX || 0) * 0.2, 1.0, 2); break;
      case 'far': t.set(bx * 0.2, 13.5, 21); l.set(bx * 0.3, 0, -3.2); break;
      case 'high': t.set(bx * 0.15, 24, 21); l.set(0, 0, 0.8); break;
      case 'push': t.copy(this.camBase); t.x += bx * 0.18; t.lerp(new THREE.Vector3(bx, 4.5, bz + 9.5), 0.3); l.set(bx * 0.5, 0.6, bz * 0.5 - 0.7); break;
      default: t.copy(this.camBase); t.x += bx * 0.18; l.copy(this.camLook); l.x = t.x * 0.6;
    }
    return { t, l };
  }

  // 포인트 시작: 모두 시작 자리에 선 채로 보이고, 잠깐 숨을 고른 뒤 서브한다
  async beginPoint(s0) {
    const start = s0.pos;
    const first = !this.started;
    this.started = true;
    for (let i = 0; i < 4; i++) {
      const [x, z] = i === s0.h ? s0.from : start[i];
      const p = this.players[i];
      this.setPose(i, 'ready'); this.showEmote(i, null);
      p.stride = 0; p.hop = 0; p.kick = 0; p.lean = 0;
      p.x = p.tx = x; p.z = p.tz = z;
    }
    this.placeAll();
    this.ball.visible = false; this.ballShadow.visible = false; this.trailPts = []; this.trail.geometry.setFromPoints([]);
    this.setCamera('main', this.camMode === 'low' || this.camMode === 'high');
    await this.wait(first ? 0.25 : 0.45);
  }

  // 큰 포인트의 서브 전: 공을 두 번 튀기며 숨을 고른다
  async bounceBall(s) {
    const [x, z] = s.from, ox = 0.3 * (s.h < 2 ? 1 : -1);
    this.ball.visible = true; this.ballShadow.visible = true;
    await new Promise(res => this.tweens.push({
      t: 0, dur: 0.5, step: k => {
        const u = (k * 2) % 1, y = 0.11 + 0.85 * Math.abs(Math.cos(Math.PI * u));
        this.ball.position.set(x + ox, y, z); this.ballShadow.position.set(x + ox, 0.013, z);
      }, done: res,
    }));
  }

  // 서브: 공을 띄우고 내려칠 때 친다
  async tossBall(s) {
    const [x, z] = s.from;
    this.setPose(s.h, 'serve');
    this.ball.visible = true; this.ballShadow.visible = true;
    await new Promise(res => this.tweens.push({
      t: 0, dur: 0.42, step: k => {
        const y = 1.1 + 2.0 * Math.sin(k * Math.PI * 0.8);
        this.ball.position.set(x + 0.15, y, z);
        this.ballShadow.position.set(x + 0.15, 0.013, z);
      }, done: res,
    }));
  }

  // 샷 하나 재생. next = 다음 타자의 샷 (다음 샷을 알아야 그 선수가 공 옆에 선다), prev = 이 공을 보낸 샷
  async playShot(s, next, prev) {
    const isServe = s.type === 'serve' || s.type === 'serve2';
    const side = (s.h < 2 ? 1 : -1) * (s.to[0] - s.from[0]);
    if (isServe) await this.tossBall(s);
    // 스윙: 타구 순간 몸을 돌리고 잠깐 뒤 준비 자세로. 쭉 뻗어 받은 공이면 몸이 더 기운다
    const hitter = this.players[s.h];
    const stretched = prev?.mv?.[s.h]?.k === 'reach';
    this.setPose(s.h, poseFor(s.type, side), 380);
    hitter.kick = (s.h < 2 ? 1 : -1) * (side < 0 ? -0.22 : 0.22) * (stretched ? 2 : 1) * (hitter.crouch ? 1.4 : 1);
    if (hitter.crouch) { hitter.crouch = 0; hitter.sq = 0.06; }
    // 스탠스: 뉴트럴은 네트 쪽으로, 크로스는 공을 가로질러 디디고, 세미오픈은 조금, 오픈은 옆으로 버틴다. 달리면서는 그대로 지나간다
    const stance = s.info?.stance, fz = s.h < 2 ? -1 : 1, lx = Math.sign(s.to[0] - s.from[0]) || 1;
    const stepOf = { '뉴트럴': [0, 0.42], '크로스': [0.28 * -lx, 0.32], '세미오픈': [0, 0.18], '오픈': [0.22 * lx, 0] };
    if (stepOf[stance]) { const [sx, sz] = stepOf[stance]; this.runTo(s.h, hitter.x + sx, hitter.z + sz * fz, 0, 2.6); }
    const v = s.v || BALL_V[s.type] || 16;
    const dur = flightTime(s.from, s.to, s.bounce, v);
    {
      const hy = isServe || s.type === 'smash' ? 2.5 : /volley/.test(s.type) ? 1.25 : 0.95;
      if (s.res !== 'fault' && s.res !== 'df') this.flash(s.from[0], hy, s.from[1], v);
      if (s.type === 'smash' || s.res === 'ace') this.shake = Math.max(this.shake, 0.16);
      else if (s.res === 'win' || s.res === 'poach') this.shake = Math.max(this.shake, v >= 13 ? 0.1 : 0.06);
      for (const c of s.call || []) { if (c.end) this.later(Math.max(0, dur - 0.08), () => this.popCall(c)); else this.popCall(c); }
    }
    // 움직임은 엔진이 능력치로 정한 대로: 첫발만큼 늦게 출발해서 스피드만큼 뛴다(js/rally.js)
    for (let j = 0; j < 4; j++) {
      const m = s.mv?.[j];
      // 상대편은 타구 순간 스텝을 밟는다
      if ((j < 2) !== (s.h < 2)) this.splitStep(j);
      if (!m) continue;
      const p = this.players[j];
      let tx = m.x, tz = m.z, sp = m.v, t0 = m.t0;
      let opt = {};
      if (next && next.h === j && j !== s.h) {
        // 받을 사람은 공 옆(팔과 라켓 길이만큼)에 선다. 여유(m)가 있으면 그만큼 먼저 도착해 멈춰서 힘을 싣고,
        // 여유가 없거나(포지셔닝이 낮으면) 멀리 뻗는 공이면 달리던 그대로 공과 같이 닿는다
        [tx, tz] = standOf(next.from, next.type, j < 2 ? 0 : 1, [p.x, p.z], m.far || 0);
        const set = (m.m ?? 0.3) >= 0.08 && m.k !== 'reach' && m.k !== 'jam';
        let T = Math.max(0.12, dur - m.t0 - (set ? Math.min(m.m ?? 0.3, 0.45) : 0) - 0.02);
        const D = Math.hypot(tx - p.x, tz - p.z);
        // 쭉 뻗어 받는 공: 공이 느려 시간이 남아도 천천히 걸어가지 않는다. 늦게 읽고(그만큼 늦게 출발해) 힘껏 달려가 겨우 닿는다
        if (m.k === 'reach' && D > 0.5) { const full = runTime(D, m.v, false) * 1.1; if (T > full) { t0 += T - full; T = full; } }
        sp = cruise(D, T, set);
        // 멈추지 못하는 사람은 공 자리를 지나쳐 계속 달린다(치는 순간에도 움직이고 있다)
        if (!set && D > 0.3) { tx += (tx - p.x) / D * 0.7; tz += (tz - p.z) / D * 0.7; }
        const coil = (j < 2 ? 1 : -1) * (/^bh_/.test(next.type) ? 0.14 : -0.14);
        opt = { brake: set, onArrive: set ? () => { p.crouch = 1; p.kick = coil; this.setPose(j, prepFor(next.type), 0); } : null };
      }
      const lungeAt = Math.max(m.t0 + 0.05, dur * (m.k === 'confuse' ? 0.55 : 0.8));
      // 위너를 맞는 사람: 공이 느려 시간이 남으면 반대쪽으로 몸이 쏠렸다가(역동작) 늦게 쫓아가 몸을 던진다
      if (m.k === 'miss') {
        const D = Math.hypot(tx - p.x, tz - p.z), go = lungeAt - 0.05 - runTime(D, m.v, true);
        if (go - m.t0 > 0.2 && D > 0.3) {
          const wx = (tx - p.x) / D, wz = (tz - p.z) / D, wf = Math.min(0.55, (go - m.t0) * 1.2);
          this.later(m.t0, () => this.runTo(j, p.x - wx * wf, p.z - wz * wf, 0, 2.6));
          t0 = go;
        }
      }
      this.later(t0, () => this.runTo(j, tx, tz, 0, sp, opt));
      if (m.k === 'miss' || m.k === 'confuse') {
        const ball = s.bounce || s.to;
        this.later(lungeAt, () => { if (m.k === 'miss') this.lunge(j, ball); else { p.tx = p.x; p.tz = p.z; this.setPose(j, 'ready'); } });
      }
    }
    const [h0, h1] = ballHeights(s, next);
    // 받을 선수는 공이 닿기 직전에 준비 자세를 잡는다
    if (next && next.h !== undefined && next.h !== s.h) {
      const pv = this.players[next.h];
      const lead = Math.max(0, dur - 0.22);
      this.tweens.push({ t: 0, dur: lead || 0.01, step: () => { }, done: () => { if (pv.crouch) return; this.setPose(next.h, prepFor(next.type), 0); pv.kick = (next.h < 2 ? 1 : -1) * (/^bh_/.test(next.type) ? 0.12 : -0.12); } });
    }
    if (s.res === 'net') {
      const netPt = [lerp(s.from[0], s.to[0], 0.9), 0.15 * Math.sign(s.from[1])];
      await this.flyBall(s.from, netPt, null, s.type, h0, 0.6, false, v);
      await this.flyBall(netPt, [netPt[0], netPt[1] + 0.6 * Math.sign(s.from[1])], null, 'dropshot', 0.6, 0.1, false);
    } else {
      const opt = {};
      // 라인에 걸친 위너·에이스, 아슬아슬하게 나간 공
      const B = s.bounce || s.to;
      const cc = closeCall(s);
      if (cc === 'line') opt.onBounce = () => { this.popText(B[0], 0.3, B[1], '라인!', 'line'); this.shake = Math.max(this.shake, 0.08); };
      else if (cc === 'out') opt.onBounce = () => this.popText(B[0], 0.3, B[1], '아슬아슬!', 'out');
      // 넷 코드: 쭉 뻗어 받아야 하는 어려운 공이 가끔 네트 테이프를 스치고 넘어간다(연출만)
      if (s.res === 'in' && next && !isServe && !/lob|moon|drop/.test(s.type) && s.mv?.[next.h]?.k === 'reach' && Math.random() < 0.08) {
        opt.skim = true;
        opt.onNet = ([x, y, z]) => { this.flash(x, y, z, 12); this.popText(x, y + 0.4, z, '넷!', 'net'); this.shake = Math.max(this.shake, 0.05); this.hooks?.onNetCord?.(s); };
      }
      await this.flyBall(s.from, s.to, s.bounce, s.type, h0, h1, true, v, opt);
    }
    if (s.res === 'fault') {
      for (let j = 0; j < 4; j++) if (j !== s.h && s.pos?.[j]) this.runTo(j, s.pos[j][0], s.pos[j][1], 0, 2.4);
      await this.wait(0.6);
    }
  }

  // 포인트 하나 재생. hooks: { onCutin(shot, pt) }
  async playPoint(pt, hooks = {}) {
    await this.beginPoint(pt.shots[0]);
    await this.playRest(pt, 0, hooks);
  }

  // 남은 샷(from부터)과 결과 포즈 재생
  async playRest(pt, from, hooks = {}) {
    const shots = pt.shots;
    const lastIdx = shots.length - 1;
    this.hooks = hooks;
    for (let i = from; i < shots.length; i++) {
      if (!this.alive) return;
      const s = shots[i];
      const isServe = s.type === 'serve' || s.type === 'serve2';
      const decisive = i === lastIdx && pt.big && ['win', 'ace', 'poach', 'center'].includes(s.res);
      // 시점: 큰 포인트의 서브는 서버 쪽에서, 긴 랠리는 높이서, 끝내는 공은 다가가서
      const n = shots.slice(0, i + 1).filter(x => x.res !== 'fault').length;
      let cam = 'main';
      if (i === lastIdx && ['win', 'ace', 'poach'].includes(s.res)) cam = 'push';
      else if (isServe && pt.big) cam = s.h < 2 ? 'low' : 'far';
      else if (n >= 8) cam = 'high';
      this.camX = s.from[0];
      if (cam !== this.camMode) this.setCamera(cam, cam === 'low');
      // 큰 포인트의 첫 서브 전에는 공을 튀기며 숨을 고른다
      if (i === 0 && isServe && pt.big) await this.bounceBall(s);
      // 큰 순간과 기술은 컷인으로 알린다. 경기는 멈추거나 느려지지 않는다
      if ((decisive || s.skill) && hooks.onCutin) hooks.onCutin(s, pt);
      hooks.onShot?.(s, i, pt);
      await this.playShot(s, shots[i + 1], shots[i - 1]);
    }
    // 결과 몸짓: 이긴 팀은 펄쩍 뛰고 서로 다가가 손뼉을 마주친다. 진 팀은 실수한 사람이 고개를 숙이고 파트너가 다가가 다독인다
    const w = pt.winner;
    const byShot = ['win', 'ace', 'poach', 'center'].includes(pt.endType);
    for (let i = 0; i < 4; i++) {
      const team = i < 2 ? 0 : 1, won = team === w, blame = !won && i === pt.by && !byShot;
      this.setPose(i, won ? 'cheer' : blame ? 'sad' : 'ready', 1000);
      if (won) this.players[i].hop = pt.big ? 0.55 : 0.3;
      const st = pt.states[i];
      this.showEmote(i, st === 'zone' ? 'fire' : st === 'tilt' ? 'cloud' : st === 'shaky' ? 'sweat' : won && pt.big ? 'bang' : (won && i === pt.by ? 'heart' : null));
    }
    const meet = (a, b, k) => {
      const A = this.players[a], B = this.players[b], d = Math.hypot(A.x - B.x, A.z - B.z);
      if (d > 5.2) return false;
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, stop = 0.45 / Math.max(d, 0.9);
      this.runTo(a, lerp(A.x, mx, k - stop), lerp(A.z, mz, k - stop), 0, 5);
      if (k > 0.9) this.runTo(b, lerp(B.x, mx, k - stop), lerp(B.z, mz, k - stop), 0, 5);
      return [mx, mz, Math.max(0, d / 2 - 0.225) / 5];
    };
    const [wa, wb] = [w * 2, w * 2 + 1];
    const m = meet(wa, wb, 1);
    if (m) this.later(m[2] + 0.05, () => { this.popText(m[0], 1.5, m[1], '짝!', 'clap'); this.players[wa].hop = this.players[wb].hop = 0.25; });
    if (!byShot && pt.by !== undefined && (pt.by < 2 ? 0 : 1) !== w) { const mate = pt.by ^ 1; meet(mate, pt.by, 0.6); }
    await this.wait(0.6);
    this.ball.visible = false; this.ballShadow.visible = false;
  }

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    for (const tw of [...this.tweens]) {
      tw.t += dt * this.speed;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done && tw.done(); }
    }
    if (this.players) {
      const pdt = dt * this.speed;
      for (let i = 0; i < 4; i++) {
        const p = this.players[i];
        // 달리기: 목표까지 일정한 속도로, 도착하면 멈춘다
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.02) {
          let want = p.speed;
          if (p.brake) want = Math.min(want, Math.sqrt(2 * DEC * Math.max(0, d - 0.02)) + 0.4);
          const braking = want < p.vel - 0.6;
          p.vel += clamp(want - p.vel, -DEC * pdt, ACC * pdt);
          const step = Math.min(d, Math.max(0.2, p.vel) * pdt);
          p.x += dx / d * step; p.z += dz / d * step;
          p.stride += step * 2.6;
          // 달릴 때는 가는 쪽으로 기울고, 멈추려고 속도를 줄일 때는 뒤로 버틴다
          const lean = (i < 2 ? -1 : 1) * clamp(dx / Math.max(d, 0.01), -1, 1) * 0.15 * Math.min(1, p.vel / 4) * (braking ? -0.9 : 1);
          p.lean += (lean - p.lean) * Math.min(1, pdt * 12);
        } else {
          if (p.vel > 2 && p.brake) p.sq = Math.max(p.sq, 0.07);   // 멈춰 서는 순간 몸이 눌린다
          p.vel = 0;
          p.stride = 0;
          p.lean += (0 - p.lean) * Math.min(1, pdt * 10);
          if (p.onArrive) { const f = p.onArrive; p.onArrive = null; f(); }
        }
        const wasUp = p.hop > 0;
        p.hop = Math.max(0, p.hop - pdt * 1.1);
        if (wasUp && p.hop === 0 && p.splitting) { p.splitting = false; p.sq = Math.max(p.sq, 0.1); }   // 스플릿 스텝 착지
        p.sq = Math.max(0, p.sq - pdt * 0.5);
        p.kick *= Math.max(0, 1 - pdt * 7);
        if (p.poseUntil && now > p.poseUntil) { p.poseUntil = 0; this.setPose(i, 'ready'); }
        if (p.emoteUntil && now > p.emoteUntil) { p.emoteUntil = 0; p.emote.visible = false; }
      }
      this.placeAll();
    }
    for (const q of [...this.pops]) {
      q.t += dt;
      const k = q.t / q.life;
      if (q.kind === 'text') {
        const v = new THREE.Vector3(q.at[0], q.at[1], q.at[2]).project(this.camera);
        const x = (v.x + 1) / 2 * this.el.clientWidth, y = (1 - v.y) / 2 * this.el.clientHeight - q.t * 26;
        const pop = q.t < 0.1 ? 0.6 + q.t * 6 : q.t < 0.2 ? 1.2 - (q.t - 0.1) * 2 : 1;
        q.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${pop.toFixed(3)})`;
        q.el.style.opacity = k > 0.7 ? Math.max(0, (1 - k) / 0.3).toFixed(3) : '1';
      } else if (q.kind === 'tag') {
        const p = this.players?.[q.j];
        if (p) {
          const W = this.el.clientWidth, w = q.w || (q.w = q.el.offsetWidth);
          const v = new THREE.Vector3(p.x, 2.2, p.z).project(this.camera);
          const x = clamp((v.x + 1) / 2 * W, w / 2 + 4, W - w / 2 - 4), y = (1 - v.y) / 2 * this.el.clientHeight;
          const pop = q.t < 0.08 ? 0.75 + q.t / 0.08 * 0.25 : 1;
          q.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${pop.toFixed(3)})`;
        }
        q.el.style.opacity = Math.min(1, q.t / 0.06, (q.life - q.t) / 0.15).toFixed(3);
      } else if (q.kind === 'call') {
        const p = this.players?.[q.j];
        const pop = q.t < 0.12 ? 0.6 + q.t / 0.12 * 0.55 : q.t < 0.22 ? 1.15 - (q.t - 0.12) / 0.1 * 0.15 : 1;
        // 같은 선수 머리 위에 샷 글자가 떠 있으면 그 위로 올라간다
        const tag = this.pops.find(o => o.kind === 'tag' && o.j === q.j && o.life - o.t > 0.15);
        const want = tag ? (tag.h || (tag.h = tag.el.offsetHeight)) + 4 : 0;
        q.off = (q.off ?? want) + (want - (q.off ?? want)) * Math.min(1, dt * 12);
        if (p) {
          const v = new THREE.Vector3(p.x, 2.3, p.z).project(this.camera);
          const x = (v.x + 1) / 2 * this.el.clientWidth, y = (1 - v.y) / 2 * this.el.clientHeight - Math.min(16, q.t * 24) - q.lift - q.off;
          q.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${pop.toFixed(3)})`;
        }
        q.el.style.opacity = k > 0.75 ? Math.max(0, (1 - k) / 0.25).toFixed(3) : '1';
      } else {
        const s = q.size * (0.5 + k);
        q.sp.scale.set(s, s, 1);
        q.sp.material.opacity = Math.max(0, 1 - k);
      }
      if (k >= 1) {
        if (q.el) q.el.remove(); else { this.scene.remove(q.sp); q.sp.material.dispose(); }
        this.pops.splice(this.pops.indexOf(q), 1);
      }
    }
    for (const f of [...this.fx]) { f.life -= dt; f.obj.material.opacity = Math.max(0, f.life / 1.2) * 0.8; if (f.life <= 0) { this.scene.remove(f.obj); this.fx.splice(this.fx.indexOf(f), 1); } }
    // 카메라: 시점이 바뀌면 부드럽게 따라가고, 끊어 보여 줄 때(cut)는 바로 옮긴다
    const { t: target, l: look } = this.camTarget();
    const kp = this.camCut ? 1 : this.camMode === 'main' ? 0.08 : this.camMode === 'push' ? 0.1 : 0.06;
    this.camera.position.lerp(target, kp);
    this.curLook = this.curLook || look.clone();
    this.curLook.lerp(look, this.camCut ? 1 : 0.12);
    this.camCut = false;
    this.camera.lookAt(this.curLook);
    // 스매시·에이스·위너 때 화면이 살짝 흔들린다
    let off = null;
    if (this.shake > 0.004) {
      off = new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0);
      this.camera.position.add(off);
      this.shake *= Math.pow(0.02, dt);
    } else this.shake = 0;
    this.renderer.render(this.scene, this.camera);
    if (off) this.camera.position.sub(off);
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    for (const tw of this.tweens) tw.done && tw.done();
    this.tweens = [];
    this.renderer.dispose();
    this.renderer.domElement.remove();
    for (const q of this.pops) q.el?.remove();
  }
}

export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
