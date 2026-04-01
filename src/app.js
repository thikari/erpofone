const express = require('express');
const path    = require('path');

const app = express();

// ── View engine ──
app.set('views',       path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// ── Middleware ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Locals available in all views ──
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// ── Routes ──
app.use('/',          require('./routes/index'));
app.use('/agents',    require('./routes/agents'));
app.use('/tasks',     require('./routes/tasks'));
app.use('/activity',  require('./routes/activity'));
app.use('/resources', require('./routes/resources'));
app.use('/usage',     require('./routes/usage'));
app.use('/revenue',   require('./routes/revenue'));
app.use('/skills',    require('./routes/skills'));
app.use('/crons',     require('./routes/crons'));
app.use('/reports',   require('./routes/reports'));
app.use('/settings',  require('./routes/settings'));
app.use('/connect',    require('./routes/connect'));
app.use('/api/ingest',    require('./routes/api/ingest'));
app.use('/api/sync',     require('./routes/api/sync'));
app.use('/api/control',  require('./routes/api/control'));
app.use('/api/live',     require('./routes/api/live'));
app.use('/chat',         require('./routes/chat'));
app.use('/api/processes', require('./routes/api/processes'));

// ── 404 ──
app.use((req, res) => {
  res.status(404).render('pages/error', {
    pageTitle: 'Not found',
    code: 404,
    message: 'Page not found',
  });
});

// ── Error handler ──
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('pages/error', {
    pageTitle: 'Error',
    code: 500,
    message: err.message || 'Something went wrong',
  });
});

module.exports = app;
