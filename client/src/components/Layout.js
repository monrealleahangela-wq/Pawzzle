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
    <div className={`min-h-screen bg-[#FAF9F6] transition-colors duration-500 flex flex-col lg:flex-row overflow-x-hidden ${isLandingPage ? '!bg-transparent' : ''} font-['Outfit']`}>
      {/* Premium Ambiance Layer */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30 z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-amber-100/40 blur-[120px] rounded-full animate-spin-slow" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-primary-100/30 blur-[100px] rounded-full animate-blob-move" />
      </div>

      {/* Scroll Progress */}
      {!isLandingPage && (
        <div className="scroll-progress h-1.5 bg-accent-gradient" style={{ width: `${scrollProgress}%` }} />
      )}

      {/* Sidebar - Desktop Only with Premium Deep Espresso Palette */}
      {!isLandingPage && (
        <aside className={`hidden lg:flex fixed left-0 top-0 h-full w-24 hover:w-72 bg-[#211510] z-[70] flex-col transition-all duration-500 group shadow-[10px_0_40px_rgba(0,0,0,0.4)] overflow-hidden border-r border-[#3D2B23]`}>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5 pointer-events-none" />
          
          {/* Sidebar Logo Area with Gold Trim */}
          <Link
            to={!user ? '/' : user?.role === 'customer' ? '/home' : user?.role === 'super_admin' ? '/superadmin/dashboard' : '/admin/dashboard'}
            className="p-8 flex items-center gap-5 transition-all relative border-b border-[#3D2B23]"
          >
            <div className="w-10 h-10 flex-shrink-0 relative group-hover:rotate-[360deg] transition-transform duration-1000">
              <img
                src="/images/logo.png"
                alt="Logo"
                className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(184,137,90,0.6)]"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
              />
            </div>
            <span className="text-2xl font-black text-white tracking-[-0.05em] transition-all duration-500 whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-[-10px]">
              PAWZZLE <span className="text-amber-500">.</span>
            </span>
          </Link>

          {/* Sidebar Navigation */}
          <nav className="flex-1 px-5 py-8 space-y-3 overflow-y-auto no-scrollbar scroll-smooth relative z-10">
            {navItems.map((item, idx) => {
              if (item.type === 'label') {
                return (
                  <div key={`label-${idx}`} className="pt-8 pb-3 pl-4 transition-opacity duration-300">
                    <span className={`text-[10px] font-black text-amber-500/50 uppercase tracking-[0.4em] whitespace-nowrap transition-all opacity-0 group-hover:opacity-100 hidden group-hover:block`}>{item.label}</span>
                    <div className={`h-[2px] w-8 bg-amber-500/20 mt-1 block group-hover:hidden ml-1 rounded-full`} />
                  </div>
                );
              }

              const Icon = item.icon;
              const active = isActivePath(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                   className={`flex items-center gap-5 p-4 rounded-[1.25rem] transition-all duration-400 relative group/item ${active
                    ? 'bg-gradient-to-r from-amber-600/20 to-transparent text-amber-400 border border-amber-500/20 shadow-[0_10px_20px_rgba(0,0,0,0.2)]'
                    : 'text-amber-50/30 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  {active && <div className="absolute left-0 w-1.5 h-6 bg-amber-500 rounded-r-full shadow-[0_0_15px_rgba(245,158,11,0.6)]" />}
                  <div className={`w-6 h-6 flex items-center justify-center flex-shrink-0 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover/item:scale-110'}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className={`text-[12px] font-black uppercase tracking-[0.15em] opacity-0 group-hover:opacity-100 transition-all duration-500 whitespace-nowrap`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-6 border-t border-[#3D2B23] flex items-center justify-center group-hover:justify-start gap-4">
             <div className="w-10 h-10 rounded-xl bg-[#3D2B23] flex items-center justify-center text-amber-500 shadow-inner group-hover:scale-110 transition-all">
                <Settings2 className="h-5 w-5" />
             </div>
             <span className="text-[10px] font-black text-amber-500/40 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap">System Matrix 2.4</span>
          </div>
        </aside>
      )}

      {/* Main Content Area - Stable Header with Centered HUD Pill */}
      <div className={`flex-1 transition-all duration-500 w-full min-w-0 z-10 ${isLandingPage ? '!bg-transparent !pl-0 !pt-0' : 'lg:pl-24 pt-28'}`}>
        {/* Header - Fixed to ensure it persists on scroll */}
        {!isLandingPage && (
          <header className={`fixed top-0 left-0 lg:left-24 right-0 z-50 transition-all duration-500 pointer-events-none ${isScrolled ? 'pt-2 scale-[0.98]' : 'pt-6'}`}>
          <div className="container-custom pointer-events-auto max-w-6xl mx-auto px-4">
            <div className={`flex justify-between items-center bg-white/80 backdrop-blur-2xl rounded-[2.5rem] p-3 shadow-[0_20px_50px_rgba(93,64,55,0.12)] border border-white/50 gap-6 transition-all duration-500 ${isScrolled ? 'px-6 border-amber-500/10' : 'px-8'}`}>
              {/* Mobile Only: Logo */}
              <Link
                to={!user ? '/' : user?.role === 'customer' ? '/home' : user?.role === 'super_admin' ? '/superadmin/dashboard' : '/admin/dashboard'}
                className="flex lg:hidden items-center space-x-3 group shrink-0"
              >
                <div className="relative p-1 bg-primary-600 rounded-xl shadow-lg shadow-primary-200">
                  <img src="/images/logo.png" className="h-8 w-auto object-contain brightness-0 invert" />
                </div>
                <span className={`text-xl font-black tracking-[-0.05em] text-[#5D4037] logo-text sm:inline`}>
                  PAWZZLE
                </span>
              </Link>

              {/* HUD PILL: Role & Identity Indicator */}
              {user && (
                <div className="hidden sm:flex items-center gap-3 bg-[#FAF9F6] px-5 py-2.5 rounded-2xl border border-[#5D4037]/5 shadow-inner group cursor-default">
                   <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                   <span className="text-[10px] font-black text-[#5D4037]/40 uppercase tracking-[0.2em]">{user?.role?.replace('_', ' ')} SESSION</span>
                </div>
              )}

              {/* UTILITY MODULE: Right Aligned Actions */}
              <div className="flex items-center gap-3 group-actions pr-1 ml-auto">
                {/* Global Theme Toggle */}
                <button
                  onClick={toggleTheme}
                  className="p-3.5 bg-white border border-[#5D4037]/5 rounded-2xl text-[#5D4037]/40 hover:text-amber-600 hover:bg-amber-50 transition-all shadow-[0_8px_15px_rgba(0,0,0,0.05)] flex items-center justify-center shrink-0 active:scale-90"
                  title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>

                {user ? (
                  <>
                    <NotificationBell className="p-3.5" />
                    
                    {user?.role === 'customer' && (
                      <Link
                        to="/cart"
                        className="p-3.5 bg-white border border-[#5D4037]/5 rounded-2xl text-[#5D4037]/40 hover:text-amber-600 hover:bg-amber-50 transition-all shadow-[0_8px_15px_rgba(0,0,0,0.05)] relative shrink-0 active:scale-90"
                        title="View Cart"
                      >
                        <ShoppingCart className="h-5 w-5" />
                        {getTotalItems() > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-amber-600 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xl">
                            {getTotalItems()}
                          </span>
                        )}
                      </Link>
                    )}
                    <Link
                      to="/profile"
                      className="p-1 px-1 bg-gradient-to-br from-[#3D2B23] to-[#211510] text-white rounded-2xl shadow-2xl hover:shadow-amber-500/20 transition-all flex items-center justify-center shrink-0 border border-white/10 active:scale-95"
                      title="View Profile"
                    >
                      <div className="w-10 h-10 rounded-[0.8rem] overflow-hidden flex items-center justify-center text-[13px] font-black tracking-tighter">
                        {user?.avatar || user?.profilePicture ? (
                          <img src={user?.avatar || user?.profilePicture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          user?.firstName?.[0]?.toUpperCase() || 'P'
                        )}
                      </div>
                    </Link>
    
                    <button
                      onClick={handleLogout}
                      className="hidden lg:flex p-3.5 bg-white border border-[#5D4037]/5 rounded-2xl text-[#5D4037]/40 hover:text-rose-600 hover:bg-rose-50 transition-all shadow-[0_8px_15px_rgba(0,0,0,0.05)] flex items-center justify-center shrink-0 active:scale-90"
                    >
                      <LogOut className="h-5 w-5" />
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-4 px-2">
                    <Link 
                      to="/login" 
                      className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5D4037]/60 hover:text-amber-600 transition-colors"
                    >
                      LOGIN
                    </Link>
                    <Link 
                      to="/register" 
                      className="px-8 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_15px_30px_rgba(184,137,90,0.3)] hover:shadow-amber-600/40 hover:translate-y-[-2px] transition-all active:scale-95"
                    >
                      UPGRADE
                    </Link>
                  </div>
                )}

                {/* Mobile Menu Icon */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="lg:hidden p-3.5 bg-white rounded-2xl text-[#5D4037] border border-[#5D4037]/10 shadow-lg"
                >
                  <Menu className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Navigation Drawer (Overlay) */}
          {isMobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-[100] animate-fade-in pointer-events-auto font-['Outfit']">
              <div 
                className="absolute inset-0 bg-[#211510]/60 backdrop-blur-md" 
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <div className="absolute top-0 right-0 h-full w-[85%] max-w-sm bg-[#FAF9F6] shadow-2xl p-8 flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between mb-12">
                    <div className="flex items-center gap-4">
                      {user ? (
                        <>
                          <div className="w-14 h-14 bg-gradient-to-br from-amber-600 to-amber-800 rounded-2xl flex items-center justify-center text-white font-black overflow-hidden shadow-xl border-2 border-white">
                            {user?.avatar || user?.profilePicture ? (
                              <img src={user?.avatar || user?.profilePicture} alt="" className="w-full h-full object-cover" />
                            ) : (
                              user?.firstName?.[0]?.toUpperCase() || 'P'
                            )}
                          </div>
                          <div>
                            <p className="text-lg font-black text-[#5D4037] tracking-tight">{user?.firstName}</p>
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] leading-none mt-1">{user?.role?.replace('_', ' ')}</p>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-xl border border-amber-100">
                            <User className="h-7 w-7" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-[#5D4037] uppercase tracking-tight leading-none mb-1">GUEST <span className="text-amber-600">CORE</span></p>
                            <p className="text-[10px] font-bold text-[#5D4037]/40 uppercase tracking-[0.2em] leading-none">SYSTEM ACCESS GRANTED</p>
                          </div>
                        </div>
                      )}
                    </div>
                   <button onClick={() => setIsMobileMenuOpen(false)} className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-amber-600 shadow-lg border border-amber-100">
                     <X className="h-6 w-6" />
                   </button>
                </div>

                <div className="flex-1 space-y-8">
                  {navItems.reduce((acc, item, idx) => {
                    if (item.type === 'label') {
                      acc.push(
                        <div key={`mlabel-${idx}`} className="pt-6 border-t border-[#5D4037]/5 mt-8 first:pt-0 first:border-0 first:mt-0">
                          <span className="text-[11px] font-black text-amber-600/40 uppercase tracking-[0.3em]">{item.label}</span>
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
                          className={`flex items-center gap-5 p-5 rounded-3xl transition-all ${active
                            ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white font-black shadow-[0_15px_30px_rgba(184,137,90,0.3)]'
                            : 'text-[#5D4037]/60 font-black hover:bg-white border border-transparent hover:border-amber-100'
                            }`}
                        >
                          <Icon className={`h-6 w-6 ${active ? 'text-white' : 'text-amber-600/40'}`} />
                          <span className="text-xs uppercase tracking-[0.15em]">{item.label}</span>
                          <ChevronRight className={`ml-auto h-5 w-5 ${active ? 'opacity-100' : 'opacity-20'}`} />
                        </Link>
                      );
                    }
                    return acc;
                  }, [])}
                </div>

                {/* Drawer Footer */}
                {user && (
                   <button 
                    onClick={confirmLogout}
                    className="mt-12 w-full p-5 bg-rose-50 rounded-3xl flex items-center justify-center gap-4 text-rose-600 font-black text-xs uppercase tracking-[0.15em] border border-rose-100 shadow-sm active:scale-95 transition-all"
                   >
                     <LogOut className="h-5 w-5" />
                     Terminate Session
                   </button>
                )}
              </div>
            </div>
          )}
        </header>
        )}

        {/* Premium Logout Confirmation Modal */}
        {showLogoutModal && (
          <div className="fixed inset-0 bg-[#211510]/80 backdrop-blur-xl flex items-center justify-center z-[100] p-6">
            <div className="bg-white rounded-[3rem] p-12 max-w-sm w-full mx-auto shadow-2xl border border-white/50 animate-scale-in text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-rose-500 to-rose-700" />
              <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-rose-100">
                <LogOut className="h-10 w-10 text-rose-600" />
              </div>
              <h3 className="text-2xl font-black text-[#5D4037] tracking-tight mb-4 uppercase">Terminate Session?</h3>
              <p className="text-[12px] font-bold text-[#5D4037]/40 uppercase tracking-widest leading-relaxed mb-10">You will be securely disconnected from the Pawzzle network.</p>
              <div className="flex flex-col gap-4">
                <button
                  onClick={confirmLogout}
                  className="w-full py-5 bg-rose-600 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-rose-700 transition-all shadow-[0_15px_30px_rgba(225,29,72,0.3)] active:scale-95"
                >
                  Yes, Disconnect
                </button>
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="w-full py-5 bg-[#FAF9F6] text-[#5D4037]/60 text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-white hover:text-[#5D4037] transition-all border border-[#5D4037]/5"
                >
                  Stay Connected
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Page Entrance Animation Container */}
        <main className={`container-custom py-10 pb-40 lg:pb-12 relative z-10 page-transition`}>
           <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Bottom Navigation for Mobile — Premium Glass Morphism */}
      <nav id="mobile-bottom-nav" className="lg:hidden fixed bottom-8 left-1/2 -translate-x-1/2 w-[94%] max-w-lg bg-[#FAF9F6]/80 backdrop-blur-3xl border border-white/50 px-3 py-4 rounded-[3rem] z-[80] flex justify-around items-center shadow-[0_30px_60px_-15px_rgba(93,64,55,0.25)] ring-1 ring-white/50 transition-all duration-500">
        <div className="absolute inset-0 rounded-[3rem] border-2 border-white/80 pointer-events-none" />
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-2 px-4 py-1.5 rounded-3xl transition-all duration-500 ${active ? 'text-amber-600 scale-110' : 'text-[#5D4037]/30 hover:text-amber-600/60'}`}
            >
              <div className={`relative p-3 rounded-[1.25rem] transition-all duration-500 ${active ? 'bg-white shadow-[0_10px_20px_rgba(184,137,90,0.15)] scale-110' : ''}`}>
                <Icon className={`h-6 w-6 ${active ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                {item.label === 'Shop' && getTotalItems() > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[9px] font-black rounded-full h-5 w-5 flex items-center justify-center border-2 border-[#FAF9F6] shadow-xl animate-pulse">
                    {getTotalItems()}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-black uppercase tracking-[0.1em] transition-all duration-500 ${active ? 'opacity-100' : 'opacity-0 h-0 scale-0'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Floating Chat Manager for Customers — Premium Branded */}
      {user?.role === 'customer' && (
        <FloatingChatManager currentUser={user} />
      )}

      {/* Mandatory Password Change enforcement */}
      <PasswordChangeModal />
    </div>
  );
};

export default Layout;
