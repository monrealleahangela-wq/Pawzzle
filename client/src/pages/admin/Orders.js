import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminOrderService, getImageUrl } from '../../services/apiService';
import { ShoppingBag, Eye, Package, ArrowRight, Filter, ChevronLeft, ChevronRight, Activity, ChevronDown, Search } from 'lucide-react';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    search: ''
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });

  useEffect(() => {
    fetchOrders();
  }, [filters, pagination.currentPage]);

  const fetchOrders = async () => {
    try {
      const params = {
        ...filters,
        page: pagination.currentPage,
        limit: 15
      };

      const response = await adminOrderService.getAllOrders(params);
      setOrders(response.data.orders || []);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await adminOrderService.updateOrderStatus(orderId, { status: newStatus });
      toast.success(`Order status updated to: ${newStatus.toUpperCase()}`);
      fetchOrders();
    } catch (error) {
      toast.error('Failed to update order status');
    }
  };

  const handleConfirmPayment = async (orderId) => {
    try {
      await adminOrderService.confirmPayment(orderId);
      toast.success('Payment confirmed successfully');
      fetchOrders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to confirm payment');
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'pending': return 'bg-amber-500 text-white border-amber-400';
      case 'confirmed': return 'bg-blue-500 text-white border-blue-400';
      case 'processing': return 'bg-primary-600 text-white border-primary-500';
      case 'shipped': return 'bg-indigo-600 text-white border-indigo-500';
      case 'delivered': return 'bg-emerald-500 text-white border-emerald-400';
      case 'cancelled': return 'bg-rose-500 text-white border-rose-400';
      default: return 'bg-slate-400 text-white border-slate-300';
    }
  };

  const getNextStatus = (currentStatus) => {
    const statusFlow = {
      pending: 'confirmed',
      confirmed: 'processing',
      processing: 'shipped',
      shipped: 'delivered'
    };
    return statusFlow[currentStatus];
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-6 bg-slate-50/50">
        <div className="w-16 h-16 border-4 border-slate-100 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Loading Orders...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/30 p-4 lg:p-8 space-y-10 pb-32">
      {/* Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[20%] right-[-5%] w-[35%] h-[35%] bg-primary-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[20%] left-[-5%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[100px]" />
      </div>

      <header className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-1.5 bg-slate-900 text-white rounded-lg shadow-sm">
              <ShoppingBag className="h-3.5 w-3.5" />
            </div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em]">ADMIN : ORDERS</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">
            Order <span className="text-primary-600">History</span>
          </h1>
        </div>

      {/* Order HUD Filter - High Contrast & Always Visible */}
      <div className="relative z-10 bg-slate-900 p-2 rounded-[1.5rem] shadow-xl border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-6 relative group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center">
              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              type="text" placeholder=""
              value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-14 pr-4 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600 transition-all font-sans input-with-icon"
            />
          </div>
          <div className="md:col-span-4 relative">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center">
              <Activity className="h-4 w-4 text-primary-500" />
            </div>
            <select
              className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-14 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="" className="bg-slate-900 text-white font-black">ALL STATUSES</option>
              {['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => (
                <option key={s} value={s} className="bg-slate-900 text-white font-black">{s.toUpperCase()}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>
      </header>

      {orders.length === 0 ? (
        <div className="relative z-10 flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-dashed border-slate-200">
          <ShoppingBag className="h-10 w-10 text-slate-200 mb-4" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">No orders captured</p>
        </div>
      ) : (
        <div className="relative z-10 space-y-4">
          {/* Table for Desktop */}
          <div className="hidden md:block bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Protocol ID</th>
                    <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Customer Profile</th>
                    <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Cargo / Items</th>
                    <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Financials</th>
                    <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.map((order) => (
                    <tr key={order._id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-8 py-6">
                        <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight mb-1">#{order.orderNumber.slice(-10).toUpperCase()}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(order.orderDate).toLocaleDateString()}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black text-slate-900 uppercase">{order.customer?.firstName || 'Unknown'}</span>
                          <span className="text-[9px] font-bold text-slate-400 lowercase italic opacity-60 truncate max-w-[140px]">{order.customer?.email}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex -space-x-3 hover:space-x-1 transition-all">
                          {order.items.slice(0, 3).map((item, i) => (
                            <div key={i} className="w-9 h-9 rounded-lg border-2 border-white bg-slate-100 overflow-hidden shadow-sm shrink-0">
                              {item.image ? <img src={getImageUrl(item.image)} alt="" className="w-full h-full object-cover" /> : <Package className="h-4 w-4 text-slate-300 m-auto mt-2" />}
                            </div>
                          ))}
                          {order.items.length > 3 && (
                            <div className="w-9 h-9 rounded-lg border-2 border-white bg-slate-900 flex items-center justify-center shadow-sm shrink-0">
                              <span className="text-[9px] font-black text-white">+{order.items.length - 3}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[13px] font-black text-slate-900 tracking-tighter leading-none mb-1">₱{(order.totalAmount || 0).toLocaleString()}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{order.paymentMethod?.split('_').pop() || 'CASH'}</p>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusStyle(order.status)}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/admin/orders/${order._id}`} className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                            <Eye className="h-4 w-4" />
                          </Link>
                          {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                            <button
                              onClick={() => handleConfirmPayment(order._id)}
                              className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm group/pay relative"
                              title="Confirm Payment"
                            >
                              <Activity className="h-4 w-4" />
                            </button>
                          )}
                          {getNextStatus(order.status) && (
                            <button
                              onClick={() => handleStatusUpdate(order._id, getNextStatus(order.status))}
                              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 active:scale-95"
                            >
                              Process <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards for Mobile */}
          <div className="md:hidden space-y-4">
            {orders.map((order) => (
              <div key={order._id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">#{order.orderNumber.slice(-8).toUpperCase()}</p>
                    <h3 className="text-sm font-black text-slate-900 uppercase">{order.customer?.firstName || 'Unknown'}</h3>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${getStatusStyle(order.status)}`}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-3 py-2 border-y border-slate-50">
                  <div className="flex -space-x-2">
                    {order.items.slice(0, 3).map((item, i) => (
                      <div key={i} className="w-8 h-8 rounded-lg border-2 border-white bg-slate-100 overflow-hidden shadow-sm">
                        {item.image ? <img src={getImageUrl(item.image)} alt="" className="w-full h-full object-cover" /> : <Package className="h-3 w-3 text-slate-300 m-auto mt-2" />}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                    {order.items.length} {order.items.length === 1 ? 'Item' : 'Items'}
                  </p>
                  <p className="ml-auto text-sm font-black text-slate-900 tracking-tighter">₱{(order.totalAmount || 0).toLocaleString()}</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Link to={`/admin/orders/${order._id}`} className="flex-1 py-3.5 bg-slate-50 text-slate-600 rounded-2xl text-[9px] font-black uppercase tracking-widest text-center hover:bg-slate-900 hover:text-white transition-all">
                    View Briefing
                  </Link>
                  {getNextStatus(order.status) && (
                    <button
                      onClick={() => handleStatusUpdate(order._id, getNextStatus(order.status))}
                      className="flex-1 py-3.5 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary-600 transition-all shadow-lg active:scale-95"
                    >
                      Process <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="relative z-10 flex justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800 mt-12 shadow-2xl">
          <button
            onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
            disabled={!pagination.hasPrev}
            className="w-14 h-14 flex items-center justify-center bg-white/5 text-white disabled:opacity-20 rounded-2xl hover:bg-white/10 transition-all font-black"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div className="flex flex-col items-center gap-2">
            <span className="text-[11px] font-black text-white uppercase tracking-[0.4em]">
              Page <span className="text-primary-500 italic px-1">{pagination.currentPage}</span> / {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              {[...Array(Math.min(pagination.totalPages, 10))].map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full ${i + 1 === pagination.currentPage ? 'bg-primary-500 w-8' : 'bg-white/10 w-2'} transition-all`}></div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
            disabled={!pagination.hasNext}
            className="w-14 h-14 flex items-center justify-center bg-primary-600 text-white disabled:opacity-20 rounded-2xl hover:bg-primary-700 transition-all shadow-xl shadow-primary-900/40 font-black"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
