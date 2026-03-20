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
  Globe
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import GoogleMap from '../../components/GoogleMap';
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

  useEffect(() => {
    fetchMyStore();
  }, []);

  useEffect(() => {
    setCities(getCitiesByProvince('cavite'));
    if (store?.contactInfo?.address?.city) {
      setBarangays(getBarangaysByCity(store.contactInfo.address.city));
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
        address: { ...prev.contactInfo?.address, [field]: value }
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
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center max-w-lg">
          <Building className="h-16 w-16 text-slate-300 mx-auto mb-8" />
          <h2 className="text-3xl font-black mb-4">Setup Your Store</h2>
          <button onClick={handleInitialize} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase">Create Store Profile</button>
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
            <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white p-8 relative overflow-hidden">
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

            <nav className="bg-white/60 backdrop-blur-md rounded-[2.5rem] shadow-xl border border-white/50 p-4 space-y-2">
              {[
                { id: 'info', icon: Building, label: 'Basic Info' },
                { id: 'hours', icon: Clock, label: 'Business Hours' },
                { id: 'social', icon: Globe, label: 'Social Media' },
                { id: 'preview', icon: Eye, label: 'Store Preview' }
              ].map((item) => (
                <button key={item.id} onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-4 px-6 py-5 rounded-[2rem] font-bold transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}>
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              ))}
              <div className="pt-4 border-t border-slate-100 mt-4 px-4">
                <button onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-slate-900 text-white rounded-[1.8rem] font-black uppercase tracking-widest text-xs hover:bg-black transition-all disabled:opacity-50">
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
                      <input type="text" name="name" value={store.name || ''} onChange={handleInputChange} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Business Type</label>
                      <select name="businessType" value={store.businessType || ''} onChange={handleInputChange} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all appearance-none">
                        <option value="pet_store">Pet Retail Store</option>
                        <option value="breeder">Licensed Breeder</option>
                        <option value="shelter">Rescue / Shelter</option>
                        <option value="veterinary">Medical / Vet Clinic</option>
                        <option value="grooming">Grooming & Spa</option>
                        <option value="training">Training Academy</option>
                        <option value="other">Boutique Services</option>
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">About the Store</label>
                      <textarea name="description" value={store.description || ''} onChange={handleInputChange} rows={5} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all resize-none" placeholder="Tell customers about your pet shop..."></textarea>
                    </div>
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
                            <input type="time" value={store.businessHours?.[day]?.open || ''} onChange={(e) => handleBusinessHoursChange(day, 'open', e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl" />
                            <input type="time" value={store.businessHours?.[day]?.close || ''} onChange={(e) => handleBusinessHoursChange(day, 'close', e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl" />
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
                        <input type="text" value={store.socialMedia?.[s] || ''} onChange={(e) => handleSocialChange(s, e.target.value)} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all" />
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
                      <div className="absolute bottom-8 left-8 flex items-center gap-6">
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
                      address={`${store.contactInfo?.address?.street}, ${store.contactInfo?.address?.city}, ${store.contactInfo?.address?.state}`}
                      storeName={store.name}
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
