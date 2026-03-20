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
import { Heart, Package, ShoppingCart, Plus, Calendar, RefreshCw, Activity, ArrowUp, ChevronRight, AlertCircle, ShoppingBag, Shield, Brain, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const Dashboard = () => {
  const { user, refreshUserRole } = useAuth();
  const [stats, setStats] = useState({
    totalPets: 0,
    totalProducts: 0,
    totalOrders: 0,
    totalAdoptions: 0,
    totalBookings: 0,
    recentOrders: [],
    lowStockProducts: [],
    recommendations: []
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
        dssService.getAdminInsights()
      ]);

      const [petsRes, productsRes, ordersRes, adoptionsRes, bookingsRes, alertsRes, dssRes] = fetchResults;

      setStats({
        totalPets: petsRes.status === 'fulfilled' ? (petsRes.value.data.pagination?.totalPets || 0) : 0,
        totalProducts: productsRes.status === 'fulfilled' ? (productsRes.value.data.pagination?.totalProducts || 0) : 0,
        totalOrders: ordersRes.status === 'fulfilled' ? (ordersRes.value.data.pagination?.totalOrders || 0) : 0,
        totalAdoptions: adoptionsRes.status === 'fulfilled' ? (adoptionsRes.value.data.requests?.length || 0) : 0,
        totalBookings: bookingsRes.status === 'fulfilled' ? (bookingsRes.value.data.pagination?.total || bookingsRes.value.data.pagination?.totalBookings || 0) : 0,
        recentOrders: ordersRes.status === 'fulfilled' ? (ordersRes.value.data.orders || []) : [],
        lowStockProducts: alertsRes.status === 'fulfilled' ? (alertsRes.value.data.alerts || []) : [],
        recommendations: dssRes.status === 'fulfilled' ? (dssRes.value.data.recommendations || []).slice(0, 3) : []
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
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-slate-50/50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-100 border-t-primary-600 rounded-full animate-spin"></div>
          <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary-600 animate-pulse" />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-2">Loading Dashboard...</p>
          <div className="flex gap-1 justify-center">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/30 p-4 lg:p-8 space-y-10 pb-32">
      {/* Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-40">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-emerald-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-900 text-white rounded-xl shadow-2xl">
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMIN DASHBOARD</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 uppercase tracking-tighter leading-[0.8] mb-4">
            {user?.store?.name || 'Store'} <br /> <span className="text-primary-600 italic">Overview</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            Live Overview
          </p>
        </div>

        <button
          onClick={handleRefreshRole}
          className="group relative px-8 py-4 bg-white border border-slate-100 rounded-2xl overflow-hidden transition-all hover:border-primary-200 active:scale-95 shadow-sm"
        >
          <div className="absolute inset-0 bg-slate-50 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <div className="relative flex items-center gap-3">
            <RefreshCw className={`h-4 w-4 text-primary-600 ${refreshingRole ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest whitespace-nowrap">
              {refreshingRole ? 'Refreshing...' : 'Refresh Role'}
            </span>
          </div>
        </button>
      </header>

      {/* Stats */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: 'Total Pets', value: stats.totalPets, icon: Heart, color: 'rose', link: '/admin/pets', sub: 'In Store' },
          { label: 'Total Products', value: stats.totalProducts, icon: Package, color: 'amber', link: '/admin/products', sub: 'Active' },
          { label: 'Total Orders', value: stats.totalOrders, icon: ShoppingCart, color: 'indigo', link: '/admin/orders', sub: 'Completed' },
          { label: 'Total Bookings', value: stats.totalBookings, icon: Calendar, color: 'emerald', link: '/admin/bookings', sub: 'Scheduled' },
          { label: 'Messages', value: stats.totalAdoptions, icon: Activity, color: 'primary', link: '/admin/chat', sub: 'Recent' }
        ].map((stat, i) => (
          <Link
            key={i}
            to={stat.link}
            className="group relative bg-white border border-slate-100 p-6 rounded-[2.5rem] hover:shadow-2xl hover:border-primary-100 transition-all overflow-hidden"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 bg-${stat.color}-50 rounded-bl-[3rem] -translate-y-12 translate-x-12 opacity-0 group-hover:opacity-100 transition-all duration-500`} />

            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className={`p-3 bg-${stat.color}-50 text-${stat.color}-600 rounded-2xl group-hover:scale-110 transition-transform shadow-sm`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="flex flex-col items-end">
                <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
              </div>
            </div>

            <div className="relative z-10">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
              <div className="flex items-end justify-between">
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter leading-none">{stat.value}</span>
                  <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-1">{stat.sub}</p>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 mb-1">
                  <ArrowUp className="h-3 w-3" />
                  <span>+12%</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-6 pb-20">
        {/* Recent Orders */}
        <div className="xl:col-span-8 bg-white rounded-[3rem] border border-slate-100 p-8 shadow-xl shadow-slate-200/50 flex flex-col">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-8 bg-primary-600 rounded-full" />
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Recent Orders</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer Purchase History</p>
              </div>
            </div>
            <Link to="/admin/orders" className="group flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all">
              View All <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {stats.recentOrders.length > 0 ? stats.recentOrders.map(order => (
              <Link to={`/admin/orders?id=${order._id}`} key={order._id} className="group flex items-center justify-between p-4 bg-slate-50 rounded-[1.8rem] border border-transparent hover:border-primary-100 hover:bg-white hover:shadow-xl transition-all">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shrink-0 group-hover:bg-primary-600 transition-colors shadow-sm">
                    <ShoppingBag className="h-6 w-6 text-slate-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight mb-1">#{order.orderNumber.slice(-8).toUpperCase()}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-[11px] font-black text-primary-600 tracking-tight">₱{order.totalAmount?.toLocaleString()}</p>
                      <div className="w-1 h-1 rounded-full bg-slate-300" />
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border-2 ${order.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    order.status === 'processing' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>
                    {order.status}
                  </span>
                </div>
              </Link>
            )) : (
              <div className="col-span-2 flex flex-col items-center justify-center py-20 opacity-30">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <Activity className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">No orders yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Management & Alerts */}
        <div className="xl:col-span-4 space-y-6">
          {/* Intelligence Briefing */}
          {stats.recommendations.length > 0 && (
            <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-xl relative overflow-hidden group">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary-50 text-primary-600 rounded-xl">
                  <Sparkles size={16} />
                </div>
                <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.4em]">Strategic Insights</h2>
              </div>
              <div className="space-y-4">
                {stats.recommendations.map((rec, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-primary-100 hover:bg-white transition-all">
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight mb-1">{rec.title}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed line-clamp-2 italic">
                      "{rec.message}"
                    </p>
                  </div>
                ))}
                <Link to="/admin/insights" className="flex items-center justify-center gap-2 pt-2 text-[9px] font-black text-primary-600 uppercase tracking-widest hover:gap-3 transition-all">
                  Full Strategic Analysis <ChevronRight size={12} />
                </Link>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-slate-900 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary-600/10 rounded-full -translate-y-12 translate-x-12 blur-3xl pointer-events-none" />

            <h2 className="text-[11px] font-black text-primary-400 uppercase tracking-[0.4em] mb-10 pl-2">Actions</h2>

            <div className="space-y-3 relative z-10">
              {[
                { to: "/admin/insights", label: "Strategic Intelligence", icon: Brain, desc: "AI-powered store insights" },
                { to: "/admin/pets", label: "Add New Pet", icon: Plus, desc: "List a pet for adoption" },
                { to: "/admin/products", label: "Add New Product", icon: Package, desc: "Add item to your store" },
                { to: "/admin/bookings", label: "Manage Bookings", icon: Calendar, desc: "View scheduled services" },
              ].map((action, i) => (
                <Link key={i} to={action.to} className="group/btn flex items-center gap-4 p-4 bg-white/5 hover:bg-white/15 rounded-2xl transition-all active:scale-[0.98]">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0 group-hover/btn:bg-primary-600 transition-colors">
                    <action.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-white uppercase tracking-widest mb-0.5">{action.label}</p>
                    <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em]">{action.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/20 group-hover/btn:translate-x-1 transition-all" />
                </Link>
              ))}
            </div>
          </div>

          {/* Low Stock Alert */}
          {stats.lowStockProducts.length > 0 ? (
            <div className="bg-rose-500 rounded-[3rem] p-8 text-white shadow-xl shadow-rose-200/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent)] pointer-events-none" />

              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl animate-pulse">
                  <AlertCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-[11px] font-black uppercase tracking-[0.4em]">Stock Alert</h2>
                  <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Low Stock Items</p>
                </div>
              </div>

              <div className="space-y-3">
                {stats.lowStockProducts.slice(0, 3).map(p => (
                  <div key={p._id} className="flex justify-between items-center p-4 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10">
                    <span className="text-[10px] font-black uppercase truncate mr-4">{p.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-3 py-1 bg-white text-rose-600 rounded-lg text-[10px] font-black">{p.stockQuantity}</span>
                    </div>
                  </div>
                ))}
                <Link to="/admin/products" className="block text-center pt-2 text-[9px] font-black uppercase tracking-[0.3em] text-white/70 hover:text-white transition-colors">
                  Refill Stock
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500 rounded-[3rem] p-8 text-white shadow-xl shadow-emerald-200/50 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                <Shield className="h-8 w-8" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.4em] mb-1">System Status: Normal</p>
              <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">No Critical Alerts</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
