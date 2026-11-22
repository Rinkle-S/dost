// Seeds the demo data from public/samples/seed.json when the DB is empty. Never sends anything.
const fs = require('fs');
const { db, ist, today, addDays, setSet, logEvent } = require('./db');

const MON = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
const parseDate = (s) => { const m = String(s).match(/(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})/); return m ? `${m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}` : String(s).slice(0, 10); };
const FREQ = { '1-0-0': 'Once a day, morning (1-0-0)', '0-0-1': 'Once a day, night (0-0-1)', '1-0-1': 'Twice a day (1-0-1)', '1-1-1': 'Three times a day (1-1-1)', SOS: 'Only when needed (SOS)' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

function seedIfEmpty(force = false) {
  const empty = !db.prepare('SELECT 1 FROM medicines LIMIT 1').get() && !db.prepare('SELECT 1 FROM readings LIMIT 1').get();
  if (!empty && !force) return false;
  const S = JSON.parse(fs.readFileSync('public/samples/seed.json', 'utf8'));
  for (const t of ['documents', 'medicines', 'doses', 'appointments', 'readings', 'events', 'flags', 'messages']) db.prepare(`DELETE FROM ${t}`).run();
  db.prepare("DELETE FROM settings WHERE key='pending_intent' OR key LIKE 'followup_%'").run(); // keep msgs_sent: it's the real Twilio budget
  // remove uploaded/generated media (keep seed placeholders)
  for (const [dir, keep] of [['public/media', /^(med|place)-[a-z]+.png$/], ['public/reminders', null], ['public/audio', null]])
    for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : [])) if (!keep || !keep.test(f)) fs.rmSync(require('path').join(dir, f), { force: true });

  const t0 = today(), now = ist(), mt = { bedtime: '22:00', ...S.meal_times };
  db.transaction(() => {
    setSet('parent_name', S.parent.name); setSet('child_name', S.family.name); setSet('language', 'en-IN'); // demo default is English (overrides seed.json); toggle in /demo header
    for (const k of ['breakfast', 'lunch', 'dinner']) if (S.meal_times[k]) setSet(`t_${k}`, S.meal_times[k]);

    const insMed = db.prepare(`INSERT INTO medicines(name,generic,dose,frequency,relation,slots,sos,purpose,end_date,status,confidence,uncertain,photo_med,photo_place,place_note,looks_like,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insDose = db.prepare('INSERT INTO doses(medicine_id,slot,scheduled_at,status,reminded_at,confirmed_at) VALUES(?,?,?,?,?,?)');
    // Dose history rule: breakfast always taken; dinner missed on day -5 and day -2; today breakfast taken 08:12, dinner pending.
    const missedDays = new Set([addDays(t0, -5), addDays(t0, -2)]);
    for (const m of S.medicines) {
      const sos = m.slots.includes('sos') ? 1 : 0, slots = m.slots.filter(s => s !== 'sos');
      const strength = (m.generic.match(/[\d.]+\s*mg/i) || [''])[0];
      const id = insMed.run(m.brand, m.generic.replace(/\s*[\d.]+\s*mg/i, ''), [strength, m.dose].filter(Boolean).join(' · '), FREQ[m.pattern] || m.pattern,
        /before/i.test(m.timing) ? 'before' : sos ? 'none' : 'after', JSON.stringify(slots), sos, `For ${m.purpose}`, m.end_date || null, m.status,
        m.status === 'pending_review' ? 0.6 : 0.97, JSON.stringify(m.please_check || []), m.photo && `/samples/${m.photo}`, m.place_photo && `/samples/${m.place_photo}`, m.place_note || '', m.looks_like || '', addDays(t0, -30) + ' 10:00:00').lastInsertRowid;
      if (m.status !== 'active' || sos) continue;
      for (let d = -27; d <= 3; d++) {
        const day = addDays(t0, d);
        if (m.end_date && day > m.end_date) break;
        for (const s of slots) {
          const at = `${day} ${mt[s]}:00`;
          if (d === 0 && s === 'breakfast') { insDose.run(id, s, at, 'taken', at, `${day} 08:12:00`); continue; }
          if (at > now || d > 0) { insDose.run(id, s, at, 'pending', null, null); continue; }
          const missed = s === 'dinner' && missedDays.has(day);
          const conf = addMinutesStr(at, 5 + ((d + 30) * 7) % 15);
          insDose.run(id, s, at, missed ? 'missed' : 'taken', at, missed ? null : conf);
        }
      }
    }

    // Lab reports + readings
    const docByMonth = {};
    const insDoc = db.prepare("INSERT INTO documents(type,file_path,extracted_json,confidence,created_at) VALUES('lab_report',?,?,0.95,?)");
    for (const r of S.lab_reports) { const d = parseDate(r.date); docByMonth[d.slice(0, 7)] = { id: insDoc.run(`/samples/${r.file}`, JSON.stringify(r), d + ' 11:00:00').lastInsertRowid, date: d }; }
    const insR = db.prepare('INSERT INTO readings(type,value,unit,ref_low,ref_high,date,document_id) VALUES(?,?,?,?,?,?,?)');
    const flags = [];
    for (const r of S.readings) {
      for (const v of r.values) { const doc = docByMonth[v.date] || { date: v.date + '-15', id: null }; insR.run(r.test, v.value, r.unit, r.ref_low, r.ref_high, doc.date, doc.id); }
      // Flag only tests whose latest value is outside the printed range AND moving further away (never names a condition)
      const vals = r.values.map(v => v.value), last = vals[vals.length - 1], first = vals[0];
      const high = r.ref_high != null && last > r.ref_high && last > first, low = r.ref_low != null && last < r.ref_low && last < first;
      if (high || low) flags.push(`${r.test.replace(/\s*\(.*\)/, '')} went ${vals.join(' → ')} ${r.unit} over 6 months, ${high ? 'above' : 'below'} the report's range (${r.ref_low ?? '–'} to ${r.ref_high ?? '–'}). Worth asking the doctor about.`);
    }
    flags.push('2 evening doses were missed this week. Worth mentioning at the next visit.');
    const insF = db.prepare("INSERT INTO flags(kind,text,severity,created_at) VALUES('flag',?,'discuss_with_doctor',?)");
    for (const f of flags) insF.run(f, now);

    for (const a of S.appointments) db.prepare('INSERT INTO appointments(doctor,reason,date) VALUES(?,?,?)')
      .run(a.doctor, `${cap(a.reason)}${a.date.includes('T') ? ' at ' + a.date.slice(11, 16) : ''}${a.bring?.length ? '. Bring: ' + a.bring.join(', ') : ''}`, a.date.slice(0, 10));
    logEvent('seed', `Loaded sample data for ${S.parent.name}`);
  })();
  return true;
}
function addMinutesStr(s, n) { return ist(new Date(new Date(s.replace(' ', 'T') + '+05:30').getTime() + n * 60000)); }

module.exports = { seedIfEmpty };
