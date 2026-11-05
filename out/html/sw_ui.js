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
    unease: [[0, 'business as usual'], [1, 'a vague disquiet'], [2, 'unease no one can name'], [3, '<span class="warn">a shadow over the Senate</span>'], [4, '<b class="bad">darkness clouds every vision</b>'], [1e9, '<b class="bad">the dark side is ascendant</b>']],
    sep: [[20, 'loyal'], [35, 'grumbling'], [50, '<span class="warn">disaffected</span>'], [65, '<b class="bad">seceding</b>'], [1e9, '<b class="bad">in revolt</b>']],
    strength: [[0.5, 'none'], [2, 'token'], [4, 'modest'], [6, 'substantial'], [8, 'strong'], [1e9, 'formidable']],
    ratio: [[0.6, '<b class="bad">hopeless</b>'], [0.9, '<span class="warn">outmatched</span>'], [1.1, 'evenly matched'], [1.6, '<span class="good">favourable</span>'], [1e9, '<b class="good">overwhelming</b>']],
    war: [[-7, '<b class="bad">catastrophic</b>'], [-3, '<span class="warn">losing ground</span>'], [-1, 'faltering'], [1, 'stalemate'], [4, '<span class="good">gaining ground</span>'], [7, '<span class="good">winning</span>'], [1e9, '<b class="good">nearly won</b>']],
    dissent: [[5, '<span class="good">united</span>'], [12, 'murmuring'], [22, 'restless'], [35, '<span class="warn">quarrelsome</span>'], [50, '<b class="bad">fractious</b>'], [1e9, '<b class="bad">on the verge of schism</b>']],
    cdissent: [[0, 'harmonious'], [1, 'grumbling'], [2, 'strained'], [3, '<span class="warn">fraying</span>'], [1e9, '<b class="bad">collapsing</b>']]
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
      case 'chancellery': h = chancelleryTab(Q); break;
    }
    return h;
  };

  function mainTab(Q) {
    var h = head(Q.date_label);
    h += row('Political capital', '<b>' + Q.capital + '</b>');
    var pos = Q.rc_chancellor ? '<b class="good">holds the Chancellery</b>' : (Q.rc_in_govt ? 'in government' : 'in opposition');
    h += row(bloc(Q, 'rc'), pos);
    if (Q.rc_in_govt) h += row('Coalition', Q.coalition_name + (Q.minority_govt ? ' (minority)' : ''));
    if (Q.rc_in_govt) h += row('Coalition mood', SW.label('cdissent', Q.coalition_dissent));
    if (Q.rc_in_govt) h += row('Republic treasury', Q.treasury);
    var chairs = [];
    for (var i = 0; i < SW.COMMITTEES.length; i++) if (Q['chair_' + SW.COMMITTEES[i]] === 'rc') chairs.push(SW.COMMITTEE_NAMES[SW.COMMITTEES[i]]);
    if (chairs.length) h += row('Our chairs', chairs.join(', '));
    h += row('Caucus mood', SW.label('dissent', Q.dissent_percent));
    h += head('The Republic');
    h += row('Chancellor', '<span style="color:' + SW.color(Q.chancellor_bloc) + '">' + Q.chancellor + '</span>');
    h += row('Faith in the Republic', SW.label('faith', Q.faith)) + bar(Q.faith, 100, 'good-fill');
    h += row('Corruption', SW.label('level', Q.corruption)) + bar(Q.corruption, 100, 'bad-fill');
    h += row('Fear', SW.label('level', Q.fear)) + bar(Q.fear, 100, 'bad-fill');
    h += row('Outer Rim hardship', SW.label('level', Q.rim_hardship)) + bar(Q.rim_hardship, 100, 'bad-fill');
    h += row('Emergency powers', SW.label('powers', Q.emergency_powers)) + bar(Q.emergency_powers, 10, 'bad-fill');
    h += head('The Caucus');
    for (var j = 0; j < SW.FACTIONS.length; j++) {
      var f = SW.FACTIONS[j];
      h += row(SW.FACTION_NAMES[f], Math.round(Q[f + '_strength']) + '% · ' + SW.label('dissent', Q[f + '_dissent']));
    }
    if (Q.hawks_split) h += '<p class="sb-note">The Hawks have broken away to the Security Bloc.</p>';
    if (Q.rimward_split) h += '<p class="sb-note">The Rimward wing has split off as the Rim Freedom Caucus.</p>';
    return h;
  }

  function senateTab(Q) {
    var h = head('Senate composition');
    h += '<p class="sb-note">Seats as of the last session. ' + (Q.seceded_total ? Q.seceded_total + '% of delegations have seceded.' : '') + '</p>';
    var list = Q.parties.slice().sort(function (a, b) { return (Q[b + '_r'] || 0) - (Q[a + '_r'] || 0); });
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var mark = (Q.govt_blocs || []).indexOf(b) >= 0 ? ' ★' : '';
      h += row(bloc(Q, b) + mark, (Q[b + '_r'] || 0).toFixed(1) + '%');
    }
    h += '<p class="sb-note">★ in the governing coalition (' + Q.govt_seats + '%).</p>';
    h += head('Our relations');
    for (var k = 0; k < Q.parties.length; k++) {
      var bb = Q.parties[k];
      if (bb === 'rc') continue;
      h += row(bloc(Q, bb), SW.label('relation', Q[bb + '_relation']));
    }
    h += head('Committee chairs');
    for (var c = 0; c < SW.COMMITTEES.length; c++) {
      var cm = SW.COMMITTEES[c];
      h += row(SW.COMMITTEE_NAMES[cm], bloc(Q, Q['chair_' + cm]));
    }
    return h;
  }

  function shadowTab(Q) {
    var h = head('The shadow');
    h += row('In the corridors', SW.label('unease', Q.unease));
    h += row('Our evidence', SW.label('evidence', Q.evidence)) + bar(Q.evidence, 12, 'good-fill');
    h += row('Jedi suspicion', SW.label('resolve', Q.jedi_suspicion)) + bar(Q.jedi_suspicion, 10, 'good-fill');
    h += row('Senate resolve', SW.label('resolve', Q.senate_resolve)) + bar(Q.senate_resolve, 10, 'good-fill');
    h += row('Emergency powers', SW.label('powers', Q.emergency_powers)) + bar(Q.emergency_powers, 10, 'bad-fill');
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
      h += '<div class="sb-check ' + (on ? 'on' : 'off') + '">' + (on ? '✔ ' : '○ ') + reforms[i][1] + '</div>';
    }
    return h;
  }

  function forcesTab(Q) {
    var h = head(Q.war ? 'The Clone Wars' : 'Peace and its enemies');
    if (Q.war) {
      h += row('The front', SW.label('war', Q.war_balance));
      h += row('War-weariness', SW.label('level', Q.war_weariness)) + bar(Q.war_weariness, 100, 'bad-fill');
    }
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
    h += head('Our support by region');
    for (var r = 0; r < SW.REGIONS.length; r++) {
      var rg = SW.REGIONS[r];
      h += row(SW.REGION_NAMES[rg], (Q[rg + '_rc_share'] || 0) + '%');
    }
    return h;
  }

  function chancelleryTab(Q) {
    var h = head('The Chancellery');
    h += '<div class="figure"><div class="figure-name" style="color:' + SW.color(Q.chancellor_bloc) + '">' + Q.chancellor_title + ' ' + Q.chancellor + '</div>';
    h += '<div class="figure-sub">' + SW.name(Q, Q.chancellor_bloc) + '</div></div>';
    h += row('Vice Chair', Q.vice_chair);
    h += head('Bloc leaders');
    for (var i = 0; i < Q.parties.length; i++) {
      var b = Q.parties[i];
      h += row(bloc(Q, b), Q[b + '_leader'] || '—');
    }
    h += head('Our advisors');
    var any = false;
    for (var a in SW.ADVISOR_NAMES) {
      if (Q['adv_' + a]) { h += row(SW.ADVISOR_NAMES[a], SW.FACTION_NAMES[SW.ADVISOR_FACTION[a]]); any = true; }
    }
    if (!any) h += '<p class="sb-note">No advisors. Use Shuffle Leadership.</p>';
    if (Q.anakin_found) {
      h += head('Persons of interest');
      h += row('Anakin Skywalker', Q.anakin_jedi ? (Q.padme_married ? 'Jedi Knight (secretly married)' : 'Jedi') : 'Padawan');
      if (Q.dooku_left && !Q.dooku_dead) h += row('Count Dooku', Q.dooku_movement ? 'Head of the Confederacy' : 'Former Jedi, Count of Serenno');
      if (Q.quigon_alive) h += row('Qui-Gon Jinn', 'Jedi Master');
    }
    return h;
  }

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

  SW.parliamentLegend = function (Q) {
    var data = SW.parliamentData(Q);
    var h = '<div class="legend">';
    for (var i = 0; i < data.length; i++) {
      h += '<span class="legend-item"><span class="legend-dot" style="background:' + data[i].color + '"></span>' + data[i].name + ' ' + (Q[data[i].id + '_r'] || 0).toFixed(1) + '%</span>';
    }
    return h + '</div>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
