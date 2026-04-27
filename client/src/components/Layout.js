import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { getImageUrl } from '../services/apiService';
import {
  Heart, Package, Calendar, ShoppingCart, User, LogOut, Menu, X,
  Settings, Home as House, Activity, Users, Building, DollarSign,
  TrendingUp, FileText, Search, ChevronRight, ChevronDown,
  MessageSquare, ShoppingBag, Archive, Ticket, Star, Wallet,
  Brain, Moon, Sun, PawPrint, MapPin, AlertCircle, HelpCircle,
  History, ShieldCheck, Truck, Layers, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import FloatingChatManager from './FloatingChatManager';
import NotificationBell from './NotificationBell';
import PasswordChangeModal from './auth/PasswordChangeModal';
import LogoutModal from './auth/LogoutModal';
import { useTheme } from '../contexts/ThemeContext';

// ═══════════════════════════════════════════════════════════════
// NAVIGATION DATA — Role-based dropdown menu structures
// ═══════════════════════════════════════════════════════════════

const customerMenu = [
  { path: '/home', label: 'Dashboard', icon: House },
  {
    label: 'Marketplace', icon: ShoppingBag, children: [
      { path: '/products', label: 'Products', icon: Package },
      { path: '/find-shops', label: 'Find Shops', icon: MapPin },
      { path: '/orders', label: 'My Orders', icon: ShoppingCart },
      { path: '/vouchers', label: 'Vouchers', icon: Ticket },
    ]
  },
  {
    label: 'Services', icon: Calendar, children: [
      { path: '/services', label: 'Browse Services', icon: Calendar },
      { path: '/pets', label: 'My Pets', icon: Heart },
    ]
  },
  { path: '/insights', label: 'AI Advisor', icon: Brain },
  {
    label: 'Account', icon: User, children: [
      { path: '/profile', label: 'Profile Settings', icon: Settings },
      { path: '/supplier/dashboard', label: 'Become a Supplier', icon: Truck },
    ]
  },
];

const adminMenu = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
  { path: '/admin/insights', label: 'Intelligence', icon: Brain },
  {
    label: 'Catalog', icon: Package, children: [
      { path: '/admin/pets', label: 'Pets', icon: Heart },
      { path: '/admin/products', label: 'Products', icon: Package },
      { path: '/admin/services', label: 'Services', icon: Calendar },
    ]
  },
  {
    label: 'Operations', icon: ShoppingBag, children: [
      { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
      { path: '/admin/bookings', label: 'Bookings', icon: Calendar },
      { path: '/admin/customers', label: 'Customers', icon: Users },
      { path: '/admin/chat', label: 'Chat', icon: MessageSquare },
      { path: '/admin/reviews', label: 'Reviews', icon: Star },
    ]
  },
  {
    label: 'Supply Chain', icon: Truck, children: [
      { path: '/admin/purchase-orders', label: 'Purchase Orders', icon: Truck },
      { path: '/admin/supplies', label: 'Supplies', icon: Layers },
    ]
  },
  {
    label: 'Finance', icon: Wallet, children: [
      { path: '/admin/vouchers', label: 'Vouchers', icon: Ticket },
      { path: '/admin/payouts', label: 'Payouts', icon: Wallet },
    ]
  },
  {
    label: 'Settings', icon: Settings, children: [
      { path: '/admin/store', label: 'Store', icon: Building },
      { path: '/admin/staff', label: 'Staff', icon: Users },
    ]
  },
];

const superAdminMenu = [
  { path: '/superadmin/dashboard', label: 'Dashboard', icon: Activity },
  {
    label: 'Intelligence', icon: Brain, children: [
      { path: '/superadmin/insights', label: 'DSS', icon: Brain },
      { path: '/superadmin/system-analytics', label: 'Analytics', icon: TrendingUp },
    ]
  },
  {
    label: 'Accounts', icon: Users, children: [
      { path: '/superadmin/account-management', label: 'User Management', icon: Users },
      { path: '/superadmin/store-applications', label: 'Applications', icon: FileText },
    ]
  },
  {
    label: 'Operations', icon: ShoppingBag, children: [
      { path: '/superadmin/transaction-history', label: 'Transactions', icon: DollarSign },
      { path: '/superadmin/booking-history', label: 'Bookings', icon: Calendar },
      { path: '/superadmin/payouts', label: 'Payouts', icon: Wallet },
      { path: '/superadmin/archive', label: 'Archive', icon: Archive },
    ]
  },
  {
    label: 'Moderation', icon: ShieldCheck, children: [
      { path: '/superadmin/reports', label: 'Reports', icon: AlertCircle },
      { path: '/superadmin/feedback', label: 'Feedback', icon: Star },
      { path: '/superadmin/support', label: 'Support', icon: HelpCircle },
      { path: '/superadmin/activity-history', label: 'Activity', icon: History },
    ]
  },
  {
    label: 'Supply Chain', icon: Truck, children: [
      { path: '/superadmin/suppliers', label: 'Suppliers', icon: Truck },
    ]
  },
];

const supplierMenu = [
  { path: '/supplier/dashboard', label: 'Dashboard', icon: Activity },
];

const publicMenu = [
  { path: '/home', label: 'Home', icon: House },
  { path: '/pets', label: 'Pets', icon: Heart },
  { path: '/products', label: 'Products', icon: Package },
  { path: '/services', label: 'Services', icon: Calendar },
  { path: '/find-shops', label: 'Find Shops', icon: MapPin },
];

const getStaffMenu = (user) => {
  const p = user?.permissions || {};
  const menu = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/admin/insights', label: 'Intelligence', icon: Brain },
  ];

  // Catalog group
  const catalogChildren = [];
  if (p.inventory?.view) catalogChildren.push({ path: '/admin/pets', label: 'Pets', icon: Heart });
  if (p.inventory?.view) catalogChildren.push({ path: '/admin/products', label: 'Products', icon: Package });
  if (p.services?.view) catalogChildren.push({ path: '/admin/services', label: 'Services', icon: Calendar });
  if (catalogChildren.length > 0) menu.push({ label: 'Catalog', icon: Package, children: catalogChildren });

  // Operations group
  const opsChildren = [];
  if (p.orders?.view) opsChildren.push({ path: '/admin/orders', label: 'Orders', icon: ShoppingCart });
  if (p.bookings?.view) opsChildren.push({ path: '/admin/bookings', label: 'Bookings', icon: Calendar });
  if (p.customers?.view) opsChildren.push({ path: '/admin/customers', label: 'Customers', icon: Users });
  if (p.admin_chat?.view) opsChildren.push({ path: '/admin/chat', label: 'Chat', icon: MessageSquare });
  if (p.reviews?.view) opsChildren.push({ path: '/admin/reviews', label: 'Reviews', icon: Star });
  if (opsChildren.length > 0) menu.push({ label: 'Operations', icon: ShoppingBag, children: opsChildren });

  // Management group
  const mgmtChildren = [];
  if (p.vouchers?.view) mgmtChildren.push({ path: '/admin/vouchers', label: 'Vouchers', icon: Ticket });
  if (p.analytics?.view) mgmtChildren.push({ path: '/admin/stats', label: 'Stats', icon: TrendingUp });
  if (p.staff?.view) mgmtChildren.push({ path: '/admin/staff', label: 'Staff', icon: Users });
  if (mgmtChildren.length > 0) menu.push({ label: 'Management', icon: Settings, children: mgmtChildren });

  return menu;
};

// ═══════════════════════════════════════════════════════════════
// NAV ITEM SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

const NavLink = ({ item, isActive, collapsed, onClick }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative group/link ${
        isActive
          ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover/link:scale-105'}`} />
      {!collapsed && (
        <span className="text-[11px] font-bold tracking-wide truncate">{item.label}</span>
      )}
      {collapsed && (
        <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold rounded-lg opacity-0 group-hover/link:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-[200] shadow-xl">
          {item.label}
        </div>
      )}
    </Link>
  );
};

const NavGroup = ({ group, expanded, onToggle, isActive, collapsed, onNavigate }) => {
  const Icon = group.icon;
  const hasActiveChild = isActive;

  if (collapsed) {
    // Collapsed: show icon with flyout submenu on hover
    return (
      <div className="relative group/flyout">
        <button
          title={group.label}
          className={`flex items-center justify-center w-full px-3 py-2.5 rounded-xl transition-all duration-200 ${
            hasActiveChild
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
        </button>
        {/* Flyout submenu */}
        <div className="absolute left-full top-0 ml-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-2 min-w-[180px] opacity-0 invisible group-hover/flyout:opacity-100 group-hover/flyout:visible transition-all duration-200 z-[200]">
          <div className="px-3 py-1.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">{group.label}</div>
          {group.children.map(child => (
            <NavLink key={child.path} item={child} isActive={false} collapsed={false} onClick={onNavigate} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-200 group/btn ${
          hasActiveChild
            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="text-[11px] font-bold tracking-wide flex-1 text-left truncate">{group.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${expanded ? 'rotate-180' : ''} ${hasActiveChild ? 'text-primary-500' : 'text-slate-300 dark:text-slate-600'}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="pl-4 mt-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800 ml-[21px]">
          {group.children.map(child => {
            const ChildIcon = child.icon;
            const childActive = window.location.pathname === child.path;
            return (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 ${
                  childActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <ChildIcon className="h-[14px] w-[14px] shrink-0" />
                <span className="text-[10px] font-semibold tracking-wide truncate">{child.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// LAYOUT COMPONENT
// ═══════════════════════════════════════════════════════════════

const Layout = () => {
  const { user, logout, loading, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { getTotalItems } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Sidebar collapse state (persisted in localStorage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('pawzzle_sidebar') === 'collapsed'; } catch { return false; }
  });

  // Dropdown expanded state (persisted in sessionStorage)
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('pawzzle_nav_groups') || '{}'); } catch { return {}; }
  });

  // ── Scroll & Body Lock ──────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0) setScrollProgress((window.pageYOffset / h) * 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    document.body.style.height = isMobileMenuOpen ? '100vh' : '';
    return () => { document.body.style.overflow = ''; document.body.style.height = ''; };
  }, [isMobileMenuOpen]);

  // ── Handlers ────────────────────────────────────────────────
  const handleLogout = () => setShowLogoutModal(true);
  const confirmLogout = () => { logout(); setShowLogoutModal(false); };

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('pawzzle_sidebar', next ? 'collapsed' : 'expanded'); } catch {}
      return next;
    });
  }, []);

  const toggleGroup = useCallback((label) => {
    setExpandedGroups(prev => {
      const next = { ...prev, [label]: !prev[label] };
      try { sessionStorage.setItem('pawzzle_nav_groups', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Menu Selection ──────────────────────────────────────────
  const menuItems = useMemo(() => {
    if (!user) return publicMenu;
    switch (user.role) {
      case 'customer': return customerMenu;
      case 'admin': return adminMenu;
      case 'super_admin': return superAdminMenu;
      case 'staff': return getStaffMenu(user);
      case 'supplier': return supplierMenu;
      default: return publicMenu;
    }
  }, [user]);

  // Auto-expand group whose child is active
  useEffect(() => {
    const currentPath = location.pathname;
    menuItems.forEach(item => {
      if (item.children) {
        const hasActive = item.children.some(c => currentPath === c.path || currentPath.startsWith(c.path + '/'));
        if (hasActive && !expandedGroups[item.label]) {
          setExpandedGroups(prev => {
            const next = { ...prev, [item.label]: true };
            try { sessionStorage.setItem('pawzzle_nav_groups', JSON.stringify(next)); } catch {}
            return next;
          });
        }
      }
    });
  }, [location.pathname, menuItems]);

  const isActivePath = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const isGroupActive = (group) => {
    if (!group.children) return false;
    return group.children.some(c => isActivePath(c.path));
  };

  const isLandingPage = location.pathname === '/' && !isAuthenticated;
  const sidebarWidth = sidebarCollapsed ? 'w-[72px]' : 'w-64';
  const contentPadding = sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64';

  // ── Render Navigation Items ─────────────────────────────────
  const renderNavItems = (items, collapsed = false, onNav) => (
    <div className="space-y-1">
      {items.map((item, idx) => {
        if (item.children) {
          return (
            <NavGroup
              key={item.label}
              group={item}
              expanded={!!expandedGroups[item.label]}
              onToggle={() => toggleGroup(item.label)}
              isActive={isGroupActive(item)}
              collapsed={collapsed}
              onNavigate={onNav}
            />
          );
        }
        return (
          <NavLink
            key={item.path || idx}
            item={item}
            isActive={isActivePath(item.path)}
            collapsed={collapsed}
            onClick={onNav}
          />
        );
      })}
    </div>
  );

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row overflow-x-hidden transition-colors duration-300 ${isLandingPage ? '!bg-transparent' : ''}`}>

      {/* ── Scroll Progress Bar ── */}
      {!isLandingPage && (
        <div className="fixed top-0 left-0 h-0.5 bg-primary-600 z-[100] transition-all" style={{ width: `${scrollProgress}%` }} />
      )}

      {/* ═══════════════════════════════════════════════════════
          DESKTOP SIDEBAR
      ═══════════════════════════════════════════════════════ */}
      {!isLandingPage && (
        <aside className={`hidden lg:flex fixed left-0 top-0 h-screen ${sidebarWidth} bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 z-[60] flex-col transition-all duration-300 ease-in-out`}>

          {/* Logo */}
          <div className={`shrink-0 border-b border-slate-100 dark:border-slate-800 ${sidebarCollapsed ? 'px-3 py-5' : 'px-5 py-5'}`}>
            <Link to="/" className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <img src="/images/logo.png" alt="Logo" className="w-8 h-8 object-contain shrink-0 drop-shadow-md" />
              {!sidebarCollapsed && (
                <span className="text-lg font-black bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-400 dark:to-primary-500 tracking-tighter uppercase">
                  PAWZZLE
                </span>
              )}
            </Link>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 overflow-y-auto no-scrollbar py-4 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            {renderNavItems(menuItems, sidebarCollapsed)}
          </nav>

          {/* Bottom Actions */}
          <div className={`shrink-0 border-t border-slate-100 dark:border-slate-800 py-3 space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-all ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px] shrink-0 text-amber-400" /> : <Moon className="h-[18px] w-[18px] shrink-0" />}
              {!sidebarCollapsed && <span className="text-[11px] font-bold tracking-wide">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
            </button>

            {/* Logout */}
            {user && (
              <button
                onClick={handleLogout}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 transition-all group/logout ${sidebarCollapsed ? 'justify-center' : ''}`}
              >
                <LogOut className="h-[18px] w-[18px] shrink-0 group-hover/logout:-translate-x-0.5 transition-transform" />
                {!sidebarCollapsed && <span className="text-[11px] font-bold tracking-wide">Logout</span>}
              </button>
            )}

            {/* Collapse toggle */}
            <button
              onClick={toggleSidebar}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-500 dark:hover:text-slate-400 transition-all ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              {sidebarCollapsed ? <ChevronsRight className="h-[18px] w-[18px] shrink-0" /> : <ChevronsLeft className="h-[18px] w-[18px] shrink-0" />}
              {!sidebarCollapsed && <span className="text-[11px] font-bold tracking-wide text-slate-300 dark:text-slate-600">Collapse</span>}
            </button>
          </div>
        </aside>
      )}

      {/* ═══════════════════════════════════════════════════════
          MAIN CONTENT AREA
      ═══════════════════════════════════════════════════════ */}
      <div className={`flex-1 flex flex-col min-w-0 ${isLandingPage ? '' : `${contentPadding} pt-16`} main-content-area transition-all duration-300`}>

        {/* ── Header ── */}
        {!isLandingPage && (
          <header className={`fixed top-0 left-0 ${sidebarCollapsed ? 'lg:left-[72px]' : 'lg:left-64'} right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800 h-16 flex items-center px-4 justify-between transition-all duration-300`}>

            {/* Mobile: Hamburger + Logo */}
            <div className="lg:hidden flex items-center gap-3">
              <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
                <Menu className="h-6 w-6" />
              </button>
              <Link to="/" className="flex items-center gap-2">
                <img src="/images/logo.png" alt="Logo" className="h-7 w-7 object-contain" />
                <span className="font-extrabold text-primary-600 tracking-tighter uppercase text-sm">PAWZZLE</span>
              </Link>
            </div>

            {/* Desktop: Just the role badge */}
            <div className="hidden lg:flex items-center gap-2">
              {user && (
                <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.3em]">
                  {user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Seller' : user.role?.replace('_', ' ')} Panel
                </span>
              )}
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              {/* Mobile theme toggle */}
              <button onClick={toggleTheme} className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
              </button>

              {user && (
                <>
                  {user.role === 'customer' && (
                    <Link to="/cart" className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative">
                      <ShoppingCart size={18} />
                      {getTotalItems() > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-primary-200">
                          {getTotalItems()}
                        </span>
                      )}
                    </Link>
                  )}
                  <NotificationBell />
                  <Link to="/profile" className="flex items-center gap-2 border border-slate-200/80 dark:border-slate-700 p-1 rounded-full pr-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm">
                    <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-400 font-bold overflow-hidden text-xs shadow-inner">
                      {user.avatar || user.profilePicture ? (
                        <img src={getImageUrl(user.avatar || user.profilePicture)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        user.firstName ? user.firstName[0] : <User className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 hidden sm:block truncate max-w-[80px]">{user.firstName}</span>
                  </Link>
                </>
              )}
              {!user && (
                <Link to="/login" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-primary-700 transition-colors">Sign In</Link>
              )}
            </div>
          </header>
        )}

        {/* ── Page Content ── */}
        <main className={`flex-1 p-2 lg:p-4 ${isLandingPage ? 'p-0' : ''}`}>
          <Outlet />
        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MOBILE DRAWER
      ═══════════════════════════════════════════════════════ */}
      <div className={`fixed inset-0 z-[150] lg:hidden transition-all duration-300 ${isMobileMenuOpen ? 'visible' : 'invisible'}`}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* Drawer */}
        <aside className={`absolute top-0 left-0 h-full w-[280px] bg-white dark:bg-slate-900 shadow-2xl transition-transform duration-300 ease-out border-r border-slate-100 dark:border-slate-800 flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>

          {/* Drawer Header */}
          <div className="shrink-0 p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2" onClick={() => setIsMobileMenuOpen(false)}>
              <img src="/images/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
              <span className="font-extrabold text-primary-600 tracking-tighter uppercase">PAWZZLE</span>
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* User info pill */}
          {user && (
            <div className="shrink-0 px-5 py-3 border-b border-slate-50 dark:border-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-400 font-bold overflow-hidden text-sm shadow-inner">
                  {user.avatar || user.profilePicture ? (
                    <img src={getImageUrl(user.avatar || user.profilePicture)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    user.firstName ? user.firstName[0] : <User className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.firstName} {user.lastName}</p>
                  <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {user.role === 'super_admin' ? 'Super Admin' : user.role?.replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Mobile navigation */}
          <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-4">
            {renderNavItems(menuItems, false, () => setIsMobileMenuOpen(false))}
          </nav>

          {/* Mobile footer */}
          {user && (
            <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <button
                onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}
                className="flex items-center gap-3 w-full px-3 py-3 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-rose-600 rounded-xl transition-all active:scale-[0.98]"
              >
                <LogOut className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[11px] font-bold tracking-wide">Logout</span>
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* ── Modals & Overlays ── */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
      />
      {user?.role === 'customer' && <FloatingChatManager currentUser={user} />}
      <PasswordChangeModal />
    </div>
  );
};

export default Layout;
