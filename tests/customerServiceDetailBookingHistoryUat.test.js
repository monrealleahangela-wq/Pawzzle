const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('customer service cards, search links, and router share a real service detail route', () => {
  const app = read('client/src/App.js');
  const services = read('client/src/pages/customer/Services.js');
  assert.match(app, /path="services\/:id"[\s\S]*<ServiceDetail/);
  assert.match(services, /navigate\(`\/services\/\$\{serviceId\}`\)/);
  assert.match(read('client/src/pages/customer/Search.js'), /navigate\(`\/services\/\$\{service\._id\}`\)/);
  assert.match(read('client/src/components/GlobalSearch.js'), /navigate\(`\/services\/\$\{service\._id\}`\)/);
});

test('service detail has loading, unavailable, retry, and booking entry states', () => {
  const detail = read('client/src/pages/customer/ServiceDetail.js');
  assert.match(detail, /ServiceDetailSkeleton/);
  assert.match(detail, /Service unavailable/);
  assert.match(detail, /onClick=\{loadService\}/);
  assert.match(detail, /to=\{`\/bookings\?service=\$\{service\._id\}`\}/);
});

test('public service reads reuse the verified-store and active-owner visibility source of truth', () => {
  const controller = read('controllers/serviceController.js');
  assert.match(controller, /getCustomerVisibleOwnerIds/);
  assert.match(controller, /buildCustomerVisibleStoreFilter\(ownerIds/);
  assert.match(controller, /publicStore[\s\S]*service\.toObject\(\)/);
  assert.match(controller, /error\.name === 'CastError' \? 404 : 500/);
});

test('booking history normalizes legacy records and has a route-level render fallback', () => {
  const bookings = read('client/src/pages/customer/Bookings.js');
  const app = read('client/src/App.js');
  assert.match(bookings, /normalizeBookingCollection\(response\.data\?\.bookings\)/);
  assert.match(bookings, /formatSafeDate\(booking\.bookingDate\)/);
  assert.match(bookings, /formatRecordId\(selectedBooking\._id\)/);
  assert.match(app, /pageName="customer bookings"[\s\S]*<Bookings/);
  assert.match(read('client/src/components/CustomerPageErrorBoundary.js'), /componentDidCatch/);
  assert.match(read('client/src/utils/serviceBookingForm.js'), /service = service && typeof service === 'object' \? service : \{\}/);
});

test('customer booking creation still derives store scope and sends the store notification', () => {
  const controller = read('controllers/bookingController.js');
  assert.match(controller, /customerVisibleStore/);
  assert.match(controller, /store: storeId/);
  assert.match(controller, /staff: null/);
  assert.match(controller, /notifyStoreStaff\(storeId/);
  assert.match(controller, /status\.status = 'awaiting_payment'|status = 'awaiting_payment'/);
});

test('booking list and detail reads remain customer-owned and do not widen history access', () => {
  const controller = read('controllers/bookingController.js');
  assert.match(controller, /let filter = \{ customer: req\.user\._id \}/);
  assert.match(controller, /const ownsBooking = String\(booking\.customer\?\._id \|\| booking\.customer\) === String\(req\.user\._id\)/);
  assert.match(controller, /if \(!ownsBooking && !isBookingManager\(req\.user, booking\)\) return res\.status\(403\)/);
});
