import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { payoutService } from '../../services/apiService';
import {
    Wallet, Plus, Trash2, Clock, CheckCircle, XCircle,
    RefreshCw, CreditCard, Landmark, Smartphone, BadgeCheck, Printer
} from 'lucide-react';
import { generatePayoutReceipt } from '../../utils/payoutReceiptGenerator';

const METHOD_ICONS = { gcash: Smartphone, maya: Smartphone, bank_transfer: Landmark };
const METHOD_COLORS = { gcash: 'text-blue-500', maya: 'text-green-500', bank_transfer: 'text-slate-600' };

const STATUS_STYLES = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200'
};
const STATUS_ICONS = { pending: Clock, processing: RefreshCw, completed: CheckCircle, rejected: XCircle };

const StorePayout = () => {
    const [stats, setStats] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('withdraw');

    // Withdraw form
    const [amount, setAmount] = useState('');
    const [selectedMethodId, setSelectedMethodId] = useState('');
    const [requesting, setRequesting] = useState(false);

    // Payout method form
    const [addingMethod, setAddingMethod] = useState(false);
    const [newMethod, setNewMethod] = useState({ type: 'gcash', accountName: '', accountNumber: '', bankName: '' });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [statsRes, histRes] = await Promise.all([payoutService.getStats(), payoutService.getHistory()]);
            setStats(statsRes.data);
            setHistory(histRes.data);
        } catch {
            toast.error('Failed to load payout info');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleRequest = async (e) => {
        e.preventDefault();
        const amountNum = parseFloat(amount);
        if (!amountNum || amountNum < 100) return toast.error('Minimum withdrawal is ₱100');
        if (!selectedMethodId) return toast.error('Please select a payout method');
        if (amountNum > stats.balance) return toast.error('Amount exceeds your available balance');

        setRequesting(true);
        try {
            await payoutService.request({ amount: amountNum, payoutMethodId: selectedMethodId });
            toast.success('Withdrawal request submitted!');
            setAmount('');
            setSelectedMethodId('');
            fetchData();
            setTab('history');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to request payout');
        } finally {
            setRequesting(false);
        }
    };

    const handleAddMethod = async () => {
        if (!newMethod.accountName || !newMethod.accountNumber) return toast.error('Please fill in account name and number');
        if (newMethod.type === 'bank_transfer' && !newMethod.bankName) return toast.error('Bank name is required for bank transfers');

        try {
            const updated = [...(stats?.payoutMethods || []), newMethod];
            const res = await payoutService.updateMethods(updated);
            setStats(s => ({ ...s, payoutMethods: res.data.payoutMethods }));
            setNewMethod({ type: 'gcash', accountName: '', accountNumber: '', bankName: '' });
            setAddingMethod(false);
            toast.success('Payment method added!');
        } catch {
            toast.error('Failed to save method');
        }
    };

    const handleRemoveMethod = async (idx) => {
        if (!window.confirm('Remove this payout method?')) return;
        try {
            const updated = (stats?.payoutMethods || []).filter((_, i) => i !== idx);
            const res = await payoutService.updateMethods(updated);
            setStats(s => ({ ...s, payoutMethods: res.data.payoutMethods }));
            toast.success('Method removed');
        } catch {
            toast.error('Failed to remove method');
        }
    };

    if (loading) return (
        <div className="flex justify-center py-32">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">My <span className="text-primary-600 italic">Balance</span></h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">Manage your store earnings and withdrawals</p>
                </div>

                {/* Balance Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                        { label: 'Available Balance', value: `₱${(stats?.balance || 0).toLocaleString()}`, highlight: true },
                        { label: 'Net Earnings', value: `₱${((stats?.totalRevenue || 0) - (stats?.totalPlatformFees || 0)).toLocaleString()}` },
                        { label: 'Platform Fees (10%)', value: `₱${(stats?.totalPlatformFees || 0).toLocaleString()}` },
                        { label: 'Pending Payouts', value: `₱${(stats?.pendingPayouts || 0).toLocaleString()}` },
                        { label: 'Total Withdrawn', value: `₱${(stats?.totalWithdrawn || 0).toLocaleString()}` }
                    ].map(c => (
                        <div key={c.label} className={`rounded-2xl border p-4 ${c.highlight ? 'bg-slate-900 border-slate-800 text-white shadow-md' : 'bg-white border-slate-100 text-slate-900 shadow-sm'}`}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-2 leading-tight ${c.highlight ? 'text-primary-400' : 'text-slate-400'}`}>{c.label}</p>
                            <p className={`text-lg sm:text-xl font-black ${c.highlight ? 'text-white' : 'text-slate-900'}`}>{c.value}</p>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white shadow-sm p-1 flex gap-1">
                    {[
                        { id: 'withdraw', label: 'Request Withdrawal' },
                        { id: 'methods', label: 'Payout Methods' },
                        { id: 'history', label: 'History' }
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${tab === t.id ? 'bg-slate-900 text-white shadow' : 'text-slate-400 hover:text-slate-700'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Request Withdrawal */}
                {tab === 'withdraw' && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                        <h2 className="font-black text-slate-900 uppercase tracking-tighter">Withdraw Earnings</h2>

                        {(stats?.payoutMethods || []).length === 0 ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                                <BadgeCheck className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-black text-amber-800 text-sm">Add a payout method first</p>
                                    <p className="text-amber-600 text-xs mt-0.5">Go to the "Payout Methods" tab to add your GCash, Maya, or bank account.</p>
                                    <button onClick={() => setTab('methods')} className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-700 underline underline-offset-2">
                                        Add Method →
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleRequest} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Amount (₱)</label>
                                    <input
                                        type="number"
                                        min="100"
                                        max={stats?.balance}
                                        step="1"
                                        placeholder="e.g. 500"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold text-lg focus:outline-none focus:border-primary-400"
                                        required
                                    />
                                    <p className="text-slate-400 text-[10px] font-bold mt-1">Min: ₱100 · Available: ₱{(stats?.balance || 0).toLocaleString()}</p>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Send to</label>
                                    <div className="space-y-2">
                                        {(stats?.payoutMethods || []).map((m, i) => {
                                            const Icon = METHOD_ICONS[m.type] || CreditCard;
                                            return (
                                                <button
                                                    type="button"
                                                    key={i}
                                                    onClick={() => setSelectedMethodId(m._id)}
                                                    className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${selectedMethodId === m._id ? 'border-primary-400 bg-primary-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}
                                                >
                                                    <Icon className={`h-5 w-5 ${METHOD_COLORS[m.type]}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-black text-slate-900 text-sm capitalize">{m.type.replace('_', ' ')}</p>
                                                        <p className="text-slate-500 text-xs">{m.accountName} · {m.accountNumber}</p>
                                                    </div>
                                                    {selectedMethodId === m._id && <CheckCircle className="h-4 w-4 text-primary-600 shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={requesting}
                                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
                                >
                                    {requesting ? 'Submitting...' : 'Request Withdrawal'}
                                </button>

                                <p className="text-slate-400 text-[10px] text-center">
                                    Requests are reviewed and processed within 1-3 business days.
                                </p>
                            </form>
                        )}
                    </div>
                )}

                {/* Payout Methods */}
                {tab === 'methods' && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-black text-slate-900 uppercase tracking-tighter">Payout Methods</h2>
                            <button
                                onClick={() => setAddingMethod(!addingMethod)}
                                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                            >
                                <Plus className="h-3 w-3" /> Add Method
                            </button>
                        </div>

                        {addingMethod && (
                            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                                <h3 className="font-black text-slate-700 text-xs uppercase tracking-widest">New Method</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    {['gcash', 'maya', 'bank_transfer'].map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setNewMethod(m => ({ ...m, type: t }))}
                                            className={`py-2.5 rounded-xl border font-black text-[10px] uppercase tracking-widest transition-all capitalize ${newMethod.type === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {t.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    placeholder="Account Name"
                                    value={newMethod.accountName}
                                    onChange={e => setNewMethod(m => ({ ...m, accountName: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-primary-400"
                                />
                                <input
                                    type="text"
                                    placeholder={newMethod.type === 'bank_transfer' ? 'Account Number' : 'GCash/Maya Number'}
                                    value={newMethod.accountNumber}
                                    onChange={e => setNewMethod(m => ({ ...m, accountNumber: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-primary-400"
                                />
                                {newMethod.type === 'bank_transfer' && (
                                    <input
                                        type="text"
                                        placeholder="Bank Name (e.g. BDO, BPI)"
                                        value={newMethod.bankName}
                                        onChange={e => setNewMethod(m => ({ ...m, bankName: e.target.value }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-primary-400"
                                    />
                                )}
                                <div className="flex gap-2">
                                    <button onClick={handleAddMethod} className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 transition-all">Save</button>
                                    <button onClick={() => setAddingMethod(false)} className="px-4 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-slate-300 transition-all">Cancel</button>
                                </div>
                            </div>
                        )}

                        {(stats?.payoutMethods || []).length === 0 && !addingMethod ? (
                            <div className="text-center py-10">
                                <CreditCard className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                                <p className="text-slate-400 text-sm font-bold">No payout methods yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {(stats?.payoutMethods || []).map((m, i) => {
                                    const Icon = METHOD_ICONS[m.type] || CreditCard;
                                    return (
                                        <div key={i} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <Icon className={`h-5 w-5 ${METHOD_COLORS[m.type]}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-black text-slate-900 text-sm capitalize">{m.type.replace('_', ' ')}</p>
                                                <p className="text-slate-500 text-xs">{m.accountName} · {m.accountNumber}</p>
                                                {m.bankName && <p className="text-slate-400 text-xs">{m.bankName}</p>}
                                            </div>
                                            <button onClick={() => handleRemoveMethod(i)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-50">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* History */}
                {tab === 'history' && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
                        <h2 className="font-black text-slate-900 uppercase tracking-tighter">Withdrawal History</h2>
                        {history.length === 0 ? (
                            <div className="text-center py-10">
                                <Wallet className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                                <p className="text-slate-400 text-sm font-bold">No withdrawals yet</p>
                            </div>
                        ) : (
                            history.map(p => {
                                const Icon = STATUS_ICONS[p.status] || Clock;
                                return (
                                    <div key={p._id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-black text-slate-900 text-sm">{p.referenceNumber}</p>
                                            <p className="text-slate-400 text-xs">{new Date(p.requestedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })} · {p.payoutMethod?.type?.replace('_', ' ')} · {p.payoutMethod?.accountNumber}</p>
                                            {p.adminNotes && <p className="text-slate-500 text-xs italic mt-0.5">"{p.adminNotes}"</p>}
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <p className="font-black text-slate-900 text-base leading-none">₱{p.amount.toLocaleString()}</p>
                                            <div className="flex flex-col items-center gap-1.5 mt-1">
                                                <span className={`px-4 py-1 rounded-full border-2 text-[8px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 ${STATUS_STYLES[p.status]}`}>
                                                    <Icon className="h-3 w-3" />{p.status}
                                                </span>
                                                {p.status === 'completed' && (
                                                    <button
                                                        onClick={() => generatePayoutReceipt(p)}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-white text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm border border-slate-100"
                                                    >
                                                        <Printer className="h-3.5 w-3.5" /> RECEIPT
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StorePayout;
