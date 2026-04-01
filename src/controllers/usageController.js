const UsageLog = require('../models/UsageLog');

exports.index = async (req, res) => {
  const { period = 'week' } = req.query;
  const data = await buildUsageData(period);
  res.render('pages/usage', { pageTitle: 'Usage & Costs', period, ...data });
};

exports.apiData = async (req, res) => {
  const { period = 'week' } = req.query;
  const data = await buildUsageData(period);
  res.json({ ok: true, ...data });
};

async function buildUsageData(period) {
  const { start, end, labels } = dateRange(period);

  const logs = await UsageLog.find({ date: { $gte: start, $lte: end } });

  // Aggregate totals
  const totals = logs.reduce((acc, l) => {
    acc.cost   += l.cost;
    acc.tokens += l.tokens;
    acc.tasks  += l.tasks;
    return acc;
  }, { cost: 0, tokens: 0, tasks: 0 });

  // Chart data — cost per label bucket
  const chartData = labels.map(({ key }) => {
    const bucket = logs.filter(l => matchesBucket(l.date, key, period));
    return +bucket.reduce((s, l) => s + l.cost, 0).toFixed(2);
  });

  // By agent
  const agentMap = {};
  logs.forEach(l => {
    if (!l.agentName) return;
    if (!agentMap[l.agentName]) agentMap[l.agentName] = { name: l.agentName, color: l.agentColor, cost: 0, tokens: 0, tasks: 0 };
    agentMap[l.agentName].cost   += l.cost;
    agentMap[l.agentName].tokens += l.tokens;
    agentMap[l.agentName].tasks  += l.tasks;
  });
  const byAgent = Object.values(agentMap).sort((a, b) => b.cost - a.cost).map(a => ({
    ...a,
    costFmt:   '€' + a.cost.toFixed(2),
    tokensFmt: formatTokens(a.tokens),
    pct:       totals.cost > 0 ? +((a.cost / totals.cost) * 100).toFixed(1) : 0,
  }));

  // By model
  const modelMap = {};
  logs.forEach(l => {
    if (!modelMap[l.model]) modelMap[l.model] = { model: l.model, cost: 0, tokens: 0 };
    modelMap[l.model].cost   += l.cost;
    modelMap[l.model].tokens += l.tokens;
  });
  const byModel = Object.values(modelMap).sort((a, b) => b.cost - a.cost).map(m => ({
    ...m,
    costFmt:   '€' + m.cost.toFixed(2),
    tokensFmt: formatTokens(m.tokens),
    pct:       totals.cost > 0 ? +((m.cost / totals.cost) * 100).toFixed(1) : 0,
  }));

  return {
    totals: {
      cost:   '€' + totals.cost.toFixed(2),
      tokens: formatTokens(totals.tokens),
      tasks:  totals.tasks.toLocaleString(),
    },
    chartLabels: labels.map(l => l.label),
    chartData,
    byAgent,
    byModel,
    periodLabel: periodLabel(period, start, end),
  };
}

function dateRange(period) {
  const now   = new Date();
  const start = new Date(now);
  const end   = new Date(now);
  let labels  = [];

  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    for (let h = 0; h < 24; h += 3) {
      labels.push({ key: h, label: h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm` });
    }
  } else if (period === 'week') {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      labels.push({ key: d.toISOString().slice(0, 10), label: days[d.getDay()] + ' ' + (d.getMonth()+1) + '/' + d.getDate() });
    }
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      labels.push({ key: String(d), label: String(d) });
    }
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let m = 0; m < 12; m++) labels.push({ key: m, label: months[m] });
  }

  return { start, end, labels };
}

function matchesBucket(date, key, period) {
  if (period === 'today')  return Math.floor(new Date(date).getHours() / 3) * 3 === key;
  if (period === 'week')   return new Date(date).toISOString().slice(0, 10) === key;
  if (period === 'month')  return String(new Date(date).getDate()) === key;
  return new Date(date).getMonth() === key;
}

function periodLabel(period, start, end) {
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (period === 'today') return 'Today · ' + fmt(new Date());
  if (period === 'week')  return fmt(start) + ' — ' + fmt(end);
  if (period === 'month') return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return new Date().getFullYear().toString();
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return Math.round(n / 1_000) + 'K';
  return String(n);
}
