const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Store = require('../models/Store');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { assignBookingStaff } = require('../controllers/bookingController');

const runProposalRequest = async ({ bookingStatus = 'pending', authorized = true } = {}) => {
  const ids = {
    booking: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    owner: new mongoose.Types.ObjectId(),
    outsider: new mongoose.Types.ObjectId(),
    service: new mongoose.Types.ObjectId(),
    store: new mongoose.Types.ObjectId(),
    staff: new mongoose.Types.ObjectId()
  };
  const booking = {
    _id: ids.booking,
    customer: ids.customer,
    addedBy: ids.owner,
    service: ids.service,
    store: { _id: ids.store, owner: ids.owner },
    staff: null,
    pet: { name: 'Milo', type: 'Dog', size: 'Small' },
    bookingDate: new Date('2030-09-28T00:00:00.000Z'),
    startTime: '09:00',
    endTime: '10:00',
    isHomeService: false,
    selectedAddOns: [],
    selectedConditions: [],
    staffAssignmentHistory: [],
    lifecycle: {},
    proposal: { revision: 0, specialInstructions: '' },
    status: bookingStatus,
    isDeleted: false,
    saveCount: 0,
    async save() { this.saveCount += 1; return this; },
    async populate() { return this; }
  };
  const service = {
    _id: ids.service,
    store: ids.store,
    name: 'General Pet Vaccination',
    category: 'health_wellness',
    price: 300,
    duration: 60,
    bufferTime: 0,
    assignedStaff: [ids.staff],
    pricingRules: {},
    addOns: [],
    isActive: true,
    isDeleted: false
  };
  const store = {
    _id: ids.store,
    owner: ids.owner,
    isActive: true,
    isDeleted: false,
    verificationStatus: 'verified',
    bookingSettings: { confirmationWindowMinutes: 1440 }
  };
  const staff = {
    _id: ids.staff,
    role: 'veterinarian',
    store: ids.store,
    firstName: 'Vet',
    lastName: 'Staff',
    isActive: true,
    isDeleted: false,
    staffStatus: 'active',
    professionalProfile: {
      professionalTitle: 'Veterinarian',
      specialty: 'General Care',
      verification: { status: 'verified', isRequired: true },
      credentialDocuments: [],
      availability: {}
    }
  };

  const originals = {
    bookingFindById: Booking.findById,
    bookingFind: Booking.find,
    bookingCountDocuments: Booking.countDocuments,
    bookingAggregate: Booking.aggregate,
    serviceFindById: Service.findById,
    storeFindById: Store.findById,
    userFindById: User.findById,
    notificationSave: Notification.prototype.save
  };
  let bookingFindByIdCalls = 0;
  let notificationsSaved = 0;
  const populatedQuery = {
    populate() { return this; },
    then(resolve) { return Promise.resolve(resolve(booking)); }
  };

  Booking.findById = () => {
    bookingFindByIdCalls += 1;
    return bookingFindByIdCalls === 1 ? booking : populatedQuery;
  };
  Booking.find = async () => [];
  Booking.countDocuments = async () => 0;
  Booking.aggregate = async () => [];
  Service.findById = async () => service;
  Store.findById = async () => store;
  User.findById = () => ({ select: async () => staff });
  Notification.prototype.save = async function save() {
    notificationsSaved += 1;
    return this;
  };

  const response = { statusCode: 200, body: null };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; }
  };
  const req = {
    params: { id: String(ids.booking) },
    body: {
      staffId: String(ids.staff),
      estimatedDurationMinutes: 60,
      specialInstructions: 'Bring the vaccination record.'
    },
    user: {
      _id: authorized ? ids.owner : ids.outsider,
      role: 'store_owner',
      permissions: {}
    },
    app: { get: () => null }
  };

  try {
    await assignBookingStaff(req, res);
    return { response, booking, notificationsSaved, ids };
  } finally {
    Booking.findById = originals.bookingFindById;
    Booking.find = originals.bookingFind;
    Booking.countDocuments = originals.bookingCountDocuments;
    Booking.aggregate = originals.bookingAggregate;
    Service.findById = originals.serviceFindById;
    Store.findById = originals.storeFindById;
    User.findById = originals.userFindById;
    Notification.prototype.save = originals.notificationSave;
  }
};

test('store proposal confirmation resolves verified staff and persists the transition', async () => {
  const { response, booking, notificationsSaved, ids } = await runProposalRequest();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.message, 'Staff assigned and booking preview sent to the customer.');
  assert.equal(booking.status, 'awaiting_customer_confirmation');
  assert.equal(String(booking.staff), String(ids.staff));
  assert.equal(booking.staffRoleSnapshot, 'veterinarian');
  assert.equal(booking.proposal.revision, 1);
  assert.equal(booking.saveCount, 1);
  assert.equal(notificationsSaved, 1);
  assert.equal(response.body.specialistRecommendation.score > 0, true);
});

test('proposal confirmation rejects an invalid booking state before writing or notifying', async () => {
  const { response, booking, notificationsSaved } = await runProposalRequest({ bookingStatus: 'completed' });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.message, 'Staff assignment is closed for this booking.');
  assert.equal(booking.saveCount, 0);
  assert.equal(notificationsSaved, 0);
});

test('proposal confirmation rejects a different store owner before writing or notifying', async () => {
  const { response, booking, notificationsSaved } = await runProposalRequest({ authorized: false });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.message, 'Only the store owner or authorized booking staff can assign service staff.');
  assert.equal(booking.saveCount, 0);
  assert.equal(notificationsSaved, 0);
});
