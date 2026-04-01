/**
 * OpenRouter service — OpenAI-compatible API wrapper.
 * Uses Node's built-in https module; no extra dependencies.
 */

const https = require('https');

const BASE_URL = 'https://openrouter.ai/api/v1';

// In-memory models cache
let modelsCache = null;
let modelsCacheAt = 0;
const MODELS_TTL = 60 * 60 * 1000; // 1 hour

function apiKey() {
  return process.env.OPENROUTER_API_KEY || '';
}

function defaultHeaders() {
  return {
    'Authorization':  `Bearer ${apiKey()}`,
    'Content-Type':   'application/json',
    'HTTP-Referer':   'http://localhost:3000',
    'X-Title':        'ErpofOne',
  };
}

/**
 * Low-level HTTPS GET helper — returns parsed JSON body.
 */
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const opts = Object.assign(new URL(url), { headers });
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Stream a chat completion.
 * Calls onChunk(text) for each text delta, onDone() when finished,
 * onError(err) on failure.
 */
function streamChat({ model, messages, onChunk, onDone, onError }) {
  const key = apiKey();
  if (!key) {
    onError(new Error('OPENROUTER_API_KEY is not set'));
    return;
  }

  const body = JSON.stringify({
    model,
    messages,
    stream: true,
  });

  const opts = {
    hostname: 'openrouter.ai',
    path:     '/api/v1/chat/completions',
    method:   'POST',
    headers:  Object.assign(defaultHeaders(), { 'Content-Length': Buffer.byteLength(body) }),
  };

  const req = https.request(opts, (res) => {
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      // Keep the last partial line in the buffer
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const raw = trimmed.slice(6).trim();
        if (raw === '[DONE]') {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          const text = parsed?.choices?.[0]?.delta?.content;
          if (typeof text === 'string' && text.length > 0) {
            onChunk(text);
          }
        } catch {
          // Malformed SSE line — skip
        }
      }
    });

    res.on('end', () => {
      // Process any remaining buffered data
      if (buffer.trim().startsWith('data: ')) {
        const raw = buffer.trim().slice(6).trim();
        if (raw !== '[DONE]') {
          try {
            const parsed = JSON.parse(raw);
            const text = parsed?.choices?.[0]?.delta?.content;
            if (typeof text === 'string' && text.length > 0) onChunk(text);
          } catch {}
        }
      }
      onDone();
    });

    res.on('error', onError);
  });

  req.on('error', onError);
  req.write(body);
  req.end();
}

/**
 * List available models. Cached for 1 hour.
 * Returns array of { id, name, description, pricing }.
 */
async function listModels() {
  const now = Date.now();
  if (modelsCache && (now - modelsCacheAt) < MODELS_TTL) {
    return modelsCache;
  }

  const key = apiKey();
  if (!key) return [];

  try {
    const data = await httpsGet(`${BASE_URL}/models`, defaultHeaders());
    const models = (data.data || []).map((m) => ({
      id:          m.id,
      name:        m.name || m.id,
      description: m.description || '',
      pricing:     m.pricing || {},
    }));
    modelsCache = models;
    modelsCacheAt = now;
    return models;
  } catch (e) {
    console.error('[openrouter] listModels error:', e.message);
    return [];
  }
}

module.exports = { streamChat, listModels };
