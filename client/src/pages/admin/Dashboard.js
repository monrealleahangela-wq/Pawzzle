import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPetService,
  adminProductService,
  adminOrderService,
  adoptionService,
  inventoryService,
  adminBookingService,
  dssService
} from '../../services/apiService';
import { Heart, Package, ShoppingCart, Plus, Calendar, RefreshCw, Activity, ArrowUp, ChevronRight, AlertCircle, ShoppingBag, Shield, Brain, Sparkles, TrendingUp, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getImageUrl } from '../../services/apiService';
import { formatTime12h } from '../../utils/timeFormatters';

const STAFF_TYPE_CONFIG = {
  inventory_staff:  { label: 'Inventory Staff',  color: 'amber',   desc: 'Manages pets, products & stock levels' },
  order_staff:      { label: 'Order Staff',       color: 'blue',    desc: 'Processes customer orders & confirmations' },
  service_staff:    { label: 'Service Staff',     color: 'purple',  desc: 'Manages bookings & appointment schedules' },
};

const Dashboard = () => {
  const { user, refreshUserRole } = useAuth();
  const [stats, setStats] = useState({
    totalPets: 0,
    totalProducts: 0,
    totalOrders: 0,
    totalAdoptions: 0,
    totalBookings: 0,
    netEarnings: 0,
    availableBalance: 0,
    recentOrders: [],
    lowStockProducts: [],
    recommendations: [],
    growth: {
      pets: 0,
      products: 0,
      orders: 0,
      bookings: 0,
      revenue: 0,
      balance: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [refreshingRole, setRefreshingRole] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const fetchResults = await Promise.allSettled([
        adminPetService.getAllPets({ limit: 1, page: 1 }),
        adminProductService.getAllProducts({ limit: 1, page: 1 }),
        adminOrderService.getAllOrders({ limit: 8, page: 1 }),
        adoptionService.getMyRequests(),
        adminBookingService.getAllBookings({ limit: 1, page: 1 }),
        inventoryService.adminGetAlerts(),
        user?.role === 'staff' ? dssService.getStaffInsights() : dssService.getAdminInsights()
      ]);

      const [petsRes, productsRes, ordersRes, adoptionsRes, bookingsRes, alertsRes, dssRes] = fetchResults;

      setStats({
        totalPets: petsRes.status === 'fulfilled' ? (petsRes.value.data.pagination?.totalPets || 0) : 0,
        totalProducts: productsRes.status === 'fulfilled' ? (productsRes.value.data.pagination?.totalProducts || 0) : 0,
        totalOrders: ordersRes.status === 'fulfilled' ? (ordersRes.value.data.pagination?.totalOrders || 0) : 0,
        totalAdoptions: adoptionsRes.status === 'fulfilled' ? (adoptionsRes.value.data.requests?.length || 0) : 0,
        totalBookings: bookingsRes.status === 'fulfilled' ? (bookingsRes.value.data.pagination?.total || bookingsRes.value.data.pagination?.totalBookings || 0) : 0,
        netEarnings: dssRes.status === 'fulfilled' ? (dssRes.value.data.overview?.totalRevenue || 0) : 0,
        availableBalance: dssRes.status === 'fulfilled' ? (dssRes.value.data.overview?.availableBalance || 0) : 0,
        recentOrders: ordersRes.status === 'fulfilled' ? (ordersRes.value.data.orders || []) : [],
        lowStockProducts: alertsRes.status === 'fulfilled' ? (alertsRes.value.data.alerts || []) : [],
        recommendations: dssRes.status === 'fulfilled' ? (dssRes.value.data.recommendations || []).slice(0, 3) : [],
        growth: dssRes.status === 'fulfilled' ? (dssRes.value.data.overview?.growth || {}) : {}
      });
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshRole = async () => {
    setRefreshingRole(true);
    try {
      const result = await refreshUserRole();
      if (result.roleChanged) window.location.reload();
    } catch (error) {
    } finally {
      setRefreshingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-8 bg-[#FAF9F6] font-['Outfit']">
        <div className="relative">
          <div className="w-24 h-24 border-[3px] border-[#5D4037]/5 border-t-secondary-500 rounded-full animate-spin-slow"></div>
          <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-[#5D4037] animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-[11px] font-black text-[#5D4037]/40 uppercase tracking-[0.6em] animate-pulse">INITIATING COMMAND HUD</p>
          <div className="flex gap-2 justify-center">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-secondary-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hasPerm = (res) => user?.permissions?.[res]?.view || user?.permissions?.[res]?.fullAccess;
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-slate-950 p-2 sm:p-4 lg:p-6 space-y-6 sm:space-y-8 pb-10 sm:pb-20 font-['Outfit'] relative overflow-hidden transition-colors duration-500">
      {/* Precision Decorative Underlay */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-secondary-100/40 dark:bg-primary-900/10 rounded-full blur-[160px] animate-spin-slow" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[50%] h-[50%] bg-[#5D4037]/5 dark:bg-slate-800/20 rounded-full blur-[140px] animate-blob-move" />
      </div>

      {/* ── High-Aspect Header ── */}
      <header className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8 border-b border-[#5D4037]/5 dark:border-slate-800 pb-8 sm:pb-12">
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#211510] dark:bg-slate-900 text-secondary-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-2xl transition-transform hover:scale-110">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <span className="text-[9px] sm:text-[10px] font-black text-primary-600 uppercase tracking-[0.4em] sm:tracking-[0.5em]">COMMAND TERMINAL</span>
              <p className="text-[9px] sm:text-[11px] font-bold text-[#5D4037]/30 dark:text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-2 sm:gap-3">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Telemetry: Active
              </p>
            </div>
          </div>
          
          <div className="space-y-1">
             <h1 className="text-3xl sm:text-5xl lg:text-7xl font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-[-0.04em] leading-[0.9] sm:leading-[0.85]">
                {user?.store?.name || 'Vanguard'} <br /> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary-500 to-primary-700 italic">Flagship Overview .</span>
             </h1>
          </div>
        </div>

        <button
          onClick={handleRefreshRole}
          className="group relative px-6 sm:px-10 py-4 sm:py-5 bg-[#211510] dark:bg-slate-900 text-white rounded-xl sm:rounded-2xl overflow-hidden transition-all active:scale-95 shadow-[0_20px_40px_rgba(0,0,0,0.15)] flex items-center gap-3 sm:gap-4 border border-white/5"
        >
          <div className="absolute inset-0 bg-primary-600 translate-y-full group-hover:translate-y-0 transition-transform duration-500 opacity-20" />
          <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 text-secondary-500 ${refreshingRole ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
          <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] relative z-10">
            {refreshingRole ? 'REFRESHING...' : 'UPDATE DATA'}
          </span>
        </button>
      </header>
      {/* ── Staff Profile Card (Staff-only) ── */}
      {user?.role === 'staff' && (
        <div className="relative z-10 bg-white dark:bg-slate-900 rounded-[2rem] border border-[#5D4037]/5 dark:border-slate-800 p-6 sm:p-8 shadow-lg flex flex-col sm:flex-row items-start sm:items-center gap-6 animate-in fade-in duration-700">
          {/* Avatar */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] bg-secondary-50 dark:bg-slate-800 border-2 border-secondary-100 dark:border-primary-900/40 flex items-center justify-center text-primary-600 overflow-hidden shrink-0 shadow-inner">
            {user.avatar || user.profilePicture ? (
              <img src={getImageUrl(user.avatar || user.profilePicture)} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="h-8 w-8" />
            )}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl sm:text-2xl font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-tighter truncate">
                {user.firstName} {user.lastName}
              </h2>
              <span className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            </div>
            <p className="text-[10px] font-black text-primary-600 uppercase tracking-[0.3em] mb-1">
              {STAFF_TYPE_CONFIG[user?.staffType]?.label || 'Staff Member'}
            </p>
            <p className="text-[9px] font-bold text-[#5D4037]/40 dark:text-slate-500 uppercase tracking-widest truncate">
              {STAFF_TYPE_CONFIG[user?.staffType]?.desc || 'General operations'}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.email}</span>
              {user.phone && (
                <>
                  <div className="w-1 h-1 rounded-full bg-slate-200" />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.phone}</span>
                </>
              )}
            </div>
          </div>
          {/* Profile Link */}
          <Link
            to="/profile"
            className="shrink-0 flex items-center gap-3 px-6 py-3 bg-[#211510] dark:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl group"
          >
            View Profile
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      )}


      {/* ── Precision Metrics Grid ── */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
        {[
          { label: 'AVAILABLE PETS', value: stats.totalPets, icon: Heart, color: 'amber', link: '/admin/pets', sub: 'In Shop', growth: stats.growth.pets, show: isAdmin || hasPerm('inventory') },
          { label: 'SHOP PRODUCTS', value: stats.totalProducts, icon: Package, color: 'stone', link: '/admin/products', sub: 'In Stock', growth: stats.growth.products, show: isAdmin || hasPerm('inventory') },
          { label: 'STORE ORDERS', value: stats.totalOrders, icon: ShoppingBag, color: 'slate', link: '/admin/orders', sub: 'Processed', growth: stats.growth.orders, show: isAdmin || hasPerm('orders') },
          { label: 'SERVICE BOOKINGS', value: stats.totalBookings, icon: Calendar, color: 'emerald', link: '/admin/bookings', sub: 'Scheduled', growth: stats.growth.bookings, show: isAdmin || hasPerm('bookings') || hasPerm('services') },
          { label: 'TOTAL REVENUE', value: `₱${stats.netEarnings.toLocaleString()}`, icon: TrendingUp, color: 'primary', link: '/admin/insights', sub: 'Gross Profit', growth: stats.growth.revenue, show: isAdmin },
          { label: 'AVAILABLE BALANCE', value: `₱${stats.availableBalance.toLocaleString()}`, icon: Shield, color: 'amber', link: '/admin/payouts', sub: 'For Payout', growth: stats.growth.balance, show: isAdmin }
        ].filter(s => s.show).map((stat, i) => (
          <Link
            key={i}
            to={stat.link}
            className="group relative bg-white dark:bg-slate-900 rounded-[1.5rem] sm:rounded-[1.8rem] p-4 sm:p-5 border border-[#5D4037]/5 dark:border-slate-800 transition-all duration-500 hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.3)] hover:-translate-y-1 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-50 dark:bg-primary-900/5 rounded-bl-[4rem] -translate-y-16 translate-x-16 opacity-0 group-hover:opacity-100 transition-all duration-700" />

            <div className="flex items-center justify-between gap-4 relative z-10 w-full">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#FAF9F6] dark:bg-slate-800 border border-[#5D4037]/5 dark:border-slate-700 text-primary-600 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all group-hover:bg-primary-600 group-hover:text-white shadow-sm shrink-0">
                  <stat.icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] sm:text-[9px] font-black text-[#5D4037]/40 dark:text-slate-500 uppercase tracking-[0.2em] mb-0.5 truncate">{stat.label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-3xl font-black text-[#3D2B23] dark:text-slate-100 tracking-[-0.04em] leading-none">{stat.value}</span>
                    <span className="hidden lg:inline text-[8px] font-black text-[#5D4037]/20 uppercase tracking-widest">{stat.sub}</span>
                  </div>
                </div>
              </div>

              <div className={`shrink-0 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black flex items-center gap-1.5 ${stat.growth >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border border-emerald-100 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 border border-rose-100 dark:border-rose-800'}`}>
                <ArrowUp className={`h-3 w-3 transition-transform ${stat.growth < 0 ? 'rotate-180' : ''}`} />
                {stat.growth >= 0 ? '+' : ''}{stat.growth}%
              </div>
            </div>
            
            {/* Minimal Focus Accent */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-primary-600/0 group-hover:bg-primary-600/10 transition-all rounded-b-[1.5rem]" />
          </Link>
        ))}
      </div>

      <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-10 pb-40">
        {/* Recent Transaction Log */}
        {(isAdmin || hasPerm('orders') || ['order_staff', 'general'].includes(user?.staffType)) && (
          <div className="xl:col-span-8 bg-white dark:bg-slate-900 rounded-[2.2rem] sm:rounded-[3.5rem] border border-[#5D4037]/5 dark:border-slate-800 p-6 sm:p-10 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.1)] flex flex-col transition-all">
            <div className="flex items-center justify-between mb-8 sm:mb-12">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#FAF9F6] dark:bg-slate-800 border border-[#5D4037]/5 dark:border-slate-700 rounded-full">
                  <ShoppingCart className="h-3.5 w-3.5 text-primary-600" />
                  <span className="text-[9px] font-black text-[#5D4037]/40 dark:text-slate-500 uppercase tracking-[0.3em]">TRANSACTION FEED</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-tighter">Recent Transactions</h2>
              </div>
              <Link to="/admin/orders" className="group hidden sm:flex items-center gap-2 px-8 py-4 bg-[#211510] dark:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl">
                VIEW ALL <ChevronRight className="h-4 w-4 group-hover:translate-x-2 transition-transform" />
              </Link>
            </div>

            <div className="space-y-2 sm:space-y-3">
              {stats.recentOrders.length > 0 ? stats.recentOrders.map(order => (
                <Link to={`/admin/orders?id=${order._id}`} key={order._id} className="group flex items-center justify-between p-3 sm:p-4 bg-[#FAF9F6]/50 dark:bg-slate-800/50 rounded-xl sm:rounded-2xl border border-transparent hover:border-secondary-500/20 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xl transition-all duration-500 gap-4">
                  <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-white dark:bg-slate-900 border border-[#5D4037]/5 dark:border-slate-700 flex items-center justify-center shrink-0 group-hover:bg-[#211510] transition-all shadow-sm">
                      <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 text-secondary-500/30 group-hover:text-secondary-500 transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-[12px] font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-tight group-hover:text-primary-700 dark:group-hover:text-secondary-500 transition-colors truncate">ID: #{order.orderNumber.slice(-8).toUpperCase()}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[9px] sm:text-[11px] font-black text-primary-600 tracking-tight shrink-0">₱{order.totalAmount?.toLocaleString()}</p>
                        <div className="w-1 h-1 rounded-full bg-[#5D4037]/20 shrink-0" />
                        <p className="text-[8px] sm:text-[9px] font-bold text-[#5D4037]/30 dark:text-slate-500 uppercase tracking-widest truncate">
                          {new Date(order.createdAt).toLocaleDateString('en-GB')} {formatTime12h(new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg sm:rounded-xl text-[7px] sm:text-[9px] font-black uppercase tracking-[0.1em] border shadow-sm ${order.status === 'delivered' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' :
                      order.status === 'processing' ? 'bg-secondary-50 dark:bg-primary-900/20 text-primary-700 dark:text-secondary-400 border-secondary-100 dark:border-primary-800' :
                        'bg-stone-50 dark:bg-slate-800 text-stone-600 dark:text-slate-400 border-stone-100 dark:border-slate-700'
                      }`}>
                      {order.status}
                    </span>
                  </div>
                </Link>
              )) : (
                <div className="flex flex-col items-center justify-center py-12 opacity-20 space-y-4">
                  <div className="w-16 h-16 bg-[#FAF9F6] dark:bg-slate-800 border border-[#5D4037]/5 dark:border-slate-700 rounded-full flex items-center justify-center">
                    <Activity className="h-8 w-8 text-[#5D4037] dark:text-slate-400" />
                  </div>
                  <p className="text-[9px] font-black text-[#5D4037] dark:text-slate-400 uppercase tracking-[0.5em]">NO RECENT ORDERS</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Intelligence & Protocols */}
        <div className="xl:col-span-4 space-y-10">
          {/* Intelligence Matrix */}
          {stats.recommendations.length > 0 && isAdmin && (
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] sm:rounded-[3rem] p-8 sm:p-10 border border-[#5D4037]/5 dark:border-slate-800 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.1)] relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-50 dark:bg-primary-900/5 rounded-bl-[4rem] opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center gap-4 mb-8 sm:mb-10">
                <div className="w-12 h-12 bg-secondary-50 dark:bg-slate-800 text-primary-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <Sparkles size={20} />
                </div>
                <div>
                   <h2 className="text-[10px] sm:text-[11px] font-black text-[#5D4037]/40 dark:text-slate-500 uppercase tracking-[0.5em]">STORE TIPS</h2>
                   <p className="text-[8px] sm:text-[9px] font-black text-[#5D4037]/20 dark:text-slate-600 uppercase tracking-widest">Real-time Advice</p>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6">
                {stats.recommendations.map((rec, i) => (
                  <div key={i} className="p-5 sm:p-6 bg-[#FAF9F6] dark:bg-slate-800/50 rounded-[1.5rem] sm:rounded-[1.8rem] border border-transparent hover:border-secondary-100 dark:hover:border-primary-900/30 hover:bg-white dark:hover:bg-slate-800 transition-all duration-500">
                    <p className="text-[11px] font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-tight mb-2 flex items-center gap-2">
                       <div className="w-1 h-3 bg-secondary-500 rounded-full" />
                       {rec.title}
                    </p>
                    <p className="text-[10px] font-bold text-[#5D4037]/40 dark:text-slate-500 uppercase leading-relaxed italic line-clamp-3">
                      "{rec.message}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {isAdmin && (
            <Link to="/admin/insights" className="flex items-center justify-center gap-3 pt-6 text-[10px] font-black text-primary-700 dark:text-secondary-500 uppercase tracking-[0.3em] hover:gap-5 transition-all">
               VIEW FULL ANALYSIS <ChevronRight size={14} />
            </Link>
          )}

          {/* Rapid Protocols */}
          <div className="bg-[#211510] rounded-[3.5rem] p-10 shadow-[0_60px_120px_-20px_rgba(0,0,0,0.4)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-secondary-500/10 rounded-full -translate-y-24 translate-x-24 blur-[80px] pointer-events-none group-hover:scale-125 transition-transform duration-1000" />

            <div className="flex items-center gap-4 mb-12">
               <div className="w-4 h-4 bg-secondary-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
               <h2 className="text-[11px] font-black text-secondary-500/60 uppercase tracking-[0.6em]">QUICK ACTIONS</h2>
            </div>

            <div className="space-y-4 relative z-10">
              {[
                { to: "/admin/insights", label: "Strategic Intelligence", icon: Brain, desc: "Neural optimization core", show: isAdmin || hasPerm('analytics') },
                { to: "/admin/pets", label: "Deploy Companion", icon: Plus, desc: "Synchronize new biological unit", show: isAdmin || hasPerm('inventory') },
                { to: "/admin/products", label: "Catalog Hardware", icon: Package, desc: "Index new structural equipment", show: isAdmin || hasPerm('inventory') },
                { to: "/admin/bookings", label: "Operational Calendar", icon: Calendar, desc: "Synchronize service nodes", show: isAdmin || hasPerm('bookings') || hasPerm('services') },
                { to: "/admin/orders", label: "Order Queue", icon: ShoppingCart, desc: "Process pending transactions", show: isAdmin || hasPerm('orders') },
              ].filter(action => action.show).map((action, i) => (
                <Link key={i} to={action.to} className="group/btn relative flex items-center gap-4 sm:gap-6 p-3 sm:p-5 bg-white/5 hover:bg-white/10 rounded-xl sm:rounded-[1.8rem] transition-all active:scale-[0.97] border border-white/5">
                  <div className="w-10 h-10 sm:w-14 sm:h-14 bg-white/5 rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0 group-hover/btn:bg-primary-600 transition-all duration-500">
                    <action.icon className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0 sm:space-y-1">
                    <p className="text-[10px] sm:text-[12px] font-black text-white uppercase tracking-[0.1em] sm:tracking-[0.2em]">{action.label}</p>
                    <p className="text-[8px] sm:text-[9px] font-bold text-white/20 uppercase tracking-widest truncate">{action.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-white/10 group-hover/btn:translate-x-3 group-hover/btn:text-secondary-500 transition-all" />
                </Link>
              ))}
            </div>
          </div>

          {/* Resource Alert Matrix */}
          {(isAdmin || hasPerm('inventory')) && stats.lowStockProducts.length > 0 ? (
            <div className="bg-rose-600 rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 text-white shadow-[0_40px_80px_-20px_rgba(225,29,72,0.4)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
              
              <div className="flex items-center gap-4 sm:gap-6 mb-8 sm:mb-10">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 backdrop-blur-xl rounded-xl sm:rounded-[1.4rem] flex items-center justify-center animate-pulse">
                  <AlertCircle className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-white/80">LOW STOCK ALERT</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Critical Inventory</p>
                </div>
              </div>

              <div className="space-y-2 sm:space-y-4">
                {stats.lowStockProducts.slice(0, 3).map(p => (
                  <div key={p._id} className="flex items-center justify-between p-3 sm:p-5 bg-white/10 backdrop-blur-md rounded-xl sm:rounded-[1.6rem] border border-white/10 group-hover:bg-white/15 transition-all min-w-0 gap-3">
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight truncate flex-1 min-w-0">{p.name}</span>
                    <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white text-rose-600 rounded-lg sm:rounded-xl text-[10px] sm:text-[12px] font-black shadow-lg shrink-0">
                       {p.stockQuantity}
                    </div>
                  </div>
                ))}
                <Link to="/admin/products" className="group flex items-center justify-center gap-4 pt-4 text-[10px] font-black uppercase tracking-[0.3em] text-white/60 hover:text-white transition-all">
                  RESTOCK ITEMS <ChevronRight size={14} className="group-hover:translate-x-2 transition-transform" />
                </Link>
              </div>
            </div>
          ) : (isAdmin || hasPerm('inventory')) && (
            <div className="bg-emerald-600 rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 text-white shadow-[0_40px_80px_-20px_rgba(5,150,105,0.3)] flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-700 shadow-2xl">
                <Shield className="h-10 w-10 text-white" />
              </div>
              <div className="space-y-2">
                 <p className="text-[12px] font-black uppercase tracking-[0.6em]">All Systems Clear</p>
                 <div className="flex items-center gap-2 justify-center">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.3em]">Shop status is stable</p>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
