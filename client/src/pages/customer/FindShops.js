import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  MapPin,
  Search,
  Navigation,
  Phone,
  Mail,
  ChevronRight,
  Clock,
  Store as StoreIcon,
  Info,
  Filter,
  X,
  Target,
  Navigation2,
  Flag,
  ArrowRight
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { storeService, getImageUrl } from '../../services/apiService';
import { toast } from 'react-toastify';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet default icon issues in React
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

// Custom Blue Marker for Selected Store
let ActiveIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [30, 46],
  iconAnchor: [15, 46],
  popupAnchor: [1, -34],
  className: 'filter hue-rotate-180' // Simple CSS filter to change color
});

L.Marker.prototype.options.icon = DefaultIcon;

// Cavite Municipalities and Cities
const CAVITE_MUNICIPALITIES = [
  'Dasmariñas', 'Imus', 'Bacoor', 'Tagaytay', 'Silang', 'General Trias',
  'Trece Martires', 'Kawit', 'Noveleta', 'Rosario', 'Cavite City',
  'Carmona', 'Gen. Mariano Alvarez', 'Tanza', 'Naic', 'Maragondon',
  'Ternate', 'Magallanes', 'Alfonso', 'Mendez', 'Indang', 'Amadeo', 'General Aguinaldo'
];

// Cavite Bounding Box (Roughly)
const CAVITE_BOUNDS = {
  minLat: 14.0,
  maxLat: 14.6,
  minLng: 120.5,
  maxLng: 121.2
};

const isWithinCavite = (lat, lng) => {
  return lat >= CAVITE_BOUNDS.minLat &&
    lat <= CAVITE_BOUNDS.maxLat &&
    lng >= CAVITE_BOUNDS.minLng &&
    lng <= CAVITE_BOUNDS.maxLng;
};

const normalizeString = (str) => {
  if (!str) return '';
  return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

// Component to handle map centering and movement
const MapController = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, map]);
  return null;
};

const FindShops = () => {
  const location = useLocation();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMunicipality, setSelectedMunicipality] = useState('All Cavite');
  const [selectedStore, setSelectedStore] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState([14.3121, 120.9326]); // Center of Cavite
  const [mapZoom, setMapZoom] = useState(11);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [directions, setDirections] = useState([]);
  const [eta, setEta] = useState(null);
  const [distance, setDistance] = useState(null);
  const [activeInstruction, setActiveInstruction] = useState(0);

  const searchParams = new URLSearchParams(useLocation().search);
  const shopIdFromQuery = searchParams.get('shop');

  // Handle shop from query params
  useEffect(() => {
    if (shopIdFromQuery && stores.length > 0) {
        const store = stores.find(s => s._id === shopIdFromQuery);
        if (store) {
            handleStoreSelect(store);
            // Auto start directions if shop is from query
            setTimeout(() => getDirections(store), 500);
        }
    }
  }, [shopIdFromQuery, stores]);

  const handleStoreSelect = (store) => {
    setSelectedStore(store);
    // Don't interrupt navigation if already active
    if (!isNavigating && store.contactInfo?.address?.coordinates?.lat) {
      setMapCenter([store.contactInfo.address.coordinates.lat, store.contactInfo.address.coordinates.lng]);
      setMapZoom(15);
    }
    // On mobile, close sidebar when selecting a store
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoading(true);
        const response = await storeService.getStoreLocations();
        const fetchedStores = response.data.stores || [];
        setStores(fetchedStores);

        // Check for ?store=ID in URL
        const queryParams = new URLSearchParams(location.search);
        const storeId = queryParams.get('store');
        if (storeId) {
          const targetStore = fetchedStores.find(s => s._id === storeId);
          if (targetStore) {
            handleStoreSelect(targetStore);
          }
        }
      } catch (error) {
        console.error('Error fetching store locations:', error);
        toast.error('Failed to load store GPS coordinates');
      } finally {
        setLoading(false);
      }
    };
    fetchStores();
  }, [location.search]);

  const filteredStores = useMemo(() => {
    return stores.filter(store => {
      const storeCity = normalizeString(store.contactInfo?.address?.city);
      const searchNorm = normalizeString(searchTerm);
      const muniNorm = normalizeString(selectedMunicipality);

      const matchesSearch = store.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        storeCity.includes(searchNorm) ||
        normalizeString(store.contactInfo?.address?.barangay).includes(searchNorm);

      const matchesMuni = selectedMunicipality === 'All Cavite' ||
        storeCity === muniNorm;

      return matchesSearch && matchesMuni;
    });
  }, [stores, searchTerm, selectedMunicipality]);

  useEffect(() => {
    let watchId;
    if (isNavigating && selectedStore) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(coords);
          
          // Re-fetch route periodically or based on distance
          const dest = selectedStore.contactInfo.address.coordinates;
          fetchRoute(coords, { lat: dest.lat, lng: dest.lng });
        },
        (error) => console.error('WatchPosition error:', error),
        { enableHighAccuracy: true, distanceFilter: 10 }
      );
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isNavigating, selectedStore]);

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(coords);
        setMapCenter([coords.lat, coords.lng]);
        setMapZoom(13);
        toast.success('Current location detected');
      },
      () => {
        toast.error('Could not get your location');
      }
    );
  };

  const fetchRoute = async (start, end) => {
    try {
      // Check if both points are in Cavite
      if (!isWithinCavite(start.lat, start.lng) || !isWithinCavite(end.lat, end.lng)) {
        toast.warning('Navigation is currently restricted to Cavite region only.');
        stopNavigation();
        return;
      }

      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`;
      const res = await axios.get(url);
      
      if (res.data.routes && res.data.routes[0]) {
        const route = res.data.routes[0];
        setRouteData(route.geometry.coordinates.map(c => [c[1], c[0]]));
        setEta(Math.ceil(route.duration / 60));
        setDistance((route.distance / 1000).toFixed(1));
        setDirections(route.legs[0].steps.map(s => ({
          instruction: s.maneuver.instruction,
          distance: s.distance,
          name: s.name
        })));
      }
    } catch (err) {
      console.error('Routing failed:', err);
      toast.error('Failed to calculate route');
    }
  };

  const getDirections = (store) => {
    if (!userLocation) {
        toast.info('Please enable your location to start navigation', {
            onClick: () => getUserLocation()
        });
        getUserLocation();
        return;
    }

    const { lat, lng } = store.contactInfo.address.coordinates;
    
    // Start Internal Navigation
    setIsNavigating(true);
    setIsSidebarOpen(false); // Close sidebar to see map
    setMapZoom(16);
    fetchRoute(userLocation, { lat, lng });
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setRouteData(null);
    setDirections([]);
    setEta(null);
    setDistance(null);
    setActiveInstruction(0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 border-4 border-primary-100 rounded-full animate-pulse"></div>
            <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
            <MapPin className="absolute inset-0 m-auto h-8 w-8 text-primary-600 animate-bounce" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Mapping Sector...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] sm:h-[calc(100vh-80px)] flex flex-col lg:flex-row relative overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Sidebar Overlay for Mobile */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden absolute bottom-24 left-1/2 -translate-x-1/2 z-[1001] bg-primary-600 text-white px-6 py-3 rounded-full shadow-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 animate-bounce"
        >
          <Filter className="h-4 w-4" /> View Shop List
        </button>
      )}

      {/* Sidebar List */}
      <aside className={`
        absolute lg:relative inset-y-0 left-0 w-full lg:w-[400px] bg-white dark:bg-slate-900 z-[1002] lg:z-10
        transition-transform duration-500 ease-in-out border-r border-slate-100 dark:border-slate-800 flex flex-col
        shadow-2xl lg:shadow-none
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="p-4 sm:p-6 space-y-4 border-b border-slate-50 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Shop GPS</h2>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 rounded-lg w-fit mt-1">
                <Target className="h-3 w-3 text-primary-600" />
                <span className="text-[8px] font-black uppercase tracking-widest text-primary-700 dark:text-primary-400">Cavite Operationalized</span>
              </div>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-xl"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-primary-600 transition-colors" />
              <input
                type="text"
                placeholder="Search shops or areas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary-500 transition-all text-slate-900 dark:text-white"
              />
            </div>

            {/* Municipality Filter */}
            <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto no-scrollbar py-1">
              <button
                onClick={() => setSelectedMunicipality('All Cavite')}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${selectedMunicipality === 'All Cavite'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-lg'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:border-slate-300'
                  }`}
              >
                All Regions
              </button>
              {CAVITE_MUNICIPALITIES.map(muni => (
                <button
                  key={muni}
                  onClick={() => setSelectedMunicipality(muni)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${selectedMunicipality === muni
                      ? 'bg-primary-600 text-white border-primary-600 shadow-lg'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:border-slate-300'
                    }`}
                >
                  {muni}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 no-scrollbar">
          {filteredStores.length > 0 ? (
            filteredStores.map(store => (
              <div
                key={store._id}
                onClick={() => handleStoreSelect(store)}
                className={`
                  group p-4 rounded-2xl border transition-all cursor-pointer h-full
                  ${selectedStore?._id === store._id
                    ? 'bg-primary-50 dark:bg-primary-900/10 border-primary-200 dark:border-primary-800 shadow-lg'
                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-primary-100 dark:hover:border-primary-900 shadow-sm'}
                `}
              >
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-800 shrink-0 border border-slate-100 dark:border-slate-700">
                    {store.logo ? (
                      <img src={getImageUrl(store.logo)} alt={store.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-200 dark:text-slate-700">
                        <StoreIcon className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase truncate tracking-tight">
                        {store.name}
                      </h4>
                      {store.verificationStatus === 'verified' && (
                        <div className="bg-primary-50 text-primary-600 p-0.5 rounded-full shrink-0">
                          <Target className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-1 uppercase tracking-tight truncate">
                      <MapPin className="h-3 w-3 text-primary-500" />
                      {store.contactInfo.address.city}, Cavite
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <span className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 text-[8px] font-black uppercase text-slate-400 tracking-widest rounded-md">
                        {store.businessType?.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedStore?._id === store._id && (
                  <div className="mt-4 pt-4 border-t border-primary-100 dark:border-primary-900 animate-slide-up space-y-3">
                    <div className="space-y-2">
                      <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase leading-relaxed">
                        {store.contactInfo.address.street}, {store.contactInfo.address.barangay}, {store.contactInfo.address.city}
                      </p>
                      <div className="flex items-center gap-4">
                        {store.contactInfo.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{store.contactInfo.phone}</span>
                          </div>
                        )}
                        {store.contactInfo.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{store.contactInfo.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => isNavigating ? stopNavigation() : getDirections(store)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isNavigating ? 'bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-600 hover:text-white' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:scale-105'}`}
                      >
                        {isNavigating ? (
                            <>
                                <X className="h-3 w-3" /> Stop Navigation
                            </>
                        ) : (
                            <>
                                <Navigation className="h-3 w-3" /> Get Directions
                            </>
                        )}
                      </button>
                      <Link
                        to={`/stores/${store._id}`}
                        className="p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary-600 rounded-xl transition-all"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-20 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-200 dark:text-slate-700">
                <StoreIcon className="h-8 w-8" />
              </div>
              <p className="text-xs font-black uppercase text-slate-400 tracking-widest italic">No shops deployed in this sector.</p>
              <button
                onClick={() => { setSearchTerm(''); setSelectedMunicipality('All Cavite'); }}
                className="text-[10px] font-black text-primary-600 uppercase tracking-widest hover:underline"
              >
                Reset Sensors
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Map Content */}
      <div className="flex-1 relative z-0">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          maxBounds={[[14.0, 120.5], [14.6, 121.2]]}
          minZoom={10}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {isNavigating && routeData && (
            <Polyline 
                positions={routeData} 
                color="#3b82f6" 
                weight={8} 
                opacity={0.8}
                lineJoin="round"
                lineCap="round"
            />
          )}

          {/* Controls Overlay */}
          <div className="absolute top-4 right-4 z-[999] space-y-2">
            <button
              onClick={getUserLocation}
              className="w-12 h-12 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
            >
              <Target className="h-6 w-6" />
            </button>
          </div>

          {/* Markers */}
          {filteredStores.map(store => {
            const coords = store.contactInfo?.address?.coordinates;
            if (!coords?.lat || !coords?.lng) return null;

            const isActive = selectedStore?._id === store._id;

            return (
              <Marker
                key={store._id}
                position={[coords.lat, coords.lng]}
                icon={isActive ? ActiveIcon : DefaultIcon}
                eventHandlers={{
                  click: () => handleStoreSelect(store)
                }}
              >
                <Popup className="pawzzle-popup">
                  <div className="p-1 space-y-2">
                    <img
                      src={getImageUrl(store.coverImage || store.logo)}
                      alt={store.name}
                      className="w-full h-24 object-cover rounded-lg mb-2"
                    />
                    <h4 className="font-black text-slate-900 uppercase text-xs m-0">{store.name}</h4>
                    <p className="text-[10px] font-bold text-slate-500 m-0 uppercase tracking-tight">
                      {store.contactInfo.address.city}, Cavite
                    </p>
                    <button
                      onClick={() => getDirections(store)}
                      className="w-full py-2 bg-primary-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest mt-2"
                    >
                      NAVIGATE
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* User Location Marker */}
          {userLocation && (
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={L.divIcon({
                className: 'custom-user-marker',
                html: `<div class="relative"><div class="absolute -inset-2 bg-blue-500/20 rounded-full animate-ping"></div><div class="w-5 h-5 bg-blue-600 border-2 border-white rounded-full shadow-lg relative z-10 flex items-center justify-center">${isNavigating ? '<div class="w-1.5 h-1.5 bg-white rounded-full"></div>' : ''}</div></div>`
              })}
            />
          )}

          <MapController center={isNavigating && userLocation ? [userLocation.lat, userLocation.lng] : mapCenter} zoom={mapZoom} />
        </MapContainer>

        {/* Navigation HUD (Waze-like) */}
        {isNavigating && selectedStore && (
          <div className="absolute top-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-[350px] z-[1000] animate-slide-up">
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                {/* Instruction Header */}
                <div className="bg-primary-600 p-5 text-white flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-2xl">
                        <Navigation2 className="h-6 w-6 rotate-45" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Next Direction</p>
                        <h3 className="text-sm font-black uppercase leading-tight">
                            {directions[activeInstruction]?.instruction || 'Initializing Guidance...'}
                        </h3>
                    </div>
                    <button 
                        onClick={stopNavigation}
                        className="p-2 hover:bg-black/10 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Tracking Progress */}
                <div className="p-5 space-y-4">
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Destination</p>
                            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase truncate max-w-[180px]">
                                {selectedStore.name}
                            </h4>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">{eta || '--'} MIN</p>
                            <p className="text-[9px] font-black uppercase text-primary-600 tracking-widest mt-1">{distance || '--'} KM REMAINING</p>
                        </div>
                    </div>

                    <div className="relative h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="absolute left-0 top-0 h-full bg-primary-600 transition-all duration-1000" style={{ width: '15%' }}></div>
                    </div>

                    {/* Quick Info */}
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            <span>Arrival 2:45 PM</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Flag className="h-3 w-3" />
                            <span>Sector E-12</span>
                        </div>
                    </div>
                </div>

                {/* Secondary Directions (Expandable) */}
                <div className="border-t border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4">
                    <div className="flex items-center justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest px-2">
                        <span>Upcoming Steps</span>
                        <ArrowRight className="h-3 w-3" />
                    </div>
                    <div className="mt-3 space-y-3 max-h-[120px] overflow-y-auto no-scrollbar pr-2">
                        {directions.slice(activeInstruction + 1, activeInstruction + 4).map((step, i) => (
                            <div key={i} className="flex items-center gap-3 animate-fade-in">
                                <div className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm shrink-0">
                                    <div className="w-1 h-1 bg-slate-300 dark:bg-slate-500 rounded-full"></div>
                                </div>
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 leading-tight">
                                    {step.instruction}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* Legend / Status Overlay */}
        {!isNavigating && (
          <div className="absolute bottom-10 left-6 z-[999] hidden sm:block">
            <div className="px-4 py-2 bg-slate-900/90 backdrop-blur-md text-white rounded-xl border border-white/10 shadow-2xl flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-primary-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
                <span className="text-[9px] font-black uppercase tracking-[0.1em]">Verified Shops</span>
              </div>
              <div className="w-px h-3 bg-white/20"></div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                <span className="text-[9px] font-black uppercase tracking-[0.1em]">Your Position</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .pawzzle-popup .leaflet-popup-content-wrapper {
          border-radius: 1.5rem !important;
          padding: 0 !important;
          overflow: hidden !important;
          border: 1px solid #f1f5f9 !important;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
        }
        .pawzzle-popup .leaflet-popup-content {
          margin: 0 !important;
          width: 200px !important;
        }
        .pawzzle-popup .leaflet-popup-tip {
          box-shadow: none !important;
        }
      `}} />
    </div>
  );
};

export default FindShops;
