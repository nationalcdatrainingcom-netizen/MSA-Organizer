const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const MEETINGS_FILE = path.join(DATA_DIR, 'meetings.json');
const RECURRING_FILE = path.join(DATA_DIR, 'recurring.json');
const LESSONS_FILE = path.join(DATA_DIR, 'lessons.json');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar.json');
const PRODUCTIVITY_FILE = path.join(DATA_DIR, 'productivity.json');

// Ensure data directory and files exist
async function initData() {
  await fs.ensureDir(DATA_DIR);

  if (!await fs.pathExists(USERS_FILE)) {
    const users = [
      {
        id: 'rebecca',
        username: 'rebecca',
        name: 'Rebecca Munlyn',
        title: 'Co-Founder',
        initials: 'RM',
        color: '#7C3AED',
        password: bcrypt.hashSync('msa2024', 10)
      },
      {
        id: 'mary',
        username: 'mary',
        name: 'Mary Wardlaw',
        title: 'Co-Founder',
        initials: 'MW',
        color: '#0F766E',
        password: bcrypt.hashSync('msa2024', 10)
      }
    ];
    await fs.writeJson(USERS_FILE, users, { spaces: 2 });
  }

  const defaults = [
    [TASKS_FILE, []],
    [PROJECTS_FILE, []],
    [MEETINGS_FILE, []],
    [RECURRING_FILE, []],
    [LESSONS_FILE, []],
    [LINKS_FILE, {
      lessonLinks: [],
      quizLink: '',
      resourceLinks: []
    }],
    [CALENDAR_FILE, []],
    [PRODUCTIVITY_FILE, {}]
  ];

  for (const [file, def] of defaults) {
    if (!await fs.pathExists(file)) {
      await fs.writeJson(file, def, { spaces: 2 });
    }
  }
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'msa-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ─── AUTH ROUTES ───────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await fs.readJson(USERS_FILE);
  const user = users.find(u => u.username === username.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  req.session.userName = user.name;
  res.json({ success: true, user: { id: user.id, name: user.name, initials: user.initials, color: user.color, title: user.title } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const users = await fs.readJson(USERS_FILE);
  const user = users.find(u => u.id === req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, initials: user.initials, color: user.color, title: user.title });
});

// ─── TASKS ROUTES ───────────────────────────────────────────────
app.get('/api/tasks', requireAuth, async (req, res) => {
  const tasks = await fs.readJson(TASKS_FILE);
  res.json(tasks.filter(t => t.userId === req.session.userId));
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  const tasks = await fs.readJson(TASKS_FILE);
  const task = {
    id: Date.now().toString(),
    userId: req.session.userId,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  tasks.push(task);
  await fs.writeJson(TASKS_FILE, tasks, { spaces: 2 });
  res.json(task);
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  const tasks = await fs.readJson(TASKS_FILE);
  const idx = tasks.findIndex(t => t.id === req.params.id && t.userId === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  tasks[idx] = { ...tasks[idx], ...req.body };
  await fs.writeJson(TASKS_FILE, tasks, { spaces: 2 });
  res.json(tasks[idx]);
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  let tasks = await fs.readJson(TASKS_FILE);
  tasks = tasks.filter(t => !(t.id === req.params.id && t.userId === req.session.userId));
  await fs.writeJson(TASKS_FILE, tasks, { spaces: 2 });
  res.json({ success: true });
});

// ─── PROJECTS ROUTES ────────────────────────────────────────────
app.get('/api/projects', requireAuth, async (req, res) => {
  const projects = await fs.readJson(PROJECTS_FILE);
  res.json(projects);
});

app.post('/api/projects', requireAuth, async (req, res) => {
  const projects = await fs.readJson(PROJECTS_FILE);
  const project = {
    id: Date.now().toString(),
    createdBy: req.session.userId,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  projects.push(project);
  await fs.writeJson(PROJECTS_FILE, projects, { spaces: 2 });
  res.json(project);
});

app.put('/api/projects/:id', requireAuth, async (req, res) => {
  const projects = await fs.readJson(PROJECTS_FILE);
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  projects[idx] = { ...projects[idx], ...req.body };
  await fs.writeJson(PROJECTS_FILE, projects, { spaces: 2 });
  res.json(projects[idx]);
});

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  let projects = await fs.readJson(PROJECTS_FILE);
  projects = projects.filter(p => p.id !== req.params.id);
  await fs.writeJson(PROJECTS_FILE, projects, { spaces: 2 });
  res.json({ success: true });
});

// ─── MEETINGS ROUTES ────────────────────────────────────────────
app.get('/api/meetings', requireAuth, async (req, res) => {
  const meetings = await fs.readJson(MEETINGS_FILE);
  res.json(meetings);
});

app.post('/api/meetings', requireAuth, async (req, res) => {
  const meetings = await fs.readJson(MEETINGS_FILE);
  const meeting = {
    id: Date.now().toString(),
    createdBy: req.session.userId,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  meetings.push(meeting);
  await fs.writeJson(MEETINGS_FILE, meetings, { spaces: 2 });
  res.json(meeting);
});

app.put('/api/meetings/:id', requireAuth, async (req, res) => {
  const meetings = await fs.readJson(MEETINGS_FILE);
  const idx = meetings.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  meetings[idx] = { ...meetings[idx], ...req.body };
  await fs.writeJson(MEETINGS_FILE, meetings, { spaces: 2 });
  res.json(meetings[idx]);
});

app.delete('/api/meetings/:id', requireAuth, async (req, res) => {
  let meetings = await fs.readJson(MEETINGS_FILE);
  meetings = meetings.filter(m => m.id !== req.params.id);
  await fs.writeJson(MEETINGS_FILE, meetings, { spaces: 2 });
  res.json({ success: true });
});

// ─── RECURRING TASKS ROUTES ─────────────────────────────────────
app.get('/api/recurring', requireAuth, async (req, res) => {
  const recurring = await fs.readJson(RECURRING_FILE);
  res.json(recurring.filter(r => r.userId === req.session.userId));
});

app.post('/api/recurring', requireAuth, async (req, res) => {
  const recurring = await fs.readJson(RECURRING_FILE);
  const task = {
    id: Date.now().toString(),
    userId: req.session.userId,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  recurring.push(task);
  await fs.writeJson(RECURRING_FILE, recurring, { spaces: 2 });
  res.json(task);
});

app.put('/api/recurring/:id', requireAuth, async (req, res) => {
  const recurring = await fs.readJson(RECURRING_FILE);
  const idx = recurring.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  recurring[idx] = { ...recurring[idx], ...req.body };
  await fs.writeJson(RECURRING_FILE, recurring, { spaces: 2 });
  res.json(recurring[idx]);
});

app.delete('/api/recurring/:id', requireAuth, async (req, res) => {
  let recurring = await fs.readJson(RECURRING_FILE);
  recurring = recurring.filter(r => r.id !== req.params.id);
  await fs.writeJson(RECURRING_FILE, recurring, { spaces: 2 });
  res.json({ success: true });
});

// ─── LESSONS ROUTES ─────────────────────────────────────────────
app.get('/api/lessons', requireAuth, async (req, res) => {
  const lessons = await fs.readJson(LESSONS_FILE);
  res.json(lessons);
});

app.post('/api/lessons', requireAuth, async (req, res) => {
  const lessons = await fs.readJson(LESSONS_FILE);
  const lesson = {
    id: Date.now().toString(),
    createdBy: req.session.userId,
    ...req.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  lessons.push(lesson);
  await fs.writeJson(LESSONS_FILE, lessons, { spaces: 2 });
  res.json(lesson);
});

app.put('/api/lessons/:id', requireAuth, async (req, res) => {
  const lessons = await fs.readJson(LESSONS_FILE);
  const idx = lessons.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  lessons[idx] = { ...lessons[idx], ...req.body, updatedAt: new Date().toISOString() };
  await fs.writeJson(LESSONS_FILE, lessons, { spaces: 2 });
  res.json(lessons[idx]);
});

app.delete('/api/lessons/:id', requireAuth, async (req, res) => {
  let lessons = await fs.readJson(LESSONS_FILE);
  lessons = lessons.filter(l => l.id !== req.params.id);
  await fs.writeJson(LESSONS_FILE, lessons, { spaces: 2 });
  res.json({ success: true });
});

// ─── LINKS ROUTES ───────────────────────────────────────────────
app.get('/api/links', requireAuth, async (req, res) => {
  const links = await fs.readJson(LINKS_FILE);
  res.json(links);
});

app.put('/api/links', requireAuth, async (req, res) => {
  await fs.writeJson(LINKS_FILE, req.body, { spaces: 2 });
  res.json(req.body);
});

app.post('/api/links/lesson', requireAuth, async (req, res) => {
  const links = await fs.readJson(LINKS_FILE);
  const link = { id: Date.now().toString(), ...req.body, addedBy: req.session.userId };
  links.lessonLinks.push(link);
  await fs.writeJson(LINKS_FILE, links, { spaces: 2 });
  res.json(link);
});

app.delete('/api/links/lesson/:id', requireAuth, async (req, res) => {
  const links = await fs.readJson(LINKS_FILE);
  links.lessonLinks = links.lessonLinks.filter(l => l.id !== req.params.id);
  await fs.writeJson(LINKS_FILE, links, { spaces: 2 });
  res.json({ success: true });
});

// ─── CALENDAR ROUTES ────────────────────────────────────────────
app.get('/api/calendar', requireAuth, async (req, res) => {
  const events = await fs.readJson(CALENDAR_FILE);
  res.json(events);
});

app.post('/api/calendar', requireAuth, async (req, res) => {
  const events = await fs.readJson(CALENDAR_FILE);
  const event = {
    id: Date.now().toString(),
    createdBy: req.session.userId,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  events.push(event);
  await fs.writeJson(CALENDAR_FILE, events, { spaces: 2 });
  res.json(event);
});

app.put('/api/calendar/:id', requireAuth, async (req, res) => {
  const events = await fs.readJson(CALENDAR_FILE);
  const idx = events.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  events[idx] = { ...events[idx], ...req.body };
  await fs.writeJson(CALENDAR_FILE, events, { spaces: 2 });
  res.json(events[idx]);
});

app.delete('/api/calendar/:id', requireAuth, async (req, res) => {
  let events = await fs.readJson(CALENDAR_FILE);
  events = events.filter(e => e.id !== req.params.id);
  await fs.writeJson(CALENDAR_FILE, events, { spaces: 2 });
  res.json({ success: true });
});

// ─── PRODUCTIVITY ROUTES ────────────────────────────────────────
app.get('/api/productivity', requireAuth, async (req, res) => {
  const prod = await fs.readJson(PRODUCTIVITY_FILE);
  const today = new Date().toISOString().split('T')[0];
  const key = `${req.session.userId}-${today}`;
  res.json(prod[key] || { notes: '', wins: [], blockers: [], intentions: [] });
});

app.put('/api/productivity', requireAuth, async (req, res) => {
  const prod = await fs.readJson(PRODUCTIVITY_FILE);
  const today = new Date().toISOString().split('T')[0];
  const key = `${req.session.userId}-${today}`;
  prod[key] = { ...req.body, date: today, userId: req.session.userId };
  await fs.writeJson(PRODUCTIVITY_FILE, prod, { spaces: 2 });
  res.json(prod[key]);
});

// Serve main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initData().then(() => {
  app.listen(PORT, () => {
    console.log(`MSA Organizer running on port ${PORT}`);
  });
});
