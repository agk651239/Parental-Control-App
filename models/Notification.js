const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  packageName: { type: String, required: true },
  appName: { type: String, default: '' },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  bigText: { type: String, default: '' },
  category: { type: String, default: '' },
  subText: { type: String, default: '' },
  contactName: { type: String, default: '' },
  contactNumber: { type: String, default: '' },
  isOngoing: { type: Boolean, default: false },
  isClearable: { type: Boolean, default: true },
  postedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

notificationSchema.index({ deviceId: 1, postedAt: -1 });
notificationSchema.index({ deviceId: 1, packageName: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
