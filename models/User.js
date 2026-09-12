const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, default: '' },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['parent', 'child'], default: 'parent' },

  // ⚡ Subscription (UPDATED)
  plan: { type: String, default: 'free' }, // 'free' | planId (weekly, monthly, etc)
  planExpiry: { type: Date, default: null },
  activePlanId: { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },

  fcmToken: { type: String, default: null },
  devices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Device' }],
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date, default: Date.now }
}, { timestamps: true });
