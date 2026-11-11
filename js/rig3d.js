// 3D 캐릭터 리그: VRM 캐릭터에 스윙(js/swings.js)을 입히고 IK로 라켓 가운데를 공에 맞힌다.
// tools/char3d/swing.html(시험·관절 잡기)과 경기 중계(js/players3d.js)가 같이 쓴다. 연출만이고 경기 결과와는 상관없다.
// 좌표는 선수 기준(발 사이 바닥이 원점, +z가 네트 쪽, +x가 선수의 왼쪽). 캐릭터를 옮기고 돌리는 것은 부르는 쪽이 vrm.scene으로 한다
import * as THREE from 'three';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const D = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 캐릭터 하나에 리그를 만든다. 샷 준비(setShot)는 캐릭터 몸 크기에만 달려 있어서, 같은 모델이면 준비한 샷(S)을 useShot으로 나눠 쓸 수 있다
export function createRig(vrm) {
  const H = vrm.humanoid, B = n => H.getNormalizedBoneNode(n);
  const BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand'].filter(n => B(n));
  // 처음(T 자세) 자리
  for (const n of BONES) B(n).quaternion.identity();
  vrm.scene.updateMatrixWorld(true);
  const REST = {}; for (const n of BONES) REST[n] = B(n).getWorldPosition(V3());
  const HIPS0 = B('hips').position.clone();
  const ARM = REST.rightUpperArm.distanceTo(REST.rightLowerArm) + REST.rightLowerArm.distanceTo(REST.rightHand);
  const ANKLE = REST.rightFoot.y;

  // ── 라켓: 원점은 손잡이 가운데, +Y가 라켓 머리 쪽, +Z가 줄 면의 앞 ──
  const SWEET = 0.45;
  const racket = new THREE.Group();
  {
    const dark = new THREE.MeshToonMaterial({ color: 0x2a2a30 }), frame = new THREE.MeshToonMaterial({ color: 0xff6f8e }), white = new THREE.MeshToonMaterial({ color: 0xf4f4f4 });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.2, 10), dark); grip.position.y = 0.02; racket.add(grip);
    for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.2, 6), frame); t.position.set(sx * 0.045, 0.215, 0); t.rotation.z = -sx * 0.28; racket.add(t); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), frame); ring.scale.set(0.128, 0.168, 0.13); ring.position.y = SWEET + 0.02; racket.add(ring);
    const cnv = document.createElement('canvas'); cnv.width = cnv.height = 128; const cx = cnv.getContext('2d');
    cx.strokeStyle = '#ffffffcc'; cx.lineWidth = 2; for (let i = 4; i < 128; i += 10) { cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i, 128); cx.moveTo(0, i); cx.lineTo(128, i); cx.stroke(); }
    const str = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cnv), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    str.scale.set(0.122, 0.162, 1); str.position.y = SWEET + 0.02; racket.add(str);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.02, 10), white); cap.position.y = -0.085; racket.add(cap);
    racket.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  // 손에 쥐는 법(오른손 기준, 손의 처음 방향: 손가락 -x, 손바닥 -y, 엄지 +z). 이스턴~세미웨스턴: 손잡이가 손바닥을 비스듬히(검지 뿌리 → 새끼 쪽 손바닥 아래) 지나고
  // 줄 면은 손바닥과 나란하다. 손잡이 축은 손가락 뿌리 아래 약 3cm를 지나고, 끝(버트)은 새끼손가락 바로 밖에 온다. 손가락은 손잡이를 감싸게 굽힌다(setFingers)
  // 샷마다 손잡이를 축으로 손을 돌려 쥔다(bevel, 도): 0은 이스턴 포핸드, 컨티넨탈은 한 칸(45도) 돌린 것
  const GRIP_SHAFT = V3(-0.45, 0, 0.89).normalize(), GRIP_FACE = V3(0, -1, 0);
  const GRIP_POS = V3(-0.062, -0.024, 0.002).add(GRIP_SHAFT.clone().multiplyScalar(0.04));
  const GRIP_M = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(GRIP_SHAFT, GRIP_FACE), GRIP_SHAFT, GRIP_FACE);   // 라켓의 x,y,z → 손 기준(x = y × z)
  racket.matrixAutoUpdate = false; B('rightHand').add(racket);
  const gripOf = bevel => GRIP_M.clone().multiply(new THREE.Matrix4().makeRotationY(bevel * D));
  // 왼손: 오른손 쥐는 법을 거울에 비춘 것. 라켓 목을 잡을 때(throat)와 양손 백핸드에서 손잡이 위쪽을 잡을 때(grip2)
  const GRIP_SHAFT_L = V3(0.45, 0, 0.89).normalize();
  const gripQL = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(GRIP_SHAFT_L, GRIP_FACE), GRIP_SHAFT_L, GRIP_FACE));
  const HOLD = {
    throat: { y: 0.17, depth: -0.0275, curl: 0.92, free: true },   // 라켓 목: 목 둘레 어디든 손목이 편한 쪽
    grip2: { y: 0.09, depth: -0.024, curl: 1, free: false },       // 양손 백핸드 위쪽 손: 왼손 이스턴 포핸드로 고정
  };
  for (const h of Object.values(HOLD)) h.pos = V3(0.062, h.depth, 0.002).add(GRIP_SHAFT_L.clone().multiplyScalar(-0.005 - h.y));
  // 원하는 라켓 방향(손잡이→머리 s, 줄 면 앞 f)이 되는 손의 세계 회전
  function racketQuatFor(s, f) {
    s = s.clone().normalize(); f = f.clone().sub(s.clone().multiplyScalar(f.dot(s))).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(s, f), s, f));   // 라켓의 세계 회전
  }
  const handQuatFor = (s, f, t = 0) => racketQuatFor(s, f).multiply(gripAt(t).clone().invert());
  // 손목 자리에서 라켓 가운데(스윗 스폿)까지(손잡이 축 둘레로 돌려 쥐어도 같다)
  const SWEET_IN_HAND = GRIP_POS.clone().add(V3(0, SWEET, 0).applyMatrix4(new THREE.Matrix4().extractRotation(GRIP_M)));
  function sweetFrom(wrist, hq) { return SWEET_IN_HAND.clone().applyQuaternion(hq).add(wrist); }

  // 손가락: 손잡이를 감싸는 각도(도). 손잡이 축에 마디가 고르게 닿도록 맞춘 값이다(손가락 두께 포함)
  const CURL = { Index: [30, 48, 39], Middle: [48, 58, 48], Ring: [60, 46, 42], Little: [64, 38, 30] };
  const THUMB = { opp: 37.5, flex: [-10, 0, 52] };   // 엄지는 손바닥 쪽으로 돌려(맞섬) 손잡이 너머 검지 쪽으로 감는다
  const FAX = V3(0, 0, 1).lerp(GRIP_SHAFT, 0.55).normalize(), TAX = V3(0.65, 0, 0.76).normalize(), OAX = V3(1, 0, 0);
  const mirAx = v => V3(v.x, -v.y, -v.z);   // 축(회전)을 왼손으로 비출 때
  const FINGER_BONES = [];
  for (const s of ['right', 'left']) { for (const f of Object.keys(CURL)) for (const j of ['Proximal', 'Intermediate', 'Distal']) FINGER_BONES.push(s + f + j); for (const j of ['Metacarpal', 'Proximal', 'Distal']) FINGER_BONES.push(s + 'Thumb' + j); }
  function setFingers(side, k) {
    const R = side === 'right', fax = R ? FAX : mirAx(FAX), tax = R ? TAX : mirAx(TAX), oax = R ? OAX : mirAx(OAX);
    for (const [f, a] of Object.entries(CURL)) ['Proximal', 'Intermediate', 'Distal'].forEach((j, i) => B(side + f + j)?.quaternion.setFromAxisAngle(fax, a[i] * k * D));
    B(side + 'ThumbMetacarpal')?.quaternion.setFromAxisAngle(oax, THUMB.opp * k * D).multiply(new THREE.Quaternion().setFromAxisAngle(tax, THUMB.flex[0] * k * D));
    B(side + 'ThumbProximal')?.quaternion.setFromAxisAngle(tax, THUMB.flex[1] * k * D);
    B(side + 'ThumbDistal')?.quaternion.setFromAxisAngle(tax, THUMB.flex[2] * k * D);
  }


  const GUARD = { pole: true, racket: true };   // 사람 범위 지키기·라켓 비키기(시험할 때 끌 수 있다)
  // 지금 샷. rollK: 라켓을 축으로 돌리는 것을 얼마나 아낄지(모션캡처 샷은 손목 회전이 실제라 크게)
  let S = null;
  const sampleKeys = (L, t, key, sub) => {
    const n = L.length; t = clamp(t, L[0].t, L[n - 1].t);
    let i = 0; while (i < n - 2 && L[i + 1].t <= t) i++;
    const P = j => { const x = L[j][key]; return typeof x === 'string' ? sub : x; };
    const tan = j => { const b = P(j); if (j === 0 || j === n - 1) return b.map(() => 0); const a = P(j - 1), c = P(j + 1), h0 = L[j].t - L[j - 1].t, h1 = L[j + 1].t - L[j].t; return b.map((_, k) => ((b[k] - a[k]) / h0 * h1 + (c[k] - b[k]) / h1 * h0) / (h0 + h1)); };
    const h = L[i + 1].t - L[i].t, u = (t - L[i].t) / h, p1 = P(i), p2 = P(i + 1), m1 = tan(i), m2 = tan(i + 1);
    const u2 = u * u, u3 = u2 * u, a = 2 * u3 - 3 * u2 + 1, b = u3 - 2 * u2 + u, c = -2 * u3 + 3 * u2, d = u3 - u2;
    return p1.map((_, k) => a * p1[k] + b * h * m1[k] + c * p2[k] + d * h * m2[k]);
  };
  // 키 사이를 부드럽게: 키 간격이 달라도 빠르기가 키에서 끊기지 않게(시간 기준 허밋 곡선). 처음과 끝 키에서는 멈춰 있다
  const chan = key => S.CH[key] || (S.CH[key] = S.K.filter(k => k[key] !== undefined));
  const has = key => chan(key).length > 0;
  function sample(t, key, sub) { return sampleKeys(chan(key), t, key, sub); }
  const sampleQ = (t, key = 'rq') => new THREE.Quaternion().fromArray(sample(t, key)).normalize();
  // 손잡이를 쥔 각(bevel)은 키로 바꿀 수 있다(왼손이 라켓 목을 잡고 돌려 쥐는 법을 바꾸는 것). 없으면 샷의 값
  const bevelAt = t => has('bevel') ? sample(t, 'bevel')[0] : S.bevel;
  const gripAt = t => new THREE.Quaternion().setFromRotationMatrix(gripOf(bevelAt(t)));
  // 그 순간 손의 회전(키마다 정한 라켓 방향을 그때 쥐는 법으로 바꿔 둔 것을 잇는다. 쥐는 법을 바꾸는 동안에는 손은 그대로 두고 라켓이 손 안에서 돈다)
  const handAt = t => sampleQ(t, 'hq');
  const racketAt = t => handAt(t).multiply(gripAt(t));
  // 왼손이 라켓을 잡는 정도(0~1)와 잡는 곳
  function holdAt(t) {
    const L = chan('lh'); t = clamp(t, L[0].t, L[L.length - 1].t - 1e-6); let i = 0; while (L[i + 1].t <= t) i++;
    const W = k => typeof k.lh === 'string' ? 1 : 0, type = typeof L[i].lh === 'string' ? L[i].lh : typeof L[i + 1].lh === 'string' ? L[i + 1].lh : 'throat';
    return { w: W(L[i]) + (W(L[i + 1]) - W(L[i])) * sstep(0, 1, (t - L[i].t) / (L[i + 1].t - L[i].t)), type };
  }
  const ballsOf = () => Object.fromEntries(Object.entries(S.balls).map(([k, [name, d]]) => [k, { name, d }]));
  // 고치는 무게: 테이크백까지는 0, 임팩트에 1, 팔로스로에서 풀린다(스윙 모양은 그대로, 임팩트 근처만 바꾼다)
  const corrW = t => t < 0 ? sstep(-0.5, 0, t) : 1 - 0.7 * sstep(0, 0.35, t) - 0.3 * sstep(0.35, 0.9, t);
  const stepW = (t, who) => { const [a, b, c, d] = S.step[who]; return sstep(a, b, t) * (1 - sstep(c, d, t)); };
  // 공 높이에 맞춰 라켓 머리를 떨어뜨리거나 세우는 양
  const tiltOf = dl => clamp(dl.y * 62, -30, 22) * D;
  // 줄 면을 처음 정한 대로 지키는 정도: 임팩트 앞뒤에서만
  const faceW = t => 1 - sstep(0.05, 0.22, Math.abs(t));
  // 왼손이 잡으러 가기 시작하면(조금이라도) 잡을 손목 모양이 편한지 따진다
  const holdWgt = tw => tw > 0 ? 0.25 + 0.75 * tw : 0;

  // ── IK ──
  const wp = (n, v = V3()) => B(n).getWorldPosition(v);
  const _pq = new THREE.Quaternion();
  function setWorldQuat(node, wq) { node.parent.getWorldQuaternion(_pq); node.quaternion.copy(_pq.invert().multiply(wq)); node.updateMatrixWorld(true); }
  // 팔·다리: 위 마디(어깨·엉덩이) → 가운데 마디(팔꿈치·무릎, 경첩) → 끝(손목·발목). h는 경첩 축(이 축으로 양의 회전이 굽힘), fb는 pole이 팔다리와 나란할 때 대신 쓸 쪽
  const LIMB = {};
  function limb(name, up, mid, end, h, fb) {
    const a0 = REST[mid].clone().sub(REST[up]).normalize(), a1 = REST[end].clone().sub(REST[mid]).normalize();
    const h0 = h.clone().sub(a0.clone().multiplyScalar(h.dot(a0))).normalize(), f0 = h0.clone().cross(a0);
    LIMB[name] = { up, mid, end, h0, fb, l1: REST[up].distanceTo(REST[mid]), l2: REST[mid].distanceTo(REST[end]),
      restT: new THREE.Matrix4().makeBasis(a0, f0, h0).transpose(), th0: Math.atan2(a1.dot(f0), a1.dot(a0)) };
  }
  limb('rightArm', 'rightUpperArm', 'rightLowerArm', 'rightHand', V3(0, 1, 0), V3(-1, -0.2, -0.3));
  limb('leftArm', 'leftUpperArm', 'leftLowerArm', 'leftHand', V3(0, -1, 0), V3(1, -0.2, -0.3));
  limb('rightLeg', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', V3(1, 0, 0), V3(0, 0, 1));
  limb('leftLeg', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', V3(1, 0, 0), V3(0, 0, 1));
  for (const n of ['rightArm', 'leftArm']) { const L = LIMB[n]; L.dMin = Math.sqrt(L.l1 * L.l1 + L.l2 * L.l2 - 2 * L.l1 * L.l2 * Math.cos(Math.PI - 150 * D)); }   // 팔꿈치는 150도까지만 접힌다
  // 두 마디 IK. 팔꿈치·무릎은 경첩이라 옆으로 꺾이지 않고 거꾸로 펴지지 않는다(위 마디가 굽는 면에 맞춰 돈다).
  // 거의 다 펴질 때는 부드럽게 늦춰서 툭 펴지지 않게 한다. 돌려주는 값은 닿지 못한 길이
  function ik(L, target, pole) {
    const pa = wp(L.up), want = target.clone().sub(pa), dist = Math.max(1e-6, want.length()), dir = want.divideScalar(dist);
    const Lm = L.l1 + L.l2, ds = Lm * 0.96;
    let d = dist > ds ? ds + (Lm - ds) * (1 - Math.exp(-(dist - ds) / (Lm - ds))) : dist;
    d = Math.max(d, L.dMin ?? Math.abs(L.l1 - L.l2) + 0.03);
    const x = (L.l1 * L.l1 - L.l2 * L.l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L.l1 * L.l1 - x * x));
    const perp = v => { const n = v.clone().normalize(); return n.sub(dir.clone().multiplyScalar(n.dot(dir))); };
    const pd = perp(pole), len = pd.length();
    if (len < 0.45) pd.add(perp(L.fb).multiplyScalar(sstep(0.45, 0.1, len)));
    pd.normalize();
    const u = dir.clone().multiplyScalar(x).add(pd.clone().multiplyScalar(h)).divideScalar(L.l1);   // 위 마디 방향
    const b = dir.clone().multiplyScalar(h).sub(pd.clone().multiplyScalar(x)).divideScalar(L.l1);   // 아래 마디가 굽어 가는 쪽
    const m = new THREE.Matrix4().makeBasis(u, b, u.clone().cross(b)).multiply(L.restT);
    setWorldQuat(B(L.up), new THREE.Quaternion().setFromRotationMatrix(m));
    const fd = dir.clone().multiplyScalar(d - x).sub(pd.multiplyScalar(h)).divideScalar(L.l2);
    B(L.mid).quaternion.setFromAxisAngle(L.h0, Math.atan2(fd.dot(b), fd.dot(u)) - L.th0);
    B(L.mid).updateMatrixWorld(true);
    return dist - d;
  }
  // 손목: 아래팔을 축으로 도는 것(엎침·뒤침 ±90도)과 손목 꺾임(손바닥 쪽 75, 손등 쪽 70, 엄지 쪽 20, 새끼 쪽 30도)을 사람 범위 안으로 부드럽게 묶는다
  const soft = (x, lo, hi) => { const m = (lo + hi) / 2, r = (hi - lo) / 2, u = (x - m) / r, a = Math.abs(u), k = 0.7; return m + Math.sign(u) * (a < k ? a : k + (1 - k) * Math.tanh((a - k) / (1 - k))) * r; };
  const WR = { right: V3(-1, 0, 0), left: V3(1, 0, 0) }, PALM = V3(0, -1, 0), THUMBV = V3(0, 0, 1);
  // 아래팔 기준 손 회전 → [엎침·뒤침, 손바닥 쪽 꺾임, 엄지 쪽 꺾임](라디안). 꺾임은 (꺾인 각 × 쪽)이라 어느 쪽으로 크게 꺾여도 끊기지 않는다
  function wristAngles(side, qh) {
    const aH = WR[side];
    let psi = 2 * Math.atan2(aH.dot(V3(qh.x, qh.y, qh.z)), qh.w); psi = Math.atan2(Math.sin(psi), Math.cos(psi));
    const dd = aH.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(aH, psi).invert().multiply(qh));
    const th = Math.acos(clamp(dd.dot(aH), -1, 1)), p = dd.dot(PALM), u = dd.dot(THUMBV), r = Math.hypot(p, u) || 1;
    return [psi, th * p / r, th * u / r];
  }
  const ex = (x, lo, hi) => x < lo ? lo - x : x > hi ? x - hi : 0;
  // 비틀림이 150도를 넘으면(곧 반대쪽으로 뒤집히는 자리) 아주 비싸게: 기준 곡선이 그 경계를 건너지 않게
  // 편하다고 보는 범위: [비틀림, 손등 쪽, 손바닥 쪽, 새끼 쪽, 엄지 쪽, 가운데로 끄는 힘]. 샷마다 좁힐 수 있다(wc). 이 범위를 넘는 만큼 비싸다(실제로 묶는 한계는 wrist()의 사람 한계)
  const WC0 = [75, -60, 65, -25, 15, 0.0005];
  const wristCost = ([p, f, d]) => { const w = (S && S.wc) || WC0; p /= D; f /= D; d /= D; return ex(p, -w[0], w[0]) ** 2 + ex(f, w[1], w[2]) ** 2 + 2 * ex(d, w[3], w[4]) ** 2 + w[5] * (p * p + f * f + 2 * d * d) + (Math.abs(p) > 150 ? 1e5 : 0); };
  wrist.raw = {};
  function wrist(side, want, k = 1) {
    const aH = WR[side], hand = B(side + 'Hand'), la = new THREE.Quaternion();
    B(side + 'LowerArm').getWorldQuaternion(la);
    let [psi, fl0, dv0] = wristAngles(side, la.clone().invert().multiply(want)); psi *= k; fl0 *= k; dv0 *= k; wrist.raw[side] = [psi / D, fl0 / D, dv0 / D];
    // 꺾인 쪽의 한계(손바닥 75, 손등 70, 엄지 20, 새끼 30도를 잇는 타원)까지 부드럽게 묶는다
    const th = Math.hypot(fl0, dv0), cf = th ? fl0 / th : 1, cu = th ? dv0 / th : 0;
    const lim = 1 / Math.hypot(cf / ((cf >= 0 ? 75 : 70) * D), cu / ((cu >= 0 ? 20 : 30) * D));
    const thc = soft(th, -lim, lim);
    const dc = aH.clone().multiplyScalar(Math.cos(thc)).add(PALM.clone().multiplyScalar(Math.sin(thc) * cf)).add(THUMBV.clone().multiplyScalar(Math.sin(thc) * cu)).normalize();
    hand.quaternion.setFromAxisAngle(aH, soft(psi, -90 * D, 90 * D)).multiply(new THREE.Quaternion().setFromUnitVectors(aH, dc));
    hand.updateMatrixWorld(true);
    return la.multiply(hand.quaternion);
  }
  const lowerArmInv = side => { const q = new THREE.Quaternion(); B(side + 'LowerArm').getWorldQuaternion(q); return q.invert(); };
  // 위팔 돌림(해부학 중립: 팔꿈치를 굽히면 손이 몸 앞·안쪽으로 오는 쪽). 바깥돌림이 +
  function shoulderRot(side) {
    const sx = side === 'right' ? 1 : -1, ch = new THREE.Quaternion(); B('upperChest').getWorldQuaternion(ch);
    const sh = wp(side + 'UpperArm'), el = wp(side + 'LowerArm'), wr = wp(side + 'Hand'), d = el.clone().sub(sh).normalize(), fa = wr.clone().sub(el), bb = fa.sub(d.clone().multiplyScalar(fa.dot(d)));
    if (bb.length() < 1e-3) return 0; bb.normalize();
    const F = V3(0.3 * sx, 0.3, 1).applyQuaternion(ch), fn = F.sub(d.clone().multiplyScalar(F.dot(d))).normalize();
    return -sx * Math.atan2(fn.clone().cross(bb).dot(d), fn.dot(bb)) / D;
  }
  // 팔꿈치 스위블: 어깨-손목 축 둘레로 팔꿈치가 나온 쪽의 각(도). 기준 방향은 가슴에 붙은 방향을 그 축으로 가장 짧게 돌려 얻는다
  // (오른팔이 왼쪽 위 뒤를 가리킬 때만 정해지지 않는데, 거의 쓰지 않는 쪽이다). 키 사이는 이 각을 이어서 팔꿈치가 축 둘레로 고르게 돈다
  const SW_REST = { right: { a: V3(-0.4, -0.6, 0.7).normalize(), g: V3(-0.5, -0.6, -0.6) }, left: { a: V3(0.4, -0.6, 0.7).normalize(), g: V3(0.5, -0.6, -0.6) } };
  for (const r of Object.values(SW_REST)) r.r = r.g.clone().sub(r.a.clone().multiplyScalar(r.g.dot(r.a))).normalize();
  function swRef(side, ax) {
    const ch = new THREE.Quaternion(); B('upperChest').getWorldQuaternion(ch);
    const R = SW_REST[side], axC = ax.clone().applyQuaternion(ch.clone().invert());
    const ref = R.r.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(R.a, axC)).applyQuaternion(ch);
    return ref.sub(ax.clone().multiplyScalar(ref.dot(ax))).normalize();
  }
  const poleFromSw = (side, ax, deg) => swRef(side, ax).applyAxisAngle(ax, deg * D);
  function swOf(side, ax, p) { const ref = swRef(side, ax), v = p.clone().sub(ax.clone().multiplyScalar(p.dot(ax))); return Math.atan2(ref.clone().cross(v).dot(ax), ref.dot(v)) / D; }
  const wrapD = a => ((a % 360) + 540) % 360 - 180;
  // 팔꿈치가 몸통에 너무 가까운 양(m)
  // 어깨가 사람 범위를 넘는 정도(도). 위팔이 몸 뒤로 45도보다, 몸 앞 너머로 150도보다 가는 것(팔이 옆으로 누웠을 때만),
  // 팔꿈치가 몸통 안으로 들어가는 것. 위팔 돌림은 팔이 위로 갈 때 재는 기준이 ±180도에서 끊겨(서브 레이백) 넣지 않는다
  function armViol(side) {
    const cq = new THREE.Quaternion(); B('upperChest').getWorldQuaternion(cq);
    const L = LIMB[side + 'Arm'], u = wp(L.mid).sub(wp(L.up)).normalize().applyQuaternion(cq.invert());
    const lat = side === 'right' ? -1 : 1, hz = Math.hypot(u.x, u.z);
    let v = 0;
    if (hz > 0.3) v += ex(Math.atan2(u.z, lat * u.x) / D, -45, 150) * Math.min(1, (hz - 0.3) / 0.3);
    return v + 400 * elbowIn(side);
  }
  // 범위를 넘으면 팔꿈치를 어깨-손목 축 둘레로 돌려(손목 자리는 그대로) 사람 자세로. 돌리는 각(도).
  // 0도에서 시작해 가까운 쪽으로 조금씩 찾아가서(넘친 정도² × 4 + 돌린 각²가 작아지는 쪽) 시간에 따라 매끄럽게 바뀐다
  function limitDelta(side, tg, pole) {
    const L = LIMB[side + 'Arm'], ax = tg.clone().sub(wp(L.up)).normalize();
    const f = dd => { ik(L, tg, pole.clone().applyAxisAngle(ax, dd * D)); const v = armViol(side); return 4 * v * v + dd * dd; };
    let x = 0, fx = f(0), step = 8;
    if (fx < 0.01) return 0;
    for (let it = 0; it < 14 && step > 0.4; it++) {
      const fp = f(x + step), fm = f(x - step);
      if (fp < fx && fp <= fm) { x += step; fx = fp; } else if (fm < fx) { x -= step; fx = fm; } else step /= 2;
    }
    return x;
  }
  // 라켓(줄 테·목·손잡이, 손잡이를 쥔 두 손 자리 포함)이 몸(몸통·머리·허벅지·정강이)에 1.2cm보다 가까이 들어간 가장 깊은 곳
  const RK_PTS = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; RK_PTS.push(V3(Math.cos(a) * 0.13, SWEET + 0.02 + Math.sin(a) * 0.17, 0)); }
  for (const y of [-0.06, 0.04, 0.12, 0.2, 0.3]) RK_PTS.push(V3(0, y, 0));
  function racketPen(margin = 0.012, all = null) {
    racket.updateMatrixWorld(true);
    const hd = wp('head'), caps = [[wp('hips').add(V3(0, 0.05, 0)), wp('neck'), 0.115], [hd.clone().add(V3(0, 0.09, 0.01)), hd.clone().add(V3(0, 0.1, 0.01)), 0.105],
      [wp('rightUpperLeg'), wp('rightLowerLeg'), 0.07], [wp('leftUpperLeg'), wp('leftLowerLeg'), 0.07], [wp('rightLowerLeg'), wp('rightFoot'), 0.05], [wp('leftLowerLeg'), wp('leftFoot'), 0.05]];
    let best = null;
    for (const lp of RK_PTS) {
      const p = lp.clone().applyMatrix4(racket.matrixWorld);
      for (const [a, b, r] of caps) {
        const ab = b.clone().sub(a), u = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1), dv = p.clone().sub(a.clone().add(ab.multiplyScalar(u))), dist = dv.length(), d = r + margin - dist;
        if (d > 0) { const hit = { d, p, n: dist > 1e-6 ? dv.divideScalar(dist) : V3(0, 0, 1) }; all?.push(hit); if (!best || d > best.d) best = hit; }
      }
    }
    return best;
  }
  // 몸통 캡슐 안에 들어간 손 자리를 밖으로(손 두께 4cm)
  function outOfTorso(p, r = 0.155) {
    const a = wp('hips').add(V3(0, 0.05, 0)), ab = wp('neck').sub(a), u = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1), c = a.clone().add(ab.multiplyScalar(u)), dv = p.clone().sub(c), d = dv.length();
    return d >= r || d < 1e-6 ? p : c.add(dv.multiplyScalar(r / d));
  }
  function elbowIn(side) { const el = wp(side + 'LowerArm'), a = wp('hips').add(V3(0, 0.05, 0)), b = wp('neck'), ab = b.clone().sub(a), u = clamp(el.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return Math.max(0, 0.16 - el.distanceTo(a.clone().add(ab.multiplyScalar(u)))); }
  // 라켓 방향(s)은 그대로 두고 라켓을 그 축으로 돌려(줄 면이 보는 쪽) 손목이 가장 편한 각을 고른다. lam이 크면 처음 정한 면에 가깝게(임팩트 근처)
  const ROLL_TH = []; for (let th = -180; th < 180; th += 5) ROLL_TH.push(th);
  function rollCost(side, want, s, lam) {
    const li = lowerArmInv(side);
    return th => wristCost(wristAngles(side, li.clone().multiply(new THREE.Quaternion().setFromAxisAngle(s, th * D).multiply(want)))) + lam * th * th;
  }
  // 기준 곡선: 보통 공으로 시간마다 모든 롤의 손목 부담을 재고, 이웃한 시간끼리 롤이 크게 바뀌지 않는 길을 고른다(동적 계획법)
  function buildRoll() {
    const ts = [], cR = [], cL = [];
    for (let t = S.T0; t <= S.T1 + 1e-9; t += 0.02) { const c = {}; pose(t, 'mid', c); ts.push(t); cR.push(c.R); cL.push(c.L); }
    const path = cs => {
      const n = cs.length, m = ROLL_TH.length, acc = [cs[0].slice()], from = [];
      for (let i = 1; i < n; i++) {
        acc.push([]); from.push([]);
        for (let j = 0; j < m; j++) {
          let bv = Infinity, bk = 0;
          for (let k = 0; k < m; k++) { const dd = Math.abs(ROLL_TH[j] - ROLL_TH[k]), d2 = Math.min(dd, 360 - dd), v = d2 > 30 ? Infinity : acc[i - 1][k] + 0.01 * d2 * d2; if (v < bv) { bv = v; bk = k; } }
          acc[i].push(bv + cs[i][j]); from[i - 1].push(bk);
        }
      }
      let j = acc[n - 1].indexOf(Math.min(...acc[n - 1])); const out = [ROLL_TH[j]];
      for (let i = n - 2; i >= 0; i--) { j = from[i][j]; out.unshift(ROLL_TH[j]); }
      for (let i = 1; i < n; i++) { while (out[i] - out[i - 1] > 180) out[i] -= 360; while (out[i] - out[i - 1] < -180) out[i] += 360; }   // 이어지게 펼친다
      let sm = out;   // 5도 계단을 고르게(두 번 거른다)
      for (let pass = 0; pass < 2; pass++) sm = sm.map((v, i) => i < 2 || i > n - 3 ? v : (sm[i - 2] + 4 * sm[i - 1] + 6 * v + 4 * sm[i + 1] + sm[i + 2]) / 16);
      // 끝과 처음은 같은 준비 자세라 롤도 같게(한 바퀴 돌아 이어질 때 튀지 않게): 마지막 0.35초 동안 차이를 나눠 없앤다
      const e = ((sm[n - 1] - sm[0]) % 360 + 540) % 360 - 180;
      return sm.map((v, i) => v - e * sstep(S.T1 - 0.35, S.T1, ts[i]));
    };
    S.ROLL = { ts, R: path(cR), L: path(cL) };
  }
  // 라켓·손이 몸을 뚫지 않게 하는 고침(샷을 고를 때 한 번): 0.01초마다 보통 공으로 자세를 만들어, 뚫은 깊이²이 가장 작아지는
  // 라켓 꺾기(손목에서, 아래팔 축으로 비틀지 않음, 회전 벡터 w)와 손 옮기기(d)를 좌표마다 조금씩 찾아 간다. 앞 칸의 답에서 시작해 이어지고,
  // 고칠 필요가 없으면 0으로 돌아간다. 다 구한 뒤 앞뒤 한 칸으로 넓히고 두 번 고르게 편다
  const CORDT = 0.01;
  function penCost(t, w, d, pw, pd) {
    let c = 0;
    for (const tt of [t, t + CORDT / 2]) {   // 빠르게 휘두를 때 칸 사이에서 스치는 것도 보게 반 칸 뒤도 잰다
      pose(tt, 'mid', null, { cor: { w, d } });
      const hits = []; racketPen(0.015, hits);
      for (const h of hits) c += h.d * h.d;
    }
    // 뚫은 깊이² + 고침 크기 + 이웃 칸 고침과의 차이(갑자기 생기거나 풀리지 않게)
    return 2000 * c + 0.3 * w.lengthSq() + 12 * d.lengthSq() + (pw ? 3 * w.distanceToSquared(pw) + 300 * d.distanceToSquared(pd) : 0);
  }
  // 한 칸 풀기: 이웃 칸(pw, pd)의 답에서 시작해 좌표마다 조금씩
  function solveCor(t, pw, pd, w0, d0) {
    let w = w0.clone(), d = d0.clone(), f = penCost(t, w, d, pw, pd);
    if (pw) { const f1 = penCost(t, pw, pd, pw, pd); if (f1 < f) { w = pw.clone(); d = pd.clone(); f = f1; } }
    const z = penCost(t, V3(), V3(), pw, pd); if (z <= f) { w = V3(); d = V3(); f = z; }
    pose(t, 'mid'); const fa = wp('rightHand').sub(wp('rightLowerArm')).normalize(), AX = [V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1)];
    // 두 손으로 쥐고 있으면 라켓을 꺾지 않고 손만 옮긴다(오른손목에서 꺾으면 왼손이 손잡이에서 비틀린다)
    const two = S.corMove || (holdAt(t).type === 'grip2' && holdAt(t).w > 0.3); if (two) w.set(0, 0, 0);   // corMove: 이 샷은 손만 옮겨 비킨다
    const noTwist = v => two ? v.set(0, 0, 0) : v.sub(fa.clone().multiplyScalar(v.dot(fa)));
    for (let st = 0, sw = 0.24, sd = 0.06; st < 5; st++, sw /= 2, sd /= 2) {
      let moved = true;
      for (let it = 0; it < 3 && moved; it++) {
        moved = false;
        for (const ax of AX) for (const sg of [1, -1]) {
          const w2 = noTwist(w.clone().add(ax.clone().multiplyScalar(sg * sw))), f2 = penCost(t, w2, d, pw, pd);
          if (f2 < f - 1e-7) { w = w2; f = f2; moved = true; }
          const d2 = d.clone().add(ax.clone().multiplyScalar(sg * sd)), f3 = penCost(t, w, d2, pw, pd);
          if (f3 < f - 1e-7) { d = d2; f = f3; moved = true; }
        }
      }
    }
    return [w, d];
  }
  function buildCor() {
    S.COR = null; if (!GUARD.racket) return;
    const ts = []; for (let t = S.T0; t <= S.T1 + 1e-9; t += CORDT) ts.push(t);
    // 뚫는 칸이 있는지 먼저(없으면 고침 없음)
    const pen0 = ts.map(t => { pose(t, 'mid', null, { cor: { w: V3(), d: V3() } }); return !!racketPen(0.015) || (pose(t + CORDT / 2, 'mid', null, { cor: { w: V3(), d: V3() } }), !!racketPen(0.015)); });
    if (!pen0.some(Boolean)) return;
    // 앞으로 한 번(이웃 = 앞 칸), 뒤로 한 번(이웃 = 뒤 칸, 앞으로 구한 답에서 시작). 뚫지 않는 칸 근처는 건너뛴다(고침 0)
    const near = i => pen0.slice(Math.max(0, i - 6), i + 7).some(Boolean);
    let Wv = ts.map(() => V3()), Dv = ts.map(() => V3());
    for (let i = 0; i < ts.length; i++) if (near(i)) [Wv[i], Dv[i]] = solveCor(ts[i], i ? Wv[i - 1] : null, i ? Dv[i - 1] : null, i ? Wv[i - 1] : V3(), i ? Dv[i - 1] : V3());
    for (let i = ts.length - 2; i >= 0; i--) if (near(i)) [Wv[i], Dv[i]] = solveCor(ts[i], Wv[i + 1], Dv[i + 1], Wv[i], Dv[i]);
    // 고르게(움직임이 튀지 않게): 앞뒤 두 칸으로 넓힌 뒤 [1,4,6,4,1]로 세 번 거른다(약 ±0.04초)
    const dil = a => a.map((v, i) => a.slice(Math.max(0, i - 2), i + 3).reduce((m, x) => x.length() > m.length() ? x : m, v).clone());
    const sm = a => { let r = a; for (let pass = 0; pass < 3; pass++) r = r.map((v, i) => { const g = j => r[clamp(j, 0, r.length - 1)]; return g(i - 2).clone().add(g(i - 1).clone().multiplyScalar(4)).add(v.clone().multiplyScalar(6)).add(g(i + 1).clone().multiplyScalar(4)).add(g(i + 2)).multiplyScalar(1 / 16); }); return r; };
    const W2 = sm(dil(Wv)), D2 = sm(dil(Dv));
    S.COR = W2.some(v => v.lengthSq() > 1e-8) || D2.some(v => v.lengthSq() > 1e-8) ? { ts, W: W2, D: D2 } : null;
  }
  const corAt = t => {
    if (!S.COR) return null; const { ts, W, D: Dd } = S.COR, n = ts.length, i = clamp(Math.floor((t - S.T0) / CORDT), 0, n - 2), u = clamp((t - ts[i]) / CORDT, 0, 1), k = sstep(0, 1, u);
    return { w: W[i].clone().lerp(W[i + 1], k), d: Dd[i].clone().lerp(Dd[i + 1], k) };
  };
  // 기준 곡선 값(마디 사이는 캣멀롬이라 빠르기가 끊기지 않는다)
  const rollBase = (side, t) => {
    if (!S.ROLL) return 0; const a = S.ROLL[side], n = a.length, i = clamp(Math.floor((t - S.T0) / 0.02), 0, n - 2), u = clamp((t - S.ROLL.ts[i]) / 0.02, 0, 1);
    const p = j => a[clamp(j, 0, n - 1)], u2 = u * u, u3 = u2 * u;
    return 0.5 * (2 * p(i) + (-p(i - 1) + p(i + 1)) * u + (2 * p(i - 1) - 5 * p(i) + 4 * p(i + 1) - p(i + 2)) * u2 + (-p(i - 1) + 3 * p(i) - 3 * p(i + 1) + p(i + 2)) * u3);
  };
  const yawQ = deg => new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), deg * D);
  const eul = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D, y * D, z * D, 'YXZ'));
  const TOE = B('rightToes') ? wp('rightToes').sub(wp('rightFoot')) : V3(0, -0.063, 0.11);   // 발목 → 앞꿈치(아직 처음 자세일 때 잰다)
  const ALLB = [...new Set([...BONES, ...FINGER_BONES, 'rightToes', 'leftToes'])].filter(n => B(n));

  // ── 한 순간의 자세 ──
  let useIK = true;
  // 왼손이 라켓을 잡을 때 손의 회전과 손목 자리
  // 왼손이 손잡이 둘레로 편한 쪽을 골라 쥐는지: 라켓 목은 늘, 양손 백핸드 위쪽 손은 샷이 grip2Free일 때(모션캡처: 실제 왼팔 방향에 맞춰)
  const holdFree = type => HOLD[type].free || (type === 'grip2' && !!S.grip2Free);
  function holdOf(type, rqW, rOrg, th = 0) {
    const sA = V3(0, 1, 0).applyQuaternion(rqW), h = HOLD[type];
    const hl = new THREE.Quaternion().setFromAxisAngle(sA, (th + (type === 'grip2' ? S.lroll || 0 : 0)) * D).multiply(rqW).multiply(gripQL.clone().invert());   // lroll: 양손 위쪽 손을 손잡이 축으로 돌려 쥔 각
    return { q: hl, p: rOrg.clone().sub(h.pos.clone().applyQuaternion(hl)), sA };
  }
  function pose(t, ballKey, collect, over) {
    const dl = ballKey?.isVector3 ? ballKey : V3(...(S.balls[ballKey]?.[1] || [0, 0, 0])), w = useIK ? corrW(t) : 0, sw = who => useIK ? V3(S.STEP[who][0] * dl.x, 0, S.STEP[who][1] * dl.z).multiplyScalar(stepW(t, who)) : V3();
    for (const n of ALLB) B(n).quaternion.identity();
    // 몸: 발로 공 쪽에 다가가고(Sb), 낮은 공이면 무릎을 더 굽히고 숙인다
    const hip = over?.hip ? over.hip(sample(t, 'hip')) : sample(t, 'hip'), ch = over?.chest ? over.chest(sample(t, 'chest')) : sample(t, 'chest');
    const Sb = sw('body'), S0 = useIK ? V3(S.STEP.body[0] * dl.x, 0, S.STEP.body[1] * dl.z) : V3();
    const crouch = w * clamp(dl.y * 0.3, -0.11, 0), lean = w * clamp(-dl.y * 30, -6, 15);
    B('hips').position.set(HIPS0.x + hip[0] + Sb.x + w * dl.x * 0.12, HIPS0.y + hip[1] + crouch, HIPS0.z + hip[2] + Sb.z + w * dl.z * 0.12);
    B('hips').quaternion.copy(yawQ(hip[3]));
    const cy = ch[0], cp = ch[1] + lean, cr_ = ch[2] + w * clamp(-dl.y * 14, -8, 8);
    B('spine').quaternion.copy(eul(cp * 0.4, cy * 0.3, cr_ * 0.3));
    B('chest').quaternion.copy(eul(cp * 0.3, cy * 0.35, cr_ * 0.35));
    if (B('upperChest')) B('upperChest').quaternion.copy(eul(cp * 0.3, cy * 0.35, cr_ * 0.35));
    vrm.scene.updateMatrixWorld(true);
    // 다리: 앞꿈치를 바닥에 두고 무릎은 발끝 쪽으로. 다리가 닿지 않으면 앞꿈치를 축으로 뒤꿈치를 든다
    const legMiss = [];
    for (const side of ['right', 'left']) {
      const [bx, bz, fyaw, lift] = over?.foot ? over.foot(side, sample(t, side[0] + 'f')) : sample(t, side[0] + 'f'), k = sw(side);
      const yq = yawQ(fyaw), fwd = V3(0, 0, 1).applyQuaternion(yq), ax = V3(0, 1, 0).cross(fwd).normalize();
      const pivot = V3(bx + k.x, 0, bz + k.z), rel = TOE.clone().applyQuaternion(yq).negate().setY(ANKLE);
      const ankleAt = ph => pivot.clone().add(rel.clone().applyAxisAngle(ax, ph * D)).add(V3(0, Math.max(0, lift), 0));
      const L = LIMB[side + 'Leg'], H = wp(L.up), reach = (L.l1 + L.l2) * 0.94;
      const hk = side[0] + 'heel';
      let heel = has(hk) ? Math.max(0, sample(t, hk)[0]) : 0;
      const overL = ankleAt(heel).distanceTo(H) - reach;   // 다리가 넘치는 길이: 1cm마다 약 7도(앞꿈치에서 발목까지 길이로 잰 값), 시작은 부드럽게
      if (overL > 0) heel = Math.max(heel, Math.min(38, heel + 700 * overL * overL / (overL + 0.01)));   // 키로 많이 든 뒤꿈치(모션캡처)는 그대로
      legMiss.push(ik(L, ankleAt(heel), fwd.clone().add(V3(0, 0.25, 0))));
      // 정강이가 옆으로 18도보다 많이 기울면 그만큼 발도 날로 기운다(발목이 꺾이지 않게)
      const shin = wp(side + 'LowerLeg').sub(wp(side + 'Foot')).normalize(), out_ = ax.clone().negate();
      const lean_ = Math.atan2(shin.dot(out_), shin.y), roll = lean_ - soft(lean_, -18 * D, 18 * D);
      setWorldQuat(B(side + 'Foot'), new THREE.Quaternion().setFromAxisAngle(fwd, roll).multiply(yq).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), heel * D)));
      B(side + 'Toes')?.quaternion.setFromAxisAngle(V3(1, 0, 0), -heel * D);
    }
    // 오른팔: 라켓 방향을 정하고, 공에 맞게 손목 자리를 옮긴다
    const wt = useIK ? (t < 0 ? corrW(t) : 1 - sstep(0, 0.18, t)) : 0;
    const gq = gripAt(t); racket.matrix.copy(gripOf(bevelAt(t))).setPosition(GRIP_POS);
    const hq = new THREE.Quaternion().setFromAxisAngle(S.TILT_AX, wt * tiltOf(dl)).multiply(handAt(t));   // 낮은 공은 라켓 머리를 떨어뜨려서, 높은 공은 세워서
    const rh = V3(...sample(t, 'rh')).add(Sb);
    if (w > 0) {
      // 임팩트 순간의 라켓 가운데가 공에 오도록: 임팩트 때 손목이 있어야 할 자리 - 원래 자리
      const hq0 = new THREE.Quaternion().setFromAxisAngle(S.TILT_AX, tiltOf(dl)).multiply(S.HQ7);
      const want0 = S.C0.clone().add(dl).sub(sweetFrom(V3(), hq0));
      rh.add(want0.sub(V3(...S.K7.rh)).sub(S0).multiplyScalar(w));
    }
    // 모션캡처 샷(chestPoles): 팔꿈치 쪽을 가슴 기준 방향(rpc/lpc)으로 이어서 쓴다(팔이 위 뒤를 가리켜도 스위블 기준이 흔들리지 않게)
    const chq = S.chestPoles ? new THREE.Quaternion() : null; if (chq) B('upperChest').getWorldQuaternion(chq);
    const lp = tg => over?.lp || (chq && has('lpc') ? V3(...sample(t, 'lpc')).applyQuaternion(chq) : has('lsw') ? poleFromSw('left', tg.clone().sub(wp('leftUpperArm')).normalize(), sample(t, 'lsw')[0]) : V3(...sample(t, 'lp')));
    const rpAt = tg => over?.rp || (chq && has('rpc') ? V3(...sample(t, 'rpc')).applyQuaternion(chq) : has('rsw') ? poleFromSw('right', tg.clone().sub(wp('rightUpperArm')).normalize(), sample(t, 'rsw')[0]) : V3(...sample(t, 'rp')));
    const sDir = V3(0, 1, 0).applyQuaternion(hq.clone().multiply(gq)), lam = 0.0005 + 0.02 * faceW(t) + (S.rollK || 0);
    const hold = holdAt(t), tw = hold.w, two = hold.type === 'grip2' && tw > 0;
    // 라켓을 축으로 돌린 양(롤)은 미리 구한 기준 곡선에서. 임팩트 앞뒤에는 실제(손목 범위에 묶인) 라켓의 가운데가 원래 자리(공)에 오도록 손목 자리를 다시 잡는다
    const rollTh = over?.roll ?? (collect ? 0 : rollBase('R', t));
    const roll = new THREE.Quaternion().setFromAxisAngle(sDir, rollTh * D).multiply(hq);
    const wantSweet = sweetFrom(rh, hq), wf = w * (1 - sstep(0.02, 0.16, t));
    // 라켓이 몸을 뚫지 않게 미리 구해 둔 고침(손목에서 라켓을 꺾는 회전 w, 손을 옮기는 d. buildCor). 시간에 따라 매끄럽게 이어진다
    const cor = collect || !GUARD.racket ? null : over?.cor || corAt(t);
    let want = roll, rh2 = rh;
    if (cor) { if (cor.w.lengthSq() > 1e-10) want = new THREE.Quaternion().setFromAxisAngle(cor.w.clone().normalize(), cor.w.length()).multiply(roll); rh2 = rh.clone().add(cor.d); }
    let miss = 0, hqA = hq, tgt = rh2, rDel = null;
    const rPole = tg => { const p = rpAt(tg); if (collect || over?.rp || !GUARD.pole) return p; if (rDel === null) rDel = limitDelta('right', tg, p); return rDel ? p.applyAxisAngle(tg.clone().sub(wp('rightUpperArm')).normalize(), rDel * D) : p; };
    for (let it = 0; it < 6; it++) {
      miss = ik(LIMB.rightArm, tgt, rPole(tgt));
      if (collect && it === 0) {
        const cR = rollCost('right', hq, sDir, lam);
        if (two) {   // 양손이면 롤마다 왼팔을 실제로 맞춰 왼손목·왼어깨 부담도 함께 잰다
          collect.R = ROLL_TH.map(th => {
            const r = wrist('right', new THREE.Quaternion().setFromAxisAngle(sDir, th * D).multiply(hq)), rq = r.clone().multiply(gq), o = GRIP_POS.clone().applyQuaternion(r).add(wp('rightHand'));
            const h = holdOf('grip2', rq, o), lt = V3(...sample(t, 'lh', h.p.toArray())).lerp(h.p, tw); ik(LIMB.leftArm, lt, lp(lt)); const rot = shoulderRot('left');
            return cR(th) + holdWgt(tw) * (wristCost(wristAngles('left', lowerArmInv('left').multiply(h.q))) + ex(rot, -70, 80) ** 2 + 4e5 * elbowIn('left') ** 2);
          });
        } else collect.R = ROLL_TH.map(cR);
      }
      hqA = wrist('right', want);
      if (wf <= 0) break;
      const need = wantSweet.clone().sub(sweetFrom(V3(), hqA));
      tgt = tgt.clone().lerp(rh2.clone().add(need.sub(rh2).clampLength(0, 0.2).multiplyScalar(wf)), 0.5);   // 반씩 옮겨 두 자세 사이를 오가지 않게
    }
    setFingers('right', 1);
    // 왼팔: 라켓을 잡거나(오른손을 거울에 비춘 쥐는 법) 정한 자리로 뻗는다
    const rqW = hqA.clone().multiply(gq), rOrg = GRIP_POS.clone().applyQuaternion(hqA).add(wp('rightHand'));

    let hd = holdOf(hold.type, rqW, rOrg);
    const lhAt = h => { const p = V3(...sample(t, 'lh', h.p.toArray())).add(Sb.clone().setY(crouch).multiplyScalar(1 - tw)); return (collect ? p : outOfTorso(p)).lerp(h.p, tw); };
    let lDel = null;
    const lPole = tg => { const p = lp(tg); if (collect || over?.lp || !GUARD.pole) return p; if (lDel === null) lDel = limitDelta('left', tg, p); return lDel ? p.applyAxisAngle(tg.clone().sub(wp('leftUpperArm')).normalize(), lDel * D) : p; };
    { const lt = lhAt(hd); ik(LIMB.leftArm, lt, lPole(lt)); }
    if (collect) { const c = rollCost('left', hd.q, hd.sA, 0.0005); collect.L = ROLL_TH.map(th => holdFree(hold.type) ? holdWgt(tw) * c(th) : 0); }
    else if (tw > 0 && holdFree(hold.type)) { hd = holdOf(hold.type, rqW, rOrg, rollBase('L', t)); const lt = lhAt(hd); ik(LIMB.leftArm, lt, lPole(lt)); }
    wrist('left', hd.q, tw);
    setFingers('left', tw > 0 ? (1 - tw) * (has('lk') ? sample(t, 'lk')[0] : 0.2) + tw * HOLD[hold.type].curl : has('lk') ? sample(t, 'lk')[0] : 0.2);
    return { miss, hq: hqA, legMiss };
  }
  // 팔꿈치 방향 찾기: 'auto'인 키마다 어깨-손목 축 둘레 24쪽을 보고, 손목(롤까지 고른 뒤)·어깨 돌림·팔꿈치와 몸통·머리를 따진다.
  // 키를 하나씩 고르지 않고 스윙 전체에서 함께 고른다(동적 계획법): 이웃한 키 사이에 팔꿈치가 축 둘레로 도는 빠르기(도/초)의 제곱도 비용이라 키 사이에서 휙 돌지 않는다
  function autoPoles() {
    if (!S.K.some(k => k.rpAuto || k.lpAuto)) return;
    for (const side of ['right', 'left']) {
      const key = side === 'right' ? 'rp' : 'lp', flag = side === 'right' ? 'rpAuto' : 'lpAuto', ks = S.K.filter(k => k[key] !== undefined);
      if (!ks.some(k => k[flag])) continue;
      const nodes = ks.map(k => {
        const t = k.t; pose(t, 'mid');
        const L = LIMB[side + 'Arm'], target = wp(side + 'Hand'), ax = target.clone().sub(wp(L.up)).normalize();
        if (!k[flag]) { const p = V3(...k[key]).normalize(); return [{ p, sw: swOf(side, ax, p), c: 0 }]; }
        const hold = holdAt(t), lam = 0.0005 + 0.02 * faceW(t) + (S.rollK || 0), out = [];
        for (let a = -180; a < 180; a += 15) {
          const p = poleFromSw(side, ax, a);
          ik(L, target, p);
          let c = 0;
          if (side === 'right') {
            const hq = handAt(t), s = V3(0, 1, 0).applyQuaternion(racketAt(t)), cr = rollCost('right', hq, s, lam);
            c += Math.min(...ROLL_TH.map(cr));
          } else if (hold.w > 0.5) {
            const hqR = new THREE.Quaternion(); B('rightHand').getWorldQuaternion(hqR);
            const rq = hqR.clone().multiply(gripAt(t)), hd = holdOf(hold.type, rq, V3()), li = lowerArmInv('left');
            c += holdFree(hold.type) ? Math.min(...ROLL_TH.map(th => wristCost(wristAngles('left', li.clone().multiply(holdOf(hold.type, rq, V3(), th).q))))) : wristCost(wristAngles('left', li.clone().multiply(hd.q)));
          }
          const rot = shoulderRot(side);
          // 위팔이 몸통 뒤로 많이 넘어가거나 팔꿈치가 머리에 닿는 것도 피한다
          const chq = new THREE.Quaternion(); B('upperChest').getWorldQuaternion(chq); const ua = wp(L.mid).sub(wp(L.up)).normalize().applyQuaternion(chq.invert());
          const nearHead = Math.max(0, 0.17 - wp(L.mid).distanceTo(wp('head').add(V3(0, 0.08, 0))));
          c += 2 * ex(rot, -70, S.shER || 80) ** 2 + 0.0005 * rot * rot + 4e5 * elbowIn(side) ** 2 + 3000 * Math.max(0, -ua.z - 0.5) ** 2 + 4e5 * nearHead ** 2;
          out.push({ p, sw: a, c });
        }
        return out;
      });
      // 동적 계획법: 키 사이 스위블 빠르기의 제곱 × 0.0004(왼팔은 치는 팔이 아니라 0.002로 더 차분하게)
      const acc = [nodes[0].map(n => n.c)], from = [];
      for (let i = 1; i < nodes.length; i++) {
        const dt = Math.max(0.03, ks[i].t - ks[i - 1].t);
        acc.push([]); from.push([]);
        nodes[i].forEach(n => { let bv = Infinity, bk = 0; nodes[i - 1].forEach((m, j) => { const v = acc[i - 1][j] + (side === 'left' ? 2e-3 : 4e-4) * (wrapD(n.sw - m.sw) / dt) ** 2; if (v < bv) { bv = v; bk = j; } }); acc[i].push(bv + n.c); from[i - 1].push(bk); });
      }
      let j = acc[acc.length - 1].indexOf(Math.min(...acc[acc.length - 1]));
      for (let i = nodes.length - 1; i >= 0; i--) { if (ks[i][flag]) ks[i][key] = nodes[i][j].p.toArray().map(v => +v.toFixed(3)); if (i > 0) j = from[i - 1][j]; }
      S.CH = {};
    }
    const a = S.K[0], z = S.K[S.K.length - 1];   // 한 바퀴 돌아 이어지게
    if (z.rpAuto && a.rp) z.rp = a.rp.slice(); if (z.lpAuto && a.lp) z.lp = a.lp.slice(); S.CH = {};
  }
  // 팔꿈치 방향 키(rp/lp)를 그 키 때의 스위블 각(rsw/lsw)으로 바꾼다. 앞 키와 가까운 쪽으로 펼쳐서(±360) 키 사이에 짧은 쪽으로 돈다
  function toSwivel() {
    const out = {};
    for (const [side, key, sk] of [['right', 'rp', 'rsw'], ['left', 'lp', 'lsw']]) {
      let prev = null; out[sk] = [];
      for (const k of S.K.filter(k => k[key] !== undefined)) {
        pose(k.t, 'mid');
        const ax = wp(side + 'Hand').sub(wp(side + 'UpperArm')).normalize();
        let a = swOf(side, ax, V3(...k[key]));
        if (prev != null) a = prev + wrapD(a - prev);
        out[sk].push([k, a]); prev = a;
      }
    }
    for (const [sk, list] of Object.entries(out)) for (const [k, a] of list) k[sk] = [a];
    S.CH = {};
  }
  // 줄 면 고르기(autoFace인 샷): 임팩트(0초) 말고 라켓 방향이 정해진 키마다, 그 방향 둘레로 돌린 줄 면 36쪽을 보고
  // 손목(오른팔꿈치 12쪽 중 가장 좋은 것으로)·어깨 부담과 앞 키 손 회전과의 차이를 따져 고른다. 키 사이 손 회전이 엉뚱한 길로 돌지 않게
  function autoFaces() {
    if (!S.autoFace) return;
    let prevHq = null;
    for (const k of S.K.filter(k => k.s)) {
      const hqOf = f => racketQuatFor(V3(...k.s), f).multiply(gripAt(k.t).invert());
      if (k.t === 0) { prevHq = hqOf(V3(...k.f)); continue; }
      pose(k.t, 'mid');
      const sv = V3(...k.s).normalize(), up = Math.abs(sv.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0), f0 = up.sub(sv.clone().multiplyScalar(up.dot(sv))).normalize();
      const L = LIMB.rightArm, target = V3(...sample(k.t, 'rh')), sh = wp(L.up), ax = target.clone().sub(sh).normalize(), e1 = V3(0, -1, 0).sub(ax.clone().multiplyScalar(-ax.y)).normalize(), e2 = ax.clone().cross(e1);
      let best = null;
      for (let th = 0; th < 360; th += 10) {
        const f = f0.clone().applyAxisAngle(sv, th * D), hq = hqOf(f);
        let bc = Infinity;
        for (let a = 0; a < 360; a += 30) { ik(L, target, e1.clone().multiplyScalar(Math.cos(a * D)).add(e2.clone().multiplyScalar(Math.sin(a * D)))); const c = wristCost(wristAngles('right', lowerArmInv('right').multiply(hq))) + 2 * ex(shoulderRot('right'), -70, S.shER || 80) ** 2 + 4e5 * elbowIn('right') ** 2; if (c < bc) bc = c; }
        const c = bc + (prevHq ? 0.02 * (2 * Math.acos(Math.min(1, Math.abs(hq.dot(prevHq)))) / D) ** 2 : 0);
        if (!best || c < best.c) best = { c, f, hq };
      }
      k.f = best.f.toArray().map(v => +v.toFixed(3)); prevHq = best.hq;
    }
    const ks = S.K.filter(k => k.s), a = ks[0], z = ks[ks.length - 1];   // 처음과 끝이 같은 준비 자세면 줄 면도 같게(한 바퀴 이음새)
    if (z.t === S.K[S.K.length - 1].t && a.s.every((v, i) => Math.abs(v - z.s[i]) < 1e-6)) z.f = a.f.slice();
    for (const k of S.K) if (k.s) k.hq = racketQuatFor(V3(...k.s), V3(...k.f)).multiply(gripAt(k.t).invert()).toArray();
    { let p = null; for (const k of S.K) if (k.hq) { if (p && p[0] * k.hq[0] + p[1] * k.hq[1] + p[2] * k.hq[2] + p[3] * k.hq[3] < 0) k.hq = k.hq.map(v => -v); p = k.hq; } }
    S.CH = {};
  }
  // 샷을 고른다: 쥐는 법, 키에 라켓 회전을 붙이고, 임팩트 자리·팔꿈치 방향·롤 기준 곡선을 미리 구한다
  function setShot(d, keys = d.keys) {
    const gm = gripOf(d.bevel);
    S = { ...d, K: keys.map(k => ({ ...k })), CH: {}, gripQ: new THREE.Quaternion().setFromRotationMatrix(gm), ROLL: null };
    racket.matrix.copy(gm).setPosition(GRIP_POS);
    for (const k of S.K) if (k.s) k.hq = racketQuatFor(V3(...k.s), V3(...k.f)).multiply(gripAt(k.t).invert()).toArray();
    { let p = null; for (const k of S.K) if (k.hq) { if (p && p[0] * k.hq[0] + p[1] * k.hq[1] + p[2] * k.hq[2] + p[3] * k.hq[3] < 0) k.hq = k.hq.map(v => -v); p = k.hq; } }   // 같은 반구로(뒤집히지 않게)
    S.T0 = S.K[0].t; S.T1 = S.K[S.K.length - 1].t; S.LOOP = S.T1 - S.T0 + 0.35;
    S.K7 = S.K.find(k => k.t === 0); S.HQ7 = handAt(0);
    S.C0 = sweetFrom(V3(...sample(0, 'rh')), S.HQ7);   // 보통 공의 임팩트 자리 = 보통 동작에서 임팩트 순간 라켓 가운데
    if (!S.K7.rh) S.K7 = { ...S.K7, rh: sample(0, 'rh') };
    S.TILT_AX = V3(0, 1, 0).applyQuaternion(racketAt(0)).cross(V3(0, 1, 0)).normalize();   // 임팩트 때 라켓이 가리키는 쪽과 위쪽에 직각
    if (S.TILT_AX.lengthSq() < 1e-6) S.TILT_AX.set(1, 0, 0);
    S.order = Object.keys(S.balls);
    for (const k of S.K) { if (k.rp === 'auto') { k.rpAuto = true; k.rp = [0, -1, -0.3]; } if (k.lp === 'auto') { k.lpAuto = true; k.lp = [0.6, -1, 0]; } }
    S.CH = {};
    // 가슴 기준으로 정한 팔꿈치 쪽(rpc/lpc: 가슴의 +x 왼쪽, +y 위, +z 앞)을 그 키 때의 세계 방향으로 바꾼다
    for (const k of S.K) { if (k.rpc && k.rp === undefined) k.rp = k.rpc.slice(); if (k.lpc && k.lp === undefined) k.lp = k.lpc.slice(); }   // 바꾸는 동안 쓸 임시 값
    S.CH = {};
    for (const [ck, key, flag] of [['rpc', 'rp', 'rpAuto'], ['lpc', 'lp', 'lpAuto']]) for (const k of S.K.filter(k => k[ck])) {
      pose(k.t, 'mid'); const ch = new THREE.Quaternion(); B('upperChest').getWorldQuaternion(ch);
      k[key] = V3(...k[ck]).normalize().applyQuaternion(ch).toArray(); k[flag] = false;
    }
    S.CH = {};
    autoFaces();
    autoPoles();
    toSwivel();
    buildRoll();
    // 라켓 비키기 고침: 정의에 미리 구워 둔 것(cor)이 있고 키를 고치지 않았으면 그것을, 아니면 지금 구한다
    if (d.noCor) S.COR = null;   // 이 샷은 비키기를 쓰지 않는다(빠른 팔로스로에서 고침이 오히려 튄다: 서브·스매시)
    else if (d.cor && keys === d.keys && GUARD.racket) { const c = d.cor, n = c.w.length / 3, ts = [], W = [], Dd = []; for (let i = 0; i < n; i++) { ts.push(S.T0 + i * c.dt); W.push(V3(c.w[3 * i], c.w[3 * i + 1], c.w[3 * i + 2])); Dd.push(V3(c.d[3 * i], c.d[3 * i + 1], c.d[3 * i + 2])); } S.COR = { ts, W, D: Dd }; }
    else buildCor();
    S.FAR = (BALL_FROM[S.ball] || BALL_FROM.ground)(S.C0);
    if (S.ball === 'toss') { pose(S.toss, 'mid'); S.tossAt = handBall(); }
    S.lookStart = null; pose(S.T0, 'mid'); S.lookStart = S.ball === 'toss' && S.T0 < S.toss ? handBall() : BALL_PATH[S.ball](S.T0, S.C0, true);
  }
  // 왼손 손바닥 가운데(공을 쥐는 곳)
  const handBall = () => V3(0.06, -0.045, 0.012).applyMatrix4(B('leftHand').matrixWorld);
  // 고개: 공을 보다가 임팩트 직전부터 맞는 자리에 고개를 두고, 맞힌 뒤 잠깐 그대로 있다가 공을 따라가고, 다음 공이 올 쪽으로 돌아간다
  function lookTarget(t, C, bp, hit) {
    if (t < 0) return bp.clone().lerp(C, sstep(-0.3, -0.04, t));
    const v = C.clone().lerp(bp, hit ? sstep(0.2, 0.45, t) : 0).lerp(S.FAR, sstep(0.5, 1.0, t));
    return S.lookStart ? v.lerp(S.lookStart, sstep(S.T1 - 0.4, S.T1, t)) : v;   // 마지막에는 처음 볼 곳으로(한 바퀴 이음새)
  }
  function lookAt(target) {
    const neck = B('neck'), head = B('head'); if (!neck || !head) return;
    neck.parent.updateMatrixWorld(true);
    const hp = wp('head'), loc = target.clone().sub(hp);
    const pq = new THREE.Quaternion(); neck.parent.getWorldQuaternion(pq);
    loc.applyQuaternion(pq.invert());
    const yaw = clamp(Math.atan2(loc.x, loc.z) / D, -80, 80), pitch = clamp(-Math.atan2(loc.y, Math.hypot(loc.x, loc.z)) / D, -35, 45);
    neck.quaternion.copy(eul(pitch * 0.4, yaw * 0.45, 0)); head.quaternion.copy(eul(pitch * 0.6, yaw * 0.55, 0));
    vrm.scene.updateMatrixWorld(true);
  }

  // ── 공의 길 ──
  const G = 9.8;
  // P에서 t0에 떠나 Q에 t1에 닿는 포물선의 t 때 자리
  const arc = (P, t0, Q, t1, t) => { const T = t1 - t0, u = t - t0, v = Q.clone().sub(P).divideScalar(T), vy = (Q.y - P.y + 0.5 * G * T * T) / T; return V3(P.x + v.x * u, P.y + vy * u - 0.5 * G * u * u, P.z + v.z * u); };
  const BALL_FROM = { ground: C => V3(C.x + 1.4, 1.0, 22.5), volley: C => V3(C.x + 1.2, 1.0, 22), toss: C => V3(C.x + 1.2, 0.2, C.z + 16), lob: C => V3(C.x + 1.0, 1.0, 22) };
  const BALL_PATH = {
    // 땅볼: 상대 쪽에서 떠서 한 번 튀고 임팩트 자리로, 맞으면 돌아간다
    // 로브: 상대 쪽에서 높이(약 6m) 떠서 머리 위로 떨어지고, 맞으면 내리꽂힌다
    lob(t, C, hit) {
      if (t < 0 || !hit) return arc(BALL_FROM.lob(C), -2.2, C, 0, t);
      return arc(C, 0, V3(C.x + 1.5, 0, C.z + 9), 0.35, t);
    },
    // 토스: 왼손이 놓은 자리(tossAt, 손에 있는 동안은 손을 따라간다)에서 임팩트 자리로 올라갔다 떨어지고, 맞으면 서비스 박스로
    toss(t, C, hit) {
      if (t < 0 || !hit) return arc(S.tossAt, S.toss, C, 0, t);
      return arc(C, 0, V3(C.x + 1.2, 0, C.z + 16), 0.65, t);
    },
    // 발리: 튀지 않고 상대 쪽에서 바로 임팩트 자리로, 맞으면 돌아간다
    volley(t, C, hit) {
      if (t < 0 || !hit) return arc(BALL_FROM.volley(C), -1.25, C, 0, t);
      return arc(C, 0, V3(C.x + 1.5, 0, C.z + 10), 0.7, t);
    },
    ground(t, C, hit) {
      const P0 = BALL_FROM.ground(C), Bp = V3(C.x + 0.35, 0, C.z + 5.2), tb = -0.52, t0 = -1.5;
      if (t < tb) return arc(P0, t0, Bp, tb, t);
      if (t < 0 || !hit) { const p = arc(Bp, tb, C, 0, t); if (p.y < 0) p.y = -p.y * 0.6; return p; }
      return arc(C, 0, V3(C.x + 2.5, 0, C.z + 14), 0.95, t);
    },
  };


  return {
    vrm, B, BONES, ALLB, REST, HIPS0, ARM, ANKLE, LIMB, racket, SWEET, GRIP_POS, HOLD, gripQL, gripOf,
    get S() { return S; }, setShot, useShot: s => { S = s; racket.matrix.copy(gripOf(s.bevel)).setPosition(GRIP_POS); },
    GUARD, pose, ik, wrist, wristAngles, wristCost, lowerArmInv, shoulderRot, elbowIn, armViol, racketPen, swRef, swOf, poleFromSw, wrapD,
    sample, sampleQ, has, chan, ballsOf, bevelAt, gripAt, handAt, racketAt, holdAt, holdOf, racketQuatFor, handQuatFor, sweetFrom, handBall,
    lookAt, lookTarget, BALL_PATH, BALL_FROM, wp, setFingers, toSwivel, buildRoll, autoPoles, autoFaces, rollCost, ROLL_TH, rollBase,
    corrW, faceW, tiltOf, setIK: v => { useIK = v; }, getIK: () => useIK,
  };
}
