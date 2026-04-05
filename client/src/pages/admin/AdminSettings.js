import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userService, storeService } from '../../services/apiService';
import {
  DollarSign,
  Truck,
  Save,
  Settings,
  Shield,
  Zap,
  Globe,
  Settings2,
  Building,
  CheckCircle,
  AlertCircle,
  Clock,
  Calendar,
  ChevronRight,
  Clock3,
  Timer,
  Users,
  XCircle,
  Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const AdminSettings = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('global'); // 'global' or 'booking'
  const [globalSettings, setGlobalSettings] = useState({
    freeShipping: true,
    shippingFee: 0,
    freeShippingThreshold: 0
  });
  
  const [storeSettings, setStoreSettings] = useState({
    businessHours: {
      monday: { open: '09:00', close: '17:00', closed: false },
      tuesday: { open: '09:00', close: '17:00', closed: false },
      wednesday: { open: '09:00', close: '17:00', closed: false },
      thursday: { open: '09:00', close: '17:00', closed: false },
      friday: { open: '09:00', close: '17:00', closed: false },
      saturday: { open: '09:00', close: '17:00', closed: true },
      sunday: { open: '09:00', close: '17:00', closed: true }
    },
    bookingSettings: {
      slotDuration: 60,
      bufferTime: 15,
      maxBookingsPerSlot: 1
    }
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [globalRes, storeRes] = await Promise.all([
        userService.getAdminSettings(),
        storeService.getSettings()
      ]);
      
      if (globalRes.data) setGlobalSettings(globalRes.data);
      if (storeRes.data?.settings) setStoreSettings(prev => ({ ...prev, ...storeRes.data.settings }));
      else if (storeRes.data) setStoreSettings(prev => ({ ...prev, ...storeRes.data }));
      
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load all settings');
    }
  };

  const handleSaveGlobal = async () => {
    setLoading(true);
    try {
      await userService.updateAdminSettings(globalSettings);
      toast.success('Global settings saved');
    } catch (error) {
      toast.error('Failed to save global settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStore = async () => {
    setLoading(true);
    try {
      await storeService.updateSettings(storeSettings);
      toast.success('Store & booking settings updated');
    } catch (error) {
      toast.error('Failed to save store settings');
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalChange = (field, value) => {
    setGlobalSettings(prev => ({
      ...prev,
      [field]: field === 'freeShipping' ? value : Number(value)
    }));
  };

  const handleHoursChange = (day, field, value) => {
    setStoreSettings(prev => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: { ...prev.businessHours[day], [field]: value }
      }
    }));
  };

  const handleBookingChange = (field, value) => {
    setStoreSettings(prev => ({
      ...prev,
      bookingSettings: { ...prev.bookingSettings, [field]: Number(value) }
    }));
  };

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-100 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="h-3.5 w-3.5 text-primary-600" />
            <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMINISTRATION PROTOCOL</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
            Control <span className="text-primary-600">Center</span>
          </h1>
        </div>
        <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-full sm:w-auto">
          <button onClick={() => setActiveTab('global')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'global' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>General</button>
          <button onClick={() => setActiveTab('booking')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'booking' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Booking Schedule</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          {activeTab === 'global' ? (
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-10 animate-in slide-in-from-left-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center"><Truck className="h-6 w-6" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Logistics & Fees</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global shipping parameters</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <div className="space-y-1">
                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Complimentary Shipping</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Toggle zero-fee delivery globally</p>
                  </div>
                  <button 
                    onClick={() => handleGlobalChange('freeShipping', !globalSettings.freeShipping)}
                    className={`w-14 h-8 rounded-full transition-all relative p-1 ${globalSettings.freeShipping ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${globalSettings.freeShipping ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {!globalSettings.freeShipping && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in-95">
                    <div className="p-6 bg-white border border-slate-100 rounded-3xl">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-3">Base Delivery Fee</label>
                      <div className="flex items-center gap-3">
                         <span className="text-lg font-black text-slate-300">₱</span>
                         <input type="number" value={globalSettings.shippingFee} onChange={(e) => handleGlobalChange('shippingFee', e.target.value)} className="w-full text-xl font-black bg-transparent outline-none" />
                      </div>
                    </div>
                    <div className="p-6 bg-white border border-slate-100 rounded-3xl">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-3">Free Shipping Threshold</label>
                      <div className="flex items-center gap-3">
                         <span className="text-lg font-black text-slate-300">₱</span>
                         <input type="number" value={globalSettings.freeShippingThreshold} onChange={(e) => handleGlobalChange('freeShippingThreshold', e.target.value)} className="w-full text-xl font-black bg-transparent outline-none" />
                      </div>
                    </div>
                  </div>
                )}
                
                <button onClick={handleSaveGlobal} disabled={loading} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-primary-600 transition-all flex items-center justify-center gap-3 shadow-xl">
                   {loading ? <Zap className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Global Registry
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-10 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center"><Calendar className="h-6 w-6" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Availability Protocol</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Define your booking service hours</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Timer className="h-3 w-3" /> Slot Duration</p>
                    <select 
                      value={storeSettings.bookingSettings.slotDuration} 
                      onChange={(e) => handleBookingChange('slotDuration', e.target.value)}
                      className="w-full bg-transparent font-black text-sm outline-none"
                    >
                      <option value="30">30 MINS</option>
                      <option value="60">60 MINS</option>
                      <option value="90">90 MINS</option>
                      <option value="120">120 MINS</option>
                    </select>
                  </div>
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Settings className="h-3 w-3" /> Buffer Time</p>
                    <select 
                      value={storeSettings.bookingSettings.bufferTime} 
                      onChange={(e) => handleBookingChange('bufferTime', e.target.value)}
                      className="w-full bg-transparent font-black text-sm outline-none"
                    >
                      <option value="0">0 MINS</option>
                      <option value="15">15 MINS</option>
                      <option value="30">30 MINS</option>
                    </select>
                  </div>
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Users className="h-3 w-3" /> Concurrency</p>
                    <input 
                      type="number" 
                      value={storeSettings.bookingSettings.maxBookingsPerSlot} 
                      onChange={(e) => handleBookingChange('maxBookingsPerSlot', e.target.value)}
                      className="w-full bg-transparent font-black text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-4">Working Cycle (Per Day)</p>
                  <div className="space-y-2">
                    {days.map(day => {
                      const hours = storeSettings.businessHours[day];
                      return (
                        <div key={day} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${hours.closed ? 'bg-slate-50/50 border-slate-100 opacity-50' : 'bg-white border-slate-100 shadow-sm'}`}>
                           <div className="flex items-center gap-4 w-32">
                              <button 
                                type="button"
                                onClick={() => handleHoursChange(day, 'closed', !hours.closed)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${hours.closed ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}
                              >
                                {hours.closed ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                              </button>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{day}</span>
                           </div>
                           
                           {!hours.closed && (
                             <div className="flex items-center gap-4 animate-in fade-in">
                               <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl">
                                  <Clock3 className="h-3 w-3 text-slate-400" />
                                  <input type="time" value={hours.open} onChange={(e) => handleHoursChange(day, 'open', e.target.value)} className="bg-transparent text-[10px] font-black outline-none" />
                               </div>
                               <span className="text-slate-300">/</span>
                               <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl">
                                  <Clock3 className="h-3 w-3 text-slate-400" />
                                  <input type="time" value={hours.close} onChange={(e) => handleHoursChange(day, 'close', e.target.value)} className="bg-transparent text-[10px] font-black outline-none" />
                               </div>
                             </div>
                           )}
                           
                           {hours.closed && (
                             <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Operation Suspended</span>
                           )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <button onClick={handleSaveStore} disabled={loading} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-primary-600 transition-all flex items-center justify-center gap-3 shadow-xl">
                   {loading ? <Zap className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Commit Availability
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
            <Globe className="absolute -bottom-10 -right-10 w-48 h-48 opacity-10" />
            <div className="relative z-10 space-y-8">
              <div>
                <h3 className="text-[11px] font-black text-primary-500 uppercase tracking-[0.4em] mb-6">Store Identity</h3>
                <div className="flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-2xl">
                   <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center"><Building className="h-6 w-6" /></div>
                   <div>
                      <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-0.5">Commercial Name</p>
                      <p className="text-lg font-black tracking-tighter truncate">{user?.store?.name || 'Not Linked'}</p>
                   </div>
                </div>
              </div>

              <div>
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Integrity Verification</h4>
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
                   <Shield className="h-5 w-5" />
                   <span className="text-[10px] font-black uppercase tracking-widest">{user?.store?.verificationStatus || 'Level 1 Verified'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 bg-primary-50 rounded-[2.5rem] border border-primary-100">
             <h4 className="text-[11px] font-black text-primary-900 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Info className="h-4 w-4" /> System Advice
             </h4>
             <p className="text-[10px] font-medium leading-relaxed text-primary-800/70 uppercase">
                Updating your booking schedule will automatically adjust available slots for your customers. Confirmed bookings will remain locked in the timeline.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
