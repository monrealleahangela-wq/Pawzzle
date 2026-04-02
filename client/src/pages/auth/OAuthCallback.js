import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import SessionService from '../../services/sessionService';

/**
 * This page is the redirect target for Google OAuth.
 * The backend sends: /oauth-callback?token=...&user=...
 * We pick those up, store them, and redirect to the right dashboard.
 */
const OAuthCallback = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { completeOAuthLogin } = useAuth();
    const [error, setError] = useState('');

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        const userStr = params.get('user');
        const oauthError = params.get('error');

        if (oauthError || !token || !userStr) {
            setError('Social login failed. Please try again.');
            setTimeout(() => navigate('/login'), 2500);
            return;
        }

        try {
            const user = JSON.parse(decodeURIComponent(userStr));

            // Correctly initialize a fully valid session with an ID and timestamps
            SessionService.startSession(user, token);

            // Let AuthContext know we're logged in
            completeOAuthLogin(user, token);

            // Redirect by role
            if (user.role === 'super_admin') {
                navigate('/superadmin/dashboard', { replace: true });
            } else if (user.role === 'admin') {
                navigate('/admin/dashboard', { replace: true });
            } else {
                navigate('/home', { replace: true });
            }
        } catch (e) {
            setError('Could not parse login data. Please try again.');
            setTimeout(() => navigate('/login'), 2500);
        }
    }, [location, navigate]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fafaf9',
            fontFamily: 'Inter, sans-serif'
        }}>
            {error ? (
                <div style={{ color: '#dc2626', fontSize: 16 }}>
                    ⚠️ {error}
                </div>
            ) : (
                <>
                    <div style={{
                        width: 48, height: 48, border: '4px solid #d97706',
                        borderTopColor: 'transparent', borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite'
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ marginTop: 20, color: '#78716c', fontSize: 15 }}>
                        Completing sign-in…
                    </p>
                </>
            )}
        </div>
    );
};

export default OAuthCallback;
