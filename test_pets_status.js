const mongoose = require('mongoose');
require('dotenv').config();
const Pet = require('./models/Pet');

async function checkPets() {
    try {
        console.log('Connecting to MongoDB for a read-only pet listing audit...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const total = await Pet.countDocuments({});
        const available = await Pet.countDocuments({ isAvailable: true, isDeleted: { $ne: true } });
        const marketplace = await Pet.countDocuments({
            isDeleted: { $ne: true },
            listingContext: 'marketplace',
            listingType: 'sale'
        });
        const supplierCatalog = await Pet.countDocuments({ listingContext: 'supplier_catalog' });

        console.log('\n--- Pet Availability Statistics ---');
        console.log(`Total Pets: ${total}`);
        console.log(`Available Pets (isAvailable:true, !isDeleted): ${available}`);
        console.log(`Marketplace Sale Pets: ${marketplace}`);
        console.log(`Supplier Catalog Pets: ${supplierCatalog}`);

        const sample = await Pet.find({ isAvailable: true, isDeleted: { $ne: true } })
            .limit(5)
            .select('name status isAvailable listingType listingContext store');
        console.log('\nSample available pets:', JSON.stringify(sample, null, 2));
        console.log('\nRead-only audit complete. No records were modified.');
    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkPets();
