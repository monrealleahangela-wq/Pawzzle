import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { productService, adminProductService, inventoryService, uploadService, getImageUrl } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import {
  Package,
  AlertTriangle,
  TrendingDown,
  Plus,
  Edit,
  Trash2,
  Search,
  Box,
  X,
  Activity,
  Image as ImageIcon,
  ChevronRight,
  Shield,
  Zap,
  Target,
  Briefcase,
  Layers,
  ArrowUpRight,
  Filter,
  Scale,
  Maximize,
  Tag,
  Star,
  Info,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Menu,
  Video,
  FileText,
  Table,
  MapPin,
  Clock
} from 'lucide-react';

const PhilippinePeso = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M20 11H4" />
    <path d="M20 7H4" />
    <path d="M7 21V4a5 5 0 0 1 5 5c0 2.2-1.8 3-5 3Z" />
  </svg>
);

const ProductInventory = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Permission Checks
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const params = { ...productFilters, page: pagination.currentPage, limit: 20 };
      const userData = JSON.parse(localStorage.getItem('user') || '{}');

      const response = (userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'staff')
        ? await adminProductService.getAllProducts(params)
        : await productService.getAllProducts(params);

      setProducts(response.data.products || []);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [productFilters, pagination.currentPage]);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const params = { ...inventoryFilters, page: pagination.currentPage, limit: 100 };
      const response = await inventoryService.adminGetInventory(params);

      const serverInventory = response.data?.inventory || [];
      const serverSummary = response.data?.summary || summary;

      setInventory(serverInventory.map(item => ({
        _id: item.product?._id,
        name: item.product?.name,
        category: item.product?.category,
        brand: item.product?.brand,
        currentStock: item.quantity || 0,
        reorderLevel: item.reorderLevel || 0,
        inventoryId: item.inventoryId || item._id,
        images: item.product?.images || []
      })));

      setSummary(serverSummary);
      setPagination(response.data?.pagination || pagination);
    } catch (error) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [inventoryFilters, pagination.currentPage]);

  // Real-time Updates
  useRealTimeUpdates({
    onInventoryUpdate: (data) => {
      console.log('📦 Real-time inventory update received:', data);
      if (activeTab === 'products') fetchProducts();
      else fetchInventory();
    }
  });

  const canCreate = isAdmin || user?.permissions?.inventory?.create || user?.permissions?.inventory?.fullAccess;
  const canUpdate = isAdmin || user?.permissions?.inventory?.update || user?.permissions?.inventory?.fullAccess;
  const canDelete = isAdmin || user?.permissions?.inventory?.delete || user?.permissions?.inventory?.fullAccess;
  const canAdjustStock = canUpdate; // Using update for stock adjustments

  // Modal States
  const [showProductModal, setShowProductModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [modalTab, setModalTab] = useState('edit'); // edit or preview
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [productFilters, setProductFilters] = useState({ category: '', search: '' });
  const [inventoryFilters, setInventoryFilters] = useState({ status: '', search: '' });
  const [productSearchInput, setProductSearchInput] = useState('');
  const [inventorySearchInput, setInventorySearchInput] = useState('');

  const categoryHierarchy = {
    'Pet Food': ['Dog Food', 'Cat Food', 'Small Pet Food', 'Others'],
    'Pet Accessories': ['Bowls/Feeders', 'Toys', 'Furniture', 'Grooming', 'Others'],
    'Pet Clothing': ['Clothing', 'Accessories', 'Others'],
    'Pet Health Care': ['Vitamins', 'Medication', 'Others'],
    'Others': ['Miscellaneous']
  };

  const [inventoryForm, setInventoryForm] = useState({
    productId: '',
    quantity: 0,
    operation: 'add',
    reorderLevel: 10,
    notes: ''
  });

  const [summary, setSummary] = useState({ totalItems: 0, lowStockItems: 0, outOfStockItems: 0, totalValue: 0 });
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false });

  // Form States
  const initialProductState = {
    name: '',
    category: 'Pet Food',
    brand: '',
    sku: '',
    description: '',
    shortDescription: '',
    price: '',
    stockQuantity: '',
    stockStatus: 'in_stock',
    lowStockThreshold: 5,
    maxOrderQuantity: '',
    images: [],
    video: '',
    coverImage: '',
    variants: [], // { combination: '', price: '', stock: '', sku: '', type: 'Size' }
    fulfillmentType: 'pickup_only',
    pickupInstructions: '',
    visibility: 'published',
    tags: [],
    collectionGroup: '',
    warrantyInfo: '',
    returnPolicy: '',
    expiryDate: '',
    ingredients: '',
    usageInstructions: ''
  };

  const [productForm, setProductForm] = useState(initialProductState);
  const [activeSections, setActiveSections] = useState({
    basic: true,
    pricing: true,
    stock: true,
    variants: false,
    media: true,
    fulfillment: true,
    organization: true,
    additional: false
  });

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const params = { ...productFilters, page: pagination.currentPage, limit: 20 };
      const userData = JSON.parse(localStorage.getItem('user') || '{}');

      const response = (userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'staff')
        ? await adminProductService.getAllProducts(params)
        : await productService.getAllProducts(params);

      setProducts(response.data.products || []);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [productFilters, pagination.currentPage]);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const params = { ...inventoryFilters, page: pagination.currentPage, limit: 100 };
      const response = await inventoryService.adminGetInventory(params);

      const serverInventory = response.data?.inventory || [];
      const serverSummary = response.data?.summary || summary;

      setInventory(serverInventory.map(item => ({
        _id: item.product?._id,
        name: item.product?.name,
        category: item.product?.category,
        brand: item.product?.brand,
        currentStock: item.quantity || 0,
        reorderLevel: item.reorderLevel || 0,
        inventoryId: item.inventoryId || item._id,
        images: item.product?.images || []
      })));

      setSummary(serverSummary);
      setPagination(response.data?.pagination || pagination);
    } catch (error) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [inventoryFilters, pagination.currentPage]);

  useEffect(() => {
    if (activeTab === 'products') fetchProducts();
    else fetchInventory();
  }, [activeTab, fetchProducts, fetchInventory]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'products') setProductFilters(prev => ({ ...prev, search: productSearchInput }));
      else setInventoryFilters(prev => ({ ...prev, search: inventorySearchInput }));
    }, 500);
    return () => clearTimeout(timer);
  }, [productSearchInput, inventorySearchInput, activeTab]);

  const handleOpenProductModal = (product = null) => {
    setActiveSections({
      basic: true,
      pricing: true,
      stock: true,
      variants: false,
      media: true,
      fulfillment: true,
      organization: true,
      additional: false
    });
    setModalTab('edit'); // edit or preview
    if (product) {
      setEditingProduct(product);
      setProductForm({
        ...initialProductState,
        ...product,
        price: product.price || '',
        stockQuantity: product.stockQuantity || '',
        sku: product.sku || ''
      });
    } else {
      setEditingProduct(null);
      setProductForm(initialProductState);
    }
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    if (e) e.preventDefault();
    
    // Validations
    if (!productForm.name || !productForm.category || !productForm.sku) {
      return toast.warn('Aquisition Error: Name, Category, and SKU are required.');
    }
    if (Number(productForm.price) <= 0) {
      return toast.warn('Price must be greater than 0.');
    }
    if (productForm.images.length < 1) {
      return toast.warn('Media Error: Minimum 1 image required.');
    }
    if (productForm.images.length > 10) {
      return toast.warn('Media Error: Maximum 10 images allowed.');
    }

    setSubmitting(true);
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const isAdminOrStaff = userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'staff';

      const payload = {
        ...productForm,
        price: Number(productForm.price),
        stockQuantity: Number(productForm.stockQuantity || 0)
      };

      if (editingProduct) {
        if (isAdminOrStaff) await adminProductService.updateProduct(editingProduct._id, payload);
        else await productService.updateProduct(editingProduct._id, payload);
        toast.success('Asset synchronized successfully.');
      } else {
        if (isAdminOrStaff) await adminProductService.createProduct(payload);
        else await productService.createProduct(payload);
        toast.success(`Asset "${productForm.name}" acquired and logged.`);
      }

      setShowProductModal(false);
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Synchronization failure. Ensure SKU is unique.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (productForm.images.length + files.length > 9) {
      return toast.warn('Media Error: Capacity reached (Max 9 images).');
    }

    setSubmitting(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }

    try {
      const response = await uploadService.uploadMultipleImages(formData);
      const newUrls = response.data.urls || response.data.imageUrls || [];
      setProductForm(prev => ({ ...prev, images: [...prev.images, ...newUrls] }));
      toast.success('Visual streams connected.');
    } catch (error) {
      toast.error('Upload protocol failure.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenInventoryModal = (item = null) => {
    if (item) {
      setSelectedInventoryItem(item);
      setInventoryForm({
        productId: item._id,
        quantity: 0,
        operation: 'add',
        reorderLevel: item.reorderLevel || 10,
        notes: ''
      });
    } else {
      setSelectedInventoryItem(null);
      setInventoryForm({
        productId: '',
        quantity: 0,
        operation: 'add',
        reorderLevel: 10,
        notes: ''
      });
    }
    setShowInventoryModal(true);
  };

  const handleInventorySubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (selectedInventoryItem && selectedInventoryItem.inventoryId) {
        await inventoryService.updateQuantity(selectedInventoryItem.inventoryId, {
          quantity: Number(inventoryForm.quantity),
          operation: inventoryForm.operation,
          notes: inventoryForm.notes
        });
        toast.success(`Inventory adjusted: ${inventoryForm.operation} ${inventoryForm.quantity}`);
      } else {
        await inventoryService.adminAddToInventory({
          productId: inventoryForm.productId,
          quantity: Number(inventoryForm.quantity),
          operation: inventoryForm.operation,
          reorderLevel: Number(inventoryForm.reorderLevel),
          notes: inventoryForm.notes
        });
        toast.success(`Inventory stock updated successfully via ${inventoryForm.operation}`);
      }

      setShowInventoryModal(false);
      fetchInventory();
      if (activeTab === 'products') fetchProducts();
    } catch (error) {
      toast.error('Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10 w-full lg:w-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary-600 text-white rounded-2xl shadow-lg shadow-primary-200">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMIN PANEL : PRODUCTS</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-[0.9] mb-3">
            Product <span className="text-primary-600">Inventory</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Track and manage your store products
          </p>
        </div>

        <div className="flex flex-wrap gap-3 w-full lg:w-auto relative z-10">
          {canCreate && (
            <button onClick={() => handleOpenProductModal()} className="flex-1 lg:flex-none px-8 py-3.5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group">
              <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" /> Add Product
            </button>
          )}
          {canAdjustStock && (
            <button onClick={() => handleOpenInventoryModal()} className="flex-1 lg:flex-none px-8 py-3.5 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-50 transition-all flex items-center justify-center gap-3">
              <Zap className="h-4 w-4 text-primary-600 shadow-glow" /> Update Stock
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 p-1.5 bg-white border border-slate-100 rounded-2xl w-fit shadow-sm overflow-hidden">
        {[
          { id: 'products', label: 'Product Catalog', icon: Layers },
          { id: 'inventory', label: 'Inventory Status', icon: Activity }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPagination(prev => ({ ...prev, currentPage: 1 })); }}
            className={`px-6 py-3.5 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Viewport */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'products' ? (
          <div className="space-y-8">
            <div className="bg-slate-900 p-2 rounded-[2rem] shadow-xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-6 relative group">
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                        </div>
                        <input
                            type="text" 
                            value={productSearchInput} 
                            onChange={(e) => setProductSearchInput(e.target.value)}
                            placeholder="SEARCH CATALOG ASSETS..."
                            className="w-full pl-16 pr-4 py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/20 transition-all placeholder:text-slate-600 font-sans"
                        />
                    </div>
                    <div className="md:col-span-4 relative group">
                        <div className="absolute left-6 top-1/2 -translate-y-1/2">
                            <Layers className="h-3.5 w-3.5 text-primary-500" />
                        </div>
                        <select
                            value={productFilters.category} 
                            onChange={(e) => setProductFilters(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-16 pr-10 py-4 outline-none focus:ring-2 focus:ring-primary-500/20 appearance-none transition-all cursor-pointer font-sans"
                        >
                            <option value="" className="bg-slate-900 text-white font-black">ALL CATEGORIES: VIEW ALL</option>
                            {Object.keys(categoryHierarchy).map(c => (
                              <option key={c} value={c} className="bg-slate-900 text-white font-black">{c.toUpperCase()}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {products.map((product) => (
                <div key={product._id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col">
                  {/* Image */}
                  <div className="relative w-full aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                    {product.images?.[0] ? (
                      <img src={getImageUrl(product.images[0])} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                      <Package className="h-10 w-10 text-slate-200" />
                    )}

                    {/* Brand Overlay on Hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <span className="text-[9px] font-black text-white uppercase tracking-widest truncate w-full">
                        {product.brand || 'No Brand'}
                      </span>
                    </div>

                    {/* Top Badges */}
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider ${product.stockQuantity > 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                        {product.stockQuantity || 0} UNITS
                      </span>
                    </div>
                    {product.isFeatured && (
                      <div className="absolute top-2 left-2 bg-secondary-400 text-white p-1.5 rounded-lg shadow-lg">
                        <Star className="h-3 w-3 fill-current" />
                      </div>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col gap-3">
                    <div>
                      <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest leading-none mb-1.5 opacity-80">{product.category}</p>
                      <h3 className="text-[15px] font-black text-slate-900 uppercase leading-none truncate mb-1.5">
                        {product.name}
                      </h3>
                      <p className="text-[11px] font-bold text-slate-400 uppercase truncate tracking-tight">{product.brand || 'No Brand'}</p>
                    </div>

                    {/* Price + Action Row */}
                    <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-xl font-black text-slate-900 tracking-tighter">
                        ₱{(product.price || 0).toLocaleString()}
                      </span>
                      <div className="flex gap-2">
                        {canUpdate && (
                          <button onClick={() => handleOpenProductModal(product)}
                            className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl hover:bg-primary-600 hover:text-white transition-all shadow-sm">
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => { if (window.confirm('PURGE_ASSET?')) adminProductService.deleteProduct(product._id).then(fetchProducts) }}
                            className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Inventory Dashboard */
          <div className="space-y-8">
            {/* Inventory Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total Products', value: summary.totalItems, icon: Box, color: 'primary' },
                { label: 'Low Stock Items', value: summary.lowStockItems, icon: AlertTriangle, color: 'amber' },
                { label: 'Out of Stock', value: summary.outOfStockItems, icon: TrendingDown, color: 'rose' },
                { label: 'Total Inventory Value', value: `₱${summary.totalValue?.toLocaleString()}`, icon: PhilippinePeso, color: 'emerald' }
              ].map((stat, idx) => (
                <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm group hover:shadow-lg hover:border-primary-100 transition-all">
                  <div className={`w-10 h-10 rounded-2xl bg-${stat.color}-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <stat.icon className={`h-5 w-5 text-${stat.color}-600`} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 leading-tight">{stat.label}</p>
                    <p className="text-xl font-black text-slate-900 tracking-tighter">{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Stock List */}
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
            <div className="bg-slate-900 p-2 rounded-[2rem] shadow-xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-12 relative group">
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                        </div>
                        <input
                            type="text" 
                            value={inventorySearchInput} 
                            onChange={(e) => setInventorySearchInput(e.target.value)}
                            placeholder="SEARCH INVENTORY..."
                            className="w-full pl-16 pr-4 py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/20 transition-all placeholder:text-slate-600 font-sans"
                        />
                    </div>
                </div>
            </div>

              <div className="overflow-x-auto no-scrollbar">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Product</th>
                      <th className="px-10 py-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Stock Quantity</th>
                      <th className="px-10 py-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Status</th>
                      <th className="px-10 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {inventory.map((item) => (
                      <tr key={item.inventoryId} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 text-slate-300 group-hover:bg-primary-600 group-hover:text-white transition-all shadow-inner relative overflow-hidden">
                              {item.images?.[0] ? (
                                <img src={getImageUrl(item.images[0])} className="w-full h-full object-cover" alt="" />
                              ) : <Package className="h-6 w-6" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-black text-slate-900 uppercase truncate mb-1">{item.name}</p>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-primary-50 text-primary-600 rounded-md text-[8px] font-black uppercase tracking-widest">{item.category}</span>
                                <div className="w-1 h-1 rounded-full bg-slate-200" />
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.brand || 'OPERATOR_GENERIC'}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-[16px] font-black text-slate-900 tracking-tighter">{item.currentStock}</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] opacity-60">THRESHOLD: {item.reorderLevel}</span>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-center">
                          <span className={`inline-flex px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest border-2 ${item.currentStock === 0 ? 'bg-rose-50 text-rose-600 border-rose-100' :
                            item.currentStock <= item.reorderLevel ? 'bg-secondary-50 text-primary-600 border-secondary-100' :
                              'bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`}>
                            {item.currentStock === 0 ? 'OUT OF STOCK' : item.currentStock <= item.reorderLevel ? 'LOW STOCK' : 'IN STOCK'}
                          </span>
                        </td>
                        <td className="px-10 py-6 text-right">
                          {canAdjustStock && (
                            <button onClick={() => handleOpenInventoryModal(item)} className="px-6 py-3.5 bg-white border-2 border-slate-100 hover:bg-slate-900 hover:border-slate-900 hover:text-white rounded-2xl transition-all text-slate-500 text-[10px] font-black uppercase tracking-widest group-hover:shadow-lg">
                              Adjust Stock
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Form Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 overflow-hidden">
          <div className="bg-white w-full max-w-4xl rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh] border border-slate-200">
            {/* Modal Header */}
            <header className="p-5 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-5">
                  <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-2xl shadow-primary-200">
                    <Package className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Shield className="h-2.5 w-2.5 text-primary-600" />
                      <span className="text-[8px] font-black text-primary-600 uppercase tracking-[0.4em] leading-none">Catalog : {editingProduct ? 'Modifying Asset' : 'New Acquisition'}</span>
                    </div>
                    <h3 className="text-xl font-black uppercase text-slate-900 tracking-tighter leading-none">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                  </div>
                </div>
                <button onClick={() => setShowProductModal(false)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form Tabs */}
              <div className="flex gap-2 p-1 bg-slate-50 rounded-xl w-fit">
                <button
                  onClick={() => setModalTab('edit')}
                  className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'edit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Configure Details
                </button>
                <button
                  onClick={() => setModalTab('preview')}
                  className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Live Preview
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-slate-50/30">
              <div className="max-w-4xl mx-auto space-y-6">
                
                {modalTab === 'edit' ? (
                  <>
                    {/* 1. Basic Product Information */}
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <button 
                        onClick={() => setActiveSections(p => ({ ...p, basic: !p.basic }))}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all font-sans"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary-50 text-primary-600 rounded-lg flex items-center justify-center">
                            <Info className="h-4 w-4" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">1. Basic Information</h4>
                        </div>
                        {activeSections.basic ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      
                      {activeSections.basic && (
                        <div className="p-6 border-t border-slate-50 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Product Name / Title *</label>
                            <input 
                              type="text" required value={productForm.name}
                              onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
                              className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-black uppercase outline-none focus:border-primary-500 transition-all"
                              placeholder="Name..."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">SKU (Unique Identifier) *</label>
                            <input 
                              type="text" required value={productForm.sku}
                              onChange={e => setProductForm(p => ({ ...p, sku: e.target.value }))}
                              className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-black uppercase outline-none focus:border-primary-500 transition-all"
                              placeholder="SKU-123..."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Category *</label>
                            <select 
                              value={productForm.category}
                              onChange={e => setProductForm(p => ({ ...p, category: e.target.value }))}
                              className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-black uppercase outline-none focus:border-primary-500 appearance-none"
                            >
                              <option value="Pet Food">Pet Food</option>
                              <option value="Pet Accessories">Pet Accessories</option>
                              <option value="Pet Clothing">Pet Clothing</option>
                              <option value="Pet Health Care">Pet Health Care</option>
                              <option value="Others">Others</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Brand (Optional)</label>
                            <input 
                              type="text" value={productForm.brand}
                              onChange={e => setProductForm(p => ({ ...p, brand: e.target.value }))}
                              className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-black uppercase outline-none focus:border-primary-500 transition-all"
                              placeholder="Acme Co."
                            />
                          </div>
                          <div className="col-span-full space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Short Description (Preview Text) *</label>
                            <input 
                              type="text" required value={productForm.shortDescription}
                              onChange={e => setProductForm(p => ({ ...p, shortDescription: e.target.value }))}
                              className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-bold outline-none focus:border-primary-500 transition-all"
                              placeholder="A brief summary for listings..."
                            />
                          </div>
                          <div className="col-span-full space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Detailed Description *</label>
                            <textarea 
                              value={productForm.description}
                              onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                              className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-[12px] font-medium leading-relaxed outline-none focus:border-primary-500 transition-all h-32 resize-none"
                              placeholder="Technical specifications and detailed narrative..."
                            />
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 2. Pricing */}
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <button 
                        onClick={() => setActiveSections(p => ({ ...p, pricing: !p.pricing }))}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all font-sans"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                            <PhilippinePeso className="h-4 w-4" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">2. Pricing</h4>
                        </div>
                        {activeSections.pricing ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      
                      {activeSections.pricing && (
                        <div className="p-6 border-t border-slate-50 animate-in slide-in-from-top-2 duration-300">
                          <div className="max-w-xs space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Unit Price (₱) *</label>
                            <div className="relative">
                              <PhilippinePeso className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <input 
                                type="number" required value={productForm.price}
                                onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))}
                                className="w-full pl-10 pr-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[16px] font-black tracking-tighter outline-none focus:border-primary-500 transition-all"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 3. Inventory & Stock */}
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <button 
                        onClick={() => setActiveSections(p => ({ ...p, stock: !p.stock }))}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all font-sans"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-secondary-50 text-primary-600 rounded-lg flex items-center justify-center">
                            <Package className="h-4 w-4" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">3. Inventory & Stock</h4>
                        </div>
                        {activeSections.stock ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      
                      {activeSections.stock && (
                        <div className="p-6 border-t border-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Stock Quantity</label>
                             <input 
                               type="number" value={productForm.stockQuantity}
                               onChange={e => setProductForm(p => ({ ...p, stockQuantity: e.target.value }))}
                               className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-black outline-none focus:border-primary-500 transition-all"
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Status</label>
                             <select 
                               value={productForm.stockStatus}
                               onChange={e => setProductForm(p => ({ ...p, stockStatus: e.target.value }))}
                               className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary-500 appearance-none"
                             >
                               <option value="in_stock">In Stock</option>
                               <option value="out_of_stock">Out of Stock</option>
                             </select>
                          </div>
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Low Stock Alert</label>
                             <input 
                               type="number" value={productForm.lowStockThreshold}
                               onChange={e => setProductForm(p => ({ ...p, lowStockThreshold: e.target.value }))}
                               className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-black outline-none focus:border-primary-500 transition-all"
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Max per Order</label>
                             <input 
                               type="number" value={productForm.maxOrderQuantity}
                               onChange={e => setProductForm(p => ({ ...p, maxOrderQuantity: e.target.value }))}
                               className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-black outline-none focus:border-primary-500 transition-all"
                               placeholder="Unlimited"
                             />
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 4. Variants (Optional) */}
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <button 
                        onClick={() => setActiveSections(p => ({ ...p, variants: !p.variants }))}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all font-sans"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                            <Layers className="h-4 w-4" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">4. Variants (Optional)</h4>
                        </div>
                        {activeSections.variants ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      
                      {activeSections.variants && (
                        <div className="p-6 border-t border-slate-50 space-y-6 animate-in slide-in-from-top-2 duration-300">
                           <div className="flex justify-end">
                              <button 
                                onClick={() => setProductForm(p => ({ ...p, variants: [...p.variants, { combination: '', price: '', stock: '', sku: '', type: 'Size' }] }))}
                                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all"
                              >
                                + Add Variant
                              </button>
                           </div>
                           
                           {productForm.variants.length > 0 ? (
                             <div className="overflow-x-auto no-scrollbar">
                               <table className="w-full border-collapse">
                                 <thead>
                                   <tr className="bg-slate-50/50">
                                     <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b">Type</th>
                                     <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b">Combination</th>
                                     <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b">Price</th>
                                     <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b">Stock</th>
                                     <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b">SKU</th>
                                     <th className="px-4 py-3 text-center text-[8px] font-black text-slate-400 uppercase tracking-widest border-b">Action</th>
                                   </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-50">
                                   {productForm.variants.map((v, i) => (
                                     <tr key={i}>
                                       <td className="p-2">
                                          <select 
                                            value={v.type} onChange={e => { const vn = [...productForm.variants]; vn[i].type = e.target.value; setProductForm(p => ({ ...p, variants: vn })); }}
                                            className="w-full px-2 py-2 bg-slate-50 border-none rounded text-[10px] font-black uppercase outline-none"
                                          >
                                            <option value="Size">Size</option>
                                            <option value="Color">Color</option>
                                            <option value="Weight">Weight</option>
                                            <option value="Volume">Volume</option>
                                          </select>
                                       </td>
                                       <td className="p-2">
                                          <input 
                                            type="text" value={v.combination} onChange={e => { const vn = [...productForm.variants]; vn[i].combination = e.target.value; setProductForm(p => ({ ...p, variants: vn })); }}
                                            className="w-full px-2 py-2 bg-slate-50 border-none rounded text-[10px] font-bold outline-none" placeholder="Red, XL..."
                                          />
                                       </td>
                                       <td className="p-2">
                                          <input 
                                            type="number" value={v.price} onChange={e => { const vn = [...productForm.variants]; vn[i].price = e.target.value; setProductForm(p => ({ ...p, variants: vn })); }}
                                            className="w-full px-2 py-2 bg-slate-50 border-none rounded text-[10px] font-bold outline-none" placeholder="0.00"
                                          />
                                       </td>
                                       <td className="p-2">
                                          <input 
                                            type="number" value={v.stock} onChange={e => { const vn = [...productForm.variants]; vn[i].stock = e.target.value; setProductForm(p => ({ ...p, variants: vn })); }}
                                            className="w-full px-2 py-2 bg-slate-50 border-none rounded text-[10px] font-bold outline-none" placeholder="0"
                                          />
                                       </td>
                                       <td className="p-2">
                                          <input 
                                            type="text" value={v.sku} onChange={e => { const vn = [...productForm.variants]; vn[i].sku = e.target.value; setProductForm(p => ({ ...p, variants: vn })); }}
                                            className="w-full px-2 py-2 bg-slate-50 border-none rounded text-[10px] font-bold outline-none" placeholder="SKU-..."
                                          />
                                       </td>
                                       <td className="p-2 text-center">
                                          <button onClick={() => setProductForm(p => ({ ...p, variants: p.variants.filter((_, idx) => idx !== i) }))} className="text-rose-500 hover:scale-110 transition-transform"><Trash2 className="h-3.5 w-3.5"/></button>
                                       </td>
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                             </div>
                           ) : (
                             <div className="p-10 border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center text-slate-300 gap-2">
                                <Box className="h-8 w-8" />
                                <span className="text-[9px] font-black uppercase tracking-widest">No variants defined. Using base configuration.</span>
                             </div>
                           )}
                        </div>
                      )}
                    </section>

                    {/* 5. Media (Required) */}
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <button 
                        onClick={() => setActiveSections(p => ({ ...p, media: !p.media }))}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all font-sans"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-pink-50 text-pink-600 rounded-lg flex items-center justify-center">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">5. Media *</h4>
                        </div>
                        {activeSections.media ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      
                      {activeSections.media && (
                        <div className="p-6 border-t border-slate-50 space-y-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Images (Min 1, Max 10)</label>
                              <span className={`text-[10px] font-bold ${productForm.images.length >= 1 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {productForm.images.length}/10 Images
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              {productForm.images.map((img, i) => (
                                <div key={i} className="aspect-square bg-slate-50 rounded-xl border-2 border-slate-100 relative group overflow-hidden">
                                  <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                                  <button 
                                    type="button" 
                                    onClick={() => setProductForm(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))}
                                    className="absolute inset-0 bg-rose-600/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                  >
                                    <Trash2 className="h-4 w-4 text-white" />
                                  </button>
                                </div>
                              ))}
                              {productForm.images.length < 10 && (
                                <label className="aspect-square border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-all group">
                                  <Plus className="h-4 w-4 text-slate-300 group-hover:text-primary-600" />
                                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Upload</span>
                                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </label>
                              )}
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Video Stream (Optional URL)</label>
                            <div className="relative">
                              <Video className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <input 
                                type="text" value={productForm.video}
                                onChange={e => setProductForm(p => ({ ...p, video: e.target.value }))}
                                className="w-full pl-10 pr-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-medium outline-none focus:border-primary-500 transition-all"
                                placeholder="Youtube or direct link..."
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 6. Fulfillment (Pickup Only) */}
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <button 
                        onClick={() => setActiveSections(p => ({ ...p, fulfillment: !p.fulfillment }))}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all font-sans"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">6. Fulfillment</h4>
                        </div>
                        {activeSections.fulfillment ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      
                      {activeSections.fulfillment && (
                        <div className="p-6 border-t border-slate-50 space-y-6 animate-in slide-in-from-top-2 duration-300">
                           <div className="p-5 bg-rose-50/50 rounded-2xl border border-rose-100 flex items-center gap-4">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-rose-600 shadow-sm">
                                <Shield className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="text-[11px] font-black text-rose-900 uppercase tracking-widest">Enforced: Store Pickup Only</p>
                                <p className="text-[9px] text-rose-600 font-bold uppercase tracking-widest">Delivery and shipping protocols are restricted for this asset class.</p>
                              </div>
                           </div>
                           
                           <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Pickup Instructions (Optional)</label>
                             <textarea 
                               value={productForm.pickupInstructions}
                               onChange={e => setProductForm(p => ({ ...p, pickupInstructions: e.target.value }))}
                               className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-[12px] font-medium outline-none focus:border-primary-500 transition-all h-24 resize-none"
                               placeholder="Specify location details, operational hours, or identification requirements..."
                             />
                           </div>
                        </div>
                      )}
                    </section>

                    {/* 7. Product Organization */}
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <button 
                        onClick={() => setActiveSections(p => ({ ...p, organization: !p.organization }))}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all font-sans"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center">
                            <Tag className="h-4 w-4" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">7. Organization</h4>
                        </div>
                        {activeSections.organization ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      
                      {activeSections.organization && (
                        <div className="p-6 border-t border-slate-50 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Visibility Status</label>
                             <select 
                               value={productForm.visibility}
                               onChange={e => setProductForm(p => ({ ...p, visibility: e.target.value }))}
                               className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary-500 appearance-none"
                             >
                               <option value="published">Published (Live)</option>
                               <option value="draft">Draft (Hidden)</option>
                               <option value="scheduled">Scheduled</option>
                             </select>
                          </div>
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Collection / Group</label>
                             <input 
                               type="text" value={productForm.collectionGroup}
                               onChange={e => setProductForm(p => ({ ...p, collectionGroup: e.target.value }))}
                               className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-black uppercase outline-none focus:border-primary-500 transition-all"
                               placeholder="Summer 2024, Clearance..."
                             />
                          </div>
                        </div>
                      )}
                    </section>

                    {/* 8. Additional Details (Optional) */}
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-8">
                      <button 
                        onClick={() => setActiveSections(p => ({ ...p, additional: !p.additional }))}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all font-sans"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center">
                            <FileText className="h-4 w-4" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">8. Additional Details</h4>
                        </div>
                        {activeSections.additional ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      
                      {activeSections.additional && (
                        <div className="p-6 border-t border-slate-50 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-2 duration-300">
                           <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2"><Clock className="h-2.5 w-2.5" /> Expiry Date</label>
                             <input 
                               type="date" value={productForm.expiryDate}
                               onChange={e => setProductForm(p => ({ ...p, expiryDate: e.target.value }))}
                               className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-bold outline-none focus:border-primary-500 transition-all"
                             />
                           </div>
                           <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Warranty Info</label>
                             <input 
                               type="text" value={productForm.warrantyInfo}
                               onChange={e => setProductForm(p => ({ ...p, warrantyInfo: e.target.value }))}
                               className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-50 rounded-xl text-[12px] font-bold outline-none focus:border-primary-500 transition-all"
                               placeholder="e.g. 1 Year Local Warranty"
                             />
                           </div>
                           <div className="md:col-span-2 space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Usage Instructions / Ingredients</label>
                             <textarea 
                               value={productForm.usageInstructions}
                               onChange={e => setProductForm(p => ({ ...p, usageInstructions: e.target.value }))}
                               className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-[12px] font-medium outline-none focus:border-primary-500 transition-all h-24 resize-none"
                               placeholder="How to use or composition details..."
                             />
                           </div>
                        </div>
                      )}
                    </section>
                  </>
                ) : (
                  <div className="animate-in fade-in duration-500">
                    {/* Live Preview Container */}
                    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden mb-12">
                       <div className="aspect-square md:aspect-video bg-slate-100 relative group">
                          {productForm.images.length > 0 ? (
                            <img src={getImageUrl(productForm.images[0])} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                               <ImageIcon size={48} />
                               <span className="text-[10px] font-black uppercase tracking-widest">No Media Synchronized</span>
                            </div>
                          )}
                          <div className="absolute top-6 left-6 flex gap-2">
                             <span className="px-4 py-1.5 bg-white/90 backdrop-blur-md rounded-full text-[9px] font-black uppercase tracking-widest text-slate-900 border border-white/20">Preview Mode</span>
                             <span className="px-4 py-1.5 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">{productForm.stockStatus === 'in_stock' ? 'In Stock' : 'Out of Stock'}</span>
                          </div>
                       </div>
                       
                       <div className="p-10 space-y-8">
                          <div className="space-y-2">
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.3em]">{productForm.category || 'Asset Class'}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU: {productForm.sku || 'PENDING'}</span>
                             </div>
                             <h2 className="text-4xl font-black uppercase tracking-tighter text-slate-900 leading-tight">{productForm.name || 'Undefined Asset'}</h2>
                             <p className="text-[14px] font-medium text-slate-500 leading-relaxed max-w-2xl">{productForm.shortDescription || 'No preview description provided.'}</p>
                          </div>
                          
                          <div className="flex items-baseline gap-2">
                             <span className="text-[18px] font-black text-slate-900">₱</span>
                             <span className="text-5xl font-black tracking-tighter text-slate-900">{Number(productForm.price).toLocaleString()}</span>
                          </div>
                          
                          <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 flex flex-wrap gap-10">
                             <div className="space-y-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fulfillment Type</p>
                                <div className="flex items-center gap-2 text-slate-900">
                                   <MapPin size={14} className="text-primary-600" />
                                   <span className="text-[12px] font-black uppercase">Store Pickup Only</span>
                                </div>
                             </div>
                             <div className="space-y-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Stock</p>
                                <div className="flex items-center gap-2 text-slate-900">
                                   <Package size={14} className="text-primary-600" />
                                   <span className="text-[12px] font-black uppercase">{productForm.stockQuantity || 0} Units</span>
                                </div>
                             </div>
                             {productForm.brand && (
                               <div className="space-y-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Brand Authority</p>
                                <div className="flex items-center gap-2 text-slate-900">
                                   <Shield size={14} className="text-primary-600" />
                                   <span className="text-[12px] font-black uppercase">{productForm.brand}</span>
                                </div>
                             </div>
                             )}
                          </div>
                          
                          <div className="space-y-4">
                             <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900 border-b border-slate-100 pb-2">Technical Description</h4>
                             <div className="text-[13px] text-slate-600 font-medium leading-loose whitespace-pre-wrap">
                                {productForm.description || 'Detailed technical analysis pending...'}
                             </div>
                          </div>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Deck */}
            <footer className="p-5 bg-white border-t border-slate-100 flex gap-3 shrink-0 relative z-20">
              <button 
                type="button" 
                onClick={() => setShowProductModal(false)} 
                className="px-6 py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                type="button"
                onClick={handleProductSubmit}
                className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.25em] hover:bg-slate-900 hover:scale-[1.01] transition-all shadow-2xl shadow-primary-200 flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50"
              >
                {submitting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> SAVING...</>
                ) : (
                  <><FileText className="h-5 w-5" /> {editingProduct ? 'Update Product' : 'Create Product'}</>
                )}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Inventory Adjustment Modal */}
      {showInventoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2">
          <div className="bg-white rounded-[2rem] max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-300 border border-slate-200 overflow-hidden flex flex-col">
            <header className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Activity className="h-6 w-6" /></div>
                <h3 className="text-2xl font-black uppercase tracking-tighter">Update Stock</h3>
              </div>
              <button onClick={() => setShowInventoryModal(false)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"><X className="h-5 w-5" /></button>
            </header>
            <form onSubmit={handleInventorySubmit} className="p-6 space-y-6 bg-slate-50/20">
              {selectedInventoryItem ? (
                <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden group">
                  <Target className="absolute -bottom-12 -right-12 w-48 h-48 opacity-10 animate-pulse pointer-events-none" />
                  <div className="relative z-10">
                    <label className="text-[10px] font-black text-primary-500 uppercase tracking-[0.4em] block mb-3">Product</label>
                    <p className="text-xl font-black uppercase tracking-tighter mb-2">{selectedInventoryItem.name}</p>
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-emerald-500/30">Current Stock: {selectedInventoryItem.currentStock}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Select Product</label>
                  <select required value={inventoryForm.productId} onChange={e => setInventoryForm(p => ({ ...p, productId: e.target.value }))} className="w-full px-6 py-3.5 bg-white border border-slate-100 rounded-2xl text-[12px] font-black uppercase outline-none focus:ring-4 focus:ring-primary-600/5 appearance-none">
                    <option value="">SELECT PRODUCT...</option>
                    {products.map(p => <option key={p._id} value={p._id}>{p.name.toUpperCase()}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Action</label>
                  <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-white border border-slate-100 rounded-2xl shadow-inner">
                    {[
                      { value: 'add', label: 'ADD STOCK' },
                      { value: 'subtract', label: 'REDUCE STOCK' },
                      { value: 'set', label: 'SET TOTAL' }
                    ].map(op => (
                      <button key={op.value} type="button" onClick={() => setInventoryForm(p => ({ ...p, operation: op.value }))} className={`py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${inventoryForm.operation === op.value ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Quantity</label>
                  <input type="number" required value={inventoryForm.quantity} onChange={e => setInventoryForm(p => ({ ...p, quantity: e.target.value }))} className="w-full px-6 py-3.5 bg-white border border-slate-100 rounded-2xl text-2xl font-black outline-none focus:ring-4 focus:ring-primary-600/5" placeholder="0" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Reason for Update</label>
                <input type="text" value={inventoryForm.notes} onChange={e => setInventoryForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-8 py-3.5 bg-white border border-slate-100 rounded-2xl text-[11px] font-medium outline-none shadow-inner" placeholder="E.G. NEW DELIVERY, DAMAGED ITEM, INVENTORY COUNT..." />
              </div>

              <button disabled={submitting} type="submit" className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] hover:bg-slate-900 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save Changes'}
                <ChevronRight className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductInventory;
