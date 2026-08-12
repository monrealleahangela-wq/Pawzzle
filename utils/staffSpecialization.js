const SPECIALIZED_STAFF_ROLES = [
  'veterinarian',
  'veterinary_technician',
  'veterinary_assistant',
  'veterinary_nurse',
  'veterinary_laboratory_technician',
  'groomer',
  'trainer'
];

const VETERINARY_ROLES = new Set([
  'veterinarian', 'veterinary_technician', 'veterinary_assistant',
  'veterinary_nurse', 'veterinary_laboratory_technician'
]);

const textForService = service => `${service?.name || ''} ${service?.subCategory || ''} ${service?.description || ''}`.toLowerCase();
const isLaboratoryService = service => /\b(lab|laboratory|diagnostic|pathology|testing|test)\b/.test(textForService(service));

const isRoleEligibleForService = (staffType, service) => {
  if (!SPECIALIZED_STAFF_ROLES.includes(staffType)) return true;
  if (staffType === 'groomer') return service?.category === 'grooming';
  if (staffType === 'trainer') return service?.category === 'training' || /\btraining\b/.test(textForService(service));
  if (staffType === 'veterinary_laboratory_technician') return service?.category === 'health_wellness' && isLaboratoryService(service);
  if (VETERINARY_ROLES.has(staffType)) return service?.category === 'health_wellness';
  return false;
};

const getEnabledSpecializedRoles = services => {
  const enabled = new Set();
  for (const service of services || []) {
    if (!service?.isActive || service?.isDeleted) continue;
    if (service.category === 'health_wellness') {
      ['veterinarian', 'veterinary_technician', 'veterinary_assistant', 'veterinary_nurse'].forEach(role => enabled.add(role));
      if (isLaboratoryService(service)) enabled.add('veterinary_laboratory_technician');
    }
    if (service.category === 'grooming') enabled.add('groomer');
    if (service.category === 'training' || /\btraining\b/.test(textForService(service))) enabled.add('trainer');
  }
  return [...enabled];
};

const toMinutes = value => {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};

const isWithinStaffSchedule = (staff, bookingDate, startTime, endTime) => {
  const availability = staff?.professionalProfile?.availability;
  if (!availability) return true;
  const configuredDays = Object.values(availability).filter(day => day && typeof day === 'object' && typeof day.available === 'boolean');
  if (!configuredDays.length) return true; // Preserve legacy staff without a configured schedule.
  const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(bookingDate).getDay()];
  const day = availability[dayKey];
  if (!day?.available) return false;
  const requestedStart = toMinutes(startTime), requestedEnd = toMinutes(endTime);
  const shiftStart = toMinutes(day.start), shiftEnd = toMinutes(day.end);
  if ([requestedStart, requestedEnd, shiftStart, shiftEnd].some(value => value === null)) return false;
  if (requestedStart < shiftStart || requestedEnd > shiftEnd || requestedStart >= requestedEnd) return false;
  return !(day.breaks || []).some(item => {
    const breakStart = toMinutes(item.start), breakEnd = toMinutes(item.end);
    return breakStart !== null && breakEnd !== null && requestedStart < breakEnd && requestedEnd > breakStart;
  });
};

module.exports = {
  SPECIALIZED_STAFF_ROLES,
  VETERINARY_ROLES,
  getEnabledSpecializedRoles,
  isLaboratoryService,
  isRoleEligibleForService,
  isWithinStaffSchedule
};
