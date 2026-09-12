const crypto = require('crypto');

let razorpayInstance = null;

const getRazorpay = () => {
  if (razorpayInstance) return razorpayInstance;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys not configured');
  }

  const Razorpay = require('razorpay');
  razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayInstance;
};

const createOrder = async (amount, currency = 'INR', receipt = null, notes = {}) => {
  const rzp = getRazorpay();
  return await rzp.orders.create({
    amount: amount * 100,
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    notes
  });
};

const verifyPayment = (orderId, paymentId, signature) => {
  const body = orderId + '|' + paymentId;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(body)
    .digest('hex');
  return expected === signature;
};

const verifyWebhook = (body, signature) => {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
    .update(body)
    .digest('hex');
  return expected === signature;
};

module.exports = { createOrder, verifyPayment, verifyWebhook, getRazorpay };
