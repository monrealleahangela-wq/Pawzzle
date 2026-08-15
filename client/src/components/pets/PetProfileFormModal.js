import React from 'react';
import { Camera, Check, FileText, HeartPulse, PawPrint, Upload } from 'lucide-react';
import { CompactFormModal, CompactFormSection, CompactUploadCard, RequiredMark, compactInputClass } from '../forms/CompactEntityForm';

const inputClass = compactInputClass;
const Required = RequiredMark;
const Section = CompactFormSection;

const documentLabel = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value.name || fallback;
  if (fallback && !/^(choose|upload|add another)/i.test(fallback)) return fallback;
  try {
    const filename = decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).pop() || '');
    return filename || fallback;
  } catch {
    return value.split('/').filter(Boolean).pop() || fallback;
  }
};

const UploadRow = ({ title, value, accept, onChange, onRemove, required = false, fallback = 'Choose a file' }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-black text-slate-700">{title}{required && <Required />}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">{documentLabel(value, fallback)}</p>
        {value && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><Check className="h-3 w-3" /> Ready</span>}
      </div>
      <div className="flex shrink-0 gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-3 text-[10px] font-black text-primary-700 hover:bg-primary-50">
          <Upload className="h-3.5 w-3.5" /> {value ? 'Replace' : 'Upload'}
          <input type="file" accept={accept} className="sr-only" onChange={onChange} />
        </label>
        {value && <button type="button" onClick={onRemove} className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-[10px] font-black text-rose-600 hover:bg-rose-50">Remove</button>}
      </div>
    </div>
  </div>
);

const PetProfileFormModal = ({
  editingPet,
  petForm,
  setPetForm,
  petPhotoPreview,
  setPetPhotoPreview,
  vaccinationPreviews,
  setVaccinationPreviews,
  breeds,
  onClose,
  onSubmit,
  loading
}) => {
  const cards = petForm.vaccinationCards || [];
  const support = petForm.supportingDocuments || [];
  const hasAge = Boolean(petForm.birthday || petForm.approximateAge?.value);
  const isVaccinated = petForm.vaccinationStatus === 'Vaccinated';
  const hasVaccinationRecord = cards.some(Boolean);
  const isComplete = Boolean(
    petForm.photo && petForm.name?.trim() && petForm.type && petForm.breed?.trim()
    && petForm.gender && hasAge && petForm.vaccinationStatus
    && (!isVaccinated || hasVaccinationRecord)
  );

  const choosePhoto = input => {
    const file = input?.target ? input.target.files?.[0] : input;
    if (!file) return;
    setPetForm(current => ({ ...current, photo: file }));
    setPetPhotoPreview(URL.createObjectURL(file));
  };

  const chooseVaccination = (event, index) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const nextCards = [...cards];
    const nextPreviews = [...vaccinationPreviews];
    nextCards[index] = file;
    nextPreviews[index] = URL.createObjectURL(file);
    setPetForm(current => ({ ...current, vaccinationCards: nextCards }));
    setVaccinationPreviews(nextPreviews);
  };

  const removeVaccination = index => {
    const nextCards = [...cards];
    const nextPreviews = [...vaccinationPreviews];
    nextCards[index] = null;
    nextPreviews[index] = null;
    setPetForm(current => ({ ...current, vaccinationCards: nextCards }));
    setVaccinationPreviews(nextPreviews);
  };

  const choosePcci = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPetForm(current => ({
      ...current,
      pcciRegistration: {
        ...current.pcciRegistration,
        status: 'yes',
        certificateUrl: file,
        informationStatus: 'customer_provided'
      }
    }));
  };

  const removePcci = () => setPetForm(current => ({
    ...current,
    pcciRegistration: {
      ...current.pcciRegistration,
      status: 'not_sure',
      certificateUrl: '',
      informationStatus: 'not_provided'
    }
  }));

  const addSupportingDocuments = event => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setPetForm(current => ({
      ...current,
      supportingDocuments: [
        ...(current.supportingDocuments || []),
        ...files.map(file => ({ file, name: file.name, url: '' }))
      ]
    }));
    event.target.value = '';
  };

  const removeSupportingDocument = index => setPetForm(current => ({
    ...current,
    supportingDocuments: (current.supportingDocuments || []).filter((_, itemIndex) => itemIndex !== index)
  }));

  const setType = type => setPetForm(current => ({
    ...current,
    type,
    breed: '',
    ...(type === 'Dog' ? {} : {
      pcciRegistration: { status: 'not_sure', registrationNumber: '', registeredName: '', certificateUrl: '', microchipNumber: '', informationStatus: 'not_provided' }
    })
  }));

  return (
    <CompactFormModal
      title={editingPet ? 'Edit Pet' : 'Add Pet'}
      subtitle="Required fields are marked with *"
      icon={PawPrint}
      formId="compactPetForm"
      onClose={onClose}
      onSubmit={onSubmit}
      saveDisabled={!isComplete}
      loading={loading}
      saveLabel={editingPet ? 'Save Changes' : 'Save Pet'}
    >
          <Section step="1" icon={Camera} title="Pet Photo" description="Use a clear, recent photo of your pet.">
            <CompactUploadCard title="Pet Photo" required roundPreview value={petForm.photo} preview={petPhotoPreview} onFiles={files => choosePhoto(files[0])} helper="Choose a clear pet photo" />
            {!petForm.photo && <p className="mt-2 text-[11px] font-semibold text-rose-600">Pet photo is required.</p>}
          </Section>

          <Section step="2" icon={PawPrint} title="Basic Information" description="Tell us the essentials used for pet care and identification.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-bold text-slate-700">Pet Name<Required /><input value={petForm.name} onChange={event => setPetForm(current => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="Pet name" /></label>
              <label className="text-[11px] font-bold text-slate-700">Species<Required /><select value={petForm.type} onChange={event => setType(event.target.value)} className={inputClass}><option value="Dog">Dog</option><option value="Cat">Cat</option><option value="Other">Other</option></select></label>
              <label className="text-[11px] font-bold text-slate-700">Breed<Required /><input list="pet-breed-options" value={petForm.breed} onChange={event => setPetForm(current => ({ ...current, breed: event.target.value }))} className={inputClass} placeholder="Breed or best description" /><datalist id="pet-breed-options">{breeds.map(breed => <option key={breed} value={breed} />)}</datalist></label>
              <div><p className="text-[11px] font-bold text-slate-700">Sex<Required /></p><div className="mt-1 grid h-10 grid-cols-2 rounded-xl bg-slate-100 p-1">{['Male', 'Female'].map(value => <button key={value} type="button" onClick={() => setPetForm(current => ({ ...current, gender: value }))} className={`rounded-lg text-[11px] font-black ${petForm.gender === value ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'}`}>{value}</button>)}</div></div>
              <label className="text-[11px] font-bold text-slate-700">Birth Date<Required /><input type="date" max={new Date().toISOString().split('T')[0]} value={petForm.birthday} onChange={event => setPetForm(current => ({ ...current, birthday: event.target.value }))} className={inputClass} /></label>
              <label className="text-[11px] font-bold text-slate-700">Estimated Age <span className="font-normal text-slate-400">(if birth date is unknown)</span><div className="mt-1 flex gap-2"><input type="number" min="0" value={petForm.approximateAge?.value || ''} onChange={event => setPetForm(current => ({ ...current, approximateAge: { ...current.approximateAge, value: event.target.value } }))} className={`${inputClass} mt-0`} placeholder="Age" /><select value={petForm.approximateAge?.unit || 'years'} onChange={event => setPetForm(current => ({ ...current, approximateAge: { ...current.approximateAge, unit: event.target.value } }))} className={`${inputClass} mt-0 w-28`}><option value="months">Months</option><option value="years">Years</option></select></div></label>
              {!hasAge && <p className="text-[11px] font-semibold text-rose-600 sm:col-span-2">Enter either a birth date or an estimated age.</p>}
              <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Color / Markings <span className="font-normal text-slate-400">(optional)</span><input value={petForm.color || ''} onChange={event => setPetForm(current => ({ ...current, color: event.target.value }))} className={inputClass} placeholder="e.g. Brown with white paws" /></label>
            </div>
          </Section>

          <Section step="3" icon={HeartPulse} title="Health Information" description="Only the vaccination status is required.">
            <p className="text-[11px] font-bold text-slate-700">Vaccination Status<Required /></p>
            <div className="mt-1 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              {['Vaccinated', 'Not Yet Vaccinated'].map(value => <button key={value} type="button" onClick={() => { setPetForm(current => ({ ...current, vaccinationStatus: value, ...(value === 'Vaccinated' ? {} : { vaccinationCards: [null, null] }) })); if (value !== 'Vaccinated') setVaccinationPreviews([null, null]); }} className={`min-h-9 rounded-lg px-2 text-[10px] font-black ${petForm.vaccinationStatus === value ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'}`}>{value}</button>)}
            </div>
            {isVaccinated && <div className="mt-3 space-y-2">{[0, 1].map(index => <UploadRow key={index} title={`Vaccination Record ${index + 1}${index === 1 ? ' (optional)' : ''}`} required={index === 0} value={cards[index]} accept="image/*" onChange={event => chooseVaccination(event, index)} onRemove={() => removeVaccination(index)} fallback={index === 0 ? 'Upload a clear vaccination record' : 'Add another vaccination record'} />)}{!hasVaccinationRecord && <p className="text-[11px] font-semibold text-rose-600">A vaccination record is required when Vaccinated is selected.</p>}</div>}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-bold text-slate-700">Weight <span className="font-normal text-slate-400">(optional)</span><div className="mt-1 flex gap-2"><input type="number" min="0" max="200" value={petForm.weight ?? ''} onChange={event => setPetForm(current => ({ ...current, weight: event.target.value }))} className={`${inputClass} mt-0`} /><select value={petForm.weightUnit || 'kg'} onChange={event => setPetForm(current => ({ ...current, weightUnit: event.target.value }))} className={`${inputClass} mt-0 w-20`}><option value="kg">kg</option><option value="lb">lb</option></select></div></label>
              <label className="text-[11px] font-bold text-slate-700">Allergies <span className="font-normal text-slate-400">(optional)</span><input value={petForm.allergies || ''} onChange={event => setPetForm(current => ({ ...current, allergies: event.target.value }))} className={inputClass} placeholder="None known" /></label>
              <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Medical Notes <span className="font-normal text-slate-400">(optional)</span><textarea rows="3" value={petForm.medicalConditions || ''} onChange={event => setPetForm(current => ({ ...current, medicalConditions: event.target.value }))} className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10" placeholder="Conditions, medication, or handling notes" /></label>
            </div>
          </Section>

          <Section step="4" icon={FileText} title="Ownership Documents" description="All documents in this section are optional.">
            <div className="space-y-2">
              {petForm.type === 'Dog' && <UploadRow title="PCCI Registration Document (Philippine Canine Club Inc.)" value={petForm.pcciRegistration?.certificateUrl} accept="image/*,.pdf,.doc,.docx" onChange={choosePcci} onRemove={removePcci} fallback="Upload PCCI certificate" />}
              {support.map((document, index) => <UploadRow key={`${document.url || document.name}-${index}`} title={`Supporting Document ${index + 1}`} value={document.file || document.url} accept="image/*,.pdf,.doc,.docx" onChange={event => { const file = event.target.files?.[0]; if (!file) return; setPetForm(current => ({ ...current, supportingDocuments: current.supportingDocuments.map((item, itemIndex) => itemIndex === index ? { file, name: file.name, url: '' } : item) })); }} onRemove={() => removeSupportingDocument(index)} fallback={document.name || 'Supporting document'} />)}
              <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-[11px] font-black text-slate-600 hover:border-primary-300 hover:bg-primary-50"><Upload className="h-4 w-4" /> Add Supporting Documents<input type="file" multiple accept="image/*,.pdf,.doc,.docx" className="sr-only" onChange={addSupportingDocuments} /></label>
              {petForm.type !== 'Dog' && <p className="text-[10px] text-slate-500">PCCI registration applies to dogs only.</p>}
            </div>
          </Section>
    </CompactFormModal>
  );
};

export default PetProfileFormModal;
