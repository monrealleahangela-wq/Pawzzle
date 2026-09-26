import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  Package, Plus, Edit2, Trash2, X,
  TrendingUp, Truck, Star, ShoppingCart, Clock, CheckCircle,
  BarChart3, Box
} from 'lucide-react';
import { supplierService, uploadService, getImageUrl } from '../../services/apiService';
import PaymentBreakdown from '../../components/payments/PaymentBreakdown';
import { formatPeso, purchaseOrderPaymentSummary } from '../../utils/paymentSummary';

const SupplierDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applicationFiles, setApplicationFiles] = useState({ businessRegistration: null, birCertificate: null });

  const initialProduct = { name: '', sku: '', description: '', category: 'pet_food', wholesalePrice: 0, retailPrice: 0, availableStock: 0, minimumOrderQuantity: 1, unitOfMeasure: 'piece', deliveryLeadTimeDays: 3, brand: '', images: [] };
  const [productForm, setProductForm] = useState(initialProduct);
  const [registerForm, setRegisterForm] = useState({ businessName: '', contactPerson: '', email: '', phone: '', taxId: '', address: { street: '', city: '', province: '', zipCode: '' }, description: '', productCategories: [] });

  const categories = [
    { id: 'pet_food', label: 'Pet Food', icon: '🍖' },
    { id: 'pet_treats', label: 'Pet Treats', icon: '🦴' },
    { id: 'grooming_supplies', label: 'Grooming', icon: '✂️' },
    { id: 'medical_supplies', label: 'Medical', icon: '💊' },
    { id: 'accessories', label: 'Accessories', icon: '🎀' },
    { id: 'toys', label: 'Toys', icon: '🧸' },
    { id: 'cleaning_products', label: 'Cleaning', icon: '🧹' },
    { id: 'health_supplements', label: 'Supplements', icon: '💉' },
    { id: 'other', label: 'Other', icon: '📦' }
  ];

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const dashRes = await supplierService.getDashboard();
      setDashboard(dashRes.data);
      const prodRes = await supplierService.getProducts();
      setProducts(prodRes.data.products || []);
      const ordRes = await supplierService.getOrders();
      setOrders(ordRes.data.orders || []);
    } catch (e) {
      if (e.response?.status === 404) setShowRegister(true);
      else console.error('Load error:', e);
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!applicationFiles.businessRegistration || !applicationFiles.birCertificate) {
      return toast.error('Business registration and BIR documents are required.');
    }
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(registerForm).forEach(([key, value]) => {
        data.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
      });
      data.append('businessRegistration', applicationFiles.businessRegistration);
      data.append('birCertificate', applicationFiles.birCertificate);
      await supplierService.register(data);
      toast.success('Supplier registration submitted! Awaiting verification.');
      setShowRegister(false);
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Registration failed');
    } finally { setSubmitting(false); }
  };

  const handleResubmit = async (e) => {
    e.preventDefault();
    if (!applicationFiles.businessRegistration || !applicationFiles.birCertificate) return toast.error('Choose both replacement documents.');
    setSubmitting(true);
    try {
      const data = new FormData();
      if (applicationFiles.businessRegistration) data.append('businessRegistration', applicationFiles.businessRegistration);
      if (applicationFiles.birCertificate) data.append('birCertificate', applicationFiles.birCertificate);
      await supplierService.resubmitApplication(data);
      toast.success('Documents resubmitted for review.');
      setApplicationFiles({ businessRegistration: null, birCertificate: null });
      await loadData();
    } catch (error) { toast.error(error.response?.data?.message || 'Resubmission failed.'); }
    finally { setSubmitting(false); }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingProduct) {
        await supplierService.updateProduct(editingProduct._id, productForm);
        toast.success('Product updated');
      } else {
        await supplierService.addProduct(productForm);
        toast.success('Product added to catalog');
      }
      setShowProductModal(false);
      setEditingProduct(null);
      setProductForm(initialProduct);
      const res = await supplierService.getProducts();
      setProducts(res.data.products || []);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await supplierService.deleteProduct(id);
      toast.success('Product removed');
      setProducts(prev => prev.filter(p => p._id !== id));
    } catch (e) { toast.error('Failed to delete'); }
  };

  const handleOrderAction = async (orderId, status, notes = '') => {
    try {
      await supplierService.updateOrderStatus(orderId, { status, supplierNotes: notes });
      toast.success(`Order ${status}`);
      const res = await supplierService.getOrders();
      setOrders(res.data.orders || []);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) fd.append('images', files[i]);
    try {
      const res = await uploadService.uploadMultipleImages(fd);
      const urls = res.data.urls || res.data.imageUrls || [];
      setProductForm(prev => ({ ...prev, images: [...prev.images, ...urls] }));
    } catch (e) { toast.error('Upload failed'); }
  };

  const statusColor = (s) => ({ submitted: 'amber', confirmed: 'primary', processing: 'primary', shipped: 'primary', delivered: 'emerald', cancelled: 'rose' }[s] || 'slate');

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2" /></div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Supplier Dashboard...</span>
    </div>
  );

  // ── REGISTRATION FORM ─────────────────────────────────
  if (showRegister) return (
    <div className="w-full min-w-0 bg-slate-50/50 p-3 sm:p-5">
      <div className="max-w-2xl mx-auto">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary-600 text-white rounded-2xl shadow-lg shadow-primary-200"><Truck className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Become a Supplier</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Register your supply business</p>
            </div>
          </div>
          <form onSubmit={handleRegister} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { key: 'businessName', label: 'Business Name', required: true },
                { key: 'contactPerson', label: 'Contact Person', required: true },
                { key: 'email', label: 'Email', required: true, type: 'email' },
                { key: 'phone', label: 'Phone', required: true }
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{f.label}</label>
                  <input type={f.type || 'text'} required={f.required} value={registerForm[f.key]}
                    onChange={e => setRegisterForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['street', 'city', 'province', 'zipCode'].map(f => (
                <div key={f} className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{f.replace(/([A-Z])/g, ' $1')}</label>
                  <input type="text" required={f !== 'zipCode'} value={registerForm.address[f]}
                    onChange={e => setRegisterForm(p => ({ ...p, address: { ...p.address, [f]: e.target.value } }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Product Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(c => (
                  <button key={c.id} type="button" onClick={() => {
                    setRegisterForm(prev => ({ ...prev, productCategories: prev.productCategories.includes(c.id) ? prev.productCategories.filter(x => x !== c.id) : [...prev.productCategories, c.id] }));
                  }} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all ${registerForm.productCategories.includes(c.id) ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description</label>
              <textarea value={registerForm.description} onChange={e => setRegisterForm(p => ({ ...p, description: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium outline-none h-24 resize-none" placeholder="About your business..." />
            </div>
            <div className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <h2 className="text-xs font-black uppercase text-amber-900">Platform supplier verification</h2>
                <p className="mt-1 text-xs leading-5 text-amber-800">Platform suppliers must provide the same core business evidence used by Pawzzle business verification. Documents are visible only to the applicant and Platform Admin reviewers.</p>
              </div>
              <label className="text-xs font-bold text-slate-700">Business registration document
                <input type="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setApplicationFiles(files => ({ ...files, businessRegistration: e.target.files?.[0] || null }))} className="mt-2 block w-full text-xs" />
              </label>
              <label className="text-xs font-bold text-slate-700">BIR Certificate of Registration (Form 2303)
                <input type="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setApplicationFiles(files => ({ ...files, birCertificate: e.target.files?.[0] || null }))} className="mt-2 block w-full text-xs" />
              </label>
            </div>
            <button type="submit" disabled={submitting}
              className="min-h-10 w-full rounded-xl bg-primary-600 px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition-all hover:bg-primary-700 disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const supplier = dashboard?.supplier;
  const stats = dashboard?.stats;

  if (['resubmission_required', 'rejected'].includes(supplier?.status)) return (
    <div className="flex min-h-[55vh] items-center justify-center bg-slate-50/50 p-4">
      <form onSubmit={handleResubmit} className="w-full max-w-xl rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-900">{supplier.status === 'rejected' ? 'Application rejected' : 'Documents need an update'}</h2>
        <p className="mt-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{supplier.rejectionReason || 'Platform Admin requested updated supplier documents.'}</p>
        <p className="mt-4 text-xs leading-5 text-slate-500">Upload replacement business registration and BIR documents. Earlier versions remain in the protected application history.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold">Business registration<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setApplicationFiles(files => ({ ...files, businessRegistration: e.target.files?.[0] || null }))} className="mt-2 block w-full text-xs" /></label>
          <label className="text-xs font-bold">BIR Certificate<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setApplicationFiles(files => ({ ...files, birCertificate: e.target.files?.[0] || null }))} className="mt-2 block w-full text-xs" /></label>
        </div>
        <button disabled={submitting} className="mt-5 w-full rounded-xl bg-primary-600 px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{submitting ? 'Submitting...' : 'Resubmit documents'}</button>
      </form>
    </div>
  );

  // ── PENDING VERIFICATION ──────────────────────────────
  if (supplier?.status === 'pending_verification') return (
    <div className="flex min-h-[50vh] items-center justify-center bg-slate-50/50 p-4">
      <div className="max-w-lg rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <div className="w-20 h-20 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6"><Clock className="h-10 w-10 text-amber-600" /></div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Under Review</h2>
        <p className="text-sm text-slate-500 leading-relaxed">Your supplier application is being reviewed. You'll be notified once verified.</p>
      </div>
    </div>
  );

  // ── MAIN DASHBOARD ────────────────────────────────────
  return (
    <div className="ui-page-stack w-full max-w-full min-w-0 bg-slate-50/50 p-3 dark:bg-slate-950 sm:p-5">
      {/* Header */}
      <div className="ui-page-header relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary-600 text-white rounded-2xl shadow-lg shadow-primary-200"><Truck className="h-4 w-4" /></div>
            <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">SUPPLIER PORTAL</span>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${supplier?.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {supplier?.status?.replace('_', ' ')}
            </span>
          </div>
          <h1 className="mb-1 text-2xl font-black uppercase leading-tight tracking-tight text-slate-900 sm:text-3xl">
            {supplier?.businessName || 'Supplier'} <span className="text-primary-600">Hub</span>
          </h1>
        </div>
      </div>

      {/* Stats */}
      <div className="responsive-card-grid [--card-min:9rem] [--card-gap:1rem]">
        {[
          { label: 'Products', value: stats?.activeProducts || 0, icon: Package },
          { label: 'Total Stock', value: stats?.totalStock || 0, icon: Box },
          { label: 'Completed', value: supplier?.performance?.completedOrders || 0, icon: CheckCircle },
          { label: 'Reliability', value: `${supplier?.performance?.reliabilityScore || 100}%`, icon: TrendingUp },
          { label: 'Rating', value: supplier?.ratings?.average?.toFixed(1) || '5.0', icon: Star }
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all">
            <s.icon className="h-5 w-5 text-primary-600 mb-3" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{s.label}</p>
            <p className="text-xl font-black text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="content-scroll-row gap-1 rounded-2xl bg-slate-900 p-1.5">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'products', label: 'Products', icon: Package },
          { id: 'orders', label: 'Orders', icon: ShoppingCart }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-wide transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow' : 'text-white/60 hover:text-white'}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Recent Orders</h3>
            {dashboard?.recentOrders?.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No orders yet</p>
            ) : (
              <div className="space-y-3">
                {dashboard?.recentOrders?.map(order => (
                  <div key={order._id} className="flex items-center justify-between bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div>
                      <p className="text-[11px] font-black text-slate-800">{order.orderNumber}</p>
                      <p className="text-[9px] text-slate-400">{order.seller?.firstName} {order.seller?.lastName} • {order.store?.name}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase bg-${statusColor(order.status)}-100 text-${statusColor(order.status)}-700`}>{order.status}</span>
                      <p className="text-[11px] font-black text-slate-900 mt-1">{formatPeso(order.totalCost)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: PRODUCTS ── */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Product Catalog ({products.length})</h3>
            <button onClick={() => { setProductForm(initialProduct); setEditingProduct(null); setShowProductModal(true); }}
              className="px-6 py-3 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 transition-all flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Product
            </button>
          </div>
          <div className="responsive-card-grid [--card-min:17rem] sm:[--card-min:18rem] [--card-gap:1rem]">
            {products.map(p => (
              <div key={p._id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all group">
                <div className="h-32 bg-primary-50 flex items-center justify-center">
                  {p.images?.[0] ? <img src={getImageUrl(p.images[0])} alt="" className="w-full h-full object-cover" /> : <Package className="h-10 w-10 text-primary-300" />}
                </div>
                <div className="p-4">
                  <p className="text-[9px] font-black text-primary-600 uppercase tracking-widest">{p.category?.replace('_', ' ')}</p>
                  <h4 className="mt-1 min-h-[2.5rem] text-sm font-black uppercase leading-tight text-slate-900 line-clamp-2 break-words">{p.name}</h4>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase">Wholesale</p>
                      <p className="text-sm font-black text-slate-900">{formatPeso(p.wholesalePrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Stock</p>
                      <p className={`text-sm font-black ${p.availableStock <= 0 ? 'text-rose-600' : p.availableStock < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>{p.availableStock}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setProductForm(p); setEditingProduct(p); setShowProductModal(true); }}
                      className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-primary-600 transition-all flex items-center justify-center gap-1">
                      <Edit2 className="h-3 w-3" /> Edit
                    </button>
                    <button onClick={() => handleDeleteProduct(p._id)}
                      className="px-3 py-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: ORDERS ── */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="ui-empty-state rounded-2xl border border-slate-100 bg-white">
              <ShoppingCart className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-sm font-bold text-slate-400">No purchase orders received yet</p>
            </div>
          ) : orders.map(order => (
            <div key={order._id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-black text-slate-900">{order.orderNumber}</p>
                  <p className="text-[9px] text-slate-400">From {order.seller?.firstName} {order.seller?.lastName} • {new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase bg-${statusColor(order.status)}-100 text-${statusColor(order.status)}-700`}>{order.status}</span>
                  <p className="text-sm font-black text-slate-900">{formatPeso(order.totalCost)}</p>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mb-3">{order.items?.length} item(s)</div>
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <PaymentBreakdown summary={purchaseOrderPaymentSummary(order)} compact />
              </div>
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {order.status === 'submitted' && (
                  <>
                    <button onClick={() => handleOrderAction(order._id, 'confirmed')}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all">Accept</button>
                    <button onClick={() => handleOrderAction(order._id, 'cancelled', 'Rejected by supplier')}
                      className="px-4 py-2 bg-rose-100 text-rose-600 rounded-xl text-[9px] font-black uppercase hover:bg-rose-600 hover:text-white transition-all">Reject</button>
                  </>
                )}
                {order.status === 'confirmed' && (
                  <button onClick={() => handleOrderAction(order._id, 'processing')}
                    className="px-4 py-2 bg-primary-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-primary-700 transition-all">Start Processing</button>
                )}
                {order.status === 'processing' && (
                  <button onClick={() => handleOrderAction(order._id, 'shipped')}
                    className="px-4 py-2 bg-primary-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-primary-700 transition-all">Mark Shipped</button>
                )}
                {order.status === 'shipped' && (
                  <button onClick={() => handleOrderAction(order._id, 'delivered')}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all">Mark Delivered</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PRODUCT MODAL ── */}
      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2">
          <div className="bg-white dark:bg-slate-900 w-full min-w-0 max-w-2xl rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[calc(100dvh-1rem)] border border-slate-200 dark:border-slate-800">
            <header className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black uppercase text-slate-900 tracking-tighter">{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
              <button onClick={() => setShowProductModal(false)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Product Name</label>
                  <input type="text" value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SKU</label>
                  <input type="text" value={productForm.sku} onChange={e => setProductForm(p => ({ ...p, sku: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                  <select value={productForm.category} onChange={e => setProductForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Wholesale Price (₱)</label>
                  <input type="number" value={productForm.wholesalePrice} onChange={e => setProductForm(p => ({ ...p, wholesalePrice: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Stock</label>
                  <input type="number" value={productForm.availableStock} onChange={e => setProductForm(p => ({ ...p, availableStock: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Min Order Qty</label>
                  <input type="number" value={productForm.minimumOrderQuantity} onChange={e => setProductForm(p => ({ ...p, minimumOrderQuantity: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lead Time (days)</label>
                  <input type="number" value={productForm.deliveryLeadTimeDays} onChange={e => setProductForm(p => ({ ...p, deliveryLeadTimeDays: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                <textarea value={productForm.description} onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium outline-none h-20 resize-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Images</label>
                <div className="flex gap-3 flex-wrap">
                  {productForm.images?.map((img, i) => (
                    <div key={i} className="w-20 h-20 rounded-xl overflow-hidden relative group border border-slate-200">
                      <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setProductForm(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))}
                        className="absolute inset-0 bg-rose-600/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Trash2 className="h-4 w-4 text-white" /></button>
                    </div>
                  ))}
                  <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-primary-400">
                    <Plus className="h-6 w-6 text-slate-400" />
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
              </div>
            </div>
            <footer className="p-5 border-t border-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setShowProductModal(false)} className="px-6 py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase">Cancel</button>
              <button onClick={handleProductSubmit} disabled={submitting}
                className="flex-1 py-3 bg-primary-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-primary-700 transition-all disabled:opacity-50">
                {submitting ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierDashboard;
