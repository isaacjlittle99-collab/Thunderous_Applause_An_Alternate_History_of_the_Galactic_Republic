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
// which kinds of patronage the ministries hand out
const MIN_PORK_KINDS = {};
{ const pb = SW.porkBarrel; SW.porkBarrel = function (Q, c, b, k) { const n = Q.pork_count || 0; pb.apply(this, arguments); if (b !== 'rc' && (Q.pork_count || 0) > n) MIN_PORK_KINDS[c + ':' + Q['pork_mv_' + c]] = 1; }; }
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
  ['ethics', 4], ['warrant', 5], ['expose', 4], ['shelter', 6], ['chips', 6], ['citizenship', 3], ['inspect', 3],
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
//   inst, rimward, pacifist, hawk: grow that wing of the Caucus, back it at our congress, and walk its road
// a wing strategist: its road card and steps, its Chancellery option, backing it at our congress, and what grows it
const wingStrat = (f, steps, chanc, grow) => [
  [new RegExp('^ca_road_' + f + '$'), () => 25], [new RegExp('^ca_road_' + f + '\\.(' + steps + ')$'), () => 30],
  [new RegExp('^chancellery\\.' + chanc + '$'), () => 20], [/^chancellery$/, Q => Q.rc_chancellor && Q.rc_lead === f ? 8 : null],
  [/^rec_caucus_congress\.(back|adv)[1-4]$/, (Q, id) => Q['rcg_c' + id.slice(-1) + '_f'] === f ? 40 : 0.05], [/^rec_caucus_congress\.stay_out$/, () => 0.05],
  [/^ca_contributions$/, Q => Q.capital <= 1 ? 8 : null]
].concat(grow);
const STRATEGIES = {
  inst: wingStrat('inst', 'convene|charter|ratify', 'w_review', [[/^sa_judiciary$/, () => 12], [/^sa_judiciary\.(ethics|integrity|expel|oversight_act|prosecute)$/, () => 14],
    [/^sa_constitution$/, () => 12], [/^sa_constitution\.(sunset|terms|vonc|speaker|powers_review|groundwork)$/, () => 14]]),
  rimward: wingStrat('rimward', 'congress|charter|homecoming', 'w_councillors', [[/^ca_rim$/, () => 14], [/^ca_rim\.(relief|slavery|listen|moderates)$/, () => 6],
    [/^sa_rimaffairs$/, () => 14], [/^sa_rimaffairs\.(relief_act|enfranchise|sentience|abolition|enforce|slavery_report|assembly)$/, () => 16], [/^sa_constitution\.rim$/, () => 14], [/\.db_rim$/, () => 10], [/^rec_budget\.pri_relief$/, () => 12]]),
  pacifist: wingStrat('pacifist', 'movement|mediation|accord', 'ceasefire', [[/^ca_jedi$/, () => 12], [/^ca_jedi\.(visit|defend)$/, () => 6], [/^ca_peace$/, () => 12],
    [/^ca_peace\.(channel|corridors|rallies)$/, () => 6], [/^sa_diplomacy$/, () => 12], [/^sa_diplomacy\.(talks|neutrals)$/, () => 10], [/^sa_diplomacy\.recognise$/, () => 0.01],
    [/^sa_security\.demobilise$/, Q => (Q.judicial_forces || 0) > 0 ? 8 : null], [/^a2_satine\.welcome$/, () => 20], [/^a4_war_aims\.peace$/, () => 9]]),
  hawk: wingStrat('hawk', 'raise|oath|seize', 'w_navy', [[/^sa_security$/, () => 14], [/^sa_security\.(judicials|navy|charter|command|patrols|pirate_campaign)$/, () => 12],
    [/^sa_security\.demobilise$/, () => 0.01], [/^ca_pact$/, () => 12], [/^ca_pact\.(form|train|exercise|talks)$/, () => 6], [/\.db_security$/, () => 12], [/^sa_emergency\.request$/, () => 4],
    [/powers_yes$/, () => 8], [/^rec_budget\.pri_defence$/, () => 14]]),
  // a player who campaigns whenever the card comes up, and raises the capital to do it
  campaign: [[/^ca_campaign$/, () => 25], [/^ca_contributions$/, Q => Q.capital <= 1 ? 12 : 2], [/^ca_campaign\.shoestring$/, Q => Q.capital < 1 ? 5 : 0.2]],
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
  for (const [re, f] of STRATEGIES[STRAT] || []) if (re.test(id)) { if (!f) return null; const w = f(Q, id); if (w !== null && w !== undefined) return w; }
  return null;
}
// the careful player's choice in each war dilemma
const SMART_DILEMMA = {umbara: 'b', ryloth: 'a', blockade: 'b', mandalore: 'a', levy: 'a', clone_surge: 'b', refugees: 'a', zygerria: 'a', jedi_stretch: 'a', citadel: 'b', bacta: 'a', hydian: 'a'};
// "smart": a careful player who reads the state of the game (used to tune difficulty)
function smartWeight(id, Q) {
  const has = (k) => id === k || id.endsWith('.' + k);
  const threatContest = Q.contest_group && SW.threatOnGroup(Q, Q.contest_group) && SW.LEADERS[Q.contest_inc_id] && SW.LEADERS[Q.contest_inc_id].firm >= 0.7;
  const anyThreat = Q.rim_threat || Q.rfc_threat || Q.sec_threat;
  const W = [
    // a defection looming: court the bloc through the usual channels, and back a rival against its hardliner
    ...(anyThreat ? [[/^ca_relations$/, 12]] : []),
    ...(Q.rim_threat ? [[/^ca_relations\.rim$/, 14]] : []), ...(Q.rfc_threat ? [[/^ca_relations\.rfc$/, 14]] : []),
    ...(Q.sec_threat ? [[/^ca_relations\.sec$/, 14]] : []),
    ...(threatContest ? [[/leadership\.(back_ch|adv_ch)$/, 14]] : []),
    // the search for the Sith: clear the shortlist; once he is named, prepare carefully and keep him from noticing
    [/^ca_investigate\.look_\w+$/, 12], [/^rec_amedda_files\.leak$/, (Q.sith_alarm || 0) < 3 ? 2 : 0.3], [/^rec_amedda_files\.quiet$/, 3],
    [/^ca_hunt$/, 9], [/^ca_hunt\.(routes|witnesses)$/, 10], [/^ca_hunt\.informant$/, 9], [/^ca_hunt\.(freeze|officers|chips)$/, (Q.sith_alarm || 0) < 4 ? 8 : 2],
    [/^ca_hunt\.jedi$/, 8], [/^ca_hunt\.anakin$/, Q.anakin_fall <= 4 ? 7 : 0.1], [/^ca_hunt\.case$/, Q.evidence < 10 ? 4 : 0.5],
    [/^ca_hunt\.arrest$/, (Q.hunt_routes ? 2 : 0) + (Q.warrant ? 2 : 0) + (Q.hunt_informant ? 2 : 0) + (Q.anakin_fall <= 4 ? 3 : 0) + (Q.senate_jedi_pact ? 2 : 0) >= 7 ? 15 : 0.3],
    // the reform tracks: take the next step
    // (a careful player takes the next step whenever it holds the office and can afford it)
    [/\.civil_service$/, 12], [/\.amedda$/, 14], [/\.integrity$/, 12], [/\.hhc_investigate$/, 10], [/^sa_judiciary\.syndicates$/, 12],
    [/\.relief_act$/, 12], [/\.assembly$/, 14], [/\.slavery_report$/, 11], [/^sa_rimaffairs\.abolition$/, 12], [/^sa_rimaffairs\.enfranchise$/, 12], [/\.enforce$/, 12], [/\.sentience$/, 10],
    [/^sa_constitution\.(sunset|rim)$/, 11], [/\.powers_review$/, 12], [/^sa_security\.oversight$/, 11], [/^sa_security\.command$/, 12], [/^sa_security\.patrols$/, 11], [/\.pirate_campaign$/, (Q.mil_invest || 0) >= 2 ? 12 : 0.1],
    [/^sa_security\.officers$/, 10], [/^ca_jedi\.reform$/, 8], [/^sa_jedi_affairs\.reform$/, 8], [/^sa_jedi_affairs\.attachment$/, 10], [/^sa_jedi_affairs\.new_order$/, 14],
    [/^sa_jedi_affairs\.(independence|service|compact)$/, 10], [/^sa_finance\.anticartel$/, 9], [/^sa_finance\.bonds$/, 9], [/^sa_finance\.deregulate$/, Q.capital <= 2 ? 6 : 2],
    [/^sa_judiciary\.(expel|oversight_act|compor)$/, 10], [/^sa_security\.charter$/, 10], [/^sa_constitution\.speaker$/, 10], [/^ld_corporate$/, 8],
    // the offices are few and short: play their cards while we hold them
    [/^sa_(judiciary|rimaffairs|security)$/, 10], [/^sa_constitution$/, 9], [/^sa_jedi_affairs$/, 9],
    // guild money: avoid the strings, and break free when they bind
    [/^ca_contributions\.guilds$/, 0.4], [/^ca_contributions\.break$/, (Q.guild_hold || 0) > 0 ? 5 : 0], [/\.el_chest$/, 0.3],
    // the Hutts: deal only when the war is being lost
    [/^rec_hutt_deal\.deal$/, (Q.war_ratio || 2) < 0.6 ? 4 : 0.5], [/^rec_hutt_deal\.refuse$/, (Q.war_ratio || 2) < 0.6 ? 1 : 4],
    // the Chancellery: decree sometimes, hand powers back sometimes
    [/^chancellery\.reform$/, 6], [/^chancellery\.dr_/, 5], [/^chancellery\.d_/, 2], [/^chancellery\.rv_/, 1],
    [/^chancellery\.giveback$/, 3], [/^chancellery\.gb_/, 1], [/^chancellery\.go_back_page$/, 0.2],
    [/^rec_war_in_shadows\.(purge|back|leave)$/, 2],
    // never waste a foreseen scheme or a warning
    [/counter_adv$/, Q.advisor_action_timer <= 0 ? 9 : 0], [/counter$/, Q.capital >= 2 ? 8 : 3],
    [/tame$/, 8], [/\.rally$/, Q.capital >= 2 ? 7 : 2], [/\.sunset$/, 9], [/\.purge$/, 7], [/reassure$/, 5],
    // keep the bureaucrats on side
    [/bureau_reform$/, Q.bureau_relation < 45 ? 9 : 1], [/valorum_bureaucracy$|organa_bureau$|antilles_bureau$/, Q.bureau_relation < 35 ? 9 : 0.5],
    [/soothe$/, Q.capital >= 2 ? 5 : 1], [/truce$/, (Q.bureau_relation < 8 || Q.bureau_dossier >= 3) ? 6 : 1], [/valorum_way$/, Q.capital >= 3 ? 4 : 0.5],
    // the arrest plan
    [/\.expose$/, 10], [/\.warrant$/, 9], [/fin_arrest_plan\.jedi$/, 0.3],
    // build the case
    [/^ca_investigate$/, Q.evidence < 10 ? 6 : 1], [/^sa_judiciary$/, 7], [/^sa_constitution$/, Q.senate_resolve >= 3 ? 7 : 3],
    [/^sa_security$/, 6], [/^sa_clones$/, 5], [/^ca_contributions$/, Q.capital <= 1 ? 7 : 1], [/^ca_routine$/, Q.capital <= 0 ? 4 : 0.5],
    [/^ca_rim$/, Q.rim_hardship > 35 ? 5 : 2], [/^ca_jedi$/, 4], [/^ca_confront$/, 3], [/^ca_pact$/, (Q.war && (Q.war_ratio || 2) < 0.9) ? 8 : (Q.dooku_movement ? 5 : 2)],
    [/^ca_peace$/, Q.war ? 5 : 1], [/^ca_relations$/, 3], [/^ca_media$/, 3], [/^sa_rimaffairs$/, 5], [/^sa_finance$/, 4],
    [/^sa_diplomacy$/, Q.war ? 6 : 3],
    // advisors and leadership
    [/let_decide$/, 4], [/\.offer$/, 3],
    [/^rec_party_congress\.adv$/, 5], [/^rec_party_congress\.back\d$/, Q.capital >= 3 ? 2 : 0.3], [/^rec_party_congress\.stay_out$/, 3],
    [/^rec_hutt_terms\.accept$/, 2], [/^rec_hutt_terms\.refuse$/, 3], [/^rec_human_militias\.(crackdown|investigate)$/, 5], [/^rec_repeal_rights\.fight$/, 6],
    [/^ld_hawks$/, 9],
    [/^rec_caucus_congress\.adv\d$/, 4], [/^rec_caucus_congress\.back\d$/, Q.capital >= 3 ? 1.5 : 0.2], [/^rec_caucus_congress\.stay_out$/, 3],
    [/^chancellery\.ceasefire$/, Q.war && (Q.war_ratio || 2) < 0.9 ? 6 : 2],
    [/^ca_road_\w+\.\w+$/, 6], [/^ca_disunity\.\w+$/, 3], [/^chancellery\.w_\w+$/, 2],
    [/^sa_(finance|judiciary|security|rimaffairs)\.patronage_\d$/, Q.capital <= 1 ? 4 : 0.5], [/^sa_security\.demobilise$/, Q.treasury <= 0 ? 3 : 0.2], [/^shuffle_leadership$/, (Q.n_advisors || 0) < 3 ? 6 : 0.3],
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
    // spread campaigns: prefer regions where our presence has faded
    [/^ca_campaign\.(core|colonies|midrim|outer|corporate)$/, 1 + 4 * (1 - (Q['cm_presence_' + id.split('.').pop()] || 0) / SW.PRESENCE_CAP)],
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
  // on the title menu, a player begins the game (browsing the help pages only delays it)
  const begin = list.find(x => /(^|\.)new_game$/.test(idf(x)));
  if (begin && Math.random() < 0.5) return begin;
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
const ROAD_STEPS = {convene: 1, charter: 2, ratify: 3, congress: 1, homecoming: 3, movement: 1, mediation: 2, accord: 3, raise: 1, oath: 2, seize: 3};
const ROAD_STEP_OF = (f, st) => (f === 'rimward' && st === 'charter') ? 2 : ROAD_STEPS[st];
const PREMISES = [
  [/^ca_road_(inst|rimward|pacifist|hawk)$/, Q => true, ''],
  [/^ca_road_(inst|rimward|pacifist|hawk)\.(\w+)$/, Q => { const m = /^ca_road_(\w+)\.(\w+)$/.exec(Q._sim_scene || ''); return !m || !ROAD_STEP_OF(m[1], m[2]) || [ROAD_STEP_OF(m[1], m[2]) - 1, ROAD_STEP_OF(m[1], m[2])].indexOf(Q['road_' + m[1]]) >= 0; }, 'a road step before the one it needs'],
  [/^chancellery\.w_review$/, Q => Q.rc_lead === 'inst', 'a wing\'s Chancellery option under another wing'],
  [/^chancellery\.w_councillors$/, Q => Q.rc_lead === 'rimward', 'a wing\'s Chancellery option under another wing'],
  [/^chancellery\.w_navy$/, Q => Q.rc_lead === 'hawk', 'a wing\'s Chancellery option under another wing'],
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
  [/^rec_world_(falls|liberated)$/, Q => Q.war, 'a world falls or is freed without a war'],
  [/^rec_war_turning$/, Q => Q.war && SW.warScore(Q) < SW.FLEE_SCORE + 1, 'the front gives way while the war is going well'],
  [/^rec_hutt_deal$/, Q => Q.war && !Q.syndicates_broken, 'Hutt deal after the syndicates were broken'],
  [/^rec_hhc$/, Q => !Q.hhc_discredited, 'High Human Culture event after it was discredited'],
  [/^rec_piracy$/, Q => !Q.patrol_fleets, 'pirate raid with patrol fleets on station'],
  [/^rec_threat_sec$/, Q => Q.parties.indexOf('sec') >= 0 && Q.sec_leader_id === 'tarkin', 'Security Bloc courted without Tarkin'],
  [/^rec_threat_rim$/, Q => Q.parties.indexOf('rim') >= 0 && Q.dooku_movement, 'Rimward Coalition courted outside the crisis'],
  [/^rec_admirals_strike$/, Q => Q.sidious_defeated && !Q.hhc_discredited && Q.emergency_powers > 0, 'admirals strike without the conditions'],
  [/^rec_sidious_flees$/, Q => Q.war && !Q.sidious_defeated, 'Sith Lord flees without a war'],
  // the search for the Sith: nothing names or accuses Palpatine before the trail reaches him
  [/^(ca_hunt|rec_case_ready|ca_investigate\.charges)$/, Q => Q.sith_named, 'Palpatine hunted or accused before the Caucus has named him'],
  [/^ca_hunt\.arrest$/, Q => Q.rc_chancellor, 'an arrest ordered by a Chancellor who is not ours'],
  [/^rec_sith_named$/, Q => SW.openSuspects(Q).length === 0, 'a name before every suspect is cleared'],
  [/^ca_investigate\.look_\w+$/, Q => Q.sith_stage === 3 || Q.sith_name_ready, 'a suspect looked into outside the shortlist stage'],
  [/^rec_amedda_files$/, Q => Q.suspect_amedda && !Q.amedda_arrested, 'Amedda\'s files without clearing him by investigation'],
  // no opposition-style card or option while the Caucus holds the Chancellery or sits in its government
  [/^(ca_confront|rec_piracy\.blame|ca_media\.(overreach|counter)|ca_enemy\.overreach|adv_mothma\.mothma_vigilance)$/, Q => !Q.rc_chancellor && !Q.rc_in_govt, 'opposition-style option while the Caucus governs'],
  // the Last Days only draw on what was built
  [/^ld_forces$/, Q => Q.pact_formed, 'Free Worlds mobilised without a Defence Pact'],
  [/^ld_corporate$/, Q => Q.dereg_count >= 3, 'corporate security called without three rounds of deregulation'],
  [/^sa_jedi_affairs$/, Q => Q.chair_jedi === 'rc', 'the Jedi Affairs card without its chair'],
  [/^sa_constitution$/, Q => Q.chair_constitution === 'rc', 'the Constitutional card without its chair'],
  [/^sa_finance\.breakup$/, Q => Q.anti_cartel, 'the Trade Federation broken up before the Anti-Cartel Act'],
  [/^rec_(guild_pressure|embargo)$/, Q => !Q.tf_broken_up, 'a guild threat after the Trade Federation was broken up'],
  [/^ld_navy$/, Q => Q.navy_vetted >= 1 || Q.officer_corps || Q.senate_command, 'Navy appealed to without earlier work'],
  [/^ld_delegation$/, Q => Q.delegation_formed, 'Delegation rallied without a Delegation'],
  [/^ld_evidence$/, Q => Q.evidence >= 3, 'evidence secured without a case'],
  [/^ld_jedi$/, Q => Q.jedi_relation >= 60, 'Jedi coordinated with without close relations'],
  [/^ld_anakin$/, Q => (Q.padme_alive && (Q.padme_married || Q.adv_amidala)) || Q.jedi_relation >= 60 || Q.quigon_alive, 'Anakin reached without anyone close to him'],
  [/^fin_gambit_response\.pact$/, Q => Q.pact_formed, 'Defence Pact mobilised without a Pact'],
  [/^fin_gambit_response\.army$/, Q => Q.army_oversight || Q.chips_removed || Q.senate_command, 'army called on without Senate command'],
  [/^rec_rim_radical$/, Q => !Q.dooku_movement, 'a story of the radicalising Rim after Dooku\'s declaration'],
  [/^rec_rim_radicals$/, Q => !SW.rimTackled(Q) && Q.date >= 60, 'the Rim\'s politicians radicalising although the Rim was tackled'],
  [/^rec_party_congress$/, Q => !Q.finale && SW.hasWings(Q, Q.cg_bloc || Q.congress_ready), 'a congress in the finale, or of a bloc without wings'],
  [/^rec_party_congress\.cg_round2$/, Q => Q.cg_deadlock, 'a second round without a deadlock'],
  // what the ruling wings do
  [/^rec_hutt_(terms|offer|reprisal|turned)$/, Q => !Q.syndicates_broken, 'a Hutt event after the syndicates were broken'],
  [/^rec_hutt_(terms|offer)$/, Q => Q.rim_wing === 'hutt_machine', 'the Hutts\' terms while they do not rule the Rim'],
  [/^rec_hutt_offer$/, Q => Q.hutt_terms && Q.rc_in_govt, 'a Hutt offer without the terms or a seat in government'],
  [/^rec_human_militias$/, Q => Q.pal_wing === 'new_order', 'human militias without the New Order ruling Palpatine\'s bloc'],
  [/^rec_repeal_rights$/, Q => Q.pal_chancellor && Q.pal_wing === 'new_order', 'a repeal without the New Order in the Chancellery'],
  [/^rec_farr_returns$/, Q => SW.TRACKS.rim.level(Q) >= 3 && Q.slavery_enforced && !Q.farr_dead, 'Farr returns before the Rim\'s reforms and abolition'],
  [/^ld_hawks$/, Q => Q.sec_wing === 'const_hawks', 'the Constitutional Hawks called without them ruling Security'],
  [/^fin_(purge|militias|crowds)$/, Q => Q.finale && !Q.sidious_defeated, 'a finale move by Palpatine\'s wings outside the finale'],
  [/^rec_caucus_congress$/, Q => !Q.finale, 'a Caucus congress in the finale'],
  [/^rec_walkout$/, Q => !!Q.wk_wing && (!!Q.wk_found || !!Q.wk_join), 'a walkout with nowhere to go'],
  [/^sa_(finance|judiciary|security|rimaffairs)\.patronage_\d$/, Q => !Q.senators_expelled, 'patronage after the corruption reforms'],
  [/^sa_security\.demobilise$/, Q => Q.judicial_forces >= 0, 'demobilising Judicial Forces that do not exist'],
  [/^rec_lead_pacifist_bad$/, Q => Q.war, 'appeasers without a war'],
  [/^rec_lead_inst_/, Q => Q.rc_lead === 'inst', 'a faction event while another faction leads'],
  [/^rec_lead_rimward_/, Q => Q.rc_lead === 'rimward', 'a faction event while another faction leads'],
  [/^rec_lead_pacifist_/, Q => Q.rc_lead === 'pacifist', 'a faction event while another faction leads'],
  [/^rec_lead_hawk_/, Q => Q.rc_lead === 'hawk', 'a faction event while another faction leads'],
  [/^rec_peace_conference$/, Q => Q.chan_ceasefire && Q.rc_chancellor, 'a peace conference without our ceasefire'],
  [/^chancellery\.ceasefire$/, Q => Q.rc_chancellor && Q.rc_lead === 'pacifist', 'a ceasefire without a Pacifist-led Caucus in the Chancellery'],
];
const PREMISE_HITS = {};
// the backlash: repeals by reform, walkouts by cause, and checks on the rules
const BACKLASH = {repeals: {}, walkoutCause: {}};
const CW_WALK = {};
{ const fs0 = SW.factionSplit; SW.factionSplit = function (Q, f) { CW_WALK[f] = (CW_WALK[f] || 0) + 1; return fs0.apply(this, arguments); }; }
const premHit = k => { PREMISE_HITS[k] = (PREMISE_HITS[k] || 0) + 1; };
{
  const rr = SW.reformRepealed;
  SW.reformRepealed = function (Q, f) {
    const R = SW.REPEALS[f];
    if (!R || (R.after && Q[R.after]) || !(Q.date - Q['since_' + f] >= 12)) premHit('a repeal outside the rules');
    BACKLASH.repeals[f] = (BACKLASH.repeals[f] || 0) + 1;
    return rr.apply(this, arguments);
  };
  BACKLASH.repealTries = {};
  for (const c in SW.MINISTRY_ACTS) for (const A of SW.MINISTRY_ACTS[c]) if (A.repeal) {
    const v = A.vote;
    A.vote = function (Q) { BACKLASH.repealTries[A.id] = (BACKLASH.repealTries[A.id] || 0) + 1; return v.apply(this, arguments); };
  }
  const gb = SW.guildBankroll;
  SW.guildBankroll = function (Q) { const w = gb.apply(this, arguments); if (w && !(Q.guild_patience < 35)) premHit('guild money with patience at 35 or more'); return w; };
  const pc = SW.prepareCongress;
  SW.prepareCongress = function (Q) {
    const b = Q.congress_ready;
    if (b && Q.congress_why === 'revolt' && Q.date < (Q[b + '_congress_hold'] || -99)) premHit('a radical revolt during a congress hold');
    return pc.apply(this, arguments);
  };
  const dw = SW.doWalkout;
  SW.doWalkout = function (Q) { const k = Q.cg_why === 'revolt' ? 'after a revolt' : 'after a congress'; if (Q.walkout_ready) BACKLASH.walkoutCause[k] = (BACKLASH.walkoutCause[k] || 0) + 1; return dw.apply(this, arguments); };
}
// why each congress met, and where a text problem was seen (TEXTWHERE=1)
const CG_WHY = {};
{ const pc = SW.prepareCongress; SW.prepareCongress = function (Q) { if (Q.congress_ready) CG_WHY[Q.congress_why || '?'] = (CG_WHY[Q.congress_why || '?'] || 0) + 1; return pc.apply(this, arguments); }; }
const TEXT_WHERE = {};
// ---------------------------------------------------------------- text audit
// Every rendered paragraph and option is checked for broken text and for words that contradict the state at that moment.
// How to play, the Holocron and the Chancellery's tables are left out: they describe the rules, not the game in progress.
const TEXT_SKIP = /^(root|library|chancellery|game_over)/;
const flatText = el => Array.isArray(el) ? el.map(flatText).join('') : (typeof el === 'string' ? el : (el && el.content !== undefined ? flatText(el.content) : ''));
const plainText = s => s.replace(/<(br|\/li|\/td|\/tr|\/p|\/div)[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
const TEXT_RULES = [
  ['text: markup leaked', /undefined|NaN|\[object|\{!|!\}|\[\+|\+\]|\[\?|\?\]/],
  ['text: an empty insert shown as 0', /^0$|[.!?]\s+0(\s+[a-z]|$)/],
  ['text: a full stop running into the next sentence', /[a-z]\.[A-Z][a-z]/],
  ['text: a space before punctuation', /[a-z]\s+[.,;:!?](\s|$)/],
];
const TEXT_STATE = [
  ['text: Padmé after her death', /Padm[ée]/, Q => !Q.padme_alive, /died|death|dead|killed|funeral|grave|memory/],
  ['text: Dooku after his death', /Count Dooku (wants|sends|says|declares|orders|offers|will)|Dooku's (emissaries|envoys|side)|reaches Count Dooku|beside Count Dooku/, Q => Q.dooku_dead, null],
  ['text: Farr speaking after his death', /(declares|says|asks|warns|demands|insists) Onaconda Farr|Senator Farr (says|declares|asks|warns)/, Q => Q.farr_dead, null],
  ['text: Mas Amedda as Vice Chair after his fall', /Vice Chair (Mas )?Amedda/, Q => Q.amedda_arrested || Q.amedda_removed, null],
  ['text: the Defence Pact before it exists', /Defence Pact (squadrons|forces|fleets)/, Q => !Q.pact_formed, null],
  ['text: Senator Palpatine while he is Chancellor', /Senator Palpatine/, Q => Q.pal_chancellor, /accepts the office|once|former/],
  ['text: Jedi generals under the Service Act', /Jedi generals|General Kenobi|General Skywalker/, Q => Q.jedi_service_act, null],
];
function textAudit(scene, Q, raw) {
  if (TEXT_SKIP.test(scene)) return;
  const t = plainText(raw);
  if (!t) return;
  for (const [k, re] of TEXT_RULES) if (re.test(t)) { PREMISE_HITS[k] = (PREMISE_HITS[k] || 0) + 1; if (process.env.TEXTWHERE) { const w = k + ' @' + scene + ': ' + t.slice(0, 120); TEXT_WHERE[w] = (TEXT_WHERE[w] || 0) + 1; } }
  for (const [k, re, bad, unless] of TEXT_STATE) if (bad(Q) && re.test(t) && !(unless && unless.test(t))) PREMISE_HITS[k] = (PREMISE_HITS[k] || 0) + 1;
}
{
  const mk = engineLib.DendryEngine.prototype._makeDisplayContent;
  engineLib.DendryEngine.prototype._makeDisplayContent = function () {
    const r = mk.apply(this, arguments);
    try { for (const el of r) textAudit(this.state.sceneId, this.state.qualities, flatText(el)); } catch (e) {}
    return r;
  };
  const dc = engineLib.DendryEngine.prototype.displayChoices;
  engineLib.DendryEngine.prototype.displayChoices = function () {
    const r = dc.apply(this, arguments);
    try { for (const c of (this.ui.choices || [])) { textAudit(c.id, this.state.qualities, flatText(c.title)); if (c.subtitle) textAudit(c.id, this.state.qualities, flatText(c.subtitle)); } } catch (e) {}
    return r;
  };
}
const STEP_SEEN = {};
const STEP_RE = /\.(bureau_reform|civil_service|amedda|ethics|integrity|hhc_investigate|syndicates|relief_act|enfranchise|assembly|slavery_report|abolition|enforce|sentience|sunset|powers_review|oversight|command|patrols|pirate_campaign|officers|reform|attachment|new_order|judicials|navy|train|exercise|break|guilds|el_chest)$/;
let lastGovt = [];
const DECREES_TAKEN = {};
const MINORITY_OVER = new Map();
const MIC_SEEN = new WeakSet();
const LD_PLAYED = new WeakMap();
const PORK_AT_EXPEL = new WeakMap();
// the committees' patronage and demobilisation, as chosen by the Caucus
const COMMITTEE_HITS = {}, PORK_KINDS = {};
function checkPremises(id, Q, game, out) {
  Q._sim_scene = id;
  { const m = /^ca_road_(inst|rimward|pacifist|hawk)$/.exec(id); if (m && Q.rc_lead !== m[1]) out['a road card under another wing'] = (out['a road card under another wing'] || 0) + 1; }
  for (const k in Q) if (/^(inst|rimward|pacifist|hawk)_dissent$/.test(k) && Q[k] !== undefined) { out['faction dissent written'] = (out['faction dissent written'] || 0) + 1; delete Q[k]; break; }
  if (/^sa_\w+\.(patronage_\d|demobilise)$/.test(id)) { const k = id.replace(/_\d$/, ''); COMMITTEE_HITS[k] = (COMMITTEE_HITS[k] || 0) + 1; PORK_KINDS[id] = 1; }
  const g = (Q.govt_blocs || []).slice();
  const added = g.filter(b => lastGovt.indexOf(b) < 0);
  if (added.length || g.length !== lastGovt.length) {
    // only a newly added member must clear the bar with everyone (a government that loses a member is not a new government)
    if (Q.govt_bad_pair && added.length) {
      out['government formed with a pair below the bar'] = (out['government formed with a pair below the bar'] || 0) + 1;
      if (process.env.PREMWHERE) origLog('bad pair @' + id + ' govt ' + g.join(',') + ' (was ' + lastGovt.join(',') + ') leaders ' + g.map(b => b + ':' + (Q[b + '_leader_id'] || '')).join(' ') +
        ' rels ' + g.map(a => g.filter(m => m !== a).map(m => a + '-' + m + ' ' + Math.round(SW.rel(Q, a, m)) + (SW.relOk(Q, a, m) ? '' : '!')).join(' ')).join(' | ') + ' deal ' + (Q.el_deal_won || 0));
    }
    lastGovt = g;
  }
  if (id.indexOf('.') >= 0) { for (const [re, ok, label] of PREMISES) if (re.source.indexOf('\\.') >= 0 && re.test(id) && !ok(Q)) out[label] = (out[label] || 0) + 1; }
  if (id.indexOf('.') < 0) {
    for (const [re, ok, label] of PREMISES) if (re.test(id) && !ok(Q)) out[label] = (out[label] || 0) + 1;
    const sc = game.scenes[id];
    if (sc && (sc.tags || []).indexOf('event') >= 0 && Q.sidious_defeated && !Q.finale) out['event after Sidious fell'] = (out['event after Sidious fell'] || 0) + 1;
  }
  // a Last Days card is played once a game (biding our time is the one that repeats)
  if (/^ld_[a-z]+\.do$/.test(id) && id !== 'ld_bide.do') {
    let seen = LD_PLAYED.get(Q); if (!seen) { seen = {}; LD_PLAYED.set(Q, seen); }
    seen[id] = (seen[id] || 0) + 1;
    if (seen[id] > 1) out['a Last Days card played twice: ' + id] = (out['a Last Days card played twice: ' + id] || 0) + 1;
  }
  if (Q.clones > 0 && !Q.kamino_army) out['clones without an army'] = (out['clones without an army'] || 0) + 1;
  // after every-visit, each chair has a minister of its own bloc, and nobody chairs two committees
  if (id === 'post_event') {
    const seen = {};
    for (const c of SW.COMMITTEES) {
      const b = Q['chair_' + c], m = Q['minister_' + c];
      if (b && (!m || Q['minister_' + c + '_bloc'] !== b)) out['a chair without a minister of its bloc'] = (out['a chair without a minister of its bloc'] || 0) + 1;
      if (m && seen[m]) out['one minister chairing two committees'] = (out['one minister chairing two committees'] || 0) + 1;
      if (m) seen[m] = 1;
      if (b === 'rc' && Q['ministry_act_' + c] && Q['ministry_act_by_' + c] === 'rc') out['a ministry act by a committee the Caucus holds'] = (out['a ministry act by a committee the Caucus holds'] || 0) + 1;
    }
  }
  // the Chancellery: a checked power is never held, and the count is the powers held
  if (id === 'post_event' && SW.CHANCELLERY_POWERS) {
    let held = 0;
    for (const P of SW.CHANCELLERY_POWERS) {
      if (Q['chp_' + P.id] && Q['chp_' + P.id + '_state'] === 'held') out['a checked power still held'] = (out['a checked power still held'] || 0) + 1;
      if (Q['chp_' + P.id + '_state'] === 'held') held++;
    }
    if (held !== Q.chan_powers) out['the power count is wrong'] = (out['the power count is wrong'] || 0) + 1;
  }
  // no Jedi generals while the Jedi Service Act is law
  if (id === 'post_event' && Q.jedi_service_act && Q.jedi_generals) out['Jedi generals under the Service Act'] = (out['Jedi generals under the Service Act'] || 0) + 1;
  // a Caucus minority past its breaking point falls within a turn or two
  if (id === 'post_event' && SW.isCaucusMinority) {
    const over = SW.isCaucusMinority(Q) && Q.coalition_dissent >= Q.collapse_at && !Q.finale && !Q.election_due && !Q.game_ending;
    if (!over) MINORITY_OVER.delete(Q);
    else if (!MINORITY_OVER.has(Q)) MINORITY_OVER.set(Q, Q.time);
    else if (Q.time >= MINORITY_OVER.get(Q) + 2) { out['a Caucus minority past its breaking point that does not fall'] = (out['a Caucus minority past its breaking point that does not fall'] || 0) + 1; MINORITY_OVER.delete(Q); }
  }
  // the turn processor has just run every-visit: with nothing to hold him, Anakin is never below the rising line
  if (id === 'post_event' && Q.anakin_found && !Q.anakin_fallen && Q.anakin_fall < SW.anakinFloor(Q) - 1e-6) out['Anakin below the line with nothing to hold him'] = (out['Anakin below the line with nothing to hold him'] || 0) + 1;
  if (Q.pal_name === 'Chancellor\'s Bloc' && Q.chancellor_bloc !== 'pal') out['Palpatine\'s bloc named for an office it does not hold'] = (out['Palpatine\'s bloc named for an office it does not hold'] || 0) + 1;
  for (const b of (Q.govt_blocs || [])) if (Q.parties.indexOf(b) < 0) out['a bloc outside the Senate in government'] = (out['a bloc outside the Senate in government'] || 0) + 1;
  for (const b of SW.BLOCS) if (Q['merged_' + b] && Q.parties.indexOf(b) >= 0) out['a merged bloc back in the Senate'] = (out['a merged bloc back in the Senate'] || 0) + 1;
  if (Q.rc_chairs > (Q.chair_cap || 4) && Q.rc_in_govt) out['more chairs than partners allow'] = (out['more chairs than partners allow'] || 0) + 1;
  // party wings: one ruling wing per bloc, of that bloc; shares that add up to 100; no hidden wing before its moment
  if (id === 'post_event' && SW.WINGS) {
    const add = k => { out[k] = (out[k] || 0) + 1; };
    for (const b of SW.CONGRESS_BLOCS) {
      if (!SW.hasWings(Q, b)) continue;
      const rw = Q[b + '_wing'];
      if (!rw || !SW.WINGS[rw] || SW.WINGS[rw].bloc !== b || !SW.wingActive(Q, rw)) add('a bloc without a ruling wing of its own');
      const tot = SW.blocWings(Q, b).reduce((x, w) => x + SW.wingShare(Q, w), 0) + SW.nonAff(Q, b);
      if (Math.abs(tot - 100) > 0.5 || SW.blocWings(Q, b).some(w => !(SW.wingShare(Q, w) >= 0))) add('wing shares that do not add up to 100');
      if (b !== 'pal' && SW.LEADER_WING[Q[b + '_leader_id']] && SW.LEADER_WING[Q[b + '_leader_id']] !== rw) add('a bloc led by a figure of a wing that does not rule it');
    }
    // a splinter party only in a free slot: never two at once, and a wing's party is led by that wing's figure
    if (SW.splinterWing(Q) && Q.parties.indexOf('rfc') >= 0 && SW.LEADER_WING[Q.rfc_leader_id] !== Q.rfc_kind) add('a splinter party led by someone outside its wing');
    for (const w in SW.WINGS) if (SW.wingGone(Q, w) && SW.wingShare(Q, w) > 0) add('a wing that walked out still holding delegates');
    // no patronage, by us or by a ministry, once the corrupt senators are expelled
    if (Q.senators_expelled) {
      if (!PORK_AT_EXPEL.has(Q)) PORK_AT_EXPEL.set(Q, Q.pork_count || 0);
      else if ((Q.pork_count || 0) > PORK_AT_EXPEL.get(Q)) { add('patronage after the corruption reforms'); PORK_AT_EXPEL.set(Q, Q.pork_count || 0); }
    }
    if (Q.wing_seen_mic && !MIC_SEEN.has(Q)) { MIC_SEEN.add(Q); if (!(Q.war || Q.corporate_seceded >= 0.3)) add('a hidden wing before its moment'); }
  }
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
        if (process.env.TRAIL) { trace.sceneTrail = trace.sceneTrail || []; if (trace.sceneTrail[trace.sceneTrail.length - 1] !== eng.state.sceneId) { trace.sceneTrail.push(eng.state.sceneId + '@' + Q.time); if (trace.sceneTrail.length > 40) trace.sceneTrail.shift(); } if (steps > 50 && Q.date === undefined && !trace.trailShown) { trace.trailShown = 1; origLog('TRAIL game', gameIndex, trace.sceneTrail.join(' > ')); } }
        if (Q.time && trace.capital[Q.time] === undefined) trace.capital[Q.time] = Q.capital;
        if (Q.chancellor !== lastChancellor) { trace.chancellors.push(Q.bby + ':' + Q.chancellor_bloc + (process.env.TRACE ? '[fell' + (Q.govt_fell||0) + ' rc' + Q.rc_r + ' pal' + Q.pal_r + ' mod' + Q.mod_r + ' faith' + Math.round(Q.faith) + ' corr' + Math.round(Q.corruption) + ']' : '')); lastChancellor = Q.chancellor; }
        if (Q.rim_enfranchised && trace.enfranchisedAt === null) trace.enfranchisedAt = Q.date;
        if (Q.time !== trace._lt) { trace._lt = Q.time; if (Q.rc_has_access) trace.access = (trace.access || 0) + 1; }
        if (Q.time !== trace._lt2) { trace._lt2 = Q.time; trace.chairs = trace.chairs || {}; for (const c of SW.COMMITTEES) if (Q['chair_' + c] === 'rc') trace.chairs[c] = (trace.chairs[c] || 0) + 1; if (Q.rc_in_govt) trace.govt = (trace.govt || 0) + 1; }
        if (Q.finale && trace.afFinale === undefined) { trace.afFinale = Q.anakin_fall; trace.forces = SW.forces(Q); trace.navy = Q.navy_loyalty; trace.palV = Q.pal_r; trace.corr = Q.corruption; }
        if (Q.war && Q.time !== trace._lt3) { trace._lt3 = Q.time; const ws = SW.warStrength(Q); trace.warTurns = (trace.warTurns || 0) + 1; if (ws.ratio < 1) trace.warWeak = (trace.warWeak || 0) + 1; trace.ratioSum = (trace.ratioSum || 0) + Math.min(3, ws.ratio); trace.balSum = (trace.balSum || 0) + Q.war_balance; trace.minBal = Math.min(trace.minBal === undefined ? 9 : trace.minBal, Q.war_balance); }
        trace.maxDissent = Math.max(trace.maxDissent, Q.rad_inst || 0, Q.rad_rimward || 0, Q.rad_pacifist || 0, Q.rad_hawk || 0);
        if (Q.date >= 60 && !trace.lead60) trace.lead60 = Q.rc_lead || 'none';
        if (Q.war && !trace.leadWar) trace.leadWar = Q.rc_lead || 'none';
        if (Q.rc_lead) { trace.led = trace.led || {}; trace.led[Q.rc_lead] = 1; if (!Q.war && !Q.geonosis_seen) { trace.ledPre = trace.ledPre || {}; trace.ledPre[Q.rc_lead] = 1; } }
        if (Q.war && !trace.warSnap) trace.warSnap = {pal: Q.pal_wing || '', chanc: (Q.pal_chancellor || Q.puppet_chancellor) ? 1 : 0, rim: Q.rim_wing || ''};
        if (Q.date >= 60 && !trace.rim60) trace.rim60 = Q.rim_wing || '';
        if (Q.time !== trace._ltr) { trace._ltr = Q.time; for (const w in SW.WINGS) if (!(Q['rad_' + w] >= 0 && Q['rad_' + w] <= 100)) { premHit('radicalism outside 0-100'); break; } }
        if (game.scenes[eng.state.sceneId] && game.scenes[eng.state.sceneId].isCard) trace.cardPlays[eng.state.sceneId] = (trace.cardPlays[eng.state.sceneId] || 0) + 1;
        if (Q.time === lastTime) sameTimeSteps++; else { sameTimeSteps = 0; lastTime = Q.time; }
        if (sameTimeSteps > 400) { resolve({stuck: 'loop at ' + eng.state.sceneId, Q, steps, visits}); return; }
        if (sc.isHand) {
          const hand = eng.state.currentHands[eng.state.sceneId] || [];
          const decks = (eng.getCurrentChoices() || []).filter(c => game.scenes[c.id].isDeck && c.canChoose);
          const pinned = (eng.getCurrentChoices() || []).filter(c => game.scenes[c.id].isPinnedCard);
          const usablePinned = pinned.filter(c => c.id === 'chancellery' ? (Q.rc_chancellor && Q.chan_powers > 0 && Math.random() < (POLICY === 'smart' ? 0.25 : 0.15)) :
            ((c.id.indexOf('shuffle') >= 0) ? Math.random() < (POLICY === 'smart' && (Q.n_advisors || 0) < 3 ? 0.6 : 0.15) : Q.advisor_action_timer <= 0));
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
        if (process.env.STEPS) for (const c of (eng.getCurrentChoices() || [])) { const m = STEP_RE.exec(c.id); if (m) { const k = m[0].replace(/^\./, ''); const o = STEP_SEEN[k] = STEP_SEEN[k] || {seen: 0, can: 0, took: 0}; o.seen++; if (c.canChoose) o.can++; } }
        // a committee card shows exactly one kind of patronage before the corruption reforms, and none after
        if (/^sa_(finance|judiciary|security|rimaffairs)$/.test(eng.state.sceneId)) {
          const np = (eng.getCurrentChoices() || []).filter(c => /\.patronage_\d$/.test(c.id)).length;
          if (np !== (Q.senators_expelled ? 0 : 1)) PREMISE_HITS['a committee card showing ' + np + ' kinds of patronage'] = (PREMISE_HITS['a committee card showing ' + np + ' kinds of patronage'] || 0) + 1;
        }
        const choices = (eng.getCurrentChoices() || []).map((c, i) => ({c, i})).filter(x => x.c.canChoose);
        if (!choices.length) { resolve({stuck: 'no choices at ' + eng.state.sceneId, Q, steps, visits}); return; }
        // avoid undo and back in automated play
        let pool = choices.filter(x => x.c.id !== 'easy_discard' && x.c.id !== 'go_back');
        if (!pool.length) pool = choices;
        const ch = pick(pool, x => x.c.id);
        {
          const m = /^chancellery\.(d_|dr_|rv_)(\w+)$/.exec(ch.c.id);
          if (m && !Q.chan_can_decree) PREMISE_HITS['a decree without emergency decrees'] = (PREMISE_HITS['a decree without emergency decrees'] || 0) + 1;
          if (m && m[1] === 'dr_' && Q['dok_' + m[2]] !== 1) PREMISE_HITS['a reform decreed when its step is not open'] = (PREMISE_HITS['a reform decreed when its step is not open'] || 0) + 1;
          if (m) DECREES_TAKEN[m[1]] = (DECREES_TAKEN[m[1]] || 0) + 1;
        }
        if (process.env.STEPS) { const m = STEP_RE.exec(ch.c.id); if (m) STEP_SEEN[m[0].replace(/^\./, '')].took++; }
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
      audit.an = audit.an || {af: [], good: 0, bad: 0, shmiFree: 0, shmiDead: 0, chairs: {}, govt: [], ratio: [], rep: [], sith: [], found: 0};
      if (t.afFinale !== undefined) { audit.an.af.push(t.afFinale); if (t.afFinale <= 4) audit.an.good++; if (t.afFinale >= 6.5) audit.an.bad++; audit.an.ratio.push(t.forces.ratio); audit.an.rep.push(t.forces.rep); audit.an.sith.push(t.forces.sith); }
      if (Q.shmi_freed) audit.an.shmiFree++; if (Q.shmi_dead) audit.an.shmiDead++; if (Q.anakin_found) audit.an.found++;
      for (const c of SW.COMMITTEES) audit.an.chairs[c] = (audit.an.chairs[c] || 0) + ((t.chairs || {})[c] || 0);
      audit.an.govt.push(t.govt || 0);
      if (t.forces) { audit.an.fparts = audit.an.fparts || {n: 0}; audit.an.fparts.n++; for (const k in t.forces.repParts) audit.an.fparts['our ' + k] = (audit.an.fparts['our ' + k] || 0) + t.forces.repParts[k];
        for (const k in t.forces.sithParts) audit.an.fparts['his ' + k] = (audit.an.fparts['his ' + k] || 0) + t.forces.sithParts[k]; audit.an.fparts.navy = (audit.an.fparts.navy || 0) + (t.navy || 0); audit.an.fparts.palV = (audit.an.fparts.palV || 0) + (t.palV || 0); audit.an.fparts.corr = (audit.an.fparts.corr || 0) + (t.corr || 0); }
      audit.wr = audit.wr || {turns: 0, weak: 0, ratio: 0, bal: 0, minBal: [], endBal: [], droid: [], clones: [], sec: [], atWarEnd: 0};
      audit.wr.turns += t.warTurns || 0; audit.wr.weak += t.warWeak || 0; audit.wr.ratio += t.ratioSum || 0; audit.wr.bal += t.balSum || 0;
      if (t.minBal !== undefined) audit.wr.minBal.push(t.minBal); if (Q.war) { audit.wr.atWarEnd++; audit.wr.endBal.push(Q.war_balance); }
      audit.wr.droid.push(Q.droid_armies || 0); audit.wr.clones.push(Q.clones || 0); audit.wr.sec.push(Q.seceded_total || 0);
      audit.wr.hist = audit.wr.hist || {}; audit.wr.wl = audit.wr.wl || {}; audit.wr.secR = audit.wr.secR || [];
      if (Q.war) { const rr = SW.warStrength(Q).ratio; const bk = rr < 0.6 ? '<0.6' : rr < 0.8 ? '0.6-0.8' : rr < 1 ? '0.8-1' : rr < 1.25 ? '1-1.25' : '1.25+'; audit.wr.hist[bk] = (audit.wr.hist[bk] || 0) + 1;
        if (Q.sidious_defeated) audit.wr.hist['beaten ' + bk] = (audit.wr.hist['beaten ' + bk] || 0) + 1; }
      if (Q.war) { const sc = SW.warScore(Q), sb = sc <= -3 ? '<=-3' : sc < 0 ? '-3..0' : sc < 2 ? '0..2' : sc < 4 ? '2..4' : '4+'; audit.wr.score = audit.wr.score || {}; audit.wr.score[(Q.sidious_defeated ? 'beaten ' : '') + sb] = (audit.wr.score[(Q.sidious_defeated ? 'beaten ' : '') + sb] || 0) + 1; }
      if (Q.war) { const sc = SW.warScore(Q); audit.wr.byEnd = audit.wr.byEnd || {}; const k = (Q.ending || 'none') + (sc <= -2 ? ' losing' : sc < 1 ? ' even' : ' winning'); audit.wr.byEnd[k] = (audit.wr.byEnd[k] || 0) + 1; }
      if (Q.ending === 'admirals') { audit.wr.adm = audit.wr.adm || {}; const k = Q.admirals_strike ? 'strike after the arrest' : (Q.coup_done ? 'coup before the finale' : ('no restoration, powers ' + Q.emergency_powers + (Q.restoration_seen ? ', vote lost' : ', no vote'))); audit.wr.adm[k] = (audit.wr.adm[k] || 0) + 1; }
      if (process.env.RESTDBG && Q.restoration_seen && Q.rest_vote < 50 && Q.rest_stance) origLog('RESTFAIL vote ' + Math.round(Q.rest_vote) + ' ep ' + Q.emergency_powers + ' fear ' + Math.round(Q.fear) + ' ' + Q.parties.map(b => b + ' ' + Math.round(Q[b + '_r'] || 0) + '%@' + (Q.rest_stance[b] !== undefined ? Q.rest_stance[b].toFixed(2) : '-')).join(' ') + ' rc_chanc ' + (Q.rc_chancellor || 0) + ' secfold ' + (Q.sec_folded || 0) + ' hand ' + JSON.stringify(SW.palBorrowed(Q)));
      const wl = Q.worlds_lost || 0; audit.wr.wl[wl >= 6 ? '6+' : wl] = (audit.wr.wl[wl >= 6 ? '6+' : wl] || 0) + 1; audit.wr.secR.push(Q.sec_r || 0);
      for (const c in t.cardPlays) if (t.cardPlays[c] >= 6) audit.repeatCards[c] = (audit.repeatCards[c] || 0) + 1;
      // leaders
      audit.contests.push(Q.leadership_contests || 0);
      audit.congresses = audit.congresses || []; audit.congresses.push(Q.congresses || 0);
      audit.pork = (audit.pork || 0) + (Q.pork_count || 0);
      audit.cw = audit.cw || {lead60: {}, leadWar: {}, leadEnd: {}, led: {}, ledPre: {}, roads: {}, roadEnd: {}, walk: {}, walkN: 0};
      { const c = audit.cw, inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
        if (t.lead60) inc(c.lead60, t.lead60); if (t.leadWar) inc(c.leadWar, t.leadWar); inc(c.leadEnd, Q.rc_lead || 'none');
        for (const f in t.led || {}) inc(c.led, f); for (const f in t.ledPre || {}) inc(c.ledPre, f);
        for (const f of SW.FACTIONS) if (Q['road_' + f] >= 1) inc(c.roads, f + ':' + Q['road_' + f]);
        if (['second_reformation', 'republic_whole', 'long_peace', 'senate_sword'].indexOf(Q.ending) >= 0) inc(c.roadEnd, Q.ending);
        const need = {second_reformation: Q.charter_ratified, republic_whole: Q.road_rimward >= 3, long_peace: Q.road_pacifist >= 3, senate_sword: Q.sword_success};
        if (need[Q.ending] === 0 || need[Q.ending] === false || need[Q.ending] === undefined && Q.ending in need) premHit('a road ending without its road');
        c.walkN += Q.caucus_walkouts || 0; }
      audit.bl = audit.bl || {rim60: {}, rimEnd: {}, palWar: {}, unrest: 0, revolts: 0, stoke: 0, bankrolls: 0, peakRad: {}};
      if (t.rim60 !== undefined) audit.bl.rim60[t.rim60 || 'none'] = (audit.bl.rim60[t.rim60 || 'none'] || 0) + 1;
      audit.bl.rimEnd[Q.rim_wing || 'none'] = (audit.bl.rimEnd[Q.rim_wing || 'none'] || 0) + 1;
      if (t.warSnap) { const k = (t.warSnap.chanc ? 'Chancellor: ' : 'not Chancellor: ') + (t.warSnap.pal || 'none'); audit.bl.palWar[k] = (audit.bl.palWar[k] || 0) + 1; }
      audit.bl.unrest += Q.unrest_events || 0; audit.bl.revolts += Q.revolts || 0; audit.bl.stoke += Q.scheme_seen_stoke_grievance || 0; audit.bl.bankrolls += Q.guild_bankrolls || 0;
      audit.walkouts = audit.walkouts || {n: 0, games: 0, splinters: 0, where: {}};
      audit.walkouts.n += Q.walkouts || 0; if (Q.walkouts) audit.walkouts.games++; audit.walkouts.splinters += Q.splinters || 0;
      for (const w in SW.WINGS) if (Q['walked_' + w]) audit.walkouts.where[w + '>' + Q['walked_' + w]] = (audit.walkouts.where[w + '>' + Q['walked_' + w]] || 0) + 1;
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
      audit.sep = audit.sep || {mom: [], addr: [], lost: 0, lib: 0, seen: 0, averted: 0, happened: 0, done: {}, tracks: {}, shmi: 0, humil: 0, hhcEv: [], hhcDisc: 0,
        hold: [], breaks: 0, chests: 0, modEnd: [], indEnd: [], palEnd: [], strike: 0, fled: 0, hutt: 0, raids: [], amedda: 0};
      const se = audit.sep;
      se.mom.push(Q.sep_momentum || 0); se.addr.push(Q.rim_addressed || 0); se.lost += Q.worlds_lost || 0; se.lib += Q.worlds_liberated || 0;
      se.seen += Q.threats_seen || 0; se.averted += Q.threats_averted || 0; se.happened += Q.threats_happened || 0;
      for (const t of ['rim', 'rfc', 'rimward', 'sec']) if (Q[t + '_done']) se.done[t] = (se.done[t] || 0) + 1;
      for (const tk in SW.TRACKS) se.tracks[tk] = (se.tracks[tk] || 0) + (SW.TRACKS[tk].level(Q) || 0);
      if (Q.shmi_freed && Q.slavery_enforced) se.shmi++; if (Q.pirate_humiliation) se.humil++; se.hhcEv.push(Q.hhc_events || 0); if (Q.hhc_discredited) se.hhcDisc++;
      se.hold.push(Q.guild_hold || 0); se.breaks += Q.guild_breaks || 0; if (Q.el_chest_taken) se.chests++;
      se.modEnd.push(Q.mod_votes || 0); se.indEnd.push(Q.ind_votes || 0); se.palEnd.push(Q.pal_votes || 0);
      if (Q.admirals_strike) se.strike++; if (Q.sidious_fled) se.fled++; if (Q.hutt_deal) se.hutt++; se.raids.push(Q.pirate_raids || 0); if (Q.amedda_arrested) se.amedda++;
      audit.cm = audit.cm || {pres: {}, rcVotes: [], rcSeats: [], runs: []};
      for (const rg of SW.REGIONS) (audit.cm.pres[rg] = audit.cm.pres[rg] || []).push(Q['cm_presence_' + rg] || 0);
      audit.cm.rcVotes.push(Q.rc_votes || 0); audit.cm.rcSeats.push(Q.rc_r || 0); audit.cm.runs.push(Q.campaigns_run || 0);
      const ar = audit.rel; ar.swings += Q.broken_swings || 0; ar.minority += Q.broken_minority || 0; ar.collapse += Q.broken_collapse || 0; ar.bureau += Q.broken_bureau || 0;
      ar.blocked += Q.coal_blocked_games || 0; ar.delivered += Q.delivered || 0; ar.kept += Q.pledges_kept || 0; ar.size.push((Q.govt_blocs || []).length);
      ar.modRim.push(SW.rel(Q, 'mod', 'rim')); ar.guildMod.push(SW.rel(Q, 'guild', 'mod')); ar.rimSec.push(SW.rel(Q, 'rim', 'sec')); ar.palSec.push(SW.rel(Q, 'pal', 'sec'));
      // which way through the crisis did this game take, and did it work?
      const route = Q.gambit_kind === 'exposed' ? 'unmasked in the Senate' : (Q.gambit_kind === 'coup' ? 'coup from outside office' : (Q.gambit_kind === 'decree' ? (Q.peace_achieved ? 'decree after peace' : 'decree after victory') :
        (r.visits && r.visits.fin_coruscant ? 'Jedi arrest (' + (Q.known_by || 'none') + ')' : 'lost before the finale')));
      audit.routes = audit.routes || {};
      const ra = audit.routes[route] = audit.routes[route] || {n: 0, beaten: 0, good: 0};
      ra.n++; if (Q.sidious_defeated) ra.beaten++; if (['reborn', 'endures', 'second_reformation', 'republic_whole', 'long_peace', 'senate_sword'].indexOf(Q.ending) >= 0) ra.good++;
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
    if (VERBOSE) origLog(g, e, Q.date_label, 'steps', r.steps, r.stuck || '', 'ep', Q.emergency_powers, 'ev', (Q.evidence || 0).toFixed(1), 'gp', Math.round(Q.grand_plan), 'rc', Q.rc_r, 'pal', Q.pal_r, 'ch', Q.chancellor);
  }
  origLog('policy', POLICY_ARG, 'games', GAMES);
  origLog('endings', JSON.stringify(endings));
  origLog('stuck', JSON.stringify(stucks));
  origLog('NaN qualities', JSON.stringify(nanKeys));
  origLog('premise violations', JSON.stringify(PREMISE_HITS));
  origLog('audit: decrees taken by our Chancellors', JSON.stringify(DECREES_TAKEN));
  origLog('stats', JSON.stringify(Object.assign(stats, {turns: (stats.turns / GAMES).toFixed(1), reforms: (stats.reforms / GAMES).toFixed(2)})));
  const errCount = {};
  for (const e of errors) { const k = e.slice(0, 160); errCount[k] = (errCount[k] || 0) + 1; }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  origLog('audit: capital at turn 20 avg ' + avg(audit.cap20) + ', turn 40 avg ' + avg(audit.cap40) + ', end avg ' + avg(audit.capEnd) + ', end max ' + Math.max(...audit.capEnd));
  origLog('audit: Caucus won first election ' + audit.rcWon32 + 'x; Palpatine later Chancellor in ' + audit.rcWon32ThenPal + '; Caucus still Chancellor at end ' + audit.rcHeldToEnd);
  if (audit.enfWhere) origLog('audit: enfranchised games, where/sep: ' + Object.keys(audit.enfWhere).slice(0, 12).join(' | '));
  origLog('audit: enfranchised before 22 BBY in ' + audit.enf + ' games; avg seceded ' + avg(audit.enfSeceded) + '%; war in ' + audit.enfWar);
  origLog('audit: congresses by reason ' + JSON.stringify(CG_WHY));
  if (audit.cw) origLog('audit: our wings: leading at month 60 ' + JSON.stringify(audit.cw.lead60) + ', at the war ' + JSON.stringify(audit.cw.leadWar) + ', at the end ' + JSON.stringify(audit.cw.leadEnd) + '; ever led (games) ' + JSON.stringify(audit.cw.led) + ', before the war ' + JSON.stringify(audit.cw.ledPre) +
    '; roads ' + JSON.stringify(audit.cw.roads) + '; road endings ' + JSON.stringify(audit.cw.roadEnd) + '; our walkouts ' + audit.cw.walkN + ' ' + JSON.stringify(CW_WALK));
  if (audit.bl) {
    origLog('audit: backlash: unrest events ' + audit.bl.unrest + ', revolt congresses ' + audit.bl.revolts + ', agitators sent ' + audit.bl.stoke + ', guild-funded congresses ' + audit.bl.bankrolls +
      '; walkouts ' + JSON.stringify(BACKLASH.walkoutCause) + '; repeals ' + JSON.stringify(BACKLASH.repeals) + ' of tries ' + JSON.stringify(BACKLASH.repealTries));
    origLog('audit: the Rim\'s ruling wing at month 60 ' + JSON.stringify(audit.bl.rim60) + ', at the end ' + JSON.stringify(audit.bl.rimEnd) + '; Palpatine\'s bloc at the war ' + JSON.stringify(audit.bl.palWar));
  }
  if (audit.walkouts) origLog('audit: walkouts ' + audit.walkouts.n + ' in ' + audit.walkouts.games + ' games, splinter parties ' + audit.walkouts.splinters + ', by wing ' + JSON.stringify(audit.walkouts.where));
  { const ours = Object.keys(COMMITTEE_HITS).filter(k => /patronage/.test(k)).reduce((a, k) => a + COMMITTEE_HITS[k], 0);
    origLog('audit: committee options chosen ' + JSON.stringify(COMMITTEE_HITS) + '; kinds of patronage we chose ' + Object.keys(PORK_KINDS).filter(k => /patronage/.test(k)).length + ' of 24; patronage by the ministries ' + ((audit.pork || 0) - ours) + ', ' + Object.keys(MIN_PORK_KINDS).length + ' kinds of 24'); }
  if (process.env.TEXTWHERE) for (const w in TEXT_WHERE) origLog('text where: ' + TEXT_WHERE[w] + 'x ' + w);
  origLog('audit: faction contests per game avg ' + avg(audit.contests) + ', party congresses avg ' + avg(audit.congresses || [0]) + ', leader changes avg ' + avg(audit.changes) + ', coalition offers refused by a leader ' + audit.refused);
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
  if (audit.sep) { const e = audit.sep;
    origLog('audit: separatists: momentum at end avg ' + avg(e.mom) + ', Rim addressed avg ' + avg(e.addr) + '%; worlds lost ' + e.lost + ', liberated ' + e.lib +
      '; Sidious fled in ' + e.fled + ' games; Hutt deals ' + e.hutt + '; admirals struck after the arrest in ' + e.strike);
    origLog('audit: defections: warnings ' + e.seen + ', averted ' + e.averted + ', happened ' + e.happened + ' ' + JSON.stringify(e.done) +
      '; end support Moderates ' + avg(e.modEnd) + '%, Independents ' + avg(e.indEnd) + '%, Palpatine ' + avg(e.palEnd) + '%');
    origLog('audit: reform track levels (sum over games) ' + JSON.stringify(e.tracks) + '; Mas Amedda arrested ' + e.amedda + '; Shmi freed by enforcement ' + e.shmi +
      '; pirate humiliations ' + e.humil + '; pirate raids avg ' + avg(e.raids) + '; High Human Culture events avg ' + avg(e.hhcEv) + ', discredited ' + e.hhcDisc +
      '; guild debts at end avg ' + avg(e.hold) + ', breaks ' + e.breaks + ', war chests taken ' + e.chests); }
  if (audit.cm) { const c = audit.cm;
    origLog('audit: campaigns per game avg ' + avg(c.runs) + '; presence at end ' + SW.REGIONS.map(rg => rg + ' ' + avg(c.pres[rg])).join(', ') +
      '; Caucus at end: support ' + avg(c.rcVotes) + '%, seats ' + avg(c.rcSeats) + '%'); }
  if (audit.rel) { const r = audit.rel;
    origLog('audit: relations: broken-system swings ' + r.swings + ' (minority governments ' + r.minority + ', collapses ' + r.collapse + ', bureaucrats ' + r.bureau + '); every Caucus coalition blocked ' + r.blocked + 'x; deliveries ' + r.delivered + ', pledges kept ' + r.kept + '; government size at end avg ' + avg(r.size) + '; end relations mod-rim ' + avg(r.modRim) + ', guild-mod ' + avg(r.guildMod) + ', rim-sec ' + avg(r.rimSec) + ', pal-sec ' + avg(r.palSec)); }
  if (audit.an) { const e = audit.an; origLog('audit: anakin: found ' + e.found + ', fall at the finale avg ' + avg(e.af) + ' (4 or less in ' + e.good + ', 6.5 or more in ' + e.bad + '); Shmi freed ' + e.shmiFree + ', died ' + e.shmiDead +
    '; forces at the finale: ours avg ' + avg(e.rep) + ', his avg ' + avg(e.sith) + ', ratio avg ' + (e.ratio.length ? (e.ratio.reduce((x, y) => x + y, 0) / e.ratio.length).toFixed(2) : '-') +
    '; turns in government avg ' + avg(e.govt) + '; chair-turns per game ' + SW.COMMITTEES.map(c => c + ' ' + (e.chairs[c] / GAMES).toFixed(1)).join(', ')); }
  if (audit.wr) { const e = audit.wr; origLog('audit: war: turns per game ' + (e.turns / GAMES).toFixed(1) + ', share of them with the Confederacy stronger ' + Math.round(100 * e.weak / Math.max(1, e.turns)) + '%, ratio avg ' + (e.ratio / Math.max(1, e.turns)).toFixed(2) +
    ', balance avg ' + (e.bal / Math.max(1, e.turns)).toFixed(1) + ', lowest balance avg ' + avg(e.minBal) + '; still at war at the end in ' + e.atWarEnd + ' (balance avg ' + avg(e.endBal) + '); droid armies at end avg ' + avg(e.droid) + ', clones avg ' + avg(e.clones) + ', seceded avg ' + avg(e.sec) + '%; ratio at the end ' + JSON.stringify(e.hist) + '; war score at the end ' + JSON.stringify(e.score || {}) + '; admirals by route ' + JSON.stringify(e.adm || {}) + '; by ending ' + JSON.stringify(e.byEnd || {}) + '; worlds lost per game ' + JSON.stringify(e.wl) + '; Security Bloc seats at end avg ' + avg(e.secR)); }
  if (audit.an && audit.an.fparts) { const fp = audit.an.fparts; origLog('audit: forces at the finale by part: ' + Object.keys(fp).filter(k => k !== 'n').map(k => k + ' ' + (fp[k] / fp.n).toFixed(1)).join(', ')); }
  if (process.env.STEPS) origLog('audit: steps offered/affordable/taken: ' + Object.keys(STEP_SEEN).sort().map(k => k + ' ' + STEP_SEEN[k].seen + '/' + STEP_SEEN[k].can + '/' + STEP_SEEN[k].took).join(', '));
  origLog('audit: bureaucrat purges ' + audit.purges + ' (in ' + audit.purgeGames + ' games), Vice Chair gavels ' + audit.gavels);
  origLog('audit: leaders at the end: ' + Object.entries(audit.endLeaders).sort().map(([k, v]) => k + '=' + v).join(' '));
  origLog('audit: avg peak radicalism of our wings ' + avg(audit.maxDissent) + '; cards played 6+ times (games): ' + JSON.stringify(audit.repeatCards));
  origLog('paths:'); Object.keys(paths).sort((a, b) => paths[b] - paths[a]).slice(0, 18).forEach(k => origLog('  ' + paths[k] + 'x ' + k));
  origLog('errors', Object.keys(errCount).length);
  for (const k of Object.keys(errCount).slice(0, 25)) origLog('  ' + errCount[k] + 'x ' + k);
  
})();
