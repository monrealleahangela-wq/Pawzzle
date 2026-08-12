const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getEnabledSpecializedRoles,
  isRoleEligibleForService,
  isWithinStaffSchedule
} = require('../utils/staffSpecialization');

test('enables specialized roles only for services a store actually offers', () => {
  const roles = getEnabledSpecializedRoles([
    { name: 'Veterinary Consultation', category: 'health_wellness', isActive: true },
    { name: 'Full Grooming', category: 'grooming', isActive: true }
  ]);
  assert.equal(roles.includes('veterinarian'), true);
  assert.equal(roles.includes('groomer'), true);
  assert.equal(roles.includes('trainer'), false);
  assert.equal(roles.includes('veterinary_laboratory_technician'), false);
});

test('laboratory roles require an actual laboratory-related service', () => {
  const lab = { name: 'Veterinary Laboratory Testing', category: 'health_wellness' };
  const consultation = { name: 'Veterinary Consultation', category: 'health_wellness' };
  assert.equal(isRoleEligibleForService('veterinary_laboratory_technician', lab), true);
  assert.equal(isRoleEligibleForService('veterinary_laboratory_technician', consultation), false);
});

test('keeps grooming and training roles out of veterinary services', () => {
  const consultation = { name: 'Veterinary Consultation', category: 'health_wellness' };
  assert.equal(isRoleEligibleForService('groomer', consultation), false);
  assert.equal(isRoleEligibleForService('trainer', consultation), false);
});

test('checks staff shift hours without requiring schedules for legacy staff', () => {
  const monday = new Date('2026-08-17T00:00:00.000Z');
  assert.equal(isWithinStaffSchedule({}, monday, '10:00', '11:00'), true);
  const staff = { professionalProfile: { availability: {
    monday: { available: true, start: '09:00', end: '17:00', breaks: [] },
    tuesday: { available: false, start: '09:00', end: '17:00', breaks: [] }
  } } };
  assert.equal(isWithinStaffSchedule(staff, monday, '10:00', '11:00'), true);
  assert.equal(isWithinStaffSchedule(staff, monday, '17:00', '18:00'), false);
});
