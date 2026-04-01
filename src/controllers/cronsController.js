const CronJob = require('../models/CronJob');
const Agent   = require('../models/Agent');

exports.index = async (req, res) => {
  const [crons, agents] = await Promise.all([
    CronJob.find().populate('agent', 'name initials color').sort({ createdAt: -1 }),
    Agent.find({}, 'name initials color'),
  ]);
  res.render('pages/crons', { pageTitle: 'Crons', crons, agents });
};

exports.create = async (req, res) => {
  const { name, description, schedule, agentId } = req.body;
  const agent = agentId ? await Agent.findById(agentId) : null;
  await CronJob.create({
    name,
    description: description || '',
    schedule,
    agent:     agent?._id || null,
    agentName: agent?.name || '',
  });
  res.redirect('/crons');
};

exports.update = async (req, res) => {
  const { enabled, status, lastRun, lastResult } = req.body;
  const update = {};
  if (enabled    !== undefined) update.enabled    = enabled;
  if (status     !== undefined) update.status     = status;
  if (lastRun    !== undefined) update.lastRun    = lastRun;
  if (lastResult !== undefined) update.lastResult = lastResult;
  const cron = await CronJob.findByIdAndUpdate(req.params.id, update, { new: true });
  res.json({ ok: true, cron });
};

exports.destroy = async (req, res) => {
  await CronJob.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};
