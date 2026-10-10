import React, { useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Clock, HelpCircle, MessageSquare, Navigation, Package, Phone, Send, Truck, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { deliveryService } from '../../services/apiService';
import { formatPeso } from '../../utils/paymentSummary';
import ModalViewport from '../ui/ModalViewport';
import ConfirmationDialog from '../ui/ConfirmationDialog';

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
const WORKSPACE_CONTAINER = 'mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8';

const formatAddress = address => address ? [address.street, address.barangay, address.city, address.province, address.zipCode].filter(Boolean).join(', ') : 'Address unavailable';
const formatTime = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;
const validCoords = value => Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lng))
  && Number(value.lat) >= -90 && Number(value.lat) <= 90 && Number(value.lng) >= -180 && Number(value.lng) <= 180;
const destinationMarker = L.divIcon({
  className: '',
  html: '<div aria-label="Delivery destination" style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0f766e;border:3px solid white;box-shadow:0 2px 8px rgba(15,23,42,.3)"><span style="display:block;transform:rotate(45deg);font-size:13px;text-align:center;line-height:24px;color:white">●</span></div>',
  iconSize: [30, 30], iconAnchor: [15, 30]
});

export default function RiderDeliveryWorkspace({ delivery, token, eta, distanceKm, onStatusUpdate, onSendMessage, onRefresh }) {
  const [showProof, setShowProof] = useState(false);
  const [showFailure, setShowFailure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [customMessage, setCustomMessage] = useState('');
  const [proof, setProof] = useState({ photo: '', recipientName: '', otp: '', notes: '', codPaymentStatus: '' });
  const [failure, setFailure] = useState({ reason: 'customer_unavailable', notes: '', photo: '' });
  const order = delivery.order;
  const booking = delivery.booking;
  const recipient = order?.customer || booking?.customer;
  const address = order?.shippingAddress || booking?.serviceAddress;
  const coords = address?.coordinates;
  const phone = order?.phoneNumber || recipient?.phone || recipient?.phoneNumber;
  const instructions = order?.notes || booking?.notes;
  const tracking = order?.trackingNumber || order?.orderNumber || `DLV-${String(delivery._id).slice(-8).toUpperCase()}`;
  const isCod = ['cod', 'cash_on_delivery'].includes(order?.paymentMethod);
  const completed = delivery.status === 'delivered';
  const canReportFailure = ['in_transit', 'arrived'].includes(delivery.status);

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
    const destination = validCoords(coords) ? `${Number(coords.lat)},${Number(coords.lng)}` : encodeURIComponent(formatAddress(address));
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank', 'noopener,noreferrer');
  };
  const submitCompletion = async () => {
    setSubmitting(true);
    try {
      const location = await currentLocation();
      const payload = { ...proof, location, method: proof.otp ? 'otp' : proof.photo ? 'photo' : proof.recipientName ? 'recipient_acknowledgment' : 'notes' };
      if (!isCod) delete payload.codPaymentStatus;
      await deliveryService.completeDelivery(token, payload);
      toast.success('Delivery completed'); setShowProof(false); await onRefresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to complete delivery'); }
    finally { setSubmitting(false); }
  };
  const complete = event => {
    event.preventDefault();
    if (isCod && !proof.codPaymentStatus) return toast.error('Record the COD payment status.');
    if (!proof.photo && !proof.otp && !proof.recipientName.trim() && !proof.notes.trim()) return toast.error('Add delivery proof before continuing.');
    setConfirmation({
      title: 'Confirm delivery?',
      description: 'This completes the delivery, records the proof and releases the Rider capacity reservation.',
      confirmLabel: 'Complete delivery',
      action: submitCompletion
    });
  };
  const submitFailure = async () => {
    setSubmitting(true);
    try {
      const location = await currentLocation();
      await deliveryService.reportFailedDelivery(token, { ...failure, location });
      toast.success('Delivery issue recorded'); setShowFailure(false); await onRefresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to report issue'); }
    finally { setSubmitting(false); }
  };
  const reportFailure = event => {
    event.preventDefault();
    setConfirmation({
      title: 'Submit failed delivery attempt?',
      description: 'The issue and any attached evidence will be recorded in the delivery audit trail.',
      confirmLabel: 'Submit attempt',
      action: submitFailure
    });
  };
  const confirmStatus = (status, title, description, confirmLabel) => setConfirmation({
    title, description, confirmLabel, action: () => onStatusUpdate(status)
  });
  const runConfirmedAction = async () => {
    const action = confirmation?.action;
    setConfirmation(null);
    if (action) await action();
  };

  if (completed) return <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100"><section className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"><CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500"/><p className="text-xs font-black uppercase tracking-[.25em] text-emerald-600 dark:text-emerald-400">Delivery completed</p><h1 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{tracking}</h1><div className="mt-5 divide-y text-left text-sm dark:divide-slate-800"><p className="py-3"><b>Recipient:</b> {recipient?.firstName} {recipient?.lastName}</p><p className="py-3"><b>Completed:</b> {formatTime(delivery.deliveredAt)}</p><p className="py-3"><b>Verification:</b> {delivery.proofOfDelivery?.method || 'Recorded proof'}</p>{isCod && <p className="py-3"><b>COD:</b> {delivery.proofOfDelivery?.codPaymentStatus?.replace(/_/g, ' ')}</p>}</div><p className="mt-5 text-sm text-slate-500 dark:text-slate-400">This delivery is complete and no longer accepts rider updates.</p></section></div>;

  return <div className="rider-delivery-workspace min-h-[100dvh] bg-slate-50 pb-[calc(8rem+env(safe-area-inset-bottom))] text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:pb-[calc(7rem+env(safe-area-inset-bottom))]">
    <header className="sticky top-0 z-40 border-b bg-white/95 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"><div data-testid="rider-delivery-header-container" className={`${WORKSPACE_CONTAINER} flex items-center justify-between gap-3`}><button onClick={()=>window.history.back()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-slate-800" aria-label="Back"><ArrowLeft size={18}/></button><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">{tracking}</p><h1 className="truncate text-base font-black">{STATUS[delivery.status] || delivery.status}</h1></div><a href="mailto:support@pawzzle.io" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-700" aria-label="Help"><HelpCircle size={18}/></a></div></header>
    <main data-testid="rider-delivery-content" className={`${WORKSPACE_CONTAINER} space-y-4 py-4 sm:py-6`}>
      <section className="rounded-2xl bg-slate-900 p-4 text-white"><p className="text-xs font-black uppercase text-white/70">Current status</p><div className="flex items-end justify-between gap-3"><h2 className="text-xl font-black text-white">{STATUS[delivery.status] || delivery.status}</h2>{eta && <span className="text-sm font-bold"><Clock size={14} className="mr-1 inline"/>{eta} min ETA</span>}</div></section>
      <section className="space-y-4 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div><p className="text-xs font-black uppercase text-rose-600 dark:text-rose-400">Recipient</p><h2 className="text-lg font-black">{recipient?.firstName} {recipient?.lastName}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatAddress(address)}</p>{address?.landmark && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400"><b>Landmark:</b> {address.landmark}</p>}</div><div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2"><a href={phone ? `tel:${phone}` : undefined} className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${phone?'bg-emerald-600 text-white':'pointer-events-none bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}><Phone size={17}/> Call customer</a><button onClick={()=>setShowChat(true)} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-slate-700"><MessageSquare size={17}/> Message</button></div></section>
      <section className="overflow-hidden rounded-2xl border bg-white dark:border-slate-800 dark:bg-slate-900"><div className="p-4"><p className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">Delivery location</p><p className="mt-1 text-sm font-bold">{formatAddress(address)}</p>{distanceKm != null && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{distanceKm.toFixed(1)} km away {eta ? `· About ${eta} minutes` : ''}</p>}</div>{validCoords(coords) && <div className="h-48 sm:h-56"><MapContainer center={[Number(coords.lat), Number(coords.lng)]} zoom={15} scrollWheelZoom={false} className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={[Number(coords.lat), Number(coords.lng)]} icon={destinationMarker}/></MapContainer></div>}<div className="p-3"><button onClick={navigate} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"><Navigation size={18}/> Navigate</button></div></section>
      <section className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3 flex items-center gap-2"><Package size={17}/><h2 className="text-base font-black">Parcel information</h2></div><div className="grid grid-cols-1 gap-3 text-sm min-[380px]:grid-cols-2"><div><span className="text-slate-500 dark:text-slate-400">Tracking</span><b className="mt-1 block">{tracking}</b></div><div><span className="text-slate-500 dark:text-slate-400">Sender</span><b className="mt-1 block">{order?.store?.name || booking?.store?.name || 'Store'}</b></div><div><span className="text-slate-500 dark:text-slate-400">Measured weight</span><b className="mt-1 block">{delivery.parcel?.weightKg != null ? `${delivery.parcel.weightKg} kg` : 'Not recorded'}</b></div><div><span className="text-slate-500 dark:text-slate-400">Parcel count</span><b className="mt-1 block">{delivery.parcel?.parcelCount || order?.items?.reduce((n,i)=>n+i.quantity,0) || 1}</b></div><div><span className="text-slate-500 dark:text-slate-400">Assigned vehicle</span><b className="mt-1 block capitalize">{delivery.assignedRider?.riderProfile?.capacity?.configured ? delivery.assignedRider.riderProfile.capacity.vehicleType?.replaceAll('_',' ') : 'Vehicle setup required'}</b></div><div><span className="text-slate-500 dark:text-slate-400">Remaining capacity</span><b className="mt-1 block">{delivery.assignedRider?.riderProfile?.capacity?.configured ? `${delivery.assignedRider.riderProfile.capacity.remainingWeightKg} kg · ${delivery.assignedRider.riderProfile.capacity.remainingParcelCount} parcel(s)` : 'Unavailable'}</b></div><div><span className="text-slate-500 dark:text-slate-400">Reserved load</span><b className="mt-1 block">{delivery.assignedRider?.riderProfile?.capacity?.configured ? `${delivery.assignedRider.riderProfile.capacity.reservedWeightKg} kg · ${delivery.assignedRider.riderProfile.capacity.reservedParcelCount} parcel(s)` : 'Unavailable'}</b></div><div><span className="text-slate-500 dark:text-slate-400">Category</span><b className="mt-1 block">{booking ? 'Service equipment' : [...new Set(order?.items?.map(i=>i.itemType) || ['Parcel'])].join(', ')}</b></div></div></section>
      {isCod && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"><p className="text-xs font-black uppercase text-amber-700 dark:text-amber-300">COD amount</p><p className="text-2xl font-black text-amber-900 dark:text-amber-100">{formatPeso(order.totalAmount)}</p></section>}
      {instructions && <section className="rounded-2xl border border-rose-100 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40"><p className="text-xs font-black uppercase text-rose-600 dark:text-rose-300">Delivery instructions</p><p className="mt-2 text-sm font-semibold">“{instructions}”</p></section>}
      <section className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="mb-3 text-base font-black">Quick messages</h2><div className="flex gap-2 overflow-x-auto pb-1">{QUICK_MESSAGES.map(message=><button key={message} onClick={()=>quickMessage(message)} className="min-h-11 max-w-[210px] shrink-0 rounded-xl bg-slate-100 px-3 text-left text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-slate-800"><Send size={13} className="mr-1 inline"/>{message}</button>)}</div><button onClick={()=>setShowChat(true)} className="mt-3 text-sm font-black text-primary-600 dark:text-primary-400">Custom message and history →</button></section>
      <section className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="mb-3 text-base font-black">Delivery timeline</h2><div className="space-y-3">{timeline.map((entry,index)=><div key={`${entry.status}-${index}`} className="flex gap-3"><div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={14}/></div><div><p className="text-sm font-black">{STATUS[entry.status] || entry.status?.replace(/_/g,' ')}</p>{entry.timestamp&&<p className="text-xs text-slate-500 dark:text-slate-400">{formatTime(entry.timestamp)}</p>}</div></div>)}</div></section>
    </main>
    {delivery.isLive && <div data-testid="rider-delivery-action-bar" className="fixed inset-x-0 bottom-0 z-[500] border-t bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:left-[var(--app-content-offset)]"><div data-testid="rider-delivery-action-container" className={`${WORKSPACE_CONTAINER} grid items-stretch gap-2 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] ${canReportFailure ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] sm:grid-cols-2' : 'grid-cols-1'}`}>{['pending','assigned','accepted'].includes(delivery.status)&&<button onClick={()=>confirmStatus('picked_up','Start this delivery?','Confirm that the parcel is in your possession before starting the delivery.','Start delivery')} className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-slate-700"><Truck size={17}/><span>Start delivery</span></button>}{delivery.status==='picked_up'&&<button onClick={()=>confirmStatus('in_transit','Begin delivery transit?','Confirm that you are leaving the pickup location with the parcel.','Out for delivery')} className="flex min-h-12 min-w-0 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">Out for delivery</button>}{delivery.status==='in_transit'&&<><button aria-label="Report delivery issue" onClick={()=>setShowFailure(true)} className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 text-sm font-black text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-900 dark:text-rose-300"><AlertTriangle size={18} className="shrink-0"/><span>Report issue</span></button><button onClick={()=>confirmStatus('arrived','Confirm arrival?','Confirm that you are at the customer delivery location.','Mark arrived')} className="flex min-h-12 min-w-0 items-center justify-center rounded-xl bg-primary-600 px-3 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">Arrived at location</button></>}{delivery.status==='arrived'&&<><button aria-label="Report delivery issue" onClick={()=>setShowFailure(true)} className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 text-sm font-black text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-900 dark:text-rose-300"><AlertTriangle size={18} className="shrink-0"/><span>Report issue</span></button><button onClick={()=>setShowProof(true)} className="flex min-h-12 min-w-0 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">Confirm delivery</button></>}</div></div>}
    {showProof&&<ModalViewport onClose={()=>!submitting&&setShowProof(false)} className="z-[1000] items-end p-0 sm:items-center sm:p-4"><form role="dialog" aria-modal="true" aria-labelledby="delivery-proof-title" onSubmit={complete} className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"><div className="flex shrink-0 items-center justify-between border-b p-4"><div><h2 id="delivery-proof-title" className="text-lg font-black">Confirm delivery</h2><p className="text-xs text-slate-500">Record recipient acknowledgment and available proof.</p></div><button type="button" aria-label="Close delivery confirmation" className="flex h-11 w-11 items-center justify-center rounded-xl" onClick={()=>setShowProof(false)}><X/></button></div><div className="space-y-3 overflow-y-auto p-4"><label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-xs font-bold"><Camera size={17}/>{proof.photo?'Photo attached':'Add photo proof'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>uploadPhoto(e.target.files[0],'proof')}/></label><input className="h-11 w-full rounded-xl border px-3 text-sm" placeholder="Delivery OTP (if provided)" value={proof.otp} onChange={e=>setProof({...proof,otp:e.target.value})}/><label className="block text-xs font-bold text-slate-700">Recipient name acknowledgment<input className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal" placeholder="Name of person who received the parcel" value={proof.recipientName} onChange={e=>setProof({...proof,recipientName:e.target.value})}/><span className="mt-1 block text-[10px] font-normal text-slate-500">This records the recipient name supplied to the Rider; it is not a captured handwritten signature.</span></label><textarea className="h-24 w-full rounded-xl border p-3 text-sm" placeholder="Delivery notes" value={proof.notes} onChange={e=>setProof({...proof,notes:e.target.value})}/>{isCod&&<select required className="h-11 w-full rounded-xl border px-3" value={proof.codPaymentStatus} onChange={e=>setProof({...proof,codPaymentStatus:e.target.value})}><option value="">COD payment status</option><option value="cash_received">Cash received</option><option value="digital_received">Digital payment received</option><option value="not_received">Payment not received</option></select>}</div><div className="shrink-0 border-t bg-white p-4"><button disabled={submitting} className="h-12 w-full rounded-xl bg-emerald-600 text-xs font-black text-white disabled:opacity-50">{submitting?'Submitting…':'Review and confirm delivery'}</button></div></form></ModalViewport>}
    {showFailure&&<ModalViewport onClose={()=>!submitting&&setShowFailure(false)} className="z-[1000] items-end p-0 sm:items-center sm:p-4"><form role="dialog" aria-modal="true" aria-labelledby="delivery-failure-title" onSubmit={reportFailure} className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"><div className="flex shrink-0 items-center justify-between border-b p-4"><h2 id="delivery-failure-title" className="text-lg font-black">Report delivery issue</h2><button type="button" aria-label="Close issue form" className="flex h-11 w-11 items-center justify-center rounded-xl" onClick={()=>setShowFailure(false)}><X/></button></div><div className="space-y-3 overflow-y-auto p-4"><select className="h-11 w-full rounded-xl border px-3" value={failure.reason} onChange={e=>setFailure({...failure,reason:e.target.value})}>{FAILURE_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><textarea className="h-24 w-full rounded-xl border p-3 text-sm" placeholder="Notes" value={failure.notes} onChange={e=>setFailure({...failure,notes:e.target.value})}/><label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border text-xs font-bold"><Camera size={17}/>{failure.photo?'Evidence attached':'Optional photo'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>uploadPhoto(e.target.files[0],'failure')}/></label></div><div className="shrink-0 border-t bg-white p-4"><button disabled={submitting} className="h-12 w-full rounded-xl bg-rose-600 text-xs font-black text-white disabled:opacity-50">{submitting?'Submitting…':'Review failed attempt'}</button></div></form></ModalViewport>}
    {showChat&&<ModalViewport onClose={()=>setShowChat(false)} className="z-[1000] items-end p-0 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-labelledby="rider-chat-title" className="flex h-[min(42rem,100dvh)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:h-[min(42rem,calc(100dvh-2rem))] sm:rounded-2xl"><div className="flex shrink-0 items-center justify-between border-b p-4"><div><h2 id="rider-chat-title" className="text-base font-black">Customer messages</h2><p className="text-[10px] text-slate-500">Communication history</p></div><button aria-label="Close customer messages" className="flex h-11 w-11 items-center justify-center rounded-xl" onClick={()=>setShowChat(false)}><X/></button></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-slate-50 p-4">{(delivery.chat||[]).map((message,index)=><div key={index} className={`max-w-[85%] rounded-xl p-3 text-xs ${message.sender==='rider'?'ml-auto bg-slate-900 text-white':'border bg-white'}`}><p className="break-words">{message.content}</p><p className="mt-1 text-[9px] opacity-60">{message.sender} · {formatTime(message.timestamp)}</p></div>)}{!delivery.chat?.length&&<p className="py-6 text-center text-xs text-slate-500">No messages yet.</p>}</div><form onSubmit={submitCustomMessage} className="flex shrink-0 gap-2 border-t bg-white p-3"><input aria-label="Message customer" maxLength={1000} className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm" placeholder="Custom message" value={customMessage} onChange={e=>setCustomMessage(e.target.value)}/><button aria-label="Send message" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"><Send size={17}/></button></form></section></ModalViewport>}
    <ConfirmationDialog isOpen={Boolean(confirmation)} title={confirmation?.title || ''} description={confirmation?.description || ''} confirmLabel={confirmation?.confirmLabel || 'Confirm'} busy={submitting} onCancel={()=>!submitting&&setConfirmation(null)} onConfirm={runConfirmedAction}/>
  </div>;
}
