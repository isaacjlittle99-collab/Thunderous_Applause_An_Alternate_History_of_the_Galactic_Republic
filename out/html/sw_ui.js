/*
 * sw_ui.js - sidebar and chart HTML builders for "Thunderous Applause".
 * Builds strings only; the status scenes interpolate them.
 */
(function (g) {
  'use strict';
  var SW = g.SW;
  if (!SW) return;

  var LABELS = {
    level: [[15, 'very low'], [35, 'low'], [55, 'moderate'], [75, 'high'], [1e9, 'very high']],
    faith: [[25, '<b class="bad">collapsing</b>'], [40, '<b class="warn">shaken</b>'], [55, 'wavering'], [70, '<b class="good">steady</b>'], [1e9, '<b class="good">strong</b>']],
    relation: [[10, '<span class="bad">hostile</span>'], [25, '<span class="warn">cold</span>'], [40, 'cool'], [55, 'cordial'], [70, '<span class="good">warm</span>'], [1e9, '<span class="good">close</span>']],
    evidence: [[0.9, 'nothing'], [2.9, 'rumours'], [4.9, 'suspicions'], [7.9, 'circumstantial'], [9.9, 'compelling'], [1e9, '<b class="good">conclusive</b>']],
    resolve: [[0.9, 'complacent'], [2.9, 'uneasy'], [4.9, 'alarmed'], [6.9, 'determined'], [1e9, '<b class="good">defiant</b>']],
    powers: [[0, '<span class="good">constitutional</span>'], [2, 'extended mandate'], [4, '<span class="warn">wartime emergency</span>'], [6, '<span class="warn">sweeping</span>'], [8, '<b class="bad">near-absolute</b>'], [1e9, '<b class="bad">absolute</b>']],
    unease: [[0.99, 'business as usual'], [1.99, 'a vague disquiet'], [2.99, 'unease no one can name'], [3.99, '<span class="warn">a shadow over the Senate</span>'], [4.99, '<b class="bad">darkness clouds every vision</b>'], [1e9, '<b class="bad">the dark side is ascendant</b>']],
    sep: [[20, 'loyal'], [35, 'grumbling'], [50, '<span class="warn">disaffected</span>'], [65, '<b class="bad">seceding</b>'], [1e9, '<b class="bad">in revolt</b>']],
    strength: [[0.5, 'none'], [2, 'token'], [4, 'modest'], [6, 'substantial'], [8, 'strong'], [1e9, 'formidable']],
    ratio: [[0.6, '<b class="bad">hopeless</b>'], [0.9, '<span class="warn">outmatched</span>'], [1.1, 'evenly matched'], [1.6, '<span class="good">favourable</span>'], [1e9, '<b class="good">overwhelming</b>']],
    war: [[-7, '<b class="bad">catastrophic</b>'], [-3, '<span class="warn">losing ground</span>'], [-1, 'faltering'], [1, 'stalemate'], [4, '<span class="good">gaining ground</span>'], [7, '<span class="good">winning</span>'], [1e9, '<b class="good">nearly won</b>']],
    dissent: [[5, '<span class="good">united</span>'], [12, 'murmuring'], [22, 'restless'], [35, '<span class="warn">quarrelsome</span>'], [50, '<b class="bad">fractious</b>'], [1e9, '<b class="bad">on the verge of schism</b>']],
    cdissent: [[0.99, 'harmonious'], [1.99, 'grumbling'], [2.99, 'strained'], [3.99, '<span class="warn">fraying</span>'], [1e9, '<b class="bad">collapsing</b>']]
  };
  // Holocron: today's leaders, what drives them and what moves them
  SW.leadersHTML = function (Q) {
    var groups = (SW.CONTEST_BLOCS || []).filter(function (g) { return Q.parties.indexOf(g) >= 0; }).concat(SW.FACTIONS || []);
    var h = '';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i], id = Q[g + '_leader_id'], L = SW.LEADERS[id], mind = SW.LEADER_MINDS && SW.LEADER_MINDS[id];
      if (!L) continue;
      var gname = SW.FACTION_NAMES[g] ? 'the ' + SW.FACTION_NAMES[g] : 'the ' + SW.name(Q, g);
      h += '<p><b>' + L.name + '</b>, ' + gname + ' (' + SW.firmLabel(Q, g) + '; now ' + SW.leaderLine(Q, g).replace(' · ', ', ') + '). ';
      if (mind) {
        h += mind.motive;
        var plus = [], minus = [];
        for (var k = 0; k < mind.cares.length; k++) (mind.cares[k][1] > 0 ? plus : minus).push(mind.cares[k][2]);
        if (plus.length) h += ' <i>Pleased by:</i> ' + plus.join(', ') + '.';
        if (minus.length) h += ' <i>Angered by:</i> ' + minus.join(', ') + '.';
      }
      h += '</p>';
    }
    return h;
  };

  SW.label = function (type, v) {
    var t = LABELS[type];
    v = +v || 0;
    for (var i = 0; i < t.length; i++) if (v <= t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  };

  function row(k, v) { return '<div class="sb-row"><span class="sb-k">' + k + '</span><span class="sb-v">' + v + '</span></div>'; }
  function head(t) { return '<h1>' + t + '</h1>'; }
  function bar(v, max, cls) {
    var w = Math.max(0, Math.min(100, Math.round(100 * v / max)));
    return '<div class="meter"><div class="meter-fill ' + (cls || '') + '" style="width:' + w + '%"></div></div>';
  }
  // Bloc names are coloured text; on the light theme the pale colours need darker shades to stay readable.
  var LIGHT_TEXT = {rc: '#2f6fae', mod: '#7a6a2e', pal: '#b3141b', guild: '#9a6312', rim: '#c4520f', sec: '#56616b',
    ind: '#4c8459', cis: '#7a4aa8', rfc: '#a07410'};
  SW.textColor = function (b) {
    var dark = typeof document !== 'undefined' && document.body && document.body.classList.contains('dark-mode');
    return (!dark && LIGHT_TEXT[b]) || SW.color(b);
  };
  SW.span = function (Q, b, text) {
    return '<span class="bloc" style="color:' + SW.textColor(b) + '">' + (text || SW.name(Q, b)) + '</span>';
  };
  function bloc(Q, b) { return SW.span(Q, b); }

  SW.statusHTML = function (Q, tab) {
    if (!Q || !Q.started) return '<p class="sb-note">Begin a new game to see the state of the Republic.</p>';
    var h = '';
    switch (tab) {
      case 'main': h = mainTab(Q); break;
      case 'senate': h = senateTab(Q); break;
      case 'shadow': h = shadowTab(Q); break;
      case 'forces': h = forcesTab(Q); break;
      case 'polls': h = pollsTab(Q); break;
      case 'economy': h = economyTab(Q); break;
      case 'chancellery': h = chancelleryTab(Q); break;
    }
    return h;
  };

  function mainTab(Q) {
    var h = head(Q.date_label);
    h += row('Political capital', '<b>' + Q.capital + '</b>');
    var pos = Q.rc_chancellor ? '<b class="good">holds the Chancellery</b>' : (Q.rc_in_govt ? 'in government' : 'in opposition');
    h += row(bloc(Q, 'rc'), pos);
    if (Q.rc_in_govt) h += row('Coalition', Q.coalition_name + (Q.minority_govt && !/minority/i.test(Q.coalition_name || '') ? ' (minority)' : ''));
    if (Q.rc_in_govt) h += row(SW.isCaucusMinority(Q) ? 'Supporters\u2019 patience' : 'Coalition mood', SW.label('cdissent', Q.coalition_mood_v !== undefined ? Q.coalition_mood_v : Q.coalition_dissent));
    if (SW.isCaucusMinority(Q)) h += '<div class="sb-note">' + (Q.minority_support_n ? 'Relying on ' + Q.minority_support_names + '.' : 'No bloc has promised its support.') + '</div>';
    if (Q.rc_in_govt) h += row('Republic treasury', SW.round1(Q.treasury) + ' · debt ' + SW.round1(Q.debt || 0));
    var chairs = [];
    for (var i = 0; i < SW.COMMITTEES.length; i++) if (Q['chair_' + SW.COMMITTEES[i]] === 'rc') chairs.push(SW.COMMITTEE_NAMES[SW.COMMITTEES[i]]);
    if (chairs.length) h += row('Our chairs', chairs.join(', '));
    h += row('Caucus mood', SW.label('dissent', Q.dissent_percent));
    h += head('The Republic');
    h += row('Chancellor', '<span style="color:' + SW.textColor(Q.chancellor_bloc) + '">' + Q.chancellor + '</span>');
    h += row('Faith in the Republic', SW.label('faith', Q.faith)) + bar(Q.faith, 100, 'good-fill');
    h += row('Corruption', SW.label('level', Q.corruption)) + bar(Q.corruption, 100, 'bad-fill');
    h += row('Fear', SW.label('level', Q.fear)) + bar(Q.fear, 100, 'bad-fill');
    h += row('Outer Rim hardship', SW.label('level', Q.rim_hardship)) + bar(Q.rim_hardship, 100, 'bad-fill');
    h += row('Emergency powers', SW.label('powers', Q.emergency_powers)) + bar(Q.emergency_powers, 10, 'bad-fill');
    h += head('The Caucus');
    if (SW.rcLead && SW.rcLead(Q)) {
      h += row('Leading faction', SW.factionSpan(SW.rcLead(Q), SW.FACTION_NAMES[SW.rcLead(Q)]) + (Q.rc_chair ? ' <span class="sb-tag">chaired by ' + Q.rc_chair + '</span>' : ''));
      h += '<div class="sb-note">Our programme: ' + SW.PROGRAMME_TEXT[SW.rcLead(Q)] + '.</div>';
    }
    for (var j = 0; j < SW.FACTIONS.length; j++) {
      var f = SW.FACTIONS[j];
      h += row(SW.FACTION_NAMES[f], Math.round(Q[f + '_strength']) + '% · ' + SW.label('dissent', Q[f + '_dissent']));
      var led = (Q[f + '_leader'] && SW.firmLabel) ? 'Led by ' + Q[f + '_leader'] + ' (' + SW.firmLabel(Q, f) + '): ' + (SW.leaderLine ? SW.leaderLine(Q, f).replace(' · ', ', ') : '') + '.' : '';
      if (Q[f + '_unmet']) h += '<div class="sb-note warn">' + led + ' Restless: they want ' + Q[f + '_demand'] + '.</div>';
      else if (led) h += '<div class="sb-note">' + led + '</div>';
      if (f === 'rimward' && Q.rim_radical_word && !Q.rimward_split) h += '<div class="sb-note ' + ((Q.rim_radical || 0) >= 2 ? 'bad' : 'warn') + '">' + Q.rim_radical_word + '.</div>';
    }
    if (Q.hawks_split) h += '<p class="sb-note">The Hawks have broken away to the Security Bloc.</p>';
    if (Q.rimward_defected) h += '<p class="sb-note warn">Our Rimward wing has gone over to the Separatists.</p>';
    else if (Q.rimward_split) h += '<p class="sb-note">The Rimward wing has split off' + (Q.rfc_kind === 'rimward' ? ' as the ' + (Q.rfc_name || 'Rim Freedom Caucus') : ' to the Rimward Coalition') + '.</p>';
    if (SW.TRACKS) {
      h += head('Reforms');
      // each committee's reform paths, then those that cross the committees
      var groups = SW.COMMITTEES.concat(['']);
      for (var gi = 0; gi < groups.length; gi++) {
        var gc = groups[gi], first = true;
        for (var tk in SW.TRACKS) {
          var T = SW.TRACKS[tk];
          if ((T.committee || '') !== gc) continue;
          if (first) { h += '<div class="sb-note"><b>' + (gc ? SW.COMMITTEE_NAMES[gc] : 'Across the committees') + '</b>' + (gc && Q['chair_' + gc] === 'rc' ? ' (our chair)' : '') + '</div>'; first = false; }
          var lv = T.level(Q);
          var v = lv > 0 ? '<span class="good">' + (T.label ? T.label(Q) : T.steps[Math.min(lv, T.steps.length) - 1]) + '</span>' : '<span class="sb-dim">not begun</span>';
          h += row(T.name, v + ' · ' + lv + '/' + T.steps.length);
        }
      }
      if (Q.hutt_deal) h += '<p class="sb-note">The Hutt treaty puts the syndicates beyond the law.</p>';
    }
    return h;
  }

  function senateTab(Q) {
    var h = head('Senate composition');
    h += '<p class="sb-note">Seats as of the last session. ' + (Q.seceded_total ? Q.seceded_total + '% of delegations have seceded.' : '') + '</p>';
    var list = Q.parties.slice().sort(function (a, b) { return (Q[b + '_r'] || 0) - (Q[a + '_r'] || 0); });
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var mark = (Q.govt_blocs || []).indexOf(b) >= 0 ? ' ★' : ((Q.minority_support || []).indexOf(b) >= 0 ? ' ☆' : '');
      h += row(bloc(Q, b) + mark, (Q[b + '_r'] || 0).toFixed(1) + '%');
    }
    h += '<p class="sb-note">★ in the governing coalition (' + Q.govt_seats + '%).' + ((Q.minority_support || []).length ? ' ☆ supporting our minority government from outside it (' + SW.round1(SW.seats(Q, (Q.govt_blocs || []).concat(Q.minority_support))) + '% together).' : '') + '</p>';
    if (Q.merged_sec === 'pal') h += '<p class="sb-note warn">The Security Bloc has folded into the ' + SW.name(Q, 'pal') + '.</p>';
    if (Q.merged_rim === 'cis') h += '<p class="sb-note warn">The Rimward Coalition has gone over to the Separatists.</p>';
    if (Q.merged_rfc === 'cis') h += '<p class="sb-note warn">The ' + (Q.rfc_name || 'breakaway party') + ' has gone over to the Separatists.</p>';
    h += head('Our relations');
    for (var k = 0; k < Q.parties.length; k++) {
      var bb = Q.parties[k];
      if (bb === 'rc') continue;
      h += row(bloc(Q, bb), SW.label('relation', Q[bb + '_relation']));
      var ref = SW.leader ? (SW.leader(Q, bb).refuses || []).filter(function (x) { return Q.parties.indexOf(x) >= 0; }) : [];
      if (ref.length) h += '<div class="sb-note">' + Q[bb + '_leader'] + ' won\'t govern with the ' + ref.map(function (x) { return SW.name(Q, x); }).join(' or the ') + '.</div>';
      if ((bb === 'rim' || (bb === 'rfc' && Q.rfc_kind === 'rimward')) && Q.rim_radical_word) h += '<div class="sb-note ' + ((Q.rim_radical || 0) >= 2 ? 'bad' : 'warn') + '">' + Q.rim_radical_word + '.</div>';
    }
    // the Senate's permanent staff, shown like a bloc ("the true rulers of the Republic")
    h += row('The Senate bureaucracy', SW.label('relation', Q.bureau_relation));
    if (Q.bureau_relation < 25 && (Q.rc_in_govt || Q.rc_chairs > 0)) h += '<div class="sb-note warn">Our bills are being lost in committee.</div>';
    var dos = Q.bureau_dossier || 0;
    if (dos >= 0.5 && (Q.rc_in_govt || Q.rc_chairs > 0)) h += '<div class="sb-note ' + (dos >= 3 ? 'bad' : 'warn') + '">Their case against us: ' + (dos >= 5 ? '<b>ready to strike</b>' : (dos >= 3 ? 'half built' : 'gathering files')) + '.</div>';
    // relations between the other blocs: who will not sit together, and each bloc's closest ally
    if (SW.rel) {
      h += head('Between the blocs');
      var others = Q.parties.filter(function (b) { return b !== 'rc' && SW.REL_BLOCS.indexOf(b) >= 0; });
      var cold = [], warm = [];
      for (var ia = 0; ia < others.length; ia++) {
        var a = others[ia];
        h += row(bloc(Q, a), SW.stanceWord(SW.firm(Q, a)) + ', needs ' + SW.joinWord(Q, a));
        for (var ib = ia + 1; ib < others.length; ib++) {
          var bb2 = others[ib], v = SW.rel(Q, a, bb2);
          var pair = SW.name(Q, a) + ' and ' + SW.name(Q, bb2) + ' (' + SW.relWord(v) + ')';
          if (!SW.relOk(Q, a, bb2)) cold.push(pair); else warm.push({t: pair, v: v});
        }
      }
      warm.sort(function (x, y) { return y.v - x.v; });
      if (warm.length) h += '<div class="sb-note"><b>Warmest ties:</b> ' + warm.slice(0, 3).map(function (x) { return x.t; }).join('; ') + '.</div>';
      h += '<div class="sb-note' + (cold.length ? ' warn' : '') + '">' + (cold.length ? '<b>Will not govern together:</b> ' + cold.join('; ') + '.' : 'Every pair of blocs could, in principle, govern together.') + '</div>';
    }
    if (SW.BLOC_WINGS) {
      h += head('Party wings');
      for (var wi = 0; wi < SW.CONGRESS_BLOCS.length; wi++) {
        var wb = SW.CONGRESS_BLOCS[wi];
        if (!SW.hasWings(Q, wb)) continue;
        var rw = Q[wb + '_wing'], ws = SW.blocWings(Q, wb).slice().sort(function (x, y) { return SW.wingShare(Q, y) - SW.wingShare(Q, x); });
        var who = wb === 'pal' && !Q.pal_leader_id ? 'Palpatine' + (Q.pal_lieutenant ? ', with ' + Q.pal_lieutenant : '') : (Q[wb + '_leader'] || '');
        h += row(bloc(Q, wb), (rw ? SW.wingSpan(rw) : '—') + (who ? ' <span class="sb-tag">' + who + '</span>' : ''));
        h += '<div class="sb-note">' + ws.map(function (w) {
          var s = SW.wingShare(Q, w);
          return SW.wingSpan(w) + ' ' + (s >= 45 ? 'dominant' : (s >= 30 ? 'strong' : (s >= 15 ? 'middling' : 'weak'))) + (w === rw ? ' (ruling)' : '');
        }).join(' · ') + '.' + (Q[wb + '_congress_quiet'] ? ' Its last congress re-elected its leader unopposed.' : '') +
          ' Next congress ' + (Q[wb + '_congress_due'] > Q.date ? 'in ' + (33 - Math.floor(Q[wb + '_congress_due'] / 12)) + ' BBY' : 'soon') + '.</div>';
      }
    }
    h += head('Committee chairs');
    for (var c = 0; c < SW.COMMITTEES.length; c++) {
      var cm = SW.COMMITTEES[c];
      h += row(SW.COMMITTEE_NAMES[cm], bloc(Q, Q['chair_' + cm]) + (Q['chair_res_' + cm] ? ' <span class="sb-tag">promised</span>' : ''));
      var mn = Q['minister_' + cm + '_name'], act = Q['chair_' + cm] !== 'rc' && Q['ministry_act_by_' + cm] === Q['chair_' + cm] ? Q['ministry_act_' + cm] : '';
      if (mn) h += '<div class="sb-note">Chaired by ' + mn + (act ? '. Lately, it ' + act : '') + '.</div>';
    }
    var pls = SW.pledgeList ? SW.pledgeList(Q) : [];
    h += head('Our pledges');
    if (pls.length) for (var pi = 0; pi < pls.length; pi++) h += '<div class="sb-note">' + pls[pi] + '</div>';
    else h += '<p class="sb-note">None.</p>';
    return h;
  }

  function shadowTab(Q) {
    var h = head('The shadow');
    h += row('In the corridors', SW.label('unease', Q.unease));
    // the search for the Sith: what the Caucus knows, and the proof it has
    var stage = Q.sith_stage || 0;
    h += row('The search for the Sith', (SW.STAGE_NAMES ? SW.STAGE_NAMES[stage] : '') || '');
    h += row('Our proof', SW.label('evidence', Q.evidence)) + bar(Q.evidence, 12, 'good-fill');
    if (stage === 3 && SW.SUSPECT_IDS) {
      h += '<div class="sb-note">The shortlist:</div>';
      for (var si = 0; si < SW.SUSPECT_IDS.length; si++) {
        var sid = SW.SUSPECT_IDS[si], cleared = Q['suspect_' + sid];
        h += '<div class="sb-check ' + (cleared ? 'on' : 'off') + '">' + (cleared ? '✔ ' : '○ ') + SW.SUSPECTS[sid].name + (cleared ? ' (cleared)' : '') + '</div>';
      }
    }
    if (stage === 4 && !Q.sidious_defeated) {
      h += row('The Sith Lord', '<b class="bad">' + (Q.pal_title || 'Palpatine') + '</b>' + (Q.sidious_known ? '' : ', known to the Caucus'));
      h += row('His alarm', (Q.sith_alarm || 0) >= 5 ? '<b class="bad">' + SW.alarmWord(Q) + '</b>' : ((Q.sith_alarm || 0) >= 2 ? '<span class="warn">' + SW.alarmWord(Q) + '</span>' : SW.alarmWord(Q)));
      var ops = [['hunt_informant', 'An informant inside'], ['hunt_frozen', 'His accounts frozen'], ['hunt_mapped', 'Compromised officers named'], ['hunt_chips', 'The clone order found'],
        ['hunt_routes', 'The ways off Coruscant watched'], ['hunt_jedi', 'The Jedi know'], ['hunt_witnesses', 'The witnesses hidden']];
      for (var oi = 0; oi < ops.length; oi++) if (Q[ops[oi][0]]) h += '<div class="sb-check on">✔ ' + ops[oi][1] + '</div>';
    }
    h += row('Jedi suspicion', SW.label('resolve', Q.jedi_suspicion)) + bar(Q.jedi_suspicion, 10, 'good-fill');
    h += row('Senate resolve', SW.label('resolve', Q.senate_resolve)) + bar(Q.senate_resolve, 10, 'good-fill');
    h += row('Emergency powers', SW.label('powers', Q.emergency_powers)) + bar(Q.emergency_powers, 10, 'bad-fill');
    if (Q.misfortunes && Q.misfortunes.length) {
      h += head('Recent misfortunes');
      for (var mf = Q.misfortunes.length - 1; mf >= 0; mf--) h += '<div class="sb-note">' + Q.misfortunes[mf] + '.</div>';
    }
    if (Q.evidence >= 6 && Q.bureau_captured > 0) h += '<p class="sb-note warn">The bureaucracy\'s payroll leads to ' + (Q.sith_named ? (Q.pal_office || 'the Chancellery') : 'someone in the Senate\'s inner circle') + '.</p>';
    else if (Q.evidence >= 6) h += '<p class="sb-note">The bureaucracy\'s payroll leads to the Trade Federation, and through it to someone else.</p>';
    h += head('Safeguards');
    var reforms = [
      ['emergency_sunset', 'Sunset clauses on emergency powers'],
      ['term_limits_protected', 'Chancellor\'s term limit entrenched'],
      ['army_oversight', 'Senate oversight of the army'],
      ['senate_guard_reformed', 'Senate Guard answers to the Senate'],
      ['jedi_independence', 'Jedi Order independent of the Chancellor'],
      ['banking_independent', 'Banking Clan independent of the Chancellery'],
      ['rim_enfranchised', 'Outer Rim fully represented'],
      ['anti_corruption', 'Senate Ethics Commission'],
      ['chips_removed', 'Clone inhibitor chips removed']
    ];
    for (var i = 0; i < reforms.length; i++) {
      var on = Q[reforms[i][0]];
      var label = reforms[i][1];
      // with no clone army there is nothing to oversee and no chips to remove
      if (!Q.kamino_army && reforms[i][0] === 'army_oversight') { on = 1; label = 'The clone army was disbanded'; }
      if (!Q.kamino_army && reforms[i][0] === 'chips_removed') continue;
      h += '<div class="sb-check ' + (on ? 'on' : 'off') + '">' + (on ? '✔ ' : '○ ') + label + '</div>';
    }
    return h;
  }

  function forcesTab(Q) {
    var h = head(Q.war ? 'The ' + (Q.war_name || 'Clone Wars') : 'Peace and its enemies');
    if (Q.war) {
      h += row('The war as a whole', SW.label('war', Q.war_balance));
      if (SW.FRONTS) {
        for (var fi = 0; fi < SW.FRONTS.length; fi++) {
          var fr = SW.FRONTS[fi];
          h += row(SW.FRONT_SHORT[fr], SW.label('war', SW.front(Q, fr)) + (Q.war_priority === fr ? ' ★' : ''));
        }
        h += '<p class="sb-note">★ marks this season\'s priority.</p>';
      }
      if (Q.war_aim_text) h += row('War aim', Q.war_aim_text);
      h += row('Strategy set by', SW.warCommand && SW.warCommand(Q) ? '<span class="good">the Caucus</span>' : 'the Chancellor\'s War Council');
      h += row('War-weariness', SW.label('level', Q.war_weariness)) + bar(Q.war_weariness, 100, 'bad-fill');
    }
    if (Q.war) {
      var ws = Q.war_state || (SW.warStateWord ? SW.warStateWord(Q) : '');
      if (ws) h += row('How the war stands', ws === 'won' ? '<span class="good">being won</span>' : (ws === 'lost' ? '<b class="bad">being lost</b>' : '<span class="warn">in the balance</span>'));
      h += row('Republic against Confederacy', SW.label('ratio', Q.war_ratio));
      if (Q.worlds_lost_list) h += row('Worlds held by the Separatists', '<span class="bad">' + Q.worlds_lost_list + '</span>');
    }
    if (Q.date >= 24 && !Q.war_won && !Q.federal_compact) h += row('The Separatist cause', Q.sep_growing ? '<span class="warn">gathering strength</span>' : '<span class="good">held back</span>');
    if (Q.sidious_fled) h += row('The Confederacy\'s master', '<b class="bad">Darth Sidious</b>');
    h += row('Outer Rim separatism', SW.label('sep', Q.outer_sep));
    h += row('Mid Rim separatism', SW.label('sep', Q.midrim_sep));
    h += row('Corporate separatism', SW.label('sep', Q.corporate_sep));
    if (Q.seceded_total) h += row('Delegations seceded', Q.seceded_total + '%');
    h += head('Who would stand with the Senate?');
    h += row('Jedi Order', SW.label('strength', Q.jedi_strength) + ' · trust ' + SW.label('level', Q.jedi_standing));
    h += row('Judicial Forces', SW.label('strength', Q.judicial_forces));
    h += row('Member-world forces', SW.label('strength', Q.member_forces) + (Q.pact_formed ? ' (Defence Pact)' : ''));
    if (Q.clones > 0) h += row('Clone army', SW.label('strength', Q.clones) + (Q.army_oversight ? ' · Senate oversight' : ''));
    if (Q.clones > 0) h += row('Navy loyalty to the Senate', SW.label('level', Q.navy_loyalty));
    h += row('Senate Guard', Q.senate_guard_reformed ? '<span class="good">loyal to the Senate</span>' : 'answers to the Chancellor');
    h += row('Balance, if it came to it', SW.label('ratio', Q.force_ratio));
    h += '<p class="sb-note">A rough estimate of loyal forces against everyone who might obey the Chancellor alone.</p>';
    return h;
  }

  function economyTab(Q) {
    var h = head('The Republic\'s purse');
    h += row('Treasury', SW.round1(Q.treasury));
    h += row('Debt to the Banking Clan', SW.round1(Q.debt || 0) + ' · ' + SW.debtLabel(Q.debt || 0));
    h += row('Interest a year', SW.interestDue(Q));
    h += row('Hyperlane trade', SW.tradeLabel(Q.trade || 60)) + bar(Q.trade || 60, 100, 'good-fill');
    if ((Q.inflation || 0) >= 5) h += row('Inflation', SW.inflationLabel(Q.inflation)) + bar(Q.inflation, 100, 'bad-fill');
    h += head('Who pays, and who pays back');
    var gp = Q.guild_patience === undefined ? 60 : Q.guild_patience;
    h += row('The guilds\' patience', SW.guildPatienceLabel(gp)) + bar(gp, 100, gp < 35 ? 'bad-fill' : 'good-fill');
    if (Q.guild_hold > 0) h += row('Debts to guild donors', '<span class="warn">' + Q.guild_hold + '</span>');
    if (gp < 60 && Q.guild_patience_why) h += '<div class="sb-note' + (gp < 35 ? ' bad' : ' warn') + '">Angered by ' + Q.guild_patience_why + '. ' + SW.guildNextStep(Q) + (Q.guild_lobby ? ' Guild lobbyists are working against our bills.' : '') + '</div>';
    var pg = Q.patrons_goodwill === undefined ? 60 : Q.patrons_goodwill;
    h += row('Our Core patrons', SW.patronsLabel(pg) + (Q.patron_adj ? ' · ' + (Q.patron_adj > 0 ? '+' : '') + Q.patron_adj + ' capital a year' : ''));
    if ((Q.rim_donors || 0) >= 1) h += row('Rim grassroots donors', '+' + Math.floor(Q.rim_donors) + ' capital a year');
    var tired = [];
    for (var src in SW.REVENUE) if (src !== 'none' && (Q['rev_streak_' + src] || 0) >= 2) tired.push(SW.REVENUE[src].name + ' (' + Q['rev_streak_' + src] + ' years running)');
    if (tired.length) h += '<div class="sb-note warn">Tax fatigue: ' + tired.join(', ') + '.</div>';
    if (Q.budget_defeats) h += '<div class="sb-note bad">Our last budget was defeated. Another defeat ' + (Q.rc_chancellor && !Q.constructive_vonc ? 'would bring the government down.' : 'would shake the coalition again.') + '</div>';
    if (Q.budgets) {
      h += head('Last budget');
      h += '<div class="sb-note">Raised through ' + Q.bd_rev_name + '; spent on ' + Q.bd_pri_name + '. ' + Q.bd_summary + '.</div>';
    }
    h += '<div class="sb-note">' + (SW.budgetWriter(Q) ? '<span class="good">The Caucus writes the next budget.</span>' : 'The government writes the next budget; the Caucus can support it, oppose it, or (in government) amend it.') + '</div>';
    h += head('Markets');
    h += row('Bacta (Thyferra)', SW.marketLabel(Q.bacta || 0)) + bar(Q.bacta || 0, 100, 'bad-fill');
    h += row('Tibanna gas (Bespin)', SW.marketLabel(Q.tibanna || 0)) + bar(Q.tibanna || 0, 100, 'bad-fill');
    h += row('Spice (Kessel)', SW.marketLabel(Q.spice || 0) + (Q.spice_legal ? ' · legal' : '')) + bar(Q.spice || 0, 100, 'bad-fill');
    return h;
  }

  function pollsTab(Q) {
    var h = head('Delegation alignment');
    h += '<p class="sb-note">Current alignment if the Senate sat today.</p>';
    var list = Q.parties.slice().sort(function (a, b) { return (Q[b + '_votes'] || 0) - (Q[a + '_votes'] || 0); });
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var d = (Q[b + '_votes'] || 0) - (Q[b + '_r'] || 0);
      var arrow = d > 0.4 ? ' <span class="good">▲</span>' : (d < -0.4 ? ' <span class="bad">▼</span>' : '');
      h += row(bloc(Q, b), (Q[b + '_votes'] || 0).toFixed(1) + '%' + arrow);
    }
    h += head('Who leads each region');
    h += SW.regionMapSvg(Q);
    h += head('Our support by region');
    for (var r = 0; r < SW.REGIONS.length; r++) {
      var rg = SW.REGIONS[r];
      var grv = Q['grievance_' + rg] || 0;
      h += row(SW.REGION_NAMES[rg], (Q[rg + '_rc_share'] || 0) + '%' + (grv >= 3 ? ' <span class="' + (grv >= 5 ? 'bad' : 'warn') + '">aggrieved</span>' : ''));
    }
    h += head('The campaign');
    var recs = (Q.support_records || []).slice(-8);
    if (recs.length > 1) {
      var vals = recs.map(function (x) { return x.rc || 0; });
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), ticks = '▁▂▃▄▅▆▇█';
      var spark = vals.map(function (v) { return ticks.charAt(hi - lo < 0.5 ? 3 : Math.round(7 * (v - lo) / (hi - lo))); }).join('');
      h += row('Our trend (two years)', '<span class="spark">' + spark + '</span> ' + vals[0].toFixed(1) + '% → ' + vals[vals.length - 1].toFixed(1) + '%');
    }
    h += row('Momentum', SW.momentumLabel(Q.rc_momentum || 0));
    if (Q.momentum_why) h += '<div class="sb-note' + (Q.momentum_why_sign < 0 ? ' warn' : '') + '">Last: ' + Q.momentum_why + '.</div>';
    var nextE = Q.election_suspended ? 'suspended' : (Q.next_election_date > Q.date ? 'in ' + (Q.next_election_date - Q.date) + ' months' : 'due');
    h += row('Next Chancellor election', nextE + (Q.election_season ? ' · <span class="good">election season</span>' : ''));
    if (Q.election_season && SW.whipText) h += SW.whipText(Q);
    if (Q.wv_ready && Q.wv_name) h += row('Coming vote', Q.wv_name);
    if (Q.ref_ready && Q.ref_world) h += row('Referendum', Q.ref_world + ': ' + (Q.ref_poll_word || ''));
    return h;
  }

  function chancelleryTab(Q) {
    var h = head('The office');
    h += '<div class="figure"><div class="figure-name" style="color:' + SW.textColor(Q.chancellor_bloc) + '">' + Q.chancellor_title + ' ' + Q.chancellor + '</div>';
    h += '<div class="figure-sub">' + SW.name(Q, Q.chancellor_bloc) + '</div></div>';
    h += row('Vice Chair', Q.vice_chair);
    h += head('Bloc leaders');
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      var tag = (SW.CONTEST_BLOCS && SW.CONTEST_BLOCS.indexOf(b) >= 0 && SW.firmLabel) ? ' <span class="sb-tag">' + SW.firmLabel(Q, b) + '</span>' : '';
      var wingTag = SW.wingLine && SW.wingLine(Q, b) ? ' · ' + SW.wingSpan(Q[b + '_wing']) : '';
      var nm = b === 'pal' && !Q.pal_leader_id ? 'Palpatine' : (Q[b + '_leader'] || '—');
      h += row(bloc(Q, b), nm + wingTag + tag);
      if (b === 'pal' && !Q.pal_leader_id && Q.pal_lieutenant) h += '<div class="sb-note">His lieutenant: ' + Q.pal_lieutenant + '.</div>';
      if (SW.CONTEST_BLOCS && SW.CONTEST_BLOCS.indexOf(b) >= 0 && SW.leaderLine) {
        var mood = SW.leaderMood(Q, b).score;
        h += '<div class="sb-note' + (mood <= -3 ? ' bad' : (mood <= -1 ? ' warn' : '')) + '">' + SW.leaderLine(Q, b) + '</div>';
      }
    }
    if (SW.rcLead && SW.rcLead(Q) && Q.rc_chair) h += row('Caucus chair', Q.rc_chair + ' · ' + SW.factionSpan(SW.rcLead(Q), SW.FACTION_NAMES[SW.rcLead(Q)]));
    h += head('Our advisors');
    var any = false;
    for (var a in SW.ADVISOR_NAMES) {
      if (Q['adv_' + a]) { h += row(SW.ADVISOR_NAMES[a], SW.FACTION_NAMES[SW.ADVISOR_FACTION[a]]); any = true; }
    }
    if (!any) h += '<p class="sb-note">No advisors. Use Shuffle Leadership.</p>';
    if (Q.anakin_found) {
      h += head('Persons of interest');
      h += row('Anakin Skywalker', Q.anakin_jedi ? (Q.padme_married ? 'Jedi Knight (secretly married)' : 'Jedi') : 'Padawan');
      if (!Q.anakin_fallen) h += row('What holds him', Q.anakin_anchor ? Q.anakin_anchor_name : '<span class="warn">' + (Q.anakin_anchor_name || 'Nothing') + '</span>');
      if (Q.dooku_left && !Q.dooku_dead) h += row('Count Dooku', Q.dooku_movement ? 'Head of the Confederacy' : 'Former Jedi, Count of Serenno');
      if (Q.quigon_alive) h += row('Qui-Gon Jinn', 'Jedi Master');
    }
    return h;
  }


  // Achievements, legacy and summary ----------------------------------------
  SW.ACHIEVEMENTS = [
    ['ending_reborn', 'The Republic Reborn', 'Stop the Sith and restore the Senate\'s authority.'],
    ['ending_endures', 'The Republic Endures', 'Stop the Sith, even if the Republic is left fragile.'],
    ['ending_blood', 'Victory in Blood', 'Win the war for the Republic.'],
    ['ending_divided', 'The Galaxy Divided', 'Keep a Free Republic alive against the Empire.'],
    ['ending_protectorate', 'The Jedi Protectorate', 'See the Jedi rule the Republic.'],
    ['ending_admirals', 'The Admirals\' Republic', 'Destroy the Sith Lord but not his powers.'],
    ['ending_hollow_crown', 'The Hollow Crown', 'Become what you fought.'],
    ['ending_confederacy', 'Confederacy Triumphant', 'Lose the Clone Wars.'],
    ['ending_endless_war', 'The Endless War', 'End the game with the Clone Wars still raging and neither side able to win.'],
    ['ending_dissolved', 'A Republic Dissolved', 'Let the Separatists go in peace.'],
    ['ending_sith_confederacy', 'The Sith Confederacy', 'Let the Sith Lord escape to a Confederacy strong enough to win.'],
    ['ending_republic_falls', 'The Fall of the Republic', 'Lose the Republic to the Separatist armies.'],
    ['ending_empire', 'The Galactic Empire', 'So this is how liberty dies.'],
    ['caucus_chancellor', 'A Reformer in the Chair', 'Elect a Caucus Supreme Chancellor.'],
    ['term_limit_held', 'Two Terms Means Two Terms', 'Stop the Chancellor\'s term from being extended.'],
    ['sunset', 'Sunset Clause', 'Pass the Sunset Amendment.'],
    ['oversight', 'Civilian Control', 'Bring the clone army under Senate oversight.'],
    ['kamino_early', 'The Missing Planet', 'Find Kamino before the war.'],
    ['no_army', 'No Army of Clones', 'Decommission the clone army.'],
    ['false_flag', 'Fire and Lies', 'Expose the attack on Coruscant as a provocation.'],
    ['gunray_convicted', 'Justice for Naboo', 'Convict Nute Gunray.'],
    ['trust_buster', 'Trust Buster', 'Break up the Trade Federation.'],
    ['abolition', 'No More Chains', 'Abolish slavery in Hutt space.'],
    ['shmi_free', 'A Mother\'s Freedom', 'Free Shmi Skywalker by enforcing abolition.'],
    ['assembly', 'A Parliament for the Rim', 'Found the Rim Assembly.'],
    ['amedda', 'Out of Order', 'Arrest Vice Chair Mas Amedda.'],
    ['syndicates', 'The End of an Age', 'Break the syndicates.'],
    ['hhc', 'All Sentient Beings', 'Discredit High Human Culture.'],
    ['new_jedi_order', 'A New Jedi Order', 'Help the Jedi remake their Order around Anakin Skywalker.'],
    ['enfranchised', 'A Voice for the Rim', 'Give the Outer Rim full representation.'],
    ['defence_pact', 'Free Worlds', 'Found the Free Worlds Defence Pact.'],
    ['citizens', 'Brothers and Citizens', 'Grant citizenship to the clone troopers.'],
    ['fives', 'The Warning Heeded', 'Shelter Fives and uncover the chips.'],
    ['chips_removed', 'Free Will', 'Remove every inhibitor chip.'],
    ['federal_compact', 'The Federal Compact', 'End the Clone Wars with a negotiated peace.'],
    ['dooku_turned', 'The Apprentice\'s Betrayal', 'Turn Count Dooku against his master.'],
    ['delegation', 'The Two Thousand', 'Form the Delegation of 2000.'],
    ['unmasked', 'J\'accuse', 'Unmask Darth Sidious before the Senate.'],
    ['restoration', 'Restoration', 'Repeal every emergency power after the Sith fall.'],
    ['anakin_saved', 'The Chosen One', 'End the game with Anakin Skywalker still a Jedi.']
  ];

  SW.achievementsHTML = function (Q, onlyThisGame) {
    var h = '<table class="ach-table">';
    var got = 0;
    for (var i = 0; i < SW.ACHIEVEMENTS.length; i++) {
      var a = SW.ACHIEVEMENTS[i];
      var have = onlyThisGame ? Q['game_achievement_' + a[0]] : Q['achievement_' + a[0]];
      if (have) got++;
      if (onlyThisGame && !have) continue;
      h += '<tr class="' + (have ? 'ach-on' : 'ach-off') + '"><td>' + (have ? '★' : '☆') + '</td><td><b>' + a[1] + '</b><br><span class="achievement_subtitle">' + a[2] + '</span></td></tr>';
    }
    h += '</table>';
    if (!onlyThisGame) h = '<p>' + got + ' of ' + SW.ACHIEVEMENTS.length + ' achievements unlocked.</p>' + h;
    else if (!got) h = '<p class="sb-note">No achievements this game.</p>';
    return h;
  };

  SW.legacyHTML = function (Q) {
    var cards = [
      [Q.slavery_abolished, 'Slavery abolished', 'The slave markets of Hutt space are closed, and those freed will remember who freed them.'],
      [Q.rim_enfranchised, 'The Rim enfranchised', 'The Outer Rim has the voice in the Senate it was denied for a thousand years.'],
      [Q.tf_broken_up, 'The Trade Federation broken up', 'No single guild will ever again command battleships.'],
      [Q.banking_independent || Q.banking_reformed >= 1, 'The banks reformed', 'The Banking Clan is audited, independent and answerable to the law.'],
      [Q.clone_citizenship, 'Clones as citizens', 'Every clone trooper is a citizen of the Republic, with a name and a future.'],
      [Q.jedi_reformed || Q.jedi_independence, 'The Jedi renewed', 'The Order is independent, and wiser about the hearts of its Knights.'],
      [Q.anakin_found && !Q.anakin_fallen && Q.anakin_fall < 8, 'Anakin Skywalker, Jedi Knight', 'The Chosen One never became Darth Vader.'],
      [Q.padme_alive, 'Padmé Amidala lives', 'Senator Amidala lives to see what comes next, and helps to build it.'],
      [Q.anti_corruption, 'An honest Senate', 'The Senate Ethics Commission keeps watch.'],
      [Q.federal_compact, 'The Federal Compact', 'The war ended at the negotiating table, not on a battlefield.']
    ];
    var h = '';
    for (var i = 0; i < cards.length; i++) if (cards[i][0]) h += '<div class="legacy"><b>' + cards[i][1] + '.</b> ' + cards[i][2] + '</div>';
    return h || '<p class="sb-note">The Caucus leaves no lasting reforms behind.</p>';
  };

  SW.summaryHTML = function (Q) {
    var h = '<div class="panel">';
    h += 'Final date: ' + Q.date_label + '<br>';
    h += 'Chancellor: ' + Q.chancellor + '<br>';
    h += 'Ruusan Caucus: ' + (Q.rc_r || 0).toFixed(1) + '% of the Senate<br>';
    h += 'Faith in the Republic: ' + SW.label('faith', Q.faith) + '<br>';
    h += 'Corruption: ' + SW.label('level', Q.corruption) + '<br>';
    h += 'Emergency powers: ' + SW.label('powers', Q.emergency_powers) + '<br>';
    h += 'Our evidence: ' + SW.label('evidence', Q.evidence) + '<br>';
    h += 'Delegations seceded: ' + (Q.seceded_total || 0) + '%';
    return h + '</div>';
  };

  // Charts --------------------------------------------------------------
  SW.drawSenate = function (Q, svgId) {
    if (typeof document === 'undefined' || typeof d3 === 'undefined') return;
    var el = document.getElementById(svgId);
    if (!el) return;
    var width = 500, height = 500;
    var content = document.getElementById('content');
    var screenWidth = content ? content.offsetWidth : 500;
    if (screenWidth < width - 50) { width = screenWidth - 50; height = width; el.style.height = (screenWidth / 2) + 'px'; el.style.width = width + 'px'; }
    var parliament = d3.parliament();
    parliament.width(width).height(height).innerRadiusCoef(0.4);
    parliament.enter.fromCenter(true).smallToBig(true);
    parliament.exit.toCenter(false).bigToSmall(true);
    d3.select('#' + svgId).datum(SW.parliamentData(Q)).call(parliament);
  };

  // a congress's delegates, wing by wing, as a hemicycle
  SW.drawCongress = function (Q, svgId) {
    if (typeof document === 'undefined' || typeof d3 === 'undefined' || !d3.parliament) return;
    var el = document.getElementById(svgId);
    if (!el || !(Q.cg_chart && Q.cg_chart.length)) return;
    var width = 500, height = 500;
    var content = document.getElementById('content');
    var screenWidth = content ? content.offsetWidth : 500;
    if (screenWidth < width - 50) { width = screenWidth - 50; height = width; el.style.height = (screenWidth / 2) + 'px'; el.style.width = width + 'px'; }
    var parliament = d3.parliament();
    parliament.width(width).height(height).innerRadiusCoef(0.4);
    parliament.enter.fromCenter(true).smallToBig(true);
    parliament.exit.toCenter(false).bigToSmall(true);
    d3.select('#' + svgId).datum(Q.cg_chart).call(parliament);
  };

  SW.drawHistory = function (Q, svgId, which) {
    if (typeof document === 'undefined' || typeof d3 === 'undefined' || !d3.linegraph) return;
    var el = document.getElementById(svgId);
    if (!el) return;
    var recs = which === 'senate' ? (Q.senate_records || []) : (Q.support_records || []);
    if (recs.length < 2) return;
    var setup = SW.lineSetup(Q);
    var width = 500;
    var content = document.getElementById('content');
    if (content && content.offsetWidth < width - 50) { width = content.offsetWidth - 50; el.style.width = width + 'px'; }
    var lines = d3.linegraph({noTicks: true, noDots: which !== 'senate', keys: setup.keys, colors: setup.colors, names: setup.names, tickFormat: SW.tickLabel});
    lines.width(width).height(320);
    d3.select('#' + svgId).datum(recs).call(lines);
  };

  // ------------------------------------------------------------------ the galaxy map: who leads each region
  // A schematic of the background map (tools/gen_map.js): off-centre bands around the Deep Core,
  // with the Corporate Sector as a territory in the north-east.
  var MAP = {w: 240, h: 150, cx: 126, cy: 75, ux: 10.47, uy: 6.86};
  var MAP_REGIONS = [
    // id, outer radius, inner radius (grid units), label, label x, label y
    ['outer', 10.6, 7.0, 'Outer Rim', 58, 120],
    ['midrim', 7.0, 4.1, 'Mid Rim', 126, 113],
    ['colonies', 4.1, 1.9, 'Colonies', 126, 55],
    ['core', 1.9, 0, 'Core', 126, 78]
  ];
  var CORPORATE = {cx: 214, cy: 33, rx: 19, ry: 12.5, label: 'Corporate', lx: 214, ly: 36};
  var MAP_STARS = (function () {
    var s = 7, out = [];
    var rnd = function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (var i = 0; i < 46; i++) out.push([rnd() * MAP.w, rnd() * MAP.h, 0.3 + rnd() * 0.6, 0.25 + rnd() * 0.5]);
    return out;
  }());

  function ellipsePath(cx, cy, rx, ry) {
    return 'M' + (cx - rx).toFixed(1) + ',' + cy + 'a' + rx.toFixed(1) + ',' + ry.toFixed(1) + ' 0 1,0 ' + (2 * rx).toFixed(1) + ',0' +
      'a' + rx.toFixed(1) + ',' + ry.toFixed(1) + ' 0 1,0 ' + (-2 * rx).toFixed(1) + ',0Z';
  }
  function escAttr(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Delegations in a region by bloc, rounded so they add up to the region's total.
  SW.regionBreakdown = function (Q, r) {
    var parties = (Q.parties || []).slice();
    var total = 0, i;
    for (i = 0; i < parties.length; i++) total += Math.max(0, Q[r + '_' + parties[i]] || 0);
    var delegations = Math.round((Q[r] > 0 ? Q[r] : 0) * 20);
    var rows = parties.map(function (b) {
      var share = total > 0 ? Math.max(0, Q[r + '_' + b] || 0) / total : 0;
      return {bloc: b, share: share, exact: share * delegations};
    });
    var used = 0;
    rows.forEach(function (x) { x.n = Math.floor(x.exact); used += x.n; });
    rows.slice().sort(function (a, b) { return (b.exact - b.n) - (a.exact - a.n); }).slice(0, Math.max(0, delegations - used)).forEach(function (x) { x.n++; });
    rows.sort(function (a, b) { return b.share - a.share; });
    var seceded = Math.round((SW.BASE_WEIGHTS[r] || 0) * (Q[r + '_seceded'] || 0) * 20);
    return {region: r, delegations: delegations, seceded: seceded, rows: rows, leader: rows.length && rows[0].share > 0 ? rows[0].bloc : null};
  };

  SW.regionTip = function (Q, r) {
    var d = SW.regionBreakdown(Q, r);
    var h = '<div class="rm-tip-head"><b>' + SW.REGION_NAMES[r] + '</b> · ' + d.delegations + ' delegations</div><table>';
    d.rows.forEach(function (x) {
      if (x.share < 0.005) return;
      h += '<tr><td><i class="rm-sw" style="background:' + SW.color(x.bloc) + '"></i>' + SW.name(Q, x.bloc) + '</td><td>' + x.n + '</td><td>' +
        Math.round(100 * x.share) + '%</td></tr>';
    });
    h += '</table>';
    if (d.seceded > 0) h += '<div class="rm-tip-note">' + d.seceded + ' delegations have left the Republic.</div>';
    var p = Q['cm_presence_' + r] || 0;
    if (p > 1) h += '<div class="rm-tip-note">The Caucus has campaigned here ' + (p >= 6 ? 'recently' : 'in the past') + '.</div>';
    return h;
  };

  SW.regionMapSvg = function (Q, opts) {
    opts = opts || {};
    var id = 'rm' + Math.floor(Math.random() * 1e6);
    var h = '<svg class="region-map-svg" viewBox="0 0 ' + MAP.w + ' ' + MAP.h + '" role="group" aria-label="The galaxy by region, shaded by the leading bloc">';
    h += '<defs><pattern id="' + id + 'h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line x1="0" y1="0" x2="0" y2="5" stroke="#0b0d14" stroke-width="2" stroke-opacity="0.55"/></pattern>' +
      '<radialGradient id="' + id + 'g" cx="0.525" cy="0.5" r="0.12"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.9"/>' +
      '<stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient></defs>';
    h += '<rect class="rm-space" width="' + MAP.w + '" height="' + MAP.h + '" rx="6"/>';
    MAP_STARS.forEach(function (s) { h += '<circle cx="' + s[0].toFixed(1) + '" cy="' + s[1].toFixed(1) + '" r="' + s[2].toFixed(2) + '" fill="#fff" opacity="' + s[3].toFixed(2) + '"/>'; });
    function region(r, d, label) {
      var b = SW.regionBreakdown(Q, r);
      var col = b.leader ? SW.color(b.leader) : '#444';
      var lead = b.leader ? SW.name(Q, b.leader) : 'no one';
      var title = SW.REGION_NAMES[r] + ': led by ' + lead + '. ' + b.rows.filter(function (x) { return x.share >= 0.005; }).map(function (x) {
        return SW.name(Q, x.bloc) + ' ' + x.n;
      }).join(', ') + (b.seceded ? '. ' + b.seceded + ' have left the Republic.' : '.');
      var g = '<g class="rm-region" data-region="' + r + '" tabindex="0" role="img" aria-label="' + escAttr(title) + '" data-tip="' + escAttr(SW.regionTip(Q, r)) + '">';
      g += '<title>' + escAttr(title) + '</title>';
      g += '<path d="' + d + '" fill="' + col + '" fill-rule="evenodd" class="rm-fill"/>';
      if (b.delegations > 0 && (Q[r + '_seceded'] || 0) > 0.5) g += '<path d="' + d + '" fill="url(#' + id + 'h)" fill-rule="evenodd" pointer-events="none"/>';
      g += '</g>';
      return g;
    }
    var labels = '';
    MAP_REGIONS.forEach(function (m) {
      var d = ellipsePath(MAP.cx, MAP.cy, m[1] * MAP.ux, m[1] * MAP.uy);
      if (m[2] > 0) d += ellipsePath(MAP.cx, MAP.cy, m[2] * MAP.ux, m[2] * MAP.uy);
      h += region(m[0], d, m[3]);
      labels += '<text x="' + m[4] + '" y="' + m[5] + '">' + m[3] + '</text>';
    });
    h += region('corporate', ellipsePath(CORPORATE.cx, CORPORATE.cy, CORPORATE.rx, CORPORATE.ry), CORPORATE.label);
    labels += '<text x="' + CORPORATE.lx + '" y="' + CORPORATE.ly + '">' + CORPORATE.label + '</text>';
    h += '<ellipse cx="' + MAP.cx + '" cy="' + MAP.cy + '" rx="' + (1.2 * MAP.ux).toFixed(1) + '" ry="' + (1.2 * MAP.uy).toFixed(1) + '" fill="url(#' + id + 'g)" pointer-events="none"/>';
    h += '<g class="rm-labels" pointer-events="none">' + labels + '</g>';
    h += '</svg>';
    // legend: the blocs that lead somewhere
    var leaders = [];
    SW.REGIONS.forEach(function (r) { var l = SW.regionBreakdown(Q, r).leader; if (l && leaders.indexOf(l) < 0) leaders.push(l); });
    h += '<div class="rm-legend">' + leaders.map(function (b) {
      return '<span><i class="rm-sw" style="background:' + SW.color(b) + '"></i>' + SW.name(Q, b) + '</span>';
    }).join('') + '</div>';
    return '<div class="region-map' + (opts.large ? ' large' : '') + '">' + h + '</div>';
  };

  SW.drawRegionMap = function (Q, elId) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById(elId);
    if (el) el.innerHTML = SW.regionMapSvg(Q, {large: true});
  };

  // One floating panel for every map on the page: hover, keyboard focus, or a tap shows a region's delegations.
  (function installRegionTips() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    var tip = null, current = null, watch = null, touch = false;
    function ensure() {
      if (!tip) { tip = document.createElement('div'); tip.id = 'region-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
      return tip;
    }
    function regionOf(t) { return t && t.closest ? t.closest('.rm-region') : null; }
    function place(x, y) {
      var w = tip.offsetWidth, hgt = tip.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      var left = x + 14, top = y + 14;
      if (left + w > vw - 8) left = Math.max(8, x - w - 14);
      if (top + hgt > vh - 8) top = Math.max(8, y - hgt - 14);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function show(el, x, y) {
      ensure();
      current = el;
      tip.innerHTML = el.getAttribute('data-tip') || '';
      tip.style.display = 'block';
      if (x === undefined) { var r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
      place(x, y);
      clearInterval(watch);
      watch = setInterval(function () { if (!current || !document.contains(current)) hide(); }, 400);
    }
    function hide() {
      current = null;
      clearInterval(watch);
      if (tip) tip.style.display = 'none';
    }
    // on touch screens a tap shows the panel and a tap elsewhere hides it; the mouse events a tap imitates are ignored
    document.addEventListener('pointerdown', function (e) { touch = e.pointerType === 'touch' || e.pointerType === 'pen'; }, true);
    document.addEventListener('mouseover', function (e) { var el = regionOf(e.target); if (el && !touch) show(el, e.clientX, e.clientY); });
    document.addEventListener('mousemove', function (e) { if (current && regionOf(e.target) === current) place(e.clientX, e.clientY); });
    document.addEventListener('mouseout', function (e) {
      var el = regionOf(e.target);
      if (!touch && el && el === current && regionOf(e.relatedTarget) !== el) hide();
    });
    document.addEventListener('focusin', function (e) { var el = regionOf(e.target); if (el) show(el); });
    document.addEventListener('focusout', function (e) { if (!touch && regionOf(e.target) === current) hide(); });
    document.addEventListener('click', function (e) {
      var el = regionOf(e.target);
      if (el) show(el, e.clientX, e.clientY); else hide();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }());

  SW.parliamentLegend = function (Q) {
    var data = SW.parliamentData(Q);
    var h = '<div class="legend">';
    for (var i = 0; i < data.length; i++) {
      h += '<span class="legend-item"><span class="legend-dot" style="background:' + data[i].color + '"></span>' + data[i].name + ' ' + (Q[data[i].id + '_r'] || 0).toFixed(1) + '%</span>';
    }
    return h + '</div>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
