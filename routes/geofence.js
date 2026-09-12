const express = require('express');
const router = express.Router();
const Geofence = require('../models/Geofence');
const { authMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { deviceId, name, latitude, longitude, radius, alertOnEnter, alertOnExit, activeHours, activeDays } = req.body;
    if (!deviceId || !name || !latitude || !longitude) return errorResponse(res, 'Missing fields');

    const fence = await Geofence.create({
      deviceId, name, latitude, longitude,
      radius: radius || 200,
      alertOnEnter: alertOnEnter !== false,
      alertOnExit: alertOnExit !== false,
      activeHours: activeHours || { start: '00:00', end: '23:59' },
      activeDays: activeDays || [0, 1, 2, 3, 4, 5, 6],
      userId: req.userId
    });
    return successResponse(res, fence, 'Geofence created', 201);
  } catch (err) {
    return errorResponse(res, 'Create failed', 500, err);
  }
});

router.get('/:deviceId', authMiddleware, async (req, res) => {
  const list = await Geofence.find({ deviceId: req.params.deviceId }).sort({ createdAt: -1 });
  return successResponse(res, list);
});

router.put('/:id', authMiddleware, async (req, res) => {
  const fence = await Geofence.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!fence) return errorResponse(res, 'Not found', 404);
  return successResponse(res, fence, 'Updated');
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await Geofence.findByIdAndDelete(req.params.id);
  return successResponse(res, null, 'Deleted');
});

module.exports = router;
