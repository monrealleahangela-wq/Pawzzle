import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { userService, petService, productService, orderService } from '../../services/apiService';
import {
  Users,
  Heart,
  Package,
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Download,
  Activity,
  Shield,
  Zap,
  Globe,
  PieChart
} from 'lucide-react';

const SystemAnalytics = () => {
  const [data, setData] = useState({
    users: [],
    pets: [],
    products: [],
    orders: [],
    recentActivity: []
  });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');

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
        recentActivity: [] // Will derive from others
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
    <div className="space-y-6 pb-20">
      {/* Super Admin Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-primary-600" />
            <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMIN PANEL : ANALYTICS</span>
          </div>
          <h1 className="text-xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
            System <br /> <span className="text-primary-600 italic">Analytics</span>
          </h1>
          <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Monitor platform performance</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={fetchAnalytics} className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all active:scale-95 shadow-sm">
            <Zap className="h-4 w-4" />
          </button>
          <button className="flex-1 sm:flex-none px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200">
            <Download className="h-3.5 w-3.5" /> Export Analytics CSV
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', value: metrics.totalUsers, icon: Users, color: 'primary', trend: '+12%' },
          { label: 'Pets Registered', value: metrics.totalPets, icon: Heart, color: 'rose', trend: '+5%' },
          { label: 'Products in Catalog', value: metrics.totalProducts, icon: Package, color: 'amber', trend: '+8%' },
          { label: 'Total Orders', value: metrics.totalOrders, icon: ShoppingCart, color: 'indigo', trend: '+15%' }
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-slate-100 p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2.5 rounded-2xl bg-${stat.color}-50 text-${stat.color}-600 group-hover:scale-110 transition-transform`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <span className="text-[9px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">{stat.trend}</span>
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{stat.label}</p>
            <p className="text-2xl font-black text-slate-900 tracking-tighter">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Revenue Overview */}
      <div className="bg-slate-900 rounded-[3rem] p-8 sm:p-12 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-12 opacity-10">
          <Globe className="w-64 h-64 animate-pulse" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="space-y-4 text-center md:text-left">
            <label className="text-[10px] font-black text-primary-500 uppercase tracking-[0.5em] block">Total Revenue</label>
            <p className="text-5xl sm:text-7xl font-black tracking-tighter">₱{metrics.totalRevenue.toLocaleString()}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-4">
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Revenue Growth</p>
                <p className="text-sm font-black text-emerald-400">+24.8%</p>
              </div>
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Avg Order Value</p>
                <p className="text-sm font-black text-primary-400">₱{(metrics.totalRevenue / (metrics.totalOrders || 1)).toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="hidden lg:block w-48 h-48 bg-primary-600/20 rounded-full border border-primary-500/30 flex items-center justify-center backdrop-blur-3xl animate-pulse">
            <Activity className="w-20 h-20 text-primary-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribution */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <PieChart className="h-4 w-4 text-primary-600" /> User Distribution
              </h3>
            </div>
            <div className="space-y-6">
              {Object.entries(metrics.roles).map(([role, count]) => (
                <div key={role} className="group">
                  <div className="flex justify-between items-center mb-2">
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

          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" /> Order Statuses
              </h3>
            </div>
            <div className="space-y-6">
              {Object.entries(metrics.statusDist).map(([status, count]) => (
                <div key={status} className="group">
                  <div className="flex justify-between items-center mb-2">
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

        {/* Activity Log */}
        <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm h-fit">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> Live Activity Log
            </h3>
            <span className="text-[8px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded uppercase">Real-time</span>
          </div>
          <div className="space-y-4">
            {recentActivity.map((activity, i) => (
              <div key={i} className="flex items-center gap-4 group cursor-help">
                <div className={`w-8 h-8 rounded-xl bg-${activity.color}-50 text-${activity.color}-600 flex items-center justify-center shrink-0 border border-${activity.color}-100 transition-transform group-hover:scale-110`}>
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
          <Link to="/superadmin/activity-history" className="w-full mt-10 py-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl text-[9px] font-black text-slate-400 uppercase tracking-widest transition-all flex items-center justify-center">
            See All Activity History
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SystemAnalytics;
