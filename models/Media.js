const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    fileUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video', 'audio', 'call_recording'], required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Media', mediaSchema);

