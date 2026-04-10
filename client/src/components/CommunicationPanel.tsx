// @ts-nocheck
import { WS_BASE_URL } from '../config';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import SimplePeer from 'simple-peer';
import { Mic, MicOff, Send, Users, MessageSquare, X, Radio } from 'lucide-react';
// @ts-ignore
import * as process from 'process';
import { Buffer } from 'buffer';

// Polyfill for simple-peer in Vite/Modern Bundlers
if (typeof window !== 'undefined') {
    window.global = window;
    window.process = { ...process, nextTick: (cb: any) => setTimeout(cb, 0) };
    window.Buffer = Buffer;
}

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
    ]
};

interface CommunicationPanelProps {
    environmentId: string;
    user: any;
    token: string;
    isOpen: boolean;
    onClose: () => void;
}

interface PeerEntry {
    sessionId: string;
    username: string;
    peer: SimplePeer.Instance;
}

interface VoiceUser {
    sessionId: string;
    username: string;
}

interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: string;
}

const CommunicationPanel: React.FC<CommunicationPanelProps> = ({ environmentId, user, token, isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'chat'>('users');
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [wsStatus, setWsStatus] = useState<'CONNECTING' | 'OPEN' | 'CLOSED'>('CONNECTING');
    const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>([]);
    const [audioStreams, setAudioStreams] = useState<{ id: string, stream: MediaStream }[]>([]);

    // Refs
    const wsRef = useRef<WebSocket | null>(null);
    const peersRef = useRef<PeerEntry[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const mySessionIdRef = useRef<string | null>(null);
    const isVoiceActiveRef = useRef(false);

    useEffect(() => {
        isVoiceActiveRef.current = isVoiceActive;
    }, [isVoiceActive]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, activeTab]);

    // Peer Management Helpers
    const removePeer = useCallback((sessionId: string) => {
        const entry = peersRef.current.find(p => p.sessionId === sessionId);
        if (entry) {
            entry.peer.destroy();
            peersRef.current = peersRef.current.filter(p => p.sessionId !== sessionId);
        }
        setVoiceUsers(prev => prev.filter(u => u.sessionId !== sessionId));
        setAudioStreams(prev => prev.filter(s => s.id !== sessionId));
    }, []);

    const createPeer = (targetSessionId: string, stream: MediaStream): SimplePeer.Instance => {
        const peer = new SimplePeer({ initiator: true, trickle: true, config: ICE_SERVERS, stream });
        peer.on('signal', (data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'SIGNAL',
                    targetId: targetSessionId,
                    senderName: user.username,
                    data
                }));
            }
        });
        peer.on('stream', (remoteStream) => {
            setAudioStreams(prev => [...prev.filter(s => s.id !== targetSessionId), { id: targetSessionId, stream: remoteStream }]);
        });
        peer.on('close', () => removePeer(targetSessionId));
        peer.on('error', (err) => {
            console.error('[Voice] Peer error:', targetSessionId, err);
            removePeer(targetSessionId);
        });
        return peer;
    };

    const addPeer = (senderSessionId: string, incomingSignal: any, stream: MediaStream): SimplePeer.Instance => {
        const peer = new SimplePeer({ initiator: false, trickle: true, config: ICE_SERVERS, stream });
        peer.on('signal', (data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'SIGNAL',
                    targetId: senderSessionId,
                    senderName: user.username,
                    data
                }));
            }
        });
        peer.on('stream', (remoteStream) => {
            setAudioStreams(prev => [...prev.filter(s => s.id !== senderSessionId), { id: senderSessionId, stream: remoteStream }]);
        });
        peer.on('close', () => removePeer(senderSessionId));
        peer.on('error', () => removePeer(senderSessionId));
        peer.signal(incomingSignal);
        return peer;
    };

    const handleSignalMessage = useCallback((message: any) => {
        switch (message.type) {
            case 'CONNECTED':
                mySessionIdRef.current = message.sessionId;
                break;
            case 'VOICE_USERS_LIST':
                if (!streamRef.current) break;
                const existingUsers = message.voiceUsers || [];
                existingUsers.forEach((vu: any) => {
                    if (vu.sessionId !== mySessionIdRef.current && !peersRef.current.find(p => p.sessionId === vu.sessionId)) {
                        const peer = createPeer(vu.sessionId, streamRef.current!);
                        peersRef.current.push({ sessionId: vu.sessionId, username: vu.username || 'User', peer });
                        setVoiceUsers(prev => [...prev.filter(u => u.sessionId !== vu.sessionId), { sessionId: vu.sessionId, username: vu.username || 'User' }]);
                    }
                });
                break;
            case 'JOIN_VOICE':
                if (message.senderId === mySessionIdRef.current) break;
                setVoiceUsers(prev => {
                    if (!prev.find(u => u.sessionId === message.senderId)) {
                        return [...prev, { sessionId: message.senderId, username: message.senderName || 'User' }];
                    }
                    return prev;
                });
                break;
            case 'SIGNAL':
                if (!isVoiceActiveRef.current || !streamRef.current) break;
                const existingEntry = peersRef.current.find(p => p.sessionId === message.senderId);
                if (existingEntry) {
                    if (message.data?.type === 'offer' && existingEntry.peer.initiator) {
                        if ((mySessionIdRef.current || '') < message.senderId) return;
                        existingEntry.peer.destroy();
                        peersRef.current = peersRef.current.filter(p => p.sessionId !== message.senderId);
                    } else {
                        existingEntry.peer.signal(message.data);
                        return;
                    }
                }
                const answerPeer = addPeer(message.senderId, message.data, streamRef.current);
                peersRef.current.push({ sessionId: message.senderId, username: message.senderName || 'User', peer: answerPeer });
                break;
            case 'LEAVE_VOICE':
            case 'USER_LEFT':
                removePeer(message.senderId || message.leaverId);
                break;
            case 'CHAT':
                setChatMessages(prev => [...prev, {
                    id: `${Date.now()}-${Math.random()}`,
                    senderId: message.senderId,
                    senderName: message.senderName,
                    content: message.content,
                    timestamp: message.timestamp
                }]);
                break;
        }
    }, [user.username, removePeer]);

    useEffect(() => {
        const wsUrl = `${WS_BASE_URL}/ws/signal/${environmentId}?token=${token}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => setWsStatus('OPEN');
        ws.onmessage = (e) => handleSignalMessage(JSON.parse(e.data));
        ws.onclose = () => {
            setWsStatus('CLOSED');
            cleanupVoice();
        };
        return () => {
            ws.close();
            cleanupVoice();
        };
    }, [environmentId, token, handleSignalMessage]);

    const joinVoice = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            streamRef.current = stream;
            setIsVoiceActive(true);
            wsRef.current?.send(JSON.stringify({ type: 'JOIN_VOICE', senderName: user.username }));
        } catch (err) {
            alert('Microphone access denied.');
        }
    };

    const cleanupVoice = () => {
        setIsVoiceActive(false);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        peersRef.current.forEach(p => p.peer.destroy());
        peersRef.current = [];
        setVoiceUsers([]);
        setAudioStreams([]);
    };

    const leaveVoice = () => {
        wsRef.current?.send(JSON.stringify({ type: 'LEAVE_VOICE' }));
        cleanupVoice();
    };

    const toggleMute = () => {
        if (streamRef.current) {
            const track = streamRef.current.getAudioTracks()[0];
            track.enabled = !track.enabled;
            setIsMuted(!track.enabled);
        }
    };

    const sendChatMessage = () => {
        if (!inputText.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
        const msg = { type: 'CHAT', content: inputText.trim(), senderName: user.username, timestamp: new Date().toISOString() };
        wsRef.current.send(JSON.stringify(msg));
        setChatMessages(prev => [...prev, { ...msg, id: Date.now().toString(), senderId: 'me' }]);
        setInputText('');
    };

    return (
        <div className={`fixed right-4 bottom-4 top-20 w-80 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-50 flex flex-col transition-all duration-300 ${!isOpen ? 'translate-x-[150%] opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
            <div className="flex border-b border-slate-800 bg-slate-800/50">
                <button onClick={() => setActiveTab('users')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'users' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'}`}>
                    <Users size={16} /> Voice
                </button>
                <button onClick={() => setActiveTab('chat')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'}`}>
                    <MessageSquare size={16} /> Chat
                </button>
                <button onClick={onClose} className="px-4 text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'users' ? (
                    <div className="p-4 flex flex-col items-center">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 transition-all ${isVoiceActive ? 'bg-green-500/20 text-green-400 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
                            {isVoiceActive ? (isMuted ? <MicOff size={32} /> : <Mic size={32} />) : <Radio size={32} />}
                        </div>
                        <h3 className="text-slate-200 font-medium">{isVoiceActive ? 'In Voice' : 'Voice Off'}</h3>
                        
                        <div className="flex gap-2 w-full mt-4">
                            <button 
                                onClick={isVoiceActive ? leaveVoice : joinVoice} 
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${isVoiceActive ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}
                            >
                                {isVoiceActive ? 'Leave Voice' : 'Join Voice'}
                            </button>
                            {isVoiceActive && (
                                <button onClick={toggleMute} className={`p-2 rounded-lg transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                                </button>
                            )}
                        </div>

                        <div className="w-full mt-6">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Participants</h4>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-slate-300 text-sm">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <span>{user.username} (You)</span>
                                </div>
                                {voiceUsers.map(vu => (
                                    <div key={vu.sessionId} className="flex items-center gap-2 text-slate-300 text-sm">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                        <span>{vu.username}</span>
                                        {audioStreams.find(s => s.id === vu.sessionId) && (
                                            <audio autoPlay ref={el => { if (el) el.srcObject = audioStreams.find(s => s.id === vu.sessionId)!.stream; }} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {chatMessages.map(msg => (
                                <div key={msg.id} className={`flex flex-col ${msg.senderId === 'me' ? 'items-end' : 'items-start'}`}>
                                    <span className="text-[10px] text-slate-500 mb-1">{msg.senderName}</span>
                                    <div className={`px-3 py-2 rounded-lg text-sm max-w-[90%] break-words ${msg.senderId === 'me' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="p-3 border-t border-slate-800 bg-slate-900">
                            <div className="relative">
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                                    placeholder="Message..."
                                    className="w-full bg-slate-800 border-none rounded-lg py-2 pl-3 pr-10 text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500"
                                />
                                <button onClick={sendChatMessage} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-300">
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommunicationPanel;