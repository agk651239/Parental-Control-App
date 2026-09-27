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
    
    // Battery + Charging
    batteryLevel: {
        type: Number,
        default: null
    },
    isCharging: {
        type: Boolean,
        default: false
    },
    
    // ✅ NAYA — Permissions & Services Status (Jo Android app bhej raha hai)
    permissions: {
        admin: { type: Boolean, default: false },
        accessibility: { type: Boolean, default: false },
        notification: { type: Boolean, default: false },
        battery: { type: Boolean, default: false },
        overlay: { type: Boolean, default: false },
        usage: { type: Boolean, default: false },
        camera: { type: Boolean, default: false },
        mic: { type: Boolean, default: false },
        location: { type: Boolean, default: false },
        contacts: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        call_log: { type: Boolean, default: false },
        phone_state: { type: Boolean, default: false },
        storage: { type: Boolean, default: false }
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
