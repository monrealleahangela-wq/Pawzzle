const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const PetServiceUpdate = require('../models/PetServiceUpdate');
const { __test } = require('../controllers/petCareController');

const id = () => new mongoose.Types.ObjectId();

test('booking communication access is owner and assignment scoped', () => {
  const customerId = id();
  const staffId = id();
  const otherStaffId = id();
  const ownerId = id();
  const storeId = id();
  const booking = {
    customer: { _id: customerId },
    staff: { _id: staffId },
    serviceProvider: null,
    store: { _id: storeId, owner: ownerId }
  };

  const customer = __test.getBookingAccess({ _id: customerId, role: 'customer' }, booking);
  assert.equal(customer.canView, true);
  assert.equal(customer.canMessage, true);
  assert.equal(customer.canPostStaffUpdate, false);
  assert.equal(customer.canViewInternal, false);

  const assigned = __test.getBookingAccess({ _id: staffId, role: 'staff', store: storeId, staffType: 'groomer' }, booking);
  assert.equal(assigned.canPostStaffUpdate, true);
  assert.equal(assigned.canViewInternal, true);

  const unrelated = __test.getBookingAccess({ _id: otherStaffId, role: 'staff', store: storeId, staffType: 'sales_staff' }, booking);
  assert.equal(unrelated.canView, false);
  assert.equal(unrelated.canPostStaffUpdate, false);

  const owner = __test.getBookingAccess({ _id: ownerId, role: 'admin' }, booking);
  assert.equal(owner.canPostStaffUpdate, true);
});

test('timeline exposes lifecycle milestones without duplicating booking records', () => {
  const startedAt = new Date('2026-08-13T02:00:00.000Z');
  const readyAt = new Date('2026-08-13T03:00:00.000Z');
  const events = __test.progressTimeline({
    paymentStatus: 'paid',
    lifecycle: { confirmedAt: new Date('2026-08-13T01:00:00.000Z') },
    serviceProgress: { startedAt, readyAt }
  });
  assert.deepEqual(events.map(event => event.stage), ['payment_completed', 'booking_confirmed', 'service_started', 'ready_for_pickup']);
});

test('service update validation keeps internal and customer-facing entry types explicit', () => {
  const base = {
    booking: id(), customer: id(), store: id(), createdBy: id(),
    petSnapshot: { name: 'Mochi', type: 'Dog' },
    stage: 'in_progress', message: 'Doing well.'
  };
  assert.equal(new PetServiceUpdate({ ...base, entryType: 'update', visibility: 'customer' }).validateSync(), undefined);
  assert.equal(new PetServiceUpdate({ ...base, entryType: 'internal_note', visibility: 'internal' }).validateSync(), undefined);
  assert.ok(new PetServiceUpdate({ ...base, visibility: 'public_to_everyone' }).validateSync());
});

test('legacy service stages normalize into the current timeline vocabulary', () => {
  assert.equal(__test.normalizeLegacyStage('admitted'), 'pet_arrived');
  assert.equal(__test.normalizeLegacyStage('ready'), 'ready_for_pickup');
  assert.equal(__test.normalizeLegacyStage('in_progress'), 'in_progress');
});
