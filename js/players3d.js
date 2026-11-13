// 경기 중계의 3D 선수(시험, 사용자 2026-11-10: '일단 게임에 적용해볼래').
// VRM 캐릭터(art/char3d/vroid_sample.vrm) 넷에 리그(js/rig3d.js)와 스윙(js/swings.js)을 입힌다.
// 자리와 움직임은 그림 선수(빌보드)가 쓰던 값(p.x, p.z, p.vel, p.hop …)을 그대로 따르고, 치는 때와 공이 맞는 자리는 중계가 미리 알려 준다(schedule).
// 임팩트 순간에는 라켓 가운데가 공에 오도록 몸을 조금 옮기고(뿌리 맞추기) 높이는 IK로 맞춘다. 연출만이고 승패·난수는 그대로다
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { VRMLoaderPlugin } from '../vendor/three-vrm.module.min.js';
import { createRig } from './rig3d.js';
import { SHOTS } from './swings.js';

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
const wrapD = a => ((a % 360) + 540) % 360 - 180;   // 각(도)을 -180~180으로
// 동작이 바뀔 때 뼈를 섞지 않는 곳: 다리와 골반·몸통(이것들은 자세 값에서 섞어 다리 IK가 디딘 발에 맞는다)
const NOFADE = /^(hips|spine|chest|upperChest|(left|right)(UpperLeg|LowerLeg|Foot|Toes))$/;
const K = 1.12;   // 키(그림 선수가 실제보다 크게 보여서 맞춘다)
const FADE = 0.16;   // 동작이 바뀔 때 앞 자세에서 넘어가는 시간(초)
export const SV_TOSS = 1.25;   // 서브: 임팩트 이만큼 전부터 토스(서브 준비 자세도 이 때의 자세. 손이 가장 낮다)
const BASELINE = 11.885, TOE_GAP = 0.1;   // 베이스라인 바깥 끝, 서브 때 앞꿈치(발가락 관절)를 이만큼 뒤에 둔다(발끝 살)
const G = 9.81;
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
export function prefetchP3d() { loadBuf(); }
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
  return wing === 'bh' ? 'bh' : 'fh';
}
const meshesOf = v => { const a = []; v.scene.traverse(o => { if (o.isMesh) a.push(o); }); return a; };
const yieldFrame = () => new Promise(r => setTimeout(r, 0));

export class Players3D {
  constructor(view) { this.view = view; this.ready = false; this.list = []; this.bt = 0; this.shots = {}; }

  // 모델 넷을 만들고(텍스처·모양은 하나를 같이 쓴다) 스윙을 미리 준비한다. 못 하면 false(그림 선수 그대로)
  async load() {
    const buf = await loadBuf();
    if (!buf || !this.view.alive) return false;
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
    const rigs = vrms.map(v => createRig(v));
    // 스윙 준비(몸 크기에만 달려 있으니 한 번 해서 넷이 같이 쓴다). 한 샷씩 쉬어 가며(화면이 멈추지 않게)
    for (const d of SHOTS) { rigs[0].setShot(d); this.shots[d.id] = rigs[0].S; await yieldFrame(); if (!this.view.alive) return false; }
    // 서브 토스: 공은 왼손이 가장 빨리 올라가는 때 손을 떠난다(손이 멈춘 때 놓으면 공이 갑자기 튀어 나간다, 사용자 2026-11-11: 토스가 흔들린다)
    { const Sv = this.shots.sv, R = rigs[0]; R.useShot(Sv); let best = Sv.toss, bv = -1;
      for (let t = -SV_TOSS + 0.05; t <= Sv.toss; t += 0.01) { const a = R.sample(t, 'lh'), b = R.sample(t + 0.01, 'lh'); if (Array.isArray(a) && Array.isArray(b) && (b[1] - a[1]) > bv) { bv = b[1] - a[1]; best = t; } }
      Sv.tossR = best; }
    // 기다리는 자세는 손으로 짠 준비 자세(모션캡처 스윙의 첫 자세는 이미 준비 동작 중이라): 뒤에서는 포핸드, 네트 앞에서는 발리 준비
    for (const [rid, sid] of [['readyB', 'fh'], ['readyN', 'fv']]) {
      const d = SHOTS.find(x => x.id === sid);
      rigs[0].setShot({ ...d, id: rid, keys: d.handKeys || d.keys, bevel: d.handBevel ?? d.bevel, toss: d.handToss ?? d.toss, step: d.handStep ?? d.step, lroll: d.handLroll, rollK: 0, chestPoles: false });
      this.shots[rid] = rigs[0].S; await yieldFrame(); if (!this.view.alive) return false;
    }
    for (let i = 0; i < 4; i++) {
      const vrm = vrms[i], p = this.view.players[i];
      this.view.scene.add(vrm.scene);
      this.list.push({ vrm, rig: rigs[i], team: i < 2 ? 0 : 1, sw: null, key: '', yaw: i < 2 ? Math.PI : 0, ph: 0, wg: 0, off: V3(), last: null, fade: 0, snap: null, px: p.x, pz: p.z, dir: [0, i < 2 ? -1 : 1], hop0: p.hop, jmp: null, sq: 0, v: [0, 0], rp: null, ft: { right: {}, left: {} }, lastStep: -9, lastSide: null, pv: [0, 0], gait: { on: false, t: 0 }, hipP: null, chestP: null, sep: [0, 0], body: { init: false, x: 0, z: 0, vx: 0, vz: 0 }, tp: [p.x, p.z], tv: [0, 0], acc: [0, 0], ps: [0, 0] });
    }
    this.bones = rigs[0].ALLB;
    this.ready = true;
    return true;
  }

  // i가 지금부터 dt초 뒤(공 시간)에 type 샷을 친다. contact: 공이 맞는 자리(세계, 없으면 맞추지 않는다), aim: 보내는 쪽 [dx, dz]
  schedule(i, type, wing, dt, contact, aim, opt = {}) {
    const c = this.list[i]; if (!c) return;
    const id = clipOf(type, wing), S = this.shots[id];
    const lead = opt.from != null ? -opt.from : Math.min(Math.max(dt, 0.25), id === 'sv' ? 1.3 : 0.95);
    if (id !== 'sv') c.serve = null;
    c.sw = { id, t0: this.bt, tImpact: this.bt + dt, tStart: this.bt + dt - lead, contact: contact ? contact.clone() : null, aim, full: !!opt.full, tail: Math.min(S.T1, 1.0), dive: !!opt.dive };
  }
  // 서브: 포인트를 시작할 때부터 서브 준비 자세로 공이 맞을 자리에 맞춰 선다
  prepServe(i, contact, aim) {
    const c = this.list[i]; if (!c) return;
    c.serve = { contact: contact.clone(), aim, at: this.bt };
  }
  // 서브 토스 동안 공 자리(왼손에 있다가 놓으면 맞을 자리로 올라갔다 떨어진다). 없으면 null
  tossBall(i) {
    const c = this.list[i]; if (!c?.sw || c.sw.id !== 'sv' || !c.handW) return null;
    const S = this.shots.sv, tc = this.bt - c.sw.tImpact;
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
    if (sw && this.bt > sw.tImpact + sw.tail) { if (sw.id === 'sv' && !(c.serve && c.serve.at > sw.tStart)) c.serve = null;   /* 폴트 뒤 세컨 서브를 미리 준비했으면 그대로 */ c.sw = sw = null; c.release = null; }
    const inSw = sw && this.bt >= sw.tStart;
    const id = inSw ? sw.id : c.serve ? 'sv' : Math.abs(p.z) < 6.5 ? 'readyN' : 'readyB', S = this.shots[id];
    const tc = inSw ? clamp(this.bt - sw.tImpact, S.T0, S.T1) : id === 'sv' ? Math.max(S.T0, -SV_TOSS) : S.T0;
    // 움직임: 그림 선수의 자리를 따라간다. 달리는 쪽(세계)과 빠르기
    const mdx = p.x - c.px, mdz = p.z - c.pz, md = Math.hypot(mdx, mdz); c.px = p.x; c.pz = p.z;
    if (md > 1e-4) c.dir = [mdx / md, mdz / md];
    // 몸(뿌리): 그림 선수 자리(+공에 맞추려고 옮긴 만큼 c.off, 서로 밀어낸 만큼 c.sep)를 목표로 따라가되, 땅을 디딘 발로만 밀어 빨라지거나 느려진다
    // (사용자 2026-11-13: 발과 상관없이 물리적으로 말도 안 되게 움직인다). 두 발이 다 떠 있으면(달리기의 뜬 순간, 뛰기) 가던 대로 간다
    // 친 뒤(c.hold): 임팩트 자리에서 0.1~0.5초에 걸쳐 그림 선수 자리로 풀린다(그 자리에 멈춰 섰다가 한꺼번에 쫓아가면 휙 움직였다)
    const hu = c.hold && sw ? sstep(0.1, 0.5, this.bt - sw.tImpact) : 1;
    const tgx = (c.hold ? c.hold[0] + (p.x + c.off.x - c.hold[0]) * hu : p.x + c.off.x) + c.sep[0], tgz = (c.hold ? c.hold[1] + (p.z + c.off.z - c.hold[1]) * hu : p.z + c.off.z) + c.sep[1], B = c.body;
    // 포인트 사이에 자리를 한 번에 옮긴 것(순간이동)은 달린 것이 아니다: 몸과 발을 새 자리에 바로 놓는다
    const tele = !B.init || Math.hypot(tgx - c.tp[0], tgz - c.tp[1]) > Math.max(0.35, pdt * 12) || Math.hypot(tgx - B.x, tgz - B.z) > 2.5, spriteJump = md > Math.max(0.35, pdt * 12);
    if (tele) { Object.assign(B, { init: true, x: tgx, z: tgz, vx: 0, vz: 0 }); c.tv = [0, 0]; c.acc = [0, 0]; c.pv = [0, 0]; c.rp = null; c.ft.left.init = c.ft.right.init = false; }
    else if (pdt > 0) {
      const k = Math.min(1, pdt * 10); c.tv[0] += ((tgx - c.tp[0]) / pdt - c.tv[0]) * k; c.tv[1] += ((tgz - c.tp[1]) / pdt - c.tv[1]) * k;
      if (id === 'sv' && inSw) Object.assign(B, { x: tgx, z: tgz, vx: 0, vz: 0 });   // 서브 토스부터는 맞춰 둔 자리 그대로
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
        const vcap = lunge ? clamp(Math.hypot(c.tv[0], c.tv[1]) + 1.2, 4, 5.5) : 5.5, vv = Math.hypot(B.vx, B.vz); if (vv > vcap) { B.vx *= vcap / vv; B.vz *= vcap / vv; }
        B.x += B.vx * pdt; B.z += B.vz * pdt;
        if (lunge && Tgo < 0.1) { const ex = tgx - B.x, ez = tgz - B.z, el = Math.hypot(ex, ez), m = Math.min(el * Math.min(1, pdt / Tgo) * 0.6, 0.02); if (el > 1e-4) { B.x += ex / el * m; B.z += ez / el * m; } }   // 마지막 0.1초에 남은 차이를 조금씩(한 프레임 2cm까지)   // 마지막 0.1초에 남은 차이를 조금씩(라켓이 공을 지나치지 않게)
        const ka = Math.min(1, pdt * 8); c.acc[0] += (ax - c.acc[0]) * ka; c.acc[1] += (az - c.acc[1]) * ka;
      }
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
    let dy = yawT - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * (id === 'sv' && inSw ? 1 : Math.min(1, pdt * 8));   // 서브: 바로 그 방향으로(돌면서 공에 맞추려고 몸이 미끄러지지 않게)
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
    this.planSteps(c, ctx);
    // 골반: 한 발이 떠 있으면 디딘 발 쪽으로, 둘 다 디디면 두 발 가운데로 무게를 싣는다. 걷기·사이드 스텝은 디딘 다리 위에서 조금 올라가고,
    // 달리기는 디딜 때 눌렸다가 뜰 때 올라간다. 앞으로 내딛는 다리 쪽으로 골반이 조금 돌고 가슴은 반대로 돈다.
    // 몸은 힘을 준 쪽으로 기운다(빨라질 때 앞으로, 멈출 때 뒤로, 옆으로 밀 때 그쪽으로). 스윙(모션캡처) 동안은 동작의 골반을 쓴다
    let gHx = 0, gHz = 0, gYaw = 0, gBob = 0, gChY = 0, gPitch = 0, gRoll = 0;
    {
      const Lf = c.ft.left, Rf = c.ft.right, gw = pw * (c.jmp ? 0.4 : 1);
      if (Lf.init && Rf.init && gw > 0) {
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
    let reach = null;
    if (inSw && sw.id !== 'sv' && c.res) { const dx = c.res[0] / K, dz = c.res[1] / K; reach = V3(dx * cy - dz * sy, 0, dx * sy + dz * cy); if (reach.length() > 0.3) reach.setLength(0.3); }
    const over = {
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
      hip: h => { h = [h[0] + gHx, h[1] - 0.035 * mv + gBob - c.sq * 0.6 + jhip * jk, h[2] + gHz, h[3] + gYaw]; if (c.fade > 0 && c.snapHip) { const u = sstep(0, 1, 1 - c.fade / FADE); h = h.map((v, k) => k === 3 ? c.snapHip[3] + wrapD(v - c.snapHip[3]) * u : c.snapHip[k] + (v - c.snapHip[k]) * u); } c.hipP = h; return h; },
      chest: ch => { ch = [ch[0] + gChY, ch[1] + 8 * mv * Math.min(1, spd / 5) + gPitch, ch[2] + gRoll]; if (c.fade > 0 && c.snapChest) { const u = sstep(0, 1, 1 - c.fade / FADE); ch = ch.map((v, k) => c.snapChest[k] + (v - c.snapChest[k]) * u); } c.chestP = ch; return ch; },
    };
    // 공 높이는 IK로(리그 기준 높이 차이, 사람 범위 안), 앞뒤·옆은 몸을 옮겨 맞춘다
    const contact = sw && (inSw || sw.id !== 'sv') ? sw.contact : c.serve?.contact, Sc = sw ? this.shots[sw.id] : S;
    let dl = V3();
    if (contact) dl.y = clamp(contact.y / K - Sc.C0.y, -0.62, 0.38);
    // 뿌리 맞추기: 임팩트 때 라켓 가운데(C0 + dl)가 공에 오는 자리 - 지금 자리. 임팩트 앞뒤로만(서브는 처음부터 끝까지)
    let w = 0;
    if (contact) {
      if (inSw && sw.id === 'sv') w = 1 - sstep(0.3, 0.9, tc);   // 서브: 처음부터 맞춰 서 있다가 착지 뒤 풀린다
      else if (sw && sw.id !== 'sv') {
        // 임팩트 0.75~0.15초 전에 걸쳐 고르게(마지막 0.4초에 몰아서 하면 몸이 뒤로 미끄러진다), 친 뒤에는 풀린다
        const tr = this.bt - sw.tImpact;
        w = sw.full ? 1 : sstep(-0.8, -0.22, tr) * (1 - sstep(0.12, 0.55, tr));
      } else w = 1;   // 서브 준비
      const lc = Sc.C0.clone().add(dl).multiplyScalar(K), wx = lc.x * Math.cos(c.yaw) + lc.z * Math.sin(c.yaw), wz = -lc.x * Math.sin(c.yaw) + lc.z * Math.cos(c.yaw);
      // 그림 선수가 임팩트 때 있을 자리 기준으로 모자란 만큼만(지금 자리 기준이면 아직 달려갈 거리까지 미리 옮겨 몸이 앞질러 갔다가 뒤처졌다)
      const Tgo = sw && sw.id !== 'sv' ? Math.max(0, sw.tImpact - this.bt) : 0, [qx, qz] = Tgo > 0 ? spriteAt(p, Math.min(Tgo, 1.5)) : [p.x, p.z];
      const need = V3(contact.x - wx - qx, 0, contact.z - wz - qz);
      if (sw?.dive) need.clampLength(0, 0.9); else need.clampLength(0, 1.6);
      if (id === 'sv') c.off.lerp(need.multiplyScalar(w), inSw ? 1 : Math.min(1, pdt * 5));
      else {
        // 몸 옮기는 빠르기는 초속 3m까지(튀지 않게). 공이 곧 오는데(발리) 못 닿을 만큼 남았으면 임팩트 0.05초 전까지 닿게 그만큼만 빠르게
        const tgt = need.multiplyScalar(w), d = tgt.sub(c.off), left = sw ? sw.tImpact - 0.05 - this.bt : 1;
        const mx = clamp(left > 0.08 && w > 0.5 ? d.length() / left : 0, 3, 6) * pdt;
        if (d.length() > mx) d.setLength(mx); c.off.add(d);
      }   // 서브: 준비하는 동안 걸어가 서고, 토스부터는 그 자리 그대로
    } else { const L = c.off.length(), mx = 1.3 * pdt; if (L > mx) c.off.multiplyScalar(1 - mx / L); else c.off.set(0, 0, 0); }   // 친 뒤 그림 선수 자리로 돌아갈 때는 초속 1.3m까지(그림 선수가 뛰는 빠르기에 더해져 휙 움직였다)
    // 친 뒤 팔로스로(동작의 발을 따르는 동안)에는 임팩트 자리에서 천천히 풀린다(위 hu). 디딘 발과 몸이 벌어지지 않게(사용자 2026-11-12: 발이 미끄러진다)
    if (inSw && sw.id !== 'sv' && this.bt >= sw.tImpact && pw < 0.5) { if (!c.hold) c.hold = [p.x + c.off.x, p.z + c.off.z]; } else c.hold = null;
    // 자세는 리그 기준(제자리, 돌리지 않음)으로 만들고 나서 코트 위로 옮긴다
    const key = id + (inSw ? ':' + sw.tImpact.toFixed(3) : ':idle');
    if (key !== c.key) { if (c.last && !(c.key === 'sv:idle' && id === 'sv')) { c.snap = c.last; c.fade = FADE; c.snapHip = c.hipP; c.snapChest = c.chestP; } c.key = key; if (!inSw) c.release = null; }   // 서브 준비 → 토스는 같은 자세라 섞지 않는다(섞으면 발이 밀린다)
    vrm.scene.position.set(0, 0, 0); vrm.scene.rotation.set(0, 0, 0); vrm.scene.scale.setScalar(1); vrm.scene.updateMatrixWorld(true);
    R.useShot(S);
    R.pose(tc, inSw ? dl : V3(), null, over);
    // 고개: 공(보이면) 쪽, 아니면 네트 너머
    const bp = v.ball?.visible ? v.ball.position : V3(0, 1.2, team === 0 ? -8 : 8);
    const rx = rx0, rz = rz0, tx = (bp.x - rx) / K, tz = (bp.z - rz) / K;
    R.lookAt(V3(tx * Math.cos(-c.yaw) + tz * Math.sin(-c.yaw), bp.y / K, -tx * Math.sin(-c.yaw) + tz * Math.cos(-c.yaw)));
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
