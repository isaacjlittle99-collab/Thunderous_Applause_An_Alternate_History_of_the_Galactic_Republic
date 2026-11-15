#!/usr/bin/env node
// Checks the card and event editor's file model against every scene in the game.
//   node tools/check_editor.js [repo]
// 1. Every .dry file reads and writes back byte for byte.
// 2. Every file rewritten in the editor's own layout compiles to exactly the same game.
// 3. Every effects line and condition, rebuilt from its rows, compiles to the same game.
// 4. Simple effects converted to JavaScript behave like the originals.
// 5. A mod made of edited, added and removed passages, spliced into game.json, equals a full compile.
'use strict';

var fs = require('fs');
var path = require('path');

var repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
var M = require(path.join(repo, 'out/html/editor/dry_model.js'));
var TAMod = require(path.join(repo, 'out/html/mod_loader.js'));
var C = require(path.join(repo, 'node_modules/dendrynexus/lib/parsers/compiler.js'));

var failures = 0;
function fail(msg) { failures++; if (failures <= 40) console.log('FAIL ' + msg); }

function walk(dir, list) {
  fs.readdirSync(dir).sort().forEach(function (f) {
    var p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, list); else if (/\.dry$/.test(f)) list.push(p);
  });
  return list;
}
var sources = {};
walk(path.join(repo, 'source'), []).forEach(function (p) {
  sources[path.relative(repo, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8');
});
var scenePaths = Object.keys(sources).filter(function (p) { return /\.scene\.dry$/.test(p); });

function compile(src) {
  var files = Object.keys(src).map(function (n) { return {name: n, contents: src[n]}; });
  return new Promise(function (resolve, reject) {
    C.compileGame(files, function (err, g) {
      if (err) return reject(err);
      C.convertGameToJSON(g, null, function (e2, json) { if (e2) return reject(e2); resolve(JSON.parse(json)); });
    });
  });
}

function squash(scene) { return JSON.stringify(scene).replace(/\\n/g, '').replace(/\s+/g, ''); }

function compare(label, a, b, loose) {
  var n = 0;
  var ids = {};
  Object.keys(a.scenes).forEach(function (k) { ids[k] = 1; });
  Object.keys(b.scenes).forEach(function (k) { ids[k] = 1; });
  Object.keys(ids).forEach(function (id) {
    var x = a.scenes[id], y = b.scenes[id];
    var same = x && y && (loose ? squash(x) === squash(y) : JSON.stringify(x) === JSON.stringify(y));
    if (!same) { n++; if (n <= 5) fail(label + ': scene ' + id + ' differs'); }
  });
  if (JSON.stringify(sortTags(a.tagLookup)) !== JSON.stringify(sortTags(b.tagLookup))) fail(label + ': tag lists differ');
  return n;
}

function sortTags(t) {
  var o = {};
  Object.keys(t || {}).sort().forEach(function (k) { o[k] = Object.keys(t[k]).sort(); });
  return o;
}

(async function main() {
var base = await compile(sources);
console.log('base game: ' + Object.keys(base.scenes).length + ' scenes from ' + scenePaths.length + ' scene files');

// 1. byte-for-byte
var parseErrors = 0;
scenePaths.forEach(function (p) {
  var m = M.parseFile(sources[p]);
  if (m.errors.length) { parseErrors++; fail(p + ': ' + m.errors[0].message); }
  if (M.serializeFile(m) !== sources[p]) fail(p + ': does not round-trip byte for byte');
});
console.log('1. round trip: ' + scenePaths.length + ' files, ' + parseErrors + ' with parse errors');

// 2. canonical layout
var canon = Object.assign({}, sources);
scenePaths.forEach(function (p) {
  var m = M.parseFile(sources[p]);
  m.sections.forEach(function (s) { s.dirty = true; });
  canon[p] = M.serializeFile(m);
});
console.log('2. canonical layout: ' + compare('canonical', base, await compile(canon), false) + ' scenes differ');

// 3. effects and conditions rebuilt from rows
var rebuilt = Object.assign({}, sources);
var counts = {effects: 0, changeRows: 0, codeRows: 0, conds: 0, condRows: 0, rawConds: 0, unchangedDiffer: 0};
scenePaths.forEach(function (p) {
  var m = M.parseFile(sources[p]);
  m.sections.forEach(function (s) {
    s.props.forEach(function (pr) {
      var n = M.normName(pr.name);
      if (n === 'onarrival') {
        var e = M.Effects.parse(pr.value);
        if (M.Effects.serialize(e) !== pr.value) { counts.unchangedDiffer++; fail(p + ' @' + s.id + ': effects do not round-trip unedited: ' + JSON.stringify(pr.value).slice(0, 120)); }
        counts.effects++;
        e.rows.forEach(function (r) { if (r.kind === 'change') { counts.changeRows++; r.dirty = true; } else counts.codeRows++; });
        pr.value = M.Effects.serialize(e);
        s.dirty = true;
      } else if (n === 'viewif' || n === 'chooseif') {
        var c = M.Conditions.parse(pr.value);
        counts.conds++;
        if (c.mode === 'raw') counts.rawConds++; else counts.condRows += c.terms.length;
        pr.value = M.Conditions.serialize(c);
        s.dirty = true;
      }
    });
  });
  rebuilt[p] = M.serializeFile(m);
});
console.log('3. effects: ' + counts.effects + ' lines, ' + counts.changeRows + ' simple rows, ' + counts.codeRows + ' code rows; conditions: ' +
  counts.conds + ' (' + counts.condRows + ' rows, ' + counts.rawConds + ' kept as text); rebuilt game: ' +
  compare('rebuilt', base, await compile(rebuilt), true) + ' scenes differ');

// 4. Dendry effects converted to JavaScript behave the same
var converted = 0, mismatched = 0;
function runCode(code, Q) { new Function('state', 'Q', code).call({}, {}, Q); return Q; }
scenePaths.forEach(function (p) {
  var m = M.parseFile(sources[p]);
  var fileId = path.basename(p).replace(/\.scene\.dry$/, '');
  m.sections.forEach(function (s) {
    var v = M.getProp(s, 'on-arrival');
    if (!v) return;
    var e = M.Effects.parse(v);
    if (e.lang !== 'dendry' || /rand/.test(v)) return;
    var js = M.Effects.toJs(e);
    if (!js) return;
    var sceneId = s.id === null ? fileId : fileId + '.' + s.id;
    var oa = base.scenes[sceneId] && base.scenes[sceneId].onArrival;
    if (!oa) return;
    var jsCode = M.Effects.serialize(js).replace(/^\{!|!\}$/g, '');
    var names = M.qualitiesIn(v);
    for (var trial = 0; trial < 6; trial++) {
      var Q = {};
      names.forEach(function (q, k) { Q[q] = (trial * 7 + k * 3) % 11 - 2; });
      if (trial === 5) names.forEach(function (q) { Q[q] = 0; });
      var a = JSON.stringify(oa.reduce(function (acc, f) { return runCode(f.$code, acc); }, JSON.parse(JSON.stringify(Q))));
      var b = JSON.stringify(runCode(jsCode, JSON.parse(JSON.stringify(Q))));
      if (a !== b) { mismatched++; fail(p + ' @' + s.id + ': JavaScript conversion behaves differently: ' + v + ' => ' + jsCode); break; }
    }
    converted++;
  });
});
console.log('4. conversion to JavaScript: ' + converted + ' effect lines checked, ' + mismatched + ' behave differently');

// 5. a mod spliced into game.json equals a full compile
var modSrc = Object.assign({}, sources);
var mFile = M.parseFile(sources['source/scenes/caucus_affairs/ca_relations.scene.dry']);
var top = mFile.sections[0];
M.setProp(top, 'title', 'Inter-bloc Diplomacy');
M.setBody(top, M.bodyText(top).replace('Which relationship', 'Which friendship'));
var mod = M.findSection(mFile, 'mod');
var me = M.Effects.parse(M.getProp(mod, 'on-arrival'));
me.rows[0].value = '2'; me.rows[0].dirty = true;
M.setProp(mod, 'on-arrival', M.Effects.serialize(me));
// remove the "friendly word" choice and its passage, add a new one
top.options = top.options.filter(function (o) { return o.target !== '@word'; }); top.dirty = true;
M.removeSection(mFile, 'word');
top.options.splice(top.options.length - 1, 0, {target: '@toast', label: 'Raise a toast to the Republic.', props: []});
var toast = M.addSection(mFile, 'toast');
M.setProp(toast, 'subtitle', 'Free. +2 relations with the Independents.');
M.setProp(toast, 'on-arrival', 'ind_relation += 2; mod_toasts += 1');
M.setBody(toast, 'Glasses are raised.');
modSrc['source/scenes/caucus_affairs/ca_relations.scene.dry'] = M.serializeFile(mFile);
modSrc['source/scenes/caucus_affairs/custom_test_card.scene.dry'] = [
  'title: Test Card', 'subtitle: A card made in the editor.', 'is-card: true', 'tags: caucus_affairs',
  'card-image: img/card_routine.svg', 'view-if: custom_test_card_timer <= 0',
  'on-arrival: turn_actions += 1; custom_test_card_timer = 3; last_card_timer = "custom_test_card"', 'new-page: true', '',
  '= Test Card', '', 'Some text.', '', '- @first: Do the thing.', '- @easy_discard', '', '@first',
  'subtitle: −1 political capital.', 'on-arrival: capital -= 1', '', 'It is done.', ''].join('\n');
modSrc['source/scenes/events/recurring/custom_test_event.scene.dry'] = [
  'title: Test Event', 'tags: event', 'view-if: date >= 12', 'max-visits: 1', 'new-page: true', '',
  '= Test Event', '', 'Something happens.', '', '- @ok: Fine.', '', '@ok', 'on-arrival: faith += 1', '', 'Fine.', ''].join('\n');
var modded = await compile(modSrc);
var d = TAMod.diffGames(base, modded);
var spliced = TAMod.applyToGame(JSON.parse(fs.readFileSync(path.join(repo, 'out/game.json'), 'utf8')), d);
var n5 = compare('mod splice', modded, spliced, false);
console.log('5. mod splice: ' + Object.keys(d.scenes).length + ' scenes changed or added, ' + d.removed.length + ' removed, tags ' +
  JSON.stringify(d.tags) + '; ' + n5 + ' scenes differ from a full compile');
if (!d.removed.length || !d.scenes['custom_test_card'] || !d.tags.event || !d.tags.event.custom_test_event) fail('mod splice did not record the expected changes');

console.log(failures ? failures + ' failure(s)' : 'all passed');
process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
