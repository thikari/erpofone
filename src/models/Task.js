const { Schema, model } = require('mongoose');

const TaskSchema = new Schema({
  title:       { type: String, required: true },
  agent:       { type: Schema.Types.ObjectId, ref: 'Agent' },
  agentName:   { type: String, default: '' },
  status:      { type: String, enum: ['running','queued','done','failed'], default: 'queued' },
  progress:    { type: Number, default: 0, min: 0, max: 100 },
  tokens:      { type: Number, default: 0 },
  cost:        { type: Number, default: 0 },
  scheduledAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  result:      { type: String, default: '' },
}, { timestamps: true });

module.exports = model('Task', TaskSchema);
