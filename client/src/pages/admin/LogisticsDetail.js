import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clipboard, ExternalLink, FileImage, MapPin, Package, RefreshCw, Send, ShieldCheck, Truck, User, Wallet } from 'lucide-react';
import { deliveryService, getImageUrl, logisticsService, staffService } from '../../services/apiService';
import DeliveryAssignmentFields, { emptyExternal } from '../../components/delivery/DeliveryAssignmentFields';
import { toast } from 'react-toastify';

const money = value => typeof value === 'string' && (value.includes('₱') || value.endsWith(' km'))
  ? value
  : `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const feeValue = (key, value) => key === 'ratePerKilometer'
  ? `${money(value)} / km`
  : (['includedKilometers', 'billableKilometers'].includes(key) ? `${Number(value)} km` : money(value));
const fullName = person => person ? `${person.firstName || person.name || ''} ${person.lastName || ''}`.trim() : 'Not assigned';
const addressText = address => [address?.street, address?.barangay, address?.city, address?.province || address?.state, address?.zipCode].filter(Boolean).join(', ');
const eventLabel = status => ({ pending:'Order Ready', unassigned:'Pending Assignment', assigned:'Rider Assigned', picked_up:'Picked Up', in_transit:'Out for Delivery', arrived:'Arrived', delivered:'Delivered', failed_attempt:'Delivery Attempted', returned_to_store:'Returned to Store', cancelled:'Cancelled' }[status] || String(status || '').replace(/_/g,' '));

const DataBlock = ({ label, children }) => <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p><div className="text-xs font-bold text-slate-800 break-words">{children || 'Not available'}</div></div>;

export default function LogisticsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignmentType, setAssignmentType] = useState('internal');
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [thirdPartyRider, setThirdPartyRider] = useState(emptyExternal);
  const [showAssignment, setShowAssignment] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deliveryResponse = await logisticsService.getDelivery(id);
      const deliveryStoreId = deliveryResponse.data.delivery.store
        || deliveryResponse.data.delivery.order?.store?._id
        || deliveryResponse.data.delivery.booking?.store?._id;
      const riderResponse = await staffService.getEligibleRiders(deliveryStoreId ? { storeId: deliveryStoreId } : undefined);
      setData(deliveryResponse.data);
      setRiders(riderResponse.data.riders || []);
      const delivery = deliveryResponse.data.delivery;
      setAssignmentType(delivery.assignmentType === 'third_party' ? 'third_party' : 'internal');
      setSelectedRiderId(delivery.assignedRider?._id || '');
      setThirdPartyRider({ ...emptyExternal, providerKey: delivery.providerDelivery?.providerKey || 'mock_delivery_provider' });
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to load delivery.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="min-h-[60vh] flex items-center justify-center"><RefreshCw className="animate-spin text-orange-600"/></div>;
  if (!data) return <div className="p-5"><button onClick={()=>navigate('/admin/logistics')} className="text-xs font-bold">← Back to Logistics</button></div>;

  const { delivery, earning } = data;
  const source = delivery.order || delivery.booking;
  const customer = source?.customer;
  const store = source?.store;
  const address = delivery.order?.shippingAddress || delivery.booking?.serviceAddress;
  const provider = delivery.providerDelivery;
  const currentRider = delivery.assignmentType === 'internal' ? delivery.assignedRider : (provider?.rider || delivery.thirdPartyRider);
  const isClosed = ['delivered','returned_to_store'].includes(delivery.status) || (delivery.status === 'cancelled' && delivery.providerDelivery?.externalStatus !== 'cancelled');
  const cod = ['cod','cash_on_delivery'].includes(source?.paymentMethod);
  const feeBreakdown = Object.entries(delivery.feeCalculation?.breakdown || {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([key, value]) => [key, feeValue(key, value)]);

  const assign = async () => {
    const selectedName = assignmentType === 'internal' ? fullName(riders.find(rider => rider._id === selectedRiderId)) : 'the selected courier provider';
    if (delivery.assignmentType !== 'unassigned' && !window.confirm(`Reassign Delivery?\n\nThis delivery is currently assigned to ${fullName(currentRider)}. Reassigning it will update the active assignment to ${selectedName} while preserving assignment history.`)) return;
    setSaving(true);
    try {
      await deliveryService.generateLinks({
        orderId: delivery.order?._id,
        bookingId: delivery.booking?._id,
        assignmentType,
        riderId: assignmentType === 'internal' ? selectedRiderId : undefined,
        providerKey: assignmentType === 'third_party' ? thirdPartyRider.providerKey : undefined
      });
      toast.success(assignmentType === 'third_party' ? 'Courier provider selected. Request a quote before confirming the job.' : (delivery.assignmentType === 'unassigned' ? 'Rider assigned.' : 'Delivery reassigned.'));
      setShowAssignment(false); await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to assign rider.'); }
    finally { setSaving(false); }
  };

  const shareLink = async () => {
    if (delivery.assignmentType !== 'internal') {
      toast.info('Third-party riders receive assignments through the courier provider, not a Pawzzle rider link.');
      return;
    }
    try {
      await navigator.clipboard.writeText(delivery.links.rider);
      if (navigator.share) await navigator.share({ title: 'Secure Pawzzle Delivery Link', text: `Delivery ${delivery.deliveryNumber}`, url: delivery.links.rider });
      toast.success('Secure delivery link copied and ready to share.');
    } catch (error) { if (error.name !== 'AbortError') toast.error('Unable to share the delivery link.'); }
  };

  const providerAction = async action => {
    setSaving(true);
    try {
      const response = action === 'quote'
        ? await deliveryService.quoteProvider(delivery._id, { providerKey: provider?.providerKey || thirdPartyRider.providerKey })
        : action === 'request'
          ? await deliveryService.requestProvider(delivery._id)
          : action === 'refresh'
            ? await deliveryService.refreshProvider(delivery._id)
            : await deliveryService.cancelProvider(delivery._id, { reason: 'Cancelled by authorized Pawzzle dispatcher' });
      toast.success(response.data.message);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to communicate with the courier provider right now.');
    } finally { setSaving(false); }
  };

  const sortedTimeline = [...(delivery.statusHistory || [])].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  return <div className="min-h-screen bg-slate-50 p-3 sm:p-5 space-y-4 pb-24">
    <header className="bg-white border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-3"><button onClick={()=>navigate('/admin/logistics')} className="w-9 h-9 rounded-lg border flex items-center justify-center"><ArrowLeft size={15}/></button><div><p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Delivery Details</p><h1 className="text-xl font-black text-slate-900">{delivery.deliveryNumber}</h1><p className="text-[10px] text-slate-500">{delivery.order?.orderNumber || `Booking ${String(delivery.booking?._id || '').slice(-8).toUpperCase()}`} · Created {new Date(delivery.createdAt).toLocaleString()}</p></div></div><div className="flex gap-2"><button onClick={load} className="h-9 px-3 border rounded-lg text-xs font-bold"><RefreshCw size={13} className="inline mr-2"/>Refresh</button>{!isClosed&&<button onClick={()=>setShowAssignment(!showAssignment)} className="h-9 px-3 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase">{delivery.assignmentType==='unassigned'?'Assign Rider':'Reassign Rider'}</button>}</div></header>

    {showAssignment && <section className="bg-white border rounded-2xl p-4 space-y-4"><DeliveryAssignmentFields assignmentType={assignmentType} onAssignmentTypeChange={setAssignmentType} riders={riders} selectedRiderId={selectedRiderId} onRiderChange={setSelectedRiderId} thirdPartyRider={thirdPartyRider} onThirdPartyChange={setThirdPartyRider}/><div className="flex justify-end gap-2"><button onClick={()=>setShowAssignment(false)} className="h-9 px-4 text-xs font-bold">Cancel</button><button onClick={assign} disabled={saving || (assignmentType==='internal'&&!selectedRiderId)} className="h-9 px-4 rounded-lg bg-orange-600 text-white text-[10px] font-black uppercase disabled:opacity-50">{saving?'Saving…':delivery.assignmentType==='unassigned'?'Assign Rider':'Reassign'}</button></div></section>}

    <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">{[[Truck,'Status',delivery.statusLabel],[User,'Rider',fullName(currentRider)],[ExternalLink,'Link',delivery.linkStatus.replace('_',' ')],[Wallet,cod?'COD Amount':'Payment',cod?money(source?.totalAmount||source?.totalPrice):(source?.paymentStatus||'pending')]].map(([Icon,label,value])=><div key={label} className="bg-white border rounded-xl p-3"><Icon size={15} className="text-orange-600 mb-2"/><p className="text-[8px] text-slate-400 font-black uppercase">{label}</p><p className="text-xs font-black text-slate-900 mt-1 capitalize">{value}</p></div>)}</section>

    <div className="grid lg:grid-cols-3 gap-3">
      <div className="lg:col-span-2 space-y-3">
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2"><User size={14} className="text-orange-600"/>Customer & Destination</h2><div className="grid sm:grid-cols-2 gap-4"><DataBlock label="Customer">{fullName(customer)}</DataBlock><DataBlock label="Authorized contact">{customer?.phone || customer?.email}</DataBlock><DataBlock label="Delivery address"><span className="inline-flex gap-1"><MapPin size={12}/>{addressText(address)}</span></DataBlock><DataBlock label="Instructions">{delivery.order?.notes || delivery.booking?.notes || address?.notes}</DataBlock></div></section>
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2"><Package size={14} className="text-orange-600"/>Order / Booking & Parcel</h2>{delivery.order ? <><div className="space-y-2">{delivery.order.items?.map(item=><div key={`${item.itemType}-${item.itemId}`} className="flex justify-between text-xs border-b pb-2"><span>{item.quantity} × {item.name}</span><b>{money(item.price*item.quantity)}</b></div>)}</div><div className="grid sm:grid-cols-3 gap-4 mt-4"><DataBlock label="Transaction total">{money(delivery.order.totalAmount)}</DataBlock><DataBlock label="Delivery fee">{money(delivery.order.shippingFee || delivery.feeCalculation?.totalFee)}</DataBlock><DataBlock label="Payment">{delivery.order.paymentStatus}</DataBlock></div>{feeBreakdown.length>0&&<div className="mt-4 pt-3 border-t"><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2">Delivery fee breakdown</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{feeBreakdown.map(([key,value])=><div key={key} className="rounded-lg bg-slate-50 p-2"><p className="text-[8px] uppercase text-slate-400">{key.replace(/([A-Z])/g,' $1').replace(/_/g,' ')}</p><b className="text-[10px]">{money(value)}</b></div>)}</div>{delivery.feeCalculation?.overrideReason&&<p className="text-[9px] text-slate-500 mt-2">Override reason: {delivery.feeCalculation.overrideReason}</p>}</div>}</> : <div className="grid sm:grid-cols-3 gap-4"><DataBlock label="Service">{delivery.booking?.service?.name}</DataBlock><DataBlock label="Transaction total">{money(delivery.booking?.totalPrice)}</DataBlock><DataBlock label="Payment">{delivery.booking?.paymentStatus}</DataBlock></div>}</section>
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2"><ShieldCheck size={14} className="text-orange-600"/>Proof of Delivery</h2>{delivery.proofOfDelivery?.timestamp ? <div className="grid sm:grid-cols-2 gap-4"><DataBlock label="Submitted">{new Date(delivery.proofOfDelivery.timestamp).toLocaleString()}</DataBlock><DataBlock label="Method">{delivery.proofOfDelivery.method}</DataBlock><DataBlock label="OTP verification">{delivery.proofOfDelivery.otpVerified?'Verified':'Not used / not verified'}</DataBlock><DataBlock label="COD collection">{delivery.proofOfDelivery.codPaymentStatus?.replace('_',' ')}</DataBlock><DataBlock label="Rider notes">{delivery.proofOfDelivery.notes}</DataBlock><DataBlock label="GPS location">{delivery.proofOfDelivery.location?.lat != null ? `${delivery.proofOfDelivery.location.lat}, ${delivery.proofOfDelivery.location.lng}` : null}</DataBlock>{delivery.proofOfDelivery.photo&&<a href={getImageUrl(delivery.proofOfDelivery.photo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-orange-600"><FileImage size={14}/>View photo proof</a>}{delivery.proofOfDelivery.signature&&<a href={getImageUrl(delivery.proofOfDelivery.signature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-orange-600"><Clipboard size={14}/>View signature</a>}</div> : <p className="text-xs text-slate-400 py-5 text-center">Proof of delivery has not been submitted.</p>}</section>
      </div>

      <aside className="space-y-3">
        {delivery.assignmentType === 'third_party' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900">The courier quote is the provider's charge for dispatch. It is stored separately and does not silently replace the customer shipping charge already recorded on the order.</p>}
        {delivery.assignmentType === 'third_party' && <section className="bg-white border rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xs font-black uppercase tracking-widest">Third-Party Courier</h2><p className="text-[9px] text-slate-500 mt-1">Pawzzle contacts the provider. The provider assigns and notifies its own rider.</p></div><span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${provider?.environment === 'live' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{provider?.environment || 'sandbox'}</span></div><div className="grid grid-cols-2 gap-3 mt-4"><DataBlock label="Provider">{provider?.providerName}</DataBlock><DataBlock label="Request state">{provider?.requestState?.replace(/_/g,' ')}</DataBlock><DataBlock label="External job ID">{provider?.jobId}</DataBlock><DataBlock label="Tracking reference">{provider?.trackingId}</DataBlock><DataBlock label="Provider status">{provider?.externalStatus?.replace(/_/g,' ')}</DataBlock><DataBlock label="Last update">{provider?.lastSyncedAt && new Date(provider.lastSyncedAt).toLocaleString()}</DataBlock><DataBlock label="Courier quote">{provider?.quote?.amount != null ? `${money(provider.quote.amount)} ${provider.quote.currency || 'PHP'}` : null}</DataBlock><DataBlock label="ETA">{provider?.estimatedDeliveryAt && new Date(provider.estimatedDeliveryAt).toLocaleString()}</DataBlock><DataBlock label="Provider rider">{provider?.rider?.displayName}</DataBlock><DataBlock label="Vehicle">{[provider?.rider?.vehicleType,provider?.rider?.plateNumber].filter(Boolean).join(' ')}</DataBlock></div>{provider?.lastError?.message&&<p className="mt-3 rounded-lg bg-rose-50 p-2 text-[10px] text-rose-700">{provider.lastError.message}</p>}<div className="grid grid-cols-2 gap-2 mt-4">{!provider?.jobId&&<button disabled={saving} onClick={()=>providerAction('quote')} className="h-9 rounded-lg border text-[9px] font-black uppercase">{provider?.quote?.quoteId?'Refresh Quote':'Get Quote'}</button>}{provider?.quote?.quoteId&&!provider?.jobId&&<button disabled={saving} onClick={()=>providerAction('request')} className="h-9 rounded-lg bg-orange-600 text-white text-[9px] font-black uppercase">Request Delivery</button>}{provider?.jobId&&!['cancelled','delivered'].includes(provider?.externalStatus)&&<button disabled={saving} onClick={()=>providerAction('refresh')} className="h-9 rounded-lg border text-[9px] font-black uppercase">Refresh Status</button>}{provider?.jobId&&!['cancelled','delivered'].includes(provider?.externalStatus)&&<button disabled={saving} onClick={()=>window.confirm('Cancel this third-party courier job? This does not cancel the customer order.')&&providerAction('cancel')} className="h-9 rounded-lg border border-rose-200 text-rose-700 text-[9px] font-black uppercase">Cancel Courier</button>}{provider?.trackingUrl&&<a href={provider.trackingUrl} target="_blank" rel="noreferrer" className="col-span-2 h-9 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase flex items-center justify-center gap-2">Open Provider Tracking <ExternalLink size={12}/></a>}</div></section>}
        {delivery.assignmentType === 'internal' && <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4">Pawzzle Rider Assignment</h2><div className="space-y-4"><DataBlock label="Rider">{fullName(currentRider)}</DataBlock><DataBlock label="Contact">{delivery.assignedRider?.phone}</DataBlock><DataBlock label="Staff ID">{delivery.assignedRider?.riderProfile?.staffId}</DataBlock><DataBlock label="Store">{store?.name}</DataBlock><DataBlock label="Vehicle">{delivery.assignedRider?.riderProfile?.vehicleType} {delivery.assignedRider?.riderProfile?.plateNumber}</DataBlock><DataBlock label="Assigned at">{delivery.assignedAt && new Date(delivery.assignedAt).toLocaleString()}</DataBlock></div><button onClick={shareLink} className="mt-4 w-full h-9 rounded-lg bg-orange-600 text-white text-[10px] font-black uppercase flex items-center justify-center gap-2"><Send size={13}/>Send/Share Link to Rider</button>{delivery.assignmentHistory?.length>1&&<div className="mt-4 pt-4 border-t"><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2">Assignment history</p>{delivery.assignmentHistory.map(entry=><div key={entry._id} className="text-[9px] text-slate-600 mb-2"><b>{entry.assignmentType==='internal'?fullName(entry.rider):(entry.thirdPartyRider?.name || 'Third-party provider')}</b> · {new Date(entry.assignedAt).toLocaleString()}{entry.endedAt&&` → ${new Date(entry.endedAt).toLocaleString()}`}</div>)}</div>}</section>}
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4">Delivery Timeline</h2><div className="space-y-0">{sortedTimeline.length ? sortedTimeline.map((event,index)=><div key={`${event.status}-${event.timestamp}-${index}`} className="flex gap-3"><div className="flex flex-col items-center"><CheckCircle2 size={15} className="text-emerald-600"/>{index<sortedTimeline.length-1&&<div className="w-px flex-1 min-h-9 bg-slate-200"/>}</div><div className="pb-4"><p className="text-[10px] font-black capitalize">{eventLabel(event.status)}</p><p className="text-[9px] text-slate-400">{new Date(event.timestamp).toLocaleString()}</p>{event.notes&&<p className="text-[9px] text-slate-500 mt-1">{event.notes}</p>}</div></div>) : <p className="text-xs text-slate-400">No timeline entries.</p>}</div></section>
        <section className="bg-white border rounded-2xl p-4"><h2 className="text-xs font-black uppercase tracking-widest mb-4">Rider Earnings & Finance</h2>{earning ? <div className="space-y-3"><DataBlock label="Base rate">{money(earning.baseRate)}</DataBlock><DataBlock label="Incentive / bonus">{money((earning.incentive||0)+(earning.bonus||0))}</DataBlock><DataBlock label="Deduction">{money(earning.deduction)}</DataBlock><DataBlock label="Rider earning">{money(earning.amount)}</DataBlock><DataBlock label="Payout status">{earning.payout?.status || earning.status}</DataBlock><DataBlock label="Payout reference">{earning.payout?.payoutId || earning.payout?.referenceNumber}</DataBlock></div> : <p className="text-xs text-slate-400">Internal rider earnings are calculated from the rider configuration after successful delivery.</p>}</section>
        {(delivery.deliveryAttempts?.length>0||delivery.complaints?.length>0)&&<section className="bg-rose-50 border border-rose-100 rounded-2xl p-4"><h2 className="text-xs font-black text-rose-800 uppercase tracking-widest flex gap-2"><AlertTriangle size={14}/>Recorded Issues</h2><p className="text-[10px] text-rose-700 mt-2">{delivery.deliveryAttempts?.length||0} delivery attempts · {delivery.complaints?.length||0} complaints</p><button onClick={()=>navigate('/admin/logistics?tab=issues')} className="mt-3 h-8 px-3 bg-white border border-rose-200 rounded-lg text-[9px] font-black uppercase text-rose-700">Open Issue Center</button></section>}
      </aside>
    </div>
  </div>;
}
