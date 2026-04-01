const { Schema, model } = require('mongoose');

const CronJobSchema = new Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  schedule:    { type: String, required: true },
  agentName:   { type: String, default: '' },
  agent:       { type: Schema.Types.ObjectId, ref: 'Agent' },
  status:      { type: String, enum: ['active', 'paused', 'error'], default: 'active' },
  enabled:     { type: Boolean, default: true },
  lastRun:     { type: Date, default: null },
  lastResult:  { type: String, default: '' },
  runCount:    { type: Number, default: 0 },
}, { timestamps: true });

module.exports = model('CronJob', CronJobSchema);
