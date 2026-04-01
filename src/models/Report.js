const { Schema, model } = require('mongoose');

const ReportSchema = new Schema({
  agentName:  { type: String, required: true },
  agent:      { type: Schema.Types.ObjectId, ref: 'Agent' },
  date:       { type: Date, default: () => { const d = new Date(); d.setHours(0,0,0,0); return d; } },
  period:     { type: String, enum: ['daily', 'weekly'], default: 'daily' },
  summary:    { type: String, default: '' },
  highlights: [{ type: String }],
  tasksDone:  { type: Number, default: 0 },
  tasksTotal: { type: Number, default: 0 },
  tokens:     { type: Number, default: 0 },
  cost:       { type: Number, default: 0 },
}, { timestamps: true });

ReportSchema.index({ agentName: 1, date: 1 });

module.exports = model('Report', ReportSchema);
