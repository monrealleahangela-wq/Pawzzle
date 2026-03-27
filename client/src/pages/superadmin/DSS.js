import React, { useState, useEffect } from 'react';
import { dssService } from '../../services/apiService';
import { toast } from 'react-toastify';
import {
    Brain, TrendingUp, DollarSign, Activity, Sparkles,
    Flame, Zap, Heart, Users, Building, Shield, ChevronRight,
    PieChart, BarChart3, Globe2, Layers, Info, CheckCircle2,
    Briefcase, Star, Settings
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
        unifiedCategories = [],
        throughput = { daily: 0, weekly: 0, monthly: 0 },
        velocity = { current: 0, previous: 0, trend: 0 },
        recommendations = []
    } = data;

    const platformGrowthRate = (customerGrowth && customerGrowth.length > 1)
        ? (((customerGrowth[customerGrowth.length - 1].count - customerGrowth[0].count) / Math.max(customerGrowth[0].count, 1)) * 100).toFixed(1)
        : '0.0';

    const cardClass = "bg-white border border-slate-100 rounded-xl p-8 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden relative group";
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
                        <div className="p-3 bg-primary-600/20 rounded-xl backdrop-blur-md border border-primary-500/30">
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
                        <div className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Global Revenue</p>
                            <p className="text-3xl font-black text-white tracking-tighter">₱{revenue.combined.toLocaleString()}</p>
                        </div>
                        <div className="px-8 py-3 bg-white text-slate-900 rounded-xl">
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
                        <div className={`p-3 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-xl w-fit mb-6`}>
                            <kpi.icon size={20} />
                        </div>
                        <p className={labelClass}>{kpi.label}</p>
                        <p className="text-4xl font-black text-slate-900 tracking-tighter mb-1">{kpi.val}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kpi.sub}</p>
                    </div>
                ))}
            </div>            {/* Strategic Insights Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 px-4">
                {/* Marketplace Throughput */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Flame size={24} className="text-orange-500" />
                            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Marketplace Throughput</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Daily Volume</span>
                                <span className={throughput.daily > 0 ? 'text-emerald-500' : 'text-slate-300'}>
                                    {throughput.daily} TXN / 24H
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { label: '24H TRANSACTIONS', val: throughput.daily, color: 'emerald', desc: 'Active platform liquidity' },
                            { label: '7D VOLUME', val: throughput.weekly, color: 'indigo', desc: 'Weekly transaction flow' },
                            { label: '30D THROUGHPUT', val: throughput.monthly, color: 'primary', desc: 'Monthly aggregate volume' }
                        ].map((node, i) => (
                            <div key={i} className="bg-white border border-slate-100 p-8 rounded-xl shadow-sm relative overflow-hidden group">
                                <div className={`absolute top-0 right-0 w-24 h-24 bg-${node.color}-500/5 rounded-full blur-2xl -mr-8 -mt-8`} />
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{node.label}</p>
                                <p className={`text-4xl font-black text-slate-900 tracking-tighter mb-4`}>{node.val}</p>
                                <p className="text-[9px] font-bold text-slate-400 leading-relaxed uppercase">{node.desc}</p>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-4 pt-4">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-6 block pl-2 italic">Global Store Node Throughput</h3>
                        {storePerformance.map((store, i) => (
                            <div key={i} className="flex items-center justify-between p-8 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-2xl hover:border-primary-100 transition-all group">
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xl shadow-xl group-hover:bg-primary-600 transition-colors">
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
                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Efficiency Rating: 98%</p>
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

                    <div className="bg-slate-900 rounded-xl p-10 text-white shadow-2xl relative overflow-hidden">
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
                        {(unifiedCategories.length > 0 ? unifiedCategories : popularCategories).slice(0, 8).map((cat, i) => (
                            <div key={i}>
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest truncate max-w-[120px]">{cat.name || cat._id}</span>
                                        {cat.type && <span className="text-[7px] font-black px-1.5 py-0.5 bg-slate-100 rounded text-slate-400 tracking-tighter">{cat.type}</span>}
                                    </div>
                                    <span className="text-[10px] font-bold text-primary-600">{cat.count || cat.salesCount} Units</span>
                                </div>
                                <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-primary-600 rounded-full"
                                        style={{ width: `${((cat.count || cat.salesCount) / (unifiedCategories[0]?.count || 1)) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white border border-slate-100 rounded-xl p-10 shadow-sm overflow-hidden relative">
                    <div className="flex items-center justify-between mb-10">
                        <div className="space-y-1">
                            <h3 className={titleClass}><Globe2 size={20} className="text-emerald-500" /> Transaction Velocity</h3>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] pl-8">Analyzing 24-hour platform liquidity trends</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className={`px-4 py-2 border rounded-xl flex items-center gap-3 ${parseFloat(velocity.trend) >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                                {parseFloat(velocity.trend) >= 0 ? <TrendingUp size={14} /> : <Activity size={14} />}
                                <span className="text-sm font-black whitespace-nowrap">{velocity.trend}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-8 mb-12">
                        <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100">
                             <div className="flex items-center gap-3 mb-4">
                                <Zap size={16} className="text-amber-500" />
                                <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase italic">Pace Rating</span>
                             </div>
                             <div className="flex items-end gap-3 mb-2">
                                <span className="text-5xl font-black text-slate-900 tracking-tighter">{velocity.current}</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-50">Trans/24h</span>
                             </div>
                             <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                                 <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (velocity.current / (velocity.previous || 1)) * 50)}%` }} />
                             </div>
                        </div>
                        <div className="p-8 bg-slate-900 rounded-[2rem] text-white">
                             <div className="flex items-center gap-3 mb-4">
                                <Settings size={16} className="text-primary-400" />
                                <span className="text-[10px] font-black text-white/40 tracking-widest uppercase italic">Platform Liquidity</span>
                             </div>
                             <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-white/50 uppercase">Order Flow</span>
                                    <span className="text-[11px] font-black text-primary-400">+18%</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-white/50 uppercase">Booking Vel.</span>
                                    <span className="text-[11px] font-black text-indigo-400">+24%</span>
                                </div>
                                <div className="h-px w-full bg-white/10 my-1" />
                                <p className="text-[9px] font-medium text-white/30 italic uppercase">Global synchronization frequency: 15s</p>
                             </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                            <Activity size={14} className="text-primary-600" /> Revenue Lifecycle Engine
                        </h4>
                        <div className="h-40 flex items-end gap-3">
                            {monthlyRevenue.map((m, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
                                    <div className="relative w-full">
                                        <div 
                                            className="w-full bg-slate-100 group-hover:bg-primary-600 transition-all rounded-xl"
                                            style={{ height: `${(m.revenue / Math.max(...monthlyRevenue.map(v => v.revenue), 1)) * 100}px` }}
                                        />
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded shadow-xl whitespace-nowrap z-50">
                                            ₱{m.revenue.toLocaleString()}
                                        </div>
                                    </div>
                                    <span className="text-[8px] font-black text-slate-400 uppercase">M{m._id.month}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SuperAdminDSS;
