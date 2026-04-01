/**
 * ErpofOne — Seed Script
 * Run: npm run seed
 *
 * Seeds infrastructure data only (skills, tools, resources).
 * Does NOT touch agents, tasks, activity, or usage logs —
 * those come from real data via `npm run sync`.
 */

require('dotenv').config();
const mongoose  = require('mongoose');
const Skill     = require('../src/models/Skill');
const Resource  = require('../src/models/Resource');
const Tool      = require('../src/models/Tool');

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/erpofone';

async function seed() {
  console.log('\n🌱  Seeding ErpofOne…');
  await mongoose.connect(URI);

  // ── Wipe infrastructure only (not agents/tasks/activity/usage) ──
  await Promise.all([
    Skill.deleteMany({}), Resource.deleteMany({}),
    Tool.deleteMany({}),
  ]);
  console.log('   ✓ Infrastructure collections cleared (agents/tasks/activity preserved)');

  // ── Skills ──
  const skills = await Skill.insertMany([
    { slug: 'web-scraper',    name: 'Web Scraper',     description: 'Scrape and parse web pages',              icon: '🌐', category: 'Data' },
    { slug: 'data-extractor', name: 'Data Extractor',  description: 'Extract structured data from sources',    icon: '📊', category: 'Data' },
    { slug: 'email-drafter',  name: 'Email Drafter',   description: 'Draft personalised outreach emails',      icon: '✉️', category: 'Comms' },
    { slug: 'slack-sender',   name: 'Slack Sender',    description: 'Send messages and alerts to Slack',       icon: '💬', category: 'Comms' },
    { slug: 'notion-reader',  name: 'Notion Reader',   description: 'Read pages and databases from Notion',    icon: '📝', category: 'Integrations' },
    { slug: 'notion-writer',  name: 'Notion Writer',   description: 'Write and update Notion pages',           icon: '📝', category: 'Integrations' },
    { slug: 'drive-upload',   name: 'Drive Upload',    description: 'Upload and organise files in Google Drive', icon: '📁', category: 'Integrations' },
    { slug: 'github-push',    name: 'GitHub Push',     description: 'Commit and push code to GitHub repos',    icon: '⚙️', category: 'Integrations' },
    { slug: 'stripe-reader',  name: 'Stripe Reader',   description: 'Read revenue and subscription data',      icon: '💳', category: 'Integrations' },
    { slug: 'content-writer', name: 'Content Writer',  description: 'Write SEO-friendly editorial content',    icon: '✍️', category: 'Content' },
    { slug: 'seo-optimizer',  name: 'SEO Optimizer',   description: 'Optimise content and metadata for search', icon: '🔍', category: 'Content' },
    { slug: 'scheduler',      name: 'Task Scheduler',  description: 'Schedule, queue, and chain tasks',        icon: '⏰', category: 'System' },
  ]);
  console.log(`   ✓ ${skills.length} skills`);

  // ── Resources ──
  const resources = await Resource.insertMany([
    { type: 'brain', title: 'Company wiki',           url: 'https://notion.so/company-wiki',        icon: '🧠', badge: 'Notion' },
    { type: 'brain', title: 'Agent prompts & SOPs',   url: 'https://notion.so/agent-prompts',       icon: '🤖', badge: 'Notion' },
    { type: 'brain', title: 'Q2 goals & OKRs',        url: 'https://notion.so/q2-goals',            icon: '🎯', badge: 'Notion' },
    { type: 'brain', title: 'Sponsorgap product spec', url: 'https://notion.so/sponsorgap-spec',    icon: '💡', badge: 'Notion' },
    { type: 'docs',  title: 'Q1 sponsor report',      url: 'https://drive.google.com/q1-report',    icon: '📊', badge: 'Drive' },
    { type: 'docs',  title: 'Agent output archive',   url: 'https://drive.google.com/agent-outputs', icon: '📁', badge: 'Drive' },
    { type: 'docs',  title: 'Sponsorgap repo',        url: 'https://github.com/toomaime/sponsorgap', icon: '⚙️', badge: 'GitHub' },
    { type: 'docs',  title: 'Paperclip config',       url: 'https://github.com/toomaime/paperclip', icon: '⚙️', badge: 'GitHub' },
  ]);
  console.log(`   ✓ ${resources.length} resources`);

  // ── Tools ──
  await Tool.insertMany([
    // AI
    { name: 'Claude (Anthropic)', slug: 'anthropic',   icon: '🟣', category: 'AI',            description: 'Run Claude models for reasoning, writing, and code generation.',              enabled: true,  apiKeyRef: 'anthropic' },
    { name: 'OpenAI',             slug: 'openai',       icon: '⚪', category: 'AI',            description: 'Access GPT-4 and other OpenAI models as a fallback or comparison layer.',    enabled: false, apiKeyRef: 'openai' },
    // Communication
    { name: 'Slack',              slug: 'slack',        icon: '💬', category: 'Communication', description: 'Send messages, alerts, and daily digest reports to Slack channels.',         enabled: true,  webhookUrl: '' },
    { name: 'Gmail',              slug: 'gmail',        icon: '📧', category: 'Communication', description: 'Send and read emails via Gmail. Used for outreach sequences.',               enabled: false, apiKeyRef: 'google' },
    // Storage & Knowledge
    { name: 'Notion',             slug: 'notion',       icon: '📝', category: 'Storage',       description: 'Read and write Notion pages, databases, and agent SOPs.',                    enabled: true,  apiKeyRef: 'notion' },
    { name: 'Google Drive',       slug: 'google-drive', icon: '📁', category: 'Storage',       description: 'Upload reports, archives, and agent output files to Drive.',                 enabled: true,  apiKeyRef: 'google' },
    // Dev
    { name: 'GitHub',             slug: 'github',       icon: '⚙️', category: 'Dev',           description: 'Commit and push code. Used by agents to deploy and version outputs.',        enabled: false, apiKeyRef: 'github' },
    // Finance
    { name: 'Stripe',             slug: 'stripe',       icon: '💳', category: 'Finance',       description: 'Read MRR, subscriptions, and revenue data from Stripe.',                    enabled: true,  apiKeyRef: 'stripe' },
    { name: 'Beehiiv',            slug: 'beehiiv',      icon: '🐝', category: 'Finance',       description: 'Sync newsletter subscriber counts and sponsorship data from Beehiiv.',       enabled: false, apiKeyRef: 'beehiiv' },
    // Automation
    { name: 'Webhook',            slug: 'webhook',      icon: '🔗', category: 'Automation',    description: 'Send structured JSON payloads to any custom endpoint.',                      enabled: false, webhookUrl: '' },
    { name: 'Zapier',             slug: 'zapier',       icon: '⚡', category: 'Automation',    description: 'Trigger Zapier zaps from agent task completions via webhook.',               enabled: false, webhookUrl: '' },
  ]);
  console.log('   ✓ tools');

  console.log('✅  Seed complete! Run: npm run dev\n');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
