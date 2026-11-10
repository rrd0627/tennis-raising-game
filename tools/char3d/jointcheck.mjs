// 관절 검사: node tools/char3d/jointcheck.mjs [url]  (개발 서버 npm run serve가 떠 있어야 한다)
// swing.html을 헤드리스 Chrome으로 열어 jointcheck.js를 돌리고, 범위 밖 관절·튐·뚫음·발 미끄러짐·임팩트 오차를 짧게 보여 준다
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const DIR = import.meta.dirname, URL_ = process.argv[2] || 'http://localhost:8080/tools/char3d/swing.html?t=0';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const prof = mkdtempSync(join(tmpdir(), 'jointcheck-')), port = 9300 + Math.floor(Math.random() * 500);
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map(), errs = [];
const send = (m, p = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
try {
  let u; for (let i = 0; i < 50 && !u; i++) { try { u = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { } await sleep(200); }
  ws = new WebSocket(u); await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails?.exception?.description?.slice(0, 300)); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 150 && !(await ev('!!window.__ready')); i++) await sleep(200);
  await ev('window.__seq = null; window.__rec.start(); 1');
  const o = await ev(readFileSync(join(DIR, 'jointcheck.js'), 'utf8'));
  if (typeof o === 'string') throw new Error(o);
  const hit = await ev(`(() => { const { pose, sweetFrom, B, THREE, ORDER, BALLS, C0 } = __dbg; const V = (...a) => new THREE.Vector3(...a);
    return ORDER.map(k => { const r = pose(0, k); return k + ' ' + Math.round(sweetFrom(B('rightHand').getWorldPosition(V()), r.hq).distanceTo(C0.clone().add(V(...BALLS[k].d))) * 100) + 'cm'; }).join('  '); })()`);
  console.log(`프레임 ${o.frames}개(공 7가지 × 한 바퀴, 600Hz)`);
  console.log('임팩트 때 라켓 가운데와 공:', hit);
  const viol = Object.entries(o.viol).sort((a, b) => Math.abs(b[1].worst) - Math.abs(a[1].worst));
  console.log(`범위 밖 관절 ${viol.length}곳` + (viol.length ? ':' : ''));
  for (const [k, v] of viol) console.log(`  ${k} 한계 ${v.lim.join('~')}도, 가장 많이 ${v.worst > 0 ? '+' : ''}${v.worst.toFixed(1)}도 넘음 (${v.at[0]} 공, ${v.at[1]}초, ${v.n}프레임)`);
  const pk = Object.entries(o.peaksW).filter(([, v]) => v[0]).sort((a, b) => b[1][0] - a[1][0]).slice(0, 5);
  console.log('가장 빨리 도는 마디(도/초):', pk.map(([k, v]) => `${k} ${v[0]}`).join(', '));
  const jw = o.jumpsW.filter(e => e[3] > 1500), jp = o.jumpsP.filter(e => e[3] > 6);
  console.log(`갑자기 튀는 곳: 회전 ${jw.length}곳, 이동 ${jp.length}곳` + (jw.length + jp.length ? '' : ' (한 프레임에 빠르기가 1500도/초·6m/초 넘게 바뀌는 곳)'));
  for (const e of [...jw, ...jp].slice(0, 8)) console.log('  ', JSON.stringify(e));
  const pen = Object.entries(o.pen);
  console.log(`몸을 뚫는 곳 ${pen.length}곳` + (pen.length ? ': ' + pen.map(([k, v]) => `${k} ${Math.round(v.worst * 100)}cm(${v.at.join(' ')})`).join(', ') : ''));
  console.log('디딘 발 미끄러짐(한 바퀴 평균, 15cm/초 넘는 것):', Object.entries(o.slide).filter(([k]) => !k.endsWith('_under')).map(([k, v]) => `${k} ${(v.sub / 7 * 100).toFixed(1)}cm`).join(', '));
  if (errs.length) console.log('페이지 오류:', errs.join('\n'));
} finally { try { ws?.close(); } catch { } ch.kill(); await sleep(300); try { rmSync(prof, { recursive: true, force: true }); } catch { } }
process.exit(0);
