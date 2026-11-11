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
const K = 1.12;   // 키(그림 선수가 실제보다 크게 보여서 맞춘다)
const FADE = 0.16;   // 동작이 바뀔 때 앞 자세에서 넘어가는 시간(초)

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
    // 기다리는 자세는 손으로 짠 준비 자세(모션캡처 스윙의 첫 자세는 이미 준비 동작 중이라): 뒤에서는 포핸드, 네트 앞에서는 발리 준비
    for (const [rid, sid] of [['readyB', 'fh'], ['readyN', 'fv']]) {
      const d = SHOTS.find(x => x.id === sid);
      rigs[0].setShot({ ...d, id: rid, keys: d.handKeys || d.keys, bevel: d.handBevel ?? d.bevel, toss: d.handToss ?? d.toss, step: d.handStep ?? d.step, lroll: d.handLroll, rollK: 0, chestPoles: false });
      this.shots[rid] = rigs[0].S; await yieldFrame(); if (!this.view.alive) return false;
    }
    for (let i = 0; i < 4; i++) {
      const vrm = vrms[i], p = this.view.players[i];
      this.view.scene.add(vrm.scene);
      this.list.push({ vrm, rig: rigs[i], team: i < 2 ? 0 : 1, sw: null, key: '', yaw: i < 2 ? Math.PI : 0, ph: 0, wg: 0, off: V3(), last: null, fade: 0, snap: null, px: p.x, pz: p.z, dir: [0, i < 2 ? -1 : 1] });
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
    c.sw = { id, tImpact: this.bt + dt, tStart: this.bt + dt - lead, contact: contact ? contact.clone() : null, aim, full: !!opt.full, tail: Math.min(S.T1, 1.0), dive: !!opt.dive };
  }
  // 서브: 포인트를 시작할 때부터 서브 준비 자세로 공이 맞을 자리에 맞춰 선다
  prepServe(i, contact, aim) {
    const c = this.list[i]; if (!c) return;
    c.serve = { contact: contact.clone(), aim };
  }
  // 서브 토스 동안 공 자리(왼손에 있다가 놓으면 맞을 자리로 올라갔다 떨어진다). 없으면 null
  tossBall(i) {
    const c = this.list[i]; if (!c?.sw || c.sw.id !== 'sv' || !c.handW) return null;
    const S = this.shots.sv, tc = this.bt - c.sw.tImpact;
    if (tc < S.toss) return c.handW.clone();
    if (!c.release) c.release = c.handW.clone();
    const P = c.release, Q = c.sw.contact, T = -S.toss, u = tc - S.toss, G = 9.8;
    if (!Q) return P.clone();
    const vy = (Q.y - P.y + 0.5 * G * T * T) / T;
    return V3(P.x + (Q.x - P.x) * u / T, P.y + vy * u - 0.5 * G * u * u, P.z + (Q.z - P.z) * u / T);
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
    if (sw && this.bt > sw.tImpact + sw.tail) { if (sw.id === 'sv') c.serve = null; c.sw = sw = null; c.release = null; }
    const inSw = sw && this.bt >= sw.tStart;
    const id = inSw ? sw.id : c.serve ? 'sv' : Math.abs(p.z) < 6.5 ? 'readyN' : 'readyB', S = this.shots[id];
    const tc = inSw ? clamp(this.bt - sw.tImpact, S.T0, S.T1) : S.T0;
    // 움직임: 그림 선수의 자리를 따라간다. 달리는 쪽(세계)과 빠르기
    const mdx = p.x - c.px, mdz = p.z - c.pz, md = Math.hypot(mdx, mdz); c.px = p.x; c.pz = p.z;
    if (md > 1e-4) c.dir = [mdx / md, mdz / md];
    const spd = pdt > 0 ? md / pdt : 0;
    c.wg += ((spd > 0.35 ? clamp(spd / 1.6, 0, 1) : 0) - c.wg) * Math.min(1, pdt * 10);
    // 바라보는 쪽: 네트 쪽. 스윙할 때는 보내는 쪽으로 조금(반쯤, 25도까지)
    let yawT = base;
    const aim = inSw ? sw.aim : c.serve?.aim;
    if (aim && Math.hypot(aim[0], aim[1]) > 0.1) { let a = Math.atan2(aim[0], aim[1]) - base; a = Math.atan2(Math.sin(a), Math.cos(a)); yawT = base + clamp(a * 0.5, -25 * D, 25 * D); }
    let dy = yawT - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, pdt * 8);
    // 달리기(발을 번갈아 디딘다): 리그 기준(+z 앞, +x 왼쪽)으로 가는 쪽
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), lx = c.dir[0] * cy - c.dir[1] * sy, lz = c.dir[0] * sy + c.dir[1] * cy;
    const stride = clamp(0.9 + 0.22 * spd, 1.0, 2.6);
    c.ph += spd * pdt / stride * Math.PI * 2;
    const wg = c.wg * (inSw ? 1 - 0.7 * sstep(-0.3, -0.05, tc) * (1 - sstep(0.25, 0.6, tc)) : 1), A = stride * 0.24, hgt = 0.05 + 0.025 * Math.min(spd, 6);
    const over = wg > 0.01 || p.sq > 0.01 ? {
      foot: (side, f) => {
        const ph = c.ph + (side === 'right' ? 0 : Math.PI), s = Math.sin(ph), bx = side === 'right' ? -0.13 : 0.13;
        const g = [bx + lx * A * s, 0.04 + lz * A * s, (side === 'right' ? -1 : 1) * 6, Math.max(0, Math.cos(ph)) * hgt];
        return f.map((x, k) => x + (g[k] - x) * wg);
      },
      hip: h => [h[0], h[1] + wg * (0.025 * Math.cos(2 * c.ph) - 0.03) - p.sq * 0.6, h[2], h[3]],
      chest: ch => [ch[0], ch[1] + wg * 8 * Math.min(1, spd / 5), ch[2]],
    } : null;
    // 공 높이는 IK로(리그 기준 높이 차이, 사람 범위 안), 앞뒤·옆은 몸을 옮겨 맞춘다
    const contact = inSw ? sw.contact : c.serve?.contact;
    let dl = V3();
    if (contact) dl.y = clamp(contact.y / K - S.C0.y, -0.45, 0.38);
    // 뿌리 맞추기: 임팩트 때 라켓 가운데(C0 + dl)가 공에 오는 자리 - 지금 자리. 임팩트 앞뒤로만(서브는 처음부터 끝까지)
    let w = 0;
    if (contact) {
      if (inSw && sw.id === 'sv') w = 1 - sstep(0.3, 0.9, tc);   // 서브: 처음부터 맞춰 서 있다가 착지 뒤 풀린다
      else if (inSw) w = sw.full ? 1 : sstep(-0.5, -0.08, tc) * (1 - sstep(0.12, 0.55, tc));
      else w = 1;   // 서브 준비
      const lc = S.C0.clone().add(dl).multiplyScalar(K), wx = lc.x * Math.cos(c.yaw) + lc.z * Math.sin(c.yaw), wz = -lc.x * Math.sin(c.yaw) + lc.z * Math.cos(c.yaw);
      const need = V3(contact.x - wx - p.x, 0, contact.z - wz - p.z);
      if (sw?.dive) need.clampLength(0, 0.9); else need.clampLength(0, 1.6);
      c.off.lerp(need.multiplyScalar(w), Math.min(1, pdt * 30));
    } else c.off.multiplyScalar(Math.max(0, 1 - pdt * 6));
    // 자세는 리그 기준(제자리, 돌리지 않음)으로 만들고 나서 코트 위로 옮긴다
    const key = id + (inSw ? ':' + sw.tImpact.toFixed(3) : ':idle');
    if (key !== c.key) { if (c.last) { c.snap = c.last; c.fade = FADE; } c.key = key; if (!inSw) c.release = null; }
    vrm.scene.position.set(0, 0, 0); vrm.scene.rotation.set(0, 0, 0); vrm.scene.scale.setScalar(1); vrm.scene.updateMatrixWorld(true);
    R.useShot(S);
    R.pose(tc, dl, null, over || undefined);
    // 고개: 공(보이면) 쪽, 아니면 네트 너머
    const bp = v.ball?.visible ? v.ball.position : V3(0, 1.2, team === 0 ? -8 : 8);
    const rx = p.x + c.off.x, rz = p.z + c.off.z, tx = (bp.x - rx) / K, tz = (bp.z - rz) / K;
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
    vrm.scene.position.set(rx, p.hop, rz); vrm.scene.rotation.set(0, c.yaw, 0); vrm.scene.scale.setScalar(K);
    vrm.scene.updateMatrixWorld(true);
    vrm.update(dt);
    // 서브 토스용: 왼손(공을 쥔 곳)의 세계 자리
    if (id === 'sv') c.handW = R.handBall();
  }

  dispose() {
    for (const c of this.list) { this.view.scene.remove(c.vrm.scene); c.vrm.scene.traverse(o => { if (o.isMesh) { for (const m of [o.material].flat()) m.dispose(); } }); }
    this.list = []; this.ready = false;
  }
}
