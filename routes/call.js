const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const Device = require('../models/Device');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

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
//  POST /api/call/notify
//  Child → Backend → Parent (FCM notification)
// ═══════════════════════════════════════════════════════════
router.post('/notify', deviceAuth, async (req, res) => {
    try {
        const { platform, number, contactName, callType, direction, event } = req.body;

        if (!platform || !event) {
            return res.status(400).json({ error: 'platform and event required' });
        }

        // Build notification title
        let title = '';
        let icon = '📞';

        switch (event) {
            case 'ringing':
                title = `${icon} ${platform} call from ${contactName}`;
                break;
            case 'connected':
                title = `🟢 ${platform} call connected: ${contactName}`;
                break;
            case 'ended':
                title = `🔴 ${platform} call ended: ${contactName}`;
                break;
            case 'missed':
                title = `⚠️ Missed ${platform} call: ${contactName}`;
                icon = '⚠️';
                break;
            default:
                title = `📞 ${platform} call: ${contactName}`;
        }

        // Save to activity log
        await ActivityLog.create({
            deviceId: req.deviceId,
            type: 'call_detected',
            title,
            description: `${direction} ${callType} call • ${number}`,
            severity: event === 'missed' ? 'warning' : 'info',
            metadata: {
                platform,
                number,
                contactName,
                callType,
                direction,
                event
            }
        });

        // Send FCM to parent
        const device = await Device.findOne({ deviceId: req.deviceId });
        if (device && device.userId) {
            const user = await User.findById(device.userId);
            if (user && user.fcmToken) {
                try {
                    await admin.messaging().send({
                        token: user.fcmToken,
                        notification: {
                            title,
                            body: `${number}`
                        },
                        data: {
                            type: 'call_notification',
                            platform: String(platform),
                            number: String(number || ''),
                            contactName: String(contactName || 'Unknown'),
                            callType: String(callType || 'voice'),
                            direction: String(direction || 'incoming'),
                            event: String(event),
                            deviceId: String(req.deviceId),
                            timestamp: String(Date.now())
                        },
                        android: {
                            priority: 'high',
                            notification: {
                                channelId: 'call_notifications'
                            }
                        }
                    });
                    console.log(`✅ Parent notified: ${title}`);
                } catch (e) {
                    console.error('FCM send failed:', e.message);
                }
            }
        }

        res.json({ success: true, message: 'Notification sent to parent' });
    } catch (err) {
        console.error('call/notify error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  POST /api/call/settings
//  Parent → Backend → save + forward to child
// ═══════════════════════════════════════════════════════════
router.post('/settings', async (req, res) => {
    try {
        const { deviceId, settings } = req.body;

        if (!deviceId || !settings) {
            return res.status(400).json({ error: 'deviceId and settings required' });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (!device.fcmToken) return res.status(400).json({ error: 'Device has no FCM token' });

        const message = {
            token: device.fcmToken,
            data: {
                command: 'SET_CALL_NOTIFICATION_SETTINGS',
                payload: JSON.stringify(settings)
            },
            android: { priority: 'high' }
        };

        const response = await admin.messaging().send(message);

        res.json({
            success: true,
            message: 'Settings sent to child',
            fcmResponseId: response
        });
    } catch (err) {
        console.error('call/settings error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  GET /api/call/log/:deviceId
//  Parent → call log list
// ═══════════════════════════════════════════════════════════
router.get('/log/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { platform, limit = 100, page = 1 } = req.query;

        const filter = { deviceId, type: 'call_detected' };
        if (platform) {
            filter['metadata.platform'] = platform;
        }

        const logs = await ActivityLog.find(filter)
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({
            success: true,
            count: logs.length,
            logs
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  POST /api/call/live/start
//  Parent → Backend → Child (start live listening)
// ═══════════════════════════════════════════════════════════
router.post('/live/start', async (req, res) => {
    try {
        const { deviceId, callId } = req.body;

        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId required' });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (!device.fcmToken) return res.status(400).json({ error: 'Device has no FCM token' });

        const message = {
            token: device.fcmToken,
            data: {
                command: 'START_LIVE_CALL_LISTEN',
                callId: String(callId || '')
            },
            android: { priority: 'high' }
        };

        const response = await admin.messaging().send(message);

        res.json({
            success: true,
            message: 'Live listening started',
            fcmResponseId: response
        });
    } catch (err) {
        console.error('call/live/start error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  POST /api/call/live/stop
//  Parent → Backend → Child (stop live listening)
// ═══════════════════════════════════════════════════════════
router.post('/live/stop', async (req, res) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId required' });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (!device.fcmToken) return res.status(400).json({ error: 'Device has no FCM token' });

        const message = {
            token: device.fcmToken,
            data: {
                command: 'STOP_LIVE_CALL_LISTEN'
            },
            android: { priority: 'high' }
        };

        const response = await admin.messaging().send(message);

        res.json({
            success: true,
            message: 'Live listening stopped',
            fcmResponseId: response
        });
    } catch (err) {
        console.error('call/live/stop error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
