/**
 * Process Manager — spawns and monitors agent subprocesses.
 * Captures stdout/stderr, stores last 200 lines, and broadcasts
 * output to subscribed SSE connections via broadcaster.
 */

const { spawn }   = require('child_process');
const { broadcast } = require('./broadcaster');
const Agent       = require('../models/Agent');

// agentId → { process, lines, subscribers, startedAt, agentName }
const procs = new Map();

const MAX_LINES = 200;

/**
 * Shell-style command split: handles single and double quotes.
 * e.g. 'node index.js' → ['node', 'index.js']
 *      'python "my script.py" --arg val' → ['python', 'my script.py', '--arg', 'val']
 */
function splitCommand(cmd) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current.length > 0) { tokens.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

/**
 * Parse "KEY=VALUE\nANOTHER=value" lines into an object.
 */
function parseEnvVars(envStr) {
  const out = {};
  if (!envStr) return out;
  for (const line of envStr.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

/**
 * Start an agent process.
 * Returns { ok: true, pid } or { ok: false, error }
 */
async function startAgent(agent) {
  const agentId = agent._id.toString();

  if (procs.has(agentId)) {
    const existing = procs.get(agentId);
    if (existing.process && existing.process.exitCode === null) {
      return { ok: false, error: 'Agent process already running' };
    }
    procs.delete(agentId);
  }

  const cmd = (agent.startCommand || '').trim();
  if (!cmd) return { ok: false, error: 'No startCommand configured for this agent' };

  const tokens = splitCommand(cmd);
  if (tokens.length === 0) return { ok: false, error: 'startCommand is empty' };

  const command = tokens[0];
  const args    = tokens.slice(1);

  const cwd = (agent.workDir || '').trim() || process.cwd();
  const env = Object.assign({}, process.env, parseEnvVars(agent.envVars));

  let proc;
  try {
    proc = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return { ok: false, error: `Failed to spawn: ${e.message}` };
  }

  if (!proc.pid) {
    return { ok: false, error: 'Process failed to start (no PID assigned)' };
  }

  const entry = {
    process:     proc,
    lines:       [],
    subscribers: new Set(),
    startedAt:   new Date(),
    agentName:   agent.name,
  };
  procs.set(agentId, entry);

  // Update PID in MongoDB
  Agent.findByIdAndUpdate(agentId, { pid: proc.pid }).catch(() => {});

  function handleLine(line) {
    entry.lines.push(line);
    if (entry.lines.length > MAX_LINES) entry.lines.shift();

    // Notify SSE subscribers for this agent
    for (const cb of entry.subscribers) {
      try { cb(line); } catch {}
    }

    // Global SSE broadcast
    broadcast('process:output', { agentId, agentName: agent.name, line });
  }

  // Stream stdout
  let stdoutBuf = '';
  proc.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString('utf8');
    const parts = stdoutBuf.split('\n');
    stdoutBuf = parts.pop();
    parts.forEach((l) => handleLine(l));
  });
  proc.stdout.on('end', () => {
    if (stdoutBuf.length > 0) { handleLine(stdoutBuf); stdoutBuf = ''; }
  });

  // Stream stderr
  let stderrBuf = '';
  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString('utf8');
    const parts = stderrBuf.split('\n');
    stderrBuf = parts.pop();
    parts.forEach((l) => handleLine(`[stderr] ${l}`));
  });
  proc.stderr.on('end', () => {
    if (stderrBuf.length > 0) { handleLine(`[stderr] ${stderrBuf}`); stderrBuf = ''; }
  });

  proc.on('error', (err) => {
    handleLine(`[error] ${err.message}`);
  });

  proc.on('exit', (code, signal) => {
    const msg = signal
      ? `[process] Exited with signal ${signal}`
      : `[process] Exited with code ${code}`;
    handleLine(msg);

    broadcast('process:exit', { agentId, agentName: agent.name, code, signal });

    // Clear PID in MongoDB
    Agent.findByIdAndUpdate(agentId, { pid: null }).catch(() => {});
  });

  return { ok: true, pid: proc.pid };
}

/**
 * Stop a running agent process (SIGTERM, then SIGKILL after 5 s).
 */
async function stopAgent(agentId) {
  const id = agentId.toString();
  const entry = procs.get(id);
  if (!entry || !entry.process) return { ok: false, error: 'No running process found' };

  const proc = entry.process;
  if (proc.exitCode !== null) return { ok: false, error: 'Process already exited' };

  proc.kill('SIGTERM');

  // Force-kill after 5 s if still alive
  const timeout = setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch {}
  }, 5000);

  proc.once('exit', () => clearTimeout(timeout));

  return { ok: true };
}

/**
 * Get process status for an agent.
 * Returns { running, pid, startedAt, lastLine }
 */
function getStatus(agentId) {
  const id = agentId.toString();
  const entry = procs.get(id);
  if (!entry) return { running: false, pid: null, startedAt: null, lastLine: null };

  const running = entry.process && entry.process.exitCode === null;
  return {
    running:   running,
    pid:       running ? entry.process.pid : null,
    startedAt: entry.startedAt,
    lastLine:  entry.lines[entry.lines.length - 1] || null,
  };
}

/**
 * Get the last 200 output lines for an agent.
 */
function getOutput(agentId) {
  const entry = procs.get(agentId.toString());
  return entry ? [...entry.lines] : [];
}

/**
 * Subscribe to live output lines for an agent.
 * callback(line) is called for each new stdout/stderr line.
 */
function subscribe(agentId, callback) {
  const id = agentId.toString();
  if (!procs.has(id)) {
    // Create a placeholder so subscribers can attach before the process starts
    procs.set(id, { process: null, lines: [], subscribers: new Set(), startedAt: null, agentName: '' });
  }
  procs.get(id).subscribers.add(callback);
}

/**
 * Unsubscribe from live output.
 */
function unsubscribe(agentId, callback) {
  const entry = procs.get(agentId.toString());
  if (entry) entry.subscribers.delete(callback);
}

module.exports = { startAgent, stopAgent, getStatus, getOutput, subscribe, unsubscribe };
