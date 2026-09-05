import React from 'react';
import { CalendarDays, Camera, Check, FileBadge, HeartPulse, PawPrint, Upload } from 'lucide-react';
import {
  CompactFormModal,
  CompactFormSection,
  CompactUploadCard,
  RequiredMark,
  compactInputClass,
  compactTextareaClass
} from '../forms/CompactEntityForm';
import { getImageUrl } from '../../services/apiService';

const filenameFromUrl = (value, fallback = 'Uploaded document') => {
  if (!value) return fallback;
  if (typeof value === 'object') return value.name || fallback;
  try {
    return decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).pop() || '') || fallback;
  } catch {
    return String(value).split('/').filter(Boolean).pop() || fallback;
  }
};

const PetListingFormModal = ({
  editingPet,
  petForm,
  setPetForm,
  loading,
  onClose,
  onSubmit,
  onImageUpload,
  onDocumentUpload,
  onAdvanced
}) => {
  const hasBirthDate = Boolean(petForm.birthday)
    || Boolean(editingPet && (Number(petForm.ageYears) >= 0 || Number(petForm.ageMonths) >= 0));
  const isLegacyAdoptionEdit = editingPet?.listingType === 'adoption';
  const hasPrice = petForm.price !== '' && (isLegacyAdoptionEdit ? Number(petForm.price) >= 0 : Number(petForm.price) > 0);
  const vaccinationRecordRequired = ['complete', 'partial'].includes(petForm.vaccinationStatus);
  const hasVaccinationRecord = Boolean(petForm.vetRecords?.[0]);
  const descriptionValid = Boolean(petForm.description?.trim().length >= 50);
  const isComplete = Boolean(
    petForm.images?.[0] && petForm.name?.trim() && petForm.species && petForm.breed?.trim()
    && petForm.gender && hasBirthDate && hasPrice && descriptionValid
    && (!vaccinationRecordRequired || hasVaccinationRecord)
  );
  const pcci = petForm.pcciRegistration || {};
  const supportingDocuments = petForm.supportingDocuments || [];
  const availabilityLocked = Boolean(editingPet && (
    ['sold', 'adopted'].includes(editingPet.status)
    || (editingPet.status === 'reserved' && (editingPet.reservation?.order || editingPet.reservation?.adoptionRequest))
  ));

  const update = (field, value) => setPetForm(current => ({ ...current, [field]: value }));
  const updateBirthDate = value => {
    if (!value) return setPetForm(current => ({ ...current, birthday: '', ageYears: '', ageMonths: '' }));
    const birthday = new Date(`${value}T00:00:00`);
    const today = new Date();
    let totalMonths = (today.getFullYear() - birthday.getFullYear()) * 12 + today.getMonth() - birthday.getMonth();
    if (today.getDate() < birthday.getDate()) totalMonths -= 1;
    totalMonths = Math.max(0, totalMonths);
    setPetForm(current => ({
      ...current,
      birthday: value,
      ageYears: Math.floor(totalMonths / 12),
      ageMonths: totalMonths % 12
    }));
  };
  const updatePcci = (field, value) => setPetForm(current => ({
    ...current,
    pedigreePapers: field === 'certificateUrl' ? Boolean(value) : current.pedigreePapers,
    pcciRegistration: {
      ...current.pcciRegistration,
      [field]: value,
      ...(field === 'certificateUrl' ? {
        status: value ? 'yes' : 'not_sure',
        informationStatus: value ? 'customer_provided' : 'not_provided'
      } : {})
    }
  }));

  return (
    <CompactFormModal
      title={editingPet ? 'Edit Pet Listing' : 'Add Pet for Sale'}
      subtitle="Create one sale listing for one individual pet. Required fields are marked with *."
      icon={PawPrint}
      formId="compactPetListingForm"
      onClose={onClose}
      onSubmit={onSubmit}
      saveDisabled={!isComplete}
      loading={loading}
      saveLabel={editingPet ? 'Save Changes' : 'Publish Listing'}
      secondaryAction={<button type="button" onClick={onAdvanced} className="h-9 rounded-xl border border-slate-200 px-3 text-[10px] font-black text-slate-600 hover:bg-slate-50">Advanced options</button>}
    >
      <CompactFormSection step="1" icon={Camera} title="Pet Photo" description="Use a clear primary marketplace photo.">
        <CompactUploadCard
          title="Pet Photo"
          required
          value={petForm.images?.[0]}
          preview={petForm.images?.[0] ? getImageUrl(petForm.images[0]) : ''}
          loading={loading}
          onFiles={files => onImageUpload(files, true)}
          onRemove={() => update('images', (petForm.images || []).slice(1))}
          helper="Choose an image or drop it here"
        />
        {!petForm.images?.[0] && <p className="mt-2 text-[11px] font-semibold text-rose-600">Pet photo is required.</p>}
      </CompactFormSection>

      <CompactFormSection step="2" icon={PawPrint} title="Basic Information" description="The individual pet details customers see in the marketplace.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Pet Name<RequiredMark /><input className={compactInputClass} value={petForm.name} onChange={event => update('name', event.target.value)} placeholder="Pet name" /></label>
          <label className="text-[11px] font-bold text-slate-700">Species<RequiredMark /><select className={compactInputClass} value={petForm.species} onChange={event => setPetForm(current => ({ ...current, species: event.target.value, ...(event.target.value === 'dog' ? {} : { pedigreePapers: false, pcciRegistration: { status: 'not_sure', registrationNumber: '', certificateUrl: '', informationStatus: 'not_provided' } }) }))}><option value="dog">Dog</option><option value="cat">Cat</option><option value="bird">Bird</option><option value="rabbit">Rabbit</option><option value="hamster">Hamster</option><option value="fish">Fish</option><option value="reptile">Reptile</option><option value="other">Other</option></select></label>
          <label className="text-[11px] font-bold text-slate-700">Breed<RequiredMark /><input className={compactInputClass} value={petForm.breed} onChange={event => update('breed', event.target.value)} placeholder="Breed or best description" /></label>
          <div><p className="text-[11px] font-bold text-slate-700">Sex<RequiredMark /></p><div className="mt-1 grid h-10 grid-cols-2 rounded-xl bg-slate-100 p-1">{['male', 'female'].map(value => <button key={value} type="button" onClick={() => update('gender', value)} className={`rounded-lg text-[11px] font-black capitalize ${petForm.gender === value ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'}`}>{value}</button>)}</div></div>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Birth Date<RequiredMark /><span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-400" /><input type="date" max={new Date().toISOString().slice(0, 10)} className={`${compactInputClass} pl-10`} value={petForm.birthday || ''} onChange={event => updateBirthDate(event.target.value)} /></span>{petForm.birthday && <span className="mt-1 block text-[10px] text-slate-500">Calculated age: {Number(petForm.ageYears) || 0} year(s), {Number(petForm.ageMonths) || 0} month(s).</span>}{!hasBirthDate && <span className="mt-1 block text-[10px] font-semibold text-rose-600">Birth date is required so Pawzzle can calculate age.</span>}{editingPet && !petForm.birthday && <span className="mt-1 block text-[10px] text-amber-700">This legacy listing has no birth date. Add one when it is known; its saved age remains compatible.</span>}</label>
          <label className="text-[11px] font-bold text-slate-700">{isLegacyAdoptionEdit ? 'Legacy Listing Fee' : 'Selling Price'}<RequiredMark /><input type="number" min={isLegacyAdoptionEdit ? '0' : '0.01'} step="0.01" className={compactInputClass} value={petForm.price} onChange={event => update('price', event.target.value)} placeholder="0.00" />{!hasPrice && <span className="mt-1 block text-[10px] font-semibold text-rose-600">{isLegacyAdoptionEdit ? 'Enter zero or a positive legacy fee.' : 'Selling price must be greater than zero.'}</span>}</label>
          <label className="text-[11px] font-bold text-slate-700">Availability<RequiredMark /><select disabled={availabilityLocked} className={compactInputClass} value={petForm.status} onChange={event => update('status', event.target.value)}><option value="available">Available</option><option value="unavailable">Unavailable</option>{editingPet && petForm.status === 'reserved' && <option value="reserved">Reserved</option>}{editingPet && petForm.status === 'sold' && <option value="sold">Sold</option>}{editingPet && petForm.status === 'adopted' && <option value="adopted">Adopted (legacy)</option>}</select><span className="mt-1 block text-[10px] font-normal text-slate-400">{availabilityLocked ? 'This status is controlled by its active or completed transaction.' : 'Only available pets can be purchased.'}</span></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Description<RequiredMark /><textarea rows="4" className={compactTextareaClass} value={petForm.description} onChange={event => update('description', event.target.value)} placeholder="Describe the pet, care needs, history, and ideal home." /><span className={`mt-1 block text-[10px] ${descriptionValid ? 'text-slate-400' : 'font-semibold text-rose-600'}`}>{petForm.description?.length || 0}/50 minimum characters</span></label>
        </div>
      </CompactFormSection>

      <CompactFormSection step="3" icon={HeartPulse} title="Health & Personality" description="Share only customer-safe listing information.">
        <p className="text-[11px] font-bold text-slate-700">Vaccination Status</p>
        <div className="mt-1 grid grid-cols-3 rounded-xl bg-slate-100 p-1">{[['complete', 'Vaccinated'], ['partial', 'Partial'], ['none', 'Not Yet']].map(([value, label]) => <button key={value} type="button" onClick={() => update('vaccinationStatus', value)} className={`min-h-9 rounded-lg px-1 text-[9px] font-black ${petForm.vaccinationStatus === value ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>
        {vaccinationRecordRequired && <div className="mt-3"><CompactUploadCard title="Vaccination Record" required value={petForm.vetRecords?.[0]} loading={loading} accept="image/*,.pdf" onFiles={files => onDocumentUpload(files, 'vaccination')} onRemove={() => update('vetRecords', [])} helper="Upload a vaccination record" />{!hasVaccinationRecord && <p className="mt-1 text-[10px] font-semibold text-rose-600">A record is required for this vaccination status.</p>}</div>}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Temperament <span className="font-normal text-slate-400">(optional)</span><input className={compactInputClass} value={petForm.temperament || ''} onChange={event => update('temperament', event.target.value)} placeholder="Friendly, playful, calm" /></label>
          <label className="text-[11px] font-bold text-slate-700">Dewormed <span className="font-normal text-slate-400">(optional)</span><select className={compactInputClass} value={petForm.dewormed ? 'yes' : 'no'} onChange={event => update('dewormed', event.target.value === 'yes')}><option value="no">No / Not specified</option><option value="yes">Yes</option></select></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Health Notes <span className="font-normal text-slate-400">(optional, customer-visible)</span><textarea rows="3" className={compactTextareaClass} value={petForm.healthNotes || ''} onChange={event => update('healthNotes', event.target.value)} placeholder="Disclose relevant health information for prospective owners." /></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Availability Notes <span className="font-normal text-slate-400">(optional)</span><textarea rows="2" className={compactTextareaClass} value={petForm.availabilityNotes || ''} onChange={event => update('availabilityNotes', event.target.value)} placeholder="Viewing schedule or availability details" /></label>
        </div>
      </CompactFormSection>

      <CompactFormSection step="4" icon={FileBadge} title="Listing Documents" description="PCCI applies to dogs only. Uploaded files remain private.">
        {petForm.species === 'dog' && <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <label className="text-[11px] font-bold text-slate-700">PCCI Registration Number <span className="font-normal text-slate-400">(optional)</span><input maxLength="100" className={compactInputClass} value={pcci.registrationNumber || ''} onChange={event => updatePcci('registrationNumber', event.target.value)} placeholder="Exactly as shown on the certificate" /></label>
          <CompactUploadCard title="PCCI Registration Document" value={pcci.certificateUrl} loading={loading} accept="image/*,.pdf,.doc,.docx" onFiles={files => onDocumentUpload(files, 'pcci')} onRemove={() => updatePcci('certificateUrl', '')} helper="Optional PCCI certificate" />
          {pcci.certificateUrl && <p className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800"><Check className="h-3 w-3" /> Registration information provided; not independently verified by Pawzzle.</p>}
        </div>}

        <div className="mt-3 space-y-2">
          {supportingDocuments.map((document, index) => <div key={`${document.url}-${index}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-700">{document.name || filenameFromUrl(document.url)}</p><p className="text-[9px] font-bold text-emerald-700">Uploaded</p></div><div className="flex gap-2"><label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-primary-200 bg-white px-3 text-[10px] font-black text-primary-700"><Upload className="h-3 w-3" /> Replace<input type="file" className="sr-only" accept="image/*,.pdf,.doc,.docx" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) onDocumentUpload(files, 'supporting', index); event.target.value = ''; }} /></label><button type="button" onClick={() => update('supportingDocuments', supportingDocuments.filter((_, itemIndex) => itemIndex !== index))} className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-[10px] font-black text-rose-600">Remove</button></div></div>)}
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-[11px] font-black text-slate-600 hover:bg-primary-50"><Upload className="h-4 w-4" /> Add Supporting Documents<input type="file" multiple className="sr-only" accept="image/*,.pdf,.doc,.docx" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) onDocumentUpload(files, 'supporting'); event.target.value = ''; }} /></label>
        </div>
      </CompactFormSection>
    </CompactFormModal>
  );
};

export default PetListingFormModal;
