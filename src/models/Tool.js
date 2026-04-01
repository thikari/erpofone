const { Schema, model } = require('mongoose');

const ToolSchema = new Schema({
  name:        { type: String, required: true },
  slug:        { type: String, required: true, unique: true },
  icon:        { type: String, default: '🔧' },
  category:    { type: String, default: 'Other' },
  description: { type: String, default: '' },
  enabled:     { type: Boolean, default: false },
  webhookUrl:  { type: String, default: '' },
  apiKeyRef:   { type: String, default: '' },  // which provider's API key this uses
}, { timestamps: true });

module.exports = model('Tool', ToolSchema);
