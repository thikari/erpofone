const { Schema, model } = require('mongoose');

const SkillSchema = new Schema({
  slug:        { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  icon:        { type: String, default: '⚡' },
  category:    { type: String, enum: ['Data','Comms','Content','Integrations','System'], default: 'System' },
}, { timestamps: true });

module.exports = model('Skill', SkillSchema);
