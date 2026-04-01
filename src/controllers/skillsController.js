const Skill = require('../models/Skill');

exports.index = async (req, res) => {
  const skills = await Skill.find().sort({ category: 1, name: 1 });
  const grouped = {};
  skills.forEach(s => { (grouped[s.category] = grouped[s.category] || []).push(s); });
  res.render('pages/skills', { pageTitle: 'Skills', skills, grouped });
};

exports.create = async (req, res) => {
  const { name, description, icon, category } = req.body;
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const skill = await Skill.create({ slug, name, description, icon: icon || '⚡', category });
  res.json({ ok: true, skill });
};

exports.destroy = async (req, res) => {
  await Skill.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};
