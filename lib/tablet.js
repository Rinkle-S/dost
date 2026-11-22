// Generated tablet pictures (no scraped brand photos). look = "shape:colour".
const SHAPES = ['round', 'oval', 'capsule', 'caplet'];
const COLOURS = { white: '#F7F6F0', yellow: '#F3D75B', orange: '#F39B4B', pink: '#F2A7B8', blue: '#8DB6E8' };
const LOOKS = [...SHAPES.flatMap(s => Object.keys(COLOURS).map(c => `${s}:${c}`)), 'capsule:redwhite'];

function tabletSvg(look, size = 120, bg = '#FBF7F0') {
  const [shape, colour] = String(look || 'round:white').split(':');
  const fill = COLOURS[colour] || '#F7F6F0', st = 'stroke="#1E2A5A33" stroke-width="3"';
  let body;
  if (shape === 'oval') body = `<ellipse cx="60" cy="60" rx="44" ry="28" fill="${fill}" ${st}/><line x1="30" y1="60" x2="90" y2="60" stroke="#00000018" stroke-width="3"/>`;
  else if (shape === 'capsule') body = colour === 'redwhite'
    ? `<path d="M38 38h22v44H38a22 22 0 010-44z" fill="#E4572E" ${st}/><path d="M60 38h22a22 22 0 010 44H60z" fill="#F7F6F0" ${st}/>`
    : `<rect x="16" y="38" width="88" height="44" rx="22" fill="${fill}" ${st}/><line x1="60" y1="38" x2="60" y2="82" stroke="#00000022" stroke-width="3"/>`;
  else if (shape === 'caplet') body = `<rect x="14" y="42" width="92" height="36" rx="14" fill="${fill}" ${st}/><line x1="60" y1="46" x2="60" y2="74" stroke="#00000020" stroke-width="3"/>`;
  else body = `<circle cx="60" cy="60" r="34" fill="${fill}" ${st}/><line x1="34" y1="60" x2="86" y2="60" stroke="#00000018" stroke-width="3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}"><rect width="120" height="120" rx="16" fill="${bg}"/>${body}</svg>`;
}

// Suggest a look from free text like "small white oval tablet" (keyword match, deterministic).
function suggestLook(text) {
  const t = String(text || '').toLowerCase();
  const shape = /capsule/.test(t) ? 'capsule' : /caplet|long|oblong/.test(t) ? 'caplet' : /oval/.test(t) ? 'oval' : 'round';
  if (shape === 'capsule' && /red/.test(t)) return 'capsule:redwhite';
  const colour = Object.keys(COLOURS).find(c => t.includes(c)) || (/red/.test(t) ? 'pink' : 'white');
  return `${shape}:${colour}`;
}
const lookLabel = (look) => { const [s, c] = String(look).split(':'); return `${c === 'redwhite' ? 'red/white' : c} ${s}`; };

module.exports = { LOOKS, tabletSvg, suggestLook, lookLabel };
