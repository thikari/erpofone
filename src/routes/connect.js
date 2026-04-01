const router       = require('express').Router();
const crypto       = require('crypto');
const Agent        = require('../models/Agent');
const IngestToken  = require('../models/IngestToken');

const COLORS = ['teal', 'amber', 'purple', 'green', 'gray'];

// GET /connect  — show the connect page
router.get('/', (req, res) => {
  res.render('pages/connect', { pageTitle: 'Connect an agent', token: null, agent: null, error: null });
});

// POST /connect  — create agent + token, return the CLAUDE.md snippet
router.post('/', async (req, res) => {
  const { name, role = 'Agent', color = 'teal', model = 'claude-sonnet-4-6' } = req.body;
  if (!name || !name.trim()) {
    return res.render('pages/connect', { pageTitle: 'Connect an agent', token: null, agent: null, error: 'Agent name is required.' });
  }

  const initials = name.trim().split(/[\s\-—]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const agent = await Agent.findOneAndUpdate(
    { name: name.trim() },
    { $setOnInsert: { name: name.trim(), initials, role: role.trim(), color } },
    { upsert: true, new: true }
  );

  // One token per agent — reuse if one already exists
  let tokenDoc = await IngestToken.findOne({ name: `${name.trim()} (auto)` });
  if (!tokenDoc) {
    tokenDoc = await IngestToken.create({ name: `${name.trim()} (auto)`, token: crypto.randomBytes(32).toString('hex') });
  }

  const hqUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  const isClaudeCode = !model || model.startsWith('claude');
  res.render('pages/connect', { pageTitle: 'Connect an agent', agent, token: tokenDoc.token, hqUrl, model, isClaudeCode, error: null });
});

// GET /connect/claude-md?name=X&token=Y  — download the CLAUDE.md file directly
router.get('/claude-md', (req, res) => {
  const { name, token } = req.query;
  const hqUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  if (!name || !token) return res.status(400).send('Missing name or token');

  const content = buildClaudeMd(name, token, hqUrl);
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="CLAUDE.md"`);
  res.send(content);
});

// GET /connect/system-prompt?name=X&token=Y — download universal system prompt
router.get('/system-prompt', (req, res) => {
  const { name, token } = req.query;
  const hqUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
  if (!name || !token) return res.status(400).send('Missing name or token');

  const content = buildSystemPrompt(name, token, hqUrl);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="erpofone-system-prompt.txt"`);
  res.send(content);
});

function buildSystemPrompt(agentName, token, hqUrl) {
  return `## Dashboard connection — ErpofOne

You are connected to the ErpofOne agent dashboard at ${hqUrl}.
Your agent name is: ${agentName}

After each significant action, report it to the dashboard using a tool call or shell command:

  curl -s -X POST ${hqUrl}/api/ingest/activity \\
    -H "Authorization: Bearer ${token}" \\
    -H "Content-Type: application/json" \\
    -d '{"agentName":"${agentName}","action":"<one sentence describing what you just did>"}'

When you start a task:

  curl -s -X POST ${hqUrl}/api/ingest/task \\
    -H "Authorization: Bearer ${token}" \\
    -H "Content-Type: application/json" \\
    -d '{"agentName":"${agentName}","title":"<task title>","status":"running"}'
  # → save the returned taskId

When a task is done:

  curl -s -X PATCH ${hqUrl}/api/ingest/task/<taskId> \\
    -H "Authorization: Bearer ${token}" \\
    -H "Content-Type: application/json" \\
    -d '{"status":"done","result":"<one line outcome>"}'

Rules:
- Report continuously as you work, not just at the end.
- Keep action descriptions concise: "wrote report.md", "scraped 24 listings", "sent 5 emails".
- Never include the token or secrets in action descriptions.
`;
}

function buildClaudeMd(agentName, token, hqUrl) {
  return `# Agent Dashboard Connection

You are connected to the erpofone dashboard at ${hqUrl}.

## Reporting instructions

After every significant action, report what you did by running this command:

\`\`\`bash
curl -s -X POST ${hqUrl}/api/ingest/activity \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"agentName":"${agentName}","action":"<describe what you just did in one line>"}'
\`\`\`

When you start a task, register it:

\`\`\`bash
curl -s -X POST ${hqUrl}/api/ingest/task \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"agentName":"${agentName}","title":"<task title>","status":"running"}'
\`\`\`

When a task is done, mark it complete (use the taskId returned above):

\`\`\`bash
curl -s -X PATCH ${hqUrl}/api/ingest/task/<taskId> \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"done","result":"<one line summary of outcome>"}'
\`\`\`

## Rules

- Always report actions to the dashboard as you work — not just at the end.
- Keep action descriptions concise (one sentence, present tense): "wrote 3 blog posts", "scraped 48 newsletters", "sent outreach to 12 sponsors".
- Never include secrets or tokens in the action description field.
- Your agent name for all calls is: **${agentName}**
- Your ingest token is stored here — do not log it or expose it in output.
`;
}

module.exports = router;
