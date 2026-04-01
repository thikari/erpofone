/**
 * Unified AI provider — routes to the right API based on model ID.
 *
 *   claude-*        → Anthropic direct  (ANTHROPIC_API_KEY)
 *   mistral-* / codestral-* → Mistral direct (MISTRAL_API_KEY)
 *   everything else → OpenRouter        (OPENROUTER_API_KEY)
 *
 * All providers expose the same interface:
 *   streamChat({ model, messages, onChunk, onDone, onError })
 */

const https = require('https');

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function post(hostname, path, headers, body, onData, onEnd, onError) {
  const buf = Buffer.from(JSON.stringify(body));
  const req = https.request(
    { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': buf.length } },
    res => { res.on('data', onData); res.on('end', onEnd); res.on('error', onError); }
  );
  req.on('error', onError);
  req.write(buf);
  req.end();
}

// Parse OpenAI-compatible SSE stream (OpenRouter + Mistral)
function parseOpenAIStream(onChunk, onDone, onError) {
  let buffer = '';
  return {
    onData(chunk) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        const raw = t.slice(6).trim();
        if (raw === '[DONE]') { onDone(); return; }
        try {
          const text = JSON.parse(raw)?.choices?.[0]?.delta?.content;
          if (typeof text === 'string' && text) onChunk(text);
        } catch {}
      }
    },
    onEnd() { onDone(); },
  };
}

// Parse Anthropic SSE stream
function parseAnthropicStream(onChunk, onDone, onError) {
  let buffer = '';
  let eventType = '';
  return {
    onData(chunk) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('event: ')) { eventType = t.slice(7).trim(); continue; }
        if (!t.startsWith('data: ')) continue;
        if (eventType === 'message_stop') { onDone(); return; }
        if (eventType === 'content_block_delta') {
          try {
            const text = JSON.parse(t.slice(6))?.delta?.text;
            if (typeof text === 'string' && text) onChunk(text);
          } catch {}
        }
      }
    },
    onEnd() { onDone(); },
  };
}

// ─────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────

function anthropic({ model, messages, onChunk, onDone, onError }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return onError(new Error('ANTHROPIC_API_KEY not set'));

  // Anthropic keeps system separate
  const system  = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const msgs    = messages.filter(m => m.role !== 'system');

  const body = { model, max_tokens: 4096, messages: msgs, stream: true };
  if (system) body.system = system;

  const handler = parseAnthropicStream(onChunk, onDone, onError);
  post(
    'api.anthropic.com', '/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body, handler.onData, handler.onEnd, onError
  );
}

function mistral({ model, messages, onChunk, onDone, onError }) {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return onError(new Error('MISTRAL_API_KEY not set'));

  const handler = parseOpenAIStream(onChunk, onDone, onError);
  post(
    'api.mistral.ai', '/v1/chat/completions',
    { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    { model, messages, stream: true },
    handler.onData, handler.onEnd, onError
  );
}

function openrouter({ model, messages, onChunk, onDone, onError }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return onError(new Error('OPENROUTER_API_KEY not set'));

  const handler = parseOpenAIStream(onChunk, onDone, onError);
  post(
    'openrouter.ai', '/api/v1/chat/completions',
    {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'http://localhost:3000',
      'X-Title':       'ErpofOne',
    },
    { model, messages, stream: true },
    handler.onData, handler.onEnd, onError
  );
}

// ─────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────

function streamChat({ model, messages, onChunk, onDone, onError }) {
  if (!model) return onError(new Error('No model specified'));

  if (model.startsWith('claude-')) return anthropic({ model, messages, onChunk, onDone, onError });
  if (model.startsWith('mistral-') || model.startsWith('codestral')) return mistral({ model, messages, onChunk, onDone, onError });
  return openrouter({ model, messages, onChunk, onDone, onError });
}

// Which provider will handle this model, and is its key set?
function providerStatus(model) {
  if (!model || model.startsWith('claude-'))
    return { provider: 'Anthropic', hasKey: Boolean(process.env.ANTHROPIC_API_KEY) };
  if (model.startsWith('mistral-') || model.startsWith('codestral'))
    return { provider: 'Mistral', hasKey: Boolean(process.env.MISTRAL_API_KEY) };
  return { provider: 'OpenRouter', hasKey: Boolean(process.env.OPENROUTER_API_KEY) };
}

module.exports = { streamChat, providerStatus };
