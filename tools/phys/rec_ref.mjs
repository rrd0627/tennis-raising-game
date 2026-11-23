// 경기 영상: 확인 링크 '승부처' 경기를 가상 시계로 1/30초씩 넘기며 찍어 mp4로.
// node rec_match.mjs BASE out.mp4 seconds [view: tv|tps] [dpr]
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const DIR = import.meta.dirname, BASE = process.argv[2] || 'http://localhost:8080/', OUTF = join(DIR, process.argv[3] || 'match.mp4');
const SECS = +(process.argv[4] || 90), R0 = +(process.argv[5] || -1), R1 = +(process.argv[6] || -1), DPR = +(process.argv[7] || 1), FPS = 30, VIEW = 'tv';
const FR = join(DIR, 'recm_' + VIEW); rmSync(FR, { recursive: true, force: true }); mkdirSync(FR, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--disable-extensions', '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(DIR, 'prof' + port)}`,
  '--no-first-run', '--no-default-browser-check', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map(), errs = [];
const send = (m, p = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
// 가상 시계: freeze() 뒤로는 performance.now·Date.now·requestAnimationFrame·setTimeout·setInterval이 step(ms)으로만 간다
const SEED = +(process.env.SEED || 12345);
const SHIM = `(() => {
  { let a = ${SEED}; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const N = { now: performance.now.bind(performance), dnow: Date.now, raf: requestAnimationFrame.bind(window), caf: cancelAnimationFrame.bind(window), st: setTimeout.bind(window), ct: clearTimeout.bind(window), si: setInterval.bind(window), ci: clearInterval.bind(window) };
  let virt = false, vt = 0, base = 0, dbase = 0, seq = 1e6; const rafs = new Map(), timers = new Map();
  performance.now = () => virt ? base + vt : N.now();
  Date.now = () => virt ? Math.round(dbase + vt) : N.dnow();
  const pend = new Map(); window.requestAnimationFrame = cb => { if (!virt) { const i = N.raf(ts => { pend.delete(i); cb(ts); }); pend.set(i, cb); return i; } const i = seq++; rafs.set(i, cb); return i; };
  window.cancelAnimationFrame = i => { if (rafs.has(i)) rafs.delete(i); else N.caf(i); };
  window.setTimeout = (cb, ms = 0, ...a) => { if (!virt) return N.st(cb, ms, ...a); const i = seq++; timers.set(i, { at: vt + Math.max(0, +ms || 0), cb, a }); return i; };
  window.clearTimeout = i => { if (timers.has(i)) timers.delete(i); else N.ct(i); };
  window.setInterval = (cb, ms = 0, ...a) => { if (!virt) return N.si(cb, ms, ...a); const i = seq++; timers.set(i, { at: vt + Math.max(1, +ms || 0), cb, a, iv: Math.max(1, +ms || 0) }); return i; };
  window.clearInterval = i => { if (timers.has(i)) timers.delete(i); else N.ci(i); };
  window.__vt = {
    t() { return vt; },
    freeze() { base = N.now(); dbase = N.dnow(); vt = 0; virt = true; for (const [i, cb] of pend) { N.caf(i); rafs.set(i, cb); } pend.clear(); },
    step(ms) {
      const end = vt + ms;
      for (let n = 0; n < 500; n++) {
        let b = null; for (const [i, t] of timers) if (t.at <= end && (!b || t.at < b[1].at)) b = [i, t];
        if (!b) break; vt = Math.max(vt, b[1].at); timers.delete(b[0]);
        if (b[1].iv) timers.set(b[0], { ...b[1], at: b[1].at + b[1].iv });
        try { if (typeof b[1].cb === 'function') b[1].cb(...b[1].a); } catch (e) { console.error(e); }
      }
      vt = end; const cbs = [...rafs.values()]; rafs.clear();
      for (const cb of cbs) try { cb(base + vt); } catch (e) { console.error(e); }
    },
  };
})();`;
try {
  let u; for (let i = 0; i < 50 && !u; i++) { try { u = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { } await sleep(200); }
  ws = new WebSocket(u); await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('CON ' + JSON.stringify(d.params.args.map(a => a.description || a.value)).slice(0, 300)); else if (d.method === 'Runtime.exceptionThrown') errs.push('EXC ' + d.params.exceptionDetails?.exception?.description?.slice(0, 300)); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
  if (process.env.PCFG) await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__PHYSCFG = ' + process.env.PCFG + ';' });
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 860, deviceScaleFactor: DPR, mobile: true });
  await send('Page.navigate', { url: BASE + '?check' }); await sleep(1500);
  for (let i = 0; i < 100 && !(await ev("!![...document.querySelectorAll('[data-a]')].find(e => /승부처: 5 대 5/.test(e.textContent))")); i++) await sleep(300);
  console.log('ver', await ev("fetch('version.txt?'+Math.random()).then(r=>r.text())"));
  await ev(`(async () => { const im = JSON.parse(document.querySelector('script[type=importmap]')?.textContent || '{}');
    const url = Object.values(im.imports || {}).find(u => /match3d/.test(u)) || './js/match3d.js'; const mod = await import(url); const P = mod.MatchView.prototype;
    const sp = P.setPlayers; P.setPlayers = async function (pl) { const r = await sp.call(this, pl); window.__view = this; return r; };
  })()`);
  await ev(`(async () => { const b = [...document.querySelectorAll('[data-a]')].find(e => /승부처: 5 대 5/.test(e.textContent)); b.click(); for (let i = 0; i < 50 && !document.querySelector('[data-a=match]'); i++) await new Promise(r => setTimeout(r, 200)); document.querySelector('[data-a=match]').click(); await new Promise(r => setTimeout(r, 400)); document.querySelector('[data-a=spd][data-v="1"]')?.click(); })()`);
  let ok3 = false; for (let i = 0; i < 600; i++) { if ((await ev('window.__view ? String(__view.show3d) : ""')) === 'true') { ok3 = true; break; } await sleep(200); }
  console.log('3D', ok3);
  for (let i = 0; i < 300 && (await ev('window.__view.p3d.physState')) !== 'ready'; i++) await sleep(200);
  console.log('phys', await ev('window.__view.p3d.physState'));
  await ev('__vt.freeze()');
  await ev(`(async () => {
    const im = JSON.parse(document.querySelector('script[type=importmap]')?.textContent || '{}');
    const url = Object.values(im.imports || {}).find(u => /players3d/.test(u)); const mod = await import(url); const PP = mod.Players3D.prototype, uo = PP.updateOne;
    __view.renderer.render = () => {};
    const p3 = __view.p3d, names = p3.pspec.bones.filter(b => b.parent).map(b => b.n);
    const M = new (p3.list[0].rig.racket.matrix.constructor)(), P = new (p3.list[0].rig.racket.position.constructor)(), Q = new (p3.list[0].rig.racket.quaternion.constructor)(), S = P.clone();
    window.__ref = []; window.__st = { n: 0 }; window.__names = names;
    const r5 = x => Math.round(x * 1e5) / 1e5;
    PP.updateOne = function (i, pdt, dt) {
      uo.call(this, i, pdt, dt);
      const c = this.list[i], R = c.rig; __st.n++;
      R.B('hips').matrixWorld.decompose(P, Q, S);
      const j = []; for (const n of names) { const q = R.B(n).quaternion; j.push(r5(q.w), r5(q.x), r5(q.y), r5(q.z)); }
      __ref.push([i, r5(this.bt), __view.cutting ? 1 : 0, [r5(P.x), r5(P.y), r5(P.z)], [r5(Q.w), r5(Q.x), r5(Q.y), r5(Q.z)], j, c.sw ? c.sw.id : null, c.sw ? r5(c.sw.tImpact) : null]);
    };
    return 'hooked'; })()`);
  let n = 0;
  for (let k = 0; k < SECS * FPS; k += 30) {
    await ev('(() => { for (let i = 0; i < 30; i++) __vt.step(1000 / 30); return 1; })()');
    const t = k / FPS;
    if (t >= R0 && t < R1) { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); writeFileSync(join(FR, String(n++).padStart(5, '0') + '.jpg'), Buffer.from(r.result.data, 'base64')); }
    if (k % 1800 === 0) console.log('t', t, 'n', await ev('__st.n'), await ev(`JSON.stringify({ s3: __view.show3d, on: __view.p3d?.physOn, st: __view.p3d?.physState, alive: __view.alive, bt: __view.p3d?.bt, txt: (document.querySelector('.screen')?.className || '') + '/' + (document.body.innerText || '').slice(0, 80).replace(/\s+/g, ' ') })`));
  }
  console.log('ERRS', errs.slice(0, 5).join(' || '));
  writeFileSync(OUTF, JSON.stringify({ seed: SEED, names: await ev('__names'), spec: await ev('__view.p3d.pspec'), frames: await ev('__ref') }));
  console.log('saved', OUTF, await ev('__ref.length'));
  if (n) {
    const ff = execFileSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
    execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(FR, '%05d.jpg'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', OUTF]);
    console.log('video', OUTF, n, 'frames');
  }
} finally { try { ch.kill(); } catch { } }
process.exit(0);
