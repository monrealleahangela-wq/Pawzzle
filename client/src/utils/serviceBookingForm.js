export const SERVICE_BOOKING_KINDS = Object.freeze({
  VETERINARY: 'veterinary',
  GROOMING: 'grooming',
  TRAINING: 'training',
  BOARDING: 'boarding',
  ADOPTION: 'adoption_consultation',
  GENERAL: 'general'
});

const KIND_FIELDS = Object.freeze({
  veterinary: ['reasonForVisit', 'symptoms', 'symptomDuration', 'emergency', 'currentMedications', 'allergies', 'preferredSpecialistId'],
  grooming: ['groomingPackage', 'preferredStyle', 'coatCondition', 'nailTrimming', 'earCleaning', 'sensitiveAreas', 'behaviorConcern'],
  training: ['trainingGoal', 'behavioralConcerns', 'currentCommands', 'previousTraining', 'trainingType', 'ownerAttendance'],
  boarding: ['checkInDate', 'checkOutDate', 'feedingSchedule', 'foodProvided', 'takesMedication', 'medicationSchedule', 'specialCareInstructions', 'emergencyContact', 'boardingNights'],
  adoption_consultation: ['consultationTopic', 'householdDetails', 'petExperience', 'consultationQuestions'],
  general: ['serviceNeeds', 'specialInstructions']
});

const FIELD_LABELS = Object.freeze({
  reasonForVisit: 'Reason for visit', symptoms: 'Symptoms', symptomDuration: 'How long', emergency: 'Emergency',
  currentMedications: 'Current medications', allergies: 'Allergies', preferredSpecialistId: 'Preferred veterinarian',
  groomingPackage: 'Grooming package', preferredStyle: 'Preferred haircut or style', coatCondition: 'Coat condition',
  nailTrimming: 'Nail trimming', earCleaning: 'Ear cleaning', sensitiveAreas: 'Sensitive areas to avoid', behaviorConcern: 'Aggressive or anxious behavior',
  trainingGoal: 'Training goal', behavioralConcerns: 'Behavioral concerns', currentCommands: 'Commands already known',
  previousTraining: 'Previous training', trainingType: 'Training type', ownerAttendance: 'Owner attendance',
  checkInDate: 'Check-in date', checkOutDate: 'Check-out date', feedingSchedule: 'Feeding schedule', foodProvided: 'Food provided by owner',
  takesMedication: 'Needs medication', medicationSchedule: 'Medication schedule', specialCareInstructions: 'Special care instructions',
  emergencyContact: 'Emergency contact', boardingNights: 'Boarding duration', consultationTopic: 'Consultation topic',
  householdDetails: 'Home and household', petExperience: 'Pet ownership experience', consultationQuestions: 'Questions for the store',
  serviceNeeds: 'What your pet needs', specialInstructions: 'Special instructions'
});

export const createEmptyServiceDetails = () => ({
  reasonForVisit: '', symptoms: '', symptomDuration: '', emergency: '', currentMedications: '', allergies: '', preferredSpecialistId: '',
  groomingPackage: '', preferredStyle: '', coatCondition: '', nailTrimming: '', earCleaning: '', sensitiveAreas: '', behaviorConcern: '',
  trainingGoal: '', behavioralConcerns: '', currentCommands: '', previousTraining: '', trainingType: '', ownerAttendance: '',
  checkInDate: '', checkOutDate: '', feedingSchedule: '', foodProvided: '', takesMedication: '', medicationSchedule: '', specialCareInstructions: '', emergencyContact: '', boardingNights: '',
  consultationTopic: '', householdDetails: '', petExperience: '', consultationQuestions: '',
  serviceNeeds: '', specialInstructions: ''
});

export const resolveServiceBookingKind = (service = {}) => {
  const category = String(service.category || '').toLowerCase();
  const searchable = `${category} ${service.subCategory || ''} ${service.name || ''}`.toLowerCase();
  if (searchable.includes('adoption')) return SERVICE_BOOKING_KINDS.ADOPTION;
  if (category === 'grooming' || searchable.includes('groom')) return SERVICE_BOOKING_KINDS.GROOMING;
  if (category === 'training' || searchable.includes('train')) return SERVICE_BOOKING_KINDS.TRAINING;
  if (category === 'boarding_hotel' || /boarding|hotel|daycare|overnight/.test(searchable)) return SERVICE_BOOKING_KINDS.BOARDING;
  if (category === 'health_wellness' || /veterinar|vaccin|consultation|checkup|treatment|clinic/.test(searchable)) return SERVICE_BOOKING_KINDS.VETERINARY;
  return SERVICE_BOOKING_KINDS.GENERAL;
};

export const calculateBoardingNights = (checkInDate, checkOutDate) => {
  if (!checkInDate || !checkOutDate) return 0;
  const [inYear, inMonth, inDay] = checkInDate.split('-').map(Number);
  const [outYear, outMonth, outDay] = checkOutDate.split('-').map(Number);
  const difference = Date.UTC(outYear, outMonth - 1, outDay) - Date.UTC(inYear, inMonth - 1, inDay);
  return Number.isFinite(difference) ? Math.max(0, Math.ceil(difference / 86400000)) : 0;
};

export const validateServiceDetails = (kind, details = {}) => {
  const errors = {};
  const required = (key, message) => {
    if (!String(details[key] ?? '').trim()) errors[key] = message;
  };

  if (kind === SERVICE_BOOKING_KINDS.VETERINARY) {
    required('reasonForVisit', 'Please enter the reason for your visit.');
    required('symptoms', "Please describe your pet's symptoms.");
    required('symptomDuration', 'Please tell us how long the symptoms have been present.');
    required('emergency', 'Please tell us if this is an emergency.');
  } else if (kind === SERVICE_BOOKING_KINDS.GROOMING) {
    required('groomingPackage', 'Please choose a grooming package.');
    required('coatCondition', "Please choose your pet's coat condition.");
    required('nailTrimming', 'Please choose whether nail trimming is needed.');
    required('earCleaning', 'Please choose whether ear cleaning is needed.');
    required('behaviorConcern', 'Please tell us if your pet may be anxious or aggressive.');
  } else if (kind === SERVICE_BOOKING_KINDS.TRAINING) {
    required('trainingGoal', 'Please enter your training goal.');
    required('behavioralConcerns', 'Please describe any behavioral concerns.');
    required('previousTraining', 'Please choose the previous training experience.');
    required('trainingType', 'Please choose a training type.');
    required('ownerAttendance', 'Please choose your attendance preference.');
  } else if (kind === SERVICE_BOOKING_KINDS.BOARDING) {
    required('checkInDate', 'Please choose a check-in date.');
    required('checkOutDate', 'Please choose a check-out date.');
    if (details.checkInDate && details.checkOutDate && calculateBoardingNights(details.checkInDate, details.checkOutDate) < 1) {
      errors.checkOutDate = 'Please select check-out after check-in.';
    }
    required('feedingSchedule', 'Please enter a feeding schedule.');
    required('foodProvided', 'Please tell us if you will provide food.');
    required('takesMedication', 'Please tell us if your pet needs medication.');
    if (details.takesMedication === 'yes') required('medicationSchedule', 'Please enter the medication schedule.');
    required('specialCareInstructions', 'Please enter care instructions, or type “None”.');
    required('emergencyContact', 'Please enter an emergency contact.');
  } else if (kind === SERVICE_BOOKING_KINDS.ADOPTION) {
    required('consultationTopic', 'Please choose a consultation topic.');
    required('householdDetails', 'Please tell us a little about your household.');
  } else {
    required('serviceNeeds', 'Please tell us what your pet needs.');
  }

  return errors;
};

export const buildServiceIntake = (kind, details = {}, service = {}) => {
  const allowed = KIND_FIELDS[kind] || KIND_FIELDS.general;
  const normalized = {};
  for (const key of allowed) {
    if (key === 'boardingNights') continue;
    const value = String(details[key] ?? '').trim();
    if (value) normalized[key] = value;
  }
  if (kind === SERVICE_BOOKING_KINDS.BOARDING) {
    normalized.boardingNights = String(calculateBoardingNights(details.checkInDate, details.checkOutDate));
  }
  if (normalized.preferredSpecialistId) {
    const specialist = (service.assignedStaff || []).find(member => String(member._id) === normalized.preferredSpecialistId);
    if (specialist) normalized.preferredSpecialistName = `${specialist.firstName || ''} ${specialist.lastName || ''}`.trim();
  }
  return { kind, details: normalized };
};

export const serviceIntakeSummary = (intake = {}, service = {}) => {
  const details = intake.details instanceof Map ? Object.fromEntries(intake.details) : (intake.details || {});
  return Object.entries(details)
    .filter(([key, value]) => value && (key !== 'preferredSpecialistId' || !details.preferredSpecialistName))
    .map(([key, value]) => {
      if (key === 'boardingNights') return { key, label: FIELD_LABELS[key], value: `${value} night${String(value) === '1' ? '' : 's'}` };
      if (key === 'preferredSpecialistName') return { key, label: FIELD_LABELS.preferredSpecialistId, value };
      if (key === 'preferredSpecialistId') {
        const specialist = (service.assignedStaff || []).find(member => String(member._id) === String(value));
        return { key, label: FIELD_LABELS[key], value: specialist ? `${specialist.firstName} ${specialist.lastName}` : 'Store to confirm' };
      }
      return { key, label: FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1'), value: ['yes', 'no'].includes(String(value).toLowerCase()) ? String(value).replace(/^./, character => character.toUpperCase()) : value };
    });
};
