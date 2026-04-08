import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { getImageUrl } from '../services/apiService';
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
  Sun,
  PawPrint,
  MapPin,
  AlertCircle,
  HelpCircle,
  History,
  ShieldCheck
} from 'lucide-react';
import FloatingChatManager from './FloatingChatManager';
import NotificationBell from './NotificationBell';
import PasswordChangeModal from './auth/PasswordChangeModal';
import LogoutModal from './auth/LogoutModal';
import { useTheme } from '../contexts/ThemeContext';
import BottomNavBar from './BottomNavBar';

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
    { path: '/cart', label: 'Cart', icon: ShoppingCart },
    { path: '/orders', label: 'Orders', icon: ShoppingBag },
    { path: '/vouchers', label: 'Vouchers', icon: Ticket },
    { path: '/find-shops', label: 'Find Shops', icon: MapPin },
    { path: '/insights', label: 'AI Advisor', icon: Brain },
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
    { path: '/admin/customers', label: 'Customers', icon: Users },
    { path: '/admin/chat', label: 'Chat', icon: MessageSquare },
    { path: '/admin/reviews', label: 'Reviews', icon: Star },
    { type: 'label', label: 'Settings' },
    { path: '/admin/vouchers', label: 'Vouchers', icon: Ticket },
    { path: '/admin/payouts', label: 'Payouts', icon: Wallet },
    { path: '/admin/store', label: 'Store', icon: Building },
    { path: '/admin/settings', label: 'Settings', icon: Settings },
    { path: '/admin/staff', label: 'Staff', icon: Users },
  ];

  const getStaffNavItems = (staffType) => {
    const base = [{ type: 'label', label: 'Overview' }, { path: '/admin/dashboard', label: 'Dashboard', icon: Activity }];
    switch (staffType) {
      case 'inventory_staff':
        return [
          ...base,
          { type: 'label', label: 'Inventory' },
          { path: '/admin/pets', label: 'Pets', icon: Heart },
          { path: '/admin/products', label: 'Products', icon: Package },
        ];
      case 'order_staff':
        return [
          ...base,
          { type: 'label', label: 'Order Processing' },
          { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
          { path: '/admin/customers', label: 'Customers', icon: Users },
        ];
      case 'service_staff':
        return [
          ...base,
          { type: 'label', label: 'Bookings & Services' },
          { path: '/admin/services', label: 'Services', icon: Calendar },
          { path: '/admin/bookings', label: 'Bookings', icon: Calendar },
        ];
      case 'delivery_staff':
        return [
          ...base,
          { type: 'label', label: 'Logistics' },
          { path: '/admin/orders', label: 'Deliveries', icon: ShoppingCart },
        ];
      default:
        return base;
    }
  };

  const superAdminNavItems = [
    { type: 'label', label: 'Admin' },
    { path: '/superadmin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/superadmin/insights', label: 'DSS', icon: Brain },
    { path: '/superadmin/system-analytics', label: 'Analytics', icon: TrendingUp },
    { type: 'label', label: 'Accounts' },
    { path: '/superadmin/account-management', label: 'Accounts', icon: Users },
    { path: '/superadmin/store-applications', label: 'Applications', icon: FileText },
    { path: '/superadmin/permissions', label: 'Permissions', icon: ShieldAlert },
    { type: 'label', label: 'System' },
    { path: '/superadmin/transaction-history', label: 'Transactions', icon: DollarSign },
    { path: '/superadmin/booking-history', label: 'Bookings', icon: Calendar },
    { path: '/superadmin/payouts', label: 'Payouts', icon: Wallet },
    { path: '/superadmin/archive', label: 'Archive', icon: Archive },
    { type: 'label', label: 'Moderation' },
    { path: '/superadmin/reports', label: 'Reports', icon: AlertCircle },
    { path: '/superadmin/feedback', label: 'Feedback', icon: Star },
    { path: '/superadmin/support', label: 'Support', icon: HelpCircle },
    { path: '/superadmin/activity-history', label: 'Activity', icon: History },
  ];

  const publicNavItems = [
    { path: '/home', label: 'Home', icon: House },
    { path: '/pets', label: 'Pets', icon: Heart },
    { path: '/products', label: 'Products', icon: Package },
    { path: '/services', label: 'Services', icon: Calendar },
    { path: '/find-shops', label: 'Find Shops', icon: MapPin },
    { path: '/search', label: 'Search', icon: Search }
  ];

  const navItems = user?.role === 'customer' ? customerNavItems :
    user?.role === 'super_admin' ? superAdminNavItems :
      user?.role === 'staff' ? getStaffNavItems(user?.staffType) :
        !user ? publicNavItems : adminNavItems;

  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const currentScroll = window.pageYOffset;
      if (scrollHeight > 0) {
        setScrollProgress((currentScroll / scrollHeight) * 100);
      }
      setIsScrolled(currentScroll > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isLandingPage = location.pathname === '/' && !isAuthenticated;

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row overflow-x-hidden transition-colors duration-300 ${isLandingPage ? '!bg-transparent' : ''}`}>
      {/* Scroll Progress */}
      {!isLandingPage && (
        <div className="fixed top-0 left-0 h-1 bg-primary-600 z-[100] transition-all" style={{ width: `${scrollProgress}%` }} />
      )}

      {/* Sidebar - Desktop */}
      {!isLandingPage && (
        <aside className={`hidden lg:flex fixed left-4 top-4 h-[calc(100vh-2rem)] w-20 hover:w-64 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl z-[70] flex-col transition-all duration-700 cubic-bezier(0.4, 0, 0.2, 1) group shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-200/50 dark:border-slate-800/50 rounded-[2rem] overflow-hidden`}>
          <Link to="/" className="p-6 flex items-center gap-3 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 to-amber-700/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            <img src="/images/logo.png" alt="Logo" className="w-8 h-8 object-contain shrink-0 drop-shadow-md z-10" />
            <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-amber-800 dark:from-primary-400 dark:to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 tracking-tighter">PAWZZLE</span>
          </Link>

          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto no-scrollbar relative z-10">
            {navItems.map((item, idx) => {
              if (item.type === 'label') {
                return (
                  <div key={idx} className="pt-5 pb-2 pl-3">
                    <span className="text-[9px] font-black text-slate-400/80 dark:text-slate-500/80 uppercase tracking-[0.3em] opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-[-10px] group-hover:translate-x-0">{item.label}</span>
                  </div>
                );
              }
              const Icon = item.icon;
              const active = isActivePath(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-4 p-3 rounded-2xl transition-all duration-500 relative overflow-hidden group/item ${
                    active 
                      ? 'bg-gradient-to-r from-primary-600 to-amber-700 text-white shadow-lg shadow-primary-900/20 scale-[1.02]' 
                      : 'text-slate-500 dark:text-slate-400 hover:bg-orange-50 dark:hover:bg-amber-900/20 hover:text-amber-800 dark:hover:text-amber-500'
                  }`}
                >
                  <Icon className={`h-5 w-5 shrink-0 transition-transform duration-500 ${active ? 'scale-110' : 'group-hover/item:scale-110'}`} />
                  <span className="text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap tracking-wide flex-1">{item.label}</span>
                  {active && <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/item:opacity-100 transition-opacity duration-500 rounded-2xl"></div>}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 relative z-10">
             <button onClick={handleLogout} className="flex items-center gap-4 p-3 w-full rounded-2xl text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 transition-all duration-300 group/btn">
               <LogOut className="h-5 w-5 shrink-0 group-hover/btn:-translate-x-1 transition-transform" />
               <span className="text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-300 tracking-wide">Logout</span>
             </button>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${isLandingPage ? '' : 'lg:pl-[112px] pt-16'} main-content-area`}>
        {!isLandingPage && (
          <header className={`fixed top-0 left-0 lg:left-[112px] right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 h-16 flex items-center px-4 justify-between shadow-sm transition-all duration-300`}>
             <div className="lg:hidden flex items-center gap-3">
               <button 
                 onClick={() => setIsMobileMenuOpen(true)}
                 className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
               >
                 <Menu className="h-6 w-6" />
               </button>
               <Link to="/" className="flex items-center gap-2">
                 <img src="/images/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
                 <span className="font-extrabold text-primary-600 tracking-tighter uppercase text-sm">PAWZZLE</span>
               </Link>
             </div>

             <div className="flex items-center gap-3 ml-auto">
                <button onClick={toggleTheme} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                   {theme === 'dark' ? <Sun size={20} className="text-amber-400 transition-all scale-110" /> : <Moon size={20} className="text-slate-600" />}
                </button>
                 {user && (
                    <>
                      {user.role === 'customer' && (
                        <Link to="/cart" className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative">
                          <ShoppingCart size={20} />
                          {getTotalItems() > 0 && (
                            <span className="absolute top-0 right-0 w-4 h-4 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                              {getTotalItems()}
                            </span>
                          )}
                        </Link>
                      )}
                      <NotificationBell />
                     <Link to="/profile" className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 p-1 rounded-full pr-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-400 font-bold overflow-hidden text-xs shadow-inner">
                          {user.avatar || user.profilePicture ? (
                            <img src={getImageUrl(user.avatar || user.profilePicture)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            user.firstName ? user.firstName[0] : <User className="h-4 w-4" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block truncate max-w-[100px]">{user.firstName}</span>
                     </Link>
                   </>
                )}
                {!user && (
                   <Link to="/login" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold shadow-sm">Sign In</Link>
                )}
             </div>
          </header>
        )}

        <main className={`flex-1 p-2 lg:p-4 pb-12 lg:pb-4 ${isLandingPage ? 'p-0' : ''}`}>
           <Outlet />
        </main>

        {/* Mobile Bottom Nav – now handled by the dedicated BottomNavBar component */}
        {!isLandingPage && <BottomNavBar />}
      </div>

      {/* Mobile Drawer */}
      <div className={`fixed inset-0 z-[150] lg:hidden transition-all duration-500 ${isMobileMenuOpen ? 'visible' : 'invisible'}`}>
        <div 
          className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-500 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsMobileMenuOpen(false)}
        />
        <aside 
          className={`absolute top-0 left-0 h-full w-[280px] bg-white dark:bg-slate-900 shadow-2xl transition-transform duration-500 ease-out border-r border-slate-100 dark:border-slate-800 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2" onClick={() => setIsMobileMenuOpen(false)}>
              <img src="/images/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
              <span className="font-extrabold text-primary-600 tracking-tighter uppercase">PAWZZLE</span>
            </Link>
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-8 space-y-1 overflow-y-auto no-scrollbar max-h-[calc(100vh-160px)]">
            {navItems.map((item, idx) => {
              if (item.type === 'label') {
                return (
                  <div key={idx} className="pt-6 pb-2 pl-3">
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">{item.label}</span>
                  </div>
                );
              }
              const Icon = item.icon;
              const active = isActivePath(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${active ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'text-slate-500 hover:bg-slate-50 active:bg-slate-100'}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-tight">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-slate-50 bg-slate-50/50">
             <button 
               onClick={() => {
                 setIsMobileMenuOpen(false);
                 handleLogout();
               }}
               className="flex items-center gap-4 p-4 w-full bg-white text-slate-500 hover:text-rose-600 rounded-2xl border border-slate-100 shadow-sm transition-all active:scale-[0.98]"
             >
               <LogOut className="h-5 w-5 shrink-0" />
               <span className="text-sm font-bold uppercase tracking-tight">Logout System</span>
             </button>
          </div>
        </aside>
      </div>
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
