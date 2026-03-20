// User Session Management Service
// Ensures complete separation of user data and sessions

// Clear all user session data
const clearAllSessions = () => {
  console.log('Clearing all user sessions');
  
  // Clear authentication data
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('cart');
  
  // Clear chat data
  localStorage.removeItem('conversations');
  localStorage.removeItem('currentConversation');
  localStorage.removeItem('unreadCount');
  
  // Clear any other user-specific data
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('user_') || key.startsWith('chat_') || key.startsWith('cart_')) {
      localStorage.removeItem(key);
    }
  });
  
  // Don't force reload - let the app handle the redirect naturally
  // window.location.reload();
};

// Get current session info
const getCurrentSession = () => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  return {
    isAuthenticated: !!token,
    user: user ? JSON.parse(user) : null,
    token: token,
    sessionStart: localStorage.getItem('sessionStart'),
    lastActivity: localStorage.getItem('lastActivity')
  };
};

// Start new user session
const startSession = (userData, token) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store session data
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(userData));
  localStorage.setItem('sessionStart', new Date().toISOString());
  localStorage.setItem('lastActivity', new Date().toISOString());
  localStorage.setItem('sessionId', sessionId);
  
  console.log('🟢 SESSION CREATED ===');
  console.log('📧 User email:', userData.email);
  console.log('📧 User role:', userData.role);
  console.log('📧 Session ID:', sessionId);
  console.log('📧 Token stored:', token ? 'yes' : 'no');
  console.log('📧 Session start time:', new Date().toISOString());
  
  return {
    sessionId,
    user: userData,
    isAuthenticated: true
  };
};

// End current session
const endSession = () => {
  const sessionId = localStorage.getItem('sessionId');
  const userEmail = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).email : 'unknown';
  
  console.log('Ending session for user:', userEmail, 'Session:', sessionId);
  
  // Clear all data
  clearAllSessions();
  
  return {
    sessionId,
    endedAt: new Date().toISOString()
  };
};

// Check for session conflicts
const checkSessionConflict = () => {
  const currentSession = getCurrentSession();
  
  // Check if there's already an active session
  if (currentSession.isAuthenticated) {
    return {
      hasConflict: true,
      message: 'User already logged in',
      currentSession
    };
  }
  
  return {
    hasConflict: false,
    message: 'No active session'
  };
};

// Validate session integrity
const validateSession = () => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  const sessionId = localStorage.getItem('sessionId');
  
  if (!token || !user || !sessionId) {
    return {
      isValid: false,
      message: 'Invalid session: missing authentication data'
    };
  }
  
  let userData;
  try {
    userData = JSON.parse(user);
    if (!userData.email || (!userData.id && !userData._id)) {
      return {
        isValid: false,
        message: 'Invalid session: corrupted user data'
      };
    }
  } catch (error) {
    return {
      isValid: false,
      message: 'Invalid session: corrupted user data'
    };
  }
  
  return {
    isValid: true,
    message: 'Valid session',
    user: userData,
    token: token,
    sessionId: sessionId
  };
};

// Auto-session cleanup (runs on app load)
const initializeSessionCleanup = () => {
  const sessionStart = localStorage.getItem('sessionStart');
  const lastActivity = localStorage.getItem('lastActivity');
  
  // If session is older than 24 hours, clear it
  if (sessionStart && lastActivity) {
    const sessionAge = Date.now() - new Date(sessionStart).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    if (sessionAge > maxAge) {
      console.log('Session expired, clearing old session data');
      clearAllSessions();
      return true;
    }
  }
  
  return false;
};

const SessionService = {
  clearAllSessions,
  getCurrentSession,
  startSession,
  endSession,
  checkSessionConflict,
  validateSession,
  initializeSessionCleanup
};

export default SessionService;
export {
  clearAllSessions,
  getCurrentSession,
  startSession,
  endSession,
  checkSessionConflict,
  validateSession,
  initializeSessionCleanup
};
