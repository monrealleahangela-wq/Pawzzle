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

const DEFAULT_STORE_TIMEZONE = 'Asia/Manila';
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const formatterCache = new Map();

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

// Historical staff records can predate the lifecycle fields introduced by
// Staff Management. Missing values retain the old active default, while every
// explicit inactive state remains authoritative.
const isActiveStaffAccount = staff => Boolean(staff)
  && staff.isDeleted !== true
  && staff.isActive !== false
  && !['inactive', 'suspended', 'archived'].includes(staff.staffStatus);

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
  const match = String(value || '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const bookingDateKey = value => {
  let key = '';
  if (typeof value === 'string') key = value.slice(0, 10);
  else if (value instanceof Date && !Number.isNaN(value.getTime())) key = value.toISOString().slice(0, 10);
  else if (value?.toISOString) {
    try { key = value.toISOString().slice(0, 10); } catch (_) { return null; }
  }
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return key;
};

const timezoneFrom = value => {
  const configured = typeof value === 'string' ? value : value?.hrSettings?.timezone;
  const timezone = configured || DEFAULT_STORE_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return { valid: true, timezone };
  } catch (_) {
    return { valid: false, timezone };
  }
};

const formatterFor = timezone => {
  if (!formatterCache.has(timezone)) formatterCache.set(timezone, new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }));
  return formatterCache.get(timezone);
};

const wallParts = (instant, timezone) => formatterFor(timezone).formatToParts(instant).reduce((parts, part) => {
  if (part.type !== 'literal') parts[part.type] = Number(part.value);
  return parts;
}, {});

// Resolve a Store-local wall clock into one unambiguous UTC instant. Sampling
// offsets around the target covers IANA daylight-saving transitions without
// assuming that the server host shares the Store timezone.
const resolveLocalInstant = (dateKey, time, timezone) => {
  const minutes = toMinutes(time);
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || minutes === null) return { valid: false, reason: 'invalid_schedule_configuration' };
  const target = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0
  };
  const naiveUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const offsets = new Set();
  for (let hours = -48; hours <= 48; hours += 6) {
    const probeMs = naiveUtc + hours * 60 * 60 * 1000;
    const parts = wallParts(new Date(probeMs), timezone);
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    offsets.add(Math.round((representedUtc - probeMs) / 60000));
  }
  const candidates = [...offsets].map(offset => new Date(naiveUtc - offset * 60000)).filter(candidate => {
    const parts = wallParts(candidate, timezone);
    return parts.year === target.year && parts.month === target.month && parts.day === target.day
      && parts.hour === target.hour && parts.minute === target.minute && parts.second === 0;
  });
  const unique = [...new Map(candidates.map(candidate => [candidate.getTime(), candidate])).values()];
  if (unique.length !== 1) return {
    valid: false,
    reason: 'invalid_schedule_configuration',
    detail: unique.length ? 'ambiguous_local_time' : 'nonexistent_local_time'
  };
  return { valid: true, instant: unique[0] };
};

const getBookingScheduleContext = (bookingDate, startTime, endTime, storeOrTimezone) => {
  const dateKey = bookingDateKey(bookingDate);
  const timezoneResult = timezoneFrom(storeOrTimezone);
  const startMinutes = toMinutes(startTime), endMinutes = toMinutes(endTime);
  if (!dateKey || !timezoneResult.valid || startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return { valid: false, reason: 'invalid_schedule_configuration', dateKey, timezone: timezoneResult.timezone };
  }
  const start = resolveLocalInstant(dateKey, startTime, timezoneResult.timezone);
  const end = resolveLocalInstant(dateKey, endTime, timezoneResult.timezone);
  if (!start.valid || !end.valid || start.instant >= end.instant) {
    return { valid: false, reason: 'invalid_schedule_configuration', dateKey, timezone: timezoneResult.timezone };
  }
  const dayNumber = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return {
    valid: true,
    dateKey,
    timezone: timezoneResult.timezone,
    dayKey: DAY_NAMES[dayNumber],
    startMinutes,
    endMinutes,
    startAt: start.instant,
    endAt: end.instant
  };
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
  if (verification.status === 'pending_verification' && !currentDocuments.length && !hasExpiredRequiredCredential && hasTrustedLegacyProfessionalVerification(staff)) {
    return 'verified';
  }
  if (verification.status === 'verified') {
    // Preserve pre-document-workflow accounts that were already explicitly
    // approved, unless their stored registration itself is expired. New
    // approvals are guarded by the controller and require current evidence.
    if (hasCurrentCredential || !requiresVerification || (!currentDocuments.length && !hasExpiredRequiredCredential)) {
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

const evaluateStaffSchedule = (staff, bookingDate, startTime, endTime, storeOrTimezone) => {
  const profile = staff?.professionalProfile;
  const availability = profile?.availability;
  const context = getBookingScheduleContext(bookingDate, startTime, endTime, storeOrTimezone);
  if (!context.valid) return { eligible: false, reason: 'invalid_schedule_configuration' };
  if (profile?.emergencyUnavailable?.active) return { eligible: false, reason: 'emergency_unavailable' };
  if (profile?.temporaryUnavailable?.active) {
    const until = profile.temporaryUnavailable.until ? new Date(profile.temporaryUnavailable.until) : null;
    if (!until) return { eligible: false, reason: 'temporary_unavailable' };
    if (Number.isNaN(until.getTime())) return { eligible: false, reason: 'invalid_schedule_configuration' };
    if (context.startAt < until) return { eligible: false, reason: 'temporary_unavailable' };
  }
  if ((profile?.leaveSchedule || []).some(leave => {
    const leaveStart = bookingDateKey(leave.startDate);
    const leaveEnd = bookingDateKey(leave.endDate);
    return leaveStart && leaveEnd && leaveStart <= context.dateKey && leaveEnd >= context.dateKey;
  })) return { eligible: false, reason: 'approved_leave' };
  if ((profile?.leaveSchedule || []).some(leave => !bookingDateKey(leave.startDate) || !bookingDateKey(leave.endDate))) {
    return { eligible: false, reason: 'invalid_schedule_configuration' };
  }
  if (!availability) return { eligible: true, reason: 'eligible', context };
  const configuredDays = Object.values(availability).filter(day => day && typeof day === 'object' && typeof day.available === 'boolean');
  if (!configuredDays.length) return { eligible: true, reason: 'eligible', context }; // Preserve legacy staff without a configured schedule.
  const day = availability[context.dayKey];
  if (!day?.available) return { eligible: false, reason: 'outside_working_hours' };
  const shiftStart = toMinutes(day.start), shiftEnd = toMinutes(day.end);
  if ([shiftStart, shiftEnd].some(value => value === null) || shiftStart >= shiftEnd) {
    return { eligible: false, reason: 'invalid_schedule_configuration' };
  }
  if (context.startMinutes < shiftStart || context.endMinutes > shiftEnd) {
    return { eligible: false, reason: 'outside_working_hours' };
  }
  for (const item of day.breaks || []) {
    const breakStart = toMinutes(item.start), breakEnd = toMinutes(item.end);
    if (breakStart === null || breakEnd === null || breakStart >= breakEnd) {
      return { eligible: false, reason: 'invalid_schedule_configuration' };
    }
    if (context.startMinutes < breakEnd && context.endMinutes > breakStart) {
      return { eligible: false, reason: 'overlapping_break' };
    }
  }
  return { eligible: true, reason: 'eligible', context };
};

const isWithinStaffSchedule = (staff, bookingDate, startTime, endTime, storeOrTimezone) => (
  evaluateStaffSchedule(staff, bookingDate, startTime, endTime, storeOrTimezone).eligible
);

module.exports = {
  SPECIALIZED_STAFF_ROLES,
  VETERINARY_ROLES,
  PLATFORM_VERIFIED_SPECIALIST_ROLES,
  getEnabledSpecializedRoles,
  isLaboratoryService,
  getStaffSpecializationRole,
  isActiveStaffAccount,
  isRoleEligibleForService,
  evaluateStaffSchedule,
  isWithinStaffSchedule,
  getBookingScheduleContext,
  bookingDateKey,
  timezoneFrom,
  DEFAULT_STORE_TIMEZONE,
  getProfessionalVerificationStatus,
  isProfessionallyAssignable,
  requiresPlatformVerification,
  hasTrustedLegacyProfessionalVerification,
  hasCurrentVerifiedProfessionalCredential,
  hasExpiredRequiredProfessionalCredential,
  isCredentialApplicableToRole,
  isCredentialExpired
};
