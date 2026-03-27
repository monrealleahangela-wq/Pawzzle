import React, { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare,
    Trash2,
    CheckCircle,
    Clock,
    Filter,
    Search,
    Star,
    Smartphone,
    Monitor,
    Layout,
    User,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    Smile,
    Bug,
    Zap,
    Sparkles,
    Shield,
    ChevronDown
} from 'lucide-react';
import { toast } from 'react-toastify';
import { reviewService } from '../../services/apiService';

const FeedbackManagement = () => {
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        category: '',
        status: '',
        search: '',
        page: 1,
        limit: 10
    });
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalFeedbacks: 0
    });

    const fetchFeedback = useCallback(async () => {
        try {
            setLoading(true);
            const response = await reviewService.getAllPlatformFeedback(filter);
            setFeedbacks(response.data?.feedbacks || []);
            setPagination(response.data?.pagination || { currentPage: 1, totalPages: 1, totalFeedbacks: 0 });
        } catch (error) {
            toast.error('Failed to load feedback data');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchFeedback();
    }, [fetchFeedback]);

    const handlePageChange = (newPage) => {
        setFilter(prev => ({ ...prev, page: newPage }));
    };

    const handleFilterChange = (name, value) => {
        setFilter(prev => ({ ...prev, [name]: value, page: 1 }));
    };

    const handleStatusUpdate = async (id, status) => {
        try {
            await reviewService.updatePlatformFeedbackStatus(id, { status });
            toast.success(`Feedback marked as ${status}`);
            fetchFeedback();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Delete this feedback mission?')) {
            try {
                await reviewService.deletePlatformFeedback(id);
                toast.success('Deleted successfully');
                fetchFeedback();
            } catch (error) {
                toast.error('Failed to delete');
            }
        }
    };

    const getCategoryIcon = (category) => {
        switch (category) {
            case 'UI/UX': return Layout;
            case 'Performance': return Zap;
            case 'Bug Report': return Bug;
            case 'Features': return Sparkles;
            default: return Smile;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'reviewed': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'implemented': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'dismissed': return 'bg-slate-100 text-slate-700 border-slate-200';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 bg-white p-8 sm:p-12 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <MessageSquare className="h-5 w-5 text-primary-600" />
                        <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">SYSTEM INTEL</span>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                        Platform <span className="text-primary-600 italic">Feedback</span>
                    </h1>
                    <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Voice of the customers & developers</p>
                </div>
            </header>

            {/* Intellectual HUD Filter - High Contrast & Always Visible */}
            <div className="bg-slate-900 p-2 rounded-2xl shadow-xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-6 relative">
                        <div className="absolute left-10 top-1/2 -translate-y-1/2 flex items-center gap-3">
                            <Sparkles className="h-4 w-4 text-primary-500" />
                        </div>
                        <select
                            value={filter.category}
                            onChange={(e) => setFilter({ ...filter, category: e.target.value, page: 1 })}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-28 pr-6 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
                        >
                            <option value="" className="bg-slate-900 text-white font-black">ALL FEEDBACK</option>
                            <option value="UI/UX" className="bg-slate-900 text-white font-black">UI / UX</option>
                            <option value="Performance" className="bg-slate-900 text-white font-black">PERFORMANCE</option>
                            <option value="Features" className="bg-slate-900 text-white font-black">FEATURES</option>
                            <option value="Bug Report" className="bg-slate-900 text-white font-black text-rose-400">BUGS</option>
                        </select>
                    </div>
                    <div className="md:col-span-4 relative group">
                        <div className="absolute left-10 top-1/2 -translate-y-1/2 flex items-center">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                        </div>
                        <input
                            type="text" placeholder=""
                            value={filter.search} onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="w-full pl-28 pr-4 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600 transition-all font-sans"
                        />
                    </div>
                    <div className="md:col-span-4 relative">
                        <div className="absolute left-10 top-1/2 -translate-y-1/2 flex items-center">
                            <Zap className="h-4 w-4 text-emerald-500" />
                        </div>
                        <select
                            value={filter.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-28 pr-6 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none transition-all cursor-pointer font-sans"
                        >
                            <option value="" className="bg-slate-900 text-white font-black">ANY STATUS</option>
                            <option value="pending" className="bg-slate-900 text-white font-black">PENDING</option>
                            <option value="reviewed" className="bg-slate-900 text-white font-black">REVIEWED</option>
                            <option value="implemented" className="bg-slate-900 text-white font-black text-emerald-400">IMPLEMENTED</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading ? (
                    [...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white p-8 rounded-2xl animate-pulse border border-slate-100">
                            <div className="h-4 w-32 bg-slate-100 rounded mb-4"></div>
                            <div className="h-10 w-full bg-slate-50 rounded mb-4"></div>
                            <div className="h-4 w-1/2 bg-slate-50 rounded"></div>
                        </div>
                    ))
                ) : feedbacks.length === 0 ? (
                    <div className="bg-white p-20 rounded-[3rem] text-center border border-dashed border-slate-200 shadow-sm">
                        <Smile className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No Feedback Missions Found</h3>
                    </div>
                ) : (
                    feedbacks.map((item) => {
                        const CatIcon = getCategoryIcon(item.category);
                        return (
                            <div key={item._id} className="bg-white p-6 sm:p-10 rounded-2xl border border-slate-50 shadow-sm hover:shadow-xl transition-all duration-500 group relative overflow-hidden">
                                <div className={`absolute top-0 right-10 w-16 h-1 px-4 rounded-b-full ${getStatusColor(item.status).split(' ')[0]}`}></div>

                                <div className="flex flex-col md:flex-row md:items-start gap-6 sm:gap-10">
                                    <div className="flex-1 space-y-4">
                                        <div className="flex items-center flex-wrap gap-2">
                                            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusColor(item.status)} border`}>
                                                {item.status}
                                            </span>
                                            <span className="flex items-center gap-1.5 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-[8px] font-black uppercase tracking-widest border border-primary-200">
                                                <CatIcon className="h-2.5 w-2.5" /> {item.category}
                                            </span>
                                            <div className="flex gap-0.5 ml-2">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star key={i} className={`h-2.5 w-2.5 ${i < item.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-100'}`} />
                                                ))}
                                            </div>
                                        </div>

                                        <p className="text-sm sm:text-lg font-bold text-slate-700 leading-relaxed italic pr-4">
                                            "{item.comment}"
                                        </p>

                                        <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                                                    {item.user?.avatar ? <img src={item.user.avatar} className="w-full h-full object-cover" alt="" /> : <User className="h-4 w-4 text-slate-300" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[9px] font-black text-slate-900 uppercase tracking-tight">{item.user?.firstName} @{item.user?.username}</p>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase">{item.user?.email}</p>
                                                </div>
                                            </div>
                                            <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest ml-auto text-right">
                                                {new Date(item.createdAt).toLocaleString()}
                                                <div className="flex items-center justify-end gap-1 mt-0.5 opacity-50">
                                                    {item.deviceInfo?.platform?.includes('Win') ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                                                    <span>{item.deviceInfo?.browser?.split(' ')[0]}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex md:flex-col gap-2 shrink-0">
                                        <button 
                                            onClick={() => handleStatusUpdate(item._id, item.status === 'pending' ? 'reviewed' : 'pending')}
                                            title={item.status === 'pending' ? 'Mark Reviewed' : 'Mark Pending'}
                                            className={`flex-1 md:flex-none p-3 rounded-2xl transition-all shadow-sm ${item.status === 'reviewed' ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-400 hover:bg-primary-600 hover:text-white'}`}
                                        >
                                            <CheckCircle className="h-5 w-5" />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(item._id)}
                                            className="flex-1 md:flex-none p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {pagination.totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 pt-8">
                    <button
                        disabled={filter.page === 1}
                        onClick={() => handlePageChange(filter.page - 1)}
                        className="p-3 bg-white rounded-2xl border border-slate-100 text-slate-400 disabled:opacity-30 hover:bg-primary-50 hover:text-primary-600 transition-all shadow-sm"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <div className="flex gap-2">
                        {[...Array(pagination.totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => handlePageChange(i + 1)}
                                className={`w-10 h-10 rounded-xl text-[10px] font-black tracking-widest transition-all ${filter.page === i + 1 ? 'bg-slate-900 text-white shadow-xl shadow-slate-200' : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-100'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <button
                        disabled={filter.page === pagination.totalPages}
                        onClick={() => handlePageChange(filter.page + 1)}
                        className="p-3 bg-white rounded-2xl border border-slate-100 text-slate-400 disabled:opacity-30 hover:bg-primary-50 hover:text-primary-600 transition-all shadow-sm"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default FeedbackManagement;
