import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { orderService, getImageUrl } from '../../services/apiService';
import { ShoppingBag, Eye, Clock, Package, Truck, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight, ArrowRight, Star, Heart, Calendar, Receipt, MapPin } from 'lucide-react';
import ReviewModal from '../../components/ReviewModal';
import Adoptions from './Adoptions';
import Bookings from './Bookings';

const STATUS_META = {
  pending_payment: { label: 'Awaiting Payment', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', icon: Clock },
  paid: { label: 'Payment Received', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', icon: CheckCircle },
  awaiting_confirmation: { label: 'Processing', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', icon: Package },
  confirmed: { label: 'Confirmed', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', icon: CheckCircle },
  preparing: { label: 'Merchant Packing', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', icon: Package },
  ready_for_pickup: { label: 'Awaiting Rider', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100', icon: Truck },
  rider_assigned: { label: 'Rider Coming', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', icon: MapPin },
  picked_up: { label: 'In Transit', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', icon: Truck },
  in_transit: { label: 'Out for Delivery', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', icon: Truck },
  delivered: { label: 'Delivered', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-100', icon: XCircle },
};

const Orders = () => {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'pets' | 'bookings'
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingOrder, setRatingOrder] = useState(null);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false });

  useEffect(() => { fetchOrders(); }, [pagination.currentPage]);

  const fetchOrders = async () => {
    try {
      const response = await orderService.getAllOrders({ page: pagination.currentPage, limit: 10 });
      setOrders(response.data.orders || []);
      setPagination(response.data.pagination || pagination);
    } catch (e) {
      console.error('Error fetching orders:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">My Orders</h1>
          <p className="text-slate-500">Track and manage your purchases</p>
        </div>
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
          {[
            { id: 'orders', label: 'Products', icon: ShoppingBag },
            { id: 'pets', label: 'Pets', icon: Heart },
            { id: 'bookings', label: 'Bookings', icon: Calendar }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'orders' ? (
        <div className="space-y-6">
          {orders.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-200">
              <ShoppingBag className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">No orders found</p>
              <Link to="/products" className="text-primary-600 font-bold mt-2 inline-block">Start Shopping</Link>
            </div>
          ) : (
            <div className="grid gap-6">
              {orders.map(order => {
                // Legacy Status Mapper for Backward Compatibility
                const legacyToNew = {
                  'pending': 'pending_payment',
                  'processing': 'awaiting_confirmation',
                  'shipped': 'picked_up',
                  'finalized': 'completed'
                };
                
                const effectiveStatus = legacyToNew[order.status] || order.status;
                const meta = STATUS_META[effectiveStatus] || STATUS_META.pending_payment;
                const StatusIcon = meta.icon;
                
                return (
                  <div key={order._id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase">Order ID</p>
                          <p className="font-bold text-slate-900">#{order.orderNumber?.slice(-8).toUpperCase()}</p>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${meta.bg} ${meta.color} ${meta.border}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {meta.label}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-400 uppercase">Total Amount</p>
                        <p className="text-xl font-bold text-slate-900">₱{(order.totalAmount || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="p-4 sm:p-6 space-y-4">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex gap-4 items-center">
                          <img 
                            src={getImageUrl(item.image)} 
                            alt="" 
                            className="w-12 h-12 object-cover rounded-lg border border-slate-100 bg-slate-50"
                            onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=Pet' }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                            <p className="text-xs text-slate-500">Qty: {item.quantity} · ₱{item.price.toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 sm:p-6 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                      <p className="text-xs text-slate-500">Ordered on {new Date(order.orderDate).toLocaleDateString()}</p>
                      <div className="flex gap-2 w-full sm:w-auto">
                        {order.delivery && ['rider_assigned', 'picked_up', 'in_transit'].includes(order.status) && (
                          <Link to={`/track/${order.delivery.trackingToken}`} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-rose-100 hover:bg-rose-600 transition-colors animate-pulse">
                            <MapPin className="h-4 w-4" /> Live Track
                          </Link>
                        )}
                        <Link to={`/orders/${order._id}`} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-slate-800 transition-colors">
                          <Eye className="h-4 w-4" /> Details
                        </Link>
                        {order.status === 'delivered' && !order.reviewStatus?.isRated && (
                          <button 
                            onClick={() => setRatingOrder(order)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                          >
                            <Star className="h-4 w-4 text-secondary-500" /> Review
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <button
                onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
                disabled={!pagination.hasPrev}
                className="p-2 border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-medium">Page {pagination.currentPage} of {pagination.totalPages}</span>
              <button
                onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
                disabled={!pagination.hasNext}
                className="p-2 border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      ) : activeTab === 'pets' ? (
        <Adoptions isSubcomponent={true} />
      ) : (
        <Bookings isSubcomponent={true} />
      )}

      {ratingOrder && (
        <ReviewModal
            isOpen={!!ratingOrder}
            onClose={() => setRatingOrder(null)}
            targetType="Store"
            targetId={ratingOrder.store?._id || ratingOrder.store}
            targetName={ratingOrder.store?.name || 'Shop'}
            orderId={ratingOrder._id}
            onReviewSubmitted={() => {
                fetchOrders();
                setRatingOrder(null);
            }}
        />
      )}
    </div>
  );
};

export default Orders;
