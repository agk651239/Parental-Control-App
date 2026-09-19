const express = require('express');
const http = require('http');
const WebSocket = require('ws');
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

// ═══════════════════════════════════════════════════════════
//  ✅ RENDER KE LIYE TRUST PROXY (NAYA)
// ═══════════════════════════════════════════════════════════
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
            device = new Device({ deviceId, deviceName: deviceName || 'Unknown Device' });
            await device.save();
        }
        if (device.isPaired) return res.status(400).json({ error: 'Already paired', isPaired: true });

        await PairCode.deleteMany({ deviceId, isUsed: false });
        const code = await generateUniqueCode();

        await PairCode.create({
            code, deviceId, deviceName: device.deviceName,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        res.json({ success: true, code, deviceId, deviceName: device.deviceName, expiresIn: 600 });
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
            lastSeen: device.lastSeen
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
            .select('deviceId deviceName lastSeen isPaired createdAt')
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
//  Save FCM Token
// ═══════════════════════════════════════════════════════════
app.post('/api/device/fcm-token', async (req, res) => {
    try {
        const { deviceId, fcmToken } = req.body;
        if (!deviceId || !fcmToken) return res.status(400).json({ error: 'deviceId and fcmToken required' });

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        device.fcmToken = fcmToken;
        device.lastSeen = new Date();
        await device.save();

        res.json({ success: true, message: 'FCM token saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  Heartbeat
// ═══════════════════════════════════════════════════════════
app.post('/api/device/heartbeat', deviceAuth, async (req, res) => {
    try {
        const { timestamp, appVersion } = req.body;

        req.device.lastSeen = new Date();
        if (appVersion) req.device.appVersion = appVersion;
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
//  SEND COMMAND to Child Device (FCM)
// ═══════════════════════════════════════════════════════════
app.post('/api/command/send', async (req, res) => {
    try {
        const { deviceId, command, payload } = req.body;
        if (!deviceId || !command) return res.status(400).json({ error: 'deviceId and command required' });

        const device = await Device.findOne({ deviceId });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (!device.fcmToken) return res.status(400).json({ error: 'Device has no FCM token yet' });

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

        try {
            await ActivityLog.create({
                deviceId,
                type: 'command_sent',
                title: `Command sent: ${command}`,
                description: JSON.stringify(payload || {}),
                severity: 'info',
                metadata: { command }
            });
        } catch (_) {}

        res.json({ success: true, message: 'Command sent', fcmResponseId: response });
    } catch (err) {
        console.error('Command send error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ✅ GRANT ALL VIA SHIZUKU (Remote)
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

        try {
            await ActivityLog.create({
                deviceId,
                type: 'command_sent',
                title: 'Grant all permissions requested',
                description: 'Via Shizuku',
                severity: 'info'
            });
        } catch (_) {}

        res.json({
            success: true,
            message: 'Grant command sent',
            fcmResponseId: response
        });
    } catch (err) {
        console.error('Grant all error:', err);
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
            metadata: {
                command,
                status,
                clientTimestamp: timestamp
            }
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
//  WEBSOCKET
// ═══════════════════════════════════════════════════════════
wss.on('connection', (ws) => {
    console.log('WS client connected');

    ws.on('message', async (msg) => {
        try {
            const data = JSON.parse(msg.toString());

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

            if (data.type === 'quality_update') {
                console.log('Quality update:', data.quality, '— speed:', data.networkSpeed);
                ws.send(JSON.stringify({ type: 'quality_ack', quality: data.quality }));
                return;
            }

            ws.send(JSON.stringify({ status: 'received', type: data.type }));
        } catch (e) {
            ws.send(JSON.stringify({ status: 'error', error: e.message }));
        }
    });

    ws.on('close', () => console.log('WS client disconnected'));
    ws.on('error', (err) => console.error('WS error:', err.message));
});

// ═══════════════════════════════════════════════════════════
//  🆕 PARENT REMINDER CRON JOB
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

                // Find parent (user)
                if (device.userId) {
                    const user = await User.findById(device.userId);
                    if (user && user.fcmToken) {
                        try {
                            await admin.messaging().send({
                                token: user.fcmToken,
                                notification: {
                                    title: '⚠️ Child device offline',
                                    body: `${device.deviceName || 'Device'} offline hai. Auto-start permission check karo.`
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
