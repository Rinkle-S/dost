// Sarvam AI speech-to-text and text-to-speech (Malayalam / English), with ffmpeg-static for conversion.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { E } = require('./db');

const enabled = () => !!(E.SARVAM_API_KEY || '').trim();
const run = (args) => new Promise((res, rej) => execFile(ffmpeg, args, { timeout: 30000 }, (e, _o, err) => (e ? rej(new Error('ffmpeg: ' + String(err).slice(-200))) : res())));
const tmp = (ext) => path.join(os.tmpdir(), `dost-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

async function toWav(buf) {
  const inp = tmp('in'), out = tmp('wav');
  fs.writeFileSync(inp, buf);
  try { await run(['-y', '-i', inp, '-ar', '16000', '-ac', '1', out]); return fs.readFileSync(out); }
  finally { for (const f of [inp, out]) fs.rm(f, () => {}); }
}

async function speechToText(buf) {
  const wav = await toWav(buf);
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'voice.wav');
  form.append('model', 'saaras:v4');
  form.append('language_code', 'unknown'); // auto-detect Malayalam / English
  const r = await fetch('https://api.sarvam.ai/speech-to-text', { method: 'POST', headers: { 'api-subscription-key': E.SARVAM_API_KEY }, body: form });
  if (!r.ok) throw new Error(`Sarvam STT ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.transcript || '').trim();
}

// Returns a public URL (/audio/<id>.mp3)
async function textToSpeech(text, lang, fileId) {
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}☀-➿️✅❌⏳]/gu, '').replace(/\n+/g, '. ').slice(0, 2400);
  const code = lang === 'ml' ? 'ml-IN' : 'en-IN';
  const call = (body) => fetch('https://api.sarvam.ai/text-to-speech', { method: 'POST', headers: { 'api-subscription-key': E.SARVAM_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let r = await call({ text: clean, language_code: code, model: 'bulbul:v3', output_audio_codec: 'mp3' });
  if (r.status === 400) r = await call({ text: clean, target_language_code: code, model: 'bulbul:v3' }); // older field name, WAV output
  if (!r.ok) throw new Error(`Sarvam TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const audio = Buffer.concat((await r.json()).audios.map(a => Buffer.from(a, 'base64')));
  fs.mkdirSync('public/audio', { recursive: true });
  const id = fileId || `v-${Date.now()}`, file = path.join('public/audio', `${id}.mp3`);
  if (audio.slice(0, 4).toString() === 'RIFF') { const w = tmp('wav'); fs.writeFileSync(w, audio); try { await run(['-y', '-i', w, '-codec:a', 'libmp3lame', '-b:a', '64k', file]); } finally { fs.rm(w, () => {}); } }
  else fs.writeFileSync(file, audio);
  return `/audio/${id}.mp3`;
}

module.exports = { enabled, speechToText, textToSpeech };
