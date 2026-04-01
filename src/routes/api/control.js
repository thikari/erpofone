/**
 * /api/control — send commands to agents
 *
 * POST /api/control/task   — assign a task (saves to DB + optionally creates Paperclip issue)
 * POST /api/control/wake   — wake a Paperclip agent via heartbeat run
 */

const router = require('express').Router();
const { execFile } = require('child_process');
const Agent  = require('../../models/Agent');
const Task   = require('../../models/Task');

/* ─────────────────────────────────────────────────────────
   POST /api/control/task
   Body: { agentId, agentName, title, description? }

   1. Saves a Task record in MongoDB (visible on /tasks)
   2. Updates agent status → queued
   3. If paperclipai is available + companyId known, creates a Paperclip issue too
──────────────────────────────────────────────────────────── */
router.post('/task', async (req, res) => {
  const { agentId, agentName, title, description = '', companyId, papAgentId } = req.body;
  if (!title || !agentName) return res.status(400).json({ ok: false, error: 'title and agentName required' });

  // Save task in paperclip-hq
  const task = await Task.create({
    title,
    agent:     agentId || null,
    agentName,
    status:    'queued',
    progress:  0,
    result:    description,
  });

  // Mark agent queued
  if (agentId) await Agent.findByIdAndUpdate(agentId, { status: 'queued', currentTask: title });

  // Optionally create Paperclip issue + trigger heartbeat
  let paperclipCreated = false;
  if (companyId && papAgentId) {
    try {
      await paperclipIssueCreate({ companyId, papAgentId, title, description });
      paperclipCreated = true;
    } catch { /* Paperclip not running — silent fallback */ }
  }

  res.json({ ok: true, taskId: task._id, paperclip: paperclipCreated });
});

/* ─────────────────────────────────────────────────────────
   POST /api/control/wake
   Body: { agentName, companyId?, papAgentId? }

   Runs: paperclipai heartbeat run --agent-id <papAgentId>
──────────────────────────────────────────────────────────── */
router.post('/wake', async (req, res) => {
  const { agentName, companyId, papAgentId } = req.body;

  if (!papAgentId) {
    return res.json({ ok: false, error: 'Paperclip Agent ID required. Find it in your Paperclip dashboard or via: paperclipai agent list --company-id <id>' });
  }

  try {
    const out = await runHeartbeat(papAgentId);
    res.json({ ok: true, message: `Heartbeat triggered for ${agentName}`, output: out });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────

function paperclipIssueCreate({ companyId, papAgentId, title, description }) {
  return new Promise((resolve, reject) => {
    const args = [
      '/usr/local/lib/node_modules/paperclipai/dist/index.js',
      'issue', 'create',
      '--company-id', companyId,
      '--assignee-agent-id', papAgentId,
      '--title', title,
      '--status', 'todo',
    ];
    if (description) args.push('--description', description);
    execFile('node', args, { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

function runHeartbeat(papAgentId) {
  return new Promise((resolve, reject) => {
    const args = [
      '/usr/local/lib/node_modules/paperclipai/dist/index.js',
      'heartbeat', 'run',
      '--agent-id', papAgentId,
      '--source', 'on_demand',
      '--trigger', 'manual',
      '--timeout-ms', '10000',
    ];
    execFile('node', args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

module.exports = router;
