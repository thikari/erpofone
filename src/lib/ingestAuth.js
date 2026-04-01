const IngestToken = require('../models/IngestToken');

module.exports = async function ingestAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ ok: false, error: 'Missing Bearer token' });

  const doc = await IngestToken.findOne({ token });
  if (!doc)  return res.status(401).json({ ok: false, error: 'Invalid token' });

  doc.lastUsed = new Date();
  await doc.save();

  req.ingestToken = doc;
  next();
};
