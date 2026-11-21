/*
 * sw.js - shared game logic for "Thunderous Applause".
 *
 * Plain functions over the qualities object (Q), so the same code runs in the
 * browser (window.SW) and in Node test harnesses (require('./sw.js')).
 * No DOM access in here.
 */
(function (g) {
  'use strict';

  var SW = {};
  // test-only switches for the simulator (SW_OFF=gavel,bought,...); always empty in the browser
  SW.OFF = (typeof process !== 'undefined' && process.env && process.env.SW_OFF) ? process.env.SW_OFF.split(',') : [];
  SW.off = function (k) { return SW.OFF.indexOf(k) >= 0; };
  SW.SAVE_VERSION = 1;

  // ---------------------------------------------------------------- metadata
  SW.REGIONS = ['core', 'colonies', 'midrim', 'outer', 'corporate'];
  SW.REGION_NAMES = {
    core: 'Core Worlds', colonies: 'Colonies & Inner Rim', midrim: 'Mid Rim & Expansion Region',
    outer: 'Outer Rim Territories', corporate: 'Corporate holdings'
  };
  SW.BASE_WEIGHTS = {core: 18, colonies: 17, midrim: 22, outer: 27, corporate: 16};

  SW.BLOCS = ['rc', 'mod', 'pal', 'guild', 'rim', 'sec', 'ind', 'cis', 'rfc'];
  SW.BLOC_COLORS = {
    rc: '#3b82c4', mod: '#cfc7a4', pal: '#b3141b', guild: '#c58b2b', rim: '#d9661f',
    sec: '#6d7a84', ind: '#6b9e78', cis: '#8a5cb8', rfc: '#e8b84a'
  };
  SW.BLOC_DEFAULT_NAMES = {
    rc: 'Ruusan Caucus', mod: 'Core Moderates', pal: 'Chommell Circle', guild: 'Commerce Guilds',
    rim: 'Rimward Coalition', sec: 'Security Bloc', ind: 'Independents', cis: 'Separatist Caucus',
    rfc: 'Rim Freedom Caucus'
  };
  SW.BLOC_SHORT = {rc: 'RC', mod: 'CM', pal: 'CC', guild: 'CG', rim: 'RW', sec: 'SB', ind: 'IND', cis: 'SEP', rfc: 'RFC'};

  SW.FACTIONS = ['inst', 'rimward', 'pacifist', 'hawk'];
  SW.FACTION_NAMES = {inst: 'Institutionalists', rimward: 'Rimward', pacifist: 'Pacifists', hawk: 'Hawks'};

  SW.COMMITTEES = ['finance', 'judiciary', 'security', 'rimaffairs', 'constitution', 'jedi'];
  SW.COMMITTEE_NAMES = {
    finance: 'Finance & Commerce', judiciary: 'Judiciary & Intelligence',
    security: 'Security & Defence', rimaffairs: 'Outer Rim Affairs',
    constitution: 'Constitutional Affairs', jedi: 'Jedi Affairs'
  };
  // what each chair is worth in leverage when a government shares them out
  SW.COMMITTEE_COST = {finance: 20, judiciary: 20, security: 10, rimaffairs: 10, constitution: 5, jedi: 5};
  // Patronage: each committee's own way of buying friends, until the Senate's corruption reforms are complete.
  // region: where it buys support; act: what a bloc's ministry is said to have done.
  // Patronage: six kinds for each of four committees, each boosting one region. A card offers one, picked afresh
  // whenever the card is drawn; the ministries rotate through them too. Variant k is SW.PORK[c][k - 1], and the
  // card's option @patronage_k shows it. act: how The Committees Report puts it.
  SW.PORK = {
    finance: [
      {region: 'midrim', act: 'handed out hyperlane subsidies to friendly sectors'},
      {region: 'core', act: 'let friendly Core banks underwrite the Republic\'s bonds'},
      {region: 'colonies', act: 'handed the Corellian Run\'s customs posts to friendly sectors'},
      {region: 'midrim', act: 'paid price supports to friendly agriworlds'},
      {region: 'outer', act: 'paid friendly Rim worlds to rebuild their spaceports'},
      {region: 'colonies', act: 'gave the Republic\'s freight contracts to friendly haulers'}
    ],
    judiciary: [
      {region: 'core', act: 'filled Coruscant\'s judgeships with friends'},
      {region: 'colonies', act: 'quietly closed the investigations into friendly senators'},
      {region: 'midrim', act: 'leased listening posts from friendly worlds at inflated rents'},
      {region: 'outer', act: 'appointed friendly sector magistrates on the Rim'},
      {region: 'midrim', act: 'dropped the charges against friendly shipping magnates'},
      {region: 'core', act: 'gave the Bureau of Intelligence\'s contracts to friendly firms'}
    ],
    security: [
      {region: 'colonies', act: 'steered warship contracts to the yards of Fondor'},
      {region: 'midrim', act: 'built new Judicial bases on friendly worlds'},
      {region: 'core', act: 'bought the Judicial Forces\' blasters from friendly armsmakers'},
      {region: 'outer', act: 'put friendly sector militias on the Republic\'s payroll'},
      {region: 'outer', act: 'bought the Judicial Forces\' fuel from friendly refineries'},
      {region: 'colonies', act: 'handed Judicial commissions to friendly families'}
    ],
    rimaffairs: [
      {region: 'outer', act: 'routed relief contracts through friendly governors'},
      {region: 'outer', act: 'built hyperspace beacons in friendly sectors'},
      {region: 'midrim', act: 'granted colonisation charters in the Expansion Region to friends'},
      {region: 'outer', act: 'recognised friendly claimants in disputed Rim systems'},
      {region: 'core', act: 'sold Rim mining charters to friendly Core firms'},
      {region: 'midrim', act: 'paid friendly Mid Rim worlds to resettle Rim refugees'}
    ]
  };
  SW.porkOk = function (Q) { return !Q.senators_expelled; };
  // a random kind other than the last one offered (q: the quality that remembers it)
  SW.porkRoll = function (Q, c, q) {
    var n = (SW.PORK[c] || []).length, cur = Q[q] || 0, k;
    if (!n) return 0;
    if (cur < 1 || cur > n || n < 2) k = 1 + Math.floor(SW.rnd() * n);
    else { k = 1 + Math.floor(SW.rnd() * (n - 1)); if (k >= cur) k++; }
    Q[q] = Math.min(n, Math.max(1, k));
    return Q[q];
  };
  // run when a committee card is drawn: which kind of patronage it offers this time
  SW.porkPick = function (Q, c) { return SW.porkRoll(Q, c, 'pork_v_' + c); };
  // b: 'rc' for the Caucus's own card, or the bloc whose ministry hands it out; k: which kind (a ministry picks its own)
  SW.porkBarrel = function (Q, c, b, k) {
    if (!SW.PORK[c] || !SW.porkOk(Q)) return;
    if (!k) k = SW.porkRoll(Q, c, 'pork_mv_' + c);
    var P = SW.PORK[c][k - 1] || SW.PORK[c][0];
    Q.pork_said = P.act;
    if (b === 'rc') {
      Q.capital += 1; Q[P.region + '_rc'] = (Q[P.region + '_rc'] || 0) + 1.5; Q.corruption += 1.5; Q.faith -= 1;
    } else {
      Q[P.region + '_' + b] = (Q[P.region + '_' + b] || 0) * 1.04; Q.corruption += 1; Q.faith -= 0.5;
    }
    Q.pork_count = (Q.pork_count || 0) + 1;
    SW.computeSupport(Q);
  };

  // Every card / event timer named here is decremented by one each turn.
  SW.TIMERS = [
    'advisor_action', 'shuffle', 'contributions', 'campaign', 'media', 'relations', 'platform',
    'enemy', 'confront', 'pact', 'investigate', 'hunt', 'jedi', 'rim_outreach', 'peace', 'disunity', 'wroad',
    'civil', 'routine', 'leader_moment', 'bacta_crisis', 'tibanna_crisis', 'spice_crisis', 'banking_clan', 'debt_crisis', 'core_revolt', 'credits',
    'finance', 'judiciary', 'security', 'rimaffairs', 'constitution', 'jedi_affairs', 'diplomacy', 'clone_oversight',
    'coalition', 'shuffle_committees', 'emergency_measures',
    'corruption_scandal', 'piracy', 'famine', 'embargo', 'secession', 'profiteering', 'protest',
    'assassination', 'leak', 'unease', 'sunset', 'battle', 'gunray', 'pal_media', 'faction_crisis',
    'last_days', 'coalition_strain', 'leadership', 'faction_leader', 'bureau_reform', 'scheme',
    'trail', 'world_election', 'referendum', 'recall', 'case', 'congress', 'hutt_offer', 'hutt_rep', 'militia', 'lead_event', 'chan_peace'
  ];

  // Initial pairwise affinity of each bloc for each potential partner/candidate bloc (0-100).
  SW.AFFINITY = {
    rc:    {rc: 100, mod: 60, pal: 40, guild: 10, rim: 45, sec: 25, ind: 50, cis: 5,  rfc: 60},
    mod:   {rc: 55, mod: 100, pal: 45, guild: 45, rim: 20, sec: 45, ind: 55, cis: 10, rfc: 20},
    pal:   {rc: 35, mod: 45, pal: 100, guild: 30, rim: 25, sec: 60, ind: 40, cis: 5,  rfc: 15},
    guild: {rc: 10, mod: 45, pal: 40, guild: 100, rim: 20, sec: 35, ind: 35, cis: 45, rfc: 5},
    rim:   {rc: 45, mod: 15, pal: 30, guild: 15, rim: 100, sec: 10, ind: 45, cis: 40, rfc: 70},
    sec:   {rc: 25, mod: 45, pal: 60, guild: 30, rim: 5,  sec: 100, ind: 30, cis: 0,  rfc: 5},
    ind:   {rc: 45, mod: 50, pal: 45, guild: 35, rim: 40, sec: 30, ind: 100, cis: 20, rfc: 35},
    cis:   {rc: 5,  mod: 10, pal: 5,  guild: 50, rim: 40, sec: 0,  ind: 20, cis: 100, rfc: 20},
    rfc:   {rc: 50, mod: 15, pal: 15, guild: 5,  rim: 70, sec: 5,  ind: 35, cis: 25, rfc: 100}
  };

  // Regional support (raw, normalised later) for each bloc at the start.
  var START_SUPPORT = {
    core:      {rc: 22, mod: 34, pal: 5, guild: 10, rim: 1,  sec: 14, ind: 14},
    colonies:  {rc: 22, mod: 24, pal: 6, guild: 9,  rim: 6,  sec: 19, ind: 14},
    midrim:    {rc: 15, mod: 16, pal: 9, guild: 14, rim: 20, sec: 8,  ind: 18},
    outer:     {rc: 8,  mod: 8,  pal: 4, guild: 12, rim: 42, sec: 6,  ind: 20},
    corporate: {rc: 2,  mod: 10, pal: 2, guild: 70, rim: 4,  sec: 6,  ind: 6}
  };

  // ------------------------------------------------------------------ helpers
  SW.clamp = function (v, lo, hi) {
    v = +v;
    if (isNaN(v)) v = lo;
    return Math.max(lo, Math.min(hi, v));
  };
  SW.rnd = function () { return Math.random(); };
  SW.name = function (Q, b) { return (Q && Q[b + '_name']) || SW.BLOC_DEFAULT_NAMES[b] || b; };
  SW.color = function (b) { return SW.BLOC_COLORS[b] || '#888'; };
  SW.span = function (Q, b, text) {
    return '<span class="bloc" style="color:' + SW.color(b) + '">' + (text || SW.name(Q, b)) + '</span>';
  };
  SW.round1 = function (x) { return Math.round(x * 10) / 10; };

  // ------------------------------------------------------------------ defaults
  SW.DEFAULTS = function () {
    var D = {
      started: 1, save_version: SW.SAVE_VERSION, difficulty: 0,
      time: 1, bby: 33, month: 1, day: 0, months_per_turn: 3, date: 0, date_label: 'Q1, 33 BBY',
      act: 1, finale: 0, turn_actions: 0, new_session: 0, last_session_bby: 34,
      game_ending: 0, ending: '', force_end: 0,

      // senate
      chancellor: 'Valorum', chancellor_bloc: 'mod', chancellor_title: 'Supreme Chancellor',
      vice_chair: 'Mas Amedda', puppet_chancellor: 0,
      rc_leader: 'Bail Antilles', mod_leader: 'Finis Valorum', pal_leader: 'Palpatine',
      guild_leader: 'Lott Dod', rim_leader: 'Orn Free Taa', sec_leader: 'Orvos Hask',
      ind_leader: 'Tamsar Vell', cis_leader: 'Count Dooku', rfc_leader: 'Onaconda Farr',
      pal_name: 'Chommell Circle',
      cis_formed: 0, rfc_formed: 0,
      govt_blocs: ['mod', 'guild', 'sec', 'ind'], coalition_name: 'Commerce Coalition',
      rc_in_govt: 0, rc_toleration: 0, coalition_dissent: 0, minority_govt: 0,
      chair_finance: 'guild', chair_judiciary: 'mod', chair_security: 'sec', chair_rimaffairs: 'ind', chair_constitution: 'mod', chair_jedi: 'ind',
      leverage: 0, election_due: 0, next_election_date: 0, elections_held: 0,
      seceded_total: 0,

      // caucus
      inst_strength: 40, rimward_strength: 25, pacifist_strength: 20, hawk_strength: 15,
      rad_inst: 0, rad_rimward: 0, rad_pacifist: 0, rad_hawk: 0,
      caucus_unrest: 0, unrest_percent: 0,
      hawks_split: 0, rimward_split: 0, pacifists_resigned: 0,
      capital: 3, base_contrib: 2, treasury: 4, rc_momentum: 0,
      platform: '', main_enemy: '',

      // threat model
      grand_plan: 5, emergency_powers: 0, evidence: 0, jedi_suspicion: 0, senate_resolve: 0,
      corruption: 60, faith: 50, fear: 20, rim_hardship: 30, guild_embargo: 0,
      outer_sep: 15, midrim_sep: 8, corporate_sep: 20, sep_total: 0,
      dooku_movement: 0, war: 0, war_balance: 0, war_weariness: 0, war_turns: 0,
      anakin_found: 0, anakin_fall: 0, anakin_jedi: 0, shmi_freed: 0, shmi_dead: 0,
      quigon_alive: 0, padme_alive: 1, padme_senator: 0, padme_married: 0,
      dooku_turned: 0, dooku_doubt: 0, dooku_dead: 0, dooku_left: 0,
      kamino_army: 1, kamino_known: 0, kamino_secret_found: 0, chips_found: 0,
      sidious_known: 0, sidious_defeated: 0, sidious_method: '', evidence_public: 0,
      premature_accusations: 0, investigators_lost: 0,

      // key reforms (door-closers)
      emergency_sunset: 0, term_limits_protected: 0, army_oversight: 0, senate_guard_reformed: 0,
      jedi_independence: 0, banking_independent: 0, chips_removed: 0, rim_enfranchised: 0,
      anti_corruption: 0, constructive_vonc: 0,

      // policies / legacy
      slavery_abolished: 0, tf_broken_up: 0, banking_reformed: 0, clone_citizenship: 0,
      jedi_reformed: 0, rim_relief: 0, trade_tax: 0, holonet_free: 1, peace_talks: 0,
      federal_compact: 0, recognized_cis: 0, judicial_expansion: 0,

      // forces
      jedi_strength: 8, jedi_standing: 60, jedi_generals: 0, jedi_relation: 50,
      judicial_forces: 3, member_forces: 1, pact_formed: 0, clones: 0, navy_loyalty: 50,
      governors: 0, droid_armies: 0,

      // finale state
      finale_day: 0, petition: 0, petition_signatures: 0, warrant: 0, arrest_result: '',
      order66: 0, empire_declared: 0, civil_war_result: '', restoration_passed: 0,
      jedi_coup: 0, hollow_crown: 0, admirals: 0, cis_victory: 0, dissolved: 0,
      free_republic: 0, sidious_contingency: 0, trial_held: 0,

      // advisors
      n_advisors: 0, max_advisors: 3,
      adv_antilles: 0, adv_organa: 0, adv_bel_iblis: 0, adv_farr: 0, adv_mothma: 0,
      adv_amidala: 0, adv_valorum: 0, adv_chuchi: 0,
      farr_dead: 0, valorum_fallen: 0, valorum_scandal: 0, valorum_fell_date: -1, valorum_leads_mod: 0,

      // records
      support_records: [], senate_records: [],

      // misc ui
      pinnedCardsDescription: ''
    };
    // runtime flags and counters used by scenes (all start at zero)
    var ZERO = ["ab_vote", "ahsoka_saved", "anakin_fallen", "anakin_helped", "antilles_chancellor", "antilles_gone", "archive_gap_known", "arrest_delay", "arrest_plan_seen", "arrest_planned", "arrest_score", "arrest_seen", "assassin_hit", "banking_audit", "banking_bill_seen", "banking_dereg", "banking_seizure_seen", "banks_seized", "battle_idx", "battle_won", "bi_vote", "bk_vote", "blood_liberty", "bonteri_contact", "bonteri_dead", "bs_vote", "cc_vote", "charges_ok", "chip_removal", "civil_war_pending", "civil_war_seen", "clear_hand", "clone_trust", "contingency", "council_blocked", "council_seat_seen", "cr_vote", "crisis_months", "cw_ratio", "damask_seen", "deal_pct", "delegation_formed", "dooku_contact", "dooku_failed", "dooku_offer_seen", "el_active", "el_attack_ok", "el_attacked", "el_courted_guild", "el_courted_ind", "el_courted_mod", "el_courted_rim", "el_courted_sec", "el_has_mod", "el_has_pal", "el_has_rc", "el_has_rim", "el_has_sec", "el_invited", "el_pal_won", "election_suspended", "embargo_severe", "en_vote", "ep_cost", "eth_vote", "ethics_push", "false_flag_seen", "farr_compromised", "farr_famine_seen", "farr_foiled", "farr_murder_seen", "farr_protected", "farr_relation_broken", "fc_passed", "fc_sabotaged", "fc_vote", "ff_exposed", "ff_vote", "fives_alive", "fives_dead", "fives_result", "fives_seen", "free_press", "gambit", "gambit_bonus", "gambit_resolved", "gambit_response_seen", "game_over_reached", "gb_ratio", "geo_outcome", "geonosis_seen", "govt_fell", "guard_turned", "guild_grievance", "guild_money", "gunray_bonus", "gunray_chance", "gunray_convicted", "gunray_pct", "gunray_stage", "gunray_testified", "indefinite_seen", "inspect_found", "inst_crisis", "intel_runs", "investigators_protected", "it_vote", "jedi_reform", "kamino_early", "kamino_hunt", "kd_vote", "knows_wedding", "ko_vote", "ld_anakin_used_today", "ld_delegation_used_today", "ld_evidence_used_today", "ld_forces_used_today", "ld_guard_used_today", "ld_jedi_used_today", "ld_navy_used_today", "leak_pending", "leak_severity", "mca_seen", "mca_vote", "mothma_joined", "naboo_aid", "naboo_crisis", "naboo_free", "naboo_sympathy", "new_order_seen", "new_ruusan", "new_session_seen", "no_vote", "order66_failed", "order66_seen", "organa_funds", "ov_vote", "padme_attack_seen", "padme_hidden", "padme_jedi_guard", "padme_joined", "padme_trust", "pal_disgraced", "pal_terms", "pal_was_chancellor", "peace_achieved", "petition_possible", "petition_seen", "quigon_killed", "rc_chancellor_count", "rc_emergency_taken", "rc_terms", "rc_was_chancellor", "rec_vote", "regency_seen", "relief_fleet", "rest_vote", "restoration_seen", "rim_grievance", "sa_amended", "sa_vote", "satine_friend", "satine_mediation", "scandal_ours", "secession_shown", "sector_blocked", "sector_seen", "security_act", "security_act_seen", "security_audits", "seeds", "senate_jedi_pact", "sg_vote", "shuffle_changed", "sidious_free", "sidious_gone", "sifo_seen", "sith_told", "slavery_campaign", "sr_vote", "strike_seen", "sunset_lapsed", "tax_passed", "tax_stance", "tax_vote", "temple_bombing_seen", "term_crisis_seen", "term_extended", "tf_droids", "tf_droids_limited", "tf_inspections", "tf_probe", "tf_talks", "tfb_vote", "tl_vote", "trade_tax_proposed", "truth_seen", "unease_level", "valorum_leads", "vc_passed", "vc_vote", "vonc_failed", "vonc_passed", "vonc_rc", "vonc_vote", "war_begins_seen", "war_won", "war_won_seen", "wedding_accepted"];
    for (var z = 0; z < ZERO.length; z++) if (D[ZERO[z]] === undefined) D[ZERO[z]] = 0;
    var STR = ["all_ach_html", "arrest_mode", "battle_desc", "battle_name", "conceded_to", "el_backing", "el_incumbent", "el_sec_leader", "el_text", "el_winner", "ending_title", "gambit_kind", "game_ach_html", "geo_choice", "gunray_result", "inv_result", "known_by", "last_card_timer", "legacy_html", "lib_legend", "lost_chair", "mca_result", "petition_region", "scandal_bloc", "scandal_name", "session_changes", "session_legend", "split_kind", "strain_bloc", "strain_name", "sub_reborn", "summary_html", "vote_html"];
    for (var y = 0; y < STR.length; y++) if (D[STR[y]] === undefined) D[STR[y]] = '';
    var CZ = ['bloc_contest_ready', 'faction_contest_ready', 'contest_chance', 'contest_cost', 'contest_inc_out', 'contest_changed',
      'contest_backed_won', 'contest_backed_lost', 'contest_adv', 'contest_can_pay', 'tarkin_rising', 'leader_changes', 'leadership_contests', 'rim_sep_high',
      'inst_split_ready', 'rimward_split_ready', 'pacifist_split_ready', 'hawk_split_ready'];
    for (var cz = 0; cz < CZ.length; cz++) D[CZ[cz]] = 0;
    var CS = ['contest_kind', 'contest_group', 'contest_group_name', 'contest_inc_id', 'contest_ch_id', 'contest_inc', 'contest_inc_tag',
      'contest_inc_blurb', 'contest_ch', 'contest_ch_tag', 'contest_ch_blurb', 'contest_soft_id', 'contest_soft', 'contest_offer',
      'contest_adv_name', 'contest_winner', 'contest_winner_tag', 'contest_odds', 'contest_inc_demand', 'contest_ch_demand', 'contest_effect'];
    for (var cs = 0; cs < CS.length; cs++) D[CS[cs]] = '';
    for (var lg in SW.LEADER_START) {
      D[lg + '_leader_id'] = SW.LEADER_START[lg];
      D[lg + '_leader'] = SW.LEADERS[SW.LEADER_START[lg]].name;
      D[lg + '_favour'] = 0; D[lg + '_grudge'] = 0; D[lg + '_asked'] = -99; D['vote_boost_' + lg] = 0;
    }
    // party wings and congresses
    D.wings_seeded = 0; D.congresses_quiet = 0; D.congress_go = 0; D.pork_count = 0; D.pork_said = '';
    D.pork_v_finance = 0; D.pork_v_judiciary = 0; D.pork_v_security = 0; D.pork_v_rimaffairs = 0;
    D.pork_mv_finance = 0; D.pork_mv_judiciary = 0; D.pork_mv_security = 0; D.pork_mv_rimaffairs = 0;
    // what the ruling wings do
    var WBN = ['hutt_rules', 'hutt_terms', 'hutt_turned', 'hutt_offer_ok', 'hutt_turned_ready', 'hutt_offers', 'hutt_reprisals', 'hutt_gutted', 'hutt_joined',
      'militias', 'repeal_tried', 'repealed', 'repeal_vote', 'farr_return_ready', 'farr_returned', 'ld_hawks_used', 'hawks_fleets', 'no_purge', 'no_crowd', 'no_militias',
      'rim_obstruct', 'guilds_split', 'gs_split', 'lo_synd_seen', 'lo_raids_seen', 'radicals_steps_seen', 'hutt_slavery0', 'hutt_synd0', 'hutt_regs0', 'hutt_ryloth0', 'rc_lead_pacifist',
      'hutt_terms_seen', 'petition_lost', 'hawks_called', 'militia_events'];
    for (var wbn = 0; wbn < WBN.length; wbn++) D[WBN[wbn]] = 0;
    D.radicals_steps0 = -1; D.hutt_rep_kind = ''; D.hutt_turned_why = ''; D.rc_lead = '';
    // walkouts
    var WDS = ['walkout_ready', 'wk_wing', 'wk_wing_name', 'wk_bloc', 'wk_bloc_name', 'wk_leader', 'wk_leader_id', 'wk_winner', 'wk_winner_leader', 'wk_found', 'wk_join', 'wk_join_name', 'wk_grievance'];
    for (var wds = 0; wds < WDS.length; wds++) D[WDS[wds]] = '';
    var WDN = ['walkout_go', 'walkouts', 'splinters', 'wk_us', 'wk_cis', 'wk_govt', 'wk_govt_w'];
    for (var wdn = 0; wdn < WDN.length; wdn++) D[WDN[wdn]] = 0;
    // radicalism: per wing, and the unrest it causes
    for (var rdw in SW.WINGS) { D['rad_' + rdw] = 0; D['rad_why_' + rdw] = ''; D['rad_why2_' + rdw] = ''; D['rad_warned_' + rdw] = -99; }
    for (var rdb = 0; rdb < SW.CONGRESS_BLOCS.length; rdb++) D[SW.CONGRESS_BLOCS[rdb] + '_rad_crisis'] = -99;
    D.rr_go = 0; D.reforms_repealed = 0; D.rr_name = ' '; D.rr_line = ' '; D.rr_bloc = ' '; D.rr_minister = ' '; D.rr_committee = ' ';
    for (var rpf in SW.REPEALS) { D['since_' + rpf] = -1; D['repealed_' + rpf] = 0; }
    D.stoke_target = '';
    for (var cwf = 0; cwf < SW.FACTIONS.length; cwf++) { var cwx = SW.FACTIONS[cwf]; D['rad_why_' + cwx] = ''; D['rad_why2_' + cwx] = ''; D['cpush_' + cwx] = 0; D['cstr_prev_' + cwx] = -1; }
    D.road_inst = 0; D.road_rimward = 0; D.road_pacifist = 0; D.road_hawk = 0; D.road_ok = 0; D.road_lead = ''; D.road_card_ok = 0; D.road_inst_ok = 0; D.road_satine_ok = 0; D.road_accord_ok = 0; D.road_strike_ok = 0;
    D.road_wait_inst = -99; D.road_wait_rimward = -99; D.road_wait_pacifist = -99; D.road_wait_hawk = -99; D.road_event_ready = ''; D.road_events = 0; D.road_event_timer = 0;
    D.charter_passed = 0; D.charter_ratified = 0; D.charter_lapse = 0; D.charter_lapsed = 0; D.rim_charter = 0; D.homecoming = 0; D.homecoming_from = -1; D.worlds_home = 0; D.rim_home_peace = 0;
    D.disarm_date = -1; D.disarm_cap = 0; D.officer_oath = 0; D.sword_strike = 0; D.sword_success = 0; D.w_review_done = 0; D.w_council_done = 0; D.w_navy_done = 0;
    D.cw_furious = 0; D.cw_divided = ' '; D.caucus_walkout = ''; D.caucus_walkout_go = 0; D.cw_winner = ' '; D.cw_grievance = ' '; D.rcg_revolt_f = ''; D.rc_powers_votes = 0; D.mil_cuts = 0; D.rim_card_acts = 0;
    D.cmom_talks = 0; D.cmom_powers = 0; D.caucus_walkouts = 0; D.contest_rigged_bloc = ''; D.cg_rigged = ''; D.cg_guild_wing = ''; D.guild_bankrolls = 0;
    D.unrest_go = 0; D.unrest_events = 0; D.unrest_has_dest = 0; D.revolts = 0; D.unrest_wing = ''; D.cg_revolt_wing = '';
    D.unrest_wing_name = ' '; D.unrest_bloc_name = ' '; D.unrest_mood = ' '; D.unrest_grievance = ' '; D.unrest_dest = ' '; D.unrest_title = ' ';
    // the Caucus congress and its programme
    var WCN = ['rc_congress_ready', 'rc_congress_elections', 'rc_congress_hold', 'rc_congresses', 'rcg_adv_ok', 'rcg_can_pay', 'rcg_deadlock', 'rcg_changed',
      'rcg_c1', 'rcg_c2', 'rcg_c3', 'rcg_c4', 'lead_events', 'committee_smooth', 'chan_ceasefire', 'chan_peace_stage', 'chan_peace_ok', 'cp_vote', 'cp_passed',
      'cp_sabotaged', 'chancellors_peace', 'chan_ceasefire_failed'];
    for (var wcn = 0; wcn < WCN.length; wcn++) D[WCN[wcn]] = 0;
    var WCS = ['rc_congress_why', 'rcg_why', 'rcg_intro', 'rcg_lead', 'rcg_table', 'rcg_result', 'rcg_round2', 'rcg_analysis', 'rcg_box', 'rcg_effect', 'rcg_far',
      'rc_chair', 'rc_lead_name', 'rc_lead_programme', 'lead_event_ready'];
    for (var wcs = 0; wcs < WCS.length; wcs++) D[WCS[wcs]] = '';
    for (var wck = 1; wck <= 4; wck++) { D['rcg_c' + wck + '_f'] = ''; D['rcg_c' + wck + '_name'] = ''; D['rcg_c' + wck + '_cand'] = ''; D['rcg_c' + wck + '_adv'] = ''; }
    for (var wbb = 0; wbb < SW.CONGRESS_BLOCS.length; wbb++) { D[SW.CONGRESS_BLOCS[wbb] + '_wing_name'] = ''; D[SW.CONGRESS_BLOCS[wbb] + '_wing'] = ''; } D.congress_ready = ''; D.congress_why = ''; D.congress_timer = 0; D.congresses = 0; D.pal_lieutenant = ''; D.pal_lieutenant_id = '';
    var CGN = ['cg_pal', 'cg_pal_free', 'cg_cost', 'cg_can_pay', 'cg_adv', 'cg_adv_ok', 'cg_deadlock', 'cg_changed', 'cg_backed_won', 'cg_backed_lost', 'cg_c1', 'cg_c2', 'cg_c3', 'cg_c4'];
    for (var cgn = 0; cgn < CGN.length; cgn++) D[CGN[cgn]] = 0;
    var CGS = ['cg_cost_txt', 'cg_bloc', 'cg_why', 'cg_bloc_name', 'cg_ruling', 'cg_ruling_name', 'cg_old_leader', 'cg_intro', 'cg_adv_name', 'cg_adv_wing', 'cg_adv_wing_name', 'cg_offer', 'cg_soft_wing', 'cg_soft',
      'cg_table', 'cg_backed', 'cg_result', 'cg_analysis', 'cg_round2', 'cg_effect', 'cg_box', 'cg_winner', 'cg_winner_id', 'cg_winner_wing', 'cg_winner_wing_name'];
    for (var cgs = 0; cgs < CGS.length; cgs++) D[CGS[cgs]] = '';
    for (var cgk = 1; cgk <= 4; cgk++) { D['cg_c' + cgk + '_wing'] = ''; D['cg_c' + cgk + '_name'] = ''; D['cg_c' + cgk + '_cand'] = ''; }
    D.cg_chart = [];
    D.treasury_txt = 4; D.debt_txt = 8; D.debt_label = ''; D.trade_label = '';
    D.cm_region = 'core'; D.cm_effect = 0; D.cm_backfired = 0; D.cm_word = ''; D.cm_msg_name = ''; D.cm_region_name = ''; D.scandal_ours_until = -99; D.campaigns_run = 0;
    D.cm_word_clean = ''; D.cm_word_relief = ''; D.cm_word_security = ''; D.cm_word_peace = ''; D.cm_word_republic = '';
    D.cm_msg = ''; D.cm_disrupted = 0; D.cm_protect_won = 0; D.cm_disruptor = ''; D.cm_threat = 0; D.cm_local = 0; D.cm_force_note = 0; D.jf_txt = 0; D.el_mom_note = 0; D.el_mom_text = ''; D.force_uses = 0; D.disruptions = 0; D.protects_won = 0; D.protects_lost = 0;
    D.momentum_why = ''; D.momentum_why_sign = 0; D.momentum_reforms_seen = 0; D.election_season = 0;
    // the Chancellor race
    D.el_nominee = ''; D.el_nominees = 0; D.el_nominee_default = ''; D.el_bought_amt = 0; D.el_exposed = 0; D.el_pledges_made = 0; D.el_deal = ''; D.el_deal_chair = ''; D.el_deal_chair_name = '';
    D.el_deal_won = 0; D.el_done = 0; D.el_whip = ''; D.el_backing_name = ''; D.el_proj_share = 0; D.el_act_share = 0; D.el_proj_exact = 0; D.el_res1 = []; D.el_top = [];
    D.el_switch_note = ''; D.el_whip_note = ''; D.el_join_pledge = ''; D.el_join_price = ' '; D.el_text = ''; D.el_cands = [];
    D.eb_a = ''; D.eb_b = ''; D.eb_a_name = ''; D.eb_b_name = ''; D.eb_ours_in = 0; D.eb_ours_out = 0; D.eb_backing_name = ''; D.eb_out = []; D.eb_out_main = ''; D.eb_out_name = ''; D.eb_out_cand = '';
    D.eb_has_out = 0; D.eb_pledge = ''; D.eb_pledge_ok = 0; D.eb_pledge_name = ''; D.eb_a_chair = ''; D.eb_b_chair = ''; D.eb_a_chair_name = ''; D.eb_b_chair_name = ''; D.eb_a_rc = 0; D.eb_b_rc = 0; D.eb_rc_seats = 0;
    D.whip_seed = 0; D.whip_for = 0; D.el_proj_for = ''; D.second_ballots = 0; D.kingmaker_deals = 0; D.debates_won = 0; D.endorsements = 0; D.mothma_out_until = -99; D.bel_iblis_out_until = -99;
    for (var nm in SW.NOMINEES) { D['nom_ok_' + nm] = 0; D['nom_sub_' + nm] = ''; D['nominated_' + nm] = 0; }
    for (var ec = 0; ec < SW.BLOCS.length; ec++) D['el_trait_' + SW.BLOCS[ec]] = '';
    for (var pl in SW.PLEDGES) { D['pledge_' + pl] = ''; D['pl_' + pl] = 0; D['plo_' + pl] = 0; D['pledge_' + pl + '_name'] = ''; }
    D.pledge_count = 0; D.pledge_text = ''; D.pledges_made = 0; D.pledges_broken = 0; D.ep_seen = 0; D.ret_seen = 0; D.powers_rc_yes = 0;
    D.pb_ready = 0; D.pb_bloc = ''; D.pb_name = ''; D.pb_what = ''; D.pb_how = ''; D.pb_leader = ''; D.pb_partner = 0;
    D.bdw_tariffs = 0; D.bdw_levy = 0; D.bdw_relief = 0; D.bdw_defence = 0; D.bd_gov_breaks = ''; D.bd_gov_breaks_n = 0;
    for (var rvd in SW.REVENUE) { D['bd_brk_rev_' + rvd] = ''; D['bd_brkn_rev_' + rvd] = 0; }
    for (var prd in SW.PRIORITY) { D['bd_brk_' + prd] = ''; D['bd_brkn_' + prd] = 0; }
    for (var chd = 0; chd < SW.COMMITTEES.length; chd++) { D['chair_res_' + SW.COMMITTEES[chd]] = 0; D['chair_res_' + SW.COMMITTEES[chd] + '_name'] = ''; }
    // the campaign trail
    D.trail_ready = 0; D.trail_kind = ''; D.trail_timer = 0; D.tr_title = ''; D.tr_speaker = ''; D.tr_rival = ''; D.tr_rival_name = ''; D.tr_rival_bloc = ''; D.tr_rival_pal = 0; D.tr_has_rival = 0;
    D.tr_result = ''; D.tr_won = 0; D.tr_endorser = ''; D.tr_endorser_name = ''; D.tr_pitch = ''; D.tr_price = ''; D.tr_jedi = 0;
    D.tr_gaffe_region = 'core'; D.tr_gaffe_text = ''; D.tr_gaffe_bloc = 'mod'; D.tr_gaffe_bloc_name = ''; D.tr_gaffe_region_name = '';
    // world elections, referendums, recalls, confidence votes
    D.wv_ready = 0; D.wv_id = ''; D.wv_name = ''; D.wv_world = ''; D.wv_region = 'core'; D.wv_region_name = ''; D.wv_ours = ''; D.wv_theirs = ''; D.wv_stakes = ''; D.wv_lost_adv = '';
    D.wv_chance = 0.5; D.wv_boost = 0; D.wv_adv = ''; D.wv_adv_name = ''; D.wv_has_adv = 0; D.wv_poll = 50; D.wv_heading = ''; D.wv_won = 0; D.wv_ours_pct = 50; D.world_election_timer = 4; D.world_wins = 0; D.world_losses = 0;
    for (var we in SW.WORLD_ELECTIONS) D['we_done_' + we] = 0;
    D.ref_ready = 0; D.ref_id = ''; D.ref_world = ''; D.ref_region = 'outer'; D.ref_region_name = ''; D.ref_chance = 0.5; D.ref_poll = 50; D.ref_poll_word = ''; D.ref_boost = 0; D.referendum_timer = 0;
    D.ref_bonteri = 0; D.ref_fig = ''; D.ref_fig_name = ''; D.ref_heading = ''; D.ref_campaign_ok = 0; D.ref_stayed = 0; D.ref_stay_pct = 50; D.ref_leave_pct = 50; D.we_rally = 0; D.referendums_won = 0; D.referendums_lost = 0;
    for (var rf in SW.REFERENDUMS) D['ref_done_' + rf] = 0;
    for (var gd = 0; gd < SW.REGIONS.length; gd++) { D['grievance_' + SW.REGIONS[gd]] = 0; D['cm_presence_' + SW.REGIONS[gd]] = 0; }
    D.recall_ready = 0; D.recall_region = 'core'; D.recall_region_name = ''; D.recall_why = ''; D.recall_lost = 0; D.recall_timer = 0; D.recalls = 0;
    D.cv_outlook = 0; D.cv_vote = 0; D.cv_won = 0; D.mandate_term = -1; D.mandates_won = 0; D.mandates_lost = 0; D.mandate_ok = 0;
    for (var ra = 0; ra < SW.REL_BLOCS.length; ra++) for (var rb2 = ra + 1; rb2 < SW.REL_BLOCS.length; rb2++)
      D['rel_' + SW.relKey(SW.REL_BLOCS[ra], SW.REL_BLOCS[rb2])] = SW.relBase(D, SW.REL_BLOCS[ra], SW.REL_BLOCS[rb2]);
    D.govt_minority_formed = 0; D.govt_bad_pair = 0; D.broken_now = 0; D.broken_why = ''; D.broken_swings = 0; D.broken_minority = 0; D.broken_collapse = 0; D.broken_bureau = 0;
    D.coal_all_blocked = 0; D.deliver_note = ''; D.delivered = 0; D.bk_ok = 0; D.bk_a = ''; D.bk_b = ''; D.bk_a_name = ''; D.bk_b_name = ''; D.bk_rel = '';
    D.sm_ok = 0; D.sm_label = ''; D.sm_blocs = []; D.el_rc_needed = 0; D.pledges_kept = 0; D.coal_blocked_games = 0; D.el_broken = 0; D.gov_minority_swing = 0;
    for (var jb = 0; jb < SW.REL_BLOCS.length; jb++) { D['jm_' + SW.REL_BLOCS[jb]] = ''; D['st_' + SW.REL_BLOCS[jb]] = ''; }
    D.pal_office_months = 0; D.pal_reach_low = 0; D.case_ready = 0; D.case_timer = 0; D.case_odds = 0; D.case_briefed = 0;
    D.trail_debate_for = -1; D.trail_endorse_for = -1; D.trail_research_for = -1; D.trail_gaffe_for = -1; D.trail_smear_for = -1;
    D.guild_patience = 60; D.guild_hurt_turn = -99; D.guild_patience_why = ''; D.guild_lobby = 0; D.guild_lobby_halved = 0; D.guild_step_ready = 0;
    D.guild_step_1 = 0; D.guild_step_2 = 0; D.guild_step_3 = 0; D.guild_step_4 = 0; D.guild_step_5 = 0; D.gs_step = 0; D.gs_heading = ''; D.gs_world = 'Rodia'; D.gs_leader = ''; D.gs_why = ''; D.gs_open = 0; D.gs_senate_ok = 0; D.gs_vote = 0;
    D.guild_steps_total = 0; D.guild_blockades = 0; D.guild_defections = 0; D.patrons_goodwill = 60; D.patron_adj = 0; D.rim_donors = 0; D.inflation = 0;
    D.rev_streak_tariffs = 0; D.rev_streak_levy = 0; D.rev_streak_loan = 0; D.rev_streak_bonds = 0; D.rev_streak_spice = 0; D.rev_streak_print = 0; D.rev_streak_none = 0;
    D.budget_defeats = 0; D.budget_defeats_total = 0; D.budget_falls = 0; D.bd_reactions = ''; D.bd_stances = ''; D.bd_outlook = 0; D.el_warchest_text = ''; D.el_warchest = 0; D.levy_ban_until = -99;
    D.core_revolt_timer = 0; D.credits_timer = 0; D.core_revolts = 0; D.credit_refusals = 0;
    D.gp_label = ''; D.pg_label = ''; D.bd_gov_outlook = 0; D.bd_out_relief = 0; D.bd_out_defence = 0; D.bd_out_subsidies = 0; D.bd_out_repay = 0; D.bd_out_none = 0;
    D.budget_due = 0; D.budget_rev = ''; D.budget_pri = ''; D.budgets = 0; D.spice_legal = 0; D.bacta_crises = 0; D.tibanna_crises = 0; D.spice_crises = 0; D.lost_finance = 0; D.debt_refinanced = 0; D.debt_premium_until = -99;
    D.bd_write = 0; D.bd_gov_rev = ''; D.bd_gov_pri = ''; D.bd_gov_text = ''; D.bd_rev = ''; D.bd_pri = ''; D.bd_income_base = 0; D.bd_upkeep = 0; D.bd_interest = 0; D.bd_tariff_yield = 0; D.bd_bond_yield = 0; D.bd_defence_cost = 3;
    D.bd_borrowed = 0; D.bd_income = 0; D.bd_cost = 0; D.bd_net = 0; D.bd_summary = ''; D.bd_rev_name = ''; D.bd_pri_name = ''; D.bd_failed = 0; D.bd_vote = 0;
    D.bacta_crisis_timer = 4; D.tibanna_crisis_timer = 4; D.spice_crisis_timer = 4; D.banking_clan_timer = 0; D.debt_crisis_timer = 0;
    D.war_off_outer = 0; D.war_off_mid = 0; D.war_off_core = 0; D.front_outer = 0; D.front_mid = 0; D.front_core = 0; D.war_aim = ''; D.war_aim_text = ''; D.war_priority = ''; D.wa_overruled = 0; D.wa_vote = 0;
    D.wc_command = 0; D.wc_gov_plan = ''; D.wc_gov_text = ''; D.wc_plan_text = ''; D.wc_lobby_failed = 0; D.wc_fronts = ''; D.battle_front = ''; D.battles_fought = 0;
    D.wd_id = ''; D.wd_has = 0; D.wd_heading = ''; D.wd_title = ''; D.wd_text = ''; D.wd_a_label = ''; D.wd_a_sub = ''; D.wd_b_label = ''; D.wd_b_sub = ''; D.wd_def = ''; D.wd_def_label = ''; D.wd_overruled = 0; D.wd_result = ''; D.dilemmas_decided = 0;
    D.front_ev_ready = 0; D.front_ev = ''; D.front_ev_kind = ''; D.fe_name = ''; D.fe_heading = ''; D.fe_lib = 0; D.fe_front = ''; D.front_ev_outer = -99; D.front_ev_mid = -99; D.front_ev_core = -99;
    D.free_ryloth = 0; D.citadel = 0; D.fleet_levy = 0; D.mandalore_pressed = 0; D.krell_backed = 0; D.trade = 60; D.bacta = 10; D.tibanna = 10; D.spice = 15; D.debt = 10; D.leaders_html = '';
    D.lm_ready = 0; D.lm_group = ''; D.lm_ultimatum = 0; D.lm_leader = ''; D.lm_group_name = ''; D.lm_reason = ''; D.lm_motive = ''; D.lm_title = ''; D.lm_ask = ''; D.lm_label = ''; D.lm_cost = 0; D.lm_accept_sub = ''; D.lm_refuse_sub = ''; D.lm_offer = '';
    D.leader_moment_timer = 8; D.ultimatums_met = 0; D.ultimatums_refused = 0; D.guild_regulations = 0; D.sanctions_lifted = 0; D.tariff_ban_until = -99;
    D.tf_lead_used = 0;
    D.card_stuck = 0; D.cards_set_aside = 0;
    D.pal_standin_title = 'Vice Chair <b>Mas Amedda</b>'; D.pal_cand_title = 'Senator Palpatine';
    D.pal_title = 'Senator Palpatine'; D.pal_office = 'Palpatine\'s office'; D.pal_people = 'Palpatine\'s people'; D.chair_cap = 6; D.chair_partners = 0; D.walkout_bloc = ''; D.walkout_until = -99; D.cc_dropped = 0; D.cc_kept = 0; D.el_walkout_blocks = 0; D.walkout_name = ''; D.govt_fell_now = 0; D.fall_reason = ''; D.war_name = 'Clone Wars';
    D.trial_cleanup = 0; D.force_war = SW.off('war') ? 0 : 1; D.amend_threshold = 66.7; D.gavel_date = -99; D.gavels = 0; D.vote_tabled = 0;
    D.scheme_pending = ''; D.scheme_due = 0; D.scheme_countered = 0; D.scheme_warned = 0; D.scheme_foreseen = 0;
    D.scheme_foresee = ''; D.scheme_counter = ''; D.scheme_text = ''; D.scheme_was_foiled = 0; D.schemes_total = 0; D.schemes_foiled = 0;
    D.scheme_timer = 4; D.misfortunes = []; D.investigated_at = -99; D.contest_rigged = 0;
    D.empire_warned = 0; D.early_empire = 0; D.arrests_warned = 0; D.arrests_tamed = 0; D.arrests_hedged = 0; D.arrests_done = 0;
    D.arrests_survived = 0; D.arrests_broke = 0; D.coup_warned = 0; D.coup_done = 0;
    D.rfc_kind = ''; D.split_own = 0; D.split_dest_name = ''; D.split_faction_name = ''; D.split_leader = ''; D.split_seats = 0;
    D.split_senators = 0; D.split_share_pct = 0; D.split_share_total = 0;
    D.loyalist_seen = 0; D.loyalist_member = 0; D.hostage_seen = 0; D.security_fast = 0; D.labyrinth_seen = 0; D.labyrinth_result = 0;
    D.arrest_missing = ''; D.cis_negotiated = 0; D.shadow_remains = 0; D.admirals_coup = 0;
    D.bp_gov = 0; D.bp_walkout = 0; D.bp_chancellor = 0; D.bp_vote = 0; D.bp_fell = 0; D.bp_saved = 0; D.bp_survived = 0;
    D.bureau_relation = 45; D.bureau_reforms_seen = 0; D.bureau_captured = 0; D.bureau_warn_cold = 0; D.bureau_warn_hostile = 0; D.bureau_dossier = 0;
    D.bureau_purges = 0; D.bureau_purge_kind = ''; D.bureau_vote = 0; D.bureau_fell = 0; D.el_join_bureau = '';
    for (var bo = 0; bo < 8; bo++) { D['el_opt' + bo + '_bureau'] = ''; D['el_opt' + bo] = 0; D['el_opt' + bo + '_ok'] = 0; D['el_opt' + bo + '_label'] = ''; D['el_opt' + bo + '_why'] = ''; }
    D.pal_can_run = 1; D.naboo_jedi = 1; D.unease_next = 40; D.secession_next = 10; D.next_election_date = 21;
    // regions
    for (var i = 0; i < SW.REGIONS.length; i++) {
      var r = SW.REGIONS[i];
      D[r] = SW.BASE_WEIGHTS[r];
      D[r + '_seceded'] = 0;
      for (var j = 0; j < SW.BLOCS.length; j++) {
        var b = SW.BLOCS[j];
        D[r + '_' + b] = (START_SUPPORT[r][b] !== undefined) ? START_SUPPORT[r][b] : 0;
      }
    }
    D.classes = SW.REGIONS.slice();
    D.parties = ['rc', 'mod', 'pal', 'guild', 'rim', 'sec', 'ind'];
    // relations (player caucus with each bloc)
    D.mod_relation = 55; D.pal_relation = 55; D.guild_relation = 25; D.rim_relation = 35;
    D.sec_relation = 30; D.ind_relation = 45; D.cis_relation = 10; D.rfc_relation = 50;
    for (var k = 0; k < SW.BLOCS.length; k++) {
      var bb = SW.BLOCS[k];
      D[bb + '_r'] = 0; D[bb + '_votes'] = 0; D[bb + '_seats'] = 0;
      D[bb + '_in_govt'] = 0;
      if (!D[bb + '_name']) D[bb + '_name'] = SW.BLOC_DEFAULT_NAMES[bb];
    }
    // the Separatist threat, reform tracks, guild money and blocs that bleed
    D.sep_momentum = 0; D.rim_addressed = 0; D.sep_growing = 0;
    D.war_rep = 0; D.war_cis = 0; D.war_ratio = 2; D.war_strength_label = '';
    D.lost_outer = 0; D.lost_mid = 0; D.lost_core = 0; D.worlds_lost = 0; D.worlds_liberated = 0; D.worlds_lost_list = '';
    D.world_fall_ready = 0; D.world_fall_front = 'outer'; D.world_fall_name = ''; D.world_fall_region = ''; D.world_fall_front_name = '';
    D.world_lib_ready = 0; D.world_lib_front = 'outer'; D.world_lib_name = ''; D.world_lib_front_name = ''; D.coruscant_falls = 0;
    D.sidious_fled = 0; D.sidious_flee_ready = 0; D.admirals_strike_ready = 0; D.admirals_strike = 0;
    for (var tb = 0; tb < SW.BLOCS.length; tb++) D['merged_' + SW.BLOCS[tb]] = '';
    ['rim', 'rfc', 'rimward', 'sec'].forEach(function (t) {
      D[t + '_threat'] = 0; D[t + '_threat_until'] = 0; D[t + '_threat_steps'] = 0; D[t + '_threat_dissent'] = 0;
      D[t + '_threat_rival'] = 0; D[t + '_threat_cool'] = 0; D[t + '_done'] = 0; D[t + '_threat_leader_name'] = '';
    });
    D.threat_warn_ready = 0; D.threat_warn_id = ''; D.threat_due_ready = 0; D.threat_due_id = ''; D.threat_id = '';
    D.threat_group_name = ''; D.threat_leader = ''; D.threat_old_leader = ''; D.threat_how = ''; D.threat_averted = 0; D.threat_left_senate = 0;
    D.threats_seen = 0; D.threats_averted = 0; D.threats_happened = 0;
    D.rim_defected = 0; D.rfc_defected = 0; D.rimward_defected = 0; D.sec_folded = 0;
    for (var tk in SW.TRACKS) D['track_' + tk] = 0;
    D.track_total = 0; D.mil_invest = 0;
    D.bureau_reviewed = 0; D.bureau_reformed = 0; D.amedda_arrested = 0;
    D.rim_relief_act = 0; D.rim_assembly = 0; D.integrity_office = 0; D.powers_review = 0; D.senate_command = 0;
    D.new_jedi_order = 0; D.anakin_light = 0; D.anakin_choice_seen = 0;
    D.slavery_report = 0; D.slavery_enforced = 0; D.shmi_freed_now = 0;
    D.patrol_fleets = 0; D.pirates_crushed = 0; D.pirate_humiliation = 0; D.syndicates_broken = 0; D.syndicate_tries = 0; D.syndicates_ok = 0;
    D.navy_vetted = 0; D.evidence_secured = 0;
    D.sith_presence = 0; D.sith_stage = 0; D.sith_stage_max = 0; D.sith_stage_name = 'Rumours'; D.sith_named = 0; D.sith_named_by = ''; D.sith_name_ready = 0;
    D.suspect_amedda = 0; D.suspect_pestage = 0; D.suspect_free_taa = 0; D.suspect_dod = 0; D.suspects_open = 4;
    D.suspect_last = ''; D.suspect_last_name = ''; D.suspect_last_finding = ''; D.kamino_traced = 0; D.valorum_networks_used = 0;
    D.amedda_files_ready = 0; D.amedda_removed = 0; D.amedda_files_seen = 0;
    D.sith_alarm = 0; D.sith_alarm_word = 'He suspects nothing'; D.sith_forward = 0; D.sith_moving = 0; D.sith_alarm_ready = 0; D.finale_date = 171;
    D.hunt_informant = 0; D.hunt_frozen = 0; D.hunt_mapped = 0; D.hunt_chips = 0; D.hunt_routes = 0; D.hunt_jedi = 0; D.hunt_witnesses = 0;
    D.hunt_anakin_told = 0; D.hunt_anakin_turned = 0; D.hunt_case_runs = 0; D.hunt_timer = 0; D.hunt_result = ''; D.hunt_alarmed = 0; D.intel_cleared = '';
    D.suspects_open_text = '';
    D.cha_arrest_done = 0; D.cha_arrest_result = ''; D.cha_arrest_score = 0; D.cha_arrest_missing = ''; D.cha_flee_odds = 0;
    D.anti_cartel = 0; D.republic_bonds = 0; D.senators_expelled = 0; D.intel_oversight = 0; D.compor = 0; D.judicial_charter = 0;
    D.minority_support = []; D.minority_support_names = ''; D.minority_defeats = 0; D.collapse_at = 4; D.coalition_mood_v = 0; D.el_min_support_names = ''; D.el_min_support_n = 0; D.minority_support_n = 0; D.cc_minority = 0; D.cc_noone = 0; D.cc_supporter_left = 0; D.lost_chair_to = '';
    D.independent_speaker = 0; D.jedi_service_act = 0; D.jedi_compact = 0; D.jedi_service_suspended = 0; D.js_had_generals = 0; D.ws_vote = 0; D.ws_held = 0;
    D.ac_vote = 0; D.rb_vote = 0; D.ex_vote = 0; D.io_act_vote = 0; D.cp_vote = 0; D.jc_charter_vote = 0; D.sp_vote = 0; D.js_vote = 0; D.jc_vote = 0;
    for (var mc = 0; mc < SW.COMMITTEES.length; mc++) { var mk = SW.COMMITTEES[mc]; D['minister_' + mk] = ''; D['minister_' + mk + '_name'] = ''; D['minister_' + mk + '_bloc'] = ''; D['ministry_act_' + mk] = ''; D['ministry_act_by_' + mk] = ''; }
    D.appoint_queue = ''; D.appoint_ready = 0; D.reappoint_all = 0; D.ap_com = ''; D.ap_com_name = ''; D.ap_chosen_name = ''; D.ap_chosen_faction = '';
    D.ap_a = ''; D.ap_b = ''; D.ap_c = ''; D.ap_c_name = ''; D.ap_c_ok = 0; D.ap_a_ok = 0; D.ap_b_ok = 0; D.ap_a_name = ''; D.ap_b_name = ''; D.ap_a_world = ''; D.ap_b_world = ''; D.ap_c_world = ''; D.ap_a_faction = ''; D.ap_b_faction = ''; D.ap_c_faction = '';
    D.ministry_next = 0; D.ministry_report = ''; D.ministry_report_ready = 0; D.ministry_acts_total = 0;
    for (var mcm in SW.MINISTRY_ACTS) for (var mai = 0; mai < SW.MINISTRY_ACTS[mcm].length; mai++) D['mfail_' + SW.MINISTRY_ACTS[mcm][mai].id] = 0;
    D.dereg_count = 0; D.corp_donors_ready = 0; D.corporate_security = 0; D.corporate_forces = 0; D.ld_corporate_used_today = 0;
    D.rim_story_ready = 0; D.rim_story = ''; D.rim_story_heading = ''; D.rim_story_region = ''; D.rim_story_cause = ''; D.rim_story_next = 0; D.rim_stories = 0;
    for (var rsid in SW.RIM_STORIES) D['rim_story_done_' + rsid] = 0;
    D.rim_radical = 0; D.rim_radical_ready = 0; D.rim_radical_word = ''; D.rr_level = 0; D.rr_heading = ''; D.rr_wing = 0; D.rr_coalition = 0; D.rr_rfc = 0;
    D.rr_corvane_new = 0; D.rr_ardana_new = 0; D.rr_tandeth_new = 0;
    D.anakin_anchor = ''; D.anakin_anchor_name = 'Nothing'; D.anakin_warned = 0; D.anakin_floor = 0; D.arrest_forces_score = 0; D.arrest_forces_note = '';
    D.as_vote = 0; D.cs_vote = 0; D.io_vote = 0; D.pr_vote = 0; D.ra_vote = 0; D.sc_vote = 0;
    D.sidious_escaped = 0; D.fell_divided = 0; D.war_turning_ready = 0; D.war_turning_armed = 0; D.war_turning_count = 0; D.war_state = ''; D.hutt_deal = 0; D.hutt_deal_seen = 0; D.hutt_deal_vote = 0; D.hutt_deal_forced = 0;
    D.pirates_ready = 0; D.pirate_next = 0; D.pirate_route = ''; D.pirate_gang = ''; D.pirate_raids = 0;
    D.sentience_rights = 0; D.officer_corps = 0; D.hhc_investigated = 0; D.hhc_discredited = 0;
    D.hhc_ready = 0; D.hhc_next = 0; D.hhc_kind = 'core'; D.hhc_heat = 0; D.hhc_events = 0;
    for (var cpd = 0; cpd < SW.CHANCELLERY_POWERS.length; cpd++) { var cpk = 'chp_' + SW.CHANCELLERY_POWERS[cpd].id; D[cpk] = 0; D[cpk + '_by'] = ''; D[cpk + '_state'] = 'none'; }
    D.chan_powers = 0; D.chan_scale = 'First among equals'; D.chan_held_text = ''; D.chan_decrees = 0; D.chan_can_decree = 0; D.chan_holder = ''; D.chan_months = 0;
    D.chan_bureau = 0; D.chan_holonet = 0; D.bureau_moves_ready = 0; D.bureau_moves_seen = 0; D.public_info_ready = 0; D.public_info_seen = 0;
    D.war_shadows_seen = 0; D.war_shadows_choice = ''; D.bureau_moles = 1; D.bureau_moles_until = 9999;
    D.decrees_used = 0; D.decrees_reform = 0; D.decree_mode = 0; D.decree_step = ''; D.decree_step_name = ''; D.decree_last = ''; D.decree_rival_name = '';
    D.precedent_inherited = 0; D.powers_returned_by_us = 0; D.returned_name = ''; D.hc_decrees = 0;
    D.by_decree_next = 0; D.by_decree_ready = 0; D.by_decree_heading = ''; D.by_decree_text = ''; D.by_decree_kind = ''; D.by_decrees = 0;
    for (var dsi = 0; dsi < SW.DECREE_STEPS.length; dsi++) D['dok_' + SW.DECREE_STEPS[dsi][0]] = 0;
    D.dok_any = 0;
    D.chan_office_html = ''; D.chan_powers_html = ''; D.chan_govt_html = ''; D.chan_record_html = ''; D.chan_record = 0; D.war_shadows_ready = 0;
    for (var rvb = 0; rvb < SW.BLOCS.length; rvb++) { D['rv_' + SW.BLOCS[rvb] + '_ok'] = 0; D['rv_' + SW.BLOCS[rvb] + '_name'] = ''; }
    for (var scb = 0; scb < SW.BLOCS.length; scb++) D[SW.BLOCS[scb] + '_scandal'] = 0;
    D.guild_hold = 0; D.guild_breaks = 0; D.guild_leak = 0; D.el_chest_offer = 0; D.el_chest_taken = 0;
    D.timers = SW.TIMERS.slice();
    for (var t = 0; t < SW.TIMERS.length; t++) D[SW.TIMERS[t] + '_timer'] = 0;
    return D;
  };

  SW.newGame = function (Q, difficulty) {
    var D = SW.DEFAULTS();
    for (var key in D) Q[key] = D[key];
    Q.difficulty = difficulty || 0;
    if (Q.difficulty < 0) {          // Story
      Q.capital = 5; Q.base_contrib = 3; Q.treasury = 6; Q.mod_relation = 62; Q.rim_relation = 42; Q.bureau_relation = 52;
      Q.rad_inst = 0; Q.rad_hawk = 0;
    } else if (Q.difficulty > 0) {   // Jedi Master
      Q.capital = 0; Q.base_contrib = 1; Q.treasury = 3; Q.mod_relation = 44; Q.rim_relation = 28; Q.bureau_relation = 38;
      Q.guild_relation = 20; Q.sec_relation = 25; Q.ind_relation = 40;
      Q.rad_inst = 20; Q.rad_rimward = 25; Q.rad_pacifist = 20; Q.rad_hawk = 20; Q.grand_plan = 10;
    }
    SW.setGovt(Q, ['mod', 'guild', 'sec', 'ind'], 'Commerce Coalition');
    SW.seedWings(Q);
    SW.computeSupport(Q);
    SW.senateSession(Q, true);
    SW.updateDate(Q);
    SW.everyVisit(Q);
    return Q;
  };

  // Fill in anything missing (old saves, new qualities).
  SW.migrate = function (Q) {
    if (!Q.started) return;
    // leaders: map an old save's leader names to leader ids before defaults fill the gaps
    for (var lg in SW.LEADER_START) {
      if (Q[lg + '_leader_id'] === undefined && Q[lg + '_leader']) {
        for (var lid in SW.LEADERS) if (SW.LEADERS[lid].group === lg && SW.LEADERS[lid].name === Q[lg + '_leader']) Q[lg + '_leader_id'] = lid;
      }
    }
    if (Q.timers && Q.timers.length !== undefined) {
      for (var ti = 0; ti < SW.TIMERS.length; ti++) if (Q.timers.indexOf(SW.TIMERS[ti]) < 0) Q.timers.push(SW.TIMERS[ti]);
    }
    if (Q.pl_no_probe || Q.pledge_no_probe) { Q.pl_no_probe = 0; Q.pledge_no_probe = ''; Q.pledge_no_probe_name = ''; var pls = SW.pledgeList(Q); Q.pledge_count = pls.length; Q.pledge_text = pls.join('; '); }
    if (Q.sith_named === undefined && (Q.evidence >= 8 || Q.finale || Q.sidious_known)) { Q.sith_named = 1; Q.sith_named_by = 'migrated'; for (var si = 0; si < SW.SUSPECT_IDS.length; si++) Q['suspect_' + SW.SUSPECT_IDS[si]] = 1; }
    var newChairs = SW.COMMITTEES.filter(function (c) { return Q['chair_' + c] === undefined; });
    var D = SW.DEFAULTS();
    for (var key in D) {
      if (Q[key] === undefined || Q[key] === null || (typeof D[key] === 'number' && typeof Q[key] === 'number' && isNaN(Q[key]))) {
        Q[key] = D[key];
      }
    }
    // committees an old save never had go to the government partner that wants them most
    if (newChairs.length && Q.govt_blocs) {
      var ps = Q.govt_blocs.filter(function (b) { return b !== 'rc'; });
      for (var nc = 0; nc < newChairs.length; nc++) {
        var pl = SW.CHAIR_PREFS[newChairs[nc]], pick = ps[0] || 'ind';
        for (var pk = 0; pk < pl.length; pk++) if (ps.indexOf(pl[pk]) >= 0) { pick = pl[pk]; break; }
        Q['chair_' + newChairs[nc]] = pick;
      }
    }
    if (!Q.wings_seeded) SW.seedWings(Q);
    Q.save_version = SW.SAVE_VERSION;
  };

  // ------------------------------------------------------------------ calendar
  SW.updateDate = function (Q) {
    Q.date = (33 - Q.bby) * 12 + (Q.month - 1);
    Q.date_label = SW.dateLabel(Q);
    if (Q.finale) Q.act = 5;
    else if (Q.date < 24) Q.act = 1;
    else if (Q.date < 108) Q.act = 2;
    else if (Q.war || Q.war_won || Q.geonosis_seen) Q.act = 4;
    else Q.act = 3;
  };

  SW.dateLabel = function (Q) {
    if (Q.finale) return 'Day ' + Q.finale_day + ', ' + Q.bby + ' BBY';
    if (Q.months_per_turn === 1) return 'Month ' + Q.month + ', ' + Q.bby + ' BBY';
    if (Q.months_per_turn === 6) return (Q.month <= 6 ? 'Early ' : 'Late ') + Q.bby + ' BBY';
    return 'Q' + Math.ceil(Q.month / 3) + ', ' + Q.bby + ' BBY';
  };

  SW.tickLabel = function (t) {
    return (33 - Math.floor(t / 12)) + ' BBY';
  };

  // Decide how many months the next turn covers.
  SW.pace = function (Q) {
    if (Q.finale) return 0;
    if (Q.crisis_months > 0) return 1;
    if (Q.date >= 24 && Q.date < 96) return 6;
    return 3;
  };

  SW.advanceCalendar = function (Q) {
    var mpt = SW.pace(Q);
    Q.months_per_turn = mpt;
    if (mpt === 0) {
      Q.finale_day += 1;
      Q.day = Q.finale_day;
    } else {
      Q.month += mpt;
      if (Q.crisis_months > 0) Q.crisis_months -= 1;
      // snap to a turn boundary when leaving month mode
      var next = SW.pace(Q);
      if (next === 3 && (Q.month - 1) % 3 !== 0) Q.month += 3 - ((Q.month - 1) % 3);
      if (next === 6 && (Q.month - 1) % 6 !== 0) Q.month += 6 - ((Q.month - 1) % 6);
      while (Q.month > 12) {
        Q.month -= 12;
        Q.bby -= 1;
        Q.new_session = 1;
        SW.yearly(Q);
      }
      Q.months_per_turn = SW.pace(Q);
    }
    Q.time += 1;
    SW.updateDate(Q);
  };

  SW.yearly = function (Q) {
    var bonus = 0;
    if ((Q.caucus_unrest || 0) < 0.08) bonus += 1;
    if ((Q.caucus_unrest || 0) > 0.25) bonus -= 1;
    if (Q.rc_in_govt) bonus += 1;
    // a seat on the Loyalist Committee lets documents cross the table
    if (Q.loyalist_member && Q.pal_chancellor) Q.evidence += 0.4;
    // half-year turns cover two turns per year; quarters four; income is per year either way
    // our patrons pay according to how we treat them; Rim grassroots donors follow relief
    Q.patron_adj = Math.round(((Q.patrons_goodwill === undefined ? 60 : Q.patrons_goodwill) - 50) / 25);
    Q.capital += Math.max(0, Q.base_contrib + bonus + Q.patron_adj + Math.floor(Q.rim_donors || 0));
    if (Q.budget_pri !== 'relief') Q.rim_donors = Math.max(0, (Q.rim_donors || 0) - 0.5);
    // the treasury is set by the yearly budget (rec_budget); the old trade tax still pays in
    if (Q.trade_tax) Q.treasury += 1;
    Q.budget_due = 1;
    // the Separatists gain ground every year the Rim is left to them, and the Rim's politicians radicalise
    SW.separatistYear(Q);
    SW.rimRadicalYear(Q);
    // under the Powers Review Act the Senate takes back one emergency power a year
    if (Q.powers_review && Q.emergency_powers > 0 && !Q.finale) { Q.emergency_powers -= 1; Q.powers_returned = (Q.powers_returned || 0) + 1; }
  };

  // ------------------------------------------------------------------ factions
  // our wings' strengths, normalised to 100, and the Caucus's unrest: the delegates' average radicalism
  SW.normCaucus = function (Q) {
    var total = 0, weighted = 0, act = 0;
    for (var i = 0; i < SW.FACTIONS.length; i++) {
      var f = SW.FACTIONS[i];
      Q[f + '_strength'] = SW.clamp(Q[f + '_strength'] || 0, 0, 100);
      Q['rad_' + f] = SW.clamp(Q['rad_' + f] || 0, 0, 100);
      total += Q[f + '_strength'];
      if (!SW.factionActive || SW.factionActive(Q, f)) { weighted += Q[f + '_strength'] * Q['rad_' + f]; act += Q[f + '_strength']; }
    }
    if (total <= 0) total = 1;
    for (var j = 0; j < SW.FACTIONS.length; j++) {
      var ff = SW.FACTIONS[j];
      Q[ff + '_strength'] = Math.round(1000 * Q[ff + '_strength'] / total) / 10;
    }
    Q.caucus_unrest = act > 0 ? weighted / act / 100 : 0;
    Q.unrest_percent = Math.round(Q.caucus_unrest * 100);
  };

  SW.strongestFaction = function (Q) {
    var best = 'inst', v = -1;
    for (var i = 0; i < SW.FACTIONS.length; i++) {
      var f = SW.FACTIONS[i];
      if (Q[f + '_strength'] > v) { v = Q[f + '_strength']; best = f; }
    }
    return best;
  };

  // gain multiplier dampened by unrest
  SW.unity = function (Q) { return 1 - (Q.caucus_unrest || 0); };

  // ------------------------------------------------------------------ leaders
  // Every Senate bloc (except the Sith-run blocs) and every Caucus faction has a leader.
  // firm: 0 = pragmatist, 1 = hardliner. 0.5 reproduces the game's baseline behaviour.
  // views: shift in a bloc's chance of voting yes, by vote topic (rim, regulate, powers, army,
  //   oversight, peace, vonc). likes: affinity for other blocs. refuses: blocs it won't govern with.
  // rise(Q): how strongly the galaxy favours this leader (used for leadership contests).
  var on = function (x) { return x ? 1 : 0; };
  SW.LEADERS = {
    // Rimward Coalition
    teem: {group: 'rim', name: 'Ainlee Teem', tag: 'populist', firm: 0.5, relBase: 32,
      views: {rim: 0.05}, blurb: 'A Malastare populist. Wants the Rim\'s place in the Republic: seats, an end to slavery and to humancentrism. Will bargain for it.',
      rise: function (Q) { return 0.35 + 0.1 * on(Q.rim_enfranchised) + 0.15 * on(Q.rim_hardship < 45); }},
    orn_free_taa: {group: 'rim', name: 'Orn Free Taa', tag: 'dealmaker', firm: 0.2, relBase: 36,
      views: {regulate: -0.12, powers: 0.05, oversight: -0.05}, likes: {guild: 12, mod: 6}, rimGriev: -0.15, rimSep: -0.15,
      blurb: 'Ryloth\'s senator. Trades votes for favours, and the guilds pay well.',
      rise: function (Q) { return 0.15 + 0.2 * on(Q.corruption > 62) + 0.1 * on(Q.rim_relief >= 1) + 0.15 * on(Q.rim_enfranchised); }},
    ardana: {group: 'rim', name: 'Tal Ardana', tag: 'radical', firm: 0.9, relBase: 20,
      views: {rim: 0.15, regulate: 0.2, powers: -0.1, army: -0.15, peace: 0.15, vonc: 0.15},
      likes: {mod: -15, guild: -20, sec: -15, cis: 15, rfc: 10}, refuses: ['mod', 'guild', 'sec'],
      rimGriev: 0.15, rimSep: 0.2, pull: function (Q) { return Q.rim_hardship > 40 ? 0.1 : -0.05; },
      blurb: 'An Ord Mantell firebrand who has had enough talk. Reform now, or the Rim goes its own way, and she listens to Dooku.',
      rise: function (Q) {
        var lostRim = (Q.secession_where || '').indexOf('outer') >= 0 || (Q.secession_where || '').indexOf('midrim') >= 0;
        return 0.05 + Math.max(0, Q.rim_hardship - 45) / 30 + 0.2 * on(lostRim) + 0.1 * on(Q.dooku_movement) + 0.3 * on((Q.rim_radical || 0) >= 2) -
          0.3 * on(Q.rim_enfranchised) - Math.min(Q.rim_relief || 0, 3) * 0.05;
      }},
    // Commerce Guilds
    dod: {group: 'guild', name: 'Lott Dod', tag: 'Trade Federation', firm: 0.6, relBase: 22,
      views: {regulate: -0.05, rim: -0.05}, likes: {pal: 5},
      blurb: 'The Trade Federation\'s man in the Senate. Defends its monopolies to the last.',
      rise: function (Q) { return 0.35 - 0.2 * on(Q.tf_broken_up) + 0.05 * on(Q.guild_relation < 30); }},
    san_hill: {group: 'guild', name: 'San Hill', tag: 'hardliner', firm: 0.85, relBase: 14,
      views: {regulate: -0.2, peace: 0.1, army: -0.1, powers: -0.05}, likes: {cis: 20, rc: -10}, refuses: ['rim', 'rfc'],
      guildGriev: 0.25,
      blurb: 'Chairman of the Banking Clan. Already halfway to the Confederacy.',
      rise: function (Q) {
        return 0.1 + (Q.guild_embargo || 0) * 0.05 + 0.25 * on(Q.tf_broken_up) + 0.2 * on(Q.dooku_movement) +
          0.1 * on(Q.trade_tax) + 0.1 * on(Q.guild_relation < 20);
      }},
    clovis: {group: 'guild', name: 'Rush Clovis', tag: 'pragmatist', firm: 0.3, relBase: 34,
      views: {regulate: 0.1, oversight: 0.05}, likes: {rc: 8, mod: 6}, guildGriev: -0.15,
      blurb: 'A Scipio banker who thinks the guilds would do better inside a reformed Republic.',
      available: function (Q) { return Q.date >= 96 && !Q.banking_seizure_seen; },
      rise: function (Q) { return 0.15 + 0.15 * on(Q.banking_reformed) + 0.15 * on(Q.guild_relation > 35) + 0.1 * on(Q.war && Q.war_weariness > 30); }},
    // Core Moderates
    valorum: {group: 'mod', name: 'Finis Valorum', tag: 'establishment reformer', firm: 0.5, relBase: 42,
      views: {regulate: 0.05, oversight: 0.05}, blurb: 'The Chancellor. A decent man trapped in a slow machine.',
      // fallen as Chancellor, he can stand again for the Moderates' leadership a year on (three, if we pursued his scandal), unless he works for us
      available: function (Q) { return !Q.valorum_fallen || (!Q.adv_valorum && Q.valorum_fell_date >= 0 && Q.date >= Q.valorum_fell_date + (Q.valorum_scandal ? 36 : 12)); },
      rise: function (Q) { return 0.4; }},
    quill: {group: 'mod', name: 'Davan Quill', tag: 'establishment', firm: 0.6, relBase: 38,
      views: {regulate: -0.05, powers: 0.05, rim: -0.05}, likes: {guild: 6},
      blurb: 'The Core establishment\'s safe pair of hands. Distrusts anything new.',
      available: function (Q) { return Q.valorum_fallen || Q.date >= 21; },
      rise: function (Q) { return 0.35 + 0.1 * on(Q.corruption > 60) + 0.1 * on(Q.fear > 35); }},
    fang_zar: {group: 'mod', name: 'Fang Zar', tag: 'reformist', firm: 0.3, relBase: 50,
      views: {oversight: 0.12, powers: -0.12, rim: 0.05}, likes: {rc: 10}, pull: 0.05,
      blurb: 'Sern Prime\'s senator. Believes the Senate must take its authority back.',
      available: function (Q) { return Q.date >= 60; },
      rise: function (Q) {
        return 0.2 + 0.15 * on(Q.faith < 45) + 0.2 * on(Q.senate_resolve >= 3) + 0.15 * on(Q.emergency_powers >= 3) + 0.2 * on(Q.delegation_formed);
      }},
    // Security Bloc
    hask: {group: 'sec', name: 'Orvos Hask', tag: 'law and order', firm: 0.5, relBase: 28,
      blurb: 'A Colonies moderate. Will back anyone who clears the lanes of pirates and pays for the Republic\'s defence.',
      rise: function (Q) { return 0.35 + 0.1 * on(Q.fear < 35); }},
    tarkin: {group: 'sec', name: 'Wilhuff Tarkin', tag: 'hardliner', firm: 0.85, relBase: 20,
      views: {powers: 0.08, army: 0.1, oversight: -0.05, peace: -0.12, rim: -0.1}, likes: {pal: 15, rim: -15, rfc: -15},
      refuses: ['rim', 'rfc'], pull: function (Q) { return Q.fear > 35 ? 0.08 : 0; },
      blurb: 'Eriadu\'s rising star. Believes in rule through fear of force.',
      available: function (Q) { return Q.tarkin_rising > 0; },
      rise: function (Q) { return 0.1 + 0.15 * Q.tarkin_rising + Math.max(0, Q.fear - 35) / 40 + 0.2 * on(Q.war && Q.war_balance < 0) + 0.1 * on(Q.dooku_movement); }},
    danu: {group: 'sec', name: 'Giddean Danu', tag: 'constitutional hawk', firm: 0.3, relBase: 40,
      views: {oversight: 0.12, powers: -0.1, army: 0.05}, likes: {rc: 8, mod: 6},
      blurb: 'Kuat\'s senator. Wants a strong defence, under the Senate\'s control.',
      available: function (Q) { return Q.date >= 36; },
      rise: function (Q) {
        return 0.25 + 0.1 * on(Q.army_oversight) + 0.15 * on(Q.senate_resolve >= 3) + 0.15 * on(Q.emergency_powers >= 4) +
          0.1 * on(Q.evidence_public > 0) + 0.1 * on(Q.fear < 30);
      }},
    // Independents
    vell: {group: 'ind', name: 'Tamsar Vell', tag: 'broker', firm: 0.4, relBase: 40,
      blurb: 'Speaks for the unaligned worlds. Wants the war ended at the table, but stands by the Republic once it fights, and wants it reformed.',
      rise: function (Q) { return 0.35; }},
    satine: {group: 'ind', name: 'Satine Kryze', tag: 'neutralist', firm: 0.6, relBase: 42,
      views: {peace: 0.2, army: -0.15, powers: -0.1}, likes: {sec: -10, pal: -5, cis: 5},
      blurb: 'Duchess of Mandalore, voice of the Council of Neutral Systems. Peace above all.',
      available: function (Q) { return Q.dooku_movement || Q.war; },
      rise: function (Q) { return 0.15 + Q.war_weariness / 100 + 0.1 * on(Q.peace_talks >= 1) + 0.1 * on(Q.satine_friend); }},
    shale: {group: 'ind', name: 'Corwin Shale', tag: 'isolationist', firm: 0.7, relBase: 30,
      views: {army: -0.1, rim: -0.1, regulate: -0.05, peace: 0.05}, likes: {rc: -5},
      blurb: 'Wants Coruscant\'s hands off his worlds: seats and rights for the Rim, but no new taxes and no new powers for the Republic.',
      rise: function (Q) { return 0.15 + 0.1 * on(Q.treasury < 2) + 0.1 * on(Q.rim_hardship > 45) + 0.1 * on(Q.war_weariness > 40); }},
    // Rim Freedom Caucus (only if the Rimward wing splits away)
    farr: {group: 'rfc', name: 'Onaconda Farr', tag: 'pragmatist', firm: 0.35, relBase: 45,
      views: {rim: 0.05}, likes: {rc: 8},
      blurb: 'Rodia\'s senator. Left the Caucus, but still talks to it.',
      available: function (Q) { return !Q.farr_dead; },
      rise: function (Q) { return 0.4; }},
    tandeth: {group: 'rfc', name: 'Mira Tandeth', tag: 'radical', firm: 0.8, relBase: 28,
      views: {rim: 0.15, regulate: 0.15, army: -0.1, peace: 0.1}, likes: {mod: -10, guild: -15, cis: 10}, refuses: ['guild'],
      rimGriev: 0.1, rimSep: 0.15,
      blurb: 'A Mid Rim organiser who thinks the Caucus betrayed the Rim.',
      rise: function (Q) { return 0.1 + Math.max(0, Q.rim_hardship - 40) / 30 + (Q.farr_dead ? 1 : 0) + 0.3 * on((Q.rim_radical || 0) >= 2); }},
    // the leaders of the wings that have none of the original leaders
    doran: {group: 'mod', name: 'Tessaly Doran', tag: 'old family', firm: 0.7, relBase: 30,
      views: {rim: -0.1, powers: 0.08, oversight: -0.05}, likes: {pal: 12, rim: -10, rfc: -10},
      blurb: 'Lady of an old Corulag house. She speaks for the Core\'s ancient human families, and she listens to Palpatine.',
      rise: function (Q) { return 0.15 + 0.04 * Math.min(5, Q.hhc_heat || 0) + 0.1 * on(Q.fear > 45) + 0.1 * on(Q.pal_chancellor || (Q.pal_relation || 0) > 50) - 0.3 * on(Q.hhc_discredited); }},
    brask: {group: 'guild', name: 'Aldo Brask', tag: 'war industrialist', firm: 0.75, relBase: 26,
      views: {army: 0.15, powers: 0.1, peace: -0.15, oversight: -0.1, regulate: -0.1}, likes: {pal: 15, sec: 10, rim: -5},
      blurb: 'Fondor\'s senator, and the voice of the yards and foundries that build the Republic\'s war.',
      available: function (Q) { return SW.wingActive(Q, 'mic'); },
      rise: function (Q) { return 0.25 + 0.03 * Math.min(15, Q.war_turns || 0) + 0.04 * Math.min(5, Q.clones || 0) + 0.1 * on((Q.debt || 0) >= 20) + 0.1 * on(Q.banking_dereg) - 0.15 * on(Q.peace_talks >= 1); }},
    // Palpatine's lieutenants: each speaks for a wing of his bloc, and one of them succeeds him if he falls
    amedda: {group: 'pal', name: 'Mas Amedda', tag: 'centralist', firm: 0.6, relBase: 30,
      views: {powers: 0.15, oversight: -0.1}, likes: {mod: 6, sec: 6},
      blurb: 'The Vice Chair of the Senate, and the manager of the Chancellor\'s machine.',
      available: function (Q) { return !Q.amedda_arrested && !Q.amedda_removed; },
      rise: function (Q) { return 0.4; }},
    pestage: {group: 'pal', name: 'Sate Pestage', tag: 'centralist', firm: 0.6, relBase: 28,
      views: {powers: 0.15, oversight: -0.1}, likes: {mod: 4, sec: 6},
      blurb: 'A fixer from Palpatine\'s Naboo years, who now runs his appointments.',
      available: function (Q) { return !!(Q.amedda_arrested || Q.amedda_removed); },
      rise: function (Q) { return 0.4; }},
    greejatus: {group: 'pal', name: 'Janus Greejatus', tag: 'new order', firm: 0.9, relBase: 15,
      views: {powers: 0.2, army: 0.15, rim: -0.2, peace: -0.1, oversight: -0.15}, likes: {sec: 10, rim: -20, rfc: -20, rc: -10},
      blurb: 'A Coruscant ideologue who wants a human Republic, ruled by one man and guarded by the young.',
      rise: function (Q) { return 0.1 + 0.04 * Math.min(6, Q.hhc_heat || 0) + 0.12 * on(Q.rim_enfranchised) + 0.08 * on(Q.rim_assembly) + 0.1 * on(Q.sentience_rights) - 0.3 * on(Q.hhc_discredited); }},
    dangor: {group: 'pal', name: 'Ars Dangor', tag: 'devotee', firm: 0.85, relBase: 20,
      views: {powers: 0.25, oversight: -0.2}, likes: {rc: -5},
      blurb: 'Palpatine\'s most devoted adviser. He serves the man, not the Republic.',
      rise: function (Q) {
        if (Q.sidious_known || Q.pal_disgraced) return -0.45;
        return 0.1 + Math.min(0.25, (Q.pal_office_months || 0) / 200) + 0.6 * on(Q.pal_chancellor) + (Q.pal_chancellor ? 0.1 * Math.min(6, Q.emergency_powers || 0) : 0);
      }},

    // Caucus factions. agenda(Q) is true when the faction's demands are not being met.
    ryder: {group: 'inst', name: 'Horox Ryder', tag: 'mainstream', firm: 0.5,
      demand: 'an honest Senate (an Ethics Commission or lower corruption)',
      blurb: 'A veteran Core senator. Steady, procedural, and tired of scandals.',
      agenda: function (Q) { return Q.corruption > 62 && !Q.anti_corruption; },
      rise: function (Q) { return 0.35; }},
    papanoida: {group: 'inst', name: 'Chi Eekway Papanoida', tag: 'proceduralist', firm: 0.7,
      demand: 'an Ethics Commission now, and sunset clauses on any emergency powers',
      blurb: 'Pantora\'s senator. The constitution is not negotiable.',
      agenda: function (Q) { return (Q.corruption > 58 && !Q.anti_corruption) || (Q.emergency_powers >= 3 && !Q.emergency_sunset && !Q.rc_chancellor); },
      rise: function (Q) { return 0.05 + Math.max(0, Q.corruption - 64) / 30 + 0.1 * on(Q.emergency_powers >= 3 && !Q.emergency_sunset) + Math.max(0, Q.rad_inst - 40) / 60; }},
    taneel: {group: 'inst', name: 'Terr Taneel', tag: 'dealmaker', firm: 0.25,
      demand: 'corruption kept from spiralling, and a seat at the table',
      blurb: 'An Emberlene veteran of a hundred committee deals. Prefers results to purity.',
      agenda: function (Q) { return Q.corruption > 70 && !Q.anti_corruption; },
      rise: function (Q) { return 0.15 + 0.2 * on(Q.rc_in_govt) + Math.max(0, 25 - Q.rad_inst) / 60; }},

    tills: {group: 'rimward', name: 'Meena Tills', tag: 'mainstream', firm: 0.5,
      demand: 'relief for the Rim, an end to slavery, Rim representation',
      blurb: 'Mon Calamari\'s senator. Wants the Rim treated as part of the Republic.',
      agenda: function (Q) { return (Q.rim_hardship > 40 && !Q.rim_enfranchised) || (Q.date >= 60 && !Q.slavery_abolished && Q.slavery_campaign < 1); },
      rise: function (Q) { return 0.35; }},
    corvane: {group: 'rimward', name: 'Jessa Corvane', tag: 'radical', firm: 0.8,
      demand: 'enfranchisement and abolition now, and no deals with the guilds',
      blurb: 'A Dantooine firebrand. Thinks the Caucus has made too many excuses.',
      agenda: function (Q) {
        return (Q.rim_hardship > 36 && !Q.rim_enfranchised) || (Q.date >= 60 && !Q.slavery_abolished && Q.slavery_campaign < 2) ||
          (Q.rc_in_govt && (Q.govt_blocs || []).indexOf('guild') >= 0);
      },
      rise: function (Q) { return 0.05 + Math.max(0, Q.rim_hardship - 42) / 30 + Math.max(0, Q.rad_rimward - 40) / 60 + 0.1 * on(Q.rim_sep_high) + 0.3 * on((Q.rim_radical || 0) >= 2); }},
    rusk: {group: 'rimward', name: 'Hollin Rusk', tag: 'gradualist', firm: 0.25,
      demand: 'steady relief for the Rim, and a start on abolition',
      blurb: 'A Bakuran pragmatist. Half a loaf now beats a whole one never.',
      agenda: function (Q) { return (Q.rim_hardship > 50 && Q.rim_relief < 1 && !Q.rim_enfranchised) || (Q.date >= 84 && !Q.slavery_abolished && Q.slavery_campaign < 1); },
      rise: function (Q) { return 0.15 + 0.15 * on(Q.rim_relief >= 1) + 0.15 * on(Q.rim_enfranchised) + Math.max(0, 25 - Q.rad_rimward) / 60; }},

    venn: {group: 'pacifist', name: 'Aya Venn', tag: 'mainstream', firm: 0.5,
      demand: 'talks with the Separatists and fewer emergency powers',
      blurb: 'A Chandrilan lawyer. Law before arms, but no fool about either.',
      agenda: function (Q) {
        return (Q.war && Q.peace_talks < 2) || (!Q.rc_chancellor && Q.emergency_powers >= 4) || (Q.dooku_movement && !Q.war && Q.peace_talks < 1);
      },
      rise: function (Q) { return 0.35; }},
    shen: {group: 'pacifist', name: 'Tamra Shen', tag: 'absolutist', firm: 0.8,
      demand: 'peace talks above all, no emergency powers, and no Caucus militias',
      blurb: 'An Alderaanian absolutist. Every weapon built is a war made likelier.',
      agenda: function (Q) {
        return (Q.war && Q.peace_talks < 3) || (!Q.rc_chancellor && Q.emergency_powers >= 2) ||
          (Q.dooku_movement && !Q.war && Q.peace_talks < 1) || (Q.pact_formed && !Q.war);
      },
      rise: function (Q) { return 0.05 + Q.war_weariness / 150 + 0.1 * on(Q.emergency_powers >= 3) + Math.max(0, Q.rad_pacifist - 40) / 60; }},
    dask: {group: 'pacifist', name: 'Orrin Dask', tag: 'pragmatist', firm: 0.25,
      demand: 'a channel for peace, and a limit on the Chancellor\'s powers',
      blurb: 'A Corellian who accepts that a Republic may need to defend itself.',
      agenda: function (Q) { return (Q.war && Q.peace_talks < 1) || (!Q.rc_chancellor && Q.emergency_powers >= 6); },
      rise: function (Q) { return 0.15 + 0.15 * on(Q.peace_talks >= 1) + 0.1 * on(Q.fear > 40) + Math.max(0, 25 - Q.rad_pacifist) / 60; }},

    kelt: {group: 'hawk', name: 'Varo Kelt', tag: 'mainstream', firm: 0.5,
      demand: 'a Defence Pact and a firm line against the Separatists',
      blurb: 'A Corellian veteran of the Judicial Forces. Wants the Republic able to defend itself.',
      agenda: function (Q) { return (Q.dooku_movement && !Q.pact_formed && Q.member_forces < 3) || (Q.war && Q.war_balance < 0); },
      rise: function (Q) { return 0.35; }},
    voss: {group: 'hawk', name: 'Darra Voss', tag: 'militarist', firm: 0.8,
      demand: 'a Defence Pact, more forces, and victory without compromise',
      blurb: 'An Anaxes hawk. Talks are for after the war is won.',
      agenda: function (Q) {
        return (Q.dooku_movement && !Q.pact_formed) || (Q.war && Q.war_balance < 2) ||
          (Q.date >= 96 && Q.member_forces < 2 && Q.judicial_forces < 5) || (Q.war && Q.peace_talks >= 2);
      },
      rise: function (Q) { return 0.05 + Math.max(0, Q.fear - 35) / 45 + 0.15 * on(Q.war && Q.war_balance < 0) + Math.max(0, Q.rad_hawk - 40) / 60; }},
    morn: {group: 'hawk', name: 'Talia Morn', tag: 'constitutional hawk', firm: 0.3,
      demand: 'forces under Senate command: oversight of the clone army and a Defence Pact',
      blurb: 'A Chandrilan admiral\'s daughter. A strong Republic, but a lawful one.',
      agenda: function (Q) {
        return (Q.dooku_movement && !Q.pact_formed && Q.member_forces < 3 && Q.judicial_forces < 5) ||
          (Q.clones > 0 && !Q.army_oversight) || (Q.war && Q.war_balance < -3);
      },
      rise: function (Q) { return 0.15 + 0.15 * on(Q.clones > 0 && !Q.army_oversight) + 0.1 * on(Q.senate_resolve >= 3) + Math.max(0, 25 - Q.rad_hawk) / 60; }}
  };
  // ------------------------------------------------------------------ what leaders want
  // Each leader has a motive (why they hold or bend) and things they care about. What they care
  // about, plus what they remember of the Caucus, sets their mood; an angry leader digs in, a
  // pleased one bends. mc(test, weight, phrase): weight < 0 angers them, > 0 pleases them.
  var mc = function (test, weight, phrase) { return [test, weight, phrase]; };
  var inGovt = function (Q, b) { return (Q.govt_blocs || []).indexOf(b) >= 0; };
  var tariffsOn = function (Q) { return Q.trade_tax || Q.budget_rev === 'tariffs'; };
  var frontLosing = function (Q, f) { return Q.war && (Q.war_balance + (Q['war_off_' + f] || 0)) < -2; };
  SW.LEADER_MINDS = {
    teem: {motive: 'Ainlee Teem built his career on Malastare\'s grievances. He wants the Rim inside the Republic as an equal, not a colony. He bargains because a deal that feeds his worlds beats a principle that starves them, but he never forgets a broken promise.',
      cares: [mc(function (Q) { return Q.rim_relief >= 1; }, 2, 'relief for the Rim'), mc(function (Q) { return Q.rim_enfranchised; }, 2, 'Rim seats in the Senate'),
        mc(function (Q) { return Q.rim_hardship > 45; }, -2, 'hunger on the Rim'), mc(function (Q) { return inGovt(Q, 'rim'); }, 1, 'a seat in government'),
        mc(function (Q) { return frontLosing(Q, 'outer'); }, -2, 'the sieges of the Rim')]},
    orn_free_taa: {motive: 'Ryloth is poor and its senator is not. Orn Free Taa trades votes for favours because the favours keep him rich and his rivals at home quiet. He bends to whoever pays, and digs in against anyone who looks at his accounts.',
      cares: [mc(function (Q) { return inGovt(Q, 'rim'); }, 2, 'a share of power'), mc(function (Q) { return Q.guild_relation > 35; }, 1, 'the guilds\' generosity'),
        mc(function (Q) { return Q.anti_corruption; }, -2, 'the Ethics Commission'), mc(function (Q) { return tariffsOn(Q); }, -1, 'the trade tariffs'),
        mc(function (Q) { return Q.free_ryloth; }, -2, 'arming Cham Syndulla\'s rebels')]},
    ardana: {motive: 'Tal Ardana watched Ord Mantell starve while Coruscant debated. Every compromise the Rim has made has been broken, so she makes none. She takes her seat to stop the Senate working, and only reform that actually passes will change her mind.',
      cares: [mc(function (Q) { return Q.rim_hardship > 40; }, -2, 'the Rim\'s suffering'), mc(function (Q) { return Q.rim_enfranchised; }, 2, 'Rim enfranchisement'),
        mc(function (Q) { return inGovt(Q, 'guild'); }, -2, 'guild ministers in government'), mc(function (Q) { return Q.date >= 60 && !Q.slavery_abolished; }, -1, 'the slave markets'),
        mc(function (Q) { return frontLosing(Q, 'outer'); }, -2, 'the sieges of the Rim')]},
    dod: {motive: 'Neimoidian fortunes rest on the Trade Federation\'s monopolies. Lott Dod defends them line by line, because a single concession invites the next.',
      cares: [mc(tariffsOn, -2, 'the trade-route tariffs'), mc(function (Q) { return Q.tf_broken_up; }, -3, 'the break-up of the Federation'),
        mc(function (Q) { return Q.guild_regulations >= 1; }, -1, 'guild regulation'), mc(function (Q) { return Q.sanctions_lifted; }, 1, 'the lifting of sanctions'),
        mc(function (Q) { return inGovt(Q, 'guild'); }, 1, 'a seat at the table'), mc(function (Q) { return Q.gunray_convicted; }, -2, 'Viceroy Gunray\'s conviction')]},
    san_hill: {motive: 'San Hill lends to everyone and owes loyalty to no one. A Republic in debt is a Republic he can lean on; a Republic that audits him is one he will leave.',
      cares: [mc(function (Q) { return (Q.debt || 0) >= 15; }, 2, 'the Republic\'s debts to his Clan'), mc(function (Q) { return Q.banking_audit; }, -2, 'the audit of the Banking Clan'),
        mc(function (Q) { return Q.banking_independent; }, -1, 'limits on the Clan\'s charter'), mc(tariffsOn, -1, 'the trade tariffs'),
        mc(function (Q) { return Q.tf_broken_up; }, -2, 'the break-up of the Federation')]},
    clovis: {motive: 'Rush Clovis thinks the guilds would be richer inside a lawful Republic than outside it. He compromises easily, unless the banks he wants to save are being looted.',
      cares: [mc(function (Q) { return Q.banking_independent; }, 2, 'an independent Banking Clan'), mc(function (Q) { return Q.anti_corruption; }, 1, 'a cleaner Senate'),
        mc(function (Q) { return (Q.debt || 0) >= 25; }, -2, 'a Republic drowning in debt'), mc(function (Q) { return Q.banks_seized; }, -3, 'the seizure of the banks')]},
    valorum: {motive: 'Finis Valorum believes the Senate can still be made to work, by procedure and patience. He holds firm on his reforms and gives way on almost everything else.',
      cares: [mc(tariffsOn, 2, 'his trade-route tax'), mc(function (Q) { return Q.valorum_scandal; }, -1, 'the shipping scandal'),
        mc(function (Q) { return Q.corruption > 65; }, -1, 'the Senate\'s corruption')]},
    quill: {motive: 'Davan Quill speaks for the Core worlds that have done well out of the Republic as it is. He is not against reform, only against anything that moves faster than a committee.',
      cares: [mc(function (Q) { return SW.reformCount(Q) >= 3; }, -2, 'the pace of reform'), mc(function (Q) { return inGovt(Q, 'mod'); }, 2, 'a stable government'),
        mc(function (Q) { return inGovt(Q, 'rim') && Q.rc_in_govt; }, -1, 'Rim radicals in government'), mc(function (Q) { return Q.fear > 45; }, -1, 'the disorder'),
        mc(function (Q) { return Q.budget_rev === 'levy'; }, -2, 'the levy on the Core')]},
    fang_zar: {motive: 'Fang Zar has watched the Senate hand away its powers one emergency at a time. He will work with anyone who wants them back, and with no one who wants more.',
      cares: [mc(function (Q) { return Q.emergency_powers >= 3 && !Q.rc_chancellor; }, -2, 'the Chancellor\'s emergency powers'), mc(function (Q) { return Q.emergency_sunset; }, 2, 'sunset clauses'),
        mc(function (Q) { return Q.term_limits_protected; }, 1, 'entrenched term limits'), mc(function (Q) { return Q.delegation_formed; }, 1, 'the Delegation of 2000')]},
    hask: {motive: 'Orvos Hask wants order, and a Republic able to keep it. He is a moderate who will deal with anyone serious about the pirates and the Republic\'s defence, and he grows fiercer when the lanes are unsafe.',
      cares: [mc(function (Q) { return Q.judicial_forces >= 5; }, 2, 'a stronger Judicial Force'), mc(function (Q) { return Q.pact_formed; }, 1, 'the Defence Pact'),
        mc(function (Q) { return Q.rim_hardship > 45 || (Q.trade || 60) < 35; }, -1, 'piracy on the lanes'), mc(function (Q) { return Q.fear > 45; }, -1, 'the disorder')]},
    tarkin: {motive: 'Wilhuff Tarkin learned on Eriadu that order comes from fear of force. He holds his line because he thinks compromise is weakness, and he has Palpatine\'s ear.',
      cares: [mc(function (Q) { return Q.war && Q.war_balance < 0; }, -2, 'a war being lost'), mc(function (Q) { return Q.war && Q.peace_talks >= 2; }, -2, 'talk of peace'),
        mc(function (Q) { return Q.emergency_powers >= 4; }, 2, 'a strong executive'), mc(function (Q) { return Q.army_oversight; }, -1, 'the Senate meddling in the army'),
        mc(function (Q) { return inGovt(Q, 'rim'); }, -2, 'Rim agitators in government'), mc(function (Q) { return Q.citadel; }, 1, 'the Citadel')]},
    danu: {motive: 'Giddean Danu builds warships at Kuat and wants them commanded by the Senate. He bends on budgets and never on who holds the leash.',
      cares: [mc(function (Q) { return Q.army_oversight || !Q.kamino_army; }, 2, 'Senate command of the forces'), mc(function (Q) { return Q.judicial_forces >= 5; }, 1, 'the Judicial Forces'),
        mc(function (Q) { return Q.emergency_powers >= 5; }, -2, 'a Chancellor with an army of his own'), mc(function (Q) { return Q.fleet_levy; }, 1, 'the member-world fleets')]},
    vell: {motive: 'Tamsar Vell speaks for worlds that joined the Republic for trade and protection. He would end any war at the negotiating table, but he will not abandon the Republic once it is fighting, and he believes it can be reformed.',
      cares: [mc(function (Q) { return Q.budget_rev === 'levy' || tariffsOn(Q); }, -1, 'new taxes on unaligned worlds'), mc(function (Q) { return inGovt(Q, 'ind'); }, 1, 'being consulted'),
        mc(function (Q) { return Q.peace_talks >= 1; }, 1, 'the peace talks'), mc(function (Q) { return Q.fleet_levy; }, -2, 'the fleet levy')]},
    satine: {motive: 'Duchess Satine rebuilt Mandalore on the promise that it would never go to war again. She compromises on everything but that.',
      cares: [mc(function (Q) { return Q.peace_talks >= 1; }, 2, 'the peace talks'), mc(function (Q) { return Q.war; }, -1, 'the war'),
        mc(function (Q) { return Q.mandalore_pressed; }, -3, 'pressure on Mandalore\'s neutrality'), mc(function (Q) { return Q.satine_friend; }, 1, 'the Caucus\'s friendship')]},
    shale: {motive: 'Corwin Shale\'s worlds pay their dues and ask for nothing. He will vote to give the Rim its seats and its rights, but against anything that makes Coruscant stronger, and he treats every levy as a betrayal.',
      cares: [mc(tariffsOn, -2, 'Coruscant\'s taxes'), mc(function (Q) { return Q.budget_rev === 'levy'; }, -2, 'the Core levy'),
        mc(function (Q) { return Q.war; }, -1, 'the war'), mc(function (Q) { return Q.fleet_levy; }, -2, 'the fleet levy')]},
    farr: {motive: 'Onaconda Farr left the Caucus over the Rim, but he still believes it can be persuaded. He bargains warmly and remembers betrayal for ever.',
      cares: [mc(function (Q) { return Q.rim_relief >= 1; }, 2, 'relief for the Rim'), mc(function (Q) { return Q.farr_relation_broken; }, -3, 'the Caucus\'s betrayal'),
        mc(function (Q) { return Q.rim_hardship > 45; }, -2, 'hunger on Rodia')]},
    tandeth: {motive: 'Mira Tandeth thinks the Caucus sold the Rim for committee seats. She sets the price of her votes high, and in public.',
      cares: [mc(function (Q) { return Q.rim_hardship > 40; }, -2, 'the Rim\'s suffering'), mc(function (Q) { return inGovt(Q, 'guild'); }, -2, 'guild ministers in government'),
        mc(function (Q) { return Q.rim_enfranchised; }, 2, 'Rim enfranchisement'), mc(function (Q) { return Q.farr_dead; }, -2, 'Farr\'s murder')]},
    doran: {motive: 'The Dorans have sat in the Senate since before Ruusan. Tessaly Doran believes the Republic was built by humans for humans, and that the Rim\'s new rights are the beginning of the end. She bends for order and for Palpatine, and for nothing else.',
      cares: [mc(function (Q) { return Q.rim_enfranchised; }, -2, 'Rim enfranchisement'), mc(function (Q) { return Q.sentience_rights; }, -2, 'the Rights of Sentience'),
        mc(function (Q) { return Q.hhc_investigated; }, -2, 'the investigation of the human-first groups'), mc(function (Q) { return Q.fear > 45; }, 1, 'the call for order'),
        mc(function (Q) { return inGovt(Q, 'mod'); }, 1, 'a seat in government')]},
    brask: {motive: 'Aldo Brask\'s yards at Fondor have never been busier. Every warship the Republic orders is another reason for the war to go on, and he will not let the Senate forget who builds them.',
      cares: [mc(function (Q) { return Q.war; }, 2, 'the war orders'), mc(function (Q) { return Q.peace_talks >= 1; }, -2, 'talk of peace'),
        mc(function (Q) { return Q.army_oversight; }, -1, 'the Senate meddling in procurement'), mc(function (Q) { return (Q.debt || 0) >= 25; }, -1, 'a Republic too deep in debt to pay')]},
    amedda: {motive: 'Mas Amedda manages the Senate for the Chancellor. He believes order needs a strong hand, and that his is the hand that holds the gavel.',
      cares: [mc(function (Q) { return Q.emergency_powers >= 3; }, 2, 'the Chancellor\'s powers'), mc(function (Q) { return Q.independent_speaker; }, -2, 'the independent Speaker')]},
    pestage: {motive: 'Sate Pestage has served Palpatine since Naboo. He sells appointments, keeps the files, and wants the machine to go on running.',
      cares: [mc(function (Q) { return Q.emergency_powers >= 3; }, 2, 'the Chancellor\'s powers'), mc(function (Q) { return Q.integrity_office; }, -2, 'the Office of Public Integrity')]},
    greejatus: {motive: 'Janus Greejatus wants a human Republic under one man. He regards every right granted to the Rim as a wrong to be undone.',
      cares: [mc(function (Q) { return Q.rim_enfranchised; }, -3, 'the Rim\'s seats'), mc(function (Q) { return Q.sentience_rights; }, -2, 'the Rights of Sentience'),
        mc(function (Q) { return Q.fear > 45; }, 2, 'the fear in the streets')]},
    dangor: {motive: 'Ars Dangor believes in Palpatine, not in the Republic. Whatever serves the Chancellor is right.',
      cares: [mc(function (Q) { return Q.pal_chancellor; }, 3, 'the Chancellor in his rightful place'), mc(function (Q) { return Q.anti_corruption; }, -2, 'the ethics law')]},
    // Caucus factions
    ryder: {motive: 'Horox Ryder has sat through forty years of scandals. He is patient with the Caucus as long as it is visibly cleaner than the Senate around it.',
      cares: [mc(function (Q) { return Q.corruption > 62; }, -2, 'the corruption scandals'), mc(function (Q) { return Q.anti_corruption; }, 2, 'the Ethics Commission'),
        mc(function (Q) { return Q.rc_in_govt; }, 1, 'a seat in government')]},
    papanoida: {motive: 'Chi Eekway Papanoida believes a constitution bent once will break. She will not trade procedure for advantage, even her own side\'s.',
      cares: [mc(function (Q) { return Q.emergency_powers >= 3 && !Q.emergency_sunset; }, -2, 'emergency powers without a sunset'), mc(function (Q) { return Q.anti_corruption; }, 2, 'the Ethics Commission'),
        mc(function (Q) { return Q.corruption > 58; }, -1, 'the Senate\'s corruption')]},
    taneel: {motive: 'Terr Taneel has made a hundred committee deals and regrets few of them. Power matters more to him than purity, so he forgives almost anything except being left out.',
      cares: [mc(function (Q) { return Q.rc_in_govt; }, 2, 'being in government'), mc(function (Q) { return Q.rc_chancellor; }, 1, 'our Chancellor'),
        mc(function (Q) { return Q.corruption > 70; }, -1, 'runaway corruption')]},
    tills: {motive: 'Meena Tills wants the Rim treated as part of the Republic. She is patient while it improves and hard to calm when it does not.',
      cares: [mc(function (Q) { return Q.rim_hardship > 40; }, -2, 'hardship on the Rim'), mc(function (Q) { return Q.rim_relief >= 1; }, 1, 'Rim relief'),
        mc(function (Q) { return Q.rim_enfranchised; }, 2, 'Rim representation'), mc(function (Q) { return Q.slavery_abolished; }, 1, 'abolition')]},
    corvane: {motive: 'Jessa Corvane grew up on Dantooine hearing that help was coming. She has stopped believing it, and wants the Caucus to stop promising it.',
      cares: [mc(function (Q) { return Q.rim_enfranchised; }, 2, 'enfranchisement'), mc(function (Q) { return Q.rc_in_govt && inGovt(Q, 'guild'); }, -3, 'governing with the guilds'),
        mc(function (Q) { return Q.rim_hardship > 36; }, -2, 'the Rim\'s hunger'), mc(function (Q) { return Q.slavery_abolished; }, 2, 'abolition')]},
    rusk: {motive: 'Hollin Rusk thinks half a loaf now beats a whole one never. He is the easiest of the Rimward leaders to satisfy, and the slowest to anger.',
      cares: [mc(function (Q) { return Q.rim_relief >= 1; }, 2, 'steady relief'), mc(function (Q) { return Q.rim_hardship > 50; }, -2, 'famine on the Rim')]},
    venn: {motive: 'Aya Venn trusts law over arms. She accepts defence when it is lawful, and turns hard against powers that answer to no one.',
      cares: [mc(function (Q) { return Q.peace_talks >= 1; }, 1, 'the peace talks'), mc(function (Q) { return Q.emergency_powers >= 4 && !Q.rc_chancellor; }, -2, 'the emergency powers'),
        mc(function (Q) { return Q.war && Q.peace_talks < 2; }, -1, 'a war without talks')]},
    shen: {motive: 'Tamra Shen believes every weapon built makes a war likelier. She will not compromise with the war, and barely with the Caucus.',
      cares: [mc(function (Q) { return Q.war; }, -2, 'the war'), mc(function (Q) { return Q.peace_talks >= 2; }, 2, 'real peace talks'),
        mc(function (Q) { return Q.pact_formed; }, -1, 'Caucus militias'), mc(function (Q) { return Q.krell_backed; }, -2, 'what was done on Umbara')]},
    dask: {motive: 'Orrin Dask accepts that a Republic may need to defend itself, so long as someone is still trying to end the war.',
      cares: [mc(function (Q) { return Q.peace_talks >= 1; }, 2, 'a channel for peace'), mc(function (Q) { return Q.emergency_powers >= 6; }, -2, 'the Chancellor\'s powers')]},
    kelt: {motive: 'Varo Kelt served in the Judicial Forces and buried friends after Yinchorri. He wants the Republic able to defend itself, and grows impatient when it cannot.',
      cares: [mc(function (Q) { return Q.pact_formed; }, 2, 'the Defence Pact'), mc(function (Q) { return Q.war && Q.war_balance < 0; }, -2, 'defeats at the front')]},
    voss: {motive: 'Darra Voss grew up under Anaxes\'s shipyards and believes talks are for after victory. Every setback makes her harder.',
      cares: [mc(function (Q) { return Q.war && Q.peace_talks >= 2; }, -2, 'talk of compromise'), mc(function (Q) { return Q.war && Q.war_balance > 2; }, 2, 'victories'),
        mc(function (Q) { return Q.pact_formed; }, 1, 'the Defence Pact'), mc(function (Q) { return Q.war_aim === 'peace'; }, -2, 'a war aimed at talks')]},
    morn: {motive: 'Talia Morn wants a strong Republic and a lawful one. She bends on money and digs in on command.',
      cares: [mc(function (Q) { return Q.army_oversight || !Q.kamino_army; }, 2, 'Senate command of the army'), mc(function (Q) { return Q.clones > 0 && !Q.army_oversight; }, -2, 'an army answerable to no one'),
        mc(function (Q) { return Q.pact_formed; }, 1, 'the Defence Pact')]}
  };

  // A leader's mood: what they care about, plus what they remember of the Caucus.
  SW.leaderMood = function (Q, group) {
    var id = Q[group + '_leader_id'];
    var mind = SW.LEADER_MINDS[id];
    var score = (Q[group + '_favour'] || 0) - (Q[group + '_grudge'] || 0);
    var best = null, bestW = 0;
    if ((Q[group + '_grudge'] || 0) >= 1.5) { best = 'remembers how we crossed them'; bestW = -(Q[group + '_grudge']); }
    if ((Q[group + '_favour'] || 0) >= 1.5 && Q[group + '_favour'] > -bestW) { best = 'grateful for our help'; bestW = Q[group + '_favour']; }
    if (mind) {
      for (var i = 0; i < mind.cares.length; i++) {
        var cr = mind.cares[i];
        var on;
        try { on = cr[0](Q); } catch (e) { on = false; }
        if (!on) continue;
        score += cr[1];
        if (Math.abs(cr[1]) > Math.abs(bestW)) {
          bestW = cr[1];
          best = (cr[1] <= -3 ? 'furious about ' : (cr[1] <= -2 ? 'angry about ' : (cr[1] < 0 ? 'uneasy about ' : (cr[1] >= 2 ? 'pleased with ' : 'content with ')))) + cr[2];
        }
      }
    }
    return {score: SW.clamp(score, -6, 6), reason: best || 'keeping their own counsel'};
  };
  // How firmly a group holds its line: the leader's temperament, hardened by anger, softened by goodwill.
  SW.firm = function (Q, group) {
    var base = SW.leader(Q, group).firm;
    if (!Q || !Q[group + '_leader_id']) return base;
    return SW.clamp(base - SW.clamp(0.07 * SW.leaderMood(Q, group).score, -0.25, 0.25), 0.05, 0.95);
  };
  SW.stanceWord = function (f) {
    return f >= 0.8 ? 'uncompromising' : (f >= 0.62 ? 'hardline' : (f >= 0.45 ? 'firm' : (f >= 0.3 ? 'pragmatic' : 'accommodating')));
  };
  SW.leaderLine = function (Q, group) {
    return SW.stanceWord(SW.firm(Q, group)) + ' · ' + SW.leaderMood(Q, group).reason;
  };


  // ------------------------------------------------------------------ ultimatums and offers
  // An angry bloc leader with poor relations makes demands; a pleased one with good relations offers help.
  SW.LEADER_DEMANDS = {
    guild: {ask: function (Q) { return tariffsOn(Q) ? 'Drop the trade-route tariffs, or the guilds\' credit lines close.' : 'Stop regulating the guilds, or the credit lines close.'; },
      label: 'Give the guilds what they want.', cost: 0, acceptSub: 'The guilds ease off and the embargo lifts a little; the Rimward wing is furious.',
      accept: function (Q) { Q.trade_tax = 0; Q.tariff_ban_until = Q.date + 24; Q.guild_regulations = 0; SW.guildPatience(Q, 15); Q.guild_embargo = Math.max(0, Q.guild_embargo - 2); Q.corruption += 1; Q.rad_rimward += 5; },
      refuseSub: 'The guild embargo tightens.', refuse: function (Q) { Q.guild_embargo += 1; }},
    rim: {ask: function () { return 'Relief for the Rim, now, or our votes go to whoever will feed our worlds.'; },
      label: 'Send relief convoys.', cost: 2, acceptSub: '−2 treasury. Less hardship on the Rim.',
      accept: function (Q) { Q.treasury -= 2; Q.rim_hardship -= 3; Q.rim_relief += 0.5; },
      refuseSub: 'Separatism grows on the Rim.', refuse: function (Q) { Q.outer_sep += 2; Q.midrim_sep += 1; }},
    sec: {ask: function () { return 'Money for the fleet, or the Security Bloc votes against everything the Caucus sponsors.'; },
      label: 'Fund the fleet.', cost: 2, acceptSub: '−2 treasury. Stronger forces; the Pacifists object.',
      accept: function (Q) { Q.treasury -= 2; Q.judicial_forces += 0.5; Q.rad_pacifist += 4; if (Q.war) SW.pushFront(Q, SW.weakestFront(Q), 1); },
      refuseSub: 'Fear rises, and the Hawks grow restless.', refuse: function (Q) { Q.fear += 2; Q.rad_hawk += 3; }},
    mod: {ask: function () { return 'Slow down. Give the Senate a year without another constitutional fight.'; },
      label: 'Agree to a pause.', cost: 0, acceptSub: 'Constitutional and judicial reform waits a while; the Institutionalists approve, the Rimward wing does not.',
      accept: function (Q) { Q.constitution_timer = Math.max(Q.constitution_timer || 0, 4); Q.judiciary_timer = Math.max(Q.judiciary_timer || 0, 4); Q.rad_inst -= 3; Q.rad_rimward += 3; },
      refuseSub: 'The Core Moderates will be harder to work with.', refuse: function () {}},
    ind: {ask: function () { return 'Exempt the unaligned worlds from your levies, or find your majorities elsewhere.'; },
      label: 'Grant the exemption.', cost: 1, acceptSub: '−1 treasury.',
      accept: function (Q) { Q.treasury -= 1; },
      refuseSub: 'The unaligned worlds drift away from Coruscant.', refuse: function (Q) { Q.corporate_sep += 1; Q.midrim_sep += 1; }}
  };
  SW.LEADER_DEMANDS.rfc = SW.LEADER_DEMANDS.rim;
  SW.LEADER_OFFERS = {
    guild: 'The guilds are prepared to be helpful, for now.', rim: 'The Rimward Coalition remembers who stood by it.',
    sec: 'The Security Bloc respects a Caucus that takes defence seriously.', mod: 'The Core Moderates are ready to work with us.',
    ind: 'The unaligned worlds are inclined to be friendly.', rfc: 'Our old Rimward friends want to work together again.'
  };
  SW.leaderMomentCheck = function (Q) {
    if (Q.lm_ready || Q.leader_moment_timer > 0 || Q.finale || Q.game_ending || Q.date < 24) return;
    var pick = null, pickScore = 0, kind = '';
    for (var i = 0; i < SW.CONTEST_BLOCS.length; i++) {
      var g = SW.CONTEST_BLOCS[i];
      if (Q.parties.indexOf(g) < 0 || !Q[g + '_leader_id'] || Q.date - (Q[g + '_asked'] || -99) < 36) continue;
      var m = SW.leaderMood(Q, g).score, rel = Q[g + '_relation'] || 0;
      if (m <= -3 && rel < 35 && m < pickScore) { pick = g; pickScore = m; kind = 'ultimatum'; }
      else if (!kind && m >= 2 && rel >= 50 && m > pickScore) { pick = g; pickScore = m; kind = 'offer'; }
    }
    if (pick) { Q.lm_ready = 1; Q.lm_group = pick; Q.lm_ultimatum = kind === 'ultimatum' ? 1 : 0; }
  };
  SW.leaderMomentOpen = function (Q) {
    var g = Q.lm_group, L = SW.leader(Q, g), mind = SW.LEADER_MINDS[Q[g + '_leader_id']] || {}, d = SW.LEADER_DEMANDS[g] || SW.LEADER_DEMANDS.ind;
    Q.lm_ready = 0; Q[g + '_asked'] = Q.date; Q.leader_moment_timer = 6;
    Q.lm_leader = L.name || Q[g + '_leader']; Q.lm_group_name = SW.name(Q, g);
    Q.lm_reason = SW.leaderMood(Q, g).reason; Q.lm_motive = mind.motive || L.blurb || '';
    Q.lm_title = (Q.lm_ultimatum ? 'An Ultimatum from ' : 'An Offer from ') + Q.lm_leader;
    Q.lm_ask = d.ask(Q); Q.lm_label = d.label; Q.lm_cost = d.cost; Q.lm_accept_sub = d.acceptSub; Q.lm_refuse_sub = d.refuseSub;
    Q.lm_offer = SW.LEADER_OFFERS[g] || '';
  };
  SW.leaderMomentResolve = function (Q, choice) {
    var g = Q.lm_group, d = SW.LEADER_DEMANDS[g] || SW.LEADER_DEMANDS.ind;
    if (choice === 'accept') { d.accept(Q); SW.deliver(Q, g, 15, 'what its leader asked for'); Q.ultimatums_met = (Q.ultimatums_met || 0) + 1; }
    else if (choice === 'refuse') { d.refuse(Q); Q[g + '_grudge'] = (Q[g + '_grudge'] || 0) + 2; Q[g + '_relation'] -= 6; Q.ultimatums_refused = (Q.ultimatums_refused || 0) + 1; }
    else if (choice === 'vote') { Q['vote_boost_' + g] = 0.15; }
    else if (choice === 'capital') { Q.capital += 1; }
    else { Q[g + '_relation'] += 4; Q[g + '_favour'] = (Q[g + '_favour'] || 0) + 1; }
  };

  SW.LEADER_START = {
    rim: 'orn_free_taa', guild: 'dod', mod: 'valorum', sec: 'hask', ind: 'vell', rfc: 'farr',
    inst: 'ryder', rimward: 'tills', pacifist: 'venn', hawk: 'kelt'
  };
  SW.CONTEST_BLOCS = ['mod', 'guild', 'rim', 'sec', 'ind', 'rfc'];
  SW.NEUTRAL_LEADER = {firm: 0.5, views: {}, likes: {}, refuses: [], tag: '', blurb: ''};

  SW.leader = function (Q, group) {
    var id = Q && Q[group + '_leader_id'];
    return (id && SW.LEADERS[id]) || SW.NEUTRAL_LEADER;
  };
  SW.leaderPool = function (Q, group) {
    var out = [];
    for (var id in SW.LEADERS) {
      var L = SW.LEADERS[id];
      if (L.group === group && (!L.available || L.available(Q))) out.push(id);
    }
    return out;
  };
  SW.setLeader = function (Q, group, id) {
    var L = SW.LEADERS[id];
    if (!L) return;
    Q[group + '_leader_id'] = id;
    Q[group + '_leader'] = L.name;
    // a new leader starts from today's figures: earlier changes are not rescaled
    if (SW.FACTIONS.indexOf(group) < 0) Q[group + '_relation_prev'] = Q[group + '_relation'];
    Q.leader_changes = (Q.leader_changes || 0) + 1;
    Q[group + '_favour'] = 0; Q[group + '_grudge'] = 0;
    if (id === 'ardana') Q.rim_was_radical = 1;
    var lw = SW.LEADER_WING && SW.LEADER_WING[id];
    if (lw && SW.WINGS[lw].bloc === group && Q[group + '_wing'] !== lw) {
      Q[group + '_wing'] = lw;
      if (SW.wingActive(Q, lw)) SW.wingShift(Q, lw, 8);
      Q[group + '_congress_hold'] = Q.date + 12;
    }
    if (group === 'mod') Q.valorum_leads_mod = (Q.valorum_fallen && id === 'valorum') ? 1 : 0;
  };
  SW.leaderRefuses = function (Q, a, b) {
    var r = SW.leader(Q, a).refuses || [];
    return r.indexOf(b) >= 0;
  };
  // Whether a set of blocs can govern together; returns '' or the reason.
  SW.coalitionBlock = function (Q, blocs) {
    if (Q.walkout_bloc && Q.date < Q.walkout_until && blocs.indexOf('rc') >= 0 && blocs.indexOf(Q.walkout_bloc) >= 0) {
      return 'The ' + SW.name(Q, Q.walkout_bloc) + ' walked out of our last government and will not serve with us yet.';
    }
    for (var i = 0; i < blocs.length; i++) {
      for (var j = 0; j < blocs.length; j++) {
        if (i !== j && SW.leaderRefuses(Q, blocs[i], blocs[j])) {
          return Q[blocs[i] + '_leader'] + ' will not govern with the ' + SW.name(Q, blocs[j]) + '.';
        }
      }
    }
    return '';
  };
  // ------------------------------------------------------------------ relations between the blocs
  // Every pair of blocs has a relation (0-100, the same scale as the Caucus's: hostile <10, cold <25, cool, cordial 40+, warm 55+, close 70+).
  // The Caucus's own relations stay in <bloc>_relation; other pairs live in rel_<a>_<b>, ids in alphabetical order.
  SW.REL_BLOCS = ['mod', 'pal', 'guild', 'rim', 'sec', 'ind', 'cis', 'rfc'];
  SW.relKey = function (a, b) { return a < b ? a + '_' + b : b + '_' + a; };
  // where a pair's relation settles: their natural affinity, and what their leaders think of each other
  SW.relBase = function (Q, a, b) {
    var pa = a, pb = b;
    if (Q && Q.rfc_kind && Q.rfc_kind !== 'rimward') { if (a === 'rfc') pa = SW.RFC_PROXY[Q.rfc_kind]; if (b === 'rfc') pb = SW.RFC_PROXY[Q.rfc_kind]; }
    var v;
    if (pa === pb) v = 65;
    else {
      var ab = (SW.AFFINITY[pa] && SW.AFFINITY[pa][pb] !== undefined) ? SW.AFFINITY[pa][pb] : 20;
      var ba = (SW.AFFINITY[pb] && SW.AFFINITY[pb][pa] !== undefined) ? SW.AFFINITY[pb][pa] : 20;
      v = (ab + ba) / 2;
    }
    if (Q) {
      var La = SW.leader(Q, a), Lb = SW.leader(Q, b);
      v += (((La.likes && La.likes[b]) || 0) + ((Lb.likes && Lb.likes[a]) || 0)) / 2;
      if (SW.leaderRefuses(Q, a, b) || SW.leaderRefuses(Q, b, a)) v -= 30;
    }
    return SW.clamp(v, 0, 100);
  };
  SW.rel = function (Q, a, b) {
    if (a === b) return 100;
    if (a === 'rc') return Q[b + '_relation'] || 0;
    if (b === 'rc') return Q[a + '_relation'] || 0;
    var k = 'rel_' + SW.relKey(a, b);
    if (typeof Q[k] !== 'number' || isNaN(Q[k])) Q[k] = SW.relBase(Q, a, b);
    return Q[k];
  };
  SW.relAdd = function (Q, a, b, v) {
    if (a === b) return;
    if (a === 'rc') { Q[b + '_relation'] = (Q[b + '_relation'] || 0) + v; return; }
    if (b === 'rc') { Q[a + '_relation'] = (Q[a + '_relation'] || 0) + v; return; }
    Q['rel_' + SW.relKey(a, b)] = SW.clamp(SW.rel(Q, a, b) + v, 0, 100);
  };
  // how warm a relationship a bloc's leader needs before governing with a partner:
  // hardliners need cordial ties, firm leaders cool ones, flexible leaders will even sit with a bloc they are cold toward
  SW.joinMin = function (Q, b) {
    if (b === 'rc') return 0;
    var f = SW.firm(Q, b);
    return f >= 0.62 ? 40 : (f >= 0.45 ? 25 : 10);
  };
  SW.relWord = function (v) { return v < 10 ? 'hostile' : (v < 25 ? 'cold' : (v < 40 ? 'cool' : (v < 55 ? 'cordial' : (v < 70 ? 'warm' : 'close')))); };
  SW.joinWord = function (Q, b) { var m = SW.joinMin(Q, b); return m >= 40 ? 'cordial' : (m >= 25 ? 'cool' : 'cold'); };
  SW.relOk = function (Q, a, b) { return SW.rel(Q, a, b) >= Math.max(SW.joinMin(Q, a), SW.joinMin(Q, b)); };
  SW.coalitionMin = function (Q, b) { return SW.joinMin(Q, b); };
  // the first pair in a set of blocs that will not sit together, or null
  SW.coldPair = function (Q, blocs) {
    for (var i = 0; i < blocs.length; i++) for (var j = i + 1; j < blocs.length; j++) if (!SW.relOk(Q, blocs[i], blocs[j])) return [blocs[i], blocs[j]];
    return null;
  };
  SW.coldPairText = function (Q, p) {
    if (p[0] === 'rc' || p[1] === 'rc') {
      var o = p[0] === 'rc' ? p[1] : p[0];
      return 'The ' + SW.name(Q, o) + ' under ' + (Q[o + '_leader'] || 'their leader') + ' need ' + SW.joinWord(Q, o) + ' relations to govern with us.';
    }
    return 'The ' + SW.name(Q, p[0]) + ' and the ' + SW.name(Q, p[1]) + ' are too cold to sit together.';
  };
  // each quarter every pair drifts toward its natural level; governing together warms a pair
  SW.relTick = function (Q, rf) {
    var bl = SW.REL_BLOCS.filter(function (b) { return Q.parties.indexOf(b) >= 0; });
    var gov = Q.govt_blocs || [];
    for (var i = 0; i < bl.length; i++) for (var j = i + 1; j < bl.length; j++) {
      var a = bl[i], b = bl[j], v = SW.rel(Q, a, b);
      v += (SW.relBase(Q, a, b) - v) * 0.05 * rf;
      if (gov.indexOf(a) >= 0 && gov.indexOf(b) >= 0) v += rf;
      Q['rel_' + SW.relKey(a, b)] = SW.clamp(v, 0, 100);
    }
  };
  // When the Senate cannot form a majority, or a government falls apart, voters lose faith in the system itself:
  // Palpatine, who promises order, and the Separatists, who promise a way out, both gain. A one-off swing that fades with time.
  SW.brokenSystem = function (Q, why) {
    var pal = !Q.pal_disgraced && !Q.sidious_defeated, cis = Q.parties.indexOf('cis') >= 0;
    for (var i = 0; i < SW.REGIONS.length; i++) {
      var r = SW.REGIONS[i];
      if (pal) Q[r + '_pal'] = (Q[r + '_pal'] || 0) * 1.12;
      if (cis) Q[r + '_cis'] = (Q[r + '_cis'] || 0) * 1.15;
    }
    Q.outer_sep += 4; Q.midrim_sep += 4; Q.corporate_sep += 4;
    Q.faith -= 1.5;
    Q.broken_why = why; Q.broken_swings = (Q.broken_swings || 0) + 1;
    Q['broken_' + why] = (Q['broken_' + why] || 0) + 1;
    SW.computeSupport(Q);
  };
  // Delivering for a bloc: the Caucus gave it what it wanted, and it remembers
  SW.deliver = function (Q, b, amount, why) {
    if (!b || b === 'rc' || Q.parties.indexOf(b) < 0) return;
    Q[b + '_relation'] = (Q[b + '_relation'] || 0) + amount;
    Q[b + '_favour'] = (Q[b + '_favour'] || 0) + (amount >= 10 ? 2 : 1);
    Q.delivered = (Q.delivered || 0) + 1;
    Q.deliver_note = 'The ' + SW.name(Q, b) + ' will remember that the Caucus delivered ' + why + '.';
    if (Q._reactions) SW.react(Q, Q.deliver_note);
  };
  // What the Inter-bloc Relations card can do: broker talks between two blocs, or host a summit for a whole coalition
  SW.relationsOpen = function (Q) {
    var opts = SW.rcCoalitionOptions(Q), best = null, sum = null;
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      if (o.seats < 50 || o.block || !o.coldPair) continue;
      var p = o.coldPair;
      if (p[0] !== 'rc' && p[1] !== 'rc') {
        var gap = Math.max(SW.joinMin(Q, p[0]), SW.joinMin(Q, p[1])) - SW.rel(Q, p[0], p[1]);
        if (!best || gap < best.gap) best = {a: p[0], b: p[1], gap: gap};
      }
      if (!sum || o.seats > sum.seats) sum = o;
    }
    Q.bk_ok = best ? 1 : 0; Q.bk_a = best ? best.a : ''; Q.bk_b = best ? best.b : '';
    Q.bk_a_name = best ? SW.name(Q, best.a) : ''; Q.bk_b_name = best ? SW.name(Q, best.b) : '';
    Q.bk_rel = best ? SW.relWord(SW.rel(Q, best.a, best.b)) : '';
    Q.sm_ok = sum ? 1 : 0; Q.sm_blocs = sum ? sum.blocs : [];
    Q.sm_label = sum ? sum.name + ' (' + sum.blocs.filter(function (b) { return b !== 'rc'; }).map(function (b) { return SW.name(Q, b); }).join(', ') + ')' : '';
    for (var k = 0; k < SW.REL_BLOCS.length; k++) {
      var b = SW.REL_BLOCS[k];
      Q['jm_' + b] = SW.joinWord(Q, b);
      Q['st_' + b] = SW.stanceWord(SW.firm(Q, b));
    }
  };
  SW.broker = function (Q) { if (Q.bk_a && Q.bk_b) SW.relAdd(Q, Q.bk_a, Q.bk_b, 15); };
  SW.summit = function (Q) { var b = Q.sm_blocs || []; SW.relBond(Q, b, 8); };
  SW.relBond = function (Q, blocs, v) {
    for (var i = 0; i < blocs.length; i++) for (var j = i + 1; j < blocs.length; j++) SW.relAdd(Q, blocs[i], blocs[j], v);
  };
  SW.leaderPull = function (Q, b) {
    var p = SW.leader(Q, b).pull;
    return typeof p === 'function' ? p(Q) : (p || 0);
  };
  SW.leaderSum = function (Q, key, groups) {
    var s = 0;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i] === 'rfc' && Q.parties.indexOf('rfc') < 0) continue;
      s += SW.leader(Q, groups[i])[key] || 0;
    }
    return s;
  };
  SW.firmLabel = function (Q, group) {
    var L = SW.leader(Q, group);
    return L.tag || (L.firm >= 0.75 ? 'hardliner' : (L.firm <= 0.35 ? 'pragmatist' : 'mainstream'));
  };

  // Scale relation changes made since the last visit by the leader's firmness:
  // pragmatists are easier to win over and quicker to forgive; hardliners hold grudges.
  SW.scaleChanges = function (Q) {
    for (var i = 0; i < SW.BLOCS.length; i++) {
      var b = SW.BLOCS[i];
      if (b === 'rc') continue;
      var k = b + '_relation', pk = k + '_prev';
      if (typeof Q[pk] !== 'number' || isNaN(Q[pk])) { Q[pk] = Q[k]; continue; }
      var d = Q[k] - Q[pk];
      if (d !== 0) {
        var fm = SW.firm(Q, b);
        Q[k] = Q[pk] + d * (d > 0 ? 1.3 - 0.6 * fm : 0.7 + 0.6 * fm);
      }
      Q[k] = SW.clamp(Q[k], 0, 100);
      Q[pk] = Q[k];
    }
  };

  // Which leadership contest the galaxy is pushing hardest for, if any.
  SW.contestFor = function (Q, groups) {
    var best = null;
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var incId = Q[g + '_leader_id'];
      var inc = SW.LEADERS[incId];
      if (!inc) continue;
      var incAvail = !inc.available || inc.available(Q);
      var hold = incAvail ? inc.rise(Q) + 0.15 - (Q[g + '_scandal'] || 0) : -1;
      var push = SW.hhcPush(Q);
      if (incAvail && inc.firm >= 0.7) hold += push;
      // a looming defection under a hardliner brings a challenge against them
      if (incAvail && inc.firm >= 0.7 && SW.threatOnGroup(Q, g)) hold -= 0.3;
      var pool = SW.leaderPool(Q, g);
      for (var j = 0; j < pool.length; j++) {
        if (pool[j] === incId) continue;
        var press = SW.LEADERS[pool[j]].rise(Q) + (SW.LEADERS[pool[j]].firm >= 0.7 ? push : 0) - hold;
        if (press > 0.15 && (!best || press > best.press)) best = {group: g, challenger: pool[j], press: press};
      }
    }
    return best;
  };
  SW.leaderPressure = function (Q) {
    var blocs = SW.CONTEST_BLOCS.filter(function (b) { return Q.parties.indexOf(b) >= 0 && (b !== 'rfc' || !Q.rfc_kind || Q.rfc_kind === 'rimward'); });
    Q.rim_sep_high = (Q.outer_sep > 45 || Q.midrim_sep > 45) ? 1 : 0;
    var bc = SW.contestFor(Q, blocs);
    // our wings' leaders are chosen at the Caucus congress, not in contests of their own
    var fc = null;
    Q.bloc_contest_ready = (bc && Q.leadership_timer <= 0 && Q.time >= 3 && !Q.finale && Q.months_per_turn > 0) ? 1 : 0;
    Q.faction_contest_ready = (fc && Q.faction_leader_timer <= 0 && Q.time >= 4 && !Q.finale && Q.months_per_turn > 0) ? 1 : 0;
    return {bloc: bc, faction: fc};
  };

  // Set up the strings and odds for a contest scene. kind: 'bloc' or 'faction'.
  SW.prepareContest = function (Q, kind) {
    var p = SW.leaderPressure(Q)[kind];
    if (!p) { Q.contest_group = ''; return; }
    var g = p.group, inc = SW.LEADERS[Q[g + '_leader_id']], ch = SW.LEADERS[p.challenger];
    Q.contest_kind = kind;
    Q.contest_group = g;
    Q.contest_group_name = kind === 'bloc' ? SW.name(Q, g) : SW.FACTION_NAMES[g];
    Q.contest_inc_id = Q[g + '_leader_id'];
    Q.contest_ch_id = p.challenger;
    Q.contest_inc = inc.name; Q.contest_inc_tag = SW.firmLabel(Q, g); Q.contest_inc_blurb = inc.blurb;
    Q.contest_ch = ch.name; Q.contest_ch_tag = ch.tag; Q.contest_ch_blurb = ch.blurb;
    Q.contest_inc_out = (inc.available && !inc.available(Q)) ? 1 : 0;
    Q.contest_chance = SW.clamp(0.35 + p.press, 0.2, 0.85);
    Q.contest_cost = (kind === 'bloc' && (Q[g + '_r'] || 0) >= 18) ? 2 : 1;
    // the softer of the two candidates is the one an offer helps
    Q.contest_soft_id = ch.firm < inc.firm ? p.challenger : Q.contest_inc_id;
    Q.contest_soft = SW.LEADERS[Q.contest_soft_id].name;
    var OFFERS = {
      rim: 'Promise the Rimward Coalition our votes for Rim relief',
      guild: 'Promise the guilds we will go easy on regulation',
      mod: 'Promise to back the establishment\'s budget',
      sec: 'Promise support for defence spending',
      ind: 'Offer the Independents a voice in our peace efforts',
      rfc: 'Offer the Rim Freedom Caucus a joint Rim platform'
    };
    Q.contest_offer = OFFERS[g] || '';
    Q.contest_can_pay = Q.capital >= Q.contest_cost ? 1 : 0;
    Q.contest_odds = Q.contest_inc_out ? 'The succession is all but settled.' :
      (Q.contest_chance >= 0.62 ? 'The challenger is favoured.' : (Q.contest_chance <= 0.42 ? 'The incumbent should hold on.' : 'It is too close to call.'));
    Q.contest_inc_demand = inc.demand || '';
    Q.contest_ch_demand = ch.demand || '';
    Q.contest_adv = 0;
    if (kind === 'faction') for (var a in SW.ADVISOR_FACTION) if (Q['adv_' + a] && SW.ADVISOR_FACTION[a] === g) { Q.contest_adv = 1; Q.contest_adv_name = SW.ADVISOR_NAMES[a]; break; }
  };

  // backing: '' (stay out), 'inc', 'ch' or 'offer'. Returns 1 if the challenger won.
  SW.resolveContest = function (Q, backing) {
    var g = Q.contest_group;
    if (!g) return 0;
    var chance = Q.contest_chance;
    if (backing === 'ch') chance += 0.25;
    if (backing === 'inc') chance -= 0.25;
    if (backing === 'offer') chance += (Q.contest_soft_id === Q.contest_ch_id ? 0.2 : -0.2);
    if (Q.contest_rigged && Q.contest_kind === 'bloc') {
      if (SW.LEADERS[Q.contest_ch_id].firm >= 0.7) chance += 0.3;
      else if (SW.LEADERS[Q.contest_inc_id].firm >= 0.7) chance -= 0.3;
      Q.contest_rigged = 0;
    }
    if (Q.contest_inc_out) chance = 1;
    var won = SW.rnd() < SW.clamp(chance, 0.05, 0.95) ? 1 : 0;
    var winId = won ? Q.contest_ch_id : Q.contest_inc_id;
    if (won) SW.setLeader(Q, g, Q.contest_ch_id);
    Q.contest_winner = SW.LEADERS[winId].name;
    Q.contest_winner_tag = SW.LEADERS[winId].tag;
    Q.contest_changed = won;
    var ours = backing === 'ch' || backing === 'inc';
    var backedWon = (backing === 'ch' && won) || (backing === 'inc' && !won);
    Q.contest_backed_won = ours && backedWon ? 1 : 0;
    Q.contest_backed_lost = ours && !backedWon ? 1 : 0;
    if (Q.contest_backed_won) Q[g + '_favour'] = (Q[g + '_favour'] || 0) + 2;
    // backing the rival who unseats a hardliner heads off the defection they were threatening
    var tid = SW.threatOnGroup(Q, g);
    if (tid && won && (backing === 'ch' || (backing === 'offer' && Q.contest_soft_id === Q.contest_ch_id)) && SW.THREATS[tid].hard.indexOf(Q.contest_inc_id) >= 0) Q[tid + '_threat_rival'] = 1;
    if (Q.contest_backed_lost) Q[g + '_grudge'] = (Q[g + '_grudge'] || 0) + 2;
    if (Q.contest_kind === 'bloc') {
      if (Q.contest_backed_won) Q[g + '_relation'] += 6;
      if (Q.contest_backed_lost) Q[g + '_relation'] -= 8;
    }
    Q.contest_effect = SW.leaderEffect(Q, g, winId);
    Q.leadership_contests = (Q.leadership_contests || 0) + 1;
    return won;
  };

  // One or two sentences on what a leader means for play.
  SW.leaderEffect = function (Q, g, id) {
    var L = SW.LEADERS[id], t = [];
    var isFaction = SW.FACTIONS.indexOf(g) >= 0;
    if (isFaction) {
      if (L.firm >= 0.7) t.push('Expect the ' + SW.FACTION_NAMES[g] + ' to lose patience quickly, to forgive slowly, and to break away sooner.');
      else if (L.firm <= 0.35) t.push('Expect the ' + SW.FACTION_NAMES[g] + ' to be patient, and to accept compromises they would once have refused.');
      else t.push('The ' + SW.FACTION_NAMES[g] + ' should be no more or less patient than before.');
      t.push('They want ' + L.demand + '.');
    } else {
      var nm = SW.name(Q, g);
      if (L.firm >= 0.7) t.push('The ' + nm + ' will vote as one block, hold grudges, and be hard to court.');
      else if (L.firm <= 0.35) t.push('The ' + nm + ' will be open to bargains, quick to forgive, and swayed by good relations.');
      else t.push('The ' + nm + ' will be no harder or easier to deal with than before.');
      var ref = (L.refuses || []).filter(function (b) { return Q.parties.indexOf(b) >= 0; });
      if (ref.length) t.push(L.name + ' will not govern alongside the ' + ref.map(function (b) { return SW.name(Q, b); }).join(' or the ') + '.');
      if (L.rimSep > 0.2) t.push('Their rhetoric will feed separatism on the Rim.');
      if (L.rimSep < 0) t.push('They will take some of the heat out of Rim separatism.');
      if (L.guildGriev > 0.2) t.push('They will push the guilds toward the Confederacy.');
    }
    return t.join(' ');
  };

  // The policy price of an offer in a bloc's leadership contest.
  SW.contestOffer = function (Q) {
    var g = Q.contest_group;
    if (g === 'rim') { Q.treasury -= 1; Q.rad_rimward -= 2; Q.rad_inst += 3; }
    else if (g === 'guild') { Q.rad_inst += 3; Q.rad_rimward += 4; Q.corruption += 0.5; }
    else if (g === 'mod') { Q.rad_rimward += 3; Q.rad_pacifist += 1; }
    else if (g === 'sec') { Q.rad_pacifist += 4; Q.rad_hawk -= 2; }
    else if (g === 'ind') { Q.rad_hawk += 3; }
    else if (g === 'rfc') { Q.rad_inst += 3; }
  };

  // ------------------------------------------------------------------ party wings and congresses
  // Every bloc is a coalition of wings with their own ideology. Delegates drift between the wings with the times;
  // a congress decides which wing leads the bloc, and the ruling wing's candidate becomes the bloc's leader.
  // Palpatine stays at the head of his own bloc while he is free: its congress picks the wing that sets its line.
  SW.WINGS = {
    // the Core Moderates
    ruusan: {bloc: 'mod', name: 'Ruusan Republicans', leaders: ['valorum', 'fang_zar'], color: '#6fa8d6', ink: '#2f6fae', lit: '#8cbbe3', base: 44,
      home: {colonies: 1, midrim: 0.3}, creed: 'clean government and slow reform within the old rules',
      grow: function (Q) { return 0.35 + 0.04 * SW.TRACKS.hhc.level(Q) + 0.1 * on(Q.rim_enfranchised) + 0.06 * on(Q.rim_assembly); }},
    establishment: {bloc: 'mod', name: 'Core Establishment', leaders: ['quill'], color: '#d8cb8c', ink: '#7a6a2e', lit: '#d8cb8c', base: 34,
      home: {core: 1}, creed: 'order and trade, and change only if necessary',
      grow: function (Q) { return 0.3 + 0.1 * on(Q.fear > 45) + 0.1 * on(SW.reformCount(Q) >= 3); }},
    old_families: {bloc: 'mod', name: 'Old Families', leaders: ['doran'], color: '#8c7b4e', ink: '#6b5a2e', lit: '#b8a46e', base: 12,
      home: {core: 1.5}, creed: 'humancentric and traditionalist, and receptive to Palpatine'},
    // the Commerce Guilds
    corporatists: {bloc: 'guild', name: 'Corporatists', leaders: ['dod'], color: '#d08f2a', ink: '#9a6312', lit: '#e0a548', base: 46,
      home: {corporate: 1, midrim: 0.6}, creed: 'the Trade Federation\'s way: monopolies, low taxes, and friends in the Senate',
      grow: function (Q) {
        return 0.45 - 0.08 * on(Q.naboo_crisis || Q.naboo_free) - 0.04 * Math.min(4, Q.gunray_stage || 0) - 0.05 * on(Q.tf_probe) -
          0.35 * on(Q.gunray_convicted) - 0.15 * on(Q.suspect_dod) - 0.2 * on(Q.tf_broken_up) + 0.05 * on(Q.guild_relation < 30);
      }},
    confederates: {bloc: 'guild', name: 'Confederates', leaders: ['san_hill'], color: '#7d4e9e', ink: '#6a3f8a', lit: '#b48ad6', base: 30,
      home: {corporate: 1.2, outer: 0.4}, creed: 'the Techno Union and the Banking Clan, who see the Republic as a broken, humancentric state that means to seize their wealth',
      grow: function (Q) {
        return SW.LEADERS.san_hill.rise(Q) + 0.12 * on(tariffsOn(Q)) + 0.05 * Math.min(3, Q.guild_regulations || 0) + 0.03 * Math.min(5, Q.hhc_heat || 0) - 0.1 * on(Q.hhc_discredited);
      }},
    free_traders: {bloc: 'guild', name: 'Free Traders', leaders: ['clovis'], color: '#e6c46a', ink: '#8f7410', lit: '#e6c46a', base: 10,
      home: {colonies: 0.8, midrim: 0.8}, creed: 'commerce inside a lawful Republic, with honest courts and a navy to guard the lanes',
      grow: function (Q) {
        return 0.05 + 0.1 * Math.min(3, Q.dereg_count || 0) + 0.15 * on(Q.anti_cartel) + 0.15 * on(Q.tf_broken_up) + 0.15 * on(Q.pirates_crushed) + 0.15 * on(Q.syndicates_broken);
      }},
    mic: {bloc: 'guild', name: 'Military-Industrial Complex', leaders: ['brask'], color: '#5e6670', ink: '#4a525b', lit: '#9aa3ad', base: 14,
      home: {core: 0.8, colonies: 1}, creed: 'the yards and foundries that profit from the war: for the clone army and a strong Chancellor',
      hidden: function (Q) { return !(Q.war || (Q.corporate_seceded || 0) >= 0.3); },
      grow: function (Q) { return SW.LEADERS.brask.rise(Q) + 0.5 * on(SW.wingGone(Q, 'confederates') && SW.wingGone(Q, 'corporatists')); }},
    // the Rimward Coalition
    // the Rim starts in the Hutt-space Machine's hands; the Populists win it as the Rim's grievances are answered
    populists: {bloc: 'rim', name: 'Rim Populists', leaders: ['teem'], color: '#e8843f', ink: '#c4520f', lit: '#f0985a', base: 30,
      home: {midrim: 1, outer: 0.7}, creed: 'a place for the Rim inside the Republic: an end to humancentrism and slavery, and seats for the Rim',
      grow: function (Q) {
        return 0.1 + 0.1 * on(Q.rim_relief_act) + 0.1 * on(Q.rim_enfranchised) + 0.08 * on(Q.slavery_report) + 0.08 * on(Q.slavery_abolished) +
          0.06 * on(Q.sentience_rights) + 0.08 * on(Q.corruption < 50) + 0.05 * on(Q.rim_hardship < 45);
      }},
    hutt_machine: {bloc: 'rim', name: 'Hutt-space Machine', leaders: ['orn_free_taa'], color: '#a06a38', ink: '#86552a', lit: '#c99260', base: 44,
      home: {outer: 1.2}, creed: 'deals, patronage and the cartels',
      grow: function (Q) {
        return 0.35 + 0.15 * on(Q.corruption > 55) + 0.1 * on(Q.hutt_deal) - 0.15 * on(Q.slavery_abolished) - 0.1 * on(Q.anti_corruption) - 0.5 * on(Q.syndicates_broken);
      }},
    radicals: {bloc: 'rim', name: 'Rim Radicals', leaders: ['ardana'], color: '#b63d1c', ink: '#9c3214', lit: '#e0603c', base: 16,
      home: {outer: 1.2}, creed: 'reform now: they no longer believe the Republic can change, and many listen to Dooku'},
    // the Security Bloc
    law_order: {bloc: 'sec', name: 'Law and Order Moderates', leaders: ['hask'], color: '#8aa0b4', ink: '#4f6578', lit: '#a8bccd', base: 48,
      home: {colonies: 1, core: 0.4}, creed: 'broadly moderate: order, a Republic that pays for its defence, and lanes cleared of pirates'},
    human_first: {bloc: 'sec', name: 'Human-Firsters', leaders: ['tarkin'], color: '#56606b', ink: '#3c4650', lit: '#b0a99b', base: 22,
      home: {outer: 0.8, core: 0.6}, creed: 'order through force, and the High Human Culture',
      grow: function (Q) { return SW.LEADERS.tarkin.rise(Q) + 0.03 * Math.min(5, Q.hhc_heat || 0) - 0.2 * on(Q.hhc_discredited); }},
    const_hawks: {bloc: 'sec', name: 'Constitutional Hawks', leaders: ['danu'], color: '#5b8fc0', ink: '#2f5f8f', lit: '#8ab6de', base: 20,
      home: {core: 0.9, colonies: 0.6}, creed: 'a strong defence under the Senate\'s control'},
    // the Independents
    brokers: {bloc: 'ind', name: 'Brokers', leaders: ['vell'], color: '#6ea07a', ink: '#4c8459', lit: '#8cbc97', base: 46,
      home: {midrim: 1}, creed: 'a negotiated end to the war, loyalty to the Republic once it fights, and a reformed Republic'},
    neutralists: {bloc: 'ind', name: 'Neutralists', leaders: ['satine'], color: '#acd2a2', ink: '#4f8a43', lit: '#acd2a2', base: 22,
      home: {outer: 0.9, midrim: 0.4}, creed: 'Mandalore\'s peace: neutrality, and an end to war'},
    isolationists: {bloc: 'ind', name: 'Isolationists', leaders: ['shale'], color: '#3e6c4b', ink: '#3e6c4b', lit: '#7fae8b', base: 22,
      home: {midrim: 0.8, outer: 0.5}, creed: 'leave the member worlds alone: seats and rights for the Rim, but no new powers for Coruscant',
      grow: function (Q) {
        return SW.LEADERS.shale.rise(Q) + 0.05 * Math.min(6, Q.emergency_powers || 0) + 0.1 * on(Q.fleet_levy) + 0.1 * on(Q.budget_rev === 'levy' || tariffsOn(Q)) +
          0.03 * Math.min(6, Q.chan_powers || 0) + 0.1 * on(Q.kamino_army && !Q.army_oversight);
      }},
    // the Rim Freedom Caucus, when it exists
    rfc_pragmatists: {bloc: 'rfc', name: 'Pragmatists', leaders: ['farr'], color: '#e8b84a', ink: '#a07410', lit: '#e8b84a', base: 55,
      home: {outer: 0.8, midrim: 0.6}, creed: 'a Rim party that still talks to the Caucus'},
    rfc_radicals: {bloc: 'rfc', name: 'Radicals', leaders: ['tandeth'], color: '#c27e26', ink: '#8f5a14', lit: '#d99a4c', base: 35,
      home: {outer: 1, midrim: 0.4}, creed: 'the Rim first, and no more bargains'},
    // Palpatine's bloc
    centralists: {bloc: 'pal', name: 'Centralists', leaders: ['amedda', 'pestage'], color: '#b3141b', ink: '#b3141b', lit: '#e0474f', base: 55,
      home: {core: 0.8, midrim: 0.5}, creed: 'a strong executive, the only way to restore order, clean up the Senate and renew the Republic',
      // the respectable face of his bloc wears thin as the years pass: its extremes grow around it
      grow: function (Q) { return 0.45 - 0.0028 * Math.min(140, Q.date || 0); }},
    new_order: {bloc: 'pal', name: 'New Order', leaders: ['greejatus'], color: '#7a1218', ink: '#5e0a0f', lit: '#c0505a', base: 15,
      home: {core: 1, colonies: 0.6}, creed: 'a totalitarian, human Republic: the Rim\'s rights undone, and human militias in the streets',
      // it grows over the years, and fastest while Palpatine is kept from the Chancellery
      grow: function (Q) { return SW.LEADERS.greejatus.rise(Q) + 0.005 * Math.min(140, Q.date || 0) + (Q.pal_chancellor || Q.puppet_chancellor ? 0 : 0.2 * on((Q.date || 0) >= 24)); }},
    cult: {bloc: 'pal', name: 'Personality Cult', leaders: ['dangor'], color: '#e0646e', ink: '#b8404a', lit: '#ee8a92', base: 15,
      home: {core: 1.2}, creed: 'devotion to Palpatine himself, and to whatever serves him',
      // it grows over the years, and surges while he holds the Chancellery (Dangor's rise)
      grow: function (Q) { return SW.LEADERS.dangor.rise(Q) + 0.002 * Math.min(140, Q.date || 0); }}
  };
  SW.BLOC_WINGS = {};
  SW.LEADER_WING = {};
  (function () {
    for (var wid in SW.WINGS) {
      var W = SW.WINGS[wid];
      (SW.BLOC_WINGS[W.bloc] = SW.BLOC_WINGS[W.bloc] || []).push(wid);
      for (var i = 0; i < W.leaders.length; i++) SW.LEADER_WING[W.leaders[i]] = wid;
    }
  })();
  SW.CONGRESS_BLOCS = ['mod', 'guild', 'rim', 'sec', 'ind', 'rfc', 'pal'];
  SW.NONAFF = {mod: 10, guild: 8, rim: 12, sec: 10, ind: 15, rfc: 10, pal: 8};
  SW.CONGRESS_START = {mod: 20, guild: 26, rim: 32, sec: 38, ind: 44, rfc: 24, pal: 30};
  SW.CONGRESS_GAP = 48;        // months between a bloc's regular congresses
  SW.CONGRESS_HOLD = 18;       // months after a congress before an outgrown ruling wing can be challenged again
  SW.WING_PULL = 0.3;          // how strongly a wing lifts its bloc in its home regions
  SW.WING_SWING = 2.5;         // how strongly the times move delegates between the wings
  SW.CONGRESS_RANK = {fallen: 4, crisis: 3, scandal: 3, revolt: 3, overtaken: 2, regular: 1};

  SW.wingGone = function (Q, id) { return !!Q['wing_gone_' + id]; };
  SW.wingActive = function (Q, id) {
    var W = SW.WINGS[id];
    if (!W || Q['wing_gone_' + id]) return false;
    return !W.hidden || !!Q['wing_seen_' + id];
  };
  // the blocs whose wings are in play: the Rim Freedom Caucus has wings only as a Rim party
  SW.hasWings = function (Q, b) {
    if (!SW.BLOC_WINGS[b] || (Q.parties || []).indexOf(b) < 0) return false;
    if (b === 'rfc') return Q.rfc_kind === 'rimward';
    return true;
  };
  SW.blocWings = function (Q, b) { return (SW.BLOC_WINGS[b] || []).filter(function (w) { return SW.wingActive(Q, w); }); };
  SW.nonAff = function (Q, b) { var n = Q[b + '_nonaff']; return n >= 0 ? n : (SW.NONAFF[b] || 10); };
  SW.wingName = function (id) { return SW.WINGS[id] ? SW.WINGS[id].name : ''; };
  SW.wingSpan = function (id, text) {
    var W = SW.WINGS[id];
    return W ? '<span class="wing" style="--wi:' + (W.ink || W.color) + ';--wl:' + (W.lit || W.color) + '">' + (text || W.name) + '</span>' : (text || '');
  };
  SW.wingGrow = function (Q, id) {
    var W = SW.WINGS[id], g;
    try {
      if (W.grow) g = W.grow(Q);
      else { var L = SW.LEADERS[W.leaders[0]]; g = L && L.rise ? L.rise(Q) : 0.3; }
    } catch (e) { g = 0.3; }
    return isFinite(g) ? SW.clamp(g, -0.45, 1.4) : 0.3;
  };
  // where each wing's share is heading: its natural size and what the times favour, plus what has lately happened to it
  SW.wingTargets = function (Q, b) {
    var ws = SW.blocWings(Q, b), room = 100 - SW.nonAff(Q, b), raw = {}, sum = 0, t = {}, i;
    for (i = 0; i < ws.length; i++) { raw[ws[i]] = SW.WINGS[ws[i]].base * Math.exp(SW.WING_SWING * SW.wingGrow(Q, ws[i])); sum += raw[ws[i]]; }
    for (i = 0; i < ws.length; i++) t[ws[i]] = room * raw[ws[i]] / (sum || 1);
    for (i = 0; i < ws.length; i++) if (Q['wingpush_' + ws[i]]) SW.moveShare(t, ws[i], Q['wingpush_' + ws[i]]);
    return t;
  };
  // move d points to (or, if negative, from) one wing, taking them from (or giving them to) the others in proportion to their size
  SW.moveShare = function (sh, w, d) {
    var others = 0, k;
    for (k in sh) if (k !== w) others += sh[k];
    d = Math.max(-(sh[w] - 0.5), Math.min(d, others - 0.5 * (Object.keys(sh).length - 1)));
    if (others <= 0 || !d) return;
    for (k in sh) if (k !== w) sh[k] = Math.max(0.5, sh[k] - d * sh[k] / others);
    sh[w] += d;
  };
  SW.normWings = function (Q, b) {
    var ws = SW.blocWings(Q, b), room = 100 - SW.nonAff(Q, b), s = 0, i;
    for (i = 0; i < ws.length; i++) { if (!(Q['wing_' + ws[i]] > 0)) Q['wing_' + ws[i]] = 0; s += Q['wing_' + ws[i]]; }
    if (s <= 0) { var t = SW.wingTargets(Q, b); for (i = 0; i < ws.length; i++) Q['wing_' + ws[i]] = t[ws[i]]; return; }
    for (i = 0; i < ws.length; i++) Q['wing_' + ws[i]] = room * Q['wing_' + ws[i]] / s;
  };
  // an event moves delegates now, and the change lingers for a while
  SW.wingShift = function (Q, id, d) {
    var W = SW.WINGS[id];
    if (!W || !SW.wingActive(Q, id)) return;
    if (!SW.blocWings(Q, W.bloc).some(function (w) { return Q['wing_' + w] > 0; })) SW.ensureWings(Q, W.bloc);
    var sh = {}, ws = SW.blocWings(Q, W.bloc), i;
    for (i = 0; i < ws.length; i++) sh[ws[i]] = Q['wing_' + ws[i]] || 0;
    SW.moveShare(sh, id, d);
    for (i = 0; i < ws.length; i++) Q['wing_' + ws[i]] = sh[ws[i]];
    Q['wingpush_' + id] = (Q['wingpush_' + id] || 0) + d;
    SW.normWings(Q, W.bloc);
  };
  // a wing's candidate: its leader if still able to lead, else the strongest of its figures who can stand
  SW.wingCandidate = function (Q, w) {
    var W = SW.WINGS[w], best = '', bestS = -99;
    if (!W) return '';
    for (var i = 0; i < W.leaders.length; i++) {
      var id = W.leaders[i], L = SW.LEADERS[id];
      if (!L || (L.available && !L.available(Q))) continue;
      var s = 0.3;
      try { s = L.rise ? L.rise(Q) : 0.3; } catch (e) { s = 0.3; }
      s += (Q[W.bloc + '_leader_id'] === id ? 0.15 : 0) - i * 0.01;
      if (s > bestS) { bestS = s; best = id; }
    }
    return best;
  };
  // the bloc's leader can no longer lead it (fallen, dead, gone); for Palpatine's bloc, he has fallen and no successor is chosen
  SW.leaderOut = function (Q, b) {
    if (b === 'pal') return !!((Q.pal_disgraced || Q.sidious_defeated || Q.sidious_gone) && !Q.pal_leader_id);
    var L = SW.LEADERS[Q[b + '_leader_id']];
    return !!(L && L.available && !L.available(Q));
  };
  SW.ensureWings = function (Q, b) {
    if (!SW.BLOC_WINGS[b]) return;
    if (!(Q[b + '_nonaff'] >= 0)) Q[b + '_nonaff'] = SW.NONAFF[b];
    var ws = SW.blocWings(Q, b);
    if (!ws.some(function (w) { return Q['wing_' + w] > 0; })) {
      var t = SW.wingTargets(Q, b);
      for (var i = 0; i < ws.length; i++) Q['wing_' + ws[i]] = t[ws[i]];
      // at the start the ruling wing is the largest
      var rw = b === 'pal' ? 'centralists' : SW.LEADER_WING[Q[b + '_leader_id']];
      if (rw && ws.indexOf(rw) >= 0) {
        var mx = 0;
        for (var j = 0; j < ws.length; j++) if (ws[j] !== rw) mx = Math.max(mx, Q['wing_' + ws[j]]);
        if (Q['wing_' + rw] < mx + 4) { var d = mx + 4 - Q['wing_' + rw]; Q['wing_' + rw] += d; Q['wingpush_' + rw] = (Q['wingpush_' + rw] || 0) + d; SW.normWings(Q, b); }
      }
    }
    var cur = Q[b + '_wing'];
    if (!cur || !SW.wingActive(Q, cur) || SW.WINGS[cur].bloc !== b) {
      var lw = b === 'pal' ? (Q.pal_leader_id ? SW.LEADER_WING[Q.pal_leader_id] : 'centralists') : SW.LEADER_WING[Q[b + '_leader_id']];
      Q[b + '_wing'] = (lw && ws.indexOf(lw) >= 0) ? lw : (ws[0] || '');
    }
    if (!(Q[b + '_congress_due'] > 0)) Q[b + '_congress_due'] = (b === 'rfc' ? Q.date : 0) + SW.CONGRESS_START[b];
    if (!(Q[b + '_congress_due'] > Q.date - 12) && b === 'rfc') Q[b + '_congress_due'] = Q.date + SW.CONGRESS_START[b];
  };
  SW.seedWings = function (Q) {
    for (var i = 0; i < SW.CONGRESS_BLOCS.length; i++) if (SW.hasWings(Q, SW.CONGRESS_BLOCS[i])) SW.ensureWings(Q, SW.CONGRESS_BLOCS[i]);
    if (Q.valorum_fallen && !(Q.valorum_fell_date >= 0)) Q.valorum_fell_date = Q.date;
    // a new game starts with the Institutionalists leading the Caucus
    if (!Q.rc_lead && Q.time <= 1) { Q.rc_lead = 'inst'; Q.rc_chair = Q.inst_leader || ''; Q.rc_congress_elections = Q.elections_held || 0; }
    Q.wings_seeded = 1;
  };
  // each quarter: hidden wings appear when their moment comes, delegates drift a fifth of the way to where the times push them
  SW.wingTick = function (Q, rf) {
    for (var id in SW.WINGS) {
      var W = SW.WINGS[id];
      if (W.hidden && !Q['wing_seen_' + id] && !Q['wing_gone_' + id] && !W.hidden(Q)) { Q['wing_seen_' + id] = 1; Q['wing_' + id] = 2; }
    }
    for (var i = 0; i < SW.CONGRESS_BLOCS.length; i++) {
      var b = SW.CONGRESS_BLOCS[i];
      if (!SW.hasWings(Q, b)) continue;
      SW.ensureWings(Q, b);
      var t = SW.wingTargets(Q, b), k = Math.min(1, 0.2 * rf);
      for (var w in t) Q['wing_' + w] = (Q['wing_' + w] || 0) + (t[w] - (Q['wing_' + w] || 0)) * k;
      SW.normWings(Q, b);
    }
    for (var p in SW.WINGS) {
      var v = Q['wingpush_' + p];
      if (v) Q['wingpush_' + p] = Math.abs(v) < 0.2 ? 0 : v * Math.pow(0.8, rf);
    }
    if (SW.radTick) SW.radTick(Q, rf);
    if (SW.repealTick) SW.repealTick(Q);
    if (SW.caucusRadTick) { SW.caucusRadTick(Q, rf); SW.caucusWingTick(Q, rf); }
    if (SW.roadTick) SW.roadTick(Q, rf);
  };
  SW.wingShare = function (Q, w) { return Q['wing_' + w] || 0; };
  // a wing with a candidate that has outgrown the ruling wing
  SW.wingOvertaken = function (Q, b) {
    if (Q.date < (Q[b + '_congress_hold'] || -99)) return '';
    var rw = Q[b + '_wing'], r = SW.wingShare(Q, rw), ws = SW.blocWings(Q, b);
    for (var i = 0; i < ws.length; i++) if (ws[i] !== rw && SW.wingShare(Q, ws[i]) >= r + 8 && SW.wingCandidate(Q, ws[i])) return ws[i];
    return '';
  };

  // ------------------------------------------------------------------ when congresses meet
  SW.callCongress = function (Q, b, why) {
    if (!b || !SW.BLOC_WINGS[b]) return;
    var R = SW.CONGRESS_RANK, cur = Q[b + '_congress_why'];
    if (!cur || (R[why] || 0) > (R[cur] || 0)) Q[b + '_congress_why'] = why;
  };
  // which bloc's congress meets next, if any: one a turn at most, the most pressing first
  SW.congressCheck = function (Q) {
    Q.congress_ready = ''; Q.congress_go = 0;
    Q.valorum_leads_mod = (Q.valorum_fallen && Q.mod_leader_id === 'valorum') ? 1 : 0;
    if (Q.valorum_fallen && !(Q.valorum_fell_date >= 0)) Q.valorum_fell_date = Q.date;
    if (Q.finale || Q.game_ending || !(Q.months_per_turn > 0) || Q.time < 3) return;
    var best = '', bestR = 0, bestWhy = '', fallen = '';
    for (var i = 0; i < SW.CONGRESS_BLOCS.length; i++) {
      var b = SW.CONGRESS_BLOCS[i];
      if (!SW.hasWings(Q, b)) continue;
      SW.ensureWings(Q, b);
      // while Palpatine is free his bloc settles its line on schedule; it does not hold emergency congresses over him
      var why = SW.leaderOut(Q, b) ? 'fallen' : (Q[b + '_congress_why'] || '');
      if (!why && Q.date >= Q[b + '_congress_due']) why = 'regular';
      if (why && why !== 'fallen' && why !== 'overtaken' && SW.congressSettled(Q, b)) { if (why === 'regular') SW.quietCongress(Q, b); Q[b + '_congress_why'] = ''; why = ''; }
      if ((!why || why === 'regular') && SW.radRevolt && SW.radRevolt(Q, b)) why = 'revolt';
      if (!why && SW.wingOvertaken(Q, b)) why = 'overtaken';
      if (why && (SW.CONGRESS_RANK[why] || 0) > bestR) { best = b; bestR = SW.CONGRESS_RANK[why]; bestWhy = why; }
    }
    if (best && (!(Q.congress_timer > 0) || bestWhy === 'fallen')) { Q.congress_ready = best; Q.congress_why = bestWhy; }
    Q.congress_go = Q.congress_ready ? 1 : 0;
  };
  // the ruling wing holds more delegates than any backing could take from it, and its candidate already leads
  SW.CONGRESS_SAFE = 57;
  SW.congressSettled = function (Q, b) {
    var rw = Q[b + '_wing'], c = SW.wingCandidate(Q, rw);
    if (!rw || !c || SW.wingShare(Q, rw) <= SW.CONGRESS_SAFE) return false;
    if (b === 'pal' && !Q.pal_leader_id) return !Q.pal_lieutenant_id || Q.pal_lieutenant_id === c;
    return c === Q[b + '_leader_id'];
  };
  SW.quietCongress = function (Q, b) {
    var rw = Q[b + '_wing'];
    if (b === 'pal' && !Q.pal_leader_id && !Q.pal_lieutenant_id) { var c = SW.wingCandidate(Q, rw); Q.pal_lieutenant_id = c; Q.pal_lieutenant = SW.LEADERS[c].name; }
    Q[b + '_congress_due'] = Q.date + SW.CONGRESS_GAP;
    Q[b + '_congress_last'] = Q.date;
    Q[b + '_congress_quiet'] = 1;
    Q.congresses_quiet = (Q.congresses_quiet || 0) + 1;
  };

  // a hardliner is being groomed: the bloc where a hardline wing comes closest to power
  SW.rigTarget = function (Q) {
    var best = '', bestS = -1;
    for (var i = 0; i < SW.CONGRESS_BLOCS.length; i++) {
      var b = SW.CONGRESS_BLOCS[i];
      if (b === 'pal' || !SW.hasWings(Q, b)) continue;
      var ws = SW.blocWings(Q, b);
      for (var j = 0; j < ws.length; j++) {
        var c = SW.wingCandidate(Q, ws[j]);
        if (ws[j] === Q[b + '_wing'] || !c || SW.LEADERS[c].firm < 0.7) continue;
        var sc = SW.wingShare(Q, ws[j]) * (1 + 0.5 * (SW.radTier ? SW.radTier(Q, ws[j]) : 0));
        if (sc > bestS) { bestS = sc; best = b; }
      }
    }
    return best;
  };

  // ------------------------------------------------------------------ ideology, distances and the words for them
  // a wing's ideology: its bloc's baseline, its figure's views, and its own extra views
  SW.wingIdeo = function (Q, w) {
    var W = SW.WINGS[w], v = {}, k;
    var base = SW.BLOC_IDEOLOGY[W.bloc] || {};
    for (k in base) v[k] = (v[k] || 0) + base[k];
    var c = SW.wingCandidate(Q, w) || W.leaders[0], L = SW.LEADERS[c];
    var lv = (L && L.views) || {};
    for (k in lv) v[k] = (v[k] || 0) + lv[k];
    var xv = W.views || (SW.WING_VIEWS && SW.WING_VIEWS[w]) || {};
    for (k in xv) v[k] = (v[k] || 0) + xv[k];
    return v;
  };
  SW.ideoDistance = function (a, b) {
    var d = 0, k, seen = {};
    for (k in a) { seen[k] = 1; d += Math.pow((a[k] || 0) - (b[k] || 0), 2); }
    for (k in b) if (!seen[k]) d += Math.pow(b[k] || 0, 2);
    return Math.sqrt(d);
  };
  SW.VIEW_TOPIC = {regulate: 'the guilds', rim: 'the Rim', powers: 'the Chancellor\'s powers', army: 'the army', peace: 'the war',
    oversight: 'oversight of the government', vonc: 'bringing governments down'};
  SW.VIEW_FEAR = {regulate: ['tie the guilds in red tape', 'let the guilds do as they please'], rim: ['give in to the Rim', 'turn the bloc\'s back on the Rim'],
    powers: ['hand the Chancellor more power', 'weaken the Chancellery'], army: ['spend everything on the army', 'starve the army'],
    peace: ['make peace at any price', 'never make peace'], oversight: ['tie the government\'s hands', 'let the government do as it likes'],
    vonc: ['bring down every government', 'prop up any government']};
  SW.VIEW_AGREE = {regulate: ['the guilds curbed', 'the guilds left free'], rim: ['an answer for the Rim', 'a firm line against the Rim'],
    powers: ['a stronger Chancellor', 'the Chancellor\'s powers curbed'], army: ['a stronger army', 'a smaller army'],
    peace: ['an end to the war', 'the war fought on'], oversight: ['oversight of the government', 'a free hand for the government'],
    vonc: ['governments brought down', 'stable government']};
  // where two wings agree most, and where they part
  SW.ideoCompare = function (a, b) {
    var agree = '', agreeK = '', aS = 0, part = '', pS = 0, k, keys = {};
    for (k in a) keys[k] = 1;
    for (k in b) keys[k] = 1;
    for (k in keys) {
      if (!SW.VIEW_TOPIC[k]) continue;
      var x = a[k] || 0, y = b[k] || 0;
      if (x * y > 0 && Math.min(Math.abs(x), Math.abs(y)) > aS) { aS = Math.min(Math.abs(x), Math.abs(y)); agree = SW.VIEW_AGREE[k][x > 0 ? 0 : 1]; agreeK = k; }
    }
    for (k in keys) {
      if (!SW.VIEW_TOPIC[k] || k === agreeK) continue;
      var x2 = a[k] || 0, y2 = b[k] || 0;
      if (x2 * y2 <= 0 && Math.abs(x2 - y2) > Math.max(pS, 0.08)) { pS = Math.abs(x2 - y2); part = k; }
    }
    return {agree: agree, agreeK: agreeK, part: part, partSign: part ? ((a[part] || 0) > (b[part] || 0) ? 1 : -1) : 0};
  };
  var sp = function (Q, b, t) { return SW.span ? SW.span(Q, b, t) : t; };
  SW.blocPlural = function (Q, b) { var n = SW.name(Q, b) || ''; return /s$/.test(n) && !/(Caucus|Systems|Congress)$/.test(n); };
  SW.shortName = function (id) { var n = (SW.LEADERS[id] || {}).name || ''; var p = n.split(' '); return p.length > 1 ? p.slice(1).join(' ') : n; };

  // ------------------------------------------------------------------ a congress
  SW.ADVISOR_TIES = {antilles: ['mod', 'ind'], organa: ['mod', 'ind'], bel_iblis: ['sec', 'mod'], farr: ['rim', 'rfc'],
    mothma: ['mod', 'ind'], amidala: ['mod', 'rim'], valorum: ['mod'], chuchi: ['rim', 'rfc', 'ind']};
  SW.CONGRESS_OFFERS = {
    rim: 'Promise the Rimward Coalition our votes for Rim relief',
    guild: 'Promise the guilds we will go easy on regulation',
    mod: 'Promise to back the establishment\'s budget',
    sec: 'Promise support for defence spending',
    ind: 'Offer the Independents a voice in our peace efforts',
    rfc: 'Offer the Rim Freedom Caucus a joint Rim platform'
  };
  SW.congressCost = function (Q, b) {
    var c = (Q[b + '_r'] || 0) >= 18 ? 2 : 1;
    if ((Q[b + '_relation'] || 0) >= 55) c -= 1;
    return Math.max(0, c);
  };
  SW.congressChart = function (Q, b, sh) {
    var ws = SW.blocWings(Q, b), data = [];
    for (var i = 0; i < ws.length; i++) {
      var n = Math.round((sh ? sh[ws[i]] : SW.wingShare(Q, ws[i])) * 2);
      if (n > 0) data.push({id: ws[i], legend: SW.WINGS[ws[i]].name, name: SW.WINGS[ws[i]].name, seats: n, color: SW.WINGS[ws[i]].color});
    }
    var na = Math.round(SW.nonAff(Q, b) * 2);
    if (na > 0) data.push({id: 'nonaff', legend: 'Non-affiliated', name: 'Non-affiliated', seats: na, color: '#bdb6a8'});
    return data;
  };
  SW.congressTable = function (Q, b, sh) {
    var ws = SW.blocWings(Q, b), h = '<table class="congress"><tr><th>Wing</th><th>Candidate</th><th>Delegates</th></tr>';
    for (var i = 0; i < ws.length; i++) {
      var c = SW.wingCandidate(Q, ws[i]);
      h += '<tr><td>' + SW.wingSpan(ws[i]) + '</td><td>' + (c ? SW.LEADERS[c].name : '<i>none</i>') + '</td><td>' + Math.round(sh ? sh[ws[i]] : SW.wingShare(Q, ws[i])) + '%</td></tr>';
    }
    return h + '<tr><td class="nonaff">Non-affiliated</td><td></td><td>' + Math.round(SW.nonAff(Q, b)) + '%</td></tr></table>';
  };
  SW.CG_SLOTS = 4;
  SW.prepareCongress = function (Q) {
    var b = Q.congress_ready;
    Q.cg_bloc = b || '';
    if (!b) return;
    SW.ensureWings(Q, b);
    Q.congress_timer = 1;
    Q.cg_why = Q.congress_why || 'regular';
    Q.cg_bloc_name = SW.name(Q, b);
    Q.cg_pal = b === 'pal' ? 1 : 0;
    Q.cg_pal_free = (b === 'pal' && !Q.pal_leader_id) ? 1 : 0;
    var rw = Q[b + '_wing'];
    Q.cg_ruling = rw; Q.cg_ruling_name = SW.wingName(rw);
    Q.cg_old_leader = b === 'pal' ? 'Palpatine' : (Q[b + '_leader'] || '');
    var ov = SW.wingOvertaken(Q, b);
    Q.cg_revolt_wing = '';
    if (Q.cg_why === 'revolt') {
      Q.cg_revolt_wing = SW.radRevolt(Q, b) || '';
      if (!Q.cg_revolt_wing) Q.cg_why = 'crisis';
      else { Q[b + '_rad_crisis'] = Q.date + SW.RAD_CRISIS_GAP; Q.revolts = (Q.revolts || 0) + 1; }
    }
    var lead = Q.cg_old_leader, bn = sp(Q, b, 'the ' + Q.cg_bloc_name), Bn = sp(Q, b, 'The ' + Q.cg_bloc_name), pl = SW.blocPlural(Q, b);
    var why = {
      fallen: b === 'pal' ? 'With Palpatine gone, ' + bn + ' convenes to choose who will lead it now, with its wings vying for control.' :
        lead + ' can no longer lead ' + bn + '. The bloc\'s congress convenes to choose a successor, with the wings vying for control.',
      crisis: 'After a bad season for ' + bn + ', its leaders call an emergency congress. The wings are vying for control.',
      scandal: 'A bribery scandal has shaken ' + bn + ', and its congress convenes amid recriminations. The wings are vying for control.',
      revolt: Q.cg_revolt_wing ? 'The ' + SW.wingSpan(Q.cg_revolt_wing) + ' have forced an emergency congress. Furious that ' + bn + (pl ? ' have ' : ' has ') + (SW.radClauses(Q, Q.cg_revolt_wing) || 'lost its way') +
        ', they demand a change of course, or they will go.' : ' ',
      overtaken: 'The ' + SW.wingSpan(rw) + ' no longer speak for most of ' + bn + '. ' + (pl ? 'Their' : 'Its') + ' congress convenes early, with the ' + SW.wingSpan(ov || rw) + ' demanding a change of course.',
      regular: Q.cg_pal_free ? Bn + (pl ? ' gather for their congress. Palpatine will lead them' : ' gathers for its congress. Palpatine will lead it') + ' whatever happens, but his wings are vying to set the bloc\'s line.' :
        Bn + (pl ? ' gather for their congress, as they do' : ' gathers for its congress, as it does') + ' every four years. The wings are vying for control.'
    };
    Q.cg_intro = why[Q.cg_why] || why.regular || ' ';
    var ws = SW.blocWings(Q, b), cands = [];
    for (var i = 0; i < SW.CG_SLOTS; i++) {
      var w = ws[i], c = w ? SW.wingCandidate(Q, w) : '';
      Q['cg_c' + (i + 1)] = c ? 1 : 0;
      Q['cg_c' + (i + 1) + '_wing'] = c ? w : '';
      Q['cg_c' + (i + 1) + '_name'] = c ? SW.WINGS[w].name : '';
      Q['cg_c' + (i + 1) + '_cand'] = c ? SW.LEADERS[c].name : '';
      if (c) cands.push(w);
    }
    Q.cg_cost = SW.congressCost(Q, b);
    Q.cg_can_pay = (Q.cg_cost <= 0 || Q.capital >= Q.cg_cost) ? 1 : 0;
    Q.cg_cost_txt = (Q.cg_cost > 0 ? 'Costs ' + Q.cg_cost + ' political capital.' : 'Our warm relations make it cost nothing.') + ' They will remember who helped, and who didn\'t.';
    // an advisor with friends in the bloc works them for the wing nearest the Caucus
    Q.cg_adv = 0; Q.cg_adv_name = ''; Q.cg_adv_wing = ''; Q.cg_adv_wing_name = '';
    var near = '', nd = 99, rcv = {oversight: 0.15, rim: 0.15, regulate: 0.1, powers: -0.15, peace: 0.05};
    for (var j = 0; j < cands.length; j++) { var dd = SW.ideoDistance(SW.wingIdeo(Q, cands[j]), rcv); if (dd < nd) { nd = dd; near = cands[j]; } }
    for (var a in SW.ADVISOR_TIES) if (Q['adv_' + a] && SW.ADVISOR_TIES[a].indexOf(b) >= 0 && near) { Q.cg_adv = 1; Q.cg_adv_name = SW.ADVISOR_NAMES[a]; Q.cg_adv_wing = near; Q.cg_adv_wing_name = SW.WINGS[near].name; break; }
    Q.cg_adv_ok = (Q.cg_adv && !(Q.advisor_action_timer > 0)) ? 1 : 0;
    // a promise helps the candidate most open to a bargain
    var soft = '', sf = 2;
    for (var s = 0; s < cands.length; s++) { var f = SW.LEADERS[SW.wingCandidate(Q, cands[s])].firm; if (f < sf) { sf = f; soft = cands[s]; } }
    Q.cg_offer = SW.CONGRESS_OFFERS[b] || '';
    Q.cg_soft_wing = Q.cg_offer ? soft : '';
    Q.cg_soft = soft ? SW.LEADERS[SW.wingCandidate(Q, soft)].name : '';
    Q.cg_table = SW.congressTable(Q, b);
    Q.cg_chart = SW.congressChart(Q, b);
    Q.cg_backed = ''; Q.cg_deadlock = 0; Q.cg_result = ' '; Q.cg_analysis = ' '; Q.cg_round2 = ' '; Q.cg_effect = ' '; Q.cg_box = ' ';
  };
  // how: '' (stay out), 'back' (slot n), 'adv' or 'promise'
  SW.resolveCongress = function (Q, how, n) {
    var b = Q.cg_bloc;
    if (!b) return;
    var ws = SW.blocWings(Q, b), sh = {}, i, w;
    for (i = 0; i < ws.length; i++) sh[ws[i]] = SW.wingShare(Q, ws[i]);
    var backed = '', bump = 0;
    if (how === 'back') { backed = Q['cg_c' + n + '_wing']; bump = 6; Q.capital -= Q.cg_cost; }
    else if (how === 'adv') { backed = Q.cg_adv_wing; bump = 4; Q.advisor_action_timer = Math.max(Q.advisor_action_timer || 0, 3); }
    else if (how === 'promise') { backed = Q.cg_soft_wing; bump = 5; Q.contest_group = b; SW.contestOffer(Q); }
    Q.cg_backed = backed;
    // our help, and a bribed hardliner's, move delegates from the other wings
    var moves = {};
    if (backed && sh[backed] !== undefined) moves[backed] = bump;
    Q.cg_rigged = ''; Q.cg_guild_wing = '';
    if (Q.contest_rigged && b !== 'pal' && (!Q.contest_rigged_bloc || Q.contest_rigged_bloc === b)) {
      var rg = [];
      for (i = 0; i < ws.length; i++) { var hc = SW.wingCandidate(Q, ws[i]); if (hc && SW.LEADERS[hc].firm >= 0.7 && ws[i] !== Q[b + '_wing']) { moves[ws[i]] = (moves[ws[i]] || 0) + 8; rg.push(ws[i]); } }
      Q.contest_rigged = 0; Q.contest_rigged_bloc = '';
      Q.cg_rigged = rg.length ? rg[0] : '';
    }
    // the guilds' money, when their patience is gone
    var gw = SW.guildBankroll ? SW.guildBankroll(Q, b) : '';
    if (gw) { moves[gw] = (moves[gw] || 0) + 6; Q.cg_guild_wing = gw; Q.guild_bankrolls = (Q.guild_bankrolls || 0) + 1; }
    for (w in moves) {
      var take = moves[w], others = 0;
      for (i = 0; i < ws.length; i++) if (ws[i] !== w) others += sh[ws[i]];
      if (others <= 0) continue;
      for (i = 0; i < ws.length; i++) if (ws[i] !== w) sh[ws[i]] -= take * sh[ws[i]] / others;
      sh[w] += take;
      Q['wing_' + w] = sh[w]; Q['wingpush_' + w] = (Q['wingpush_' + w] || 0) + take / 2;
    }
    for (i = 0; i < ws.length; i++) Q['wing_' + ws[i]] = Math.max(0.5, sh[ws[i]]);
    SW.normWings(Q, b);
    for (i = 0; i < ws.length; i++) sh[ws[i]] = SW.wingShare(Q, ws[i]);
    Q.cg_table = SW.congressTable(Q, b, sh);
    Q.cg_chart = SW.congressChart(Q, b, sh);
    // the first ballot: only a wing with a candidate can win it
    var cands = ws.filter(function (x) { return !!SW.wingCandidate(Q, x); }).sort(function (x, y) { return sh[y] - sh[x]; });
    if (!cands.length) return;
    var ideo = {};
    for (i = 0; i < ws.length; i++) ideo[ws[i]] = SW.wingIdeo(Q, ws[i]);
    var winner = cands[0], terms = '', allies = [], A = cands[0], B = cands[1];
    Q.cg_analysis = SW.congressAnalysis(Q, b, sh, ideo, cands);
    if (sh[A] > 50 || !B) {
      Q.cg_deadlock = 0;
      Q.cg_box = '<div class="cg-box ok">' + SW.LEADERS[SW.wingCandidate(Q, A)].name + ' carries the first ballot!</div>';
    } else {
      // the second round: the two strongest candidates bargain; every other wing, and the non-affiliated, side with the nearer
      Q.cg_deadlock = 1;
      Q.cg_box = '<div class="cg-box">The congress is deadlocked!</div>';
      var tot = {}, side = {};
      tot[A] = sh[A]; tot[B] = sh[B];
      for (i = 0; i < ws.length; i++) {
        w = ws[i];
        if (w === A || w === B) continue;
        var da = SW.ideoDistance(ideo[w], ideo[A]), db = SW.ideoDistance(ideo[w], ideo[B]);
        side[w] = da <= db ? A : B; tot[side[w]] += sh[w];
      }
      var base = SW.BLOC_IDEOLOGY[b] || {};
      var na = SW.ideoDistance(base, ideo[A]) + (A === 'free_traders' ? 0.3 : 0), nb = SW.ideoDistance(base, ideo[B]) + (B === 'free_traders' ? 0.3 : 0);
      var naSide = na <= nb ? A : B;
      tot[naSide] += SW.nonAff(Q, b);
      winner = tot[A] > tot[B] || (tot[A] === tot[B] && sh[A] >= sh[B]) ? A : B;
      for (w in side) if (side[w] === winner) allies.push(w);
      allies.sort(function (x, y) { return sh[y] - sh[x]; });
      // a wing without a candidate that carried the day sets the winner's terms
      if (allies.length && sh[allies[0]] > sh[winner] && !SW.wingCandidate(Q, allies[0])) terms = allies[0];
      var loser = winner === A ? B : A, wc = SW.wingCandidate(Q, winner), lc = SW.wingCandidate(Q, loser);
      var cmp = allies.length ? SW.ideoCompare(ideo[allies[0]], ideo[winner]) : null;
      var t2 = '<p>The first round of voting at the congress of ' + sp(Q, b, 'the ' + Q.cg_bloc_name) + ' ended without a clear winner. The wings remain divided, and no candidate has enough support to claim the leadership.</p><hr class="cg-rule">';
      if (terms) t2 += '<p>Without a candidate of their own, the ' + SW.wingSpan(terms) + ' decided the congress. They carried it for ' + SW.LEADERS[wc].name + ' of the ' + SW.wingSpan(winner) + ', on their own terms.';
      else if (allies.length) t2 += '<p>The ' + SW.wingSpan(winner) + ' managed to unite the divided congress around ' + SW.LEADERS[wc].name + '. After much debate, enough delegates from the ' + allies.map(function (x) { return SW.wingSpan(x); }).join(' and the ') +
        ' decided to back ' + SW.shortName(wc) + ', holding that ' + (cmp && cmp.agreeK ? SW.shortName(wc) + '\'s line on ' + SW.VIEW_TOPIC[cmp.agreeK] + ' was closer to their own than ' + SW.shortName(lc) + '\'s.' : 'another ballot would only deepen the split.');
      else t2 += '<p>The ' + SW.wingSpan(winner) + ' held their nerve. With the non-affiliated delegates behind ' + SW.shortName(wc) + ', ' + SW.LEADERS[wc].name + ' edged out ' + SW.LEADERS[lc].name + ' on the second ballot.';
      t2 += (naSide === winner && allies.length ? ' The non-affiliated delegates followed.' : '') + '</p>';
      Q.cg_round2 = t2;
    }
    SW.congressApply(Q, b, winner, terms, backed);
  };
  // three short paragraphs on the first ballot, from the shares and what divides the wings
  SW.congressAnalysis = function (Q, b, sh, ideo, cands) {
    var ws = Object.keys(sh), pair = null, pd = 99, i, j;
    for (i = 0; i < ws.length; i++) for (j = i + 1; j < ws.length; j++) {
      if (sh[ws[i]] + sh[ws[j]] <= 50) continue;
      var d = SW.ideoDistance(ideo[ws[i]], ideo[ws[j]]);
      if (d < pd) { pd = d; pair = sh[ws[i]] >= sh[ws[j]] ? [ws[i], ws[j]] : [ws[j], ws[i]]; }
    }
    var h = '', A = cands[0], c = SW.wingCandidate(Q, A);
    if (pair) {
      var cmp = SW.ideoCompare(ideo[pair[0]], ideo[pair[1]]);
      h += '<p>The ' + SW.wingSpan(pair[0]) + ' and the ' + SW.wingSpan(pair[1]) + ' together hold a majority of the delegates' +
        (cmp.agree ? ', and both want ' + cmp.agree : '') + '. ' + (cmp.part ? 'They part over ' + SW.VIEW_TOPIC[cmp.part] + '.' : '') + '</p>';
    } else h += '<p>No two wings together hold a majority of the delegates.</p>';
    var big = ws.slice().sort(function (x, y) { return sh[y] - sh[x]; })[0];
    if (sh[A] > 50) {
      h += '<p>The ' + SW.wingSpan(A) + ' hold a majority on their own, and ' + SW.LEADERS[c].name + ' needs no one else.</p>';
    } else {
      var need = '', nd = 99;
      for (i = 0; i < ws.length; i++) if (ws[i] !== A && sh[A] + sh[ws[i]] > 50) { var dd = SW.ideoDistance(ideo[A], ideo[ws[i]]); if (dd < nd) { nd = dd; need = ws[i]; } }
      // the largest wing has no candidate of its own: it decides who leads
      if (big !== A && !SW.wingCandidate(Q, big) && sh[A] + sh[big] > 50) need = big;
      var cm = need ? SW.ideoCompare(ideo[A], ideo[need]) : null, fear = cm && cm.part ? ', who fear that ' + SW.shortName(c) + ' would ' + SW.VIEW_FEAR[cm.part][cm.partSign > 0 ? 0 : 1] : '';
      if (need && need === big && big !== A) {
        h += '<p>The ' + SW.wingSpan(big) + ' are the largest wing but have no candidate of their own, and whoever they back will lead. ' +
          SW.LEADERS[c].name + ' of the ' + SW.wingSpan(A) + ' cannot win without them' + (fear ? ', and they fear that ' + SW.shortName(c) + ' would ' + SW.VIEW_FEAR[cm.part][cm.partSign > 0 ? 0 : 1] : '') + '.</p>';
      } else if (need) {
        h += '<p>Although the ' + SW.wingSpan(A) + ' appear strongest, they cannot elect ' + SW.LEADERS[c].name + ' without the ' + SW.wingSpan(need) + fear + '.</p>';
      } else h += '<p>The ' + SW.wingSpan(A) + ' are the largest wing, but far from a majority.</p>';
      h += '<p>No wing can carry the congress on its own. The delegates must now return to negotiation and decide who will lead.</p>';
    }
    return h;
  };
  SW.congressApply = function (Q, b, winner, terms, backed) {
    if (!SW.wingCandidate(Q, winner)) return;
    var wc = SW.wingCandidate(Q, winner), was = Q[b + '_wing'], wasLeader = b === 'pal' ? (Q.pal_leader_id || '') : Q[b + '_leader_id'];
    var palFree = b === 'pal' && !SW.leaderOut(Q, 'pal') && !Q.pal_leader_id;
    Q[b + '_wing'] = winner;
    Q[b + '_terms'] = terms || '';
    if (palFree) { Q.pal_lieutenant_id = wc; Q.pal_lieutenant = SW.LEADERS[wc].name; }
    else if (wc !== wasLeader || SW.leaderOut(Q, b)) SW.setLeader(Q, b, wc);
    Q[b + '_wing'] = winner;
    Q['wingpush_' + winner] = (Q['wingpush_' + winner] || 0) + 4;
    // a wing that wins its congress has less to be radical about
    Q['rad_' + winner] = (Q['rad_' + winner] || 0) / 2;
    Q.cg_changed = winner !== was || wc !== wasLeader ? 1 : 0;
    Q.cg_winner = SW.LEADERS[wc].name; Q.cg_winner_id = wc; Q.cg_winner_wing = winner; Q.cg_winner_wing_name = SW.wingName(winner);
    var won = backed && backed === winner, lost = backed && backed !== winner;
    Q.cg_backed_won = won ? 1 : 0; Q.cg_backed_lost = lost ? 1 : 0;
    if (won) { Q[b + '_favour'] = (Q[b + '_favour'] || 0) + 2; if (b !== 'pal') Q[b + '_relation'] = (Q[b + '_relation'] || 0) + 6; }
    if (lost) { Q[b + '_grudge'] = (Q[b + '_grudge'] || 0) + 2; if (b !== 'pal') Q[b + '_relation'] = (Q[b + '_relation'] || 0) - 8; }
    // backing the rival who unseats a hardliner heads off the defection they were threatening
    var tid = SW.threatOnGroup(Q, b);
    if (tid && won && SW.THREATS[tid].hard.indexOf(wasLeader) >= 0 && wc !== wasLeader) Q[tid + '_threat_rival'] = 1;
    Q[b + '_congress_due'] = Q.date + SW.CONGRESS_GAP;
    Q[b + '_congress_why'] = '';
    Q[b + '_congress_last'] = Q.date;
    Q[b + '_congress_quiet'] = 0;
    Q[b + '_congress_hold'] = Q.date + SW.CONGRESS_HOLD;
    Q.congresses = (Q.congresses || 0) + 1;
    var bn = sp(Q, b, 'the ' + Q.cg_bloc_name), wn = SW.wingSpan(winner), t;
    if (palFree) t = 'Palpatine\'s bloc will follow the line of the ' + wn + ', with ' + Q.cg_winner + ' at his side!';
    else if (Q.cg_changed) t = '<b>' + Q.cg_winner + '</b> now leads ' + bn + '. ' + sp(Q, b, 'The ' + Q.cg_bloc_name) + ' will follow the programme of the ' + wn + (terms ? ', on the ' + SW.wingSpan(terms) + '\'s terms' : '') + '!';
    else t = '<b>' + Q.cg_winner + '</b> holds on to the leadership of ' + bn + ', and the ' + wn + ' keep control' + (terms ? ', on the ' + SW.wingSpan(terms) + '\'s terms' : '') + '.';
    if (won) t += ' Our help did not go unnoticed.';
    if (lost) t += ' Our meddling did not go unnoticed either, and the winners will remember it.';
    if (Q.cg_guild_wing && SW.WINGS[Q.cg_guild_wing] && SW.WINGS[Q.cg_guild_wing].bloc === b) {
      t += ' Trade Federation and Banking Clan credits flowed to the ' + SW.wingSpan(Q.cg_guild_wing) + ' delegates' + (Q.cg_guild_wing === winner ? ', and they paid off.' : ', for nothing.');
      if (Q.cg_guild_wing !== winner) SW.addRad(Q, Q.cg_guild_wing, 10, Q['rad_why_' + Q.cg_guild_wing] || '');
    }
    if (Q.cg_rigged && SW.WINGS[Q.cg_rigged] && SW.WINGS[Q.cg_rigged].bloc === b) t += ' It is whispered that Palpatine\'s people paid for the votes of the ' + SW.wingSpan(Q.cg_rigged) + ' delegates.';
    Q.cg_guild_wing = ''; Q.cg_rigged = '';
    Q.cg_result = t;
    Q.cg_effect = (palFree ? '' : SW.leaderEffect(Q, b, wc)) || ' ';
    Q.contest_group = '';
    if (b !== 'pal' && SW.walkoutCheck) SW.walkoutCheck(Q, b, winner, backed);
    Q.walkout_go = Q.walkout_ready ? 1 : 0;
  };
  // the wing behind a bloc's line, for display
  SW.wingLine = function (Q, b) {
    var w = Q[b + '_wing'];
    if (!w || !SW.WINGS[w]) return '';
    return SW.WINGS[w].name;
  };
  // the bloc's regional strength: each wing lifts it where its delegates come from, the ruling wing most of all,
  // and the other regions dip to match, so that the bloc's overall size is kept
  SW.wingPull = function (Q, b) {
    if (!SW.hasWings(Q, b)) return null;
    var f = {}, ws = SW.blocWings(Q, b), rw = Q[b + '_wing'], r, i;
    for (i = 0; i < SW.REGIONS.length; i++) f[SW.REGIONS[i]] = 1;
    for (i = 0; i < ws.length; i++) {
      var h = SW.WINGS[ws[i]].home || {}, s = SW.wingShare(Q, ws[i]) / 100 * (ws[i] === rw ? 2 : 1);
      for (r in h) if (f[r] !== undefined) f[r] += SW.WING_PULL * s * h[r];
    }
    var num = 0, den = 0;
    for (i = 0; i < SW.REGIONS.length; i++) {
      r = SW.REGIONS[i];
      var v = (Q[r] > 0 ? Q[r] : 0) * (Q[r + '_' + b] > 0 ? Q[r + '_' + b] : 0);
      num += v * f[r]; den += v;
    }
    if (num > 0 && den > 0) for (r in f) f[r] *= den / num;
    return f;
  };
  SW.regionRaw = function (Q, r, b) {
    var v = Math.max(0, Q[r + '_' + b] || 0), f = SW.wingPull(Q, b);
    return f ? v * f[r] : v;
  };

  // ------------------------------------------------------------------ what a ruling wing does
  // Each wing's own views, beyond its figure's, on the finer topics a vote can carry:
  // slavery, xenos (the Rights of Sentience and human-first groups), representation (the Rim's seats),
  // corruption, centralise (powers for Coruscant and its Chancellor), constitution, command (the Senate's control of the army) and trade_tax.
  SW.WING_VIEWS = {
    ruusan: {corruption: 0.1, constitution: 0.1, xenos: 0.05, representation: 0.05},
    establishment: {constitution: -0.05, representation: -0.05, trade_tax: -0.05, core_tax: -0.15},
    old_families: {xenos: -0.2, representation: -0.15, centralise: 0.1, core_tax: -0.2},
    corporatists: {trade_tax: -0.3, corruption: -0.2, xenos: 0.1, constitution: 0.1},
    confederates: {centralise: -0.2, trade_tax: -0.2, corruption: -0.1, xenos: 0.1},
    free_traders: {corruption: 0.2, army: 0.1, command: 0.05},
    mic: {centralise: 0.2, constitution: -0.2, command: -0.25, army: 0.15, peace: -0.15},
    populists: {xenos: 0.2, slavery: 0.2, representation: 0.25, constitution: 0.1, army: -0.1, regulate: 0.05, core_tax: 0.05},
    hutt_machine: {slavery: -0.3, corruption: -0.2, regulate: -0.1},
    radicals: {representation: 0.25, slavery: 0.25, xenos: 0.2, centralise: -0.1},
    law_order: {army: 0.05, centralise: 0.05},
    human_first: {xenos: -0.25, representation: -0.2, centralise: 0.15, command: -0.15},
    const_hawks: {command: 0.25, constitution: 0.15, centralise: -0.1},
    brokers: {peace: 0.1, constitution: 0.1, corruption: 0.05},
    neutralists: {peace: 0.15, army: -0.05},
    isolationists: {representation: 0.2, xenos: 0.15, slavery: -0.2, corruption: -0.15, centralise: -0.3, army: -0.05, core_tax: 0.05},
    rfc_pragmatists: {representation: 0.1},
    rfc_radicals: {representation: 0.2, slavery: 0.2},
    centralists: {corruption: 0.2, centralise: 0.25, constitution: -0.1},
    new_order: {xenos: -0.4, representation: -0.4, slavery: -0.1, centralise: 0.3},
    cult: {corruption: -0.3, constitution: -0.3, centralise: 0.3, oversight: -0.1}
  };
  // the views a bloc votes by: its leader's and its ruling wing's
  SW.blocViews = function (Q, b) {
    var v = {}, k, L = SW.leader(Q, b).views || {}, w = Q && SW.hasWings && SW.hasWings(Q, b) ? Q[b + '_wing'] : '', W = (w && SW.WING_VIEWS[w]) || {};
    if (b === 'rfc' && Q && SW.splinterWing && SW.splinterWing(Q)) { w = Q.rfc_kind; W = SW.WING_VIEWS[w] || {}; }
    for (k in L) v[k] = (v[k] || 0) + L[k];
    for (k in W) v[k] = (v[k] || 0) + W[k];
    // the Brokers stand by the Republic once it is fighting
    if (w === 'brokers' && Q.war) v.army = (v.army || 0) + 0.1;
    return v;
  };
  SW.wingRules = function (Q, b, w) { return !!(Q && Q[b + '_wing'] === w && (Q.parties || []).indexOf(b) >= 0 && SW.hasWings(Q, b)); };
  SW.RIM_TOPICS = ['rim', 'slavery', 'representation', 'xenos'];
  // the Rim Radicals take their seats to stop the Senate working, until the Republic shows it can change
  SW.rimObstruct = function (Q) {
    if (!SW.wingRules(Q, 'rim', 'radicals')) return 0;
    var steps = SW.trackSteps(Q, ['rim', 'slavery', 'hhc']), base = Q.radicals_steps0 >= 0 ? Q.radicals_steps0 : steps;
    return SW.clamp(1 - 0.25 * (steps - base), 0, 1);
  };
  // a bloc's vote, as its ruling wing colours it beyond its views
  SW.wingVote = function (Q, b, p, topics, reformVote, palLine, rcYes) {
    var has = function (re) { return topics.some(function (t) { return re.test(t); }); };
    if (b === 'pal' && SW.wingRules(Q, 'pal', 'cult') && reformVote) p -= 0.2;
    if (b === 'mod' && SW.wingRules(Q, 'mod', 'old_families') && has(/powers|centralise/)) p = 0.6 * p + 0.4 * palLine;
    if (b === 'rim' && Q.hutt_turned && !Q.syndicates_broken && has(/powers|oversight/)) p = 0.5 * p + 0.5 * palLine;
    if (b === 'rim') {
      var obs = SW.rimObstruct(Q);
      if (obs > 0 && !topics.some(function (t) { return SW.RIM_TOPICS.indexOf(t.replace('-', '')) >= 0; })) p *= 1 - 0.8 * obs;
    }
    return p;
  };

  // ------------------------------------------------------------------ the guilds' wings and the escalation
  SW.guildWing = function (Q) { return (Q.parties || []).indexOf('guild') >= 0 ? Q.guild_wing : ''; };
  // under the Confederates the escalation comes faster; under the Free Traders or the war industry it stops climbing
  SW.guildEscalates = function (Q) { var w = SW.guildWing(Q); return w !== 'free_traders' && w !== 'mic'; };
  // a wing leaves its bloc for another (or for the Confederacy), taking its share of the bloc's support with it
  SW.splitBloc = function (Q, from, into, share) {
    share = SW.clamp(share, 0, 0.9);
    if (!(share > 0) || Q.parties.indexOf(from) < 0) return 0;
    var seated = into && Q.parties.indexOf(into) >= 0, lost = 0;
    for (var i = 0; i < SW.REGIONS.length; i++) {
      var r = SW.REGIONS[i], v = (Q[r + '_' + from] || 0) * share;
      Q[r + '_' + from] = (Q[r + '_' + from] || 0) - v;
      if (seated) Q[r + '_' + into] = (Q[r + '_' + into] || 0) + v;
      else {
        var tot = 0;
        for (var p = 0; p < Q.parties.length; p++) tot += Q[r + '_' + Q.parties[p]] || 0;
        var sd = Q[r + '_seceded'] || 0, add = (1 - sd) * (tot + v > 0 ? v / (tot + v) : 0);
        Q[r + '_seceded'] = Math.min(0.9, sd + add);
        lost += add * SW.BASE_WEIGHTS[r];
      }
    }
    if (lost > 0) {
      SW.recountSecession(Q);
      Q.secession_recent = (Q.secession_recent || 0) + lost / 10;
      if (Q.war) Q.droid_armies += lost / 12;
    }
    SW.senateSession(Q, true);
    return share;
  };
  // a wing leaves its bloc for good: its delegates go, and if it ruled, the strongest wing left takes over
  SW.wingLeaves = function (Q, w, into) {
    var W = SW.WINGS[w], b = W.bloc, share = (SW.wingShare(Q, w) + SW.nonAff(Q, b) * SW.wingShare(Q, w) / 100) / 100;
    SW.splitBloc(Q, b, into, share);
    Q['wing_gone_' + w] = 1; Q['wing_' + w] = 0; Q['wingpush_' + w] = 0;
    Q['wing_left_' + w] = into || 'out';
    SW.normWings(Q, b);
    if (Q[b + '_wing'] === w) {
      var ws = SW.blocWings(Q, b).filter(function (x) { return SW.wingCandidate(Q, x); }).sort(function (x, y) { return SW.wingShare(Q, y) - SW.wingShare(Q, x); });
      if (ws.length) { Q[b + '_wing'] = ws[0]; if (b !== 'pal' || Q.pal_leader_id) SW.setLeader(Q, b, SW.wingCandidate(Q, ws[0])); }
    }
    return share;
  };
  // the escalation's last step under the Confederates: the hardliners and the Trade Federation's men go over to the Confederacy
  SW.guildsDefect = function (Q) {
    if (SW.guildWing(Q) !== 'confederates' || !Q.dooku_movement) return 0;
    var into = Q.parties.indexOf('cis') >= 0 ? 'cis' : '';
    var moved = 0;
    if (SW.wingActive(Q, 'confederates')) moved += SW.wingLeaves(Q, 'confederates', into);
    if (SW.wingActive(Q, 'corporatists') && (Q.parties || []).indexOf('guild') >= 0) moved += SW.wingLeaves(Q, 'corporatists', into);
    Q.guilds_split = 1;
    return moved;
  };

  // ------------------------------------------------------------------ the Hutt-space Machine's terms
  SW.huttRules = function (Q) { return SW.wingRules(Q, 'rim', 'hutt_machine') && !Q.syndicates_broken; };
  // what would break the terms: a move on slavery or on the syndicates, new rules for the guilds, arms for Ryloth's rebels
  SW.huttBroken = function (Q) {
    if (SW.TRACKS.slavery.level(Q) > (Q.hutt_slavery0 || 0)) return 'the Caucus moved against slavery';
    if (SW.TRACKS.syndicates.level(Q) > (Q.hutt_synd0 || 0)) return 'the Caucus moved against the pirates and the syndicates';
    if ((Q.guild_regulations || 0) > (Q.hutt_regs0 || 0)) return 'the Caucus put new rules on the guilds';
    if (Q.free_ryloth && !Q.hutt_ryloth0) return 'the Caucus armed Cham Syndulla\'s rebels';
    return '';
  };
  SW.huttAccept = function (Q) {
    Q.hutt_terms = 1; Q.hutt_turned = 0;
    Q.hutt_slavery0 = SW.TRACKS.slavery.level(Q); Q.hutt_synd0 = SW.TRACKS.syndicates.level(Q);
    Q.hutt_regs0 = Q.guild_regulations || 0; Q.hutt_ryloth0 = Q.free_ryloth ? 1 : 0;
    Q.hutt_offer_timer = 0; Q.rim_relation += 6;
  };
  SW.huttTurn = function (Q, why) {
    Q.hutt_terms = 0; Q.hutt_turned = 1; Q.hutt_turned_why = why || 'the Caucus would not deal';
    Q.hutt_rep_timer = 3; Q.rim_relation -= 8;
    SW.relAdd(Q, 'rim', 'pal', 10);
  };
  SW.HUTT_REPRISALS = ['bounty', 'cartel', 'relief', 'smear'];
  SW.huttReprisal = function (Q) {
    var k = SW.HUTT_REPRISALS[(Q.hutt_reprisals || 0) % 4];
    Q.hutt_rep_kind = k;
    Q.hutt_reprisals = (Q.hutt_reprisals || 0) + 1;
    Q.hutt_rep_timer = 5 + Math.floor(SW.rnd() * 3);
    if (k === 'bounty') { Q.capital -= 1; Q.fear += 1; Q.outer_rc -= 0.8; }
    else if (k === 'cartel') { Q.outer_rc -= 1.5; Q.midrim_rc -= 1; }
    else if (k === 'relief') { Q.rim_hardship += 4; Q.rim_relation -= 3; Q.trade = (Q.trade || 60) - 4; }
    else { Q.faith -= 1; SW.momentum(Q, -0.6, 'a smear from Nal Hutta'); }
  };
  SW.huttOffer = function (Q, kind) {
    Q.hutt_offer_timer = 8; Q.hutt_offers = (Q.hutt_offers || 0) + 1;
    if (kind === 'evidence') { Q.evidence += 1.5; SW.updateSithStage(Q); }
    else if (kind === 'capital') { Q.capital += 2; Q.corruption += 1; }
    else {
      Q.rim_relation += 12; Q.rim_favour = (Q.rim_favour || 0) + 2;
      // the Coalition takes its seats only if every partner already in government will sit beside it
      if (Q.rc_chancellor && (Q.govt_blocs || []).indexOf('rim') < 0 && Q.parties.indexOf('rim') >= 0 &&
          (Q.govt_blocs || []).every(function (m) { return SW.relOk(Q, 'rim', m); })) { SW.setGovt(Q, (Q.govt_blocs || []).concat(['rim'])); Q.hutt_joined = 1; }
    }
  };

  // ------------------------------------------------------------------ Palpatine's bloc: his line, his finale and his Empire
  SW.palWing = function (Q) { return (Q.parties || []).indexOf('pal') >= 0 ? (Q.pal_wing || 'centralists') : ''; };
  // the New Order tries to undo the Rim's rights once he holds the Chancellery
  SW.repealVote = function (Q, rcFights) {
    var st = SW.stance(Q, {mod: 0.35, guild: 0.4, rim: 0.05, sec: 0.55, ind: 0.3, pal: 0.95, rfc: 0.05, cis: 0.2}, false);
    if (rcFights) for (var b in st) if (b !== 'pal') st[b] = SW.clamp(st[b] - 0.06, 0, 1);
    Q.repeal_vote = SW.vote(Q, st, 0, ['-representation', '-xenos']);
    Q.vote_html = SW.voteBanner('The Restoration of Order Act', Q.repeal_vote);
    Q.repeal_tried = 1;
    if (Q.repeal_vote >= 50) {
      Q.repealed = 1;
      Q.rim_enfranchised = 0; Q.rim_assembly = 0; Q.sentience_rights = 0;
      Q.rim_relation -= 12; Q.outer_sep += 10; Q.midrim_sep += 6; Q.rim_hardship += 3; Q.faith -= 2;
      SW.wingShift(Q, 'new_order', 6);
    } else { SW.wingShift(Q, 'new_order', -4); Q.senate_resolve += 0.5; }
  };

  // ------------------------------------------------------------------ the Rim Freedom Caucus's Pragmatists come home
  SW.farrCanReturn = function (Q) {
    return SW.wingRules(Q, 'rfc', 'rfc_pragmatists') && Q.rfc_kind === 'rimward' && !Q.farr_dead && !Q.rfc_defected &&
      SW.TRACKS.rim.level(Q) >= 3 && Q.slavery_abolished && Q.slavery_enforced && !Q.finale && !Q.game_ending;
  };
  SW.farrReturns = function (Q) {
    SW.mergeBloc(Q, 'rfc', 'rc');
    Q.farr_returned = 1; Q.rimward_split = 0; Q.rfc_formed = 0;
    Q.rimward_strength = Math.max(Q.rimward_strength || 0, 25); Q.rad_rimward = Math.min(Q.rad_rimward || 0, 15);
    Q.rim_relation += 5;
  };

  // ------------------------------------------------------------------ each quarter: what the ruling wings do
  SW.wingEffects = function (Q, rf) {
    var gw = SW.guildWing(Q);
    // the war industry: more clones (or Judicial Forces), more corruption, and a warmer friendship with Palpatine
    if (gw === 'mic' && Q.war) {
      if (Q.kamino_army) Q.clones += 0.08 * rf; else Q.judicial_forces += 0.05 * rf;
      Q.corruption += 0.15 * rf;
      if (Q.parties.indexOf('pal') >= 0) SW.relAdd(Q, 'guild', 'pal', rf);
    }
    // the Corporatists answer a Caucus led by its Pacifists
    if (gw === 'corporatists' && Q.rc_lead === 'pacifist') Q.guild_relation += 0.8 * rf;
    // the Old Families and the Centralists draw the Moderates toward Palpatine
    if (Q.parties.indexOf('pal') >= 0 && Q.parties.indexOf('mod') >= 0) {
      if (SW.wingRules(Q, 'mod', 'old_families')) SW.relAdd(Q, 'mod', 'pal', rf);
      if (SW.wingRules(Q, 'pal', 'centralists')) SW.relAdd(Q, 'mod', 'pal', 0.5 * rf);
    }
    // the Hutts, turned, side with Palpatine
    if (Q.hutt_turned && !Q.syndicates_broken && Q.parties.indexOf('pal') >= 0 && Q.parties.indexOf('rim') >= 0) SW.relAdd(Q, 'rim', 'pal', rf);
    // the Rim Radicals look to Dooku
    if (SW.wingRules(Q, 'rim', 'radicals') && Q.parties.indexOf('cis') >= 0) SW.relAdd(Q, 'rim', 'cis', rf);
    // Law and Order: each step against the syndicates, and a defence budget, wins them; unchecked raids lose them
    var synd = SW.TRACKS.syndicates.level(Q);
    if (SW.wingRules(Q, 'sec', 'law_order')) {
      if (synd > (Q.lo_synd_seen || 0)) Q.sec_relation += 4 * (synd - (Q.lo_synd_seen || 0));
      if (Q.budget_pri === 'defence') Q.sec_relation += 0.5 * rf;
      if ((Q.pirate_raids || 0) > (Q.lo_raids_seen || 0) && !Q.patrol_fleets) Q.sec_relation -= 2;
    }
    Q.lo_synd_seen = synd; Q.lo_raids_seen = Q.pirate_raids || 0;
  };
  // every visit: the conditions that come and go with the ruling wings
  SW.wingState = function (Q) {
    // the Rim Radicals: the reforms that pass while they rule cut their delegates
    if (SW.wingRules(Q, 'rim', 'radicals')) {
      var steps = SW.trackSteps(Q, ['rim', 'slavery', 'hhc']);
      if (!(Q.radicals_steps0 >= 0)) { Q.radicals_steps0 = steps; Q.radicals_steps_seen = steps; }
      if (steps > (Q.radicals_steps_seen || 0)) { SW.wingShift(Q, 'radicals', -5 * (steps - Q.radicals_steps_seen)); Q.radicals_steps_seen = steps; }
    } else Q.radicals_steps0 = -1;
    Q.rim_obstruct = Math.round(SW.rimObstruct(Q) * 100) / 100;
    // the Hutts' terms
    Q.hutt_rules = SW.huttRules(Q) ? 1 : 0;
    if (Q.hutt_terms && (Q.syndicates_broken || !Q.hutt_rules)) Q.hutt_terms = 0;
    if (Q.hutt_terms) { var why = SW.huttBroken(Q); if (why) { SW.huttTurn(Q, why); Q.hutt_turned_ready = 1; } }
    if (Q.syndicates_broken && !Q.hutt_gutted) { Q.hutt_gutted = 1; Q.hutt_turned = 0; Q.hutt_terms = 0; SW.wingShift(Q, 'hutt_machine', -15); }
    Q.hutt_offer_ok = (Q.hutt_terms && Q.hutt_rules && Q.rc_in_govt && !(Q.hutt_offer_timer > 0)) ? 1 : 0;
    // the wings' names for scenes
    for (var i = 0; i < SW.CONGRESS_BLOCS.length; i++) { var b = SW.CONGRESS_BLOCS[i]; Q[b + '_wing_name'] = SW.hasWings(Q, b) ? SW.wingName(Q[b + '_wing']) : ''; }
    Q.farr_return_ready = SW.farrCanReturn(Q) ? 1 : 0;
  };

  // ------------------------------------------------------------------ the Caucus congress and its programme
  // The Caucus's factions are its wings and their strengths its delegates. A congress after each Senate election,
  // and sooner in a crisis, chooses the leading faction: its leader chairs the party, and its programme is ours.
  SW.FACTION_IDEO = {inst: {oversight: 0.25, regulate: 0.1, rim: 0.05}, rimward: {rim: 0.35, regulate: 0.15, peace: 0.05},
    pacifist: {peace: 0.35, army: -0.25, oversight: 0.05}, hawk: {army: 0.35, peace: -0.25, powers: 0.05}};
  SW.FACTION_HOME = {inst: {core: 1, colonies: 0.8}, rimward: {midrim: 1, outer: 1}, pacifist: {midrim: 1, outer: 0.6}, hawk: {colonies: 1, core: 0.6}};
  SW.FACTION_COLOR = {inst: '#3b82c4', rimward: '#d9661f', pacifist: '#5fa36b', hawk: '#7a6f9c'};
  SW.FACTION_INK = {inst: '#2f6fae', rimward: '#b4500f', pacifist: '#3f7d4b', hawk: '#5b507e'};
  SW.FACTION_LIT = {inst: '#7fb6ec', rimward: '#f0985a', pacifist: '#8cc896', hawk: '#b0a6d6'};
  // what the leading faction's programme does to a Caucus bill: topics it helps (+4) and topics it hurts (-4)
  SW.PROGRAMME = {
    inst: {plus: ['oversight', 'constitution'], minus: ['rim', 'representation']},
    rimward: {plus: ['rim', 'representation', 'slavery', 'xenos'], minus: []},
    pacifist: {plus: ['peace'], minus: ['army', 'command']},
    hawk: {plus: ['army', 'command'], minus: ['peace']}
  };
  SW.PROGRAMME_TEXT = {
    inst: 'oversight and the constitution first; the Rim can wait',
    rimward: 'the Rim first: its relief, its seats, its people',
    pacifist: 'peace first, and no more money for the war',
    hawk: 'a Republic able to defend itself, under the Senate'
  };
  SW.CAUCUS_NONAFF = 8;
  // the factions as running text names them
  SW.FACTION_LABEL = {inst: 'Institutionalists', rimward: 'Rimward faction', pacifist: 'Pacifists', hawk: 'Hawks'};
  SW.factionActive = function (Q, f) { return !Q[SW.SPLIT_FLAG[f]] || (f === 'rimward' && Q.farr_returned); };
  SW.factionSpan = function (f, text) {
    return '<span class="wing" style="--wi:' + SW.FACTION_INK[f] + ';--wl:' + SW.FACTION_LIT[f] + '">' + (text || SW.FACTION_LABEL[f]) + '</span>';
  };
  // delegate shares: each faction's strength, plus a few delegates loyal to no faction
  SW.caucusShares = function (Q) {
    var fs = SW.FACTIONS.filter(function (f) { return SW.factionActive(Q, f); }), tot = 0, sh = {}, i;
    for (i = 0; i < fs.length; i++) tot += Math.max(1, Q[fs[i] + '_strength'] || 0);
    for (i = 0; i < fs.length; i++) sh[fs[i]] = (100 - SW.CAUCUS_NONAFF) * Math.max(1, Q[fs[i] + '_strength'] || 0) / (tot || 1);
    return sh;
  };
  SW.rcLead = function (Q) { return Q.rc_lead && SW.factionActive(Q, Q.rc_lead) ? Q.rc_lead : ''; };
  // the Caucus's own regional pull: each faction draws the Caucus toward its home regions, the leading faction most
  SW.rcPull = function (Q) {
    var f = {}, sh = SW.caucusShares(Q), lead = SW.rcLead(Q), r, i;
    for (i = 0; i < SW.REGIONS.length; i++) f[SW.REGIONS[i]] = 1;
    for (var g in sh) {
      var h = SW.FACTION_HOME[g] || {}, s = sh[g] / 100 * (g === lead ? 2 : 1) * 0.5;
      for (r in h) if (f[r] !== undefined) f[r] += SW.WING_PULL * s * h[r];
    }
    var num = 0, den = 0;
    for (i = 0; i < SW.REGIONS.length; i++) {
      r = SW.REGIONS[i];
      var v = (Q[r] > 0 ? Q[r] : 0) * (Q[r + '_rc'] > 0 ? Q[r + '_rc'] : 0);
      num += v * f[r]; den += v;
    }
    if (num > 0 && den > 0) for (r in f) f[r] *= den / num;
    return f;
  };
  // the programme's weight on a Caucus bill
  SW.programmeBonus = function (Q, topics) {
    var P = SW.PROGRAMME[SW.rcLead(Q)];
    if (!P || !topics.length) return 0;
    var bare = topics.map(function (t) { return t.charAt(0) === '-' ? '' : t; });
    if (bare.some(function (t) { return P.plus.indexOf(t) >= 0; })) return 4;
    if (bare.some(function (t) { return P.minus.indexOf(t) >= 0; })) return -4;
    return 0;
  };
  // when the Caucus's congress meets: after each Senate election, or early when the leading faction is in revolt or outgrown
  SW.caucusCongressCheck = function (Q) {
    Q.rc_congress_ready = 0;
    // a faction's pending event lapses if it no longer leads
    if (Q.lead_event_ready && Q.lead_event_ready.indexOf(SW.rcLead(Q) + '_') !== 0) Q.lead_event_ready = '';
    if (Q.road_event_ready && Q.road_event_ready.indexOf(SW.rcLead(Q) + '_') !== 0) Q.road_event_ready = '';
    if (Q.finale || Q.game_ending || !(Q.months_per_turn > 0) || Q.time < 2) return;
    var lead = SW.rcLead(Q), sh = SW.caucusShares(Q), why = '', fs = Object.keys(sh);
    // with every faction gone there is nothing to choose; with one left, it leads
    if (!fs.length) return;
    if (fs.length === 1) { if (Q.rc_lead !== fs[0]) { Q.rc_lead = fs[0]; Q.rc_chair = Q[fs[0] + '_leader'] || ''; } return; }
    if (!lead) why = 'none';
    else if ((Q.elections_held || 0) > (Q.rc_congress_elections || 0)) why = 'election';
    else if (Q.date >= (Q.rc_congress_hold || -99)) {
      for (var f in sh) if (f !== lead && sh[f] >= (sh[lead] || 0) + 10) why = 'outgrown';
      // one of our wings on the brink forces a congress
      var rv = SW.caucusRevolt(Q);
      if (rv) { why = 'revolt'; Q.rcg_revolt_f = rv; }
    }
    if (why && !(Q.congress_timer > 0) && !Q.congress_go) { Q.rc_congress_ready = 1; Q.rc_congress_why = why; }
  };
  SW.prepareCaucusCongress = function (Q) {
    Q.congress_timer = 1;
    // each wing puts up its strongest figure
    for (var cf in SW.caucusShares(Q)) SW.caucusLeaderPick(Q, cf);
    var sh = SW.caucusShares(Q), lead = SW.rcLead(Q), fs = Object.keys(sh), i;
    Q.rcg_why = Q.rc_congress_why || 'election';
    Q.rcg_intro = {
      none: 'The Caucus has no leading faction, and its delegates gather to choose one.',
      election: 'After the election, the Caucus\'s delegates gather in congress to choose the faction that will lead the party, and whose programme will be ours.',
      revolt: 'The ' + SW.factionSpan(Q.rcg_revolt_f || lead || 'inst') + ' are on the brink' + (SW.caucusGrievance(Q, Q.rcg_revolt_f || lead || 'inst') ? ', ' + SW.caucusGrievance(Q, Q.rcg_revolt_f || lead || 'inst') : '') + ', and have forced an early congress.',
      outgrown: 'The ' + SW.factionSpan(lead || 'inst') + ' no longer speak for most of the Caucus, and its delegates call an early congress.'
    }[Q.rcg_why] || ' ';
    Q.rcg_lead = lead || '';
    for (i = 0; i < 4; i++) {
      var f = fs[i];
      Q['rcg_c' + (i + 1)] = f ? 1 : 0; Q['rcg_c' + (i + 1) + '_f'] = f || ''; Q['rcg_c' + (i + 1) + '_name'] = f ? SW.FACTION_LABEL[f] : '';
      Q['rcg_c' + (i + 1) + '_cand'] = f ? (Q[f + '_leader'] || SW.FACTION_NAMES[f]) : '';
      var adv = '';
      if (f) for (var a in SW.ADVISOR_FACTION) if (Q['adv_' + a] && SW.ADVISOR_FACTION[a] === f) { adv = SW.ADVISOR_NAMES[a]; break; }
      Q['rcg_c' + (i + 1) + '_adv'] = adv;
    }
    Q.rcg_adv_ok = !(Q.advisor_action_timer > 0) ? 1 : 0;
    Q.rcg_can_pay = Q.capital >= 1 ? 1 : 0;
    Q.rcg_table = SW.caucusTable(Q, sh);
    Q.cg_chart = SW.caucusChart(Q, sh);
    Q.rcg_result = ' '; Q.rcg_round2 = ' '; Q.rcg_analysis = ' '; Q.rcg_box = ' '; Q.rcg_deadlock = 0; Q.rcg_effect = ' ';
  };
  SW.caucusTable = function (Q, sh) {
    var h = '<table class="congress"><tr><th>Faction</th><th>Candidate</th><th>Delegates</th></tr>';
    for (var f in sh) h += '<tr><td>' + SW.factionSpan(f, SW.FACTION_NAMES[f]) + '</td><td>' + (Q[f + '_leader'] || '') + '</td><td>' + Math.round(sh[f]) + '%</td></tr>';
    return h + '<tr><td class="nonaff">Non-affiliated</td><td></td><td>' + SW.CAUCUS_NONAFF + '%</td></tr></table>';
  };
  SW.caucusChart = function (Q, sh) {
    var data = [];
    for (var f in sh) { var n = Math.round(sh[f] * 2); if (n > 0) data.push({id: f, legend: SW.FACTION_NAMES[f], name: SW.FACTION_NAMES[f], seats: n, color: SW.FACTION_COLOR[f]}); }
    data.push({id: 'nonaff', legend: 'Non-affiliated', name: 'Non-affiliated', seats: SW.CAUCUS_NONAFF * 2, color: '#bdb6a8'});
    return data;
  };
  // how: '' (stay out), 'back' or 'adv' for slot n
  SW.resolveCaucusCongress = function (Q, how, n) {
    var sh = SW.caucusShares(Q), fs = Object.keys(sh), i, f;
    // every advisor's own faction rallies for its own
    for (var a in SW.ADVISOR_FACTION) if (Q['adv_' + a] && sh[SW.ADVISOR_FACTION[a]] !== undefined) sh[SW.ADVISOR_FACTION[a]] += 2;
    var backed = n ? Q['rcg_c' + n + '_f'] : '';
    if (how === 'back' && backed) { sh[backed] += 6; Q.capital -= 1; }
    if (how === 'adv' && backed) { sh[backed] += 5; Q.advisor_action_timer = Math.max(Q.advisor_action_timer || 0, 3); }
    var tot = 0; for (f in sh) tot += sh[f];
    for (f in sh) sh[f] = (100 - SW.CAUCUS_NONAFF) * sh[f] / tot;
    Q.rcg_table = SW.caucusTable(Q, sh);
    Q.cg_chart = SW.caucusChart(Q, sh);
    var order = fs.slice().sort(function (x, y) { return sh[y] - sh[x]; }), A = order[0], B = order[1], winner = A, allies = [];
    if (sh[A] > 50 || !B) {
      Q.rcg_deadlock = 0;
      Q.rcg_box = '<div class="cg-box ok">' + (Q[A + '_leader'] || SW.FACTION_NAMES[A]) + ' carries the first ballot!</div>';
      Q.rcg_analysis = '<p>The ' + SW.factionSpan(A) + ' hold a majority of the delegates on their own.</p>';
    } else {
      Q.rcg_deadlock = 1;
      Q.rcg_box = '<div class="cg-box">The congress is deadlocked!</div>';
      var tA = sh[A], tB = sh[B], side = {};
      // every other wing sides with the nearer of the two; a wing angry with the leadership leans to the challenger
      var lean = function (g, x) { return SW.ideoDistance(SW.FACTION_IDEO[g], SW.FACTION_IDEO[x]) + (x === Q.rc_lead ? 0.3 * SW.clamp(Q['rad_' + g] || 0, 0, 100) / 100 : 0); };
      for (i = 2; i < order.length; i++) {
        f = order[i];
        side[f] = lean(f, A) <= lean(f, B) ? A : B;
        if (side[f] === A) tA += sh[f]; else tB += sh[f];
      }
      // the uncommitted follow the larger of the two, or the faction that led before when it is close
      var na = (Q.rc_lead === B && sh[A] - sh[B] < 3) ? B : A;
      if (na === A) tA += SW.CAUCUS_NONAFF; else tB += SW.CAUCUS_NONAFF;
      winner = tA >= tB ? A : B;
      for (f in side) if (side[f] === winner) allies.push(f);
      Q.rcg_analysis = '<p>The ' + SW.factionSpan(A) + ' are the largest faction but far from a majority, and the ' + SW.factionSpan(B) + ' will not serve under them without a fight. No faction can carry the congress on its own.</p>';
      Q.rcg_round2 = '<p>The first round of voting ended without a clear winner.</p><hr class="cg-rule"><p>' +
        (allies.length ? 'The ' + SW.factionSpan(winner) + ' won over the ' + allies.map(function (x) { return SW.factionSpan(x); }).join(' and the ') + ', and with them the congress.' :
          'The ' + SW.factionSpan(winner) + ' held their own delegates and won over the uncommitted.') + '</p>';
    }
    SW.caucusCongressApply(Q, winner, backed);
  };
  SW.caucusCongressApply = function (Q, winner, backed) {
    var was = Q.rc_lead;
    Q.rc_lead = winner; Q.rc_lead_name = SW.FACTION_NAMES[winner];
    if (winner !== was) Q.lead_event_ready = '';
    Q.rc_chair = Q[winner + '_leader'] || ''; Q.rc_lead_programme = SW.PROGRAMME_TEXT[winner];
    Q['rad_' + winner] = (Q['rad_' + winner] || 0) / 2;
    // the faction furthest from the winner's ideology resents it
    var far = '', fd = -1;
    for (var f in SW.FACTION_IDEO) if (f !== winner && SW.factionActive(Q, f)) { var d = SW.ideoDistance(SW.FACTION_IDEO[f], SW.FACTION_IDEO[winner]); if (d > fd) { fd = d; far = f; } }
    if (far) SW.addCaucusRad(Q, far, 5, '');
    Q.rc_congress_elections = Q.elections_held || 0;
    Q.rc_congress_hold = Q.date + 12;
    Q.rc_congresses = (Q.rc_congresses || 0) + 1;
    Q.rcg_changed = winner !== was ? 1 : 0;
    Q.rcg_far = far ? SW.FACTION_NAMES[far] : '';
    Q.rcg_result = (Q.rcg_changed ? 'The ' + SW.factionSpan(winner) + ' now lead the Caucus, and ' + Q.rc_chair + ' becomes its chair.' :
      'The ' + SW.factionSpan(winner) + ' keep the lead of the Caucus, with ' + Q.rc_chair + ' in the chair.') +
      ' Our programme: ' + SW.PROGRAMME_TEXT[winner] + '.' + (backed && backed !== winner ? ' The faction we backed lost, and will remember it.' : '');
    Q.rcg_effect = far ? 'The ' + SW.FACTION_LABEL[far] + ' resent' + (far === 'rimward' ? 's' : '') + ' the result.' : ' ';
    if (backed && backed !== winner) SW.addCaucusRad(Q, backed, 3, '');
    SW.caucusWalkoutCheck(Q, winner, backed);
  };
  // ------------------------------------------------------------------ our wings: radicalism, growth, leaders and walkouts
  // Our four wings work like every other bloc's: delegates that grow with what we do, a leader chosen at the congress,
  // and radicalism that the galaxy, our own bills and our partners feed, and that can drive a defeated wing out.
  // what each wing believes, for radicalism (the congress's distances use SW.FACTION_IDEO)
  SW.CAUCUS_VIEWS = {
    inst: {oversight: 0.25, constitution: 0.2, corruption: 0.2, powers: -0.2, representation: -0.1},
    rimward: {rim: 0.35, representation: 0.3, slavery: 0.3, xenos: 0.3, regulate: 0.15, trade_tax: 0.1},
    pacifist: {peace: 0.35, army: -0.25, command: -0.1, powers: -0.15},
    hawk: {army: 0.35, command: 0.2, peace: -0.25, powers: 0.05}
  };
  // partners a wing will not govern beside
  SW.CAUCUS_REJECTS = {inst: ['pal'], rimward: ['pal', 'guild'], pacifist: ['sec'], hawk: ['rim']};
  // what the galaxy does to them, in words (for the Senate tab, the cards and the walkout)
  SW.CAUCUS_WHY = {
    fear: 'fear in the streets', losing: 'a war being lost', weariness: 'a war without end', powers: 'the Chancellor\'s emergency powers',
    hardship: 'the Rim\'s hardship', secession: 'the Rim worlds lost to secession', corruption: 'a corrupt Senate', scandal: 'scandal in our own ranks'
  };
  SW.addCaucusRad = function (Q, f, gain, why) {
    if (SW.FACTIONS.indexOf(f) < 0 || !gain) return;
    Q['rad_' + f] = SW.clamp((Q['rad_' + f] || 0) + gain, 0, 100);
    if (gain > 0 && why && Q['rad_why_' + f] !== why) { Q['rad_why2_' + f] = Q['rad_why_' + f] || ''; Q['rad_why_' + f] = why; }
  };
  // the Caucus backs these topics (its own bill): the wings that oppose them grow radical
  SW.radicaliseCaucus = function (Q, topics, strength) {
    if (!topics || !topics.length || Q.finale || Q.game_ending) return;
    for (var i = 0; i < SW.FACTIONS.length; i++) {
      var f = SW.FACTIONS[i], V = SW.CAUCUS_VIEWS[f] || {}, o = 0, worst = '', wv = 0;
      if (!SW.factionActive(Q, f)) continue;
      for (var t = 0; t < topics.length; t++) {
        var tp = topics[t], sg = 1;
        if (!tp) continue;
        if (tp.charAt(0) === '-') { sg = -1; tp = tp.slice(1); }
        var v = sg * (V[tp] || 0);
        o += v;
        if (v < wv && SW.topicPhrase(topics[t])) { wv = v; worst = topics[t]; }
      }
      if (o <= -0.1) SW.addCaucusRad(Q, f, Math.min(12, 50 * -o * strength), worst);
    }
  };
  // what a wing holds against us, after "furious": "over a war being lost, and that the Caucus has backed peace talks"
  SW.caucusGrievance = function (Q, f) {
    var whys = [Q['rad_why_' + f], Q['rad_why2_' + f]].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var over = [], backs = [], gov = [];
    for (var i = 0; i < whys.length; i++) {
      var w = whys[i];
      if (SW.CAUCUS_WHY[w]) over.push(SW.CAUCUS_WHY[w]);
      else if (w.indexOf('gov:') === 0) gov.push(w.slice(4) === 'rc' ? 'the Ruusan Caucus' : 'the ' + SW.name(Q, w.slice(4)));
      else if (SW.topicPhrase(w)) backs.push(SW.topicPhrase(w));
    }
    var c = [];
    if (over.length) c.push('over ' + over.join(' and '));
    var did = [];
    if (backs.length) did.push('backed ' + backs.join(' and '));
    if (gov.length) did.push('gone into government beside ' + gov.join(' and '));
    if (did.length) c.push('that the Caucus has ' + did.join(' and '));
    return c.join(', and ');
  };
  // each quarter: radicalism fades; the galaxy, and partners they reject, feed it
  SW.caucusRadTick = function (Q, rf) {
    var gov = Q.govt_blocs || [], fd = Math.pow(SW.RAD_DECAY || 0.92, rf), live = !Q.finale && !Q.game_ending && !Q.sidious_defeated;
    var ws = Q.war && SW.warScore ? SW.warScore(Q) : 0;
    var push = {
      hawk: [['fear', Math.max(0, (Q.fear || 0) - 35) / 10], ['losing', Q.war ? (ws < 0 ? 2 : 0) + (ws <= -2 ? 2 : 0) : 0]],
      pacifist: [['weariness', Math.max(0, (Q.war_weariness || 0) - 30) / 10], ['powers', 0.4 * Math.min(8, Q.emergency_powers || 0)]],
      rimward: [['hardship', Math.max(0, (Q.rim_hardship || 0) - 40) / 10], ['secession', 3 * ((Q.outer_seceded || 0) + (Q.midrim_seceded || 0))]],
      inst: [['corruption', Math.max(0, (Q.corruption || 0) - 60) / 8], ['scandal', Q.scandal_ours_until > Q.date ? 2 : 0]]
    };
    for (var i = 0; i < SW.FACTIONS.length; i++) {
      var f = SW.FACTIONS[i];
      if (!SW.factionActive(Q, f)) { Q['rad_' + f] = 0; continue; }
      Q['rad_' + f] = (Q['rad_' + f] || 0) * fd;
      if (Q['rad_' + f] < 0.5) Q['rad_' + f] = 0;
      if (!live || !(Q.months_per_turn > 0)) continue;
      var P = push[f].slice().sort(function (a, b) { return b[1] - a[1]; });
      for (var k = 0; k < P.length; k++) if (P[k][1] > 0.05) SW.addCaucusRad(Q, f, P[k][1] * rf, P[k][1] >= 1 ? P[k][0] : '');
      if (Q.rc_in_govt) {
        var rej = (SW.CAUCUS_REJECTS[f] || []).filter(function (x) { return gov.indexOf(x) >= 0; });
        if (rej.length) SW.addCaucusRad(Q, f, 2 * rf, 'gov:' + rej[0]);
      }
    }
    SW.normCaucus(Q);
  };
  // a wing on the brink forces a congress: the most radical one, out of the lead or in it
  SW.caucusRevolt = function (Q) {
    var best = '', br = 79.999;
    for (var i = 0; i < SW.FACTIONS.length; i++) { var f = SW.FACTIONS[i]; if (SW.factionActive(Q, f) && (Q['rad_' + f] || 0) > br) { br = Q['rad_' + f]; best = f; } }
    return best;
  };
  // each wing puts up its strongest figure (its sitting leader keeps an edge)
  SW.caucusLeaderPick = function (Q, f) {
    var pool = SW.leaderPool(Q, f), best = Q[f + '_leader_id'], bs = -99;
    for (var i = 0; i < pool.length; i++) {
      var L = SW.LEADERS[pool[i]], r = 0.3;
      try { r = L.rise ? L.rise(Q) : 0.3; } catch (e) { r = 0.3; }
      r += pool[i] === Q[f + '_leader_id'] ? 0.15 : 0;
      if (r > bs) { bs = r; best = pool[i]; }
    }
    if (best && best !== Q[f + '_leader_id']) SW.setLeader(Q, f, best);
    return best;
  };
  // after our congress: a defeated wing, large, far from the winner and angry, may walk out
  SW.caucusWalkoutCheck = function (Q, winner, backed) {
    Q.caucus_walkout = ''; Q.caucus_walkout_go = 0;
    if (Q.finale || Q.game_ending || SW.off('splits')) return '';
    var sh = SW.caucusShares(Q), gov = Q.govt_blocs || [], pick = '', pa = 0;
    for (var f in sh) {
      if (f === winner) continue;
      var rt = SW.radTier ? (Q['rad_' + f] >= 80 ? 3 : Q['rad_' + f] >= 65 ? 2 : Q['rad_' + f] >= 35 ? 1 : 0) : 0;
      // only a wing that has turned radical walks out of our own congress
      if (rt < 1 || sh[f] < (rt >= 2 ? 12 : 20)) continue;
      var d = SW.ideoDistance(SW.FACTION_IDEO[f], SW.FACTION_IDEO[winner]);
      if (d < (rt >= 1 ? 0.1 : 0.2)) continue;
      var a = 1 + (Q.rc_in_govt && (SW.CAUCUS_REJECTS[f] || []).some(function (x) { return gov.indexOf(x) >= 0; }) ? 1 : 0) + (backed && backed === winner ? 1 : 0) +
        (d >= 0.35 ? 1 : 0) + (rt >= 1 ? 1 : 0) + (rt >= 2 ? 1 : 0);
      if (a < 2) continue;
      var chance = Math.min(0.95, 0.45 + 0.15 * (a - 2) + 0.1 * rt) * (f === 'inst' ? 0.3 : 1);
      if (SW.rnd() < chance && a > pa) { pa = a; pick = f; }
    }
    if (!pick) return '';
    Q.caucus_walkout = pick; Q.caucus_walkout_go = 1;
    Q.cw_winner = SW.FACTION_LABEL[winner]; Q.cw_grievance = SW.caucusGrievance(Q, pick) || ' ';
    return pick;
  };

  // our wings grow with what we do: a natural size, and what has lately happened to them
  SW.CAUCUS_BASE = {inst: 40, rimward: 25, pacifist: 20, hawk: 15};
  SW.CAUCUS_GROW = {
    hawk: function (Q) { return 0.04 * Math.min(6, Q.mil_invest || 0) + 0.15 * on(Q.chair_security === 'rc') + 0.45 * on(Q.war); },
    pacifist: function (Q) {
      return 0.15 * on((Q.jedi_relation || 0) >= 60) + 0.1 * on((Q.jedi_relation || 0) >= 75) + 0.06 * Math.min(4, Q.peace_talks || 0) +
        0.1 * on(Q.dooku_contact || Q.chan_ceasefire) + 0.04 * Math.min(5, Q.mil_cuts || 0) + 0.45 * on(Q.war);
    },
    rimward: function (Q) { return 0.04 * Math.min(8, Q.rim_card_acts || 0) + 0.25 * on(Q.rim_enfranchised) + 0.2 * on(Q.sentience_rights); },
    inst: function (Q) {
      return 0.06 * (on(Q.anti_corruption) + on(Q.integrity_office) + on(Q.senators_expelled) + on(Q.intel_oversight)) + 0.025 * Math.min(8, Q.emergency_powers || 0) +
        0.06 * (on(Q.emergency_sunset) + on(Q.term_limits_protected) + on(Q.constructive_vonc) + on(Q.independent_speaker) + on(Q.powers_review));
    }
  };
  // the moments that lift a wing at once (each counted once, as it happens)
  SW.CAUCUS_MOMENTS = [
    ['war', ['hawk', 6], ['pacifist', 6]], ['rim_enfranchised', ['rimward', 8]], ['sentience_rights', ['rimward', 8]],
    ['anti_corruption', ['inst', 3]], ['integrity_office', ['inst', 3]], ['senators_expelled', ['inst', 3]], ['intel_oversight', ['inst', 3]],
    ['emergency_sunset', ['inst', 3]], ['term_limits_protected', ['inst', 3]], ['constructive_vonc', ['inst', 3]], ['independent_speaker', ['inst', 3]], ['powers_review', ['inst', 3]]
  ];
  SW.caucusPush = function (Q, f, d) { if (SW.FACTIONS.indexOf(f) >= 0 && d) Q['cpush_' + f] = (Q['cpush_' + f] || 0) + d; };
  SW.caucusTargets = function (Q) {
    var raw = {}, sum = 0, t = {}, f;
    for (var i = 0; i < SW.FACTIONS.length; i++) {
      f = SW.FACTIONS[i];
      if (!SW.factionActive(Q, f)) continue;
      var g = 0;
      try { g = SW.CAUCUS_GROW[f](Q); } catch (e) { g = 0; }
      raw[f] = SW.CAUCUS_BASE[f] * Math.exp(2.5 * SW.clamp(isFinite(g) ? g : 0, -0.45, 1.4)); sum += raw[f];
    }
    var room = 0;
    for (f in raw) room += Q[f + '_strength'] || 0;
    for (f in raw) t[f] = room * raw[f] / (sum || 1);
    for (f in t) if (Q['cpush_' + f]) t[f] = Math.max(0.5, t[f] + Q['cpush_' + f]);
    return t;
  };
  // each quarter: changes our cards made become lingering pushes; moments push; strengths drift a fifth of the way
  SW.caucusWingTick = function (Q, rf) {
    var f, i;
    for (i = 0; i < SW.FACTIONS.length; i++) {
      f = SW.FACTIONS[i];
      var prev = Q['cstr_prev_' + f];
      if (typeof prev === 'number' && isFinite(prev) && prev >= 0 && Math.abs((Q[f + '_strength'] || 0) - prev) > 0.05) SW.caucusPush(Q, f, (Q[f + '_strength'] || 0) - prev);
    }
    for (i = 0; i < SW.CAUCUS_MOMENTS.length; i++) {
      var M = SW.CAUCUS_MOMENTS[i], k = M[0];
      if (Q[k] && !Q['cmom_' + k]) { Q['cmom_' + k] = 1; for (var j = 1; j < M.length; j++) SW.caucusPush(Q, M[j][0], M[j][1]); }
      else if (!Q[k] && Q['cmom_' + k]) Q['cmom_' + k] = 0;
    }
    // peace talks that open lift the Pacifists; each vote for emergency powers lifts the Hawks
    if ((Q.peace_talks || 0) > (Q.cmom_talks || 0)) { SW.caucusPush(Q, 'pacifist', 3 * Math.min(2, Q.peace_talks - (Q.cmom_talks || 0))); }
    Q.cmom_talks = Math.max(Q.cmom_talks || 0, Q.peace_talks || 0);
    if ((Q.rc_powers_votes || 0) > (Q.cmom_powers || 0)) { SW.caucusPush(Q, 'hawk', 4 * (Q.rc_powers_votes - (Q.cmom_powers || 0))); Q.cmom_powers = Q.rc_powers_votes; }
    if (Q.months_per_turn > 0 && !Q.finale) {
      var t = SW.caucusTargets(Q), kk = Math.min(1, 0.2 * rf);
      for (f in t) Q[f + '_strength'] = (Q[f + '_strength'] || 0) + (t[f] - (Q[f + '_strength'] || 0)) * kk;
    }
    for (i = 0; i < SW.FACTIONS.length; i++) {
      f = SW.FACTIONS[i];
      var v = Q['cpush_' + f];
      if (v) Q['cpush_' + f] = Math.abs(v) < 0.2 ? 0 : v * Math.pow(0.8, rf);
    }
    SW.normCaucus(Q);
    for (i = 0; i < SW.FACTIONS.length; i++) Q['cstr_prev_' + SW.FACTIONS[i]] = Q[SW.FACTIONS[i] + '_strength'];
  };

  // ------------------------------------------------------------------ our wings' roads to victory
  // While a wing leads the Caucus, its own card offers a road of three steps to a victory no other route gives.
  SW.ROADS = {
    inst: {name: 'The Constitutional Convention', ending: 'second_reformation'},
    rimward: {name: 'Bring the Rim Home', ending: 'republic_whole'},
    pacifist: {name: 'Stand Down the Armies', ending: 'long_peace'},
    hawk: {name: 'The Senate\'s Sword', ending: 'senate_sword'}
  };
  SW.roadWord = function (Q, f) {
    var n = Q['road_' + f] || 0;
    return n ? SW.ROADS[f].name + (n >= 3 ? ', complete' : ', ' + n + ' of 3') : '';
  };
  // the reforms a Convention can build on
  SW.INST_REFORMS = ['anti_corruption', 'integrity_office', 'senators_expelled', 'intel_oversight', 'emergency_sunset', 'term_limits_protected', 'constructive_vonc', 'independent_speaker', 'powers_review'];
  SW.instReforms = function (Q) { var n = 0; for (var i = 0; i < SW.INST_REFORMS.length; i++) if (Q[SW.INST_REFORMS[i]]) n++; return n; };
  SW.roadVote = function (Q, label, base, topics, need) {
    var v = SW.vote(Q, SW.stance(Q, base, true), 1, topics);
    Q.vote_html = SW.voteBanner(label, v, need || 50);
    return v >= (need || 50);
  };
  // the steps: each needs the one before, and the card's own conditions
  SW.roadStep = function (Q, f, step) {
    Q.road_ok = 0;
    if (Q['road_' + f] !== step - 1) return;
    var ok = 0;
    if (f === 'inst') {
      if (step === 1) { Q.capital -= 1; Q.senate_resolve += 1; Q.bureau_relation += 4; ok = 1; }
      if (step === 2) { Q.capital -= 2; ok = SW.roadVote(Q, 'The Second Ruusan Charter', {mod: 0.6, guild: 0.45, rim: 0.55, sec: 0.3, ind: 0.6, pal: 0.1, rfc: 0.6, cis: 0}, ['constitution', 'oversight', '-powers'], 60);
        if (ok) { Q.charter_passed = 1; Q.charter_lapse = Q.date + 24; } }
      if (step === 3) { Q.capital -= 1; ok = SW.roadVote(Q, 'Ratification by the member worlds', {mod: 0.6, guild: 0.4, rim: 0.6, sec: 0.35, ind: 0.65, pal: 0.1, rfc: 0.65, cis: 0}, ['constitution']);
        if (ok) { Q.charter_ratified = 1; Q.faith += 3; } }
    }
    if (f === 'rimward') {
      if (step === 1) { Q.capital -= 1; Q.rim_relation += 8; Q.rim_hardship -= 3; Q.outer_sep = Math.max(0, Q.outer_sep - 5); Q.midrim_sep = Math.max(0, Q.midrim_sep - 5); ok = 1; }
      if (step === 2) { Q.capital -= 2; ok = SW.roadVote(Q, 'The Rim Charter', {mod: 0.5, guild: 0.35, rim: 0.95, sec: 0.35, ind: 0.65, pal: 0.2, rfc: 0.95, cis: 0}, ['rim', 'representation']);
        if (ok) { Q.rim_charter = 1; Q.outer_sep = Math.max(0, Q.outer_sep - 10); Q.midrim_sep = Math.max(0, Q.midrim_sep - 10); } }
      if (step === 3) { Q.capital -= 1; Q.homecoming = 1; Q.homecoming_from = Q.date; ok = 1; }
    }
    if (f === 'pacifist') {
      if (step === 1) { Q.capital -= 1; Q.faith += 2; SW.momentum(Q, 0.5, 'the peace movement'); Q.peace_talks = (Q.peace_talks || 0) + 1; ok = 1; }
      if (step === 2) { Q.peace_talks = (Q.peace_talks || 0) + 1; Q.outer_sep = Math.max(0, Q.outer_sep - 3); Q.war_weariness = Math.max(0, Q.war_weariness - 3); ok = 1; }
      if (step === 3) { Q.capital -= 2; ok = SW.roadVote(Q, 'The Disarmament Accord', {mod: 0.55, guild: 0.6, rim: 0.6, sec: 0.15, ind: 0.75, pal: 0.1, rfc: 0.6, cis: 0}, ['peace', '-army']);
        if (ok) { Q.disarm_date = Q.date; Q.disarm_cap = Math.round((Q.clones || 0) * 5) / 10; Q.clones = Math.min(Q.clones || 0, Q.disarm_cap); } }
    }
    if (f === 'hawk') {
      if (step === 1) { Q.capital -= 1; Q.judicial_forces += 2; Q.navy_loyalty += 5; Q.mil_invest = (Q.mil_invest || 0) + 1; ok = 1; }
      if (step === 2) { Q.navy_loyalty += 10; Q.officer_oath = 1; ok = 1; }
      if (step === 3) { Q.capital -= 2; Q.sword_strike = 1; SW.chancellorArrest(Q); ok = 1; }
    }
    if (ok) Q['road_' + f] = step; else Q['road_wait_' + f] = Q.date + 12;
    Q.road_ok = ok ? 1 : 0;
    if (!(Q.turn_actions >= 1)) Q.turn_actions = 1;
  };
  // what the roads do over time
  SW.roadTick = function (Q, rf) {
    if (Q.finale || Q.game_ending) return;
    // the Charter: an emergency power lapses every two years unless the Senate renews it
    if (Q.charter_passed && Q.emergency_powers > 0 && Q.date >= (Q.charter_lapse || 0)) { Q.emergency_powers -= 1; Q.charter_lapse = Q.date + 24; Q.charter_lapsed = (Q.charter_lapsed || 0) + 1; }
    // the Homecoming: the seceded worlds come back, region by region, over a year
    if (Q.homecoming) {
      var regs = ['outer', 'midrim', 'corporate'];
      for (var i = 0; i < regs.length; i++) {
        var k = regs[i] + '_seceded', was = Q[k] || 0;
        if (was > 0) { Q[k] = Math.max(0, was - 0.08 * rf); if (was > 0.02 && Q[k] <= 0.02) { Q.worlds_home = (Q.worlds_home || 0) + 1; if (Q.war) Q.war_balance += 1; } }
      }
      Q.outer_sep = Math.max(0, Q.outer_sep - 2 * rf); Q.midrim_sep = Math.max(0, Q.midrim_sep - 2 * rf);
      if (!Q.war && !Q.geonosis_seen && (Q.sep_total || 0) < 20) Q.rim_home_peace = 1;
    }
    SW.roadEventTick(Q);
  };
  // the leading wing's road brings its own news: a chance, then a setback, every year or so
  SW.roadEventTick = function (Q) {
    var lead = SW.rcLead(Q);
    if (Q.road_event_ready && Q.road_event_ready.indexOf(lead + '_') !== 0) Q.road_event_ready = '';
    if (!lead || !(Q['road_' + lead] >= 1) || Q.road_event_ready || (Q.road_event_timer || 0) > 0) { Q.road_event_timer = Math.max(0, (Q.road_event_timer || 0) - 1); return; }
    Q.road_event_ready = lead + ((Q.road_events || 0) % 2 ? '_setback' : '_chance');
  };
  SW.roadEventDone = function (Q) { Q.road_events = (Q.road_events || 0) + 1; Q.road_event_ready = ''; Q.road_event_timer = 4 + Math.floor(SW.rnd() * 3); };
  // each leading wing's own use of the Chancellery
  SW.wingChancellery = function (Q, kind) {
    if (kind === 'review') { Q.w_review_done = 1; Q.emergency_powers = Math.max(0, Q.emergency_powers - 2); Q.evidence_public = (Q.evidence_public || 0) + 1; Q.faith += 2; }
    if (kind === 'councillors') {
      Q.w_council_done = 1; Q.rim_relation += 8; Q.outer_sep = Math.max(0, Q.outer_sep - 6); Q.midrim_sep = Math.max(0, Q.midrim_sep - 6);
      Q.rad_rimward = Math.max(0, (Q.rad_rimward || 0) - 10); Q.core_rc *= 0.97; if (SW.addRad) SW.addRad(Q, 'old_families', 8, 'xenos');
    }
    if (kind === 'navy') { Q.w_navy_done = 1; Q.navy_loyalty += 8; Q.sec_relation -= 5; Q.fear += 2; SW.addCaucusRad(Q, 'pacifist', 5, ''); if (SW.addRad) SW.addRad(Q, 'human_first', 8, 'command'); }
    if (!(Q.turn_actions >= 1)) Q.turn_actions = 1;
  };

  // each quarter: what the programme does
  SW.programmeTick = function (Q, rf) {
    var lead = SW.rcLead(Q);
    if (lead === 'inst' && (Q.rc_in_govt || Q.rc_chairs > 0)) Q.bureau_relation += 0.6 * rf;
    if (lead === 'rimward') { Q.rim_relation += 0.6 * rf; Q.guild_relation -= 0.4 * rf; if (Q.rc_in_govt || Q.rc_chairs > 0) Q.bureau_relation -= 0.5 * rf; }
    if (lead === 'pacifist' && Q.war) Q.rad_hawk += 0.6 * rf;
    if (lead === 'hawk' && Q.clones > 0) Q.navy_loyalty = Math.min(100, Q.navy_loyalty + 0.5 * rf);
    // the faction's own events
    if (lead && !Q.finale && !Q.game_ending && !(Q.lead_event_timer > 0) && Q.time >= 4) {
      var good = (Q.lead_events || 0) % 2 === 0;
      var ok = lead !== 'pacifist' || good || Q.war;
      if (ok) { Q.lead_event_ready = lead + (good ? '_good' : '_bad'); }
    }
  };
  SW.leadEventDone = function (Q) { Q.lead_event_ready = ''; Q.lead_events = (Q.lead_events || 0) + 1; Q.lead_event_timer = 4 + Math.floor(SW.rnd() * 3); };

  // ------------------------------------------------------------------ the Chancellor's Peace
  // a Pacifist-led Caucus holding the Chancellery in wartime can proclaim a ceasefire, call a peace conference and put a treaty to the Senate
  SW.chanPeaceOk = function (Q) { return !!(SW.rcLead(Q) === 'pacifist' && Q.rc_chancellor && Q.war && !Q.chan_ceasefire && !Q.finale && !Q.game_ending && !Q.peace_achieved); };
  SW.chanCeasefire = function (Q) {
    Q.chan_ceasefire = 1; Q.chan_peace_stage = 1; Q.chan_peace_timer = 2;
    Q.navy_loyalty -= 8; Q.rad_hawk += 10; Q.sec_relation -= 8; Q.war_weariness = Math.max(0, Q.war_weariness - 5);
    if (!(Q.turn_actions >= 1)) Q.turn_actions = 1;
  };
  SW.chanTreaty = function (Q) {
    var st = SW.stance(Q, {mod: 0.6, guild: 0.5, rim: 0.8, sec: 0.2, ind: 0.8, pal: 0.1, cis: 0.9, rfc: 0.8}, true);
    var lift = (Q.war_weariness - 25) / 120 + (Q.satine_friend ? 0.05 : 0) + (Q.dooku_turned ? 0.1 : 0);
    for (var b in st) st[b] = SW.clamp(st[b] + lift, 0, 1);
    Q.cp_vote = SW.vote(Q, st, 1, 'peace');
    Q.vote_html = SW.voteBanner('The Treaty of ' + (Q.satine_friend ? 'Mandalore' : 'Coruscant'), Q.cp_vote);
    Q.chan_peace_stage = 3;
    Q.cp_sabotaged = 0; Q.cp_passed = Q.cp_vote >= 50 ? 1 : 0;
    if (!Q.cp_passed) { Q.chan_ceasefire_failed = 1; Q.fear += 4; Q.war_weariness += 3; return; }
    if (SW.rnd() < SW.compactSabotage(Q)) { Q.cp_sabotaged = 1; Q.chan_ceasefire_failed = 1; Q.fear += 6; Q.war_weariness += 3; return; }
    Q.chancellors_peace = 1; Q.war = 0; Q.peace_achieved = 1;
    Q.outer_sep -= 20; Q.midrim_sep -= 15; Q.corporate_sep -= 15; Q.fear -= 10; Q.faith += 5;
  };

  // ------------------------------------------------------------------ walkouts and splinter parties
  // After a congress, a defeated wing that is large, far from the winner and angry may leave its bloc:
  // to join another bloc (or us), or to found a party of its own in the breakaway slot.
  // join: the bloc it joins; found: the party it founds; near: where a would-be founder goes if the slot is taken;
  // usJoin: the Caucus faction whose leadership brings it to us instead; rejects: partners it will not govern beside.
  SW.WALKOUT = {
    old_families: {join: 'pal', rejects: ['rim', 'rfc']},
    ruusan: {join: 'rc', faction: 'inst', rejects: ['pal']},
    establishment: {join: 'sec', rare: true, rejects: ['rim']},
    corporatists: {join: 'cis', rejects: []},
    confederates: {join: 'cis', rejects: ['rc', 'rim']},
    free_traders: {found: 'Free Commerce League', near: 'mod', rejects: ['pal']},
    radicals: {join: 'cis', rejects: ['mod', 'guild', 'sec']},
    rfc_radicals: {join: 'cis', rejects: ['guild']},
    human_first: {join: 'pal', rejects: ['rim', 'rfc', 'rc']},
    const_hawks: {found: 'Constitutional Defence League', near: 'mod', usJoin: 'hawk', faction: 'hawk', rejects: ['pal']},
    isolationists: {join: 'cis', rejects: ['pal', 'sec']},
    neutralists: {found: 'Council of Neutral Systems', near: 'rim', usJoin: 'pacifist', faction: 'pacifist', rejects: ['sec']},
    hutt_machine: {join: 'pal', rejects: []},
    mic: {join: 'pal', rejects: ['rfc']},
    law_order: {join: 'mod', rare: true, rejects: []}
  };
  SW.WALKOUT_MIN = 20;          // a wing needs this share of its bloc's delegates to walk out
  // where a walking-out wing would go, now: '' if nowhere
  SW.walkoutDest = function (Q, w) {
    var R = SW.WALKOUT[w];
    if (!R) return null;
    if (R.usJoin && SW.rcLead && SW.rcLead(Q) === R.usJoin) return {join: 'rc'};
    if (R.found) {
      if (!Q.rfc_formed && Q.parties.indexOf('rfc') < 0) return {found: R.found};
      return Q.parties.indexOf(R.near) >= 0 && R.near !== SW.WINGS[w].bloc ? {join: R.near} : null;
    }
    if (R.join === 'cis') return Q.dooku_movement ? {join: 'cis'} : null;
    if (R.join === 'pal' && (Q.pal_disgraced || Q.sidious_defeated)) return null;
    return R.join && (R.join === 'rc' || Q.parties.indexOf(R.join) >= 0) ? {join: R.join} : null;
  };
  // how angry a defeated wing is: it lost; its bloc sits in government beside partners it rejects; we backed its rival; it is far from the winner
  SW.walkoutAnger = function (Q, w, winner, backed) {
    var R = SW.WALKOUT[w] || {}, b = SW.WINGS[w].bloc, a = 1, gov = Q.govt_blocs || [];
    if (gov.indexOf(b) >= 0 && (R.rejects || []).some(function (x) { return gov.indexOf(x) >= 0; })) { a += 1; Q.wk_govt = 1; }
    if (backed && backed === winner) a += 1;
    var d = SW.ideoDistance(SW.wingIdeo(Q, w), SW.wingIdeo(Q, winner));
    if (d >= 0.35) a += 1;
    var rt = SW.radTier(Q, w);
    a += (rt >= 1 ? 1 : 0) + (rt >= 2 ? 1 : 0);
    return {anger: a, dist: d, rad: rt};
  };
  // after a congress: does a defeated wing walk out?
  SW.walkoutCheck = function (Q, b, winner, backed) {
    Q.walkout_ready = '';
    if (Q.finale || Q.game_ending) return '';
    var ws = SW.blocWings(Q, b), pick = '', pickA = 0;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      var rt = SW.radTier(Q, w);
      if (w === winner || !SW.WALKOUT[w] || SW.wingShare(Q, w) < (rt >= 2 ? 12 : SW.WALKOUT_MIN)) continue;
      Q.wk_govt = 0;
      var an = SW.walkoutAnger(Q, w, winner, backed);
      if (an.dist < (rt >= 1 ? 0.1 : 0.2) || an.anger < 2 || !SW.walkoutDest(Q, w)) continue;
      var chance = Math.min(0.95, 0.45 + 0.15 * (an.anger - 2) + 0.1 * rt) * (SW.WALKOUT[w].rare ? 0.3 : 1);
      if (SW.rnd() < chance && an.anger > pickA) { pick = w; pickA = an.anger; Q.wk_govt_w = Q.wk_govt; }
    }
    if (!pick) return '';
    var dest = SW.walkoutDest(Q, pick), c = SW.wingCandidate(Q, pick) || SW.WINGS[pick].leaders[0];
    Q.walkout_ready = pick;
    Q.wk_wing = pick; Q.wk_wing_name = SW.wingName(pick); Q.wk_bloc = b; Q.wk_bloc_name = SW.name(Q, b);
    Q.wk_leader = SW.LEADERS[c] ? SW.LEADERS[c].name : SW.wingName(pick); Q.wk_leader_id = c;
    Q.wk_winner = SW.wingName(winner); Q.wk_winner_leader = SW.LEADERS[SW.wingCandidate(Q, winner)] ? SW.LEADERS[SW.wingCandidate(Q, winner)].name : '';
    Q.wk_found = dest.found || ''; Q.wk_join = dest.join || '';
    Q.wk_join_name = dest.join === 'rc' ? 'the Ruusan Caucus' : (dest.join ? 'the ' + SW.name(Q, dest.join) : '');
    Q.wk_us = dest.join === 'rc' ? 1 : 0;
    Q.wk_cis = dest.join === 'cis' ? 1 : 0;
    var rej = (SW.WALKOUT[pick].rejects || []).filter(function (x) { return (Q.govt_blocs || []).indexOf(x) >= 0; });
    var rc0 = SW.radTier(Q, pick) >= 1 ? SW.radClauses(Q, pick) : '';
    Q.wk_grievance = (rc0 ? 'The ' + Q.wk_wing_name + ' have never forgiven the ' + Q.wk_bloc_name + ' for having ' + rc0 + '. ' : '') + (Q.wk_govt_w && rej.length ? 'And now the ' + Q.wk_bloc_name + (SW.blocPlural(Q, b) ? ' sit' : ' sits') + ' in government beside the ' + rej.map(function (x) { return x === 'rc' ? 'Ruusan Caucus' : SW.name(Q, x); }).join(' and the ') +
      ', a government the ' + Q.wk_wing_name + ' call a betrayal of everything the bloc stands for.' : 'Their delegates leave the hall convinced that the ' + Q.wk_bloc_name + (SW.blocPlural(Q, b) ? ' have' : ' has') + ' no room for them any more.');
    return pick;
  };
  // the walkout itself
  SW.doWalkout = function (Q) {
    var w = Q.walkout_ready;
    Q.walkout_ready = ''; Q.walkout_go = 0;
    if (!w || !SW.wingActive(Q, w)) return;
    var dest = SW.walkoutDest(Q, w);
    if (!dest) return;
    var R = SW.WALKOUT[w], b = SW.WINGS[w].bloc, share;
    if (dest.found) {
      // a new party in the breakaway slot, with the wing's leader at its head
      Q.rfc_formed = 1; Q.rfc_kind = w; Q.rfc_name = dest.found;
      if (Q.parties.indexOf('rfc') < 0) Q.parties.push('rfc');
      for (var r0 = 0; r0 < SW.REGIONS.length; r0++) Q[SW.REGIONS[r0] + '_rfc'] = Q[SW.REGIONS[r0] + '_rfc'] || 0;
      Q.rfc_leader_id = Q.wk_leader_id; Q.rfc_leader = Q.wk_leader;
      Q.rfc_relation = SW.clamp((Q[b + '_relation'] || 35) + 5, 0, 100); Q.rfc_relation_prev = Q.rfc_relation;
      share = SW.wingLeaves(Q, w, 'rfc');
      Q.splinters = (Q.splinters || 0) + 1;
    } else {
      share = SW.wingLeaves(Q, w, dest.join === 'rc' ? 'rc' : dest.join);
      if (dest.join === 'rc' && R.faction) { Q[R.faction + '_strength'] = (Q[R.faction + '_strength'] || 0) + Math.round(share * 60); Q['rad_' + R.faction] = Math.max(0, (Q['rad_' + R.faction] || 0) - 5); }
    }
    Q.walkouts = (Q.walkouts || 0) + 1;
    Q['walked_' + w] = dest.found ? 'found' : dest.join;
    Q['rad_' + w] = 0;
    Q[b + '_relation'] = (Q[b + '_relation'] || 0) - (dest.join === 'rc' ? 8 : 0);
    SW.computeSupport(Q);
  };
  // a breakaway party that is a wing's: it votes and governs by that wing's ideology, under its bloc's baseline
  SW.splinterWing = function (Q) { return Q.rfc_kind && SW.WINGS[Q.rfc_kind] ? Q.rfc_kind : ''; };

  // the wing whose walkout would serve Palpatine or Dooku best, for his agitators: the most radical, then the largest
  SW.stokeTarget = function (Q) {
    var best = '', bs = -1;
    for (var w in SW.WINGS) {
      var b = SW.WINGS[w].bloc;
      if (b === 'pal' || !SW.wingActive(Q, w) || !SW.hasWings(Q, b) || w === Q[b + '_wing']) continue;
      var d = SW.walkoutDest(Q, w);
      if (!d || (d.join !== 'pal' && d.join !== 'cis')) continue;
      var sc = (Q['rad_' + w] || 0) + SW.wingShare(Q, w) / 10;
      if (sc > bs) { bs = sc; best = w; }
    }
    return best;
  };
  // the guilds, at the end of their patience, pay for the wing at another bloc's congress most opposed to regulation, trade taxes and the ethics laws
  SW.guildBankroll = function (Q, b) {
    if (['guild', 'pal', 'rc', 'cis'].indexOf(b) >= 0 || Q.finale || !(Q.guild_patience < 35) || !SW.guildEscalates(Q) || (Q.parties || []).indexOf('guild') < 0) return '';
    var ws = SW.blocWings(Q, b), best = '', bs = 0.05;
    for (var i = 0; i < ws.length; i++) {
      if (!SW.wingCandidate(Q, ws[i])) continue;
      var sc = -(SW.wingOwnView(ws[i], 'regulate') + SW.wingOwnView(ws[i], 'trade_tax') + SW.wingOwnView(ws[i], 'corruption'));
      if (sc > bs) { bs = sc; best = ws[i]; }
    }
    return best;
  };

  // ------------------------------------------------------------------ radicalism
  // A wing grows radical when its own bloc backs what it opposes: in a Senate vote, in the budget, through the bloc's own
  // ministers, or by governing beside a partner the wing rejects. Radicalism never wins a wing delegates. It makes the
  // wing far likelier to walk out after a congress it loses, and on the brink it forces a congress of its own.
  SW.RAD_TIERS = [35, 65, 80];
  SW.RAD_WORDS = ['restless', 'furious', 'on the brink'];
  SW.RAD_DECAY = 0.92;          // per quarter
  SW.RAD_CRISIS_GAP = 18;       // months between the crisis congresses one bloc's radicals can force
  SW.radTier = function (Q, w) { var r = Q['rad_' + w] || 0; return r >= SW.RAD_TIERS[2] ? 3 : (r >= SW.RAD_TIERS[1] ? 2 : (r >= SW.RAD_TIERS[0] ? 1 : 0)); };
  // what backing a topic (or, with '-', opposing it) looks like to the wing that resents it
  SW.TOPIC_PHRASES = {
    rim: ['help for the Rim', 'cuts to the Rim'], slavery: ['the slavery ban', 'leaving slavery alone'],
    xenos: ['rights for aliens', 'the human-first agenda'], representation: ['seats for the Rim', 'taking the Rim\'s seats away'],
    corruption: ['the ethics laws', 'cover for the corrupt'], centralise: ['more power for Coruscant', 'less power for Coruscant'],
    powers: ['more power for the Chancellor', 'curbs on the Chancellor'], constitution: ['constitutional reform', 'undoing the constitution\'s checks'],
    command: ['putting the army under the Senate', 'freeing the army from the Senate'], oversight: ['more oversight', 'less oversight'],
    trade_tax: ['taxes on trade', 'tax breaks for the guilds'], core_tax: ['taxes on the Core', 'tax breaks for the Core'],
    regulate: ['regulating the guilds', 'deregulating the guilds'], army: ['a bigger army', 'cuts to the army'], peace: ['peace talks', 'the war']
  };
  SW.topicPhrase = function (t) {
    var neg = t.charAt(0) === '-', k = neg ? t.slice(1) : t, P = SW.TOPIC_PHRASES[k];
    return P ? P[neg ? 1 : 0] : '';
  };
  // a wing's own view on a topic: its own views and its figure's (its bloc's baseline is shared by all its wings)
  SW.wingOwnView = function (w, tp) {
    var W = SW.WINGS[w], v = (SW.WING_VIEWS[w] || {})[tp] || 0, L = W ? SW.LEADERS[W.leaders[0]] : null;
    return v + ((L && L.views && L.views[tp]) || 0);
  };
  SW.addRad = function (Q, w, gain, why) {
    if (!SW.WINGS[w] || !(gain > 0)) return;
    Q['rad_' + w] = SW.clamp((Q['rad_' + w] || 0) + gain, 0, 100);
    if (why && Q['rad_why_' + w] !== why) { Q['rad_why2_' + w] = Q['rad_why_' + w] || ''; Q['rad_why_' + w] = why; }
  };
  // bloc b has backed these topics (signed, e.g. '-powers'), with strength 0..1: the wings that oppose them grow radical
  SW.radicalise = function (Q, b, topics, strength) {
    if (!b || b === 'rc' || b === 'cis' || !SW.hasWings(Q, b) || !topics || !topics.length || !(strength > 0)) return;
    if (Q.finale || Q.game_ending || Q.sidious_defeated) return;
    var ws = SW.blocWings(Q, b);
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i], o = 0, worst = '', wv = 0;
      for (var t = 0; t < topics.length; t++) {
        var tp = topics[t], sg = 1;
        if (!tp) continue;
        if (tp.charAt(0) === '-') { sg = -1; tp = tp.slice(1); }
        var v = sg * SW.wingOwnView(w, tp);
        o += v;
        if (v < wv && SW.topicPhrase(topics[t])) { wv = v; worst = topics[t]; }
      }
      if (o > -0.1) continue;
      SW.addRad(Q, w, Math.min(15, 60 * -o * strength), worst);
    }
  };
  // what a radical wing holds against its bloc, as a clause after "has" or "for having": e.g. "backed rights for aliens and taxes on the Core"
  SW.radClauses = function (Q, w) {
    var whys = [Q['rad_why_' + w], Q['rad_why2_' + w]].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var backs = [], gov = [];
    for (var i = 0; i < whys.length; i++) {
      if (whys[i].indexOf('gov:') === 0) { var g = whys[i].slice(4); if (Q.parties.indexOf(g) >= 0 || g === 'rc') gov.push(g === 'rc' ? 'the Ruusan Caucus' : 'the ' + SW.name(Q, g)); }
      else if (SW.topicPhrase(whys[i])) backs.push(SW.topicPhrase(whys[i]));
    }
    var c = [];
    if (backs.length) c.push('backed ' + backs.join(' and '));
    if (gov.length) c.push('gone into government beside ' + gov.join(' and '));
    return c.join(' and ');
  };
  // where a wing on the brink would go, in a sentence for the unrest event
  SW.radDestNote = function (Q, w) {
    var d = SW.walkoutDest(Q, w), c = SW.wingCandidate(Q, w) || SW.WINGS[w].leaders[0], who = SW.LEADERS[c] ? SW.LEADERS[c].name : 'Their leaders';
    if (!d) return '';
    if (d.found) return 'There is talk of founding a party of their own, the ' + d.found + '.';
    if (d.join === 'rc') return who + ' has been asking what the Ruusan Caucus would offer them.';
    if (d.join === 'cis') return 'Dooku\'s agents are courting them openly.';
    if (d.join === 'pal') return who + ' has been seen dining with Palpatine\'s people.';
    return 'The ' + SW.name(Q, d.join) + ' have quietly offered them a home.';
  };
  // a wing on the brink, out of power and with somewhere to go, can force its bloc into a congress
  SW.radRevolt = function (Q, b) {
    if (b === 'pal' || !SW.hasWings(Q, b) || Q.date < (Q[b + '_congress_hold'] || -99) || Q.date < (Q[b + '_rad_crisis'] || -99)) return '';
    var ws = SW.blocWings(Q, b), best = '', br = 0;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (w === Q[b + '_wing'] || SW.radTier(Q, w) < 3 || !SW.walkoutDest(Q, w) || !SW.wingCandidate(Q, w)) continue;
      if (Q['rad_' + w] > br) { br = Q['rad_' + w]; best = w; }
    }
    return best;
  };
  // each quarter: radicalism fades; partners a wing rejects feed it; a wing newly furious is news
  SW.radTick = function (Q, rf) {
    var gov = Q.govt_blocs || [], f = Math.pow(SW.RAD_DECAY, rf);
    for (var w in SW.WINGS) {
      if (!(Q['rad_' + w] > 0) && !SW.WALKOUT[w]) continue;
      if (!SW.wingActive(Q, w)) { Q['rad_' + w] = 0; continue; }
      Q['rad_' + w] = (Q['rad_' + w] || 0) * f;
      if (Q['rad_' + w] < 0.5) Q['rad_' + w] = 0;
      var R = SW.WALKOUT[w], b = SW.WINGS[w].bloc;
      if (R && gov.indexOf(b) >= 0 && !Q.finale) {
        var rej = (R.rejects || []).filter(function (x) { return gov.indexOf(x) >= 0; });
        if (rej.length) SW.addRad(Q, w, 3 * rf, 'gov:' + rej[0]);
      }
    }
    if (Q.unrest_go || Q.finale || Q.game_ending) return;
    var pick = '', pr = 0;
    for (var x in SW.WINGS) {
      if (!SW.wingActive(Q, x) || !SW.hasWings(Q, SW.WINGS[x].bloc) || SW.radTier(Q, x) < 2 || Q.date < (Q['rad_warned_' + x] || -99) + 12 || !SW.radClauses(Q, x)) continue;
      if (Q['rad_' + x] > pr) { pr = Q['rad_' + x]; pick = x; }
    }
    if (!pick) return;
    var bb = SW.WINGS[pick].bloc, pl = SW.blocPlural(Q, bb), note = SW.radDestNote(Q, pick);
    Q['rad_warned_' + pick] = Q.date;
    Q.unrest_go = 1; Q.unrest_events = (Q.unrest_events || 0) + 1;
    Q.unrest_wing = pick; Q.unrest_wing_name = SW.wingName(pick); Q.unrest_bloc_name = SW.name(Q, bb);
    Q.unrest_mood = SW.radTier(Q, pick) >= 3 ? 'on the brink' : 'furious';
    Q.unrest_title = SW.radTier(Q, pick) >= 3 ? 'The ' + SW.wingName(pick) + ' on the Brink' : 'Rumblings among the ' + SW.wingName(pick);
    Q.unrest_grievance = 'They cannot forgive the ' + Q.unrest_bloc_name + ' for having ' + SW.radClauses(Q, pick) + '.';
    Q.unrest_dest = note || ' '; Q.unrest_has_dest = note ? 1 : 0;
  };

  // ------------------------------------------------------------------ support / seats
  SW.computeSupport = function (Q) {
    var parties = Q.parties;
    var totalWeight = 0;
    var support = {};
    for (var p = 0; p < parties.length; p++) support[parties[p]] = 0;
    // each bloc's wings pull its support toward the regions they come from
    var pull = {};
    for (var pp = 0; pp < parties.length; pp++) {
      for (var rr = 0; rr < SW.REGIONS.length; rr++) { var kk = SW.REGIONS[rr] + '_' + parties[pp]; if (!(Q[kk] > 0)) Q[kk] = 0; }
      pull[parties[pp]] = parties[pp] === 'rc' ? (SW.rcPull ? SW.rcPull(Q) : null) : (SW.wingPull ? SW.wingPull(Q, parties[pp]) : null);
    }
    for (var i = 0; i < SW.REGIONS.length; i++) {
      var r = SW.REGIONS[i];
      var sum = 0, eff = {};
      for (var a = 0; a < parties.length; a++) {
        var pf = pull[parties[a]];
        eff[parties[a]] = Q[r + '_' + parties[a]] * (pf ? pf[r] : 1);
        sum += eff[parties[a]];
      }
      if (sum <= 0) continue;
      var w = Q[r] > 0 ? Q[r] : 0;
      totalWeight += w;
      for (var b = 0; b < parties.length; b++) {
        var k2 = r + '_' + parties[b];
        Q[k2 + '_share'] = Math.round(100 * eff[parties[b]] / sum);
        support[parties[b]] += w * eff[parties[b]] / sum;
      }
    }
    if (totalWeight <= 0) totalWeight = 1;
    for (var c = 0; c < SW.BLOCS.length; c++) {
      var bl = SW.BLOCS[c];
      Q[bl + '_votes'] = support[bl] !== undefined ? SW.round1(100 * support[bl] / totalWeight) : 0;
    }
    Q.senate_size = Math.round(totalWeight * 20);   // ~2000 delegations at the start
  };

  // A new session: delegations re-align, seats = current alignment.
  SW.senateSession = function (Q, silent) {
    SW.computeSupport(Q);
    var rec = {t: Q.date};
    for (var i = 0; i < SW.BLOCS.length; i++) {
      var b = SW.BLOCS[i];
      var inSenate = Q.parties.indexOf(b) >= 0;
      Q[b + '_old_r'] = Q[b + '_r'] || 0;
      Q[b + '_r'] = inSenate ? Q[b + '_votes'] : 0;
      Q[b + '_seats'] = Math.round(Q[b + '_r'] * Q.senate_size / 100);
      if (inSenate) rec[b] = Q[b + '_r'];
      if (inSenate && !silent && Q[b + '_old_r'] - Q[b + '_r'] >= 4 && SW.hasWings(Q, b)) SW.callCongress(Q, b, 'crisis');
    }
    Q.last_session_bby = Q.bby;
    Q.new_session = 0;
    if (!Q.senate_records) Q.senate_records = [];
    Q.senate_records.push(rec);
    SW.recomputeGovt(Q);
  };

  SW.seats = function (Q, blocs) {
    var s = 0;
    for (var i = 0; i < blocs.length; i++) s += Q[blocs[i] + '_r'] || 0;
    return SW.round1(s);
  };

  SW.parliamentData = function (Q) {
    var order = ['rfc', 'rim', 'cis', 'rc', 'ind', 'mod', 'guild', 'pal', 'sec'];
    var data = [];
    for (var i = 0; i < order.length; i++) {
      var b = order[i];
      var seats = Math.round((Q[b + '_r'] || 0) * 2);   // 200-seat diagram
      if (seats > 0) data.push({id: b, legend: SW.name(Q, b), name: SW.name(Q, b), seats: seats, color: SW.color(b)});
    }
    return data;
  };

  // ------------------------------------------------------------------ government
  SW.setGovt = function (Q, blocs, name) {
    var prev = Q.govt_blocs || [];
    // was every newly seated partner willing to sit with the others at the moment the government formed? (checked by the simulator)
    var seated = blocs.filter(function (b) { return b !== 'rc' || Q.chancellor_bloc === 'rc'; });
    Q.govt_bad_pair = (!Q.el_deal_won && prev.length && blocs.some(function (a) {
      return prev.indexOf(a) < 0 && seated.indexOf(a) >= 0 && seated.some(function (m) { return m !== a && !SW.relOk(Q, a, m); });
    })) ? 1 : 0;
    // partners who newly govern together warm to one another
    for (var gi = 0; gi < blocs.length; gi++) for (var gj = gi + 1; gj < blocs.length; gj++)
      if (!(prev.indexOf(blocs[gi]) >= 0 && prev.indexOf(blocs[gj]) >= 0)) SW.relAdd(Q, blocs[gi], blocs[gj], 3);
    Q.govt_blocs = blocs.slice();
    for (var i = 0; i < SW.BLOCS.length; i++) Q[SW.BLOCS[i] + '_in_govt'] = blocs.indexOf(SW.BLOCS[i]) >= 0 ? 1 : 0;
    Q.rc_in_govt = Q.rc_in_govt_flag = blocs.indexOf('rc') >= 0 ? 1 : 0;
    Q.coalition_name = name || SW.coalitionName(Q, blocs);
    Q.coalition_dissent = 0;
    SW.recomputeGovt(Q);
  };

  // A partner that brings down a Caucus government will not serve with the Caucus again for a while.
  SW.walkout = function (Q, months, bloc) {
    if (!bloc) {
      var partners = (Q.govt_blocs || []).filter(function (b) { return b !== 'rc'; });
      partners.sort(function (a, b) { return (Q[a + '_relation'] || 0) - (Q[b + '_relation'] || 0); });
      bloc = partners[0] || Q.strain_bloc || '';
    }
    if (!bloc || bloc === 'rc') return '';
    Q.walkout_bloc = bloc;
    Q.walkout_until = Q.date + (months || 24);
    Q.walkout_name = SW.name(Q, bloc);
    Q[bloc + '_relation'] = (Q[bloc + '_relation'] || 0) - 10;
    Q[bloc + '_grudge'] = (Q[bloc + '_grudge'] || 0) + 1.5;
    return bloc;
  };

  SW.recomputeGovt = function (Q) {
    var blocs = Q.govt_blocs || [];
    // drop blocs that left the senate
    blocs = blocs.filter(function (b) { return Q.parties.indexOf(b) >= 0; });
    Q.govt_blocs = blocs;
    Q.govt_seats = SW.seats(Q, blocs);
    Q.minority_govt = Q.govt_seats < 50 ? 1 : 0;
    Q.rc_in_govt = blocs.indexOf('rc') >= 0 ? 1 : 0;
    Q.rc_chancellor = Q.chancellor_bloc === 'rc' ? 1 : 0;
    Q.pal_chancellor = Q.chancellor === 'Palpatine' ? 1 : 0;
    Q.puppet_chancellor = (Q.chancellor_bloc === 'pal' && Q.chancellor !== 'Palpatine') ? 1 : 0;
    var chairs = 0;
    for (var i = 0; i < SW.COMMITTEES.length; i++) if (Q['chair_' + SW.COMMITTEES[i]] === 'rc') chairs++;
    Q.rc_chairs = chairs;
    Q.rc_has_access = (Q.rc_in_govt || chairs > 0) ? 1 : 0;
    SW.palStrings(Q);
  };
  // "the Core Moderates and the Independents"
  SW.listNames = function (Q, blocs) {
    var n = (blocs || []).map(function (b) { return 'the ' + SW.name(Q, b); });
    return n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  };
  // A Caucus minority government leans on blocs outside it: the friendliest first, until together they hold a majority.
  SW.minoritySupporters = function (Q, govt) {
    govt = govt || Q.govt_blocs || [];
    var pool = (Q.parties || []).filter(function (b) {
      return b !== 'rc' && b !== 'cis' && govt.indexOf(b) < 0 && SW.relOk(Q, 'rc', b) && !(b === Q.walkout_bloc && Q.date < (Q.walkout_until || -99));
    });
    pool.sort(function (a, b) { return SW.rel(Q, 'rc', b) - SW.rel(Q, 'rc', a); });
    var sup = [];
    for (var i = 0; i < pool.length && SW.seats(Q, govt.concat(sup)) < 50; i++) sup.push(pool[i]);
    return sup;
  };
  SW.isCaucusMinority = function (Q) { return !!(Q.rc_chancellor && Q.rc_in_govt && Q.minority_govt); };
  // Keep the supporters while they last; the threshold a government falls at; the mood word it shows.
  SW.syncSupporters = function (Q) {
    if (SW.isCaucusMinority(Q)) {
      var had = Q.minority_support || [];
      var cur = had.filter(function (b) { return Q.parties.indexOf(b) >= 0 && (Q.govt_blocs || []).indexOf(b) < 0; });
      if (!cur.length || cur.length !== had.length) cur = SW.minoritySupporters(Q);
      Q.minority_support = cur;
    } else Q.minority_support = [];
    Q.minority_support_names = SW.listNames(Q, Q.minority_support); Q.minority_support_n = Q.minority_support.length;
    Q.collapse_at = SW.isCaucusMinority(Q) ? 3 : 4;
    Q.coalition_mood_v = (Q.coalition_dissent || 0) + (4 - Q.collapse_at);
  };
  // Whoever a minority government loses first: the least friendly of its partners and supporters.
  SW.minorityLeaver = function (Q) {
    var s = (Q.govt_blocs || []).filter(function (b) { return b !== 'rc'; }).concat(Q.minority_support || []);
    s.sort(function (a, b) { return SW.rel(Q, 'rc', a) - SW.rel(Q, 'rc', b); });
    return s[0] || '';
  };

  SW.coalitionName = function (Q, blocs) {
    var has = function (b) { return blocs.indexOf(b) >= 0; };
    if (has('rc')) {
      if (has('mod') && has('rim') && has('sec')) return 'Unity Government';
      if (has('mod') && has('guild')) return 'Grand Concord';
      if (has('rim') && !has('mod')) return 'Rimward Compact';
      if (has('mod')) return 'Reform Concord';
      if (has('pal')) return Q && Q.chancellor_bloc === 'pal' ? 'Chancellor\'s Coalition' : 'Naboo Compact';
      return 'Caucus Government';
    }
    if (has('pal') && has('sec')) return 'Security Coalition';
    if (has('mod') && has('guild')) return 'Commerce Coalition';
    // a short adjective for the leading bloc: "the Moderate-led Coalition", "the Security Government"
    var lead = blocs[0] || 'mod';
    var palAdj = Q && Q.chancellor_bloc === 'pal' ? 'Chancellor\'s' : 'Chommell';
    var adj = {mod: 'Moderate', rim: 'Rimward', sec: 'Security', ind: 'Independent', guild: 'Commerce', rfc: 'Rim Freedom', cis: 'Separatist', pal: palAdj}[lead] || 'Senate';
    if (blocs.length <= 1) return adj + ' Government';
    return lead === 'pal' ? palAdj + ' Coalition' : adj + '-led Coalition';
  };

  // affinity of bloc a towards bloc b (dynamic)
  SW.affinity = function (Q, a, b) {
    var base = (SW.AFFINITY[a] && SW.AFFINITY[a][b] !== undefined) ? SW.AFFINITY[a][b] : 20;
    if (Q.rfc_kind && Q.rfc_kind !== 'rimward' && (a === 'rfc' || b === 'rfc') && a !== b) {
      var pa = a === 'rfc' ? SW.RFC_PROXY[Q.rfc_kind] : a, pb = b === 'rfc' ? SW.RFC_PROXY[Q.rfc_kind] : b;
      base = (a === 'rc' || b === 'rc') ? 55 : ((SW.AFFINITY[pa] && SW.AFFINITY[pa][pb] !== undefined) ? SW.AFFINITY[pa][pb] : 20);
    }
    if (b === 'rc' && a !== 'rc') base += ((Q[a + '_relation'] || 30) - 40) * 0.8;
    if (a === 'rc' && b !== 'rc') base += ((Q[b + '_relation'] || 30) - 40) * 0.5;
    if (b === 'pal' && a !== 'pal') {
      base += (Q.corruption - 55) * 0.4 + (Q.fear - 30) * 0.4 + Q.grand_plan * 0.15 - Q.evidence_public * 6;
      if (Q.naboo_sympathy) base += 15;
    }
    if (b === 'mod' && Q.valorum_scandal && Q.mod_leader === 'Finis Valorum') base -= 15;
    if (Q['bonus_' + a + '_for_' + b]) base += Q['bonus_' + a + '_for_' + b];
    if (a !== b) {
      var La = SW.leader(Q, a);
      base += ((La.likes && La.likes[b]) || 0) + (0.5 - SW.firm(Q, a)) * 16;
      if (SW.leaderRefuses(Q, a, b)) base -= 20;
    }
    // incumbency: partners stick with a Chancellor who has governed well
    if (Q.el_active && b === Q.chancellor_bloc && Q.elections_held > 0) {
      var record = (Q.faith - 52) * 0.9 + (58 - Q.corruption) * 0.35 - Q.coalition_dissent * 3 - (Q.war && Q.war_balance < 0 ? 6 : 0);
      base += ((Q.govt_blocs || []).indexOf(a) >= 0 ? 10 : (record > 0 ? 3 : 0)) + record;
    }
    return base;
  };

  // Chancellor election: each bloc backs the candidate it likes most.
  // opts.exact: no noise (a reliable whip count); opts.fog: the fixed errors of a rough count; opts.seatKey: '_r' or '_votes'
  SW.runElection = function (Q, candidates, opts) {
    opts = opts || {};
    var sk = opts.seatKey || '_r';
    var tally = {}, votes = {};
    for (var c = 0; c < candidates.length; c++) tally[candidates[c]] = 0;
    for (var i = 0; i < Q.parties.length; i++) {
      var bloc = Q.parties[i];
      var seats = Q[bloc + sk] || 0;
      // a bloc with a candidate votes for itself
      if (candidates.indexOf(bloc) >= 0) { tally[bloc] += seats; votes[bloc] = {to: bloc, own: 1}; continue; }
      // the Caucus follows its endorsement
      if (bloc === 'rc' && Q.el_backing && candidates.indexOf(Q.el_backing) >= 0) { tally[Q.el_backing] += seats; votes[bloc] = {to: Q.el_backing, own: 1}; continue; }
      var best = null, bestV = -999, second = null, secondV = -999;
      for (var k = 0; k < candidates.length; k++) {
        var noise = opts.exact ? 0 : (opts.fog ? SW.whipFog(Q, bloc, candidates[k]) : SW.rnd() * 10 - 5);
        var v = SW.affinity(Q, bloc, candidates[k]) + ((Q[candidates[k] + sk] || 0) - 12) * 0.8 + noise;
        if (v > bestV) { second = best; secondV = bestV; best = candidates[k]; bestV = v; }
        else if (v > secondV) { second = candidates[k]; secondV = v; }
      }
      // close preferences split the bloc
      if (second && bestV - secondV < 8) {
        tally[best] += seats * 0.6; tally[second] += seats * 0.4;
        votes[bloc] = {to: best, alt: second};
      } else {
        tally[best] += seats;
        votes[bloc] = {to: best};
      }
    }
    SW._lastVotes = votes;
    var result = [];
    for (var cand in tally) result.push({bloc: cand, share: SW.round1(tally[cand])});
    result.sort(function (x, y) { return y.share - x.share; });
    return result;
  };

  // Winner (not rc) assembles a coalition by affinity. Returns array of blocs.
  // A Chancellor builds a coalition in order of their relationship with each party, until it holds a majority.
  // No one joins who would sit with a bloc they are too cold toward (each leader sets the bar: SW.joinMin).
  SW.formCoalitionAuto = function (Q, leader, allowRc, exclude) {
    var members = [leader];
    var seats = Q[leader + '_r'] || 0;
    var others = Q.parties.filter(function (b) { return b !== leader && (allowRc || b !== 'rc') && b !== 'cis' && (!exclude || exclude.indexOf(b) < 0); });
    others.sort(function (a, b) { return SW.rel(Q, leader, b) - SW.rel(Q, leader, a); });
    for (var i = 0; i < others.length && seats < 50; i++) {
      var o = others[i], ok = true;
      for (var m = 0; m < members.length; m++) if (!SW.relOk(Q, members[m], o)) { ok = false; break; }
      if (!ok || SW.coalitionBlock(Q, members.concat([o]))) continue;
      members.push(o);
      seats += Q[o + '_r'] || 0;
    }
    return members;
  };

  // Options for an rc-led coalition: list of {name, blocs, seats, ok}
  SW.rcCoalitionOptions = function (Q) {
    var combos = [
      ['rc', 'mod', 'ind'], ['rc', 'rim', 'ind'], ['rc', 'mod', 'guild', 'ind'],
      ['rc', 'mod', 'rim', 'ind'], ['rc', 'mod', 'rim', 'sec', 'ind'], ['rc', 'rfc', 'rim', 'ind'],
      ['rc', 'mod', 'sec', 'ind']
    ];
    var out = [];
    for (var i = 0; i < combos.length; i++) {
      var bl = combos[i].filter(function (b) { return Q.parties.indexOf(b) >= 0; });
      if (bl.length < 2) continue;
      var minRel = 100;
      for (var j = 1; j < bl.length; j++) minRel = Math.min(minRel, Q[bl[j] + '_relation'] || 0);
      var cp = SW.coldPair(Q, bl);
      out.push({name: SW.coalitionName(Q, bl), blocs: bl, seats: SW.seats(Q, bl), minRel: minRel, cold: cp ? SW.coldPairText(Q, cp) : '', coldPair: cp, block: SW.coalitionBlock(Q, bl)});
    }
    // the coalition the Caucus would build in order of its own relations, if it is new and reaches a majority
    var gen = SW.formCoalitionAuto(Q, 'rc', true);
    var genKey = gen.slice().sort().join(',');
    var dup = out.some(function (o) { return o.blocs.slice().sort().join(',') === genKey; });
    if (gen.length >= 2 && !dup && SW.seats(Q, gen) >= 50) out.push({name: SW.coalitionName(Q, gen), blocs: gen, seats: SW.seats(Q, gen), minRel: 0, cold: '', coldPair: null, block: '', generated: 1});
    return out;
  };

  // Hand out committee chairs that the player did not take.
  // which partner each committee goes to, in order of preference
  SW.CHAIR_PREFS = {finance: ['guild', 'mod', 'ind', 'pal', 'sec', 'rim'], judiciary: ['mod', 'pal', 'ind', 'sec', 'rim', 'guild'],
    security: ['sec', 'pal', 'mod', 'ind', 'guild', 'rim'], rimaffairs: ['rim', 'ind', 'mod', 'pal', 'guild', 'sec'],
    constitution: ['mod', 'ind', 'pal', 'sec', 'guild', 'rim'], jedi: ['mod', 'ind', 'rim', 'sec', 'pal', 'guild']};
  SW.assignChairs = function (Q) {
    var partners = Q.govt_blocs.filter(function (b) { return b !== 'rc'; });
    if (!partners.length) partners = ['ind'];
    var prefs = SW.CHAIR_PREFS;
    for (var i = 0; i < SW.COMMITTEES.length; i++) {
      var c = SW.COMMITTEES[i];
      if (Q['chair_' + c] === 'rc' && Q.rc_in_govt) continue;
      // a chair promised to a partner in coalition talks stays with it
      if (Q['chair_res_' + c] && Q['chair_' + c] && Q['chair_' + c] !== 'rc' && partners.indexOf(Q['chair_' + c]) >= 0) continue;
      var pick = partners[0];
      var pl = prefs[c];
      for (var k = 0; k < pl.length; k++) if (partners.indexOf(pl[k]) >= 0) { pick = pl[k]; break; }
      Q['chair_' + c] = pick;
    }
    SW.recomputeGovt(Q);
  };


  // ------------------------------------------------------------------ ministers
  // Each committee chair is held by a named senator of the bloc that holds it. The Caucus chooses its own;
  // other blocs appoint the first of theirs not already chairing a committee.
  SW.MINISTERS = {
    // the Caucus's own
    organa: {name: 'Bail Organa', world: 'Alderaan', bloc: 'rc', faction: 'inst'},
    amidala: {name: 'Padmé Amidala', world: 'Naboo', bloc: 'rc', faction: 'inst'},
    breemu: {name: 'Bana Breemu', world: 'Humbarine', bloc: 'rc', faction: 'inst'},
    mothma: {name: 'Mon Mothma', world: 'Chandrila', bloc: 'rc', faction: 'pacifist'},
    darsana: {name: 'Darsana', world: 'Glee Anselm', bloc: 'rc', faction: 'pacifist'},
    chuchi: {name: 'Riyo Chuchi', world: 'Pantora', bloc: 'rc', faction: 'rimward'},
    ashe: {name: 'Jorin Ashe', world: 'Christophsis', bloc: 'rc', faction: 'rimward'},
    bel_iblis: {name: 'Garm Bel Iblis', world: 'Corellia', bloc: 'rc', faction: 'hawk'},
    holt: {name: 'Aren Holt', world: 'Commenor', bloc: 'rc', faction: 'hawk'},
    // the Core Moderates
    tessane: {name: 'Ivra Tessane', world: 'Corulag', bloc: 'mod'},
    bastel: {name: 'Lorne Bastel', world: 'Brentaal', bloc: 'mod'},
    marchant: {name: 'Sela Marchant', world: 'Coruscant', bloc: 'mod'},
    // the Commerce Guilds
    argente: {name: 'Passel Argente', world: 'Kooriva', bloc: 'guild'},
    po_nudo: {name: 'Po Nudo', world: 'Ando', bloc: 'guild'},
    toora: {name: 'Toonbuck Toora', world: 'Sy Myrth', bloc: 'guild'},
    // Palpatine's bloc
    greejatus: {name: 'Janus Greejatus', world: 'Kuat', bloc: 'pal'},
    sauro: {name: 'Sano Sauro', world: 'Coruscant', bloc: 'pal'},
    burtoni: {name: 'Halle Burtoni', world: 'Kamino', bloc: 'pal'},
    // the Rimward Coalition
    bar_gane: {name: 'Edcel Bar Gane', world: 'Roona', bloc: 'rim'},
    tikkes: {name: 'Tikkes', world: 'Mon Calamari', bloc: 'rim'},
    dorr: {name: 'Vena Dorr', world: 'Ryloth', bloc: 'rim'},
    // the Security Bloc
    rhee: {name: 'Cassel Rhee', world: 'Anaxes', bloc: 'sec'},
    vorne: {name: 'Hadrian Vorne', world: 'Eriadu', bloc: 'sec'},
    kintis: {name: 'Mara Kintis', world: 'Kuat', bloc: 'sec'},
    // the Independents
    valk: {name: 'Oren Valk', world: 'Bothawui', bloc: 'ind'},
    vandar: {name: 'Siri Vandar', world: 'Alsakan', bloc: 'ind'},
    dowmeia: {name: 'Tundra Dowmeia', world: 'Mon Calamari', bloc: 'ind'},
    // the Rim Freedom Caucus
    varo: {name: 'Kesh Varo', world: 'Ord Biniir', bloc: 'rfc'},
    tor: {name: 'Lissa Tor', world: 'Malastare', bloc: 'rfc'}
  };
  SW.pickMinister = function (Q, b, used, c) {
    for (var id in SW.MINISTERS) if (SW.MINISTERS[id].bloc === b && !used[id]) return id;
    return 'gen_' + b + '_' + c;   // a bloc with more chairs than named senators
  };
  SW.ministerName = function (Q, id) {
    if (SW.MINISTERS[id]) return SW.MINISTERS[id].name;
    var b = (id || '').split('_')[1] || '';
    return b ? 'a senator of the ' + SW.name(Q, b) : '';
  };
  // Keep every chair's minister in step with the bloc that holds it. A chair the Caucus gains gets a
  // minister at once, and the Caucus is asked whom it wants.
  SW.syncMinisters = function (Q) {
    var used = {}, queue = (Q.appoint_queue || '').split(',').filter(function (x) { return x; });
    for (var i = 0; i < SW.COMMITTEES.length; i++) {
      var c = SW.COMMITTEES[i], b = Q['chair_' + c], m = Q['minister_' + c];
      if (b && m && Q['minister_' + c + '_bloc'] === b && !used[m]) used[m] = c;
      else if (m) Q['minister_' + c] = '';
    }
    for (var j = 0; j < SW.COMMITTEES.length; j++) {
      var cc = SW.COMMITTEES[j], bb = Q['chair_' + cc];
      if (!bb) { Q['minister_' + cc] = ''; Q['minister_' + cc + '_name'] = ''; Q['minister_' + cc + '_bloc'] = ''; continue; }
      var reappoint = bb === 'rc' && Q.reappoint_all;
      if (Q['minister_' + cc] && !reappoint) continue;
      if (!Q['minister_' + cc]) {
        var id = SW.pickMinister(Q, bb, used, cc);
        used[id] = cc;
        Q['minister_' + cc] = id; Q['minister_' + cc + '_name'] = SW.ministerName(Q, id); Q['minister_' + cc + '_bloc'] = bb;
        // a new bloc in the chair starts with a clean record
        if (Q['ministry_act_by_' + cc] !== bb) { Q['ministry_act_' + cc] = ''; Q['ministry_act_by_' + cc] = ''; }
      }
      if (bb === 'rc' && queue.indexOf(cc) < 0) queue.push(cc);
    }
    Q.reappoint_all = 0;
    // only chairs still ours wait for a choice
    queue = queue.filter(function (x) { return Q['chair_' + x] === 'rc'; });
    Q.appoint_queue = queue.join(',');
    Q.appoint_ready = (queue.length && !Q.finale && !Q.game_ending) ? 1 : 0;
  };
  // The appointment: up to three Caucus figures not chairing another committee (the current one among them).
  SW.appointOpen = function (Q) {
    var queue = (Q.appoint_queue || '').split(',').filter(function (x) { return x; });
    var c = queue[0] || '';
    Q.ap_com = c; Q.ap_com_name = SW.COMMITTEE_NAMES[c] || '';
    var busy = {};
    for (var i = 0; i < SW.COMMITTEES.length; i++) if (SW.COMMITTEES[i] !== c && Q['minister_' + SW.COMMITTEES[i]]) busy[Q['minister_' + SW.COMMITTEES[i]]] = 1;
    var free = [], seenFaction = {};
    for (var id in SW.MINISTERS) if (SW.MINISTERS[id].bloc === 'rc' && !busy[id]) free.push(id);
    // the sitting minister first, then one of each faction, the most restless factions first, then anyone
    var order = Object.keys(SW.MINISTERS);
    var restless = function (id) { return Q['rad_' + SW.MINISTERS[id].faction] || 0; };
    free.sort(function (a, b) {
      var sit = (b === Q['minister_' + c] ? 1 : 0) - (a === Q['minister_' + c] ? 1 : 0);
      return sit || (restless(b) - restless(a)) || (order.indexOf(a) - order.indexOf(b));
    });
    var picks = [];
    for (var k = 0; k < free.length && picks.length < 3; k++) {
      var f = SW.MINISTERS[free[k]].faction;
      if (free[k] === Q['minister_' + c] || !seenFaction[f]) { picks.push(free[k]); seenFaction[f] = 1; }
    }
    for (var k2 = 0; k2 < free.length && picks.length < 3; k2++) if (picks.indexOf(free[k2]) < 0) picks.push(free[k2]);
    var slots = ['a', 'b', 'c'];
    for (var s = 0; s < 3; s++) {
      var pid = picks[s] || '', M = SW.MINISTERS[pid];
      Q['ap_' + slots[s]] = pid; Q['ap_' + slots[s] + '_ok'] = pid ? 1 : 0;
      Q['ap_' + slots[s] + '_name'] = M ? M.name : ''; Q['ap_' + slots[s] + '_world'] = M ? M.world : '';
      Q['ap_' + slots[s] + '_faction'] = M ? SW.FACTION_NAMES[M.faction] : '';
    }
  };
  SW.appointChoose = function (Q, slot) {
    var c = Q.ap_com, id = Q['ap_' + slot];
    if (c && id && Q['chair_' + c] === 'rc') {
      Q['minister_' + c] = id; Q['minister_' + c + '_name'] = SW.MINISTERS[id].name; Q['minister_' + c + '_bloc'] = 'rc';
      var f = SW.MINISTERS[id].faction;
      // a wing whose senator takes a chair is calmed; one of our advisors in the chair calms it more
      if (f) Q['rad_' + f] = Math.max(0, (Q['rad_' + f] || 0) - (SW.ADVISOR_FACTION[id] && Q['adv_' + id] ? 8 : 4));
      Q.ap_chosen_name = SW.MINISTERS[id].name; Q.ap_chosen_faction = SW.FACTION_NAMES[f] || '';
    }
    Q.appoint_queue = (Q.appoint_queue || '').split(',').filter(function (x) { return x && x !== c; }).join(',');
    Q.appoint_ready = 0;
  };

  // ------------------------------------------------------------------ ministries at work
  // A ministry the Caucus does not hold acts every few turns on its bloc's ideology at the time:
  // the bloc's baseline plus its current leader's views.
  SW.BLOC_IDEOLOGY = {
    mod: {oversight: 0.1, regulate: 0.05},
    guild: {regulate: -0.3, army: 0.05},
    pal: {powers: 0.3, army: 0.2, oversight: -0.3, peace: -0.1},
    rim: {rim: 0.3, regulate: 0.1, peace: 0.05},
    rfc: {rim: 0.35, regulate: 0.15, peace: 0.1},
    sec: {army: 0.3, powers: 0.1, peace: -0.2},
    ind: {peace: 0.2, oversight: 0.1}
  };
  SW.ideology = function (Q, b) {
    var v = {}, base = SW.BLOC_IDEOLOGY[(b === 'rfc' && SW.splinterWing && SW.splinterWing(Q)) ? SW.WINGS[Q.rfc_kind].bloc : b] || {}, L = SW.blocViews ? SW.blocViews(Q, b) : (SW.leader(Q, b).views || {}), k;
    for (k in base) v[k] = (v[k] || 0) + base[k];
    for (k in L) v[k] = (v[k] || 0) + L[k];
    return v;
  };
  // a reform a ministry puts to the Senate: the Caucus is not its sponsor
  SW.ministryVote = function (Q, stance, topic, bonus) {
    var st = SW.stance(Q, stance, true);
    if (bonus) for (var b in st) st[b] = SW.clamp(st[b] + bonus, 0, 1);
    return SW.vote(Q, st, 0.5, topic) >= 50;
  };
  // Each scandal the Caucus turned into a demand for ethics enforcement builds the case for an Ethics Commission.
  SW.ethicsPush = function (Q) { return Math.min(0.09, 0.03 * (Q.ethics_push || 0)); };
  // Reforms an anti-reform ministry can repeal: only the latest step of its track, only once it has stood for a year.
  // (Reforms whose effects cannot be undone, and those that check the Chancellery's powers, are never repealed.)
  SW.REPEALS = {
    rim_relief_act: {name: 'the Rim Relief Act', line: 'Relief convoys bound for the Outer Rim are recalled at the hyperlane beacons.'},
    sentience_rights: {name: 'the Rights of Sentience', line: 'Aliens across the Republic lose the protections the Rights of Sentience gave them.'},
    anti_corruption: {name: 'the Ethics Commission', line: 'The Ethics Commission\'s investigators clear their desks.', after: 'integrity_office'},
    integrity_office: {name: 'the Office of Public Integrity', line: 'The Office of Public Integrity is shut, and its files are sealed.', after: 'senators_expelled'},
    emergency_sunset: {name: 'the Sunset Amendment', line: 'The emergency powers no longer expire.', after: 'powers_review'},
    anti_cartel: {name: 'the Anti-Cartel Act', line: 'The guilds\' cartels are legal again.', after: 'tf_broken_up'}
  };
  SW.repealable = function (Q, f) {
    var R = SW.REPEALS[f];
    return !!(R && Q[f] && !(R.after && Q[R.after]) && !Q.finale && !Q.game_ending && Q['since_' + f] >= 0 && Q.date - Q['since_' + f] >= 12);
  };
  // a repeal goes to the Senate with the Caucus against it: blocs friendly to us, faith in the Republic and the Senate's resolve all count against it
  SW.repealStance = function (Q, base) {
    var st = {};
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      if (b === 'rc') continue;
      var p = base[b] !== undefined ? base[b] : 0.4;
      if (b !== 'pal' && b !== 'cis') p -= ((Q[b + '_relation'] || 40) - 45) / 150 * (1.4 - 0.8 * SW.firm(Q, b));
      p -= (Q.faith - 50) / 250 + Q.senate_resolve * 0.02;
      st[b] = SW.clamp(p, 0, 1);
    }
    return st;
  };
  SW.repealVoteFor = function (Q, base, topics, need) { return SW.vote(Q, SW.repealStance(Q, base), 0, topics) >= (need || 50); };
  SW.reformRepealed = function (Q, f, b, c) {
    Q[f] = 0; Q['since_' + f] = -1;
    Q.reforms_repealed = (Q.reforms_repealed || 0) + 1;
    Q['repealed_' + f] = (Q['repealed_' + f] || 0) + 1;
    Q.rr_go = 1; Q.rr_name = SW.REPEALS[f].name; Q.rr_line = SW.REPEALS[f].line; Q.rr_bloc = SW.name(Q, b);
    Q.rr_minister = Q['minister_' + c + '_name'] || 'The minister'; Q.rr_committee = SW.COMMITTEE_NAMES[c];
  };
  SW.repealTick = function (Q) {
    for (var f in SW.REPEALS) { if (Q[f]) { if (!(Q['since_' + f] >= 0)) Q['since_' + f] = Q.date; } else Q['since_' + f] = -1; }
  };
  SW.MINISTRY_ACTS = {
    finance: [
      {id: 'bank_audit', text: 'audited the Banking Clan', reform: 1, vec: {regulate: 0.8, oversight: 0.5}, ok: function (Q) { return !Q.banking_audit; },
        fx: function (Q) { Q.banking_audit = 1; Q.banking_reformed += 0.5; Q.evidence += 0.4; SW.guildPatience(Q, -4, 'an audit of the Banking Clan'); }},
      {id: 'deregulate', text: 'cut the guilds\' regulations', vec: {regulate: -1},
        fx: function (Q) { Q.guild_relation += 2; SW.guildPatience(Q, 5); Q.trade = (Q.trade || 60) + 3; Q.corruption += 1; Q.rim_hardship += 0.5; }},
      {id: 'audit', text: 'audited the guilds', vec: {regulate: 1}, ok: function (Q) { return !Q.tf_broken_up; },
        fx: function (Q) { Q.corruption -= 1; SW.guildPatience(Q, -5, 'a committee audit'); Q.trade = (Q.trade || 60) - 1; }},
      {id: 'relief', text: 'paid for relief on the Rim', vec: {rim: 1}, ok: function (Q) { return Q.treasury >= 1; },
        fx: function (Q) { Q.treasury -= 1; Q.rim_hardship -= 1.5; }},
      {id: 'war', text: 'paid for the war', vec: {army: 1, peace: -0.5}, ok: function (Q) { return Q.war && Q.treasury >= 1; },
        fx: function (Q) { Q.treasury -= 1; Q.war_balance += 0.4; }},
      {id: 'repeal_anticartel', repeal: 1, text: 'repealed the Anti-Cartel Act', bill: 'the repeal of the Anti-Cartel Act', vec: {regulate: -1}, ok: function (Q) { return SW.repealable(Q, 'anti_cartel'); },
        vote: function (Q) { return SW.repealVoteFor(Q, {mod: 0.45, guild: 0.85, rim: 0.4, sec: 0.45, ind: 0.4, pal: 0.6, cis: 0.6}, '-regulate'); },
        fx: function (Q, b) { SW.reformRepealed(Q, 'anti_cartel', b, 'finance'); Q.guild_relation += 3; SW.guildPatience(Q, 5); }},
      {id: 'pork_finance', text: SW.PORK.finance[0].act, said: function (Q) { return Q.pork_said; }, pork: 1, vec: {}, ok: function (Q) { return SW.porkOk(Q); }, score: function (Q, ideo) { return SW.porkScore(Q, ideo); }, fx: function (Q, b) { SW.porkBarrel(Q, 'finance', b); }}
    ],
    judiciary: [
      {id: 'ethics', text: 'passed an Ethics Commission', bill: 'the Ethics Commission Act', vec: {regulate: 0.6, oversight: 0.6}, ok: function (Q) { return !Q.anti_corruption; },
        vote: function (Q) { return SW.ministryVote(Q, {mod: 0.55, guild: 0.15, rim: 0.7, sec: 0.45, ind: 0.55, pal: 0.45, cis: 0.3}, ['oversight', 'regulate'], SW.ethicsPush(Q)); },
        fx: function (Q) { Q.anti_corruption = 1; Q.corruption -= 4; Q.faith += 2; }},
      {id: 'prosecute', text: 'prosecuted corruption', vec: {regulate: 0.5, oversight: 0.5}, fx: function (Q) { Q.corruption -= 2; }},
      {id: 'look_away', text: 'looked the other way', vec: {regulate: -0.6, oversight: -0.4}, fx: function (Q) { Q.corruption += 1.5; }},
      {id: 'critics', text: 'investigated the government\'s critics', vec: {powers: 1, oversight: -0.5},
        fx: function (Q) { Q.grand_plan += 1; if (!Q.evidence_secured && !Q.compor) Q.evidence = Math.max(0, Q.evidence - 0.3); }},
      {id: 'repeal_ethics', repeal: 1, text: 'repealed the Ethics Commission', bill: 'the repeal of the Ethics Commission', vec: {corruption: -1, regulate: -0.5}, ok: function (Q) { return SW.repealable(Q, 'anti_corruption'); },
        vote: function (Q) { return SW.repealVoteFor(Q, {mod: 0.3, guild: 0.65, rim: 0.45, sec: 0.4, ind: 0.3, pal: 0.45, cis: 0.5}, ['-corruption', '-oversight']); },
        fx: function (Q, b) { SW.reformRepealed(Q, 'anti_corruption', b, 'judiciary'); Q.corruption += 3; Q.faith -= 1; }},
      {id: 'repeal_integrity', repeal: 1, text: 'shut the Office of Public Integrity', bill: 'the closure of the Office of Public Integrity', vec: {corruption: -1, oversight: -0.5}, ok: function (Q) { return SW.repealable(Q, 'integrity_office'); },
        vote: function (Q) { return SW.repealVoteFor(Q, {mod: 0.3, guild: 0.65, rim: 0.45, sec: 0.4, ind: 0.3, pal: 0.5, cis: 0.5}, ['-corruption', '-oversight']); },
        fx: function (Q, b) { SW.reformRepealed(Q, 'integrity_office', b, 'judiciary'); Q.corruption += 2; }},
      {id: 'pork_judiciary', text: SW.PORK.judiciary[0].act, said: function (Q) { return Q.pork_said; }, pork: 1, vec: {}, ok: function (Q) { return SW.porkOk(Q); }, score: function (Q, ideo) { return SW.porkScore(Q, ideo); }, fx: function (Q, b) { SW.porkBarrel(Q, 'judiciary', b); }}
    ],
    security: [
      {id: 'oversight', text: 'brought the army under Senate oversight', bill: 'the Grand Army Oversight Act', vec: {oversight: 1, powers: -0.5}, ok: function (Q) { return !Q.army_oversight && (Q.clones > 0 || Q.kamino_known); },
        vote: function (Q) { return SW.ministryVote(Q, {mod: 0.6, guild: 0.4, rim: 0.6, sec: 0.25, ind: 0.55, pal: 0.1, cis: 0.5}, 'oversight'); },
        fx: function (Q) { Q.army_oversight = 1; Q.navy_loyalty += 10; }},
      {id: 'expand', text: 'expanded the army', vec: {army: 1, powers: 0.5}, fx: function (Q, b) { Q.fear += 1.5; if (b === 'pal') Q.grand_plan += 1; }},
      {id: 'navy', text: 'built up the Navy', vec: {army: 0.8, peace: -0.3}, fx: function (Q) { Q.mil_invest = (Q.mil_invest || 0) + 1; Q.navy_loyalty -= 2; }},
      {id: 'cut', text: 'cut the defence budget', vec: {peace: 1, army: -1}, fx: function (Q) { Q.treasury += 1; if (Q.war) Q.war_balance -= 0.3; }},
      {id: 'pork_security', text: SW.PORK.security[0].act, said: function (Q) { return Q.pork_said; }, pork: 1, vec: {}, ok: function (Q) { return SW.porkOk(Q); }, score: function (Q, ideo) { return SW.porkScore(Q, ideo); }, fx: function (Q, b) { SW.porkBarrel(Q, 'security', b); }}
    ],
    rimaffairs: [
      {id: 'relief_act', text: 'passed the Rim Relief Act', bill: 'the Rim Relief Act', vec: {rim: 1, regulate: 0.3}, ok: function (Q) { return !Q.rim_relief_act; },
        vote: function (Q) { return SW.ministryVote(Q, {mod: 0.5, guild: 0.35, rim: 0.9, sec: 0.35, ind: 0.6, pal: 0.4, cis: 0.7}, 'rim'); },
        fx: function (Q) { Q.rim_relief_act = 1; Q.rim_relief += 1; Q.rim_hardship -= 3; Q.rim_relation += 4; Q.outer_sep -= 2; Q.midrim_sep -= 1; }},
      {id: 'relief', text: 'sent relief to the Rim', vec: {rim: 1}, fx: function (Q) { Q.rim_hardship -= 2; Q.treasury -= 0.5; }},
      {id: 'hutt', text: 'protected the Hutt trade', vec: {regulate: -0.8, rim: -0.5}, fx: function (Q) { Q.guild_relation += 2; Q.rim_hardship += 1; }},
      {id: 'crackdown', text: 'cracked down on unrest in the Rim', vec: {army: 0.7, rim: -1}, fx: function (Q) { Q.fear += 1; Q.rim_relation -= 3; Q.outer_sep += 1; }},
      {id: 'repeal_relief', repeal: 1, text: 'repealed the Rim Relief Act', bill: 'the repeal of the Rim Relief Act', vec: {rim: -1}, ok: function (Q) { return SW.repealable(Q, 'rim_relief_act'); },
        vote: function (Q) { return SW.repealVoteFor(Q, {mod: 0.4, guild: 0.6, rim: 0.1, sec: 0.5, ind: 0.35, pal: 0.6, cis: 0.5}, '-rim'); },
        fx: function (Q, b) { SW.reformRepealed(Q, 'rim_relief_act', b, 'rimaffairs'); Q.rim_relief = Math.max(0, (Q.rim_relief || 0) - 1); Q.rim_hardship += 2; Q.rim_relation -= 4; }},
      {id: 'repeal_sentience', repeal: 1, text: 'repealed the Rights of Sentience', bill: 'the repeal of the Rights of Sentience', vec: {xenos: -1, rim: -0.5}, ok: function (Q) { return SW.repealable(Q, 'sentience_rights'); },
        vote: function (Q) { return SW.repealVoteFor(Q, {mod: 0.35, guild: 0.4, rim: 0.05, sec: 0.5, ind: 0.2, pal: 0.7, cis: 0.3}, ['-xenos', '-rim']); },
        fx: function (Q, b) { SW.reformRepealed(Q, 'sentience_rights', b, 'rimaffairs'); Q.rim_relation -= 4; }},
      {id: 'pork_rimaffairs', text: SW.PORK.rimaffairs[0].act, said: function (Q) { return Q.pork_said; }, pork: 1, vec: {}, ok: function (Q) { return SW.porkOk(Q); }, score: function (Q, ideo) { return SW.porkScore(Q, ideo); }, fx: function (Q, b) { SW.porkBarrel(Q, 'rimaffairs', b); }}
    ],
    constitution: [
      {id: 'sunset', text: 'passed sunset clauses on the emergency powers', bill: 'the Sunset Amendment', vec: {oversight: 1, powers: -1}, ok: function (Q) { return !Q.emergency_sunset; },
        vote: function (Q) { return SW.vote(Q, SW.stance(Q, {mod: 0.6, guild: 0.55, rim: 0.65, sec: 0.25, ind: 0.6, pal: 0.15 + (Q.emergency_powers < 1 ? 0.25 : 0), cis: 0.6}, true), 0.5, 'oversight') >= 66.7; },
        fx: function (Q) { Q.emergency_sunset = 1; Q.faith += 1; }},
      {id: 'ease', text: 'eased the emergency powers\' passage', vec: {powers: 1, oversight: -0.5}, fx: function (Q) { Q.grand_plan += 1.5; Q.senate_resolve -= 0.3; }},
      {id: 'defend', text: 'defended the constitution', vec: {oversight: 1, powers: -1}, fx: function (Q) { Q.senate_resolve += 0.3; Q.faith += 0.5; }},
      {id: 'repeal_sunset', repeal: 1, text: 'repealed the Sunset Amendment', bill: 'the repeal of the Sunset Amendment', vec: {powers: 1, oversight: -1}, ok: function (Q) { return SW.repealable(Q, 'emergency_sunset'); },
        vote: function (Q) { return SW.repealVoteFor(Q, {mod: 0.3, guild: 0.4, rim: 0.3, sec: 0.6, ind: 0.3, pal: 0.9, cis: 0.3}, ['powers', '-constitution'], 66.7); },
        fx: function (Q, b) { SW.reformRepealed(Q, 'emergency_sunset', b, 'constitution'); Q.faith -= 1; Q.senate_resolve -= 0.3; }}
    ],
    jedi: [
      {id: 'independence', text: 'guaranteed the Jedi Order\'s independence', bill: 'the Jedi Independence Amendment', vec: {oversight: 0.8, powers: -0.8}, ok: function (Q) { return !Q.jedi_independence; },
        vote: function (Q) { return SW.vote(Q, SW.stance(Q, {mod: 0.6, guild: 0.4, rim: 0.55, sec: 0.25, ind: 0.6, pal: 0.15, cis: 0.4}, true), 0.5, 'oversight') >= 66.7; },
        fx: function (Q) { Q.jedi_independence = 1; Q.jedi_relation += 5; }},
      {id: 'press', text: 'pressed the Jedi into command', vec: {army: 1, peace: -0.8}, ok: function (Q) { return Q.war && !Q.jedi_service_act && !Q.jedi_generals; },
        fx: function (Q) { Q.jedi_generals = 1; Q.jedi_standing -= 2; Q.war_balance += 0.3; }},
      {id: 'protect', text: 'protected the Order', vec: {oversight: 0.5, peace: 0.5}, fx: function (Q) { Q.jedi_standing += 2; }},
      {id: 'scrutinise', text: 'scrutinised the Jedi', vec: {powers: 1, oversight: -0.5}, fx: function (Q) { Q.jedi_standing -= 3; Q.jedi_relation -= 2; }}
    ]
  };
  // the act that best fits the ministry's bloc, or none if nothing fits
  // The Core Moderates and the Independents put reforms forward only under their reforming wings;
  // under the Isolationists the Independents put forward only bills on the Rim's seats and the Rights of Sentience.
  SW.REFORMING_WINGS = {mod: ['ruusan'], ind: ['brokers', 'neutralists']};
  SW.WING_BILLS = {isolationists: ['enfranchise', 'assembly', 'sentience']};
  SW.blocReforms = function (Q, b) {
    var w = SW.REFORMING_WINGS[b];
    return !w || w.indexOf(Q[b + '_wing']) >= 0;
  };
  SW.wingBill = function (Q, b, id) {
    var only = SW.WING_BILLS[Q[b + '_wing']];
    return !!(only && only.indexOf(id) >= 0);
  };
  // patronage: only a bloc not opposed to corruption uses it, and only when nothing it cares about more is on offer
  SW.porkScore = function (Q, ideo) { var k = ideo.corruption || 0; return k > 0 ? 0 : 0.06 + Math.min(0.1, -k * 0.3); };
  SW.ministryChoice = function (Q, c) {
    var b = Q['chair_' + c], acts = SW.MINISTRY_ACTS[c] || [], ideo = SW.ideology(Q, b), best = null, bestS = 0.05;
    var reforms = SW.blocReforms(Q, b);
    for (var i = 0; i < acts.length; i++) {
      var A = acts[i];
      if (A.ok && !A.ok(Q)) continue;
      if ((A.bill || A.reform) && !A.repeal && !reforms && !SW.wingBill(Q, b, A.id)) continue;
      // a bill the Senate voted down waits a few years before it is tried again
      if ((Q['mfail_' + A.id] || 0) > Q.time) continue;
      var sc = 0;
      if (A.score) sc = A.score(Q, ideo);
      else for (var k in A.vec) sc += A.vec[k] * (ideo[k] || 0);
      // a reform it hates, on the books: undoing it comes first
      if (A.repeal && sc > 0) sc *= 1.3;
      if (sc > bestS + 1e-9) { best = A; bestS = sc; }
    }
    return best;
  };
  SW.ministryTurn = function (Q) {
    if (Q.finale || Q.game_ending || !(Q.months_per_turn > 0) || SW.off('ministries')) return;
    if (!Q.ministry_next) Q.ministry_next = Q.time + 3;
    if (Q.time < Q.ministry_next) return;
    Q.ministry_next = Q.time + 3;
    var lines = [];
    for (var i = 0; i < SW.COMMITTEES.length; i++) {
      var c = SW.COMMITTEES[i], b = Q['chair_' + c];
      if (!b || b === 'rc' || b === 'cis') continue;
      var A = SW.ministryChoice(Q, c);
      if (!A) continue;
      var passed = A.vote ? A.vote(Q) : true;
      if (passed) { A.fx(Q, b); SW.radicalise(Q, b, A.pork ? ['-corruption'] : Object.keys(A.vec || {}).map(function (k) { return A.vec[k] >= 0 ? k : '-' + k; }), 0.5); }
      else Q['mfail_' + A.id] = Q.time + 12;
      var did = passed ? (A.said && A.said(Q)) || A.text : 'put ' + A.bill + ' to the Senate, which voted it down';
      Q['ministry_act_' + c] = did; Q['ministry_act_by_' + c] = b;
      Q.ministry_acts_total = (Q.ministry_acts_total || 0) + 1;
      lines.push('<b>' + SW.COMMITTEE_NAMES[c] + '</b> (' + (Q['minister_' + c + '_name'] || SW.name(Q, b)) + ', ' + SW.name(Q, b) + ') ' + did + '.');
    }
    if (lines.length) { Q.ministry_report = lines.join('<br>'); Q.ministry_report_ready = 1; }
    SW.computeSupport(Q);
  };

  // The Senate suspends the Jedi Service Act for the duration of the war: the Jedi become generals.
  SW.suspendServiceAct = function (Q) {
    Q.jedi_service_act = 0; Q.jedi_service_suspended = 1; Q.jedi_generals = 1; Q.war_balance += 1;
  };

  // A card nothing on which can be chosen (usually for want of political capital) can be set aside; the turn still passes.
  // Run from each card's on-display, after its own on-arrival and before its options are shown.
  SW.cardStuck = function (Q, engine) {
    Q.card_stuck = 0;
    try {
      var sc = engine.game.scenes[engine.state.sceneId];
      if (!sc || !sc.options) return 0;
      var ids = engine.__filterViewable(engine.__getChoiceIdsFromOptions(sc.options));
      for (var id in ids) {
        if (id === 'easy_discard' || id === 'set_aside' || id === 'go_back') continue;
        var os = engine.game.scenes[id];
        if (os && engine._runPredicate(os.chooseIf, true)) return 0;
      }
      Q.card_stuck = 1;
    } catch (e) { Q.card_stuck = 0; }
    return Q.card_stuck;
  };

  // ------------------------------------------------------------------ the Chancellery
  // The office of Supreme Chancellor, apart from the committees, and the powers it gathers. Each power is gained
  // by time or by events, and checked for good by a reform (or by our own Chancellor handing it back to the Senate).
  SW.CHANCELLERY_POWERS = [
    {id: 'gavel', name: 'The gavel', what: 'The Chancellor presides over the Senate, and the Vice Chair decides what it debates.',
      gained: function () { return true; },
      checks: [[function (Q) { return Q.independent_speaker; }, 'an independent Speaker']],
      ret: function (Q) { Q.independent_speaker = 1; }},
    {id: 'guard', name: 'The Senate Guard', what: 'The Guard answers to the Chancellor, not to the Senate.',
      gained: function () { return true; },
      checks: [[function (Q) { return Q.senate_guard_reformed; }, 'the Guard returned to the Senate']],
      ret: function (Q) { Q.senate_guard_reformed = 1; }},
    {id: 'staff', name: 'The Chancellor\'s staff', what: 'The committees\' staff now work for the Chancellery, and the government\'s bills are drafted there.',
      gained: function (Q) { return Q.bby <= (Q.bureau_captured === -1 ? 26 : 30); },
      checks: [[function (Q) { return Q.bureau_reformed; }, 'the Civil Service Act']],
      ret: function (Q) { Q.bureau_reviewed = 1; Q.bureau_reformed = 1; }},
    {id: 'decrees', name: 'Emergency decrees', what: 'The Chancellor can rule by decree, without the Senate.',
      gained: function (Q) { return Q.emergency_powers >= 1; },
      suspended: [function (Q) { return Q.emergency_sunset; }, 'suspended by the sunset clauses'],
      checks: [[function (Q) { return Q.powers_review; }, 'the Powers Review Act']],
      ret: function (Q) { Q.emergency_sunset = 1; Q.powers_review = 1; }},
    {id: 'army', name: 'The Grand Army', what: 'The clone army obeys the office.',
      gained: function (Q) { return Q.clones > 0 && Q.kamino_army; },
      checks: [[function (Q) { return Q.army_oversight; }, 'Senate oversight of the army'], [function (Q) { return Q.senate_command; }, 'the Senate Command Act']],
      ret: function (Q) { Q.army_oversight = 1; }},
    {id: 'bureau', name: 'The Bureau of Intelligence', what: 'The Republic\'s spies report to the Chancellor alone.',
      gained: function (Q) { return Q.chan_bureau; },
      checks: [[function (Q) { return Q.intel_oversight; }, 'the Intelligence Oversight Act']],
      ret: function (Q) { Q.intel_oversight = 1; Q.intel_runs = Math.max(Q.intel_runs || 0, 1); }},
    {id: 'holonet', name: 'The HoloNet', what: 'The Office of Public Information tells the galaxy what to think.',
      gained: function (Q) { return Q.chan_holonet; },
      checks: [[function (Q) { return (Q.free_press || 0) >= 1; }, 'a free press']],
      ret: function (Q) { Q.free_press = Math.max(Q.free_press || 0, 1); Q.holonet_free = 1; }},
    {id: 'term', name: 'Term without end', what: 'The Chancellor\'s term runs on past its limit.',
      gained: function (Q) { return Q.term_extended || Q.election_suspended; },
      checks: [[function (Q) { return Q.term_limits_protected; }, 'term limits entrenched']],
      ret: function (Q) { Q.term_limits_protected = 1; Q.election_suspended = 0; if (Q.next_election_date >= 999) Q.next_election_date = Q.date + 12; }},
    {id: 'jedi', name: 'The Jedi Council', what: 'The Chancellor\'s representative sits on the Jedi Council.',
      gained: function (Q) { return Q.council_seat_seen && !Q.council_blocked; },
      checks: [[function (Q) { return Q.jedi_independence; }, 'the Jedi Independence Amendment']],
      ret: function (Q) { Q.jedi_independence = 1; }},
    {id: 'banks', name: 'The banks', what: 'The Chancellery directs the Banking Clan.',
      gained: function (Q) { return Q.banks_seized; },
      checks: [[function (Q) { return Q.banking_independent; }, 'the Banking Clan\'s independence'], [function (Q) { return Q.republic_bonds; }, 'Republic bonds']],
      ret: function (Q) { Q.banking_independent = 1; }},
    {id: 'security', name: 'The Security Act', what: 'Senators can be detained on the Chancellery\'s word.',
      gained: function (Q) { return Q.security_act; },
      checks: [[function (Q) { return Q.judicial_charter; }, 'the Judicial Forces Charter']],
      ret: function (Q) { Q.judicial_charter = 1; }},
    {id: 'governors', name: 'The sector governors', what: 'Governors appointed by the Chancellor rule the sectors.',
      gained: function (Q) { return Q.governors; },
      checks: [[function (Q) { return Q.rim_assembly; }, 'the Rim Assembly'], [function (Q) { return Q.rim_enfranchised; }, 'the Rim\'s constitutional seats']],
      ret: function (Q) { Q.rim_enfranchised = 1; }}
  ];
  SW.CHAN_POWER = {};
  for (var cpi = 0; cpi < SW.CHANCELLERY_POWERS.length; cpi++) SW.CHAN_POWER[SW.CHANCELLERY_POWERS[cpi].id] = SW.CHANCELLERY_POWERS[cpi];
  SW.CHAN_SCALE = [[0, 'First among equals'], [3, 'A strong executive'], [5, 'A war cabinet'], [7, 'An imperial presidency'], [10, 'The throne in all but name']];
  SW.chanScale = function (n) { var w = SW.CHAN_SCALE[0][1]; for (var i = 0; i < SW.CHAN_SCALE.length; i++) if (n >= SW.CHAN_SCALE[i][0]) w = SW.CHAN_SCALE[i][1]; return w; };
  // Work out which powers the office holds now. A check, once made, is for good.
  SW.chancellery = function (Q) {
    var n = 0, held = [];
    for (var i = 0; i < SW.CHANCELLERY_POWERS.length; i++) {
      var P = SW.CHANCELLERY_POWERS[i], k = 'chp_' + P.id;
      if (!Q[k]) for (var j = 0; j < P.checks.length; j++) if (P.checks[j][0](Q)) { Q[k] = 1; Q[k + '_by'] = P.checks[j][1]; break; }
      var st = 'none';
      if (Q[k]) st = 'checked';
      else if (P.gained(Q)) st = (P.suspended && P.suspended[0](Q)) ? 'suspended' : 'held';
      Q[k + '_state'] = st;
      if (st === 'held') { n++; held.push(P.name); }
    }
    Q.chan_powers = n; Q.chan_scale = SW.chanScale(n); Q.chan_held_text = held.join(', ');
    Q.chan_decrees = Q.chp_decrees_state === 'held' ? 1 : 0;
    Q.chan_can_decree = (Q.rc_chancellor && Q.chan_decrees && !Q.game_ending) ? 1 : 0;
    return n;
  };
  // The weight of the office behind the government's own bills: ours while our Chancellor holds it,
  // and his bills for more power while Palpatine (or his man) does.
  SW.officeWeight = function (Q, rcYes, topics) {
    if (!Q.chan_powers) return 0;
    var ours = Q.rc_chancellor && rcYes === 1;
    var his = (Q.pal_chancellor || Q.puppet_chancellor) && topics.indexOf('powers') >= 0;
    if (!ours && !his) return 0;
    return Q.chan_powers + (Q.chp_staff_state === 'held' ? 3 : 0);
  };
  SW.hollowCrownDecrees = function (Q) {
    SW.chancellery(Q);
    return !!(Q.rc_chancellor && (Q.decrees_used || 0) >= 5 && Q.chan_powers >= 6);
  };
  // Each quarter: the office's pull, the Bureau's hidden network, the HoloNet, and other Chancellors' decrees.
  SW.chancelleryTurn = function (Q) {
    if (Q.game_ending) return;
    SW.chancellery(Q);
    if (Q.chancellor !== Q.chan_holder) { Q.chan_holder = Q.chancellor; Q.chan_months = 0; }
    else Q.chan_months = (Q.chan_months || 0) + (Q.months_per_turn > 0 ? Q.months_per_turn : 0);
    var his = Q.pal_chancellor || Q.puppet_chancellor, free = !Q.sidious_defeated && !Q.sidious_fled;
    if (his && free) {
      Q.grand_plan += 0.1 * Q.chan_powers;
      // he inherits every precedent our Chancellor set
      if ((Q.decrees_used || 0) > 0 && !Q.precedent_inherited) { Q.precedent_inherited = 1; Q.grand_plan += 2 * Q.decrees_used; }
    }
    if ((Q.decrees_used || 0) > 0) Q.faith -= 0.05 * Q.decrees_used;
    // the Bureau's darker network feeds its master, under him, or under us while it is left alone
    if (Q.chp_bureau_state === 'held' && free) {
      var moles = his || (Q.rc_chancellor && Q.bureau_moles && Q.time < (Q.bureau_moles_until || 9999));
      if (moles) SW.raiseAlarm(Q, 0.15);
      if (his) Q.evidence = Math.max(0, Q.evidence - 0.1);
    }
    if (Q.chp_holonet_state === 'held') {
      if (Q.rc_chancellor) SW.momentum(Q, 0.15);
      else if (Q.chancellor_bloc && Q.chancellor_bloc !== 'rc') for (var r = 0; r < SW.REGIONS.length; r++) Q[SW.REGIONS[r] + '_' + Q.chancellor_bloc] *= 1.006;
      Q.faith -= 0.1;
    }
    for (var s = 0; s < (Q.parties || []).length; s++) { var sk = Q.parties[s] + '_scandal'; if (Q[sk]) Q[sk] = Q[sk] < 0.02 ? 0 : Q[sk] * 0.8; }
    // events the office brings
    if (!Q.finale && Q.months_per_turn > 0) {
      if (!Q.chan_bureau && !Q.chp_bureau && !Q.bureau_moves_seen && (Q.emergency_powers >= 2 || (Q.war && (Q.war_turns || 0) >= 8))) Q.bureau_moves_ready = 1;
      if (!Q.chan_holonet && !Q.chp_holonet && !Q.public_info_seen && Q.emergency_powers >= 3) Q.public_info_ready = 1;
      if (Q.chan_decrees && !Q.rc_chancellor && free) {
        if (!Q.by_decree_next) Q.by_decree_next = Q.time + 2;
        if (Q.time >= Q.by_decree_next) { Q.by_decree_next = Q.time + 4; SW.byDecree(Q); }
      }
    }
  };
  // War in the Shadows waits until our Chancellor holds an office that holds the Bureau.
  SW.shadowsReady = function (Q) {
    return !!(Q.rc_chancellor && Q.chp_bureau_state === 'held' && !Q.war_shadows_seen && !Q.finale && !Q.game_ending);
  };
  // Another Chancellor rules by decree: one act a season, drawn from the powers the office holds.
  SW.BY_DECREE = [
    {id: 'arrest', need: 'guard', heading: 'A Senator Detained',
      text: 'Senate Guards in blue robes arrive at a Caucus senator\'s apartment before dawn, on the Chancellor\'s warrant alone. The senator is released a week later without charge. The Caucus\'s other senators notice who is watching.',
      fx: function (Q) { Q.capital = Math.max(0, Q.capital - 1); Q.fear += 2; for (var i = 0; i < SW.REGIONS.length; i++) Q[SW.REGIONS[i] + '_rc'] *= 0.98; }},
    {id: 'holonet', need: 'holonet', heading: 'The Chancellor\'s Hour',
      text: 'Every HoloNet channel carries the Chancellor\'s address on the same evening, followed by a week of commentators explaining why the Chancellor is right.',
      fx: function (Q) { var b = Q.chancellor_bloc; if (b && b !== 'rc') for (var i = 0; i < SW.REGIONS.length; i++) Q[SW.REGIONS[i] + '_' + b] *= 1.03; Q.faith -= 0.5; }},
    {id: 'governors', need: 'governors', heading: 'Order in the Sectors',
      text: 'A sector governor breaks up a protest on a Rim world with troops, under a decree from the Chancellery. The protesters\' grievances were real; now so is their anger.',
      fx: function (Q) { Q.rim_hardship += 1; Q.outer_sep += 2; Q.midrim_sep += 1; Q.fear += 1; }},
    {id: 'bureau', need: 'bureau', heading: 'Watched',
      text: 'An analyst in the Caucus\'s inquiry team is reassigned overnight; a file goes missing; a contact stops answering. The Bureau of Intelligence is watching the Caucus, on the Chancellor\'s orders.',
      fx: function (Q) { Q.evidence = Math.max(0, Q.evidence - 0.3); if (!Q.sidious_defeated) SW.raiseAlarm(Q, 0.3); }},
    {id: 'powers', need: '', heading: 'Another Emergency',
      text: 'A decree from the Chancellery takes one more power "for the duration of the emergency". The Senate is informed afterwards.',
      fx: function (Q) { Q.emergency_powers += 1; Q.faith -= 1; }}
  ];
  SW.byDecree = function (Q) {
    var pool = SW.BY_DECREE.filter(function (D) { return !D.need || Q['chp_' + D.need + '_state'] === 'held'; });
    if (!pool.length) return;
    var D = pool[Math.floor(SW.rnd() * pool.length) % pool.length];
    D.fx(Q);
    Q.grand_plan += (Q.pal_chancellor || Q.puppet_chancellor) ? 1 : 0.5;
    Q.by_decree_heading = D.heading; Q.by_decree_text = D.text; Q.by_decree_kind = D.id; Q.by_decree_ready = 1;
    Q.by_decrees = (Q.by_decrees || 0) + 1;
    SW.chancellery(Q);
  };

  // Our Chancellor's decrees. Each costs political capital, takes the turn and adds to the office's precedent.
  SW.DECREES = {
    arrest: {need: 'guard', cost: 1, fx: function (Q) { Q.corruption -= 4; Q.fear += 3; }},
    relief: {need: 'governors', cost: 1, fx: function (Q) { Q.rim_hardship = Math.max(0, Q.rim_hardship - 3); }},
    banks: {need: 'banks', cost: 1, fx: function (Q) { Q.debt = Math.max(0, (Q.debt || 0) - 5); }},
    army: {need: 'army', cost: 1, ok: function (Q) { return Q.war; }, fx: function (Q) { SW.pushFront(Q, SW.weakestFront(Q), 1.5); }},
    address: {need: 'holonet', cost: 1, fx: function (Q) { SW.momentum(Q, 1, 'the Chancellor\'s address'); }},
    investigate: {need: 'bureau', cost: 2, ok: function (Q) { return Q.war_shadows_seen; },
      fx: function (Q) { Q.evidence += 1; Q.jedi_suspicion += 0.5; SW.updateSithStage(Q); }}
  };
  SW.decreeOk = function (Q, id) {
    var D = SW.DECREES[id];
    return !!(Q.chan_can_decree && D && Q['chp_' + D.need + '_state'] === 'held' && (!D.ok || D.ok(Q)) && Q.capital >= D.cost);
  };
  SW.decree = function (Q, id) {
    var D = SW.DECREES[id];
    if (!SW.decreeOk(Q, id)) return 0;
    Q.capital -= D.cost; D.fx(Q);
    Q.decrees_used = (Q.decrees_used || 0) + 1; Q.turn_actions += 1; Q.decree_last = id;
    SW.chancellery(Q);
    return 1;
  };
  // Turn the Bureau on a rival bloc: its support, its leader's hold on it, and its view of us all suffer.
  SW.decreeRival = function (Q, b) {
    if (!Q.chan_can_decree || Q.chp_bureau_state !== 'held' || !Q.war_shadows_seen || Q.capital < 2 || b === 'rc' || b === 'cis' || (Q.parties || []).indexOf(b) < 0) return 0;
    Q.capital -= 2;
    for (var i = 0; i < SW.REGIONS.length; i++) Q[SW.REGIONS[i] + '_' + b] *= 0.93;
    Q[b + '_relation'] = (Q[b + '_relation'] || 0) - 6;
    Q[b + '_grudge'] = (Q[b + '_grudge'] || 0) + 1;
    Q[b + '_scandal'] = (Q[b + '_scandal'] || 0) + 0.3;
    SW.callCongress(Q, b, 'scandal');
    Q.decrees_used = (Q.decrees_used || 0) + 1; Q.turn_actions += 1; Q.decree_last = 'rival'; Q.decree_rival_name = SW.name(Q, b);
    SW.computeSupport(Q); SW.chancellery(Q);
    return 1;
  };
  // Hand a power back to the Senate: its check takes effect as if passed.
  SW.returnPower = function (Q, id) {
    var P = SW.CHAN_POWER[id];
    if (!P || !Q.rc_chancellor || Q.game_ending || Q['chp_' + id + '_state'] !== 'held') return 0;
    P.ret(Q);
    Q['chp_' + id] = 1; Q['chp_' + id + '_by'] = 'returned to the Senate by our Chancellor';
    Q.decrees_used = Math.max(0, (Q.decrees_used || 0) - 1); Q.faith += 3; Q.turn_actions += 1;
    Q.powers_returned_by_us = (Q.powers_returned_by_us || 0) + 1; Q.returned_name = P.name;
    SW.chancellery(Q);
    return 1;
  };
  // The Chancellery screen: the office, its powers, the government and the decrees' record.
  SW.chancelleryStrings = function (Q) {
    SW.chancellery(Q);
    var esc = function (s) { return String(s === undefined ? '' : s); };
    var who = Q.rc_chancellor ? 'one of ours' : SW.name(Q, Q.chancellor_bloc);
    var months = Q.chan_months || 0;
    var tenure = months < 12 ? 'less than a year' : (Math.floor(months / 12) === 1 ? 'a year' : Math.floor(months / 12) + ' years');
    var term;
    if (Q.election_suspended || Q.next_election_date >= 999) term = 'No election is in sight.';
    else if (Q.next_election_date > Q.date) { var m = Q.next_election_date - Q.date; term = 'The next elections are ' + (m <= 3 ? 'weeks away' : (m < 12 ? 'months away' : 'about ' + Math.round(m / 12) + ' year' + (Math.round(m / 12) === 1 ? '' : 's') + ' away')) + '.'; }
    else term = 'Elections are due.';
    Q.chan_office_html = '<p><b>Supreme Chancellor ' + esc(Q.chancellor) + '</b> (' + who + ') has held the office for ' + tenure + '. ' +
      'The Vice Chair is ' + esc(Q.vice_chair) + '. ' + term + '</p>';
    var rows = '';
    for (var i = 0; i < SW.CHANCELLERY_POWERS.length; i++) {
      var P = SW.CHANCELLERY_POWERS[i], st = Q['chp_' + P.id + '_state'], cell;
      if (st === 'held') cell = '<span class="bad">held</span>';
      else if (st === 'checked') cell = '<span class="good">\u2714 ' + esc(Q['chp_' + P.id + '_by']) + '</span>';
      else if (st === 'suspended') cell = '<span class="warn">' + P.suspended[1] + '</span>';
      else cell = '<span class="sb-dim">not yet</span>';
      rows += '<tr><td><b>' + P.name + '</b>' + (st === 'held' ? '<br><span class="sb-note">' + P.what + '</span>' : '') + '</td><td class="st">' + cell + '</td></tr>';
    }
    Q.chan_powers_html = '<p class="chan-scale">' + Q.chan_scale + ' <span class="sb-dim">(' + Q.chan_powers + ' of ' + SW.CHANCELLERY_POWERS.length + ' powers held)</span></p>' +
      '<table class="chan">' + rows + '</table>';
    var g = '';
    for (var c = 0; c < SW.COMMITTEES.length; c++) {
      var cm = SW.COMMITTEES[c], b = Q['chair_' + cm];
      var act = b && b !== 'rc' && Q['ministry_act_by_' + cm] === b ? Q['ministry_act_' + cm] : '';
      g += '<tr><td><b>' + SW.COMMITTEE_NAMES[cm] + '</b><br><span class="sb-note">' + (b ? esc(Q['minister_' + cm + '_name']) + ', ' + SW.name(Q, b) : 'vacant') +
        (act ? '. Lately, it ' + act + '.' : '') + '</span></td></tr>';
    }
    Q.chan_govt_html = '<table class="chan">' + g + '</table>';
    var rec = [];
    if (Q.decrees_used > 0) rec.push('Our Chancellors\u2019 decrees have set a precedent of <b>' + Q.decrees_used + '</b>. Each one weighs on faith in the Republic, makes the Restoration harder, and will serve whoever holds the office next.');
    if (Q.powers_returned_by_us > 0) rec.push('Our Chancellors have returned ' + Q.powers_returned_by_us + ' power' + (Q.powers_returned_by_us === 1 ? '' : 's') + ' to the Senate.');
    if (Q.by_decrees > 0 && !Q.rc_chancellor) rec.push('The office has ruled by decree ' + Q.by_decrees + ' time' + (Q.by_decrees === 1 ? '' : 's') + '.');
    Q.chan_record_html = rec.length ? '<p>' + rec.join(' ') + '</p>' : '';
    Q.chan_record = rec.length;
    for (var p = 0; p < SW.BLOCS.length; p++) {
      var rb = SW.BLOCS[p];
      Q['rv_' + rb + '_ok'] = (rb !== 'rc' && rb !== 'cis' && (Q.parties || []).indexOf(rb) >= 0) ? 1 : 0;
      Q['rv_' + rb + '_name'] = SW.name(Q, rb);
    }
  };
  // Reform by decree: a committee step that would go to the Senate passes without a vote.
  // Only steps decided by a vote; the card's own conditions and costs still apply.
  SW.DECREE_STEPS = [
    ['anticartel', 'sa_finance.anticartel', 'Anti-Cartel Legislation'], ['breakup', 'sa_finance.breakup', 'Break up the Trade Federation'],
    ['independent', 'sa_finance.independent', 'The Banking Clan\'s independence'], ['bonds', 'sa_finance.bonds', 'Republic bonds'],
    ['ethics', 'sa_judiciary.ethics', 'The ethics law'], ['integrity', 'sa_judiciary.integrity', 'The Office of Public Integrity'], ['expel', 'sa_judiciary.expel', 'Expel corrupt senators'],
    ['civil_service', 'sa_judiciary.civil_service', 'The Civil Service Act'], ['oversight_act', 'sa_judiciary.oversight_act', 'The Intelligence Oversight Act'],
    ['compor', 'sa_judiciary.compor', 'The Commission for the Protection of the Republic'],
    ['army_oversight', 'sa_security.oversight', 'Senate oversight of the army'], ['command', 'sa_security.command', 'The Senate Command Act'],
    ['guard', 'sa_security.guard', 'The Guard returned to the Senate'], ['charter', 'sa_security.charter', 'The Judicial Forces Charter'],
    ['relief_act', 'sa_rimaffairs.relief_act', 'The Rim Relief Act'], ['enfranchise', 'sa_rimaffairs.enfranchise', 'Rim enfranchisement'], ['assembly', 'sa_rimaffairs.assembly', 'The Rim Assembly'],
    ['abolition', 'sa_rimaffairs.abolition', 'Abolition'],
    ['sunset', 'sa_constitution.sunset', 'Sunset clauses'], ['powers_review', 'sa_constitution.powers_review', 'The Powers Review Act'],
    ['terms', 'sa_constitution.terms', 'Term limits entrenched'], ['vonc', 'sa_constitution.vonc', 'A constructive vote of no confidence'], ['speaker', 'sa_constitution.speaker', 'An independent Speaker'],
    ['independence', 'sa_jedi_affairs.independence', 'The Jedi Independence Amendment'], ['service', 'sa_jedi_affairs.service', 'The Jedi Service Act'], ['compact', 'sa_jedi_affairs.compact', 'A Senate–Jedi Compact']
  ];
  // Which steps can be decreed now: the card option's own view-if and choose-if must pass.
  SW.decreeScan = function (Q, engine) {
    var any = 0;
    for (var i = 0; i < SW.DECREE_STEPS.length; i++) {
      var S = SW.DECREE_STEPS[i], sc = engine && engine.game && engine.game.scenes[S[1]], ok = 0;
      if (Q.chan_can_decree && sc) {
        try {
          ok = (!sc.viewIf || sc.viewIf.call(engine, engine.state, Q)) && (!sc.chooseIf || sc.chooseIf.call(engine, engine.state, Q)) ? 1 : 0;
        } catch (e) { ok = 0; }
      }
      Q['dok_' + S[0]] = ok; any += ok;
    }
    Q.dok_any = any ? 1 : 0;
    return any;
  };
  SW.decreeBegin = function (Q, id) {
    var S = null;
    for (var i = 0; i < SW.DECREE_STEPS.length; i++) if (SW.DECREE_STEPS[i][0] === id) S = SW.DECREE_STEPS[i];
    if (!S || !Q.chan_can_decree) return 0;
    Q.decree_mode = 1; Q.decree_step = id; Q.decree_step_name = S[2];
    Q.decrees_used = (Q.decrees_used || 0) + 1; Q.decrees_reform = (Q.decrees_reform || 0) + 1; Q.turn_actions += 1; Q.faith -= 3; Q.decree_last = 'reform';
    return 1;
  };

  // ------------------------------------------------------------------ chancellor elections
  SW.candidateName = function (Q, b) {
    if (b === 'pal') return Q.pal_can_run === 0 ? SW.palStandin(Q) : 'Palpatine';
    return Q[b + '_leader'] || SW.name(Q, b);
  };

  SW.resultText = function (Q, res, label) {
    var h = '<div class="vote"><b>' + label + '</b><br>';
    for (var i = 0; i < res.length; i++) {
      h += SW.span(Q, res[i].bloc, SW.candidateName(Q, res[i].bloc)) + ': ' + res[i].share.toFixed(1) + '%<br>';
    }
    return h + '</div>';
  };

  // both ballots at once, with no choices between them
  SW.holdElection = function (Q) {
    SW.electionFirst(Q);
    if (!Q.el_done) SW.electionSecond(Q);
    return Q.el_winner;
  };

  // A Caucus Chancellor who has served two terms must step aside for a new candidate.
  SW.rotateRcLeader = function (Q) {
    if (!(Q.chancellor_bloc === 'rc' && Q.rc_terms >= 2 && Q.rc_leader === Q.chancellor)) return;
    var next = ['Bail Organa', 'Mon Mothma', 'Padmé Amidala', 'Garm Bel Iblis'].filter(function (n) { return n !== Q.chancellor; });
    if (!Q.padme_senator || !Q.padme_alive) next = next.filter(function (n) { return n !== 'Padmé Amidala'; });
    if (Q.date < 36) next = next.filter(function (n) { return n !== 'Mon Mothma'; });
    Q.rc_leader = next[0] || 'Bail Organa';
  };

  SW.dropPartnerCandidates = function (Q) {
    var inc = Q.chancellor_bloc;
    if (Q.elections_held < 1 || Q.el_cands.indexOf(inc) < 0 || Q.coalition_dissent >= 3) return;
    Q.el_cands = Q.el_cands.filter(function (b) { return b === inc || (Q.govt_blocs || []).indexOf(b) < 0; });
    if (Q.el_cands.length < 2) {
      var others = Q.parties.filter(function (b) { return b !== inc && b !== 'cis' && b !== 'rfc' && (Q.govt_blocs || []).indexOf(b) < 0; });
      others.sort(function (a, b) { return (Q[b + '_r'] || 0) - (Q[a + '_r'] || 0); });
      if (others[0]) Q.el_cands.push(others[0]);
    }
  };

  SW.installChancellor = function (Q, bloc) {
    var prev = Q.chancellor;
    Q.chancellor = SW.candidateName(Q, bloc);
    Q.chancellor_bloc = bloc;
    Q.next_election_date = Q.date + 48;
    Q.election_due = 0;
    Q.govt_fell_now = 0;
    Q.elections_held += 1;
    Q.naboo_sympathy = 0;
    if (prev === 'Valorum' && Q.chancellor !== 'Valorum') { if (!Q.valorum_fallen) Q.valorum_fell_date = Q.date; Q.valorum_fallen = 1; }
    if (bloc === 'pal') { if (Q.chancellor === 'Palpatine') { Q.pal_was_chancellor = 1; Q.pal_terms = (Q.pal_terms || 0) + 1; } }
    if (bloc === 'rc') { Q.rc_was_chancellor = 1; Q.rc_terms = (Q.rc_terms || 0) + 1; }
    SW.recomputeGovt(Q);
  };

  // coalition options for an rc-led government, exposed as flat qualities for the scene
  SW.prepareRcCoalitions = function (Q) {
    var opts = SW.rcCoalitionOptions(Q);
    for (var i = 0; i < 8; i++) {
      var o = opts[i];
      Q['el_opt' + i] = o ? 1 : 0;
      Q['el_opt' + i + '_ok'] = (o && o.seats >= 50 && !o.cold && !o.block) ? 1 : 0;
      if (o && o.seats >= 50 && o.block) Q.coal_refused = (Q.coal_refused || 0) + 1;
      Q['el_opt' + i + '_bureau'] = o ? SW.bureauReaction(SW.bureauComfort(Q, o.blocs)) + ' ' + SW.priceText(Q, o.blocs) : '';
      Q['el_opt' + i + '_label'] = o ? (o.name + ': ' + o.blocs.filter(function (b) { return b !== 'rc'; }).map(function (b) { return SW.name(Q, b); }).join(', ') + ' (' + o.seats.toFixed(1) + '%)') : '';
      Q['el_opt' + i + '_why'] = o ? (o.seats < 50 ? 'Not enough seats.' : (o.block ? o.block : (o.cold || ''))) : '';
    }
    Q.el_opts = opts.map(function (o) { return o.blocs; });
    Q.coal_all_blocked = opts.some(function (o) { return o.seats >= 50 && !o.cold && !o.block; }) ? 0 : 1;
    var mg = SW.relOk(Q, 'rc', 'ind') ? ['rc', 'ind'] : ['rc'];
    var ms = SW.minoritySupporters(Q, mg);
    Q.el_min_support_names = SW.listNames(Q, ms); Q.el_min_support_n = ms.length;
    if (Q.coal_all_blocked) Q.coal_blocked_games = (Q.coal_blocked_games || 0) + 1;
  };

  SW.chooseRcCoalition = function (Q, i) {
    var blocs = Q.el_opts[i];
    SW.setGovt(Q, blocs);
    SW.bureauJoin(Q, blocs);
    SW.openChairs(Q, Math.round(Q.rc_r) + 15);
    SW.acceptPrices(Q, blocs);
    SW.assignChairs(Q);
  };

  SW.joinGovernment = function (Q) {
    var blocs = Q.govt_blocs.slice();
    if (blocs.indexOf('rc') < 0) blocs.push('rc');
    SW.setGovt(Q, blocs, Q.coalition_name);
    SW.bureauJoin(Q, blocs);
    SW.openChairs(Q, Math.round(Q.rc_r * 0.8));
    Q.el_join_pledge = '';
    // a kingmaker's reward: the chair the new Chancellor promised between the ballots
    if (Q.el_deal_won && Q.el_deal_chair) { Q['chair_' + Q.el_deal_chair] = 'rc'; Q.el_deal_won = 0; SW.recomputeGovt(Q); }
  };

  // Every new government renegotiates the committee chairs from scratch: the Caucus gives up the
  // chairs it held and buys back what it can. Each partner insists on at least one chair.
  SW.openChairs = function (Q, leverage, keepPromised) {
    for (var i = 0; i < SW.COMMITTEES.length; i++) {
      if (Q['chair_' + SW.COMMITTEES[i]] === 'rc') Q['chair_' + SW.COMMITTEES[i]] = '';
      if (!keepPromised) { Q['chair_res_' + SW.COMMITTEES[i]] = 0; Q['chair_res_' + SW.COMMITTEES[i] + '_name'] = ''; }
    }
    SW.assignChairs(Q);
    var partners = (Q.govt_blocs || []).filter(function (b) { return b !== 'rc'; }).length || 1;
    Q.chair_partners = partners;
    Q.chair_cap = Math.max(1, SW.COMMITTEES.length - partners);
    Q.rc_chairs = 0;
    Q.leverage = leverage;
  };

  // ------------------------------------------------------------------ the Chancellor race
  SW.electionCandidates = function (Q, seatKey) {
    var s = function (b) { return Q.parties.indexOf(b) >= 0 ? (Q[b + (seatKey || '_r')] || 0) : 0; };
    var c = [];
    if (s('rc') >= 7) c.push('rc');
    if (s('mod') >= 5) c.push('mod');
    if (!Q.sidious_defeated && !Q.pal_disgraced && s('pal') >= 3) c.push('pal');
    if (s('rim') >= 10) c.push('rim');
    if (Q.date >= 108 && s('sec') >= 14) c.push('sec');
    if (c.length < 2) c.push('ind');
    return c;
  };

  // The Caucus's possible nominees, and who each appeals to (bonuses with each bloc).
  SW.NOMINEES = {
    antilles: {name: 'Bail Antilles', appeal: {mod: 6, ind: 3, rim: -6}, note: 'A steady Core statesman: strong with the Moderates and Independents, cool with the Rim.',
      ok: function (Q) { return !Q.antilles_gone; }},
    organa: {name: 'Bail Organa', appeal: {mod: 3, ind: 3, rim: 2, sec: -2}, note: 'Trusted across the aisle, with friends in the Jedi Temple: a broad, modest appeal everywhere.',
      ok: function (Q) { return Q.antilles_gone; }},
    mothma: {name: 'Mon Mothma', appeal: {mod: 3, ind: 5, sec: -9, guild: -4}, note: 'The Senate\'s finest speaker: the Core and the peace-minded admire her; the Security Bloc does not.',
      ok: function (Q) { return (Q.mothma_joined || Q.date >= 36) && !(Q.mothma_out_until > Q.date); }},
    amidala: {name: 'Padmé Amidala', appeal: {rim: 5, ind: 2, guild: -4, sec: -2}, sympathy: 1, note: 'A former Queen of Naboo: popular in the Mid Rim, and she takes the sympathy vote away from Palpatine.',
      ok: function (Q) { return Q.padme_senator && Q.padme_alive; }},
    bel_iblis: {name: 'Garm Bel Iblis', appeal: {sec: 9, mod: 1, guild: -9, ind: -2}, note: 'A Corellian hawk: the Security Bloc respects him; the guilds loathe him.',
      ok: function (Q) { return Q.date >= 24 && !(Q.bel_iblis_out_until > Q.date); }}
  };
  SW.nomineesOpen = function (Q) {
    var n = 0, termed = Q.chancellor_bloc === 'rc' && Q.rc_terms >= 2 ? Q.chancellor : '';
    for (var id in SW.NOMINEES) {
      var N = SW.NOMINEES[id], ok = N.ok(Q) && N.name !== termed ? 1 : 0;
      Q['nom_ok_' + id] = ok; if (ok) n++;
      var parts = [];
      for (var b in N.appeal) if (Q.parties.indexOf(b) >= 0) parts.push((N.appeal[b] > 0 ? '+' : '−') + SW.name(Q, b));
      Q['nom_sub_' + id] = N.note + (N.name === Q.chancellor ? ' The incumbent.' : '');
    }
    Q.el_nominees = n;
    // the sitting leader is the default nominee
    var def = '';
    for (var k in SW.NOMINEES) if (Q['nom_ok_' + k] && SW.NOMINEES[k].name === Q.rc_leader) def = k;
    if (!def) for (var k2 in SW.NOMINEES) if (Q['nom_ok_' + k2]) { def = k2; break; }
    Q.el_nominee_default = def;
  };
  SW.nominate = function (Q, id) {
    var N = SW.NOMINEES[id];
    if (!N) return;
    Q.rc_leader = N.name; Q.el_nominee = id; Q['nominated_' + id] = (Q['nominated_' + id] || 0) + 1;
    for (var b in N.appeal) Q['bonus_' + b + '_for_rc'] = (Q['bonus_' + b + '_for_rc'] || 0) + N.appeal[b];
    if (N.sympathy && Q.naboo_sympathy) for (var i = 0; i < Q.parties.length; i++) Q['bonus_' + Q.parties[i] + '_for_pal'] = (Q['bonus_' + Q.parties[i] + '_for_pal'] || 0) - 8;
    SW.electionIntro(Q);
  };

  // Rival candidates' strengths and weaknesses, applied as bonuses and described in the intro.
  SW.rivalTraits = function (Q) {
    var add = function (a, c, v) { Q['bonus_' + a + '_for_' + c] = (Q['bonus_' + a + '_for_' + c] || 0) + v; };
    Q.el_bought_amt = 0;
    for (var i = 0; i < Q.el_cands.length; i++) {
      var c = Q.el_cands[i], t = '';
      if (c === 'pal') {
        var bits = [];
        if (Q.naboo_sympathy) bits.push('the sympathy vote for invaded Naboo');
        if (Q.corruption > 60) {
          Q.el_bought_amt = SW.round1((Q.corruption - 60) / 2.5);
          add('guild', 'pal', Q.el_bought_amt); add('ind', 'pal', Q.el_bought_amt); add('mod', 'pal', Q.el_bought_amt * 0.6);
          bits.push('quiet money from backers no one can name');
        }
        if (Q.pal_can_run === 0) bits.push('the Chancellery\'s machine');
        t = bits.length ? bits.join('; ') : 'a reputation for moderation';
      } else if (c === 'mod') {
        if (Q.valorum_scandal && Q.mod_leader === 'Finis Valorum') t = 'the establishment, tarred by the Valorum scandals';
        else { t = 'the establishment: the Core trusts them'; add('guild', 'mod', 3); }
      } else if (c === 'rim') {
        t = 'a Rim populist: the Outer Rim\'s champion, distrusted in the Core';
        add('mod', 'rim', -5); add('guild', 'rim', -5); add('rfc', 'rim', 6);
      } else if (c === 'sec') {
        var fv = SW.round1((Q.fear - 40) / 4);
        t = 'law and order: ' + (fv > 0 ? 'the frightened Senate listens' : 'a hard sell in calm times');
        for (var j = 0; j < Q.parties.length; j++) if (Q.parties[j] !== 'sec') add(Q.parties[j], 'sec', fv);
      } else if (c === 'ind') t = 'a compromise figure';
      Q['el_trait_' + c] = t;
    }
  };
  SW.electionIntro = function (Q) {
    var h = '<div class="panel"><b>Candidates</b><br>';
    for (var i = 0; i < Q.el_cands.length; i++) {
      var b = Q.el_cands[i];
      var trait = b === 'rc' ? (Q.el_nominee && SW.NOMINEES[Q.el_nominee] ? SW.NOMINEES[Q.el_nominee].note : '') : (Q['el_trait_' + b] || '');
      h += SW.span(Q, b, SW.candidateName(Q, b)) + ' (' + SW.name(Q, b) + ', ' + (Q[b + '_r'] || 0).toFixed(1) + '% of the Senate)' + (trait ? ' <i>' + trait + '</i>' : '') + '<br>';
    }
    h += '</div>';
    Q.el_text = h;
    return h;
  };

  SW.electionOpen = function (Q) {
    Q.el_cands = SW.electionCandidates(Q);
    SW.dropPartnerCandidates(Q);
    var c = Q.el_cands;
    Q.el_has_rc = c.indexOf('rc') >= 0 ? 1 : 0;
    Q.el_has_mod = c.indexOf('mod') >= 0 ? 1 : 0;
    Q.el_has_rim = c.indexOf('rim') >= 0 ? 1 : 0;
    Q.el_has_pal = c.indexOf('pal') >= 0 ? 1 : 0;
    Q.el_has_sec = c.indexOf('sec') >= 0 ? 1 : 0;
    Q.el_backing = ''; Q.el_nominee = ''; Q.el_exposed = 0; Q.el_pledges_made = 0; Q.el_deal = ''; Q.el_deal_chair = ''; Q.el_done = 0;
    Q.el_courted_mod = 0; Q.el_courted_rim = 0; Q.el_courted_ind = 0; Q.el_courted_guild = 0; Q.el_courted_sec = 0; Q.el_attacked = 0;
    // last term's pledges lapse with the old government; a pledge kept for the whole term earns real gratitude
    for (var p in SW.PLEDGES) {
      if (Q['pl_' + p] && Q['pledge_' + p]) { SW.deliver(Q, Q['pledge_' + p], 10, 'on its promise of ' + SW.PLEDGES[p].name); Q.pledges_kept = (Q.pledges_kept || 0) + 1; }
      Q['pledge_' + p] = ''; Q['pl_' + p] = 0;
    }
    if (!Q.whip_seed || Q.whip_for !== Q.next_election_date) Q.whip_seed = 1 + Math.floor(SW.rnd() * 9999);
    SW.rivalTraits(Q);
    SW.nomineesOpen(Q);
    SW.electionIntro(Q);
    SW.warChest(Q);
    Q.el_incumbent = Q.chancellor;
    Q.el_sec_leader = Q.sec_leader;
    SW.pledgeOptions(Q);
  };
  // the Caucus picks whom to back; what the trail earned for the Caucus partly carries over to an ally
  SW.elBack = function (Q, b) {
    Q.el_backing = b;
    if (b !== 'rc') for (var i = 0; i < Q.parties.length; i++) {
      var k = 'bonus_' + Q.parties[i] + '_for_rc';
      if (Q[k] > 0) Q['bonus_' + Q.parties[i] + '_for_' + b] = (Q['bonus_' + Q.parties[i] + '_for_' + b] || 0) + Q[k] * 0.5;
    }
    SW.pledgeOptions(Q);
  };

  // ---- the whip count: how each bloc is leaning, as far as our whips can tell
  SW.whipExact = function (Q) { return (Q.chair_judiciary === 'rc' || Q.evidence >= 4 || Q.adv_organa || Q.adv_valorum) ? 1 : 0; };
  SW.whipFog = function (Q, b, c) {
    var s = (Q.whip_seed || 1) + '|' + b + '|' + c, h = 7;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 10007;
    return (h % 13) - 6;
  };
  SW.whipCount = function (Q, cands, backing, seatKey) {
    var exact = SW.whipExact(Q), saveA = Q.el_active, saveB = Q.el_backing;
    Q.el_active = 1; if (backing !== undefined) Q.el_backing = backing;
    var res = SW.runElection(Q, cands, {fog: !exact, exact: exact, seatKey: seatKey || '_r'});
    var votes = SW._lastVotes;
    Q.el_active = saveA; Q.el_backing = saveB;
    return {res: res, votes: votes, exact: exact};
  };
  SW.leanWhy = function (Q, b, c) {
    var bonus = Q['bonus_' + b + '_for_' + c] || 0;
    for (var p in SW.PLEDGES) if (Q['pledge_' + p] === b && c === Q.el_backing) return 'our pledge';
    if (bonus >= 10) return c === Q.el_backing ? 'courted by us' : 'favours and money';
    if (c === 'pal' && Q.naboo_sympathy) return 'sympathy for Naboo';
    if (c === 'pal' && Q.el_bought_amt > 0 && !Q.el_exposed) return 'Chancellery money';
    if (c === Q.chancellor_bloc && Q.elections_held > 0) return 'the incumbent';
    var L = SW.leader(Q, b);
    if (L.likes && L.likes[c] >= 5) return 'their leader\'s ties';
    if (c === 'sec' && Q.fear > 50) return 'fear';
    if (c === 'rc' && (Q[b + '_relation'] || 0) >= 50) return 'good relations with us';
    if (c === 'rc' && (Q[b + '_relation'] || 0) < 25) return '';
    return '';
  };
  SW.whipText = function (Q, cands, backing, seatKey) {
    if (!cands) { cands = SW.electionCandidates(Q, '_votes'); backing = cands.indexOf('rc') >= 0 ? 'rc' : ''; seatKey = '_votes'; }
    var w = SW.whipCount(Q, cands, backing, seatKey);
    var h = '<div class="panel whip"><b>Our whip count</b> <span class="sb-tag">' + (w.exact ? 'reliable' : 'rough: could be several points out') + '</span><br>';
    for (var i = 0; i < w.res.length; i++) h += SW.span(Q, w.res[i].bloc, SW.candidateName(Q, w.res[i].bloc)) + ': about ' + Math.round(w.res[i].share) + '%<br>';
    var leans = [];
    for (var b in w.votes) {
      var v = w.votes[b];
      if (v.own || b === 'cis') continue;
      var why = SW.leanWhy(Q, b, v.to);
      leans.push(SW.name(Q, b) + ' → ' + SW.candidateName(Q, v.to) + (v.alt ? ' (wavering: ' + SW.candidateName(Q, v.alt) + ')' : '') + (why ? ', ' + why : ''));
    }
    if (leans.length) h += '<span class="sb-note">' + leans.join(' · ') + '</span>';
    if (w.res[0] && w.res[0].share < 50 && w.res.length > 1) h += '<br><i>No one has a majority yet: a second ballot looks likely.</i>';
    return h + '</div>';
  };

  // ---- pledges: promises made for votes, which bind us until the next Chancellor election
  SW.PLEDGES = {
    no_tariffs: {bloc: 'guild', name: 'no trade-route tariffs', label: 'Promise the guilds no trade-route tariffs'},
    no_levy: {bloc: 'mod', name: 'no levy on the Core', label: 'Promise the Moderates no levy on the Core'},
    rim_relief: {bloc: 'rim', name: 'Rim relief in every budget', label: 'Promise the Rim relief in every budget'},
    defence: {bloc: 'sec', name: 'defence spending in every budget', label: 'Promise the Security Bloc defence spending in every budget'},
    no_powers: {bloc: 'ind', name: 'no new emergency powers', label: 'Promise the Independents no new emergency powers'}
  };
  SW.PLEDGE_CLASH = {rim_relief: 'defence', defence: 'rim_relief'};
  SW.pledgeBloc = function (Q, id) {
    var b = SW.PLEDGES[id].bloc;
    if (id === 'rim_relief' && Q.parties.indexOf('rim') < 0 && Q.parties.indexOf('rfc') >= 0) b = 'rfc';
    return b;
  };
  SW.pledgeOptions = function (Q) {
    for (var id in SW.PLEDGES) {
      var b = SW.pledgeBloc(Q, id);
      Q['plo_' + id] = (SW.PLEDGES[id].label && Q.parties.indexOf(b) >= 0 && b !== Q.el_backing && !Q['pl_' + id] && !(SW.PLEDGE_CLASH[id] && Q['pl_' + SW.PLEDGE_CLASH[id]])) ? 1 : 0;
    }
  };
  SW.makePledge = function (Q, id, bloc, bonus) {
    if (!SW.PLEDGES[id]) return;
    bloc = bloc || SW.pledgeBloc(Q, id);
    Q['pledge_' + id] = bloc; Q['pl_' + id] = 1;
    if (id === 'no_powers') { Q.ep_seen = Q.emergency_powers; Q.ret_seen = Q.rc_emergency_taken || 0; }
    if (bonus && Q.el_backing) Q['bonus_' + bloc + '_for_' + Q.el_backing] = (Q['bonus_' + bloc + '_for_' + Q.el_backing] || 0) + bonus;
    Q['pledge_' + id + '_name'] = SW.name(Q, bloc);
    Q.pledges_made = (Q.pledges_made || 0) + 1;
    var pls = SW.pledgeList(Q); Q.pledge_count = pls.length; Q.pledge_text = pls.join('; ');
    SW.pledgeOptions(Q);
  };
  SW.pledgeList = function (Q) {
    var out = [];
    for (var id in SW.PLEDGES) if (Q['pl_' + id]) out.push(SW.PLEDGES[id].name + ' (to the ' + SW.name(Q, Q['pledge_' + id]) + ')');
    return out;
  };
  SW.breakPledge = function (Q, id, how) {
    if (!Q['pl_' + id]) return;
    var b = Q['pledge_' + id];
    Q['pledge_' + id] = ''; Q['pl_' + id] = 0;
    if (!b || Q.parties.indexOf(b) < 0) return;
    Q[b + '_relation'] = (Q[b + '_relation'] || 0) - 8;
    Q[b + '_grudge'] = (Q[b + '_grudge'] || 0) + 3;
    if (Q.rc_in_govt && (Q.govt_blocs || []).indexOf(b) >= 0) Q.coalition_dissent += 2;
    SW.momentum(Q, -0.4, 'a broken promise to the ' + SW.name(Q, b));
    Q.pledges_broken = (Q.pledges_broken || 0) + 1;
    Q.pb_ready = 1; Q.pb_bloc = b; Q.pb_name = SW.name(Q, b); Q.pb_what = SW.PLEDGES[id].name; Q.pb_how = how || 'the Caucus did otherwise';
    Q.pb_leader = Q[b + '_leader'] || ('the leader of the ' + SW.name(Q, b));
    Q.pb_partner = (Q.rc_in_govt && (Q.govt_blocs || []).indexOf(b) >= 0) ? 1 : 0;
    if (Q._reactions) SW.react(Q, 'This breaks our pledge of ' + SW.PLEDGES[id].name + ' to the ' + SW.name(Q, b) + '.');
  };
  SW.checkBudgetPledges = function (Q, rev, pri) {
    if (rev === 'tariffs') SW.breakPledge(Q, 'no_tariffs', 'the Caucus backed trade-route tariffs');
    if (rev === 'levy') SW.breakPledge(Q, 'no_levy', 'the Caucus backed a levy on the Core');
    if (pri !== 'relief') SW.breakPledge(Q, 'rim_relief', 'the Caucus backed a budget without Rim relief');
    if (pri !== 'defence') SW.breakPledge(Q, 'defence', 'the Caucus backed a budget without defence spending');
  };
  // the pledges a budget would break, as a warning line ('' if none); pri null checks the revenue alone
  SW.pledgesBrokenBy = function (Q, rev, pri) {
    var out = [];
    if (rev === 'tariffs' && Q.pl_no_tariffs) out.push('no trade-route tariffs');
    if (rev === 'levy' && Q.pl_no_levy) out.push('no levy on the Core');
    if (pri !== null && pri !== 'relief' && Q.pl_rim_relief) out.push('Rim relief in every budget');
    if (pri !== null && pri !== 'defence' && Q.pl_defence) out.push('defence spending in every budget');
    return out.length ? 'Breaks our pledge of ' + out.join(' and ') + '.' : '';
  };
  SW.pledgeTick = function (Q) {
    if (Q.pl_no_powers) {
      if (Q.emergency_powers > (Q.ep_seen || 0) && (Q.powers_rc_yes || (Q.rc_emergency_taken || 0) > (Q.ret_seen || 0)))
        SW.breakPledge(Q, 'no_powers', 'the Caucus supported new emergency powers');
      Q.ep_seen = Q.emergency_powers; Q.ret_seen = Q.rc_emergency_taken || 0;
    }
    Q.powers_rc_yes = 0;
    var pls = SW.pledgeList(Q);
    Q.pledge_count = pls.length; Q.pledge_text = pls.join('; ');
    // budget warnings
    Q.bdw_tariffs = Q.pl_no_tariffs; Q.bdw_levy = Q.pl_no_levy; Q.bdw_relief = Q.pl_rim_relief; Q.bdw_defence = Q.pl_defence;
  };

  // ---- the ballots
  SW.electionFirst = function (Q) {
    Q.el_active = 1;
    var proj = SW.whipCount(Q, Q.el_cands, Q.el_backing, '_r');
    Q.el_proj_share = 0;
    for (var i = 0; i < proj.res.length; i++) if (proj.res[i].bloc === Q.el_backing) Q.el_proj_share = proj.res[i].share;
    Q.el_proj_exact = proj.exact; Q.el_proj_for = Q.el_backing;
    var projVotes = proj.votes;
    Q.el_active = 1;
    var res = SW.runElection(Q, Q.el_cands);
    var votes = SW._lastVotes;
    Q.el_res1 = res.map(function (r) { return r.bloc; });
    Q.el_result = SW.resultText(Q, res, 'First ballot');
    Q.el_act_share = 0;
    for (var j = 0; j < res.length; j++) if (res[j].bloc === Q.el_backing) Q.el_act_share = res[j].share;
    // who did not vote the way our whips expected
    var sw = [];
    for (var b in votes) if (projVotes[b] && !votes[b].own && projVotes[b].to !== votes[b].to && b !== 'cis') sw.push('the ' + SW.name(Q, b) + ' broke for ' + SW.candidateName(Q, votes[b].to));
    Q.el_switch_note = sw.length ? sw.slice(0, 3).join('; ') : '';
    if (res[0].share >= 50 || res.length < 2) { Q.el_done = 1; SW.electionFinish(Q, res[0].bloc); return; }
    Q.el_done = 0; Q.second_ballots = (Q.second_ballots || 0) + 1;
    Q.el_top = [res[0].bloc, res[1].bloc];
    Q.eb_a = res[0].bloc; Q.eb_b = res[1].bloc;
    Q.eb_a_name = SW.candidateName(Q, Q.eb_a); Q.eb_b_name = SW.candidateName(Q, Q.eb_b);
    Q.eb_ours_in = (Q.el_backing && Q.el_top.indexOf(Q.el_backing) >= 0) ? 1 : 0;
    Q.eb_ours_out = Q.el_backing && !Q.eb_ours_in ? 1 : 0;
    Q.eb_backing_name = Q.el_backing ? SW.candidateName(Q, Q.el_backing) : '';
    var out = res.slice(2).map(function (r) { return r.bloc; });
    Q.eb_out = out;
    Q.eb_out_main = out[0] || '';
    Q.eb_out_name = out[0] ? SW.name(Q, out[0]) : '';
    Q.eb_out_cand = out[0] ? SW.candidateName(Q, out[0]) : '';
    Q.eb_has_out = out.length && out[0] !== 'rc' && out[0] !== Q.el_backing ? 1 : 0;
    // a pledge the eliminated bloc would value
    Q.eb_pledge = '';
    if (Q.eb_has_out) for (var id in SW.PLEDGES) if (SW.pledgeBloc(Q, id) === Q.eb_out_main && SW.PLEDGES[id].label && !Q['pl_' + id] && !(SW.PLEDGE_CLASH[id] && Q['pl_' + SW.PLEDGE_CLASH[id]])) Q.eb_pledge = id;
    Q.eb_pledge_ok = Q.eb_pledge ? 1 : 0;
    Q.eb_pledge_name = Q.eb_pledge ? SW.PLEDGES[Q.eb_pledge].name : '';
    // what each finalist would give the Caucus for its votes
    Q.eb_a_chair = SW.dealChair(Q, Q.eb_a); Q.eb_b_chair = SW.dealChair(Q, Q.eb_b);
    Q.eb_a_chair_name = SW.COMMITTEE_NAMES[Q.eb_a_chair]; Q.eb_b_chair_name = SW.COMMITTEE_NAMES[Q.eb_b_chair];
    Q.eb_a_rc = Q.eb_a === 'rc' ? 1 : 0; Q.eb_b_rc = Q.eb_b === 'rc' ? 1 : 0;
    Q.eb_rc_seats = SW.round1(Q.rc_r);
  };
  // a finalist will give up a chair it can spare, but never the one it most needs
  SW.dealChair = function (Q, cand) {
    var keep = {pal: 'judiciary', guild: 'finance', sec: 'security', rim: 'rimaffairs', mod: 'finance'}[cand];
    var want = ['judiciary', 'security', 'finance', 'rimaffairs', 'constitution', 'jedi'];
    for (var i = 0; i < want.length; i++) if (want[i] !== keep) return want[i];
    return 'rimaffairs';
  };
  SW.kingmaker = function (Q, which) {
    var c = which === 'a' ? Q.eb_a : Q.eb_b;
    Q.el_deal = c; Q.el_deal_chair = which === 'a' ? Q.eb_a_chair : Q.eb_b_chair; Q.el_deal_chair_name = SW.COMMITTEE_NAMES[Q.el_deal_chair];
    Q.el_backing = c;
    // blocs that trust the Caucus follow its lead
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      if (b !== 'rc' && (Q[b + '_relation'] || 0) >= 50) Q['bonus_' + b + '_for_' + c] = (Q['bonus_' + b + '_for_' + c] || 0) + 6;
    }
    Q.kingmaker_deals = (Q.kingmaker_deals || 0) + 1;
  };
  SW.courtEliminated = function (Q) {
    var c = Q.el_backing;
    for (var i = 0; i < Q.eb_out.length; i++) {
      var b = Q.eb_out[i];
      if (b === 'rc') continue;
      Q['bonus_' + b + '_for_' + c] = (Q['bonus_' + b + '_for_' + c] || 0) + 12 + (Q[b + '_relation'] || 0) / 10;
    }
  };
  SW.electionSecond = function (Q) {
    Q.el_active = 1;
    var r2 = SW.runElection(Q, Q.el_top);
    Q.el_result += SW.resultText(Q, r2, 'Second ballot');
    SW.electionFinish(Q, r2[0].bloc);
  };
  SW.electionFinish = function (Q, winner) {
    var cands = (Q.el_cands || []).filter(function (b) { return b !== 'rc'; });
    for (var ci = 0; ci < cands.length; ci++) for (var cj = ci + 1; cj < cands.length; cj++) SW.relAdd(Q, cands[ci], cands[cj], -4);
    Q.el_active = 0;
    var notes = [];
    if (Q.el_proj_for) {
      var err = Math.round(Math.abs(Q.el_act_share - Q.el_proj_share));
      notes.push('Our whips counted about ' + Math.round(Q.el_proj_share) + '% for ' + SW.candidateName(Q, Q.el_proj_for) + ' on the first ballot; the Senate gave ' + Math.round(Q.el_act_share) + '%' +
        (err <= 2 ? ': the count held.' : ': off by ' + err + ' points.'));
    }
    if (Q.el_switch_note) notes.push('On the floor, ' + Q.el_switch_note + '.');
    Q.el_whip_note = notes.join(' ');
    Q.el_result += Q.el_whip_note ? '<p class="sb-note">' + Q.el_whip_note + '</p>' : '';
    Q.el_winner = winner;
    Q.el_winner_name = SW.candidateName(Q, winner);
    Q.el_deal_won = (Q.el_deal && Q.el_deal === winner) ? 1 : 0;
    SW.installChancellor(Q, winner);
    for (var k in Q) if (k.indexOf('bonus_') === 0) delete Q[k];
    if (winner === Q.el_backing && winner === 'rc') SW.momentum(Q, 1, 'winning the Chancellery');
    else if (Q.el_backing === 'rc') SW.momentum(Q, -0.6, 'losing the Chancellor election');
  };

  // ---- coalition talks: every partner names its price
  SW.PRICE_CHAIR = {guild: 'finance', mod: 'judiciary', rim: 'rimaffairs', sec: 'security', pal: 'judiciary', rfc: 'rimaffairs', ind: 'constitution'};
  // Partners ask for committee chairs, never for promises: the only promises that bind the Caucus are the
  // ones it makes itself in the Chancellor race. A firm leader insists on the chair; a flexible one settles for less.
  SW.partnerPrice = function (Q, b) {
    var f = SW.firm(Q, b), chair = SW.PRICE_CHAIR[b] || '';
    return {chair: f >= 0.45 ? chair : '', pledge: ''};
  };
  SW.coalitionPrices = function (Q, blocs) {
    var chairs = {};
    for (var i = 0; i < blocs.length; i++) {
      var b = blocs[i];
      if (b === 'rc') continue;
      var p = SW.partnerPrice(Q, b);
      if (p.chair && !chairs[p.chair]) chairs[p.chair] = b;
    }
    return {chairs: chairs, pledges: {}};
  };
  SW.priceText = function (Q, blocs) {
    var pr = SW.coalitionPrices(Q, blocs), bits = [];
    for (var c in pr.chairs) bits.push('the ' + SW.COMMITTEE_NAMES[c] + ' chair for the ' + SW.name(Q, pr.chairs[c]));
    return bits.length ? 'Their price: ' + bits.join('; ') + '.' : 'No price beyond a fair share.';
  };
  SW.acceptPrices = function (Q, blocs) {
    var pr = SW.coalitionPrices(Q, blocs);
    for (var c in pr.chairs) { Q['chair_' + c] = pr.chairs[c]; Q['chair_res_' + c] = 1; Q['chair_res_' + c + '_name'] = SW.name(Q, pr.chairs[c]); }
  };
  // joining someone else's government asks no promise of the Caucus
  SW.juniorPrice = function (Q) { Q.el_join_pledge = ''; Q.el_join_price = ' '; };

  // ------------------------------------------------------------------ faction splits
  // A faction that breaks takes its senators with it: it joins the nearest bloc, or, under a firm
  // leader, founds its own party (one breakaway party at a time, in the 'rfc' slot).
  SW.SPLIT_DEST = {hawk: 'sec', rimward: 'rim', pacifist: 'ind', inst: 'mod'};
  SW.SPLIT_PARTY = {rimward: 'Rim Freedom Caucus', hawk: 'Free Worlds League', pacifist: 'Peace Caucus', inst: 'Ruusan Loyalists'};
  SW.SPLIT_FLAG = {hawk: 'hawks_split', rimward: 'rimward_split', pacifist: 'pacifists_resigned', inst: 'inst_crisis'};
  SW.SENATE_SIZE = 2400;
  SW.factionSplit = function (Q, f) {
    var share = SW.off('splits') ? 0 : SW.clamp(Q[f + '_strength'] / 100 * 0.5, 0.04, 0.4);
    var L = SW.leader(Q, f), leaderId = Q[f + '_leader_id'];
    var dest = SW.SPLIT_DEST[f];
    var own = L.firm >= 0.7 && !Q.rfc_formed;
    if (!own && Q.parties.indexOf(dest) < 0) dest = 'ind';
    var target = own ? 'rfc' : dest;
    if (own) {
      Q.rfc_formed = 1; Q.rfc_kind = f; Q.rfc_name = SW.SPLIT_PARTY[f];
      if (Q.parties.indexOf('rfc') < 0) Q.parties.push('rfc');
      Q.rfc_leader_id = leaderId; Q.rfc_leader = L.name;
      Q.rfc_relation = f === 'rimward' ? 50 : 38; Q.rfc_relation_prev = Q.rfc_relation;
      for (var r0 = 0; r0 < SW.REGIONS.length; r0++) Q[SW.REGIONS[r0] + '_rfc'] = Q[SW.REGIONS[r0] + '_rfc'] || 0;
    } else {
      Q[target + '_relation'] += 5;
      Q['split_gain_' + target] = (Q['split_gain_' + target] || 0) + share;
    }
    // the faction's senators leave with their worlds' support (the Rim's mostly from the Rim)
    for (var i = 0; i < SW.REGIONS.length; i++) {
      var rg = SW.REGIONS[i];
      var k = f === 'rimward' ? ((rg === 'outer' || rg === 'midrim') ? share * 1.4 : share * 0.6) : share;
      var mv = Q[rg + '_rc'] * Math.min(0.8, k);
      Q[rg + '_rc'] -= mv; Q[rg + '_' + target] += mv;
    }
    var moved = (Q.rc_r || 0) * share;
    Q.rc_r = SW.round1((Q.rc_r || 0) - moved); Q[target + '_r'] = SW.round1((Q[target + '_r'] || 0) + moved);
    Q.split_share_total = (Q.split_share_total || 0) + share;
    Q[SW.SPLIT_FLAG[f]] = 1;
    Q[f + '_strength'] *= 0.25; Q['rad_' + f] = 0;
    Q.split_kind = f; Q.split_own = own ? 1 : 0; Q.split_dest_name = SW.name(Q, target);
    Q.split_faction_name = SW.FACTION_NAMES[f]; Q.split_leader = L.name || 'its leaders';
    Q.split_seats = SW.round1(moved); Q.split_senators = Math.round(moved / 100 * SW.SENATE_SIZE);
    Q.split_share_pct = Math.round(share * 100);
    SW.normCaucus(Q);
    SW.recomputeGovt(Q);
  };
  // a breakaway party behaves like the bloc closest to the faction that founded it
  SW.RFC_PROXY = {hawk: 'sec', pacifist: 'ind', inst: 'mod', rimward: 'rim', free_traders: 'mod', const_hawks: 'sec', neutralists: 'ind'};
  SW.RFC_COMFORT = {rimward: -1.0, hawk: 0.2, pacifist: -0.5, inst: 0.3, free_traders: 0.3, const_hawks: 0.2, neutralists: -0.2};

  // ------------------------------------------------------------------ Sidious's schemes
  // A hidden hand answers the Caucus's successes. Every few turns Sidious picks a scheme, weighted by
  // what threatens him most. If the Caucus is watching closely (Jedi suspicion, evidence, or a recent
  // Shadow Investigation) it is foreseen a turn ahead and can be countered.
  var on2 = function (x) { return x ? 1 : 0; };
  SW.ADVISOR_TARGETS = ['farr', 'chuchi', 'mothma', 'bel_iblis', 'amidala', 'antilles', 'valorum'];
  SW.SCHEMES = {
    poison: {
      weight: function (Q) { return 0.5 + Q.evidence * 0.25 + 0.6 * on2(Q.adv_farr && !Q.farr_dead); },
      foresee: 'A Jedi Knight has a vision of a poisoned cup at a Senate reception. Someone close to us is in danger.',
      counter: 'Guard our people',
      foiled: 'Senate Guard officers seize a tray of drinks at a reception for Caucus staff. The poisoner escapes, but no one dies.',
      apply: function (Q) {
        if (Q.evidence >= 3 || !SW.countAdvisors(Q)) {
          Q.evidence = Math.max(0, Q.evidence - 1.5); Q.investigators_lost += 1; Q.fear += 1;
          return 'One of our investigators collapses at a Senate reception and dies before the medics arrive. The files they carried are never found.';
        }
        for (var i = 0; i < SW.ADVISOR_TARGETS.length; i++) {
          var a = SW.ADVISOR_TARGETS[i];
          if (Q['adv_' + a]) {
            Q['adv_' + a] = 0; Q['rad_' + SW.ADVISOR_FACTION[a]] += 5; SW.countAdvisors(Q);
            return SW.ADVISOR_NAMES[a] + ' falls gravely ill after a Senate reception. The healers call it poison; ' + SW.ADVISOR_NAMES[a] +
              ' survives, but must step back from the Caucus leadership.';
          }
        }
        return 'A poisoner moves against the Caucus, but finds no one worth killing.';
      }
    },
    scandal: {
      weight: function (Q) { return 0.5 + Math.max(0, (Q.rc_votes || 0) - 14) * 0.1 + on2(Q.rc_chancellor); },
      foresee: 'A friendly journalist warns us that someone is shopping a story about the Caucus to every HoloNet bureau on Coruscant.',
      counter: 'Get ahead of the story',
      foiled: 'The Caucus publishes its own accounts first. The smear story runs, and no one cares.',
      apply: function (Q) {
        Q.faith -= 1; Q.rad_inst += 6; Q.mod_relation -= 4; Q.scandal_ours_until = Q.date + 12; SW.momentum(Q, -0.8, 'a smear against the Caucus');
        for (var i = 0; i < SW.REGIONS.length; i++) Q[SW.REGIONS[i] + '_rc'] *= 0.95;
        return 'The HoloNet runs a story about Caucus senators taking money from shipping cartels. Most of it is false. All of it is repeated.';
      }
    },
    bomb_peace: {
      weight: function (Q) { return (Q.peace_talks >= 1 || Q.bonteri_contact) ? 1 + Q.peace_talks * 0.6 : 0; },
      foresee: 'Intelligence reports a Separatist "peace delegation" whose members nobody in the Confederacy seems to know.',
      counter: 'Secure the talks',
      foiled: 'The Judicial Forces search the delegation\'s ship and find a droid packed with explosives. The talks go on.',
      apply: function (Q) {
        Q.fear += 8; Q.peace_talks = Math.max(0, Q.peace_talks - 1); Q.rad_pacifist += 3;
        return 'A droid bomber strikes Coruscant on the eve of the peace talks. The Senate, in panic, abandons the peace initiative and votes to deregulate the banks to pay for the war.';
      }
    },
    // his agents fan a radical wing's grievances against its own bloc, where its walkout would serve him or Dooku
    stoke_grievance: {
      weight: function (Q) { var t = SW.stokeTarget(Q); return t ? 0.3 + SW.reformCount(Q) * 0.08 + 0.15 * SW.radTier(Q, t) : 0; },
      foresee: function (Q) {
        Q.stoke_target = SW.stokeTarget(Q);
        return 'Agitators are working the delegates of the ' + SW.wingName(Q.stoke_target) + ', fanning every grievance they hold against their own bloc.';
      },
      counter: 'Expose the agitators',
      foiled: 'The Caucus exposes the agitators before the delegates take the bait. Nobody admits to having paid them.',
      apply: function (Q) {
        var w = SW.wingActive(Q, Q.stoke_target) ? Q.stoke_target : SW.stokeTarget(Q);
        Q.stoke_target = '';
        if (!w) return 'Agitators work the corridors of the Senate for a season, but find no one ready to listen.';
        SW.addRad(Q, w, 20, Q['rad_why_' + w] || '');
        return 'Agitators work the delegates of the ' + SW.wingName(w) + ' for a season, and their grievances against the ' + SW.name(Q, SW.WINGS[w].bloc) +
          ' grow louder by the week.';
      }
    },
    buy_leader: {
      weight: function (Q) { return 0.6 + SW.reformCount(Q) * 0.1; },
      foresee: 'Credits are changing hands among the leaders of another bloc. Someone is buying a leadership fight.',
      counter: 'Warn the bloc',
      foiled: 'The Caucus warns the bloc\'s elders. The bribes are returned, with apologies.',
      apply: function (Q) {
        Q.contest_rigged = 1;
        var rb = SW.rigTarget(Q);
        Q.contest_rigged_bloc = rb || '';
        if (rb) SW.callCongress(Q, rb, 'crisis');
        return 'Credits change hands among the leaders of another bloc. A hardliner is being groomed to take over.';
      }
    },
    erase_records: {
      weight: function (Q) { return Q.evidence >= 2 ? 0.4 + Q.evidence * 0.2 : 0; },
      foresee: 'A Jedi archivist reports someone browsing restricted records late at night, with codes that should not exist.',
      counter: 'Copy the archives',
      foiled: 'The Caucus copies its files to three secure locations the night before they are wiped. Nothing is lost.',
      apply: function (Q) {
        Q.evidence = Math.max(0, Q.evidence - 2);
        return 'Records the Caucus relied on are wiped from the Senate and Jedi archives overnight, as cleanly as a planet erased from a star chart.';
      }
    },
    frame_jedi: {
      weight: function (Q) { return Q.jedi_suspicion >= 3 ? 0.3 + Q.jedi_suspicion * 0.15 : 0; },
      foresee: 'Our friends in the Temple sense a plot against the Order. They cannot see its shape.',
      counter: 'Warn the Council',
      foiled: 'Forewarned, the Council exposes the forged evidence before the HoloNet can run it.',
      apply: function (Q) {
        Q.jedi_standing -= 12; Q.jedi_relation -= 5; Q.jedi_suspicion = Math.max(0, Q.jedi_suspicion - 1.5);
        return 'Forged reports accuse ' + (Q.jedi_generals ? 'Jedi generals' : 'Jedi peacekeepers') + ' of atrocities. The Order is too busy defending itself to look for anyone else.';
      }
    },
    guilds: {
      weight: function (Q) { return (Q.trade_tax || Q.tf_broken_up || Q.anti_corruption) ? 0.8 : 0.2; },
      foresee: 'The guilds\' lobbyists have been invited to a private meeting in the Chancellery district.',
      counter: 'Reassure the guilds',
      foiled: 'The Caucus meets the guilds first and promises them a hearing. The meeting in the Chancellery district goes nowhere.',
      apply: function (Q) {
        Q.guild_embargo += 2; Q.guild_relation -= 5;
        return 'Someone has convinced the guilds that the Caucus means to ruin them. Credit lines to Caucus worlds are quietly frozen.';
      }
    },
    bury_bill: {
      weight: function (Q) { return (Q.rc_in_govt || Q.rc_chairs > 0) ? 0.6 + SW.reformCount(Q) * 0.15 : 0; },
      foresee: 'Committee clerks are getting new instructions from the Vice Chair\'s office.',
      counter: 'Work the committee staff',
      foiled: 'The Caucus reaches the committee clerks first. The new instructions are ignored.',
      apply: function (Q) {
        Q.bureau_relation -= 15;
        return 'The Senate\'s clerks receive new instructions from the Vice Chair\'s office. The bureaucrats turn against the Caucus.';
      }
    },
    fan_separatists: {
      weight: function (Q) { return (!Q.war && Q.date >= 96) ? 0.6 + (Q.outer_sep + Q.midrim_sep) / 200 : 0; },
      foresee: 'Agents with no known employer are touring Rim worlds, paying for rallies.',
      counter: 'Answer the agitators',
      foiled: 'Caucus envoys reach the rallies first and listen to the crowds. The agitators leave empty-handed.',
      apply: function (Q) {
        Q.outer_sep += 6; Q.midrim_sep += 4;
        return 'Agents with no known employer tour the Rim, paying for rallies and printing pamphlets. Separatism surges.';
      }
    },
    turn_senator: {
      weight: function (Q) { return 0.4 + Math.max(0, (Q.rc_votes || 0) - 15) * 0.08; },
      foresee: function (Q) { return 'Three Caucus senators have been seen dining with ' + Q.pal_people + '.'; },
      counter: 'Keep them on side',
      foiled: 'The Caucus finds the three senators better committee seats. They stay.',
      apply: function (Q) {
        for (var i = 0; i < SW.REGIONS.length; i++) { var r = SW.REGIONS[i]; var mv = Q[r + '_rc'] * 0.03; Q[r + '_rc'] -= mv; Q[r + '_pal'] += mv; }
        return 'Three Caucus senators cross the floor to the ' + SW.name(Q, 'pal') + ', citing "the needs of the hour".';
      }
    }
  };
  SW.threat = function (Q) {
    return Q.evidence * 0.5 + Q.jedi_suspicion * 0.3 + (Q.rc_r || 0) / 5 + SW.reformCount(Q) * 0.8 + Q.senate_resolve * 0.4 +
      (Q.rc_chancellor ? 3 : 0) + Q.peace_talks * 0.5;
  };
  // called each turn: Sidious picks his next move
  SW.schemeTick = function (Q) {
    if (SW.off('schemes')) return;
    if (Q.finale || Q.sidious_defeated || Q.sidious_gone || Q.sidious_fled || Q.date < 12 || Q.scheme_pending) return;
    if (Q.scheme_timer > 0) return;
    var ids = [], ws = [], tot = 0;
    for (var id in SW.SCHEMES) { var w = Math.max(0, SW.SCHEMES[id].weight(Q)); if (w > 0) { ids.push(id); ws.push(w); tot += w; } }
    if (!tot) return;
    var r = SW.rnd() * tot, pick = ids[0];
    for (var i = 0; i < ids.length; i++) { r -= ws[i]; if (r <= 0) { pick = ids[i]; break; } }
    var threat = SW.threat(Q);
    Q.scheme_pending = pick;
    Q.scheme_due = Q.time + 1;
    Q.scheme_countered = 0; Q.scheme_warned = 0;
    Q.scheme_foreseen = (Q.hunt_informant || Q.compor || Q.jedi_suspicion >= 4 || Q.evidence >= 5 || (Q.time - (Q.investigated_at || -99)) <= 2) ? 1 : 0;
    var fs = SW.SCHEMES[pick].foresee;
    Q.scheme_foresee = typeof fs === 'function' ? fs(Q) : fs;
    Q.scheme_counter = SW.SCHEMES[pick].counter;
    Q.scheme_timer = threat >= 10 ? 3 + Math.floor(SW.rnd() * 2) : 5 + Math.floor(SW.rnd() * 2);
    Q.schemes_total = (Q.schemes_total || 0) + 1;
  };
  SW.resolveScheme = function (Q) {
    var sc = SW.SCHEMES[Q.scheme_pending];
    if (!sc) { Q.scheme_pending = ''; return; }
    var text;
    if (Q.scheme_countered) { text = sc.foiled; Q.evidence += 0.3; Q.schemes_foiled = (Q.schemes_foiled || 0) + 1; }
    else text = sc.apply(Q);
    Q.scheme_text = text;
    Q.scheme_was_foiled = Q.scheme_countered ? 1 : 0;
    if (!Q.misfortunes || !Q.misfortunes.push) Q.misfortunes = [];
    Q.misfortunes.push((Q.scheme_countered ? 'Foiled: ' : '') + text.split('. ')[0].replace(/\.$/, '') + ' (' + Q.date_label + ')');
    if (Q.misfortunes.length > 3) Q.misfortunes.shift();
    Q['scheme_seen_' + Q.scheme_pending] = (Q['scheme_seen_' + Q.scheme_pending] || 0) + 1;
    Q.scheme_pending = '';
  };

  // ------------------------------------------------------------------ the bureaucrats
  // "Enter the bureaucrats - the true rulers of the Republic. And on the payroll of the Trade Federation,
  // I might add." The Senate's permanent staff are shown as a relationship. Establishment coalitions
  // reassure them; reformers alarm them; success and squeezing the guilds turn them against the Caucus.
  SW.BUREAU_COMFORT = {guild: 0.8, pal: 0.8, mod: 0.6, sec: 0.4, ind: 0.2, rc: -1.2, rim: -0.8, rfc: -1.0, cis: 0};
  SW.bureauComfort = function (Q, blocs) {
    var s = 0;
    for (var i = 0; i < (blocs || []).length; i++) {
      var b = blocs[i];
      s += (b === 'rfc' && Q.rfc_kind) ? SW.RFC_COMFORT[Q.rfc_kind] : (SW.BUREAU_COMFORT[b] || 0);
    }
    return s;
  };
  SW.bureauReaction = function (c) {
    return c >= 0 ? 'The bureaucrats approve.' : (c > -1.5 ? 'The bureaucrats are wary.' : 'The bureaucrats are alarmed.');
  };
  SW.reformCount = function (Q) {
    return Q.emergency_sunset + Q.term_limits_protected + Q.army_oversight + Q.senate_guard_reformed + Q.jedi_independence +
      Q.banking_independent + Q.rim_enfranchised + Q.anti_corruption + Q.slavery_abolished + Q.tf_broken_up + SW.newReforms(Q);
  };
  // the later steps of the reform tracks (each 0 or 1)
  SW.NEW_REFORMS = ['bureau_reformed', 'rim_relief_act', 'rim_assembly', 'integrity_office', 'powers_review', 'senate_command', 'new_jedi_order',
    'slavery_report', 'slavery_enforced', 'patrol_fleets', 'pirates_crushed', 'syndicates_broken', 'sentience_rights', 'officer_corps',
    'hhc_investigated', 'hhc_discredited', 'anti_cartel', 'republic_bonds', 'senators_expelled', 'intel_oversight', 'compor',
    'judicial_charter', 'independent_speaker', 'jedi_service_act', 'jedi_compact'];
  SW.newReforms = function (Q) {
    var n = 0;
    for (var i = 0; i < SW.NEW_REFORMS.length; i++) n += Q[SW.NEW_REFORMS[i]] ? 1 : 0;
    return n;
  };
  // the Caucus enters a government: the bureaucrats take the measure of its partners at once
  SW.bureauJoin = function (Q, blocs) {
    Q.bureau_relation += 10 * SW.bureauComfort(Q, blocs);
    Q.bureau_reforms_seen = SW.reformCount(Q);
  };
  SW.bureauTick = function (Q) {
    if (SW.off('bureau')) return;
    var f = Q.months_per_turn > 0 ? Q.months_per_turn / 3 : 0.1;
    if (Q.bureau_reformed) {
      Q.bureau_relation += (60 - Q.bureau_relation) * 0.15 * f;
      Q.bureau_dossier = 0;
      Q.bureau_reforms_seen = SW.reformCount(Q);
      return;
    }
    var rcount = SW.reformCount(Q);
    var inGov = Q.rc_in_govt || Q.rc_chairs > 0;
    if (!inGov) {
      Q.bureau_relation += (45 - Q.bureau_relation) * 0.1 * f;
      Q.bureau_dossier = Math.max(0, (Q.bureau_dossier || 0) - f);
      Q.bureau_reforms_seen = rcount;
      return;
    }
    var comfort = Q.rc_in_govt ? SW.bureauComfort(Q, Q.govt_blocs) : -0.6;
    var loss = Math.max(0, ((Q.rc_votes || 0) - 15) / 3);
    loss += 4 * Math.max(0, rcount - (Q.bureau_reforms_seen || 0));
    loss += (Q.trade_tax ? 1 : 0) + (Q.tf_broken_up ? 1 : 0) + (Q.guild_embargo >= 3 ? 1 : 0);
    if (comfort < 0) loss -= comfort; else loss = Math.max(0, loss - comfort);
    if (Q.bureau_captured > 0) loss *= 1.5; else if (Q.bureau_captured < 0) loss *= 0.8;
    if ((Q.govt_seats || 0) >= 60) loss *= 0.5;
    var gain = (Q.anti_corruption ? 3 : 0) + ((Q.guild_relation || 0) - 30) / 10;
    Q.bureau_relation += f * (gain - loss);
    Q.bureau_reforms_seen = rcount;
    // while they are unhappy with us, they build a case: files, leaks, partners who could govern without us
    var r = Q.bureau_relation;
    Q.bureau_dossier = (Q.bureau_dossier || 0) + (r <= 10 ? 2 : (r < 25 ? 1 : -0.5)) * f;
    Q.bureau_dossier = SW.clamp(Q.bureau_dossier, 0, 6);
  };

  // The bureaucrats strike: a "reorganisation" ejects the Caucus from government, or, against a
  // Caucus Chancellor, a manufactured crisis and a no-confidence vote (Valorum's fate).
  SW.bureauPurge = function (Q) {
    Q.bureau_purges += 1;
    Q.bp_gov = 0; Q.bp_walkout = 0; Q.bp_chancellor = 0; Q.bp_vote = 0; Q.bp_fell = 0; Q.bp_saved = 0; Q.bp_survived = 0;
    Q.vote_html = ' ';
    if (Q.rc_chancellor) {
      // Valorum's fate: a manufactured crisis, and the coalition abandons the Chancellor
      Q.bp_chancellor = 1; Q.bureau_purge_kind = 'chancellor';
      Q.fear += 8; Q.faith -= 3;
      if (Q.constructive_vonc) {
        Q.bp_saved = 1;
      } else {
        Q.bp_fell = 1; Q.election_due = 1; Q.govt_fell_now = 1; Q.fall_reason = 'bureaucrats';
        Q.vc_passed = 1; Q.bureau_fell += 1;
        // the scandal follows our candidate into the next election
        for (var i = 0; i < SW.BLOCS.length; i++) Q['bonus_' + SW.BLOCS[i] + '_for_rc'] = (Q['bonus_' + SW.BLOCS[i] + '_for_rc'] || 0) - 10;
      }
    } else {
      Q.bp_gov = 1; Q.bureau_purge_kind = 'government';
      var blocs = (Q.govt_blocs || []).filter(function (b) { return b !== 'rc'; });
      if (blocs.length) {
        SW.setGovt(Q, blocs, Q.coalition_name);
        if (SW.walkout(Q, 12, Q.chancellor_bloc)) Q.bp_walkout = 1;
        if (Q.govt_seats < 50) SW.brokenSystem(Q, 'minority');
      }
      SW.assignChairs(Q);
      Q.rad_inst += 5; Q.rc_momentum -= 0.5;
    }
    Q.bureau_relation = 30;
    Q.bureau_dossier = 0;
  };

  // ------------------------------------------------------------------ votes
  // stance: {bloc: probability of voting yes}; rcYes: the Caucus's own vote (1/0/0.5)
  SW.REFORM_TOPICS = ['rim', 'regulate', 'oversight', 'peace', '-powers', '-army'];
  SW._notes = []; SW._tabled = 0;
  SW.vote = function (Q, stance, rcYes, topic) {
    var yes = 0, total = 0;
    if (rcYes === undefined) rcYes = 0.5;
    var topics = topic ? [].concat(topic) : [];
    // a vote on the Chancellor's powers is also a vote on centralising the Republic
    var vtopics = topics.slice();
    if (topics.indexOf('powers') >= 0 && topics.indexOf('centralise') < 0) vtopics.push('centralise');
    if (topics.indexOf('-powers') >= 0 && topics.indexOf('-centralise') < 0) vtopics.push('-centralise');
    SW._notes = []; SW._tabled = 0; SW._decreed = 0; Q.vote_tabled = 0;
    // a step enacted by our Chancellor's decree never reaches the floor
    if (Q.decree_mode) { Q.decree_mode = 0; SW._decreed = 1; Q.last_vote = 100; return 100; }
    var live = !Q.finale && !Q.sidious_defeated;
    var reformVote = rcYes === 1 && topics.some(function (t) { return SW.REFORM_TOPICS.indexOf(t) >= 0; });
    // the Vice Chair controls the agenda: once a year he rules a Caucus reform out of order
    if (!SW.off('gavel') && live && reformVote && !Q.rc_chancellor && !Q.amedda_arrested && !Q.amedda_removed && !Q.independent_speaker && (Q.pal_chancellor || Q.puppet_chancellor || (Q.govt_blocs || []).indexOf('pal') >= 0) &&
        Q.senate_resolve < 3 && !Q.senate_guard_reformed && Q.date - (Q.gavel_date === undefined ? -99 : Q.gavel_date) >= 24) {
      Q.gavel_date = Q.date; Q.vote_tabled = 1; SW._tabled = 1; Q.gavels = (Q.gavels || 0) + 1;
      Q.last_vote = 0;
      return 0;
    }
    // delegations on the Chancellery's payroll follow its line on powers and oversight
    var bought = 0;
    if (!SW.off('bought') && live && !Q.integrity_office && !Q.hunt_frozen && topics.some(function (t) { return /powers|oversight/.test(t); })) {
      bought = SW.clamp((Q.corruption - 60) / 150 + Q.grand_plan / 600, 0, 0.2);
      if (bought >= 0.08) SW._notes.push('bought votes');
    }
    var palLine = stance.pal !== undefined ? stance.pal : (topics.indexOf('powers') >= 0 ? 1 : 0);
    if (topics.indexOf('powers') >= 0 && rcYes >= 0.75) Q.powers_rc_yes = 1;
    var lobbied = 0, backers = [];
    SW._lastP = {};
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      var s = Q[b + '_r'] || 0;
      var p;
      if (b === 'rc') p = rcYes;
      else if (stance[b] !== undefined) p = stance[b];
      else if (b === 'rfc' && SW.splinterWing && SW.splinterWing(Q)) { var px = SW.WINGS[Q.rfc_kind].bloc; p = stance[px] !== undefined ? stance[px] : 0.5; }
      else if (b === 'rfc') p = rcYes * 0.8 + 0.1;
      else p = 0.5;
      if (b !== 'rc') {
        // a bloc's leader colours its vote: their views on the topic, and how firmly the bloc holds its line
        var V = SW.blocViews(Q, b);
        for (var t = 0; t < vtopics.length; t++) {
          var tp = vtopics[t], sign = 1;
          if (tp.charAt(0) === '-') { sign = -1; tp = tp.slice(1); }
          p += sign * (V[tp] || 0);
        }
        p = SW.wingVote(Q, b, p, topics, reformVote, palLine, rcYes);
        p = 0.5 + (p - 0.5) * (0.7 + 0.6 * SW.firm(Q, b));
        if (Q.guild_lobby && reformVote && SW.GUILD_LOBBY_LEAN[b]) { p -= SW.GUILD_LOBBY_LEAN[b] * Q.guild_lobby; lobbied = 1; }
        if (Q['vote_boost_' + b] && reformVote) { p += Q['vote_boost_' + b]; Q['vote_boost_' + b] = 0; SW._notes.push(SW.name(Q, b) + ' kept their word'); }
        if (bought > 0 && b !== 'pal' && b !== 'cis') p = p * (1 - bought) + palLine * bought;
      }
      p = SW.clamp(p, 0, 1);
      SW._lastP[b] = p;
      if (b !== 'rc' && p >= 0.5) backers.push([b, p]);
      yes += s * p;
      total += s;
    }
    // a bloc that backs what one of its wings opposes radicalises that wing
    if (live && vtopics.length) {
      var rt = vtopics.filter(function (x) { return x !== 'confidence'; });
      for (var bk = 0; bk < backers.length; bk++) SW.radicalise(Q, backers[bk][0], rt, 0.3 + 1.4 * (backers[bk][1] - 0.5));
      if (rcYes >= 0.75 && SW.radicaliseCaucus) SW.radicaliseCaucus(Q, rt, 0.5);
    }
    if (live && rcYes >= 0.75 && topics.indexOf('powers') >= 0) Q.rc_powers_votes = (Q.rc_powers_votes || 0) + 1;
    if (lobbied) SW._notes.push('guild lobbying');
    if (total <= 0) total = 1;
    var share = SW.round1(100 * yes / total);
    // cold bureaucrats lose Caucus bills in committee
    if (!SW.off('committee') && live && reformVote && Q.committee_smooth) { Q.committee_smooth = 0; SW._notes.push('smoothed through committee'); }
    else if (!SW.off('committee') && live && reformVote && !Q.bureau_reformed && Q.bureau_relation < 25 && (Q.rc_in_govt || Q.rc_chairs > 0)) {
      share = SW.round1(Math.max(0, share - 3));
      SW._notes.push('\u22123, lost in committee');
    }
    // the Rim Radicals obstruct every other bill the government brings
    var obs = live && rcYes === 1 && (Q.rc_in_govt || Q.rc_chancellor) ? SW.rimObstruct(Q) : 0;
    if (obs > 0 && topics.length && !topics.some(function (t) { return SW.RIM_TOPICS.indexOf(t.replace('-', '')) >= 0; })) {
      share = SW.round1(Math.max(0, share - 2 * obs)); SW._notes.push('\u2212' + SW.round1(2 * obs) + ', the Rim Radicals obstruct');
    }
    var prog = live && rcYes === 1 ? SW.programmeBonus(Q, topics) : 0;
    if (prog) { share = SW.round1(SW.clamp(share + prog, 0, 100)); SW._notes.push((prog > 0 ? '+' : '\u2212') + Math.abs(prog) + ', the ' + SW.FACTION_NAMES[SW.rcLead(Q)] + '\u2019 programme'); }
    var weight = live ? SW.officeWeight(Q, rcYes, topics) : 0;
    if (weight > 0) { share = SW.round1(Math.min(100, share + weight)); SW._notes.push('+' + weight + ', the Chancellery\u2019s weight'); }
    // a Caucus minority's own bill voted down: its supporters lose patience (the budget has its own price; confidence votes are their own reckoning)
    if (live && rcYes === 1 && share < 50 && SW.isCaucusMinority(Q) && topics.length && topics.indexOf('confidence') < 0) {
      Q.coalition_dissent = (Q.coalition_dissent || 0) + 1; Q.minority_defeats = (Q.minority_defeats || 0) + 1;
      Q.coalition_mood_v = Q.coalition_dissent + (4 - (Q.collapse_at || 4));
      SW._notes.push('the government\u2019s supporters lose patience');
    }
    Q.last_vote = share;
    return share;
  };

  // Build a stance table for a vote. base: {bloc: probability}; relations with the
  // Caucus shift each bloc a little; reform votes also respond to faith and resolve.
  SW.stance = function (Q, base, reform) {
    var st = {};
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      if (b === 'rc') continue;
      var p = base[b] !== undefined ? base[b] : 0.4;
      if (b !== 'pal' && b !== 'cis') p += ((Q[b + '_relation'] || 40) - 45) / 150 * (1.4 - 0.8 * SW.firm(Q, b));
      if (reform) p += (Q.faith - 50) / 250 + Q.senate_resolve * 0.02 + Math.min(3, Q.new_ruusan || 0) * 0.015;
      st[b] = SW.clamp(p, 0, 1);
    }
    return st;
  };

  // HTML banner for a Senate vote result.
  SW.voteBanner = function (label, share, threshold) {
    threshold = threshold || 50;
    if (SW._decreed) {
      SW._decreed = 0; SW._notes = [];
      return '<div class="vote vote-pass">' + label + ': <b>enacted by decree</b>. The Senate is not asked.</div>';
    }
    if (SW._tabled) {
      SW._tabled = 0;
      return '<div class="vote vote-fail">' + label + ': <b>ruled out of order</b> by the Vice Chair. The bill never reaches the floor. <i>(Mas Amedda can do this once every two years while the Chancellery controls the agenda. Senate resolve of 3 or more, or a reformed Senate Guard, stops him.)</i></div>';
    }
    var pass = share >= threshold;
    var notes = SW._notes.length ? ' <span class="vote-note">(' + SW._notes.join('; ') + ')</span>' : '';
    SW._notes = [];
    return '<div class="vote ' + (pass ? 'vote-pass' : 'vote-fail') + '">' + label + ': <b>' + share.toFixed(1) + '%</b> in favour' +
      (threshold !== 50 ? ' (needs ' + threshold + '%)' : '') + ' — <b>' + (pass ? 'passed' : 'defeated') + '</b>' + notes + '</div>';
  };

  // ------------------------------------------------------------------ drift each turn
  SW.ANAKIN_WAR = 0.08;       // Anakin's slide toward the dark side per quarter of war
  SW.PAL_DATE = 0.55;         // share of Palpatine's yearly growth that still comes from nowhere (the rest now comes from the bleeding centre)
  SW.PAL_GROWTH = 75; // months for Palpatine's bloc to gain one more 'natural size'
  // campaigns: how much one moves a region, how much lasting presence a region can hold, how fast it fades
  SW.CAMPAIGN_SIZE = 8;
  SW.PRESENCE_CAP = 14;
  SW.PRESENCE_DECAY = 0.96;    // per quarter
  SW.RC_BASE = 1;              // the Caucus's natural level, before campaigns
  SW.drift = function (Q) {
    var m = Q.months_per_turn;
    var f = m > 0 ? m / 3 : 0.15;
    var noise = function () { return (SW.rnd() - 0.5) * 0.6 * f; };

    // corruption, fear, faith
    Q.corruption += f * (0.26 + Q.emergency_powers * 0.08 - Q.anti_corruption * 0.6 + (Q.war ? 0.25 : 0) + ((Q.guild_r || 20) - 20) * 0.02 +
      (Q.guild_hold || 0) * 0.08 - (Q.integrity_office ? 0.6 : 0));
    var targetFear = 18 + (Q.dooku_movement ? 14 : 0) + (Q.war ? 14 + Math.max(0, -Q.war_balance) * 1.5 + Math.max(0, -SW.front(Q, 'core')) * 2 - Math.max(0, SW.front(Q, 'core')) + Math.min(5, Q.war_turns * 0.25) + (Q.war_aim === 'victory' ? 5 : 0) : 0) + (Q.secession_recent || 0) * 2;
    Q.fear += (targetFear - Q.fear) * 0.25 * f;
    Q.secession_recent = 0;
    var reforms = Q.emergency_sunset + Q.term_limits_protected + Q.army_oversight + Q.senate_guard_reformed +
      Q.jedi_independence + Q.banking_independent + Q.rim_enfranchised + Q.anti_corruption;
    var bigReforms = (Q.bureau_reformed ? 1 : 0) + (Q.rim_assembly ? 1 : 0) + (Q.integrity_office ? 1 : 0) + (Q.powers_review ? 1 : 0) + (Q.senate_command ? 1 : 0) +
      (Q.new_jedi_order ? 1 : 0) + (Q.slavery_enforced ? 1 : 0) + (Q.syndicates_broken ? 1 : 0) + (Q.hhc_discredited ? 1 : 0);
    var targetFaith = 80 - Q.corruption * 0.45 - Q.fear * 0.15 - Q.war_weariness * 0.1 + reforms * 2.5 + bigReforms * 1.5 - Q.emergency_powers * 1.2 + (Q.rc_r || 0) * 0.2;
    Q.faith += (targetFaith - Q.faith) * 0.12 * f;

    // the Outer Rim
    Q.rim_hardship += f * (0.4 + Q.guild_embargo * 0.25 + (Q.war ? 0.8 : 0) - Q.rim_relief * 0.35 - (Q.slavery_abolished ? 0.3 : 0) - (Q.rim_enfranchised ? 0.4 : 0));

    // separatism: Dooku can only exploit real grievances, and reforms take them away
    SW.grievances(Q);
    var regionsSep = ['outer', 'midrim', 'corporate'];
    for (var i = 0; i < regionsSep.length; i++) {
      var r = regionsSep[i];
      var d;
      if (r !== 'corporate') {
        // separatism is the default: it grows while hardship or corruption is above its line, faster the further above
        d = SW.sepPressure(Q.rim_hardship, SW.SEP_HARDSHIP_LINE, 60) + SW.sepPressure(Q.corruption, SW.SEP_CORRUPTION_LINE, 80) + (Q.dooku_movement ? 1.4 * Q.rim_grievance : 0.1)
          - Q.rim_enfranchised * 1.5 - Q.slavery_abolished * 0.3 - Math.min(Q.rim_relief, 3) * 0.15;
        // a reformed Rim slowly settles back toward loyalty
        if (Q.rim_enfranchised && Q[r + '_sep'] > 15) d -= (Q[r + '_sep'] - 15) * 0.04;
        d += SW.leaderSum(Q, 'rimSep', ['rim', 'rfc']);
      } else {
        d = (Q.corruption - 55) / 50 + (Q.dooku_movement ? 1.2 * Q.guild_grievance : 0.05) - (Q.guild_relation - 30) / 60;
      }
      d -= Q.federal_compact * 2 + Q.peace_talks * 0.3 + Q.anti_corruption * 0.3;
      if (Q.war && Q.war_balance > 4) d -= 1;
      // every year the Rim is left to them, the Separatists' cause gathers pace
      d += SW.SEP_PUSH * (Q.sep_momentum || 0) * (r === 'corporate' ? ((Q.guild_patience === undefined ? 60 : Q.guild_patience) < 50 ? 0.6 : 0.3) : 1);
      if (Q.rim_assembly && r !== 'corporate' && Q[r + '_sep'] > 10) d -= (Q[r + '_sep'] - 10) * 0.03;
      Q[r + '_sep'] += f * d;
    }

    // evidence goes stale above 'circumstantial': witnesses vanish, records are wiped
    if (Q.evidence > 5 && !Q.evidence_secured && !Q.compor) Q.evidence -= f * (0.12 + Q.grand_plan / 800) * (Q.free_press ? 0.7 : 1);

    // Sidious's hidden progress
    var palInPower = Q.pal_chancellor || Q.puppet_chancellor;
    var hostilePowers = Q.rc_chancellor ? 0 : Q.emergency_powers;
    Q.grand_plan += f * ((0.6 + Q.corruption / 130 + Q.fear / 130 + hostilePowers * 0.12 + (Q.pal_chancellor ? 0.5 : 0) +
      (Q.war ? 0.4 : 0)) * (palInPower ? 1 : 0.6) - Q.evidence * 0.04 - Q.senate_resolve * 0.05 - (Q.jedi_suspicion > 5 ? 0.3 : 0) -
      (Q.rc_chancellor ? 0.25 : 0));

    // regional support drifts toward targets set by the state of the galaxy
    var mult = {
      rc: SW.RC_BASE * Math.max(0.3, 1 + (Q.faith - 50) / 40 - ((Q.caucus_unrest || 0) - 0.15) * 1.2 + (Q.rc_in_govt ? 0.05 : 0) + 0.04 * SW.clamp(Q.rc_momentum || 0, -5, 5)),
      mod: Math.max(0.2, 1 + (50 - Q.corruption) / 40 - (Q.valorum_scandal && Q.mod_leader === 'Finis Valorum' ? 0.3 : 0)),
      // Sidious's agents work the Senate every year, in office or not; a clean Senate only slows them
      pal: 1 + Math.max(-0.2, (Q.corruption - 55) / 25) + Math.max(-0.2, (Q.fear - 25) / 20) + Q.grand_plan / (palInPower ? 40 : 70) +
        (Q.pal_chancellor ? 0.8 : 0) - Q.evidence_public * 0.4 - (Q.rc_chancellor ? 0.3 : 0),
      guild: Math.max(0.3, 1 - (Q.tf_broken_up ? 0.3 : 0) + Q.guild_embargo * 0.03),
      rim: 1, sec: Math.max(0.2, 1 + (Q.fear - 20) / 25 + (Q.war ? 0.3 : 0)), ind: 1
    };
    // Palpatine's agents work hardest where power lies: the Core and the Inner Rim
    var palDate = Q.sidious_defeated || Q.pal_disgraced ? 0 : Q.date / SW.PAL_GROWTH * (SW.off('bleed') ? 1 : SW.PAL_DATE);
    // the Moderates and the Independents lose their natural support over the years; the Security Bloc to Palpatine
    var bleed = SW.off('bleed') ? 0 : SW.bleedFrac(Q), share = SW.bleedShare(Q), subv = SW.off('bleed') ? 0 : SW.secSubversion(Q);
    var cisIn = Q.cis_formed && Q.parties.indexOf('cis') >= 0, rimIn = Q.parties.indexOf('rim') >= 0;
    for (var j = 0; j < SW.REGIONS.length; j++) {
      var rg = SW.REGIONS[j];
      var S0 = START_SUPPORT[rg];
      var extra = SW.bleedExtra(Q, rg, bleed, share, cisIn, rimIn);
      extra.pal += S0.sec * mult.sec * subv;
      // a bloc absorbed by another brings its natural support with it
      if (Q.merged_sec === 'pal') extra.pal += S0.sec * mult.sec * 0.8;
      if (Q.merged_rim === 'cis') extra.cis += S0.rim * 0.6;
      for (var bi = 0; bi < 7; bi++) {
        var b = ['rc', 'mod', 'pal', 'guild', 'rim', 'sec', 'ind'][bi];
        if (Q['merged_' + b]) { Q[rg + '_' + b] = 0.3; continue; }
        var m2 = mult[b];
        if (b === 'rim' && (rg === 'outer' || rg === 'midrim')) m2 = Math.max(0.3, 1 + (Q.rim_hardship - 30) / 30);
        if (b === 'pal') m2 = Math.max(0.3, m2 + palDate * (SW.off('palregion') ? 1 : SW.PAL_REGION[rg]));
        m2 *= 1 + SW.leaderPull(Q, b);
        var target = S0[b] * m2;
        if (b === 'mod' || b === 'ind') target *= 1 - bleed;
        if (b === 'sec') target *= 1 - subv;
        target += extra[b] || 0;
        // splinters take a share of the Caucus
        if (b === 'rc') {
          target *= Math.max(0.3, 1 - (Q.split_share_total || 0));
          // where the Caucus has campaigned, its organisation holds support up for years
          target += Q['cm_presence_' + rg] || 0;
        }
        if (Q['split_gain_' + b]) target += START_SUPPORT[rg].rc * Q['split_gain_' + b];
        Q[rg + '_' + b] += (target - Q[rg + '_' + b]) * 0.08 * f + noise();
      }
      if (cisIn) {
        var tc = ((rg === 'core' || rg === 'colonies') ? 0.5 : (Q[rg + '_sep'] || 0) / 2.5 * (1 + 0.03 * (Q.sep_momentum || 0))) + extra.cis;
        Q[rg + '_cis'] += (tc - Q[rg + '_cis']) * 0.25 * f;
      }
      for (var b2 = 0; b2 < SW.BLOCS.length; b2++) {
        var k = rg + '_' + SW.BLOCS[b2];
        Q[k] = SW.clamp(Q[k], 0.3, 150);
      }
    }

    // war
    if (Q.war) {
      Q.war_turns += 1;
      var wst = SW.warStrength(Q), rep = wst.rep, cis = wst.cis;
      // Sidious keeps the war going: the front drifts back toward a slow Republic advance
      // while he rules the Republic; out of office he no longer holds the droid armies back, and strength counts for more;
      // once he is gone, strength alone decides; at the Confederacy's head, he drives it on
      var hand = SW.sidiousHand(Q);
      var drift_target = (hand === 'republic' ? 0.5 + Math.max(0, Q.date - 135) / 30 : (hand === 'confederacy' ? -2.5 : 0)) +
        (Q.war_aim === 'victory' ? 0.8 : (Q.war_aim === 'peace' ? -0.5 : 0));
      var pull = {republic: 0.18, confederacy: 0.18, presses: 0.12, none: 0.06}[hand], edge = (rep - cis) * {republic: 0.08, confederacy: 0.08, presses: 0.11, none: 0.14}[hand];
      Q.war_balance += f * (edge + (drift_target - Q.war_balance) * pull + (SW.rnd() - 0.5) * 1.2);
      Q.war_weariness += f * 3;
      Q.treasury -= f * (1.0 + Q.clones * 0.08);
      if (Q.jedi_generals) { Q.jedi_strength -= f * 0.12; Q.jedi_standing -= f * 0.6; }
      if (Q.anakin_found) Q.anakin_fall += f * SW.ANAKIN_WAR;
      if (Q.kamino_army && Q.clones > 0 && Q.clones < 10) Q.clones += f * 0.35;
      if (!Q.kamino_army) Q.clones = 0;
      if (Q.droid_armies > 0) Q.droid_armies += f * 0.15;
      SW.frontsTick(Q, f);
      SW.warWorldsTick(Q, f);
    }
    SW.economyTick(Q, f);
    Q.rc_momentum = (Q.rc_momentum || 0) * Math.pow(0.8, f);
    for (var gr = 0; gr < SW.REGIONS.length; gr++) {
      Q['grievance_' + SW.REGIONS[gr]] = (Q['grievance_' + SW.REGIONS[gr]] || 0) * Math.pow(0.9, f);
      Q['cm_presence_' + SW.REGIONS[gr]] = (Q['cm_presence_' + SW.REGIONS[gr]] || 0) * Math.pow(SW.PRESENCE_DECAY, f);
    }
    SW.clampAll(Q);
  };

  // The Rim's separatism grows while Rim hardship is above 20 or corruption above 40, faster the further above;
  // below its line, each eases it back slowly.
  SW.SEP_HARDSHIP_LINE = 20;
  SW.SEP_CORRUPTION_LINE = 40;
  SW.sepPressure = function (x, line, k) {
    var e = (x || 0) - line;
    return e > 0 ? (e / k) * (1 + e / 30) : e / k;
  };

  // How much real grievance Dooku's movement can feed on (0 = none, ~1.5 = the Rim is furious).
  SW.grievances = function (Q) {
    Q.rim_grievance = SW.clamp((Q.rim_hardship - SW.SEP_HARDSHIP_LINE) / 30 + (Q.corruption - SW.SEP_CORRUPTION_LINE) / 45 - Q.rim_enfranchised * 0.8 -
      Q.slavery_abolished * 0.2 - Math.min(Q.rim_relief, 3) * 0.1 - Q.anti_corruption * 0.2 - Q.federal_compact +
      SW.leaderSum(Q, 'rimGriev', ['rim', 'rfc']), 0, 1.6);
    Q.guild_grievance = SW.clamp(Q.guild_embargo * 0.12 + (Q.trade_tax ? 0.2 : 0) +
      (40 - Q.guild_relation) / 50 + (Q.corruption - 50) / 80 + SW.leaderSum(Q, 'guildGriev', ['guild']) +
      Math.max(0, 60 - (Q.guild_patience === undefined ? 60 : Q.guild_patience)) / 120, 0, 1.6);
  };

  // Secession: regions with strong separatism lose delegations.
  SW.secession = function (Q) {
    if (!Q.dooku_movement) return 0;
    var lost = 0;
    var regs = ['outer', 'midrim', 'corporate'];
    var m = Q.months_per_turn > 0 ? Q.months_per_turn / 3 : 0;
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      var s = Q[r + '_sep'];
      if (s > 50 && Q[r + '_seceded'] < 0.65) {
        var frac = Math.min(0.65 - Q[r + '_seceded'], (s - 50) / 100 * 0.5 * m);
        if (Q.ref_ready && Q.ref_region === r) frac *= 0.5;
        Q[r + '_seceded'] += frac;
        lost += frac * SW.BASE_WEIGHTS[r];
        Q[r] = SW.BASE_WEIGHTS[r] * (1 - Q[r + '_seceded']);
      }
    }
    var tot = 0, base = 0;
    for (var j = 0; j < SW.REGIONS.length; j++) {
      tot += SW.BASE_WEIGHTS[SW.REGIONS[j]] * Q[SW.REGIONS[j] + '_seceded'];
      base += SW.BASE_WEIGHTS[SW.REGIONS[j]];
    }
    Q.seceded_total = Math.round(100 * tot / base);
    var where = [];
    if (Q.corporate_seceded > 0.02) where.push('corporate');
    if (Q.midrim_seceded > 0.02) where.push('midrim');
    if (Q.outer_seceded > 0.02) where.push('outer');
    Q.secession_where = where.join(',');
    Q.droid_armies = Math.max(Q.droid_armies, Q.war ? 2 + Q.seceded_total / 6 : 0);
    if (lost > 0) Q.secession_recent = SW.round1(lost);
    return lost;
  };


  // ------------------------------------------------------------------ the war: three fronts and a War Council
  // war_balance is the overall front; each front is war_balance plus an offset, and the offsets sum to zero,
  // so every older effect on war_balance still moves all three fronts together.
  SW.FRONTS = ['outer', 'mid', 'core'];
  SW.FRONT_NAMES = {outer: 'the Outer Rim Sieges', mid: 'the Hydian Way', core: 'the Core approaches'};
  SW.FRONT_SHORT = {outer: 'Outer Rim Sieges', mid: 'Hydian Way and Mid Rim', core: 'Core approaches'};
  SW.FRONT_BATTLES = {
    outer: [['Christophsis', 'the crystal world of Christophsis'], ['Ryloth', 'the Twi\'lek homeworld of Ryloth'], ['Saleucami', 'the desert world of Saleucami'], ['Felucia', 'the jungle world of Felucia'], ['Mygeeto', 'the crystal-banking world of Mygeeto']],
    mid: [['Malastare', 'the fuel world of Malastare'], ['Rodia', 'Onaconda Farr\'s homeworld of Rodia'], ['Hypori', 'the droid foundries of Hypori'], ['Kashyyyk', 'the Wookiee world of Kashyyyk'], ['Umbara', 'the shadow world of Umbara']],
    core: [['Anaxes', 'the shipyards of Anaxes'], ['Kuat', 'the Kuat Drive Yards'], ['Corellia', 'the Corellian shipyards'], ['Kamino', 'the cloning world of Kamino'], ['Ord Mantell', 'the staging world of Ord Mantell']]
  };
  SW.front = function (Q, f) { return (Q.war_balance || 0) + (Q['war_off_' + f] || 0); };
  // move one front against the other two (the war as a whole is unchanged)
  SW.shiftFront = function (Q, f, amt) {
    for (var i = 0; i < SW.FRONTS.length; i++) {
      var g = SW.FRONTS[i];
      Q['war_off_' + g] = (Q['war_off_' + g] || 0) + (g === f ? amt : -amt / 2);
    }
  };
  // move one front on its own (the war as a whole moves by a third as much)
  SW.pushFront = function (Q, f, amt) {
    Q.war_balance += amt / 3;
    SW.shiftFront(Q, f, amt * 2 / 3);
  };
  SW.weakestFront = function (Q) {
    var w = 'outer';
    for (var i = 0; i < SW.FRONTS.length; i++) if (SW.front(Q, SW.FRONTS[i]) < SW.front(Q, w)) w = SW.FRONTS[i];
    return w;
  };
  SW.frontLabel = function (Q, f) { return SW.label ? SW.label('war', SW.front(Q, f)) : String(SW.round1(SW.front(Q, f))); };

  // each war turn: the fronts feed the rest of the galaxy
  SW.frontsTick = function (Q, f) {
    for (var i = 0; i < SW.FRONTS.length; i++) Q['war_off_' + SW.FRONTS[i]] *= Math.pow(0.9, f);
    if (Q.war_aim === 'rim') SW.shiftFront(Q, 'outer', 0.3 * f);
    var fo = SW.front(Q, 'outer'), fm = SW.front(Q, 'mid');
    // the Outer Rim sieges: hunger and separatism, or relief
    Q.rim_hardship += f * (fo < 0 ? -fo * 0.15 : -Math.min(fo, 5) * 0.06);
    if (fo < -2) Q.outer_sep += f * 0.25;
    // the Hydian Way: the Republic's trade
    Q.trade = (Q.trade || 60) + f * fm * 0.6;
    if (fm < -2) Q.midrim_sep += f * 0.25;
    // war aims pull the factions and the talks
    if (Q.war_aim === 'victory') { Q.peace_talks = Math.max(0, Q.peace_talks - 0.1 * f); Q.rad_hawk -= 0.3 * f; Q.rad_pacifist += 0.3 * f; }
    if (Q.war_aim === 'peace') { Q.peace_talks += 0.05 * f; Q.rad_pacifist -= 0.3 * f; Q.rad_hawk += 0.3 * f; }
    if (Q.war_aim === 'rim') {
      Q.rad_rimward -= 0.3 * f;
      if (Q.rim_enfranchised && fo > 0) Q.outer_seceded = Math.max(0, Q.outer_seceded - 0.01 * f);
    }
    // a front that breaks, or a front that is won
    if (!Q.front_ev_ready) {
      for (var j = 0; j < SW.FRONTS.length; j++) {
        var fr = SW.FRONTS[j], v = SW.front(Q, fr);
        if (Q.date - (Q['front_ev_' + fr] || -99) < 24) continue;
        if (v <= -6) { Q.front_ev_ready = 1; Q.front_ev = fr; Q.front_ev_kind = 'collapse'; break; }
        if (v >= 6) { Q.front_ev_ready = 1; Q.front_ev = fr; Q.front_ev_kind = 'liberation'; break; }
      }
    }
    for (var k = 0; k < SW.FRONTS.length; k++) Q['front_' + SW.FRONTS[k]] = SW.round1(SW.front(Q, SW.FRONTS[k]));
  };

  SW.frontEvent = function (Q) {
    var fr = Q.front_ev, lib = Q.front_ev_kind === 'liberation';
    Q.front_ev_ready = 0; Q['front_ev_' + fr] = Q.date;
    Q.fe_name = SW.FRONT_SHORT[fr]; Q.fe_lib = lib ? 1 : 0; Q.fe_front = fr;
    Q.fe_heading = lib ? 'Breakthrough: ' + SW.FRONT_SHORT[fr] : 'Collapse: ' + SW.FRONT_SHORT[fr];
    if (fr === 'outer') {
      if (lib) { Q.outer_seceded = Math.max(0, Q.outer_seceded - 0.1); Q.rim_relation += 5; Q.outer_sep -= 5; Q.rad_rimward -= 4; }
      else { Q.outer_seceded = Math.min(0.9, Q.outer_seceded + 0.08); Q.rim_hardship += 5; Q.fear += 3; Q.rad_rimward += 5; }
    } else if (fr === 'mid') {
      if (lib) { Q.midrim_seceded = Math.max(0, Q.midrim_seceded - 0.1); Q.trade += 10; Q.midrim_sep -= 5; Q.guild_relation += 3; }
      else { Q.midrim_seceded = Math.min(0.9, Q.midrim_seceded + 0.08); Q.trade -= 10; Q.fear += 3; Q.guild_relation -= 3; }
    } else {
      if (lib) { Q.fear -= 6; Q.faith += 2; Q.rad_hawk -= 4; }
      else { Q.fear += 8; Q.faith -= 2; Q.navy_loyalty -= 5; Q.rad_hawk += 5; }
    }
    // the front settles after a breakthrough or a collapse
    Q['war_off_' + fr] *= 0.4;
    SW.secession(Q);
  };

  SW.warCommand = function (Q) { return (Q.rc_chancellor || Q.chair_security === 'rc') ? 1 : 0; };
  SW.governmentWarPlan = function (Q) {
    if (Q.chancellor_bloc === 'pal') return 'core';  // Sidious keeps the Core safe and the war going
    if (Q.chancellor_bloc === 'rim') return 'outer';
    return SW.weakestFront(Q);
  };
  SW.WAR_PLAN_TEXT = {outer: 'relieve the Outer Rim sieges', mid: 'secure the Hydian Way', core: 'fortify the Core approaches', hold: 'hold the line everywhere'};

  // the season's battle, fought where the Confederacy chooses to strike
  SW.warCouncilOpen = function (Q) {
    Q.battle_timer = 2;
    Q.wc_command = SW.warCommand(Q);
    Q.wc_gov_plan = SW.governmentWarPlan(Q);
    Q.wc_gov_text = SW.WAR_PLAN_TEXT[Q.wc_gov_plan];
    // the Confederacy strikes the weakest front more often than not
    var target = SW.rnd() < 0.55 ? SW.weakestFront(Q) : SW.FRONTS[Math.floor(SW.rnd() * 3)];
    Q.battles_fought = (Q.battles_fought || 0) + 1;
    var list = SW.FRONT_BATTLES[target].filter(function (b) { return !(b[0] === 'Kamino' && !Q.kamino_army); });
    var bt = list[(Q['battles_' + target] || 0) % list.length];
    Q['battles_' + target] = (Q['battles_' + target] || 0) + 1;
    var swing = (SW.rnd() - 0.45) * 3 + Q.clones * 0.08 + Q.member_forces * 0.05 - Q.droid_armies * 0.08 + (Q.war_priority === target ? 0.8 : 0);
    SW.pushFront(Q, target, swing);
    Q.war_weariness += 2;
    Q.battle_won = swing >= 0 ? 1 : 0;
    Q.battle_name = bt[0]; Q.battle_desc = bt[1]; Q.battle_front = SW.FRONT_NAMES[target];
    Q.wc_fronts = SW.FRONTS.map(function (fr) { return SW.FRONT_SHORT[fr] + ': ' + SW.frontLabel(Q, fr).replace(/<[^>]+>/g, ''); }).join(' · ');
    for (var k = 0; k < SW.FRONTS.length; k++) Q['front_' + SW.FRONTS[k]] = SW.round1(SW.front(Q, SW.FRONTS[k]));
  };

  // the season's priority: chosen front +2 against the other two; side effects on the systems each front feeds
  SW.warCouncilPriority = function (Q, choice) {
    Q.wc_lobby_failed = 0;
    var plan = choice;
    if (!Q.wc_command && choice !== 'accept') {
      Q.capital -= 1;
      var chance = 0.3 + (Q.rc_in_govt ? 0.15 : 0) + ((Q[Q.chancellor_bloc + '_relation'] || 30) - 40) / 100 + Q.senate_resolve * 0.03;
      if (SW.rnd() >= SW.clamp(chance, 0.1, 0.8)) { plan = Q.wc_gov_plan; Q.wc_lobby_failed = 1; }
    }
    if (choice === 'accept') plan = Q.wc_gov_plan;
    Q.war_priority = plan;
    Q.wc_plan_text = SW.WAR_PLAN_TEXT[plan];
    if (plan === 'hold') { for (var i = 0; i < SW.FRONTS.length; i++) Q['war_off_' + SW.FRONTS[i]] *= 0.5; Q.war_balance += 0.3; Q.treasury -= 1; Q.war_weariness += 1; }
    else SW.shiftFront(Q, plan, 2);
    if (plan === 'outer') { Q.rim_relation += 3; Q.rad_rimward -= 2; Q.fear += 1; }
    if (plan === 'mid') { Q.guild_relation += 3; Q.trade = (Q.trade || 60) + 4; }
    if (plan === 'core') { Q.sec_relation += 3; Q.fear -= 3; Q.rim_relation -= 3; Q.rad_rimward += 3; }
    for (var k = 0; k < SW.FRONTS.length; k++) Q['front_' + SW.FRONTS[k]] = SW.round1(SW.front(Q, SW.FRONTS[k]));
    SW.pickDilemma(Q);
  };

  // ---------------------------------------------------- war dilemmas: each ripples into other systems
  // options: [label, subtitle, apply(Q), result text]; def is what the government does if the Caucus does not prevail
  SW.DILEMMAS = {
    umbara: {title: 'General Krell\'s Orders', when: function (Q) { return Q.date >= 150; },
      text: 'On Umbara, Jedi Master Pong Krell has ordered his troops into one suicidal assault after another, and finally to fire on their own allies. His officers want him relieved. The Security Bloc says he gets results.',
      def: 'a', options: {
        a: ['Back the general.', 'The Mid Rim front gains; the Jedi\'s name suffers, and Anakin grows harder.', function (Q) { SW.pushFront(Q, 'mid', 1.5); Q.jedi_standing -= 5; Q.anakin_fall += 0.5; Q.clone_trust -= 1; Q.krell_backed = 1; },
          'Umbara falls. So do thousands of troopers who did not need to die. Krell is quietly reassigned, and no one asks why his "mistakes" all helped the enemy.'],
        b: ['Demand an inquiry.', 'The front slips; the troops trust the Senate more, and the inquiry may find more than incompetence.', function (Q) { SW.pushFront(Q, 'mid', -0.5); Q.jedi_standing += 2; Q.clone_trust += 1; Q.faith += 0.5; Q.evidence += 0.5; },
          'The inquiry finds that Krell was in contact with Count Dooku. Someone placed a traitor in command, and someone else made sure no one looked.']}},
    ryloth: {title: 'Free Ryloth', when: function (Q) { return Q.date >= 140 && SW.front(Q, 'outer') < 3; },
      text: 'Twi\'lek freedom fighters under Cham Syndulla offer to fight the droid occupation of Ryloth, in exchange for arms and the promise of self-government. Ryloth\'s senator, Orn Free Taa, wants nothing of the kind.',
      def: 'b', options: {
        a: ['Arm Cham Syndulla.', 'The Outer Rim front gains and the Rim is grateful; Orn Free Taa is furious.', function (Q) { SW.pushFront(Q, 'outer', 1.5); Q.rim_relation += 4; Q.outer_sep -= 2; Q.free_ryloth = 1; },
          'Syndulla\'s fighters and Republic troops liberate Ryloth together. The Twi\'leks remember who armed them, and Orn Free Taa remembers who did not ask him.'],
        b: ['Leave it to the Republic\'s forces.', 'Slower, and the Twi\'leks resent liberators who never leave.', function (Q) { SW.pushFront(Q, 'outer', 0.5); Q.rim_relation -= 2; Q.outer_sep += 1; },
          'Ryloth is retaken street by street. The occupation ends; the garrison stays.']}},
    blockade: {title: 'Siege or Corridors', when: function (Q) { return SW.front(Q, 'outer') <= 2; },
      text: 'The Republic blockade of Separatist-held worlds is working, and the people inside them are starving. Relief agencies ask for humanitarian corridors. The admirals say corridors are how droid armies get resupplied.',
      def: 'a', options: {
        a: ['Tighten the blockade.', 'The front gains; hunger and resentment grow on the Rim.', function (Q) { SW.pushFront(Q, 'outer', 1); Q.rim_hardship += 3; Q.faith -= 1; Q.outer_sep += 2; Q.bacta += 5; },
          'The blockade holds, and the sieges grind on. The worlds inside it will remember who starved them.'],
        b: ['Open humanitarian corridors.', 'The front slips; faith rises, the hunger eases, and the talks gain a little.', function (Q) { SW.pushFront(Q, 'outer', -0.5); Q.faith += 1; Q.rim_hardship -= 2; Q.peace_talks += 0.2; },
          'Relief convoys roll through the lines under truce flags. Some droids get through too. So do some letters, between people on both sides who want this to end.']}},
    mandalore: {title: 'Mandalore\'s Neutrality', when: function (Q) { return Q.date >= 146 && !Q.mandalore_pressed; },
      text: 'Duchess Satine\'s Council of Neutral Systems refuses to let Republic forces through Mandalorian space. The Security Bloc wants bases there, neutrality or not.',
      def: 'b', options: {
        a: ['Respect Mandalore\'s neutrality.', 'The Core approaches stay exposed; the neutral worlds and Satine are grateful.', function (Q) { SW.pushFront(Q, 'core', -0.5); Q.ind_relation += 6; Q.satine_friend = 1; Q.peace_talks += 0.1; },
          'The Republic keeps its word to the neutrals. Satine keeps a channel open to both sides, and to the Caucus.'],
        b: ['Press Mandalore for bases.', 'The Core front gains; the neutrals are furious, and Death Watch finds recruits.', function (Q) { SW.pushFront(Q, 'core', 1.5); Q.ind_relation -= 8; Q.mandalore_pressed = 1; Q.fear += 1; },
          'Republic cruisers take station over Mandalore. Satine protests to the Senate; in the cities below, Death Watch tells anyone who will listen that the Duchess has sold them out.']}},
    levy: {title: 'The Member-World Fleets', when: function (Q) { return !Q.fleet_levy; },
      text: 'Corellia, Kuat and Mon Calamari could raise fleets of their own for the Republic, if the Senate pays for them and lets them keep their own command.',
      def: 'b', options: {
        a: ['Levy the member-world fleets.', '−2 treasury. Forces loyal to their worlds and the Senate; the unaligned worlds resent the cost.', function (Q) { Q.treasury -= 2; Q.member_forces += 1.5; Q.navy_loyalty += 5; Q.fleet_levy = 1; Q.war_balance += 0.5; Q.tibanna += 8; },
          'Corellian and Mon Calamari squadrons join the line under their own flags. They answer to their worlds, and their worlds answer to the Senate.'],
        b: ['Leave defence to the Grand Army.', 'Cheaper; the Chancellery\'s army grows instead.', function (Q) { Q.sec_relation += 2; Q.grand_plan += 1; if (Q.kamino_army) Q.clones += 0.5; },
          'The member worlds keep their ships at home. The war belongs to the Grand Army, and the Grand Army belongs to the Chancellor.']}},
    clone_surge: {title: 'A Surge from Kamino', when: function (Q) { return Q.kamino_army && Q.clones > 0; },
      text: 'The Kaminoans can double clone production, if the Republic pays. The generals want the troops; the Pacifists ask who these soldiers will answer to.',
      def: 'a', options: {
        a: ['Order the surge.', 'The whole war goes better; the Sith\'s plan advances, and the debt grows.', function (Q) { Q.clones += 1.5; Q.war_balance += 1; Q.grand_plan += 2; Q.treasury -= 1; Q.bacta += 5; },
          'New legions pour out of Tipoca City. Every one of them carries a chip no one in the Senate has seen.'],
        b: ['Hold production where it is.', 'The war goes slower; the Pacifists approve.', function (Q) { Q.war_balance -= 0.5; Q.rad_pacifist -= 2; Q.rad_hawk += 2; Q.mil_cuts = (Q.mil_cuts || 0) + 1; },
          'Kamino\'s new production lines stand idle. The Security Bloc calls it unilateral disarmament.']}},
    refugees: {title: 'Refugees from the Sieges', when: function (Q) { return SW.front(Q, 'outer') < 0; },
      text: 'Millions are fleeing the Outer Rim sieges toward the Colonies and the Core. The Core Moderates want the hyperlanes closed to them.',
      def: 'b', options: {
        a: ['Open the Core worlds to them.', '−1 treasury. The Rim is grateful; the Core Moderates are not.', function (Q) { Q.treasury -= 1; Q.faith += 1; Q.rim_relation += 5; Q.mod_relation -= 4; Q.rim_hardship -= 2; },
          'Refugee ships land at Corellia, Chandrila and Alderaan. Bail Organa meets the first of them himself.'],
        b: ['Turn them back.', 'The Core Moderates approve; the Rim will not forget.', function (Q) { Q.mod_relation += 3; Q.rim_relation -= 6; Q.outer_sep += 3; Q.faith -= 1; },
          'Patrol cruisers turn the refugee convoys back toward the war. Some of them turn toward the Confederacy instead.']}},
    zygerria: {title: 'The Zygerrian Slavers', when: function (Q) { return Q.date >= 148; },
      text: 'The Confederacy\'s Zygerrian allies are enslaving the populations of captured worlds; the whole colony of Kiros has vanished into their markets. A rescue would pull ships off the front.',
      def: 'b', options: {
        a: ['Mount a rescue.', '−1 treasury. Faith rises, and the case against slavery grows.', function (Q) { Q.treasury -= 1; Q.faith += 1; Q.slavery_campaign += 0.5; Q.jedi_standing += 2; SW.pushFront(Q, 'outer', -0.3); },
          'A Jedi task force frees the Togruta of Kiros. The HoloNet carries the pictures from Zygerria\'s slave markets for weeks.'],
        b: ['Stay on strategy.', 'The front is unaffected; the Rimward wing is appalled.', function (Q) { Q.rad_rimward += 4; Q.faith -= 0.5; },
          'The fleet holds its positions. Somewhere in Zygerrian space, the colonists of Kiros wait for a rescue that does not come.']}},
    jedi_stretch: {title: 'The Jedi Are Overstretched', when: function (Q) { return Q.jedi_generals && Q.jedi_strength < 7; },
      text: 'A tenth of the Jedi Order has died in command. The Council asks to withdraw its Knights from the front lines and return to keeping the peace.',
      def: 'b', options: {
        a: ['Let them withdraw.', 'The Order survives; the war goes harder.', function (Q) { Q.jedi_generals = 0; Q.jedi_strength += 0.5; Q.war_balance -= 0.7; Q.jedi_relation += 5; Q.anakin_fall -= 0.3; },
          'Jedi Masters hand their commands to clone officers. The Order begins, slowly, to remember what it was.'],
        b: ['Keep them at the front.', 'The war goes better; the Order bleeds, and Anakin grows darker.', function (Q) { Q.war_balance += 0.5; Q.jedi_strength -= 0.5; Q.jedi_standing -= 3; Q.anakin_fall += 0.3; },
          'The Jedi stay at the front. The war needs them, the Senate says. Fewer come back each season.']}},
    citadel: {title: 'The Citadel', when: function (Q) { return Q.date >= 150 && (Q.tarkin_rising > 0 || Q.sec_leader_id === 'tarkin') && !Q.citadel; },
      text: 'Wilhuff Tarkin proposes the Citadel: an unbreakable prison for Separatist commanders and Jedi "deserters", run by the military, outside the courts.',
      def: 'a', options: {
        a: ['Approve the Citadel.', 'The Security Bloc and Tarkin rise; faith in the law suffers.', function (Q) { Q.sec_relation += 5; Q.citadel = 1; Q.faith -= 1; Q.tarkin_rising += 1; Q.fear -= 1; },
          'The Citadel opens on Lola Sayu. Its first inmates never see a judge.'],
        b: ['Insist on the courts.', 'The Security Bloc is angry; the law holds.', function (Q) { Q.sec_relation -= 5; Q.faith += 1; Q.senate_resolve += 0.3; },
          'Prisoners of war will be tried, not disappeared. Tarkin calls the Senate "a debating society at war".']}},
    bacta: {title: 'The Bacta Convoys', when: function (Q) { return (Q.bacta || 0) >= 25; },
      text: 'Separatist raiders are hitting the bacta convoys from Thyferra. Field hospitals are running short, and the Xucphra and Zaltin cartels are raising their prices.',
      def: 'b', options: {
        a: ['Escort the convoys.', '−1 treasury. Bacta flows; ships are pulled from the Outer Rim.', function (Q) { Q.treasury -= 1; Q.bacta -= 20; SW.pushFront(Q, 'outer', -0.5); },
          'Republic frigates shepherd the bacta tankers from Thyferra. The wounded get their tanks; the sieges wait a little longer.'],
        b: ['Let the cartels pay for escorts.', 'The guilds are pleased; prices rise, and someone profits.', function (Q) { Q.bacta += 10; Q.guild_relation += 2; Q.corruption += 1; },
          'The cartels hire mercenary escorts and pass the cost on, with a margin.']}},
    hydian: {title: 'The Hydian Way Convoys', when: function (Q) { return SW.front(Q, 'mid') < 1 || (Q.trade || 60) < 50; },
      text: 'Separatist raiders are strangling the Hydian Way, the great trade road from the Core to the Rim. Merchant captains want armed escorts.',
      def: 'b', options: {
        a: ['Run armed convoys.', '−1 treasury. Trade recovers and the Mid Rim front firms up.', function (Q) { Q.treasury -= 1; Q.trade = (Q.trade || 60) + 8; SW.pushFront(Q, 'mid', 0.5); },
          'Convoys run the Hydian Way under escort. Freight rates fall, and so do the raiders\' profits.'],
        b: ['Reroute along the Perlemian.', 'Cheaper now; trade suffers and the guilds grumble.', function (Q) { Q.trade = (Q.trade || 60) - 4; Q.guild_relation -= 2; },
          'Freighters take the long way round. The Mid Rim worlds along the Hydian Way are left to fend for themselves.']}}
  };
  SW.pickDilemma = function (Q) {
    Q.wd_id = ''; Q.wd_has = 0; Q.wd_heading = 'The Season\'s Orders';
    var pool = [];
    for (var id in SW.DILEMMAS) {
      if (Q['wd_seen_' + id]) continue;
      var ok = false;
      try { ok = SW.DILEMMAS[id].when(Q); } catch (e) { ok = false; }
      if (ok) pool.push(id);
    }
    if (!pool.length) return;
    var id2 = pool[Math.floor(SW.rnd() * pool.length)];
    var D = SW.DILEMMAS[id2];
    Q.wd_id = id2; Q.wd_has = 1; Q['wd_seen_' + id2] = 1; Q.wd_heading = D.title;
    Q.wd_title = D.title; Q.wd_text = D.text;
    Q.wd_a_label = D.options.a[0]; Q.wd_a_sub = D.options.a[1];
    Q.wd_b_label = D.options.b[0]; Q.wd_b_sub = D.options.b[1];
    Q.wd_def = D.def;
    var dl = D.options[D.def][0].replace(/\.$/, '');
    Q.wd_def_label = dl.charAt(0).toLowerCase() + dl.slice(1);
  };
  // when the Caucus does not command, its choice needs a Senate majority; otherwise the government's choice stands
  SW.dilemmaResolve = function (Q, key) {
    var D = SW.DILEMMAS[Q.wd_id];
    if (!D) return;
    Q.wd_overruled = 0;
    var pick = key;
    if (!Q.wc_command && key !== D.def) {
      var chance = 0.35 + (Q.rc_in_govt ? 0.15 : 0) + Q.senate_resolve * 0.03 + ((Q.rc_votes || 15) - 15) / 100;
      if (SW.rnd() >= SW.clamp(chance, 0.1, 0.8)) { pick = D.def; Q.wd_overruled = 1; }
    }
    D.options[pick][2](Q);
    Q.wd_result = D.options[pick][3];
    Q.dilemmas_decided = (Q.dilemmas_decided || 0) + 1;
  };

  // war aims: set once, when the war begins
  SW.WAR_AIM_TEXT = {victory: 'total victory', peace: 'a negotiated peace', rim: 'the liberation of the Rim'};
  SW.setWarAim = function (Q, aim) {
    Q.wa_overruled = 0;
    var gov = Q.chancellor_bloc === 'rim' ? 'rim' : 'victory';
    var chosen = aim;
    if (!SW.warCommand(Q) && aim !== gov) {
      var st = SW.stance(Q, {pal: 0.1, sec: 0.15, mod: aim === 'peace' ? 0.45 : 0.5, guild: aim === 'peace' ? 0.55 : 0.3, ind: aim === 'peace' ? 0.7 : 0.45, rim: aim === 'rim' ? 0.85 : 0.55, rfc: 0.8, cis: 0}, true);
      Q.wa_vote = SW.vote(Q, st, 1, aim === 'peace' ? 'peace' : 'rim');
      Q.vote_html = SW.voteBanner('War aims: ' + SW.WAR_AIM_TEXT[aim], Q.wa_vote);
      if (Q.wa_vote < 50) { chosen = gov; Q.wa_overruled = 1; }
    } else Q.vote_html = ' ';
    Q.war_aim = chosen;
    Q.war_aim_text = SW.WAR_AIM_TEXT[chosen];
  };


  // ------------------------------------------------------------------ the Republic's purse
  // A yearly budget raises money one way and spends it on one priority. Shortfalls are lent by the
  // InterGalactic Banking Clan, whose debts buy it influence. Trade along the hyperlanes feeds the
  // budget; bacta, Tibanna gas and spice markets can each tip into crisis.
  // Every source of money has a constituency that pushes back, harder each year it is used in a row.
  SW.fatigue = function (Q, src) { return 1 + 0.5 * Math.max(0, (Q['rev_streak_' + src] || 0) - 1); };
  SW.react = function (Q, line) { (Q._reactions = Q._reactions || []).push(line); };
  var times = function (n) { return n <= 1 ? '' : (n === 2 ? ' (second year running)' : ' (' + n + ' years running)'); };
  SW.REVENUE = {
    tariffs: {name: 'trade-route tariffs', yield: function (Q) { return 1 + (Q.trade || 60) / 25; },
      apply: function (Q, fat, n) {
        SW.guildPatience(Q, -12 * fat * (Q._owns ? 1 : 0.35), 'tariffs' + times(n));
        Q.guild_relation -= 4; Q.rim_hardship += 1 * fat; Q.trade = (Q.trade || 60) - 3 * fat; Q.patrons_goodwill -= 3;
        SW.react(Q, 'The guilds\' patience wears thinner: tariffs' + times(n) + '.');
        SW.react(Q, 'Shippers pass the cost on to the Rim: hardship up, trade down.');
      }},
    levy: {name: 'a levy on the Core worlds', yield: function () { return 3; },
      apply: function (Q, fat, n) {
        Q.patrons_goodwill -= (Q._owns ? 15 : 5) * fat; Q.core_rc *= 1 - (Q._owns ? 0.03 : 0.01) * fat; Q.colonies_rc *= 1 - 0.02 * fat; Q.mod_relation -= 4 * fat; Q.ind_relation -= 2;
        SW.react(Q, Q._owns ? 'Our own Core patrons pay the levy' + times(n) + ': their goodwill, and their donations to the Caucus, fall.' : 'The Core pays the government\'s levy' + times(n) + '; our patrons mostly blame the Chancellery.');
        SW.react(Q, 'The Core Moderates resent it; our support in the Core dips.');
      }},
    loan: {name: 'a loan from the Banking Clan', yield: function () { return 3; },
      apply: function (Q) { Q.debt += 3; SW.guildPatience(Q, 3); SW.react(Q, 'The Banking Clan is delighted to lend: the debt grows by 3.'); }},
    bonds: {name: 'war bonds', yield: function (Q) { var y = 1 + Q.faith / 25; return Q.faith >= 45 ? y : y / 2; },
      apply: function (Q, fat, n) {
        if (Q.faith < 45) { Q.faith -= 1; SW.react(Q, 'The bond drive is undersubscribed: faith in the Republic is too low. The failure is public.'); }
        else { Q.war_weariness -= 1; SW.react(Q, 'Citizens buy war bonds' + times(n) + '.'); }
        if (n >= 3) { Q.war_weariness += 1; SW.react(Q, 'Bond fatigue: every year the drives feel more like a tax.'); }
      }},
    spice: {name: 'the spice duty', yield: function () { return 2; },
      apply: function (Q, fat) {
        Q.corruption += 0.75 * fat;
        if (Q.corruption > 65) { Q.grand_plan += 0.5; SW.react(Q, 'Pyke Syndicate money flows through the spice duty, and some of it into accounts nobody can trace.'); }
        else SW.react(Q, 'The spice trade pays its duty, and buys a few officials along the way.');
      }},
    print: {name: 'debasing the Republic credit', yield: function () { return 4; },
      apply: function (Q, fat, n) {
        Q.inflation = (Q.inflation || 0) + 15 * fat; Q.patrons_goodwill -= 10;
        SW.react(Q, 'The Treasury prints credits' + times(n) + ': prices rise across the Republic, and Core savers are furious.');
      }},
    none: {name: 'existing taxes only', yield: function () { return 0; }, apply: function () {}}
  };
  SW.PRIORITY = {
    relief: {name: 'Rim relief and hyperlane patrols', cost: function () { return 3; },
      apply: function (Q) {
        Q.rim_hardship -= 4; Q.trade = (Q.trade || 60) + 6; Q.rim_relation += 3; Q.mod_relation -= 2; Q.rim_donors = Math.min(2, (Q.rim_donors || 0) + 1);
        SW.react(Q, 'The Rim is grateful, and Rim worlds start sending small donations to the Caucus. The Core Moderates grumble about paying for the Rim.');
      }},
    defence: {name: 'defence', cost: function (Q) { return 3 + ((Q.tibanna || 0) >= 55 ? 1 : 0); },
      apply: function (Q) {
        Q.judicial_forces += 0.7; Q.tibanna += 6; if (Q.war) SW.pushFront(Q, SW.weakestFront(Q), 1); Q.sec_relation += 2; Q.rad_pacifist += 2;
        SW.react(Q, 'The Security Bloc approves; the Pacifists do not. Tibanna gas grows dearer.');
      }},
    subsidies: {name: 'subsidies for the Core and the guilds', cost: function () { return 2; },
      apply: function (Q) {
        Q.mod_relation += 4; Q.guild_relation += 4; Q.corruption += 0.5; Q.rad_rimward += 2; Q.patrons_goodwill += 6;
        SW.guildPatience(Q, 10);
        SW.react(Q, 'The guilds and the Core\'s patrons are pleased; the Rimward wing calls it a handout to the rich.');
      }},
    repay: {name: 'repaying the Banking Clan', cost: function () { return 3; },
      apply: function (Q) { Q.debt -= 3; Q.patrons_goodwill += 3; SW.react(Q, 'The debt shrinks by 3, and the Core\'s bankers approve.'); }},
    none: {name: 'nothing in particular', cost: function () { return 0; },
      apply: function () {}}
  };

  // ---------------------------------------------------- the guilds' patience: the Trade Federation's playbook
  SW.GUILD_STEPS = [50, 35, 20, 10, 5];
  SW.GUILD_LOBBY_LEAN = {guild: 0.1, ind: 0.05, mod: 0.03};
  SW.GUILD_STEP_NAMES = ['lobbying against our bills', 'a shipping slowdown', 'a credit strike', 'a blockade', 'defection to the Separatists'];
  SW.guildPatience = function (Q, delta, why) {
    var p = Q.guild_patience === undefined ? 60 : Q.guild_patience;
    Q.guild_patience = SW.clamp(p + delta, 0, 100);
    if (delta < 0) { Q.guild_hurt_turn = Q.time; if (why) Q.guild_patience_why = why; }
  };
  // Cutting regulation: the guilds are delighted, the Rim pays, and grateful donors open their purses.
  // Three rounds of it and the guilds' security forces will answer the Caucus in the Last Days.
  SW.cutRegulation = function (Q) {
    Q.treasury -= 1;
    Q.outer_rc -= 1; Q.midrim_rc -= 1; Q.rim_relation -= 4;
    Q.guild_relation += 10; SW.guildPatience(Q, 15);
    Q.trade = (Q.trade || 60) + 6;
    Q.dereg_count = (Q.dereg_count || 0) + 1;
    Q.corp_donors_ready = 1;
    if (Q.dereg_count >= 3) Q.corporate_security = 1;
    SW.computeSupport(Q);
  };
  SW.guildTick = function (Q, f) {
    // with the Trade Federation broken up, the guilds can no longer threaten the Republic: no escalation, no embargo, no lobby
    if (Q.tf_broken_up) { Q.guild_step_ready = 0; Q.guild_lobby = 0; Q.guild_embargo = 0; return; }
    var p = Q.guild_patience;
    // patience returns when the pressure stops; a pleased guild slowly forgets its gratitude
    if (Q.guild_hurt_turn !== Q.time) {
      if (p < 60) Q.guild_patience = Math.min(60, p + 2.5 * f * (SW.guildWing(Q) === 'confederates' ? 0.5 : 1));
      else if (p > 60) Q.guild_patience = Math.max(60, p - 1 * f);
    }
    p = Q.guild_patience;
    for (var i = 0; i < SW.GUILD_STEPS.length; i++) if (p > SW.GUILD_STEPS[i] + 15) Q['guild_step_' + (i + 1)] = 0;
    if (p > 65) Q.guild_lobby_halved = 0;
    Q.guild_lobby = p < 50 ? (Q.guild_lobby_halved ? 0.5 : 1) : 0;
    if (!Q.guild_step_ready && SW.guildEscalates(Q)) {
      for (var j = 0; j < SW.GUILD_STEPS.length; j++) {
        if (p < SW.GUILD_STEPS[j] && !Q['guild_step_' + (j + 1)]) { Q.guild_step_ready = j + 1; break; }
      }
    }
    // guild-funded HoloNet campaigns against the Caucus
    if (p < 35) {
      for (var k = 0; k < SW.REGIONS.length; k++) {
        var r = SW.REGIONS[k];
        Q[r + '_rc'] -= 0.15 * f * ((r === 'core' || r === 'corporate') ? 2 : 1);
      }
    }
  };
  SW.guildStepOpen = function (Q) {
    var s = Q.guild_step_ready;
    Q.guild_step_ready = 0; Q['guild_step_' + s] = 1; Q.gs_step = s;
    Q.guild_steps_total = (Q.guild_steps_total || 0) + 1;
    Q['guild_step_count_' + s] = (Q['guild_step_count_' + s] || 0) + 1;
    Q.gs_leader = Q.guild_leader || 'the guilds';
    Q.gs_why = Q.guild_patience_why || 'the Caucus\'s policies';
    Q.gs_world = 'Rodia';
    Q.gs_heading = ['The Lobbyists Arrive', 'The Freighters Stop', 'A Credit Strike', 'The Blockade of Rodia', 'The Guilds Go Over'][s - 1];
    if (s === 2) { Q.trade -= 10; Q.rim_hardship += 2; }
    if (s === 3) { Q.guild_embargo += 3; Q.embargo_timer = 0; }
    if (s === 4) { Q.fear += 3; Q.trade -= 8; Q.rim_hardship += 3; Q.midrim_rc -= 1.5; Q.guild_blockades = (Q.guild_blockades || 0) + 1; }
    if (s === 5) {
      Q.guild_defections = (Q.guild_defections || 0) + 1;
      if (Q.dooku_movement) { Q.corporate_sep += 15; if (Q.war || Q.dooku_movement) Q.droid_armies += 1; Q.gs_open = 1; Q.gs_split = SW.guildsDefect(Q) > 0 ? 1 : 0; }
      else { Q.grand_plan += 2; Q.corporate_sep += 10; Q.gs_open = 0; }
    }
  };
  SW.guildPatienceLabel = function (p) {
    return p >= 75 ? '<span class="good">generous</span>' : (p >= 50 ? 'patient' : (p >= 35 ? '<span class="warn">wearing thin</span>' : (p >= 20 ? '<b class="bad">exhausted</b>' : (p >= 10 ? '<b class="bad">hostile</b>' : '<b class="bad">at war with us</b>'))));
  };
  SW.guildNextStep = function (Q) {
    for (var k = 0; k < SW.GUILD_STEPS.length; k++) if (Q.guild_patience < SW.GUILD_STEPS[k] && !Q['guild_step_' + (k + 1)]) return 'Coming: ' + SW.GUILD_STEP_NAMES[k] + '.';
    for (var i = 0; i < SW.GUILD_STEPS.length; i++) if (Q.guild_patience >= SW.GUILD_STEPS[i]) return 'Next, below ' + SW.GUILD_STEPS[i] + ': ' + SW.GUILD_STEP_NAMES[i] + '.';
    return 'They have nothing left to try but the Separatists.';
  };

  // ---------------------------------------------------- the budget must pass the Senate
  SW.BUDGET_LEANS = {
    rev: {tariffs: {guild: -0.5, ind: -0.1, rim: 0.1, rfc: 0.1}, levy: {mod: -0.45, ind: -0.1}, loan: {guild: 0.1, pal: 0.1},
      print: {mod: -0.2, guild: -0.15}, bonds: {sec: 0.1}, spice: {ind: -0.05}},
    pri: {relief: {rim: 0.3, rfc: 0.3, mod: -0.1}, defence: {sec: 0.3, ind: -0.05}, subsidies: {mod: 0.15, guild: 0.25, rim: -0.15, rfc: -0.15},
      repay: {mod: 0.1, guild: 0.1}, none: {rim: -0.1, sec: -0.1}}
  };
  // what a budget's taxes and spending mean to the wings that resent them (for radicalism; the budget's odds have their own leans)
  SW.BUDGET_TOPICS = {rev: {tariffs: 'trade_tax', levy: 'core_tax'}, pri: {relief: 'rim', defence: 'army', subsidies: '-regulate'}};
  SW.budgetStance = function (Q, rev, pri) {
    var st = {}, why = {};
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      if (b === 'rc') continue;
      var p = 0.5 + ((Q.govt_blocs || []).indexOf(b) >= 0 ? 0.25 : -0.1);
      var lr = (SW.BUDGET_LEANS.rev[rev] || {})[b] || 0, lp = (SW.BUDGET_LEANS.pri[pri] || {})[b] || 0;
      p += lr + lp;
      if (SW.CONTEST_BLOCS.indexOf(b) >= 0 && Q[b + '_leader_id']) p += 0.03 * SW.leaderMood(Q, b).score;
      if (b === 'cis') p = 0;
      st[b] = SW.clamp(p, 0, 1);
      why[b] = lr < -0.15 ? SW.REVENUE[rev].name : (lp < -0.05 ? (pri === 'none' ? 'the spending cuts' : SW.PRIORITY[pri].name) : '');
    }
    Q._budget_why = why;
    return st;
  };
  // put a budget to the Senate; a defeated budget becomes a stopgap
  SW.budgetPropose = function (Q, rev, pri, rcYes, writer) {
    Q._reactions = [];
    Q._owns = (writer || rcYes) ? 1 : 0;
    var st = SW.budgetStance(Q, rev, pri), why = Q._budget_why;
    Q.bd_vote = SW.vote(Q, st, rcYes);
    if (Q.bd_vote >= 50 && pri === 'none' && Q._owns) Q.mil_cuts = (Q.mil_cuts || 0) + 1;
    var bt = [SW.BUDGET_TOPICS.rev[rev], SW.BUDGET_TOPICS.pri[pri]].filter(function (x) { return !!x; });
    // a budget that passes is the whole government's: its partners own its taxes and spending, whatever their senators voted
    if (bt.length) for (var bb in SW._lastP) {
      var bp = SW._lastP[bb], gv = Q.bd_vote >= 50 && (Q.govt_blocs || []).indexOf(bb) >= 0;
      if (bb !== 'rc' && (bp >= 0.5 || gv)) SW.radicalise(Q, bb, bt, Math.max(gv ? 0.6 : 0, 0.3 + 1.4 * (bp - 0.5)));
    }
    Q.vote_html = SW.voteBanner('The budget: ' + SW.REVENUE[rev || 'none'].name + ', spending on ' + SW.PRIORITY[pri || 'none'].name, Q.bd_vote);
    // how the blocs lined up, and coalition partners' red lines
    var lines = [];
    for (var b in st) {
      if (b === 'cis') continue;
      var word = st[b] >= 0.65 ? 'for' : (st[b] <= 0.35 ? 'against' : 'split');
      lines.push(SW.name(Q, b) + ' ' + word + (word === 'against' && why[b] ? ' (' + why[b] + ')' : ''));
      if (Q.rc_in_govt && (Q.govt_blocs || []).indexOf(b) >= 0 && st[b] < 0.35 && rcYes) {
        Q.coalition_dissent += 0.5;
        SW.react(Q, 'The ' + SW.name(Q, b) + ' object to ' + (why[b] || 'the budget') + ', and the coalition strains.');
      }
    }
    Q.bd_stances = lines.join(' · ');
    Q.bd_failed = Q.bd_vote >= 50 ? 0 : 1;
    if (!Q.bd_failed) {
      var prevPri = Q.budget_pri;
      SW.budgetApply(Q, rev, pri);
      if (Q._owns) {
        SW.checkBudgetPledges(Q, rev, pri); SW.budgetGrievances(Q, rev, pri, prevPri);
        // a budget the Caucus wrote that funds what a bloc wants earns its gratitude (half as much for the same thing two years running)
        if (writer) {
          var dk = prevPri === pri ? 0.5 : 1;
          if (pri === 'relief') SW.deliver(Q, Q.parties.indexOf('rim') >= 0 ? 'rim' : 'rfc', 10 * dk, 'relief for the Rim');
          if (pri === 'defence') SW.deliver(Q, 'sec', 10 * dk, 'money for the fleet');
          if (pri === 'defence') Q.mil_invest = (Q.mil_invest || 0) + 1;
          if (pri === 'subsidies') { SW.deliver(Q, 'guild', 8 * dk, 'subsidies for trade'); SW.deliver(Q, 'mod', 5 * dk, 'subsidies for the Core'); }
          if (pri === 'repay') { SW.deliver(Q, 'mod', 6 * dk, 'a sound treasury'); SW.deliver(Q, 'ind', 4 * dk, 'a sound treasury'); }
        }
      }
      if (writer) Q.budget_defeats = 0;
    } else {
      SW.budgetApply(Q, 'none', 'none');
      if (writer) {
        Q.budget_defeats = (Q.budget_defeats || 0) + 1; Q.budget_defeats_total = (Q.budget_defeats_total || 0) + 1;
        Q.faith -= 0.5;
        if (Q.rc_in_govt) Q.coalition_dissent += 1.5;
        SW.react(Q, 'Our budget is defeated. A stopgap keeps the Republic running, and the Senate wonders whether the Caucus can govern.');
        if (Q.budget_defeats >= 2 && Q.rc_chancellor && !Q.constructive_vonc && !Q.election_due) {
          Q.election_due = 1; Q.govt_fell_now = 1; Q.fall_reason = 'budget'; Q.budget_falls = (Q.budget_falls || 0) + 1;
          SW.walkout(Q, 24);
          SW.react(Q, 'A second defeated budget in a row: the government of Chancellor ' + Q.chancellor + ' falls.');
        } else if (Q.budget_defeats >= 2 && Q.rc_chancellor && Q.constructive_vonc) {
          SW.react(Q, 'A second defeat in a row, but the constructive no-confidence rule keeps our Chancellor in office.');
        }
      } else SW.react(Q, 'The government\'s budget is defeated, and a stopgap keeps the Republic running.');
    }
    Q.bd_reactions = Q._reactions.length ? '<ul class="reactions"><li>' + Q._reactions.join('</li><li>') + '</li></ul>' : ' ';
    Q._reactions = [];
  };
  SW.budgetOutlook = function (Q, rev, pri) {
    var st = SW.budgetStance(Q, rev, pri), yes = 0, tot = 0;
    for (var b in st) { var s = SW.seats(Q, [b]); yes += s * st[b]; tot += s; }
    var rcs = SW.seats(Q, ['rc']);
    return SW.round1(100 * (yes + rcs) / (tot + rcs));
  };

  // ---------------------------------------------------- money is politics
  SW.patronsLabel = function (g) { return g >= 70 ? '<span class="good">generous</span>' : (g >= 45 ? 'steady' : (g >= 25 ? '<span class="warn">resentful</span>' : '<b class="bad">in revolt</b>')); };
  SW.inflationLabel = function (v) { return v < 15 ? 'stable' : (v < 30 ? 'rising' : (v < 50 ? '<span class="warn">high</span>' : '<b class="bad">ruinous</b>')); };
  // the guilds and the Banking Clan bankroll the candidates they like
  // ---------------------------------------------------- campaigning: a message, in a region, at a moment
  SW.CAMPAIGN_MESSAGES = {
    clean: {name: 'clean government', mult: function (Q, r) {
      var m = SW.clamp(1 + (Q.corruption - 55) / 30, 0.4, 1.8) * ((r === 'core' || r === 'colonies') ? 1.2 : 0.8);
      if (Q.scandal_ours_until > Q.date) m *= 0.4;
      return m; }},
    relief: {name: 'Rim relief', mult: function (Q, r) {
      if (r !== 'midrim' && r !== 'outer') return 0.5;
      var m = SW.clamp(0.6 + (Q.rim_hardship - 30) / 25, 0.4, 2);
      if (!(Q.rim_relief >= 1 || Q.budget_pri === 'relief' || Q.rim_enfranchised)) m *= 0.6;
      return m; }},
    security: {name: 'security', mult: function (Q, r) {
      return SW.clamp(0.6 + (Q.fear - 25) / 30, 0.4, 1.8) * (r === 'colonies' ? 1.2 : (r === 'outer' ? 0.7 : 1)); }},
    peace: {name: 'peace', mult: function (Q) {
      if (Q.fear > 55) return -(Q.fear - 55) / 10;
      return SW.clamp(0.6 + (Q.war_weariness || 0) / 50 + (Q.peace_talks || 0) * 0.1, 0.4, 1.8); }},
    republic: {name: 'the Republic', mult: function () { return 0.9; }}
  };
  SW.campaignWord = function (m) { return m < 0 ? 'may backfire' : (m >= 1.4 ? 'strong' : (m >= 0.9 ? 'solid' : (m >= 0.55 ? 'weak' : 'poor'))); };
  SW.campaignPreview = function (Q) {
    for (var k in SW.CAMPAIGN_MESSAGES) Q['cm_word_' + k] = SW.campaignWord(SW.CAMPAIGN_MESSAGES[k].mult(Q, Q.cm_region));
  };
  // A campaign moves a region at once and leaves a presence that holds the gain for years.
  // Each campaign in the same region adds less presence than the last.
  SW.addPresence = function (Q, r, amount) {
    var k = 'cm_presence_' + r, p = Q[k] || 0;
    if (amount >= 0) p += amount * Math.max(0.25, 1 - p / SW.PRESENCE_CAP);
    else p += amount;
    Q[k] = SW.clamp(p, 0, SW.PRESENCE_CAP);
  };
  SW.campaignRun = function (Q, msg) {
    var M = SW.CAMPAIGN_MESSAGES[msg], r = Q.cm_region;
    var m = M.mult(Q, r), eff = SW.CAMPAIGN_SIZE * SW.unity(Q) * m;
    Q[r + '_rc'] += eff;
    SW.addPresence(Q, r, eff);
    if (msg === 'security') Q.rad_pacifist += 2;
    if (msg === 'peace') Q.rad_hawk += 2;
    if (msg === 'relief' && (r === 'core' || r === 'colonies')) Q.mod_relation -= 1;
    Q.cm_effect = SW.round1(eff); Q.cm_backfired = eff < 0 ? 1 : 0; Q.cm_word = SW.campaignWord(m); Q.cm_msg_name = M.name;
    Q.cm_region_name = SW.REGION_NAMES[r];
    if (m >= 1.4) SW.momentum(Q, 0.3, 'a strong campaign in the ' + Q.cm_region_name);
    if (eff < 0) SW.momentum(Q, -0.5, 'a campaign that backfired');
    Q.campaigns_run = (Q.campaigns_run || 0) + 1;
  };

  // ---------------------------------------------------- campaign violence, and who protects the Caucus
  SW.disruptorName = function (Q, r) {
    if (Q.war && r === 'outer' && (Q.mandalore_pressed || Q.date >= 150) && SW.rnd() < 0.3) return 'Death Watch commandos';
    if (Q.guild_patience < 35) return 'thugs hired by the guilds';
    if (Q.war) return 'bounty hunters';
    if (Q.dooku_movement) return 'Separatist agitators';
    return 'Nebula Front militants';
  };
  // will this rally be attacked? (sets the disruptor, their strength, and our local security in that region)
  SW.rallyRisk = function (Q, region, extra) {
    Q.cm_disrupted = 0; Q.cm_protect_won = 0; Q.cm_force_note = 0;
    var risk = 0.06 + Q.fear * 0.002 + (Q.dooku_movement ? 0.08 : 0) + (Q.guild_patience < 35 ? 0.1 : 0) + (Q.war ? 0.06 : 0) + (Q.date < 30 ? 0.05 : 0) + (extra || 0);
    if (SW.rnd() >= SW.clamp(risk, 0, 0.5)) return 0;
    Q.cm_disrupted = 1; Q.disruptions = (Q.disruptions || 0) + 1;
    Q.cm_region = region; Q.cm_region_name = SW.REGION_NAMES[region];
    Q.cm_disruptor = SW.disruptorName(Q, region);
    Q.cm_threat = SW.round1(1.5 + Q.fear / 30 + (Q.dooku_movement ? 0.5 : 0) + (Q.war ? 1 : 0) + SW.rnd() * 1.5);
    Q.cm_local = SW.round1((Q[region + '_rc_share'] || 10) / 6 + ((region === 'core' || region === 'colonies') ? 1 : 0));
    Q.jf_txt = SW.round1(Q.judicial_forces || 0);
    return 1;
  };
  SW.rallyProtect = function (Q, how) {
    var str = 0;
    if (how === 'judicials') str = (Q.judicial_forces || 0);
    if (how === 'guard') str = 5;
    if (how === 'local') str = Q.cm_local;
    str *= 0.8 + SW.rnd() * 0.4;
    Q.cm_protect_won = (how !== 'cancel' && str >= Q.cm_threat) ? 1 : 0;
    if (how === 'judicials' || how === 'guard') {
      Q.force_uses = (Q.force_uses || 0) + 1;
      if (Q.force_uses >= 3) { Q.rad_pacifist += 3; Q.force_uses = 0; Q.cm_force_note = 1; } else Q.cm_force_note = 0;
    }
    if (how === 'cancel') { SW.momentum(Q, -0.2, 'a cancelled rally'); return 0; }
    if (Q.cm_protect_won) { Q.faith += 0.3; Q.fear -= 1; Q.protects_won = (Q.protects_won || 0) + 1; }
    else { Q[Q.cm_region + '_rc'] -= 1; Q.fear += 2; SW.momentum(Q, -0.5, 'a rally broken up by ' + Q.cm_disruptor); Q.protects_lost = (Q.protects_lost || 0) + 1; }
    return Q.cm_protect_won;
  };
  // the free, volunteer-run campaign in a random region
  SW.shoestring = function (Q) {
    var r = SW.REGIONS[Math.floor(SW.rnd() * SW.REGIONS.length)];
    var eff = SW.CAMPAIGN_SIZE * 0.3 * SW.unity(Q);
    Q[r + '_rc'] += eff;
    SW.addPresence(Q, r, eff / 2);
    Q.shoestring_region = SW.REGION_NAMES[r];
  };
  SW.campaignStart = function (Q, msg) {
    Q.cm_msg = msg;
    if (!SW.rallyRisk(Q, Q.cm_region)) SW.campaignRun(Q, msg);
  };
  SW.campaignProtect = function (Q, how) {
    if (SW.rallyProtect(Q, how)) SW.campaignRun(Q, Q.cm_msg);
  };

  // ---------------------------------------------------- world and sector elections
  // dates are months since the start (33 BBY); each contest is held once, if its premise still holds
  SW.WORLD_ELECTIONS = {
    malastare: {name: 'the Malastare sector elections', world: 'Malastare', region: 'midrim', from: 84, to: 104, adv: 'chuchi',
      ours: 'Caucus-backed reformers', theirs: function (Q) { return Q.dooku_movement ? 'Separatist radicals' : 'Ainlee Teem\'s populists'; },
      stakes: 'The Mid Rim\'s mood, and how loudly it talks of leaving.', ok: function () { return 1; },
      win: function (Q) { Q.midrim_rc += 1.5; Q.midrim_sep -= 5; }, lose: function (Q) { Q.midrim_sep += 5; Q.midrim_rim = (Q.midrim_rim || 0) + 1; }},
    chandrila: {name: 'Chandrila\'s senatorial mandate', world: 'Chandrila', region: 'core', from: 72, to: 92, adv: 'mothma',
      ours: 'Mon Mothma', theirs: function () { return 'a Core Moderate backed by the shipping lines'; },
      stakes: 'Mon Mothma\'s seat. If she loses it, she is out of Caucus life for a year.', ok: function (Q) { return Q.mothma_joined || Q.date >= 36; },
      win: function (Q) { Q.core_rc += 2; Q.rad_pacifist -= 3; }, lose: function (Q) { Q.mothma_out_until = Q.date + 12; if (Q.adv_mothma) { Q.adv_mothma = 0; Q.wv_lost_adv = 'Mon Mothma'; } Q.core_rc -= 1; }},
    naboo: {name: 'Naboo\'s royal election', world: 'Naboo', region: 'midrim', from: 96, to: 112, adv: 'amidala',
      ours: 'Queen Jamillia', theirs: function (Q) { return 'a loyalist of ' + ((Q && Q.pal_title) || 'Senator Palpatine'); },
      stakes: 'Palpatine\'s home world, and its delegations across the Chommell sector.', ok: function (Q) { return !Q.sidious_defeated && !Q.pal_disgraced; },
      win: function (Q) { Q.midrim_rc += 2; Q.midrim_pal *= 0.9; Q.pal_relation -= 5; }, lose: function (Q) { Q.midrim_pal += 1.5; Q.grand_plan += 1; }},
    corellia: {name: 'the Corellian Diet', world: 'Corellia', region: 'core', from: 100, to: 120, adv: 'bel_iblis',
      ours: 'Garm Bel Iblis\'s allies', theirs: function () { return 'Security Bloc hardliners'; },
      stakes: 'The Corellian fleet, which a friendly Diet would lend to the Republic\'s member forces.', ok: function (Q) { return Q.date >= 24; },
      win: function (Q) { Q.member_forces += 1; Q.core_rc += 1; }, lose: function (Q) { Q.bel_iblis_out_until = Q.date + 12; if (Q.adv_bel_iblis) { Q.adv_bel_iblis = 0; Q.wv_lost_adv = 'Garm Bel Iblis'; } Q.core_sec += 1; }},
    rodia: {name: 'Rodia\'s senatorial election', world: 'Rodia', region: 'midrim', from: 118, to: 140, adv: 'farr',
      ours: 'Onaconda Farr', theirs: function () { return 'a guild-backed challenger'; },
      stakes: 'Farr\'s mandate, and the Rim\'s trust in the Caucus.', ok: function (Q) { return !Q.farr_dead; },
      win: function (Q) { Q.midrim_rc += 1.5; Q.rim_relation += 4; Q.rad_rimward -= 3; }, lose: function (Q) { Q.midrim_guild = (Q.midrim_guild || 0) + 1; Q.rad_rimward += 4; }},
    kuat: {name: 'the Kuat succession', world: 'Kuat', region: 'core', from: 132, to: 152, adv: '',
      ours: 'the reform-minded heirs of Kuat of Kuat', theirs: function () { return 'an ally of Wilhuff Tarkin'; },
      stakes: 'The greatest shipyards in the Republic, and who the Security Bloc listens to.', ok: function () { return 1; },
      win: function (Q) { Q.member_forces += 1; Q.sec_relation += 4; Q.core_rc += 1; }, lose: function (Q) { Q.grand_plan += 2; Q.core_sec += 1.5; }},
    ryloth: {name: 'the Ryloth assembly', world: 'Ryloth', region: 'outer', from: 130, to: 165, adv: 'chuchi',
      ours: 'Cham Syndulla\'s movement', theirs: function () { return 'Senator Orn Free Taa\'s machine'; },
      stakes: 'Whether the Twi\'leks trust the Republic enough to fight for it.', ok: function (Q) { return Q.war; },
      win: function (Q) { Q.outer_rc += 1.5; Q.free_ryloth = 1; Q.outer_sep -= 3; }, lose: function (Q) { Q.outer_sep += 3; Q.corruption += 1; }},
    mandalore: {name: 'the Mandalorian elections', world: 'Mandalore', region: 'outer', from: 140, to: 170, adv: '',
      ours: 'Duchess Satine\'s New Mandalorians', theirs: function () { return 'Death Watch sympathisers'; },
      stakes: 'Mandalore\'s neutrality, and the Council of Neutral Systems behind it.', ok: function (Q) { return Q.war; },
      win: function (Q) { Q.outer_sep -= 3; Q.satine_friend = 1; Q.war_weariness -= 2; }, lose: function (Q) { Q.mandalore_pressed = 1; Q.war_balance -= 0.5; Q.fear += 2; }}
  };
  SW.worldElectionCheck = function (Q) {
    if (Q.wv_ready || Q.world_election_timer > 0 || Q.finale || Q.game_ending || Q.time < 3 || Q.sidious_defeated) return;
    for (var id in SW.WORLD_ELECTIONS) {
      var W = SW.WORLD_ELECTIONS[id];
      if (Q['we_done_' + id] || Q.date < W.from || Q.date > W.to || !W.ok(Q)) continue;
      Q.wv_ready = 1; Q.wv_id = id; Q['we_done_' + id] = 1;
      return;
    }
  };
  SW.worldPoll = function (Q, region) {
    return SW.clamp(0.42 + ((Q[region + '_rc_share'] || 0) - 18) / 60 + SW.clamp(Q.rc_momentum || 0, -5, 5) * 0.04 + (Q.faith - 50) / 300, 0.15, 0.85);
  };
  SW.worldElectionOpen = function (Q) {
    var W = SW.WORLD_ELECTIONS[Q.wv_id];
    Q.wv_ready = 0; Q.world_election_timer = 3;
    Q.wv_name = W.name; Q.wv_world = W.world; Q.wv_region = W.region; Q.wv_region_name = SW.REGION_NAMES[W.region];
    Q.wv_ours = W.ours; Q.wv_theirs = W.theirs(Q); Q.wv_stakes = W.stakes; Q.wv_lost_adv = '';
    Q.wv_chance = SW.worldPoll(Q, W.region); Q.wv_boost = 0;
    if (Q.wv_id === 'naboo' && Q.naboo_aid) Q.wv_chance = SW.clamp(Q.wv_chance + 0.17, 0.05, 0.95);
    Q.wv_adv = W.adv && Q['adv_' + W.adv] ? W.adv : ''; Q.wv_adv_name = Q.wv_adv ? SW.ADVISOR_NAMES[Q.wv_adv] : '';
    Q.wv_has_adv = Q.wv_adv ? 1 : 0;
    Q.wv_poll = Math.round(50 + (Q.wv_chance - 0.5) * 30);
    Q.wv_heading = W.world + ' Goes to the Polls';
  };
  // how: 'hard' (2 capital), 'advisor', 'money', 'none'; 'hard' may be disrupted first
  SW.worldCampaign = function (Q, how) {
    if (how === 'hard') { Q.capital -= 2; Q.wv_boost += 0.15; }
    if (how === 'advisor') { Q.advisor_action_timer = 5; Q.wv_boost += Q.wv_has_adv ? 0.2 : 0.1; }
    if (how === 'money') { Q.wv_boost += 0.12; Q.corruption += 1; Q.rad_rimward += 4; Q.guild_relation += 2; }
  };
  SW.worldResolve = function (Q) {
    var W = SW.WORLD_ELECTIONS[Q.wv_id];
    var p = SW.clamp(Q.wv_chance + Q.wv_boost, 0.05, 0.95);
    Q.wv_won = SW.rnd() < p ? 1 : 0;
    Q.wv_ours_pct = Math.round(SW.clamp(50 + (p - 0.5) * 30 + (SW.rnd() * 10 - 5) + (Q.wv_won ? 3 : -3), 20, 80));
    if ((Q.wv_won && Q.wv_ours_pct <= 50) || (!Q.wv_won && Q.wv_ours_pct >= 50)) Q.wv_ours_pct = Q.wv_won ? 51 + Math.floor(SW.rnd() * 4) : 46 + Math.floor(SW.rnd() * 4);
    if (Q.wv_won) { W.win(Q); SW.momentum(Q, Q.wv_boost > 0 ? 0.8 : 0.4, 'winning ' + W.name); Q.world_wins = (Q.world_wins || 0) + 1; }
    else { W.lose(Q); SW.momentum(Q, Q.wv_boost > 0 ? -0.8 : -0.3, 'losing ' + W.name); Q.world_losses = (Q.world_losses || 0) + 1; }
    SW.countAdvisors(Q);
  };

  // ---------------------------------------------------- secession referendums
  SW.REFERENDUMS = {
    malastare: {world: 'Malastare', region: 'midrim', ok: function () { return 1; }},
    ordmantell: {world: 'Ord Mantell', region: 'midrim', ok: function () { return 1; }},
    bothawui: {world: 'Bothawui', region: 'midrim', ok: function () { return 1; }},
    onderon: {world: 'Onderon', region: 'outer', ok: function (Q) { return Q.war; }},
    moncala: {world: 'Mon Cala', region: 'outer', ok: function () { return 1; }},
    tion: {world: 'the Tion Cluster', region: 'outer', ok: function () { return 1; }},
    corporate: {world: 'the Corporate Sector', region: 'corporate', ok: function () { return 1; }}
  };
  SW.referendumCheck = function (Q) {
    if (Q.ref_ready || Q.referendum_timer > 0 || !Q.dooku_movement || Q.finale || Q.game_ending || Q.sidious_defeated) return;
    var best = '', bestS = 44;
    for (var id in SW.REFERENDUMS) {
      var R = SW.REFERENDUMS[id];
      if (Q['ref_done_' + id] || !R.ok(Q)) continue;
      var sep = Q[R.region + '_sep'] || 0;
      if (Q[R.region + '_seceded'] >= 0.6) continue;
      if (sep > bestS) { best = id; bestS = sep; }
    }
    if (!best) return;
    Q.ref_ready = 1; Q.ref_id = best; Q['ref_done_' + best] = 1;
    var Rb = SW.REFERENDUMS[best];
    Q.ref_world = Rb.world; Q.ref_region = Rb.region; Q.ref_region_name = SW.REGION_NAMES[Rb.region];
    SW.referendumPoll(Q);
  };
  SW.referendumPoll = function (Q) {
    var r = Q.ref_region, sep = Q[r + '_sep'] || 0;
    Q.ref_chance = SW.clamp(0.66 - (sep - 45) / 60 - Q.rim_hardship / 220 + (Q.rim_enfranchised ? 0.12 : 0) + Math.min(Q.rim_relief || 0, 3) * 0.03 +
      (Q.federal_compact ? 0.1 : 0) + ((Q[r + '_rc_share'] || 0) - 15) / 150, 0.1, 0.9);
    Q.ref_poll = Math.round(50 + (Q.ref_chance - 0.5) * 30);
    Q.ref_poll_word = Q.ref_poll >= 55 ? 'Stay ahead' : (Q.ref_poll > 45 ? 'too close to call' : 'Leave ahead');
  };
  SW.referendumOpen = function (Q) {
    SW.referendumPoll(Q);
    Q.ref_boost = 0; Q.referendum_timer = 4;
    Q.ref_region_name = SW.REGION_NAMES[Q.ref_region]; Q.ref_world = Q.ref_world || SW.REFERENDUMS[Q.ref_id].world;
    Q.ref_bonteri = (Q.ref_id === 'onderon' && Q.bonteri_contact && !Q.bonteri_dead) ? 1 : 0;
    var figs = ['farr', 'chuchi', 'amidala', 'organa'];
    Q.ref_fig = ''; for (var i = 0; i < figs.length; i++) if (!Q.ref_fig && Q['adv_' + figs[i]]) Q.ref_fig = figs[i];
    Q.ref_fig_name = Q.ref_bonteri ? 'Lux Bonteri' : (Q.ref_fig ? SW.ADVISOR_NAMES[Q.ref_fig] : 'one of our advisors');
    Q.ref_heading = Q.ref_world + ' Votes on Secession';
    Q.ref_campaign_ok = Q.capital >= 1 ? 1 : 0;
  };
  SW.referendumCampaign = function (Q, how) {
    if (how === 'relief') { Q.treasury -= 2; Q.rim_hardship -= 1; Q.ref_boost += 0.12; }
    if (how === 'figure') { Q.advisor_action_timer = 5; Q.ref_boost += Q.ref_bonteri ? 0.22 : (Q.ref_fig ? 0.15 : 0.08); }
    if (how === 'expose') { Q.ref_boost += 0.15; Q.dooku_doubt = (Q.dooku_doubt || 0) + 0.3; }
    if (how === 'autonomy') { Q.ref_boost += 0.15; Q.peace_talks = (Q.peace_talks || 0) + 0.3; Q.rad_inst += 3; Q.mod_relation -= 3; }
    if (how === 'campaign') { Q.capital -= 1; Q.ref_boost += 0.1; }
  };
  SW.referendumResolve = function (Q) {
    var r = Q.ref_region, p = SW.clamp(Q.ref_chance + Q.ref_boost, 0.05, 0.95);
    Q.ref_stayed = SW.rnd() < p ? 1 : 0;
    Q.ref_stay_pct = Math.round(SW.clamp(50 + (p - 0.5) * 30 + (SW.rnd() * 8 - 4), 25, 75));
    if ((Q.ref_stayed && Q.ref_stay_pct <= 50) || (!Q.ref_stayed && Q.ref_stay_pct >= 50)) Q.ref_stay_pct = Q.ref_stayed ? 51 + Math.floor(SW.rnd() * 4) : 46 + Math.floor(SW.rnd() * 4);
    Q.ref_leave_pct = 100 - Q.ref_stay_pct;
    if (Q.ref_stayed) { Q[r + '_sep'] -= 6; SW.momentum(Q, 1, Q.ref_world + ' voting to stay'); Q.rim_relation += 3; Q.referendums_won = (Q.referendums_won || 0) + 1; }
    else {
      var frac = Math.min(0.05, 0.65 - (Q[r + '_seceded'] || 0));
      if (frac > 0) { Q[r + '_seceded'] += frac; Q[r] = SW.BASE_WEIGHTS[r] * (1 - Q[r + '_seceded']); Q.secession_recent = SW.round1(frac * SW.BASE_WEIGHTS[r]); }
      Q[r + '_sep'] += 3; Q.grand_plan += 1; Q.droid_armies += 0.3;
      SW.momentum(Q, -1, Q.ref_world + ' voting to leave'); Q.referendums_lost = (Q.referendums_lost || 0) + 1;
    }
    Q.ref_ready = 0;
  };

  // ---------------------------------------------------- grievances and recalls
  // a region builds a grievance when the Caucus backs measures that hurt it; at 6, its worlds recall Caucus senators
  SW.grieve = function (Q, r, v) { Q['grievance_' + r] = (Q['grievance_' + r] || 0) + v; };
  SW.budgetGrievances = function (Q, rev, pri, prevPri) {
    if (rev === 'levy') SW.grieve(Q, 'core', 3);
    if (rev === 'print') { SW.grieve(Q, 'core', 2.5); SW.grieve(Q, 'outer', 2); }
    if (rev === 'tariffs') SW.grieve(Q, 'corporate', 2.5);
    if (prevPri === 'relief' && pri !== 'relief') { SW.grieve(Q, 'midrim', 2.5); SW.grieve(Q, 'outer', 2.5); }
    if (Q.war && pri !== 'defence') SW.grieve(Q, 'colonies', 1.5);
  };
  SW.recallCheck = function (Q) {
    Q.recall_ready = 0;
    if (Q.recall_timer > 0 || Q.finale || Q.game_ending) return;
    var best = '', bv = 5.99;
    for (var i = 0; i < SW.REGIONS.length; i++) { var r = SW.REGIONS[i]; if ((Q['grievance_' + r] || 0) > bv) { best = r; bv = Q['grievance_' + r]; } }
    if (!best) return;
    Q.recall_ready = 1; Q.recall_region = best; Q.recall_region_name = SW.REGION_NAMES[best];
    Q.recall_why = {core: 'levies and a debased credit that fall on the Core', outer: 'a debased credit and cuts to Rim relief', midrim: 'cuts to Rim relief',
      corporate: 'the tariffs that fall on the corporate worlds', colonies: 'budgets that starve the war effort'}[best];
  };
  SW.recallResolve = function (Q, how) {
    var r = Q.recall_region, loss = 0.15;
    if (how === 'apologise') { Q.capital -= 1; loss = 0.07; Q['grievance_' + r] = 1; }
    if (how === 'campaign') { Q.capital -= 1; loss = 0.1; Q['grievance_' + r] = 2; if (r === 'core' || r === 'colonies') Q.mod_relation += 2; else Q.rim_relation += 2; }
    if (how === 'accept') { Q['grievance_' + r] = 2; }
    Q.recall_lost = SW.round1((Q[r + '_rc'] || 0) * loss);
    Q[r + '_rc'] -= Q.recall_lost;
    var gain = {core: 'mod', colonies: 'mod', midrim: 'rim', outer: 'rim', corporate: 'guild'}[r];
    if (Q.parties.indexOf(gain) < 0) gain = 'ind';
    Q[r + '_' + gain] = (Q[r + '_' + gain] || 0) + Q.recall_lost * 0.7;
    SW.momentum(Q, -0.6, 'recalls in the ' + SW.REGION_NAMES[r]);
    Q.recalls = (Q.recalls || 0) + 1; Q.recall_timer = 4; Q.recall_ready = 0;
  };

  // ---------------------------------------------------- a fresh mandate: the Caucus Chancellor calls a confidence vote
  SW.confidenceStance = function (Q) {
    var base = {};
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      if (b === 'rc') continue;
      base[b] = (Q.govt_blocs || []).indexOf(b) >= 0 ? 0.75 - Q.coalition_dissent * 0.04 : (b === 'pal' || b === 'cis' ? 0.05 : 0.3);
    }
    var st = SW.stance(Q, base, false);
    var lift = SW.clamp(Q.rc_momentum || 0, -5, 5) * 0.03 + (Q.faith - 50) / 250;
    for (var k in st) if (k !== 'pal' && k !== 'cis') st[k] = SW.clamp(st[k] + lift, 0, 1);
    return st;
  };
  SW.confidenceOutlook = function (Q) {
    var st = SW.confidenceStance(Q), yes = 0, tot = 0;
    for (var b in st) { var s2 = SW.seats(Q, [b]); yes += s2 * st[b]; tot += s2; }
    var rcs = SW.seats(Q, ['rc']);
    Q.cv_outlook = SW.round1(100 * (yes + rcs) / (tot + rcs || 1));
    return Q.cv_outlook;
  };
  SW.confidenceVote = function (Q) {
    Q.mandate_term = Q.elections_held;
    Q.cv_vote = SW.vote(Q, SW.confidenceStance(Q), 1, 'confidence');
    Q.vote_html = SW.voteBanner('Confidence in Chancellor ' + Q.chancellor + '\'s government', Q.cv_vote);
    Q.cv_won = Q.cv_vote >= 50 ? 1 : 0;
    if (Q.cv_won) {
      Q.next_election_date = Q.date + 48; Q.coalition_dissent = 0; Q.budget_defeats = 0; Q.rc_terms = (Q.rc_terms || 0) + 1; Q.bureau_dossier = Math.max(0, (Q.bureau_dossier || 0) - 1);
      SW.momentum(Q, 1, 'a fresh mandate'); Q.mandates_won = (Q.mandates_won || 0) + 1;
    } else {
      Q.election_due = 1; Q.govt_fell_now = 1; Q.fall_reason = 'confidence';
      SW.momentum(Q, -1, 'losing a confidence vote'); Q.mandates_lost = (Q.mandates_lost || 0) + 1;
    }
  };

  // ---------------------------------------------------- the campaign trail: in election season, a moment every other turn
  SW.trailRival = function (Q) {
    var c = SW.electionCandidates(Q, '_votes').filter(function (b) { return b !== 'rc'; });
    c.sort(function (a, b) { return (Q[b + '_votes'] || 0) - (Q[a + '_votes'] || 0); });
    return c[0] || '';
  };
  SW.ENDORSERS = {
    satine: {name: 'Duchess Satine Kryze of Mandalore', ok: function (Q) { return Q.date >= 48 && !Q.satine_dead; },
      pitch: 'The pacifist ruler of Mandalore will speak for the Caucus as the party of peace.', price: 'The Hawks will grumble at a pacifist\'s blessing.'},
    moncal: {name: 'the Mon Calamari', ok: function (Q) { return Q.parties.indexOf('rim') >= 0 || Q.parties.indexOf('rfc') >= 0; },
      pitch: 'The shipbuilders of Dac, proud and independent, will back the Caucus if our leaders come to them.', price: '−1 political capital for the visit.'},
    kdy: {name: 'Kuat Drive Yards', ok: function (Q) { return Q.date >= 60 || Q.war; },
      pitch: 'The Republic\'s greatest shipyard will lend its name, and its money, to the Caucus.', price: 'They expect contracts: the Pacifists object, and corruption creeps up.'},
    jedi: {name: 'the Jedi Order', ok: function (Q) { return Q.jedi_relation >= 45 && !Q.order66_seen; },
      pitch: 'Friends in the Temple suggest a word from Master Yoda would carry weight with the Senate.', price: 'The Order does not take sides in elections. Asking would embarrass our friends.'}
  };
  SW.trailAvail = function (Q) {
    var out = [], f = Q.next_election_date;
    var ok = {debate: 1, endorse: 0, research: SW.trailRival(Q) ? 1 : 0, gaffe: 1, smear: (!Q.sidious_defeated && Q.grand_plan >= 15) ? 1 : 0};
    for (var e in SW.ENDORSERS) if (SW.ENDORSERS[e].ok(Q)) ok.endorse = 1;
    for (var k in ok) if (ok[k] && Q['trail_' + k + '_for'] !== f) out.push(k);
    return out;
  };
  SW.trailCheck = function (Q) {
    Q.trail_ready = (Q.election_season && Q.elections_held >= 1 && !(Q.trail_timer > 0) && !Q.finale && !Q.game_ending && !Q.election_due && Q.time >= 3 && SW.trailAvail(Q).length) ? 1 : 0;
  };
  SW.trailOpen = function (Q) {
    var avail = SW.trailAvail(Q), W = {debate: 3, endorse: 2.5, research: 2, gaffe: 1 + 2 * (Q.caucus_unrest || 0), smear: 1 + Q.grand_plan / 40};
    var tot = 0, i;
    for (i = 0; i < avail.length; i++) tot += W[avail[i]];
    var r = SW.rnd() * tot, kind = avail[0];
    for (i = 0; i < avail.length; i++) { r -= W[avail[i]]; if (r <= 0) { kind = avail[i]; break; } }
    Q.trail_kind = kind; Q['trail_' + kind + '_for'] = Q.next_election_date; Q.trail_timer = 2; Q.trail_ready = 0;
    Q.tr_speaker = Q.rc_leader;
    var rv = SW.trailRival(Q);
    Q.tr_rival = rv; Q.tr_rival_name = rv ? SW.candidateName(Q, rv) : ''; Q.tr_rival_bloc = rv ? SW.name(Q, rv) : '';
    Q.tr_rival_pal = rv === 'pal' ? 1 : 0; Q.tr_has_rival = rv ? 1 : 0;
    Q.tr_title = {debate: 'The HoloNet Debate', endorse: 'An Endorsement', research: 'Opposition Research', gaffe: 'A Gaffe', smear: 'A Smear'}[kind];
    Q.tr_result = '';
    if (kind === 'endorse') {
      var es = [];
      for (var e in SW.ENDORSERS) if (SW.ENDORSERS[e].ok(Q)) es.push(e);
      var pick = es[Math.floor(SW.rnd() * es.length)];
      var E = SW.ENDORSERS[pick];
      Q.tr_endorser = pick; Q.tr_endorser_name = E.name; Q.tr_pitch = E.pitch; Q.tr_price = E.price; Q.tr_jedi = pick === 'jedi' ? 1 : 0;
    }
    if (kind === 'gaffe') {
      var G = [['core', 'joked that the Core "could stand to lose a few banks"', 'mod'], ['outer', 'called the Outer Rim "the back end of the galaxy"', 'rim'],
        ['colonies', 'said the Judicial Forces "could not guard a cantina"', 'sec'], ['corporate', 'called the guilds "licensed pirates"', 'guild']];
      var g = G[Math.floor(SW.rnd() * G.length)];
      Q.tr_gaffe_region = g[0]; Q.tr_gaffe_text = g[1]; Q.tr_gaffe_bloc = g[2]; Q.tr_gaffe_bloc_name = SW.name(Q, g[2]);
      Q.tr_gaffe_region_name = SW.REGION_NAMES[g[0]];
    }
  };
  var bonusRc = function (Q, b, v) { if (Q.parties.indexOf(b) >= 0) Q['bonus_' + b + '_for_rc'] = (Q['bonus_' + b + '_for_rc'] || 0) + v; };
  SW.trailResolve = function (Q, choice) {
    var k = Q.trail_kind, u = SW.unity(Q), t = '';
    if (k === 'debate') {
      var fit = {reform: Q.corruption > 60, rim: Q.rim_hardship > 40, security: Q.fear > 45, attack: Q.tr_rival !== 'pal' || Q.evidence >= 3}[choice] ? 0.15 : 0;
      var p = 0.25 + 0.3 * u + fit + (Q.rc_leader === 'Mon Mothma' || Q.rc_leader === 'Padmé Amidala' ? 0.1 : 0);
      var won = SW.rnd() < p;
      Q.tr_won = won ? 1 : 0;
      if (choice === 'reform') { if (won) { bonusRc(Q, 'mod', 4); bonusRc(Q, 'ind', 4); Q.core_rc += 0.6; } else bonusRc(Q, 'mod', -2); }
      if (choice === 'rim') { if (won) { bonusRc(Q, 'rim', 5); bonusRc(Q, 'rfc', 5); Q.midrim_rc += 0.6; Q.outer_rc += 0.6; } bonusRc(Q, 'mod', -3); }
      if (choice === 'security') { if (won) { bonusRc(Q, 'sec', 5); Q.colonies_rc += 0.6; } Q.rad_pacifist += 3; }
      if (choice === 'attack') {
        if (won) { for (var i = 0; i < Q.parties.length; i++) if (Q.parties[i] !== Q.tr_rival) Q['bonus_' + Q.parties[i] + '_for_' + Q.tr_rival] = (Q['bonus_' + Q.parties[i] + '_for_' + Q.tr_rival] || 0) - 5; }
        else { Q.faith -= 0.5; if (Q.tr_rival === 'pal') Q.premature_accusations += 0.5; }
      }
      SW.momentum(Q, won ? (choice === 'attack' ? 0.4 : 0.6) : (choice === 'attack' ? -0.7 : -0.4), won ? 'a strong debate' : 'a poor debate');
      Q.debates_won = (Q.debates_won || 0) + (won ? 1 : 0);
    }
    if (k === 'endorse') {
      var e = Q.tr_endorser;
      if (choice === 'accept') {
        if (e === 'satine') { bonusRc(Q, 'ind', 6); Q.rad_pacifist -= 3; Q.rad_hawk += 3; Q.outer_rc += 0.5; SW.momentum(Q, 0.5, 'Duchess Satine\'s endorsement'); }
        if (e === 'moncal') { Q.capital -= 1; bonusRc(Q, 'rim', 5); bonusRc(Q, 'rfc', 5); Q.outer_rc += 1.5; SW.momentum(Q, 0.5, 'the Mon Calamari endorsement'); }
        if (e === 'kdy') { bonusRc(Q, 'sec', 8); Q.core_rc += 1; Q.rad_pacifist += 4; Q.corruption += 1; SW.momentum(Q, 0.4, 'Kuat Drive Yards\' endorsement'); }
        if (e === 'jedi') { Q.jedi_relation -= 6; Q.jedi_standing -= 2; SW.momentum(Q, -0.2, 'an embarrassing approach to the Jedi'); }
        Q.endorsements = (Q.endorsements || 0) + (e === 'jedi' ? 0 : 1);
      } else if (e === 'jedi') { Q.jedi_relation += 3; Q.faith += 0.3; }
    }
    if (k === 'research') {
      var credible = Q.tr_rival !== 'pal' || Q.evidence >= 3;
      if (choice === 'publish') {
        if (credible) { for (var j = 0; j < Q.parties.length; j++) if (Q.parties[j] !== Q.tr_rival) Q['bonus_' + Q.parties[j] + '_for_' + Q.tr_rival] = (Q['bonus_' + Q.parties[j] + '_for_' + Q.tr_rival] || 0) - 6; Q.faith -= 0.5; Q.rad_inst += 3; Q[Q.tr_rival + '_relation'] -= 8; Q.tr_won = 1; }
        else { Q.premature_accusations += 0.5; SW.momentum(Q, -0.6, 'a smear that backfired'); Q.tr_won = 0; }
      }
      if (choice === 'hold') { Q['bonus_' + Q.tr_rival + '_for_rc'] = (Q['bonus_' + Q.tr_rival + '_for_rc'] || 0) + 4; }
      if (choice === 'burn') { Q.faith += 0.3; Q.rad_inst -= 2; SW.momentum(Q, 0.2, 'a clean campaign'); }
    }
    if (k === 'gaffe') {
      var reg = Q.tr_gaffe_region, gb = Q.tr_gaffe_bloc;
      if (choice === 'apologise') { SW.momentum(Q, -0.3, 'a gaffe on the trail'); Q[reg + '_rc'] -= 0.3; }
      if (choice === 'double') {
        if (SW.rnd() < 0.4) { SW.momentum(Q, 0.4, 'standing by a blunt remark'); Q.tr_won = 1; }
        else { SW.momentum(Q, -1, 'a gaffe made worse'); Q[reg + '_rc'] -= 1; bonusRc(Q, gb, -6); Q.tr_won = 0; }
      }
      if (choice === 'ignore') { SW.momentum(Q, -0.7, 'a gaffe left to fester'); Q[reg + '_rc'] -= 0.6; bonusRc(Q, gb, -3); }
    }
    if (k === 'smear') {
      if (choice === 'rebut') { Q.capital -= 1; if (Q.evidence >= 2) { Q.evidence += 0.3; SW.momentum(Q, 0.2, 'a smear rebutted'); Q.tr_won = 1; } else { SW.momentum(Q, -0.3, 'a smear that stuck'); Q.tr_won = 0; } }
      if (choice === 'counter') {
        if (Q.evidence >= 4) { SW.momentum(Q, 0.4, 'turning a smear on its authors'); bonusRc(Q, 'ind', 3); for (var m = 0; m < Q.parties.length; m++) if (Q.parties[m] !== 'pal') Q['bonus_' + Q.parties[m] + '_for_pal'] = (Q['bonus_' + Q.parties[m] + '_for_pal'] || 0) - 4; Q.tr_won = 1; }
        else { Q.premature_accusations += 0.5; Q.faith -= 0.5; SW.momentum(Q, -0.6, 'an accusation without proof'); Q.tr_won = 0; }
      }
      if (choice === 'ignore') { SW.momentum(Q, -0.8, 'a smear left unanswered'); Q.scandal_ours_until = Q.date + 6; }
    }
  };

  // momentum: what the galaxy thinks of the Caucus's direction; it fades unless renewed
  SW.momentum = function (Q, delta, why) {
    Q.rc_momentum = SW.clamp((Q.rc_momentum || 0) + delta, -5, 5);
    if (why) { Q.momentum_why = why; Q.momentum_why_sign = delta >= 0 ? 1 : -1; }
  };
  SW.momentumLabel = function (m) { return m >= 1.5 ? '<span class="good">surging</span>' : (m >= 0.4 ? '<span class="good">rising</span>' : (m > -0.4 ? 'steady' : (m > -1.5 ? '<span class="warn">falling</span>' : '<b class="bad">collapsing</b>'))); };
  SW.warChest = function (Q) {
    var notes = [];
    Q.el_chest_offer = 0; Q.el_chest_taken = 0;
    var add = function (a, c, v) { Q['bonus_' + a + '_for_' + c] = (Q['bonus_' + a + '_for_' + c] || 0) + v; };
    var mo = SW.clamp(Q.rc_momentum || 0, -5, 5);
    Q.el_mom_note = 0;
    if (Math.abs(mo) >= 0.5) {
      for (var mi = 0; mi < Q.parties.length; mi++) if (Q.parties[mi] !== 'rc') add(Q.parties[mi], 'rc', 2 * mo);
      Q.el_mom_note = 1;
      Q.el_mom_text = mo > 0 ? 'The Caucus has momentum (' + SW.momentumLabel(mo).replace(/<[^>]+>/g, '') + '), and the blocs warm to a party on the rise.' : 'The Caucus is on the back foot (momentum ' + SW.momentumLabel(mo).replace(/<[^>]+>/g, '') + '), and the blocs keep their distance.';
    }
    if (Q.guild_patience < 35) {
      add('guild', 'rc', -10); add('ind', 'rc', -6); add('mod', 'rc', -4); add('guild', 'pal', 4); add('ind', 'pal', 4);
      notes.push('The guilds, whose patience with the Caucus is exhausted, are bankrolling our rivals.');
    } else if (Q.guild_patience >= 60 && !Q.integrity_office) {
      Q.el_chest_offer = 1;
      notes.push('The guilds, pleased with the Caucus, have offered to fund our campaign.');
    }
    if ((Q.debt || 0) >= 25) { add('guild', 'pal', 4); add('mod', 'pal', 2); notes.push('The Banking Clan, owed a fortune, backs the Chancellery\'s candidate.'); }
    if ((Q.patrons_goodwill || 60) < 30) { add('mod', 'rc', -4); notes.push('Our own Core patrons, angry at the levy, keep their purses shut.'); }
    Q.el_warchest_text = notes.join(' ');
    Q.el_warchest = notes.length ? 1 : 0;
  };
  SW.interestRate = function (Q) {
    return (0.05 + (Q.debt || 0) / 600) * (Q.banking_independent ? 0.5 : 1) * (Q.debt_refinanced ? 0.8 : 1) * (Q.republic_bonds ? 0.7 : 1) * (Q.debt_premium_until > Q.date ? 1.3 : 1);
  };
  SW.interestDue = function (Q) { return SW.round1((Q.debt || 0) * SW.interestRate(Q)); };
  // the fixed cost of running the Republic and keeping its forces
  SW.upkeep = function (Q) { return SW.round1(1.5 + (Q.judicial_forces || 0) * 0.15 + (Q.member_forces || 0) * 0.15); };
  SW.baseIncome = function (Q) { return SW.round1(2 + (Q.trade || 60) / 30 - Q.guild_embargo / 3); };
  SW.budgetWriter = function (Q) { return (Q.rc_chancellor || Q.chair_finance === 'rc') ? 1 : 0; };
  SW.GOV_BUDGET = {pal: ['levy', 'subsidies'], mod: ['levy', 'repay'], rim: ['tariffs', 'relief'], sec: ['levy', 'defence'],
    guild: ['loan', 'subsidies'], ind: ['levy', 'none'], rfc: ['tariffs', 'relief']};
  // in wartime, Palpatine and the Security Bloc borrow: a Republic in debt is a Republic the Banking Clan can lean on
  SW.GOV_BUDGET_WAR = {pal: ['loan', 'subsidies'], sec: ['loan', 'defence']};
  SW.budgetOpen = function (Q) {
    Q.budget_due = 0;
    Q.bd_write = SW.budgetWriter(Q);
    var gov = (Q.war && SW.GOV_BUDGET_WAR[Q.chancellor_bloc]) || SW.GOV_BUDGET[Q.chancellor_bloc] || ['levy', 'none'];
    if (gov[1] !== 'repay' && (Q.debt || 0) >= 22 && Q.treasury >= 4) gov = [gov[0], 'repay'];
    // governments only raise new money when the treasury runs low
    if (Q.treasury >= 6) gov = ['none', gov[1]];
    if (gov[0] === 'tariffs' && Q.date < Q.tariff_ban_until) gov = ['loan', gov[1]];
    if (gov[0] === 'levy' && Q.date < Q.levy_ban_until) gov = ['loan', gov[1]];
    Q.bd_gov_rev = gov[0]; Q.bd_gov_pri = gov[1];
    Q.bd_gov_text = 'raise money through ' + SW.REVENUE[gov[0]].name + ', and spend on ' + SW.PRIORITY[gov[1]].name;
    Q.bd_rev = ''; Q.bd_pri = '';
    Q.bd_income_base = SW.baseIncome(Q); Q.bd_interest = SW.interestDue(Q); Q.bd_upkeep = SW.upkeep(Q);
    Q.bd_tariff_yield = SW.round1(SW.REVENUE.tariffs.yield(Q)); Q.bd_bond_yield = SW.round1(SW.REVENUE.bonds.yield(Q));
    Q.bd_defence_cost = SW.PRIORITY.defence.cost(Q);
    Q.bd_gov_outlook = SW.budgetOutlook(Q, gov[0], gov[1]);
    Q.bd_gov_breaks = SW.pledgesBrokenBy(Q, gov[0], gov[1]); Q.bd_gov_breaks_n = Q.bd_gov_breaks ? 1 : 0;
    for (var rv in SW.REVENUE) { Q['bd_brk_rev_' + rv] = SW.pledgesBrokenBy(Q, rv, null); Q['bd_brkn_rev_' + rv] = Q['bd_brk_rev_' + rv] ? 1 : 0; }
    Q.gp_label = SW.guildPatienceLabel(Q.guild_patience); Q.pg_label = SW.patronsLabel(Q.patrons_goodwill === undefined ? 60 : Q.patrons_goodwill);
    SW.econStrings(Q);
  };
  SW.budgetPriorityOutlook = function (Q) {
    for (var p in SW.PRIORITY) {
      Q['bd_out_' + p] = SW.budgetOutlook(Q, Q.bd_rev || 'none', p);
      Q['bd_brk_' + p] = SW.pledgesBrokenBy(Q, Q.bd_rev || 'none', p); Q['bd_brkn_' + p] = Q['bd_brk_' + p] ? 1 : 0;
    }
  };
  // apply a budget: one revenue line, one priority, interest; the Banking Clan lends any shortfall
  SW.budgetApply = function (Q, rev, pri) {
    rev = rev || 'none'; pri = pri || 'none';
    var R = SW.REVENUE[rev] || SW.REVENUE.none, P = SW.PRIORITY[pri] || SW.PRIORITY.none;
    // tax fatigue: count consecutive years for the source used, reset the rest
    for (var src in SW.REVENUE) Q['rev_streak_' + src] = (src === rev && rev !== 'none') ? (Q['rev_streak_' + src] || 0) + 1 : 0;
    var n = Q['rev_streak_' + rev] || 0, fat = SW.fatigue(Q, rev);
    var income = SW.baseIncome(Q) + R.yield(Q);
    var interest = SW.interestDue(Q), cost = P.cost(Q) + SW.upkeep(Q);
    R.apply(Q, fat, n);
    if (Q.budget_pri === 'relief' && pri !== 'relief') { Q.rim_hardship += 2; Q.rim_relation -= 4; SW.react(Q, 'Relief for the Rim is cut after a year of help: hardship rises and the Rim feels betrayed.'); }
    P.apply(Q);
    var net = SW.round1(income - cost - interest);
    Q.treasury += net;
    Q.bd_borrowed = 0;
    if (Q.treasury < 0) { Q.bd_borrowed = SW.round1(-Q.treasury); Q.debt += -Q.treasury; Q.treasury = 0; SW.react(Q, 'The Banking Clan lends the shortfall of ' + Q.bd_borrowed + '.'); }
    Q.budget_rev = rev; Q.budget_pri = pri;
    Q.bd_income = SW.round1(income); Q.bd_cost = cost; Q.bd_interest = interest; Q.bd_net = net;
    Q.bd_summary = 'Income ' + SW.round1(income) + ' · spending ' + SW.round1(cost) + ' (upkeep ' + SW.upkeep(Q) + ') · interest ' + interest + ' · ' + (net >= 0 ? 'surplus ' + net : 'deficit ' + (-net));
    Q.bd_rev_name = R.name;
    Q.bd_pri_name = P.name;
    Q.budgets = (Q.budgets || 0) + 1;
    SW.econStrings(Q);
  };
  SW.econStrings = function (Q) {
    Q.treasury_txt = SW.round1(Q.treasury); Q.debt_txt = SW.round1(Q.debt || 0);
    Q.debt_label = SW.debtLabel(Q.debt || 0); Q.trade_label = SW.tradeLabel(Q.trade || 60);
  };
  SW.debtLabel = function (d) { return d < 8 ? 'light' : (d < 16 ? 'manageable' : (d < 25 ? '<span class="warn">heavy</span>' : (d < 35 ? '<b class="bad">crushing</b>' : '<b class="bad">owned by the Banking Clan</b>'))); };
  SW.tradeLabel = function (t) { return t >= 70 ? '<span class="good">thriving</span>' : (t >= 55 ? 'steady' : (t >= 40 ? '<span class="warn">disrupted</span>' : '<b class="bad">strangled</b>')); };
  SW.marketLabel = function (p) { return p < 30 ? 'steady' : (p < 50 ? 'tight' : (p < 65 ? '<span class="warn">scarce</span>' : '<b class="bad">in crisis</b>')); };

  // every turn: trade drifts toward what the galaxy allows; markets move; empty treasuries borrow
  SW.economyTick = function (Q, f) {
    var tTarget = 60 + (Q.rim_enfranchised ? 5 : 0) + (Q.federal_compact ? 10 : 0) - Q.guild_embargo * 3 - (Q.rim_hardship > 45 ? 5 : 0) - (Q.war ? 5 : 0);
    Q.trade = (Q.trade || 60) + (tTarget - (Q.trade || 60)) * 0.1 * f;
    Q.rim_hardship += f * Math.max(0, 50 - Q.trade) / 60;
    Q.bacta += f * (Q.war ? 4.5 + Math.max(0, -Q.war_balance) * 0.5 : -2);
    Q.tibanna += f * ((Q.war ? 4.5 : 0) + (Q.judicial_forces > 5 ? 1 : 0) - 1);
    Q.spice += f * ((Q.rim_hardship - 38) / 14 + (Q.corruption - 62) / 30 - (Q.spice_legal ? 1.5 : 0));
    if (Q.debt > 28) { Q.faith -= 0.06 * f; Q.corporate_sep += 0.1 * f; }
    if (Q.treasury < 0) { Q.debt += -Q.treasury; Q.treasury = 0; }
    SW.guildTick(Q, f);
    // a debased credit: prices rise, the Rim suffers first, Core savers lose faith
    Q.inflation = Math.max(0, (Q.inflation || 0) - 2 * f);
    if (Q.inflation > 25) { var inf = Q.inflation - 25; Q.rim_hardship += f * inf / 40; Q.faith -= f * inf / 300; Q.patrons_goodwill -= f * inf / 50; }
    // Core patrons drift back toward their usual generosity
    var pg = Q.patrons_goodwill === undefined ? 60 : Q.patrons_goodwill;
    Q.patrons_goodwill = pg + (pg < 60 ? Math.min(0.5 * f, 60 - pg) : -Math.min(0.5 * f, pg - 60));
    if (Q.patrons_goodwill < 30) Q.core_rc -= 0.1 * f;
  };

  SW.clampAll = function (Q) {
    var bounded = {
      grand_plan: [0, 100], emergency_powers: [0, 10], evidence: [0, 12], jedi_suspicion: [0, 10],
      senate_resolve: [0, 10], corruption: [0, 100], faith: [0, 100], fear: [0, 100], rim_hardship: [0, 100],
      guild_embargo: [0, 10], outer_sep: [0, 100], midrim_sep: [0, 100], corporate_sep: [0, 100],
      war_balance: [-10, 10], war_weariness: [0, 100], anakin_fall: [0, 10], dooku_doubt: [0, 10],
      jedi_strength: [0, 10], jedi_standing: [0, 100], jedi_relation: [0, 100], judicial_forces: [0, 10],
      member_forces: [0, 10], clones: [0, 10], navy_loyalty: [0, 100], droid_armies: [0, 12],
      coalition_dissent: [0, 10], capital: [-5, 40], treasury: [-10, 30], leverage: [0, 60], bureau_relation: [0, 100], bureau_dossier: [0, 6], guild_patience: [0, 100], patrons_goodwill: [0, 100], inflation: [0, 100], trade: [0, 100], bacta: [0, 100], tibanna: [0, 100], spice: [0, 100], debt: [0, 80]
    };
    for (var k in bounded) Q[k] = SW.clamp(Q[k], bounded[k][0], bounded[k][1]);
    for (var gi = 0; gi < SW.REGIONS.length; gi++) Q['grievance_' + SW.REGIONS[gi]] = SW.clamp(Q['grievance_' + SW.REGIONS[gi]] || 0, 0, 12);
    var rels = SW.BLOCS;
    for (var i = 0; i < rels.length; i++) {
      if (rels[i] === 'rc') continue;
      Q[rels[i] + '_relation'] = SW.clamp(Q[rels[i] + '_relation'], 0, 100);
    }
    Q.sep_total = Math.round((Q.outer_sep * 27 + Q.midrim_sep * 22 + Q.corporate_sep * 16) / 65);
  };

  // ------------------------------------------------------------------ forces
  // ------------------------------------------------------------------ Anakin
  // Anakin falls unless something holds him: his mother saved, a reformed Order, or friends who warned him
  // (the Jedi kept out of command, a warning about Palpatine that was heard, and action on slavery, all three).
  SW.anakinAnchor = function (Q) {
    if (Q.shmi_freed) return 'mother';
    if (Q.jedi_reformed || Q.new_jedi_order) return 'order';
    var slavery = (Q.slavery_campaign || 0) > 0 || Q.slavery_report || Q.slavery_abolished;
    if (!Q.jedi_generals && Q.anakin_warned && slavery) return 'friends';
    return '';
  };
  SW.ANCHOR_NAMES = {mother: 'His mother, free', order: 'A reformed Order', friends: 'Friends who warned him', '': 'Nothing'};
  // Without an anchor, the dark side rises under him: his slide cannot go below a line that climbs from month 96 to 8 by month 168.
  SW.anakinFloor = function (Q) {
    if (SW.anakinAnchor(Q)) return 0;
    return SW.clamp((Q.date - 96) / 9, 0, 8);
  };
  SW.anakinTick = function (Q) {
    Q.anakin_anchor = SW.anakinAnchor(Q);
    Q.anakin_anchor_name = SW.ANCHOR_NAMES[Q.anakin_anchor];
    var fl = (Q.anakin_found && !Q.anakin_fallen) ? SW.anakinFloor(Q) : 0;
    Q.anakin_floor = Math.round(fl * 10) / 10;
    if (Q.anakin_fall < fl) Q.anakin_fall = fl;
  };

  SW.forces = function (Q) {
    var chips = Q.chips_removed ? 1 : 0;
    var ours = Q.rc_chancellor ? 1 : 0;
    var his = (Q.pal_chancellor || Q.puppet_chancellor) ? 1 : 0;
    var oversight = Q.army_oversight || ours;
    var anakinGood = Q.anakin_found && Q.anakin_fall <= 4 && !Q.anakin_fallen;
    var anakinBad = Q.anakin_found && (Q.anakin_fall >= 8 || Q.anakin_fallen);
    var rep = {
      jedi: Q.jedi_strength * (0.5 + Q.jedi_standing / 200) * (Q.order66 ? 0.15 : 1),
      judicials: Q.judicial_forces,
      members: Q.member_forces * (Q.pact_formed ? 1 : 0.5),
      guard: (Q.senate_guard_reformed || ours) ? 2 : (his ? (Q.hunt_mapped ? 1 : 0) : 1),
      clones: Q.clones * ((Q.senate_command || Q.officer_oath) ? (chips ? 0.9 : 0.4) : (chips ? (oversight ? 0.8 : 0.6) : (oversight ? 0.15 : 0.05) + (Q.clone_trust || 0) * 0.02)),
      navy: Q.clones > 0 ? Q.navy_loyalty / 100 * 4 : 0,
      anakin: anakinGood ? 3 : 0,
      corporate: Q.corporate_forces || 0,
      hawks: Q.hawks_fleets || 0
    };
    var sith = {
      clones: Q.clones * ((Q.senate_command || Q.officer_oath) ? (chips ? 0.1 : 0.6) : (chips ? (oversight ? 0.2 : 0.4) : (oversight ? 0.85 : 0.95))),
      guard: (Q.senate_guard_reformed || ours) ? 0 : (his ? (Q.hunt_mapped ? 1 : 2) : 0.5),
      navy: Q.clones > 0 ? (1 - Q.navy_loyalty / 100) * 4 : 0,
      governors: (Q.governors && his) ? 2 : 0,
      sith: 3 + (anakinBad ? 3 : 0),
      security_bloc: ((Q.sec_r || 0) / 10 + (Q.sec_folded ? 1.5 : 0)) * (Q.sec_folded ? 1 : (Q.sec_wing === 'human_first' ? 1.5 : (Q.sec_wing === 'const_hawks' ? 0.3 : 1))),
      militias: Q.militias ? 2 : 0,
      black_sun: SW.blackSun(Q),
      secret_army: (Q.kamino_army && Q.clones === 0 && !Q.army_oversight && Q.date >= 132) ? 4 : 0
    };
    var r = 0, s = 0, k;
    for (k in rep) r += rep[k];
    for (k in sith) s += sith[k];
    return {rep: SW.round1(r), sith: SW.round1(s), ratio: s > 0 ? Math.round(100 * r / s) / 100 : 9, repParts: rep, sithParts: sith};
  };

  // Which cards still have something meaningful to offer (fallback options don't count).
  SW.cardAvailability = function (Q) {
    var c = {};
    c.rim = (Q.rim_hardship > 15) || (!Q.slavery_abolished && Q.slavery_campaign < 2) || Q.outer_sep > 12 || (Q.dooku_movement && Q.outer_sep > 20);
    c.jedi = Q.jedi_relation < 85 || (Q.date >= 18 && Q.jedi_suspicion < 9 && !Q.sidious_known) || Q.jedi_standing < 85 ||
      ((Q.date >= 108 || Q.war) && Q.jedi_reform < 3 && !Q.jedi_reformed) || (Q.anakin_found && Q.date >= 20 && Q.anakin_fall > 0.5);
    // the Order's institutional reforms belong to the Jedi Affairs committee
    c.jediaffairs = ((Q.date >= 108 || Q.war) && Q.jedi_reform < 3 && !Q.jedi_reformed) || (Q.jedi_reform >= 3 && !Q.jedi_reformed) ||
      (Q.jedi_reformed && Q.anakin_light && !Q.new_jedi_order) || !Q.jedi_independence || (Q.jedi_independence && !Q.jedi_service_act) ||
      (Q.jedi_service_act && !Q.jedi_compact);
    c.media = Q.corruption > 20 || Q.faith < 85 || (!Q.rc_chancellor && Q.senate_resolve < 10);
    c.investigate = !Q.sidious_known && !Q.sidious_defeated && (Q.evidence < 11.5 || (Q.archive_gap_known && !Q.kamino_known) || (Q.sith_stage === 3 && SW.openSuspects(Q).length > 0));
    c.hunt = Q.sith_named && !Q.sidious_defeated && !Q.sidious_fled && !Q.finale;
    c.confront = !Q.rc_chancellor && !Q.rc_in_govt && Q.senate_resolve < 9.5;
    c.pact = !Q.pact_formed || Q.member_forces < 8;
    c.peace = !Q.federal_compact && !Q.peace_achieved && !Q.recognized_cis;
    c.civil = Q.faith < 85 || Q.free_press < 3 || (Q.clones > 0 && Q.clone_trust < 8);
    c.finance = (Q.corruption > 25 && Q.guild_relation > 5) || (!Q.tf_broken_up && (Q.gunray_convicted || Q.evidence >= 4 || Q.naboo_free)) ||
      !Q.banking_audit || (!Q.banking_independent && Q.date >= 120) || Q.treasury < 6 ||
      ((Q.guild_regulations || 0) >= 1 && !Q.anti_cartel) || (Q.banking_independent && !Q.republic_bonds) || true; // cutting regulation is always on offer
    var pork = SW.porkOk(Q);
    c.judiciary = (Q.bureau_relation < 70 && Q.bureau_reform_timer <= 0) || Q.corruption > 20 || !Q.anti_corruption || Q.intel_runs < 3 || (Q.gunray_stage >= 1 && Q.gunray_stage <= 4 && !Q.gunray_convicted) ||
      (Q.evidence >= 7 && !Q.warrant) || (Q.bureau_reviewed && !Q.bureau_reformed) || (Q.bureau_reformed && !Q.amedda_arrested && !Q.sidious_defeated) ||
      (Q.anti_corruption && !Q.integrity_office) || !Q.hhc_investigated || (Q.pirates_crushed && !Q.syndicates_broken && !Q.hutt_deal) ||
      (Q.integrity_office && !Q.senators_expelled) || ((Q.intel_runs || 0) >= 1 && !Q.intel_oversight) || (Q.intel_oversight && !Q.compor) || pork;
    c.security = Q.judicial_forces < 8 || (!Q.army_oversight && (Q.clones > 0 || Q.kamino_known)) || !Q.senate_guard_reformed ||
      (Q.clones > 0 && Q.navy_loyalty < 90) || Q.security_audits < 3 || (Q.army_oversight && !Q.senate_command) ||
      (!Q.pirates_crushed && !Q.hutt_deal) || !Q.officer_corps || (Q.senate_guard_reformed && !Q.judicial_charter) || pork || Q.judicial_forces >= 1;
    c.rimaffairs = Q.rim_hardship > 15 || !Q.slavery_report || (Q.slavery_report && !Q.slavery_abolished) || !Q.rim_enfranchised || !Q.rim_relief_act ||
      (Q.rim_enfranchised && !Q.rim_assembly) || (Q.slavery_abolished && !Q.slavery_enforced) || !Q.sentience_rights || pork;
    c.constitution = !Q.emergency_sunset || !Q.term_limits_protected || !Q.constructive_vonc || !Q.rim_enfranchised ||
      (Q.emergency_sunset && !Q.powers_review) || (Q.constructive_vonc && !Q.independent_speaker);
    c.clones = !Q.chips_found || (Q.chips_found && !Q.chips_removed) || (Q.clones > 0 && !Q.clone_citizenship) || Q.clones > 6;
    for (var k in c) Q['cardok_' + k] = c[k] ? 1 : 0;
  };

  // ------------------------------------------------------------------ every visit
  // Names and phrases for Palpatine that follow whether he (or his bloc) actually holds the Chancellery.
  SW.palStrings = function (Q) {
    var bloc = Q.chancellor_bloc === 'pal';
    Q.pal_name = bloc ? 'Chancellor\'s Bloc' : 'Chommell Circle';
    Q.pal_title = Q.chancellor === 'Palpatine' ? 'Chancellor Palpatine' : 'Senator Palpatine';
    Q.pal_office = bloc ? 'the Chancellery' : 'Palpatine\'s office';
    Q.pal_people = bloc ? 'the Chancellor\'s people' : 'Palpatine\'s people';
    // who stands for Palpatine's bloc when he cannot: his Vice Chair, or, once Amedda has fallen, his aide
    Q.pal_standin_title = (Q.amedda_arrested || Q.amedda_removed) ? 'Palpatine\'s aide <b>Sate Pestage</b>' : 'Vice Chair <b>Mas Amedda</b>';
    Q.pal_cand_title = Q.pal_can_run === 0 ? SW.palStandin(Q) : Q.pal_title;
  };
  SW.palStandin = function (Q) { return (Q.amedda_arrested || Q.amedda_removed) ? 'Sate Pestage' : 'Mas Amedda'; };

  SW.everyVisit = function (Q) {
    SW.scaleChanges(Q);
    SW.normCaucus(Q);
    if (Q.bureau_relation >= 35) Q.bureau_warn_cold = 0;
    if (Q.bureau_relation >= 20 && (Q.bureau_dossier || 0) < 2) Q.bureau_warn_hostile = 0;
    SW.computeSupport(Q);
    SW.recomputeGovt(Q);
    SW.syncSupporters(Q);
    SW.syncMinisters(Q);
    Q.decree_mode = 0;
    SW.chancellery(Q);
    Q.war_shadows_ready = SW.shadowsReady(Q) ? 1 : 0;
    SW.palStrings(Q);
    SW.econStrings(Q);
    SW.leaderMomentCheck(Q);
    var rcn = SW.reformCount(Q);
    if (rcn > (Q.momentum_reforms_seen || 0)) SW.momentum(Q, 0.3 * (rcn - (Q.momentum_reforms_seen || 0)), 'a reform passed');
    Q.momentum_reforms_seen = rcn;
    SW.pledgeTick(Q);
    Q.election_season = (!Q.finale && !Q.election_suspended && Q.next_election_date > Q.date && Q.next_election_date - Q.date <= 12) ? 1 : 0;
    SW.trailCheck(Q);
    SW.worldElectionCheck(Q);
    SW.referendumCheck(Q);
    SW.recallCheck(Q);
    SW.updateSithStage(Q); Q.sith_alarm_word = SW.alarmWord(Q);
    var groundwork = (Q.warrant ? 1 : 0) + (Q.chair_judiciary === 'rc' ? 1 : 0) + (Q.dooku_turned ? 1 : 0) + ((Q.evidence_public || 0) >= 2 ? 1 : 0) + (Q.case_briefed ? 1 : 0);
    Q.case_ready = (((Q.evidence >= 9 && groundwork >= 1) || (Q.evidence >= 8.5 && groundwork >= 2)) && Q.sith_named && !Q.sidious_known && !Q.finale && !Q.game_ending && !(Q.case_timer > 0) && Q.date >= 60 && !Q.sidious_defeated) ? 1 : 0;
    Q.mandate_ok = (Q.rc_chancellor && Q.mandate_term !== Q.elections_held && !Q.election_due && !Q.election_suspended && Q.next_election_date - Q.date > 12) ? 1 : 0;
    SW.cardAvailability(Q);
    SW.grievances(Q);
    SW.leaderPressure(Q);
    SW.congressCheck(Q);
    SW.caucusCongressCheck(Q);
    SW.wingState(Q);
    // a Republic made whole gives no cause for more than two emergency powers without a war; a disarmed Republic keeps no clone army
    if ((Q.road_rimward || 0) >= 3 && !Q.war && Q.emergency_powers > 2) Q.emergency_powers = 2;
    if (Q.disarm_date >= 0) Q.clones = Q.date >= Q.disarm_date + 12 ? 0 : Math.min(Q.clones || 0, Q.disarm_cap || 0);
    Q.road_inst_ok = SW.instReforms(Q) >= 2 ? 1 : 0;
    Q.road_lead = SW.rcLead(Q) || '';
    Q.road_card_ok = (Q.road_lead && (Q['road_' + Q.road_lead] || 0) < 3 && !Q.finale && !Q.game_ending) ? 1 : 0;
    Q.road_satine_ok = (Q.satine_friend || Q.rfc_kind === 'neutralists' || (SW.wingActive && SW.wingActive(Q, 'neutralists') && (Q.dooku_movement || Q.war))) ? 1 : 0;
    Q.road_accord_ok = ((Q.geonosis_seen && !Q.war) || Q.chan_ceasefire) ? 1 : 0;
    Q.road_strike_ok = (Q.sith_named || (Q.pal_chancellor && Q.emergency_powers >= 6)) && !Q.sidious_defeated && !Q.cha_arrest_done ? 1 : 0;
    // our wings' mood, for A Divided Caucus
    var cwAngry = SW.FACTIONS.filter(function (f) { return SW.factionActive(Q, f) && (Q['rad_' + f] || 0) >= 35; }).sort(function (a, b) { return Q['rad_' + b] - Q['rad_' + a]; });
    Q.cw_furious = cwAngry.some(function (f) { return Q['rad_' + f] >= 65; }) ? 1 : 0;
    Q.cw_divided = cwAngry.length ? cwAngry.map(function (f) {
      var g = SW.caucusGrievance(Q, f), w = Q['rad_' + f] >= 80 ? 'on the brink' : (Q['rad_' + f] >= 65 ? 'furious' : 'restless');
      return 'The ' + SW.factionSpan(f) + (f === 'rimward' ? ' is ' : ' are ') + w + (g ? ' ' + g : '') + '.';
    }).join(' ') + ' Left alone, the angriest may walk out after our next congress.' : 'The Caucus is at peace with itself, for now.';
    Q.chan_peace_ok = SW.chanPeaceOk(Q) ? 1 : 0;
    Q.rc_lead_name = SW.rcLead(Q) ? SW.FACTION_NAMES[SW.rcLead(Q)] : '';
    // a Jedi Order remade around him: Anakin will not fall. Without anything to hold him, the dark side rises under him.
    if (Q.new_jedi_order) Q.anakin_fall = 0;
    // laws that hold whatever else happens: no guild embargo after the break-up, no Jedi generals under the Service Act
    if (Q.tf_broken_up) Q.guild_embargo = 0;
    if (Q.jedi_service_act) Q.jedi_generals = 0;
    // an Act suspended for the war comes back into force when the war ends
    if (Q.jedi_service_suspended && !Q.war) { Q.jedi_service_suspended = 0; Q.jedi_service_act = 1; Q.jedi_generals = 0; }
    SW.anakinTick(Q);
    Q.rim_radical_word = SW.RADICAL_WORDS[Q.rim_radical || 0] || '';
    var fb = SW.forces(Q);
    Q.force_rep = fb.rep; Q.force_sith = fb.sith; Q.force_ratio = fb.ratio;
    SW.trackLevels(Q);
    var ws = SW.warStrength(Q);
    Q.war_rep = SW.round1(ws.rep); Q.war_cis = SW.round1(ws.cis); Q.war_ratio = Math.round(ws.ratio * 100) / 100;
    Q.war_state = Q.war ? SW.warStateWord(Q) : '';
    Q.rim_addressed = Math.round(SW.rimAddressed(Q) * 100);
    Q.unease = Math.floor(Q.grand_plan / 20);
    for (var pb = 0; pb < SW.BLOCS.length; pb++) Q['parties_has_' + SW.BLOCS[pb]] = Q.parties.indexOf(SW.BLOCS[pb]) >= 0 ? 1 : 0;
    Q.pal_display = SW.name(Q, 'pal');
    Q.chancellor_color = SW.color(Q.chancellor_bloc);
    // display helpers
    Q.capital_label = Q.capital;
    Q.faith_r = Math.round(Q.faith);
    Q.corruption_r = Math.round(Q.corruption);
    Q.fear_r = Math.round(Q.fear);
    Q.hardship_r = Math.round(Q.rim_hardship);
    Q.sep_total_r = Math.round(Q.sep_total);
    Q.war_weariness_r = Math.round(Q.war_weariness);
    Q.clones_r = Math.round(Q.clones);
    Q.jedi_strength_r = Math.round(Q.jedi_strength);
    Q.evidence_r = Math.round(Q.evidence);
  };

  // ------------------------------------------------------------------ turn advance
  SW.advanceTurn = function (Q, engine) {
    SW.advanceCalendar(Q);
    // how long Palpatine (or his puppet) has held the Chancellery: the longer, the deeper his grip on the state
    if (Q.pal_chancellor || Q.puppet_chancellor) Q.pal_office_months = (Q.pal_office_months || 0) + (Q.months_per_turn > 0 ? Q.months_per_turn : 0);
    for (var i = 0; i < Q.timers.length; i++) {
      var key = Q.timers[i] + '_timer';
      if (Q[key] > 0) Q[key] -= 1;
    }
    // relations with other blocs fade back toward their natural attitude unless tended
    // leaders' memories of the Caucus fade
    var rf0 = Q.months_per_turn > 0 ? Q.months_per_turn / 3 : 0.1;
    for (var lg in SW.LEADER_START) {
      Q[lg + '_favour'] = Math.max(0, (Q[lg + '_favour'] || 0) - 0.25 * rf0);
      Q[lg + '_grudge'] = Math.max(0, (Q[lg + '_grudge'] || 0) - 0.25 * rf0);
    }
    var REL_BASE = {mod: 42, pal: 38, guild: 22, rim: 32, sec: 28, ind: 40, cis: 12, rfc: 40};
    var rf = Q.months_per_turn > 0 ? Q.months_per_turn / 3 : 0.1;
    for (var rb in REL_BASE) {
      var lb = SW.leader(Q, rb).relBase;
      var base = lb !== undefined ? lb : REL_BASE[rb];
      Q[rb + '_relation'] += (base - Q[rb + '_relation']) * 0.07 * rf;
    }
    SW.relTick(Q, rf);
    SW.wingTick(Q, rf);
    SW.wingEffects(Q, rf);
    SW.programmeTick(Q, rf);
    SW.bureauTick(Q);
    SW.schemeTick(Q);
    Q.assassination_roll = Math.random();
    var leanOn = (Q.govt_blocs || []).filter(function (b) { return b !== 'rc'; }).concat(Q.minority_support || []);
    if (Q.rc_in_govt && (leanOn.length || SW.isCaucusMinority(Q))) {
      var strain = 0.12;
      for (var gb = 0; gb < leanOn.length; gb++) strain += 0.25 * (SW.firm(Q, leanOn[gb]) - 0.5);
      // a minority with nobody it can count on
      if (SW.isCaucusMinority(Q) && !(Q.minority_support || []).length) strain += 0.2;
      Q.coalition_dissent += Math.max(0.04, strain);
    }
    SW.drift(Q);
    SW.secession(Q);
    SW.threatsTurn(Q);
    SW.ministryTurn(Q);
    SW.chancelleryTurn(Q);
    if (Q.months_per_turn > 0 || !Q.finale) {
      SW.computeSupport(Q);
      var rec = {t: Q.date};
      for (var p = 0; p < Q.parties.length; p++) rec[Q.parties[p]] = Q[Q.parties[p] + '_votes'];
      if (!Q.support_records) Q.support_records = [];
      Q.support_records.push(rec);
      if (Q.support_records.length > 200) Q.support_records.shift();
    }
    if (engine && engine.state && engine.state.currentHands && Q.clear_hand) {
      engine.state.currentHands.main = [];
      engine.state.currentHands.main_story = [];
      Q.clear_hand = 0;
    }
  };

  SW.ADVISOR_FACTION = {
    antilles: 'inst', organa: 'inst', bel_iblis: 'hawk', farr: 'rimward', mothma: 'pacifist',
    amidala: 'inst', valorum: 'inst', chuchi: 'rimward'
  };
  SW.ADVISOR_NAMES = {
    antilles: 'Bail Antilles', organa: 'Bail Organa', bel_iblis: 'Garm Bel Iblis', farr: 'Onaconda Farr',
    mothma: 'Mon Mothma', amidala: 'Padmé Amidala', valorum: 'Finis Valorum', chuchi: 'Riyo Chuchi'
  };
  SW.advisorsOfFaction = function (Q, f) {
    var n = 0;
    for (var a in SW.ADVISOR_FACTION) if (Q['adv_' + a] && SW.ADVISOR_FACTION[a] === f) n++;
    return n;
  };
  SW.countAdvisors = function (Q) {
    var n = 0;
    for (var a in SW.ADVISOR_FACTION) if (Q['adv_' + a]) n++;
    Q.n_advisors = n;
    return n;
  };

  // ================================================================== the Separatist threat, reforms in steps,
  // guild money with strings, and blocs that bleed

  // ------------------------------------------------------------------ reform tracks
  // A track is a series of decisions, each a bigger and more lasting change. Its level is read from the
  // flags those decisions set, so the existing reforms keep working as the first steps of their tracks.
  // Each committee's reform paths. committee: the committee whose card passes it ('' = across the committees).
  SW.TRACKS = {
    guilds: {name: 'The guilds', committee: 'finance', steps: ['Regulating the trade guilds', 'Anti-Cartel Legislation', 'Breaking up the Trade Federation'],
      level: function (Q) { return Q.tf_broken_up ? 3 : (Q.anti_cartel ? 2 : ((Q.guild_regulations || 0) >= 1 ? 1 : 0)); }},
    banks: {name: 'The banks', committee: 'finance', steps: ['An audit of the Banking Clan', 'The Banking Clan\'s independence', 'Republic bonds'],
      level: function (Q) { return Q.republic_bonds ? 3 : (Q.banking_independent ? 2 : (Q.banking_audit ? 1 : 0)); }},
    corruption: {name: 'Corruption', committee: 'judiciary', steps: ['The ethics law', 'The Office of Public Integrity', 'Expelling corrupt senators'],
      level: function (Q) { return Q.senators_expelled ? 3 : (Q.integrity_office ? 2 : (Q.anti_corruption ? 1 : 0)); }},
    bureau: {name: 'The bureaucracy', committee: 'judiciary', steps: ['A civil service review', 'The Civil Service Act'],
      level: function (Q) { return Q.bureau_reformed ? 2 : (Q.bureau_reviewed ? 1 : 0); }},
    intelligence: {name: 'Intelligence', committee: 'judiciary', steps: ['An intelligence review', 'The Intelligence Oversight Act', 'The Commission for the Protection of the Republic'],
      level: function (Q) { return Q.compor ? 3 : (Q.intel_oversight ? 2 : ((Q.intel_runs || 0) >= 1 ? 1 : 0)); }},
    military: {name: 'Command of the army', committee: 'security', steps: ['Senate oversight of the army', 'The Senate Command Act'],
      level: function (Q) { return Q.senate_command ? 2 : (Q.army_oversight ? 1 : 0); }},
    guard: {name: 'The Senate\'s guard', committee: 'security', steps: ['The Senate Guard returned to the Senate', 'The Judicial Forces Charter'],
      level: function (Q) { return Q.judicial_charter ? 2 : (Q.senate_guard_reformed ? 1 : 0); }},
    syndicates: {name: 'The syndicates', committee: 'security', steps: ['Patrol fleets in the Rim', 'The campaign against the pirate fleets', 'Breaking the syndicates'],
      level: function (Q) { return Q.syndicates_broken ? 3 : (Q.pirates_crushed ? 2 : (Q.patrol_fleets ? 1 : 0)); }},
    rim: {name: 'The Rim', committee: 'rimaffairs', steps: ['The Rim Relief Act', 'Rim enfranchisement', 'The Rim Assembly'],
      level: function (Q) { return Q.rim_assembly ? 3 : (Q.rim_enfranchised ? 2 : (Q.rim_relief_act ? 1 : 0)); }},
    slavery: {name: 'Slavery', committee: 'rimaffairs', steps: ['A Senate report on slavery', 'Abolition', 'Enforcing abolition'],
      level: function (Q) { return Q.slavery_enforced ? 3 : (Q.slavery_abolished ? 2 : (Q.slavery_report ? 1 : 0)); }},
    powers: {name: 'Emergency powers', committee: 'constitution', steps: ['Sunset clauses', 'The Powers Review Act'],
      level: function (Q) { return Q.powers_review ? 2 : (Q.emergency_sunset ? 1 : 0); }},
    office: {name: 'The office of Chancellor', committee: 'constitution', steps: ['Term limits entrenched', 'A constructive vote of no confidence', 'An independent Speaker'],
      level: function (Q) { return (Q.term_limits_protected ? 1 : 0) + (Q.constructive_vonc ? 1 : 0) + (Q.independent_speaker ? 1 : 0); },
      // its first two steps can pass in either order: name the latest one actually passed
      label: function (Q) { return Q.independent_speaker ? 'An independent Speaker' : (Q.constructive_vonc ? 'A constructive vote of no confidence' : 'Term limits entrenched'); }},
    jedi: {name: 'The Order\'s future', committee: 'jedi', steps: ['A campaign for reform', 'The Council accepts attachment', 'A New Jedi Order'],
      level: function (Q) { return Q.new_jedi_order ? 3 : (Q.jedi_reformed ? 2 : ((Q.jedi_reform || 0) >= 3 ? 1 : 0)); }},
    jedi_independence: {name: 'The Order\'s independence', committee: 'jedi', steps: ['The Jedi Independence Amendment', 'The Jedi Service Act', 'A Senate–Jedi Compact'],
      level: function (Q) { return Q.jedi_compact ? 3 : (Q.jedi_service_act ? 2 : (Q.jedi_independence ? 1 : 0)); }},
    hhc: {name: 'High Human Culture', committee: '', steps: ['The Rights of Sentience', 'A diverse officer corps', 'Human-first groups investigated', 'High Human Culture discredited'],
      level: function (Q) { return Q.hhc_discredited ? 4 : ((Q.sentience_rights ? 1 : 0) + (Q.officer_corps ? 1 : 0) + (Q.hhc_investigated ? 1 : 0)); }}
  };
  SW.trackSteps = function (Q, ids) {
    var n = 0;
    for (var i = 0; i < ids.length; i++) n += SW.TRACKS[ids[i]].level(Q);
    return n;
  };
  SW.trackLevels = function (Q) {
    var tot = 0;
    for (var id in SW.TRACKS) { var l = SW.TRACKS[id].level(Q); Q['track_' + id] = l; tot += l; }
    Q.track_total = tot;
    return tot;
  };

  // ------------------------------------------------------------------ the Separatists grow every year
  SW.SEP_GROWTH = 1;          // momentum gained in a year in which nothing is done for the Rim
  SW.SEP_PUSH = 0.1;          // separatism added per quarter for each point of momentum
  SW.PAL_REGION = {core: 1.4, colonies: 1.3, midrim: 0.8, outer: 0.5, corporate: 0.6};
  // How far the Caucus has addressed the Rim's grievances (0 = not at all, 1 = fully).
  SW.rimAddressed = function (Q) {
    if (Q.rim_assembly) return 1;
    var a = SW.TRACKS.rim.level(Q) * 0.2 + SW.TRACKS.slavery.level(Q) * 0.08 + SW.TRACKS.syndicates.level(Q) * 0.08 +
      (Q.anti_corruption ? 0.05 : 0) + (Q.budget_pri === 'relief' ? 0.05 : 0) + (Q.federal_compact ? 0.3 : 0) +
      Math.min(Q.rim_relief || 0, 3) * 0.07 + Math.min(Q.slavery_campaign || 0, 2) * 0.04 + SW.clamp(((Q.rim_relation || 30) - 40) / 200, -0.05, 0.15);
    return SW.clamp(a, 0, 1);
  };
  SW.separatistYear = function (Q) {
    var a = SW.rimAddressed(Q);
    Q.rim_addressed = Math.round(a * 100);
    if (Q.date < 24 || Q.federal_compact || Q.peace_achieved || Q.war_won || Q.recognized_cis || SW.off('sepgrow')) { Q.sep_growing = 0; return; }
    Q.sep_momentum = (Q.sep_momentum || 0) + SW.SEP_GROWTH * (1 - a) * (Q.rim_charter ? 0.5 : 1);
    if (a >= 0.6) Q.sep_momentum *= 0.85;
    if (Q.war) Q.droid_armies += 0.5 * (1 - a);
    Q.sep_growing = a < 0.6 ? 1 : 0;
  };

  // ------------------------------------------------------------------ the war: strength, worlds lost and won
  SW.warStrength = function (Q) {
    var rep = Q.clones * 0.6 + Q.judicial_forces * 0.25 + Q.member_forces * 0.2 + Q.jedi_strength * 0.25 + (Q.navy_loyalty - 50) / 50 +
      (Q.hutt_deal ? 0.6 : 0) + (Q.senate_command ? 0.3 : 0) + (Q.new_jedi_order ? 0.3 : 0);
    var cis = Q.droid_armies + (Q.guild_embargo * 0.2);
    return {rep: rep, cis: cis, ratio: cis > 0 ? Math.max(0, rep) / cis : 2};
  };
  // Whose side the Sith Lord's hand is on: he holds the droid armies back while he rules the Republic.
  SW.sidiousHand = function (Q) {
    if (Q.sidious_fled) return 'confederacy';
    if (Q.sidious_defeated || Q.sidious_gone) return 'none';
    if (Q.pal_chancellor || Q.puppet_chancellor) return 'republic';
    return 'presses';
  };
  // How the war stands, all things counted: the front, the two sides' strength and the worlds already lost.
  // Positive: the Republic is winning. Negative: the Confederacy is.
  SW.warScore = function (Q) {
    if (!Q.war) return 9;
    var ws = SW.warStrength(Q);
    return Q.war_balance + (Math.min(1.5, ws.ratio) - 1) * 6 - (Q.worlds_lost || 0) * 0.5;
  };
  // How the war stands, in a word, for the Forces tab.
  SW.warStateWord = function (Q) {
    var sc = SW.warScore(Q);
    return sc >= SW.SITH_SCORE + 1 ? 'won' : (sc > SW.FALL_SCORE ? 'balance' : 'lost');
  };
  // Loyalist worlds on each front, from the edge of the war toward the Core, and the region whose delegations they hold.
  SW.LOYAL_WORLDS = {
    outer: [['Christophsis', 'outer'], ['Ryloth', 'outer'], ['Saleucami', 'outer'], ['Felucia', 'outer'], ['Mygeeto', 'outer']],
    mid: [['Rodia', 'midrim'], ['Malastare', 'midrim'], ['Bothawui', 'midrim'], ['Kashyyyk', 'midrim'], ['Naboo', 'midrim']],
    core: [['Anaxes', 'core'], ['Ord Mantell', 'colonies'], ['Kuat', 'core'], ['Corellia', 'core'], ['Alderaan', 'core']]
  };
  SW.FRONT_DEPTH = {outer: 0, mid: 0.5, core: 1};
  SW.BREAKTHROUGH = 1.2;      // chance of a breakthrough each quarter, per point the Confederacy's strength exceeds ours (as a share)
  SW.recountSecession = function (Q) {
    var tot = 0, base = 0;
    for (var j = 0; j < SW.REGIONS.length; j++) {
      var r = SW.REGIONS[j];
      Q[r] = SW.BASE_WEIGHTS[r] * (1 - (Q[r + '_seceded'] || 0));
      tot += SW.BASE_WEIGHTS[r] * (Q[r + '_seceded'] || 0); base += SW.BASE_WEIGHTS[r];
    }
    Q.seceded_total = Math.round(100 * tot / base);
  };
  // Each quarter of war (and each day of the finale), a stronger Confederacy may break through somewhere.
  SW.warWorldsTick = function (Q, f) {
    if (!Q.war || Q.world_fall_ready || Q.world_lib_ready || Q.game_ending || SW.off('worlds')) return;
    var ws = SW.warStrength(Q);
    var weak = null, wv = 99;
    for (var i = 0; i < SW.FRONTS.length; i++) {
      var fr = SW.FRONTS[i], v = SW.front(Q, fr);
      if ((Q['lost_' + fr] || 0) < 5 && v < wv) { wv = v; weak = fr; }
    }
    var p = 0;
    if (ws.ratio < 1) p += (1 - ws.ratio) * SW.BREAKTHROUGH;
    if (wv <= -3) p += Math.min(0.3, (-wv - 2) * 0.06);
    p = Math.min(0.6, p) * f;
    if (weak && p > 0 && SW.rnd() < p) { Q.world_fall_ready = 1; Q.world_fall_front = weak; return; }
    // liberation: when we are clearly stronger, a front that is advancing retakes its last lost world
    if (ws.ratio >= 1.1) {
      for (var k = 0; k < SW.FRONTS.length; k++) {
        var fl = SW.FRONTS[k];
        if ((Q['lost_' + fl] || 0) > 0 && SW.front(Q, fl) >= 2 && SW.rnd() < 0.35 * f) { Q.world_lib_ready = 1; Q.world_lib_front = fl; return; }
      }
    }
  };
  SW.worldFalls = function (Q) {
    var fr = Q.world_fall_front, k = Q['lost_' + fr] || 0, w = SW.LOYAL_WORLDS[fr][Math.min(4, k)], d = SW.FRONT_DEPTH[fr];
    Q['lost_' + fr] = k + 1;
    Q.fear += 3 + 5 * d; Q.faith -= 1 + 2 * d; Q.jedi_standing -= 2 + 2 * d;
    SW.pushFront(Q, fr, -1); Q.war_balance -= 0.3;
    var r = w[1];
    Q[r + '_seceded'] = Math.min(0.9, (Q[r + '_seceded'] || 0) + 0.03);
    SW.recountSecession(Q);
    Q.world_fall_name = w[0]; Q.world_fall_region = SW.REGION_NAMES[r]; Q.world_fall_front_name = SW.FRONT_NAMES[fr];
    Q.worlds_lost = (Q.worlds_lost || 0) + 1;
    Q.worlds_lost_list = SW.lostWorldsList(Q);
    if (fr === 'core' && Q.lost_core >= 5) Q.coruscant_falls = 1;
    Q.world_fall_ready = 0;
    SW.computeSupport(Q);
  };
  SW.worldLiberated = function (Q) {
    var fr = Q.world_lib_front, k = (Q['lost_' + fr] || 1) - 1, w = SW.LOYAL_WORLDS[fr][Math.max(0, k)], d = SW.FRONT_DEPTH[fr];
    Q['lost_' + fr] = Math.max(0, k);
    Q.fear -= 2 + 2 * d; Q.faith += 1 + d; Q.jedi_standing += 1;
    SW.pushFront(Q, fr, 0.5); Q.war_balance += 0.3;
    var r = w[1];
    Q[r + '_seceded'] = Math.max(0, (Q[r + '_seceded'] || 0) - 0.03);
    SW.recountSecession(Q);
    Q.world_lib_name = w[0]; Q.world_lib_front_name = SW.FRONT_NAMES[fr];
    Q.worlds_liberated = (Q.worlds_liberated || 0) + 1;
    Q.worlds_lost_list = SW.lostWorldsList(Q);
    Q.world_lib_ready = 0;
    SW.computeSupport(Q);
  };
  SW.lostWorldsList = function (Q) {
    var out = [];
    for (var i = 0; i < SW.FRONTS.length; i++) {
      var fr = SW.FRONTS[i];
      for (var k = 0; k < (Q['lost_' + fr] || 0) && k < 5; k++) out.push(SW.LOYAL_WORLDS[fr][k][0]);
    }
    return out.join(', ');
  };

  // ------------------------------------------------------------------ one bloc absorbed by another
  // The bloc's worlds go over to the bloc that absorbs it. If that bloc is not in the Senate (the Separatists
  // after Geonosis), its delegations leave the Republic instead.
  SW.mergeBloc = function (Q, from, into) {
    var seated = Q.parties.indexOf(into) >= 0;
    var lost = 0;
    for (var i = 0; i < SW.REGIONS.length; i++) {
      var r = SW.REGIONS[i], v = Q[r + '_' + from] || 0;
      if (seated) Q[r + '_' + into] = (Q[r + '_' + into] || 0) + v;
      else {
        var tot = 0;
        for (var p = 0; p < Q.parties.length; p++) tot += Q[r + '_' + Q.parties[p]] || 0;
        var sd = Q[r + '_seceded'] || 0, add = (1 - sd) * (tot > 0 ? v / tot : 0);
        Q[r + '_seceded'] = Math.min(0.9, sd + add);
        lost += add * SW.BASE_WEIGHTS[r];
      }
      Q[r + '_' + from] = 0.3;
    }
    Q.parties = Q.parties.filter(function (b) { return b !== from; });
    Q['merged_' + from] = into;
    Q['parties_has_' + from] = 0;
    var vacated = false;
    for (var c = 0; c < SW.COMMITTEES.length; c++) if (Q['chair_' + SW.COMMITTEES[c]] === from) { Q['chair_' + SW.COMMITTEES[c]] = ''; vacated = true; }
    if (Q.chancellor_bloc === from) {
      if (seated && into !== 'cis') Q.chancellor_bloc = into;
      else { Q.election_due = 1; Q.govt_fell_now = 1; Q.fall_reason = 'defection'; }
    }
    if ((Q.govt_blocs || []).indexOf(from) >= 0) {
      Q.govt_blocs = Q.govt_blocs.filter(function (b) { return b !== from; });
      if (seated && into !== 'cis' && Q.chancellor_bloc === into && Q.govt_blocs.indexOf(into) < 0) Q.govt_blocs.push(into);
      if (Q.rc_in_govt) Q.coalition_dissent += 1;
    }
    if (Q.walkout_bloc === from) Q.walkout_bloc = '';
    if (Q.strain_bloc === from) Q.strain_bloc = '';
    if (vacated && (Q.govt_blocs || []).length) SW.assignChairs(Q);
    if (lost > 0) {
      SW.recountSecession(Q);
      Q.secession_recent = (Q.secession_recent || 0) + lost / 10;
      if (Q.war) Q.droid_armies += lost / 12;
    }
    SW.senateSession(Q);
  };

  // Our own Rimward wing goes over to the Separatists (or, after Geonosis, leaves the Senate with them).
  SW.wingDefects = function (Q) {
    var share = SW.clamp((Q.rimward_strength || 0) / 100 * 0.5, 0.04, 0.4);
    var seated = Q.parties.indexOf('cis') >= 0;
    for (var i = 0; i < SW.REGIONS.length; i++) {
      var r = SW.REGIONS[i];
      var k = (r === 'outer' || r === 'midrim') ? share * 1.4 : share * 0.6;
      var mv = Q[r + '_rc'] * Math.min(0.8, k);
      if (seated) Q[r + '_cis'] += mv;
      else {
        var tot = 0;
        for (var p = 0; p < Q.parties.length; p++) tot += Q[r + '_' + Q.parties[p]] || 0;
        var sd = Q[r + '_seceded'] || 0;
        Q[r + '_seceded'] = Math.min(0.9, sd + (1 - sd) * (tot > 0 ? mv / tot : 0));
      }
      Q[r + '_rc'] -= mv;
    }
    SW.recountSecession(Q);
    Q.split_share_total = (Q.split_share_total || 0) + share;
    Q.rimward_split = 1; Q.rimward_defected = 1;
    Q.rimward_strength *= 0.25; Q.rad_rimward = 20;
    Q.adv_farr = 0; Q.adv_chuchi = 0;
    SW.countAdvisors(Q);
    SW.normCaucus(Q);
    SW.senateSession(Q);
  };

  // ------------------------------------------------------------------ threats of defection
  // A warning gives the Caucus a few turns. The threat passes only through the normal channels: better relations
  // (for our own wing, a calmer wing), a reform step on the tracks that matter to them, or a rival we backed
  // winning their next leadership challenge. Otherwise it happens.
  SW.THREAT_TURNS = 4;
  SW.maxRimSep = function (Q) { return Math.max(Q.outer_sep || 0, Q.midrim_sep || 0); };
  SW.THREATS = {
    rim: {group: 'rim', kind: 'bloc', into: 'cis', tracks: ['rim', 'slavery', 'syndicates'], hard: ['ardana'],
      start: function (Q) {
        if (Q.parties.indexOf('rim') < 0 || !Q.dooku_movement || Q.rim_defected) return false;
        if (Q.rim_leader_id === 'ardana') return SW.maxRimSep(Q) >= 40 || (Q.rim_radical || 0) >= 3;
        return SW.maxRimSep(Q) >= 55 && Q.rim_relation < 25 && SW.rel(Q, 'rim', 'cis') >= 40;
      }},
    rfc: {group: 'rfc', kind: 'bloc', into: 'cis', tracks: ['rim', 'slavery', 'syndicates'], hard: ['tandeth', 'corvane'],
      start: function (Q) {
        return Q.parties.indexOf('rfc') >= 0 && Q.rfc_kind === 'rimward' && Q.dooku_movement && !Q.rfc_defected &&
          ['tandeth', 'corvane'].indexOf(Q.rfc_leader_id) >= 0 && (SW.maxRimSep(Q) >= 45 || (Q.rim_radical || 0) >= 3);
      }},
    rimward: {group: 'rimward', kind: 'faction', into: 'cis', tracks: ['rim', 'slavery', 'syndicates'], hard: ['corvane'],
      start: function (Q) {
        return !Q.rimward_split && Q.dooku_movement && Q.rimward_leader_id === 'corvane' &&
          ((Q.rim_radical || 0) >= 3 || (Q.rad_rimward >= 35 && SW.maxRimSep(Q) >= 50));
      }},
    sec: {group: 'sec', kind: 'bloc', into: 'pal', tracks: ['military'], hard: ['tarkin'],
      start: function (Q) {
        return Q.parties.indexOf('sec') >= 0 && !Q.sec_folded && Q.sec_leader_id === 'tarkin' && Q.sec_relation < 25 &&
          Q.parties.indexOf('pal') >= 0 && !Q.pal_disgraced && !Q.sidious_defeated &&
          (Q.pal_chancellor || Q.puppet_chancellor || Q.fear >= 45 || Q.grand_plan >= 50);
      }}
  };
  SW.threatOnGroup = function (Q, g) {
    for (var id in SW.THREATS) if (SW.THREATS[id].group === g && Q[id + '_threat']) return id;
    return '';
  };
  SW.threatTick = function (Q) {
    if (Q.finale || Q.game_ending || !(Q.months_per_turn > 0) || SW.off('threats')) return;
    for (var id in SW.THREATS) {
      var T = SW.THREATS[id];
      if (Q[id + '_threat']) {
        var gone = T.kind === 'bloc' ? Q.parties.indexOf(T.group) < 0 : Q.rimward_split;
        if (gone) { Q[id + '_threat'] = 0; continue; }
        if (Q.time >= Q[id + '_threat_until'] && !Q.threat_due_ready) { Q.threat_due_ready = 1; Q.threat_due_id = id; }
        continue;
      }
      if (Q.threat_warn_ready || Q[id + '_done'] || (Q[id + '_threat_cool'] || 0) > Q.time) continue;
      if (T.start(Q)) { Q.threat_warn_ready = 1; Q.threat_warn_id = id; }
    }
  };
  SW.threatBegin = function (Q) {
    var id = Q.threat_warn_id, T = SW.THREATS[id];
    Q.threat_warn_ready = 0;
    if (!T) return;
    Q[id + '_threat'] = 1;
    Q[id + '_threat_until'] = Q.time + SW.THREAT_TURNS;
    Q[id + '_threat_steps'] = SW.trackSteps(Q, T.tracks);
    Q[id + '_threat_dissent'] = Q.rad_rimward || 0;
    Q[id + '_threat_rival'] = 0;
    // a crisis brings the next leadership challenge forward
    if (T.kind === 'bloc') SW.callCongress(Q, T.group, 'crisis'); else Q.faction_leader_timer = 0;
    Q.threat_id = id;
    Q.threat_group_name = T.kind === 'bloc' ? SW.name(Q, T.group) : 'our Rimward wing';
    Q.threat_leader = T.kind === 'bloc' ? (Q[T.group + '_leader'] || SW.leader(Q, T.group).name || '') : (SW.leader(Q, 'rimward').name || '');
    Q[id + '_threat_leader_name'] = Q.threat_leader;
    Q.threats_seen = (Q.threats_seen || 0) + 1;
  };
  // Called at the deadline. Returns '' if the threat comes to pass, or how it was averted.
  SW.threatAverted = function (Q, id) {
    var T = SW.THREATS[id];
    if (Q[id + '_threat_rival']) return 'leader';
    var hard = id === 'rim' && SW.wingRules(Q, 'rim', 'radicals');
    if (SW.trackSteps(Q, T.tracks) > (Q[id + '_threat_steps'] || 0) + (hard ? 1 : 0)) return 'reform';
    if (T.kind === 'bloc' && (Q[T.group + '_relation'] || 0) >= (hard ? 55 : 40)) return 'relations';
    if (T.kind === 'faction' && ((Q.rad_rimward || 0) <= (Q[id + '_threat_dissent'] || 0) - 12 || (Q.rad_rimward || 0) < 30)) return 'relations';
    if (!T.start(Q)) return 'cooled';
    return '';
  };
  SW.threatResolve = function (Q) {
    var id = Q.threat_due_id, T = SW.THREATS[id];
    Q.threat_due_ready = 0;
    if (!T) return;
    Q.threat_id = id;
    Q.threat_group_name = T.kind === 'bloc' ? SW.name(Q, T.group) : 'our Rimward wing';
    Q.threat_leader = T.kind === 'bloc' ? (Q[T.group + '_leader'] || SW.leader(Q, T.group).name || '') : (SW.leader(Q, 'rimward').name || '');
    Q.threat_old_leader = Q[id + '_threat_leader_name'] || Q.threat_leader;
    var how = SW.threatAverted(Q, id);
    Q[id + '_threat'] = 0;
    Q.threat_how = how;
    Q.threat_averted = how ? 1 : 0;
    if (how) { Q[id + '_threat_cool'] = Q.time + 10; Q.threats_averted = (Q.threats_averted || 0) + 1; return; }
    Q[id + '_done'] = 1;
    Q.threats_happened = (Q.threats_happened || 0) + 1;
    Q.threat_left_senate = Q.parties.indexOf('cis') < 0 && id !== 'sec' ? 1 : 0;
    if (id === 'rim') { SW.mergeBloc(Q, 'rim', 'cis'); Q.rim_defected = 1; Q.fear += 3; }
    else if (id === 'rfc') { SW.mergeBloc(Q, 'rfc', 'cis'); Q.rfc_defected = 1; Q.fear += 2; }
    else if (id === 'rimward') { SW.wingDefects(Q); Q.fear += 2; }
    else if (id === 'sec') { SW.mergeBloc(Q, 'sec', 'pal'); Q.sec_folded = 1; Q.navy_loyalty -= 6; Q.grand_plan += 3; }
  };

  // ------------------------------------------------------------------ blocs that bleed
  // Over the years the Core Moderates and the Independents lose their natural support, to the Caucus or to Palpatine
  // (the Independents also to the Separatists and the Rimward Coalition); the Security Bloc bleeds to Palpatine.
  SW.BLEED = 0.5;             // share of their natural size the Moderates and Independents have lost by 19 BBY
  SW.bleedFrac = function (Q) { return SW.BLEED * SW.clamp((Q.date || 0) / 168, 0, 1); };
  SW.bleedShare = function (Q) {
    return SW.clamp(0.55 + ((Q.mod_relation || 45) - 45) / 100 + 0.06 * SW.clamp(Q.rc_momentum || 0, -5, 5) + 0.06 * Math.min(3, Q.evidence_public || 0) +
      0.02 * Math.min(10, SW.reformCount(Q)) - (Q.pal_chancellor ? 0.08 : 0) - Math.max(0, Q.corruption - 70) / 300 - Math.max(0, Q.fear - 40) / 300, 0.2, 0.8);
  };
  // Where the support the Moderates and Independents lose in a region goes.
  SW.bleedExtra = function (Q, rg, bleed, share, cisIn, rimIn) {
    var S0 = START_SUPPORT[rg], extra = {rc: 0, pal: 0, rim: 0, cis: 0};
    var lostMod = S0.mod * bleed, lostInd = S0.ind * bleed;
    extra.rc += lostMod * share; extra.pal += lostMod * (1 - share);
    var sepR = (rg === 'outer' || rg === 'midrim' || rg === 'corporate') ? (Q[rg + '_sep'] || 0) : 0;
    var wCis = cisIn ? 0.35 * Math.min(1, sepR / 60) : 0;
    var wRim = rimIn && (rg === 'outer' || rg === 'midrim') ? 0.3 * Math.min(1, Q.rim_hardship / 50) : 0;
    var wRP = Math.max(0.3, 1 - wCis - wRim);
    extra.rc += lostInd * wRP * share; extra.pal += lostInd * wRP * (1 - share);
    extra.rim += lostInd * wRim; extra.cis += lostInd * wCis;
    return extra;
  };
  // The shares of Palpatine's bloc made up of centrists who drifted to him, and of Security Bloc hawks he
  // absorbed or subverted. Once he is unmasked they vote by their own lights again.
  SW.palBorrowed = function (Q) {
    if (SW.off('bleed')) return {centre: 0, hawks: 0};
    var bleed = SW.bleedFrac(Q), share = SW.bleedShare(Q), got = 0, hawks = 0, all = 0;
    for (var j = 0; j < SW.REGIONS.length; j++) {
      var rg = SW.REGIONS[j], w = Q[rg] || 0, S0 = START_SUPPORT[rg];
      got += w * SW.bleedExtra(Q, rg, bleed, share, false, false).pal;
      // (the Security Bloc's natural size, swollen by fear and war, as in the drift)
      var secSize = S0.sec * Math.max(0.2, 1 + (Q.fear - 20) / 25 + (Q.war ? 0.3 : 0));
      hawks += w * secSize * ((Q.merged_sec === 'pal' ? 0.8 : 0) + (Q.pal_was_chancellor ? 0.08 : 0));
      all += w * (Q[rg + '_pal'] || 0);
    }
    if (all <= 0) return {centre: 0, hawks: 0};
    var c = SW.clamp(got / all, 0, 0.6), h = SW.clamp(hawks / all, 0, 0.6 - c);
    return {centre: c, hawks: h};
  };
  SW.secSubversion = function (Q) {
    if (Q.sidious_defeated || Q.pal_disgraced) return 0;
    return SW.clamp(((Q.pal_chancellor || Q.puppet_chancellor) ? 0.08 : 0) + Math.max(0, Q.fear - 45) / 250 + (Q.grand_plan || 0) / 800, 0, 0.2);
  };

  // ------------------------------------------------------------------ High Human Culture, pirates, Sidious's flight
  SW.hhcPush = function (Q) { return Q.hhc_discredited ? 0 : Math.min(0.2, (Q.hhc_heat || 0) * 0.03); };
  SW.HHC_KINDS = ['core', 'senate', 'military'];
  SW.hhcEvent = function (Q) {
    Q.core_pal += 0.4; Q.colonies_pal += 0.3;
    Q.sep_momentum = (Q.sep_momentum || 0) + 0.15;
    Q.hhc_heat = (Q.hhc_heat || 0) + 1 + (SW.wingRules(Q, 'mod', 'old_families') ? 0.5 : 0);
    Q.hhc_events = (Q.hhc_events || 0) + 1;
    if (Q.hhc_kind === 'military') Q.navy_loyalty -= 1;
    if (Q.hhc_kind === 'core') Q.fear += 1;
    if (Q.hhc_kind === 'senate') Q.pal_relation += 2;
    Q.hhc_ready = 0;
    SW.computeSupport(Q);
  };
  // ------------------------------------------------------------------ the Rim radicalises
  // Before Dooku's declaration, stories from the Rim show where hardship and corruption are driving it. Each is told once.
  SW.RIM_STORIES = {
    ordmantell: {cause: 'hardship', region: 'midrim', heading: 'Bread Lines on Ord Mantell'},
    kessel: {cause: 'hardship', region: 'outer', heading: 'The Kessel Mines Go Quiet'},
    rodia: {cause: 'hardship', region: 'midrim', heading: 'Fever Season on Rodia'},
    ryloth: {cause: 'hardship', region: 'outer', heading: 'The Ryloth Convoy'},
    vote: {cause: 'corruption', region: 'outer', heading: 'A Vote for Sale'},
    customs: {cause: 'corruption', region: 'midrim', heading: 'The Hydian Way Customs Scandal'},
    relief: {cause: 'corruption', region: 'outer', heading: 'Relief That Never Came'},
    census: {cause: 'corruption', region: 'midrim', heading: 'The Census Fraud'}
  };
  // The story for whichever driver is further over its line (relative to the line); '' if none is left to tell.
  SW.pickRimStory = function (Q) {
    var h = (Q.rim_hardship - SW.SEP_HARDSHIP_LINE) / SW.SEP_HARDSHIP_LINE, c = (Q.corruption - SW.SEP_CORRUPTION_LINE) / SW.SEP_CORRUPTION_LINE;
    var causes = [];
    if (h > 0) causes.push(['hardship', h]);
    if (c > 0) causes.push(['corruption', c]);
    causes.sort(function (a, b) { return b[1] - a[1]; });
    for (var i = 0; i < causes.length; i++) {
      for (var id in SW.RIM_STORIES) if (SW.RIM_STORIES[id].cause === causes[i][0] && !Q['rim_story_done_' + id]) return id;
    }
    return '';
  };
  SW.rimStoryTick = function (Q) {
    if (Q.dooku_movement || Q.finale || Q.game_ending || Q.date < 24 || !(Q.months_per_turn > 0) || SW.off('rimradical')) return;
    if (!Q.rim_story_next) Q.rim_story_next = Q.time + 3;
    if (Q.time < Q.rim_story_next || Q.rim_story_ready) return;
    var id = SW.pickRimStory(Q);
    if (!id) return;
    var S = SW.RIM_STORIES[id];
    Q.rim_story_ready = 1; Q.rim_story = id; Q.rim_story_heading = S.heading; Q.rim_story_region = S.region; Q.rim_story_cause = S.cause;
    Q['rim_story_done_' + id] = 1;
    Q.rim_story_next = Q.time + 3 + Math.floor(SW.rnd() * 3);
  };
  SW.rimStoryEvent = function (Q) {
    var r = Q.rim_story_region || 'outer', other = r === 'outer' ? 'midrim' : 'outer';
    Q[r + '_sep'] += 3; Q[other + '_sep'] += 1;
    Q.rim_stories = (Q.rim_stories || 0) + 1;
    Q.rim_story_ready = 0;
  };

  // The Rim's politicians radicalise: every year from month 60 in which the Caucus has neither tackled slavery nor
  // enfranchised the Rim, our Rimward wing and the Rimward Coalition move a step closer to Dooku (0 to 3).
  SW.RADICAL_WORDS = ['', 'Losing patience with the Caucus', 'Led by radicals', 'Looking for a way out'];
  SW.RADICAL_HEADINGS = ['', 'The Rim Loses Patience', 'The Radicals Take Over', 'The Rim Looks for a Way Out'];
  SW.rimTackled = function (Q) {
    return !!(Q.slavery_report || Q.slavery_abolished || (Q.slavery_campaign || 0) >= 1 || Q.rim_enfranchised);
  };
  SW.rimRadicalGroups = function (Q) {
    return {
      wing: !Q.rimward_split && !Q.rimward_defected,
      coalition: Q.parties.indexOf('rim') >= 0,
      rfc: Q.parties.indexOf('rfc') >= 0 && Q.rfc_kind === 'rimward'
    };
  };
  SW.rimRadicalYear = function (Q) {
    if (Q.date < 60 || Q.finale || Q.game_ending || SW.off('rimradical')) return;
    var g = SW.rimRadicalGroups(Q);
    if (!g.wing && !g.coalition && !g.rfc) return;
    if (SW.rimTackled(Q)) { if ((Q.rim_radical || 0) > 0) Q.rim_radical -= 1; return; }
    if ((Q.rim_radical || 0) >= 3) return;
    Q.rim_radical = (Q.rim_radical || 0) + 1;
    Q.rim_radical_ready = 1;
  };
  SW.rimRadicalEvent = function (Q) {
    var lv = Q.rim_radical || 0, g = SW.rimRadicalGroups(Q);
    Q.rim_radical_ready = 0; Q.rr_level = lv; Q.rr_heading = SW.RADICAL_HEADINGS[Math.min(3, lv)] || '';
    Q.rr_wing = g.wing ? 1 : 0; Q.rr_coalition = g.coalition ? 1 : 0; Q.rr_rfc = g.rfc ? 1 : 0;
    Q.rr_corvane_new = 0; Q.rr_ardana_new = 0; Q.rr_tandeth_new = 0;
    if (lv === 1) {
      if (g.wing) Q.rad_rimward += 8;
      if (g.coalition) Q.rim_relation -= 6;
      if (g.rfc) Q.rfc_relation -= 6;
    } else if (lv === 2) {
      if (g.wing) { if (Q.rimward_leader_id !== 'corvane') { SW.setLeader(Q, 'rimward', 'corvane'); Q.rr_corvane_new = 1; } Q.rad_rimward += 6; }
      if (g.coalition) { if (Q.rim_leader_id !== 'ardana') { SW.setLeader(Q, 'rim', 'ardana'); Q.rr_ardana_new = 1; } Q.rim_relation -= 4; }
      if (g.rfc) { if (['tandeth', 'corvane'].indexOf(Q.rfc_leader_id) < 0) { SW.setLeader(Q, 'rfc', 'tandeth'); Q.rr_tandeth_new = 1; } Q.rfc_relation -= 4; }
    } else if (lv >= 3) {
      if (g.wing) Q.rad_rimward += 6;
      if (g.coalition) Q.rim_relation -= 4;
      if (g.rfc) Q.rfc_relation -= 4;
    }
    SW.normCaucus(Q);
  };
  SW.PIRATE_ROUTES = ['the Corellian Run', 'the Hydian Way', 'the Perlemian Trade Route', 'the Rimma Trade Route', 'the Triellus Trade Route'];
  SW.PIRATE_GANGS = ['Weequay raiders', 'Nikto corsairs', 'a Hutt-backed pirate fleet', 'Black Sun privateers', 'Zygerrian slavers'];
  SW.pirateRaid = function (Q) {
    var cb = Q.chancellor_bloc;
    var regs = ['outer', 'midrim', 'colonies'];
    for (var i = 0; i < regs.length; i++) {
      if (cb && Q[regs[i] + '_' + cb] !== undefined) Q[regs[i] + '_' + cb] *= 0.975;
      if (Q.parties.indexOf('sec') >= 0) Q[regs[i] + '_sec'] += 0.4;
    }
    Q.trade = (Q.trade || 0) - 3;
    Q.rim_hardship += 1;
    Q.pirate_raids = (Q.pirate_raids || 0) + 1;
    Q.pirates_ready = 0;
    SW.computeSupport(Q);
  };
  // the Republic's treaty with the Hutt clans: fast lanes to the Rim, and the syndicates beyond the law's reach
  // does the government want the deal? Palpatine's always does; others only when the war is going badly
  SW.huttGovWants = function (Q) { return Q.chancellor_bloc === 'pal' || SW.warStrength(Q).ratio < 0.8 ? 1 : 0; };
  SW.huttDeal = function (Q, forced) {
    Q.hutt_deal = 1; Q.hutt_deal_forced = forced ? 1 : 0;
    Q.corruption += forced ? 2 : 8; Q.trade = (Q.trade || 0) + 8;
    SW.pushFront(Q, 'outer', 3);
    Q.rim_hardship -= 2;
  };
  // Black Sun's enforcers on Coruscant, for hire to a Sith Lord, for as long as the syndicates stand
  SW.blackSun = function (Q) {
    if (!Q.finale || Q.syndicates_broken || Q.sidious_fled || Q.hunt_frozen || SW.off('blacksun')) return 0;
    return Math.max(0.4, 1 - 0.3 * SW.TRACKS.syndicates.level(Q));
  };
  SW.FLEE_SCORE = 0;          // a cornered Sith Lord escapes to the Confederacy when the war stands below this
  SW.SITH_SCORE = 1;          // with Sidious at its head, the Confederacy wins unless the war stands at least this well
  SW.FALL_SCORE = -2;         // with Sidious gone, the Republic still falls if the war stands this badly
  // Beaten on Coruscant, does he get away to a Confederacy that is winning its war?
  SW.sidiousEscapes = function (Q) {
    if (!Q.war || Q.sidious_gone || Q.sidious_fled || Q.hunt_routes || SW.off('flee')) return false;
    if (SW.warScore(Q) >= SW.FLEE_SCORE) return false;
    SW.sidiousFlees(Q); Q.sidious_escaped = 1;
    return true;
  };
  SW.sidiousFlees = function (Q) {
    Q.sidious_fled = 1; Q.sidious_flee_ready = 0;
    Q.pal_disgraced = 1;
    for (var i = 0; i < SW.REGIONS.length; i++) Q[SW.REGIONS[i] + '_pal'] *= 0.7;
    Q.droid_armies += 1.5; Q.fear += 5;
    if (Q.finale) Q.finale_day = 13;
    SW.computeSupport(Q);
  };

  // ------------------------------------------------------------------ the search for the Sith
  // The Caucus does not know who the Sith Lord is. What it knows moves through stages, each needing the one before:
  // 0 rumours, 1 a Sith presence, 2 a hidden hand behind the crises, 3 close to power (a shortlist of suspects),
  // 4 a name. Evidence is the weight of proof; the stage is what the Caucus knows. The search never goes backwards.
  SW.STAGE_NAMES = ['Rumours', 'A Sith presence', 'A hidden hand', 'Close to power', 'A name'];
  SW.SUSPECT_IDS = ['amedda', 'pestage', 'free_taa', 'dod'];
  SW.SUSPECTS = {
    amedda: {name: 'Mas Amedda', role: 'the Vice Chair of the Senate',
      finding: 'He rigs the Senate\'s agenda for money, and he takes orders. He gives none.'},
    pestage: {name: 'Sate Pestage', role: 'a fixer in the Senate\'s back offices',
      finding: 'He sells appointments to anyone who can pay. His calendar shows meetings with someone he calls only "the client".'},
    free_taa: {name: 'Orn Free Taa', role: 'the Senator of Ryloth',
      finding: 'Spice money and bribes, from the bars of Coruscant to the slave pens of Ryloth, and nothing more.'},
    dod: {name: 'Lott Dod', role: 'the Trade Federation\'s senator',
      finding: 'The Damask money came to him, not from him. Someone paid the Trade Federation\'s senator for years.'}
  };
  SW.sithPresence = function (Q) { return !!(Q.sith_presence || Q.sith_told || Q.gunray_testified || Q.gunray_convicted || Q.jedi_suspicion >= 3 || Q.dooku_turned); };
  SW.sithPattern = function (Q) { return !!(Q.damask_seen || Q.gunray_testified || Q.gunray_convicted || Q.tf_probe || Q.banking_audit || Q.ff_exposed); };
  SW.sithCoruscant = function (Q) {
    return !!(Q.labyrinth_seen || Q.kamino_traced || Q.intel_runs >= 1 || Q.valorum_networks_used || Q.gunray_result === 'talked' ||
      (Q.geonosis_seen && Q.jedi_relation >= 50) || Q.jedi_suspicion >= 6);
  };
  SW.sithStage = function (Q) {
    if (Q.sith_named) return 4;
    var s = 0;
    if (SW.sithPresence(Q)) s = 1;
    if (s === 1 && Q.evidence >= 3 && SW.sithPattern(Q)) s = 2;
    if (s === 2 && Q.evidence >= 5 && SW.sithCoruscant(Q)) s = 3;
    return Math.max(s, Math.min(3, Q.sith_stage_max || 0));
  };
  SW.updateSithStage = function (Q) {
    var s = SW.sithStage(Q);
    Q.sith_stage = s; Q.sith_stage_max = Math.max(Q.sith_stage_max || 0, s);
    Q.sith_stage_name = SW.STAGE_NAMES[s];
    var open = SW.openSuspects(Q);
    Q.suspects_open = open.length;
    Q.suspects_open_text = open.map(function (id) { return SW.SUSPECTS[id].name + ', ' + SW.SUSPECTS[id].role; }).join('; ');
    return s;
  };
  SW.openSuspects = function (Q) { return SW.SUSPECT_IDS.filter(function (s) { return !Q['suspect_' + s]; }); };
  SW.nextOpenSuspect = function (Q) { return SW.openSuspects(Q)[0] || ''; };
  // A suspect is cleared: guilty of something, but not of this. how: 'look', 'review', 'arrest' or 'raid'.
  SW.clearSuspect = function (Q, s, how) {
    if (!SW.SUSPECTS[s] || Q['suspect_' + s]) return false;
    Q['suspect_' + s] = 1;
    if (s === 'free_taa') { Q.evidence += 0.2; Q.corruption -= 1; } else Q.evidence += 0.4;
    if (s === 'dod') Q.guild_relation -= 3;
    Q.suspect_last = s; Q.suspect_last_name = SW.SUSPECTS[s].name; Q.suspect_last_finding = SW.SUSPECTS[s].finding;
    // the Vice Chair's files: found by investigation, they can be leaked; an arrest is already public
    if (s === 'amedda' && how !== 'arrest' && !Q.amedda_arrested && !Q.amedda_removed) Q.amedda_files_ready = 1;
    if (!SW.openSuspects(Q).length && !Q.sith_named) Q.sith_name_ready = 1;
    Q.suspects_open = SW.openSuspects(Q).length;
    return true;
  };
  SW.nameSith = function (Q, how) {
    Q.sith_named = 1; Q.sith_named_by = how || 'elimination'; Q.sith_name_ready = 0;
    for (var i = 0; i < SW.SUSPECT_IDS.length; i++) Q['suspect_' + SW.SUSPECT_IDS[i]] = 1;
    SW.updateSithStage(Q);
  };

  // ------------------------------------------------------------------ the hunt for Darth Sidious
  // How much Sidious knows of the hunt (0-10). At 5 he brings his plans forward; at 8 he moves at once.
  SW.FINALE_DATE = 171;
  SW.raiseAlarm = function (Q, amt, atLeast) {
    Q.sith_alarm = SW.clamp(Math.max((Q.sith_alarm || 0) + (amt || 0), atLeast || 0), 0, 10);
    if (Q.sith_alarm >= 5 && !Q.sith_forward) {
      Q.sith_forward = 1; Q.grand_plan += 8; Q.scheme_timer = 0;
      Q.finale_date = Math.min(Q.finale_date || SW.FINALE_DATE, Math.max(Q.date + 12, 159));
      Q.sith_alarm_ready = 1;
    }
    if (Q.sith_alarm >= 8 && !Q.sith_moving) {
      Q.sith_moving = 1;
      Q.finale_date = Math.min(Q.finale_date || SW.FINALE_DATE, Q.date + 1);
      Q.sith_alarm_ready = 1;
    }
    Q.sith_alarm_word = SW.alarmWord(Q);
  };
  // a risky operation: raises his alarm by amt with probability p
  SW.riskAlarm = function (Q, amt, p) { if (SW.rnd() < (p === undefined ? 1 : p)) { SW.raiseAlarm(Q, amt); return 1; } return 0; };
  SW.alarmWord = function (Q) {
    var a = Q.sith_alarm || 0;
    return a >= 8 ? 'He is moving' : (a >= 5 ? 'He knows we are close' : (a >= 2 ? 'He is watchful' : 'He suspects nothing'));
  };
  // How the balance of forces weighs on an arrest: everyone who would answer to him against everyone who would answer to us.
  SW.arrestForces = function (Q) {
    var r = SW.forces(Q).ratio, sc, note = '';
    if (r >= 1) sc = 1;
    else if (r >= 0.75) sc = 0;
    else if (r >= 0.5) { sc = -1; note = 'his forces outnumbered ours'; }
    else if (r >= 0.33) { sc = -2; note = 'his forces outnumbered ours two to one'; }
    else { sc = -3; note = 'his forces outnumbered ours three to one'; }
    Q.arrest_forces_score = sc; Q.arrest_forces_note = note;
    return {score: sc, note: note, ratio: r};
  };
  // A Caucus Chancellor orders the Sith Lord's arrest. He may flee to a Confederacy at war with us, be taken,
  // or turn his forces on the arrest and force the final showdown.
  SW.chancellorArrest = function (Q) {
    Q.cha_arrest_done = 1;
    var fleeP = 0;
    if (!Q.hunt_routes && Q.war && !SW.off('flee')) fleeP = SW.clamp(0.15 + (Q.sith_alarm || 0) * 0.05 + Math.max(0, -SW.warScore(Q)) * 0.05, 0, 0.7);
    Q.cha_flee_odds = Math.round(fleeP * 100);
    if (fleeP > 0 && SW.rnd() < fleeP) {
      Q.cha_arrest_result = 'fled';
      SW.sidiousFlees(Q); Q.sidious_escaped = 1; Q.sidious_known = 1; Q.evidence_public += 4;
      return;
    }
    // the Last Days begin with the order: everyone who still answers to him, Black Sun included, is called out
    Q.finale = 1; Q.finale_day = 1; Q.months_per_turn = 0; Q.clear_hand = 1;
    var s = 1.5 + 1, miss = [];
    if (Q.warrant) s += 1; else miss.push('there was no warrant');
    if (Q.judicial_forces >= 4) s += 1; else miss.push('the Judicial Forces were too weak');
    if (Q.senate_jedi_pact || Q.jedi_relation >= 60) s += 1; else miss.push('the Jedi were not with us');
    if (Q.evidence >= 10) s += 1;
    if (Q.hunt_informant) s += 1;
    if (Q.anakin_found && Q.anakin_fall <= 4) s += 1.5;
    else if (Q.anakin_found && Q.anakin_fall >= 6.5) { s -= 2; miss.push('Anakin Skywalker had already gone over to him'); }
    var af = SW.arrestForces(Q);
    s += af.score; if (af.note) miss.push(af.note);
    if (Q.sword_strike && Q.officer_oath) s += 1;
    s -= (Q.sith_alarm || 0) * 0.3;
    if (Q.grand_plan >= 80) s -= 1;
    s += SW.rnd() * 1.5;
    Q.cha_arrest_score = Math.round(s * 10) / 10;
    Q.cha_arrest_missing = miss.length ? 'It went wrong from the start: ' + miss.join('; ') + '.' : 'Nothing was missing. He was simply ready for us.';
    Q.sidious_known = 1; Q.evidence_public += 4; Q.gambit = 1;
    if (s >= 3.5) {
      Q.cha_arrest_result = 'arrested';
      Q.gambit_kind = 'arrested'; Q.gambit_response_seen = 1; Q.gambit_resolved = 1;
      Q.sidious_defeated = 1; Q.sidious_gone = 1; Q.sidious_method = (Q.sword_strike && Q.evidence < 7) ? 'held' : 'trial'; Q.arrest_result = 'success';
      if (Q.sword_strike) Q.sword_success = 1;
      if (Q.clones >= 3 && !Q.chips_removed && SW.rnd() < SW.clamp((Q.grand_plan - 70) / 60 - (Q.army_oversight ? 0.2 : 0), 0, 0.6)) Q.contingency = 1;
    } else {
      Q.cha_arrest_result = 'resisted';
      Q.gambit_kind = 'resists'; Q.pal_reach_low = (Q.pal_office_months || 0) < 12 ? 1 : 0; Q.fear += 8;
    }
    SW.updateDate(Q);
  };

  // ------------------------------------------------------------------ the turn's checks for all of the above
  SW.threatsTurn = function (Q) {
    SW.threatTick(Q);
    if (SW.off('hutt')) Q.hutt_deal_seen = 1;
    var live = !Q.game_ending && !Q.sidious_defeated;
    // before Dooku's declaration, the Rim radicalises while hardship or corruption is over its line
    SW.rimStoryTick(Q);
    // High Human Culture shows itself every few turns until it is discredited
    if (!Q.hhc_discredited && !Q.finale && !Q.game_ending && Q.date >= 18 && Q.months_per_turn > 0 && !SW.off('hhc')) {
      if (!Q.hhc_next) Q.hhc_next = Q.time + 3;
      if (Q.time >= Q.hhc_next && !Q.hhc_ready) {
        Q.hhc_ready = 1;
        Q.hhc_kind = SW.HHC_KINDS[(Q.hhc_events || 0) % 3];
        Q.hhc_next = Q.time + 5 + Math.floor(SW.rnd() * 3);
      }
    }
    // pirates raid the trade lanes while nothing is done about them, more often as the years go by
    if (!Q.patrol_fleets && !Q.syndicates_broken && !Q.finale && !Q.game_ending && Q.date >= 12 && Q.months_per_turn > 0 && !SW.off('pirates')) {
      if (!Q.pirate_next) Q.pirate_next = Q.time + 5;
      if (Q.time >= Q.pirate_next && !Q.pirates_ready) {
        Q.pirates_ready = 1;
        Q.pirate_route = SW.PIRATE_ROUTES[Math.floor(SW.rnd() * SW.PIRATE_ROUTES.length)];
        Q.pirate_gang = SW.PIRATE_GANGS[Math.floor(SW.rnd() * SW.PIRATE_GANGS.length)];
        Q.pirate_next = Q.time + Math.max(5, 10 - Math.floor(Q.date / 30)) + Math.floor(SW.rnd() * 3);
      }
    }
    // the front gives way: a warning when the war turns against the Republic (again, if it recovers and turns once more)
    if (Q.war && !Q.game_ending) {
      var sc = SW.warScore(Q);
      if (sc < SW.FLEE_SCORE && !Q.war_turning_armed && !Q.war_turning_ready) { Q.war_turning_ready = 1; Q.war_turning_armed = 1; Q.war_turning_count = (Q.war_turning_count || 0) + 1; }
      if (sc >= 2) Q.war_turning_armed = 0;
    }
    // an exposed or escaped Sith Lord, with the Confederacy winning, goes to them
    var ws = SW.warStrength(Q);
    if (live && Q.war && !Q.sidious_fled && !Q.finale && !Q.hunt_routes && SW.warScore(Q) < SW.FLEE_SCORE && !SW.off('flee') && !Q.pal_chancellor && !Q.puppet_chancellor &&
        (Q.sidious_free || (Q.sidious_known && Q.evidence_public >= 3) || (Q.premature_accusations >= 1 && Q.evidence_public >= 3))) Q.sidious_flee_ready = 1;
    // even with Palpatine gone, admirals with a navy that answers to them may take the Republic
    if (Q.finale && Q.sidious_defeated && !Q.game_ending && !Q.admirals_coup && Q.navy_loyalty < 50 && !Q.hhc_discredited && !SW.wingRules(Q, 'sec', 'const_hawks') &&
        Q.emergency_powers > 0 && !Q.admirals_strike_ready && SW.rnd() < 0.3) Q.admirals_strike_ready = 1;
  };

  // ------------------------------------------------------------------ endings
  SW.safeguardCount = function (Q) {
    // a disbanded clone army counts as the army safeguard
    return Q.emergency_sunset + Q.term_limits_protected + ((Q.army_oversight || !Q.kamino_army) ? 1 : 0) + Q.senate_guard_reformed + Q.jedi_independence +
      Q.banking_independent + Q.rim_enfranchised + Q.anti_corruption + (Q.integrity_office ? 1 : 0) + (Q.powers_review ? 1 : 0) + (Q.senate_command ? 1 : 0);
  };
  // The Federal Compact: a Senate bill that ends (or forestalls) the war, if it survives someone's sabotage
  SW.compactSabotage = function (Q) {
    if (Q.dooku_turned) return 0;
    return SW.clamp(0.3 + Q.grand_plan / 300 - (Q.evidence >= 6 ? 0.15 : 0) - (Q.jedi_suspicion >= 6 ? 0.1 : 0) - (Q.satine_mediation ? 0.1 : 0), 0.05, 0.9);
  };
  SW.federalCompact = function (Q) {
    var st = SW.stance(Q, {mod: 0.55, guild: 0.5, rim: 0.8, sec: 0.15, ind: 0.75, pal: 0.1, cis: 0.9}, true);
    var lift = (Q.war_weariness - 25) / 120 + (Q.satine_mediation ? 0.05 : 0) + (Q.dooku_turned ? 0.1 : 0) + (Q.war && Q.war_balance < 0 ? 0.05 : 0);
    st.mod += lift + Q.rim_enfranchised * 0.1; st.ind += lift + Q.rim_enfranchised * 0.1; st.guild += lift / 2;
    if (SW.wingRules(Q, 'ind', 'neutralists')) st.ind += 0.1;
    if (SW.wingRules(Q, 'guild', 'mic')) st.guild -= 0.15;
    for (var sb in st) st[sb] = SW.clamp(st[sb], 0, 1);
    Q.fc_vote = SW.vote(Q, st, 1, 'peace');
    Q.vote_html = SW.voteBanner('The Federal Compact', Q.fc_vote);
    Q.fc_passed = Q.fc_vote >= 50 ? 1 : 0;
    Q.fc_sabotaged = 0;
    if (!Q.fc_passed) return;
    if (SW.rnd() < SW.compactSabotage(Q)) { Q.fc_sabotaged = 1; Q.peace_talks = 1; Q.fear += 6; Q.war_weariness += 3; }
    else { Q.federal_compact = 1; Q.war = 0; Q.peace_achieved = 1; Q.outer_sep -= 20; Q.midrim_sep -= 15; Q.corporate_sep -= 15; Q.fear -= 10; Q.faith += 5; }
  };
  // the odds that charges before the Senate stick: strong evidence, a warrant, the Jedi's suspicion and our own committee help
  SW.chargesOdds = function (Q) {
    var p = 0.2 + (Q.evidence - 7) * 0.2 + (Q.warrant ? 0.1 : 0) + (Q.jedi_suspicion >= 6 ? 0.1 : 0) + (Q.chair_judiciary === 'rc' ? 0.1 : 0) +
      (Q.senate_resolve >= 3 ? 0.05 : 0) - ((Q.evidence_public || 0) < 1 ? 0.1 : 0);
    if (Q.dooku_turned) p = Math.max(p, 0.9);
    return SW.clamp(p, 0.05, Q.dooku_turned ? 0.95 : 0.92);
  };
  // Palpatine's reach into the state: guards, admirals, governors and the army follow a man who has held power
  SW.palReach = function (Q) { return SW.clamp(0.85 + (Q.pal_office_months || 0) / 160, 0.85, 1); };
  SW.routeEnding = function (Q) {
    Q.cis_negotiated = 0; Q.shadow_remains = 0;
    if (Q.cis_victory) return Q.sidious_fled ? 'sith_confederacy' : 'republic_falls';
    if (Q.dissolved) return 'dissolved';
    if (Q.admirals_coup) return 'admirals';
    if (Q.civil_war_result === 'long') {
      if (Q.war && SW.warScore(Q) <= SW.FALL_SCORE && !SW.off('fall')) { Q.fell_divided = 1; return Q.sidious_fled ? 'sith_confederacy' : 'republic_falls'; }
      return 'divided';
    }
    if (Q.empire_declared && Q.civil_war_result !== 'won') return 'empire';
    if (Q.jedi_coup) return 'protectorate';
    // our Chancellor ruled by decree and kept the office's powers: we became what we fought
    if (!Q.hollow_crown && SW.hollowCrownDecrees(Q)) { Q.hollow_crown = 1; Q.hc_decrees = 1; }
    if (Q.hollow_crown) return 'hollow_crown';
    // a war still raging at the end decides the ending, unless Sidious has fallen and the front holds
    var score = SW.warScore(Q);
    if (Q.war && Q.sidious_fled) return score < SW.SITH_SCORE ? 'sith_confederacy' : 'endless_war';
    // with the Sith Lord gone, a Republic far weaker than the Confederacy still loses the war
    if (Q.war && Q.sidious_defeated && score <= SW.FALL_SCORE && !SW.off('fall')) return 'republic_falls';
    if (Q.war && !(Q.sidious_defeated && Q.war_balance >= -2)) {
      // a Confederacy far stronger than the Republic does not negotiate: it conquers
      if (Q.war_balance <= -7 || (Q.war_balance <= -4 && SW.warStrength(Q).ratio < 0.7)) return 'republic_falls';
      if (Q.war_balance <= -4) { Q.cis_negotiated = 1; return 'confederacy'; }
      return 'endless_war';
    }
    if (Q.sidious_defeated && !Q.restoration_passed && Q.emergency_powers >= 5) return 'admirals';
    if (Q.civil_war_result === 'won') return 'blood';
    if (Q.sidious_defeated && Q.restoration_passed && Q.faith >= 50 && (Q.corruption < 65 || Q.anti_corruption) &&
        Q.sidious_method === 'trial' && SW.safeguardCount(Q) >= 1) return 'reborn';
    if (Q.sidious_defeated) {
      if (Q.sword_success) return 'senate_sword';
      if (Q.charter_ratified) return 'second_reformation';
      if ((Q.road_rimward || 0) >= 3) return 'republic_whole';
      if ((Q.road_pacifist || 0) >= 3) return 'long_peace';
      return 'endures';
    }
    // the Sith Lord was never stopped: only a stripped, exposed Chancellery leaves the Republic standing
    if (Q.emergency_powers <= 2 && Q.evidence_public >= 4 && Q.term_limits_protected) { Q.shadow_remains = 1; return 'endures'; }
    return 'empire';
  };

  SW.ENDING_TITLES = {
    reborn: 'The Republic Reborn', endures: 'The Republic Endures', blood: 'Victory in Blood',
    divided: 'The Galaxy Divided', protectorate: 'The Jedi Protectorate', admirals: 'The Admirals\' Republic',
    hollow_crown: 'The Hollow Crown', confederacy: 'Confederacy Triumphant', dissolved: 'A Republic Dissolved', endless_war: 'The Endless War',
    empire: 'The Galactic Empire', sith_confederacy: 'The Sith Confederacy', republic_falls: 'The Fall of the Republic',
    second_reformation: 'The Second Reformation', republic_whole: 'The Republic Whole', long_peace: 'The Long Peace', senate_sword: 'The Senate\'s Sword'
  };

  // ------------------------------------------------------------------ charts
  SW.lineSetup = function (Q) {
    var keys = SW.BLOCS.filter(function (b) {
      var recs = Q.support_records || [];
      for (var i = 0; i < recs.length; i++) if (recs[i][b] !== undefined) return true;
      return false;
    });
    var colors = {}, names = {};
    for (var i = 0; i < SW.BLOCS.length; i++) { colors[SW.BLOCS[i]] = SW.color(SW.BLOCS[i]); names[SW.BLOCS[i]] = SW.BLOC_SHORT[SW.BLOCS[i]]; }
    return {keys: keys, colors: colors, names: names};
  };

  g.SW = SW;
  if (typeof module !== 'undefined' && module.exports) module.exports = SW;
})(typeof window !== 'undefined' ? window : globalThis);
