const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: {
    type: String,
    enum: [
      'command_sent', 'command_executed', 'device_online', 'device_offline',
      'location_update', 'geofence_enter', 'geofence_exit', 'intruder_detected',
      'recording_started', 'recording_stopped', 'upload_success', 'upload_failed',
      'notification_received', 'call_detected', 'wrong_pin', 'app_installed',
      'app_uninstalled', 'screenshot_taken', 'screen_unlock', 'screen_lock',
      'battery_low', 'network_change', 'boot_completed', 'live_stream_start', 'live_stream_stop'
    ],
    required: true
  },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  metadata: { type: Object, default: {} },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

activityLogSchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
