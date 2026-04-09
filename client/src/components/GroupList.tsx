import { API_BASE_URL } from '../config';
import { useState, useEffect } from 'react';

import { Users, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Group {
    id: string;
    name: string;
    description: string;
}

interface GroupListProps {
    onSelectGroup: (group: Group) => void;
    onCreateGroup: () => void;
    refreshTrigger: number;
}

export default function GroupList({ onSelectGroup, onCreateGroup, refreshTrigger }: GroupListProps) {
    const { user } = useAuth();
    const [groups, setGroups] = useState<Group[]>([]);

    useEffect(() => {
        const fetchGroups = async () => {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${API_BASE_URL}/api/groups`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setGroups(data);
                }
            } catch (err) {
                console.error("Failed to fetch groups", err);
            }
        };
        if (user) fetchGroups();
    }, [user, refreshTrigger]);

    return (
        <div className="bg-slate-800 rounded-lg p-4 h-full flex flex-col shadow-lg border border-slate-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Users size={20} className="text-emerald-400" />
                    My Groups
                </h3>
                <button
                    onClick={onCreateGroup}
                    className="p-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                >
                    <Plus size={18} />
                </button>
            </div>

            <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1">
                {groups.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-4">No groups yet.</p>
                ) : (
                    groups.map((group) => (
                        <div
                            key={group.id}
                            onClick={() => onSelectGroup(group)}
                            className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg cursor-pointer transition-all border border-transparent hover:border-slate-600 group"
                        >
                            <div className="font-medium text-slate-200 group-hover:text-white">{group.name}</div>
                            {group.description && (
                                <div className="text-xs text-slate-400 truncate mt-0.5">{group.description}</div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
