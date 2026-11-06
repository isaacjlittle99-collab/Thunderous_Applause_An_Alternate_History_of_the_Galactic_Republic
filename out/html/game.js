(function() {
  var game;
  var ui;

  var DateOptions = {hour: 'numeric',
                 minute: 'numeric',
                 second: 'numeric',
                 year: 'numeric',
                 month: 'short',
                 day: 'numeric' };

  var main = function(dendryUI) {
    ui = dendryUI;
    game = ui.game;

    // Add your custom code here.
  };

  var TITLE = "Thunderous Applause: An Alternate History of the Galactic Republic" + '_' + "isaacjlittle99-collab, after Autumn Chen";

  window.showStats = function() {
    if (window.dendryUI.dendryEngine.state.sceneId.startsWith('library')) {
        window.dendryUI.dendryEngine.goToScene('backSpecialScene');
    } else {
        window.dendryUI.dendryEngine.goToScene('library');
    }
  };
  
  window.showOptions = function() {
      var save_element = document.getElementById('options');
      window.populateOptions();
      save_element.style.display = "block";
      if (!save_element.onclick) {
          save_element.onclick = function(evt) {
              var target = evt.target;
              var save_element = document.getElementById('options');
              if (target == save_element) {
                  window.hideOptions();
              }
          };
      }
  };

  window.hideOptions = function() {
      var save_element = document.getElementById('options');
      save_element.style.display = "none";
  };

  window.disableBg = function() {
      window.dendryUI.disable_bg = true;
      document.body.style.backgroundImage = 'none';
      window.dendryUI.saveSettings();
  };

  window.enableBg = function() {
      window.dendryUI.disable_bg = false;
      window.dendryUI.setBg(window.dendryUI.dendryEngine.state.bg);
      window.dendryUI.saveSettings();
  };

  window.disableAnimate = function() {
      window.dendryUI.animate = false;
      window.dendryUI.saveSettings();
  };

  window.enableAnimate = function() {
      window.dendryUI.animate = true;
      window.dendryUI.saveSettings();
  };

  window.disableAnimateBg = function() {
      window.dendryUI.animate_bg = false;
      window.dendryUI.saveSettings();
  };

  window.enableAnimateBg = function() {
      window.dendryUI.animate_bg = true;
      window.dendryUI.saveSettings();
  };

  window.disableAudio = function() {
      window.dendryUI.toggle_audio(false);
      window.dendryUI.saveSettings();
  };

  window.enableAudio = function() {
      window.dendryUI.toggle_audio(true);
      window.dendryUI.saveSettings();
  };

  window.enableImages = function() {
    window.dendryUI.show_portraits = true;
    window.dendryUI.saveSettings();
   };

  window.disableImages = function() {
    window.dendryUI.show_portraits = false;
    window.dendryUI.saveSettings();
};

window.enableLightMode = function() {
    window.dendryUI.dark_mode = false;
    document.body.classList.remove('dark-mode');
    window.dendryUI.saveSettings();
    if (window.updateSidebar) { window.updateSidebar(); window.updateSidebarRight(); }
};
window.enableDarkMode = function() {
    window.dendryUI.dark_mode = true;
    document.body.classList.add('dark-mode');
    window.dendryUI.saveSettings();
    if (window.updateSidebar) { window.updateSidebar(); window.updateSidebarRight(); }
};

window.enableGrayMode = function() {
    window.dendryUI.gray_mode = true;
    document.body.classList.add('gray-mode');
    window.dendryUI.saveSettings();
};
window.disableGrayMode = function() {
    window.dendryUI.gray_mode = false;
    document.body.classList.remove('gray-mode');
    window.dendryUI.saveSettings();
};

  // populates the checkboxes in the options view
  window.populateOptions = function() {
    var disable_bg = window.dendryUI.disable_bg;
    var animate = window.dendryUI.animate;
    var disable_audio = window.dendryUI.disable_audio;
    var show_portraits = window.dendryUI.show_portraits;
    if (disable_bg) {
        $('#backgrounds_no')[0].checked = true;
    } else {
        $('#backgrounds_yes')[0].checked = true;
    }
    if (animate) {
        $('#animate_yes')[0].checked = true;
    } else {
        $('#animate_no')[0].checked = true;
    }
    if (disable_audio) {
        $('#audio_no')[0].checked = true;
    } else {
        $('#audio_yes')[0].checked = true;
    }
    if (show_portraits) {
        $('#images_yes')[0].checked = true;
    } else {
        $('#images_no')[0].checked = true;
    }
    if (window.dendryUI.dark_mode) {
        $('#dark_mode')[0].checked = true;
    } else {
        $('#light_mode')[0].checked = true;
    }
    if (window.dendryUI.gray_mode) {
        $('#gray_on')[0].checked = true;
    } else {
        $('#gray_no')[0].checked = true;
    }
  };

  
  // This function allows you to modify the text before it's displayed.
  // E.g. wrapping chat-like messages in spans.
  window.displayText = function(text) {
      return text;
  };

  // This function allows you to do something in response to signals.
  window.handleSignal = function(signal, event, scene_id) {
  };
  
  // This function runs on a new page. Right now, this auto-saves.
  window.onNewPage = function() {
    var scene = window.dendryUI.dendryEngine.state.sceneId;
    if (scene != 'root' && !window.justLoaded) {
        window.dendryUI.autosave();
    }
    if (window.justLoaded) {
        window.justLoaded = false;
    }
  };

  window.updateSidebar = function() {
      $('#qualities').empty();
      var scene = dendryUI.game.scenes[window.statusTab];
      dendryUI.dendryEngine._runActions(scene.onArrival);
      var displayContent = dendryUI.dendryEngine._makeDisplayContent(scene.content, true);
      $('#qualities').append(dendryUI.contentToHTML.convert(displayContent));
  };

  window.updateSidebarRight = function() {
    $('#qualities_right').empty();
    var scene = dendryUI.game.scenes[window.statusTabRight];
    dendryUI.dendryEngine._runActions(scene.onArrival);
    var displayContent = dendryUI.dendryEngine._makeDisplayContent(scene.content, true);
    $('#qualities_right').append(dendryUI.contentToHTML.convert(displayContent));
};

  window.changeTab = function(newTab, tabId, isRight) {
      var tabButton = document.getElementById(tabId);
      var tabButtons = document.getElementsByClassName('tab_button');
      for (var i = 0; i < tabButtons.length; i++) {
        if (!!isRight === (tabButtons[i].id === 'chancellery_tab')) {
          tabButtons[i].className = tabButtons[i].className.replace(' active', '');
        }
      }
      tabButton.className += ' active';
      if (isRight) {
        window.statusTabRight = newTab;
        window.updateSidebarRight();
        } else {
          window.statusTab = newTab;
          window.updateSidebar();
    }
  };

  window.onDisplayContent = function() {
      window.updateSidebar();
      window.updateSidebarRight();
  };

  window.toggleById = function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none';
  };

  /*
   * This function copied from the code for Infinite Space Battle Simulator
   *
   * quality - a number between max and min
   * qualityName - the name of the quality
   * max and min - numbers
   * colors - if true/1, will use some color scheme - green to yellow to red for high to low
   * */
  window.generateBar = function(quality, qualityName, max, min, colors) {
      var bar = document.createElement('div');
      bar.className = 'bar';
      var value = document.createElement('div');
      value.className = 'barValue';
      var width = (quality - min)/(max - min);
      if (width > 1) {
          width = 1;
      } else if (width < 0) {
          width = 0;
      }
      value.style.width = Math.round(width*100) + '%';
      if (colors) {
          value.style.backgroundColor = window.probToColor(width*100);
      }
      bar.textContent = qualityName + ': ' + quality;
      if (colors) {
          bar.textContent += '/' + max;
      }
      bar.appendChild(value);
      return bar;
  };


  // ------------------------------------------------------------------
  // "Install game": one click adds the game to the Start menu / desktop
  // as an app (Edge and Chrome), via the browser's install prompt.
  var deferredInstall = null;
  function isInstalledApp() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }
  function showInstallLink(show) {
    var el = document.getElementById('install-link');
    if (el) el.style.display = show ? '' : 'none';
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    if (!isInstalledApp()) showInstallLink(true);
  });
  window.addEventListener('appinstalled', function () {
    deferredInstall = null;
    showInstallLink(false);
  });
  window.installGame = function () {
    if (deferredInstall) {
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function (choice) {
        if (choice.outcome === 'accepted') showInstallLink(false);
        deferredInstall = null;
      });
      return;
    }
    window.alert('To install Thunderous Applause as an app:\n\n' +
      '1. Open this page in Microsoft Edge or Google Chrome.\n' +
      '2. Click the "Install" icon at the right-hand end of the address bar ' +
      '(in Edge you can also use the menu: Apps > Install this site as an app).\n\n' +
      'The game then appears in your Start menu and can be pinned to the taskbar.');
  };

  // ------------------------------------------------------------------ custom art
  // Every image is a named slot (its file name without the extension). A player can replace any
  // slot with their own picture: chosen in Options (kept in this browser only, in IndexedDB), or
  // listed in img/custom/art.json next to the game. Browser choices win over the folder.
  var ART_GROUPS = [
    ['Background', ['bg_galaxy']],
    ['Decks', ['deck_caucus', 'deck_senate', 'deck_last_days']],
    ['Advisors', ['adv_antilles', 'adv_organa', 'adv_amidala', 'adv_valorum', 'adv_mothma', 'adv_farr', 'adv_chuchi', 'adv_bel_iblis']],
    ['Cards', ['card_campaign', 'card_civil', 'card_clones', 'card_confront', 'card_credits', 'card_disunity', 'card_enemy',
      'card_forces', 'card_holonet', 'card_jedi', 'card_law', 'card_pact', 'card_peace', 'card_platform', 'card_relations',
      'card_rim', 'card_routine', 'card_senate', 'card_shadow', 'card_shuffle']],
    ['Event pictures', ['ev_senate', 'ev_jedi', 'ev_shadow', 'ev_war', 'ev_trade', 'ev_chancellery', 'ev_naboo', 'ev_separatist',
      'ev_rim', 'ev_clones', 'ev_peace', 'ev_holonet', 'ev_law']]
  ];
  var ART_DEFAULT_EXT = {bg_galaxy: 'jpg'};
  var artFolder = {}, artBrowser = {};
  var artUrl = function (slot) { return artBrowser[slot] || artFolder[slot] || null; };
  var slotOf = function (url) {
    var m = /(?:^|\/)img\/([a-z0-9_]+)\.(svg|jpe?g|png|webp)(?:[?#].*)?$/i.exec(url || '');
    return m ? m[1] : null;
  };
  var artLabel = function (slot) {
    return slot.replace(/^(card|deck|adv|ev|bg)_/, '').replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  };
  var swapImg = function (img) {
    var orig = img.getAttribute('data-art-orig') || img.getAttribute('src');
    var slot = slotOf(orig);
    if (!slot) return;
    var u = artUrl(slot);
    if (u) {
      if (!img.getAttribute('data-art-orig')) img.setAttribute('data-art-orig', orig);
      if (img.getAttribute('src') !== u) img.setAttribute('src', u);
    } else if (img.getAttribute('data-art-orig')) {
      img.setAttribute('src', orig);
      img.removeAttribute('data-art-orig');
    }
  };
  var refreshArt = function () {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) if (!imgs[i].closest('#custom_art')) swapImg(imgs[i]);
    var ui = window.dendryUI;
    if (ui && ui.dendryEngine && ui.dendryEngine.state && ui.dendryEngine.state.bg) ui.setBg(ui.dendryEngine.state.bg);
  };
  var openArtDB = function () {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open('thunderous-applause-art', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('images'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
  };
  var artTx = function (mode, fn) {
    return openArtDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('images', mode);
        var out = fn(tx.objectStore('images'));
        tx.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  };
  var loadBrowserArt = function () {
    return openArtDB().then(function (db) {
      return new Promise(function (resolve) {
        var store = db.transaction('images', 'readonly').objectStore('images');
        var req = store.openCursor();
        for (var k in artBrowser) { try { URL.revokeObjectURL(artBrowser[k]); } catch (e) {} }
        artBrowser = {};
        req.onsuccess = function () {
          var c = req.result;
          if (c) { artBrowser[c.key] = URL.createObjectURL(c.value); c.continue(); } else resolve();
        };
        req.onerror = function () { resolve(); };
      });
    }).catch(function () {});
  };
  var loadFolderArt = function () {
    if (!/^https?:$/.test(location.protocol) || !window.fetch) return Promise.resolve();
    return fetch('img/custom/art.json', {cache: 'no-store'}).then(function (r) { return r.ok ? r.json() : {}; }).then(function (map) {
      artFolder = {};
      for (var slot in map) if (typeof map[slot] === 'string' && /^[\w .\-]+$/.test(map[slot])) artFolder[slot] = 'img/custom/' + map[slot];
    }).catch(function () {});
  };
  var setupArt = function () {
    var ui = window.dendryUI;
    if (ui && !ui._artWrapped) {
      var origSetBg = ui.setBg;
      ui.setBg = function (u) {
        var slot = slotOf(u);
        return origSetBg.call(this, (slot && artUrl(slot)) || u);
      };
      ui._artWrapped = true;
    }
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1 || (n.closest && n.closest('#custom_art'))) continue;
            if (n.tagName === 'IMG') swapImg(n);
            else if (n.querySelectorAll) { var imgs = n.querySelectorAll('img'); for (var k = 0; k < imgs.length; k++) swapImg(imgs[k]); }
          }
        }
      }).observe(document.body, {childList: true, subtree: true});
    }
    Promise.all([loadFolderArt(), loadBrowserArt()]).then(refreshArt);
  };

  var renderArtManager = function () {
    var box = document.getElementById('custom_art_list');
    if (!box) return;
    var html = '';
    ART_GROUPS.forEach(function (g) {
      html += '<h3>' + g[0] + '</h3><div class="art-grid">';
      g[1].forEach(function (slot) {
        var def = 'img/' + slot + '.' + (ART_DEFAULT_EXT[slot] || 'svg');
        var mine = artBrowser[slot] ? 'yours' : (artFolder[slot] ? 'folder' : '');
        html += '<div class="art-slot' + (slot.indexOf('bg_') === 0 ? ' wide' : '') + '">' +
          '<img src="' + (artUrl(slot) || def) + '" alt="">' + artLabel(slot) +
          (mine ? ' <span class="custom-mark">(' + (mine === 'yours' ? 'yours' : 'from folder') + ')</span>' : '') + '<br>' +
          '<button onclick="window.chooseArt(\'' + slot + '\')">Choose…</button>' +
          (artBrowser[slot] ? '<button onclick="window.resetArt(\'' + slot + '\')">Reset</button>' : '') +
          '</div>';
      });
      html += '</div>';
    });
    box.innerHTML = html;
  };
  window.showCustomArt = function () {
    window.hideOptions && window.hideOptions();
    document.getElementById('custom_art').style.display = 'block';
    renderArtManager();
  };
  window.hideCustomArt = function () { document.getElementById('custom_art').style.display = 'none'; };
  window.chooseArt = function (slot) {
    var input = document.getElementById('custom_art_file');
    input.value = '';
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { window.alert('Please choose an image file.'); return; }
      artTx('readwrite', function (store) { return store.put(f, slot); })
        .then(loadBrowserArt).then(function () { refreshArt(); renderArtManager(); })
        .catch(function () { window.alert('This browser could not store the image (private browsing can block it).'); });
    };
    input.click();
  };
  window.resetArt = function (slot) {
    artTx('readwrite', function (store) { return store.delete(slot); })
      .then(loadBrowserArt).then(function () { refreshArt(); renderArtManager(); }).catch(function () {});
  };
  window.resetAllArt = function () {
    if (!window.confirm('Remove all the images you have chosen and go back to the game\'s own art?')) return;
    artTx('readwrite', function (store) { return store.clear(); })
      .then(loadBrowserArt).then(function () { refreshArt(); renderArtManager(); }).catch(function () {});
  };

  window.justLoaded = true;
  window.statusTab = "status";
  window.statusTabRight = "status_right";
  window.dendryModifyUI = main;
  console.log("Modifying stats: see dendryUI.dendryEngine.state.qualities");

  window.onload = function() {
    // light panels over the galaxy map are the default; dark mode stays in Options
    window.dendryUI.loadSettings({show_portraits: true, dark_mode: false});
    try {
      // players from before the map existed had the dark theme by default: switch them once
      var themeKey = window.dendryUI.game.title + '_theme_v2';
      if (!localStorage[themeKey]) {
        window.dendryUI.dark_mode = false;
        window.dendryUI.saveSettings();
        localStorage[themeKey] = '1';
      }
    } catch (e) {}
    setupArt();
    if (window.dendryUI.dark_mode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    if (window.dendryUI.gray_mode) {
        document.body.classList.add('gray-mode');
    }
    window.pinnedCardsDescription = "Advisors - one shared action every few turns.";
    window.statusTab = "status";
    window.updateSidebar();
    window.statusTabRight = "status_right";
    window.updateSidebarRight();
    // offer installation when the game is on the web and not already installed
    if (/^https?:$/.test(location.protocol) && !isInstalledApp()) showInstallLink(true);
  };

}());
