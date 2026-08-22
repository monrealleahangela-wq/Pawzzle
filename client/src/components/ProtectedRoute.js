import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { OPERATIONAL_ROLES, effectiveStaffType, hasUiActionPermission, hasUiPermission, portalHomeForRole } from '../utils/authorization';

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
    let requiredPermissionGranted = false;
    let explicitActionPermissionGranted = false;
    if (requiredPermission) {
      const requiredPermissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
      requiredPermissionGranted = requiredPermissions.some(permission => {
        const [resource, action] = permission.split('.');
        const granted = action
          ? hasUiActionPermission(user, resource, action, false)
          : hasUiPermission(user, permission);
        if (action && granted) explicitActionPermissionGranted = true;
        return granted;
      });
      if (!requiredPermissionGranted) {
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
    // A broad resource permission must not let a specialist bypass a route's
    // role boundary. Only an explicitly requested action can be used as a
    // configured exception for a route that deliberately supports one.
    if (staffTypes.length > 0 && !allowedType && !explicitActionPermissionGranted) {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
