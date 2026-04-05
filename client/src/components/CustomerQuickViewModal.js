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
         <Modal isOpen={isOpen} onClose={onClose} title="Customer Profile" size="md">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 font-outfit">
                    <div className="w-10 h-10 border-2 border-slate-100 border-t-primary-600 rounded-full animate-spin" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Retrieving Data...</p>
                </div>
            ) : customer && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 font-outfit p-2">
                    {/* Minimalist Profile Header */}
                    <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
                        <div className="w-24 h-24 rounded-[2.5rem] bg-slate-900 flex items-center justify-center text-white text-4xl font-black uppercase shadow-2xl shadow-slate-200 shrink-0 border-4 border-white">
                            {customer.avatar ? (
                                <img src={customer.avatar} alt="" className="w-full h-full object-cover rounded-[2.5rem]" />
                            ) : customer.firstName[0]}
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">{customer.firstName} {customer.lastName}</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Verified Customer Module</p>
                        </div>
                    </div>

                    {/* Essential Intel Grid */}
                    <div className="grid grid-cols-1 gap-6">
                        <div className="space-y-4">
                            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-2 border-l-4 border-primary-600 pl-3">
                                Communication Grid
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:border-primary-200 group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-white rounded-lg shadow-sm group-hover:bg-primary-50 transition-colors">
                                            <Mail className="h-4 w-4 text-slate-400 group-hover:text-primary-600" />
                                        </div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                                    </div>
                                    <p className="text-xs font-bold text-slate-700 tracking-tight ml-9">{customer.email}</p>
                                </div>

                                <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:border-primary-200 group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-white rounded-lg shadow-sm group-hover:bg-primary-50 transition-colors">
                                            <Phone className="h-4 w-4 text-slate-400 group-hover:text-primary-600" />
                                        </div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Secure Line</p>
                                    </div>
                                    <p className="text-xs font-bold text-slate-700 tracking-tight ml-9">{customer.phone || 'N/A'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-2 border-l-4 border-emerald-500 pl-3">
                                Deployment Zone
                            </h4>
                            <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 transition-all hover:bg-white hover:border-emerald-200 group">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-white rounded-lg shadow-sm group-hover:bg-emerald-50 transition-colors">
                                        <MapPin className="h-4 w-4 text-slate-400 group-hover:text-emerald-600" />
                                    </div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Physical Address</p>
                                </div>
                                {customer.shippingAddress ? (
                                    <div className="space-y-2 ml-9">
                                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{customer.shippingAddress.street}</p>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                            {customer.shippingAddress.barangay}, {customer.shippingAddress.city}, {customer.shippingAddress.province} {customer.shippingAddress.zipCode}
                                        </p>
                                        <div className="pt-4">
                                            <a 
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${customer.shippingAddress.street}, ${customer.shippingAddress.city}`)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 text-primary-600 font-black uppercase text-[10px] tracking-[0.2em] hover:text-slate-900 transition-colors"
                                            >
                                                Open Intel Maps <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs font-bold text-slate-400 italic ml-9">No deployment address configured.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default CustomerQuickViewModal;
