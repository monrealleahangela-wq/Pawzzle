import React from 'react';
import { Calendar, Clock, Info, Scissors } from 'lucide-react';
import {
  CompactFormModal,
  CompactFormSection,
  CompactToggle,
  RequiredMark,
  compactInputClass,
  compactTextareaClass
} from './CompactEntityForm';

const numberValue = value => value === '' ? '' : Number(value);

const ServiceFormModal = ({ editingService, form, setForm, categories, onClose, onSubmit, loading }) => {
  const isBoarding = form.category === 'boarding_hotel';
  const configuration = form.pricingConfiguration || {};
  const sizePricingEnabled = Boolean(configuration.petSizePricingEnabled);
  const regularPriceValid = form.price !== '' && Number(form.price) >= 0;
  const nightlyPriceValid = sizePricingEnabled
    ? ['small', 'medium', 'large'].every(size => configuration.petSizeRates?.[size] !== '' && Number(configuration.petSizeRates?.[size]) >= 0)
    : configuration.pricePerNight !== '' && Number(configuration.pricePerNight) >= 0;
  const durationValid = isBoarding || Number(form.duration) >= 15;
  const limitsValid = !configuration.maximumNights
    || Number(configuration.maximumNights) >= Number(configuration.minimumNights || 0);
  const complete = Boolean(form.name?.trim() && form.category && form.subCategory
    && (isBoarding ? nightlyPriceValid && limitsValid : regularPriceValid)
    && durationValid && form.description?.trim());
  const visibleCategories = categories.filter(category => category.id !== 'home_services');
  const selectedCategory = visibleCategories.find(category => category.id === form.category);
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const setPricing = (field, value) => setForm(current => ({
    ...current,
    pricingConfiguration: { ...(current.pricingConfiguration || {}), [field]: value }
  }));
  const setSizeRate = (size, value) => setForm(current => ({
    ...current,
    pricingConfiguration: {
      ...(current.pricingConfiguration || {}),
      petSizeRates: { ...(current.pricingConfiguration?.petSizeRates || {}), [size]: value }
    }
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
    >
      <CompactFormSection step="1" icon={Info} title="Primary Details" description="Set the service information customers will see and book.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Service Name<RequiredMark /><input value={form.name} onChange={event => set('name', event.target.value)} className={compactInputClass} placeholder="Service name" /></label>
          <label className="text-[11px] font-bold text-slate-700">Category<RequiredMark /><select value={form.category} onChange={event => { const category = visibleCategories.find(item => item.id === event.target.value); const boarding = event.target.value === 'boarding_hotel'; setForm(current => ({ ...current, category: event.target.value, subCategory: category?.subServices?.[0] || '', duration: boarding ? 0 : (Number(current.duration) >= 15 ? current.duration : 30), pricingConfiguration: { ...(current.pricingConfiguration || {}), pricingBasis: boarding ? 'per_night' : 'fixed' } })); }} className={compactInputClass}>{visibleCategories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
          <label className="text-[11px] font-bold text-slate-700">Service Type<RequiredMark /><select value={form.subCategory} onChange={event => set('subCategory', event.target.value)} className={compactInputClass}>{(selectedCategory?.subServices || []).map(service => <option key={service} value={service}>{service}</option>)}</select></label>
          {!isBoarding && <label className="text-[11px] font-bold text-slate-700">Duration<RequiredMark /><select value={form.duration} onChange={event => set('duration', Number(event.target.value))} className={compactInputClass}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="180">3 hours</option></select></label>}
          <label className="text-[11px] font-bold text-slate-700">Buffer Time <span className="font-normal text-slate-400">(optional)</span><select value={form.bufferTime || 0} onChange={event => set('bufferTime', Number(event.target.value))} className={compactInputClass}><option value="0">None</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Service Description<RequiredMark /><textarea rows="4" value={form.description} onChange={event => set('description', event.target.value)} className={compactTextareaClass} placeholder="Explain what the service includes." /></label>
          <CompactToggle checked={Boolean(form.isActive)} onChange={checked => set('isActive', checked)} label={form.isActive ? 'Active and accepting bookings' : 'Inactive and unavailable'} description="Controls whether customers can book this service." />
          <CompactToggle checked={form.recommendationCriteria?.enabled === true} onChange={checked => setForm(current => ({ ...current, recommendationCriteria: { ...(current.recommendationCriteria || {}), enabled: checked } }))} label="Include in Service Advisor" description="Allow eligible customers to discover this service." />
        </div>
      </CompactFormSection>

      <CompactFormSection step="2" icon={Clock} title="Price Rules / Configuration" description={isBoarding ? 'Boarding is priced by the selected number of nights.' : 'Set the price customers will pay for this service.'}>
        {!isBoarding ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-bold text-slate-700">Service Price (₱)<RequiredMark /><input type="number" min="0" step="0.01" value={form.price} onChange={event => set('price', event.target.value)} className={compactInputClass} />{!regularPriceValid && <span className="mt-1 block text-[10px] text-rose-600">Enter a valid service price.</span>}</label>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-bold text-slate-700">Pricing Basis<input value="Per Night" readOnly className={`${compactInputClass} bg-slate-50`} /></label>
              {!sizePricingEnabled && <label className="text-[11px] font-bold text-slate-700">Price per Night (₱)<RequiredMark /><input type="number" min="0" step="0.01" value={configuration.pricePerNight ?? ''} onChange={event => { const value = numberValue(event.target.value); setForm(current => ({ ...current, price: value, pricingConfiguration: { ...(current.pricingConfiguration || {}), pricePerNight: value } })); }} className={compactInputClass} /></label>}
              <div className="sm:col-span-2"><CompactToggle checked={sizePricingEnabled} onChange={checked => setPricing('petSizePricingEnabled', checked)} label="Use pet size pricing" description="Set separate nightly rates for small, medium, and large pets." /></div>
              {sizePricingEnabled && ['small', 'medium', 'large'].map(size => <label key={size} className="text-[11px] font-bold capitalize text-slate-700">{size} Pet Rate (₱)<RequiredMark /><input type="number" min="0" step="0.01" value={configuration.petSizeRates?.[size] ?? ''} onChange={event => setSizeRate(size, numberValue(event.target.value))} className={compactInputClass} /></label>)}
              <label className="text-[11px] font-bold text-slate-700">Minimum Stay <span className="font-normal text-slate-400">(optional)</span><input type="number" min="0" step="1" value={configuration.minimumNights || ''} onChange={event => setPricing('minimumNights', Number(event.target.value || 0))} className={compactInputClass} placeholder="No minimum" /></label>
              <label className="text-[11px] font-bold text-slate-700">Maximum Stay <span className="font-normal text-slate-400">(optional)</span><input type="number" min="0" step="1" value={configuration.maximumNights || ''} onChange={event => setPricing('maximumNights', Number(event.target.value || 0))} className={compactInputClass} placeholder="No maximum" />{!limitsValid && <span className="mt-1 block text-[10px] text-rose-600">Maximum stay cannot be less than minimum stay.</span>}</label>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50 p-3 text-[10px] text-primary-800"><Calendar className="mt-0.5 h-4 w-4 shrink-0" /><span>Customers choose check-in and check-out dates. Total price is calculated as nights × the applicable nightly rate.</span></div>
          </div>
        )}
      </CompactFormSection>
    </CompactFormModal>
  );
};

export default ServiceFormModal;
