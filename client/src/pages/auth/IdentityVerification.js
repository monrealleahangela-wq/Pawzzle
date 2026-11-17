import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { FileCheck2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';
import LiveIdentitySelfieCapture from '../../components/auth/LiveIdentitySelfieCapture';
import {
  ACCEPTED_ID_IMAGE_TYPES,
  GOVERNMENT_ID_TYPES,
  MAX_ID_IMAGE_BYTES
} from '../../constants/governmentIdTypes';
import { isIdentityVerificationRequired, portalHomeForUser } from '../../utils/authorization';

const IdentityVerification = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading, user, updateUser, logout } = useAuth();
  const [governmentIdType, setGovernmentIdType] = useState('');
  const [governmentIdImage, setGovernmentIdImage] = useState(null);
  const [selfieImage, setSelfieImage] = useState(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-100 border-t-primary-600" /></div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (!isIdentityVerificationRequired(user)) return <Navigate to={portalHomeForUser(user)} replace />;

  const chooseGovernmentId = event => {
    const file = event.target.files?.[0] || null;
    if (file && (!ACCEPTED_ID_IMAGE_TYPES.includes(file.type) || file.size > MAX_ID_IMAGE_BYTES)) {
      event.target.value = '';
      setGovernmentIdImage(null);
      setError('Government ID must be a JPG or PNG image no larger than 5 MB.');
      return;
    }
    setError('');
    setGovernmentIdImage(file);
  };

  const submit = async event => {
    event.preventDefault();
    if (!governmentIdType || !governmentIdImage || !selfieImage || !consent) {
      setError('Select an ID type, add the government ID image, capture a live selfie, and accept the consent statement.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data = new FormData();
      data.append('governmentIdType', governmentIdType);
      data.append('biometricConsent', 'true');
      data.append('governmentIdImage', governmentIdImage);
      data.append('selfieImage', selfieImage);
      const result = await authService.verifyIdentity(data);
      updateUser(result.user);
      toast.success('Identity verified. Pawzzle features are now unlocked.');
      navigate(portalHomeForUser(result.user), { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Identity verification failed. Check both images and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-primary-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white"><LockKeyhole className="h-6 w-6" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary-700">Required security check</p><h1 className="text-2xl font-black text-slate-950">Verify your identity to continue</h1></div></div>
          <button type="button" onClick={logout} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">Sign out</button>
        </div>

        <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
          <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm leading-6 text-primary-950">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Government ID and face match are mandatory.</strong> Until the live selfie matches the face on your ID, protected Pawzzle features remain locked.</p></div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-black text-slate-700"><FileCheck2 className="mr-1 inline h-4 w-4" /> Government ID type *<select required value={governmentIdType} onChange={event => setGovernmentIdType(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold"><option value="">Select an ID</option>{GOVERNMENT_ID_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-black text-slate-700">Government ID image *<input required={!governmentIdImage} type="file" accept="image/jpeg,image/png" onChange={chooseGovernmentId} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 file:mr-3 file:border-0 file:bg-slate-900 file:px-4 file:py-3.5 file:text-xs file:font-black file:text-white" />{governmentIdImage && <span className="mt-1 block truncate text-[11px] font-bold text-emerald-700">{governmentIdImage.name}</span>}</label>
          </div>

          <LiveIdentitySelfieCapture value={selfieImage} onCapture={setSelfieImage} />

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600" /><span className="text-xs font-semibold leading-5 text-slate-600">I consent to Pawzzle sending the ID image and live selfie to AWS Rekognition only for face comparison. I understand the selfie is discarded after comparison and the ID image is stored encrypted.</span></label>

          {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</p>}

          <button type="submit" disabled={submitting} className="h-12 w-full rounded-xl bg-slate-950 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Verifying identity...' : 'Verify ID and unlock Pawzzle'}</button>
        </form>
      </div>
    </main>
  );
};

export default IdentityVerification;
