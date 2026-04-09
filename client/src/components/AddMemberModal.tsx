import { API_BASE_URL } from '../config';
import { useState, useEffect } from 'react';

import { X, UserPlus, Check, Search, Users } from 'lucide-react';

interface Friend {
    id: string;
    username: string;
    email: string;
    status: 'ONLINE' | 'OFFLINE';
}

interface GroupMember {
    id: string;
    username: string;
    email: string;
    role: string;
}

interface AddMemberModalProps {
    groupId: string;
    groupName: string;
    onClose: () => void;
}

export default function AddMemberModal({ groupId, onClose }: AddMemberModalProps) {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [currentMembers, setCurrentMembers] = useState<GroupMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        Promise.all([fetchFriends(), fetchCurrentMembers()]);
    }, []);

    const fetchFriends = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/api/friends`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFriends(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCurrentMembers = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/members`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentMembers(data);
            }
        } catch (err) {
            console.error('Failed to fetch group members', err);
        }
    };

    const handleAddMember = async (friendId: string) => {
        setProcessingId(friendId);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userId: friendId })
            });

            if (res.ok) {
                setAddedIds(prev => new Set(prev).add(friendId));
            } else {
                const text = await res.text();
                alert(text || "Failed to add member");
            }
        } catch (err) {
            console.error(err);
            alert("Network error");
        } finally {
            setProcessingId(null);
        }
    };

    // Build a Set of existing member IDs for O(1) lookup
    const existingMemberIds = new Set(currentMembers.map(m => m.id));

    // Filter out friends that are already in the group AND apply search term
    const filteredFriends = friends.filter(f =>
        !existingMemberIds.has(f.id) &&
        f.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh] animate-scale-in">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-slate-800 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <UserPlus size={20} className="text-indigo-400" />
                        Add People
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Current Members Section */}
                {currentMembers.length > 0 && (
                    <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex-shrink-0">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Users size={12} />
                            Current Members ({currentMembers.length})
                        </h4>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                            {currentMembers.map(member => (
                                <span
                                    key={member.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700/60 rounded-full text-xs text-slate-300 border border-slate-600/50"
                                    title={member.role}
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    {member.username}
                                    <span className="text-slate-500 text-[10px] capitalize">({(member.role || 'member').toLowerCase()})</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex-shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                        <input
                            type="text"
                            placeholder="Search friends to add..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                </div>

                {/* Friends List (scrollable, excludes current members) */}
                <div className="overflow-y-auto p-2 space-y-1 flex-1">
                    {loading ? (
                        <div className="text-center py-4 text-slate-500">Loading...</div>
                    ) : filteredFriends.length === 0 ? (
                        <div className="text-center py-6 text-slate-500">
                            <UserPlus size={24} className="mx-auto mb-2 text-slate-600" />
                            <p className="text-sm">
                                {searchTerm ? 'No matching friends.' : 'All your friends are already in this group!'}
                            </p>
                        </div>
                    ) : (
                        filteredFriends.map(friend => {
                            const isAdded = addedIds.has(friend.id);
                            return (
                                <div key={friend.id} className="flex items-center justify-between p-2 hover:bg-slate-800 rounded-lg group transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-medium text-xs">
                                            {friend.username.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-slate-200">{friend.username}</div>
                                            <div className="text-xs text-slate-500 flex items-center gap-1">
                                                <span className={`w-1.5 h-1.5 rounded-full ${friend.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                                                {friend.status}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => !isAdded && handleAddMember(friend.id)}
                                        disabled={isAdded || processingId === friend.id}
                                        className={`p-1.5 rounded-md transition-all ${isAdded
                                            ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                                            : 'bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white'
                                            }`}
                                    >
                                        {isAdded ? <Check size={16} /> : <UserPlus size={16} />}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
