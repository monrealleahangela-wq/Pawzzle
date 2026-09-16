/*
 * Safe, opt-in audit for stores created before authoritative tax verification.
 * Default mode is read-only. Pass --apply to mark only missing profiles as
 * unverified; this never infers VAT/Non-VAT status and never changes orders.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Store = require('../models/Store');

const run = async () => {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const filter = {
    $or: [
      { taxProfile: { $exists: false } },
      { 'taxProfile.verificationStatus': { $exists: false } }
    ]
  };
  const count = await Store.countDocuments(filter);
  console.log(`${count} store(s) have no authoritative tax verification profile.`);
  if (apply && count) {
    const result = await Store.updateMany(filter, {
      $set: {
        'taxProfile.verificationStatus': 'unverified',
        'taxProfile.verifiedTaxStatus': null,
        'taxConfiguration.isConfigured': false
      }
    });
    console.log(`Marked ${result.modifiedCount} store(s) unverified. No tax status was inferred.`);
  } else if (!apply) {
    console.log('Dry run only. Re-run with --apply after reviewing the count.');
  }
  await mongoose.disconnect();
};

run().catch(async error => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
