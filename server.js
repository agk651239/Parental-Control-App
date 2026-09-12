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

// ═══════════════════════════════════════════════════════════
//  NEW ROUTES (modular)
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
        res.json({ success: true, message: 'Command sent', fcmResponseId: response });
    } catch (err) {
        console.error('Command send error:', err);
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
    ws.on('message', (msg) => {
        console.log('WS:', msg.toString());
        ws.send(JSON.stringify({ status: 'received' }));
    });
    ws.on('close', () => console.log('WS client disconnected'));
});

// ═══════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
