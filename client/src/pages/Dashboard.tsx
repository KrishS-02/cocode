import { API_BASE_URL } from '../config';
import { useState, useEffect, useRef } from 'react';

import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { Plus, Folder } from 'lucide-react';
import UserSearch from '../components/UserSearch';
import FriendList from '../components/FriendList';
import ChatWidget from '../components/ChatWidget';
import GroupList from '../components/GroupList';
import CreateGroupModal from '../components/CreateGroupModal';
import GroupChatWidget from '../components/GroupChatWidget';
import NotificationToast from '../components/NotificationToast';
import NotificationBell from '../components/NotificationBell';
import type { AppNotification } from '../components/NotificationToast';

interface Environment {
    id: string;
    name: string;
    description: string;
    joinCode?: string;
}

const Dashboard = () => {
    const { token, logout, user } = useAuth();
    const navigate = useNavigate();
    const [environments, setEnvironments] = useState<Environment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');

    // Chat state
    const [activeChatFriend, setActiveChatFriend] = useState<{ id: string, username: string } | null>(null);
    const [activeChatGroup, setActiveChatGroup] = useState<{ id: string, name: string } | null>(null);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [refreshGroupListTrigger, setRefreshGroupListTrigger] = useState(0);

    // Join-by-code state
    const [joinCode, setJoinCode] = useState('');
    const [isJoining, setIsJoining] = useState(false);

    // Friend list refresh trigger
    const [refreshFriendListTrigger, setRefreshFriendListTrigger] = useState(0);

    const handleJoinByCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinCode.trim()) return;
        setIsJoining(true);
        try {
            const response = await axios.post(`${API_BASE_URL}/api/environments/join-by-code`, {
                code: joinCode.trim().toUpperCase()
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const env = response.data;
            setJoinCode('');
            navigate(`/editor/${env.id}`);
        } catch (err: any) {
            const msg = err.response?.data?.error || err.response?.data || 'Invalid code or environment not found';
            addNotification({
                id: Date.now().toString(),
                type: 'friend_request',
                title: 'Join Failed',
                message: typeof msg === 'string' ? msg : 'Invalid code'
            });
        } finally {
            setIsJoining(false);
        }
    };

    useEffect(() => {
        fetchEnvironments();
    }, []);

    const fetchEnvironments = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/environments/my`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEnvironments(response.data);
        } catch (error) {
            console.error("Failed to fetch environments", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await axios.post(`${API_BASE_URL}/api/environments`, {
                name: newProjectName,
                description: 'Created via Dashboard'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEnvironments([...environments, response.data]);
            setNewProjectName('');
            setIsCreating(false);
            navigate(`/editor/${response.data.id}`);
        } catch (error) {
            console.error("Failed to create project", error);
        }
    };

    // Notifications
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const { isConnected, sendMessage, subscribe } = useWebSocket();


    // Ref to track active chat for notification filtering
    const activeChatRef = useRef<{ id: string } | null>(null);

    // Update ref when active chat changes
    useEffect(() => {
        activeChatRef.current = activeChatFriend;
    }, [activeChatFriend]);

    // Global WebSocket for Notifications
    useEffect(() => {
        const unsubscribe = subscribe((data: any) => {
            console.log("Global WS Message:", data);

            if (data.type === 'FRIEND_REQUEST') {
                console.log("Type is FRIEND_REQUEST");
                addNotification({
                    id: Date.now().toString(),
                    type: 'friend_request',
                    title: 'New Friend Request',
                    message: `${data.data.senderName} sent you a friend request`,
                    linkUrl: '#friends'
                });
                setRefreshFriendListTrigger(prev => prev + 1);
            } else if (data.type === 'FRIEND_REQUEST_ACCEPTED') {
                console.log("Type is FRIEND_REQUEST_ACCEPTED");
                addNotification({
                    id: Date.now().toString(),
                    type: 'friend_request', // Using generic icon or we can add 'success'
                    title: 'Friend Request Accepted',
                    message: `${data.data.accepterName} is now your friend`,
                    linkUrl: '#friends'
                });
                setRefreshFriendListTrigger(prev => prev + 1);
            } else if (data.type === 'CHAT') {
                console.log("Type is CHAT");
                const senderId = data.senderId;
                // Check if we are currently chatting with this sender
                const currentlyOpen = activeChatRef.current?.id === senderId;
                const isSentByMe = user?.id === senderId;

                if (!currentlyOpen && !isSentByMe) {
                    addNotification({
                        id: Date.now().toString(),
                        type: 'chat',
                        title: data.senderName,
                        message: data.content
                    });
                }
            } else if (data.type === 'NOTIFICATION') {
                // Real-time notifications from the server (e.g. added to environment)
                const notifData = data.data;
                addNotification({
                    id: Date.now().toString(),
                    type: 'friend_request',
                    title: 'New Notification',
                    message: notifData?.message || 'You have a new notification',
                    linkUrl: notifData?.linkUrl
                });
                // Refresh environments list automatically
                fetchEnvironments();
            }
        });

        return () => {
            unsubscribe();
        };
    }, [subscribe, user?.id]);

    const addNotification = (note: AppNotification) => {
        console.log("Adding notification:", note);
        setNotifications(prev => [...prev, note]);
    };

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const handleNotificationClick = (notification: AppNotification) => {
        if (notification.linkUrl) {
            if (notification.linkUrl.startsWith('http') || notification.linkUrl.startsWith('/')) {
                navigate(notification.linkUrl);
            } else if (notification.linkUrl.startsWith('#')) {
                // If it's a hash, we might scroll or just let the user see the UI.
                // For "friend_request", the social sidebar is already visible on the dashboard.
                if (notification.linkUrl === '#friends') {
                    // Flash or highlight friend list if possible, or just close notification
                }
            }
        }
        removeNotification(notification.id);
    };

    const handleLogout = () => {
        console.log("Dashboard: Sending LOGOUT command");
        sendMessage({ type: 'LOGOUT' });

        // Small delay to ensure message is sent before unmounting
        setTimeout(() => {
            logout();
        }, 50);
    };

    return (
        <div className="min-h-screen bg-slate-950 p-8 relative">
            {/* Notifications Container */}
            <div className="fixed top-4 right-4 z-[100] space-y-3 pointer-events-none flex flex-col items-end">
                {notifications.map(n => (
                    <NotificationToast key={n.id} notification={n} onClose={removeNotification} onClick={handleNotificationClick} />
                ))}
            </div>

            <div className="max-w-7xl mx-auto flex gap-8">
                {/* Main Content Area */}
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                            <p className="text-slate-400">Welcome back, {user?.username}!</p>
                        </div>
                        <div className="flex gap-4 items-center">
                            {/* Connection Status Indicator */}
                            <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-800" title={isConnected ? "Connected to Real-time Updates" : "Disconnected"}>
                                <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'}`}></div>
                                <span className="text-xs text-slate-400 hidden md:block">{isConnected ? 'Online' : 'Offline'}</span>
                            </div>

                            {/* Notification Bell */}
                            <NotificationBell />

                            <button
                                onClick={handleLogout}
                                className="text-slate-400 hover:text-white px-4 py-2 transition-colors"
                            >
                                Sign Out
                            </button>
                            <button
                                onClick={() => setIsCreating(true)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-500 flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
                            >
                                <Plus size={20} />
                                New Project
                            </button>
                        </div>
                    </div>

                    {isCreating && (
                        <div className="mb-8 bg-slate-900 p-6 rounded-lg shadow-xl border border-slate-800">
                            <h3 className="text-lg font-medium mb-4 text-white">Create New Project</h3>
                            <form onSubmit={handleCreateProject} className="flex gap-4">
                                <input
                                    type="text"
                                    placeholder="Project Name"
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-500"
                                    required
                                />
                                <button
                                    type="submit"
                                    className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-500 transition-colors"
                                >
                                    Create
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="text-slate-400 hover:text-white px-6 py-2 transition-colors"
                                >
                                    Cancel
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Join by Code Section */}
                    <div className="mb-8 bg-slate-900 p-6 rounded-lg border border-slate-800">
                        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                            <span className="text-indigo-400">🔑</span> Join Environment by Code
                        </h3>
                        <form onSubmit={handleJoinByCode} className="flex gap-3">
                            <input
                                type="text"
                                placeholder="Enter 6-character code (e.g. ABC123)"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                maxLength={6}
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-4 py-2 text-white font-mono tracking-widest text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-500 uppercase"
                            />
                            <button
                                type="submit"
                                disabled={isJoining || joinCode.length !== 6}
                                className="bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isJoining ? 'Joining...' : 'Join'}
                            </button>
                        </form>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="bg-slate-900 p-6 rounded-lg border border-slate-800 animate-pulse">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-6 h-6 bg-slate-800 rounded"></div>
                                        <div className="h-5 bg-slate-800 rounded w-1/2"></div>
                                    </div>
                                    <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {environments.map((env) => (
                                <div
                                    key={env.id}
                                    onClick={() => navigate(`/editor/${env.id}`)}
                                    className="bg-slate-900 p-6 rounded-lg shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all cursor-pointer border border-slate-800 hover:border-indigo-500/50 group"
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <Folder className="text-indigo-500 group-hover:text-indigo-400 transition-colors" />
                                        <h3 className="font-semibold text-lg text-slate-100 group-hover:text-white transition-colors">{env.name}</h3>
                                    </div>
                                    <p className="text-slate-400 text-sm">{env.description || "No description"}</p>
                                </div>
                            ))}

                            {environments.length === 0 && !isCreating && (
                                <div className="col-span-3 text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-lg">
                                    <p>No projects found. Create one to get started!</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Social Sidebar */}
                <div className="w-80 space-y-6 flex flex-col h-[calc(100vh-64px)] overflow-hidden pb-4">
                    <div className="flex-shrink-0">
                        <UserSearch />
                    </div>
                    <div className="flex-1 min-h-0">
                        <FriendList 
                            refreshTrigger={refreshFriendListTrigger}
                            onSelectFriend={(id, username) => {
                                setActiveChatFriend({ id, username });
                                setActiveChatGroup(null); // Close group chat if open
                            }} 
                        />
                    </div>
                    <div className="flex-1 min-h-0">
                        <GroupList
                            onSelectGroup={(group) => {
                                setActiveChatGroup({ id: group.id, name: group.name });
                                setActiveChatFriend(null); // Close friend chat if open
                            }}
                            onCreateGroup={() => setShowCreateGroupModal(true)}
                            refreshTrigger={refreshGroupListTrigger}
                        />
                    </div>
                </div>
            </div>

            {/* Modals */}
            {showCreateGroupModal && (
                <CreateGroupModal
                    onClose={() => setShowCreateGroupModal(false)}
                    onGroupCreated={() => setRefreshGroupListTrigger(prev => prev + 1)}
                />
            )}

            {/* Chat Widgets */}
            {activeChatFriend && (
                <ChatWidget
                    friendId={activeChatFriend.id}
                    friendName={activeChatFriend.username}
                    onClose={() => setActiveChatFriend(null)}
                />
            )}
            {activeChatGroup && (
                <GroupChatWidget
                    groupId={activeChatGroup.id}
                    groupName={activeChatGroup.name}
                    onClose={() => setActiveChatGroup(null)}
                />
            )}
        </div>
    );
};

export default Dashboard;

