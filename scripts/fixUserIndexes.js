require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function fixUserIndexes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Access the native collection to avoid Mongoose schema overhead/conflicts
        const collection = mongoose.connection.db.collection('users');
        
        console.log('Fetching current indexes...');
        const indexes = await collection.indexes();
        console.log('Current Indexes:', JSON.stringify(indexes, null, 2));

        for (const index of indexes) {
            const name = index.name;
            if (name === '_id_') continue;
            
            // Check for unique indexes on email or username without partialFilterExpression
            const keys = Object.keys(index.key);
            const isEmail = keys.includes('email');
            const isUsername = keys.includes('username');
            const hasPartial = !!index.partialFilterExpression;

            if (index.unique && (isEmail || isUsername) && !hasPartial) {
                console.log(`Dropping legacy unique index: ${name}`);
                try {
                    await collection.dropIndex(name);
                } catch (dropErr) {
                    console.warn(`Could not drop ${name}: ${dropErr.message}`);
                }
            }
        }

        console.log('Ensuring modern partial unique indexes...');
        await collection.createIndex(
            { email: 1 }, 
            { unique: true, partialFilterExpression: { isDeleted: false }, name: 'email_1_partial_unique' }
        );
        await collection.createIndex(
            { username: 1 }, 
            { unique: true, partialFilterExpression: { isDeleted: false }, name: 'username_1_partial_unique' }
        );

        console.log('✅ User indexes cleaned and modernized!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to fix indexes:', error);
        process.exit(1);
    }
}

fixUserIndexes();
