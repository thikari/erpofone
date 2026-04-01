const { Schema, model } = require('mongoose');

const ApiKeySchema = new Schema({
  name:     { type: String, required: true },       // "Anthropic", "OpenAI"
  provider: { type: String, required: true },       // "anthropic", "openai", etc.
  key:      { type: String, required: true },       // stored value
  addedAt:  { type: Date,   default: Date.now },
});

module.exports = model('ApiKey', ApiKeySchema);
