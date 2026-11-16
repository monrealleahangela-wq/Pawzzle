import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, ExternalLink, Package, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import { toast } from 'react-toastify';
import { orderReturnService } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { formatPeso } from '../../utils/paymentSummary';

const STATUS_LABELS = {
  issue_reported: 'Issue Reported', seller_review: 'Seller Review', return_approved_awaiting_pickup: 'Return Approved — Awaiting Pickup',
  pickup_scheduled: 'Pickup Scheduled', rider_assigned: 'Rider Assigned', going_to_customer: 'Going to Customer',
  return_picked_up: 'Return Picked Up', returning_to_seller: 'Returning to Seller', returned_to_seller: 'Returned to Seller',
  under_inspection: 'Under Inspection', refund_approved: 'Refund Approved', refund_processing: 'Refund Processing',
  refund_completed: 'Refund Completed', replacement_approved: 'Replacement Approved', replacement_prepared: 'Replacement Prepared',
  replacement_rider_assigned: 'Replacement Rider Assigned', replacement_picked_up: 'Replacement Picked Up',
  replacement_in_transit: 'Replacement In Transit', replacement_arrived: 'Replacement Arrived', replacement_delivered: 'Replacement Delivered',
  awaiting_customer_confirmation: 'Awaiting Customer Confirmation', disputed: 'Admin Review', rejected: 'Rejected', resolved: 'Resolved'
};
const label = value => STATUS_LABELS[value] || String(value || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const terminal = new Set(['resolved', 'cancelled', 'closed', 'refunded']);
const formatDate = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';

const nextAction = record => {
  const map = {
    issue_reported: 'Seller reviews the evidence and requested resolution.', seller_review: 'Seller records a decision.',
    return_approved_awaiting_pickup: 'Seller schedules the return pickup.', pickup_scheduled: 'Wait for a rider assignment.',
    rider_assigned: 'Rider travels to the customer.', going_to_customer: 'Customer gives the pickup code to the rider.',
    return_picked_up: 'Rider transports the item to the seller.', returning_to_seller: 'Rider completes delivery to the seller.',
    returned_to_seller: 'Seller confirms receipt.', under_inspection: 'Seller records inspection and final resolution.',
    refund_approved: 'Platform administrator processes the approved payment refund.', refund_processing: 'Wait for the payment provider result.',
    replacement_approved: 'Seller prepares a separate replacement shipment.', replacement_prepared: 'Wait for a replacement rider.',
    replacement_rider_assigned: 'Replacement rider picks up the parcel.', replacement_picked_up: 'Replacement is travelling to the customer.',
    replacement_in_transit: 'Replacement is travelling to the customer.', replacement_arrived: 'Rider completes replacement delivery.',
    replacement_delivered: 'Customer confirms whether the issue is resolved.', awaiting_customer_confirmation: 'Customer confirms whether the issue is resolved.',
    rejected: 'Customer may dispute this decision for platform review.', disputed: 'Platform administrator reviews the dispute.',
    refund_completed: 'The completed refund resolves this case.', resolved: 'No further action is required.'
  };
  return map[record?.status] || 'Follow the next available action shown below.';
};

function EvidenceLink({ caseId, evidence }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const response = await orderReturnService.getEvidenceAccess(caseId, evidence._id);
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (error) { toast.error(error.response?.data?.message || 'Evidence is unavailable.'); }
    finally { setBusy(false); }
  };
  return <button type="button" onClick={open} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-bold"><ExternalLink size={15}/><span className="max-w-40 truncate">{evidence.originalName || `${evidence.resourceType} evidence`}</span></button>;
}

export default function ReturnCaseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [inspection, setInspection] = useState({ acceptedQuantity: 1, resellableQuantity: 0, outcome: 'eligible_refund', note: '', evidence: [] });
  const isCustomer = user?.role === 'customer';
  const isPlatformAdmin = ['super_admin', 'platform_admin'].includes(user?.role);
  const isSeller = !isCustomer && !isPlatformAdmin && !['delivery_rider'].includes(user?.role);

  const load = useCallback(async () => {
    try { const response = await orderReturnService.getById(id); setRecord(response.data.return); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to load this return case.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async operation => {
    setBusy(true);
    try { await operation(); await load(); toast.success('Return case updated.'); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to update this return case.'); }
    finally { setBusy(false); }
  };
  const decide = decision => {
    const reason = decision === 'reject' ? window.prompt('Reason for rejection (required):') : window.prompt('Decision note (optional):', '') || '';
    if (decision === 'reject' && (!reason || reason.trim().length < 3)) return;
    return run(() => orderReturnService.decide(id, { decision, reason }));
  };
  const schedule = () => {
    const value = window.prompt('Pickup schedule (YYYY-MM-DD HH:MM):', new Date(Date.now() + 86400000).toISOString().slice(0,16));
    if (value) run(() => orderReturnService.schedulePickup(id, { scheduledAt: new Date(value).toISOString() }));
  };
  const getCode = () => run(async () => { const response = await orderReturnService.getPickupCode(id); setPickupCode(response.data.verificationCode); });
  const submitInspection = event => {
    event.preventDefault();
    const body = new FormData();
    Object.entries(inspection).forEach(([key,value]) => key === 'evidence' ? value.forEach(file=>body.append('evidence',file)) : body.append(key,String(value)));
    run(() => orderReturnService.inspect(id, body));
  };
  const dispute = () => { const reason = window.prompt('Explain why the seller decision should be reviewed:'); if (reason?.trim().length >= 3) run(()=>orderReturnService.dispute(id,{reason})); };
  const adminDecide = decision => { const reason = window.prompt('Record the platform decision reason:'); if (reason?.trim().length >= 3) run(()=>orderReturnService.adminDecision(id,{decision,reason})); };
  const processRefund = () => run(() => orderReturnService.processRefund(id));
  const recordRefund = status => { const reference = window.prompt('Payment provider refund reference:'); if (!reference) return; run(()=>orderReturnService.recordRefundResult(id,{callbackId:`manual-${Date.now()}`,status,reference,amount:record.refund?.amount})); };

  const originalTimeline = useMemo(() => record?.order?.fulfillmentTimeline || [], [record]);
  const returnTimeline = useMemo(() => (record?.history || []).filter(row => !String(row.action).includes('replacement') && !String(row.action).includes('refund')), [record]);
  const resolutionTimeline = useMemo(() => (record?.history || []).filter(row => String(row.action).includes('replacement') || String(row.action).includes('refund') || ['replacement_delivered','refund_completed','customer_confirmed'].includes(row.toStatus)), [record]);
  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-primary-700"/></div>;
  if (!record) return <div className="mx-auto max-w-3xl p-6">Return case not found.</div>;

  const evidence = [...(record.evidence || []), ...(record.inspection?.evidence || []), ...(record.pickup?.evidence || [])];
  return <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-6">
    <header className="rounded-3xl bg-slate-950 p-5 text-white sm:p-7"><Link to={isCustomer?'/orders':isPlatformAdmin?'/superadmin/returns':'/admin/returns'} className="inline-flex items-center gap-2 text-xs font-bold text-white/70"><ArrowLeft size={16}/> Back to cases</Link><div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.25em] text-primary-300">Return / Refund Case</p><h1 className="mt-1 text-3xl font-black">{record.caseId}</h1><p className="mt-2 text-sm text-white/70">Order {record.order?.orderNumber || '—'} · {record.itemSnapshot?.name}</p></div><span className="w-fit rounded-full bg-white px-4 py-2 text-xs font-black uppercase text-slate-900">{label(record.status)}</span></div></header>

    <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]"><div className="rounded-3xl border bg-white p-5"><h2 className="text-lg font-black">Issue details</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Product</dt><dd className="font-black">{record.itemSnapshot?.name}</dd></div><div><dt className="text-slate-500">Quantity / unit price</dt><dd className="font-black">{record.requestedQuantity} × {formatPeso(record.itemSnapshot?.unitPrice)}</dd></div><div><dt className="text-slate-500">Issue</dt><dd className="font-black">{label(record.issueType)}</dd></div><div><dt className="text-slate-500">Requested resolution</dt><dd className="font-black">{label(record.requestedResolution)}</dd></div>{!isCustomer&&<><div><dt className="text-slate-500">Customer</dt><dd className="font-black">{record.customer?.firstName} {record.customer?.lastName}</dd></div><div><dt className="text-slate-500">Contact</dt><dd className="break-all font-black">{record.customer?.email || record.customer?.phone || 'Unavailable'}</dd></div></>}</dl><p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{record.description || record.reason}</p>{evidence.length>0&&<div className="mt-4 flex flex-wrap gap-2">{evidence.map(item=><EvidenceLink key={item._id} caseId={record._id} evidence={item}/>)}</div>}</div><aside className="rounded-3xl border border-primary-200 bg-primary-50 p-5"><p className="text-[10px] font-black uppercase tracking-[.2em] text-primary-700">Next action</p><p className="mt-2 text-lg font-black text-slate-900">{nextAction(record)}</p>{record.refund?.amount!=null&&<div className="mt-4 rounded-2xl bg-white p-4"><p className="text-xs text-slate-500">Approved refund</p><p className="text-2xl font-black">{formatPeso(record.refund.amount)}</p><p className="mt-1 text-xs text-slate-500">Product {formatPeso(record.refund.productAmount)} + eligible shipping {formatPeso(record.refund.shippingAmount)} + other eligible charges {formatPeso(record.refund.otherEligibleCharges)}</p></div>}{(record.pickup?.assignedRider||record.replacement?.assignedRider)&&<div className="mt-4 rounded-2xl bg-white p-4 text-sm"><p className="text-xs text-slate-500">Assigned rider</p><p className="font-black">{(record.pickup?.assignedRider||record.replacement?.assignedRider)?.firstName} {(record.pickup?.assignedRider||record.replacement?.assignedRider)?.lastName}</p></div>}{record.decision?.reason&&<p className="mt-4 text-sm"><b>Decision reason:</b> {record.decision.reason}</p>}</aside></section>

    {record.refund?.providerStatus&&record.refund.providerStatus!=='not_submitted'&&<section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">Payment provider refund</p><p className="mt-2 text-lg font-black">PayMongo: {label(record.refund.providerStatus)}</p>{record.refund.providerRefundId&&<p className="mt-1 break-all text-xs text-slate-600">Reference {record.refund.providerRefundId}</p>}</section>}

    {record.policySnapshot?.type&&<section className="rounded-3xl border bg-white p-5"><p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Policy captured at purchase</p><p className="mt-2 text-lg font-black">{label(record.policySnapshot.type)}</p><p className="mt-1 text-sm text-slate-600">{record.policySnapshot.summary}{record.policySnapshot.conditions?` Conditions: ${record.policySnapshot.conditions}`:''}</p><p className="mt-2 text-xs text-slate-400">The transaction-time policy remains attached to this case. Platform dispute rules and applicable customer protections still govern final intervention.</p></section>}

    {isCustomer && ['pickup_scheduled','rider_assigned','going_to_customer'].includes(record.status) && <section className="rounded-3xl border bg-white p-5"><h2 className="font-black">Return pickup verification</h2><p className="mt-1 text-sm text-slate-500">Only share this code with the assigned Pawzzle rider when the item is physically collected.</p>{pickupCode?<p className="mt-4 rounded-2xl bg-slate-950 p-5 text-center text-3xl font-black tracking-[.35em] text-white">{pickupCode}</p>:<button onClick={getCode} disabled={busy} className="mt-4 h-11 rounded-xl bg-primary-700 px-5 text-sm font-black text-white">Show pickup code</button>}</section>}

    {!terminal.has(record.status) && <section className="rounded-3xl border bg-white p-5"><h2 className="text-lg font-black">Available actions</h2><div className="mt-4 flex flex-wrap gap-2">
      {isSeller && ['issue_reported','seller_review','requested'].includes(record.status)&&<><button onClick={()=>decide('approve_return')} className="rounded-xl bg-primary-700 px-4 py-3 text-xs font-black text-white">Approve Return</button><button onClick={()=>decide('approve_refund')} className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white">Approve Refund Only</button><button onClick={()=>decide('approve_replacement')} className="rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white">Approve Replacement</button><button onClick={()=>decide('reject')} className="rounded-xl border border-rose-300 px-4 py-3 text-xs font-black text-rose-700">Reject Request</button></>}
      {isSeller&&record.status==='return_approved_awaiting_pickup'&&<button onClick={schedule} className="rounded-xl bg-primary-700 px-4 py-3 text-xs font-black text-white">Schedule Return Pickup</button>}
      {isSeller&&record.status==='returned_to_seller'&&<button onClick={()=>run(()=>orderReturnService.confirmReceived(id,{note:'Return physically received by seller.'}))} className="rounded-xl bg-primary-700 px-4 py-3 text-xs font-black text-white">Confirm Return Received</button>}
      {isSeller&&record.status==='replacement_approved'&&<button onClick={()=>run(()=>orderReturnService.prepareReplacement(id,{}))} className="rounded-xl bg-primary-700 px-4 py-3 text-xs font-black text-white">Mark Replacement Prepared</button>}
      {isSeller&&record.status==='under_inspection'&&<form onSubmit={submitInspection} className="grid w-full gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2"><input type="number" min="0" max={record.requestedQuantity} aria-label="Accepted quantity" className="h-11 rounded-xl border px-3" value={inspection.acceptedQuantity} onChange={e=>setInspection({...inspection,acceptedQuantity:e.target.value})}/><input type="number" min="0" max={record.requestedQuantity} aria-label="Resellable quantity" className="h-11 rounded-xl border px-3" value={inspection.resellableQuantity} onChange={e=>setInspection({...inspection,resellableQuantity:e.target.value})}/><select aria-label="Inspection outcome" className="h-11 rounded-xl border px-3" value={inspection.outcome} onChange={e=>setInspection({...inspection,outcome:e.target.value})}><option value="eligible_refund">Eligible refund</option><option value="eligible_replacement">Eligible replacement</option><option value="partial_refund">Partial refund</option><option value="rejected">Rejected after inspection</option></select><input type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" className="rounded-xl border bg-white p-2 text-xs" onChange={e=>setInspection({...inspection,evidence:Array.from(e.target.files||[])})}/><textarea required minLength="3" placeholder="Inspection findings" className="min-h-24 rounded-xl border p-3 sm:col-span-2" value={inspection.note} onChange={e=>setInspection({...inspection,note:e.target.value})}/><button className="h-11 rounded-xl bg-primary-700 text-xs font-black text-white sm:col-span-2">Save Inspection</button></form>}
      {isSeller&&record.inspection?.inspectedAt&&record.status==='under_inspection'&&<><button onClick={()=>run(()=>orderReturnService.finalize(id,{resolution:'refund',reason:'Refund approved after inspection.'}))} className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white">Finalize Refund</button><button onClick={()=>run(()=>orderReturnService.finalize(id,{resolution:'replacement',reason:'Replacement approved after inspection.'}))} className="rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white">Finalize Replacement</button></>}
      {isCustomer&&record.status==='rejected'&&<button onClick={dispute} className="rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white">Dispute Seller Decision</button>}
      {isCustomer&&['replacement_delivered','awaiting_customer_confirmation'].includes(record.status)&&<><button onClick={()=>run(()=>orderReturnService.customerConfirm(id,{resolved:true,note:'Replacement received and issue resolved.'}))} className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white">Confirm Issue Resolved</button><button onClick={()=>run(()=>orderReturnService.customerConfirm(id,{resolved:false,note:'Replacement did not resolve the issue.'}))} className="rounded-xl border border-rose-300 px-4 py-3 text-xs font-black text-rose-700">Still Have an Issue</button></>}
      {isPlatformAdmin&&record.status==='disputed'&&<><button onClick={()=>adminDecide('approve_return')} className="rounded-xl bg-primary-700 px-4 py-3 text-xs font-black text-white">Approve Return</button><button onClick={()=>adminDecide('approve_refund')} className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white">Approve Refund</button><button onClick={()=>adminDecide('approve_replacement')} className="rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white">Approve Replacement</button><button onClick={()=>adminDecide('uphold_rejection')} className="rounded-xl border border-rose-300 px-4 py-3 text-xs font-black text-rose-700">Uphold Rejection</button></>}
      {isPlatformAdmin&&['refund_approved','refund_processing','refund_pending'].includes(record.status)&&<><button onClick={processRefund} disabled={busy||record.refund?.providerStatus==='submitting'} className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white">{record.refund?.providerRefundId?'Refresh PayMongo Refund':'Process PayMongo Refund'}</button><details className="rounded-xl border border-slate-200 px-4 py-3 text-xs"><summary className="cursor-pointer font-black">Manual provider fallback</summary><div className="mt-3 flex gap-2"><button onClick={()=>recordRefund('refunded')} className="rounded-lg bg-slate-900 px-3 py-2 font-black text-white">Record success</button><button onClick={()=>recordRefund('denied')} className="rounded-lg border border-rose-300 px-3 py-2 font-black text-rose-700">Record failure</button></div></details></>}
    </div></section>}

    <section className="grid gap-4 lg:grid-cols-3">{[[Package,'Original delivery',originalTimeline],[Truck,'Return pickup',returnTimeline],[ShieldCheck,'Refund / replacement',resolutionTimeline]].map(([Icon,title,events])=><div key={title} className="rounded-3xl border bg-white p-5"><div className="flex items-center gap-2"><Icon size={18} className="text-primary-700"/><h2 className="font-black">{title}</h2></div><div className="mt-4 space-y-4">{events.length?events.map((event,index)=><div key={`${event._id||event.status||event.action}-${index}`} className="flex gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600"/><div><p className="text-sm font-bold">{label(event.toStatus||event.status||event.action)}</p><p className="text-xs text-slate-500">{formatDate(event.at||event.timestamp||event.createdAt)}</p>{event.note&&<p className="mt-1 text-xs text-slate-600">{event.note}</p>}</div></div>):<div className="flex gap-2 text-sm text-slate-400"><Clock size={17}/> Not started</div>}</div></div>)}</section>
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4"/>Refunds are not released when an issue is reported or when a physical return is approved. They are recorded only after the required return/inspection decision and a confirmed supported payment-provider result.</div>
  </div>;
}
