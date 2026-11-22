// End-to-end voice test in a real Chromium browser (Edge/Chrome) with a fake microphone.
// Run: node test/e2e-voice.js   (uses dry mode + a throwaway DB; calls Sarvam + Claude)
const path = require('path'), os = require('os'), fs = require('fs');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..'), PORT = 3985, BASE = `http://localhost:${PORT}`;
const BROWSER = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const WAV = path.join(__dirname, 'fixtures-question.wav');
const SHOTS = path.join(os.tmpdir(), 'dost-e2e'); fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 60000, step = 500) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await wait(step); } return null; }

(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT, SEND_MODE: 'dry', DB_PATH: path.join(os.tmpdir(), `dost-e2e-${Date.now()}.db`) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', d => (log += d)); server.stderr.on('data', d => (log += d));
  await until(() => log.includes('Dost on'), 20000);
  await fetch(`${BASE}/app/reset`, { method: 'POST' });

  console.log('Browser:', BROWSER);
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: 'new', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}`, '--autoplay-policy=no-user-gesture-required', '--window-size=1400,1000'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); }); page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle2' });
  const count = (sel) => page.$$eval(sel, els => els.length);

  try {
    // 1. tap-to-start: red recording indicator
    await page.click('#mic');
    const rec = await until(() => page.$eval('#mic', b => b.textContent === '■' && getComputedStyle(b).backgroundColor === 'rgb(228, 87, 46)'), 5000);
    check('1. 🎤 tap starts recording with a red indicator', !!rec);
    await page.screenshot({ path: path.join(SHOTS, '1-recording.png') });
    await wait(3500); // record ~3.5 s from the fake mic
    await page.click('#mic'); // tap-to-stop -> sends
    const stopped = await until(() => page.$eval('#mic', b => b.textContent === '🎤'), 5000);
    check('2. 🎤 tap again stops recording', !!stopped);

    // 3. parent voice bubble with play button + transcript
    const inBubble = await until(() => page.evaluate(() => { const b = [...document.querySelectorAll('.b.out')].find(x => x.querySelector('audio')); const t = b?.querySelector('.vtr')?.textContent || ''; return b && t ? t : null; }), 60000);
    check('3. parent voice bubble shows play button + transcript', !!inBubble && /dolo|knee/i.test(inBubble), `transcript=${inBubble}`);

    // 4. bot replies with a voice note (Sarvam TTS)
    const botVoice = await until(() => page.evaluate(() => { const b = [...document.querySelectorAll('.b.in')].find(x => x.querySelector('audio')); return b ? { src: b.querySelector('audio').src, text: b.querySelector('.vtr')?.textContent || '' } : null; }), 60000);
    check('4. bot replies as a voice note', !!botVoice && /\/audio\/v-.*\.mp3$/.test(botVoice.src), JSON.stringify(botVoice));
    if (botVoice) {
      const st = await page.evaluate(async (src) => { const r = await fetch(src); return { ok: r.ok, type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength }; }, botVoice.src);
      check('5. bot voice note is a playable mp3', st.ok && /audio/.test(st.type) && st.size > 2000, JSON.stringify(st));
      const played = await page.evaluate(async () => { const b = [...document.querySelectorAll('.b.in')].find(x => x.querySelector('audio')); b.querySelector('.vplay').click(); await new Promise(r => setTimeout(r, 1200)); const a = b.querySelector('audio'); return { paused: a.paused, t: a.currentTime, btn: b.querySelector('.vplay').innerHTML.length }; });
      check('6. ▶ plays the voice note', !played.paused && played.t > 0, JSON.stringify(played));
      await page.evaluate(() => document.querySelectorAll('audio').forEach(a => a.pause()));
    }
    await page.screenshot({ path: path.join(SHOTS, '2-voice-reply.png'), clip: { x: 250, y: 80, width: 440, height: 360 } });

    // 7. 🔊 on a bot text bubble
    await page.type('#msg', 'where is ecosprin kept'); await page.keyboard.press('Enter');
    const hasSpeaker = await until(() => page.evaluate(() => { const btns = [...document.querySelectorAll('.b.in button[title="Play as speech"]')]; return btns.length || null; }), 30000);
    check('7. bot text bubbles have a 🔊 button', !!hasSpeaker, `count=${hasSpeaker}`);
    const spoke = await page.evaluate(async () => { const btn = [...document.querySelectorAll('.b.in button[title="Play as speech"]')].pop(); btn.click(); for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); const a = Object.values(typeof spoken !== 'undefined' ? spoken : {})[0]; if (a && !a.paused && a.currentTime > 0) return { ok: true, src: a.src }; if (btn.textContent === '🔇') return { ok: false, err: btn.title }; } return { ok: false, err: 'timeout', label: btn.textContent }; });
    check('8. 🔊 speaks the text (Sarvam TTS, cached)', spoke.ok, JSON.stringify(spoke));
    await page.evaluate(() => Object.values(typeof spoken !== 'undefined' ? spoken : {}).forEach(a => a.pause()));

    // 9. reminder = image + voice note, in the current language (switch to Malayalam)
    await page.click('[data-lang="ml-IN"]'); await wait(500);
    const before = await count('.b.in');
    await page.evaluate(() => act('/demo/remind', { slot: 'dinner' }));
    const rem = await until(() => page.evaluate((n) => { const bs = [...document.querySelectorAll('.b.in')].slice(n); const img = bs.find(b => b.querySelector('img')); const voice = bs.find(b => b.querySelector('audio')); return img && voice ? { caption: img.textContent.slice(0, 60), voice: voice.querySelector('audio').src } : null; }, before), 60000);
    check('9. reminder arrives as image + voice note, in Malayalam after the toggle', !!rem && /[\u0D00-\u0D7F]/.test(rem.caption), JSON.stringify(rem));
    await page.click('[data-lang="en-IN"]');
    await page.screenshot({ path: path.join(SHOTS, '3-reminder.png') });
    check('10. no JavaScript errors on /demo', !errors.length, errors.join(' | '));
  } catch (e) { check('unexpected error', false, e.stack); }

  await browser.close(); server.kill();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${SHOTS}`);
  if (failed) console.log('--- server log tail ---\n' + log.split('\n').slice(-15).join('\n'));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
