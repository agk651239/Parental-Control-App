const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const Media = require('./models/Media');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB Atlas Connection (Cleaned up to avoid warnings)
mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log('MongoDB Atlas Connected Successfully');
}).catch((err) => {
    console.error('MongoDB Connection Error:', err);
});

// Multer temporary storage configuration
const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (req, res) => {
    res.json({ status: 'Watcher Backend Server is running successfully!' });
});

// Media Upload Route
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
