import { API_BASE_URL } from '../config';
import { useState } from 'react';

import { useAuth } from '../context/AuthContext';

interface User {
    id: string;
    username: string;
    email: string;
}

export default function UserSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<User[]>([]);
    const { user } = useAuth();
    const [message, setMessage] = useState('');

    const searchUsers = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/users/search?query=${query}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            setResults(data);
            setMessage('');
        } catch (err) {
            console.error(err);
            setMessage('Error searching users');
        }
    };

    const sendFriendRequest = async (receiverId: string) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/friends/request/${receiverId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                setMessage('Friend request sent!');
                // Optional: remove from list or show status
            } else {
                const text = await res.text();
                setMessage(`Error: ${text}`);
            }
        } catch (err) {
            console.error(err);
            setMessage('Failed to send request');
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg shadow-lg mb-6">
            <h3 className="text-lg font-semibold mb-4 text-white">Find Friends</h3>
            <form onSubmit={searchUsers} className="flex gap-2 mb-4">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by username..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-500"
                />
                <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-500 transition-colors">
                    Search
                </button>
            </form>

            {message && <p className="text-sm text-slate-400 mb-2">{message}</p>}

            <div className="space-y-2">
                {results.map((u) => (
                    <div key={u.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-md border border-slate-700">
                        <span className="text-slate-200">{u.username}</span>
                        {u.id !== user?.id && (
                            <button
                                onClick={() => sendFriendRequest(u.id)}
                                className="text-sm bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-500 transition-colors"
                            >
                                Add
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
