import { useEffect } from 'react';
import { X, Bell, MessageSquare, UserPlus } from 'lucide-react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'chat' | 'friend_request';

export interface AppNotification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    duration?: number;
    linkUrl?: string;
}

interface NotificationToastProps {
    notification: AppNotification;
    onClose: (id: string) => void;
    onClick?: (notification: AppNotification) => void;
}

export default function NotificationToast({ notification, onClose, onClick }: NotificationToastProps) {
    useEffect(() => {
        if (notification.duration !== 0) {
            const timer = setTimeout(() => {
                onClose(notification.id);
            }, notification.duration || 5000);
            return () => clearTimeout(timer);
        }
    }, [notification, onClose]);

    const getIcon = () => {
        switch (notification.type) {
            case 'chat': return <MessageSquare size={18} className="text-indigo-400" />;
            case 'friend_request': return <UserPlus size={18} className="text-emerald-400" />;
            case 'error': return <X size={18} className="text-red-400" />;
            default: return <Bell size={18} className="text-blue-400" />;
        }
    };

    return (
        <div 
            onClick={() => {
                if (onClick) onClick(notification);
            }}
            className={`flex items-start gap-3 bg-slate-900 border border-slate-700 text-slate-200 p-4 rounded-lg shadow-xl animate-slide-in min-w-[300px] max-w-sm pointer-events-auto ${onClick ? 'cursor-pointer hover:bg-slate-800 transition-colors' : ''}`}
        >
            <div className="mt-1 flex-shrink-0">
                {getIcon()}
            </div>
            <div className="flex-1">
                <h4 className="font-semibold text-white text-sm">{notification.title}</h4>
                <p className="text-sm text-slate-400 mt-1">{notification.message}</p>
            </div>
            <button
                onClick={() => onClose(notification.id)}
                className="text-slate-500 hover:text-white transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
}
