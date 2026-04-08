import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { serviceService, getImageUrl } from '../../services/apiService';
import { getCitiesByProvince } from '../../constants/locationConstants';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Clock, DollarSign, MapPin, Users, Star, ChevronRight, Store, Filter, Navigation, Search } from 'lucide-react';
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
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
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
      const params = {};
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (filters.city) params.city = filters.city;
      if (searchTerm) params.search = searchTerm;

      const response = await serviceService.getAllServices(params);
      setServices(response.data.services || []);
    } catch (error) {
      console.error('Error fetching services:', error);
      toast.error('Failed to load services');
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

    return result;
  };

  const filteredServices = getFilteredServices();

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    toast.info('Acquiring location...');

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
      toast.success('Location acquired! Sorting nearest services.');
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
    if (!isAuthenticated) {
      toast.error('Please log in to book services');
      return;
    }
    // This will navigate to booking page with pre-selected service
    navigate(`/bookings?service=${serviceId}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Decorative environment */}
      <div className="fixed inset-0 z-[-1] pointer-events-none opacity-40">
        <div className="absolute top-20 right-[-10%] w-[500px] h-[500px] bg-primary-50 rounded-full blur-[120px] blob-animation" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-secondary-50 rounded-full blur-[100px] blob-animation" style={{ animationDelay: '-2s' }} />
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center sm:items-end gap-4 md:gap-6 text-center sm:text-left">
        <div className="space-y-1">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Professional Services</h1>
          <p className="text-base md:text-lg text-slate-500 font-medium tracking-tight">World-class care for your beloved family members</p>
        </div>
        {isAuthenticated && (
          <Link
            to="/bookings"
            className="group px-6 py-3 bg-white border border-slate-100 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <Calendar className="h-4 w-4 text-primary-600" />
            My Bookings
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* Search Bar */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search services..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-400 shadow-sm transition-all"
          />
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-center">
          {/* Modern Horizontal Filter Scrolling */}
          <div className="flex-1 flex items-center gap-3 overflow-x-auto pb-4 scrollbar-hide w-full">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategoryChange(category.id)}
                className={`px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap shadow-sm border ${selectedCategory === category.id
                  ? 'bg-primary-600 text-white border-primary-600 shadow-lg shadow-primary-100'
                  : 'bg-white text-slate-500 border-slate-100 hover:border-primary-300'
                  }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          {/* Location Filters */}
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            {/* City Selector */}
            <div className="relative w-full md:w-48">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-500" />
              <select
                value={filters.city}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, city: e.target.value, nearMe: false }));
                }}
                className="w-full !pl-20 !pr-12 py-3 bg-white border border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-700 outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all shadow-sm"
              >
                <option value="">All Regions</option>
                {CAVITE_CITIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Near Me Button */}
            <button
              onClick={() => {
                if (filters.nearMe) {
                  setFilters(prev => ({ ...prev, nearMe: false }));
                } else {
                  handleNearMe();
                }
              }}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-sm border w-full md:w-auto justify-center ${filters.nearMe
                ? 'bg-secondary-600 text-white border-secondary-600 shadow-lg shadow-secondary-200'
                : 'bg-white text-slate-500 border-slate-100 hover:border-primary-300'
                }`}
            >
              <Navigation className={`h-4 w-4 ${filters.nearMe ? 'animate-pulse' : ''}`} />
              {filters.nearMe ? 'GPS Active' : 'Near Me'}
            </button>
          </div>
        </div>
      </div>

      {/* Services Grid with Premium Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-8">
        {filteredServices.map((service, idx) => (
          <div
            key={service._id}
            className="card group p-0 flex flex-col h-full hover:shadow-2xl hover:shadow-primary-200/50 transition-all duration-500 animate-slide-up"
            style={{ animationDelay: `${idx * 0.1}s` }}
          >
            {/* Top accent bar or Image */}
            {service.images?.[0] ? (
              <div className="h-32 sm:h-48 w-full relative overflow-hidden shrink-0">
                <img src={getImageUrl(service.images[0])} alt={service.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <span className="absolute bottom-3 left-4 text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-white bg-primary-600/90 px-3 py-1 rounded-full backdrop-blur-md">
                  {getCategoryLabel(service.category)}
                </span>
              </div>
            ) : (
              <div className="h-1.5 sm:h-2 w-full shrink-0 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-t-xl sm:rounded-t-[23px] opacity-70 group-hover:opacity-100 transition-all duration-500" />
            )}

            <div className="p-3 sm:p-5 flex flex-col flex-1 space-y-2 sm:space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5 w-full min-w-0">
                  {!service.images?.[0] && (
                    <span className="text-[7px] sm:text-[9px] font-black uppercase tracking-[0.1em] text-primary-500">
                      {getCategoryLabel(service.category)}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 mb-1">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[6px] sm:text-[8px] font-black rounded uppercase tracking-widest">
                      {service.subCategory}
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-lg font-black text-slate-900 leading-tight group-hover:text-primary-600 transition-colors truncate min-h-[1rem] sm:min-h-[2.5rem]">
                    {service.name}
                  </h3>
                  {service.ratings && service.ratings.count > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      <Star className="w-2.5 h-2.5 text-secondary-400 fill-secondary-400" />
                      <span className="text-[9px] font-bold text-slate-600">
                        {service.ratings.average.toFixed(1)} <span className="text-slate-400 font-normal">({service.ratings.count})</span>
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end shrink-0 pl-2">
                  <span className="text-xs sm:text-lg font-black text-primary-600 tracking-tighter">₱{service.price}</span>
                </div>
              </div>

              <p className="text-[10px] sm:text-xs text-slate-500 italic leading-relaxed line-clamp-2 hidden sm:block min-h-[2rem]">
                "{service.description || 'Expertly delivered service focused on the health and comfort of your pet.'}"
              </p>

              {/* Bottom Fixed Section - Unified for perfect alignment */}
              <div className="mt-auto pt-3 sm:pt-4 space-y-3 sm:space-y-4">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 py-2 border-y border-slate-50 group-hover:border-primary-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-50 group-hover:bg-primary-50 flex items-center justify-center transition-colors">
                      <Clock className="h-3 w-3 text-primary-500" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 italic">{service.duration}m</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-50 group-hover:bg-secondary-50 flex items-center justify-center transition-colors">
                      <MapPin className="h-3 w-3 text-secondary-500" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 italic uppercase">
                      {service.homeServiceAvailable ? 'Home' : 'Store'}
                    </span>
                  </div>
                </div>

                {/* Store Identifier - Fixed at Bottom */}
                {service.store && (
                  <Link
                    to={`/stores/${service.store._id}`}
                    className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-primary-50 group-hover:border-primary-100 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white overflow-hidden flex items-center justify-center shadow-sm shrink-0 border border-slate-100">
                      {service.store.logo ? (
                        <img src={getImageUrl(service.store.logo)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Store className="h-4 w-4 text-primary-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-black text-slate-900 uppercase truncate leading-tight">
                        {service.store.name}
                      </p>
                      <div className="text-[8px] font-bold text-slate-400 uppercase flex items-center gap-1.5 group/addr">
                        <MapPin className="h-2 w-2 text-primary-400 group-hover/addr:text-primary-600 transition-colors" />
                        <span className="truncate">
                          {service.store.contactInfo?.address?.city || 'Cavite'}
                        </span>
                      </div>
                    </div>
                  </Link>
                )}

                {/* Enhanced Footer Button */}
                <button
                  onClick={() => handleBookService(service._id)}
                  className="btn btn-primary w-full py-2.5 sm:py-3 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary-100 group/btn"
                >
                  Book now
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredServices.length === 0 && !loading && (
        <div className="card bg-slate-50/50 border-dashed border-2 py-20 flex flex-col items-center justify-center space-y-4">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
            <Calendar className="h-10 w-10 text-slate-300" />
          </div>
          <div className="text-center px-6">
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tight">Available Soon</h3>
            <p className="text-xs sm:text-base text-slate-500 max-w-xs mx-auto font-medium">We're expanding our service network. Please check back later or try another category.</p>
          </div>
          <button
            onClick={() => setSelectedCategory('all')}
            className="btn btn-outline border-slate-300"
          >
            Show all available services
          </button>
        </div>
      )}
    </div>
  );
};

export default Services;
