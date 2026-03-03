const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// DATA_DIR: use env var if set, otherwise fall back to local ./data
// On Render with persistent disk mounted at /opt/render/project/src/data this just works.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

console.log('DATA_DIR:', DATA_DIR);
console.log('PUBLIC_DIR:', PUBLIC_DIR);

const files = {
  users:          path.join(DATA_DIR, 'users.json'),
  tasks:          path.join(DATA_DIR, 'tasks.json'),
  projects:       path.join(DATA_DIR, 'projects.json'),
  meetings:       path.join(DATA_DIR, 'meetings.json'),
  recurringMtgs:  path.join(DATA_DIR, 'recurringMtgs.json'),
  recurring:      path.join(DATA_DIR, 'recurring.json'),
  lessons:        path.join(DATA_DIR, 'lessons.json'),
  links:          path.join(DATA_DIR, 'links.json'),
  calendar:       path.join(DATA_DIR, 'calendar.json'),
  productivity:   path.join(DATA_DIR, 'productivity.json'),
  messages:       path.join(DATA_DIR, 'messages.json'),
  goals:          path.join(DATA_DIR, 'goals.json'),
  notifications:  path.join(DATA_DIR, 'notifications.json'),
};

// Multer for icon upload — save to DATA_DIR so it persists across deploys
const iconStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),
  filename: (req, file, cb) => cb(null, 'app-icon.png')
});
const upload = multer({ storage: iconStorage, limits: { fileSize: 5 * 1024 * 1024 } });

async function initData() {
  try {
    await fs.ensureDir(DATA_DIR);
    console.log('Data directory ready:', DATA_DIR);

    if (!await fs.pathExists(files.users)) {
      await fs.writeJson(files.users, [
        { id: 'rebecca', username: 'rebecca', name: 'Rebecca Munlyn', title: 'Co-Founder', initials: 'RM', color: '#C9A84C', password: bcrypt.hashSync('msa2024', 10) },
        { id: 'mary',    username: 'mary',    name: 'Mary Wardlaw',   title: 'Co-Founder', initials: 'MW', color: '#C9A84C', password: bcrypt.hashSync('msa2024', 10) }
      ], { spaces: 2 });
      console.log('Created default users');
    }

    const defaults = [
      [files.tasks,        []],
      [files.projects,     []],
      [files.meetings,     []],
      [files.recurringMtgs,[]],
      [files.recurring,    []],
      [files.lessons,      []],
      [files.links,        { lessonLinks: [], quizLink: '', resourceLinks: [] }],
      [files.calendar,     []],
      [files.productivity, {}],
      [files.messages,     []],
      [files.goals,        { featured: null, goals: [], radar: [] }],
      [files.notifications,[]],
    ];
    for (const [f, def] of defaults) {
      if (!await fs.pathExists(f)) {
        await fs.writeJson(f, def, { spaces: 2 });
        console.log('Created:', path.basename(f));
      }
    }
    console.log('Data init complete');
  } catch (err) {
    console.error('FATAL: initData failed:', err.message);
    process.exit(1);
  }
}

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'msa-secret-2024-xk9',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(PUBLIC_DIR));

function auth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ── HEALTH CHECK ──────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const users = await fs.readJson(files.users);
    res.json({
      status: 'ok',
      dataDir: DATA_DIR,
      dataDirExists: await fs.pathExists(DATA_DIR),
      userCount: users.length,
      usernames: users.map(u => u.username),
      time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message, dataDir: DATA_DIR });
  }
});

// ── NOTIFICATION HELPER ───────────────────────────────────────────
async function createNotification(toIds, type, message, data = {}) {
  try {
    const notifs = await fs.readJson(files.notifications);
    for (const toId of toIds) {
      notifs.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        toId, type, message, data,
        read: false,
        createdAt: new Date().toISOString()
      });
    }
    await fs.writeJson(files.notifications, notifs, { spaces: 2 });
  } catch (err) {
    console.error('createNotification error:', err.message);
  }
}

// ── AUTH ──────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('Login attempt:', username);
    const users = await fs.readJson(files.users);
    const user = users.find(u => u.username === username.toLowerCase().trim());
    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      console.log('Wrong password for:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.userId = user.id;
    console.log('Login success:', user.id);
    res.json({ success: true, user: { id: user.id, name: user.name, initials: user.initials, color: user.color, title: user.title } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/me', auth, async (req, res) => {
  try {
    const users = await fs.readJson(files.users);
    const u = users.find(u => u.id === req.session.userId);
    if (!u) return res.status(404).json({ error: 'Not found' });
    res.json({ id: u.id, name: u.name, initials: u.initials, color: u.color, title: u.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const users = await fs.readJson(files.users);
  const idx = users.findIndex(u => u.id === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (!bcrypt.compareSync(currentPassword, users[idx].password))
    return res.status(401).json({ error: 'Current password incorrect' });
  users[idx].password = bcrypt.hashSync(newPassword, 10);
  await fs.writeJson(files.users, users, { spaces: 2 });
  res.json({ success: true });
});

// ── ICON UPLOAD ───────────────────────────────────────────────────
app.post('/api/upload-icon', auth, upload.single('icon'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Icon is saved to DATA_DIR/app-icon.png — serve it via /api/icon
  res.json({ success: true, url: '/api/icon' });
});

// Serve the persistent icon
app.get('/api/icon', async (req, res) => {
  const iconPath = path.join(DATA_DIR, 'app-icon.png');
  if (await fs.pathExists(iconPath)) {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(iconPath);
  } else {
    // Fall back to default icon in public dir
    res.sendFile(path.join(PUBLIC_DIR, 'icon-192.png'));
  }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────
app.get('/api/notifications', auth, async (req, res) => {
  const notifs = await fs.readJson(files.notifications);
  res.json(notifs.filter(n => n.toId === req.session.userId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50));
});
app.put('/api/notifications/:id/read', auth, async (req, res) => {
  const notifs = await fs.readJson(files.notifications);
  const idx = notifs.findIndex(n => n.id === req.params.id);
  if (idx !== -1) { notifs[idx].read = true; await fs.writeJson(files.notifications, notifs, { spaces: 2 }); }
  res.json({ success: true });
});
app.put('/api/notifications/read-all', auth, async (req, res) => {
  const notifs = await fs.readJson(files.notifications);
  notifs.forEach(n => { if (n.toId === req.session.userId) n.read = true; });
  await fs.writeJson(files.notifications, notifs, { spaces: 2 });
  res.json({ success: true });
});
app.delete('/api/notifications/:id', auth, async (req, res) => {
  let notifs = await fs.readJson(files.notifications);
  notifs = notifs.filter(n => n.id !== req.params.id);
  await fs.writeJson(files.notifications, notifs, { spaces: 2 });
  res.json({ success: true });
});

// ── TASKS ─────────────────────────────────────────────────────────
app.get('/api/tasks', auth, async (req, res) => {
  const data = await fs.readJson(files.tasks);
  res.json(data.filter(d => d.userId === req.session.userId));
});
app.post('/api/tasks', auth, async (req, res) => {
  const data = await fs.readJson(files.tasks);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.tasks, data, { spaces: 2 });
  res.json(item);
});
app.put('/api/tasks/:id', auth, async (req, res) => {
  const data = await fs.readJson(files.tasks);
  const idx = data.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data[idx] = { ...data[idx], ...req.body };
  await fs.writeJson(files.tasks, data, { spaces: 2 });
  res.json(data[idx]);
});
app.delete('/api/tasks/:id', auth, async (req, res) => {
  let data = await fs.readJson(files.tasks);
  data = data.filter(d => d.id !== req.params.id);
  await fs.writeJson(files.tasks, data, { spaces: 2 });
  res.json({ success: true });
});

// ── PROJECTS ──────────────────────────────────────────────────────
app.get('/api/projects', auth, async (req, res) => {
  const data = await fs.readJson(files.projects);
  res.json(data.filter(d => d.userId === req.session.userId || d.shared === true));
});
app.post('/api/projects', auth, async (req, res) => {
  const data = await fs.readJson(files.projects);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.projects, data, { spaces: 2 });
  if (item.shared) {
    const otherId = req.session.userId === 'rebecca' ? 'mary' : 'rebecca';
    await createNotification([otherId], 'project', `New shared project: "${item.name}"`, { projectId: item.id });
  }
  res.json(item);
});
app.put('/api/projects/:id', auth, async (req, res) => {
  const data = await fs.readJson(files.projects);
  const idx = data.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data[idx] = { ...data[idx], ...req.body };
  await fs.writeJson(files.projects, data, { spaces: 2 });
  res.json(data[idx]);
});
app.delete('/api/projects/:id', auth, async (req, res) => {
  let data = await fs.readJson(files.projects);
  data = data.filter(d => d.id !== req.params.id);
  await fs.writeJson(files.projects, data, { spaces: 2 });
  res.json({ success: true });
});

// ── MEETINGS ──────────────────────────────────────────────────────
app.get('/api/meetings', auth, async (req, res) => res.json(await fs.readJson(files.meetings)));
app.post('/api/meetings', auth, async (req, res) => {
  const data = await fs.readJson(files.meetings);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.meetings, data, { spaces: 2 });
  if (req.body.date) {
    const cal = await fs.readJson(files.calendar);
    cal.push({ id: 'mtg-' + item.id, title: '📋 ' + req.body.title, date: req.body.date, startTime: req.body.time || '', who: 'both', isMeeting: true, meetingId: item.id, userId: req.session.userId, createdAt: new Date().toISOString() });
    await fs.writeJson(files.calendar, cal, { spaces: 2 });
  }
  const otherId = req.session.userId === 'rebecca' ? 'mary' : 'rebecca';
  await createNotification([otherId], 'meeting', `New meeting: "${req.body.title}" on ${req.body.date}`, { meetingId: item.id });
  res.json(item);
});
app.put('/api/meetings/:id', auth, async (req, res) => {
  const data = await fs.readJson(files.meetings);
  const idx = data.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data[idx] = { ...data[idx], ...req.body };
  await fs.writeJson(files.meetings, data, { spaces: 2 });
  res.json(data[idx]);
});
app.delete('/api/meetings/:id', auth, async (req, res) => {
  let data = await fs.readJson(files.meetings);
  data = data.filter(d => d.id !== req.params.id);
  await fs.writeJson(files.meetings, data, { spaces: 2 });
  let cal = await fs.readJson(files.calendar);
  cal = cal.filter(c => c.meetingId !== req.params.id);
  await fs.writeJson(files.calendar, cal, { spaces: 2 });
  res.json({ success: true });
});

// ── RECURRING MEETINGS ────────────────────────────────────────────
app.get('/api/recurring-meetings', auth, async (req, res) => res.json(await fs.readJson(files.recurringMtgs)));
app.post('/api/recurring-meetings', auth, async (req, res) => {
  const data = await fs.readJson(files.recurringMtgs);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.recurringMtgs, data, { spaces: 2 });
  const otherId = req.session.userId === 'rebecca' ? 'mary' : 'rebecca';
  await createNotification([otherId], 'recurringMeeting', `Recurring meeting added: "${req.body.title}" (${req.body.frequency})`, {});
  res.json(item);
});
app.put('/api/recurring-meetings/:id', auth, async (req, res) => {
  const data = await fs.readJson(files.recurringMtgs);
  const idx = data.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data[idx] = { ...data[idx], ...req.body };
  await fs.writeJson(files.recurringMtgs, data, { spaces: 2 });
  res.json(data[idx]);
});
app.delete('/api/recurring-meetings/:id', auth, async (req, res) => {
  let data = await fs.readJson(files.recurringMtgs);
  data = data.filter(d => d.id !== req.params.id);
  await fs.writeJson(files.recurringMtgs, data, { spaces: 2 });
  res.json({ success: true });
});

// ── RECURRING TASKS ───────────────────────────────────────────────
app.get('/api/recurring', auth, async (req, res) => {
  const data = await fs.readJson(files.recurring);
  res.json(data.filter(d => d.userId === req.session.userId || d.shared === true));
});
app.post('/api/recurring', auth, async (req, res) => {
  const data = await fs.readJson(files.recurring);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.recurring, data, { spaces: 2 });
  if (item.shared) {
    const otherId = req.session.userId === 'rebecca' ? 'mary' : 'rebecca';
    await createNotification([otherId], 'recurring', `Shared recurring task: "${item.name}" (${item.frequency})`, {});
  }
  res.json(item);
});
app.put('/api/recurring/:id', auth, async (req, res) => {
  const data = await fs.readJson(files.recurring);
  const idx = data.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data[idx] = { ...data[idx], ...req.body };
  await fs.writeJson(files.recurring, data, { spaces: 2 });
  res.json(data[idx]);
});
app.delete('/api/recurring/:id', auth, async (req, res) => {
  let data = await fs.readJson(files.recurring);
  data = data.filter(d => d.id !== req.params.id);
  await fs.writeJson(files.recurring, data, { spaces: 2 });
  res.json({ success: true });
});

// ── CALENDAR ──────────────────────────────────────────────────────
app.get('/api/calendar', auth, async (req, res) => res.json(await fs.readJson(files.calendar)));
app.post('/api/calendar', auth, async (req, res) => {
  const data = await fs.readJson(files.calendar);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.calendar, data, { spaces: 2 });
  const otherId = req.session.userId === 'rebecca' ? 'mary' : 'rebecca';
  if (req.body.who === 'both' || req.body.who === otherId) {
    await createNotification([otherId], 'calendar', `New calendar event: "${req.body.title}" on ${req.body.date}`, { eventId: item.id });
  }
  res.json(item);
});
app.put('/api/calendar/:id', auth, async (req, res) => {
  const data = await fs.readJson(files.calendar);
  const idx = data.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data[idx] = { ...data[idx], ...req.body };
  await fs.writeJson(files.calendar, data, { spaces: 2 });
  res.json(data[idx]);
});
app.delete('/api/calendar/:id', auth, async (req, res) => {
  let data = await fs.readJson(files.calendar);
  data = data.filter(d => d.id !== req.params.id);
  await fs.writeJson(files.calendar, data, { spaces: 2 });
  res.json({ success: true });
});

// ── LESSONS ───────────────────────────────────────────────────────
app.get('/api/lessons', auth, async (req, res) => res.json(await fs.readJson(files.lessons)));
app.post('/api/lessons', auth, async (req, res) => {
  const data = await fs.readJson(files.lessons);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.lessons, data, { spaces: 2 });
  res.json(item);
});
app.put('/api/lessons/:id', auth, async (req, res) => {
  const data = await fs.readJson(files.lessons);
  const idx = data.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data[idx] = { ...data[idx], ...req.body };
  await fs.writeJson(files.lessons, data, { spaces: 2 });
  res.json(data[idx]);
});
app.delete('/api/lessons/:id', auth, async (req, res) => {
  let data = await fs.readJson(files.lessons);
  data = data.filter(d => d.id !== req.params.id);
  await fs.writeJson(files.lessons, data, { spaces: 2 });
  res.json({ success: true });
});

// ── PRODUCTIVITY ──────────────────────────────────────────────────
app.get('/api/productivity', auth, async (req, res) => {
  const prod = await fs.readJson(files.productivity);
  const today = new Date().toISOString().split('T')[0];
  res.json(prod[`${req.session.userId}-${today}`] || {});
});
app.put('/api/productivity', auth, async (req, res) => {
  const prod = await fs.readJson(files.productivity);
  const today = new Date().toISOString().split('T')[0];
  prod[`${req.session.userId}-${today}`] = { ...req.body, userId: req.session.userId, date: today };
  await fs.writeJson(files.productivity, prod, { spaces: 2 });
  res.json(prod[`${req.session.userId}-${today}`]);
});

// ── MESSAGES ──────────────────────────────────────────────────────
app.get('/api/messages', auth, async (req, res) => {
  const msgs = await fs.readJson(files.messages);
  res.json(msgs.filter(m => m.toId === req.session.userId || m.fromId === req.session.userId));
});
app.post('/api/messages', auth, async (req, res) => {
  const msgs = await fs.readJson(files.messages);
  const msg = { id: Date.now().toString(), fromId: req.session.userId, ...req.body, createdAt: new Date().toISOString(), readAt: null, savedByRecipient: false, dismissedBySender: false, dismissedByRecipient: false };
  msgs.push(msg);
  await fs.writeJson(files.messages, msgs, { spaces: 2 });
  const senderName = req.session.userId === 'rebecca' ? 'Rebecca' : 'Mary';
  await createNotification([req.body.toId], 'message', `New message from ${senderName}`, { messageId: msg.id });
  res.json(msg);
});
app.put('/api/messages/:id', auth, async (req, res) => {
  const msgs = await fs.readJson(files.messages);
  const idx = msgs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  msgs[idx] = { ...msgs[idx], ...req.body };
  await fs.writeJson(files.messages, msgs, { spaces: 2 });
  res.json(msgs[idx]);
});
app.delete('/api/messages/:id', auth, async (req, res) => {
  let msgs = await fs.readJson(files.messages);
  msgs = msgs.filter(m => m.id !== req.params.id);
  await fs.writeJson(files.messages, msgs, { spaces: 2 });
  res.json({ success: true });
});

// ── GOALS ─────────────────────────────────────────────────────────
app.get('/api/goals', auth, async (req, res) => res.json(await fs.readJson(files.goals)));
app.put('/api/goals', auth, async (req, res) => {
  const old = await fs.readJson(files.goals);
  const newGoals = req.body;
  await fs.writeJson(files.goals, newGoals, { spaces: 2 });
  const oldIds = [...(old.goals||[]), ...(old.radar||[])].map(g => g.id);
  const newItems = [...(newGoals.goals||[]), ...(newGoals.radar||[])].filter(g => !oldIds.includes(g.id));
  if (newItems.length > 0) {
    const otherId = req.session.userId === 'rebecca' ? 'mary' : 'rebecca';
    for (const g of newItems) {
      await createNotification([otherId], 'goal', `New goal added: "${g.name}"`, {});
    }
  }
  res.json(newGoals);
});

// ── LINKS ─────────────────────────────────────────────────────────
app.get('/api/links', auth, async (req, res) => res.json(await fs.readJson(files.links)));
app.put('/api/links', auth, async (req, res) => {
  await fs.writeJson(files.links, req.body, { spaces: 2 });
  res.json(req.body);
});
app.post('/api/links/lesson', auth, async (req, res) => {
  const links = await fs.readJson(files.links);
  const link = { id: Date.now().toString(), ...req.body, addedBy: req.session.userId };
  links.lessonLinks.push(link);
  await fs.writeJson(files.links, links, { spaces: 2 });
  res.json(link);
});
app.delete('/api/links/lesson/:id', auth, async (req, res) => {
  const links = await fs.readJson(files.links);
  links.lessonLinks = links.lessonLinks.filter(l => l.id !== req.params.id);
  await fs.writeJson(files.links, links, { spaces: 2 });
  res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

initData().then(() => {
  app.listen(PORT, () => console.log(`MSA Organizer on port ${PORT}`));
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
