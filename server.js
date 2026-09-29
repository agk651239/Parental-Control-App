const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const crypto = require('crypto');
const admin = require('firebase-admin');

// Models
const Media = require('./models/Media');
const Device = require('./models/Device');
const PairCode = require('./models/PairCode');
const ActivityLog = require('./models/ActivityLog');
const User = require('./models/User');
const Schedule = require('./models/Schedule');

// Middleware
const { apiLimiter, uploadLimiter } = require('./middleware/rateLimit');

// ═══════════════════════════════════════════════════════════
//  FIREBASE ADMIN INIT
// ═══════════════════════════════════════════════════════════
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin initialized');
} catch (err) {
    console.error('❌ Firebase Admin init failed:', err.message);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ✅ Active WebSockets Map & Parent Clients Tracking
const activeSockets = new Map();
const parentClients = new Set();

// ✅ Render ke liye trust proxy
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global rate limit
app.use('/api', apiLimiter);

// ═══════════════════════════════════════════════════════════
//  CLOUDINARY CONFIG
// ═══════════════════════════════════════════════════════════
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ═══════════════════════════════════════════════════════════
//  MONGODB CONNECTION
// ═══════════════════════════════════════════════════════════
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Atlas Connected'))
    .catch((err) => console.error('❌ MongoDB error:', err));

const upload = multer({ storage: multer.memoryStorage() });

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
async function generateUniqueCode() {
    let code, exists = true, attempts = 0;
    while (exists && attempts < 10) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        const existing = await PairCode.findOne({ code });
        if (!existing) exists = false;
        attempts++;
    }
    if (exists) throw new Error('Could not generate unique code');
    return code;
}

// Device token auth middleware
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
//  MODULAR ROUTES
// ═══════════════════════════════════════════════════════════
app.use('/api/auth', require('./routes/auth'));
app.use('/api/location', require('./routes/location'));
app.use('/api/geofence', require('./routes/geofence'));
app.use('/api/notification', require('./routes/notification'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/recording', require('./routes/recording'));
app.use('/api/media', require('./routes/media'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/call', require('./routes/call'));
app.use('/api/schedule', require('./routes/schedule'));

// ═══════════════════════════════════════════════════════════
//  Health Check
// ═══════════════════════════════════════════════════════════
app.get('/', (req, res) => {
    res.json({ status: 'Watcher Backend Server is running!', time: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════
//  Child App → Generate Pairing Code
// ═══════════════════════════════════════════════════════════
app.post('/api/device/request-code', async (req, res) => {
    try {
        const { deviceId, deviceName } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

        let device = await Device.findOne({ deviceId });
        if (!device) {
            device = new Device({
                deviceId,
                deviceName: deviceName || 'Unknown Device'
            });
            await device.save();
        } else {
            if (deviceName && (device.deviceName === 'Unknown Device' || !device.deviceName)) {
                device.deviceName = deviceName;
                await device.save();
            }
        }

        if (device.isPaired) {
            return res.status(400).json({ error: 'Already paired', isPaired: true });
        }

        await PairCode.deleteMany({ deviceId, isUsed: false });
        const code = await generateUniqueCode();

        await PairCode.create({
            code, deviceId, deviceName: device.deviceName,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        res.json({
            success: true,
            code,
            deviceId,
            deviceName: device.deviceName,
            expiresIn: 600
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  Parent App → Pair Device
// ═══════════════════════════════════════════════════════════
app.post('/api/device/pair', async (req, res) => {
    try {
        const { code, userId } = req.body;
        if (!code) return res.status(400).json({ error: 'code required' });

        const pairCode = await PairCode.findOne({ code });
        if (!pairCode) return res.status(404).json({ error: 'Invalid code' });
        if (pairCode.isUsed) return res.status(400).json({ error: 'Code used' });
        if (new Date() > pairCode.expiresAt) return res.status(400).json({ error: 'Code expired' });

        const device = await Device.findOne({ deviceId: pairCode.deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (device.isPaired) return res.status(400).json({ error: 'Already paired' });

        const deviceToken = crypto.randomBytes(32).toString('hex');
        device.isPaired = true;
        device.deviceToken = deviceToken;
        if (userId) device.userId = userId;
        await device.save();

        pairCode.isUsed = true;
        await pairCode.save();

        res.json({
            success: true,
            message: 'Device paired',
            device: { deviceId: device.deviceId, deviceName: device.deviceName },
            deviceToken
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  GET Device Status
// ═══════════════════════════════════════════════════════════
app.get('/api/device/status', async (req, res) => {
    try {
        const { deviceId } = req.query;
        if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        res.json({
            success: true,
            isPaired: device.isPaired,
            deviceToken: device.isPaired ? device.deviceToken : null,
            deviceName: device.deviceName,
            lastSeen: device.lastSeen,
            permissions: device.permissions || {}
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  List Paired Devices
// ═══════════════════════════════════════════════════════════
app.get('/api/device/list', async (req, res) => {
    try {
        const devices = await Device.find({ isPaired: true })
            .select('deviceId deviceName lastSeen isPaired createdAt permissions')
            .sort({ createdAt: -1 });
        res.json({ success: true, count: devices.length, devices });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  Refresh Pairing Code
// ═══════════════════════════════════════════════════════════
app.post('/api/device/refresh-code', async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (device.isPaired) return res.status(400).json({ error: 'Already paired' });

        await PairCode.deleteMany({ deviceId, isUsed: false });
        const code = await generateUniqueCode();

        await PairCode.create({
            code, deviceId, deviceName: device.deviceName,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        res.json({ success: true, code, deviceId, expiresIn: 600 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  Save FCM Token (UPSERT)
// ═══════════════════════════════════════════════════════════
app.post('/api/device/fcm-token', async (req, res) => {
    try {
        const { deviceId, fcmToken, deviceName } = req.body;
        if (!deviceId || !fcmToken) {
            return res.status(400).json({ error: 'deviceId and fcmToken required' });
        }

        const device = await Device.findOneAndUpdate(
            { deviceId },
            {
                $set: {
                    fcmToken: fcmToken,
                    lastSeen: new Date()
                },
                $setOnInsert: {
                    deviceName: deviceName || 'Unknown Device',
                    isPaired: false
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`✅ FCM token saved for device: ${deviceId}`);
        res.json({
            success: true,
            message: 'FCM token saved',
            deviceId: device.deviceId,
            isPaired: device.isPaired
        });
    } catch (err) {
        console.error('FCM token save error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  Heartbeat (HTTP)
// ═══════════════════════════════════════════════════════════
app.post('/api/device/heartbeat', deviceAuth, async (req, res) => {
    try {
        const { timestamp, appVersion, battery, isCharging, network, networkSpeed, permissions } = req.body;

        req.device.lastSeen = new Date();
        if (appVersion) req.device.appVersion = appVersion;
        if (battery !== undefined) req.device.batteryLevel = battery;
        if (isCharging !== undefined) req.device.isCharging = isCharging;
        if (permissions) req.device.permissions = permissions;
        await req.device.save();

        res.json({
            success: true,
            message: 'Heartbeat received',
            serverTime: new Date().toISOString(),
            receivedTimestamp: timestamp || Date.now()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ═══════════════════════════════════════════════════════════
//  DELETE Device by deviceId
// ═══════════════════════════════════════════════════════════
app.delete('/api/device/remove/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        console.log(`🗑️ DELETE /api/device/remove/${deviceId}`);

        if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

        let device = null;
        if (deviceId.match(/^[0-9a-fA-F]{24}$/)) {
            device = await Device.findById(deviceId);
        }
        if (!device) device = await Device.findOne({ deviceId });

        if (!device) return res.status(404).json({ error: 'Device not found' });

        const wsClient = activeSockets.get(device.deviceId);
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            try {
                wsClient.send(JSON.stringify({
                    type: 'command',
                    command: 'UNPAIR',
                    payload: {}
                }));
            } catch (_) {}
            activeSockets.delete(device.deviceId);
        }

        if (device.fcmToken) {
            try {
                await admin.messaging().send({
                    token: device.fcmToken,
                    data: { command: 'UNPAIR', timestamp: String(Date.now()) },
                    android: { priority: 'high' }
                });
            } catch (_) {}
        }

        await PairCode.deleteMany({ deviceId: device.deviceId });
        await Device.findByIdAndDelete(device._id);

        try {
            await ActivityLog.create({
                deviceId: device.deviceId,
                type: 'device_deleted',
                title: `Device deleted: ${device.deviceName}`,
                description: 'Parent ne device delete kiya',
                severity: 'info'
            });
        } catch (_) {}

        res.json({
            success: true,
            message: 'Device deleted successfully',
            deletedDeviceId: device.deviceId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  DELETE Single Device (Alternative)
// ═══════════════════════════════════════════════════════════
app.delete('/api/device/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        let device = null;
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            device = await Device.findById(id);
        }
        if (!device) device = await Device.findOne({ deviceId: id });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const wsClient = activeSockets.get(device.deviceId);
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            try {
                wsClient.send(JSON.stringify({
                    type: 'command',
                    command: 'UNPAIR',
                    payload: {}
                }));
            } catch (_) {}
            activeSockets.delete(device.deviceId);
        }

        if (device.fcmToken) {
            try {
                await admin.messaging().send({
                    token: device.fcmToken,
                    data: { command: 'UNPAIR', timestamp: String(Date.now()) },
                    android: { priority: 'high' }
                });
            } catch (_) {}
        }

        await PairCode.deleteMany({ deviceId: device.deviceId });
        await Device.findByIdAndDelete(device._id);

        res.json({
            success: true,
            message: 'Device deleted successfully',
            deletedDeviceId: device.deviceId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  DELETE Multiple Devices (Bulk)
// ═══════════════════════════════════════════════════════════
app.post('/api/device/delete-bulk', async (req, res) => {
    try {
        const { deviceIds } = req.body;
        if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
            return res.status(400).json({ error: 'deviceIds array required' });
        }

        let deletedCount = 0;
        const deletedIds = [];

        for (const id of deviceIds) {
            let device = null;
            if (id.match(/^[0-9a-fA-F]{24}$/)) {
                device = await Device.findById(id);
            }
            if (!device) device = await Device.findOne({ deviceId: id });
            if (!device) continue;

            const wsClient = activeSockets.get(device.deviceId);
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                try {
                    wsClient.send(JSON.stringify({
                        type: 'command',
                        command: 'UNPAIR',
                        payload: {}
                    }));
                } catch (_) {}
                activeSockets.delete(device.deviceId);
            }

            if (device.fcmToken) {
                try {
                    await admin.messaging().send({
                        token: device.fcmToken,
                        data: { command: 'UNPAIR' }
                    });
                } catch (_) {}
            }

            await PairCode.deleteMany({ deviceId: device.deviceId });
            await Device.findByIdAndDelete(device._id);
            deletedIds.push(device.deviceId);
            deletedCount++;
        }

        res.json({
            success: true,
            message: `${deletedCount} devices deleted`,
            deletedCount,
            deletedIds
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  DELETE by deviceId (Catch-all)
// ═══════════════════════════════════════════════════════════
app.delete('/api/device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        if (device.fcmToken) {
            try {
                await admin.messaging().send({
                    token: device.fcmToken,
                    data: { command: 'UNPAIR' }
                });
            } catch (_) {}
        }

        await PairCode.deleteMany({ deviceId });
        await Device.findByIdAndDelete(device._id);

        res.json({ success: true, message: 'Device deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  SEND COMMAND to Child Device
// ═══════════════════════════════════════════════════════════
app.post('/api/command/send', async (req, res) => {
    try {
        const { deviceId, command, payload } = req.body;
        if (!deviceId || !command) {
            return res.status(400).json({ error: 'deviceId and command required' });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        console.log(`📤 Command: ${command} → ${deviceId}`);

        // 1. Try WebSocket first
        const wsClient = activeSockets.get(deviceId);
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            try {
                const wsCommand = {
                    type: 'command',
                    command: String(command),
                    payload: payload || {}
                };
                wsClient.send(JSON.stringify(wsCommand));
                console.log(`✅ Command sent via WS: ${command}`);

                try {
                    await ActivityLog.create({
                        deviceId,
                        type: 'command_sent',
                        title: `Command sent (WS): ${command}`,
                        description: JSON.stringify(payload || {}),
                        severity: 'info',
                        metadata: { command, via: 'websocket' }
                    });
                } catch (_) {}

                return res.json({
                    success: true,
                    message: 'Command sent via WebSocket',
                    via: 'websocket'
                });
            } catch (e) {
                console.error('WS send failed:', e.message);
            }
        }

        // 2. FCM fallback
        if (device.fcmToken) {
            const message = {
                token: device.fcmToken,
                data: {
                    command: String(command),
                    ...(payload ? Object.fromEntries(
                        Object.entries(payload).map(([k, v]) => [k, String(v)])
                    ) : {})
                },
                android: { priority: 'high', ttl: 60 * 1000 }
            };

            const response = await admin.messaging().send(message);
            console.log(`✅ Command sent via FCM: ${command}`);

            return res.json({
                success: true,
                message: 'Command sent via FCM',
                via: 'fcm',
                fcmResponseId: response
            });
        }

        res.status(404).json({
            success: false,
            error: 'Device offline (WS disconnected & no FCM token)'
        });

    } catch (err) {
        console.error('Command send error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  SET / TOGGLE PERMISSION
// ═══════════════════════════════════════════════════════════
app.post('/api/device/set-permission', async (req, res) => {
    try {
        const { deviceId, permission, enabled } = req.body;
        if (!deviceId || !permission) return res.status(400).json({ error: 'deviceId and permission required' });

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const wsClient = activeSockets.get(deviceId);
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(JSON.stringify({
                type: "command",
                command: "SET_PERMISSION",
                payload: {
                    permission: permission,
                    enabled: String(enabled)
                }
            }));
            return res.json({ success: true, message: `Command sent via WS` });
        }

        if (device.fcmToken) {
            await admin.messaging().send({
                token: device.fcmToken,
                data: {
                    command: 'SET_PERMISSION',
                    permission: String(permission),
                    enabled: String(enabled)
                },
                android: { priority: 'high', ttl: 60 * 1000 }
            });
            return res.json({ success: true, message: 'Permission command sent via FCM' });
        }

        res.status(404).json({ success: false, message: "Device is offline" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  GRANT ALL VIA SHIZUKU
// ═══════════════════════════════════════════════════════════
app.post('/api/command/grant-all', async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (!device.fcmToken) return res.status(400).json({ error: 'Device has no FCM token' });

        const message = {
            token: device.fcmToken,
            data: {
                command: 'GRANT_ALL_VIA_SHIZUKU',
                timestamp: String(Date.now())
            },
            android: { priority: 'high', ttl: 60 * 1000 }
        };

        const response = await admin.messaging().send(message);

        res.json({
            success: true,
            message: 'Grant command sent',
            fcmResponseId: response
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  Command Acknowledgment
// ═══════════════════════════════════════════════════════════
app.post('/api/command/ack', deviceAuth, async (req, res) => {
    try {
        const { command, status, message, timestamp } = req.body;
        if (!command) return res.status(400).json({ error: 'command required' });

        await ActivityLog.create({
            deviceId: req.deviceId,
            type: 'command_executed',
            title: `Command ${status}: ${command}`,
            description: message || '',
            severity: status === 'success' ? 'info' : 'warning',
            metadata: { command, status, clientTimestamp: timestamp }
        });

        res.json({ success: true, message: 'ACK received' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  Activity Log
// ═══════════════════════════════════════════════════════════
app.post('/api/activity/save', deviceAuth, async (req, res) => {
    try {
        const { type, title, description, severity, metadata, timestamp } = req.body;
        if (!type || !title) return res.status(400).json({ error: 'type and title required' });

        const log = await ActivityLog.create({
            deviceId: req.deviceId,
            type,
            title,
            description: description || '',
            severity: severity || 'info',
            metadata: metadata || {},
            timestamp: timestamp ? new Date(timestamp) : new Date()
        });

        res.json({ success: true, message: 'Activity logged', id: log._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  Media Upload
// ═══════════════════════════════════════════════════════════
app.post('/api/upload', uploadLimiter, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' });

        const { deviceId, mediaType } = req.body;
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'parental_control_media', resource_type: 'auto' },
            async (error, result) => {
                if (error) return res.status(500).json({ error: error.message });

                await Media.create({
                    deviceId: deviceId || 'unknown',
                    fileUrl: result.secure_url,
                    publicId: result.public_id,
                    mediaType: mediaType || 'image'
                });

                res.json({ success: true, url: result.secure_url });
            }
        );
        uploadStream.end(req.file.buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ═══════════════════════════════════════════════════════════
//  WEBSOCKET — ✅ ACTIVE SOCKETS + PARENT COMMANDS + VIDEO RELAY
//  ✅ FIXED: Map delete bug (only delete if THIS socket is current)
// ═══════════════════════════════════════════════════════════
wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const deviceId = parsedUrl.query.deviceId;
    const role = parsedUrl.query.role;

    if (role === 'parent') {
        parentClients.add(ws);
        console.log('📱 Parent dashboard connected via WebSocket');
    } else if (deviceId) {
        activeSockets.set(deviceId, ws);
        console.log(`🔌 WS client connected for device: ${deviceId}`);
    } else {
        console.log('🔌 WS client connected (no deviceId)');
    }

    ws.on('message', async (msg) => {
        try {
            const data = JSON.parse(msg.toString());

            // 🎥 LIVE VIDEO STREAMING RELAY
            if (data.type === 'camera_frame' || data.type === 'screen_frame') {
                parentClients.forEach(parentWs => {
                    if (parentWs.readyState === WebSocket.OPEN) {
                        parentWs.send(JSON.stringify(data));
                    }
                });
                return;
            }

            // ✅ Parent command → child
            if (data.type === 'send_command' && data.targetDeviceId && data.command) {
                const targetWs = activeSockets.get(data.targetDeviceId);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify({
                        type: 'command',
                        command: data.command,
                        payload: data.payload || {}
                    }));
                    console.log(`📤 Parent → Device command: ${data.command} → ${data.targetDeviceId}`);
                    ws.send(JSON.stringify({ status: 'sent', command: data.command }));
                } else {
                    const device = await Device.findOne({ deviceId: data.targetDeviceId });
                    if (device && device.fcmToken) {
                        try {
                            await admin.messaging().send({
                                token: device.fcmToken,
                                data: {
                                    command: String(data.command),
                                    ...(data.payload ? Object.fromEntries(
                                        Object.entries(data.payload).map(([k, v]) => [k, String(v)])
                                    ) : {})
                                },
                                android: { priority: 'high' }
                            });
                            ws.send(JSON.stringify({ status: 'sent_via_fcm', command: data.command }));
                        } catch (e) {
                            ws.send(JSON.stringify({ status: 'error', error: e.message }));
                        }
                    } else {
                        ws.send(JSON.stringify({ status: 'device_offline' }));
                    }
                }
                return;
            }

            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                return;
            }

            if (data.type === 'hello') {
                ws.send(JSON.stringify({
                    type: 'welcome',
                    serverTime: Date.now(),
                    deviceId: data.deviceId
                }));
                return;
            }

            if (data.type === 'protection_status') {
                if (data.deviceId && data.permissions) {
                    try {
                        await Device.findOneAndUpdate(
                            { deviceId: data.deviceId },
                            {
                                $set: {
                                    permissions: data.permissions,
                                    lastSeen: new Date()
                                }
                            },
                            { upsert: true }
                        );
                        console.log(`🛡️ Protection status updated: ${data.deviceId}`);
                    } catch (e) {
                        console.error('Protection update failed:', e.message);
                    }
                }
                ws.send(JSON.stringify({ status: 'received', type: 'protection_status' }));
                return;
            }

            if (data.type === 'heartbeat') {
                if (data.deviceId) {
                    try {
                        const device = await Device.findOne({ deviceId: data.deviceId });
                        if (device) {
                            device.lastSeen = new Date();
                            if (data.battery !== undefined) device.batteryLevel = data.battery;
                            if (data.isCharging !== undefined) device.isCharging = data.isCharging;
                            if (data.permissions) device.permissions = data.permissions;
                            await device.save();
                        }
                    } catch (e) {
                        console.error('Heartbeat update failed:', e.message);
                    }
                }
                ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
                return;
            }

            if (data.type === 'quality_update') {
                ws.send(JSON.stringify({ type: 'quality_ack', quality: data.quality }));
                return;
            }

            if (data.type === 'location') {
                console.log('📍 Location from:', data.deviceId || 'unknown');
                ws.send(JSON.stringify({ status: 'received', type: 'location' }));
                return;
            }

            if (data.type === 'activity') {
                ws.send(JSON.stringify({ status: 'received', type: 'activity' }));
                return;
            }

            if (data.type === 'stream_status') {
                console.log(`📺 Stream: ${data.streamType} - active: ${data.isActive}`);
                ws.send(JSON.stringify({ status: 'received', type: 'stream_status' }));
                return;
            }

            ws.send(JSON.stringify({ status: 'received', type: data.type }));
        } catch (e) {
            ws.send(JSON.stringify({ status: 'error', error: e.message }));
        }
    });

    // ═══════════════════════════════════════════════════════════
    //  ✅ FIXED: Only delete from map if THIS socket is current
    // ═══════════════════════════════════════════════════════════
    ws.on('close', () => {
        parentClients.delete(ws);

        if (deviceId && activeSockets.get(deviceId) === ws) {
            // This socket is the current one — safe to delete
            activeSockets.delete(deviceId);
            console.log(`🔴 WS disconnected: ${deviceId}`);
        } else if (deviceId) {
            // A newer socket already replaced this one — don't delete
            console.log(`ℹ️ Stale WS close (ignored): ${deviceId}`);
        } else {
            console.log(`🔴 WS disconnected (parent or unknown)`);
        }
    });

    ws.on('error', (err) => {
        parentClients.delete(ws);

        if (deviceId && activeSockets.get(deviceId) === ws) {
            activeSockets.delete(deviceId);
        }
        console.error('WS error:', err.message);
    });
});
// ═══════════════════════════════════════════════════════════
//  PARENT REMINDER CRON JOB
// ═══════════════════════════════════════════════════════════
const OFFLINE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

async function checkOfflineDevices() {
    try {
        console.log('🔍 Checking offline devices...');

        const devices = await Device.find({ isPaired: true });
        const now = Date.now();

        for (const device of devices) {
            if (!device.lastSeen) continue;

            const timeSince = now - new Date(device.lastSeen).getTime();

            if (timeSince > OFFLINE_THRESHOLD_MS) {
                console.log(`⚠️ Device offline: ${device.deviceName} (${Math.round(timeSince / 60000)} min)`);

                if (device.userId) {
                    const user = await User.findById(device.userId);
                    if (user && user.fcmToken) {
                        try {
                            await admin.messaging().send({
                                token: user.fcmToken,
                                notification: {
                                    title: '⚠️ Child device offline',
                                    body: `${device.deviceName || 'Device'} offline hai.`
                                },
                                data: {
                                    type: 'offline_alert',
                                    deviceId: device.deviceId,
                                    deviceName: device.deviceName || 'Device',
                                    lastSeen: device.lastSeen.toString()
                                },
                                android: { priority: 'high' }
                            });
                            console.log(`✅ Parent notified for ${device.deviceId}`);
                        } catch (e) {
                            console.error('FCM notify failed:', e.message);
                        }
                    }
                }
            }
        }

        console.log('🔍 Offline check done');
    } catch (err) {
        console.error('checkOfflineDevices error:', err.message);
    }
}

// Every 30 min
setInterval(checkOfflineDevices, 30 * 60 * 1000);

// Run once on startup (30 sec delay)
setTimeout(checkOfflineDevices, 30 * 1000);

// ═══════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
