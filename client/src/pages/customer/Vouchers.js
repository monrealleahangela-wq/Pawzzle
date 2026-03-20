import React, { useState, useEffect } from 'react';
import { Ticket, Tag, Store, Calendar, CheckCircle2, Copy, AlertCircle, Sparkles, ChevronRight, Gift, ShoppingBag, ArrowRight } from 'lucide-react';
import { voucherService } from '../../services/apiService';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';

const Vouchers = () => {
    const [availableVouchers, setAvailableVouchers] = useState([]);
    const [myVouchers, setMyVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('available');

    const fetchData = async () => {
        try {
            setLoading(true);
            const [availableRes, myRes] = await Promise.all([
                voucherService.getAvailableVouchers(),
                voucherService.getMyVouchers()
            ]);
            setAvailableVouchers(availableRes.data.vouchers);
            setMyVouchers(myRes.data.vouchers);
        } catch (error) {
            console.error('Error fetching vouchers:', error);
            toast.error('Failed to load vouchers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleClaim = async (voucherId) => {
        try {
            await voucherService.claimVoucher(voucherId);
            toast.success('Voucher claimed successfully!');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to claim voucher');
        }
    };

    const copyToClipboard = (code) => {
        navigator.clipboard.writeText(code);
        toast.info(`Code ${code} copied to clipboard!`);
    };

    const renderVoucherCard = (item, type) => {
        const voucher = type === 'my' ? item.voucher : item;
        if (!voucher) return null;

        return (
            <div key={voucher._id} className="group relative bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden hover:shadow-[0_48px_80px_-16px_rgba(0,0,0,0.12)] hover:-translate-y-3 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col">
                {/* Visual Accent - Color Bar */}
                <div className="absolute top-0 left-0 w-3 h-full bg-gradient-to-b from-primary-600 to-primary-400 group-hover:w-4 transition-all duration-500" />
                
                {/* Hero Section of Coupon */}
                <div className="p-8 pb-6 border-b-2 border-dashed border-slate-100 relative">
                    {/* Ticket Cutouts */}
                    <div className="absolute -left-4 -bottom-4 w-8 h-8 bg-[#FDFCFB] rounded-full border border-slate-100 shadow-inner z-20" />
                    <div className="absolute -right-4 -bottom-4 w-8 h-8 bg-[#FDFCFB] rounded-full border border-slate-100 shadow-inner z-20" />
                    
                    <div className="flex justify-between items-start mb-8">
                        <div className="flex items-center gap-5">
                            <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-2xl group-hover:shadow-primary-500/20 rotate-3 group-hover:rotate-0 transition-all duration-500 shrink-0">
                                <Ticket size={32} className="group-hover:scale-110 transition-transform" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2 truncate group-hover:text-primary-600 transition-colors uppercase">{voucher.code}</h3>
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-primary-50 flex items-center justify-center border border-primary-100">
                                        <Store size={10} className="text-primary-500" />
                                    </div>
                                    <span className="text-[9px] font-black text-slate-400 font-bold uppercase tracking-[0.2em] truncate">{voucher.store?.name || 'Global Access'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative group/val">
                        <div className="flex items-baseline gap-1">
                            <span className="text-5xl font-black text-slate-900 tracking-tighter group-hover:scale-105 transition-transform origin-left inline-block">
                                {voucher.discountType === 'percentage' ? `${voucher.discountValue}%` : `₱${voucher.discountValue}`}
                            </span>
                            <span className="text-[11px] font-black text-primary-600 uppercase tracking-widest animate-pulse">reduction</span>
                        </div>
                        <div className="h-1 w-20 bg-primary-500/20 rounded-full mt-1 group-hover:w-32 transition-all duration-500" />
                    </div>
                </div>

                {/* Sub Section of Coupon */}
                <div className="p-8 pt-10 flex-1 flex flex-col justify-between">
                    <div className="space-y-5 px-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-primary-500 group-hover:bg-primary-50 transition-colors">
                                    <ShoppingBag size={14} />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Min. Liquid Capital</span>
                            </div>
                            <span className="text-[12px] font-black text-slate-900">₱{voucher.minPurchase.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-primary-500 group-hover:bg-primary-50 transition-colors">
                                    <Calendar size={14} />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Validity Horizon</span>
                            </div>
                            <span className="text-[12px] font-black text-slate-900">{new Date(voucher.endDate).toLocaleDateString()}</span>
                        </div>
                    </div>

                    <div className="mt-10">
                        {type === 'available' ? (
                            <button
                                onClick={() => handleClaim(voucher._id)}
                                className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.4em] shadow-2xl shadow-slate-900/20 hover:bg-primary-600 hover:scale-[1.02] active:scale-95 transition-all duration-500 flex items-center justify-center gap-3 group/btn"
                            >
                                Secure Asset <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
                            </button>
                        ) : (
                            <div className="flex gap-4">
                                <button
                                    onClick={() => copyToClipboard(voucher.code)}
                                    className="flex-1 py-4 bg-white text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-slate-100 hover:border-slate-900 transition-all flex items-center justify-center gap-2"
                                >
                                    <Copy size={14} /> Metadata
                                </button>
                                <Link
                                    to="/products"
                                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                                >
                                    Deploy <ArrowRight size={14} />
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#FDFCFB] pb-32">
            {/* Hero Header - Refined with Premium Aesthetics */}
            <div className="bg-slate-900 pt-40 pb-32 px-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-[120px] -mr-64 -mt-64 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary-500/10 rounded-full blur-[100px] -ml-48 -mb-48" />
                
                {/* Decorative Elements */}
                <div className="absolute top-20 left-20 opacity-20 hidden lg:block">
                  <Sparkles size={100} className="text-white animate-spin-slow" />
                </div>
                
                <div className="max-w-7xl mx-auto relative z-10 text-center">
                    <div className="inline-flex items-center gap-4 mb-10 bg-white/5 backdrop-blur-xl rounded-full px-6 py-2 border border-white/10 shadow-2xl animate-fade-in">
                        <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                            <Gift className="text-white" size={16} />
                        </div>
                        <span className="text-[9px] font-black text-white/80 uppercase tracking-[0.4em]">Resource Procurement Center</span>
                    </div>
                    
                    <h1 className="text-5xl sm:text-8xl font-black text-white uppercase tracking-tighter leading-[0.85] mb-8">
                        Claim Your <br />
                        <span className="text-primary-500 italic relative inline-block">
                          Discounts
                          <div className="absolute -bottom-2 sm:-bottom-4 left-0 w-full h-1 sm:h-2 bg-primary-500/30 blur-sm rounded-full" />
                        </span>
                    </h1>
                    
                    <p className="text-slate-400 max-w-xl mx-auto text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] leading-loose opacity-70">
                        Acquire exclusive provisioning vouchers from partner bases and optimize your acquisition costs today.
                    </p>
                </div>
            </div>

            {/* Content Tabs - More Fluid and Integrated */}
            <div className="max-w-7xl mx-auto px-4 -mt-12 mb-20 relative z-20">
                <div className="bg-white/80 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_32px_120px_-20px_rgba(0,0,0,0.15)] p-3 sm:p-5 flex gap-3 border border-white">
                    <button
                        onClick={() => setActiveTab('available')}
                        className={`flex-1 py-5 rounded-[1.8rem] flex items-center justify-center gap-4 transition-all duration-500 ${activeTab === 'available' ? 'bg-slate-900 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)]' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        <Sparkles size={20} className={activeTab === 'available' ? 'animate-bounce' : ''} />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">Available Promotions</span>
                        {availableVouchers.length > 0 && (
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${activeTab === 'available' ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {availableVouchers.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('my')}
                        className={`flex-1 py-5 rounded-[1.8rem] flex items-center justify-center gap-4 transition-all duration-500 ${activeTab === 'my' ? 'bg-slate-900 text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)]' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                        <Ticket size={20} className={activeTab === 'my' ? 'animate-bounce' : ''} />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">My Collection</span>
                        {myVouchers.length > 0 && (
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${activeTab === 'my' ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {myVouchers.length}
                            </span>
                        )}
                    </button>
                </div>

                <div className="mt-20">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="bg-white rounded-[3rem] h-[400px] animate-pulse relative overflow-hidden">
                                  <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            {activeTab === 'available' ? (
                                availableVouchers.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                                        {availableVouchers.map(v => renderVoucherCard(v, 'available'))}
                                    </div>
                                ) : (
                                    <div className="text-center py-40 bg-white rounded-[4rem] border border-slate-100 shadow-xl shadow-slate-100">
                                        <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
                                            <Sparkles size={56} className="text-slate-200" />
                                        </div>
                                        <h3 className="text-3xl font-black text-slate-300 uppercase tracking-tighter mb-2">Inventory Depleted</h3>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Fresh promotions are currently being queued.</p>
                                    </div>
                                )
                            ) : (
                                myVouchers.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                                        {myVouchers.map(v => renderVoucherCard(v, 'my'))}
                                    </div>
                                ) : (
                                    <div className="text-center py-40 bg-white rounded-[4rem] border border-slate-100 shadow-xl shadow-slate-100">
                                        <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
                                            <Ticket size={56} className="text-slate-200" />
                                        </div>
                                        <h3 className="text-3xl font-black text-slate-300 uppercase tracking-tighter mb-4">Collection Empty</h3>
                                        <button 
                                            onClick={() => setActiveTab('available')} 
                                            className="px-10 py-5 bg-slate-900 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.3em] shadow-2xl shadow-slate-200 hover:bg-primary-600 transition-all hover:scale-105 active:scale-95"
                                        >
                                            Explore Promotions
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Vouchers;
