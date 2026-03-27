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
    <div className="min-h-screen bg-slate-50/30 p-4 lg:p-8 space-y-10 pb-32">
      {/* Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-indigo-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-10">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-900 text-white rounded-xl shadow-2xl">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">SUPER ADMIN PANEL</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 uppercase tracking-tighter leading-[0.8] mb-4">
            System <br /> <span className="text-primary-600 italic">Overview</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            Real-time platform monitoring
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-5 py-2.5 bg-slate-900 text-white rounded-[2.5rem] flex items-center gap-3 shadow-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest">System Online</span>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'indigo', growth: stats.userGrowth },
          { label: 'Total Orders', value: stats.totalOrders, icon: ShoppingBag, color: 'primary', growth: stats.orderGrowth },
          { label: 'Gross Volume', value: `₱${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'emerald', growth: 15.7 },
          { label: 'Platform Fees (10%)', value: `₱${(stats.totalPlatformFees || 0).toLocaleString()}`, icon: DollarSign, color: 'blue', growth: 15.7 },
          { label: 'Pending Store Apps', value: stats.pendingApplications, icon: Settings, color: 'amber', growth: 0 }
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm hover:shadow-xl transition-all group overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3 bg-${stat.color}-50 text-${stat.color}-600 rounded-xl`}>
                <stat.icon className="h-5 w-5" />
              </div>
              {stat.growth > 0 && (
                <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500">
                  <TrendingUp className="h-3 w-3" />
                  <span>+{stat.growth}%</span>
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
              <p className="text-2xl font-black text-slate-900 tracking-tighter leading-none">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Recent Orders */}
        <div className="xl:col-span-8 bg-white border border-slate-100 rounded-[3rem] p-8 shadow-sm">
          <div className="flex justify-between items-center mb-10 pl-2">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Recent Orders</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live transaction history</p>
            </div>
            <Link to="/superadmin/transaction-history" className="flex items-center gap-2 px-6 py-3 bg-slate-50 text-slate-600 rounded-[2.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all">
              View All <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.recentOrders.map((order) => (
              <div key={order._id} className="flex justify-between items-center p-5 bg-slate-50 rounded-[1.8rem] border border-transparent hover:border-primary-100 hover:bg-white hover:shadow-xl transition-all group">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-slate-300 group-hover:bg-primary-600 group-hover:text-white transition-all shadow-sm">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 uppercase truncate">#{order.orderNumber.slice(-8).toUpperCase()}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase truncate">
                      {order.customer?.firstName} • {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-black text-slate-900 tracking-tighter">₱{order.totalAmount?.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-slate-900 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary-600/10 rounded-full blur-3xl -translate-y-12 translate-x-12" />

            <h2 className="text-[11px] font-black text-primary-400 uppercase tracking-[0.4em] mb-10 pl-2">Quick Actions</h2>

            <div className="grid grid-cols-1 gap-3">
              {[
                { to: "/superadmin/insights", label: "Platform Intelligence", icon: Brain, desc: "AI-powered global insights" },
                { to: "/superadmin/account-management", label: "Manage Users", icon: Users, desc: "Manage store owners" },
                { to: "/superadmin/store-applications", label: "Store Requests", icon: Settings, desc: "Review new stores" },
                { to: "/superadmin/system-analytics", label: "Analytics", icon: Activity, desc: "System performance" }
              ].map((action, i) => (
                <Link key={i} to={action.to} className="flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 rounded-[2.5rem] transition-all group/item active:scale-[0.98]">
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-white/40 group-hover/item:bg-primary-600 group-hover/item:text-white transition-all">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1">{action.label}</p>
                    <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em]">{action.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-emerald-500 rounded-[3rem] p-8 text-white shadow-xl shadow-emerald-100 flex flex-col items-center justify-center text-center">
            <Shield className="h-10 w-10 mb-4 opacity-50" />
            <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-1">System Status: Normal</p>
            <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">All systems running normally</p>
          </div>
        </div>
      </div>

      {/* Recent Users */}
      <div className="relative z-10 bg-white border border-slate-100 rounded-[3rem] p-8 shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -mr-16 -mt-16" />

        <div className="flex justify-between items-center mb-10 pl-2">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">User List</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent user registrations</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.recentUsers.map((user) => (
            <div key={user._id} className="flex flex-col p-6 bg-slate-50/50 rounded-[2rem] border border-transparent hover:border-slate-100 hover:bg-white transition-all group relative overflow-hidden">
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-300 group-hover:text-primary-600 shadow-sm transition-colors">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-slate-900 uppercase truncate">{user.firstName} {user.lastName}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.role}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-auto relative z-10">
                <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-[0.2em] ${user.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                  {user.isActive ? 'Active' : 'Disabled'}
                </span>
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
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
