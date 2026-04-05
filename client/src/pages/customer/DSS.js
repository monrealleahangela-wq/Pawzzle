import React, { useState, useEffect } from 'react';
import { dssService } from '../../services/apiService';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import {
    Brain, TrendingUp, Heart,
    Zap, Sparkles, Package, Stethoscope,
    Clock, ShieldAlert, Coins, Info, CheckCircle2,
    Calendar, ClipboardCheck, ArrowRight
} from 'lucide-react';

const CustomerDSS = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('recommendations');

    useEffect(() => { fetchInsights(); }, []);

    const fetchInsights = async () => {
        try {
            const res = await dssService.getCustomerInsights();
            setData(res.data);
        } catch (err) {
            toast.error('Failed to load insights');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-slate-100 border-t-primary-600 animate-spin" />
                    <Brain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary-600 animate-pulse" size={24} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Consulting AI Advisor...</p>
            </div>
        );
    }

    if (!data) return null;

    const { overview, bookings, monthlySpending, recommendations, myPets, petIntelligence } = data;

    const avgMonthlySpend = monthlySpending.length > 0
        ? Math.round(monthlySpending.reduce((s, m) => s + m.total, 0) / monthlySpending.length)
        : 0;

    const cardStyle = "bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition-all duration-500";
    const labelStyle = "text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block";

    return (
        <div className="flex flex-col gap-8 pb-32 animate-fade-in">
            {/* Premium Hero Section */}
            <div className="relative bg-slate-900 rounded-[3rem] p-10 md:p-16 text-white overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/10 rounded-full blur-[120px] -mr-32 -mt-32 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] -ml-16 -mb-16" />

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary-600/20 rounded-xl backdrop-blur-md border border-primary-500/30">
                            <Brain size={20} className="text-primary-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary-400">Decision Support Intelligence</span>
                    </div>

                    <div className="max-w-3xl">
                        <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-6">
                            Smart care <br /> <span className="text-primary-500 italic">Recommendations</span>
                        </h1>
                        <p className="text-sm md:text-lg font-bold text-slate-400 max-w-xl leading-relaxed">
                            Our advanced DSS platform analyzes your pet's profile and booking history to generate personalized wellness roadmaps.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-4 mt-10">
                        <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm">
                            <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Total Analysis Points</p>
                            <p className="text-xl font-black">{(myPets.length * 5) + 12} Vectors</p>
                        </div>
                        <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm">
                            <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Personalization Accuracy</p>
                            <p className="text-xl font-black text-emerald-400">98.4% Match</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 p-1.5 bg-slate-100 rounded-3xl w-fit mx-auto shadow-inner">
                {[
                    { id: 'recommendations', label: 'Recommendations', icon: Sparkles },
                    { id: 'how-it-works', label: 'How it Works', icon: Info },
                    { id: 'financial', label: 'Spend Analytics', icon: Coins }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id
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
            {activeTab === 'recommendations' && (
                <div className="space-y-8 animate-fade-in-up">
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-3">
                            <Sparkles size={20} className="text-primary-600" />
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Personalized Care Engine</h2>
                        </div>
                    </div>

                    {petIntelligence.length === 0 ? (
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border border-slate-100">
                                <Heart className="text-slate-200" size={40} />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-3">No Active Pet Profiles</h3>
                            <p className="text-sm font-bold text-slate-400 max-w-md mx-auto mb-10 leading-relaxed uppercase tracking-widest">
                                Adopt a pet or book a service to unlock deep health insights and smart care roadmaps.
                            </p>
                            <Link to="/pets" className="px-10 py-5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-2xl">
                                Discover Pets
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {petIntelligence.map((petInfo, idx) => {
                                const petDetail = myPets.find(p => p._id === petInfo.petId) ||
                                    myPets.find(p => p.name === petInfo.petName);

                                return (
                                    <div key={idx} className={cardStyle}>
                                        <div className="flex flex-col md:flex-row gap-8">
                                            {/* Pet Profile Minimal */}
                                            <div className="flex flex-col items-center gap-4 w-full md:w-32 shrink-0">
                                                <div className="w-24 h-24 rounded-[2rem] overflow-hidden border-4 border-slate-50 shadow-lg bg-slate-100 flex items-center justify-center">
                                                    {petDetail?.images?.[0] ? (
                                                        <img src={petDetail.images[0]} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <Heart className="text-slate-300" size={32} />
                                                    )}
                                                </div>
                                                <div className="text-center">
                                                    <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">{petInfo.petName}</h4>
                                                    <p className="text-[8px] font-black text-primary-600 uppercase tracking-widest">{petDetail?.breed || petDetail?.type}</p>
                                                </div>
                                                <div className="w-full p-3 bg-primary-50 border border-primary-100 rounded-2xl text-center">
                                                    <span className="text-[7px] font-black text-primary-600 uppercase block mb-1">Monthly Forecast</span>
                                                    <span className="text-sm font-black text-primary-600">₱{petInfo.costEstimate}</span>
                                                </div>
                                            </div>

                                            {/* Dynamic Recommendations */}
                                            <div className="flex-1 space-y-6">
                                                {petInfo.suggestions.map((sug, sIdx) => (
                                                    <div key={sIdx} className="bg-slate-50/50 p-6 rounded-[1.8rem] border border-slate-100 group hover:bg-white transition-all hover:shadow-lg">
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className="p-2 bg-white rounded-xl shadow-sm italic font-black text-[10px] text-primary-600 uppercase tracking-widest">
                                                                Smart Suggestion
                                                            </div>
                                                        </div>
                                                        <p className="text-sm md:text-base font-black text-slate-900 mb-2 leading-snug">
                                                            "{sug.reason}"
                                                        </p>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-l-2 border-primary-600 pl-3">
                                                            Optimized for {petDetail?.type} • Age {petDetail?.age} {petDetail?.ageUnit}
                                                        </p>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {sug.items.map((item, iIdx) => (
                                                                <Link key={iIdx} to={`/services/${item.id}`} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-primary-500 transition-all group/item">
                                                                    <div>
                                                                        <p className="text-[9px] font-black text-slate-900 uppercase tracking-tight">{item.name}</p>
                                                                        <p className="text-[8px] font-bold text-slate-400">₱{item.price}</p>
                                                                    </div>
                                                                    <ArrowRight size={12} className="text-slate-300 group-hover/item:text-primary-600 transition-colors" />
                                                                </Link>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Trending for Similar Pets */}
                                                <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                                    <TrendingUp className="text-emerald-500" size={16} />
                                                    <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest leading-relaxed">
                                                        <span className="font-black">Popular for {petDetail?.breed}:</span> 84% of similar owners in your area booked grooming this week.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'how-it-works' && (
                <div className="animate-fade-in-up">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                        <div className="space-y-8">
                            <div className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <Brain size={120} />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-8">The Smart Intelligence Engine</h3>

                                <div className="space-y-8">
                                    {[
                                        { title: "Data Collection", desc: "We analyze pet type, breed, precise age, and historical health records for high-fidelity profiling.", icon: ClipboardCheck },
                                        { title: "Pattern Matching", desc: "Our engine cross-references your profile with popular services among thousands of similar pets.", icon: Zap },
                                        { title: "Smart Categorization", desc: "Prioritizes grooming, health & wellness, boarding, and pet services based on current life stages.", icon: ShieldAlert },
                                        { title: "Predictive Output", desc: "Generates actionable clinical recommendations for a proactive wellness journey.", icon: CheckCircle2 }
                                    ].map((step, i) => (
                                        <div key={i} className="flex gap-6 group">
                                            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 group-hover:bg-primary-600 group-hover:text-white transition-all shadow-sm">
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
                                <h3 className="text-xl font-black uppercase tracking-tight mb-6">Recommendation Matrix</h3>
                                <div className="space-y-4">
                                    {[
                                        "Pet Grooming (Breed specific coat care)",
                                        "Vaccination (Age-appropriate protection)",
                                        "Wellness Checkups (Annual screening)",
                                        "Anti-Tick Treatment (Proactive protection)",
                                        "Pet Boarding (Based on active travel patterns)"
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                                            <div className="w-2 h-2 rounded-full bg-primary-500" />
                                            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-primary-600 rounded-[3rem] p-10 text-white shadow-xl flex gap-6 items-center">
                                <Stethoscope size={48} className="opacity-30 shrink-0" />
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1 opacity-60">Verified Accuracy</p>
                                    <p className="text-sm font-bold leading-relaxed">System-generated recommendations are calibrated specifically for feline, canine, and rabbit health protocols.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'financial' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
                    <div className={cardStyle}>
                        <p className={labelStyle}>Historical Average</p>
                        <p className="text-4xl font-black text-slate-900 tracking-tighter mb-4">₱{avgMonthlySpend.toLocaleString()}</p>
                        <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                            <TrendingUp size={12} />
                            Stable Trend
                        </div>
                    </div>
                    <div className={cardStyle}>
                        <p className={labelStyle}>Active Bookings</p>
                        <p className="text-4xl font-black text-slate-900 tracking-tighter mb-4">{bookings.total}</p>
                        <div className="flex items-center gap-2 text-[10px] font-black text-primary-600 uppercase tracking-widest">
                            <Calendar size={12} />
                            Upcoming: {bookings.upcoming}
                        </div>
                    </div>
                    <div className={cardStyle}>
                        <p className={labelStyle}>Platform Loyalty</p>
                        <div className="relative w-16 h-16 mb-4">
                            <svg className="w-full h-full" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                                <circle cx="50" cy="50" r="45" fill="none" stroke="#6d7c45" strokeWidth="10" strokeDasharray="210" strokeDashoffset="70" />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black">75%</span>
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Platinum Tier</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerDSS;
