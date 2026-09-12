const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Device = require('../models/Device');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

const generateToken = (userId, role = 'parent') => {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '30d' });
};

// Parent app auth
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'Invalid user' });
    }
    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Child app auth (device token)
const deviceAuthMiddleware = async (req, res, next) => {
  try {
    const deviceToken = req.headers['x-device-token'];
    if (!deviceToken) {
      return res.status(401).json({ success: false, error: 'Device token required' });
    }
    const device = await Device.findOne({ deviceToken });
    if (!device) {
      return res.status(401).json({ success: false, error: 'Invalid device token' });
    }
    req.device = device;
    req.deviceId = device.deviceId;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: err.message });
  }
};

module.exports = { generateToken, authMiddleware, deviceAuthMiddleware };
