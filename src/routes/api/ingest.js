/**
 * Ingest API — agents POST real-time events here.
 *
 * POST /api/ingest/register   — self-register any agent (no auth), returns token
 * All other routes require:   Authorization: Bearer <token>
 *
 * POST /api/ingest/activity   — log one completed action
 * POST /api/ingest/usage      — log token/cost usage
 * POST /api/ingest/task       — create or update a task
 */

const router       = require('express').Router();
const crypto       = require('crypto');
const auth         = require('../../lib/ingestAuth');
const Agent        = require('../../models/Agent');
const Activity     = require('../../models/Activity');
const UsageLog     = require('../../models/UsageLog');
const Task         = require('../../models/Task');
const IngestToken  = require('../../models/IngestToken');
const Report       = require('../../models/Report');

/* ─────────────────────────────────
   POST /api/ingest/register  (PUBLIC — no auth)
   Body: { name, role?, model?, color? }
   Returns: { token, agentName, endpoint, quickstart }
───────────────────────────────── */
router.post('/register', async (req, res) => {
  const { name, role = 'Agent', model = 'unknown', color = 'teal' } = req.body;
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name required' });

  const trimmed  = name.trim();
  const initials = trimmed.split(/[\s\-—]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const safeColor = ['teal','amber','purple','green','gray'].includes(color) ? color : 'teal';

  await Agent.findOneAndUpdate(
    { name: trimmed },
    { $setOnInsert: { name: trimmed, initials, role: role.trim(), color: safeColor, model } },
    { upsert: true }
  );

  const tokenKey = `${trimmed} (auto)`;
  let tokenDoc = await IngestToken.findOne({ name: tokenKey });
  if (!tokenDoc) {
    tokenDoc = await IngestToken.create({ name: tokenKey, token: crypto.randomBytes(32).toString('hex') });
  }

  const hqUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  res.json({
    ok:        true,
    agentName: trimmed,
    token:     tokenDoc.token,
    endpoint:  `${hqUrl}/api/ingest`,
    quickstart: buildQuickstart(trimmed, tokenDoc.token, hqUrl),
  });
});

function buildQuickstart(agentName, token, hqUrl) {
  return `# PaperclipHQ — reporting instructions

Agent name : ${agentName}
Dashboard  : ${hqUrl}
Token      : ${token}

## Report an action (run after each significant step)
curl -s -X POST ${hqUrl}/api/ingest/activity \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"agentName":"${agentName}","action":"<one sentence describing what you just did>"}'

## Start a task
curl -s -X POST ${hqUrl}/api/ingest/task \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"agentName":"${agentName}","title":"<task title>","status":"running"}'
# → returns {"taskId":"..."} — save it to mark the task done later

## Complete a task
curl -s -X PATCH ${hqUrl}/api/ingest/task/<taskId> \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"done","result":"<one line outcome>"}'
`;
}

// ── Auth required for all routes below ──
router.use(auth);

/* ─────────────────────────────────
   Helper — resolve agent by name
───────────────────────────────── */
async function resolveAgent(agentName) {
  if (!agentName) return null;
  return Agent.findOne({ name: agentName });
}

/* ─────────────────────────────────
   POST /api/ingest/activity
   Body: { agentName, action, tokens?, cost? }
───────────────────────────────── */
router.post('/activity', async (req, res) => {
  const { agentName, action, tokens = 0, cost = 0 } = req.body;
  if (!agentName || !action) return res.status(400).json({ ok: false, error: 'agentName and action required' });

  const agent = await resolveAgent(agentName);

  const activity = await Activity.create({
    agent:     agent?._id || null,
    agentName,
    initials:  agent?.initials || agentName.slice(0, 2).toUpperCase(),
    color:     agent?.color    || 'teal',
    action,
    tokens:    Number(tokens),
    cost:      Number(cost),
  });

  // Update agent costToday
  if (agent && cost) {
    await Agent.findByIdAndUpdate(agent._id, { $inc: { costToday: Number(cost) } });
  }

  res.json({ ok: true, activity });
});

/* ─────────────────────────────────
   POST /api/ingest/usage
   Body: { agentName, model, tokens, cost, tasks? }
───────────────────────────────── */
router.post('/usage', async (req, res) => {
  const { agentName, model = 'claude-sonnet-4-6', tokens = 0, cost = 0, tasks = 0 } = req.body;
  if (!agentName) return res.status(400).json({ ok: false, error: 'agentName required' });

  const agent = await resolveAgent(agentName);

  const log = await UsageLog.create({
    date:       new Date(),
    agent:      agent?._id || null,
    agentName,
    agentColor: agent?.color || 'teal',
    model,
    tokens:     Number(tokens),
    cost:       Number(cost),
    tasks:      Number(tasks),
  });

  if (agent && cost) {
    await Agent.findByIdAndUpdate(agent._id, { $inc: { costToday: Number(cost) } });
  }

  res.json({ ok: true, log });
});

/* ─────────────────────────────────
   POST /api/ingest/task
   Body: { title, agentName, status?, progress?, tokens?, cost?, result? }
   Returns taskId — use it to update the same task later.

   PATCH /api/ingest/task/:id
   Body: { status?, progress?, tokens?, cost?, result? }
───────────────────────────────── */
router.post('/task', async (req, res) => {
  const { title, agentName, status = 'running', progress = 0, tokens = 0, cost = 0, result = '' } = req.body;
  if (!title || !agentName) return res.status(400).json({ ok: false, error: 'title and agentName required' });

  const agent = await resolveAgent(agentName);

  const task = await Task.create({
    title,
    agent:     agent?._id || null,
    agentName,
    status,
    progress:  Number(progress),
    tokens:    Number(tokens),
    cost:      Number(cost),
    result,
    completedAt: ['done','failed'].includes(status) ? new Date() : null,
  });

  if (agent && ['done','failed'].includes(status)) {
    await Agent.findByIdAndUpdate(agent._id, { $inc: { tasksTotal: 1 } });
  }

  res.json({ ok: true, taskId: task._id });
});

router.patch('/task/:id', async (req, res) => {
  const { status, progress, tokens, cost, result } = req.body;

  const update = {};
  if (status   !== undefined) update.status   = status;
  if (progress !== undefined) update.progress = Number(progress);
  if (tokens   !== undefined) update.tokens   = Number(tokens);
  if (cost     !== undefined) update.cost     = Number(cost);
  if (result   !== undefined) update.result   = result;
  if (['done','failed'].includes(status)) update.completedAt = new Date();

  const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });

  // Increment agent tasksTotal on completion
  if (['done','failed'].includes(status) && task.agent) {
    await Agent.findByIdAndUpdate(task.agent, { $inc: { tasksTotal: 1 } });
  }

  res.json({ ok: true, task });
});

/* ─────────────────────────────────
   POST /api/ingest/report
   Body: { agentName, summary, highlights?, tasksDone?, tasksTotal?, tokens?, cost?, period? }
───────────────────────────────── */
router.post('/report', async (req, res) => {
  const { agentName, summary, highlights = [], tasksDone = 0, tasksTotal = 0, tokens = 0, cost = 0, period = 'daily' } = req.body;
  if (!agentName || !summary) return res.status(400).json({ ok: false, error: 'agentName and summary required' });

  const agent = await resolveAgent(agentName);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const report = await Report.findOneAndUpdate(
    { agentName, date: today },
    {
      $set: {
        agent:      agent?._id || null,
        period,
        summary,
        highlights: Array.isArray(highlights) ? highlights : [],
        tasksDone:  Number(tasksDone),
        tasksTotal: Number(tasksTotal),
        tokens:     Number(tokens),
        cost:       Number(cost),
      },
    },
    { upsert: true, new: true }
  );

  res.json({ ok: true, reportId: report._id });
});

module.exports = router;
