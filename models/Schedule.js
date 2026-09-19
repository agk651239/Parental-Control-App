const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    recordingType: {
        type: String,
        enum: ['camera', 'screen', 'audio'],
        required: true
    },
    startTime: {
        type: String,
        default: '22:00'
    },
    endTime: {
        type: String,
        default: '23:00'
    },
    mode: {
        type: String,
        enum: ['today', 'recurring'],
        default: 'recurring'
    },
    days: [{
        type: Number,
        min: 0,
        max: 6
    }],
    specificDate: {
        type: String,
        default: ''
    },
    enabled: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
