import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Navigation, MapPin, Maximize2 } from 'lucide-react';

const GoogleMap = ({ 
  address, 
  storeName, 
  onCoordinatesUpdate, 
  coordinates: propCoordinates, 
  onDirectionsClick,
  onViewOnMapClick,
  className = '' 
}) => {
  const [coordinates, setCoordinates] = useState(propCoordinates || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mapRef = useRef(null);

  // Sync with prop coordinates
  useEffect(() => {
    if (propCoordinates) {
      setCoordinates({
        lat: propCoordinates.lat,
        lon: propCoordinates.lng || propCoordinates.lon
      });
      setLoading(false);
    }
  }, [propCoordinates]);

  // Geocode address using free Nominatim API (OpenStreetMap)
  useEffect(() => {
    // If we already have accurate coordinates from props or a previous search, don't re-geocode
    if (propCoordinates) return;
    
    if (!address) {
      setError('No address provided');
      setLoading(false);
      return;
    }

    const geocodeAddress = async () => {
      try {
        setLoading(true);
        const cleanAddress = address.trim();
        const query = cleanAddress.toLowerCase().includes('philippines') 
          ? cleanAddress 
          : `${cleanAddress}, Philippines`;
          
        const encodedAddress = encodeURIComponent(query);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'PetShopPlatform/1.0'
            }
          }
        );
        const data = await response.json();

        if (data && data.length > 0) {
          const newCoords = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon)
          };
          setCoordinates({ lat: newCoords.lat, lon: newCoords.lng });
          if (onCoordinatesUpdate) {
            onCoordinatesUpdate(newCoords);
          }
          setError(null);
        } else {
          if (query.includes('blk') || query.includes('lot')) {
             const fallbackQuery = query.replace(/blk\s*\d+|lot\s*\d+/gi, '').trim().replace(/^,\s*/, '');
             const fbResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1`);
             const fbData = await fbResponse.json();
             if (fbData && fbData.length > 0) {
                const fbCoords = { lat: parseFloat(fbData[0].lat), lng: parseFloat(fbData[0].lon) };
                setCoordinates({ lat: fbCoords.lat, lon: fbCoords.lng });
                if (onCoordinatesUpdate) onCoordinatesUpdate(fbCoords);
                setError(null);
                return;
             }
          }
          setCoordinates(null);
          setError(null);
        }
      } catch (err) {
        console.error('Geocode error:', err);
        setCoordinates(null);
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    geocodeAddress();
  }, [address, propCoordinates]);

  const getDirectionsUrl = () => {
    if (coordinates) {
      return `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lon || coordinates.lng}`;
    }
    if (!address) return '#';
    const encodedAddress = encodeURIComponent(address);
    return `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
  };

  const getViewOnMapUrl = () => {
    if (coordinates) {
      return `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lon || coordinates.lng}`;
    }
    if (!address) return '#';
    const encodedAddress = encodeURIComponent(address);
    return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  };

  const getOpenStreetMapEmbedUrl = () => {
    if (coordinates) {
      // Use coordinates-based embed for precision
      const bbox = `${coordinates.lon - 0.005},${coordinates.lat - 0.003},${coordinates.lon + 0.005},${coordinates.lat + 0.003}`;
      return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coordinates.lat},${coordinates.lon}`;
    }
    return null;
  };

  if (!address) {
    return (
      <div className={`bg-slate-50 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-4 ${className}`}>
        <MapPin className="h-10 w-10 text-slate-200" />
        <p className="text-slate-400 font-bold text-sm">No address available</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Map Embed Container */}
      <div className="rounded-[2.5rem] overflow-hidden border border-slate-100 bg-slate-50 relative shadow-sm" style={{ minHeight: '320px' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-20">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 border-4 border-primary-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
              </div>
              <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.3em] animate-pulse">Syncing Location...</span>
            </div>
          </div>
        )}

        {coordinates ? (
          <iframe
            ref={mapRef}
            title={`Map of ${storeName || address}`}
            src={getOpenStreetMapEmbedUrl()}
            width="100%"
            height="100%"
            style={{ border: 0, minHeight: '320px' }}
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-8">
            <div className="w-20 h-20 bg-primary-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner ring-4 ring-white">
              <MapPin className="h-10 w-10 text-primary-600 drop-shadow-sm" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-black text-slate-800 uppercase tracking-tighter leading-tight">
                {storeName || 'Base Location'}
              </p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed max-w-xs mx-auto">
                {address}
              </p>
            </div>
            
            {!loading && (
              <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-xl border border-amber-100">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Manual calibration recommended</span>
              </div>
            )}
          </div>
        )}

        {/* Floating expand button */}
        {coordinates && !loading && (
          <a
            href={getViewOnMapUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-6 right-6 p-4 bg-white/90 backdrop-blur-md text-primary-600 rounded-2xl shadow-xl border border-white hover:scale-110 active:scale-95 transition-all z-10 group"
          >
            <Maximize2 className="h-5 w-5 group-hover:rotate-12 transition-transform" />
          </a>
        )}
      </div>

      {/* Map Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={getDirectionsUrl()}
          onClick={(e) => {
            if (onDirectionsClick) {
                e.preventDefault();
                onDirectionsClick();
            }
          }}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-3 px-8 py-5 bg-primary-600 text-white rounded-[1.8rem] font-black uppercase tracking-[0.2em] text-[10px] hover:bg-primary-500 transition-all shadow-xl shadow-primary-900/10 hover:shadow-primary-600/20 hover:-translate-y-0.5 active:scale-95"
        >
          <Navigation className="h-4 w-4" />
          Open Directions
        </a>
        <a
          href={getViewOnMapUrl()}
          onClick={(e) => {
            if (onViewOnMapClick) {
                e.preventDefault();
                onViewOnMapClick();
            }
          }}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 sm:flex-[0.6] flex items-center justify-center gap-3 px-8 py-5 bg-slate-900 text-white rounded-[1.8rem] font-black uppercase tracking-[0.2em] text-[10px] hover:bg-black transition-all shadow-xl hover:-translate-y-0.5 active:scale-95"
        >
          <ExternalLink className="h-4 w-4" />
          View on Map
        </a>
      </div>
    </div>
  );
};

export default GoogleMap;
