const { Schema, model } = require('mongoose');

const UsageLogSchema = new Schema({
  date:      { type: Date, required: true },
  agent:     { type: Schema.Types.ObjectId, ref: 'Agent', default: null },
  agentName: { type: String, default: '' },
  agentColor:{ type: String, default: 'teal' },
  model:     { type: String, default: 'claude-sonnet-4-6' },
  tokens:    { type: Number, default: 0 },
  cost:      { type: Number, default: 0 },
  tasks:     { type: Number, default: 0 },
}, { timestamps: true });

module.exports = model('UsageLog', UsageLogSchema);
