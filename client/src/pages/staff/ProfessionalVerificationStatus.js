import React, { useState } from 'react';
import { ShieldCheck, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { professionalVerificationStatus } from '../../utils/authorization';

const labels = {
  pending_verification: 'Pending Platform Verification',
  rejected: 'Changes Required',
  suspended: 'Verification Suspended',
  expired: 'Credential Expired'
};

const ProfessionalVerificationStatus = () => {
  const { user, refreshUserRole, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const status = professionalVerificationStatus(user);
  const refresh = async () => {
    setRefreshing(true);
    try { await refreshUserRole(); } finally { setRefreshing(false); }
  };
  return <main className="flex min-h-screen items-center justify-center p-4">
    <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><ShieldCheck /></div>
      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-primary-700">Professional account</p>
      <h1 className="mt-1 text-2xl font-black text-slate-900">{labels[status] || 'Verification Required'}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Platform Admin must review your professional credentials before you can use veterinarian, grooming, training, or boarding tools.</p>
      {user?.professionalProfile?.verification?.notes && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Review note:</strong> {user.professionalProfile.verification.notes}</div>}
      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><p><strong>Current status:</strong> {labels[status] || status.replaceAll('_', ' ')}</p><p className="mt-1"><strong>Role:</strong> {(user?.staffType || user?.role || '').replaceAll('_', ' ')}</p></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button onClick={refresh} disabled={refreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-bold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Check status</button>
        <button onClick={logout} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700"><LogOut className="h-4 w-4" /> Sign out</button>
      </div>
    </section>
  </main>;
};

export default ProfessionalVerificationStatus;
