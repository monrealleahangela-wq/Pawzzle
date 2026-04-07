const mongoose = require('mongoose');
require('dotenv').config();
const Store = require('./models/Store');

const CAVITE_LOCATIONS = [
    { city: 'Dasmariñas', street: 'Governor\'s Drive', barangay: 'Langkaan I', lat: 14.3294, lng: 120.9365 },
    { city: 'Imus', street: 'Aguinaldo Highway', barangay: 'Anabu II-E', lat: 14.4297, lng: 120.9367 },
    { city: 'Bacoor', street: 'Molino Boulevard', barangay: 'Molino III', lat: 14.4613, lng: 120.9350 },
    { city: 'Tagaytay', street: 'Tagaytay-Nasugbu Hwy', barangay: 'Maharlika West', lat: 14.1153, lng: 120.9621 },
    { city: 'Silang', street: 'Bypass Road', barangay: 'Biga I', lat: 14.2238, lng: 120.9752 },
    { city: 'General Trias', street: 'Arnaldo Hwy', barangay: 'San Francisco', lat: 14.3853, lng: 120.8841 }
];

async function updateStoresToCavite() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected!');

        const stores = await Store.find({});
        console.log(`Found ${stores.length} stores to update.`);

        for (let i = 0; i < stores.length; i++) {
            const store = stores[i];
            const location = CAVITE_LOCATIONS[i % CAVITE_LOCATIONS.length]; // Rotate through locations

            store.contactInfo.address.city = location.city;
            store.contactInfo.address.street = location.street;
            store.contactInfo.address.barangay = location.barangay;
            store.contactInfo.address.state = 'Cavite';
            store.contactInfo.address.coordinates = {
                lat: location.lat,
                lng: location.lng
            };
            store.verificationStatus = 'verified';
            store.isActive = true;

            await store.save();
            console.log(`Updated Store: "${store.name}" -> ${location.city}, Cavite`);
        }

        console.log('\nAll stores updated successfully with Cavite GPS coordinates!');
    } catch (error) {
        console.error('Update failed:', error);
    } finally {
        mongoose.disconnect();
    }
}

updateStoresToCavite();
