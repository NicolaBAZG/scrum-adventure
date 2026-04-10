// ── SCRUM ADVENTURE API CLIENT v3 ────────────────────────────────────────────
// Multi-player safe: each player's data is keyed by name+team in localStorage.
// sessionStorage holds the CURRENT SESSION's player key so different people
// can play on the same device without overwriting each other.
(function () {
  'use strict';

  var API = window.location.origin + '/api';
  var QUEST_ORDER = ['forest', 'huette', 'bit', 'marzili', 'olymp'];
  var QUEST_URLS  = {
    forest:  '/quest-forest',
    huette:  '/quest-huette',
    bit:     '/quest-bit',
    marzili: '/quest-marzili',
    olymp:   '/quest-olymp',
  };

  // ── PLAYER-KEYED STORAGE ──────────────────────────────────────────────────
  // Each player gets their own localStorage namespace: sa_p:{name}:{team}
  // sessionStorage remembers WHO is playing in THIS browser tab/session.

  function playerKey(name, team) {
    return 'sa_p:' + (name || '') + ':' + (team || '');
  }

  function getSessionKey() {
    return sessionStorage.getItem('sa_current') || null;
  }

  function setSessionKey(name, team) {
    sessionStorage.setItem('sa_current', playerKey(name, team));
  }

  function getPlayer() {
    var key = getSessionKey();
    if (!key) return null;
    try { return JSON.parse(localStorage.getItem(key + '_player') || 'null'); } catch { return null; }
  }

  function setPlayer(p) {
    if (!p) return;
    var key = playerKey(p.name, p.team);
    setSessionKey(p.name, p.team);
    localStorage.setItem(key + '_player', JSON.stringify(p));
  }

  function getProgress() {
    var key = getSessionKey();
    if (!key) return [];
    try { return JSON.parse(localStorage.getItem(key + '_progress') || '[]'); } catch { return []; }
  }

  function setProgress(prog) {
    var key = getSessionKey();
    if (!key) return;
    localStorage.setItem(key + '_progress', JSON.stringify(prog));
  }

  function getQuestRow(quest) {
    var all = getProgress();
    for (var i = 0; i < all.length; i++) { if (all[i].quest === quest) return all[i]; }
    return { quest: quest, errors: 0, completed: false, final_sp: null };
  }

  function isCompleted(quest) { return !!getQuestRow(quest).completed; }

  function allQuestsDone() {
    return QUEST_ORDER.every(function(q) { return isCompleted(q); });
  }

  function totalSP() {
    return getProgress().filter(function(p){ return p.completed; })
      .reduce(function(s, p){ return s + (p.final_sp || 0); }, 0);
  }

  // ── ENFORCE RESUME ─────────────────────────────────────────────────────────
  function enforceResume(thisQuest) {
    var player = getPlayer();
    if (!player) { window.location.href = '/welcome'; return; }

    if (allQuestsDone() && thisQuest !== 'olymp') {
      window.location.href = '/quest-olymp'; return;
    }

    var allowed = QUEST_ORDER.find(function(q){ return !isCompleted(q); }) || 'olymp';
    var thisIdx    = QUEST_ORDER.indexOf(thisQuest);
    var allowedIdx = QUEST_ORDER.indexOf(allowed);

    if (thisIdx > allowedIdx) {
      window.location.href = QUEST_URLS[allowed];
    }
  }

  // ── SP TRACKING ────────────────────────────────────────────────────────────
  function addError(quest) {
    var all = getProgress();
    var row = all.find(function(p){ return p.quest === quest; });
    if (row) row.errors = (row.errors || 0) + 1;
    else all.push({ quest: quest, errors: 1, completed: false, final_sp: null });
    setProgress(all);
    var player = getPlayer();
    if (player && player.id) {
      fetch(API + '/progress/error', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id, quest: quest })
      }).catch(function(){});
    }
  }

  function completeQuest(quest) {
    var all    = getProgress();
    var row    = all.find(function(p){ return p.quest === quest; });
    var errors = row ? (row.errors || 0) : 0;
    var sp     = Math.max(0, 100 - errors * 10);
    if (row) { row.completed = true; row.final_sp = sp; }
    else all.push({ quest: quest, errors: 0, completed: true, final_sp: sp });
    setProgress(all);
    var player = getPlayer();
    if (player && player.id) {
      fetch(API + '/progress/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id, quest: quest })
      }).then(function(r){ return r.ok ? r.json() : null; })
        .then(function(updated) {
          if (!updated) return;
          var newAll = getProgress();
          var idx = newAll.findIndex(function(p){ return p.quest === quest; });
          var merged = { quest: updated.quest, errors: updated.errors, completed: !!updated.completed, final_sp: updated.final_sp };
          if (idx >= 0) newAll[idx] = merged; else newAll.push(merged);
          setProgress(newAll);
        }).catch(function(){});
    }
    return sp;
  }

  // ── LOGIN / RESUME ─────────────────────────────────────────────────────────
  function login(name, team, char_type) {
    // Set session key FIRST so storage writes go to the right place
    setSessionKey(name, team);

    return fetch(API + '/players/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, team: team, char_type: char_type })
    }).then(function(r) {
      if (!r.ok) throw new Error('Login failed');
      return r.json();
    }).then(function(data) {
      var serverProg = Array.isArray(data.progress) ? data.progress : [];
      var local = getProgress();

      // Merge: server wins on completed quests
      var merged = JSON.parse(JSON.stringify(local));
      serverProg.forEach(function(sp) {
        var ex = merged.find(function(lp){ return lp.quest === sp.quest; });
        if (!ex) merged.push({ quest: sp.quest, errors: sp.errors||0, completed: !!sp.completed, final_sp: sp.final_sp });
        else if (sp.completed && !ex.completed) { ex.completed=true; ex.final_sp=sp.final_sp; ex.errors=sp.errors||ex.errors; }
      });

      setPlayer(data.player);  // also updates sessionKey
      setProgress(merged);
      return { player: data.player, progress: merged };
    });
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────
  window.ScrumAdventure = {
    getPlayer: getPlayer, setPlayer: setPlayer,
    getProgress: getProgress, setProgress: setProgress,
    getQuestRow: getQuestRow, login: login,
    addError: addError, completeQuest: completeQuest,
    totalSP: totalSP, isCompleted: isCompleted,
    allQuestsDone: allQuestsDone, enforceResume: enforceResume,
    QUEST_ORDER: QUEST_ORDER, QUEST_URLS: QUEST_URLS,
    playerKey: playerKey, getSessionKey: getSessionKey
  };

  // Legacy compat
  window.spInit     = function() {};
  window.spAddWrong = addError;
  window.spFinish   = completeQuest;
  window.spTotal    = totalSP;
})();
