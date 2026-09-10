const mongoose = require('mongoose');

const pairCodeSchema = new mongoose.Schema({
    // 6-digit code (unique across all devices)
    code: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Kis device ke liye ye code hai (unique link)
    deviceId: {
        type: String,
        required: true,
        index: true
    },

    // Device ka naam (reference ke liye)
    deviceName: {
        type: String,
        default: 'Unknown Device'
    },

    // Kya code use ho chuka hai?
    isUsed: {
        type: Boolean,
        default: false
    },

    // Kab expire hoga (10 min baad)
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },

    // Kab generate hua
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-delete expired codes after 1 hour
pairCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('PairCode', pairCodeSchema);
