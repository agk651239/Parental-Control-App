const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const Geofence = require('../models/Geofence');
const ActivityLog = require('../models/ActivityLog');
const { authMiddleware, deviceAuthMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse, getDistance } = require('../utils/helpers');

// Child app → save location
router.post('/save', deviceAuthMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, altitude, speed, bearing, batteryLevel, isCharging, provider } = req.body;
    if (!latitude || !longitude) return errorResponse(res, 'Latitude and longitude required');

    const loc = await Location.create({
      deviceId: req.deviceId,
      latitude, longitude, accuracy, altitude, speed, bearing,
      batteryLevel, isCharging, provider: provider || 'fused'
    });

    // Check geofences
    const fences = await Geofence.find({ deviceId: req.deviceId, isActive: true });
    for (const fence of fences) {
      const distance = getDistance(latitude, longitude, fence.latitude, fence.longitude);
      const wasInside = fence.isInside;
      const isInside = distance <= fence.radius;

      if (isInside !== wasInside) {
        fence.isInside = isInside;
        if (isInside) {
          fence.lastEnteredAt = new Date();
          if (fence.alertOnEnter) {
            await ActivityLog.create({
              deviceId: req.deviceId,
              type: 'geofence_enter',
              title: `Entered ${fence.name}`,
              severity: 'info'
            });
          }
        } else {
          fence.lastExitedAt = new Date();
          if (fence.alertOnExit) {
            await ActivityLog.create({
              deviceId: req.deviceId,
              type: 'geofence_exit',
              title: `Exited ${fence.name}`,
              severity: 'warning'
            });
          }
        }
        await fence.save();
      }
    }

    return successResponse(res, loc, 'Location saved', 201);
  } catch (err) {
    return errorResponse(res, 'Save failed', 500, err);
  }
});

// Parent → latest location
router.get('/latest/:deviceId', authMiddleware, async (req, res) => {
  try {
    const loc = await Location.findOne({ deviceId: req.params.deviceId }).sort({ timestamp: -1 });
    return successResponse(res, loc);
  } catch (err) {
    return errorResponse(res, 'Fetch failed', 500, err);
  }
});

// Parent → history
router.get('/history/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 100, from, to } = req.query;
    const filter = { deviceId: req.params.deviceId };
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }
    const list = await Location.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    return successResponse(res, list);
  } catch (err) {
    return errorResponse(res, 'Fetch failed', 500, err);
  }
});

module.exports = router;
