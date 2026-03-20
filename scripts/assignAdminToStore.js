const mongoose = require('mongoose');
const path = require('path');
const User = require(path.join(__dirname, '..', 'models', 'User'));
const Store = require(path.join(__dirname, '..', 'models', 'Store'));

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/petshop_platform';

async function assignAdminToStore() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find the admin test account
    let adminUser = await User.findOne({ 
      $or: [
        { username: 'admintest' },
        { email: 'admin@test.com' },
        { role: 'admin', store: { $exists: false } }
      ]
    });

    if (!adminUser) {
      console.log('❌ No admin user found. Creating one...');
      // First create admin user without store
      adminUser = new User({
        username: 'admintest',
        email: 'admin@test.com',
        password: 'admin123',
        plainPassword: 'admin123',
        role: 'admin',
        firstName: 'Admin',
        lastName: 'Test',
        phone: '09123456789',
        isActive: true,
        address: {
          street: '123 Main Street',
          city: 'Manila',
          province: 'Metro Manila',
          barangay: 'Barangay 1',
          zipCode: '1000',
          country: 'Philippines'
        }
      });
      await adminUser.save();
      console.log('✅ Admin user created:', adminUser.username, '- ID:', adminUser._id);
    } else {
      console.log('✅ Admin user found:', adminUser.username, '- ID:', adminUser._id);
    }

    // Now create or find store with admin as owner
    let store = await Store.findOne({ slug: 'main-pet-store' });
    
    if (!store) {
      console.log('🏪 Creating main store...');
      store = new Store({
        owner: adminUser._id,
        name: 'Main Pet Store',
        slug: 'main-pet-store',
        description: 'Main store for pet services and products',
        businessType: 'pet_store',
        contactInfo: {
          phone: '09123456789',
          email: 'store@petshop.com',
          address: {
            street: '123 Main Street',
            city: 'Manila',
            state: 'Metro Manila',
            zipCode: '1000',
            country: 'Philippines'
          }
        },
        isActive: true
      });
      await store.save();
      console.log('✅ Store created:', store.name, '- ID:', store._id);
    } else {
      console.log('✅ Store found:', store.name, '- ID:', store._id);
    }

    // Assign store to admin if not already assigned
    if (!adminUser.store) {
      adminUser.store = store._id;
      await adminUser.save();
      console.log('✅ Store assigned to admin user');
    } else {
      console.log('✅ Admin already has store assigned');
    }

    console.log('\n📋 Final Configuration:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Admin Username:', adminUser.username);
    console.log('Admin Email:', adminUser.email);
    console.log('Admin Password: admin123');
    console.log('Admin Role:', adminUser.role);
    console.log('Store ID:', adminUser.store);
    console.log('Store Name:', store.name);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n✅ Admin test account is now ready!');
    console.log('You can now login with:');
    console.log('  Username: admintest');
    console.log('  Password: admin123');
    console.log('');
    console.log('Features now available:');
    console.log('  ✅ Manage services (/admin/services)');
    console.log('  ✅ View bookings (/admin/bookings)');
    console.log('  ✅ Manage products and pets');
    console.log('  ✅ Configure shipping settings (/admin/settings)');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

assignAdminToStore();
