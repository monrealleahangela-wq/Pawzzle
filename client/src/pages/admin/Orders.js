import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminOrderService, deliveryService, getImageUrl } from '../../services/apiService';
import { ShoppingBag, Eye, Package, ArrowRight, Filter, ChevronLeft, ChevronRight, Activity, ChevronDown, Search, Link2, Copy, Check } from 'lucide-react';

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

  const handleGenerateRiderLink = async (orderId) => {
    try {
      const response = await deliveryService.generateLinks(orderId);
      const url = response.data.riderLink;
      
      // Attempt copy to clipboard
      navigator.clipboard.writeText(url);
      toast.success('Rider Link Generated & Copied!', {
        description: 'You can now share this secure link with the rider.',
        icon: <Link2 className="text-primary-600" />
      });
    } catch (error) {
      toast.error('Failed to generate tracking link');
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'confirmed': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'processing': return 'bg-primary-100 text-primary-700 border-primary-200';
      case 'shipped': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'delivered': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'cancelled': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
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
      <div className="flex justify-center items-center h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 lg:p-6 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900 text-left">Order History</h1>
      </div>

      <div className="bg-slate-900 p-2 rounded-[2rem] shadow-xl border border-slate-800 mb-8">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2">
              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="SEARCH BY ID OR CUSTOMER..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-16 pr-4 py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/20 transition-all placeholder:text-slate-600"
            />
          </div>
          <div className="md:w-64 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2">
              <Filter className="h-4 w-4 text-primary-500" />
            </div>
            <select
              className="w-full pl-16 pr-10 py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/20 appearance-none transition-all cursor-pointer"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">ALL STATUSES</option>
              {['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => (
                <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-slate-200">
          <ShoppingBag className="h-10 w-10 text-slate-200 mb-4" />
          <p className="text-sm font-medium text-slate-400">No orders found</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-left font-semibold text-slate-600">ID</th>
                    <th className="px-6 py-4 text-left font-semibold text-slate-600">Customer</th>
                    <th className="px-6 py-4 text-left font-semibold text-slate-600">Items</th>
                    <th className="px-6 py-4 text-left font-semibold text-slate-600">Total</th>
                    <th className="px-6 py-4 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-6 py-4 text-right font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.map((order) => (
                    <tr key={order._id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">#{order.orderNumber.slice(-8).toUpperCase()}</p>
                        <p className="text-xs text-slate-500">{new Date(order.orderDate).toLocaleDateString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{order.customer?.firstName || 'Unknown'}</span>
                          <span className="text-xs text-slate-500 truncate max-w-[150px]">{order.customer?.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex -space-x-2">
                          {order.items.slice(0, 3).map((item, i) => (
                            <div key={i} className="w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden shrink-0">
                              {item.image ? <img src={getImageUrl(item.image)} alt="" className="w-full h-full object-cover" /> : <Package className="h-4 w-4 text-slate-300 m-auto mt-2" />}
                            </div>
                          ))}
                          {order.items.length > 3 && (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0">
                              <span className="text-[10px] font-bold text-slate-600">+{order.items.length - 3}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">₱{(order.totalAmount || 0).toLocaleString()}</p>
                        <p className="text-xs text-slate-500 uppercase">{order.paymentMethod ? order.paymentMethod.replace('_', ' ') : 'PENDING'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStatusStyle(order.status)}`}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/admin/orders/${order._id}`} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all">
                            <Eye className="h-4 w-4" />
                          </Link>
                          {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                            <button
                              onClick={() => handleConfirmPayment(order._id)}
                              className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                              title="Confirm Payment"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          {getNextStatus(order.status) && (
                            <button
                               onClick={() => handleGenerateRiderLink(order._id)}
                               className={`p-2 rounded-lg transition-all ${order.delivery ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}
                               title={order.delivery ? "Copy Rider Link" : "Generate Rider Link"}
                             >
                               <Link2 className="h-4 w-4" />
                            </button>
                          )}
                          {getNextStatus(order.status) && (
                            <button
                              onClick={() => handleStatusUpdate(order._id, getNextStatus(order.status))}
                              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-primary-600 transition-all"
                            >
                              Process
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

          <div className="md:hidden space-y-4">
            {orders.map((order) => (
              <div key={order._id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-slate-500">#{order.orderNumber.slice(-8).toUpperCase()}</p>
                    <h3 className="font-bold text-slate-900">{order.customer?.firstName || 'Unknown'}</h3>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-[10px] font-medium border ${getStatusStyle(order.status)}`}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-slate-100">
                  <p className="text-sm font-bold text-slate-900">₱{(order.totalAmount || 0).toLocaleString()}</p>
                  <Link to={`/admin/orders/${order._id}`} className="text-xs font-bold text-primary-600">View Details</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center mt-8">
          <button
            onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
            disabled={!pagination.hasPrev}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm font-medium text-slate-600">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
            disabled={!pagination.hasNext}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
