import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FileUp, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffService } from '../../services/apiService';
import { professionalVerificationStatus } from '../../utils/authorization';

const labels = {
  pending_verification: 'Pending Platform Verification',
  rejected: 'Changes Required',
  suspended: 'Verification Suspended',
  expired: 'Credential Expired',
  verified: 'Professional Credential Verified'
};

const messages = {
  pending_verification: 'Your updated professional credential is waiting for Platform Admin review. Professional tools remain restricted until approval.',
  rejected: 'Your credential submission needs an update before it can be approved. Review the note below and submit a corrected credential.',
  suspended: 'Your professional verification is suspended. Contact Platform Admin and submit updated credentials when requested.',
  expired: 'Your professional credential has expired. Update your credential and submit it for Platform Admin review before using professional tools.',
  verified: 'Your professional credentials are current and approved.'
};

const isPast = value => Boolean(value && new Date(value) <= new Date());
const readable = value => String(value || '').replaceAll('_', ' ');

const ProfessionalVerificationStatus = () => {
  const navigate = useNavigate();
  const { user, refreshUserRole, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profile, setProfile] = useState(null);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [credential, setCredential] = useState({
    documentType: 'professional_license',
    name: '',
    issuingBody: '',
    credentialNumber: '',
    expiresAt: '',
    replacesDocumentId: '',
    file: null
  });
  const status = professionalVerificationStatus(user);
  const documents = useMemo(() => (profile?.credentialDocuments || []).filter(document => document.status !== 'archived'), [profile]);
  const replaceableDocuments = useMemo(() => documents.filter(document =>
    ['expired', 'rejected'].includes(document.status) || isPast(document.expiresAt)
  ), [documents]);

  const loadProfile = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadingProfile(true);
    try {
      const response = await staffService.getMyProfessionalProfile();
      setProfile(response.data.staff?.professionalProfile || {});
    } catch (error) {
      if (!quiet) toast.error(error.response?.data?.message || 'Unable to load your credential details.');
    } finally {
      if (!quiet) setLoadingProfile(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshUserRole(), loadProfile({ quiet: true })]);
    } finally {
      setRefreshing(false);
    }
  };

  const openRenewal = () => {
    const replacement = replaceableDocuments.find(document => document.documentType === 'professional_license') || replaceableDocuments[0];
    setCredential(current => ({
      ...current,
      documentType: replacement?.documentType || (user?.staffType === 'veterinarian' || user?.role === 'veterinarian' ? 'professional_license' : current.documentType),
      name: replacement?.name || current.name,
      issuingBody: replacement?.issuingBody || '',
      credentialNumber: '',
      expiresAt: '',
      replacesDocumentId: replacement?._id || '',
      file: null
    }));
    setRenewalOpen(true);
  };

  const submitRenewal = async event => {
    event.preventDefault();
    if (!credential.file) return toast.error('Select the current credential document to upload.');
    if (!credential.name.trim()) return toast.error('Credential name is required.');
    setSubmitting(true);
    try {
      const form = new FormData();
      for (const field of ['documentType', 'name', 'issuingBody', 'credentialNumber', 'expiresAt', 'replacesDocumentId']) {
        if (credential[field]) form.append(field, credential[field]);
      }
      form.append('document', credential.file);
      const response = await staffService.uploadMyCredential(form);
      setProfile(response.data.professionalProfile || profile);
      setRenewalOpen(false);
      setCredential({ documentType: 'professional_license', name: '', issuingBody: '', credentialNumber: '', expiresAt: '', replacesDocumentId: '', file: null });
      await refreshUserRole();
      toast.success('Credential submitted for Platform Admin review.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to submit the credential update.');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center p-4 dark:bg-slate-950">
    <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300"><ShieldCheck /></div>
      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-primary-700 dark:text-primary-300">Professional account</p>
      <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{labels[status] || 'Verification Required'}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{messages[status] || 'Platform Admin must review your professional credentials before professional tools become available.'}</p>
      {user?.professionalProfile?.verification?.notes && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><strong>Review note:</strong> {user.professionalProfile.verification.notes}</div>}

      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <p><strong>Current status:</strong> {labels[status] || readable(status)}</p>
        <p className="mt-1"><strong>Role:</strong> {readable(user?.staffType || user?.role)}</p>
        {!loadingProfile && documents.length > 0 && <p className="mt-1"><strong>Submitted credentials:</strong> {documents.length}</p>}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {status === 'verified'
          ? <button onClick={() => navigate('/admin/dashboard')} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-bold text-white">Continue</button>
          : <button onClick={openRenewal} disabled={loadingProfile} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-bold text-white disabled:opacity-50"><FileUp className="h-4 w-4" />{status === 'expired' ? 'Update Credentials' : 'Submit Credentials'}</button>}
        <button onClick={refresh} disabled={refreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary-200 px-4 text-sm font-bold text-primary-700 disabled:opacity-50 dark:border-primary-800 dark:text-primary-300"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Check Status</button>
        <button onClick={logout} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"><LogOut className="h-4 w-4" /> Logout</button>
      </div>

      {renewalOpen && status !== 'verified' && <form onSubmit={submitRenewal} className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
        <div><h2 className="text-sm font-black text-slate-900 dark:text-white">Update professional credential</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Upload a legitimate current credential. Platform Admin approval is still required.</p></div>
        {replaceableDocuments.length > 0 && <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Credential being replaced<select value={credential.replacesDocumentId} onChange={event => {
          const replacement = replaceableDocuments.find(document => document._id === event.target.value);
          setCredential(current => ({ ...current, replacesDocumentId: event.target.value, documentType: replacement?.documentType || current.documentType, name: replacement?.name || current.name, issuingBody: replacement?.issuingBody || current.issuingBody }));
        }} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Upload without replacing a listed credential</option>{replaceableDocuments.map(document => <option key={document._id} value={document._id}>{document.name} — {isPast(document.expiresAt) ? 'expired' : readable(document.status)}</option>)}</select></label>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Credential type<select value={credential.documentType} onChange={event => setCredential(current => ({ ...current, documentType: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="professional_license">Professional License</option><option value="certification">Certification</option><option value="training_certificate">Training Certificate</option></select></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Credential name<input required value={credential.name} onChange={event => setCredential(current => ({ ...current, name: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Issuing body<input value={credential.issuingBody} onChange={event => setCredential(current => ({ ...current, issuingBody: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">License / credential number<input value={credential.credentialNumber} onChange={event => setCredential(current => ({ ...current, credentialNumber: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Expiration date, if shown<input type="date" value={credential.expiresAt} onChange={event => setCredential(current => ({ ...current, expiresAt: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Current credential file<input required type="file" accept=".pdf,.doc,.docx,image/*" onChange={event => setCredential(current => ({ ...current, file: event.target.files?.[0] || null }))} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
        </div>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setRenewalOpen(false)} className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel</button><button disabled={submitting} className="h-9 rounded-xl bg-primary-700 px-4 text-xs font-bold text-white disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit for Review'}</button></div>
      </form>}
    </section>
  </main>;
};

export default ProfessionalVerificationStatus;
