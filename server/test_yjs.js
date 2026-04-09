const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');

// Polyfill WebSocket for node
global.WebSocket = WebSocket;

async function testConnection() {
    console.log("Starting Yjs connection test...");

    // We need a valid token. Since we don't have one easily available from the backend,
    // let's just make a raw WebSocket connection first to see the rejection reason.
    const ws = new WebSocket('ws://localhost:8080/ws/collab/default');

    ws.on('open', () => {
        console.log("Raw WS Connected successfully!");
        ws.close();
    });

    ws.on('error', (err) => {
        console.error("Raw WS Error:", err.message);
    });

    ws.on('unexpected-response', (request, response) => {
        console.error("Raw WS Unexpected Response:", response.statusCode, response.statusMessage);
    });
}

testConnection();
