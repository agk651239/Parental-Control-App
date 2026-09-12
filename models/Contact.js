const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  numbers: [{ type: String }],
  emails: [{ type: String }],
  isSelected: { type: Boolean, default: false, index: true },
  isWhitelisted: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  tags: [{ type: String }],
  notes: { type: String, default: '' },
  avatarUrl: { type: String, default: null }
}, { timestamps: true });

contactSchema.index({ deviceId: 1, name: 1 });

module.exports = mongoose.model('Contact', contactSchema);
