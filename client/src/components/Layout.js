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
  Sun,
  PawPrint
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
    { path: '/orders', label: 'Orders', icon: ShoppingBag },
    { path: '/vouchers', label: 'Vouchers', icon: Ticket },
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

  const superAdminNavItems = [
    { type: 'label', label: 'Admin' },
    { path: '/superadmin/dashboard', label: 'Dashboard', icon: Activity },
    { path: '/superadmin/insights', label: 'DSS', icon: Brain },
    { path: '/superadmin/system-analytics', label: 'Analytics', icon: TrendingUp },
    { type: 'label', label: 'Accounts' },
    { path: '/superadmin/account-management', label: 'Accounts', icon: Users },
    { path: '/superadmin/store-applications', label: 'Applications', icon: FileText },
    { type: 'label', label: 'System' },
    { path: '/superadmin/transaction-history', label: 'Transactions', icon: DollarSign },
    { path: '/superadmin/booking-history', label: 'Bookings', icon: Calendar },
    { path: '/superadmin/payouts', label: 'Payouts', icon: Wallet },
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
      user?.role === 'staff' ? adminNavItems : // Simplified staff nav for now
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
    <div className={`min-h-screen bg-slate-50 flex flex-col lg:flex-row overflow-x-hidden ${isLandingPage ? '!bg-transparent' : ''}`}>
      {/* Scroll Progress */}
      {!isLandingPage && (
        <div className="fixed top-0 left-0 h-1 bg-primary-600 z-[100] transition-all" style={{ width: `${scrollProgress}%` }} />
      )}

      {/* Sidebar - Desktop */}
      {!isLandingPage && (
        <aside className={`hidden lg:flex fixed left-0 top-0 h-full w-20 hover:w-64 bg-white z-[70] flex-col transition-all duration-200 group shadow-sm border-r border-slate-200`}>
          <Link to="/" className="p-6 flex items-center gap-3">
            <img src="/images/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <span className="text-xl font-bold text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">PAWZZLE</span>
          </Link>

          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto no-scrollbar">
            {navItems.map((item, idx) => {
              if (item.type === 'label') {
                return (
                  <div key={idx} className="pt-4 pb-2 pl-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">{item.label}</span>
                  </div>
                );
              }
              const Icon = item.icon;
              const active = isActivePath(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${active ? 'bg-primary-50 text-primary-600 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-100">
             <button onClick={handleLogout} className="flex items-center gap-4 p-3 w-full text-slate-500 hover:text-rose-600 transition-colors">
               <LogOut className="h-5 w-5 shrink-0" />
               <span className="text-sm opacity-0 group-hover:opacity-100 transition-opacity">Logout</span>
             </button>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${isLandingPage ? '' : 'lg:pl-20 pt-16'}`}>
        {!isLandingPage && (
          <header className={`fixed top-0 left-0 lg:left-20 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 h-16 flex items-center px-4 justify-between shadow-sm`}>
             <Link to="/" className="lg:hidden flex items-center gap-2">
               <img src="/images/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
               <span className="font-bold text-primary-600">PAWZZLE</span>
             </Link>

             <div className="flex items-center gap-3 ml-auto">
                <button onClick={toggleTheme} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
                   {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                {user && (
                   <>
                     <NotificationBell />
                     <Link to="/profile" className="flex items-center gap-2 border border-slate-200 p-1 rounded-full pr-3 bg-white hover:bg-slate-50">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold overflow-hidden text-xs">
                          {user.firstName[0]}
                        </div>
                        <span className="text-sm font-medium text-slate-700 hidden sm:block">{user.firstName}</span>
                     </Link>
                   </>
                )}
                {!user && (
                   <Link to="/login" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold shadow-sm">Sign In</Link>
                )}
             </div>
          </header>
        )}

        <main className={`flex-1 p-4 lg:p-6 pb-24 lg:pb-6 ${isLandingPage ? 'p-0' : ''}`}>
           <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        {!isLandingPage && (
          <nav className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-sm bg-white border border-slate-200 rounded-2xl shadow-lg flex justify-around p-2 z-[60]">
             {bottomNavItems.map(item => {
                const Icon = item.icon;
                const active = isActivePath(item.path);
                return (
                   <Link key={item.path} to={item.path} className={`flex flex-col items-center p-2 rounded-xl transition-colors ${active ? 'text-primary-600 bg-primary-50' : 'text-slate-400'}`}>
                      <Icon size={20} />
                      <span className="text-[10px] font-bold mt-1">{item.label}</span>
                   </Link>
                );
             })}
          </nav>
        )}
      </div>

      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
              <h2 className="text-lg font-bold mb-2">Logout</h2>
              <p className="text-slate-500 mb-6">Are you sure you want to sign out?</p>
              <div className="flex gap-3">
                 <button onClick={confirmLogout} className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold">Yes, Sign Out</button>
                 <button onClick={() => setShowLogoutModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {user?.role === 'customer' && <FloatingChatManager currentUser={user} />}
      <PasswordChangeModal />
    </div>
  );
};

export default Layout;
