/*
 * names.js - plain names for the game's qualities, used by the card and event editor.
 * Anything not listed here is shown by its id. Add to the list freely: it only affects the editor.
 */
(function (root) {
  'use strict';

  var BLOCS = {
    mod: 'the Core Moderates', ind: 'the Independents', rim: 'the Rimward Coalition', sec: 'the Security Bloc',
    guild: 'the Commerce Guilds', pal: "Palpatine's bloc", cis: 'the Separatist Caucus', rfc: 'the breakaway party',
    jedi: 'the Jedi', bureau: 'the Senate bureaucracy', rc: 'the Caucus'
  };
  var FACTIONS = {inst: 'Institutionalist', rimward: 'Rimward', pacifist: 'Pacifist', hawk: 'Hawk'};
  var REGIONS = {core: 'the Core Worlds', colonies: 'the Colonies', midrim: 'the Mid Rim', outer: 'the Outer Rim', corporate: 'the corporate worlds'};

  var NAMES = {
    capital: 'Political capital',
    faith: 'Faith in the Republic',
    corruption: 'Corruption',
    fear: 'Fear',
    evidence: 'Evidence against the Sith',
    senate_resolve: 'Senate resolve',
    emergency_powers: "The Chancellor's emergency powers",
    rc_momentum: 'Caucus momentum',
    treasury: 'Treasury',
    debt: 'Debt to the Banking Clan',
    inflation: 'Inflation',
    trade: 'Hyperlane trade',
    rim_hardship: 'Hardship in the Outer Rim',
    war: 'The Clone Wars have begun',
    war_balance: 'The balance of the war',
    war_weariness: 'War weariness',
    finale: 'The Last Days have begun',
    finale_day: 'Day of the Last Days',
    game_ending: 'The game is ending',
    date: 'Months since the start (33 BBY = 0)',
    bby: 'Year (BBY)',
    month: 'Month',
    time: 'Turn number',
    turn_actions: 'Actions this turn (playing a card ends the turn)',
    last_card_timer: 'Card returned by a discard',
    jedi_suspicion: "The Jedi's suspicion of the Sith",
    jedi_standing: 'Standing of the Jedi Order',
    anakin_fall: "Anakin's slide toward the dark side",
    anakin_found: 'Anakin has been found',
    n_advisors: 'Number of advisors',
    peace_talks: 'Progress of peace talks',
    judicial_forces: 'Strength of the Judicial Forces',
    member_forces: "Member worlds' own forces",
    navy_loyalty: "The Navy's loyalty to the Senate",
    grand_plan: "Progress of the Sith Lord's plan",
    rc_chancellor: 'The Caucus holds the Chancellery',
    rc_in_govt: 'The Caucus is in government',
    rc_chairs: 'Committees the Caucus chairs',
    pal_chancellor: 'Palpatine is Chancellor',
    sidious_known: 'Sidious has been identified',
    sidious_defeated: 'Sidious has been defeated',
    dooku_movement: "Dooku's movement has begun",
    pact_formed: 'The Defence Pact has formed',
    cis_formed: 'The Separatist Caucus has formed',
    kamino_army: 'The clone army exists',
    kamino_known: 'The Kamino army is known',
    clones: 'Clone troopers',
    clone_trust: 'Trust in the clones',
    guild_embargo: 'Guild embargo',
    guild_patience: "The guilds' patience",
    gs_step: "The guilds' escalation step",
    patrons_goodwill: "Our Core patrons' goodwill",
    leverage: 'Leverage',
    coalition_dissent: 'Unrest in our coalition',
    bureau_dossier: "The bureaucrats' case against us",
    senate_guard_reformed: 'The Senate Guard has been reformed',
    term_limits_protected: 'Term limits are protected',
    emergency_sunset: 'Emergency powers have sunset clauses',
    army_oversight: 'The army has Senate oversight',
    banking_independent: 'The Banking Clan is independent',
    free_press: 'The free press is protected',
    warrant: 'A warrant has been issued',
    arrest_planned: 'An arrest is planned',
    padme_alive: 'Padmé is alive',
    farr_dead: 'Onaconda Farr is dead',
    chair_finance: 'Chair of Finance & Commerce',
    chair_security: 'Chair of Security',
    chair_judiciary: 'Chair of Judiciary & Intelligence',
    chair_rimaffairs: 'Chair of Rim Affairs',
    election_due: 'A Chancellor election is due',
    started: 'The game has started',
    difficulty: 'Difficulty (−1 Story, 0 Senator, 1 Jedi Master)',
    bacta: 'Bacta supply', tibanna: 'Tibanna supply', spice: 'Spice supply',
    tax_stance: 'Tax stance',
    wc_command: 'War Council: who commands',
    leak_pending: 'A leak is about to break',
    modded_with: 'Name of the mod in play'
  };

  // Advisors
  ['antilles', 'bel_iblis', 'farr', 'amidala', 'mothma', 'organa', 'valorum', 'chuchi'].forEach(function (a) {
    NAMES['adv_' + a] = 'Advisor: ' + a.replace('_', ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  });

  function pretty(id) { return id.replace(/_/g, ' '); }

  // Plain name for a quality id.
  function name(id) {
    if (!id) return '';
    if (NAMES[id]) return NAMES[id];
    var m;
    if ((m = /^([a-z]+)_relation$/.exec(id)) && BLOCS[m[1]]) return 'Relations with ' + BLOCS[m[1]];
    if ((m = /^([a-z]+)_favour$/.exec(id)) && BLOCS[m[1]]) return 'Favour of the leader of ' + BLOCS[m[1]];
    if ((m = /^([a-z]+)_dissent$/.exec(id)) && FACTIONS[m[1]]) return FACTIONS[m[1]] + ' faction dissent';
    if ((m = /^([a-z]+)_strength$/.exec(id)) && FACTIONS[m[1]]) return FACTIONS[m[1]] + ' faction strength';
    if ((m = /^([a-z]+)_sep$/.exec(id)) && REGIONS[m[1]]) return 'Separatism in ' + REGIONS[m[1]];
    if ((m = /^cm_presence_([a-z]+)$/.exec(id)) && REGIONS[m[1]]) return 'Caucus campaign presence in ' + REGIONS[m[1]];
    if ((m = /^([a-z]+)_([a-z]+)$/.exec(id)) && REGIONS[m[1]] && BLOCS[m[2]]) return 'Support for ' + BLOCS[m[2]] + ' in ' + REGIONS[m[1]];
    if ((m = /^(.+)_timer$/.exec(id))) return 'Cooldown: ' + pretty(m[1]) + ' (turns)';
    if ((m = /^(.+)_seen$/.exec(id))) return 'Already seen: ' + pretty(m[1]);
    if ((m = /^(.+)_used_today$/.exec(id))) return 'Used today: ' + pretty(m[1]);
    return null;
  }

  var CARD_IMAGES = ['card_campaign', 'card_civil', 'card_clones', 'card_confront', 'card_credits', 'card_disunity', 'card_enemy',
    'card_forces', 'card_holonet', 'card_jedi', 'card_law', 'card_pact', 'card_peace', 'card_platform', 'card_relations',
    'card_rim', 'card_routine', 'card_senate', 'card_shadow', 'card_shuffle'];
  var EVENT_IMAGES = ['ev_senate', 'ev_jedi', 'ev_shadow', 'ev_war', 'ev_trade', 'ev_chancellery', 'ev_naboo', 'ev_separatist',
    'ev_rim', 'ev_clones', 'ev_peace', 'ev_holonet', 'ev_law'];

  root.TA_NAMES = {name: name, list: NAMES, blocs: BLOCS, cardImages: CARD_IMAGES, eventImages: EVENT_IMAGES};
}(this));
