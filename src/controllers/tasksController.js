const Task  = require('../models/Task');
const Agent = require('../models/Agent');

exports.index = async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const [tasks, agents] = await Promise.all([
    Task.find(filter).populate('agent', 'name initials color').sort({ createdAt: -1 }),
    Agent.find({}, 'name initials color'),
  ]);
  const counts = {
    running: tasks.filter(t => t.status === 'running').length,
    queued:  tasks.filter(t => t.status === 'queued').length,
    done:    tasks.filter(t => t.status === 'done').length,
    failed:  tasks.filter(t => t.status === 'failed').length,
  };
  res.render('pages/tasks', { pageTitle: 'Tasks', tasks, agents, counts, activeFilter: status || 'all' });
};

exports.create = async (req, res) => {
  const { title, agentId, scheduledAt } = req.body;
  const agent = agentId ? await Agent.findById(agentId) : null;
  const task  = await Task.create({
    title,
    agent:     agent?._id || null,
    agentName: agent?.name || '',
    status:    scheduledAt ? 'queued' : 'queued',
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  });
  if (req.headers.accept?.includes('application/json')) return res.json({ ok: true, task });
  res.redirect('/tasks');
};

exports.update = async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ ok: true, task });
};

exports.destroy = async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};
