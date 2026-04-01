const Agent    = require('../models/Agent');
const Task     = require('../models/Task');
const Activity = require('../models/Activity');
const UsageLog = require('../models/UsageLog');

exports.index = async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [agents, recentActivity, activeTasks, usageToday] = await Promise.all([
    Agent.find().sort({ createdAt: 1 }).limit(5),
    Activity.find().sort({ createdAt: -1 }).limit(6),
    Task.find({ status: { $in: ['running', 'queued'] } }).sort({ createdAt: -1 }),
    UsageLog.aggregate([
      { $match: { date: { $gte: today } } },
      { $group: { _id: null, cost: { $sum: '$cost' }, tokens: { $sum: '$tokens' }, tasks: { $sum: '$tasks' } } },
    ]),
  ]);

  const runningCount = agents.filter(a => a.status === 'running').length;
  const todayCost    = usageToday[0]?.cost || 0;
  const todayTokens  = usageToday[0]?.tokens || 0;
  const todayTasks   = usageToday[0]?.tasks || 0;

  res.render('pages/dashboard', {
    pageTitle: 'Dashboard',
    agents,
    recentActivity,
    activeTasks,
    runningCount,
    todayCost:   todayCost.toFixed(2),
    todayTokens: formatTokens(todayTokens),
    todayTasks,
  });
};

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}
