// Render every card and event under five kinds of government and report text that does not fit.
//
// Usage: node tools/state_sweep.js <repo>
//
// Each scene is opened in the engine (whether or not it would fire in that state, so its own conditions are
// checked separately) with the Caucus as Chancellor, in Palpatine's government, in a Moderate government, and in
// opposition to each. It reports:
//   - raw template text, "undefined" or "NaN" in what the player would read;
//   - empty option labels;
//   - opposition-style options (attacking or warning about the Chancellery) visible while the Caucus governs,
//     in scenes that could fire then;
//   - text treating the Chancellery as someone else's while the Caucus holds it;
//   - Palpatine's bloc name used as if it were a person;
//   - "Chancellor Palpatine" while he does not hold office.
// Exit status is 1 when anything is found. ALLOW lists institutional wording that is right in every state.
'use strict';
const fs = require('fs');
const path = require('path');
const repo = path.resolve(process.argv[2] || '.');
globalThis.window = undefined;
const SW = require(path.join(repo, 'out/html/sw.js')); globalThis.SW = SW;
require(path.join(repo, 'out/html/sw_ui.js'));
const E = require(path.join(repo, 'node_modules/dendrynexus/lib/engine.js'));
const out = (s) => process.stdout.write(s + '\n');
console.log = () => {};
function UI() {}
E.UserInterface.makeParentOf(UI);
const flat0 = (c) => Array.isArray(c) ? c.map(flat0).join(' ') : (typeof c === 'string' ? c : (c && c.content !== undefined ? flat0(c.content) : ''));
const flat = (c) => flat0(c).replace(/\s+/g, ' ').replace(/ ([.,;:!?])/g, '$1');
SW.rnd = () => 0.5;

const GOVS = {
  'the Caucus holds the Chancellery': Q => { Q.chancellor_bloc = 'rc'; Q.chancellor = 'Bail Organa'; SW.setGovt(Q, ['rc', 'mod', 'ind']); },
  'the Caucus in Palpatine\'s government': Q => { Q.chancellor_bloc = 'pal'; Q.chancellor = 'Palpatine'; SW.setGovt(Q, ['pal', 'rc', 'mod']); },
  'the Caucus in a Moderate government': Q => { Q.chancellor_bloc = 'mod'; Q.chancellor = 'Davan Quill'; SW.setGovt(Q, ['mod', 'rc', 'ind']); },
  'opposition under Palpatine': Q => { Q.chancellor_bloc = 'pal'; Q.chancellor = 'Palpatine'; SW.setGovt(Q, ['pal', 'sec', 'guild']); },
  'opposition under a Moderate': Q => { Q.chancellor_bloc = 'mod'; Q.chancellor = 'Davan Quill'; SW.setGovt(Q, ['mod', 'sec', 'guild']); }
};
const GOVERNING = ['the Caucus holds the Chancellery', 'the Caucus in Palpatine\'s government', 'the Caucus in a Moderate government'];
const OPPOSITION = /Chancellery's neglect|executive overreach|Warn of overreach|The Chancellery itself|Answer the Chancellor's|Confronting the Chancellery|no confidence in the Chancellor/i;
const RAW = /\[\+|\?\]|\[\?|\bundefined\b|\bNaN\b/;
const PERSON = /(Chommell Circle|Chancellor's Bloc) (as a|is a|who |praises|says)|(of|into|with|hand of) (Chommell Circle|Chancellor's Bloc)/;
const ALLOW = [
  /Entrench the Chancellor's term limit/, /under the Chancellor's authority/, /independence from the Chancellery/, /seizing control of the banks/,
  /answer to the Senate, not the Chancellor/, /Old Chancellery networks/, /holds the Chancellery/, /Chancellery district/
];
// scenes whose own conditions are not checked here: menus, guides, endings and the finale (where Palpatine holds office)
const SKIP = /^(root|library|credits|ending_slides|game_over|status|status_right|main|post_event|events_choice|ending_router|a1_|fin_)/;

// the view-if of each scene, as written, for judging scenes that need a trigger the sweep does not set
const VIEW_IF = {};
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.scene.dry')) VIEW_IF[f.replace('.scene.dry', '')] = ((fs.readFileSync(p, 'utf8').match(/^view-if:(.*)$/m) || ['', ''])[1]).trim();
  }
}(path.join(repo, 'source/scenes')));
// does a scene's own condition rule out this kind of government?
function rulesOut(vif, gk, Q) {
  if (/not rc_in_govt/.test(vif) && GOVERNING.indexOf(gk) >= 0) return true;
  if (/not rc_chancellor/.test(vif) && Q.rc_chancellor) return true;
  // a scene that needs Palpatine (or his puppet) in office
  const needsPal = /(^|and )pal_chancellor( and|$)/.test(vif), needsPalOrPuppet = /(^|and )\(pal_chancellor or puppet_chancellor\)/.test(vif);
  if (needsPal && !Q.pal_chancellor) return true;
  if (needsPalOrPuppet && !Q.pal_chancellor && !Q.puppet_chancellor) return true;
  return false;
}

E.convertJSONToGame(fs.readFileSync(path.join(repo, 'out/game.json'), 'utf8'), (err, G) => {
  if (err) throw err;
  const found = {};
  const add = (k, s) => { (found[k] = found[k] || new Set()).add(s); };
  const ids = Object.keys(G.scenes).filter(id => id.indexOf('.') < 0 && !SKIP.test(id));
  for (const gk in GOVS) {
    for (const id of ids) {
      const sc = G.scenes[id], tags = sc.tags || [];
      if (!(sc.isCard || sc.isPinnedCard || tags.indexOf('event') >= 0 || tags.indexOf('last_days') >= 0)) continue;
      const eng = new E.DendryEngine(new UI(), G); eng.beginGame([5]);
      const Q = eng.state.qualities;
      SW.newGame(Q, 0); Q.started = 1; Q.date = 120; Q.bby = 23; Q.time = 40; Q.months_per_turn = 3; Q.elections_held = 2;
      Q.war = 1; Q.war_begins_seen = 1; Q.dooku_movement = 1; Q.cis_formed = 1; Q.kamino_army = 1; Q.clones = 4; Q.emergency_powers = 4;
      Q.anakin_found = 1; Q.evidence = 5; Q.capital = 5; Q.senate_resolve = 4; Q.grand_plan = 50; Q.pal_r = 12;
      Q.hhc_kind = 'core'; // the variant that names Palpatine
      GOVS[gk](Q); SW.everyVisit(Q);
      let firesNow = true;
      try { firesNow = sc.viewIf ? !!sc.viewIf.call(eng, eng.state, Q) : true; } catch (e) { firesNow = true; }
      // a scene that needs a trigger this state lacks (a pirate raid, a warning) is still judged on wording,
      // unless its own condition rules this kind of government out
      const canFire = firesNow || !rulesOut(VIEW_IF[id] || '', gk, Q);
      try { eng.goToScene(id); } catch (e) { add('scene fails to open', id + ' (' + gk + '): ' + String(e.message).slice(0, 120)); continue; }
      const text = flat(eng.state.currentContent || []);
      let opts = [];
      try { opts = (eng.getCurrentChoices() || []).map(c => ({id: c.id, t: flat(c.title), s: flat(c.subtitle || '')})); } catch (e) { add('options fail to render', id + ': ' + e.message); }
      const allowed = (s) => ALLOW.some(re => re.test(s));
      if (firesNow && RAW.test(text)) add('raw template text or undefined', id + ' (' + gk + '): ' + (text.match(/.{0,50}(\[\+|\?\]|\[\?|\bundefined\b|\bNaN\b).{0,40}/) || [''])[0]);
      for (const o of opts) {
        if (firesNow && RAW.test(o.t + ' ' + o.s)) add('raw template text or undefined in an option', o.id + ' (' + gk + '): ' + o.t + ' | ' + o.s);
        if (!o.t.trim()) add('empty option label', o.id + ' (' + gk + ')');
        if (canFire && GOVERNING.indexOf(gk) >= 0 && OPPOSITION.test(o.t + ' ' + o.s) && !allowed(o.t + ' ' + o.s)) add('opposition-style option while the Caucus governs', o.id + ' (' + gk + '): ' + o.t);
      }
      if (canFire && GOVERNING.indexOf(gk) >= 0 && OPPOSITION.test(text) && !allowed(text)) add('opposition-style text while the Caucus governs', id + ' (' + gk + '): ' + (text.match(new RegExp('.{0,50}(' + OPPOSITION.source + ').{0,40}', 'i')) || [''])[0]);
      if (canFire && gk === 'the Caucus holds the Chancellery') {
        const m = text.match(/.{0,60}(the Chancellery's (orbit|payroll|finances|neglect|propaganda|people)|dining at the Chancellery|the Chancellor's allies).{0,40}/);
        if (m && !allowed(m[0])) add('the Chancellery treated as someone else\'s while the Caucus holds it', id + ': ' + m[0]);
      }
      if (canFire && PERSON.test(text)) add('a bloc name used as a person', id + ' (' + gk + '): ' + (text.match(/.{0,50}(Chommell Circle|Chancellor's Bloc).{0,40}/) || [''])[0]);
      if (canFire && !Q.pal_chancellor && /\bChancellor Palpatine\b/.test(text)) add('"Chancellor Palpatine" while he does not hold office', id + ' (' + gk + '): ' + (text.match(/.{0,50}Chancellor Palpatine.{0,40}/) || [''])[0]);
    }
  }
  let n = 0;
  for (const k in found) { out('## ' + k + ' (' + found[k].size + ')'); for (const s of found[k]) { out('   ' + s.slice(0, 240)); n++; } }
  out('state sweep: ' + n + ' finding(s) across ' + ids.length + ' scenes and ' + Object.keys(GOVS).length + ' governments');
  process.exitCode = n ? 1 : 0;
});
