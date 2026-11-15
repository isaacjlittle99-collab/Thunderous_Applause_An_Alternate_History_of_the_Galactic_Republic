#!/usr/bin/env node
// Applies a mod exported from the card and event editor to the game's source files.
//   node tools/apply_mod.js my-mod.tamod.json [--dry-run]
// Writes each edited or new card and event into source/scenes/ (only .scene.dry files inside that folder),
// then lists what still needs a person: cards and events the mod switched off, and the new qualities and
// card cooldowns that belong in SW.DEFAULTS / SW.TIMERS (out/html/sw.js). Rebuild afterwards: npm run build.
'use strict';

var fs = require('fs');
var path = require('path');

var args = process.argv.slice(2);
var dry = args.indexOf('--dry-run') >= 0;
var file = args.filter(function (a) { return a !== '--dry-run'; })[0];
if (!file) {
  console.log('Usage: node tools/apply_mod.js my-mod.tamod.json [--dry-run]');
  process.exit(1);
}

var repo = path.resolve(__dirname, '..');
var scenesDir = path.join(repo, 'source', 'scenes');
var mod = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!mod || typeof mod.files !== 'object') {
  console.error('This is not a mod exported from the card and event editor.');
  process.exit(1);
}

console.log('Mod: ' + (mod.name || 'Untitled mod') + (mod.author ? ' by ' + mod.author : ''));
if (mod.notes) console.log('Notes: ' + mod.notes);

var written = 0, skipped = 0;
Object.keys(mod.files).sort().forEach(function (rel) {
  var f = mod.files[rel];
  var target = path.resolve(repo, rel);
  var ok = /^source\/scenes\/[\w\/-]+\.scene\.dry$/.test(rel) && target.indexOf(scenesDir + path.sep) === 0 &&
    f && typeof f.text === 'string';
  if (!ok) {
    console.log('  skipped (not a scene file in source/scenes): ' + rel);
    skipped++;
    return;
  }
  var exists = fs.existsSync(target);
  var note = '';
  if (exists && f.baseHash) {
    var cur = fs.readFileSync(target, 'utf8');
    if (hash(cur) !== f.baseHash) note = '  (the game has changed this file since the mod was made: check the diff)';
    if (cur === f.text) { console.log('  unchanged: ' + rel); return; }
  }
  console.log('  ' + (exists ? 'updated: ' : 'new:     ') + rel + note);
  if (!dry) {
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, f.text);
  }
  written++;
});

if ((mod.disabled || []).length) {
  console.log('\nSwitched off in the mod (delete these, or give them "view-if: false"): ' + mod.disabled.join(', '));
}
if (Object.keys(mod.defaults || {}).length) {
  console.log('New qualities (add to SW.DEFAULTS in out/html/sw.js, starting at 0): ' + Object.keys(mod.defaults).join(', '));
}
if ((mod.timers || []).length) {
  console.log('New card cooldowns (add to SW.TIMERS in out/html/sw.js): ' + mod.timers.map(function (t) { return "'" + t + "'"; }).join(', '));
}
console.log('\n' + (dry ? 'Would write ' : 'Wrote ') + written + ' file(s)' + (skipped ? ', skipped ' + skipped : '') + '.' +
  (dry ? '' : ' Now rebuild with: npm run build'));

// the same hash the editor uses (out/html/editor/dry_model.js)
function hash(text) {
  var h = 2166136261;
  for (var k = 0; k < text.length; k++) { h ^= text.charCodeAt(k); h = (h * 16777619) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8) + ':' + text.length;
}
