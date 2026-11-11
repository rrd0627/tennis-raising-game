// 모션캡처 재료(clips.json)를 스윙 화면 안에서 리그 몸 크기에 맞춰 키로 바꾸고 js/swings_mocap.js를 쓴다.
// 실행: npm run serve 를 띄운 채 node tools/char3d/mocap/run.mjs  (먼저 convert.py로 clips.json을 만든다)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const HERE = import.meta.dirname, ROOT = join(HERE, '..', '..', '..');
const URL_ = process.argv[2] || 'http://localhost:8080/tools/char3d/swing.html?ball=mid&t=0';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500), prof = mkdtempSync(join(tmpdir(), 'mocap-'));
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const SRC = { fh: '여자 선수 C(일반)', bh: '여자 선수 C(일반)', fv: '여자 선수 C(일반)', bv: '여자 선수 A(일반)', sv: '여자 선수 C(일반)', sm: '여자 선수 C(일반)' };
const ORDER = ['t', 'hip', 'chest', 'rf', 'lf', 'rheel', 'lheel', 'rh', 's', 'f', 'rp', 'rpc', 'lh', 'lp', 'lpc', 'lk', 'bevel'];
const val = v => typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? `[${v.map(x => +(+x).toFixed(3)).join(', ')}]` : String(v);
try {
  let u; for (let i = 0; i < 50 && !u; i++) { try { u = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { } await sleep(200); }
  ws = new WebSocket(u); await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
  await send('Runtime.enable'); await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 150 && !(await ev('!!window.__ready')); i++) await sleep(200);
  const body = readFileSync(join(HERE, 'build_keys.js'), 'utf8').split('\n').filter(l => !l.startsWith('//')).join('\n').trim().replace(/\)\(\)$/, ')();');
  const res = await ev(`window.__CLIPS = ${readFileSync(join(HERE, 'clips.json'), 'utf8')};\n(async () => { try { return await ${body} } catch (e) { return 'ERR ' + e.stack; } })()`);
  if (typeof res !== 'string' || res.startsWith('ERR')) throw new Error(String(res));
  const { log, out } = JSON.parse(res); console.log(log);
  const lines = [readFileSync(join(HERE, 'header.txt'), 'utf8').trimEnd(), 'export const MOCAP = {'];
  for (const sid of ['fh', 'bh', 'fv', 'bv', 'sv', 'sm']) {
    const x = out[sid];
    lines.push(`  ${sid}: { src: '${SRC[sid]}', bevel: ${x.bevel}, rollK: 0.01, chestPoles: true${sid === 'sv' || sid === 'sm' ? ', corMove: true' : ''}${x.lroll != null ? ', lroll: ' + x.lroll : ''}${x.toss != null ? ', toss: ' + x.toss : ''}, keys: [`);
    for (const k of x.keys) lines.push('    { ' + [...ORDER.filter(n => n in k), ...Object.keys(k).filter(n => !ORDER.includes(n))].map(n => `${n}: ${val(k[n])}`).join(', ') + ' },');
    lines.push('  ] },');
  }
  lines.push('};', '');
  writeFileSync(join(ROOT, 'js', 'swings_mocap.js'), lines.join('\n'));
  // 라켓이 몸을 뚫지 않게 하는 고침을 구해 같이 굽는다(게임에서 다시 구하지 않게)
  await send('Page.navigate', { url: URL_ + '&cb=' + Date.now() }); await sleep(500);
  for (let i = 0; i < 150 && !(await ev('!!window.__ready')); i++) await sleep(200);
  const cor = JSON.parse(await ev(`JSON.stringify(Object.fromEntries(['fh', 'bh', 'fv', 'bv', 'sv', 'sm'].map(id => { __dbg.setShot(id); const C = __dbg.R.S.COR; return [id, C ? { dt: 0.01, w: C.W.flatMap(v => v.toArray().map(x => +x.toFixed(4))), d: C.D.flatMap(v => v.toArray().map(x => +x.toFixed(4))) } : null]; })))`));
  let txt = readFileSync(join(ROOT, 'js', 'swings_mocap.js'), 'utf8');
  for (const [id, c] of Object.entries(cor)) if (c) txt = txt.replace(new RegExp(`^  ${id}: \\{ (.*?), keys: \\[`, 'm'), (m, a) => `  ${id}: { ${a}, cor: ${JSON.stringify(c)}, keys: [`);
  writeFileSync(join(ROOT, 'js', 'swings_mocap.js'), txt);
  console.log('wrote js/swings_mocap.js', Object.entries(cor).map(([k, v]) => k + (v ? ':cor' : '')).join(' '));
} finally { try { ws?.close(); } catch { } ch.kill(); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch { } }, 500); }
process.exit(0);
