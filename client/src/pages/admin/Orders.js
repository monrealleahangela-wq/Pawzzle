import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminOrderService, deliveryService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { ShoppingBag, Eye, Package, ArrowRight, Filter, ChevronLeft, ChevronRight, Activity, ChevronDown, Search, Link2, Copy, Check } from 'lucide-react';
import { formatTime12h } from '../../utils/timeFormatters';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';

const AdminOrders = () => {
  const { user } = useAuth();

  // Real-time Updates
  useRealTimeUpdates({
    onOrderUpdate: (data) => {
      console.log('🛒 Real-time order update received:', data);
      fetchOrders();
    },
    onNewOrder: (data) => {
      console.log('🆕 Real-time new order received:', data);
      fetchOrders();
      toast.info(`New Order #${data._id?.slice(-6).toUpperCase()} received!`, {
          icon: <ShoppingBag className="text-primary-600" />
      });
    }
  });

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Permission Checks
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const canUpdate = isAdmin || user?.permissions?.orders?.update || user?.permissions?.orders?.fullAccess;

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
    switch (status) {
      case 'pending_payment': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'paid': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'confirmed': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'preparing': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'ready_for_pickup': return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'rider_assigned': return 'bg-sky-50 text-sky-700 border-sky-100';
      case 'in_transit': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'delivered': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'cancelled': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getActionButton = (order) => {
    switch (order.status) {
      case 'paid': return { label: 'CONFIRM ORDER', next: 'awaiting_confirmation', color: 'bg-emerald-500 hover:bg-emerald-600' };
      case 'awaiting_confirmation': return { label: 'START PREPARING', next: 'confirmed', color: 'bg-blue-500 hover:bg-blue-600' };
      case 'confirmed': return { label: 'START PACKING', next: 'preparing', color: 'bg-indigo-500 hover:bg-indigo-600' };
      case 'preparing': return { label: 'READY FOR PICKUP', next: 'ready_for_pickup', color: 'bg-purple-600 hover:bg-purple-700' };
      case 'ready_for_pickup': return { label: 'ASSIGN RIDER', type: 'rider_link', color: 'bg-slate-900 hover:bg-rose-500' };
      case 'delivered': return { label: 'CLOSE ORDER', next: 'completed', color: 'bg-slate-900 hover:bg-black' };
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 lg:p-10 pb-20 bg-slate-50 min-h-screen">
      <div className="flex flex-col mb-8 text-left">
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">Order Command</h1>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Global Fulfillment Hub</p>
      </div>

      <div className="bg-white p-2 rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 mb-10">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-300 group-focus-within:text-rose-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="SEARCH BY ORDER ID OR CUSTOMER..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-16 pr-4 py-5 bg-slate-50 text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-4 focus:ring-rose-500/5 transition-all placeholder:text-slate-300"
            />
          </div>
          <div className="md:w-80 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2">
              <Filter className="h-4 w-4 text-rose-500" />
            </div>
            <select
              className="w-full pl-16 pr-10 py-5 bg-slate-50 text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-4 focus:ring-rose-500/5 appearance-none cursor-pointer"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">ALL PHASES</option>
              {['pending_payment', 'paid', 'confirmed', 'preparing', 'ready_for_pickup', 'rider_assigned', 'in_transit', 'delivered', 'cancelled'].map(s => (
                <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none" />
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
                        <p className="text-xs text-slate-500">{new Date(order.orderDate).toLocaleDateString()} {formatTime12h(new Date(order.orderDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))}</p>
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
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-right">
                          <Link to={`/admin/orders/${order._id}`} className="p-3 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all">
                            <Eye className="h-4 w-4" />
                          </Link>
                          
                          {getActionButton(order) && (
                            getActionButton(order).type === 'rider_link' ? (
                              <button
                                onClick={() => handleGenerateRiderLink(order._id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${order.delivery ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-900 text-white'}`}
                              >
                                {order.delivery ? <Copy className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                                {order.delivery ? 'COPY LINK' : 'ASSIGN RIDER'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStatusUpdate(order._id, getActionButton(order).next)}
                                className={`px-4 py-2.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${getActionButton(order).color}`}
                              >
                                {getActionButton(order).label}
                              </button>
                            )
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
