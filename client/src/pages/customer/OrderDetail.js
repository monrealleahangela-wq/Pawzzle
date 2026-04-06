import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { orderService, adminOrderService, paymentService, deliveryService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { Heart, Package, ArrowLeft, Truck, CreditCard, MapPin, Store, Star, CheckCircle, AlertCircle, Link2, Navigation } from 'lucide-react';
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
  const [hasAutoReviewed, setHasAutoReviewed] = useState(false);

  useEffect(() => {
    if (order && !hasAutoReviewed && new URLSearchParams(location.search).get('review') === 'true') {
      if (order?.items?.length === 1) {
        setReviewItem(order.items[0]);
        setIsReviewModalOpen(true);
      } else if (order?.items?.length > 1) {
        const headings = Array.from(document.querySelectorAll('h2'));
        const itemHeading = headings.find(h => h.textContent.includes('Order Items'));
        if (itemHeading) {
          itemHeading.scrollIntoView({ behavior: 'smooth' });
          toast.info('Please select which item you want to review below!', { icon: '⭐' });
        }
      }
      setHasAutoReviewed(true);
      // Clean up the URL
      const newPath = window.location.pathname;
      window.history.replaceState(null, '', newPath);
    }
  }, [order, location.search, hasAutoReviewed]);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('payment') === 'success') {
      toast.success('Payment authorized. Verifying payment status...');
      paymentService.verifyPayment(id).then(res => {
        if (res.data.status === 'paid') {
          toast.success('Payment successfully verified!');
          fetchOrder(); // Reload the order fully
        } else {
          toast.info('Payment is still processing. Check back soon.');
        }
      }).catch(err => {
        console.error('Payment verification error', err);
      });
    } else if (queryParams.get('payment') === 'cancelled') {
      toast.warning('Payment was cancelled.');
    }
  }, [location.search, id]);

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
  
  const handleGenerateRiderLink = async () => {
    try {
      const response = await deliveryService.generateLinks(id);
      const url = response.data.riderLink;
      
      // Attempt copy to clipboard
      navigator.clipboard.writeText(url);
      toast.success('Rider Link Generated & Copied!', {
        description: 'You can now share this secure link with the rider.',
        icon: <Link2 className="text-primary-600" />
      });
      fetchOrder(); // Refresh to show delivery status if needed
    } catch (error) {
      toast.error('Failed to generate tracking link');
    }
  };

  const handleViewLiveTracking = async () => {
    try {
      const response = await deliveryService.getTrackingForOrder(id);
      if (response.data.delivery?.riderToken) {
        navigate(`/rider-track/${response.data.delivery.riderToken}`);
      }
    } catch (error) {
      toast.error('No active tracking found for this order');
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
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
              {user?.role === 'customer' ? 'Order ID' : 'Order Reference'}: {order.orderNumber}
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Placed on {new Date(order.orderDate).toLocaleDateString(undefined, { dateStyle: 'long' })}
            </p>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <span className={`inline-flex px-4 py-1 rounded-2xl text-[10px] font-black uppercase tracking-widest ${getStatusColor(order.status)} border shadow-sm`}>
              {order.status.replace('_', ' ')}
            </span>
            <p className="text-2xl font-black text-slate-900 tracking-tighter">
              ₱{order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary-600" />
              {user?.role === 'customer' ? 'Payment Summary' : 'Payment Information'}
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
                ['gcash', 'maya', 'bank_transfer'].includes(order.paymentMethod) && (
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

              {/* Manual Refresh Status Button if Pending */}
              {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && order.paymentDetails?.sessionId && (
                <button
                  onClick={async () => {
                    const toastId = toast.loading('Verifying payment with PayMongo...');
                    try {
                      const res = await paymentService.verifyPayment(order._id);
                      if (res.data.status === 'paid') {
                        toast.update(toastId, { render: 'Payment verified successfully!', type: 'success', isLoading: false, autoClose: 3000 });
                        fetchOrder();
                      } else {
                        toast.update(toastId, { render: 'Payment is still pending on PayMongo.', type: 'info', isLoading: false, autoClose: 3000 });
                      }
                    } catch (error) {
                      toast.update(toastId, { render: 'Failed to verify payment status.', type: 'error', isLoading: false, autoClose: 3000 });
                    }
                  }}
                  className="w-full mt-2 py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all shadow-sm flex items-center justify-center gap-2 group border border-slate-200"
                >
                  <AlertCircle className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
                  Refresh Payment Status
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
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-6 leading-relaxed">
                This order has been successfully delivered. Please take a moment to review the items to help other customers and help us improve.
              </p>
              
              <div className="space-y-3">
                <div className="p-4 bg-white rounded-2xl border border-emerald-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Star className="h-5 w-5 text-amber-400 fill-current" />
                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Feedback Requested</span>
                    </div>
                </div>

                {user?.role === 'customer' && (
                  <button 
                    onClick={() => {
                        if (order.items.length === 1) {
                            openReviewModal(order.items[0]);
                        } else {
                            // More robust way to find the items heading
                            const headings = Array.from(document.querySelectorAll('h2'));
                            const itemHeading = headings.find(h => h.textContent.includes('Order Items'));
                            if (itemHeading) {
                                itemHeading.scrollIntoView({ behavior: 'smooth' });
                                toast.info('Please select which item you want to review below!', { icon: '⭐' });
                            } else {
                                window.scrollTo({ top: 300, behavior: 'smooth' });
                            }
                        }
                    }}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl hover:scale-[1.02] flex items-center justify-center gap-2 group"
                  >
                    <Star className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                    Write a Review Now
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Customer Live Tracking Action */}
          {user?.role === 'customer' && order.deliveryMethod === 'delivery' && order.delivery && order.status !== 'cancelled' && order.status !== 'delivered' && (
            <div className="card p-6 border-2 border-primary-500 bg-primary-900 text-white shadow-2xl shadow-primary-200 overflow-hidden relative">
              <div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse" />
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center border border-white/20">
                    <Truck className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tighter leading-none mb-1">Live Tracking</h2>
                    <p className="text-[10px] font-bold text-primary-200 uppercase tracking-widest leading-none">Rider Dispatched & En Route</p>
                  </div>
                </div>
                <p className="text-[11px] text-primary-100 font-bold uppercase tracking-widest leading-relaxed opacity-80">
                  Track your pet or products in real-time with our high-precision GPS tracking system. See your rider's exact location on the map.
                </p>
                <button
                  onClick={() => {
                    // We need the tracking token for the customer
                    deliveryService.getTrackingForOrder(order._id).then(res => {
                      if (res.data.delivery?.trackingToken) {
                        navigate(`/track/${res.data.delivery.trackingToken}`);
                      }
                    });
                  }}
                  className="w-full py-4 bg-white text-primary-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-900 hover:text-white transition-all shadow-xl flex items-center justify-center gap-2 group"
                >
                  <Navigation className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                  View Live Map Now
                </button>
              </div>
            </div>
          )}
          {user?.role !== 'customer' && order.deliveryMethod === 'delivery' && order.status !== 'cancelled' && order.status !== 'delivered' && (
            <div className="card p-6 border-2 border-primary-100 bg-primary-50/10">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary-600" />
                Dispatch Control
              </h2>
              <div className="space-y-4">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                  Generate link for rider only if delivery is selected. This link provides the rider with pinpoint GPS navigation to the customer.
                </p>
                <button
                  onClick={handleGenerateRiderLink}
                  className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg flex items-center justify-center gap-2 group ${order.delivery ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-900 text-white hover:bg-primary-600'}`}
                >
                  <Link2 className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                  {order.delivery ? 'Copy Rider Tracking Link' : 'Generate Delivery Link'}
                </button>
                {order.delivery && (
                  <>
                    <button
                      onClick={handleViewLiveTracking}
                      className="w-full py-4 bg-white border-2 border-slate-900 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-900 hover:text-white transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      <Navigation className="h-4 w-4" />
                      View Live Map (Seller)
                    </button>
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Link Active & Secure</span>
                    </div>
                  </>
                )}
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
