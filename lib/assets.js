// Generates placeholder medicine photos and the /public/samples demo documents (only if missing).
const sharp = require('sharp');
const fs = require('fs');
const { addDays, today, fmtDate } = require('./db');

const x = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pillSvg({ label, bg, pill, shape }) {
  const tablet = shape === 'capsule'
    ? `<rect x="170" y="200" width="300" height="110" rx="55" fill="${pill}" stroke="#00000022" stroke-width="4"/><rect x="320" y="200" width="150" height="110" rx="55" fill="#ffffff"/><rect x="320" y="200" width="20" height="110" fill="#ffffff"/>`
    : shape === 'strip'
      ? `<rect x="110" y="150" width="420" height="220" rx="18" fill="#d9dde3" stroke="#9aa3ad" stroke-width="4"/>${[0, 1, 2, 3].map(i => [0, 1].map(j => `<circle cx="${180 + i * 95}" cy="${215 + j * 90}" r="32" fill="${pill}" stroke="#00000022" stroke-width="3"/>`).join('')).join('')}`
      : `<circle cx="320" cy="255" r="110" fill="${pill}" stroke="#00000022" stroke-width="5"/><line x1="230" y1="255" x2="410" y2="255" stroke="#00000022" stroke-width="6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${bg}"/>${tablet}
<text x="320" y="440" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#1E2A5A" text-anchor="middle">${x(label)}</text></svg>`;
}

function placeSvg(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#EDE6DA"/>
<rect x="150" y="40" width="340" height="400" rx="20" fill="#f4f4f4" stroke="#b9b9b9" stroke-width="6"/><line x1="150" y1="200" x2="490" y2="200" stroke="#b9b9b9" stroke-width="6"/>
<rect x="210" y="-0" width="220" height="40" rx="10" fill="#c8ccd2"/><ellipse cx="320" cy="20" rx="110" ry="20" fill="#c8ccd2"/>
<text x="320" y="320" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#1E2A5A" text-anchor="middle">${x(label)}</text></svg>`;
}

function prescriptionSvg() {
  const d = fmtDate(today());
  const hand = 'font-family="Segoe Print, Comic Sans MS, Bradley Hand, cursive" fill="#1d3b8f"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1300"><rect width="1000" height="1300" fill="#fffdf6"/>
<rect x="0" y="0" width="1000" height="170" fill="#e8f0fb"/>
<text x="50" y="70" font-family="Georgia, serif" font-size="44" font-weight="700" fill="#16325c">Dr. Suresh Nair, MD</text>
<text x="50" y="115" font-family="Arial" font-size="26" fill="#16325c">General Medicine · Reg. No. TCMC 23415</text>
<text x="50" y="150" font-family="Arial" font-size="24" fill="#16325c">Lakeside Clinic, MG Road, Kochi 682016 · Ph 0484 2345678</text>
<text x="50" y="230" font-family="Arial" font-size="28" fill="#333">Name: Mrs. Amma (68 F)        Date: ${x(d)}</text>
<text x="50" y="275" font-family="Arial" font-size="28" fill="#333">BP 148/92   FBS 152</text>
<text x="50" y="370" font-family="Georgia, serif" font-size="80" font-weight="700" fill="#16325c">℞</text>
<text x="70" y="470" ${hand} font-size="44">1) Tab. Telmisartan 40mg   1-0-0</text>
<text x="110" y="520" ${hand} font-size="34">after food  x 1 month</text>
<text x="70" y="610" ${hand} font-size="44">2) Tab. Glycomet 500   1-0-1   after food</text>
<text x="110" y="660" ${hand} font-size="34">continue</text>
<text x="70" y="750" ${hand} font-size="44" opacity="0.55">3) Tab. Amlo..pine 5 (?) mg   0-0-1</text>
<text x="70" y="850" ${hand} font-size="44">4) Tab. Pan 40   1-0-0</text><text x="110" y="900" ${hand} font-size="34">before breakfast  x 5 days</text>
<text x="70" y="990" ${hand} font-size="44">5) Tab. Dolo 650   SOS for fever / pain</text>
<text x="70" y="1110" ${hand} font-size="38">Review after 2 weeks with FBS, PPBS reports</text>
<text x="700" y="1220" ${hand} font-size="44">S. Nair</text></svg>`;
}

function labSvg() {
  const d = fmtDate(today());
  const rows = [
    ['HbA1c (Glycated Haemoglobin)', '8.2', '%', '4.0 - 5.6'],
    ['Fasting Blood Sugar', '152', 'mg/dL', '70 - 99'],
    ['LDL Cholesterol', '131', 'mg/dL', '0 - 100'],
    ['Serum Creatinine', '0.9', 'mg/dL', '0.6 - 1.1'],
    ['Haemoglobin', '12.4', 'g/dL', '12.0 - 15.5'],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1100"><rect width="1000" height="1100" fill="#ffffff"/>
<rect width="1000" height="150" fill="#0f5f73"/>
<text x="50" y="70" font-family="Arial" font-size="42" font-weight="700" fill="#fff">Kochi Diagnostic Centre</text>
<text x="50" y="115" font-family="Arial" font-size="24" fill="#e6f4f7">NABL accredited · Kaloor, Kochi 682017</text>
<text x="50" y="210" font-family="Arial" font-size="26" fill="#333">Patient: Mrs. Amma   Age/Sex: 68 / F   Ref: Dr. Suresh Nair</text>
<text x="50" y="250" font-family="Arial" font-size="26" fill="#333">Collected: ${x(d)}   Report: ${x(d)}</text>
<rect x="40" y="290" width="920" height="60" fill="#eef5f7"/>
<text x="60" y="330" font-family="Arial" font-size="26" font-weight="700" fill="#0f5f73">Test</text>
<text x="560" y="330" font-family="Arial" font-size="26" font-weight="700" fill="#0f5f73">Result</text>
<text x="690" y="330" font-family="Arial" font-size="26" font-weight="700" fill="#0f5f73">Unit</text>
<text x="800" y="330" font-family="Arial" font-size="26" font-weight="700" fill="#0f5f73">Ref. range</text>
${rows.map((r, i) => `<text x="60" y="${410 + i * 80}" font-family="Arial" font-size="27" fill="#222">${x(r[0])}</text><text x="560" y="${410 + i * 80}" font-family="Arial" font-size="27" font-weight="700" fill="#222">${r[1]}</text><text x="690" y="${410 + i * 80}" font-family="Arial" font-size="27" fill="#222">${r[2]}</text><text x="800" y="${410 + i * 80}" font-family="Arial" font-size="27" fill="#222">${r[3]}</text><line x1="40" y1="${435 + i * 80}" x2="960" y2="${435 + i * 80}" stroke="#e3e3e3"/>`).join('')}
<text x="60" y="1000" font-family="Arial" font-size="22" fill="#777">This report is for the referring doctor. Please correlate clinically.</text></svg>`;
}

const PLACEHOLDERS = {
  'med-telma.png': { label: 'Telma 40', bg: '#F3EEE4', pill: '#ffffff', shape: 'round' },
  'med-glycomet.png': { label: 'Glycomet 500', bg: '#E8EEF6', pill: '#ffffff', shape: 'strip' },
  'med-ecosprin.png': { label: 'Ecosprin 75', bg: '#F6ECE6', pill: '#f2a3a3', shape: 'round' },
};

async function ensureAssets() {
  const out = async (file, svg) => { if (!fs.existsSync(file)) await sharp(Buffer.from(svg)).png().toFile(file); };
  for (const [f, o] of Object.entries(PLACEHOLDERS)) await out(`public/media/${f}`, pillSvg(o));
  await out('public/media/place-fridge.png', placeSvg('Steel box on the fridge'));
}

module.exports = { ensureAssets };
