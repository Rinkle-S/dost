const D = require('./db');
const { db, ist, today, addDays, fmtDate, fmtShort, fmtMon, fmtDT, hhmm, parentName, childName, language, parentNumber, MEALS, mealTimes, getSet } = D;
const X = require('./engine');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { cream: '#FBF7F0', ink: '#1E2A5A', gold: '#F2A541', ok: '#2E9E6B', bad: '#E4572E', warn: '#E8A33D' };

const head = (title) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Dost</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{cream:'${C.cream}',ink:'${C.ink}',gold:'${C.gold}',ok:'${C.ok}',bad:'${C.bad}',warn:'${C.warn}'},fontFamily:{sans:['Inter','system-ui','-apple-system','Segoe UI','Roboto','sans-serif']}}}}</script>
<style>body{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}.card{background:#fff;border-radius:16px;box-shadow:0 2px 10px rgba(30,42,90,.07)}.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.85rem;font-weight:600}details>summary{list-style:none;cursor:pointer}details>summary::-webkit-details-marker{display:none}</style></head>`;
const logo = (size = 'text-2xl') => `<span class="${size} font-extrabold text-ink tracking-tight">Dost<span class="inline-block w-2 h-2 rounded-full bg-gold ml-0.5 align-top mt-1"></span></span>`;
const pill = (kind, text) => {
  const s = { ok: `background:#E3F4EC;color:${C.ok}`, bad: `background:#FCE6E0;color:${C.bad}`, warn: `background:#FBF0DC;color:#9a6512`, info: 'background:#E8EAF3;color:#1E2A5A', muted: 'background:#EEE;color:#666' }[kind];
  return `<span class="pill" style="${s}">${esc(text)}</span>`;
};

// ---------- data helpers ----------
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', bedtime: 'Bedtime' };
const meds = () => db.prepare("SELECT * FROM medicines WHERE status!='stopped' ORDER BY id").all().map(m => ({ ...m, slotList: JSON.parse(m.slots || '[]'), unc: JSON.parse(m.uncertain || '[]') }));
const normKey = (s) => String(s || '').toLowerCase().replace(/\b(tab|tablet|cap|capsule|syp)\b\.?/g, '').replace(/[^a-z]/g, '');
function dupMap(list) {
  const out = {};
  for (const a of list) for (const b of list) {
    if (a.id === b.id) continue;
    const ga = normKey(a.generic), gb = normKey(b.generic), na = normKey(a.name.split(/\s/)[0]), nb = normKey(b.name.split(/\s/)[0]);
    if ((ga && (ga === gb || ga === nb)) || (na && (na === nb || na === gb))) out[a.id] = b.name;
  }
  return out;
}
const todayDoses = () => db.prepare("SELECT d.*, m.name FROM doses d JOIN medicines m ON m.id=d.medicine_id WHERE substr(d.scheduled_at,1,10)=? AND m.status='active' ORDER BY d.scheduled_at").all(today());
const openAlerts = () => db.prepare("SELECT * FROM flags WHERE kind='alert' AND status='open' ORDER BY id DESC LIMIT 10").all();

function alertsHtml() {
  const a = openAlerts();
  if (!a.length) return '';
  return `<div class="mb-4 space-y-2">${a.map(x => `<div class="rounded-2xl p-3 ${x.severity === 'urgent' ? 'text-white' : ''}" style="background:${x.severity === 'urgent' ? C.bad : x.severity === 'info' ? '#E8EAF3' : '#FBF0DC'}">
<div class="font-semibold leading-snug">${esc(x.text)}</div><div class="flex justify-between items-center mt-1 text-sm opacity-80"><span>${esc(fmtDT(x.created_at))}</span><form method="post" action="/app/alerts/${x.id}/dismiss"><button class="underline">Dismiss</button></form></div></div>`).join('')}</div>`;
}

// ---------- shell ----------
const TABS = [['home', 'Home', '/app'], ['medicines', 'Medicines', '/app/medicines'], ['reports', 'Reports', '/app/reports'], ['timeline', 'Timeline', '/app/timeline'], ['settings', 'Settings', '/app/settings']];
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  medicines: '<rect x="3" y="8" width="18" height="8" rx="4"/><line x1="12" y1="8" x2="12" y2="16"/>',
  reports: '<polyline points="3,17 9,11 13,15 21,7"/>',
  timeline: '<circle cx="12" cy="12" r="9"/><polyline points="12,7 12,12 15,14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
function shell(tab, inner, embed) {
  const pending = db.prepare("SELECT COUNT(*) c FROM medicines WHERE status='pending_review'").get().c;
  const missedToday = todayDoses().some(d => d.status === 'missed');
  const attention = openAlerts().some(a => a.severity === 'urgent') || missedToday || pending;
  return `${head(TABS.find(t => t[0] === tab)[1])}<body class="bg-cream text-ink text-[17px]">
<div class="max-w-md mx-auto min-h-screen pb-24">
<header class="flex items-center gap-3 px-4 pt-4 pb-3 sticky top-0 bg-cream/95 backdrop-blur z-10">
<div class="w-11 h-11 rounded-full bg-ink text-cream flex items-center justify-center text-xl font-bold">${esc(parentName()[0] || 'A')}</div>
<div class="flex-1"><div class="font-bold text-lg leading-tight">${esc(parentName())}</div><div class="text-sm opacity-60">Cared for by ${esc(childName())}</div></div>
${attention ? pill('warn', 'Needs attention') : pill('ok', 'On track')}</header>
<main id="live" class="px-4">${alertsHtml()}${inner}
<p class="text-xs opacity-50 mt-6 mb-2 text-center">Dost organises information and reminders. It does not give medical advice.</p></main>
<nav class="fixed bottom-0 inset-x-0 bg-white border-t border-black/5 z-20"><div class="max-w-md mx-auto grid grid-cols-5">${TABS.map(([k, label, href]) => `<a href="${href}${embed ? '?embed=1' : ''}" class="flex flex-col items-center py-2 text-xs ${k === tab ? 'text-ink font-bold' : 'text-ink/50'}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>${label}${k === 'medicines' && pending ? `<span class="absolute ml-8 -mt-1 w-2 h-2 rounded-full bg-gold"></span>` : ''}</a>`).join('')}</div></nav></div>
<script>
// live refresh: swap #live without losing open <details> or focus
setInterval(async()=>{const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return;
const open=[...document.querySelectorAll('details[open]')].map(d=>d.id);const h=await (await fetch(location.href)).text();
const n=new DOMParser().parseFromString(h,'text/html');const l=n.getElementById('live');if(!l)return;const y=scrollY;
document.getElementById('live').innerHTML=l.innerHTML;document.querySelector('header').innerHTML=n.querySelector('header').innerHTML;
open.forEach(id=>{const d=document.getElementById(id);if(d)d.open=true});scrollTo(0,y);if(window.afterSwap)afterSwap()},${embed ? 2000 : 5000});
function tog(g,v){document.querySelectorAll('[data-g="'+g+'"]').forEach(e=>e.classList.toggle('hidden',e.dataset.v!==v));document.querySelectorAll('[data-b="'+g+'"]').forEach(e=>{const on=e.dataset.v===v;e.classList.toggle('bg-ink',on);e.classList.toggle('text-cream',on)})}
</script></body></html>`;
}
const section = (title, inner, right = '') => `<section class="mb-6"><div class="flex justify-between items-end mb-2"><h2 class="text-xl font-bold">${title}</h2>${right}</div>${inner}</section>`;
const toggle = (g, opts, cur) => `<div class="inline-flex bg-white rounded-full p-1 text-sm card">${opts.map(([v, l]) => `<button type="button" data-b="${g}" data-v="${v}" onclick="tog('${g}','${v}')" class="px-3 py-1 rounded-full ${v === cur ? 'bg-ink text-cream' : ''}">${l}</button>`).join('')}</div>`;

// ---------- Home ----------
function ring(done, total) {
  const r = 52, c = 2 * Math.PI * r, f = total ? done / total : 0;
  return `<svg width="130" height="130" viewBox="0 0 130 130"><circle cx="65" cy="65" r="${r}" fill="none" stroke="#EDE6DA" stroke-width="14"/><circle cx="65" cy="65" r="${r}" fill="none" stroke="${C.ok}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 65 65)"/><text x="65" y="72" text-anchor="middle" font-size="28" font-weight="800" fill="${C.ink}">${done}/${total}</text></svg>`;
}
function bars(days) {
  const rows = days.map(d => { const r = db.prepare("SELECT SUM(d.status='taken') t, SUM(d.status='missed') m, COUNT(*) n FROM doses d JOIN medicines m ON m.id=d.medicine_id WHERE substr(d.scheduled_at,1,10)=? AND m.status='active'").get(d); return { d, t: r.t || 0, m: r.m || 0, n: r.n || 0 }; });
  const max = Math.max(1, ...rows.map(r => r.n));
  const resolved = rows.reduce((a, r) => a + r.t + r.m, 0), taken = rows.reduce((a, r) => a + r.t, 0);
  const pct = resolved ? Math.round(100 * taken / resolved) : 100;
  const w = days.length > 7 ? 'w-1.5' : 'w-6';
  return `<div class="flex items-baseline gap-2 mb-2"><span class="text-3xl font-extrabold">${pct}%</span><span class="opacity-60">doses taken</span></div>
<div class="flex items-end justify-between h-28 gap-1">${rows.map(r => `<div class="flex flex-col items-center flex-1"><div class="flex flex-col-reverse ${w} rounded-md overflow-hidden" style="height:${Math.round(96 * r.n / max)}px;background:#EDE6DA">
<div style="height:${r.n ? 100 * r.t / r.n : 0}%;background:${C.ok}"></div><div style="height:${r.n ? 100 * r.m / r.n : 0}%;background:${C.bad}"></div></div>${days.length <= 7 ? `<div class="text-xs mt-1 opacity-60">${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(r.d + 'T12:00:00+05:30').getDay()]}</div>` : ''}</div>`).join('')}</div>
<div class="flex gap-4 text-xs mt-2 opacity-70"><span><span class="inline-block w-2 h-2 rounded-full" style="background:${C.ok}"></span> Taken</span><span><span class="inline-block w-2 h-2 rounded-full" style="background:${C.bad}"></span> Missed</span></div>`;
}
function home(embed) {
  const td = todayDoses().filter(d => true), mt = mealTimes();
  const done = td.filter(d => d.status === 'taken').length;
  const bySlot = {}; for (const d of td) (bySlot[d.slot] ||= []).push(d);
  const slotRows = MEALS.filter(s => bySlot[s]).map(s => {
    const ds = bySlot[s];
    const st = ds.every(d => d.status === 'taken') ? pill('ok', 'Taken ✓') : ds.some(d => d.status === 'missed') ? pill('bad', 'Missed ✗') : ds.some(d => d.reminded_at) ? pill('warn', 'Waiting for reply') : pill('muted', 'Pending');
    const when = ds.find(d => d.confirmed_at)?.confirmed_at;
    return `<div class="flex items-center gap-3 py-3 border-b last:border-0 border-black/5"><div class="w-14 text-center"><div class="font-bold">${mt[s]}</div></div>
<div class="flex-1"><div class="font-semibold">${SLOT_LABEL[s]}</div><div class="text-sm opacity-60">${esc(ds.map(d => d.name).join(', '))}${when ? ` · at ${hhmm(when)}` : ''}</div></div>${st}</div>`;
  }).join('');
  const last7 = [...Array(7)].map((_, i) => addDays(today(), i - 6)), last30 = [...Array(30)].map((_, i) => addDays(today(), i - 29));
  const ongoing = db.prepare("SELECT name FROM medicines WHERE status='active' AND (end_date IS NULL OR end_date>=?)").all(today());
  const appt = db.prepare('SELECT * FROM appointments WHERE date>=? ORDER BY date LIMIT 1').get(today());
  const flags = db.prepare("SELECT * FROM flags WHERE kind='flag' AND status='open' ORDER BY id DESC").all();
  const pending = db.prepare("SELECT COUNT(*) c FROM medicines WHERE status='pending_review'").get().c;
  return shell('home', `
${pending ? `<a href="/app/medicines${embed ? '?embed=1' : ''}" class="block card p-4 mb-4 border-l-8" style="border-color:${C.gold}"><div class="font-bold">${pending} new medicine${pending > 1 ? 's' : ''} to review</div><div class="text-sm opacity-70">Nothing is reminded until you approve.</div></a>` : ''}
<section class="card p-4 mb-6"><div class="flex items-center gap-4"><div>${ring(done, td.length)}</div><div><div class="text-sm opacity-60">Today · ${fmtDate(today())}</div><div class="text-2xl font-extrabold">${done === td.length && td.length ? 'All done' : `${td.length - done} to go`}</div><div class="text-sm opacity-70">${td.filter(d => d.status === 'missed').length} missed</div></div></div>
<div class="mt-2">${slotRows || '<p class="opacity-60 py-2">No doses today.</p>'}</div></section>
${section('Doses taken', `<div class="card p-4"><div data-g="range" data-v="week">${bars(last7)}</div><div data-g="range" data-v="month" class="hidden">${bars(last30)}</div></div>`, toggle('range', [['week', 'Week'], ['month', 'Month']], 'week'))}
${section('Ongoing medicines', `<div class="flex flex-wrap gap-2">${ongoing.map(m => `<span class="pill bg-white card" style="font-size:1rem;padding:6px 14px">${esc(m.name)}</span>`).join('') || '<span class="opacity-60">None yet</span>'}</div>`)}
${appt ? section('Next doctor visit', `<div class="card p-4"><div class="font-bold">${esc(appt.doctor)}</div><div>${fmtDate(appt.date)} · ${esc(appt.reason)}</div><div class="text-sm opacity-60 mt-1">Dost will remind ${esc(parentName())} to bring the reports.</div></div>`) : ''}
${flags.length ? section('Worth asking the doctor', flags.map(f => `<div class="card p-4 mb-2 border-l-4" style="border-color:${C.warn}">${esc(f.text)}</div>`).join('')) : ''}
${section('Demo controls', `<div class="grid grid-cols-2 gap-2"><form method="post" action="/app/remind-now"><button class="w-full rounded-2xl py-3 font-bold bg-gold text-ink">Send reminder now</button></form><form method="post" action="/app/advance"><button class="w-full rounded-2xl py-3 font-bold bg-ink text-cream">Simulate +30 min</button></form></div><p class="text-sm opacity-60 mt-2">Simulated time for the demo. ${X.LIVE() ? 'LIVE: sends real WhatsApp messages.' : 'Dry run: nothing is sent.'}</p>`)}
`, embed);
}

// ---------- Medicines ----------
function medRow(m, dups, slot, embed) {
  const check = m.status === 'pending_review' && (m.unc.length || Number(m.confidence) < 0.7);
  const thumb = m.photo_med ? `<img src="${esc(m.photo_med)}" class="w-16 h-16 rounded-xl object-cover">` : `<div class="w-16 h-16 rounded-xl bg-cream flex items-center justify-center text-2xl font-bold">${esc(m.name[0] || '?')}</div>`;
  const rel = m.sos ? 'Only when needed' : m.relation === 'before' ? 'Before food' : m.relation === 'none' ? '' : 'After food';
  const did = `m${m.id}-${slot}`;
  return `<div class="card p-3 mb-2 ${check ? 'ring-2' : ''}" style="${check ? `--tw-ring-color:${C.warn}` : ''}">
<div class="flex gap-3">${thumb}<div class="flex-1 min-w-0">
<div class="flex flex-wrap gap-1 items-center"><span class="font-bold text-lg">${esc(m.name)}</span>${m.status === 'pending_review' ? pill('info', 'New') : ''}${check ? pill('warn', 'Please check' + (m.unc.length ? ': ' + m.unc.join(', ') : '')) : ''}${dups[m.id] ? pill('bad', 'Possible duplicate of ' + dups[m.id]) : ''}</div>
<div class="opacity-80">${esc(m.dose)}${rel ? ' · ' + rel : ''}</div>
<div class="text-sm opacity-60">${esc(m.frequency)}${m.purpose ? ' · ' + esc(m.purpose) : ''}${m.end_date ? ' · until ' + fmtShort(m.end_date) : m.duration_days ? ` · for ${m.duration_days} days` : ''}</div>
${m.place_note ? `<div class="text-sm mt-1">📍 ${esc(m.place_note)}</div>` : ''}</div></div>
<div class="flex gap-2 mt-2 items-center">${m.status === 'pending_review' ? `<form method="post" action="/app/medicines/${m.id}/approve"><button class="rounded-xl px-5 py-2 font-bold bg-ok text-white">Approve</button></form>` : ''}
<details id="${did}" class="flex-1"><summary class="text-sm underline opacity-70 py-2">Photos &amp; where it's kept</summary>
<div class="grid grid-cols-2 gap-2 mt-2"><label class="block text-center text-sm card p-2 cursor-pointer">${m.photo_med ? `<img src="${esc(m.photo_med)}" class="w-full h-20 object-cover rounded-lg mb-1">` : ''}Tablet / strip photo<input type="file" accept="image/*" class="hidden" onchange="up(${m.id},'med',this)"></label>
<label class="block text-center text-sm card p-2 cursor-pointer">${m.photo_place ? `<img src="${esc(m.photo_place)}" class="w-full h-20 object-cover rounded-lg mb-1">` : ''}Where it's kept<input type="file" accept="image/*" class="hidden" onchange="up(${m.id},'place',this)"></label></div>
<form method="post" action="/app/medicines/${m.id}/note" class="flex gap-2 mt-2"><input name="note" value="${esc(m.place_note || '')}" placeholder="e.g. steel box on the fridge" class="flex-1 border rounded-xl px-3 py-2"><button class="rounded-xl px-3 bg-ink text-cream">Save</button></form></details></div></div>`;
}
function medicines(embed) {
  const list = meds(), dups = dupMap(list), mt = mealTimes();
  const group = (items) => {
    const out = [];
    for (const s of MEALS) { const g = items.filter(m => !m.sos && m.slotList.includes(s)); if (g.length) out.push(`<h3 class="font-bold mt-4 mb-2 opacity-80">${SLOT_LABEL[s]} · ${mt[s]}</h3>${g.map(m => medRow(m, dups, s, embed)).join('')}`); }
    const sos = items.filter(m => m.sos); if (sos.length) out.push(`<h3 class="font-bold mt-4 mb-2 opacity-80">SOS · only when needed</h3>${sos.map(m => medRow(m, dups, 'sos', embed)).join('')}`);
    return out.join('');
  };
  const pending = list.filter(m => m.status === 'pending_review'), active = list.filter(m => m.status === 'active');
  return shell('medicines', `
${pending.length ? `<section class="mb-6 card p-4" style="background:#FFF8EA"><div class="flex justify-between items-center"><div><h2 class="text-xl font-bold">To review (${pending.length})</h2><div class="text-sm opacity-70">Read from ${esc(parentName())}'s photo. Check against the slip.</div></div>
<form method="post" action="/app/medicines/approve-all"><button class="rounded-xl px-4 py-2 font-bold bg-gold">Approve all</button></form></div>${group(pending)}</section>` : ''}
${section('Medicines by meal', group(active) || '<p class="opacity-60">No approved medicines yet.</p>')}
<script>
async function up(id,kind,inp){const f=inp.files[0];if(!f)return;const img=await createImageBitmap(f);const s=Math.min(1,1000/Math.max(img.width,img.height));
const c=document.createElement('canvas');c.width=img.width*s;c.height=img.height*s;c.getContext('2d').drawImage(img,0,0,c.width,c.height);
const b64=c.toDataURL('image/jpeg',.85).split(',')[1];await fetch('/app/medicines/'+id+'/photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,b64})});location.reload()}
</script>`, embed);
}

// ---------- Reports ----------
function status(r) {
  if (r.ref_high != null && r.value > r.ref_high) return ['bad', 'High'];
  if (r.ref_low != null && r.value < r.ref_low) return ['warn', 'Low'];
  if (r.ref_low == null && r.ref_high == null) return ['muted', 'No range printed'];
  return ['ok', 'In range'];
}
function chart(rs, W, H, full) {
  const vals = rs.map(r => r.value), last = rs[rs.length - 1];
  const lo = Math.min(...vals, last.ref_low ?? Infinity), hi = Math.max(...vals, last.ref_high ?? -Infinity);
  const pad = (hi - lo) * 0.15 || 1, min = lo - pad, max = hi + pad, P = full ? 30 : 4;
  const y = (v) => H - P - (v - min) / (max - min) * (H - 2 * P), x = (i) => P + (rs.length === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (rs.length - 1));
  const band = last.ref_low != null || last.ref_high != null ? `<rect x="0" y="${y(last.ref_high ?? max)}" width="${W}" height="${Math.max(0, y(last.ref_low ?? min) - y(last.ref_high ?? max))}" fill="${C.ok}" opacity="0.12"/>` : '';
  const pts = rs.map((r, i) => `${x(i)},${y(r.value)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${band}<polyline points="${pts}" fill="none" stroke="${C.ink}" stroke-width="${full ? 3 : 2.5}" stroke-linejoin="round"/>
${rs.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.value)}" r="${full ? 5 : 3}" fill="${status(r)[0] === 'ok' ? C.ok : status(r)[0] === 'bad' ? C.bad : C.warn}"/>${full ? `<text x="${x(i)}" y="${y(r.value) - 10}" font-size="13" text-anchor="middle" fill="${C.ink}" font-weight="700">${r.value}</text><text x="${x(i)}" y="${H - 8}" font-size="12" text-anchor="middle" fill="#888">${fmtShort(r.date)}</text>` : ''}`).join('')}
${full && last.ref_high != null ? `<text x="4" y="${y(last.ref_high) - 4}" font-size="11" fill="${C.ok}">range ${last.ref_low ?? ''}–${last.ref_high}</text>` : ''}</svg>`;
}
const trimNum = (n) => String(Math.round(n * 10) / 10);
function reports(embed) {
  const readings = db.prepare('SELECT * FROM readings ORDER BY date, id').all();
  const tests = [...new Set(readings.map(r => r.type))];
  const cards = tests.map((t, i) => {
    const rs = readings.filter(r => r.type === t), last = rs[rs.length - 1], prev = rs[rs.length - 2], [k, label] = status(last);
    const delta = prev ? last.value - prev.value : null;
    return `<details id="t${i}" class="card p-4 mb-3"><summary><div class="flex justify-between items-start"><div><div class="font-semibold opacity-80">${esc(t)}</div>
<div class="text-3xl font-extrabold">${esc(trimNum(last.value))} <span class="text-base font-semibold opacity-60">${esc(last.unit || '')}</span></div></div>${pill(k, label)}</div>
<div class="flex items-end gap-3 mt-1"><div class="flex-1">${chart(rs, 200, 44, false)}</div><div class="text-sm text-right opacity-70 whitespace-nowrap">${delta == null ? 'First report' : `${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} ${trimNum(Math.abs(delta))} since ${fmtMon(prev.date)}`}<br>${fmtShort(last.date)}</div></div></summary>
<div class="mt-3 border-t border-black/5 pt-3">${chart(rs, 340, 200, true)}<div class="text-sm opacity-70 mt-1">Range printed on the report: ${last.ref_low ?? '–'} to ${last.ref_high ?? '–'} ${esc(last.unit || '')}. Shaded band = that range.</div>
${k === 'bad' || k === 'warn' ? `<div class="text-sm mt-2 p-2 rounded-xl" style="background:#FBF0DC">Outside the printed range. Worth asking your doctor.</div>` : ''}</div></details>`;
  }).join('');
  const dates = [...new Set(readings.map(r => r.date))].reverse();
  const byDate = dates.map(d => `<div class="card p-4 mb-3"><div class="font-bold mb-2">${fmtDate(d)}</div>${readings.filter(r => r.date === d).map(r => { const [k, l] = status(r); return `<div class="flex justify-between items-center py-1"><span>${esc(r.type)}</span><span><b>${esc(trimNum(r.value))}</b> <span class="text-sm opacity-60">${esc(r.unit || '')}</span> ${pill(k, l)}</span></div>`; }).join('')}</div>`).join('');
  return shell('reports', section('Reports', `<div data-g="rep" data-v="test">${cards || '<p class="opacity-60">No reports yet. Ask ' + esc(parentName()) + ' to send a photo of a lab report.</p>'}</div><div data-g="rep" data-v="date" class="hidden">${byDate}</div>
<p class="text-sm opacity-60">Compared only with the range printed on each report. Not a diagnosis.</p>`, toggle('rep', [['test', 'By test'], ['date', 'By date']], 'test')), embed);
}

// ---------- Timeline + outbox ----------
function timeline(embed) {
  const ev = db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 60').all();
  const out = db.prepare("SELECT * FROM messages WHERE dir='out' ORDER BY id DESC LIMIT 20").all();
  return shell('timeline', `
${section('Timeline', `<div class="card divide-y divide-black/5">${ev.map(e => `<div class="p-3"><div class="text-xs opacity-50">${esc(fmtDT(e.created_at))} · ${esc(e.type.replace(/_/g, ' '))}</div><div>${esc(e.summary)}</div></div>`).join('')}</div>`)}
${section('Bot outbox', `<div class="card divide-y divide-black/5">${out.map(o => `<div class="p-3"><div class="text-xs opacity-50">${esc(fmtDT(o.created_at))} · ${pill(o.mode === 'live' ? 'bad' : 'muted', o.mode)}</div>${o.media_url ? `<img src="${esc(o.media_url)}" class="rounded-xl my-1 max-h-40">` : ''}<div class="whitespace-pre-line">${esc(o.body)}</div></div>`).join('') || '<p class="p-3 opacity-60">Empty</p>'}</div>`, `<span class="text-sm opacity-70">Messages used: ${X.used()} / ${X.MAX_MSGS}</span>`)}`, embed);
}

// ---------- Settings ----------
function settings(embed) {
  const mt = mealTimes();
  const row = (k, v) => `<div class="flex justify-between py-2 border-b last:border-0 border-black/5"><span class="opacity-70">${k}</span><span class="font-semibold text-right">${esc(v)}</span></div>`;
  return shell('settings', `
${section('Settings', `<div class="card p-4">${row('Parent', parentName())}${row('WhatsApp', (parentNumber() || 'not set').replace('whatsapp:', ''))}${row('Language', language() === 'ml-IN' ? 'Malayalam' : 'English')}${row('Meal times', `${mt.breakfast} · ${mt.lunch} · ${mt.dinner}`)}${row('Family member', childName())}${row('Sending', X.LIVE() ? 'LIVE' : 'Dry run (nothing sent)')}${row('Messages used', `${X.used()} / ${X.MAX_MSGS}`)}</div>
<a href="/setup" class="block text-center rounded-2xl py-3 mt-3 font-bold bg-gold">Run setup again</a>
<a href="/demo" target="_top" class="block text-center rounded-2xl py-3 mt-2 font-bold bg-ink text-cream">Open demo mode</a>
<form method="post" action="/app/reset" onsubmit="return confirm('Reset to the sample data?')"><button class="w-full rounded-2xl py-3 mt-2 font-semibold card">Reset demo data</button></form>`)}`, embed);
}

// ---------- /setup wizard ----------
function setup() {
  const mt = mealTimes(), num = (parentNumber() || '').replace(/^whatsapp:\+91/, '').replace('whatsapp:', '');
  const steps = [
    `<div class="text-center">${logo('text-5xl')}<p class="text-xl mt-4">A friend on WhatsApp who helps your parents stay on top of their health.</p>
<button type="button" onclick="nx()" class="w-full mt-8 rounded-2xl py-4 bg-white card font-semibold text-lg flex items-center justify-center gap-3"><svg width="22" height="22" viewBox="0 0 48 48"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.9 6.5-9.6 6.5-16.1z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2 20.4 2 24s1 6.9 2.5 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/></svg>Continue with Google</button>
<p class="text-xs opacity-50 mt-2">Demo: sign-in is mocked. No real login.</p>
<div class="mt-8 space-y-1 text-sm opacity-80"><div>Never gives medical advice</div><div>No app for your parent</div><div>Only you see the data</div></div></div>`,
    q('What should Dost call your parent?', `<input name="parent_name" value="${esc(parentName())}" class="w-full text-2xl border-2 rounded-2xl p-4" placeholder="e.g. Amma">`),
    q("Your parent's WhatsApp number", `<div class="flex items-center gap-2"><span class="text-2xl font-bold">+91</span><input name="phone" inputmode="numeric" value="${esc(num)}" class="flex-1 text-2xl border-2 rounded-2xl p-4" placeholder="98765 43210"></div><p class="text-sm opacity-60 mt-2">They'll get messages from the Dost WhatsApp number.</p>`),
    q('Which language for messages?', `<input type="hidden" name="language" id="lang" value="${language()}">${[['ml-IN', 'മലയാളം', 'Malayalam'], ['en-IN', 'English', 'English']].map(([v, a, b]) => `<button type="button" onclick="document.getElementById('lang').value='${v}';nx()" class="w-full rounded-2xl p-5 mb-3 card text-left"><div class="text-2xl font-bold">${a}</div><div class="opacity-60">${b}</div></button>`).join('')}`),
    q('When does your parent usually eat?', `${[['t_breakfast', 'Breakfast', mt.breakfast], ['t_lunch', 'Lunch', mt.lunch], ['t_dinner', 'Dinner', mt.dinner]].map(([n, l, v]) => `<label class="flex justify-between items-center card p-4 mb-3 text-xl"><span class="font-semibold">${l}</span><input type="time" name="${n}" value="${v}" class="text-xl border rounded-xl p-2"></label>`).join('')}<p class="text-sm opacity-60">Kerala defaults. Reminders follow meals.</p>`),
    q('And your name?', `<input name="child_name" value="${esc(childName())}" class="w-full text-2xl border-2 rounded-2xl p-4" placeholder="e.g. Rinkle"><p class="text-sm opacity-60 mt-2">Dost tells your parent that you'll check things.</p>`),
  ];
  function q(title, inner) { return `<h1 class="text-3xl font-extrabold mb-6 leading-tight">${title}</h1>${inner}`; }
  return `${head('Setup')}<body class="bg-cream text-ink text-[17px]"><form method="post" action="/setup" class="max-w-md mx-auto min-h-screen p-6 flex flex-col">
<div class="flex justify-center gap-2 mb-8" id="dots">${steps.map((_, i) => `<span class="w-2.5 h-2.5 rounded-full ${i ? 'bg-ink/20' : 'bg-ink'}"></span>`).join('')}</div>
${steps.map((s, i) => `<div class="step flex-1 ${i ? 'hidden' : ''}">${s}</div>`).join('')}
<div class="flex gap-3 mt-6" id="navb" style="visibility:hidden"><button type="button" onclick="bk()" class="rounded-2xl px-5 py-4 card font-semibold">Back</button><button type="button" id="nextb" onclick="nx()" class="flex-1 rounded-2xl py-4 font-bold text-lg bg-gold">Next</button></div></form>
<script>let i=0;const S=document.querySelectorAll('.step'),N=S.length;
function show(){S.forEach((s,k)=>s.classList.toggle('hidden',k!==i));document.querySelectorAll('#dots span').forEach((d,k)=>{d.className='w-2.5 h-2.5 rounded-full '+(k<=i?'bg-ink':'bg-ink/20')});
document.getElementById('navb').style.visibility=i?'visible':'hidden';document.getElementById('nextb').textContent=i===N-1?'Finish':'Next';const f=S[i].querySelector('input:not([type=hidden])');if(f)f.focus()}
function nx(){if(i===N-1)return document.forms[0].submit();i++;show()}function bk(){if(i>0){i--;show()}}
document.forms[0].addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nx()}});</script></body></html>`;
}

// ---------- /demo split screen ----------
function demo() {
  return `${head('Demo')}<body class="bg-[#E9E4DA] text-ink min-h-screen">
<style>.phone{width:390px;height:780px;border-radius:44px;background:#111;padding:12px;box-shadow:0 20px 50px rgba(0,0,0,.25)}.screen{width:100%;height:100%;border-radius:34px;overflow:hidden;position:relative;background:#fff}
.wa-bg{background-color:#EFE7DD;background-image:radial-gradient(rgba(0,0,0,.035) 1px,transparent 1px);background-size:14px 14px}
.b{max-width:80%;padding:6px 9px 4px;border-radius:9px;margin:3px 0;box-shadow:0 1px .5px rgba(0,0,0,.13);font-size:15px;line-height:1.3;white-space:pre-line;word-wrap:break-word}
.in{background:#fff;align-self:flex-start;border-top-left-radius:0}.out{background:#D9FDD3;align-self:flex-end;border-top-right-radius:0}.t{font-size:11px;color:#667781;text-align:right;margin-top:2px}
.chip{background:#fff;color:#027EB5;border-radius:9px;padding:8px;text-align:center;font-weight:600;font-size:14px;box-shadow:0 1px .5px rgba(0,0,0,.13);cursor:pointer}
.dot{width:7px;height:7px;border-radius:50%;background:#8696a0;display:inline-block;animation:bl 1.2s infinite}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}@keyframes bl{0%,80%,100%{opacity:.3}40%{opacity:1}}
.qd{background:#fff;border-radius:999px;padding:8px 14px;font-weight:600;box-shadow:0 2px 8px rgba(30,42,90,.1);white-space:nowrap}</style>
<div class="flex items-center justify-between px-6 py-3">${logo('text-3xl')}<div class="text-sm flex items-center gap-3">${X.LIVE() ? pill('bad', 'LIVE') : pill('muted', 'Dry run: nothing sent to WhatsApp')}<span class="opacity-70">Messages used: ${X.used()} / ${X.MAX_MSGS}</span>
<a href="/app" class="underline">Child app full screen</a><form method="post" action="/app/reset" onsubmit="return confirm('Reset demo data?')" class="inline"><input type="hidden" name="back" value="/demo"><button class="underline">Reset</button></form></div></div>
<div class="flex flex-wrap justify-center gap-2 px-4 mb-4">
<button class="qd" onclick="sample('prescription')">📷 Send sample prescription</button><button class="qd" onclick="sample('lab')">🧪 Send sample lab report</button>
<button class="qd" onclick="act('/demo/remind',{slot:'breakfast'})">⏰ Simulate breakfast reminder</button><button class="qd" onclick="act('/demo/advance')">⏩ +30 min</button><button class="qd" onclick="say('I have chest pain')">🚨 Say 'chest pain'</button></div>
<div class="flex flex-wrap justify-center gap-10 pb-10">
<div><div class="text-center font-semibold mb-2">${esc(parentName())}'s WhatsApp</div><div class="phone"><div class="screen flex flex-col">
<div class="flex items-center gap-3 px-3 py-2 text-white" style="background:#008069"><div class="w-9 h-9 rounded-full bg-cream text-ink font-extrabold flex items-center justify-center">D</div><div class="flex-1"><div class="font-semibold leading-tight">Dost</div><div class="text-xs opacity-80" id="sub">online</div></div></div>
<div id="chat" class="wa-bg flex-1 overflow-y-auto px-3 py-2 flex flex-col"></div>
<div class="flex items-center gap-2 p-2 bg-[#F0F2F5]"><label class="text-2xl cursor-pointer" title="Attach photo or PDF">📎<input type="file" accept="image/*,application/pdf" class="hidden" onchange="file(this)"></label>
<input id="msg" class="flex-1 rounded-full px-4 py-2 outline-none" placeholder="Message" onkeydown="if(event.key==='Enter')say()">
<label class="text-2xl cursor-pointer" title="Voice note (upload audio)">🎤<input type="file" accept="audio/*" class="hidden" onchange="file(this)"></label>
<button onclick="say()" class="w-10 h-10 rounded-full text-white" style="background:#008069">➤</button></div></div></div></div>
<div><div class="text-center font-semibold mb-2">${esc(childName())}'s Dost app</div><div class="phone"><div class="screen"><iframe src="/app?embed=1" class="w-full h-full border-0"></iframe></div></div></div></div>
<script>
let last=0;const chat=document.getElementById('chat');const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tm=s=>(s||'').slice(11,16);
function bubble(m){const mine=m.dir==='in';let inner='';
 if(m.kind==='image'&&m.media_url) inner+='<img src="'+E(m.media_url)+'" class="rounded-md mb-1 w-full">';
 if(m.kind==='pdf') inner+='<div class="flex items-center gap-2 bg-black/5 rounded p-2 mb-1">📄 <span>Document.pdf</span></div>';
 if(m.kind==='audio') inner+='<div class="flex items-center gap-2 py-1"><audio src="'+E(m.media_url)+'" controls style="height:32px;width:220px"></audio></div>';
 inner+=E(m.body);
 const el=document.createElement('div');el.className='b '+(mine?'out':'in');el.innerHTML=inner+'<div class="t">'+tm(m.created_at)+(mine?' <span style="color:#53BDEB">✓✓</span>':'')+'</div>';
 chat.appendChild(el);
 if(m.chips){const c=document.createElement('div');c.className='grid grid-cols-3 gap-1 self-start mb-2';c.style.width='80%';c.innerHTML=JSON.parse(m.chips).map(x=>'<div class="chip" onclick="say(\\''+x[0]+'\\')">'+E(x)+'</div>').join('');chat.appendChild(c)}}
let typingEl=null;
async function poll(){try{const r=await (await fetch('/demo/chat?after='+last)).json();
 for(const m of r.messages){bubble(m);last=m.id}
 if(r.typing&&!typingEl){typingEl=document.createElement('div');typingEl.className='b in';typingEl.innerHTML='<span class="dot"></span> <span class="dot"></span> <span class="dot"></span>';chat.appendChild(typingEl)}
 if(!r.typing&&typingEl){typingEl.remove();typingEl=null}
 if(typingEl)chat.appendChild(typingEl);document.getElementById('sub').textContent=r.typing?'typing…':'online';
 if(r.messages.length||r.typing)chat.scrollTop=chat.scrollHeight}catch(e){}}
setInterval(poll,1000);poll();
async function act(u,b){await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});poll()}
function say(t){const i=document.getElementById('msg');t=t??i.value;if(!t.trim())return;i.value='';act('/demo/send',{text:t})}
function sample(k){act('/demo/sample',{kind:k})}
async function file(inp){const f=inp.files[0];if(!f)return;const b64=await new Promise(r=>{const x=new FileReader();x.onload=()=>r(x.result.split(',')[1]);x.readAsDataURL(f)});inp.value='';act('/demo/send',{text:'',media:{mime:f.type,b64}})}
</script></body></html>`;
}

module.exports = { home, medicines, reports, timeline, settings, setup, demo, alertsHtml };
