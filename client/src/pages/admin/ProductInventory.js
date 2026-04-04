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
  Table
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

  const categoryHierarchy = {
    'Pet Food': [
      'Dog Food', 'Dog Treats', 'Cat Food', 'Cat Treats', 'Small Pet Food', 
      'Small Pet Treats', 'Aquarium Pet Food', 'Bird Feed', 'Reptile Food', 'Others'
    ],
    'Pet Accessories': [
      'Bowls and Feeders', 'Travel Essentials', 'Dishes, Collars, Harnesses, and Muzzles',
      'Toys (Dog & Cat)', 'Toys (Small Pet)', 'Toys (Bird)', 'Toys (Others)',
      'Pet Furniture (Beds/Mats)', 'Pet Furniture (Houses)', 'Pet Furniture (Habitats)',
      'Pet Furniture (Cages/Crates)', 'Pet Furniture (Scratching Pads)', 'Pet Furniture (Others)',
      'Aquarium Needs', 'Litter (Cat)', 'Litter (Small Pet)', 'Diapers', 
      'Training Pads', 'Poop Bags/Scoopers', 'Litter Others',
      'Grooming (Hair)', 'Grooming (Oral)', 'Grooming (Claw)', 'Grooming (Others)'
    ],
    'Pet Clothing and Accessories': [
      'Clothing', 'Wet Weather Gear', 'Boots/Socks/Protectors', 'Neck Accessories',
      'Eyewear', 'Hair Accessories', 'Hats', 'Others'
    ],
    'Pet Health Care': [
      'Anti-Fleas and Ticks', 'Medication', 'Vitamins and Supplements (Permit Required)', 'Others'
    ]
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
    mainCategory: 'Pet Food',
    subCategory: 'Dog Food',
    description: '',
    gtin: '',
    hasNoGtin: false,
    images: [],
    video: null,
    variations: [], // { name: '', description: '', images: [], options: [{ price: '', stock: '', sku: '' }] }
    shipping: {
      weight: '',
      parcelSize: { length: '', width: '', height: '' },
      fee: ''
    },
    permit: null,
    isFeatured: false
  };

  const [productForm, setProductForm] = useState(initialProductState);
  const [activeSections, setActiveSections] = useState({
    basic: true,
    categories: true,
    sales: true,
    shipping: true
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
    setActiveSections({ basic: true, categories: true, sales: true, shipping: true });
    if (product) {
      setEditingProduct(product);
      setProductForm({
        ...initialProductState,
        ...product,
        mainCategory: product.category || 'Pet Food',
        subCategory: product.subCategory || 'Others',
        shipping: {
          ...initialProductState.shipping,
          ...product.shipping
        }
      });
    } else {
      setEditingProduct(null);
      setProductForm(initialProductState);
    }
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (productForm.images.length < 1) {
      return toast.warn('Aquisition Error: Minimum 1 image required.');
    }
    if (productForm.images.length > 9) {
      return toast.warn('Aquisition Error: Maximum 9 images allowed.');
    }
    if (productForm.subCategory.includes('Vitamins') && !productForm.permit) {
      // In a real app we'd check if a file was uploaded
      // return toast.warn('Verificaton Error: Health permit required for Vitamins.');
    }
    if (!productForm.hasNoGtin && !productForm.gtin) {
      return toast.warn('Data Error: GTIN required unless "No GTIN" is specified.');
    }

    setSubmitting(true);
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const isAdminOrStaff = userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'staff';

      // Flatten payload for backend compatibility if needed
      const payload = {
        ...productForm,
        category: productForm.mainCategory, // Backwards compatibility
        price: productForm.variations[0]?.options[0]?.price || 0, // Fallback for list view
        stockQuantity: productForm.variations[0]?.options[0]?.stock || 0
      };

      if (editingProduct) {
        if (isAdminOrStaff) await adminProductService.updateProduct(editingProduct._id, payload);
        else await productService.updateProduct(editingProduct._id, payload);
        toast.success('Asset synchronized successfully.');
      } else {
        if (isAdminOrStaff) await adminProductService.createProduct(payload);
        else await productService.createProduct(payload);
        toast.success('Asset acquired and logged.');
      }

      setShowProductModal(false);
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Synchronization failure.');
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
          <button onClick={() => handleOpenProductModal()} className="flex-1 lg:flex-none px-8 py-3.5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group">
            <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" /> Add Product
          </button>
          <button onClick={() => handleOpenInventoryModal()} className="flex-1 lg:flex-none px-8 py-3.5 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-50 transition-all flex items-center justify-center gap-3">
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
            {/* Catalog Identity HUD Filter - High Contrast & Always Visible */}
            <div className="bg-slate-900 p-2 rounded-[1.5rem] shadow-xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-6 relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-3">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                        </div>
                        <input
                            type="text" value={productSearchInput} onChange={(e) => setProductSearchInput(e.target.value)}
                            placeholder=""
                            className="w-full pl-14 pr-4 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans input-with-icon"
                        />
                    </div>
                    <div className="md:col-span-4 relative">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2">
                            <Layers className="h-3.5 w-3.5 text-primary-500" />
                        </div>
                        <select
                            value={productFilters.category} 
                            onChange={(e) => setProductFilters(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-14 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
                        >
                            <option value="" className="bg-slate-900 text-white font-black">ALL CATEGORIES: VIEW ALL</option>
                            {Object.keys(categoryHierarchy).map(c => (
                              <option key={c} value={c} className="bg-slate-900 text-white font-black">{c.toUpperCase()}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
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
                          className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl hover:bg-primary-600 hover:text-white transition-all shadow-sm">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => { if (window.confirm('PURGE_ASSET?')) adminProductService.deleteProduct(product._id).then(fetchProducts) }}
                          className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-sm">
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
            {/* Inventory HUD Filter - High Contrast & Always Visible */}
            <div className="bg-slate-900 p-2 rounded-[1.5rem] shadow-xl border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-12 relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-3">
                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                        </div>
                        <input
                            type="text" value={inventorySearchInput} onChange={(e) => setInventorySearchInput(e.target.value)}
                            placeholder=""
                            className="w-full pl-14 pr-4 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
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
                            item.currentStock <= item.reorderLevel ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              'bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`}>
                            {item.currentStock === 0 ? 'OUT OF STOCK' : item.currentStock <= item.reorderLevel ? 'LOW STOCK' : 'IN STOCK'}
                          </span>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <button onClick={() => handleOpenInventoryModal(item)} className="px-6 py-3.5 bg-white border-2 border-slate-100 hover:bg-slate-900 hover:border-slate-900 hover:text-white rounded-2xl transition-all text-slate-500 text-[10px] font-black uppercase tracking-widest group-hover:shadow-lg">
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

      {/* Product Form Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 overflow-hidden">
          <div className="bg-white w-full max-w-4xl rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh] border border-slate-200">
            {/* Modal Header */}
            <header className="p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-2xl shadow-primary-200">
                  <Package className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Shield className="h-2.5 w-2.5 text-primary-600" />
                    <span className="text-[8px] font-black text-primary-600 uppercase tracking-[0.4em] leading-none">Action : {editingProduct ? 'Update' : 'Asset'}</span>
                  </div>
                  <h3 className="text-xl font-black uppercase text-slate-900 tracking-tighter leading-none">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                </div>
              </div>
              <button onClick={() => setShowProductModal(false)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-slate-50/30">
              <div className="max-w-4xl mx-auto space-y-6">
                
                {/* 1. Basic Information */}
                <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setActiveSections(p => ({ ...p, basic: !p.basic }))}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-50 text-primary-600 rounded-lg flex items-center justify-center">
                        <Info className="h-4 w-4" />
                      </div>
                      <h4 className="text-base font-black uppercase tracking-tight text-slate-900">A. Basic Information</h4>
                    </div>
                    {activeSections.basic ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </button>
                  
                  {activeSections.basic && (
                    <div className="p-6 border-t border-slate-50 space-y-6 animate-in slide-in-from-top-2 duration-300">
                      {/* Images */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Product Images (1–9)</label>
                          <span className={`text-[10px] font-bold ${productForm.images.length >= 1 && productForm.images.length <= 9 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {productForm.images.length}/9 Images
                          </span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                          {productForm.images.map((img, i) => (
                            <div key={i} className="aspect-square bg-slate-50 rounded-2xl border-2 border-slate-100 relative group overflow-hidden">
                              <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                              <button 
                                type="button" 
                                onClick={() => setProductForm(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))}
                                className="absolute inset-0 bg-rose-600/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                <Trash2 className="h-5 w-5 text-white" />
                              </button>
                            </div>
                          ))}
                          {productForm.images.length < 9 && (
                            <label className="aspect-square border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-all group">
                              <Plus className="h-6 w-6 text-slate-300 group-hover:text-primary-600" />
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Upload Image</span>
                              <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Video (Optional) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Product Video (Optional)</label>
                          <div className="p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-3">
                            <Video className="h-8 w-8 text-slate-300" />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Connect Visual Stream</span>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Product Name *</label>
                            <input 
                              type="text" 
                              required
                              value={productForm.name}
                              onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
                              className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-[12px] font-black uppercase tracking-tight focus:border-primary-500 outline-none transition-all"
                              placeholder="Product identifier..."
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GTIN</label>
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        checked={productForm.hasNoGtin} 
                                        onChange={e => setProductForm(p => ({ ...p, hasNoGtin: e.target.checked, gtin: e.target.checked ? '' : p.gtin }))} 
                                        className="hidden" 
                                    />
                                    <div className={`w-4 h-4 rounded border-2 transition-all ${productForm.hasNoGtin ? 'bg-primary-600 border-primary-600' : 'border-slate-200'}`} />
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">This product has no GTIN</span>
                                </label>
                            </div>
                            <input 
                              type="text" 
                              disabled={productForm.hasNoGtin}
                              value={productForm.gtin}
                              onChange={e => setProductForm(p => ({ ...p, gtin: e.target.value }))}
                              className={`w-full px-6 py-4 bg-slate-50 border-2 rounded-2xl text-[12px] font-black uppercase tracking-tight outline-none transition-all ${productForm.hasNoGtin ? 'opacity-30 border-slate-50' : 'border-slate-50 focus:border-primary-500'}`}
                              placeholder="Global Trade Item Number..."
                            />
                          </div>
                        </div>
                      </div>

                       {/* Description */}
                       <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Detailed Description</label>
                        <textarea 
                          value={productForm.description}
                          onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                          className="w-full px-8 py-8 bg-slate-50 border-2 border-slate-50 rounded-3xl text-[14px] font-medium leading-relaxed outline-none focus:border-primary-500 transition-all h-48 resize-none shadow-inner"
                          placeholder="Technical specs and narrative..."
                        />
                      </div>
                    </div>
                  )}
                </section>

                {/* 2. Categories */}
                <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                   <button 
                    onClick={() => setActiveSections(p => ({ ...p, categories: !p.categories }))}
                    className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-50 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                        <Layers className="h-5 w-5" />
                      </div>
                      <h4 className="text-lg font-black uppercase tracking-tight text-slate-900">B. Categories</h4>
                    </div>
                    {activeSections.categories ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                  </button>

                  {activeSections.categories && (
                    <div className="p-8 border-t border-slate-50 space-y-8 animate-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">Main Category</label>
                          <select 
                            value={productForm.mainCategory}
                            onChange={e => setProductForm(p => ({ ...p, mainCategory: e.target.value, subCategory: categoryHierarchy[e.target.value][0] }))}
                            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-[12px] font-black uppercase outline-none focus:border-primary-500 appearance-none"
                          >
                            {Object.keys(categoryHierarchy).map(k => <option key={k} value={k}>{k}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">Sub-Category</label>
                          <select 
                            value={productForm.subCategory}
                            onChange={e => setProductForm(p => ({ ...p, subCategory: e.target.value }))}
                            className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-[12px] font-black uppercase outline-none focus:border-primary-500 appearance-none"
                          >
                            {categoryHierarchy[productForm.mainCategory]?.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>

                      {productForm.subCategory.includes('Vitamins') && (
                        <div className="p-8 bg-rose-50 rounded-[2rem] border border-rose-100 flex flex-col md:flex-row items-center gap-6">
                            <div className="w-16 h-16 bg-rose-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg">
                                <Shield className="h-8 w-8" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[12px] font-black text-rose-700 uppercase tracking-widest mb-1">Health Permit Required</p>
                                <p className="text-[10px] text-rose-600 font-bold uppercase tracking-widest">Vitamins & Supplements require verified documentation from regulatory assets.</p>
                            </div>
                            <label className="px-8 py-3 bg-white border-2 border-rose-200 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all">
                                Upload Permit
                                <input type="file" className="hidden" />
                            </label>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* 3. Sales Information */}
                <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                   <button 
                    onClick={() => setActiveSections(p => ({ ...p, sales: !p.sales }))}
                    className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-50 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                        <Tag className="h-5 w-5" />
                      </div>
                      <h4 className="text-lg font-black uppercase tracking-tight text-slate-900">2. Sales Information</h4>
                    </div>
                    {activeSections.sales ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                  </button>

                  {activeSections.sales && (
                    <div className="p-8 border-t border-slate-50 space-y-10 animate-in slide-in-from-top-2 duration-300">
                       <div className="flex items-center justify-between">
                         <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Variation Management</h5>
                         <button 
                            type="button" 
                            onClick={() => setProductForm(p => ({ ...p, variations: [...p.variations, { name: '', description: '', options: [{ value: '', price: '', stock: '', sku: '' }] }] }))}
                            className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all"
                          >
                           + Add Variation Group
                         </button>
                       </div>

                       {productForm.variations.length === 0 ? (
                         <div className="p-12 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                            <Box className="h-12 w-12 text-slate-200" />
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No variations identified. Using base configuration.</p>
                            <div className="grid grid-cols-3 gap-6 w-full max-w-2xl mt-4">
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-slate-400 uppercase text-center block">Global Price</label>
                                  <input type="number" className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl text-center text-xs font-black shadow-inner" placeholder="0.00" />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-slate-400 uppercase text-center block">Stock Volume</label>
                                  <input type="number" className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl text-center text-xs font-black shadow-inner" placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-slate-400 uppercase text-center block">Base SKU</label>
                                  <input type="text" className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl text-center text-xs font-black shadow-inner" placeholder="SKU-..." />
                                </div>
                            </div>
                         </div>
                       ) : (
                         <div className="space-y-8">
                            {productForm.variations.map((v, idx) => (
                              <div key={idx} className="p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 space-y-6">
                                <div className="flex items-center justify-between">
                                   <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-900">{idx + 1}</div>
                                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Group Definition</span>
                                   </div>
                                   <button type="button" onClick={() => setProductForm(p => ({ ...p, variations: p.variations.filter((_, i) => i !== idx) }))} className="text-rose-500 hover:text-rose-600">
                                      <Trash2 className="h-4 w-4" />
                                   </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                   <input 
                                    className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none focus:border-primary-500"
                                    placeholder="VARIATION NAME (COLOR, SIZE, ETC.)"
                                    value={v.name}
                                    onChange={(e) => {
                                      const newV = [...productForm.variations];
                                      newV[idx].name = e.target.value;
                                      setProductForm(p => ({ ...p, variations: newV }));
                                    }}
                                   />
                                   <input 
                                    className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none focus:border-primary-500"
                                    placeholder="DESCRIPTION / EXPLANATION"
                                    value={v.description}
                                    onChange={(e) => {
                                      const newV = [...productForm.variations];
                                      newV[idx].description = e.target.value;
                                      setProductForm(p => ({ ...p, variations: newV }));
                                    }}
                                   />
                                </div>

                                <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden">
                                   <table className="w-full border-collapse">
                                      <thead>
                                         <tr className="bg-slate-900/5 divide-x divide-slate-200/40">
                                            <th className="px-6 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/40">Option</th>
                                            <th className="px-6 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/40">Price</th>
                                            <th className="px-6 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/40">Stock</th>
                                            <th className="px-6 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/40">SKU</th>
                                            <th className="px-6 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/40">Actions</th>
                                         </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                         {v.options.map((opt, oIdx) => (
                                           <tr key={oIdx} className="divide-x divide-slate-100">
                                              <td className="p-2"><input className="w-full px-4 py-3 text-center text-xs font-black uppercase outline-none" placeholder="RED" value={opt.value} /></td>
                                              <td className="p-2"><input className="w-full px-4 py-3 text-center text-xs font-black uppercase outline-none" placeholder="0.00" value={opt.price} /></td>
                                              <td className="p-2"><input className="w-full px-4 py-3 text-center text-xs font-black uppercase outline-none" placeholder="0" value={opt.stock} /></td>
                                              <td className="p-2"><input className="w-full px-4 py-3 text-center text-xs font-black uppercase outline-none" placeholder="SKU-..." value={opt.sku} /></td>
                                              <td className="p-2 text-center">
                                                <button type="button" className="text-slate-300 hover:text-rose-500"><Trash2 size={14}/></button>
                                              </td>
                                           </tr>
                                         ))}
                                      </tbody>
                                   </table>
                                   <div className="p-4 bg-slate-50 flex items-center justify-between">
                                      <button type="button" className="text-[9px] font-black text-primary-600 uppercase tracking-widest hover:underline">+ Add Option</button>
                                      <div className="flex gap-2">
                                         <button type="button" className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200">Apply to All</button>
                                      </div>
                                   </div>
                                </div>
                              </div>
                            ))}
                         </div>
                       )}
                    </div>
                  )}
                </section>

                {/* 4. Shipping */}
                <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-12">
                   <button 
                    onClick={() => setActiveSections(p => ({ ...p, shipping: !p.shipping }))}
                    className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-50 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                        <TrendingDown className="h-5 w-5" />
                      </div>
                      <h4 className="text-lg font-black uppercase tracking-tight text-slate-900">3. Shipping</h4>
                    </div>
                    {activeSections.shipping ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                  </button>

                  {activeSections.shipping && (
                    <div className="p-8 border-t border-slate-50 space-y-10 animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                           <div className="space-y-4">
                              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Actual Weight (kg)</label>
                              <div className="relative">
                                <Scale className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-600" />
                                <input 
                                  type="number" 
                                  className="w-full pl-14 pr-8 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-[12px] font-black outline-none focus:border-primary-500 transition-all" 
                                  placeholder="0.00" 
                                  value={productForm.shipping.weight}
                                  onChange={e => setProductForm(p => ({ ...p, shipping: { ...p.shipping, weight: e.target.value } }))}
                                />
                              </div>
                           </div>

                           <div className="md:col-span-2 bg-slate-900 p-8 rounded-[2.5rem] text-white">
                              <p className="text-[10px] font-black text-primary-500 uppercase tracking-widest mb-6">Parcel Size Dimensions (cm)</p>
                              <div className="grid grid-cols-3 gap-6">
                                 {['length', 'width', 'height'].map(dim => (
                                    <div key={dim} className="space-y-2">
                                       <label className="text-[8px] font-black text-white/40 uppercase tracking-widest text-center block">{dim}</label>
                                       <input 
                                          type="number" 
                                          className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-center text-[12px] font-black text-white outline-none focus:bg-white focus:text-slate-900 transition-all"
                                          placeholder="0"
                                          value={productForm.shipping.parcelSize[dim]}
                                          onChange={e => setProductForm(p => ({ 
                                            ...p, 
                                            shipping: { 
                                              ...p.shipping, 
                                              parcelSize: { ...p.shipping.parcelSize, [dim]: e.target.value } 
                                            } 
                                          }))}
                                       />
                                    </div>
                                 ))}
                              </div>
                           </div>
                        </div>

                        <div className="space-y-4">
                           <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Standard Shipping Fee (₱)</label>
                           <div className="relative max-w-sm">
                             <PhilippinePeso className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-primary-600" />
                             <input 
                                type="number" 
                                className="w-full pl-14 pr-8 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-[14px] font-black outline-none focus:border-primary-500 transition-all" 
                                placeholder="0.00"
                                value={productForm.shipping.fee}
                                onChange={e => setProductForm(p => ({ ...p, shipping: { ...p.shipping, fee: e.target.value } }))}
                             />
                           </div>
                        </div>
                    </div>
                  )}
                </section>
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
