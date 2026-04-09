import { API_BASE_URL } from '../config';
import { useState } from 'react';

import { X, Users } from 'lucide-react';

interface CreateGroupModalProps {
    onClose: () => void;
    onGroupCreated: () => void;
}

export default function CreateGroupModal({ onClose, onGroupCreated }: CreateGroupModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsLoading(true);
        setError('');

        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/api/groups`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name, description })
            });

            if (res.ok) {
                onGroupCreated();
                onClose();
            } else {
                const text = await res.text();
                setError(text || 'Failed to create group');
            }
        } catch (err) {
            console.error(err);
            setError('Network error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                <div className="flex justify-between items-center p-4 border-b border-slate-800">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Users size={20} className="text-emerald-400" />
                        Create New Group
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Group Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Study Team"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder-slate-600"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Description (Optional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What is this group about?"
                            rows={3}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder-slate-600 resize-none"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? 'Creating...' : 'Create Group'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
