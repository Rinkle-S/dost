process.env.TZ = 'Asia/Kolkata';
require('dotenv').config();
const Database = require('better-sqlite3');
const fs = require('fs');

const E = process.env;
for (const d of ['public/media', 'public/samples', 'public/reminders', 'uploads']) fs.mkdirSync(d, { recursive: true });

// ---- IST time helpers ----
const ist = (d = new Date()) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD HH:mm:ss
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (s) => { const m = String(s || '').match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? `${Number(m[3])} ${MON[m[2] - 1]} ${m[1]}` : String(s || ''); };
const fmtShort = (s) => { const m = String(s || '').match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? `${Number(m[3])} ${MON[m[2] - 1]}` : String(s || ''); };
const fmtMon = (s) => { const m = String(s || '').match(/^(\d{4})-(\d\d)/); return m ? MON[m[2] - 1] : ''; };
const hhmm = (s) => (String(s || '').match(/(\d\d:\d\d)/) || [])[1] || '';
const fmtDT = (s) => fmtDate(s) + (hhmm(s) ? ', ' + hhmm(s) : '');
const toDate = (s) => new Date(String(s).replace(' ', 'T') + (String(s).length <= 10 ? 'T12:00:00' : '') + '+05:30');
const addDays = (dateStr, n) => ist(new Date(new Date(dateStr.slice(0, 10) + 'T12:00:00+05:30').getTime() + n * 864e5)).slice(0, 10);
const addMinutes = (s, n) => ist(new Date(new Date(s.replace(' ', 'T') + '+05:30').getTime() + n * 60000));
const today = () => ist().slice(0, 10);

// ---- DB ----
const db = new Database(E.DB_PATH || 'dost-v2.db');
db.exec(`
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY, type TEXT, file_path TEXT, extracted_json TEXT, confidence REAL, created_at TEXT);
CREATE TABLE IF NOT EXISTS medicines(id INTEGER PRIMARY KEY, name TEXT, generic TEXT, dose TEXT, frequency TEXT, relation TEXT, slots TEXT, sos INTEGER DEFAULT 0, purpose TEXT, duration_days INTEGER, end_date TEXT, status TEXT DEFAULT 'pending_review', confidence REAL, uncertain TEXT, source_doc_id INTEGER, photo_med TEXT, photo_place TEXT, place_note TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS doses(id INTEGER PRIMARY KEY, medicine_id INTEGER, slot TEXT, scheduled_at TEXT, status TEXT DEFAULT 'pending', reminded_at TEXT, snooze_at TEXT, confirmed_at TEXT);
CREATE TABLE IF NOT EXISTS appointments(id INTEGER PRIMARY KEY, doctor TEXT, reason TEXT, date TEXT);
CREATE TABLE IF NOT EXISTS readings(id INTEGER PRIMARY KEY, type TEXT, value REAL, unit TEXT, ref_low REAL, ref_high REAL, date TEXT, document_id INTEGER);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, type TEXT, summary TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS flags(id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'flag', text TEXT, severity TEXT DEFAULT 'info', status TEXT DEFAULT 'open', created_at TEXT);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, dir TEXT, mode TEXT, kind TEXT DEFAULT 'text', body TEXT, media_url TEXT, chips TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`);
for (const c of ['looks_like TEXT', 'source TEXT', 'look TEXT']) try { db.exec(`ALTER TABLE medicines ADD COLUMN ${c}`); } catch {}
try { db.exec('ALTER TABLE flags ADD COLUMN media_url TEXT'); } catch {}

const getSet = (k, def) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? def;
const setSet = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
const parentName = () => getSet('parent_name', E.PARENT_NAME || 'Amma');
const childName = () => getSet('child_name', E.CHILD_NAME || 'your family');
const language = () => getSet('language', E.PARENT_LANGUAGE || 'ml-IN');
const parentNumber = () => getSet('parent_whatsapp', E.PARENT_WHATSAPP);
const MEALS = ['breakfast', 'lunch', 'dinner', 'bedtime'];
const mealTimes = () => ({
  breakfast: getSet('t_breakfast', '08:00'), lunch: getSet('t_lunch', '13:00'),
  dinner: getSet('t_dinner', '20:30'), bedtime: getSet('t_bedtime', '22:00'),
});

const logEvent = (type, summary) => db.prepare('INSERT INTO events(type,summary,created_at) VALUES(?,?,?)').run(type, String(summary).slice(0, 1000), ist());
const addAlert = (text, severity = 'discuss_with_doctor', mediaUrl = null) => { // "alert the family" = dashboard Alerts panel only
  db.prepare("INSERT INTO flags(kind,text,severity,created_at,media_url) VALUES('alert',?,?,?,?)").run(text, severity, ist(), mediaUrl);
  logEvent('alert', text);
};
const addMsg = ({ dir, mode, kind = 'text', body = '', media_url = null, chips = null }) =>
  db.prepare('INSERT INTO messages(dir,mode,kind,body,media_url,chips,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(dir, mode, kind, body, media_url, chips ? JSON.stringify(chips) : null, ist()).lastInsertRowid;

module.exports = { E, db, ist, fmtDate, fmtShort, fmtMon, fmtDT, hhmm, toDate, addDays, addMinutes, today, getSet, setSet, parentName, childName, language, parentNumber, MEALS, mealTimes, logEvent, addAlert, addMsg };
