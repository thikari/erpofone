const { Schema, model } = require('mongoose');

const IngestTokenSchema = new Schema({
  name:     { type: String, required: true },   // e.g. "OpenClaw local"
  token:    { type: String, required: true, unique: true },
  lastUsed: { type: Date, default: null },
}, { timestamps: true });

module.exports = model('IngestToken', IngestTokenSchema);
