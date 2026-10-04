import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { serviceService, getImageUrl } from '../../services/apiService';
import { getCitiesByProvince } from '../../constants/locationConstants';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Clock, MapPin, Star, ChevronRight, Store, Navigation, Search } from 'lucide-react';
import { SERVICE_CATEGORIES, getCategoryLabel } from '../../constants/serviceCategories';

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

const Services = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    city: '',
    nearMe: false
  });
  const [userLocation, setUserLocation] = useState(null);

  const categories = [
    { id: 'all', label: 'All Services' },
    ...SERVICE_CATEGORIES
  ];

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchServices();
    }, 350);
    return () => clearTimeout(debounce);
  }, [selectedCategory, filters.city, searchTerm]);

  const fetchServices = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const params = {};
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (filters.city) params.city = filters.city;
      if (searchTerm) params.search = searchTerm;

      const response = await serviceService.getAllServices(params);
      setServices(response.data.services || []);
    } catch (error) {
      console.error('Error fetching services:', error);
      setLoadError(true);
      toast.error('We could not load the services. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredServices = () => {
    let result = [...services];

    // Category Filter
    if (selectedCategory !== 'all') {
      result = result.filter(service => service.category === selectedCategory);
    }


    // GPS "Near Me" Sort/Filter
    if (filters.nearMe && userLocation) {
      result = result
        .map(service => {
          const storeLat = service.store?.contactInfo?.address?.coordinates?.lat;
          const storeLng = service.store?.contactInfo?.address?.coordinates?.lng;

          let distance = Infinity;
          if (storeLat && storeLng) {
            distance = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              storeLat,
              storeLng
            );
          }
          return { ...service, distance };
        })
        .filter(service => service.distance <= 5) // Enforce 5km radius
        .sort((a, b) => a.distance - b.distance);
    }

    // SECURITY: Professional Sellers should only see their own context.
    // If the user is a seller, we filter the marketplace to keep them focused on their business.
    if (user?.role === 'seller' || user?.role === 'store_owner') {
      const storeId = user.store?._id || user._id; // Depending on how store is linked
      result = result.filter(s => s.store?._id === storeId || s.store === storeId);
    }

    return result;
  };

  const filteredServices = getFilteredServices();

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    toast.info('Finding your location...');

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    };

    const success = (position) => {
      const loc = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      setUserLocation(loc);
      setFilters(prev => ({ ...prev, nearMe: true, city: '' }));
      setLoading(false);
      toast.success('Location found! Showing nearby services.');
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

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
  };

  const handleBookService = (serviceId) => {
    navigate(`/services/${serviceId}`);
  };

  if (loading) {
    return (
      <div className="responsive-card-grid mx-auto max-w-[1440px] [--card-min:16rem] [--card-gap:1.125rem] lg:[--card-gap:1.25rem]" aria-label="Loading services">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(item => (
          <div key={item} className="animate-pulse overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800" />
            <div className="p-4">
              <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-3 h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-6 h-10 rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Calendar className="mx-auto h-8 w-8 text-primary-600" />
        <h2 className="mt-3 text-lg font-black text-slate-900 dark:text-white">Unable to load services</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Please check your connection and try again.</p>
        <button type="button" onClick={fetchServices} className="mt-4 min-h-11 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/20">Try Again</button>
      </div>
    );
  }

  return (
    <div className="customer-marketplace-page marketplace-services mx-auto w-full max-w-[1440px] min-w-0 space-y-6 animate-fade-in pb-16 lg:space-y-7">
      {/* Decorative environment */}
      <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden opacity-40">
        <div className="absolute top-20 right-[-10%] w-[500px] h-[500px] bg-primary-50 rounded-full blur-[120px] blob-animation" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-secondary-50 rounded-full blur-[100px] blob-animation" style={{ animationDelay: '-2s' }} />
      </div>

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1.5 text-left">
          <h1 className="text-[1.875rem] font-black leading-tight tracking-tight text-slate-900 dark:text-white lg:text-[2.125rem]">Professional Services</h1>
          <p className="text-[15px] font-medium leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">World-class care for your beloved family members</p>
        </div>
        {isAuthenticated && (
          <Link
            to="/bookings"
            className="group flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Calendar className="h-4 w-4 text-primary-600" />
            My Bookings
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* Search Bar */}
        <div className="relative w-full sm:max-w-[28rem]">
          <label htmlFor="service-search" className="sr-only">Search services</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="service-search"
            type="text"
            placeholder="Search services..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-[15px] font-medium text-slate-700 shadow-sm transition-colors placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {/* Category filters wrap at their natural width. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Service categories">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryChange(category.id)}
                aria-pressed={selectedCategory === category.id}
                className={`min-h-10 shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/20 sm:px-5 ${selectedCategory === category.id
                  ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          {/* Location Filters */}
          <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(14rem,18rem)_auto] xl:w-auto xl:flex-none">
            {/* City Selector */}
            <div className="relative w-full min-w-0 sm:min-w-[14rem]">
              <label htmlFor="service-region" className="sr-only">Filter services by region</label>
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-500" />
              <select
                id="service-region"
                value={filters.city}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, city: e.target.value, nearMe: false }));
                }}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm font-semibold text-slate-700 shadow-sm outline-none transition-colors focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">All Regions</option>
                {CAVITE_CITIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Near Me Button */}
            <button
              type="button"
              aria-pressed={filters.nearMe}
              onClick={() => {
                if (filters.nearMe) {
                  setFilters(prev => ({ ...prev, nearMe: false }));
                } else {
                  handleNearMe();
                }
              }}
              className={`flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/20 sm:w-auto ${filters.nearMe
                ? 'border-secondary-600 bg-secondary-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
            >
              <Navigation className={`h-4 w-4 ${filters.nearMe ? 'animate-pulse' : ''}`} />
              {filters.nearMe ? 'GPS Active' : 'Near Me'}
            </button>
          </div>
        </div>
      </div>

      {/* Services Grid with Premium Cards */}
      <div className="responsive-card-grid [--card-min:16rem] [--card-gap:1.125rem] lg:[--card-gap:1.25rem]">
        {filteredServices.map((service) => (
          <article
            key={service._id}
            className="group flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
            aria-labelledby={`service-title-${service._id}`}
          >
            {/* Consistent media area keeps cards aligned across source image sizes. */}
            <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-primary-50 dark:bg-slate-800">
              {service.images?.[0] ? (
                <img src={getImageUrl(service.images[0])} alt={service.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-slate-800 dark:to-slate-900">
                  <Calendar className="h-10 w-10 text-primary-300 dark:text-primary-500" aria-hidden="true" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
              <span className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-full bg-primary-600/95 px-2.5 py-1 text-[11px] font-bold leading-tight text-white backdrop-blur-sm">
                {getCategoryLabel(service.category)}
              </span>
            </div>

            <div className="flex flex-1 flex-col p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex max-w-full rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold leading-tight text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {service.subCategory}
                  </span>
                  <h3 id={`service-title-${service._id}`} className="mt-2 min-h-[2.75rem] text-lg font-bold leading-snug text-slate-900 line-clamp-2 break-words transition-colors group-hover:text-primary-600 dark:text-white">
                    {service.name}
                  </h3>
                </div>
                {service.ratings && service.ratings.count > 0 && (
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-secondary-50 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <Star className="h-3.5 w-3.5 fill-secondary-400 text-secondary-400" />
                    <span>{service.ratings.average.toFixed(1)}</span>
                    <span className="sr-only">from {service.ratings.count} reviews</span>
                  </div>
                )}
              </div>

              <p className="mt-2 text-xl font-black tracking-tight text-primary-600">₱{service.price}</p>

              <p className="mt-2 min-h-[2.5rem] text-sm leading-5 text-slate-500 line-clamp-2 dark:text-slate-400">
                {service.description || 'Expertly delivered service focused on the health and comfort of your pet.'}
              </p>

              {/* Bottom Fixed Section - Unified for perfect alignment */}
              <div className="mt-auto space-y-3 pt-4">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 border-y border-slate-100 py-2.5 transition-colors group-hover:border-primary-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-primary-500" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{service.duration} min</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-secondary-500" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {service.homeServiceAvailable ? 'Home' : 'Store'}
                    </span>
                  </div>
                </div>

                {/* Store Identifier - Fixed at Bottom */}
                {service.store && (
                  <Link
                    to={`/stores/${service.store?._id || service.store}`}
                    className="flex min-h-12 items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-2 transition-colors hover:border-primary-100 hover:bg-primary-50 dark:border-slate-800 dark:bg-slate-800/70 dark:hover:bg-slate-800"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      {service.store.logo ? (
                        <img src={getImageUrl(service.store.logo)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Store className="h-4 w-4 text-primary-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-bold leading-tight text-slate-900 dark:text-white">
                        {service.store.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <MapPin className="h-3 w-3 shrink-0 text-primary-400" />
                        <span className="truncate">
                          {service.store.contactInfo?.address?.city || 'Cavite'}
                        </span>
                      </div>
                    </div>
                  </Link>
                )}

                {/* Enhanced Footer Button */}
                <button
                  type="button"
                  onClick={() => handleBookService(service._id)}
                  aria-label={`View ${service.name}`}
                  className="btn btn-primary min-h-11 w-full py-2.5 text-sm font-bold shadow-sm"
                >
                  View Service
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {filteredServices.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-12 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Calendar className="h-7 w-7 text-slate-300 dark:text-slate-500" />
          </div>
          <div className="text-center px-6">
            <h3 className="text-xl font-black text-slate-800 dark:text-white">Available Soon</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">We're expanding our service network. Please check back later or try another category.</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className="btn btn-outline min-h-11 border-slate-300"
          >
            Show all available services
          </button>
        </div>
      )}
    </div>
  );
};

export default Services;
