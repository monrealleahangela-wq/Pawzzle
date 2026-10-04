import React, { useState, useRef, useEffect } from 'react';
import { Bell, Trash2 } from 'lucide-react';
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

        // 1. Explicit Redirect (Priority)
        if (notification.targetUrl) {
            navigate(notification.targetUrl);
            return;
        }

        // 2. Navigation based on notification data
        const isSellerOrStaff = ['seller', 'store_owner', 'staff'].includes(user?.role);
        const isAdmin = ['admin', 'super_admin'].includes(user?.role);

        if (notification.relatedModel === 'Order') {
            if (isSellerOrStaff || isAdmin) {
                // Navigate to the specific order detail for admin/staff
                navigate(`/admin/orders/${notification.relatedId}`);
            } else {
                // Navigate to customer order detail
                navigate(`/orders/${notification.relatedId}`);
            }
        } else if (notification.relatedModel === 'Booking') {
            if (isSellerOrStaff || isAdmin) {
                // BookingsManagement uses query param 'id' to highlight/open
                navigate(`/admin/bookings?id=${notification.relatedId}`);
            } else {
                navigate(`/bookings?id=${notification.relatedId}`);
            }
        } else if (notification.relatedModel === 'StoreApplication' || notification.type === 'store_application') {
            if (user?.role === 'super_admin') {
                navigate('/superadmin/store-applications');
            } else {
                navigate('/account-upgrade');
            }
        } else if (notification.type === 'new_follow') {
            navigate('/profile?tab=followers');
        } else if (notification.type === 'chat_message' || notification.relatedModel === 'Conversation') {
            if (isSellerOrStaff || isAdmin) {
                navigate(`/admin/chat?conversationId=${notification.relatedId}`);
            } else {
                // For customers, try to navigate to messages page or just let floating chat handle it if on home
                navigate(`/messages/${notification.relatedId}`);
            }
        } else if (notification.relatedModel === 'Report') {
            if (user?.role === 'super_admin') {
                navigate('/superadmin/reports');
            }
        } else if (notification.relatedModel === 'User') {
             if (user?.role === 'super_admin') {
                navigate(`/superadmin/account-management?search=${notification.relatedId}`);
             }
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label={isOpen ? 'Close notifications' : `Open notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                className="notification-trigger relative rounded-xl border p-2 transition-colors"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="notification-count absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div
                    role="dialog"
                    aria-label="Notifications"
                    className="notification-popover fixed left-3 right-3 top-[64px] z-[100] overflow-hidden rounded-xl border shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
                >
                    <div className="notification-section flex items-center justify-between border-b p-3">
                        <h3 className="notification-title font-black text-xs uppercase tracking-widest">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={markAllRead}
                                className="text-[10px] font-bold text-primary-600 uppercase tracking-tight hover:underline"
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>

                    <div className="max-h-[60vh] sm:max-h-[400px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center">
                                <Bell className="notification-empty mx-auto mb-3 h-8 w-8" />
                                <p className="notification-empty text-sm font-medium">All caught up!</p>
                            </div>
                        ) : (
                            <div>
                                {notifications.map((n) => (
                                    <div
                                        key={n._id}
                                        className={`notification-item flex items-start gap-2 border-b border-slate-100 p-3 transition-colors last:border-b-0 ${!n.isRead ? 'notification-item-unread' : ''}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleNotificationClick(n)}
                                            className="flex min-w-0 flex-1 gap-3 text-left"
                                        >
                                            <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${!n.isRead ? 'bg-primary-500' : 'bg-transparent'}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <p className="notification-title truncate text-xs font-bold uppercase tracking-tight">{n.title}</p>
                                                    <span className="notification-meta whitespace-nowrap text-[10px] font-medium">
                                                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className="notification-copy line-clamp-2 text-xs leading-relaxed">{n.message}</p>
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Delete notification: ${n.title}`}
                                            onClick={() => deleteNotification(n._id)}
                                            className="notification-delete inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="notification-section border-t p-3 text-center">
                        <button type="button" className="notification-meta text-[10px] font-black uppercase tracking-[0.2em] transition-colors hover:text-primary-600">
                            View Search History
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
