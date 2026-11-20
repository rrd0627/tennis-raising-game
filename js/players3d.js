// 경기 중계의 3D 선수(시험, 사용자 2026-11-10: '일단 게임에 적용해볼래').
// VRM 캐릭터(art/char3d/vroid_sample.vrm) 넷에 리그(js/rig3d.js)와 스윙(js/swings.js)을 입힌다.
// 자리와 움직임은 그림 선수(빌보드)가 쓰던 값(p.x, p.z, p.vel, p.hop …)을 그대로 따르고, 치는 때와 공이 맞는 자리는 중계가 미리 알려 준다(schedule).
// 임팩트 순간에는 라켓 가운데가 공에 오도록 몸을 조금 옮기고(뿌리 맞추기) 높이는 IK로 맞춘다. 연출만이고 승패·난수는 그대로다
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { VRMLoaderPlugin } from '../vendor/three-vrm.module.min.js';
import { createRig } from './rig3d.js';
import { SHOTS, VARIANTS, FORMS, FORM_IDS } from './swings.js';
import { loadLoco, locoState, locoUpdate } from './loco3d.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// 그림 선수가 T초 뒤에 있을 자리: 지금 달리는 대로(match3d의 달리기와 같은 규칙) 앞으로 굴려 본다
function spriteAt(p, T) {
  let x = p.x, z = p.z, vel = p.vel || 0; const h = 1 / 60, acc = p.acc || 6, dec = p.dec || 9;
  for (let t = 0; t < T - 1e-6; t += h) {
    const dt = Math.min(h, T - t), dx = p.tx - x, dz = p.tz - z, d = Math.hypot(dx, dz);
    if (!(d > 0.02)) break;
    let want = p.speed || 0; if (p.brake) want = Math.min(want, Math.sqrt(2 * dec * Math.max(0, d - 0.02)) + 0.4);
    vel += clamp(want - vel, -dec * dt, acc * dt);
    const step = Math.min(d, Math.max(0.2, vel) * dt); x += dx / d * step; z += dz / d * step;
  }
  return [x, z];
}
const D = Math.PI / 180;
const WARP_BACK = 0.55;   // 하체를 튼 만큼 상체를 되돌리는 몫
const wrapD = a => ((a % 360) + 540) % 360 - 180;   // 각(도)을 -180~180으로
// 동작이 바뀔 때 뼈를 섞지 않는 곳: 다리와 골반·몸통(이것들은 자세 값에서 섞어 다리 IK가 디딘 발에 맞는다)
const NOFADE = /^(hips|spine|chest|upperChest|(left|right)(UpperLeg|LowerLeg|Foot|Toes))$/;
const K = 1.12;   // 키(그림 선수가 실제보다 크게 보여서 맞춘다)
const FADE = 0.16;   // 동작이 바뀔 때 앞 자세에서 넘어가는 시간(초)
// 기다리는 자세(2026-11-16 개나리 경기 비교: 무릎을 편 채 다리를 벌리고 꼿꼿이 서서 라켓을 어깨 옆에 세워 들었다).
// 실제처럼 무릎을 굽히고 상체를 앞으로, 라켓은 가슴 앞에 두 손으로(왼손은 라켓 목). 네트 앞은 라켓을 조금 더 높이
const READY = {
  readyB: { hip: [0, -0.13, 0, 0], chest: [0, 16, 0], rf: [-0.25, 0.1, -10, 0], lf: [0.25, 0.1, 10, 0], rheel: [0], lheel: [0], rh: [-0.1, 1.0, 0.33], s: [0.2, 0.55, 1], f: [1, 0, -0.2], rp: [-0.6, -1, -0.3], lh: 'throat', lp: [0.7, -1, 0] },
  readyN: { hip: [0, -0.12, 0, 0], chest: [0, 14, 0], rf: [-0.25, 0.1, -10, 0], lf: [0.25, 0.1, 10, 0], rheel: [0], lheel: [0], rh: [-0.08, 1.12, 0.36], s: [0.15, 0.8, 0.7], f: [1, 0, -0.15], rp: [-0.6, -1, -0.3], lh: 'throat', lp: [0.7, -1, 0] },
};
// 스윙 동작(모션캡처)이 임팩트 앞뒤가 아닐 때 무릎을 더 굽힌다(m). 모션캡처 선수는 샷 사이에 거의 서 있고, 발리·스매시는 골반 높이가 그대로라 다리가 펴져 보였다.
// 발리는 임팩트 때도 굽힌다(동호인 전위의 낮은 자세)
const CROUCH = { fh: 0.06, bh: 0.06, fv: 0.1, bv: 0.1, sm: 0.04, fs: 0.06, bs: 0.06 };
// 친 뒤 동작을 이만큼(초)만 쓰고 기다리는 자세로 돌아간다(모션캡처 끝의 라켓을 머리 옆에 세워 든 채 서 있는 부분은 쓰지 않는다)
// 포인트가 끝난 몸짓(2026-11-16: 3D 선수에게는 없었다). 이긴 쪽은 라켓을 든 손을 높이 들고 왼주먹을 쥐어 당기고(파트너와 가까우면 손뼉을 마주치는 것처럼 보인다),
// 실수한 사람은 고개를 숙이고 팔과 라켓을 늘어뜨린다. 그림 선수의 'cheer', 'sad' 자세를 따른다
const GESTURE = {
  cheerP: { hip: [0, -0.05, 0, 0], chest: [0, -4, 0], rf: [-0.2, 0.1, -8, 0], lf: [0.2, 0.1, 8, 0], rheel: [0], lheel: [0], rh: [-0.2, 1.72, 0.18], s: [0, 1, 0.12], f: [1, 0, 0], rp: [-1, -0.2, -0.3], lh: [0.22, 1.18, 0.2], lp: [1, -0.6, 0], lk: [1] },
  sadP: { hip: [0, -0.03, 0, 0], chest: [0, 26, 0], rf: [-0.17, 0.1, -6, 0], lf: [0.17, 0.1, 6, 0], rheel: [0], lheel: [0], rh: [-0.2, 0.74, 0.12], s: [0.1, -1, 0.35], f: [1, 0, 0], rp: [-0.3, -1, 0], lh: [0.17, 0.78, 0.12], lp: [0.4, -1, 0], lk: [0.3] },
};
// 세컨 서브(2026-11-16: 동호인 세컨은 살살 넣는 서브가 많다): 토스는 그대로, 트로피 뒤부터 착지 전까지 손·라켓·몸 돌기를 임팩트 자세 쪽으로 30% 당겨 작고 느긋하게
function softServe(keys) {
  const j = keys.findIndex(k => k.t > 0), a = keys[j - 1], b = keys[j], u = (0 - a.t) / (b.t - a.t);
  const k0 = {}; for (const n of Object.keys(a)) if (Array.isArray(a[n]) && Array.isArray(b[n])) k0[n] = a[n].map((v, i) => v + (b[n][i] - v) * u);
  const nrm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  return keys.map(k => {
    const w = 0.3 * sstep(-0.75, -0.45, k.t) * (1 - sstep(0.5, 0.9, k.t));
    if (w <= 0) return k;
    const o = { ...k }, tw = (n, A) => { if (Array.isArray(k[n]) && k0[n]) o[n] = k[n].map((v, i) => k0[n][i] + (v - k0[n][i]) * (1 - A)); };
    tw('rh', w); tw('chest', w); if (Array.isArray(k.lh)) tw('lh', w * 0.6);
    for (const n of ['s', 'f', 'rpc', 'lpc']) { tw(n, w); if (Array.isArray(o[n])) o[n] = nrm(o[n]); }
    if (Array.isArray(o.s) && Array.isArray(o.f)) { const d = o.f.reduce((x, v, i) => x + v * o.s[i], 0); o.f = nrm(o.f.map((v, i) => v - d * o.s[i])); }
    if (Array.isArray(k.hip) && k0.hip) o.hip = [k.hip[0], k.hip[1], k.hip[2], k0.hip[3] + (k.hip[3] - k0.hip[3]) * (1 - w * 0.8)];
    return o;
  });
}
const TAIL = { fh: 0.72, bh: 0.72, fv: 0.45, bv: 0.45, sm: 0.85, fs: 0.65, bs: 0.65 };
export const SV_TOSS = 1.25;   // 서브: 임팩트 이만큼 전부터 토스(서브 준비 자세도 이 때의 자세. 손이 가장 낮다)
const BASELINE = 11.885, TOE_GAP = 0.1;   // 베이스라인 바깥 끝, 서브 때 앞꿈치(발가락 관절)를 이만큼 뒤에 둔다(발끝 살)
const G = 9.81;
// 점들(2~4개)의 볼록 껍질에서 (x, z)에 가장 가까운 곳. 안에 있으면 그 자리
function hullNearest(x, z, pts) {
  if (pts.length === 1) return pts[0];
  // 껍질(선물 포장)
  let s = 0; for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[s][0] || (pts[i][0] === pts[s][0] && pts[i][1] < pts[s][1])) s = i;
  const H = []; let p = s;
  for (let guard = 0; guard < 8; guard++) {
    H.push(pts[p]); let q = (p + 1) % pts.length;
    for (let r = 0; r < pts.length; r++) { const cr = (pts[q][0] - pts[p][0]) * (pts[r][1] - pts[p][1]) - (pts[q][1] - pts[p][1]) * (pts[r][0] - pts[p][0]); if (cr < 0) q = r; }
    p = q; if (p === s) break;
  }
  const segN = (a, b) => { const ux = b[0] - a[0], uz = b[1] - a[1], uu = ux * ux + uz * uz, t = uu > 1e-9 ? clamp(((x - a[0]) * ux + (z - a[1]) * uz) / uu, 0, 1) : 0; return [a[0] + ux * t, a[1] + uz * t]; };
  if (H.length < 3) { let best = null, bd = 1e9; for (let i = 0; i < H.length; i++) { const q = segN(H[i], H[(i + 1) % H.length]), d = Math.hypot(x - q[0], z - q[1]); if (d < bd) { bd = d; best = q; } } return best; }
  let inside = true, sg = 0;
  for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length], cr = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (Math.abs(cr) < 1e-12) continue; const g = Math.sign(cr); if (!sg) sg = g; else if (g !== sg) { inside = false; break; } }
  if (inside) return [x, z];
  let best = null, bd = 1e9; for (let i = 0; i < H.length; i++) { const q = segN(H[i], H[(i + 1) % H.length]), d = Math.hypot(x - q[0], z - q[1]); if (d < bd) { bd = d; best = q; } }
  return best;
}
// 뛰기 하나: pre 동안 dip만큼 굽혔다가 H만큼 떠서(중력대로, 뜬 시간 air) 내려앉으며 flex만큼 굽히고 hold 동안 편다. wide = 발을 벌리는 양(m)
function jumpOf(split, hop) {
  const J = split ? { split, pre: 0.04, dip: 0.02, H: 0.035, flex: 0.085, hold: 0.42, wide: 0.06 }
    : { split, pre: 0.08, dip: 0.05, H: clamp(hop * 0.4, 0.04, 0.22), flex: 0, hold: 0.3, wide: 0 };
  if (!split) J.flex = 0.03 + J.H * 0.3;
  J.air = 2 * Math.sqrt(2 * J.H / G); J.end = J.pre + J.air + 0.06 + J.hold; J.t = 0;
  return J;
}

// 켜고 끄기(이 기기에 기억). 처음에는 켠다
const PREF = 'tennis.p3d2';   // 2026-11-11: 예전에 꺼 둔 값('tennis.p3d')은 읽지 않는다(모션캡처로 바뀐 3D 선수를 다시 보게)
export function p3dPref() { try { return localStorage.getItem(PREF) !== '0'; } catch { return true; } }
export function setP3dPref(on) { try { localStorage.setItem(PREF, on ? '1' : '0'); } catch { } }

// 모델 주소는 이 모듈 기준(index.html이 붙인 빌드 번호를 같이 붙인다). play.html(한 파일)에서는 못 불러오고 그림 선수를 쓴다
const SRC = (() => { try { const u = new URL('../art/char3d/vroid_sample.vrm', import.meta.url); u.search = new URL(import.meta.url).search; return u.href; } catch { return 'art/char3d/vroid_sample.vrm'; } })();
let pending = null;
// 모델 파일을 미리 받아 둔다(대회 첫 화면에서). 경기 화면에 들어오면 곧 3D 선수가 보이게
export function prefetchP3d() { loadBuf(); loadLoco(); }
function loadBuf() {
  if (!pending) pending = (async () => {
    if (typeof location !== 'undefined' && location.protocol === 'file:') return null;
    const r = await fetch(SRC); if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  })().catch(e => { console.warn('3D 선수 모델을 못 불러왔다. 그림 선수를 쓴다', e); pending = null; return null; });
  return pending;
}
const TEX_KEYS = ['map', 'shadeMultiplyTexture', 'normalMap', 'emissiveMap', 'matcapTexture', 'rimMultiplyTexture', 'outlineWidthMultiplyTexture', 'uvAnimationMaskTexture'];
// 사람마다 머리·윗옷 색(같은 모델이라 색으로 나눈다). 우리 팀은 흰·분홍, 상대는 하늘·남색
const TINT = [
  { hair: 0xffffff, top: 0xffffff }, { hair: 0x6a5a66, top: 0xffc4d8 },
  { hair: 0x8a7060, top: 0xbfe0ff }, { hair: 0x4c4650, top: 0x8fb4ea },
];
// 경기 샷 종류 → 스윙
function clipOf(type, wing) {
  if (type === 'serve' || type === 'serve2') return 'sv';
  if (type === 'smash') return 'sm';
  if (/volley/.test(type) && type !== 'swing_volley') return wing === 'bh' ? 'bv' : 'fv';
  if (/slice|chip_return|dropshot|def_lob/.test(type)) return wing === 'bh' ? 'bs' : 'fs';   // 슬라이스 동작(백핸드는 한 손, 2026-11-16)
  return wing === 'bh' ? 'bh' : 'fh';
}
const meshesOf = v => { const a = []; v.scene.traverse(o => { if (o.isMesh) a.push(o); }); return a; };
const yieldFrame = () => new Promise(r => setTimeout(r, 0));

export class Players3D {
  constructor(view) { this.view = view; this.ready = false; this.list = []; this.bt = 0; this.shots = {}; }

  // 모델 넷을 만들고(텍스처·모양은 하나를 같이 쓴다) 스윙을 미리 준비한다. 못 하면 false(그림 선수 그대로)
  async load() {
    const [buf, locoDB] = await Promise.all([loadBuf(), loadLoco()]);
    if (!buf || !this.view.alive) return false;
    this.locoDB = locoDB;   // 이동 엔진 자료(없으면 예전 걸음)
    const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
    const vrms = [];
    for (let i = 0; i < 4; i++) {
      const g = await loader.parseAsync(buf, '');
      if (!this.view.alive) return false;
      vrms.push(g.userData.vrm);
    }
    const m0 = meshesOf(vrms[0]);
    for (let k = 1; k < 4; k++) meshesOf(vrms[k]).forEach((m, i) => {
      const a = m0[i]; if (!a) return;
      if (a.geometry !== m.geometry && a.geometry.attributes.position.count === m.geometry.attributes.position.count) { m.geometry.dispose(); m.geometry = a.geometry; }
      const ms = [m.material].flat(), as = [a.material].flat();
      ms.forEach((mt, j) => { for (const key of TEX_KEYS) if (mt[key]?.isTexture && as[j]?.[key]?.isTexture && mt[key] !== as[j][key]) { mt[key].dispose(); mt[key] = as[j][key]; } });
    });
    vrms.forEach((vrm, i) => {
      vrm.scene.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = false; o.castShadow = true; o.layers.set(1);   // 그림자: 선수 전용 해(레이어 1)만 그린다(경기장 해 그림자는 한 번만 그려 두므로)
        for (const m of [o.material].flat()) {
          const t = /HAIR/.test(m.name) ? TINT[i].hair : /Tops/.test(m.name) ? TINT[i].top : null;
          if (t != null && m.color) { m.color.multiply(new THREE.Color(t)); if (m.shadeColorFactor) m.shadeColorFactor.multiply(new THREE.Color(t)); }
        }
      });
    });
    // 머리카락(스프링 뼈): 칠 때마다 옆으로 크게 휘날려 눈에 띄었다(2026-11-16). 공기 저항을 늘리고 덜 늘어나게
    for (const v of vrms) for (const j of v.springBoneManager?.joints || []) { const st = j.settings; st.dragForce = Math.max(st.dragForce, 0.62); st.stiffness = st.stiffness * 1.6 + 0.3; }
    const rigs = vrms.map(v => createRig(v));
    // 스윙 준비(몸 크기에만 달려 있으니 한 번 해서 넷이 같이 쓴다). 한 샷씩 쉬어 가며(화면이 멈추지 않게)
    for (const d of SHOTS) { rigs[0].setShot(d); this.shots[d.id] = rigs[0].S; await yieldFrame(); if (!this.view.alive) return false; }
    // 서브 토스: 공은 왼손이 가장 빨리 올라가는 때 손을 떠난다(손이 멈춘 때 놓으면 공이 갑자기 튀어 나간다, 사용자 2026-11-11: 토스가 흔들린다)
    const tossOf = Sv => { const R = rigs[0]; R.useShot(Sv); let best = Sv.toss, bv = -1;
      for (let t = -SV_TOSS + 0.05; t <= Sv.toss; t += 0.01) { const a = R.sample(t, 'lh'), b = R.sample(t + 0.01, 'lh'); if (Array.isArray(a) && Array.isArray(b) && (b[1] - a[1]) > bv) { bv = b[1] - a[1]; best = t; } }
      Sv.tossR = best; };
    tossOf(this.shots.sv);
    // 사람마다 다른 폼(사용자 2026-11-20): 모션캡처의 다른 두 사람(A, B)의 스윙도 준비한다(js/swings.js VARIANTS, FORMS)
    for (const d of Object.values(VARIANTS)) {
      rigs[0].setShot(d); this.shots[d.id] = rigs[0].S; if (/^sv@/.test(d.id)) tossOf(this.shots[d.id]);
      await yieldFrame(); if (!this.view.alive) return false;
    }
    // 기다리는 자세는 손으로 짠 준비 자세(모션캡처 스윙의 첫 자세는 이미 준비 동작 중이라): 뒤에서는 포핸드, 네트 앞에서는 발리 준비
    const POSES = { ...READY, ...GESTURE };
    for (const [rid, sid] of [['readyB', 'fh'], ['readyN', 'fv'], ['cheerP', 'fh'], ['sadP', 'fh']]) {
      const d = SHOTS.find(x => x.id === sid);
      rigs[0].setShot({ ...d, id: rid, keys: [{ t: -1, ...POSES[rid] }, { t: 1, ...POSES[rid] }], bevel: d.handBevel ?? d.bevel, toss: d.handToss ?? d.toss, step: d.handStep ?? d.step, lroll: d.handLroll, rollK: 0, chestPoles: false });
      this.shots[rid] = rigs[0].S; await yieldFrame(); if (!this.view.alive) return false;
    }
    // 세컨 서브 동작(라켓이 몸을 뚫지 않게 하는 고침은 새로 구한다)
    { const d = SHOTS.find(x => x.id === 'sv'); rigs[0].setShot({ ...d, id: 'sv2', keys: softServe(d.keys), cor: null }); this.shots.sv2 = rigs[0].S; this.shots.sv2.tossR = this.shots.sv.tossR; await yieldFrame(); if (!this.view.alive) return false; }
    for (const [fm, f] of Object.entries(FORMS)) {
      const d = f.sv && VARIANTS[f.sv]; if (!d) continue;
      rigs[0].setShot({ ...d, id: 'sv2@' + fm, keys: softServe(d.keys), cor: null }); this.shots['sv2@' + fm] = rigs[0].S; this.shots['sv2@' + fm].tossR = this.shots[f.sv].tossR;
      await yieldFrame(); if (!this.view.alive) return false;
    }
    for (let i = 0; i < 4; i++) {
      const vrm = vrms[i], p = this.view.players[i];
      this.view.scene.add(vrm.scene);
      // 폼: 그 선수가 정해 둔 사람(중계가 이름으로 정해 넘긴다, 없으면 자리마다)
      const form = FORMS[p.form] ? p.form : FORM_IDS[i % FORM_IDS.length];
      this.list.push({ form, vrm, rig: rigs[i], team: i < 2 ? 0 : 1, sw: null, key: '', yaw: i < 2 ? Math.PI : 0, ph: 0, wg: 0, off: V3(), last: null, fade: 0, snap: null, px: p.x, pz: p.z, dir: [0, i < 2 ? -1 : 1], hop0: p.hop, jmp: null, sq: 0, v: [0, 0], rp: null, ft: { right: {}, left: {} }, lastStep: -9, lastSide: null, pv: [0, 0], gait: { on: false, t: 0 }, hipP: null, chestP: null, sep: [0, 0], body: { init: false, x: 0, z: 0, vx: 0, vz: 0 }, tp: [p.x, p.z], tv: [0, 0], acc: [0, 0], ps: [0, 0] });
    }
    this.bones = rigs[0].ALLB;
    // 이동 자료(m) → 리그 단위(골반 높이 비), 경기 세계(m)
    if (this.locoDB) { this.locoK = rigs[0].REST.hips.y / this.locoDB.hipH; this.locoSc = this.locoK * K; for (const c of this.list) c.lk = { left: {}, right: {} }; }
    this.ready = true;
    return true;
  }

  // 그 선수의 폼으로 친 샷(없으면 기본). sv2는 그 사람 서브의 작은 동작
  shotOf(c, id) {
    const f = FORMS[c?.form] || {};
    if (id === 'sv2') return (f.sv && this.shots['sv2@' + c.form]) || this.shots.sv2;
    return (f[id] && this.shots[f[id]]) || this.shots[id];
  }
  // i가 지금부터 dt초 뒤(공 시간)에 type 샷을 친다. contact: 공이 맞는 자리(세계, 없으면 맞추지 않는다), aim: 보내는 쪽 [dx, dz]
  schedule(i, type, wing, dt, contact, aim, opt = {}) {
    const c = this.list[i]; if (!c) return;
    const id = clipOf(type, wing), S = this.shotOf(c, id);
    const lead = opt.from != null ? -opt.from : Math.min(Math.max(dt, 0.25), id === 'sv' ? 1.3 : 0.95);
    if (id !== 'sv') c.serve = null;
    c.sw = { id, t0: this.bt, tImpact: this.bt + dt, tStart: this.bt + dt - lead, contact: contact ? contact.clone() : null, aim, full: !!opt.full, tail: Math.min(S.T1, TAIL[id] ?? 1.0), dive: !!opt.dive, second: type === 'serve2' };
  }
  // 서브: 포인트를 시작할 때부터 서브 준비 자세로 공이 맞을 자리에 맞춰 선다
  prepServe(i, contact, aim) {
    const c = this.list[i]; if (!c) return;
    c.serve = { contact: contact.clone(), aim, at: this.bt };
  }
  // 서브 토스 동안 공 자리(왼손에 있다가 놓으면 맞을 자리로 올라갔다 떨어진다). 없으면 null
  tossBall(i) {
    const c = this.list[i]; if (!c?.sw || c.sw.id !== 'sv' || !c.handW) return null;
    const S = this.shotOf(c, 'sv'), tc = this.bt - c.sw.tImpact;
    const TR = S.tossR ?? S.toss;
    if (tc < TR || !c.handV) return c.handW.clone();
    // 손을 떠날 때는 손 빠르기 그대로, 0.16초에 걸쳐 맞을 자리로 가는 포물선으로 넘어간다(꺾이지 않게)
    if (!c.release) c.release = { p: c.handW.clone(), v: c.handV.clone(), t: tc };
    const R0 = c.release, Q = c.sw.contact, u = tc - R0.t;
    const hand = R0.p.clone().addScaledVector(R0.v, u); hand.y -= 0.5 * G * u * u;
    if (!Q) return hand;
    // 빠르기를 손 빠르기에서 한쪽으로만 부드럽게(Tb초) 바꿔, T초 뒤 맞을 자리 Q에 닿게 한다: 위치 = P + v0·u + dv·K(u) - g·u²/2
    const T = Math.max(0.3, -R0.t), Tb = 0.16, dv = Q.clone().sub(R0.p).addScaledVector(R0.v, -T); dv.y += 0.5 * G * T * T; dv.multiplyScalar(1 / (T - Tb / 2));
    const s = Math.min(1, u / Tb), Ku = u < Tb ? Tb * (s ** 3 - s ** 4 / 2) : u - Tb / 2;
    return hand.addScaledVector(dv, Ku);
  }
  setVisible(on) { for (const c of this.list) c.vrm.scene.visible = on; }

  update(dt) {
    if (!this.ready) return;
    const v = this.view, pdt = dt * v.speed;
    this.bt += pdt;
    // 3D 선수끼리 겹치지 않게(사용자 2026-11-12: 몸이 겹친다): 65cm보다 가까우면 서로 밀어낸다(초속 1.5m까지)
    for (let i = 0; i < 4; i++) {
      const a = this.list[i]; if (!a.rp) continue;
      let px = 0, pz = 0;
      for (let j = 0; j < 4; j++) {
        const b = this.list[j]; if (j === i || !b.rp) continue;
        const dx = a.rp[0] - b.rp[0], dz = a.rp[1] - b.rp[1], d = Math.hypot(dx, dz);
        if (d < 0.65) { const k = (0.65 - d) / 2 / Math.max(d, 0.05); px += dx * k; pz += dz * k; }
      }
      const mx = 1.5 * pdt, L = Math.hypot(px - a.sep[0], pz - a.sep[1]);
      const tx = px === 0 && pz === 0 ? 0 : px, tz = px === 0 && pz === 0 ? 0 : pz;
      const dx2 = tx - a.sep[0], dz2 = tz - a.sep[1], L2 = Math.hypot(dx2, dz2);
      if (L2 > mx) { a.sep[0] += dx2 * mx / L2; a.sep[1] += dz2 * mx / L2; } else { a.sep[0] = tx; a.sep[1] = tz; }
      void L;
    }
    for (let i = 0; i < 4; i++) this.updateOne(i, pdt, dt);
  }

  updateOne(i, pdt, dt) {
    const v = this.view, p = v.players[i], c = this.list[i], R = c.rig, vrm = c.vrm, team = c.team;
    const base = team === 0 ? Math.PI : 0;
    // 지금 할 동작: 스윙 창 안이면 그 스윙, 아니면 준비 자세(네트 앞이면 발리 준비, 서브할 사람은 서브 준비)
    let sw = c.sw;
    // 폴트 뒤 세컨 서브를 미리 준비했으면 그대로. (2026-11-16: 토스 때 준비한 것과 스윙 시작은 같은 때인데 소수 계산으로 스윙 시작이 아주 조금 앞서면
    // 서브가 끝나도 서브 준비 자세로 남아 그 자세 그대로 달렸다(발은 뒤에 두고 몸만 가서 넘어질 자세). 0.05초 넘게 뒤에 준비한 것만 세컨 서브로 본다)
    if (sw && this.bt > sw.tImpact + sw.tail) { if (sw.id === 'sv' && !(c.serve && c.serve.at > sw.tStart + 0.05)) c.serve = null; c.sw = sw = null; c.release = null; }
    const inSw = sw && this.bt >= sw.tStart;
    // 포인트가 끝난 몸짓(그림 선수의 cheer·sad 자세를 따른다)
    const gest = !inSw && !c.serve && !v.cutting && (p.pose === 'cheer' || p.pose === 'sad') ? (p.pose === 'cheer' ? 'cheerP' : 'sadP') : null;
    const id = inSw ? sw.id : c.serve ? 'sv' : gest || (Math.abs(p.z) < 6.5 ? 'readyN' : 'readyB');
    const S = this.shotOf(c, id === 'sv' && inSw && sw.second ? 'sv2' : id);   // 세컨 서브는 작고 느긋한 동작. 선수마다 그 사람의 폼
    const tc = inSw ? clamp(this.bt - sw.tImpact, S.T0, S.T1) : id === 'sv' ? Math.max(S.T0, -SV_TOSS) : S.T0;
    // 이동 엔진(사용자 2026-11-16: 트리플A처럼 갈 곳을 정하고 → 자연스럽게 가고 → 도착하면 다음 동작). 기다리기·움직이기는 모션캡처 걷기·달리기(loco3d.js)로,
    // 칠 때(임팩트 0.3초 전~0.7초 뒤)·서브·포인트가 끝난 몸짓은 예전처럼 그 동작으로. 스윙 앞부분(백스윙)은 위는 스윙, 아래는 이동 엔진으로 겹친다
    const pwPre = inSw && sw.id !== 'sv' ? 1 - sstep(-0.3, -0.12, tc) * (1 - sstep(0.35, 0.7, tc)) : 1;
    const useLoco = !!this.locoDB && id !== 'sv' && !gest && pwPre >= 0.999;
    if (!useLoco && c.lc) { c.lc = null; this.locoFade(c); c.gait.on = false; for (const sd of ['left', 'right']) c.lk[sd] = {}; }
    // 움직임: 그림 선수의 자리를 따라간다. 달리는 쪽(세계)과 빠르기
    const mdx = p.x - c.px, mdz = p.z - c.pz, md = Math.hypot(mdx, mdz); c.px = p.x; c.pz = p.z;
    if (md > 1e-4) c.dir = [mdx / md, mdz / md];
    // 몸(뿌리): 그림 선수 자리(+공에 맞추려고 옮긴 만큼 c.off, 서로 밀어낸 만큼 c.sep)를 목표로 따라가되, 땅을 디딘 발로만 밀어 빨라지거나 느려진다
    // (사용자 2026-11-13: 발과 상관없이 물리적으로 말도 안 되게 움직인다). 두 발이 다 떠 있으면(달리기의 뜬 순간, 뛰기) 가던 대로 간다
    // 친 뒤(c.hold): 임팩트 자리에서 0.1~0.5초에 걸쳐 그림 선수 자리로 풀린다(그 자리에 멈춰 섰다가 한꺼번에 쫓아가면 휙 움직였다)
    const hu = c.hold ? sstep(0.1, 0.5, this.bt - c.hold[2]) : 1;   // 그 임팩트 시각 기준(곧바로 다음 스윙이 시작돼도 이어서 풀린다)
    const tgx = (c.hold ? c.hold[0] + (p.x + c.off.x - c.hold[0]) * hu : p.x + c.off.x) + c.sep[0], tgz = (c.hold ? c.hold[1] + (p.z + c.off.z - c.hold[1]) * hu : p.z + c.off.z) + c.sep[1], B = c.body;
    // 포인트 사이에 자리를 한 번에 옮긴 것(순간이동)은 달린 것이 아니다: 몸과 발을 새 자리에 바로 놓는다
    // 순간이동(사용자 2026-11-13: 없애 줘): 그림 선수가 자리를 한 번에 옮긴 것(포인트 시작, 화면을 끊는 동안)만 몸과 발을 새 자리에 바로 놓는다.
    // 몸이 많이 뒤처진 것은 바로 옮기지 않고 따라잡는다(아래 vcap)
    // 그림 선수 자체가 한 번에 옮겨졌을 때만 순간이동으로 본다(공에 맞추는 이동·친 뒤 풀림 같은 목표의 움직임은 몸이 따라간다)
    const spriteJump = md > Math.max(0.35, pdt * 12);
    const tele = !B.init || spriteJump || (v.cutting && Math.hypot(tgx - B.x, tgz - B.z) > 0.05) || Math.hypot(tgx - B.x, tgz - B.z) > 8;
    if (tele) { Object.assign(B, { init: true, x: tgx, z: tgz, vx: 0, vz: 0 }); c.tv = [0, 0]; c.acc = [0, 0]; c.pv = [0, 0]; c.rp = null; c.ft.left.init = c.ft.right.init = false; c.lc = null; if (c.lk) c.lk = { left: {}, right: {} }; }
    else if (pdt > 0) {
      // 목표가 움직이는 빠르기(목표가 한 번에 바뀐 프레임은 초속 8m까지만 읽는다)
      let ivx = (tgx - c.tp[0]) / pdt, ivz = (tgz - c.tp[1]) / pdt; const il = Math.hypot(ivx, ivz); if (il > 8) { ivx *= 8 / il; ivz *= 8 / il; }
      const k = Math.min(1, pdt * 10); c.tv[0] += (ivx - c.tv[0]) * k; c.tv[1] += (ivz - c.tv[1]) * k;
      // 서버: 기다리는 동안에도 칠 자리를 그대로 따라간다(그 자리는 몸이 서브 방향으로 돌며 조금씩 움직인다. 기다리는 동안 따로 움직이다 토스 때 한 번에 맞추면 30~40cm 순간이동했다). 토스부터는 그 자리 그대로
      if (id === 'sv') Object.assign(B, { x: tgx, z: tgz, vx: inSw ? 0 : c.tv[0], vz: inSw ? 0 : c.tv[1] });
      else if (useLoco) this.locoStep(c, p, B, tgx, tgz, pdt, base, inSw, sw, tc);
      else {
        const air = !!(c.jmp && c.jmp.t >= c.jmp.pre && c.jmp.t < c.jmp.pre + c.jmp.air) || (!!c.ft.left.sw && !!c.ft.right.sw && !c.ft.left.sw.clip && !c.ft.right.sw.clip);
        const gap = Math.hypot(tgx - B.x, tgz - B.z), tr = sw ? this.bt - sw.tImpact : 9;
        // 디딘 발로 낼 수 있는 힘: 선수 가속도(첫발)보다 조금 크게(그림 선수가 이미 그 가속도로 움직이고 공에 맞추는 만큼 더한다). 많이 뒤처지면 조금 더
        const pa = p.acc || 6, hit = sw && sw.id !== 'sv', Tgo = hit ? -tr : 9, lunge = Tgo > 0 && Tgo < 0.4, tg = Math.max(Tgo, 0.06);
        // 칠 공 0.4초 전부터는 임팩트 때 그 자리에 닿게 내딛는다(뻗어 받는 공·늦게 온 발리는 한 발 크게: 초속² 18m, 초속 4~5.5m까지. 모자란 만큼은 팔을 뻗는다 reach). 친 뒤 0.35초는 디딘 발로 세게 멈춘다
        let amax = air ? 0.8 : gap > 1.2 ? Math.max(14, pa * 2.2) : (hit && tr > -0.6 && tr < 0.1) ? Math.max(12, pa * 1.9) : Math.max(8, pa * 1.6);
        if (!air && lunge) amax = Math.max(amax, Math.min(18, 2.2 * gap / (tg * tg)));
        if (!air && hit && tr >= 0 && tr < 0.35) amax = Math.max(amax, 18);
        // 남은 거리에서 멈출 수 있는 빠르기까지만 낸다(지나쳤다 되돌아오며 출렁이면 발이 방향을 바꿔 딛다 다리가 엇갈렸다)
        const ag = Math.max(amax, 9) * 0.8, vr = lunge ? 1 / tg : gap > 1e-4 ? Math.min(gap * 7, Math.sqrt(2 * ag * gap)) / gap : 0;
        const vdx = c.tv[0] + (tgx - B.x) * vr, vdz = c.tv[1] + (tgz - B.z) * vr;
        let ax = (vdx - B.vx) / pdt, az = (vdz - B.vz) / pdt; const al = Math.hypot(ax, az); if (al > amax) { ax *= amax / al; az *= amax / al; }
        B.vx += ax * pdt; B.vz += az * pdt;
        // 사람 빠르기 안에서(사용자 2026-11-13: 최대 속도가 너무 빠르다)
        // 1m 넘게 뒤처지면 그림 선수보다 초속 2m 빨리 따라잡는다(2026-11-16: 이 줄의 묶기가 주석 안에 들어가 있어 그동안 묶지 않았다)
        const tvs = Math.hypot(c.tv[0], c.tv[1]), vcap = lunge ? clamp(tvs + 1.2, 4, 5.5) : gap > 1 ? Math.max(5.5, tvs + 2) : 5.5, vv = Math.hypot(B.vx, B.vz);
        if (vv > vcap) { B.vx *= vcap / vv; B.vz *= vcap / vv; }
        B.x += B.vx * pdt; B.z += B.vz * pdt;
        if (lunge && Tgo < 0.1) { const ex = tgx - B.x, ez = tgz - B.z, el = Math.hypot(ex, ez), m = Math.min(el * Math.min(1, pdt / Tgo) * 0.6, 0.02); if (el > 1e-4) { B.x += ex / el * m; B.z += ez / el * m; } }   // 마지막 0.1초에 남은 차이를 조금씩(한 프레임 2cm까지)   // 마지막 0.1초에 남은 차이를 조금씩(라켓이 공을 지나치지 않게)
        const ka = Math.min(1, pdt * 8); c.acc[0] += (ax - c.acc[0]) * ka; c.acc[1] += (az - c.acc[1]) * ka;
      }
    }
    // 사람 가속도 안에서(사용자 2026-11-19: 뒤로 가는데 말도 안 되는 가속력, 일반적인 속도로). 어느 길(이동 엔진, 칠 때 몸 옮기기, 서브)로 정한 몸이든
    // 마지막에 빠르기의 변화를 묶는다: 앞·옆으로 초속² 7.5m, 몸이 보는 쪽의 뒤로 5.5m, 가던 쪽을 거슬러 멈출 때 9m(칠 공 0.4초 전부터 공 쪽으로 내딛을 때만 11·6·12m), 빠르기는 초속 5.5m까지.
    // (목표가 갑자기 멀어지면 이동 엔진이 몸을 그 거리 안으로 끌어당겨 초속² 35m까지, 칠 공 앞 마지막 한 발은 18m까지 냈다.) 순간이동(포인트 사이)은 빼고
    if (tele || !c.lim || (id === 'sv' && inSw)) c.lim = { x: B.x, z: B.z, vx: id === 'sv' ? B.vx : 0, vz: id === 'sv' ? B.vz : 0 };   // 서브 토스부터는 그 자리 그대로(묶으면 토스 중에 미끄러진다)
    // 이동 엔진은 걸음(모션캡처)이 곧 사람 가속도라 묶지 않는다(묶으면 걸음과 상관없이 몸 자리를 덮어써 다리가 따로 놀았다, 2026-11-20). 따라만 간다
    else if (useLoco && pdt > 0) { c.dL = 0; c.lim = { x: B.x, z: B.z, vx: B.vx, vz: B.vz }; }
    else if (pdt > 0) {
      const L = c.lim; let vx = (B.x - L.x) / pdt, vz = (B.z - L.z) / pdt, dx = vx - L.vx, dz = vz - L.vz; const dl = Math.hypot(dx, dz);
      if (dl > 1e-6) {
        const ux = dx / dl, uz = dz / dl, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), sp = Math.hypot(L.vx, L.vz);
        const brake = sp > 0.3 ? -(ux * L.vx + uz * L.vz) / sp : 0, back = -(ux * fx + uz * fz);
        // 칠 공 0.4초 전부터는 공 쪽으로 한 발 크게 내딛는다(사람도 마지막에는 몸을 던진다): 앞·옆 11, 멈출 때 12, 뒤로는 6까지(뒤로 몸을 던지지는 못한다)
        const tg = sw && sw.id !== 'sv' ? sw.tImpact - this.bt : 9, lunge = tg > -0.1 && tg < 0.4;
        const aF = lunge ? 11 : 7.5, aB = lunge ? 12 : 9, aK = lunge ? 6 : 5.5;
        let am = aF;
        if (brake > 0.5) am = aF + (aB - aF) * (brake - 0.5) / 0.5;   // 멈출 때(가던 쪽을 거스를 때)
        else if (back > 0.5) am = aF + (aK - aF) * (back - 0.5) / 0.5;   // 몸이 보는 쪽의 뒤로 빨라질 때
        const m = am * pdt; if (dl > m) { dx = ux * m; dz = uz * m; }
      }
      vx = L.vx + dx; vz = L.vz + dz; const vl = Math.hypot(vx, vz); if (vl > 5.5) { vx *= 5.5 / vl; vz *= 5.5 / vl; }
      L.x += vx * pdt; L.z += vz * pdt; L.vx = vx; L.vz = vz;
      c.dL = Math.hypot(B.x - L.x, B.z - L.z);   // 잰 값: 가속도 묶기가 옮긴 만큼(m)
      B.x = L.x; B.z = L.z; B.vx = vx; B.vz = vz;
      if (c.lc) { c.lc.x = L.x; c.lc.z = L.z; c.lc.vx = vx; c.lc.vz = vz; }   // 이동 엔진의 뿌리도 같은 자리로
    }
    c.tp = [tgx, tgz];
    c.res = [tgx - B.x, tgz - B.z];   // 몸이 아직 못 간 만큼(임팩트 둘레에는 팔을 뻗어 채운다)
    const rx0 = B.x, rz0 = B.z;
    c.v = [B.vx, B.vz];
    c.rp = [rx0, rz0];
    const spd = Math.hypot(c.v[0], c.v[1]), mv = sstep(0.4, 2.5, spd);
    // 선수가 실제로 달리는 빠르기(그림 선수 자리만. 공에 맞추려고 옮긴 양은 빼야 몸 돌리기와 서로 물고 돌지 않는다)
    if (pdt > 0 && !tele && !spriteJump) { const k = Math.min(1, pdt * 10); c.pv[0] += (mdx / pdt - c.pv[0]) * k; c.pv[1] += (mdz / pdt - c.pv[1]) * k; }
    const tvv = c.v, rspd = Math.hypot(tvv[0], tvv[1]);   // 몸을 돌릴지는 실제 몸 빠르기로
    // 바라보는 쪽: 네트 쪽. 스윙할 때는 보내는 쪽으로 조금(반쯤, 25도까지)
    let yawT = base;
    const aim = inSw ? sw.aim : c.serve?.aim;
    if (aim && Math.hypot(aim[0], aim[1]) > 0.1) { let a = Math.atan2(aim[0], aim[1]) - base; a = Math.atan2(Math.sin(a), Math.cos(a)); yawT = base + clamp(a * 0.4, -15 * D, 15 * D); }   // 보내는 쪽으로 조금만(많이 돌면 공에 맞추려고 몸을 크게 옮긴다)
    // 빨리 옆이나 뒤로 멀리 갈 때는 몸을 가는 쪽으로 돌려 달린다(크로스오버). 뒤로 갈 때(로브)는 오른쪽으로 돌아 옆으로 물러난다. 칠 때가 다가오면 다시 선다
    if (rspd > 1.8 && id !== 'sv') {
      let rel = Math.atan2(tvv[0], tvv[1]) - base; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const off = Math.abs(rel) > 150 * D ? -80 * D : clamp(rel, -80 * D, 80 * D) * sstep(35 * D, 60 * D, Math.abs(rel));
      yawT += off * sstep(2.0, 3.0, rspd) * (inSw ? 1 - sstep(-0.7, -0.35, tc) : 1);
    }
    let dy = yawT - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (!useLoco) c.yaw += dy * (id === 'sv' && inSw ? 1 : Math.min(1, pdt * 8));   // 서브: 바로 그 방향으로(돌면서 공에 맞추려고 몸이 미끄러지지 않게). 이동 엔진이면 그 방향(locoStep)
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    // 뛰기: 그림 선수의 hop은 순간 올라갔다가 곧게 내려오는 값이라(그림에는 괜찮다) 3D에서는 중력대로 다시 그린다(사용자 2026-11-11: 스플릿이 이상하다).
    // 스플릿 스텝은 살짝 굽혔다가 몇 cm 떠서 발을 벌리며 내려앉고 무릎을 굽힌다. 기뻐서 뛰는 것은 줄여서 뛴다
    // 달리는 중(초속 2.5m 넘게)에는 스플릿 스텝으로 뛰지 않는다(달리는 걸음이 이미 뜬다. 뛰면 깡충거리는 것처럼 보였다)
    if (p.hop > c.hop0 + 0.02 && (p.splitting ? spd < 2.5 : p.hop >= 0.12)) c.jmp = jumpOf(!!p.splitting, p.hop);
    c.hop0 = p.hop;
    let jy = 0, jhip = 0, jw = 0;
    if (c.jmp) {
      const J = c.jmp, t = J.t, tl = t - J.pre - J.air;
      if (t < J.pre) jhip = -J.dip * Math.sin(Math.PI * t / J.pre);
      else if (tl < 0) { const u = t - J.pre; jy = 0.5 * G * u * (J.air - u); }
      else jhip = -J.flex * (tl < 0.06 ? sstep(0, 0.06, tl) : 1 - sstep(0.06, 0.06 + J.hold, tl));
      jw = J.wide * sstep(J.pre, J.pre + J.air, t) * (1 - sstep(J.end - 0.3, J.end, t));
      J.t += pdt; if (J.t > J.end) c.jmp = null;
    }
    // 몸이 눌리는 것(멈춰 설 때, 높은 공을 피할 때)도 한 프레임에 꺼지지 않게. 스플릿 착지는 위에서 그린다
    c.sq += ((c.jmp?.split ? 0 : p.sq) - c.sq) * Math.min(1, pdt * 20);
    const jk = 1 - 0.6 * mv;
    // 발놀림(사용자 2026-11-11~12: 걷는 느낌보다 스텝을 쓰는 느낌, 발이 미끄러진다. 발은 땅에 붙이고 IK로, 걷기·달리기·사이드 스텝·크로스 스텝이 자연스럽게).
    // 디딘 발은 언제나 코트 위 한 자리에 붙어 있다. 발이 움직이는 것은 들어서 옮겨 딛는 한 걸음뿐이다(planSteps, footOut).
    // 임팩트 둘레(0.3초 전~0.7초 뒤)와 서브는 동작(모션캡처)의 발을 따르되, 동작의 발이 땅에 있는 동안은 붙여 두고 동작이 발을 들 때만 따라간다
    const pw = inSw ? (sw.id === 'sv' ? 1 - sstep(-SV_TOSS, -SV_TOSS + 0.15, tc) * (1 - sstep(0.4, 0.8, tc)) : 1 - sstep(-0.3, -0.12, tc) * (1 - sstep(0.35, 0.7, tc))) : 1;
    // 서브: 임팩트까지 앞꿈치는 베이스라인 뒤에(사용자 2026-11-11: 서브할 때 라인 밟지 않게)
    const svSide = id === 'sv' && (c.serve || sw)?.contact ? Math.sign((c.serve || sw).contact.z) : 0, toeK = svSide ? 1 - sstep(0, 0.1, tc) : 0;
    const toIn = sw ? sw.tImpact - this.bt : 9, adj = !!sw && sw.id !== 'sv' && toIn > 0.25 && toIn < 0.9 && spd < 0.6;
    const ctx = { rx: rx0, rz: rz0, cy, sy, yawD: c.yaw / D, pw, clip: pw < 0.5, adj, air: !!(c.jmp && c.jmp.t >= c.jmp.pre && c.jmp.t < c.jmp.pre + c.jmp.air), airT: c.jmp?.air, spd, bob: 0, pdt };
    if (!useLoco) this.planSteps(c, ctx);
    // 골반: 한 발이 떠 있으면 디딘 발 쪽으로, 둘 다 디디면 두 발 가운데로 무게를 싣는다. 걷기·사이드 스텝은 디딘 다리 위에서 조금 올라가고,
    // 달리기는 디딜 때 눌렸다가 뜰 때 올라간다. 앞으로 내딛는 다리 쪽으로 골반이 조금 돌고 가슴은 반대로 돈다.
    // 몸은 힘을 준 쪽으로 기운다(빨라질 때 앞으로, 멈출 때 뒤로, 옆으로 밀 때 그쪽으로). 스윙(모션캡처) 동안은 동작의 골반을 쓴다
    let gHx = 0, gHz = 0, gYaw = 0, gBob = 0, gChY = 0, gPitch = 0, gRoll = 0;
    {
      const Lf = c.ft.left, Rf = c.ft.right, gw = pw * (c.jmp ? 0.4 : 1);
      if (Lf.init && Rf.init && gw > 0 && !useLoco) {   // 이동 엔진은 모션캡처의 골반·몸 기울기를 그대로 쓴다
        const toR_ = (wx, wz) => { const dx = (wx - rx0) / K, dz = (wz - rz0) / K; return [dx * cy - dz * sy, dx * sy + dz * cy]; };
        const lr = toR_(Lf.x, Lf.z), rr = toR_(Rf.x, Rf.z), one = (!!Lf.sw) !== (!!Rf.sw), both = !!Lf.sw && !!Rf.sw;
        const sup = one ? (Lf.sw ? rr : lr) : [(lr[0] + rr[0]) / 2, (lr[1] + rr[1]) / 2];
        const W = Lf.sw || Rf.sw, u = W ? Math.min(1, W.t / W.T) : 0, sdv = Lf.sw && !Rf.sw ? 1 : Rf.sw && !Lf.sw ? -1 : 0;
        const vfz = c.v[0] * sy + c.v[1] * cy, run = c.gait.on && c.gait.mode === 'run';
        const tHx = clamp(sup[0] * 0.4, -0.08, 0.08), tHz = clamp(sup[1] * 0.25, -0.05, 0.05);
        c.ps[0] += (tHx - c.ps[0]) * Math.min(1, pdt * 10); c.ps[1] += (tHz - c.ps[1]) * Math.min(1, pdt * 10);
        gHx = c.ps[0] * gw; gHz = c.ps[1] * gw;
        gBob = (run ? (both ? 0.02 : one ? -0.022 * Math.sin(Math.PI * u) : 0) : one ? 0.012 * Math.sin(Math.PI * u) : 0) * gw;
        gYaw = -sdv * 7 * Math.sin(Math.PI * u) * clamp(Math.abs(vfz) / 3, 0, 1) * gw; gChY = -gYaw * 0.6;
        const afz = c.acc[0] * sy + c.acc[1] * cy, afx = c.acc[0] * cy - c.acc[1] * sy;   // 몸 기준 힘(+z 앞, +x 왼쪽)
        gPitch = clamp(afz * 1.1, -6, 9) * gw; gRoll = -clamp(afx * 0.9, -7, 7) * gw;
      }
    }
    // 몸이 공에 맞출 자리까지 다 못 갔으면 그만큼 팔을 뻗는다(손 자리만, 30cm까지. 리그가 임팩트 둘레에서만 쓴다)
    // 팔을 뻗어도 못 채운 만큼(세계): 중계가 마지막 순간 공을 그만큼 라켓 쪽으로 당겨 그린다(match3d flyArc의 snap)
    c.miss = [0, 0];
    if (inSw && sw.id !== 'sv' && c.res) { const rl = Math.hypot(c.res[0], c.res[1]), k = rl > 0.4 ? Math.min(rl - 0.4, 0.6) / rl : 0; c.miss = [c.res[0] * k, c.res[1] * k]; }
    let reach = null;
    if (inSw && sw.id !== 'sv' && c.res) { const dx = c.res[0] / K, dz = c.res[1] / K; reach = V3(dx * cy - dz * sy, 0, dx * sy + dz * cy); if (reach.length() > 0.4) reach.setLength(0.4); }   // 사람 가속도로 다 못 간 만큼 팔을 40cm까지
    // 스윙 동작 중 무릎 굽히기(CROUCH): 땅·발리는 임팩트 둘레를 빼고, 발리는 늘
    let crouch = 0;
    if (inSw && CROUCH[id]) { const core = /^[fb]v$/.test(id) ? 0 : sstep(-0.42, -0.15, tc) * (1 - sstep(0.2, 0.55, tc)); crouch = CROUCH[id] * (1 - core); }
    const lp = useLoco ? c.lp : null, LK = this.locoK, idleW = 1 - sstep(0.4, 1.4, spd);
    const over = lp ? {
      // 이동 엔진: 아래(골반·발)는 모션캡처 걷기·달리기, 위(손·라켓)는 준비 자세나 스윙. 서 있을 때는 테니스 준비 자세처럼 조금 낮게
      reach,
      foot: (side, f) => this.locoFoot(c, side, lp, ctx, jw),
      heel: side => Math.max(0, lp[side[0] + 'he'] || 0),
      hip: h => {
        // 스윙 앞부분(백스윙)을 달리며 할 때: 스윙의 골반 돌기는 대부분 가슴(어깨)으로 옮긴다(다리는 달리는데 골반만 90도 넘게 돌아 꼬였다). 임팩트 0.3초 전에 가까워질수록 스윙대로
        const hk = inSw ? 0.3 + 0.7 * sstep(-0.65, -0.3, tc) : 1; c.hipMove = h[3] * (1 - hk);
        h = [lp.hx * LK, h[1] * (0.45 + 0.55 * idleW) + (lp.hy - this.locoDB.hipH) * LK - c.sq * 0.6 + jhip * jk, lp.hz * LK, h[3] * hk + lp.hyaw];
        if (c.fade > 0 && c.snapHip) { const u = sstep(0, 1, 1 - c.fade / FADE); h = h.map((v, k) => k === 3 ? c.snapHip[3] + wrapD(v - c.snapHip[3]) * u : c.snapHip[k] + (v - c.snapHip[k]) * u); }
        c.hipP = h; return h;
      },
      chest: ch => {
        // 하체를 가는 쪽으로 튼 만큼(c.warp) 상체는 55% 되돌려 네트 쪽에 남긴다(어깨는 45%만 따라 돌아 몸이 살짝 비틀린다, orientation warping)
        ch = [ch[0] + 0.5 * lp.cy + (c.hipMove || 0) - clamp(wrapD((c.yaw - (c.faceBase ?? c.yaw)) / D), -80, 80) * WARP_BACK, ch[1] + 0.5 * (lp.cp - this.locoDB.cp0), ch[2] + 0.5 * lp.cr];
        if (c.fade > 0 && c.snapChest) { const u = sstep(0, 1, 1 - c.fade / FADE); ch = ch.map((v, k) => c.snapChest[k] + (v - c.snapChest[k]) * u); }
        c.chestP = ch; return ch;
      },
    } : {
      reach,
      foot: (side, f) => {
        if (jw) { const sd = side === 'right' ? -1 : 1; f = [f[0] + sd * jw, f[1], f[2] + sd * jw * 120, f[3]]; }   // 스플릿 착지: 발을 벌리고 발끝을 조금 밖으로
        const o = this.footOut(c, side, f, ctx);
        if (toeK > 0) {
          const wz = rz0 + K * (-o[0] * sy + o[1] * cy), over_ = BASELINE + TOE_GAP - wz * svSide, F = c.ft[side];
          if (over_ > 0.005) {
            if (!ctx.clip && !F.sw && !F.air) {
              // 서브 준비 중 라인 안에 디딘 발은 라인 뒤로 한 걸음 물러나 딛는다(한 프레임에 옮기면 순간이동처럼 보였다)
              F.sw = { t: 0, T: Math.max(0.18, over_ / 2), fx: F.x, fz: F.z, fy: F.y, tx: F.x, tz: F.z + (over_ + 0.02) * svSide, ty: F.y, h: 0.05 };
            } else if (ctx.clip) {
              // 토스 중: 라인 뒤에 붙여 둔다(디딘 자리도 같이 옮겨 다음 프레임과 어긋나지 않게)
              const dz = over_ * toeK * svSide; o[0] += (-dz * sy) / K; o[1] += (dz * cy) / K; if (!F.sw) F.z += dz;
            }
          }
        }
        return o;
      },
      hip: h => { h = [h[0] + gHx, h[1] - 0.035 * mv + gBob - c.sq * 0.6 + jhip * jk - crouch, h[2] + gHz, h[3] + gYaw]; if (c.fade > 0 && c.snapHip) { const u = sstep(0, 1, 1 - c.fade / FADE); h = h.map((v, k) => k === 3 ? c.snapHip[3] + wrapD(v - c.snapHip[3]) * u : c.snapHip[k] + (v - c.snapHip[k]) * u); } c.hipP = h; return h; },
      chest: ch => { ch = [ch[0] + gChY, ch[1] + 8 * mv * Math.min(1, spd / 5) + gPitch + crouch * 70, ch[2] + gRoll]; if (c.fade > 0 && c.snapChest) { const u = sstep(0, 1, 1 - c.fade / FADE); ch = ch.map((v, k) => c.snapChest[k] + (v - c.snapChest[k]) * u); } c.chestP = ch; return ch; },
    };
    // 균형(사용자 2026-11-16: 중심이 골반 쪽에 있는데 이러면 어떻게 안 넘어지나. 물리적으로 안 되는 자세를 자연스럽게):
    // 지난 프레임에 잰 몸 중심의 어긋남만큼 골반을 디딘 발 쪽으로 옮긴다(c.bal, balance()). 발 자리는 이번 프레임 값을 남긴다
    // 임팩트 앞뒤 0.35초(서브는 토스부터 착지까지)는 골반을 옮기지 않는다(어깨가 같이 옮겨져 라켓이 공을 비켰다)
    { const f0 = over.foot, h0 = over.hip; c.fo = {};
      const wb = inSw ? (sw.id === 'sv' ? 0 : sstep(0.12, 0.35, Math.abs(tc))) : 1;
      over.foot = (side, f) => { const o = f0(side, f); c.fo[side] = o; return o; };
      over.hip = h => { h = h0(h); if (c.bal && wb > 0) { h = [h[0] + c.bal[0] * wb, h[1], h[2] + c.bal[1] * wb, h[3]]; c.hipP = h; } return h; }; }
    // 공 높이는 IK로(리그 기준 높이 차이, 사람 범위 안), 앞뒤·옆은 몸을 옮겨 맞춘다
    const contact = sw && (inSw || sw.id !== 'sv') ? sw.contact : c.serve?.contact, Sc = sw ? this.shotOf(c, sw.id) : S;
    let dl = V3();
    if (contact) dl.y = clamp(contact.y / K - Sc.C0.y, -0.62, 0.38);
    // 뿌리 맞추기: 임팩트 때 라켓 가운데(C0 + dl)가 공에 오는 자리 - 지금 자리. 임팩트 앞뒤로만(서브는 처음부터 끝까지)
    let w = 0;
    if (contact) {
      if (inSw && sw.id === 'sv') w = 1 - sstep(0.3, 0.9, tc);   // 서브: 처음부터 맞춰 서 있다가 착지 뒤 풀린다
      else if (sw && sw.id !== 'sv') {
        // 칠 공이 정해진 때(상대가 친 때)부터 임팩트 0.22초 전까지 고르게(마지막 0.6초에 몰아서 하면 몸이 사람 가속도를 넘었다, 2026-11-19), 친 뒤에는 풀린다
        const tr = this.bt - sw.tImpact, ts = Math.min(-0.4, sw.t0 - sw.tImpact);
        w = sw.full ? 1 : sstep(ts, -0.22, tr) * (1 - sstep(0.12, 0.55, tr));
      } else w = 1;   // 서브 준비
      // 임팩트 때 바라볼 쪽(네트 쪽 + 보내는 쪽으로 15도까지)으로 잰다. 지금 몸 방향으로 재면 달려가느라 돌아 있는 동안(80도까지) 맞출 자리가 1m 가까이 엉뚱한 쪽으로 커졌다가
      // 몸이 다시 서며 되돌아와, 몸이 사람 가속도를 넘어 쫓아가야 했다(2026-11-19)
      let yI = id === 'sv' ? c.yaw : base; const aI = sw?.aim || c.serve?.aim;
      if (id !== 'sv' && aI && Math.hypot(aI[0], aI[1]) > 0.1) { let a = Math.atan2(aI[0], aI[1]) - base; a = Math.atan2(Math.sin(a), Math.cos(a)); yI = base + clamp(a * 0.4, -15 * D, 15 * D); }
      const lc = Sc.C0.clone().add(dl).multiplyScalar(K), wx = lc.x * Math.cos(yI) + lc.z * Math.sin(yI), wz = -lc.x * Math.sin(yI) + lc.z * Math.cos(yI);
      // 그림 선수가 임팩트 때 있을 자리 기준으로 모자란 만큼만(지금 자리 기준이면 아직 달려갈 거리까지 미리 옮겨 몸이 앞질러 갔다가 뒤처졌다)
      const Tgo = sw && sw.id !== 'sv' ? Math.max(0, sw.tImpact - this.bt) : 0, [qx, qz] = Tgo > 0 ? spriteAt(p, Math.min(Tgo, 1.5)) : [p.x, p.z];
      const need = V3(contact.x - wx - qx, 0, contact.z - wz - qz);
      if (sw?.dive) need.clampLength(0, 0.9); else need.clampLength(0, 1.6);
      c.offT = sw && sw.id !== 'sv' ? need.clone() : null;   // 임팩트 때 옮겨 있어야 할 만큼(이동 엔진이 갈 길에 미리 넣는다)
      if (id === 'sv') c.off.lerp(need.multiplyScalar(w), inSw || v.cutting ? 1 : Math.min(1, pdt * 5));   // 화면을 끊는 동안 서버는 칠 자리에 바로 선다(토스할 때 미끄러지지 않게)
      else {
        // 몸 옮기는 빠르기는 초속 3m까지(튀지 않게). 공이 곧 오는데(발리) 못 닿을 만큼 남았으면 임팩트 0.05초 전까지 닿게 그만큼만 빠르게
        const tgt = need.multiplyScalar(w), d = tgt.sub(c.off), left = sw ? sw.tImpact - 0.05 - this.bt : 1;
        const mx = clamp(left > 0.08 && w > 0.5 ? d.length() / left : 0, 3, 6) * pdt;
        if (d.length() > mx) d.setLength(mx); c.off.add(d);
      }   // 서브: 준비하는 동안 걸어가 서고, 토스부터는 그 자리 그대로
    } else { c.offT = null; const L = c.off.length(), mx = 1.3 * pdt; if (L > mx) c.off.multiplyScalar(1 - mx / L); else c.off.set(0, 0, 0); }   // 친 뒤 그림 선수 자리로 돌아갈 때는 초속 1.3m까지(그림 선수가 뛰는 빠르기에 더해져 휙 움직였다)
    // 친 뒤 팔로스로(동작의 발을 따르는 동안)에는 임팩트 자리에서 천천히 풀린다(위 hu). 디딘 발과 몸이 벌어지지 않게(사용자 2026-11-12: 발이 미끄러진다)
    if (inSw && sw.id !== 'sv' && this.bt >= sw.tImpact && pw < 0.5) { if (!c.hold || c.hold[2] !== sw.tImpact) c.hold = [p.x + c.off.x, p.z + c.off.z, sw.tImpact]; }
    else if (c.hold && this.bt - c.hold[2] > 0.5) c.hold = null;
    // 자세는 리그 기준(제자리, 돌리지 않음)으로 만들고 나서 코트 위로 옮긴다
    const key = id + (inSw ? ':' + sw.tImpact.toFixed(3) : ':idle');
    if (key !== c.key) { if (c.last && !(c.key === 'sv:idle' && id === 'sv')) { c.snap = c.last; c.fade = FADE; c.snapHip = c.hipP; c.snapChest = c.chestP; } c.key = key; if (!inSw) c.release = null; }   // 서브 준비 → 토스는 같은 자세라 섞지 않는다(섞으면 발이 밀린다)
    vrm.scene.position.set(0, 0, 0); vrm.scene.rotation.set(0, 0, 0); vrm.scene.scale.setScalar(1); vrm.scene.updateMatrixWorld(true);
    R.useShot(S);
    R.pose(tc, inSw ? dl : V3(), null, over);
    // 균형 재기: 칠 때(임팩트 둘레)·서브는 골반만 옮기고, 그 밖에는 모자라면 회복 걸음도
    this.balance(c, R, pdt, cy, sy, ctx, !ctx.clip && id !== 'sv' && !c.jmp);
    // 고개: 공(보이면) 쪽, 아니면 네트 너머
    const bp = v.ball?.visible ? v.ball.position : V3(0, 1.2, team === 0 ? -8 : 8);
    const rx = rx0, rz = rz0, tx = (bp.x - rx) / K, tz = (bp.z - rz) / K;
    if (id === 'sadP') R.lookAt(V3(0, 0.05, 1.1));   // 고개를 숙여 발 앞을 본다
    else R.lookAt(V3(tx * Math.cos(-c.yaw) + tz * Math.sin(-c.yaw), bp.y / K, -tx * Math.sin(-c.yaw) + tz * Math.cos(-c.yaw)));
    // 바뀌는 순간은 앞 자세에서 부드럽게
    const bones = this.bones.map(n => R.B(n));
    if (c.fade > 0 && c.snap) {
      const u = sstep(0, 1, 1 - c.fade / FADE);
      bones.forEach((b, k) => { if (!NOFADE.test(this.bones[k])) b.quaternion.slerpQuaternions(c.snap.q[k], b.quaternion.clone(), u); });
      c.fade = Math.max(0, c.fade - pdt);
    }
    // 라켓을 쥔 법(손잡이 둘레 각)도 바뀌는 동안 부드럽게
    const rk = R.racket, rq = new THREE.Quaternion().setFromRotationMatrix(rk.matrix);
    if (c.fade > 0 && c.snap?.rq) { rq.slerpQuaternions(c.snap.rq, rq.clone(), sstep(0, 1, 1 - c.fade / FADE)); rk.matrix.compose(R.GRIP_POS, rq, V3(1, 1, 1)); }
    c.last = { q: bones.map(b => b.quaternion.clone()), hips: R.B('hips').position.clone(), rq };
    // 코트 위로
    vrm.scene.position.set(rx, jy, rz); vrm.scene.rotation.set(0, c.yaw, 0); vrm.scene.scale.setScalar(K);
    vrm.scene.updateMatrixWorld(true);
    vrm.update(dt);
    // 서브 토스용: 왼손(공을 쥔 곳)의 세계 자리
    if (id === 'sv') {
      const hw = R.handBall();
      if (c.handW && c.handT != null && this.bt - c.handT > 1e-4) { const vi = hw.clone().sub(c.handW).multiplyScalar(1 / (this.bt - c.handT)); c.handV = c.handV ? c.handV.lerp(vi, 0.6) : vi; }
      c.handW = hw; c.handT = this.bt;
    } else { c.handV = null; c.handT = null; }
  }

  // 이동 엔진 한 프레임: 갈 길(그림 선수가 앞으로 있을 자리 + 공에 맞추려고 옮긴 만큼 등)과 바라볼 쪽을 주고, 몸(뿌리)은 그 동작의 움직임대로 간다
  locoStep(c, p, B, tgx, tgz, pdt, base, inSw, sw, tc) {
    const db = this.locoDB;
    if (!c.lc) { c.lc = locoState(db, B.x, B.z, c.yaw, this.locoSc); c.lc.fresh = true; this.locoFade(c); c.lk = { left: {}, right: {} }; }
    const wr = a => Math.atan2(Math.sin(a), Math.cos(a)), toIn = sw && sw.id !== 'sv' ? sw.tImpact - this.bt : 9;
    // 바라볼 쪽: 네트 쪽. 칠 때는 보내는 쪽으로 조금(15도까지). 멀리(1.5m 넘게) 빨리 옆·뒤로 갈 때는 가는 쪽으로 돌아 달리고(뒤로는 오른쪽으로 돌아 옆으로 물러난다) 칠 때가 다가오면 다시 선다
    let face = base;
    const aim = inSw ? sw.aim : null;
    if (aim && Math.hypot(aim[0], aim[1]) > 0.1) face = base + clamp(wr(Math.atan2(aim[0], aim[1]) - base) * 0.4, -15 * D, 15 * D);
    // 하체 방향 틀기(트리플A의 orientation warping, 사용자 2026-11-20: 크로스 스텝으로 오면 오른발이 왼쪽으로 가야지, 몸을 왼쪽으로 살짝 비틀면서).
    // 옆으로 빨리 가면 하체(골반·다리)는 가는 쪽으로 틀어 달리는 걸음을 쓰고(바깥 발이 안쪽 발 앞으로 엇갈려 건너간다), 상체는 반대로 비틀어 네트 쪽에 남긴다(c.warp, chest).
    // 예전에는 남은 거리(0.8m 넘게)와 그림 선수의 목표 빠르기로만 정해서, 1~2m를 초속 2.4m로 옆으로 갈 때 네트를 본 옆걸음(사이드 스텝) 동작이 빠르기를 못 따라가
    // 뒷발이 끌려가며 다리가 옆으로 크게 벌어졌다. 지금은 앞으로 0.35초 동안 실제로 갈 빠르기로 정한다: 초속 1.0m 아래는 옆걸음, 1.9m에서 다 튼다. 칠 때가 다가오면(0.45~0.22초 전, 스윙이 시작되기 직전) 다시 선다
    {
      const q0 = spriteAt(p, 0), q1 = spriteAt(p, 0.35), vx = (q1[0] - q0[0]) / 0.35, vz = (q1[1] - q0[1]) / 0.35, vs = Math.hypot(vx, vz);
      let tw = 0;
      if (vs > 0.3) {
        const rel = wr(Math.atan2(vx, vz) - base);
        const off = Math.abs(rel) > 150 * D ? -75 * D : clamp(rel, -75 * D, 75 * D) * sstep(30 * D, 55 * D, Math.abs(rel));   // 뒤로 갈 때(로브)는 오른쪽으로 돌아 옆으로 물러난다
        tw = off * sstep(1.0, 1.9, vs) * sstep(0.22, 0.45, toIn);
      }
      c.warp = (c.warp || 0) + (tw - (c.warp || 0)) * Math.min(1, pdt * 7);
      c.faceBase = face; face += c.warp;
    }
    // 갈 길: 그림 선수가 앞으로 있을 자리 + 옮긴 만큼. 칠 공이 있으면 공에 맞추려고 옮길 만큼도 임팩트 0.22초 전까지 다 옮겨 가는 것으로 본다
    // (지금 옮긴 만큼만 넣으면 서 있는 동안 미리 다가가지 않고 마지막 0.3초에 몰아서 갔다, 2026-11-19)
    const ox = tgx - p.x, oz = tgz - p.z, oT = c.offT && toIn < 9 ? c.offT : null;
    const Q = { fut: t => { const q = spriteAt(p, t); let ax = ox, az = oz; if (oT) { const u = clamp(t / Math.max(0.05, toIn - 0.22), 0, 1); ax += (oT.x - c.off.x) * u; az += (oT.z - c.off.z) * u; } return [q[0] + ax, q[1] + az]; }, face: () => face, tx: tgx, tz: tgz, maxOff: 0.7 + 0.5 * sstep(0.4, 1.0, toIn), force: c.lc.fresh, pivot: Math.abs(c.warp || 0) > 0.35 };
    c.lp = locoUpdate(db, c.lc, pdt, Q); c.lc.fresh = false;
    B.x = c.lc.x; B.z = c.lc.z; B.vx = c.lc.vx; B.vz = c.lc.vz; c.yaw = c.lc.yaw;
  }
  // 이동 엔진의 발: 자료에서 발이 땅에 닿은 동안은 코트 위 그 자리에 붙인다(발 고정). 들면 자료의 자리로, 바뀐 곳은 0.18초에 걸쳐 이어지게.
  // 서 있을 때는 테니스 준비 자세처럼 발을 조금 더 벌리고 발끝을 밖으로
  locoFoot(c, side, lp, x, jw) {
    const s = side[0], LK = this.locoK, sd = s === 'r' ? -1 : 1, idleW = 1 - sstep(0.4, 1.4, x.spd);
    const fx = lp[s + 'fx'] * LK + sd * (0.12 * idleW + jw), fz = lp[s + 'fz'] * LK - 0.03 * idleW, fy = lp[s + 'fy'] + sd * (8 * idleW + jw * 120), lift = lp[s + 'fl'] * LK;
    const toW = (a, b) => [x.rx + K * (a * x.cy + b * x.sy), x.rz + K * (-a * x.sy + b * x.cy)];
    const toR = (wx, wz) => { const dx = (wx - x.rx) / K, dz = (wz - x.rz) / K; return [dx * x.cy - dz * x.sy, dx * x.sy + dz * x.cy]; };
    const [wx, wz] = toW(fx, fz), wy = fy + x.yawD;
    const F = c.ft[side], L = c.lk[side], cv = lp[s + 'c'];
    // 회복 걸음(balance): 중심 밑으로 0.2초에 걸쳐 들어 옮겨 딛고 그 자리에 붙인다
    if (L.step) {
      const S_ = L.step; S_.t += x.pdt; const u = Math.min(1, S_.t / S_.T), e = sstep(0, 1, u);
      const sx = S_.fx + (S_.tx - S_.fx) * e, sz = S_.fz + (S_.tz - S_.fz) * e, syw = S_.y + wrapD(wy - S_.y) * e;
      if (u >= 1) { L.lock = { x: S_.tx, z: S_.tz, y: syw }; L.step = null; L.seen = true; }
      Object.assign(F, { x: sx, z: sz, y: syw, init: true, sw: null, follow: null, air: null, fp: [fx, fz, fy, 0] });
      const r = toR(sx, sz); return [r[0], r[1], syw - x.yawD, 0.06 * Math.sin(Math.PI * u)];
    }
    const con = !x.air && cv > (L.lock ? 0.35 : 0.65);
    if (!L.seen) {   // 이동 엔진에 막 들어왔다: 디딘 발은 지금 자리에 붙이고, 뜬 발은 지금 자리에서 이어지게
      L.seen = true;
      if (F.init) { if (con) L.lock = { x: F.x, z: F.z, y: F.y }; else { L.off = [F.x - wx, F.z - wz, wrapD(F.y - wy)]; L.offT = 0; } }
    }
    if (L.off) { L.offT += x.pdt; if (L.offT > 0.18) L.off = null; }
    const ow = L.off ? 1 - sstep(0, 0.18, L.offT) : 0;
    let ux = wx + (L.off ? L.off[0] * ow : 0), uz = wz + (L.off ? L.off[1] * ow : 0), uy = wy + (L.off ? L.off[2] * ow : 0);
    let lf = lift;
    if (con) {
      if (!L.lock) L.lock = { x: ux, z: uz, y: uy };
      // 몸이 목표 쪽으로 당겨지며 디딘 발과 너무 벌어지면(40cm 넘게) 발을 조금씩 끌어 다리가 지나치게 펴지지 않게
      const ex = wx - L.lock.x, ez = wz - L.lock.z, e = Math.hypot(ex, ez);
      if (e > 0.4) { const m = Math.min(e - 0.4, (1.5 + 0.8 * x.spd) * x.pdt); L.lock.x += ex / e * m; L.lock.z += ez / e * m; }   // 빨리 움직일수록 빨리(발만 뒤에 남아 다리가 벌어지지 않게)
      L.lock.y += wrapD(wy - L.lock.y) * Math.min(1, x.pdt * 3);   // 디딘 채 앞꿈치를 축으로 조금 돈다
      ux = L.lock.x; uz = L.lock.z; uy = L.lock.y; lf = 0;
    } else if (L.lock) {
      L.off = [L.lock.x - wx, L.lock.z - wz, wrapD(L.lock.y - wy)]; L.offT = 0; L.lock = null;
      ux = wx + L.off[0]; uz = wz + L.off[1]; uy = wy + L.off[2];
    }
    Object.assign(F, { x: ux, z: uz, y: uy, init: true, sw: null, follow: null, air: null, fp: [fx, fz, fy, 0] });
    const r = toR(ux, uz);
    return [r[0], r[1], uy - x.yawD, lf];
  }
  locoFade(c) { if (c.last) { c.snap = c.last; c.fade = FADE; c.snapHip = c.hipP; c.snapChest = c.chestP; } }
  // 균형(트리플A의 무게중심·지지면 검사): 몸 중심(골반 55% + 가슴 45%)을 땅에 내린 자리가 디딘 발(앞꿈치~뒤꿈치) 둘레 안에 있어야 서 있을 수 있다.
  // 빨라지거나 느려지는 만큼은 그쪽으로 기울어도 된다(중심 높이 × 가속도 / g, ZMP). 그보다 나가면 1) 골반을 발 쪽으로 옮기고(16cm까지)
  // 2) 그래도 24cm 넘게 나가 있으면 가장 먼 발을 들어 중심 밑으로 한 걸음(회복 걸음). 리그 기준(제자리, 돌리지 않은 자세)에서 잰다
  balance(c, R, pdt, cy, sy, x, canStep) {
    if (pdt <= 0) return;
    const hp = R.B('hips').getWorldPosition(V3()), cb = R.B('upperChest') || R.B('chest'), ch = cb.getWorldPosition(V3()), bal = c.bal || [0, 0];
    const comx = 0.55 * hp.x + 0.45 * ch.x - bal[0], comz = 0.55 * hp.z + 0.45 * ch.z - bal[1], comh = 0.55 * hp.y + 0.45 * ch.y;
    // 몸 중심(세계)의 가속도를 0.2초로 편 것(걸음마다 출렁이는 것은 빼고 몸 전체가 빨라지고 느려지는 만큼. 초속² 8m까지)
    // (골반을 옮겨 고친 만큼은 빼고 잰다: 고침이 만든 움직임을 다시 재면 고침이 흔들렸다)
    const cxw = x.rx + K * (comx * cy + comz * sy), czw = x.rz + K * (-comx * sy + comz * cy);
    const B0 = c.balW;
    if (!B0 || Math.hypot(cxw - B0.x, czw - B0.z) > 0.3) c.balW = { x: cxw, z: czw, vx: 0, vz: 0, ax: 0, az: 0 };
    else {
      const ks = Math.min(1, pdt / 0.2), vx = (cxw - B0.x) / pdt, vz = (czw - B0.z) / pdt;
      const nvx = B0.vx + (vx - B0.vx) * ks, nvz = B0.vz + (vz - B0.vz) * ks;
      B0.ax += ((nvx - B0.vx) / pdt - B0.ax) * ks; B0.az += ((nvz - B0.vz) / pdt - B0.az) * ks;
      Object.assign(B0, { x: cxw, z: czw, vx: nvx, vz: nvz });
    }
    const BW = c.balW;
    let ax = BW.ax * cy - BW.az * sy, az = BW.ax * sy + BW.az * cy; const al = Math.hypot(ax, az); if (al > 8) { ax *= 8 / al; az *= 8 / al; }
    const zx = comx - comh * ax / G, zz = comz - comh * az / G;
    const pts = [], who = [];
    for (const sd of ['left', 'right']) {
      const o = c.fo?.[sd]; if (!o || o[3] > 0.015) continue;
      const yr = o[2] * D; pts.push([o[0], o[1]], [o[0] - Math.sin(yr) * 0.17, o[1] - Math.cos(yr) * 0.17]); who.push(sd, sd);
    }
    let tx = 0, tz = 0, e = 0;
    if (pts.length) {
      const q = hullNearest(zx, zz, pts), dx = zx - q[0], dz = zz - q[1], d = Math.hypot(dx, dz);
      // 걷고 달리는 동안은 한 발로 딛고 몸이 그 발을 넘어가는 것이 정상이라(모션캡처 걸음) 빠를수록 넉넉히 본다(초속 2.5m에서 27cm)
      const sp = Math.hypot(c.v[0], c.v[1]);
      e = d - (0.05 + 0.22 * clamp(sp / 2.5, 0, 1));
      c.balD = [dx / Math.max(d, 1e-6), dz / Math.max(d, 1e-6)];
    }
    // 잠깐(걸음 하나) 나가는 것은 두고, 0.12초 넘게 이어지는 것만 고친다
    c.balEf = (c.balEf || 0) + (Math.max(0, e) - (c.balEf || 0)) * Math.min(1, pdt / 0.12);
    const ef = pts.length ? c.balEf : 0;
    if (ef > 0.01 && c.balD) { const m = Math.min(ef, 0.16); tx = -c.balD[0] * m; tz = -c.balD[1] * m; }
    const kb = Math.min(1, pdt * 8); c.bal = [bal[0] + (tx - bal[0]) * kb, bal[1] + (tz - bal[1]) * kb];
    c.balErr = ef;
    // 회복 걸음: 골반을 옮겨도 모자랄 만큼(20cm 넘게) 이어지면. 달리는 중(초속 1.2m 넘게)에는 걸음이 이미 있으니 두지 않는다
    c.balE = ef > 0.2 && pts.length && Math.hypot(c.v[0], c.v[1]) < 1.2 ? (c.balE || 0) + pdt : 0;
    if (!canStep || c.balE < 0.06 || this.bt - (c.balStep ?? -9) < 0.3) return;
    let far = null, fd = -1;
    for (let k = 0; k < pts.length; k += 2) { const d = Math.hypot(pts[k][0] - zx, pts[k][1] - zz); if (d > fd) { fd = d; far = who[k]; } }
    if (!far) return;
    const sd = far === 'left' ? 1 : -1, a = zx + sd * 0.13, b = zz + 0.06;   // 중심 밑, 그 발 쪽으로 조금
    const wx = x.rx + K * (a * cy + b * sy), wz = x.rz + K * (-a * sy + b * cy), F = c.ft[far];
    c.balStep = this.bt; c.balE = 0;
    if (c.lc && c.lk) { const L = c.lk[far]; L.step = { fx: F.x, fz: F.z, tx: wx, tz: wz, y: F.y, t: 0, T: 0.2 }; L.lock = null; L.off = null; }
    else if (!x.clip) F.sw = { t: 0, T: 0.2, fx: F.x, fz: F.z, fy: F.y, tx: wx, tz: wz, ty: F.y, h: 0.06 };
  }

  // 걸음 계획(자세를 만들기 전에 한 번): 새 걸음을 시작할 발과 딛을 자리. 발 자리는 앞 프레임의 자세 발(F.fp)을 쓴다
  // 걸음 값(초안, 참고: Tennis-MoCap 일반 선수 샷 사이 1초에 약 2.8걸음·한 걸음 18cm, 달리기는 일반적인 값):
  //   걷기 1초에 1.9~2.4걸음, 사이드 스텝 3걸음(가는 쪽 발부터, 발이 엇갈리지 않음), 크로스 스텝(빠르게 옆으로: 뒷발이 앞발 앞으로 엇갈려 딛음),
  //   달리기 3~4걸음(발이 떠 있는 시간이 걸음 간격보다 길어 두 발이 다 뜨는 순간이 있다)
  planSteps(c, x) {
    const L = c.ft.left, Rf = c.ft.right, g = c.gait, bt = this.bt;
    if (!L.init || !Rf.init || x.air || x.clip || !L.fp || !Rf.fp) { g.on = false; return; }
    const vlx = c.v[0] * x.cy - c.v[1] * x.sy, vlz = c.v[0] * x.sy + c.v[1] * x.cy, spd = x.spd;   // 몸 기준 빠르기(+x 왼쪽, +z 앞)
    const lateral = Math.abs(vlx) > Math.abs(vlz) * 0.8;
    const mode = spd < 0.35 ? 'idle' : lateral ? (spd > 2.4 ? 'cross' : 'side') : spd > 1.6 ? 'run' : 'walk';
    g.mode = mode;
    const toW = (a, b) => [x.rx + K * (a * x.cy + b * x.sy), x.rz + K * (-a * x.sy + b * x.cy)];
    const toR = (wx, wz) => { const dx = (wx - x.rx) / K, dz = (wz - x.rz) / K; return [dx * x.cy - dz * x.sy, dx * x.sy + dz * x.cy]; };
    const noCross = (side, tx, tz) => {
      const O = c.ft[side === 'left' ? 'right' : 'left'], ot = O.sw ? [O.sw.tx, O.sw.tz] : [O.x, O.z], rt = toR(tx, tz), ro = toR(ot[0], ot[1]);
      if (side === 'left' && rt[0] < ro[0] + 0.12) rt[0] = ro[0] + 0.12;
      if (side === 'right' && rt[0] > ro[0] - 0.12) rt[0] = ro[0] - 0.12;
      return toW(rt[0], rt[1]);
    };
    const start = (side, tx, tz, ty, T, h, cross = false) => {
      if (!cross) [tx, tz] = noCross(side, tx, tz);
      const F = c.ft[side], len = Math.hypot(tx - F.x, tz - F.z);
      T = Math.max(T, len / clamp(1.5 + 1.2 * x.spd, 3, 8));   // 발의 평균 빠르기는 몸 빠르기 + 알맞게(한 프레임에 크게 튀지 않게)
      F.sw = { t: 0, T, fx: F.x, fz: F.z, fy: F.y, tx, tz, ty, h: h ?? (0.03 + 0.05 * Math.min(1, len / 0.7)), re: null };
      c.lastSide = side; c.lastStep = bt; g.t = 0;
    };
    // 디딘 발이 몸에서 너무 멀면(72cm 넘게) 리듬과 상관없이 바로 한 걸음(발만 남고 몸이 가 버리지 않게)
    for (const [side, F] of [['right', Rf], ['left', L]]) {
      if (F.sw || Math.hypot(F.x - x.rx, F.z - x.rz) < 0.72) continue;
      let [tx, tz] = toW(F.fp[0], F.fp[1]); tx += c.v[0] * 0.2; tz += c.v[1] * 0.2;
      start(side, tx, tz, F.fp[2] + x.yawD, 0.16, 0.06);
    }
    // 몸이 크게 돌아(크로스오버 뒤 다시 설 때 등) 디딘 두 발이 몸 기준으로 엇갈리면 바로 한 걸음 옮겨 바로잡는다(다리가 겹치지 않게)
    if (!L.sw && !Rf.sw && mode !== 'cross') {
      const lr = toR(L.x, L.z), rr = toR(Rf.x, Rf.z);
      if (lr[0] < rr[0] + 0.04) {
        const side = Math.abs(lr[0] - L.fp[0]) > Math.abs(rr[0] - Rf.fp[0]) ? 'left' : 'right', F = c.ft[side];
        const [tx, tz] = toW(F.fp[0], F.fp[1]); start(side, tx, tz, F.fp[2] + x.yawD, 0.2, 0.06); return;
      }
    }
    if (mode === 'idle') {
      // 멈춰 있을 때: 자세가 원하는 자리에서 멀어진 발만 한 걸음(한 번에 한 발). 칠 공을 기다릴 때는 1초에 약 2.8번 잔발
      g.on = false;
      if (L.sw || Rf.sw) return;
      const errOf = (F, side) => { const [ix, iz] = toW(F.fp[0], F.fp[1]); return { e: Math.hypot(ix - F.x, iz - F.z) + Math.abs(wrapD(F.fp[2] + x.yawD - F.y)) / 150, ix, iz, iy: F.fp[2] + x.yawD, side }; };
      const a = errOf(Rf, 'right'), b = errOf(L, 'left');
      let pick = a.e > b.e ? a : b;
      if (x.adj && bt - c.lastStep > 0.36) { pick = c.lastSide === 'right' ? b : a; start(pick.side, pick.ix, pick.iz, pick.iy, 0.12, 0.025); return; }
      if (pick.e > 0.07 && bt - c.lastStep > 0.05) start(pick.side, pick.ix, pick.iz, pick.iy, 0.2, 0.04);
      return;
    }
    // 움직일 때: 리듬 있게 번갈아 딛는다
    const cad = mode === 'run' ? clamp(2.5 + 0.35 * spd, 2.8, 4) : mode === 'walk' ? clamp(1.8 + 0.4 * spd, 1.9, 2.4) : clamp(2.8 + 0.5 * spd, 3, 4.2);   // 1초에 걸음 수
    const Ts = 1 / cad, sig = mode === 'run' ? clamp(1 + 0.08 * spd, 1.1, 1.35) : mode === 'walk' ? 0.75 : 0.8, Tsw = sig * Ts;   // 달리면 두 발이 다 뜨는 순간이 있다
    if (!g.on) { g.on = true; g.t = Ts; c.lastSide = null; }
    g.t += x.pdt;
    if (g.t < Ts) return;
    // 이번에 딛을 발: 번갈아. 처음에는 가는 쪽 발(옆이면 그쪽 발, 앞뒤면 더 멀어진 발)
    let side = c.lastSide === 'right' ? 'left' : c.lastSide === 'left' ? 'right' : null;
    if (!side) side = lateral ? (vlx > 0 ? 'left' : 'right') : (Math.hypot(Rf.x - x.rx, Rf.z - x.rz) > Math.hypot(L.x - x.rx, L.z - x.rz) ? 'right' : 'left');
    const F = c.ft[side];
    if (F.sw) return;   // 아직 떠 있다(달리기에서 겹칠 때)
    // 딛는 자리: 이 발이 땅에 있는 동안의 가운데쯤 몸이 올 자리 + 이 발의 자리(모드별 폭)
    const sd = side === 'left' ? 1 : -1, lead = lateral && Math.sign(vlx) === sd;
    let ox = F.fp[0], oz = F.fp[1];
    if (mode === 'run') { ox = sd * 0.14; oz = 0; }   // 두 발 폭을 너무 좁히면 무릎이 스친다
    else if (mode === 'walk') { ox = sd * 0.14; oz = 0.02; }
    else if (mode === 'side') { ox = sd * 0.24; oz = 0.05; }
    else if (mode === 'cross') {   // 뒷발은 앞발 바로 앞으로 엇갈려 딛는다(멀리 건너가면 다리가 관통했다)
      if (lead) { ox = sd * 0.24; oz = 0.02; }
      else { const O = c.ft[side === 'left' ? 'right' : 'left'], or_ = toR(O.x, O.z); ox = or_[0] + sd * 0.04; oz = Math.max(or_[1] + 0.2, 0.12); }
    }
    const ahead = Ts + Tsw / 2;
    let [tx, tz] = toW(ox, oz); tx += c.v[0] * ahead; tz += c.v[1] * ahead;
    const len = Math.hypot(tx - F.x, tz - F.z), maxL = 1.8;
    if (len > maxL) { tx = F.x + (tx - F.x) * maxL / len; tz = F.z + (tz - F.z) * maxL / len; }
    const h = mode === 'run' ? 0.1 + 0.02 * spd : mode === 'cross' ? 0.08 : mode === 'side' ? 0.05 : 0.06;
    start(side, tx, tz, F.fp[2] + x.yawD + (mode === 'cross' && !lead ? -sd * 25 : 0), Tsw, h, mode === 'cross' && !lead);
    F.sw.re = { ox, oz, ahead, Tsw, cross: mode === 'cross' && !lead };   // 떠 있는 동안 몸 빠르기가 바뀌면 딛을 자리를 조금씩 고친다
  }

  // 발 하나(리그 기준 [x, z, 발끝 각(도), 들림])를 정한다. f = 자세(동작)가 원하는 자리. 디딘 발은 코트 위 한 자리에 붙어 있다
  footOut(c, side, f, x) {
    const F = c.ft[side], pdt = x.pdt;
    const toW = (a, b) => [x.rx + K * (a * x.cy + b * x.sy), x.rz + K * (-a * x.sy + b * x.cy)];
    const toR = (wx, wz) => { const dx = (wx - x.rx) / K, dz = (wz - x.rz) / K; return [dx * x.cy - dz * x.sy, dx * x.sy + dz * x.cy]; };
    const [ix, iz] = toW(f[0], f[1]), iy = f[2] + x.yawD;
    const fpPrev = F.fp; F.fp = f.slice();
    if (!F.init) { F.x = ix; F.z = iz; F.y = iy; F.sw = null; F.follow = null; F.air = null; F.init = true; return f; }
    if (x.air) {
      // 뜬 동안: 몸에 대한 발 자리를 떠날 때 자리에서 자세 자리(넓힌 자리)로 부드럽게 옮긴다(뜨는 순간 발을 한 번에 옮기면 순간이동처럼 보였다)
      if (!F.air) { const r0 = toR(F.x, F.z); F.air = { r0, y0: wrapD(F.y - x.yawD), t: 0, f: f.slice(0, 3) }; F.sw = null; F.follow = null; }
      // 뜬 동안 자세가 바뀌면(스윙이 시작되거나 끝나면) 자세의 발 자리가 한 번에 바뀐다: 목표 자리는 초속 2.5m까지만 따라간다(다리 뼈는 자세 섞기에서 빠져 있다)
      const g = F.air.f, mx = 2.5 * pdt / K; g[0] += clamp(f[0] - g[0], -mx, mx); g[1] += clamp(f[1] - g[1], -mx, mx); g[2] += wrapD(f[2] - g[2]) * Math.min(1, pdt * 12);
      F.air.t += pdt; const u = sstep(0, 1, F.air.t / Math.max(0.08, x.airT || 0.17));
      const rx_ = F.air.r0[0] + (g[0] - F.air.r0[0]) * u, rz_ = F.air.r0[1] + (g[1] - F.air.r0[1]) * u, ry = F.air.y0 + wrapD(g[2] - F.air.y0) * u;
      [F.x, F.z] = toW(rx_, rz_); F.y = ry + x.yawD;
      return [rx_, rz_, ry, 0];
    }
    F.air = null;
    let lift = 0;
    if (x.clip) {
      // 동작(모션캡처)의 발: 땅에 있으면 붙여 두고, 들면 따라간다. 동작의 발은 땅에서도 3~6cm 떠 있게 적혀 있어 그 아래는 땅으로 본다
      const vr = fpPrev ? Math.hypot(f[0] - fpPrev[0], f[1] - fpPrev[1]) * K / Math.max(pdt, 1e-3) : 0, onGround = F.follow ? f[3] < 0.06 && vr < 0.45 : f[3] < 0.08 && vr < 0.8;   // 여유 폭(떨리지 않게)
      if (F.sw && !F.sw.clip) { const gap = Math.hypot(ix - F.x, iz - F.z); F.sw = { t: 0, T: clamp(gap / 4, 0.1, 0.3), fx: F.x, fz: F.z, fy: F.y, tx: ix, tz: iz, ty: iy, h: 0.04, clip: true }; }   // 걸음 중이던 발은 지금 자리에서 새 걸음으로(목표만 바꾸면 한 프레임에 건너뛴다)
      else if (F.sw) { F.sw.tx = ix; F.sw.tz = iz; F.sw.ty = iy; }
      else if (onGround) {
        F.follow = null;
        const gap = Math.hypot(ix - F.x, iz - F.z);
        if (gap > 0.3) F.sw = { t: 0, T: Math.max(0.14, gap / 4), fx: F.x, fz: F.z, fy: F.y, tx: ix, tz: iz, ty: iy, h: 0.04, clip: true };   // 너무 벌어지면 한 걸음
        else F.y += wrapD(iy - F.y) * Math.min(1, pdt * 12);   // 앞꿈치를 축으로 돈다(자리는 그대로)
      } else {
        if (!F.follow) F.follow = [F.x - ix, F.z - iz];
        const k = Math.exp(-pdt * 14); F.follow[0] *= k; F.follow[1] *= k;
        F.x = ix + F.follow[0]; F.z = iz + F.follow[1]; F.y = iy; lift = Math.max(f[3] - 0.03, Math.min(0.07, vr * 0.05));   // 움직이는 발은 그만큼 든다(끌지 않게)
      }
    } else F.follow = null;
    if (F.sw) {
      const W = F.sw; W.t += pdt;
      const u = Math.min(1, W.t / W.T), e = 0.5 * sstep(0.06, 0.94, u) + 0.5 * clamp((u - 0.06) / 0.88, 0, 1);   // 먼저 들고, 옮기고, 내려놓는다(가운데에 몰리지 않게)
      if (W.re && u < 0.7 && !x.clip) {   // 걸음 계획에서 정한 자리를 몸 빠르기에 맞춰 조금씩 고친다
        let [tx, tz] = toW(W.re.ox, W.re.oz); const left = Math.max(0, W.T - W.t) + W.re.ahead - W.re.Tsw;
        tx += c.v[0] * left; tz += c.v[1] * left;
        W.tx += (tx - W.tx) * Math.min(1, pdt * 8); W.tz += (tz - W.tz) * Math.min(1, pdt * 8);
        if (!W.re.cross) {   // 고친 자리도 다른 발과 엇갈리지 않게(크로스 스텝의 뒷발만 예외)
          const O = c.ft[side === 'left' ? 'right' : 'left'], ot = O.sw ? [O.sw.tx, O.sw.tz] : [O.x, O.z], rt = toR(W.tx, W.tz), ro = toR(ot[0], ot[1]);
          if (side === 'left' && rt[0] < ro[0] + 0.12) rt[0] = ro[0] + 0.12;
          if (side === 'right' && rt[0] > ro[0] - 0.12) rt[0] = ro[0] - 0.12;
          [W.tx, W.tz] = toW(rt[0], rt[1]);
        }
      }
      F.x = W.fx + (W.tx - W.fx) * e; F.z = W.fz + (W.tz - W.fz) * e; F.y = W.fy + wrapD(W.ty - W.fy) * e;
      if (W.re?.cross) { const b = 0.22 * Math.sin(Math.PI * u); F.x += K * b * x.sy; F.z += K * b * x.cy; }   // 크로스 스텝 뒷발은 앞발 앞으로 둥글게 돌아 건너간다
      // 디딘 다른 발 둘레 18cm 안으로는 들어오지 않고 돌아간다(다리를 관통하지 않게)
      const O = c.ft[side === 'left' ? 'right' : 'left'];
      if (O.init) { const dx = F.x - O.x, dz = F.z - O.z, d = Math.hypot(dx, dz), m = 0.2; if (d < m && u > 0.05 && u < 0.95) { const k = (m - Math.max(d, 1e-3)) / Math.max(d, 1e-3); F.x += dx * k; F.z += dz * k; } }   // 다른 발이 떠 있어도 피한다
      lift = W.h * Math.pow(Math.sin(Math.PI * u), 0.7); x.bob += (W.T < 0.2 ? 0.02 : 0.012) * Math.sin(Math.PI * u);
      if (u >= 1) F.sw = null;
    }
    const [rxx, rzz] = toR(F.x, F.z);
    return [rxx, rzz, F.y - x.yawD, lift];
  }

  dispose() {
    for (const c of this.list) { this.view.scene.remove(c.vrm.scene); c.vrm.scene.traverse(o => { if (o.isMesh) { for (const m of [o.material].flat()) m.dispose(); } }); }
    this.list = []; this.ready = false;
  }
}
