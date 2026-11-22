// Seeds Amma's sample history when the DB is empty. Never sends anything.
const { db, ist, today, addDays, mealTimes, logEvent } = require('./db');

function seedIfEmpty(force = false) {
  const empty = !db.prepare('SELECT 1 FROM medicines LIMIT 1').get() && !db.prepare('SELECT 1 FROM readings LIMIT 1').get();
  if (!empty && !force) return false;
  if (force) for (const t of ['documents', 'medicines', 'doses', 'appointments', 'readings', 'events', 'flags', 'messages']) db.prepare(`DELETE FROM ${t}`).run();

  const t0 = today(), now = ist(), mt = mealTimes();
  const meds = [
    { name: 'Telma 40', generic: 'Telmisartan', dose: '40 mg · 1 tablet', frequency: 'Once a day (1-0-0)', relation: 'after', slots: ['breakfast'], purpose: 'For blood pressure', photo: 'med-telma.png', note: 'White round tablet. Steel box on the fridge' },
    { name: 'Glycomet 500', generic: 'Metformin', dose: '500 mg · 1 tablet', frequency: 'Twice a day (1-0-1)', relation: 'after', slots: ['breakfast', 'dinner'], purpose: 'For blood sugar', photo: 'med-glycomet.png', note: 'Silver strip. Steel box on the fridge' },
    { name: 'Ecosprin 75', generic: 'Aspirin', dose: '75 mg · 1 tablet', frequency: 'Once a day (0-0-1)', relation: 'after', slots: ['dinner'], purpose: 'Keeps blood flowing smoothly', photo: 'med-ecosprin.png', note: 'Small pink tablet. Steel box on the fridge' },
  ];
  const insMed = db.prepare(`INSERT INTO medicines(name,generic,dose,frequency,relation,slots,sos,purpose,status,confidence,uncertain,photo_med,photo_place,place_note,created_at)
    VALUES(?,?,?,?,?,?,0,?,'active',0.97,'[]',?,?,?,?)`);
  const insDose = db.prepare('INSERT INTO doses(medicine_id,slot,scheduled_at,status,reminded_at,confirmed_at) VALUES(?,?,?,?,?,?)');
  const missed = new Set([`${addDays(t0, -2)}|dinner`, `${addDays(t0, -5)}|dinner`]); // 2 missed evening doses

  db.transaction(() => {
    for (const m of meds) {
      const id = insMed.run(m.name, m.generic, m.dose, m.frequency, m.relation, JSON.stringify(m.slots), m.purpose, `/media/${m.photo}`, '/media/place-fridge.png', m.note, addDays(t0, -30) + ' 10:00:00').lastInsertRowid;
      for (let d = -27; d <= 3; d++) {
        const day = addDays(t0, d);
        for (const s of m.slots) {
          const at = `${day} ${mt[s]}:00`;
          if (at > now) { insDose.run(id, s, at, 'pending', null, null); continue; }
          const isMissed = missed.has(`${day}|${s}`);
          const conf = `${day} ${mt[s].slice(0, 3)}${String(5 + ((d * 7 + s.length) % 20 + 20) % 20).padStart(2, '0')}:00`;
          insDose.run(id, s, at, isMissed ? 'missed' : 'taken', at, isMissed ? null : conf);
        }
      }
    }
    // 3 lab reports over 6 months
    const reports = [
      { date: addDays(t0, -180), v: { HbA1c: 6.9, 'Fasting Blood Sugar': 118, 'BP Systolic': 128, 'BP Diastolic': 82, 'LDL Cholesterol': 104 } },
      { date: addDays(t0, -90), v: { HbA1c: 7.4, 'Fasting Blood Sugar': 131, 'BP Systolic': 136, 'BP Diastolic': 86, 'LDL Cholesterol': 112 } },
      { date: addDays(t0, -12), v: { HbA1c: 7.9, 'Fasting Blood Sugar': 144, 'BP Systolic': 146, 'BP Diastolic': 90, 'LDL Cholesterol': 121 } },
    ];
    const refs = { HbA1c: ['%', 4.0, 5.6], 'Fasting Blood Sugar': ['mg/dL', 70, 99], 'BP Systolic': ['mmHg', 90, 120], 'BP Diastolic': ['mmHg', 60, 80], 'LDL Cholesterol': ['mg/dL', 0, 100] };
    const insDoc = db.prepare("INSERT INTO documents(type,file_path,extracted_json,confidence,created_at) VALUES('lab_report',NULL,?,0.95,?)");
    const insR = db.prepare('INSERT INTO readings(type,value,unit,ref_low,ref_high,date,document_id) VALUES(?,?,?,?,?,?,?)');
    for (const r of reports) {
      const doc = insDoc.run(JSON.stringify({ lab: 'Kochi Diagnostic Centre', date: r.date }), r.date + ' 11:00:00').lastInsertRowid;
      for (const [k, v] of Object.entries(r.v)) insR.run(k, v, refs[k][0], refs[k][1], refs[k][2], r.date, doc);
    }
    db.prepare('INSERT INTO appointments(doctor,reason,date) VALUES(?,?,?)').run('Dr. Suresh Nair', 'Review with latest reports', addDays(t0, 4));
    const insF = db.prepare("INSERT INTO flags(kind,text,severity,created_at) VALUES('flag',?,'discuss_with_doctor',?)");
    insF.run('HbA1c went 6.9 → 7.4 → 7.9 % over 6 months. The report\'s range is 4.0–5.6 %. Worth asking the doctor about.', now);
    insF.run('BP (top number) went 128 → 136 → 146 mmHg. The report\'s range is 90–120. Worth asking the doctor about.', now);
    insF.run('2 evening doses were missed this week. Worth mentioning at the next visit.', now);
    logEvent('seed', 'Loaded sample history for the demo');
  })();
  return true;
}

module.exports = { seedIfEmpty };
