const { Schema, model } = require('mongoose');

const AgentSchema = new Schema({
  name:        { type: String, required: true },
  initials:    { type: String, required: true, maxlength: 2 },
  role:        { type: String, required: true },
  description: { type: String, default: '' },
  color:       { type: String, enum: ['teal','amber','purple','green','gray'], default: 'teal' },
  model:       { type: String, default: 'claude-sonnet-4-6' },
  status:      { type: String, enum: ['running','idle','queued','offline'], default: 'idle' },
  currentTask: { type: String, default: '' },
  skills:      [{ type: Schema.Types.ObjectId, ref: 'Skill' }],
  tasksTotal:  { type: Number, default: 0 },
  successRate: { type: Number, default: 100, min: 0, max: 100 },
  costToday:   { type: Number, default: 0 },
  workDir:      { type: String, default: '' },
  startCommand: { type: String, default: '' },
  logPaths:     [{ type: String }],
  envVars:      { type: String, default: '' },
  pid:          { type: Number, default: null },
}, { timestamps: true });

module.exports = model('Agent', AgentSchema);
