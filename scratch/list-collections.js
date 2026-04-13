const mongoose = require('mongoose');
require('dotenv').config();

async function listCollections() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    console.log('\n--- Collection List ---');
    const collections = await mongoose.connection.db.listCollections().toArray();
    for (let coll of collections) {
      const count = await mongoose.connection.db.collection(coll.name).countDocuments();
      console.log(`${coll.name}: ${count} records`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

listCollections();
