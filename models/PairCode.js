const mongoose = require('mongoose');

const pairCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    deviceId: {
        type: String,
        required: true,
        index: true
    },
    deviceName: {
        type: String,
        default: 'Unknown Device'
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        required: true
        // ⚠️ Yahan se 'index: true' hata diya
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Sirf yahan index lagayenge — TTL ke saath
pairCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('PairCode', pairCodeSchema);
