const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  radius: { type: Number, default: 200 },
  alertOnEnter: { type: Boolean, default: true },
  alertOnExit: { type: Boolean, default: true },
  activeHours: {
    start: { type: String, default: '00:00' },
    end: { type: String, default: '23:59' }
  },
  activeDays: [{ type: Number, min: 0, max: 6 }],
  isActive: { type: Boolean, default: true },
  isInside: { type: Boolean, default: false },
  lastEnteredAt: { type: Date, default: null },
  lastExitedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Geofence', geofenceSchema);
