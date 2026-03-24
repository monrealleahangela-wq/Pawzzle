import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { petService, getImageUrl } from '../../services/apiService';
import { Heart, Filter, Search, Store, ArrowLeft, ArrowRight, ShoppingCart, Eye, MapPin, Navigation, Star } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { getCitiesByProvince } from '../../constants/locationConstants';

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


const Pets = () => {
  const { user } = useAuth();
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    species: '',
    breed: '',
    size: '',
    gender: '',
    minAge: '',
    maxAge: '',
    minPrice: '',
    maxPrice: '',
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
    fetchPets();
  }, [filters.species, filters.breed, filters.size, filters.gender, filters.minAge, filters.maxAge, filters.minPrice, filters.maxPrice, filters.city, pagination.currentPage]);

  const fetchPets = async () => {
    try {
      setLoading(true);
      const params = {
        ...filters,
        isAvailable: true,
        page: pagination.currentPage,
        limit: 12
      };

      // Clean up nearMe/city params since we might handle them differently
      delete params.nearMe;

      if (searchTerm) {
        params.breed = searchTerm;
      }

      const response = await petService.getAllPets(params);
      let fetchedPets = response.data.pets || [];


      if (filters.nearMe && userLocation) {
        fetchedPets = fetchedPets
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

      setPets(fetchedPets);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      console.error('Error fetching pets:', error);
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setFilters(prev => ({ ...prev, nearMe: true, city: '' }));
        setLoading(false);
        toast.success('Location acquired! Sorting nearest companions.');
      },
      (error) => {
        setLoading(false);
        toast.error('Could not get your location');
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchPets();
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };


  if (loading && pets.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-10 animate-fade-in pb-20 px-1 sm:px-0">
      {/* Decorative background element */}
      <div className="fixed inset-0 z-[-1] pointer-events-none opacity-30">
        <div className="absolute top-20 right-[-10%] w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] bg-primary-100 rounded-full blur-[100px] blob-animation" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] bg-secondary-100 rounded-full blur-[80px] blob-animation" style={{ animationDelay: '-2s' }} />
      </div>

      {/* Header & Search */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 sm:gap-6 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="space-y-0.5">
            <h1 className="text-xl sm:text-5xl font-black text-slate-900 tracking-tight uppercase leading-tight">Available <span className="text-primary-600">Pets</span></h1>
            <p className="text-[10px] sm:text-lg text-slate-400 font-bold uppercase tracking-widest hidden sm:block">Find your new best friend today</p>
          </div>

          <form onSubmit={handleSearch} className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
            <div className="input-container md:w-80">
              <Search className="input-icon h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="SEARCH BREED..."
                className="input input-with-icon border-none rounded-xl text-[10px] sm:text-sm font-bold uppercase tracking-widest bg-slate-50 focus:ring-2 focus:ring-primary-500/20 transition-all font-sans"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button type="submit" className="bg-slate-900 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all whitespace-nowrap">
              SEARCH
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-10">
        {/* Modern Filters Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="lg:hidden w-full flex items-center justify-between px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-primary-600" />
              <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Filters {Object.values(filters).filter(Boolean).length > 0 && `(${Object.values(filters).filter(Boolean).length})`}</span>
            </div>
            <ArrowRight className={`h-3.5 w-3.5 transition-transform ${showMobileFilters ? 'rotate-90' : ''}`} />
          </button>

          <div className={`${showMobileFilters ? 'block' : 'hidden lg:block'} card sticky top-24 p-5 border-slate-100 bg-white shadow-xl animate-fade-in`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary-600" />
                <h3 className="font-black text-slate-900 text-[10px] uppercase tracking-widest">Filters</h3>
              </div>
              <button
                onClick={() => {
                  setFilters({
                    species: '', breed: '', size: '', gender: '',
                    minAge: '', maxAge: '', minPrice: '', maxPrice: '',
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
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Location</label>
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
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Species</label>
                <select
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-tight border-none"
                  value={filters.species}
                  onChange={(e) => handleFilterChange('species', e.target.value)}
                >
                  <option value="">All Species</option>
                  <option value="dog">Canine</option>
                  <option value="cat">Feline</option>
                  <option value="bird">Avian</option>
                  <option value="fish">Aquatic</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Size</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['small', 'medium', 'large'].map(s => (
                    <button
                      key={s}
                      onClick={() => handleFilterChange('size', filters.size === s ? '' : s)}
                      className={`py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${filters.size === s
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'bg-slate-50 text-slate-500'
                        }`}
                    >
                      {s[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Price</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="MIN"
                    className="w-full px-2 py-2 bg-slate-50 rounded-lg text-[9px] font-black border-none"
                    value={filters.minPrice}
                    onChange={(e) => handleFilterChange('minPrice', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="MAX"
                    className="w-full px-2 py-2 bg-slate-50 rounded-lg text-[9px] font-black border-none"
                    value={filters.maxPrice}
                    onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
                  />
                </div>
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

        {/* Dynamic Pet Grid */}
        <main className="flex-1">
          {pets.length === 0 ? (
            <div className="card border-dashed border-2 bg-slate-50/50 flex flex-col items-center justify-center py-12 text-center">
              <Heart className="h-8 w-8 text-slate-300 mb-3" />
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">No Pets Found</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1 mb-4">No pets match your current filters</p>
              <button
                onClick={() => setFilters({
                  species: '', breed: '', size: '', gender: '',
                  minAge: '', maxAge: '', minPrice: '', maxPrice: ''
                })}
                className="text-[10px] font-black text-primary-600 uppercase tracking-widest underline"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[450px]:grid-cols-2 xl:grid-cols-3 gap-3">
              {pets.map((pet, idx) => (
                <div
                  key={pet._id}
                  className="group bg-white rounded-3xl border border-slate-100 p-2 flex flex-col transition-all hover:shadow-2xl hover:shadow-primary-100/10 relative overflow-hidden animate-slide-up"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-[3rem] -translate-y-12 translate-x-12 group-hover:bg-primary-50 transition-colors duration-500" />

                  <div className="h-32 sm:h-56 bg-slate-50 flex items-center justify-center relative overflow-hidden rounded-[2rem] z-10">
                    {pet.images && pet.images[0] ? (
                      <img
                        src={getImageUrl(pet.images[0])}
                        alt={pet.name}
                        onError={(e) => { e.target.onerror = null; e.target.src = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&h=400&fit=crop"; }}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    ) : (
                      <Heart className="h-8 w-8 text-slate-200" />
                    )}

                    <div className="absolute top-3 right-3 flex flex-col gap-1.5">
                      <span className={`px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-wider shadow-sm backdrop-blur-md border border-white/20 ${pet.status === 'available' ? 'bg-emerald-500/90 text-white' :
                        pet.status === 'reserved' ? 'bg-amber-500/90 text-white' :
                          'bg-rose-500/90 text-white'
                        }`}>
                        {pet.status?.toUpperCase() || (pet.isAvailable ? 'LIVE' : 'SYNC_OFF')}
                      </span>
                      <span className="px-2.5 py-1 bg-slate-900/90 backdrop-blur-md rounded-xl text-[8px] font-black uppercase tracking-widest text-white border border-white/10 shadow-sm">
                        VERIFIED
                      </span>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col relative z-10">
                    <div className="mb-3">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] leading-none mb-1.5 truncate">
                        {pet.breed || 'Biological Unit'}
                      </p>
                      <h3 className="text-[11px] sm:text-xl font-black text-slate-900 leading-tight uppercase truncate group-hover:text-primary-600 transition-colors">
                        {pet.name}
                      </h3>
                      {pet.ratings && pet.ratings.count > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className="text-[10px] font-bold text-slate-600">
                            {pet.ratings.average.toFixed(1)} <span className="text-slate-400 font-normal">({pet.ratings.count})</span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 mb-4">
                      <div className="px-2 py-1 bg-slate-50 rounded-lg flex items-center gap-1.5 border border-slate-100">
                        <div className="w-1 h-1 rounded-full bg-primary-500" />
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{pet.age} {pet.ageUnit[0]}</span>
                      </div>
                      <div className="px-2 py-1 bg-slate-50 rounded-lg flex items-center gap-1.5 border border-slate-100">
                        <div className="w-1 h-1 rounded-full bg-secondary-500" />
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{pet.gender[0]}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-auto gap-3">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest -mb-0.5">Price</span>
                        <span className="text-base sm:text-2xl font-black text-slate-900 tracking-tighter">₱{pet.price?.toLocaleString()}</span>
                      </div>

                      <Link
                        to={`/pets/${pet._id}`}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-lg shadow-slate-200 hover:bg-primary-600 transition-all active:scale-95 text-center"
                      >
                        Details
                      </Link>
                    </div>

                    {/* Store Node */}
                    <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                          <MapPin className="h-2.5 w-2.5 text-primary-500" />
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate">{pet.store?.name}</span>
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
    </div>
  );
};

export default Pets;
