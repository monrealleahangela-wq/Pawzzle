import React from 'react';
import { Calendar, Clock, Image as ImageIcon, Info, Scissors, SlidersHorizontal, Users } from 'lucide-react';
import { getImageUrl } from '../../services/apiService';
import {
  CompactFormModal,
  CompactFormSection,
  CompactToggle,
  CompactUploadCard,
  RequiredMark,
  compactInputClass,
  compactTextareaClass
} from './CompactEntityForm';

const roleByCategory = {
  grooming: ['groomer'],
  health_wellness: ['veterinarian', 'veterinary_technician', 'veterinary_assistant'],
  training: ['trainer'],
  boarding_hotel: ['boarding_staff'],
  pet_services: ['service_staff'],
  home_services: ['veterinarian', 'groomer', 'trainer', 'boarding_staff', 'service_staff'],
  other: ['service_staff']
};

const roleLabel = role => ({
  veterinarian: 'Veterinarian',
  veterinary_technician: 'Veterinary Technician',
  veterinary_assistant: 'Veterinary Assistant',
  groomer: 'Groomer',
  trainer: 'Trainer',
  boarding_staff: 'Boarding Staff',
  service_staff: 'Service Staff'
}[role] || role?.replaceAll('_', ' '));

const staffRole = staff => String(staff.role === 'staff' ? staff.staffType : (staff.role || staff.staffType || '')).toLowerCase();

const ServiceFormModal = ({ editingService, form, setForm, categories, staff, onClose, onSubmit, onImageUpload, loading, onAdvanced }) => {
  const image = form.images?.[0];
  const priceValid = form.price !== '' && Number(form.price) >= 0;
  const durationValid = Number(form.duration) >= 15;
  const complete = Boolean(form.name?.trim() && form.category && form.subCategory && priceValid && durationValid && form.description?.trim() && image);
  const qualifiedRoles = roleByCategory[form.category] || ['service_staff'];
  const qualifiedStaff = (staff || []).filter(member => member.isActive !== false && qualifiedRoles.includes(staffRole(member)));
  const assigned = form.assignedStaff || [];
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const selectedCategory = categories.find(category => category.id === form.category);

  const toggleStaff = staffId => setForm(current => ({
    ...current,
    assignedStaff: (current.assignedStaff || []).includes(staffId)
      ? current.assignedStaff.filter(id => id !== staffId)
      : [...(current.assignedStaff || []), staffId]
  }));

  return (
    <CompactFormModal
      title={editingService ? 'Edit Service' : 'Add Service'}
      subtitle="Required fields are marked with *"
      icon={Scissors}
      formId="compactServiceForm"
      onClose={onClose}
      onSubmit={onSubmit}
      saveDisabled={!complete}
      loading={loading}
      saveLabel={editingService ? 'Save Changes' : 'Save Service'}
      secondaryAction={<button type="button" onClick={onAdvanced} className="h-9 rounded-xl px-3 text-[10px] font-black text-primary-700 hover:bg-primary-50"><SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" />Advanced options</button>}
    >
      <CompactFormSection step="1" icon={ImageIcon} title="Service Image" description="Use a clear image that represents the service.">
        <CompactUploadCard
          title="Service Image"
          required
          value={image}
          preview={image ? getImageUrl(image) : ''}
          loading={loading}
          onFiles={files => onImageUpload(files, true)}
          onRemove={() => set('images', (form.images || []).slice(1))}
        />
        {!image && <p className="mt-2 text-[11px] font-semibold text-rose-600">Service image is required.</p>}
      </CompactFormSection>

      <CompactFormSection step="2" icon={Info} title="Basic Information" description="Set the service customers will see and book.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Service Name<RequiredMark /><input value={form.name} onChange={event => set('name', event.target.value)} className={compactInputClass} placeholder="Service name" />{!form.name?.trim() && <span className="mt-1 block text-[10px] text-rose-600">Service name is required.</span>}</label>
          <label className="text-[11px] font-bold text-slate-700">Category<RequiredMark /><select value={form.category} onChange={event => { const category = categories.find(item => item.id === event.target.value); setForm(current => ({ ...current, category: event.target.value, subCategory: category?.subServices?.[0] || '', assignedStaff: [] })); }} className={compactInputClass}>{categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
          <label className="text-[11px] font-bold text-slate-700">Service Type<RequiredMark /><select value={form.subCategory} onChange={event => set('subCategory', event.target.value)} className={compactInputClass}>{(selectedCategory?.subServices || []).map(service => <option key={service} value={service}>{service}</option>)}</select></label>
          <label className="text-[11px] font-bold text-slate-700">Duration<RequiredMark /><select value={form.duration} onChange={event => set('duration', Number(event.target.value))} className={compactInputClass}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="180">3 hours</option></select>{!durationValid && <span className="mt-1 block text-[10px] text-rose-600">Service duration must be at least 15 minutes.</span>}</label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Service Description<RequiredMark /><textarea rows="4" value={form.description} onChange={event => set('description', event.target.value)} className={compactTextareaClass} placeholder="Explain what the service includes." />{!form.description?.trim() && <span className="mt-1 block text-[10px] text-rose-600">Service description is required.</span>}</label>
        </div>
      </CompactFormSection>

      <CompactFormSection step="3" icon={Users} title="Specialist Requirements" description={`Only relevant ${qualifiedRoles.map(roleLabel).join(', ')} staff are shown for this service.`}>
        {qualifiedStaff.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{qualifiedStaff.map(member => {
          const id = member._id || member.id;
          const selected = assigned.includes(id);
          return <button key={id} type="button" onClick={() => toggleStaff(id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${selected ? 'border-primary-300 bg-primary-50' : 'border-slate-200 bg-slate-50 hover:border-primary-200'}`}><span className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black ${selected ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{member.firstName?.[0]}{member.lastName?.[0]}</span><span className="min-w-0"><span className="block truncate text-[11px] font-black text-slate-800">{member.firstName} {member.lastName}</span><span className="block text-[9px] font-bold text-slate-500">{roleLabel(staffRole(member))}</span></span></button>;
        })}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">No active qualified specialist is currently available. You may save the service and assign staff later.</div>}
      </CompactFormSection>

      <CompactFormSection step="4" icon={Clock} title="Pricing" description="Store VAT settings continue to apply at checkout.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Base Price (₱)<RequiredMark /><input type="number" min="0" step="0.01" value={form.price} onChange={event => set('price', event.target.value)} className={compactInputClass} />{!priceValid && <span className="mt-1 block text-[10px] text-rose-600">Enter a valid base price.</span>}</label>
          <label className="text-[11px] font-bold text-slate-700">Buffer Time <span className="font-normal text-slate-400">(optional)</span><select value={form.bufferTime || 0} onChange={event => set('bufferTime', Number(event.target.value))} className={compactInputClass}><option value="0">None</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black text-slate-800">VAT behavior</p><p className="mt-0.5 text-[10px] text-slate-500">Uses the store’s existing VAT configuration and checkout calculation.</p></div>
          <CompactToggle checked={Boolean(form.homeServiceAvailable)} onChange={checked => set('homeServiceAvailable', checked)} label="Home service available" description="Uses the existing home-service pricing behavior." />
          {form.homeServiceAvailable && <label className="text-[11px] font-bold text-slate-700">Home Service Fee (₱)<input type="number" min="0" step="0.01" value={form.homeServicePrice || 0} onChange={event => set('homeServicePrice', Number(event.target.value))} className={compactInputClass} /></label>}
        </div>
      </CompactFormSection>

      <CompactFormSection step="5" icon={Calendar} title="Availability" description="Active services remain visible and bookable under existing booking rules.">
        <CompactToggle checked={Boolean(form.isActive)} onChange={checked => set('isActive', checked)} label={form.isActive ? 'Active and accepting bookings' : 'Inactive and unavailable for booking'} description="Detailed schedules and capacity remain available under Advanced options." />
      </CompactFormSection>
    </CompactFormModal>
  );
};

export default ServiceFormModal;
