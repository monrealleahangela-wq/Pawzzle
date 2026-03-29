import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, Trash2, ExternalLink } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import formatDistanceToNow from 'date-fns/formatDistanceToNow';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NotificationBell = () => {
    const [isOpen, setIsOpen] = useState(false);
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllRead,
        deleteNotification
    } = useNotifications();
    const { user } = useAuth();
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = (notification) => {
        if (!notification.isRead) {
            markAsRead(notification._id);
        }
        setIsOpen(false);

        // Navigation based on notification type
        if (notification.relatedModel === 'Order') {
            navigate(notification.type === 'new_order' ? '/admin/orders' : `/orders/${notification.relatedId}`);
        } else if (notification.relatedModel === 'Booking') {
            navigate(notification.type === 'new_booking' ? '/admin/bookings' : '/bookings');
        } else if (notification.relatedModel === 'StoreApplication') {
            if (user?.role === 'super_admin') {
                navigate('/superadmin/store-applications');
            } else {
                navigate('/account-upgrade');
            }
        } else if (notification.type === 'new_follow') {
            navigate('/profile?tab=followers');
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-600 hover:text-primary-600 transition-colors bg-white/50 rounded-xl border border-slate-100"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="fixed left-4 right-4 top-[80px] sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-3 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                        <h3 className="font-black text-xs uppercase tracking-widest text-slate-900">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-[10px] font-bold text-primary-600 uppercase tracking-tight hover:underline"
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>

                    <div className="max-h-[60vh] sm:max-h-[400px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                                <p className="text-sm text-slate-400 font-medium">All caught up!</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {notifications.map((n) => (
                                    <div
                                        key={n._id}
                                        className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer relative group ${!n.isRead ? 'bg-primary-50/30' : ''}`}
                                        onClick={() => handleNotificationClick(n)}
                                    >
                                        <div className="flex gap-4">
                                            <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${!n.isRead ? 'bg-primary-500' : 'bg-transparent'}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <p className="font-bold text-xs text-slate-900 truncate uppercase tracking-tight">{n.title}</p>
                                                    <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                                                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{n.message}</p>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteNotification(n._id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-3 bg-slate-50 border-t border-slate-50 text-center">
                        <button className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-primary-600 transition-colors">
                            View Search History
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
