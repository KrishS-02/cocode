/**
 * Central API configuration.
 * In production (Render), VITE_API_BASE_URL is set as an environment variable.
 * Locally it falls back to localhost:8080.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ||
    (import.meta.env.VITE_API_BASE_URL
        ? import.meta.env.VITE_API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')
        : 'ws://localhost:8080');

/**
 * Yjs / Hocuspocus WebSocket server URL.
 * In production, set VITE_YJS_WS_URL to the deployed Hocuspocus service URL, e.g. wss://your-yjs-server.onrender.com
 * Locally it falls back to ws://localhost:1234.
 */
const rawYjsUrl = import.meta.env.VITE_YJS_WS_URL;
export const YJS_WS_URL = rawYjsUrl
    ? (rawYjsUrl.startsWith('ws') ? rawYjsUrl : `wss://${rawYjsUrl}`)
    : 'ws://localhost:1234';
