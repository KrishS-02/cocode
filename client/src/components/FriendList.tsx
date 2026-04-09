import { API_BASE_URL } from '../config';
import { useEffect, useState } from 'react';

import { useWebSocket } from '../context/WebSocketContext';

interface FriendRequest {
    id: string;
    sender: {
        id: string;
        username: string;
    };
    receiver: {
        id: string;
        username: string;
    };
    status: string;
}

interface User {
    id: string;
    username: string;
    isOnline?: boolean;
    online?: boolean; // Fallback
}

interface FriendListProps {
    onSelectFriend: (friendId: string, username: string) => void;
    refreshTrigger?: number;
}

export default function FriendList({ onSelectFriend, refreshTrigger }: FriendListProps) {
    const [friends, setFriends] = useState<User[]>([]);
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchFriends = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/api/friends`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                console.log('FriendList: Fetched friends:', data); // DEBUG
                setFriends(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchRequests = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/api/friends/requests`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setRequests(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const acceptRequest = async (requestId: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/api/friends/accept/${requestId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                fetchRequests();
                fetchFriends();
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchFriends();
        fetchRequests();
        // Poll every 30 seconds for updates to avoid spamming
        const interval = setInterval(() => {
            fetchRequests();
            fetchFriends();
        }, 30000);
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    // WebSocket for real-time status updates
    const { subscribe } = useWebSocket();

    useEffect(() => {
        const unsubscribe = subscribe((data: any) => {
            console.log("FriendList WS Received:", data);
            if (data.type === 'USER_ONLINE' || data.type === 'USER_OFFLINE') {
                const userId = data.userId;
                const isOnline = data.type === 'USER_ONLINE';

                setFriends(prev => prev.map(f =>
                    f.id === userId ? { ...f, isOnline } : f
                ));
            }
        });

        return () => {
            unsubscribe();
        };
    }, [subscribe]);

    return (
        <div className="space-y-6">
            {/* Requests */}
            {requests.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-800/50 p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-3 text-amber-200">Friend Requests</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {requests.map((req) => (
                            <div key={req.id} className="flex justify-between items-center bg-slate-900 p-3 rounded border border-slate-700">
                                <span className="text-slate-200">{req.sender.username}</span>
                                <button
                                    onClick={() => acceptRequest(req.id)}
                                    className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-500 transition-colors"
                                >
                                    Accept
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Friends */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold mb-4 text-white">My Friends</h3>
                {isLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-md animate-pulse">
                                <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                                <div className="h-4 bg-slate-700 rounded w-24"></div>
                            </div>
                        ))}
                    </div>
                ) : friends.length === 0 ? (
                    <p className="text-slate-500 italic">No friends yet.</p>
                ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {friends.map((friend) => (
                            <div
                                key={friend.id}
                                onClick={() => onSelectFriend(friend.id, friend.username)}
                                className="p-3 bg-slate-800/50 hover:bg-slate-800 rounded-md cursor-pointer border border-transparent hover:border-slate-600 transition-all text-slate-200 hover:text-white flex items-center gap-2"
                            >
                                <div className={`w-2 h-2 rounded-full ${(friend.isOnline || friend.online) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-500'}`}></div>
                                {friend.username}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
