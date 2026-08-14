const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const User = require('../models/User');
const {
  isWithinStaffSchedule,
  isProfessionallyAssignable,
  getProfessionalVerificationStatus
} = require('../utils/staffSpecialization');
const { getExpirationWindow } = require('../services/staffCredentialMonitoringService');
const { __test: bookingTest } = require('../controllers/bookingController');
const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('professional profile schema stores verification, archived documents, and availability exceptions', () => {
  for (const schemaPath of [
    'professionalProfile.verification.status',
    'professionalProfile.verification.isRequired',
    'professionalProfile.credentialDocuments',
    'professionalProfile.leaveSchedule',
    'professionalProfile.temporaryUnavailable.active',
    'professionalProfile.emergencyUnavailable.active'
  ]) assert.ok(User.schema.path(schemaPath), schemaPath);
  const documentSchema = User.schema.path('professionalProfile.credentialDocuments').schema;
  assert.ok(documentSchema.path('archivedAt'));
  assert.ok(documentSchema.path('verifiedBy'));
  assert.ok(documentSchema.path('reminderHistory.sevenDaySentAt'));
});

test('explicit verification requirements protect future assignment while preserving legacy staff', () => {
  assert.equal(isProfessionallyAssignable({ professionalProfile: {} }), true);
  const pending = { professionalProfile: { verification: { status: 'pending_verification', isRequired: true }, credentialDocuments: [] } };
  assert.equal(isProfessionallyAssignable(pending), false);
  pending.professionalProfile.verification.status = 'verified';
  assert.equal(isProfessionallyAssignable(pending), true);
  pending.professionalProfile.verification.status = 'suspended';
  assert.equal(isProfessionallyAssignable(pending), false);
  assert.equal(getProfessionalVerificationStatus(pending), 'suspended');
});

test('expired verified credentials are not assignable when the stored badge is stale', () => {
  const staff = { professionalProfile: {
    verification: { status: 'verified', isRequired: true },
    credentialDocuments: [{ status: 'verified', expiresAt: '2026-08-01T00:00:00.000Z' }]
  } };
  assert.equal(getProfessionalVerificationStatus(staff, new Date('2026-08-14T00:00:00.000Z')), 'expired');
  assert.equal(isProfessionallyAssignable(staff, new Date('2026-08-14T00:00:00.000Z')), false);
});

test('working hours, breaks, leave, temporary unavailability, and emergencies reject assignments', () => {
  const monday = new Date('2026-08-17T00:00:00.000Z');
  const staff = { professionalProfile: {
    availability: { monday: { available: true, start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] } },
    leaveSchedule: []
  } };
  assert.equal(isWithinStaffSchedule(staff, monday, '10:00', '11:00'), true);
  assert.equal(isWithinStaffSchedule(staff, monday, '12:15', '12:45'), false);
  staff.professionalProfile.leaveSchedule = [{ startDate: monday, endDate: monday }];
  assert.equal(isWithinStaffSchedule(staff, monday, '10:00', '11:00'), false);
  staff.professionalProfile.leaveSchedule = [];
  staff.professionalProfile.temporaryUnavailable = { active: true, until: '2026-08-18T00:00:00.000Z' };
  assert.equal(isWithinStaffSchedule(staff, monday, '10:00', '11:00'), false);
  staff.professionalProfile.temporaryUnavailable.active = false;
  staff.professionalProfile.emergencyUnavailable = { active: true };
  assert.equal(isWithinStaffSchedule(staff, monday, '10:00', '11:00'), false);
});

test('credential expiry monitoring uses the required 30-day, 7-day, and expired windows', () => {
  const now = new Date('2026-08-14T00:00:00.000Z');
  assert.equal(getExpirationWindow('2026-09-13T00:00:00.000Z', now).key, 'thirty_day');
  assert.equal(getExpirationWindow('2026-08-21T00:00:00.000Z', now).key, 'seven_day');
  assert.equal(getExpirationWindow('2026-08-13T00:00:00.000Z', now).key, 'expired');
  assert.equal(getExpirationWindow('2026-09-14T00:00:00.000Z', now), null);
});

test('customer staff profiles expose verified credential facts but never internal files', () => {
  const publicStaff = bookingTest.toPublicStaff({
    _id: 'staff-1', firstName: 'Ana', lastName: 'Reyes', role: 'veterinarian', staffType: null,
    professionalProfile: {
      verification: { status: 'verified', isRequired: true },
      credentialDocuments: [{ status: 'verified', documentType: 'professional_license', name: 'Veterinarian License', issuingBody: 'PRC', credentialNumber: 'VET-100', documentUrl: 'private-url', publicId: 'private-id' }]
    }
  });
  assert.equal(publicStaff.verified, true);
  assert.equal(publicStaff.credentials[0].credentialNumber, 'VET-100');
  assert.equal('documentUrl' in publicStaff.credentials[0], false);
  assert.equal('publicId' in publicStaff.credentials[0], false);
  assert.doesNotMatch(JSON.stringify(publicStaff), /private-url|private-id/);
});

test('staff routes keep self-service narrow and verification administration protected', () => {
  const routes = source('routes/staff.js');
  assert.ok(routes.indexOf("router.get('/me/professional-profile'") < routes.indexOf('router.use(authenticate, adminOnly)'));
  assert.ok(routes.indexOf("router.patch('/me/professional-profile'") < routes.indexOf('router.use(authenticate, adminOnly)'));
  assert.ok(routes.indexOf("router.post('/:id/credentials'") > routes.indexOf('router.use(authenticate, adminOnly)'));
  assert.match(routes, /authorizeCredentialManagement, uploadDoc\.single\('document'\)/);
  const controller = source('controllers/staffController.js');
  assert.match(controller, /req\.body\.bio !== undefined/);
  assert.doesNotMatch(controller.slice(controller.indexOf('const updateMyProfessionalProfile'), controller.indexOf('const findManagedSpecialist')), /verification\.status\s*=/);
});

test('matching remains same-store, permission, qualification, availability, workload, then rating aware', () => {
  const pricing = source('utils/pricingEngine.js');
  assert.match(pricing, /String\(staff\.store\) !== String\(service\.store/);
  assert.match(pricing, /isRoleEligibleForService/);
  assert.match(pricing, /hasPermission\(staff, 'bookings\.assigned'\)/);
  assert.match(pricing, /isProfessionallyAssignable/);
  assert.match(pricing, /a\.bookingCount - b\.bookingCount/);
  assert.match(pricing, /professionalProfile\?\.rating/);
});
