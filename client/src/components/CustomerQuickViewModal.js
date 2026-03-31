import React, { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import { customerService } from '../services/apiService';
import { User, Phone, Mail, MapPin, ShoppingCart, Calendar, Star, Package, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';

const CustomerQuickViewModal = ({ isOpen, onClose, customerId }) => {
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && customerId) {
            fetchCustomerDetails();
        }
    }, [isOpen, customerId]);

    const fetchCustomerDetails = async () => {
        setLoading(true);
        try {
            const response = await customerService.getCustomerDetails(customerId);
            setCustomer(response.data.customer);
        } catch (error) {
            toast.error('Failed to load customer details');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        if (['completed', 'delivered'].includes(status)) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
        if (['pending'].includes(status)) return 'text-amber-600 bg-amber-50 border-amber-200';
        if (['cancelled', 'failed', 'refused'].includes(status)) return 'text-rose-600 bg-rose-50 border-rose-200';
        return 'text-blue-600 bg-blue-50 border-blue-200';
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Customer Intelligence" size="lg">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-10 h-10 border-2 border-slate-100 border-t-primary-600 rounded-full animate-spin" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Scanning Database...</p>
                </div>
            ) : customer && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Compact Header */}
                    <div className="flex flex-col md:flex-row gap-6 md:items-center pb-6 border-b border-slate-100">
                        <div className="w-20 h-20 rounded-[2rem] bg-primary-600 flex items-center justify-center text-white text-3xl font-black uppercase shadow-xl shadow-primary-100 shrink-0">
                            {customer.avatar ? (
                                <img src={customer.avatar} alt="" className="w-full h-full object-cover rounded-[2rem]" />
                            ) : customer.firstName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{customer.firstName} {customer.lastName}</h2>
                                {customer.totalInteractions >= 5 && (
                                    <div className="px-2 py-0.5 bg-amber-50 text-amber-500 border border-amber-100 rounded-lg text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                        <Star className="h-2.5 w-2.5 fill-amber-500" /> V.I.P
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <div className="flex items-center gap-2 text-slate-400">
                                    <Mail className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">{customer.email}</span>
                                </div>
                                {customer.phone && (
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Phone className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-tight">{customer.phone}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:text-right shrink-0">
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Lifetime Value</p>
                                <p className="text-sm font-black text-slate-900 leading-none">₱{customer.totalSpent.toLocaleString()}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Interactions</p>
                                <p className="text-sm font-black text-slate-900 leading-none">{customer.totalInteractions}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                        {/* Sidebar Info */}
                        <div className="md:col-span-4 space-y-6">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-primary-500" /> Delivery Address
                                </h4>
                                {customer.shippingAddress ? (
                                    <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 text-[11px] font-medium text-slate-600 leading-relaxed group hover:border-primary-200 transition-all">
                                        <p className="font-bold text-slate-900 mb-1">{customer.shippingAddress.street}</p>
                                        <p>{customer.shippingAddress.barangay}, {customer.shippingAddress.city}</p>
                                        <p>{customer.shippingAddress.province}, {customer.shippingAddress.zipCode}</p>
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${customer.shippingAddress.street}, ${customer.shippingAddress.city}`)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-3 flex items-center gap-2 text-primary-600 font-black uppercase text-[9px] tracking-widest hover:underline"
                                        >
                                            <ExternalLink className="h-3 w-3" /> Navigation Link
                                        </a>
                                    </div>
                                ) : (
                                    <p className="text-[10px] font-bold text-slate-400 italic bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-200">No primary delivery address recorded in account profile.</p>
                                )}
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-primary-500" /> Account Stats
                                </h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Member Since</span>
                                        <span className="text-[10px] font-black text-slate-700 uppercase">{new Date(customer.joinedAt).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Orders</span>
                                        <span className="text-[10px] font-black text-slate-700 uppercase">{customer.totalOrders}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Bookings</span>
                                        <span className="text-[10px] font-black text-slate-700 uppercase">{customer.totalBookings}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent History */}
                        <div className="md:col-span-8 space-y-8">
                            {/* Orders */}
                            {customer.recentOrders.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <ShoppingCart className="h-4 w-4 text-primary-500" /> Recent Acquisitions
                                        </h4>
                                        <Link to="/admin/orders" className="text-[8px] font-black text-primary-600 uppercase tracking-widest hover:underline">View Ledger</Link>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {customer.recentOrders.map(order => (
                                            <div key={order._id} className="p-3 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest font-mono">#{order.orderNumber.slice(-8)}</span>
                                                    <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-md border tracking-widest ${getStatusColor(order.status)}`}>
                                                        {order.status}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(order.createdAt).toLocaleDateString()}</p>
                                                        {order.items && <p className="text-[10px] font-black text-slate-800 uppercase truncate max-w-[120px] mt-0.5">{order.items[0]?.name}</p>}
                                                    </div>
                                                    <p className="text-[11px] font-black text-slate-900 leading-none">₱{order.totalAmount.toLocaleString()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Bookings */}
                            {customer.recentBookings.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-emerald-500" /> Active Appointments
                                        </h4>
                                        <Link to="/admin/bookings" className="text-[8px] font-black text-primary-600 uppercase tracking-widest hover:underline">View Schedule</Link>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {customer.recentBookings.map(booking => (
                                            <div key={booking._id} className="p-3 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[10px] font-black text-slate-800 uppercase truncate pr-2 leading-none">{booking.service}</span>
                                                    <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-md border tracking-widest ${getStatusColor(booking.status)}`}>
                                                        {booking.status}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(booking.bookingDate).toLocaleDateString()} at {booking.startTime}</p>
                                                        <p className="text-[10px] font-black text-slate-800 uppercase mt-0.5">Pet: {booking.pet?.name}</p>
                                                    </div>
                                                    <p className="text-[11px] font-black text-slate-900 leading-none">₱{booking.totalPrice?.toLocaleString()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default CustomerQuickViewModal;
