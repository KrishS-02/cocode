import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Notification {
    id: string;
    userId: string;
    message: string;
    linkUrl: string;
    isRead: boolean;
    createdAt: string;
}

const API_BASE = `${API_BASE_URL}/api`;

const NotificationBell = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const fetchNotifications = async () => {
        if (!token) return;
        try {
            setLoading(true);
            const [notifRes, countRes] = await Promise.all([
                axios.get(`${API_BASE}/notifications`, { headers }),
                axios.get(`${API_BASE}/notifications/unread-count`, { headers }),
            ]);
            setNotifications(notifRes.data);
            setUnreadCount(countRes.data.count || 0);
        } catch (err) {
            console.error('Failed to fetch notifications', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Poll every 30 seconds as a fallback (real-time handled via WS in parent)
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = async (notif: Notification) => {
        // Mark as read
        if (!notif.isRead) {
            try {
                await axios.put(`${API_BASE}/notifications/${notif.id}/read`, {}, { headers });
                setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (err) {
                console.error('Failed to mark notification as read', err);
            }
        }

        if (notif.linkUrl) {
            // Check if the environment still exists
            const envId = notif.linkUrl.split('/editor/')[1];
            if (envId) {
                try {
                    await axios.get(`${API_BASE}/environments/${envId}`, { headers });
                    navigate(notif.linkUrl);
                    setOpen(false);
                } catch (err: any) {
                    if (err.response?.status === 404 || err.response?.status === 400) {
                        toast.error('This environment no longer exists.');
                    } else {
                        navigate(notif.linkUrl);
                        setOpen(false);
                    }
                }
            } else {
                navigate(notif.linkUrl);
                setOpen(false);
            }
        }
    };

    const markAllRead = async () => {
        try {
            await axios.put(`${API_BASE}/notifications/read-all`, {}, { headers });
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) {
            toast.error('Failed to mark all as read');
        }
    };

    const formatTime = (dateString: string) => {
        // Explicitly format standard DB strings into local UTC references by adding trailing Z.
        // Javascript's Date function otherwise assumes the unmapped string belongs to the browser's local timezone.
        const normalizedString = dateString.endsWith('Z') ? dateString : `${dateString}Z`;
        const date = new Date(normalizedString);
        const now = new Date();
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                id="notification-bell-btn"
                onClick={() => {
                    setOpen(!open);
                    if (!open) fetchNotifications();
                }}
                className="relative p-2 rounded-full hover:bg-slate-700 transition-colors text-slate-300 hover:text-white"
                title="Notifications"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="fixed inset-x-4 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:mt-2 w-auto sm:w-80 max-w-sm bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                        <span className="font-semibold text-white text-sm">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                            >
                                <CheckCheck size={14} />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                                Loading...
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm gap-2">
                                <Bell size={24} className="opacity-40" />
                                <span>No notifications yet</span>
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <div
                                    key={notif.id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className={`px-4 py-3 border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors flex gap-3 items-start ${!notif.isRead ? 'bg-indigo-950/30' : ''}
                                        }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-200 leading-snug">{notif.message}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{formatTime(notif.createdAt)}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {notif.linkUrl && <ExternalLink size={12} className="text-slate-500" />}
                                        {!notif.isRead && <div className="w-2 h-2 bg-indigo-500 rounded-full" />}
                                        {notif.isRead && <Check size={12} className="text-slate-500" />}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
