import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8080/ws/collab/test-room');

ws.on('open', function open() {
    console.log('Connected to WebSocket!');
    ws.send('Hello Server!');
    ws.close();
});

ws.on('error', function error(err) {
    console.error('WebSocket Error:', err);
});

ws.on('close', function close(code, reason) {
    console.log('Disconnected', code, reason.toString());
});
