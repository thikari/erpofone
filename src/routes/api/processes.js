/**
 * Process API routes
 *
 * POST /api/processes/:id/start   — start agent subprocess
 * POST /api/processes/:id/stop    — stop agent subprocess
 * GET  /api/processes/:id/status  — { running, pid, startedAt, lastLine }
 * GET  /api/processes/:id/stream  — SSE stream of stdout/stderr lines
 */

const { Router } = require('express');
const Agent      = require('../../models/Agent');
const pm         = require('../../lib/processManager');

const router = Router();

// POST /api/processes/:id/start
router.post('/:id/start', async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id).lean();
    if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });

    const result = await pm.startAgent(agent);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/processes/:id/stop
router.post('/:id/stop', async (req, res) => {
  try {
    const result = await pm.stopAgent(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/processes/:id/status
router.get('/:id/status', (req, res) => {
  const status = pm.getStatus(req.params.id);
  res.json(status);
});

// GET /api/processes/:id/stream  — SSE
router.get('/:id/stream', (req, res) => {
  const agentId = req.params.id;

  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Send existing output as history events
  const history = pm.getOutput(agentId);
  for (const line of history) {
    res.write(`event: history\ndata: ${JSON.stringify({ line })}\n\n`);
  }

  // Keep-alive ping
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 25_000);

  // Subscribe to new lines
  function onLine(line) {
    try {
      res.write(`event: line\ndata: ${JSON.stringify({ line })}\n\n`);
    } catch {
      // Client disconnected
    }
  }

  pm.subscribe(agentId, onLine);

  req.on('close', () => {
    clearInterval(heartbeat);
    pm.unsubscribe(agentId, onLine);
  });
});

module.exports = router;
