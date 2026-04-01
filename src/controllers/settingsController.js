const ApiKey      = require('../models/ApiKey');
const Tool        = require('../models/Tool');
const IngestToken = require('../models/IngestToken');
const crypto      = require('crypto');

/* ── Page ── */
exports.index = async (req, res) => {
  const [apiKeys, tools, ingestTokens] = await Promise.all([
    ApiKey.find().sort({ addedAt: -1 }),
    Tool.find().sort({ category: 1, name: 1 }),
    IngestToken.find().sort({ createdAt: -1 }),
  ]);

  const grouped = {};
  tools.forEach(t => { (grouped[t.category] = grouped[t.category] || []).push(t); });

  // Mask keys for display
  const maskedKeys = apiKeys.map(k => ({
    ...k.toObject(),
    masked: k.key.length > 8
      ? k.key.slice(0, 4) + '••••••••' + k.key.slice(-4)
      : '••••••••••••',
  }));

  res.render('pages/settings', { pageTitle: 'Settings', apiKeys: maskedKeys, tools, grouped, ingestTokens });
};

/* ── API Keys ── */
exports.createKey = async (req, res) => {
  const { name, provider, key } = req.body;
  const apiKey = await ApiKey.create({ name, provider, key });
  res.json({ ok: true, apiKey: { ...apiKey.toObject(), masked: key.slice(0,4) + '••••••••' + key.slice(-4) } });
};

exports.deleteKey = async (req, res) => {
  await ApiKey.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};

/* ── Ingest Tokens ── */
exports.createToken = async (req, res) => {
  const { name } = req.body;
  const token = crypto.randomBytes(32).toString('hex');
  const doc   = await IngestToken.create({ name, token });
  res.json({ ok: true, token: doc.token, id: doc._id, name: doc.name });
};

exports.deleteToken = async (req, res) => {
  await IngestToken.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};

/* ── Tools ── */
exports.toggleTool = async (req, res) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) return res.status(404).json({ ok: false });
  tool.enabled = !tool.enabled;
  await tool.save();
  res.json({ ok: true, enabled: tool.enabled });
};

exports.updateTool = async (req, res) => {
  const { webhookUrl } = req.body;
  const tool = await Tool.findByIdAndUpdate(req.params.id, { webhookUrl }, { new: true });
  res.json({ ok: true, tool });
};
