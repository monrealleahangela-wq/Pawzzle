
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import authService from '../services/authService';
import SessionService from '../services/sessionService';

const AuthContext = createContext();

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        loading: false,
        error: null
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
        error: null
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: action.payload
      };
    case 'LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      };
    default:
      return state;
  }
};

const initialState = {
  isAuthenticated: false, // Start with false, let useEffect determine actual state
  user: null,
  token: localStorage.getItem('token'),
  loading: !!localStorage.getItem('token'), // Set loading to true if we have a token to validate
  error: null
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize session cleanup on app load
  useEffect(() => {
    console.log('🔐 AuthContext: Simple session initialization...');

    // Only run session cleanup, no validation to avoid loops
    SessionService.initializeSessionCleanup();

    // Get current session info without validation
    const currentSession = SessionService.getCurrentSession();
    console.log('🔐 Current session state:', currentSession.isAuthenticated ? 'Authenticated' : 'Not authenticated');

    // Only set authenticated state if we have valid session data
    if (currentSession.isAuthenticated && currentSession.user) {
      console.log('🔐 Setting authenticated state for user:', currentSession.user.email);
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: currentSession.user,
          token: currentSession.token,
          sessionId: currentSession.sessionId
        }
      });
    } else {
      console.log('🔐 No valid session, User is not authenticated');
      dispatch({ type: 'LOGOUT' });
    }
  }, []);

  // Periodic role check to refresh user session when role changes
  useEffect(() => {
    if (!state.isAuthenticated || !state.user) return;

    const checkRoleChange = async () => {
      try {
        const result = await refreshUserRole();
        if (result.roleChanged) {
          console.log('🔄 User role refreshed:', result.newRole);

          // If user became admin, we might want to redirect or refresh
          if (result.newRole === 'admin') {
            // Optionally redirect to admin dashboard or refresh page
            console.log('🎉 User promoted to admin!');
          }
        }
      } catch (error) {
        console.error('Error checking role change:', error);
      }
    };

    // Check role every 30 seconds
    const intervalId = setInterval(checkRoleChange, 30000);

    // Also check role when user focuses back to the tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkRoleChange();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isAuthenticated, state.user]);

  // Listen for localStorage changes to sync session across tabs
  useEffect(() => {
    const handleStorageChange = (e) => {
      console.log('🔄 localStorage changed:', e.key, e.newValue);

      if (e.key === 'token' || e.key === 'user' || e.key === 'sessionId') {
        console.log('🔄 Session data updated, re-validating...');
        const updatedSession = SessionService.getCurrentSession();
        console.log('🔄 Updated session state:', updatedSession.isAuthenticated ? 'Authenticated' : 'Not authenticated');

        if (updatedSession.isAuthenticated && updatedSession.user) {
          console.log('🔄 Updating AuthContext state from storage change');
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: updatedSession.user,
              token: updatedSession.token,
              sessionId: updatedSession.sessionId
            }
          });
        } else {
          console.log('🔄 Clearing AuthContext state from storage change');
          dispatch({ type: 'LOGOUT' });
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const login = async (credentials) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await authService.login(credentials);

      console.log('🔐 Login Response:', response);
      console.log('🔐 Response structure:', Object.keys(response));

      // Handle both direct response and wrapped response
      const { token, user, success } = response.data || response;

      console.log('🔐 Extracted data:', {
        token: token ? 'exists' : 'missing',
        user: user ? `${user.firstName} (${user.role})` : 'missing',
        success: success || 'not specified',
        tokenValue: token,
        userValue: user
      });

      if (!success && success !== undefined) {
        console.log('🔐 Login failed - success is false');
        dispatch({ type: 'LOGIN_FAILURE', payload: 'Login failed' });
        return { success: false, error: 'Login failed' };
      }

      // Check if 2FA is required
      if (response.twoFactorRequired) {
        console.log('🔐 2FA Required');
        return { 
          success: true, 
          twoFactorRequired: true, 
          email: response.email 
        };
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      console.log('🔐 Data saved to localStorage');
      console.log('🔐 localStorage check:', {
        token: localStorage.getItem('token'),
        user: localStorage.getItem('user')
      });

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user, token }
      });

      console.log('🔐 Login SUCCESS dispatch completed');

      return { success: true, user, token };
    } catch (error) {
      console.log('🔐 Login ERROR:', error);
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || error.message || 'Login failed';
      
      dispatch({ type: 'LOGIN_FAILURE', payload: errorMessage });
      
      return { 
        success: false, 
        error: errorMessage, 
        isDisabled: errorData?.isDisabled,
        deactivationReason: errorData?.deactivationReason,
        contactSupport: errorData?.contactSupport
      };
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const verify2FA = async (data) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await authService.verify2FA(data);
      const { token, user } = response;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user, token }
      });

      return { success: true, user, token };
    } catch (error) {
      console.error('2FA Verification Error:', error);
      const errorMessage = error.response?.data?.message || 'Verification failed';
      return { success: false, error: errorMessage };
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const register = async (userData) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await authService.register(userData);
      const { token, user } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user)); // Store user data
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user, token }
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Registration failed';
      dispatch({ type: 'LOGIN_FAILURE', payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const logout = () => {
    // Clear all auth-related data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('sessionStart');
    localStorage.removeItem('lastActivity');
    localStorage.removeItem('redirectPath');

    // Clear any other session data that might exist
    sessionStorage.clear();

    // Dispatch logout action
    dispatch({ type: 'LOGOUT' });

    // Force page reload to clear any in-memory state and prevent back navigation
    window.location.href = '/';
  };

  const updateUser = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    dispatch({ type: 'UPDATE_USER', payload: userData });
  };

  const refreshUserRole = async () => {
    try {
      const response = await authService.getCurrentUser();
      const updatedUser = response.user || response;

      // Always update user data in context and localStorage to ensure sync
      updateUser(updatedUser);

      // Check if role has changed
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (currentUser.role !== updatedUser.role) {
        console.log('User role changed from', currentUser.role, 'to', updatedUser.role);
        return { roleChanged: true, newRole: updatedUser.role };
      }

      return { roleChanged: false, role: updatedUser.role };
    } catch (error) {
      console.error('Error refreshing user role:', error);
      throw error;
    }
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const completeOAuthLogin = (user, token) => {
    // Ensure localStorage is set (SessionService may not cover all edge cases)
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: { user, token }
    });
  };

  const value = {
    ...state,
    login,
    register,
    logout,
    updateUser,
    refreshUserRole,
    completeOAuthLogin,
    verify2FA
  };

  // Debug: Log state changes
  console.log('🔐 AuthContext State:', {
    isAuthenticated: state.isAuthenticated,
    user: state.user ? `${state.user.firstName} (${state.user.role})` : 'No user',
    token: state.token ? 'exists' : 'missing',
    loading: state.loading
  });

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
