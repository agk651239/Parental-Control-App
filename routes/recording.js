const express = require('express');
const router = express.Router();
const RecordingConfig = require('../models/RecordingConfig');
const { authMiddleware, deviceAuthMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.post('/', authMiddleware, async (req, res) => {
  try {
    const config = { ...req.body, userId: req.userId };
    const doc = await RecordingConfig.create(config);
    return successResponse(res, doc, 'Config created', 201);
  } catch (err) {
    return errorResponse(res, 'Create failed', 500, err);
  }
});

router.get('/list/:deviceId', authMiddleware, async (req, res) => {
  const list = await RecordingConfig.find({ deviceId: req.params.deviceId }).sort({ createdAt: -1 });
  return successResponse(res, list);
});

router.get('/active', deviceAuthMiddleware, async (req, res) => {
  const list = await RecordingConfig.find({ deviceId: req.deviceId, isActive: true });
  return successResponse(res, list);
});

router.put('/:id', authMiddleware, async (req, res) => {
  const doc = await RecordingConfig.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!doc) return errorResponse(res, 'Not found', 404);
  return successResponse(res, doc, 'Updated');
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await RecordingConfig.findByIdAndDelete(req.params.id);
  return successResponse(res, null, 'Deleted');
});

router.post('/:id/toggle', authMiddleware, async (req, res) => {
  const doc = await RecordingConfig.findById(req.params.id);
  if (!doc) return errorResponse(res, 'Not found', 404);
  doc.isActive = !doc.isActive;
  await doc.save();
  return successResponse(res, doc, 'Toggled');
});

module.exports = router;
