/**
 * GET /api/live  — SSE endpoint for real-time dashboard updates.
 * Browsers connect once; the server pushes events as agents work.
 */
const { Router } = require('express');
const { addClient } = require('../../lib/broadcaster');

const router = Router();

router.get('/', (req, res) => {
  res.set({
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',   // disable nginx buffering if proxied
  });
  res.flushHeaders();

  // Keep connection alive every 25 s
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 25_000);

  res.on('close', () => clearInterval(heartbeat));

  addClient(res);
});

module.exports = router;
