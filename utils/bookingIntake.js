const SERVICE_INTAKE_FIELDS = Object.freeze({
  veterinary: ['reasonForVisit', 'symptoms', 'symptomDuration', 'emergency', 'currentMedications', 'allergies', 'preferredSpecialistId'],
  grooming: ['groomingPackage', 'preferredStyle', 'coatCondition', 'nailTrimming', 'earCleaning', 'sensitiveAreas', 'behaviorConcern'],
  training: ['trainingGoal', 'behavioralConcerns', 'currentCommands', 'previousTraining', 'trainingType', 'ownerAttendance'],
  boarding: ['checkInDate', 'checkOutDate', 'feedingSchedule', 'foodProvided', 'takesMedication', 'medicationSchedule', 'specialCareInstructions', 'emergencyContact', 'boardingNights'],
  adoption_consultation: ['consultationTopic', 'householdDetails', 'petExperience', 'consultationQuestions'],
  general: ['serviceNeeds', 'specialInstructions']
});

const REQUIRED_FIELDS = Object.freeze({
  veterinary: ['reasonForVisit', 'symptoms', 'symptomDuration', 'emergency'],
  grooming: ['groomingPackage', 'coatCondition', 'nailTrimming', 'earCleaning', 'behaviorConcern'],
  training: ['trainingGoal', 'behavioralConcerns', 'previousTraining', 'trainingType', 'ownerAttendance'],
  boarding: ['checkInDate', 'checkOutDate', 'feedingSchedule', 'foodProvided', 'takesMedication', 'specialCareInstructions', 'emergencyContact'],
  adoption_consultation: ['consultationTopic', 'householdDetails'],
  general: ['serviceNeeds']
});

const resolveServiceIntakeKind = (service = {}) => {
  const category = String(service.category || '').toLowerCase();
  const searchable = `${category} ${service.subCategory || ''} ${service.name || ''}`.toLowerCase();
  if (searchable.includes('adoption')) return 'adoption_consultation';
  if (category === 'grooming' || searchable.includes('groom')) return 'grooming';
  if (category === 'training' || searchable.includes('train')) return 'training';
  if (category === 'boarding_hotel' || /boarding|hotel|daycare|overnight/.test(searchable)) return 'boarding';
  if (category === 'health_wellness' || /veterinar|vaccin|consultation|checkup|treatment|clinic/.test(searchable)) return 'veterinary';
  return 'general';
};

const calculateBoardingNights = (checkInDate, checkOutDate) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate || '')) return 0;
  const [inYear, inMonth, inDay] = checkInDate.split('-').map(Number);
  const [outYear, outMonth, outDay] = checkOutDate.split('-').map(Number);
  return Math.max(0, Math.ceil((Date.UTC(outYear, outMonth - 1, outDay) - Date.UTC(inYear, inMonth - 1, inDay)) / 86400000));
};

const prepareServiceIntake = (service, rawIntake, { allowLegacyMissing = true } = {}) => {
  if (!rawIntake || typeof rawIntake !== 'object') {
    return allowLegacyMissing ? { value: undefined, error: null } : { value: undefined, error: 'Service details are required.' };
  }

  const kind = resolveServiceIntakeKind(service);
  const rawDetails = rawIntake.details && typeof rawIntake.details === 'object' ? rawIntake.details : {};
  const details = {};
  for (const key of SERVICE_INTAKE_FIELDS[kind]) {
    const value = String(rawDetails[key] ?? '').trim().slice(0, 2000);
    if (value) details[key] = value;
  }

  for (const key of REQUIRED_FIELDS[kind]) {
    if (!details[key]) return { value: undefined, error: `Please complete the required ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} field.` };
  }
  if (kind === 'boarding') {
    const nights = calculateBoardingNights(details.checkInDate, details.checkOutDate);
    if (nights < 1) return { value: undefined, error: 'Please select check-out after check-in.' };
    if (details.takesMedication === 'yes' && !details.medicationSchedule) return { value: undefined, error: 'Please enter the medication schedule.' };
    details.boardingNights = String(nights);
  }
  if (details.preferredSpecialistId) {
    const assigned = (service.assignedStaff || []).find(member => String(member._id || member) === details.preferredSpecialistId);
    if (!assigned) {
      delete details.preferredSpecialistId;
    } else if (assigned && typeof assigned === 'object') {
      details.preferredSpecialistName = `${assigned.firstName || ''} ${assigned.lastName || ''}`.trim();
    }
  }

  return { value: { kind, details }, error: null };
};

module.exports = { SERVICE_INTAKE_FIELDS, resolveServiceIntakeKind, calculateBoardingNights, prepareServiceIntake };
