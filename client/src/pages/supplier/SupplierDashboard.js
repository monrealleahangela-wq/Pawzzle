import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  Package, Plus, Edit2, Trash2, X,
  TrendingUp, Truck, Star, ShoppingCart, Clock, CheckCircle,
  BarChart3, Box, ShieldCheck, FileText
} from 'lucide-react';
import { supplierService, uploadService, getImageUrl } from '../../services/apiService';
import PaymentBreakdown from '../../components/payments/PaymentBreakdown';
import ProcurementEvidenceGallery, { ProcurementReinspectionEvidenceGallery } from '../../components/procurement/ProcurementEvidenceGallery';
import { formatPeso, purchaseOrderPaymentSummary } from '../../utils/paymentSummary';
import { pawzzleConfirm } from '../../utils/pawzzleDialog';

const FDA_REVIEW_CATEGORIES = ['pet_food', 'pet_treats', 'medical_supplies', 'health_supplements'];
const requiresFdaReview = category => FDA_REVIEW_CATEGORIES.includes(category);
const VARIANT_ATTRIBUTE_TYPES = [
  ['flavor', 'Flavor'], ['size', 'Size'], ['weight', 'Weight'],
  ['volume', 'Volume'], ['color', 'Color'], ['packaging', 'Packaging']
];
const emptyVariant = () => ({
  attributes: [{ code: 'size', label: 'Size', valueCode: '', valueLabel: '' }],
  sku: '', wholesalePrice: 0, availableStock: 0, minimumOrderQuantity: 1,
  unitOfMeasure: 'piece', weight: '', weightUnit: 'g', images: [], isActive: true
});

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
  const [resolutionDrafts, setResolutionDrafts] = useState({});
  const [variantCapabilities, setVariantCapabilities] = useState({ enabled: false, reasons: ['Checking variant readiness...'] });

  const initialProduct = {
    productMode: 'simple', itemType: 'pet_supply', name: '', sku: '', description: '', category: 'pet_food',
    wholesalePrice: 0, retailPrice: 0, availableStock: 0, minimumOrderQuantity: 1,
    unitOfMeasure: 'piece', deliveryLeadTimeDays: 3, brand: '', images: [],
    ingredients: '', nutritionalInformation: '', intendedSpecies: [], safetyNotes: '',
    fdaRegistrationNumber: '', fdaRegistrationExpiry: '', regulatoryDocuments: [],
    variants: [],
    pet: { name: '', species: 'dog', breed: '', age: 0, ageUnit: 'years', gender: 'male', size: 'medium', color: '', description: '', vaccinationStatus: 'none', healthCondition: 'healthy', healthNotes: '', dewormed: false, spayedNeutered: false }
  };
  const [productForm, setProductForm] = useState(initialProduct);
  const [registerForm, setRegisterForm] = useState({ businessName: '', contactPerson: '', email: '', phone: '', taxId: '', address: { street: '', city: '', province: '', zipCode: '' }, description: '', productCategories: [] });

  const categories = [
    { id: 'consumables', label: 'Service Consumables', icon: '📦' },
    { id: 'equipment', label: 'Service Equipment', icon: '📦' },
    { id: 'pet_food', label: 'Pet Food', icon: '🍖' },
    { id: 'pet_treats', label: 'Pet Treats', icon: '🦴' },
    { id: 'grooming_supplies', label: 'Grooming', icon: '✂️' },
    { id: 'medical_supplies', label: 'Pet Medicine', icon: '💊' },
    { id: 'accessories', label: 'Accessories', icon: '🎀' },
    { id: 'toys', label: 'Toys', icon: '🧸' },
    { id: 'cleaning_products', label: 'Cleaning', icon: '🧹' },
    { id: 'health_supplements', label: 'Health Supplements', icon: '💉' },
    { id: 'live_pets', label: 'Live Pets', icon: '🐾' },
    { id: 'general_product', label: 'General Product', icon: '📦' },
    { id: 'other', label: 'Other', icon: '📦' }
  ];

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const dashRes = await supplierService.getDashboard();
      setDashboard(dashRes.data);
      const prodRes = await supplierService.getProducts();
      setProducts(prodRes.data.products || []);
      try {
        const capabilityRes = await supplierService.getVariantCapabilities();
        setVariantCapabilities(capabilityRes.data);
      } catch (_error) {
        setVariantCapabilities({ enabled: false, reasons: ['Variant readiness could not be verified.'] });
      }
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
    const needsFdaReview = requiresFdaReview(productForm.category);
    if (needsFdaReview && !editingProduct && !String(productForm.fdaRegistrationNumber || '').trim()) {
      return toast.error('Enter the FDA product registration number.');
    }
    if (needsFdaReview && !editingProduct && !(productForm.regulatoryDocuments || []).length) {
      return toast.error('Upload at least one FDA registration or compliance document.');
    }
    if (productForm.productMode === 'variant') {
      if (!variantCapabilities.enabled) return toast.error('Variant management is not active until its database safety checks are complete.');
      if (!(productForm.variants || []).length) return toast.error('Add at least one explicit variant combination.');
      if (productForm.variants.some(variant => !variant.sku || !variant.attributes?.length || variant.attributes.some(attribute => !attribute.valueLabel))) {
        return toast.error('Complete the SKU and attribute values for every variant.');
      }
    }
    setSubmitting(true);
    try {
      if (editingProduct) {
        await supplierService.updateProduct(editingProduct._id, productForm);
        if (productForm.productMode === 'variant') {
          for (const variant of productForm.variants || []) {
            if (variant._id) await supplierService.updateVariant(editingProduct._id, variant._id, variant);
            else await supplierService.addVariant(editingProduct._id, variant);
          }
        }
        toast.success(needsFdaReview
          ? 'Supply updated and submitted for FDA compliance review.'
          : 'Supply updated and published. FDA review is not required for this category.');
      } else {
        if (productForm.productMode === 'variant') await supplierService.addVariantProduct(productForm);
        else await supplierService.addProduct(productForm);
        toast.success(needsFdaReview
          ? 'Supply submitted for FDA compliance review.'
          : 'Supply published. FDA review is not required for this category.');
      }
      setShowProductModal(false);
      setEditingProduct(null);
      setProductForm(initialProduct);
      const res = await supplierService.getProducts();
      setProducts(res.data.products || []);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const updateVariant = (variantIndex, updater) => setProductForm(current => ({
    ...current,
    variants: (current.variants || []).map((variant, index) => (
      index === variantIndex ? updater(variant) : variant
    ))
  }));

  const setVariantField = (variantIndex, field, value) => updateVariant(variantIndex, variant => ({
    ...variant,
    [field]: value
  }));

  const setVariantAttribute = (variantIndex, attributeIndex, field, value) => updateVariant(variantIndex, variant => ({
    ...variant,
    attributes: variant.attributes.map((attribute, index) => {
      if (index !== attributeIndex) return attribute;
      if (field === 'code') {
        const definition = VARIANT_ATTRIBUTE_TYPES.find(([code]) => code === value);
        return { ...attribute, code: value, label: definition?.[1] || value };
      }
      const normalizedValue = field === 'valueLabel'
        ? value.toLowerCase().trim().replace(/\s+/g, '_')
        : attribute.valueCode;
      return { ...attribute, [field]: value, valueCode: normalizedValue };
    })
  }));

  const handleDeleteProduct = async (id) => {
    if (!await pawzzleConfirm('This product will be removed from your supplier catalog.', {
      title: 'Delete this product?',
      confirmLabel: 'Delete product',
      tone: 'danger'
    })) return;
    try {
      await supplierService.deleteProduct(id);
      toast.success('Product removed');
      setProducts(prev => prev.filter(p => p._id !== id));
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to delete'); }
  };

  const handleDiscontinueVariant = async (productId, variantId) => {
    if (!variantCapabilities.enabled) return toast.error('Variant management is not active yet.');
    if (!await pawzzleConfirm('This keeps the variant for history but permanently removes it from availability.', {
      title: 'Discontinue this variant?',
      confirmLabel: 'Discontinue variant',
      tone: 'danger'
    })) return;
    try {
      const response = await supplierService.discontinueVariant(productId, variantId, 'Discontinued by supplier');
      updateVariant((productForm.variants || []).findIndex(item => item._id === variantId), item => ({ ...item, ...response.data }));
      setProducts(current => current.map(product => product._id === productId
        ? { ...product, variants: (product.variants || []).map(item => item._id === variantId ? response.data : item) }
        : product));
      toast.success('Variant discontinued. Its history and SKU claim were preserved.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to discontinue variant.');
    }
  };

  const handleOrderAction = async (orderId, status, notes = '') => {
    try {
      await supplierService.updateOrderStatus(orderId, { status, supplierNotes: notes });
      toast.success(`Order ${status}`);
      const res = await supplierService.getOrders();
      setOrders(res.data.orders || []);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const unresolvedItemsFor = order => {
    const report = order.receivingReport;
    if (!report || typeof report !== 'object') return [];
    const replacements = {};
    (report.reinspections || []).filter(row => row.processingStatus === 'completed').forEach(row => {
      (row.items || []).forEach(item => {
        const id = String(item.purchaseOrderItem);
        replacements[id] = (replacements[id] || 0) + Number(item.acceptedQuantity || 0);
      });
    });
    const adjusted = {};
    (report.resolutionSubmissions || []).filter(row => row.type === 'refund_credit' && row.financialAdjustment?.status === 'approved').forEach(row => {
      (row.items || []).forEach(item => {
        const id = String(item.purchaseOrderItem);
        adjusted[id] = (adjusted[id] || 0) + Number(item.proposedQuantity || 0);
      });
    });
    return (report.items || []).map(item => {
      const id = String(item.purchaseOrderItem);
      const orderItem = order.items?.find(row => String(row._id) === id);
      return {
        ...item,
        productName: orderItem?.productName || 'Purchase order item',
        itemType: orderItem?.itemType,
        unresolvedQuantity: Math.max(0, Number(item.expectedQuantity || 0) - Number(item.acceptedQuantity || 0) - Number(replacements[id] || 0) - Number(adjusted[id] || 0))
      };
    }).filter(item => item.unresolvedQuantity > 0);
  };

  const resolutionTypeFor = order => unresolvedItemsFor(order).some(item => item.itemType === 'live_pet')
    ? 'refund_credit'
    : (resolutionDrafts[order._id]?.type || 'replacement');

  const updateResolutionDraft = (orderId, patch) => setResolutionDrafts(previous => ({
    ...previous,
    [orderId]: { type: 'replacement', adjustmentType: 'credit', notes: '', quantities: {}, ...(previous[orderId] || {}), ...patch }
  }));

  const handleSubmitResolution = async order => {
    const draft = { adjustmentType: 'credit', notes: '', quantities: {}, ...(resolutionDrafts[order._id] || {}), type: resolutionTypeFor(order) };
    try {
      await supplierService.submitOrderResolution(order._id, {
        type: draft.type,
        adjustmentType: draft.adjustmentType,
        proposedAmount: draft.type === 'refund_credit' ? Number(draft.proposedAmount) : undefined,
        notes: draft.notes,
        items: unresolvedItemsFor(order).map(item => ({
          purchaseOrderItem: item.purchaseOrderItem,
          proposedQuantity: Number(draft.quantities?.[String(item.purchaseOrderItem)] ?? item.unresolvedQuantity)
        })).filter(item => item.proposedQuantity > 0)
      });
      toast.success('Resolution submitted for Store review.');
      await loadData();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to submit the resolution.'); }
  };

  const handleResolutionDelivered = async (order, resolution) => {
    try {
      await supplierService.markResolutionDelivered(order._id, resolution._id, {});
      toast.success('Store receiving staff were notified to reinspect the delivery.');
      await loadData();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to report the resolution delivery.'); }
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

  const handleVariantImageUpload = async (variantIndex, event) => {
    const files = event.target.files;
    if (!files?.length) return;
    const fd = new FormData();
    for (let index = 0; index < files.length; index++) fd.append('images', files[index]);
    try {
      const response = await uploadService.uploadMultipleImages(fd);
      const urls = response.data.urls || response.data.imageUrls || [];
      updateVariant(variantIndex, variant => ({ ...variant, images: [...(variant.images || []), ...urls].slice(0, 10) }));
    } catch (_error) {
      toast.error('Variant image upload failed.');
    } finally {
      event.target.value = '';
    }
  };

  const handleComplianceUpload = async event => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setSubmitting(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('document', file);
        const response = await uploadService.uploadDocument(fd);
        uploaded.push({
          documentType: requiresFdaReview(productForm.category) ? 'fda_registration' : 'supporting_document',
          documentUrl: response.data.url,
          originalName: response.data.originalName || file.name
        });
      }
      setProductForm(current => ({
        ...current,
        regulatoryDocuments: [...(current.regulatoryDocuments || []), ...uploaded]
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Compliance document upload failed');
    } finally {
      setSubmitting(false);
      event.target.value = '';
    }
  };

  const productReviewStatus = product => {
    if (!requiresFdaReview(product.category)) return { label: 'FDA review not required', classes: 'bg-primary-50 text-primary-800' };
    if (product.requiresPlatformReview !== true) return { label: 'Legacy regulated item', classes: 'bg-slate-100 text-slate-600' };
    return ({
      pending_review: { label: 'FDA compliance review', classes: 'bg-amber-100 text-amber-800' },
      approved: { label: 'FDA evidence reviewed', classes: 'bg-emerald-100 text-emerald-800' },
      changes_requested: { label: 'Changes requested', classes: 'bg-orange-100 text-orange-800' },
      rejected: { label: 'Rejected', classes: 'bg-rose-100 text-rose-700' }
    }[product.approvalStatus] || { label: 'FDA compliance review', classes: 'bg-amber-100 text-amber-800' });
  };

  const statusColor = (s) => ({
    submitted: 'amber', confirmed: 'primary', processing: 'primary', shipped: 'primary',
    delivered: 'emerald', completed: 'emerald', resolved: 'emerald', issue_reported: 'rose',
    pending_supplier_resolution: 'amber', resolution_submitted: 'primary', resolution_accepted: 'primary',
    resolution_rejected: 'rose', awaiting_replacement: 'amber', reinspection: 'primary',
    returned: 'amber', cancelled: 'rose'
  }[s] || 'slate');

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
          { label: 'Published', value: stats?.activeProducts || 0, icon: Package },
          { label: 'Awaiting Review', value: stats?.pendingProducts || 0, icon: Clock },
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
                  <p className="text-[9px] font-black text-primary-600 uppercase tracking-widest">{p.itemType === 'live_pet' ? 'Live pet · unique animal' : `${p.itemType === 'product' ? 'Product' : 'Pet supply'} · ${p.category?.replace('_', ' ')}`}</p>
                  {(() => { const review = productReviewStatus(p); return <span className={`mt-2 inline-flex items-center rounded-full px-2 py-1 text-[8px] font-black uppercase ${review.classes}`}><ShieldCheck className="mr-1 h-3 w-3" />{review.label}</span>; })()}
                  <h4 className="mt-1 min-h-[2.5rem] text-sm font-black uppercase leading-tight text-slate-900 line-clamp-2 break-words">{p.name}</h4>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase">Wholesale</p>
                      <p className="text-sm font-black text-slate-900">{formatPeso(p.wholesalePrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-400 uppercase">{p.itemType === 'live_pet' ? 'Availability' : 'Stock'}</p>
                      <p className={`text-sm font-black ${p.availableStock <= 0 ? 'text-rose-600' : p.availableStock < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>{p.itemType === 'live_pet' ? (p.availableStock === 1 ? 'Available' : 'Unavailable') : p.availableStock}</p>
                    </div>
                  </div>
                  {p.productMode === 'variant' && <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between"><p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Variants</p><span className="text-[9px] font-black text-primary-700">{p.variants?.length || 0}</span></div>
                    {(p.variants || []).map(variant => <div key={variant._id} className="rounded-lg border border-slate-100 bg-white p-2 text-[9px]">
                      <div className="flex items-start justify-between gap-2"><span className="font-black text-slate-800">{(variant.attributes || []).map(attribute => attribute.valueLabel).join(' · ')}</span><span className={`rounded-full px-1.5 py-0.5 font-black uppercase ${variant.isDiscontinued ? 'bg-slate-100 text-slate-500' : variant.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-primary-50 text-primary-700'}`}>{variant.isDiscontinued ? 'Discontinued' : variant.isActive ? 'Available' : 'Paused'}</span></div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-500"><span>SKU {variant.sku}</span><span>{formatPeso(variant.wholesalePrice)}</span><span>Stock {variant.availableStock}</span><span>MOQ {variant.minimumOrderQuantity}</span></div>
                      {requiresFdaReview(p.category) && <span className="mt-1 inline-block font-bold uppercase text-primary-700">FDA: {String(variant.regulatoryReview?.status || 'pending_review').replace('_', ' ')}</span>}
                    </div>)}
                  </div>}
                  {p.reviewReason && <p className="mt-3 rounded-xl bg-rose-50 p-2 text-[10px] font-semibold text-rose-700">Review note: {p.reviewReason}</p>}
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
              {order.receivingReport && typeof order.receivingReport === 'object' && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-widest text-amber-900">Receiving inspection</p><span className="rounded-full bg-white px-2 py-1 text-[8px] font-black uppercase text-amber-800">{order.receivingReport.resolutionStatus?.replaceAll('_', ' ') || order.receivingReport.outcome?.replaceAll('_', ' ')}</span></div>
                {order.receivingReport.notes && <p className="mt-2 text-[10px] text-amber-900">{order.receivingReport.notes}</p>}
                <p className="mt-1 text-[9px] text-amber-800">Inspected {order.receivingReport.receivedAt ? new Date(order.receivingReport.receivedAt).toLocaleString() : ''}{order.receivingReport.receivedBy ? ` by ${order.receivingReport.receivedBy.firstName || ''} ${order.receivingReport.receivedBy.lastName || ''}` : ''}</p>
                <div className="mt-2 space-y-1">{unresolvedItemsFor(order).map(item => <p key={String(item.purchaseOrderItem)} className="text-[9px] text-amber-900"><strong>{item.productName}:</strong> {item.expectedQuantity} ordered, {item.acceptedQuantity} accepted, {item.unresolvedQuantity} unresolved ({item.condition})</p>)}</div>
                <div className="mt-2 space-y-1">{order.receivingReport.items?.filter(item => item.missingQuantity || item.damagedQuantity || item.incorrectQuantity).map(item => <p key={item._id} className="text-[9px] text-amber-900">Item discrepancy: {item.missingQuantity || 0} missing · {item.damagedQuantity || 0} damaged · {item.incorrectQuantity || 0} incorrect{item.notes ? ` · ${item.notes}` : ''}</p>)}</div>
                <ProcurementEvidenceGallery orderId={order._id} evidence={order.receivingReport.evidence} imageClassName="h-16 w-16 rounded-lg object-cover" />
                <ProcurementReinspectionEvidenceGallery orderId={order._id} reinspections={order.receivingReport.reinspections} imageClassName="h-16 w-16 rounded-lg object-cover" />
                {['pending_supplier_resolution', 'resolution_rejected'].includes(order.receivingReport.resolutionStatus) && <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-white p-3">
                  <p className="text-[9px] font-black uppercase text-slate-700">Submit a resolution</p>
                  <select value={resolutionTypeFor(order)} onChange={event => updateResolutionDraft(order._id, { type: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    {!unresolvedItemsFor(order).some(item => item.itemType === 'live_pet') && <><option value="replacement">Replacement</option><option value="return_correction">Return / correction</option></>}
                    <option value="refund_credit">Refund / credit proposal</option>
                  </select>
                  {unresolvedItemsFor(order).map(item => <label key={String(item.purchaseOrderItem)} className="grid grid-cols-[1fr_5rem] items-center gap-2 text-[10px] text-slate-700">
                    <span>{item.productName} ({item.unresolvedQuantity} unresolved)</span>
                    <input type="number" min="1" max={item.unresolvedQuantity} value={resolutionDrafts[order._id]?.quantities?.[String(item.purchaseOrderItem)] ?? item.unresolvedQuantity} onChange={event => updateResolutionDraft(order._id, { quantities: { ...(resolutionDrafts[order._id]?.quantities || {}), [String(item.purchaseOrderItem)]: event.target.value } })} className="rounded-lg border border-slate-200 px-2 py-1.5" />
                  </label>)}
                  {resolutionTypeFor(order) === 'refund_credit' && <div className="grid gap-2 sm:grid-cols-2">
                    <select value={resolutionDrafts[order._id]?.adjustmentType || 'credit'} onChange={event => updateResolutionDraft(order._id, { adjustmentType: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="credit">Credit</option><option value="refund">Refund</option></select>
                    <input type="number" min="0.01" step="0.01" placeholder="Proposed amount" value={resolutionDrafts[order._id]?.proposedAmount || ''} onChange={event => updateResolutionDraft(order._id, { proposedAmount: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                  </div>}
                  <textarea placeholder="Resolution notes" value={resolutionDrafts[order._id]?.notes || ''} onChange={event => updateResolutionDraft(order._id, { notes: event.target.value })} className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                  <button onClick={() => handleSubmitResolution(order)} className="rounded-lg bg-primary-600 px-3 py-2 text-[9px] font-black uppercase text-white">Submit resolution</button>
                </div>}
                {order.receivingReport.resolutionSubmissions?.slice(-1).map(resolution => resolution.status === 'awaiting_replacement' && <button key={resolution._id} onClick={() => handleResolutionDelivered(order, resolution)} className="mt-3 rounded-lg bg-primary-600 px-3 py-2 text-[9px] font-black uppercase text-white">Mark replacement/correction delivered</button>)}
              </div>}
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {order.status === 'submitted' && (
                  <>
                    {order.paymentTiming === 'pay_now' && order.paymentStatus !== 'paid' ? <span className="rounded-xl bg-amber-100 px-4 py-2 text-[9px] font-black uppercase text-amber-800">Awaiting verified payment</span> : <button onClick={() => handleOrderAction(order._id, 'confirmed')}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all">Accept</button>
                    }
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
              <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-xs leading-5 text-primary-900">
                <b className="flex items-center gap-2 uppercase"><ShieldCheck className="h-4 w-4" /> {requiresFdaReview(productForm.category) ? 'FDA compliance review required' : 'FDA review not required'}</b>
                <p className="mt-1">{requiresFdaReview(productForm.category)
                  ? 'Food and medicine supplies stay unpublished until a Pawzzle Platform Administrator verifies the submitted FDA registration details and evidence. Pawzzle does not issue FDA registrations.'
                  : 'Accessories, toys, equipment, grooming, cleaning, live pets, and other non-regulated supplies publish without FDA review.'}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[['pet_supply','Pet Supply'],['product','Other Product'],['live_pet','Live Pet']].map(([value,label]) => <button key={value} type="button" disabled={Boolean(editingProduct)} onClick={() => setProductForm(p => ({ ...p, itemType: value, category: value === 'live_pet' ? 'live_pets' : value === 'product' ? 'general_product' : (p.category === 'live_pets' || p.category === 'general_product' ? 'pet_food' : p.category), availableStock: value === 'live_pet' ? 1 : p.availableStock, minimumOrderQuantity: value === 'live_pet' ? 1 : p.minimumOrderQuantity }))} className={`rounded-xl border px-3 py-2 text-[9px] font-black uppercase ${productForm.itemType === value ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500'} disabled:cursor-not-allowed`}>{label}</button>)}
              </div>
              {productForm.itemType !== 'live_pet' && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Product configuration</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={Boolean(editingProduct)} onClick={() => setProductForm(p => ({ ...p, productMode: 'simple', variants: [] }))} className={`rounded-xl border px-3 py-3 text-left ${productForm.productMode !== 'variant' ? 'border-primary-600 bg-white text-primary-800' : 'border-slate-200 bg-white text-slate-500'} disabled:cursor-not-allowed`}>
                    <span className="block text-[10px] font-black uppercase">Simple product</span><span className="mt-1 block text-[10px] font-medium normal-case">One SKU, price, and stock quantity.</span>
                  </button>
                  <button type="button" disabled={Boolean(editingProduct) || !variantCapabilities.enabled} onClick={() => setProductForm(p => ({ ...p, productMode: 'variant', variants: p.variants?.length ? p.variants : [emptyVariant()] }))} className={`rounded-xl border px-3 py-3 text-left ${productForm.productMode === 'variant' ? 'border-primary-600 bg-white text-primary-800' : 'border-slate-200 bg-white text-slate-500'} disabled:cursor-not-allowed disabled:opacity-60`}>
                    <span className="block text-[10px] font-black uppercase">Product with variants</span><span className="mt-1 block text-[10px] font-medium normal-case">Explicit combinations such as Chicken · 1 kg.</span>
                  </button>
                </div>
                {!variantCapabilities.enabled && <p className="mt-3 rounded-xl border border-primary-100 bg-white p-3 text-[10px] font-semibold leading-4 text-primary-900">Product variants require one-time platform activation. Ask the platform administrator to complete supplier variant database readiness, then refresh this page.</p>}
              </div>}
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{productForm.itemType === 'live_pet' ? 'Pet / Catalog Name' : 'Product Name'}</label>
                  <input type="text" value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{productForm.productMode === 'variant' ? 'Parent catalog SKU' : 'SKU'}</label>
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
                {productForm.productMode !== 'variant' && <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Wholesale Price (₱)</label>
                  <input type="number" value={productForm.wholesalePrice} onChange={e => setProductForm(p => ({ ...p, wholesalePrice: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" />
                </div>}
                {productForm.productMode !== 'variant' && <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Stock</label>
                  <input type="number" disabled={productForm.itemType === 'live_pet'} value={productForm.itemType === 'live_pet' ? 1 : productForm.availableStock} onChange={e => setProductForm(p => ({ ...p, availableStock: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none disabled:opacity-60" />
                </div>}
                {productForm.productMode !== 'variant' && <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Min Order Qty</label>
                  <input type="number" disabled={productForm.itemType === 'live_pet'} value={productForm.itemType === 'live_pet' ? 1 : productForm.minimumOrderQuantity} onChange={e => setProductForm(p => ({ ...p, minimumOrderQuantity: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none disabled:opacity-60" />
                </div>}
                {productForm.productMode !== 'variant' && <label className="space-y-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Unit of measure
                  <select value={productForm.itemType === 'live_pet' ? 'piece' : productForm.unitOfMeasure} disabled={productForm.itemType === 'live_pet'} onChange={e => setProductForm(p => ({ ...p, unitOfMeasure: e.target.value }))} className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold normal-case text-slate-900 disabled:opacity-60">
                    {['piece', 'pack', 'box', 'kg', 'liter', 'bag', 'bottle', 'set', 'ml', 'gram', 'tube'].map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </label>}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lead Time (days)</label>
                  <input type="number" value={productForm.deliveryLeadTimeDays} onChange={e => setProductForm(p => ({ ...p, deliveryLeadTimeDays: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none" />
                </div>
              </div>
              {productForm.productMode === 'variant' && <div className="space-y-3 rounded-2xl border border-primary-200 bg-primary-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h4 className="text-xs font-black uppercase text-primary-900">Explicit variant combinations</h4><p className="mt-1 text-[10px] text-primary-800">Add only combinations that you actually stock. Every row has its own SKU, price, stock, MOQ, and availability.</p></div>
                  <button type="button" onClick={() => setProductForm(p => ({ ...p, variants: [...(p.variants || []), emptyVariant()] }))} className="inline-flex items-center gap-1 rounded-xl bg-primary-700 px-3 py-2 text-[9px] font-black uppercase text-white"><Plus className="h-3.5 w-3.5" /> Add combination</button>
                </div>
                {(productForm.variants || []).map((variant, variantIndex) => <div key={variant._id || variantIndex} className="rounded-2xl border border-primary-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase text-slate-700">Variant {variantIndex + 1}</p><div className="flex items-center gap-2">{variant._id && !variant.isDiscontinued && <button type="button" disabled={!variantCapabilities.enabled} onClick={() => handleDiscontinueVariant(editingProduct._id, variant._id)} className="rounded-lg border border-rose-100 px-2 py-1 text-[8px] font-black uppercase text-rose-600 disabled:opacity-40">Discontinue</button>}{!variant._id && <button type="button" onClick={() => setProductForm(p => ({ ...p, variants: p.variants.filter((_, index) => index !== variantIndex) }))} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div></div>
                  <div className="mt-3 space-y-2">
                    {(variant.attributes || []).map((attribute, attributeIndex) => <div key={`${variantIndex}-${attributeIndex}`} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] gap-2">
                      <select value={attribute.code} onChange={e => setVariantAttribute(variantIndex, attributeIndex, 'code', e.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800">{VARIANT_ATTRIBUTE_TYPES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
                      <input value={attribute.valueLabel} onChange={e => setVariantAttribute(variantIndex, attributeIndex, 'valueLabel', e.target.value)} placeholder="Example: Chicken or 1 kg" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-900" />
                      <button type="button" disabled={variant.attributes.length === 1} onClick={() => updateVariant(variantIndex, item => ({ ...item, attributes: item.attributes.filter((_, index) => index !== attributeIndex) }))} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 disabled:opacity-30"><X className="h-4 w-4" /></button>
                    </div>)}
                    <button type="button" onClick={() => updateVariant(variantIndex, item => ({ ...item, attributes: [...item.attributes, { code: 'flavor', label: 'Flavor', valueCode: '', valueLabel: '' }] }))} className="text-[9px] font-black uppercase text-primary-700">+ Add attribute</button>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="text-[9px] font-black uppercase text-slate-500">Variant SKU<input value={variant.sku} onChange={e => setVariantField(variantIndex, 'sku', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case" /></label>
                    <label className="text-[9px] font-black uppercase text-slate-500">Wholesale price<input type="number" min="0" value={variant.wholesalePrice} onChange={e => setVariantField(variantIndex, 'wholesalePrice', Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case" /></label>
                    <label className="text-[9px] font-black uppercase text-slate-500">Supplier stock<input type="number" min="0" step="1" value={variant.availableStock} onChange={e => setVariantField(variantIndex, 'availableStock', Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case" /></label>
                    <label className="text-[9px] font-black uppercase text-slate-500">Minimum order<input type="number" min="1" step="1" value={variant.minimumOrderQuantity} onChange={e => setVariantField(variantIndex, 'minimumOrderQuantity', Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case" /></label>
                    <label className="text-[9px] font-black uppercase text-slate-500">Unit<select value={variant.unitOfMeasure} onChange={e => setVariantField(variantIndex, 'unitOfMeasure', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm normal-case">{['piece','pack','box','kg','liter','bag','bottle','set','ml','gram','tube'].map(unit => <option key={unit}>{unit}</option>)}</select></label>
                    <label className="text-[9px] font-black uppercase text-slate-500">Package weight<div className="mt-1 flex"><input type="number" min="0.001" value={variant.weight} onChange={e => setVariantField(variantIndex, 'weight', e.target.value)} className="min-w-0 flex-1 rounded-l-xl border border-slate-200 px-3 py-2.5 text-sm normal-case" /><select value={variant.weightUnit} onChange={e => setVariantField(variantIndex, 'weightUnit', e.target.value)} className="rounded-r-xl border border-l-0 border-slate-200 px-2 text-xs"><option>g</option><option>kg</option></select></div></label>
                    <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-3 text-[9px] font-black uppercase text-slate-600"><input type="checkbox" checked={variant.isActive !== false && !variant.isDiscontinued} disabled={variant.isDiscontinued} onChange={e => setVariantField(variantIndex, 'isActive', e.target.checked)} className="h-4 w-4 accent-primary-700" /> Available to supplier catalog</label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">{(variant.images || []).map((image, imageIndex) => <div key={`${image}-${imageIndex}`} className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200"><img src={getImageUrl(image)} alt="" className="h-full w-full object-cover" /><button type="button" onClick={() => updateVariant(variantIndex, item => ({ ...item, images: item.images.filter((_, index) => index !== imageIndex) }))} className="absolute right-0 top-0 rounded-bl bg-slate-900/80 p-1 text-white"><X className="h-3 w-3" /></button></div>)}<label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-[8px] font-black uppercase text-slate-600"><Plus className="h-3.5 w-3.5" /> Variant image<input type="file" accept="image/*" multiple className="hidden" onChange={event => handleVariantImageUpload(variantIndex, event)} /></label></div>
                  {requiresFdaReview(productForm.category) && <p className="mt-3 rounded-xl bg-primary-50 p-3 text-[10px] font-semibold text-primary-900">This regulated variant starts as Pending FDA review. It does not inherit parent approval.</p>}
                </div>)}
              </div>}
              {productForm.itemType === 'live_pet' && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div><h4 className="text-xs font-black uppercase text-amber-900">Exact animal information</h4><p className="mt-1 text-[10px] text-amber-800">Each catalog entry represents one unique animal. Quantity is permanently limited to one.</p></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[['name','Pet name'],['breed','Breed'],['color','Color / markings']].map(([key,label]) => <label key={key} className="text-[9px] font-black uppercase text-slate-500">{label}<input required value={productForm.pet?.[key] || ''} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, [key]: e.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case" /></label>)}
                  <label className="text-[9px] font-black uppercase text-slate-500">Species<select value={productForm.pet?.species || 'dog'} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, species: e.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case">{['dog','cat','bird','fish','rabbit','hamster','reptile','other'].map(value => <option key={value}>{value}</option>)}</select></label>
                  <label className="text-[9px] font-black uppercase text-slate-500">Age<input required min="0" type="number" value={productForm.pet?.age ?? 0} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, age: Number(e.target.value) } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case" /></label>
                  <label className="text-[9px] font-black uppercase text-slate-500">Age unit<select value={productForm.pet?.ageUnit || 'years'} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, ageUnit: e.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case"><option value="months">Months</option><option value="years">Years</option></select></label>
                  <label className="text-[9px] font-black uppercase text-slate-500">Sex<select value={productForm.pet?.gender || 'male'} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, gender: e.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case"><option value="male">Male</option><option value="female">Female</option></select></label>
                  <label className="text-[9px] font-black uppercase text-slate-500">Size<select value={productForm.pet?.size || 'medium'} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, size: e.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case">{['small','medium','large','extra_large'].map(value => <option key={value}>{value.replace('_', ' ')}</option>)}</select></label>
                  <label className="text-[9px] font-black uppercase text-slate-500">Vaccination<select value={productForm.pet?.vaccinationStatus || 'none'} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, vaccinationStatus: e.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case"><option value="none">None documented</option><option value="partial">Partial</option><option value="complete">Complete</option></select></label>
                  <label className="text-[9px] font-black uppercase text-slate-500 sm:col-span-2">Pet description<textarea required value={productForm.pet?.description || ''} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, description: e.target.value } }))} className="mt-1 min-h-20 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case" /></label>
                  <label className="text-[9px] font-black uppercase text-slate-500 sm:col-span-2">Health notes<textarea value={productForm.pet?.healthNotes || ''} onChange={e => setProductForm(p => ({ ...p, pet: { ...p.pet, healthNotes: e.target.value } }))} className="mt-1 min-h-16 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm normal-case" /></label>
                </div>
              </div>}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                <textarea value={productForm.description} onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium outline-none h-20 resize-none" />
              </div>
              {requiresFdaReview(productForm.category) && <div className="grid gap-4 rounded-2xl border border-primary-200 bg-primary-50 p-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><h4 className="text-xs font-black uppercase text-primary-900">FDA product registration details</h4><p className="mt-1 text-[10px] text-primary-800">Enter the registration details issued by the FDA and upload evidence below. Pawzzle administrators verify the submitted record; they do not issue FDA approval.</p></div>
                <label className="text-[9px] font-black uppercase text-slate-600">FDA registration number <span className="text-primary-700">Required</span><input required value={productForm.fdaRegistrationNumber || ''} onChange={e => setProductForm(p => ({ ...p, fdaRegistrationNumber: e.target.value }))} placeholder="Enter the FDA product registration number" className="mt-1 w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm font-medium normal-case text-slate-900" /></label>
                <label className="text-[9px] font-black uppercase text-slate-600">Registration expiry <span className="font-bold normal-case text-slate-400">(if shown)</span><input type="date" value={productForm.fdaRegistrationExpiry ? String(productForm.fdaRegistrationExpiry).slice(0, 10) : ''} onChange={e => setProductForm(p => ({ ...p, fdaRegistrationExpiry: e.target.value }))} className="mt-1 w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm font-medium normal-case text-slate-900" /></label>
              </div>}
              {['pet_food', 'pet_treats'].includes(productForm.category) && <div className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><h4 className="text-xs font-black uppercase text-emerald-900">Pet food and nutrition information</h4><p className="mt-1 text-[10px] text-emerald-800">Required for FDA compliance review of food and treats.</p></div>
                <label className="text-[9px] font-black uppercase text-slate-600">Ingredients<textarea required value={productForm.ingredients || ''} onChange={e => setProductForm(p => ({ ...p, ingredients: e.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-medium normal-case" /></label>
                <label className="text-[9px] font-black uppercase text-slate-600">Nutritional information<textarea required value={productForm.nutritionalInformation || ''} onChange={e => setProductForm(p => ({ ...p, nutritionalInformation: e.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-medium normal-case" /></label>
              </div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Intended species
                  <input value={(productForm.intendedSpecies || []).join(', ')} onChange={e => setProductForm(p => ({ ...p, intendedSpecies: e.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} placeholder="Dog, cat" className="mt-1 w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium normal-case text-slate-900" />
                </label>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Safety / handling notes
                  <input value={productForm.safetyNotes || ''} onChange={e => setProductForm(p => ({ ...p, safetyNotes: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium normal-case text-slate-900" />
                </label>
              </div>
              <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
                <div><h4 className="text-[9px] font-black uppercase tracking-widest text-slate-600">{requiresFdaReview(productForm.category) ? 'FDA compliance evidence' : 'Supporting documents'}</h4><p className="mt-1 text-[10px] text-slate-500">{requiresFdaReview(productForm.category) ? 'Required: upload the FDA registration, product certificate, or equivalent evidence that matches the registration number above.' : 'Optional: upload product specifications, test results, or other supporting files. FDA evidence is not required for this category.'}</p></div>
                <div className="flex flex-wrap gap-2">{(productForm.regulatoryDocuments || []).map((document, index) => <div key={`${document.documentUrl}-${index}`} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] text-slate-700"><FileText className="h-3.5 w-3.5" /><span className="max-w-[12rem] truncate">{document.originalName || 'Supporting document'}</span><button type="button" onClick={() => setProductForm(p => ({ ...p, regulatoryDocuments: p.regulatoryDocuments.filter((_, itemIndex) => itemIndex !== index) }))} className="text-rose-600"><X className="h-3.5 w-3.5" /></button></div>)}</div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[9px] font-black uppercase text-slate-600 hover:border-primary-500"><Plus className="h-4 w-4" /> {requiresFdaReview(productForm.category) ? 'Upload FDA evidence' : 'Add supporting files'}<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={handleComplianceUpload} /></label>
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
                {submitting
                  ? 'Submitting...'
                  : requiresFdaReview(productForm.category)
                    ? editingProduct ? 'Update & Submit for FDA Review' : 'Submit for FDA Review'
                    : editingProduct ? 'Update Supply' : 'Publish Supply'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierDashboard;
