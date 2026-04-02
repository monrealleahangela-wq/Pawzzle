import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { petService, productService, serviceService, storeService, getImageUrl } from '../../services/apiService';
import {
  Search as SearchIcon,
  Package,
  Heart,
  Scissors,
  Clock,
  Filter,
  X,
  MapPin,
  Navigation,
  Store as StoreIcon,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getCitiesByProvince } from '../../constants/locationConstants';

const CAVITE_CITIES = getCitiesByProvince('cavite');

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
};

// Helper to normalize strings (handle ñ, accents, and casing)
const normalizeString = (str) => {
  if (!str) return '';
  return str.toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const Search = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(query);
  const [activeTab, setActiveTab] = useState('all');
  const [results, setResults] = useState({
    pets: [],
    products: [],
    services: [],
    stores: []
  });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    priceRange: '',
    sortBy: 'relevance',
    city: '',
    nearMe: false
  });
  const [userLocation, setUserLocation] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';
    const city = searchParams.get('city') || '';
    const nearMe = searchParams.get('nearMe') === 'true';

    if (q) {
      setSearchQuery(q);
      setFilters(prev => ({
        ...prev,
        category,
        city,
        nearMe
      }));
      performSearch(q);
    }
  }, [searchParams]);

  const performSearch = async (searchTerm, cityOverride = null) => {
    if (!searchTerm.trim()) {
      setResults({ pets: [], products: [], services: [], stores: [] });
      return;
    }

    setLoading(true);
    try {
      const params = { search: searchTerm, limit: 50 };
      const targetCity = cityOverride !== null ? cityOverride : filters.city;
      if (targetCity) params.city = targetCity;

      const [petsResponse, productsResponse, servicesResponse, storesResponse] = await Promise.all([
        petService.getAllPets(params),
        productService.getAllProducts(params),
        serviceService.getAllServices(params),
        storeService.getAllStores(params)
      ]);

      setResults({
        pets: petsResponse.data.pets || [],
        products: productsResponse.data.products || [],
        services: servicesResponse.data.services || [],
        stores: storesResponse.data.stores || storesResponse.data || []
      });
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Failed to perform search');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      performSearch(searchQuery.trim());
    }
  };

  const handleFilterChange = (name, value) => {
    if (name === 'nearMe' && value === true) {
      handleNearMe();
    } else {
      setFilters(prev => {
        const newFilters = { ...prev, [name]: value };
        if (name === 'city') {
          performSearch(searchQuery, value);
        }
        return newFilters;
      });
    }
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
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
      toast.success('Location acquired! Sorting by distance.');
    };

    const error = (err) => {
      console.error('Geolocation error:', err);
      
      // Fallback to low accuracy if high accuracy fails/times out
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

  const getFilteredResults = () => {
    let filtered = { ...results };

    const applyLocationFilter = (items, isStore = false) => {
      let result = [...items];

      // Filter/Sort by Near Me (GPS)
      if (filters.nearMe && userLocation) {
        result = result
          .map(item => {
            const store = isStore ? item : item.store;
            const storeLat = store?.contactInfo?.address?.coordinates?.lat;
            const storeLng = store?.contactInfo?.address?.coordinates?.lng;

            const distance = (storeLat && storeLng) ? calculateDistance(
              userLocation.lat,
              userLocation.lng,
              storeLat,
              storeLng
            ) : Infinity;

            return { ...item, distance };
          })
          .filter(item => item.distance <= 5) // Enforce 5km radius
          .sort((a, b) => a.distance - b.distance);
      }

      return result;
    };

    // Apply location filters to all types
    filtered.pets = applyLocationFilter(results.pets || []);
    filtered.products = applyLocationFilter(results.products || []);
    filtered.services = applyLocationFilter(results.services || []);
    filtered.stores = applyLocationFilter(results.stores || [], true);

    // Apply category filter
    if (filters.category) {
      filtered.pets = filtered.pets.filter(pet => pet.category === filters.category);
      filtered.products = filtered.products.filter(product => product.category === filters.category);
      filtered.services = filtered.services.filter(service => service.category === filters.category);
    }

    // Apply price filter
    if (filters.priceRange) {
      const [min, max] = filters.priceRange.split('-').map(Number);
      filtered.products = filtered.products.filter(product => {
        const price = product.price || 0;
        return price >= min && price <= max;
      });
      filtered.services = filtered.services.filter(service => {
        const price = service.price || 0;
        return price >= min && price <= max;
      });
    }

    return filtered;
  };

  const filteredResults = getFilteredResults();
  const totalResults = filteredResults.pets.length + filteredResults.products.length + filteredResults.services.length + filteredResults.stores.length;

  const renderPetCard = (pet) => (
    <div 
      key={pet._id} 
      onClick={() => navigate(`/pets/${pet._id}`)}
      className="block group animate-slide-up cursor-pointer"
    >
      <div className="bg-white rounded-[32px] shadow-sm hover:shadow-2xl hover:shadow-primary-200/50 transition-all duration-500 overflow-hidden border border-slate-100 group-hover:border-primary-100 h-full flex flex-col">
        <div className="h-48 bg-slate-50 flex items-center justify-center relative overflow-hidden">
          {pet.images && pet.images.length > 0 ? (
            <img src={pet.images[0]} alt={pet.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
          ) : (
            <Heart className="h-12 w-12 text-slate-200" />
          )}
          <div className="absolute top-3 right-3">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg glass-morphism ${pet.isAvailable ? 'text-secondary-700' : 'text-primary-700'
              }`}>
              {pet.isAvailable ? 'Available' : 'Reserved'}
            </span>
          </div>
        </div>
        <div className="p-5 flex-1 flex flex-col">
          <h3 className="font-black text-slate-900 group-hover:text-primary-600 transition-colors uppercase tracking-tight truncate">{pet.name}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{pet.breed}</p>

          <div 
            onClick={(e) => { e.stopPropagation(); navigate(`/stores/${pet.store?._id}`); }}
            className="flex items-center gap-2 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100 hover:bg-primary-50 hover:border-primary-100 transition-colors cursor-pointer group/store"
          >
            <div className="w-8 h-8 rounded-lg bg-white overflow-hidden flex items-center justify-center shadow-sm shrink-0 group-hover/store:bg-primary-50 border border-slate-100">
              {pet.store?.logo ? (
                <img src={getImageUrl(pet.store.logo)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <StoreIcon className="h-4 w-4 text-primary-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-slate-900 uppercase truncate group-hover/store:text-primary-600 transition-colors">
                {pet.store?.name || 'Local Breeder'}
              </p>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary-400" />
                <p className="text-[8px] font-bold text-slate-500 uppercase truncate">
                  {pet.store?.contactInfo?.address?.city || 'Cavite'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto flex justify-between items-center pt-3 border-t border-slate-50 group-hover:border-primary-50">
            <div>
              <span className="text-lg font-black text-primary-600 block">₱{pet.price?.toLocaleString()}</span>
              {pet.distance && (
                <div className="mt-1 text-[8px] font-black text-secondary-600 uppercase tracking-widest flex items-center gap-1">
                  <Navigation className="h-2.5 w-2.5" />
                  {pet.distance.toFixed(1)} km away
                </div>
              )}
            </div>
            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 opacity-0 group-hover:opacity-100 transition-all">
              <Heart className="h-4 w-4 fill-current" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProductCard = (product) => (
    <div 
      key={product._id} 
      onClick={() => navigate(`/products/${product._id}`)}
      className="block group animate-slide-up cursor-pointer"
    >
      <div className="bg-white rounded-2xl sm:rounded-[32px] shadow-sm hover:shadow-2xl hover:shadow-primary-200/50 transition-all duration-500 overflow-hidden border border-slate-100 group-hover:border-primary-100 h-full flex flex-col">
        <div className="h-32 sm:h-48 bg-slate-50 flex items-center justify-center relative overflow-hidden shrink-0">
          {product.images && product.images.length > 0 ? (
            <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
          ) : (
            <Package className="h-8 sm:h-12 w-8 sm:w-12 text-slate-200" />
          )}
          <div className="absolute top-2 sm:top-3 right-2 sm:right-3 text-[7px] sm:text-[9px] font-black uppercase tracking-widest px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg glass-morphism text-primary-700">
            {product.category}
          </div>
        </div>
        <div className="p-3 sm:p-5 flex-1 flex flex-col">
          <h3 className="text-xs sm:text-base font-black text-slate-900 group-hover:text-primary-600 transition-colors uppercase tracking-tight truncate mb-1">{product.name}</h3>

          <div 
            onClick={(e) => { e.stopPropagation(); navigate(`/stores/${product.store?._id}`); }}
            className="hidden sm:flex items-center gap-2 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100 hover:bg-primary-50 hover:border-primary-100 transition-colors group/store"
          >
            <div className="w-8 h-8 rounded-lg bg-white overflow-hidden flex items-center justify-center shadow-sm shrink-0 group-hover/store:bg-primary-50 border border-slate-100">
              {product.store?.logo ? (
                <img src={getImageUrl(product.store.logo)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <StoreIcon className="h-4 w-4 text-primary-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-slate-900 uppercase truncate group-hover/store:text-primary-600 transition-colors">
                {product.store?.name || 'Local Store'}
              </p>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary-400" />
                <p className="text-[8px] font-bold text-slate-500 uppercase truncate">
                  {product.store?.contactInfo?.address?.city || 'Cavite'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto flex justify-between items-center pt-2 sm:pt-3 border-t border-slate-50 group-hover:border-primary-50">
            <span className="text-sm sm:text-lg font-black text-primary-600">₱{product.price?.toLocaleString()}</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-secondary-50 flex items-center justify-center text-secondary-600 sm:opacity-0 group-hover:opacity-100 transition-all">
              <Package className="h-3 w-3 sm:h-4 sm:w-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderServiceCard = (service) => (
    <div 
      key={service._id} 
      onClick={() => navigate(`/services/${service._id}`)}
      className="block group animate-slide-up cursor-pointer"
    >
      <div className="bg-white rounded-2xl sm:rounded-[32px] shadow-sm hover:shadow-2xl hover:shadow-primary-200/50 transition-all duration-500 overflow-hidden border border-slate-100 group-hover:border-primary-100 h-full flex flex-col">
        <div className="h-32 sm:h-48 bg-gradient-to-br from-primary-600 to-secondary-500 flex items-center justify-center relative overflow-hidden shrink-0">
          {service.images?.[0] ? (
            <img src={service.images[0]} alt={service.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
          ) : (
            <>
              <Scissors className="h-10 w-10 text-white/40 absolute -right-3 -bottom-3 rotate-12 scale-150" />
              <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-white/20 backdrop-blur-md rounded-xl sm:rounded-2xl flex items-center justify-center border border-white/30">
                <Scissors className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
            </>
          )}
        </div>
        <div className="p-3 sm:p-5 flex-1 flex flex-col">
          <h3 className="text-xs sm:text-base font-black text-slate-900 group-hover:text-primary-600 transition-colors uppercase tracking-tight truncate mb-1">{service.name}</h3>

          <div 
            onClick={(e) => { e.stopPropagation(); navigate(`/stores/${service.store?._id}`); }}
            className="hidden sm:flex items-center gap-2 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100 hover:bg-primary-50 hover:border-primary-100 transition-colors group/store"
          >
            <div className="w-8 h-8 rounded-lg bg-white overflow-hidden flex items-center justify-center shadow-sm shrink-0 group-hover/store:bg-primary-50 border border-slate-100">
              {service.store?.logo ? (
                <img src={getImageUrl(service.store.logo)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <StoreIcon className="h-4 w-4 text-primary-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-slate-900 uppercase truncate group-hover/store:text-primary-600 transition-colors">
                {service.store?.name || 'Local Store'}
              </p>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary-400" />
                <p className="text-[8px] font-bold text-slate-500 uppercase truncate">
                  {service.store?.contactInfo?.address?.city || 'Cavite'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto flex justify-between items-center pt-2 sm:pt-3 border-t border-slate-50 group-hover:border-primary-50">
            <span className="text-sm sm:text-lg font-black text-primary-600">₱{service.price?.toLocaleString()}</span>
            <div className="flex items-center gap-1 text-[8px] sm:text-[10px] font-black uppercase text-slate-400">
              <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {service.duration}m
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStoreCard = (store) => (
    <Link key={store._id} to={`/stores/${store._id}`} className="block group animate-slide-up">
      <div className="bg-white rounded-[32px] shadow-sm hover:shadow-2xl hover:shadow-primary-200/50 transition-all duration-500 overflow-hidden border border-slate-100 group-hover:border-primary-100">
        <div className="h-40 relative">
          {store.coverImage ? (
            <img src={store.coverImage} alt={store.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
          ) : (
            <div className="w-full h-full bg-slate-100 flex items-center justify-center">
              <StoreIcon className="h-12 w-12 text-slate-200" />
            </div>
          )}
          <div className="absolute -bottom-6 left-6 w-16 h-16 bg-white rounded-2xl p-1 shadow-xl ring-4 ring-white/50">
            {store.logo ? (
              <img src={store.logo} alt="Logo" className="w-full h-full rounded-xl object-cover" />
            ) : (
              <div className="w-full h-full bg-slate-50 rounded-xl flex items-center justify-center text-slate-300">
                <StoreIcon className="h-8 w-8" />
              </div>
            )}
          </div>
        </div>
        <div className="p-5 pt-10">
          <h3 className="font-black text-slate-900 group-hover:text-primary-600 transition-colors uppercase tracking-tight truncate">{store.name}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-primary-400" />
            {store.contactInfo?.address?.city || 'Cavite'}
          </p>

          <p className="text-xs text-slate-500 line-clamp-2 italic leading-relaxed mb-4">
            "{store.description || 'Verified partner store in the Cavite Pet Network.'}"
          </p>

          <div className="flex justify-between items-center pt-3 border-t border-slate-50 group-hover:border-primary-50">
            <span className="text-[10px] font-black text-primary-600 uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-1">
              Visit Store <ChevronRight className="h-3 w-3" />
            </span>
            {store.distance !== undefined && (
              <div className="text-[8px] font-black text-secondary-600 uppercase tracking-widest flex items-center gap-1">
                <Navigation className="h-2.5 w-2.5" />
                {store.distance.toFixed(1)} km away
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="max-w-7xl mx-auto px-1 sm:px-8 py-4 sm:py-8">
      {/* Search Header - Compact */}
      <div className="mb-4 sm:mb-12">
        <h1 className="text-xl sm:text-5xl font-black text-slate-900 tracking-tighter mb-2 sm:mb-6 uppercase">Discovery Hub</h1>

        {/* Modern Search Bar - Tighter */}
        <form onSubmit={handleSearch} className="relative animate-fade-in">
          <div className="relative group">
            <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets..."
              className="w-full !pl-20 pr-20 py-3 sm:py-5 bg-white border-2 border-slate-100 rounded-full sm:rounded-[28px] shadow-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-bold text-slate-700 text-sm sm:text-lg"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-slate-900 text-white px-4 py-1.5 rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-black transition-all active:scale-95"
            >
              Scan
            </button>
          </div>
        </form>
      </div>

      {/* Filters Toggle Group - Compact */}
      <div className="flex gap-2 mb-4 md:hidden">
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-white rounded-xl border border-slate-100 shadow-sm font-black text-[9px] uppercase tracking-widest text-slate-700 active:scale-95 transition-transform"
        >
          <Filter className="h-3.5 w-3.5 text-primary-600" />
          <span>Filters</span>
          {Object.values(filters).filter(Boolean).length > 0 && <span className="bg-primary-600 text-white px-1.5 py-0.5 rounded-full text-[7px]">{Object.values(filters).filter(Boolean).length}</span>}
        </button>
        <button
          onClick={() => handleNearMe()}
          className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all font-black text-[9px] uppercase tracking-widest active:scale-95 ${filters.nearMe ? 'bg-secondary-600 border-secondary-600 text-white' : 'bg-white border-slate-100 text-slate-600'}`}
        >
          <Navigation className={`h-3.5 w-3.5 ${filters.nearMe ? 'animate-pulse' : ''}`} />
          <span>Near Me</span>
        </button>
      </div>

      {/* Constraints Panel - Tighter */}
      <div className={`${showMobileFilters ? 'block' : 'hidden md:block'} mb-4 sm:mb-8 bg-white/80 backdrop-blur-md rounded-2xl sm:rounded-3xl shadow-xl shadow-slate-200/50 p-4 sm:p-8 border border-white animate-fade-in`}>
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary-600" />
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-xs sm:text-base">Constants</h3>
          </div>
          <button
            onClick={() => {
              setFilters({ category: '', priceRange: '', sortBy: 'relevance', city: '', nearMe: false });
              setShowMobileFilters(false);
            }}
            className="text-[8px] sm:text-[10px] font-black text-primary-600 uppercase tracking-widest hover:text-primary-700"
          >
            Reset All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-6">
          <div className="space-y-1">
            <label className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Class</label>
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              className="w-full p-2.5 bg-slate-50 border-none rounded-xl font-bold text-[10px] sm:text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Categories</option>
              {['dogs', 'cats', 'birds', 'food', 'toys', 'grooming', 'health'].map(cat => (
                <option key={cat} value={cat}>{cat.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sector</label>
            <select
              value={filters.city}
              onChange={(e) => {
                handleFilterChange('city', e.target.value);
                setFilters(prev => ({ ...prev, nearMe: false }));
              }}
              className="w-full !pr-10 p-2.5 bg-white border border-slate-100 rounded-xl font-bold text-[10px] sm:text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
            >
              <option value="">All Regions</option>
              {CAVITE_CITIES.map(c => (
                <option key={c.value} value={c.label}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 hidden md:block">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">GPS Radar</label>
            <button
              onClick={() => handleFilterChange('nearMe', !filters.nearMe)}
              className={`w-full py-2.5 rounded-xl flex items-center justify-center gap-2 border transition-all font-black text-[10px] uppercase tracking-widest ${filters.nearMe
                ? 'bg-secondary-600 border-secondary-600 text-white'
                : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100'
                }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              {filters.nearMe ? 'Radar On' : 'Near Me'}
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Capital Investment</label>
            <select
              value={filters.priceRange}
              onChange={(e) => handleFilterChange('priceRange', e.target.value)}
              className="w-full p-2.5 bg-slate-50 border-none rounded-xl font-bold text-[10px] sm:text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Ranges</option>
              <option value="0-500">Under ₱500</option>
              <option value="500-1000">₱500 - ₱1,000</option>
              <option value="1000-5000">₱1,000 - ₱5,000</option>
              <option value="5000-999999">Over ₱5,000</option>
            </select>
          </div>
        </div>

        {showMobileFilters && (
          <button
            onClick={() => setShowMobileFilters(false)}
            className="w-full mt-4 bg-slate-900 text-white py-3 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-transform"
          >
            Apply Filters
          </button>
        )}
      </div>

      {/* Results Tabs - High Density Capsule Style */}
      <div className="flex gap-1 sm:gap-2 mb-4 sm:mb-8 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
        {[
          { id: 'all', label: 'All', count: totalResults },
          { id: 'pets', label: 'Fleet', count: filteredResults.pets.length },
          { id: 'products', label: 'Gear', count: filteredResults.products.length },
          { id: 'services', label: 'Ops', count: filteredResults.services.length },
          { id: 'stores', label: 'Bases', count: filteredResults.stores.length }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-full font-black uppercase tracking-widest text-[8px] sm:text-[10px] transition-all flex items-center gap-2 ${activeTab === tab.id
              ? 'bg-slate-900 text-white shadow-lg'
              : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50'
              }`}
          >
            {tab.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[7px] ${activeTab === tab.id ? 'bg-primary-600' : 'bg-slate-100'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Loading Radar */}
      {loading && (
        <div className="flex flex-col justify-center items-center py-20 animate-fade-in">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-primary-50 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Scanning Grid...</p>
        </div>
      )}

      {/* Results */}
      {!loading && (
        <>
          {activeTab === 'all' && (
            <div className="space-y-4 sm:space-y-12">
              {filteredResults.pets.length > 0 && (
                <div>
                  <h2 className="text-xs sm:text-xl font-black text-slate-900 mb-2 sm:mb-4 uppercase tracking-tighter px-1">Fleet ({filteredResults.pets.length})</h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-6">
                    {filteredResults.pets.map((pet) => (
                      <Link key={pet._id} to={`/pets/${pet._id}`} className="group bg-white rounded-xl sm:rounded-[2rem] p-1.5 sm:p-4 border border-slate-100 shadow-sm transition-all hover:shadow-lg h-full flex flex-col">
                        <div className="aspect-[4/3] sm:h-48 bg-slate-50 relative overflow-hidden rounded-lg sm:rounded-[1.5rem] mb-2 sm:mb-4">
                          {pet.images?.[0] ? (
                            <img src={pet.images[0]} alt={pet.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-200"><Heart className="h-6 w-6" /></div>
                          )}
                          <div className="absolute top-1 right-1">
                            <span className="bg-black/60 backdrop-blur-md text-white text-[6px] sm:text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full">
                              Vetted
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[10px] sm:text-lg font-black text-slate-900 truncate uppercase mb-0.5">{pet.name}</h3>
                          <p className="text-[7px] sm:text-xs font-bold text-slate-400 uppercase tracking-tighter truncate leading-none mb-1">{pet.breed}</p>
                          <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
                            <p className="text-[10px] sm:text-xl font-black text-primary-600 tracking-tighter">₱{pet.price?.toLocaleString()}</p>
                            <div 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/stores/${pet.store?._id}`); }}
                              className="flex items-center gap-1 hover:text-primary-600 transition-colors cursor-pointer"
                            >
                              {pet.store?.logo && (
                                <img src={getImageUrl(pet.store.logo)} alt="" className="w-3 h-3 rounded-full object-cover shrink-0 border border-slate-100" />
                              )}
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[80px]">
                                {pet.store?.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {filteredResults.products.length > 0 && (
                <div>
                  <h2 className="text-xs sm:text-xl font-black text-slate-900 mb-2 sm:mb-4 uppercase tracking-tighter px-1">Gear ({filteredResults.products.length})</h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-6">
                    {filteredResults.products.map((product) => (
                      <Link key={product._id} to={`/products/${product._id}`} className="group bg-white rounded-xl sm:rounded-[2rem] p-1.5 sm:p-4 border border-slate-100 shadow-sm transition-all hover:shadow-lg h-full flex flex-col">
                        <div className="aspect-square bg-slate-50 relative overflow-hidden rounded-lg sm:rounded-[1.5rem] mb-2 sm:mb-4">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-200"><Package className="h-6 w-6" /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[10px] sm:text-lg font-black text-slate-900 truncate uppercase mb-0.5">{product.name}</h3>
                          <p className="text-[7px] sm:text-xs font-bold text-slate-400 uppercase tracking-tighter truncate leading-none mb-1">{product.category}</p>
                          <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
                            <p className="text-[10px] sm:text-xl font-black text-slate-900 tracking-tighter">₱{product.price?.toLocaleString()}</p>
                            <div 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/stores/${product.store?._id}`); }}
                              className="flex items-center gap-1 hover:text-primary-600 transition-colors cursor-pointer"
                            >
                              {product.store?.logo && (
                                <img src={getImageUrl(product.store.logo)} alt="" className="w-3 h-3 rounded-full object-cover shrink-0 border border-slate-100" />
                              )}
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[80px]">
                                {product.store?.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {filteredResults.services.length > 0 && (
                <div>
                  <h2 className="text-xs sm:text-xl font-black text-slate-900 mb-2 sm:mb-4 uppercase tracking-tighter px-1">Ops ({filteredResults.services.length})</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-6">
                    {filteredResults.services.map((service) => (
                      <Link key={service._id} to={`/bookings?service=${service._id}`} className="group flex items-center gap-3 sm:gap-6 bg-white rounded-xl sm:rounded-[2rem] p-2.5 sm:p-6 border border-slate-100 shadow-sm transition-all hover:shadow-lg">
                        <div className="w-12 h-12 sm:w-20 sm:h-20 bg-primary-50 rounded-lg sm:rounded-2xl flex items-center justify-center text-primary-600 shrink-0 overflow-hidden border border-slate-100">
                          {service.images?.[0] ? (
                            <img src={service.images[0]} alt={service.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <Scissors className="h-6 w-6 sm:h-10 sm:w-10" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[11px] sm:text-xl font-black text-slate-900 uppercase truncate leading-tight">{service.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[8px] sm:text-sm text-slate-400 font-bold uppercase tracking-widest leading-none">{service.duration} MIN</p>
                            <div 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/stores/${service.store?._id}`); }}
                              className="flex items-center gap-1 hover:text-primary-600 transition-colors cursor-pointer"
                            >
                              {service.store?.logo && (
                                <img src={getImageUrl(service.store.logo)} alt="" className="w-3 h-3 rounded-full object-cover shrink-0 border border-slate-100" />
                              )}
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[80px]">
                                {service.store?.name}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs sm:text-2xl font-black text-slate-900 tracking-tighter">₱{service.price?.toLocaleString()}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {filteredResults.stores.length > 0 && (
                <div>
                  <h2 className="text-xs sm:text-xl font-black text-slate-900 mb-2 sm:mb-4 uppercase tracking-tighter px-1">Bases ({filteredResults.stores.length})</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-6">
                    {filteredResults.stores.map((store) => (
                      <Link key={store._id} to={`/stores/${store._id}`} className="group bg-white rounded-xl sm:rounded-[2rem] p-2.5 sm:p-5 border border-slate-100 shadow-sm transition-all hover:shadow-lg flex items-center gap-4">
                        <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-lg sm:rounded-2xl overflow-hidden bg-slate-50 shrink-0 border border-slate-100">
                          {store.logo && <img src={store.logo} alt="Logo" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[11px] sm:text-xl font-black text-slate-900 uppercase truncate leading-tight">{store.name}</h4>
                          <div className="flex items-center gap-1 mt-1 text-[8px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest">
                            <MapPin className="h-2.5 w-2.5" />
                            <span className="truncate">{store.contactInfo?.address?.city}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'pets' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-6 px-1">
              {filteredResults.pets.map((pet) => (
                <Link key={pet._id} to={`/pets/${pet._id}`} className="group bg-white rounded-xl sm:rounded-[2rem] p-1.5 sm:p-4 border border-slate-100 shadow-sm transition-all hover:shadow-lg h-full flex flex-col">
                  <div className="aspect-[4/3] sm:h-48 bg-slate-50 relative overflow-hidden rounded-lg sm:rounded-[1.5rem] mb-2 sm:mb-4">
                    {pet.images?.[0] ? (
                      <img src={pet.images[0]} alt={pet.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-200"><Heart className="h-6 w-6" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[10px] sm:text-lg font-black text-slate-900 truncate uppercase mb-0.5">{pet.name}</h3>
                    <p className="text-[7px] sm:text-xs font-bold text-slate-400 uppercase tracking-tighter truncate leading-none mb-2">{pet.breed}</p>
                    <p className="text-[10px] sm:text-xl font-black text-primary-600 tracking-tighter">₱{pet.price?.toLocaleString()}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {activeTab === 'products' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-6 px-1">
              {filteredResults.products.map((product) => (
                <Link key={product._id} to={`/products/${product._id}`} className="group bg-white rounded-xl sm:rounded-[2rem] p-1.5 sm:p-4 border border-slate-100 shadow-sm transition-all hover:shadow-lg h-full flex flex-col">
                  <div className="aspect-square bg-slate-50 relative overflow-hidden rounded-lg sm:rounded-[1.5rem] mb-2 sm:mb-4">
                    {product.images?.[0] ? (
                      <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-200"><Package className="h-6 w-6" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[10px] sm:text-lg font-black text-slate-900 truncate uppercase mb-0.5">{product.name}</h3>
                    <p className="text-[7px] sm:text-xs font-bold text-slate-400 uppercase tracking-tighter truncate leading-none mb-2">{product.category}</p>
                    <p className="text-[10px] sm:text-xl font-black text-slate-900 tracking-tighter">₱{product.price?.toLocaleString()}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {activeTab === 'services' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-6 px-1">
              {filteredResults.services.map((service) => (
                <Link key={service._id} to={`/bookings?service=${service._id}`} className="group flex items-center gap-3 sm:gap-6 bg-white rounded-xl sm:rounded-[2rem] p-2.5 sm:p-6 border border-slate-100 shadow-sm transition-all hover:shadow-lg">
                  <div className="w-12 h-12 sm:w-20 sm:h-20 bg-primary-50 rounded-lg sm:rounded-2xl flex items-center justify-center text-primary-600 shrink-0 overflow-hidden border border-slate-100">
                    {service.images?.[0] ? (
                      <img src={service.images[0]} alt={service.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <Scissors className="h-6 w-6 sm:h-10 sm:w-10" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[11px] sm:text-xl font-black text-slate-900 uppercase truncate leading-tight">{service.name}</h4>
                    <p className="text-[8px] sm:text-sm text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">{service.duration} MIN</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs sm:text-2xl font-black text-slate-900 tracking-tighter">₱{service.price?.toLocaleString()}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {activeTab === 'stores' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-6 px-1">
              {filteredResults.stores.map((store) => (
                <Link key={store._id} to={`/stores/${store._id}`} className="group bg-white rounded-xl sm:rounded-[2rem] p-2.5 sm:p-5 border border-slate-100 shadow-sm transition-all hover:shadow-lg flex items-center gap-4">
                  <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-lg sm:rounded-2xl overflow-hidden bg-slate-50 shrink-0 border border-slate-100">
                    {store.logo && <img src={store.logo} alt="Logo" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[11px] sm:text-xl font-black text-slate-900 uppercase truncate leading-tight">{store.name}</h4>
                    <div className="flex items-center gap-1 mt-1 text-[8px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest">
                      <MapPin className="h-2.5 w-2.5" />
                      <span className="truncate">{store.contactInfo?.address?.city}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                </Link>
              ))}
            </div>
          )}

          {totalResults === 0 && !loading && query && (
            <div className="text-center py-20 bg-white/40 backdrop-blur-md rounded-[2rem] border border-white">
              <SearchIcon className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <h3 className="text-sm sm:text-xl font-black text-slate-900 uppercase tracking-tighter mb-1">Zero Matches</h3>
              <p className="text-[9px] sm:text-sm text-slate-400 uppercase tracking-widest font-bold">No assets found for "{query}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-transform"
              >
                Reset Grid
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Search;
