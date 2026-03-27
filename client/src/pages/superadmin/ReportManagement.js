import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldAlert,
    Search,
    CheckCircle2,
    X,
    User,
    Store,
    Calendar,
    Filter,
    AlertTriangle,
    ExternalLink,
    MoreVertical,
    ChevronLeft,
    ChevronRight,
    Shield,
    ChevronDown
} from 'lucide-react';
import { toast } from 'react-toastify';
import { adminReportService } from '../../services/apiService';

const ReportManagement = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        search: '',
        dateRange: ''
    });
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
    });
    const [selectedReport, setSelectedReport] = useState(null);

    const fetchReports = useCallback(async () => {
        try {
            setLoading(true);
            const response = await adminReportService.getAllReports({
                ...filters,
                page: pagination.currentPage,
                limit: 10
            });
            setReports(response.data.reports || []);
            setPagination(response.data.pagination || { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false });
        } catch (error) {
            toast.error('Failed to load reports');
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.currentPage]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const handleFilterChange = (name, value) => {
        setFilters(prev => ({ ...prev, [name]: value }));
        setPagination(prev => ({ ...prev, currentPage: 1 }));
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            await adminReportService.updateReportStatus(id, newStatus);
            toast.success('Report status updated');
            fetchReports();
            setSelectedReport(null);
        } catch (error) {
            toast.error('Failed to update report status');
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'bg-amber-100 text-amber-600 border-amber-200';
            case 'reviewed': return 'bg-blue-100 text-blue-600 border-blue-200';
            case 'resolved': return 'bg-emerald-100 text-emerald-600 border-emerald-200';
            case 'dismissed': return 'bg-slate-100 text-slate-500 border-slate-200';
            case 'action_taken': return 'bg-rose-100 text-rose-600 border-rose-200';
            default: return 'bg-slate-100 text-slate-500 border-slate-200';
        }
    };

    return (
        <div className="space-y-6 pb-20 p-4 lg:p-8 bg-slate-50/30 min-h-screen">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-slate-100 pb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <ShieldAlert className="h-4 w-4 text-rose-600" />
                        <span className="text-[9px] font-black text-rose-600 uppercase tracking-[0.4em]">SUPER ADMIN : SAFETY</span>
                    </div>
                    <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                        Report <span className="text-rose-600 italic">Management</span>
                    </h1>
                    <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Review and manage safety reports from sellers</p>
                </div>
            </div>

            {/* Safety HUD Filter - High Contrast & Always Visible */}
            <div className="bg-slate-900 p-2 rounded-[2.5rem] shadow-xl border border-slate-800 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-6 relative group">
                        <div className="absolute left-12 top-1/2 -translate-y-1/2 flex items-center">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                        </div>
                        <input
                            type="text" placeholder="QUERY REPORTS: STORE, USER, REASON..."
                            value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="w-full pl-32 pr-4 py-5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-3xl outline-none focus:ring-2 focus:ring-rose-500/50 placeholder:text-slate-600 transition-all font-sans"
                        />
                    </div>
                    <div className="md:col-span-3 relative">
                        <div className="absolute left-12 top-1/2 -translate-y-1/2">
                            <Filter className="h-3.5 w-3.5 text-rose-500" />
                        </div>
                        <select
                            value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-3xl pl-32 pr-10 py-5 outline-none focus:ring-2 focus:ring-rose-500/50 appearance-none transition-all cursor-pointer font-sans"
                        >
                            <option value="" className="bg-slate-900 text-white font-black">ALL STATUSES</option>
                            <option value="pending" className="bg-slate-900 text-white font-black">PENDING</option>
                            <option value="reviewed" className="bg-slate-900 text-white font-black">REVIEWED</option>
                            <option value="resolved" className="bg-slate-900 text-white font-black">RESOLVED</option>
                            <option value="dismissed" className="bg-slate-900 text-white font-black">DISMISSED</option>
                            <option value="action_taken" className="bg-slate-900 text-white font-black">ACTION TAKEN</option>
                        </select>
                    </div>
                    <div className="md:col-span-3 relative">
                        <div className="absolute left-12 top-1/2 -translate-y-1/2">
                            <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                        </div>
                        <select
                            value={filters.dateRange} onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-3xl pl-32 pr-10 py-5 outline-none focus:ring-2 focus:ring-rose-500/50 appearance-none transition-all cursor-pointer font-sans"
                        >
                            <option value="" className="bg-slate-900 text-white font-black">ALL TIME</option>
                            <option value="today" className="bg-slate-900 text-white font-black">TODAY</option>
                            <option value="week" className="bg-slate-900 text-white font-black">THIS WEEK</option>
                            <option value="month" className="bg-slate-900 text-white font-black">THIS MONTH</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Date</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Reporter (Seller)</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Reported User</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Reason</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Status</th>
                                <th className="px-8 py-5 text-right text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                [1, 2, 3].map(i => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan="6" className="px-8 py-6 h-16 bg-white/50" />
                                    </tr>
                                ))
                            ) : reports.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-8 py-20 text-center">
                                        <ShieldAlert className="h-12 w-12 text-slate-100 mx-auto mb-4" />
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No reports found matching criteria</p>
                                    </td>
                                </tr>
                            ) : (
                                reports.map((report) => (
                                    <tr key={report._id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="text-[11px] font-black text-slate-900 uppercase">
                                                {new Date(report.createdAt).toLocaleDateString()}
                                            </div>
                                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.1em]">
                                                {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                                                    <Store className="h-4 w-4 text-primary-600" />
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-black text-slate-900 uppercase">{report.reporter?.firstName} {report.reporter?.lastName}</div>
                                                    <div className="text-[8px] font-bold text-primary-500 uppercase tracking-widest">{report.store?.name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                                                    <User className="h-4 w-4 text-rose-600" />
                                                </div>
                                                <div>
                                                    <div className="text-[11px] font-black text-slate-900 uppercase">{report.reportedUser?.firstName} {report.reportedUser?.lastName}</div>
                                                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">@{report.reportedUser?.username}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight bg-slate-100 px-2 py-1 rounded">
                                                {report.reason.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border ${getStatusColor(report.status)}`}>
                                                {report.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button
                                                onClick={() => setSelectedReport(report)}
                                                className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {reports.length > 0 && (
                <div className="flex justify-center items-center gap-4 bg-white border border-slate-100 p-4 rounded-[2rem] w-fit mx-auto shadow-sm">
                    <button
                        disabled={!pagination.hasPrev}
                        onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
                        className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest whitespace-nowrap">
                        Page <span className="text-primary-600 italic px-1">{pagination.currentPage}</span> / {pagination.totalPages}
                    </span>
                    <button
                        disabled={!pagination.hasNext}
                        onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
                        className="p-3 bg-slate-900 text-white rounded-xl hover:bg-primary-600 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            {selectedReport && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in">
                    <div className="bg-white rounded-[3rem] max-w-2xl w-full shadow-2xl overflow-hidden animate-slide-up">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                                    Report <span className="text-rose-600 italic">Details</span>
                                </h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Case ID: {selectedReport._id.slice(-8).toUpperCase()}</p>
                            </div>
                            <button
                                onClick={() => setSelectedReport(null)}
                                className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-10 space-y-8">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block">Reporter Details</label>
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <p className="text-[13px] font-black text-slate-900 uppercase">{selectedReport.reporter?.firstName} {selectedReport.reporter?.lastName}</p>
                                        <p className="text-[10px] font-bold text-primary-600 uppercase tracking-widest">{selectedReport.store?.name}</p>
                                        <p className="text-[10px] font-medium text-slate-400 italic mt-1">{selectedReport.reporter?.email}</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block">Reported User</label>
                                    <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                        <p className="text-[13px] font-black text-rose-900 uppercase">{selectedReport.reportedUser?.firstName} {selectedReport.reportedUser?.lastName}</p>
                                        <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">@{selectedReport.reportedUser?.username}</p>
                                        <p className="text-[10px] font-medium text-rose-300 italic mt-1">{selectedReport.reportedUser?.email}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block">Reason & Findings</label>
                                <div className="p-6 bg-slate-900 text-white rounded-[2rem] border border-white/5 relative overflow-hidden">
                                    <AlertTriangle className="absolute -bottom-4 -right-4 w-24 h-24 opacity-5" />
                                    <div className="relative z-10">
                                        <span className="px-3 py-1 bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-primary-400 mb-4 inline-block italic">
                                            {selectedReport.reason.replace('_', ' ')}
                                        </span>
                                        <p className="text-[14px] font-medium leading-relaxed italic opacity-80">
                                            "{selectedReport.description}"
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-100 flex flex-wrap gap-3">
                                <p className="w-full text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Update Case Status:</p>
                                {['reviewed', 'resolved', 'dismissed', 'action_taken'].map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => handleUpdateStatus(selectedReport._id, status)}
                                        className={`flex-1 min-w-[120px] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedReport.status === status ? 'bg-slate-900 text-white ring-2 ring-primary-500 ring-offset-2' : 'bg-slate-50 text-slate-600 hover:bg-slate-200'
                                            }`}
                                    >
                                        {status.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportManagement;
