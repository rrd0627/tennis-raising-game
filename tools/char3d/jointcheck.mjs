// 관절 검사: node tools/char3d/jointcheck.mjs [샷 id …|all] [url]  (개발 서버 npm run serve가 떠 있어야 한다. 샷을 안 주면 모두)
// swing.html을 헤드리스 Chrome으로 열어 jointcheck.js를 돌리고, 범위 밖 관절·튐·뚫음·발 미끄러짐·임팩트 오차를 짧게 보여 준다
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const DIR = import.meta.dirname, ARGS = process.argv.slice(2), URL_ = ARGS.find(a => a.startsWith('http')) || 'http://localhost:8080/tools/char3d/swing.html?t=0', WANT = ARGS.filter(a => !a.startsWith('http') && a !== 'all');
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
  const shots = await ev('__dbg.SHOTS.map(s => s.id + ":" + s.name)');
  for (const sn of shots) {
  const [sid, sname] = sn.split(':');
  if (WANT.length && !WANT.includes(sid)) continue;
  await ev(`__dbg.setShot('${sid}'); 1`);
  console.log(`
■ ${sname} (${sid})`);
  const o = await ev(readFileSync(join(DIR, 'jointcheck.js'), 'utf8'));
  if (typeof o === 'string') throw new Error(o);
  const hit = await ev(`(() => { const { pose, sweetFrom, B, THREE, ORDER, BALLS, C0 } = __dbg; const V = (...a) => new THREE.Vector3(...a);
    return ORDER.map(k => { const r = pose(0, k); return k + ' ' + Math.round(sweetFrom(B('rightHand').getWorldPosition(V()), r.hq).distanceTo(C0.clone().add(V(...BALLS[k].d))) * 100) + 'cm'; }).join('  '); })()`);
  const nb = await ev('__dbg.ORDER.length');
  console.log(`프레임 ${o.frames}개(공 ${nb}가지 × 한 바퀴, 600Hz)`);
  console.log('임팩트 때 라켓 가운데와 공:', hit);
  const viol = Object.entries(o.viol).sort((a, b) => Math.abs(b[1].worst) - Math.abs(a[1].worst));
  console.log(`범위 밖 관절 ${viol.length}곳` + (viol.length ? ':' : ''));
  for (const [k, v] of viol) console.log(`  ${k} 한계 ${v.lim.join('~')}도, 가장 많이 ${v.worst > 0 ? '+' : ''}${v.worst.toFixed(1)}도 넘음 (${v.at[0]} 공, ${v.at[1]}초, ${v.n}프레임)`);
  const pk = Object.entries(o.peaksW).filter(([, v]) => v[0]).sort((a, b) => b[1][0] - a[1][0]).slice(0, 5);
  console.log('가장 빨리 도는 마디(도/초):', pk.map(([k, v]) => `${k} ${v[0]}`).join(', '));
  const jw = o.jumpsW.filter(e => e[3] > 1500), jp = o.jumpsP.filter(e => e[3] > 6);
  console.log(`갑자기 튀는 곳: 회전 ${jw.length}곳, 이동 ${jp.length}곳` + (jw.length + jp.length ? '' : ' (한 프레임에 빠르기가 1500도/초·6m/초 넘게 바뀌는 곳)'));
  for (const e of [...jw.sort((a, b) => b[3] - a[3]).slice(0, 5), ...jp.sort((a, b) => b[3] - a[3]).slice(0, 3)]) console.log('  ', JSON.stringify(e));
  // 팔이 갑자기 꺾이는 곳(임팩트 앞뒤 말고): 같은 곳은 공 종류를 묶어 보여 준다
  const byPlace = {}; for (const [m, ball, t0, t1, v] of o.arm.ev) { const k = m + '@' + (Math.round(t0 * 20) / 20).toFixed(2); const e = byPlace[k] || (byPlace[k] = { m, t0, t1, v: 0, balls: new Set() }); e.v = Math.max(e.v, v); e.balls.add(ball); e.t0 = Math.min(e.t0, t0); e.t1 = Math.max(e.t1, t1); }
  // 스윙 구간(임팩트 앞뒤로 휘두르는 동안: 서브·스매시는 -0.3~0.3초, 그 밖은 -0.25~0.3초)은 팔이 빠른 게 자연스러우니 따로 센다
  const sw0 = /서브|스매시/.test(sname) ? -0.3 : -0.25, inSwing = e => e.t0 >= sw0 && e.t1 <= 0.3;
  const evs = Object.values(byPlace).filter(e => !inSwing(e)).sort((a, b) => b.v - a.v), nSwing = Object.values(byPlace).filter(inSwing).length;
  console.log(`팔이 갑자기 꺾이는 곳: 스윙 밖 ${evs.length}곳, 스윙 안 ${nSwing}곳` + (evs.length ? ' (팔꿈치가 축 둘레로 600, 위팔 800, 아래팔 1500, 굽힘 1000도/초 넘음):' : ''));
  for (const e of evs.slice(0, 12)) console.log(`   ${e.m} ${e.v}도/초  ${e.t0}~${e.t1}초  공 ${[...e.balls].join(',')}`);
  console.log('팔 빠르기 최고:', Object.entries(o.arm.peak).map(([k, v]) => `${k} ${v[0]}(${v[1]} ${v[2]})`).join(', '));
  const pen = Object.entries(o.pen);
  console.log(`몸을 뚫는 곳 ${pen.length}곳` + (pen.length ? ': ' + pen.map(([k, v]) => `${k} ${Math.round(v.worst * 100)}cm(${v.at.join(' ')})`).join(', ') : ''));
  console.log('디딘 발 미끄러짐(한 바퀴 평균, 15cm/초 넘는 것):', Object.entries(o.slide).filter(([k]) => !k.endsWith('_under')).map(([k, v]) => `${k} ${(v.sub / nb * 100).toFixed(1)}cm`).join(', '));
  }
  if (errs.length) console.log('페이지 오류:', errs.join('\n'));
} finally { try { ws?.close(); } catch { } ch.kill(); await sleep(300); try { rmSync(prof, { recursive: true, force: true }); } catch { } }
process.exit(0);
