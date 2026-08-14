import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import notificationService from '../services/notificationService';
import { useAuth } from './AuthContext';
import socket from '../utils/socket';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading] = useState(false);
    const { user } = useAuth();

    const fetchNotifications = useCallback(async () => {
        if (!user) return;

        try {
            const response = await notificationService.getNotifications();
            const notifs = response.data.notifications;
            setNotifications(notifs);
            setUnreadCount(notifs.filter(n => !n.isRead).length);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchNotifications();
            const receiveNotification = notification => {
                setNotifications(previous => previous.some(item => item._id === notification._id)
                    ? previous
                    : [notification, ...previous]);
                if (!notification.isRead) setUnreadCount(previous => previous + 1);
            };
            socket.on('newNotification', receiveNotification);
            if (!socket.connected) socket.connect();
            // Poll for new notifications every 30 seconds
            const interval = setInterval(() => {
                if (!document.hidden) fetchNotifications();
            }, 30000);
            return () => {
                clearInterval(interval);
                socket.off('newNotification', receiveNotification);
            };
        } else {
            setNotifications([]);
            setUnreadCount(0);
        }
    }, [user, fetchNotifications]);

    const markAsRead = async (id) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev =>
                prev.map(n => n._id === id ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const markAllRead = async () => {
        try {
            await notificationService.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    };

    const deleteNotification = async (id) => {
        try {
            await notificationService.deleteNotification(id);
            const wasUnread = notifications.find(n => n._id === id)?.isRead === false;
            setNotifications(prev => prev.filter(n => n._id !== id));
            if (wasUnread) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    };

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            loading,
            fetchNotifications,
            markAsRead,
            markAllRead,
            deleteNotification
        }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};
