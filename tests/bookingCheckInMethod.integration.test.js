const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Booking = require('../models/Booking');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;

const isolatedUri = () => {
  if (!configuredUri) return null;
  const parsed = new URL(configuredUri);
  const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'mongodb:' || !localHost || parsed.port !== '27018'
      || parsed.searchParams.get('replicaSet') !== 'pawzzleTestRS') {
    throw new Error('Booking integration requires the dedicated loopback pawzzleTestRS instance on port 27018.');
  }
  parsed.pathname = `/pawzzle_booking_checkin_${process.pid}_${Date.now()}`;
  return parsed.toString();
};

const bookingFixture = overrides => ({
  customer: new mongoose.Types.ObjectId(),
  addedBy: new mongoose.Types.ObjectId(),
  service: new mongoose.Types.ObjectId(),
  store: new mongoose.Types.ObjectId(),
  pet: { name: 'Milo', type: 'Dog' },
  bookingDate: new Date('2030-10-20T00:00:00.000Z'),
  bookingLocalDate: '2030-10-20',
  startTime: '10:00',
  endTime: '11:00',
  paymentMethod: 'pending',
  totalPrice: 499.75,
  ...overrides
});

test('service and grooming bookings persist before check-in on isolated MongoDB', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is unset; isolated MongoDB integration skipped'
}, async () => {
  const uri = isolatedUri();
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    assert.equal(hello.setName, 'pawzzleTestRS');
    assert.equal(hello.isWritablePrimary, true);

    const voucher = new mongoose.Types.ObjectId();
    const [serviceBooking, groomingBooking] = await Booking.create([
      bookingFixture({ totalPrice: 499.75 }),
      bookingFixture({
        startTime: '13:00',
        endTime: '14:30',
        totalPrice: 875.5,
        voucher,
        discountAmount: 75,
        serviceIntake: {
          kind: 'grooming',
          details: { groomingPackage: 'Full Grooming', coatCondition: 'Healthy' }
        }
      })
    ]);

    const persisted = await Booking.find({ _id: { $in: [serviceBooking._id, groomingBooking._id] } })
      .sort({ totalPrice: 1 }).lean();
    assert.equal(persisted.length, 2);
    assert.deepEqual(persisted.map(booking => booking.totalPrice), [499.75, 875.5]);
    assert.ok(persisted.every(booking => booking.checkInMethod === null));
    assert.equal(persisted[1].serviceIntake.kind, 'grooming');
    assert.equal(String(persisted[1].voucher), String(voucher));
    assert.equal(persisted[1].discountAmount, 75);

    const invalid = new Booking(bookingFixture({ checkInMethod: 'walk_in' }));
    await assert.rejects(() => invalid.save(), /Unsupported reservation check-in method/);
    assert.equal(await Booking.countDocuments(), 2);
  } finally {
    if (mongoose.connection.readyState) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
