const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for superadmin bootstrap`);
  return value;
};

const validatePassword = password => {
  if (password.length < 12 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(password)) {
    throw new Error('SUPERADMIN_PASSWORD must be at least 12 characters and include upper, lower, numeric, and symbol characters');
  }
};

async function bootstrapSuperAdmin() {
  const mongoUri = required('MONGODB_URI');
  const email = required('SUPERADMIN_EMAIL').toLowerCase();
  const username = required('SUPERADMIN_USERNAME');
  const password = required('SUPERADMIN_PASSWORD');
  validatePassword(password);

  await mongoose.connect(mongoUri);
  const existing = await User.findOne({ role: 'super_admin', isDeleted: false }).select('_id');
  if (existing) {
    console.log('Superadmin bootstrap skipped: an active superadmin already exists.');
    return;
  }

  const lockToken = crypto.randomUUID();
  const locks = mongoose.connection.collection('system_bootstrap_locks');
  let acquired = false;

  try {
    await locks.insertOne({ _id: 'super_admin', token: lockToken, status: 'in_progress', createdAt: new Date() });
    acquired = true;

    const concurrentAdmin = await User.findOne({ role: 'super_admin', isDeleted: false }).select('_id');
    if (concurrentAdmin) throw new Error('A superadmin was created by another bootstrap process');

    const superAdmin = new User({
      username,
      email,
      password,
      role: 'super_admin',
      firstName: process.env.SUPERADMIN_FIRST_NAME?.trim() || 'Pawzzle',
      lastName: process.env.SUPERADMIN_LAST_NAME?.trim() || 'Administrator',
      isActive: true,
      requiresPasswordChange: process.env.SUPERADMIN_REQUIRE_PASSWORD_CHANGE !== 'false'
    });
    await superAdmin.save();
    await locks.updateOne(
      { _id: 'super_admin', token: lockToken },
      { $set: { status: 'completed', completedAt: new Date(), userId: superAdmin._id } }
    );
    console.log('Superadmin bootstrap completed successfully. Credentials were not logged.');
  } catch (error) {
    if (acquired) await locks.deleteOne({ _id: 'super_admin', token: lockToken, status: 'in_progress' });
    if (error?.code === 11000) {
      throw new Error('Superadmin bootstrap is already running or has already completed');
    }
    throw error;
  }
}

bootstrapSuperAdmin()
  .catch(error => {
    console.error(`Superadmin bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
