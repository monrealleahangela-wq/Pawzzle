import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Landing from '../pages/public/Landing';
import { isProfessionalVerificationPending, portalHomeForUser } from '../utils/authorization';

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

  return <Navigate to={isProfessionalVerificationPending(user) ? '/professional-verification' : portalHomeForUser(user)} replace />;
};

export default RoleBasedRedirect;
