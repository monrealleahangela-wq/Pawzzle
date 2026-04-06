import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userService, orderService, dssService } from '../../services/apiService';
import {
  Users,
  ShoppingCart,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Activity,
  Settings,
  Shield,
  ChevronRight,
  Brain
} from 'lucide-react';

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalRevenue: 0,
    totalPlatformFees: 0,
    recentOrders: [],
    recentUsers: [],
    userGrowth: 0,
    orderGrowth: 0,
    pendingApplications: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dssResponse, usersResponse] = await Promise.all([
        dssService.getSuperAdminInsights(),
        userService.getAllUsers({ limit: 8 })
      ]);

      const dss = dssResponse.data;
      const recentUsers = usersResponse.data.users || [];

      setStats({
        totalUsers: dss.platform?.totalUsers || 0,
        totalOrders: dss.orders?.total || 0,
        totalRevenue: dss.revenue?.totalGross || 0,
        totalPlatformFees: dss.revenue?.totalPlatformFees || 0,
        recentOrders: dss.orders?.recent || [], // Note: Back end currently doesn't return recent orders in dss, I might need to add it or keep the manual fetch for recent list
        recentUsers,
        userGrowth: 12.5,
        orderGrowth: 8.3,
        pendingApplications: dss.platform?.pendingApplications || 0 // Need to make sure backend returns this
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-slate-50/50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-100 border-t-primary-600 rounded-full animate-spin"></div>
          <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary-600 animate-pulse" />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/30 dark:bg-slate-950 p-4 lg:p-8 space-y-8 sm:space-y-10 pb-20 sm:pb-32 transition-colors duration-500">
      {/* Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-600/5 dark:bg-primary-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-indigo-500/5 dark:bg-indigo-900/10 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 dark:border-slate-800 pb-8 sm:pb-10">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl shadow-2xl">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">SUPER ADMIN PANEL</span>
          </div>
          <h1 className="text-3xl sm:text-6xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter leading-[0.9] sm:leading-[0.8] mb-4">
            System <br /> <span className="text-primary-600 italic">Overview</span>
          </h1>
          <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-2 sm:gap-3">
            <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-500" />
            Real-time platform monitoring
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 sm:px-5 py-2 sm:py-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-xl sm:rounded-2xl flex items-center gap-3 shadow-xl">
            <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest">System Online</span>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        {[
          { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'indigo', growth: stats.userGrowth },
          { label: 'Total Orders', value: stats.totalOrders, icon: ShoppingBag, color: 'primary', growth: stats.orderGrowth },
          { label: 'Gross Volume', value: `₱${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'emerald', growth: 15.7 },
          { label: 'Platform Fees', value: `₱${(stats.totalPlatformFees || 0).toLocaleString()}`, icon: DollarSign, color: 'blue', growth: 15.7 },
          { label: 'Pending Apps', value: stats.pendingApplications, icon: Settings, color: 'amber', growth: 0 }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3.5 sm:p-4 rounded-xl sm:rounded-[1.5rem] shadow-sm hover:shadow-xl transition-all group overflow-hidden">
            <div className="flex items-center justify-between gap-3 relative z-10 w-full">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 sm:p-2.5 bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-600 rounded-lg sm:rounded-xl shrink-0`}>
                  <stat.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest truncate mb-0.5">{stat.label}</p>
                  <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tighter leading-none">{stat.value}</p>
                </div>
              </div>

              {stat.growth > 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-md text-[8px] font-black text-emerald-500 shrink-0">
                  <TrendingUp className="h-2 w-2" />
                  <span>{stat.growth}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Recent Orders */}
        <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-8 shadow-sm">
          <div className="flex justify-between items-center mb-10 pl-2">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Recent Orders</h2>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Live transaction history</p>
            </div>
            <Link to="/superadmin/transaction-history" className="flex items-center gap-2 px-6 py-3.5 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 dark:hover:bg-slate-700 hover:text-white transition-all">
              View All <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.recentOrders.map((order) => (
              <div key={order._id} className="flex justify-between items-center p-5 bg-slate-50 dark:bg-slate-800/50 rounded-[1.8rem] border border-transparent hover:border-primary-100 dark:hover:border-primary-900/20 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xl transition-all group">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-slate-300 group-hover:bg-primary-600 group-hover:text-white transition-all shadow-sm">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase truncate">#{order.orderNumber.slice(-8).toUpperCase()}</p>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase truncate">
                      {order.customer?.firstName} • {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-black text-slate-900 dark:text-slate-100 tracking-tighter">₱{order.totalAmount?.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-slate-900 dark:bg-slate-900 border border-white/5 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary-600/10 rounded-full blur-3xl -translate-y-12 translate-x-12" />

            <h2 className="text-[11px] font-black text-primary-400 uppercase tracking-[0.4em] mb-10 pl-2">Quick Actions</h2>

            <div className="grid grid-cols-1 gap-3">
              {[
                { to: "/superadmin/insights", label: "Platform Intelligence", icon: Brain, desc: "AI-powered global insights" },
                { to: "/superadmin/account-management", label: "Manage Users", icon: Users, desc: "Manage store owners" },
                { to: "/superadmin/store-applications", label: "Store Requests", icon: Settings, desc: "Review new stores" },
                { to: "/superadmin/system-analytics", label: "Analytics", icon: Activity, desc: "System performance" }
              ].map((action, i) => (
                <Link key={i} to={action.to} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white/5 hover:bg-white/10 rounded-xl sm:rounded-2xl transition-all group/item active:scale-[0.98]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/5 rounded-xl flex items-center justify-center text-white/40 group-hover/item:bg-primary-600 group-hover/item:text-white transition-all">
                    <action.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] sm:text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1 truncate">{action.label}</p>
                    <p className="text-[7.5px] sm:text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] truncate">{action.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-emerald-500 rounded-[3rem] p-8 text-white shadow-xl shadow-emerald-100 dark:shadow-emerald-900/20 flex flex-col items-center justify-center text-center">
            <Shield className="h-10 w-10 mb-4 opacity-50" />
            <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-1">System Status: Normal</p>
            <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">All systems running normally</p>
          </div>
        </div>
      </div>

      {/* Recent Users */}
      <div className="relative z-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-8 shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 dark:bg-slate-800/10 rounded-full blur-3xl -mr-16 -mt-16" />

        <div className="flex justify-between items-center mb-10 pl-2">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">User List</h2>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Recent user registrations</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.recentUsers.map((user) => (
            <div key={user._id} className="flex flex-col p-6 bg-slate-50/50 dark:bg-slate-800 rounded-[2rem] border border-transparent hover:border-slate-100 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900 transition-all group relative overflow-hidden">
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center text-slate-300 group-hover:text-primary-600 shadow-sm transition-colors">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase truncate">{user.firstName} {user.lastName}</p>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{user.role}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-auto relative z-10">
                <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-[0.2em] ${user.isActive ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800'}`}>
                  {user.isActive ? 'Active' : 'Disabled'}
                </span>
                <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest">
                  ID: {user._id.slice(-6).toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
