import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { orderService, adminOrderService, paymentService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { Heart, Package, ArrowLeft, Truck, CreditCard, MapPin, Store, Star, CheckCircle, AlertCircle } from 'lucide-react';
import OrderReviewModal from '../../components/OrderReviewModal';

const OrderDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewItem, setReviewItem] = useState(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('payment') === 'success') {
      toast.success('Payment successful! Your order is being processed.');
    } else if (queryParams.get('payment') === 'cancelled') {
      toast.warning('Payment was cancelled.');
    }
  }, [location.search]);

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    try {
      const response = await orderService.getOrderById(id);
      setOrder(response.data.order);
    } catch (error) {
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (window.confirm('Are you sure you want to cancel this order?')) {
      try {
        await orderService.cancelOrder(id);
        toast.success('Order cancelled successfully');
        fetchOrder(); // Refresh order details
      } catch (error) {
        toast.error('Failed to cancel order');
      }
    }
  };

  const handleConfirmPayment = async () => {
    try {
      await adminOrderService.confirmPayment(id);
      toast.success('Payment confirmed successfully');
      fetchOrder();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to confirm payment');
    }
  };

  const openReviewModal = (item) => {
    setReviewItem(item);
    setIsReviewModalOpen(true);
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-primary-100 text-primary-800',
      processing: 'bg-secondary-100 text-secondary-800',
      shipped: 'bg-primary-100 text-primary-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Order not found</h2>
        <Link to="/orders" className="btn btn-primary">
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/orders" className="flex items-center text-primary-600 hover:text-primary-700">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Orders
      </Link>

      {/* Order Header */}
      <div className="card p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
            <p className="text-gray-600">
              Placed on {new Date(order.orderDate).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.status)}`}>
              {order.status.replace('_', ' ')}
            </span>
            <p className="text-2xl font-bold text-gray-900 mt-2">
              ₱{order.totalAmount.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Items */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h2>
          <div className="space-y-4">
            {order.items.map((item, index) => (
              <div key={index} className="flex items-start gap-4 pb-4 border-b last:border-b-0 animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm border border-slate-100">
                  {item.image ? (
                    <img
                      src={getImageUrl(item.image)}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = item.itemType === 'pet' ? '/images/placeholder-pet.png' : '/images/placeholder-product.png';
                      }}
                    />
                  ) : (
                    item.itemType === 'pet' ? (
                      <Heart className="h-8 w-8 text-slate-200" />
                    ) : (
                      <Package className="h-8 w-8 text-slate-200" />
                    )
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-slate-900 uppercase text-sm sm:text-base truncate">{item.name}</h4>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                    {item.itemType} • {item.quantity} × ₱{item.price?.toLocaleString()}
                  </p>

                  {order.status === 'delivered' && (
                    <button
                      onClick={() => openReviewModal(item)}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1 bg-primary-100 text-primary-700 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 hover:text-white transition-all shadow-sm"
                    >
                      <Star className="h-3 w-3 fill-current" />
                      Review
                    </button>
                  )}

                  <div className="mt-2 block sm:hidden">
                    <span className="font-black text-primary-600">
                      ₱{(item.price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                </div>
                <span className="hidden sm:block font-black text-slate-900">
                  ₱{(item.price * item.quantity).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Order Details */}
        <div className="space-y-6">
          {/* Delivery Information */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              <Truck className="inline h-5 w-5 mr-2" />
              {order.deliveryMethod === 'pickup' ? 'Pickup Information' : 'Shipping Address'}
            </h2>
            <div className="space-y-1 text-sm">
              {order.deliveryMethod === 'pickup' ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary-50 rounded-lg">
                      <Store className="h-5 w-5 text-primary-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{order.store?.name || 'Store Pickup'}</p>
                      <p className="text-xs text-slate-500 uppercase font-black tracking-widest py-1">Pickup Location</p>
                    </div>
                  </div>

                  {order.store?.contactInfo?.address ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${order.store.contactInfo.address.street}, ${order.store.contactInfo.address.barangay}, ${order.store.contactInfo.address.city}, Cavite, Philippines`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary-200 hover:bg-primary-50 transition-all"
                    >
                      <MapPin className="h-5 w-5 text-slate-400 group-hover:text-primary-600 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-slate-700 group-hover:text-primary-900 transition-colors">
                          {order.store.contactInfo.address.street}, {order.store.contactInfo.address.barangay}, {order.store.contactInfo.address.city}
                        </p>
                        <p className="text-xs text-primary-600 font-bold mt-1 inline-flex items-center gap-1 group-hover:underline">
                          View on Google Maps →
                        </p>
                      </div>
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Address information currently unavailable.</p>
                  )}
                  <p className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg inline-block uppercase tracking-widest">
                    Bring your Order ID: {order.orderNumber}
                  </p>
                </div>
              ) : (
                <>
                  <p className="font-medium">{order.customer?.firstName} {order.customer?.lastName}</p>
                  <p>{order.shippingAddress?.street || 'No street specified'}</p>
                  <p>
                    {order.shippingAddress?.city || 'No city'}, {order.shippingAddress?.province || order.shippingAddress?.state || 'No province'} {order.shippingAddress?.zipCode || ''}
                  </p>
                  <p>{order.shippingAddress?.country || 'Philippines'}</p>
                </>
              )}
              {order.phoneNumber && (
                <p className="mt-2 text-gray-700"><strong>Contact:</strong> {order.phoneNumber}</p>
              )}
            </div>
          </div>

          {/* Payment Information */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              <CreditCard className="inline h-5 w-5 mr-2" />
              Payment Information
            </h2>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Method</span>
                <span className="font-black text-slate-900 uppercase">{order.paymentMethod?.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Status</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${order.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {order.paymentStatus?.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Pay Now Button for online payments that are not yet paid */}
              {order.paymentStatus !== 'paid' &&
                order.status !== 'cancelled' &&
                ['gcash', 'maya', 'credit_card', 'debit_card', 'dob', 'dob_ubp', 'card', 'paypal'].includes(order.paymentMethod) && (
                  <button
                    onClick={async () => {
                      try {
                        const response = await paymentService.createCheckoutSession(order._id);
                        if (response.data.checkoutUrl) {
                          window.location.href = response.data.checkoutUrl;
                        }
                      } catch (error) {
                        toast.error('Failed to initiate payment. Please try again.');
                      }
                    }}
                    className="w-full mt-2 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-lg flex items-center justify-center gap-2 group"
                  >
                    <CreditCard className="h-4 w-4 group-hover:scale-110 transition-transform" />
                    Proceed to Payment
                  </button>
                )}

              {/* Admin Manual Confirmation Button */}
              {user?.role !== 'customer' && order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                <button
                  onClick={handleConfirmPayment}
                  className="w-full mt-2 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2 group"
                >
                  <CheckCircle className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  Confirm Payment (Admin)
                </button>
              )}

              {order.trackingNumber && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Tracking #</span>
                  <span className="font-black text-slate-900 uppercase select-all">{order.trackingNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Order Actions */}
          {order.status === 'pending' && (
            <div className="card p-6 border-2 border-rose-100">
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-500" />
                Order Actions
              </h2>
              <button
                onClick={handleCancelOrder}
                className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm"
              >
                Cancel Order
              </button>
            </div>
          )}

          {order.status === 'delivered' && (
            <div className="card p-6 border-2 border-emerald-100 bg-emerald-50/20">
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Order Completed
              </h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-6">
                This order has been successfully delivered. Please take a moment to review the items to help other customers.
              </p>
              <div className="p-4 bg-white rounded-2xl border border-emerald-100 flex items-center gap-3">
                <Star className="h-5 w-5 text-amber-400 fill-current" />
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Feedback Requested</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Order Notes */}
      {order.notes && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Notes</h2>
          <p className="text-gray-700">{order.notes}</p>
        </div>
      )}
      <OrderReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        item={reviewItem}
        orderId={order._id}
        onReviewSubmitted={fetchOrder}
      />
    </div>
  );
};

export default OrderDetail;
