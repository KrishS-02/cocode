import { WebSocketServer } from 'ws';
import * as ywsUtils from 'y-websocket/bin/utils.js';

const setupWSConnection = ywsUtils.setupWSConnection;

const wss = new WebSocketServer({ port: 1234 });

wss.on('connection', (conn, req) => {
    setupWSConnection(conn, req, { gc: true });
});

console.log('Yjs WebSocket server running on ws://localhost:1234');
