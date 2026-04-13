import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { storeService, getImageUrl } from '../../services/apiService';
import {
    Building,
    MapPin,
    Search,
    ChevronRight,
    TrendingUp,
    Package,
    Scissors,
    Heart,
    Store as StoreIcon,
    Navigation,
    Star
} from 'lucide-react';
import { toast } from 'react-toastify';

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

const Stores = () => {
    const [stores, setStores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [nearMeActive, setNearMeActive] = useState(false);

    useEffect(() => {
        const fetchStores = async () => {
            try {
                setLoading(true);
                const response = await storeService.getAllStores();
                const fetchedStores = response.data.stores || response.data || [];
                
                // STRICT CAVITE FILTERING: Only allow stores in Cavite
                const isCavite = (store) => {
                    if (!store) return false;
                    const address = store.contactInfo?.address;
                    if (!address) return false;
                    
                    const state = (address.state || '').toLowerCase();
                    const city = (address.city || '').toLowerCase();
                    const street = (address.street || '').toLowerCase();
                    
                    return state.includes('cavite') || city.includes('cavite') || street.includes('cavite');
                };

                const filtered = fetchedStores.filter(s => 
                    s.name?.toLowerCase() !== 'admin pet store' && isCavite(s)
                );
                
                setStores(filtered);
            } catch (error) {
                console.error('Error fetching stores:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchStores();
    }, []);

    const getFilteredStores = () => {
        let result = stores.filter(store =>
            store.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            store.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            store.contactInfo?.address?.city?.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (nearMeActive && userLocation) {
            result = result
                .map(store => {
                    const storeLat = store.contactInfo?.address?.coordinates?.lat;
                    const storeLng = store.contactInfo?.address?.coordinates?.lng;
                    const distance = calculateDistance(userLocation.lat, userLocation.lng, storeLat, storeLng);
                    return { ...store, distance };
                })
                .filter(store => store.distance <= 5) // 5km radius filter
                .sort((a, b) => a.distance - b.distance);
        }

        return result;
    };

    const filteredStores = getFilteredStores();

    const handleNearMe = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser');
            return;
        }

        setLoading(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
                setNearMeActive(true);
                setLoading(false);
                toast.success('Location acquired! Filtering stores within 5km.');
            },
            (error) => {
                setLoading(false);
                if (error.code === 1) {
                    toast.error('Location access is required to use the Near Me feature.');
                } else {
                    toast.error('Could not get your location');
                }
                setNearMeActive(false);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="relative w-24 h-24">
                    <div className="absolute inset-0 border-4 border-primary-200 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
                    <StoreIcon className="absolute inset-0 m-auto h-8 w-8 text-primary-600 animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-36 sm:pb-20 px-1 sm:px-2">
            {/* Premium Header Section - Optimized for Compactness */}
            <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-32 overflow-hidden rounded-b-[2rem] sm:rounded-b-[4rem]">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900"></div>
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                <div className="absolute bottom-0 left-0 right-0 h-24 sm:h-32 bg-gradient-to-t from-[#F8FAFC] to-transparent"></div>

                <div className="container-custom relative z-10 text-center space-y-4 sm:space-y-8 px-4">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full text-white">
                        <TrendingUp className="h-3 w-3 text-primary-400" />
                        <span className="text-[7px] sm:text-[10px] font-black uppercase tracking-[0.2em]">Verified Network</span>
                    </div>
                    <h1 className="text-3xl sm:text-7xl font-black text-white tracking-tight leading-[0.9] uppercase overflow-visible">
                        Elite <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-secondary-400 italic">Partners</span>
                    </h1>
                    <p className="text-slate-400 font-bold text-[9px] sm:text-lg max-w-lg mx-auto leading-relaxed uppercase tracking-tight italic opacity-80">
                        Connecting you with trusted pet boutiques, grooming salons, and veterinary clinics.
                    </p>

                    {/* Luxury Search Bar - Compact */}
                    <div className="max-w-xl mx-auto relative group pt-4 sm:pt-8">
                        <div className="relative bg-white rounded-2xl sm:rounded-full p-1 sm:p-2 flex items-center gap-1 sm:gap-2 shadow-2xl">
                            <div className="flex items-center justify-center pl-4 sm:pl-6 shrink-0">
                                <Search className="h-4 w-4 sm:h-6 sm:w-6 text-slate-300 group-focus-within:text-primary-600 transition-colors" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search bases..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="flex-1 py-3 sm:py-4 text-slate-900 font-bold outline-none placeholder:text-slate-300 text-xs sm:text-lg bg-transparent min-w-0"
                            />
                            <button
                                onClick={() => setNearMeActive(false)}
                                className="px-5 sm:px-10 py-2 sm:py-4 bg-slate-900 text-white rounded-xl sm:rounded-full font-black uppercase tracking-widest text-[8px] sm:text-xs hover:bg-black transition-all active:scale-95 shrink-0"
                            >
                                Scan
                            </button>
                        </div>
                        <div className="flex justify-center mt-6">
                            <button
                                onClick={handleNearMe}
                                className={`flex items-center gap-2 px-8 py-3 rounded-full font-black uppercase tracking-widest text-[10px] transition-all ${nearMeActive
                                        ? 'bg-secondary-600 text-white shadow-lg'
                                        : 'bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white/20'
                                    }`}
                            >
                                <Navigation className={`h-4 w-4 ${nearMeActive ? 'animate-pulse' : ''}`} />
                                {nearMeActive ? 'Radar Locked (5km)' : 'Near Me (GPS)'}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stores Grid - High Density */}
            <div className="container-custom -mt-8 sm:-mt-12 relative z-20 px-2 sm:px-0">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-8">
                    {filteredStores.length > 0 ? (
                        filteredStores.map((store, index) => (
                            <Link
                                to={`/stores/${store._id}`}
                                key={store._id}
                                className="group bg-white rounded-2xl sm:rounded-[3rem] p-3 sm:p-8 border border-white shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-all h-full flex flex-col"
                                style={{ animationDelay: `${index * 0.05}s` }}
                            >
                                <div className="relative mb-3 sm:mb-8 shrink-0">
                                    <div className="relative aspect-video rounded-xl sm:rounded-[2rem] overflow-hidden bg-slate-50 border border-slate-100">
                                        {store.coverImage ? (
                                            <img src={getImageUrl(store.coverImage)} alt={store.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-200">
                                                <Building className="h-8 w-8 sm:h-20 sm:w-20" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute -bottom-3 sm:-bottom-6 left-1/2 -translate-x-1/2 w-10 h-10 sm:w-20 sm:h-20 bg-white rounded-lg sm:rounded-[1.5rem] p-0.5 sm:p-1 shadow-xl border border-slate-50">
                                        {store.logo ? (
                                            <img src={getImageUrl(store.logo)} alt="Logo" className="w-full h-full rounded-md sm:rounded-[1.25rem] object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-slate-50 rounded-md sm:rounded-[1.25rem] flex items-center justify-center text-slate-300">
                                                <StoreIcon className="h-4 w-4 sm:h-8 sm:w-8" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="text-center mt-5 sm:mt-10 space-y-2 sm:space-y-4 flex-1 flex flex-col">
                                    <h3 className="text-xs sm:text-2xl font-black text-slate-900 group-hover:text-primary-600 transition-colors uppercase tracking-tight truncate px-1">
                                        {store.name}
                                    </h3>
                                    <p className="text-slate-500 font-bold text-[8px] sm:text-sm line-clamp-1 sm:line-clamp-2 leading-relaxed h-4 sm:h-10 opacity-70">
                                        {store.description}
                                    </p>

                                    <div className="flex flex-wrap items-center justify-center gap-2 py-3">
                                        {store.distance !== undefined && (
                                            <div className="w-full mb-2">
                                                <span className="px-3 py-1 bg-secondary-50 text-secondary-600 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 mx-auto w-fit">
                                                    <Navigation className="h-3 w-3" />
                                                    {store.distance.toFixed(1)} km away
                                                </span>
                                            </div>
                                        )}
                                        {store.businessType && (
                                            <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-lg text-[7px] sm:text-[9px] font-black uppercase tracking-wide text-slate-500">
                                                {store.businessType.replace('_', ' ')}
                                            </span>
                                        )}
                                        {store.services && store.services.length > 0 && store.services.slice(0, 2).map((s, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-primary-50 border border-primary-100 rounded-lg text-[7px] sm:text-[9px] font-black uppercase tracking-wide text-primary-600">
                                                {s.name}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-center gap-3 sm:gap-6 pt-2 sm:pt-4 border-t border-slate-50 mt-auto">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[6px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest sm:mb-1">Sector</span>
                                            <p className="text-[7px] sm:text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-0.5 sm:gap-1">
                                                <MapPin className="h-2 w-2 sm:h-3 sm:w-3 text-primary-500" />
                                                {store.contactInfo?.address?.city || 'Local'}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[6px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest sm:mb-1">Rating</span>
                                            <span className="flex items-center gap-1 px-1.5 sm:px-3 py-0.5 sm:py-1 bg-secondary-50 text-primary-600 rounded-full text-[6px] sm:text-[10px] font-black">
                                                <Star className="h-2 w-2 sm:h-3 sm:w-3 fill-secondary-500 text-secondary-500" />
                                                {store.ratings?.average || '0.0'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Digital Presence Icons */}
                                    {(store.contactInfo?.website || store.socialMedia?.facebook || store.socialMedia?.instagram) && (
                                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 pt-2 sm:pt-4 border-t border-slate-50 mt-2 sm:mt-4">
                                            {store.contactInfo?.website && (
                                                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center">
                                                    <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                                                </div>
                                            )}
                                            {store.socialMedia?.facebook && (
                                                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center">
                                                    <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                                                </div>
                                            )}
                                            {store.socialMedia?.instagram && (
                                                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center">
                                                    <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        ))
                    ) : (
                        <div className="col-span-full py-20 sm:py-40 text-center bg-white/40 backdrop-blur-md rounded-[2.5rem] border border-white">
                            <div className="w-16 h-16 sm:w-24 sm:h-24 bg-slate-50 rounded-2xl sm:rounded-[2rem] flex items-center justify-center text-slate-200 mx-auto mb-4 sm:mb-8">
                                <Building className="h-8 w-8 sm:h-12 sm:w-12" />
                            </div>
                            <h4 className="text-sm sm:text-3xl font-black text-slate-900 mb-1 sm:mb-2 uppercase tracking-tighter">No Matches Found</h4>
                            <p className="text-[9px] sm:text-lg text-slate-400 font-bold uppercase tracking-widest italic">Try adjusting your search criteria.</p>
                        </div>
                    )}
                </div>

                {/* Trust Banner - Compact */}
                <div className="mt-12 sm:mt-20 p-8 sm:p-20 bg-slate-900 rounded-[2.5rem] sm:rounded-[3rem] text-center relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-40 h-40 sm:w-80 sm:h-80 bg-primary-600/10 rounded-full blur-[60px] sm:blur-[100px] -mr-20 -mt-20"></div>
                    <div className="relative z-10 max-w-2xl mx-auto space-y-4 sm:space-y-6">
                        <h3 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tighter">Business Acquisition</h3>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] opacity-70">
                            Verified partner integration actively available.
                        </p>
                        <div className="flex justify-center gap-4 sm:gap-10 pt-2 sm:pt-4">
                            {[
                                { icon: Package, label: 'Inventory' },
                                { icon: Scissors, label: 'Booking' },
                                { icon: Heart, label: 'Inquiry' }
                            ].map((item, i) => (
                                <div key={i} className="flex flex-col items-center gap-2">
                                    <item.icon className="h-5 w-5 sm:h-8 sm:w-8 text-primary-500" />
                                    <span className="text-[6px] sm:text-[10px] font-black text-white uppercase tracking-widest">{item.label}</span>
                                </div>
                            ))}
                        </div>
                        <Link to="/account-upgrade" className="inline-block mt-4 sm:mt-8 px-8 sm:px-12 py-3.5 sm:py-5 bg-white text-slate-900 rounded-xl sm:rounded-[2rem] font-black uppercase tracking-[0.1em] text-[9px] sm:text-xs hover:bg-primary-50 transition-all shadow-2xl active:scale-95">
                            Expand Network
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Stores;
