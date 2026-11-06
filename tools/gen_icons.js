// Generate the app icons (PNG + favicon.ico) for the installable web app.
// Usage: node tools/gen_icons.js   (needs Playwright's Chromium and python3 with Pillow)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'out', 'html', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// Original emblem: a gold Senate-rotunda arc of pods under a single star, on deep navy.
// `pad` shrinks the artwork toward the centre so maskable icons survive circular crops.
function emblem(size, pad) {
  const s = size, c = s / 2, k = (1 - pad * 2);
  const R = (v) => (c + (v - 256) * (s / 512) * k).toFixed(1);
  const L = (v) => (v * (s / 512) * k).toFixed(1);
  let pods = '';
  const rings = [[118, 9], [150, 12], [182, 15]];
  rings.forEach(([r, n], ri) => {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + Math.PI * (i + 0.5) / n;
      const x = 256 + r * Math.cos(a), y = 300 + r * Math.sin(a) * 0.82;
      pods += `<rect x="${R(x - 9)}" y="${R(y - 6)}" width="${L(18)}" height="${L(12)}" rx="${L(3)}" fill="#e8c76a" opacity="${0.55 + ri * 0.2}"/>`;
    }
  });
  const star = (cx, cy, ro, ri) => {
    let p = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
      p.push(`${R(cx + r * Math.cos(a))},${R(cy + r * Math.sin(a))}`);
    }
    return `<polygon points="${p.join(' ')}" fill="#f4dc8f"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#22345a"/><stop offset="1" stop-color="#05070d"/></radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f4dc8f" stop-opacity="0.55"/><stop offset="1" stop-color="#f4dc8f" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <circle cx="${R(256)}" cy="${R(250)}" r="${L(62)}" fill="url(#halo)"/>
  ${star(256, 250, 38, 15)}
  ${pods}
  <rect x="${R(226)}" y="${R(300)}" width="${L(60)}" height="${L(54)}" rx="${L(6)}" fill="#e8c76a"/>
  <rect x="${R(150)}" y="${R(372)}" width="${L(212)}" height="${L(8)}" rx="${L(4)}" fill="#e8c76a" opacity="0.8"/>
</svg>`;
}

(async () => {
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
  const page = await browser.newPage();
  const targets = [
    ['icon-192.png', 192, 0.04], ['icon-512.png', 512, 0.04],
    ['icon-maskable-512.png', 512, 0.14], ['apple-touch-icon.png', 180, 0.06],
    ['favicon-32.png', 32, 0.0], ['favicon-64.png', 64, 0.0], ['favicon-256.png', 256, 0.02]
  ];
  for (const [name, size, pad] of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:#05070d">${emblem(size, pad)}</body></html>`);
    await page.screenshot({ path: path.join(outDir, name), clip: { x: 0, y: 0, width: size, height: size } });
  }
  fs.writeFileSync(path.join(outDir, 'icon.svg'), emblem(512, 0.04));
  await browser.close();
  // multi-size favicon.ico for Windows
  execFileSync('python3', ['-I', '-c', [
    'import sys; from PIL import Image',
    'src = Image.open(sys.argv[1]).convert("RGBA")',
    'src.save(sys.argv[2], sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])'
  ].join('\n'), path.join(outDir, 'favicon-256.png'), path.join(root, 'out', 'html', 'favicon.ico')]);
  for (const f of ['favicon-32.png', 'favicon-64.png', 'favicon-256.png']) fs.unlinkSync(path.join(outDir, f));
  console.log('icons written to', outDir, 'and out/html/favicon.ico');
})();
