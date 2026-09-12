const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Plan details
  planId: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'halfyearly', 'yearly'],
    required: true
  },
  planName: { type: String, default: '' },
  durationDays: { type: Number, required: true },

  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },

  // Razorpay
  razorpayOrderId: { type: String, default: null, index: true },
  razorpayPaymentId: { type: String, default: null },
  razorpaySignature: { type: String, default: null },
  paymentMethod: { type: String, default: null },

  status: {
    type: String,
    enum: ['created', 'pending', 'success', 'failed', 'refunded', 'cancelled', 'expired'],
    default: 'created'
  },

  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  autoRenew: { type: Boolean, default: false },

  invoiceUrl: { type: String, default: null }
}, { timestamps: true });

subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
