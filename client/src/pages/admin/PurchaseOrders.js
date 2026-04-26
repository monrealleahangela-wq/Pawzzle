import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  Truck, Package, Plus, ShoppingCart, X, Search, ChevronDown, Eye, Clock,
  Minus, CheckCircle, AlertTriangle, TrendingDown, Layers, Star, DollarSign
} from 'lucide-react';
import { supplierService, purchaseOrderService, getImageUrl, adminProductService } from '../../services/apiService';

const PurchaseOrders = () => {
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [storeProducts, setStoreProducts] = useState([]);
  const [productMapping, setProductMapping] = useState({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [ordRes, supRes, prodRes] = await Promise.all([
        purchaseOrderService.getAll(),
        supplierService.browse(),
        adminProductService.getAllProducts()
      ]);
      setOrders(ordRes.data.orders || []);
      setSuppliers(supRes.data.suppliers || []);
      setStoreProducts(prodRes.data?.products || prodRes.data || []);
    } catch (e) { console.error('Load error:', e); }
    finally { setLoading(false); }
  };

  const browseCatalog = async (supplierId) => {
    try {
      const res = await supplierService.getCatalog(supplierId);
      setCatalog(res.data);
      setShowCatalog(true);
      setCart([]);
    } catch (e) { toast.error('Failed to load catalog'); }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.supplierProductId === product._id);
      if (existing) return prev.map(i => i.supplierProductId === product._id ? { ...i, quantity: i.quantity + product.minimumOrderQuantity } : i);
      return [...prev, { supplierProductId: product._id, product, quantity: product.minimumOrderQuantity }];
    });
    toast.success(`${product.name} added to order`);
  };

  const updateCartQty = (productId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.supplierProductId === productId) {
        const newQty = Math.max(i.product.minimumOrderQuantity, i.quantity + delta);
        return { ...i, quantity: Math.min(newQty, i.product.availableStock) };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const submitOrder = async () => {
    if (!cart.length || !catalog?.supplier) return;
    try {
      const data = {
        supplierId: catalog.supplier._id,
        items: cart.map(i => ({
          supplierProductId: i.supplierProductId,
          quantity: i.quantity,
          storeProductId: productMapping[i.supplierProductId] || null
        }))
      };
      await purchaseOrderService.create(data);
      toast.success('Purchase order submitted!');
      setShowCheckout(false);
      setShowCatalog(false);
      setCart([]);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to submit order'); }
  };

  const cancelOrder = async (id) => {
    if (!window.confirm('Cancel this purchase order?')) return;
    try {
      await purchaseOrderService.cancel(id, { reason: 'Cancelled by seller' });
      toast.success('Order cancelled');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const confirmDelivery = async (id) => {
    try {
      await purchaseOrderService.confirmDelivery(id, {});
      toast.success('Delivery confirmed & inventory updated');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const cartTotal = cart.reduce((s, i) => s + i.product.wholesalePrice * i.quantity, 0);
  const statusColor = (s) => ({ draft: 'slate', submitted: 'amber', confirmed: 'blue', processing: 'indigo', shipped: 'purple', delivered: 'emerald', cancelled: 'rose' }[s] || 'slate');

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2" /></div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Purchase Orders...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-600 text-white rounded-2xl shadow-lg shadow-orange-200"><ShoppingCart className="h-4 w-4" /></div>
            <span className="text-[10px] font-black text-orange-600 uppercase tracking-[0.4em]">SUPPLY CHAIN</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-[0.9] mb-3">
            Purchase <span className="text-orange-600">Orders</span>
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-900 p-1.5 rounded-2xl flex gap-1 overflow-x-auto">
        {[
          { id: 'orders', label: 'My Orders', icon: Layers },
          { id: 'suppliers', label: 'Browse Suppliers', icon: Truck }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow' : 'text-white/60 hover:text-white'}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── ORDERS TAB ── */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
              <ShoppingCart className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-sm font-bold text-slate-400">No purchase orders yet. Browse suppliers to get started.</p>
              <button onClick={() => setActiveTab('suppliers')} className="mt-4 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">Browse Suppliers</button>
            </div>
          ) : orders.map(order => (
            <div key={order._id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-black text-slate-900">{order.orderNumber}</p>
                  <p className="text-[9px] text-slate-400">{order.supplier?.businessName} • {new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase bg-${statusColor(order.status)}-100 text-${statusColor(order.status)}-700`}>{order.status}</span>
                  <p className="text-sm font-black text-slate-900">₱{order.totalCost?.toLocaleString()}</p>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mb-2">{order.items?.length} items • Payment: {order.paymentStatus}</div>
              {order.trackingNumber && <p className="text-[10px] text-indigo-600 font-bold mb-2">📦 Tracking: {order.trackingNumber}</p>}
              <div className="flex gap-2 flex-wrap">
                {!['delivered', 'cancelled'].includes(order.status) && (
                  <button onClick={() => cancelOrder(order._id)}
                    className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[9px] font-black uppercase hover:bg-rose-600 hover:text-white transition-all">Cancel</button>
                )}
                {order.status === 'delivered' && (
                  <button onClick={() => confirmDelivery(order._id)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all">Confirm & Update Inventory</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SUPPLIERS TAB ── */}
      {activeTab === 'suppliers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(s => (
            <div key={s._id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  {s.logo ? <img src={getImageUrl(s.logo)} alt="" className="w-full h-full object-cover rounded-2xl" /> : <Truck className="h-5 w-5 text-indigo-500" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">{s.businessName}</h3>
                  <p className="text-[9px] text-slate-400">{s.address?.city}, {s.address?.province}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <span className="text-[9px] font-bold text-slate-500"><Star className="h-3 w-3 inline text-amber-500" /> {s.ratings?.average?.toFixed(1) || '—'}</span>
                <span className="text-[9px] font-bold text-slate-500"><TrendingDown className="h-3 w-3 inline text-emerald-500" /> {s.performance?.averageDeliveryDays || '—'}d delivery</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-4">
                {s.productCategories?.slice(0, 4).map(c => (
                  <span key={c} className="px-2 py-0.5 bg-slate-100 rounded text-[8px] font-bold text-slate-500 uppercase">{c.replace('_', ' ')}</span>
                ))}
              </div>
              <button onClick={() => browseCatalog(s._id)}
                className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all">
                View Catalog
              </button>
            </div>
          ))}
          {suppliers.length === 0 && (
            <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-slate-100">
              <Truck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-sm font-bold text-slate-400">No verified suppliers available yet</p>
            </div>
          )}
        </div>
      )}

      {/* ── CATALOG MODAL ── */}
      {showCatalog && catalog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2">
          <div className="bg-white w-full max-w-4xl rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
            <header className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-black uppercase text-slate-900 tracking-tighter">{catalog.supplier?.businessName}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Product Catalog • {catalog.products?.length || 0} items</p>
              </div>
              <div className="flex items-center gap-3">
                {cart.length > 0 && (
                  <button onClick={() => setShowCheckout(true)}
                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-emerald-700">
                    <ShoppingCart className="h-4 w-4" /> Cart ({cart.length}) • ₱{cartTotal.toLocaleString()}
                  </button>
                )}
                <button onClick={() => setShowCatalog(false)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalog.products?.map(p => {
                  const inCart = cart.find(i => i.supplierProductId === p._id);
                  return (
                    <div key={p._id} className={`bg-white border ${inCart ? 'border-emerald-300 ring-2 ring-emerald-50' : 'border-slate-100'} rounded-2xl overflow-hidden shadow-sm`}>
                      <div className="h-28 bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                        {p.images?.[0] ? <img src={getImageUrl(p.images[0])} alt="" className="w-full h-full object-cover" /> : <Package className="h-8 w-8 text-indigo-300" />}
                      </div>
                      <div className="p-4">
                        <p className="text-[8px] font-black text-indigo-500 uppercase">{p.category?.replace('_', ' ')}</p>
                        <h4 className="text-xs font-black text-slate-900 uppercase mt-0.5 line-clamp-1">{p.name}</h4>
                        <div className="flex justify-between items-end mt-2">
                          <div>
                            <p className="text-[8px] text-slate-400">Wholesale</p>
                            <p className="text-sm font-black text-slate-900">₱{p.wholesalePrice?.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] text-slate-400">Stock</p>
                            <p className="text-xs font-bold text-slate-600">{p.availableStock} {p.unitOfMeasure}</p>
                          </div>
                        </div>
                        <p className="text-[8px] text-slate-400 mt-1">Min order: {p.minimumOrderQuantity} • Lead: {p.deliveryLeadTimeDays}d</p>
                        {inCart ? (
                          <div className="flex items-center justify-center gap-3 mt-3 bg-emerald-50 rounded-xl py-2">
                            <button onClick={() => updateCartQty(p._id, -1)} className="p-1 bg-white rounded-lg shadow-sm"><Minus className="h-3 w-3" /></button>
                            <span className="text-sm font-black text-emerald-700">{inCart.quantity}</span>
                            <button onClick={() => updateCartQty(p._id, 1)} className="p-1 bg-white rounded-lg shadow-sm"><Plus className="h-3 w-3" /></button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(p)} disabled={p.availableStock <= 0}
                            className="w-full mt-3 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-600 transition-all disabled:opacity-30">
                            {p.availableStock <= 0 ? 'Out of Stock' : 'Add to Order'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CHECKOUT MODAL ── */}
      {showCheckout && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2">
          <div className="bg-white w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <header className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black uppercase text-slate-900 tracking-tighter">Review Order</h3>
              <button onClick={() => setShowCheckout(false)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Supplier: {catalog?.supplier?.businessName}</div>
              {cart.map(item => (
                <div key={item.supplierProductId} className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-900">{item.product.name}</p>
                      <p className="text-[9px] text-slate-400">{item.quantity} × ₱{item.product.wholesalePrice.toLocaleString()}</p>
                    </div>
                    <p className="text-sm font-black text-slate-900">₱{(item.product.wholesalePrice * item.quantity).toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-orange-500 uppercase tracking-widest">Link to Store Product (for auto-stock update)</label>
                    <select 
                      value={productMapping[item.supplierProductId] || ''}
                      onChange={e => setProductMapping(prev => ({ ...prev, [item.supplierProductId]: e.target.value || null }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none">
                      <option value="">— No link (manual update later) —</option>
                      {storeProducts.map(sp => (
                        <option key={sp._id} value={sp._id}>{sp.name} (SKU: {sp.sku}) — Stock: {sp.stockQuantity}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 text-right">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total</p>
                <p className="text-2xl font-black text-indigo-900">₱{cartTotal.toLocaleString()}</p>
              </div>
            </div>
            <footer className="p-5 border-t border-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setShowCheckout(false)} className="px-6 py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase">Back</button>
              <button onClick={submitOrder}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all">
                Submit Purchase Order
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;
