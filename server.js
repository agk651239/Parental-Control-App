const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Models
const Media = require('./models/Media');
const Device = require('./models/Device');
const PairCode = require('./models/PairCode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

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
    .then(() => console.log('MongoDB Atlas Connected Successfully'))
    .catch((err) => console.error('MongoDB Connection Error:', err));

// Multer for media uploads
const upload = multer({ storage: multer.memoryStorage() });

// ═══════════════════════════════════════════════════════════
//  HELPER: Generate 6-digit code (unique)
// ═══════════════════════════════════════════════════════════
async function generateUniqueCode() {
    let code;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 10) {
        code = Math.floor(100000 + Math.random() * 900000).toString();

        // Check if code already exists (used or not)
        const existing = await PairCode.findOne({ code });
        if (!existing) {
            exists = false;
        }
        attempts++;
    }

    if (exists) {
        throw new Error('Could not generate unique code');
    }

    return code;
}

// ═══════════════════════════════════════════════════════════
//  ROUTE: Health Check
// ═══════════════════════════════════════════════════════════
app.get('/', (req, res) => {
    res.json({ status: 'Watcher Backend Server is running successfully!' });
});

// ═══════════════════════════════════════════════════════════
//  ROUTE 1: Child App → Generate Pairing Code
//  POST /api/device/request-code
//  Body: { deviceId, deviceName }
// ═══════════════════════════════════════════════════════════
app.post('/api/device/request-code', async (req, res) => {
    try {
        const { deviceId, deviceName } = req.body;

        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }

        // Check if device already exists
        let device = await Device.findOne({ deviceId });

        if (!device) {
            // Naya device register karo
            device = new Device({
                deviceId,
                deviceName: deviceName || 'Unknown Device'
            });
            await device.save();
            console.log(`New device registered: ${deviceId}`);
        }

        // ⚠️ Agar device already paired hai → naya code mat do
        if (device.isPaired) {
            return res.status(400).json({
                error: 'Device already paired',
                isPaired: true
            });
        }

        // Purane un-used codes delete karo iss device ke liye
        await PairCode.deleteMany({ deviceId, isUsed: false });

        // Naya unique code generate karo
        const code = await generateUniqueCode();

        // Naya code save karo (10 min expiry)
        const pairCode = new PairCode({
            code,
            deviceId,
            deviceName: device.deviceName,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min
        });
        await pairCode.save();

        console.log(`Code generated for ${deviceId}: ${code}`);

        res.json({
            success: true,
            code,
            deviceId,
            deviceName: device.deviceName,
            expiresIn: 600 // seconds
        });

    } catch (err) {
        console.error('request-code error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ROUTE 2: Parent App → Verify Code & Pair
//  POST /api/device/pair
//  Body: { code }
// ═══════════════════════════════════════════════════════════
app.post('/api/device/pair', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'code is required' });
        }

        // Find valid code
        const pairCode = await PairCode.findOne({ code });

        if (!pairCode) {
            return res.status(404).json({ error: 'Invalid code' });
        }

        if (pairCode.isUsed) {
            return res.status(400).json({ error: 'Code already used' });
        }

        if (new Date() > pairCode.expiresAt) {
            return res.status(400).json({ error: 'Code expired' });
        }

        // Find the device linked to this code
        const device = await Device.findOne({ deviceId: pairCode.deviceId });

        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        if (device.isPaired) {
            return res.status(400).json({ error: 'Device already paired' });
        }

        // Generate device token (permanent)
        const crypto = require('crypto');
        const deviceToken = crypto.randomBytes(32).toString('hex');

        // Update device — mark as paired
        device.isPaired = true;
        device.deviceToken = deviceToken;
        // Note: userId baad mein add karenge jab parent auth system aayega
        // device.userId = req.user._id; 
        await device.save();

        // Mark code as used
        pairCode.isUsed = true;
        await pairCode.save();

        console.log(`Device paired: ${device.deviceId}`);

        res.json({
            success: true,
            message: 'Device paired successfully',
            device: {
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                isPaired: device.isPaired
            },
            deviceToken
        });

    } catch (err) {
        console.error('pair error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ROUTE 3: Parent App → Get all paired devices
//  GET /api/device/list
// ═══════════════════════════════════════════════════════════
app.get('/api/device/list', async (req, res) => {
    try {
        const devices = await Device.find({ isPaired: true })
            .select('deviceId deviceName lastSeen isPaired createdAt')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: devices.length,
            devices
        });

    } catch (err) {
        console.error('list error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  ROUTE 4: Parent App → Refresh Pairing Code
//  POST /api/device/refresh-code
//  Body: { deviceId }
// ═══════════════════════════════════════════════════════════
app.post('/api/device/refresh-code', async (req, res) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }

        const device = await Device.findOne({ deviceId });

        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        if (device.isPaired) {
            return res.status(400).json({
                error: 'Device already paired. Unpair first.'
            });
        }

        // Delete old unused codes
        await PairCode.deleteMany({ deviceId, isUsed: false });

        // Generate fresh code
        const code = await generateUniqueCode();

        const pairCode = new PairCode({
            code,
            deviceId,
            deviceName: device.deviceName,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });
        await pairCode.save();

        console.log(`Code refreshed for ${deviceId}: ${code}`);

        res.json({
            success: true,
            code,
            deviceId,
            expiresIn: 600
        });

    } catch (err) {
        console.error('refresh-code error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
//  MEDIA UPLOAD (existing)
// ═══════════════════════════════════════════════════════════
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { deviceId, mediaType } = req.body;

        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'parental_control_media', resource_type: 'auto' },
            async (error, result) => {
                if (error) {
                    return res.status(500).json({ error: error.message });
                }

                const newMedia = new Media({
                    deviceId: deviceId || 'unknown_device',
                    fileUrl: result.secure_url,
                    publicId: result.public_id,
                    mediaType: mediaType || 'image'
                });

                await newMedia.save();

                res.status(200).json({
                    success: true,
                    message: 'File uploaded successfully',
                    url: result.secure_url
                });
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
    console.log('A new client connected.');

    ws.on('message', (message) => {
        console.log('Received:', message.toString());
        ws.send(JSON.stringify({ status: 'Message received by server' }));
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
    });
});

// ═══════════════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════════════
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
