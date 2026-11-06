// Generate the original galaxy-map background (out/html/img/bg_galaxy.jpg).
// Usage: node tools/gen_map.js   (needs Playwright's Chromium)
//
// An original drawing: painted region bands, hyperlanes and labelled worlds placed roughly
// where the galaxy's standard grid puts them. Columns run A (west) to V (east), rows 1 to 21.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const W = 2400, H = 1500;
const COLS = 22, ROWS = 21;
const cw = W / COLS, ch = H / ROWS;
// grid square "L9" -> pixel centre, with an optional offset inside the square (-0.5..0.5)
const gx = (col) => col.charCodeAt(0) - 65;
const px = (col, dx = 0) => (gx(col) + 0.5 + dx) * cw;
const py = (row, dy = 0) => (row - 0.5 + dy) * ch;

// galactic centre (the Deep Core), in grid units
const CX = (11.6) * cw, CY = (9.4) * ch;

// seeded random numbers, so the map is the same every time it is generated
let seed = 20;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ------------------------------------------------------------------ worlds
// [name, column, row, dx, dy, size, label side]
const WORLDS = [
  ['Coruscant', 'L', 9, 0, 0, 2, 'r'], ['Chandrila', 'L', 9, 0.3, -0.35, 1, 'r'], ['Alderaan', 'M', 10, 0, 0, 1.5, 'r'],
  ['Corellia', 'M', 11, 0.1, 0, 1.5, 'r'], ['Kuat', 'M', 9, 0.2, 0.2, 1, 'r'], ['Anaxes', 'K', 8, 0.3, 0.2, 1, 'l'],
  ['Brentaal', 'K', 10, 0, 0, 1, 'l'], ['Abregado', 'L', 11, -0.2, 0.35, 1, 'l'], ['Sern Prime', 'K', 9, -0.2, -0.2, 1, 'l'],
  ['Cato Neimoidia', 'N', 9, 0, 0.3, 1, 'r'], ['Hapes', 'O', 9, 0.2, -0.3, 1, 'r'], ['Kashyyyk', 'P', 9, 0.2, 0.3, 1.5, 'r'],
  ['Ord Mantell', 'L', 7, 0, 0, 1, 'r'], ['Mandalore', 'O', 7, 0, 0, 1.5, 'r'], ['Dathomir', 'O', 6, 0.3, -0.4, 1, 'r'],
  ['Dantooine', 'L', 4, 0, 0, 1, 'r'], ['Muunilinst', 'K', 5, 0, 0, 1, 'l'], ['Scipio', 'J', 4, 0, 0.3, 1, 'l'],
  ['Mygeeto', 'J', 6, -0.2, 0, 1, 'l'], ['Ilum', 'G', 7, 0, 0, 1, 'l'], ['Serenno', 'F', 11, 0.3, 0, 1.2, 'l'],
  ['Raxus', 'G', 13, 0, 0, 1.4, 'l'], ['Felucia', 'R', 6, 0, 0, 1, 'r'], ['Christophsis', 'S', 6, 0.2, 0.3, 1, 'r'],
  ['Mon Cala', 'U', 6, 0, 0, 1.3, 'l'], ['Lothal', 'S', 8, 0, 0, 1, 'r'], ['Kessel', 'T', 10, 0, 0, 1, 'r'],
  ['Nal Hutta', 'S', 12, 0, 0, 1.3, 'r'], ['Toydaria', 'R', 12, -0.2, 0.2, 1, 'l'], ['Bothawui', 'R', 14, 0, 0, 1, 'r'],
  ['Ithor', 'N', 13, 0, 0, 1, 'r'], ['Emberlene', 'O', 14, 0, 0, 1, 'r'], ['Yinchorr', 'L', 13, 0, 0, 1, 'l'],
  ['Malastare', 'N', 16, 0, 0, 1.2, 'l'], ['Naboo', 'O', 17, 0, 0, 1.5, 'r'], ['Sullust', 'M', 17, -0.1, 0, 1, 'l'],
  ['Eriadu', 'M', 18, 0, 0, 1.2, 'l'], ['Mustafar', 'L', 19, 0, 0.2, 1, 'l'], ['Utapau', 'N', 19, 0, 0, 1, 'r'],
  ['Dagobah', 'M', 19, 0.3, 0.3, 1, 'r'], ['Hoth', 'K', 18, -0.2, 0.3, 1, 'l'], ['Bespin', 'K', 18, 0.2, -0.2, 1, 'r'],
  ['Endor', 'H', 16, 0, 0, 1, 'l'], ['Rodia', 'R', 16, -0.3, -0.3, 1.2, 'l'], ['Tatooine', 'R', 16, 0.2, 0.1, 1.4, 'r'],
  ['Geonosis', 'R', 16, -0.1, 0.45, 1.2, 'l'], ['Ryloth', 'R', 17, 0.2, 0.4, 1.2, 'r'], ['Kamino', 'S', 15, 0.3, 0, 1.2, 'r'],
  ['Pantora', 'U', 15, 0, 0, 1, 'l'], ['Bakura', 'T', 17, 0.2, 0.2, 1, 'r'], ['Ansion', 'J', 11, 0, 0, 1, 'l'],
  ['Thyferra', 'P', 11, 0, 0, 1, 'r'], ['Ando', 'O', 16, 0.3, -0.2, 1, 'r']
];

// ------------------------------------------------------------------ regions
// concentric bands around the Deep Core: [name, radius in grid units, colour, opacity]
const BANDS = [
  ['outer', 10.6, '#8a3424', 0.42], ['midrim', 7.0, '#55753a', 0.5], ['expansion', 5.3, '#3a6a64', 0.5],
  ['inner', 4.1, '#36577e', 0.5], ['colonies', 3.0, '#5d4884', 0.55], ['core', 1.9, '#b98e3e', 0.6], ['deep', 0.9, '#f3e3b4', 0.8]
];

function blob(cx, cy, rx, ry, wobble, n) {
  // a closed, irregular curve through n points around an ellipse
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (rnd() - 0.5) * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    if (i === 0) d += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <filter id="paint" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="70" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="6"/>
  </filter>
  <filter id="edge" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="70" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="9" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/>
  </filter>
  <filter id="clouds" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.0025 0.004" numOctaves="5" seed="12"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.22  0 0 0 0 0.25  0 0 0 0 0.42  0 0 0 0.9 -0.18"/>
  </filter>
  <radialGradient id="glow" cx="${(CX / W * 100).toFixed(1)}%" cy="${(CY / H * 100).toFixed(1)}%" r="22%">
    <stop offset="0" stop-color="#fff6d8" stop-opacity="0.95"/><stop offset="0.4" stop-color="#e7c27a" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#e7c27a" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="unknown" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#05040c" stop-opacity="0.92"/><stop offset="0.22" stop-color="#1a0f2e" stop-opacity="0.75"/>
    <stop offset="0.36" stop-color="#1a0f2e" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#0a0d1a"/>
<rect width="${W}" height="${H}" filter="url(#clouds)"/>
`;

// stars
let stars = '';
for (let i = 0; i < 1600; i++) {
  const x = rnd() * W, y = rnd() * H, r = 0.4 + rnd() * 1.4;
  stars += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.15 + rnd() * 0.6).toFixed(2)}"/>`;
}
svg += `<g>${stars}</g>`;

// painted region bands
svg += '<g filter="url(#paint)">';
const edges = [];
for (const [name, r, col, op] of BANDS) {
  // three overlapping washes per band give a hand-painted, uneven edge
  for (let k = 0; k < 3; k++) {
    const d = blob(CX + (rnd() - 0.5) * cw * 0.4, CY + (rnd() - 0.5) * ch * 0.4, r * cw * (0.96 + k * 0.03), r * ch * (0.96 + k * 0.03), 0.28, 11 + k * 2);
    svg += `<path d="${d}" fill="${col}" opacity="${(op * (k === 0 ? 0.75 : 0.35)).toFixed(2)}" data-region="${name}"/>`;
    if (k === 0 && name !== 'deep') edges.push(d);
  }
}
// Hutt Space and the Corporate Sector: pale and green-gold territories, as on a political map
for (let k = 0; k < 3; k++) {
  svg += `<path d="${blob(px('S', 0.2), py(12, 0.2), (1.8 + k * 0.25) * cw, (2.0 + k * 0.25) * ch, 0.4, 10)}" fill="#d3d9de" opacity="${k ? 0.18 : 0.42}"/>`;
  svg += `<path d="${blob(px('T', 0.3), py(4, 0.2), (1.8 + k * 0.25) * cw, (1.8 + k * 0.25) * ch, 0.4, 10)}" fill="#a7b23a" opacity="${k ? 0.16 : 0.4}"/>`;
}
svg += '</g>';
// thin dark borders between territories, like a political map
svg += '<g filter="url(#edge)" fill="none" stroke="#1b1612" stroke-opacity="0.45" stroke-width="2.2">' + edges.map((d) => `<path d="${d}"/>`).join('') + '</g>';

// the Deep Core's glow and the Unknown Regions' darkness
svg += `<rect width="${W}" height="${H}" fill="url(#glow)"/>`;
svg += `<rect width="${W}" height="${H}" fill="url(#unknown)"/>`;

// faint survey grid with edge labels
let grid = '';
for (let c = 0; c <= COLS; c++) grid += `<line x1="${(c * cw).toFixed(0)}" y1="0" x2="${(c * cw).toFixed(0)}" y2="${H}"/>`;
for (let r = 0; r <= ROWS; r++) grid += `<line x1="0" y1="${(r * ch).toFixed(0)}" x2="${W}" y2="${(r * ch).toFixed(0)}"/>`;
svg += `<g stroke="#cfd8ea" stroke-opacity="0.08" stroke-width="1">${grid}</g>`;
let gl = '';
for (let c = 0; c < COLS; c++) gl += `<text x="${((c + 0.5) * cw).toFixed(0)}" y="22">${String.fromCharCode(65 + c)}</text>`;
for (let r = 1; r <= ROWS; r++) gl += `<text x="12" y="${((r - 0.5) * ch + 6).toFixed(0)}" text-anchor="start">${r}</text>`;
svg += `<g font-family="Inter, sans-serif" font-size="16" fill="#cfd8ea" fill-opacity="0.35" text-anchor="middle">${gl}</g>`;

// hyperlanes: smooth curves through worlds, as [label, [world names or grid points]]
const P = {};
for (const w of WORLDS) P[w[0]] = [px(w[1], w[3]), py(w[2], w[4])];
const pt = (c, r, dx = 0, dy = 0) => [px(c, dx), py(r, dy)];
const LANES = [
  ['Perlemian Trade Route', ['Coruscant', 'Chandrila', pt('N', 7), 'Mandalore', pt('Q', 5), 'Felucia', pt('U', 4)]],
  ['Corellian Run', ['Coruscant', 'Corellia', pt('O', 13), 'Bothawui', pt('Q', 15), 'Rodia', 'Tatooine']],
  ['Hydian Way', [pt('T', 2), pt('S', 5), 'Lothal', pt('T', 9), 'Nal Hutta', 'Bothawui', 'Kamino', pt('Q', 18), 'Naboo', 'Eriadu', pt('J', 19), pt('F', 20)]],
  ['Rimma Trade Route', ['Abregado', pt('L', 13), pt('M', 15), 'Sullust', 'Eriadu', pt('M', 20)]],
  ['Corellian Trade Spine', ['Corellia', pt('L', 14), pt('K', 16), 'Bespin', 'Hoth', pt('K', 21)]]
];
function laneD(points) {
  const p = points.map((q) => (typeof q === 'string' ? P[q] : q));
  let d = `M${p[0][0].toFixed(0)},${p[0][1].toFixed(0)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(0)},${c1[1].toFixed(0)} ${c2[0].toFixed(0)},${c2[1].toFixed(0)} ${p2[0].toFixed(0)},${p2[1].toFixed(0)}`;
  }
  return d;
}
let lanes = '';
LANES.forEach(([name, pts], i) => {
  const id = 'lane' + i;
  lanes += `<path id="${id}" d="${laneD(pts)}" fill="none" stroke="#0d0f16" stroke-opacity="0.55" stroke-width="5"/>`;
  lanes += `<path d="${laneD(pts)}" fill="none" stroke="#f2ead2" stroke-opacity="0.7" stroke-width="1.8"/>`;
  lanes += `<text font-family="Inter, sans-serif" font-size="15" letter-spacing="2" fill="#f2ead2" fill-opacity="0.75" stroke="#0d0f16" stroke-opacity="0.6" stroke-width="3" paint-order="stroke"><textPath href="#${id}" startOffset="${i % 2 ? '58%' : '32%'}">${name.toUpperCase()}</textPath></text>`;
});
svg += lanes;

// big region names
const REGION_LABELS = [
  ['CORE WORLDS', 'L', 10, 0.0, 0.55, 22], ['COLONIES', 'J', 8, 0, 0.1, 30], ['INNER RIM', 'N', 12, 0.3, 0.45, 28],
  ['EXPANSION REGION', 'H', 12, 0, -0.3, 30], ['MID RIM', 'P', 15, 0, 0, 44], ['OUTER RIM TERRITORIES', 'O', 20, 0, 0.1, 44],
  ['HUTT SPACE', 'S', 11, 0.3, -0.25, 40], ['CORPORATE SECTOR', 'T', 3, 0, -0.2, 34], ['WILD SPACE', 'C', 16, 0.4, 0, 40],
  ['UNKNOWN REGIONS', 'C', 9, 0.4, 0, 46], ['DEEP CORE', 'K', 9, 0.3, 0.75, 16]
];
let rl = '';
for (const [t, c, r, dx, dy, size] of REGION_LABELS) {
  rl += `<text x="${px(c, dx).toFixed(0)}" y="${py(r, dy).toFixed(0)}" font-size="${size}">${t}</text>`;
}
svg += `<g font-family="Inter Display, Inter, sans-serif" font-weight="300" letter-spacing="6" fill="#f4efe0" fill-opacity="0.62" text-anchor="middle" stroke="#0b0d14" stroke-opacity="0.35" stroke-width="4" paint-order="stroke">${rl}</g>`;

// worlds
let ws = '';
for (const [name, c, r, dx, dy, size, side] of WORLDS) {
  const x = px(c, dx), y = py(r, dy), rr = 3.2 + size * 2.2;
  ws += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rr + 2.5).toFixed(1)}" fill="#0b0d14" opacity="0.55"/>`;
  ws += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="#f7f2e4"/>`;
  ws += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rr * 0.45).toFixed(1)}" fill="#0b0d14" opacity="0.5"/>`;
  const lx = side === 'r' ? x + rr + 7 : x - rr - 7;
  ws += `<text x="${lx.toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="${side === 'r' ? 'start' : 'end'}" font-size="${size >= 1.5 ? 21 : 18}">${name}</text>`;
}
svg += `<g font-family="Inter, sans-serif" fill="#f7f2e4" stroke="#0b0d14" stroke-opacity="0.8" stroke-width="4" paint-order="stroke">${ws}</g>`;

// paper grain over everything, for a painted feel
svg += `<rect width="${W}" height="${H}" filter="url(#grain)"/>`;
svg += '</svg>';


(async () => {
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.waitForTimeout(300);
  const out = path.join(__dirname, '..', 'out', 'html', 'img', 'bg_galaxy.jpg');
  await page.screenshot({ path: out, type: 'jpeg', quality: 78, clip: { x: 0, y: 0, width: W, height: H } });
  await browser.close();
  console.log('wrote', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
})();
