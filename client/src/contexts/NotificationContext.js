import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import notificationService from '../services/notificationService';
import { useAuth } from './AuthContext';
import socket from '../utils/socket';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
    const { user, token } = useAuth();
    const userId = String(user?._id || user?.id || '');
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [revision, setRevision] = useState(0);
    const requestNumber = useRef(0);
    const activeUser = useRef(userId);
    activeUser.current = userId;

    const fetchNotifications = useCallback(async () => {
        if (!userId) return false;
        const request = ++requestNumber.current;
        setLoading(true);
        try {
            const response = await notificationService.getNotifications({ page: 1, limit: 10 });
            if (request !== requestNumber.current || activeUser.current !== userId) return false;
            const rows = response.data.notifications || [];
            setNotifications(rows);
            setUnreadCount(response.data.unreadCount ?? rows.filter(row => !row.isRead).length);
            setError(null);
            setRevision(value => value + 1);
            return true;
        } catch (_error) {
            if (request === requestNumber.current && activeUser.current === userId) {
                setError('Notifications could not be loaded. Please retry.');
            }
            return false;
        } finally {
            if (request === requestNumber.current && activeUser.current === userId) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        requestNumber.current += 1;
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
        setError(null);
        if (!userId) return undefined;

        fetchNotifications();
        // A socket must not retain the previous user's room after account changes.
        if (socket.connected) socket.disconnect();
        socket.connect();
        const receiveNotification = notification => {
            if (String(notification?.recipient) === userId) fetchNotifications();
        };
        socket.on('newNotification', receiveNotification);
        const interval = setInterval(() => {
            if (!document.hidden) fetchNotifications();
        }, 30000);
        return () => {
            requestNumber.current += 1;
            clearInterval(interval);
            socket.off('newNotification', receiveNotification);
            socket.disconnect();
        };
    }, [userId, token, fetchNotifications]);

    const mutate = async operation => {
        try {
            await operation();
            return await fetchNotifications();
        } catch (_error) {
            setError('Notification action failed. Please retry.');
            return false;
        }
    };

    return (
        <NotificationContext.Provider value={{
            notifications, unreadCount, loading, error, revision, fetchNotifications,
            markAsRead: id => mutate(() => notificationService.markAsRead(id)),
            markAllRead: () => mutate(() => notificationService.markAllAsRead()),
            deleteNotification: id => mutate(() => notificationService.deleteNotification(id))
        }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
    return context;
};
