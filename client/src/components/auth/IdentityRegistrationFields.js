import React from 'react';
import { CheckCircle2, FileCheck2, Loader2, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react';
import LiveIdentitySelfieCapture from './LiveIdentitySelfieCapture';
import { ACCEPTED_ID_IMAGE_TYPES, GOVERNMENT_ID_TYPES, MAX_ID_IMAGE_BYTES } from '../../constants/governmentIdTypes';

const inputClass = 'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10';
const labelClass = 'block text-xs font-black text-slate-700';

const IdentityRegistrationFields = ({ formData, onChange, onAddressChange, governmentIdImage, onGovernmentIdImage, selfieImage, onSelfieImage, onFileError, documentReview }) => {
  const changeId = event => {
    const file = event.target.files?.[0] || null;
    if (file && (!ACCEPTED_ID_IMAGE_TYPES.includes(file.type) || file.size > MAX_ID_IMAGE_BYTES)) {
      event.target.value = '';
      onFileError?.('Government ID must be a JPG or PNG image no larger than 5 MB.');
      return;
    }
    onGovernmentIdImage(file);
  };

  return (
    <section className="space-y-5 rounded-2xl border border-primary-100 bg-primary-50/30 p-4 sm:p-5" aria-labelledby="identity-registration-heading">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><ShieldCheck className="h-5 w-5" /></span><div><h3 id="identity-registration-heading" className="text-sm font-black text-slate-900">Verified personal identity</h3><p className="mt-1 text-xs leading-5 text-slate-500">Your ID is securely read to confirm its type and fill readable details, then encrypted. Your live selfie is compared securely and is not stored after verification.</p></div></div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}><UserRound className="mr-1 inline h-3.5 w-3.5" /> First name *<input name="firstName" required autoComplete="given-name" value={formData.firstName} onChange={onChange} className={inputClass} /></label>
        <label className={labelClass}>Middle name <span className="font-medium text-slate-400">(optional)</span><input name="middleName" autoComplete="additional-name" value={formData.middleName} onChange={onChange} className={inputClass} /></label>
        <label className={labelClass}>Surname *<input name="lastName" required autoComplete="family-name" value={formData.lastName} onChange={onChange} className={inputClass} /></label>
      </div>
      <label className={labelClass}><Phone className="mr-1 inline h-3.5 w-3.5" /> Contact number *<input name="phone" required type="tel" autoComplete="tel" placeholder="09XXXXXXXXX" value={formData.phone} onChange={onChange} className={inputClass} /></label>

      <fieldset className="space-y-4"><legend className="text-xs font-black text-slate-700"><MapPin className="mr-1 inline h-3.5 w-3.5" /> Home address *</legend><div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>House / street<input name="street" required autoComplete="street-address" value={formData.address.street} onChange={onAddressChange} className={inputClass} /></label>
        <label className={labelClass}>Barangay<input name="barangay" required value={formData.address.barangay} onChange={onAddressChange} className={inputClass} /></label>
        <label className={labelClass}>City / municipality<input name="city" required autoComplete="address-level2" value={formData.address.city} onChange={onAddressChange} className={inputClass} /></label>
        <label className={labelClass}>Province<input name="province" required autoComplete="address-level1" value={formData.address.province} onChange={onAddressChange} className={inputClass} /></label>
        <label className={labelClass}>ZIP code<input name="zipCode" required inputMode="numeric" autoComplete="postal-code" value={formData.address.zipCode} onChange={onAddressChange} className={inputClass} /></label>
        <label className={labelClass}>Country<input value="Philippines" readOnly className={`${inputClass} bg-slate-100 text-slate-600`} /></label>
      </div></fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}><FileCheck2 className="mr-1 inline h-3.5 w-3.5" /> Government ID type *<select name="governmentIdType" required value={formData.governmentIdType} onChange={onChange} className={inputClass}><option value="">Select an ID</option>{GOVERNMENT_ID_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Government ID image *<input type="file" required={!governmentIdImage} accept="image/jpeg,image/png" onChange={changeId} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 file:mr-3 file:border-0 file:bg-slate-900 file:px-4 file:py-3.5 file:text-xs file:font-black file:text-white" />{governmentIdImage && <span className="mt-1 block truncate text-[11px] font-bold text-emerald-700">{governmentIdImage.name}</span>}</label>
      </div>

      {documentReview?.status && documentReview.status !== 'idle' && (
        <div
          role={documentReview.status === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-xl border p-3 text-xs font-bold leading-5 ${documentReview.status === 'matched' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : documentReview.status === 'reading' ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}
        >
          {documentReview.status === 'reading'
            ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            : documentReview.status === 'matched'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              : <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{documentReview.message}</span>
        </div>
      )}

      <LiveIdentitySelfieCapture value={selfieImage} onCapture={onSelfieImage} />
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><input type="checkbox" name="biometricConsent" required checked={Boolean(formData.biometricConsent)} onChange={onChange} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600" /><span className="text-xs font-semibold leading-5 text-slate-600">I consent to Pawzzle securely reading my government ID to confirm its type and suggest form details, and sending the ID and live selfie to AWS Rekognition solely to compare their faces. I understand the selfie is discarded after comparison and the government ID is stored encrypted. *</span></label>
    </section>
  );
};

export default IdentityRegistrationFields;
