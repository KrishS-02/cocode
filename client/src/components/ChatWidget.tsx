import { API_BASE_URL } from '../config';
import { useState, useEffect, useRef } from 'react';

import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';

interface ChatMessage {
    id: string;
    senderId: string;
    content: string;
    timestamp: string;
}

interface ChatWidgetProps {
    friendId: string;
    friendName: string;
    onClose: () => void;
}

export default function ChatWidget({ friendId, friendName, onClose }: ChatWidgetProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const { isConnected, sendMessage, subscribe } = useWebSocket();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load history
    useEffect(() => {
        const fetchHistory = async () => {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${API_BASE_URL}/api/chat/${friendId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    // Map backend simplified or full object to local interface
                    // Backend ChatMessage has sender: User.
                    const mapped = data.map((m: any) => ({
                        id: m.id,
                        senderId: m.sender.id,
                        content: m.content,
                        timestamp: m.timestamp
                    }));
                    setMessages(mapped);
                    scrollToBottom();
                }
            } catch (err) {
                console.error("Failed to load history", err);
            }
        };
        fetchHistory();
    }, [friendId]);

    // WebSocket connection
    useEffect(() => {
        const unsubscribe = subscribe((data: any) => {
            // Check if message is from current friend
            if (data.senderId === friendId || data.senderId === user?.id) {
                setMessages((prev) => {
                    // Deduplicate identical messages from WebSocket rebroadcasts
                    if (prev.some(m => m.id === data.id)) return prev;
                    return [...prev, data];
                });
                scrollToBottom();
            }
        });

        return () => {
            unsubscribe();
        };
    }, [friendId, user, subscribe]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const msg = {
            receiverId: friendId,
            content: newMessage
        };

        sendMessage(msg);

        // The server will echo the message back via WebSocket, so we don't
        // append optimistically here, preventing duplicates.
        setNewMessage('');
        // No manual scrollToBottom needed here, the websocket listener handles it
    };

    return (
        <div className="fixed bottom-4 right-4 w-80 bg-slate-900 rounded-t-lg shadow-2xl border border-slate-700 flex flex-col h-96 z-50">
            <div className="bg-slate-800 text-white p-3 rounded-t-lg flex justify-between items-center border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></span>
                    <span className="font-semibold tracking-wide">{friendName}</span>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/50">
                {messages.map((msg) => {
                    const isMe = msg.senderId === user?.id; // Assuming user?.id is available and correct type
                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-md ${isMe
                                ? 'bg-indigo-600 text-white rounded-br-none'
                                : 'bg-slate-700 text-slate-100 rounded-bl-none'
                                }`}>
                                {msg.content}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-700 bg-slate-800 rounded-b-lg flex gap-2">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-slate-950 border border-slate-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-500"
                />
                <button
                    type="submit"
                    disabled={!isConnected}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Send
                </button>
            </form>
        </div>
    );
}
