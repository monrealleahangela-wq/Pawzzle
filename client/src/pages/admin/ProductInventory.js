import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { productService, adminProductService, inventoryService, uploadService, getImageUrl } from '../../services/apiService';
import {
  Package,
  AlertTriangle,
  TrendingDown,
  Plus,
  Edit,
  Trash2,
  Search,
  Box,
  DollarSign,
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
  LayoutGrid,
  Menu
} from 'lucide-react';

const ProductInventory = () => {
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showProductModal, setShowProductModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [modalTab, setModalTab] = useState('essential'); // essential, tactical, discovery
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [productFilters, setProductFilters] = useState({ category: '', search: '' });
  const [inventoryFilters, setInventoryFilters] = useState({ status: '', search: '' });
  const [productSearchInput, setProductSearchInput] = useState('');
  const [inventorySearchInput, setInventorySearchInput] = useState('');

  // Form States
  const initialProductState = {
    name: '',
    category: 'food',
    description: '',
    price: '',
    brand: '',
    suitableFor: ['all'],
    images: [],
    weight: '',
    weightUnit: 'kg',
    material: '',
    colors: [],
    tags: [],
    isFeatured: false,
    ageRange: { min: '', max: '', unit: 'years' },
    dimensions: { length: '', width: '', height: '', unit: 'cm' }
  };

  const [productForm, setProductForm] = useState(initialProductState);

  const [inventoryForm, setInventoryForm] = useState({
    productId: '',
    quantity: 0,
    operation: 'add',
    reorderLevel: 10,
    notes: ''
  });

  const [summary, setSummary] = useState({ totalItems: 0, lowStockItems: 0, outOfStockItems: 0, totalValue: 0 });
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false });

  const categories = [
    { value: 'food', label: 'Food' },
    { value: 'toy', label: 'Toys' },
    { value: 'accessory', label: 'Accessories' },
    { value: 'health', label: 'Health' },
    { value: 'grooming', label: 'Grooming' },
    { value: 'housing', label: 'Housing' },
    { value: 'training', label: 'Training' },
    { value: 'other', label: 'Other' }
  ];

  const species = ['all', 'dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile'];

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
    setModalTab('essential');
    if (product) {
      setEditingProduct(product);
      setProductForm({
        ...initialProductState,
        ...product,
        ageRange: { ...initialProductState.ageRange, ...product.ageRange },
        dimensions: { ...initialProductState.dimensions, ...product.dimensions }
      });
    } else {
      setEditingProduct(null);
      setProductForm(initialProductState);
    }
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const isAdminOrStaff = userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'staff';

      const payload = { ...productForm };
      // Deep sanitization for nested objects
      const sanitize = (obj) => {
        const result = {};
        Object.keys(obj).forEach(key => {
          if (obj[key] !== '' && obj[key] !== null) result[key] = obj[key];
        });
        return Object.keys(result).length > 0 ? result : undefined;
      };

      if (!payload.weight) delete payload.weight;
      payload.ageRange = sanitize(payload.ageRange);
      payload.dimensions = sanitize(payload.dimensions);

      if (editingProduct) {
        if (isAdminOrStaff) await adminProductService.updateProduct(editingProduct._id, payload);
        else await productService.updateProduct(editingProduct._id, payload);
        toast.success('Product updated');
      } else {
        if (isAdminOrStaff) await adminProductService.createProduct(payload);
        else await productService.createProduct(payload);
        toast.success('Product created');
      }

      setShowProductModal(false);
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSubmitting(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }

    try {
      const response = await uploadService.uploadMultipleImages(formData);
      const newUrls = response.data.urls || response.data.imageUrls || [];
      setProductForm(prev => ({ ...prev, images: [...prev.images, ...newUrls] }));
      toast.success('Images uploaded');
    } catch (error) {
      toast.error('Upload failed');
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
          reorderLevel: Number(inventoryForm.reorderLevel),
          notes: inventoryForm.notes
        });
        toast.success('Product added to inventory');
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
            <div className="p-2 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-200">
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
          <button onClick={() => handleOpenProductModal()} className="flex-1 lg:flex-none px-8 py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group">
            <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" /> Add Product
          </button>
          <button onClick={() => handleOpenInventoryModal()} className="flex-1 lg:flex-none px-8 py-4 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-50 transition-all flex items-center justify-center gap-3">
            <Zap className="h-4 w-4 text-primary-600 shadow-glow" /> Update Stock
          </button>
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
            className={`px-6 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
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
            {/* Filter Deck */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-8 input-container group">
                <Search className="input-icon h-4 w-4 text-slate-400 group-focus-within:text-primary-600 transition-colors" />
                <input
                  type="text" value={productSearchInput} onChange={(e) => setProductSearchInput(e.target.value)}
                  placeholder="SEARCH PRODUCTS BY NAME OR BRAND..."
                  className="input input-with-icon bg-white border-slate-100 text-[11px] font-bold uppercase tracking-widest rounded-[2rem] outline-none focus:ring-4 focus:ring-primary-600/5 shadow-sm transition-all placeholder:text-slate-300"
                />
              </div>
              <div className="md:col-span-4 relative group">
                <Filter className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select
                  value={productFilters.category} onChange={(e) => setProductFilters(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full pl-16 pr-10 py-5 bg-white border border-slate-100 text-[11px] font-black uppercase tracking-widest rounded-[2rem] outline-none focus:ring-4 focus:ring-primary-600/5 appearance-none cursor-pointer shadow-sm shadow-slate-100"
                >
                  <option value="">ALL CATEGORIES</option>
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label.toUpperCase()}</option>)}
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none" />
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
                      <div className="absolute top-2 left-2 bg-amber-400 text-white p-1.5 rounded-lg shadow-lg">
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
                        <button onClick={() => handleOpenProductModal(product)}
                          className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-primary-600 hover:text-white transition-all shadow-sm">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => { if (window.confirm('PURGE_ASSET?')) adminProductService.deleteProduct(product._id).then(fetchProducts) }}
                          className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                          <Trash2 className="h-4 w-4" />
                        </button>
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
                { label: 'Total Inventory Value', value: `₱${summary.totalValue?.toLocaleString()}`, icon: DollarSign, color: 'emerald' }
              ].map((stat, idx) => (
                <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm group hover:shadow-lg hover:border-primary-100 transition-all">
                  <div className={`w-10 h-10 rounded-xl bg-${stat.color}-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
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
              <div className="p-4 border-b border-slate-50 bg-slate-50/20 flex flex-col sm:flex-row gap-4 items-center">
                <div className="input-container flex-1 bg-white border border-slate-100 rounded-2xl shadow-inner group">
                  <Search className="input-icon h-4 w-4 text-slate-400 group-focus-within:text-primary-600 transition-colors" />
                  <input
                    type="text" value={inventorySearchInput} onChange={(e) => setInventorySearchInput(e.target.value)}
                    placeholder="SEARCH INVENTORY..."
                    className="input input-with-icon bg-transparent border-none text-[10px] font-black uppercase tracking-widest outline-none py-3 placeholder:text-slate-300"
                  />
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
                          <span className={`inline-flex px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 ${item.currentStock === 0 ? 'bg-rose-50 text-rose-600 border-rose-100' :
                            item.currentStock <= item.reorderLevel ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              'bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`}>
                            {item.currentStock === 0 ? 'OUT OF STOCK' : item.currentStock <= item.reorderLevel ? 'LOW STOCK' : 'IN STOCK'}
                          </span>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <button onClick={() => handleOpenInventoryModal(item)} className="px-6 py-3 bg-white border-2 border-slate-100 hover:bg-slate-900 hover:border-slate-900 hover:text-white rounded-xl transition-all text-slate-500 text-[10px] font-black uppercase tracking-widest group-hover:shadow-lg">
                            Adjust Stock
                          </button>
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

      {/* Product Form */}
      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <header className="p-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-primary-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-primary-200">
                  <Package className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-3 w-3 text-primary-600" />
                    <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">Action : {editingProduct ? 'Update' : 'Add'}</span>
                  </div>
                  <h3 className="text-3xl font-black uppercase text-slate-900 tracking-tighter leading-none">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                </div>
              </div>
              <button onClick={() => setShowProductModal(false)} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all">
                <X className="h-6 w-6" />
              </button>
            </header>

            {/* Modal Navigation */}
            <nav className="px-8 py-4 border-b border-slate-50 flex gap-6 overflow-x-auto no-scrollbar shrink-0 bg-slate-50/50">
              {[
                { id: 'essential', label: 'Basic Info', icon: Info },
                { id: 'tactical', label: 'Details', icon: Target },
                { id: 'discovery', label: 'Marketing', icon: Tag }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setModalTab(tab.id)}
                  className={`px-6 py-3 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${modalTab === tab.id ? 'bg-white text-primary-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Modal Content Deck */}
            <form onSubmit={handleProductSubmit} className="flex-1 overflow-y-auto p-6 no-scrollbar relative">

              {/* STAGE 1: ESSENTIAL IDENTITY */}
              {modalTab === 'essential' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="lg:col-span-4 space-y-6">
                    <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white relative overflow-hidden shadow-2xl border border-white/5">
                      <ImageIcon className="absolute -bottom-12 -right-12 w-56 h-56 opacity-10 pointer-events-none" />
                      <label className="text-[11px] font-black text-primary-500 uppercase tracking-[0.5em] block mb-6">Product Images</label>
                      <div className="grid grid-cols-2 gap-4">
                        {productForm.images.map((img, i) => (
                          <div key={i} className="aspect-square bg-white/5 rounded-2xl overflow-hidden border border-white/10 relative group">
                             <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setProductForm(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))} className="absolute inset-0 bg-rose-600/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Trash2 className="h-6 w-6 text-white" /></button>
                          </div>
                        ))}
                        {productForm.images.length < 10 && (
                          <label className="aspect-square bg-white/5 rounded-2xl border-2 border-white/10 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all hover:border-primary-500 group">
                            <Plus className="h-8 w-8 text-primary-500 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Link_Media</span>
                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Product Name</label>
                        <input type="text" required value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))} className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl text-[12px] font-black uppercase outline-none focus:ring-4 focus:ring-primary-600/5" placeholder="NAME..." />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Category</label>
                        <select value={productForm.category} onChange={e => setProductForm(p => ({ ...p, category: e.target.value }))} className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl text-[12px] font-black uppercase outline-none focus:ring-4 focus:ring-primary-600/5 appearance-none">
                          {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Description</label>
                      <textarea required value={productForm.description} onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))} className="w-full px-8 py-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] text-[13px] font-medium leading-relaxed outline-none focus:ring-4 focus:ring-primary-600/5 h-48 resize-none shadow-inner" placeholder="TELL CUSTOMERS ABOUT THIS PRODUCT..." />
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 2: TACTICAL SPECS */}
              {modalTab === 'tactical' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Sale Price (₱)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-primary-600" />
                        <input type="number" required value={productForm.price} onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))} className="w-full pl-16 pr-8 py-5 bg-slate-50 border border-slate-100 rounded-3xl text-xl font-black outline-none focus:ring-4 focus:ring-primary-600/5" placeholder="0.00" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Brand</label>
                      <input type="text" value={productForm.brand} onChange={e => setProductForm(p => ({ ...p, brand: e.target.value }))} className="w-full px-8 py-5 bg-slate-50 border border-slate-100 rounded-3xl text-[12px] font-black uppercase outline-none focus:ring-4 focus:ring-primary-600/5" placeholder="BRAND NAME..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Weight</label>
                      <div className="flex bg-slate-50 border border-slate-100 rounded-3xl overflow-hidden focus-within:ring-4 focus-within:ring-primary-600/5 transition-all">
                        <input type="number" value={productForm.weight} onChange={e => setProductForm(p => ({ ...p, weight: e.target.value }))} className="flex-1 px-6 py-5 bg-transparent text-[12px] font-black outline-none" placeholder="0" />
                        <select value={productForm.weightUnit} onChange={e => setProductForm(p => ({ ...p, weightUnit: e.target.value }))} className="px-4 bg-white border-l border-slate-100 text-[10px] font-black uppercase outline-none">
                          {['kg', 'g', 'lbs', 'oz'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900 border border-white/5 rounded-[3rem] p-8 text-white relative overflow-hidden">
                      <Maximize className="absolute top-10 right-10 w-32 h-32 opacity-5 pointer-events-none" />
                      <h4 className="text-[11px] font-black text-primary-500 uppercase tracking-[0.4em] mb-8">Dimensions</h4>
                      <div className="grid grid-cols-3 gap-4">
                        {['length', 'width', 'height'].map(f => (
                          <div key={f} className="space-y-2">
                            <label className="text-[9px] font-black text-white/40 uppercase tracking-widest text-center block">{f}</label>
                            <input type="number" value={productForm.dimensions[f]} onChange={e => setProductForm(p => ({ ...p, dimensions: { ...p.dimensions, [f]: e.target.value } }))} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-center text-[12px] font-black text-white outline-none focus:bg-white/10" placeholder="0" />
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 flex justify-center">
                        <select value={productForm.dimensions.unit} onChange={e => setProductForm(p => ({ ...p, dimensions: { ...p.dimensions, unit: e.target.value } }))} className="bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none">
                          {['cm', 'in', 'm'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="bg-emerald-600 border border-emerald-500 rounded-[3rem] p-8 text-white relative overflow-hidden">
                      <Activity className="absolute top-10 right-10 w-32 h-32 opacity-5 pointer-events-none" />
                      <h4 className="text-[11px] font-black text-emerald-200 uppercase tracking-[0.4em] mb-8">Target Pet Age</h4>
                      <div className="flex items-center gap-6 justify-center">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-emerald-200/50 uppercase tracking-widest text-center block">Minimum</label>
                          <input type="number" value={productForm.ageRange.min} onChange={e => setProductForm(p => ({ ...p, ageRange: { ...p.ageRange, min: e.target.value } }))} className="w-24 py-5 bg-white/10 border border-white/10 rounded-2xl text-center text-xl font-black text-white outline-none" placeholder="0" />
                        </div>
                        <span className="text-2xl font-black text-emerald-200/30">—</span>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-emerald-200/50 uppercase tracking-widest text-center block">Maximum</label>
                          <input type="number" value={productForm.ageRange.max} onChange={e => setProductForm(p => ({ ...p, ageRange: { ...p.ageRange, max: e.target.value } }))} className="w-24 py-5 bg-white/10 border border-white/10 rounded-2xl text-center text-xl font-black text-white outline-none" placeholder="0" />
                        </div>
                      </div>
                      <div className="mt-6 flex justify-center">
                        <select value={productForm.ageRange.unit} onChange={e => setProductForm(p => ({ ...p, ageRange: { ...p.ageRange, unit: e.target.value } }))} className="bg-white/10 border border-white/10 rounded-xl px-6 py-2 text-[10px] font-black uppercase outline-none">
                          {['years', 'months'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 3: DISCOVERY LOGIC */}
              {modalTab === 'discovery' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="p-6 bg-slate-900 border border-white/5 rounded-[2.5rem] text-white">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-primary-600 rounded-2xl"><Target className="h-5 w-5" /></div>
                      <h4 className="text-[12px] font-black uppercase tracking-[0.4em]">Suitable For</h4>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {species.map(s => {
                        const active = productForm.suitableFor.includes(s);
                        return (
                          <button type="button" key={s} onClick={() => { if (s === 'all') setProductForm(p => ({ ...p, suitableFor: ['all'] })); else setProductForm(p => { const n = p.suitableFor.includes(s) ? p.suitableFor.filter(x => x !== s) : [...p.suitableFor.filter(x => x !== 'all'), s]; return { ...p, suitableFor: n.length ? n : ['all'] }; }) }} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${active ? 'bg-primary-600 border-primary-500 shadow-xl shadow-primary-900/40' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Material</label>
                        <input type="text" value={productForm.material} onChange={e => setProductForm(p => ({ ...p, material: e.target.value }))} className="w-full px-8 py-5 bg-slate-50 border border-slate-100 rounded-3xl text-[12px] font-black uppercase outline-none" placeholder="E.G. COTTON, PLASTIC..." />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Colors</label>
                        <input type="text" value={productForm.colors.join(', ')} onChange={e => setProductForm(p => ({ ...p, colors: e.target.value.split(',').map(s => s.trim()).filter(s => s) }))} className="w-full px-8 py-5 bg-slate-50 border border-slate-100 rounded-3xl text-[12px] font-black uppercase outline-none" placeholder="BLUE, RED, WHITE..." />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 flex justify-between items-center">
                        Search Tags
                        <span className="text-[8px] opacity-40">COMMA SEPARATED</span>
                      </label>
                      <textarea value={productForm.tags.join(', ')} onChange={e => setProductForm(p => ({ ...p, tags: e.target.value.split(',').map(s => s.trim()).filter(s => s) }))} className="w-full px-8 py-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] text-[12px] font-medium h-[155px] resize-none outline-none shadow-inner" placeholder="PREMIUM, NEW, ECO-FRIENDLY..." />
                    </div>
                  </div>

                  <div className="bg-amber-400 p-8 rounded-[2.5rem] flex items-center justify-between shadow-xl shadow-amber-100">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-lg"><Star className={`h-8 w-8 ${productForm.isFeatured ? 'text-amber-500 fill-current' : 'text-slate-200'}`} /></div>
                      <div>
                        <p className="text-[12px] font-black text-amber-900 uppercase tracking-widest mb-1">Featured Product</p>
                        <p className="text-[10px] font-bold text-amber-800/60 uppercase tracking-widest">Display this product on the home page showcase</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setProductForm(p => ({ ...p, isFeatured: !p.isFeatured }))} className={`w-16 h-8 rounded-full relative transition-all border-4 border-white ${productForm.isFeatured ? 'bg-amber-900' : 'bg-amber-600/30'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${productForm.isFeatured ? 'left-9' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              )}
            </form>

            {/* Modal Footer Deck */}
            <footer className="p-8 bg-white border-t border-slate-50 flex gap-4 shrink-0 relative z-20">
              <button type="button" onClick={() => setShowProductModal(false)} className="px-10 py-5 bg-slate-50 text-slate-400 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95">Cancel</button>
              <button
                disabled={submitting}
                type="button"
                onClick={(e) => {
                  if (modalTab === 'essential') setModalTab('tactical');
                  else if (modalTab === 'tactical') setModalTab('discovery');
                  else handleProductSubmit(e);
                }}
                className="flex-1 py-5 bg-primary-600 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 hover:scale-[1.02] transition-all shadow-2xl shadow-primary-200 flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : (
                  modalTab === 'essential' ? 'Go to Details' :
                    modalTab === 'tactical' ? 'Go to Marketing' :
                      editingProduct ? 'Save Changes' : 'Add Product'
                )}
                {modalTab !== 'discovery' ? <ChevronRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Inventory Modal */}
      {showInventoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <header className="p-6 border-b border-slate-50 bg-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Activity className="h-6 w-6" /></div>
                <h3 className="text-2xl font-black uppercase tracking-tighter">Update Stock</h3>
              </div>
              <button onClick={() => setShowInventoryModal(false)} className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all"><X className="h-5 w-5" /></button>
            </header>
            <form onSubmit={handleInventorySubmit} className="p-6 space-y-6 bg-slate-50/20">
              {selectedInventoryItem ? (
                <div className="bg-slate-900 rounded-3xl p-6 text-white relative overflow-hidden group">
                  <Target className="absolute -bottom-12 -right-12 w-48 h-48 opacity-10 animate-pulse pointer-events-none" />
                  <div className="relative z-10">
                    <label className="text-[10px] font-black text-primary-500 uppercase tracking-[0.4em] block mb-3">Product</label>
                    <p className="text-xl font-black uppercase tracking-tighter mb-2">{selectedInventoryItem.name}</p>
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-500/30">Current Stock: {selectedInventoryItem.currentStock}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Select Product</label>
                  <select required value={inventoryForm.productId} onChange={e => setInventoryForm(p => ({ ...p, productId: e.target.value }))} className="w-full px-6 py-5 bg-white border border-slate-100 rounded-3xl text-[12px] font-black uppercase outline-none focus:ring-4 focus:ring-primary-600/5 appearance-none">
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
                      <button key={op.value} type="button" onClick={() => setInventoryForm(p => ({ ...p, operation: op.value }))} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${inventoryForm.operation === op.value ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Quantity</label>
                  <input type="number" required value={inventoryForm.quantity} onChange={e => setInventoryForm(p => ({ ...p, quantity: e.target.value }))} className="w-full px-6 py-5 bg-white border border-slate-100 rounded-3xl text-2xl font-black outline-none focus:ring-4 focus:ring-primary-600/5" placeholder="0" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Reason for Update</label>
                <input type="text" value={inventoryForm.notes} onChange={e => setInventoryForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-8 py-5 bg-white border border-slate-100 rounded-3xl text-[11px] font-medium outline-none shadow-inner" placeholder="E.G. NEW DELIVERY, DAMAGED ITEM, INVENTORY COUNT..." />
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
