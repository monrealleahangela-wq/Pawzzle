const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const StoreApplication = require('../models/StoreApplication');
const { submitApplication } = require('../controllers/storeApplicationController');

const uri = process.env.MONGODB_TRANSACTION_TEST_URI;
const testOnlyName = /^pawzzle_store_application_test_[a-z0-9]+$/;

const requestBody = name => ({
  businessName: name,
  registeredBusinessName: `${name} OPC`,
  natureOfBusiness: 'Pet supplies',
  businessType: 'pet_store',
  legalStructure: 'one_person_corporation',
  operationalModules: JSON.stringify(['products']),
  staffingConfiguration: JSON.stringify({ hasStaff: 'yes', staffQuantityRange: '1-5', isStaffVisibleToCustomers: true }),
  staffTypes: JSON.stringify(['inventory']),
  contactInfo: JSON.stringify({ phone: '09171234567', email: 'store@example.com', address: { street: 'Main', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', zipCode: '4114', coordinates: { lat: 14.3, lng: 120.9 } } }),
  representative: JSON.stringify({ fullName: 'Store Owner', role: 'Owner', phone: '09171234567', email: 'owner@example.com', isAuthorizedRepresentative: false }),
  businessRegistration: JSON.stringify({ authority: 'sec', certificateNumber: 'SEC-123', registeredName: `${name} OPC` }),
  taxProfile: JSON.stringify({ birRegistrationStatus: 'not_registered', registeredAddress: {} }),
  declaration: JSON.stringify({ accepted: true, applicantName: 'Store Owner' }),
  references: JSON.stringify([
    { name: 'One', business: 'One Corp', phone: '1', email: 'one@example.com' },
    { name: 'Two', business: 'Two Corp', phone: '2', email: 'two@example.com' }
  ]),
  businessDescription: 'MongoDB persistence fixture.'
});
const callSubmit = async ({ applicantId, body, files }) => {
  let statusCode = 200;
  let payload;
  const req = { user: { id: applicantId }, body, files };
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; }
  };
  await submitApplication(req, res);
  return { statusCode, payload };
};

test('Store Application submit, edit, reopen, and original-record selection persist on isolated MongoDB', { skip: !uri }, async t => {
  const parsed = new URL(uri);
  const databaseName = parsed.pathname.replace(/^\//, '');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.match(databaseName, testOnlyName);

  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  t.after(async () => {
    if (testOnlyName.test(mongoose.connection.name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.equal(hello.setName, 'pawzzleTestRS');
  assert.equal(hello.isWritablePrimary, true);

  const applicantId = new mongoose.Types.ObjectId();
  const created = await callSubmit({
    applicantId,
    body: requestBody('Original Store'),
    files: { businessRegistration: [{ path: 'secure://registration/original' }] }
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.application.businessName, 'Original Store');
  assert.equal(created.payload.application.staffingConfiguration.hasStaff, 'yes');
  assert.equal(created.payload.application.documentAvailability.businessRegistration, true);
  assert.equal(created.payload.application.businessRegistration.documentUrl, undefined);

  const original = await StoreApplication.findOne({ applicant: applicantId, applicationType: 'new_store' }).select('+businessRegistration.documentUrl');
  assert.equal(original.businessRegistration.documentUrl, 'secure://registration/original');
  original.status = 'requires_more_info';
  await original.save();

  const updated = await callSubmit({ applicantId, body: requestBody('Corrected Store'), files: {} });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.payload.application._id.toString(), original._id.toString());
  assert.equal(updated.payload.application.businessName, 'Corrected Store');
  assert.equal(await StoreApplication.countDocuments({ applicant: applicantId, applicationType: 'new_store' }), 1);

  const reopened = await StoreApplication.findById(original._id).select('+businessRegistration.documentUrl').lean();
  assert.equal(reopened.businessName, 'Corrected Store');
  assert.equal(reopened.businessRegistration.documentUrl, 'secure://registration/original');

  await StoreApplication.create({
    applicant: applicantId,
    applicationType: 'expansion',
    businessName: 'Expansion', businessType: 'pet_store', operationalModules: ['services'],
    contactInfo: { phone: '1', email: 'store@example.com' }, status: 'pending_review'
  });
  const selectedOriginal = await StoreApplication.findOne({
    applicant: applicantId,
    $or: [{ applicationType: 'new_store' }, { applicationType: { $exists: false } }],
    isDeleted: { $ne: true }
  }).sort({ updatedAt: -1, createdAt: -1 });
  assert.equal(selectedOriginal._id.toString(), original._id.toString());
});
