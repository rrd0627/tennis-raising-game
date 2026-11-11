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
    out[id] = { toss: def.toss, bevel: c.bevel, lroll: def.lroll, keys };
  }
  window.__OUT = out;
  return JSON.stringify({ log: log.join(String.fromCharCode(10)), out });
})()
