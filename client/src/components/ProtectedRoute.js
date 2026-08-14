import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { OPERATIONAL_ROLES, effectiveStaffType, hasUiPermission, portalHomeForRole } from '../utils/authorization';

const roleMatches = (userRole, allowedRoles) =>
  allowedRoles.includes(userRole) ||
  (allowedRoles.includes('admin') && userRole === 'store_owner') ||
  (allowedRoles.includes('staff') && OPERATIONAL_ROLES.has(userRole)) ||
  (allowedRoles.includes('super_admin') && userRole === 'platform_admin');

const ProtectedRoute = ({ children, roles = [], staffTypes = [], requiredPermission = null, excludedRoles = [] }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (excludedRoles.includes(user?.role) || excludedRoles.includes(effectiveStaffType(user))) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Check basic role access
  if (roles.length > 0 && !roleMatches(user?.role, roles)) {
    if (user?.role) return <Navigate to={portalHomeForRole(user.role)} replace />;
    return <Navigate to="/login" replace />;
  }

  // Enhanced Staff Access Logic
  if (OPERATIONAL_ROLES.has(user?.role)) {
    // 1. If a specific permission is required, check the matrix first
    if (requiredPermission) {
      if (!hasUiPermission(user, requiredPermission)) {
        return <Navigate to="/admin/dashboard" replace />;
      }
    }

    // 2. Fallback to traditional staffType check if specified
    const type = effectiveStaffType(user);
    const aliases = {
      cashier: ['sales_staff', 'order_staff'],
      manager: ['service_management_staff', 'administrative_support', 'logistics_staff'],
      delivery_dispatcher: ['logistics_staff'],
      boarding_staff: ['boarding_specialist']
    };
    const allowedType = staffTypes.includes(type) || (aliases[type] || []).some(alias => staffTypes.includes(alias));
    if (staffTypes.length > 0 && !allowedType) {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
