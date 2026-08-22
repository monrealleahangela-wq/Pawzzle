const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  hasPermission,
  normalizeRole
} = require('../config/permissions');

const root = path.join(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('direct and legacy care-professional accounts resolve to the same backend policy', () => {
  const pairs = [
    ['veterinarian', 'veterinarian'],
    ['groomer', 'groomer'],
    ['trainer', 'trainer'],
    ['boarding_staff', 'boarding_specialist'],
    ['boarding_staff', 'boarding_staff'],
    ['veterinary_assistant', 'medical_assistant'],
    ['boarding_staff', 'pet_handler']
  ];

  for (const [directRole, legacyType] of pairs) {
    const direct = { role: directRole };
    const legacy = { role: 'staff', staffType: legacyType };
    assert.equal(normalizeRole(legacy), directRole);
    assert.equal(hasPermission(direct, 'bookings.assigned'), hasPermission(legacy, 'bookings.assigned'));
    assert.equal(hasPermission(direct, 'procurement.manage'), false);
    assert.equal(hasPermission(legacy, 'finance.manage'), false);
  }

  assert.equal(hasPermission({ role: 'veterinarian' }, 'inventory.vaccine'), true);
  assert.equal(hasPermission({ role: 'veterinarian' }, 'inventory.manage'), false);
  assert.equal(hasPermission({ role: 'store_owner' }, 'inventory.manage'), true);
});

test('assigned booking queries remain server filtered and tenant scoped', () => {
  const controller = source('controllers/adminBookingController.js');
  assert.match(controller, /getAuthorizedStoreIds\(req\.user\)/);
  assert.match(controller, /filter\.store = \{ \$in: storeIds \}/);
  assert.match(controller, /\{ staff: req\.user\._id \}/);
  assert.match(controller, /\{ serviceProvider: req\.user\._id \}/);
  assert.match(controller, /!hasPermission\(req\.user, 'bookings\.manage'\)/);
});

test('desktop and mobile navigation use the focused professional workspace', () => {
  const authorization = source('client/src/utils/authorization.js');
  const layout = source('client/src/components/Layout.js');
  const bottomNav = source('client/src/components/BottomNavBar.js');
  const focusedStart = layout.indexOf('if (isCareProfessional(user))');
  const focusedEnd = layout.indexOf('\n  const menu = [', focusedStart);
  const focusedMenu = layout.slice(focusedStart, focusedEnd);

  assert.match(authorization, /export const isCareProfessional/);
  assert.match(authorization, /boarding_specialist: 'boarding_staff'/);
  assert.match(focusedMenu, /My Work/);
  assert.match(focusedMenu, /My Professional Profile/);
  assert.match(focusedMenu, /hasUiActionPermission/);
  assert.doesNotMatch(focusedMenu, /admin\/(?:products|pets|services|staff|settings|vouchers)/);
  assert.match(focusedMenu, /can\('inventory', 'view'\).*can\('inventory', 'manage'\)/);
  assert.match(layout, /isCareProfessional\(user\) && <BottomNavBar/);
  assert.match(bottomNav, /label: 'My Work'/);
  assert.match(bottomNav, /label: 'Appointments'/);
  assert.match(bottomNav, /label: 'Profile'/);
});

test('specialized dashboard is role-aware and excludes store sales metrics', () => {
  const dashboard = source('client/src/pages/admin/Dashboard.js');
  const workspace = source('client/src/components/admin/SpecializedStaffDashboard.js');
  const labels = source('client/src/utils/staffWorkspace.js');

  assert.match(dashboard, /if \(isProfessionalWorkspace\) return <SpecializedStaffDashboard/);
  assert.match(workspace, /adminBookingService\.getAllBookings\(\{ limit: 100 \}\)/);
  assert.match(workspace, /staffService\.getMyProfessionalProfile\(\)/);
  assert.doesNotMatch(workspace, /Revenue|Sales|Payout/);
  for (const copy of ["Today's consultations", "Today's grooming jobs", "Today's sessions", 'Pets checked in', 'Departures today']) {
    assert.ok(`${workspace}\n${labels}`.includes(copy), `missing role-specific dashboard copy: ${copy}`);
  }
  assert.match(workspace, /Only bookings assigned to you are returned by the server/);
  assert.match(source('client/src/pages/admin/Dashboard.js'), /Revenue/);
});

test('assigned booking workspace retains intake, care updates, photos, and communication', () => {
  const bookings = source('client/src/pages/admin/BookingsManagement.js');
  const communication = source('client/src/components/booking/ServiceCommunicationPanel.js');

  assert.match(bookings, /ServiceIntakeSummary/);
  assert.match(bookings, /ServiceCommunicationPanel/);
  assert.match(bookings, /Assigned work only/);
  assert.match(bookings, /professionalWorkspace \? \[/);
  assert.match(bookings, /md:hidden/);
  assert.match(communication, /follow_up/);
  assert.match(communication, /servicePhotos|photo/i);
  assert.match(communication, /aftercare/i);
});

test('professional profile presents job records without exposing credential files', () => {
  const profilePage = source('client/src/pages/customer/Profile.js');
  const profile = source('client/src/components/staff/ProfessionalProfileWorkspace.js');

  assert.match(profilePage, /else if \(isSpecializedStaff\)[\s\S]*setActiveTab\('professional'\)/);
  assert.match(profilePage, /!isSpecializedStaff && !\['super_admin', 'platform_admin'\]/);
  for (const field of [
    'My professional profile', 'Staff ID', 'Professional role', 'Assigned branch',
    'Years of practice', 'Years of grooming experience', 'Working schedule', 'Professional biography', 'Languages',
    'Services handled', 'Average rating', 'Customer reviews', 'Completed services',
    'Upcoming bookings', 'License number', 'License expiration', 'Verification status'
  ]) assert.ok(profile.includes(field), `missing professional profile field: ${field}`);
  assert.doesNotMatch(profile, /documentUrl|publicId|target="_blank"/);
});

test('new professional surfaces include responsive touch targets and dark-mode states', () => {
  const combined = [
    source('client/src/components/admin/SpecializedStaffDashboard.js'),
    source('client/src/components/staff/ProfessionalProfileWorkspace.js'),
    source('client/src/pages/admin/BookingsManagement.js')
  ].join('\n');

  assert.match(combined, /min-h-11/);
  assert.match(combined, /md:hidden/);
  assert.match(combined, /dark:bg-slate-900/);
  assert.match(combined, /dark:text-white/);
});
