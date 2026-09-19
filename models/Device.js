const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    deviceName: {
        type: String,
        default: 'Unknown Device'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    deviceToken: {
        type: String,
        default: null
    },
    fcmToken: {
        type: String,
        default: null
    },
    isPaired: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    
    // ✅ NAYA — Battery + Charging
    batteryLevel: {
        type: Number,
        default: null
    },
    isCharging: {
        type: Boolean,
        default: false
    },
    
    model: String,
    osVersion: String,
    appVersion: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Device', deviceSchema);
