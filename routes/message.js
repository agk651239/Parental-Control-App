const express = require('express');
const router = express.Router();
const ActivityLog = require('../models/ActivityLog');
const { deviceAuthMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

// SMS bulk save endpoint
router.post('/bulk-save', deviceAuthMiddleware, async (req, res) => {
    try {
        const { messages } = req.body;
        if (!Array.isArray(messages)) return errorResponse(res, 'messages[] required');
        
        for (const msg of messages) {
            await ActivityLog.create({
                deviceId: req.deviceId,
                type: 'notification_received',
                title: `SMS from ${msg.address}`,
                description: msg.body,
                metadata: msg
            });
        }
        return successResponse(res, { count: messages.length }, 'Messages saved', 201);
    } catch (err) {
        return errorResponse(res, 'Save failed', 500, err);
    }
});

module.exports = router;
