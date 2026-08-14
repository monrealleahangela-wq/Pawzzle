const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

async function removeLegacyPlaintextPasswords() {
  if (process.env.ALLOW_PLAINTEXT_PASSWORD_CLEANUP !== 'true') {
    throw new Error('Set ALLOW_PLAINTEXT_PASSWORD_CLEANUP=true to remove legacy plainPassword fields');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

  await mongoose.connect(process.env.MONGODB_URI);
  const result = await User.updateMany(
    { plainPassword: { $exists: true } },
    { $unset: { plainPassword: 1 } }
  );
  console.log(`Removed legacy plaintext password fields from ${result.modifiedCount} account(s).`);
}

removeLegacyPlaintextPasswords()
  .catch(error => {
    console.error(`Password cleanup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
