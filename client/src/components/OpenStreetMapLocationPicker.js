import React, { useEffect, useMemo, useState } from 'react';
import { Check, LocateFixed, MapPin, Search } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import storeApplicationService from '../services/storeApplicationService';

const DEFAULT_POSITION = [14.2792, 120.8787];
const CAVITE_BOUNDS = [[13.95, 120.55], [14.55, 121.15]];
const storeMarker = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41]
});

const validCoordinates = coordinates => {
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  return Number.isFinite(lat) && lat >= CAVITE_BOUNDS[0][0] && lat <= CAVITE_BOUNDS[1][0]
    && Number.isFinite(lng) && lng >= CAVITE_BOUNDS[0][1] && lng <= CAVITE_BOUNDS[1][1];
};

const MapController = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(position, 17);
  }, [map, position]);
  return null;
};

const StoreMarker = ({ position, onPositionChanged }) => {
  useMapEvents({
    click: event => onPositionChanged(event.latlng.lat, event.latlng.lng)
  });
  return (
    <Marker
      position={position}
      icon={storeMarker}
      draggable
      eventHandlers={{
        dragend: event => {
          const next = event.target.getLatLng();
          onPositionChanged(next.lat, next.lng);
        }
      }}
    />
  );
};

const errorMessage = error => error?.response?.data?.message
  || 'Address search is unavailable right now. Place the pin manually or enter the address.';

const OpenStreetMapLocationPicker = ({ onLocationSelected, initialAddress = '', initialCoordinates, className = '' }) => {
  const initialPosition = useMemo(() => validCoordinates(initialCoordinates)
    ? [Number(initialCoordinates.lat), Number(initialCoordinates.lng)]
    : DEFAULT_POSITION, [initialCoordinates]);
  const [position, setPosition] = useState(initialPosition);
  const [query, setQuery] = useState(initialAddress);
  const [candidate, setCandidate] = useState(null);
  const [message, setMessage] = useState(validCoordinates(initialCoordinates)
    ? 'Your saved pin is shown. Move it if the storefront location has changed.'
    : 'Search for the store address, then drag the pin to the exact entrance.');
  const [loading, setLoading] = useState(false);

  const applyLocation = location => {
    if (!location) return;
    setPosition([Number(location.lat), Number(location.lng)]);
    setCandidate(location);
    setQuery(location.full || query);
    setMessage('Pin ready. Confirm this exact storefront location.');
  };

  const inspectPosition = async (lat, lng) => {
    setLoading(true);
    setCandidate(null);
    setPosition([lat, lng]);
    setMessage('Reading the address at this pin...');
    try {
      const response = await storeApplicationService.reverseStoreLocation(lat, lng);
      applyLocation(response.data.location);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const searchAddress = async () => {
    const cleaned = query.trim();
    if (cleaned.length < 3) {
      setMessage('Enter at least 3 characters to search for an address.');
      return;
    }
    setLoading(true);
    setCandidate(null);
    setMessage('Searching for this address in Cavite...');
    try {
      const response = await storeApplicationService.searchStoreLocations(cleaned);
      const location = response.data.locations?.[0];
      if (!location) {
        setMessage('No matching Cavite address was found. Add a street, barangay, and city, or place the pin manually.');
        return;
      }
      applyLocation(location);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('This device does not support location services. Search or place the pin manually.');
      return;
    }
    setLoading(true);
    setMessage('Finding your current location...');
    navigator.geolocation.getCurrentPosition(
      location => inspectPosition(location.coords.latitude, location.coords.longitude),
      () => {
        setLoading(false);
        setMessage('Location permission was not available. Search or place the pin manually.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="store-address-search">Search store address</label>
        <input
          id="store-address-search"
          className="input-premium flex-1"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              searchAddress();
            }
          }}
          placeholder="Search street, barangay, and city in Cavite"
        />
        <button type="button" onClick={searchAddress} disabled={loading} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[9px] font-black uppercase text-white disabled:opacity-50">
          <Search className="h-4 w-4" /> {loading ? 'Checking...' : 'Search'}
        </button>
        <button type="button" onClick={useCurrentLocation} disabled={loading} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[9px] font-black uppercase text-slate-700 disabled:opacity-50">
          <LocateFixed className="h-4 w-4" /> Use my location
        </button>
      </div>

      <div className="h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" role="application" aria-label="OpenStreetMap for selecting the store location">
        <MapContainer center={position} zoom={15} maxBounds={CAVITE_BOUNDS} maxBoundsViscosity={1} className="h-full w-full">
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          />
          <StoreMarker position={position} onPositionChanged={inspectPosition} />
          <MapController position={position} />
        </MapContainer>
      </div>

      <div className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${candidate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div>
          <p className="flex items-start gap-2 text-[10px] font-bold leading-relaxed text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>
          <p className="mt-1 pl-6 text-[8px] font-semibold text-slate-500">Map data &copy; OpenStreetMap contributors. No paid map key is required.</p>
        </div>
        <button type="button" disabled={!candidate || loading} onClick={() => onLocationSelected(candidate)} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-[8px] font-black uppercase text-white disabled:opacity-40">
          <Check className="h-3 w-3" /> Confirm location
        </button>
      </div>
    </div>
  );
};

export default OpenStreetMapLocationPicker;
