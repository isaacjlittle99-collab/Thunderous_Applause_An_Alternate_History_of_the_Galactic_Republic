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

  SW.COMMITTEES = ['finance', 'judiciary', 'security', 'rimaffairs'];
  SW.COMMITTEE_NAMES = {
    finance: 'Finance & Commerce', judiciary: 'Judiciary & Intelligence',
    security: 'Security & Defence', rimaffairs: 'Outer Rim Affairs'
  };
  SW.COMMITTEE_COST = {finance: 10, judiciary: 10, security: 12, rimaffairs: 5};

  // Every card / event timer named here is decremented by one each turn.
  SW.TIMERS = [
    'advisor_action', 'shuffle', 'contributions', 'campaign', 'media', 'relations', 'platform',
    'enemy', 'confront', 'pact', 'investigate', 'jedi', 'rim_outreach', 'peace', 'disunity',
    'civil', 'routine', 'leader_moment', 'bacta_crisis', 'tibanna_crisis', 'spice_crisis', 'banking_clan', 'debt_crisis', 'core_revolt', 'credits',
    'finance', 'judiciary', 'security', 'rimaffairs', 'constitution', 'diplomacy', 'clone_oversight',
    'coalition', 'shuffle_committees', 'emergency_measures',
    'corruption_scandal', 'piracy', 'famine', 'embargo', 'secession', 'profiteering', 'protest',
    'assassination', 'leak', 'unease', 'sunset', 'battle', 'gunray', 'pal_media', 'faction_crisis',
    'last_days', 'coalition_strain', 'leadership', 'faction_leader', 'bureau_reform', 'scheme',
    'trail', 'world_election', 'referendum', 'recall', 'case'
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
      guild_leader: 'Lott Dod', rim_leader: 'Ainlee Teem', sec_leader: 'Orvos Hask',
      ind_leader: 'Tamsar Vell', cis_leader: 'Count Dooku', rfc_leader: 'Onaconda Farr',
      pal_name: 'Chommell Circle',
      cis_formed: 0, rfc_formed: 0,
      govt_blocs: ['mod', 'guild', 'sec', 'ind'], coalition_name: 'Commerce Coalition',
      rc_in_govt: 0, rc_toleration: 0, coalition_dissent: 0, minority_govt: 0,
      chair_finance: 'guild', chair_judiciary: 'mod', chair_security: 'sec', chair_rimaffairs: 'ind',
      leverage: 0, election_due: 0, next_election_date: 0, elections_held: 0,
      seceded_total: 0,

      // caucus
      inst_strength: 40, rimward_strength: 25, pacifist_strength: 20, hawk_strength: 15,
      inst_dissent: 10, rimward_dissent: 10, pacifist_dissent: 5, hawk_dissent: 15,
      dissent: 0.1, dissent_percent: 10,
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
      farr_dead: 0, valorum_fallen: 0, valorum_scandal: 0,

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
    D.treasury_txt = 4; D.debt_txt = 8; D.debt_label = ''; D.trade_label = '';
    D.cm_region = 'core'; D.cm_effect = 0; D.cm_backfired = 0; D.cm_word = ''; D.cm_msg_name = ''; D.cm_region_name = ''; D.scandal_ours_until = -99; D.campaigns_run = 0;
    D.cm_word_clean = ''; D.cm_word_relief = ''; D.cm_word_security = ''; D.cm_word_peace = ''; D.cm_word_republic = '';
    D.cm_msg = ''; D.cm_disrupted = 0; D.cm_protect_won = 0; D.cm_disruptor = ''; D.cm_threat = 0; D.cm_local = 0; D.cm_force_note = 0; D.jf_txt = 0; D.el_mom_note = 0; D.el_mom_text = ''; D.force_uses = 0; D.disruptions = 0; D.protects_won = 0; D.protects_lost = 0;
    D.momentum_why = ''; D.momentum_why_sign = 0; D.momentum_reforms_seen = 0; D.election_season = 0;
    // the Chancellor race
    D.el_nominee = ''; D.el_nominees = 0; D.el_nominee_default = ''; D.el_bought_amt = 0; D.el_exposed = 0; D.el_pledges_made = 0; D.el_deal = ''; D.el_deal_chair = ''; D.el_deal_chair_name = '';
    D.el_deal_won = 0; D.el_done = 0; D.el_whip = ''; D.el_backing_name = ''; D.el_proj_share = 0; D.el_act_share = 0; D.el_proj_exact = 0; D.el_res1 = []; D.el_top = [];
    D.el_switch_note = ''; D.el_whip_note = ''; D.el_join_pledge = ''; D.el_join_price = ''; D.el_text = ''; D.el_cands = [];
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
    for (var gd = 0; gd < SW.REGIONS.length; gd++) D['grievance_' + SW.REGIONS[gd]] = 0;
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
    D.pal_title = 'Senator Palpatine'; D.pal_office = 'Palpatine\'s office'; D.pal_people = 'Palpatine\'s people'; D.chair_cap = 4; D.chair_partners = 0; D.walkout_bloc = ''; D.walkout_until = -99; D.cc_dropped = 0; D.cc_kept = 0; D.el_walkout_blocks = 0; D.walkout_name = ''; D.govt_fell_now = 0; D.fall_reason = ''; D.war_name = 'Clone Wars';
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
      Q.inst_dissent = 5; Q.hawk_dissent = 8;
    } else if (Q.difficulty > 0) {   // Jedi Master
      Q.capital = 0; Q.base_contrib = 1; Q.treasury = 3; Q.mod_relation = 44; Q.rim_relation = 28; Q.bureau_relation = 38;
      Q.guild_relation = 20; Q.sec_relation = 25; Q.ind_relation = 40;
      Q.inst_dissent = 25; Q.rimward_dissent = 30; Q.pacifist_dissent = 25; Q.hawk_dissent = 25; Q.grand_plan = 10;
    }
    SW.setGovt(Q, ['mod', 'guild', 'sec', 'ind'], 'Commerce Coalition');
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
    var D = SW.DEFAULTS();
    for (var key in D) {
      if (Q[key] === undefined || Q[key] === null || (typeof D[key] === 'number' && typeof Q[key] === 'number' && isNaN(Q[key]))) {
        Q[key] = D[key];
      }
    }
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
    if (Q.dissent < 0.08) bonus += 1;
    if (Q.dissent > 0.25) bonus -= 1;
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
  };

  // ------------------------------------------------------------------ factions
  SW.updateDissent = function (Q) {
    var total = 0, weighted = 0;
    for (var i = 0; i < SW.FACTIONS.length; i++) {
      var f = SW.FACTIONS[i];
      Q[f + '_strength'] = SW.clamp(Q[f + '_strength'], 0, 100);
      Q[f + '_dissent'] = SW.clamp(Q[f + '_dissent'], 0, 100);
      total += Q[f + '_strength'];
      weighted += Q[f + '_strength'] * Q[f + '_dissent'];
    }
    if (total <= 0) total = 1;
    // normalise strengths to 100
    for (var j = 0; j < SW.FACTIONS.length; j++) {
      var ff = SW.FACTIONS[j];
      Q[ff + '_strength'] = Math.round(1000 * Q[ff + '_strength'] / total) / 10;
    }
    Q.dissent = weighted / total / 100;
    Q.dissent_percent = Math.round(Q.dissent * 100);
  };

  SW.strongestFaction = function (Q) {
    var best = 'inst', v = -1;
    for (var i = 0; i < SW.FACTIONS.length; i++) {
      var f = SW.FACTIONS[i];
      if (Q[f + '_strength'] > v) { v = Q[f + '_strength']; best = f; }
    }
    return best;
  };

  // gain multiplier dampened by dissent
  SW.unity = function (Q) { return 1 - (Q.dissent || 0); };

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
      views: {rim: 0.05}, blurb: 'A Malastare populist. Wants the Rim\'s due, but will bargain for it.',
      rise: function (Q) { return 0.35 + 0.1 * on(Q.rim_enfranchised) + 0.15 * on(Q.rim_hardship < 45); }},
    orn_free_taa: {group: 'rim', name: 'Orn Free Taa', tag: 'dealmaker', firm: 0.2, relBase: 36,
      views: {regulate: -0.12, powers: 0.05, oversight: -0.05}, likes: {guild: 12, mod: 6}, rimGriev: -0.15, rimSep: -0.15,
      blurb: 'Ryloth\'s senator. Trades votes for favours, and the guilds pay well.',
      rise: function (Q) { return 0.15 + 0.2 * on(Q.corruption > 62) + 0.1 * on(Q.rim_relief >= 1) + 0.15 * on(Q.rim_enfranchised); }},
    ardana: {group: 'rim', name: 'Tal Ardana', tag: 'radical', firm: 0.9, relBase: 20,
      views: {rim: 0.15, regulate: 0.2, powers: -0.1, army: -0.15, peace: 0.15, vonc: 0.15},
      likes: {mod: -15, guild: -20, sec: -15, cis: 15, rfc: 10}, refuses: ['mod', 'guild', 'sec'],
      rimGriev: 0.15, rimSep: 0.2, pull: function (Q) { return Q.rim_hardship > 40 ? 0.1 : -0.05; },
      blurb: 'An Ord Mantell firebrand. No more promises from Coruscant, and no deals with the Core or the guilds.',
      rise: function (Q) {
        var lostRim = (Q.secession_where || '').indexOf('outer') >= 0 || (Q.secession_where || '').indexOf('midrim') >= 0;
        return 0.05 + Math.max(0, Q.rim_hardship - 45) / 30 + 0.2 * on(lostRim) + 0.1 * on(Q.dooku_movement) -
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
      available: function (Q) { return !Q.valorum_fallen; },
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
      blurb: 'A Colonies conservative. Wants order, and an army to keep it.',
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
      blurb: 'Speaks for the unaligned worlds. Open to any bargain that leaves them alone.',
      rise: function (Q) { return 0.35; }},
    satine: {group: 'ind', name: 'Satine Kryze', tag: 'neutralist', firm: 0.6, relBase: 42,
      views: {peace: 0.2, army: -0.15, powers: -0.1}, likes: {sec: -10, pal: -5, cis: 5},
      blurb: 'Duchess of Mandalore, voice of the Council of Neutral Systems. Peace above all.',
      available: function (Q) { return Q.dooku_movement || Q.war; },
      rise: function (Q) { return 0.15 + Q.war_weariness / 100 + 0.1 * on(Q.peace_talks >= 1) + 0.1 * on(Q.satine_friend); }},
    shale: {group: 'ind', name: 'Corwin Shale', tag: 'isolationist', firm: 0.7, relBase: 30,
      views: {army: -0.1, rim: -0.1, regulate: -0.05, peace: 0.05}, likes: {rc: -5},
      blurb: 'Wants the Republic to leave his worlds alone, and to stop asking them to pay for it.',
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
      rise: function (Q) { return 0.1 + Math.max(0, Q.rim_hardship - 40) / 30 + (Q.farr_dead ? 1 : 0); }},

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
      rise: function (Q) { return 0.05 + Math.max(0, Q.corruption - 64) / 30 + 0.1 * on(Q.emergency_powers >= 3 && !Q.emergency_sunset) + Math.max(0, Q.inst_dissent - 40) / 60; }},
    taneel: {group: 'inst', name: 'Terr Taneel', tag: 'dealmaker', firm: 0.25,
      demand: 'corruption kept from spiralling, and a seat at the table',
      blurb: 'An Emberlene veteran of a hundred committee deals. Prefers results to purity.',
      agenda: function (Q) { return Q.corruption > 70 && !Q.anti_corruption; },
      rise: function (Q) { return 0.15 + 0.2 * on(Q.rc_in_govt) + Math.max(0, 25 - Q.inst_dissent) / 60; }},

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
      rise: function (Q) { return 0.05 + Math.max(0, Q.rim_hardship - 42) / 30 + Math.max(0, Q.rimward_dissent - 40) / 60 + 0.1 * on(Q.rim_sep_high); }},
    rusk: {group: 'rimward', name: 'Hollin Rusk', tag: 'gradualist', firm: 0.25,
      demand: 'steady relief for the Rim, and a start on abolition',
      blurb: 'A Bakuran pragmatist. Half a loaf now beats a whole one never.',
      agenda: function (Q) { return (Q.rim_hardship > 50 && Q.rim_relief < 1 && !Q.rim_enfranchised) || (Q.date >= 84 && !Q.slavery_abolished && Q.slavery_campaign < 1); },
      rise: function (Q) { return 0.15 + 0.15 * on(Q.rim_relief >= 1) + 0.15 * on(Q.rim_enfranchised) + Math.max(0, 25 - Q.rimward_dissent) / 60; }},

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
      rise: function (Q) { return 0.05 + Q.war_weariness / 150 + 0.1 * on(Q.emergency_powers >= 3) + Math.max(0, Q.pacifist_dissent - 40) / 60; }},
    dask: {group: 'pacifist', name: 'Orrin Dask', tag: 'pragmatist', firm: 0.25,
      demand: 'a channel for peace, and a limit on the Chancellor\'s powers',
      blurb: 'A Corellian who accepts that a Republic may need to defend itself.',
      agenda: function (Q) { return (Q.war && Q.peace_talks < 1) || (!Q.rc_chancellor && Q.emergency_powers >= 6); },
      rise: function (Q) { return 0.15 + 0.15 * on(Q.peace_talks >= 1) + 0.1 * on(Q.fear > 40) + Math.max(0, 25 - Q.pacifist_dissent) / 60; }},

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
      rise: function (Q) { return 0.05 + Math.max(0, Q.fear - 35) / 45 + 0.15 * on(Q.war && Q.war_balance < 0) + Math.max(0, Q.hawk_dissent - 40) / 60; }},
    morn: {group: 'hawk', name: 'Talia Morn', tag: 'constitutional hawk', firm: 0.3,
      demand: 'forces under Senate command: oversight of the clone army and a Defence Pact',
      blurb: 'A Chandrilan admiral\'s daughter. A strong Republic, but a lawful one.',
      agenda: function (Q) {
        return (Q.dooku_movement && !Q.pact_formed && Q.member_forces < 3 && Q.judicial_forces < 5) ||
          (Q.clones > 0 && !Q.army_oversight) || (Q.war && Q.war_balance < -3);
      },
      rise: function (Q) { return 0.15 + 0.15 * on(Q.clones > 0 && !Q.army_oversight) + 0.1 * on(Q.senate_resolve >= 3) + Math.max(0, 25 - Q.hawk_dissent) / 60; }}
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
    teem: {motive: 'Ainlee Teem built his career on Malastare\'s grievances. He bargains because a deal that feeds his worlds beats a principle that starves them, but he never forgets a broken promise.',
      cares: [mc(function (Q) { return Q.rim_relief >= 1; }, 2, 'relief for the Rim'), mc(function (Q) { return Q.rim_enfranchised; }, 2, 'Rim seats in the Senate'),
        mc(function (Q) { return Q.rim_hardship > 45; }, -2, 'hunger on the Rim'), mc(function (Q) { return inGovt(Q, 'rim'); }, 1, 'a seat in government'),
        mc(function (Q) { return frontLosing(Q, 'outer'); }, -2, 'the sieges of the Rim')]},
    orn_free_taa: {motive: 'Ryloth is poor and its senator is not. Orn Free Taa trades votes for favours because the favours keep him rich and his rivals at home quiet. He bends to whoever pays, and digs in against anyone who looks at his accounts.',
      cares: [mc(function (Q) { return inGovt(Q, 'rim'); }, 2, 'a share of power'), mc(function (Q) { return Q.guild_relation > 35; }, 1, 'the guilds\' generosity'),
        mc(function (Q) { return Q.anti_corruption; }, -2, 'the Ethics Commission'), mc(function (Q) { return tariffsOn(Q); }, -1, 'the trade tariffs'),
        mc(function (Q) { return Q.free_ryloth; }, -2, 'arming Cham Syndulla\'s rebels')]},
    ardana: {motive: 'Tal Ardana watched Ord Mantell starve while Coruscant debated. Every compromise the Rim has made has been broken, so she makes none.',
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
    hask: {motive: 'Orvos Hask wants order, and a Republic able to keep it. He is steady rather than fierce, and grows fiercer when the lanes are unsafe.',
      cares: [mc(function (Q) { return Q.judicial_forces >= 5; }, 2, 'a stronger Judicial Force'), mc(function (Q) { return Q.pact_formed; }, 1, 'the Defence Pact'),
        mc(function (Q) { return Q.rim_hardship > 45 || (Q.trade || 60) < 35; }, -1, 'piracy on the lanes'), mc(function (Q) { return Q.fear > 45; }, -1, 'the disorder')]},
    tarkin: {motive: 'Wilhuff Tarkin learned on Eriadu that order comes from fear of force. He holds his line because he thinks compromise is weakness, and he has Palpatine\'s ear.',
      cares: [mc(function (Q) { return Q.war && Q.war_balance < 0; }, -2, 'a war being lost'), mc(function (Q) { return Q.war && Q.peace_talks >= 2; }, -2, 'talk of peace'),
        mc(function (Q) { return Q.emergency_powers >= 4; }, 2, 'a strong executive'), mc(function (Q) { return Q.army_oversight; }, -1, 'the Senate meddling in the army'),
        mc(function (Q) { return inGovt(Q, 'rim'); }, -2, 'Rim agitators in government'), mc(function (Q) { return Q.citadel; }, 1, 'the Citadel')]},
    danu: {motive: 'Giddean Danu builds warships at Kuat and wants them commanded by the Senate. He bends on budgets and never on who holds the leash.',
      cares: [mc(function (Q) { return Q.army_oversight || !Q.kamino_army; }, 2, 'Senate command of the forces'), mc(function (Q) { return Q.judicial_forces >= 5; }, 1, 'the Judicial Forces'),
        mc(function (Q) { return Q.emergency_powers >= 5; }, -2, 'a Chancellor with an army of his own'), mc(function (Q) { return Q.fleet_levy; }, 1, 'the member-world fleets')]},
    vell: {motive: 'Tamsar Vell speaks for worlds that joined the Republic for trade and protection, and nothing more. He sells his votes for exemptions, and resents every new burden.',
      cares: [mc(function (Q) { return Q.budget_rev === 'levy' || tariffsOn(Q); }, -1, 'new taxes on unaligned worlds'), mc(function (Q) { return inGovt(Q, 'ind'); }, 1, 'being consulted'),
        mc(function (Q) { return Q.war; }, -1, 'the war\'s demands'), mc(function (Q) { return Q.fleet_levy; }, -2, 'the fleet levy')]},
    satine: {motive: 'Duchess Satine rebuilt Mandalore on the promise that it would never go to war again. She compromises on everything but that.',
      cares: [mc(function (Q) { return Q.peace_talks >= 1; }, 2, 'the peace talks'), mc(function (Q) { return Q.war; }, -1, 'the war'),
        mc(function (Q) { return Q.mandalore_pressed; }, -3, 'pressure on Mandalore\'s neutrality'), mc(function (Q) { return Q.satine_friend; }, 1, 'the Caucus\'s friendship')]},
    shale: {motive: 'Corwin Shale\'s worlds pay their dues and ask for nothing. He wants the Republic to return the favour by leaving them alone, and treats every levy as a betrayal.',
      cares: [mc(tariffsOn, -2, 'Coruscant\'s taxes'), mc(function (Q) { return Q.budget_rev === 'levy'; }, -2, 'the Core levy'),
        mc(function (Q) { return Q.war; }, -1, 'the war'), mc(function (Q) { return Q.fleet_levy; }, -2, 'the fleet levy')]},
    farr: {motive: 'Onaconda Farr left the Caucus over the Rim, but he still believes it can be persuaded. He bargains warmly and remembers betrayal for ever.',
      cares: [mc(function (Q) { return Q.rim_relief >= 1; }, 2, 'relief for the Rim'), mc(function (Q) { return Q.farr_relation_broken; }, -3, 'the Caucus\'s betrayal'),
        mc(function (Q) { return Q.rim_hardship > 45; }, -2, 'hunger on Rodia')]},
    tandeth: {motive: 'Mira Tandeth thinks the Caucus sold the Rim for committee seats. She sets the price of her votes high, and in public.',
      cares: [mc(function (Q) { return Q.rim_hardship > 40; }, -2, 'the Rim\'s suffering'), mc(function (Q) { return inGovt(Q, 'guild'); }, -2, 'guild ministers in government'),
        mc(function (Q) { return Q.rim_enfranchised; }, 2, 'Rim enfranchisement'), mc(function (Q) { return Q.farr_dead; }, -2, 'Farr\'s murder')]},
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
      accept: function (Q) { Q.trade_tax = 0; Q.tariff_ban_until = Q.date + 24; Q.guild_regulations = 0; SW.guildPatience(Q, 15); Q.guild_embargo = Math.max(0, Q.guild_embargo - 2); Q.corruption += 1; Q.rimward_dissent += 5; },
      refuseSub: 'The guild embargo tightens.', refuse: function (Q) { Q.guild_embargo += 1; }},
    rim: {ask: function () { return 'Relief for the Rim, now, or our votes go to whoever will feed our worlds.'; },
      label: 'Send relief convoys.', cost: 2, acceptSub: '−2 treasury. Less hardship on the Rim.',
      accept: function (Q) { Q.treasury -= 2; Q.rim_hardship -= 3; Q.rim_relief += 0.5; },
      refuseSub: 'Separatism grows on the Rim.', refuse: function (Q) { Q.outer_sep += 2; Q.midrim_sep += 1; }},
    sec: {ask: function () { return 'Money for the fleet, or the Security Bloc votes against everything the Caucus sponsors.'; },
      label: 'Fund the fleet.', cost: 2, acceptSub: '−2 treasury. Stronger forces; the Pacifists object.',
      accept: function (Q) { Q.treasury -= 2; Q.judicial_forces += 0.5; Q.pacifist_dissent += 4; if (Q.war) SW.pushFront(Q, SW.weakestFront(Q), 1); },
      refuseSub: 'Fear rises, and the Hawks grow restless.', refuse: function (Q) { Q.fear += 2; Q.hawk_dissent += 3; }},
    mod: {ask: function () { return 'Slow down. Give the Senate a year without another constitutional fight.'; },
      label: 'Agree to a pause.', cost: 0, acceptSub: 'Constitutional and judicial reform waits a while; the Institutionalists approve, the Rimward wing does not.',
      accept: function (Q) { Q.constitution_timer = Math.max(Q.constitution_timer || 0, 4); Q.judiciary_timer = Math.max(Q.judiciary_timer || 0, 4); Q.inst_dissent -= 3; Q.rimward_dissent += 3; },
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
    rim: 'teem', guild: 'dod', mod: 'valorum', sec: 'hask', ind: 'vell', rfc: 'farr',
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
    if (SW.FACTIONS.indexOf(group) >= 0) Q[group + '_dissent_prev'] = Q[group + '_dissent'];
    else Q[group + '_relation_prev'] = Q[group + '_relation'];
    Q.leader_changes = (Q.leader_changes || 0) + 1;
    Q[group + '_favour'] = 0; Q[group + '_grudge'] = 0;
    if (id === 'ardana') Q.rim_was_radical = 1;
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
  SW.splitAt = function (Q, f) { return (f === 'inst' ? 70 : 60) + (0.5 - SW.firm(Q, f)) * 16; };
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

  // Scale relation and dissent changes made since the last visit by the leader's firmness:
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
    for (var j = 0; j < SW.FACTIONS.length; j++) {
      var f = SW.FACTIONS[j];
      var dk = f + '_dissent', dpk = dk + '_prev';
      if (typeof Q[dpk] !== 'number' || isNaN(Q[dpk])) { Q[dpk] = Q[dk]; continue; }
      var dd = Q[dk] - Q[dpk];
      if (dd !== 0) {
        var ff = SW.firm(Q, f);
        Q[dk] = Q[dpk] + dd * (dd > 0 ? 0.6 + 0.8 * ff : 1.4 - 0.8 * ff);
      }
      Q[dk] = SW.clamp(Q[dk], 0, 100);
      Q[dpk] = Q[dk];
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
      var hold = incAvail ? inc.rise(Q) + 0.15 : -1;
      var pool = SW.leaderPool(Q, g);
      for (var j = 0; j < pool.length; j++) {
        if (pool[j] === incId) continue;
        var press = SW.LEADERS[pool[j]].rise(Q) - hold;
        if (press > 0.15 && (!best || press > best.press)) best = {group: g, challenger: pool[j], press: press};
      }
    }
    return best;
  };
  SW.leaderPressure = function (Q) {
    var blocs = SW.CONTEST_BLOCS.filter(function (b) { return Q.parties.indexOf(b) >= 0 && (b !== 'rfc' || !Q.rfc_kind || Q.rfc_kind === 'rimward'); });
    var factions = SW.FACTIONS.filter(function (f) {
      return !Q[SW.SPLIT_FLAG[f]];
    });
    Q.rim_sep_high = (Q.outer_sep > 45 || Q.midrim_sep > 45) ? 1 : 0;
    var bc = SW.contestFor(Q, blocs);
    var fc = SW.contestFor(Q, factions);
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
    if (Q.contest_backed_lost) Q[g + '_grudge'] = (Q[g + '_grudge'] || 0) + 2;
    if (Q.contest_kind === 'bloc') {
      if (Q.contest_backed_won) Q[g + '_relation'] += 6;
      if (Q.contest_backed_lost) Q[g + '_relation'] -= 8;
    } else {
      if (backing === '') Q[g + '_dissent'] -= 3;
      if (Q.contest_backed_won) Q[g + '_dissent'] -= 2;
      if (Q.contest_backed_lost) Q[g + '_dissent'] += 8;
    }
    if (Q.contest_kind === 'faction') SW.factionAgendas(Q);
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
    if (g === 'rim') { Q.treasury -= 1; Q.rimward_dissent -= 2; Q.inst_dissent += 3; }
    else if (g === 'guild') { Q.inst_dissent += 3; Q.rimward_dissent += 4; Q.corruption += 0.5; }
    else if (g === 'mod') { Q.rimward_dissent += 3; Q.pacifist_dissent += 1; }
    else if (g === 'sec') { Q.pacifist_dissent += 4; Q.hawk_dissent -= 2; }
    else if (g === 'ind') { Q.hawk_dissent += 3; }
    else if (g === 'rfc') { Q.inst_dissent += 3; }
  };

  // ------------------------------------------------------------------ support / seats
  SW.computeSupport = function (Q) {
    var parties = Q.parties;
    var totalWeight = 0;
    var support = {};
    for (var p = 0; p < parties.length; p++) support[parties[p]] = 0;
    for (var i = 0; i < SW.REGIONS.length; i++) {
      var r = SW.REGIONS[i];
      var sum = 0;
      for (var a = 0; a < parties.length; a++) {
        var key = r + '_' + parties[a];
        if (!(Q[key] > 0)) Q[key] = 0;
        sum += Q[key];
      }
      if (sum <= 0) continue;
      var w = Q[r] > 0 ? Q[r] : 0;
      totalWeight += w;
      for (var b = 0; b < parties.length; b++) {
        var k2 = r + '_' + parties[b];
        Q[k2 + '_share'] = Math.round(100 * Q[k2] / sum);
        support[parties[b]] += w * Q[k2] / sum;
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
    var lead = blocs[0] || 'mod';
    return SW.name(Q, lead) + '-led Coalition';
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
  SW.assignChairs = function (Q) {
    var partners = Q.govt_blocs.filter(function (b) { return b !== 'rc'; });
    if (!partners.length) partners = ['ind'];
    var prefs = {finance: ['guild', 'mod', 'ind', 'pal', 'sec', 'rim'], judiciary: ['mod', 'pal', 'ind', 'sec', 'rim', 'guild'],
      security: ['sec', 'pal', 'mod', 'ind', 'guild', 'rim'], rimaffairs: ['rim', 'ind', 'mod', 'pal', 'guild', 'sec']};
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


  // ------------------------------------------------------------------ chancellor elections
  SW.candidateName = function (Q, b) {
    if (b === 'pal') return Q.pal_can_run === 0 ? 'Mas Amedda' : 'Palpatine';
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
    if (prev === 'Valorum' && Q.chancellor !== 'Valorum') Q.valorum_fallen = 1;
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
    if (Q.el_join_pledge) SW.makePledge(Q, Q.el_join_pledge, Q.chancellor_bloc);
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
    no_powers: {bloc: 'ind', name: 'no new emergency powers', label: 'Promise the Independents no new emergency powers'},
    no_probe: {bloc: 'pal', name: 'no investigations of the Chancellery', label: ''}
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
    var want = ['judiciary', 'security', 'finance', 'rimaffairs'];
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
  SW.PRICE_CHAIR = {guild: 'finance', mod: 'judiciary', rim: 'rimaffairs', sec: 'security', pal: 'judiciary', rfc: 'rimaffairs'};
  SW.PRICE_PLEDGE = {guild: 'no_tariffs', mod: 'no_levy', rim: 'rim_relief', sec: 'defence', ind: 'no_powers', rfc: 'rim_relief', pal: 'no_probe'};
  SW.partnerPrice = function (Q, b) {
    var f = SW.firm(Q, b), chair = SW.PRICE_CHAIR[b] || '', pledge = SW.PRICE_PLEDGE[b] || '';
    if (f >= 0.62) return {chair: chair, pledge: pledge};
    if (f >= 0.45) return chair ? {chair: chair, pledge: ''} : {chair: '', pledge: pledge};
    return pledge ? {chair: '', pledge: pledge} : {chair: chair, pledge: ''};
  };
  SW.coalitionPrices = function (Q, blocs) {
    var chairs = {}, pledges = {};
    for (var i = 0; i < blocs.length; i++) {
      var b = blocs[i];
      if (b === 'rc') continue;
      var p = SW.partnerPrice(Q, b);
      if (p.chair && chairs[p.chair]) { if (!p.pledge) p.pledge = SW.PRICE_PLEDGE[b] || ''; p.chair = ''; }
      // a budget has one priority: no partner may ask for relief and defence both
      if (p.pledge && SW.PLEDGE_CLASH[p.pledge] && (pledges[SW.PLEDGE_CLASH[p.pledge]] || Q['pl_' + SW.PLEDGE_CLASH[p.pledge]])) {
        p.pledge = '';
        if (!p.chair && SW.PRICE_CHAIR[b] && !chairs[SW.PRICE_CHAIR[b]]) p.chair = SW.PRICE_CHAIR[b];
      }
      if (p.chair) chairs[p.chair] = b;
      if (p.pledge && !pledges[p.pledge] && !Q['pl_' + p.pledge]) pledges[p.pledge] = b;
    }
    return {chairs: chairs, pledges: pledges};
  };
  SW.priceText = function (Q, blocs) {
    var pr = SW.coalitionPrices(Q, blocs), bits = [];
    for (var c in pr.chairs) bits.push('the ' + SW.COMMITTEE_NAMES[c] + ' chair for the ' + SW.name(Q, pr.chairs[c]));
    for (var p in pr.pledges) bits.push(SW.PLEDGES[p].name + ' (for the ' + SW.name(Q, pr.pledges[p]) + ')');
    return bits.length ? 'Their price: ' + bits.join('; ') + '.' : 'No price beyond a fair share.';
  };
  SW.acceptPrices = function (Q, blocs) {
    var pr = SW.coalitionPrices(Q, blocs);
    for (var c in pr.chairs) { Q['chair_' + c] = pr.chairs[c]; Q['chair_res_' + c] = 1; Q['chair_res_' + c + '_name'] = SW.name(Q, pr.chairs[c]); }
    for (var p in pr.pledges) SW.makePledge(Q, p, pr.pledges[p]);
  };
  // joining someone else's government: the Chancellor's bloc names its own price
  SW.juniorPrice = function (Q) {
    var b = Q.el_winner || Q.chancellor_bloc, p = SW.PRICE_PLEDGE[b] || '';
    if (p && (Q['pl_' + p] || (SW.PLEDGE_CLASH[p] && Q['pl_' + SW.PLEDGE_CLASH[p]]))) p = '';
    Q.el_join_pledge = p;
    Q.el_join_price = p ? 'In return, the ' + SW.name(Q, b) + ' ask for ' + SW.PLEDGES[p].name + '.' : '';
  };

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
    Q[f + '_strength'] *= 0.25; Q[f + '_dissent'] = 20;
    Q.split_kind = f; Q.split_own = own ? 1 : 0; Q.split_dest_name = SW.name(Q, target);
    Q.split_faction_name = SW.FACTION_NAMES[f]; Q.split_leader = L.name || 'its leaders';
    Q.split_seats = SW.round1(moved); Q.split_senators = Math.round(moved / 100 * SW.SENATE_SIZE);
    Q.split_share_pct = Math.round(share * 100);
    SW.updateDissent(Q);
    SW.recomputeGovt(Q);
  };
  // a breakaway party behaves like the bloc closest to the faction that founded it
  SW.RFC_PROXY = {hawk: 'sec', pacifist: 'ind', inst: 'mod', rimward: 'rim'};
  SW.RFC_COMFORT = {rimward: -1.0, hawk: 0.2, pacifist: -0.5, inst: 0.3};

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
            Q['adv_' + a] = 0; Q[SW.ADVISOR_FACTION[a] + '_dissent'] += 5; SW.countAdvisors(Q);
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
        Q.faith -= 1; Q.inst_dissent += 6; Q.mod_relation -= 4; Q.scandal_ours_until = Q.date + 12; SW.momentum(Q, -0.8, 'a smear against the Caucus');
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
        Q.fear += 8; Q.peace_talks = Math.max(0, Q.peace_talks - 1); Q.pacifist_dissent += 3;
        return 'A droid bomber strikes Coruscant on the eve of the peace talks. The Senate, in panic, abandons the peace initiative and votes to deregulate the banks to pay for the war.';
      }
    },
    buy_leader: {
      weight: function (Q) { return 0.6 + SW.reformCount(Q) * 0.1; },
      foresee: 'Credits are changing hands among the leaders of another bloc. Someone is buying a leadership fight.',
      counter: 'Warn the bloc',
      foiled: 'The Caucus warns the bloc\'s elders. The bribes are returned, with apologies.',
      apply: function (Q) {
        Q.contest_rigged = 1; Q.leadership_timer = 0;
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
        return 'Forged reports accuse Jedi generals of atrocities. The Order is too busy defending itself to look for anyone else.';
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
    if (Q.finale || Q.sidious_defeated || Q.sidious_gone || Q.date < 12 || Q.scheme_pending) return;
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
    Q.scheme_foreseen = (Q.jedi_suspicion >= 4 || Q.evidence >= 5 || (Q.time - (Q.investigated_at || -99)) <= 2) ? 1 : 0;
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
      Q.banking_independent + Q.rim_enfranchised + Q.anti_corruption + Q.slavery_abolished + Q.tf_broken_up;
  };
  // the Caucus enters a government: the bureaucrats take the measure of its partners at once
  SW.bureauJoin = function (Q, blocs) {
    Q.bureau_relation += 10 * SW.bureauComfort(Q, blocs);
    Q.bureau_reforms_seen = SW.reformCount(Q);
  };
  SW.bureauTick = function (Q) {
    if (SW.off('bureau')) return;
    var f = Q.months_per_turn > 0 ? Q.months_per_turn / 3 : 0.1;
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
    Q.vote_html = '';
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
      Q.inst_dissent += 5; Q.rc_momentum -= 0.5;
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
    SW._notes = []; SW._tabled = 0; Q.vote_tabled = 0;
    var live = !Q.finale && !Q.sidious_defeated;
    var reformVote = rcYes === 1 && topics.some(function (t) { return SW.REFORM_TOPICS.indexOf(t) >= 0; });
    // the Vice Chair controls the agenda: once a year he rules a Caucus reform out of order
    if (!SW.off('gavel') && live && reformVote && !Q.rc_chancellor && (Q.pal_chancellor || Q.puppet_chancellor || (Q.govt_blocs || []).indexOf('pal') >= 0) &&
        Q.senate_resolve < 3 && !Q.senate_guard_reformed && Q.date - (Q.gavel_date === undefined ? -99 : Q.gavel_date) >= 24) {
      Q.gavel_date = Q.date; Q.vote_tabled = 1; SW._tabled = 1; Q.gavels = (Q.gavels || 0) + 1;
      Q.last_vote = 0;
      return 0;
    }
    // delegations on the Chancellery's payroll follow its line on powers and oversight
    var bought = 0;
    if (!SW.off('bought') && live && topics.some(function (t) { return /powers|oversight/.test(t); })) {
      bought = SW.clamp((Q.corruption - 60) / 150 + Q.grand_plan / 600, 0, 0.2);
      if (bought >= 0.08) SW._notes.push('bought votes');
    }
    var palLine = stance.pal !== undefined ? stance.pal : (topics.indexOf('powers') >= 0 ? 1 : 0);
    if (topics.indexOf('powers') >= 0 && rcYes >= 0.75) Q.powers_rc_yes = 1;
    var lobbied = 0;
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      var s = Q[b + '_r'] || 0;
      var p;
      if (b === 'rc') p = rcYes;
      else if (stance[b] !== undefined) p = stance[b];
      else if (b === 'rfc') p = rcYes * 0.8 + 0.1;
      else p = 0.5;
      if (b !== 'rc') {
        // a bloc's leader colours its vote: their views on the topic, and how firmly the bloc holds its line
        var L = SW.leader(Q, b);
        for (var t = 0; t < topics.length; t++) {
          var tp = topics[t], sign = 1;
          if (tp.charAt(0) === '-') { sign = -1; tp = tp.slice(1); }
          p += sign * ((L.views && L.views[tp]) || 0);
        }
        p = 0.5 + (p - 0.5) * (0.7 + 0.6 * SW.firm(Q, b));
        if (Q.guild_lobby && reformVote && SW.GUILD_LOBBY_LEAN[b]) { p -= SW.GUILD_LOBBY_LEAN[b] * Q.guild_lobby; lobbied = 1; }
        if (Q['vote_boost_' + b] && reformVote) { p += Q['vote_boost_' + b]; Q['vote_boost_' + b] = 0; SW._notes.push(SW.name(Q, b) + ' kept their word'); }
        if (bought > 0 && b !== 'pal' && b !== 'cis') p = p * (1 - bought) + palLine * bought;
      }
      p = SW.clamp(p, 0, 1);
      yes += s * p;
      total += s;
    }
    if (lobbied) SW._notes.push('guild lobbying');
    if (total <= 0) total = 1;
    var share = SW.round1(100 * yes / total);
    // cold bureaucrats lose Caucus bills in committee
    if (!SW.off('committee') && live && reformVote && Q.bureau_relation < 25 && (Q.rc_in_govt || Q.rc_chairs > 0)) {
      share = SW.round1(Math.max(0, share - 3));
      SW._notes.push('\u22123, lost in committee');
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
  SW.PAL_GROWTH = 75; // months for Palpatine's bloc to gain one more 'natural size'
  SW.drift = function (Q) {
    var m = Q.months_per_turn;
    var f = m > 0 ? m / 3 : 0.15;
    var noise = function () { return (SW.rnd() - 0.5) * 0.6 * f; };

    // corruption, fear, faith
    Q.corruption += f * (0.3 + Q.emergency_powers * 0.08 - Q.anti_corruption * 0.6 + (Q.war ? 0.25 : 0) + ((Q.guild_r || 20) - 20) * 0.02);
    var targetFear = 18 + (Q.dooku_movement ? 14 : 0) + (Q.war ? 14 + Math.max(0, -Q.war_balance) * 1.5 + Math.max(0, -SW.front(Q, 'core')) * 2 - Math.max(0, SW.front(Q, 'core')) + Math.min(5, Q.war_turns * 0.25) + (Q.war_aim === 'victory' ? 5 : 0) : 0) + (Q.secession_recent || 0) * 2;
    Q.fear += (targetFear - Q.fear) * 0.25 * f;
    Q.secession_recent = 0;
    var reforms = Q.emergency_sunset + Q.term_limits_protected + Q.army_oversight + Q.senate_guard_reformed +
      Q.jedi_independence + Q.banking_independent + Q.rim_enfranchised + Q.anti_corruption;
    var targetFaith = 80 - Q.corruption * 0.45 - Q.fear * 0.15 - Q.war_weariness * 0.1 + reforms * 2.5 - Q.emergency_powers * 1.2 + (Q.rc_r || 0) * 0.2;
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
        d = (Q.rim_hardship - 35) / 25 + (Q.corruption - 55) / 40 + (Q.dooku_movement ? 1.4 * Q.rim_grievance : 0.1)
          - Q.rim_enfranchised * 1.5 - Q.slavery_abolished * 0.3 - Math.min(Q.rim_relief, 3) * 0.15;
        // a reformed Rim slowly settles back toward loyalty
        if (Q.rim_enfranchised && Q[r + '_sep'] > 15) d -= (Q[r + '_sep'] - 15) * 0.04;
        d += SW.leaderSum(Q, 'rimSep', ['rim', 'rfc']);
      } else {
        d = (Q.corruption - 55) / 50 + (Q.dooku_movement ? 1.2 * Q.guild_grievance : 0.05) - (Q.guild_relation - 30) / 60;
      }
      d -= Q.federal_compact * 2 + Q.peace_talks * 0.3 + Q.anti_corruption * 0.3;
      if (Q.war && Q.war_balance > 4) d -= 1;
      Q[r + '_sep'] += f * d;
    }

    // evidence goes stale above 'circumstantial': witnesses vanish, records are wiped
    if (Q.evidence > 5) Q.evidence -= f * (0.12 + Q.grand_plan / 800) * (Q.free_press ? 0.7 : 1);

    // Sidious's hidden progress
    var palInPower = Q.pal_chancellor || Q.puppet_chancellor;
    var hostilePowers = Q.rc_chancellor ? 0 : Q.emergency_powers;
    Q.grand_plan += f * ((0.6 + Q.corruption / 130 + Q.fear / 130 + hostilePowers * 0.12 + (Q.pal_chancellor ? 0.5 : 0) +
      (Q.war ? 0.4 : 0)) * (palInPower ? 1 : 0.6) - Q.evidence * 0.04 - Q.senate_resolve * 0.05 - (Q.jedi_suspicion > 5 ? 0.3 : 0) -
      (Q.rc_chancellor ? 0.25 : 0));

    // regional support drifts toward targets set by the state of the galaxy
    var mult = {
      rc: Math.max(0.3, 1 + (Q.faith - 50) / 40 - (Q.dissent - 0.15) * 1.2 + (Q.rc_in_govt ? 0.05 : 0) + 0.04 * SW.clamp(Q.rc_momentum || 0, -5, 5)),
      mod: Math.max(0.2, 1 + (50 - Q.corruption) / 40 - (Q.valorum_scandal && Q.mod_leader === 'Finis Valorum' ? 0.3 : 0)),
      // Sidious's agents work the Senate every year, in office or not; a clean Senate only slows them
      pal: Math.max(0.3, 1 + Math.max(-0.2, (Q.corruption - 55) / 25) + Math.max(-0.2, (Q.fear - 25) / 20) + Q.grand_plan / (palInPower ? 40 : 70) +
        (Q.sidious_defeated || Q.pal_disgraced ? 0 : Q.date / SW.PAL_GROWTH) + (Q.pal_chancellor ? 0.8 : 0) - Q.evidence_public * 0.4 - (Q.rc_chancellor ? 0.3 : 0)),
      guild: Math.max(0.3, 1 - (Q.tf_broken_up ? 0.3 : 0) + Q.guild_embargo * 0.03),
      rim: 1, sec: Math.max(0.2, 1 + (Q.fear - 20) / 25 + (Q.war ? 0.3 : 0)), ind: 1
    };
    for (var j = 0; j < SW.REGIONS.length; j++) {
      var rg = SW.REGIONS[j];
      for (var bi = 0; bi < 7; bi++) {
        var b = ['rc', 'mod', 'pal', 'guild', 'rim', 'sec', 'ind'][bi];
        var m2 = mult[b];
        if (b === 'rim' && (rg === 'outer' || rg === 'midrim')) m2 = Math.max(0.3, 1 + (Q.rim_hardship - 30) / 30);
        m2 *= 1 + SW.leaderPull(Q, b);
        var target = START_SUPPORT[rg][b] * m2;
        // splinters take a share of the Caucus
        if (b === 'rc') target *= Math.max(0.3, 1 - (Q.split_share_total || 0));
        if (Q['split_gain_' + b]) target += START_SUPPORT[rg].rc * Q['split_gain_' + b];
        Q[rg + '_' + b] += (target - Q[rg + '_' + b]) * 0.08 * f + noise();
      }
      if (Q.cis_formed && Q.parties.indexOf('cis') >= 0) {
        var tc = (rg === 'core' || rg === 'colonies') ? 0.5 : (Q[rg + '_sep'] || 0) / 2.5;
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
      var rep = Q.clones * 0.6 + Q.judicial_forces * 0.25 + Q.member_forces * 0.2 + Q.jedi_strength * 0.25 + (Q.navy_loyalty - 50) / 50;
      var cis = Q.droid_armies + (Q.guild_embargo * 0.2);
      // Sidious keeps the war going: the front drifts back toward a slow Republic advance
      var drift_target = 0.5 + Math.max(0, Q.date - 135) / 30 + (Q.war_aim === 'victory' ? 0.8 : (Q.war_aim === 'peace' ? -0.5 : 0));
      Q.war_balance += f * ((rep - cis) * 0.08 + (drift_target - Q.war_balance) * 0.18 + (SW.rnd() - 0.5) * 1.2);
      Q.war_weariness += f * 3;
      Q.treasury -= f * (1.0 + Q.clones * 0.08);
      if (Q.jedi_generals) { Q.jedi_strength -= f * 0.12; Q.jedi_standing -= f * 0.6; }
      if (Q.anakin_found) Q.anakin_fall += f * 0.15;
      if (Q.kamino_army && Q.clones > 0 && Q.clones < 10) Q.clones += f * 0.35;
      if (!Q.kamino_army) Q.clones = 0;
      if (Q.droid_armies > 0) Q.droid_armies += f * 0.15;
      SW.frontsTick(Q, f);
    }
    SW.economyTick(Q, f);
    Q.rc_momentum = (Q.rc_momentum || 0) * Math.pow(0.8, f);
    for (var gr = 0; gr < SW.REGIONS.length; gr++) Q['grievance_' + SW.REGIONS[gr]] = (Q['grievance_' + SW.REGIONS[gr]] || 0) * Math.pow(0.9, f);
    SW.clampAll(Q);
  };

  // How much real grievance Dooku's movement can feed on (0 = none, ~1.5 = the Rim is furious).
  SW.grievances = function (Q) {
    Q.rim_grievance = SW.clamp((Q.rim_hardship - 25) / 30 + (Q.corruption - 45) / 45 - Q.rim_enfranchised * 0.8 -
      Q.slavery_abolished * 0.2 - Math.min(Q.rim_relief, 3) * 0.1 - Q.anti_corruption * 0.2 - Q.federal_compact +
      SW.leaderSum(Q, 'rimGriev', ['rim', 'rfc']), 0, 1.6);
    Q.guild_grievance = SW.clamp(Q.guild_embargo * 0.12 + (Q.tf_broken_up ? 0.5 : 0) + (Q.trade_tax ? 0.2 : 0) +
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
    if (Q.war_aim === 'victory') { Q.peace_talks = Math.max(0, Q.peace_talks - 0.1 * f); Q.hawk_dissent -= 0.3 * f; Q.pacifist_dissent += 0.3 * f; }
    if (Q.war_aim === 'peace') { Q.peace_talks += 0.05 * f; Q.pacifist_dissent -= 0.3 * f; Q.hawk_dissent += 0.3 * f; }
    if (Q.war_aim === 'rim') {
      Q.rimward_dissent -= 0.3 * f;
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
      if (lib) { Q.outer_seceded = Math.max(0, Q.outer_seceded - 0.1); Q.rim_relation += 5; Q.outer_sep -= 5; Q.rimward_dissent -= 4; }
      else { Q.outer_seceded = Math.min(0.9, Q.outer_seceded + 0.08); Q.rim_hardship += 5; Q.fear += 3; Q.rimward_dissent += 5; }
    } else if (fr === 'mid') {
      if (lib) { Q.midrim_seceded = Math.max(0, Q.midrim_seceded - 0.1); Q.trade += 10; Q.midrim_sep -= 5; Q.guild_relation += 3; }
      else { Q.midrim_seceded = Math.min(0.9, Q.midrim_seceded + 0.08); Q.trade -= 10; Q.fear += 3; Q.guild_relation -= 3; }
    } else {
      if (lib) { Q.fear -= 6; Q.faith += 2; Q.hawk_dissent -= 4; }
      else { Q.fear += 8; Q.faith -= 2; Q.navy_loyalty -= 5; Q.hawk_dissent += 5; }
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
    if (plan === 'outer') { Q.rim_relation += 3; Q.rimward_dissent -= 2; Q.fear += 1; }
    if (plan === 'mid') { Q.guild_relation += 3; Q.trade = (Q.trade || 60) + 4; }
    if (plan === 'core') { Q.sec_relation += 3; Q.fear -= 3; Q.rim_relation -= 3; Q.rimward_dissent += 3; }
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
        b: ['Hold production where it is.', 'The war goes slower; the Pacifists approve.', function (Q) { Q.war_balance -= 0.5; Q.pacifist_dissent -= 2; Q.hawk_dissent += 2; },
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
        b: ['Stay on strategy.', 'The front is unaffected; the Rimward wing is appalled.', function (Q) { Q.rimward_dissent += 4; Q.faith -= 0.5; },
          'The fleet holds its positions. Somewhere in Zygerrian space, the colonists of Kiros wait for a rescue that does not come.']}},
    jedi_stretch: {title: 'The Jedi Are Overstretched', when: function (Q) { return Q.jedi_generals && Q.jedi_strength < 7; },
      text: 'A tenth of the Jedi Order has died in command. The Council asks to withdraw its Knights from the front lines and return to keeping the peace.',
      def: 'b', options: {
        a: ['Let them withdraw.', 'The Order survives; the war goes harder.', function (Q) { Q.jedi_strength += 0.5; Q.war_balance -= 0.7; Q.jedi_relation += 5; Q.anakin_fall -= 0.3; },
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
    } else Q.vote_html = '';
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
        Q.judicial_forces += 0.7; Q.tibanna += 6; if (Q.war) SW.pushFront(Q, SW.weakestFront(Q), 1); Q.sec_relation += 2; Q.pacifist_dissent += 2;
        SW.react(Q, 'The Security Bloc approves; the Pacifists do not. Tibanna gas grows dearer.');
      }},
    subsidies: {name: 'subsidies for the Core and the guilds', cost: function () { return 2; },
      apply: function (Q) {
        Q.mod_relation += 4; Q.guild_relation += 4; Q.corruption += 0.5; Q.rimward_dissent += 2; Q.patrons_goodwill += 6;
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
  SW.guildTick = function (Q, f) {
    var p = Q.guild_patience;
    // patience returns when the pressure stops; a pleased guild slowly forgets its gratitude
    if (Q.guild_hurt_turn !== Q.time) {
      if (p < 60) Q.guild_patience = Math.min(60, p + 2.5 * f);
      else if (p > 60) Q.guild_patience = Math.max(60, p - 1 * f);
    }
    p = Q.guild_patience;
    for (var i = 0; i < SW.GUILD_STEPS.length; i++) if (p > SW.GUILD_STEPS[i] + 15) Q['guild_step_' + (i + 1)] = 0;
    if (p > 65) Q.guild_lobby_halved = 0;
    Q.guild_lobby = p < 50 ? (Q.guild_lobby_halved ? 0.5 : 1) : 0;
    if (!Q.guild_step_ready) {
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
      if (Q.dooku_movement) { Q.corporate_sep += 15; if (Q.war || Q.dooku_movement) Q.droid_armies += 1; Q.gs_open = 1; }
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
    Q.bd_reactions = Q._reactions.length ? '<ul class="reactions"><li>' + Q._reactions.join('</li><li>') + '</li></ul>' : '';
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
  SW.campaignRun = function (Q, msg) {
    var M = SW.CAMPAIGN_MESSAGES[msg], r = Q.cm_region;
    var m = M.mult(Q, r), eff = 4 * SW.unity(Q) * m;
    Q[r + '_rc'] += eff;
    if (msg === 'security') Q.pacifist_dissent += 2;
    if (msg === 'peace') Q.hawk_dissent += 2;
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
      if (Q.force_uses >= 3) { Q.pacifist_dissent += 3; Q.force_uses = 0; Q.cm_force_note = 1; } else Q.cm_force_note = 0;
    }
    if (how === 'cancel') { SW.momentum(Q, -0.2, 'a cancelled rally'); return 0; }
    if (Q.cm_protect_won) { Q.faith += 0.3; Q.fear -= 1; Q.protects_won = (Q.protects_won || 0) + 1; }
    else { Q[Q.cm_region + '_rc'] -= 1; Q.fear += 2; SW.momentum(Q, -0.5, 'a rally broken up by ' + Q.cm_disruptor); Q.protects_lost = (Q.protects_lost || 0) + 1; }
    return Q.cm_protect_won;
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
      win: function (Q) { Q.core_rc += 2; Q.pacifist_dissent -= 3; }, lose: function (Q) { Q.mothma_out_until = Q.date + 12; if (Q.adv_mothma) { Q.adv_mothma = 0; Q.wv_lost_adv = 'Mon Mothma'; } Q.core_rc -= 1; }},
    naboo: {name: 'Naboo\'s royal election', world: 'Naboo', region: 'midrim', from: 96, to: 112, adv: 'amidala',
      ours: 'Queen Jamillia', theirs: function () { return 'a loyalist of Senator Palpatine'; },
      stakes: 'Palpatine\'s home world, and its delegations across the Chommell sector.', ok: function (Q) { return !Q.sidious_defeated && !Q.pal_disgraced; },
      win: function (Q) { Q.midrim_rc += 2; Q.midrim_pal *= 0.9; Q.pal_relation -= 5; }, lose: function (Q) { Q.midrim_pal += 1.5; Q.grand_plan += 1; }},
    corellia: {name: 'the Corellian Diet', world: 'Corellia', region: 'core', from: 100, to: 120, adv: 'bel_iblis',
      ours: 'Garm Bel Iblis\'s allies', theirs: function () { return 'Security Bloc hardliners'; },
      stakes: 'The Corellian fleet, which a friendly Diet would lend to the Republic\'s member forces.', ok: function (Q) { return Q.date >= 24; },
      win: function (Q) { Q.member_forces += 1; Q.core_rc += 1; }, lose: function (Q) { Q.bel_iblis_out_until = Q.date + 12; if (Q.adv_bel_iblis) { Q.adv_bel_iblis = 0; Q.wv_lost_adv = 'Garm Bel Iblis'; } Q.core_sec += 1; }},
    rodia: {name: 'Rodia\'s senatorial election', world: 'Rodia', region: 'midrim', from: 118, to: 140, adv: 'farr',
      ours: 'Onaconda Farr', theirs: function () { return 'a guild-backed challenger'; },
      stakes: 'Farr\'s mandate, and the Rim\'s trust in the Caucus.', ok: function (Q) { return !Q.farr_dead; },
      win: function (Q) { Q.midrim_rc += 1.5; Q.rim_relation += 4; Q.rimward_dissent -= 3; }, lose: function (Q) { Q.midrim_guild = (Q.midrim_guild || 0) + 1; Q.rimward_dissent += 4; }},
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
    Q.wv_adv = W.adv && Q['adv_' + W.adv] ? W.adv : ''; Q.wv_adv_name = Q.wv_adv ? SW.ADVISOR_NAMES[Q.wv_adv] : '';
    Q.wv_has_adv = Q.wv_adv ? 1 : 0;
    Q.wv_poll = Math.round(50 + (Q.wv_chance - 0.5) * 30);
    Q.wv_heading = W.world + ' Goes to the Polls';
  };
  // how: 'hard' (2 capital), 'advisor', 'money', 'none'; 'hard' may be disrupted first
  SW.worldCampaign = function (Q, how) {
    if (how === 'hard') { Q.capital -= 2; Q.wv_boost += 0.15; }
    if (how === 'advisor') { Q.advisor_action_timer = 5; Q.wv_boost += Q.wv_has_adv ? 0.2 : 0.1; }
    if (how === 'money') { Q.wv_boost += 0.12; Q.corruption += 1; Q.rimward_dissent += 4; Q.guild_relation += 2; }
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
    if (how === 'autonomy') { Q.ref_boost += 0.15; Q.peace_talks = (Q.peace_talks || 0) + 0.3; Q.inst_dissent += 3; Q.mod_relation -= 3; }
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
    var avail = SW.trailAvail(Q), W = {debate: 3, endorse: 2.5, research: 2, gaffe: 1 + 2 * (Q.dissent || 0), smear: 1 + Q.grand_plan / 40};
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
      if (choice === 'security') { if (won) { bonusRc(Q, 'sec', 5); Q.colonies_rc += 0.6; } Q.pacifist_dissent += 3; }
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
        if (e === 'satine') { bonusRc(Q, 'ind', 6); Q.pacifist_dissent -= 3; Q.hawk_dissent += 3; Q.outer_rc += 0.5; SW.momentum(Q, 0.5, 'Duchess Satine\'s endorsement'); }
        if (e === 'moncal') { Q.capital -= 1; bonusRc(Q, 'rim', 5); bonusRc(Q, 'rfc', 5); Q.outer_rc += 1.5; SW.momentum(Q, 0.5, 'the Mon Calamari endorsement'); }
        if (e === 'kdy') { bonusRc(Q, 'sec', 8); Q.core_rc += 1; Q.pacifist_dissent += 4; Q.corruption += 1; SW.momentum(Q, 0.4, 'Kuat Drive Yards\' endorsement'); }
        if (e === 'jedi') { Q.jedi_relation -= 6; Q.jedi_standing -= 2; SW.momentum(Q, -0.2, 'an embarrassing approach to the Jedi'); }
        Q.endorsements = (Q.endorsements || 0) + (e === 'jedi' ? 0 : 1);
      } else if (e === 'jedi') { Q.jedi_relation += 3; Q.faith += 0.3; }
    }
    if (k === 'research') {
      var credible = Q.tr_rival !== 'pal' || Q.evidence >= 3;
      if (choice === 'publish') {
        if (credible) { for (var j = 0; j < Q.parties.length; j++) if (Q.parties[j] !== Q.tr_rival) Q['bonus_' + Q.parties[j] + '_for_' + Q.tr_rival] = (Q['bonus_' + Q.parties[j] + '_for_' + Q.tr_rival] || 0) - 6; Q.faith -= 0.5; Q.inst_dissent += 3; Q[Q.tr_rival + '_relation'] -= 8; Q.tr_won = 1; }
        else { Q.premature_accusations += 0.5; SW.momentum(Q, -0.6, 'a smear that backfired'); Q.tr_won = 0; }
      }
      if (choice === 'hold') { Q['bonus_' + Q.tr_rival + '_for_rc'] = (Q['bonus_' + Q.tr_rival + '_for_rc'] || 0) + 4; }
      if (choice === 'burn') { Q.faith += 0.3; Q.inst_dissent -= 2; SW.momentum(Q, 0.2, 'a clean campaign'); }
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
    } else if (Q.guild_patience >= 75) {
      add('guild', 'rc', 6); Q.capital += 1; Q.corruption += 0.5;
      notes.push('The guilds, pleased with the Caucus, quietly fund our campaign.');
    }
    if ((Q.debt || 0) >= 25) { add('guild', 'pal', 4); add('mod', 'pal', 2); notes.push('The Banking Clan, owed a fortune, backs the Chancellery\'s candidate.'); }
    if ((Q.patrons_goodwill || 60) < 30) { add('mod', 'rc', -4); notes.push('Our own Core patrons, angry at the levy, keep their purses shut.'); }
    Q.el_warchest_text = notes.join(' ');
    Q.el_warchest = notes.length ? 1 : 0;
  };
  SW.interestRate = function (Q) {
    return (0.05 + (Q.debt || 0) / 600) * (Q.banking_independent ? 0.5 : 1) * (Q.debt_refinanced ? 0.8 : 1) * (Q.debt_premium_until > Q.date ? 1.3 : 1);
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
      guard: (Q.senate_guard_reformed || ours) ? 2 : (his ? (Q.guard_turned ? 1 : 0) : 1),
      clones: Q.clones * (chips ? (oversight ? 0.8 : 0.6) : (oversight ? 0.15 : 0.05) + (Q.clone_trust || 0) * 0.02),
      navy: Q.clones > 0 ? Q.navy_loyalty / 100 * 4 : 0,
      anakin: anakinGood ? 3 : 0
    };
    var sith = {
      clones: Q.clones * (chips ? (oversight ? 0.2 : 0.4) : (oversight ? 0.85 : 0.95)),
      guard: (Q.senate_guard_reformed || ours) ? 0 : (his ? (Q.guard_turned ? 1 : 2) : 0.5),
      navy: Q.clones > 0 ? (1 - Q.navy_loyalty / 100) * 4 : 0,
      governors: (Q.governors && his) ? 2 : 0,
      sith: 3 + (anakinBad ? 3 : 0),
      security_bloc: (Q.sec_r || 0) / 10,
      secret_army: (Q.kamino_army && Q.clones === 0 && !Q.army_oversight && Q.date >= 132) ? 4 : 0
    };
    var r = 0, s = 0, k;
    for (k in rep) r += rep[k];
    for (k in sith) s += sith[k];
    return {rep: SW.round1(r), sith: SW.round1(s), ratio: s > 0 ? Math.round(100 * r / s) / 100 : 9, repParts: rep, sithParts: sith};
  };

  // What each faction wants right now. Unmet agendas make its dissent climb every turn.
  SW.factionAgendas = function (Q) {
    for (var g = 0; g < SW.FACTIONS.length; g++) {
      var fl = SW.FACTIONS[g], L = SW.leader(Q, fl);
      if (L.agenda) { Q[fl + '_unmet'] = L.agenda(Q) ? 1 : 0; Q[fl + '_demand'] = L.demand; }
    }
    if (SW.leader(Q, 'inst').agenda) return;
    var A = {
      inst: [Q.corruption > 62 && !Q.anti_corruption, 'an honest Senate (an Ethics Commission or lower corruption)'],
      rimward: [(Q.rim_hardship > 40 && !Q.rim_enfranchised) || (Q.date >= 60 && !Q.slavery_abolished && Q.slavery_campaign < 1),
        'relief for the Rim, an end to slavery, Rim representation'],
      pacifist: [(Q.war && Q.peace_talks < 2) || (!Q.rc_chancellor && Q.emergency_powers >= 4) || (Q.dooku_movement && !Q.war && Q.peace_talks < 1),
        'talks with the Separatists and fewer emergency powers'],
      hawk: [(Q.dooku_movement && !Q.pact_formed && Q.member_forces < 3) || (Q.war && Q.war_balance < 0),
        'a Defence Pact and a firm line against the Separatists']
    };
    for (var f in A) { Q[f + '_unmet'] = A[f][0] ? 1 : 0; Q[f + '_demand'] = A[f][1]; }
  };

  // Which cards still have something meaningful to offer (fallback options don't count).
  SW.cardAvailability = function (Q) {
    var c = {};
    c.rim = (Q.rim_hardship > 15) || (!Q.slavery_abolished && Q.slavery_campaign < 2) ||
      (Q.anakin_found && !Q.shmi_freed && !Q.shmi_dead && Q.date >= 18) || Q.outer_sep > 12 || (Q.dooku_movement && Q.outer_sep > 20);
    c.jedi = Q.jedi_relation < 85 || (Q.date >= 18 && Q.jedi_suspicion < 9 && !Q.sidious_known) || Q.jedi_standing < 85 ||
      ((Q.date >= 108 || Q.war) && Q.jedi_reform < 3 && !Q.jedi_reformed) || (Q.anakin_found && Q.date >= 20 && Q.anakin_fall > 0.5);
    c.media = Q.corruption > 20 || Q.faith < 85 || (!Q.rc_chancellor && Q.senate_resolve < 10);
    c.investigate = !Q.sidious_known && !Q.sidious_defeated && (Q.evidence < 11.5 || (Q.archive_gap_known && !Q.kamino_known));
    c.confront = !Q.rc_chancellor && Q.senate_resolve < 9.5;
    c.pact = !Q.pact_formed || Q.member_forces < 8;
    c.peace = !Q.federal_compact && !Q.peace_achieved && !Q.recognized_cis;
    c.civil = Q.faith < 85 || Q.free_press < 3 || (Q.clones > 0 && Q.clone_trust < 8);
    c.finance = (Q.corruption > 25 && Q.guild_relation > 5) || (!Q.tf_broken_up && (Q.gunray_convicted || Q.evidence >= 4 || Q.naboo_free)) ||
      !Q.banking_audit || (!Q.banking_independent && Q.date >= 120) || Q.treasury < 6;
    c.judiciary = (Q.bureau_relation < 70 && Q.bureau_reform_timer <= 0) || Q.corruption > 20 || !Q.anti_corruption || Q.intel_runs < 3 || (Q.gunray_stage >= 1 && Q.gunray_stage <= 4 && !Q.gunray_convicted) ||
      (Q.evidence >= 7 && !Q.warrant);
    c.security = Q.judicial_forces < 8 || (!Q.army_oversight && (Q.clones > 0 || Q.kamino_known)) || !Q.senate_guard_reformed ||
      (Q.clones > 0 && Q.navy_loyalty < 90) || Q.security_audits < 3;
    c.rimaffairs = Q.rim_hardship > 15 || (!Q.slavery_abolished && Q.slavery_campaign >= 1) || !Q.rim_enfranchised;
    c.constitution = !Q.emergency_sunset || !Q.term_limits_protected || !Q.constructive_vonc || !Q.jedi_independence || !Q.rim_enfranchised;
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
  };

  SW.everyVisit = function (Q) {
    SW.scaleChanges(Q);
    SW.updateDissent(Q);
    if (Q.bureau_relation >= 35) Q.bureau_warn_cold = 0;
    if (Q.bureau_relation >= 20 && (Q.bureau_dossier || 0) < 2) Q.bureau_warn_hostile = 0;
    SW.computeSupport(Q);
    SW.recomputeGovt(Q);
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
    var groundwork = (Q.warrant ? 1 : 0) + (Q.chair_judiciary === 'rc' ? 1 : 0) + (Q.dooku_turned ? 1 : 0) + ((Q.evidence_public || 0) >= 2 ? 1 : 0) + (Q.case_briefed ? 1 : 0);
    Q.case_ready = (((Q.evidence >= 9 && groundwork >= 1) || (Q.evidence >= 8.5 && groundwork >= 2)) && !Q.sidious_known && !Q.finale && !Q.game_ending && !(Q.case_timer > 0) && Q.date >= 60 && !Q.sidious_defeated) ? 1 : 0;
    Q.mandate_ok = (Q.rc_chancellor && Q.mandate_term !== Q.elections_held && !Q.election_due && !Q.election_suspended && Q.next_election_date - Q.date > 12) ? 1 : 0;
    SW.factionAgendas(Q);
    SW.cardAvailability(Q);
    SW.grievances(Q);
    SW.leaderPressure(Q);
    Q.hawk_split_ready = (Q.hawk_dissent >= SW.splitAt(Q, 'hawk') && !Q.hawks_split) ? 1 : 0;
    Q.rimward_split_ready = (Q.rimward_dissent >= SW.splitAt(Q, 'rimward') && !Q.rimward_split) ? 1 : 0;
    Q.pacifist_split_ready = (Q.pacifist_dissent >= SW.splitAt(Q, 'pacifist') && !Q.pacifists_resigned) ? 1 : 0;
    Q.inst_split_ready = (Q.inst_dissent >= SW.splitAt(Q, 'inst') && !Q.inst_crisis) ? 1 : 0;
    var fb = SW.forces(Q);
    Q.force_rep = fb.rep; Q.force_sith = fb.sith; Q.force_ratio = fb.ratio;
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
    // faction drift: dissent creeps up; advisors slow it; neglected agendas speed it up
    SW.factionAgendas(Q);
    for (var j = 0; j < SW.FACTIONS.length; j++) {
      var fct = SW.FACTIONS[j];
      var calm = SW.advisorsOfFaction(Q, fct);
      // as in the original, Institutionalist (centrist) advisors calm every faction, not just their own
      var base = calm === 0 ? 1.0 : (calm === 1 ? 0.2 : -0.3);
      if (base > 0) base *= Math.max(0.4, 1 - 0.2 * SW.advisorsOfFaction(Q, 'inst'));
      var drift = base + (Q[fct + '_unmet'] ? 0.8 : -0.5);
      Q[fct + '_dissent'] += drift * (Q.months_per_turn > 0 ? 1 : 0.2);
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
    SW.bureauTick(Q);
    SW.schemeTick(Q);
    Q.assassination_roll = Math.random();
    if (Q.rc_in_govt && Q.govt_blocs && Q.govt_blocs.length > 1) {
      var strain = 0.12;
      for (var gb = 0; gb < Q.govt_blocs.length; gb++) if (Q.govt_blocs[gb] !== 'rc') strain += 0.25 * (SW.firm(Q, Q.govt_blocs[gb]) - 0.5);
      Q.coalition_dissent += Math.max(0.04, strain);
    }
    SW.drift(Q);
    SW.secession(Q);
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

  // ------------------------------------------------------------------ endings
  SW.safeguardCount = function (Q) {
    // a disbanded clone army counts as the army safeguard
    return Q.emergency_sunset + Q.term_limits_protected + ((Q.army_oversight || !Q.kamino_army) ? 1 : 0) + Q.senate_guard_reformed + Q.jedi_independence +
      Q.banking_independent + Q.rim_enfranchised + Q.anti_corruption;
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
    if (Q.cis_victory) return 'confederacy';
    if (Q.dissolved) return 'dissolved';
    if (Q.admirals_coup) return 'admirals';
    if (Q.civil_war_result === 'long') return 'divided';
    if (Q.empire_declared && Q.civil_war_result !== 'won') return 'empire';
    if (Q.jedi_coup) return 'protectorate';
    if (Q.hollow_crown) return 'hollow_crown';
    // a war still raging at the end decides the ending, unless Sidious has fallen and the front holds
    if (Q.war && !(Q.sidious_defeated && Q.war_balance >= -2)) {
      if (Q.war_balance <= -4) { Q.cis_negotiated = 1; return 'confederacy'; }
      return 'endless_war';
    }
    if (Q.sidious_defeated && !Q.restoration_passed && Q.emergency_powers >= 5) return 'admirals';
    if (Q.civil_war_result === 'won') return 'blood';
    if (Q.sidious_defeated && Q.restoration_passed && Q.faith >= 50 && (Q.corruption < 65 || Q.anti_corruption) &&
        Q.sidious_method === 'trial' && SW.safeguardCount(Q) >= 1) return 'reborn';
    if (Q.sidious_defeated) return 'endures';
    // the Sith Lord was never stopped: only a stripped, exposed Chancellery leaves the Republic standing
    if (Q.emergency_powers <= 2 && Q.evidence_public >= 4 && Q.term_limits_protected) { Q.shadow_remains = 1; return 'endures'; }
    return 'empire';
  };

  SW.ENDING_TITLES = {
    reborn: 'The Republic Reborn', endures: 'The Republic Endures', blood: 'Victory in Blood',
    divided: 'The Galaxy Divided', protectorate: 'The Jedi Protectorate', admirals: 'The Admirals\' Republic',
    hollow_crown: 'The Hollow Crown', confederacy: 'Confederacy Triumphant', dissolved: 'A Republic Dissolved', endless_war: 'The Endless War',
    empire: 'The Galactic Empire'
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
