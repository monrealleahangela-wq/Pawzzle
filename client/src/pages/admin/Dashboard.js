import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  adminPetService,
  adminProductService,
  adminOrderService,
  adoptionService,
  inventoryService,
  adminBookingService,
  dssService,
  getImageUrl
} from '../../services/apiService';
import { Heart, Package, ShoppingCart, Plus, Calendar, RefreshCw, Activity, ArrowUp, ChevronRight, AlertCircle, ShoppingBag, Shield, Brain, Sparkles, TrendingUp, User, Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatTime12h } from '../../utils/timeFormatters';

const STAFF_TYPE_CONFIG = {
  inventory_staff:  { label: 'Inventory Analyst',  color: 'amber',   desc: 'Managing biological & hardware stock levels' },
  order_staff:      { label: 'Logistics Manager',       color: 'blue',    desc: 'Processing regional order fulfillment' },
  service_staff:    { label: 'Service Coordinator',     color: 'purple',  desc: 'Orchestrating professional appointments' },
};

const Dashboard = () => {
  const { user, refreshUserRole } = useAuth();
  const [stats, setStats] = useState({
    totalPets: 0,
    totalProducts: 0,
    totalOrders: 0,
    totalSales: 0,
    totalBookings: 0,
    responseRate: 100,
    totalReviews: 0,
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
        totalSales: adoptionsRes.status === 'fulfilled' ? (adoptionsRes.value.data.requests?.length || 0) : 0,
        totalBookings: bookingsRes.status === 'fulfilled' ? (bookingsRes.value.data.pagination?.total || bookingsRes.value.data.pagination?.totalBookings || 0) : 0,
        responseRate: dssRes.status === 'fulfilled' ? (dssRes.value.data.overview?.responseRate || 100) : 100,
        totalReviews: dssRes.status === 'fulfilled' ? (dssRes.value.data.overview?.totalReviews || 0) : 0,
        netEarnings: dssRes.status === 'fulfilled' ? (dssRes.value.data.overview?.totalRevenue || 0) : 0,
        availableBalance: dssRes.status === 'fulfilled' ? (dssRes.value.data.overview?.availableBalance || 0) : 0,
        recentOrders: ordersRes.status === 'fulfilled' ? (ordersRes.value.data.orders || []) : [],
        lowStockProducts: alertsRes.status === 'fulfilled' ? (alertsRes.value.data.alerts || []) : [],
        recommendations: dssRes.status === 'fulfilled' ? (dssRes.value.data.recommendations || []).slice(0, 3) : [],
        growth: dssRes.status === 'fulfilled' ? (dssRes.value.data.overview?.growth || {}) : {}
      });
    } catch (error) {
      console.error('Core dash sync failure', error);
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
      console.error('Session refresh failed');
    } finally {
      setRefreshingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-12 bg-neutral-50 animate-fade-up">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-primary/5 border-t-primary rounded-full animate-spin" />
          <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-primary animate-pulse" />
        </div>
        <div className="text-center space-y-4">
          <p className="text-[12px] font-black text-neutral-400 uppercase tracking-[0.5em] animate-pulse">Syncing Business Core</p>
          <div className="flex gap-2 justify-center">
            {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary/20 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />)}
          </div>
        </div>
      </div>
    );
  }

  const hasPerm = (res) => user?.permissions?.[res]?.view || user?.permissions?.[res]?.fullAccess;
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  return (
    <div className="space-y-12 sm:space-y-20 pb-40 relative animate-fade-up">
      
      {/* ── Dashboard Context Header ── */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-10">
        <div className="space-y-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-neutral-900 text-white rounded-3xl flex items-center justify-center shadow-premium">
              <Activity className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl sm:text-7xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
                {user?.store?.name || 'Venture'} <br />
                <span className="text-primary italic">Controller .</span>
              </h1>
              <div className="flex items-center gap-4 text-[10px] font-black text-neutral-400 uppercase tracking-[0.4em]">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Hub Status: Optimized
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
           <button onClick={handleRefreshRole} className="btn-outline !rounded-2xl !px-8 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest bg-white">
             <RefreshCw className={`h-4 w-4 ${refreshingRole ? 'animate-spin' : ''}`} />
             <span>Refetch Session</span>
           </button>
           <button className="btn-primary !rounded-2xl !px-10 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
             <Plus className="h-4 w-4" />
             <span>Create Asset</span>
           </button>
        </div>
      </header>

      {/* ── Staff Context Module ── */}
      {user?.role === 'staff' && (
        <div className="bg-white rounded-[3rem] border border-slate-50 p-10 shadow-medium flex flex-col md:flex-row items-center gap-10 animate-scale-in">
          <div className="w-24 h-24 rounded-[2rem] bg-neutral-100 flex items-center justify-center text-primary shadow-inner shrink-0 overflow-hidden">
            {user.avatar || user.profilePicture ? (
              <img src={getImageUrl(user.avatar || user.profilePicture)} alt="" className="w-full h-full object-cover" />
            ) : <User className="h-10 w-10" />}
          </div>
          <div className="flex-1 text-center md:text-left space-y-3">
             <div className="flex flex-col md:flex-row md:items-center gap-4">
                <h2 className="text-3xl font-black text-neutral-900 uppercase tracking-tight">{user.firstName} {user.lastName}</h2>
                <span className="px-4 py-1.5 bg-neutral-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest self-center">Personnel Active</span>
             </div>
             <p className="text-[11px] font-black text-primary uppercase tracking-[0.3em]">{STAFF_TYPE_CONFIG[user?.staffType]?.label || 'Store Professional'}</p>
             <p className="text-xs text-neutral-400 font-medium tracking-tight uppercase">{STAFF_TYPE_CONFIG[user?.staffType]?.desc || 'Supporting business operations'}</p>
          </div>
          <Link to="/profile" className="btn-outline !rounded-2xl px-10">Access Settings</Link>
        </div>
      )}

      {/* ── Key Performance Indicators (KPIs) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: 'Biological Inventory', value: stats.totalPets, icon: Heart, link: '/admin/pets', show: isAdmin || hasPerm('inventory') },
          { label: 'Regional Fulfilment', value: stats.totalOrders, icon: ShoppingBag, link: '/admin/orders', show: isAdmin || hasPerm('orders') },
          { label: 'Service Pipeline', value: stats.totalBookings, icon: Calendar, link: '/admin/bookings', show: isAdmin || hasPerm('bookings') || hasPerm('services') },
          { label: 'Gross Revenue', value: `₱${stats.netEarnings.toLocaleString()}`, icon: TrendingUp, link: '/admin/insights', show: isAdmin },
          { label: 'Settled Payouts', value: `₱${stats.availableBalance.toLocaleString()}`, icon: Wallet, link: '/admin/payouts', show: isAdmin },
          { label: 'Market Sentiment', value: `${stats.responseRate}%`, icon: User, link: '/admin/reviews', show: isAdmin }
        ].filter(s => s.show).map((kpi, i) => (
          <Link key={i} to={kpi.link} className="card group p-10 relative overflow-hidden transition-all duration-500 hover:bg-neutral-50">
            <div className="w-14 h-14 bg-neutral-50 rounded-2xl flex items-center justify-center mb-10 group-hover:bg-primary group-hover:text-white transition-all shadow-inner">
              <kpi.icon className="h-6 w-6" />
            </div>
            <div className="space-y-2">
               <p className="text-[10px] font-black text-neutral-300 uppercase tracking-[0.4em] leading-none mb-2">{kpi.label}</p>
               <h3 className="text-4xl font-black text-neutral-950 tracking-tighter leading-none">{kpi.value}</h3>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[5rem] -translate-y-16 translate-x-16 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-700 pointer-events-none" />
          </Link>
        ))}
      </div>

      {/* ── Operational Grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        
        {/* Logistics Feed */}
        {(isAdmin || hasPerm('orders')) && (
          <div className="xl:col-span-8 card !rounded-[3.5rem] p-12 lg:p-16">
            <div className="flex items-end justify-between mb-16 px-2">
               <div className="space-y-4">
                  <h2 className="text-4xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
                    Logistics <br />
                    <span className="text-primary italic">Queue .</span>
                  </h2>
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.3em]">Processing live regional requests</p>
               </div>
               <Link to="/admin/orders" className="p-4 bg-neutral-900 text-white rounded-2xl hover:bg-primary transition-all">
                  <ChevronRight size={24} />
               </Link>
            </div>

            <div className="space-y-4">
              {stats.recentOrders.length > 0 ? stats.recentOrders.map(order => (
                <Link to={`/admin/orders?id=${order._id}`} key={order._id} className="flex items-center justify-between p-8 bg-neutral-50 rounded-[2.5rem] hover:bg-white hover:shadow-strong transition-all duration-500 group">
                   <div className="flex items-center gap-8 min-w-0">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-soft shrink-0 group-hover:bg-neutral-900 group-hover:text-white transition-all">
                         <ShoppingBag size={24} />
                      </div>
                      <div className="min-w-0">
                         <p className="text-lg font-black text-neutral-900 uppercase tracking-tight truncate">#{order.orderNumber.slice(-8).toUpperCase()}</p>
                         <p className="text-xs font-black text-neutral-400 uppercase tracking-widest mt-1">₱{order.totalAmount?.toLocaleString()} · Fulfillment Pending</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-10">
                      <div className="hidden sm:flex flex-col text-right">
                         <span className="text-[9px] font-black text-neutral-300 uppercase tracking-[0.2em]">{new Date(order.createdAt).toLocaleDateString()}</span>
                         <span className="text-[10px] font-black text-neutral-400 uppercase mt-1">{formatTime12h(new Date(order.createdAt).toLocaleTimeString())}</span>
                      </div>
                      <div className="px-6 py-2.5 bg-white rounded-xl border border-slate-100 text-[10px] font-black text-neutral-900 uppercase tracking-widest shadow-soft">
                        {order.status}
                      </div>
                   </div>
                </Link>
              )) : (
                <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[3rem]">
                   <p className="text-[11px] font-black text-neutral-200 uppercase tracking-[0.5em]">No logistics pending</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Intelligence Sidebars */}
        <div className="xl:col-span-4 space-y-10">
          
          {/* Predictive Insights */}
          {stats.recommendations.length > 0 && isAdmin && (
            <div className="card p-12 space-y-10">
               <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-secondary-50 text-secondary-600 rounded-2xl flex items-center justify-center shadow-inner">
                     <Brain size={24} />
                  </div>
                  <div>
                     <p className="text-[10px] font-black text-neutral-300 uppercase tracking-[0.5em]">AI Advisor</p>
                     <p className="text-[12px] font-black text-neutral-900 uppercase tracking-tight">Active Recommendations</p>
                  </div>
               </div>
               <div className="space-y-6">
                  {stats.recommendations.map((rec, i) => (
                    <div key={i} className="p-8 bg-neutral-50 rounded-[2rem] border border-transparent hover:border-secondary-100 hover:bg-white hover:shadow-soft transition-all duration-500">
                       <h4 className="text-xs font-black text-neutral-900 uppercase tracking-tight mb-3 flex items-center gap-3">
                          <Plus className="h-4 w-4 text-secondary-500" />
                          {rec.title}
                       </h4>
                       <p className="text-[11px] text-neutral-400 font-bold uppercase leading-relaxed tracking-widest italic opacity-60">"{rec.message}"</p>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* Rapid Interaction Panel */}
          <div className="bg-neutral-900 rounded-[4rem] p-12 shadow-premium relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
             <div className="relative z-10 space-y-10">
                <div className="flex items-center gap-4">
                   <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                   <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.5em]">Quick Protocols</span>
                </div>
                <div className="space-y-4">
                  {[
                    { to: "/admin/insights", label: "Business Analytics", icon: Brain, show: isAdmin },
                    { to: "/admin/pets", label: "Asset Deployment", icon: Heart, show: isAdmin || hasPerm('inventory') },
                    { to: "/admin/products", label: "Inventory Intake", icon: Package, show: isAdmin || hasPerm('inventory') },
                    { to: "/admin/orders", label: "Logistics Hub", icon: ShoppingBag, show: isAdmin || hasPerm('orders') },
                  ].filter(a => a.show).map((a, i) => (
                    <Link key={i} to={a.to} className="flex items-center justify-between p-6 bg-white/5 rounded-[1.8rem] hover:bg-white/10 hover:translate-x-3 transition-all duration-500 group/item">
                       <div className="flex items-center gap-6">
                          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover/item:bg-primary transition-all">
                             <a.icon size={20} className="text-white" />
                          </div>
                          <span className="text-[11px] font-black text-white uppercase tracking-widest">{a.label}</span>
                       </div>
                       <ChevronRight className="h-5 w-5 text-white/10 group-hover/item:text-primary transition-all" />
                    </Link>
                  ))}
                </div>
             </div>
          </div>

          {/* Operational Risk Radar (Low Stock) */}
          {(isAdmin || hasPerm('inventory')) && stats.lowStockProducts.length > 0 && (
            <div className="bg-rose-600 rounded-[3rem] p-12 text-white shadow-strong relative overflow-hidden">
               <div className="relative z-10 space-y-10">
                  <div className="flex items-center gap-6">
                     <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center animate-pulse">
                        <AlertCircle size={28} />
                     </div>
                     <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.4em] opacity-60">Inventory Risk</p>
                        <p className="text-[12px] font-black uppercase tracking-tight">Resource Depletion</p>
                     </div>
                  </div>
                  <div className="space-y-4">
                     {stats.lowStockProducts.slice(0, 3).map(p => (
                       <div key={p._id} className="flex items-center justify-between p-6 bg-white/10 rounded-[1.8rem] border border-white/10">
                          <span className="text-[10px] font-black uppercase tracking-tight truncate flex-1">{p.name}</span>
                          <span className="px-5 py-2 bg-white text-rose-600 rounded-xl text-xs font-black shadow-lg">Lvl: {p.stockQuantity}</span>
                       </div>
                     ))}
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
