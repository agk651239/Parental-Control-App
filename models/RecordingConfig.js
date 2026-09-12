const mongoose = require('mongoose');

const recordingConfigSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: { type: String, enum: ['camera', 'audio', 'screen', 'call'], required: true },
  cameraMode: { type: String, enum: ['front', 'back', 'dual'], default: 'back' },
  audioMode: { type: String, enum: ['mic', 'call_both', 'internal'], default: 'mic' },
  chunkDuration: { type: Number, default: 1 },
  schedule: {
    days: [{ type: Number, min: 0, max: 6 }],
    startTime: { type: String, default: '10:00' },
    endTime: { type: String, default: '11:00' },
    mode: { type: String, enum: ['today', 'recurring'], default: 'recurring' },
    specificDate: { type: Date, default: null }
  },
  quality: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  resolution: { type: String, default: '720p' },
  fps: { type: Number, default: 30 },
  wifiOnly: { type: Boolean, default: true },
  compressBeforeUpload: { type: Boolean, default: true },
  autoDeleteAfterUpload: { type: Boolean, default: true },
  whitelistedContacts: [{ type: String }],
  isActive: { type: Boolean, default: true },
  lastRunAt: { type: Date, default: null },
  nextRunAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('RecordingConfig', recordingConfigSchema);
