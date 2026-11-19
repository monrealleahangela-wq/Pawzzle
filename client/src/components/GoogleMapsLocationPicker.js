import React, { useEffect, useRef, useState } from 'react';
import { Check, MapPin, Search } from 'lucide-react';

const DEFAULT_CENTER = { lat: 14.2792, lng: 120.8787 };
const CAVITE_BOUNDS = { south: 13.95, west: 120.55, north: 14.55, east: 121.15 };
let googleMapsPromise;

const loadGoogleMaps = apiKey => {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!googleMapsPromise) googleMapsPromise = new Promise((resolve, reject) => {
    const callback = `pawzzleGoogleMapsReady${Date.now()}`;
    window[callback] = () => {
      delete window[callback];
      resolve(window.google.maps);
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callback}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Google Maps could not be loaded.'));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
};

const componentValue = (result, type) => result.address_components
  ?.find(component => component.types.includes(type))?.long_name || '';

const normalizedLocation = (result, position) => ({
  lat: position.lat(),
  lng: position.lng(),
  full: result.formatted_address || '',
  street: [componentValue(result, 'street_number'), componentValue(result, 'route')].filter(Boolean).join(' ') || result.formatted_address || '',
  barangay: componentValue(result, 'sublocality_level_1') || componentValue(result, 'sublocality') || componentValue(result, 'neighborhood'),
  city: componentValue(result, 'locality') || componentValue(result, 'administrative_area_level_2'),
  province: componentValue(result, 'administrative_area_level_1'),
  zipCode: componentValue(result, 'postal_code')
});

const insideCavite = position => position.lat() >= CAVITE_BOUNDS.south
  && position.lat() <= CAVITE_BOUNDS.north
  && position.lng() >= CAVITE_BOUNDS.west
  && position.lng() <= CAVITE_BOUNDS.east;

const GoogleMapsLocationPicker = ({ onLocationSelected, initialAddress = '', initialCoordinates, className = '' }) => {
  const mapElement = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const geocoder = useRef(null);
  const [query, setQuery] = useState(initialAddress);
  const [candidate, setCandidate] = useState(null);
  const [message, setMessage] = useState('Search for the store address, then drag the pin to the exact entrance.');
  const [loading, setLoading] = useState(true);
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  const inspectPosition = position => {
    if (!insideCavite(position)) {
      setCandidate(null);
      setMessage('The store location must be within Cavite. Move the pin back inside the province.');
      return;
    }
    geocoder.current.geocode({ location: position }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) {
        setCandidate(null);
        setMessage('We could not read this location. Adjust the pin and try again.');
        return;
      }
      const location = normalizedLocation(results[0], position);
      if (!location.province.toLowerCase().includes('cavite')) {
        setCandidate(null);
        setMessage('The selected address must be in Cavite.');
        return;
      }
      setCandidate(location);
      setQuery(location.full);
      setMessage('Pin ready. Confirm this exact storefront location.');
    });
  };

  useEffect(() => {
    if (!apiKey) {
      setLoading(false);
      setMessage('Google Maps is not configured. Add REACT_APP_GOOGLE_MAPS_API_KEY to the frontend service.');
      return undefined;
    }
    let active = true;
    loadGoogleMaps(apiKey).then(maps => {
      if (!active) return;
      const initial = Number.isFinite(Number(initialCoordinates?.lat)) && Number.isFinite(Number(initialCoordinates?.lng))
        ? { lat: Number(initialCoordinates.lat), lng: Number(initialCoordinates.lng) }
        : DEFAULT_CENTER;
      map.current = new maps.Map(mapElement.current, { center: initial, zoom: 15, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, restriction: { latLngBounds: CAVITE_BOUNDS, strictBounds: false } });
      geocoder.current = new maps.Geocoder();
      marker.current = new maps.Marker({ map: map.current, position: initial, draggable: true, title: 'Store location' });
      marker.current.addListener('dragend', event => inspectPosition(event.latLng));
      map.current.addListener('click', event => { marker.current.setPosition(event.latLng); inspectPosition(event.latLng); });
      if (initialCoordinates?.lat && initialCoordinates?.lng) inspectPosition(marker.current.getPosition());
      setLoading(false);
    }).catch(error => { setLoading(false); setMessage(error.message); });
    return () => { active = false; };
    // The map is intentionally initialized once; later form updates come from this picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const searchAddress = () => {
    if (!geocoder.current || !query.trim()) return;
    setMessage('Searching for this address...');
    geocoder.current.geocode({ address: `${query}, Cavite, Philippines`, bounds: map.current.getBounds(), region: 'PH' }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) return setMessage('No matching Cavite address was found. Add a street, barangay, and city.');
      const position = results[0].geometry.location;
      marker.current.setPosition(position);
      map.current.panTo(position);
      map.current.setZoom(17);
      inspectPosition(position);
    });
  };

  return <div className={`space-y-3 ${className}`}>
    <div className="flex gap-2"><label className="sr-only" htmlFor="google-store-address">Search store address</label><input id="google-store-address" className="input-premium flex-1" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); searchAddress(); } }} placeholder="Search street, barangay, and city in Cavite" /><button type="button" onClick={searchAddress} disabled={!apiKey || loading} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 text-[9px] font-black uppercase text-white disabled:opacity-50"><Search className="h-4 w-4" /> Search</button></div>
    <div ref={mapElement} className="h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" aria-label="Google map for selecting the store location" />
    <div className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${candidate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><p className="flex items-start gap-2 text-[10px] font-bold leading-relaxed text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{message}</p><button type="button" disabled={!candidate} onClick={() => onLocationSelected(candidate)} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-[8px] font-black uppercase text-white disabled:opacity-40"><Check className="h-3 w-3" /> Confirm location</button></div>
  </div>;
};

export default GoogleMapsLocationPicker;
