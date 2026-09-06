const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors'); // CORS इम्पोर्ट करें

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors()); // CORS को सभी ओरिजिन के लिए चालू करें
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: 'Watcher Backend Server is running successfully!' });
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

