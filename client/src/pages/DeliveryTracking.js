import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { 
  MapPin, Phone, MessageSquare, Navigation, CheckCircle, Package, Truck, 
  Clock, ArrowLeft, Send, User, Store as StoreIcon, ShieldCheck, AlertCircle,
  Map as MapIcon, Info, Navigation2
} from 'lucide-react';
import { Popup } from 'react-leaflet';
import socket from '../utils/socket';
import { toast } from 'react-toastify';

// Define custom icons for the map
const riderIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2972/2972147.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

const storeIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/610/610413.png',
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

const homeIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/25/25694.png',
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

// Helper component to center map on coordinates
function RecenterMap({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.lat && coords.lng) {
      map.setView([coords.lat, coords.lng], 16);
    }
  }, [coords, map]);
  return null;
}

const DeliveryTracking = () => {
  const { token } = useParams();
  const location = useLocation();
  const [delivery, setDelivery] = useState(null);
  const [role, setRole] = useState(null); // 'rider' or 'customer'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [routeData, setRouteData] = useState(null);
  const [directions, setDirections] = useState([]);
  const [showDirections, setShowDirections] = useState(false);
  const chatEndRef = useRef(null);
  
  const isRiderRoute = location.pathname.includes('/rider-track/');

  useEffect(() => {
    fetchDelivery();
    
    socket.connect();
    
    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (delivery) {
      socket.emit('joinDelivery', delivery._id);
      
      socket.on('locationUpdate', (data) => {
        setDelivery(prev => ({
          ...prev,
          riderLocation: { ...prev.riderLocation, lat: data.lat, lng: data.lng, lastUpdated: new Date() },
          locationHistory: [...(prev.locationHistory || []), { lat: data.lat, lng: data.lng }]
        }));
      });

      socket.on('statusChanged', (data) => {
        setDelivery(prev => ({ ...prev, status: data.status }));
        toast.info(`Delivery Status Updated: ${data.status.replace('_', ' ').toUpperCase()}`);
      });

      socket.on('newMessage', (data) => {
        setDelivery(prev => ({ ...prev, chat: [...(prev.chat || []), data] }));
        if (!chatOpen) toast.info(`New message from ${data.sender}`);
      });
    }

    return () => {
      socket.off('locationUpdate');
      socket.off('statusChanged');
      socket.off('newMessage');
    };
  }, [delivery?._id]);

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [delivery?.chat, chatOpen]);

  // GPS Tracking for Rider
  useEffect(() => {
    let watchId;
    if (delivery && role === 'rider' && delivery.isLive) {
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, heading, speed } = pos.coords;
            updateRiderLocation(latitude, longitude, heading, speed);
          },
          (err) => console.error('GPS Error:', err),
          { enableHighAccuracy: true, maximumAge: 10000 }
        );
      }
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [delivery?._id, role]);

  const fetchDelivery = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL || '/api'}/deliveries/track/${token}`);
      setDelivery(res.data.delivery);
      setRole(res.data.role);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to initialize tracking.');
    } finally {
      setLoading(false);
    }
  };

  // Compute Target Information
  const storeCoords = delivery?.order?.store?.contactInfo?.address?.coordinates;
  const customerCoords = delivery?.order?.shippingAddress?.coordinates;
  const isToStore = delivery?.status === 'pending' || delivery?.status === 'picked_up';
  
  const targetCoords = isToStore ? storeCoords : customerCoords;
  const targetLabel = isToStore ? 'Pickup: Store' : 'Delivery: Customer';
  const targetAddress = isToStore 
    ? `${delivery?.order?.store?.name} (Store)`
    : `${delivery?.order?.shippingAddress?.street}, ${delivery?.order?.shippingAddress?.barangay}`;
  const targetPhone = isToStore ? delivery?.order?.store?.phone : delivery?.order?.customer?.phoneNumber;

  useEffect(() => {
    if (delivery?.riderLocation?.lat && targetCoords?.lat) {
      fetchRoute(
        delivery.riderLocation.lat, 
        delivery.riderLocation.lng, 
        targetCoords.lat, 
        targetCoords.lng
      );
    }
  }, [delivery?._id, targetCoords?.lat]);

  const updateRiderLocation = async (lat, lng, heading, speed) => {
    try {
      socket.emit('updateLocation', { deliveryId: delivery._id, lat, lng, heading, speed });
      await axios.patch(`${process.env.REACT_APP_API_URL || '/api'}/deliveries/location/${token}`, { lat, lng, heading, speed });
      
      // Update directions if destination exists
      if (targetCoords?.lat) {
        fetchRoute(lat, lng, targetCoords.lat, targetCoords.lng);
      }
    } catch (err) {
      console.error('Location sync failed');
    }
  };

  const fetchRoute = async (startLat, startLng, endLat, endLng) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;
      const res = await axios.get(url);
      if (res.data.routes && res.data.routes[0]) {
        const route = res.data.routes[0];
        setRouteData(route.geometry.coordinates.map(c => [c[1], c[0]]));
        setDirections(route.legs[0].steps.map(s => ({
          instruction: s.maneuver.instruction,
          distance: s.distance,
          name: s.name
        })));
      }
    } catch (err) {
      console.error('Routing failed:', err);
    }
  };

  const handleStatusUpdate = async (status) => {
    try {
      await axios.patch(`${process.env.REACT_APP_API_URL || '/api'}/deliveries/status/${token}`, { status });
      socket.emit('statusUpdate', { deliveryId: delivery._id, status });
      setDelivery(prev => ({ ...prev, status }));
      toast.success(`Success: En route to ${status.replace('_', ' ')}!`);
    } catch (err) {
      toast.error('Failed to update status.');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    const msgData = { sender: role, content: newMessage, timestamp: new Date() };
    try {
      socket.emit('sendMessage', { deliveryId: delivery._id, ...msgData });
      await axios.post(`${process.env.REACT_APP_API_URL || '/api'}/deliveries/chat/${token}`, msgData);
      setNewMessage('');
    } catch (err) {
      toast.error('Message failed to send.');
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
      <div className="w-16 h-16 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Initializing Tracking Hub...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-8 text-center">
      <div className="w-20 h-20 bg-rose-50 rounded-[2rem] flex items-center justify-center mb-6 text-rose-500">
        <ShieldCheck className="h-10 w-10" />
      </div>
      <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Secure Link Expired</h2>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest max-w-xs">{error}</p>
      <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">Retry Connection</button>
    </div>
  );

  const statusProgress = {
    pending: 10,
    picked_up: 40,
    in_transit: 70,
    delivered: 100
  };


  return (
    <div className="flex flex-col min-h-[100dvh] bg-slate-50 overflow-hidden font-inter">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 p-5 shrink-0 z-30 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 text-white rounded-xl">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Order Tracking</p>
              <h3 className="text-xs font-black uppercase tracking-tight text-slate-900">Ref: {delivery.order?.orderNumber}</h3>
            </div>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border-2 ${
            delivery.status === 'delivered' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
            'bg-rose-50 border-rose-100 text-rose-600 animate-pulse'
          }`}>
            {delivery.status.replace('_', ' ')}
          </div>
        </div>
      </header>

      {/* Map Content */}
      <main className="flex-1 relative z-10 bg-slate-100 flex flex-col min-h-0">
        <MapContainer 
          center={[delivery.riderLocation?.lat || 14.5995, delivery.riderLocation?.lng || 120.9842]} 
          zoom={16} 
          style={{ height: '100%', width: '100%', position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          zoomControl={false}
        >
          <TileLayer 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          />
          <RecenterMap coords={delivery.riderLocation} />
          
          {/* Marker Logic */}
          {delivery.riderLocation?.lat && (
            <Marker position={[delivery.riderLocation.lat, delivery.riderLocation.lng]} icon={riderIcon}>
              <Popup className="custom-popup">
                <div className="p-2 text-center">
                  <p className="text-[10px] font-black uppercase text-rose-500 mb-1">Rider</p>
                  <p className="text-[11px] font-bold text-slate-800">Cyrus the Great</p>
                </div>
              </Popup>
            </Marker>
          )}
          
          {storeCoords?.lat && (
            <Marker position={[storeCoords.lat, storeCoords.lng]} icon={storeIcon}>
              <Popup>
                <div className="p-2">
                  <p className="text-[10px] font-black uppercase text-primary-600 mb-1">Pickup Point</p>
                  <p className="text-[11px] font-bold text-slate-800">{delivery.order?.store?.name}</p>
                  <p className="text-[9px] text-slate-500 font-medium">{delivery.order?.store?.contactInfo?.address?.street}</p>
                </div>
              </Popup>
            </Marker>
          )}
          
          {customerCoords?.lat && (
            <Marker position={[customerCoords.lat, customerCoords.lng]} icon={homeIcon}>
              <Popup>
                <div className="p-2">
                  <p className="text-[10px] font-black uppercase text-emerald-600 mb-1">Delivery Point</p>
                  <p className="text-[11px] font-bold text-slate-800">{delivery.order?.customer?.firstName} {delivery.order?.customer?.lastName}</p>
                  <p className="text-[9px] text-slate-500 font-medium">{delivery.order?.shippingAddress?.street}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* ROAD-FOLLOWING ROUTE LINE */}
          {routeData && (
            <Polyline 
              positions={routeData} 
              color="#3b82f6" 
              weight={6} 
              opacity={0.8}
            />
          )}

          {/* Fallback Direct Line if routing fails */}
          {!routeData && delivery.riderLocation?.lat && targetCoords?.lat && (
            <Polyline 
              positions={[
                [delivery.riderLocation.lat, delivery.riderLocation.lng],
                [targetCoords.lat, targetCoords.lng]
              ]} 
              color="#3b82f6" 
              weight={4} 
              dashArray="5, 10" 
              opacity={0.5}
            />
          )}

          {/* Route History (Breadcrumbs) */}
          <Polyline positions={(delivery.locationHistory || []).map(l => [l.lat, l.lng])} color="#64748b" weight={2} opacity={0.3} />
        </MapContainer>
        
        {/* Floating Controls (Mobile Bottom Sheet Style) */}
        {!chatOpen && (
          <div className="absolute bottom-4 left-4 right-4 z-40 space-y-3">
            {/* Real-time Status Overlay */}
            <div className="bg-white/80 backdrop-blur-md p-6 rounded-[2.5rem] border border-white/50 shadow-2xl flex flex-col gap-6">
              {/* Progress Bar */}
              <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="absolute left-0 top-0 h-full bg-rose-500 transition-all duration-1000" 
                  style={{ width: `${statusProgress[delivery.status]}%` }}
                />
              </div>

              {/* Action/Info Buttons */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h4 className="text-[10px] font-black uppercase text-rose-500 mb-1">{targetLabel}</h4>
                  <p className="text-xs font-bold truncate text-slate-800">{targetAddress}</p>
                </div>
                <div className="flex gap-2">
                  {role === 'rider' && (
                    <button 
                      onClick={() => setShowDirections(!showDirections)}
                      className={`p-4 rounded-2xl transition-all shadow-lg active:scale-95 ${showDirections ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                      title="Show Turn-by-Turn"
                    >
                      <Navigation2 className="h-5 w-5" />
                    </button>
                  )}
                  {role === 'rider' && (
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${targetCoords?.lat || ''},${targetCoords?.lng || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                      title={`Navigate Outside`}
                    >
                      <Navigation className="h-5 w-5" />
                    </a>
                  )}
                  <a href={`tel:${role === 'rider' ? delivery.order?.customer?.phoneNumber : delivery.order?.store?.phoneNumber}`} 
                    className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-rose-50 transition-all shadow-lg active:scale-95">
                    <Phone className="h-5 w-5" />
                  </a>
                  <button onClick={() => setChatOpen(true)} className="p-4 bg-rose-500 text-white rounded-2xl hover:rotate-12 transition-all shadow-xl shadow-rose-200">
                    <MessageSquare className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Turn-by-Turn Directions Panel */}
              {showDirections && directions.length > 0 && (
                <div className="max-h-48 overflow-y-auto no-scrollbar py-2 space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-2">Turn-by-Turn Guide</p>
                  {directions.map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                        <Navigation className={`h-3 w-3 text-primary-600 ${i === 0 ? 'animate-bounce' : ''}`} />
                      </div>
                      <div>
                        <p className={`text-[11px] leading-tight ${i === 0 ? 'font-black text-slate-900' : 'font-bold text-slate-500'}`}>
                          {step.instruction}
                        </p>
                        <p className="text-[9px] font-medium text-slate-400">
                          {step.distance > 1000 ? `${(step.distance/1000).toFixed(1)} km` : `${Math.round(step.distance)} m`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Rider Only controls */}
              {role === 'rider' && delivery.isLive && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {delivery.status === 'pending' && (
                    <button onClick={() => handleStatusUpdate('picked_up')} className="col-span-2 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3">
                      <Package className="h-4 w-4" /> Start Pickup
                    </button>
                  )}
                  {delivery.status === 'picked_up' && (
                    <button onClick={() => handleStatusUpdate('in_transit')} className="col-span-2 py-4 bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3">
                      <Navigation className="h-4 w-4" /> Start Transit
                    </button>
                  )}
                  {delivery.status === 'in_transit' && (
                    <button onClick={() => handleStatusUpdate('delivered')} className="col-span-2 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3">
                      <CheckCircle className="h-4 w-4" /> Confirm Delivered
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Chat Interface (Slide Up) */}
      <div className={`fixed inset-0 z-50 transition-transform duration-500 ${chatOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setChatOpen(false)}></div>
        <div className="absolute bottom-0 left-0 right-0 h-[80vh] bg-white rounded-t-[3rem] shadow-2xl flex flex-col p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tighter">Delivery Chat</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Direct channel to {role === 'rider' ? 'Customer' : 'Rider'}</p>
            </div>
            <button onClick={() => setChatOpen(false)} className="p-3 bg-slate-100 rounded-2xl text-slate-400 hover:text-rose-500 transition-colors">
              <ArrowLeft className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 mb-6 pr-2">
            {(delivery.chat || []).map((msg, i) => (
              <div key={i} className={`flex ${msg.sender === role ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-4 rounded-3xl ${
                  msg.sender === role 
                    ? 'bg-rose-500 text-white rounded-tr-none shadow-lg' 
                    : 'bg-slate-100 text-slate-700 rounded-tl-none'
                }`}>
                  <p className="text-sm font-medium">{msg.content}</p>
                  <p className={`text-[8px] mt-1 font-bold uppercase opacity-40 ${msg.sender === role ? 'text-white text-right' : 'text-slate-400'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendMessage} className="flex gap-2">
            <input 
              type="text" 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Aa message..."
              className="flex-1 bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-rose-500/5 transition-all"
            />
            <button type="submit" className="bg-slate-900 text-white p-4 rounded-2xl hover:bg-rose-500 transition-all shadow-xl active:scale-95">
              <Send className="h-6 w-6" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DeliveryTracking;
