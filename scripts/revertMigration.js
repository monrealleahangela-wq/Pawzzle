const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.log('MongoDB connection error:', err));

// Remove the randomly generated plainPassword from existing users
const revertMigration = async () => {
  try {
    console.log('Reverting password migration...');
    
    // Remove plainPassword field from all users
    await User.updateMany(
      {}, 
      { $unset: { plainPassword: 1 } }
    );
    
    console.log('Migration reverted successfully!');
    console.log('Existing users will now show: "Original password not stored (hashed only)"');
    process.exit(0);
  } catch (error) {
    console.error('Revert error:', error);
    process.exit(1);
  }
};

revertMigration();
