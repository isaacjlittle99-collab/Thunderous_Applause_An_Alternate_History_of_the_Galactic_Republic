/*
 * offline-worker.js - lets the installed game start and play without an internet connection.
 * (Named so it is not confused with sw.js, which holds the game's simulation logic.)
 *
 * Strategy: precache the whole game on install; afterwards serve from the cache and refresh
 * it in the background, so a new version arrives the next time the game is opened.
 * Bump CACHE when the list of files changes.
 */
var CACHE = 'thunderous-applause-v1';
var SHELL = [
  "./",
  "index.html",
  "core.js",
  "game.js",
  "game.css",
  "sw.js",
  "sw_ui.js",
  "jquery-1.11.1.min.js",
  "d3.v7.min.js",
  "d3-parliament.js",
  "d3-linegraph.js",
  "favicon.ico",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png"
];
var IMAGES = [
  "img/adv_amidala.svg",
  "img/adv_antilles.svg",
  "img/adv_bel_iblis.svg",
  "img/adv_chuchi.svg",
  "img/adv_farr.svg",
  "img/adv_mothma.svg",
  "img/adv_organa.svg",
  "img/adv_valorum.svg",
  "img/bg_senate.svg",
  "img/bg_stars.svg",
  "img/card_campaign.svg",
  "img/card_civil.svg",
  "img/card_clones.svg",
  "img/card_confront.svg",
  "img/card_credits.svg",
  "img/card_disunity.svg",
  "img/card_enemy.svg",
  "img/card_forces.svg",
  "img/card_holonet.svg",
  "img/card_jedi.svg",
  "img/card_law.svg",
  "img/card_pact.svg",
  "img/card_peace.svg",
  "img/card_platform.svg",
  "img/card_relations.svg",
  "img/card_rim.svg",
  "img/card_routine.svg",
  "img/card_senate.svg",
  "img/card_shadow.svg",
  "img/card_shuffle.svg",
  "img/deck_caucus.svg",
  "img/deck_last_days.svg",
  "img/deck_senate.svg",
  "img/ev_chancellery.svg",
  "img/ev_clones.svg",
  "img/ev_holonet.svg",
  "img/ev_jedi.svg",
  "img/ev_law.svg",
  "img/ev_naboo.svg",
  "img/ev_peace.svg",
  "img/ev_rim.svg",
  "img/ev_senate.svg",
  "img/ev_separatist.svg",
  "img/ev_shadow.svg",
  "img/ev_trade.svg",
  "img/ev_war.svg"
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // the shell must all succeed; images are best-effort
      return cache.addAll(SHELL).then(function () {
        return Promise.all(IMAGES.map(function (u) { return cache.add(u).catch(function () {}); }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, {ignoreSearch: true}).then(function (cached) {
        var network = fetch(req).then(function (resp) {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
