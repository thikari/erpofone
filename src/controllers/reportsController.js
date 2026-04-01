const Report = require('../models/Report');
const Agent  = require('../models/Agent');

exports.index = async (req, res) => {
  const [reports, agents] = await Promise.all([
    Report.find().sort({ date: -1 }).limit(60),
    Agent.find({}, 'name initials color'),
  ]);

  // Group by date string YYYY-MM-DD
  const grouped = {};
  reports.forEach(r => {
    const key = new Date(r.date).toISOString().slice(0, 10);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  // Build sorted array of { dateKey, reports }
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(dateKey => ({
    dateKey,
    reports: grouped[dateKey],
  }));

  res.render('pages/reports', { pageTitle: 'Reports', dates, agents });
};
