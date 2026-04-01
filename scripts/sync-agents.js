/**
 * sync-agents.js
 *
 * Reads live Paperclip agent workspaces + Claude Code session history
 * and upserts agents, usage logs, and tasks into paperclip-hq's MongoDB.
 *
 * Run:  node scripts/sync-agents.js
 * Cron: add `node /path/to/sync-agents.js >> /tmp/sync.log 2>&1` to crontab
 */

require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const mongoose = require('mongoose');
const os       = require('os');

const Agent    = require('../src/models/Agent');
const UsageLog = require('../src/models/UsageLog');
const Activity = require('../src/models/Activity');
const Task     = require('../src/models/Task');

// ── Config ────────────────────────────────────────────────────────────────────

const PAPERCLIP_WORKSPACES = path.join(
  os.homedir(), '.paperclip', 'instances', 'default', 'workspaces'
);
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');

// Approximate token costs in USD (Sonnet 4.5 / 4.6 pricing)
const PRICING = {
  'claude-sonnet-4-5':           { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-4-5-20250929':  { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-4-6':           { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-6':             { input: 15.0, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku-4-5':            { input: 0.80, output: 4.00,  cacheRead: 0.08, cacheWrite: 1.00 },
};
const DEFAULT_PRICING = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };

// Agent color rotation
const COLORS = ['teal', 'amber', 'purple', 'green'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeCost(usage, modelId) {
  const p = PRICING[modelId] || DEFAULT_PRICING;
  const inputTokens  = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const outputTokens = usage.output_tokens || 0;
  const cacheRead    = usage.cache_read_input_tokens || 0;

  return (
    (inputTokens  / 1_000_000) * p.input  +
    (outputTokens / 1_000_000) * p.output +
    (cacheRead    / 1_000_000) * p.cacheRead
  );
}

/** Convert a filesystem path to the Claude Code project key format.
 *  Claude Code replaces every non-alphanumeric char (/, ., space, etc.) with '-'
 *  and keeps the leading '-' that comes from the leading '/'. */
function pathToProjectKey(absPath) {
  return absPath.replace(/[^a-zA-Z0-9]/g, '-');
}

/** Read a text file, return '' on error */
function readFileSafe(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; }
}

/** Extract the first H1 heading from a markdown file as a title fallback */
function h1(text) {
  const m = text.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : '';
}

/** Parse role name from SOUL.md — looks for "You are the X" */
function parseRole(soul) {
  const m = soul.match(/You are the ([^\n.]+)/i);
  return m ? m[1].trim() : '';
}

/** Parse company name from workspace root docs.
 *  Checks: "CEO of X", "CEO - X", "# X Weekly Report", company-name.md hints. */
function parseCompany(wsDir) {
  const PATTERNS = [
    /\bCEO of ([A-Z][a-zA-Z0-9]{3,})/,
    /\bCEO\s*[-–]\s*([A-Z][a-zA-Z0-9]{3,})/,
    /^#\s+([A-Z][a-zA-Z0-9]{3,})\s+(?:Weekly|Board|Status)/m,
  ];

  // Search workspace-root MDs
  const rootFiles = fs.readdirSync(wsDir).filter(f => f.endsWith('.md'));
  for (const f of rootFiles) {
    const content = readFileSafe(path.join(wsDir, f));
    for (const pat of PATTERNS) {
      const m = content.match(pat);
      if (m) return m[1].trim();
    }
  }

  // Also search CEO agent memory files
  const ceoMem = path.join(wsDir, 'agents', 'ceo', 'memory');
  if (fs.existsSync(ceoMem)) {
    const memFiles = fs.readdirSync(ceoMem).filter(f => f.endsWith('.md'));
    for (const f of memFiles) {
      const content = readFileSafe(path.join(ceoMem, f));
      for (const pat of PATTERNS) {
        const m = content.match(pat);
        if (m) return m[1].trim();
      }
      // Look for "company (X)" pattern in memory notes
      const mc = content.match(/[Cc]ompany \(([A-Z][a-zA-Z0-9]{3,})\)/);
      if (mc) return mc[1].trim();
    }
  }

  return '';
}

/**
 * Gather all JSONL session files for a given workspace path.
 * Claude Code stores them at ~/.claude/projects/<path-slug>/*.jsonl
 */
function getSessionFiles(wsPath) {
  const key = pathToProjectKey(wsPath);
  const dir = path.join(CLAUDE_PROJECTS, key);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(dir, f));
}

// Tool names that produce meaningful activity labels
const TOOL_LABELS = {
  Bash:              e => e.input?.description || `ran: ${(e.input?.command||'').slice(0,60)}`,
  Write:             e => `wrote ${path.basename(e.input?.file_path || 'file')}`,
  Edit:              e => `edited ${path.basename(e.input?.file_path || 'file')}`,
  Read:              e => `read ${path.basename(e.input?.file_path || 'file')}`,
  WebFetch:          e => `fetched ${(e.input?.url||'').replace(/https?:\/\//,'').slice(0,50)}`,
  WebSearch:         e => `searched "${(e.input?.query||'').slice(0,50)}"`,
  Glob:              e => `searched files: ${e.input?.pattern || ''}`,
  Grep:              e => `grepped for "${(e.input?.pattern||'').slice(0,40)}"`,
};

/**
 * Parse one JSONL session file. Returns:
 *  { byDate, activities: [{ uuid, ts, action, tokens, cost }] }
 */
function parseSession(filePath) {
  const byDate     = {};
  const activities = [];

  let lines;
  try { lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean); }
  catch { return { byDate, activities }; }

  // Build a map of tool_use uuid → cost/tokens from the same assistant message
  const usageByMsgId = {};

  for (const raw of lines) {
    let entry;
    try { entry = JSON.parse(raw); } catch { continue; }

    if (entry.type !== 'assistant' || !entry.message) continue;

    const usage   = entry.message.usage;
    const modelId = entry.message.model || 'claude-sonnet-4-6';
    const date    = (entry.timestamp || new Date().toISOString()).slice(0, 10);
    const content = entry.message.content || [];

    // ── Accumulate daily usage ──
    if (usage) {
      const totalTokens =
        (usage.input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.output_tokens || 0);
      const cost = computeCost(usage, modelId);
      if (!byDate[date]) byDate[date] = { tokens: 0, cost: 0, model: modelId };
      byDate[date].tokens += totalTokens;
      byDate[date].cost   += cost;
      // Spread cost evenly across tool calls in this message
      const toolCalls = content.filter(c => c.type === 'tool_use');
      if (toolCalls.length) {
        const perTool = { tokens: Math.round(totalTokens / toolCalls.length), cost: cost / toolCalls.length };
        toolCalls.forEach(tc => { usageByMsgId[tc.id] = perTool; });
      }
    }

    // ── Extract tool calls as activities ──
    for (const c of content) {
      if (c.type !== 'tool_use') continue;
      const labelFn = TOOL_LABELS[c.name];
      if (!labelFn) continue;   // skip unknown / MCP tools
      const action = labelFn(c);
      if (!action) continue;
      const u = usageByMsgId[c.id] || { tokens: 0, cost: 0 };
      activities.push({
        uuid:   `${entry.sessionId}:${c.id}`,
        ts:     new Date(entry.timestamp || Date.now()),
        action,
        tokens: u.tokens,
        cost:   u.cost,
      });
    }
  }

  return { byDate, activities };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function sync() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/paperclip-hq';
  await mongoose.connect(uri);
  console.log(`[sync] Connected to MongoDB → ${uri}`);

  if (!fs.existsSync(PAPERCLIP_WORKSPACES)) {
    console.log('[sync] No Paperclip workspaces found at', PAPERCLIP_WORKSPACES);
    await mongoose.disconnect();
    return;
  }

  const workspaceIds = fs.readdirSync(PAPERCLIP_WORKSPACES)
    .filter(f => fs.statSync(path.join(PAPERCLIP_WORKSPACES, f)).isDirectory());

  let colorIdx = 0;
  let agentsSynced = 0, usageSynced = 0, activitiesSynced = 0;

  for (const wsId of workspaceIds) {
    const wsPath    = path.join(PAPERCLIP_WORKSPACES, wsId);
    const agentsDir = path.join(wsPath, 'agents');
    if (!fs.existsSync(agentsDir)) continue;

    const company = parseCompany(wsPath);

    const agentDirs = fs.readdirSync(agentsDir)
      .filter(f => fs.statSync(path.join(agentsDir, f)).isDirectory());

    // ── Parse all sessions for this workspace ──
    const sessionFiles = getSessionFiles(wsPath);
    const wsUsageByDate   = {};
    const wsAllActivities = [];

    for (const sf of sessionFiles) {
      const { byDate, activities } = parseSession(sf);
      for (const [date, data] of Object.entries(byDate)) {
        if (!wsUsageByDate[date]) wsUsageByDate[date] = { tokens: 0, cost: 0, model: data.model };
        wsUsageByDate[date].tokens += data.tokens;
        wsUsageByDate[date].cost   += data.cost;
      }
      wsAllActivities.push(...activities);
    }

    for (const agentSlug of agentDirs) {
      const agentHome = path.join(agentsDir, agentSlug);

      // ── Parse identity ──
      const soul         = readFileSafe(path.join(agentHome, 'SOUL.md'));
      const roleFromSoul = parseRole(soul);
      const agentName    = roleFromSoul
        ? `${company ? company + ' — ' : ''}${roleFromSoul}`
        : `${company ? company + ' — ' : ''}${agentSlug}`;
      const role         = roleFromSoul || agentSlug;
      const initials     = role.split(/[\s_-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const color        = COLORS[colorIdx % COLORS.length];

      // ── Count memory entries as tasks ──
      const memDir   = path.join(agentHome, 'memory');
      let tasksTotal = 0;
      if (fs.existsSync(memDir)) {
        fs.readdirSync(memDir).filter(f => f.endsWith('.md')).forEach(mf => {
          const content = readFileSafe(path.join(memDir, mf));
          tasksTotal += (content.match(/- \[x\]/gi) || []).length;
        });
      }

      // ── Upsert agent ──
      const agent = await Agent.findOneAndUpdate(
        { name: agentName },
        { $setOnInsert: { name: agentName, initials, color, role }, $set: { tasksTotal } },
        { upsert: true, new: true }
      );
      console.log(`[sync] Agent: ${agentName} (${role}) — ${tasksTotal} tasks`);
      agentsSynced++;
      colorIdx++;

      // ── Upsert daily usage logs (split evenly across agents in workspace) ──
      const splitFactor = agentDirs.length || 1;
      for (const [dateStr, data] of Object.entries(wsUsageByDate)) {
        const date   = new Date(dateStr + 'T00:00:00.000Z');
        const tokens = Math.round(data.tokens / splitFactor);
        const cost   = data.cost / splitFactor;
        const existing = await UsageLog.findOne({
          agentName, date: { $gte: date, $lt: new Date(date.getTime() + 86400000) },
        });
        if (existing) {
          existing.tokens = tokens; existing.cost = cost; existing.model = data.model;
          await existing.save();
        } else {
          await UsageLog.create({ date, agent: agent._id, agentName, agentColor: color,
            model: data.model, tokens, cost, tasks: 0 });
        }
        usageSynced++;
      }

      // ── Update costToday on agent ──
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayLog = await UsageLog.findOne({ agentName, date: { $gte: today } });
      if (todayLog) await Agent.findByIdAndUpdate(agent._id, { costToday: todayLog.cost });

      // ── Upsert activities (last 200 per workspace, split across agents) ──
      const recentActivities = wsAllActivities
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 200);

      for (const act of recentActivities) {
        try {
          await Activity.findOneAndUpdate(
            { externalId: act.uuid },
            {
              $setOnInsert: {
                agent:      agent._id,
                agentName,
                initials,
                color,
                action:    act.action,
                tokens:    Math.round(act.tokens / splitFactor),
                cost:      act.cost / splitFactor,
                externalId: act.uuid,
                createdAt:  act.ts,
              },
            },
            { upsert: true, new: true }
          );
          activitiesSynced++;
        } catch { /* duplicate key — already imported */ }
      }
    }
  }

  console.log(`[sync] Done — ${agentsSynced} agents, ${usageSynced} usage logs, ${activitiesSynced} activities`);
  await mongoose.disconnect();
}

sync().catch(err => {
  console.error('[sync] Error:', err.message);
  process.exit(1);
});
