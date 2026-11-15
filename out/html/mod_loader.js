/*
 * mod_loader.js - applies a mod made with the card and event editor (editor.html).
 *
 * Loaded after core.js and before game.js: core.js has put the compiled game in window.game.compiled
 * and turns it into a running game once the page is ready, so a mod spliced in here is what gets played.
 *
 * A mod lives in localStorage under 'ta_mod':
 *   {format, name, author, notes, enabled,
 *    files:    {path: {text, baseHash}}          the edited or new .scene.dry files (for people and tools)
 *    scenes:   {sceneId: compiledScene}          the compiled scenes that differ from the game's own
 *    removed:  [sceneId]                          the game's scenes the mod deletes (removed passages)
 *    disabled: [sceneId]                          cards and events switched off
 *    tags:     {tag: {sceneId: 1 | 0}}            additions to and removals from the deck and event lists
 *    defaults: {quality: value}, timers: [name]}  new qualities and card cooldowns
 *
 * Add ?nomod to the address to start the game without the mod.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.TAMod = api;
    if (root.game && root.game.compiled) api.install(root);
  }
}(this, function () {
  'use strict';

  var KEY = 'ta_mod';
  var PLAYTEST_KEY = 'ta_playtest';

  function readMod(storage) {
    try {
      var raw = storage && storage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeMod(storage, mod) {
    storage.setItem(KEY, JSON.stringify(mod));
  }

  // Splice a mod into a compiled game object (as parsed from game.json). Returns the game.
  function applyToGame(game, mod) {
    var scenes = game.scenes;
    (mod.removed || []).forEach(function (id) { delete scenes[id]; });
    var s = mod.scenes || {};
    for (var id in s) if (Object.prototype.hasOwnProperty.call(s, id)) scenes[id] = s[id];
    (mod.disabled || []).forEach(function (did) {
      if (scenes[did]) scenes[did].viewIf = {$code: 'return false;'};
    });
    var tags = mod.tags || {};
    game.tagLookup = game.tagLookup || {};
    for (var tag in tags) {
      if (!game.tagLookup[tag]) game.tagLookup[tag] = {};
      for (var sid in tags[tag]) {
        if (tags[tag][sid]) game.tagLookup[tag][sid] = true;
        else delete game.tagLookup[tag][sid];
      }
    }
    return game;
  }

  // What a modded compile changes compared with the game's own compile (both in game.json form).
  function diffGames(base, modded) {
    var out = {scenes: {}, removed: [], tags: {}};
    var id;
    for (id in modded.scenes) {
      if (!base.scenes[id] || JSON.stringify(base.scenes[id]) !== JSON.stringify(modded.scenes[id])) out.scenes[id] = modded.scenes[id];
    }
    for (id in base.scenes) if (!modded.scenes[id]) out.removed.push(id);
    var bt = base.tagLookup || {}, mt = modded.tagLookup || {};
    var all = {};
    var t;
    for (t in bt) all[t] = 1;
    for (t in mt) all[t] = 1;
    for (t in all) {
      var b = bt[t] || {}, m = mt[t] || {};
      var sid;
      for (sid in m) if (!b[sid]) { (out.tags[t] = out.tags[t] || {})[sid] = 1; }
      for (sid in b) if (!m[sid]) { (out.tags[t] = out.tags[t] || {})[sid] = 0; }
    }
    return out;
  }

  // Give the simulation the mod's new qualities and card cooldowns.
  function registerQualities(SW, mod) {
    if (!SW || SW.__modRegistered) return;
    SW.__modRegistered = true;
    (mod.timers || []).forEach(function (t) { if (SW.TIMERS.indexOf(t) < 0) SW.TIMERS.push(t); });
    var defaults = mod.defaults || {};
    var name = mod.name || 'a mod';
    var original = SW.DEFAULTS;
    SW.DEFAULTS = function () {
      var D = original.apply(this, arguments);
      for (var k in defaults) if (D[k] === undefined) D[k] = defaults[k];
      for (var ti = 0; ti < (mod.timers || []).length; ti++) if (D[mod.timers[ti] + '_timer'] === undefined) D[mod.timers[ti] + '_timer'] = 0;
      D.modded_with = name;
      return D;
    };
  }

  function install(win) {
    var status = {active: false, name: '', error: '', playtest: null};
    win.TA_MOD_STATUS = status;
    var storage;
    try { storage = win.localStorage; } catch (e) { return status; }
    var search = (win.location && win.location.search) || '';
    if (/[?&]playtest=1\b/.test(search)) {
      try { status.playtest = JSON.parse(storage.getItem(PLAYTEST_KEY) || 'null'); } catch (e) { status.playtest = null; }
    }
    if (/[?&]nomod\b/.test(search)) return status;
    var mod = readMod(storage);
    if (!mod || (!mod.enabled && !status.playtest)) return status;
    try {
      var game = JSON.parse(win.game.compiled);
      applyToGame(game, mod);
      win.game.compiled = JSON.stringify(game);
      registerQualities(win.SW, mod);
      status.active = true;
      status.name = mod.name || 'Untitled mod';
    } catch (e) {
      status.error = String(e && e.message || e);
      if (win.console) win.console.error('The mod could not be loaded:', e);
    }
    return status;
  }

  return {
    KEY: KEY,
    PLAYTEST_KEY: PLAYTEST_KEY,
    readMod: readMod,
    writeMod: writeMod,
    applyToGame: applyToGame,
    diffGames: diffGames,
    registerQualities: registerQualities,
    install: install
  };
}));
