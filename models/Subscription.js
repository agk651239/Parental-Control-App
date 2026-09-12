const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: String, enum: ['free', 'premium'], default: 'free' },
  amount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  razorpayOrderId: { type: String, default: null, index: true },
  razorpayPaymentId: { type: String, default: null },
  razorpaySignature: { type: String, default: null },
  paymentMethod: { type: String, default: null },
  status: {
    type: String,
    enum: ['created', 'pending', 'success', 'failed', 'refunded', 'cancelled'],
    default: 'created'
  },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  features: {
    liveLocation: { type: Boolean, default: true },
    notificationList: { type: Boolean, default: true },
    callRecording: { type: Boolean, default: false },
    liveStream: { type: Boolean, default: false },
    unlimitedStorage: { type: Boolean, default: false },
    aiAlerts: { type: Boolean, default: false }
  },
  invoiceUrl: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
