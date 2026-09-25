import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import { storeComplianceService } from '../../services/apiService';

const labelize = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const dateText = value => value ? new Date(value).toLocaleDateString() : 'Not provided';
const fieldClass = 'mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const emptyFiles = { businessRegistration: null, birCertificate: null, authorityDocument: null, mayorsPermit: null, barangayClearance: null };

const Input = ({ label, value, onChange, type = 'text', required = false, placeholder = '' }) => (
  <label className="block min-w-0"><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}{required ? ' *' : ''}</span><input type={type} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={fieldClass} /></label>
);

const DocumentUpload = ({ name, label, file, metadata, onFile, onMetadata, required }) => (
  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="block text-xs text-slate-900 dark:text-white">{label}{required ? ' *' : ''}</strong><span className="text-[9px] text-slate-500">Upload only when adding or replacing this document.</span></div><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 text-[10px] font-bold text-white hover:bg-primary-600"><Upload size={13} />{file ? 'Replace file' : 'Choose file'}<input type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" className="hidden" onChange={event => onFile(name, event.target.files?.[0] || null)} /></label></div>
    {file && <p className="mt-2 break-all text-[10px] font-medium text-primary-700 dark:text-primary-300">{file.name}</p>}
    {file && <div className="mt-3 grid gap-3 sm:grid-cols-3"><Input label="Issue date" type="date" value={metadata.issueDate} onChange={value => onMetadata(name, 'issueDate', value)} /><label className="flex h-10 items-center gap-2 self-end rounded-xl bg-slate-50 px-3 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"><input type="checkbox" checked={Boolean(metadata.hasExpiration)} onChange={event => onMetadata(name, 'hasExpiration', event.target.checked)} />Has an explicit expiry</label>{metadata.hasExpiration && <Input label="Expiration date" required type="date" value={metadata.expirationDate} onChange={value => onMetadata(name, 'expirationDate', value)} />}</div>}
  </div>
);

const BusinessTaxComplianceSettings = () => {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState({ business: {}, representative: {}, tax: {} });
  const [reason, setReason] = useState('');
  const [requestType, setRequestType] = useState('business_update');
  const [files, setFiles] = useState(emptyFiles);
  const [metadata, setMetadata] = useState({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await storeComplianceService.getMyCompliance();
      const next = response.data;
      setData(next);
      const source = next.currentRequest?.proposedProfile || next.currentProfile || { business: {}, representative: {}, tax: {} };
      setProfile({ business: source.business || {}, representative: source.representative || {}, tax: source.tax || {} });
      setReason(next.currentRequest?.reason || '');
      setRequestType(next.currentRequest?.requestType === 'correction_resubmission' ? 'business_update' : (next.currentRequest?.requestType || (next.currentProfile?.tax?.verificationStatus === 'verified' ? 'business_update' : 'initial_verification')));
      setEditing(next.currentRequest?.status === 'needs_correction');
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to load Business & Tax Information.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const update = (section, key, value) => setProfile(current => ({ ...current, [section]: { ...current[section], [key]: value } }));
  const updateNested = (section, parent, key, value) => setProfile(current => ({ ...current, [section]: { ...current[section], [parent]: { ...(current[section]?.[parent] || {}), [key]: value } } }));
  const updateFile = (name, value) => setFiles(current => ({ ...current, [name]: value }));
  const updateMetadata = (name, key, value) => setMetadata(current => ({ ...current, [name]: { ...(current[name] || {}), [key]: value } }));
  const requestActive = ['pending_review', 'under_review'].includes(data?.currentRequest?.status);
  const isBirRegistered = profile.tax?.birRegistrationStatus === 'registered';
  const requiresAuthority = Boolean(profile.representative?.isAuthorizedRepresentative);
  const authoritativeTax = data?.currentProfile?.tax || {};
  const taxVerificationStatus = authoritativeTax.verificationStatus || 'unverified';
  const statusTone = taxVerificationStatus === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-800' : taxVerificationStatus === 'verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800';

  const documents = useMemo(() => data?.compliance?.documents || [], [data]);
  const openDocument = async (requirementKey, version) => {
    try { const response = await storeComplianceService.getMyDocument(requirementKey, version); window.open(response.data.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(error.response?.data?.message || 'Unable to open document.'); }
  };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = JSON.parse(JSON.stringify(profile));
      delete payload.tax.verifiedTaxStatus;
      delete payload.tax.verificationStatus;
      delete payload.tax.tinMasked;
      if (!payload.tax.tin) delete payload.tax.tin;
      const form = new FormData();
      form.append('requestType', requestType);
      form.append('reason', reason);
      form.append('proposedProfile', JSON.stringify(payload));
      form.append('documentMetadata', JSON.stringify(metadata));
      Object.entries(files).forEach(([key, file]) => { if (file) form.append(key, file); });
      const response = await storeComplianceService.submitRequest(form);
      toast.success(response.data.message);
      setFiles(emptyFiles); setMetadata({}); setEditing(false);
      await load();
    } catch (error) {
      const first = error.response?.data?.errors?.[0]?.message;
      toast.error(first || error.response?.data?.message || 'Unable to submit Business & Tax information.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">Loading Business & Tax Information…</div>;
  if (!data) return null;

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300"><ShieldCheck size={19} /></div><div><h3 className="text-sm font-black text-slate-900 dark:text-white">Business & Tax Information</h3><p className="text-[10px] text-slate-500">Platform Admin verification controls future transaction eligibility.</p></div></div><span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase ${statusTone}`}>Tax: {labelize(taxVerificationStatus)}</span></div>
      {data.compliance?.blockingReasons?.length > 0 && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] text-rose-800"><strong className="block">Store operations restricted</strong>{data.compliance.blockingReasons.map(reasonItem => <p key={`${reasonItem.code}-${reasonItem.requirementKey}`}>{reasonItem.message}</p>)}</div>}
      {data.currentRequest && <div className={`mt-4 rounded-xl border p-3 text-[10px] ${data.currentRequest.status === 'needs_correction' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}><strong className="block">Request: {labelize(data.currentRequest.status)}</strong>{data.currentRequest.correctionReason && <p className="mt-1">{data.currentRequest.correctionReason}</p>}{data.currentRequest.requiredCorrections?.length > 0 && <p className="mt-1">Sections: {data.currentRequest.requiredCorrections.join(', ')}</p>}</div>}
    </section>

    {!editing && <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h4 className="text-xs font-black text-slate-900 dark:text-white">Current verified business profile</h4><dl className="mt-3 grid gap-3 sm:grid-cols-2">{[['Registered name', profile.business?.registeredBusinessName], ['Trade name', profile.business?.tradeName], ['Business type', labelize(profile.business?.legalStructure)], ['Registration', `${String(profile.business?.registrationAuthority || '').toUpperCase()} ${profile.business?.registrationNumber || ''}`], ['Registration date', dateText(profile.business?.registrationDate)], ['Registration expiry', dateText(profile.business?.registrationExpirationDate)]].map(([label, value]) => <div key={label}><dt className="text-[8px] font-black uppercase text-slate-400">{label}</dt><dd className="mt-1 break-words text-[11px] font-semibold text-slate-800 dark:text-slate-200">{value || 'Not provided'}</dd></div>)}</dl></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h4 className="text-xs font-black text-slate-900 dark:text-white">Current tax profile</h4><dl className="mt-3 grid gap-3 sm:grid-cols-2">{[['BIR status', labelize(authoritativeTax.birRegistrationStatus)], ['TIN', authoritativeTax.tinMasked || 'Not provided'], ['Branch code', authoritativeTax.branchCode || 'Not provided'], ['Declared status', labelize(authoritativeTax.declaredTaxStatus)], ['Verified status', labelize(authoritativeTax.verifiedTaxStatus)], ['Verification', labelize(authoritativeTax.verificationStatus)]].map(([label, value]) => <div key={label}><dt className="text-[8px] font-black uppercase text-slate-400">{label}</dt><dd className="mt-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200">{value || 'Not provided'}</dd></div>)}</dl></div>
    </section>}

    {!editing && <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-black text-slate-900 dark:text-white">Verified documents</h4><p className="text-[9px] text-slate-500">Only dates printed on a document are tracked. Older versions remain in the audit history.</p></div><FileText size={18} className="text-primary-600" /></div><div className="mt-3 grid gap-2">{documents.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-[10px] text-slate-500 dark:bg-slate-800">No versioned post-registration documents yet. Submit verification to establish the current profile.</p> : documents.map(document => <div key={document.requirementKey} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 dark:border-slate-800"><div><strong className="block text-[11px] text-slate-800 dark:text-slate-100">{document.label}</strong><span className="text-[9px] text-slate-500">Version {document.currentVersion} · {labelize(document.expirationState)}{document.expirationDate ? ` · expires ${dateText(document.expirationDate)}` : ''}</span></div><button type="button" onClick={() => openDocument(document.requirementKey)} className="h-8 rounded-lg border border-slate-200 px-3 text-[9px] font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">View current</button></div>)}</div></section>}

    {!editing && !requestActive && <button type="button" onClick={() => setEditing(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-black uppercase text-white hover:bg-primary-600"><RefreshCw size={14} />{taxVerificationStatus === 'verified' ? 'Request update or renewal' : 'Complete Business & Tax Verification'}</button>}

    {editing && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-black text-slate-900 dark:text-white">Proposed update</h4><p className="text-[10px] text-slate-500">Current verified values stay authoritative until approval.</p></div><button type="button" onClick={() => setEditing(false)} className="text-[10px] font-bold text-slate-500">Cancel</button></div>
      <label className="block"><span className="text-[9px] font-black uppercase text-slate-500">Request type</span><select className={fieldClass} value={requestType} onChange={event => setRequestType(event.target.value)}><option value="initial_verification">Initial / legacy verification</option><option value="business_update">Business information update</option><option value="tax_update">Tax information update</option><option value="document_replacement">Document replacement</option><option value="document_renewal">Document renewal</option></select></label>
      <div><h5 className="mb-2 text-[10px] font-black uppercase text-slate-500">Business Information</h5><div className="grid gap-3 md:grid-cols-2"><Input required label="Registered business name" value={profile.business?.registeredBusinessName} onChange={value => update('business', 'registeredBusinessName', value)} /><Input required label="Trade name" value={profile.business?.tradeName} onChange={value => update('business', 'tradeName', value)} /><label><span className="text-[9px] font-black uppercase text-slate-500">Business structure *</span><select className={fieldClass} value={profile.business?.legalStructure || ''} onChange={event => update('business', 'legalStructure', event.target.value)}><option value="">Select</option>{['sole_proprietorship','one_person_corporation','corporation','partnership','cooperative','other'].map(value => <option key={value} value={value}>{labelize(value)}</option>)}</select></label><Input required label="Nature of business" value={profile.business?.natureOfBusiness} onChange={value => update('business', 'natureOfBusiness', value)} /><label><span className="text-[9px] font-black uppercase text-slate-500">Registration authority *</span><select className={fieldClass} value={profile.business?.registrationAuthority || ''} onChange={event => update('business', 'registrationAuthority', event.target.value)}>{['dti','sec','cda','other'].map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label><Input required label="Registration number" value={profile.business?.registrationNumber} onChange={value => update('business', 'registrationNumber', value)} /><Input label="Registration date" type="date" value={profile.business?.registrationDate?.slice?.(0,10)} onChange={value => update('business', 'registrationDate', value)} /><Input label="Expiration date (only if printed)" type="date" value={profile.business?.registrationExpirationDate?.slice?.(0,10)} onChange={value => update('business', 'registrationExpirationDate', value)} /></div><p className="mb-2 mt-4 text-[9px] font-black uppercase text-slate-400">Registered business address</p><div className="grid gap-3 md:grid-cols-2"><Input label="Street" value={profile.business?.registeredAddress?.street} onChange={value => updateNested('business', 'registeredAddress', 'street', value)} /><Input label="Barangay" value={profile.business?.registeredAddress?.barangay} onChange={value => updateNested('business', 'registeredAddress', 'barangay', value)} /><Input label="City / municipality" value={profile.business?.registeredAddress?.city} onChange={value => updateNested('business', 'registeredAddress', 'city', value)} /><Input label="Province" value={profile.business?.registeredAddress?.province || profile.business?.registeredAddress?.state} onChange={value => updateNested('business', 'registeredAddress', 'province', value)} /><Input label="Postal code" value={profile.business?.registeredAddress?.postalCode || profile.business?.registeredAddress?.zipCode} onChange={value => updateNested('business', 'registeredAddress', 'postalCode', value)} /></div></div>
      <div><h5 className="mb-2 text-[10px] font-black uppercase text-slate-500">Owner / Authorized Representative</h5><div className="grid gap-3 md:grid-cols-2"><Input required label="Full legal name" value={profile.representative?.fullName} onChange={value => update('representative', 'fullName', value)} /><Input required label="Role / position" value={profile.representative?.role} onChange={value => update('representative', 'role', value)} /><Input required label="Phone" value={profile.representative?.phone} onChange={value => update('representative', 'phone', value)} /><Input required label="Email" type="email" value={profile.representative?.email} onChange={value => update('representative', 'email', value)} /><label className="flex h-10 items-center gap-2 self-end rounded-xl bg-slate-50 px-3 text-[10px] font-bold dark:bg-slate-800"><input type="checkbox" checked={Boolean(profile.representative?.isAuthorizedRepresentative)} onChange={event => update('representative', 'isAuthorizedRepresentative', event.target.checked)} />Acting as an authorized representative</label></div></div>
      <div><h5 className="mb-2 text-[10px] font-black uppercase text-slate-500">BIR / Tax Information</h5><div className="grid gap-3 md:grid-cols-2"><label><span className="text-[9px] font-black uppercase text-slate-500">BIR status *</span><select className={fieldClass} value={profile.tax?.birRegistrationStatus || ''} onChange={event => update('tax', 'birRegistrationStatus', event.target.value)}><option value="registered">Registered</option><option value="pending_registration">Pending registration</option><option value="not_registered">Not registered</option></select></label>{isBirRegistered && <><Input label="TIN (leave blank to retain current)" value={profile.tax?.tin || ''} placeholder={profile.tax?.tinMasked || '000-000-000'} onChange={value => update('tax', 'tin', value)} /><Input required label="Branch code" value={profile.tax?.branchCode} onChange={value => update('tax', 'branchCode', value)} /><Input required label="BIR registered name" value={profile.tax?.registeredName} onChange={value => update('tax', 'registeredName', value)} /><Input required label="Line of business" value={profile.tax?.lineOfBusiness} onChange={value => update('tax', 'lineOfBusiness', value)} /><label><span className="text-[9px] font-black uppercase text-slate-500">Declared tax status *</span><select className={fieldClass} value={profile.tax?.declaredTaxStatus || ''} onChange={event => update('tax', 'declaredTaxStatus', event.target.value)}><option value="">Select</option><option value="vat_registered">VAT Registered</option><option value="non_vat_registered">Non-VAT Registered</option></select></label></>}</div>{isBirRegistered && <><p className="mb-2 mt-4 text-[9px] font-black uppercase text-slate-400">BIR registered address</p><div className="grid gap-3 md:grid-cols-2"><Input label="Street" value={profile.tax?.registeredAddress?.street} onChange={value => updateNested('tax', 'registeredAddress', 'street', value)} /><Input label="Barangay" value={profile.tax?.registeredAddress?.barangay} onChange={value => updateNested('tax', 'registeredAddress', 'barangay', value)} /><Input label="City / municipality" value={profile.tax?.registeredAddress?.city} onChange={value => updateNested('tax', 'registeredAddress', 'city', value)} /><Input label="Province" value={profile.tax?.registeredAddress?.province} onChange={value => updateNested('tax', 'registeredAddress', 'province', value)} /><Input label="Postal code" value={profile.tax?.registeredAddress?.postalCode} onChange={value => updateNested('tax', 'registeredAddress', 'postalCode', value)} /></div></>}</div>
      <div className="space-y-2"><h5 className="text-[10px] font-black uppercase text-slate-500">Supporting Documents</h5><DocumentUpload name="businessRegistration" label="DTI / SEC / CDA Registration" required={!data.legacyDocuments?.businessRegistration && !documents.some(row => row.requirementKey === 'business_registration')} file={files.businessRegistration} metadata={metadata.businessRegistration || {}} onFile={updateFile} onMetadata={updateMetadata} />{isBirRegistered && <DocumentUpload name="birCertificate" label="BIR Certificate of Registration (Form 2303)" required={!data.legacyDocuments?.birCertificate && !documents.some(row => row.requirementKey === 'bir_certificate')} file={files.birCertificate} metadata={metadata.birCertificate || {}} onFile={updateFile} onMetadata={updateMetadata} />}{requiresAuthority && <DocumentUpload name="authorityDocument" label="Proof of Authority" required file={files.authorityDocument} metadata={metadata.authorityDocument || {}} onFile={updateFile} onMetadata={updateMetadata} />}<DocumentUpload name="mayorsPermit" label="Mayor's Permit (if applicable)" file={files.mayorsPermit} metadata={metadata.mayorsPermit || {}} onFile={updateFile} onMetadata={updateMetadata} /><DocumentUpload name="barangayClearance" label="Barangay Clearance (if applicable)" file={files.barangayClearance} metadata={metadata.barangayClearance || {}} onFile={updateFile} onMetadata={updateMetadata} /></div>
      <label className="block"><span className="text-[9px] font-black uppercase text-slate-500">Reason for update / renewal *</span><textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain what changed and which documents are being replaced." /></label>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900"><AlertTriangle size={14} className="mr-2 inline" />Submitting does not change your verified tax status. Platform Admin must review and approve the proposal.</div>
      <button disabled={saving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-black uppercase text-white hover:bg-primary-600 disabled:opacity-50">{saving ? <Clock className="animate-spin" size={14} /> : <CheckCircle size={14} />}{data.currentRequest?.status === 'needs_correction' ? 'Resubmit corrections' : 'Submit for Platform Admin review'}</button>
    </form>}
  </div>;
};

export default BusinessTaxComplianceSettings;
