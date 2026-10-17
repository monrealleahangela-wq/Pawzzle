const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;

const validateIsolatedTarget = uri => {
  const parsed = new URL(uri);
  const database = parsed.pathname.replace(/^\//, '').split('/')[0];
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
      || parsed.port !== '27018'
      || !/^pawzzle_qr_checkin_test_[a-z0-9]+$/i.test(database)
      || parsed.searchParams.get('replicaSet') !== 'pawzzleTestRS') {
    throw new Error('QR check-in integration tests require the dedicated loopback pawzzleTestRS database.');
  }
  return database;
};

test('reservation credential persistence, verify/confirm, and concurrent replay are transactional', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is unset; real database test skipped'
}, async () => {
  const databaseName = validateIsolatedTarget(configuredUri);
  const previousEncryptionKey = process.env.RESERVATION_CREDENTIAL_ENCRYPTION_KEY;
  // Prefer a caller-provided local test key so this isolated flow can verify its
  // configured key. Otherwise create an ephemeral key that never leaves process memory.
  if (!previousEncryptionKey) process.env.RESERVATION_CREDENTIAL_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
  const Booking = require('../models/Booking');
  const Store = require('../models/Store');
  const Service = require('../models/Service');
  const User = require('../models/User');
  const ReservationCredential = require('../models/ReservationCredential');
  const ReservationCheckInEvent = require('../models/ReservationCheckInEvent');
  const bookingController = require('../controllers/bookingController');
  const service = require('../services/reservationCheckInService');
  const { getCheckInWindow } = require('../utils/reservationCheckIn');
  const invokeController = async (handler, req) => {
    const response = { statusCode: 200, headers: {}, body: null };
    const res = {
      set(name, value) { response.headers[name] = value; return this; },
      status(value) { response.statusCode = value; return this; },
      json(value) { response.body = value; return this; }
    };
    await handler(req, res);
    return response;
  };
  let safeTargetVerified = false;

  try {
    // Mongoose may auto-create model collections on connect. Verify freshness
    // with a read-only driver connection before allowing those writes.
    const preflight = new mongoose.mongo.MongoClient(configuredUri, { serverSelectionTimeoutMS: 5000 });
    try {
      await preflight.connect();
      const hello = await preflight.db('admin').command({ hello: 1 });
      assert.equal(hello.setName, 'pawzzleTestRS');
      assert.equal(hello.isWritablePrimary, true);
      assert.ok(['127.0.0.1:27018', 'localhost:27018', '::1:27018'].includes(hello.me || hello.primary));
      const databases = await preflight.db('admin').admin().listDatabases({ nameOnly: true });
      assert.equal(databases.databases.some(entry => entry.name === databaseName), false, 'suite-owned test database must be new before cleanup is enabled');
    } finally {
      await preflight.close();
    }
    await mongoose.connect(configuredUri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
    safeTargetVerified = true;

    await Promise.all([Booking, Store, Service, User, ReservationCredential, ReservationCheckInEvent].map(model => model.syncIndexes()));
    const ownerId = new ObjectId();
    const staffId = new ObjectId();
    const customerId = new ObjectId();
    const storeId = new ObjectId();
    const serviceId = new ObjectId();
    const bookingId = new ObjectId();
    const otherStoreId = new ObjectId();
    const otherStaffId = new ObjectId();
    const unassignedStaffId = new ObjectId();
    const localParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    const localDate = `${localParts.year}-${localParts.month}-${localParts.day}`;
    const startMinutes = Number(localParts.hour) * 60 + Number(localParts.minute);
    const endMinutes = (startMinutes + 60) % 1440;
    const endDate = endMinutes < startMinutes ? new Date(Date.parse(`${localDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : localDate;
    const time = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

    await User.collection.insertMany([
      { _id: ownerId, username: `owner-${ownerId}`, firstName: 'Synthetic', lastName: 'Owner', email: `owner-${ownerId}@test.invalid`, role: 'store_owner', store: storeId, isActive: true, isDeleted: false },
      { _id: staffId, username: `staff-${staffId}`, firstName: 'Synthetic', lastName: 'Staff', email: `staff-${staffId}@test.invalid`, role: 'service_staff', store: storeId, isActive: true, isDeleted: false },
      { _id: unassignedStaffId, username: `unassigned-${unassignedStaffId}`, firstName: 'Unassigned', lastName: 'Staff', email: `unassigned-${unassignedStaffId}@test.invalid`, role: 'service_staff', store: storeId, isActive: true, isDeleted: false },
      { _id: customerId, username: `customer-${customerId}`, firstName: 'Synthetic', lastName: 'Customer', email: `customer-${customerId}@test.invalid`, role: 'customer', isActive: true, isDeleted: false },
      { _id: otherStaffId, username: `other-${otherStaffId}`, firstName: 'Other', lastName: 'Store', email: `other-${otherStaffId}@test.invalid`, role: 'service_staff', store: otherStoreId, isActive: true, isDeleted: false }
    ]);
    await Store.collection.insertMany([
      { _id: storeId, owner: ownerId, name: 'Synthetic Verified Store', slug: `synthetic-${storeId}`, description: 'Test fixture only', businessType: 'grooming', operationalModules: ['services'], isActive: true, isDeleted: false, verificationStatus: 'verified', hrSettings: { timezone: 'Asia/Manila' } },
      { _id: otherStoreId, owner: ownerId, name: 'Other Synthetic Store', slug: `other-${otherStoreId}`, description: 'Test fixture only', businessType: 'grooming', operationalModules: ['services'], isActive: true, isDeleted: false, verificationStatus: 'verified' }
    ]);
    await Service.collection.insertOne({ _id: serviceId, name: 'Synthetic Grooming', description: 'Test fixture only', store: storeId, addedBy: ownerId, category: 'grooming', subCategory: 'grooming', duration: 60, price: 1, assignedStaff: [staffId], isActive: true, isDeleted: false });
    await Booking.collection.insertOne({
      _id: bookingId, customer: customerId, addedBy: ownerId, service: serviceId, staff: staffId, store: storeId,
      pet: { name: 'Synthetic Pet', type: 'Dog' }, bookingDate: new Date(`${localDate}T00:00:00.000Z`), bookingLocalDate: localDate,
      startTime: time(startMinutes), endTime: time(endMinutes), status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'paymongo',
      paymentDetails: { paymentId: `synthetic-payment-${bookingId}` }, totalPrice: 1, isScanned: false, serviceProgress: { status: 'scheduled' },
      proposal: { revision: 1 }, isDeleted: false
    });

    const insertBooking = async (id, overrides = {}) => Booking.collection.insertOne({
      _id: id, customer: customerId, addedBy: ownerId, service: serviceId, staff: staffId, store: storeId,
      pet: { name: 'Synthetic Pet', type: 'Dog' }, bookingDate: new Date(`${localDate}T00:00:00.000Z`), bookingLocalDate: localDate,
      startTime: time(startMinutes), endTime: time(endMinutes), status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'paymongo',
      paymentDetails: { paymentId: `synthetic-payment-${id}` }, totalPrice: 1, isScanned: false, serviceProgress: { status: 'scheduled' },
      proposal: { revision: 1 }, isDeleted: false, ...overrides
    });

    const first = await service.issueForBooking(bookingId);
    const repeated = await service.issueForBooking(bookingId);
    assert.equal(first.eligible, true);
    assert.deepEqual(repeated.credential, first.credential, 'refresh/retry returns same credential');
    assert.equal(await ReservationCredential.countDocuments({ booking: bookingId, active: true }), 1);
    const stored = await ReservationCredential.findOne({ booking: bookingId }).select('+encryptedQr +encryptedBackup +qrDigest +backupDigest').lean();
    assert.ok(!JSON.stringify(stored).includes(first.credential.qrToken));
    assert.ok(!JSON.stringify(stored).includes(first.credential.backupCode));
    const credentialIndexes = await ReservationCredential.collection.indexes();
    assert.ok(credentialIndexes.some(index => index.unique && index.key.qrDigest === 1));
    assert.ok(credentialIndexes.some(index => index.unique && index.key.backupDigest === 1));
    assert.equal(Object.hasOwn(await Booking.findById(bookingId).lean(), 'qrCode'), false, 'generic booking reads omit legacy QR material');

    const owner = { _id: ownerId, role: 'store_owner', store: storeId };
    const customerView = await invokeController(bookingController.getReservationCredential, {
      params: { id: String(bookingId) }, user: { _id: customerId }
    });
    assert.equal(customerView.statusCode, 200);
    assert.equal(customerView.headers['Cache-Control'], 'private, no-store, max-age=0');
    assert.deepEqual(customerView.body.credential, first.credential);
    const redisplayed = await invokeController(bookingController.getReservationCredential, {
      params: { id: String(bookingId) }, user: { _id: customerId }
    });
    assert.deepEqual(redisplayed.body.credential, first.credential, 'customer reopen returns the same credentials');
    const unauthorizedCustomer = await invokeController(bookingController.getReservationCredential, {
      params: { id: String(bookingId) }, user: { _id: otherStaffId }
    });
    assert.equal(unauthorizedCustomer.statusCode, 403);

    const staff = { _id: staffId, role: 'service_staff', store: storeId };
    const bookingWindow = getCheckInWindow(await Booking.findById(bookingId).lean(), 'Asia/Manila');
    await assert.rejects(() => service.verifyCredential({
      secret: first.credential.qrToken,
      method: 'qr',
      actor: staff,
      now: new Date(bookingWindow.opensAt.getTime() - 1)
    }), error => error.code === 'too_early'
      && /Check-in is not yet available\. Your appointment is scheduled for .+ at .+\. Please return during your scheduled appointment\./.test(error.message));
    await assert.rejects(() => service.verifyCredential({
      secret: first.credential.qrToken,
      method: 'qr',
      actor: staff,
      now: new Date(bookingWindow.closesAt.getTime() + 1)
    }), error => error.code === 'window_expired');
    await assert.rejects(() => service.verifyCredential({
      secret: first.credential.qrToken,
      method: 'qr',
      actor: { _id: unassignedStaffId, role: 'service_staff', store: storeId }
    }), error => error.statusCode === 404, 'same-store unassigned staff cannot verify the reservation');
    const verified = await invokeController(bookingController.validateBookingQR, {
      body: { credential: first.credential.qrToken, method: 'qr' }, user: staff
    });
    assert.equal(verified.statusCode, 200, 'authorized assigned staff can verify through the controller endpoint');
    assert.equal(verified.body.verification.bookingId, String(bookingId));
    assert.equal(JSON.stringify(verified.body).includes(first.credential.qrToken), false);
    assert.equal(JSON.stringify(verified.body).includes(first.credential.backupCode), false);
    assert.equal((await Booking.findById(bookingId).lean()).isScanned, false, 'verify endpoint does not mutate check-in state');
    await assert.rejects(() => service.verifyCredential({ secret: first.credential.backupCode, method: 'backup_code', actor: { _id: otherStaffId, role: 'service_staff', store: otherStoreId } }), error => error.statusCode === 404);

    const concurrent = await Promise.allSettled([
      service.confirmCheckIn({ secret: first.credential.qrToken, method: 'qr', actor: owner, expectedBookingId: bookingId }),
      service.confirmCheckIn({ secret: first.credential.qrToken, method: 'qr', actor: owner, expectedBookingId: bookingId })
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    const checkedBooking = await Booking.findById(bookingId).lean();
    assert.equal(checkedBooking.isScanned, true);
    assert.ok(checkedBooking.checkedInAt);
    assert.equal(checkedBooking.checkInMethod, 'qr');
    assert.equal(await ReservationCredential.countDocuments({ booking: bookingId, active: true }), 0);
    assert.equal(await ReservationCheckInEvent.countDocuments({ booking: bookingId, outcome: 'checked_in' }), 1);

    await assert.rejects(() => service.confirmCheckIn({ secret: first.credential.qrToken, method: 'qr', actor: owner, expectedBookingId: bookingId }), error => error.statusCode === 409);

    const backupBookingId = new ObjectId();
    await insertBooking(backupBookingId);
    const backupBookingCredentials = await service.issueForBooking(backupBookingId);
    const backupCheckedIn = await invokeController(bookingController.checkInBooking, {
      params: { id: String(backupBookingId) },
      body: { credential: backupBookingCredentials.credential.backupCode, method: 'backup_code' },
      user: staff,
      app: { get: () => null }
    });
    assert.equal(backupCheckedIn.statusCode, 200, 'manual backup code is accepted through the check-in endpoint');
    assert.equal(backupCheckedIn.body.bookingId, String(backupBookingId));
    assert.ok(backupCheckedIn.body.checkedInAt);
    assert.equal((await Booking.findById(backupBookingId).lean()).checkInMethod, 'backup_code');

    const rescheduledBookingId = new ObjectId();
    await insertBooking(rescheduledBookingId);
    const beforeReschedule = await service.issueForBooking(rescheduledBookingId);
    await Booking.collection.updateOne({ _id: rescheduledBookingId }, { $set: { startTime: time((startMinutes + 1) % 1440), proposal: { revision: 2 } } });
    const afterReschedule = await service.issueForBooking(rescheduledBookingId);
    assert.notEqual(afterReschedule.credential.qrToken, beforeReschedule.credential.qrToken);
    assert.equal(await ReservationCredential.countDocuments({ booking: rescheduledBookingId, active: true }), 1);
    await assert.rejects(() => service.verifyCredential({ secret: beforeReschedule.credential.qrToken, method: 'qr', actor: owner }), error => error.statusCode === 409);

    const cancelledBookingId = new ObjectId();
    await insertBooking(cancelledBookingId);
    const cancelledCredential = await service.issueForBooking(cancelledBookingId);
    await Booking.collection.updateOne({ _id: cancelledBookingId }, { $set: { status: 'cancelled' } });
    await service.revokeForBooking(cancelledBookingId);
    assert.equal(await ReservationCredential.countDocuments({ booking: cancelledBookingId, active: true }), 0);
    await assert.rejects(() => service.verifyCredential({ secret: cancelledCredential.credential.qrToken, method: 'qr', actor: owner }), error => error.statusCode === 409);

    const rollbackBookingId = new ObjectId();
    await insertBooking(rollbackBookingId);
    const rollbackCredentials = await service.issueForBooking(rollbackBookingId);
    const originalAuditCreate = ReservationCheckInEvent.create;
    ReservationCheckInEvent.create = function failCheckInAudit(documents, ...args) {
      if (Array.isArray(documents) && documents[0]?.outcome === 'checked_in') throw new Error('synthetic audit failure');
      return originalAuditCreate.call(this, documents, ...args);
    };
    try {
      await assert.rejects(() => service.confirmCheckIn({ secret: rollbackCredentials.credential.qrToken, method: 'qr', actor: owner, expectedBookingId: rollbackBookingId }), error => error.statusCode === 503);
    } finally {
      ReservationCheckInEvent.create = originalAuditCreate;
    }
    assert.equal((await Booking.findById(rollbackBookingId).lean()).isScanned, false, 'failed audit write rolls booking mutation back');
    assert.equal(await ReservationCredential.countDocuments({ booking: rollbackBookingId, active: true }), 1, 'failed audit write leaves the credential usable');

    const inactiveBookingId = new ObjectId();
    await insertBooking(inactiveBookingId, { status: 'awaiting_payment', paymentStatus: 'pending' });
    assert.equal((await service.issueForBooking(inactiveBookingId)).eligible, false);
  } finally {
    if (safeTargetVerified) await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
    if (previousEncryptionKey === undefined) delete process.env.RESERVATION_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.RESERVATION_CREDENTIAL_ENCRYPTION_KEY = previousEncryptionKey;
    // Keeps the verified target name explicit for review and guards future edits.
    assert.match(databaseName, /^pawzzle_qr_checkin_test_/i);
  }
});
