// 관절 검사(swing.html 안에서 돈다): 7가지 공을 차례로 600Hz로 자세를 만들며 관절 각도가 사람 범위 안인지, 갑자기 튀는 곳·몸을 뚫는 곳·디딘 발이 미끄러지는 곳을 잰다. 실행은 jointcheck.mjs
(() => {
  const { THREE, pose, lookAt, lookTarget, ballAt, sweetFrom, B, BONES, T0, LOOP, ORDER, BALLS, C0, racket, SWEET, ANKLE } = __dbg;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const R = 180 / Math.PI, DT = 1 / 600;
  const wrap = a => ((a + 540) % 360) - 180;
  const wpos = n => B(n).getWorldPosition(V());
  const twist = (q, a) => wrap(2 * Math.atan2(a.dot(V(q.x, q.y, q.z)), q.w) * R);
  const swingOnly = (q, a) => { const p = a.dot(V(q.x, q.y, q.z)); const t = new THREE.Quaternion(a.x * p, a.y * p, a.z * p, q.w).normalize(); return q.clone().multiply(t.invert()); };
  // 경첩 관절: a0 뼈 방향, h0 경첩 축(양의 회전이 굽힘). 굽힘·옆으로 꺾임·비틀림
  function hinge(q, a0, h0) {
    const d = a0.clone().applyQuaternion(q), f0 = h0.clone().cross(a0);
    return { flex: Math.atan2(d.dot(f0), d.dot(a0)) * R, off: Math.asin(Math.max(-1, Math.min(1, d.dot(h0)))) * R, tw: twist(q, a0) };
  }
  const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1), NX = V(-1, 0, 0), NY = V(0, -1, 0), NZ = V(0, 0, -1);
  function angles() {
    const L = n => B(n).quaternion;
    const o = {};
    let h = hinge(L('rightLowerArm'), NX, Y); o.rElbowFlex = h.flex; o.rElbowOff = h.off; o.rForearmTw = h.tw;
    h = hinge(L('leftLowerArm'), X, NY); o.lElbowFlex = h.flex; o.lElbowOff = h.off; o.lForearmTw = h.tw;
    h = hinge(L('rightLowerLeg'), NY, X); o.rKneeFlex = h.flex; o.rKneeOff = h.off; o.rShinTw = h.tw;
    h = hinge(L('leftLowerLeg'), NY, X); o.lKneeFlex = h.flex; o.lKneeOff = h.off; o.lShinTw = h.tw;
    for (const [k, n, aH] of [["r", "rightHand", NX], ["l", "leftHand", X]]) { const q = L(n), tw = twist(q, aH), sw = new THREE.Quaternion().setFromAxisAngle(aH, tw / R).invert().multiply(q), d = aH.clone().applyQuaternion(sw), th = Math.acos(Math.max(-1, Math.min(1, d.dot(aH)))) * R, p = -d.y, u = d.z, r = Math.hypot(p, u) || 1; o[k + "WristFlex"] = th * p / r; o[k + "WristDev"] = th * u / r; o[k + "WristTw"] = tw; }
    // 어깨: 팔 방향(가슴 기준)과 위팔 비틀림
    for (const [s, a0] of [['r', NX], ['l', X]]) {
      const q = L(s === 'r' ? 'rightUpperArm' : 'leftUpperArm'), d = a0.clone().applyQuaternion(q);
      o[s + 'ShElev'] = Math.asin(d.y) * R; if (Math.hypot(d.z, d.dot(a0)) > 0.35) o[s + 'ShHoriz'] = Math.atan2(d.z, d.dot(a0)) * R; o[s + 'ShTw'] = twist(q, a0);
    }
    for (const s of ['right', 'left']) {
      const q = L(s + 'UpperLeg'), d = NY.clone().applyQuaternion(q), k = s[0];
      o[k + 'HipFlex'] = Math.atan2(d.z, -d.y) * R; o[k + 'HipAbd'] = Math.atan2(k === 'r' ? -d.x : d.x, -d.y) * R; o[k + 'HipTw'] = twist(q, NY);
      const f = L(s + 'Foot'), fd = Z.clone().applyQuaternion(f), up = Y.clone().applyQuaternion(f);
      o[k + 'AnkDorsi'] = Math.asin(fd.y) * R; o[k + 'AnkTw'] = twist(f, Y); o[k + 'AnkRoll'] = Math.atan2(k === 'r' ? up.x : -up.x, up.y) * R;
    }
    // 위팔 돌림(해부학 중립: 팔꿈치를 굽히면 손이 몸 앞·안쪽으로). 양쪽 다 바깥돌림이 +
    for (const [k, up, mid, end, sx] of [['r', 'rightUpperArm', 'rightLowerArm', 'rightHand', 1], ['l', 'leftUpperArm', 'leftLowerArm', 'leftHand', -1]]) {
      const ch = new THREE.Quaternion(); B('upperChest').getWorldQuaternion(ch); const sh = wpos(up), el = wpos(mid), wr = wpos(end), d = el.clone().sub(sh).normalize(), fa = wr.clone().sub(el), bb = fa.sub(d.clone().multiplyScalar(fa.dot(d)));
      if (bb.length() > 1e-3) { bb.normalize(); const F = V(0.3 * sx, 0.3, 1).applyQuaternion(ch), fn = F.sub(d.clone().multiplyScalar(F.dot(d))).normalize(); o[k + 'ShRot'] = -sx * Math.atan2(fn.clone().cross(bb).dot(d), fn.dot(bb)) * R; } }
    const nh = L('neck').clone().multiply(L('head')); const hf = Z.clone().applyQuaternion(nh);
    o.headYaw = Math.atan2(hf.x, hf.z) * R; o.headPitch = -Math.asin(hf.y) * R;
    const ch = L('spine').clone().multiply(L('chest')); if (B('upperChest')) ch.multiply(L('upperChest')); o.torsoTw = twist(ch, Y);
    return o;
  }
  // 허용 범위(대략의 사람 관절 범위, 아마추어 포핸드 기준으로 조금 넉넉히)
  const LIM = {
    rElbowFlex: [-3, 150], lElbowFlex: [-3, 150], rElbowOff: [-8, 8], lElbowOff: [-8, 8], rForearmTw: [-95, 95], lForearmTw: [-95, 95],
    rKneeFlex: [-3, 140], lKneeFlex: [-3, 140], rKneeOff: [-6, 6], lKneeOff: [-6, 6], rShinTw: [-30, 30], lShinTw: [-30, 30],
    rWristFlex: [-75, 75], lWristFlex: [-75, 75], rWristDev: [-35, 25], lWristDev: [-35, 25], rWristTw: [-95, 95], lWristTw: [-95, 95],
    rShTw: [-95, 95], lShTw: [-95, 95], rShHoriz: [-45, 150], lShHoriz: [-45, 150], rShElev: [-90, 85], lShElev: [-90, 85],
    rHipFlex: [-25, 110], lHipFlex: [-25, 110], rHipAbd: [-25, 50], lHipAbd: [-25, 50], rHipTw: [-45, 45], lHipTw: [-45, 45],
    rAnkDorsi: [-50, 35], lAnkDorsi: [-50, 35], rAnkTw: [-25, 25], lAnkTw: [-25, 25], rAnkRoll: [-25, 25], lAnkRoll: [-25, 25],
    rShRot: [-80, 70], lShRot: [-80, 70], headYaw: [-80, 80], headPitch: [-50, 60], torsoTw: [-60, 60],
  };
  // 몸 캡슐(라켓·팔이 몸을 뚫는지)
  function capsules() {
    const p = n => wpos(n);
    return [
      ['몸통', p('hips').add(V(0, 0.05, 0)), p('neck'), 0.115], ['머리', p('head').add(V(0, 0.09, 0.01)), p('head').add(V(0, 0.1, 0.01)), 0.105],
      ['오른허벅지', p('rightUpperLeg'), p('rightLowerLeg'), 0.07], ['왼허벅지', p('leftUpperLeg'), p('leftLowerLeg'), 0.07],
      ['오른정강이', p('rightLowerLeg'), p('rightFoot'), 0.05], ['왼정강이', p('leftLowerLeg'), p('leftFoot'), 0.05],
    ];
  }
  const segDist = (pt, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, pt.clone().sub(a).dot(ab) / ab.lengthSq())); return pt.distanceTo(a.clone().add(ab.multiplyScalar(t))); };
  const RIM = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; RIM.push(V(Math.cos(a) * 0.128, SWEET + 0.02 + Math.sin(a) * 0.168, 0)); }
  for (const y of [0.1, 0.2, 0.3]) RIM.push(V(0, y, 0));
  const WATCH = ['rightHand', 'rightLowerArm', 'leftHand', 'leftLowerArm', 'rightLowerLeg', 'leftLowerLeg', 'rightFoot', 'leftFoot', 'head', 'hips'];
  const out = { slide: {}, frames: 0, viol: {}, jumpsW: [], jumpsP: [], peaksW: {}, peaksP: {}, pen: {}, miss: {}, ranges: {} };
  const viol = (k, v, t, ball) => { const lim = LIM[k]; if (!lim) return; const ex = v < lim[0] ? v - lim[0] : v > lim[1] ? v - lim[1] : 0; if (!ex) return;
    const r = out.viol[k] || (out.viol[k] = { n: 0, worst: 0, at: null, lim, list: {} }); r.n++; r.list[ball] = (r.list[ball] || 0) + 1; if (Math.abs(ex) > Math.abs(r.worst)) { r.worst = ex; r.at = [ball, +t.toFixed(3), +v.toFixed(1)]; } };
  let prev = null;
  const seq = __seq || ORDER;
  for (let bi = 0; bi < seq.length; bi++) {
    const key = seq[bi], C = C0.clone().add(V(...BALLS[key].d));
    const r0 = pose(0, key); const hit = sweetFrom(wpos('rightHand'), r0.hq).distanceTo(C) < 0.09;
    for (let k = 0; k * DT < LOOP; k++) {
      const t = T0 + k * DT;
      const r = pose(t, key);
      const bp = ballAt(Math.min(t, 1.2), C, hit);
      lookAt(lookTarget ? lookTarget(t, C, bp, hit) : (t < 0.12 ? bp : C.clone().add(V(0.3, 0.1, 3))));
      const ang = angles();
      for (const [kk, v] of Object.entries(ang)) { viol(kk, v, t, key); const rg = out.ranges[kk] || (out.ranges[kk] = [1e9, -1e9]); rg[0] = Math.min(rg[0], v); rg[1] = Math.max(rg[1], v); }
      if (r.miss > 0.005) { const m = out.miss.arm || (out.miss.arm = { n: 0, worst: 0, at: null }); m.n++; if (r.miss > m.worst) { m.worst = r.miss; m.at = [key, +t.toFixed(3)]; } }
      r.legMiss.forEach((lm, i) => { if (lm > 0.005) { const m = out.miss['leg' + i] || (out.miss['leg' + i] = { n: 0, worst: 0, at: null }); m.n++; if (lm > m.worst) { m.worst = lm; m.at = [key, +t.toFixed(3)]; } } });
      // 라켓·팔이 몸을 뚫는지
      racket.updateMatrixWorld(true);
      const caps = capsules();
      const pts = RIM.map(p => ['라켓', p.clone().applyMatrix4(racket.matrixWorld)]).concat([['오른팔꿈치', wpos('rightLowerArm')], ['오른손', wpos('rightHand')], ['왼손', wpos('leftHand')], ['왼팔꿈치', wpos('leftLowerArm')]]);
      for (const [cn, a, b, rad] of caps) for (const [pn, p] of pts) {
        if (pn === '왼손' && cn === '몸통') continue;
        const dep = rad - segDist(p, a, b); if (dep > 0.02) { const kk = pn + '→' + cn; const e = out.pen[kk] || (out.pen[kk] = { n: 0, worst: 0, at: null, list: {} }); e.n++; e.list[key] = (e.list[key] || 0) + 1; if (dep > e.worst) { e.worst = +dep.toFixed(3); e.at = [key, +t.toFixed(3)]; } }
      }
      // 빠르기와 튐
      const cur = { q: {}, p: {} };
      for (const n of BONES) cur.q[n] = B(n).quaternion.clone();
      for (const n of WATCH) cur.p[n] = wpos(n);
      cur.p.racketTip = V(0, SWEET + 0.19, 0).applyMatrix4(racket.matrixWorld);
      cur.p.sweet = V(0, SWEET, 0).applyMatrix4(racket.matrixWorld);
      // 라켓 면 방향(세계)
      cur.q.racketW = racket.getWorldQuaternion(new THREE.Quaternion());
      if (prev) {
        cur.w = {}; cur.v = {};
        for (const n of Object.keys(cur.q)) { const d = Math.min(1, Math.abs(cur.q[n].dot(prev.q[n]))); cur.w[n] = 2 * Math.acos(d) * R / DT; }
        for (const n of Object.keys(cur.p)) cur.v[n] = cur.p[n].clone().sub(prev.p[n]).divideScalar(DT);
        for (const n of Object.keys(cur.w)) { const pk = out.peaksW[n] || (out.peaksW[n] = [0]); if (cur.w[n] > pk[0]) out.peaksW[n] = [+cur.w[n].toFixed(0), key, +t.toFixed(3)]; }
        for (const n of Object.keys(cur.v)) { const s = cur.v[n].length(), pk = out.peaksP[n] || (out.peaksP[n] = [0]); if (s > pk[0]) out.peaksP[n] = [+s.toFixed(2), key, +t.toFixed(3)]; }
        if (prev.w) {
          for (const n of Object.keys(cur.w)) { const dw = Math.abs(cur.w[n] - prev.w[n]); if (dw > 120) out.jumpsW.push([n, key, +t.toFixed(3), +dw.toFixed(0), +prev.w[n].toFixed(0), +cur.w[n].toFixed(0)]); }
          for (const n of Object.keys(cur.v)) { const dv = cur.v[n].distanceTo(prev.v[n]); if (dv > (n === 'racketTip' || n === 'sweet' ? 0.9 : 0.45)) out.jumpsP.push([n, key, +t.toFixed(3), +dv.toFixed(2), +prev.v[n].length().toFixed(2), +cur.v[n].length().toFixed(2)]); }
        }
      }
      // 디딘 발(바닥에 닿은 앞꿈치·뒤꿈치)이 미끄러지는지
      for (const sd of ['right', 'left']) { const f = B(sd + 'Foot'); f.updateMatrixWorld(true);
        for (const [pn, lp] of [['toe', V(0, -ANKLE, 0.111)], ['heel', V(0, -ANKLE, -0.04)]]) { const p = lp.clone().applyMatrix4(f.matrixWorld), kk = sd + '_' + pn;
          if (p.y < 0.006 && prev && prev.fp && prev.fp[kk] && prev.fp[kk].y < 0.006) { const sp = Math.hypot(p.x - prev.fp[kk].x, p.z - prev.fp[kk].z) / DT; const e = out.slide[kk] || (out.slide[kk] = { dist: 0, max: 0, at: null, sub: 0 }); e.dist += sp * DT; if (sp > 0.15) e.sub += sp * DT; if (sp > e.max) { e.max = +sp.toFixed(2); e.at = [key, +t.toFixed(3)]; } }
          if (p.y < -0.01) { const e = out.slide[kk + '_under'] || (out.slide[kk + '_under'] = { max: 0, at: null }); if (-p.y > e.max) { e.max = +(-p.y).toFixed(3); e.at = [key, +t.toFixed(3)]; } }
          (cur.fp || (cur.fp = {}))[kk] = p; } }
      prev = cur; out.frames++;
    }
  }
  // 튐은 같은 관절·공의 연속 프레임을 한 사건으로 묶는다
  const group = list => { const g = []; for (const e of list) { const l = g[g.length - 1]; if (l && l[0] === e[0] && l[1] === e[1] && Math.abs(e[2] - l.tEnd) < 0.01) { l.tEnd = e[2]; if (e[3] > l[3]) { l[3] = e[3]; l[4] = e[4]; l[5] = e[5]; } l.n++; } else { const c = e.slice(); c.tEnd = e[2]; c.n = 1; g.push(c); } } return g.map(e => [...e, e.n, e.tEnd]); };
  out.jumpsW = group(out.jumpsW); out.jumpsP = group(out.jumpsP);
  for (const k in out.ranges) out.ranges[k] = out.ranges[k].map(v => +v.toFixed(1));
  return out;
})()
