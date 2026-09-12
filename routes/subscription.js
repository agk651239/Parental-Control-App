const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');
const {
  PLANS,
  getPlanById,
  getAllActivePlans,
  getPopularPlan,
  calculateSavings
} = require('../config/plans');

// Lazy load Razorpay
const getRazorpayService = () => require('../services/razorpay');

// ═══════════════════════════════════════════════════════════
//  GET /api/subscription/plans — Saare plans list
//  (Public — login ki zaroorat nahi)
// ═══════════════════════════════════════════════════════════
router.get('/plans', (req, res) => {
  const plans = getAllActivePlans().map(plan => ({
    ...plan,
    savings: calculateSavings(plan)
  }));
  return successResponse(res, {
    plans,
    popular: getPopularPlan()
  }, 'Plans fetched');
});

// ═══════════════════════════════════════════════════════════
//  POST /api/subscription/create-order
//  Body: { planId: 'monthly' }
// ═══════════════════════════════════════════════════════════
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return errorResponse(res, 'planId required');

    const plan = getPlanById(planId);
    if (!plan) return errorResponse(res, 'Invalid plan', 404);
    if (!plan.isActive) return errorResponse(res, 'Plan not available', 400);

    const razorpayService = getRazorpayService();
    const order = await razorpayService.createOrder(
      plan.price,
      plan.currency,
      `sub_${req.userId}_${planId}_${Date.now()}`,
      {
        userId: req.userId.toString(),
        planId: plan.id,
        planName: plan.name
      }
    );

    const endDate = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000);

    await Subscription.create({
      userId: req.userId,
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.days,
      amount: plan.price,
      currency: plan.currency,
      razorpayOrderId: order.id,
      status: 'created',
      startDate: new Date(),
      endDate
    });

    return successResponse(res, {
      orderId: order.id,
      amount: plan.price,
      currency: plan.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan: {
        id: plan.id,
        name: plan.name,
        days: plan.days,
        price: plan.price
      },
      name: 'Parental Control Premium',
      description: `${plan.name} — ${plan.days} days`
    }, 'Order created');
  } catch (err) {
    console.error('Create order error:', err);
    return errorResponse(res, err.message || 'Order creation failed', 500);
  }
});

// ═══════════════════════════════════════════════════════════
//  POST /api/subscription/verify-payment
//  Body: { orderId, paymentId, signature }
// ═══════════════════════════════════════════════════════════
router.post('/verify-payment', authMiddleware, async (req, res) => {
  try {
    const razorpayService = getRazorpayService();
    const { orderId, paymentId, signature } = req.body;
    if (!orderId || !paymentId || !signature) {
      return errorResponse(res, 'orderId, paymentId, signature required');
    }

    const isValid = razorpayService.verifyPayment(orderId, paymentId, signature);
    if (!isValid) {
      await Subscription.findOneAndUpdate(
        { razorpayOrderId: orderId },
        { status: 'failed' }
      );
      return errorResponse(res, 'Invalid signature', 400);
    }

    const sub = await Subscription.findOneAndUpdate(
      { razorpayOrderId: orderId },
      {
        status: 'success',
        razorpayPaymentId: paymentId,
        razorpaySignature: signature
      },
      { new: true }
    );

    if (!sub) return errorResponse(res, 'Subscription not found', 404);

    // Update user
    await User.findByIdAndUpdate(req.userId, {
      plan: sub.planId,
      activePlanId: sub.planId,
      planExpiry: sub.endDate,
      razorpayPaymentId: paymentId
    });

    return successResponse(res, {
      subscription: sub,
      message: `${sub.planName} activated till ${sub.endDate.toISOString().split('T')[0]}`
    }, 'Payment verified ✅');
  } catch (err) {
    console.error('Verify error:', err);
    return errorResponse(res, err.message || 'Verification failed', 500);
  }
});

// ═══════════════════════════════════════════════════════════
//  GET /api/subscription/current — User ka active plan
// ═══════════════════════════════════════════════════════════
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({
      userId: req.userId,
      status: 'success',
      endDate: { $gte: new Date() }
    }).sort({ createdAt: -1 });

    if (!sub) {
      return successResponse(res, {
        plan: 'free',
        isActive: false,
        message: 'No active subscription'
      });
    }

    const daysLeft = Math.ceil((sub.endDate - new Date()) / (1000 * 60 * 60 * 24));

    return successResponse(res, {
      plan: sub.planId,
      planName: sub.planName,
      isActive: true,
      startDate: sub.startDate,
      endDate: sub.endDate,
      daysLeft,
      amount: sub.amount
    });
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
});

// ═══════════════════════════════════════════════════════════
//  GET /api/subscription/history — Payment history
// ═══════════════════════════════════════════════════════════
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const list = await Subscription.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    return successResponse(res, list);
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
});

// ═══════════════════════════════════════════════════════════
//  POST /api/subscription/webhook — Razorpay webhook
// ═══════════════════════════════════════════════════════════
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const razorpayService = getRazorpayService();
    const signature = req.headers['x-razorpay-signature'];

    const isValid = razorpayService.verifyWebhook(JSON.stringify(req.body), signature);
    if (!isValid) return res.status(400).send('Invalid signature');

    const event = req.body.event;
    const payload = req.body.payload?.payment?.entity;

    if (event === 'payment.captured' && payload) {
      const sub = await Subscription.findOneAndUpdate(
        { razorpayOrderId: payload.order_id },
        {
          status: 'success',
          razorpayPaymentId: payload.id,
          paymentMethod: payload.method
        },
        { new: true }
      );

      if (sub) {
        await User.findByIdAndUpdate(sub.userId, {
          plan: sub.planId,
          activePlanId: sub.planId,
          planExpiry: sub.endDate,
          razorpayPaymentId: payload.id
        });
      }
    }

    if (event === 'payment.failed' && payload) {
      await Subscription.findOneAndUpdate(
        { razorpayOrderId: payload.order_id },
        { status: 'failed' }
      );
    }

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
