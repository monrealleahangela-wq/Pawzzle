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
  Zap
} from 'lucide-react';
import FloatingChatManager from './FloatingChatManager';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import PasswordChangeModal from './auth/PasswordChangeModal';

const Layout = () => {
  const { user, logout, loading, isAuthenticated } = useAuth();
  const { getTotalItems } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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
    { path: '/adoptions', label: 'Adoptions', icon: Heart },
    { path: '/orders', label: 'Orders', icon: ShoppingBag },
    { path: '/vouchers', label: 'Vouchers', icon: Ticket },
    { path: '/insights', label: 'Insights', icon: Brain },
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
            user?.staffType === 'service_staff' ? serviceStaffNavItems : generalStaffNavItems) :
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
    if (user?.role === 'admin' || user?.role === 'staff') {
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

  return (
    <div className="min-h-screen bg-primary-50 transition-colors duration-500 flex flex-col lg:flex-row overflow-x-hidden">
      {/* Scroll Progress */}
      <div
        className="scroll-progress"
        style={{ width: `${scrollProgress}%` }}
      />

      {/* Sidebar - Desktop Only */}
      <aside className={`hidden lg:flex fixed left-0 top-0 h-full w-20 hover:w-64 bg-primary-800 z-[60] flex-col transition-all duration-300 group shadow-2xl overflow-hidden border-r border-white/5`}>
        {/* Sidebar Logo Area */}
        <Link
          to={!user ? '/landing' : user?.role === 'customer' ? '/home' : user?.role === 'super_admin' ? '/superadmin/dashboard' : '/admin/dashboard'}
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
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/40">
          {navItems.map((item, idx) => {
            if (item.type === 'label') {
              return (
                <div key={`label-${idx}`} className="pt-4 pb-1 pl-3 transition-opacity duration-300">
                  <span className={`text-[9px] font-black text-primary-400/80 uppercase tracking-[0.2em] whitespace-nowrap transition-all opacity-0 group-hover:opacity-100 hidden group-hover:block`}>{item.label}</span>
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
                className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-300 relative ${active
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/40'
                  : 'text-primary-100 hover:bg-white/10 hover:text-white'
                  }`}
              >
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`text-sm font-bold tracking-wide opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap`}>
                  {item.label}
                </span>

                {/* Tooltip on hover when collapsed */}
                {!isScrolled && (
                  <div className="absolute left-full ml-4 px-3 py-1 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-md opacity-0 pointer-events-none group-hover:hidden transition-opacity">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer - Space reserved for future expansion or empty */}
        <div className="p-4 border-t border-white/5 h-16" />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-20 transition-all duration-500 w-full min-w-0">
        {/* Header */}
        <header
          className={`header-stable ${isScrolled ? 'header-scrolled' : 'header-default'}`}
        >
          <div className="container-custom">
            <div className="flex justify-between items-center gap-2 sm:gap-6">
              {/* Mobile Only: Logo */}
              <Link
                to={!user ? '/landing' : user?.role === 'customer' ? '/home' : user?.role === 'super_admin' ? '/superadmin/dashboard' : '/admin/dashboard'}
                className="flex lg:hidden items-center space-x-2 group shrink-0"
              >
                <div className="relative">
                  <img
                    src="/images/logo.png"
                    alt="Logo"
                    className="h-8 w-auto object-contain transition-all duration-500 group-hover:scale-110 drop-shadow-xl"
                  />
                </div>
                <span className={`text-lg font-black tracking-tighter text-primary-600 logo-text sm:inline`}>
                  PAWZZLE
                </span>
              </Link>

              {/* Global Search Bar - Compact & Centered Pill Layout */}
              <div className="hidden sm:flex flex-1 justify-center items-center px-4">
                <div className="w-full max-w-[240px]">
                  <GlobalSearch isScrolled={isScrolled} />
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-1.5 sm:gap-4 ml-auto min-w-0 justify-end">
                {/* Search Toggle for Mobile */}
                <div className="sm:hidden flex-1 min-w-[80px] max-w-[140px]">
                  <GlobalSearch isScrolled={isScrolled} />
                </div>
                {/* Cart for customers */}
                {user?.role === 'customer' && (
                  <Link
                    to="/cart"
                    className={`relative p-2.5 rounded-xl transition-all duration-300 hover:scale-110 text-slate-600 hover:bg-slate-100 shadow-sm border border-slate-100 bg-white mr-2`}
                  >
                    <ShoppingCart className="h-5 w-5" />
                    {getTotalItems() > 0 && (
                      <span className="absolute -top-1 -right-1 bg-secondary-500 text-white text-[10px] rounded-full h-5 w-5 flex items-center justify-center font-bold animate-bounce shadow-lg">
                        {getTotalItems()}
                      </span>
                    )}
                  </Link>
                )}

                {user && (
                   <div className="flex items-center gap-2 sm:gap-4 ml-1">
                    <NotificationBell />
 
                    <Link
                      to="/profile"
                      className="p-1 border border-slate-100 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-primary-600 transition-all group shrink-0"
                      title="View Profile"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center text-[10px] font-black tracking-tighter">
                        {user?.avatar || user?.profilePicture ? (
                          <img src={user?.avatar || user?.profilePicture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          user?.firstName?.[0]?.toUpperCase()
                        )}
                      </div>
                    </Link>
 
                    <button
                      onClick={handleLogout}
                      className="hidden lg:flex p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all shadow-sm group"
                      title="Sign Out"
                    >
                      <LogOut className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                    </button>
                  </div>
                )}

                {/* Mobile Menu Icon (Drawer Trigger) */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className={`lg:hidden p-2 sm:p-2.5 rounded-xl transition-colors text-slate-900 hover:bg-primary-50 bg-white border-2 border-slate-200 shadow-md ml-0.5 sm:ml-1 flex-shrink-0`}
                >
                  {isMobileMenuOpen ? <X className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.5px]" /> : <Menu className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.5px]" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Navigation Drawer (Overlay) */}
          {isMobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-[100] animate-fade-in">
              <div 
                className="absolute inset-0 bg-primary-900/40 backdrop-blur-sm" 
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <div className="absolute top-0 right-0 h-full w-4/5 max-w-xs bg-white shadow-2xl p-6 flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white font-black">
                       {user?.firstName?.[0]?.toUpperCase() || 'P'}
                     </div>
                     <div>
                       <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{user?.firstName || 'Guest'}</p>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{user?.role?.replace('_', ' ') || 'Pet Lover'}</p>
                     </div>
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
        <main className="container-custom py-6 pb-40 lg:pb-6">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Bottom Navigation for Mobile */}
      <nav id="mobile-bottom-nav" className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-lg bg-white/90 backdrop-blur-2xl border border-white/20 px-2 py-3 rounded-[2.5rem] z-[60] flex justify-around items-center shadow-[0_15px_50px_rgba(0,0,0,0.15)] ring-1 ring-black/5 transition-all duration-300">
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
