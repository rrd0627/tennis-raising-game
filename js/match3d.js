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
    this.gameTime = 0; // 재생 속도를 반영한 경기 시간(초). 늦은 변경 판정에 쓴다
    this.eta = 0; this.etaDur = 1; // 지금 날아가는 공이 도착할 시각과 비행 시간
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
      this.players.push({ sp, tex, shadow, emote, x: 0, z: i < 2 ? 11 : -11, pose: 'ready', poseUntil: 0, emoteUntil: 0 });
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
      p.sp.position.set(p.x, 0, p.z);
      p.shadow.position.set(p.x, 0.012, p.z);
      p.emote.position.set(p.x, 2.35, p.z);
    }
    this.myRing.position.set(this.players[0].x, 0.014, this.players[0].z);
  }

  setRingDanger(on) { this.myRing.material.color.set(on ? 0xff3b5c : 0xffe14d); }

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

  moveTo(i, x, z, dur) {
    const p = this.players[i];
    const fx = p.x, fz = p.z;
    this.tweens.push({ t: 0, dur: Math.max(0.05, dur), step: k => { p.x = lerp(fx, x, ease(k)); p.z = lerp(fz, z, ease(k)); } });
  }

  wait(sec) { return new Promise(res => this.tweens.push({ t: 0, dur: sec, step: () => { }, done: res })); }

  // 공 비행: from/to = [x,z]
  flyBall(from, to, bounce, type, h0, h1) {
    const sp = (SPEED[type] || 16);
    const d1 = bounce ? Math.hypot(bounce[0] - from[0], bounce[1] - from[1]) : Math.hypot(to[0] - from[0], to[1] - from[1]);
    const d2 = bounce ? Math.hypot(to[0] - bounce[0], to[1] - bounce[1]) : 0;
    const apex = APEX[type] ?? 1.9;
    const dur = Math.max(0.28, (d1 + d2) / sp) * 0.95;
    const k1 = bounce ? d1 / (d1 + d2) : 1;
    this.eta = this.gameTime + dur; this.etaDur = dur;
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
            const end = bounce || to;
            x = lerp(from[0], end[0], u); z = lerp(from[1], end[1], u);
            const yEnd = bounce ? 0 : h1;
            y = lerp(h0, yEnd, u) + 4 * apex * u * (1 - u) * (bounce ? 1 : 0.6);
          } else {
            const u = (k - k1) / (1 - k1);
            if (!bounced) { bounced = true; this.mark(bounce); }
            x = lerp(bounce[0], to[0], u); z = lerp(bounce[1], to[1], u);
            y = lerp(0, h1, u) + 4 * Math.min(1.6, apex * 0.35 + 0.6) * u * (1 - u);
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

  // 포인트 시작 위치로 선수 배치
  async beginPoint(s0) {
    const start = s0.pos;
    for (let i = 0; i < 4; i++) { this.players[i].x = start[i][0]; this.players[i].z = start[i][1]; this.setPose(i, 'ready'); this.showEmote(i, null); }
    this.players[s0.h].x = s0.from[0]; this.players[s0.h].z = s0.from[1];
    this.placeAll();
    this.ball.visible = false; this.trailPts = []; this.trail.geometry.setFromPoints([]);
    await this.wait(0.25);
  }

  // 샷 하나 재생. next = 다음 타자 { h, type } 또는 { h, contactH } (타구 전이라 샷을 아직 모를 때)
  async playShot(s, next) {
    const side = (s.h < 2 ? 1 : -1) * (s.to[0] - s.from[0]);
    this.setPose(s.h, poseFor(s.type, side), 420);
    // 다른 선수 위치 이동
    for (let j = 0; j < 4; j++) {
      if (j === s.h) continue;
      let tx = s.pos[j][0], tz = s.pos[j][1];
      if (next && next.h === j) { tx = s.to[0]; tz = s.to[1]; }
      this.moveTo(j, tx, tz, 0.55 / this.speed);
    }
    if (s.victim !== undefined) { const v = s.victim; this.moveTo(v, lerp(this.players[v].x, s.bounce ? s.bounce[0] : s.to[0], 0.55), this.players[v].z, 0.5); }
    const h0 = s.type === 'serve' || s.type === 'serve2' ? 2.5 : s.type === 'smash' ? 2.6 : /volley/.test(s.type) ? 1.3 : 0.95;
    const h1 = s.res === 'net' ? 0.5 : (next ? (next.contactH ?? (/volley/.test(next.type) ? 1.2 : next.type === 'smash' ? 2.4 : 0.9)) : 0.0);
    if (s.res === 'net') {
      const netPt = [lerp(s.from[0], s.to[0], 0.9), 0.15 * Math.sign(s.from[1])];
      await this.flyBall(s.from, netPt, null, s.type, h0, 0.6);
      await this.flyBall(netPt, [netPt[0], netPt[1] + 0.6 * Math.sign(s.from[1])], null, 'dropshot', 0.6, 0.1);
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
      if (decisive && hooks.onCutin) { this.slow = 0.35; await hooks.onCutin(s, pt); }
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
    this.players[s.h].x = s.from[0]; this.players[s.h].z = s.from[1]; this.placeAll();
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
    this.gameTime += dt * this.speed * this.slow;
    for (const tw of [...this.tweens]) {
      tw.t += dt * this.speed * (tw.slowable ? this.slow : 1);
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done && tw.done(); }
    }
    if (this.players) {
      for (let i = 0; i < 4; i++) {
        const p = this.players[i];
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
    this.onFrame && this.onFrame();
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
