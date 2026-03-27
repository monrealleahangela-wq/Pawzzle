require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connection SUCCESS');
    console.log('URI:', process.env.MONGODB_URI.split('@')[1] || process.env.MONGODB_URI);
    process.exit(0);
  } catch (e) {
    console.error('MongoDB Connection FAIL:', e.message);
    process.exit(1);
  }
}

testConnection();
