import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, MapPin, MessageSquare, Package, Phone, Send, Truck, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { deliveryService } from '../services/apiService';
import socket, { clearDeliveryCapability, setDeliveryCapability } from '../utils/socket';

const validCoords = value => Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lng))
  && Number(value.lat) >= -90 && Number(value.lat) <= 90 && Number(value.lng) >= -180 && Number(value.lng) <= 180;
const marker = (label, color) => L.divIcon({
  className: '',
  html: `<div aria-label="${label}" style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(15,23,42,.3)"><span style="display:block;transform:rotate(45deg);font-size:13px;text-align:center;line-height:24px;color:white">●</span></div>`,
  iconSize: [30, 30], iconAnchor: [15, 30]
});
const riderMarker = marker('Rider', '#8B4513');
const storeMarker = marker('Store', '#f97316');
const customerMarker = marker('Customer', '#0f766e');
const addressText = value => [value?.street, value?.barangay, value?.city, value?.province || value?.state, value?.zipCode].filter(Boolean).join(', ');
const statusLabel = value => ({ pending:'Preparing delivery', unassigned:'Awaiting rider', assigned:'Rider assigned', accepted:'Rider assigned', picked_up:'Picked up', in_transit:'Out for delivery', arrived:'Rider arrived', delivered:'Delivered', failed_attempt:'Delivery attempt issue', returned_to_store:'Returned to store', cancelled:'Cancelled' }[value] || String(value || '').replace(/_/g,' '));

export default function DeliveryTracking() {
  const { token } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaint, setComplaint] = useState({ type: 'other', content: '' });
  const chatEnd = useRef(null);
  const load = useCallback(async () => {
    try { const response = await deliveryService.getTracking(token); setDelivery(response.data.delivery); setError(''); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load delivery tracking.'); }
  }, [token]);

  useEffect(() => {
    load(); setDeliveryCapability(token); if (!socket.connected) socket.connect();
    return () => { socket.disconnect(); clearDeliveryCapability(); };
  }, [load, token]);
  useEffect(() => {
    if (!delivery?._id) return undefined;
    socket.emit('joinDelivery', delivery._id);
    const location = data => String(data.deliveryId) === String(delivery._id) && setDelivery(current => ({ ...current, riderLocation: { lat:data.lat, lng:data.lng, heading:data.heading, speed:data.speed, lastUpdated:data.lastUpdated } }));
    const status = data => { if (String(data.deliveryId) !== String(delivery._id)) return; setDelivery(current=>({...current,status:data.status})); toast.info(`Delivery status: ${statusLabel(data.status)}`); };
    const chat = data => String(data.deliveryId) === String(delivery._id) && setDelivery(current=>({...current,chat:[...(current.chat||[]),data]}));
    const refresh = data => String(data.deliveryId) === String(delivery._id) && load();
    socket.on('locationUpdate',location); socket.on('statusChanged',status); socket.on('newMessage',chat); socket.on('deliveryUpdate',refresh);
    return () => { socket.off('locationUpdate',location); socket.off('statusChanged',status); socket.off('newMessage',chat); socket.off('deliveryUpdate',refresh); };
  }, [delivery?._id, load]);
  useEffect(() => { if (chatOpen) chatEnd.current?.scrollIntoView({ behavior:'smooth' }); }, [chatOpen, delivery?.chat]);

  const order = delivery?.order;
  const booking = delivery?.booking;
  const store = order?.store || booking?.store;
  const destination = order?.shippingAddress || booking?.serviceAddress;
  const storeCoords = store?.contactInfo?.address?.coordinates || store?.address?.coordinates;
  const center = validCoords(delivery?.riderLocation) ? delivery.riderLocation : validCoords(destination?.coordinates) ? destination.coordinates : validCoords(storeCoords) ? storeCoords : { lat:14.5995,lng:120.9842 };
  const rider = delivery?.assignedRider;

  const send = async event => {
    event.preventDefault(); if (!message.trim()) return;
    try { await deliveryService.sendMessage(token,{content:message.trim()}); setMessage(''); }
    catch (requestError) { toast.error(requestError.response?.data?.message || 'Message could not be sent.'); }
  };
  const submitComplaint = async event => {
    event.preventDefault(); if (!complaint.content.trim()) return;
    try { await deliveryService.submitComplaint(token,complaint); setComplaintOpen(false); setComplaint({type:'other',content:''}); toast.success('Delivery concern submitted.'); }
    catch (requestError) { toast.error(requestError.response?.data?.message || 'Unable to submit concern.'); }
  };

  if (error) return <div className="flex min-h-screen items-center justify-center p-6"><div className="max-w-sm rounded-2xl border bg-white p-6 text-center"><AlertCircle className="mx-auto mb-3 text-rose-500"/><h1 className="font-black">Tracking unavailable</h1><p className="mt-2 text-sm text-slate-500">{error}</p></div></div>;
  if (!delivery) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading live delivery…</div>;
  return <div className="min-h-screen bg-slate-50 pb-20">
    <header className="border-b bg-white p-4"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Live Delivery</p><h1 className="text-lg font-black">{order?.orderNumber || `DLV-${String(delivery._id).slice(-8).toUpperCase()}`}</h1></div><span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase text-rose-700">{statusLabel(delivery.status)}</span></div></header>
    <main className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1.5fr_1fr]">
      <section className="overflow-hidden rounded-2xl border bg-white"><div className="h-[420px]"><MapContainer center={[Number(center.lat),Number(center.lng)]} zoom={14} className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{validCoords(storeCoords)&&<Marker position={[Number(storeCoords.lat),Number(storeCoords.lng)]} icon={storeMarker}><Popup>Pickup: {store?.name || 'Store'}</Popup></Marker>}{validCoords(destination?.coordinates)&&<Marker position={[Number(destination.coordinates.lat),Number(destination.coordinates.lng)]} icon={customerMarker}><Popup>Delivery destination</Popup></Marker>}{validCoords(delivery.riderLocation)&&<Marker position={[Number(delivery.riderLocation.lat),Number(delivery.riderLocation.lng)]} icon={riderMarker}><Popup>{rider?`${rider.firstName} ${rider.lastName}`:'Assigned rider'} · updated {delivery.riderLocation.lastUpdated?new Date(delivery.riderLocation.lastUpdated).toLocaleTimeString():'recently'}</Popup></Marker>}</MapContainer></div><div className="p-4"><p className="text-[10px] font-black uppercase text-slate-400">Delivery destination</p><p className="mt-1 text-sm font-bold"><MapPin className="mr-1 inline h-4 w-4"/>{addressText(destination)||'Address unavailable'}</p></div></section>
      <aside className="space-y-4"><section className="rounded-2xl border bg-white p-4"><Truck color="#8B4513" className="mb-2"/><p className="text-[10px] font-black uppercase text-slate-400">Current status</p><h2 className="mt-1 text-xl font-black">{statusLabel(delivery.status)}</h2><p className="mt-2 text-xs text-slate-500">Updates shown here are persisted by Pawzzle before they are broadcast.</p></section>
      <section className="rounded-2xl border bg-white p-4"><p className="text-[10px] font-black uppercase text-slate-400">Assigned rider</p>{rider?<><h2 className="mt-1 font-black">{rider.firstName} {rider.lastName}</h2><p className="text-xs text-slate-500">{rider.riderProfile?.vehicleType} {rider.riderProfile?.plateNumber}</p><div className="mt-3 grid grid-cols-2 gap-2"><a href={rider.phone?`tel:${rider.phone}`:undefined} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-black text-white"><Phone size={15}/>Call</a><button onClick={()=>setChatOpen(true)} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-black text-white"><MessageSquare size={15}/>Message</button></div></>:<p className="mt-2 text-sm text-slate-500">Awaiting rider assignment.</p>}</section>
      <section className="rounded-2xl border bg-white p-4"><p className="text-[10px] font-black uppercase text-slate-400">Parcel</p><p className="mt-1 text-sm font-bold"><Package className="mr-1 inline h-4 w-4"/>{delivery.parcel?.weightKg?`${delivery.parcel.weightKg} kg · ${delivery.parcel.parcelCount} parcel(s)`:'Parcel details pending'}</p><button onClick={()=>setComplaintOpen(true)} className="mt-3 text-xs font-black text-rose-600">Report a delivery concern</button></section></aside>
    </main>
    {chatOpen&&<div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/60 sm:items-center"><div className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"><div className="flex justify-between border-b p-4"><b>Delivery messages</b><button onClick={()=>setChatOpen(false)}><X/></button></div><div className="max-h-[50vh] space-y-2 overflow-y-auto bg-slate-50 p-4">{(delivery.chat||[]).map((item,index)=><div key={`${item.timestamp}-${index}`} className={`max-w-[85%] rounded-xl p-3 text-xs ${item.sender==='customer'?'ml-auto bg-rose-600 text-white':'border bg-white'}`}>{item.content}<p className="mt-1 text-[9px] opacity-60">{item.sender}</p></div>)}<div ref={chatEnd}/></div><form onSubmit={send} className="flex gap-2 border-t p-3"><input value={message} onChange={event=>setMessage(event.target.value)} maxLength={1000} className="h-11 flex-1 rounded-xl border px-3 text-sm" placeholder="Message your rider"/><button className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><Send size={16}/></button></form></div></div>}
    {complaintOpen&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"><form onSubmit={submitComplaint} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5"><div className="flex justify-between"><b>Report delivery concern</b><button type="button" onClick={()=>setComplaintOpen(false)}><X/></button></div><select value={complaint.type} onChange={event=>setComplaint({...complaint,type:event.target.value})} className="h-11 w-full rounded-xl border px-3"><option value="suspicious_location">Location concern</option><option value="damaged_items">Damaged items</option><option value="other">Other</option></select><textarea required maxLength={1000} value={complaint.content} onChange={event=>setComplaint({...complaint,content:event.target.value})} className="h-28 w-full rounded-xl border p-3" placeholder="Describe the concern"/><button className="h-11 w-full rounded-xl bg-rose-600 text-xs font-black text-white">Submit concern</button></form></div>}
  </div>;
}
