const mongoose = require('mongoose');
const User = require('../models/User'); // Path to your User model
require('dotenv').config(); // Load the Cloud DB URI from your .env
const dns = require('dns');

// Fix for MongoDB Atlas connection issues on some networks
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function seedSuperAdmin() {
  try {
    console.log('🔗 Connecting to cloud database...');
    // Ensure your .env has MONGODB_URI=mongodb+srv://...
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected successfully!');

    // Check if an admin already exists to avoid duplicates
    const existingAdmin = await User.findOne({ 
      $or: [
        { role: 'super_admin' },
        { email: 'admin@pawzzle.io' },
        { username: 'superadmin' }
      ] 
    });

    if (existingAdmin) {
      console.log('⚠️ A Super Admin with those details already exists in the database.');
      process.exit(0);
    }

    // CREATE THE SUPER ADMIN
    const superAdmin = new User({
      username: 'superadmin',
      email: 'admin@pawzzle.io',
      password: 'ChangeMe123!', // <--- CHANGE THIS BEFORE RUNNING
      role: 'super_admin',
      firstName: 'Pawzzle',
      lastName: 'Admin',
      phone: '09123456789',
      address: {
        street: 'Main Street',
        city: 'Metropolis',
        province: 'Metro Manila',
        barangay: 'Barangay 1'
      },
      isActive: true
    });

    await superAdmin.save();
    console.log('\n🏆 SUCCESS: Super Admin created successfully!');
    console.log('-------------------------------------------');
    console.log('📧 Email:    admin@pawzzle.io');
    console.log('👤 Username: superadmin');
    console.log('🔑 Password: ChangeMe123!');
    console.log('-------------------------------------------');
    console.log('\n🐾 Go to https://pawzzle.io/login to test it!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding Super Admin:', error);
    process.exit(1);
  }
}

seedSuperAdmin();
