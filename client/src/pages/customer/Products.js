import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dssService, productService, getImageUrl } from '../../services/apiService';
import { Package, Filter, Search, ArrowLeft, ArrowRight, ShoppingCart, Eye, MapPin, Navigation, Zap, Star, Sparkles, PawPrint } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { getCitiesByProvince } from '../../constants/locationConstants';
import LoginModal from '../../components/LoginModal';
import { useCart } from '../../contexts/CartContext';
import { formatPeso } from '../../utils/paymentSummary';
import { PRODUCT_CATEGORIES } from '../../constants/productCategories';

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
  const [error, setError] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    brand: '',
    suitableFor: '',
    minPrice: '',
    maxPrice: '',
    city: '',
    nearMe: false
  });
  const [userLocation, setUserLocation] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [recommendationBudget, setRecommendationBudget] = useState('1000');
  const [selectedPetProfileId, setSelectedPetProfileId] = useState('');
  const [recommendationCategory, setRecommendationCategory] = useState('all');
  const [comparisonIds, setComparisonIds] = useState([]);
  const [recommendationData, setRecommendationData] = useState(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchProducts();
    }, 350);
    return () => clearTimeout(debounce);
  }, [filters.category, filters.brand, filters.suitableFor, filters.minPrice, filters.maxPrice, filters.city, pagination.currentPage, searchTerm]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'customer') {
      setRecommendationData(null);
      return undefined;
    }
    let active = true;
    const debounce = setTimeout(async () => {
      try {
        setRecommendationsLoading(true);
        setRecommendationError('');
        const response = await dssService.getProductRecommendations({
          budget: Number(recommendationBudget),
          category: recommendationCategory,
          ...(selectedPetProfileId ? { petProfileId: selectedPetProfileId } : {})
        });
        if (active) {
          setRecommendationData(response.data);
          if (!selectedPetProfileId && response.data?.petProfiles?.[0]?._id) setSelectedPetProfileId(response.data.petProfiles[0]._id);
        }
      } catch (requestError) {
        if (active) setRecommendationError(requestError.response?.data?.message || 'Personalized product recommendations are temporarily unavailable.');
      } finally {
        if (active) setRecommendationsLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(debounce);
    };
  }, [isAuthenticated, user?.role, recommendationBudget, selectedPetProfileId, recommendationCategory]);

  useEffect(() => {
    const availableIds = new Set((recommendationData?.recommendations || []).map(item => item.product._id));
    setComparisonIds(current => current.filter(id => availableIds.has(id)));
  }, [recommendationData]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {
        ...filters,
        page: pagination.currentPage,
        limit: 12
      };

      delete params.nearMe;

      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await productService.getAllProducts(params);
      let fetchedProducts = (response.data.products || [])
        .filter(product => Number(product.stockQuantity || 0) > 0);

      // SECURITY: Professional Sellers should only see their own context.
      // If the user is a seller, we filter the marketplace to keep them focused on their business.
      if (user?.role === 'seller' || user?.role === 'store_owner') {
        const storeId = user.store?._id || user._id; // Depending on how store is linked
        fetchedProducts = fetchedProducts.filter(p => p.store?._id === storeId || p.store === storeId);
      }


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
      setError(error.response?.data?.message || 'Unable to load products. Please try again.');
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
      toast.success('Location found! Showing nearby items.');
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
    if (product.productMode === 'variant') {
      navigate(`/products/${product._id}`);
      toast.info('Choose an available product option first.');
      return;
    }
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
    if (product.productMode === 'variant') {
      navigate(`/products/${product._id}`);
      toast.info('Choose an available product option first.');
      return;
    }
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
    <div className="customer-marketplace-page marketplace-catalog marketplace-products w-full max-w-full min-w-0 space-y-4 sm:space-y-8 animate-fade-in pb-20 px-1 sm:px-0">
      {/* Decorative background element */}
      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden opacity-40">
        <div className="absolute top-40 left-[-5%] w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] bg-primary-50 rounded-full blur-[100px] blob-animation" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-secondary-50 rounded-full blur-[80px] blob-animation" style={{ animationDelay: '-3s' }} />
      </div>

      {/* Header & Search */}
      <div className="flex flex-col space-y-4">
        <div className="marketplace-page-header flex min-w-0 flex-col md:flex-row justify-between items-start md:items-end gap-3 sm:gap-6 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 sm:text-3xl">Pet Shop</h1>
            <p className="text-[9px] sm:text-lg text-slate-400 font-bold uppercase tracking-widest hidden sm:block">Premium supplies for your beloved pets</p>
          </div>

          <form onSubmit={handleSearch} className="marketplace-page-search flex w-full min-w-0 gap-2 md:max-w-sm">
            <div className="input-container min-w-0 flex-1">
              <Search className="input-icon h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="SEARCH FOR ITEMS..."
                className="input input-with-icon border-none rounded-xl text-[10px] sm:text-sm font-bold uppercase tracking-widest bg-slate-50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPagination(prev => ({ ...prev, currentPage: 1 }));
                }}
              />
            </div>
            <button type="submit" className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">
              SEARCH
            </button>
          </form>
        </div>
      </div>

      {isAuthenticated && user?.role === 'customer' && (
        <section className="overflow-hidden rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-secondary-50 p-4 shadow-sm sm:p-6" aria-labelledby="product-dss-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary-700"><Sparkles className="h-4 w-4" /> Personalized Product DSS</p>
              <h2 id="product-dss-title" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">Personalized Product Recommendations</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">Products are screened and ranked using the selected pet's species, breed, age, size, weight, activity, coat, sensitivities, preferences, and budget.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:w-[42rem]">
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-600">Saved pet profile
                <select aria-label="Saved pet profile" value={selectedPetProfileId} onChange={event => setSelectedPetProfileId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case tracking-normal text-slate-800">
                  <option value="">Select a saved pet</option>
                  {(recommendationData?.petProfiles || []).map(pet => <option key={pet._id} value={pet._id}>{pet.name} · {pet.type}{pet.breed ? ` · ${pet.breed}` : ''}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-600">Product category
                <select aria-label="Recommendation category" value={recommendationCategory} onChange={event => setRecommendationCategory(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case tracking-normal text-slate-800"><option value="all">All products</option><option value="food">Food & treats</option><option value="grooming">Grooming</option><option value="toys">Toys</option><option value="accessories">Accessories & clothing</option><option value="wellness">Health & wellness</option><option value="essentials">Other essentials</option></select>
              </label>
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-600">Maximum budget per item
                <select aria-label="Maximum budget per item" value={recommendationBudget} onChange={event => setRecommendationBudget(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case tracking-normal text-slate-800">
                  {[250, 500, 1000, 2000, 5000].map(value => <option key={value} value={String(value)}>{formatPeso(value)}</option>)}
                </select>
              </label>
            </div>
          </div>

          {recommendationsLoading && <p className="mt-5 rounded-2xl bg-white/80 p-5 text-center text-xs font-bold text-slate-500">Calculating personalized product matches...</p>}
          {!recommendationsLoading && recommendationError && <p role="alert" className="mt-5 rounded-2xl bg-rose-50 p-4 text-xs font-bold text-rose-700">{recommendationError}</p>}
          {!recommendationsLoading && !recommendationError && recommendationData?.status === 'no_pet_profiles' && <div className="mt-5 rounded-2xl border border-dashed border-primary-200 bg-white/80 p-5 text-center"><PawPrint className="mx-auto h-6 w-6 text-primary-500" /><p className="mt-2 text-sm font-black text-slate-900">Add a pet profile to receive recommendations</p><p className="mt-1 text-xs text-slate-500">A saved pet profile is required for safe, personalized matching.</p><Link to="/profile" className="mt-3 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white">Manage pet profiles</Link></div>}
          {!recommendationsLoading && !recommendationError && recommendationData?.status === 'budget_mismatch' && <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-xs font-bold text-amber-800">Suitable products are available, but none fits the current {formatPeso(recommendationData.budget)} budget. Increase the budget or review the alternatives below.</p>}
          {!recommendationsLoading && !recommendationError && recommendationData?.status === 'no_compatible_products' && <p className="mt-5 rounded-2xl bg-white/80 p-4 text-xs font-bold text-slate-600">No available product has enough declared information to safely match this pet. Try another category or ask sellers to complete their product details.</p>}
          {!recommendationsLoading && !recommendationError && recommendationData?.recommendations?.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recommendationData.recommendations.map(({ product, score, reasons, benefits = [], restrictions = [], warnings = [] }) => <article key={product._id} className="flex min-w-0 gap-3 rounded-2xl border border-white bg-white/90 p-3 shadow-sm">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">{product.images?.[0] ? <img src={getImageUrl(product.images[0])} alt={product.name} className="h-full w-full object-cover" /> : <Package className="m-6 h-8 w-8 text-slate-300" />}</div>
                <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-xs font-black uppercase leading-4 text-slate-950">{product.name}</p><span className="shrink-0 rounded-lg bg-primary-100 px-2 py-1 text-[9px] font-black text-primary-800">{score}% match</span></div><p className="mt-1 text-sm font-black text-slate-900">{formatPeso(product.price)}</p><p className="mt-1 text-[9px] font-black text-slate-700">Why this matches your pet</p><p className="line-clamp-3 text-[9px] font-semibold leading-4 text-slate-500">{reasons.join(' · ')}</p>{benefits.length > 0 && <p className="mt-1 text-[9px] text-emerald-700">Benefits: {benefits.join(', ')}</p>}{restrictions.length > 0 && <p className="mt-1 text-[9px] text-amber-700">Restrictions: {restrictions.join(', ')}</p>}{warnings.length > 0 && <p className="mt-1 text-[9px] font-semibold text-rose-700">{warnings.join(' ')}</p>}<div className="mt-2 flex items-center justify-between gap-2"><Link to={`/products/${product._id}`} className="text-[9px] font-black uppercase tracking-wide text-primary-700">View product →</Link><label className="text-[8px] font-black uppercase text-slate-500"><input type="checkbox" checked={comparisonIds.includes(product._id)} disabled={!comparisonIds.includes(product._id) && comparisonIds.length >= 3} onChange={() => setComparisonIds(current => current.includes(product._id) ? current.filter(id => id !== product._id) : [...current, product._id])} className="mr-1" />Compare</label></div></div>
              </article>)}
            </div>
          )}
          {comparisonIds.length > 1 && <div className="mt-4 overflow-x-auto rounded-2xl border border-primary-100 bg-white p-3"><p className="text-[10px] font-black uppercase text-primary-800">Product comparison</p><div className="mt-2 grid min-w-[32rem] gap-2" style={{ gridTemplateColumns: `repeat(${comparisonIds.length}, minmax(0, 1fr))` }}>{comparisonIds.map(id => { const item = recommendationData?.recommendations?.find(entry => entry.product._id === id); return <div key={id} className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black">{item?.product.name}</p><p className="mt-1 text-lg font-black text-primary-700">{item?.score}%</p><p className="text-[9px] text-slate-500">{item?.reasons?.slice(0, 3).join(' · ')}</p></div>; })}</div></div>}
          {recommendationData?.suitableAlternatives?.length > 0 && <div className="mt-4 rounded-2xl bg-amber-50 p-4"><p className="text-[10px] font-black uppercase text-amber-900">Suitable alternatives above this budget</p><p className="mt-1 text-[10px] text-amber-800">{recommendationData.suitableAlternatives.map(item => `${item.product.name} (${formatPeso(item.product.price)})`).join(' · ')}</p></div>}
          {recommendationData?.disclaimer && <p className="mt-4 text-[9px] font-semibold leading-4 text-slate-500">{recommendationData.disclaimer}</p>}
        </section>
      )}

      <div className="marketplace-catalog-layout flex w-full min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:gap-5">
        {/* Modern Filters Sidebar */}
        <aside className="marketplace-filter-sidebar w-full min-w-0 xl:w-60 xl:shrink-0">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="xl:hidden w-full flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary-600" />
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Filters</span>
            </div>
            <ArrowRight className={`h-4 w-4 transition-transform ${showMobileFilters ? 'rotate-90' : ''}`} />
          </button>

          <div className={`${showMobileFilters ? 'block' : 'hidden xl:block'} marketplace-filter-panel card xl:sticky xl:top-24 p-4 border-slate-100 bg-white shadow-xl animate-fade-in dark:bg-slate-900 dark:border-slate-800`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary-600" />
                <h3 className="font-black text-slate-900 text-[10px] uppercase tracking-widest">Filter By</h3>
              </div>
              <button
                onClick={() => {
                  setFilters({
                    category: '', brand: '', suitableFor: '',
                    minPrice: '', maxPrice: '',
                    city: '', nearMe: false
                  });
                  setShowMobileFilters(false);
                }}
                className="text-[8px] font-black text-primary-600 uppercase tracking-widest"
              >
                CLEAR
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Location</label>
                <div className="flex flex-col gap-2">
                  <select
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-tight border-none focus:ring-2 focus:ring-primary-500/10"
                    value={filters.city}
                    onChange={(e) => handleFilterChange('city', e.target.value)}
                  >
                    <option value="">All Areas</option>
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
                    NEAR ME
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
                  {PRODUCT_CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Price Range</label>
                <select
                  value={filters.minPrice ? `${filters.minPrice}-${filters.maxPrice}` : ''}
                  onChange={(e) => {
                    const [min, max] = e.target.value.split('-').map(Number);
                    handleFilterChange('minPrice', min);
                    handleFilterChange('maxPrice', max);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-tight border-none"
                >
                  <option value="">Any Price</option>
                  <option value="0-500">Under ₱500</option>
                  <option value="500-1000">Up to ₱1,000</option>
                  <option value="1000-5000">Over ₱1,000</option>
                </select>
              </div>

              <div className="flex items-center gap-2 border-t border-slate-50 pt-3">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Available products only</span>
              </div>

              {showMobileFilters && (
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest mt-2"
                >
                  Apply Filters
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Dynamic Product Grid */}
        <main className="w-full min-w-0 flex-1">
          {error ? (
            <div className="marketplace-empty-state card border-2 border-rose-200 bg-rose-50/50 flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-8 w-8 text-rose-300 mb-3" />
              <h3 className="text-sm font-black text-rose-800 uppercase tracking-widest">Unable to load products</h3>
              <p className="mt-1 mb-4 text-[10px] font-bold text-rose-600">{error}</p>
              <button onClick={fetchProducts} className="text-[10px] font-black text-primary-600 uppercase tracking-widest underline">Try again</button>
            </div>
          ) : products.length === 0 ? (
            <div className="marketplace-empty-state card border-dashed border-2 bg-slate-50/50 flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-8 w-8 text-slate-300 mb-3" />
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">We couldn't find any products</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1 mb-4">Try adjusting your filters</p>
              <button
                onClick={() => setFilters({
                  category: '', brand: '', suitableFor: '',
                  minPrice: '', maxPrice: ''
                })}
                className="text-[10px] font-black text-primary-600 uppercase tracking-widest underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="marketplace-result-grid marketplace-product-grid responsive-card-grid [--card-min:17rem] sm:[--card-min:18rem] xl:[--card-min:19rem]">
              {products.map((product, idx) => (
                <div
                  key={product._id}
                  className="marketplace-listing-card marketplace-product-card group w-full min-w-0 max-w-full bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 p-2 flex flex-col transition-all hover:shadow-2xl hover:shadow-primary-100/10 relative overflow-hidden animate-slide-up"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-[3rem] -translate-y-12 translate-x-12 group-hover:bg-primary-50 transition-colors duration-500" />

                  <div className="marketplace-listing-image h-32 sm:h-56 bg-slate-50 flex items-center justify-center relative overflow-hidden rounded-[2rem] z-10">
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

                    <div className="marketplace-product-badges absolute top-3 right-3 flex flex-col gap-1.5">
                      <span className={`px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-wider shadow-sm backdrop-blur-md border border-white/20 ${product.stockQuantity > 5 ? 'bg-emerald-500/90 text-white' : 'bg-rose-500/90 text-white'}`}>
                        {product.stockQuantity > 5 ? 'IN STOCK' : 'LOW STOCK'}
                      </span>
                      <span className="px-2.5 py-1 bg-slate-900/90 backdrop-blur-md rounded-xl text-[8px] font-black uppercase tracking-widest text-white border border-white/10 shadow-sm">
                        VERIFIED
                      </span>
                    </div>
                  </div>

                  <div className="marketplace-listing-copy min-w-0 p-3 sm:p-4 flex-1 flex flex-col relative z-10">
                    <div className="marketplace-product-summary mb-3">
                      <p className="mb-1.5 truncate text-[10px] font-black uppercase leading-tight tracking-wide text-slate-400" title={product.brand || 'Product'}>
                        {product.brand || 'Product'}
                      </p>
                      <h3 className="min-h-[2.5rem] text-base font-black uppercase leading-tight text-slate-900 line-clamp-2 break-words transition-colors group-hover:text-primary-600 sm:text-lg">
                        {product.name}
                      </h3>
                      {product.ratings && product.ratings.count > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          <Star className="w-3 h-3 text-secondary-400 fill-secondary-400" />
                          <span className="text-[10px] font-bold text-slate-600">
                            {product.ratings.average.toFixed(1)} <span className="text-slate-400 font-normal">({product.ratings.count})</span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="marketplace-product-commerce flex flex-col mt-auto gap-3">
                      <div className="marketplace-product-pricing flex min-w-0 items-end justify-between gap-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="text-[10px] font-black uppercase leading-tight tracking-wide text-primary-600 break-words">{product.category}</span>
                          <span className="text-base font-black tracking-tighter text-slate-900 sm:text-xl">{formatPeso(product.price)}</span>
                        </div>
                      </div>

                      <div className="marketplace-product-actions grid min-w-0 grid-cols-[2.5rem_2.5rem_minmax(0,1fr)] gap-1.5">
                        <Link
                          to={`/products/${product._id}`}
                           className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-200 rounded-lg sm:rounded-xl transition-colors shadow-sm"
                          title="View Info"
                        >
                          <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                        </Link>
                        <button
                          onClick={() => handleAddToCart(product)}
                          className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg sm:rounded-xl hover:bg-slate-200 transition-all active:scale-90 shadow-sm"
                          title="Add to Cart"
                        >
                          <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                        <button
                          onClick={() => handleBuyNow(product)}
                          className="flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-2 py-2 text-[10px] font-black uppercase leading-tight tracking-wide text-white shadow-lg transition-all hover:bg-primary-600 active:scale-95 sm:rounded-xl"
                        >
                          <Zap className="h-3.5 w-3.5 shrink-0" />
                          <span>Buy Now</span>
                        </button>
                      </div>
                    </div>

                    {/* Store Node */}
                    <Link 
                      to={`/stores/${product.store?._id || product.store}`}
                      className="marketplace-product-store mt-4 pt-3 border-t border-slate-50 flex items-center justify-between group/store hover:bg-slate-50/50 transition-colors -mx-4 px-4"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-lg bg-slate-50 overflow-hidden flex items-center justify-center shrink-0 group-hover/store:bg-primary-50 transition-colors border border-slate-100">
                          {product.store?.logo ? (
                            <img src={getImageUrl(product.store.logo)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                          ) : (
                            <MapPin className="h-2.5 w-2.5 text-primary-500" />
                          )}
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate group-hover/store:text-primary-600 transition-colors">
                          {product.store?.name} • {product.store?.contactInfo?.address?.city || 'Cavite'}
                        </span>
                      </div>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="marketplace-pagination flex justify-center items-center gap-3 mt-10">
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
