import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { userService, storeService } from '../../services/apiService';
import { DollarSign, Truck, Save, Settings, Shield, Zap, Globe, Settings2, Building, CheckCircle, AlertCircle, Clock, Calendar, ChevronRight, Clock3, Timer, Users, XCircle, Info, Package, Heart, PlusCircle, UserCog, Bell, Palette } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatTime12h } from '../../utils/timeFormatters';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';

const AdminSettings = () => {
  const { user, updateUser } = useAuth();

  // Real-time Updates
  useRealTimeUpdates({
    onSettingsUpdate: (data) => {
      console.log('⚙️ Real-time settings update received:', data);
      fetchData();
      toast.info(`System settings updated in real-time.`);
    }
  });

  const [activeTab, setActiveTab] = useState('global'); // 'global' or 'booking'
  const [globalSettings, setGlobalSettings] = useState({
    freeShipping: true,
    shippingFee: 0,
    freeShippingThreshold: 0
  });
  
  const [storeSettings, setStoreSettings] = useState({
    operationalModules: ['pets', 'products', 'services'],
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
      maxBookingsPerSlot: 1,
      confirmationWindowMinutes: 1440
    }
  });
  const [taxConfiguration, setTaxConfiguration] = useState({
    isConfigured: false,
    taxStatus: 'non_vat',
    pricingMode: 'inclusive',
    vatRatePercent: 12,
    deliveryFeeTaxable: false
  });
  const [refundPolicy, setRefundPolicy] = useState({
    type: 'conditional_refund',
    summary: 'Refund requests are reviewed by the store according to the order or service circumstances.',
    conditions: ''
  });
  
  const [showExpansionModal, setShowExpansionModal] = useState(false);
  const [expansionData, setExpansionData] = useState({
    operationalModules: [],
    hiringStaff: false,
    staffTypes: [],
    supplierNeeds: false,
    inventoryPlans: '',
    productCategories: [],
    businessDescription: ''
  });
  const [expansionFiles, setExpansionFiles] = useState({
    licenseDocument: null,
    mayorsPermit: null,
    businessRegistration: null
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
      const storeData = storeRes.data?.store || storeRes.data?.settings || storeRes.data;
      if (storeData) {
        setStoreSettings(prev => ({ ...prev, ...storeData }));
        if (storeData.taxConfiguration) setTaxConfiguration(prev => ({ ...prev, ...storeData.taxConfiguration }));
        if (storeData.refundPolicy) setRefundPolicy(prev => ({ ...prev, ...storeData.refundPolicy }));
      }
      
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
      const response = await storeService.updateSettings(storeSettings);
      toast.success('Store & booking settings updated');
      
      if (user && user.store && response.data?.store) {
        updateUser({
          ...user,
          store: {
            ...user.store,
            ...response.data.store,
            operationalModules: response.data.store.operationalModules || storeSettings.operationalModules
          }
        });
      }
    } catch (error) {
      toast.error('Failed to save store settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTax = async () => {
    if (!window.confirm('Apply this tax configuration to new orders and bookings? Existing transaction records will not change.')) return;
    setLoading(true);
    try {
      const response = await storeService.updateTaxConfiguration(taxConfiguration);
      setTaxConfiguration(prev => ({ ...prev, ...response.data.taxConfiguration }));
      toast.success('Tax configuration updated for new transactions');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update tax configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRefundPolicy = async () => {
    if (refundPolicy.type === 'conditional_refund' && !refundPolicy.conditions.trim()) return toast.error('Describe the conditions used for refund review.');
    if (!window.confirm('Apply this refund policy to new orders and booking confirmations? Existing records will retain their saved policy.')) return;
    setLoading(true);
    try {
      const response = await storeService.updateRefundPolicy(refundPolicy);
      setRefundPolicy(prev => ({ ...prev, ...response.data.refundPolicy }));
      toast.success('Store refund policy updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update refund policy');
    } finally { setLoading(false); }
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
  const settingsGroups = [
    { label: 'Business', tabs: [['global', 'Store Info'], ['booking', 'Hours'], ['modules', 'Modules']] },
    { label: 'Financial', tabs: [['tax', 'VAT'], ['refund', 'Refunds']] },
    { label: 'Staff', tabs: [['staff', 'Workforce']] },
    { label: 'Notifications', tabs: [['notifications', 'Reminders']] },
    { label: 'Appearance', tabs: [['appearance', 'Branding']] }
  ];

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="h-3.5 w-3.5 text-primary-600" />
            <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMINISTRATION PROTOCOL</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
            Store <span className="text-primary-600">Settings</span>
          </h1>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {settingsGroups.map(group => <div key={group.label} className="flex items-center gap-1 rounded-xl bg-slate-50 p-1"><span className="px-2 text-[8px] font-black uppercase tracking-widest text-slate-400">{group.label}</span>{group.tabs.map(([value, label]) => <button key={value} type="button" onClick={() => setActiveTab(value)} className={`h-8 rounded-lg px-3 text-[10px] font-bold transition ${activeTab === value ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div>)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
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
          ) : activeTab === 'booking' ? (
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-10 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center"><Calendar className="h-6 w-6" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Availability Protocol</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Define your booking service hours</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Clock className="h-3 w-3" /> Customer Confirmation</p>
                    <select
                      value={storeSettings.bookingSettings.confirmationWindowMinutes || 1440}
                      onChange={(e) => handleBookingChange('confirmationWindowMinutes', e.target.value)}
                      className="w-full bg-transparent font-black text-sm outline-none"
                    >
                      <option value="60">1 HOUR</option>
                      <option value="360">6 HOURS</option>
                      <option value="720">12 HOURS</option>
                      <option value="1440">24 HOURS</option>
                      <option value="2880">48 HOURS</option>
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

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-2">Operational Working Protocol (Per Cycle)</p>
                  <div className="grid grid-cols-1 gap-4">
                    {days.map(day => {
                      const hours = storeSettings.businessHours[day];
                      return (
                        <div key={day} className={`group relative flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-[1.8rem] border transition-all gap-5 sm:gap-2 ${hours.closed ? 'bg-slate-50/50 border-slate-100 opacity-60' : 'bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-primary-100'}`}>
                           {/* Left Segment: Identity & Control */}
                           <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-start w-full sm:w-auto">
                              <div className="flex items-center gap-3">
                                 <button 
                                   type="button"
                                   onClick={() => handleHoursChange(day, 'closed', !hours.closed)}
                                   className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-sm ${hours.closed ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}
                                 >
                                   {hours.closed ? <XCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
                                 </button>
                                 <span className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-900 group-hover:text-primary-600 transition-colors">{day}</span>
                              </div>
                              <div className="sm:hidden">
                                 {hours.closed && <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-lg border border-rose-100/50">SUSPENDED</span>}
                              </div>
                           </div>
                           
                           {/* Right Segment: Time Calibration */}
                           {!hours.closed ? (
                             <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-3 w-full sm:w-auto">
                                <div className="flex-1 sm:flex-none flex flex-col gap-1">
                                   <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl group-focus-within:border-primary-500 transition-all">
                                      <Clock3 className="h-4 w-4 text-slate-400" />
                                      <input type="time" value={hours.open} onChange={(e) => handleHoursChange(day, 'open', e.target.value)} className="bg-transparent text-[11px] font-black outline-none w-full sm:w-[70px] uppercase" />
                                   </div>
                                   <span className="text-[7px] font-black text-primary-600 text-center uppercase tracking-widest">{formatTime12h(hours.open)}</span>
                                </div>
                                <span className="text-slate-300 font-bold text-[11px] shrink-0 mt-[-15px]">/</span>
                                <div className="flex-1 sm:flex-none flex flex-col gap-1">
                                   <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl group-focus-within:border-primary-500 transition-all">
                                      <Clock3 className="h-4 w-4 text-slate-400" />
                                      <input type="time" value={hours.close} onChange={(e) => handleHoursChange(day, 'close', e.target.value)} className="bg-transparent text-[11px] font-black outline-none w-full sm:w-[70px] uppercase" />
                                   </div>
                                   <span className="text-[7px] font-black text-primary-600 text-center uppercase tracking-widest">{formatTime12h(hours.close)}</span>
                                </div>
                             </div>
                           ) : (
                             <div className="hidden sm:flex items-center justify-end animate-in fade-in">
                                <span className="text-[10px] font-black text-rose-400 uppercase tracking-[0.2em] bg-rose-50 px-5 py-2 rounded-xl border border-rose-100/40 shadow-sm">Protocol Suspended</span>
                             </div>
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
          ) : activeTab === 'tax' ? (
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-8 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center"><DollarSign className="h-6 w-6" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Tax Configuration</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Used by checkout, PayMongo, receipts, and finance reports</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className="space-y-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Store tax status</span>
                  <select value={taxConfiguration.taxStatus} onChange={(e) => setTaxConfiguration(prev => ({ ...prev, taxStatus: e.target.value }))} className="input w-full">
                    <option value="non_vat">Not VAT-registered</option>
                    <option value="vat_registered">VAT-registered</option>
                    <option value="vat_exempt">VAT-exempt</option>
                    <option value="zero_rated">Zero-rated</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Displayed prices</span>
                  <select value={taxConfiguration.pricingMode} onChange={(e) => setTaxConfiguration(prev => ({ ...prev, pricingMode: e.target.value }))} className="input w-full" disabled={taxConfiguration.taxStatus !== 'vat_registered'}>
                    <option value="inclusive">VAT-inclusive</option>
                    <option value="exclusive">VAT-exclusive</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">VAT rate (%)</span>
                  <input type="number" min="0" max="100" step="0.01" value={taxConfiguration.vatRatePercent} onChange={(e) => setTaxConfiguration(prev => ({ ...prev, vatRatePercent: Number(e.target.value) }))} className="input w-full" disabled={taxConfiguration.taxStatus !== 'vat_registered'} />
                </label>
                <label className="flex items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <span>
                    <span className="block text-[9px] font-black text-slate-700 uppercase tracking-widest">Delivery fee is taxable</span>
                    <span className="block text-[9px] text-slate-400 mt-1">Applies only to VAT-registered transactions.</span>
                  </span>
                  <input type="checkbox" checked={taxConfiguration.deliveryFeeTaxable} onChange={(e) => setTaxConfiguration(prev => ({ ...prev, deliveryFeeTaxable: e.target.checked }))} className="h-5 w-5" />
                </label>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-[10px] text-amber-800">
                {!taxConfiguration.isConfigured && <strong className="block mb-1">Tax setup is required before customers can pay.</strong>}
                Tax changes apply only to new transactions. Saved orders and bookings keep the tax snapshot used when they were created.
              </div>
              <button onClick={handleSaveTax} disabled={loading} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-primary-600 transition-all flex items-center justify-center gap-3 shadow-xl">
                {loading ? <Zap className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Tax Configuration
              </button>
            </div>
          ) : activeTab === 'refund' ? (
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-6 sm:p-8 shadow-sm space-y-6 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-4"><div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center"><Shield className="h-5 w-5" /></div><div><h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Store Refund Policy</h3><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Shown in checkout, summaries, confirmations, and receipts</p></div></div>
              <div className="grid gap-3 sm:grid-cols-3">{[
                ['full_refund','Full Refund','Customers may request a full refund under the store policy.'],
                ['conditional_refund','Conditional Refund','Requests are reviewed using the conditions below.'],
                ['no_refund','No Refund','Customer acknowledgment is required before PayMongo.']
              ].map(([value,label,description]) => <button key={value} type="button" onClick={() => setRefundPolicy(current => ({ ...current, type: value }))} className={`rounded-2xl border p-4 text-left transition ${refundPolicy.type === value ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'}`}><strong className="block text-xs text-slate-900">{label}</strong><span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{description}</span></button>)}</div>
              <label className="block"><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Customer-facing summary</span><textarea value={refundPolicy.summary} maxLength="1000" onChange={event => setRefundPolicy(current => ({ ...current, summary: event.target.value }))} className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-xs" required /></label>
              <label className="block"><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Conditions {refundPolicy.type === 'conditional_refund' ? '*' : '(optional)'}</span><textarea value={refundPolicy.conditions} maxLength="3000" onChange={event => setRefundPolicy(current => ({ ...current, conditions: event.target.value }))} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-xs" placeholder="Examples: cancellation window, unfulfilled service, damaged item review" /></label>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-800">Policy changes apply to new transactions. Existing order and booking snapshots remain unchanged, and manual refund-review workflows remain available.</div>
              <button onClick={handleSaveRefundPolicy} disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-primary-600 disabled:opacity-50"><Save size={14} />Save Refund Policy</button>
            </div>
          ) : activeTab === 'staff' ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><UserCog size={18} /></div><div><h3 className="text-sm font-black text-slate-900">Staff & Workforce</h3><p className="text-[10px] text-slate-500">Manage people, inherited role permissions, schedules, and daily availability.</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link to="/admin/staff" className="rounded-xl border border-slate-200 p-4 transition hover:border-primary-300 hover:bg-primary-50"><strong className="block text-xs text-slate-900">Staff Management</strong><span className="mt-1 block text-[10px] text-slate-500">Staff records, schedules, verification, archive, and assignment matrix.</span></Link>
                <Link to="/admin/roles" className="rounded-xl border border-slate-200 p-4 transition hover:border-primary-300 hover:bg-primary-50"><strong className="block text-xs text-slate-900">Role Management</strong><span className="mt-1 block text-[10px] text-slate-500">Edit store-wide permissions inherited by everyone in a role.</span></Link>
              </div>
            </div>
          ) : activeTab === 'notifications' ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Bell size={18} /></div><div><h3 className="text-sm font-black text-slate-900">Notification Operations</h3><p className="text-[10px] text-slate-500">Existing operational reminders remain active and follow account notification preferences.</p></div></div>
              <div className="grid gap-3 sm:grid-cols-3">{[['Email delivery','Account and transactional email uses the existing notification service.'],['Booking reminders','Scheduled booking reminders follow the configured booking time window.'],['Credential reminders','Staff and owners receive expiring-credential alerts.']].map(([title, detail]) => <div key={title} className="rounded-xl bg-slate-50 p-4"><CheckCircle size={15} className="mb-2 text-emerald-500" /><strong className="block text-[11px] text-slate-800">{title}</strong><span className="mt-1 block text-[9px] leading-relaxed text-slate-500">{detail}</span></div>)}</div>
              <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] text-blue-800">No duplicate notification switches are stored here. Delivery channels continue to use the existing notification and account-preference flows.</p>
            </div>
          ) : activeTab === 'appearance' ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Palette size={18} /></div><div><h3 className="text-sm font-black text-slate-900">Store Appearance</h3><p className="text-[10px] text-slate-500">Logo, cover image, and public store identity use the existing store profile.</p></div></div>
              <Link to="/admin/store" className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-[10px] font-black uppercase tracking-wider text-white hover:bg-primary-600">Manage Store Branding <ChevronRight size={14} /></Link>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-10 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center"><Zap className="h-6 w-6" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Business Expansion</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Enable or disable operational modules dynamically</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: 'pets', label: 'Pet Operations', icon: Heart, desc: 'Manage pet listings, adoptions, and inventory.' },
                    { id: 'products', label: 'Retail & Commerce', icon: Package, desc: 'Manage stock, products, and fulfillment.' },
                    { id: 'services', label: 'Service & Booking', icon: Calendar, desc: 'Accept bookings, manage staff and calendars.' }
                  ].map(mod => {
                    const isActive = user?.store?.operationalModules?.includes(mod.id);
                    const isPending = user?.store?.expansionStatus === 'pending';
                    return (
                      <div
                        key={mod.id}
                        className={`p-6 border rounded-[2rem] transition-all ${isActive ? 'bg-primary-50 border-primary-300 ring-1 ring-primary-200' : 'bg-white border-slate-100'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex gap-4">
                            <div className={`p-3 rounded-2xl ${isActive ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-slate-100 text-slate-400'}`}>
                              <mod.icon className="h-5 w-5" />
                            </div>
                            <div>
                              <h4 className={`text-sm font-black uppercase tracking-widest ${isActive ? 'text-primary-900' : 'text-slate-600'}`}>{mod.label}</h4>
                              <p className="text-[10px] font-bold text-slate-400 mt-1">{mod.desc}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {isActive ? (
                              <span className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-[8px] font-black uppercase tracking-widest">Active</span>
                            ) : isPending ? (
                              <span className="px-3 py-1 bg-amber-100 text-amber-600 rounded-lg text-[8px] font-black uppercase tracking-widest">Pending</span>
                            ) : (
                              <button
                                onClick={() => {
                                  setExpansionData(prev => ({ ...prev, operationalModules: [...(user?.store?.operationalModules || []), mod.id] }));
                                  setShowExpansionModal(true);
                                }}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-lg"
                              >
                                Request
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                   <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                   <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest leading-relaxed">Authorized modules remain inaccessible. Business type changes require admin approval. Once approved, your sidebar will automatically update.</p>
                </div>
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
                Expansion requests are reviewed by the platform administration. Please ensure you have the necessary permits for the additional business models.
             </p>
          </div>
        </div>
      </div>

      {/* Expansion Request Modal */}
      {showExpansionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowExpansionModal(false)} />
          <div className="relative bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Expansion Protocol</h2>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Submit additional operational data</p>
                </div>
                <button onClick={() => setShowExpansionModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                  <XCircle className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-2 no-scrollbar">
                {expansionData.operationalModules.includes('services') && (
                  <div className="p-6 bg-secondary-50 rounded-2xl border border-secondary-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-900 uppercase">Service Staffing</p>
                      <button onClick={() => setExpansionData({...expansionData, hiringStaff: !expansionData.hiringStaff})} className={`w-10 h-5 rounded-full relative transition-all ${expansionData.hiringStaff ? 'bg-primary-600' : 'bg-slate-200'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${expansionData.hiringStaff ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                )}
                
                {expansionData.operationalModules.includes('products') && (
                  <div className="p-6 bg-primary-50 rounded-2xl border border-primary-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Supplier Support</p>
                      <button onClick={() => setExpansionData({...expansionData, supplierNeeds: !expansionData.supplierNeeds})} className={`w-10 h-5 rounded-full relative transition-all ${expansionData.supplierNeeds ? 'bg-primary-600' : 'bg-slate-200'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${expansionData.supplierNeeds ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                    <textarea 
                      placeholder="List requested product categories..." 
                      className="w-full bg-white border border-primary-100 rounded-xl p-3 text-[11px] font-bold outline-none"
                      onChange={(e) => setExpansionData({...expansionData, productCategories: e.target.value.split(',')})}
                    />
                  </div>
                )}

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest px-2">Verification Documents</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center">
                       <label className="cursor-pointer block space-y-1">
                          <PlusCircle className="h-4 w-4 mx-auto text-slate-400" />
                          <p className="text-[9px] font-black text-slate-400 uppercase">New Business Permit</p>
                          <input type="file" className="hidden" onChange={(e) => setExpansionFiles({...expansionFiles, mayorsPermit: e.target.files[0]})} />
                          {expansionFiles.mayorsPermit && <p className="text-[8px] text-primary-600 font-bold truncate">{expansionFiles.mayorsPermit.name}</p>}
                       </label>
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={async () => {
                  setLoading(true);
                  try {
                    const fd = new FormData();
                    fd.append('operationalModules', JSON.stringify(expansionData.operationalModules));
                    fd.append('hiringStaff', expansionData.hiringStaff);
                    fd.append('staffTypes', JSON.stringify(expansionData.staffTypes));
                    fd.append('supplierNeeds', expansionData.supplierNeeds);
                    fd.append('productCategories', JSON.stringify(expansionData.productCategories));
                    fd.append('businessDescription', expansionData.businessDescription);
                    if (expansionFiles.mayorsPermit) fd.append('mayorsPermit', expansionFiles.mayorsPermit);
                    
                    await storeService.requestExpansion(fd);
                    toast.success('Expansion request submitted for review');
                    setShowExpansionModal(false);
                  } catch (e) {
                    toast.error(e.response?.data?.message || 'Expansion request failed');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="w-full py-4 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Zap className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />} Transmit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
