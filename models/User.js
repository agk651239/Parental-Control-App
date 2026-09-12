const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, default: '' },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['parent', 'child'], default: 'parent' },
  plan: { type: String, enum: ['free', 'premium'], default: 'free' },
  planExpiry: { type: Date, default: null },
  razorpayPaymentId: { type: String, default: null },
  fcmToken: { type: String, default: null },
  devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }],
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
