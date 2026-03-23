import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Filter, X, ChevronRight, Navigation, MapPin, Heart, Package, Scissors, Store as StoreIcon } from 'lucide-react';
import { petService, productService, serviceService, storeService } from '../services/apiService';

const GlobalSearch = ({ isScrolled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState({
        pets: [],
        products: [],
        services: [],
        stores: []
    });

    const [filters, setFilters] = useState({
        category: '',
        city: '',
        nearMe: false
    });

    const navigate = useNavigate();
    const location = useLocation();
    const searchRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (searchQuery.length > 2) {
            const delayDebounceFn = setTimeout(() => {
                performQuickSearch(searchQuery);
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setResults({ pets: [], products: [], services: [], stores: [] });
        }
    }, [searchQuery]);

    const performQuickSearch = async (term) => {
        setLoading(true);
        try {
            const [pets, products, services, stores] = await Promise.all([
                petService.getAllPets({ search: term, limit: 3 }),
                productService.getAllProducts({ search: term, limit: 3 }),
                serviceService.getAllServices({ search: term, limit: 3 }),
                storeService.getAllStores({ search: term, limit: 3 })
            ]);

            setResults({
                pets: pets.data.pets || [],
                products: products.data.products || [],
                services: services.data.services || [],
                stores: stores.data.stores || stores.data || []
            });
        } catch (error) {
            console.error('Quick search error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            const params = new URLSearchParams();
            params.set('q', searchQuery);
            if (filters.category) params.set('category', filters.category);
            if (filters.city) params.set('city', filters.city);
            if (filters.nearMe) params.set('nearMe', 'true');

            navigate(`/search?${params.toString()}`);
            setIsOpen(false);
        }
    };

    const totalCount = results.pets.length + results.products.length + results.services.length + results.stores.length;

    return (
        <div ref={searchRef} className="relative w-full max-w-[200px] xs:max-w-sm lg:max-w-md">
            <div className={`relative flex items-center transition-all duration-300 ${isOpen ? 'sm:scale-105' : ''}`}>
                <Search 
                    size={16} 
                    className={`absolute left-3 sm:left-4 z-10 pointer-events-none transition-colors ${isScrolled ? 'text-primary-600' : 'text-white/70'}`} 
                />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search pets, products..."
                    className={`w-full pl-10 sm:pl-14 pr-10 sm:pr-14 py-2.5 rounded-full text-[11px] font-medium outline-none transition-all duration-300 border input-with-both-icons ${isScrolled
                        ? 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-primary-500'
                        : 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:bg-white focus:text-slate-900 focus:border-white'
                        }`}
                />
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`absolute right-2.5 sm:right-3 p-1 rounded-md transition-colors ${isScrolled ? 'text-primary-400 hover:text-primary-600' : 'text-white/40 hover:text-white'
                        }`}
                >
                    <Filter size={16} />
                </button>
            </div>

            {/* Retractable Filter Section */}
            <div className={`absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transition-all duration-500 z-[60] ${showFilters ? 'max-h-96 opacity-100 p-4' : 'max-h-0 opacity-0 p-0 pointer-events-none'
                }`}>
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Filters</h4>
                    <button onClick={() => setShowFilters(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">Category</label>
                        <select
                            value={filters.category}
                            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                            className="w-full p-2 bg-slate-50 border-none rounded-xl text-xs font-bold"
                        >
                            <option value="">All Categories</option>
                            <option value="dogs">DOGS</option>
                            <option value="cats">CATS</option>
                            <option value="birds">BIRDS</option>
                            <option value="food">FOOD</option>
                            <option value="toys">TOYS</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">City</label>
                        <input
                            type="text"
                            value={filters.city}
                            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                            placeholder="e.g. Bacoor"
                            className="w-full p-2 bg-slate-50 border-none rounded-xl text-xs font-bold"
                        />
                    </div>

                    <button
                        onClick={handleSearchSubmit}
                        className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:bg-primary-700 active:scale-95 transition-all"
                    >
                        Apply & Search
                    </button>
                </div>
            </div>

            {/* Quick Results Dropdown */}
            {isOpen && searchQuery.length > 2 && !showFilters && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-3xl shadow-2xl overflow-hidden z-[60] animate-slide-up">
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scanning Grid...</p>
                        </div>
                    ) : totalCount > 0 ? (
                        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-4">
                            {results.pets.length > 0 && (
                                <div>
                                    <h5 className="px-3 py-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">Pets</h5>
                                    {results.pets.map(pet => (
                                        <button key={pet._id} onClick={() => { navigate(`/pets/${pet._id}`); setIsOpen(false); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-2xl transition-all group text-left">
                                            <div className="w-10 h-10 bg-slate-100 rounded-xl overflow-hidden group-hover:scale-110 transition-transform">
                                                {pet.images?.[0] ? <img src={getImageUrl(pet.images[0])} className="w-full h-full object-cover" /> : <Heart className="h-full w-full p-2 text-primary-200" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-slate-900 uppercase truncate">{pet.name}</p>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase truncate">{pet.breed}</p>
                                            </div>
                                            <span className="text-[10px] font-black text-primary-600">₱{pet.price?.toLocaleString()}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {results.products.length > 0 && (
                                <div>
                                    <h5 className="px-3 py-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">Products</h5>
                                    {results.products.map(prod => (
                                        <button key={prod._id} onClick={() => { navigate(`/products/${prod._id}`); setIsOpen(false); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-2xl transition-all group text-left">
                                            <div className="w-10 h-10 bg-slate-100 rounded-xl overflow-hidden group-hover:scale-110 transition-transform">
                                                {prod.images?.[0] ? <img src={getImageUrl(prod.images[0])} className="w-full h-full object-cover" /> : <Package className="h-full w-full p-2 text-secondary-200" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-slate-900 uppercase truncate">{prod.name}</p>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase truncate">{prod.category}</p>
                                            </div>
                                            <span className="text-[10px] font-black text-slate-900">₱{prod.price?.toLocaleString()}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {results.services.length > 0 && (
                                <div>
                                    <h5 className="px-3 py-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">Services</h5>
                                    {results.services.map(service => (
                                        <button key={service._id} onClick={() => { navigate(`/services/${service._id}`); setIsOpen(false); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-2xl transition-all group text-left">
                                            <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Scissors size={18} className="text-primary-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-slate-900 uppercase truncate">{service.name}</p>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase truncate">{service.duration} mins</p>
                                            </div>
                                            <span className="text-[10px] font-black text-primary-600">₱{service.price?.toLocaleString()}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {results.stores.length > 0 && (
                                <div>
                                    <h5 className="px-3 py-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">Bases</h5>
                                    {results.stores.map(store => (
                                        <button key={store._id} onClick={() => { navigate(`/stores/${store._id}`); setIsOpen(false); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-2xl transition-all group text-left">
                                            <div className="w-10 h-10 bg-slate-100 rounded-xl overflow-hidden group-hover:scale-110 transition-transform">
                                                {store.logo ? <img src={store.logo} className="w-full h-full object-cover" /> : <StoreIcon className="h-full w-full p-2 text-slate-400" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-slate-900 uppercase truncate">{store.name}</p>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase truncate">{store.contactInfo?.address?.city}</p>
                                            </div>
                                            <ChevronRight size={14} className="text-slate-300" />
                                        </button>
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={handleSearchSubmit}
                                className="w-full p-3 bg-slate-50 rounded-2xl text-[9px] font-black uppercase tracking-widest text-primary-600 hover:bg-primary-50 transition-all flex items-center justify-center gap-2"
                            >
                                View all {totalCount} results <ChevronRight size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="p-8 text-center">
                            <Search className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zero Matches Found</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;
