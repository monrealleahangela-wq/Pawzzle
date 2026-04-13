import { useEffect } from 'react';
import io from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

const SOCKET_URL = window.location.origin.includes('localhost') 
  ? 'http://localhost:5000' 
  : window.location.origin;

/**
 * Hook for real-time dashboard updates
 * @param {Object} config - { onInventoryUpdate, onOrderUpdate, onNewOrder, onServiceUpdate, onSettingsUpdate }
 */
export const useRealTimeUpdates = (config = {}) => {
  const { user } = useAuth();
  const { onInventoryUpdate, onOrderUpdate, onNewOrder, onServiceUpdate, onSettingsUpdate } = config;

  useEffect(() => {
    if (!user) return;

    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      console.log('🔌 Connected to real-time hub');
      
      // Join store room if user belongs to one
      if (user.store) {
        socket.emit('joinStore', typeof user.store === 'string' ? user.store : user.store._id);
      } else if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'staff') {
         // Join admin room for general updates
         socket.emit('joinAdmin');
      }
    });

    if (onInventoryUpdate) socket.on('inventoryUpdate', onInventoryUpdate);
    if (onOrderUpdate) socket.on('orderUpdate', onOrderUpdate);
    if (onNewOrder) socket.on('newOrder', onNewOrder);
    if (onServiceUpdate) socket.on('serviceUpdate', onServiceUpdate);
    if (onSettingsUpdate) socket.on('settingsUpdate', onSettingsUpdate);

    return () => {
      socket.disconnect();
    };
  }, [user, onInventoryUpdate, onOrderUpdate, onNewOrder, onServiceUpdate, onSettingsUpdate]);
};
