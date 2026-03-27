import React, { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare,
    Trash2,
    CheckCircle,
    Clock,
    Filter,
    Search,
    User,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    HelpCircle,
    Mail,
    ShieldAlert,
    Send,
    Shield,
    Calendar,
    ChevronDown
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supportService, userService, getImageUrl } from '../../services/apiService';
import { Zap } from 'lucide-react';

const SupportManagement = () => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        search: '',
        dateRange: '',
        page: 1,
        limit: 10
    });
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalMessages: 0
    });

    const fetchMessages = useCallback(async () => {
        try {
            setLoading(true);
            const response = await supportService.getAllMessages(filters);
            setMessages(response.data?.messages || []);
            setPagination(response.data?.pagination || { currentPage: 1, totalPages: 1, totalMessages: 0 });
        } catch (error) {
            console.error('Fetch support messages error:', error);
            const errMsg = error.response?.data?.message || error.message || 'Failed to load support messages';
            toast.error(errMsg);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    const handleFilterChange = (name, value) => {
        setFilters(prev => ({ ...prev, [name]: value, page: 1 }));
    };

    const handlePageChange = (newPage) => {
        setFilters(prev => ({ ...prev, page: newPage }));
    };

    const handleUpdateStatus = async (messageId, status) => {
        try {
            const adminNotes = prompt('Add admin notes (optional):');
            await supportService.updateMessageStatus(messageId, { status, adminNotes });
            toast.success(`Message marked as ${status}`);
            fetchMessages();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleResolveAndEnableAccount = async (message) => {
        try {
            // 1. Find the user by email
            const searchResponse = await userService.getAllUsers({ search: message.email });
            const users = searchResponse.data?.users || [];
            const targetUser = users.find(u => u.email.toLowerCase() === message.email.toLowerCase());

            if (!targetUser) {
                toast.error('Could not find an account associated with this email.');
                return;
            }

            if (targetUser.isActive) {
                toast.info('This account is already active.');
                // We'll still offer to resolve the ticket
            } else {
                // 2. Enable the account
                await userService.toggleUserStatus(targetUser._id, { reason: 'Account recovered via support ticket.' });
                toast.success('Account successfully enabled!');
            }

            // 3. Resolve the ticket
            await supportService.updateMessageStatus(message._id, { 
                status: 'resolved', 
                adminNotes: `Account recovered and enabled. Target User: ${targetUser.username}` 
            });
            fetchMessages();
        } catch (error) {
            toast.error('Failed to recover account. Please try manual management.');
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'in_review': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'resolved': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'closed': return 'bg-slate-100 text-slate-700 border-slate-200';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 bg-white p-8 sm:p-12 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <HelpCircle className="h-5 w-5 text-primary-600" />
                        <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">SUPPORT HQ</span>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                        Support <span className="text-primary-600 italic">Tickets</span>
                    </h1>
                    <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Manage account recovery & support requests</p>
                </div>
            </header>

            {/* Support HUD Filter - High Contrast & Always Visible */}
            <div className="bg-slate-900 p-2 rounded-2xl shadow-xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-6 relative group">
                        <div className="absolute left-10 top-1/2 -translate-y-1/2 flex items-center">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                        </div>
                        <input
                            type="text" placeholder=""
                            value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="w-full pl-28 pr-4 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
                        />
                    </div>
                    <div className="md:col-span-3 relative">
                        <div className="absolute left-10 top-1/2 -translate-y-1/2">
                            <Filter className="h-3.5 w-3.5 text-primary-500" />
                        </div>
                        <select
                            value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-28 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
                        >
                            <option value="" className="bg-slate-900 text-white font-black">ALL STATUSES</option>
                            <option value="pending" className="bg-slate-900 text-white font-black">PENDING</option>
                            <option value="in_review" className="bg-slate-900 text-white font-black">IN REVIEW</option>
                            <option value="resolved" className="bg-slate-900 text-white font-black">RESOLVED</option>
                            <option value="closed" className="bg-slate-900 text-white font-black">CLOSED</option>
                        </select>
                    </div>
                    <div className="md:col-span-3 relative">
                        <div className="absolute left-10 top-1/2 -translate-y-1/2">
                            <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                        </div>
                        <select
                            value={filters.dateRange} onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-28 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
                        >
                            <option value="" className="bg-slate-900 text-white font-black">ALL TIME</option>
                            <option value="today" className="bg-slate-900 text-white font-black">TODAY</option>
                            <option value="week" className="bg-slate-900 text-white font-black">THIS WEEK</option>
                            <option value="month" className="bg-slate-900 text-white font-black">THIS MONTH</option>
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
                ) : messages.length === 0 ? (
                    <div className="bg-white p-20 rounded-[3rem] text-center border border-dashed border-slate-200 shadow-sm">
                        <HelpCircle className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No Support Requests Found</h3>
                    </div>
                ) : (
                    messages.map((item) => {
                        return (
                            <div key={item._id} className="bg-white p-6 sm:p-10 rounded-2xl border border-slate-50 shadow-sm hover:shadow-xl transition-all duration-500 group relative overflow-hidden">
                                <div className={`absolute top-0 right-10 w-16 h-1 px-4 rounded-b-full ${getStatusColor(item.status).split(' ')[0]}`}></div>

                                <div className="flex flex-col md:flex-row md:items-start gap-6 sm:gap-10">
                                    <div className="flex-1 space-y-4">
                                        <div className="flex items-center flex-wrap gap-2">
                                            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusColor(item.status)} border`}>
                                                {(item.status || 'pending').replace('_', ' ')}
                                            </span>
                                            <span className="flex items-center gap-1.5 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-[8px] font-black uppercase tracking-widest border border-primary-200">
                                                {item.subject}
                                            </span>
                                        </div>

                                        <p className="text-sm sm:text-lg font-bold text-slate-700 leading-relaxed pr-4">
                                            "{item.message}"
                                        </p>

                                        {item.adminNotes && (
                                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-[11px] text-slate-500">
                                                <span className="font-black uppercase tracking-widest text-[9px] block mb-1">Admin Notes:</span>
                                                {item.adminNotes}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                                                    {item.user?.avatar ? <img src={getImageUrl(item.user.avatar)} className="w-full h-full object-cover" alt="" /> : <User className="h-4 w-4 text-slate-300" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[9px] font-black text-slate-900 uppercase tracking-tight">
                                                        {item.user ? `${item.user.firstName} (@${item.user.username})` : 'Guest User'}
                                                    </p>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase">{item.email}</p>
                                                </div>
                                            </div>
                                            <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest ml-auto text-right">
                                                {new Date(item.createdAt).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex md:flex-col gap-2 shrink-0">
                                        <button 
                                            onClick={() => handleUpdateStatus(item._id, 'in_review')}
                                            className="flex-1 md:flex-none p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-primary-600 hover:text-white transition-all shadow-sm"
                                            title="Mark as In Review"
                                        >
                                            <Clock className="h-5 w-5" />
                                        </button>
                                        <button 
                                            onClick={() => handleUpdateStatus(item._id, 'resolved')}
                                            className="flex-1 md:flex-none p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                            title="Mark as Resolved"
                                        >
                                            <CheckCircle className="h-5 w-5" />
                                        </button>
                                        <a 
                                            href={`mailto:${item.email}?subject=Re: ${item.subject}`}
                                            className="flex-1 md:flex-none p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center justify-center"
                                            title="Reply via Email"
                                        >
                                            <Mail className="h-5 w-5" />
                                        </a>
                                        {item.subject.toLowerCase().includes('recovery') && item.status !== 'resolved' && (
                                            <button 
                                                onClick={() => handleResolveAndEnableAccount(item)}
                                                className="flex-1 md:flex-none p-3 bg-primary-50 text-primary-600 rounded-2xl hover:bg-primary-600 hover:text-white transition-all shadow-sm flex items-center justify-center animate-pulse"
                                                title="Resolve & Enable Account"
                                            >
                                                <Zap className="h-5 w-5" />
                                            </button>
                                        )}
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
                        disabled={filters.page === 1}
                        onClick={() => handlePageChange(filters.page - 1)}
                        className="p-3 bg-white rounded-2xl border border-slate-100 text-slate-400 disabled:opacity-30 hover:bg-primary-50 hover:text-primary-600 transition-all shadow-sm"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <div className="flex gap-2">
                        {[...Array(pagination.totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => handlePageChange(i + 1)}
                                className={`w-10 h-10 rounded-xl text-[10px] font-black tracking-widest transition-all ${filters.page === i + 1 ? 'bg-slate-900 text-white shadow-xl shadow-slate-200' : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-100'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <button
                        disabled={filters.page === pagination.totalPages}
                        onClick={() => handlePageChange(filters.page + 1)}
                        className="p-3 bg-white rounded-2xl border border-slate-100 text-slate-400 disabled:opacity-30 hover:bg-primary-50 hover:text-primary-600 transition-all shadow-sm"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default SupportManagement;
