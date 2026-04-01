/**
 * Chat routes
 *
 * GET  /chat         — render chat page
 * POST /chat/stream  — SSE endpoint that proxies OpenRouter streaming response
 */

const { Router } = require('express');
const Agent      = require('../models/Agent');
const openrouter = require('../lib/openrouter');

const router = Router();

const DEFAULT_MODELS = [
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-opus-4-6',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-pro-1.5',
  'meta-llama/llama-3.3-70b-instruct',
  'mistralai/mistral-large',
];

// GET /chat
router.get('/', async (req, res) => {
  try {
    const agents = await Agent.find({}, 'name role color initials').lean();
    res.render('pages/chat', {
      pageTitle: 'Chat',
      agents,
      defaultModels: DEFAULT_MODELS,
      hasApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    });
  } catch (e) {
    res.status(500).render('pages/error', {
      pageTitle: 'Error',
      code: 500,
      message: e.message,
    });
  }
});

// POST /chat/stream  — SSE
router.post('/stream', async (req, res) => {
  const { agentId, model, messages = [], systemPrompt } = req.body;

  if (!process.env.OPENROUTER_API_KEY) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.flushHeaders();
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'OPENROUTER_API_KEY is not configured. Add it to your .env file.' })}\n\n`);
    res.end();
    return;
  }

  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Build the messages array, prepending a system prompt if needed
  let finalMessages = [...messages];

  try {
    // If agentId provided, load the agent and prepend system context
    if (agentId) {
      const agent = await Agent.findById(agentId).lean();
      if (agent) {
        const agentSystem = [
          `You are ${agent.name}, a ${agent.role}.`,
          agent.description ? agent.description : '',
          systemPrompt || '',
        ].filter(Boolean).join('\n\n');

        finalMessages = [
          { role: 'system', content: agentSystem },
          ...finalMessages.filter((m) => m.role !== 'system'),
        ];
      }
    } else if (systemPrompt) {
      finalMessages = [
        { role: 'system', content: systemPrompt },
        ...finalMessages.filter((m) => m.role !== 'system'),
      ];
    }
  } catch (e) {
    // Non-fatal — continue without agent context
  }

  let closed = false;
  req.on('close', () => { closed = true; });

  openrouter.streamChat({
    model: model || DEFAULT_MODELS[0],
    messages: finalMessages,
    onChunk(text) {
      if (closed) return;
      try {
        res.write(`event: chunk\ndata: ${JSON.stringify({ text })}\n\n`);
      } catch {}
    },
    onDone() {
      if (closed) return;
      try {
        res.write(`event: done\ndata: {}\n\n`);
        res.end();
      } catch {}
    },
    onError(err) {
      if (closed) return;
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        res.end();
      } catch {}
    },
  });
});

module.exports = router;
