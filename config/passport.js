const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// ─── Google OAuth ─────────────────────────────────────────────────────────────
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
    proxy: true
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No email returned from Google'), null);

        // Check if active user already exists (by googleId or email, ignoring soft-deleted)
        let user = await User.findOne({ 
            $or: [{ googleId: profile.id }, { email }],
            isDeleted: false
        });

        if (user) {
            // Link Google if they registered via email before
            if (!user.googleId) {
                user.googleId = profile.id;
                user.authProvider = 'google';
                if (!user.avatar) user.avatar = profile.photos?.[0]?.value;
                await user.save();
            }
            return done(null, user);
        }

        // Create new user from Google profile
        const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
        const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
        const baseUsername = (firstName + lastName).toLowerCase().replace(/\s+/g, '').slice(0, 30);
        const username = baseUsername + '_' + Date.now().toString().slice(-4);

        user = new User({
            googleId: profile.id,
            authProvider: 'google',
            email,
            firstName,
            lastName,
            username,
            avatar: profile.photos?.[0]?.value || '',
            role: 'customer',
            isActive: true,
            address: {
                street: 'Not provided',
                city: 'Not provided',
                province: 'Not provided',
                barangay: 'Not provided'
            }
        });
        await user.save();
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));


module.exports = passport;
