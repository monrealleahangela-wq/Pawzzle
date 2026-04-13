const mongoose = require('mongoose');
require('dotenv').config();
const StoreApplication = require('../models/StoreApplication');

async function checkApps() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    console.log('\n--- StoreApplication Collection Check ---');
    const totalCount = await StoreApplication.countDocuments({});
    console.log('Total Records (No Filters):', totalCount);
    
    const statusCounts = await StoreApplication.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    console.log('\nStatus Breakdown:', JSON.stringify(statusCounts, null, 2));
    
    const isDeletedCounts = await StoreApplication.aggregate([
      { $group: { _id: "$isDeleted", count: { $sum: 1 } } }
    ]);
    console.log('\nisDeleted Breakdown:', JSON.stringify(isDeletedCounts, null, 2));

    const latest = await StoreApplication.find({}).sort({ createdAt: -1 }).limit(5).select('businessName status isDeleted createdAt');
    console.log('\nLatest 5 Records:', JSON.stringify(latest, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkApps();
