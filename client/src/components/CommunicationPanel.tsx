// @ts-nocheck
import { WS_BASE_URL } from '../config';
import React, { useState, useEffect, useRef } from 'react';
import SimplePeer from 'simple-peer';
import { Mic, MicOff, Send, Users, MessageSquare, X, Radio } from 'lucide-react';
// @ts-ignore
import * as process from 'process';
import { Buffer } from 'buffer';

// Polyfill for simple-peer in Vite
// @ts-ignore
if (typeof window !== 'undefined') {
    // @ts-ignore
    window.global = window;
    const processPolyfill = { ...process };
    // @ts-ignore
    window.process = processPolyfill;
    // @ts-ignore
    window.Buffer = Buffer;
    // @ts-ignore
    if (!window.process.nextTick) {
        // @ts-ignore
        window.process.nextTick = function (cb) { setTimeout(cb, 0); };
    }
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
    sessionId: string;      // Remote session ID — the canonical peer key
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
    const mySessionIdRef = useRef<string | null>(null);   // Our own WS session ID from the server
    const isVoiceActiveRef = useRef(false);               // Sync ref for use inside WS closures

    // Keep isVoiceActiveRef in sync
    useEffect(() => {
        isVoiceActiveRef.current = isVoiceActive;
    }, [isVoiceActive]);

    // Scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, activeTab]);

    // ─── WebSocket Setup ───────────────────────────────────────────────────────
    useEffect(() => {
        const wsUrl = `${WS_BASE_URL}/ws/signal/${environmentId}?token=${token}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[Voice] Signal WS Connected');
            setWsStatus('OPEN');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleSignalMessage(message);
            } catch (e) {
                console.error('[Voice] Failed to parse WS message', e);
            }
        };

        ws.onclose = () => {
            console.log('[Voice] Signal WS Closed');
            setWsStatus('CLOSED');
            cleanupVoice();
        };

        ws.onerror = (err) => {
            console.error('[Voice] Signal WS Error', err);
            setWsStatus('CLOSED');
        };

        return () => {
            ws.close();
            cleanupVoice();
        };
        // Only reconnect if envId/token changes
    }, [environmentId, token]);

    // ─── Signal Message Handler ────────────────────────────────────────────────
    const handleSignalMessage = (message: any) => {
        console.log('[Voice] Received:', message.type, message);

        switch (message.type) {

            case 'CONNECTED':
                // Server tells us our own session ID — use this everywhere
                mySessionIdRef.current = message.sessionId;
                console.log('[Voice] My session ID:', message.sessionId);
                break;

            case 'VOICE_USERS_LIST':
                // Server sends existing voice users when we JOIN_VOICE
                // We (the joiner) initiate connections to each of them
                if (!streamRef.current) break;
                const existingUsers: { sessionId: string; userId: string; username?: string }[] = message.voiceUsers || [];
                console.log('[Voice] Existing voice users:', existingUsers);
                for (const voiceUser of existingUsers) {
                    if (!peersRef.current.find(p => p.sessionId === voiceUser.sessionId)) {
                        console.log('[Voice] Initiating peer to existing user:', voiceUser.sessionId, voiceUser.username);
                        const resolvedUsername = voiceUser.username || 'User';
                        const peer = createPeer(voiceUser.sessionId, streamRef.current!);
                        peersRef.current.push({ sessionId: voiceUser.sessionId, username: resolvedUsername, peer });
                        setVoiceUsers(prev => [...prev, { sessionId: voiceUser.sessionId, username: resolvedUsername }]);
                    }
                }
                break;

            case 'JOIN_VOICE':
                // A new user joined voice. They will initiate a call to us.
                // We just add them to the UI list (they'll call us, we respond via SIGNAL case)
                console.log('[Voice] New user joined voice:', message.senderId, message.senderName);
                setVoiceUsers(prev => {
                    if (!prev.find(u => u.sessionId === message.senderId)) {
                        return [...prev, { sessionId: message.senderId, username: message.senderName || 'User' }];
                    }
                    return prev;
                });
                break;

            case 'SIGNAL':
                // WebRTC signaling from a remote peer
                const remoteSenderId: string = message.senderId;
                const senderName: string = message.senderName || 'User';
                const existingEntry = peersRef.current.find(p => p.sessionId === remoteSenderId);

                if (existingEntry) {
                    // Glare handling: both sides sent an offer simultaneously
                    if (message.data?.type === 'offer' && existingEntry.peer.initiator) {
                        const myId = mySessionIdRef.current || '';
                        if (myId > remoteSenderId) {
                            console.log('[Voice] Glare: I win, ignoring offer from', remoteSenderId);
                            break;
                        } else {
                            console.log('[Voice] Glare: I yield, recreating peer for', remoteSenderId);
                            existingEntry.peer.destroy();
                            peersRef.current = peersRef.current.filter(p => p.sessionId !== remoteSenderId);
                            // Fall through to create new answering peer below
                        }
                    } else {
                        existingEntry.peer.signal(message.data);
                        break;
                    }
                }

                // Create an answering peer
                if (!streamRef.current || !isVoiceActiveRef.current) {
                    console.log('[Voice] Ignoring SIGNAL — not in voice');
                    break;
                }
                console.log('[Voice] Creating answer peer for:', remoteSenderId);
                const answerPeer = addPeer(remoteSenderId, message.data, streamRef.current);
                peersRef.current.push({ sessionId: remoteSenderId, username: senderName, peer: answerPeer });
                setVoiceUsers(prev => {
                    if (!prev.find(u => u.sessionId === remoteSenderId)) {
                        return [...prev, { sessionId: remoteSenderId, username: senderName }];
                    }
                    return prev;
                });
                break;

            case 'LEAVE_VOICE':
            case 'USER_LEFT':
                // Both cases: someone dropped from voice
                const leaverId = message.senderId || message.leaverId;
                console.log('[Voice] Peer left:', leaverId);
                removePeer(leaverId);
                break;

            case 'CHAT':
                setChatMessages(prev => [...prev, {
                    id: Date.now().toString() + Math.random(),
                    senderId: message.senderId,
                    senderName: message.senderName,
                    content: message.content,
                    timestamp: message.timestamp
                }]);
                break;
        }
    };

    // ─── Peer Creation ─────────────────────────────────────────────────────────
    const createPeer = (targetSessionId: string, stream: MediaStream): SimplePeer.Instance => {
        const peer = new SimplePeer({ initiator: true, trickle: true, config: ICE_SERVERS, stream });

        peer.on('signal', (data) => {
            console.log('[Voice] Sending SIGNAL offer to:', targetSessionId);
            wsRef.current?.send(JSON.stringify({
                type: 'SIGNAL',
                targetId: targetSessionId,
                senderName: user.username,
                data
            }));
        });

        peer.on('stream', (remoteStream) => {
            console.log('[Voice] Got stream from:', targetSessionId);
            setAudioStreams(prev => [...prev.filter(s => s.id !== targetSessionId), { id: targetSessionId, stream: remoteStream }]);
        });

        peer.on('error', (err) => console.error('[Voice] Peer error (initiator):', targetSessionId, err));
        peer.on('close', () => { console.log('[Voice] Peer closed:', targetSessionId); removePeer(targetSessionId); });

        return peer;
    };

    const addPeer = (senderSessionId: string, incomingSignal: any, stream: MediaStream): SimplePeer.Instance => {
        const peer = new SimplePeer({ initiator: false, trickle: true, config: ICE_SERVERS, stream });

        peer.on('signal', (data) => {
            console.log('[Voice] Sending SIGNAL answer to:', senderSessionId);
            wsRef.current?.send(JSON.stringify({
                type: 'SIGNAL',
                targetId: senderSessionId,
                senderName: user.username,
                data
            }));
        });

        peer.on('stream', (remoteStream) => {
            console.log('[Voice] Got stream from (answerer):', senderSessionId);
            setAudioStreams(prev => [...prev.filter(s => s.id !== senderSessionId), { id: senderSessionId, stream: remoteStream }]);
        });

        peer.on('error', (err) => console.error('[Voice] Peer error (answerer):', senderSessionId, err));
        peer.on('close', () => { console.log('[Voice] Peer closed:', senderSessionId); removePeer(senderSessionId); });

        peer.signal(incomingSignal);
        return peer;
    };

    const removePeer = (sessionId: string) => {
        const entry = peersRef.current.find(p => p.sessionId === sessionId);
        if (entry) {
            entry.peer.destroy();
            peersRef.current = peersRef.current.filter(p => p.sessionId !== sessionId);
        }
        setVoiceUsers(prev => prev.filter(u => u.sessionId !== sessionId));
        setAudioStreams(prev => prev.filter(s => s.id !== sessionId));
    };

    // ─── Voice Controls ────────────────────────────────────────────────────────
    const joinVoice = async () => {
        try {
            console.log('[Voice] Requesting mic...');
            const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            streamRef.current = stream;
            setIsVoiceActive(true);
            setIsMuted(false);
            isVoiceActiveRef.current = true;

            wsRef.current?.send(JSON.stringify({
                type: 'JOIN_VOICE',
                senderName: user.username
                // Note: server uses session.getId() as senderId, not what we send here
            }));
        } catch (err) {
            console.error('[Voice] Failed to get mic', err);
            alert('Could not access microphone. Please check your browser permissions.');
        }
    };

    const leaveVoice = () => {
        wsRef.current?.send(JSON.stringify({ type: 'LEAVE_VOICE' }));
        cleanupVoice();
    };

    const cleanupVoice = () => {
        setIsVoiceActive(false);
        setIsMuted(false);
        isVoiceActiveRef.current = false;

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        peersRef.current.forEach(p => p.peer.destroy());
        peersRef.current = [];
        setVoiceUsers([]);
        setAudioStreams([]);
    };

    const toggleMute = () => {
        const audioTrack = streamRef.current?.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
        }
    };

    // ─── Chat ──────────────────────────────────────────────────────────────────
    const sendChatMessage = () => {
        if (!inputText.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
        const currentText = inputText.trim();
        setChatMessages(prev => [...prev, {
            id: Date.now().toString(),
            senderId: user.id || user.username,
            senderName: user.username,
            content: currentText,
            timestamp: new Date().toISOString()
        }]);
        wsRef.current.send(JSON.stringify({ type: 'CHAT', content: currentText, senderName: user.username }));
        setInputText('');
    };

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <div className={`fixed right-4 bottom-4 top-20 w-80 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-50 flex flex-col transition-all duration-300 ${!isOpen ? 'translate-x-[150%] opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
            {/* Tabs & Header */}
            <div className="flex border-b border-slate-800 bg-slate-800/50">
                <button onClick={() => setActiveTab('users')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'users' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}>
                    <Users size={16} /> Voice
                </button>
                <button onClick={() => setActiveTab('chat')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}>
                    <MessageSquare size={16} /> Chat
                </button>
                <button onClick={onClose} className="px-4 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex items-center justify-center" title="Close Panel">
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'users' && (
                    <div className="p-4 flex flex-col items-center">
                        {/* Status indicator */}
                        <div className="mb-5 text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 mx-auto transition-all duration-300 ${isVoiceActive ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/40 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
                                {isVoiceActive ? (isMuted ? <MicOff size={32} /> : <Mic size={32} />) : <Radio size={32} />}
                            </div>
                            <h3 className="text-slate-200 font-medium">{isVoiceActive ? 'In Voice Channel' : 'Voice Disconnected'}</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                {wsStatus !== 'OPEN' ? '⚠️ Connecting to server...' : isVoiceActive ? (isMuted ? '🔇 Muted' : '🎙️ Live') : 'Click Join to start speaking'}
                            </p>
                        </div>

                        <div className="flex gap-2 w-full">
                            <button
                                disabled={wsStatus !== 'OPEN'}
                                onClick={isVoiceActive ? leaveVoice : joinVoice}
                                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${wsStatus !== 'OPEN'
                                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                    : isVoiceActive
                                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/40'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/30'
                                    }`}>
                                {wsStatus !== 'OPEN' ? 'Connecting...' : isVoiceActive ? 'Leave Voice' : '🎙️ Join Voice'}
                            </button>
                            {isVoiceActive && (
                                <button
                                    onClick={toggleMute}
                                    className={`p-2 rounded-lg font-medium transition-all border ${isMuted ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'}`}
                                    title={isMuted ? 'Unmute' : 'Mute'}>
                                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                                </button>
                            )}
                        </div>

                        {/* Active voice users */}
                        <div className="mt-6 w-full">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                In Voice Channel ({voiceUsers.length})
                            </h4>
                            <div className="space-y-2">
                                {/* Show yourself */}
                                {isVoiceActive && (
                                    <div className="flex items-center gap-3 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isMuted ? 'bg-yellow-500' : 'bg-green-400 animate-pulse'}`} />
                                        <span className="text-sm text-slate-200 font-medium">{user.username} <span className="text-xs text-slate-500">(you)</span></span>
                                    </div>
                                )}
                                {/* Others */}
                                {voiceUsers.map(vu => (
                                    <div key={vu.sessionId} className="flex items-center gap-3 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/30">
                                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                                        <span className="text-sm text-slate-200">{vu.username}</span>
                                    </div>
                                ))}
                                {!isVoiceActive && voiceUsers.length === 0 && (
                                    <p className="text-sm text-slate-600 italic text-center py-4">Join voice to see who's speaking</p>
                                )}
                                {isVoiceActive && voiceUsers.length === 0 && (
                                    <p className="text-sm text-slate-600 italic text-center py-3">Waiting for others to join...</p>
                                )}
                            </div>
                        </div>

                        {/* P2P note */}
                        {voiceUsers.length >= 4 && (
                            <div className="mt-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg w-full">
                                <p className="text-xs text-yellow-400">⚠️ Voice quality may degrade with 5+ users (P2P mesh limit)</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'chat' && (
                    <>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {chatMessages.map((msg) => (
                                <div key={msg.id} className={`flex flex-col ${msg.senderName === user.username ? 'items-end' : 'items-start'}`}>
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="text-xs font-bold text-slate-300">{msg.senderName}</span>
                                        <span className="text-[10px] text-slate-600">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className={`px-3 py-2 rounded-lg text-sm max-w-[85%] break-words ${msg.senderName === user.username ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none'}`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="p-3 border-t border-slate-800 bg-slate-900">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                                    placeholder={wsStatus === 'OPEN' ? 'Type a message...' : 'Connecting...'}
                                    disabled={wsStatus !== 'OPEN'}
                                    className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50"
                                />
                                <button
                                    onClick={sendChatMessage}
                                    disabled={wsStatus !== 'OPEN'}
                                    className={`bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-md transition-colors ${wsStatus !== 'OPEN' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    <Send size={16} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Hidden audio players */}
            <div className="absolute w-0 h-0 opacity-0 overflow-hidden pointer-events-none">
                {audioStreams.map(s => <AudioPlayer key={s.id} stream={s.stream} />)}
            </div>
        </div>
    );
};

const AudioPlayer = ({ stream }: { stream: MediaStream }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        if (audioRef.current && stream) {
            // Assign stream to audio element for playback
            audioRef.current.srcObject = stream;
            // Ensure autoplay is triggered correctly after srcObject assignment
            audioRef.current.play().catch(err => {
                console.warn('[Voice] Audio autoplay blocked, user gesture needed:', err);
            });
        }
    }, [stream]); // Re-run whenever the stream reference changes
    return <audio ref={audioRef} autoPlay playsInline />;
};

export default CommunicationPanel;
