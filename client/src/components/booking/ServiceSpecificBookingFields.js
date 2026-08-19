import React from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, ClipboardList, HeartPulse, Scissors, School, Shield, UserRound } from 'lucide-react';
import { SERVICE_BOOKING_KINDS, calculateBoardingNights, resolveServiceBookingKind, serviceIntakeSummary } from '../../utils/serviceBookingForm';

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

const Field = ({ label, required, error, children, className = '' }) => (
  <label className={`block text-[10px] font-bold text-slate-600 dark:text-slate-300 ${className}`}>
    {label}{required && <span className="ml-1 text-rose-500">*</span>}
    {children}
    {error && <span className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-rose-600 dark:text-rose-300"><AlertCircle className="h-3 w-3" />{error}</span>}
  </label>
);

const Choice = ({ label, value, onChange, error }) => (
  <Field label={label} required error={error}>
    <div className="mt-1.5 grid grid-cols-2 gap-2">
      {[['yes', 'Yes'], ['no', 'No']].map(([option, text]) => (
        <button key={option} type="button" onClick={() => onChange(option)} className={`h-10 rounded-xl border text-[10px] font-black transition ${value === option ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-200' : 'border-slate-200 bg-white text-slate-500 hover:border-primary-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
          {value === option && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />}{text}
        </button>
      ))}
    </div>
  </Field>
);

const SectionHeader = ({ icon: Icon, eyebrow, title }) => (
  <div className="mb-5 flex items-center gap-3">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-300"><Icon className="h-5 w-5" /></span>
    <div><p className="text-[8px] font-black uppercase tracking-[0.22em] text-primary-600 dark:text-primary-300">{eyebrow}</p><h3 className="text-base font-black text-slate-900 dark:text-slate-100">{title}</h3></div>
  </div>
);

const TextInput = ({ label, name, value, onChange, error, required, placeholder, type = 'text', min }) => (
  <Field label={label} required={required} error={error}>
    <input type={type} min={min} value={value || ''} onChange={event => onChange(name, event.target.value)} placeholder={placeholder} className={inputClass} />
  </Field>
);

const TextArea = ({ label, name, value, onChange, error, required, placeholder }) => (
  <Field label={label} required={required} error={error}>
    <textarea rows={3} value={value || ''} onChange={event => onChange(name, event.target.value)} placeholder={placeholder} className={`${inputClass} resize-none`} />
  </Field>
);

const SelectInput = ({ label, name, value, onChange, error, required, options }) => (
  <Field label={label} required={required} error={error}>
    <select value={value || ''} onChange={event => onChange(name, event.target.value)} className={inputClass}>
      <option value="">Choose an option</option>
      {options.map(option => <option key={option.value || option} value={option.value || option}>{option.label || option}</option>)}
    </select>
  </Field>
);

const ServiceSpecificBookingFields = ({ service, details, onChange, errors = {}, pet }) => {
  const kind = resolveServiceBookingKind(service);
  const boardingNights = calculateBoardingNights(details.checkInDate, details.checkOutDate);
  const specialists = service?.assignedStaff || [];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      {kind === SERVICE_BOOKING_KINDS.VETERINARY && <>
        <SectionHeader icon={HeartPulse} eyebrow="Veterinary visit" title="Tell us what your pet needs" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="Reason for visit" name="reasonForVisit" value={details.reasonForVisit} onChange={onChange} error={errors.reasonForVisit} required placeholder="What would you like the veterinarian to check?" />
          <TextArea label="Symptoms" name="symptoms" value={details.symptoms} onChange={onChange} error={errors.symptoms} required placeholder="Describe any changes or symptoms you noticed." />
          <TextInput label="How long have the symptoms been present?" name="symptomDuration" value={details.symptomDuration} onChange={onChange} error={errors.symptomDuration} required placeholder="Example: 3 days" />
          <Choice label="Is this an emergency?" value={details.emergency} onChange={value => onChange('emergency', value)} error={errors.emergency} />
          <TextArea label="Current medications (optional)" name="currentMedications" value={details.currentMedications} onChange={onChange} placeholder="Medication name and schedule" />
          <TextArea label="Allergies (optional)" name="allergies" value={details.allergies || (pet?.allergies === 'None' ? '' : pet?.allergies)} onChange={onChange} placeholder="Known food or medicine allergies" />
          {specialists.length > 0 && <SelectInput label="Preferred veterinarian (optional)" name="preferredSpecialistId" value={details.preferredSpecialistId} onChange={onChange} options={specialists.map(member => ({ value: member._id, label: `${member.firstName} ${member.lastName}` }))} />}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Shield className="mb-1 h-4 w-4 text-emerald-600" /><strong>Vaccination status:</strong> {pet?.vaccinationStatus || 'Not provided'}<br />The store can review the vaccination record saved in your pet profile.</div>
        </div>
      </>}

      {kind === SERVICE_BOOKING_KINDS.GROOMING && <>
        <SectionHeader icon={Scissors} eyebrow="Grooming" title="Choose grooming preferences" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput label="Grooming package" name="groomingPackage" value={details.groomingPackage} onChange={onChange} error={errors.groomingPackage} required options={['Bath and brush', 'Full grooming', 'Haircut and styling', 'Nail and hygiene care']} />
          <SelectInput label="Coat condition" name="coatCondition" value={details.coatCondition} onChange={onChange} error={errors.coatCondition} required options={['Healthy', 'Tangled', 'Matted', 'Dry or flaky', 'Not sure']} />
          <TextInput label="Preferred haircut or style (optional)" name="preferredStyle" value={details.preferredStyle} onChange={onChange} placeholder="Example: puppy cut" />
          <TextInput label="Sensitive areas to avoid (optional)" name="sensitiveAreas" value={details.sensitiveAreas} onChange={onChange} placeholder="Example: left ear" />
          <Choice label="Include nail trimming?" value={details.nailTrimming} onChange={value => onChange('nailTrimming', value)} error={errors.nailTrimming} />
          <Choice label="Include ear cleaning?" value={details.earCleaning} onChange={value => onChange('earCleaning', value)} error={errors.earCleaning} />
          <Choice label="Can your pet become aggressive or anxious?" value={details.behaviorConcern} onChange={value => onChange('behaviorConcern', value)} error={errors.behaviorConcern} />
        </div>
      </>}

      {kind === SERVICE_BOOKING_KINDS.TRAINING && <>
        <SectionHeader icon={School} eyebrow="Training" title="Set your training goals" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="Training goal" name="trainingGoal" value={details.trainingGoal} onChange={onChange} error={errors.trainingGoal} required placeholder="What would you like your pet to learn?" />
          <TextArea label="Behavioral concerns" name="behavioralConcerns" value={details.behavioralConcerns} onChange={onChange} error={errors.behavioralConcerns} required placeholder="Describe the behavior, or type None." />
          <TextInput label="Commands your pet already knows (optional)" name="currentCommands" value={details.currentCommands} onChange={onChange} placeholder="Example: sit, stay, come" />
          <SelectInput label="Previous training experience" name="previousTraining" value={details.previousTraining} onChange={onChange} error={errors.previousTraining} required options={['None', 'Home training', 'Group classes', 'Private training']} />
          <SelectInput label="Preferred training type" name="trainingType" value={details.trainingType} onChange={onChange} error={errors.trainingType} required options={['Private session', 'Group session', 'At-home session', 'Store recommendation']} />
          <SelectInput label="Owner attendance" name="ownerAttendance" value={details.ownerAttendance} onChange={onChange} error={errors.ownerAttendance} required options={['I will attend', 'Trainer only', 'No preference']} />
        </div>
      </>}

      {kind === SERVICE_BOOKING_KINDS.BOARDING && <>
        <SectionHeader icon={CalendarDays} eyebrow="Boarding" title="Plan your pet's stay" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Check-in date" name="checkInDate" type="date" min={new Date().toISOString().slice(0, 10)} value={details.checkInDate} onChange={onChange} error={errors.checkInDate} required />
          <TextInput label="Check-out date" name="checkOutDate" type="date" min={details.checkInDate || new Date().toISOString().slice(0, 10)} value={details.checkOutDate} onChange={onChange} error={errors.checkOutDate} required />
          {boardingNights > 0 && <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">Stay duration: {boardingNights} night{boardingNights === 1 ? '' : 's'}</div>}
          <TextArea label="Feeding schedule" name="feedingSchedule" value={details.feedingSchedule} onChange={onChange} error={errors.feedingSchedule} required placeholder="Times, portions, and food instructions" />
          <Choice label="Will you provide your pet's food?" value={details.foodProvided} onChange={value => onChange('foodProvided', value)} error={errors.foodProvided} />
          <Choice label="Does your pet need medication?" value={details.takesMedication} onChange={value => onChange('takesMedication', value)} error={errors.takesMedication} />
          {details.takesMedication === 'yes' && <TextArea label="Medication schedule" name="medicationSchedule" value={details.medicationSchedule} onChange={onChange} error={errors.medicationSchedule} required placeholder="Medication, dosage, and time" />}
          <TextArea label="Special care instructions" name="specialCareInstructions" value={details.specialCareInstructions} onChange={onChange} error={errors.specialCareInstructions} required placeholder="Care needs, routines, or type None" />
          <TextInput label="Emergency contact" name="emergencyContact" value={details.emergencyContact} onChange={onChange} error={errors.emergencyContact} required placeholder="Name and mobile number" />
        </div>
      </>}

      {kind === SERVICE_BOOKING_KINDS.ADOPTION && <>
        <SectionHeader icon={UserRound} eyebrow="Adoption consultation" title="Help the store prepare" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput label="What would you like to discuss?" name="consultationTopic" value={details.consultationTopic} onChange={onChange} error={errors.consultationTopic} required options={['Pet compatibility', 'Adoption requirements', 'Preparing my home', 'Meet and greet', 'Other']} />
          <TextArea label="Tell us about your home and household" name="householdDetails" value={details.householdDetails} onChange={onChange} error={errors.householdDetails} required placeholder="Household members, children, and other pets" />
          <TextArea label="Pet ownership experience (optional)" name="petExperience" value={details.petExperience} onChange={onChange} placeholder="Previous or current pets" />
          <TextArea label="Questions for the store (optional)" name="consultationQuestions" value={details.consultationQuestions} onChange={onChange} placeholder="Anything you would like the store to answer" />
        </div>
      </>}

      {kind === SERVICE_BOOKING_KINDS.GENERAL && <>
        <SectionHeader icon={ClipboardList} eyebrow="Service details" title="Tell us what your pet needs" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="What does your pet need?" name="serviceNeeds" value={details.serviceNeeds} onChange={onChange} error={errors.serviceNeeds} required placeholder="Share the main reason for this booking." />
          <TextArea label="Special instructions (optional)" name="specialInstructions" value={details.specialInstructions} onChange={onChange} placeholder="Anything else the store should know" />
        </div>
      </>}
    </section>
  );
};

export const ServiceIntakeSummary = ({ intake, service, title = 'Service details', editable = false, onEdit }) => {
  const rows = serviceIntakeSummary(intake, service);
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">{title}</h3>{editable && <button type="button" onClick={onEdit} className="text-[9px] font-black text-primary-600 dark:text-primary-300">Edit</button>}</div>
      <dl className="grid gap-2 sm:grid-cols-2">{rows.map(row => <div key={row.key} className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800"><dt className="text-[8px] font-black uppercase tracking-wider text-slate-400">{row.label}</dt><dd className="mt-1 whitespace-pre-wrap text-[11px] font-semibold text-slate-800 dark:text-slate-100">{row.value}</dd></div>)}</dl>
    </section>
  );
};

export default ServiceSpecificBookingFields;
