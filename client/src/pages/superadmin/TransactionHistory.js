import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { orderService } from '../../services/apiService';
import {
  DollarSign,
  Calendar,
  User,
  Eye,
  Filter,
  Search,
  Download,
  TrendingUp,
  ShoppingCart,
  Package,
  X,
  Target,
  Zap,
  Globe,
  PieChart,
  ArrowRight,
  Shield,
  ChevronDown
} from 'lucide-react';

const TransactionHistory = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    dateRange: '',
    userType: '',
    search: ''
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Debounce search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update filter if searchQuery changed from the current filter
      if (searchQuery !== filters.search) {
        handleFilterChange('search', searchQuery);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, filters.search]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (searchQuery !== filters.search) {
      handleFilterChange('search', searchQuery);
    }
  };
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        ...filters,
        page: pagination.currentPage,
        limit: 20
      };

      const response = await orderService.getAllOrders(params);
      setTransactions(response.data.orders || []);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.currentPage]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  const exportTransactions = () => {
    const csvContent = [
      ['Order ID', 'Order Number', 'Date', 'Customer', 'Email', 'Amount', 'Status', 'Payment Method'].join(','),
      ...transactions.map(t => [
        t._id,
        t.orderNumber,
        new Date(t.orderDate).toLocaleDateString(),
        `${t.customer.firstName} ${t.customer.lastName}`,
        t.customer.email,
        t.totalAmount,
        t.status,
        t.paymentMethod || 'N/A'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Transactions exported');
  };

  const getStatusProps = (status) => {
    const props = {
      pending: { color: 'amber', label: 'PENDING' },
      confirmed: { color: 'primary', label: 'CONFIRMED' },
      processing: { color: 'indigo', label: 'PROCESSING' },
      shipped: { color: 'blue', label: 'SHIPPED' },
      delivered: { color: 'emerald', label: 'DELIVERED' },
      cancelled: { color: 'rose', label: 'CANCELLED' }
    };
    return props[status] || { color: 'slate', label: 'UNKNOWN' };
  };

  const totals = useMemo(() => {
    return {
      revenue: transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0),
      count: transactions.length,
      avg: transactions.length ? transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0) / transactions.length : 0
    };
  }, [transactions]);

  if (loading && transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2"></div>
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Transactions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PieChart className="h-3 w-3 text-primary-600" />
            <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMIN PANEL : TRANSACTIONS</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
            Global <br /> <span className="text-primary-600 italic">Transactions</span>
          </h1>
          <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Track orders and completions</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={exportTransactions}
            className="flex-1 sm:flex-none px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
          >
            <Download className="h-4 w-4" /> Export Transactions
          </button>
        </div>
      </div>

      {/* Transaction Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: `₱${totals.revenue.toLocaleString()}`, icon: DollarSign, color: 'emerald', trend: '+18.2%' },
          { label: 'Total Orders', value: totals.count, icon: ShoppingCart, color: 'primary', trend: '+5.4%' },
          { label: 'Avg Order Value', value: `₱${totals.avg.toFixed(2)}`, icon: Zap, color: 'amber', trend: '-2.1%' },
          { label: 'System Status', value: 'Active', icon: Globe, color: 'indigo', trend: 'STABLE' }
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-100 p-5 rounded-[2rem] shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <div className={`p-2 rounded-2xl bg-${s.color}-50 text-${s.color}-600`}>
                <s.icon className="h-4 w-4" />
              </div>
              <span className={`text-[8px] font-black uppercase tracking-tight ${s.trend.startsWith('+') ? 'text-emerald-500' : s.trend.startsWith('-') ? 'text-rose-500' : 'text-slate-400'}`}>
                {s.trend}
              </span>
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{s.label}</p>
            <p className="text-xl font-black text-slate-900 tracking-tighter">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Identity HUD Filter - High Contrast & Always Visible */}
      <div className="bg-slate-900 p-2 rounded-[1.5rem] shadow-xl border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <form onSubmit={handleSearchSubmit} className="md:col-span-6 relative group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center">
              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
            </div>
            <input
              type="text" placeholder="SEARCH BY ORDER #, CUSTOMER..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-16 pr-5 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
            />
          </form>
          <div className="md:col-span-3 relative">
            <div className="absolute left-5 top-1/2 -translate-y-1/2">
              <Shield className="h-3.5 w-3.5 text-primary-500" />
            </div>
            <select
              value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-14 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
            >
              <option value="" className="bg-slate-900 text-white font-black">ALL STATUSES</option>
              <option value="pending" className="bg-slate-900 text-white font-black">PENDING</option>
              <option value="confirmed" className="bg-slate-900 text-white font-black">CONFIRMED</option>
              <option value="delivered" className="bg-slate-900 text-white font-black">DELIVERED</option>
              <option value="cancelled" className="bg-slate-900 text-white font-black">CANCELLED</option>
            </select>
          </div>
          <div className="md:col-span-3 relative">
            <div className="absolute left-5 top-1/2 -translate-y-1/2">
              <Calendar className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <select
              value={filters.dateRange} onChange={(e) => handleFilterChange('dateRange', e.target.value)}
              className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-14 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
            >
              <option value="" className="bg-slate-900 text-white font-black">ALL TIME</option>
              <option value="today" className="bg-slate-900 text-white font-black">TODAY</option>
              <option value="week" className="bg-slate-900 text-white font-black">THIS WEEK</option>
              <option value="month" className="bg-slate-900 text-white font-black">THIS MONTH</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-slate-100 rounded-[3rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Order Number</th>
                <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Customer</th>
                <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Amount</th>
                <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Status</th>
                <th className="px-8 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.map((t) => {
                const s = getStatusProps(t.status);
                return (
                  <tr key={t._id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="text-[11px] font-black text-slate-900 uppercase">#{t.orderNumber.slice(-8)}</div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(t.orderDate).toLocaleDateString()}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-[11px] font-black text-slate-900 uppercase">{t.customer.firstName} {t.customer.lastName}</div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight italic opacity-60">{t.customer.email}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-[12px] font-black text-slate-900">₱{t.totalAmount?.toLocaleString()}</div>
                      <div className="text-[9px] font-black text-primary-500 uppercase tracking-[0.1em]">{t.items.length} ITEMS</div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border border-${s.color}-100 bg-${s.color}-50 text-${s.color}-600`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button
                        onClick={() => { setSelectedTransaction(t); setShowDetailsModal(true); }}
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

      {/* Pager */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 bg-white border border-slate-100 p-4 rounded-[2rem] w-fit mx-auto shadow-sm">
          <button
            disabled={!pagination.hasPrev} onClick={() => handlePageChange(pagination.currentPage - 1)}
            className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
          >
            Previous
          </button>
          <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest whitespace-nowrap">
            Page <span className="text-primary-600 italic px-1">{pagination.currentPage}</span> / {pagination.totalPages}
          </span>
          <button
            disabled={!pagination.hasNext} onClick={() => handlePageChange(pagination.currentPage + 1)}
            className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-primary-600 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
          >
            Next
          </button>
        </div>
      )}

      {/* Transaction Details Modal */}
      {showDetailsModal && selectedTransaction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 z-[100] animate-fade-in">
          <div className="bg-white rounded-[2rem] max-w-4xl w-full shadow-2xl relative overflow-hidden max-h-[95vh] flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Target className="h-2.5 w-2.5 text-primary-600" />
                  <span className="text-[8px] font-black text-primary-600 uppercase tracking-[0.4em] leading-none">Transaction Details</span>
                </div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                  Order <span className="text-primary-600 italic">#{selectedTransaction.orderNumber.slice(-8)}</span>
                </h2>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Order Information</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 no-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Transaction Summary */}
                <div className="space-y-8">
                  <div className="bg-slate-900 rounded-2xl p-10 text-white relative overflow-hidden shadow-2xl">
                    <PieChart className="absolute -bottom-10 -right-10 w-48 h-48 opacity-10" />
                    <div className="relative z-10 space-y-6">
                      <div className="flex justify-between items-start">
                        <label className="text-[10px] font-black text-primary-500 uppercase tracking-[0.5em] block">Order Status</label>
                        <span className={`px-3 py-1 bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-${getStatusProps(selectedTransaction.status).color}-400`}>
                          {getStatusProps(selectedTransaction.status).label}
                        </span>
                      </div>
                      <p className="text-6xl font-black tracking-tighter">₱{selectedTransaction.totalAmount?.toLocaleString()}</p>
                      <div className="flex gap-4">
                        <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                          <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Method</p>
                          <p className="text-sm font-black text-primary-400 uppercase">{selectedTransaction.paymentMethod || 'SECURE'}</p>
                        </div>
                        <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                          <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Verify</p>
                          <p className="text-sm font-black text-emerald-400 uppercase">VERIFIED</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                      Customer Profile
                    </h3>
                    <div className="grid grid-cols-1 gap-6">
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Customer Name</p>
                        <p className="text-[14px] font-black text-slate-900 uppercase tracking-tight leading-none">{selectedTransaction.customer.firstName} {selectedTransaction.customer.lastName}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email Address</p>
                        <p className="text-[12px] font-black text-slate-900 lowercase italic opacity-80">{selectedTransaction.customer.email}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Details */}
                <div className="space-y-8">
                  <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center justify-between">
                      Items Ordered
                      <span className="text-[9px] text-primary-600 font-black">{selectedTransaction.items.length} ITEMS</span>
                    </h3>
                    <div className="space-y-4">
                      {selectedTransaction.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 group">
                          <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center shrink-0">
                            <Package className="h-4 w-4 text-slate-400 group-hover:text-primary-600 transition-colors" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-slate-900 uppercase truncate leading-none mb-1">{item.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.quantity} ITEMS × ₱{item.price}</p>
                          </div>
                          <div className="text-[11px] font-black text-slate-900">₱{(item.price * item.quantity).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary-600" /> Shipping Details
                    </h3>
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Method: <span className="text-primary-600 italic px-2">{selectedTransaction.deliveryMethod || 'SHIPPING'}</span></p>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mt-4">
                        <p className="text-[11px] font-medium text-slate-600 leading-relaxed uppercase tracking-tight">
                          {selectedTransaction.shippingAddress?.street}, {selectedTransaction.shippingAddress?.city}, <br />
                          {selectedTransaction.shippingAddress?.province} {selectedTransaction.shippingAddress?.zipCode}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {selectedTransaction.notes && (
                <div className="bg-secondary-50/50 border border-secondary-100 rounded-[2rem] p-8">
                  <h3 className="text-[9px] font-black text-primary-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Target className="h-3 w-3" /> Special Notes
                  </h3>
                  <p className="text-[11px] font-medium text-primary-900 uppercase tracking-tight italic">"{selectedTransaction.notes}"</p>
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 relative z-10 flex gap-3">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl active:scale-95"
              >
                Close Order Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
