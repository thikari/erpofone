/**
 * Chat routes
 *
 * GET  /chat         — render chat page
 * POST /chat/stream  — SSE endpoint, routes to Anthropic / Mistral / OpenRouter
 */

const { Router } = require('express');
const Agent      = require('../models/Agent');
const { streamChat, providerStatus } = require('../lib/aiProviders');

const router = Router();

// Grouped model list shown in the UI
const MODEL_GROUPS = [
  {
    label: 'Claude (direct)',
    key: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-opus-4-6',            name: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6',          name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001',  name: 'Claude Haiku 4.5' },
    ],
  },
  {
    label: 'Mistral (direct)',
    key: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-large-latest',  name: 'Mistral Large' },
      { id: 'mistral-small-latest',  name: 'Mistral Small' },
      { id: 'codestral-latest',      name: 'Codestral' },
    ],
  },
  {
    label: 'Via OpenRouter',
    key: 'OPENROUTER_API_KEY',
    models: [
      { id: 'openai/gpt-4o',                      name: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini',                  name: 'GPT-4o mini' },
      { id: 'google/gemini-pro-1.5',               name: 'Gemini Pro 1.5' },
      { id: 'meta-llama/llama-3.3-70b-instruct',   name: 'Llama 3.3 70B' },
      { id: 'mistralai/mistral-large',             name: 'Mistral Large (OR)' },
      { id: 'anthropic/claude-sonnet-4-6',         name: 'Claude Sonnet (OR)' },
    ],
  },
];

// GET /chat
router.get('/', async (req, res) => {
  const agents = await Agent.find({}, 'name role color initials').lean();

  // Mark which groups have their API key configured
  const groups = MODEL_GROUPS.map(g => ({
    ...g,
    hasKey: Boolean(process.env[g.key]),
  }));

  res.render('pages/chat', { pageTitle: 'Chat', agents, groups });
});

// POST /chat/stream — SSE
router.post('/stream', async (req, res) => {
  const { agentId, model, messages = [] } = req.body;

  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const { provider, hasKey } = providerStatus(model);
  if (!hasKey) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: `${provider} API key not set. Add it to your .env file.` })}\n\n`);
    return res.end();
  }

  // Build messages with optional agent system prompt
  let finalMessages = [...messages];
  try {
    if (agentId) {
      const agent = await Agent.findById(agentId).lean();
      if (agent) {
        const content = [`You are ${agent.name}, a ${agent.role}.`, agent.description].filter(Boolean).join('\n\n');
        finalMessages = [{ role: 'system', content }, ...finalMessages.filter(m => m.role !== 'system')];
      }
    }
  } catch {}

  let closed = false;
  req.on('close', () => { closed = true; });

  streamChat({
    model: model || 'claude-sonnet-4-6',
    messages: finalMessages,
    onChunk(text) {
      if (closed) return;
      try { res.write(`event: chunk\ndata: ${JSON.stringify({ text })}\n\n`); } catch {}
    },
    onDone() {
      if (closed) return;
      try { res.write(`event: done\ndata: {}\n\n`); res.end(); } catch {}
    },
    onError(err) {
      if (closed) return;
      try { res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`); res.end(); } catch {}
    },
  });
});

module.exports = router;
