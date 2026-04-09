import { WS_BASE_URL } from '../config';
import React, { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

import { useAuth } from './AuthContext';

interface WebSocketContextType {
    isConnected: boolean;
    sendMessage: (data: any) => void;
    subscribe: (callback: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, token } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const subscribersRef = useRef<Set<(data: any) => void>>(new Set());
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Use user.id to avoid reconnects on object reference change
    const userId = user?.id;

    useEffect(() => {
        if (!userId || !token) return;

        const connect = () => {
            if (socketRef.current?.readyState === WebSocket.OPEN) return;

            if (!token) {
                console.error('[WSContext] Token is missing, cannot connect');
                return;
            }
            console.log(`[WSContext] Connecting as ${userId} with token length: ${token.length}`);
            const ws = new WebSocket(`${WS_BASE_URL}/ws/chat?userId=${userId}&token=${token}`);
            socketRef.current = ws;

            ws.onopen = () => {
                console.log('[WSContext] Connected');
                setIsConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[WSContext] Received:', data);
                    // Notify all subscribers
                    subscribersRef.current.forEach(callback => callback(data));
                } catch (e) {
                    console.error('[WSContext] Parse error:', e);
                }
            };

            ws.onclose = (event) => {
                console.log(`[WSContext] Closed (Code: ${event.code})`);
                setIsConnected(false);
                socketRef.current = null;

                // Automatic reconnect
                if (event.code !== 1000) { // If not normal closure
                    console.log('[WSContext] Reconnecting in 3s...');
                    reconnectTimeoutRef.current = setTimeout(connect, 3000);
                }
            };

            ws.onerror = (error) => {
                console.error('[WSContext] Error:', error);
                ws.close();
            };
        };

        connect();

        return () => {
            console.log('[WSContext] Cleanup');
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, [userId, token]);

    const sendMessage = useCallback((data: any) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(data));
        } else {
            console.warn('[WSContext] Cannot send, socket not open');
        }
    }, []);

    const subscribe = useCallback((callback: (data: any) => void) => {
        subscribersRef.current.add(callback);
        return () => {
            subscribersRef.current.delete(callback);
        };
    }, []);

    return (
        <WebSocketContext.Provider value={{ isConnected, sendMessage, subscribe }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (context === undefined) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
};
