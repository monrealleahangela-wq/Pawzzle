const SPECIALIZED_STAFF_ROLES = [
  'veterinarian',
  'veterinary_technician',
  'veterinary_assistant',
  'veterinary_nurse',
  'veterinary_laboratory_technician',
  'groomer',
  'trainer',
  'boarding_staff',
  'boarding_specialist'
];

const VETERINARY_ROLES = new Set([
  'veterinarian', 'veterinary_technician', 'veterinary_assistant',
  'veterinary_nurse', 'veterinary_laboratory_technician'
]);

const PLATFORM_VERIFIED_SPECIALIST_ROLES = new Set([
  'veterinarian', 'groomer', 'trainer', 'boarding_staff', 'boarding_specialist'
]);

const textForService = service => `${service?.name || ''} ${service?.subCategory || ''} ${service?.description || ''}`.toLowerCase();
const isLaboratoryService = service => /\b(lab|laboratory|diagnostic|pathology|testing|test)\b/.test(textForService(service));

const isRoleEligibleForService = (staffType, service) => {
  if (!SPECIALIZED_STAFF_ROLES.includes(staffType)) return true;
  if (staffType === 'groomer') return service?.category === 'grooming';
  if (staffType === 'trainer') return service?.category === 'training' || /\btraining\b/.test(textForService(service));
  if (staffType === 'boarding_staff' || staffType === 'boarding_specialist') return service?.category === 'boarding_hotel';
  if (staffType === 'veterinary_laboratory_technician') return service?.category === 'health_wellness' && isLaboratoryService(service);
  if (VETERINARY_ROLES.has(staffType)) return service?.category === 'health_wellness';
  return false;
};

const getStaffSpecializationRole = staff => {
  if (!staff) return null;
  if (staff.role === 'staff') {
    const { normalizeRole } = require('../config/permissions');
    return normalizeRole(staff);
  }
  return staff.role || (staff.staffType === 'boarding_specialist' ? 'boarding_staff' : staff.staffType);
};

const requiresPlatformVerification = staff => PLATFORM_VERIFIED_SPECIALIST_ROLES.has(getStaffSpecializationRole(staff));

const hasTrustedLegacyProfessionalVerification = staff => Boolean(
  staff?.isVerified === true
  || (staff?.professionalProfile?.certifications || []).some(certification => certification?.isVerified === true)
);

const isCredentialApplicableToRole = (staff, document) => {
  const role = getStaffSpecializationRole(staff);
  return role !== 'veterinarian' || document?.documentType === 'professional_license';
};

const isCredentialExpired = (document, now = new Date()) => Boolean(
  document?.expiresAt && new Date(document.expiresAt) <= now
);

const currentCredentialDocuments = staff => (staff?.professionalProfile?.credentialDocuments || [])
  .filter(document => document?.status !== 'archived');

const hasCurrentVerifiedProfessionalCredential = (staff, now = new Date()) => currentCredentialDocuments(staff).some(document =>
  document.status === 'verified'
  && !isCredentialExpired(document, now)
  && isCredentialApplicableToRole(staff, document)
);

const hasExpiredRequiredProfessionalCredential = (staff, now = new Date()) => {
  const documents = currentCredentialDocuments(staff).filter(document => isCredentialApplicableToRole(staff, document));
  if (documents.some(document => ['verified', 'expired'].includes(document.status) && isCredentialExpired(document, now))) return true;
  const registrationExpiry = staff?.professionalProfile?.registration?.expiresAt;
  return Boolean(!documents.length && registrationExpiry && new Date(registrationExpiry) <= now);
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
    if (service.category === 'boarding_hotel') {
      enabled.add('boarding_staff');
      enabled.add('boarding_specialist');
    }
  }
  return [...enabled];
};

const toMinutes = value => {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};

const getProfessionalVerificationStatus = (staff, now = new Date()) => {
  const profile = staff?.professionalProfile;
  const verification = profile?.verification;
  const requiresVerification = requiresPlatformVerification(staff) || Boolean(verification?.isRequired);
  const currentDocuments = currentCredentialDocuments(staff);
  const hasCurrentCredential = hasCurrentVerifiedProfessionalCredential(staff, now);
  const hasExpiredRequiredCredential = hasExpiredRequiredProfessionalCredential(staff, now);
  if (!verification) {
    if (hasExpiredRequiredCredential) return 'expired';
    return requiresVerification && hasTrustedLegacyProfessionalVerification(staff)
      ? 'verified'
      : 'pending_verification';
  }
  if (verification.status === 'suspended') return 'suspended';
  if (verification.status === 'rejected') return 'rejected';
  // Credential validity is derived from the current approved evidence. This
  // also repairs stale profile badges left as pending/expired after a newer
  // credential was approved, without bypassing an explicit suspension or
  // rejection decision.
  if (hasCurrentCredential) return 'verified';
  if (verification.status === 'pending_verification' && !currentDocuments.length && !hasExpiredRequiredCredential && hasTrustedLegacyProfessionalVerification(staff)) {
    return 'verified';
  }
  if (verification.status === 'verified') {
    // Preserve pre-document-workflow accounts that were already explicitly
    // approved, unless their stored registration itself is expired. New
    // approvals are guarded by the controller and require current evidence.
    if (!requiresVerification || (!currentDocuments.length && !hasExpiredRequiredCredential)) {
      return 'verified';
    }
    return hasExpiredRequiredCredential ? 'expired' : 'pending_verification';
  }
  if (verification.status === 'expired' || (!hasCurrentCredential && hasExpiredRequiredCredential)) return 'expired';
  return verification.status || 'pending_verification';
};

const isProfessionallyAssignable = (staff, now = new Date()) => {
  const status = getProfessionalVerificationStatus(staff, now);
  if (requiresPlatformVerification(staff)) return status === 'verified';
  const verification = staff?.professionalProfile?.verification;
  if (!verification) return true;
  if (['expired', 'suspended'].includes(status)) return false;
  return !verification.isRequired || status === 'verified';
};

const isWithinStaffSchedule = (staff, bookingDate, startTime, endTime) => {
  const profile = staff?.professionalProfile;
  const availability = profile?.availability;
  const appointment = new Date(bookingDate);
  if (profile?.emergencyUnavailable?.active) return false;
  if (profile?.temporaryUnavailable?.active) {
    const until = profile.temporaryUnavailable.until ? new Date(profile.temporaryUnavailable.until) : null;
    if (!until || appointment <= until) return false;
  }
  const appointmentStart = new Date(appointment); appointmentStart.setHours(0, 0, 0, 0);
  const appointmentEnd = new Date(appointment); appointmentEnd.setHours(23, 59, 59, 999);
  if ((profile?.leaveSchedule || []).some(leave => {
    const leaveStart = new Date(leave.startDate); leaveStart.setHours(0, 0, 0, 0);
    const leaveEnd = new Date(leave.endDate); leaveEnd.setHours(23, 59, 59, 999);
    return appointmentStart <= leaveEnd && appointmentEnd >= leaveStart;
  })) return false;
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
  PLATFORM_VERIFIED_SPECIALIST_ROLES,
  getEnabledSpecializedRoles,
  isLaboratoryService,
  getStaffSpecializationRole,
  isRoleEligibleForService,
  isWithinStaffSchedule,
  getProfessionalVerificationStatus,
  isProfessionallyAssignable,
  requiresPlatformVerification,
  hasTrustedLegacyProfessionalVerification,
  hasCurrentVerifiedProfessionalCredential,
  hasExpiredRequiredProfessionalCredential,
  isCredentialApplicableToRole,
  isCredentialExpired
};
