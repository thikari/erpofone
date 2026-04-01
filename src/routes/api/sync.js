/**
 * POST /api/sync
 * Triggers the Paperclip → MongoDB sync inline (no child process).
 * Returns a summary of what was synced.
 */

const router   = require('express').Router();
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const Agent    = require('../../models/Agent');
const UsageLog = require('../../models/UsageLog');

const PAPERCLIP_WORKSPACES = path.join(
  os.homedir(), '.paperclip', 'instances', 'default', 'workspaces'
);
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');

const PRICING = {
  'claude-sonnet-4-5':          { input: 3.00, output: 15.00, cacheRead: 0.30 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00, cacheRead: 0.30 },
  'claude-sonnet-4-6':          { input: 3.00, output: 15.00, cacheRead: 0.30 },
  'claude-opus-4-6':            { input: 15.0, output: 75.00, cacheRead: 1.50 },
  'claude-haiku-4-5':           { input: 0.80, output: 4.00,  cacheRead: 0.08 },
};
const DEFAULT_PRICING = { input: 3.00, output: 15.00, cacheRead: 0.30 };
const COLORS = ['teal', 'amber', 'purple', 'green'];

function computeCost(usage, modelId) {
  const p = PRICING[modelId] || DEFAULT_PRICING;
  return (
    ((usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0)) / 1_000_000 * p.input +
    (usage.output_tokens || 0) / 1_000_000 * p.output +
    (usage.cache_read_input_tokens || 0) / 1_000_000 * p.cacheRead
  );
}

function readSafe(fp) { try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; } }

function parseRole(soul) {
  const m = soul.match(/You are the ([^\n.]+)/i);
  return m ? m[1].trim() : '';
}

function parseCompany(wsDir) {
  const PATTERNS = [
    /\bCEO of ([A-Z][a-zA-Z0-9]{3,})/,
    /\bCEO\s*[-–]\s*([A-Z][a-zA-Z0-9]{3,})/,
    /^#\s+([A-Z][a-zA-Z0-9]{3,})\s+(?:Weekly|Board|Status)/m,
    /[Cc]ompany \(([A-Z][a-zA-Z0-9]{3,})\)/,
  ];
  const allFiles = [
    ...fs.readdirSync(wsDir).filter(f => f.endsWith('.md')).map(f => path.join(wsDir, f)),
    ...((() => { const d = path.join(wsDir,'agents','ceo','memory'); return fs.existsSync(d) ? fs.readdirSync(d).filter(f=>f.endsWith('.md')).map(f=>path.join(d,f)) : []; })()),
  ];
  for (const fp of allFiles) {
    const c = readSafe(fp);
    for (const pat of PATTERNS) {
      const m = c.match(pat);
      if (m) return m[1].trim();
    }
  }
  return '';
}

function pathToProjectKey(p) { return p.replace(/[^a-zA-Z0-9]/g, '-'); }

function parseSessionUsage(filePath) {
  const byDate = {};
  let lines;
  try { lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean); }
  catch { return byDate; }

  for (const raw of lines) {
    let e; try { e = JSON.parse(raw); } catch { continue; }
    if (e.type !== 'assistant' || !e.message?.usage) continue;
    const date    = (e.timestamp || new Date().toISOString()).slice(0, 10);
    const modelId = e.message.model || 'claude-sonnet-4-6';
    const usage   = e.message.usage;
    const tokens  = (usage.input_tokens||0) + (usage.cache_creation_input_tokens||0) +
                    (usage.cache_read_input_tokens||0) + (usage.output_tokens||0);
    if (!byDate[date]) byDate[date] = { tokens: 0, cost: 0, model: modelId };
    byDate[date].tokens += tokens;
    byDate[date].cost   += computeCost(usage, modelId);
  }
  return byDate;
}

router.post('/', async (req, res) => {
  if (!fs.existsSync(PAPERCLIP_WORKSPACES)) {
    return res.json({ ok: true, agents: 0, usageLogs: 0, message: 'No Paperclip workspaces found' });
  }

  const workspaceIds = fs.readdirSync(PAPERCLIP_WORKSPACES)
    .filter(f => fs.statSync(path.join(PAPERCLIP_WORKSPACES, f)).isDirectory());

  let agentCount = 0, logCount = 0;
  let colorIdx = 0;

  for (const wsId of workspaceIds) {
    const wsPath    = path.join(PAPERCLIP_WORKSPACES, wsId);
    const agentsDir = path.join(wsPath, 'agents');
    if (!fs.existsSync(agentsDir)) continue;

    const company   = parseCompany(wsPath);
    const agentDirs = fs.readdirSync(agentsDir)
      .filter(f => fs.statSync(path.join(agentsDir, f)).isDirectory());

    // Session JSONL for this workspace
    const projectKey   = pathToProjectKey(wsPath);
    const projectDir   = path.join(CLAUDE_PROJECTS, projectKey);
    const sessionFiles = fs.existsSync(projectDir)
      ? fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl')).map(f => path.join(projectDir, f))
      : [];

    // Aggregate usage across all sessions for this workspace
    const wsUsage = {};
    for (const sf of sessionFiles) {
      const byDate = parseSessionUsage(sf);
      for (const [date, data] of Object.entries(byDate)) {
        if (!wsUsage[date]) wsUsage[date] = { tokens: 0, cost: 0, model: data.model };
        wsUsage[date].tokens += data.tokens;
        wsUsage[date].cost   += data.cost;
      }
    }

    for (const agentSlug of agentDirs) {
      const agentHome    = path.join(agentsDir, agentSlug);
      const soul         = readSafe(path.join(agentHome, 'SOUL.md'));
      const roleFromSoul = parseRole(soul);
      const agentName    = roleFromSoul
        ? `${company ? company + ' — ' : ''}${roleFromSoul}`
        : `${company ? company + ' — ' : ''}${agentSlug}`;
      const role         = roleFromSoul || agentSlug;
      const initials     = role.split(/[\s_-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const color        = COLORS[colorIdx % COLORS.length];

      // Count completed memory tasks
      let tasksTotal = 0;
      const memDir = path.join(agentHome, 'memory');
      if (fs.existsSync(memDir)) {
        fs.readdirSync(memDir).filter(f => f.endsWith('.md')).forEach(mf => {
          const c = readSafe(path.join(memDir, mf));
          tasksTotal += (c.match(/- \[x\]/gi) || []).length;
        });
      }

      const agent = await Agent.findOneAndUpdate(
        { name: agentName },
        { $setOnInsert: { name: agentName, initials, color, role }, $set: { tasksTotal } },
        { upsert: true, new: true }
      );
      agentCount++;
      colorIdx++;

      // Per-agent usage = total workspace usage / number of agents (simple split)
      const splitFactor = agentDirs.length || 1;

      for (const [dateStr, data] of Object.entries(wsUsage)) {
        const date = new Date(dateStr + 'T00:00:00.000Z');
        const existing = await UsageLog.findOne({
          agentName,
          date: { $gte: date, $lt: new Date(date.getTime() + 86400000) },
        });
        const tokens = Math.round(data.tokens / splitFactor);
        const cost   = data.cost / splitFactor;

        if (existing) {
          existing.tokens = tokens;
          existing.cost   = cost;
          await existing.save();
        } else {
          await UsageLog.create({
            date, agent: agent._id, agentName, agentColor: color,
            model: data.model, tokens, cost, tasks: 0,
          });
        }
        logCount++;
      }

      // Update costToday on agent
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayLog = await UsageLog.findOne({ agentName, date: { $gte: today } });
      if (todayLog) await Agent.findByIdAndUpdate(agent._id, { costToday: todayLog.cost });
    }
  }

  res.json({ ok: true, agents: agentCount, usageLogs: logCount });
});

module.exports = router;
