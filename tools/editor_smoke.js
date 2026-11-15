#!/usr/bin/env node
// Browser test of the card and event editor (Playwright, Chromium).
//   node tools/editor_smoke.js [repo] [outdir]
// Build first (npm run build). Opens out/html/editor.html from disk, edits a card, adds and removes choices,
// changes a condition, creates a card and an event, playtests them in the game, switches a card off,
// exports the mod and imports it into a fresh browser, and checks that real saves are never touched.
// With an outdir it also saves screenshots there.
'use strict';

var path = require('path');
var fs = require('fs');
var chromium = require('playwright').chromium;

var repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
var outDir = process.argv[3] ? path.resolve(process.argv[3]) : null;
var EDITOR = 'file://' + path.join(repo, 'out/html/editor.html');
var GAME = 'file://' + path.join(repo, 'out/html/index.html');
var PREFIX = 'Thunderous Applause: An Alternate History of the Galactic Republic_isaacjlittle99-collab, after Autumn Chen_save';

var failures = 0;
function check(ok, msg) {
  console.log((ok ? 'ok   ' : 'FAIL ') + msg);
  if (!ok) failures++;
}

async function openEditor(page, hash) {
  if (page.url().indexOf(EDITOR) === 0) await page.goto('about:blank');
  await page.goto(EDITOR + (hash ? '#' + hash : ''));
  await page.waitForFunction(function () { return window.TA_EDITOR_READY; }, null, {timeout: 30000});
}

// Set an input's value as a person would, by id-less search inside the pane.
async function setField(page, fn, arg) { return page.evaluate(fn, arg); }

function typeInto(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', {bubbles: true}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
}

async function save(page) {
  await page.click('#btn-save');
  await page.waitForFunction(function () { return document.getElementById('btn-save') && document.getElementById('btn-save').textContent === 'Saved'; }, null, {timeout: 30000});
}

async function mod(page) { return page.evaluate(function () { return JSON.parse(localStorage.getItem('ta_mod') || 'null'); }); }

async function playtest(page) {
  await page.click('#btn-playtest');
  await page.waitForSelector('#dlg-playtest[open]');
  if (outDir) await shot(page, 'editor_playtest_dialog');
  await Promise.all([page.waitForURL(/index\.html\?playtest=1/), page.click('#pt-go')]);
  await page.waitForFunction(function () { return window.dendryUI && window.dendryUI.dendryEngine && window.dendryUI.dendryEngine.state; }, null, {timeout: 30000});
  await page.waitForTimeout(400);
}

async function gameText(page) { return page.evaluate(function () { return document.getElementById('content').innerText; }); }
async function Qv(page, q) { return page.evaluate(function (k) { return window.dendryUI.dendryEngine.state.qualities[k]; }, q); }
async function choose(page, label) {
  var link = page.locator('#content a', {hasText: label}).first();
  await link.click();
  await page.waitForTimeout(400);
}
async function shot(page, name) {
  if (!outDir) return;
  await page.screenshot({path: path.join(outDir, name + '.png')});
}

(async function main() {
  if (outDir) fs.mkdirSync(outDir, {recursive: true});
  var browser = await chromium.launch();
  var ctx = await browser.newContext({viewport: {width: 1360, height: 900}, deviceScaleFactor: outDir ? 2 : 1, acceptDownloads: true});
  var page = await ctx.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', function (d) { d.accept(); });

  // 0. a real save that must survive everything
  await openEditor(page);
  await page.evaluate(function (pre) { localStorage.setItem(pre + '_0', '{"real":"save"}'); localStorage.setItem(pre + '_timestamp_0', 'then'); }, PREFIX);

  // 1. the in-browser compile matches game.json
  var gameJson = fs.readFileSync(path.join(repo, 'out/game.json'), 'utf8');
  var same = await page.evaluate(function (ref) {
    var a = window.TAEditor.state.baseGame, b = JSON.parse(ref);
    var n = 0;
    for (var k in b.scenes) if (JSON.stringify(a.scenes[k]) !== JSON.stringify(b.scenes[k])) n++;
    return n + Math.abs(Object.keys(a.scenes).length - Object.keys(b.scenes).length);
  }, gameJson);
  check(same === 0, 'the editor compiles the game exactly as the build does (' + same + ' scenes differ)');
  if (outDir) await shot(page, 'editor_welcome');

  // 2. edit the relations card: text, an effect, a condition; add and remove a choice
  await openEditor(page, 'ca_relations');
  await page.evaluate(function () {
    var ta = document.querySelector('#pane textarea.prose');
    ta.value = ta.value.replace('Which relationship', 'Which friendship');
    ta.dispatchEvent(new Event('input', {bubbles: true}));
    // the Core Moderates choice costs 2 capital instead of 1
    var first = document.querySelectorAll('#pane .choice')[0];
    var rows = first.querySelectorAll('.effects-editor .row');
    for (var i = 0; i < rows.length; i++) {
      var q = rows[i].querySelector('input.q');
      if (q && q.value === 'capital') { var v = rows[i].querySelector('input.v'); v.value = '2'; v.dispatchEvent(new Event('input', {bubbles: true})); }
    }
    // the card can be drawn one turn earlier
    var cond = document.querySelector('#pane .cond-editor .row input.v');
    cond.value = '1';
    cond.dispatchEvent(new Event('input', {bubbles: true}));
  });
  if (outDir) await shot(page, 'editor_card_form');
  await save(page);
  var m = await mod(page);
  check(m && m.files['source/scenes/caucus_affairs/ca_relations.scene.dry'], 'the edited card is stored in the mod');
  check(m && m.errors.length === 0, 'no problems after saving (' + JSON.stringify(m && m.errors) + ')');
  check(m && m.scenes['ca_relations.mod'] && /\- 2/.test(JSON.stringify(m.scenes['ca_relations.mod'].onArrival)), 'the changed cost is compiled');
  check(m && m.scenes['ca_relations'] && /<= 1|<=1/.test(JSON.stringify(m.scenes['ca_relations'].viewIf)), 'the changed condition is compiled');

  await page.evaluate(function () {
    var choices = document.querySelectorAll('#pane section.block');
    var block = Array.prototype.filter.call(choices, function (b) { return /^Choices/.test(b.querySelector('h3').textContent); })[0];
    var tools = block.querySelector(':scope > .choices > .row-tools');
    tools.querySelector('input').value = 'Raise a toast to the Republic.';
    tools.querySelector('button').click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(function () {
    var heads = document.querySelectorAll('#pane .choice');
    var box = Array.prototype.filter.call(heads, function (c) { var l = c.querySelector('input.label'); return l && l.value === 'Raise a toast to the Republic.'; })[0];
    box.querySelector('.effects-editor .row-tools button').click();
  });
  await page.waitForTimeout(100);
  await page.evaluate(function () {
    var heads = document.querySelectorAll('#pane .choice');
    var box = Array.prototype.filter.call(heads, function (c) { var l = c.querySelector('input.label'); return l && l.value === 'Raise a toast to the Republic.'; })[0];
    var row = box.querySelector('.effects-editor .row');
    var q = row.querySelector('input.q'); q.value = 'ind_relation'; q.dispatchEvent(new Event('input', {bubbles: true}));
    var v = row.querySelector('input.v'); v.value = '2'; v.dispatchEvent(new Event('input', {bubbles: true}));
    // remove "A friendly word in the corridors."
    var word = Array.prototype.filter.call(heads, function (c) { var l = c.querySelector('input.label'); return l && /friendly word/.test(l.value); })[0];
    word.querySelector('.choice-head button.danger').click();
  });
  await page.waitForTimeout(200);
  await save(page);
  m = await mod(page);
  var toastId = Object.keys(m.scenes).filter(function (k) { return /^ca_relations\.raise_a_toast/.test(k); })[0];
  check(!!toastId && /ind_relation/.test(JSON.stringify(m.scenes[toastId].onArrival)), 'the new choice and its effect are compiled (' + toastId + ')');
  check(m.removed.indexOf('ca_relations.word') >= 0, 'the removed choice is gone from the game');
  check(m.errors.length === 0, 'still no problems');

  // 3. playtest it
  await playtest(page);
  var txt = await gameText(page);
  check(/Which friendship/.test(txt), 'the playtest shows the edited text');
  check(await page.evaluate(function () { return /_playtest$/.test(window.dendryUI.save_prefix) && /Playtest/.test(document.getElementById('mod-banner').textContent); }),
    'a playtest saves to its own slots and says so');
  check(/Raise a toast/.test(txt) && !/friendly word/.test(txt), 'the playtest shows the added choice and not the removed one');
  if (outDir) await shot(page, 'game_playtest');
  check(await page.evaluate(function () {
    var Q = window.dendryUI.dendryEngine.state.qualities;
    return Q.mod_name === SW.BLOC_DEFAULT_NAMES.mod && Q.modded_with && !/\ba mod\b/.test(document.body.innerText);
  }), 'the mod leaves the game\'s own names alone (the Core Moderates are still the ' + (await Qv(page, 'mod_name')) + ')');
  var cap0 = await Qv(page, 'capital');
  await choose(page, 'The Core Moderates.');
  var cap1 = await Qv(page, 'capital');
  check(cap0 - cap1 === 2, 'choosing the Moderates costs 2 capital (' + cap0 + ' → ' + cap1 + ')');

  // 4. a new card and a new event, playtested
  await openEditor(page);
  await page.click('#new-card');
  await page.fill('#new-title', 'Test Card');
  await page.click('#dlg-new button[value=create]');
  await page.waitForFunction(function () { return /Test Card/.test((document.getElementById('pane-title') || {}).textContent || ''); }, null, {timeout: 30000});
  if (outDir) await shot(page, 'editor_new_card');
  m = await mod(page);
  var cardPath = Object.keys(m.files).filter(function (p) { return /custom_test_card/.test(p); })[0];
  check(!!cardPath && m.scenes.custom_test_card && m.tags.caucus_affairs && m.tags.caucus_affairs.custom_test_card === 1, 'the new card is in the Caucus Affairs deck');
  check(m.timers.indexOf('custom_test_card') >= 0, 'its cooldown is registered');
  await playtest(page);
  check(/Describe the situation the Caucus faces/.test(await gameText(page)), 'the new card plays in the game');
  cap0 = await Qv(page, 'capital');
  await choose(page, 'The first choice.');
  check(cap0 - (await Qv(page, 'capital')) === 1 && (await Qv(page, 'custom_test_card_timer')) === 3, 'its first choice costs 1 capital and starts its cooldown');

  await openEditor(page);
  await page.click('#new-event');
  await page.fill('#new-title', 'Test Event');
  await page.click('#dlg-new button[value=create]');
  await page.waitForFunction(function () { return /Test Event/.test((document.getElementById('pane-title') || {}).textContent || ''); }, null, {timeout: 30000});
  m = await mod(page);
  check(m.tags.event && m.tags.event.custom_test_event === 1, 'the new event joins the event list');
  await playtest(page);
  var faith0 = await Qv(page, 'faith');
  check(/Describe what happens/.test(await gameText(page)), 'the new event plays in the game');
  await choose(page, 'The first response.');
  check((await Qv(page, 'faith')) - faith0 === 1, 'its first response raises faith by 1');

  // 5. switch a card off
  await openEditor(page, 'ca_routine');
  await page.click('#btn-toggle');
  m = await mod(page);
  check(m.disabled.indexOf('ca_routine') >= 0, 'the card is switched off in the mod');
  await page.goto(GAME);
  await page.waitForFunction(function () { return window.dendryUI && window.dendryUI.dendryEngine; });
  var g = await page.evaluate(function () {
    var e = window.dendryUI.dendryEngine;
    return {
      off: e.game.scenes.ca_routine.viewIf(e.state, e.state.qualities),
      modded: /friendship/.test(JSON.stringify(e.game.scenes.ca_relations.content)),
      banner: document.getElementById('mod-banner').textContent
    };
  });
  check(g.off === false, 'a switched-off card can never be drawn');
  check(g.modded && /Modded/.test(g.banner), 'the game is played with the mod and says so');

  // 6. without the mod
  await page.goto(GAME + '?nomod');
  await page.waitForFunction(function () { return window.dendryUI && window.dendryUI.dendryEngine; });
  check(!(await page.evaluate(function () { return /friendship/.test(JSON.stringify(window.dendryUI.game.scenes.ca_relations.content)); })), '?nomod plays the original game');
  await openEditor(page);
  await page.click('#mod-enabled');
  await page.goto(GAME);
  await page.waitForFunction(function () { return window.dendryUI && window.dendryUI.dendryEngine; });
  check(!(await page.evaluate(function () { return /friendship/.test(JSON.stringify(window.dendryUI.game.scenes.ca_relations.content)); })), 'with the mod switched off the game is the original');
  await openEditor(page);
  await page.click('#mod-enabled');

  // 7. export, then import into a fresh browser
  await page.fill('#mod-name', 'Smoke Test Mod');
  var dl = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  var file = path.join(outDir || require('os').tmpdir(), 'smoke-test-mod.tamod.json');
  await dl[0].saveAs(file);
  var exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(Object.keys(exported.files).length === 3 && exported.name === 'Smoke Test Mod', 'the export holds the 3 files and the name');
  var ctx2 = await browser.newContext({viewport: {width: 1360, height: 900}});
  var page2 = await ctx2.newPage();
  page2.on('pageerror', function (e) { errors.push('fresh: ' + e.message); });
  page2.on('console', function (mm) { if (mm.type() === 'error') errors.push('fresh: ' + mm.text()); });
  await openEditor(page2);
  await page2.setInputFiles('#import-file', file);
  await page2.waitForSelector('#dlg-import[open]');
  await page2.click('#dlg-import button[value=replace]');
  await page2.waitForFunction(function () { var m = JSON.parse(localStorage.getItem('ta_mod') || 'null'); return m && m.name === 'Smoke Test Mod' && Object.keys(m.scenes || {}).length; }, null, {timeout: 30000});
  var m2 = await mod(page2);
  m = await mod(page);
  check(JSON.stringify(m2.scenes) === JSON.stringify(m.scenes) && JSON.stringify(m2.disabled) === JSON.stringify(m.disabled), 'the imported mod compiles to the same game');
  await ctx2.close();

  // 8. real saves untouched
  var saves = await page.evaluate(function (pre) {
    return {slot: localStorage.getItem(pre + '_0'), auto: localStorage.getItem(pre + '_a0')};
  }, PREFIX);
  check(saves.slot === '{"real":"save"}' && !saves.auto, 'real saves are untouched by playtests');

  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await browser.close();
  console.log(failures ? failures + ' failure(s)' : 'all passed');
  process.exit(failures ? 1 : 0);
}()).catch(function (e) { console.error(e); process.exit(1); });
