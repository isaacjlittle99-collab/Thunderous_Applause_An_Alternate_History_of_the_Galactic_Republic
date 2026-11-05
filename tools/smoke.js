// Browser smoke test: play full games through the real UI and screenshot key screens.
// Usage: node smoke.js <repo> <outdir> [games=2] [scale=1]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const repo = process.argv[2];
const outdir = process.argv[3];
const GAMES = +(process.argv[4] || 2);
const SCALE = +(process.argv[5] || 1);
fs.mkdirSync(outdir, { recursive: true });

(async () => {
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: SCALE });
  const errors = [];
  page.on('console', m => { const t = m.text(); if (/^Error|TypeError|ReferenceError|Uncaught/.test(t)) errors.push(t.slice(0, 200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  const url = 'file://' + path.join(repo, 'out/html/index.html');
  const shot = async (name, full) => page.screenshot({ path: path.join(outdir, name + '.png'), fullPage: !!full });
  const clickText = async (txt) => { const l = page.locator('ul.choices li a', { hasText: txt }).first(); if (await l.count()) { await l.click(); return true; } return false; };

  for (let g = 0; g < GAMES; g++) {
    await page.goto(url);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(url);
    await page.waitForTimeout(400);
    if (g === 0) await shot('01_start_menu');
    await clickText('Begin a new game');
    await page.waitForTimeout(150);
    await clickText('Senator');
    await page.waitForTimeout(150);
    if (g === 0) await shot('02_intro');
    await clickText('Take your seat');
    let steps = 0, shotsTaken = { main: false, session: false, shadow: false, election: false, finale: false };
    let ended = false;
    while (steps < 2500) {
      steps++;
      await page.waitForTimeout(20);
      if (await page.locator('p.game-over').count()) { ended = true; break; }
      const q = await page.evaluate(() => { const Q = dendryUI.dendryEngine.state.qualities; return { time: Q.time, finale: Q.finale, scene: dendryUI.dendryEngine.state.sceneId, date: Q.date_label, ending: Q.ending }; });
      if (g === 0 && !shotsTaken.session && q.scene === 'rec_senate_session') { await page.waitForTimeout(2200); await shot('04_senate_session', true); shotsTaken.session = true; }
      if (g === 0 && !shotsTaken.election && q.scene === 'rec_chancellor_election') { await shot('05_election', true); shotsTaken.election = true; }
      const hand = page.locator('ul.hand li.card-in-hand a.card');
      const decks = page.locator('ul.decks li.deck:not(.unavailable-card) a.card');
      const choices = page.locator('ul.choices li a[data-choice]');
      if (await decks.count() || await hand.count()) {
        if (g === 0 && !shotsTaken.main && q.time >= 2) { await shot('03_main_hand', true); shotsTaken.main = true; }
        if (g === 0 && !shotsTaken.shadow && q.time >= 30) {
          await page.click('#shadow_tab'); await page.waitForTimeout(100); await shot('06_shadow_tab'); await page.click('#main_tab'); shotsTaken.shadow = true;
        }
        if (g === 0 && !shotsTaken.finale && q.finale) { await shot('07_finale_hand', true); shotsTaken.finale = true; }
        const nh = await hand.count();
        if (nh < 3 && await decks.count()) { await decks.nth(Math.floor(Math.random() * await decks.count())).click(); continue; }
        if (nh) { await hand.nth(Math.floor(Math.random() * nh)).click(); continue; }
      }
      const n = await choices.count();
      if (n) {
        // avoid undo where possible
        let idx = Math.floor(Math.random() * n);
        const txt = (await choices.nth(idx).innerText()).toLowerCase();
        if (/put this card back|^back\.$/.test(txt) && n > 1) idx = (idx + 1) % n;
        await choices.nth(idx).click();
        continue;
      }
      // pinned cards only? play one
      const pinned = page.locator('ul.pinned-cards li.pinned-card a.card');
      if (await pinned.count()) { await pinned.first().click(); continue; }
      errors.push('stuck with nothing to click at ' + q.scene);
      break;
    }
    const final = await page.evaluate(() => { const Q = dendryUI.dendryEngine.state.qualities; return { ending: Q.ending, date: Q.date_label, time: Q.time }; });
    console.log('game', g, ended ? 'ended' : 'NOT ENDED', JSON.stringify(final), 'steps', steps);
    if (g === 0) { await page.waitForTimeout(300); await shot('08_epilogue', true); }
  }
  console.log('console errors:', errors.length);
  [...new Set(errors)].slice(0, 20).forEach(e => console.log('  ' + e));
  await browser.close();
})();
