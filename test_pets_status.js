const mongoose = require('mongoose');
require('dotenv').config();
const Pet = require('./models/Pet');
const Store = require('./models/Store');

async function checkPets() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected!');

        const total = await Pet.countDocuments({});
        const available = await Pet.countDocuments({ isAvailable: true, isDeleted: { $ne: true } });
        const pending = await Pet.countDocuments({ approvalStatus: 'pending' });
        const approved = await Pet.countDocuments({ approvalStatus: 'approved' });
        
        console.log(`\n--- Pet Availability Statistics ---`);
        console.log(`Total Pets: ${total}`);
        console.log(`Available Pets (isAvailable:true, !isDeleted): ${available}`);
        console.log(`Approved Pets: ${approved}`);
        console.log(`Pending Pets: ${pending}`);

        const sample = await Pet.find({ isAvailable: true, isDeleted: { $ne: true } }).limit(5).select('name status isAvailable approvalStatus listingType store');
        console.log(`\nSample available pets:`, JSON.stringify(sample, null, 2));

        if (available > 0 && approved === 0) {
            console.log('\n⚠️ Found available pets that are NOT approved. Fixing...');
            await Pet.updateMany({ isAvailable: true, isDeleted: { $ne: true } }, { approvalStatus: 'approved' });
            console.log('✅ Pets approved!');
        }

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        mongoose.disconnect();
    }
}

checkPets();
