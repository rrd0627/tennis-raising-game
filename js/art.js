// 임시 아트 생성기 + 실제 아트 로더
// art/manifest.json 에 아티스트 파일이 등록되어 있으면 그 파일을 쓰고, 없으면 여기서 그린 임시 그림을 씁니다.
// 파일 이름 규칙은 기획 문서의 '아트 명세서' 탭을 따릅니다.

let manifest = { chr: {}, sd: {}, bg: {} };
const imgCache = new Map();
export async function loadManifest() {
  try {
    const r = await fetch('art/manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = { chr: {}, sd: {}, bg: {}, ...(await r.json()) };
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
// pose: ready | fh | bh | serve | volley | smash | cheer | sad, 라켓 없이: tired | stretch | relax
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
  // 라켓 없는 자세의 양손 위치
  const bare = { tired: [[cx + 30, 190], [cx - 30, 190]], stretch: [[cx + 80, 46], [cx - 80, 46]], relax: [[cx + 22, 178], [cx - 22, 178]] }[pose];
  const drawRacket = () => {
    if (bare) return;
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
  const legSpread = pose === 'ready' || pose === 'volley' ? 20 : pose === 'sad' || pose === 'tired' ? 10 : 16;
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
  const hand = bare ? bare[0] : [racket[0] + (front ? 0 : 0), racket[1] + 40];
  const handY = Math.min(hand[1], 190);
  ctx.beginPath(); ctx.moveTo(cx + (hand[0] > cx ? 24 : -24), 138); ctx.lineTo(hand[0], handY); ctx.stroke();
  const other = bare ? [...bare[1]] : raise ? [cx - 44, 70] : pose === 'sad' ? [cx - 30, 186] : pose === 'bh' ? [cx - 62, 140] : [cx - 46, 164];
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
    const sad = pose === 'sad' || pose === 'tired', happy = pose === 'cheer' || pose === 'stretch' || pose === 'relax';
    ctx.fillStyle = '#2a1c18';
    for (const s of [-1, 1]) {
      if (pose === 'tired') { ctx.lineWidth = 5; ctx.strokeStyle = '#2a1c18'; ctx.beginPath(); ctx.moveTo(cx + s * 22 - 9, hy + 13); ctx.lineTo(cx + s * 22 + 9, hy + 13); ctx.stroke(); }
      else if (happy) { ctx.lineWidth = 5; ctx.strokeStyle = '#2a1c18'; ctx.beginPath(); ctx.arc(cx + s * 22, hy + 14, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
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
  const key = pose + look.outfit;
  if (!heroCache.has(key)) heroCache.set(key, chibiCanvas(look, 'front', pose, 1024).toDataURL());
  return heroCache.get(key);
}

// ── 주간 화면 배경 (임시 그림) ────────────────────────────
// 실제 아트가 들어오면 art/manifest.json 의 bg[kind] 경로를 쓴다.
// kind: home | court | wall | club | room | cafe | venue | office
const BG_W = 540, BG_H = 1170;
const SEASON_KEY = { 봄: 'spring', 여름: 'summer', 가을: 'autumn', 겨울: 'winter' };
const SKY = { spring: ['#7cc8f2', '#dff3ff'], summer: ['#3fa9ee', '#c6ebff'], autumn: ['#79aedb', '#f8e6cc'], winter: ['#a7bdd3', '#edf2f6'] };
const LEAF = { spring: ['#f7b9cf', '#fbd3e0', '#f29dbb'], summer: ['#4fa866', '#6cbf7a', '#3b8f55'], autumn: ['#e08a3c', '#d9622f', '#f0b04a'], winter: ['#a4b0ad', '#c3ccca', '#8e9b98'] };
const GRASS = { spring: ['#8ad287', '#5fb56e'], summer: ['#62bc6d', '#3f9a58'], autumn: ['#bcb46a', '#97904a'], winter: ['#dde6e3', '#bccbc7'] };

function seeded(seed) { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
function paintSky(ctx, y, top, bottom, r) {
  const g = ctx.createLinearGradient(0, 0, 0, y); g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, BG_W, y);
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  for (let i = 0; i < 4; i++) {
    const cx = r() * BG_W, cy = 40 + r() * (y * 0.55), s = 26 + r() * 30;
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(cx + (k - 2.5) * s * 0.62, cy + (k % 2) * 7, s * (0.7 + r() * 0.4), s * 0.46, 0, 0, Math.PI * 2); ctx.fill(); }
  }
}
function paintTree(ctx, x, base, s, pal, r) {
  ctx.fillStyle = '#6d4c3a'; ctx.fillRect(x - s * 0.09, base - s * 0.75, s * 0.18, s * 0.75);
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = r() * s * 0.62;
    ctx.fillStyle = pal[i % pal.length];
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, base - s * 1.05 + Math.sin(a) * d * 0.72, s * (0.2 + r() * 0.16), 0, Math.PI * 2); ctx.fill();
  }
}
function paintTreeLine(ctx, y, pal, r) {
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = pal[i % pal.length]; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc((i / 25) * BG_W, y - r() * 42, 34 + r() * 30, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.fillStyle = pal[0]; ctx.fillRect(0, y - 10, BG_W, 40);
}
function paintFence(ctx, top, bottom) {
  ctx.strokeStyle = 'rgba(55,75,70,.34)'; ctx.lineWidth = 2;
  for (let x = -bottom; x < BG_W + bottom; x += 22) {
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + (bottom - top), bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + (bottom - top), top); ctx.lineTo(x, bottom); ctx.stroke();
  }
  ctx.fillStyle = '#51635d';
  for (let x = 0; x <= BG_W; x += 135) ctx.fillRect(x - 4, top - 10, 8, bottom - top + 10);
  ctx.fillRect(0, top - 8, BG_W, 6);
}
function paintCourt(ctx, y, outer, inner) {
  ctx.fillStyle = outer; ctx.fillRect(0, y, BG_W, BG_H - y);
  const cx = BG_W / 2, ty = y + 26, by = BG_H + 40, tw = BG_W * 0.66, bw = BG_W * 2.1;
  const wAt = t => tw + (bw - tw) * t, yAt = t => ty + (by - ty) * t;
  ctx.beginPath(); ctx.moveTo(cx - tw / 2, ty); ctx.lineTo(cx + tw / 2, ty); ctx.lineTo(cx + bw / 2, by); ctx.lineTo(cx - bw / 2, by); ctx.closePath();
  ctx.fillStyle = inner; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 6; ctx.stroke();
  ctx.lineWidth = 5; const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  line(cx - wAt(0.1) * 0.39, yAt(0.1), cx + wAt(0.1) * 0.39, yAt(0.1));
  line(cx - wAt(0.46) * 0.39, yAt(0.46), cx + wAt(0.46) * 0.39, yAt(0.46));
  line(cx, yAt(0.1), cx, yAt(0.46));
  line(cx - tw * 0.39, ty, cx - bw * 0.39, by); line(cx + tw * 0.39, ty, cx + bw * 0.39, by);
}
function paintNet(ctx, y, h) {
  const l = 20, rr2 = BG_W - 20;
  ctx.strokeStyle = 'rgba(40,40,40,.42)'; ctx.lineWidth = 1.5;
  for (let x = l; x <= rr2; x += 11) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke(); }
  for (let k = 0; k <= h; k += 11) { ctx.beginPath(); ctx.moveTo(l, y + k); ctx.lineTo(rr2, y + k); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.fillRect(l, y - 4, rr2 - l, 9);
  ctx.fillStyle = '#39423e'; ctx.fillRect(l - 7, y - 10, 10, h + 14); ctx.fillRect(rr2 - 3, y - 10, 10, h + 14);
}
function paintBalls(ctx, list) {
  for (const [x, y, s] of list) {
    ctx.fillStyle = '#dfee45'; ctx.strokeStyle = '#9fb027'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x - s * 0.5, y, s * 0.8, -0.8, 0.8); ctx.stroke();
  }
}
function paintFall(ctx, season, r) {
  if (season === 'summer') return;
  const color = { spring: '#fbc6d8', autumn: '#e0883a', winter: '#ffffff' }[season];
  ctx.fillStyle = color;
  for (let i = 0; i < 46; i++) {
    const s = season === 'winter' ? 2 + r() * 4 : 3 + r() * 4;
    ctx.save(); ctx.translate(r() * BG_W, r() * BG_H * 0.86); ctx.rotate(r() * 3);
    ctx.globalAlpha = 0.65 + r() * 0.35; ctx.beginPath(); ctx.ellipse(0, 0, s, season === 'winter' ? s : s * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.globalAlpha = 1;
}
const SCENES = {
  // 평소: 클럽하우스 앞. 계절이 가장 잘 보이는 곳
  home(ctx, season, r) {
    paintSky(ctx, 560, ...SKY[season], r);
    paintTreeLine(ctx, 430, LEAF[season], r);
    ctx.fillStyle = '#f4e6cf'; ctx.fillRect(20, 268, 300, 250);
    ctx.fillStyle = '#b4583f'; ctx.beginPath(); ctx.moveTo(-6, 276); ctx.lineTo(170, 186); ctx.lineTo(346, 276); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8fc7e2'; for (const x of [52, 134, 216]) { ctx.fillRect(x, 318, 58, 70); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.strokeRect(x, 318, 58, 70); }
    ctx.fillStyle = '#7b5137'; ctx.fillRect(134, 420, 58, 98);
    paintFence(ctx, 396, 540);
    ctx.fillStyle = GRASS[season][0]; ctx.fillRect(0, 520, BG_W, BG_H - 520);
    ctx.fillStyle = '#e4d8c3'; ctx.beginPath(); ctx.moveTo(180, 520); ctx.lineTo(360, 520); ctx.lineTo(640, BG_H); ctx.lineTo(-100, BG_H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,130,105,.45)'; ctx.lineWidth = 2;
    for (let y = 545; y < BG_H; y += 30 + (y - 520) * 0.06) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(BG_W, y); ctx.stroke(); }
    ctx.fillStyle = GRASS[season][1];
    ctx.beginPath(); ctx.moveTo(0, 620); ctx.quadraticCurveTo(60, 620, 150, 520); ctx.lineTo(0, 520); ctx.fill();
    paintTree(ctx, 472, 612, 196, LEAF[season], r);
    paintTree(ctx, 22, 650, 170, LEAF[season], r);
    paintFall(ctx, season, r);
  },
  // 레슨: 코트 안, 네트와 공 바구니
  court(ctx, season, r) {
    paintSky(ctx, 470, ...SKY[season], r);
    paintTreeLine(ctx, 340, LEAF[season], r);
    paintFence(ctx, 270, 500);
    paintCourt(ctx, 490, '#3f8f73', '#3f78b5');
    paintNet(ctx, 566, 74);
    ctx.fillStyle = '#6a7680'; ctx.fillRect(448, 640, 74, 74);
    ctx.strokeStyle = '#3f4a52'; ctx.lineWidth = 5; ctx.strokeRect(448, 640, 74, 74);
    paintBalls(ctx, [[462, 636, 12], [486, 632, 12], [510, 638, 12], [474, 618, 12], [498, 618, 12], [62, 726, 10], [120, 768, 11], [430, 786, 11]]);
    paintFall(ctx, season, r);
  },
  // 혼자 연습: 연습벽
  wall(ctx, season, r) {
    paintSky(ctx, 400, ...SKY[season], r);
    paintTreeLine(ctx, 300, LEAF[season], r);
    ctx.fillStyle = '#3f7f62'; ctx.fillRect(0, 250, BG_W, 340);
    ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let x = 0; x < BG_W; x += 90) ctx.fillRect(x, 250, 3, 340);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 438, BG_W, 8);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; for (const [x, y] of [[120, 340], [300, 300], [410, 380], [210, 400], [90, 410]]) { ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); }
    paintCourt(ctx, 590, '#3f8f73', '#4c8f6e');
    paintBalls(ctx, [[60, 612, 10], [100, 622, 10], [468, 616, 10], [430, 640, 11], [504, 660, 12]]);
    paintFall(ctx, season, r);
  },
  // 클럽 게임: 퇴근 후 저녁 코트, 조명과 벤치
  club(ctx, season, r) {
    const g = ctx.createLinearGradient(0, 0, 0, 500); g.addColorStop(0, '#574a8c'); g.addColorStop(0.55, '#d9799a'); g.addColorStop(1, '#f7c38a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, BG_W, 500);
    paintTreeLine(ctx, 340, LEAF[season].map(c => shade(c, 0.62)), r);
    paintFence(ctx, 270, 500);
    for (const x of [64, 476]) {
      ctx.fillStyle = '#38414a'; ctx.fillRect(x - 5, 110, 10, 390); ctx.fillRect(x - 40, 100, 80, 26);
      const h = ctx.createRadialGradient(x, 114, 4, x, 114, 190); h.addColorStop(0, 'rgba(255,245,200,.9)'); h.addColorStop(1, 'rgba(255,245,200,0)');
      ctx.fillStyle = h; ctx.fillRect(x - 190, -70, 380, 380);
    }
    paintCourt(ctx, 490, '#3b7a64', '#3a6a9f');
    paintNet(ctx, 566, 74);
    ctx.fillStyle = '#8b5e3c'; ctx.fillRect(14, 648, 122, 13); ctx.fillRect(22, 661, 10, 28); ctx.fillRect(118, 661, 10, 28);
    ctx.fillStyle = '#e8456b'; ctx.fillRect(30, 612, 44, 36); ctx.fillStyle = '#3f78b5'; ctx.fillRect(82, 620, 40, 28);
  },
  // 휴식: 내 방
  room(ctx, season) {
    const g = ctx.createLinearGradient(0, 0, 0, 680); g.addColorStop(0, '#f7ead9'); g.addColorStop(1, '#efd9c0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, BG_W, 680);
    ctx.fillStyle = SKY[season][0]; ctx.fillRect(30, 150, 200, 240);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(110, 220, 64, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.strokeRect(30, 150, 200, 240); ctx.beginPath(); ctx.moveTo(130, 150); ctx.lineTo(130, 390); ctx.stroke();
    ctx.fillStyle = '#f2a8bd'; ctx.fillRect(14, 136, 44, 280); ctx.fillRect(202, 136, 44, 280);
    ctx.fillStyle = '#b98a63'; ctx.fillRect(320, 200, 196, 12);
    ctx.fillStyle = '#ffd24d'; ctx.beginPath(); ctx.moveTo(350, 200); ctx.lineTo(392, 200); ctx.lineTo(384, 170); ctx.lineTo(358, 170); ctx.closePath(); ctx.fill(); ctx.fillRect(364, 146, 14, 26);
    ctx.fillStyle = '#7cb0d9'; ctx.fillRect(420, 150, 26, 50); ctx.fillStyle = '#e8878f'; ctx.fillRect(450, 158, 22, 42); ctx.fillStyle = '#8ec58f'; ctx.fillRect(476, 146, 24, 54);
    ctx.fillStyle = '#c99f78'; ctx.fillRect(0, 680, BG_W, BG_H - 680);
    ctx.strokeStyle = 'rgba(120,85,55,.35)'; ctx.lineWidth = 3;
    for (let y = 680; y < BG_H; y += 62) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(BG_W, y); ctx.stroke(); }
    ctx.fillStyle = '#9d7551'; ctx.fillRect(270, 470, 270, 240);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(282, 500, 258, 130, 22); ctx.fill();
    ctx.fillStyle = '#ff9db8'; ctx.beginPath(); ctx.roundRect(282, 556, 258, 140, 20); ctx.fill();
    ctx.fillStyle = '#fff5e8'; ctx.beginPath(); ctx.roundRect(300, 498, 110, 56, 24); ctx.fill();
    ctx.fillStyle = '#efd9c0'; ctx.fillRect(0, 668, BG_W, 12);
  },
  // 가족·친구: 저녁 식탁이 있는 카페
  cafe(ctx) {
    ctx.fillStyle = '#e8d2b2'; ctx.fillRect(0, 0, BG_W, 690);
    ctx.fillStyle = '#7b5137'; ctx.fillRect(0, 0, BG_W, 70);
    ctx.fillStyle = '#c7e5f2'; ctx.fillRect(36, 170, 210, 290);
    ctx.strokeStyle = '#7b5137'; ctx.lineWidth = 10; ctx.strokeRect(36, 170, 210, 290); ctx.beginPath(); ctx.moveTo(141, 170); ctx.lineTo(141, 460); ctx.stroke();
    ctx.fillStyle = '#8d6242'; for (const y of [200, 320, 440]) ctx.fillRect(310, y, 216, 11);
    const cups = ['#e8878f', '#7cb0d9', '#f4d06f', '#8ec58f', '#fff'];
    for (const [i, y] of [[0, 200], [1, 320], [2, 440]]) for (let k = 0; k < 5; k++) { ctx.fillStyle = cups[(i + k) % 5]; ctx.fillRect(322 + k * 40, y - 42 + (k % 2) * 8, 28, 42 - (k % 2) * 8); }
    for (const x of [120, 400]) {
      ctx.strokeStyle = '#4a3324'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x, 132); ctx.stroke();
      ctx.fillStyle = '#ffb94d'; ctx.beginPath(); ctx.arc(x, 150, 24, Math.PI, 0); ctx.fill();
      const h = ctx.createRadialGradient(x, 152, 4, x, 152, 150); h.addColorStop(0, 'rgba(255,225,150,.6)'); h.addColorStop(1, 'rgba(255,225,150,0)');
      ctx.fillStyle = h; ctx.fillRect(x - 150, 2, 300, 300);
    }
    ctx.fillStyle = '#a97c58'; ctx.fillRect(0, 690, BG_W, BG_H - 690);
    ctx.strokeStyle = 'rgba(90,60,40,.28)'; ctx.lineWidth = 3;
    for (let x = 0; x < BG_W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 690); ctx.lineTo(x, BG_H); ctx.stroke(); }
    ctx.fillStyle = '#7b5137'; for (const x of [52, 488]) { ctx.beginPath(); ctx.ellipse(x, 640, 96, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 7, 640, 14, 110); }
    ctx.fillStyle = '#fff'; ctx.fillRect(32, 610, 34, 30); ctx.fillRect(470, 610, 34, 30);
  },
  // 대회: 관중석과 현수막
  venue(ctx, season, r) {
    paintSky(ctx, 330, ...SKY[season], r);
    ctx.fillStyle = '#3b4656'; ctx.fillRect(0, 210, BG_W, 290);
    for (let y = 226; y < 480; y += 15) for (let x = 6 + (y % 2) * 6; x < BG_W; x += 13) {
      ctx.fillStyle = ['#ff6f9c', '#ffd24d', '#7cc8f2', '#fff', '#8ed18e', '#e8878f', '#2c3442'][Math.floor(r() * 7)];
      ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#d9d9d9'; for (const x of [40, 270, 500]) ctx.fillRect(x - 2, 96, 4, 118);
    for (const [x, c] of [[42, '#ff6f9c'], [272, '#ffd24d'], [502, '#3f78b5']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, 96); ctx.lineTo(x + 46, 114); ctx.lineTo(x, 132); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#1f4e8c'; ctx.fillRect(0, 486, BG_W, 58);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; for (let x = 18; x < BG_W; x += 132) ctx.fillRect(x, 506, 96, 18);
    paintCourt(ctx, 544, '#3f8f73', '#2f65ad');
    paintNet(ctx, 604, 70);
  },
  // 야근: 밤 사무실
  office(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 560); g.addColorStop(0, '#141b33'); g.addColorStop(1, '#2d3a63');
    ctx.fillStyle = g; ctx.fillRect(0, 0, BG_W, 720);
    const r = seeded(77);
    for (let i = 0; i < 9; i++) {
      const x = i * 64 - 10, h = 170 + r() * 240, top = 560 - h;
      ctx.fillStyle = '#1a2340'; ctx.fillRect(x, top, 56, h);
      for (let wy = top + 12; wy < 545; wy += 22) for (let wx = x + 7; wx < x + 48; wx += 15) if (r() < 0.45) { ctx.fillStyle = '#f7d774'; ctx.fillRect(wx, wy, 8, 12); }
    }
    ctx.fillStyle = '#39415c'; for (let x = 0; x <= BG_W; x += 180) ctx.fillRect(x - 5, 0, 10, 560);
    ctx.fillStyle = '#e8ecf4'; ctx.fillRect(0, 26, BG_W, 12);
    ctx.fillStyle = '#6b7388'; ctx.fillRect(0, 560, BG_W, BG_H - 560);
    ctx.fillStyle = '#8a92a6'; ctx.fillRect(0, 640, BG_W, 26);
    ctx.fillStyle = '#20263a'; ctx.fillRect(28, 520, 136, 92); ctx.fillRect(84, 612, 26, 30);
    ctx.fillStyle = '#8fd0ff'; ctx.fillRect(36, 528, 120, 76);
    ctx.fillStyle = '#20263a'; ctx.fillRect(384, 520, 136, 92); ctx.fillRect(440, 612, 26, 30);
    ctx.fillStyle = '#8fd0ff'; ctx.fillRect(392, 528, 120, 76);
    ctx.fillStyle = '#fff'; for (let k = 0; k < 6; k++) ctx.fillRect(196 - (k % 2) * 3, 626 - k * 6, 62, 5);
  },
};
const bgCache = new Map();
export function sceneURL(kind, quarter = '봄') {
  const path = manifest.bg?.[kind];
  if (path) return path;
  const season = SEASON_KEY[quarter] || 'spring', key = kind + ':' + season;
  if (!bgCache.has(key)) {
    const c = document.createElement('canvas'); c.width = BG_W; c.height = BG_H;
    (SCENES[kind] || SCENES.home)(c.getContext('2d'), season, seeded(kind.length * 131 + 7));
    bgCache.set(key, c.toDataURL('image/jpeg', 0.86));
  }
  return bgCache.get(key);
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
