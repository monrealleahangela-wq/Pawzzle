import React, { useState, useEffect } from 'react';
import { dssService } from '../../services/apiService';
import { toast } from 'react-toastify';
import {
    Brain, TrendingUp, DollarSign, AlertTriangle, Zap,
    Package, Heart, Calendar, Star, ShoppingBag, Lightbulb,
    ArrowRight, Users, Activity, BarChart3, Flame,
    CheckCircle, Clock, AlertCircle, Sparkles,
    PieChart, Briefcase, Tag, TrendingDown, Info, ShoppingCart,
    RefreshCw, Filter, Layers, ZapOff, ClipboardCheck
} from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext';

const AdminDSS = () => {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('inventory');

    useEffect(() => { fetchInsights(); }, []);

    const fetchInsights = async () => {
        try {
            setLoading(true);
            const res = user?.role === 'staff' 
                ? await dssService.getStaffInsights() 
                : await dssService.getAdminInsights();
            setData(res.data);
        } catch (err) {
            toast.error('Failed to load store intelligence');
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
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-2">Analyzing Marketplace Dynamics...</p>
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Generating Store Intelligence Report</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const {
        overview,
        salesHistory,
        inventory,
        customers,
        recommendations,
        monthlyRevenue,
        conversionRate,
        roleProfile
    } = data;

    const isStaff = roleProfile?.isStaff;
    const staffType = roleProfile?.staffType?.replace('_', ' ');

    const cardClass = "bg-white border border-slate-100 rounded-xl p-8 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden relative group";
    const labelClass = "text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block";
    const titleClass = "text-xl font-black text-slate-900 tracking-tight mb-6 flex items-center gap-3 uppercase";

    return (
        <div className="max-w-7xl mx-auto space-y-10 pb-32 animate-in fade-in duration-700">
            {/* Header Hero Section */}
            <div className="relative bg-slate-900 rounded-[3.5rem] p-12 md:p-16 overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/10 rounded-full blur-[120px] -mr-32 -mt-32 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] -ml-16 -mb-16" />

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary-600/20 rounded-xl backdrop-blur-md border border-primary-500/30">
                            <Brain size={20} className="text-primary-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary-400">Inventory Management DSS</span>
                    </div>

                    <div className="max-w-3xl">
                        <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-6 text-white">
                            {isStaff ? `${staffType}` : 'Autonomous'} <br /> <span className="text-primary-500 italic">Intelligence</span>
                        </h1>
                        <p className="text-sm md:text-lg font-bold text-slate-400 max-w-xl leading-relaxed">
                            {isStaff 
                                ? `Specialized decision support for ${staffType} protocols. Analyze store-specific data to optimize your assigned operations.`
                                : 'Analyze current stock levels and sales velocity to automate procurement and maximize marketplace efficiency.'
                            }
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-4 mt-10">
                        <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                            <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Portfolio Revenue</p>
                            <p className="text-2xl font-black text-white tracking-tighter">₱{overview.totalRevenue.toLocaleString()}</p>
                        </div>
                        <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
                            <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Conversion Rate</p>
                            <p className="text-2xl font-black text-emerald-400 tracking-tighter">{conversionRate}%</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 p-1.5 bg-slate-100 rounded-xl w-fit mx-auto shadow-inner">
                {[
                    { id: 'inventory', label: 'Smart Alerts', icon: AlertCircle },
                    { id: 'sales', label: 'Sales Velocity', icon: BarChart3 },
                    { id: 'how-it-works', label: 'Logics & Algorithms', icon: Info }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id
                            ? 'bg-slate-900 text-white shadow-xl translate-y-[-1px]'
                            : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Areas */}
            {activeTab === 'inventory' && (
                <div className="space-y-10 animate-fade-in-up">
                    {/* Primary Alerts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Auto-Detection Results */}
                        <div className="lg:col-span-8 space-y-6">
                            <div className="flex items-center justify-between px-4">
                                <div className="flex items-center gap-3">
                                    <Sparkles size={20} className="text-primary-600" />
                                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Active Reprocurement Alerts</h2>
                                </div>
                                <button onClick={fetchInsights} className="p-3 bg-white border border-slate-100 text-slate-400 rounded-xl hover:text-primary-600 transition-all">
                                    <RefreshCw size={14} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {recommendations.filter(r => r.type === 'restock').length > 0 ? (
                                    recommendations.filter(r => r.type === 'restock').map((rec, i) => (
                                        <div key={i} className={`${cardClass} border-l-8 ${rec.priority === 'critical' ? 'border-l-rose-500' : 'border-l-amber-500'}`}>
                                            <div className="flex flex-col md:flex-row justify-between gap-6">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${rec.priority === 'critical' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                                                            {rec.priority} Alert
                                                        </div>
                                                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Velocity: {rec.velocity} units/day</span>
                                                    </div>
                                                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-3">"{rec.message}"</h3>
                                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                                                        The system detected {rec.productName} is approaching critical levels. Our sales algorithm predicts depletion within {rec.daysUntilOut} days.
                                                    </p>
                                                </div>
                                                <div className="flex flex-col justify-center gap-3 w-full md:w-48">
                                                    <button className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-xl shadow-slate-200">
                                                        Restock Now
                                                    </button>
                                                    <button className="w-full py-3 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">
                                                        Ignore Alert
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
                                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border border-slate-100">
                                            <CheckCircle className="text-emerald-500" size={40} />
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-3">Inventory Healthy</h3>
                                        <p className="text-sm font-bold text-slate-400 max-w-md mx-auto leading-relaxed uppercase tracking-widest">
                                            No critical low-stock items detected based on current sales velocity.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Inventory Snapshot Sidebar */}
                        <div className="lg:col-span-4 space-y-6">
                            <div className={cardClass}>
                                <h3 className={titleClass}>
                                    <Layers size={18} className="text-indigo-600" />
                                    Stock Distribution
                                </h3>
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Optimal</p>
                                        </div>
                                        <p className="text-lg font-black text-slate-900">{inventory.levels.healthy}</p>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-amber-500" />
                                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Below Threshold</p>
                                        </div>
                                        <p className="text-lg font-black text-slate-900">{inventory.levels.low}</p>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-rose-500" />
                                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Depleted</p>
                                        </div>
                                        <p className="text-lg font-black text-slate-900">{inventory.levels.out}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-xl p-8 text-white shadow-2xl overflow-hidden relative">
                                <Activity className="absolute -right-8 -bottom-8 w-32 h-32 text-white/5" />
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary-400 mb-4">Replenishment Logic</p>
                                <p className="text-xs font-bold leading-relaxed text-slate-400">
                                    Our system dynamically updates "Days until Out" by dividing current `Stock On Hand` by your `30-Day Sales Velocity`.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'sales' && (
                <div className="space-y-8 animate-fade-in-up">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className={cardClass}>
                            <h2 className={titleClass}>
                                <Flame size={20} className="text-orange-500" />
                                High Velocity Products
                            </h2>
                            <div className="space-y-4">
                                {salesHistory.topSelling.map((product, i) => (
                                    <div key={i} className="flex items-center justify-between p-5 bg-slate-50 rounded-[1.8rem] border border-transparent hover:border-slate-100 hover:bg-white transition-all">
                                        <div className="flex items-center gap-5">
                                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-400 font-black shadow-sm">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{product.name}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{product.totalSold} Units Sold</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-900">₱{product.revenue.toLocaleString()}</p>
                                            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">+{((product.totalSold / overview.totalOrders) * 100).toFixed(1)}% Share</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={cardClass}>
                            <h2 className={titleClass}>
                                <PieChart size={20} className="text-indigo-500" />
                                Category Marketplace Share
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {Object.entries(salesHistory.categoryTrends).map(([category, stats], i) => (
                                    <div key={i} className="bg-slate-50 rounded-[1.8rem] p-6 text-center group-hover:bg-white transition-all border border-transparent hover:border-slate-100">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">{category}</p>
                                        <p className="text-xl font-black text-slate-900 tracking-tighter mb-1">₱{stats.revenue.toLocaleString()}</p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{stats.unitsSold} Units</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'how-it-works' && (
                <div className="animate-fade-in-up">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                        <div className="space-y-8">
                            <div className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <Activity size={120} />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-8">Reprocurement Logistics Engine</h3>

                                <div className="space-y-8">
                                    {[
                                        {
                                            title: "Inventory Analysis",
                                            desc: "Real-time auditing of current product inventory levels against predefined safety thresholds.",
                                            icon: Package
                                        },
                                        {
                                            title: "Historical Sales Velocity",
                                            desc: "The system calculates the 'Daily Sales Velocity' by analyzing past sales records over the last 30 days.",
                                            icon: BarChart3
                                        },
                                        {
                                            title: "Detection Logic",
                                            desc: "Alerts are triggered automatically when `Stock On Hand` falls below the safety buffer (Sales Velocity × 7 Days).",
                                            icon: Zap
                                        },
                                        {
                                            title: "Strategic restock calculator",
                                            desc: "Calculates the recommended restock date by determining the exact day your inventory will reach zero based on current trends.",
                                            icon: ClipboardCheck
                                        }
                                    ].map((step, i) => (
                                        <div key={i} className="flex gap-6 group">
                                            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center shrink-0 border border-slate-100 group-hover:bg-primary-600 group-hover:text-white transition-all shadow-sm">
                                                <step.icon size={20} />
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] mb-1">{step.title}</p>
                                                <p className="text-xs font-bold text-slate-400 leading-relaxed">{step.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl">
                                <h3 className="text-xl font-black uppercase tracking-tight mb-6">Restock Priority Matrix</h3>
                                <div className="space-y-4">
                                    {[
                                        { label: "Critical Priority", desc: "Depletion estimated within 3 days", color: "bg-rose-500" },
                                        { label: "High Priority", desc: "Depletion estimated within 7 days", color: "bg-amber-500" },
                                        { label: "Medium Priority", desc: "Depletion estimated within 14 days", color: "bg-blue-500" },
                                        { label: "Low Priority", desc: "Safe inventory levels detected", color: "bg-emerald-500" }
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                                            <div className={`w-3 h-3 rounded-full ${item.color} shadow-lg`} />
                                            <div>
                                                <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-primary-600 rounded-[3rem] p-10 text-white shadow-xl flex gap-6 items-center">
                                <div className="p-4 bg-white/10 rounded-xl backdrop-blur-md">
                                    <ShoppingBag size={32} />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1 opacity-60">Revenue Impact</p>
                                    <p className="text-sm font-bold leading-relaxed">Early restocking of High-Velocity items prevents an estimated 12.5% loss in potential revenue from 'Out of Stock' events.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDSS;
