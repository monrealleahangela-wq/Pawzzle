import React from 'react';

const text = value => (value === undefined || value === null || value === '' ? 'Not provided' : String(value));
const title = value => text(value).replace(/_/g, ' ');

const Detail = ({ label, value }) => (
  <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-3">
    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p>
  </div>
);

const StoreApplicationProfileDetails = ({ application, compact = false }) => {
  if (!application) return null;
  const address = application.contactInfo?.address || {};
  const registration = application.businessRegistration || {};
  const representative = application.representative || {};
  const location = [address.unitBuilding, address.street, address.barangay, address.city, address.province || address.state, address.zipCode]
    .filter(Boolean).join(', ');
  const modules = application.operationalModules?.length
    ? application.operationalModules.map(title).join(', ')
    : 'Not provided';

  return (
    <section aria-label="Saved Store Application details" className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-slate-900">Saved application details</h3>
          <p className="text-[10px] text-slate-500">Loaded from your submitted Store Application record.</p>
        </div>
        <span className="rounded-full bg-primary-50 px-3 py-1 text-[9px] font-black uppercase text-primary-700">{title(application.status)}</span>
      </div>
      <div className={`grid grid-cols-1 gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        <Detail label="Store name" value={text(application.businessName)} />
        <Detail label="Registered business" value={text(application.registeredBusinessName || registration.registeredName)} />
        <Detail label="Business classification" value={title(application.businessType)} />
        <Detail label="Business structure" value={title(application.legalStructure)} />
        <Detail label="Operations" value={modules} />
        <Detail label="Registration number" value={text(registration.certificateNumber)} />
        <Detail label="Primary phone" value={text(application.contactInfo?.phone)} />
        <Detail label="Business email" value={text(application.contactInfo?.email)} />
        <Detail label="Representative" value={text(representative.fullName)} />
        <Detail label="Representative role" value={text(representative.role)} />
        <Detail label="Store address" value={text(location)} />
        <Detail label="Tax declaration" value={title(application.taxProfile?.declaredTaxStatus || application.taxProfile?.birRegistrationStatus)} />
      </div>
      {!compact && application.businessDescription && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Business description</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{application.businessDescription}</p>
        </div>
      )}
    </section>
  );
};

export default StoreApplicationProfileDetails;
