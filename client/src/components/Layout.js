import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import {
  Heart,
  Package,
  Calendar,
  ShoppingCart,
  User,
  LogOut,
  Menu,
  X,
  Settings,
  Settings2,
  Home as House,
  Activity,
  Users,
  Filter,
  Clock,
  Building,
  DollarSign,
  TrendingUp,
  FileText,
  Search,
  ChevronRight,
  MessageSquare,
  ShoppingBag,
  Archive,
  Ticket,
  ShieldAlert,
  Star,
  Wallet,
  Brain,
  Zap,
  Moon,
  Sun
} from 'lucide-react';
import FloatingChatManager from './FloatingChatManager';
import NotificationBell from './NotificationBell';
import PasswordChangeModal from './auth/PasswordChangeModal';
import { useTheme } from '../contexts/ThemeContext';

const Layout = () => {
  const { user, logout, loading, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { getTotalItems } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Handle body scroll locking when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, [isMobileMenuOpen]);

  // Debug logging
  console.log('🔍 Layout Debug:', {
    user: user ? `${user.firstName} (${user.role})` : 'No user',
    isAuthenticated,
    userRole: user?.role,
    navItems: user?.role === 'customer' ? 'customerNavItems' :
      user?.role === 'super_admin' ? 'superAdminNavItems' : 'adminNavItems'
  });

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    logout();
    setShowLogoutModal(false);
  };

  const isActivePath = (path) => {
    return location.pathname === path;
  };

  const customerNavItems = [
    { path: '/home', label: 'Home', icon: House },
    { path: '/pets', label: 'Pets', icon: Heart },
    { path: '/products', label: 'Products', icon: Package },
    { path: '/services', label: 'Services', icon: Calendar },
    { path: '/orders', label: 'Transactions', icon: ShoppingBag },
    { path: '/vouchers', label: 'Vouchers', icon: Ticket },
    { path: '/insights', label: 'AI Care Advisor', icon: Brain },
  ];

  const adminNavItems = [
    { type: 'label', label: 'Overview' },
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/admin/insights', label: 'Intelligence', icon: Brain },
    { type: 'label', label: 'Catalog' },
    { path: '/admin/pets', label: 'Pets', icon: Heart },
    { path: '/admin/products', label: 'Products', icon: Package },
    { path: '/admin/services', label: 'Services', icon: Calendar },
    { type: 'label', label: 'Operations' },
    { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/admin/bookings', label: 'Bookings', icon: Calendar },
    { path: '/admin/customers', label: 'Customer Database', icon: Users },
    { path: '/admin/chat', label: 'Chat', icon: MessageSquare },
    { path: '/admin/reviews', label: 'Store Reviews', icon: Star },
    { type: 'label', label: 'Finance & Store' },
    { path: '/admin/vouchers', label: 'Vouchers', icon: Ticket },
    { path: '/admin/payouts', label: 'My Earnings', icon: Wallet },
    { path: '/admin/store', label: 'Store Management', icon: Building },
    { path: '/admin/settings', label: 'Store Settings', icon: Settings },
    { path: '/admin/staff', label: 'Staff Management', icon: Users },
  ];

  // Order Processing Staff nav
  const orderStaffNavItems = [
    { type: 'label', label: 'Sales & Bookings' },
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/admin/bookings', label: 'Bookings', icon: Calendar },
    { path: '/admin/customers', label: 'Customer Database', icon: Users },
    { path: '/admin/insights', label: 'Intelligence', icon: Brain },
  ];

  // Inventory Staff nav
  const inventoryStaffNavItems = [
    { type: 'label', label: 'Inventory' },
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/admin/pets', label: 'Pets', icon: Heart },
    { path: '/admin/products', label: 'Products', icon: Package },
    { path: '/admin/insights', label: 'Intelligence', icon: Brain },
  ];

  // Service Staff nav
  const serviceStaffNavItems = [
    { type: 'label', label: 'Services' },
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/admin/services', label: 'Services', icon: Calendar },
    { path: '/admin/bookings', label: 'Bookings', icon: Calendar },
    { path: '/admin/insights', label: 'Intelligence', icon: Brain },
  ];

  // Delivery Staff nav
  const deliveryStaffNavItems = [
    { type: 'label', label: 'Logistics' },
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/admin/customers', label: 'Customers', icon: Users },
    { path: '/admin/insights', label: 'Intelligence', icon: Brain },
  ];

  // General Staff nav (for managers or staff with no specific role)
  const generalStaffNavItems = [
    { type: 'label', label: 'Store Overview' },
    { path: '/admin/dashboard', label: 'Dashboard', icon: Activity },
    { type: 'label', label: 'Management' },
    { path: '/admin/pets', label: 'Pets', icon: Heart },
    { path: '/admin/products', label: 'Products', icon: Package },
    { path: '/admin/services', label: 'Services', icon: Calendar },
    { type: 'label', label: 'Operations' },
    { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/admin/bookings', label: 'Bookings', icon: Calendar },
    { path: '/admin/customers', label: 'Customer Database', icon: Users },
    { path: '/admin/chat', label: 'Chat', icon: MessageSquare },
    { path: '/admin/reviews', label: 'Store Reviews', icon: Star },
    { path: '/admin/insights', label: 'Intelligence', icon: Brain },
  ];

  const superAdminNavItems = [
    { type: 'label', label: 'System Overview' },
    { path: '/superadmin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/superadmin/insights', label: 'Platform DSS', icon: Brain },
    { path: '/superadmin/system-analytics', label: 'Analytics', icon: TrendingUp },
    { type: 'label', label: 'Management' },
    { path: '/superadmin/permissions', label: 'Role Permissions', icon: ShieldAlert },
    { path: '/superadmin/account-management', label: 'Accounts', icon: Users },
    { path: '/superadmin/store-applications', label: 'Store Applications', icon: FileText },
    { type: 'label', label: 'Operations' },
    { path: '/superadmin/transaction-history', label: 'Transactions', icon: DollarSign },
    { path: '/superadmin/booking-history', label: 'Bookings', icon: Calendar },
    { path: '/superadmin/payouts', label: 'Payout Requests', icon: Wallet },
    { type: 'label', label: 'Content & Safety' },
    { path: '/superadmin/reports', label: 'Safety Reports', icon: ShieldAlert },
    { path: '/superadmin/support', label: 'Support Requests', icon: MessageSquare },
    { path: '/superadmin/feedback', label: 'Platform Feedback', icon: MessageSquare },
    { path: '/superadmin/activity-history', label: 'Activity Audit', icon: Zap },
    { path: '/superadmin/archive', label: 'Archive', icon: Archive },
  ];

  const publicNavItems = [
    { path: '/home', label: 'Home', icon: House },
    { path: '/pets', label: 'Pets', icon: Heart },
    { path: '/products', label: 'Products', icon: Package },
    { path: '/services', label: 'Services', icon: Calendar },
    { path: '/search', label: 'Search', icon: Search }
  ];

  const navItems = user?.role === 'customer' ? customerNavItems :
    user?.role === 'super_admin' ? superAdminNavItems :
      user?.role === 'staff' ?
        (user?.staffType === 'order_staff' ? orderStaffNavItems :
          user?.staffType === 'inventory_staff' ? inventoryStaffNavItems :
            user?.staffType === 'service_staff' ? serviceStaffNavItems :
              user?.staffType === 'delivery_staff' ? deliveryStaffNavItems : generalStaffNavItems) :
        !user ? publicNavItems : adminNavItems;

  // Debug: Log navigation items
  console.log('🔍 Navigation Debug:', {
    userRole: user?.role,
    navItemsCount: navItems.length,
    navItems: navItems.map(item => item.label),
    customerNavItems: customerNavItems.map(item => item.label)
  });

  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    
    const handleResize = () => {
      scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    };

    const handleScroll = () => {
      const currentScroll = window.pageYOffset;
      if (scrollHeight > 0) {
        setScrollProgress((currentScroll / scrollHeight) * 100);
      }
      setIsScrolled(currentScroll > 40);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Bottom Nav Items for Mobile App Feel
  const getBottomNavItems = () => {
    if (user?.role === 'customer') {
      return [
        { path: '/home', label: 'Home', icon: House },
        { path: '/pets', label: 'Pets', icon: Heart },
        { path: '/products', label: 'Shop', icon: ShoppingBag },
        { path: '/services', label: 'Services', icon: Calendar },
        { path: '/profile', label: 'Me', icon: User },
      ];
    }
    if (user?.role === 'super_admin') {
      return [
        { path: '/superadmin/dashboard', label: 'Home', icon: House },
        { path: '/superadmin/store-applications', label: 'Stores', icon: Building },
        { path: '/superadmin/insights', label: 'Stats', icon: Activity },
        { path: '/superadmin/reports', label: 'Safety', icon: ShieldAlert },
        { path: '/profile', label: 'Admin', icon: User },
      ];
    }
    if (user?.role === 'admin') {
      return [
        { path: '/admin/dashboard', label: 'Home', icon: House },
        { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
        { path: '/admin/bookings', label: 'Bookings', icon: Calendar },
        { path: '/admin/chat', label: 'Chat', icon: MessageSquare },
        { path: '/profile', label: 'Me', icon: User },
      ];
    }
    if (user?.role === 'staff' && user?.staffType === 'delivery_staff') {
      return [
        { path: '/admin/dashboard', label: 'Home', icon: House },
        { path: '/admin/orders', label: 'Deliveries', icon: ShoppingCart },
        { path: '/admin/customers', label: 'Customers', icon: Users },
        { path: '/profile', label: 'Me', icon: User },
      ];
    }
    if (user?.role === 'staff') {
      return [
        { path: '/admin/dashboard', label: 'Home', icon: House },
        { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
        { path: '/admin/bookings', label: 'Bookings', icon: Calendar },
        { path: '/admin/chat', label: 'Chat', icon: MessageSquare },
        { path: '/profile', label: 'Me', icon: User },
      ];
    }
    return [
      { path: '/home', label: 'Home', icon: House },
      { path: '/pets', label: 'Pets', icon: Heart },
      { path: '/products', label: 'Shop', icon: ShoppingBag },
      { path: '/services', label: 'Services', icon: Calendar },
      { path: '/login', label: 'Login', icon: User },
    ];
  };

  const bottomNavItems = getBottomNavItems();
  const isLandingPage = location.pathname === '/' && !isAuthenticated;

  return (
    <div className={`min-h-screen bg-primary-50 transition-colors duration-500 flex flex-col lg:flex-row overflow-x-hidden ${isLandingPage ? '!bg-transparent' : ''}`}>
      {/* Scroll Progress */}
      {!isLandingPage && (
        <div className="scroll-progress" style={{ width: `${scrollProgress}%` }} />
      )}

      {/* Sidebar - Desktop Only with Premium Deep Brown Palette */}
      {!isLandingPage && (
        <aside className={`hidden lg:flex fixed left-0 top-0 h-full w-20 hover:w-64 bg-[#2D1B14] z-[70] flex-col transition-all duration-300 group shadow-2xl overflow-hidden border-r border-white/5`}>
          {/* Sidebar Logo Area */}
          <Link
            to={!user ? '/' : user?.role === 'customer' ? '/home' : user?.role === 'super_admin' ? '/superadmin/dashboard' : '/admin/dashboard'}
            className="p-6 flex items-center gap-4 transition-all"
          >
            <div className="w-8 h-8 flex-shrink-0 relative">
              <img
                src="/images/logo.png"
                alt="Logo"
                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 drop-shadow-xl"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
              />
            </div>
            <span className="text-xl font-black text-white tracking-tighter transition-all duration-300 whitespace-nowrap opacity-0 group-hover:opacity-100">
              PAWZZLE
            </span>
          </Link>

          {/* Sidebar Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto no-scrollbar scroll-smooth">
            {navItems.map((item, idx) => {
              if (item.type === 'label') {
                return (
                  <div key={`label-${idx}`} className="pt-6 pb-2 pl-3 transition-opacity duration-300">
                    <span className={`text-[9px] font-black text-amber-100/30 uppercase tracking-[0.3em] whitespace-nowrap transition-all opacity-0 group-hover:opacity-100 hidden group-hover:block`}>{item.label}</span>
                    <div className={`h-px w-6 bg-white/10 mt-1 block group-hover:hidden ml-1`} />
                  </div>
                );
              }

              const Icon = item.icon;
              const active = isActivePath(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 relative ${active
                    ? 'bg-amber-600/10 text-amber-500 shadow-xl shadow-black/20'
                    : 'text-amber-50/40 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`text-[11px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-white/5 h-16" />
        </aside>
      )}

      {/* Main Content Area - Stable Header with Centered HUD Pill */}
      <div className={`flex-1 transition-all duration-500 w-full min-w-0 bg-[#F8F7F4] ${isLandingPage ? '!bg-transparent !pl-0 !pt-0' : 'lg:pl-20 pt-24'}`}>
        {/* Header - Fixed to ensure it persists on scroll */}
        {!isLandingPage && (
          <header className={`fixed top-0 left-0 lg:left-20 right-0 z-30 transition-all duration-300 pointer-events-none ${isScrolled ? 'pt-2' : 'pt-4'}`}>
          <div className="container-custom pointer-events-auto">
            <div className="flex justify-between items-center bg-white/95 backdrop-blur-md rounded-3xl p-3 shadow-2xl shadow-slate-200/50 border border-slate-50 gap-4">
              {/* Mobile Only: Logo */}
              <Link
                to={!user ? '/' : user?.role === 'customer' ? '/home' : user?.role === 'super_admin' ? '/superadmin/dashboard' : '/admin/dashboard'}
                className="flex lg:hidden items-center space-x-2 group shrink-0"
              >
                <div className="relative">
                  <img src="/images/logo.png" className="h-8 w-auto object-contain transition-all duration-500 group-hover:scale-110 drop-shadow-xl" />
                </div>
                <span className={`text-lg font-black tracking-tighter text-primary-600 logo-text sm:inline`}>
                  PAWZZLE
                </span>
              </Link>

              {/* UTILITY MODULE: Right Aligned Actions */}
              <div className="flex items-center gap-2 group-actions pr-1 ml-auto">
                {/* Global Theme Toggle */}
                <button
                  onClick={toggleTheme}
                  className="p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-all shadow-sm flex items-center justify-center shrink-0"
                  title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                {user ? (
                  <>
                    <NotificationBell />
                    
                    {user?.role === 'customer' && (
                      <Link
                        to="/cart"
                        className="p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-primary-600 hover:bg-primary-50 hover:border-primary-100 transition-all shadow-sm relative shrink-0"
                        title="View Cart"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        {getTotalItems() > 0 && (
                          <span className="absolute -top-1 -right-1 bg-primary-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm font-sans">
                            {getTotalItems()}
                          </span>
                        )}
                      </Link>
                    )}
                    <Link
                      to="/profile"
                      className="p-1 px-1.5 bg-[#2D1B14] text-white rounded-xl shadow-xl hover:bg-amber-600 transition-all flex items-center justify-center shrink-0"
                      title="View Profile"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center text-[11px] font-black tracking-tighter">
                        {user?.avatar || user?.profilePicture ? (
                          <img src={user?.avatar || user?.profilePicture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          user?.firstName?.[0]?.toUpperCase() || 'P'
                        )}
                      </div>
                    </Link>
    
                    <button
                      onClick={handleLogout}
                      className="hidden lg:flex p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all shadow-sm flex items-center justify-center shrink-0"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-4 px-2">
                    <Link 
                      to="/login" 
                      className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-primary-600 transition-colors"
                    >
                      Sign In
                    </Link>
                    <Link 
                      to="/register" 
                      className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary-100 hover:bg-primary-700 transition-all active:scale-95"
                    >
                      Join
                    </Link>
                  </div>
                )}

                {/* Mobile Menu Icon */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="lg:hidden p-3 bg-slate-50 rounded-xl text-slate-900 border border-slate-100"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Navigation Drawer (Overlay) */}
          {isMobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-[100] animate-fade-in pointer-events-auto">
              <div 
                className="absolute inset-0 bg-primary-900/40 backdrop-blur-sm" 
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <div className="absolute top-0 right-0 h-full w-4/5 max-w-xs bg-white shadow-2xl p-6 flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      {user ? (
                        <>
                          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white font-black overflow-hidden">
                            {user?.avatar || user?.profilePicture ? (
                              <img src={user?.avatar || user?.profilePicture} alt="" className="w-full h-full object-cover" />
                            ) : (
                              user?.firstName?.[0]?.toUpperCase() || 'P'
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{user?.firstName}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{user?.role?.replace('_', ' ')}</p>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                            <User className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none mb-1">Welcome <span className="text-primary-600 italic">Guest</span></p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Accessing Public Tabs</p>
                          </div>
                        </div>
                      )}
                    </div>
                   <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 bg-slate-50 rounded-xl text-slate-400">
                     <X className="h-5 w-5" />
                   </button>
                </div>

                <div className="flex-1 space-y-6">
                  {navItems.reduce((acc, item, idx) => {
                    if (item.type === 'label') {
                      acc.push(
                        <div key={`mlabel-${idx}`} className="pt-2 border-t border-slate-50 mt-4 first:pt-0 first:border-0 first:mt-0">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{item.label}</span>
                        </div>
                      );
                    } else {
                      const Icon = item.icon;
                      const active = isActivePath(item.path);
                      acc.push(
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-4 p-3.5 rounded-2xl transition-all ${active
                            ? 'bg-primary-50 text-primary-600 font-black shadow-sm border border-primary-100'
                            : 'text-slate-500 font-bold hover:bg-slate-50'
                            }`}
                        >
                          <Icon className={`h-5 w-5 ${active ? 'text-primary-600' : 'text-slate-400'}`} />
                          <span className="text-xs uppercase tracking-wider">{item.label}</span>
                          <ChevronRight className="ml-auto h-4 w-4 opacity-30" />
                        </Link>
                      );
                    }
                    return acc;
                  }, [])}
                </div>

              </div>
            </div>
          )}
        </header>
        )}

        {/* Logout Confirmation Modal */}
        {showLogoutModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
            <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-2xl border border-primary-100 animate-scale-in">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Logout</h3>
              <p className="text-sm text-primary-600 mb-6">Are you sure you want to logout? This will terminate your secure session.</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setShowLogoutModal(false);
                    logout();
                  }}
                  className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200"
                >
                  Yes, Logout
                </button>
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="px-5 py-2 bg-primary-100 text-primary-700 text-sm font-medium rounded-lg hover:bg-primary-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main content Area Scrollable */}
        <main className="container-custom py-6 pb-36 lg:pb-6">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Bottom Navigation for Mobile */}
      <nav id="mobile-bottom-nav" className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-lg bg-white/90 backdrop-blur-2xl border border-white/20 px-2 py-3 rounded-[2.5rem] z-[50] flex justify-around items-center shadow-[0_15px_50px_rgba(0,0,0,0.15)] ring-1 ring-black/5 transition-all duration-300">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1.5 px-3 py-1 rounded-2xl transition-all ${active ? 'text-primary-600 scale-110' : 'text-slate-400'}`}
            >
              <div className={`relative p-2 rounded-[1.2rem] transition-all ${active ? 'bg-primary-50 shadow-sm' : ''}`}>
                <Icon className={`h-5 w-5 ${active ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                {item.label === 'Cart' && getTotalItems() > 0 && (
                  <span className="absolute -top-1 -right-1 bg-secondary-500 text-white text-[8px] rounded-full h-4 w-4 flex items-center justify-center font-bold shadow-lg">
                    {getTotalItems()}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-black uppercase tracking-tighter transition-all ${active ? 'opacity-100' : 'opacity-60'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Floating Chat Manager for Customers */}
      {user?.role === 'customer' && (
        <FloatingChatManager currentUser={user} />
      )}

      {/* Mandatory Password Change enforcement */}
      <PasswordChangeModal />
    </div>
  );
};

export default Layout;
