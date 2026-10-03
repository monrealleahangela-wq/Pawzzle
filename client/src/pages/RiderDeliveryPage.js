import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import RiderDeliveryWorkspace from '../components/delivery/RiderDeliveryWorkspace';
import { deliveryService } from '../services/apiService';
import socket, { clearDeliveryCapability } from '../utils/socket';

export default function RiderDeliveryPage() {
  const { deliveryId } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState('');
  const lastLocationAt = useRef(0);
  const load = useCallback(async () => {
    try {
      const response = await deliveryService.getRiderDelivery(deliveryId);
      setDelivery(response.data.delivery); setError('');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load this assigned delivery.'); }
  }, [deliveryId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    clearDeliveryCapability();
    if (!socket.connected) socket.connect();
    socket.emit('joinDelivery', deliveryId);
    const refresh = payload => String(payload?.deliveryId) === String(deliveryId) && load();
    socket.on('statusChanged', refresh); socket.on('deliveryUpdate', refresh); socket.on('newMessage', refresh);
    return () => { socket.off('statusChanged', refresh); socket.off('deliveryUpdate', refresh); socket.off('newMessage', refresh); };
  }, [deliveryId, load]);

  useEffect(() => {
    if (!delivery?.isLive || !navigator.geolocation) return undefined;
    const watch = navigator.geolocation.watchPosition(async position => {
      if (Date.now() - lastLocationAt.current < 15000) return;
      lastLocationAt.current = Date.now();
      try {
        await deliveryService.updateRiderLocation(deliveryId, { lat: position.coords.latitude, lng: position.coords.longitude, heading: position.coords.heading, speed: position.coords.speed });
      } catch (requestError) {
        if (requestError.response?.status === 403) navigator.geolocation.clearWatch(watch);
      }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [deliveryId, delivery?.isLive]);

  const updateStatus = async status => {
    try { await deliveryService.updateRiderStatus(deliveryId, status); await load(); }
    catch (requestError) { toast.error(requestError.response?.data?.message || 'Unable to update delivery status.'); }
  };
  const sendMessage = content => deliveryService.sendRiderMessage(deliveryId, { content });
  if (error) return <div className="mx-auto mt-10 max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>;
  if (!delivery) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Loading assigned delivery…</div>;
  return <RiderDeliveryWorkspace delivery={delivery} token={deliveryId} onStatusUpdate={updateStatus} onSendMessage={sendMessage} onRefresh={load}/>;
}
