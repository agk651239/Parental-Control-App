const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const Schedule = require('../models/Schedule');
const Device = require('../models/Device');

// Device auth middleware
async function deviceAuth(req, res, next) {
    try {
        const deviceToken = req.headers['x-device-token'];
        if (!deviceToken) return res.status(401).json({ error: 'Device token required' });

        const device = await Device.findOne({ deviceToken });
        if (!device) return res.status(401).json({ error: 'Invalid device token' });

        req.device = device;
        req.deviceId = device.deviceId;
        next();
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
}

// ═══════════════════════════════════════════════════════════
//  POST /api/schedule/create
//  Parent → Backend → Child (FCM)
// ═══════════════════════════════════════════════════════════
router.post('/create', async (req, res) => {
    try {
        const { deviceId, recordingType, startTime, endTime, mode, days, specificDate, enabled } = req.body;

        if (!deviceId || !recordingType) {
            return res.status(400).json({ error: 'deviceId and recordingType required' });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (!device.fcmToken) return res.status(400).json({ error: 'Device has no FCM token' });

        // Save schedule to database
        const schedule = await Schedule.create({
            deviceId,
            userId: device.userId || null,
            recordingType,
            startTime: startTime || '22:00',
            endTime: endTime || '23:00',
            mode: mode || 'recurring',
            days: days || [0, 1, 2, 3, 4, 5, 6],
            specificDate: specificDate || '',
            enabled: enabled !== false
        });

        // Send FCM to child
        const payload = {
            recordingType,
            startTime: startTime || '22:00',
            endTime: endTime || '23:00',
            mode: mode || 'recurring',
            days: JSON.stringify(days || [0, 1, 2, 3, 4, 5, 6]),
            specificDate: specificDate || '',
            enabled: String(enabled !== false)
        };

        const message = {
            token: device.fcmToken,
            data: {
                command: 'SET_RECORDING_SCHEDULE',
                payload: JSON.stringify(payload)
            },
            android: { priority: 'high', ttl: 60 * 1000 }
        };

        const response = await admin.messaging().send(message);

        res.json({
            success: true,
            message: 'Schedule created and sent to child',
            scheduleId: schedule._id,
            fcmResponseId: response
        });
    } catch (err) {
        console.error('Schedule create error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  GET /api/schedule/list/:deviceId
// ═══════════════════════════════════════════════════════════
router.get('/list/:deviceId', async (req, res) => {
    try {
        const schedules = await Schedule.find({ deviceId: req.params.deviceId })
            .sort({ createdAt: -1 });
        res.json({ success: true, count: schedules.length, schedules });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  PUT /api/schedule/update/:id
// ═══════════════════════════════════════════════════════════
router.put('/update/:id', async (req, res) => {
    try {
        const schedule = await Schedule.findById(req.params.id);
        if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

        // Update fields
        Object.keys(req.body).forEach(key => {
            schedule[key] = req.body[key];
        });
        await schedule.save();

        // Re-send FCM to child
        const device = await Device.findOne({ deviceId: schedule.deviceId });
        if (device && device.fcmToken) {
            const payload = {
                recordingType: schedule.recordingType,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                mode: schedule.mode,
                days: JSON.stringify(schedule.days),
                specificDate: schedule.specificDate,
                enabled: String(schedule.enabled)
            };

            try {
                await admin.messaging().send({
                    token: device.fcmToken,
                    data: {
                        command: 'SET_RECORDING_SCHEDULE',
                        payload: JSON.stringify(payload)
                    },
                    android: { priority: 'high' }
                });
            } catch (e) {
                console.error('FCM update failed:', e.message);
            }
        }

        res.json({ success: true, message: 'Schedule updated', schedule });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  DELETE /api/schedule/delete/:id
// ═══════════════════════════════════════════════════════════
router.delete('/delete/:id', async (req, res) => {
    try {
        const schedule = await Schedule.findById(req.params.id);
        if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

        // Send disable command to child
        const device = await Device.findOne({ deviceId: schedule.deviceId });
        if (device && device.fcmToken) {
            try {
                await admin.messaging().send({
                    token: device.fcmToken,
                    data: {
                        command: 'SET_RECORDING_SCHEDULE',
                        payload: JSON.stringify({
                            recordingType: schedule.recordingType,
                            enabled: 'false'
                        })
                    },
                    android: { priority: 'high' }
                });
            } catch (e) {
                console.error('FCM delete failed:', e.message);
            }
        }

        await Schedule.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Schedule deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  POST /api/schedule/toggle/:id
// ═══════════════════════════════════════════════════════════
router.post('/toggle/:id', async (req, res) => {
    try {
        const schedule = await Schedule.findById(req.params.id);
        if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

        schedule.enabled = !schedule.enabled;
        await schedule.save();

        // Send FCM
        const device = await Device.findOne({ deviceId: schedule.deviceId });
        if (device && device.fcmToken) {
            try {
                await admin.messaging().send({
                    token: device.fcmToken,
                    data: {
                        command: 'SET_RECORDING_SCHEDULE',
                        payload: JSON.stringify({
                            recordingType: schedule.recordingType,
                            startTime: schedule.startTime,
                            endTime: schedule.endTime,
                            mode: schedule.mode,
                            days: JSON.stringify(schedule.days),
                            specificDate: schedule.specificDate,
                            enabled: String(schedule.enabled)
                        })
                    },
                    android: { priority: 'high' }
                });
            } catch (e) {
                console.error('FCM toggle failed:', e.message);
            }
        }

        res.json({ success: true, message: 'Schedule toggled', enabled: schedule.enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
