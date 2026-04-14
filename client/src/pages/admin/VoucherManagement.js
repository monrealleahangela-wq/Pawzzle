import React, { useState, useEffect, useCallback } from 'react';
import {
    Ticket,
    Plus,
    Search,
    Edit2,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Calendar,
    Tag,
    Clock,
    AlertCircle,
    CheckCircle2,
    X
} from 'lucide-react';

import { toast } from 'react-toastify';
import { adminVoucherService } from '../../services/apiService';

const PhilippinePeso = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M20 11H4" />
    <path d="M20 7H4" />
    <path d="M7 21V4a5 5 0 0 1 5 5c0 2.2-1.8 3-5 3Z" />
  </svg>
);

const VoucherManagement = () => {
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingVoucher, setEditingVoucher] = useState(null);
    const [search, setSearch] = useState('');
    const [formData, setFormData] = useState({
        code: '',
        discountType: 'percentage',
        discountValue: '',
        minPurchase: '',
        startDate: '',
        endDate: '',
        usageLimit: ''
    });

    const fetchVouchers = useCallback(async () => {
        try {
            setLoading(true);
            const response = await adminVoucherService.getAllVouchers({ search });
            setVouchers(response.data.vouchers);
        } catch (error) {
            toast.error('Failed to load vouchers');
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        fetchVouchers();
    }, [fetchVouchers]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingVoucher) {
                await adminVoucherService.updateVoucher(editingVoucher._id, formData);
                toast.success('Voucher updated successfully');
            } else {
                await adminVoucherService.createVoucher(formData);
                toast.success('Voucher created successfully');
            }
            setShowModal(false);
            setEditingVoucher(null);
            setFormData({
                code: '',
                discountType: 'percentage',
                discountValue: '',
                minPurchase: '',
                startDate: '',
                endDate: '',
                usageLimit: ''
            });
            fetchVouchers();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save voucher');
        }
    };

    const handleToggleStatus = async (id) => {
        try {
            await adminVoucherService.toggleVoucherStatus(id);
            fetchVouchers();
            toast.success('Voucher status updated');
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this voucher?')) {
            try {
                await adminVoucherService.deleteVoucher(id);
                toast.success('Voucher deleted');
                fetchVouchers();
            } catch (error) {
                toast.error('Failed to delete voucher');
            }
        }
    };

    const openEditModal = (voucher) => {
        setEditingVoucher(voucher);
        setFormData({
            code: voucher.code,
            discountType: voucher.discountType,
            discountValue: voucher.discountValue,
            minPurchase: voucher.minPurchase,
            startDate: new Date(voucher.startDate).toISOString().split('T')[0],
            endDate: new Date(voucher.endDate).toISOString().split('T')[0],
            usageLimit: voucher.usageLimit || ''
        });
        setShowModal(true);
    };

    return (
        <div className="space-y-6 pb-20 p-4 lg:p-8 bg-slate-50/30 min-h-screen">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-slate-100 pb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Ticket className="h-3 w-3 text-primary-600" />
                        <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMIN PANEL : MARKETING</span>
                    </div>
                    <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                        Voucher <span className="text-primary-600 italic">Management</span>
                    </h1>
                    <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Create and manage store discounts</p>
                </div>
                <button
                    onClick={() => {
                        setEditingVoucher(null);
                        setFormData({
                            code: '',
                            discountType: 'percentage',
                            discountValue: '',
                            minPurchase: '',
                            startDate: '',
                            endDate: '',
                            usageLimit: ''
                        });
                        setShowModal(true);
                    }}
                    className="px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all flex items-center gap-2 shadow-xl shadow-slate-200"
                >
                    <Plus className="h-4 w-4" /> Create Voucher
                </button>
            </div>

            <div className="bg-slate-900 p-2 rounded-2xl shadow-xl border border-slate-800">
                <div className="relative group">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="SEARCH BY VOUCHER CODE..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-16 pr-4 py-4 bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-slate-600 transition-all font-sans"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    [1, 2, 3].map(i => (
                        <div key={i} className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm animate-pulse">
                            <div className="h-8 bg-slate-100 rounded-lg w-1/3 mb-4" />
                            <div className="h-4 bg-slate-100 rounded-lg w-full mb-2" />
                            <div className="h-4 bg-slate-100 rounded-lg w-2/3" />
                        </div>
                    ))
                ) : vouchers.length === 0 ? (
                    <div className="col-span-full py-20 bg-white border border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-center">
                        <Ticket className="h-12 w-12 text-slate-200 mb-4" />
                        <h3 className="text-xl font-black text-slate-900 uppercase">No Vouchers Found</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Start by creating your first discount code</p>
                    </div>
                ) : (
                    vouchers.map((voucher) => (
                        <div key={voucher._id} className={`bg-white border ${voucher.isActive ? 'border-slate-100 shadow-sm' : 'border-slate-200 opacity-60'} p-6 rounded-[2rem] hover:shadow-xl transition-all group relative overflow-hidden`}>
                            {!voucher.isActive && (
                                <div className="absolute top-4 right-4 text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">Inactive</div>
                            )}
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
                                        <Tag className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{voucher.code}</h3>
                                        <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest">
                                            {voucher.discountType === 'percentage' ? `${voucher.discountValue}% OFF` : `₱${voucher.discountValue} OFF`}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                <div className="flex items-center gap-3 text-slate-500">
                                    <PhilippinePeso className="h-4 w-4" />
                                    <span className="text-[11px] font-bold uppercase tracking-tight">Min. Purchase: ₱{voucher.minPurchase}</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-500">
                                    <Calendar className="h-4 w-4" />
                                    <span className="text-[11px] font-bold uppercase tracking-tight">
                                        {new Date(voucher.startDate).toLocaleDateString()} - {new Date(voucher.endDate).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-500">
                                    <Clock className="h-4 w-4" />
                                    <span className="text-[11px] font-bold uppercase tracking-tight">
                                        Used: {voucher.usedCount} {voucher.usageLimit ? `/ ${voucher.usageLimit}` : '(Unlimited)'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => openEditModal(voucher)}
                                    className="flex-1 p-3 bg-slate-50 text-slate-600 rounded-2xl hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center"
                                >
                                    <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => handleToggleStatus(voucher._id)}
                                    className={`flex-1 p-3 ${voucher.isActive ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600' : 'bg-secondary-50 text-primary-600 hover:bg-primary-600'} rounded-2xl hover:text-white transition-all flex items-center justify-center`}
                                >
                                    {voucher.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                                </button>
                                <button
                                    onClick={() => handleDelete(voucher._id)}
                                    className="flex-1 p-3 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 z-[100] animate-fade-in">
                    <div className="bg-white rounded-[2rem] max-w-md w-full shadow-2xl overflow-hidden animate-slide-up border border-slate-200">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none mb-0.5">
                                    {editingVoucher ? 'Edit' : 'Create'} <span className="text-primary-600 italic">Voucher</span>
                                </h2>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Discount properties</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 w-9 h-9 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95 flex items-center justify-center"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Voucher Code</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. SUMMER2024"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-1 focus:ring-primary-500 font-black text-slate-900 text-xs uppercase tracking-widest"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Type</label>
                                    <select
                                        value={formData.discountType}
                                        onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-1 focus:ring-primary-500 font-bold text-slate-900 text-xs"
                                    >
                                        <option value="percentage">PERCENTAGE (%)</option>
                                        <option value="fixed">FIXED AMOUNT (₱)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Value</label>
                                    <input
                                        type="number"
                                        required
                                        value={formData.discountValue}
                                        onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-1 focus:ring-primary-500 font-black text-slate-900 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Min Purchase (₱)</label>
                                    <input
                                        type="number"
                                        required
                                        value={formData.minPurchase}
                                        onChange={(e) => setFormData({ ...formData, minPurchase: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-1 focus:ring-primary-500 font-black text-slate-900 text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Usage Limit</label>
                                    <input
                                        type="number"
                                        placeholder="Unlimited if empty"
                                        value={formData.usageLimit}
                                        onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-1 focus:ring-primary-500 font-black text-slate-900 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</label>
                                    <input
                                        type="date"
                                        required
                                        min={new Date().toISOString().split('T')[0]}
                                        value={formData.startDate}
                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-1 focus:ring-primary-500 font-bold text-slate-900 text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date</label>
                                    <input
                                        type="date"
                                        required
                                        min={formData.startDate || new Date().toISOString().split('T')[0]}
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-1 focus:ring-primary-500 font-bold text-slate-900 text-xs"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-xl active:scale-95"
                            >
                                {editingVoucher ? 'Update Voucher' : 'Create Voucher'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VoucherManagement;
