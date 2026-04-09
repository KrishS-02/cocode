import { API_BASE_URL } from '../config';
import React, { useState, useEffect, useRef } from 'react';

import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { Users, UserPlus, X } from 'lucide-react';
import AddMemberModal from './AddMemberModal';

interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: string;
}

interface GroupChatWidgetProps {
    groupId: string;
    groupName: string;
    onClose: () => void;
}

export default function GroupChatWidget({ groupId, groupName, onClose }: GroupChatWidgetProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const { isConnected, sendMessage, subscribe } = useWebSocket();
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load history
    useEffect(() => {
        console.log(`[GroupChat] Loading history for group ${groupId}`);
        const fetchHistory = async () => {
            const userToken = localStorage.getItem('token');
            try {
                const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/messages`, {
                    headers: { Authorization: `Bearer ${userToken}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    console.log(`[GroupChat] Loaded ${data.length} messages`);
                    const mapped: ChatMessage[] = data.map((m: any) => ({
                        id: m.id,
                        senderId: m.sender ? m.sender.id : m.senderId,
                        senderName: m.sender ? m.sender.username : (m.senderName || 'Unknown'),
                        content: m.content,
                        timestamp: m.timestamp
                    }));
                    setMessages(mapped);
                    scrollToBottom();
                } else {
                    console.error("[GroupChat] Failed to load history:", res.status, res.statusText);
                }
            } catch (err) {
                console.error("[GroupChat] Failed to load history", err);
            }
        };
        fetchHistory();
    }, [groupId]);

    // WebSocket connection
    useEffect(() => {
        const unsubscribe = subscribe((data: any) => {
            if (data.type === 'GROUP_CHAT' && data.groupId === groupId) {
                console.log("[GroupChat] Processing group message");
                setMessages((prev) => [...prev, data]);
                scrollToBottom();
            } else if (data.type === 'ERROR') {
                console.error("[GroupChat] Server Error:", data.message);
                // Optionally show a toast or alert here
                alert(`Error: ${data.message}`);
            } else {
                console.log(`[GroupChat] Ignored message type: ${data.type}`);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [groupId, subscribe]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;

        const msgPayload = {
            groupId: groupId,
            content: newMessage
        };

        try {
            console.log("[GroupChat] Sending:", msgPayload);
            sendMessage(msgPayload);
            console.log("[GroupChat] Sent.");
            setNewMessage('');
        } catch (err) {
            console.error("[GroupChat] Send error", err);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div className="fixed bottom-4 right-96 w-96 bg-slate-900 rounded-t-lg shadow-2xl border border-slate-700 flex flex-col h-[500px] z-50 animate-slide-up">
            <div className="bg-slate-800 text-white p-3 rounded-t-lg flex justify-between items-center border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Users size={20} className="text-emerald-400" />
                        <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-800 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                    </div>
                    <div>
                        <span className="font-semibold tracking-wide block leading-tight">{groupName}</span>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Group Chat</span>
                            {!isConnected && <span className="text-[10px] text-red-400 font-bold">(Offline)</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowAddMemberModal(true)}
                        className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-700 rounded transition-colors"
                        title="Add Members"
                    >
                        <UserPlus size={16} />
                    </button>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-700 rounded transition-colors">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {showAddMemberModal && (
                <AddMemberModal
                    groupId={groupId}
                    groupName={groupName}
                    onClose={() => setShowAddMemberModal(false)}
                />
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/50">
                {messages.map((msg) => {
                    const isMe = msg.senderId === user?.id;
                    return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {!isMe && (
                                <span className="text-xs text-slate-500 mb-1 ml-1">{msg.senderName}</span>
                            )}
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-md ${isMe
                                ? 'bg-indigo-600 text-white rounded-br-none'
                                : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                                }`}>
                                {msg.content}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-slate-700 bg-slate-800 rounded-b-lg flex gap-2">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isConnected ? "Message group..." : "Connecting..."}
                    disabled={!isConnected}
                    className="flex-1 bg-slate-950 border border-slate-600 rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-500 disabled:opacity-50"
                />
                <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!isConnected}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Send
                </button>
            </div>
        </div>
    );
}
