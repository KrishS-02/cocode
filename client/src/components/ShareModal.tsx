import { API_BASE_URL } from '../config';
import { useState, useEffect } from 'react';

import axios from 'axios';
import { X, UserPlus, Trash2, Shield, Activity as ActivityIcon, Copy, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuditLogViewer from './AuditLogViewer';

interface ShareModalProps {
    environmentId: string;
    isOpen: boolean;
    onClose: () => void;
}

interface Permission {
    id: string;
    user: {
        id: string;
        username: string;
        email: string;
    };
    accessLevel: 'VIEWER' | 'EDITOR' | 'ADMIN';
}

const ShareModal = ({ environmentId, isOpen, onClose }: ShareModalProps) => {
    const { token } = useAuth();
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [inviteUsername, setInviteUsername] = useState('');
    const [inviteRole, setInviteRole] = useState<'VIEWER' | 'EDITOR' | 'ADMIN'>('VIEWER');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'permissions' | 'audit'>('permissions');
    const [joinCode, setJoinCode] = useState<string | null>(null);
    const [codeCopied, setCodeCopied] = useState(false);

    const [isExamMode, setIsExamMode] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchPermissions();
            fetchEnvironment();
        }
    }, [isOpen, environmentId]);

    const fetchEnvironment = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/environments/${environmentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setJoinCode(res.data.joinCode || null);
            setIsExamMode(res.data.isExamMode || false);
        } catch (err) {
            console.error('Failed to fetch environment', err);
        }
    };

    const toggleExamMode = async () => {
        try {
            const newStatus = !isExamMode;
            await axios.put(`${API_BASE_URL}/api/environments/${environmentId}/exam-mode`, {
                isExamMode: newStatus
            }, { headers: { Authorization: `Bearer ${token}` } });
            setIsExamMode(newStatus);
        } catch (err) {
            console.error('Failed to toggle Exam Mode', err);
            alert("Failed to toggle Exam Mode");
        }
    };

    const copyJoinCode = () => {
        if (joinCode) {
            navigator.clipboard.writeText(joinCode).then(() => {
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 2000);
            });
        }
    };

    const fetchPermissions = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/environments/${environmentId}/permissions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPermissions(response.data);
        } catch (err) {
            console.error("Failed to fetch permissions", err);
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await axios.post(`${API_BASE_URL}/api/environments/${environmentId}/permissions`, {
                usernameOrEmail: inviteUsername.trim(),
                accessLevel: inviteRole
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setInviteUsername('');
            fetchPermissions();
        } catch (err: any) {
            console.error("Invite failed", err);
            const msg = err.response?.data?.message || err.response?.data || "Failed to invite user";
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePermission = async (usernameOrEmail: string, newRole: 'VIEWER' | 'EDITOR' | 'ADMIN') => {
        try {
            await axios.post(`${API_BASE_URL}/api/environments/${environmentId}/permissions`, {
                usernameOrEmail: usernameOrEmail,
                accessLevel: newRole
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchPermissions();
        } catch (err) {
            console.error("Failed to update permission", err);
            alert("Failed to update permission");
        }
    };

    const handleRevoke = async (userId: string) => {
        if (!confirm("Are you sure you want to remove this user?")) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/environments/${environmentId}/permissions/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchPermissions();
        } catch (err) {
            console.error("Failed to revoke permission", err);
        }
    };

    const handleDelegateExaminee = async (userId: string) => {
        if (!confirm("This will revoke write access from everyone else and assign this user as the sole Examinee (EDITOR). Proceed?")) return;
        try {
            await axios.post(`${API_BASE_URL}/api/environments/${environmentId}/permissions/delegate-examinee`, {
                userId: userId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchPermissions();
        } catch (err) {
            console.error("Failed to delegate examinee", err);
            alert("Failed to delegate examinee");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md relative shadow-2xl flex flex-col max-h-[90vh]">
                {/* Scrollable content wrapper */}
                <div className="overflow-y-auto flex-1 p-6">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <UserPlus size={24} className="text-indigo-500" />
                    Share Environment
                </h2>

                <div className="flex border-b border-slate-700 mb-6">
                    <button
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex justify-center items-center gap-2 ${activeTab === 'permissions' ? 'text-indigo-400 border-indigo-500 bg-indigo-500/5' : 'text-slate-400 border-transparent hover:text-slate-200'
                            }`}
                        onClick={() => setActiveTab('permissions')}
                    >
                        <Shield size={16} /> Manage Access
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex justify-center items-center gap-2 ${activeTab === 'audit' ? 'text-indigo-400 border-indigo-500 bg-indigo-500/5' : 'text-slate-400 border-transparent hover:text-slate-200'
                            }`}
                        onClick={() => setActiveTab('audit')}
                    >
                        <ActivityIcon size={16} /> Activity Log
                    </button>
                </div>

                {activeTab === 'permissions' ? (
                    <>
                        {/* Exam Mode Toggle */}
                        <div className="mb-5 p-4 bg-slate-800/80 border border-slate-700/60 rounded-lg flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-slate-200">Exam Mode (Proctoring)</h3>
                                <p className="text-xs text-slate-400 mt-1">Split UI, restrict pasting, and monitor tab switching.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={isExamMode} onChange={toggleExamMode} />
                                <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>

                        {/* Join Code Section */}
                        {joinCode && (
                            <div className="mb-5 p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-lg">
                                <p className="text-xs text-indigo-300 font-medium uppercase tracking-widest mb-2">Quick Join Code</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-lg font-mono font-bold text-white tracking-[0.3em] bg-slate-900 px-4 py-2 rounded-md border border-slate-700">
                                        {joinCode}
                                    </code>
                                    <button
                                        onClick={copyJoinCode}
                                        className="p-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                                        title="Copy join code"
                                    >
                                        {codeCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">Share this code so others can join via the Dashboard</p>
                            </div>
                        )}

                        <form onSubmit={handleInvite} className="mb-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm text-slate-400">Invite User (Username or Email)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={inviteUsername}
                                        onChange={(e) => setInviteUsername(e.target.value)}
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                                        placeholder="Enter username..."
                                        required
                                    />
                                    <select
                                        value={inviteRole}
                                        onChange={(e) => setInviteRole(e.target.value as any)}
                                        className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="VIEWER">Viewer</option>
                                        <option value="EDITOR">Editor</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </div>
                                {error && <p className="text-red-400 text-xs">{error}</p>}
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2 text-sm font-medium transition-colors mt-2 disabled:opacity-50"
                                >
                                    {loading ? 'Sending...' : 'Invite'}
                                </button>
                            </div>
                        </form>

                        <div>
                            <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Members</h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                {permissions.length === 0 ? (
                                    <p className="text-slate-500 text-sm italic">No members yet.</p>
                                ) : (
                                    permissions.map((p) => (
                                        <div key={p.id} className="flex items-center justify-between bg-slate-800/50 p-2 rounded border border-slate-800">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
                                                    {(p.user?.username || p.user?.email || 'U').substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm text-white font-medium">{p.user?.username || 'Unknown User'}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Shield size={12} className="text-slate-400" />
                                                        <select
                                                            value={p.accessLevel}
                                                            onChange={(e) => handleUpdatePermission(p.user.email || p.user.username, e.target.value as any)}
                                                            className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                                                        >
                                                            <option value="VIEWER">Viewer</option>
                                                            <option value="EDITOR">Editor</option>
                                                            <option value="ADMIN">Admin</option>
                                                        </select>
                                                        {isExamMode && p.accessLevel !== 'ADMIN' && (
                                                            <button
                                                                onClick={() => handleDelegateExaminee(p.user.id)}
                                                                className="text-xs bg-indigo-600/30 hover:bg-indigo-500 text-indigo-200 hover:text-white px-2 py-0.5 rounded transition-colors border border-indigo-500/50"
                                                                title="Assign as sole Examinee (EDITOR mode) and set others to VIEWER"
                                                            >
                                                                Assign Examinee
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRevoke(p.user.id)}
                                                className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                                                title="Remove user"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <AuditLogViewer environmentId={environmentId} token={token || ''} />
                )}
                </div> {/* end scrollable content */}
            </div>
        </div>
    );
};

export default ShareModal;
