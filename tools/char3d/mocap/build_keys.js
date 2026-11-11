// 스윙 화면 안에서 돈다(앞에 window.__CLIPS = clips.json 을 붙여 넣는다). 모션캡처 재료를 리그 몸 크기에 맞춰 스윙 키로 바꾼다
(async () => {
  const { R, THREE, SHOTS } = __dbg; const V = (...a) => new THREE.Vector3(...a); const D = Math.PI / 180;
  const CL = window.__CLIPS, out = {}, log = [];
  const rigHipH = R.REST.hips.y, k = rigHipH / 0.8233;
  const r3 = a => a.map(v => +(+v).toFixed(3)), r1 = a => a.map(v => +(+v).toFixed(1));
  const eulYXZ = q => { const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); return [e.y / D, e.x / D, e.z / D]; };
  for (const [id, c] of Object.entries(CL)) {
    const old = SHOTS.find(s => s.id === id), armK = R.ARM / c.armLen;
    const rows = c.rows, w0 = rows[0].t, w1 = rows[rows.length - 1].t;
    const keys = [];
    for (const r of rows) {
      const kk = { t: r.t, hip: r3([r.hip[0] * k, (r.hip[2] - 0.8233) * k, r.hip[1] * k, r.hip[3]]), chest: r1(r.chest),
        rf: r3([r.rf[0] * k, r.rf[1] * k, r.rf[2], r.rf[3] * k]), lf: r3([r.lf[0] * k, r.lf[1] * k, r.lf[2], r.lf[3] * k]),
        rheel: [+r.rheel.toFixed(1)], lheel: [+r.lheel.toFixed(1)], rh: [0, 1, 0.3], s: r3(r.s), f: r3(r.f), rpc: r3(r.rpc), lh: r.hold || [0, 1, 0.3], lpc: r3(r.lpc) };
      keys.push(kk);
    }
    if (id === 'sv') { const tt = c.toss; for (const kk of keys) kk.lk = [kk.t < tt ? 0.6 : 0.2]; }
    // 왼손이 라켓을 잡고 놓는 것은 키 간격(0.05초)보다 천천히: 바뀌는 곳 앞뒤 0.1초 안의 왼손 키를 비운다
    const hk = keys.map(k => typeof k.lh === 'string' ? k.lh : '');
    const mids = []; for (let j = 1; j < keys.length; j++) if (hk[j] !== hk[j - 1]) mids.push((keys[j].t + keys[j - 1].t) / 2);
    for (const md of mids) for (const kk of keys) if (Math.abs(kk.t - md) < 0.13) delete kk.lh;
    // 끝은 처음 자세로 돌아온다(한 바퀴 이음새)
    keys.push({ ...JSON.parse(JSON.stringify(keys[0])), t: +(w1 + 0.45).toFixed(2) });
    const def = { ...old, keys, toss: c.toss ?? old.toss, bevel: c.bevel, rollK: 0.01, chestPoles: true };
    // 1) 몸을 세우고 어깨 자리·가슴 방향을 읽어 손목 자리를 정한다. 가슴은 실제 가슴 방향과 맞을 때까지 고친다(세 번)
    const mk = keys.slice(0, -1);
    for (let it = 0; it < 4; it++) {
      R.setShot(def);
      for (let j = 0; j < mk.length; j++) {
        const kk = mk[j], r = rows[j];
        R.pose(kk.t, 'mid');
        const qc = new THREE.Quaternion(); R.B('upperChest').getWorldQuaternion(qc);
        const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(...r.chestQ[0], 0, ...r.chestQ[1], 0, ...r.chestQ[2], 0, 0, 0, 0, 1));
        const hy = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -kk.hip[3] * D);
        const eW = eulYXZ(hy.clone().multiply(want)), eR = eulYXZ(hy.clone().multiply(qc));
        if (it < 3) kk.chest = r1(kk.chest.map((v, i) => v + 0.9 * (((eW[i] - eR[i]) + 540) % 360 - 180)));
        // 손목: 리그 어깨 + 리그 가슴 방향 × (모션캡처 손목 - 어깨, 가슴 기준) × 팔 길이 비
        kk.rh = r3(V(...r.rhOff).multiplyScalar(armK).applyQuaternion(qc).add(R.wp('rightUpperArm')).toArray());
        if (!r.hold && kk.lh !== undefined) kk.lh = r3(V(...r.lhOff).multiplyScalar(armK).applyQuaternion(qc).add(R.wp('leftUpperArm')).toArray());
        if (it === 3 && j % 6 === 0) { const d = 2 * Math.acos(Math.min(1, Math.abs(qc.dot(want)))) / D; log.push(`${id} t${kk.t} chest err ${d.toFixed(1)}deg`); }
      }
    }
    // 양손 백핸드: 왼손을 손잡이 축 둘레로 얼마나 돌려 쥘지(lroll)는 왼손목이 가장 편한 쪽으로
    if (id === 'bh') {
      let best = null;
      for (let lr = -180; lr < 180; lr += 20) {
        def.lroll = lr; R.setShot(def); let cst = 0;
        for (let t = def.keys[0].t; t <= def.keys[def.keys.length - 1].t; t += 0.02) { R.pose(t, 'mid'); const w = R.wrist.raw.left; cst += Math.max(0, Math.abs(w[0]) - 60) ** 2 + Math.max(0, Math.abs(w[1]) - 60) ** 2 + 2 * Math.max(0, Math.abs(w[2]) - 25) ** 2; }
        if (!best || cst < best.c) best = { c: cst, lr };
      }
      def.lroll = best.lr; log.push('bh lroll ' + best.lr + ' cost ' + best.c.toFixed(0));
    }
    // 끝 키는 고친 처음 키와 같게
    Object.assign(keys[keys.length - 1], JSON.parse(JSON.stringify({ ...keys[0], t: keys[keys.length - 1].t })));
    R.setShot(def);
    // 임팩트를 몸 앞으로(사용자 2026-11-11: 공이 임팩트 지점을 지나쳤다가 돌아가는 느낌). 손목이 가장 빠른 때나 라켓이 네트와 나란한 때는
    // 라켓 가운데가 아직 몸 옆(포핸드 발리는 골반보다 뒤)에 있다. 라켓 가운데가 골반 앞 AHEAD m에 처음 오는 때를 0초로 옮긴다
    const AHEAD = { fh: 0.38, bh: 0.45, fv: 0.45, bv: 0.45 };
    let tk = null;
    if (AHEAD[id] != null) {
      const ah = t => { R.pose(t, 'mid'); const hp = R.B('hips').getWorldPosition(V()); return R.racket.localToWorld(V(0, 0.45, 0)).z - hp.z; };
      let ts = 0; for (let t = 0; t <= 0.15; t += 0.005) if (ah(t) >= AHEAD[id]) { ts = t; break; }
      for (const kk of keys) kk.t = +(kk.t - ts).toFixed(3);
      log.push(`${id} impact +${ts.toFixed(3)}s`);
    }
    // 발리는 짧고 빠르게(사용자 2026-11-11: 발리는 이렇게 천천히 하지 않는다). 모션캡처 발리는 크게 휘두르는 연습 동작이라
    // 임팩트 둘레로 시간을 줄이고(앞 1/1.7, 뒤 1/1.5) 백스윙·팔로스로 폭(손 자리, 몸 돌기, 라켓 방향)을 줄인다
    if (id === 'fv' || id === 'bv') {
      const K1 = 1.7, K2 = 1.5; tk = [K1, K2];
      const j = keys.findIndex(k => k.t > 0), a = keys[j - 1], b = keys[j], u = (0 - a.t) / (b.t - a.t);
      const lerpA = (x, y, w) => x.map((v, i) => v + (y[i] - v) * w);
      const k0 = { t: 0 };
      for (const n of Object.keys(a)) if (n !== 't') k0[n] = Array.isArray(a[n]) && Array.isArray(b[n]) ? lerpA(a[n], b[n], u) : (u < 0.5 ? a[n] : b[n]);
      if (a.t !== 0) keys.splice(j, 0, k0);
      const nrm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
      const toward = (v, v0, A) => v0.map((x, i) => x + (v[i] - x) * A);
      for (const kk of keys) {
        kk.hip = r3([kk.hip[0], kk.hip[1], kk.hip[2], k0.hip[3] + (kk.hip[3] - k0.hip[3]) * 0.5]);
        kk.chest = r1(toward(kk.chest, k0.chest, 0.6));
        kk.rh = r3(toward(kk.rh, k0.rh, 0.5));
        const sN = nrm(toward(kk.s, k0.s, 0.6)); let fN = toward(kk.f, k0.f, 0.6); const d = fN.reduce((x, v, i) => x + v * sN[i], 0);
        kk.s = r3(sN); kk.f = r3(nrm(fN.map((v, i) => v - d * sN[i])));
        kk.rpc = r3(nrm(toward(kk.rpc, k0.rpc, 0.7)));
        if (Array.isArray(kk.lh) && Array.isArray(k0.lh)) kk.lh = r3(toward(kk.lh, k0.lh, 0.6));
        if (kk.lpc) kk.lpc = r3(nrm(toward(kk.lpc, k0.lpc, 0.7)));
        kk.t = +(kk.t < 0 ? kk.t / K1 : kk.t / K2).toFixed(3);
      }
      def.keys = keys; R.setShot(def);
    }
    // 임팩트 높이를 게임 공 높이에 맞춘다(사용자 2026-11-11: 포핸드가 급작스럽게 숙여진다). 모션캡처 임팩트는 어깨 높이라(포핸드 1.7m)
    // 허리 높이(1.1m) 공을 칠 때마다 리그가 크게 숙였다. 임팩트 둘레(±W초)의 손 자리를 내리고 그만큼 무릎을 조금 굽힌다
    const HGT = { fh: 1.3, bh: 1.15, fv: 1.2, bv: 1.05 };   // m(경기 세계, 3D 선수 키 배율 1.12)
    if (HGT[id]) {
      R.setShot(def); const c0 = R.S.C0.y, d = HGT[id] / 1.12 - c0, W = /v$/.test(id) ? 0.35 : 0.5;
      for (const kk of keys) {
        const b = Math.abs(kk.t) < W ? 0.5 * (1 + Math.cos(Math.PI * kk.t / W)) : 0;
        if (!b) continue;
        kk.rh = r3([kk.rh[0], kk.rh[1] + d * b, kk.rh[2]]);
        kk.hip = r3([kk.hip[0], kk.hip[1] + 0.2 * d * b, kk.hip[2], kk.hip[3]]);
        if (Array.isArray(kk.lh)) kk.lh = r3([kk.lh[0], kk.lh[1] + 0.5 * d * b, kk.lh[2]]);
      }
      def.keys = keys; R.setShot(def);
      log.push(`${id} contact height ${(c0 * 1.12).toFixed(2)} -> ${(R.S.C0.y * 1.12).toFixed(2)} m`);
      // 기준점(뿌리)을 임팩트 때 골반 자리로 옮긴다(동작은 그대로). 모션캡처는 출발 자리 기준이라 공이 1m 앞에 있어
      // 게임이 3D 몸을 그림 선수 자리에서 크게 옮겨야 했다(사용자 2026-11-11: 포핸드 때 몸이 뒤로 가는 느낌)
      const j = keys.findIndex(k => k.t > 0), a = keys[j - 1], b = keys[j], u = (0 - a.t) / (b.t - a.t);
      const hx = a.hip[0] + (b.hip[0] - a.hip[0]) * u, hz = a.hip[2] + (b.hip[2] - a.hip[2]) * u;
      for (const kk of keys) {
        kk.hip = r3([kk.hip[0] - hx, kk.hip[1], kk.hip[2] - hz, kk.hip[3]]);
        kk.rf = r3([kk.rf[0] - hx, kk.rf[1] - hz, kk.rf[2], kk.rf[3]]); kk.lf = r3([kk.lf[0] - hx, kk.lf[1] - hz, kk.lf[2], kk.lf[3]]);
        kk.rh = r3([kk.rh[0] - hx, kk.rh[1], kk.rh[2] - hz]);
        if (Array.isArray(kk.lh)) kk.lh = r3([kk.lh[0] - hx, kk.lh[1], kk.lh[2] - hz]);
      }
      def.keys = keys; R.setShot(def);
      log.push(`${id} root moved by ${hx.toFixed(2)}, ${hz.toFixed(2)}: contact from root x ${R.S.C0.x.toFixed(2)} z ${R.S.C0.z.toFixed(2)}`);
    }
    out[id] = { toss: def.toss, bevel: c.bevel, lroll: def.lroll, keys, tk };
  }
  window.__OUT = out;
  return JSON.stringify({ log: log.join(String.fromCharCode(10)), out });
})()
