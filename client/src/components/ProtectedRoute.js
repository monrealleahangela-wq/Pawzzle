import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, roles = [], staffTypes = [] }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/landing" replace />;
  }

  // Check basic role access
  if (roles.length > 0 && !roles.includes(user?.role)) {
    switch (user?.role) {
      case 'super_admin':
        return <Navigate to="/superadmin/dashboard" replace />;
      case 'admin':
        return <Navigate to="/admin/dashboard" replace />;
      case 'staff':
        return <Navigate to="/admin/dashboard" replace />;
      case 'customer':
        return <Navigate to="/home" replace />;
      default:
        return <Navigate to="/login" replace />;
    }
  }

  // If user is staff AND staffTypes restriction is specified, enforce it
  if (user?.role === 'staff' && staffTypes.length > 0) {
    if (!staffTypes.includes(user?.staffType)) {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
