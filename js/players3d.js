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
const D = Math.PI / 180;
const wrapD = a => ((a % 360) + 540) % 360 - 180;   // 각(도)을 -180~180으로
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
        o.frustumCulled = false; o.castShadow = false;
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
      this.list.push({ vrm, rig: rigs[i], team: i < 2 ? 0 : 1, sw: null, key: '', yaw: i < 2 ? Math.PI : 0, ph: 0, wg: 0, off: V3(), last: null, fade: 0, snap: null, px: p.x, pz: p.z, dir: [0, i < 2 ? -1 : 1], hop0: p.hop, jmp: null, sq: 0, v: [0, 0], rp: null, ft: { right: {}, left: {} }, lastStep: -9, lastSide: null, pv: [0, 0] });
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
    // 몸(뿌리)이 움직이는 빠르기: 그림 선수 자리 + 공에 맞추려고 옮긴 만큼(c.off). 발놀림과 몸 돌리기에 쓴다
    const rx0 = p.x + c.off.x, rz0 = p.z + c.off.z;
    // 포인트 사이에 자리를 한 번에 옮긴 것(순간이동)은 달린 것이 아니다: 발을 새 자리에 바로 놓는다(빠르기를 초속 24m로 읽어 발이 몇 m 밖으로 날아갔다)
    const tele = md > Math.max(0.35, pdt * 12);
    if (tele) { c.v = [0, 0]; c.pv = [0, 0]; c.rp = null; c.ft.left.init = c.ft.right.init = false; }
    if (pdt > 0 && c.rp) { const k = Math.min(1, pdt * 12); c.v[0] += ((rx0 - c.rp[0]) / pdt - c.v[0]) * k; c.v[1] += ((rz0 - c.rp[1]) / pdt - c.v[1]) * k; }
    { const vv = Math.hypot(c.v[0], c.v[1]); if (vv > 7) { c.v[0] *= 7 / vv; c.v[1] *= 7 / vv; } }
    c.rp = [rx0, rz0];
    const spd = Math.hypot(c.v[0], c.v[1]), mv = sstep(0.4, 2.5, spd);
    // 선수가 실제로 달리는 빠르기(그림 선수 자리만. 공에 맞추려고 옮긴 양은 빼야 몸 돌리기와 서로 물고 돌지 않는다)
    if (pdt > 0 && !tele) { const k = Math.min(1, pdt * 10); c.pv[0] += (mdx / pdt - c.pv[0]) * k; c.pv[1] += (mdz / pdt - c.pv[1]) * k; }
    const rspd = Math.hypot(c.pv[0], c.pv[1]);
    // 바라보는 쪽: 네트 쪽. 스윙할 때는 보내는 쪽으로 조금(반쯤, 25도까지)
    let yawT = base;
    const aim = inSw ? sw.aim : c.serve?.aim;
    if (aim && Math.hypot(aim[0], aim[1]) > 0.1) { let a = Math.atan2(aim[0], aim[1]) - base; a = Math.atan2(Math.sin(a), Math.cos(a)); yawT = base + clamp(a * 0.4, -15 * D, 15 * D); }   // 보내는 쪽으로 조금만(많이 돌면 공에 맞추려고 몸을 크게 옮긴다)
    // 빨리 옆이나 뒤로 멀리 갈 때는 몸을 가는 쪽으로 돌려 달린다(크로스오버). 뒤로 갈 때(로브)는 오른쪽으로 돌아 옆으로 물러난다. 칠 때가 다가오면 다시 선다
    if (rspd > 2 && id !== 'sv') {
      let rel = Math.atan2(c.pv[0], c.pv[1]) - base; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const off = Math.abs(rel) > 150 * D ? -80 * D : clamp(rel, -80 * D, 80 * D) * sstep(35 * D, 60 * D, Math.abs(rel));
      yawT += off * sstep(2.2, 3.4, rspd) * (inSw ? 1 - sstep(-0.7, -0.35, tc) : 1);
    }
    let dy = yawT - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * (id === 'sv' && inSw ? 1 : Math.min(1, pdt * 8));   // 서브: 바로 그 방향으로(돌면서 공에 맞추려고 몸이 미끄러지지 않게)
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    // 뛰기: 그림 선수의 hop은 순간 올라갔다가 곧게 내려오는 값이라(그림에는 괜찮다) 3D에서는 중력대로 다시 그린다(사용자 2026-11-11: 스플릿이 이상하다).
    // 스플릿 스텝은 살짝 굽혔다가 몇 cm 떠서 발을 벌리며 내려앉고 무릎을 굽힌다. 기뻐서 뛰는 것은 줄여서 뛴다
    if (p.hop > c.hop0 + 0.02 && (p.splitting || p.hop >= 0.12)) c.jmp = jumpOf(!!p.splitting, p.hop);
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
    // 발놀림(사용자 2026-11-11: 걷는 느낌보다 스텝을 쓰는 느낌): 디딘 발은 코트에 붙어 있고, 몸이 움직여 발이 제자리(자세가 원하는 발 자리)에서
    // 멀어지면 한 발씩 재빨리 딛는다. 옆으로 갈 때는 가는 쪽 발이 먼저 나가고 다른 발이 따라붙는다(사이드 스텝, 발이 엇갈리지 않는다).
    // 칠 공을 기다리는 동안(임팩트 0.25~0.9초 전)에는 제자리에서 잔발을 친다. 임팩트 둘레와 서브는 동작(모션캡처)의 발을 쓴다
    const pw = inSw ? (sw.id === 'sv' ? 1 - sstep(-SV_TOSS, -SV_TOSS + 0.15, tc) * (1 - sstep(0.4, 0.8, tc)) : 1 - sstep(-0.3, -0.12, tc) * (1 - sstep(0.35, 0.7, tc))) : 1;
    // 서브: 임팩트까지 앞꿈치는 베이스라인 뒤에(사용자 2026-11-11: 서브할 때 라인 밟지 않게)
    const svSide = id === 'sv' && (c.serve || sw)?.contact ? Math.sign((c.serve || sw).contact.z) : 0, toeK = svSide ? 1 - sstep(0, 0.1, tc) : 0;
    const toIn = sw ? sw.tImpact - this.bt : 9, adj = !!sw && sw.id !== 'sv' && toIn > 0.25 && toIn < 0.9 && spd < 0.6;
    const ctx = { rx: rx0, rz: rz0, cy, sy, yawD: c.yaw / D, pw, adj, air: !!(c.jmp && c.jmp.t < c.jmp.pre + c.jmp.air), spd, thr: adj ? 0.02 : spd < 0.25 ? 0.07 : clamp(0.1 + 0.035 * spd, 0.1, 0.24), bob: 0 };
    const over = {
      foot: (side, f) => {
        if (jw) { const sd = side === 'right' ? -1 : 1; f = [f[0] + sd * jw, f[1], f[2] + sd * jw * 120, f[3]]; }   // 스플릿 착지: 발을 벌리고 발끝을 조금 밖으로
        const o = this.stepFoot(c, side, f, ctx, pdt);
        if (toeK > 0) {
          const wz = rz0 + K * (-o[0] * sy + o[1] * cy), over_ = BASELINE + TOE_GAP - wz * svSide;
          if (over_ > 0) { const dz = over_ * toeK * svSide, dx = 0; o[0] += (dx * cy - dz * sy) / K; o[1] += (dx * sy + dz * cy) / K; }
        }
        return o;
      },
      hip: h => [h[0], h[1] - 0.035 * mv + ctx.bob - c.sq * 0.6 + jhip * jk, h[2], h[3]],
      chest: ch => [ch[0], ch[1] + 8 * mv * Math.min(1, spd / 5), ch[2]],
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
        w = sw.full ? 1 : sstep(-0.75, -0.15, tr) * (1 - sstep(0.12, 0.55, tr));
      } else w = 1;   // 서브 준비
      const lc = Sc.C0.clone().add(dl).multiplyScalar(K), wx = lc.x * Math.cos(c.yaw) + lc.z * Math.sin(c.yaw), wz = -lc.x * Math.sin(c.yaw) + lc.z * Math.cos(c.yaw);
      const need = V3(contact.x - wx - p.x, 0, contact.z - wz - p.z);
      if (sw?.dive) need.clampLength(0, 0.9); else need.clampLength(0, 1.6);
      if (id === 'sv') c.off.lerp(need.multiplyScalar(w), inSw ? 1 : Math.min(1, pdt * 5));
      else {
        // 몸 옮기는 빠르기는 초속 3m까지(튀지 않게). 공이 곧 오는데(발리) 못 닿을 만큼 남았으면 임팩트 0.05초 전까지 닿게 그만큼만 빠르게
        const tgt = need.multiplyScalar(w), d = tgt.sub(c.off), left = sw ? sw.tImpact - 0.05 - this.bt : 1;
        const mx = clamp(left > 0.08 && w > 0.5 ? d.length() / left : 0, 3, 6) * pdt;
        if (d.length() > mx) d.setLength(mx); c.off.add(d);
      }   // 서브: 준비하는 동안 걸어가 서고, 토스부터는 그 자리 그대로
    } else { const L = c.off.length(), mx = 2.2 * pdt; if (L > mx) c.off.multiplyScalar(1 - mx / L); else c.off.set(0, 0, 0); }   // 친 뒤 그림 선수 자리로 돌아갈 때도 초속 2.2m까지
    // 자세는 리그 기준(제자리, 돌리지 않음)으로 만들고 나서 코트 위로 옮긴다
    const key = id + (inSw ? ':' + sw.tImpact.toFixed(3) : ':idle');
    if (key !== c.key) { if (c.last && !(c.key === 'sv:idle' && id === 'sv')) { c.snap = c.last; c.fade = FADE; } c.key = key; if (!inSw) c.release = null; }   // 서브 준비 → 토스는 같은 자세라 섞지 않는다(섞으면 발이 밀린다)
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
      bones.forEach((b, k) => b.quaternion.slerpQuaternions(c.snap.q[k], b.quaternion.clone(), u));
      R.B('hips').position.lerpVectors(c.snap.hips, R.B('hips').position.clone(), u);
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

  // 발 하나(리그 기준 [x, z, 발끝 각(도), 들림])를 정한다. f = 자세가 원하는 자리. 디딘 발은 세계 자리에 붙어 있다
  stepFoot(c, side, f, x, pdt) {
    const F = c.ft[side], O = c.ft[side === 'right' ? 'left' : 'right'], bt = this.bt;
    const toW = (a, b) => [x.rx + K * (a * x.cy + b * x.sy), x.rz + K * (-a * x.sy + b * x.cy)];
    const toR = (wx, wz) => { const dx = (wx - x.rx) / K, dz = (wz - x.rz) / K; return [dx * x.cy - dz * x.sy, dx * x.sy + dz * x.cy]; };
    const [ix, iz] = toW(f[0], f[1]), iy = f[2] + x.yawD;
    if (!F.init || x.air) { F.x = ix; F.z = iz; F.y = iy; F.sw = null; F.init = true; F.err = 0; return f; }   // 뜬 동안은 몸과 같이
    let lift = 0;
    if (F.sw) {
      const W = F.sw; W.t += pdt;
      const u = Math.min(1, W.t / W.T), e = sstep(0, 1, u);
      F.x = W.fx + (W.tx - W.fx) * e; F.z = W.fz + (W.tz - W.fz) * e; F.y = W.fy + W.dy * e;
      lift = W.h * Math.sin(Math.PI * u); x.bob += 0.012 * Math.sin(Math.PI * u);
      if (u >= 1) { F.sw = null; c.lastStep = bt; }
    } else {
      const err = Math.hypot(ix - F.x, iz - F.z), yerr = Math.abs(wrapD(iy - F.y));
      // 가는 쪽 발이 먼저(사이드 스텝), 아니면 번갈아
      const lat = (c.v[0] * x.cy - c.v[1] * x.sy) * (side === 'right' ? -1 : 1);
      F.err = err + yerr / 150 + (lat > 0.3 ? 0.04 : 0) + (c.lastSide === side ? 0 : 0.03);
      // 발이 몸에서 너무 멀면(골반 아래에서 75cm 넘게) 다른 발이 떠 있어도 바로 딛는다(발만 멀리 두고 몸이 가 버리지 않게, 사용자 2026-11-11)
      const far = Math.hypot(F.x - x.rx, F.z - x.rz) > 0.75, run = x.spd > 3.2;
      const want = x.pw > 0.15 && (far || err > x.thr || yerr > 28 || (x.adj && bt - c.lastStep > 0.22));
      if (want && (!O.sw || far || run) && bt - c.lastStep > 0.02 && (far || F.err >= (O.err || 0) - 0.02)) {
        // 빠를수록 짧게 떠서 멀리 딛는다(달리면 한 걸음 1.6m까지). 천천히 움직일 때는 짧은 걸음(참고 값)
        const T = x.adj ? 0.12 : clamp(0.26 - 0.03 * x.spd, 0.11, 0.26), lead = x.spd < 1.5 ? 1.0 : 1.5, maxL = clamp(0.45 + 0.28 * x.spd, 0.6, 1.7);
        let tx = ix + c.v[0] * T * lead, tz = iz + c.v[1] * T * lead;
        const L = Math.hypot(tx - F.x, tz - F.z); if (L > maxL) { tx = F.x + (tx - F.x) * maxL / L; tz = F.z + (tz - F.z) * maxL / L; }
        // 발이 엇갈리지 않게(왼발은 오른발보다 늘 왼쪽에)
        const rt = toR(tx, tz), ro = toR(O.x, O.z);
        if (side === 'left' && rt[0] < ro[0] + 0.14) rt[0] = ro[0] + 0.14;
        if (side === 'right' && rt[0] > ro[0] - 0.14) rt[0] = ro[0] - 0.14;
        [tx, tz] = toW(rt[0], rt[1]);
        const len = Math.hypot(tx - F.x, tz - F.z);
        F.sw = { t: 0, T, fx: F.x, fz: F.z, fy: F.y, tx, tz, dy: wrapD(iy - F.y), h: x.adj ? 0.025 : 0.03 + 0.05 * Math.min(1, len / 0.7) };
        F.err = 0; c.lastSide = side;
      }
    }
    const [rxx, rzz] = toR(F.x, F.z), proc = [rxx, rzz, F.y - x.yawD, lift + Math.max(0, f[3])];
    if (x.pw >= 1) return proc;
    // 동작의 발로 넘어간다(그 자리를 디딘 자리로 삼아 끊기지 않게)
    const dyaw = wrapD(f[2] - proc[2]), q = 1 - x.pw;
    const out = [proc[0] + (f[0] - proc[0]) * q, proc[1] + (f[1] - proc[1]) * q, proc[2] + dyaw * q, proc[3] + (f[3] - proc[3]) * q];
    if (!F.sw) { [F.x, F.z] = toW(out[0], out[1]); F.y = out[2] + x.yawD; }
    return out;
  }

  dispose() {
    for (const c of this.list) { this.view.scene.remove(c.vrm.scene); c.vrm.scene.traverse(o => { if (o.isMesh) { for (const m of [o.material].flat()) m.dispose(); } }); }
    this.list = []; this.ready = false;
  }
}
