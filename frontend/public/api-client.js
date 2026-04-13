// ── SCRUM ADVENTURE API CLIENT v4 ────────────────────────────────────────────
// Fix: Server is always the source of truth on login.
// localStorage is used as cache/fallback only.
// On reset: server returns empty progress → localStorage is overwritten.
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
  function clearLocalProgress(name, team) {
    var key = playerKey(name, team);
    localStorage.removeItem(key + '_progress');
    localStorage.removeItem(key + '_player');
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

  // ── LOGIN — SERVER IS SOURCE OF TRUTH ─────────────────────────────────────
  // On every login: server progress REPLACES local progress.
  // This ensures resets from admin are immediately effective.
  function login(name, team, char_type) {
    setSessionKey(name, team);
    return fetch(API + '/players/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, team: team, char_type: char_type })
    }).then(function(r) {
      if (!r.ok) throw new Error('Login failed');
      return r.json();
    }).then(function(data) {
      // ★ SERVER WINS: replace local with server data entirely
      var serverProg = Array.isArray(data.progress) ? data.progress : [];
      var normalized = serverProg.map(function(sp) {
        return { quest: sp.quest, errors: sp.errors||0, completed: !!sp.completed, final_sp: sp.final_sp };
      });

      // Add any LOCAL errors for quests not yet on server (offline usage only)
      var local = getProgress();
      local.forEach(function(lp) {
        if (lp.completed) return; // server already has definitive state
        var serverHas = normalized.find(function(sp){ return sp.quest === lp.quest; });
        if (!serverHas && lp.errors > 0) {
          normalized.push(lp); // keep local errors for in-progress quest
        }
      });

      setPlayer(data.player);
      setProgress(normalized);
      return { player: data.player, progress: normalized };
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
    playerKey: playerKey, getSessionKey: getSessionKey,
    clearLocalProgress: clearLocalProgress
  };

  // Legacy compat
  window.spInit     = function() {};
  window.spAddWrong = addError;
  window.spFinish   = completeQuest;
  window.spTotal    = totalSP;
})();
