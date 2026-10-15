import React from 'react';
import formatDistanceToNow from 'date-fns/formatDistanceToNow';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Trash2 } from 'lucide-react';
import { notificationDestination } from '../utils/notificationNavigation';

const NotificationEntry = ({ notification, onRead, onDelete, onOpen }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const destination = notificationDestination(notification, user);
    const created = new Date(notification.createdAt);
    const time = Number.isNaN(created.getTime()) ? '' : formatDistanceToNow(created, { addSuffix: true });
    const open = async () => {
        if (!notification.isRead) await onRead(notification._id);
        if (destination) navigate(destination);
        onOpen?.();
    };
    return (
        <article className={`notification-item border-b border-slate-100 p-3 last:border-0 ${notification.isRead ? '' : 'notification-item-unread'}`}>
            <div className="flex items-start gap-2">
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.isRead ? 'bg-transparent' : 'bg-primary-500'}`} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-2">
                        <h3 className="notification-title mb-0 break-words text-sm font-semibold">{notification.title}</h3>
                        <time className="notification-meta text-xs" dateTime={notification.createdAt}>{time}</time>
                    </div>
                    <p className="notification-copy mt-1 break-words text-sm">{notification.message}</p>
                    {notification.relatedModel && <p className="notification-meta mt-1 text-xs">Related: {notification.relatedModel}{notification.relatedId ? ` · ${String(notification.relatedId).slice(-6)}` : ''}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                        {destination && <button type="button" onClick={open} className="text-primary-600 hover:underline">View details</button>}
                        {!notification.isRead && <button type="button" onClick={() => onRead(notification._id)} className="text-primary-600 hover:underline" aria-label={`Mark ${notification.title} as read`}>Mark as read</button>}
                        {onDelete && <button type="button" onClick={() => onDelete(notification._id)} className="notification-delete inline-flex items-center gap-1 hover:underline" aria-label={`Delete notification: ${notification.title}`}><Trash2 size={13} aria-hidden="true" />Delete</button>}
                    </div>
                </div>
            </div>
        </article>
    );
};

export default NotificationEntry;
