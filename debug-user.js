require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const debugUser = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const email = 'monrealeah24@gmail.com';
        const username = 'clarkiee';

        const users = await User.find({ 
            $or: [{ email }, { username }]
        });

        console.log(`Found ${users.length} matching users:`);
        users.forEach(u => {
            console.log(`ID: ${u._id}, Email: ${u.email}, Username: ${u.username}, isDeleted: ${u.isDeleted}, isActive: ${u.isActive}, Role: ${u.role}`);
        });

        const activeCheck = await User.findOne({
            $or: [{ email }, { username }],
            isDeleted: false
        });

        if (activeCheck) {
            console.log('❌ ACTIVE USER FOUND:', activeCheck.email, activeCheck.username);
        } else {
            console.log('✅ NO ACTIVE USER FOUND. Creation should be allowed.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

debugUser();
