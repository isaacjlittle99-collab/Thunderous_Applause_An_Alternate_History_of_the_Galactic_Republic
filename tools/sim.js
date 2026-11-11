// Headless playthrough harness for Thunderous Applause.
// Usage: node sim.js <repo> [games=200] [policy=random|reform|passive] [seed=1] [verbose]
const path = require('path');
const fs = require('fs');
const repo = process.argv[2];
const GAMES = +(process.argv[3] || 200);
// a policy is random, reform, passive or smart; smart:<route> is a careful player committed to one way through the crisis
const POLICY_ARG = process.argv[4] || 'random';
const POLICY = POLICY_ARG.split(':')[0];
const STRAT = POLICY_ARG.split(':')[1] || '';
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
  ['discipline', 2], ['concede', 2], ['convention', 1], ['advisors', 2], ['oppose', 2], ['amend', 2], ['networks', 2], ['holonet', 2],
  ['offer', 3], ['let_decide', 3]
];
// Route strategists: the careful player plus a strong preference for one way through the crisis.
//   keep: keep Palpatine from power (win Chancellor races, move no confidence, never back him)
//   unmask: build the case and lay charges before the Senate
//   peace: end the war through peace channels and a Federal Compact, or turn Count Dooku
const STRATEGIES = {
  keep: [[/el_back_pal$/, () => 0.01], [/\.el_run$/, () => 12], [/\.el_court_\w+$/, () => 6], [/\.el_pledge$/, () => 5], [/\.el_expose$/, () => 12],
    [/\.el_attack_pal$/, Q => Q.evidence >= 5 ? 9 : 0.1], [/\.eb_deal_[ab]$/, null], [/^ca_campaign$/, () => 8], [/^ca_contributions$/, Q => Q.capital <= 2 ? 8 : 1],
    [/^ca_confront$/, () => 7], [/^ca_confront\.vonc$/, Q => Q.pal_chancellor ? 12 : 0.5], [/^ca_confront\.(alarm|crossbloc)$/, Q => Q.senate_resolve < 3 ? 9 : 1],
    [/^sa_constitution$/, () => 9], [/^sa_constitution\.terms$/, () => 14], [/^a3_term_limit\.oppose$/, () => 12], [/^a4_indefinite_term\.oppose$/, () => 12], [/\.el_tally$/, Q => Q.capital >= 1 ? 0.3 : 5], [/\.el_join$/, Q => Q.el_pal_won ? 0.3 : null]],
  unmask: [[/^rec_case_ready\.charges$/, Q => SW.chargesOdds(Q) >= 0.55 ? 30 : 0.5], [/^ca_investigate\.brief$/, () => 15], [/^ca_investigate$/, () => 10], [/^ca_investigate\.charges$/, Q => (Q.dooku_turned || Q.evidence >= 9) ? 60 : (Q.date >= 162 && Q.evidence >= 8 ? 15 : 0.01)],
    [/^ca_investigate\.(money|slicer)$/, () => 6], [/^sa_judiciary$/, () => 9], [/^ca_jedi$/, () => 6]],
  peace: [[/^sa_diplomacy$/, () => 14], [/^sa_diplomacy\.(talks|neutrals)$/, () => 8], [/\.compact$/, () => 20], [/^sa_diplomacy\.recognise$/, () => 0.01],
    [/^ca_peace$/, () => 10], [/^ca_peace\.channel$/, Q => Q.peace_talks < 3 ? 8 : 0.5], [/^a4_war_aims\.peace$/, () => 9], [/\.dialogue$/, () => 6], [/\.grievances$/, () => 6],
    [/^a3_bonteri\.answer$/, () => 9], [/^a1_dooku_leaves\.meet$/, () => 9], [/^a4_dooku_doubt\.accept$/, () => 20], [/^ca_rim$/, () => 5]]
};
function strategyWeight(id, Q) {
  for (const [re, f] of STRATEGIES[STRAT] || []) if (re.test(id)) { if (!f) return null; const w = f(Q); if (w !== null && w !== undefined) return w; }
  return null;
}
// the careful player's choice in each war dilemma
const SMART_DILEMMA = {umbara: 'b', ryloth: 'a', blockade: 'b', mandalore: 'a', levy: 'a', clone_surge: 'b', refugees: 'a', zygerria: 'a', jedi_stretch: 'a', citadel: 'b', bacta: 'a', hydian: 'a'};
// "smart": a careful player who reads the state of the game (used to tune difficulty)
function smartWeight(id, Q) {
  const has = (k) => id === k || id.endsWith('.' + k);
  const W = [
    // never waste a foreseen scheme or a warning
    [/counter_adv$/, Q.advisor_action_timer <= 0 ? 9 : 0], [/counter$/, Q.capital >= 2 ? 8 : 3],
    [/tame$/, 8], [/\.rally$/, Q.capital >= 2 ? 7 : 2], [/\.sunset$/, 9], [/\.purge$/, 7], [/reassure$/, 5],
    // keep the bureaucrats on side
    [/bureau_reform$/, Q.bureau_relation < 45 ? 9 : 1], [/valorum_bureaucracy$|organa_bureau$|antilles_bureau$/, Q.bureau_relation < 35 ? 9 : 0.5],
    [/soothe$/, Q.capital >= 2 ? 5 : 1], [/truce$/, (Q.bureau_relation < 8 || Q.bureau_dossier >= 3) ? 6 : 1], [/valorum_way$/, Q.capital >= 3 ? 4 : 0.5],
    // the arrest plan
    [/\.expose$/, 10], [/\.warrant$/, 9], [/emergency_warrant$/, 6], [/fin_arrest_plan\.jedi$/, 0.3],
    // build the case
    [/^ca_investigate$/, Q.evidence < 10 ? 6 : 1], [/^sa_judiciary$/, 7], [/^sa_constitution$/, Q.senate_resolve >= 3 ? 7 : 3],
    [/^sa_security$/, 6], [/^sa_clones$/, 5], [/^ca_contributions$/, Q.capital <= 1 ? 7 : 1], [/^ca_routine$/, Q.capital <= 0 ? 4 : 0.5],
    [/^ca_rim$/, Q.rim_hardship > 35 ? 5 : 2], [/^ca_jedi$/, 4], [/^ca_confront$/, 3], [/^ca_pact$/, Q.dooku_movement ? 5 : 2],
    [/^ca_peace$/, Q.war ? 5 : 1], [/^ca_relations$/, 3], [/^ca_media$/, 3], [/^sa_rimaffairs$/, 5], [/^sa_finance$/, 4],
    [/^sa_diplomacy$/, Q.war ? 6 : 3],
    // advisors and leadership
    [/let_decide$/, 4], [/\.offer$/, 3], [/^shuffle_leadership$/, (Q.n_advisors || 0) < 3 ? 6 : 0.3],
    // the lore events
    [/labyrinth\.judicials$/, Q.judicial_forces >= 4 ? 6 : 1], [/labyrinth\.council$/, 4], [/hostage_crisis\.measured$/, Q.capital >= 2 ? 5 : 1],
    [/loyalist_committee\.join$/, 4], [/\.scatter$/, 6],
    // the War Council: push the weakest front; sensible war aims and dilemmas
    [/^rec_war_council\.(outer|mid|core)$/, id.endsWith('.' + SW.weakestFront(Q)) ? (Q.wc_command || Q.capital >= 2 ? 7 : 1) : 0.5],
    [/^rec_war_council\.hold$/, 0.5], [/^rec_war_council\.accept$/, 2],
    [/^a4_war_aims\.rim$/, Q.rim_enfranchised ? 6 : 2], [/^a4_war_aims\.peace$/, 4], [/^a4_war_aims\.victory$/, 2],
    [/^war_dilemma\.opt_[ab]$/, (SMART_DILEMMA[Q.wd_id] === id.slice(-1)) ? 6 : 1],
    // the budget
    // vary the revenue to avoid tax fatigue; never let the guilds' patience or our patrons collapse; avoid debasing the credit
    [/^rec_budget\.rev_none$/, Q.treasury >= 4 ? 6 : 0.5],
    [/^rec_budget\.rev_levy$/, (Q.treasury < 4 && !Q.rev_streak_levy && Q.patrons_goodwill >= 40) ? 5 : 0.5],
    [/^rec_budget\.rev_loan$/, (Q.treasury < 2 && Q.debt < 18) ? 4 : 0.3],
    [/^rec_budget\.rev_print$/, Q.treasury < 0.5 && Q.debt >= 25 ? 1 : 0.05],
    [/^rec_budget\.rev_tariffs$/, (!Q.rev_streak_tariffs && Q.guild_patience >= 55 && Q.treasury < 4) ? 4 : 0.5], [/^rec_budget\.rev_bonds$/, Q.faith > 55 ? 4 : 1], [/^rec_budget\.rev_spice$/, 0.5],
    [/^rec_budget\.pri_repay$/, Q.debt > 18 ? 7 : 0.5], [/^rec_budget\.pri_relief$/, Q.rim_hardship > 38 ? 6 : 2], [/^rec_budget\.pri_defence$/, Q.war ? 4 : 1],
    [/^rec_budget\.pri_subsidies$/, 0.5], [/^rec_budget\.pri_none$/, Q.treasury < 2 ? 4 : 0.5],
    [/^rec_budget\.support$/, 4], [/^rec_budget\.oppose$/, 0.5], [/^rec_budget\.amend$/, Q.capital >= 2 ? 3 : 0.2],
    // leaders, debt and markets
    [/^rec_leader_moment\.accept$/, Q.treasury >= (Q.lm_cost || 0) + 1 ? 5 : 1], [/^rec_leader_moment\.refuse$/, 2], [/^rec_leader_moment\.vote$/, 5],
    [/^rec_banking_clan\.refuse$/, Q.debt < 26 ? 4 : 1], [/^rec_banking_clan\.deregulate$/, 1], [/^rec_banking_clan\.seat$/, Q.chair_finance === 'rc' ? 0.3 : 3],
    [/^rec_debt_crisis\.austerity$/, 3], [/^rec_debt_crisis\.bailout$/, 1],
    [/^rec_bacta_crisis\.subsidise$/, 5], [/^rec_bacta_crisis\.requisition$/, 3], [/^rec_tibanna_crisis\.contracts$/, 3], [/^rec_tibanna_crisis\.nationalise$/, 3],
    [/^rec_spice_crisis\.crackdown$/, 5], [/^rec_spice_crisis\.legalise$/, 1], [/^rec_spice_crisis\.look_away$/, 0.2],
    [/^sa_finance\.(patrols|stockpile|refinance)$/, 4],
    // when the guilds push back, concede before it gets to a credit strike; break a blockade if we can
    [/^rec_guild_pressure\.counter_lobby$/, Q.capital >= 2 ? 4 : 1], [/^rec_guild_pressure\.concede_slow$/, 5], [/^rec_guild_pressure\.negotiate_strike$/, 5],
    [/^rec_guild_pressure\.break_blockade$/, 5], [/^rec_guild_pressure\.senate_blockade$/, 2], [/^rec_guild_pressure\.give_in$/, 2],
    [/^rec_core_revolt\.repeal$/, 5], [/^rec_core_revolt\.compensate$/, Q.treasury >= 3 ? 3 : 0.5], [/^rec_credits_refused\.back$/, 5],
    // campaigning: the message that fits the moment; protect a rally only with enough strength
    [/^ca_campaign\.msg_\w+$/, ({strong: 6, solid: 4, weak: 1.5, poor: 0.5, 'may backfire': 0.05})[Q['cm_word_' + id.split('_').pop()]] || 1],
    [/\.protect_judicials$/, (Q.judicial_forces || 0) * 0.9 >= Q.cm_threat ? 6 : 1], [/\.protect_guard$/, 4.5 >= Q.cm_threat ? 7 : 1],
    [/\.protect_local$/, Q.cm_local * 0.9 >= Q.cm_threat ? 5 : 1], [/\.(protect_cancel|cancel)$/, 1.5],
    // the Chancellor race: the nominee who appeals to the biggest blocs; pledges we can keep; expose the money; deal with the non-Palpatine finalist
    [/^rec_chancellor_election\.nom_\w+$/, nomineeWeight(id.replace(/^.*\.nom_/, ''), Q)],
    [/^rec_chancellor_election\.el_pledge$/, 3], [/\.pl_no_powers$/, 5], [/\.pl_no_tariffs$/, (Q.guild_r || 0) >= 8 ? 3 : 1], [/\.pl_no_levy$/, 3],
    [/\.pl_rim_relief$/, Q.rim_hardship > 40 ? 3 : 1], [/\.pl_defence$/, Q.war ? 3 : 0.5], [/\.el_expose$/, 9],
    [/\.eb_court$/, Q.capital >= 1 ? 5 : 0.5], [/\.eb_pledge$/, 4], [/\.eb_deal_a$/, Q.eb_a === 'pal' ? 0.2 : 6], [/\.eb_deal_b$/, Q.eb_b === 'pal' ? 0.2 : 6], [/\.eb_firm$/, 1],
    [/^rec_pledge_broken\.amends$/, Q.capital >= 2 ? 4 : 1],
    // the campaign trail
    [/\.db_reform$/, Q.corruption > 60 ? 5 : 2], [/\.db_rim$/, Q.rim_hardship > 40 ? 5 : 1], [/\.db_security$/, Q.fear > 45 ? 4 : 1], [/\.db_attack$/, Q.tr_rival_pal && Q.evidence < 3 ? 0.3 : 2],
    [/\.en_accept$/, 4], [/\.en_ask$/, 0.2], [/\.en_decline$/, Q.tr_jedi ? 6 : 1],
    [/\.rs_publish$/, (!Q.tr_rival_pal || Q.evidence >= 3) ? 3 : 0.2], [/\.rs_hold$/, 3], [/\.rs_burn$/, 2],
    [/\.gf_apologise$/, 5], [/\.gf_double$/, 1], [/\.gf_ignore$/, 1],
    [/\.sm_rebut$/, Q.evidence >= 2 ? 6 : 1], [/\.sm_counter$/, Q.evidence >= 4 ? 7 : 0.3], [/\.sm_ignore$/, 1],
    // world elections, referendums, recalls, confidence votes
    [/^rec_world_election\.hard$/, Q.capital >= 3 ? 5 : 1], [/^rec_world_election\.advisor$/, 6], [/^rec_world_election\.money$/, 1], [/^rec_world_election\.out$/, 2],
    [/^rec_referendum\.relief$/, Q.treasury >= 4 ? 5 : 1], [/^rec_referendum\.figure$/, 6], [/^rec_referendum\.expose$/, 7], [/^rec_referendum\.autonomy$/, 3],
    [/^rec_referendum\.campaign$/, 3], [/^rec_referendum\.out$/, 0.5],
    [/^rec_recall\.apologise$/, Q.capital >= 2 ? 4 : 1], [/^rec_recall\.campaign$/, 3], [/^rec_recall\.accept$/, 1],
    [/^sa_coalition\.mandate$/, (Q.cv_outlook || 0) >= 58 ? 6 : 0.1],
    // lay charges only when the case should hold
    [/^rec_case_ready\.charges$/, SW.chargesOdds(Q) >= 0.7 ? 8 : 0.3], [/^rec_case_ready\.wait$/, 2],
    // mend the ties that block a coalition we could lead
    [/^ca_relations$/, (Q.bk_ok || Q.sm_ok || Q.coal_all_blocked) ? 6 : 2], [/^ca_relations\.broker$/, 8], [/^ca_relations\.summit$/, Q.capital >= 3 ? 7 : 1]
  ];
  for (const [re, w] of W) if (re.test(id)) {
    // a careful player does not break a pledge in the budget
    const m = /^rec_budget\.(rev|pri)_(\w+)$/.exec(id);
    if (m && (m[1] === 'rev' ? Q['bd_brkn_rev_' + m[2]] : Q['bd_brkn_' + m[2]])) return w * 0.05;
    if (/^rec_budget\.support$/.test(id) && Q.bd_gov_breaks_n) return w * 0.05;
    if (/^ca_investigate\.(money|slicer)$/.test(id) && Q.pl_no_probe) return w * 0.3;
    if (Q.pl_no_powers && /(powers_yes|^sa_emergency\.(request|martial))$/.test(id)) return w * 0.05;
    return w;
  }
  return null;
}
// a nominee's appeal, weighted by the size of each bloc
function nomineeWeight(nid, Q) {
  const N = SW.NOMINEES[nid];
  if (!N) return 1;
  let score = 0;
  for (const b in N.appeal) score += N.appeal[b] * (Q[b + '_r'] || 0);
  return Math.max(0.3, 2 + score / 25);
}
function weightFor(id) {
  if (POLICY === 'smart' && curEngine) {
    const st = STRAT ? strategyWeight(id, curEngine.state.qualities) : null;
    if (st !== null) return st;
    const sw = smartWeight(id, curEngine.state.qualities);
    if (sw !== null) return sw;
    if (curEngine.state.qualities.pl_no_powers && /(powers_yes|^sa_emergency\.(request|martial))$/.test(id)) return 0.05;
    let w = 1;
    for (const [k, v] of REFORM_PREFS) if (id.indexOf(k) >= 0) w = Math.max(w, v);
    if (id.indexOf('easy_discard') >= 0 || id.indexOf('go_back') >= 0) w = 0.05;
    return w;
  }
  if (POLICY !== 'reform') return 1;
  let w = 1;
  for (const [k, v] of REFORM_PREFS) if (id.indexOf(k) >= 0) w = Math.max(w, v);
  if (id.indexOf('easy_discard') >= 0 || id.indexOf('go_back') >= 0) w = 0.05;
  return w;
}
function pick(list, idf) {
  if (POLICY === 'passive') {
    // passive: never court, campaign or spend; otherwise random
    const cheap = list.filter(x => !/court|attack|_run$|el_run|campaign|\.hard$|\.pl_|el_pledge|eb_pledge|mandate|apologise|amends/.test(idf(x)));
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

// Premises: an event or card must not appear once an earlier outcome has made it impossible.
// Each rule is [scene id regex, condition that must hold on arrival, label].
const PAL_OFFICE = Q => Q.pal_chancellor || Q.puppet_chancellor;
const PREMISES = [
  [/^(sa_clones|a4_fives)$/, Q => Q.kamino_army, 'clone scene without a clone army'],
  [/^a2_tf_sanctions$/, Q => !Q.tf_broken_up, 'sanctions after the Trade Federation was broken up'],
  [/^a2_hutt_report$/, Q => !Q.slavery_abolished, 'slavery report after abolition'],
  [/^a4_farr_(famine|murder)$/, Q => !Q.farr_dead || Q.farr_murder_seen, 'Farr event after Farr died'],
  [/^(a3_padme_attack|a3_wedding)$/, Q => Q.padme_alive, 'Padme event after her death'],
  [/^rec_guild_pressure$/, Q => Q.guild_patience < SW.GUILD_STEPS[Math.max(0, (Q.gs_step || 1) - 1)] + 15, 'guild pressure step above its threshold'],
  [/^(a4_delegation|a4_elections_suspended|a4_hostage_crisis|a4_security_act|a4_sector_governance|a4_indefinite_term|a4_banking_seizure|a4_loyalist_committee|a3_term_limit|rec_early_empire|rec_empire_looming|rec_arrests_warning|rec_senatorial_arrests)$/,
    PAL_OFFICE, 'Chancellery event without Palpatine in office'],
  [/^(rec_war_council|rec_front_event|a4_war_aims|rec_profiteering|rec_protest|a4_banking|a4_bonteri_dead)$/, Q => Q.war, 'war event without a war'],
  [/^rec_referendum$/, Q => Q.dooku_movement && !Q.sidious_defeated, 'referendum without the Separatist movement'],
  [/^rec_campaign_trail$/, Q => Q.election_season && !Q.election_suspended, 'campaign trail outside election season'],
  [/^rec_world_election$/, Q => !(Q.wv_id === 'mandalore' || Q.wv_id === 'ryloth') || Q.war, 'wartime world election without a war'],
  [/^rec_world_election$/, Q => !(Q.wv_id === 'rodia') || !Q.farr_dead, 'Rodia election after Farr died'],
  [/^a4_dooku_doubt$/, Q => Q.war && Q.dooku_contact, 'Dooku defects without contact or a war'],
  [/^rec_case_ready$/, Q => Q.evidence >= 8.5 && !Q.sidious_known && !Q.finale, 'case offered without the evidence'],
];
const PREMISE_HITS = {};
let lastGovt = [];
function checkPremises(id, Q, game, out) {
  const g = (Q.govt_blocs || []).slice();
  const added = g.filter(b => lastGovt.indexOf(b) < 0);
  if (added.length || g.length !== lastGovt.length) {
    // only a newly added member must clear the bar with everyone (a government that loses a member is not a new government)
    if (Q.govt_bad_pair && added.length) out['government formed with a pair below the bar'] = (out['government formed with a pair below the bar'] || 0) + 1;
    lastGovt = g;
  }
  if (id.indexOf('.') < 0) {
    for (const [re, ok, label] of PREMISES) if (re.test(id) && !ok(Q)) out[label] = (out[label] || 0) + 1;
    const sc = game.scenes[id];
    if (sc && (sc.tags || []).indexOf('event') >= 0 && Q.sidious_defeated && !Q.finale) out['event after Sidious fell'] = (out['event after Sidious fell'] || 0) + 1;
  }
  if (Q.clones > 0 && !Q.kamino_army) out['clones without an army'] = (out['clones without an army'] || 0) + 1;
  if (Q.pal_name === 'Chancellor\'s Bloc' && Q.chancellor_bloc !== 'pal') out['Palpatine\'s bloc named for an office it does not hold'] = (out['Palpatine\'s bloc named for an office it does not hold'] || 0) + 1;
  if (Q.rc_chairs > (Q.chair_cap || 4) && Q.rc_in_govt) out['more chairs than partners allow'] = (out['more chairs than partners allow'] || 0) + 1;
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
      let lastScene = null;
      while (!eng.isGameOver() && steps < 6000) {
        steps++;
        const sc = eng.getCurrentScene();
        visits[eng.state.sceneId] = (visits[eng.state.sceneId] || 0) + 1;
        if (eng.state.sceneId !== lastScene) { lastScene = eng.state.sceneId; checkPremises(lastScene, Q, game, PREMISE_HITS); }
        if (Q.time && trace.capital[Q.time] === undefined) trace.capital[Q.time] = Q.capital;
        if (Q.chancellor !== lastChancellor) { trace.chancellors.push(Q.bby + ':' + Q.chancellor_bloc + (process.env.TRACE ? '[fell' + (Q.govt_fell||0) + ' rc' + Q.rc_r + ' pal' + Q.pal_r + ' mod' + Q.mod_r + ' faith' + Math.round(Q.faith) + ' corr' + Math.round(Q.corruption) + ']' : '')); lastChancellor = Q.chancellor; }
        if (Q.rim_enfranchised && trace.enfranchisedAt === null) trace.enfranchisedAt = Q.date;
        if (Q.time !== trace._lt) { trace._lt = Q.time; if (Q.rc_has_access) trace.access = (trace.access || 0) + 1; }
        trace.maxDissent = Math.max(trace.maxDissent, Q.inst_dissent || 0, Q.rimward_dissent || 0, Q.pacifist_dissent || 0, Q.hawk_dissent || 0);
        if (game.scenes[eng.state.sceneId] && game.scenes[eng.state.sceneId].isCard) trace.cardPlays[eng.state.sceneId] = (trace.cardPlays[eng.state.sceneId] || 0) + 1;
        if (Q.time === lastTime) sameTimeSteps++; else { sameTimeSteps = 0; lastTime = Q.time; }
        if (sameTimeSteps > 400) { resolve({stuck: 'loop at ' + eng.state.sceneId, Q, steps, visits}); return; }
        if (sc.isHand) {
          const hand = eng.state.currentHands[eng.state.sceneId] || [];
          const decks = (eng.getCurrentChoices() || []).filter(c => game.scenes[c.id].isDeck && c.canChoose);
          const pinned = (eng.getCurrentChoices() || []).filter(c => game.scenes[c.id].isPinnedCard);
          const usablePinned = pinned.filter(c => (c.id.indexOf('shuffle') >= 0) ? Math.random() < (POLICY === 'smart' && (Q.n_advisors || 0) < 3 ? 0.6 : 0.15) : Q.advisor_action_timer <= 0);
          if (usablePinned.length && Math.random() < (POLICY === 'passive' ? 0 : (POLICY === 'smart' ? 0.8 : 0.35))) { eng.playPinnedCard(pick(usablePinned, c => c.id).id); continue; }
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
  const stats = {pal_chancellor_32: 0, war: 0, finale: 0, turns: 0, empire_powers: 0, kamino_early: 0, chips: 0, rc_chancellor: 0, reforms: 0, beaten: 0, restoration_votes: 0, restored: 0, faith55: 0};
  const seen = {}; const paths = {};
  const audit = {cap20: [], cap40: [], capEnd: [], rcWon32: 0, rcWon32ThenPal: 0, rcHeldToEnd: 0, enf: 0, enfSeceded: [], enfWar: 0, maxDissent: [], repeatCards: {}, contests: [], changes: [], endLeaders: {}, refused: 0, radicalRim: 0, radicalRimWar: 0, radicalRimSep: [], softRimSep: [], schemes: [], foiled: 0, purges: 0, purgeGames: 0, gavels: 0, minBureau: [], schemeKinds: {}, early: {}, reformsBy: {}, splits: {}, rcEnd: [], accessTurns: [], maxDiss: [], faithEnd: [], fearEnd: [], corrEnd: [], faithBeaten: []};
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
    if (Q.sidious_defeated) { stats.beaten++; if (Q.restoration_seen) stats.restoration_votes++; if (Q.restoration_passed) stats.restored++; if (Q.faith >= 55) stats.faith55++; }
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
      // leaders
      audit.contests.push(Q.leadership_contests || 0);
      audit.changes.push(Q.leader_changes || 0);
      audit.refused += Q.coal_refused || 0;
      for (const grp of ['mod', 'guild', 'rim', 'sec', 'ind', 'inst', 'rimward', 'pacifist', 'hawk']) {
        const k = grp + ':' + Q[grp + '_leader_id'];
        audit.endLeaders[k] = (audit.endLeaders[k] || 0) + 1;
      }
      audit.schemes.push(Q.schemes_total || 0); audit.foiled += Q.schemes_foiled || 0;
      audit.purges += Q.bureau_purges || 0; if (Q.bureau_purges) audit.purgeGames++;
      audit.econ = audit.econ || {debtEnd: [], debt20: 0, debt30: 0, bacta: 0, tibanna: 0, spice: 0, ultimatums: 0, offers: 0, met: 0, refused: 0, aims: {}, collapses: 0, liberations: 0, dilemmas: 0};
      audit.econ.debtEnd.push(Q.debt || 0); if ((Q.debt || 0) >= 20) audit.econ.debt20++; if ((Q.debt || 0) >= 30) audit.econ.debt30++;
      audit.econ.bacta += Q.bacta_crises || 0; audit.econ.tibanna += Q.tibanna_crises || 0; audit.econ.spice += Q.spice_crises || 0;
      audit.econ.met += Q.ultimatums_met || 0; audit.econ.refused += Q.ultimatums_refused || 0; audit.econ.dilemmas += Q.dilemmas_decided || 0;
      audit.econ.gsteps = audit.econ.gsteps || {}; for (let k = 1; k <= 5; k++) if (Q['guild_step_count_' + k]) audit.econ.gsteps[k] = (audit.econ.gsteps[k] || 0) + Q['guild_step_count_' + k];
      audit.econ.bdef = (audit.econ.bdef || 0) + (Q.budget_defeats_total || 0); audit.econ.bfall = (audit.econ.bfall || 0) + (Q.budget_falls || 0); audit.econ.revolts = (audit.econ.revolts || 0) + (Q.core_revolts || 0); audit.econ.credits = (audit.econ.credits || 0) + (Q.credit_refusals || 0);
      if (Q.war_aim) audit.econ.aims[Q.war_aim] = (audit.econ.aims[Q.war_aim] || 0) + 1;
      for (const fr of ['outer', 'mid', 'core']) if ((Q['front_ev_' + fr] || -99) > 0) audit.econ.collapses++;
      audit.gavels += Q.gavels || 0;
      audit.rel = audit.rel || {swings: 0, minority: 0, collapse: 0, bureau: 0, blocked: 0, delivered: 0, kept: 0, size: [], modRim: [], guildMod: [], rimSec: [], palSec: []};
      const ar = audit.rel; ar.swings += Q.broken_swings || 0; ar.minority += Q.broken_minority || 0; ar.collapse += Q.broken_collapse || 0; ar.bureau += Q.broken_bureau || 0;
      ar.blocked += Q.coal_blocked_games || 0; ar.delivered += Q.delivered || 0; ar.kept += Q.pledges_kept || 0; ar.size.push((Q.govt_blocs || []).length);
      ar.modRim.push(SW.rel(Q, 'mod', 'rim')); ar.guildMod.push(SW.rel(Q, 'guild', 'mod')); ar.rimSec.push(SW.rel(Q, 'rim', 'sec')); ar.palSec.push(SW.rel(Q, 'pal', 'sec'));
      // which way through the crisis did this game take, and did it work?
      const route = Q.gambit_kind === 'exposed' ? 'unmasked in the Senate' : (Q.gambit_kind === 'coup' ? 'coup from outside office' : (Q.gambit_kind === 'decree' ? (Q.peace_achieved ? 'decree after peace' : 'decree after victory') :
        (r.visits && r.visits.fin_coruscant ? 'Jedi arrest (' + (Q.known_by || 'none') + ')' : 'lost before the finale')));
      audit.routes = audit.routes || {};
      const ra = audit.routes[route] = audit.routes[route] || {n: 0, beaten: 0, good: 0};
      ra.n++; if (Q.sidious_defeated) ra.beaten++; if (Q.ending === 'reborn' || Q.ending === 'endures') ra.good++;
      audit.routeFlags = audit.routeFlags || {charges: 0, chargesOk: 0, compact: 0, peace: 0, dooku: 0, palOut: 0};
      const rf = audit.routeFlags; if (Q.premature_accusations >= 1 || Q.gambit_kind === 'exposed') rf.charges++; if (Q.gambit_kind === 'exposed') rf.chargesOk++;
      if (Q.fc_vote) rf.compact++; if (Q.peace_achieved) rf.peace++; if (Q.dooku_turned) rf.dooku++; if (!Q.pal_was_chancellor || (Q.pal_office_months || 0) < 24) rf.palOut++;
      audit.el = audit.el || {noms: {}, second: 0, deals: 0, pledges: 0, broken: 0, wins: 0, losses: 0, refWon: 0, refLost: 0, disrupt: 0, protWon: 0, protLost: 0, recalls: 0, mandWon: 0, mandLost: 0, campaigns: 0, debates: 0, endorse: 0, momEnd: []};
      for (const n in SW.NOMINEES) if (Q['nominated_' + n]) audit.el.noms[n] = (audit.el.noms[n] || 0) + Q['nominated_' + n];
      audit.el.second += Q.second_ballots || 0; audit.el.deals += Q.kingmaker_deals || 0; audit.el.pledges += Q.pledges_made || 0; audit.el.broken += Q.pledges_broken || 0;
      audit.el.wins += Q.world_wins || 0; audit.el.losses += Q.world_losses || 0; audit.el.refWon += Q.referendums_won || 0; audit.el.refLost += Q.referendums_lost || 0;
      audit.el.disrupt += Q.disruptions || 0; audit.el.protWon += Q.protects_won || 0; audit.el.protLost += Q.protects_lost || 0; audit.el.recalls += Q.recalls || 0;
      audit.el.mandWon += Q.mandates_won || 0; audit.el.mandLost += Q.mandates_lost || 0; audit.el.campaigns += Q.campaigns_run || 0; audit.el.debates += Q.debates_won || 0; audit.el.endorse += Q.endorsements || 0;
      audit.el.momEnd.push(Q.rc_momentum || 0);
      for (const k of ['hawks_split', 'rimward_split', 'pacifists_resigned', 'inst_crisis']) if (Q[k]) audit.splits[k] = (audit.splits[k] || 0) + 1;
      audit.rcEnd.push(Q.rc_r || 0); audit.faithEnd.push(Q.faith); audit.fearEnd.push(Q.fear); audit.corrEnd.push(Q.corruption);
      if (Q.sidious_defeated) audit.faithBeaten.push(Q.faith);
      if (Q.restoration_passed) {
        audit.rb = audit.rb || {restored: 0, faith: 0, corruption: 0, trial: 0, safeguards: 0, war: 0};
        audit.rb.restored++;
        if (Q.faith < 50) audit.rb.faith++;
        if (!(Q.corruption < 65 || Q.anti_corruption)) audit.rb.corruption++;
        if (Q.sidious_method !== 'trial') audit.rb.trial++;
        if (SW.safeguardCount(Q) < 1) audit.rb.safeguards++;
        if (Q.war && Q.war_balance < -2) audit.rb.war++;
      } audit.accessTurns.push(t.access || 0);
      for (const k of ['early_empire', 'arrests_broke', 'arrests_survived', 'admirals_coup', 'cis_victory', 'shadow_remains']) if (Q[k]) audit.early[k] = (audit.early[k] || 0) + 1;
      if (Q.ending === 'empire' && !Q.empire_declared) audit.early.empire_by_clock = (audit.early.empire_by_clock || 0) + 1;
      for (const k of ['emergency_sunset', 'term_limits_protected', 'army_oversight', 'senate_guard_reformed', 'jedi_independence', 'banking_independent', 'rim_enfranchised', 'anti_corruption']) if (Q[k]) audit.reformsBy[k] = (audit.reformsBy[k] || 0) + 1;
      for (const k in Q) if (k.indexOf('scheme_seen_') === 0) audit.schemeKinds[k.slice(12)] = (audit.schemeKinds[k.slice(12)] || 0) + Q[k];
      const rimSep = Math.round((Q.outer_sep + Q.midrim_sep) / 2);
      if (Q.rim_was_radical) { audit.radicalRim++; if (Q.geonosis_seen) audit.radicalRimWar++; audit.radicalRimSep.push(rimSep); }
      else audit.softRimSep.push(rimSep);
    }
    if (VERBOSE) origLog(g, e, Q.date_label, 'steps', r.steps, r.stuck || '', 'ep', Q.emergency_powers, 'ev', Q.evidence.toFixed(1), 'gp', Math.round(Q.grand_plan), 'rc', Q.rc_r, 'pal', Q.pal_r, 'ch', Q.chancellor);
  }
  origLog('policy', POLICY_ARG, 'games', GAMES);
  origLog('endings', JSON.stringify(endings));
  origLog('stuck', JSON.stringify(stucks));
  origLog('NaN qualities', JSON.stringify(nanKeys));
  origLog('premise violations', JSON.stringify(PREMISE_HITS));
  origLog('stats', JSON.stringify(Object.assign(stats, {turns: (stats.turns / GAMES).toFixed(1), reforms: (stats.reforms / GAMES).toFixed(2)})));
  const errCount = {};
  for (const e of errors) { const k = e.slice(0, 160); errCount[k] = (errCount[k] || 0) + 1; }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  origLog('audit: capital at turn 20 avg ' + avg(audit.cap20) + ', turn 40 avg ' + avg(audit.cap40) + ', end avg ' + avg(audit.capEnd) + ', end max ' + Math.max(...audit.capEnd));
  origLog('audit: Caucus won first election ' + audit.rcWon32 + 'x; Palpatine later Chancellor in ' + audit.rcWon32ThenPal + '; Caucus still Chancellor at end ' + audit.rcHeldToEnd);
  if (audit.enfWhere) origLog('audit: enfranchised games, where/sep: ' + Object.keys(audit.enfWhere).slice(0, 12).join(' | '));
  origLog('audit: enfranchised before 22 BBY in ' + audit.enf + ' games; avg seceded ' + avg(audit.enfSeceded) + '%; war in ' + audit.enfWar);
  origLog('audit: leadership contests per game avg ' + avg(audit.contests) + ', leader changes avg ' + avg(audit.changes) + ', coalition offers refused by a leader ' + audit.refused);
  origLog('audit: radical Rim leader at some point in ' + audit.radicalRim + ' games (war in ' + audit.radicalRimWar + ', end Rim sep avg ' + avg(audit.radicalRimSep) + ') vs end Rim sep avg ' + avg(audit.softRimSep) + ' otherwise');
  origLog('audit: schemes per game avg ' + avg(audit.schemes) + ', foiled total ' + audit.foiled + ', kinds ' + JSON.stringify(audit.schemeKinds));
  origLog('audit: early or special endings ' + JSON.stringify(audit.early) + '; safeguards passed ' + JSON.stringify(audit.reformsBy));
  origLog('audit: splits ' + JSON.stringify(audit.splits) + '; Caucus seats at end avg ' + avg(audit.rcEnd) + '; turns with chairs/government avg ' + avg(audit.accessTurns));
  origLog('audit: at the end: faith avg ' + avg(audit.faithEnd) + ' (when Sidious beaten ' + avg(audit.faithBeaten) + '), fear avg ' + avg(audit.fearEnd) + ', corruption avg ' + avg(audit.corrEnd));
  if (audit.rb) origLog('audit: restored games failing each best-ending test ' + JSON.stringify(audit.rb));
  if (audit.econ) { const e = audit.econ; const avg = a => a.length ? Math.round(10 * a.reduce((x, y) => x + y, 0) / a.length) / 10 : 0;
    origLog('audit: economy debt at end avg ' + avg(e.debtEnd) + ', games ending with debt>=20: ' + e.debt20 + ', >=30: ' + e.debt30 + '; market crises bacta ' + e.bacta + ' tibanna ' + e.tibanna + ' spice ' + e.spice);
    origLog('audit: guild pressure steps reached ' + JSON.stringify(e.gsteps || {}) + ' (1 lobbying, 2 slowdown, 3 credit strike, 4 blockade, 5 defection); our budgets defeated ' + (e.bdef || 0) + ', governments brought down by budgets ' + (e.bfall || 0) + '; Core revolts ' + (e.revolts || 0) + '; credits refused ' + (e.credits || 0));
    origLog('audit: leaders ultimatums met ' + e.met + ' refused ' + e.refused + '; war aims ' + JSON.stringify(e.aims) + ', war dilemmas decided ' + e.dilemmas + ', front breakpoints ' + e.collapses); }
  if (audit.el) { const e = audit.el;
    origLog('audit: elections nominees ' + JSON.stringify(e.noms) + ', second ballots ' + e.second + ', kingmaker deals ' + e.deals + ', pledges made ' + e.pledges + ' broken ' + e.broken + ', confidence votes won ' + e.mandWon + ' lost ' + e.mandLost);
    origLog('audit: campaigns run ' + e.campaigns + ', debates won ' + e.debates + ', endorsements ' + e.endorse + ', rallies disrupted ' + e.disrupt + ' (protected ' + e.protWon + ', broken up ' + e.protLost + '); world elections won ' + e.wins + ' lost ' + e.losses + '; referendums stayed ' + e.refWon + ' left ' + e.refLost + '; recalls ' + e.recalls + '; momentum at end avg ' + avg(e.momEnd)); }
  if (audit.routes) {
    const pc = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
    origLog('audit: routes ' + Object.entries(audit.routes).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => k + ' ' + pc(v.n, GAMES) + ' (Sidious beaten ' + pc(v.beaten, v.n) + ', good end ' + pc(v.good, v.n) + ')').join('; '));
    const rf = audit.routeFlags; origLog('audit: route steps: charges laid or premature accusations ' + rf.charges + ', charges that stuck ' + rf.chargesOk + ', Federal Compact votes ' + rf.compact + ', peace ' + rf.peace + ', Dooku turned ' + rf.dooku + ', Palpatine under 2 years in office ' + rf.palOut);
  }
  if (audit.rel) { const r = audit.rel;
    origLog('audit: relations: broken-system swings ' + r.swings + ' (minority governments ' + r.minority + ', collapses ' + r.collapse + ', bureaucrats ' + r.bureau + '); every Caucus coalition blocked ' + r.blocked + 'x; deliveries ' + r.delivered + ', pledges kept ' + r.kept + '; government size at end avg ' + avg(r.size) + '; end relations mod-rim ' + avg(r.modRim) + ', guild-mod ' + avg(r.guildMod) + ', rim-sec ' + avg(r.rimSec) + ', pal-sec ' + avg(r.palSec)); }
  origLog('audit: bureaucrat purges ' + audit.purges + ' (in ' + audit.purgeGames + ' games), Vice Chair gavels ' + audit.gavels);
  origLog('audit: leaders at the end: ' + Object.entries(audit.endLeaders).sort().map(([k, v]) => k + '=' + v).join(' '));
  origLog('audit: avg peak faction dissent ' + avg(audit.maxDissent) + '; cards played 6+ times (games): ' + JSON.stringify(audit.repeatCards));
  origLog('paths:'); Object.keys(paths).sort((a, b) => paths[b] - paths[a]).slice(0, 18).forEach(k => origLog('  ' + paths[k] + 'x ' + k));
  origLog('errors', Object.keys(errCount).length);
  for (const k of Object.keys(errCount).slice(0, 25)) origLog('  ' + errCount[k] + 'x ' + k);
  
})();
