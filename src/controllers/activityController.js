const Activity = require('../models/Activity');

exports.index = async (req, res) => {
  const { agent, limit = 100 } = req.query;
  const filter = agent ? { agentName: new RegExp(agent, 'i') } : {};
  const events = await Activity.find(filter).sort({ createdAt: -1 }).limit(Number(limit));

  // Distinct agent names for filter tabs
  const agentNames = await Activity.distinct('agentName');

  res.render('pages/activity', { pageTitle: 'Activity', events, agentNames, activeAgent: agent || '' });
};
