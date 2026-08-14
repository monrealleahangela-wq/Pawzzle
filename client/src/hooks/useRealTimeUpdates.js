import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import socket from '../utils/socket';

/**
 * Hook for authenticated real-time dashboard updates.
 * @param {Object} config - Authenticated dashboard event callbacks.
 */
export const useRealTimeUpdates = (config = {}) => {
  const { user } = useAuth();
  const {
    onInventoryUpdate, onOrderUpdate, onNewOrder, onServiceUpdate, onSettingsUpdate,
    onBookingUpdate, onDeliveryUpdate, onPaymentUpdate, onNotification, onDashboardUpdate
  } = config;

  useEffect(() => {
    if (!user) return;

    const joinAuthorizedRooms = () => {
      if (user.store) {
        socket.emit('joinStore', typeof user.store === 'string' ? user.store : user.store._id);
      } else if (user.role === 'super_admin' || user.role === 'platform_admin') {
        socket.emit('joinAdmin');
      }
    };

    socket.on('connect', joinAuthorizedRooms);
    if (socket.connected) joinAuthorizedRooms();
    else socket.connect();

    if (onInventoryUpdate) socket.on('inventoryUpdate', onInventoryUpdate);
    if (onOrderUpdate) socket.on('orderUpdate', onOrderUpdate);
    if (onNewOrder) socket.on('newOrder', onNewOrder);
    if (onServiceUpdate) socket.on('serviceUpdate', onServiceUpdate);
    if (onSettingsUpdate) socket.on('settingsUpdate', onSettingsUpdate);
    if (onBookingUpdate) socket.on('bookingUpdate', onBookingUpdate);
    if (onDeliveryUpdate) socket.on('deliveryUpdate', onDeliveryUpdate);
    if (onPaymentUpdate) socket.on('paymentUpdate', onPaymentUpdate);
    if (onNotification) socket.on('newNotification', onNotification);
    if (onDashboardUpdate) socket.on('dashboardUpdate', onDashboardUpdate);

    return () => {
      socket.off('connect', joinAuthorizedRooms);
      if (onInventoryUpdate) socket.off('inventoryUpdate', onInventoryUpdate);
      if (onOrderUpdate) socket.off('orderUpdate', onOrderUpdate);
      if (onNewOrder) socket.off('newOrder', onNewOrder);
      if (onServiceUpdate) socket.off('serviceUpdate', onServiceUpdate);
      if (onSettingsUpdate) socket.off('settingsUpdate', onSettingsUpdate);
      if (onBookingUpdate) socket.off('bookingUpdate', onBookingUpdate);
      if (onDeliveryUpdate) socket.off('deliveryUpdate', onDeliveryUpdate);
      if (onPaymentUpdate) socket.off('paymentUpdate', onPaymentUpdate);
      if (onNotification) socket.off('newNotification', onNotification);
      if (onDashboardUpdate) socket.off('dashboardUpdate', onDashboardUpdate);
    };
  }, [user, onInventoryUpdate, onOrderUpdate, onNewOrder, onServiceUpdate, onSettingsUpdate, onBookingUpdate, onDeliveryUpdate, onPaymentUpdate, onNotification, onDashboardUpdate]);
};
