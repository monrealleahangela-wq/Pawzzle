import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, MapPin, Check, X, AlertCircle, Search, LocateFixed } from 'lucide-react';
import { toast } from 'react-toastify';

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

const MapPicker = ({ onLocationSelected, initialAddress = '', className = '' }) => {
  const [position, setPosition] = useState([14.3121, 120.9326]); // Center of Cavite (Dasma area)
  const [address, setAddress] = useState(initialAddress);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [tempLocation, setTempLocation] = useState(null);

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
        toast.warning('Base operations must be within Cavite boundaries.');
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
      toast.error('Intelligence gathering failed. Try manual input.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleLocationDetection = () => {
    if (!navigator.geolocation) {
      toast.error('GPS Protocol not supported by this device.');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const result = await reverseGeocode(latitude, longitude);
        if (result) {
          setTempLocation({ lat: latitude, lng: longitude, ...result });
          setPosition([latitude, longitude]);
          setShowConfirm(true);
        }
      },
      () => {
        setLoading(false);
        toast.error('GPS Signal lost or denied.');
      },
      { enableHighAccuracy: true }
    );
  };

  const LocationMarker = () => {
    useMapEvents({
      click: async (e) => {
        const { lat, lng } = e.latlng;
        const result = await reverseGeocode(lat, lng);
        if (result) {
          setTempLocation({ lat, lng, ...result });
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
          setTempLocation({ lat, lng, ...result });
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
      setShowConfirm(false);
      toast.success('Location calibrated successfully.');
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
          {loading ? 'CALIBRATING...' : 'USE CURRENT GPS LOCATION'}
        </button>
      </div>

      <div className="relative rounded-[2.5rem] overflow-hidden border border-slate-100 bg-slate-50 shadow-inner" style={{ height: '350px', zIndex: 0 }}>
        <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <LocationMarker />
          <MapController center={position} />
        </MapContainer>

        <div className="absolute top-4 left-4 z-[1000] p-3 bg-white/90 backdrop-blur-md rounded-xl border border-white shadow-xl max-w-[200px]">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Info className="h-2 w-2" /> Sector Directive
          </p>
          <p className="text-[9px] font-bold text-slate-600 leading-tight uppercase">
            Click or drag marker to fine-tune your base location within Cavite.
          </p>
        </div>

        {/* Confirmation Overlay */}
        {showConfirm && tempLocation && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border border-white/20 transform scale-100">
              <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center mb-6">
                <MapPin className="h-6 w-6 text-primary-600" />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">Is this your base?</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 leading-relaxed">
                {tempLocation.full}
              </p>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  <Check className="h-4 w-4" /> CONFIRM
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <X className="h-4 w-4" /> CHANGE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {address && !showConfirm && (
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Check className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">Sector Captured</p>
            <p className="text-[10px] font-bold text-emerald-600 uppercase truncate">{address}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPicker;
