import { API_BASE_URL } from '../config';
import React, { useState, useEffect } from 'react';

import axios from 'axios';
import { Activity } from 'lucide-react';

interface AuditLog {
    id: string;
    actorId: string;
    action: string;
    targetId: string;
    details: string;
    timestamp: string;
}

interface AuditLogViewerProps {
    environmentId: string;
    token: string;
}

const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ environmentId, token }) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/api/admin/logs/${environmentId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setLogs(response.data);
            } catch (err: any) {
                console.error("Failed to fetch audit logs", err);
                const errData = err.response?.data;
                let errMsg = "Failed to load activity logs.";
                if (typeof errData === 'string') {
                    errMsg = errData;
                } else if (errData?.message) {
                    errMsg = errData.message;
                } else if (errData?.error) {
                    errMsg = `${errData.error} (${errData.status})`;
                } else if (err.response?.status === 403) {
                    errMsg = "Access denied. Only environment Admins can view audit logs.";
                }
                setError(errMsg);
            } finally {
                setLoading(false);
            }
        };

        if (environmentId && token) {
            fetchLogs();
        }
    }, [environmentId, token]);

    if (loading) {
        return <div className="text-slate-400 text-sm p-4 text-center animate-pulse">Loading activity logs...</div>;
    }

    if (error) {
        return <div className="text-red-400 bg-red-500/10 p-4 rounded text-sm text-center border border-red-500/20">{error}</div>;
    }

    return (
        <div className="flex flex-col h-[400px]">
            <div className="mb-4 flex items-center gap-2">
                <Activity size={18} className="text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Security Audit Trail</h3>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                {logs.length === 0 ? (
                    <p className="text-slate-500 text-sm italic text-center mt-10">No activity recorded yet.</p>
                ) : (
                    logs.map(log => (
                        <div key={log.id} className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${log.action.includes('CREATED') ? 'bg-emerald-500/20 text-emerald-400' :
                                        log.action === 'CODE_EXECUTED' ? 'bg-amber-500/20 text-amber-400' :
                                            log.action === 'FILE_SAVED' ? 'bg-blue-500/20 text-blue-400' :
                                                log.action.includes('REVOKED') || log.action.includes('DELETED') ? 'bg-red-500/20 text-red-400' :
                                                    'bg-indigo-500/20 text-indigo-400'
                                    }`}>
                                    {log.action}
                                </span>
                                <span className="text-[10px] text-slate-500" title={new Date(log.timestamp).toLocaleString()}>
                                    {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <p className="text-sm text-slate-300 mt-2">{log.details}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AuditLogViewer;
