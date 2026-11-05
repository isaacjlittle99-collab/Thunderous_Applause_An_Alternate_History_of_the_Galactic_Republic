// Static checker for the Star Wars conversion.
// Usage: node check.js <repo>
const fs = require('fs');
const path = require('path');
const repo = process.argv[2];
const SW = require(path.join(repo, 'out/html/sw.js'));
const D = SW.DEFAULTS();
const known = new Set(Object.keys(D));
// dynamic keys produced by helpers
for (const r of SW.REGIONS) for (const b of SW.BLOCS) { known.add(r + '_' + b); known.add(r + '_' + b + '_share'); }
for (const b of SW.BLOCS) for (const k of ['_r', '_votes', '_seats', '_in_govt', '_old_r', '_relation', '_name', '_leader']) known.add(b + k);
for (const c of SW.COMMITTEES) known.add('chair_' + c);
const derived = ['govt_seats', 'minority_govt', 'rc_in_govt', 'rc_chancellor', 'pal_chancellor', 'puppet_chancellor', 'rc_chairs', 'rc_has_access',
  'force_rep', 'force_sith', 'force_ratio', 'unease', 'pal_display', 'chancellor_color', 'capital_label', 'faith_r', 'corruption_r', 'fear_r',
  'hardship_r', 'sep_total_r', 'war_weariness_r', 'clones_r', 'jedi_strength_r', 'evidence_r', 'senate_size', 'last_vote', 'n_advisors',
  'turn_advanced', 'has_event', 'pinnedCardsDescription', 'handDescription', 'deckDescription', 'secession_recent', 'assassination_roll',
  'sb_html', 'coalition_label', 'rc_in_govt_flag'];
derived.forEach(k => known.add(k));
for (let i = 0; i < 7; i++) ['', '_ok', '_label', '_why'].forEach(s => known.add('el_opt' + i + s));
for (let i = 0; i < 8; i++) known.add('battle_' + i);
for (const t of SW.TIMERS) known.add(t + '_timer');

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.dry')) files.push(p); } })(path.join(repo, 'source'));

const reserved = new Set(['and', 'or', 'not', 'if', 'then', 'else', 'true', 'false', 'rand', 'sqrt']);
const usedJsIncr = new Map(), usedAll = new Map(), assigned = new Set(), timers = new Map();
const note = (m, k, f) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(path.basename(f)); };

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // JS blocks
  const jsBlocks = [...src.matchAll(/\{!([\s\S]*?)!\}/g)].map(m => m[1]).filter(b => /Q\./.test(b) || /Q\[/.test(b));
  for (const js of jsBlocks) {
    for (const m of js.matchAll(/Q\.([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|-=|\*=|\/=|\+\+|--)/g)) note(usedJsIncr, m[1], f);
    for (const m of js.matchAll(/Q\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g)) assigned.add(m[1]);
    for (const m of js.matchAll(/Q\.([A-Za-z_][A-Za-z0-9_]*)/g)) note(usedAll, m[1], f);
  }
  // Dendry logic lines
  const logicLines = src.split('\n').filter(l => /^(view-if|choose-if|on-arrival|go-to): /.test(l) && !l.includes('{!'));
  const condText = [...src.matchAll(/\[\?\s*if\s+([^:]*?):/g)].map(m => m[1]);
  const inserts = [...src.matchAll(/\[\+\s*([^:+]*?)\s*(?::\s*\w+\s*)?\+\]/g)].map(m => m[1]);
  for (const l of [...logicLines.map(l => l.replace(/^[a-z-]+: /, '')), ...condText, ...inserts]) {
    const clean = l.replace(/"[^"]*"|'[^']*'/g, '').replace(/@[\w.]+/g, '');
    for (const m of clean.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      const n = m[0]; if (reserved.has(n)) continue;
      note(usedAll, n, f);
    }
    for (const m of clean.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g)) assigned.add(m[1]);
  }
  for (const m of src.matchAll(/\b([a-z][a-z0-9_]*)_timer\b/g)) note(timers, m[1], f);
}
// go-to targets inside on-arrival lines would be ids; ignore known scene-ish words
const ignore = new Set(['Q', 'SW', 'this', 'Math', 'var', 'for', 'i', 'j', 'k', 'b', 'r', 'f', 'g', 'm', 'c', 'st', 'v', 'v2', 'ov', 'ep']);
const incrMissing = [...usedJsIncr.keys()].filter(k => !known.has(k));
console.log('JS increments of qualities without defaults (would become NaN):');
for (const k of incrMissing.sort()) console.log('  ' + k + '  <- ' + [...usedJsIncr.get(k)].join(', '));
const neverSet = [...usedAll.keys()].filter(k => !known.has(k) && !assigned.has(k) && !ignore.has(k) && !/^achievement_|^game_achievement_/.test(k));
console.log('\nQualities read but never assigned anywhere (typo or missing default?):');
for (const k of neverSet.sort()) console.log('  ' + k + '  <- ' + [...usedAll.get(k)].slice(0, 4).join(', '));
const missingTimers = [...timers.keys()].filter(t => !SW.TIMERS.includes(t));
console.log('\nTimers not in SW.TIMERS:');
for (const t of missingTimers) console.log('  ' + t + '_timer  <- ' + [...timers.get(t)].join(', '));
const notDefaulted = [...assigned].filter(k => !known.has(k)).sort();
console.log('\nAssigned but not in DEFAULTS (' + notDefaulted.length + '): ' + notDefaulted.join(' '));
