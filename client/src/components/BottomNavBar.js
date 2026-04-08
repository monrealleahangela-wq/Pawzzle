/**
 * BottomNavBar – Dynamic, role- & permission-based mobile bottom navigation.
 *
 * Architecture:
 *  1. BASE_CONFIGS  → static menus for customer / admin / super_admin
 *  2. STAFF_TYPE_CONFIGS → default menus keyed by staffType (inventory_staff, etc.)
 *  3. buildStaffMenu()  → merges staffType defaults with the fine-grained
 *                         `permissions` object stored on the User document,
 *                         so admins can grant/revoke individual modules without
 *                         reassigning a staffType.
 *  4. <BottomNavBar>   → resolves the final items[] and renders them.
 */

import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Heart,
  Package,
  ShoppingCart,
  Calendar,
  Users,
  MessageSquare,
  Home as House,
  MapPin,
  ShoppingBag,
  Ticket,
  User,
  Brain,
  Truck,
  Star,
  Tag,
  PieChart,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/* ─────────────────────────────────────────────
   Permission resource → nav item definition
   ───────────────────────────────────────────── */
const PERMISSION_NAV_MAP = {
  inventory: { path: '/admin/products', label: 'Products',  icon: Package },
  orders:    { path: '/admin/orders',   label: 'Orders',    icon: ShoppingCart },
  bookings:  { path: '/admin/bookings', label: 'Bookings',  icon: Calendar },
  services:  { path: '/admin/services', label: 'Services',  icon: Calendar },
  customers: { path: '/admin/customers',label: 'Customers', icon: Users },
  vouchers:  { path: '/admin/vouchers', label: 'Vouchers',  icon: Tag },
  analytics: { path: '/admin/insights', label: 'Insights',  icon: PieChart },
};

/* The pets route is tied to inventory access */
const PET_NAV   = { path: '/admin/pets',      label: 'Pets',      icon: Heart };
const DASH_NAV  = { path: '/admin/dashboard', label: 'Hub',       icon: Activity };
const PROF_NAV  = { path: '/profile',          label: 'Me',        icon: User };

/* ─────────────────────────────────────────────
   Static configs for non-staff roles
   ───────────────────────────────────────────── */
const BASE_CONFIGS = {
  customer: [
    { path: '/home',       label: 'Home',     icon: House },
    { path: '/find-shops', label: 'Shops',    icon: MapPin },
    { path: '/products',   label: 'Shop',     icon: ShoppingBag },
    { path: '/services',   label: 'Services', icon: Calendar },
    PROF_NAV,
  ],

  admin: [
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/admin/orders',    label: 'Orders',     icon: ShoppingCart },
    { path: '/admin/bookings',  label: 'Bookings',   icon: Calendar },
    { path: '/admin/chat',      label: 'Chat',       icon: MessageSquare },
    PROF_NAV,
  ],

  super_admin: [
    { path: '/superadmin/dashboard',           label: 'Dashboard', icon: Activity },
    { path: '/superadmin/account-management',  label: 'Accounts',  icon: Users },
    { path: '/superadmin/transaction-history', label: 'Txns',      icon: ShoppingCart },
    { path: '/superadmin/booking-history',     label: 'Bookings',  icon: Calendar },
    PROF_NAV,
  ],
};

/* ─────────────────────────────────────────────
   Default menus per staffType (used as a floor
   when no fine-grained permissions exist yet)
   ───────────────────────────────────────────── */
const STAFF_TYPE_CONFIGS = {
  inventory_staff: [DASH_NAV, PET_NAV, PERMISSION_NAV_MAP.inventory, PROF_NAV],
  order_staff:     [DASH_NAV, PERMISSION_NAV_MAP.orders, PERMISSION_NAV_MAP.bookings, PERMISSION_NAV_MAP.customers, PROF_NAV],
  service_staff:   [DASH_NAV, PERMISSION_NAV_MAP.services, PERMISSION_NAV_MAP.bookings, PROF_NAV],
  delivery_staff:  [DASH_NAV, { path: '/admin/orders', label: 'Delivery', icon: Truck }, PERMISSION_NAV_MAP.customers, PROF_NAV],
};

/* ─────────────────────────────────────────────
   Build a menu from fine-grained permissions.
   Falls back to staffType defaults, then minimal.
   Max 5 items (incl. Dashboard + Profile).
   ───────────────────────────────────────────── */
function buildStaffMenu(staffType, permissions = {}) {
  // 1. If granular permissions exist, derive items from them
  const grantedResources = Object.entries(permissions)
    .filter(([, perms]) => perms?.view || perms?.fullAccess)
    .map(([resource]) => resource);

  if (grantedResources.length > 0) {
    const items = [DASH_NAV];

    // inventory permission also unlocks the Pets nav item
    if (grantedResources.includes('inventory')) {
      items.push(PET_NAV);
      items.push(PERMISSION_NAV_MAP.inventory);
    }

    // Add remaining mapped resources (skip inventory, already handled)
    for (const resource of grantedResources) {
      if (resource === 'inventory') continue;
      if (resource === 'staff') continue;      // staff mgmt tab rarely useful
      const navItem = PERMISSION_NAV_MAP[resource];
      if (navItem && !items.find(i => i.path === navItem.path)) {
        items.push(navItem);
      }
      if (items.length >= 4) break;            // reserve last slot for Profile
    }

    items.push(PROF_NAV);
    return dedupe(items).slice(0, 5);
  }

  // 2. No fine-grained permissions → fall back to staffType defaults
  if (staffType && STAFF_TYPE_CONFIGS[staffType]) {
    return STAFF_TYPE_CONFIGS[staffType];
  }

  // 3. Minimal fallback
  return [DASH_NAV, PROF_NAV];
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */
const BottomNavBar = () => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  /* Resolve nav items – memoised so it only recomputes on auth changes */
  const navItems = useMemo(() => {
    if (!user) return null;

    const role = user.role;

    if (role === 'customer')    return BASE_CONFIGS.customer;
    if (role === 'admin')       return BASE_CONFIGS.admin;
    if (role === 'super_admin') return BASE_CONFIGS.super_admin;

    if (role === 'staff') {
      return buildStaffMenu(user.staffType, user.permissions);
    }

    // Public / unauthenticated – handled by the parent
    return null;
  }, [user]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <nav className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-sm
                      bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl
                      border border-slate-200 dark:border-slate-800
                      rounded-2xl shadow-lg flex justify-around items-center p-3 z-[60]">
        <Loader2 className="h-5 w-5 text-primary-400 animate-spin" />
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Loading…</span>
      </nav>
    );
  }

  /* ── No items or not authenticated → render nothing ── */
  if (!navItems || !isAuthenticated) return null;

  const isActive = (path) =>
    path === '/admin/dashboard' || path === '/superadmin/dashboard'
      ? location.pathname === path
      : location.pathname.startsWith(path);

  return (
    <nav
      className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-sm z-[60]"
      aria-label="Mobile navigation"
    >
      {/* Glass pill container */}
      <div className="
        flex justify-around items-center
        bg-white/95 dark:bg-slate-900/95
        backdrop-blur-xl
        border border-slate-200/80 dark:border-slate-800
        rounded-2xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.15)]
        p-1.5
        transition-colors duration-300
      ">
        {navItems.map((item) => {
          const Icon   = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`
                relative flex flex-col items-center justify-center
                gap-0.5 px-3 py-2 rounded-xl
                transition-all duration-200 active:scale-95
                min-w-[56px]
                ${active
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-200 dark:shadow-primary-900/40'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }
              `}
            >
              {/* Active glow ring */}
              {active && (
                <span className="absolute inset-0 rounded-xl ring-2 ring-primary-400/30 animate-pulse pointer-events-none" />
              )}
              <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'drop-shadow-sm' : ''}`} />
              <span className={`text-[9px] font-black uppercase tracking-[0.05em] leading-none text-center truncate max-w-[60px] ${active ? 'text-white' : ''}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavBar;
