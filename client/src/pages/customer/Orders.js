import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { orderService, getImageUrl } from '../../services/apiService';
import { ShoppingBag, Eye, Clock, Package, Truck, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight, ArrowRight, Star, Heart, Calendar, Receipt } from 'lucide-react';
import ReviewModal from '../../components/ReviewModal';
import Adoptions from './Adoptions';
import Bookings from './Bookings';

/* ── Order progress steps ── */
const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

const STATUS_META = {
  pending: { label: 'Pending', color: 'amber', icon: Clock, dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmed', color: 'primary', icon: CheckCircle, dot: 'bg-primary-600' },
  processing: { label: 'Processing', color: 'sky', icon: Package, dot: 'bg-sky-500' },
  shipped: { label: 'Shipped', color: 'violet', icon: Truck, dot: 'bg-violet-500' },
  delivered: { label: 'Delivered', color: 'emerald', icon: CheckCircle, dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', color: 'rose', icon: XCircle, dot: 'bg-rose-500' },
};

const FILTER_TABS = ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

const ProgressBar = ({ status }) => {
  const currentIdx = STATUS_STEPS.indexOf(status);
  if (status === 'cancelled') return (
    <div className="flex items-center gap-2 mt-4">
      <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
      <div className="flex-1 h-1.5 bg-rose-100 rounded-full relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-full bg-rose-400 rounded-full" />
      </div>
      <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest shrink-0">Cancelled</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 mt-4">
      {STATUS_STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        const meta = STATUS_META[step];
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 transition-all flex items-center justify-center
                ${done ? `${meta.dot} border-transparent scale-110` : 'bg-white border-slate-200'}`}>
                {done && active && <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white animate-ping-slow" />}
              </div>
              <span className={`text-[6px] font-black uppercase tracking-widest hidden sm:block ${done ? 'text-slate-600' : 'text-slate-300'}`}>
                {meta.label.slice(0, 4)}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className="flex-1 h-0.5 sm:h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${i < currentIdx ? 'bg-primary-500 w-full' : 'w-0'}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const Orders = () => {
  const [activeTransactionTab, setActiveTransactionTab] = useState('orders'); // 'orders' | 'pets' | 'bookings'
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState('all');
  const [ratingOrder, setRatingOrder] = useState(null);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false });

  useEffect(() => { fetchOrders(); }, [pagination.currentPage]);

  const fetchOrders = async () => {
    try {
      const response = await orderService.getAllOrders({ page: pagination.currentPage, limit: 20 });
      const fetched = response.data.orders || [];
      setAllOrders(fetched);
      setOrders(fetched);
      setPagination(response.data.pagination || pagination);
    } catch (e) { console.error('Error fetching orders:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setOrders(filterTab === 'all' ? allOrders : allOrders.filter(o => o.status === filterTab));
  }, [filterTab, allOrders]);

  if (loading) return (
    <div className="space-y-4 pb-20">
      <div className="h-20 bg-slate-100 rounded-[2rem] animate-pulse" />
      {[1, 2, 3].map(i => <div key={i} className="h-52 bg-slate-100 rounded-[2.5rem] animate-pulse" />)}
    </div>
  );

  /* count per status for tabs */
  const countOf = (tab) => tab === 'all' ? allOrders.length : allOrders.filter(o => o.status === tab).length;

    return (
        <div className="space-y-10 pb-32 relative overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary-100/30 blur-[120px] rounded-full animate-pulse pointer-events-none" />
            <div className="absolute bottom-[10%] left-[-10%] w-[50%] h-[50%] bg-secondary-100/20 blur-[150px] rounded-full pointer-events-none" />

            {/* ── Header ── */}
            <header className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8 px-1">
                <div className="space-y-2">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="px-3 py-1 bg-primary-600 text-white text-[8px] font-black uppercase tracking-[0.3em] rounded-full shadow-lg shadow-primary-200">System Secure</div>
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em]">Central Dashboard</p>
                    </div>
                    <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black text-slate-900 uppercase tracking-tighter leading-[0.85]">
                        Transaction <span className="text-primary-600 italic">Vault</span>
                    </h1>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] max-w-md leading-relaxed border-l-2 border-primary-500 pl-4 mt-4">
                        A secure, centralized repository of your tactical acquisitions, adoptions, and service schedule manifests.
                    </p>
                </div>
                {activeTransactionTab === 'orders' && (
                    <Link to="/products" className="group h-fit px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 hover:bg-primary-600 hover:-translate-y-1 active:scale-95 transition-all flex items-center gap-3 w-fit">
                        Initiate Procurement <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                )}
                {activeTransactionTab === 'pets' && (
                    <Link to="/pets" className="group h-fit px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 hover:bg-primary-600 hover:-translate-y-1 active:scale-95 transition-all flex items-center gap-3 w-fit">
                        Incorporate Assets <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                )}
                {activeTransactionTab === 'bookings' && (
                    <Link to="/services" className="group h-fit px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 hover:bg-primary-600 hover:-translate-y-1 active:scale-95 transition-all flex items-center gap-3 w-fit">
                        Book Service <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                )}
            </header>

            {/* ── Main Sub-Tabs ── */}
            <div className="relative z-10 flex gap-4 overflow-x-auto pb-6 pt-2 border-b border-slate-100 no-scrollbar">
                {[
                    { id: 'orders', label: 'Order History', icon: Receipt },
                    { id: 'pets', label: 'Purchased Pets', icon: Heart },
                    { id: 'bookings', label: 'Booking History', icon: Calendar }
                ].map((tab) => {
                    const active = activeTransactionTab === tab.id;
                    return (
                        <button key={tab.id} onClick={() => setActiveTransactionTab(tab.id)}
                            className={`flex items-center gap-2.5 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-2 shrink-0 ${active
                                ? 'bg-slate-900 text-white border-slate-900 shadow-[0_15px_30px_-10px_rgba(15,23,42,0.3)]'
                                : 'bg-white/50 backdrop-blur-md text-slate-500 border-transparent hover:border-slate-200 hover:bg-white/80'}
                            `}>
                            <tab.icon className={`h-4 w-4 ${active ? 'text-primary-400' : 'text-slate-400'}`} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab Content Container ── */}
            <div className="relative z-10">
                {activeTransactionTab === 'orders' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* ── Filter Tabs ── */}
                        <div className="flex gap-3 overflow-x-auto pb-4 pt-2 no-scrollbar">
                            {FILTER_TABS.map(tab => {
                                const meta = STATUS_META[tab] || { label: 'All', dot: 'bg-slate-400' };
                                const active = filterTab === tab;
                                return (
                                    <button key={tab} onClick={() => setFilterTab(tab)}
                                        className={`flex items-center gap-3 px-6 py-3.5 rounded-[1.8rem] text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-2 shrink-0 ${active
                                            ? 'bg-white text-slate-900 border-primary-500 shadow-md'
                                            : 'bg-white/80 backdrop-blur-md text-slate-500 border-slate-100 hover:border-slate-300 hover:bg-white'
                                            }`}>
                                        <span className={`w-2 h-2 rounded-full ${active ? 'bg-primary-500 animate-pulse' : meta.dot}`} />
                                        {tab === 'all' ? 'All Orders' : meta.label}
                                        <span className={`ml-1 px-2 py-0.5 rounded-lg text-[8px] font-black ${active ? 'bg-primary-50 text-primary-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {countOf(tab).toString().padStart(2, '0')}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
            
                        {/* ── Orders List ── */}
            {orders.length === 0 ? (
                <div className="relative z-10 flex flex-col items-center py-32 text-center bg-white/60 backdrop-blur-xl rounded-[4rem] border-2 border-dashed border-slate-200 shadow-sm overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-50/50 to-transparent pointer-events-none" />
                    <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl group-hover:scale-110 transition-transform duration-700 border border-slate-100">
                        <ShoppingBag className="h-10 w-10 text-slate-300" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4 relative z-10">
                        {filterTab === 'all' ? 'Vault Depleted' : `No ${STATUS_META[filterTab]?.label} Logs`}
                    </h2>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] mb-12 max-w-xs relative z-10 leading-relaxed">
                        {filterTab === 'all' ? 'Your tactical acquisition history is currently empty. Begin exploration to fill the vault.' : `No transaction logs matching the ${filterTab} status were detected.`}
                    </p>
                    <Link to="/products" className="relative z-10 px-12 py-5 bg-primary-600 text-white rounded-[2rem] text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-primary-600/30 hover:bg-primary-700 hover:scale-105 active:scale-95 transition-all">
                        Begin Exploration
                    </Link>
                </div>
            ) : (
        <div className="space-y-4">
          {orders.map((order, idx) => {
            const meta = STATUS_META[order.status] || STATUS_META['pending'];
            const StatusIcon = meta.icon;
            return (
              <div key={order._id}
                className="group bg-white rounded-[2.5rem] border border-slate-100 p-6 sm:p-8 shadow-sm hover:shadow-2xl hover:-translate-y-0.5 transition-all relative overflow-hidden animate-card-appear"
                style={{ animationDelay: `${idx * 0.07}s` }}>

                {/* Corner accent */}
                <div className="absolute top-0 right-0 w-28 h-28 bg-slate-50 rounded-bl-[3.5rem] -translate-y-12 translate-x-12 group-hover:bg-primary-50 transition-colors duration-500 pointer-events-none" />

                {/* Top row */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative z-10">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <h3 className="text-base sm:text-xl font-black text-slate-900 uppercase tracking-tight leading-none">
                        #{order.orderNumber?.slice(-10).toUpperCase()}
                      </h3>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border
                        bg-${meta.color}-50 text-${meta.color}-600 border-${meta.color}-100`}>
                        <StatusIcon className="h-3 w-3" />
                        {meta.label}
                      </div>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                      {new Date(order.orderDate).toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      &nbsp;·&nbsp;
                      {new Date(order.orderDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total</p>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter leading-none">
                      ₱{(order.totalAmount || 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="relative z-10">
                  <ProgressBar status={order.status} />
                </div>

                {/* Items manifest */}
                <div className="mt-6 bg-slate-50/60 rounded-[1.8rem] p-4 sm:p-5 border border-slate-100 relative z-10">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Asset Manifest</p>
                  <div className="space-y-3">
                    {(order.items || []).slice(0, 3).map((item, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                          {item.image
                            ? <img src={getImageUrl(item.image)} alt="" className="w-full h-full object-cover" />
                            : <ShoppingBag className="h-5 w-5 text-slate-200" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight truncate">{item.name}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">×{item.quantity} · {item.itemType}</p>
                        </div>
                        <span className="text-[11px] font-black text-slate-900 tracking-tighter shrink-0">₱{(item.price * item.quantity).toLocaleString()}</span>
                      </div>
                    ))}
                    {(order.items || []).length > 3 && (
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-14">
                        +{order.items.length - 3} more items
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 border-t border-slate-50 relative z-10">
                  <div className="flex gap-6 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                    <div className="flex flex-col gap-0.5">
                      <span className="opacity-60">Method</span>
                      <span className="text-slate-700">{order.deliveryMethod || 'Standard'}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="opacity-60">Destination</span>
                      <span className="text-slate-700 truncate max-w-[120px]">
                        {order.deliveryMethod === 'pickup' ? 'Store Pickup' : order.shippingAddress?.city || '—'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {order.status === 'delivered' && !order.reviewStatus?.isRated && (
                      <button 
                        onClick={() => setRatingOrder(order)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-emerald-50 text-emerald-600 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                      >
                        <Star className="h-4 w-4" /> Rate Transaction
                      </button>
                    )}
                    <Link to={`/orders/${order._id}`}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-primary-600 transition-all active:scale-95">
                      <Eye className="h-4 w-4" /> Inspect
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-3">
          <button
            onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
            disabled={!pagination.hasPrev}
            className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 rounded-xl text-slate-600 hover:border-slate-300 disabled:opacity-30 transition-all shadow-sm">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-4">
            Page {pagination.currentPage} / {pagination.totalPages}
          </span>
          <button
            onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
            disabled={!pagination.hasNext}
            className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 rounded-xl text-slate-600 hover:border-slate-300 disabled:opacity-30 transition-all shadow-sm">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
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
                )}

                {activeTransactionTab === 'pets' && (
                    <div className="animate-fade-in w-full">
                        <Adoptions isSubcomponent={true} />
                    </div>
                )}

                {activeTransactionTab === 'bookings' && (
                    <div className="animate-fade-in w-full">
                        <Bookings isSubcomponent={true} />
                    </div>
                )}
            </div>
    </div>
  );
};

export default Orders;
