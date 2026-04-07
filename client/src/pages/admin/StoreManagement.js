import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { storeService, adminStoreService, uploadService, getImageUrl } from '../../services/apiService';
import {
  Building,
  MapPin,
  Phone,
  Mail,
  Clock,
  Save,
  Upload,
  X,
  Package,
  Scissors,
  Heart,
  Plus,
  Eye,
  Camera,
  Globe,
  Navigation,
  Map as MapIcon
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import GoogleMap from '../../components/GoogleMap';
import MapPicker from '../../components/MapPicker';
import { getCitiesByProvince, getBarangaysByCity } from '../../constants/locationConstants';

const StoreManagement = () => {
  const { refreshUserRole } = useAuth();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [logoPreview, setLogoPreview] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [showMapPicker, setShowMapPicker] = useState(false);

  useEffect(() => {
    fetchMyStore();
  }, []);

  useEffect(() => {
    setCities(getCitiesByProvince('cavite'));
    if (store?.contactInfo?.address?.city) {
      // Find the city object by label to get its correct value/code
      const cityObj = getCitiesByProvince('cavite').find(c => c.label === store.contactInfo.address.city);
      if (cityObj) {
        setBarangays(getBarangaysByCity(cityObj.value));
      } else {
        setBarangays([]);
      }
    }
  }, [store?.contactInfo?.address?.city]);

  const fetchMyStore = async () => {
    try {
      const response = await storeService.getMyStore();
      setStore(response.data.store);
      if (response.data.store?.logo) setLogoPreview(response.data.store.logo);
      if (response.data.store?.coverImage) setCoverPreview(response.data.store.coverImage);
    } catch (error) {
      if (error.response?.status !== 404) {
        toast.error('Failed to load store information');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setStore(prev => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (field, value) => {
    setStore(prev => ({
      ...prev,
      contactInfo: {
        ...prev.contactInfo,
        address: { 
          ...(prev.contactInfo?.address || {}), 
          [field]: value 
        }
      }
    }));
  };

  const handleContactChange = (field, value) => {
    setStore(prev => ({
      ...prev,
      contactInfo: { ...prev.contactInfo, [field]: value }
    }));
  };

  const handleBusinessHoursChange = (day, field, value) => {
    setStore(prev => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: { ...prev.businessHours?.[day], [field]: value }
      }
    }));
  };

  const handleSocialChange = (field, value) => {
    setStore(prev => ({
      ...prev,
      socialMedia: { ...prev?.socialMedia, [field]: value }
    }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result);
      reader.readAsDataURL(file);

      const formData = new FormData();
      formData.append('image', file);
      try {
        setLogoLoading(true);
        const response = await uploadService.uploadImage(formData);
        const imageUrl = response.data.imageUrl;
        setStore(prev => ({ ...prev, logo: imageUrl }));
        toast.success('Logo uploaded successfully');
      } catch (error) {
        toast.error('Failed to upload logo');
      } finally {
        setLogoLoading(false);
      }
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCoverPreview(reader.result);
      reader.readAsDataURL(file);

      const formData = new FormData();
      formData.append('image', file);
      try {
        setCoverLoading(true);
        const response = await uploadService.uploadImage(formData);
        const imageUrl = response.data.imageUrl;
        setStore(prev => ({ ...prev, coverImage: imageUrl }));
        toast.success('Cover image uploaded successfully');
      } catch (error) {
        toast.error('Failed to upload cover image');
      } finally {
        setCoverLoading(false);
      }
    }
  };

  const handleCoordinatesUpdate = (coords) => {
    if (!store) return;
    const currentCoords = store.contactInfo?.address?.coordinates;
    if (currentCoords?.lat === coords.lat && currentCoords?.lng === coords.lng) return;
    setStore(prev => ({
      ...prev,
      contactInfo: {
        ...prev.contactInfo,
        address: { ...prev.contactInfo?.address, coordinates: coords }
      }
    }));
  };

  const handleMapLocationSelected = (location) => {
    setStore(prev => ({
      ...prev,
      contactInfo: {
        ...prev.contactInfo,
        address: {
          ...prev.contactInfo?.address,
          street: location.street || prev.contactInfo?.address?.street || '',
          city: location.city || prev.contactInfo?.address?.city || '',
          barangay: location.barangay || prev.contactInfo?.address?.barangay || '',
          zipCode: location.zipCode || prev.contactInfo?.address?.zipCode || '',
          coordinates: { lat: location.lat, lng: location.lng }
        }
      }
    }));
    setShowMapPicker(false);
    toast.success('Address coordinates synced with base location.');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (store._id) {
        await storeService.updateStore(store._id, store);
        await refreshUserRole();
        toast.success('Store information updated successfully');
      } else {
        await storeService.createStore(store);
        await refreshUserRole();
        toast.success('Store created successfully!');
        fetchMyStore();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save store information');
    } finally {
      setSaving(false);
    }
  };

  const handleInitialize = () => {
    setStore({
      name: '',
      description: '',
      businessType: 'pet_store',
      contactInfo: {
        phone: '',
        email: '',
        website: '',
        address: { street: '', barangay: '', city: '', state: 'Cavite', zipCode: '', country: 'Philippines' }
      },
      socialMedia: { facebook: '', instagram: '', twitter: '', youtube: '' },
      businessHours: {
        monday: { open: '09:00', close: '18:00', closed: false },
        tuesday: { open: '09:00', close: '18:00', closed: false },
        wednesday: { open: '09:00', close: '18:00', closed: false },
        thursday: { open: '09:00', close: '18:00', closed: false },
        friday: { open: '09:00', close: '18:00', closed: false },
        saturday: { open: '10:00', close: '17:00', closed: false },
        sunday: { open: '10:00', close: '17:00', closed: true }
      }
    });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Building className="h-10 w-10 animate-pulse text-indigo-600" /></div>;

  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-[2rem] shadow-2xl text-center max-w-md border border-slate-200">
          <Building className="h-12 w-12 text-slate-300 mx-auto mb-6" />
          <h2 className="text-xl font-black mb-2 uppercase tracking-tight">Setup Your Store</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Initialize your business presence</p>
          <button onClick={handleInitialize} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-primary-600 transition-all active:scale-95 shadow-xl">Create Store Profile</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      <div className="relative h-72 w-full overflow-hidden">
        {coverPreview ? (
          <img src={getImageUrl(coverPreview)} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-slate-900"></div>
        )}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">{store.name || 'Store Management'}</h1>
          <p className="text-white/80 font-medium text-lg">{store.description || 'Manage your store details.'}</p>
        </div>
        <label className="absolute top-8 right-8 p-3 bg-white/10 backdrop-blur-md text-white rounded-2xl border border-white/20 cursor-pointer hover:bg-white/20 transition-all">
          <Upload className="h-5 w-5 mb-1 mx-auto" />
          <span className="text-[10px] font-black uppercase tracking-widest">{coverLoading ? 'Uploading...' : 'Change Cover'}</span>
          <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={coverLoading} />
        </label>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white p-8 relative overflow-hidden">
              <div className="relative flex flex-col items-center">
                <div className="relative mb-6">
                  {logoPreview ? (
                    <img src={getImageUrl(logoPreview)} alt="Logo" className="w-32 h-32 rounded-[2.2rem] object-cover ring-4 ring-white shadow-xl" />
                  ) : (
                    <div className="w-32 h-32 rounded-[2.2rem] bg-slate-100 flex items-center justify-center"><Building className="h-16 w-16 text-slate-300" /></div>
                  )}
                  <label className="absolute -right-2 -bottom-2 p-3 bg-slate-900 text-white rounded-2xl shadow-lg cursor-pointer">
                    <Camera className="h-5 w-5" />
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={logoLoading} />
                  </label>
                </div>
                <h3 className="text-xl font-black text-slate-900">{store.name}</h3>
              </div>
            </div>

            <nav className="bg-white/60 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-4 space-y-2">
              {[
                { id: 'info', icon: Building, label: 'Basic Info' },
                { id: 'hours', icon: Clock, label: 'Business Hours' },
                { id: 'social', icon: Globe, label: 'Social Media' },
                { id: 'verification', icon: Shield, label: 'Trust & Verification' },
                { id: 'preview', icon: Eye, label: 'Store Preview' }
              ].map((item) => (
                <button key={item.id} onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-4 px-6 py-3.5 rounded-[2rem] font-bold transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}>
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              ))}
              <div className="pt-4 border-t border-slate-100 mt-4 px-4">
                <button onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-slate-900 text-white rounded-[1.8rem] font-black uppercase tracking-widest text-xs hover:bg-black transition-all disabled:opacity-50">
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </nav>
          </div>

          <div className="lg:col-span-8">
            <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] shadow-2xl border border-white min-h-[700px] p-8 lg:p-12">
              {activeTab === 'info' && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-12 duration-700">
                  <h2 className="text-3xl font-black text-slate-900">Basic Info</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Store Name</label>
                      <input type="text" name="name" value={store.name || ''} onChange={handleInputChange} className="w-full px-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Business Type</label>
                      <select name="businessType" value={store.businessType || ''} onChange={handleInputChange} className="w-full px-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all appearance-none">
                        <option value="pet_store">PET RETAIL STORE</option>
                        <option value="breeder">LICENSED BREEDER</option>
                        <option value="shelter">RESCUE / SHELTER</option>
                        <option value="veterinary">MEDICAL / VET CLINIC</option>
                        <option value="grooming">GROOMING & SPA</option>
                        <option value="training">TRAINING ACADEMY</option>
                        <option value="other">BOUTIQUE SERVICES</option>
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">About the Store</label>
                      <textarea name="description" value={store.description || ''} onChange={handleInputChange} rows={5} className="w-full px-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all resize-none" placeholder="Tell customers about your pet shop..."></textarea>
                    </div>
                    {/* Location Intel */}
                    <div className="md:col-span-2 mt-4 pt-8 border-t border-slate-100">
                      <h3 className="text-2xl font-black text-slate-900 mb-6 uppercase tracking-tighter">Address Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Province / State</label>
                          <select
                            value={store.contactInfo?.address?.state || 'Cavite'}
                            onChange={(e) => handleAddressChange('state', e.target.value)}
                            className="w-full px-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all appearance-none"
                          >
                            <option value="ST: CAVITE">Cavite</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">City / Municipality</label>
                          <select
                            value={store.contactInfo?.address?.city || ''}
                            onChange={(e) => {
                              handleAddressChange('city', e.target.value);
                              handleAddressChange('barangay', ''); // reset barangay on city change
                            }}
                            className="w-full px-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all appearance-none"
                          >
                            <option value="">SELECT CITY</option>
                            {cities.map((city) => (
                              <option key={city.value} value={city.label}>{city.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Barangay</label>
                          <select
                            value={store.contactInfo?.address?.barangay || ''}
                            onChange={(e) => handleAddressChange('barangay', e.target.value)}
                            disabled={!store.contactInfo?.address?.city}
                            className="w-full px-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all appearance-none disabled:opacity-50 cursor-pointer"
                          >
                            <option value="">SELECT BARANGAY</option>
                            {barangays.map((brgy) => (
                              <option key={brgy.value || brgy} value={brgy.label || brgy}>{brgy.label || brgy}</option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-3 space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Street Address / Block / Lot</label>
                          <input
                            type="text"
                            value={store.contactInfo?.address?.street || ''}
                            onChange={(e) => handleAddressChange('street', e.target.value)}
                            className="w-full px-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all"
                            placeholder="e.g. Blk 13 Lot 17, Main Street, Village Name"
                          />
                        </div>

                        {/* Map Intelligence Activation */}
                        <div className="md:col-span-3 pt-6">
                          <button
                            type="button"
                            onClick={() => setShowMapPicker(!showMapPicker)}
                            className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border-2 ${showMapPicker ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-500 hover:text-indigo-600'}`}
                          >
                            <MapIcon className={`h-4 w-4 ${showMapPicker ? 'animate-bounce' : ''}`} />
                            {showMapPicker ? 'CLOSE MAP INTELLIGENCE' : 'ACTIVATE MAP CALIBRATION'}
                          </button>

                          {showMapPicker && (
                            <div className="mt-8 p-6 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                               <div className="flex items-center gap-4 mb-6">
                                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                      <Navigation className="h-5 w-5" />
                                  </div>
                                  <div>
                                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Geospatial Calibration</h4>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select your base center on the grid</p>
                                  </div>
                               </div>
                               <MapPicker 
                                 onLocationSelected={handleMapLocationSelected}
                                 initialAddress={store.contactInfo?.address?.street}
                               />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'verification' && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-12 duration-700">
                  <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-black text-slate-900 uppercase">Trust & Status</h2>
                    <span className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg ${
                      store.verificationStatus === 'verified' ? 'bg-emerald-500 text-white' :
                      store.verificationStatus === 'pending' ? 'bg-amber-500 text-white animate-pulse' :
                      'bg-slate-200 text-slate-500'
                    }`}>
                      {store.verificationStatus?.replace('_', ' ') || 'Unverified'}
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-white/5 rounded-[3rem] p-10 text-white relative overflow-hidden">
                    <Shield className="absolute top-10 right-10 w-32 h-32 opacity-10 pointer-events-none" />
                    <h4 className="text-[12px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-8">Identity Audit</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-widest px-2 transition-colors">Valid Govt ID Photo</label>
                          <div className="relative group cursor-pointer border-2 border-dashed border-white/10 rounded-2xl p-4 hover:border-indigo-500 transition-all flex flex-col items-center justify-center h-48 bg-white/5">
                            {store.verification?.idImage ? (
                               <img src={getImageUrl(store.verification.idImage)} alt="ID" className="w-full h-full object-contain rounded-xl" />
                            ) : (
                               <>
                                 <Plus className="h-8 w-8 text-white/20 group-hover:text-indigo-500 transition-all mb-2" />
                                 <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Upload Govt ID</span>
                               </>
                            )}
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                               const formData = new FormData();
                               formData.append('image', e.target.files[0]);
                               const res = await uploadService.uploadImage(formData);
                               setStore(p => ({ ...p, verification: { ...p.verification, idImage: res.data.imageUrl } }));
                            }} />
                          </div>
                       </div>
                       <div className="space-y-4">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-widest px-2">Selfie with ID</label>
                          <div className="relative group cursor-pointer border-2 border-dashed border-white/10 rounded-2xl p-4 hover:border-emerald-500 transition-all flex flex-col items-center justify-center h-48 bg-white/5">
                             {store.verification?.selfieImage ? (
                               <img src={getImageUrl(store.verification.selfieImage)} alt="Selfie" className="w-full h-full object-contain rounded-xl" />
                             ) : (
                               <>
                                 <Plus className="h-8 w-8 text-white/20 group-hover:text-emerald-500 transition-all mb-2" />
                                 <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Upload Selfie</span>
                               </>
                             )}
                             <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                               const formData = new FormData();
                               formData.append('image', e.target.files[0]);
                               const res = await uploadService.uploadImage(formData);
                               setStore(p => ({ ...p, verification: { ...p.verification, selfieImage: res.data.imageUrl } }));
                            }} />
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-[3rem] p-10 shadow-xl overflow-hidden">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-8">Payout Matrix</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Method</label>
                          <select value={store.payoutAccount?.method || 'gcash'} onChange={(e) => setStore(p => ({ ...p, payoutAccount: { ...p.payoutAccount, method: e.target.value } }))}
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all appearance-none cursor-pointer">
                            <option value="gcash">GCASH</option>
                            <option value="maya">MAYA</option>
                            <option value="bank_transfer">BANK TRANSFER</option>
                          </select>
                       </div>
                       <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Account Number / Name</label>
                          <input type="text" value={store.payoutAccount?.number || ''} onChange={(e) => setStore(p => ({ ...p, payoutAccount: { ...p.payoutAccount, number: e.target.value } }))}
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-black outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" placeholder="Enter Account Details..." />
                       </div>
                    </div>
                  </div>

                  <div className="pt-6">
                    <button onClick={async () => {
                       try {
                         setSaving(true);
                         await storeService.submitVerification(store);
                         toast.success('Trust Documents Submitted for Audit!');
                         fetchMyStore();
                       } catch (e) { toast.error('Submission failed'); }
                       finally { setSaving(false); }
                    }} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-[11px] tracking-widest hover:bg-slate-900 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3">
                      <Shield className="h-4 w-4" />
                      Submit Verification Bundle
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'hours' && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-12 duration-700">
                  <h2 className="text-3xl font-black text-slate-900">Business Hours</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                      <div key={day} className="p-6 bg-slate-50 hover:bg-white rounded-[2rem] border border-slate-100 hover:border-indigo-200 transition-all flex flex-col md:flex-row md:items-center gap-6">
                        <div className="w-32 shrink-0">
                          <h4 className="text-lg font-black text-slate-900 capitalize">{day}</h4>
                          <input type="checkbox" checked={!store.businessHours?.[day]?.closed} onChange={(e) => handleBusinessHoursChange(day, 'closed', !e.target.checked)} />
                          <span className="ml-2 text-xs font-black uppercase text-slate-400">{store.businessHours?.[day]?.closed ? 'Closed' : 'Active'}</span>
                        </div>
                        {!store.businessHours?.[day]?.closed && (
                          <div className="flex-1 grid grid-cols-2 gap-6">
                            <input type="time" value={store.businessHours?.[day]?.open || ''} onChange={(e) => handleBusinessHoursChange(day, 'open', e.target.value)} className="w-full px-4 py-3.5 bg-white border-2 border-slate-100 rounded-2xl" />
                            <input type="time" value={store.businessHours?.[day]?.close || ''} onChange={(e) => handleBusinessHoursChange(day, 'close', e.target.value)} className="w-full px-4 py-3.5 bg-white border-2 border-slate-100 rounded-2xl" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'social' && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-12 duration-700">
                  <h2 className="text-3xl font-black text-slate-900">Social Media</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {['facebook', 'instagram', 'twitter', 'youtube'].map(s => (
                      <div key={s} className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest capitalize">{s}</label>
                        <input type="text" value={store.socialMedia?.[s] || ''} onChange={(e) => handleSocialChange(s, e.target.value)} className="w-full px-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'preview' && (
                <div className="space-y-12 animate-in fade-in slide-in-from-right-12 duration-700">
                  <h2 className="text-3xl font-black text-slate-900">Store Preview</h2>
                  <div className="relative rounded-[3rem] overflow-hidden shadow-2xl">
                    <div className="h-64 relative">
                      {coverPreview ? <img src={getImageUrl(coverPreview)} alt="Cover" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-900"></div>}
                      <div className="absolute inset-0 bg-black/40"></div>
                      <div className="absolute bottom-8 left-5 flex items-center gap-6">
                        <div className="w-24 h-24 rounded-[1.8rem] bg-white p-1 shadow-xl overflow-hidden">
                          {logoPreview ? <img src={getImageUrl(logoPreview)} alt="Logo" className="w-full h-full object-cover rounded-[1.4rem]" /> : <Building className="h-10 w-10 text-slate-300 m-auto" />}
                        </div>
                        <div className="text-white">
                          <h4 className="text-2xl font-black">{store.name}</h4>
                          <p className="text-white/70 text-sm">Official Pet Partner</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-10">
                      <p className="text-slate-600 italic">"{store.description || 'No description provided yet.'}"</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-[3rem] p-8 sm:p-12 border border-slate-100 shadow-xl">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center text-primary-600">
                        <MapPin className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Location Intel</h4>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Base coordinates & accessibility</p>
                      </div>
                    </div>
                    <GoogleMap
                      address={`${store.contactInfo?.address?.street || ''}, ${store.contactInfo?.address?.barangay || ''}, ${store.contactInfo?.address?.city || ''}, ${store.contactInfo?.address?.state || 'Cavite'}`}
                      storeName={store.name}
                      coordinates={store.contactInfo?.address?.coordinates}
                      onCoordinatesUpdate={handleCoordinatesUpdate}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreManagement;
