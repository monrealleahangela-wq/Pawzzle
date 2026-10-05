import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clipboard, FileImage, MapPin, Package, RefreshCw, ShieldCheck, Truck, User, Wallet } from 'lucide-react';
import { deliveryService, getImageUrl, logisticsService, staffService } from '../../services/apiService';
import DeliveryAssignmentFields from '../../components/delivery/DeliveryAssignmentFields';
import { toast } from 'react-toastify';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';

const money = value => typeof value === 'string' && (value.includes('₱') || value.endsWith(' km'))
  ? value
  : `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const feeValue = (key, value) => key === 'ratePerKilometer'
  ? `${money(value)} / km`
  : (['includedKilometers', 'billableKilometers'].includes(key) ? `${Number(value)} km` : money(value));
const fullName = person => person ? `${person.firstName || person.name || ''} ${person.lastName || ''}`.trim() : 'Not assigned';
const addressText = address => [address?.street, address?.barangay, address?.city, address?.province || address?.state, address?.zipCode].filter(Boolean).join(', ');
const eventLabel = status => ({ pending:'Order Ready', unassigned:'Pending Assignment', assigned:'Rider Assigned', picked_up:'Picked Up', in_transit:'Out for Delivery', arrived:'Arrived', delivered:'Delivered', failed_attempt:'Delivery Attempted', returned_to_store:'Returned to Store', cancelled:'Cancelled' }[status] || String(status || '').replace(/_/g,' '));
const validCoords = value => Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lng)) && Number(value.lat)>=-90 && Number(value.lat)<=90 && Number(value.lng)>=-180 && Number(value.lng)<=180;
const mapIcon = color => L.divIcon({ className:'', html:`<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px #33415566"></div>`, iconSize:[24,24], iconAnchor:[12,12] });

const DataBlock = ({ label, children }) => <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p><div className="text-xs font-bold text-slate-800 break-words">{children || 'Not available'}</div></div>;

export default function LogisticsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [riders, setRiders] = useState([]);
  const [assignmentReadiness, setAssignmentReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [parcel, setParcel] = useState({ weightKg: '', parcelCount: 1 });
  const [showAssignment, setShowAssignment] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deliveryResponse = await logisticsService.getDelivery(id);
      const deliveryStoreId = deliveryResponse.data.delivery.store
        || deliveryResponse.data.delivery.order?.store?._id
        || deliveryResponse.data.delivery.booking?.store?._id;
      const delivery = deliveryResponse.data.delivery;
      const parcelFacts = {
        weightKg: delivery.parcel?.weightKg || '',
        parcelCount: delivery.parcel?.parcelCount || delivery.order?.items?.reduce((total,item)=>total+Number(item.quantity||0),0) || 1
      };
      const eligibilityParams = deliveryStoreId ? { storeId: deliveryStoreId } : {};
      if (Number(parcelFacts.weightKg) > 0) Object.assign(eligibilityParams, parcelFacts);
      const riderResponse = await staffService.getEligibleRiders(eligibilityParams);
      setData(deliveryResponse.data);
      setRiders(riderResponse.data.riders || []);
      setAssignmentReadiness(riderResponse.data.assignmentReadiness || null);
      setParcel(parcelFacts);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to load delivery.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!showAssignment || !data?.delivery || !(Number(parcel.weightKg) > 0) || !(Number(parcel.parcelCount) > 0)) return undefined;
    const timer = setTimeout(async () => {
      const deliveryStoreId = data.delivery.store
        || data.delivery.order?.store?._id
        || data.delivery.booking?.store?._id;
      try {
        const response = await staffService.getEligibleRiders({
          ...(deliveryStoreId ? { storeId: deliveryStoreId } : {}),
          weightKg: Number(parcel.weightKg),
          parcelCount: Number(parcel.parcelCount)
        });
        setRiders(response.data.riders || []);
        setAssignmentReadiness(response.data.assignmentReadiness || null);
      } catch (error) {
        setAssignmentReadiness({ message: error.response?.data?.message || 'Unable to check Rider eligibility.' });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [showAssignment, data, parcel.weightKg, parcel.parcelCount]);
  useRealTimeUpdates({ onDeliveryUpdate: load });

  if (loading && !data) return <div className="min-h-[60vh] flex items-center justify-center"><RefreshCw className="animate-spin text-orange-600"/></div>;
  if (!data) return <div className="p-5"><button onClick={()=>navigate('/admin/logistics')} className="text-xs font-bold">← Back to Logistics</button></div>;

  const { delivery, earning } = data;
  const source = delivery.order || delivery.booking;
  const customer = source?.customer;
  const store = source?.store;
  const address = delivery.order?.shippingAddress || delivery.booking?.serviceAddress;
  const pickupCoords = store?.contactInfo?.address?.coordinates || store?.address?.coordinates;
  const destinationCoords = address?.coordinates;
  const currentRider = delivery.assignedRider;
  const isClosed = ['delivered','returned_to_store','cancelled'].includes(delivery.status);
  const cod = ['cod','cash_on_delivery'].includes(source?.paymentMethod);
  const feeBreakdown = Object.entries(delivery.feeCalculation?.breakdown || {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([key, value]) => [key, feeValue(key, value)]);

  const assign = async () => {
    if (!Number(parcel.weightKg)) return toast.error('Enter the measured parcel weight.');
    if (delivery.assignmentType !== 'unassigned' && !window.confirm('Reassign Delivery?\n\nPawzzle will select another available rider and preserve assignment history.')) return;
    setSaving(true);
    try {
      await deliveryService.assignRider({
        orderId: delivery.order?._id,
        bookingId: delivery.booking?._id,
        parcel,
        reassign: delivery.assignmentType !== 'unassigned'
      });
      toast.success(delivery.assignmentType === 'unassigned' ? 'Rider assigned.' : 'Delivery reassigned.');
      setShowAssignment(false); await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to assign rider.'); }
    finally { setSaving(false); }
  };

  const sortedTimeline = [...(delivery.statusHistory || [])].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  return <div className="min-h-screen bg-slate-50 p-3 sm:p-5 space-y-4 pb-24">
    <header className="bg-white border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-3"><button onClick={()=>navigate('/admin/logistics')} className="w-9 h-9 rounded-lg border flex items-center justify-center"><ArrowLeft size={15}/></button><div><p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Delivery Details</p><h1 className="text-xl font-black text-slate-900">{delivery.deliveryNumber}</h1><p className="text-[10px] text-slate-500">{delivery.order?.orderNumber || `Booking ${String(delivery.booking?._id || '').slice(-8).toUpperCase()}`} · Created {new Date(delivery.createdAt).toLocaleString()}</p></div></div><div className="flex gap-2"><button onClick={load} className="h-9 px-3 border rounded-lg text-xs font-bold"><RefreshCw size={13} className="inline mr-2"/>Refresh</button>{!isClosed&&<button onClick={()=>setShowAssignment(!showAssignment)} className="h-9 px-3 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase">{delivery.assignmentType==='unassigned'?'Assign Rider':'Reassign Rider'}</button>}</div></header>

    {showAssignment && <section className="bg-white border rounded-2xl p-4 space-y-4"><DeliveryAssignmentFields riders={riders} assignmentReadiness={assignmentReadiness} parcel={parcel} onParcelChange={setParcel}/><div className="flex justify-end gap-2"><button onClick={()=>setShowAssignment(false)} className="h-9 px-4 text-xs font-bold">Cancel</button><button onClick={assign} disabled={saving || !Number(parcel.weightKg)} className="h-9 px-4 rounded-lg bg-orange-600 text-white text-[10px] font-black uppercase disabled:opacity-50">{saving?'Saving…':delivery.assignmentType==='unassigned'?'Assign Automatically':'Reassign Automatically'}</button></div></section>}

    <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">{[[Truck,'Status',delivery.statusLabel],[User,'Rider',fullName(currentRider)],[Package,'Parcel',delivery.parcel?.weightKg?`${delivery.parcel.weightKg} kg · ${delivery.parcel.parcelCount} parcel(s)`:'Not measured'],[Wallet,cod?'COD Amount':'Payment',cod?money(source?.totalAmount||source?.totalPrice):(source?.paymentStatus||'pending')]].map(([Icon,label,value])=><div key={label} className="bg-white border rounded-xl p-3"><Icon size={15} className="text-orange-600 mb-2"/><p className="text-[8px] text-slate-400 font-black uppercase">{label}</p><p className="text-xs font-black text-slate-900 mt-1 capitalize">{value}</p></div>)}</section>

    <div className="grid lg:grid-cols-3 gap-3">
      <div className="lg:col-span-2 space-y-3">
        {(validCoords(pickupCoords)||validCoords(destinationCoords)||validCoords(delivery.riderLocation))&&<section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-4"><h2 className="text-xs font-black uppercase tracking-widest">Live Delivery Map</h2><p className="mt-1 text-[10px] text-slate-500">Store, customer, and the latest persisted rider location.</p></div><div className="h-64"><MapContainer center={[Number((delivery.riderLocation||destinationCoords||pickupCoords).lat),Number((delivery.riderLocation||destinationCoords||pickupCoords).lng)]} zoom={13} className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{validCoords(pickupCoords)&&<Marker position={[Number(pickupCoords.lat),Number(pickupCoords.lng)]} icon={mapIcon('#f97316')}><Popup>Pickup store</Popup></Marker>}{validCoords(destinationCoords)&&<Marker position={[Number(destinationCoords.lat),Number(destinationCoords.lng)]} icon={mapIcon('#0f766e')}><Popup>Customer destination</Popup></Marker>}{validCoords(delivery.riderLocation)&&<Marker position={[Number(delivery.riderLocation.lat),Number(delivery.riderLocation.lng)]} icon={mapIcon('#e11d48')}><Popup>Assigned rider</Popup></Marker>}</MapContainer></div></section>}
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2"><User size={14} className="text-orange-600"/>Customer & Destination</h2><div className="grid sm:grid-cols-2 gap-4"><DataBlock label="Customer">{fullName(customer)}</DataBlock><DataBlock label="Authorized contact">{customer?.phone || customer?.email}</DataBlock><DataBlock label="Delivery address"><span className="inline-flex gap-1"><MapPin size={12}/>{addressText(address)}</span></DataBlock><DataBlock label="Instructions">{delivery.order?.notes || delivery.booking?.notes || address?.notes}</DataBlock></div></section>
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2"><Package size={14} className="text-orange-600"/>Order / Booking & Parcel</h2>{delivery.order ? <><div className="space-y-2">{delivery.order.items?.map(item=><div key={`${item.itemType}-${item.itemId}`} className="flex justify-between text-xs border-b pb-2"><span>{item.quantity} × {item.name}</span><b>{money(item.price*item.quantity)}</b></div>)}</div><div className="grid sm:grid-cols-3 gap-4 mt-4"><DataBlock label="Transaction total">{money(delivery.order.totalAmount)}</DataBlock><DataBlock label="Delivery fee">{money(delivery.order.shippingFee || delivery.feeCalculation?.totalFee)}</DataBlock><DataBlock label="Payment">{delivery.order.paymentStatus}</DataBlock></div>{feeBreakdown.length>0&&<div className="mt-4 pt-3 border-t"><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2">Delivery fee breakdown</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{feeBreakdown.map(([key,value])=><div key={key} className="rounded-lg bg-slate-50 p-2"><p className="text-[8px] uppercase text-slate-400">{key.replace(/([A-Z])/g,' $1').replace(/_/g,' ')}</p><b className="text-[10px]">{money(value)}</b></div>)}</div>{delivery.feeCalculation?.overrideReason&&<p className="text-[9px] text-slate-500 mt-2">Override reason: {delivery.feeCalculation.overrideReason}</p>}</div>}</> : <div className="grid sm:grid-cols-3 gap-4"><DataBlock label="Service">{delivery.booking?.service?.name}</DataBlock><DataBlock label="Transaction total">{money(delivery.booking?.totalPrice)}</DataBlock><DataBlock label="Payment">{delivery.booking?.paymentStatus}</DataBlock></div>}</section>
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2"><ShieldCheck size={14} className="text-orange-600"/>Proof of Delivery</h2>{delivery.proofOfDelivery?.timestamp ? <div className="grid sm:grid-cols-2 gap-4"><DataBlock label="Submitted">{new Date(delivery.proofOfDelivery.timestamp).toLocaleString()}</DataBlock><DataBlock label="Method">{delivery.proofOfDelivery.method}</DataBlock><DataBlock label="OTP verification">{delivery.proofOfDelivery.otpVerified?'Verified':'Not used / not verified'}</DataBlock><DataBlock label="COD collection">{delivery.proofOfDelivery.codPaymentStatus?.replace('_',' ')}</DataBlock><DataBlock label="Rider notes">{delivery.proofOfDelivery.notes}</DataBlock><DataBlock label="GPS location">{delivery.proofOfDelivery.location?.lat != null ? `${delivery.proofOfDelivery.location.lat}, ${delivery.proofOfDelivery.location.lng}` : null}</DataBlock>{delivery.proofOfDelivery.photo&&<a href={getImageUrl(delivery.proofOfDelivery.photo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-orange-600"><FileImage size={14}/>View photo proof</a>}{delivery.proofOfDelivery.signature&&<a href={getImageUrl(delivery.proofOfDelivery.signature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-orange-600"><Clipboard size={14}/>View signature</a>}</div> : <p className="text-xs text-slate-400 py-5 text-center">Proof of delivery has not been submitted.</p>}</section>
      </div>

      <aside className="space-y-3">
        {delivery.assignmentType === 'internal' && <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4">Pawzzle Rider Assignment</h2><div className="space-y-4"><DataBlock label="Rider">{fullName(currentRider)}</DataBlock><DataBlock label="Contact">{delivery.assignedRider?.phone}</DataBlock><DataBlock label="Staff ID">{delivery.assignedRider?.riderProfile?.staffId}</DataBlock><DataBlock label="Store">{store?.name}</DataBlock><DataBlock label="Vehicle">{delivery.assignedRider?.riderProfile?.vehicleType} {delivery.assignedRider?.riderProfile?.plateNumber}</DataBlock><DataBlock label="Assigned at">{delivery.assignedAt && new Date(delivery.assignedAt).toLocaleString()}</DataBlock></div><p className="mt-4 rounded-lg bg-emerald-50 p-2 text-[10px] font-semibold text-emerald-700">The rider receives this assignment in their authenticated Rider Dashboard.</p>{delivery.assignmentHistory?.filter(entry=>entry.assignmentType==='internal').length>1&&<div className="mt-4 pt-4 border-t"><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2">Assignment history</p>{delivery.assignmentHistory.filter(entry=>entry.assignmentType==='internal').map(entry=><div key={entry._id} className="text-[9px] text-slate-600 mb-2"><b>{fullName(entry.rider)}</b> · {new Date(entry.assignedAt).toLocaleString()}{entry.endedAt&&` → ${new Date(entry.endedAt).toLocaleString()}`}</div>)}</div>}</section>}
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4">Delivery Timeline</h2><div className="space-y-0">{sortedTimeline.length ? sortedTimeline.map((event,index)=><div key={`${event.status}-${event.timestamp}-${index}`} className="flex gap-3"><div className="flex flex-col items-center"><CheckCircle2 size={15} className="text-emerald-600"/>{index<sortedTimeline.length-1&&<div className="w-px flex-1 min-h-9 bg-slate-200"/>}</div><div className="pb-4"><p className="text-[10px] font-black capitalize">{eventLabel(event.status)}</p><p className="text-[9px] text-slate-400">{new Date(event.timestamp).toLocaleString()}</p>{event.notes&&<p className="text-[9px] text-slate-500 mt-1">{event.notes}</p>}</div></div>) : <p className="text-xs text-slate-400">No timeline entries.</p>}</div></section>
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4">Rider Earnings & Finance</h2>{earning ? <div className="space-y-3"><DataBlock label="Base rate">{money(earning.baseRate)}</DataBlock><DataBlock label="Incentive / bonus">{money((earning.incentive||0)+(earning.bonus||0))}</DataBlock><DataBlock label="Deduction">{money(earning.deduction)}</DataBlock><DataBlock label="Rider earning">{money(earning.amount)}</DataBlock><DataBlock label="Payout status">{earning.payout?.status || earning.status}</DataBlock><DataBlock label="Payout reference">{earning.payout?.payoutId || earning.payout?.referenceNumber}</DataBlock></div> : <p className="text-xs text-slate-400">Internal rider earnings are calculated from the rider configuration after successful delivery.</p>}</section>
        {(delivery.deliveryAttempts?.length>0||delivery.complaints?.length>0)&&<section className="bg-rose-50 border border-rose-100 rounded-2xl p-4"><h2 className="text-xs font-black text-rose-800 uppercase tracking-widest flex gap-2"><AlertTriangle size={14}/>Recorded Issues</h2><p className="text-[10px] text-rose-700 mt-2">{delivery.deliveryAttempts?.length||0} delivery attempts · {delivery.complaints?.length||0} complaints</p><button onClick={()=>navigate('/admin/logistics?tab=issues')} className="mt-3 h-8 px-3 bg-white border border-rose-200 rounded-lg text-[9px] font-black uppercase text-rose-700">Open Issue Center</button></section>}
      </aside>
    </div>
  </div>;
}
