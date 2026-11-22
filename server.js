const D = require('./lib/db'); // sets TZ=Asia/Kolkata and loads .env first
const express = require('express');
const fs = require('fs'), path = require('path');
const cron = require('node-cron');
const { ensureAssets } = require('./lib/assets');
const { seedIfEmpty } = require('./lib/seed');
const X = require('./lib/engine');
const V = require('./lib/views');
const { E, db, setSet, logEvent, addMsg, parentName } = D;

const PORT = E.PORT || 3000;
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '25mb' }));
app.use('/media', express.static('public/media'));
app.use('/samples', express.static('public/samples'));
app.use('/reminders', express.static('public/reminders'));
app.use('/audio', express.static('public/audio'));
const fail = (e) => { console.error(e); logEvent('error', e.message); };
const xml = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------- WhatsApp webhook ----------
app.post('/whatsapp', (req, res) => {
  const b = req.body, n = Number(b.NumMedia || 0), body = (b.Body || '').trim();
  const media = n ? { url: b.MediaUrl0, mime: b.MediaContentType0 } : null;
  const isDoc = media && /^(image\/|application\/pdf)/.test(media.mime);
  // Instant "I'm reading it now" via TwiML in live mode (counts as 1 message); dry mode returns empty TwiML.
  if (isDoc && X.LIVE() && X.used() < X.MAX_MSGS) {
    const ack = X.T.reading(X.langFor(body));
    setSet('msgs_sent', X.used() + 1);
    addMsg({ dir: 'out', mode: 'live', body: ack });
    res.type('text/xml').send(`<Response><Message>${xml(ack)}</Message></Response>`);
    X.handleInbound({ body, media, ctx: {}, ackViaTwiml: true }).catch(fail);
    return;
  }
  res.type('text/xml').send('<Response/>');
  X.handleInbound({ body, media, ctx: {} }).catch(fail);
});

// ---------- Cron ----------
cron.schedule('* * * * *', () => X.tick().catch(fail)); // auto-sends only when SEND_MODE=live
app.get('/cron/tick', async (req, res) => {
  if (!E.CRON_SECRET || req.query.secret !== E.CRON_SECRET) return res.status(403).send('forbidden');
  await X.tick().catch(fail);
  res.send('ok');
});

// ---------- Demo (split screen, dry: never touches Twilio) ----------
const SIM = { sim: true };
app.get('/', (req, res) => res.redirect('/demo'));
app.get('/demo', (req, res) => res.send(V.demo()));
app.get('/demo/chat', (req, res) => {
  const after = Number(req.query.after || 0);
  res.json({ messages: db.prepare('SELECT * FROM messages WHERE id>? ORDER BY id LIMIT 50').all(after), typing: X.state.busy > 0 });
});
app.post('/demo/send', (req, res) => {
  const { text = '', media } = req.body;
  X.handleInbound({ body: String(text).trim(), media: media ? { mime: media.mime, buf: Buffer.from(media.b64, 'base64') } : null, ctx: SIM }).catch(fail);
  res.json({ ok: true });
});
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };
app.post('/demo/file', (req, res) => { // sends a file from public/samples as if the parent sent it
  const name = path.basename(String(req.body.file || '')), f = path.join('public/samples', name), mime = MIME[path.extname(name).toLowerCase()];
  if (!mime || !fs.existsSync(f)) return res.status(400).json({ ok: false });
  X.handleInbound({ body: '', media: { mime, buf: fs.readFileSync(f) }, ctx: SIM }).catch(fail);
  res.json({ ok: true });
});
app.post('/demo/approve-all', (req, res) => { for (const m of db.prepare("SELECT id FROM medicines WHERE status='pending_review'").all()) X.approve(m.id); res.json({ ok: true }); });
app.post('/demo/remind', async (req, res) => { await X.simulateSlot(req.body.slot || X.nextSlot(), SIM).catch(fail); res.json({ ok: true }); });
app.post('/demo/advance', async (req, res) => { await X.advance30(SIM).catch(fail); res.json({ ok: true }); });

// ---------- Child app ----------
const embed = (req) => req.query.embed === '1';
const back = (req, res, fallback = '/app') => res.redirect(req.body?.back || (req.get('referer') || fallback));
app.get('/app', (req, res) => res.send(V.home(embed(req))));
app.get('/app/medicines', (req, res) => res.send(V.medicines(embed(req))));
app.get('/app/reports', (req, res) => res.send(V.reports(embed(req))));
app.get('/app/timeline', (req, res) => res.send(V.timeline(embed(req))));
app.get('/app/settings', (req, res) => res.send(V.settings(embed(req))));
app.post('/app/alerts/:id/dismiss', (req, res) => { db.prepare("UPDATE flags SET status='done' WHERE id=?").run(req.params.id); back(req, res); });
app.post('/app/medicines/:id/approve', (req, res) => { X.approve(Number(req.params.id)); back(req, res); });
app.post('/app/medicines/approve-all', (req, res) => { for (const m of db.prepare("SELECT id FROM medicines WHERE status='pending_review'").all()) X.approve(m.id); back(req, res); });
app.post('/app/medicines/:id/note', (req, res) => { db.prepare('UPDATE medicines SET place_note=? WHERE id=?').run(String(req.body.note || '').slice(0, 120), req.params.id); back(req, res); });
app.post('/app/medicines/:id/photo', (req, res) => {
  const { kind, b64 } = req.body;
  if (!['med', 'place'].includes(kind) || !b64) return res.status(400).end();
  const name = `${kind}-${Number(req.params.id)}-${Date.now()}.jpg`;
  fs.writeFileSync(path.join('public/media', name), Buffer.from(b64, 'base64'));
  db.prepare(`UPDATE medicines SET ${kind === 'med' ? 'photo_med' : 'photo_place'}=? WHERE id=?`).run(`/media/${name}`, req.params.id);
  logEvent('photo', `${kind === 'med' ? 'Medicine' : 'Storage place'} photo added`);
  res.json({ ok: true });
});
// Demo controls on Home (respect SEND_MODE: real sends only in live mode)
app.post('/app/remind-now', async (req, res) => { await X.simulateSlot(X.nextSlot()).catch(fail); back(req, res); });
app.post('/app/advance', async (req, res) => { await X.advance30().catch(fail); back(req, res); });
app.post('/app/reset', (req, res) => { seedIfEmpty(true); back(req, res); });

// ---------- Setup wizard ----------
app.get('/setup', (req, res) => res.send(V.setup()));
app.post('/setup', (req, res) => {
  const b = req.body;
  if (b.parent_name?.trim()) setSet('parent_name', b.parent_name.trim().slice(0, 40));
  if (b.child_name?.trim()) setSet('child_name', b.child_name.trim().slice(0, 40));
  if (['ml-IN', 'en-IN'].includes(b.language)) setSet('language', b.language);
  const digits = String(b.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (/^\d{10}$/.test(digits)) setSet('parent_whatsapp', `whatsapp:+91${digits}`);
  for (const k of ['t_breakfast', 't_lunch', 't_dinner']) if (/^\d\d:\d\d$/.test(b[k] || '')) setSet(k, b[k]);
  logEvent('setup', `Setup completed for ${parentName()}`);
  res.redirect('/app');
});

(async () => {
  await ensureAssets();
  if (seedIfEmpty()) console.log('Seeded sample data');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dost on http://localhost:${PORT}  mode=${X.LIVE() ? 'LIVE' : 'dry'}  model=${X.MODEL}  TZ=${process.env.TZ}`);
    console.log(`Demo: ${X.BASE()}/demo   Twilio webhook: ${X.BASE()}/whatsapp`);
  });
})().catch(e => { console.error(e); process.exit(1); });
