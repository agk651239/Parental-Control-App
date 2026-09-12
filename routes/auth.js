const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { successResponse, errorResponse } = require('../utils/helpers');

router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) return errorResponse(res, 'Name, email, password required');

    const existing = await User.findOne({ email });
    if (existing) return errorResponse(res, 'Email already registered');

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, phone, password: hashed });
    const token = generateToken(user._id, user.role);

    return successResponse(res, {
      token,
      user: { id: user._id, name, email, plan: user.plan }
    }, 'Signup successful', 201);
  } catch (err) {
    return errorResponse(res, 'Signup failed', 500, err);
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return errorResponse(res, 'Email and password required');

    const user = await User.findOne({ email }).select('+password');
    if (!user) return errorResponse(res, 'Invalid credentials', 401);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return errorResponse(res, 'Invalid credentials', 401);

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id, user.role);
    return successResponse(res, {
      token,
      user: { id: user._id, name: user.name, email: user.email, plan: user.plan }
    }, 'Login successful');
  } catch (err) {
    return errorResponse(res, 'Login failed', 500, err);
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  return successResponse(res, req.user);
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, fcmToken } = req.body;
    const update = {};
    if (name) update.name = name;
    if (phone) update.phone = phone;
    if (fcmToken) update.fcmToken = fcmToken;
    const user = await User.findByIdAndUpdate(req.userId, update, { new: true });
    return successResponse(res, user, 'Profile updated');
  } catch (err) {
    return errorResponse(res, 'Update failed', 500, err);
  }
});

module.exports = router;
