import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminBookingService } from '../../services/apiService';
import {
  Calendar,
  Clock,
  User,
  AlertCircle,
  Search,
  ChevronRight,
  MapPin,
  ShieldCheck,
  X,
  Activity,
  TrendingUp,
  CheckCircle,
  Briefcase,
  Filter
} from 'lucide-react';

const statusNextMap = {
  'pending': 'confirmed',
  'confirmed': 'in_progress',
  'in_progress': 'completed'
};

const BookingsManagement = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(userData);
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      if (userData.role === 'super_admin' || userData.role === 'admin' || userData.role === 'staff') {
        const response = await adminBookingService.getAllBookings();
        setBookings(response.data.bookings || []);
      } else {
        toast.error('Access denied');
      }
    } catch (error) {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId, status) => {
    if (user?.role === 'super_admin') {
      toast.error('Super admins can only view bookings');
      return;
    }
    try {
      await adminBookingService.updateBookingStatus(bookingId, status);
      toast.success(`Booking ${status}`);
      fetchBookings();
      if (selectedBooking && selectedBooking._id === bookingId) {
        setSelectedBooking(prev => ({ ...prev, status }));
      }
    } catch (error) {
      toast.error('Failed to update booking status');
    }
  };

  const confirmBookingPayment = async (bookingId) => {
    if (user?.role === 'super_admin') {
      toast.error('Super admins can only view bookings');
      return;
    }
    try {
      await adminBookingService.confirmPayment(bookingId);
      toast.success('Payment confirmed and revenue recorded');
      fetchBookings();
      if (selectedBooking && selectedBooking._id === bookingId) {
        setSelectedBooking(prev => ({ ...prev, isRevenueRecorded: true, paymentStatus: 'paid' }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to confirm payment');
    }
  };

  const analytics = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter(b => b.status === 'pending').length;
    const live = bookings.filter(b => b.status === 'confirmed' || b.status === 'in_progress').length;
    const completed = bookings.filter(b => b.status === 'completed').length;
    const revenue = bookings.reduce((acc, b) => acc + (b.totalPrice || 0), 0);
    return { total, pending, live, completed, revenue };
  }, [bookings]);

  const filteredBookings = bookings.filter(booking => {
    const matchesStatus = filterStatus === 'all' || booking.status === filterStatus;
    const matchesSearch = searchTerm === '' ||
      booking.customer?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.customer?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.service?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusStyle = (status) => {
    switch (status) {
      case 'pending': return 'bg-amber-500 text-white border-amber-400Shadow-amber-200';
      case 'confirmed': return 'bg-primary-600 text-white border-primary-500';
      case 'in_progress': return 'bg-blue-500 text-white border-blue-400';
      case 'completed': return 'bg-emerald-500 text-white border-emerald-400';
      case 'cancelled': return 'bg-rose-500 text-white border-rose-400';
      default: return 'bg-slate-400 text-white border-slate-300';
    }
  };

  const getPhaseIndex = (status) => {
    const phases = ['pending', 'confirmed', 'in_progress', 'completed'];
    return phases.indexOf(status);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-slate-50/50">
        <div className="w-16 h-16 border-4 border-slate-100 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Loading Bookings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/30 p-4 lg:p-8 space-y-10 pb-32">
      {/* Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[-10%] right-[10%] w-[45%] h-[45%] bg-primary-600/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] left-[10%] w-[35%] h-[35%] bg-indigo-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-1.5 bg-slate-900 text-white rounded-lg shadow-sm">
              <Calendar className="h-4 w-4" />
            </div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em]">ADMIN : BOOKINGS</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">
            Service <span className="text-primary-600">Protocols</span>
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              Live Monitoring
            </p>
          </div>
        </div>
        <Link
          to="/admin/services"
          className="group px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all flex items-center gap-3"
        >
          <Briefcase className="h-4 w-4" /> Manage Services
        </Link>
      </header>

      {/* Analytics Mini-Dashboard */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: analytics.total, color: 'slate' },
          { label: 'Pending', value: analytics.pending, color: 'amber' },
          { label: 'Active', value: analytics.live, color: 'blue' },
          { label: 'Done', value: analytics.completed, color: 'emerald' },
          { label: 'Revenue', value: `₱${analytics.revenue.toLocaleString()}`, color: 'rose' }
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm hover:shadow-md transition-all">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-lg font-black text-slate-900 leading-none tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Protocol HUD Filter - High Contrast & Always Visible */}
      <div className="relative z-10 bg-slate-900 p-2 rounded-xl shadow-xl border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-6 relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center">
              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder=""
              className="w-full pl-12 pr-4 py-3 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="md:col-span-4 relative">
             <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <Activity className="h-4 w-4 text-primary-500" />
             </div>
             <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-xl pl-12 pr-10 py-3 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
             >
                <option value="all" className="bg-slate-900 text-white font-black">ALL STATUSES</option>
                <option value="pending" className="bg-slate-900 text-white font-black">PENDING</option>
                <option value="confirmed" className="bg-slate-900 text-white font-black">CONFIRMED</option>
                <option value="in_progress" className="bg-slate-900 text-white font-black">IN PROGRESS</option>
                <option value="completed" className="bg-slate-900 text-white font-black">COMPLETED</option>
                <option value="cancelled" className="bg-slate-900 text-white font-black text-rose-400">CANCELLED</option>
             </select>
          </div>
        </div>
      </div>

      {/* Bookings List - Table View */}
      <div className="relative z-10 bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
        <div className="overflow-x-auto">
          {filteredBookings.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Client Profile</th>
                  <th className="px-6 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Service Item</th>
                  <th className="px-6 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Schedule</th>
                  <th className="px-6 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Value</th>
                  <th className="px-6 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Lifecycle</th>
                  <th className="px-6 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBookings.map((booking) => (
                  <tr
                    key={booking._id}
                    onClick={() => setSelectedBooking(booking)}
                    className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary-600 group-hover:text-white transition-all">
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-slate-900 uppercase truncate max-w-[120px]">{booking.customer?.firstName} {booking.customer?.lastName}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">ID: {booking._id.slice(-8).toUpperCase()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-[11px] font-black text-slate-800 uppercase leading-none mb-1">{booking.service?.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{booking.service?.duration} Min</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-[11px] font-black text-slate-900 uppercase mb-1">
                        {new Date(booking.bookingDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-[9px] font-bold text-primary-600 uppercase tracking-widest flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {booking.startTime || new Date(booking.bookingDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-[12px] font-black text-slate-900 tracking-tighter leading-none">₱{booking.totalPrice?.toLocaleString()}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase italic">NET</p>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.2em] border-2 ${getStatusStyle(booking.status)}`}>
                        {booking.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="p-2.5 bg-slate-50 text-slate-400 rounded-lg group-hover:bg-slate-900 group-hover:text-white transition-all inline-block">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-20 text-center">
              <AlertCircle className="h-10 w-10 text-slate-200 mx-auto mb-4" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No active protocols detected</p>
            </div>
          )}
        </div>
      </div>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-500 border border-slate-200 flex flex-col max-h-[90vh]">
            <header className="shrink-0 bg-slate-900 p-6 sm:p-8 text-white flex justify-between items-start relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-10 blur-3xl pointer-events-none">
                <ShieldCheck className="w-64 h-64 text-primary-500" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="px-3 py-1 bg-primary-600 rounded-xl flex items-center gap-2 shadow-lg shadow-primary-900/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    <span className="text-[8px] font-black uppercase tracking-[0.3em]">Booking Details</span>
                  </div>
                </div>
                <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter leading-none mb-3">#{selectedBooking._id.slice(-12).toUpperCase()}</h3>
                <div className="flex items-center gap-4 text-slate-400">
                  <Activity className="h-4 w-4 text-emerald-500" />
                <p className="text-[9px] font-black uppercase tracking-[0.2em]">Status Tracking Active</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="relative z-10 w-10 h-10 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl flex items-center justify-center transition-all active:scale-95 duration-300 group"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </header>

            <div className="flex-1 p-6 sm:p-8 space-y-8 overflow-y-auto no-scrollbar scroll-smooth">
              {/* Status Tracker */}
              <div className="relative pt-4 pb-12">
                <div className="absolute left-[5%] right-[5%] top-1/2 -translate-y-1/2 h-1 bg-slate-100 rounded-full" />
                <div
                  className="absolute left-[5%] top-1/2 -translate-y-1/2 h-1 bg-primary-600 rounded-full transition-all duration-1000 ease-in-out shadow-[0_0_20px_rgba(37,99,235,0.5)]"
                  style={{ width: `${Math.max(0, (getPhaseIndex(selectedBooking.status) / 3) * 90)}%` }}
                />

                <div className="relative z-10 flex justify-between">
                  {['pending', 'confirmed', 'in_progress', 'completed'].map((phase, idx) => {
                    const currentIdx = getPhaseIndex(selectedBooking.status);
                    const isPassed = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    return (
                      <div key={phase} className="flex flex-col items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl border-2 transition-all duration-500 flex items-center justify-center ${isPassed ? 'bg-primary-600 border-white ring-4 ring-primary-50 shadow-md' :
                          isCurrent ? 'bg-primary-600 border-white ring-4 ring-primary-50 shadow-md' :
                            'bg-white border-slate-100'
                          }`}>
                          {(isPassed || isCurrent) && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                        </div>
                        <span className={`text-[8px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded ${isCurrent ? 'bg-slate-900 text-white' : isPassed ? 'text-primary-600 bg-primary-50' : 'text-slate-300'}`}>
                          {phase.replace('_', ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Customer & Service Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div className="flex items-start gap-6">
                    <div className="w-16 h-16 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-slate-300">
                      <User className="h-8 w-8" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1.5">Customer Info</label>
                      <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none mb-2">{selectedBooking.customer?.firstName} {selectedBooking.customer?.lastName}</h4>
                      <p className="text-[10px] font-bold text-primary-600 tracking-tight mb-1.5">{selectedBooking.customer?.email}</p>
                      <div className="px-3 py-1 bg-slate-50 rounded-lg border border-slate-100 text-[10px] font-bold text-slate-600 w-fit">
                        {selectedBooking.customer?.phone || 'No phone provided'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100 hover:border-primary-200 transition-all group">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] block mb-3 group-hover:text-primary-600 transition-colors">Service</label>
                    <p className="text-[13px] font-black text-slate-900 uppercase leading-none mb-1.5">{selectedBooking.service?.name}</p>
                    <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md border border-primary-100">{selectedBooking.service?.duration} Min</span>
                  </div>
                  <div className="p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100 hover:border-emerald-200 transition-all group">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] block mb-3 group-hover:text-emerald-600 transition-colors">Venue</label>
                    <p className="text-[13px] font-black text-slate-900 uppercase leading-none mb-1.5">
                      {selectedBooking.isHomeService ? 'HOME SERVICE' : 'IN-STORE'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> {selectedBooking.address?.city || 'In-Store'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div className="bg-slate-900 p-6 rounded-[2rem] text-white flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary-600/5 rounded-full -translate-y-24 translate-x-24 blur-3xl" />

                <div className="flex items-center gap-5 relative z-10">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 group-hover:bg-primary-600 transition-all duration-500">
                    <Calendar className="h-6 w-6 text-primary-400 group-hover:text-white" />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-primary-500 uppercase tracking-[0.3em] block mb-1.5">Booking Date</label>
                    <p className="text-xl font-black uppercase tracking-tight">{new Date(selectedBooking.bookingDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>
                <div className="text-right relative z-10">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] block mb-1.5">Start Time</label>
                  <p className="text-3xl font-black tracking-tighter text-primary-500">{selectedBooking.startTime || new Date(selectedBooking.bookingDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch pt-2">
                <div className="lg:col-span-12">
                  <div className={`${selectedBooking.isRevenueRecorded ? 'bg-primary-600 shadow-primary-100' : 'bg-slate-800 shadow-slate-200'} rounded-[2rem] p-6 text-white shadow-xl flex items-center justify-between group overflow-hidden relative`}>
                    <div className="absolute top-[-50%] right-[-10%] w-48 h-48 bg-white/10 rounded-full blur-2xl" />
                    <div className="relative z-10">
                      <label className="text-[8px] font-black text-primary-100 uppercase tracking-[0.3em] block mb-1 opacity-70">Booking Price (NET)</label>
                      <span className="text-3xl font-black tracking-tighter">₱{selectedBooking.totalPrice?.toLocaleString()}</span>
                    </div>
                    <div className={`relative z-10 ${selectedBooking.isRevenueRecorded ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'} px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/20`}>
                      {selectedBooking.isRevenueRecorded ? 'PAID & RECORDED' : 'AWAITING PAYMENT'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Protocol Verification Checklist - Added for staff verification */}
              {selectedBooking.service?.requirements && (
                <div className="p-10 bg-amber-50 rounded-[3rem] border border-amber-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 rounded-bl-[4rem] flex items-center justify-center">
                    <ShieldCheck className="w-12 h-12 text-amber-500 opacity-30 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="p-3 bg-amber-600 text-white rounded-xl shadow-xl shadow-amber-900/20">
                        <Activity className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-[12px] font-black uppercase tracking-[0.4em] text-amber-900 leading-none mb-1">Protocol Verification</h4>
                        <p className="text-[9px] font-bold text-amber-700 uppercase tracking-widest">Verify requirements before proceeding</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedBooking.service.requirements.split(',').map((req, i) => (
                        <div key={i} className="flex items-center gap-4 bg-white/60 p-4 rounded-xl border border-amber-200/50 hover:bg-white transition-all">
                          <div className="w-6 h-6 rounded-lg border-2 border-amber-400 flex items-center justify-center cursor-pointer hover:bg-amber-100 transition-colors">
                            {/* Visual only checkbox for staff to 'mentally' check or we could add state if needed, but the prompt just says 'present for verification' */}
                          </div>
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight">{req.trim()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-8 pt-6 border-t border-amber-200/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-900">Mandatory Verification</span>
                      </div>
                      <span className="px-5 py-2 bg-amber-100 text-amber-600 rounded-xl text-[9px] font-black uppercase tracking-widest">Awaiting Staff Check</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <footer className="shrink-0 p-6 sm:p-8 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-4 relative z-10">
              {(user?.role === 'admin' || user?.role === 'staff') && !selectedBooking.isRevenueRecorded && selectedBooking.status !== 'cancelled' && (
                <button
                  onClick={() => confirmBookingPayment(selectedBooking._id)}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-[0.98] shadow-lg shadow-emerald-900/10 flex items-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4" /> Confirm Payment
                </button>
              )}
              {(user?.role === 'admin' || user?.role === 'staff') && selectedBooking.status !== 'completed' && selectedBooking.status !== 'cancelled' && (
                <button
                  onClick={() => {
                    updateBookingStatus(selectedBooking._id, statusNextMap[selectedBooking.status]);
                  }}
                  className="flex-1 min-w-[200px] px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:bg-primary-600 transition-all active:scale-[0.98] group flex items-center justify-center gap-3"
                >
                  <TrendingUp className="h-4 w-4 opacity-50 text-emerald-400" />
                  Update Status to {statusNextMap[selectedBooking.status].replace('_', ' ')}
                </button>
              )}
              {(user?.role === 'admin' || user?.role === 'staff') && (selectedBooking.status === 'pending' || selectedBooking.status === 'confirmed') && (
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to cancel this booking?')) {
                      updateBookingStatus(selectedBooking._id, 'cancelled');
                    }
                  }}
                  className="px-6 py-3 bg-white border border-rose-200 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all active:scale-[0.98]"
                >
                  Cancel Booking
                </button>
              )}
              <button
                onClick={() => setSelectedBooking(null)}
                className="flex-1 px-6 py-3 bg-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all active:scale-[0.98]"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingsManagement;
