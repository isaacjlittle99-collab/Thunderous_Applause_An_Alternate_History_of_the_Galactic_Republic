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
    modded_with: 'Name of the mod in play',
    // the Separatist threat
    sep_momentum: 'Momentum of the Separatist cause',
    sep_growing: 'The Separatist cause is gathering strength',
    rim_addressed: 'How far the Rim has been addressed (%)',
    war_rep: 'Republic military strength', war_cis: 'Confederacy military strength', war_ratio: 'Republic strength against the Confederacy',
    war_state: 'How the war stands (won, balance, lost)',
    worlds_lost: 'Loyalist worlds lost', worlds_liberated: 'Loyalist worlds liberated', worlds_lost_list: 'Worlds held by the Separatists',
    lost_outer: 'Worlds lost on the Outer Rim front', lost_mid: 'Worlds lost on the Hydian Way front', lost_core: 'Worlds lost on the Core front',
    coruscant_falls: 'Coruscant has fallen',
    sidious_fled: 'Sidious has fled to the Confederacy', sidious_escaped: 'Sidious escaped from Coruscant',
    rim_defected: 'The Rimward Coalition went over to the Separatists', rfc_defected: 'The breakaway party went over to the Separatists',
    rimward_defected: 'Our Rimward wing went over to the Separatists', sec_folded: "The Security Bloc folded into Palpatine's bloc",
    threats_seen: 'Defection warnings so far', threats_averted: 'Defections headed off', threats_happened: 'Defections that happened',
    // reforms in steps
    track_total: 'Reform steps taken (all tracks)',
    bureau_reviewed: 'The bureaucracy has been reviewed', bureau_reformed: 'The Civil Service Act has passed', amedda_arrested: 'Mas Amedda has been arrested',
    rim_relief_act: 'The Rim Relief Act has passed', rim_assembly: 'A Rim Assembly has been created',
    integrity_office: 'The Office of Public Integrity exists', powers_review: 'The Powers Review Amendment has passed',
    senate_command: 'The Senate Command Act has passed', mil_invest: 'Investments in the military',
    new_jedi_order: 'A New Jedi Order has been founded', anakin_light: 'Anakin has chosen the light',
    rim_radical: 'How far the Rim\'s politicians have radicalised (0 to 3)', rim_radical_word: 'The Rim\'s politicians, in words',
    rim_radical_ready: 'A step in the Rim\'s radicalisation is waiting to be told', rim_story_ready: 'A story from the radicalising Rim is waiting to be told',
    rim_story: 'The story from the Rim being told', rim_stories: 'Stories from the radicalising Rim told so far',
    anakin_anchor: 'What holds Anakin (mother, order, friends, or none)', anakin_anchor_name: 'What holds Anakin, in words',
    anakin_warned: 'A warning about Palpatine reached Anakin and was heard', anakin_floor: 'The lowest Anakin\'s slide can go while nothing holds him',
    arrest_forces_score: 'The balance of forces at the last arrest (+1 to −3)', arrest_forces_note: 'How the forces weighed on the last arrest',
    slavery_report: 'The Senate report on slavery is published', slavery_abolished: 'Slavery has been abolished', slavery_enforced: 'Abolition is enforced',
    patrol_fleets: 'Patrol fleets guard the Rim', pirates_crushed: 'The pirate fleets are crushed', pirate_humiliation: 'The pirate campaign ended in humiliation',
    syndicates_broken: 'The syndicates are broken', hutt_deal: 'The Republic has a deal with the Hutts',
    sentience_rights: 'The Rights of Sentience are proclaimed', officer_corps: 'The officer corps is diversified',
    hhc_investigated: 'The human-first groups are investigated', hhc_discredited: 'High Human Culture is discredited',
    hhc_events: 'High Human Culture events so far', pirate_raids: 'Pirate raids so far',
    // guild money
    guild_hold: 'Debts to the guilds (they block reforms that hurt them)', guild_breaks: 'Times the Caucus broke with the guilds',
    // the Last Days
    navy_vetted: 'Times the Caucus vetted Navy officers for loyalty', evidence_secured: 'Our evidence is secured for the Last Days',
    // the search for the Sith
    sith_stage: 'The search for the Sith (0 rumours, 1 a presence, 2 a hidden hand, 3 close to power, 4 a name)',
    sith_presence: 'The Jedi have confirmed a Sith presence', sith_named: 'The Caucus knows the Sith Lord is Palpatine',
    suspect_amedda: 'Suspect cleared: Mas Amedda', suspect_pestage: 'Suspect cleared: Sate Pestage', suspect_free_taa: 'Suspect cleared: Orn Free Taa', suspect_dod: 'Suspect cleared: Lott Dod',
    kamino_traced: 'The Kamino payments were traced', valorum_networks_used: "Valorum's old networks were used",
    amedda_removed: "Mas Amedda's dealings were leaked and he lost the gavel",
    sith_alarm: "The Sith Lord's alarm (5: he brings his plans forward; 8: he moves at once)", finale_date: 'Month the Last Days or his gambit begin',
    chair_constitution: 'Who chairs Constitutional Affairs', chair_jedi: 'Who chairs Jedi Affairs',
    minister_finance_name: 'The Finance & Commerce minister', minister_judiciary_name: 'The Judiciary & Intelligence minister',
    minister_security_name: 'The Security & Defence minister', minister_rimaffairs_name: 'The Outer Rim Affairs minister',
    minister_constitution_name: 'The Constitutional Affairs minister', minister_jedi_name: 'The Jedi Affairs minister',
    appoint_ready: 'The Caucus has a chair to fill', appoint_queue: 'Chairs waiting for the Caucus to choose a minister',
    ministry_report_ready: 'The Committees Report is waiting', ministry_acts_total: 'Acts by committees the Caucus does not chair',
    minority_support_names: 'The blocs a Caucus minority government relies on', minority_support_n: 'How many blocs support our minority government',
    minority_defeats: 'Government bills voted down under a Caucus minority', collapse_at: 'The mood at which the government falls (3 for a Caucus minority, else 4)',
    jedi_service_suspended: 'The Jedi Service Act is suspended for the war',
    mod_wing: 'The wing that rules the Core Moderates', guild_wing: 'The wing that rules the Commerce Guilds', rim_wing: 'The wing that rules the Rimward Coalition',
    sec_wing: 'The wing that rules the Security Bloc', ind_wing: 'The wing that rules the Independents', rfc_wing: 'The wing that rules the Rim Freedom Caucus',
    pal_wing: 'The wing that sets the line of Palpatine\'s bloc', pal_lieutenant: 'Palpatine\'s lieutenant, from his ruling wing',
    wing_ruusan: 'Ruusan Republicans\' share of the Moderates\' delegates', wing_establishment: 'Core Establishment\'s share of the Moderates\' delegates',
    wing_old_families: 'Old Families\' share of the Moderates\' delegates', wing_corporatists: 'Corporatists\' share of the guilds\' delegates',
    wing_confederates: 'Confederates\' share of the guilds\' delegates', wing_free_traders: 'Free Traders\' share of the guilds\' delegates',
    wing_mic: 'The Military-Industrial Complex\'s share of the guilds\' delegates', wing_seen_mic: 'The Military-Industrial Complex has appeared',
    wing_populists: 'Rim Populists\' share of the Rimward Coalition', wing_hutt_machine: 'The Hutt-space Machine\'s share of the Rimward Coalition',
    wing_radicals: 'Rim Radicals\' share of the Rimward Coalition', wing_law_order: 'The Law and Order Moderates\' share of the Security Bloc',
    wing_human_first: 'The Human-Firsters\' share of the Security Bloc', wing_const_hawks: 'The Constitutional Hawks\' share of the Security Bloc',
    wing_brokers: 'The Brokers\' share of the Independents', wing_neutralists: 'The Neutralists\' share of the Independents', wing_isolationists: 'The Isolationists\' share of the Independents',
    wing_centralists: 'The Centralists\' share of Palpatine\'s bloc', wing_new_order: 'The New Order\'s share of Palpatine\'s bloc', wing_cult: 'The Personality Cult\'s share of Palpatine\'s bloc',
    congress_go: 'A party congress is ready to meet', congress_ready: 'The bloc whose congress meets next', congress_why: 'Why it meets (regular, overtaken, scandal, crisis, fallen)',
    congresses: 'Party congresses held so far', cg_deadlock: 'The last congress was deadlocked', cg_winner_wing: 'The wing that won the last congress',
    valorum_fell_date: 'When Valorum fell from the Chancellery', valorum_leads_mod: 'Valorum leads the Moderates again',
    hutt_rules: 'The Hutt-space Machine rules the Rimward Coalition', hutt_terms: 'The Caucus keeps the Hutts\' terms', hutt_turned: 'The Hutts have turned against the Caucus',
    hutt_offer_ok: 'The Hutts have an offer ready', hutt_rep_kind: 'The Hutts\' last reprisal (bounty, cartel, relief or smear)', rim_obstruct: 'How hard the Rim Radicals obstruct (0 to 1)',
    guilds_split: 'The guilds\' hardliners went over to the Separatists', militias: 'Human militias are in Coruscant\'s streets', repealed: 'The Rim\'s rights were repealed',
    farr_returned: 'Farr\'s Rim Freedom Caucus rejoined the Caucus', ld_hawks_used: 'The Constitutional Hawks were called on', hawks_fleets: 'Kuat\'s defence fleets on our side',
    petition_lost: 'How much of the petition\'s weight Palpatine\'s wings have cost it', rc_lead: 'The faction that leads the Caucus',
    rc_chair: 'The Caucus\'s chair', rc_congress_ready: 'The Caucus congress is ready to meet', rc_congresses: 'Caucus congresses held',
    lead_event_ready: 'The leading faction\'s next event', committee_smooth: 'The next Caucus bill will be smoothed through committee',
    pork_count: 'Patronage handed out by any committee', pork_said: 'The last kind of patronage handed out, as the report puts it', pork_v_finance: 'The patronage the Finance card offers (1-6)', pork_v_judiciary: 'The patronage the Judiciary card offers (1-6)', pork_v_security: 'The patronage the Security card offers (1-6)', pork_v_rimaffairs: 'The patronage the Rim Affairs card offers (1-6)', pork_mv_finance: 'The last patronage the Finance ministry handed out (1-6)', pork_mv_judiciary: 'The last patronage the Judiciary ministry handed out (1-6)', pork_mv_security: 'The last patronage the Security ministry handed out (1-6)', pork_mv_rimaffairs: 'The last patronage the Rim Affairs ministry handed out (1-6)', walkout_go: 'A wing is about to walk out', walkout_ready: 'The wing walking out', wk_join: 'Where it goes (a bloc, rc for us, cis for the Separatists)',
    wk_found: 'The party it founds', walkouts: 'Wings that have walked out', splinters: 'Splinter parties founded',
    chan_peace_ok: 'Our Chancellor can proclaim a ceasefire', chan_ceasefire: 'The Chancellor\'s ceasefire was proclaimed', chancellors_peace: 'The Chancellor\'s Peace ended the war',
    chan_powers: 'Powers the Chancellery holds', chan_decrees: 'The Chancellery holds emergency decrees', chan_can_decree: 'Our Chancellor can rule by decree',
    decrees_used: 'The precedent of our decrees', decrees_reform: 'Reforms enacted by our decree', powers_returned_by_us: 'Powers our Chancellor returned to the Senate',
    chan_bureau: 'The Bureau has moved to the Chancellery', chan_holonet: 'The Chancellery controls the HoloNet', war_shadows_seen: 'War in the Shadows has happened',
    bureau_moles: 'The Bureau\'s hidden network is at work', by_decrees: 'Times another Chancellor ruled by decree', hc_decrees: 'The Hollow Crown came by decree',
    chp_gavel_state: 'The gavel (held, checked, suspended or none)', chp_guard_state: 'The Senate Guard power', chp_staff_state: 'The Chancellor\'s staff power',
    chp_decrees_state: 'The emergency decrees power', chp_army_state: 'The Grand Army power', chp_bureau_state: 'The Bureau of Intelligence power',
    chp_holonet_state: 'The HoloNet power', chp_term_state: 'The term without end', chp_jedi_state: 'The Jedi Council power', chp_banks_state: 'The banks power',
    chp_security_state: 'The Security Act power', chp_governors_state: 'The sector governors power',
    anti_cartel: 'The Anti-Cartel Act has passed', republic_bonds: 'The Republic borrows through Republic bonds',
    senators_expelled: 'The Senate has expelled its most corrupt members', intel_oversight: 'The Intelligence Oversight Act has passed',
    compor: 'The Commission for the Protection of the Republic exists', judicial_charter: 'The Judicial Forces Charter has passed',
    independent_speaker: 'The Senate has an independent Speaker', jedi_service_act: 'The Jedi Service Act has passed (no Jedi generals)',
    jedi_compact: 'A Senate-Jedi Compact has been signed', dereg_count: 'Times the Caucus has cut regulation',
    corporate_security: 'Corporate security will answer the Caucus in the Last Days', corporate_forces: 'Corporate security forces on our side',
    corp_donors_ready: 'Corporate donors are waiting to show their gratitude', jedi_affairs_timer: 'Turns until the Jedi Affairs card returns',
    hunt_informant: 'Hunt: Sate Pestage is our informant', hunt_frozen: 'Hunt: the Damask accounts are frozen', hunt_mapped: 'Hunt: compromised officers named',
    hunt_chips: 'Hunt: the clone order was found', hunt_routes: 'Hunt: the ways off Coruscant are watched', hunt_jedi: 'Hunt: the Jedi know the name',
    hunt_witnesses: 'Hunt: the witnesses are hidden', hunt_anakin_told: 'Hunt: Anakin was told the truth',
    cha_arrest_result: "Our Chancellor's arrest order: fled, arrested or resisted"
  };
  ['bureau', 'rim', 'corruption', 'powers', 'military', 'jedi', 'slavery', 'syndicates', 'hhc'].forEach(function (t) {
    NAMES['track_' + t] = 'Reform track level: ' + ({bureau: 'the bureaucracy', rim: 'the Rim', corruption: 'corruption', powers: 'emergency powers',
      military: 'the military', jedi: 'the Jedi', slavery: 'slavery', syndicates: 'the syndicates', hhc: 'High Human Culture'})[t];
  });
  ['rim', 'rfc', 'rimward', 'sec'].forEach(function (t) {
    NAMES[t + '_threat'] = 'A defection threat is running: ' + ({rim: 'the Rimward Coalition', rfc: 'the breakaway party', rimward: 'our Rimward wing', sec: 'the Security Bloc'})[t];
  });

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
