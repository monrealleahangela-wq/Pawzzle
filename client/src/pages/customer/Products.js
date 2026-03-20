import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { productService, getImageUrl } from '../../services/apiService';
import { Package, Filter, Search, Store, ArrowLeft, ArrowRight, ShoppingCart, Eye, MapPin, Navigation, Zap, Star } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { getCitiesByProvince } from '../../constants/locationConstants';
import LoginModal from '../../components/LoginModal';
import { useCart } from '../../contexts/CartContext';

const CAVITE_CITIES = getCitiesByProvince('cavite');

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const normalizeString = (str) => {
  if (!str) return '';
  return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};


const Products = () => {
  const navigate = useNavigate();
  const { addToCart, buyNow } = useCart();
  const { user, isAuthenticated } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    brand: '',
    suitableFor: '',
    minPrice: '',
    maxPrice: '',
    inStock: false,
    city: '',
    nearMe: false
  });
  const [userLocation, setUserLocation] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });

  useEffect(() => {
    fetchProducts();
  }, [filters.category, filters.brand, filters.suitableFor, filters.minPrice, filters.maxPrice, filters.inStock, filters.city, pagination.currentPage]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params = {
        ...filters,
        page: pagination.currentPage,
        limit: 12
      };

      delete params.nearMe;

      if (searchTerm) {
        params.brand = searchTerm;
      }

      const response = await productService.getAllProducts(params);
      let fetchedProducts = response.data.products || [];


      if (filters.nearMe && userLocation) {
        fetchedProducts = fetchedProducts
          .map(p => {
            const storeLat = p.store?.contactInfo?.address?.coordinates?.lat;
            const storeLng = p.store?.contactInfo?.address?.coordinates?.lng;

            const distance = (storeLat && storeLng) ? calculateDistance(
              userLocation.lat,
              userLocation.lng,
              storeLat,
              storeLng
            ) : Infinity;

            return { ...p, distance };
          })
          .filter(p => p.distance <= 5) // Enforce 5km radius
          .sort((a, b) => a.distance - b.distance);
      }

      setProducts(fetchedProducts);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (name, value) => {
    if (name === 'nearMe' && value === true) {
      handleNearMe();
    } else {
      setFilters(prev => ({ ...prev, [name]: value, ...(name === 'city' ? { nearMe: false } : {}) }));
      setPagination(prev => ({ ...prev, currentPage: 1 }));
    }
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      toast.error('GPS is not supported by your browser');
      return;
    }

    setLoading(true);
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    };

    const success = (position) => {
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
      setFilters(prev => ({ ...prev, nearMe: true, city: '' }));
      setLoading(false);
      toast.success('Location acquired! Sorting nearest supplies.');
    };

    const error = (err) => {
      console.error('Geolocation error:', err);
      if (options.enableHighAccuracy) {
        options.enableHighAccuracy = false;
        navigator.geolocation.getCurrentPosition(success, lastDitchError, options);
        return;
      }
      lastDitchError(err);
    };

    const lastDitchError = (err) => {
      setLoading(false);
      let msg = 'Could not get your location';
      if (err.code === 1) msg = 'Location access denied. Please enable GPS.';
      else if (err.code === 2) msg = 'Position unavailable. Check your connection.';
      else if (err.code === 3) msg = 'Location request timed out. Try again.';
      toast.error(msg);
    };

    navigator.geolocation.getCurrentPosition(success, error, options);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchProducts();
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  const handleAddToCart = (product) => {
    // Check if authenticated using context flag
    if (!isAuthenticated || !user) {
      setShowLoginModal(true);
      return;
    }

    const userId = user._id || user.id;

    const cartItem = {
      itemId: product._id,
      name: product.name,
      price: product.price,
      category: product.category,
      image: product.images?.[0] || null,
      quantity: 1,
      itemType: 'product',
      storeName: product.store?.name,
      storeId: product.store?._id,
      storeAddress: product.store?.contactInfo?.address,
      userId: userId
    };

    addToCart(cartItem);
    toast.success(`${product.name} added to cart!`);
  };

  const handleBuyNow = (product) => {
    // Check if authenticated using context flag
    if (!isAuthenticated || !user) {
      setShowLoginModal(true);
      return;
    }

    const userId = user._id || user.id;

    const item = {
      itemId: product._id,
      name: product.name,
      price: product.price,
      category: product.category,
      image: product.images?.[0] || null,
      quantity: 1,
      itemType: 'product',
      storeName: product.store?.name,
      storeId: product.store?._id,
      storeAddress: product.store?.contactInfo?.address,
      userId: userId,
      selected: true
    };

    // Logic: Atomic buyNow handles deselection and addition
    buyNow(item);

    setTimeout(() => {
      navigate('/checkout');
    }, 100);
  };

  if (loading && products.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-10 animate-fade-in pb-20 px-1 sm:px-0">
      {/* Decorative background element */}
      <div className="fixed inset-0 z-[-1] pointer-events-none opacity-40">
        <div className="absolute top-40 left-[-5%] w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] bg-primary-50 rounded-full blur-[100px] blob-animation" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-secondary-50 rounded-full blur-[80px] blob-animation" style={{ animationDelay: '-3s' }} />
      </div>

      {/* Header & Search */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 sm:gap-6 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-5xl font-black text-slate-900 tracking-tight uppercase">Supply Chain</h1>
            <p className="text-[9px] sm:text-lg text-slate-400 font-bold uppercase tracking-widest hidden sm:block">Grade-A Provisioning for Elite Companions</p>
          </div>

          <form onSubmit={handleSearch} className="w-full md:w-auto flex gap-2">
            <div className="input-container md:w-80">
              <Search className="input-icon h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="PROCURING BRAND..."
                className="input input-with-icon border-none rounded-xl text-[10px] sm:text-sm font-bold uppercase tracking-widest bg-slate-50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button type="submit" className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">
              EXECUTE
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-10">
        {/* Modern Filters Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="lg:hidden w-full flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary-600" />
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Global Filters {Object.values(filters).filter(Boolean).length > 0 && `[${Object.values(filters).filter(Boolean).length}]`}</span>
            </div>
            <ArrowRight className={`h-4 w-4 transition-transform ${showMobileFilters ? 'rotate-90' : ''}`} />
          </button>

          <div className={`${showMobileFilters ? 'block' : 'hidden lg:block'} card sticky top-24 p-5 border-slate-100 bg-white shadow-xl animate-fade-in`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary-600" />
                <h3 className="font-black text-slate-900 text-[10px] uppercase tracking-widest">Constraints</h3>
              </div>
              <button
                onClick={() => {
                  setFilters({
                    category: '', brand: '', suitableFor: '',
                    minPrice: '', maxPrice: '', inStock: false,
                    city: '', nearMe: false
                  });
                  setShowMobileFilters(false);
                }}
                className="text-[8px] font-black text-primary-600 uppercase tracking-widest"
              >
                RESET
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Geo-Zone</label>
                <div className="flex flex-col gap-2">
                  <select
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-tight border-none focus:ring-2 focus:ring-primary-500/10"
                    value={filters.city}
                    onChange={(e) => handleFilterChange('city', e.target.value)}
                  >
                    <option value="">Global Fleet</option>
                    {CAVITE_CITIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleFilterChange('nearMe', !filters.nearMe)}
                    className={`flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filters.nearMe
                      ? 'bg-secondary-600 text-white shadow-md'
                      : 'bg-slate-50 text-slate-400 hover:text-primary-600'
                      }`}
                  >
                    <Navigation className="h-3 w-3" />
                    GPS LOCAL
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                <select
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-tight border-none"
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="food">Sustenance</option>
                  <option value="toys">Engagement</option>
                  <option value="accessories">Equipment</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valuation</label>
                <select
                  value={filters.minPrice ? `${filters.minPrice}-${filters.maxPrice}` : ''}
                  onChange={(e) => {
                    const [min, max] = e.target.value.split('-').map(Number);
                    handleFilterChange('minPrice', min);
                    handleFilterChange('maxPrice', max);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-tight border-none"
                >
                  <option value="">Any Tier</option>
                  <option value="0-500">Tier I (&lt;₱500)</option>
                  <option value="500-1000">Tier II (₱1K)</option>
                  <option value="1000-5000">Tier III (₱5K)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-50">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={filters.inStock}
                      onChange={(e) => handleFilterChange('inStock', e.target.checked)}
                    />
                    <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:bg-primary-600 transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5"></div>
                  </div>
                  <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Ready-to-Ship</span>
                </label>
              </div>

              {showMobileFilters && (
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest mt-2"
                >
                  Verify Context
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Dynamic Product Grid */}
        <main className="flex-1">
          {products.length === 0 ? (
            <div className="card border-dashed border-2 bg-slate-50/50 flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-8 w-8 text-slate-300 mb-3" />
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Stock Depleted</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1 mb-4">No matching assets in local database</p>
              <button
                onClick={() => setFilters({
                  category: '', brand: '', suitableFor: '',
                  minPrice: '', maxPrice: '', inStock: false
                })}
                className="text-[10px] font-black text-primary-600 uppercase tracking-widest underline"
              >
                Flush All Context
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {products.map((product, idx) => (
                <div
                  key={product._id}
                  className="group bg-white rounded-[2.5rem] border border-slate-100 p-2 flex flex-col transition-all hover:shadow-2xl hover:shadow-primary-100/10 relative overflow-hidden animate-slide-up"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-[3rem] -translate-y-12 translate-x-12 group-hover:bg-primary-50 transition-colors duration-500" />

                  <div className="h-32 sm:h-56 bg-slate-50 flex items-center justify-center relative overflow-hidden rounded-[2rem] z-10">
                    {product.images && product.images[0] ? (
                        <img
                          src={getImageUrl(product.images[0])}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          onError={(e) => { e.target.onerror = null; e.target.src = "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400&h=400&fit=crop"; }}
                        />
                    ) : (
                      <Package className="h-8 w-8 text-slate-200" />
                    )}

                    <div className="absolute top-3 right-3 flex flex-col gap-1.5">
                      <span className={`px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-wider shadow-sm backdrop-blur-md border border-white/20 ${product.stockQuantity > 5 ? 'bg-emerald-500/90 text-white' : 'bg-rose-500/90 text-white'}`}>
                        {product.stockQuantity > 5 ? 'IN_STOCK' : 'LOW_STOCK'}
                      </span>
                      <span className="px-2.5 py-1 bg-slate-900/90 backdrop-blur-md rounded-xl text-[8px] font-black uppercase tracking-widest text-white border border-white/10 shadow-sm">
                        QUALIFIED
                      </span>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col relative z-10">
                    <div className="mb-3">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] leading-none mb-1.5 truncate">
                        {product.brand || 'Consumable Grade'}
                      </p>
                      <h3 className="text-[13px] sm:text-xl font-black text-slate-900 leading-tight uppercase truncate group-hover:text-primary-600 transition-colors">
                        {product.name}
                      </h3>
                      {product.ratings && product.ratings.count > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className="text-[10px] font-bold text-slate-600">
                            {product.ratings.average.toFixed(1)} <span className="text-slate-400 font-normal">({product.ratings.count})</span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col mt-auto gap-3">
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-primary-600 uppercase tracking-widest -mb-0.5">{product.category}</span>
                          <span className="text-base sm:text-2xl font-black text-slate-900 tracking-tighter">₱{product.price?.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex gap-1.5">
                        <Link
                          to={`/products/${product._id}`}
                          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-200 rounded-lg sm:rounded-xl transition-colors shadow-sm"
                          title="View Intelligence"
                        >
                          <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                        </Link>
                        <button
                          onClick={() => handleAddToCart(product)}
                          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg sm:rounded-xl hover:bg-slate-200 transition-all active:scale-90 shadow-sm"
                          title="Add to Registry"
                        >
                          <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                        <button
                          onClick={() => handleBuyNow(product)}
                          className="flex-1 h-8 sm:h-10 flex items-center justify-center bg-slate-900 hover:bg-primary-600 text-white rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg gap-1.5"
                        >
                          <Zap className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" />
                          <span className="hidden sm:inline">Buy Now</span>
                          <span className="sm:hidden">Buy</span>
                        </button>
                      </div>
                    </div>

                    {/* Store Node */}
                    <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                          <MapPin className="h-2.5 w-2.5 text-primary-500" />
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate">
                          {product.store?.name} • {product.store?.contactInfo?.address?.city || 'Cavite'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-10">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrev}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 disabled:opacity-20 transition-all shadow-sm"
              >
                <ArrowLeft className="h-3 w-3" />
              </button>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow-lg">
                <span className="text-secondary-400">{pagination.currentPage}</span>
                <span className="opacity-30">/</span>
                <span>{pagination.totalPages}</span>
              </div>
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNext}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 disabled:opacity-20 transition-all shadow-sm"
              >
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </main>
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={() => navigate('/login')}
      />
    </div>
  );
};

export default Products;
