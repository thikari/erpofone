const { Schema, model } = require('mongoose');

const ResourceSchema = new Schema({
  type:   { type: String, enum: ['brain','docs'], required: true },
  title:  { type: String, required: true },
  url:    { type: String, required: true },
  icon:   { type: String, default: '🔗' },
  badge:  { type: String, default: 'Link' },
  syncedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = model('Resource', ResourceSchema);
