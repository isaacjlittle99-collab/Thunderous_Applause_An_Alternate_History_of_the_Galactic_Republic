// Headless playthrough harness for Thunderous Applause.
// Usage: node sim.js <repo> [games=200] [policy=random|reform|passive] [seed=1] [verbose]
const path = require('path');
const fs = require('fs');
const repo = process.argv[2];
const GAMES = +(process.argv[3] || 200);
const POLICY = process.argv[4] || 'random';
let SEED = +(process.argv[5] || 1);
const VERBOSE = process.argv[6] === 'verbose';

globalThis.window = undefined;
// seeded Math.random (mulberry32)
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rng = mulberry(SEED);
Math.random = () => rng();

const SW = require(path.join(repo, 'out/html/sw.js'));
globalThis.SW = SW;
const engineLib = require(path.join(repo, 'node_modules/dendrynexus/lib/engine.js'));
const json = fs.readFileSync(path.join(repo, 'out/game.json'), 'utf8');

const errors = [];
const origLog = console.log;
console.log = function () {
  const s = Array.from(arguments).map(String).join(' ');
  if (s.startsWith('Error')) errors.push(s.slice(0, 300) + ' @' + (curEngine && curEngine.state.sceneId));
};
let curEngine = null;

function StubUI() { this.choices = null; this.decks = []; this.hand = []; this.pinned = []; this.over = false; }
engineLib.UserInterface.makeParentOf(StubUI);
StubUI.prototype.beginOutput = function () { this.choices = null; this.decks = []; this.hand = []; this.pinned = []; };
StubUI.prototype.displayChoices = function (c) { this.choices = c; };
StubUI.prototype.displayDecks = function (d) { this.decks = d; };
StubUI.prototype.displayHand = function (h) { this.hand = h; };
StubUI.prototype.displayPinnedCards = function (p) { this.pinned = p; };
StubUI.prototype.displayGameOver = function () { this.over = true; };

// preference weights for the "reform" policy: substrings of choice ids
const REFORM_PREFS = [
  ['oversight', 6], ['sunset', 6], ['terms', 5], ['guard', 4], ['investigate', 4], ['money', 3], ['slicer', 2], ['share', 3],
  ['pact', 4], ['form', 4], ['train', 3], ['enfranchise', 5], ['rim', 3], ['abolition', 4], ['slavery', 3], ['shmi', 5], ['relief', 3],
  ['ethics', 4], ['warrant', 5], ['emergency_warrant', 4], ['expose', 4], ['shelter', 6], ['chips', 6], ['citizenship', 3], ['inspect', 3],
  ['crossbloc', 3], ['alarm', 2], ['vonc', 1], ['jedi', 2], ['hunt', 3], ['visit', 2], ['anakin', 4], ['restore', 6], ['standdown', 6],
  ['walkout', 6], ['powers_no', 3], ['judicials', 2], ['channel', 2], ['talks', 2], ['compact', 4], ['trial', 3], ['prosecute', 2],
  ['run', 4], ['court_mod', 3], ['court_ind', 3], ['el_join', 4], ['el_chair', 4], ['el_coal', 3], ['confront', 3], ['campaign', 2],
  ['contributions', 2], ['grassroots', 2], ['defend', 2], ['accept', 1], ['senate', 2], ['army', 2], ['delegation', 3], ['present', 4],
  ['discipline', 2], ['concede', 2], ['convention', 1], ['advisors', 2], ['oppose', 2], ['amend', 2], ['networks', 2], ['holonet', 2]
];
function weightFor(id) {
  if (POLICY !== 'reform') return 1;
  let w = 1;
  for (const [k, v] of REFORM_PREFS) if (id.indexOf(k) >= 0) w = Math.max(w, v);
  if (id.indexOf('easy_discard') >= 0 || id.indexOf('go_back') >= 0) w = 0.05;
  return w;
}
function pick(list, idf) {
  if (POLICY === 'passive') {
    // passive: never court, campaign or spend; otherwise random
    const cheap = list.filter(x => !/court|attack|_run$|el_run|campaign/.test(idf(x)));
    const tally = list.find(x => idf(x).indexOf('el_tally') >= 0);
    if (tally) return tally;
    const pool = cheap.length ? cheap : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const ws = list.map(x => weightFor(idf(x)));
  const tot = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

function playOne(gameIndex) {
  return new Promise((resolve) => {
    engineLib.convertJSONToGame(json, function (err, game) {
      if (err) throw err;
      const ui = new StubUI();
      const eng = new engineLib.DendryEngine(ui, game);
      curEngine = eng;
      eng.beginGame([gameIndex * 7919 + SEED]);
      const Q = eng.state.qualities;
      let steps = 0, stuck = 0, lastTime = -1, sameTimeSteps = 0;
      const trace = {capital: {}, chancellors: [], enfranchisedAt: null, maxDissent: 0, cardPlays: {}};
      let lastChancellor = Q.chancellor;
      const visits = {};
      while (!eng.isGameOver() && steps < 6000) {
        steps++;
        const sc = eng.getCurrentScene();
        visits[eng.state.sceneId] = (visits[eng.state.sceneId] || 0) + 1;
        if (Q.time && trace.capital[Q.time] === undefined) trace.capital[Q.time] = Q.capital;
        if (Q.chancellor !== lastChancellor) { trace.chancellors.push(Q.bby + ':' + Q.chancellor_bloc + (process.env.TRACE ? '[fell' + (Q.govt_fell||0) + ' rc' + Q.rc_r + ' pal' + Q.pal_r + ' mod' + Q.mod_r + ' faith' + Math.round(Q.faith) + ' corr' + Math.round(Q.corruption) + ']' : '')); lastChancellor = Q.chancellor; }
        if (Q.rim_enfranchised && trace.enfranchisedAt === null) trace.enfranchisedAt = Q.date;
        trace.maxDissent = Math.max(trace.maxDissent, Q.inst_dissent || 0, Q.rimward_dissent || 0, Q.pacifist_dissent || 0, Q.hawk_dissent || 0);
        if (game.scenes[eng.state.sceneId] && game.scenes[eng.state.sceneId].isCard) trace.cardPlays[eng.state.sceneId] = (trace.cardPlays[eng.state.sceneId] || 0) + 1;
        if (Q.time === lastTime) sameTimeSteps++; else { sameTimeSteps = 0; lastTime = Q.time; }
        if (sameTimeSteps > 400) { resolve({stuck: 'loop at ' + eng.state.sceneId, Q, steps, visits}); return; }
        if (sc.isHand) {
          const hand = eng.state.currentHands[eng.state.sceneId] || [];
          const decks = (eng.getCurrentChoices() || []).filter(c => game.scenes[c.id].isDeck && c.canChoose);
          const pinned = (eng.getCurrentChoices() || []).filter(c => game.scenes[c.id].isPinnedCard);
          const usablePinned = pinned.filter(c => (c.id.indexOf('shuffle') >= 0) ? Math.random() < 0.15 : Q.advisor_action_timer <= 0);
          if (usablePinned.length && Math.random() < (POLICY === 'passive' ? 0 : 0.35)) { eng.playPinnedCard(pick(usablePinned, c => c.id).id); continue; }
          if (hand.length < sc.maxCards && decks.length && (hand.length === 0 || Math.random() < 0.6)) {
            const d = pick(decks, c => c.id);
            const res = eng.drawCard(d.id);
            if (res && res.id) continue;
          }
          if (POLICY === 'passive') {
            const routine = hand.find(c => c.id === 'ca_routine');
            if (routine) { eng.playCard('ca_routine'); continue; }
            const dk = decks.find(d => d.id.indexOf('caucus') >= 0) || decks[0];
            if (hand.length < sc.maxCards && dk) { const res = eng.drawCard(dk.id); if (res && res.id) continue; }
            if (hand.length) { eng.playCard(hand[0].id); continue; }
          }
          if (hand.length) { eng.playCard(pick(hand, c => c.id).id); continue; }
          resolve({stuck: 'empty hand, no decks at ' + eng.state.sceneId, Q, steps, visits});
          return;
        }
        const choices = (eng.getCurrentChoices() || []).map((c, i) => ({c, i})).filter(x => x.c.canChoose);
        if (!choices.length) { resolve({stuck: 'no choices at ' + eng.state.sceneId, Q, steps, visits}); return; }
        // avoid undo and back in automated play
        let pool = choices.filter(x => x.c.id !== 'easy_discard' && x.c.id !== 'go_back');
        if (!pool.length) pool = choices;
        const ch = pick(pool, x => x.c.id);
        eng.choose(ch.i);
      }
      resolve({stuck: eng.isGameOver() ? null : 'step limit at ' + eng.state.sceneId, Q, steps, visits, trace});
    });
  });
}

(async function () {
  const endings = {}, stucks = {}, nanKeys = {};
  const stats = {pal_chancellor_32: 0, war: 0, finale: 0, turns: 0, empire_powers: 0, kamino_early: 0, chips: 0, rc_chancellor: 0, reforms: 0};
  const seen = {}; const paths = {};
  const audit = {cap20: [], cap40: [], capEnd: [], rcWon32: 0, rcWon32ThenPal: 0, rcHeldToEnd: 0, enf: 0, enfSeceded: [], enfWar: 0, maxDissent: [], repeatCards: {}};
  for (let g = 0; g < GAMES; g++) {
    rng = mulberry(SEED * 1000 + g);
    const r = await playOne(g);
    const Q = r.Q;
    if (r.stuck) { stucks[r.stuck] = (stucks[r.stuck] || 0) + 1; }
    const e = Q.ending || (r.stuck ? 'STUCK' : 'none');
    endings[e] = (endings[e] || 0) + 1;
    for (const k in Q) { const v = Q[k]; if (typeof v === 'number' && isNaN(v)) nanKeys[k] = (nanKeys[k] || 0) + 1; }
    if (Q.pal_was_chancellor) stats.pal_chancellor_32++;
    if (Q.geonosis_seen) stats.war++;
    if (Q.finale) stats.finale++;
    if (Q.kamino_early) stats.kamino_early++;
    if (Q.chips_removed) stats.chips++;
    if (Q.rc_was_chancellor) stats.rc_chancellor++;
    stats.reforms += Q.emergency_sunset + Q.term_limits_protected + Q.army_oversight + Q.senate_guard_reformed + Q.jedi_independence + Q.banking_independent + Q.rim_enfranchised + Q.anti_corruption;
    stats.turns += Q.time;
    const tag = [Q.gambit ? 'gambit:' + Q.gambit_kind : 'canon', Q.known_by ? 'known:' + Q.known_by : '', Q.arrest_result ? 'arrest:' + Q.arrest_result : '',
      Q.sidious_method ? 'method:' + Q.sidious_method : '', Q.civil_war_result ? 'cw:' + Q.civil_war_result : '', Q.order66 ? 'o66' : '', Q.restoration_passed ? 'restored' : '', Q.finale ? 'af:' + Math.round(Q.anakin_fall) + ' sc:' + (Q.arrest_score||'-') + ' ev:' + Math.round(Q.evidence) + ' js:' + Math.round(Q.jedi_suspicion) : ''].filter(x => x).join(' ');
    paths[e + ' | ' + tag] = (paths[e + ' | ' + tag] || 0) + 1;
    for (const k in r.visits) seen[k] = 1;
    if (r.trace) {
      const t = r.trace;
      if (t.capital[20] !== undefined) audit.cap20.push(t.capital[20]);
      if (t.capital[40] !== undefined) audit.cap40.push(t.capital[40]);
      audit.capEnd.push(Q.capital);
      const first = t.chancellors.find(c => !c.startsWith('33:') ) || '';
      const ch = t.chancellors.filter(c => !c.startsWith('33:'));
      if (ch.length && ch[0].endsWith(':rc')) {
        audit.rcWon32++;
        if (ch.slice(1).some(c => c.endsWith(':pal'))) audit.rcWon32ThenPal++;
        if (Q.chancellor_bloc === 'rc') audit.rcHeldToEnd++;
      }
      if (t.enfranchisedAt !== null && t.enfranchisedAt < 132) { audit.enf++; audit.enfSeceded.push(Q.seceded_total); if (Q.geonosis_seen) audit.enfWar++; audit.enfWhere = audit.enfWhere || {}; const w = (Q.secession_where || 'none') + ' o' + Math.round(Q.outer_sep) + ' m' + Math.round(Q.midrim_sep) + ' c' + Math.round(Q.corporate_sep); audit.enfWhere[w] = 1; }
      if (process.env.TRACE && ch.length && ch[0].indexOf(':rc') >= 0) origLog('trace', g, JSON.stringify(t.chancellors));
      audit.maxDissent.push(t.maxDissent);
      for (const c in t.cardPlays) if (t.cardPlays[c] >= 6) audit.repeatCards[c] = (audit.repeatCards[c] || 0) + 1;
    }
    if (VERBOSE) origLog(g, e, Q.date_label, 'steps', r.steps, r.stuck || '', 'ep', Q.emergency_powers, 'ev', Q.evidence.toFixed(1), 'gp', Math.round(Q.grand_plan), 'rc', Q.rc_r, 'pal', Q.pal_r, 'ch', Q.chancellor);
  }
  origLog('policy', POLICY, 'games', GAMES);
  origLog('endings', JSON.stringify(endings));
  origLog('stuck', JSON.stringify(stucks));
  origLog('NaN qualities', JSON.stringify(nanKeys));
  origLog('stats', JSON.stringify(Object.assign(stats, {turns: (stats.turns / GAMES).toFixed(1), reforms: (stats.reforms / GAMES).toFixed(2)})));
  const errCount = {};
  for (const e of errors) { const k = e.slice(0, 160); errCount[k] = (errCount[k] || 0) + 1; }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  origLog('audit: capital at turn 20 avg ' + avg(audit.cap20) + ', turn 40 avg ' + avg(audit.cap40) + ', end avg ' + avg(audit.capEnd) + ', end max ' + Math.max(...audit.capEnd));
  origLog('audit: Caucus won first election ' + audit.rcWon32 + 'x; Palpatine later Chancellor in ' + audit.rcWon32ThenPal + '; Caucus still Chancellor at end ' + audit.rcHeldToEnd);
  if (audit.enfWhere) origLog('audit: enfranchised games, where/sep: ' + Object.keys(audit.enfWhere).slice(0, 12).join(' | '));
  origLog('audit: enfranchised before 22 BBY in ' + audit.enf + ' games; avg seceded ' + avg(audit.enfSeceded) + '%; war in ' + audit.enfWar);
  origLog('audit: avg peak faction dissent ' + avg(audit.maxDissent) + '; cards played 6+ times (games): ' + JSON.stringify(audit.repeatCards));
  origLog('paths:'); Object.keys(paths).sort((a, b) => paths[b] - paths[a]).slice(0, 18).forEach(k => origLog('  ' + paths[k] + 'x ' + k));
  origLog('errors', Object.keys(errCount).length);
  for (const k of Object.keys(errCount).slice(0, 25)) origLog('  ' + errCount[k] + 'x ' + k);
  
})();
