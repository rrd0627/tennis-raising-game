// 3D 중계 뷰 — 3D 코트 + 2D 빌보드 캐릭터 (기획 문서 7장)
// 엔진이 만든 포인트 로그를 받아 재생만 한다.
import * as THREE from 'three';
import { sdFrames, emoteCanvas } from './art.js';

const COURT_W = 10.97, COURT_L = 23.77, SINGLES_W = 8.23, SERVICE = 6.40;
const SPEED = { serve: 26, serve2: 18, smash: 24, fh_drive: 18, bh_drive: 17, passing: 19, return: 17, swing_volley: 20, fh_volley: 15, bh_volley: 14, low_volley: 12, half_volley: 12, fh_slice: 13, bh_slice: 13, chip_return: 12, topspin_lob: 11, def_lob: 9, moon_volley: 9, dropshot: 9, drop_volley: 8 };
const APEX = { topspin_lob: 6.5, def_lob: 8, moon_volley: 5.5, dropshot: 1.8, drop_volley: 1.5, smash: 0.4, serve: 0.6, serve2: 1.2, fh_slice: 1.4, bh_slice: 1.4, chip_return: 1.3 };
const SURFACE = {
  turf: { court: '#3f9d63', out: '#2f7d4c', line: '#ffffff', grain: 'rgba(255,255,255,0.05)' },
  hard: { court: '#3a6fb0', out: '#3d8a5a', line: '#ffffff', grain: 'rgba(255,255,255,0.03)' },
  clay: { court: '#c8693a', out: '#b85e33', line: '#f5efe6', grain: 'rgba(0,0,0,0.05)' },
};

const RUN_SPEED = 5.2, MAX_RUN_SPEED = 9.5, NET_CLEAR = 1.08;
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
const ease = t => t * t * (3 - 2 * t);

export class MatchView {
  constructor(container, opts = {}) {
    this.el = container;
    this.speed = 1;
    this.surface = opts.surface || 'turf';
    this.banner = opts.banner || '';
    this.tweens = [];
    this.fx = [];
    this.alive = true;
    this.slow = 1;
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
    this.players = [];
    for (let i = 0; i < 4; i++) {
      const info = players[i];
      const frames = await sdFrames(info.charId || `npc${i}`, info.look, i < 2 ? 'back' : 'front');
      const tex = {};
      for (const [k, cnv] of Object.entries(frames)) tex[k] = this.canvasTex(cnv);
      const mat = new THREE.SpriteMaterial({ map: tex.ready, transparent: true });
      const sp = new THREE.Sprite(mat);
      sp.center.set(0.5, 0.02);
      sp.scale.set(2.0, 2.0, 1);
      this.scene.add(sp);
      const shadow = this.blob(0.38, 0.26);
      const emote = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      emote.scale.set(0.7, 0.7, 1); emote.visible = false; this.scene.add(emote);
      this.players.push({ sp, tex, shadow, emote, x: 0, z: i < 2 ? 11 : -11, tx: 0, tz: i < 2 ? 11 : -11, speed: RUN_SPEED, stride: 0, hop: 0, lean: 0, kick: 0, pose: 'ready', poseUntil: 0, emoteUntil: 0 });
    }
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
      p.sp.material.rotation = p.lean + p.kick;
      p.shadow.position.set(p.x, 0.012, p.z);
      p.emote.position.set(p.x, 2.35 + y, p.z);
    }
    this.myRing.position.set(this.players[0].x, 0.014, this.players[0].z);
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

  // 선수는 목표 지점으로 뛰어간다. 시간 안에 닿아야 하면 그만큼 빠르게 뛴다.
  runTo(i, x, z, within = 0) {
    const p = this.players[i];
    p.tx = x; p.tz = z;
    const d = Math.hypot(x - p.x, z - p.z);
    p.speed = within > 0 ? clamp(d / within, RUN_SPEED * 0.6, MAX_RUN_SPEED) : RUN_SPEED;
  }
  // 상대가 치는 순간의 작은 스텝
  splitStep(i) { this.players[i].hop = 0.16; }

  wait(sec) { return new Promise(res => this.tweens.push({ t: 0, dur: sec, step: () => { }, done: res })); }

  // 샷 하나의 비행 시간. 바운드 뒤에는 공이 느려진다.
  flightTime(from, to, bounce, type) {
    const sp = SPEED[type] || 16;
    const d1 = bounce ? Math.hypot(bounce[0] - from[0], bounce[1] - from[1]) : Math.hypot(to[0] - from[0], to[1] - from[1]);
    const d2 = bounce ? Math.hypot(to[0] - bounce[0], to[1] - bounce[1]) : 0;
    return Math.max(0.28, d1 / sp + d2 / (sp * 0.62));
  }

  // 공 비행: from/to = [x,z]. 네트를 넘는 포물선 + 바운드 뒤 다시 튀어 오름.
  flyBall(from, to, bounce, type, h0, h1, overNet = true) {
    const sp = SPEED[type] || 16;
    const end = bounce || to;
    const d1 = Math.hypot(end[0] - from[0], end[1] - from[1]);
    const d2 = bounce ? Math.hypot(to[0] - bounce[0], to[1] - bounce[1]) : 0;
    const t1 = d1 / sp, t2 = d2 / (sp * 0.62);
    const dur = this.flightTime(from, to, bounce, type);
    const k1 = bounce ? t1 / (t1 + t2) : 1;
    const yEnd = bounce ? 0 : h1;
    // 네트 위치에서 테이프보다 높게 지나가도록 곡선 높이를 정한다
    let apex = (APEX[type] ?? 1.5) * (bounce ? 1 : 0.5);
    const uNet = from[1] * end[1] < 0 ? Math.abs(from[1]) / (Math.abs(from[1]) + Math.abs(end[1])) : -1;
    if (overNet && uNet > 0) {
      const need = NET_CLEAR - lerp(h0, yEnd, uNet);
      apex = Math.max(apex, need / (4 * uNet * (1 - uNet)));
    }
    const rise = bounce ? Math.max(0.35, Math.min(1.8, apex * 0.5 + 0.35)) : 0;
    this.ball.visible = true; this.ballShadow.visible = true;
    this.trailPts = [];
    return new Promise(res => {
      let bounced = false;
      this.tweens.push({
        t: 0, dur, slowable: true,
        step: k => {
          let x, z, y;
          if (k <= k1) {
            const u = k / k1;
            x = lerp(from[0], end[0], u); z = lerp(from[1], end[1], u);
            y = lerp(h0, yEnd, u) + 4 * apex * u * (1 - u);
          } else {
            const u = (k - k1) / (1 - k1);
            if (!bounced) { bounced = true; this.mark(bounce); }
            x = lerp(bounce[0], to[0], u); z = lerp(bounce[1], to[1], u);
            y = lerp(0, h1, u) + 4 * rise * u * (1 - u);
          }
          this.ball.position.set(x, Math.max(0.11, y), z);
          this.ballShadow.position.set(x, 0.013, z);
          this.ballShadow.material.opacity = Math.max(0.12, 0.38 - y * 0.04);
          this.trailPts.push(new THREE.Vector3(x, Math.max(0.11, y), z));
          if (this.trailPts.length > 10) this.trailPts.shift();
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

  setCamera(mode) { this.camMode = mode; }

  // 포인트 시작 위치로 선수들이 걸어간다. 첫 포인트만 바로 세운다.
  async beginPoint(s0) {
    const start = s0.pos;
    const first = !this.started;
    this.started = true;
    for (let i = 0; i < 4; i++) {
      const [x, z] = i === s0.h ? s0.from : start[i];
      const p = this.players[i];
      this.setPose(i, 'ready'); this.showEmote(i, null);
      p.stride = 0; p.hop = 0; p.kick = 0;
      if (first) { p.x = p.tx = x; p.z = p.tz = z; } else this.runTo(i, x, z, 0.55);
    }
    this.placeAll();
    this.ball.visible = false; this.ballShadow.visible = false; this.trailPts = []; this.trail.geometry.setFromPoints([]);
    await this.wait(first ? 0.25 : 0.6);
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

  // 샷 하나 재생. next = 다음 타자의 샷 (다음 샷을 알아야 그 선수가 받으러 뛰어간다)
  async playShot(s, next) {
    const isServe = s.type === 'serve' || s.type === 'serve2';
    const side = (s.h < 2 ? 1 : -1) * (s.to[0] - s.from[0]);
    if (isServe) await this.tossBall(s);
    // 스윙: 타구 순간 몸을 돌리고 잠깐 뒤 준비 자세로
    const hitter = this.players[s.h];
    this.setPose(s.h, poseFor(s.type, side), 380);
    hitter.kick = (s.h < 2 ? 1 : -1) * (side < 0 ? -0.22 : 0.22);
    const dur = this.flightTime(s.from, s.to, s.bounce, s.type);
    // 친 사람은 제자리로 돌아가고, 받을 사람은 공이 올 곳으로 뛰어간다. 나머지는 공 쪽으로 조금 움직인다.
    for (let j = 0; j < 4; j++) {
      const [ax, az] = s.pos[j];
      if (next && next.h === j) this.runTo(j, s.to[0], s.to[1], Math.max(0.25, dur - 0.05));
      else if (j === s.h) this.runTo(j, lerp(s.from[0], ax, 0.75), lerp(s.from[1], az, 0.75));
      else this.runTo(j, ax + (s.to[0] - ax) * 0.18, az);
      // 상대편은 타구 순간 스텝을 밟는다
      if ((j < 2) !== (s.h < 2)) this.splitStep(j);
    }
    if (s.victim !== undefined) this.runTo(s.victim, lerp(this.players[s.victim].x, s.bounce ? s.bounce[0] : s.to[0], 0.75), this.players[s.victim].z, 0.6);
    const h0 = isServe ? 2.6 : s.type === 'smash' ? 2.6 : /volley/.test(s.type) ? 1.25 : 0.9;
    const h1 = s.res === 'net' ? 0.5 : next ? (/volley/.test(next.type) ? 1.15 : next.type === 'smash' ? 2.4 : 0.85) : 0.0;
    // 받을 선수는 공이 닿기 직전에 준비 자세를 잡는다
    if (next && next.h !== undefined && next.h !== s.h) {
      const pv = this.players[next.h];
      const lead = Math.max(0, dur - 0.22);
      this.tweens.push({ t: 0, dur: lead || 0.01, step: () => { }, done: () => { this.setPose(next.h, prepFor(next.type), 0); pv.kick = (next.h < 2 ? 1 : -1) * (/^bh_/.test(next.type) ? 0.12 : -0.12); } });
    }
    if (s.res === 'net') {
      const netPt = [lerp(s.from[0], s.to[0], 0.9), 0.15 * Math.sign(s.from[1])];
      await this.flyBall(s.from, netPt, null, s.type, h0, 0.6, false);
      await this.flyBall(netPt, [netPt[0], netPt[1] + 0.6 * Math.sign(s.from[1])], null, 'dropshot', 0.6, 0.1, false);
    } else {
      await this.flyBall(s.from, s.to, s.bounce, s.type, h0, h1);
    }
    this.slow = 1;
    if (s.res === 'fault') { await this.wait(0.35); }
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
    for (let i = from; i < shots.length; i++) {
      if (!this.alive) return;
      const s = shots[i];
      const decisive = i === lastIdx && pt.big && ['win', 'ace', 'poach', 'center'].includes(s.res);
      if ((decisive || s.skill) && hooks.onCutin) { this.slow = 0.35; await hooks.onCutin(s, pt); }
      await this.playShot(s, shots[i + 1]);
    }
    // 결과 포즈
    const w = pt.winner;
    for (let i = 0; i < 4; i++) {
      const team = i < 2 ? 0 : 1;
      this.setPose(i, team === w ? 'cheer' : (i === pt.by && pt.endType !== 'win' && pt.endType !== 'ace' && pt.endType !== 'poach' && pt.endType !== 'center') ? 'sad' : 'ready', 900);
      const st = pt.states[i];
      this.showEmote(i, st === 'zone' ? 'fire' : st === 'tilt' ? 'cloud' : st === 'shaky' ? 'sweat' : (team === w && i === pt.by ? 'heart' : null));
    }
    await this.wait(0.6);
    this.ball.visible = false; this.ballShadow.visible = false;
  }

  // 큰 순간 끝난 뒤 사이드 리플레이: 마지막 샷 다시
  async replay(pt) {
    const s = pt.shots[pt.shots.length - 1];
    this.setCamera('side');
    this.slow = 0.45;
    for (let i = 0; i < 4; i++) this.setPose(i, 'ready');
    const rp = this.players[s.h];
    rp.x = rp.tx = s.from[0]; rp.z = rp.tz = s.from[1]; this.placeAll();
    this.setPose(s.h, poseFor(s.type, 1), 800);
    const h0 = s.type === 'smash' ? 2.6 : /volley/.test(s.type) ? 1.3 : s.type.startsWith('serve') ? 2.5 : 0.95;
    await this.flyBall(s.from, s.to, s.bounce, s.type, h0, 0.1);
    await this.wait(0.4);
    this.slow = 1;
    this.setCamera('main');
  }

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    for (const tw of [...this.tweens]) {
      tw.t += dt * this.speed * (tw.slowable ? this.slow : 1);
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done && tw.done(); }
    }
    if (this.players) {
      const pdt = dt * this.speed * (this.slow < 1 ? this.slow : 1);
      for (let i = 0; i < 4; i++) {
        const p = this.players[i];
        // 달리기: 목표까지 일정한 속도로, 도착하면 멈춘다
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), step = p.speed * pdt;
        if (d > 0.02) {
          const m = Math.min(1, step / d);
          p.x += dx * m; p.z += dz * m;
          p.stride += step * 2.6;
          p.lean += ((i < 2 ? -1 : 1) * clamp(dx / Math.max(d, 0.01), -1, 1) * 0.14 - p.lean) * Math.min(1, pdt * 10);
        } else {
          p.stride = 0;
          p.lean += (0 - p.lean) * Math.min(1, pdt * 10);
        }
        p.hop = Math.max(0, p.hop - pdt * 0.9);
        p.kick *= Math.max(0, 1 - pdt * 7);
        if (p.poseUntil && now > p.poseUntil) { p.poseUntil = 0; this.setPose(i, 'ready'); }
        if (p.emoteUntil && now > p.emoteUntil) { p.emoteUntil = 0; p.emote.visible = false; }
      }
      this.placeAll();
    }
    for (const f of [...this.fx]) { f.life -= dt; f.obj.material.opacity = Math.max(0, f.life / 1.2) * 0.8; if (f.life <= 0) { this.scene.remove(f.obj); this.fx.splice(this.fx.indexOf(f), 1); } }
    // 카메라
    const target = new THREE.Vector3(), look = new THREE.Vector3();
    if (this.camMode === 'side') { target.set(15, 3.2, this.ball.position.z * 0.5); look.set(0, 1, this.ball.position.z * 0.6); }
    else { target.copy(this.camBase); target.x += (this.ball.visible ? this.ball.position.x : 0) * 0.18; look.copy(this.camLook); look.x = target.x * 0.6; }
    this.camera.position.lerp(target, this.camMode === 'side' ? 0.25 : 0.08);
    this.curLook = this.curLook || look.clone();
    this.curLook.lerp(look, 0.12);
    this.camera.lookAt(this.curLook);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    for (const tw of this.tweens) tw.done && tw.done();
    this.tweens = [];
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
