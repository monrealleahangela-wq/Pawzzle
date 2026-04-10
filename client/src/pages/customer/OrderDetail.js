import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { orderService, adminOrderService, paymentService, deliveryService, reviewService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { Heart, Package, ArrowLeft, Truck, CreditCard, MapPin, Store, Star, CheckCircle, AlertCircle, Link2, Navigation, Phone, Activity, ChevronDown, ChevronUp, MessageSquare, FileText, Share2, ClipboardCheck } from 'lucide-react';
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
  const [reviews, setReviews] = useState([]);
  const [isShippingCollapsed, setIsShippingCollapsed] = useState(user?.role !== 'customer');
  const [isPaymentCollapsed, setIsPaymentCollapsed] = useState(user?.role !== 'customer');
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(user?.role !== 'customer');
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

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
      const orderData = response.data.order;
      setOrder(orderData);
      
      // Fetch reviews if user is a seller and order is delivered/completed/finalized
      if (user?.role !== 'customer' && ['delivered', 'completed', 'finalized'].includes(orderData.status)) {
        fetchOrderReviews(orderData);
      }
    } catch (error) {
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderReviews = async (orderData) => {
    try {
      const reviewsData = [];
      for (const item of orderData.items) {
        const response = await reviewService.getTargetReviews(item.itemType, item.itemId);
        const itemReviews = response.data.reviews.filter(r => r.orderId === orderData._id || r.customer?._id === orderData.customer?._id);
        reviewsData.push(...itemReviews);
      }
      setReviews(reviewsData);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    }
  };

  const status = order?.status;

  const handleFinalizeOrder = async () => {
    try {
      await adminOrderService.updateOrderStatus(id, { status: 'finalized' });
      toast.success('Order finalized successfully');
      fetchOrder();
    } catch (error) {
      toast.error('Failed to finalize order');
    }
  };

  const handleGenerateInvoice = async () => {
    setIsGeneratingInvoice(true);
    toast.info('Generating invoice...', { autoClose: 2000 });
    
    // Simulate invoice generation
    setTimeout(() => {
      setIsGeneratingInvoice(false);
      const invoiceData = `
        PAWZZLE INVOICE
        Order ID: ${order.orderNumber}
        Date: ${new Date(order.orderDate).toLocaleDateString()}
        Customer: ${order.customer?.firstName} ${order.customer?.lastName}
        Total Amount: ₱${order.totalAmount.toLocaleString()}
        Status: ${order.status.toUpperCase()}
      `;
      const blob = new Blob([invoiceData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice-${order.orderNumber}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Invoice generated and downloaded!');
    }, 2000);
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

  const handleResolveComplaint = async (deliveryId, complaintId) => {
    try {
      await deliveryService.resolveComplaint(deliveryId, complaintId);
      toast.success('Complaint marked as resolved');
      fetchOrder();
    } catch (error) {
      toast.error('Failed to resolve complaint');
    }
  };

  const handleViewLiveTracking = async () => {
    try {
      const response = await deliveryService.getTrackingForOrder(id);
      if (response.data.delivery?.trackingToken) {
        navigate(`/track/${response.data.delivery.trackingToken}`);
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
      pending: 'bg-secondary-100 text-primary-800',
      confirmed: 'bg-primary-100 text-primary-800',
      processing: 'bg-secondary-100 text-secondary-800',
      shipped: 'bg-primary-100 text-primary-800',
      delivered: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      finalized: 'bg-slate-900 text-white',
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
        {/* Order Items & Revenue Breakdown */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Order Items</h2>
            {user?.role !== 'customer' && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Revenue Breakdown</span>
            )}
          </div>
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

                  {user?.role === 'customer' && order.status === 'delivered' && (
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
                <div className="text-right">
                  <span className="hidden sm:block font-black text-slate-900">
                    ₱{(item.price * item.quantity).toLocaleString()}
                  </span>
                  {user?.role !== 'customer' && (
                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mt-1">
                      +₱{(item.price * item.quantity * 0.9).toLocaleString()} Net
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Transaction Summary for Sellers */}
          {user?.role !== 'customer' && (
            <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-primary-600" />
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Financial Summary</h3>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <span>Subtotal</span>
                  <span className="text-slate-900">₱{(order.totalAmount - order.shippingFee + order.discountAmount).toLocaleString()}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-rose-500">
                    <span>Voucher Discount</span>
                    <span>-₱{order.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <span>Shipping Fee</span>
                  <span className="text-slate-900">₱{order.shippingFee.toLocaleString()}</span>
                </div>
                <div className="pt-3 border-t border-slate-200 flex justify-between items-end">
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Earnings</p>
                    <p className="text-xl font-black text-primary-600 tracking-tighter leading-none">
                      ₱{order.totalAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Method</p>
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">
                      {order.paymentMethod?.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
              </div>
              
              {order.paymentDetails?.referenceNumber && (
                <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Ref Number</span>
                  <span className="text-[10px] font-black text-slate-900 select-all font-mono uppercase">{order.paymentDetails.referenceNumber}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order Details */}
        <div className="space-y-6">
          {/* Delivery Information - Collapsible for Sellers */}
          <div className="card overflow-hidden">
            <button 
              onClick={() => user?.role !== 'customer' && setIsShippingCollapsed(!isShippingCollapsed)}
              className={`w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors ${user?.role !== 'customer' ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary-600" />
                {order.deliveryMethod === 'pickup' ? 'Pickup Info' : 'Shipping Address'}
              </h2>
              {user?.role !== 'customer' && (
                isShippingCollapsed ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />
              )}
            </button>
            
            <div className={`px-6 pb-6 space-y-1 text-sm ${user?.role !== 'customer' && isShippingCollapsed ? 'hidden' : 'block'}`}>
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
                    <div className="space-y-3">
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
                      
                      <Link
                        to={`/find-shops?store=${order.store._id}`}
                        className="w-full py-3 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-700 transition-all shadow-lg flex items-center justify-center gap-2 group"
                      >
                        <Navigation className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                        Open Shop GPS (Internal)
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Address information currently unavailable.</p>
                  )}
                  <p className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg inline-block uppercase tracking-widest">
                    Bring your Order ID: {order.orderNumber}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-black text-slate-900 uppercase">{order.customer?.firstName} {order.customer?.lastName}</p>
                  <p className="text-slate-600 font-medium">{order.shippingAddress?.street || 'No street specified'}</p>
                  <p className="text-slate-600 font-medium">
                    {order.shippingAddress?.city || 'No city'}, {order.shippingAddress?.province || order.shippingAddress?.state || 'No province'} {order.shippingAddress?.zipCode || ''}
                  </p>
                  <p className="text-slate-600 font-medium">{order.shippingAddress?.country || 'Philippines'}</p>
                  
                  {user?.role !== 'customer' && (
                    <div className="flex gap-2 mt-4">
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.shippingAddress?.street}, ${order.shippingAddress?.city}, Philippines`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <MapPin className="h-4 w-4" />
                        Directions
                      </a>
                      <button 
                        onClick={() => navigate(`/admin/chat?userId=${order.customer?._id}`)}
                        className="flex-1 py-3 bg-primary-100 text-primary-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Message
                      </button>
                    </div>
                  )}
                </div>
              )}
              {order.phoneNumber && (
                <p className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-xl text-orange-900 font-black flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {order.phoneNumber}
                </p>
              )}
            </div>
          </div>

          {/* Payment Information - Collapsible for Sellers */}
          <div className="card overflow-hidden">
            <button 
              onClick={() => user?.role !== 'customer' && setIsPaymentCollapsed(!isPaymentCollapsed)}
              className={`w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors ${user?.role !== 'customer' ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary-600" />
                {user?.role === 'customer' ? 'Payment Summary' : 'Payment Information'}
              </h2>
              {user?.role !== 'customer' && (
                isPaymentCollapsed ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />
              )}
            </button>
            
            <div className={`px-6 pb-6 space-y-4 text-sm ${user?.role !== 'customer' && isPaymentCollapsed ? 'hidden' : 'block'}`}>
              <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Method</span>
                <span className="font-black text-slate-900 uppercase">{order.paymentMethod?.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Status</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${order.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary-100 text-primary-700'}`}>
                  {order.paymentStatus?.replace(/_/g, ' ')}
                </span>
              </div>

              {user?.role === 'customer' && order.paymentStatus !== 'paid' &&
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

              {user?.role !== 'customer' && order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                <button
                  onClick={handleConfirmPayment}
                  className="w-full mt-2 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2 group"
                >
                  <CheckCircle className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  Confirm Payment (Admin)
                </button>
              )}

              {order.paymentDetails?.sessionId && order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
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

          {/* Order Actions for Customers (Pending) */}
          {user?.role === 'customer' && order.status === 'pending' && order.paymentStatus !== 'paid' && (
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

          {/* Key Actions for Sellers (Post-Delivery Operations) */}
          {user?.role !== 'customer' && ['delivered', 'completed', 'finalized'].includes(order.status) && (
            <div className="card p-6 border-2 border-primary-500 bg-primary-50/5 shadow-2xl shadow-primary-100">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                  <div className="p-2 bg-primary-600 text-white rounded-xl shadow-lg">
                    <ClipboardCheck className="h-6 w-6" />
                  </div>
                  Seller Operations
                </h2>
                <span className="text-[10px] font-black text-primary-600 bg-primary-100 px-3 py-1 rounded-full uppercase tracking-widest">
                  Post-Delivery Sync
                </span>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {order.status !== 'finalized' && (
                  <button
                    onClick={handleFinalizeOrder}
                    className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl flex items-center justify-center gap-3 group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                    <CheckCircle className="h-5 w-5 group-hover:scale-110 transition-transform" />
                    Mark Order as Finalized
                  </button>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handleGenerateInvoice}
                    disabled={isGeneratingInvoice}
                    className="py-4 bg-white border-2 border-slate-200 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-primary-600 hover:text-primary-600 transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <FileText className="h-5 w-5" />
                    {isGeneratingInvoice ? 'Drafting...' : 'Invoice/Receipt'}
                  </button>
                  <button
                    onClick={() => {
                        const feedbackSection = document.getElementById('feedback-section');
                        if (feedbackSection) feedbackSection.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="py-4 bg-white border-2 border-slate-200 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-primary-600 hover:text-primary-600 transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Star className="h-5 w-5" />
                    View Feedback
                  </button>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => navigate(`/admin/chat?userId=${order.customer?._id}`)}
                    className="w-full py-4 bg-primary-100 text-primary-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 hover:text-white transition-all flex items-center justify-center gap-2 group"
                  >
                    <MessageSquare className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                    Chat with Customer
                  </button>
                  <p className="text-[9px] font-bold text-slate-400 text-center mt-3 uppercase tracking-[0.2em]">
                    Reference ID: #{order.orderNumber} • Placed {new Date(order.orderDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Customer Feedback Card (Only for Customers) */}
          {user?.role === 'customer' && order.status === 'delivered' && (
            <div className="card p-6 border-2 border-emerald-100 bg-emerald-50/20">
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Order Completed
              </h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-6 leading-relaxed">
                This order has been successfully delivered. Please take a moment to review the items to help our community improve.
              </p>
              
              <button 
                onClick={() => {
                    if (order.items.length === 1) {
                        openReviewModal(order.items[0]);
                    } else {
                        const headings = Array.from(document.querySelectorAll('h2'));
                        const itemHeading = headings.find(h => h.textContent.includes('Order Items'));
                        if (itemHeading) {
                            itemHeading.scrollIntoView({ behavior: 'smooth' });
                            toast.info('Please select an item to review below!', { icon: '⭐' });
                        }
                    }
                }}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl flex items-center justify-center gap-2"
              >
                <Star className="h-4 w-4" />
                Write a Review
              </button>
            </div>
          )}

          {/* Enhanced Delivery & Complaint Tracking - Collapsible for Sellers */}
          {order.deliveryMethod === 'delivery' && order.delivery && (
            <div className={`card overflow-hidden border-2 ${order.delivery.complaints?.some(c => c.status === 'pending') ? 'border-rose-100 shadow-rose-50' : 'border-slate-100'}`}>
              <button 
                onClick={() => user?.role !== 'customer' && setIsTimelineCollapsed(!isTimelineCollapsed)}
                className={`w-full p-6 flex justify-between items-center bg-slate-50 border-b border-slate-100 hover:bg-slate-100 transition-colors ${user?.role !== 'customer' ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary-600" />
                  Delivery Timeline
                </h2>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${order.delivery.isRiderVerified ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {order.delivery.isRiderVerified ? 'Rider Verified' : 'Awaiting Rider'}
                  </span>
                  {user?.role !== 'customer' && (
                    isTimelineCollapsed ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />
                  )}
                </div>
              </button>

              <div className={user?.role !== 'customer' && isTimelineCollapsed ? 'hidden' : 'block'}>
                <div className="p-6 space-y-4">
                  {order.delivery.riderName && (
                    <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black">
                        {order.delivery.riderName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Assigned Rider</p>
                        <p className="text-sm font-black text-slate-900 truncate uppercase">{order.delivery.riderName}</p>
                      </div>
                      {user?.role !== 'customer' && order.delivery.riderPhone && (
                        <a href={`tel:${order.delivery.riderPhone}`} className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 hover:bg-rose-50 hover:text-rose-500 transition-all">
                          <Phone className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  )}
                  
                  {order.delivery.deliveredAt && (
                    <div className="p-5 bg-emerald-50 border-2 border-emerald-100 rounded-2xl flex flex-col gap-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3">
                        <CheckCircle className="h-10 w-10 text-emerald-100 rotate-12" />
                      </div>
                      <div className="flex items-center gap-3 relative z-10">
                        <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-sm">
                          <ClipboardCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.15em]">Delivery Verification</p>
                          <p className="text-sm font-black text-emerald-700 uppercase tracking-tighter">
                            Delivered at {new Date(order.delivery.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(order.delivery.deliveredAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      {order.delivery.proofOfDelivery?.photo && (
                        <div className="mt-2 space-y-2 relative z-10">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <FileText className="h-3 w-3" />
                            Registered Visual Proof
                          </p>
                          <img 
                            src={getImageUrl(order.delivery.proofOfDelivery.photo)} 
                            alt="Proof of Delivery" 
                            className="w-full h-48 object-cover rounded-xl border border-white shadow-md"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {order.delivery.riderVehicleInfo && (
                    <div className="flex items-center gap-2 px-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <Activity className="h-3.5 w-3.5 text-primary-500" />
                      Transport: {order.delivery.riderVehicleInfo}
                    </div>
                  )}

                  {user?.role !== 'customer' && (
                    <div className="pt-2">
                      <button className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all border-2 border-rose-100 active:scale-95 flex items-center justify-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Report Delivery Issue
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Complaints List */}
              {order.delivery.complaints && order.delivery.complaints.length > 0 && (
                <div className="p-6 space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                    Reported Issues ({order.delivery.complaints.length})
                  </h3>
                  <div className="space-y-3">
                    {order.delivery.complaints.map((complaint) => (
                      <div key={complaint._id} className={`p-4 rounded-2xl border ${complaint.status === 'resolved' ? 'bg-emerald-50/30 border-emerald-100 opacity-60' : 'bg-rose-50/30 border-rose-100 shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${complaint.status === 'resolved' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {complaint.type.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${complaint.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {complaint.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed mb-3 italic">"{complaint.content}"</p>
                        <div className="flex justify-between items-center">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                            {new Date(complaint.createdAt).toLocaleString()}
                          </p>
                          {user?.role !== 'customer' && complaint.status === 'pending' && (
                            <button
                              onClick={() => handleResolveComplaint(order.delivery._id || order.delivery, complaint._id)}
                              className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-sm"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Mark Resolved
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Customer Live Tracking Action */}
          {user?.role === 'customer' && order.deliveryMethod === 'delivery' && order.delivery && (order.delivery.status === 'picked_up' || order.delivery.status === 'in_transit') && order.status !== 'cancelled' && order.status !== 'delivered' && (
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
                    if (order.delivery?.trackingToken) {
                      navigate(`/track/${order.delivery.trackingToken}`);
                    } else {
                      deliveryService.getTrackingForOrder(order._id).then(res => {
                        if (res.data.delivery?.trackingToken) {
                          navigate(`/track/${res.data.delivery.trackingToken}`);
                        }
                      });
                    }
                  }}
                  className="w-full py-4 bg-white text-primary-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-900 hover:text-white transition-all shadow-xl flex items-center justify-center gap-2 group"
                >
                  <Navigation className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                  View Live Map Now
                </button>
              </div>
            </div>
          )}
          {user?.role !== 'customer' && order.deliveryMethod === 'delivery' && !['cancelled', 'delivered', 'completed', 'finalized'].includes(order.status) && (
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

          {/* Feedback Section for Sellers */}
          {user?.role !== 'customer' && ['delivered', 'completed', 'finalized'].includes(order.status) && (
            <div id="feedback-section" className="card p-6 border-2 border-secondary-100 bg-secondary-50/10">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Star className="h-4 w-4 text-secondary-500" />
                Customer Feedback
              </h2>
              {reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review._id} className="p-4 bg-white rounded-2xl border border-secondary-100 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`h-3 w-3 ${i < review.rating ? 'text-secondary-400 fill-current' : 'text-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium italic mb-2">"{review.comment}"</p>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest">By: {review.customer?.firstName}</span>
                        <button 
                          onClick={() => navigate(`/admin/chat?userId=${order.customer?._id}`)}
                          className="text-[9px] font-black text-primary-600 uppercase tracking-widest hover:underline"
                        >
                          Reply via Chat →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Star className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No feedback received yet</p>
                </div>
              )}
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
