import axios from 'axios';
import SessionService from './sessionService';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // NOTE: We intentionally do NOT clear sessions or redirect here.
    // Doing so on any 401 causes unexpected logouts on back navigation.
    // Session clearing is ONLY done by the explicit logout() function below.
    return Promise.reject(error);
  }
);

const authService = {
  login: (credentials) => {
    // Clear any leftover session data so a fresh login always works
    SessionService.clearAllSessions();

    if (!credentials.email || !credentials.password) {
      return Promise.reject(new Error('Email and password are required'));
    }

    console.log(' === AUTH SERVICE LOGIN ===');
    console.log(' Attempting real API call to:', '/auth/login');
    console.log(' Email:', credentials.email);

    return api.post('/auth/login', credentials)
      .then(response => {
        console.log(' === REAL API SUCCESS ===');
        console.log(' Response data:', response.data);
        const { token, user, twoFactorRequired } = response.data;
        
        if (twoFactorRequired) {
          return response.data;
        }

        if (token && user) {
          const session = SessionService.startSession(user, token);
          return { ...response.data, sessionId: session.sessionId };
        }
        
        return response.data;
      })
      .catch(error => {
        console.log(' === REAL API ERROR ===');
        console.log(' Error details:', error.message);
        console.log(' Error response:', error.response?.data);
        SessionService.clearAllSessions();
        throw error;
      });
  },

  register: (userData) => {
    // Check for existing session
    const sessionCheck = SessionService.checkSessionConflict();
    if (sessionCheck.hasConflict) {
      return Promise.reject(new Error(sessionCheck.message));
    }

    // For registration, we need to get token from response
    return api.post('/auth/register', userData)
      .then(response => {
        const { token, user } = response.data;

        // Start new session
        const session = SessionService.startSession(user, token);

        return {
          ...response.data,
          sessionId: session.sessionId
        };
      })
      .catch(error => {
        SessionService.clearAllSessions();
        throw error;
      });
  },

  getCurrentUser: () => {
    // Validate current session
    const sessionValidation = SessionService.validateSession();
    if (!sessionValidation.isValid) {
      return Promise.reject(new Error(sessionValidation.message));
    }

    return api.get('/auth/me')
      .then(response => {
        // Update last activity
        localStorage.setItem('lastActivity', new Date().toISOString());
        return response.data;
      })
      .catch(error => {
        // If session is invalid, clear it
        if (error.response?.status === 401) {
          SessionService.clearAllSessions();
        }
        throw error;
      });
  },

  updateProfile: (userData) => {
    // Validate session
    const sessionValidation = SessionService.validateSession();
    if (!sessionValidation.isValid) {
      return Promise.reject(new Error(sessionValidation.message));
    }

    return api.put('/auth/profile', userData)
      .then(response => {
        // Update user data in current session
        localStorage.setItem('user', JSON.stringify(response.data));
        localStorage.setItem('lastActivity', new Date().toISOString());
        return response.data;
      })
      .catch(error => {
        if (error.response?.status === 401) {
          SessionService.clearAllSessions();
        }
        throw error;
      });
  },

  changePassword: (passwordData) => {
    // Validate session
    const sessionValidation = SessionService.validateSession();
    if (!sessionValidation.isValid) {
      return Promise.reject(new Error(sessionValidation.message));
    }

    return api.put('/auth/change-password', passwordData)
      .then(response => {
        localStorage.setItem('lastActivity', new Date().toISOString());
        return response.data;
      })
      .catch(error => {
        if (error.response?.status === 401) {
          SessionService.clearAllSessions();
        }
        throw error;
      });
  },

  requestPasswordResetOTP: (emailData) => {
    return api.post('/auth/request-password-reset', emailData)
      .catch(error => {
        throw error;
      });
  },

  verifyOTPAndResetPassword: (resetData) => {
    return api.post('/auth/verify-otp-reset-password', resetData)
      .then(response => {
        localStorage.setItem('lastActivity', new Date().toISOString());
        return response.data;
      })
      .catch(error => {
        throw error;
      });
  },

  resendPasswordResetOTP: (emailData) => {
    return api.post('/auth/resend-password-reset', emailData)
      .catch(error => {
        throw error;
      });
  },

  // Registration OTP flow
  sendRegisterOTP: (userData) => {
    return api.post('/auth/register/send-otp', userData)
      .then(response => response.data)
      .catch(error => {
        throw error;
      });
  },

  verifyRegisterOTP: (data) => {
    return api.post('/auth/register/verify-otp', data)
      .then(response => {
        const { token, user } = response.data;
        if (token && user) {
          SessionService.startSession(user, token);
        }
        return response.data;
      })
      .catch(error => {
        throw error;
      });
  },

  resendRegisterOTP: (emailData) => {
    return api.post('/auth/register/resend-otp', emailData)
      .then(response => response.data)
      .catch(error => {
        throw error;
      });
  },

  // Two-Factor Authentication
  verify2FA: (data) => {
    return api.post('/auth/verify-2fa', data)
      .then(response => {
        const { token, user } = response.data;
        if (token && user) {
          SessionService.startSession(user, token);
        }
        return response.data;
      })
      .catch(error => {
        throw error;
      });
  },

  toggle2FA: (data) => {
    return api.post('/auth/toggle-2fa', data)
      .then(response => response.data)
      .catch(error => {
        throw error;
      });
  },

  // Logout with proper session cleanup
  logout: () => {
    return api.post('/auth/logout')
      .then(() => {
        // Clear all session data
        SessionService.clearAllSessions();

        // Redirect to login
        window.location.href = '/';
      })
      .catch(error => {
        console.error('Logout error:', error);
        // Still clear session data even on error
        SessionService.clearAllSessions();
        window.location.href = '/';
      });
  }
};

export default authService;
