const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const RecordingConfig = require('../models/RecordingConfig');
const Device = require('../models/Device');
const { authMiddleware, deviceAuthMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

// ═══════════════════════════════════════════════════════════
//  CREATE RECORDING CONFIG
// ═══════════════════════════════════════════════════════════
router.post('/', authMiddleware, async (req, res) => {
  try {
    const config = { ...req.body, userId: req.userId };
    const doc = await RecordingConfig.create(config);
    return successResponse(res, doc, 'Config created', 201);
  } catch (err) {
    return errorResponse(res, 'Create failed', 500, err);
  }
});

// ═══════════════════════════════════════════════════════════
//  ✅ NEW — SET RECORDING SCHEDULE (Parent App se)
//  Body: { deviceId, recordingType, startTime, endTime, mode, days, specificDate, enabled }
// ═══════════════════════════════════════════════════════════
router.post('/schedule', authMiddleware, async (req, res) => {
  try {
    const {
      deviceId,
      recordingType,    // "camera" | "screen" | "audio"
      startTime,        // "22:00"
      endTime,          // "23:00"
      mode,             // "all" | "today" | "selected"
      days,             // [0,1,2,3,4,5,6]  (0=Sun, 6=Sat)
      specificDate,     // "2026-09-19"
      enabled
    } = req.body;

    // Validation
    if (!deviceId || !recordingType || !startTime || !endTime) {
      return errorResponse(res, 'deviceId, recordingType, startTime, endTime required', 400);
    }

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return errorResponse(res, 'Device not found', 404);
    }

    if (!device.fcmToken) {
      return errorResponse(res, 'Device has no FCM token — child app not connected', 400);
    }

    // ✅ Build payload
    const schedulePayload = {
      deviceId,
      recordingType,
      startTime,
      endTime,
      mode: mode || 'all',
      days: days || [],
      specificDate: specificDate || '',
      enabled: enabled !== undefined ? enabled : true
    };

    console.log(`📅 Schedule request for ${deviceId}:`, schedulePayload);

    // ✅ Send FCM command to child app
    const message = {
      token: device.fcmToken,
      data: {
        command: 'SET_RECORDING_SCHEDULE',
        payload: JSON.stringify(schedulePayload),
        timestamp: String(Date.now())
      },
      android: { priority: 'high', ttl: 5 * 60 * 1000 }
    };

    const fcmResponse = await admin.messaging().send(message);
    console.log(`📤 FCM sent to child: ${deviceId}`);

    return successResponse(res, {
      schedule: schedulePayload,
      fcmResponseId: fcmResponse
    }, 'Schedule sent to device', 200);

  } catch (err) {
    console.error('Schedule error:', err);
    return errorResponse(res, 'Schedule failed', 500, err);
  }
});

// ═══════════════════════════════════════════════════════════
//  LIST CONFIGS FOR DEVICE
// ═══════════════════════════════════════════════════════════
router.get('/list/:deviceId', authMiddleware, async (req, res) => {
  try {
    const list = await RecordingConfig.find({ deviceId: req.params.deviceId }).sort({ createdAt: -1 });
    return successResponse(res, list);
  } catch (err) {
    return errorResponse(res, 'List failed', 500, err);
  }
});

// ═══════════════════════════════════════════════════════════
//  GET ACTIVE CONFIGS (Child app use karta hai)
// ═══════════════════════════════════════════════════════════
router.get('/active', deviceAuthMiddleware, async (req, res) => {
  try {
    const list = await RecordingConfig.find({ deviceId: req.deviceId, isActive: true });
    return successResponse(res, list);
  } catch (err) {
    return errorResponse(res, 'Fetch failed', 500, err);
  }
});

// ═══════════════════════════════════════════════════════════
//  UPDATE CONFIG
// ═══════════════════════════════════════════════════════════
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await RecordingConfig.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return errorResponse(res, 'Not found', 404);
    return successResponse(res, doc, 'Updated');
  } catch (err) {
    return errorResponse(res, 'Update failed', 500, err);
  }
});

// ═══════════════════════════════════════════════════════════
//  DELETE CONFIG
// ═══════════════════════════════════════════════════════════
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await RecordingConfig.findByIdAndDelete(req.params.id);
    return successResponse(res, null, 'Deleted');
  } catch (err) {
    return errorResponse(res, 'Delete failed', 500, err);
  }
});

// ═══════════════════════════════════════════════════════════
//  TOGGLE CONFIG (enable / disable)
// ═══════════════════════════════════════════════════════════
router.post('/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const doc = await RecordingConfig.findById(req.params.id);
    if (!doc) return errorResponse(res, 'Not found', 404);
    doc.isActive = !doc.isActive;
    await doc.save();
    return successResponse(res, doc, 'Toggled');
  } catch (err) {
    return errorResponse(res, 'Toggle failed', 500, err);
  }
});

module.exports = router;
