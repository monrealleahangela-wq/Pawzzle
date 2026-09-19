import React, { useCallback, useEffect, useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import { getImageUrl, staffService } from '../../services/apiService';

const documentReviewState = document => {
  if (['pending_verification', 'rejected', 'suspended', 'archived'].includes(document.status)) return document.status;
  if (document.expiresAt) {
    const expiresAt = new Date(document.expiresAt);
    if (expiresAt <= new Date() || document.status === 'expired') return 'expired';
    if (expiresAt <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) return 'expiring';
  }
  return document.status === 'verified' ? 'current_valid' : document.status;
};

const stateLabel = state => ({
  current_valid: 'Current / Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  pending_verification: 'Pending Review',
  rejected: 'Rejected',
  suspended: 'Suspended'
}[state] || String(state || '').replaceAll('_', ' '));

const SpecializedStaffVerification = () => {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('pending_verification');
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await staffService.getProfessionalVerifications(status ? { status } : {});
      setRows(response.data.specialists || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to load professional verifications.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const update = async (member, nextStatus) => {
    try {
      await staffService.updateProfessionalVerification(member._id, { status: nextStatus, notes: notes[member._id] || '' });
      toast.success('Professional verification updated.');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to update verification.');
    }
  };

  const updateDocument = async (member, document, nextStatus) => {
    try {
      await staffService.updateCredentialVerification(member._id, document._id, { status: nextStatus, notes: notes[member._id] || '' });
      toast.success('Credential review saved.');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to update credential.');
    }
  };

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-primary-700">Platform Admin</p><h1 className="text-2xl font-black text-slate-900">Professional Verification</h1><p className="text-sm text-slate-500">Approve current professional credentials and portal access.</p></div>
      <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="pending_verification">Pending Review</option><option value="verified">Verified</option><option value="expired">Expired</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option><option value="">All</option></select>
    </header>

    {loading
      ? <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Loading verifications...</div>
      : !rows.length
        ? <div className="rounded-xl border border-dashed bg-white p-8 text-center"><ShieldCheck className="mx-auto text-slate-300"/><p className="mt-2 text-sm text-slate-500">No specialists match this status.</p></div>
        : <div className="grid gap-4 lg:grid-cols-2">{rows.map(member => {
          const documents = member.professionalProfile?.credentialDocuments?.filter(document => document.status !== 'archived') || [];
          return <article key={member._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">{member.firstName} {member.lastName}</h2><p className="text-xs text-slate-500">{(member.staffType || member.role).replaceAll('_', ' ')} · {member.store?.name || 'No branch'} · {member.professionalProfile?.staffId || member._id}</p><p className="mt-1 text-[11px] text-slate-500">{member.professionalProfile?.specialty || 'Specialty not provided'} · {Number(member.professionalProfile?.experienceYears || 0)} years experience</p></div><span className="rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-bold uppercase text-primary-700">{stateLabel(member.professionalVerificationStatus)}</span></div>
            <div className="mt-4 space-y-2">{documents.length ? documents.map(document => {
              const reviewState = documentReviewState(document);
              const expired = reviewState === 'expired';
              return <div key={document._id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-xs text-slate-700">
                <a href={getImageUrl(document.documentUrl)} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 hover:text-primary-700"><FileText className="h-4 w-4 shrink-0 text-primary-600"/><span><strong>{document.name}</strong><br/>{document.documentType.replaceAll('_', ' ')} · {stateLabel(reviewState)}{document.expiresAt ? ` · Expires ${new Date(document.expiresAt).toLocaleDateString()}` : ''}</span></a>
                <button disabled={expired} title={expired ? 'A current replacement credential must be submitted.' : 'Verify this current credential'} onClick={() => updateDocument(member, document, 'verified')} className="rounded-lg bg-primary-50 px-2 py-1 font-bold text-primary-700 disabled:cursor-not-allowed disabled:opacity-50">{expired ? 'Renewal required' : 'Verify current credential'}</button>
                <button onClick={() => updateDocument(member, document, 'rejected')} className="rounded-lg bg-rose-50 px-2 py-1 font-bold text-rose-700">Reject</button>
              </div>;
            }) : <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">No current credential documents submitted.</p>}</div>
            <textarea value={notes[member._id] || ''} onChange={event => setNotes(current => ({ ...current, [member._id]: event.target.value }))} placeholder="Reason required for rejection or suspension" className="mt-4 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm"/>
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => update(member, 'verified')} className="h-9 rounded-xl bg-primary-700 px-4 text-xs font-bold text-white">Approve Professional Access</button><button onClick={() => update(member, 'rejected')} className="h-9 rounded-xl border border-rose-200 px-4 text-xs font-bold text-rose-700">Reject</button><button onClick={() => update(member, 'suspended')} className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700">Suspend</button><button onClick={() => update(member, 'pending_verification')} className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700">Request correction</button></div>
          </article>;
        })}</div>}
  </div>;
};

export default SpecializedStaffVerification;
