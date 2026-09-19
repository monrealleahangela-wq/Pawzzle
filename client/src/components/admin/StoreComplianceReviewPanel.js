import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, FileCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import { storeComplianceService } from '../../services/apiService';

const labelize = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const flatten = (value, prefix = '') => Object.entries(value || {}).flatMap(([key, item]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date) ? flatten(item, path) : [[path, item]];
});
const renderValue = value => value === null || value === undefined || value === '' ? '—' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value).replace(/_/g, ' ');

const StoreComplianceReviewPanel = () => {
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [review, setReview] = useState({ decision: '', verifiedTaxStatus: '', notes: '', requiredCorrections: '' });
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { const response = await storeComplianceService.getRequests(status ? { status } : {}); setRequests(response.data.requests || []); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to load Business & Tax review requests.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* load is intentionally keyed by status */ }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRequest = async id => {
    try { const response = await storeComplianceService.getRequest(id); setSelected(response.data.request); setReview({ decision: '', verifiedTaxStatus: '', notes: '', requiredCorrections: '' }); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to open request.'); }
  };
  const openDocument = async document => {
    try { const response = await storeComplianceService.getRequestDocument(selected._id, document._id); window.open(response.data.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to open document.'); }
  };
  const submitReview = async () => {
    if (!review.decision) return toast.error('Choose a review decision.');
    try {
      await storeComplianceService.reviewRequest(selected._id, { ...review, requiredCorrections: review.requiredCorrections.split(',').map(value => value.trim()).filter(Boolean) });
      toast.success('Business & Tax review saved.'); setSelected(null); await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to save review.'); }
  };
  const proposedRows = flatten(selected?.proposedProfile);
  const currentMap = new Map(flatten(selected?.currentSnapshot));
  const declaration = selected?.proposedProfile?.tax?.declaredTaxStatus;

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300"><FileCheck size={17} /></div><div><h2 className="text-sm font-black text-slate-900 dark:text-white">Post-registration Business & Tax Reviews</h2><p className="text-[10px] text-slate-500">Updates, corrections, document replacements, and renewals. Original Store Applications remain historical.</p></div></div><div className="flex items-center gap-2"><select value={status} onChange={event => setStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[10px] dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">All statuses</option><option value="pending_review">Pending review</option><option value="under_review">Under review</option><option value="needs_correction">Needs correction</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select><button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700" aria-label="Refresh compliance requests"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button></div></div>
    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{requests.length === 0 ? <p className="col-span-full rounded-xl bg-slate-50 p-4 text-center text-[10px] text-slate-500 dark:bg-slate-800">No post-registration requests match this filter.</p> : requests.map(request => <button key={request._id} type="button" onClick={() => openRequest(request._id)} className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-primary-400 dark:border-slate-700"><div className="flex items-start justify-between gap-2"><strong className="text-[11px] text-slate-900 dark:text-white">{request.store?.name || 'Store'}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{labelize(request.status)}</span></div><p className="mt-1 text-[9px] text-slate-500">{labelize(request.requestType)} · {new Date(request.submittedAt).toLocaleDateString()}</p><p className="mt-2 line-clamp-2 text-[10px] text-slate-700 dark:text-slate-300">{request.reason}</p></button>)}</div>

    {selected && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-3" role="dialog" aria-modal="true"><div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase text-primary-600">{labelize(selected.requestType)}</p><h3 className="text-lg font-black text-slate-900 dark:text-white">{selected.store?.name}</h3><p className="text-[10px] text-slate-500">Submitted by {selected.owner?.firstName} {selected.owner?.lastName} · {selected.owner?.email}</p></div><button onClick={() => setSelected(null)} className="h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-bold dark:border-slate-700">Close</button></div>
      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200"><strong className="block">Applicant reason</strong>{selected.reason}</div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="min-w-[700px] w-full text-left text-[10px]"><thead className="bg-slate-50 text-[8px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-3">Field</th><th className="p-3">Current authoritative value</th><th className="p-3">Proposed value</th></tr></thead><tbody>{proposedRows.map(([path, value]) => { const prior = currentMap.get(path); const changed = JSON.stringify(prior) !== JSON.stringify(value); return <tr key={path} className={`border-t border-slate-100 dark:border-slate-800 ${changed ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}><td className="p-3 font-bold text-slate-700 dark:text-slate-200">{labelize(path.replace(/\./g, ' / '))}</td><td className="p-3 text-slate-500">{path.endsWith('.tin') ? 'Masked sensitive value' : renderValue(prior)}</td><td className="p-3 font-semibold text-slate-900 dark:text-white">{path.endsWith('.tin') ? 'Updated sensitive value provided' : renderValue(value)}</td></tr>; })}</tbody></table></div>
      <div className="mt-4"><h4 className="text-xs font-black text-slate-900 dark:text-white">Replacement documents</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{selected.proposedDocuments?.length ? selected.proposedDocuments.map(document => <button key={document._id} onClick={() => openDocument(document)} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left dark:border-slate-700"><div><strong className="block text-[10px] text-slate-800 dark:text-white">{document.label}</strong><span className="text-[9px] text-slate-500">{document.hasExpiration && document.expirationDate ? `Expires ${new Date(document.expirationDate).toLocaleDateString()}` : 'No explicit expiration recorded'}</span></div><ExternalLink size={14} /></button>) : <p className="text-[10px] text-slate-500">No replacement files in this request; review the retained current documents where applicable.</p>}</div></div>
      {review.verifiedTaxStatus && declaration && review.verifiedTaxStatus !== declaration && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900"><AlertTriangle size={14} className="mr-2 inline" />The proposed declaration differs from the verified decision. Record the documentary basis in review notes.</div>}
      <div className="mt-4 grid gap-3 md:grid-cols-2"><label><span className="text-[9px] font-black uppercase text-slate-500">Decision</span><select value={review.decision} onChange={event => setReview(current => ({ ...current, decision: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Select</option><option value="approved">Approve update / renewal</option><option value="needs_correction">Request correction</option><option value="rejected">Reject request</option></select></label><label><span className="text-[9px] font-black uppercase text-slate-500">Verified tax decision</span><select value={review.verifiedTaxStatus} onChange={event => setReview(current => ({ ...current, verifiedTaxStatus: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Not applicable / unregistered</option><option value="vat_registered">Verify as VAT Registered</option><option value="non_vat_registered">Verify as Non-VAT Registered</option></select></label><label className="md:col-span-2"><span className="text-[9px] font-black uppercase text-slate-500">Review notes / reason</span><textarea value={review.notes} onChange={event => setReview(current => ({ ...current, notes: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>{review.decision === 'needs_correction' && <label className="md:col-span-2"><span className="text-[9px] font-black uppercase text-slate-500">Required sections (comma-separated)</span><input value={review.requiredCorrections} onChange={event => setReview(current => ({ ...current, requiredCorrections: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="tax, bir certificate, representative" /></label>}</div>
      <button onClick={submitReview} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-black uppercase text-white hover:bg-primary-600"><ShieldCheck size={15} />Save Platform Admin decision</button>
    </div></div>}
  </section>;
};

export default StoreComplianceReviewPanel;
