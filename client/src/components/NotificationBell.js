import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';
import NotificationEntry from './NotificationEntry';

const NotificationBell = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { notifications, unreadCount, loading, error, fetchNotifications, markAsRead, markAllRead, deleteNotification } = useNotifications();
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        closeRef.current?.focus();
        const onPointerDown = event => {
            if (!containerRef.current?.contains(event.target)) setIsOpen(false);
        };
        const onKeyDown = event => {
            if (event.key === 'Escape') {
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen]);

    return (
        <div className="relative" ref={containerRef}>
            <button ref={triggerRef} type="button" onClick={() => setIsOpen(value => !value)}
                aria-label={isOpen ? 'Close notifications' : `Open notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={isOpen} aria-controls="notification-popover" aria-haspopup="dialog"
                className="notification-trigger relative rounded-xl border p-2 transition-colors">
                <Bell className="h-5 w-5" aria-hidden="true" />
                {unreadCount > 0 && <span className="notification-count absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {isOpen && <div id="notification-popover" role="dialog" aria-label="Notifications"
                className="notification-popover fixed inset-x-3 top-16 z-[100] flex max-h-[min(75dvh,34rem)] flex-col overflow-hidden rounded-xl border shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
                <div className="notification-section flex shrink-0 items-center justify-between border-b p-3">
                    <h2 className="notification-title mb-0 text-sm font-bold">Notifications</h2>
                    <div className="flex items-center gap-2">
                        {unreadCount > 0 && <button type="button" onClick={markAllRead} className="text-xs font-semibold text-primary-600 hover:underline">Mark all as read</button>}
                        <button ref={closeRef} type="button" onClick={() => { setIsOpen(false); triggerRef.current?.focus(); }} aria-label="Close notification panel" className="rounded p-1 focus-visible:outline-2 focus-visible:outline-primary-600"><X size={17} aria-hidden="true" /></button>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
                    {error && <div role="alert" className="p-4 text-sm">{error} <button type="button" onClick={fetchNotifications} className="font-semibold text-primary-600 underline">Retry</button></div>}
                    {loading && notifications.length === 0 ? <p className="notification-meta p-5 text-sm" role="status">Loading notifications…</p>
                        : !error && notifications.length === 0 ? <p className="notification-empty p-5 text-center text-sm">All caught up!</p>
                            : notifications.map(notification => <NotificationEntry key={notification._id} notification={notification} onRead={markAsRead} onDelete={deleteNotification} onOpen={() => setIsOpen(false)} />)}
                </div>
                <div className="notification-section shrink-0 border-t p-3 text-center">
                    <Link to="/notifications" onClick={() => setIsOpen(false)} className="text-xs font-semibold text-primary-600 hover:underline">View All Notifications</Link>
                </div>
            </div>}
        </div>
    );
};

export default NotificationBell;
