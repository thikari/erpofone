#!/usr/bin/env node
/**
 * add-agent.js  — register any OpenClaw or Hermes agent in erpofone
 *
 * Usage:
 *   node scripts/add-agent.js "Hermes" "Outreach"
 *   node scripts/add-agent.js "Hermes" "Outreach" amber
 *   node scripts/add-agent.js "BiotechRoles — Engineer" "Engineering" purple
 *
 * Outputs the exact Claude Code hook config and curl one-liner to wire up the agent.
 */

require('dotenv').config();
const mongoose    = require('mongoose');
const crypto      = require('crypto');
const Agent       = require('../src/models/Agent');
const IngestToken = require('../src/models/IngestToken');

const COLORS = ['teal', 'amber', 'purple', 'green', 'gray'];

async function main() {
  const [,, name, role = 'Agent', color = 'teal'] = process.argv;

  if (!name) {
    console.error('Usage: node scripts/add-agent.js "Agent Name" "Role" [teal|amber|purple|green|gray]');
    process.exit(1);
  }
  if (!COLORS.includes(color)) {
    console.error(`Color must be one of: ${COLORS.join(', ')}`);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/erpofone';
  await mongoose.connect(uri);

  // Create or update agent
  const initials = name.split(/[\s\-—]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const agent = await Agent.findOneAndUpdate(
    { name },
    { $setOnInsert: { name, initials, role, color } },
    { upsert: true, new: true }
  );

  // Create a dedicated ingest token for this agent
  const token    = crypto.randomBytes(32).toString('hex');
  const tokenDoc = await IngestToken.create({ name: `${name} (auto)`, token });

  await mongoose.disconnect();

  const hqUrl   = process.env.PUBLIC_URL || 'http://localhost:3000';
  const hookCmd = `curl -s -X POST ${hqUrl}/api/ingest/activity -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"agentName":"${name}","action":"Session ended"}'`;

  console.log(`
✓ Agent created   ${name}  (${role})
✓ Ingest token    ${token}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPTION A — Claude Code hook  (any project)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add to ~/.claude/settings.json  (global, fires for every session):

  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST ${hqUrl}/api/ingest/activity -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{\\\"agentName\\\":\\\"${name}\\\",\\\"action\\\":\\\"Session ended\\\"}'"
      }]
    }]
  }

Or just for a specific project, add the same block to
.claude/settings.json inside that project directory.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPTION B — call from agent directly
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The agent can call this at any point to log an action:

  ${hookCmd}

Log a task completion:
  curl -s -X POST ${hqUrl}/api/ingest/task \\
    -H "Authorization: Bearer ${token}" \\
    -H "Content-Type: application/json" \\
    -d '{"title":"Task title here","agentName":"${name}","status":"done"}'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPTION C — shell env var (simplest)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Export these in the shell where you run the agent:

  export ERPOFONE_URL="${hqUrl}"
  export ERPOFONE_TOKEN="${token}"
  export ERPOFONE_AGENT="${name}"

Then call scripts/report.sh from anywhere:
  /path/to/erpofone/scripts/report.sh "${name}" "did something"
`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
