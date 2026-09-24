import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ChevronRight, Clock, Filter, Heart, MapPin, Navigation,
  Package, PawPrint, RotateCcw, Search as SearchIcon, Scissors,
  Store as StoreIcon, X
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
  getImageUrl, petService, productService, serviceService, storeService
} from '../../services/apiService';
import { getCitiesByProvince } from '../../constants/locationConstants';
import { formatPeso } from '../../utils/paymentSummary';
import '../../styles/DiscoveryHub.css';

const CAVITE_CITIES = getCitiesByProvince('cavite');
const EMPTY_RESULTS = { pets: [], products: [], services: [], stores: [] };
const DEFAULT_FILTERS = { category: '', priceRange: '', city: '', nearMe: false };

const normalizeString = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const coordinates = [lat1, lon1, lat2, lon2].map(Number);
  if (!coordinates.every(Number.isFinite)) return Infinity;
  const [startLat, startLng, endLat, endLng] = coordinates;
  const earthRadiusKm = 6371;
  const latitudeDelta = (endLat - startLat) * Math.PI / 180;
  const longitudeDelta = (endLng - startLng) * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180)
    * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const categoryMatches = (item, category) => {
  if (!category) return true;
  const selected = normalizeString(category).replace(/s$/, '');
  return [item.category, item.species, item.breed, item.businessType]
    .some((value) => normalizeString(value).replace(/s$/, '').includes(selected));
};

const Search = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestIdRef = useRef(0);

  const urlQuery = (searchParams.get('q') || '').trim();
  const urlCategory = searchParams.get('category') || '';
  const urlPriceRange = searchParams.get('priceRange') || '';
  const urlCity = searchParams.get('city') || '';
  const urlNearMe = searchParams.get('nearMe') === 'true';

  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [activeTab, setActiveTab] = useState('all');
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    category: urlCategory,
    priceRange: urlPriceRange,
    city: urlCity,
    nearMe: urlNearMe
  });
  const [userLocation, setUserLocation] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const performSearch = useCallback(async (searchTerm, city = '') => {
    const term = searchTerm.trim();
    if (!term) {
      requestIdRef.current += 1;
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError('');
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    try {
      const params = { search: term, limit: 50 };
      if (city) params.city = city;

      const [petsResponse, productsResponse, servicesResponse, storesResponse] = await Promise.all([
        petService.getAllPets(params),
        productService.getAllProducts(params),
        serviceService.getAllServices(params),
        storeService.getAllStores(params)
      ]);

      if (requestId !== requestIdRef.current) return;

      // Public catalog endpoints already enforce their authoritative visibility
      // and city rules. Do not discard their results with a second address-shape filter.
      setResults({
        pets: petsResponse.data?.pets || [],
        products: productsResponse.data?.products || [],
        services: servicesResponse.data?.services || [],
        stores: storesResponse.data?.stores || (Array.isArray(storesResponse.data) ? storesResponse.data : [])
      });
    } catch (searchError) {
      if (requestId !== requestIdRef.current) return;
      console.error('Search error:', searchError);
      setResults(EMPTY_RESULTS);
      setError('Unable to load discovery results right now. Please try again.');
      toast.error('We could not complete your search. Please try again.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const nextFilters = {
      category: urlCategory,
      priceRange: urlPriceRange,
      city: urlCity,
      nearMe: urlNearMe
    };
    setSearchQuery(urlQuery);
    setFilters(nextFilters);
    if (urlQuery) performSearch(urlQuery, urlCity);
    else performSearch('', '');
  }, [performSearch, urlCategory, urlCity, urlNearMe, urlPriceRange, urlQuery]);

  const buildSearchParams = (term, nextFilters) => {
    const params = new URLSearchParams();
    if (term.trim()) params.set('q', term.trim());
    if (nextFilters.category) params.set('category', nextFilters.category);
    if (nextFilters.priceRange) params.set('priceRange', nextFilters.priceRange);
    if (nextFilters.city) params.set('city', nextFilters.city);
    if (nextFilters.nearMe) params.set('nearMe', 'true');
    return params;
  };

  const submitSearchState = (term, nextFilters = filters) => {
    const cleanTerm = term.trim();
    if (!cleanTerm) {
      requestIdRef.current += 1;
      setSearchQuery('');
      setResults(EMPTY_RESULTS);
      setError('');
      setSearchParams(new URLSearchParams());
      return;
    }

    const params = buildSearchParams(cleanTerm, nextFilters);
    if (params.toString() === searchParams.toString()) performSearch(cleanTerm, nextFilters.city);
    else setSearchParams(params);
  };

  const handleSearch = (event) => {
    event.preventDefault();
    submitSearchState(searchQuery);
  };

  const handleClearSearch = () => {
    requestIdRef.current += 1;
    setSearchQuery('');
    setResults(EMPTY_RESULTS);
    setError('');
    setFilters(DEFAULT_FILTERS);
    setUserLocation(null);
    setSearchParams(new URLSearchParams());
  };

  const handleFilterChange = (name, value) => {
    const nextFilters = { ...filters, [name]: value };
    if (name === 'city') nextFilters.nearMe = false;
    setFilters(nextFilters);
    if (urlQuery) submitSearchState(urlQuery, nextFilters);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setUserLocation(null);
    setShowMobileFilters(false);
    if (urlQuery) submitSearchState(urlQuery, DEFAULT_FILTERS);
  };

  const handleNearMe = () => {
    if (filters.nearMe) {
      const nextFilters = { ...filters, nearMe: false };
      setFilters(nextFilters);
      if (urlQuery) submitSearchState(urlQuery, nextFilters);
      return;
    }
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        const nextFilters = { ...filters, nearMe: true, city: '' };
        setFilters(nextFilters);
        setLoading(false);
        if (urlQuery) submitSearchState(urlQuery, nextFilters);
        toast.success('Location found. Showing results within 5 km.');
      },
      (locationError) => {
        setLoading(false);
        const messages = {
          1: 'Location access was denied. Enable location access to use Near Me.',
          2: 'Your location is currently unavailable.',
          3: 'The location request timed out. Please try again.'
        };
        toast.error(messages[locationError.code] || 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const filteredResults = useMemo(() => {
    const applyFilters = (items, type) => items
      .map((item) => {
        if (!filters.nearMe || !userLocation) return item;
        const store = type === 'stores' ? item : item.store;
        const coordinates = store?.contactInfo?.address?.coordinates;
        return { ...item, distance: calculateDistance(userLocation.lat, userLocation.lng, coordinates?.lat, coordinates?.lng) };
      })
      .filter((item) => !filters.nearMe || !userLocation || item.distance <= 5)
      .filter((item) => categoryMatches(item, filters.category))
      .filter((item) => {
        if (!filters.priceRange || type === 'stores') return true;
        const [minimum, maximum] = filters.priceRange.split('-').map(Number);
        const price = Number(item.price) || 0;
        return price >= minimum && price <= maximum;
      })
      .sort((first, second) => (!filters.nearMe || !userLocation ? 0 : first.distance - second.distance));

    return {
      pets: applyFilters(results.pets || [], 'pets'),
      products: applyFilters(results.products || [], 'products'),
      services: applyFilters(results.services || [], 'services'),
      stores: applyFilters(results.stores || [], 'stores')
    };
  }, [filters.category, filters.nearMe, filters.priceRange, results, userLocation]);

  const counts = {
    pets: filteredResults.pets.length,
    products: filteredResults.products.length,
    services: filteredResults.services.length,
    stores: filteredResults.stores.length
  };
  const totalResults = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const activeFilterCount = [filters.category, filters.priceRange, filters.city, filters.nearMe].filter(Boolean).length;

  const renderSection = ({ id, label, items }, showHeading = true) => {
    if (!items.length) return null;
    return (
      <section key={id} className="discovery-results-section">
        {showHeading && <header><h2>{label}</h2><span>{items.length} {items.length === 1 ? 'match' : 'matches'}</span></header>}
        <div className="discovery-card-grid responsive-card-grid [--card-min:17rem] [--card-gap:0.75rem]">
          {items.map((item) => renderCard(id, item))}
        </div>
      </section>
    );
  };

  function renderCard(type, item) {
    const store = type === 'stores' ? item : item.store;
    const city = store?.contactInfo?.address?.city;
    const image = type === 'stores' ? item.logo : item.images?.[0];
    const imageUrl = getImageUrl(image);
    const detailRoute = type === 'pets' ? `/pets/${item._id}`
      : type === 'products' ? `/products/${item._id}`
        : type === 'stores' ? `/stores/${item._id}` : `/services/${item._id}`;
    const Icon = type === 'pets' ? Heart : type === 'products' ? Package : type === 'services' ? Scissors : StoreIcon;
    const eyebrow = type === 'pets' ? (item.breed || item.species || 'Pet listing')
      : type === 'products' ? (item.category || 'Pet product')
        : type === 'services' ? (item.category?.replace(/_/g, ' ') || 'Pet service')
          : (item.businessType?.replace(/_/g, ' ') || 'Pawzzle store');
    const cardContent = (
      <>
        <div className="discovery-card-image">
          {imageUrl ? <img src={imageUrl} alt={item.name || `${type} result`} loading="lazy" /> : <span><Icon aria-hidden="true" /></span>}
          {type === 'pets' && <small>{item.isAvailable === false ? 'Unavailable' : 'Available'}</small>}
        </div>
        <div className="discovery-card-copy">
          <p>{eyebrow}</p>
          <h3 className="line-clamp-2 break-words">{item.name}</h3>
          <div className="discovery-card-meta">
            {type !== 'stores' ? <strong>{formatPeso(item.price)}</strong> : <strong>View store</strong>}
            {type === 'services' && item.duration ? <span><Clock /> {item.duration} min</span>
              : city ? <span><MapPin /> {city}</span> : null}
          </div>
          {type !== 'stores' && store?.name && <span className="discovery-card-store"><StoreIcon /> {store.name}</span>}
          {Number.isFinite(item.distance) && <span className="discovery-card-distance"><Navigation /> {item.distance.toFixed(1)} km away</span>}
        </div>
      </>
    );

    if (type === 'services') {
      const service = item;
      return <button key={service._id} type="button" className="discovery-card" onClick={() => navigate(`/services/${service._id}`)}>{cardContent}</button>;
    }
    return <Link key={item._id} to={detailRoute} className="discovery-card">{cardContent}</Link>;
  }

  const resultSections = [
    { id: 'pets', label: 'Pets', items: filteredResults.pets },
    { id: 'products', label: 'Products', items: filteredResults.products },
    { id: 'services', label: 'Services', items: filteredResults.services },
    { id: 'stores', label: 'Stores', items: filteredResults.stores }
  ];

  return (
    <div className="discovery-hub">
      <header className="discovery-header">
        <div><p><PawPrint aria-hidden="true" /> Pawzzle discovery</p><h1>Discovery Hub</h1><span>Search active pets, products, services, and stores in one place.</span></div>
        {urlQuery && <div className="discovery-result-summary"><strong>{totalResults}</strong><span>{totalResults === 1 ? 'result' : 'results'} for “{urlQuery}”</span></div>}
      </header>

      <form onSubmit={handleSearch} className="discovery-search" role="search">
        <SearchIcon aria-hidden="true" />
        <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search pets, products, services, or stores" aria-label="Search Pawzzle discovery" />
        {searchQuery && <button type="button" className="discovery-search-clear" onClick={handleClearSearch} aria-label="Clear search"><X /></button>}
        <button type="submit" className="discovery-search-submit">Search <ChevronRight /></button>
      </form>

      <div className="discovery-mobile-actions">
        <button type="button" onClick={() => setShowMobileFilters((open) => !open)} aria-expanded={showMobileFilters}><Filter /> Filters {activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>
        <button type="button" className={filters.nearMe ? 'is-active' : ''} onClick={handleNearMe}><Navigation /> Near me</button>
      </div>

      <section className={`discovery-filters ${showMobileFilters ? 'is-open' : ''}`} aria-label="Discovery filters">
        <header><span><Filter /> Refine results</span><button type="button" onClick={handleResetFilters}><RotateCcw /> Reset</button></header>
        <div>
          <label>Category<select value={filters.category} onChange={(event) => handleFilterChange('category', event.target.value)}>
            <option value="">All categories</option><option value="dogs">Dogs</option><option value="cats">Cats</option><option value="birds">Birds</option>
            <option value="food">Food</option><option value="toys">Toys</option><option value="grooming">Grooming</option><option value="health">Health</option>
          </select></label>
          <label>City / municipality<select value={filters.city} onChange={(event) => handleFilterChange('city', event.target.value)}>
            <option value="">All locations</option>{CAVITE_CITIES.map((city) => <option key={city.value} value={city.label}>{city.label}</option>)}
          </select></label>
          <label>Price range<select value={filters.priceRange} onChange={(event) => handleFilterChange('priceRange', event.target.value)}>
            <option value="">All prices</option><option value="0-500">Under ₱500</option><option value="500-1000">₱500–₱1,000</option>
            <option value="1000-5000">₱1,000–₱5,000</option><option value="5000-999999999">Above ₱5,000</option>
          </select></label>
          <label className="discovery-location-control">Distance<button type="button" className={filters.nearMe ? 'is-active' : ''} onClick={handleNearMe}><Navigation /> {filters.nearMe ? 'Within 5 km' : 'Use my location'}</button></label>
        </div>
        <button type="button" className="discovery-apply-mobile" onClick={() => setShowMobileFilters(false)}>Show results</button>
      </section>

      <nav className="discovery-tabs content-scroll-row" aria-label="Search result types">
        {[{ id: 'all', label: 'All', count: totalResults }, ...resultSections.map(({ id, label }) => ({ id, label, count: counts[id] }))].map((tab) => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}<span>{tab.count}</span></button>
        ))}
      </nav>

      {loading && <div className="discovery-loading" role="status"><span /><p>Searching Pawzzle</p></div>}
      {!loading && error && <div className="discovery-state is-error" role="alert"><AlertCircle /><h2>Search unavailable</h2><p>{error}</p><button type="button" onClick={() => performSearch(urlQuery, filters.city)}>Try again</button></div>}
      {!loading && !error && !urlQuery && <div className="discovery-state"><SearchIcon /><h2>What are you looking for?</h2><p>Enter a pet, product, service, or store name to begin.</p></div>}
      {!loading && !error && urlQuery && totalResults === 0 && <div className="discovery-state"><SearchIcon /><h2>No matching results</h2><p>We couldn’t find anything for “{urlQuery}”. Try a broader term or reset the filters.</p><button type="button" onClick={handleResetFilters}>Reset filters</button></div>}

      {!loading && !error && totalResults > 0 && (
        <div className="discovery-results">
          {activeTab === 'all' ? resultSections.map((section) => renderSection(section)) : renderSection(resultSections.find((section) => section.id === activeTab), false)}
          {activeTab !== 'all' && counts[activeTab] === 0 && <div className="discovery-state is-compact"><SearchIcon /><h2>No {activeTab} found</h2><p>Other result types may still match this search.</p></div>}
        </div>
      )}
    </div>
  );
};

export default Search;
