import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { userService, petService, productService, orderService } from '../../services/apiService';
import { Users, Heart, Package, ShoppingCart, TrendingUp, Download, Activity, Shield, Zap, Globe, PieChart } from 'lucide-react';

const SystemAnalytics = () => {
  const [data, setData] = useState({
    users: [],
    pets: [],
    products: [],
    orders: [],
    recentActivity: []
  });
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const [usersResponse, petsResponse, productsResponse, ordersResponse] = await Promise.all([
        userService.getAllUsers({ limit: 5000 }),
        petService.getAllPets({ limit: 5000 }),
        productService.getAllProducts({ limit: 5000 }),
        orderService.getAllOrders({ limit: 5000 })
      ]);

      setData({
        users: usersResponse.data.users || [],
        pets: petsResponse.data.pets || [],
        products: productsResponse.data.products || [],
        orders: ordersResponse.data.orders || [],
        recentActivity: []
      });
    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const metrics = useMemo(() => {
    const totalUsers = data.users.length;
    const totalPets = data.pets.length;
    const totalProducts = data.products.length;
    const totalOrders = data.orders.length;
    const totalRevenue = data.orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const roles = data.users.reduce((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});

    const statusDist = data.orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});

    return { totalUsers, totalPets, totalProducts, totalOrders, totalRevenue, roles, statusDist };
  }, [data]);

  const recentActivity = useMemo(() => {
    const activities = [
      ...data.users.map(u => ({ type: 'user', label: 'NEW USER', detail: `${u.firstName} / ${u.role}`, date: u.createdAt, color: 'blue' })),
      ...data.pets.map(p => ({ type: 'pet', label: 'NEW PET', detail: `${p.name} / ${p.breed}`, date: p.createdAt, color: 'primary' })),
      ...data.orders.map(o => ({ type: 'order', label: 'NEW ORDER', detail: `${o.orderNumber} / ₱${o.totalAmount}`, date: o.createdAt, color: 'emerald' }))
    ];
    return activities.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2"></div>
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Analytics Data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-primary-600" />
            <span className="text-[9px] font-black text-primary-600 uppercase tracking-wider">Platform Performance</span>
          </div>
          <h1 className="mb-1 text-2xl font-black uppercase leading-none tracking-tight text-slate-900 sm:text-3xl">
            Analytics
          </h1>
          <p className="text-xs font-medium text-slate-500">Monitor users, orders, revenue, and platform activity.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button type="button" aria-label="Refresh analytics" onClick={fetchAnalytics} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600 shadow-sm transition-all hover:bg-slate-200 active:scale-95">
            <Zap className="h-4 w-4" />
          </button>
          <button type="button" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-slate-200 transition-all hover:bg-primary-600 sm:flex-none">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Users', value: metrics.totalUsers, icon: Users, color: 'primary', trend: '+12%' },
          { label: 'Pets Registered', value: metrics.totalPets, icon: Heart, color: 'rose', trend: '+5%' },
          { label: 'Products in Catalog', value: metrics.totalProducts, icon: Package, color: 'amber', trend: '+8%' },
          { label: 'Total Orders', value: metrics.totalOrders, icon: ShoppingCart, color: 'indigo', trend: '+15%' }
        ].map((stat, i) => (
          <div key={i} className="group rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-lg">
            <div className="mb-2.5 flex items-start justify-between">
              <div className={`rounded-xl bg-${stat.color}-50 p-2 text-${stat.color}-600 transition-transform group-hover:scale-105`}>
                <stat.icon className="h-4 w-4" />
              </div>
              <span className="text-[9px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">{stat.trend}</span>
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{stat.label}</p>
            <p className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-4 text-white shadow-lg sm:p-5">
        <div className="pointer-events-none absolute -right-5 -top-8 opacity-10">
          <Globe className="h-36 w-36" />
        </div>
        <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-primary-400">Total Revenue</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">₱{metrics.totalRevenue.toLocaleString()}</p>
          </div>
          <div className="flex flex-wrap gap-2">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Revenue Growth</p>
                <p className="text-sm font-black text-emerald-400">+24.8%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Avg Order Value</p>
                <p className="text-sm font-black text-primary-400">₱{(metrics.totalRevenue / (metrics.totalOrders || 1)).toFixed(2)}</p>
              </div>
          </div>
          <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-full border border-primary-500/30 bg-primary-600/20 backdrop-blur-3xl lg:flex">
            <Activity className="h-9 w-9 text-primary-400" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <PieChart className="h-4 w-4 text-primary-600" /> User Distribution
              </h3>
            </div>
            <div className="space-y-3">
              {Object.entries(metrics.roles).map(([role, count]) => (
                <div key={role} className="group">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{role.replace('_', ' ')}</span>
                    <span className="text-[10px] font-black text-slate-900">{count} USERS</span>
                  </div>
                  <div className="w-full bg-slate-50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary-600 h-full rounded-full transition-all duration-1000 group-hover:bg-primary-500"
                      style={{ width: `${(count / metrics.totalUsers) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" /> Order Statuses
              </h3>
            </div>
            <div className="space-y-3">
              {Object.entries(metrics.statusDist).map(([status, count]) => (
                <div key={status} className="group">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{status.replace('_', ' ')}</span>
                    <span className="text-[10px] font-black text-slate-900">{count} ORDERS</span>
                  </div>
                  <div className="w-full bg-slate-50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-1000 group-hover:bg-emerald-400"
                      style={{ width: `${(count / metrics.totalOrders) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="h-fit rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Zap className="h-4 w-4 text-secondary-500" /> Live Activity Log
            </h3>
            <span className="text-[8px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded uppercase">Real-time</span>
          </div>
          <div className="max-h-[28rem] space-y-2.5 overflow-y-auto overscroll-contain pr-1">
            {recentActivity.map((activity, i) => (
              <div key={i} className="group flex cursor-help items-center gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-${activity.color}-100 bg-${activity.color}-50 text-${activity.color}-600 transition-transform group-hover:scale-105`}>
                  {activity.type === 'user' ? <Users className="h-3.5 w-3.5" /> :
                    activity.type === 'pet' ? <Heart className="h-3.5 w-3.5" /> :
                      <ShoppingCart className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-slate-900 uppercase tracking-[0.2em]">{activity.label}</span>
                    <div className="h-px bg-slate-50 flex-1" />
                    <span className="text-[8px] font-bold text-slate-400 whitespace-nowrap">{new Date(activity.date).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[10px] font-black text-slate-500 uppercase truncate group-hover:text-slate-900 transition-colors">
                    {activity.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Link to="/superadmin/activity-history" className="mt-4 flex w-full items-center justify-center rounded-xl bg-slate-50 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-100">
            View Activity
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SystemAnalytics;
