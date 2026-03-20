import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const RoleBasedRedirect = () => {
  const { user, isAuthenticated, loading } = useAuth();

  // Show loading or nothing while authentication is being checked
  if (loading) {
    return null; // Don't redirect while loading
  }

  if (!isAuthenticated) {
    return <Navigate to="/landing" replace />;
  }

  // Redirect based on user role
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
      return <Navigate to="/home" replace />;
  }
};

export default RoleBasedRedirect;
