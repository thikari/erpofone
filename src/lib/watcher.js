/**
 * File watcher — monitors Claude Code session JSONL files for changes.
 * When a file grows, extracts the new lines, syncs to MongoDB,
 * and broadcasts updates to connected browsers via SSE.
 */

const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { broadcast } = require('./broadcaster');
const Agent      = require('../models/Agent');
const UsageLog   = require('../models/UsageLog');
const Activity   = require('../models/Activity');

const CLAUDE_PROJECTS      = path.join(os.homedir(), '.claude', 'projects');
const PAPERCLIP_WORKSPACES = path.join(os.homedir(), '.paperclip', 'instances', 'default', 'workspaces');

const PRICING = {
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00, cacheRead: 0.30 },
  'claude-sonnet-4-6':          { input: 3.00, output: 15.00, cacheRead: 0.30 },
  'claude-opus-4-6':            { input: 15.0, output: 75.00, cacheRead: 1.50 },
  'claude-haiku-4-5':           { input: 0.80, output: 4.00,  cacheRead: 0.08 },
};
const DEFAULT_PRICING = { input: 3.00, output: 15.00, cacheRead: 0.30 };

const TOOL_LABELS = {
  Bash:     e => e.input?.description || `ran: ${(e.input?.command || '').slice(0, 60)}`,
  Write:    e => `wrote ${path.basename(e.input?.file_path || 'file')}`,
  Edit:     e => `edited ${path.basename(e.input?.file_path || 'file')}`,
  Read:     e => `read ${path.basename(e.input?.file_path || 'file')}`,
  WebFetch: e => `fetched ${(e.input?.url || '').replace(/https?:\/\//, '').slice(0, 50)}`,
  WebSearch:e => `searched "${(e.input?.query || '').slice(0, 50)}"`,
  Glob:     e => `searched files: ${e.input?.pattern || ''}`,
  Grep:     e => `grepped for "${(e.input?.pattern || '').slice(0, 40)}"`,
};

// Track how many bytes we've already read per file so we only parse new lines
const fileOffsets = new Map();
// Debounce timers per file
const debounceTimers = new Map();

function computeCost(usage, modelId) {
  const p = PRICING[modelId] || DEFAULT_PRICING;
  return (
    ((usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0)) / 1e6 * p.input +
    (usage.output_tokens || 0) / 1e6 * p.output +
    (usage.cache_read_input_tokens || 0) / 1e6 * p.cacheRead
  );
}

// Build a map of workspace path → agent name by reading SOUL.md files
function buildWorkspaceAgentMap() {
  const map = {};   // workspacePath → agentName
  if (!fs.existsSync(PAPERCLIP_WORKSPACES)) return map;

  for (const wsId of fs.readdirSync(PAPERCLIP_WORKSPACES)) {
    const wsPath    = path.join(PAPERCLIP_WORKSPACES, wsId);
    const agentsDir = path.join(wsPath, 'agents');
    if (!fs.existsSync(agentsDir)) continue;

    const agentDirs = fs.readdirSync(agentsDir)
      .filter(f => fs.statSync(path.join(agentsDir, f)).isDirectory());

    // Use first agent found (CEO / primary)
    const agentSlug = agentDirs[0];
    if (!agentSlug) continue;

    const soul  = readSafe(path.join(agentsDir, agentSlug, 'SOUL.md'));
    const match = soul.match(/You are the ([^\n.]+)/i);
    const role  = match ? match[1].trim() : agentSlug;

    // Company name
    const company = extractCompany(wsPath);
    const agentName = company ? `${company} — ${role}` : role;

    const key = wsPath.replace(/[^a-zA-Z0-9]/g, '-');
    map[key] = agentName;
  }
  return map;
}

function extractCompany(wsDir) {
  const PATTERNS = [
    /\bCEO of ([A-Z][a-zA-Z0-9]{3,})/,
    /\bCEO\s*[-–]\s*([A-Z][a-zA-Z0-9]{3,})/,
  ];
  const files = fs.readdirSync(wsDir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    const c = readSafe(path.join(wsDir, f));
    for (const p of PATTERNS) { const m = c.match(p); if (m) return m[1]; }
  }
  return '';
}

function readSafe(fp) { try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; } }

// Process only the new lines appended to a JSONL file since last read
async function processNewLines(filePath, agentName) {
  const stat = fs.statSync(filePath);
  const prevOffset = fileOffsets.get(filePath) || 0;
  if (stat.size <= prevOffset) return;

  const buf = Buffer.alloc(stat.size - prevOffset);
  const fd  = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, buf.length, prevOffset);
  fs.closeSync(fd);
  fileOffsets.set(filePath, stat.size);

  const newLines = buf.toString('utf8').split('\n').filter(Boolean);
  const agent = await Agent.findOne({ name: agentName });

  for (const raw of newLines) {
    let entry; try { entry = JSON.parse(raw); } catch { continue; }
    if (entry.type !== 'assistant' || !entry.message) continue;

    const usage   = entry.message.usage;
    const modelId = entry.message.model || 'claude-sonnet-4-6';
    const content = entry.message.content || [];

    // ── Usage update ──
    if (usage) {
      const tokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) +
                     (usage.cache_read_input_tokens || 0) + (usage.output_tokens || 0);
      const cost = computeCost(usage, modelId);
      const today = new Date(); today.setHours(0, 0, 0, 0);

      await UsageLog.findOneAndUpdate(
        { agentName, date: { $gte: today } },
        { $inc: { tokens, cost }, $setOnInsert: { agentName, model: modelId, agentColor: agent?.color || 'teal', date: today } },
        { upsert: true }
      );
      if (agent) await Agent.findByIdAndUpdate(agent._id, { $inc: { costToday: cost } });

      // Broadcast usage update
      const updated = await Agent.findOne({ name: agentName }, 'name costToday tasksTotal status').lean();
      if (updated) broadcast('agent:update', updated);
    }

    // ── Activity from tool calls ──
    for (const c of content) {
      if (c.type !== 'tool_use') continue;
      const labelFn = TOOL_LABELS[c.name];
      if (!labelFn) continue;
      const action = labelFn(c);
      if (!action) continue;

      const externalId = `${entry.sessionId}:${c.id}`;
      try {
        const act = await Activity.findOneAndUpdate(
          { externalId },
          { $setOnInsert: {
            agent: agent?._id || null, agentName,
            initials: agent?.initials || agentName.slice(0, 2).toUpperCase(),
            color:    agent?.color    || 'teal',
            action, tokens: 0, cost: 0, externalId,
          }},
          { upsert: true, new: true }
        );
        // Only broadcast if this was a newly inserted doc
        if (act && act.createdAt > new Date(Date.now() - 5000)) {
          broadcast('activity:new', {
            agentName, initials: act.initials, color: act.color,
            action, createdAt: act.createdAt,
          });
        }
      } catch { /* duplicate — skip */ }
    }
  }
}

// Watch a single JSONL file
function watchFile(filePath, agentName) {
  if (!fs.existsSync(filePath)) return;
  // Prime the offset so we only pick up NEW lines written after this point
  try { fileOffsets.set(filePath, fs.statSync(filePath).size); } catch {}

  fs.watch(filePath, () => {
    // Debounce — JSONL files can get multiple rapid writes
    clearTimeout(debounceTimers.get(filePath));
    debounceTimers.set(filePath, setTimeout(() => {
      processNewLines(filePath, agentName).catch(() => {});
    }, 300));
  });
}

// Watch a whole project directory for new session files
function watchProjectDir(dirPath, agentName) {
  if (!fs.existsSync(dirPath)) return;

  // Watch existing files
  fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'))
    .forEach(f => watchFile(path.join(dirPath, f), agentName));

  // Watch for new files created in this directory
  fs.watch(dirPath, (event, filename) => {
    if (!filename?.endsWith('.jsonl')) return;
    const fp = path.join(dirPath, filename);
    if (!fileOffsets.has(fp)) watchFile(fp, agentName);
  });
}

// Derive a human-readable name from a ~/.claude/projects dir key
// Key format: -Users-foo-Projects-myapp  →  "myapp"
function keyToAgentName(key) {
  const parts = key.split('-').filter(Boolean);
  const usersIdx = parts.findIndex(p => p === 'Users');
  // skip /Users/<username> prefix
  const relevant = usersIdx >= 0 ? parts.slice(usersIdx + 2) : parts;
  if (!relevant.length) return key;
  // Return last 2 meaningful segments joined by /
  return relevant.slice(-2).join('/');
}

// Start watching all known Paperclip workspaces + any other Claude Code projects
async function start() {
  if (!fs.existsSync(CLAUDE_PROJECTS)) {
    console.log('[watcher] ~/.claude/projects not found — live sync disabled');
    return;
  }

  // Map from project key → agent name (covers all watched dirs)
  const watchedKeys = new Set();

  // ── Paperclip workspaces (with proper agent names from SOUL.md) ──
  const agentMap = buildWorkspaceAgentMap();
  for (const [projectKey, agentName] of Object.entries(agentMap)) {
    const dir = path.join(CLAUDE_PROJECTS, projectKey);
    if (fs.existsSync(dir)) {
      watchProjectDir(dir, agentName);
      watchedKeys.add(projectKey);
      console.log(`[watcher] watching ${agentName} → ${dir}`);
    }
  }

  // ── All other ~/.claude/projects dirs — auto-discover via DB ──
  // Only watch dirs where an Agent record already exists (registered via /connect or /api/ingest/register)
  const knownAgents = await Agent.find({}, 'name').lean();
  const knownNames  = new Set(knownAgents.map(a => a.name.toLowerCase()));

  for (const entry of fs.readdirSync(CLAUDE_PROJECTS)) {
    if (watchedKeys.has(entry)) continue;
    const dir  = path.join(CLAUDE_PROJECTS, entry);
    if (!fs.statSync(dir).isDirectory()) continue;

    const derivedName = keyToAgentName(entry);
    // Check if any registered agent name matches this derived path segment
    const match = knownAgents.find(a =>
      derivedName.toLowerCase().includes(a.name.toLowerCase()) ||
      a.name.toLowerCase().includes(derivedName.toLowerCase())
    );
    if (match) {
      watchProjectDir(dir, match.name);
      watchedKeys.add(entry);
      console.log(`[watcher] auto-discovered: ${match.name} → ${dir}`);
    }
  }

  // ── Watch for new Paperclip workspaces appearing ──
  if (fs.existsSync(PAPERCLIP_WORKSPACES)) {
    fs.watch(PAPERCLIP_WORKSPACES, () => {
      const newMap = buildWorkspaceAgentMap();
      for (const [key, agentName] of Object.entries(newMap)) {
        if (!watchedKeys.has(key)) {
          const dir = path.join(CLAUDE_PROJECTS, key);
          if (fs.existsSync(dir)) {
            watchProjectDir(dir, agentName);
            watchedKeys.add(key);
            console.log(`[watcher] new Paperclip agent: ${agentName}`);
            broadcast('agent:new', { agentName });
          }
        }
      }
    });
  }

  // ── Watch for new agents registered via the API ──
  // Poll MongoDB every 60 s for new agents that have a matching claude project dir
  setInterval(async () => {
    try {
      const agents = await Agent.find({}, 'name').lean();
      for (const a of agents) {
        // Find a project dir that likely corresponds to this agent
        for (const entry of fs.readdirSync(CLAUDE_PROJECTS)) {
          if (watchedKeys.has(entry)) continue;
          const dir = path.join(CLAUDE_PROJECTS, entry);
          if (!fs.statSync(dir).isDirectory()) continue;
          const derived = keyToAgentName(entry);
          if (derived.toLowerCase().includes(a.name.toLowerCase()) ||
              a.name.toLowerCase().includes(derived.toLowerCase())) {
            watchProjectDir(dir, a.name);
            watchedKeys.add(entry);
            console.log(`[watcher] linked new agent: ${a.name} → ${dir}`);
          }
        }
      }
    } catch { /* ignore */ }
  }, 60_000);

  console.log(`[watcher] live sync active — watching ${watchedKeys.size} project(s)`);
}

module.exports = { start };
