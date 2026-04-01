const { Schema, model } = require('mongoose');

const ActivitySchema = new Schema({
  agent:      { type: Schema.Types.ObjectId, ref: 'Agent' },
  agentName:  { type: String, required: true },
  initials:   { type: String, default: '' },
  color:      { type: String, default: 'teal' },
  action:     { type: String, required: true },
  tokens:     { type: Number, default: 0 },
  cost:       { type: Number, default: 0 },
  // Set by sync — prevents duplicate imports. Null for API-ingested events.
  externalId: { type: String, default: null },
}, { timestamps: true });

ActivitySchema.index({ externalId: 1 }, { unique: true, sparse: true });

module.exports = model('Activity', ActivitySchema);
