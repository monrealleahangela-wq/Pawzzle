const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// ─── Google OAuth ─────────────────────────────────────────────────────────────
// Google OAuth is optional for password-login deployments and local development.
// Register only when both provider credentials are present.
const googleOAuthConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleOAuthConfigured) passport.use(new GoogleStrategy({
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

        // A new account cannot be created from an OAuth profile alone because
        // registration requires one protected government ID. Existing linked
        // accounts can continue to use Google sign-in normally.
        return done(null, false, { code: 'GOVERNMENT_ID_REQUIRED' });
    } catch (err) {
        return done(err, null);
    }
}));


module.exports = passport;
