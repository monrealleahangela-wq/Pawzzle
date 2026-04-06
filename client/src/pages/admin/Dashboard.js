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
import { Heart, Package, ShoppingCart, Plus, Calendar, RefreshCw, Activity, ArrowUp, ChevronRight, AlertCircle, ShoppingBag, Shield, Brain, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
          <div className="w-24 h-24 border-[3px] border-[#5D4037]/5 border-t-amber-500 rounded-full animate-spin-slow"></div>
          <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-[#5D4037] animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-[11px] font-black text-[#5D4037]/40 uppercase tracking-[0.6em] animate-pulse">INITIATING COMMAND HUD</p>
          <div className="flex gap-2 justify-center">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-slate-950 p-4 sm:p-6 lg:p-12 space-y-8 sm:space-y-12 pb-20 sm:pb-40 font-['Outfit'] relative overflow-hidden transition-colors duration-500">
      {/* Precision Decorative Underlay */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-amber-100/40 dark:bg-amber-900/10 rounded-full blur-[160px] animate-spin-slow" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[50%] h-[50%] bg-[#5D4037]/5 dark:bg-slate-800/20 rounded-full blur-[140px] animate-blob-move" />
      </div>

      {/* ── High-Aspect Header ── */}
      <header className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8 border-b border-[#5D4037]/5 dark:border-slate-800 pb-8 sm:pb-12">
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#211510] dark:bg-slate-900 text-amber-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-2xl transition-transform hover:scale-110">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <span className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase tracking-[0.4em] sm:tracking-[0.5em]">COMMAND TERMINAL</span>
              <p className="text-[9px] sm:text-[11px] font-bold text-[#5D4037]/30 dark:text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-2 sm:gap-3">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Telemetry: Active
              </p>
            </div>
          </div>
          
          <div className="space-y-1">
             <h1 className="text-3xl sm:text-5xl lg:text-7xl font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-[-0.04em] leading-[0.9] sm:leading-[0.85]">
                {user?.store?.name || 'Vanguard'} <br /> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-700 italic">Flagship Overview .</span>
             </h1>
          </div>
        </div>

        <button
          onClick={handleRefreshRole}
          className="group relative px-6 sm:px-10 py-4 sm:py-5 bg-[#211510] dark:bg-slate-900 text-white rounded-xl sm:rounded-2xl overflow-hidden transition-all active:scale-95 shadow-[0_20px_40px_rgba(0,0,0,0.15)] flex items-center gap-3 sm:gap-4 border border-white/5"
        >
          <div className="absolute inset-0 bg-amber-600 translate-y-full group-hover:translate-y-0 transition-transform duration-500 opacity-20" />
          <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 text-amber-500 ${refreshingRole ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
          <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] relative z-10">
            {refreshingRole ? 'CALIBRATING...' : 'SYNC PROTOCOLS'}
          </span>
        </button>
      </header>

      {/* ── Precision Metrics Grid ── */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-8">
        {[
          { label: 'FLEET COMPANIONS', value: stats.totalPets, icon: Heart, color: 'amber', link: '/admin/pets', sub: 'In Network', growth: stats.growth.pets, show: ['admin', 'super_admin'].includes(user?.role) || ['inventory_staff', 'general'].includes(user?.staffType) },
          { label: 'HARDWARE UNITS', value: stats.totalProducts, icon: Package, color: 'stone', link: '/admin/products', sub: 'Active Stock', growth: stats.growth.products, show: ['admin', 'super_admin'].includes(user?.role) || ['inventory_staff', 'general'].includes(user?.staffType) },
          { label: 'NODE TRANSACTIONS', value: stats.totalOrders, icon: ShoppingBag, color: 'slate', link: '/admin/orders', sub: 'Verified', growth: stats.growth.orders, show: ['admin', 'super_admin'].includes(user?.role) || ['order_staff', 'delivery_staff', 'general'].includes(user?.staffType) },
          { label: 'SERVICE WINDOWS', value: stats.totalBookings, icon: Calendar, color: 'emerald', link: '/admin/bookings', sub: 'Scheduled', growth: stats.growth.bookings, show: ['admin', 'super_admin'].includes(user?.role) || ['service_staff', 'order_staff', 'general'].includes(user?.staffType) },
          { label: 'NETWORK REVENUE', value: `₱${stats.netEarnings.toLocaleString()}`, icon: TrendingUp, color: 'primary', link: '/admin/insights', sub: 'Gross Profit', growth: stats.growth.revenue, show: ['admin', 'super_admin'].includes(user?.role) },
          { label: 'LIQUID ASSETS', value: `₱${stats.availableBalance.toLocaleString()}`, icon: Shield, color: 'amber', link: '/admin/payouts', sub: 'Operational', growth: stats.growth.balance, show: ['admin', 'super_admin'].includes(user?.role) }
        ].filter(s => s.show).map((stat, i) => (
          <Link
            key={i}
            to={stat.link}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl sm:rounded-[2rem] p-4 sm:p-8 border border-[#5D4037]/5 dark:border-slate-800 transition-all duration-500 hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.3)] hover:-translate-y-1 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 dark:bg-amber-900/5 rounded-bl-[3rem] -translate-y-12 translate-x-12 opacity-0 group-hover:opacity-100 transition-all duration-700" />

            <div className="flex flex-row sm:flex-col justify-between items-center sm:items-start gap-4 sm:gap-0 relative z-10">
              <div className="flex items-center gap-4 sm:mb-10 w-full sm:w-auto">
                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-[#FAF9F6] dark:bg-slate-800 border border-[#5D4037]/5 dark:border-slate-700 text-amber-600 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all group-hover:bg-amber-600 group-hover:text-white shadow-sm shrink-0">
                  <stat.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="sm:hidden min-w-0">
                  <p className="text-[8px] font-black text-[#5D4037]/30 dark:text-slate-500 uppercase tracking-[0.3em] truncate">{stat.label}</p>
                  <p className="text-xl font-black text-[#3D2B23] dark:text-slate-100 tracking-tighter leading-none">{stat.value}</p>
                </div>
              </div>

              <div className="hidden sm:block space-y-1">
                <p className="text-[9px] sm:text-[10px] font-black text-[#5D4037]/30 dark:text-slate-500 uppercase tracking-[0.4em]">{stat.label}</p>
                <div className="flex items-baseline gap-2 sm:gap-4">
                  <span className="text-2xl sm:text-5xl font-black text-[#3D2B23] dark:text-slate-100 tracking-[-0.05em] leading-none">{stat.value}</span>
                  <span className="text-[8px] sm:text-[9px] font-black text-[#5D4037]/20 uppercase tracking-[0.2em]">{stat.sub}</span>
                </div>
              </div>

              <div className={`px-2 py-1 rounded-lg sm:px-4 sm:py-1.5 sm:rounded-xl text-[8px] sm:text-[10px] font-black flex items-center gap-1.5 sm:gap-2 ${stat.growth >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border border-emerald-100 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 border border-rose-100 dark:border-rose-800'}`}>
                <ArrowUp className={`h-2.5 w-2.5 sm:h-3 sm:w-3 transition-transform ${stat.growth < 0 ? 'rotate-180' : ''}`} />
                {stat.growth >= 0 ? '+' : ''}{stat.growth}%
              </div>
            </div>
            
            <div className="hidden sm:flex mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-[#5D4037]/5 dark:border-slate-800 items-center justify-between opacity-40 group-hover:opacity-100 transition-opacity">
               <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-500">Analytics</span>
               <ChevronRight className="h-4 w-4 text-amber-600 group-hover:translate-x-2 transition-transform" />
            </div>
          </Link>
        ))}
      </div>

      <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-10 pb-40">
        {/* Recent Transaction Log */}
        {(['admin', 'super_admin'].includes(user?.role) || ['order_staff', 'delivery_staff', 'general'].includes(user?.staffType)) && (
          <div className="xl:col-span-8 bg-white dark:bg-slate-900 rounded-[2.2rem] sm:rounded-[3.5rem] border border-[#5D4037]/5 dark:border-slate-800 p-6 sm:p-10 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.1)] flex flex-col transition-all">
            <div className="flex items-center justify-between mb-8 sm:mb-12">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#FAF9F6] dark:bg-slate-800 border border-[#5D4037]/5 dark:border-slate-700 rounded-full">
                  <ShoppingCart className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-[9px] font-black text-[#5D4037]/40 dark:text-slate-500 uppercase tracking-[0.3em]">TRANSACTION FEED</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-tighter">Recent Logistics</h2>
              </div>
              <Link to="/admin/orders" className="group hidden sm:flex items-center gap-2 px-8 py-4 bg-[#211510] dark:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-amber-600 transition-all shadow-xl">
                ACCESS ALL <ChevronRight className="h-4 w-4 group-hover:translate-x-2 transition-transform" />
              </Link>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {stats.recentOrders.length > 0 ? stats.recentOrders.map(order => (
                <Link to={`/admin/orders?id=${order._id}`} key={order._id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 bg-[#FAF9F6]/50 dark:bg-slate-800/50 rounded-[1.8rem] sm:rounded-[2.2rem] border border-transparent hover:border-amber-500/20 hover:bg-white dark:hover:bg-slate-800 hover:shadow-2xl transition-all duration-500 gap-4 sm:gap-0">
                  <div className="flex items-center gap-4 sm:gap-8 min-w-0">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[1.2rem] sm:rounded-[1.4rem] bg-white dark:bg-slate-900 border border-[#5D4037]/5 dark:border-slate-700 flex items-center justify-center shrink-0 group-hover:bg-[#211510] transition-all shadow-sm">
                      <ShoppingBag className="h-6 w-6 sm:h-7 sm:w-7 text-amber-500/30 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[12px] sm:text-[14px] font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-tight group-hover:text-amber-700 dark:group-hover:text-amber-500 transition-colors truncate">ID: #{order.orderNumber.slice(-8).toUpperCase()}</p>
                      <div className="flex items-center gap-2 sm:gap-4">
                        <p className="text-[11px] sm:text-[12px] font-black text-amber-600 tracking-tight">₱{order.totalAmount?.toLocaleString()}</p>
                        <div className="w-1 h-1 rounded-full bg-[#5D4037]/20" />
                        <p className="text-[9px] sm:text-[10px] font-bold text-[#5D4037]/30 dark:text-slate-500 uppercase tracking-widest">
                          {new Date(order.createdAt).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-6 self-end sm:self-center">
                    <span className={`px-4 sm:px-6 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] border shadow-sm ${order.status === 'delivered' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' :
                      order.status === 'processing' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-800' :
                        'bg-stone-50 dark:bg-slate-800 text-stone-600 dark:text-slate-400 border-stone-100 dark:border-slate-700'
                      }`}>
                      {order.status}
                    </span>
                  </div>
                </Link>
              )) : (
                <div className="flex flex-col items-center justify-center py-20 opacity-20 space-y-6">
                  <div className="w-24 h-24 bg-[#FAF9F6] dark:bg-slate-800 border border-[#5D4037]/5 dark:border-slate-700 rounded-full flex items-center justify-center">
                    <Activity className="h-10 w-10 text-[#5D4037] dark:text-slate-400" />
                  </div>
                  <p className="text-[11px] font-black text-[#5D4037] dark:text-slate-400 uppercase tracking-[0.5em]">NO LIVE TRANSACTIONS DETECTED</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Intelligence & Protocols */}
        <div className="xl:col-span-4 space-y-10">
          {/* Intelligence Matrix */}
          {stats.recommendations.length > 0 && (['admin', 'super_admin'].includes(user?.role) || user?.staffType === 'general') && (
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] sm:rounded-[3rem] p-8 sm:p-10 border border-[#5D4037]/5 dark:border-slate-800 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.1)] relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 dark:bg-amber-900/5 rounded-bl-[4rem] opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center gap-4 mb-8 sm:mb-10">
                <div className="w-12 h-12 bg-amber-50 dark:bg-slate-800 text-amber-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <Sparkles size={20} />
                </div>
                <div>
                   <h2 className="text-[10px] sm:text-[11px] font-black text-[#5D4037]/40 dark:text-slate-500 uppercase tracking-[0.5em]">STRATEGIC INTEL</h2>
                   <p className="text-[8px] sm:text-[9px] font-black text-[#5D4037]/20 dark:text-slate-600 uppercase tracking-widest">Real-time Optimization</p>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-6">
                {stats.recommendations.map((rec, i) => (
                  <div key={i} className="p-5 sm:p-6 bg-[#FAF9F6] dark:bg-slate-800/50 rounded-[1.5rem] sm:rounded-[1.8rem] border border-transparent hover:border-amber-100 dark:hover:border-amber-900/30 hover:bg-white dark:hover:bg-slate-800 transition-all duration-500">
                    <p className="text-[11px] font-black text-[#3D2B23] dark:text-slate-100 uppercase tracking-tight mb-2 flex items-center gap-2">
                       <div className="w-1 h-3 bg-amber-500 rounded-full" />
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
          
          <Link to="/admin/insights" className="flex items-center justify-center gap-3 pt-6 text-[10px] font-black text-amber-700 dark:text-amber-500 uppercase tracking-[0.3em] hover:gap-5 transition-all">
             FULL MATRIX ANALYSIS <ChevronRight size={14} />
          </Link>

          {/* Rapid Protocols */}
          <div className="bg-[#211510] rounded-[3.5rem] p-10 shadow-[0_60px_120px_-20px_rgba(0,0,0,0.4)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full -translate-y-24 translate-x-24 blur-[80px] pointer-events-none group-hover:scale-125 transition-transform duration-1000" />

            <div className="flex items-center gap-4 mb-12">
               <div className="w-4 h-4 bg-amber-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
               <h2 className="text-[11px] font-black text-amber-500/60 uppercase tracking-[0.6em]">RAPID PROTOCOLS</h2>
            </div>

            <div className="space-y-4 relative z-10">
              {[
                { to: "/admin/insights", label: "Strategic Intelligence", icon: Brain, desc: "Neural optimization core", show: ['admin', 'super_admin'].includes(user?.role) || user?.staffType === 'general' },
                { to: "/admin/pets", label: "Deploy Companion", icon: Plus, desc: "Synchronize new biological unit", show: ['admin', 'super_admin'].includes(user?.role) || ['inventory_staff', 'general'].includes(user?.staffType) },
                { to: "/admin/products", label: "Catalog Hardware", icon: Package, desc: "Index new structural equipment", show: ['admin', 'super_admin'].includes(user?.role) || ['inventory_staff', 'general'].includes(user?.staffType) },
                { to: "/admin/bookings", label: "Operational Calendar", icon: Calendar, desc: "Synchronize service nodes", show: ['admin', 'super_admin'].includes(user?.role) || ['service_staff', 'order_staff', 'general'].includes(user?.staffType) },
              ].filter(action => action.show).map((action, i) => (
                <Link key={i} to={action.to} className="group/btn relative flex items-center gap-4 sm:gap-6 p-3 sm:p-5 bg-white/5 hover:bg-white/10 rounded-xl sm:rounded-[1.8rem] transition-all active:scale-[0.97] border border-white/5">
                  <div className="w-10 h-10 sm:w-14 sm:h-14 bg-white/5 rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0 group-hover/btn:bg-amber-600 transition-all duration-500">
                    <action.icon className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0 sm:space-y-1">
                    <p className="text-[10px] sm:text-[12px] font-black text-white uppercase tracking-[0.1em] sm:tracking-[0.2em]">{action.label}</p>
                    <p className="text-[8px] sm:text-[9px] font-bold text-white/20 uppercase tracking-widest truncate">{action.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-white/10 group-hover/btn:translate-x-3 group-hover/btn:text-amber-500 transition-all" />
                </Link>
              ))}
            </div>
          </div>

          {/* Resource Alert Matrix */}
          {(['admin', 'super_admin'].includes(user?.role) || ['inventory_staff', 'general'].includes(user?.staffType)) && stats.lowStockProducts.length > 0 ? (
            <div className="bg-rose-600 rounded-[3rem] p-10 text-white shadow-[0_40px_80px_-20px_rgba(225,29,72,0.4)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
              
              <div className="flex items-center gap-6 mb-10">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-xl rounded-[1.4rem] flex items-center justify-center animate-pulse">
                  <AlertCircle className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-white/80">RESOURCE DEPLETION</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Critical Inventory Matrix</p>
                </div>
              </div>

              <div className="space-y-4">
                {stats.lowStockProducts.slice(0, 3).map(p => (
                  <div key={p._id} className="flex justify-between items-center p-5 bg-white/10 backdrop-blur-md rounded-[1.6rem] border border-white/10 group-hover:bg-white/15 transition-all">
                    <span className="text-[11px] font-black uppercase tracking-tight truncate mr-6">{p.name}</span>
                    <div className="px-4 py-2 bg-white text-rose-600 rounded-xl text-[12px] font-black shadow-lg">
                       {p.stockQuantity}
                    </div>
                  </div>
                ))}
                <Link to="/admin/products" className="group flex items-center justify-center gap-4 pt-4 text-[10px] font-black uppercase tracking-[0.3em] text-white/60 hover:text-white transition-all">
                  INITIATE REPLENISHMENT <ChevronRight size={14} className="group-hover:translate-x-2 transition-transform" />
                </Link>
              </div>
            </div>
          ) : (['admin', 'super_admin'].includes(user?.role) || ['inventory_staff', 'general'].includes(user?.staffType)) && (
            <div className="bg-emerald-600 rounded-[3rem] p-10 text-white shadow-[0_40px_80px_-20px_rgba(5,150,105,0.3)] flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
              <div className="w-20 h-20 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-700 shadow-2xl">
                <Shield className="h-10 w-10 text-white" />
              </div>
              <div className="space-y-2">
                 <p className="text-[12px] font-black uppercase tracking-[0.6em]">System Integral</p>
                 <div className="flex items-center gap-2 justify-center">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.3em]">Operational Stability 100%</p>
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
