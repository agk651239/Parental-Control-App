const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy: { type: Number, default: 0 },
  altitude: { type: Number, default: 0 },
  speed: { type: Number, default: 0 },
  bearing: { type: Number, default: 0 },
  address: { type: String, default: '' },
  provider: { type: String, default: 'fused' },
  batteryLevel: { type: Number, default: null },
  isCharging: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

locationSchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model('Location', locationSchema);
