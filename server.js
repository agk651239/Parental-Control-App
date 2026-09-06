const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// चेक करने के लिए कि सर्वर चल रहा है या नहीं
app.get('/', (req, res) => {
    sendResponse = { status: 'Watcher Backend Server is running successfully!' };
    res.json(sendResponse);
});

// WebSocket कनेक्शन हैंडल करना (लोकेशन, स्क्रीन या कमांड के लिए)
wss.on('connection', (ws) => {
    console.log('A new client connected.');

    ws.on('message', (message) => {
        console.log('Received:', message.toString());
        // यहाँ आने वाले डेटा को ब्रॉडकास्ट या प्रोसेस किया जा सकता है
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

