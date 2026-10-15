import React, { useCallback, useEffect, useState } from 'react';
import { returnService } from '../../services/returnService';
import { useAuth } from '../../contexts/AuthContext';
import { effectiveStaffType } from '../../utils/authorization';

export const RETURN_STAGES = [
  ['requested', 'Return Requested'], ['approved', 'Return Approved'],
  ['preparing', 'Preparing for Return'], ['ready_for_pickup', 'Ready for Pickup or Dispatch'],
  ['returning', 'Returning to Seller'], ['arrived', 'Arrived at Seller'],
  ['completed', 'Return Completed']
];

export const actionsForReturn = (record, user) => {
  if (!record || ['completed', 'cancelled', 'rejected'].includes(record.status)) return [];
  const effectiveRole = effectiveStaffType(user);
  const seller = ['admin', 'store_owner', 'manager'].includes(effectiveRole);
  const rider = String(record.assignedRider || '') === String(user?._id || '')
    && effectiveRole === 'delivery_rider';
  const customer = user?.role === 'customer' && String(record.customer) === String(user?._id);
  if (record.exception?.kind) return seller ? ['resolve_exception', 'cancel'] : [];
  if (seller) {
    return ({
      requested: ['approve', 'reject', 'cancel'],
      approved: ['prepare', 'cancel'],
      preparing: ['ready', 'cancel'],
      ready_for_pickup: [record.assignedRider ? null : 'assign_rider', 'pickup', 'report_delayed', 'report_pickup_failed', 'cancel'],
      returning: ['arrive', 'report_delayed'],
      arrived: [record.sellerReceipt?.confirmedAt ? 'complete' : 'confirm_receipt']
    }[record.status] || []).filter(Boolean);
  }
  if (rider) return ({
    ready_for_pickup: ['pickup', 'report_delayed', 'report_pickup_failed'],
    returning: ['arrive', 'report_delayed']
  }[record.status] || []);
  return customer && record.status === 'requested' ? ['cancel'] : [];
};

const label = action => ({
  approve: 'Approve return', reject: 'Reject return', prepare: 'Start preparation',
  ready: 'Ready for pickup', assign_rider: 'Assign Rider', pickup: 'Confirm pickup',
  arrive: 'Arrived at Seller', confirm_receipt: 'Confirm physical receipt',
  complete: 'Complete return', report_delayed: 'Report delay',
  report_pickup_failed: 'Report failed pickup', resolve_exception: 'Resolve exception',
  cancel: 'Cancel return'
}[action] || action);
const dateText = value => value ? new Date(value).toLocaleString() : 'Pending';

export function ReturnCard({ record, user, riders = [], onAction, onEvidence, busy = false }) {
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [riderId, setRiderId] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceUrls, setEvidenceUrls] = useState({});
  const [evidenceError, setEvidenceError] = useState('');
  const actions = actionsForReturn(record, user);
  const activeAction = actions.includes(action) ? action : actions[0] || '';
  const stageIndex = RETURN_STAGES.findIndex(([key]) => key === record.status);
  const terminal = ['rejected', 'cancelled'].includes(record.status);
  const lastReachedIndex = terminal
    ? Math.max(0, ...(record.history || []).map(event => RETURN_STAGES.findIndex(([key]) => key === event.toStatus)))
    : stageIndex;
  const requiredNote = ['reject', 'cancel', 'report_delayed', 'report_pickup_failed'].includes(activeAction);
  const role = effectiveStaffType(user);
  const canAttachEvidence = !terminal && record.status !== 'completed' && Boolean(onEvidence)
    && ((role === 'customer' && String(user?._id) === String(record.customer))
      || ['admin', 'store_owner', 'manager'].includes(role)
      || (role === 'delivery_rider' && String(user?._id) === String(record.assignedRider)));
  const submit = async event => {
    event.preventDefault();
    if (await onAction(record._id, activeAction, note, riderId)) {
      setNote('');
      setRiderId('');
    }
  };
  const attachEvidence = async event => {
    event.preventDefault();
    if (!evidenceFile) return;
    if (await onEvidence(record._id, evidenceFile)) setEvidenceFile(null);
  };
  const viewEvidence = async evidenceId => {
    setEvidenceError('');
    try {
      const response = await returnService.evidenceAccess(record._id, evidenceId);
      setEvidenceUrls(previous => ({ ...previous, [evidenceId]: response.data.url }));
    } catch (failure) { setEvidenceError(failure.response?.data?.message || 'Unable to open return evidence.'); }
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={`Return for ${record.itemSnapshot?.name || 'order item'}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-bold text-slate-900">{record.itemSnapshot?.name || 'Order item'}</h3>
        <p className="text-xs text-slate-500">Quantity {record.itemSnapshot?.quantity} · Return reference {String(record._id).slice(-8).toUpperCase()}</p></div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">{terminal ? label(record.status) : RETURN_STAGES[stageIndex]?.[1]}</span>
    </div>
    <ol className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Return to Seller progress">
      {RETURN_STAGES.map(([key, title], index) => {
        const event = (record.history || []).find(row => row.toStatus === key);
        const done = lastReachedIndex >= index;
        return <li key={key} className={`rounded-xl border p-2 text-xs ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-500'}`}>
          <strong>{index + 1}. {title}</strong><span className="block text-[11px]">{dateText(event?.at)}</span>
        </li>;
      })}
    </ol>
    {record.exception?.kind && <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
      {record.exception.kind === 'pickup_failed' ? 'Pickup failed' : 'Return delayed'}: {record.exception.reason}
    </p>}
    {terminal && <p role="status" className="mt-3 text-xs text-rose-700">This return was {record.status}. Its completed stages remain in the history below.</p>}
    {record.sellerReceipt?.confirmedAt && <p className="mt-3 text-xs text-emerald-800">Seller receipt confirmed {dateText(record.sellerReceipt.confirmedAt)}.</p>}
    <p className="mt-3 text-xs text-slate-600">Refund: {(record.refund?.status || 'unlinked').replaceAll('_', ' ')}. Check the Order payment details for the authoritative refund state; return completion does not confirm a refund.</p>
    {(record.evidence || []).length > 0 && <div className="mt-3 text-xs">
      <p className="font-semibold text-slate-700">Return evidence</p>
      <ul className="mt-1 space-y-1">{record.evidence.map((item, index) => <li key={item._id}>
        {index + 1}. {item.originalName || 'Image'} · {dateText(item.uploadedAt)}{' '}
        {evidenceUrls[item._id]
          ? <a href={evidenceUrls[item._id]} target="_blank" rel="noopener noreferrer" className="underline">Open image</a>
          : <button type="button" onClick={() => viewEvidence(item._id)} className="underline">Get secure link</button>}
      </li>)}</ul>
      {evidenceError && <p role="alert" className="text-rose-700">{evidenceError}</p>}
    </div>}
    {canAttachEvidence && <form onSubmit={attachEvidence} className="mt-3 flex flex-wrap items-end gap-2 text-xs">
      <label>Attach return evidence (JPG, PNG, WebP; 5 MB maximum)
        <input aria-label="Return evidence image" type="file" accept="image/jpeg,image/png,image/webp"
          onChange={event => setEvidenceFile(event.target.files?.[0] || null)} className="mt-1 block max-w-full" />
      </label>
      <button type="submit" disabled={busy || !evidenceFile} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">Attach image</button>
    </form>}
    <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-slate-700">Return history</summary>
      <ol className="mt-2 space-y-2">{(record.history || []).map((event, index) =>
        <li key={`${event.at}-${index}`} className="rounded-lg bg-slate-50 p-2">
          <strong>{label(event.action)}</strong> · {dateText(event.at)}
          {event.note && <p className="mt-1 whitespace-pre-wrap break-words">{event.note}</p>}
        </li>)}</ol>
    </details>
    {actions.length > 0 && <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-2">
      <label className="text-xs font-semibold">Next action
        <select aria-label="Next return action" value={activeAction} onChange={event => setAction(event.target.value)} className="mt-1 w-full rounded-lg border p-2">
          {actions.map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select>
      </label>
      {activeAction === 'assign_rider' && <label className="text-xs font-semibold">Rider
        <select aria-label="Return Rider" required value={riderId} onChange={event => setRiderId(event.target.value)} className="mt-1 w-full rounded-lg border p-2">
          <option value="">Select active Store Rider</option>
          {riders.map(row => <option key={row._id} value={row._id}>{[row.firstName, row.lastName].filter(Boolean).join(' ') || row.username}</option>)}
        </select>
      </label>}
      <label className="text-xs font-semibold sm:col-span-2">Reason or note {requiredNote ? '(required)' : '(optional)'}
        <textarea value={note} onChange={event => setNote(event.target.value)} required={requiredNote} maxLength={1000}
          className="mt-1 w-full rounded-lg border p-2" rows={2} />
      </label>
      <button type="submit" disabled={busy || (activeAction === 'assign_rider' && !riderId)}
        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
        {busy ? 'Saving…' : label(activeAction)}
      </button>
    </form>}
  </article>;
}

export default function ReturnTracker({ order }) {
  const { user } = useAuth();
  const [data, setData] = useState({ returns: [], eligibleItems: [] });
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [itemId, setItemId] = useState('');
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await returnService.forOrder(order._id);
      setData(response.data);
      if (user?.role !== 'customer' && user?.role !== 'delivery_rider') {
        returnService.riders(order._id).then(result => setRiders(result.data.riders || [])).catch(() => setRiders([]));
      }
    } catch (failure) {
      setError(failure.response?.data?.message || 'Could not load return tracking.');
    } finally { setLoading(false); }
  }, [order._id, user?.role]);
  useEffect(() => { load(); }, [load]);
  const request = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await returnService.request(order._id, itemId, reason);
      setReason(''); setItemId('');
      await load();
    } catch (failure) { setError(failure.response?.data?.message || 'Could not submit this return request.'); }
    finally { setBusy(false); }
  };
  const act = async (id, action, note, riderId) => {
    setBusy(true); setError('');
    try { await returnService.transition(id, action, note, riderId); await load(); return true; }
    catch (failure) { setError(failure.response?.data?.message || 'Could not update this return. Please refresh.'); return false; }
    finally { setBusy(false); }
  };
  const attachEvidence = async (id, file) => {
    setBusy(true); setError('');
    try { await returnService.uploadEvidence(id, file); await load(); return true; }
    catch (failure) { setError(failure.response?.data?.message || 'Unable to attach return evidence.'); return false; }
    finally { setBusy(false); }
  };
  return <section className="card p-4 sm:p-6" aria-label="Return to Seller">
    <h2 className="text-lg font-black text-slate-900">Return to Seller</h2>
    <p className="mt-1 text-xs text-slate-600">Physical return progress is separate from outbound delivery and any refund review.</p>
    {loading && <p role="status" className="mt-3 text-xs">Loading returns…</p>}
    {error && <div role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{error}
      <button type="button" onClick={load} className="ml-3 underline">Retry</button></div>}
    {!loading && (!error || data.returns.length > 0 || data.eligibleItems.length > 0) && <div className="mt-4 space-y-4">
      {data.returns.length === 0 && <p className="text-xs text-slate-500">No customer returns have been requested for this order.</p>}
      {data.returns.map(record => <ReturnCard key={record._id} record={record} user={user} riders={riders} onAction={act} onEvidence={attachEvidence} busy={busy} />)}
      {user?.role === 'customer' && data.eligibleItems.length > 0 && <form onSubmit={request} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Item to return
          <select aria-label="Item to return" required value={itemId} onChange={event => setItemId(event.target.value)} className="mt-1 w-full rounded-lg border p-2">
            <option value="">Select an item</option>
            {data.eligibleItems.map(item => <option value={item._id} key={item._id}>{item.name} · Qty {item.quantity}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Reason for Store review
          <textarea aria-label="Return reason" required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border p-2" rows={2} />
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Request return</button>
      </form>}
    </div>}
  </section>;
}
