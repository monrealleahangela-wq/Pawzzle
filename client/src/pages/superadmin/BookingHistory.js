import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { bookingService } from '../../services/apiService';
import {
    Calendar,
    Clock,
    Search,
    Download,
    Eye,
    X,
    DollarSign,
    CheckCircle,
    XCircle,
    AlertCircle,
    Building,
    PawPrint,
    Target,
    Activity,
    Shield,
    ShieldCheck,
    Globe,
    ArrowRight,
    Briefcase
} from 'lucide-react';

const BookingHistory = () => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        search: ''
    });
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalBookings: 0,
        hasNext: false,
        hasPrev: false
    });
    const [selectedBooking, setSelectedBooking] = useState(null);

    const fetchBookings = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                page: pagination.currentPage,
                limit: 15
            };
            if (filters.status) params.status = filters.status;
            if (filters.search) params.search = filters.search;

            const response = await bookingService.getAllBookings(params);
            const data = response.data;
            setBookings(data.bookings || []);
            setPagination(prev => ({
                ...prev,
                totalPages: data.pagination?.pages || 1,
                totalBookings: data.pagination?.total || 0,
                hasNext: pagination.currentPage < (data.pagination?.pages || 1),
                hasPrev: pagination.currentPage > 1
            }));
        } catch (error) {
            toast.error('Failed to load bookings');
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.currentPage]);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    const handleFilterChange = (name, value) => {
        setFilters(prev => ({ ...prev, [name]: value }));
        setPagination(prev => ({ ...prev, currentPage: 1 }));
    };

    const handlePageChange = (page) => {
        setPagination(prev => ({ ...prev, currentPage: page }));
    };

    const exportBookings = () => {
        const csvContent = [
            ['Booking ID', 'Customer', 'Email', 'Store', 'Service', 'Date', 'Time', 'Price', 'Status', 'Payment Status'].join(','),
            ...bookings.map(b => [
                b._id?.slice(-8),
                `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.trim(),
                b.customer?.email || '',
                b.store?.name || '',
                b.service?.name || '',
                b.bookingDate ? new Date(b.bookingDate).toLocaleDateString() : '',
                `${b.startTime || ''} - ${b.endTime || ''}`,
                b.totalPrice || 0,
                b.status || '',
                b.paymentStatus || ''
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `booking-history-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Bookings exported');
    };

    const getStatusProps = (status) => {
        const props = {
            pending: { color: 'amber', label: 'PENDING', icon: AlertCircle },
            confirmed: { color: 'primary', label: 'CONFIRMED', icon: CheckCircle },
            in_progress: { color: 'indigo', label: 'IN PROGRESS', icon: Activity },
            completed: { color: 'emerald', label: 'COMPLETED', icon: Shield },
            cancelled: { color: 'rose', label: 'CANCELLED', icon: XCircle },
            no_show: { color: 'slate', label: 'NO SHOW', icon: XCircle }
        };
        return props[status] || { color: 'slate', label: 'UNKNOWN', icon: AlertCircle };
    };

    if (loading && bookings.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2"></div>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Bookings...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Premium Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-slate-100 pb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="h-3 w-3 text-primary-600" />
                        <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">SUPER ADMIN PANEL</span>
                    </div>
                    <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                        Booking <br /> <span className="text-primary-600 italic">History</span>
                    </h1>
                    <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">View all pet service and medical bookings</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={exportBookings}
                        className="flex-1 sm:flex-none px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
                    >
                        <Download className="h-4 w-4" /> Export Bookings CSV
                    </button>
                </div>
            </div>

            {/* Booking Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total Bookings', value: pagination.totalBookings, icon: Calendar, color: 'primary' },
                    { label: 'Active Bookings', value: bookings.filter(b => b.status === 'confirmed').length, icon: Activity, color: 'emerald' },
                    { label: 'Platform Revenue', value: `₱${bookings.reduce((a, b) => a + (b.totalPrice || 0), 0).toLocaleString()}`, icon: DollarSign, color: 'amber' },
                    { label: 'System Status', value: 'Normal', icon: Shield, color: 'indigo' }
                ].map((s, i) => (
                    <div key={i} className="bg-white border border-slate-100 p-5 rounded-[2rem] shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                            <div className={`p-2 rounded-xl bg-${s.color}-50 text-${s.color}-600`}>
                                <s.icon className="h-4 w-4" />
                            </div>
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{s.label}</p>
                        <p className="text-xl font-black text-slate-900 tracking-tighter">{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className="bg-slate-900 p-2 rounded-[2.5rem] shadow-xl">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-8 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-primary-500" />
                        <input
                            type="text" placeholder="SEARCH BY NAME, EMAIL OR BOOKING ID..."
                            value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="w-full !pl-20 pr-4 py-4 bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-3xl outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-slate-600"
                        />
                    </div>
                    <div className="md:col-span-4">
                        <select
                            value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-3xl px-6 outline-none focus:ring-1 focus:ring-primary-500 appearance-none"
                        >
                            <option value="">ALL STATUSES</option>
                            <option value="pending">PENDING</option>
                            <option value="confirmed">CONFIRMED</option>
                            <option value="completed">COMPLETED</option>
                            <option value="cancelled">CANCELLED</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Bookings List */}
            <div className="bg-white border border-slate-100 rounded-[3rem] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Customer</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Store</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Service</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Time</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Status</th>
                                <th className="px-8 py-5 text-right text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {bookings.map((b) => {
                                const s = getStatusProps(b.status);
                                return (
                                    <tr key={b._id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="text-[11px] font-black text-slate-900 uppercase leading-none mb-1">
                                                {b.customer?.firstName} {b.customer?.lastName}
                                            </div>
                                            <div className="text-[9px] font-bold text-slate-400 lowercase italic opacity-60 tracking-tight">{b.customer?.email}</div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1 w-fit border border-slate-200">
                                                <Building className="h-2.5 w-2.5 text-slate-400" />
                                                <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{b.store?.name || 'UNKNOWN STORE'}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{b.service?.name}</div>
                                            <div className="flex items-center gap-1.5">
                                                <PawPrint className="h-2.5 w-2.5 text-primary-500" />
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{b.pet?.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{new Date(b.bookingDate).toLocaleDateString()}</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{b.startTime} - {b.endTime}</div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border border-${s.color}-100 bg-${s.color}-50 text-${s.color}-600`}>
                                                {s.label}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button
                                                onClick={() => setSelectedBooking(b)}
                                                className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all group-hover:scale-110 active:scale-90"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 bg-white border border-slate-100 p-4 rounded-[2rem] w-fit mx-auto shadow-sm">
                    <button
                        disabled={!pagination.hasPrev} onClick={() => handlePageChange(pagination.currentPage - 1)}
                        className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
                    >
                        Prev
                    </button>
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest whitespace-nowrap">
                        Page: <span className="text-primary-600 italic px-1">{pagination.currentPage}</span> / {pagination.totalPages}
                    </span>
                    <button
                        disabled={!pagination.hasNext} onClick={() => handlePageChange(pagination.currentPage + 1)}
                        className="p-3 bg-slate-900 text-white rounded-xl hover:bg-primary-600 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Booking Details Modal */}
            {selectedBooking && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in">
                    <div className="bg-white rounded-[3rem] max-w-5xl w-full shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white relative z-10">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <Target className="h-3 w-3 text-primary-600" />
                                    <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">Booking Details</span>
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                                    Booking <span className="text-primary-600 italic">#{selectedBooking._id.slice(-8).toUpperCase()}</span>
                                </h2>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Platform record details</p>
                            </div>
                            <button
                                onClick={() => setSelectedBooking(null)}
                                className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 space-y-10 no-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                {/* Booking Summary */}
                                <div className="space-y-8">
                                    <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl">
                                        <Calendar className="absolute -bottom-10 -right-10 w-48 h-48 opacity-10 animate-pulse" />
                                        <div className="relative z-10 space-y-6">
                                            <div className="flex justify-between items-start">
                                                <label className="text-[10px] font-black text-primary-500 uppercase tracking-[0.5em] block">Status</label>
                                                <span className={`px-3 py-1 bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-${getStatusProps(selectedBooking.status).color}-400`}>
                                                    {getStatusProps(selectedBooking.status).label}
                                                </span>
                                            </div>
                                            <p className="text-4xl font-black tracking-tighter uppercase">{selectedBooking.service?.name}</p>
                                            <div className="flex gap-4">
                                                <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                                                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Booking Date</p>
                                                    <p className="text-sm font-black text-primary-400 uppercase">{new Date(selectedBooking.bookingDate).toLocaleDateString()}</p>
                                                </div>
                                                <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                                                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Status</p>
                                                    <p className="text-sm font-black text-emerald-400 uppercase">SECURE</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100">
                                        <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                                            Customer Profile
                                        </h3>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Customer Name</p>
                                                <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-none">{selectedBooking.customer?.firstName} {selectedBooking.customer?.lastName}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email Address</p>
                                                <p className="text-[12px] font-black text-slate-900 lowercase italic opacity-80">{selectedBooking.customer?.email}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
                                        <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                                            <PawPrint className="h-4 w-4 text-primary-600" /> Pet Information
                                        </h3>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Pet Name</p>
                                                <p className="text-[14px] font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedBooking.pet?.name}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Pet Details</p>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{selectedBooking.pet?.type} • {selectedBooking.pet?.breed}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Booking Information */}
                                <div className="space-y-8">
                                    <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
                                        <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                                            <Briefcase className="h-4 w-4 text-primary-600" /> Booking Context
                                        </h3>
                                        <div className="space-y-8">
                                            <div className="flex justify-between items-center border-b border-slate-50 pb-6">
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Store</p>
                                                    <p className="text-[14px] font-black text-slate-900 uppercase tracking-tight">{selectedBooking.store?.name}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Total Amount</p>
                                                    <p className="text-[14px] font-black text-primary-600">₱{selectedBooking.totalPrice?.toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center border-b border-slate-50 pb-6">
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Schedule</p>
                                                    <p className="text-[12px] font-black text-slate-900 uppercase tracking-widest">{selectedBooking.startTime} » {selectedBooking.endTime}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Payment Status</p>
                                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest border border-emerald-100 bg-emerald-50 px-2 py-0.5 rounded-lg">{selectedBooking.paymentStatus || 'PAID'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedBooking.isHomeService && selectedBooking.serviceAddress && (
                                        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
                                            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                                                <Globe className="h-4 w-4 text-primary-600" /> Service Location
                                            </h3>
                                            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                                <p className="text-[11px] font-medium text-slate-600 leading-relaxed uppercase tracking-tight">
                                                    {selectedBooking.serviceAddress.street}, {selectedBooking.serviceAddress.barangay}, <br />
                                                    {selectedBooking.serviceAddress.city}, {selectedBooking.serviceAddress.province}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Customer Requirements Section - Added to match customer view */}
                                    <div className="bg-primary-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl">
                                        <ShieldCheck className="absolute -bottom-10 -right-10 w-48 h-48 opacity-10 animate-pulse" />
                                        <div className="relative z-10 space-y-6">
                                            <div className="flex items-center gap-3">
                                                <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
                                                    <AlertCircle className="h-6 w-6 text-primary-400" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-black uppercase tracking-tighter">Customer Requirements</h3>
                                                    <p className="text-[10px] font-black text-primary-400 uppercase tracking-widest leading-none">Requirements specified for this service</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-3">
                                                {selectedBooking.service?.requirements ? (
                                                    selectedBooking.service.requirements.split(',').map((req, index) => (
                                                        <div key={index} className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl group hover:bg-white/10 transition-all">
                                                            <div className="h-5 w-5 rounded-full border-2 border-primary-500/50 flex items-center justify-center bg-primary-500/10">
                                                                <CheckCircle className="h-3 w-3 text-primary-500" />
                                                            </div>
                                                            <span className="text-[11px] font-black uppercase tracking-widest text-white/90">{req.trim()}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-center py-6 border-2 border-dashed border-white/10 rounded-3xl">
                                                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">No specific requirements set</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
                                                <Activity className="h-5 w-5 shrink-0" />
                                                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
                                                    The customer was instructed to present these documents for verification upon arrival.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {(selectedBooking.notes || selectedBooking.adminNotes) && (
                                        <div className="bg-amber-50/50 border border-amber-100 rounded-[2rem] p-8">
                                            <h3 className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <Target className="h-3 w-3" /> Special Notes
                                            </h3>
                                            <div className="space-y-4">
                                                {selectedBooking.notes && (
                                                    <div>
                                                        <p className="text-[8px] font-black text-amber-500/60 uppercase tracking-widest mb-1">Customer Notes</p>
                                                        <p className="text-[11px] font-medium text-amber-900 uppercase tracking-tight italic">"{selectedBooking.notes}"</p>
                                                    </div>
                                                )}
                                                {selectedBooking.adminNotes && (
                                                    <div>
                                                        <p className="text-[8px] font-black text-amber-500/60 uppercase tracking-widest mb-1">Staff Notes</p>
                                                        <p className="text-[11px] font-medium text-amber-900 uppercase tracking-tight italic">"{selectedBooking.adminNotes}"</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100 relative z-10 flex gap-4">
                            <button
                                onClick={() => setSelectedBooking(null)}
                                className="flex-1 py-4 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BookingHistory;
