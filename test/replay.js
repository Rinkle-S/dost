// Replays real /demo transcripts against a throwaway DB (dry mode, calls Claude). Run: npm test
const path = require('path'), fs = require('fs'), os = require('os');
process.chdir(path.join(__dirname, '..'));
process.env.DB_PATH = path.join(os.tmpdir(), `dost-test-${Date.now()}.db`);
process.env.SEND_MODE = 'dry';
const { db } = require('../lib/db');
const { seedIfEmpty } = require('../lib/seed');
const X = require('../lib/engine');

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
const outSince = (id) => db.prepare("SELECT * FROM messages WHERE dir='out' AND id>? ORDER BY id").all(id);
const lastId = () => db.prepare('SELECT COALESCE(MAX(id),0) m FROM messages').get().m;
async function say(text) { const before = lastId(); await X.handleInbound({ body: text, ctx: { sim: true } }); const o = outSince(before); console.log(`  Amma: ${text}\n  Dost: ${o.map(m => (m.media_url ? '[image] ' : '') + m.body.replace(/\n/g, ' / ')).join(' | ')}`); return o; }

(async () => {
  seedIfEmpty(true);
  const medsBefore = db.prepare("SELECT COUNT(*) c FROM medicines WHERE status='pending_review'").get().c;
  const alertsBefore = db.prepare("SELECT COUNT(*) c FROM flags WHERE kind='alert'").get().c;

  console.log('\nTranscript 1: add a medicine by chat');
  const replies = [];
  for (const t of ['thyronorm 25mcg', 'add it to child dashboard tracking', 'i want reminders on it', 'for thyronorm 25mcg', 'yes took it']) replies.push(...await say(t));

  const thy = db.prepare("SELECT * FROM medicines WHERE name LIKE '%hyronorm%'").all();
  check('1. exactly one Thyronorm medicine, pending review', thy.length === 1 && thy[0].status === 'pending_review', JSON.stringify(thy.map(m => [m.name, m.status])));
  check('2. one new pending medicine in total', db.prepare("SELECT COUNT(*) c FROM medicines WHERE status='pending_review'").get().c === medsBefore + 1);
  const alerts = db.prepare("SELECT text FROM flags WHERE kind='alert' AND text LIKE '%hyronorm%'").all();
  check('3. exactly one dashboard alert about Thyronorm', alerts.length === 1 && db.prepare("SELECT COUNT(*) c FROM flags WHERE kind='alert'").get().c === alertsBefore + 1, JSON.stringify(alerts));
  const asks = replies.filter(m => /When does the doctor want|എപ്പോൾ കഴിക്കാനാണ്/.test(m.body)).length;
  const bodies = replies.map(m => m.body);
  check('4. timing question asked at most once, no repeated replies', asks <= 1 && new Set(bodies).size === bodies.length, `asks=${asks} replies=${JSON.stringify(bodies)}`);
  const rep = db.prepare("SELECT * FROM events WHERE type='reported_taken'").all();
  const thyDoses = thy[0] ? db.prepare('SELECT COUNT(*) c FROM doses WHERE medicine_id=?').get(thy[0].id).c : -1;
  check('5. "yes took it" logged as reported taken, no scheduled dose marked', rep.length === 1 && /not on approved list yet/.test(rep[0].summary) && thyDoses === 0, `events=${rep.length} doses=${thyDoses}`);

  console.log('\nTranscript 2: answering the timing question');
  await say('ecorise 10mg');
  const r2 = await say('1');
  const eco = db.prepare("SELECT * FROM medicines WHERE name LIKE '%corise%'").get();
  check('6. "1" answers the pending timing question (morning before food)', eco && JSON.parse(eco.slots).includes('breakfast') && eco.relation === 'before' && /Done|ശരി/.test(r2[0]?.body || ''), JSON.stringify(eco));

  console.log('\nTranscript 3: find a medicine');
  const f1 = await say('where is telma kept');
  check('7. "where is telma kept" -> one image with the place photo and caption', f1.length === 1 && f1[0].media_url === '/samples/place_steel_box_fridge.png' && /Steel box on top of the fridge/i.test(f1[0].body) && /small white oval tablet/i.test(f1[0].body), JSON.stringify(f1));
  const f2 = await say('which tablet is for BP');
  check('8. "which tablet is for BP" -> Telma 40', f2.length === 1 && /Telma 40/.test(f2[0].body), JSON.stringify(f2));
  db.prepare("UPDATE medicines SET place_note='', photo_place=NULL WHERE name='Ecosprin 75'").run();
  const f3 = await say('where is ecosprin');
  const task = db.prepare("SELECT * FROM flags WHERE kind='alert' AND text LIKE '%where Ecosprin 75 is kept%'").get();
  check('9. unknown place -> no guess, no image, dashboard task added', f3.length === 1 && !f3[0].media_url && /don't know/i.test(f3[0].body) && !!task, JSON.stringify(f3));

  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  db.close(); try { fs.unlinkSync(process.env.DB_PATH); } catch {}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
