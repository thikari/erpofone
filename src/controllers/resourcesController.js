const Resource = require('../models/Resource');

exports.index = async (req, res) => {
  const [brain, docs] = await Promise.all([
    Resource.find({ type: 'brain' }).sort({ createdAt: -1 }),
    Resource.find({ type: 'docs'  }).sort({ createdAt: -1 }),
  ]);
  res.render('pages/resources', { pageTitle: 'Resources', brain, docs });
};

exports.create = async (req, res) => {
  const { type, title, url } = req.body;
  const { icon, badge } = inferMeta(url);
  const resource = await Resource.create({ type, title, url, icon, badge, syncedAt: new Date() });
  res.json({ ok: true, resource });
};

exports.destroy = async (req, res) => {
  await Resource.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};

function inferMeta(url) {
  if (url.includes('notion'))              return { icon: '📝', badge: 'Notion' };
  if (url.includes('github'))              return { icon: '⚙️', badge: 'GitHub' };
  if (url.includes('drive.google'))        return { icon: '📁', badge: 'Drive' };
  if (url.includes('docs.google'))         return { icon: '📄', badge: 'GDocs' };
  if (url.includes('figma'))               return { icon: '🎨', badge: 'Figma' };
  if (url.includes('linear') || url.includes('jira')) return { icon: '📋', badge: 'Issues' };
  return { icon: '🔗', badge: 'Link' };
}
