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

const TEMPERAMENT_OPTIONS = [
  ['calm', 'Calm & quiet'],
  ['energetic', 'Playful & energetic'],
  ['affectionate', 'Affectionate'],
  ['independent', 'Independent'],
  ['social', 'Social'],
  ['outdoor', 'Outdoor-oriented'],
  ['interactive', 'Interactive']
];
const LEVEL_OPTIONS = [['unknown', 'Not known'], ['low', 'Low'], ['moderate', 'Moderate'], ['high', 'High']];
const COMPATIBILITY_OPTIONS = [['unknown', 'Not known'], ['compatible', 'Compatible'], ['not_compatible', 'Not compatible']];

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
  onDocumentUpload
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
    && petForm.gender && petForm.size && petForm.activityLevel && petForm.temperamentTraits?.length
    && hasBirthDate && hasPrice && descriptionValid
    && (!vaccinationRecordRequired || hasVaccinationRecord)
  );
  const pcci = petForm.pcciRegistration || {};
  const supportingDocuments = petForm.supportingDocuments || [];
  const availabilityLocked = Boolean(editingPet && (
    ['sold', 'adopted'].includes(editingPet.status)
    || (editingPet.status === 'reserved' && (editingPet.reservation?.order || editingPet.reservation?.adoptionRequest))
  ));

  const update = (field, value) => setPetForm(current => ({ ...current, [field]: value }));
  const updateNested = (group, field, value) => setPetForm(current => ({
    ...current,
    [group]: { ...current[group], [field]: value }
  }));
  const toggleTemperament = value => setPetForm(current => ({
    ...current,
    temperamentTraits: current.temperamentTraits?.includes(value)
      ? current.temperamentTraits.filter(item => item !== value)
      : [...(current.temperamentTraits || []), value]
  }));
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
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(petForm.images || []).slice(1).map((image, index) => <div key={`${image}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={getImageUrl(image)} alt={`Pet ${index + 2}`} className="h-full w-full object-cover" /><button type="button" onClick={() => update('images', petForm.images.filter((_, itemIndex) => itemIndex !== index + 1))} className="absolute inset-x-1 bottom-1 rounded-lg bg-slate-950/75 py-1 text-[8px] font-black text-white opacity-0 transition group-hover:opacity-100">Remove</button></div>)}
          {(petForm.images || []).length < 10 && <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-[9px] font-black text-slate-500 hover:bg-primary-50"><Upload className="mb-1 h-4 w-4" />Add photos<input type="file" multiple accept="image/*" className="sr-only" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) onImageUpload(files, false); event.target.value = ''; }} /></label>}
        </div>
      </CompactFormSection>

      <CompactFormSection step="2" icon={PawPrint} title="Basic Information" description="The individual pet details customers see in the marketplace.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Pet Name<RequiredMark /><input className={compactInputClass} value={petForm.name} onChange={event => update('name', event.target.value)} placeholder="Pet name" /></label>
          <label className="text-[11px] font-bold text-slate-700">Species<RequiredMark /><select className={compactInputClass} value={petForm.species} onChange={event => setPetForm(current => ({ ...current, species: event.target.value, ...(event.target.value === 'dog' ? {} : { pedigreePapers: false, pcciRegistration: { status: 'not_sure', registrationNumber: '', certificateUrl: '', informationStatus: 'not_provided' } }) }))}><option value="dog">Dog</option><option value="cat">Cat</option><option value="bird">Bird</option><option value="rabbit">Rabbit</option><option value="hamster">Hamster</option><option value="fish">Fish</option><option value="reptile">Reptile</option><option value="other">Other</option></select></label>
          <label className="text-[11px] font-bold text-slate-700">Breed<RequiredMark /><input className={compactInputClass} value={petForm.breed} onChange={event => update('breed', event.target.value)} placeholder="Breed or best description" /></label>
          <label className="text-[11px] font-bold text-slate-700">Adult / Expected Size<RequiredMark /><select className={compactInputClass} value={petForm.size || ''} onChange={event => update('size', event.target.value)}><option value="">Select size</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="extra_large">Extra large</option></select><span className="mt-1 block text-[10px] font-normal text-slate-400">Used with recorded activity—not breed assumptions—for space matching.</span></label>
          <label className="text-[11px] font-bold text-slate-700">Activity Level<RequiredMark /><select className={compactInputClass} value={petForm.activityLevel || ''} onChange={event => update('activityLevel', event.target.value)}><option value="">Select activity level</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select><span className="mt-1 block text-[10px] font-normal text-slate-400">Choose from this pet’s observed behavior.</span></label>
          <div><p className="text-[11px] font-bold text-slate-700">Sex<RequiredMark /></p><div className="mt-1 grid h-10 grid-cols-2 rounded-xl bg-slate-100 p-1">{['male', 'female'].map(value => <button key={value} type="button" onClick={() => update('gender', value)} className={`rounded-lg text-[11px] font-black capitalize ${petForm.gender === value ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'}`}>{value}</button>)}</div></div>
          <label className="text-[11px] font-bold text-slate-700">Weight <span className="font-normal text-slate-400">(optional, kg)</span><input type="number" min="0" step="0.01" className={compactInputClass} value={petForm.weight || ''} onChange={event => update('weight', event.target.value)} placeholder="e.g. 4.5" /></label>
          <label className="text-[11px] font-bold text-slate-700">Color / Markings <span className="font-normal text-slate-400">(optional)</span><input className={compactInputClass} value={petForm.color || ''} onChange={event => update('color', event.target.value)} placeholder="Observed color or markings" /></label>
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
        <div className="mt-4">
          <p className="text-[11px] font-bold text-slate-700">Observed Temperament<RequiredMark /></p>
          <p className="mt-1 text-[10px] text-slate-400">Select only traits observed for this individual pet. Pawzzle does not infer temperament from breed.</p>
          <div className="mt-2 flex flex-wrap gap-2">{TEMPERAMENT_OPTIONS.map(([value, label]) => <button key={value} type="button" onClick={() => toggleTemperament(value)} className={`min-h-9 rounded-xl border px-3 text-[10px] font-black transition ${petForm.temperamentTraits?.includes(value) ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-500 hover:border-primary-200'}`}>{label}</button>)}</div>
          {!petForm.temperamentTraits?.length && <p className="mt-2 text-[10px] font-semibold text-rose-600">Select at least one observed temperament trait.</p>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Temperament Notes <span className="font-normal text-slate-400">(optional)</span><input maxLength="500" className={compactInputClass} value={petForm.temperament || ''} onChange={event => update('temperament', event.target.value)} placeholder="Additional observations that do not fit the choices above" /></label>
          <label className="text-[11px] font-bold text-slate-700">Dewormed <span className="font-normal text-slate-400">(optional)</span><select className={compactInputClass} value={petForm.dewormed ? 'yes' : 'no'} onChange={event => update('dewormed', event.target.value === 'yes')}><option value="no">No / Not specified</option><option value="yes">Yes</option></select></label>
          <label className="text-[11px] font-bold text-slate-700">Spayed / Neutered <span className="font-normal text-slate-400">(optional)</span><select className={compactInputClass} value={petForm.spayedNeutered ? 'yes' : 'no'} onChange={event => update('spayedNeutered', event.target.value === 'yes')}><option value="no">No / Not specified</option><option value="yes">Yes</option></select></label>
          <label className="text-[11px] font-bold text-slate-700">Current Health Condition<select className={compactInputClass} value={petForm.healthCondition || 'healthy'} onChange={event => update('healthCondition', event.target.value)}><option value="healthy">Healthy / no disclosed condition</option><option value="needs_monitoring">Needs monitoring</option><option value="condition_present">Condition present</option></select></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Health Notes <span className="font-normal text-slate-400">(optional, customer-visible)</span><textarea rows="3" className={compactTextareaClass} value={petForm.healthNotes || ''} onChange={event => update('healthNotes', event.target.value)} placeholder="Disclose relevant health information for prospective owners." /></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Availability Notes <span className="font-normal text-slate-400">(optional)</span><textarea rows="2" className={compactTextareaClass} value={petForm.availabilityNotes || ''} onChange={event => update('availabilityNotes', event.target.value)} placeholder="Viewing schedule or availability details" /></label>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-black text-slate-700">Care Needs</p>
          <p className="mt-1 text-[10px] text-slate-400">Use “Not known” rather than guessing. Unknown values are not scored by the DSS.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">{[['maintenance', 'Overall Maintenance'], ['grooming', 'Grooming Needs'], ['training', 'Training Needs']].map(([field, label]) => <label key={field} className="text-[10px] font-bold text-slate-600">{label}<select className={compactInputClass} value={petForm.careNeeds?.[field] || 'unknown'} onChange={event => updateNested('careNeeds', field, event.target.value)}>{LEVEL_OPTIONS.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}</select></label>)}</div>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-black text-slate-700">Compatibility With Existing Pets</p>
          <p className="mt-1 text-[10px] text-slate-400">Record only known interaction evidence for this individual pet.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">{[['dogs', 'Dogs'], ['cats', 'Cats'], ['otherPets', 'Other Pets']].map(([field, label]) => <label key={field} className="text-[10px] font-bold text-slate-600">{label}<select className={compactInputClass} value={petForm.petCompatibility?.[field] || 'unknown'} onChange={event => updateNested('petCompatibility', field, event.target.value)}>{COMPATIBILITY_OPTIONS.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}</select></label>)}</div>
        </div>
      </CompactFormSection>

      <CompactFormSection step="4" icon={Check} title="Sale & Pickup" description="Keep transaction and pickup details with the core listing.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Price Negotiable?<select className={compactInputClass} value={petForm.isNegotiable ? 'yes' : 'no'} onChange={event => update('isNegotiable', event.target.value === 'yes')}><option value="no">No</option><option value="yes">Yes</option></select></label>
          <label className="text-[11px] font-bold text-slate-700">Payment Strategy<select className={compactInputClass} value={petForm.paymentConfig || 'full_payment'} onChange={event => update('paymentConfig', event.target.value)}><option value="full_payment">Full PayMongo payment</option><option value="deposit_first">Reservation deposit, then balance</option></select></label>
          {petForm.paymentConfig === 'deposit_first' && <label className="text-[11px] font-bold text-slate-700">Deposit Amount<input type="number" min="0.01" max={Number(petForm.price) || undefined} step="0.01" className={compactInputClass} value={petForm.depositAmount || ''} onChange={event => update('depositAmount', event.target.value)} placeholder="0.00" /></label>}
          <label className="text-[11px] font-bold text-slate-700">Pickup Availability<select className={compactInputClass} value={petForm.pickupAvailability || 'scheduled'} onChange={event => update('pickupAvailability', event.target.value)}><option value="scheduled">By appointment</option><option value="same_day">Same-day pickup</option><option value="next_day">Next-day pickup</option></select></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Pickup Instructions <span className="font-normal text-slate-400">(private until appropriate)</span><textarea rows="2" className={compactTextareaClass} value={petForm.pickupInstructions || ''} onChange={event => update('pickupInstructions', event.target.value)} placeholder="Schedule, entrance, carrier, or handover instructions" /></label>
        </div>
      </CompactFormSection>

      <CompactFormSection step="5" icon={FileBadge} title="Listing Documents" description="PCCI applies to dogs only. Uploaded files remain private.">
        {petForm.species === 'dog' && <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <label className="text-[11px] font-bold text-slate-700">PCCI Registration Number <span className="font-normal text-slate-400">(optional)</span><input maxLength="100" className={compactInputClass} value={pcci.registrationNumber || ''} onChange={event => updatePcci('registrationNumber', event.target.value)} placeholder="Exactly as shown on the certificate" /></label>
          <CompactUploadCard title="PCCI Registration Document" value={pcci.certificateUrl} loading={loading} accept="image/*,.pdf,.doc,.docx" onFiles={files => onDocumentUpload(files, 'pcci')} onRemove={() => updatePcci('certificateUrl', '')} helper="Optional PCCI certificate" />
          {pcci.certificateUrl && <p className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800"><Check className="h-3 w-3" /> Registration information provided; not independently verified by Pawzzle.</p>}
        </div>}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CompactUploadCard title="Selling Permit" value={petForm.permits?.[0]} loading={loading} accept="image/*,.pdf,.doc,.docx" onFiles={files => onDocumentUpload(files, 'permit')} onRemove={() => update('permits', [])} helper="Optional permit or breeder document" />
          <CompactUploadCard title="Proof of Ownership" value={petForm.proofOfOwnership?.[0]} loading={loading} accept="image/*,.pdf,.doc,.docx" onFiles={files => onDocumentUpload(files, 'ownership')} onRemove={() => update('proofOfOwnership', [])} helper="Optional ownership document" />
        </div>

        <div className="mt-3 space-y-2">
          {supportingDocuments.map((document, index) => <div key={`${document.url}-${index}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-700">{document.name || filenameFromUrl(document.url)}</p><p className="text-[9px] font-bold text-emerald-700">Uploaded</p></div><div className="flex gap-2"><label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-primary-200 bg-white px-3 text-[10px] font-black text-primary-700"><Upload className="h-3 w-3" /> Replace<input type="file" className="sr-only" accept="image/*,.pdf,.doc,.docx" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) onDocumentUpload(files, 'supporting', index); event.target.value = ''; }} /></label><button type="button" onClick={() => update('supportingDocuments', supportingDocuments.filter((_, itemIndex) => itemIndex !== index))} className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-[10px] font-black text-rose-600">Remove</button></div></div>)}
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-[11px] font-black text-slate-600 hover:bg-primary-50"><Upload className="h-4 w-4" /> Add Supporting Documents<input type="file" multiple className="sr-only" accept="image/*,.pdf,.doc,.docx" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) onDocumentUpload(files, 'supporting'); event.target.value = ''; }} /></label>
        </div>
      </CompactFormSection>
    </CompactFormModal>
  );
};

export default PetListingFormModal;
