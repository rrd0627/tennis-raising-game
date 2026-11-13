// 3D 중계 뷰 — 3D 코트 + 2D 빌보드 캐릭터 (기획 문서 7장)
// 엔진이 만든 포인트 로그를 받아 재생만 한다.
import * as THREE from 'three';
import { sdFrames, sdMotionFrames, emoteCanvas } from './art.js';
import { BALL_V, flightTime, standOf, closeCall, h01, wingOf } from './rally.js';
import { planPoint, flyOf, solveShot, dropArc, stepFree } from './ball.js';
import { loadStadium, stadiumData, buildStadium, toonMaterial } from './stadium.js';
import { Players3D, p3dPref, SV_TOSS } from './players3d.js';
export { p3dPref, setP3dPref, prefetchP3d } from './players3d.js';

const COURT_W = 10.97, COURT_L = 23.77, SINGLES_W = 8.23, SERVICE = 6.40;
// 코트 색은 빛을 받지 않고 그대로 보인다(툰풍으로 밝게, 2026-11-09). wear: 많이 밟는 자리 색, stripe: 잔디 깎은 줄
const SURFACE = {
  turf: { court: '#58c46a', out: '#47b05c', line: '#ffffff', grain: 'rgba(255,255,255,0.05)', wear: 'rgba(236,214,160,0.2)', stripe: 0.07 },
  hard: { court: '#4a8fe0', out: '#4fb784', line: '#ffffff', grain: 'rgba(255,255,255,0.035)', wear: 'rgba(255,255,255,0.09)' },
  clay: { court: '#e8894d', out: '#de7f46', line: '#fffaf2', grain: 'rgba(120,40,10,0.06)', wear: 'rgba(150,60,20,0.16)', brush: true },
};

// 사용자 2026-11-13: 최대 속도가 너무 빠르다. 선수 최고 속도는 엔진(bodyOf().top, 가는 쪽, mv.top)이 정하고 이 값들은 넘지 않는 끝
const RUN_SPEED = 3.5, MAX_RUN_SPEED = 5.5, RUN_CAP = 5.5;   // RUN_CAP: 받으러 갈 때 이보다 빨리 뛰지 않는다
// 발: 출발해서 속도를 올리고(acc), 멈출 때는 미리 줄인다(dec). m/s². 선수마다 첫발(순발력)로 정한다(bodyOf().acc, 사용자 2026-11-13: 0에서 바로 최고 속도가 되면 이상하다).
// 예전에는 모두 22·18이라 순식간에 최고 속도가 났다. 값이 없으면 아래 기본값
const ACC = 6, DEC = 9;
// 거리 D를 T초 안에 가려면 얼마나 빨리 달려야 하나(속도를 올리는 시간, 멈추면 줄이는 시간까지 넣어서)
function cruise(D, T, brake, acc = ACC, dec = DEC) {
  const c = 1 / (2 * acc) + (brake ? 1 / (2 * dec) : 0), disc = T * T - 4 * c * D;
  const v = disc >= 0 ? (T - Math.sqrt(disc)) / (2 * c) : T / (2 * c);
  return Math.min(RUN_CAP, Math.max(1.2, v));
}
// 거리 D를 최고 속도 v로 달려가는 데 걸리는 시간(속도를 올리는 시간, 멈추면 줄이는 시간까지)
function runTime(D, v, brake, acc = ACC, dec = DEC) {
  const c = 1 / (2 * acc) + (brake ? 1 / (2 * dec) : 0);
  return D >= v * v * c ? D / v + v * c : 2 * Math.sqrt(D / c) * c;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 공(arc)이 점 X 곁을 가장 가까이 지나는 때 { t, d, p:[x,z,y] }. 높이 ymax 아래로 지날 때만 본다
function nearest(arc, X, ymax = 2.3, t0 = 0.12) {
  let best = null;
  for (let t = t0; t <= arc.dur; t += 0.02) {
    const p = arc.at(t);
    if (p[2] > ymax) continue;
    const d = Math.hypot(p[0] - X[0], p[1] - X[1]);
    if (!best || d < best.d) best = { t, d, p };
  }
  return best;
}
// 공이 앞으로 가는 방향(바닥 위, 단위 벡터)
function heading(arc, t) { const a = arc.at(Math.max(0, t - 0.02)), b = arc.at(t + 0.02), d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; }
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
// 치는 동작을 나눈 그림(부분 동작): 스플릿 → 유닛턴 → 파워 포지션(스탠스별) → 임팩트 → 팔로스로.
// 드라이브(세게 치는 샷)는 드라이브 세트(백핸드 두 손), 슬라이스·칩·드롭샷·수비 로브는 한 손 슬라이스 세트. 발리·스매시·서브는 예전 그림
const DRIVE_SHOT = /^(fh_drive|bh_drive|passing|return|topspin_lob|swing_volley)$/;
const SLICE_SHOT = /^(fh_slice|bh_slice|chip_return|dropshot|def_lob)$/;
// 엔진의 스탠스(stanceOf) → 그림 이름. 드라이브는 크로스가 없어 뉴트럴, 백핸드 드라이브와 슬라이스는 세미오픈이 없어 오픈으로
const STANCE_KEY = { '뉴트럴': 'neutral', '세미오픈': 'semi', '오픈': 'open', '달리면서': 'run', '크로스': 'cross' };
function swingOf(type, stance, wing) {
  if (wing !== 'fh' && wing !== 'bh') return null;
  const slice = SLICE_SHOT.test(type);
  if (!slice && !DRIVE_SHOT.test(type)) return null;
  let st = STANCE_KEY[stance] || (wing === 'fh' && !slice ? 'semi' : 'neutral');
  if (st === 'semi' && (slice || wing === 'bh')) st = 'open';
  if (st === 'cross' && !slice) st = 'neutral';
  const sl = slice ? 'slice' : '';
  return { type, turn: `turn${wing}`, power: `power${wing}${sl}${st}`, hit: `hit${wing}${sl}`, follow: `follow${wing}${sl}` };
}
// 그림이 없으면 대신 쓸 그림: 파워 포지션은 그 스탠스 → 뉴트럴 → 유닛턴, 임팩트·팔로스로는 예전 포핸드·백핸드 그림
// (슬라이스 세트가 없을 때 두 손 드라이브 그림으로 대신하지 않는다), 스플릿·유닛턴은 준비 자세
function fallbackPose(pose) {
  let m;
  if ((m = /^power(fh|bh)(slice)?(\w+)$/.exec(pose))) return m[3] !== 'neutral' ? `power${m[1]}${m[2] || ''}neutral` : `turn${m[1]}`;
  if ((m = /^(?:hit|follow)(fh|bh)(?:slice)?$/.exec(pose))) return m[1];
  return 'ready';
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
    this.crowdFill = opts.crowd;
    this.p3dWant = opts.p3d;   // 3D 선수로 시작할지(없으면 이 기기에 기억한 값)
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
    // 경기장 그림자(지붕, 전광판, 조명탑)는 움직이지 않으니 한 번만 그린다
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;   // 빛마다 정한다: 경기장 해는 한 번만(sun.shadow.autoUpdate = false), 선수 전용 해는 매 프레임
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 800);
    this.camBase = new THREE.Vector3(0, 14.5, 22.5);
    this.camLook = new THREE.Vector3(0, 0, -1.4);
    this.camMode = 'main';
    this.camCut = true;   // 첫 장면부터 중계 자리에서 시작한다(가까이서 날아 들어오지 않게)
    this.tension = 0;     // 랠리가 길어질수록 카메라가 다가간다(0~1)
    this.fovCur = 1;      // 화각 배율: 서브를 당겨 찍을 때 좁아지고, 세게 칠 때 잠깐 좁아진다(줌 펀치)
    this.punch = 0;
    this.crowdAmp = 0;    // 관중이 들썩이는 크기
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
    this.baseFov = Math.max(40, Math.min(70, vfov));
    // 1인칭: 사람이 집중해서 보는 폭처럼 가로로 약 55도(세로 화면이면 세로 화각이 커진다. 하늘·바닥이 너무 넓지 않게 80도까지)
    this.fpvFov = Math.max(50, Math.min(80, 2 * Math.atan(Math.tan(55 / 2 * Math.PI / 180) / aspect) * 180 / Math.PI));
    // 3인칭(어깨 너머): 가로 약 62도
    this.tpsFov = Math.max(50, Math.min(82, 2 * Math.atan(Math.tan(62 / 2 * Math.PI / 180) / aspect) * 180 / Math.PI));
    this.camera.fov = this.viewFov() * (this.fovCur || 1);
    this.camera.updateProjectionMatrix();
  }
  // 시점 바꾸기: 중계(코트 전체) / 3인칭(주인공 바로 뒤에서) / 1인칭(주인공 눈높이). 주인공 그림은 1인칭에서만 숨긴다
  setView(mode) {
    this.view3 = mode === 'fpv' || mode === 'tps' ? mode : 'tv';
    this.fpv = this.view3 === 'fpv';
    this.camCut = true;
    if (this.view3 !== 'tv') this.fovCur = 1;
    if (this.players) this.placeAll();
  }
  setFpv(on) { this.setView(on ? 'fpv' : 'tv'); }
  viewFov() { return this.view3 === 'fpv' ? this.fpvFov : this.view3 === 'tps' ? this.tpsFov : this.baseFov; }
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
    // 하늘: 카메라를 따라다니는 큰 공. 머리 위는 진한 파랑, 지평선은 밝게(우마무스메 경기장처럼 화사하게)
    const skyG = new THREE.SphereGeometry(700, 32, 16), sp = skyG.attributes.position, skyC = [];
    const SKY = [[-1, '#e9f7ff'], [0, '#e9f7ff'], [0.08, '#bfe6ff'], [0.3, '#7cc6f7'], [0.6, '#4aa6ee'], [1, '#358fe3']].map(([h, c]) => [h, new THREE.Color(c)]);
    const tc = new THREE.Color();
    for (let i = 0; i < sp.count; i++) {
      const h = sp.getY(i) / 700;
      let k = 1; while (k < SKY.length - 1 && SKY[k][0] < h) k++;
      const [h0, c0] = SKY[k - 1], [h1, c1] = SKY[k];
      tc.copy(c0).lerp(c1, clamp((h - h0) / (h1 - h0 || 1), 0, 1)); skyC.push(tc.r, tc.g, tc.b);
    }
    skyG.setAttribute('color', new THREE.Float32BufferAttribute(skyC, 3));
    this.sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10; this.scene.add(this.sky);
    this.scene.background = new THREE.Color('#bfe6ff');
    this.scene.fog = new THREE.Fog('#dff2ff', 140, 640);   // 먼 산과 구름은 하늘빛으로 옅게
    // 아래를 보는 면(지붕 밑)은 땅에서 오는 빛을 받는다. 칙칙하지 않게 밝고 시원한 색. 위를 보는 코트는 예전과 같다
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c3e6, 1.1));
    // 해는 왼쪽에서 조금 낮게(오후). 왼쪽 관중석 차양 그림자가 코트 왼쪽 복식 줄 근처까지 진다. 오른쪽 관중석은 밝고 왼쪽은 그늘
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(-40, 24.5, 6).setLength(52); this.scene.add(sun);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 5, far: 160 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true; this.sun = sun;
    // 3D 선수 그림자(사용자 2026-11-13: 동그란 그림자 말고 자연스럽게): 같은 해 방향, 빛은 0이라 밝기는 그대로이고 바닥의 그림자 판에만 진다.
    // 선수만 그린다(레이어 1). 그림자 범위는 선수 넷 둘레로 좁혀(`fitPlayerShadow`) 가까이서도 또렷하다
    const pSun = new THREE.DirectionalLight(0xffffff, 0); pSun.castShadow = false; pSun.shadow.mapSize.set(1024, 1024);
    pSun.shadow.camera.layers.set(1); pSun.shadow.bias = -0.0008; pSun.shadow.normalBias = 0.02; pSun.shadow.radius = 2.5;
    this.scene.add(pSun); this.scene.add(pSun.target); this.pSun = pSun; this.sunDir = sun.position.clone().normalize();
    this.camera.layers.enable(1);
    // 바닥: 벽 안쪽 전체(바깥 바닥)와 코트를 칠한다. 빛을 받지 않는 그림이라 고른 색이 그대로 밝게 보인다.
    // 경기장 그림자(벽, 펜스 기둥)는 그 위에 그림자만 그리는 판으로 얹는다
    const FX0 = -11.05, FX1 = 11.05, FZ0 = -19.5, FZ1 = 21.2;
    let seed = 99; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const paint = (g, W, H, x0, z0, x1, z1, court) => {
      const PX = x => (x - x0) / (x1 - x0) * W, PZ = z => (z - z0) / (z1 - z0) * H, m = W / (x1 - x0);
      g.fillStyle = S.out; g.fillRect(0, 0, W, H);
      if (court) { g.fillStyle = S.court; g.fillRect(PX(-COURT_W / 2), PZ(-COURT_L / 2), COURT_W * m, COURT_L * m); }
      // 잔디는 깎은 줄무늬(코트와 바깥이 이어지게 실제 자리로 1.6m마다)
      if (S.stripe) for (let k = Math.floor(z0 / 1.6); k * 1.6 < z1; k++) if (k % 2 === 0) { g.fillStyle = `rgba(255,255,255,${S.stripe})`; g.fillRect(0, PZ(k * 1.6), W, 1.6 * m); }
      // 클레이는 솔로 쓴 결
      if (S.brush) for (let i = 0; i < W * H / 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,230,200,0.10)' : 'rgba(140,50,10,0.07)'; g.fillRect(rnd() * W, rnd() * H, 8 + rnd() * 40, 1.2); }
      for (let i = 0; i < W * H / 60; i++) { g.fillStyle = S.grain; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
      // 많이 밟는 자리: 베이스라인 가운데 뒤, 서비스 라인 근처
      const wear = (x, z, rx, rz) => {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx * m); gr.addColorStop(0, S.wear); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.save(); g.translate(PX(x), PZ(z)); g.scale(1, rz / rx); g.fillStyle = gr; g.fillRect(-rx * m, -rx * m, 2 * rx * m, 2 * rx * m); g.restore();
      };
      if (court) for (const sz of [-1, 1]) { wear(0, sz * 12.6, 2.6, 1.0); wear(-1.6, sz * 12.3, 1.4, 0.7); wear(1.6, sz * 12.3, 1.4, 0.7); wear(0, sz * 6.6, 1.6, 1.0); }
      // 햇빛: 먼 쪽이 살짝 밝고 뿌옇다
      const sh = g.createLinearGradient(0, PZ(-20), 0, PZ(21)); sh.addColorStop(0, 'rgba(255,255,255,0.08)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(20,40,90,0.07)');
      g.fillStyle = sh; g.fillRect(0, 0, W, H);
      // 벽 밑은 조금 어둡다(닿는 그늘)
      if (!court) {
        const band = (a, b, horiz, k) => {
          const gr = horiz ? g.createLinearGradient(0, PZ(a), 0, PZ(b)) : g.createLinearGradient(PX(a), 0, PX(b), 0);
          gr.addColorStop(0, `rgba(20,40,100,${k})`); gr.addColorStop(1, 'rgba(20,40,100,0)'); g.fillStyle = gr;
          if (horiz) g.fillRect(0, Math.min(PZ(a), PZ(b)), W, Math.abs(PZ(b) - PZ(a))); else g.fillRect(Math.min(PX(a), PX(b)), 0, Math.abs(PX(b) - PX(a)), H);
        };
        band(FX0, FX0 + 0.7, false, 0.2); band(FX1, FX1 - 0.7, false, 0.2); band(FZ0, FZ0 + 0.9, true, 0.26); band(FZ1, FZ1 - 0.7, true, 0.2);
      }
    };
    const oW = 512, oH = Math.round(512 * (FZ1 - FZ0) / (FX1 - FX0));
    const outC = document.createElement('canvas'); outC.width = oW; outC.height = oH;
    paint(outC.getContext('2d'), oW, oH, FX0, FZ0, FX1, FZ1, false);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(FX1 - FX0, FZ1 - FZ0), new THREE.MeshBasicMaterial({ map: this.canvasTex(outC) }));
    outer.rotation.x = -Math.PI / 2; outer.position.z = (FZ0 + FZ1) / 2; this.scene.add(outer);
    // 코트: 복식 라인 안쪽만 코트 색이고, 1m 둘레는 바깥 색으로 이어진다
    const cw = 512, ch = Math.round(512 * (COURT_L + 2) / (COURT_W + 2));
    const cc = document.createElement('canvas'); cc.width = cw; cc.height = ch;
    paint(cc.getContext('2d'), cw, ch, -(COURT_W + 2) / 2, -(COURT_L + 2) / 2, (COURT_W + 2) / 2, (COURT_L + 2) / 2, true);
    const courtTex = this.canvasTex(cc); courtTex.anisotropy = 8;
    const court = new THREE.Mesh(new THREE.PlaneGeometry(COURT_W + 2, COURT_L + 2), new THREE.MeshBasicMaterial({ map: courtTex }));
    court.rotation.x = -Math.PI / 2; court.position.y = 0.005; this.scene.add(court);
    // 라인: 그림이 아니라 얇은 판이라 가까이서 봐도 또렷하다
    const hw = COURT_W / 2, hs = SINGLES_W / 2, hl = COURT_L / 2, LW = 0.06, BW = 0.08;
    const rects = [[-hw, -hl, -hw + LW, hl], [hw - LW, -hl, hw, hl], [-hs, -hl, -hs + LW, hl], [hs - LW, -hl, hs, hl],
      [-hw, -hl, hw, -hl + BW], [-hw, hl - BW, hw, hl], [-hs, -SERVICE - LW / 2, hs, -SERVICE + LW / 2], [-hs, SERVICE - LW / 2, hs, SERVICE + LW / 2],
      [-LW / 2, -SERVICE, LW / 2, SERVICE], [-LW / 2, -hl, LW / 2, -hl + 0.2], [-LW / 2, hl - 0.2, LW / 2, hl]];
    const lp = [];
    for (const [x0, z0, x1, z1] of rects) lp.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lines = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: S.line }));
    lines.position.y = 0.009; this.scene.add(lines);   // 높이를 몇 mm씩 띄워 겹치지 않게 한다(바닥 0, 코트 0.005, 라인 0.009, 그림자 0.011, 발밑 그림 0.012~)
    // 경기장 그림자(벽, 펜스 기둥, 네트 기둥)만 바닥에 얹는다
    const shadeFloor = new THREE.Mesh(new THREE.PlaneGeometry(FX1 - FX0, FZ1 - FZ0), new THREE.ShadowMaterial({ color: 0x1a2a66, opacity: 0.33, depthWrite: false }));
    shadeFloor.rotation.x = -Math.PI / 2; shadeFloor.position.set(0, 0.011, (FZ0 + FZ1) / 2); shadeFloor.receiveShadow = true; shadeFloor.renderOrder = 1;
    this.scene.add(shadeFloor);
    // 네트: 윗줄은 가운데 0.914m, 기둥 쪽 1.07m로 처진다(공이 네트에 걸리는 높이 js/ball.js와 같다). 가운데 띠, 흰 테이프
    const netH = x => 0.914 + 0.156 * Math.min(1, (x / 6.4) ** 2);
    const nc = document.createElement('canvas'); nc.width = 64; nc.height = 64;
    const n = nc.getContext('2d'); n.strokeStyle = 'rgba(24,30,64,0.9)'; n.lineWidth = 2;
    for (let i = 0; i <= 64; i += 8) { n.beginPath(); n.moveTo(i, 0); n.lineTo(i, 64); n.stroke(); n.beginPath(); n.moveTo(0, i); n.lineTo(64, i); n.stroke(); }
    const NW = COURT_W + 1.8, netG = new THREE.PlaneGeometry(NW, 1, 32, 1), np = netG.attributes.position;
    for (let i = 0; i < np.count; i++) np.setY(i, np.getY(i) > 0 ? netH(np.getX(i)) - 0.035 : 0);
    netG.computeBoundingSphere();
    const net = new THREE.Mesh(netG, new THREE.MeshBasicMaterial({ map: this.canvasTex(nc, [40, 3]), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.scene.add(net);
    const tapeG = new THREE.PlaneGeometry(NW, 0.07, 32, 1), tp = tapeG.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setY(i, netH(tp.getX(i)) + tp.getY(i));
    tapeG.computeBoundingSphere();
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const tape = new THREE.Mesh(tapeG, white); tape.castShadow = true; this.scene.add(tape);
    const strap = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.914), white); strap.position.set(0, 0.457, 0.004); this.scene.add(strap);
    for (const x of [-(COURT_W / 2 + 0.9), COURT_W / 2 + 0.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10), toonMaterial(new THREE.Color('#24407e')));
      post.position.set(x, 0.55, 0); post.castShadow = true; this.scene.add(post);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10), toonMaterial(new THREE.Color('#ffffff')));
      cap.position.set(x, 1.12, 0); this.scene.add(cap);
    }
    this.renderer.shadowMap.needsUpdate = true; if (this.sun) this.sun.shadow.needsUpdate = true;
    // 코트 바깥: Blender로 만든 툰풍 경기장(js/stadium.js). 아직 못 불러왔으면 예전 배경을 두었다가 바꾼다
    if (stadiumData()) this.addStadium(stadiumData());
    else {
      this.buildFence();
      loadStadium().then(d => { if (d && this.alive && !this.stadium) this.addStadium(d); });
    }
  }
  addStadium(d) {
    if (this.surround) {
      this.scene.remove(this.surround);
      this.surround.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      this.surround = null; this.crowds = null;
    }
    this.stadium = buildStadium(d, { banner: this.banner || '동호인 테니스 대회', crowd: this.crowdFill });
    this.scene.add(this.stadium.group);
    if (this.board) this.stadium.setBoard(this.board);
    this.renderer.shadowMap.needsUpdate = true; if (this.sun) this.sun.shadow.needsUpdate = true;
  }
  // 전광판 점수: { rows: [{ name, games, point, serve }], label }
  setBoard(b) { this.board = b; this.stadium?.setBoard(b); }
  // 예전 배경(펜스, 현수막, 본부석, 관중 판). 경기장 모델을 못 불러올 때만 쓴다
  buildFence() {
    const sur = this.surround = new THREE.Group(); this.scene.add(sur);
    // 펜스 + 배너
    const fc = document.createElement('canvas'); fc.width = 64; fc.height = 64;
    const f = fc.getContext('2d'); f.strokeStyle = 'rgba(40,60,50,0.55)'; f.lineWidth = 2;
    for (let i = -64; i <= 128; i += 12) { f.beginPath(); f.moveTo(i, 0); f.lineTo(i + 64, 64); f.stroke(); f.beginPath(); f.moveTo(i + 64, 0); f.lineTo(i, 64); f.stroke(); }
    const fenceMat = new THREE.MeshBasicMaterial({ map: this.canvasTex(fc, [30, 4]), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(22, 4), fenceMat);
    back.position.set(0, 2, -19.5); sur.add(back);
    for (const x of [-11, 11]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(40, 4), fenceMat); side.rotation.y = Math.PI / 2; side.position.set(x, 2, 0); sur.add(side); }
    const wind = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.6), new THREE.MeshLambertMaterial({ color: 0x1f5a3c }));
    wind.position.set(0, 0.8, -19.45); sur.add(wind);
    const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 96;
    const b = bc.getContext('2d'); b.fillStyle = '#ffffff'; b.fillRect(0, 0, 1024, 96);
    b.fillStyle = '#ff5b8a'; b.fillRect(0, 0, 1024, 12); b.fillRect(0, 84, 1024, 12);
    b.fillStyle = '#20324a'; b.font = 'bold 48px "Noto Sans KR", sans-serif'; b.textAlign = 'center'; b.textBaseline = 'middle';
    b.fillText(this.banner || '동호인 테니스 대회', 512, 50);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.1), new THREE.MeshBasicMaterial({ map: this.canvasTex(bc) }));
    banner.position.set(0, 1.0, -19.4); sur.add(banner);
    // 본부석 텐트 (2D 판)
    const tc = document.createElement('canvas'); tc.width = 256; tc.height = 192;
    const t = tc.getContext('2d');
    t.fillStyle = '#ffffff'; t.fillRect(30, 70, 196, 110); t.fillStyle = '#ff7aa2';
    t.beginPath(); t.moveTo(10, 76); t.lineTo(128, 10); t.lineTo(246, 76); t.closePath(); t.fill();
    t.fillStyle = '#20324a'; t.font = 'bold 30px sans-serif'; t.textAlign = 'center'; t.fillText('본부석', 128, 130);
    t.fillStyle = '#8b6b4a'; t.fillRect(40, 150, 176, 14);
    const tent = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.canvasTex(tc) }));
    tent.scale.set(5, 3.75, 1); tent.position.set(-7.5, 1.6, -22); sur.add(tent);
    // 관중 판
    const pc = document.createElement('canvas'); pc.width = 512; pc.height = 96;
    const p = pc.getContext('2d');
    const cols = ['#ff7aa2', '#6c8cff', '#ffd166', '#7ad3a8', '#c58cff', '#ff8f6b'];
    for (let i = 0; i < 18; i++) { const x = 14 + i * 28 + (i % 2) * 4; p.fillStyle = cols[i % cols.length]; p.beginPath(); p.roundRect(x - 11, 52, 22, 44, 8); p.fill(); p.fillStyle = '#ffe0cc'; p.beginPath(); p.arc(x, 40, 11, 0, Math.PI * 2); p.fill(); p.fillStyle = '#3a2a22'; p.beginPath(); p.arc(x, 35, 11, Math.PI, 0); p.fill(); }
    // 관중은 맞은편 펜스 뒤와 양옆에 앉아 있고, 좋은 포인트가 나면 들썩인다(cheerCrowd)
    const crowdTex = this.canvasTex(pc);
    this.crowds = [];
    for (const [x, y, z, w, h] of [[5.5, 0.85, -21, 9, 1.7], [-2.6, 0.8, -21.4, 6.5, 1.5], [-12.8, 0.8, -8.5, 6, 1.3], [12.8, 0.8, -7.5, 6, 1.3]]) {
      const crowd = new THREE.Sprite(new THREE.SpriteMaterial({ map: crowdTex, transparent: true }));
      crowd.scale.set(w, h, 1); crowd.position.set(x, y, z); sur.add(crowd);
      this.crowds.push({ sp: crowd, y, ph: this.crowds.length * 1.7 });
    }
  }
  // 관중이 들썩인다. k: 크기(0.5 작게, 1 보통, 1.5 크게)
  cheerCrowd(k = 1) { this.crowdAmp = Math.max(this.crowdAmp, k); }

  // players: [{look, facing, name}] ×4 (0,1 = 주인공 팀, 화면 아래쪽)
  async setPlayers(players) {
    // 그림을 다 불러온 뒤에 한꺼번에 넣는다. 도중에 넣으면 그리기 루프가 빈 자리를 읽는다.
    const list = [];
    for (let i = 0; i < 4; i++) {
      const info = players[i];
      const frames = await sdFrames(info.charId || `npc${i}`, info.look, i < 2 ? 'back' : 'front');
      const tex = {};
      for (const [k, cnv] of Object.entries(frames)) { tex[k] = this.canvasTex(cnv); tex[k].userData.trim = cnv.trim; }
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
      const acc = info.acc || ACC;
      list.push({ acc, dec: acc * 1.5, sp, tex, shadow, emote, base: k, x: x0, z: z0, tx: x0, tz: z0, speed: RUN_SPEED, vel: 0, brake: true, onArrive: null, sq: 0, crouch: 0, stride: 0, hop: 0, lean: 0, kick: 0, pose: 'ready', poseUntil: 0, emoteUntil: 0 });
    }
    this.players = list;
    for (let i = 0; i < 4; i++) this.setPose(i, 'ready');
    // 치는 동작을 나눈 그림은 경기가 시작된 뒤 불러 와서 들어오는 대로 쓴다(그동안은 예전 그림).
    // 주인공 말고는 조금 작게 올린다(멀리 보이므로, 그래픽 메모리를 아끼려고)
    for (let i = 0; i < 4; i++) {
      const info = players[i];
      sdMotionFrames(info.charId || `npc${i}`, info.look, i < 2 ? 'back' : 'front', i === 0 ? 1 : 0.7).then(fr => {
        if (!this.alive) return;
        const p = list[i];
        for (const [k, cnv] of Object.entries(fr)) { const t = this.canvasTex(cnv); t.userData.trim = cnv.trim; this.renderer.initTexture(t); p.tex[k] = t; }
        if (Object.keys(fr).length) p.motion = true;
      });
    }
    this.emoteTex = {};
    for (const k of ['sweat', 'fire', 'cloud', 'heart', 'bang']) this.emoteTex[k] = this.canvasTex(emoteCanvas(k));
    // 주인공 표시 링
    this.myRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 28), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, depthWrite: false }));
    this.myRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.myRing);
    this.placeAll();
    // 3D 선수(시험): 뒤에서 불러와 준비되면 그림 선수 대신 보인다. 못 불러오면 그림 선수 그대로
    if (this.p3dWant ?? p3dPref()) this.enable3D(true);
  }
  // 3D 선수 켜고 끄기. 켜면 처음 한 번 모델을 불러온다(그동안은 그림 선수)
  // 상태(p3dState): loading 불러오는 중, ready 보임, fail 못 불러옴, off 끔. 바뀌면 onP3d()로 알린다(버튼 글자)
  enable3D(on) {
    this.p3dOn = !!on;
    if (on && !this.p3d) {
      const P = this.p3d = new Players3D(this);
      this.p3dState = 'loading';
      this.p3dLoad = P.load().catch(e => { console.warn('3D 선수', e); return false; }).then(ok => {
        if (this.p3d === P) { if (!ok) { this.p3d = null; this.p3dOn = false; this.p3dState = 'fail'; } else this.p3dState = this.p3dOn ? 'ready' : 'off'; }
        if (this.alive) { this.placeAll(); this.onP3d?.(); }
        return ok;
      });
    } else this.p3dState = !on ? 'off' : this.p3d?.ready ? 'ready' : 'loading';
    this.p3d?.setVisible?.(this.p3dOn);
    this.placeAll();
    this.onP3d?.();
  }
  get show3d() { return !!(this.p3dOn && this.p3d?.ready); }

  // 선수 전용 해: 선수 넷을 담는 좁은 범위로 맞춘다(해 방향은 경기장 해와 같다)
  fitPlayerShadow(on) {
    const L = this.pSun; if (!L) return;
    L.castShadow = !!on; if (!on) return;
    const pts = this.p3d.list.map(c => c.rp).filter(Boolean); if (!pts.length) return;
    let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
    let r = 0; for (const [x, z] of pts) r = Math.max(r, Math.hypot(x - cx, z - cz));
    r += 2.2;
    L.target.position.set(cx, 0, cz); L.position.set(cx, 0, cz).addScaledVector(this.sunDir, 40);
    L.target.updateMatrixWorld(); L.updateMatrixWorld();
    const cam = L.shadow.camera; Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 20, far: 60 }); cam.updateProjectionMatrix();
  }

  placeAll() {
    const s3 = this.show3d;
    // 3D 선수일 때는 그림자·발밑 고리·감정 표시를 3D 몸 자리에(그림 선수 자리와 최대 1m 어긋난다)
    const at = i => (s3 && this.p3d.list[i]?.rp) || [this.players[i].x, this.players[i].z];
    for (const [pi, p] of this.players.entries()) {
      p.sp.visible = !s3;
      // 뛸 때 위아래로 들썩이고 앞으로 기운다. 스윙 순간에는 몸이 돌아간다.
      const y = Math.abs(Math.sin(p.stride)) * 0.14 + p.hop;
      p.sp.position.set(p.x, y, p.z);
      // 그림은 빈 곳을 잘라 올렸으므로(trim) 잘린 크기만큼만 키운다
      if (p.base) p.sp.scale.set(p.base * (p.trim?.uw ?? 1) * (1 + p.sq * 0.5 + p.crouch * 0.03), p.base * (p.trim?.vh ?? 1) * (1 - p.sq - p.crouch * 0.07), 1);
      p.sp.material.rotation = p.lean + p.kick;
      const [ax, az] = at(pi);
      p.shadow.position.set(ax, 0.012, az); p.shadow.visible = !s3;   // 3D 선수는 해 방향 그림자(선수 전용 해)
      p.emote.position.set(ax, 2.35 + y, az);
    }
    { const [ax, az] = at(0); this.myRing.position.set(ax, 0.014, az); }
    for (let i = 0; i < 4; i++) { const a = this.auras?.[i]; if (a) { const [ax, az] = at(i); a.position.set(ax, 0.016, az); } }
    // 1인칭에서는 주인공이 카메라 자리에 있으므로 그림과 발밑 표시를 숨긴다
    const me = this.players[0], hide = !!this.fpv;
    me.sp.visible = !hide && !s3; me.shadow.visible = !hide && !s3; this.myRing.visible = !hide;
    this.fitPlayerShadow(s3);
    if (hide) me.emote.visible = false;
    // 어깨 너머 시점에서는 주인공 머리 위 표시가 카메라 바로 앞이라 너무 크다. 작게, 머리 옆으로
    const near = this.view3 === 'tps';
    me.emote.scale.set(near ? 0.28 : 0.7, near ? 0.28 : 0.7, 1);
    if (near) me.emote.position.set(me.x - 0.3 * (this.tpsSide || 1), 2.05, me.z);
    if (this.auras?.[0]) this.auras[0].visible = !hide;
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
    // 카메라 바로 앞(1인칭에서 내가 친 공)이면 화면을 덮지 않게 작게
    const near = clamp(this.camera.position.distanceTo(sp.position) / 3, 0.25, 1);
    this.pops.push({ kind: 'flash', sp, t: 0, life: 0.2, size: clamp(0.5 + v * 0.04, 0.7, 1.7) * near });
  }

  // 그 그림이 없으면 비슷한 그림으로(fallbackPose)
  texOf(p, pose) { let k = pose; for (let n = 0; n < 4 && !p.tex[k]; n++) k = fallbackPose(k); return p.tex[k] || p.tex.ready; }
  setPose(i, pose, ms = 0, keepSeq = false) {
    const p = this.players[i], t = this.texOf(p, pose), tr = t.userData.trim;
    p.pose = pose; p.sp.material.map = t; p.sp.material.needsUpdate = true;
    // 잘린 그림: 발밑(원래 칸의 가운데 아래 2%)이 늘 같은 자리에 오게
    p.trim = tr || null;
    if (tr) p.sp.center.set((tr.cx - tr.u0) / tr.uw, (0.02 - tr.v0) / tr.vh); else p.sp.center.set(0.5, 0.02);
    p.poseUntil = ms ? performance.now() + ms / this.speed : 0;
    if (!keepSeq) p.seq = null;
  }
  // 동작을 차례로 보여 준다: [[그림, ms], ...]. 끝나면 준비 자세
  playPoses(i, seq) { const [f, ...rest] = seq; this.setPose(i, f[0], f[1]); this.players[i].seq = rest; }
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
  splitStep(i) { const p = this.players[i]; p.hop = 0.2; p.crouch = 0; p.splitting = true; this.setPose(i, 'split', 260); }
  // 닿지 못한 공에 몸을 던진다
  lunge(i, toward) {
    const p = this.players[i], right = (i < 2 ? 1 : -1) * (toward[0] - p.x) >= 0;
    if (this.show3d) this.p3d.schedule(i, right ? 'fh_drive' : 'bh_drive', right ? 'fh' : 'bh', 0.14, new THREE.Vector3(toward[0], 0.6, toward[1]), null, { dive: true });
    this.setPose(i, right ? 'hitfh' : 'hitbh', 700);
    p.kick = (i < 2 ? 1 : -1) * (right ? 0.5 : -0.5) * (p.motion ? 0.6 : 1);
    p.tx = p.x + Math.sign(toward[0] - p.x) * 0.35; p.tz = p.z; p.speed = 3;
  }

  wait(sec) { return new Promise(res => this.tweens.push({ t: 0, dur: sec, step: () => { }, done: res })); }
  // 공 시간으로 sec초 뒤에 할 일
  later(sec, fn) { if (sec <= 0.001) { fn(); return; } this.tweens.push({ t: 0, dur: sec, step: () => { }, done: () => { if (this.alive) fn(); } }); }

  // 공 비행: 실제 물리로 푼 궤적(js/ball.js)을 그대로 그린다. 시간은 엔진과 같다
  // opt: { onBounce(), onNet([x,y,z]), cutAt: 이 시각에 멈춘다 }
  flyArc(arc, opt = {}) {
    this.ball.visible = true; this.ballShadow.visible = true;
    this.trailPts = [];
    // 꼬리 색으로 회전을 보여 준다: 탑스핀 주황, 백스핀(슬라이스·드롭) 하늘색, 회전이 적으면 흰색
    const rpm = arc.rpm || 0;
    this.trail.material.color.setHex(rpm > 600 ? 0xffb07a : rpm < -600 ? 0x9fd8ff : 0xffffff);
    const v = arc.kmh / 4.6;
    const tail = Math.round(clamp(2 + v * 0.45, 6, 15));   // 빠른 공은 꼬리가 길다
    this.trail.material.opacity = clamp(0.3 + v * 0.016, 0.4, 0.75);
    const end = opt.cutAt ? Math.min(arc.dur, opt.cutAt) : arc.dur;
    this.rollId = (this.rollId || 0) + 1;
    return new Promise(res => {
      let bounced = false, netted = false;
      this.tweens.push({
        t: 0, dur: end,
        step: k => {
          const t = k * end;
          if (opt.onBounce && !bounced && t >= arc.t1 - 1e-4) { bounced = true; opt.onBounce(); }
          if (opt.onNet && !netted && arc.tn > 0 && t > arc.tn) { netted = true; const [nx, nz, ny] = arc.at(arc.tn); opt.onNet([nx, ny, nz]); }
          const [x, z, y] = arc.at(t);
          this.ball.position.set(x, Math.max(0.11, y), z);
          this.ballShadow.position.set(x, 0.013, z);
          this.ballShadow.material.opacity = Math.max(0.12, 0.38 - y * 0.04);
          this.trailPts.push(new THREE.Vector3(x, Math.max(0.11, y), z));
          if (this.trailPts.length > tail) this.trailPts.shift();
          this.trail.geometry.setFromPoints(this.trailPts);
        },
        done: () => res({ arc, end }),
      });
    });
  }

  // 떨어진 공은 그 자리에 멈추지 않는다. 튀고 구르다 펜스에 막힌다(포인트가 끝나 공이 사라지거나 다음 공을 치면 멈춘다)
  rollOn(fl, maxDur = 1.6) {
    if (!fl?.arc?.end) return;
    const st = Float64Array.from(fl.arc.end), surf = this.surface;
    const id = this.rollId = (this.rollId || 0) + 1;
    let last = 0;
    this.tweens.push({
      t: 0, dur: maxDur, done: () => { },
      step: k => {
        if (id !== this.rollId || !this.ball.visible) return;
        const t = k * maxDur;
        let dt = t - last; last = t;
        while (dt > 1e-6) { const h = Math.min(dt, 1 / 120); dt -= h; stepFree(st, h, surf); }
        const [x, y, z] = st;
        this.ball.position.set(x, Math.max(0.11, y), z);
        this.ballShadow.position.set(x, 0.013, z);
        this.trailPts.push(new THREE.Vector3(x, Math.max(0.11, y), z));
        if (this.trailPts.length > 6) this.trailPts.shift();
        this.trail.geometry.setFromPoints(this.trailPts);
      },
    });
  }

  mark(pt) {
    if (!pt) return;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pt[0], 0.015, pt[1]);
    this.scene.add(m);
    this.fx.push({ obj: m, life: 1.2 });
  }

  // 시점(중계 카메라는 늘 우리 코트 뒤쪽에 있다. 우리 팀 그림이 뒷모습이라서):
  // main(중계, 랠리가 길어질수록 다가감), serveUs(우리 서버 바로 뒤 낮게), serveThem(맞은편 서버를 망원으로 당겨서),
  // push(결정적인 공 쪽으로 다가감). 서브는 당겨 찍다가 치는 순간 중계 자리로 빠진다
  setCamera(mode, cut = false) { this.camMode = mode; if (cut) this.camCut = true; }
  // 3인칭(어깨 너머, 사용자 2026-11-09): 카메라가 주인공 머리 뒤 어깨 위에 붙어 있다(뒤 2.6m, 옆 0.75m, 머리보다 0.55m 위).
  // 시선은 공을 따라간다(공이 아주 가까이 오면 앞쪽도 같이 본다). 카메라는 머리를 축으로 그 시선 방향 뒤에 서므로
  // 주인공은 늘 화면 아래 한쪽 같은 자리에 있다. 포핸드로 칠 공이면 오른쪽 어깨, 백핸드는 왼쪽(tpsSide).
  // 멀미가 나지 않게 고개는 부드럽게(0.22초, 초당 140도까지), 위아래는 덜, 뒤로는 돌아보지 않는다. 몸이 뛰어올라도 카메라는 들썩이지 않는다
  // 우리 공이 네트를 넘어가면 공은 더 볼 필요가 없다. 상대 전위가 튀어나오는지 본다(사용자 2026-11-09).
  // 상대가 둘 다 뒤에 있으면 받을 사람을 본다. 아니면 null(공을 본다)
  watchOpp() {
    if (!this.players || !this.ball.visible || this.curHitTeam !== 0 || this.ball.position.z > -0.3) return null;
    const a = this.players[2], b = this.players[3], net = Math.abs(a.z) <= Math.abs(b.z) ? a : b;
    if (Math.abs(net.z) < 7) return [net.x, net.z];
    const r = this.players[this.curRecv] || (Math.abs(this.ball.position.x - a.x) < Math.abs(this.ball.position.x - b.x) ? a : b);
    return [r.x, r.z];
  }
  tpsCamera(dt) {
    const p = this.players[0], HEAD = 1.65, BACK = 2.6, SIDE = 0.75, UP = 0.55;
    // 바라볼 곳: 오는 공은 공을, 우리 공이 네트를 넘어가면 상대 전위(튀어나오는지)를 본다
    let gx = p.x * 0.3, gy = 0.9, gz = -11;
    const away = this.watchOpp();
    if (away) { gx = away[0]; gy = 1.1; gz = away[1]; }
    else if (this.ball.visible) {
      const b = this.ball.position, w = clamp((Math.hypot(b.x - p.x, b.z - p.z) - 1.5) / 3, 0, 1);
      gx = lerp(gx, b.x, w); gy = lerp(gy, b.y, w); gz = lerp(gz, b.z, w);
    }
    const dx = gx - p.x, dz = gz - p.z, hd = Math.max(0.5, Math.hypot(dx, dz));
    // 위로는 조금만 든다(높은 공을 올려다보면 주인공이 화면 아래로 빠진다). 세로 화면이 넓어 높은 공도 대개 화면 안에 있다
    const yawT = clamp(Math.atan2(dx, -dz), -1.2, 1.2), pitchT = clamp(Math.atan2(gy - HEAD, hd) - 0.08, -0.45, 0.06);
    const cut = this.camCut || this.tpsYaw === undefined, k = tc => (cut ? 1 : 1 - Math.exp(-dt / tc)), cap = 2.4 * dt;
    if (cut) { this.tpsYaw = this.tpsAimYaw = yawT; this.tpsPitch = this.tpsAimPitch = pitchT; this.tpsSideCur = this.tpsSide || 1; }
    // 공(볼 곳)이 화면 가운데 근처에 있으면 카메라는 가만히 있다(사용자 2026-11-09: 공을 너무 따라다닌다).
    // 가운데에서 좌우 14도, 위아래 7도를 넘어 나갈 때만 그 가장자리에 걸리도록 고개를 돌린다
    const DZY = 0.24, DZP = 0.12, ey = yawT - this.tpsAimYaw, ep = pitchT - this.tpsAimPitch;
    if (Math.abs(ey) > DZY) this.tpsAimYaw = yawT - Math.sign(ey) * DZY;
    if (Math.abs(ep) > DZP) this.tpsAimPitch = pitchT - Math.sign(ep) * DZP;
    this.tpsYaw += cut ? 0 : clamp((this.tpsAimYaw - this.tpsYaw) * k(0.22), -cap, cap);
    this.tpsPitch += cut ? 0 : clamp((this.tpsAimPitch - this.tpsPitch) * k(0.3), -cap, cap);
    this.tpsSideCur += ((this.tpsSide || 1) - this.tpsSideCur) * k(0.3);
    const y = this.tpsYaw, pt = this.tpsPitch, fx = Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = Math.sin(y), sd = SIDE * this.tpsSideCur;
    const t = new THREE.Vector3(clamp(p.x - fx * BACK + rx * sd, -10.4, 10.4), HEAD + UP, clamp(p.z - fz * BACK + rz * sd, -18.9, 20.6));
    const l = new THREE.Vector3(t.x + fx * Math.cos(pt) * 10, t.y + Math.sin(pt) * 10, t.z + fz * Math.cos(pt) * 10);
    return { t, l, zoom: 1 };
  }
  camTarget() {
    const bx = this.ball.visible ? this.ball.position.x : 0, bz = this.ball.visible ? this.ball.position.z : 0;
    const sx = this.camX || 0, sz = this.camZ || 0;
    const t = new THREE.Vector3(), l = new THREE.Vector3();
    let zoom = 1;
    // 1인칭: 주인공 눈높이(1.55m)에서 앞을 본다. 멀미가 나지 않게 눈높이는 들썩이지 않고(뛰거나 뛰어올라도),
    // 공은 고개를 조금만 돌려 따라가며(높은 공도 위로 많이 젖히지 않는다), 가까이 오면 다시 앞을 본다
    if (this.view3 === 'fpv' && this.players) {
      const p = this.players[0];
      t.set(p.x, 1.55, p.z);
      let lx = p.x * 0.35, ly = 1.0, lz = p.z - 12;
      const away = this.watchOpp();
      if (away) { lx = lerp(lx, away[0], 0.6); ly = 1.1; lz = lerp(lz, away[1], 0.6); }
      else if (this.ball.visible) {
        const b = this.ball.position, ahead = p.z - b.z;
        if (ahead > 1.2) { const w = clamp((ahead - 1.2) / 4, 0, 1); lx = lerp(lx, b.x, w * 0.5); ly = lerp(ly, clamp(b.y, 0.5, 2.4), w * 0.3); lz = lerp(lz, b.z, w * 0.35); }
      }
      l.set(lx, ly, lz);
      return { t, l, zoom };
    }
    switch (this.camMode) {
      case 'serveUs': t.set(sx * 0.8, 3.3, sz + 5.6); l.set(sx * 0.3, 1.1, -2.5); zoom = 0.9; break;
      case 'serveThem': t.set(sx * 0.35, 6.4, 15); l.set(sx * 0.85, 1.2, sz); zoom = 0.5; break;
      case 'push': t.copy(this.camBase); t.x += bx * 0.18; t.lerp(new THREE.Vector3(bx, 4.5, bz + 9.5), 0.3); l.set(bx * 0.5, 0.6, bz * 0.5 - 0.7); break;
      default: {
        t.copy(this.camBase); t.x += bx * 0.18; l.copy(this.camLook); l.x = t.x * 0.6;
        const k = ease(clamp(this.tension, 0, 1));
        if (k > 0) { t.lerp(new THREE.Vector3(bx * 0.32, 10.2, 18.2), k * 0.75); l.lerp(new THREE.Vector3(bx * 0.45, 0.5, bz * 0.18 - 1.2), k * 0.6); }
      }
    }
    return { t, l, zoom };
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
      p.stride = 0; p.hop = 0; p.kick = 0; p.lean = 0; p.swing = null;
      p.x = p.tx = x; p.z = p.tz = z;
    }
    this.placeAll();
    if (this.show3d) {
      for (const c of this.p3d.list) { c.sw = null; c.serve = null; }
      if (/^serve/.test(s0.type)) this.p3d.prepServe(s0.h, new THREE.Vector3(s0.from[0], flyOf(s0)?.h0 ?? 2.55, s0.from[1]), [s0.to[0] - s0.from[0], s0.to[1] - s0.from[1]]);
    }
    this.rollId = (this.rollId || 0) + 1;
    this.ball.visible = false; this.ballShadow.visible = false; this.trailPts = []; this.trail.geometry.setFromPoints([]);
    // 서버를 당겨 찍으며 시작한다(중계처럼 끊어서). 치는 순간 중계 자리로 빠진다
    this.tension = 0;
    this.tpsSide = 1;   // 어깨 너머 시점은 오른쪽 어깨에서 시작
    this.camX = s0.from[0]; this.camZ = s0.from[1];
    this.setCamera(s0.h < 2 ? 'serveUs' : 'serveThem', true);
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
    this.rollId = (this.rollId || 0) + 1;
    this.trailPts = []; this.trail.geometry.setFromPoints([]);
    if (this.show3d) {
      const P = this.p3d, contact = new THREE.Vector3(x, flyOf(s)?.h0 ?? 2.55, z), aim = [s.to[0] - x, s.to[1] - z], T = SV_TOSS;
      P.prepServe(s.h, contact, aim);
      P.schedule(s.h, s.type, 'over', T, contact, aim, { from: -T });
      await new Promise(res => this.tweens.push({
        t: 0, dur: T, step: () => { const b = P.tossBall(s.h); if (b) { this.ball.position.copy(b); this.ballShadow.position.set(b.x, 0.013, b.z); } }, done: res,
      }));
      return;
    }
    await new Promise(res => this.tweens.push({
      t: 0, dur: 0.42, step: k => {
        const y = 1.1 + 1.5 * k + 3.6 * k * (1 - k), ox = 0.15 * (1 - k);
        this.ball.position.set(x + ox, y, z);
        this.ballShadow.position.set(x + ox, 0.013, z);
      }, done: res,
    }));
  }

  // 끝나는 공(위너·아웃·에이스): 받는 쪽은 엔진이 정한 자리가 아니라 실제 공 길(튀고 굴러가는 데까지)을 보고 쫓아간다.
  // 사용자(2026-11-09): 나가는지 확실하지 않으면 멈추지 않는다. 실제처럼.
  // 공 길 위에서 가장 가까이 닿을 수 있는 곳을 찾아 전속력으로 달린다(첫발만큼 늦게 출발, 스피드만큼, 유연성만큼 뻗음: 엔진의 몸 값).
  // 아웃: 둘 중 더 닿을 만한 사람이 쫓는다. 곁을 지나 뒤에 떨어지는 공은 준비하다 보내고(판단), 앞에 떨어지는 공은
  //   확실히 나간 공(0.45m 넘게)이면 떨어지는 것을 보고 멈추고, 아슬아슬하면 공 옆까지 끝까지 쫓는다.
  // 위너: 맞는 사람이 공을 쫓아 전속력으로 달리다 몸을 던진다. 닿을 뻔했으면 그만큼 늦게 읽은 것으로(조금 모자라게).
  //   도저히 못 닿는 공은 몇 걸음 쫓다 선다. 승패와 난수에는 쓰지 않는다
  chasePlan(s, fl) {
    const team = s.h < 2 ? 1 : 0, ids = [team * 2, team * 2 + 1];
    const path = [];
    for (let t = 0.1; t <= fl.dur + 1e-6; t += 1 / 30) { const [x, z, y] = fl.at(t); path.push([t, x, z, y]); }
    if (fl.end) { const st = Float64Array.from(fl.end); let t = fl.dur; for (let k = 0; k < 45; k++) { for (let q = 0; q < 4; q++) stepFree(st, 1 / 120, this.surface); t += 1 / 30; path.push([t, st[0], st[2], st[1]]); } }
    const run = (tau, top, a) => (tau <= 0 ? 0 : tau < top / a ? 0.5 * a * tau * tau : top * tau - top * top / (2 * a));
    const best = j => {
      const m = s.mv?.[j], p = this.players[j], top = m?.top || 3.9, reach = m?.reach || 1.1, react = m?.react ?? 0.22, a = p.acc || ACC;
      let b = null;
      for (const [t, x, z, y] of path) {
        if (y > 2.4 || (t > fl.t1 && (t > fl.t1 + 1.1 || y < 0.1))) continue;   // 너무 높거나, 두 번 튀어 끝난 공(바운드 뒤 1.1초까지만 칠 수 있다)
        if (Math.abs(x) > 10.4 || z < -18.9 || z > 20.4) continue;   // 펜스 너머
        const def = Math.hypot(x - p.x, z - p.z) - reach - run(t - react, top, a);
        if (!b || def < b.def) b = { t, x, z, y, def, top, react, reach };
      }
      return b;
    };
    const plan = {};
    if (s.res === 'out') {
      const c = ids.map(j => [j, best(j)]).filter(([, b]) => b).sort((a, b) => a[1].def - b[1].def);
      if (!c.length) return null;
      const [j, b] = c[0], p = this.players[j], B = s.bounce || s.to;
      const outBy = Math.max(Math.abs(B[0]) - 5.485, Math.abs(B[1]) - 11.885);
      const dx = p.x - b.x, dz = p.z - b.z, dd = Math.hypot(dx, dz) || 1, off = Math.min(0.7, dd);
      const X = [b.x + (dx / dd) * off, b.z + (dz / dd) * off];
      if (b.t < fl.t1 - 0.05 && b.def <= 0.3) plan[j] = { x: X[0], z: X[1], t0: b.react, v: b.top * 0.9, k: 'let', chase: 0, def: b.def };
      else plan[j] = { x: X[0], z: X[1], t0: b.react, v: b.top, k: 'let', chase: 1, def: b.def, stopAt: outBy > 0.45 ? fl.t1 + 0.22 : Math.max(fl.t1 + 0.35, b.t - 0.05) };
      const o = ids.find(i => i !== j), po = this.players[o], d = Math.hypot(b.x - po.x, b.z - po.z) || 1, go = Math.min(d, Math.max(0.6, d * 0.2));
      plan[o] = { x: po.x + ((b.x - po.x) / d) * go, z: po.z + ((b.z - po.z) / d) * go * 0.5, t0: 0.28, v: 3.5, k: 'shift' };
      return plan;
    }
    // 위너: 닿을 가능성이 있는 사람은 모두 공 쪽으로 쫓아가 몸을 던진다(둘 사이로 오는 공은 둘 다 움직인다).
    // - 손이 닿을 만했던 사람: 공 바로 앞(팔 길이 + 조금)까지 가서 몸을 던진다. 이미 그 안에 있어도 한두 걸음은 나간다.
    //   시간이 남으면 잠깐 반대로 쏠렸다가(역동작) 공 쪽으로 계속 움직인다(playShot).
    // - 조금 모자라는 사람: 공이 지나갈 곳으로 전속력으로 달려가 몸을 던진다.
    // - 도저히 못 닿는 공: 가장 가까운 사람이 몇 걸음 쫓다 서고, 다른 사람은 공 쪽으로 조금 돌아선다.
    // 사용자(2026-11-09): 잘 친 공이라도 그쪽으로 살짝 움직이는 느낌은 있어야 한다
    const SHORT = 0.35, c = ids.map(i => [i, best(i)]).filter(([, q]) => q);
    if (!c.length) return null;
    const first = [...c].sort((x, y) => x[1].def - y[1].def)[0][0];
    for (const [j, b] of c) {
      const p = this.players[j], d0 = Math.hypot(b.x - p.x, b.z - p.z) || 1;
      if (b.def < SHORT) {
        const go = Math.max(Math.min(d0 - 0.3, 1.0), d0 - b.reach - SHORT, 0);
        plan[j] = { x: p.x + ((b.x - p.x) / d0) * go, z: p.z + ((b.z - p.z) / d0) * go, t0: b.react, v: b.top, k: 'miss', tLunge: Math.max(b.react + 0.1, b.t - 0.1), pt: [b.x, b.z], def: b.def };
      } else if (b.def <= 3.5) {
        plan[j] = { x: b.x, z: b.z, t0: b.react, v: b.top, k: 'miss', tLunge: Math.max(b.react + 0.1, b.t - 0.1), pt: [b.x, b.z], def: b.def };
      } else if (j === first) {
        const go = Math.min(d0, 1.8);
        plan[j] = { x: p.x + ((b.x - p.x) / d0) * go, z: p.z + ((b.z - p.z) / d0) * go, t0: b.react, v: b.top * 0.85, k: 'miss', giveUp: 1, tLunge: Math.min(b.t, b.react + 0.9), def: b.def };
      } else {
        const go = Math.min(d0, Math.max(0.6, d0 * 0.15));
        plan[j] = { x: p.x + ((b.x - p.x) / d0) * go, z: p.z + ((b.z - p.z) / d0) * go * 0.5, t0: 0.28, v: 3.5, k: 'shift' };
      }
    }
    return plan;
  }

  // 샷 하나 재생. next = 다음 타자의 샷 (다음 샷을 알아야 그 선수가 공 옆에 선다), prev = 이 공을 보낸 샷
  async playShot(s, next, prev) {
    const isServe = s.type === 'serve' || s.type === 'serve2';
    this.curHitTeam = s.h < 2 ? 0 : 1; this.curRecv = next && next.h !== s.h ? next.h : -1;
    const side = (s.h < 2 ? 1 : -1) * (s.to[0] - s.from[0]);
    if (isServe) {
      await this.tossBall(s);
      // 폴트면 3D 서버는 곧바로 세컨 서브 자리로 돌아가 선다(준비 없이 토스하면 앞서 디딘 발이 라인 안에 남는다)
      if (s.res === 'fault' && next && /^serve/.test(next.type) && this.show3d) this.p3d.prepServe(next.h, new THREE.Vector3(next.from[0], flyOf(next)?.h0 ?? 2.55, next.from[1]), [next.to[0] - next.from[0], next.to[1] - next.from[1]]);
      // 치는 순간 당겨 찍던 화면이 중계 자리로 빠진다(에이스면 공 쪽으로)
      this.setCamera(!next && s.res === 'ace' ? 'push' : 'main');
    }
    // 스윙: 타구 순간 몸을 돌리고 잠깐 뒤 준비 자세로. 쭉 뻗어 받은 공이면 몸이 더 기운다
    const hitter = this.players[s.h];
    const stretched = prev?.mv?.[s.h]?.k === 'reach';
    // 받으러 갈 때 정해 둔 동작(swing)이 있으면 임팩트 → 팔로스로, 없으면(발리·스매시·서브) 예전 그림 하나
    const sw = hitter.swing?.type === s.type ? hitter.swing : null;
    hitter.swing = null;
    if (sw) this.playPoses(s.h, [[sw.hit, 90], [sw.follow, 430]]);
    else this.setPose(s.h, poseFor(s.type, side), 380);
    // 몸 전체를 기울이는 것은 동작 그림이 있으면 조금만(그림이 이미 몸을 돌리고 있다)
    hitter.kick = (s.h < 2 ? 1 : -1) * (side < 0 ? -0.22 : 0.22) * (stretched ? 2 : 1) * (hitter.crouch ? 1.4 : 1) * (hitter.motion ? 0.35 : 1);
    if (hitter.crouch) { hitter.crouch = 0; hitter.sq = 0.06; }
    // 스탠스: 뉴트럴은 네트 쪽으로, 크로스는 공을 가로질러 디디고, 세미오픈은 조금, 오픈은 옆으로 버틴다. 달리면서는 그대로 지나간다
    const stance = s.info?.stance, fz = s.h < 2 ? -1 : 1, lx = Math.sign(s.to[0] - s.from[0]) || 1;
    const stepOf = { '뉴트럴': [0, 0.42], '크로스': [0.28 * -lx, 0.32], '세미오픈': [0, 0.18], '오픈': [0.22 * lx, 0] };
    if (stepOf[stance]) { const [sx, sz] = stepOf[stance]; this.runTo(s.h, hitter.x + sx, hitter.z + sz * fz, 0, 2.6); }
    const v = s.v || BALL_V[s.type] || 16;
    // 공은 실제 물리로 푼 궤적으로 간다(js/ball.js). 포인트를 시작할 때 차례로 풀어 둔다
    const fl = flyOf(s) || solveShot(s, s.res === 'fault' || s.res === 'df' ? null : next, /^serve/.test(s.type) ? 2.6 : 1.0, this.surface);
    const dur = fl.dur;
    // 끝나는 공은 바운드 뒤 펜스까지 굴러가는 시간까지 dur에 들어 있다. 몸을 던지는 때와 글자는 엔진 시간(지나가는 때)에 맞춘다
    const tPass = next ? dur : Math.min(dur, fl.T || dur);
    // 줌 펀치: 세게 친 공, 스매시, 끝내는 공은 맞는 순간 화면이 확 당겨졌다 돌아온다
    const ends = !next && ['win', 'ace', 'poach', 'center'].includes(s.res);
    if (s.type === 'smash' || ends) this.punch = Math.max(this.punch, 0.13);
    else if (v >= 13) this.punch = Math.max(this.punch, 0.06);
    const arc = s.res === 'net' || s.res === 'fault' || s.res === 'df' ? null : fl;
    // 끝나는 공(위너·아웃·에이스): 받는 쪽은 실제 공 길을 보고 끝까지 쫓아간다(chasePlan)
    const cp = !next && ['win', 'out', 'ace', 'poach'].includes(s.res) ? this.chasePlan(s, fl) : null;
    // 위너가 맞는 사람 곁을 지나가면 가만히 보내지 않는다. 어떻게든 라켓을 대거나(틱) 몸에 맞는다(퍽). 점수는 그대로 친 쪽 것이다
    // (거의 닿을 뻔한 공만. 멀리 지나가는 공에 라켓을 대려고 사람이 날아가지 않게)
    let touch = null;
    // 라켓·몸에 맞을 사람: 공이 가장 가까이 지나가는 사람(엔진이 정한 사람이 아닐 수도 있다. 공이 곧장 날아온 사람은 몸에 맞기 쉽다)
    let tj = s.victim;
    if (cp) { const near = Object.entries(cp).filter(([, m]) => m.k === 'miss' && m.def < 0.9).sort((x, y) => x[1].def - y[1].def)[0]; tj = near ? +near[0] : -1; }
    if ((s.res === 'win' || s.res === 'poach') && arc && tj >= 0 && (cp?.[tj] || s.mv?.[tj])) {
      const mv = cp?.[tj] || s.mv[tj], q = nearest(arc, [mv.x, mv.z], 2.3, 0.25);
      if (q && q.d < 2.8 && h01([s.from[0] + q.p[0] * 3.1, s.from[1] + q.p[1] * 1.7]) < 0.4) touch = { j: tj, ...q, kind: (s.dir === 'body' && h01([q.p[0] * 5.1, q.p[1] * 2.3]) < 0.5) || ((s.type === 'smash' || s.res === 'poach') && q.d < 1.0) || (cp?.[tj]?.def ?? 0) < -2 ? 'body' : 'frame' };
    }
    {
      if (s.res !== 'fault' && s.res !== 'df') this.flash(s.from[0], fl.h0, s.from[1], v);
      if (s.type === 'smash' || s.res === 'ace') this.shake = Math.max(this.shake, 0.16);
      else if (s.res === 'win' || s.res === 'poach') this.shake = Math.max(this.shake, v >= 13 ? 0.1 : 0.06);
      // 능력치 글자. 1인칭·3인칭에서는 상대 샷에 붙은 상대 글자를 치는 순간이 아니라 공이 닿을 때 띄운다(미리 알려 주지 않게)
      const hold = this.view3 && this.view3 !== 'tv' && s.h >= 2;
      for (const c of s.call || []) { if (c.end || (hold && c.j >= 2)) this.later(Math.max(0, tPass - 0.08), () => this.popCall(c)); else this.popCall(c); }
    }
    // 움직임은 엔진이 능력치로 정한 대로: 첫발만큼 늦게 출발해서 스피드만큼 뛴다(js/rally.js)
    for (let j = 0; j < 4; j++) {
      const m = cp?.[j] ? { ...s.mv?.[j], ...cp[j] } : s.mv?.[j];
      // 상대편은 타구 순간 스텝을 밟는다
      if ((j < 2) !== (s.h < 2)) this.splitStep(j);
      if (!m) continue;
      const p = this.players[j];
      let tx = m.x, tz = m.z, sp = m.v, t0 = m.t0;
      let opt = {}, turnAt = -1;
      // 라켓이나 몸에 맞을 사람은 공이 지나는 곳 바로 옆까지 간다
      if (touch && j === touch.j) {
        const [bx, bz] = touch.p, dx = m.x - bx, dz = m.z - bz, dd = Math.hypot(dx, dz) || 1, off = touch.kind === 'body' ? 0.2 : 0.75;
        tx = bx + dx / dd * off; tz = bz + dz / dd * off;
        sp = Math.max(m.v, cruise(Math.hypot(tx - p.x, tz - p.z), Math.max(0.2, touch.t - 0.05 - m.t0), true, p.acc, p.dec));
      }
      // 나가는 공: 받을 것처럼 공이 지나는 선 옆까지 가서 준비하다가, 지나가기 직전에 라켓을 거두고 한 발 물러선다(판단)
      // 그 사람 앞에 떨어지는 공(옆줄 밖으로 나가는 공, 폴트 서브): 들어왔다면 칠 곳(떨어진 곳 너머)으로 쫓아가다가,
      // 떨어진 것을 보고 달리던 만큼 조금 더 가서 선다. 폴트는 떨어지자마자 제자리로 돌아간다(아래)
      if (m.chase) {
        opt = { brake: false };
        if (s.res !== 'fault') this.later(Math.max(m.t0 + 0.1, m.stopAt ?? fl.t1 + 0.08), () => {
          const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), k = Math.min(d, 0.25 + p.vel * 0.12);
          if (d > 0.01) this.runTo(j, p.x + dx / d * k, p.z + dz / d * k, 0, Math.max(1.2, p.vel), { brake: true });
          p.crouch = 0; this.setPose(j, 'ready', 0);
        });
      }
      if (m.k === 'let' && !m.chase && s.res === 'out' && arc) {
        const q = nearest(arc, [m.x, m.z], 3, 0.2);
        if (q) {
          opt = { brake: true, onArrive: () => { p.crouch = 1; this.setPose(j, Math.abs(p.z) < 7 ? 'volley' : 'ready', 0); } };
          this.later(Math.max(m.t0 + 0.15, q.t - 0.2), () => {
            const ax = p.x - q.p[0], az = p.z - q.p[1], ad = Math.hypot(ax, az) || 1;
            p.crouch = 0; p.onArrive = null; this.setPose(j, 'ready', 0);
            if (q.p[2] > 1.5) p.sq = 0.14;   // 높은 공은 몸을 숙여 피한다
            this.runTo(j, p.x + ax / ad * 0.35, p.z + az / ad * 0.35, 0, 2.2);
          });
        }
      }
      if (next && next.h === j && j !== s.h) {
        // 받을 사람은 공 옆(팔과 라켓 길이만큼)에 선다. 여유(m)가 있으면 그만큼 먼저 도착해 멈춰서 힘을 싣고,
        // 여유가 없거나(포지셔닝이 낮으면) 멀리 뻗는 공이면 달리던 그대로 공과 같이 닿는다
        [tx, tz] = standOf(next.from, next.type, j < 2 ? 0 : 1, [p.x, p.z], m.far || 0);
        const set = (m.m ?? 0.3) >= 0.08 && m.k !== 'reach' && m.k !== 'jam';
        let T = Math.max(0.12, dur - m.t0 - (set ? Math.min(m.m ?? 0.3, 0.45) : 0) - 0.02);
        const D = Math.hypot(tx - p.x, tz - p.z);
        // 쭉 뻗어 받는 공: 공이 느려 시간이 남아도 천천히 걸어가지 않는다. 늦게 읽고(그만큼 늦게 출발해) 힘껏 달려가 겨우 닿는다
        if (m.k === 'reach' && D > 0.5) { const full = runTime(D, m.v, false, p.acc, p.dec) * 1.1; if (T > full) { t0 += T - full; T = full; } }
        sp = Math.min(cruise(D, T, set, p.acc, p.dec), m.top ? m.top * 1.05 : RUN_CAP);   // 그 사람이 그쪽으로 낼 수 있는 최고 속도까지
        // 멈추지 못하는 사람은 공 자리를 지나쳐 계속 달린다(치는 순간에도 움직이고 있다)
        if (!set && D > 0.3) { tx += (tx - p.x) / D * 0.7; tz += (tz - p.z) / D * 0.7; }
        const coil = (j < 2 ? 1 : -1) * (/^bh_/.test(next.type) ? 0.14 : -0.14) * (p.motion ? 0.35 : 1);
        // 치는 동작: 달려가며 유닛턴, 멈춰 서면 그 스탠스의 파워 포지션을 미리 잡아 둔다(사용자 2026-11-09).
        // 멈추지 못하는 사람은 공이 오기 직전에야 파워 포지션(아래 lead)
        const sw = swingOf(next.type, next.info?.stance, wingOf(next.type, j < 2 ? 0 : 1, next.from, [p.x, p.z]));
        p.swing = sw;
        // 스플릿 스텝으로 내려앉은 채 기다리다가(첫발만큼) 움직이기 시작하면 유닛턴. 사이에 준비 자세로 돌아가지 않게
        if (sw) { turnAt = Math.max(t0 + 0.02, 0.22); if (p.pose === 'split') { p.poseUntil = 0; p.seq = null; } }
        opt = { brake: set, onArrive: set ? () => { p.crouch = 1; p.kick = coil; this.setPose(j, sw ? sw.power : prepFor(next.type), 0); } : null };
      }
      const lungeAt = touch && j === touch.j ? Math.max(m.t0 + 0.05, touch.t - 0.12) : m.tLunge ?? Math.max(m.t0 + 0.05, tPass * (m.k === 'confuse' ? 0.55 : 0.8));
      // 위너를 맞는 사람: 공이 느려 시간이 남으면 반대쪽으로 몸이 쏠렸다가(역동작) 늦게 쫓아가 몸을 던진다
      // 역동작은 잠깐(0.3초쯤)만. 그 뒤로는 공 쪽으로 계속 움직이다 몸을 던진다(사용자 2026-11-09: 잘 친 공이라도 그쪽으로 움직이는 느낌이 있어야)
      if (m.k === 'miss') {
        const D = Math.hypot(tx - p.x, tz - p.z), go = lungeAt - 0.05 - runTime(D, m.v, true, p.acc, p.dec);
        if (go - m.t0 > 0.2 && D > 0.3) {
          const wx = (tx - p.x) / D, wz = (tz - p.z) / D, wf = Math.min(0.35, (go - m.t0) * 0.8);
          this.later(m.t0, () => this.runTo(j, p.x - wx * wf, p.z - wz * wf, 0, 2.6));
          t0 = Math.min(go, m.t0 + 0.3);
          sp = Math.min(m.v, cruise(D + wf, Math.max(0.2, lungeAt - 0.05 - t0), true, p.acc, p.dec));
        }
      }
      this.later(t0, () => this.runTo(j, tx, tz, 0, sp, opt));
      if (turnAt >= 0) { const sw = p.swing; this.later(Math.max(turnAt, t0), () => { if (p.swing === sw && !p.crouch) this.setPose(j, sw.turn); }); }
      if (m.k === 'miss' || m.k === 'confuse') {
        const ball = s.bounce || s.to;
        const hitBody = touch && j === touch.j && touch.kind === 'body';
        this.later(lungeAt, () => {
          if (hitBody) { this.setPose(j, 'sad', 700); p.sq = 0.12; }
          else if (m.k === 'miss' && m.giveUp) { const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), k = Math.min(d, 0.3 + p.vel * 0.12); if (d > 0.01) this.runTo(j, p.x + dx / d * k, p.z + dz / d * k, 0, Math.max(1.2, p.vel)); this.setPose(j, 'ready', 0); }
          else if (m.k === 'miss') this.lunge(j, touch && j === touch.j ? touch.p : m.pt || ball);
          else { p.tx = p.x; p.tz = p.z; this.setPose(j, 'ready'); }
        });
      }
    }
    if (arc) for (let j = 0; j < 4; j++) {
      if ((j < 2) === (s.h < 2) || j === next?.h || j === s.victim || s.mv?.[j]?.k === 'let' || cp?.[j]) continue;
      const p = this.players[j], q = nearest(arc, [p.x, p.z], 2.2, 0.2);
      if (!q || q.d < 0.9 || q.d > 2.6) continue;
      const right = (j < 2 ? 1 : -1) * (q.p[0] - p.x) >= 0;
      this.later(Math.max(0.1, q.t - 0.14), () => { this.setPose(j, Math.abs(p.z) < 7 ? 'volley' : right ? 'hitfh' : 'hitbh', 320); p.kick = (j < 2 ? 1 : -1) * (right ? 0.35 : -0.35) * (p.motion ? 0.5 : 1); p.hop = Math.max(p.hop, 0.07); });
    }
    // 나가는 공을 쳐 버렸다(판단 실수)
    if (s.outBall) this.later(Math.max(0, dur - 0.06), () => this.popText(s.to[0], 2.0, s.to[1], '아웃 볼!', 'out'));
    // 어깨 너머 시점: 주인공이 받을 공이면 포핸드는 오른쪽 어깨, 백핸드는 왼쪽 어깨로 넘어간다(머리 위로 치는 공은 그대로)
    if (next && next.h === 0 && next.from) {
      const me = this.players[0], wing = wingOf(next.type, 0, next.from, [me.x, me.z]);
      if (wing !== 'over') this.tpsSide = wing === 'bh' ? -1 : 1;
    }
    // 받을 선수는 공이 닿기 직전에 준비 자세를 잡는다
    if (next && next.h !== undefined && next.h !== s.h) {
      const pv = this.players[next.h];
      const lead = Math.max(0, dur - 0.24);
      this.tweens.push({ t: 0, dur: lead || 0.01, step: () => { }, done: () => { if (pv.crouch) return; const sw = pv.swing?.type === next.type ? pv.swing : null; this.setPose(next.h, sw ? sw.power : prepFor(next.type), 0); pv.kick = (next.h < 2 ? 1 : -1) * (/^bh_/.test(next.type) ? 0.12 : -0.12) * (pv.motion ? 0.35 : 1); } });
    }
    if (this.show3d) {
      const P = this.p3d, c = P.list[s.h];
      if (!isServe && (!c.sw || Math.abs(c.sw.tImpact - P.bt) > 0.2)) P.schedule(s.h, s.type, wingOf(s.type, s.h < 2 ? 0 : 1, s.from, [hitter.x, hitter.z]), 0, new THREE.Vector3(s.from[0], fl.h0, s.from[1]), [s.to[0] - s.from[0], s.to[1] - s.from[1]], { from: -0.3 });
      if (next && next.h !== undefined && next.h !== s.h && s.res === 'in') {
        const e = fl.at(dur), pv = this.players[next.h];
        P.schedule(next.h, next.type, wingOf(next.type, next.h < 2 ? 0 : 1, next.from, [pv.x, pv.z]), dur, new THREE.Vector3(e[0], e[2], e[1]), [next.to[0] - next.from[0], next.to[1] - next.from[1]]);
      }
    }
    if (s.res === 'net') {
      // 네트에 걸린 공은 앞으로 가던 힘을 잃고 떨어져 튄다
      const f = await this.flyArc(fl);
      this.flash(f.arc.at(f.end)[0], 0.6, f.arc.at(f.end)[1], 6);
      this.rollOn(f, 1.0);
      await this.wait(0.35);
    } else {
      const opt = {};
      // 라인에 걸친 위너·에이스, 아슬아슬하게 나간 공
      const B = s.bounce || s.to;
      const cc = closeCall(s);
      if (cc === 'line') opt.onBounce = () => { this.popText(B[0], 0.3, B[1], '라인!', 'line'); this.shake = Math.max(this.shake, 0.08); };
      else if (cc === 'out') opt.onBounce = () => this.popText(B[0], 0.3, B[1], '아슬아슬!', 'out');
      else if (s.res === 'out') opt.onBounce = () => this.popText(B[0], 0.3, B[1], '아웃!', 'out');
      // 넷 코드: 쭉 뻗어 받아야 하는 어려운 공이 가끔 네트 테이프를 스치고 넘어간다(연출만)
      if (this.skims?.has(s)) {
        opt.onNet = ([x, y, z]) => { this.flash(x, y, z, 12); this.popText(x, y + 0.4, z, '넷!', 'net'); this.shake = Math.max(this.shake, 0.05); this.hooks?.onNetCord?.(s); };
      }
      if (!touch) { const f = await this.flyArc(fl, opt); if (!next || s.res === 'fault') this.rollOn(f, s.res === 'fault' ? 0.55 : 1.6); }
      else {
        // 라켓(틱)이나 몸(퍽)에 맞고 튕겨 나간다
        await this.flyArc(fl, { ...opt, cutAt: touch.t });
        s.touched = touch.kind;
        const [x, z, y] = arc.at(touch.t), [ux, uz] = heading(arc, touch.t), r = h01([x * 7.3, z * 3.9]);
        this.flash(x, Math.max(0.4, y), z, 8);
        this.popText(x, Math.max(0.4, y) + 0.5, z, touch.kind === 'body' ? '퍽!' : '틱!', 'net');
        this.shake = Math.max(this.shake, touch.kind === 'body' ? 0.1 : 0.05);
        let to, type, sp2;
        if (touch.kind === 'body') { to = [x + ux * 0.9 + (r - 0.5) * 0.8, z + uz * 0.9]; type = 'dropshot'; sp2 = 3.5; }
        else { const a = (r < 0.5 ? 1 : -1) * (0.9 + r * 0.5), L = 4 + r * 2.5; to = [x + (ux * Math.cos(a) - uz * Math.sin(a)) * L, z + (ux * Math.sin(a) + uz * Math.cos(a)) * L]; type = 'def_lob'; sp2 = 7; }
        const da = dropArc([x, z], Math.max(0.3, y), to, flightTime([x, z], to, null, sp2), type, this.surface);
        this.rollOn(await this.flyArc(da, { onBounce: () => this.mark(to) }));
      }
    }
    if (s.res === 'fault') {
      for (let j = 0; j < 4; j++) if (j !== s.h && s.pos?.[j]) this.runTo(j, s.pos[j][0], s.pos[j][1], 0, 2.4);
      await this.wait(0.6);
      // 폴트 난 공은 사라지고, 세컨 서브는 새 공으로 친다(공이 서버 손으로 순간 이동하지 않게)
      this.rollId = (this.rollId || 0) + 1;
      this.ball.visible = false; this.ballShadow.visible = false; this.trailPts = []; this.trail.geometry.setFromPoints([]);
      await this.wait(0.15);
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
    // 공을 실제 물리로 차례로 풀어 둔다(받은 높이가 다음 샷이 치는 높이). 넷 코드(연출만)도 여기서 정한다:
    // 쭉 뻗어 받아야 하는 어려운 공이 가끔 네트 테이프를 스치고 넘어간다
    if (!flyOf(shots[from])) {
      this.skims = new Set();
      shots.forEach((s, i) => { const nx = shots[i + 1]; if (s.res === 'in' && nx && !/^serve/.test(s.type) && !/lob|moon|drop/.test(s.type) && s.mv?.[nx.h]?.k === 'reach' && Math.random() < 0.08) this.skims.add(s); });
      planPoint(pt, this.surface, this.skims);
    }
    for (let i = from; i < shots.length; i++) {
      if (!this.alive) return;
      const s = shots[i];
      const isServe = s.type === 'serve' || s.type === 'serve2';
      const decisive = i === lastIdx && pt.big && ['win', 'ace', 'poach', 'center'].includes(s.res);
      // 시점: 서브는 서버를 당겨 찍고(치는 순간 빠짐), 랠리가 길어질수록 다가가고, 끝내는 공은 공 쪽으로
      const n = shots.slice(0, i + 1).filter(x => x.res !== 'fault').length;
      let cam = 'main';
      if (isServe) cam = s.h < 2 ? 'serveUs' : 'serveThem';
      else if (i === lastIdx && ['win', 'poach'].includes(s.res)) cam = 'push';
      this.tension = isServe ? 0 : clamp((n - 3) / 7, 0, 1);
      this.camX = s.from[0]; this.camZ = s.from[1];
      if (cam !== this.camMode) this.setCamera(cam, isServe);
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
    this.later(0.3, () => { for (let i = 0; i < 4; i++) { const p = this.players[i]; if (Math.hypot(p.tx - p.x, p.tz - p.z) > 0.1) continue; this.runTo(i, p.x * 0.85, p.z + (i < 2 ? 1 : -1) * 1.1, 0, 1.3); } });
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
          if (p.brake) want = Math.min(want, Math.sqrt(2 * p.dec * Math.max(0, d - 0.02)) + 0.4);
          const braking = want < p.vel - 0.6;
          p.vel += clamp(want - p.vel, -p.dec * pdt, p.acc * pdt);   // 선수마다 가속도(첫발)
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
        if (p.poseUntil && now > p.poseUntil) { p.poseUntil = 0; const nx = p.seq?.shift(); if (nx) this.setPose(i, nx[0], nx[1], true); else this.setPose(i, 'ready'); }
        if (p.emoteUntil && now > p.emoteUntil) { p.emoteUntil = 0; p.emote.visible = false; }
      }
      this.placeAll();
      if (this.show3d) { this.p3d.update(dt); this.p3d.list[0].vrm.scene.visible = !this.fpv; }
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
          // 1인칭에서 내 글자는 화면 아래 가운데(내 머리 위는 카메라 자리라서)
          const mine = this.fpv && q.j === 0;
          const x = mine ? W / 2 : clamp((v.x + 1) / 2 * W, w / 2 + 4, W - w / 2 - 4), y = mine ? this.el.clientHeight * 0.8 : (1 - v.y) / 2 * this.el.clientHeight;
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
          const mine = this.fpv && q.j === 0;
          const x = mine ? this.el.clientWidth / 2 : (v.x + 1) / 2 * this.el.clientWidth;
          const y = (mine ? this.el.clientHeight * 0.8 : (1 - v.y) / 2 * this.el.clientHeight) - Math.min(16, q.t * 24) - q.lift - q.off;
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
    const tpsOn = this.view3 === 'tps' && this.players;
    const { t: target, l: look, zoom } = tpsOn ? this.tpsCamera(dt) : this.camTarget();
    // 1인칭·3인칭은 멀미가 나지 않게 몸을 부드럽게 따라가고(급히 멈추거나 방향을 틀어도 화면은 미끄러지듯), 고개는 더 천천히 돌린다.
    // 줌 펀치와 화면 흔들림은 중계에서만 쓴다
    const tv = !this.view3 || this.view3 === 'tv', ease1 = tc => 1 - Math.exp(-dt / tc);
    const kp = this.camCut || tpsOn ? 1 : this.view3 === 'fpv' ? ease1(0.12) : this.camMode === 'main' ? 0.08 : this.camMode === 'push' ? 0.1 : 0.06;
    this.camera.position.lerp(target, kp);
    this.curLook = this.curLook || look.clone();
    this.curLook.lerp(look, this.camCut || tpsOn ? 1 : this.view3 === 'fpv' ? ease1(0.35) : 0.12);
    // 화각: 당겨 찍는 시점은 좁게, 줌 펀치는 맞는 순간 좁아졌다가 돌아온다(중계만)
    this.fovCur += (zoom - this.fovCur) * (this.camCut ? 1 : 0.09);
    const fov = this.viewFov() * this.fovCur * (1 - (tv ? this.punch : 0));
    if (Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.punch = this.punch > 0.002 ? this.punch * Math.pow(0.004, dt) : 0;
    this.camCut = false;
    this.camera.lookAt(this.curLook);
    // 관중: 좋은 포인트가 나면 들썩인다
    if (this.stadium) {
      this.stadium.update(dt, this.crowdAmp);
      this.crowdAmp = this.crowdAmp > 0.01 ? this.crowdAmp * Math.pow(0.12, dt) : 0;
    } else if (this.crowds) {
      this.crowdT = (this.crowdT || 0) + dt;
      for (const c of this.crowds) c.sp.position.y = c.y + (this.crowdAmp > 0.01 ? Math.max(0, Math.sin(this.crowdT * 17 + c.ph)) * 0.22 * Math.min(1.2, this.crowdAmp) : 0);
      this.crowdAmp = this.crowdAmp > 0.01 ? this.crowdAmp * Math.pow(0.12, dt) : 0;
    }
    // 스매시·에이스·위너 때 화면이 살짝 흔들린다
    let off = null;
    if (this.shake > 0.004) {
      if (tv) { off = new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0); this.camera.position.add(off); }
      this.shake *= Math.pow(0.02, dt);
    } else this.shake = 0;
    // 1인칭·어깨 너머: 카메라 바로 앞에 온 다른 선수(대개 파트너)는 화면을 가리지 않게 반투명하게
    if (this.players) for (let i = 1; i < 4; i++) {
      const q = this.players[i], m = q.sp.material;
      const d = Math.hypot(q.x - this.camera.position.x, q.z - this.camera.position.z);
      const op = tv ? 1 : clamp((d - 1.0) / 1.6, 0.18, 1);
      if (Math.abs(m.opacity - op) > 0.01) { m.transparent = true; m.opacity = op; }
      if (this.show3d) this.p3d.list[i].vrm.scene.visible = op > 0.45;
    }
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    if (off) this.camera.position.sub(off);
  }

  dispose() {
    this.alive = false;
    this.p3d?.dispose?.();
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    for (const tw of this.tweens) tw.done && tw.done();
    this.tweens = [];
    this.scene.traverse(o => { o.geometry?.dispose(); if (o.material) for (const m of [o.material].flat()) { m.map?.dispose(); m.gradientMap?.dispose(); m.dispose(); } });
    for (const p of this.players || []) for (const t of Object.values(p.tex)) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    for (const q of this.pops) q.el?.remove();
  }
}

export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
