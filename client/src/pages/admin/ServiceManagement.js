import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Plus, Edit2, Trash2, Clock, Home, MapPin, Package, Users, Shield,
  Zap, Activity, ChevronRight, X, Target, ArrowUpRight, Info, Image as ImageIcon,
  CheckCircle, AlertTriangle, Star, Briefcase, Settings, Calendar, Search, ChevronDown,
  DollarSign, Tag, Layers, ChevronLeft, Ruler, Weight, Heart, AlertCircle, Timer
} from 'lucide-react';

import { serviceService, adminServiceService, uploadService, getImageUrl, staffService } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import { SERVICE_CATEGORIES } from '../../constants/serviceCategories';

const PhilippinePeso = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 11H4" /><path d="M20 7H4" /><path d="M7 21V4a5 5 0 0 1 5 5c0 2.2-1.8 3-5 3Z" />
  </svg>
);

// ── Reusable Toggle Component ─────────────────────────────────────────────
const ToggleSwitch = ({ enabled, onToggle, size = 'md' }) => {
  const sizes = {
    sm: { track: 'w-10 h-5', thumb: 'w-3 h-3', on: 'left-5', off: 'left-1' },
    md: { track: 'w-14 h-7', thumb: 'w-4 h-4', on: 'left-8', off: 'left-1.5' }
  };
  const s = sizes[size];
  return (
    <button type="button" onClick={onToggle}
      className={`${s.track} rounded-full relative transition-all duration-300 border-2 ${enabled ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-200 border-slate-200'}`}>
      <div className={`absolute top-1/2 -translate-y-1/2 ${s.thumb} rounded-full bg-white transition-all duration-300 shadow ${enabled ? s.on : s.off}`} />
    </button>
  );
};

// ── Section Header ────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, subtitle, color = 'indigo' }) => (
  <div className="flex items-center gap-4 mb-6">
    <div className={`w-12 h-12 bg-${color}-100 rounded-2xl flex items-center justify-center shadow-sm`}>
      <Icon className={`h-6 w-6 text-${color}-600`} />
    </div>
    <div>
      <h4 className="text-[12px] font-black uppercase tracking-[0.3em] text-slate-800">{title}</h4>
      {subtitle && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const ServiceManagement = () => {
  const { user } = useAuth();

  // Real-time Updates
  useRealTimeUpdates({
    onServiceUpdate: (data) => {
      console.log('🐾 Real-time service update received:', data);
      fetchServices();
      if (data.isDeleted) {
          toast.info('A service was removed from the catalog.');
      } else {
          toast.info(`Service "${data.name || 'catalog item'}" updated in real-time.`);
      }
    }
  });

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [editingService, setEditingService] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [storeStaff, setStoreStaff] = useState([]);

  // Permission Checks
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const canCreate = isAdmin || user?.permissions?.services?.create || user?.permissions?.services?.fullAccess;
  const canUpdate = isAdmin || user?.permissions?.services?.update || user?.permissions?.services?.fullAccess;
  const canDelete = isAdmin || user?.permissions?.services?.delete || user?.permissions?.services?.fullAccess;
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const initialFormState = {
    name: '',
    description: '',
    category: 'grooming',
    subCategory: 'Bathing & Drying',
    duration: 30,
    bufferTime: 0,
    price: 0,
    homeServiceAvailable: false,
    homeServicePrice: 0,
    maxPetsPerSession: 1,
    isActive: true,
    images: [],
    // Pricing Rules
    pricingRules: {
      petSize: { enabled: false, small: 0, medium: 50, large: 100, extraLarge: 150 },
      petWeight: { enabled: false, ranges: [] },
      breed: { enabled: false, breeds: [] },
      condition: { enabled: false, conditions: [
        { condition: 'matted_fur', label: 'Matted Fur', fee: 100 },
        { condition: 'fleas_ticks', label: 'Fleas / Ticks', fee: 150 },
        { condition: 'aggressive', label: 'Aggressive Behavior', fee: 200 },
        { condition: 'special_handling', label: 'Special Handling Required', fee: 100 }
      ]},
      timeBased: { enabled: false, weekdayRate: 0, weekendRate: 50, holidayRate: 100, peakHoursRate: 30, peakHoursStart: '10:00', peakHoursEnd: '14:00', holidays: [] }
    },
    // Add-ons
    addOns: [],
    // Booking Rules
    bookingRules: { minBookingNotice: 0, maxDailyBookings: 0, capacityPerSlot: 1 },
    // Staff
    assignedStaff: [],
    // Schedule
    schedule: { enabled: false }
  };

  const [formData, setFormData] = useState(initialFormState);

  // Temp state for adding new items
  const [newAddOn, setNewAddOn] = useState({ name: '', price: 0, duration: 0, description: '' });
  const [newBreed, setNewBreed] = useState({ breed: '', adjustment: 0 });
  const [newWeightRange, setNewWeightRange] = useState({ minWeight: 0, maxWeight: 10, adjustment: 0 });
  const [newCondition, setNewCondition] = useState({ condition: '', label: '', fee: 0 });

  const categories = SERVICE_CATEGORIES;
  const wizardSteps = [
    { id: 'basic', label: 'Basic Info', icon: Info },
    { id: 'pricing', label: 'Pricing Rules', icon: DollarSign },
    { id: 'addons', label: 'Add-Ons', icon: Layers },
    { id: 'schedule', label: 'Schedule & Staff', icon: Calendar },
    { id: 'media', label: 'Images & Review', icon: ImageIcon }
  ];

  useEffect(() => { fetchServices(); fetchStaff(); }, []);

  const fetchServices = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'staff') {
        const response = await adminServiceService.getAllServices();
        setServices(response.data.services || []);
      }
    } catch (error) {
      toast.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const res = await staffService.getAll();
      setStoreStaff(res.data.staff || []);
    } catch (e) {
      console.log('Staff fetch optional:', e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (editingService) {
        await adminServiceService.updateService(editingService._id, formData);
        toast.success('Service updated');
      } else {
        const serviceData = { ...formData, createdBy: user._id || user.id };
        await adminServiceService.createService(serviceData);
        toast.success('Service created');
      }
      setShowModal(false);
      resetForm();
      fetchServices();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Command failed');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setEditingService(null);
    setWizardStep(0);
  };

  const handleEdit = (service) => {
    setFormData({
      ...initialFormState,
      ...service,
      pricingRules: {
        ...initialFormState.pricingRules,
        ...(service.pricingRules || {}),
        petSize: { ...initialFormState.pricingRules.petSize, ...(service.pricingRules?.petSize || {}) },
        petWeight: { ...initialFormState.pricingRules.petWeight, ...(service.pricingRules?.petWeight || {}) },
        breed: { ...initialFormState.pricingRules.breed, ...(service.pricingRules?.breed || {}) },
        condition: { ...initialFormState.pricingRules.condition, ...(service.pricingRules?.condition || {}) },
        timeBased: { ...initialFormState.pricingRules.timeBased, ...(service.pricingRules?.timeBased || {}) }
      },
      bookingRules: { ...initialFormState.bookingRules, ...(service.bookingRules || {}) },
      addOns: service.addOns || [],
      assignedStaff: service.assignedStaff?.map(s => s._id || s) || [],
      schedule: { ...initialFormState.schedule, ...(service.schedule || {}) }
    });
    setEditingService(service);
    setWizardStep(0);
    setShowModal(true);
  };

  const handleDelete = (id) => {
    setServiceToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      await adminServiceService.deleteService(serviceToDelete);
      toast.success('Service deleted');
      fetchServices();
    } catch (error) {
      toast.error('Failed to delete service');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSubmitting(true);
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) fd.append('images', files[i]);
    try {
      const response = await uploadService.uploadMultipleImages(fd);
      const newUrls = response.data.urls || response.data.imageUrls || [];
      setFormData(prev => ({ ...prev, images: [...prev.images, ...newUrls] }));
      toast.success('Images uploaded');
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper: Update nested pricing rules
  const updatePricingRule = (ruleKey, updates) => {
    setFormData(prev => ({
      ...prev,
      pricingRules: {
        ...prev.pricingRules,
        [ruleKey]: { ...prev.pricingRules[ruleKey], ...updates }
      }
    }));
  };

  // Helper: Add add-on
  const addNewAddon = () => {
    if (!newAddOn.name.trim()) return toast.warning('Add-on name is required');
    setFormData(prev => ({ ...prev, addOns: [...prev.addOns, { ...newAddOn, isActive: true }] }));
    setNewAddOn({ name: '', price: 0, duration: 0, description: '' });
  };

  const removeAddon = (idx) => {
    setFormData(prev => ({ ...prev, addOns: prev.addOns.filter((_, i) => i !== idx) }));
  };

  const addBreed = () => {
    if (!newBreed.breed.trim()) return;
    updatePricingRule('breed', {
      breeds: [...(formData.pricingRules.breed.breeds || []), { ...newBreed }]
    });
    setNewBreed({ breed: '', adjustment: 0 });
  };

  const removeBreed = (idx) => {
    updatePricingRule('breed', {
      breeds: formData.pricingRules.breed.breeds.filter((_, i) => i !== idx)
    });
  };

  const addWeightRange = () => {
    updatePricingRule('petWeight', {
      ranges: [...(formData.pricingRules.petWeight.ranges || []), { ...newWeightRange }]
    });
    setNewWeightRange({ minWeight: 0, maxWeight: 10, adjustment: 0 });
  };

  const removeWeightRange = (idx) => {
    updatePricingRule('petWeight', {
      ranges: formData.pricingRules.petWeight.ranges.filter((_, i) => i !== idx)
    });
  };

  const addCondition = () => {
    if (!newCondition.condition.trim()) return;
    updatePricingRule('condition', {
      conditions: [...(formData.pricingRules.condition.conditions || []), { ...newCondition }]
    });
    setNewCondition({ condition: '', label: '', fee: 0 });
  };

  const removeCondition = (idx) => {
    updatePricingRule('condition', {
      conditions: formData.pricingRules.condition.conditions.filter((_, i) => i !== idx)
    });
  };

  const toggleStaffAssignment = (staffId) => {
    setFormData(prev => {
      const current = prev.assignedStaff || [];
      const exists = current.includes(staffId);
      return { ...prev, assignedStaff: exists ? current.filter(id => id !== staffId) : [...current, staffId] };
    });
  };

  const getCategoryIcon = (cat) => categories.find(c => c.id === cat)?.icon || '📦';

  const durationPresets = [15, 30, 45, 60, 90, 120, 180];
  const bufferPresets = [0, 5, 10, 15, 30];

  // Count active pricing rules
  const activePricingRules = Object.values(formData.pricingRules || {}).filter(r => r.enabled).length;

  if (loading && services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2"></div>
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Services...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
              <Settings className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em]">ADMIN PANEL : SERVICES</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-[0.9] mb-3">
            Service <span className="text-indigo-600">Manager</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Full customization • Pricing rules • Staff assignment
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/admin/bookings"
            className="px-8 py-3.5 bg-white border border-slate-100 text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-50 transition-all shadow-sm flex items-center gap-3"
          >
            <Calendar className="h-4 w-4 text-indigo-600" /> View Bookings
          </Link>
          {canCreate && (
            <button onClick={() => { resetForm(); setShowModal(true); }}
              className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3 group">
              <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" /> Create Service
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Services', value: services.filter(s => s.isActive).length, icon: Activity, color: 'emerald' },
          { label: 'Total Services', value: services.length, icon: Package, color: 'primary' },
          { label: 'With Pricing Rules', value: services.filter(s => s.pricingRules && Object.values(s.pricingRules).some(r => r?.enabled)).length, icon: DollarSign, color: 'indigo' },
          { label: 'With Add-Ons', value: services.filter(s => s.addOns && s.addOns.length > 0).length, icon: Layers, color: 'amber' }
        ].map((stat, idx) => (
          <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm group hover:shadow-lg hover:border-indigo-100 transition-all">
            <div className={`w-10 h-10 rounded-2xl bg-${stat.color}-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <stat.icon className={`h-5 w-5 text-${stat.color}-600`} />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 leading-tight">{stat.label}</p>
            <p className="text-xl font-black text-slate-900 tracking-tighter">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Service HUD Filter */}
      <div className="bg-slate-900 p-2 rounded-[1.5rem] shadow-xl border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-6 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
            </div>
            <input
              type="text" placeholder="SEARCH SERVICES..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-16 pr-4 py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
            />
          </div>
          <div className="md:col-span-4 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2">
              <Briefcase className="h-4 w-4 text-primary-500" />
            </div>
            <select
              value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-16 pr-10 py-4 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
            >
              <option value="" className="bg-slate-900 text-white font-black">ALL SERVICES: VIEW ALL</option>
              {categories.map(c => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white font-black">{c.label.toUpperCase()}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {services
          .filter(s => {
            const matchSearch = !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.description.toLowerCase().includes(searchTerm.toLowerCase());
            const matchCat = !filterCategory || s.category === filterCategory;
            return matchSearch && matchCat;
          })
          .map((service) => (
          <div key={service._id} className="group bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all relative flex flex-col">
            {/* Card Image / Icon Header */}
            <div className="relative h-40 bg-gradient-to-br from-indigo-500 to-primary-600 flex items-center justify-center overflow-hidden">
              {service.images?.[0] ? (
                <img src={getImageUrl(service.images[0])} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              ) : (
                <span className="text-5xl opacity-25">{getCategoryIcon(service.category)}</span>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
              <div className="absolute bottom-3 left-5 right-4">
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${service.isActive ? 'bg-emerald-500/90 text-white' : 'bg-slate-500/90 text-white'}`}>
                    {service.isActive ? 'ACTIVE' : 'OFFLINE'}
                  </span>
                  {service.pricingRules && Object.values(service.pricingRules).some(r => r?.enabled) && (
                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/90 text-white">
                      DYNAMIC PRICING
                    </span>
                  )}
                  {service.addOns?.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-purple-500/90 text-white">
                      +{service.addOns.length} ADD-ONS
                    </span>
                  )}
                  {service.homeServiceAvailable && (
                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-500/90 text-white">HOME</span>
                  )}
                </div>
                <h3 className="text-base font-black text-white uppercase tracking-tight leading-tight line-clamp-1">{service.name}</h3>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-4 flex-1 flex flex-col">
              <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 italic">{service.category?.replace('_', ' ')}</p>
              <p className="text-[11px] font-medium text-slate-500 leading-relaxed line-clamp-2 mb-3">{service.description}</p>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-1 py-3.5 border-t border-slate-50 mt-auto">
                <div className="text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Base Price</p>
                  <p className="text-[13px] font-black text-slate-900 tracking-tight truncate">₱{(service.price || 0).toLocaleString()}</p>
                </div>
                <div className="text-center border-x border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Duration</p>
                  <p className="text-[13px] font-black text-slate-900 tracking-tight">{service.duration}<span className="text-[9px] text-slate-400">m</span></p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Staff</p>
                  <p className="text-[13px] font-black text-slate-900 tracking-tight">{service.assignedStaff?.length || 0}<span className="text-[9px] text-slate-400">ppl</span></p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                {canUpdate && (
                  <button onClick={() => handleEdit(service)}
                    className="flex-1 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-indigo-600 flex items-center justify-center gap-1.5">
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => handleDelete(service._id)}
                    className="px-3 py-2.5 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* WIZARD MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 overflow-hidden">
          <div className="bg-white w-full max-w-4xl rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh] border border-slate-200">
            {/* Wizard Header */}
            <header className="p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-2xl shadow-indigo-200">
                  <Settings className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Shield className="h-2.5 w-2.5 text-indigo-600" />
                    <span className="text-[8px] font-black text-indigo-600 uppercase tracking-[0.4em] leading-none">
                      Step {wizardStep + 1} of {wizardSteps.length} : {wizardSteps[wizardStep].label}
                    </span>
                  </div>
                  <h3 className="text-xl font-black uppercase text-slate-900 tracking-tighter leading-none">
                    {editingService ? 'Edit Service' : 'Create Service'}
                  </h3>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all"><X className="h-4 w-4" /></button>
            </header>

            {/* Step Navigation */}
            <nav className="px-6 py-2 border-b border-slate-50 flex gap-1 overflow-x-auto no-scrollbar shrink-0 bg-slate-50/50">
              {wizardSteps.map((step, idx) => (
                <button key={step.id} onClick={() => setWizardStep(idx)}
                  className={`px-3 py-2.5 rounded-xl flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                    ${wizardStep === idx ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : idx < wizardStep ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}>
                  {idx < wizardStep ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <step.icon className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              ))}
            </nav>

            {/* Content Deck */}
            <div className="flex-1 overflow-y-auto p-6 no-scrollbar">

              {/* ── STEP 0: BASIC INFO ── */}
              {wizardStep === 0 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Service Name</label>
                        <input type="text" required value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                          className="w-full px-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/10" placeholder="E.G. PREMIUM GROOMING" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Service Category</label>
                        <div className="grid grid-cols-2 gap-2">
                          {categories.map(c => (
                            <button key={c.id} type="button" onClick={() => setFormData(p => ({ ...p, category: c.id, subCategory: c.subServices[0] }))}
                              className={`p-3 rounded-2xl text-left transition-all border-2 flex items-center gap-3 ${formData.category === c.id ? 'bg-indigo-50 border-indigo-300 shadow-lg' : 'bg-slate-50 border-slate-50 hover:border-slate-200'}`}>
                              <span className="text-lg">{c.icon}</span>
                              <span className="text-[9px] font-black uppercase tracking-widest">{c.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Sub-Service Type</label>
                        <select value={formData.subCategory} onChange={e => setFormData(p => ({ ...p, subCategory: e.target.value }))}
                          className="w-full px-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/10">
                          {categories.find(c => c.id === formData.category)?.subServices.map(sub => (
                            <option key={sub} value={sub}>{sub.toUpperCase()}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Base Price (₱)</label>
                          <div className="relative group">
                            <PhilippinePeso className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-600 z-20" />
                            <input type="number" required value={formData.price} onChange={e => setFormData(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                              className="w-full pl-16 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black outline-none focus:ring-4 focus:ring-indigo-500/10" placeholder="0" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Session Capacity</label>
                          <div className="relative group">
                            <Users className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 z-20" />
                            <input type="number" value={formData.maxPetsPerSession} onChange={e => setFormData(p => ({ ...p, maxPetsPerSession: parseInt(e.target.value) || 1 }))}
                              className="w-full pl-16 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black outline-none focus:ring-4 focus:ring-indigo-500/10" placeholder="1" />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Duration</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {durationPresets.map(d => (
                            <button key={d} type="button" onClick={() => setFormData(p => ({ ...p, duration: d }))}
                              className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${formData.duration === d ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-indigo-200'}`}>
                              {d >= 60 ? `${d / 60}h` : `${d}m`}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          <Clock className="h-5 w-5 text-slate-400" />
                          <input type="number" value={formData.duration} onChange={e => setFormData(p => ({ ...p, duration: parseInt(e.target.value) || 0 }))}
                            className="w-full px-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-black outline-none" placeholder="Custom minutes" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Min</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Buffer Time Between Bookings</label>
                        <div className="flex flex-wrap gap-2">
                          {bufferPresets.map(b => (
                            <button key={b} type="button" onClick={() => setFormData(p => ({ ...p, bufferTime: b }))}
                              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${formData.bufferTime === b ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                              {b === 0 ? 'None' : `${b}m`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Service Description</label>
                        <textarea required value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[13px] font-medium leading-relaxed outline-none h-32 resize-none" placeholder="What does this service include?" />
                      </div>

                      {/* Home Service */}
                      <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Home className="h-5 w-5 text-indigo-600" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Home Service Available</span>
                          </div>
                          <ToggleSwitch enabled={formData.homeServiceAvailable} onToggle={() => setFormData(p => ({ ...p, homeServiceAvailable: !p.homeServiceAvailable }))} size="sm" />
                        </div>
                        {formData.homeServiceAvailable && (
                          <div className="mt-3">
                            <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Home Service Fee (₱)</label>
                            <input type="number" value={formData.homeServicePrice} onChange={e => setFormData(p => ({ ...p, homeServicePrice: parseFloat(e.target.value) || 0 }))}
                              className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl text-sm font-black outline-none" placeholder="0" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 1: PRICING RULES ── */}
              {wizardStep === 1 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <DollarSign className="h-5 w-5 text-amber-600" />
                      <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Dynamic Pricing Engine</p>
                    </div>
                    <p className="text-[11px] text-amber-600 leading-relaxed">Enable pricing adjustments based on pet characteristics and booking context. All rules are optional and can be toggled independently.</p>
                  </div>

                  {/* Pet Size Pricing */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeader icon={Ruler} title="Pet Size Pricing" subtitle="Adjust price based on pet size" color="blue" />
                      <ToggleSwitch enabled={formData.pricingRules.petSize.enabled} onToggle={() => updatePricingRule('petSize', { enabled: !formData.pricingRules.petSize.enabled })} />
                    </div>
                    {formData.pricingRules.petSize.enabled && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in duration-300">
                        {[
                          { key: 'small', label: 'Small', emoji: '🐕' },
                          { key: 'medium', label: 'Medium', emoji: '🐕‍🦺' },
                          { key: 'large', label: 'Large', emoji: '🦮' },
                          { key: 'extraLarge', label: 'Extra Large', emoji: '🐘' }
                        ].map(s => (
                          <div key={s.key} className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100 hover:border-blue-200 transition-all">
                            <span className="text-2xl">{s.emoji}</span>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2 mb-2">{s.label}</p>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">+₱</span>
                              <input type="number" value={formData.pricingRules.petSize[s.key]}
                                onChange={e => updatePricingRule('petSize', { [s.key]: parseFloat(e.target.value) || 0 })}
                                className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-black text-center outline-none focus:ring-2 focus:ring-blue-500/20" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pet Weight Pricing */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeader icon={Weight} title="Weight-Based Pricing" subtitle="Price by weight range" color="green" />
                      <ToggleSwitch enabled={formData.pricingRules.petWeight.enabled} onToggle={() => updatePricingRule('petWeight', { enabled: !formData.pricingRules.petWeight.enabled })} />
                    </div>
                    {formData.pricingRules.petWeight.enabled && (
                      <div className="space-y-3 animate-in fade-in duration-300">
                        {(formData.pricingRules.petWeight.ranges || []).map((range, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                            <span className="text-[9px] font-black text-slate-400 uppercase">{range.minWeight}-{range.maxWeight}kg</span>
                            <span className="text-[10px] font-black text-green-600">+₱{range.adjustment}</span>
                            <button type="button" onClick={() => removeWeightRange(idx)} className="ml-auto text-rose-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                          </div>
                        ))}
                        <div className="grid grid-cols-4 gap-2">
                          <input type="number" placeholder="Min kg" value={newWeightRange.minWeight} onChange={e => setNewWeightRange(p => ({ ...p, minWeight: parseFloat(e.target.value) || 0 }))}
                            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" />
                          <input type="number" placeholder="Max kg" value={newWeightRange.maxWeight} onChange={e => setNewWeightRange(p => ({ ...p, maxWeight: parseFloat(e.target.value) || 0 }))}
                            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" />
                          <input type="number" placeholder="+₱" value={newWeightRange.adjustment} onChange={e => setNewWeightRange(p => ({ ...p, adjustment: parseFloat(e.target.value) || 0 }))}
                            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" />
                          <button type="button" onClick={addWeightRange} className="px-3 py-2.5 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-green-700 transition-all">
                            <Plus className="h-4 w-4 mx-auto" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Breed-Based Pricing */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeader icon={Heart} title="Breed-Based Pricing" subtitle="Custom adjustments per breed" color="pink" />
                      <ToggleSwitch enabled={formData.pricingRules.breed.enabled} onToggle={() => updatePricingRule('breed', { enabled: !formData.pricingRules.breed.enabled })} />
                    </div>
                    {formData.pricingRules.breed.enabled && (
                      <div className="space-y-3 animate-in fade-in duration-300">
                        <div className="flex flex-wrap gap-2">
                          {(formData.pricingRules.breed.breeds || []).map((b, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-full px-4 py-2">
                              <span className="text-[10px] font-black text-pink-700">{b.breed}</span>
                              <span className="text-[10px] font-black text-pink-500">+₱{b.adjustment}</span>
                              <button type="button" onClick={() => removeBreed(idx)} className="text-pink-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input type="text" placeholder="Breed name" value={newBreed.breed} onChange={e => setNewBreed(p => ({ ...p, breed: e.target.value }))}
                            className="col-span-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" />
                          <input type="number" placeholder="Adjustment ₱" value={newBreed.adjustment} onChange={e => setNewBreed(p => ({ ...p, adjustment: parseFloat(e.target.value) || 0 }))}
                            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" />
                          <button type="button" onClick={addBreed} className="px-3 py-2.5 bg-pink-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-pink-700 transition-all flex items-center justify-center gap-2">
                            <Plus className="h-4 w-4" /> Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Condition-Based Fees */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeader icon={AlertCircle} title="Condition-Based Fees" subtitle="Extra charges for special pet conditions" color="red" />
                      <ToggleSwitch enabled={formData.pricingRules.condition.enabled} onToggle={() => updatePricingRule('condition', { enabled: !formData.pricingRules.condition.enabled })} />
                    </div>
                    {formData.pricingRules.condition.enabled && (
                      <div className="space-y-3 animate-in fade-in duration-300">
                        {(formData.pricingRules.condition.conditions || []).map((c, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl p-3">
                            <div>
                              <p className="text-[10px] font-black text-rose-700 uppercase">{c.label}</p>
                              <p className="text-[9px] text-rose-400">{c.condition}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-black text-rose-600">+₱{c.fee}</span>
                              <button type="button" onClick={() => removeCondition(idx)} className="text-rose-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                            </div>
                          </div>
                        ))}
                        <div className="grid grid-cols-4 gap-2">
                          <input type="text" placeholder="ID (e.g. matted)" value={newCondition.condition} onChange={e => setNewCondition(p => ({ ...p, condition: e.target.value }))}
                            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" />
                          <input type="text" placeholder="Label" value={newCondition.label} onChange={e => setNewCondition(p => ({ ...p, label: e.target.value }))}
                            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" />
                          <input type="number" placeholder="Fee ₱" value={newCondition.fee} onChange={e => setNewCondition(p => ({ ...p, fee: parseFloat(e.target.value) || 0 }))}
                            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none" />
                          <button type="button" onClick={addCondition} className="px-3 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-rose-700 transition-all">
                            <Plus className="h-4 w-4 mx-auto" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Time-Based Pricing */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeader icon={Timer} title="Time-Based Pricing" subtitle="Weekday, weekend, holiday & peak hours" color="purple" />
                      <ToggleSwitch enabled={formData.pricingRules.timeBased.enabled} onToggle={() => updatePricingRule('timeBased', { enabled: !formData.pricingRules.timeBased.enabled })} />
                    </div>
                    {formData.pricingRules.timeBased.enabled && (
                      <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { key: 'weekdayRate', label: 'Weekday', emoji: '📅', color: 'slate' },
                            { key: 'weekendRate', label: 'Weekend', emoji: '🎉', color: 'purple' },
                            { key: 'holidayRate', label: 'Holiday', emoji: '🎄', color: 'red' },
                            { key: 'peakHoursRate', label: 'Peak Hours', emoji: '⏰', color: 'amber' }
                          ].map(t => (
                            <div key={t.key} className={`bg-${t.color}-50 rounded-xl p-4 text-center border border-${t.color}-100`}>
                              <span className="text-xl">{t.emoji}</span>
                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2 mb-2">{t.label}</p>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">+₱</span>
                                <input type="number" value={formData.pricingRules.timeBased[t.key]}
                                  onChange={e => updatePricingRule('timeBased', { [t.key]: parseFloat(e.target.value) || 0 })}
                                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-black text-center outline-none" />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Peak Hours Start</label>
                            <input type="time" value={formData.pricingRules.timeBased.peakHoursStart}
                              onChange={e => updatePricingRule('timeBased', { peakHoursStart: e.target.value })}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
                          </div>
                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Peak Hours End</label>
                            <input type="time" value={formData.pricingRules.timeBased.peakHoursEnd}
                              onChange={e => updatePricingRule('timeBased', { peakHoursEnd: e.target.value })}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP 2: ADD-ONS ── */}
              {wizardStep === 2 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <SectionHeader icon={Layers} title="Add-On Services" subtitle="Optional extras customers can select during booking" color="violet" />

                  {/* Existing Add-Ons */}
                  <div className="space-y-3">
                    {formData.addOns.map((addon, idx) => (
                      <div key={idx} className="flex items-center gap-4 bg-violet-50 border border-violet-100 rounded-xl p-4 group hover:shadow-md transition-all">
                        <div className="w-10 h-10 bg-violet-200 rounded-xl flex items-center justify-center text-violet-700 font-black text-sm">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-[11px] font-black text-violet-800 uppercase">{addon.name}</p>
                          {addon.description && <p className="text-[10px] text-violet-500">{addon.description}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-violet-700">₱{addon.price}</p>
                          {addon.duration > 0 && <p className="text-[9px] text-violet-400">+{addon.duration}min</p>}
                        </div>
                        <button type="button" onClick={() => removeAddon(idx)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-rose-100 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add New Add-On Form */}
                  <div className="bg-slate-900 rounded-2xl p-6 text-white">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-4 text-white/60">Add New Add-On</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <input type="text" placeholder="Add-on name (e.g. Nail Trimming)" value={newAddOn.name}
                        onChange={e => setNewAddOn(p => ({ ...p, name: e.target.value }))}
                        className="px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white outline-none placeholder:text-white/30" />
                      <input type="text" placeholder="Description (optional)" value={newAddOn.description}
                        onChange={e => setNewAddOn(p => ({ ...p, description: e.target.value }))}
                        className="px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white outline-none placeholder:text-white/30" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-2">Price (₱)</label>
                        <input type="number" value={newAddOn.price} onChange={e => setNewAddOn(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white outline-none" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-2">Extra Duration (min)</label>
                        <input type="number" value={newAddOn.duration} onChange={e => setNewAddOn(p => ({ ...p, duration: parseInt(e.target.value) || 0 }))}
                          className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white outline-none" />
                      </div>
                      <div className="flex items-end">
                        <button type="button" onClick={addNewAddon}
                          className="w-full py-3 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all flex items-center justify-center gap-2">
                          <Plus className="h-4 w-4" /> Add
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Suggested Add-Ons */}
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Quick Add Popular Add-Ons</p>
                    <div className="flex flex-wrap gap-2">
                      {['Nail Trimming', 'Ear Cleaning', 'Teeth Cleaning', 'De-shedding', 'Flea Bath', 'Paw Moisturizing', 'Cologne Spray', 'Bandana'].map(name => (
                        <button key={name} type="button"
                          onClick={() => {
                            if (!formData.addOns.find(a => a.name === name)) {
                              setFormData(prev => ({ ...prev, addOns: [...prev.addOns, { name, price: 50, duration: 10, description: '', isActive: true }] }));
                            }
                          }}
                          disabled={formData.addOns.find(a => a.name === name)}
                          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all ${formData.addOns.find(a => a.name === name) ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-violet-100 hover:text-violet-600 border border-slate-200'}`}>
                          {formData.addOns.find(a => a.name === name) ? '✓' : '+'} {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 3: SCHEDULE & STAFF ── */}
              {wizardStep === 3 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  {/* Booking Rules */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <SectionHeader icon={Shield} title="Booking Rules" subtitle="Control how customers book this service" color="blue" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Min. Booking Notice (minutes)</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {[0, 30, 60, 120, 240, 1440].map(m => (
                            <button key={m} type="button" onClick={() => setFormData(p => ({ ...p, bookingRules: { ...p.bookingRules, minBookingNotice: m } }))}
                              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${formData.bookingRules.minBookingNotice === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              {m === 0 ? 'None' : m >= 1440 ? `${m/1440}d` : m >= 60 ? `${m/60}h` : `${m}m`}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Max Daily Bookings (0 = unlimited)</label>
                        <input type="number" value={formData.bookingRules.maxDailyBookings}
                          onChange={e => setFormData(p => ({ ...p, bookingRules: { ...p.bookingRules, maxDailyBookings: parseInt(e.target.value) || 0 } }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Capacity Per Slot</label>
                        <input type="number" value={formData.bookingRules.capacityPerSlot}
                          onChange={e => setFormData(p => ({ ...p, bookingRules: { ...p.bookingRules, capacityPerSlot: parseInt(e.target.value) || 1 } }))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none" min="1" />
                      </div>
                    </div>
                  </div>

                  {/* Staff Assignment */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <SectionHeader icon={Users} title="Staff Assignment" subtitle="Assign staff members to handle this service" color="indigo" />

                    {storeStaff.length === 0 ? (
                      <div className="bg-slate-50 rounded-xl p-8 text-center">
                        <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-[11px] font-bold text-slate-400">No staff members found. Add staff first in Staff Management.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {storeStaff.filter(s => s.isActive).map(staff => {
                          const isAssigned = (formData.assignedStaff || []).includes(staff._id);
                          return (
                            <button key={staff._id} type="button" onClick={() => toggleStaffAssignment(staff._id)}
                              className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${isAssigned ? 'bg-indigo-50 border-indigo-300 shadow-md' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}>
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${isAssigned ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                {staff.firstName?.[0]}{staff.lastName?.[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black uppercase truncate">{staff.firstName} {staff.lastName}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{staff.staffType?.replace('_', ' ')}</p>
                              </div>
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isAssigned ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                {isAssigned && <CheckCircle className="h-4 w-4 text-white" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-4 bg-blue-50 rounded-xl p-4 border border-blue-100">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-black text-blue-700 uppercase mb-1">Auto-Assignment</p>
                          <p className="text-[10px] text-blue-600 leading-relaxed">When staff are assigned, the system will automatically assign the least-busy available staff member to each new booking.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 4: IMAGES & REVIEW ── */}
              {wizardStep === 4 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  {/* Gallery */}
                  <div className="p-8 bg-slate-900 rounded-[2rem] text-white relative overflow-hidden">
                    <ImageIcon className="absolute -bottom-16 -right-16 w-64 h-64 opacity-10 pointer-events-none" />
                    <SectionHeader icon={ImageIcon} title="Service Images" subtitle="Upload photos of your service" color="indigo" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      {formData.images.map((img, i) => (
                        <div key={i} className="aspect-square bg-white/5 rounded-2xl overflow-hidden border border-white/10 relative group">
                          <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setFormData(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))}
                            className="absolute inset-0 bg-rose-600/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Trash2 className="h-6 w-6 text-white" />
                          </button>
                        </div>
                      ))}
                      {formData.images.length < 6 && (
                        <label className="aspect-square bg-white/5 rounded-2xl border-2 border-white/10 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all hover:border-indigo-500 group">
                          <Plus className="h-8 w-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Add Image</span>
                          <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Active Toggle */}
                  <div className="bg-emerald-500 p-6 rounded-2xl flex items-center justify-between shadow-xl shadow-emerald-100">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                        <CheckCircle className={`h-7 w-7 ${formData.isActive ? 'text-emerald-500' : 'text-slate-300'}`} />
                      </div>
                      <div>
                        <p className="text-[12px] font-black text-white uppercase tracking-widest mb-0.5">Service Active</p>
                        <p className="text-[10px] font-bold text-emerald-100/70 uppercase tracking-widest">Visible to customers & bookable</p>
                      </div>
                    </div>
                    <ToggleSwitch enabled={formData.isActive} onToggle={() => setFormData(p => ({ ...p, isActive: !p.isActive }))} />
                  </div>

                  {/* Configuration Summary */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <SectionHeader icon={Target} title="Configuration Summary" subtitle="Review before publishing" color="emerald" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Base Price', value: `₱${formData.price.toLocaleString()}` },
                        { label: 'Duration', value: `${formData.duration} min` },
                        { label: 'Pricing Rules', value: `${activePricingRules} active` },
                        { label: 'Add-Ons', value: `${formData.addOns.length} items` },
                        { label: 'Buffer Time', value: formData.bufferTime > 0 ? `${formData.bufferTime} min` : 'None' },
                        { label: 'Staff Assigned', value: `${formData.assignedStaff?.length || 0}` },
                        { label: 'Home Service', value: formData.homeServiceAvailable ? 'Yes' : 'No' },
                        { label: 'Status', value: formData.isActive ? 'Active' : 'Inactive' }
                      ].map((item, i) => (
                        <div key={i} className="bg-slate-50 rounded-xl p-4 text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                          <p className="text-sm font-black text-slate-800">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            <footer className="p-5 bg-white border-t border-slate-50 flex gap-3 shrink-0 relative z-20">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-6 py-2.5 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-100 transition-all active:scale-95">
                Cancel
              </button>
              {wizardStep > 0 && (
                <button type="button" onClick={() => setWizardStep(s => s - 1)}
                  className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all active:scale-95 flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              )}
              <button disabled={submitting} type="button"
                onClick={(e) => {
                  if (wizardStep < wizardSteps.length - 1) {
                    setWizardStep(s => s + 1);
                  } else {
                    handleSubmit(e);
                  }
                }}
                className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] hover:bg-slate-900 hover:scale-[1.02] transition-all shadow-2xl shadow-indigo-200 flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50">
                {submitting ? 'SAVING...' : (
                  wizardStep < wizardSteps.length - 1 ? `Next: ${wizardSteps[wizardStep + 1].label}` : (editingService ? 'Save Changes' : 'Create Service')
                )}
                {wizardStep < wizardSteps.length - 1 ? <ChevronRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-[2rem] p-6 max-w-sm w-full shadow-2xl text-center animate-in zoom-in-95 duration-300 border border-slate-200">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-rose-100"><Trash2 className="h-8 w-8" /></div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-1">Delete Service?</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-6 px-4">Permanent erasure of this service record. Proceed with caution.</p>
            <div className="flex flex-col gap-2.5 px-4">
              <button onClick={confirmDelete} className="w-full py-3 bg-rose-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-rose-200 transition-all hover:bg-rose-700 active:scale-95">Delete Service</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-3 bg-slate-50 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceManagement;
