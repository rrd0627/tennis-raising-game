// 임시 아트 생성기 + 실제 아트 로더
// art/manifest.json 에 아티스트 파일이 등록되어 있으면 그 파일을 쓰고, 없으면 여기서 그린 임시 그림을 씁니다.
// 파일 이름 규칙은 기획 문서의 '아트 명세서' 탭을 따릅니다.

let manifest = { chr: {}, sd: {} };
const imgCache = new Map();
export async function loadManifest() {
  try {
    const r = await fetch('art/manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = { chr: {}, sd: {}, ...(await r.json()) };
  } catch { /* 없으면 임시 아트 */ }
  return manifest;
}
function loadImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  imgCache.set(src, p);
  return p;
}

export const PLAYER_LOOK = { hair: '#4a2e22', outfit: '#ff7aa2', skin: '#ffe0cc', band: '#ffffff' };
const OPP_OUTFITS = ['#6c8cff', '#ffb84d', '#7ad3a8', '#c58cff', '#ff8f6b', '#5bc0eb', '#f2d16b', '#9aa7b8'];
const HAIRS = ['#2b2b2b', '#4a2e22', '#6b3f2a', '#1e1e2a', '#8a5a3a', '#3a2a5a'];
export function oppLook(seed, k) {
  return { hair: HAIRS[(seed + k * 3) % HAIRS.length], outfit: OPP_OUTFITS[(seed >> 3) % OPP_OUTFITS.length], skin: '#ffe0cc', band: k ? '#ffffff' : '#222' };
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(Math.min(255, r * f)); g = Math.round(Math.min(255, g * f)); b = Math.round(Math.min(255, b * f));
  return `rgb(${r},${g},${b})`;
}

// ── 경기용 SD 캐릭터 (2~2.5등신), 앞·뒤 2방향 ────────────────
// pose: ready | fh | bh | serve | volley | smash | cheer | sad
export function chibiCanvas(look, facing = 'front', pose = 'ready', size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.scale(size / 256, size / 256);
  const L = { ...PLAYER_LOOK, ...look };
  const line = shade(L.outfit, 0.55), skinLine = '#c98f78';
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const cx = 128, ground = 250;
  const front = facing === 'front';
  const raise = pose === 'serve' || pose === 'smash' || pose === 'cheer';
  // 라켓 위치
  const racket = {
    ready: [cx + 46, 150, -0.3], fh: [cx + 78, 120, -1.2], bh: [cx - 78, 124, 1.2], serve: [cx + 30, 26, 0.2],
    volley: [cx + 52, 112, -0.6], smash: [cx + 22, 22, 0.4], cheer: [cx + 50, 40, -0.2], sad: [cx + 40, 196, 0.9],
  }[pose] || [cx + 46, 150, -0.3];
  if (!front) racket[0] = cx * 2 - racket[0], racket[2] = -racket[2];
  const drawRacket = () => {
    const [rx, ry, ang] = racket;
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(ang);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, 46); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.strokeStyle = '#e8456b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(0, -4, 17, 24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,80,80,0.5)'; ctx.lineWidth = 1.2;
    for (let i = -12; i <= 12; i += 6) { ctx.beginPath(); ctx.moveTo(i, -24); ctx.lineTo(i, 16); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-15, i - 4); ctx.lineTo(15, i - 4); ctx.stroke(); }
    ctx.restore();
  };
  // 다리
  const legSpread = pose === 'ready' || pose === 'volley' ? 20 : pose === 'sad' ? 10 : 16;
  ctx.fillStyle = L.skin; ctx.strokeStyle = skinLine;
  for (const s of [-1, 1]) { rr(ctx, cx + s * legSpread - 9, 192, 18, 44, 8); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#999';
  for (const s of [-1, 1]) { rr(ctx, cx + s * legSpread - 14, 230, 28, 16, 8); ctx.fill(); ctx.stroke(); }
  // 몸통 + 치마
  ctx.fillStyle = L.outfit; ctx.strokeStyle = line;
  ctx.beginPath(); ctx.moveTo(cx - 36, 206); ctx.lineTo(cx + 36, 206); ctx.lineTo(cx + 26, 168); ctx.lineTo(cx - 26, 168); ctx.closePath(); ctx.fill(); ctx.stroke();
  rr(ctx, cx - 28, 126, 56, 50, 16); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(L.outfit, 1.25); rr(ctx, cx - 28, 126, 56, 10, 6); ctx.fill();
  // 팔
  ctx.strokeStyle = L.skin; ctx.lineWidth = 13;
  const hand = [racket[0] + (front ? 0 : 0), racket[1] + 40];
  const handY = Math.min(hand[1], 190);
  ctx.beginPath(); ctx.moveTo(cx + (hand[0] > cx ? 24 : -24), 138); ctx.lineTo(hand[0], handY); ctx.stroke();
  const other = raise ? [cx - 44, 70] : pose === 'sad' ? [cx - 30, 186] : pose === 'bh' ? [cx - 62, 140] : [cx - 46, 164];
  if (!front && !raise) other[0] = cx * 2 - other[0];
  ctx.beginPath(); ctx.moveTo(cx + (other[0] > cx ? 24 : -24), 138); ctx.lineTo(other[0], other[1]); ctx.stroke();
  ctx.lineWidth = 4;
  if (!front) drawRacket();
  // 머리
  const hy = 80;
  ctx.fillStyle = L.hair; ctx.strokeStyle = shade(L.hair, 0.6);
  // 포니테일
  ctx.beginPath(); ctx.ellipse(cx + (front ? 52 : -52), hy + 26, 16, 30, front ? -0.5 : 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = L.skin; ctx.strokeStyle = skinLine;
  ctx.beginPath(); ctx.arc(cx, hy, 60, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = L.hair; ctx.strokeStyle = shade(L.hair, 0.6);
  if (front) {
    ctx.beginPath(); ctx.arc(cx, hy - 4, 62, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(cx + 50, hy - 6);
    ctx.quadraticCurveTo(cx + 24, hy - 22, cx + 6, hy - 10); ctx.quadraticCurveTo(cx - 20, hy - 24, cx - 52, hy - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 얼굴
    const sad = pose === 'sad', happy = pose === 'cheer';
    ctx.fillStyle = '#2a1c18';
    for (const s of [-1, 1]) {
      if (happy) { ctx.lineWidth = 5; ctx.strokeStyle = '#2a1c18'; ctx.beginPath(); ctx.arc(cx + s * 22, hy + 14, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else { ctx.beginPath(); ctx.ellipse(cx + s * 22, hy + 12, 7, sad ? 7 : 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + s * 22 + 2, hy + 8, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2a1c18'; }
    }
    ctx.fillStyle = 'rgba(255,120,140,0.45)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 36, hy + 28, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#8a3b3b'; ctx.lineWidth = 3.5; ctx.beginPath();
    if (happy) { ctx.arc(cx, hy + 30, 9, 0.1 * Math.PI, 0.9 * Math.PI); }
    else if (sad) { ctx.arc(cx, hy + 42, 8, 1.15 * Math.PI, 1.85 * Math.PI); }
    else { ctx.moveTo(cx - 6, hy + 34); ctx.quadraticCurveTo(cx, hy + 38, cx + 6, hy + 34); }
    ctx.stroke(); ctx.lineWidth = 4;
  } else {
    ctx.beginPath(); ctx.arc(cx, hy - 2, 62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // 헤어밴드
  ctx.strokeStyle = L.band; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, hy - 2, 60, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); ctx.lineWidth = 4;
  if (front) drawRacket();
  return c;
}

// ── 대화용 스탠딩 (가슴 위 흉상) ──────────────────────────
// expr: base | smile | joy | surprise | tense | focus | down | angry | tired | cry
export function portraitCanvas(look, expr = 'base', size = 320) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); ctx.scale(size / 320, size / 320);
  const L = { ...PLAYER_LOOK, ...look };
  const cx = 160;
  ctx.lineWidth = 5; ctx.lineJoin = 'round';
  ctx.fillStyle = L.outfit; ctx.strokeStyle = shade(L.outfit, 0.55);
  ctx.beginPath(); ctx.moveTo(40, 320); ctx.quadraticCurveTo(50, 236, 160, 230); ctx.quadraticCurveTo(270, 236, 280, 320); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = L.hair; ctx.strokeStyle = shade(L.hair, 0.6);
  ctx.beginPath(); ctx.ellipse(cx + 92, 150, 26, 54, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = L.skin; ctx.strokeStyle = '#c98f78';
  ctx.beginPath(); ctx.arc(cx, 130, 96, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = L.hair; ctx.strokeStyle = shade(L.hair, 0.6);
  ctx.beginPath(); ctx.arc(cx, 124, 99, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(cx + 80, 120);
  ctx.quadraticCurveTo(cx + 40, 92, cx + 10, 110); ctx.quadraticCurveTo(cx - 34, 88, cx - 84, 122); ctx.closePath(); ctx.fill(); ctx.stroke();
  const happy = ['smile', 'joy'].includes(expr), sad = ['down', 'cry', 'tired'].includes(expr);
  ctx.fillStyle = '#2a1c18'; ctx.strokeStyle = '#2a1c18';
  for (const s of [-1, 1]) {
    if (expr === 'joy' || expr === 'smile') { ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx + s * 36, 150, 14, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    else if (expr === 'tired') { ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx + s * 36 - 14, 150); ctx.lineTo(cx + s * 36 + 14, 150); ctx.stroke(); }
    else {
      ctx.beginPath(); ctx.ellipse(cx + s * 36, 148, 11, expr === 'surprise' ? 18 : 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + s * 36 + 4, 141, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2a1c18';
    }
    if (expr === 'angry' || expr === 'focus' || expr === 'tense') { ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx + s * 52, 118); ctx.lineTo(cx + s * 22, expr === 'angry' ? 130 : 124); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(255,120,140,0.45)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 58, 178, 14, 9, 0, 0, Math.PI * 2); ctx.fill(); }
  if (expr === 'cry') { ctx.fillStyle = '#7cc7ff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 40, 178, 6, 12, 0, 0, Math.PI * 2); ctx.fill(); } }
  if (expr === 'tense' || expr === 'tired') { ctx.fillStyle = '#9ad7ff'; ctx.beginPath(); ctx.ellipse(cx + 86, 96, 8, 13, 0.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#8a3b3b'; ctx.lineWidth = 5; ctx.beginPath();
  if (happy) ctx.arc(cx, 186, 16, 0.1 * Math.PI, 0.9 * Math.PI);
  else if (sad || expr === 'angry') ctx.arc(cx, 206, 13, 1.15 * Math.PI, 1.85 * Math.PI);
  else if (expr === 'surprise') ctx.ellipse(cx, 196, 9, 12, 0, 0, Math.PI * 2);
  else { ctx.moveTo(cx - 10, 192); ctx.quadraticCurveTo(cx, 198, cx + 10, 192); }
  ctx.stroke();
  ctx.strokeStyle = L.band; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, 124, 96, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  return c;
}

// 실제 아트가 있으면 이미지, 없으면 임시 캔버스를 data URL 로
export async function portraitURL(charId, look, expr = 'base') {
  const path = manifest.chr?.[charId]?.[expr] || manifest.chr?.[charId]?.base;
  if (path) { const im = await loadImage(path); if (im) return path; }
  return portraitCanvas(look, expr, 192).toDataURL();
}

// 경기 스프라이트: manifest.sd[charId] = { image, json } (Aseprite 해시 JSON, 프레임 이름 `${pose}_${facing}`)
export async function sdFrames(charId, look, facing) {
  const poses = ['ready', 'fh', 'bh', 'serve', 'volley', 'smash', 'cheer', 'sad'];
  const out = {};
  const entry = manifest.sd?.[charId];
  if (entry) {
    try {
      const [im, js] = await Promise.all([loadImage(entry.image), fetch(entry.json).then(r => r.json())]);
      if (im) {
        for (const p of poses) {
          const f = js.frames?.[`${p}_${facing}`] || js.frames?.[`${p}_${facing}_0`];
          if (!f) continue;
          const c = document.createElement('canvas'); c.width = f.frame.w; c.height = f.frame.h;
          c.getContext('2d').drawImage(im, f.frame.x, f.frame.y, f.frame.w, f.frame.h, 0, 0, f.frame.w, f.frame.h);
          out[p] = c;
        }
      }
    } catch { /* 임시 아트로 */ }
  }
  for (const p of poses) if (!out[p]) out[p] = chibiCanvas(look, facing, p);
  return out;
}

// 주간 화면의 전신 캐릭터. 실제 아트가 들어오면 여기서 바꾼다.
const heroCache = new Map();
export function heroURL(look, pose = 'ready') {
  if (!heroCache.has(pose)) heroCache.set(pose, chibiCanvas(look, 'front', pose, 512).toDataURL());
  return heroCache.get(pose);
}

// 머리 위 이모티콘
export function emoteCanvas(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.lineWidth = 3;
  if (kind === 'sweat') { ctx.fillStyle = '#8fd3ff'; ctx.strokeStyle = '#3a8cc0'; ctx.beginPath(); ctx.moveTo(32, 6); ctx.quadraticCurveTo(54, 40, 32, 56); ctx.quadraticCurveTo(10, 40, 32, 6); ctx.fill(); ctx.stroke(); }
  else if (kind === 'fire') { ctx.fillStyle = '#ff7a3a'; ctx.beginPath(); ctx.moveTo(32, 4); ctx.quadraticCurveTo(58, 34, 46, 56); ctx.quadraticCurveTo(32, 62, 18, 56); ctx.quadraticCurveTo(6, 34, 32, 4); ctx.fill(); ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(32, 44, 9, 13, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (kind === 'cloud') { ctx.fillStyle = '#6b6f7a'; for (const [x, y, r] of [[22, 34, 14], [36, 28, 16], [46, 38, 12], [30, 42, 12]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); } }
  else if (kind === 'heart') { ctx.fillStyle = '#ff5b8a'; ctx.beginPath(); ctx.moveTo(32, 54); ctx.bezierCurveTo(-4, 30, 14, 2, 32, 20); ctx.bezierCurveTo(50, 2, 68, 30, 32, 54); ctx.fill(); }
  else if (kind === 'bang') { ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#b8860b'; ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#5a3a00'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 32, 46); }
  return c;
}
