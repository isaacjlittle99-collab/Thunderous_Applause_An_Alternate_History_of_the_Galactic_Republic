/*
 * editor.js - the card and event editor (editor.html).
 *
 * The game's sources (editor/sources.js) are compiled in the browser with dendrynexus (editor/compiler.js).
 * Edits are kept as whole .scene.dry files in a mod (localStorage 'ta_mod'); on every save the mod is
 * compiled and only the scenes that differ from the game's own are stored for the game to splice in
 * (mod_loader.js). Forms read and write the files through editor/dry_model.js.
 */
(function () {
  'use strict';

  var M = window.DryModel;
  var N = window.TA_NAMES;
  var TAMod = window.TAMod;
  var SOURCES = window.TA_SOURCES || {};

  var GROUPS = [
    {key: 'caucus_affairs', label: 'Caucus Affairs cards', dir: 'source/scenes/caucus_affairs/', kind: 'card'},
    {key: 'senate_affairs', label: 'Senate Affairs cards', dir: 'source/scenes/senate_affairs/', kind: 'card'},
    {key: 'last_days', label: 'Last Days cards', dir: 'source/scenes/last_days/', kind: 'card'},
    {key: 'advisors', label: 'Advisors', dir: 'source/scenes/advisors/', kind: 'advisor'},
    {key: 'act1', label: 'Events · Act I', dir: 'source/scenes/events/act1/', kind: 'event'},
    {key: 'act2', label: 'Events · Act II', dir: 'source/scenes/events/act2/', kind: 'event'},
    {key: 'act3', label: 'Events · Act III', dir: 'source/scenes/events/act3/', kind: 'event'},
    {key: 'act4', label: 'Events · Act IV', dir: 'source/scenes/events/act4/', kind: 'event'},
    {key: 'recurring', label: 'Events · any time', dir: 'source/scenes/events/recurring/', kind: 'event'},
    {key: 'finale', label: 'Events · the Last Days', dir: 'source/scenes/events/finale/', kind: 'event'}
  ];
  var DECKS = [['caucus_affairs', 'Caucus Affairs'], ['senate_affairs', 'Senate Affairs'], ['last_days', 'The Last Days']];
  var COVERED_TOP = ['title', 'subtitle', 'tags', 'cardimage', 'faceimage', 'viewif', 'onarrival', 'priority', 'maxvisits', 'iscard', 'ispinnedcard', 'newpage'];
  var COVERED_PASSAGE = ['subtitle', 'viewif', 'chooseif', 'unavailablesubtitle', 'onarrival', 'goto'];
  var OPS = [['+=', 'increase by'], ['-=', 'decrease by'], ['=', 'set to'], ['*=', 'multiply by'], ['/=', 'divide by']];
  var CMPS = [['>=', 'is at least'], ['>', 'is more than'], ['<=', 'is at most'], ['<', 'is less than'], ['=', 'is'], ['!=', 'is not'],
    ['flag', 'is true (not 0)'], ['notflag', 'is false (0)']];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  var S = {
    baseGame: null, baseKnown: {}, defaults: {}, mod: null,
    path: null, model: null, unsaved: false, view: 'form', saving: null
  };

  // ------------------------------------------------------------------ small helpers
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
        else if (k === 'value') e.value = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function qname(q) { return (N && N.name(q)) || q; }
  function fileId(path) { return path.replace(/^.*\//, '').replace(/\.scene\.dry$/, ''); }
  function groupOf(path) {
    for (var i = 0; i < GROUPS.length; i++) if (path.indexOf(GROUPS[i].dir) === 0 && path.slice(GROUPS[i].dir.length).indexOf('/') < 0) return GROUPS[i];
    return null;
  }
  function textOf(path) { return S.mod.files[path] ? S.mod.files[path].text : SOURCES[path]; }
  function titleOf(text) { var m = /^title:\s*(.*)$/m.exec(text || ''); return m ? m[1].trim() : '(untitled)'; }
  function allPaths() {
    var seen = {};
    Object.keys(SOURCES).concat(Object.keys(S.mod.files)).forEach(function (p) { if (groupOf(p)) seen[p] = 1; });
    return Object.keys(seen).sort();
  }
  function kindOf(path) {
    var g = groupOf(path);
    if (!g) return 'other';
    if (g.kind === 'card') {
      var t = textOf(path) || '';
      return /^is-card:\s*true/m.test(t) ? 'card' : 'passage';
    }
    return g.kind;
  }
  function isDisabled(path) { return S.mod.disabled.indexOf(fileId(path)) >= 0; }
  function isNew(path) { return !!S.mod.files[path] && SOURCES[path] === undefined; }
  function isEdited(path) { return !!S.mod.files[path] && SOURCES[path] !== undefined; }
  function isStale(path) {
    var f = S.mod.files[path];
    return !!(f && SOURCES[path] !== undefined && f.baseHash && f.baseHash !== M.hash(SOURCES[path]));
  }

  // ------------------------------------------------------------------ the mod
  function newMod() {
    return {format: 1, name: '', author: '', notes: '', enabled: true, files: {}, disabled: [], scenes: {}, removed: [],
      tags: {}, defaults: {}, timers: [], errors: []};
  }
  function normalizeMod(m) {
    var d = newMod();
    if (!m || typeof m !== 'object') return d;
    for (var k in d) if (m[k] === undefined || m[k] === null) m[k] = d[k];
    if (typeof m.files !== 'object') m.files = {};
    // only scene files inside source/scenes are accepted
    Object.keys(m.files).forEach(function (p) {
      var f = m.files[p];
      if (!/^source\/scenes\/[\w\/-]+\.scene\.dry$/.test(p) || !f || typeof f.text !== 'string') delete m.files[p];
    });
    if (!Array.isArray(m.disabled)) m.disabled = [];
    return m;
  }
  function storeMod() {
    try {
      TAMod.writeMod(localStorage, S.mod);
      return true;
    } catch (e) {
      toast('This browser could not store the mod: ' + (e && e.message || e), 6000);
      return false;
    }
  }

  // ------------------------------------------------------------------ compiling
  function compileGame(src) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var files = Object.keys(src).map(function (n) { return {name: n, contents: src[n]}; });
      try {
        window.DryCompiler.compileGame(files, function (err, game) {
          if (done) return;
          done = true;
          if (err) return reject(err);
          window.DryCompiler.convertGameToJSON(game, null, function (e2, json) {
            if (e2) reject(e2); else resolve(JSON.parse(json));
          });
        });
      } catch (e) {
        if (!done) { done = true; reject(e); }
      }
    });
  }

  var Q_RE = /Q\[\\?['"]([a-zA-Z_]\w*)\\?['"]\]|Q\.([a-zA-Z_]\w*)/g;
  function namesInCode(text, into) {
    var m;
    Q_RE.lastIndex = 0;
    while ((m = Q_RE.exec(text))) into[m[1] || m[2]] = 1;
    return into;
  }

  // JavaScript blocks that would not even parse.
  function scriptProblems(path, text) {
    var probs = [];
    var model = M.parseFile(text);
    model.errors.forEach(function (e) { probs.push({path: path, message: 'line ' + e.line + ': ' + e.message}); });
    model.sections.forEach(function (sec) {
      sec.props.forEach(function (p) {
        var v = String(p.value).trim();
        if (/^on-?(arrival|departure|display)$/i.test(p.name.replace(/[_ ]/g, '-')) && v.indexOf('{!') === 0) {
          try { new Function('state', 'Q', v.slice(2, v.lastIndexOf('!}'))); } catch (e) {
            probs.push({path: path, message: (sec.id ? '@' + sec.id + ', ' : '') + p.name + ': ' + e.message});
          }
        }
      });
      if (sec.dirty || !SOURCES[path]) {
        M.bodyProblems(M.bodyText(sec)).forEach(function (b) { probs.push({path: path, message: (sec.id ? '@' + sec.id + ': ' : '') + b}); });
      }
    });
    return probs;
  }

  // Compile the game with the mod's files and keep what differs from the game's own scenes.
  function rebuild() {
    var mod = S.mod;
    var src = Object.assign({}, SOURCES);
    var problems = [];
    Object.keys(mod.files).forEach(function (p) {
      src[p] = mod.files[p].text;
      problems = problems.concat(scriptProblems(p, mod.files[p].text));
    });
    return compileGame(src).then(function (g) {
      var d = TAMod.diffGames(S.baseGame, g);
      mod.scenes = d.scenes;
      mod.removed = d.removed;
      mod.tags = d.tags;
      // new qualities start at 0; new card cooldowns tick like the game's own
      var used = namesInCode(JSON.stringify(d.scenes), {});
      var defaults = {}, timers = [];
      var arith = /Q\.([a-zA-Z_]\w*)\s*(\+|-|\*|\/)=/g, m, js = JSON.stringify(d.scenes);
      while ((m = arith.exec(js))) if (S.defaults[m[1]] === undefined) defaults[m[1]] = 0;
      Object.keys(used).forEach(function (q) {
        var tm = /^(.+)_timer$/.exec(q);
        if (tm && SW.TIMERS.indexOf(tm[1]) < 0 && q !== 'last_card_timer') { if (timers.indexOf(tm[1]) < 0) timers.push(tm[1]); return; }
        if (!S.baseKnown[q] && S.defaults[q] === undefined) defaults[q] = 0;
      });
      Object.keys(defaults).forEach(function (q) { if (/_timer$/.test(q) && timers.indexOf(q.replace(/_timer$/, '')) >= 0) delete defaults[q]; });
      mod.defaults = defaults;
      mod.timers = timers;
      mod.errors = problems;
      storeMod();
      return true;
    }).catch(function (err) {
      var msg = String(err && err.message || err);
      var pm = /(source\/scenes\/[\w\/-]+\.scene\.dry)/.exec(msg);
      mod.errors = problems.concat([{path: pm ? pm[1] : null, message: msg}]);
      storeMod();
      return false;
    });
  }

  // ------------------------------------------------------------------ list
  function renderList() {
    var q = ($('search').value || '').trim().toLowerCase();
    var box = $('list');
    box.innerHTML = '';
    var paths = allPaths();
    var errorPaths = {};
    (S.mod.errors || []).forEach(function (e) { if (e.path) errorPaths[e.path] = 1; });
    function matches(p) {
      if (!q) return true;
      var t = textOf(p) || '';
      return titleOf(t).toLowerCase().indexOf(q) >= 0 || fileId(p).indexOf(q) >= 0 || t.toLowerCase().indexOf(q) >= 0;
    }
    function item(p) {
      var badges = [];
      if (errorPaths[p]) badges.push(el('span', {class: 'badge error', text: 'error'}));
      if (isNew(p)) badges.push(el('span', {class: 'badge new', text: 'new'}));
      else if (isEdited(p)) badges.push(el('span', {class: 'badge edited', text: 'edited'}));
      if (isStale(p)) badges.push(el('span', {class: 'badge stale', text: 'game updated'}));
      if (isDisabled(p)) badges.push(el('span', {class: 'badge off', text: 'off'}));
      return el('button', {class: 'item' + (p === S.path ? ' active' : ''), type: 'button', role: 'listitem', title: p,
        onclick: function () { openPath(p); }}, el('span', {class: 't', text: titleOf(textOf(p))}), badges);
    }
    var mine = paths.filter(function (p) { return (S.mod.files[p] || isDisabled(p)) && matches(p); });
    if (mine.length) {
      box.appendChild(el('h3', null, 'In this mod', el('span', {text: String(mine.length)})));
      mine.forEach(function (p) { box.appendChild(item(p)); });
    }
    GROUPS.forEach(function (g) {
      var ps = paths.filter(function (p) { return groupOf(p) === g && matches(p); });
      if (!ps.length) return;
      ps.sort(function (a, b) { return titleOf(textOf(a)).localeCompare(titleOf(textOf(b))); });
      box.appendChild(el('h3', null, g.label, el('span', {text: String(ps.length)})));
      ps.forEach(function (p) { box.appendChild(item(p)); });
    });
    if (!box.children.length) box.appendChild(el('p', {class: 'hint', text: 'Nothing matches “' + q + '”.'}));
  }

  // ------------------------------------------------------------------ opening and saving
  function openPath(path, keepView) {
    if (typeof textOf(path) !== 'string') { toast('There is no card or event at ' + path + '.'); return; }
    var go = function () {
      S.path = path;
      S.model = M.parseFile(textOf(path));
      S.unsaved = false;
      if (!keepView) S.view = 'form';
      if (S.model.errors.length) S.view = 'source';
      try { history.replaceState(null, '', '#' + fileId(path)); } catch (e) {}
      renderList();
      renderPane();
      $('main').scrollTop = 0;
    };
    if (S.unsaved && S.path && S.path !== path) save().then(go); else go();
  }

  function currentText() {
    if (S.view === 'source') return $('source') ? $('source').value.replace(/\r/g, '') : textOf(S.path);
    return M.serializeFile(S.model);
  }

  function save() {
    if (!S.path) return Promise.resolve();
    var path = S.path;
    var text = currentText();
    var base = SOURCES[path];
    if (base !== undefined && text === base) delete S.mod.files[path];
    else S.mod.files[path] = {text: text, baseHash: base !== undefined ? M.hash(base) : null};
    S.unsaved = false;
    setSaveState('Saving…');
    return rebuild().then(function (ok) {
      if (S.path === path) {
        S.model = M.parseFile(textOf(path));
        if (S.view === 'form' && S.model.errors.length) S.view = 'source';
      }
      renderList();
      renderPane();
      var errs = (S.mod.errors || []).length;
      toast(ok && !errs ? 'Saved. The game will use your changes.' : 'Saved, but there ' + (errs === 1 ? 'is a problem' : 'are problems') + ' to fix.', ok && !errs ? 2200 : 4000);
    });
  }

  function markUnsaved() {
    S.unsaved = true;
    setSaveState();
  }
  function setSaveState(label) {
    var b = $('btn-save');
    if (!b) return;
    b.disabled = !S.unsaved && !label;
    b.textContent = label || (S.unsaved ? 'Save' : 'Saved');
  }

  // ------------------------------------------------------------------ pane
  function renderPane() {
    var pane = $('pane');
    $('welcome').hidden = true;
    $('loading').hidden = true;
    pane.hidden = false;
    pane.innerHTML = '';
    var path = S.path;
    var model = S.model;
    var top = model.sections[0];
    var kind = kindOf(path);
    var title = M.getProp(top, 'title') || '(untitled)';

    var badges = [];
    if (isNew(path)) badges.push(el('span', {class: 'badge new', text: 'new'}));
    else if (isEdited(path)) badges.push(el('span', {class: 'badge edited', text: 'edited'}));
    if (isDisabled(path)) badges.push(el('span', {class: 'badge off', text: 'switched off'}));

    var head = el('div', {class: 'pane-head'},
      el('h2', {id: 'pane-title', text: title}), badges,
      el('div', {class: 'actions'},
        el('button', {id: 'btn-save', type: 'button', class: 'primary', disabled: true, onclick: function () { save(); }}, 'Saved'),
        el('button', {id: 'btn-playtest', type: 'button', onclick: openPlaytest, title: 'Try it in the game'}, 'Playtest ▶'),
        el('button', {id: 'btn-view', type: 'button', onclick: toggleView}, S.view === 'source' ? 'Edit as a form' : 'Edit as source'),
        el('button', {id: 'btn-toggle', type: 'button', onclick: toggleDisabled}, isDisabled(path) ? 'Switch back on' : 'Switch off'),
        isNew(path) ? el('button', {type: 'button', class: 'danger', onclick: deleteFile}, 'Delete')
          : (isEdited(path) ? el('button', {type: 'button', onclick: revertFile}, 'Undo all my changes') : null)));
    pane.appendChild(head);
    var kindText = {card: 'Card', advisor: 'Advisor (pinned card)', event: 'Event', passage: 'Card', other: 'Scene'}[kind];
    pane.appendChild(el('div', {class: 'pane-sub', html: kindText + ' · id <code>' + esc(fileId(path)) + '</code> · <code>' + esc(path) + '</code>'}));
    setSaveState();

    // problems with this file, and with the mod as a whole
    var errs = (S.mod.errors || []).filter(function (e) { return e.path === path || !e.path; });
    if (errs.length) {
      pane.appendChild(el('div', {class: 'notice error'}, el('b', {text: 'The game cannot use this yet:'}),
        el('ul', null, errs.map(function (e) { return el('li', {text: e.message}); }))));
    }
    var other = (S.mod.errors || []).filter(function (e) { return e.path && e.path !== path; });
    if (other.length) {
      pane.appendChild(el('div', {class: 'notice warn'}, 'Other files in this mod have problems: ',
        other.map(function (e) { return el('a', {href: '#', onclick: function (ev) { ev.preventDefault(); openPath(e.path); }}, titleOf(textOf(e.path)) + ' '); })));
    }
    if (isStale(path)) {
      pane.appendChild(el('div', {class: 'notice warn'},
        el('b', {text: 'The game has changed this ' + (kind === 'event' ? 'event' : 'card') + ' since you edited it. '}),
        'Your version is still the one in play. ',
        el('button', {type: 'button', class: 'small', onclick: function () { showOriginal(true); }}, 'Show the game\'s new version'), ' ',
        el('button', {type: 'button', class: 'small', onclick: function () {
          var f = S.mod.files[path];
          f.baseHash = M.hash(SOURCES[path]);
          storeMod(); renderList(); renderPane();
        }}, 'Keep mine'), ' ',
        el('button', {type: 'button', class: 'small', onclick: revertFile}, 'Discard mine')));
    }
    if (isDisabled(path)) {
      pane.appendChild(el('div', {class: 'notice'}, 'Switched off: this ' + (kind === 'event' ? 'event never happens' : 'card never appears') + ' while the mod is in play.'));
    }

    if (S.view === 'source') {
      pane.appendChild(sourceView());
      return;
    }

    // basics
    var basics = el('div', {class: 'grid'});
    basics.appendChild(el('label', {for: 'f-title', text: 'Title'}));
    basics.appendChild(el('input', {id: 'f-title', type: 'text', value: M.getProp(top, 'title') || '', oninput: function (e) {
      M.setProp(top, 'title', e.target.value); $('pane-title').textContent = e.target.value || '(untitled)'; markUnsaved();
    }}));
    basics.appendChild(el('label', {for: 'f-subtitle', text: kind === 'event' ? 'Subtitle' : 'Line under the title'}));
    basics.appendChild(el('input', {id: 'f-subtitle', type: 'text', value: M.getProp(top, 'subtitle') || '', oninput: function (e) {
      M.setProp(top, 'subtitle', e.target.value); markUnsaved();
    }}));
    if (kind === 'card' || kind === 'passage') {
      var tags = M.getProp(top, 'tags') || '';
      var deck = el('select', {id: 'f-deck', onchange: function (e) { M.setProp(top, 'tags', e.target.value); markUnsaved(); }});
      DECKS.forEach(function (d) { deck.appendChild(el('option', {value: d[0], selected: tags.trim() === d[0]}, d[1])); });
      if (!DECKS.some(function (d) { return d[0] === tags.trim(); })) deck.appendChild(el('option', {value: tags, selected: true}, tags || '(none)'));
      basics.appendChild(el('label', {for: 'f-deck', text: 'Deck'}));
      basics.appendChild(deck);
    }
    if (kind === 'event') {
      basics.appendChild(el('label', {for: 'f-priority', text: 'Priority'}));
      basics.appendChild(el('div', null,
        el('input', {id: 'f-priority', type: 'number', step: '1', style: 'width:6em', value: M.getProp(top, 'priority') || '', placeholder: '0',
          oninput: function (e) { M.setProp(top, 'priority', e.target.value); markUnsaved(); }}),
        el('span', {class: 'hint', text: ' When several events are waiting, higher priority comes first.'})));
      var mv = M.getProp(top, 'max-visits');
      basics.appendChild(el('label', {for: 'f-once', text: 'Happens'}));
      basics.appendChild(el('label', null, el('input', {id: 'f-once', type: 'checkbox', checked: String(mv).trim() === '1', onchange: function (e) {
        M.setProp(top, 'max-visits', e.target.checked ? '1' : ''); markUnsaved();
      }}), ' only once per game'));
    }
    var imgProp = kind === 'event' ? 'face-image' : 'card-image';
    if (kind !== 'other') {
      basics.appendChild(el('label', {text: 'Picture'}));
      basics.appendChild(imagePicker(top, imgProp, kind === 'event' ? N.eventImages : N.cardImages, kind === 'event'));
    }
    pane.appendChild(block('Basics', null, basics));

    pane.appendChild(block('When it ' + (kind === 'event' ? 'happens' : 'can be drawn'),
      kind === 'event' ? 'Checked every turn; the event fires once all of this is true.' : 'The card can only be drawn while this is true.',
      condEditor(top, 'view-if', 'Always')));
    pane.appendChild(block(kind === 'event' ? 'As it happens' : 'When it is played', 'Changes made as soon as it ' + (kind === 'event' ? 'appears' : 'is played') + '.',
      effectsEditor(top, 'on-arrival')));
    pane.appendChild(block('Text', null, proseEditor(top, true)));

    var rendered = {};
    rendered[top.id] = 1;
    pane.appendChild(block('Choices', 'In the order the player sees them.', choicesEditor(top, rendered, 0)));

    var orphans = model.sections.filter(function (s) { return s.id !== null && !rendered[s.id]; });
    if (orphans.length) {
      var ob = el('div', {class: 'choices'});
      orphans.forEach(function (s) {
        rendered[s.id] = 1;
        ob.appendChild(el('div', {class: 'choice'}, el('div', {class: 'choice-head'}, el('b', {text: '@' + s.id})),
          passageEditor(s, rendered, 1)));
      });
      pane.appendChild(block('Other passages', 'Reached by “then go to” rather than by a choice.', ob));
    }
    var extra = extraProps(top, COVERED_TOP);
    if (extra) pane.appendChild(block('More properties', 'Advanced settings, as written in the source.', extra));
  }

  function block(title, hint, body) {
    return el('section', {class: 'block'}, el('h3', null, title, hint ? el('span', {class: 'hint', text: hint}) : null), body);
  }

  function showOriginal(isNewVersion) {
    var base = SOURCES[S.path];
    if (base === undefined) return;
    var d = $('original-view');
    if (d) { d.remove(); return; }
    var box = el('div', {id: 'original-view', class: 'notice'},
      el('b', {text: isNewVersion ? 'The game\'s current version (read only):' : 'The original (read only):'}),
      el('textarea', {class: 'code', rows: 16, readonly: true, value: base}));
    $('pane').insertBefore(box, $('pane').children[2] || null);
  }

  function sourceView() {
    var wrap = el('div');
    wrap.appendChild(el('p', {class: 'hint', html: 'The file exactly as the game reads it. Properties come first, then a blank line, the text, a blank line and the choices (<code>- @id: Label</code>). Each <code>@id</code> line starts the passage for a choice.'}));
    if (S.model.errors.length) {
      wrap.appendChild(el('div', {class: 'notice error'}, el('b', {text: 'This file has problems, so it can only be edited as source:'}),
        el('ul', null, S.model.errors.map(function (e) { return el('li', {text: 'Line ' + e.line + ': ' + e.message}); }))));
    }
    var ta = el('textarea', {id: 'source', class: 'code', spellcheck: 'false', value: M.serializeFile(S.model), oninput: markUnsaved});
    wrap.appendChild(ta);
    if (SOURCES[S.path] !== undefined && isEdited(S.path)) {
      wrap.appendChild(el('p', null, el('button', {type: 'button', class: 'small', onclick: function () { showOriginal(false); }}, 'Show the original')));
    }
    return wrap;
  }

  function toggleView() {
    if (S.view === 'source') {
      var text = $('source').value.replace(/\r/g, '');
      var m = M.parseFile(text);
      if (m.errors.length) {
        S.model = m;
        renderPane();
        toast('Fix the problems first: the form needs a file it can read.', 4000);
        return;
      }
      S.model = m;
      S.view = 'form';
    } else {
      S.view = 'source';
    }
    var was = S.unsaved;
    renderPane();
    if (was) markUnsaved();
  }

  // ------------------------------------------------------------------ fields
  function imagePicker(sec, prop, names, allowNone) {
    var cur = (M.getProp(sec, prop) || '').trim();
    var box = el('div', {class: 'img-pick', role: 'radiogroup'});
    var all = names.map(function (n) { return 'img/' + n + '.svg'; });
    if (cur && all.indexOf(cur) < 0) all.unshift(cur);
    if (allowNone) all.unshift('');
    all.forEach(function (src) {
      var b = el('button', {type: 'button', class: src === cur ? 'on' : '', title: src || 'No picture', 'aria-pressed': src === cur ? 'true' : 'false',
        onclick: function () {
          M.setProp(sec, prop, src);
          Array.prototype.forEach.call(box.children, function (c) { c.className = ''; c.setAttribute('aria-pressed', 'false'); });
          b.className = 'on'; b.setAttribute('aria-pressed', 'true');
          markUnsaved();
        }}, src ? el('img', {src: src, alt: src.replace(/^img\/|\.svg$/g, '')}) : el('span', {class: 'hint', text: 'none'}));
      box.appendChild(b);
    });
    return box;
  }

  function qualityInput(value, onChange) {
    return el('input', {type: 'text', class: 'q code', list: 'qualities-list', value: value || '', placeholder: 'quality', spellcheck: 'false',
      oninput: function (e) { onChange(e.target.value.trim()); }});
  }

  function condEditor(sec, prop, emptyText) {
    var wrap = el('div', {class: 'cond-editor'});
    var c = M.Conditions.parse(M.getProp(sec, prop));
    function commit() { M.setProp(sec, prop, M.Conditions.serialize(c)); markUnsaved(); summary(); }
    var sumEl = el('div', {class: 'summary'});
    function plainTerm(t) {
      if (t.kind === 'cmp') return qname(t.q) + ' ' + ({'>=': '≥', '>': '>', '<=': '≤', '<': '<', '=': '=', '==': '=', '!=': '≠'}[t.op] || t.op) + ' ' + t.value;
      if (t.kind === 'flag') return (t.negate ? 'not: ' : '') + qname(t.q);
      return t.text;
    }
    function summary() {
      if (c.mode === 'raw') { sumEl.textContent = ''; return; }
      var terms = c.terms.filter(function (t) { return t.kind === 'raw' ? t.text.trim() : t.q; });
      sumEl.textContent = terms.length ? terms.map(plainTerm).join(c.mode === 'any' ? ', or ' : '; and ') : emptyText;
    }
    function draw() {
      wrap.innerHTML = '';
      if (c.mode === 'raw') {
        wrap.appendChild(el('textarea', {class: 'code', rows: 2, value: c.text || '', spellcheck: 'false', oninput: function (e) { c.text = e.target.value; commit(); }}));
        wrap.appendChild(el('div', {class: 'row-tools'}, el('button', {type: 'button', class: 'small', onclick: function () {
          var p = M.Conditions.parse(c.text);
          if (p.mode === 'raw') { toast('This condition mixes “and” with “or”, so it stays as text. Brackets can group a part.', 4500); return; }
          c = p; draw();
        }}, 'Edit as rows'), el('span', {class: 'hint', html: 'Written like <code>capital >= 1 and not war</code>.'})));
        return;
      }
      if (c.terms.length > 1) {
        var ms = el('select', {class: 'mode-select', onchange: function (e) { c.mode = e.target.value; commit(); }},
          el('option', {value: 'all', selected: c.mode === 'all'}, 'All of these are true'),
          el('option', {value: 'any', selected: c.mode === 'any'}, 'Any one of these is true'));
        wrap.appendChild(ms);
      }
      var rows = el('div', {class: 'rows'});
      c.terms.forEach(function (t, k) {
        var row = el('div', {class: 'row'});
        row.appendChild(el('button', {type: 'button', class: 'icon', title: 'Remove', 'aria-label': 'Remove condition', onclick: function () {
          c.terms.splice(k, 1); commit(); draw();
        }}, '✕'));
        if (t.kind === 'raw') {
          row.appendChild(el('input', {type: 'text', class: 'cond code', value: t.text, spellcheck: 'false', oninput: function (e) { t.text = e.target.value; commit(); }}));
        } else {
          var opVal = t.kind === 'flag' ? (t.negate ? 'notflag' : 'flag') : (t.op === '==' ? '=' : t.op);
          var vIn = el('input', {type: 'text', class: 'v code', value: t.kind === 'cmp' ? t.value : '1', hidden: t.kind === 'flag',
            oninput: function (e) { t.value = e.target.value.trim(); commit(); }});
          var qi = qualityInput(t.q, function (v) { t.q = v; qi.title = v ? qname(v) : ''; commit(); });
          qi.title = t.q ? qname(t.q) : '';
          row.appendChild(qi);
          var sel = el('select', {onchange: function (e) {
            var v = e.target.value;
            if (v === 'flag' || v === 'notflag') { t.kind = 'flag'; t.negate = v === 'notflag'; vIn.hidden = true; }
            else { t.kind = 'cmp'; t.op = v; if (t.value === undefined) t.value = '1'; vIn.hidden = false; }
            commit();
          }});
          CMPS.forEach(function (o) { sel.appendChild(el('option', {value: o[0], selected: o[0] === opVal}, o[1])); });
          row.appendChild(sel);
          row.appendChild(vIn);
        }
        rows.appendChild(row);
      });
      wrap.appendChild(rows);
      wrap.appendChild(el('div', {class: 'row-tools'},
        el('button', {type: 'button', class: 'small', onclick: function () { c.terms.push({kind: 'cmp', q: '', op: '>=', value: '1'}); draw(); }}, '+ Condition'),
        el('button', {type: 'button', class: 'small', onclick: function () { c.terms.push({kind: 'raw', text: ''}); draw(); }}, '+ Written condition'),
        el('button', {type: 'button', class: 'small', onclick: function () { c = {mode: 'raw', text: M.Conditions.serialize(c), terms: []}; draw(); }}, 'Edit as text')));
      wrap.appendChild(sumEl);
      summary();
    }
    draw();
    return wrap;
  }

  function plainChange(r) {
    var n = qname(r.q);
    var v = r.value;
    var s;
    if (r.op === '+=') s = n + ' +' + v;
    else if (r.op === '-=') s = n + ' −' + v;
    else if (r.op === '=') s = n + ' set to ' + v;
    else if (r.op === '*=') s = n + ' × ' + v;
    else s = n + ' ÷ ' + v;
    return r.cond ? s + ' (only if ' + r.cond + ')' : s;
  }

  function effectsEditor(sec, prop) {
    var wrap = el('div', {class: 'effects-editor'});
    var e = M.Effects.parse(M.getProp(sec, prop));
    function commit() { M.setProp(sec, prop, M.Effects.serialize(e)); markUnsaved(); }
    function draw() {
      wrap.innerHTML = '';
      var rows = el('div', {class: 'rows'});
      if (!e.rows.length) rows.appendChild(el('div', {class: 'hint', text: 'Nothing changes.'}));
      e.rows.forEach(function (r, k) {
        var remove = el('button', {type: 'button', class: 'icon', title: 'Remove', 'aria-label': 'Remove effect', onclick: function () {
          e.rows.splice(k, 1); commit(); draw();
        }}, '✕');
        if (r.kind === 'change') {
          var row = el('div', {class: 'row'});
          var plain = el('span', {class: 'plain', text: r.q ? plainChange(r) : ''});
          var touch = function () { r.dirty = true; plain.textContent = r.q ? plainChange(r) : ''; commit(); };
          row.appendChild(remove);
          row.appendChild(qualityInput(r.q, function (v) { r.q = v; touch(); }));
          var sel = el('select', {onchange: function (ev) { r.op = ev.target.value; touch(); }});
          OPS.forEach(function (o) { sel.appendChild(el('option', {value: o[0], selected: o[0] === r.op}, o[1])); });
          row.appendChild(sel);
          row.appendChild(el('input', {type: 'text', class: 'v code', value: r.value, spellcheck: 'false', oninput: function (ev) { r.value = ev.target.value.trim(); touch(); }}));
          var condIn = el('input', {type: 'text', class: 'cond code', value: r.cond || '', placeholder: e.lang === 'js' ? 'only if (JavaScript, e.g. Q.war)' : 'only if (e.g. evidence >= 4)',
            hidden: !r.cond, spellcheck: 'false', oninput: function (ev) { r.cond = ev.target.value.trim(); touch(); }});
          var onlyIf = el('button', {type: 'button', class: 'small', hidden: !!r.cond, onclick: function () { condIn.hidden = false; onlyIf.hidden = true; condIn.focus(); }}, 'only if…');
          row.appendChild(onlyIf);
          row.appendChild(condIn);
          row.appendChild(plain);
          rows.appendChild(row);
        } else {
          var crow = el('div', {class: 'row code'});
          crow.appendChild(remove);
          crow.appendChild(el('span', {class: 'tag', text: e.lang === 'js' ? 'code' : 'rule'}));
          var ta = el('textarea', {class: 'code', rows: Math.min(12, (r.text.match(/\n/g) || []).length + 1), value: r.text, spellcheck: 'false',
            oninput: function (ev) { r.text = ev.target.value; commit(); }});
          crow.appendChild(ta);
          rows.appendChild(crow);
        }
      });
      wrap.appendChild(rows);
      wrap.appendChild(el('div', {class: 'row-tools'},
        el('button', {type: 'button', class: 'small', onclick: function () {
          if (e.lang === 'raw') { toast('This line is written in a special form; edit it as source.', 4000); return; }
          e.rows.push({kind: 'change', q: '', op: '+=', value: '1', cond: '', dirty: true}); draw();
        }}, '+ Effect'),
        el('button', {type: 'button', class: 'small', onclick: function () {
          if (e.lang === 'dendry' && e.rows.length) {
            var js = M.Effects.toJs(e);
            if (!js) { toast('This line has a rule that cannot be turned into code automatically. Edit it as source.', 4500); return; }
            e = js;
          } else if (e.lang === 'dendry') {
            e.lang = 'js';
          }
          e.rows.push({kind: 'code', text: ''});
          commit(); draw();
        }}, '+ Code'),
        el('span', {class: 'hint', text: e.lang === 'js' ? 'Code is JavaScript: qualities are Q.name, and SW.… is the game\'s logic.' : ''})));
    }
    draw();
    return wrap;
  }

  // Text: the heading (if any) and the prose, with a small toolbar and a preview.
  function proseEditor(sec, withHeading) {
    var wrap = el('div', {class: 'prose-editor'});
    var body = M.bodyText(sec);
    var heading = null;
    var hm = withHeading ? /^= (.*)(\n|$)/.exec(body) : null;
    if (hm) { heading = hm[1]; body = body.slice(hm[0].length).replace(/^\n/, ''); }
    var probs = el('div', {class: 'notice warn', hidden: true});
    var preview = el('div', {class: 'preview', hidden: true});
    var ta;
    function commit() {
      var text = (heading !== null ? '= ' + heading + '\n\n' : '') + ta.value.replace(/\r/g, '');
      M.setBody(sec, text);
      markUnsaved();
      var p = M.bodyProblems(text);
      probs.hidden = !p.length;
      probs.textContent = p.join(' ');
      if (!preview.hidden) preview.innerHTML = renderPreview(text);
    }
    if (heading !== null) {
      wrap.appendChild(el('div', {class: 'grid'}, el('label', {text: 'Heading'}),
        el('input', {type: 'text', value: heading, oninput: function (e) { heading = e.target.value; commit(); }})));
    }
    function wrapSel(before, after) {
      var s = ta.selectionStart, en = ta.selectionEnd;
      var v = ta.value;
      ta.value = v.slice(0, s) + before + v.slice(s, en) + after + v.slice(en);
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = en + before.length;
      commit();
    }
    wrap.appendChild(el('div', {class: 'toolbar'},
      el('button', {type: 'button', class: 'small', title: 'Bold', onclick: function () { wrapSel('**', '**'); }}, el('b', {text: 'B'})),
      el('button', {type: 'button', class: 'small', title: 'Italic', onclick: function () { wrapSel('*', '*'); }}, el('i', {text: 'I'})),
      el('button', {type: 'button', class: 'small', title: 'Show the value of a quality', onclick: function () {
        var q = window.prompt('Show the value of which quality? (for example capital, or pal_name)');
        if (q) wrapSel('[+ ' + q.trim() + ' +]', '');
      }}, 'Insert a value…'),
      el('button', {type: 'button', class: 'small', title: 'Text that only appears when a condition holds', onclick: function () {
        var c = window.prompt('Show the selected text only when… (for example: war, or evidence >= 4)');
        if (c) wrapSel('[? if ' + c.trim() + ' : ', ' ?]');
      }}, 'Only if…'),
      el('button', {type: 'button', class: 'small', onclick: function () {
        preview.hidden = !preview.hidden;
        if (!preview.hidden) preview.innerHTML = renderPreview((heading !== null ? '= ' + heading + '\n\n' : '') + ta.value);
      }}, 'Preview')));
    ta = el('textarea', {class: 'prose', rows: Math.max(4, Math.min(18, Math.ceil(body.length / 90) + (body.match(/\n/g) || []).length + 1)), value: body,
      oninput: commit});
    wrap.appendChild(ta);
    wrap.appendChild(probs);
    wrap.appendChild(preview);
    return wrap;
  }

  function renderPreview(text) {
    var h = esc(text);
    h = h.replace(/\{!([\s\S]*?)!\}/g, '<span class="chip" title="Raw HTML">html</span>');
    h = h.replace(/\[\+\s*([\w]+)(?:\s*:\s*\w+)?\s*\+\]/g, function (m, q) { return '<span class="chip" title="' + esc(qname(q)) + '">' + q + '</span>'; });
    h = h.replace(/\[\?\s*if\s+([\s\S]*?)\s*:\s*([\s\S]*?)\s*\?\]/g, function (m, c, t) { return '<span class="cond" title="Only if ' + c + '">' + t + '</span>'; });
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
    return h.split(/\n\s*\n/).map(function (p) {
      if (/^= /.test(p)) return '<h4>' + p.slice(2) + '</h4>';
      if (/^&gt; /.test(p)) return '<blockquote>' + p.slice(5) + '</blockquote>';
      return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  function extraProps(sec, covered) {
    var extras = sec.props.filter(function (p) { return covered.indexOf(M.normName(p.name)) < 0; });
    var wrap = el('div', {class: 'rows'});
    function draw() {
      wrap.innerHTML = '';
      sec.props.forEach(function (p, k) {
        if (covered.indexOf(M.normName(p.name)) >= 0) return;
        wrap.appendChild(el('div', {class: 'row'},
          el('button', {type: 'button', class: 'icon', title: 'Remove', 'aria-label': 'Remove property', onclick: function () { sec.props.splice(k, 1); sec.dirty = true; markUnsaved(); draw(); }}, '✕'),
          el('input', {type: 'text', class: 'q code', value: p.name, spellcheck: 'false', oninput: function (e) { p.name = e.target.value.trim(); sec.dirty = true; markUnsaved(); }}),
          el('input', {type: 'text', class: 'cond code', value: p.value, spellcheck: 'false', oninput: function (e) { p.value = e.target.value; sec.dirty = true; markUnsaved(); }})));
      });
      wrap.appendChild(el('div', {class: 'row-tools'}, el('button', {type: 'button', class: 'small', onclick: function () {
        sec.props.push({name: 'new-page', value: 'true'}); sec.dirty = true; markUnsaved(); draw();
      }}, '+ Property')));
    }
    draw();
    return extras.length || covered === COVERED_PASSAGE ? wrap : (function () {
      var holder = el('div');
      holder.appendChild(el('button', {type: 'button', class: 'small', onclick: function () { holder.replaceWith(wrap); }}, 'Show advanced properties'));
      return holder;
    }());
  }

  // ------------------------------------------------------------------ choices and passages
  function localSection(target) {
    if (!/^@[\w-]+$/.test(target)) return null;
    return M.findSection(S.model, target.slice(1));
  }

  function referenced(id, exceptSec, exceptIdx) {
    var hit = false;
    S.model.sections.forEach(function (s) {
      s.options.forEach(function (o, k) { if (o.target === '@' + id && !(s === exceptSec && k === exceptIdx)) hit = true; });
      var g = M.getProp(s, 'go-to');
      if (g && new RegExp('(^|[^\\w.])' + id + '($|[^\\w])').test(g)) hit = true;
    });
    return hit;
  }

  function uniqueId(base) {
    var id = M.slug(base).slice(0, 20) || 'choice';
    if (/^\d/.test(id)) id = 'c_' + id;
    var n = id, k = 2;
    while (M.findSection(S.model, n) || n === fileId(S.path)) n = id + '_' + (k++);
    return n;
  }

  function choicesEditor(sec, rendered, depth) {
    var wrap = el('div', {class: 'choices'});
    function draw() {
      wrap.innerHTML = '';
      if (!sec.options.length) wrap.appendChild(el('div', {class: 'hint', text: 'No choices: the player continues straight on.'}));
      sec.options.forEach(function (o, k) {
        var box = el('div', {class: 'choice'});
        var target = localSection(o.target);
        var isDiscard = o.target === '@easy_discard';
        var headBits = [el('span', {class: 'num', text: (k + 1) + '.'})];
        if (isDiscard) {
          headBits.push(el('span', {class: 'leads', text: 'Keep the card for later (does not use the turn)'}));
        } else {
          headBits.push(el('input', {type: 'text', class: 'label', value: o.label, placeholder: 'What the player clicks', 'aria-label': 'Choice label',
            oninput: function (e) { o.label = e.target.value; sec.dirty = true; markUnsaved(); }}));
        }
        headBits.push(el('button', {type: 'button', class: 'icon', title: 'Move up', 'aria-label': 'Move up', disabled: k === 0, onclick: function () {
          var t = sec.options[k - 1]; sec.options[k - 1] = o; sec.options[k] = t; sec.dirty = true; markUnsaved(); redrawAll();
        }}, '▲'));
        headBits.push(el('button', {type: 'button', class: 'icon', title: 'Move down', 'aria-label': 'Move down', disabled: k === sec.options.length - 1, onclick: function () {
          var t = sec.options[k + 1]; sec.options[k + 1] = o; sec.options[k] = t; sec.dirty = true; markUnsaved(); redrawAll();
        }}, '▼'));
        headBits.push(el('button', {type: 'button', class: 'icon danger', title: 'Remove this choice', 'aria-label': 'Remove choice', onclick: function () {
          if (!window.confirm('Remove the choice “' + (o.label || o.target) + '”' + (target ? ' and what happens after it' : '') + '?')) return;
          sec.options.splice(k, 1);
          sec.dirty = true;
          if (target && !referenced(target.id)) M.removeSection(S.model, target.id);
          markUnsaved();
          redrawAll();
        }}, '✕'));
        box.appendChild(el('div', {class: 'choice-head'}, headBits));
        if (target && !rendered[target.id]) {
          rendered[target.id] = 1;
          var det = el('details', {open: sec.options.length <= 5 || depth > 0 ? true : null},
            el('summary', null, passageSummary(target)), passageEditor(target, rendered, depth + 1));
          box.appendChild(det);
        } else if (target) {
          box.appendChild(el('div', {class: 'leads', text: 'Leads to the passage @' + target.id + ' (edited above).'}));
        } else if (!isDiscard) {
          box.appendChild(el('div', {class: 'leads', html: 'Leads to <code>' + esc(o.target) + '</code>, outside this file.'}));
        }
        wrap.appendChild(box);
      });
      var addRow = el('div', {class: 'row-tools'});
      var input = el('input', {type: 'text', placeholder: 'Label of a new choice', style: 'flex:1;min-width:200px'});
      addRow.appendChild(input);
      addRow.appendChild(el('button', {type: 'button', class: 'small', onclick: function () {
        var label = input.value.trim() || 'A new choice.';
        var id = uniqueId(label);
        var at = sec.options.length;
        for (var i = 0; i < sec.options.length; i++) if (sec.options[i].target === '@easy_discard') { at = i; break; }
        sec.options.splice(at, 0, {target: '@' + id, label: label, props: []});
        sec.dirty = true;
        var ns = M.addSection(S.model, id);
        M.setBody(ns, 'What happens next.');
        markUnsaved();
        redrawAll();
      }}, '+ Add choice'));
      wrap.appendChild(addRow);
    }
    draw();
    return wrap;
  }

  function passageSummary(s) {
    var bits = [];
    var sub = M.getProp(s, 'subtitle');
    if (sub) bits.push(sub);
    var e = M.Effects.parse(M.getProp(s, 'on-arrival'));
    var ch = e.rows.filter(function (r) { return r.kind === 'change'; }).map(plainChange);
    if (ch.length) bits.push(ch.slice(0, 3).join(', ') + (ch.length > 3 ? '…' : ''));
    else if (e.rows.length) bits.push('runs code');
    return bits.length ? bits.join(' · ') : 'What happens';
  }

  function passageEditor(s, rendered, depth) {
    var wrap = el('div', {class: 'passage'});
    var grid = el('div', {class: 'grid'});
    grid.appendChild(el('label', {text: 'Line under the choice'}));
    grid.appendChild(el('input', {type: 'text', value: M.getProp(s, 'subtitle') || '', placeholder: 'e.g. −1 political capital. +1 evidence.',
      oninput: function (e) { M.setProp(s, 'subtitle', e.target.value); markUnsaved(); }}));
    wrap.appendChild(grid);

    var optional = [
      ['view-if', 'Only offer this choice when', 'Always offered'],
      ['choose-if', 'Only allow choosing it when', 'Always allowed']
    ];
    var adders = el('div', {class: 'row-tools'});
    optional.forEach(function (o) {
      var has = !!(M.getProp(s, o[0]) || '').trim();
      var holder = el('div');
      function show() {
        holder.innerHTML = '';
        holder.appendChild(el('h4', {text: o[1]}));
        holder.appendChild(condEditor(s, o[0], o[2]));
        if (o[0] === 'choose-if') {
          holder.appendChild(el('div', {class: 'grid'}, el('label', {text: 'Shown when it can\'t be chosen'}),
            el('input', {type: 'text', value: M.getProp(s, 'unavailable-subtitle') || '', placeholder: 'e.g. Not enough political capital.',
              oninput: function (e) { M.setProp(s, 'unavailable-subtitle', e.target.value); markUnsaved(); }})));
        }
      }
      if (has) show();
      else adders.appendChild(el('button', {type: 'button', class: 'small', onclick: function (e) { e.target.remove(); show(); }}, '+ ' + o[1].toLowerCase() + '…'));
      wrap.appendChild(holder);
    });

    wrap.appendChild(el('h4', {text: 'What it changes'}));
    wrap.appendChild(effectsEditor(s, 'on-arrival'));
    wrap.appendChild(el('h4', {text: 'Text'}));
    wrap.appendChild(proseEditor(s, false));

    var goto = M.getProp(s, 'go-to');
    var gotoHolder = el('div');
    function showGoto() {
      gotoHolder.innerHTML = '';
      gotoHolder.appendChild(el('h4', {text: 'Then go to'}));
      gotoHolder.appendChild(el('input', {type: 'text', class: 'cond code', style: 'width:100%', value: M.getProp(s, 'go-to') || '', spellcheck: 'false',
        placeholder: 'a passage id, e.g. result; or: result if capital >= 1; other if not war',
        oninput: function (e) { M.setProp(s, 'go-to', e.target.value); markUnsaved(); }}));
    }
    if (goto) showGoto();
    else adders.appendChild(el('button', {type: 'button', class: 'small', onclick: function (e) { e.target.remove(); showGoto(); }}, '+ then go to…'));
    wrap.appendChild(gotoHolder);

    if (s.options.length) {
      wrap.appendChild(el('h4', {text: 'Its own choices'}));
      wrap.appendChild(choicesEditor(s, rendered, depth));
    } else {
      adders.appendChild(el('button', {type: 'button', class: 'small', onclick: function () {
        var id = uniqueId('next');
        s.options.push({target: '@' + id, label: 'A further choice.', props: []});
        s.dirty = true;
        M.setBody(M.addSection(S.model, id), 'What happens next.');
        markUnsaved();
        redrawAll();
      }}, '+ further choices…'));
    }
    var extra = s.props.filter(function (p) { return COVERED_PASSAGE.indexOf(M.normName(p.name)) < 0; });
    if (extra.length) {
      wrap.appendChild(el('h4', {text: 'More properties'}));
      wrap.appendChild(extraProps(s, COVERED_PASSAGE));
    }
    if (adders.children.length) wrap.appendChild(adders);
    return wrap;
  }

  function redrawAll() {
    var y = $('main').scrollTop;
    var was = S.unsaved;
    renderPane();
    if (was) markUnsaved();
    $('main').scrollTop = y;
  }

  // ------------------------------------------------------------------ file actions
  function toggleDisabled() {
    var id = fileId(S.path);
    var k = S.mod.disabled.indexOf(id);
    if (k >= 0) S.mod.disabled.splice(k, 1); else S.mod.disabled.push(id);
    storeMod();
    renderList();
    redrawAll();
    toast(k >= 0 ? 'Switched back on.' : 'Switched off: it will not appear in the game.');
  }

  function revertFile() {
    if (!window.confirm('Undo all your changes to “' + titleOf(textOf(S.path)) + '” and go back to the game\'s own version?')) return;
    delete S.mod.files[S.path];
    S.unsaved = false;
    rebuild().then(function () { openPath(S.path); toast('Back to the original.'); });
  }

  function deleteFile() {
    if (!window.confirm('Delete “' + titleOf(textOf(S.path)) + '” from your mod? This cannot be undone.')) return;
    var id = fileId(S.path);
    delete S.mod.files[S.path];
    S.mod.disabled = S.mod.disabled.filter(function (d) { return d !== id; });
    S.unsaved = false;
    S.path = null;
    rebuild().then(function () {
      renderList();
      $('pane').hidden = true;
      $('welcome').hidden = false;
      toast('Deleted.');
    });
  }

  // ------------------------------------------------------------------ new cards and events
  var newKind = 'card';
  function openNew(kind) {
    newKind = kind;
    $('new-heading').textContent = kind === 'card' ? 'New card' : 'New event';
    $('new-kind-row').hidden = kind !== 'card';
    $('new-act-row').hidden = kind !== 'event';
    $('new-title').value = '';
    $('new-hint').textContent = kind === 'card'
      ? 'The card starts with two choices and a three-turn cooldown. Everything can be changed afterwards.'
      : 'The event starts once per game, from the start of the part you pick, with two choices. Everything can be changed afterwards.';
    $('dlg-new').showModal();
    $('new-title').focus();
  }

  function createNew() {
    var title = $('new-title').value.trim() || (newKind === 'card' ? 'A new card' : 'A new event');
    var group, text;
    var base = 'custom_' + M.slug(title).slice(0, 25);
    var id = base, k = 2;
    var exists = function (i) { return allPaths().some(function (p) { return fileId(p) === i; }) || Object.keys(SOURCES).some(function (p) { return fileId(p) === i; }); };
    while (exists(id)) id = base + '_' + (k++);
    if (newKind === 'card') {
      var deck = $('new-kind').value;
      group = GROUPS.filter(function (g) { return g.key === deck; })[0];
      var img = {caucus_affairs: 'img/card_routine.svg', senate_affairs: 'img/card_senate.svg', last_days: 'img/card_forces.svg'}[deck];
      text = [
        'title: ' + title,
        'subtitle: A new card.',
        'is-card: true',
        'tags: ' + deck,
        'card-image: ' + img,
        'view-if: ' + (deck === 'last_days' ? 'finale and ' : '') + id + '_timer <= 0',
        'on-arrival: turn_actions += 1; ' + id + '_timer = ' + (deck === 'last_days' ? 1 : 3) + '; last_card_timer = "' + id + '"',
        'new-page: true', '',
        '= ' + title, '',
        'Describe the situation the Caucus faces.', '',
        '- @first: The first choice.',
        '- @second: The second choice.',
        '- @easy_discard', '',
        '@first',
        'subtitle: −1 political capital.',
        'choose-if: capital >= 1',
        'unavailable-subtitle: Not enough political capital.',
        'on-arrival: capital -= 1', '',
        'What happens after the first choice.', '',
        '@second', '',
        'What happens after the second choice.', ''].join('\n');
    } else {
      var act = $('new-act').value;
      group = GROUPS.filter(function (g) { return g.key === act; })[0];
      var start = {act1: 0, act2: 24, act3: 108, act4: 132, recurring: 0, finale: 0}[act];
      var cond = act === 'finale' ? 'finale and not game_ending' : 'date >= ' + start + ' and not finale and not game_ending';
      if (act === 'act4') cond = 'war and ' + cond;
      text = [
        'title: ' + title,
        'subtitle: A new event.',
        'tags: event',
        'view-if: ' + cond,
        'max-visits: 1',
        'priority: 2',
        'new-page: true',
        'face-image: img/ev_senate.svg', '',
        '= ' + title, '',
        'Describe what happens.', '',
        '- @first: The first response.',
        '- @second: The second response.', '',
        '@first',
        'on-arrival: faith += 1', '',
        'What happens after the first response.', '',
        '@second', '',
        'What happens after the second response.', ''].join('\n');
    }
    var path = group.dir + id + '.scene.dry';
    S.mod.files[path] = {text: text, baseHash: null};
    var finish = function () { rebuild().then(function () { openPath(path); toast('Created. Edit it, then save.'); }); };
    if (S.unsaved) save().then(finish); else finish();
  }

  // ------------------------------------------------------------------ playtest
  var saveKeysCache = [];
  function savePrefix() { return S.baseGame.title + '_' + S.baseGame.author + '_save'; }
  function listSaves() {
    var out = [];
    var pre = savePrefix();
    ['a0', 'a1', 0, 1, 2, 3, 4, 5, 6, 7, 'q'].forEach(function (slot) {
      try {
        var v = localStorage.getItem(pre + '_' + slot);
        if (!v) return;
        var when = localStorage.getItem(pre + '_timestamp_' + slot) || '';
        var label = slot === 'a0' ? 'Latest autosave' : (slot === 'a1' ? 'Previous autosave' : (slot === 'q' ? 'Quick save' : 'Slot ' + (slot + 1)));
        var date = '';
        try { var st = JSON.parse(v); date = st.qualities && st.qualities.date_label ? ' · ' + st.qualities.date_label : ''; } catch (e) {}
        out.push({slot: slot, label: label + date + (when ? ' · saved ' + String(when).slice(0, 24) : ''), data: v});
      } catch (e) {}
    });
    return out;
  }

  function dateToBby(d) { return {bby: 33 - Math.floor(d / 12), month: (d % 12) + 1}; }

  // Suggestions for a playtest, from the card's or event's own condition.
  function suggestions(cond) {
    var c = M.Conditions.parse(cond);
    var out = {date: null, set: []};
    if (c.mode !== 'all') return out;
    c.terms.forEach(function (t) {
      if (t.kind === 'cmp' && t.q === 'date' && /^(>=|>|=)$/.test(t.op) && /^\d+$/.test(t.value)) out.date = parseInt(t.value, 10) + (t.op === '>' ? 1 : 0);
      else if (t.kind === 'flag' && !t.negate && !/(_timer|_seen)$/.test(t.q) && t.q !== 'date') out.set.push([t.q, '1']);
      else if (t.kind === 'cmp' && t.q !== 'date' && !/_timer$/.test(t.q) && /^-?\d+(\.\d+)?$/.test(t.value)) {
        var v = parseFloat(t.value);
        if (t.op === '>=' || t.op === '=') out.set.push([t.q, String(v)]);
        else if (t.op === '>') out.set.push([t.q, String(v + 1)]);
      } else if (t.kind === 'cmp' && (t.op === '=' || t.op === '==') && /^["']/.test(t.value)) out.set.push([t.q, t.value.replace(/^["']|["']$/g, '')]);
    });
    return out;
  }

  function addSetRow(q, v) {
    var row = el('div', {class: 'row'},
      el('button', {type: 'button', class: 'icon', 'aria-label': 'Remove', onclick: function () { row.remove(); playtestCheck(); }}, '✕'),
      el('input', {type: 'text', class: 'q code pt-q', list: 'qualities-list', value: q || '', placeholder: 'quality', oninput: playtestCheck}),
      el('span', {text: '='}),
      el('input', {type: 'text', class: 'v code pt-v', value: v === undefined ? '1' : v, oninput: playtestCheck}));
    $('pt-sets').appendChild(row);
  }

  function playtestState() {
    var start = document.querySelector('input[name=pt-start]:checked').value;
    var Q;
    var saveString = null;
    if (start === 'save' && $('pt-save').value !== '') {
      var sv = saveKeysCache[parseInt($('pt-save').value, 10)];
      saveString = sv.data;
      try { Q = JSON.parse(sv.data).qualities || {}; } catch (e) { Q = {}; }
    } else {
      Q = {};
      try { SW.newGame(Q, parseInt($('pt-difficulty').value, 10)); } catch (e) {}
      Q.started = 1;
    }
    var set = {};
    var yr = $('pt-year').value, mo = $('pt-month').value;
    if (yr !== '') { set.bby = parseInt(yr, 10); set.month = parseInt(mo, 10); }
    Array.prototype.forEach.call(document.querySelectorAll('#pt-sets .row'), function (r) {
      var q = r.querySelector('.pt-q').value.trim();
      var v = r.querySelector('.pt-v').value.trim();
      if (!q) return;
      set[q] = /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : (v === 'true' ? true : (v === 'false' ? false : v));
    });
    for (var k in set) Q[k] = set[k];
    if (set.bby !== undefined) { try { SW.updateDate(Q); } catch (e) {} }
    return {Q: Q, set: set, saveString: saveString, difficulty: parseInt($('pt-difficulty').value, 10)};
  }

  function playtestCheck() {
    var box = $('pt-check');
    box.innerHTML = '';
    var cond = M.getProp(S.model.sections[0], 'view-if');
    if (!cond || !cond.trim()) { box.appendChild(el('p', {class: 'yes', text: 'It has no condition, so it could appear at any time.'})); return; }
    var st = playtestState();
    var c = M.Conditions.parse(cond);
    var evalTerm = function (text) {
      try { return !!new Function('Q', 'return (' + M.dendryToJs(text, true) + ');')(st.Q); } catch (e) { return null; }
    };
    var all = evalTerm(cond);
    box.appendChild(el('p', {class: all ? 'yes' : 'no', text: all ? 'With this start, it would normally appear now.' :
      'With this start, it would not normally appear yet. The playtest shows it anyway.'}));
    if (c.mode !== 'raw' && !all) {
      var ul = el('ul');
      c.terms.forEach(function (t) {
        var ok = evalTerm(M.Conditions.termText(t));
        if (ok === false) ul.appendChild(el('li', {class: 'no', text: 'Not yet true: ' + (t.kind === 'raw' ? t.text : (t.kind === 'flag' ? (t.negate ? 'not ' : '') + qname(t.q) : qname(t.q) + ' ' + t.op + ' ' + t.value)) +
          (t.q && st.Q[t.q] !== undefined ? ' (now ' + st.Q[t.q] + ')' : '')}));
      });
      box.appendChild(ul);
    }
  }

  function openPlaytest() {
    var go = function () {
      if ((S.mod.errors || []).length) { toast('Fix the problems shown before playtesting.', 4000); return; }
      var top = S.model.sections[0];
      $('pt-title').textContent = '“' + (M.getProp(top, 'title') || fileId(S.path)) + '”';
      saveKeysCache = listSaves();
      var sel = $('pt-save');
      sel.innerHTML = '';
      if (!saveKeysCache.length) sel.appendChild(el('option', {value: ''}, 'No saved games in this browser'));
      saveKeysCache.forEach(function (s, k) { sel.appendChild(el('option', {value: String(k)}, s.label)); });
      document.querySelector('input[name=pt-start][value=save]').disabled = !saveKeysCache.length;
      document.querySelector('input[name=pt-start][value=new]').checked = true;
      var sug = suggestions(M.getProp(top, 'view-if'));
      var ysel = $('pt-year'), msel = $('pt-month');
      ysel.innerHTML = '';
      msel.innerHTML = '';
      ysel.appendChild(el('option', {value: ''}, 'as it is'));
      for (var y = 33; y >= 19; y--) ysel.appendChild(el('option', {value: String(y)}, y + ' BBY'));
      MONTHS.forEach(function (m, k) { msel.appendChild(el('option', {value: String(k + 1)}, m)); });
      if (sug.date !== null) { var bm = dateToBby(sug.date); ysel.value = String(bm.bby); msel.value = String(bm.month); }
      $('pt-sets').innerHTML = '';
      sug.set.forEach(function (p) { addSetRow(p[0], p[1]); });
      playtestCheck();
      $('dlg-playtest').showModal();
    };
    if (S.unsaved) save().then(go); else go();
  }

  function startPlaytest() {
    var st = playtestState();
    var pt = {scene: fileId(S.path), difficulty: st.difficulty, set: st.set};
    if (st.saveString) pt.saveString = st.saveString;
    try { localStorage.setItem(TAMod.PLAYTEST_KEY, JSON.stringify(pt)); } catch (e) { toast('This browser could not start the playtest: ' + e.message, 5000); return; }
    location.href = 'index.html?playtest=1';
  }

  // ------------------------------------------------------------------ import, export, details
  function exportMod() {
    var m = S.mod;
    var out = {format: 1, name: m.name || 'Untitled mod', author: m.author || '', notes: m.notes || '', exported: new Date().toISOString(),
      files: m.files, disabled: m.disabled, scenes: m.scenes, removed: m.removed, tags: m.tags, defaults: m.defaults, timers: m.timers};
    var blob = new Blob([JSON.stringify(out, null, 1)], {type: 'application/json'});
    var a = el('a', {href: URL.createObjectURL(blob), download: (M.slug(out.name) || 'mod') + '.tamod.json'});
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Exported ' + Object.keys(m.files).length + ' file(s).');
  }

  var pendingImport = null;
  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var data;
      try { data = JSON.parse(r.result); } catch (e) { toast('That file is not a mod (it is not valid JSON).', 4000); return; }
      if (!data || typeof data.files !== 'object') { toast('That file is not a mod made with this editor.', 4000); return; }
      pendingImport = normalizeMod(data);
      var n = Object.keys(pendingImport.files).length;
      $('import-summary').textContent = '“' + (pendingImport.name || 'Untitled mod') + '”' + (pendingImport.author ? ' by ' + pendingImport.author : '') +
        ': ' + n + ' card/event file(s)' + (pendingImport.disabled.length ? ', ' + pendingImport.disabled.length + ' switched off' : '') + '.' +
        (pendingImport.notes ? ' ' + pendingImport.notes : '');
      $('dlg-import').showModal();
    };
    r.readAsText(file);
  }

  function finishImport(how) {
    var imp = pendingImport;
    pendingImport = null;
    if (!imp || (how !== 'merge' && how !== 'replace')) return;
    if (how === 'replace') {
      S.mod = imp;
      S.mod.enabled = true;
    } else {
      Object.keys(imp.files).forEach(function (p) { S.mod.files[p] = imp.files[p]; });
      imp.disabled.forEach(function (d) { if (S.mod.disabled.indexOf(d) < 0) S.mod.disabled.push(d); });
    }
    S.unsaved = false;
    S.path = null;
    rebuild().then(function () {
      syncModBar();
      renderList();
      $('pane').hidden = true;
      $('welcome').hidden = false;
      toast(how === 'replace' ? 'Mod loaded.' : 'Mod merged into yours.');
    });
  }

  function openDetails() {
    var m = S.mod;
    $('mod-author').value = m.author || '';
    $('mod-notes').value = m.notes || '';
    var body = $('details-body');
    body.innerHTML = '';
    var files = Object.keys(m.files);
    var rows = [
      ['Edited', files.filter(function (p) { return SOURCES[p] !== undefined; }).map(function (p) { return titleOf(m.files[p].text); }).join(', ') || 'none'],
      ['New', files.filter(function (p) { return SOURCES[p] === undefined; }).map(function (p) { return titleOf(m.files[p].text); }).join(', ') || 'none'],
      ['Switched off', m.disabled.join(', ') || 'none'],
      ['New qualities (start at 0)', Object.keys(m.defaults || {}).join(', ') || 'none'],
      ['New cooldowns', (m.timers || []).join(', ') || 'none'],
      ['Scenes changed in the game', String(Object.keys(m.scenes || {}).length)]
    ];
    body.appendChild(el('table', null, rows.map(function (r) { return el('tr', null, el('td', null, el('b', {text: r[0]})), el('td', {text: r[1]})); })));
    if ((m.errors || []).length) body.appendChild(el('div', {class: 'notice error', text: (m.errors.length) + ' problem(s) to fix; the game is using the last version that worked.'}));
    $('dlg-details').showModal();
  }

  function syncModBar() {
    $('mod-name').value = S.mod.name || '';
    $('mod-enabled').checked = !!S.mod.enabled;
  }

  // ------------------------------------------------------------------ start up
  function fillQualityList() {
    var names = {};
    Object.keys(S.defaults).forEach(function (k) { names[k] = 1; });
    Object.keys(S.baseKnown).forEach(function (k) { names[k] = 1; });
    var dl = $('qualities-list');
    Object.keys(names).sort().forEach(function (k) {
      if (/^(el_opt|jm_|st_)/.test(k)) return;
      var n = N.name(k);
      dl.appendChild(el('option', {value: k}, n || null));
    });
  }

  function init() {
    try { if (localStorage.getItem('Thunderous Applause: An Alternate History of the Galactic Republic_dark_mode') === 'true') document.body.classList.add('dark'); } catch (e) {}
    try { S.defaults = SW.DEFAULTS(); } catch (e) { S.defaults = {}; }
    S.mod = normalizeMod(TAMod.readMod(localStorage));
    syncModBar();

    $('mod-name').addEventListener('input', function (e) { S.mod.name = e.target.value; storeMod(); });
    $('mod-enabled').addEventListener('change', function (e) {
      S.mod.enabled = e.target.checked; storeMod();
      toast(e.target.checked ? 'The game will be played with this mod.' : 'The game will be played without this mod.');
    });
    $('btn-export').addEventListener('click', exportMod);
    $('btn-import').addEventListener('click', function () { $('import-file').value = ''; $('import-file').click(); });
    $('import-file').addEventListener('change', function (e) { if (e.target.files[0]) importFile(e.target.files[0]); });
    $('dlg-import').addEventListener('close', function () { finishImport($('dlg-import').returnValue); });
    $('btn-details').addEventListener('click', openDetails);
    $('dlg-details').addEventListener('close', function () {
      S.mod.author = $('mod-author').value;
      S.mod.notes = $('mod-notes').value;
      storeMod();
      if ($('dlg-details').returnValue === 'reset') {
        if (window.confirm('Delete this whole mod, with all its edited and new cards and events? Export it first if you want to keep a copy.')) {
          S.mod = newMod();
          storeMod();
          S.path = null;
          S.unsaved = false;
          syncModBar();
          renderList();
          $('pane').hidden = true;
          $('welcome').hidden = false;
          toast('The mod has been deleted.');
        }
      }
    });
    $('search').addEventListener('input', renderList);
    $('new-card').addEventListener('click', function () { openNew('card'); });
    $('new-event').addEventListener('click', function () { openNew('event'); });
    $('dlg-new').addEventListener('close', function () { if ($('dlg-new').returnValue === 'create') createNew(); });
    $('dlg-playtest').addEventListener('close', function () { if ($('dlg-playtest').returnValue === 'go') startPlaytest(); });
    $('pt-add-set').addEventListener('click', function () { addSetRow('', '1'); });
    ['pt-difficulty', 'pt-save', 'pt-year', 'pt-month'].forEach(function (id) { $(id).addEventListener('change', playtestCheck); });
    Array.prototype.forEach.call(document.querySelectorAll('input[name=pt-start]'), function (r) { r.addEventListener('change', function () {
      if (r.value === 'save' && r.checked) $('pt-year').value = '';
      playtestCheck();
    }); });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (S.path) save(); }
    });
    window.addEventListener('beforeunload', function (e) {
      if (S.unsaved) { e.preventDefault(); e.returnValue = ''; }
    });

    if (!window.DryCompiler || !Object.keys(SOURCES).length) {
      $('loading').textContent = 'The editor\'s files are missing. Build them with: node tools/build_editor.js';
      return;
    }
    compileGame(SOURCES).then(function (g) {
      S.baseGame = g;
      S.baseKnown = namesInCode(JSON.stringify(g.scenes), {});
      fillQualityList();
      // bring the mod up to date with this version of the game
      return Object.keys(S.mod.files).length ? rebuild() : true;
    }).then(function () {
      $('loading').hidden = true;
      renderList();
      var cards = allPaths().filter(function (p) { return kindOf(p) === 'card'; }).length;
      var events = allPaths().filter(function (p) { return kindOf(p) === 'event'; }).length;
      $('welcome-stats').textContent = 'The game has ' + cards + ' cards and ' + events + ' events.' +
        (Object.keys(S.mod.files).length ? ' Your mod changes ' + Object.keys(S.mod.files).length + ' of them.' : '');
      var hash = decodeURIComponent((location.hash || '').slice(1));
      var target = hash && allPaths().filter(function (p) { return fileId(p) === hash; })[0];
      if (target) openPath(target); else $('welcome').hidden = false;
      window.addEventListener('hashchange', function () {
        var h = decodeURIComponent((location.hash || '').slice(1));
        var t = h && allPaths().filter(function (p) { return fileId(p) === h; })[0];
        if (t && t !== S.path) openPath(t);
      });
      window.TA_EDITOR_READY = true;
    }).catch(function (err) {
      $('loading').textContent = 'The game\'s sources could not be compiled: ' + (err && err.message || err);
    });
  }

  window.TAEditor = {state: S, save: save, openPath: openPath, rebuild: rebuild};
  init();
}());
