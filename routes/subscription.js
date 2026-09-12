const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const razorpayService = require('../services/razorpay');
const { authMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

const PLAN_PRICE = Number(process.env.PLAN_PRICE) || 499;
const PLAN_DURATION_DAYS = 30;

router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const order = await razorpayService.createOrder(
      PLAN_PRICE, 'INR',
      `sub_${req.userId}_${Date.now()}`,
      { userId: req.userId.toString() }
    );

    await Subscription.create({
      userId: req.userId,
      plan: 'premium',
      amount: PLAN_PRICE,
      razorpayOrderId: order.id,
      status: 'created',
      startDate: new Date(),
      endDate: new Date(Date.now() + PLAN_DURATION_DAYS * 86400000)
    });

    return successResponse(res, {
      orderId: order.id,
      amount: PLAN_PRICE,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      name: 'Parental Control Premium',
      description: 'Monthly Subscription'
    }, 'Order created');
  } catch (err) {
    return errorResponse(res, 'Order creation failed', 500, err);
  }
});

router.post('/verify-payment', authMiddleware, async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    if (!orderId || !paymentId || !signature) return errorResponse(res, 'Missing fields');

    const isValid = razorpayService.verifyPayment(orderId, paymentId, signature);
    if (!isValid) {
      await Subscription.findOneAndUpdate({ razorpayOrderId: orderId }, { status: 'failed' });
      return errorResponse(res, 'Invalid signature', 400);
    }

    const sub = await Subscription.findOneAndUpdate(
      { razorpayOrderId: orderId },
      { status: 'success', razorpayPaymentId: paymentId, razorpaySignature: signature },
      { new: true }
    );

    await User.findByIdAndUpdate(req.userId, {
      plan: 'premium',
      planExpiry: sub.endDate,
      razorpayPaymentId: paymentId
    });

    return successResponse(res, sub, 'Payment verified, Premium activated ✅');
  } catch (err) {
    return errorResponse(res, 'Verification failed', 500, err);
  }
});

router.get('/current', authMiddleware, async (req, res) => {
  const sub = await Subscription.findOne({ userId: req.userId, status: 'success' }).sort({ createdAt: -1 });
  return successResponse(res, sub);
});

router.get('/history', authMiddleware, async (req, res) => {
  const list = await Subscription.find({ userId: req.userId }).sort({ createdAt: -1 });
  return successResponse(res, list);
});

// Razorpay webhook (no auth - Razorpay calls directly)
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const isValid = razorpayService.verifyWebhook(JSON.stringify(req.body), signature);
    if (!isValid) return res.status(400).send('Invalid signature');

    const event = req.body.event;
    const payload = req.body.payload?.payment?.entity;

    if (event === 'payment.captured' && payload) {
      await Subscription.findOneAndUpdate(
        { razorpayOrderId: payload.order_id },
        { status: 'success', razorpayPaymentId: payload.id, paymentMethod: payload.method }
      );
    }
    return res.json({ status: 'ok' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
