// ── SCRUM ADVENTURE API CLIENT ────────────────────────────────────────────────
(function () {
  'use strict';

  const API = window.location.origin + '/api';
  const QUEST_ORDER = ['forest', 'huette', 'bit', 'marzili', 'olymp'];
  const QUEST_URLS  = {
    forest:  '/quest-forest',
    huette:  '/quest-huette',
    bit:     '/quest-bit',
    marzili: '/quest-marzili',
    olymp:   '/quest-olymp',
  };

  function getPlayer()    { try { return JSON.parse(localStorage.getItem('sa_player') || 'null'); } catch { return null; } }
  function setPlayer(p)   { localStorage.setItem('sa_player', JSON.stringify(p)); }
  function getProgress()  { try { return JSON.parse(localStorage.getItem('sa_progress') || '[]'); } catch { return []; } }
  function setProgress(p) { localStorage.setItem('sa_progress', JSON.stringify(p)); }

  function getQuestRow(quest) {
    return getProgress().find(p => p.quest === quest) || { quest, errors: 0, completed: false, final_sp: null };
  }

  function isCompleted(quest) { return !!getQuestRow(quest).completed; }
  function allQuestsDone()    { return QUEST_ORDER.every(q => isCompleted(q)); }
  function totalSP()          { return getProgress().filter(p => p.completed).reduce((s, p) => s + (p.final_sp || 0), 0); }

  // ── ENFORCE RESUME ─────────────────────────────────────────────────────────
  function enforceResume(thisQuest) {
    const player = getPlayer();
    if (!player) { window.location.href = '/welcome'; return; }

    const allowed = QUEST_ORDER.find(q => !isCompleted(q)) || 'olymp';
    const thisIdx    = QUEST_ORDER.indexOf(thisQuest);
    const allowedIdx = QUEST_ORDER.indexOf(allowed);

    if (allQuestsDone() && thisQuest !== 'olymp') {
      window.location.href = '/quest-olymp'; return;
    }
    if (thisIdx > allowedIdx) {
      window.location.href = QUEST_URLS[allowed]; return;
    }
  }

  // ── SP TRACKING ────────────────────────────────────────────────────────────
  function addError(quest) {
    const all = getProgress();
    const row = all.find(p => p.quest === quest);
    if (row) row.errors = (row.errors || 0) + 1;
    else all.push({ quest, errors: 1, completed: false, final_sp: null });
    setProgress(all);
    const player = getPlayer();
    if (player && player.id) {
      fetch(API + '/progress/error', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id, quest })
      }).catch(() => {});
    }
  }

  function completeQuest(quest) {
    const all    = getProgress();
    const row    = all.find(p => p.quest === quest);
    const errors = row ? (row.errors || 0) : 0;
    const sp     = Math.max(0, 100 - errors * 10);
    if (row) { row.completed = true; row.final_sp = sp; }
    else all.push({ quest, errors: 0, completed: true, final_sp: sp });
    setProgress(all);
    const player = getPlayer();
    if (player && player.id) {
      fetch(API + '/progress/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.id, quest })
      }).then(r => r.ok ? r.json() : null).then(updated => {
        if (!updated) return;
        const newAll = getProgress();
        const idx = newAll.findIndex(p => p.quest === quest);
        const merged = { quest: updated.quest, errors: updated.errors, completed: !!updated.completed, final_sp: updated.final_sp };
        if (idx >= 0) newAll[idx] = merged; else newAll.push(merged);
        setProgress(newAll);
      }).catch(() => {});
    }
    return sp;
  }

  // ── LOGIN / RESUME ─────────────────────────────────────────────────────────
  async function login(name, team, char_type) {
    const resp = await fetch(API + '/players/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, team, char_type })
    });
    if (!resp.ok) throw new Error('Login failed');
    const data = await resp.json();

    // Merge: server progress wins on completed quests
    const serverProgress = Array.isArray(data.progress) ? data.progress : [];
    const local = getProgress();
    const merged = [...local];
    serverProgress.forEach(sp => {
      const ex = merged.find(lp => lp.quest === sp.quest);
      if (!ex) merged.push({ quest: sp.quest, errors: sp.errors || 0, completed: !!sp.completed, final_sp: sp.final_sp });
      else if (sp.completed && !ex.completed) { ex.completed = true; ex.final_sp = sp.final_sp; ex.errors = sp.errors || ex.errors; }
    });

    setPlayer(data.player);
    setProgress(merged);
    localStorage.setItem('adventure_char', char_type);
    localStorage.setItem('adventure_name', name);
    return { player: data.player, progress: merged };
  }

  window.ScrumAdventure = { getPlayer, setPlayer, getProgress, setProgress, getQuestRow, login, addError, completeQuest, totalSP, isCompleted, allQuestsDone, enforceResume, QUEST_ORDER, QUEST_URLS };

  // Legacy compat
  window.spInit     = function () {};
  window.spAddWrong = addError;
  window.spFinish   = completeQuest;
  window.spTotal    = totalSP;
})();
