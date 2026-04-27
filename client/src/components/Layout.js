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
  History, ShieldCheck, Truck, Layers, ChevronsLeft, ChevronsRight, Store
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
  { path: '/home', label: 'Home', icon: House },
  {
    label: 'Marketplace', icon: ShoppingBag, children: [
      { path: '/pets', label: 'Pets', icon: Heart },
      { path: '/products', label: 'Products', icon: Package },
      { path: '/find-shops', label: 'Find Shops', icon: MapPin },
      { path: '/orders', label: 'My Orders', icon: ShoppingCart },
      { path: '/vouchers', label: 'Vouchers', icon: Ticket },
    ]
  },
  {
    label: 'Services', icon: Calendar, children: [
      { path: '/services', label: 'Browse Services', icon: Calendar },
    ]
  },
  { path: '/insights', label: 'AI Advisor', icon: Brain },
  {
    label: 'Account', icon: User, children: [
      { path: '/profile', label: 'My Profile', icon: Settings },
      { path: '/account-upgrade', label: 'Sell on Pawzzle', icon: Store },
    ]
  },
];

const getAdminMenu = (user) => {
  const mods = user?.store?.operationalModules || [];
  const hasPets = mods.includes('pets');
  const hasProducts = mods.includes('products');
  const hasServices = mods.includes('services');
  const role = user?.role;
  const staffType = user?.staffType;

  const isGlobalAdmin = role === 'admin' || role === 'super_admin';

  const menu = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
  ];

  const hasAccess = (requiredRoles) => {
    if (isGlobalAdmin) return true;
    if (role === 'staff' && requiredRoles.includes(staffType)) return true;
    return false;
  };

  if (isGlobalAdmin || hasAccess(['service_management_staff'])) {
    menu.push({ path: '/admin/insights', label: 'Insights', icon: Brain });
  }

  const catalogChildren = [];
  if (hasPets && hasAccess(['inventory_staff'])) {
    catalogChildren.push({ path: '/admin/pets', label: 'Manage Pets', icon: Heart });
  }
  if (hasProducts && hasAccess(['inventory_staff'])) {
    catalogChildren.push({ path: '/admin/products', label: 'Manage Products', icon: Package });
  }
  if (hasServices && hasAccess(['service_management_staff', 'veterinarian', 'groomer', 'trainer'])) {
    catalogChildren.push({ path: '/admin/services', label: 'Manage Services', icon: Calendar });
  }
  if (catalogChildren.length > 0) menu.push({ label: 'Catalog', icon: Layers, children: catalogChildren });

  const opsChildren = [];
  if (hasAccess(['logistics_staff', 'sales_staff', 'order_staff'])) {
    opsChildren.push({ path: '/admin/orders', label: 'Product Orders', icon: ShoppingCart });
  }
  if (hasServices && hasAccess(['service_management_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_specialist'])) {
    opsChildren.push({ path: '/admin/bookings', label: 'Service Bookings', icon: Calendar });
  }
  
  if (isGlobalAdmin || hasAccess(['sales_staff', 'administrative_support'])) {
    opsChildren.push({ path: '/admin/customers', label: 'Customers', icon: Users });
  }
  
  opsChildren.push({ path: '/admin/chat', label: 'Chat', icon: MessageSquare });
  
  if (isGlobalAdmin || hasAccess(['administrative_support'])) {
    opsChildren.push({ path: '/admin/reviews', label: 'Reviews', icon: Star });
  }
  
  if (opsChildren.length > 0) menu.push({ label: 'Operations', icon: ShoppingBag, children: opsChildren });

  if (hasProducts && hasAccess(['inventory_staff'])) {
    menu.push({
      label: 'Supply Chain', icon: Truck, children: [
        { path: '/admin/purchase-orders', label: 'Purchase Orders', icon: Truck },
        { path: '/admin/supplies', label: 'Manage Suppliers', icon: Layers },
      ]
    });
  }

  if (isGlobalAdmin || hasAccess(['sales_staff', 'administrative_support'])) {
    const financeChildren = [
      { path: '/admin/vouchers', label: 'Vouchers', icon: Ticket },
      { path: '/admin/payouts', label: 'Payouts', icon: Wallet },
    ];
    menu.push({ label: 'Finance', icon: DollarSign, children: financeChildren });
  }

  if (isGlobalAdmin) {
    const settingsChildren = [{ path: '/admin/store', label: 'Store Details', icon: Building }];
    const hasStaffConfig = user?.store?.staffingConfiguration?.hasStaff !== 'no';
    if (hasStaffConfig) {
      settingsChildren.push({ path: '/admin/staff', label: 'Manage Staff', icon: Users });
    }
    menu.push({ label: 'Settings', icon: Settings, children: settingsChildren });
  }

  return menu;
};


const superAdminMenu = [
  { path: '/superadmin/dashboard', label: 'Dashboard', icon: Activity },
  {
    label: 'Insights', icon: Brain, children: [
      { path: '/superadmin/insights', label: 'Decisions', icon: Brain },
      { path: '/superadmin/system-analytics', label: 'Statistics', icon: TrendingUp },
    ]
  },
  {
    label: 'Users', icon: Users, children: [
      { path: '/superadmin/account-management', label: 'Manage Accounts', icon: Users },
      { path: '/superadmin/store-applications', label: 'Applications', icon: FileText },
    ]
  },
  {
    label: 'Operations', icon: ShoppingBag, children: [
      { path: '/superadmin/transaction-history', label: 'Payments', icon: DollarSign },
      { path: '/superadmin/booking-history', label: 'Bookings', icon: Calendar },
      { path: '/superadmin/payouts', label: 'Withdrawals', icon: Wallet },
      { path: '/superadmin/archive', label: 'Deleted Items', icon: Archive },
    ]
  },
  {
    label: 'Support', icon: ShieldCheck, children: [
      { path: '/superadmin/reports', label: 'Reports', icon: AlertCircle },
      { path: '/superadmin/feedback', label: 'Feedback', icon: Star },
      { path: '/superadmin/support', label: 'Chat Help', icon: HelpCircle },
      { path: '/superadmin/activity-history', label: 'System Logs', icon: History },
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

  const catalogChildren = [];
  if (p.inventory?.view) catalogChildren.push({ path: '/admin/pets', label: 'Pets', icon: Heart });
  if (p.inventory?.view) catalogChildren.push({ path: '/admin/products', label: 'Products', icon: Package });
  if (p.services?.view) catalogChildren.push({ path: '/admin/services', label: 'Services', icon: Calendar });
  if (catalogChildren.length > 0) menu.push({ label: 'Catalog', icon: Package, children: catalogChildren });

  const opsChildren = [];
  if (p.orders?.view) opsChildren.push({ path: '/admin/orders', label: 'Orders', icon: ShoppingCart });
  if (p.bookings?.view) opsChildren.push({ path: '/admin/bookings', label: 'Bookings', icon: Calendar });
  if (p.customers?.view) opsChildren.push({ path: '/admin/customers', label: 'Customers', icon: Users });
  if (p.admin_chat?.view) opsChildren.push({ path: '/admin/chat', label: 'Chat', icon: MessageSquare });
  if (p.reviews?.view) opsChildren.push({ path: '/admin/reviews', label: 'Reviews', icon: Star });
  if (opsChildren.length > 0) menu.push({ label: 'Operations', icon: ShoppingBag, children: opsChildren });

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
      className={`flex items-center gap-4 px-5 py-4 rounded-3xl transition-all duration-300 relative group/link ${isActive
          ? 'bg-primary text-white shadow-strong'
          : 'text-slate-500 hover:bg-primary/5 hover:text-primary'
        } ${collapsed ? 'justify-center px-3' : ''}`}
    >
      <Icon className={`h-5 w-5 shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover/link:scale-110'}`} />
      {!collapsed && (
        <span className="text-xs font-bold tracking-tight truncate">{item.label}</span>
      )}
      {collapsed && (
        <div className="absolute left-full ml-4 px-3 py-2 bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl opacity-0 group-hover/link:opacity-100 pointer-events-none transition-all duration-300 whitespace-nowrap z-[200] shadow-premium translate-x-2 group-hover/link:translate-x-0">
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
    return (
      <div className="relative group/flyout">
        <button
          title={group.label}
          className={`flex items-center justify-center w-full px-5 py-4 rounded-3xl transition-all duration-300 ${hasActiveChild
              ? 'bg-primary/10 text-primary'
              : 'text-slate-400 hover:bg-neutral-50 hover:text-slate-600'
            }`}
        >
          <Icon className="h-5 w-5 shrink-0" />
        </button>
        <div className="absolute left-full top-0 ml-4 bg-white border border-slate-100 rounded-[2rem] shadow-premium p-3 min-w-[220px] opacity-0 invisible group-hover/flyout:opacity-100 group-hover/flyout:visible transition-all duration-300 z-[200] translate-x-4 group-hover/flyout:translate-x-0">
          <div className="px-5 py-2 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2">{group.label}</div>
          <div className="space-y-1">
            {group.children.map(child => (
              <NavLink key={child.path} item={child} isActive={window.location.pathname === child.path} collapsed={false} onClick={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={onToggle}
        className={`flex items-center gap-4 w-full px-5 py-4 rounded-3xl transition-all duration-300 group/btn ${hasActiveChild
            ? 'bg-primary/5 text-primary'
            : 'text-slate-500 hover:bg-neutral-50 hover:text-neutral-900'
          }`}
      >
        <Icon className="h-5 w-5 shrink-0 transition-transform group-hover/btn:scale-110" />
        <span className="text-xs font-bold tracking-tight flex-1 text-left truncate">{group.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-500 ${expanded ? 'rotate-180' : ''} text-slate-300`} />
      </button>
      <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${expanded ? 'max-h-[600px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
        <div className="pl-6 space-y-1 border-l-2 border-slate-50 ml-7 py-2">
          {group.children.map(child => {
            const ChildIcon = child.icon;
            const childActive = window.location.pathname === child.path;
            return (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-300 ${childActive
                    ? 'bg-primary text-white shadow-medium scale-[1.02]'
                    : 'text-slate-400 hover:text-primary hover:bg-primary/5'
                  }`}
              >
                <ChildIcon className="h-4 w-4 shrink-0" />
                <span className="text-[11px] font-bold tracking-tight truncate">{child.label}</span>
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

  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    try { return localStorage.getItem('pawzzle_sidebar_pinned') === 'true'; } catch { return false; }
  });
  
  const [isHovered, setIsHovered] = useState(false);
  const sidebarCollapsed = !isSidebarPinned && !isHovered;

  const [expandedGroups, setExpandedGroups] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('pawzzle_nav_groups') || '{}'); } catch { return {}; }
  });

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
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  const handleLogout = () => setShowLogoutModal(true);
  const confirmLogout = () => { logout(); setShowLogoutModal(false); };

  const toggleSidebar = useCallback(() => {
    setIsSidebarPinned(prev => {
      const next = !prev;
      try { localStorage.setItem('pawzzle_sidebar_pinned', next ? 'true' : 'false'); } catch { }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((label) => {
    setExpandedGroups(prev => {
      const next = { ...prev, [label]: !prev[label] };
      try { sessionStorage.setItem('pawzzle_nav_groups', JSON.stringify(next)); } catch { }
      return next;
    });
  }, []);

  const menuItems = useMemo(() => {
    if (!user) return publicMenu;
    switch (user.role) {
      case 'customer': return customerMenu;
      case 'admin': return getAdminMenu(user);
      case 'super_admin': return superAdminMenu;
      case 'staff': return getStaffMenu(user);
      case 'supplier': return supplierMenu;
      default: return publicMenu;
    }
  }, [user]);

  useEffect(() => {
    const currentPath = location.pathname;
    menuItems.forEach(item => {
      if (item.children) {
        const hasActive = item.children.some(c => currentPath === c.path || currentPath.startsWith(c.path + '/'));
        if (hasActive && !expandedGroups[item.label]) {
          setExpandedGroups(prev => {
            const next = { ...prev, [item.label]: true };
            try { sessionStorage.setItem('pawzzle_nav_groups', JSON.stringify(next)); } catch { }
            return next;
          });
        }
      }
    });
  }, [location.pathname, menuItems]);

  const isActivePath = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isGroupActive = (group) => group.children?.some(c => isActivePath(c.path));
  const isLandingPage = location.pathname === '/' && !isAuthenticated;
  const sidebarWidth = sidebarCollapsed ? 'w-[100px]' : 'w-[320px]';
  const contentPadding = isSidebarPinned ? 'lg:pl-[320px]' : 'lg:pl-[100px]';

  const renderNavItems = (items, collapsed = false, onNav) => (
    <div className="space-y-2">
      {items.map((item, idx) => (
        item.children ? (
          <NavGroup
            key={item.label}
            group={item}
            expanded={!!expandedGroups[item.label]}
            onToggle={() => toggleGroup(item.label)}
            isActive={isGroupActive(item)}
            collapsed={collapsed}
            onNavigate={onNav}
          />
        ) : (
          <NavLink
            key={item.path || idx}
            item={item}
            isActive={isActivePath(item.path)}
            collapsed={collapsed}
            onClick={onNav}
          />
        )
      ))}
    </div>
  );

  return (
    <div className={`min-h-screen bg-neutral-50 flex flex-col lg:flex-row overflow-x-hidden ${isLandingPage ? '!bg-transparent' : ''}`}>
      
      {!isLandingPage && (
        <div className="fixed top-0 left-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary z-[100] transition-all duration-300" 
             style={{ width: `${scrollProgress}%` }} />
      )}

      {!isLandingPage && (
        <aside 
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`hidden lg:flex fixed left-0 top-0 h-screen ${sidebarWidth} bg-white border-r border-slate-100 z-[60] flex-col transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-2xl shadow-slate-900/5`}
        >
          <div className={`shrink-0 flex items-center ${sidebarCollapsed ? 'px-4 py-8 justify-center' : 'px-10 py-10'} transition-all duration-500`}>
            <Link to="/" className="flex items-center gap-5 group/logo">
              <div className="w-12 h-12 bg-primary rounded-[1.25rem] flex items-center justify-center shadow-strong group-hover/logo:scale-110 transition-transform duration-500">
                <img src="/images/logo.png" alt="Logo" className="w-7 h-7 object-contain brightness-0 invert" />
              </div>
              {!sidebarCollapsed && (
                <div className="flex flex-col animate-scale-in">
                  <span className="text-2xl font-black tracking-tighter text-neutral-900 uppercase leading-none">PAWZZLE</span>
                  <span className="text-[9px] font-black text-primary tracking-[0.4em] uppercase mt-1">Ecosystem</span>
                </div>
              )}
            </Link>
          </div>

          <nav className={`flex-1 overflow-y-auto no-scrollbar py-6 ${sidebarCollapsed ? 'px-4' : 'px-8'}`}>
            {renderNavItems(menuItems, sidebarCollapsed)}
          </nav>

          <div className={`shrink-0 border-t border-slate-50 py-8 space-y-2 ${sidebarCollapsed ? 'px-4' : 'px-8'}`}>
            <button onClick={toggleTheme} className={`sidebar-nav-item !py-4 ${sidebarCollapsed ? 'justify-center px-0' : 'px-6'}`}>
              {theme === 'dark' ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-slate-400" />}
              {!sidebarCollapsed && <span className="text-xs">Appearance</span>}
            </button>

            {user && (
              <button onClick={handleLogout} className={`flex items-center gap-5 px-6 py-4 rounded-[1.5rem] text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all duration-300 w-full ${sidebarCollapsed ? 'justify-center px-0' : ''}`}>
                <LogOut className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed && <span className="text-[10px] font-black uppercase tracking-widest truncate">Sign Out</span>}
              </button>
            )}

            <button onClick={toggleSidebar} className={`flex items-center gap-5 px-6 py-4 text-slate-200 hover:text-primary transition-all duration-300 w-full ${sidebarCollapsed ? 'justify-center px-0' : ''}`}>
              {isSidebarPinned ? <ChevronsLeft className="h-5 w-5 shrink-0" /> : <ChevronsRight className="h-5 w-5 shrink-0" />}
              {!sidebarCollapsed && <span className="text-[9px] font-black uppercase tracking-widest truncate">Locked</span>}
            </button>
          </div>
        </aside>
      )}

      <div className={`flex-1 flex flex-col min-w-0 ${isLandingPage ? '' : `${contentPadding} pt-20`} transition-all duration-500`}>
        {!isLandingPage && (
          <header className={`fixed top-0 left-0 ${sidebarCollapsed ? 'lg:left-[100px]' : 'lg:left-[320px]'} right-0 z-50 glass-effect h-24 flex items-center px-10 justify-between transition-all duration-500 shadow-soft`}>
            <div className="flex items-center gap-6">
              <div className="lg:hidden">
                <button onClick={() => setIsMobileMenuOpen(true)} className="p-4 bg-white shadow-soft rounded-3xl text-neutral-800">
                  <Menu className="h-7 w-7" />
                </button>
              </div>
              <div className="hidden lg:flex items-center gap-4">
                 <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.4em]">
                   {user?.role === 'super_admin' ? 'Master Control' : 'Platform Operations'}
                 </span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {user && (
                <>
                  <div className="flex items-center gap-3">
                    {user.role === 'customer' && (
                      <Link to="/cart" className="p-4 bg-white hover:bg-neutral-50 rounded-[1.5rem] text-neutral-600 transition-all shadow-soft relative group">
                        <ShoppingCart size={22} className="group-hover:scale-110 transition-transform" />
                        {getTotalItems() > 0 && (
                          <span className="absolute -top-1 -right-1 w-6 h-6 bg-primary text-white text-[11px] font-black rounded-xl flex items-center justify-center shadow-lg animate-scale-in">
                            {getTotalItems()}
                          </span>
                        )}
                      </Link>
                    )}
                    <NotificationBell />
                  </div>

                  <Link to="/profile" className="flex items-center gap-5 p-2 bg-white rounded-[2rem] border border-slate-50 hover:shadow-medium transition-all group">
                    <div className="flex flex-col text-right hidden sm:flex px-2">
                      <span className="text-sm font-black text-neutral-900 leading-none">{user.firstName}</span>
                      <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1.5">Verified</span>
                    </div>
                    <div className="w-12 h-12 rounded-[1.25rem] bg-neutral-100 flex items-center justify-center text-primary font-bold overflow-hidden shadow-inner group-hover:scale-105 transition-transform shrink-0">
                      {user.avatar || user.profilePicture ? (
                        <img src={getImageUrl(user.avatar || user.profilePicture)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        user.firstName ? user.firstName[0] : <User className="h-5 w-5" />
                      )}
                    </div>
                  </Link>
                </>
              )}
              {!user && (
                <Link to="/login" className="btn-primary">Access Portal</Link>
              )}
            </div>
          </header>
        )}

        <main className={`flex-1 p-6 lg:p-12 animate-fade-up ${isLandingPage ? 'p-0' : ''}`}>
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>
      </div>

      <div className={`fixed inset-0 z-[150] lg:hidden transition-all duration-500 ${isMobileMenuOpen ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-neutral-900/40 backdrop-blur-md transition-opacity duration-500 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
             onClick={() => setIsMobileMenuOpen(false)} />
        <aside className={`absolute top-0 left-0 h-full w-[320px] bg-white shadow-premium transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="shrink-0 p-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center">
                <img src="/images/logo.png" alt="Logo" className="w-6 h-6 brightness-0 invert" />
              </div>
              <span className="font-black text-neutral-900 tracking-tighter uppercase text-xl">PAWZZLE</span>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-4 bg-neutral-50 rounded-2xl text-neutral-400">
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto no-scrollbar p-8">
            {renderNavItems(menuItems, false, () => setIsMobileMenuOpen(false))}
          </nav>
          {user && (
            <div className="p-10 border-t border-slate-50">
              <button onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}
                      className="flex items-center gap-5 w-full p-5 bg-rose-50 text-rose-600 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.3em] active:scale-95 transition-all">
                <LogOut className="h-6 w-6" />
                <span>End Session</span>
              </button>
            </div>
          )}
        </aside>
      </div>

      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} onConfirm={confirmLogout} />
      {user?.role === 'customer' && <FloatingChatManager currentUser={user} />}
      <PasswordChangeModal />
    </div>
  );
};

export default Layout;
