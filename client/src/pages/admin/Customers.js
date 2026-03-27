import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { customerService } from '../../services/apiService';
import { Link } from 'react-router-dom';
import {
    Users, Search, Clock, ShoppingCart, Calendar as CalendarIcon,
    ChevronDown, X, Star, Package, CheckCircle, ExternalLink, Activity
} from 'lucide-react';

const Customers = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const res = await customerService.getStoreCustomers();
            setCustomers(res.data.customers);
        } catch {
            toast.error('Failed to load customers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchCustomers(); }, []);

    const filtered = customers.filter(c => {
        const search = searchQuery.toLowerCase();
        return (
            c.firstName.toLowerCase().includes(search) ||
            c.lastName.toLowerCase().includes(search) ||
            c.email.toLowerCase().includes(search) ||
            (c.phone && c.phone.toLowerCase().includes(search))
        );
    });

    const getStatusColor = (status) => {
        if (['completed', 'delivered'].includes(status)) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
        if (['pending'].includes(status)) return 'text-amber-600 bg-amber-50 border-amber-200';
        if (['cancelled', 'failed', 'refused'].includes(status)) return 'text-rose-600 bg-rose-50 border-rose-200';
        return 'text-blue-600 bg-blue-50 border-blue-200';
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                            Customer <span className="text-primary-600 italic">Database</span>
                        </h1>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">
                            Manage your store's clients and view their purchase history
                        </p>
                    </div>
                    <div className="px-5 py-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                        <Users className="h-5 w-5 text-primary-500" />
                        <div className="text-right">
                            <p className="text-2xl font-black text-slate-900 leading-none">{customers.length}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Total Customers</p>
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="input-container">
                    <Search className="input-icon h-5 w-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search customers by name, email, or phone number..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input input-with-icon bg-white border-slate-200 rounded-2xl pr-12 text-sm text-slate-700 focus:outline-none focus:border-primary-400 shadow-sm placeholder:text-slate-300"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Customer List */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
                        <Users className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                        <p className="font-black text-slate-900 uppercase tracking-tighter text-lg">No Customers Found</p>
                        <p className="text-slate-400 font-bold text-sm mt-1">
                            {searchQuery ? 'Try adjusting your search terms.' : 'Customers will appear here once they place an order or make a booking.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(customer => {
                            const isExpanded = expandedId === customer._id;
                            return (
                                <div key={customer._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300">

                                    {/* Customer Row Header */}
                                    <button
                                        onClick={() => setExpandedId(isExpanded ? null : customer._id)}
                                        className="w-full flex items-center p-5 gap-4 hover:bg-slate-50 transition-colors text-left"
                                    >
                                        <div className="w-12 h-12 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center shrink-0 border border-primary-200 shadow-sm">
                                            {customer.avatar ? (
                                                <img src={customer.avatar} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="font-black text-primary-700 text-lg uppercase">{customer.firstName[0]}</span>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-black text-slate-900 text-base truncate">{customer.firstName} {customer.lastName}</p>
                                                {customer.totalInteractions >= 5 && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" title="Frequent Customer" />}
                                            </div>
                                            <p className="text-slate-500 text-xs font-medium truncate">{customer.email} {customer.phone && `· ${customer.phone}`}</p>
                                        </div>

                                        <div className="hidden sm:flex items-center gap-6 shrink-0 text-right pr-4 border-r border-slate-100">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Spent</p>
                                                <p className="font-black text-slate-900 text-sm">₱{customer.totalSpent.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Interactions</p>
                                                <p className="font-black text-slate-900 text-sm">{customer.totalInteractions} total</p>
                                            </div>
                                        </div>

                                        <div className="hidden md:block text-right shrink-0 min-w-[120px]">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Last Active</p>
                                            <p className="font-bold text-slate-700 text-xs">{new Date(customer.lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                        </div>

                                        <ChevronDown className={`h-5 w-5 text-slate-400 shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* Expanded View */}
                                    {isExpanded && (
                                        <div className="bg-slate-50/50 border-t border-slate-100 p-6 flex flex-col lg:flex-row gap-6">

                                            {/* Left Sidebar Info */}
                                            <div className="w-full lg:w-64 shrink-0 space-y-4">
                                                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                                        <Activity className="h-3 w-3" /> Customer Summary
                                                    </h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-500">Joined Platform</span>
                                                            <span className="font-bold text-slate-900">{new Date(customer.joinedAt).getFullYear()}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-500">Product Orders</span>
                                                            <span className="font-bold text-slate-900">{customer.totalOrders} (₱{customer.totalSpentOrders.toLocaleString()})</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-500">Service Bookings</span>
                                                            <span className="font-bold text-slate-900">{customer.totalBookings} (₱{customer.totalSpentBookings.toLocaleString()})</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right History Area */}
                                            <div className="flex-1 space-y-6">

                                                {/* Recent Orders */}
                                                {customer.recentOrders.length > 0 && (
                                                    <div>
                                                        <h4 className="font-black text-slate-800 text-sm uppercase tracking-tighter mb-3 flex items-center justify-between">
                                                            <span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-slate-400" /> Recent Orders</span>
                                                            <Link to={`/admin/orders?search=${customer.email}`} className="text-[10px] tracking-widest text-primary-600 hover:text-primary-700 underline underline-offset-2">View All</Link>
                                                        </h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {customer.recentOrders.map(order => (
                                                                <Link key={order._id} to={`/admin/orders/${order._id}`} className="block bg-white border border-slate-200 rounded-2xl p-3 hover:border-primary-300 hover:shadow-md transition-all group">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{order.orderNumber}</span>
                                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${getStatusColor(order.status)}`}>
                                                                            {order.status}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-end">
                                                                        <div>
                                                                            <p className="text-xs text-slate-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                                                                            {order.items && <p className="text-xs font-medium text-slate-700 mt-0.5 truncate max-w-[150px]">{order.items[0]?.name} {order.items.length > 1 && `+${order.items.length - 1} more`}</p>}
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-sm font-black text-slate-900">₱{order.totalAmount.toLocaleString()}</p>
                                                                            <p className={`text-[9px] font-bold uppercase ${order.paymentStatus === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>{order.paymentStatus}</p>
                                                                        </div>
                                                                    </div>
                                                                </Link>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Recent Bookings */}
                                                {customer.recentBookings.length > 0 && (
                                                    <div>
                                                        <h4 className="font-black text-slate-800 text-sm uppercase tracking-tighter mb-3 pt-3 border-t border-slate-200 flex items-center justify-between">
                                                            <span className="flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-slate-400" /> Recent Bookings</span>
                                                            <Link to={`/admin/bookings?search=${customer.email}`} className="text-[10px] tracking-widest text-primary-600 hover:text-primary-700 underline underline-offset-2">View All</Link>
                                                        </h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {customer.recentBookings.map(booking => (
                                                                <div key={booking._id} className="bg-white border border-slate-200 rounded-2xl p-3">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <span className="text-xs font-black text-slate-800 truncate pr-2">{booking.service}</span>
                                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border shrink-0 ${getStatusColor(booking.status)}`}>
                                                                            {booking.status}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-end">
                                                                        <div>
                                                                            <p className="text-xs text-slate-500">{new Date(booking.bookingDate).toLocaleDateString()} at {booking.startTime}</p>
                                                                            <p className="text-xs font-medium text-slate-700 mt-0.5">Pet: {booking.pet?.name} ({booking.pet?.breed})</p>
                                                                        </div>
                                                                        <p className="text-sm font-black text-slate-900">₱{booking.totalPrice?.toLocaleString()}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Customers;
