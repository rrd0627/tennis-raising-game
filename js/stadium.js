// 툰풍 경기장. art/stadium/stadium.glb 는 tools/stadium/build_stadium.py 가 Blender로 만든다.
// 여기서는 그 모델을 불러와 툰 재질(빛을 몇 단계로만 나눠 받는 재질)과 외곽선으로 칠하고,
// 관중, 펜스 그물, 대회 현수막, 전광판 글자를 얹는다. 연출만이고 경기 결과와는 상관없다.
import * as THREE from 'three';

let pending = null, data = null;
// 모델 주소는 이 모듈 기준이다. index.html은 모듈 주소에 빌드 번호(?v=)를 붙이니 같은 번호로 모델도 새로 받는다
const SRC = (() => { try { const u = new URL('../art/stadium/stadium.glb', import.meta.url); u.search = new URL(import.meta.url).search; return u.href; } catch { return 'art/stadium/stadium.glb'; } })();

export function loadStadium() {
  if (!pending) pending = (async () => {
    let buf;
    const b64 = typeof window !== 'undefined' && window.__STADIUM_GLB;   // play.html(한 파일 버전)은 모델을 글자로 품고 있다
    if (b64) {
      const s = atob(b64), u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      buf = u.buffer;
    } else {
      const r = await fetch(SRC);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      buf = await r.arrayBuffer();
    }
    data = parseGLB(buf);
    return data;
  })().catch(e => { console.warn('경기장 모델을 못 불러왔다. 예전 배경을 쓴다', e); return null; });
  return pending;
}
export const stadiumData = () => data;

// glb(glTF 2.0 이진 파일) 중 이 모델에 쓰는 것만 읽는다: 삼각형 메시, 위치·법선·UV, 재질 색, 노드의 extras
function parseGLB(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('glb가 아니다');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len);
    off += 8 + len;
  }
  const TYPES = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const acc = i => {
    if (i == null) return null;
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = TYPES[a.componentType];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    return new T(bin.slice(start, start + a.count * N[a.type] * T.BYTES_PER_ELEMENT));
  };
  const meshes = [];
  for (const m of json.meshes || []) for (const p of m.primitives) {
    const mt = json.materials?.[p.material] || {};
    meshes.push({
      name: m.name, mat: mt.name || m.name, color: mt.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1],
      pos: acc(p.attributes.POSITION), nor: acc(p.attributes.NORMAL), uv: acc(p.attributes.TEXCOORD_0), idx: acc(p.indices),
    });
  }
  const info = {};
  for (const n of json.nodes || []) if (n.extras) for (const [k, v] of Object.entries(n.extras)) { try { info[k] = JSON.parse(v); } catch { info[k] = v; } }
  return { meshes, info };
}

// 빛을 세 단계로만 받는다(툰). 어두운 쪽도 너무 어둡지 않게
function ramp(steps) {
  const t = new THREE.DataTexture(new Uint8Array(steps.map(v => Math.round(v * 255))), steps.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

// 그림자를 드리우는 것(지붕, 전광판, 기둥, 조명탑, 나무)과 받는 것
const CASTS = /^(roof|beam|column|navy|fascia|pole|leaf|trunk|white|concrete|awning|ball|backdrop|wall)/;
const NO_RECV = /^(outline|cloud|hill|light|screen)/;
const SMOOTH = /^(leaf|cloud|hill|ball)/, UNLIT = /^(outline|light|screen)/;

export function buildStadium(D, opts = {}) {
  const group = new THREE.Group();
  const toon = ramp([0.42, 0.72, 1.0]);
  const cache = {};
  const matOf = (name, color) => {
    if (cache[name]) return cache[name];
    const c = new THREE.Color().setRGB(color[0], color[1], color[2]);   // glb의 색은 선형 값
    let m;
    if (name === 'outline') m = new THREE.MeshBasicMaterial({ color: c });
    else if (name === 'light') m = new THREE.MeshBasicMaterial({ color: c });
    else if (name === 'cloud') m = new THREE.MeshToonMaterial({ color: c, gradientMap: ramp([0.55, 0.8, 1.0]), emissive: new THREE.Color(0xa9c8f0), emissiveIntensity: 0.5 });
    else if (/^hill/.test(name)) m = new THREE.MeshToonMaterial({ color: c, gradientMap: toon });
    else m = new THREE.MeshToonMaterial({ color: c, gradientMap: toon });
    return (cache[name] = m);
  };
  let screenMesh = null;
  for (const m of D.meshes) {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    if (m.uv) g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    if (m.idx) g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    // 모델에는 법선이 없다(파일을 줄이려고). 둥근 것은 부드럽게, 나머지는 면마다 각지게 다시 계산한다
    if (m.nor) g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    else if (!UNLIT.test(m.mat)) { if (!SMOOTH.test(m.mat) && g.index) g = g.toNonIndexed(); g.computeVertexNormals(); }
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, matOf(m.mat, m.color));
    mesh.name = m.name;
    mesh.castShadow = CASTS.test(m.mat);
    mesh.receiveShadow = !NO_RECV.test(m.mat);
    mesh.matrixAutoUpdate = false;
    if (m.mat === 'screen') screenMesh = mesh;
    group.add(mesh);
  }
  const out = { group, update() { }, setBoard() { } };

  // 전광판: 대회 이름과 지금 점수
  if (screenMesh) {
    const c = document.createElement('canvas'); c.width = 768; c.height = 384;   // 1024×512 기준으로 그리고 줄여 담는다
    const t = tex(c); t.flipY = false;   // glTF UV는 위가 0이다
    screenMesh.material = new THREE.MeshBasicMaterial({ map: t });
    const draw = (b = {}) => {
      const x = c.getContext('2d');
      x.setTransform(0.75, 0, 0, 0.75, 0, 0);
      const gr = x.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#1d2f63'); gr.addColorStop(1, '#0f1a3d');
      x.fillStyle = gr; x.fillRect(0, 0, 1024, 512);
      x.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < 512; y += 6) x.fillRect(0, y, 1024, 2);   // 전광판 줄
      x.fillStyle = '#ff6f9a'; x.fillRect(0, 0, 1024, 70);
      x.fillStyle = '#fff'; x.font = 'bold 44px "Noto Sans KR", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(opts.banner || '테니스 대회', 512, 37);
      if (b.rows) {
        b.rows.forEach((r, i) => {
          const y = 168 + i * 150;
          x.fillStyle = i === 0 ? '#ff8fb3' : '#7cc8ff'; x.fillRect(40, y - 56, 14, 112);
          x.fillStyle = '#fff'; x.textAlign = 'left'; x.font = 'bold 52px "Noto Sans KR", sans-serif';
          x.fillText(r.name, 80, y);
          if (r.serve) { x.fillStyle = '#d8f04a'; x.beginPath(); x.arc(64 + x.measureText(r.name).width + 44, y, 16, 0, Math.PI * 2); x.fill(); }
          x.textAlign = 'center'; x.fillStyle = '#ffd24f'; x.font = 'bold 96px "Noto Sans KR", sans-serif'; x.fillText(String(r.games), 790, y + 4);
          x.fillStyle = '#fff'; x.font = 'bold 76px "Noto Sans KR", sans-serif'; x.fillText(r.point || '', 930, y + 4);
        });
        if (b.label) { x.fillStyle = 'rgba(255,255,255,0.7)'; x.font = 'bold 34px "Noto Sans KR", sans-serif'; x.textAlign = 'center'; x.fillText(b.label, 512, 478); }
      } else {
        x.fillStyle = '#d8f04a'; x.beginPath(); x.arc(512, 290, 110, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#fff'; x.lineWidth = 12;
        x.beginPath(); x.arc(392, 290, 100, -0.9, 0.9); x.stroke(); x.beginPath(); x.arc(632, 290, 100, Math.PI - 0.9, Math.PI + 0.9); x.stroke();
      }
      t.needsUpdate = true;
    };
    draw();
    out.setBoard = draw;
  }

  // 대회 현수막(맞은편 벽)
  if (D.info.banner) {
    const [x, y, z, w, h] = D.info.banner;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 104;
    const b = c.getContext('2d'); b.fillStyle = '#ffffff'; b.fillRect(0, 0, 1024, 104);
    b.fillStyle = '#ff5b8a'; b.fillRect(0, 0, 1024, 12); b.fillRect(0, 92, 1024, 12);
    b.fillStyle = '#20324a'; b.font = 'bold 50px "Noto Sans KR", sans-serif'; b.textAlign = 'center'; b.textBaseline = 'middle';
    b.fillText(opts.banner || '동호인 테니스 대회', 512, 54);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex(c) }));
    m.position.set(x, y, z); group.add(m);
    // 양옆 작은 판: 공과 라켓 그림
    for (const sx of [-1, 1]) {
      const c2 = document.createElement('canvas'); c2.width = 256; c2.height = 104;
      const q = c2.getContext('2d'); q.fillStyle = sx < 0 ? '#5cbcff' : '#ffd24f'; q.fillRect(0, 0, 256, 104);
      q.fillStyle = '#d8f04a'; q.strokeStyle = '#20324a'; q.lineWidth = 5; q.beginPath(); q.arc(128, 52, 34, 0, Math.PI * 2); q.fill(); q.stroke();
      q.strokeStyle = '#fff'; q.lineWidth = 5; q.beginPath(); q.arc(92, 52, 34, -0.8, 0.8); q.stroke(); q.beginPath(); q.arc(164, 52, 34, Math.PI - 0.8, Math.PI + 0.8); q.stroke();
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, h), new THREE.MeshBasicMaterial({ map: tex(c2) }));
      s.position.set(x + sx * (w / 2 + 1.9), y, z); group.add(s);
    }
  }

  // 공을 막는 그물(반투명). 공이 펜스에 맞는 자리(js/ball.js)와 같다
  if (D.info.nets) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const f = c.getContext('2d'); f.strokeStyle = 'rgba(30,50,60,0.55)'; f.lineWidth = 2;
    for (let i = -64; i <= 128; i += 16) { f.beginPath(); f.moveTo(i, 0); f.lineTo(i + 64, 64); f.stroke(); f.beginPath(); f.moveTo(i + 64, 0); f.lineTo(i, 64); f.stroke(); }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    for (const [x, y, z, w, h, ry] of D.info.nets) {
      const tt = t.clone(); tt.repeat.set(w / 0.9, h / 0.9); tt.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tt, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 2; group.add(m);
    }
  }

  // 관중: 자리마다 작은 사람 그림 한 장. 대회가 클수록, 결승에 가까울수록 많이 온다
  const seats = D.info.seats || [];
  if (seats.length) {
    const fill = Math.max(0.08, Math.min(1, opts.crowd ?? 0.6));
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const chosen = seats.filter(() => rnd() < fill);
    const geo = new THREE.PlaneGeometry(0.64, 0.96); geo.translate(0, 0.33, 0);
    const n = chosen.length;
    const cell = new Float32Array(n * 2), ph = new Float32Array(n);
    const mesh = new THREE.InstancedMesh(geo, null, n);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    chosen.forEach(([x, y, z, ry, shade], i) => {
      Q.setFromAxisAngle(Y, ry);
      const sc = 0.92 + rnd() * 0.16;
      M4.compose(V.set(x + (rnd() - 0.5) * 0.08, y, z), Q, S1.set(sc, sc, sc));
      mesh.setMatrixAt(i, M4);
      const k = Math.floor(rnd() * 16);
      cell[i * 2] = (k % 4) / 4; cell[i * 2 + 1] = Math.floor(k / 4) / 4;
      ph[i] = rnd() * 6.283;
      mesh.setColorAt(i, col.setScalar(shade ? 0.74 : 1));
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
    geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
    const U = { uT: { value: 0 }, uAmp: { value: 0 } };
    const mat = new THREE.MeshBasicMaterial({ map: tex(crowdAtlas()), alphaTest: 0.5 });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute vec2 aCell;\nattribute float aPh;\nuniform float uT;\nuniform float uAmp;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vMapUv * 0.25 + aCell;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += max(0.0, sin(uT * 17.0 + aPh)) * 0.24 * uAmp + sin(uT * 1.7 + aPh) * 0.012;');
    };
    mesh.material = mat;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    out.crowdCount = n;
    out.update = (dt, amp) => { U.uT.value += dt; U.uAmp.value = Math.min(1.2, amp); };
  }
  return out;
}

// 관중 그림 16가지(4×4): 옷 색, 머리, 모자, 응원 도구가 다르다
function crowdAtlas() {
  const W = 64, H = 96, c = document.createElement('canvas'); c.width = W * 4; c.height = H * 4;
  const x = c.getContext('2d');
  let s = 777; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = a => a[Math.floor(r() * a.length)];
  const SHIRT = ['#ff7fa8', '#5cbcff', '#ffd24f', '#63d6a6', '#a993ff', '#ffffff', '#ff9966', '#3f6fd8', '#ff5b8a', '#9be15d'];
  const HAIR = ['#3a2a22', '#22201f', '#5a3a28', '#7a4a2a', '#2a2230', '#b07a4a'];
  const SKIN = ['#ffe3cf', '#f9d6bd', '#f1c9a5'];
  const LINE = '#2d2b45';
  for (let k = 0; k < 16; k++) {
    const ox = (k % 4) * W, oy = Math.floor(k / 4) * H;
    x.save(); x.translate(ox, oy);
    x.lineWidth = 3; x.strokeStyle = LINE; x.lineJoin = 'round';
    const shirt = pick(SHIRT), hair = pick(HAIR), skin = pick(SKIN);
    const style = k % 4, prop = Math.floor(k / 4);   // 머리 모양, 들고 있는 것
    const up = prop === 1 || prop === 3;           // 두 팔을 든 사람
    // 팔
    x.fillStyle = shirt;
    if (up) {
      for (const sx of [-1, 1]) { x.beginPath(); x.roundRect(32 + sx * 17 - 5, 22, 10, 40, 5); x.fill(); x.stroke(); x.fillStyle = skin; x.beginPath(); x.arc(32 + sx * 17, 20, 6, 0, Math.PI * 2); x.fill(); x.stroke(); x.fillStyle = shirt; }
    }
    // 몸
    x.beginPath(); x.roundRect(12, 56, 40, 44, 14); x.fill(); x.stroke();
    if (!up) { x.beginPath(); x.roundRect(6, 60, 11, 30, 5); x.fill(); x.stroke(); x.beginPath(); x.roundRect(47, 60, 11, 30, 5); x.fill(); x.stroke(); }
    // 얼굴
    x.fillStyle = skin; x.beginPath(); x.arc(32, 40, 16, 0, Math.PI * 2); x.fill(); x.stroke();
    // 머리
    x.fillStyle = hair;
    if (style === 0) { x.beginPath(); x.arc(32, 37, 17, Math.PI * 1.02, Math.PI * 1.98); x.lineTo(49, 44); x.quadraticCurveTo(40, 32, 32, 30); x.quadraticCurveTo(22, 32, 15, 44); x.closePath(); x.fill(); x.stroke(); }
    else if (style === 1) { x.beginPath(); x.arc(32, 38, 18, Math.PI, 0); x.lineTo(50, 52); x.lineTo(44, 52); x.lineTo(44, 40); x.quadraticCurveTo(32, 30, 20, 40); x.lineTo(20, 52); x.lineTo(14, 52); x.closePath(); x.fill(); x.stroke(); }
    else if (style === 2) { x.fillStyle = pick(['#ff5b8a', '#3f6fd8', '#ffffff', '#ffd24f']); x.beginPath(); x.arc(32, 34, 17, Math.PI, 0); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.roundRect(28, 30, 28, 7, 3); x.fill(); x.stroke(); }
    else { x.beginPath(); x.arc(32, 36, 17, Math.PI * 1.05, Math.PI * 1.95); x.quadraticCurveTo(32, 28, 15, 40); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.arc(47, 30, 7, 0, Math.PI * 2); x.fill(); x.stroke(); }
    // 눈
    x.fillStyle = LINE; x.beginPath(); x.arc(26, 43, 2.2, 0, Math.PI * 2); x.arc(38, 43, 2.2, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,120,140,0.45)'; x.beginPath(); x.arc(22, 48, 3, 0, Math.PI * 2); x.arc(42, 48, 3, 0, Math.PI * 2); x.fill();
    // 들고 있는 것
    if (prop === 1) { x.fillStyle = pick(['#ff5b8a', '#ffd24f', '#5cbcff']); x.strokeStyle = LINE; x.beginPath(); x.roundRect(8, 4, 48, 14, 4); x.fill(); x.stroke(); }   // 머리 위 수건
    if (prop === 2) { x.strokeStyle = LINE; x.lineWidth = 2.5; x.beginPath(); x.moveTo(54, 86); x.lineTo(56, 40); x.stroke(); x.fillStyle = pick(['#ff7fa8', '#5cbcff', '#ffd24f']); x.beginPath(); x.moveTo(56, 40); x.lineTo(56, 58); x.lineTo(40, 49); x.closePath(); x.fill(); x.stroke(); }   // 작은 깃발
    if (prop === 3) { for (const sx of [-1, 1]) { x.fillStyle = pick(['#ff7fa8', '#ffd24f', '#ffffff']); x.beginPath(); x.arc(32 + sx * 17, 14, 8, 0, Math.PI * 2); x.fill(); x.stroke(); } }   // 응원 술
    x.restore();
  }
  return c;
}
