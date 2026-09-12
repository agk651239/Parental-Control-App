const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const { authMiddleware, deviceAuthMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.post('/save', deviceAuthMiddleware, async (req, res) => {
  try {
    const { packageName, appName, title, text, bigText, category, subText, contactName, contactNumber, isOngoing, isClearable, postedAt } = req.body;
    if (!packageName) return errorResponse(res, 'packageName required');

    const notif = await Notification.create({
      deviceId: req.deviceId,
      packageName, appName, title, text, bigText, category, subText,
      contactName, contactNumber, isOngoing, isClearable,
      postedAt: postedAt ? new Date(postedAt) : new Date()
    });

    await ActivityLog.create({
      deviceId: req.deviceId,
      type: 'notification_received',
      title: `${appName || packageName}: ${title || 'Notification'}`,
      description: text || '',
      metadata: { packageName, contactName, contactNumber }
    });

    return successResponse(res, notif, 'Notification saved', 201);
  } catch (err) {
    return errorResponse(res, 'Save failed', 500, err);
  }
});

router.get('/list/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 100, app, search, from, to } = req.query;
    const filter = { deviceId: req.params.deviceId };
    if (app) filter.packageName = app;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { text: { $regex: search, $options: 'i' } }
      ];
    }
    if (from || to) {
      filter.postedAt = {};
      if (from) filter.postedAt.$gte = new Date(from);
      if (to) filter.postedAt.$lte = new Date(to);
    }
    const list = await Notification.find(filter)
      .sort({ postedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    return successResponse(res, list);
  } catch (err) {
    return errorResponse(res, 'Fetch failed', 500, err);
  }
});

router.get('/apps/:deviceId', authMiddleware, async (req, res) => {
  const apps = await Notification.distinct('packageName', { deviceId: req.params.deviceId });
  return successResponse(res, apps);
});

module.exports = router;
