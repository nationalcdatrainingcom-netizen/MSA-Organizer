const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const files = {
  users:        path.join(DATA_DIR, 'users.json'),
  tasks:        path.join(DATA_DIR, 'tasks.json'),
  projects:     path.join(DATA_DIR, 'projects.json'),
  meetings:     path.join(DATA_DIR, 'meetings.json'),
  recurring:    path.join(DATA_DIR, 'recurring.json'),
  lessons:      path.join(DATA_DIR, 'lessons.json'),
  links:        path.join(DATA_DIR, 'links.json'),
  calendar:     path.join(DATA_DIR, 'calendar.json'),
  productivity: path.join(DATA_DIR, 'productivity.json'),
  messages:     path.join(DATA_DIR, 'messages.json'),
  goals:        path.join(DATA_DIR, 'goals.json'),
};

async function initData() {
  await fs.ensureDir(DATA_DIR);
  if (!await fs.pathExists(files.users)) {
    await fs.writeJson(files.users, [
      { id: 'rebecca', username: 'rebecca', name: 'Rebecca Munlyn', title: 'Co-Founder', initials: 'RM', color: '#7C3AED', password: bcrypt.hashSync('msa2024', 10) },
      { id: 'mary',    username: 'mary',    name: 'Mary Wardlaw',   title: 'Co-Founder', initials: 'MW', color: '#0F766E', password: bcrypt.hashSync('msa2024', 10) }
    ], { spaces: 2 });
  }
  const defaults = [
    [files.tasks,        []],
    [files.projects,     []],
    [files.meetings,     []],
    [files.recurring,    []],
    [files.lessons,      []],
    [files.links,        { lessonLinks: [], quizLink: '', resourceLinks: [] }],
    [files.calendar,     []],
    [files.productivity, {}],
    [files.messages,     []],
    [files.goals,        { featured: null, goals: [], radar: [] }],
  ];
  for (const [f, def] of defaults) {
    if (!await fs.pathExists(f)) await fs.writeJson(f, def, { spaces: 2 });
  }
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'msa-secret-2024-xk9',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// AUTH
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await fs.readJson(files.users);
  const user = users.find(u => u.username === username.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  req.session.userId = user.id;
  res.json({ success: true, user: { id: user.id, name: user.name, initials: user.initials, color: user.color, title: user.title } });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/me', auth, async (req, res) => {
  const users = await fs.readJson(files.users);
  const u = users.find(u => u.id === req.session.userId);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ id: u.id, name: u.name, initials: u.initials, color: u.color, title: u.title });
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

// TASKS (personal)
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

// PROJECTS (shared or personal)
app.get('/api/projects', auth, async (req, res) => {
  const data = await fs.readJson(files.projects);
  res.json(data.filter(d => d.userId === req.session.userId || d.shared === true));
});
app.post('/api/projects', auth, async (req, res) => {
  const data = await fs.readJson(files.projects);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.projects, data, { spaces: 2 });
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

// MEETINGS (shared)
app.get('/api/meetings', auth, async (req, res) => res.json(await fs.readJson(files.meetings)));
app.post('/api/meetings', auth, async (req, res) => {
  const data = await fs.readJson(files.meetings);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.meetings, data, { spaces: 2 });
  // Also add to calendar
  if (req.body.date) {
    const cal = await fs.readJson(files.calendar);
    cal.push({ id: 'mtg-' + item.id, title: '📋 ' + req.body.title, date: req.body.date, startTime: req.body.time || '', endTime: '', visibility: 'shared', isMeeting: true, meetingId: item.id, userId: req.session.userId, createdAt: new Date().toISOString() });
    await fs.writeJson(files.calendar, cal, { spaces: 2 });
  }
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

// RECURRING (personal or shared)
app.get('/api/recurring', auth, async (req, res) => {
  const data = await fs.readJson(files.recurring);
  res.json(data.filter(d => d.userId === req.session.userId || d.shared === true));
});
app.post('/api/recurring', auth, async (req, res) => {
  const data = await fs.readJson(files.recurring);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.recurring, data, { spaces: 2 });
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

// CALENDAR (shared)
app.get('/api/calendar', auth, async (req, res) => res.json(await fs.readJson(files.calendar)));
app.post('/api/calendar', auth, async (req, res) => {
  const data = await fs.readJson(files.calendar);
  const item = { id: Date.now().toString(), userId: req.session.userId, ...req.body, createdAt: new Date().toISOString() };
  data.push(item);
  await fs.writeJson(files.calendar, data, { spaces: 2 });
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

// LESSONS
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

// PRODUCTIVITY
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

// MESSAGES
app.get('/api/messages', auth, async (req, res) => {
  const msgs = await fs.readJson(files.messages);
  res.json(msgs.filter(m => m.toId === req.session.userId || m.fromId === req.session.userId));
});
app.post('/api/messages', auth, async (req, res) => {
  const msgs = await fs.readJson(files.messages);
  const msg = { id: Date.now().toString(), fromId: req.session.userId, ...req.body, createdAt: new Date().toISOString(), readAt: null, savedByRecipient: false, dismissedBySender: false, dismissedByRecipient: false };
  msgs.push(msg);
  await fs.writeJson(files.messages, msgs, { spaces: 2 });
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

// GOALS (shared)
app.get('/api/goals', auth, async (req, res) => res.json(await fs.readJson(files.goals)));
app.put('/api/goals', auth, async (req, res) => {
  await fs.writeJson(files.goals, req.body, { spaces: 2 });
  res.json(req.body);
});

// LINKS
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

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initData().then(() => app.listen(PORT, () => console.log(`MSA Organizer on port ${PORT}`)));
