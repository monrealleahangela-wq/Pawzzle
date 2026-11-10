import React, { useState, useEffect } from 'react';
import { Circle, MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Check, X, LocateFixed, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  getAccurateCurrentPosition,
  getLocationErrorMessage
} from '../utils/geolocationAccuracy';

// Fix for Leaflet default icon issues in React
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Cavite Bounding Box (Roughly)
const CAVITE_BOUNDS = {
  minLat: 14.1,
  maxLat: 14.50,
  minLng: 120.6,
  maxLng: 121.1
};

const isWithinCavite = (lat, lng) => {
  return lat >= CAVITE_BOUNDS.minLat && 
         lat <= CAVITE_BOUNDS.maxLat && 
         lng >= CAVITE_BOUNDS.minLng && 
         lng <= CAVITE_BOUNDS.maxLng;
};

// Component to handle map centering and movement
const MapController = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 15);
  }, [center, map]);
  return null;
};

const validCoordinates = coordinates => {
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180;
};

const MapPicker = ({ onLocationSelected, initialAddress = '', initialCoordinates, className = '' }) => {
  const initialLat = initialCoordinates?.lat;
  const initialLng = initialCoordinates?.lng;
  const confirmedInitialCoordinates = validCoordinates({ lat: initialLat, lng: initialLng })
    ? { lat: Number(initialLat), lng: Number(initialLng) }
    : null;
  const [position, setPosition] = useState(
    confirmedInitialCoordinates
      ? [confirmedInitialCoordinates.lat, confirmedInitialCoordinates.lng]
      : [14.3121, 120.9326]
  ); // Map viewport fallback only; never persisted as the customer's location.
  const [address, setAddress] = useState(confirmedInitialCoordinates ? initialAddress : '');
  const [locationConfirmed, setLocationConfirmed] = useState(Boolean(confirmedInitialCoordinates));
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [tempLocation, setTempLocation] = useState(null);
  const [accuracyMeters, setAccuracyMeters] = useState(null);

  useEffect(() => {
    if (!validCoordinates({ lat: initialLat, lng: initialLng })) return;
    const next = [Number(initialLat), Number(initialLng)];
    setPosition(next);
    setAddress(initialAddress);
    setLocationConfirmed(true);
  }, [initialAddress, initialLat, initialLng]);

  // Geocode initialAddress on mount
  useEffect(() => {
    if (!validCoordinates({ lat: initialLat, lng: initialLng }) && initialAddress && initialAddress !== 'N/A') {
      const geocodeInitial = async () => {
        try {
          const query = initialAddress.toLowerCase().includes('cavite') 
            ? initialAddress 
            : `${initialAddress}, Cavite, Philippines`;
          const encoded = encodeURIComponent(query);
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`);
          const data = await response.json();
          if (data && data.length > 0) {
            setPosition([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
          }
        } catch (error) {
          console.error('Initial geocode failed:', error);
        }
      };
      geocodeInitial();
    }
  }, [initialAddress, initialLat, initialLng]);

  // Reverse geocoding using Nominatim
  const reverseGeocode = async (lat, lng) => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'PawzzleAddressPicker/1.0' } }
      );
      const data = await response.json();
      
      // Check if result is in Cavite
      const isCaviteState = data.address?.state?.toLowerCase().includes('cavite') || 
                            data.address?.region?.toLowerCase().includes('cavite') ||
                            data.display_name?.toLowerCase().includes('cavite');

      if (!isCaviteState && !isWithinCavite(lat, lng)) {
        toast.warning('Please choose a location within Cavite.');
        return null;
      }

      const formattedAddress = {
        street: data.address?.road || data.address?.suburb || '',
        city: data.address?.city || data.address?.town || data.address?.municipality || '',
        barangay: data.address?.neighbourhood || data.address?.village || '',
        zipCode: data.address?.postcode || '',
        full: data.display_name
      };

      return formattedAddress;
    } catch (err) {
      console.error('Geocoding error:', err);
      toast.error('We could not find that address. Try entering it manually.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleLocationDetection = async () => {
    if (!navigator.geolocation) {
      toast.error('This device does not support location services.');
      return;
    }

    setLoading(true);
    try {
      const location = await getAccurateCurrentPosition();
      const result = await reverseGeocode(location.lat, location.lng);
      if (result) {
        setAccuracyMeters(location.accuracy);
        setTempLocation({
          lat: location.lat,
          lng: location.lng,
          accuracyMeters: location.accuracy,
          locationSource: 'device_gps',
          ...result
        });
        setPosition([location.lat, location.lng]);
        setShowConfirm(true);
      }
    } catch (error) {
      if (error?.code === 'LOW_ACCURACY' && validCoordinates(error.bestPosition)) {
        const approximate = error.bestPosition;
        const result = await reverseGeocode(approximate.lat, approximate.lng);
        if (result) {
          setAccuracyMeters(approximate.accuracy);
          setTempLocation({
            lat: approximate.lat,
            lng: approximate.lng,
            accuracyMeters: approximate.accuracy,
            locationSource: 'device_gps_approximate',
            ...result
          });
          setPosition([approximate.lat, approximate.lng]);
          setShowConfirm(true);
          toast.info('We found your approximate area. Drag the pin or tap the map to place it exactly, then confirm.');
        }
      } else {
        toast.error(getLocationErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  const LocationMarker = () => {
    useMapEvents({
      click: async (e) => {
        const { lat, lng } = e.latlng;
        const result = await reverseGeocode(lat, lng);
        if (result) {
          setAccuracyMeters(null);
          setTempLocation({ lat, lng, locationSource: 'map_pin', ...result });
          setPosition([lat, lng]);
          setShowConfirm(true);
        }
      }
    });

    return position ? <Marker position={position} draggable={true} eventHandlers={{
      dragend: async (e) => {
        const { lat, lng } = e.target.getLatLng();
        const result = await reverseGeocode(lat, lng);
        if (result) {
          setAccuracyMeters(null);
          setTempLocation({ lat, lng, locationSource: 'map_pin', ...result });
          setPosition([lat, lng]);
          setShowConfirm(true);
        }
      }
    }} /> : null;
  };

  const handleConfirm = () => {
    if (tempLocation && onLocationSelected) {
      onLocationSelected(tempLocation);
      setAddress(tempLocation.full);
      setLocationConfirmed(true);
      setShowConfirm(false);
      toast.success('Location saved.');
    }
  };

  return (
    <div className={`space-y-4 animate-fade-in ${className}`}>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleLocationDetection}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-900 transition-all shadow-xl disabled:opacity-50 group"
        >
          <LocateFixed className="h-4 w-4 group-hover:scale-110 transition-transform" />
          {loading ? 'Finding location…' : 'Use current location'}
        </button>
      </div>

      <div className="relative rounded-[2.5rem] overflow-hidden border border-slate-100 bg-slate-50 shadow-inner" style={{ height: '350px', zIndex: 0 }}>
        <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {accuracyMeters && <Circle center={position} radius={accuracyMeters} pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.12, weight: 1 }} />}
          <LocationMarker />
          <MapController center={position} />
        </MapContainer>

        <div className="absolute top-4 left-4 z-[1000] p-3 bg-white/90 backdrop-blur-md rounded-xl border border-white shadow-xl max-w-[200px]">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Info className="h-2 w-2" /> Service area
          </p>
          <p className="text-[9px] font-bold text-slate-600 leading-tight uppercase">
            Click or drag marker to fine-tune your base location within Cavite.
          </p>
        </div>

        {/* Keep the map interactive so an approximate GPS result can be corrected. */}
        {showConfirm && tempLocation && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[2000] animate-fade-in">
            <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                  <MapPin className="h-5 w-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-black text-slate-900">Confirm delivery pin</h3>
                  <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold leading-relaxed text-slate-500">
                    {tempLocation.full}
                  </p>
                  <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[9px] font-bold ${tempLocation.locationSource === 'device_gps' ? 'bg-blue-50 text-blue-700' : tempLocation.locationSource === 'device_gps_approximate' ? 'bg-amber-50 text-amber-800' : 'bg-primary-50 text-primary-700'}`}>
                    {tempLocation.locationSource === 'device_gps'
                      ? `Precise GPS fix ±${Math.round(tempLocation.accuracyMeters)} m`
                      : tempLocation.locationSource === 'device_gps_approximate'
                        ? `Approximate GPS area ±${Math.round(tempLocation.accuracyMeters)} m — drag the pin or tap the map to correct it.`
                        : 'Pin placed manually on the map'}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4" /> Confirm this pin
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-200"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {locationConfirmed && address && !showConfirm && (
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Check className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">Location selected</p>
            <p className="text-[10px] font-bold text-emerald-600 uppercase truncate">{address}</p>
            {accuracyMeters && <p className="mt-1 text-[9px] font-bold text-blue-700">GPS accuracy: approximately ±{Math.round(accuracyMeters)} m</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPicker;
