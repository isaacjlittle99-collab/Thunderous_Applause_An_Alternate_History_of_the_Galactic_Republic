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
    'civil', 'routine',
    'finance', 'judiciary', 'security', 'rimaffairs', 'constitution', 'diplomacy', 'clone_oversight',
    'coalition', 'shuffle_committees', 'emergency_measures',
    'corruption_scandal', 'piracy', 'famine', 'embargo', 'secession', 'profiteering', 'protest',
    'assassination', 'leak', 'unease', 'sunset', 'battle', 'gunray', 'pal_media', 'faction_crisis',
    'last_days', 'coalition_strain', 'leadership', 'faction_leader'
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
    }
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
      Q.capital = 5; Q.base_contrib = 3; Q.treasury = 6; Q.mod_relation = 62; Q.rim_relation = 42;
      Q.inst_dissent = 5; Q.hawk_dissent = 8;
    } else if (Q.difficulty > 0) {   // Jedi Master
      Q.capital = 2; Q.base_contrib = 1; Q.treasury = 3; Q.mod_relation = 48; Q.rim_relation = 30;
      Q.inst_dissent = 18; Q.rimward_dissent = 18; Q.hawk_dissent = 22; Q.grand_plan = 10;
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
    // half-year turns cover two turns per year; quarters four; income is per year either way
    Q.capital += Math.max(0, Q.base_contrib + bonus);
    Q.treasury += 2 + (Q.trade_tax ? 1 : 0) - Math.round(Q.guild_embargo / 3);
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
  SW.firm = function (Q, group) { return SW.leader(Q, group).firm; };
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
    if (id === 'ardana') Q.rim_was_radical = 1;
  };
  SW.leaderRefuses = function (Q, a, b) {
    var r = SW.leader(Q, a).refuses || [];
    return r.indexOf(b) >= 0;
  };
  // Whether a set of blocs can govern together; returns '' or the reason.
  SW.coalitionBlock = function (Q, blocs) {
    for (var i = 0; i < blocs.length; i++) {
      for (var j = 0; j < blocs.length; j++) {
        if (i !== j && SW.leaderRefuses(Q, blocs[i], blocs[j])) {
          return Q[blocs[i] + '_leader'] + ' will not govern with the ' + SW.name(Q, blocs[j]) + '.';
        }
      }
    }
    return '';
  };
  SW.coalitionMin = function (Q, b) { return 25 + 20 * SW.firm(Q, b); };
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
    var blocs = SW.CONTEST_BLOCS.filter(function (b) { return Q.parties.indexOf(b) >= 0; });
    var factions = SW.FACTIONS.filter(function (f) {
      return !(f === 'hawk' && Q.hawks_split) && !(f === 'rimward' && Q.rimward_split);
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
    Q.govt_blocs = blocs.slice();
    for (var i = 0; i < SW.BLOCS.length; i++) Q[SW.BLOCS[i] + '_in_govt'] = blocs.indexOf(SW.BLOCS[i]) >= 0 ? 1 : 0;
    Q.rc_in_govt = Q.rc_in_govt_flag = blocs.indexOf('rc') >= 0 ? 1 : 0;
    Q.coalition_name = name || SW.coalitionName(Q, blocs);
    Q.coalition_dissent = 0;
    SW.recomputeGovt(Q);
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
  };

  SW.coalitionName = function (Q, blocs) {
    var has = function (b) { return blocs.indexOf(b) >= 0; };
    if (has('rc')) {
      if (has('mod') && has('rim') && has('sec')) return 'Unity Government';
      if (has('mod') && has('guild')) return 'Grand Concord';
      if (has('rim') && !has('mod')) return 'Rimward Compact';
      if (has('mod')) return 'Reform Concord';
      if (has('pal')) return 'Chancellor\'s Coalition';
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
      base += ((La.likes && La.likes[b]) || 0) + (0.5 - La.firm) * 16;
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
  SW.runElection = function (Q, candidates) {
    var tally = {};
    for (var c = 0; c < candidates.length; c++) tally[candidates[c]] = 0;
    for (var i = 0; i < Q.parties.length; i++) {
      var bloc = Q.parties[i];
      var seats = Q[bloc + '_r'] || 0;
      // a bloc with a candidate votes for itself
      if (candidates.indexOf(bloc) >= 0) { tally[bloc] += seats; continue; }
      // the Caucus follows its endorsement
      if (bloc === 'rc' && Q.el_backing && candidates.indexOf(Q.el_backing) >= 0) { tally[Q.el_backing] += seats; continue; }
      var best = null, bestV = -999, second = null, secondV = -999;
      for (var k = 0; k < candidates.length; k++) {
        var v = SW.affinity(Q, bloc, candidates[k]) + ((Q[candidates[k] + '_r'] || 0) - 12) * 0.8 + (SW.rnd() * 10 - 5);
        if (v > bestV) { second = best; secondV = bestV; best = candidates[k]; bestV = v; }
        else if (v > secondV) { second = candidates[k]; secondV = v; }
      }
      // close preferences split the bloc
      if (second && bestV - secondV < 8) {
        tally[best] += seats * 0.6; tally[second] += seats * 0.4;
      } else {
        tally[best] += seats;
      }
    }
    var result = [];
    for (var cand in tally) result.push({bloc: cand, share: SW.round1(tally[cand])});
    result.sort(function (x, y) { return y.share - x.share; });
    return result;
  };

  // Winner (not rc) assembles a coalition by affinity. Returns array of blocs.
  SW.formCoalitionAuto = function (Q, leader, allowRc) {
    var members = [leader];
    var seats = Q[leader + '_r'] || 0;
    var others = Q.parties.filter(function (b) { return b !== leader && (allowRc || b !== 'rc') && b !== 'cis'; });
    others.sort(function (a, b) { return SW.affinity(Q, leader, b) + SW.affinity(Q, b, leader) - SW.affinity(Q, leader, a) - SW.affinity(Q, a, leader); });
    for (var i = 0; i < others.length && seats < 52; i++) {
      var o = others[i];
      if (SW.affinity(Q, o, leader) < 25) continue;
      if (SW.coalitionBlock(Q, members.concat([o]))) continue;
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
      var minRel = 100, cold = '';
      for (var j = 1; j < bl.length; j++) {
        minRel = Math.min(minRel, Q[bl[j] + '_relation'] || 0);
        if ((Q[bl[j] + '_relation'] || 0) < SW.coalitionMin(Q, bl[j]) && !cold) cold = bl[j];
      }
      out.push({name: SW.coalitionName(Q, bl), blocs: bl, seats: SW.seats(Q, bl), minRel: minRel, cold: cold, block: SW.coalitionBlock(Q, bl)});
    }
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

  SW.electionIntro = function (Q) {
    var h = '<div class="panel"><b>Candidates</b><br>';
    for (var i = 0; i < Q.el_cands.length; i++) {
      var b = Q.el_cands[i];
      h += SW.span(Q, b, SW.candidateName(Q, b)) + ' (' + SW.name(Q, b) + ', ' + (Q[b + '_r'] || 0).toFixed(1) + '% of the Senate)<br>';
    }
    h += '</div>';
    return h;
  };

  SW.resultText = function (Q, res, label) {
    var h = '<div class="vote"><b>' + label + '</b><br>';
    for (var i = 0; i < res.length; i++) {
      h += SW.span(Q, res[i].bloc, SW.candidateName(Q, res[i].bloc)) + ': ' + res[i].share.toFixed(1) + '%<br>';
    }
    return h + '</div>';
  };

  SW.holdElection = function (Q) {
    Q.el_active = 1;
    var res = SW.runElection(Q, Q.el_cands);
    var text = SW.resultText(Q, res, 'First ballot');
    var winner = res[0].bloc;
    if (res[0].share < 50 && res.length > 1) {
      var r2 = SW.runElection(Q, [res[0].bloc, res[1].bloc]);
      text += SW.resultText(Q, r2, 'Second ballot');
      winner = r2[0].bloc;
    }
    Q.el_active = 0;
    Q.el_result = text;
    Q.el_winner = winner;
    Q.el_winner_name = SW.candidateName(Q, winner);
    SW.installChancellor(Q, winner);
    // clear courting bonuses
    for (var k in Q) if (k.indexOf('bonus_') === 0) delete Q[k];
    return winner;
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
    Q.elections_held += 1;
    Q.naboo_sympathy = 0;
    if (prev === 'Valorum' && Q.chancellor !== 'Valorum') Q.valorum_fallen = 1;
    if (bloc === 'pal') { Q.pal_name = 'Chancellor\'s Bloc'; if (Q.chancellor === 'Palpatine') { Q.pal_was_chancellor = 1; Q.pal_terms = (Q.pal_terms || 0) + 1; } }
    if (bloc === 'rc') { Q.rc_was_chancellor = 1; Q.rc_terms = (Q.rc_terms || 0) + 1; }
    SW.recomputeGovt(Q);
  };

  // coalition options for an rc-led government, exposed as flat qualities for the scene
  SW.prepareRcCoalitions = function (Q) {
    var opts = SW.rcCoalitionOptions(Q);
    for (var i = 0; i < 7; i++) {
      var o = opts[i];
      Q['el_opt' + i] = o ? 1 : 0;
      Q['el_opt' + i + '_ok'] = (o && o.seats >= 50 && !o.cold && !o.block) ? 1 : 0;
      if (o && o.seats >= 50 && o.block) Q.coal_refused = (Q.coal_refused || 0) + 1;
      Q['el_opt' + i + '_label'] = o ? (o.name + ': ' + o.blocs.filter(function (b) { return b !== 'rc'; }).map(function (b) { return SW.name(Q, b); }).join(', ') + ' (' + o.seats.toFixed(1) + '%)') : '';
      Q['el_opt' + i + '_why'] = o ? (o.seats < 50 ? 'Not enough seats.' : (o.block ? o.block :
        (o.cold ? 'The ' + SW.name(Q, o.cold) + ' under ' + Q[o.cold + '_leader'] + ' will not work with us yet.' : ''))) : '';
    }
    Q.el_opts = opts.map(function (o) { return o.blocs; });
  };

  SW.chooseRcCoalition = function (Q, i) {
    var blocs = Q.el_opts[i];
    SW.setGovt(Q, blocs);
    Q.leverage = Math.round(Q.rc_r) + 15;
  };

  SW.joinGovernment = function (Q) {
    var blocs = Q.govt_blocs.slice();
    if (blocs.indexOf('rc') < 0) blocs.push('rc');
    SW.setGovt(Q, blocs, Q.coalition_name);
    Q.leverage = Math.round(Q.rc_r * 0.8);
  };

  // ------------------------------------------------------------------ votes
  // stance: {bloc: probability of voting yes}; rcYes: the Caucus's own vote (1/0/0.5)
  SW.vote = function (Q, stance, rcYes, topic) {
    var yes = 0, total = 0;
    if (rcYes === undefined) rcYes = 0.5;
    var topics = topic ? [].concat(topic) : [];
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
        p = 0.5 + (p - 0.5) * (0.7 + 0.6 * L.firm);
      }
      p = SW.clamp(p, 0, 1);
      yes += s * p;
      total += s;
    }
    if (total <= 0) total = 1;
    var share = SW.round1(100 * yes / total);
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
    var pass = share >= threshold;
    return '<div class="vote ' + (pass ? 'vote-pass' : 'vote-fail') + '">' + label + ': <b>' + share.toFixed(1) + '%</b> in favour' +
      (threshold !== 50 ? ' (needs ' + threshold + '%)' : '') + ' — <b>' + (pass ? 'passed' : 'defeated') + '</b></div>';
  };

  // ------------------------------------------------------------------ drift each turn
  SW.drift = function (Q) {
    var m = Q.months_per_turn;
    var f = m > 0 ? m / 3 : 0.15;
    var noise = function () { return (SW.rnd() - 0.5) * 0.6 * f; };

    // corruption, fear, faith
    Q.corruption += f * (0.3 + Q.emergency_powers * 0.08 - Q.anti_corruption * 0.6 + (Q.war ? 0.35 : 0) + ((Q.guild_r || 20) - 20) * 0.02);
    var targetFear = 18 + (Q.dooku_movement ? 14 : 0) + (Q.war ? 14 + Math.max(0, -Q.war_balance) * 3 : 0) + (Q.secession_recent || 0) * 2;
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
      rc: Math.max(0.3, 1 + (Q.faith - 50) / 40 - (Q.dissent - 0.15) * 1.2 + (Q.rc_in_govt ? 0.05 : 0)),
      mod: Math.max(0.2, 1 + (50 - Q.corruption) / 40 - (Q.valorum_scandal && Q.mod_leader === 'Finis Valorum' ? 0.3 : 0)),
      pal: Math.max(0.3, 1 + (Q.corruption - 55) / 25 + (Q.fear - 25) / 20 + Q.grand_plan / (palInPower ? 40 : 70) + (Q.pal_chancellor ? 0.8 : 0) - Q.evidence_public * 0.4 - (Q.rc_chancellor ? 0.3 : 0)),
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
        if (b === 'rc') target *= (1 - (Q.hawks_split ? 0.15 : 0) - (Q.rimward_split ? 0.2 : 0));
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
      var drift_target = 0.5 + Math.max(0, Q.date - 135) / 30;
      Q.war_balance += f * ((rep - cis) * 0.08 + (drift_target - Q.war_balance) * 0.18 + (SW.rnd() - 0.5) * 1.2);
      Q.war_weariness += f * 3;
      Q.treasury -= f * (0.6 + Q.clones * 0.06);
      if (Q.jedi_generals) { Q.jedi_strength -= f * 0.12; Q.jedi_standing -= f * 0.6; }
      if (Q.anakin_found) Q.anakin_fall += f * 0.15;
      if (Q.clones > 0 && Q.clones < 10) Q.clones += f * 0.35;
      if (Q.droid_armies > 0) Q.droid_armies += f * 0.15;
    }
    SW.clampAll(Q);
  };

  // How much real grievance Dooku's movement can feed on (0 = none, ~1.5 = the Rim is furious).
  SW.grievances = function (Q) {
    Q.rim_grievance = SW.clamp((Q.rim_hardship - 25) / 30 + (Q.corruption - 45) / 45 - Q.rim_enfranchised * 0.8 -
      Q.slavery_abolished * 0.2 - Math.min(Q.rim_relief, 3) * 0.1 - Q.anti_corruption * 0.2 - Q.federal_compact +
      SW.leaderSum(Q, 'rimGriev', ['rim', 'rfc']), 0, 1.6);
    Q.guild_grievance = SW.clamp(Q.guild_embargo * 0.12 + (Q.tf_broken_up ? 0.5 : 0) + (Q.trade_tax ? 0.2 : 0) +
      (40 - Q.guild_relation) / 50 + (Q.corruption - 50) / 80 + SW.leaderSum(Q, 'guildGriev', ['guild']), 0, 1.6);
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

  SW.clampAll = function (Q) {
    var bounded = {
      grand_plan: [0, 100], emergency_powers: [0, 10], evidence: [0, 12], jedi_suspicion: [0, 10],
      senate_resolve: [0, 10], corruption: [0, 100], faith: [0, 100], fear: [0, 100], rim_hardship: [0, 100],
      guild_embargo: [0, 10], outer_sep: [0, 100], midrim_sep: [0, 100], corporate_sep: [0, 100],
      war_balance: [-10, 10], war_weariness: [0, 100], anakin_fall: [0, 10], dooku_doubt: [0, 10],
      jedi_strength: [0, 10], jedi_standing: [0, 100], jedi_relation: [0, 100], judicial_forces: [0, 10],
      member_forces: [0, 10], clones: [0, 10], navy_loyalty: [0, 100], droid_armies: [0, 12],
      coalition_dissent: [0, 10], capital: [-5, 40], treasury: [-10, 30], leverage: [0, 60]
    };
    for (var k in bounded) Q[k] = SW.clamp(Q[k], bounded[k][0], bounded[k][1]);
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
    c.judiciary = Q.corruption > 20 || !Q.anti_corruption || Q.intel_runs < 3 || (Q.gunray_stage >= 1 && Q.gunray_stage <= 4 && !Q.gunray_convicted) ||
      (Q.evidence >= 7 && !Q.warrant);
    c.security = Q.judicial_forces < 8 || (!Q.army_oversight && (Q.clones > 0 || Q.kamino_known)) || !Q.senate_guard_reformed ||
      (Q.clones > 0 && Q.navy_loyalty < 90) || Q.security_audits < 3;
    c.rimaffairs = Q.rim_hardship > 15 || (!Q.slavery_abolished && Q.slavery_campaign >= 1) || !Q.rim_enfranchised;
    c.constitution = !Q.emergency_sunset || !Q.term_limits_protected || !Q.constructive_vonc || !Q.jedi_independence || !Q.rim_enfranchised;
    c.clones = !Q.chips_found || (Q.chips_found && !Q.chips_removed) || (Q.clones > 0 && !Q.clone_citizenship) || Q.clones > 6;
    for (var k in c) Q['cardok_' + k] = c[k] ? 1 : 0;
  };

  // ------------------------------------------------------------------ every visit
  SW.everyVisit = function (Q) {
    SW.scaleChanges(Q);
    SW.updateDissent(Q);
    SW.computeSupport(Q);
    SW.recomputeGovt(Q);
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
    for (var i = 0; i < Q.timers.length; i++) {
      var key = Q.timers[i] + '_timer';
      if (Q[key] > 0) Q[key] -= 1;
    }
    // faction drift: dissent creeps up; advisors slow it; neglected agendas speed it up
    SW.factionAgendas(Q);
    for (var j = 0; j < SW.FACTIONS.length; j++) {
      var fct = SW.FACTIONS[j];
      var calm = SW.advisorsOfFaction(Q, fct);
      var drift = (calm === 0 ? 0.8 : (calm === 1 ? 0.1 : -0.4)) + (Q[fct + '_unmet'] ? 1.0 : -0.5);
      Q[fct + '_dissent'] += drift * (Q.months_per_turn > 0 ? 1 : 0.2);
    }
    // relations with other blocs fade back toward their natural attitude unless tended
    var REL_BASE = {mod: 42, pal: 38, guild: 22, rim: 32, sec: 28, ind: 40, cis: 12, rfc: 40};
    var rf = Q.months_per_turn > 0 ? Q.months_per_turn / 3 : 0.1;
    for (var rb in REL_BASE) {
      var lb = SW.leader(Q, rb).relBase;
      var base = lb !== undefined ? lb : REL_BASE[rb];
      Q[rb + '_relation'] += (base - Q[rb + '_relation']) * 0.07 * rf;
    }
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
  SW.routeEnding = function (Q) {
    if (Q.cis_victory) return 'confederacy';
    if (Q.dissolved) return 'dissolved';
    if (Q.civil_war_result === 'long') return 'divided';
    if (Q.empire_declared && Q.civil_war_result !== 'won') return 'empire';
    if (Q.jedi_coup) return 'protectorate';
    if (Q.hollow_crown) return 'hollow_crown';
    if (Q.sidious_defeated && !Q.restoration_passed && Q.emergency_powers >= 5) return 'admirals';
    if (Q.civil_war_result === 'won') return 'blood';
    if (Q.sidious_defeated && Q.restoration_passed && Q.faith >= 55 && (Q.corruption < 65 || Q.anti_corruption)) return 'reborn';
    if (Q.sidious_defeated) return 'endures';
    if (Q.emergency_powers >= 8) return 'empire';
    return 'endures';
  };

  SW.ENDING_TITLES = {
    reborn: 'The Republic Reborn', endures: 'The Republic Endures', blood: 'Victory in Blood',
    divided: 'The Galaxy Divided', protectorate: 'The Jedi Protectorate', admirals: 'The Admirals\' Republic',
    hollow_crown: 'The Hollow Crown', confederacy: 'Confederacy Triumphant', dissolved: 'A Republic Dissolved',
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
