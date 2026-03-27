import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { archiveService } from '../../services/apiService';
import {
    Archive, RotateCcw, Trash2, Search, Shield, Heart, Package,
    Scissors, Building, Users, Calendar, ShoppingBag, ChevronRight,
    AlertTriangle, X, Filter, ChevronDown
} from 'lucide-react';

const typeConfig = {
    pets: { icon: Heart, label: 'Pets', color: 'rose' },
    products: { icon: Package, label: 'Products', color: 'amber' },
    services: { icon: Scissors, label: 'Services', color: 'violet' },
    stores: { icon: Building, label: 'Stores', color: 'blue' },
    users: { icon: Users, label: 'Users', color: 'emerald' },
    bookings: { icon: Calendar, label: 'Bookings', color: 'cyan' },
    orders: { icon: ShoppingBag, label: 'Orders', color: 'orange' }
};

const ArchiveManagement = () => {
    const [counts, setCounts] = useState({});
    const [allResults, setAllResults] = useState({});
    const [activeType, setActiveType] = useState('all');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1 });
    const [confirmModal, setConfirmModal] = useState(null);

    useEffect(() => {
        fetchArchive();
    }, [activeType, pagination.currentPage]);

    const fetchArchive = async () => {
        setLoading(true);
        try {
            if (activeType === 'all') {
                const response = await archiveService.getArchivedItems({ type: 'all', search });
                setCounts(response.data.counts || {});
                setAllResults(response.data.results || {});
                setItems([]);
            } else {
                const response = await archiveService.getArchivedItems({
                    type: activeType, search, page: pagination.currentPage, limit: 20
                });
                setItems(response.data.items || []);
                setPagination(response.data.pagination || { currentPage: 1, totalPages: 1 });
            }
        } catch (error) {
            toast.error('Failed to load archive');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        setPagination(prev => ({ ...prev, currentPage: 1 }));
        fetchArchive();
    };

    const handleRestore = async (type, id, name) => {
        try {
            await archiveService.restoreItem(type, id);
            toast.success(`"${name}" restored successfully`);
            fetchArchive();
        } catch (error) {
            toast.error('Restore failed');
        }
    };

    const handlePermanentDelete = async () => {
        if (!confirmModal) return;
        try {
            await archiveService.permanentDelete(confirmModal.type, confirmModal.id);
            toast.success(`"${confirmModal.name}" permanently deleted`);
            setConfirmModal(null);
            fetchArchive();
        } catch (error) {
            toast.error('Permanent delete failed');
        }
    };

    const getItemName = (type, item) => {
        switch (type) {
            case 'pets': return item.name || 'Unnamed Pet';
            case 'products': return item.name || 'Unnamed Product';
            case 'services': return item.name || 'Unnamed Service';
            case 'stores': return item.name || 'Unnamed Store';
            case 'users': return item.username || item.email || 'Unknown User';
            case 'bookings': return `Booking #${item._id?.slice(-6)}`;
            case 'orders': return item.orderNumber || `Order #${item._id?.slice(-6)}`;
            default: return 'Unknown';
        }
    };

    const getItemSubtext = (type, item) => {
        switch (type) {
            case 'pets': return `${item.species || ''} · ${item.breed || ''}`;
            case 'products': return `${item.category || ''} · ₱${item.price?.toLocaleString() || 0}`;
            case 'services': return `${item.category || ''} · ₱${item.price?.toLocaleString() || 0}`;
            case 'stores': return item.businessType?.replace('_', ' ') || '';
            case 'users': return `${item.role || 'customer'} · ${item.email || ''}`;
            case 'bookings': return `${item.status || ''} · ${item.customer?.firstName || ''} ${item.customer?.lastName || ''}`;
            case 'orders': return `${item.status || ''} · ₱${item.totalAmount?.toLocaleString() || 0}`;
            default: return '';
        }
    };

    const getItemOwner = (type, item) => {
        if (type === 'users') return '';
        if (type === 'stores') return item.owner?.username || item.owner?.firstName || '';
        if (type === 'bookings') return item.service?.name || '';
        if (type === 'orders') return `${item.customer?.firstName || ''} ${item.customer?.lastName || ''}`;
        return item.addedBy?.username || item.addedBy?.firstName || item.store?.name || '';
    };

    const totalArchived = Object.values(counts).reduce((sum, c) => sum + c, 0);

    if (loading && activeType === 'all' && Object.keys(allResults).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2"></div>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading archive...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-slate-100 pb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Archive className="h-3 w-3 text-primary-600" />
                        <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMIN PANEL : ARCHIVE</span>
                    </div>
                    <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                        Data <br /> <span className="text-primary-600 italic">Archive</span>
                    </h1>
                    <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Deleted records · Restore or delete permanently</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-slate-900 rounded-[2.5rem] flex items-center gap-2">
                        <Archive className="h-3 w-3 text-primary-400" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{totalArchived} Archived</span>
                    </div>
                </div>
            </div>

            {/* Archive HUD Filter - High Contrast & Always Visible */}
            <div className="bg-slate-900 p-2 rounded-[2.5rem] shadow-xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-12 relative group">
                        <div className="absolute left-12 top-1/2 -translate-y-1/2 flex items-center">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                        </div>
                        <input
                            type="text" placeholder=""
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="w-full pl-32 pr-32 py-5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-[2.5rem] outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
                        />
                        <button 
                            onClick={handleSearch}
                            className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-primary-600 text-white rounded-[2.5rem] text-[9px] font-black uppercase tracking-widest hover:bg-primary-500 transition-all active:scale-95"
                        >
                            Execute
                        </button>
                    </div>
                </div>
            </div>

            {/* Type Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                    onClick={() => { setActiveType('all'); setPagination({ currentPage: 1, totalPages: 1 }); }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-[2.5rem] text-[9px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 transition-all border-2 ${activeType === 'all'
                        ? 'bg-slate-900 border-slate-900 text-white shadow-lg'
                        : 'bg-white border-slate-100 text-slate-700 hover:border-slate-300'
                        }`}
                >
                    <Filter className="h-3 w-3" /> All ({totalArchived})
                </button>
                {Object.entries(typeConfig).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const count = counts[key] || 0;
                    if (count === 0 && activeType !== key) return null;
                    return (
                        <button
                            key={key}
                            onClick={() => { setActiveType(key); setPagination({ currentPage: 1, totalPages: 1 }); }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-[2.5rem] text-[9px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 transition-all border-2 ${activeType === key
                                ? 'bg-slate-900 border-slate-900 text-white shadow-lg'
                                : 'bg-white border-slate-100 text-slate-700 hover:border-slate-300'
                                }`}
                        >
                            <Icon className="h-3 w-3" /> {cfg.label} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Overview Grid (All mode) */}
            {activeType === 'all' && (
                <div className="space-y-6">
                    {totalArchived === 0 ? (
                        <div className="text-center py-20 bg-white border border-slate-100 rounded-[2.5rem]">
                            <div className="w-16 h-16 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mx-auto mb-4">
                                <Archive className="h-8 w-8" />
                            </div>
                            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter mb-1">Archive Empty</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No soft-deleted records found</p>
                        </div>
                    ) : (
                        Object.entries(allResults).map(([type, typeItems]) => {
                            if (!typeItems || typeItems.length === 0) return null;
                            const cfg = typeConfig[type];
                            const Icon = cfg.icon;
                            return (
                                <div key={type} className="bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden">
                                    <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-[2.5rem] bg-${cfg.color}-50 flex items-center justify-center`}>
                                                <Icon className={`h-5 w-5 text-${cfg.color}-600`} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{cfg.label}</h3>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{counts[type] || 0} archived</p>
                                            </div>
                                        </div>
                                        {(counts[type] || 0) > 0 && (
                                            <button
                                                onClick={() => { setActiveType(type); setPagination({ currentPage: 1, totalPages: 1 }); }}
                                                className="flex items-center gap-1 text-[9px] font-black text-primary-600 uppercase tracking-widest hover:text-primary-800"
                                            >
                                                View All <ChevronRight className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {typeItems.slice(0, 5).map(item => (
                                            <div key={item._id} className="flex items-center justify-between px-5 sm:px-6 py-3 sm:py-5 hover:bg-slate-50/50 transition-colors">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] sm:text-sm font-black text-slate-900 uppercase tracking-tight truncate">{getItemName(type, item)}</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{getItemSubtext(type, item)}</p>
                                                </div>
                                                <div className="flex gap-1.5 ml-3 shrink-0">
                                                    <button
                                                        onClick={() => handleRestore(type, item._id, getItemName(type, item))}
                                                        className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"
                                                        title="Restore"
                                                    >
                                                        <RotateCcw className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmModal({ type, id: item._id, name: getItemName(type, item) })}
                                                        className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all"
                                                        title="Delete Permanently"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Detail List (Single type mode) */}
            {activeType !== 'all' && (
                <div className="bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden">
                    {items.length === 0 ? (
                        <div className="text-center py-16">
                            <Archive className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No archived {typeConfig[activeType]?.label?.toLowerCase()} found</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {items.map(item => (
                                <div key={item._id} className="flex items-center gap-4 px-5 sm:px-8 py-5 sm:py-5 hover:bg-slate-50/50 transition-colors group">
                                    <div className={`w-10 h-10 rounded-[2.5rem] bg-${typeConfig[activeType]?.color}-50 flex items-center justify-center shrink-0`}>
                                        {(() => { const Icon = typeConfig[activeType]?.icon; return Icon ? <Icon className={`h-5 w-5 text-${typeConfig[activeType]?.color}-600`} /> : null; })()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] sm:text-sm font-black text-slate-900 uppercase tracking-tight truncate">{getItemName(activeType, item)}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{getItemSubtext(activeType, item)}</p>
                                        {getItemOwner(activeType, item) && (
                                            <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">by {getItemOwner(activeType, item)}</p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0 hidden sm:block">
                                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Deleted</p>
                                        <p className="text-[10px] font-bold text-slate-500">{new Date(item.updatedAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleRestore(activeType, item._id, getItemName(activeType, item))}
                                            className="px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"
                                        >
                                            <RotateCcw className="h-3 w-3" /> Restore
                                        </button>
                                        <button
                                            onClick={() => setConfirmModal({ type: activeType, id: item._id, name: getItemName(activeType, item) })}
                                            className="px-3 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"
                                        >
                                            <Trash2 className="h-3 w-3" /> Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 p-4 border-t border-slate-50">
                            <button
                                disabled={!pagination.hasPrev}
                                onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
                                className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
                            >
                                Previous
                            </button>
                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                                Page <span className="text-primary-600 italic px-1">{pagination.currentPage}</span> / {pagination.totalPages}
                            </span>
                            <button
                                disabled={!pagination.hasNext}
                                onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
                                className="p-3 bg-slate-900 text-white rounded-xl hover:bg-primary-600 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Permanent Delete Confirmation Modal */}
            {confirmModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in">
                    <div className="bg-white rounded-[3rem] max-w-md w-full shadow-2xl relative overflow-hidden">
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-rose-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-5">
                                <AlertTriangle className="h-8 w-8 text-rose-600" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">Permanent Deletion</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">This action cannot be undone</p>
                            <p className="text-sm font-black text-slate-700 mt-4">
                                Are you sure you want to permanently delete <span className="text-rose-600 italic">"{confirmModal.name}"</span>?
                            </p>
                        </div>
                        <div className="flex gap-3 p-6 bg-slate-50 border-t border-slate-100">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="flex-1 py-5 bg-white border border-slate-200 text-slate-600 rounded-[2.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePermanentDelete}
                                className="flex-1 py-5 bg-rose-600 text-white rounded-[2.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                            >
                                Delete Forever
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArchiveManagement;
