import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Landing from '../pages/public/Landing';

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

  // Redirect based on user role
  switch (user?.role) {
    case 'super_admin':
    case 'platform_admin':
      return <Navigate to="/superadmin/dashboard" replace />;
    case 'admin':
    case 'staff':
    case 'store_owner':
    case 'manager':
    case 'cashier':
    case 'inventory_staff':
    case 'procurement_officer':
    case 'finance_staff':
    case 'veterinarian':
    case 'groomer':
    case 'trainer':
    case 'boarding_staff':
    case 'delivery_dispatcher':
    case 'delivery_rider':
    case 'auditor':
      return <Navigate to="/admin/dashboard" replace />;
    case 'supplier':
      return <Navigate to="/supplier/dashboard" replace />;
    case 'customer':
      return <Navigate to="/home" replace />;
    default:
      return <Navigate to="/home" replace />;
  }
};

export default RoleBasedRedirect;
