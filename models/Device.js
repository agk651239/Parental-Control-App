const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    // Device ki unique ID (Android ID from phone)
    deviceId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Device ka naam (jaise "realme RMX5000")
    deviceName: {
        type: String,
        default: 'Unknown Device'
    },

    // Parent user ka reference (jab pair hoga tab set hoga)
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // Device ka permanent token (pair hone ke baad)
    deviceToken: {
        type: String,
        default: null
    },

    // FCM token for push notifications (baad mein set hoga)
    fcmToken: {
        type: String,
        default: null
    },

    // Kya ye device already paired hai?
    isPaired: {
        type: Boolean,
        default: false
    },

    // Last time device online tha
    lastSeen: {
        type: Date,
        default: Date.now
    },

    // Device ki extra info
    model: String,
    osVersion: String,
    appVersion: String,

    // Kab register hua
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Device', deviceSchema);
