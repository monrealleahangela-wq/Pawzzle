import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userService, dssService } from '../../services/apiService';
import {
  Users,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Activity,
  Settings,
  Shield,
  ChevronRight,
  Brain,
  Star,
  Wallet
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
        recentOrders: dss.orders?.recent || [], 
        recentUsers,
        userGrowth: 12.5,
        orderGrowth: 8.3,
        pendingApplications: dss.platform?.pendingApplications || 0
      });
    } catch (error) {
      console.error('System synchronization failure', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-12 bg-neutral-50 animate-fade-up">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-primary/5 border-t-primary rounded-full animate-spin" />
          <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-primary animate-pulse" />
        </div>
        <div className="text-center space-y-4">
          <p className="text-[12px] font-black text-neutral-400 uppercase tracking-[0.5em] animate-pulse">Initializing Master Control</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-16 sm:space-y-24 pb-48 animate-fade-up">
      
      {/* ── Global Context Header ── */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-12">
        <div className="space-y-8">
           <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-neutral-900 text-white rounded-[2rem] flex items-center justify-center shadow-premium ring-4 ring-primary/5">
                 <Shield size={32} />
              </div>
              <div className="space-y-2">
                 <h1 className="text-5xl sm:text-8xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
                    Master <br />
                    <span className="text-primary italic">Controller .</span>
                 </h1>
                 <div className="flex items-center gap-4 text-[11px] font-black text-neutral-400 uppercase tracking-[0.4em]">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    Global Node Protocol: Active
                 </div>
              </div>
           </div>
        </div>

        <div className="flex gap-4">
           <div className="px-8 py-4 bg-white border border-slate-100 rounded-2xl flex items-center gap-4 shadow-soft">
              <Activity className="h-4 w-4 text-emerald-500" />
              <span className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Ecosystem Healthy</span>
           </div>
           <button className="btn-primary !rounded-2xl !px-12 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
              <TrendingUp className="h-4 w-4" />
              <span>Full Analytics</span>
           </button>
        </div>
      </header>

      {/* ── Global KPI Matrix ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
        {[
          { label: 'Ecosystem Users', value: stats.totalUsers, icon: Users, color: 'primary', growth: stats.userGrowth },
          { label: 'Total Requests', value: stats.totalOrders, icon: ShoppingBag, color: 'secondary', growth: stats.orderGrowth },
          { label: 'Platform Gross', value: `₱${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'primary', growth: 15.7 },
          { label: 'Network Royalty', value: `₱${(stats.totalPlatformFees || 0).toLocaleString()}`, icon: Wallet, color: 'neutral', growth: 15.7 },
          { label: 'Venture Apps', value: stats.pendingApplications, icon: Settings, color: 'secondary', growth: 0 }
        ].map((stat, i) => (
          <div key={i} className="card group p-10 relative overflow-hidden transition-all duration-500 hover:bg-neutral-50 shadow-soft">
            <div className="w-14 h-14 bg-neutral-50 rounded-2xl flex items-center justify-center mb-10 group-hover:bg-primary group-hover:text-white transition-all shadow-inner">
               <stat.icon className="h-6 w-6" />
            </div>
            <div className="space-y-2">
               <p className="text-[10px] font-black text-neutral-300 uppercase tracking-[0.4em] mb-2">{stat.label}</p>
               <h3 className="text-3xl font-black text-neutral-950 tracking-tighter leading-none">{stat.value}</h3>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[5rem] -translate-y-16 translate-x-16 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-700 pointer-events-none" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        
        {/* Core Transaction Ledger */}
        <div className="xl:col-span-8 card !rounded-[4rem] p-12 lg:p-16">
          <div className="flex items-end justify-between mb-16 px-4">
             <div className="space-y-4">
                <h2 className="text-4xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
                  Network <br />
                  <span className="text-primary italic">Ledger .</span>
                </h2>
                <p className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.3em]">Processing global platform activity</p>
             </div>
             <Link to="/superadmin/transaction-history" className="p-4 bg-neutral-900 text-white rounded-[2rem] hover:bg-primary transition-all shadow-premium">
                <ChevronRight size={28} />
             </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {stats.recentOrders.length > 0 ? stats.recentOrders.map((order) => (
              <div key={order._id} className="flex justify-between items-center p-8 bg-neutral-50 rounded-[3rem] border border-transparent hover:border-primary/10 hover:bg-white hover:shadow-strong transition-all duration-500 group">
                <div className="flex items-center gap-6 min-w-0">
                  <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-neutral-200 group-hover:bg-neutral-900 group-hover:text-white transition-all shadow-soft">
                    <ShoppingBag className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-black text-neutral-900 uppercase tracking-tight truncate">#{order.orderNumber.slice(-8).toUpperCase()}</p>
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">
                      {order.customer?.firstName} · {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-neutral-950 tracking-tighter">₱{order.totalAmount?.toLocaleString()}</p>
                </div>
              </div>
            )) : (
              <div className="col-span-2 py-24 text-center border-2 border-dashed border-slate-100 rounded-[4rem]">
                 <p className="text-[11px] font-black text-neutral-200 uppercase tracking-[0.5em]">Ledger state synchronized — No pending items</p>
              </div>
            )}
          </div>
        </div>

        {/* Global Controls & Insights */}
        <div className="xl:col-span-4 space-y-10">
          
          {/* Proactive Monitoring Panel */}
          <div className="bg-neutral-900 rounded-[4rem] p-12 shadow-premium relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10 space-y-12">
               <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
                     <Brain size={24} className="text-primary" />
                  </div>
                  <div>
                     <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.5em]">Executive View</p>
                     <p className="text-[13px] font-black text-white uppercase tracking-tight">Main Console</p>
                  </div>
               </div>

               <div className="space-y-4">
                {[
                  { to: "/superadmin/insights", label: "Business Insights", icon: Brain, desc: "Global ecosystem trends" },
                  { to: "/superadmin/account-management", label: "Identity Control", icon: Users, desc: "Managing 1.8k+ users" },
                  { to: "/superadmin/store-applications", label: "Venture Review", icon: Settings, desc: "New store vetting" },
                  { to: "/superadmin/system-analytics", label: "Node Analytics", icon: Activity, desc: "Server-side metrics" }
                ].map((action, i) => (
                  <Link key={i} to={action.to} className="flex items-center gap-6 p-6 bg-white/5 rounded-[2rem] hover:bg-white/10 hover:translate-x-4 transition-all duration-500 group/item">
                    <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white/30 group-hover/item:bg-primary group-hover/item:text-white transition-all">
                      <action.icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-black text-white uppercase tracking-widest leading-none mb-2 truncate">{action.label}</p>
                      <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] truncate">{action.desc}</p>
                    </div>
                  </Link>
                ))}
               </div>
            </div>
          </div>

          <div className="bg-primary/5 rounded-[3rem] p-12 border border-primary/10 flex flex-col items-center text-center space-y-6">
             <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-soft text-primary">
                <Shield size={28} />
             </div>
             <div>
                <p className="text-[12px] font-black text-neutral-900 uppercase tracking-[0.4em] mb-2">Security protocol: Active</p>
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Master account access verified</p>
             </div>
          </div>
        </div>
      </div>

      {/* Global Node Registry (Recent Users) */}
      <section className="space-y-12">
        <div className="flex items-end justify-between px-4">
           <div className="space-y-4">
              <h2 className="text-4xl font-black text-neutral-900 uppercase tracking-tighter leading-none">
                Node <br />
                <span className="text-primary italic">Registry .</span>
              </h2>
              <p className="text-[11px] font-black text-neutral-400 uppercase tracking-[0.3em]">Managing global platform identities</p>
           </div>
           <Link to="/superadmin/account-management" className="group text-[11px] font-black text-neutral-400 uppercase tracking-[0.3em] hover:text-primary transition-all flex items-center gap-5">
             Full Registry <div className="w-14 h-14 rounded-full border border-slate-100 flex items-center justify-center group-hover:bg-neutral-900 group-hover:text-white transition-all">
               <ChevronRight size={24} />
             </div>
           </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {stats.recentUsers.map((user) => (
            <div key={user._id} className="card group p-10 flex flex-col hover:bg-neutral-50 transition-all duration-500">
              <div className="flex items-start justify-between mb-8">
                 <div className="w-14 h-14 bg-neutral-50 rounded-2xl flex items-center justify-center text-neutral-300 group-hover:bg-primary group-hover:text-white transition-all shadow-inner">
                    <Users size={24} />
                 </div>
                 <div className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${user.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                    {user.isActive ? 'Active' : 'Locked'}
                 </div>
              </div>
              <div className="space-y-2 mb-8">
                 <h3 className="text-xl font-black text-neutral-900 uppercase tracking-tighter truncate">{user.firstName} {user.lastName}</h3>
                 <p className="text-[10px] font-black text-neutral-300 uppercase tracking-[0.3em]">{user.role}</p>
              </div>
              <div className="pt-8 border-t border-slate-50 mt-auto flex justify-between items-center text-[10px] font-bold text-neutral-200 uppercase tracking-widest">
                 <span>ID Registry</span>
                 <span className="text-neutral-300">{user._id.slice(-8).toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default SuperAdminDashboard;
