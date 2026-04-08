// ── SCRUM ADVENTURE API CLIENT ────────────────────────────────────────────
// Included in every quest page. Reads player from sessionStorage and syncs with backend.

(function() {
  'use strict';

  const API_BASE = window.location.origin + '/api';

  // ── STATE ─────────────────────────────────────────────────────────────────
  const SA = window.ScrumAdventure = {

    // Load player from sessionStorage
    getPlayer: function() {
      try { return JSON.parse(sessionStorage.getItem('sa_player') || 'null'); }
      catch { return null; }
    },

    setPlayer: function(player) {
      sessionStorage.setItem('sa_player', JSON.stringify(player));
    },

    getProgress: function() {
      try { return JSON.parse(sessionStorage.getItem('sa_progress') || '[]'); }
      catch { return []; }
    },

    setProgress: function(progress) {
      sessionStorage.setItem('sa_progress', JSON.stringify(progress));
    },

    getQuestProgress: function(quest) {
      const all = SA.getProgress();
      return all.find(p => p.quest === quest) || { errors: 0, completed: false, final_sp: null };
    },

    // ── SP HELPERS (local + synced to server) ────────────────────────────────
    addError: async function(quest) {
      // local
      const player = SA.getPlayer();
      const all = SA.getProgress();
      const existing = all.find(p => p.quest === quest);
      if (existing) { existing.errors = (existing.errors || 0) + 1; }
      else { all.push({ quest, errors: 1, completed: false }); }
      SA.setProgress(all);

      // server (fire & forget)
      if (player) {
        fetch(API_BASE + '/progress/error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: player.id, quest })
        }).catch(() => {});
      }
    },

    completeQuest: async function(quest) {
      const player = SA.getPlayer();
      const all = SA.getProgress();
      const existing = all.find(p => p.quest === quest);
      const errors = existing ? (existing.errors || 0) : 0;
      const final_sp = Math.max(0, 100 - errors * 10);

      if (existing) { existing.completed = true; existing.final_sp = final_sp; }
      else { all.push({ quest, errors: 0, completed: true, final_sp: 100 }); }
      SA.setProgress(all);

      // server
      if (player) {
        try {
          const resp = await fetch(API_BASE + '/progress/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: player.id, quest })
          });
          if (resp.ok) {
            const updated = await resp.json();
            const newAll = SA.getProgress();
            const idx = newAll.findIndex(p => p.quest === quest);
            if (idx >= 0) newAll[idx] = updated; else newAll.push(updated);
            SA.setProgress(newAll);
          }
        } catch(e) {}
      }
      return final_sp;
    },

    totalSP: function() {
      return SA.getProgress()
        .filter(p => p.completed)
        .reduce((s, p) => s + (p.final_sp || 0), 0);
    },

    // ── LOGIN / RESUME ────────────────────────────────────────────────────────
    login: async function(name, team, char_type) {
      const resp = await fetch(API_BASE + '/players/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, team, char_type })
      });
      if (!resp.ok) throw new Error('Login failed');
      const data = await resp.json();
      SA.setPlayer(data.player);
      SA.setProgress(data.progress || []);
      sessionStorage.setItem('adventure_char', char_type);
      sessionStorage.setItem('adventure_name', name);
      return data;
    },

    // Has the player already completed a quest?
    isCompleted: function(quest) {
      return SA.getQuestProgress(quest).completed === true;
    }
  };

  // ── LEGACY COMPAT: old sessionStorage keys still work ────────────────────
  // spAddWrong / spFinish / spInit map to new SA methods
  window.spInit = function(q) { /* handled server-side now */ };
  window.spAddWrong = function(q) { SA.addError(q); };
  window.spFinish = function(q) { SA.completeQuest(q); };
  window.spTotal = function() { return SA.totalSP(); };

})();
