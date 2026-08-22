import React, { useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Clock, HelpCircle, MessageSquare, Navigation, Package, Phone, Send, Truck, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { deliveryService } from '../../services/apiService';
import { formatPeso } from '../../utils/paymentSummary';

const STATUS = {
  pending: 'Assigned', assigned: 'Assigned', accepted: 'Assigned', picked_up: 'Picked Up',
  in_transit: 'Out for Delivery', arrived: 'Arrived', delivered: 'Delivered',
  failed_attempt: 'Delivery Attempted', returned_to_store: 'Failed', cancelled: 'Cancelled'
};
const QUICK_MESSAGES = [
  "I'm on my way with your parcel.", 'I have arrived at your delivery location.',
  'Please meet me at the delivery location.', 'I need help locating your address.',
  'I am unable to contact you.'
];
const FAILURE_REASONS = [
  ['customer_unavailable', 'Customer unavailable'], ['cannot_contact', 'Customer cannot be contacted'],
  ['incorrect_address', 'Incorrect address'], ['customer_refused', 'Customer refused parcel'],
  ['establishment_closed', 'Establishment closed'], ['address_inaccessible', 'Address inaccessible'], ['other', 'Other']
];

const formatAddress = address => address ? [address.street, address.barangay, address.city, address.province, address.zipCode].filter(Boolean).join(', ') : 'Address unavailable';
const formatTime = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;

export default function RiderDeliveryWorkspace({ delivery, token, eta, distanceKm, onStatusUpdate, onSendMessage, onRefresh }) {
  const [showProof, setShowProof] = useState(false);
  const [showFailure, setShowFailure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [proof, setProof] = useState({ photo: '', signature: '', otp: '', notes: '', codPaymentStatus: '' });
  const [failure, setFailure] = useState({ reason: 'customer_unavailable', notes: '', photo: '' });
  const order = delivery.order;
  const booking = delivery.booking;
  const recipient = order?.customer || booking?.customer;
  const address = order?.shippingAddress || booking?.serviceAddress;
  const coords = address?.coordinates;
  const phone = order?.phoneNumber || recipient?.phoneNumber;
  const instructions = order?.notes || booking?.notes;
  const tracking = order?.trackingNumber || order?.orderNumber || `DLV-${String(delivery._id).slice(-8).toUpperCase()}`;
  const isCod = ['cod', 'cash_on_delivery'].includes(order?.paymentMethod);
  const completed = delivery.status === 'delivered';

  const timeline = useMemo(() => {
    if (delivery.statusHistory?.length) return delivery.statusHistory;
    return [
      { status: 'pending', timestamp: delivery.createdAt },
      delivery.pickedUpAt && { status: 'picked_up', timestamp: delivery.pickedUpAt },
      delivery.arrivedAt && { status: 'arrived', timestamp: delivery.arrivedAt },
      delivery.deliveredAt && { status: 'delivered', timestamp: delivery.deliveredAt }
    ].filter(Boolean);
  }, [delivery]);

  const currentLocation = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(undefined), { enableHighAccuracy: true, timeout: 7000 });
  });
  const uploadPhoto = async (file, target) => {
    if (!file) return;
    try {
      const body = new FormData(); body.append('image', file);
      const response = await deliveryService.uploadDeliveryProof(token, body);
      const url = response.data.url || response.data.imageUrl;
      if (!url) throw new Error('No uploaded image URL');
      target === 'proof' ? setProof(p => ({ ...p, photo: url })) : setFailure(p => ({ ...p, photo: url }));
      toast.success('Photo attached');
    } catch { toast.error('Photo upload failed. Check camera permission and try again.'); }
  };
  const quickMessage = async message => {
    try { await onSendMessage(message); toast.success('Message sent'); } catch { toast.error('Message could not be sent'); }
  };
  const submitCustomMessage = async event => {
    event.preventDefault();
    if (!customMessage.trim()) return;
    await quickMessage(customMessage.trim());
    setCustomMessage('');
    await onRefresh();
  };
  const navigate = () => {
    const destination = coords?.lat && coords?.lng ? `${coords.lat},${coords.lng}` : encodeURIComponent(formatAddress(address));
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank', 'noopener,noreferrer');
  };
  const complete = async event => {
    event.preventDefault();
    if (isCod && !proof.codPaymentStatus) return toast.error('Record the COD payment status.');
    if (!window.confirm('Confirm that this parcel was delivered to the recipient?')) return;
    setSubmitting(true);
    try {
      const location = await currentLocation();
      await deliveryService.completeDelivery(token, { ...proof, location, method: proof.otp ? 'otp' : proof.photo ? 'photo' : proof.signature ? 'signature' : 'notes' });
      toast.success('Delivery completed'); setShowProof(false); await onRefresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to complete delivery'); }
    finally { setSubmitting(false); }
  };
  const reportFailure = async event => {
    event.preventDefault();
    if (!window.confirm('Submit this failed delivery attempt?')) return;
    setSubmitting(true);
    try {
      const location = await currentLocation();
      await deliveryService.reportFailedDelivery(token, { ...failure, location });
      toast.success('Delivery issue recorded'); setShowFailure(false); await onRefresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to report issue'); }
    finally { setSubmitting(false); }
  };

  if (completed) return <div className="min-h-[100dvh] bg-slate-50 p-4 flex items-center justify-center"><section className="w-full max-w-lg bg-white border rounded-2xl p-6 text-center shadow-sm"><CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3"/><p className="text-[10px] font-black uppercase tracking-[.25em] text-emerald-600">Delivery completed</p><h1 className="text-xl font-black text-slate-900 mt-1">{tracking}</h1><div className="mt-5 text-left divide-y text-sm"><p className="py-3"><b>Recipient:</b> {recipient?.firstName} {recipient?.lastName}</p><p className="py-3"><b>Completed:</b> {formatTime(delivery.deliveredAt)}</p><p className="py-3"><b>Verification:</b> {delivery.proofOfDelivery?.method || 'Recorded proof'}</p>{isCod && <p className="py-3"><b>COD:</b> {delivery.proofOfDelivery?.codPaymentStatus?.replace(/_/g, ' ')}</p>}</div><p className="mt-5 text-xs text-slate-500">This secure rider link is now inactive.</p></section></div>;

  return <div className="min-h-[100dvh] bg-slate-50 pb-24 text-slate-900">
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b px-4 py-3"><div className="max-w-3xl mx-auto flex items-center justify-between gap-3"><button onClick={()=>window.history.back()} className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center" aria-label="Back"><ArrowLeft size={18}/></button><div className="min-w-0 flex-1"><p className="text-[10px] uppercase font-black text-slate-400">{tracking}</p><h1 className="text-base font-black truncate">{STATUS[delivery.status] || delivery.status}</h1></div><a href="mailto:support@pawzzle.io" className="w-11 h-11 rounded-xl border flex items-center justify-center" aria-label="Help"><HelpCircle size={18}/></a></div></header>
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <section className="bg-slate-900 text-white rounded-2xl p-4"><p className="text-[10px] uppercase font-black text-white/50">Current status</p><div className="flex justify-between items-end gap-3"><h2 className="text-xl font-black text-white">{STATUS[delivery.status] || delivery.status}</h2>{eta && <span className="text-xs font-bold"><Clock size={14} className="inline mr-1"/>{eta} min ETA</span>}</div></section>
      <section className="bg-white border rounded-2xl p-4 space-y-4"><div><p className="text-[10px] uppercase font-black text-rose-600">Recipient</p><h2 className="text-lg font-black">{recipient?.firstName} {recipient?.lastName}</h2><p className="text-sm text-slate-600 mt-1">{formatAddress(address)}</p>{address?.landmark && <p className="text-xs text-slate-500 mt-1"><b>Landmark:</b> {address.landmark}</p>}</div><div className="grid grid-cols-2 gap-2"><a href={phone ? `tel:${phone}` : undefined} className={`h-12 rounded-xl flex items-center justify-center gap-2 text-xs font-black ${phone?'bg-emerald-600 text-white':'bg-slate-100 text-slate-400 pointer-events-none'}`}><Phone size={17}/> Call customer</a><button onClick={()=>setShowChat(true)} className="h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center gap-2 text-xs font-black"><MessageSquare size={17}/> Message</button></div></section>
      <section className="bg-white border rounded-2xl overflow-hidden"><div className="p-4"><p className="text-[10px] uppercase font-black text-slate-400">Delivery location</p><p className="text-sm font-bold mt-1">{formatAddress(address)}</p>{distanceKm != null && <p className="text-xs text-slate-500 mt-1">{distanceKm.toFixed(1)} km away {eta ? `· About ${eta} minutes` : ''}</p>}</div>{coords?.lat && coords?.lng && <div className="h-40"><MapContainer center={[coords.lat, coords.lng]} zoom={15} scrollWheelZoom={false} className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={[coords.lat, coords.lng]}/></MapContainer></div>}<div className="p-3"><button onClick={navigate} className="w-full h-12 rounded-xl bg-primary-600 text-white font-black text-xs flex items-center justify-center gap-2"><Navigation size={18}/> Navigate</button></div></section>
      <section className="bg-white border rounded-2xl p-4"><div className="flex items-center gap-2 mb-3"><Package size={17}/><h2 className="text-sm font-black">Parcel information</h2></div><div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-slate-400">Tracking</span><b className="block mt-1">{tracking}</b></div><div><span className="text-slate-400">Sender</span><b className="block mt-1">{order?.store?.name || booking?.store?.name || 'Store'}</b></div><div><span className="text-slate-400">Category</span><b className="block mt-1">{booking ? 'Service equipment' : [...new Set(order?.items?.map(i=>i.itemType) || ['Parcel'])].join(', ')}</b></div><div><span className="text-slate-400">Items</span><b className="block mt-1">{order?.items?.reduce((n,i)=>n+i.quantity,0) || 1}</b></div></div></section>
      {isCod && <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4"><p className="text-[10px] uppercase font-black text-amber-700">COD amount</p><p className="text-2xl font-black text-amber-900">{formatPeso(order.totalAmount)}</p></section>}
      {instructions && <section className="bg-rose-50 border border-rose-100 rounded-2xl p-4"><p className="text-[10px] uppercase font-black text-rose-600">Delivery instructions</p><p className="text-sm font-semibold mt-2">“{instructions}”</p></section>}
      <section className="bg-white border rounded-2xl p-4"><h2 className="text-sm font-black mb-3">Quick messages</h2><div className="flex gap-2 overflow-x-auto pb-1">{QUICK_MESSAGES.map(message=><button key={message} onClick={()=>quickMessage(message)} className="shrink-0 min-h-11 max-w-[190px] px-3 rounded-xl bg-slate-100 text-left text-xs font-bold"><Send size={13} className="inline mr-1"/>{message}</button>)}</div><button onClick={()=>setShowChat(true)} className="mt-3 text-xs font-black text-primary-600">Custom message and history →</button></section>
      <section className="bg-white border rounded-2xl p-4"><h2 className="text-sm font-black mb-3">Delivery timeline</h2><div className="space-y-3">{timeline.map((entry,index)=><div key={`${entry.status}-${index}`} className="flex gap-3"><div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 size={14}/></div><div><p className="text-xs font-black">{STATUS[entry.status] || entry.status?.replace(/_/g,' ')}</p>{entry.timestamp&&<p className="text-[10px] text-slate-400">{formatTime(entry.timestamp)}</p>}</div></div>)}</div></section>
    </main>
    {delivery.isLive && <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t p-3"><div className="max-w-3xl mx-auto flex gap-2">{['pending','assigned','accepted'].includes(delivery.status)&&<button onClick={()=>window.confirm('Start this delivery?')&&onStatusUpdate('picked_up')} className="flex-1 h-12 rounded-xl bg-slate-900 text-white text-xs font-black"><Truck size={17} className="inline mr-2"/>Start delivery</button>}{delivery.status==='picked_up'&&<button onClick={()=>window.confirm('Begin delivery transit?')&&onStatusUpdate('in_transit')} className="flex-1 h-12 rounded-xl bg-primary-600 text-white text-xs font-black">Out for delivery</button>}{delivery.status==='in_transit'&&<><button onClick={()=>setShowFailure(true)} className="h-12 px-4 rounded-xl border text-rose-600"><AlertTriangle size={18}/></button><button onClick={()=>window.confirm('Confirm arrival at the delivery location?')&&onStatusUpdate('arrived')} className="flex-1 h-12 rounded-xl bg-primary-600 text-white text-xs font-black">Arrived at location</button></>}{delivery.status==='arrived'&&<><button onClick={()=>setShowFailure(true)} className="h-12 px-4 rounded-xl border text-rose-600"><AlertTriangle size={18}/></button><button onClick={()=>setShowProof(true)} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white text-xs font-black">Confirm delivery</button></>}</div></div>}
    {showProof&&<div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-end sm:items-center justify-center"><form onSubmit={complete} className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto"><div className="flex justify-between"><h2 className="text-lg font-black">Confirm delivery</h2><button type="button" onClick={()=>setShowProof(false)}><X/></button></div><label className="h-12 border rounded-xl flex items-center justify-center gap-2 text-xs font-bold cursor-pointer"><Camera size={17}/>{proof.photo?'Photo attached':'Add photo proof'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>uploadPhoto(e.target.files[0],'proof')}/></label><input className="w-full h-11 border rounded-xl px-3 text-sm" placeholder="Delivery OTP (if provided)" value={proof.otp} onChange={e=>setProof({...proof,otp:e.target.value})}/><input className="w-full h-11 border rounded-xl px-3 text-sm" placeholder="Recipient signature/name" value={proof.signature} onChange={e=>setProof({...proof,signature:e.target.value})}/><textarea className="w-full border rounded-xl p-3 text-sm h-24" placeholder="Delivery notes" value={proof.notes} onChange={e=>setProof({...proof,notes:e.target.value})}/>{isCod&&<select required className="w-full h-11 border rounded-xl px-3" value={proof.codPaymentStatus} onChange={e=>setProof({...proof,codPaymentStatus:e.target.value})}><option value="">COD payment status</option><option value="cash_received">Cash received</option><option value="digital_received">Digital payment received</option><option value="not_received">Payment not received</option></select>}<button disabled={submitting} className="w-full h-12 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50">{submitting?'Submitting…':'Confirm delivery'}</button></form></div>}
    {showFailure&&<div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-end sm:items-center justify-center"><form onSubmit={reportFailure} className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-3"><div className="flex justify-between"><h2 className="text-lg font-black">Report delivery issue</h2><button type="button" onClick={()=>setShowFailure(false)}><X/></button></div><select className="w-full h-11 border rounded-xl px-3" value={failure.reason} onChange={e=>setFailure({...failure,reason:e.target.value})}>{FAILURE_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><textarea className="w-full border rounded-xl p-3 text-sm h-24" placeholder="Notes" value={failure.notes} onChange={e=>setFailure({...failure,notes:e.target.value})}/><label className="h-11 border rounded-xl flex items-center justify-center gap-2 text-xs font-bold cursor-pointer"><Camera size={17}/>{failure.photo?'Evidence attached':'Optional photo'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>uploadPhoto(e.target.files[0],'failure')}/></label><button disabled={submitting} className="w-full h-12 rounded-xl bg-rose-600 text-white text-xs font-black disabled:opacity-50">{submitting?'Submitting…':'Submit failed attempt'}</button></form></div>}
    {showChat&&<div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-end sm:items-center justify-center"><div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden"><div className="p-4 border-b flex justify-between"><div><h2 className="text-base font-black">Customer messages</h2><p className="text-[10px] text-slate-400">Communication history</p></div><button onClick={()=>setShowChat(false)}><X/></button></div><div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto bg-slate-50">{(delivery.chat||[]).map((message,index)=><div key={index} className={`max-w-[85%] p-3 rounded-xl text-xs ${message.sender==='rider'?'ml-auto bg-slate-900 text-white':'bg-white border'}`}><p>{message.content}</p><p className="mt-1 text-[9px] opacity-60">{message.sender} · {formatTime(message.timestamp)}</p></div>)}{!delivery.chat?.length&&<p className="text-center text-xs text-slate-400 py-6">No messages yet.</p>}</div><form onSubmit={submitCustomMessage} className="p-3 flex gap-2 border-t"><input className="flex-1 h-11 border rounded-xl px-3 text-sm" placeholder="Custom message" value={customMessage} onChange={e=>setCustomMessage(e.target.value)}/><button className="w-11 h-11 bg-slate-900 text-white rounded-xl flex items-center justify-center"><Send size={17}/></button></form></div></div>}
  </div>;
}
