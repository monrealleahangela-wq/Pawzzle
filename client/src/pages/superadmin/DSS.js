import React, { useState, useEffect } from 'react';
import { dssService } from '../../services/apiService';
import { toast } from 'react-toastify';
import {
    Brain, TrendingUp, DollarSign, Activity, Sparkles,
    Flame, Zap, Heart, Users, Building, Shield, ChevronRight,
    PieChart, BarChart3, Globe2, Layers, Info, CheckCircle2,
    Briefcase, Star
} from 'lucide-react';

const SuperAdminDSS = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('platform');

    useEffect(() => { fetchInsights(); }, []);

    const fetchInsights = async () => {
        try {
            setLoading(true);
            const res = await dssService.getSuperAdminInsights();
            setData(res.data);
        } catch (err) {
            toast.error('Failed to load platform intelligence');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] gap-6">
                <div className="relative">
                    <div className="w-20 h-20 border-4 border-slate-100 border-t-primary-600 rounded-full animate-spin"></div>
                    <Brain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-primary-600 animate-pulse" />
                </div>
                <div className="text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-2">Architecting Platform Intelligence...</p>
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Consulting Global Strategy Engine</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const {
        platform = {},
        revenue = { combined: 0 },
        orders = {},
        monthlyRevenue = [],
        customerGrowth = [],
        storePerformance = [],
        popularCategories = [],
        recommendations = []
    } = data;

    const platformGrowthRate = (customerGrowth && customerGrowth.length > 1)
        ? (((customerGrowth[customerGrowth.length - 1].count - customerGrowth[0].count) / Math.max(customerGrowth[0].count, 1)) * 100).toFixed(1)
        : '0.0';

    const cardClass = "bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden relative group";
    const labelClass = "text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block";
    const titleClass = "text-xl font-black text-slate-900 tracking-tight mb-6 flex items-center gap-3 uppercase";

    return (
        <div className="max-w-7xl mx-auto space-y-12 pb-32 animate-in fade-in duration-700">
            {/* Super Admin Hero Section */}
            <div className="relative bg-slate-900 rounded-[3.5rem] p-12 md:p-20 overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary-600/10 rounded-full blur-[150px] -mr-32 -mt-32 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[120px] -ml-16 -mb-16" />

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-3 bg-primary-600/20 rounded-2xl backdrop-blur-md border border-primary-500/30">
                            <Brain size={24} className="text-primary-400" />
                        </div>
                        <span className="text-[12px] font-black uppercase tracking-[0.6em] text-primary-400">Global DSS Core</span>
                    </div>

                    <div className="max-w-4xl">
                        <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-none mb-8 text-white">
                            Universal <br /> <span className="text-primary-500 italic">Meta-Intelligence</span>
                        </h1>
                        <p className="text-lg md:text-xl font-bold text-slate-400 max-w-2xl leading-relaxed">
                            A high-fidelity monitoring engine analyzing cross-store dynamics and global user behavior to drive platform expansion.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-8 mt-12">
                        <div className="px-8 py-5 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Global Revenue</p>
                            <p className="text-3xl font-black text-white tracking-tighter">₱{revenue.combined.toLocaleString()}</p>
                        </div>
                        <div className="px-8 py-5 bg-white text-slate-900 rounded-3xl">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Growth Forecast</p>
                            <p className="text-3xl font-black text-emerald-600 tracking-tighter">+{platformGrowthRate}%</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Platform KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-4">
                {[
                    { label: 'Platform Stores', val: platform.totalStores, sub: `${platform.activeStores} Operational`, icon: Building, color: 'primary' },
                    { label: 'Market Reach', val: platform.totalCustomers, sub: 'Total Verified Users', icon: Users, color: 'indigo' },
                    { label: 'Active Inventory', val: platform.totalProducts + platform.totalPets, sub: 'Combined Catalog', icon: Layers, color: 'amber' },
                    { label: 'Trust Rating', val: `${platform.avgRating}/5`, sub: `From ${platform.totalReviews} Reviews`, icon: Star, color: 'rose' }
                ].map((kpi, i) => (
                    <div key={i} className={cardClass}>
                        <div className={`p-3 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-2xl w-fit mb-6`}>
                            <kpi.icon size={20} />
                        </div>
                        <p className={labelClass}>{kpi.label}</p>
                        <p className="text-4xl font-black text-slate-900 tracking-tighter mb-1">{kpi.val}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kpi.sub}</p>
                    </div>
                ))}
            </div>

            {/* Strategic Insights Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 px-4">
                {/* Store Performance Rankings */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="flex items-center gap-3">
                        <Flame size={24} className="text-orange-500" />
                        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Marketplace Throughput</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {storePerformance.map((store, i) => (
                            <div key={i} className="flex items-center justify-between p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:border-primary-100 transition-all group">
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-xl group-hover:bg-primary-600 transition-colors">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-1">{store.storeName}</h3>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-primary-600 uppercase tracking-widest">{store.orderCount} Orders</span>
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Vendor</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-black text-slate-900 tracking-tighter">₱{store.revenue.toLocaleString()}</p>
                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Leaderboard Node</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Algorithmic Recommendations */}
                <div className="lg:col-span-4 space-y-8">
                    <div className="flex items-center gap-3">
                        <Sparkles size={24} className="text-primary-600" />
                        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">AI Directives</h2>
                    </div>

                    <div className="space-y-4">
                        {recommendations.map((rec, i) => (
                            <div key={i} className={`${cardClass} border-l-8 ${rec.type === 'critical' ? 'border-l-rose-500' : rec.type === 'warning' ? 'border-l-amber-500' : 'border-l-indigo-500'}`}>
                                <div className="flex items-center gap-3 mb-4">
                                    {rec.type === 'critical' ? <Shield size={16} className="text-rose-500" /> : <Info size={16} className="text-slate-400" />}
                                    <p className="text-[10px] font-black uppercase text-slate-900 tracking-widest">{rec.title}</p>
                                </div>
                                <p className="text-sm font-bold text-slate-500 leading-relaxed italic mb-4">
                                    "{rec.message}"
                                </p>
                                <div className="py-2.5 px-4 bg-slate-50 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">
                                    Priority: {rec.priority}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
                        <Activity className="absolute -right-8 -bottom-8 w-40 h-40 text-white/5" />
                        <h3 className="text-lg font-black uppercase tracking-widest mb-6 text-primary-400">Strategic Logic</h3>
                        <p className="text-xs font-bold leading-relaxed text-slate-400 uppercase tracking-widest">
                            Our DSS engine monitors order cancellation rates, store inactivity, and category-level demand spikes to propose platform-wide optimizations every 24 hours.
                        </p>
                    </div>
                </div>
            </div>

            {/* Growth Visualization */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-4">
                <div className={cardClass}>
                    <h3 className={titleClass}><BarChart3 size={20} className="text-indigo-600" /> Category Dynamics</h3>
                    <div className="space-y-6">
                        {popularCategories.slice(0, 5).map((cat, i) => (
                            <div key={i}>
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{cat._id}</span>
                                    <span className="text-[10px] font-bold text-primary-600">{cat.salesCount} Sales</span>
                                </div>
                                <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-primary-600 rounded-full"
                                        style={{ width: `${(cat.salesCount / (popularCategories[0]?.salesCount || 1)) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white border border-slate-100 rounded-[2.5rem] p-10 shadow-sm overflow-hidden relative">
                    <div className="flex items-center justify-between mb-10">
                        <h3 className={titleClass}><Globe2 size={20} className="text-emerald-500" /> Transaction Velocity</h3>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Growth Trend</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="h-64 flex items-end gap-4">
                        {monthlyRevenue.map((m, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-4 h-full justify-end group">
                                <div className="relative w-full">
                                    <div 
                                        className="w-full bg-slate-900 group-hover:bg-primary-600 transition-all rounded-2xl"
                                        style={{ height: `${(m.revenue / Math.max(...monthlyRevenue.map(v => v.revenue), 1)) * 180}px` }}
                                    />
                                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded shadow-xl whitespace-nowrap">
                                        ₱{m.revenue.toLocaleString()}
                                    </div>
                                </div>
                                <span className="text-[9px] font-black text-slate-400 uppercase">MO {m._id.month}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SuperAdminDSS;
