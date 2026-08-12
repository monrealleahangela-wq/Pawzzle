import React from 'react';

export const SPECIALIZED_ROLES = [
  'veterinarian', 'veterinary_technician', 'veterinary_assistant',
  'veterinary_nurse', 'veterinary_laboratory_technician', 'groomer', 'trainer'
];

export const defaultAvailability = {
  monday: { available: true, start: '09:00', end: '17:00' },
  tuesday: { available: true, start: '09:00', end: '17:00' },
  wednesday: { available: true, start: '09:00', end: '17:00' },
  thursday: { available: true, start: '09:00', end: '17:00' },
  friday: { available: true, start: '09:00', end: '17:00' },
  saturday: { available: false, start: '09:00', end: '17:00' },
  sunday: { available: false, start: '09:00', end: '17:00' }
};

export const defaultProfessionalProfile = {
  staffId: '', professionalTitle: '', specialty: '', qualifications: '', certifications: '', training: '',
  areasOfExpertise: '', experienceYears: 0, registration: { type: '', number: '', issuingBody: '', expiresAt: '' },
  availability: defaultAvailability, bio: '', isPublic: true
};

const labelByRole = {
  veterinarian: 'Veterinary specialty', veterinary_technician: 'Area of practice',
  veterinary_assistant: 'Area of assistance', veterinary_nurse: 'Area of practice',
  veterinary_laboratory_technician: 'Laboratory specialty', groomer: 'Grooming specialty', trainer: 'Training specialty'
};

const serviceFitsRole = (role, service) => {
  const text = `${service.name || ''} ${service.subCategory || ''} ${service.description || ''}`.toLowerCase();
  if (role === 'groomer') return service.category === 'grooming';
  if (role === 'trainer') return service.category === 'training' || /\btraining\b/.test(text);
  if (role === 'veterinary_laboratory_technician') return service.category === 'health_wellness' && /\b(lab|laboratory|diagnostic|pathology|testing|test)\b/.test(text);
  return role.startsWith('veterinary') || role === 'veterinarian' ? service.category === 'health_wellness' : false;
};

const Field = ({ label, children }) => <label className="text-[10px] font-bold text-slate-600">{label}{children}</label>;
const inputClass = 'mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs';

export default function SpecializedStaffFields({ form, setForm, services = [] }) {
  if (!SPECIALIZED_ROLES.includes(form.staffType)) return null;
  const profile = { ...defaultProfessionalProfile, ...(form.professionalProfile || {}), registration: { ...defaultProfessionalProfile.registration, ...(form.professionalProfile?.registration || {}) }, availability: { ...defaultAvailability, ...(form.professionalProfile?.availability || {}) } };
  const updateProfile = patch => setForm(current => ({ ...current, professionalProfile: { ...profile, ...patch } }));
  const eligibleServices = services.filter(service => serviceFitsRole(form.staffType, service));
  const assigned = form.assignedServices || [];
  const toggleService = id => setForm(current => ({ ...current, assignedServices: assigned.includes(id) ? assigned.filter(value => value !== id) : [...assigned, id] }));

  return <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 space-y-4">
    <div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Professional Information</p><p className="text-[10px] text-slate-500 mt-1">Credentials are recorded as administrator-provided information and are not marked verified automatically.</p></div>
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Staff ID *"><input required value={profile.staffId || ''} onChange={event=>updateProfile({staffId:event.target.value})} className={inputClass} placeholder="VET-001"/></Field>
      <Field label="Account Status"><select value={form.staffStatus || 'active'} onChange={event=>setForm(current=>({...current,staffStatus:event.target.value}))} className={inputClass}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></Field>
      <Field label="Professional Title"><input value={profile.professionalTitle || ''} onChange={event=>updateProfile({professionalTitle:event.target.value})} className={inputClass} placeholder={form.staffType==='veterinarian'?'Doctor of Veterinary Medicine':''}/></Field>
      <Field label={`${labelByRole[form.staffType]} *`}><input required value={profile.specialty || ''} onChange={event=>updateProfile({specialty:event.target.value})} className={inputClass} placeholder="General practice"/></Field>
      <Field label="Years of Experience"><input type="number" min="0" max="80" value={profile.experienceYears || 0} onChange={event=>updateProfile({experienceYears:event.target.value})} className={inputClass}/></Field>
      <Field label="Qualifications"><input value={profile.qualifications || ''} onChange={event=>updateProfile({qualifications:event.target.value})} className={inputClass} placeholder="Comma-separated"/></Field>
      <Field label="Certifications"><input value={profile.certifications || ''} onChange={event=>updateProfile({certifications:event.target.value})} className={inputClass} placeholder="Comma-separated"/></Field>
      <Field label="Training"><input value={profile.training || ''} onChange={event=>updateProfile({training:event.target.value})} className={inputClass} placeholder="Comma-separated"/></Field>
      <Field label="Areas of Expertise"><input value={profile.areasOfExpertise || ''} onChange={event=>updateProfile({areasOfExpertise:event.target.value})} className={inputClass} placeholder="Comma-separated"/></Field>
      {form.staffType==='veterinarian'&&<>
        <Field label="Registration / License Type"><input value={profile.registration?.type || ''} onChange={event=>updateProfile({registration:{...profile.registration,type:event.target.value}})} className={inputClass}/></Field>
        <Field label="Registration / License Number"><input value={profile.registration?.number || ''} onChange={event=>updateProfile({registration:{...profile.registration,number:event.target.value}})} className={inputClass}/></Field>
        <Field label="Issuing Body"><input value={profile.registration?.issuingBody || ''} onChange={event=>updateProfile({registration:{...profile.registration,issuingBody:event.target.value}})} className={inputClass}/></Field>
        <Field label="Expiry Date"><input type="date" value={profile.registration?.expiresAt ? String(profile.registration.expiresAt).slice(0,10) : ''} onChange={event=>updateProfile({registration:{...profile.registration,expiresAt:event.target.value}})} className={inputClass}/></Field>
      </>}
    </div>

    <div><div className="flex items-center justify-between gap-2 mb-2"><p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Assigned Services *</p><span className="text-[9px] text-slate-400">From Service Management</span></div>{eligibleServices.length?<div className="grid sm:grid-cols-2 gap-2">{eligibleServices.map(service=><label key={service._id} className="flex items-center gap-2 p-2.5 rounded-xl border bg-white text-[10px] font-bold"><input type="checkbox" checked={assigned.includes(service._id)} onChange={()=>toggleService(service._id)}/><span>{service.name}</span><span className="ml-auto text-[8px] uppercase text-slate-400">{service.category.replace(/_/g,' ')}</span></label>)}</div>:<p className="p-3 rounded-xl bg-amber-50 text-amber-700 text-[10px]">No compatible active services exist. Add the service in Service Management before creating this role.</p>}</div>

    <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">Availability Schedule</p><div className="space-y-2">{Object.keys(defaultAvailability).map(day=>{const value=profile.availability?.[day] || defaultAvailability[day];return <div key={day} className="grid grid-cols-[90px_1fr_1fr] items-center gap-2"><label className="flex items-center gap-2 text-[10px] font-bold capitalize"><input type="checkbox" checked={Boolean(value.available)} onChange={event=>updateProfile({availability:{...profile.availability,[day]:{...value,available:event.target.checked}}})}/>{day}</label><input aria-label={`${day} start`} type="time" disabled={!value.available} value={value.start || '09:00'} onChange={event=>updateProfile({availability:{...profile.availability,[day]:{...value,start:event.target.value}}})} className={`${inputClass} mt-0 disabled:opacity-40`}/><input aria-label={`${day} end`} type="time" disabled={!value.available} value={value.end || '17:00'} onChange={event=>updateProfile({availability:{...profile.availability,[day]:{...value,end:event.target.value}}})} className={`${inputClass} mt-0 disabled:opacity-40`}/></div>;})}</div></div>
  </div>;
}
