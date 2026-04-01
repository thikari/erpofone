const Agent    = require('../models/Agent');
const Skill    = require('../models/Skill');
const UsageLog = require('../models/UsageLog');

exports.index = async (req, res) => {
  const agents = await Agent.find().populate('skills').sort({ createdAt: 1 });
  const skills  = await Skill.find().sort({ category: 1, name: 1 });
  res.render('pages/agents', { pageTitle: 'Agents', agents, skills });
};

exports.show = async (req, res) => {
  const agent  = await Agent.findById(req.params.id).populate('skills');
  if (!agent) return res.status(404).render('pages/error', { pageTitle: 'Not found', code: 404, message: 'Agent not found' });

  const allSkills     = await Skill.find().sort({ category: 1, name: 1 });
  const agentSkillIds = agent.skills.map(s => s._id.toString());

  // Usage for this agent — last 7 days
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0,0,0,0);
  const usageLogs = await UsageLog.find({ agentName: agent.name, date: { $gte: weekAgo } }).sort({ date: 1 });

  const usageTotals = usageLogs.reduce((acc, l) => {
    acc.cost   += l.cost;
    acc.tokens += l.tokens;
    acc.tasks  += l.tasks;
    return acc;
  }, { cost: 0, tokens: 0, tasks: 0 });

  // Model breakdown for this agent
  const modelMap = {};
  usageLogs.forEach(l => {
    if (!modelMap[l.model]) modelMap[l.model] = { model: l.model, cost: 0, tokens: 0 };
    modelMap[l.model].cost   += l.cost;
    modelMap[l.model].tokens += l.tokens;
  });
  const usageByModel = Object.values(modelMap).sort((a, b) => b.cost - a.cost).map(m => ({
    ...m,
    costFmt:   '€' + m.cost.toFixed(2),
    tokensFmt: formatTokens(m.tokens),
    pct: usageTotals.cost > 0 ? +((m.cost / usageTotals.cost) * 100).toFixed(1) : 0,
  }));

  // Chart (last 7 days)
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const chartLabels = [];
  const chartData   = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const key = d.toISOString().slice(0, 10);
    chartLabels.push(days[d.getDay()]);
    const bucket = usageLogs.filter(l => new Date(l.date).toISOString().slice(0,10) === key);
    chartData.push(+bucket.reduce((s, l) => s + l.cost, 0).toFixed(2));
  }

  const grouped = {};
  allSkills.forEach(s => { (grouped[s.category] = grouped[s.category] || []).push(s); });

  res.render('pages/agent-detail', {
    pageTitle: agent.name, agent, allSkills, agentSkillIds, grouped,
    usageTotals: {
      cost:   '€' + usageTotals.cost.toFixed(2),
      tokens: formatTokens(usageTotals.tokens),
      tasks:  usageTotals.tasks,
    },
    usageByModel,
    chartLabels,
    chartData,
  });
};

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return Math.round(n / 1_000) + 'K';
  return String(n);
}

exports.create = async (req, res) => {
  const { name, role, description, color } = req.body;
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const agent = await Agent.create({ name, initials, role, description, color: color || 'teal' });
  if (req.headers.accept?.includes('application/json')) return res.json({ ok: true, agent });
  res.redirect('/agents');
};

exports.update = async (req, res) => {
  const agent = await Agent.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ ok: true, agent });
};

exports.destroy = async (req, res) => {
  await Agent.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};

exports.addSkill = async (req, res) => {
  const { skillId } = req.body;
  const agent = await Agent.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { skills: skillId } },
    { new: true }
  ).populate('skills');
  res.json({ ok: true, skills: agent.skills });
};

exports.removeSkill = async (req, res) => {
  const agent = await Agent.findByIdAndUpdate(
    req.params.id,
    { $pull: { skills: req.params.skillId } },
    { new: true }
  ).populate('skills');
  res.json({ ok: true, skills: agent.skills });
};
