import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Landing from '../pages/public/Landing';
import { portalHomeForRole } from '../utils/authorization';

const RoleBasedRedirect = () => {
  const { user, isAuthenticated, loading } = useAuth();

  // Show loading or nothing while authentication is being checked
  if (loading) {
    return null; // Don't redirect while loading
  }

  // Unauthenticated: render the Landing page directly at the root URL (no redirect)
  if (!isAuthenticated) {
    return <Landing />;
  }

  return <Navigate to={portalHomeForRole(user?.role)} replace />;
};

export default RoleBasedRedirect;
