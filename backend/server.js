require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const app  = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'scrumadventure2025';

// ══════════════════════════════════════════════════════════════════════════════
// JSON FILE DATABASE
// Render free tier has a persistent disk at /opt/render/project/src
// Locally it saves next to server.js
// ══════════════════════════════════════════════════════════════════════════════
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db.json');

const DEFAULT_ROSTER = {
  'Team Suvretta': ['Simon','Michel','Andrei','Yanis','Sebi','Cedric','Leo','Philipp','Cristina','Joel'],
  'Team Valletta': ['Oli','Roger','Piotr','Vino','Liva','Bizhan','Lino','Koray','Philipp','Rosalie','Sathya','Basil']
};

const EMPTY_DB = {
  players: [],      // { id, name, team, char_type, created_at, updated_at }
  progress: [],     // { id, player_id, quest, errors, completed, final_sp, completed_at }
  admins: [],       // { id, username, password_hash }
  roster: JSON.parse(JSON.stringify(DEFAULT_ROSTER)), // team name lists
  _nextId: { players: 1, progress: 1, admins: 1 }
};

function readDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch {}
  return JSON.parse(JSON.stringify(EMPTY_DB));
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function nextId(db, table) {
  if (!db._nextId) db._nextId = { players: 1, progress: 1, admins: 1 };
  const id = db._nextId[table] || 1;
  db._nextId[table] = id + 1;
  return id;
}

// Ensure default admin exists
(function seedAdmin() {
  const db = readDB();
  if (db.admins.length === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'spielleiter2025', 10);
    db.admins.push({ id: nextId(db, 'admins'), username: 'admin', password_hash: hash });
    writeDB(db);
    console.log('✅ Default admin: admin / ' + (process.env.ADMIN_PASSWORD || 'spielleiter2025'));
  }
  console.log('✅ JSON DB ready:', DB_PATH);
})();

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// ── HELPER ────────────────────────────────────────────────────────────────────
function playerWithSP(player, progress) {
  const quests_done = progress.filter(p => p.completed).length;
  const total_sp    = progress.filter(p => p.completed).reduce((s, p) => s + (p.final_sp || 0), 0);
  return { ...player, total_sp, quests_done };
}

// ════════════════════════════════════════════════════════════════════════════
// PLAYER ROUTES
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/players/login', (req, res) => {
  const { name, team, char_type } = req.body;
  if (!name || !team) return res.status(400).json({ error: 'name and team required' });
  const db = readDB();

  let player = db.players.find(p => p.name === name && p.team === team);
  if (player) {
    player.char_type  = char_type || player.char_type;
    player.updated_at = new Date().toISOString();
  } else {
    player = {
      id: nextId(db, 'players'), name, team,
      char_type: char_type || 'biber',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.players.push(player);
  }
  writeDB(db);

  const progress = db.progress.filter(p => p.player_id === player.id);
  res.json({ player, progress });
});

app.get('/api/players/:id', (req, res) => {
  const db = readDB();
  const player = db.players.find(p => p.id === parseInt(req.params.id));
  if (!player) return res.status(404).json({ error: 'Player not found' });
  const progress = db.progress.filter(p => p.player_id === player.id);
  res.json({ player, progress });
});

app.post('/api/progress/error', (req, res) => {
  const { player_id, quest } = req.body;
  if (!player_id || !quest) return res.status(400).json({ error: 'player_id and quest required' });
  const db  = readDB();
  const pid = parseInt(player_id);
  let row   = db.progress.find(p => p.player_id === pid && p.quest === quest);
  if (row) { row.errors = (row.errors || 0) + 1; }
  else {
    row = { id: nextId(db, 'progress'), player_id: pid, quest, errors: 1, completed: false, final_sp: null, completed_at: null };
    db.progress.push(row);
  }
  writeDB(db);
  res.json(row);
});

app.post('/api/progress/complete', (req, res) => {
  const { player_id, quest } = req.body;
  if (!player_id || !quest) return res.status(400).json({ error: 'player_id and quest required' });
  const db  = readDB();
  const pid = parseInt(player_id);
  let row   = db.progress.find(p => p.player_id === pid && p.quest === quest);
  const errors   = row ? (row.errors || 0) : 0;
  const final_sp = Math.max(0, 100 - errors * 10);
  if (row) {
    row.completed = true; row.final_sp = final_sp; row.completed_at = new Date().toISOString();
  } else {
    row = { id: nextId(db, 'progress'), player_id: pid, quest, errors: 0, completed: true, final_sp, completed_at: new Date().toISOString() };
    db.progress.push(row);
  }
  writeDB(db);
  res.json(row);
});

app.get('/api/leaderboard', (req, res) => {
  const db = readDB();
  const result = db.players.map(p => {
    const prog = db.progress.filter(x => x.player_id === p.id);
    return playerWithSP(p, prog);
  }).sort((a, b) => b.total_sp - a.total_sp);
  res.json(result);
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const db    = readDB();
  const admin = db.admins.find(a => a.username === username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: admin.id, username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

app.get('/api/admin/players', requireAdmin, (req, res) => {
  const db = readDB();
  const result = db.players.map(p => {
    const prog = db.progress.filter(x => x.player_id === p.id);
    return {
      ...playerWithSP(p, prog),
      progress_detail: prog.map(x => ({ quest: x.quest, errors: x.errors, completed: x.completed, final_sp: x.final_sp }))
    };
  }).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  res.json(result);
});

app.delete('/api/admin/players/:id', requireAdmin, (req, res) => {
  const db  = readDB();
  const pid = parseInt(req.params.id);
  db.players  = db.players.filter(p => p.id !== pid);
  db.progress = db.progress.filter(p => p.player_id !== pid);
  writeDB(db);
  res.json({ success: true });
});

app.patch('/api/admin/players/:id', requireAdmin, (req, res) => {
  const db     = readDB();
  const pid    = parseInt(req.params.id);
  const player = db.players.find(p => p.id === pid);
  if (!player) return res.status(404).json({ error: 'Not found' });
  const { team, char_type, name } = req.body;
  if (team)      player.team      = team;
  if (char_type) player.char_type = char_type;
  if (name)      player.name      = name;
  player.updated_at = new Date().toISOString();
  writeDB(db);
  res.json(player);
});

app.post('/api/admin/players/:id/reset', requireAdmin, (req, res) => {
  const db  = readDB();
  const pid = parseInt(req.params.id);
  const { quest } = req.body;
  if (quest) db.progress = db.progress.filter(p => !(p.player_id === pid && p.quest === quest));
  else       db.progress = db.progress.filter(p => p.player_id !== pid);
  writeDB(db);
  res.json({ success: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const db   = readDB();
  const byTeam = {};
  db.players.forEach(p => { byTeam[p.team] = (byTeam[p.team] || 0) + 1; });
  const questMap = {};
  db.progress.forEach(p => {
    if (!questMap[p.quest]) questMap[p.quest] = 0;
    if (p.completed) questMap[p.quest]++;
  });
  res.json({
    total_players: db.players.length,
    by_team: Object.entries(byTeam).map(([team, count]) => ({ team, count })).sort((a,b) => a.team.localeCompare(b.team)),
    completions: Object.entries(questMap).map(([quest, done]) => ({ quest, done })).sort((a,b) => a.quest.localeCompare(b.quest))
  });
});



// POST /api/admin/reset-all  – wipe ALL progress for all players
app.post('/api/admin/reset-all', requireAdmin, (req, res) => {
  const db = readDB();
  const count = db.progress.length;
  db.progress = [];
  writeDB(db);
  res.json({ success: true, cleared: count });
});


// ── ROSTER ROUTES (team name lists) ─────────────────────────────────────────

// GET /api/roster  – get all team name lists (public, no auth)
app.get('/api/roster', (req, res) => {
  const db = readDB();
  const roster = db.roster || JSON.parse(JSON.stringify(DEFAULT_ROSTER));
  res.json(roster);
});

// POST /api/admin/roster/:team  – add a name to a team
app.post('/api/admin/roster/:team', requireAdmin, (req, res) => {
  const db   = readDB();
  const team = decodeURIComponent(req.params.team);
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  if (!db.roster) db.roster = JSON.parse(JSON.stringify(DEFAULT_ROSTER));
  if (!db.roster[team]) db.roster[team] = [];
  const trimmed = name.trim();
  if (db.roster[team].includes(trimmed)) return res.status(409).json({ error: 'already exists' });
  db.roster[team].push(trimmed);
  writeDB(db);
  res.json({ success: true, roster: db.roster[team] });
});

// DELETE /api/admin/roster/:team/:name  – remove a name from a team
app.delete('/api/admin/roster/:team/:name', requireAdmin, (req, res) => {
  const db   = readDB();
  const team = decodeURIComponent(req.params.team);
  const name = decodeURIComponent(req.params.name);
  if (!db.roster) db.roster = JSON.parse(JSON.stringify(DEFAULT_ROSTER));
  if (!db.roster[team]) return res.status(404).json({ error: 'team not found' });
  db.roster[team] = db.roster[team].filter(n => n !== name);
  writeDB(db);
  res.json({ success: true, roster: db.roster[team] });
});

// ── PAGE ROUTES ───────────────────────────────────────────────────────────────
const PAGES = {
  '/welcome':       'welcome.html',
  '/admin':         'admin.html',
  '/quest-forest':  'quest-forest.html',
  '/quest-huette':  'quest-huette.html',
  '/quest-bit':     'quest-bit.html',
  '/quest-marzili': 'quest-marzili.html',
  '/quest-olymp':   'quest-olymp.html',
};
Object.entries(PAGES).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public', file));
  });
});

// ── CATCH ALL ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.listen(port, () => console.log(`🚀 Server on port ${port} | DB: ${DB_PATH}`));
