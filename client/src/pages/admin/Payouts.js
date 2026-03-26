import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { payoutService } from '../../services/apiService';
import {
    Wallet, Clock, CheckCircle, XCircle, ChevronDown, AlertTriangle,
    RefreshCw, ExternalLink, Filter, Building, Printer
} from 'lucide-react';
import { generatePayoutReceipt } from '../../utils/payoutReceiptGenerator';

const STATUS_COLORS = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200'
};

const STATUS_ICONS = {
    pending: Clock,
    processing: RefreshCw,
    completed: CheckCircle,
    rejected: XCircle
};

const AdminPayouts = () => {
    const [payouts, setPayouts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('');
    const [processing, setProcessing] = useState({});
    const [notes, setNotes] = useState({});
    const [expandedId, setExpandedId] = useState(null);

    const fetchPayouts = async () => {
        setLoading(true);
        try {
            const res = await payoutService.adminGetAll(filterStatus ? { status: filterStatus } : {});
            setPayouts(res.data);
        } catch {
            toast.error('Failed to load payout requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPayouts(); }, [filterStatus]);

    const handleProcess = async (id, action) => {
        setProcessing(p => ({ ...p, [id]: true }));
        try {
            await payoutService.adminProcess(id, { action, adminNotes: notes[id] || '' });
            toast.success(`Payout ${action === 'approve' ? 'approved' : action === 'complete' ? 'marked as completed' : 'rejected'}`);
            fetchPayouts();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to process payout');
        } finally {
            setProcessing(p => ({ ...p, [id]: false }));
        }
    };

    const totalPending = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
    const totalProcessing = payouts.filter(p => p.status === 'processing').reduce((s, p) => s + p.amount, 0);
    const totalCompleted = payouts.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Payout <span className="text-primary-600 italic">Requests</span></h1>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">Manage seller withdrawal requests</p>
                    </div>
                    <button onClick={fetchPayouts} className="p-2.5 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                        <RefreshCw className="h-4 w-4 text-slate-400" />
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Pending', amount: totalPending, count: payouts.filter(p => p.status === 'pending').length, color: 'amber' },
                        { label: 'Processing', amount: totalProcessing, count: payouts.filter(p => p.status === 'processing').length, color: 'blue' },
                        { label: 'Completed', amount: totalCompleted, count: payouts.filter(p => p.status === 'completed').length, color: 'emerald' }
                    ].map(s => (
                        <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                            <p className={`text-[10px] font-black uppercase tracking-widest text-${s.color}-600`}>{s.label}</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">₱{s.amount.toLocaleString()}</p>
                            <p className="text-slate-400 text-xs font-bold">{s.count} request{s.count !== 1 ? 's' : ''}</p>
                        </div>
                    ))}
                </div>

                {/* Filter */}
                <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-slate-400" />
                    {['', 'pending', 'processing', 'completed', 'rejected'].map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-100 hover:border-slate-200'}`}
                        >
                            {s || 'All'}
                        </button>
                    ))}
                </div>

                {/* Payout List */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    </div>
                ) : payouts.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                        <Wallet className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400 font-bold text-sm">No payout requests found</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {payouts.map(payout => {
                            const Icon = STATUS_ICONS[payout.status];
                            const isExpanded = expandedId === payout._id;
                            return (
                                <div key={payout._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                    <button
                                        onClick={() => setExpandedId(isExpanded ? null : payout._id)}
                                        className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-all text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                                            <Building className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-black text-slate-900 text-sm truncate">{payout.store?.name || 'Unknown Store'}</p>
                                            <p className="text-slate-400 text-xs font-bold">{payout.owner?.firstName} {payout.owner?.lastName} · {payout.owner?.email}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-black text-slate-900 text-lg">₱{payout.amount.toLocaleString()}</p>
                                            <p className="text-slate-400 text-xs">{payout.referenceNumber}</p>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shrink-0 ${STATUS_COLORS[payout.status]}`}>
                                            <Icon className="h-3 w-3" />{payout.status}
                                        </span>
                                        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-slate-50 p-5 space-y-4 bg-slate-50/50">
                                            {/* Payout Method */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Payout Method</p>
                                                    <p className="font-bold text-slate-700 text-sm capitalize">{payout.payoutMethod?.type?.replace('_', ' ')}</p>
                                                    <p className="text-slate-500 text-xs">{payout.payoutMethod?.accountName}</p>
                                                    <p className="text-slate-500 text-xs font-mono">{payout.payoutMethod?.accountNumber}</p>
                                                    {payout.payoutMethod?.bankName && <p className="text-slate-400 text-xs">{payout.payoutMethod.bankName}</p>}
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Requested</p>
                                                    <p className="text-slate-700 text-sm font-bold">{new Date(payout.requestedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                                    {payout.processedAt && (
                                                        <>
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2 mb-1">Processed</p>
                                                            <p className="text-slate-700 text-sm font-bold">{new Date(payout.processedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {payout.adminNotes && (
                                                <div className="bg-white rounded-xl p-3 border border-slate-100">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Admin Notes</p>
                                                    <p className="text-slate-700 text-xs">{payout.adminNotes}</p>
                                                </div>
                                            )}

                                            {/* Actions */}
                                            {payout.status === 'completed' && (
                                                <div className="pt-2 border-t border-slate-200 mt-2">
                                                    <button
                                                        onClick={() => generatePayoutReceipt(payout)}
                                                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm"
                                                    >
                                                        <Printer className="h-3.5 w-3.5" /> DOWNLOAD / PRINT RECEIPT
                                                    </button>
                                                </div>
                                            )}

                                            {(payout.status === 'pending' || payout.status === 'processing') && (
                                                <div className="space-y-3">
                                                    <textarea
                                                        placeholder="Admin notes (optional)..."
                                                        value={notes[payout._id] || ''}
                                                        onChange={e => setNotes(n => ({ ...n, [payout._id]: e.target.value }))}
                                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 resize-none h-16 focus:outline-none focus:border-primary-400"
                                                    />
                                                    <div className="flex gap-2">
                                                        {payout.status === 'pending' && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleProcess(payout._id, 'approve')}
                                                                    disabled={processing[payout._id]}
                                                                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50"
                                                                >
                                                                    Mark as Processing
                                                                </button>
                                                                <button
                                                                    onClick={() => handleProcess(payout._id, 'reject')}
                                                                    disabled={processing[payout._id]}
                                                                    className="flex-1 py-2.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all disabled:opacity-50"
                                                                >
                                                                    Reject & Refund
                                                                </button>
                                                            </>
                                                        )}
                                                        {payout.status === 'processing' && (
                                                            <button
                                                                onClick={() => handleProcess(payout._id, 'complete')}
                                                                disabled={processing[payout._id]}
                                                                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
                                                            >
                                                                ✓ Mark as Sent / Completed
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
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

export default AdminPayouts;
