const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.log('MongoDB connection error:', err));

// Function to generate test passwords for existing users
const generateTestPassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Migrate existing users to have plainPassword field
const migratePasswords = async () => {
  try {
    console.log('Starting password migration...');
    
    // Find all users without plainPassword
    const users = await User.find({ plainPassword: { $exists: false } });
    
    console.log(`Found ${users.length} users to migrate`);
    
    for (const user of users) {
      // Generate a test password for existing users
      const testPassword = generateTestPassword();
      
      // Update user with plainPassword
      await User.findByIdAndUpdate(user._id, { 
        plainPassword: testPassword 
      });
      
      console.log(`Updated user ${user.username} with password: ${testPassword}`);
    }
    
    console.log('Password migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

migratePasswords();
