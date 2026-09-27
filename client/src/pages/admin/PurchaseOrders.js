import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Truck, Package, Plus, ShoppingCart, X, Eye, Minus, TrendingDown, Layers, Star, Mail, Power } from 'lucide-react';
import { supplierService, purchaseOrderService, getImageUrl, adminProductService } from '../../services/apiService';
import PaymentBreakdown from '../../components/payments/PaymentBreakdown';
import { formatPeso, purchaseOrderPaymentSummary } from '../../utils/paymentSummary';

const PurchaseOrders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'orders';
  const [activeTab, setActiveTab] = useState(requestedTab);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [procurementCart, setProcurementCart] = useState({ items: [], itemCount: 0, totalQuantity: 0, subtotal: 0, supplierCount: 0 });
  const [loading, setLoading] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [submittingCart, setSubmittingCart] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [storeProducts, setStoreProducts] = useState([]);
  const [productMapping, setProductMapping] = useState({});
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const emptySupplierForm = { businessName: '', contactPerson: '', email: '', phone: '', address: { street: '', city: '', province: '', zipCode: '' }, description: '' };
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [savingSupplier, setSavingSupplier] = useState(false);

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    setActiveTab(requestedTab);
  }, [requestedTab]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'suppliers' ? { tab: 'suppliers' } : {}, { replace: true });
  };

  const fetchData = async () => {
    try {
      const [ordRes, supRes, prodRes, cartRes] = await Promise.all([
        purchaseOrderService.getAll(),
        supplierService.getStoreManagedSuppliers(),
        adminProductService.getAllProducts(),
        purchaseOrderService.getCart()
      ]);
      setOrders(ordRes.data.orders || []);
      setSuppliers(supRes.data.suppliers || []);
      setStoreProducts(prodRes.data?.products || prodRes.data || []);
      setProcurementCart(cartRes.data);
      setProductMapping(Object.fromEntries((cartRes.data.items || []).map(item => [item.supplierProductId, item.storeProduct?._id || ''])));
    } catch (e) { console.error('Load error:', e); }
    finally { setLoading(false); }
  };

  const browseCatalog = async (supplierId) => {
    try {
      const res = await supplierService.getCatalog(supplierId);
      setCatalog(res.data);
      setShowCatalog(true);
    } catch (e) { toast.error('Failed to load catalog'); }
  };

  const inviteSupplier = async (event) => {
    event.preventDefault();
    setSavingSupplier(true);
    try {
      const response = await supplierService.createStoreSupplier(supplierForm);
      toast[response.data.invitationDelivered ? 'success' : 'warning'](response.data.message);
      setSupplierForm(emptySupplierForm);
      setShowSupplierForm(false);
      await fetchData();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to invite supplier.'); }
    finally { setSavingSupplier(false); }
  };

  const changeSupplierStatus = async (supplier, action) => {
    try {
      await supplierService.updateStoreSupplierStatus(supplier._id, action);
      toast.success(`Supplier ${action}d for this store.`);
      await fetchData();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to update supplier.'); }
  };

  const resendInvitation = async supplier => {
    try {
      const response = await supplierService.resendStoreInvitation(supplier._id);
      toast.success(response.data.message);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to resend invitation.'); }
  };

  const addToCart = async (product) => {
    try {
      const response = await purchaseOrderService.addCartItem(product._id, product.minimumOrderQuantity);
      setProcurementCart(response.data);
      toast.success(`${product.name} added to procurement cart`);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to add this supply.'); }
  };

  const updateCartQty = async (item, delta) => {
    const nextQuantity = item.quantity + delta;
    if (nextQuantity < item.product.minimumOrderQuantity) return removeCartItem(item);
    try {
      const response = await purchaseOrderService.updateCartItem(item.cartItemId || item.supplierProductId, { quantity: nextQuantity });
      setProcurementCart(response.data);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to update quantity.'); }
  };

  const removeCartItem = async item => {
    try {
      const response = await purchaseOrderService.removeCartItem(item.cartItemId || item.supplierProductId);
      setProcurementCart(response.data);
      setProductMapping(previous => {
        const next = { ...previous };
        delete next[item.supplierProductId];
        return next;
      });
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to remove this supply.'); }
  };

  const updateProductMapping = async (item, storeProductId) => {
    try {
      const response = await purchaseOrderService.updateCartItem(item.cartItemId || item.supplierProductId, { storeProductId: storeProductId || null });
      setProcurementCart(response.data);
      setProductMapping(previous => ({ ...previous, [item.supplierProductId]: storeProductId }));
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to save inventory mapping.'); }
  };

  const acceptCurrentPrices = async () => {
    try {
      let latest = procurementCart;
      for (const item of cart.filter(entry => entry.priceChanged)) {
        const response = await purchaseOrderService.updateCartItem(item.cartItemId || item.supplierProductId, { acceptCurrentPrice: true });
        latest = response.data;
      }
      setProcurementCart(latest);
      toast.info('Current supplier prices accepted. Review the updated totals before submitting.');
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to refresh supplier prices.'); }
  };

  const clearProcurementCart = async () => {
    if (!window.confirm('Clear every supply from this procurement cart?')) return;
    try {
      const response = await purchaseOrderService.clearCart();
      setProcurementCart(response.data);
      setProductMapping({});
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to clear the procurement cart.'); }
  };

  const submitOrder = async () => {
    if (!procurementCart.items.length || submittingCart) return;
    setSubmittingCart(true);
    try {
      const response = await purchaseOrderService.submitCart();
      toast.success(response.data.message);
      setShowCheckout(false);
      setProcurementCart({ items: [], itemCount: 0, totalQuantity: 0, subtotal: 0, supplierCount: 0 });
      setProductMapping({});
      await fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to submit purchase requests');
      if (e.response?.data?.code === 'PROCUREMENT_CART_PRICE_CHANGED') {
        const refreshed = await purchaseOrderService.getCart();
        setProcurementCart(refreshed.data);
      }
    } finally { setSubmittingCart(false); }
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

  const cart = procurementCart.items || [];
  const cartTotal = procurementCart.subtotal || 0;
  const groupedCart = cart.reduce((groups, item) => {
    const key = String(item.supplierId);
    if (!groups[key]) groups[key] = { supplier: item.supplier, items: [] };
    groups[key].items.push(item);
    return groups;
  }, {});
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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-600 text-white rounded-2xl shadow-lg shadow-orange-200"><ShoppingCart className="h-4 w-4" /></div>
            <span className="text-[10px] font-black text-orange-600 uppercase tracking-[0.4em]">SUPPLY CHAIN</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight leading-none mb-2">
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
          <button key={tab.id} onClick={() => selectTab(tab.id)}
            className={`px-5 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-slate-900 shadow' : 'text-white/60 hover:text-white'}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
        <button onClick={() => setShowCheckout(true)} disabled={!cart.length}
          className="ml-auto flex items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40">
          <ShoppingCart className="h-4 w-4" /> Procurement Cart ({procurementCart.itemCount})
        </button>
      </div>

      {/* ── ORDERS TAB ── */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
              <ShoppingCart className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-sm font-bold text-slate-400">No purchase orders yet. Browse suppliers to get started.</p>
              <button onClick={() => selectTab('suppliers')} className="mt-4 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">Browse Suppliers</button>
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
                  <p className="text-sm font-black text-slate-900">{formatPeso(order.totalCost)}</p>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mb-2">{order.items?.length} items • Payment: {order.paymentStatus}</div>
              {order.trackingNumber && <p className="text-[10px] text-indigo-600 font-bold mb-2">📦 Tracking: {order.trackingNumber}</p>}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setSelectedOrder(order)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-[9px] font-black uppercase flex items-center gap-1"><Eye className="h-3 w-3"/> Details</button>
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div><h2 className="text-sm font-black text-slate-900">Supplier Management</h2><p className="mt-1 text-xs text-slate-500">Invite a trusted store supplier or order from an approved platform supplier.</p></div>
            <button onClick={() => setShowSupplierForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-[10px] font-black uppercase text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Add Supplier</button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suppliers.map(s => (
            <div key={s._id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  {s.logo ? <img src={getImageUrl(s.logo)} alt="" className="w-full h-full object-cover rounded-2xl" /> : <Truck className="h-5 w-5 text-indigo-500" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">{s.businessName}</h3>
                  <p className="text-[9px] text-slate-400">{s.address?.city}, {s.address?.province}</p>
                  <div className="mt-1 flex flex-wrap gap-1"><span className="rounded-full bg-primary-50 px-2 py-0.5 text-[8px] font-black uppercase text-primary-700">{s.supplierType === 'store_added' ? 'Store-added' : 'Platform supplier'}</span><span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${s.selectable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{String(s.storeAssociationStatus || s.status).replaceAll('_', ' ')}</span></div>
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
              <div className="flex flex-wrap gap-2">
                <button disabled={!s.selectable} onClick={() => browseCatalog(s._id)} className="min-w-[8rem] flex-1 rounded-xl bg-slate-900 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40">View Catalog</button>
                {s.supplierType === 'store_added' && s.storeAssociationStatus === 'pending_activation' && <button title="Resend invitation" onClick={() => resendInvitation(s)} className="rounded-xl border border-slate-200 p-3 text-slate-600 hover:text-primary-600"><Mail className="h-4 w-4" /></button>}
                {s.supplierType === 'store_added' && s.storeAssociationStatus === 'active' && <button title="Deactivate for this store" onClick={() => changeSupplierStatus(s, 'deactivate')} className="rounded-xl border border-rose-200 p-3 text-rose-600"><Power className="h-4 w-4" /></button>}
                {s.supplierType === 'store_added' && s.storeAssociationStatus === 'inactive' && <button onClick={() => changeSupplierStatus(s, 'reactivate')} className="rounded-xl border border-emerald-200 px-3 py-2 text-[9px] font-black uppercase text-emerald-700">Reactivate</button>}
              </div>
            </div>
          ))}
          {suppliers.length === 0 && (
            <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-slate-100">
              <Truck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-sm font-black text-slate-800 uppercase">No verified suppliers available yet</h3>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
                Supplier accounts appear here after platform verification. You can still add products, update stock, or record service supplies manually while the supplier marketplace is empty.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link to="/admin/products" className="rounded-xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-primary-600">
                  Add Inventory Manually
                </Link>
                <Link to="/admin/supplies" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:border-teal-400 hover:text-teal-700">
                  Manage Service Supplies
                </Link>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {showSupplierForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm">
          <form onSubmit={inviteSupplier} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between"><div><h2 className="text-lg font-black text-slate-900">Add Store Supplier</h2><p className="mt-1 text-xs text-slate-500">No platform documents are required. Pawzzle emails a single-use activation link and temporary password.</p></div><button type="button" onClick={() => setShowSupplierForm(false)}><X className="h-5 w-5" /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[['businessName','Business name'],['contactPerson','Contact person'],['email','Email'],['phone','Phone']].map(([key,label]) => <label key={key} className="text-xs font-bold text-slate-700">{label}<input required type={key === 'email' ? 'email' : 'text'} value={supplierForm[key]} onChange={e => setSupplierForm(form => ({ ...form, [key]: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>)}
              {[['street','Street'],['city','City'],['province','Province'],['zipCode','ZIP code']].map(([key,label]) => <label key={key} className="text-xs font-bold text-slate-700">{label}<input required={key !== 'zipCode'} value={supplierForm.address[key]} onChange={e => setSupplierForm(form => ({ ...form, address: { ...form.address, [key]: e.target.value } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>)}
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">Description<textarea value={supplierForm.description} onChange={e => setSupplierForm(form => ({ ...form, description: e.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowSupplierForm(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500">Cancel</button><button disabled={savingSupplier} className="rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{savingSupplier ? 'Creating invitation...' : 'Create & Email Invitation'}</button></div>
          </form>
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
                  const inCart = cart.find(i => String(i.supplierProductId) === String(p._id));
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
                            <button onClick={() => updateCartQty(inCart, -1)} className="p-1 bg-white rounded-lg shadow-sm"><Minus className="h-3 w-3" /></button>
                            <span className="text-sm font-black text-emerald-700">{inCart.quantity}</span>
                            <button onClick={() => updateCartQty(inCart, 1)} disabled={inCart.quantity >= p.availableStock} className="p-1 bg-white rounded-lg shadow-sm disabled:opacity-30"><Plus className="h-3 w-3" /></button>
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

      {selectedOrder && <div className="fixed inset-0 bg-slate-900/60 z-[105] flex items-center justify-center p-3"><div className="bg-white w-full max-w-xl rounded-2xl p-5 max-h-[90vh] overflow-y-auto"><div className="flex justify-between mb-4"><div><h3 className="text-base font-black">{selectedOrder.orderNumber}</h3><p className="text-[10px] text-slate-500">{selectedOrder.supplier?.businessName} · {selectedOrder.status}</p></div><button onClick={()=>setSelectedOrder(null)}><X className="h-4 w-4"/></button></div><div className="space-y-2">{selectedOrder.items?.map(item=><div key={item._id} className="p-3 bg-slate-50 rounded-xl flex justify-between text-xs"><div><p className="font-bold">{item.productName}</p><p className="text-[10px] text-slate-500">{item.quantity} × {formatPeso(item.unitPrice)} · Received {item.receivedQuantity || 0}</p></div><p className="font-black">{formatPeso(item.totalPrice)}</p></div>)}</div><div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><PaymentBreakdown summary={purchaseOrderPaymentSummary(selectedOrder)} compact /><p className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-500">Payment: <b>{selectedOrder.paymentStatus}</b> · Paid {formatPeso(selectedOrder.paidAmount || 0)}</p></div></div></div>}

      {/* ── CHECKOUT MODAL ── */}
      {showCheckout && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-2">
          <div className="bg-white w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <header className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div><h3 className="text-lg font-black uppercase text-slate-900 tracking-tighter">Review Purchase Requests</h3><p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">{procurementCart.supplierCount} supplier{procurementCart.supplierCount === 1 ? '' : 's'} · {procurementCart.totalQuantity} total units</p></div>
              <div className="flex items-center gap-2">{cart.length > 0 && <button onClick={clearProcurementCart} className="rounded-lg px-2 py-1 text-[8px] font-black uppercase text-rose-600">Clear</button>}<button onClick={() => setShowCheckout(false)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button></div>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {Object.values(groupedCart).map(group => (
                <section key={group.supplier?._id || group.items[0]?.supplierId || 'unavailable'} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                    <div><p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">{group.supplier?.businessName || 'Unavailable supplier'}</p><p className="mt-0.5 text-[9px] text-slate-400">Creates 1 supplier-specific purchase request</p></div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-600">{group.items.length} item{group.items.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="space-y-3">
                    {group.items.map(item => (
                      <div key={item.supplierProductId} className={`rounded-xl border p-3 ${item.available ? 'border-slate-100 bg-slate-50' : 'border-rose-200 bg-rose-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{item.product?.name || 'Unavailable supply'}</p><p className="mt-1 text-[9px] text-slate-500">{item.quantity} × {formatPeso(item.product?.wholesalePrice || 0)} · {item.product?.unitOfMeasure}</p>{item.priceChanged && <p className="mt-1 text-[9px] font-bold text-amber-700">Price changed from {formatPeso(item.addedUnitPrice)}.</p>}{!item.available && <p className="mt-1 text-[9px] font-bold text-rose-700">This item or supplier is no longer available.</p>}</div>
                          <div className="text-right"><p className="text-sm font-black text-slate-900">{formatPeso(item.lineTotal)}</p><button onClick={() => removeCartItem(item)} className="mt-1 text-[8px] font-black uppercase text-rose-600">Remove</button></div>
                        </div>
                        {item.product && <div className="mt-3 flex items-center gap-2"><button onClick={() => updateCartQty(item, -1)} className="rounded-lg border bg-white p-1.5"><Minus className="h-3 w-3" /></button><span className="min-w-8 text-center text-xs font-black">{item.quantity}</span><button onClick={() => updateCartQty(item, 1)} disabled={item.quantity >= item.product.availableStock} className="rounded-lg border bg-white p-1.5 disabled:opacity-30"><Plus className="h-3 w-3" /></button><span className="ml-1 text-[9px] text-slate-400">Available: {item.product.availableStock}</span></div>}
                        <div className="mt-3 space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-orange-500">Link to Store Product (optional)</label>
                          <select value={productMapping[item.supplierProductId] || ''} onChange={e => updateProductMapping(item, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold outline-none">
                            <option value="">— No link (manual update later) —</option>
                            {storeProducts.map(sp => <option key={sp._id} value={sp._id}>{sp.name} (SKU: {sp.sku}) — Stock: {sp.stockQuantity}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {!cart.length && <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center"><ShoppingCart className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-xs font-bold text-slate-500">Your procurement cart is empty.</p></div>}
              {cart.some(item => item.priceChanged) && <button onClick={acceptCurrentPrices} className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[10px] font-black uppercase text-amber-800">Accept current supplier prices</button>}
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <p className="mb-3 text-[10px] font-black text-indigo-500 uppercase tracking-widest">Purchase Order Summary</p>
                <PaymentBreakdown summary={purchaseOrderPaymentSummary({ subtotal: cartTotal, totalCost: cartTotal })} compact />
              </div>
            </div>
            <footer className="p-5 border-t border-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setShowCheckout(false)} className="px-6 py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase">Back</button>
              <button onClick={submitOrder} disabled={submittingCart || !cart.length || cart.some(item => !item.available || item.priceChanged)}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all disabled:cursor-not-allowed disabled:opacity-40">
                {submittingCart ? 'Submitting...' : `Submit ${procurementCart.supplierCount || ''} Purchase Request${procurementCart.supplierCount === 1 ? '' : 's'}`}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;
