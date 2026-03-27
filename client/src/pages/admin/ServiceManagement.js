import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Plus, Edit2, Trash2, Clock, Home, MapPin, Package, Users, Shield,
  Zap, Activity, ChevronRight, X, Target, ArrowUpRight, Info, Image as ImageIcon,
  CheckCircle, AlertTriangle, Star, Briefcase, Settings, Calendar, Search, ChevronDown
} from 'lucide-react';

import { serviceService, adminServiceService, uploadService, getImageUrl } from '../../services/apiService';

const PhilippinePeso = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20 11H4" />
    <path d="M20 7H4" />
    <path d="M7 21V4a5 5 0 0 1 5 5c0 2.2-1.8 3-5 3Z" />
  </svg>
);

const ServiceManagement = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState('core');
  const [editingService, setEditingService] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const initialFormState = {
    name: '',
    description: '',
    category: 'grooming',
    duration: 30,
    price: 0,
    homeServiceAvailable: false,
    homeServicePrice: 0,
    maxPetsPerSession: 1,
    requirements: 'Valid ID and contact details, Pet vaccination record, Pet information (breed, age, health status), Signed service consent or waiver, Appointment confirmation (if required)',
    isActive: true,
    images: []
  };

  const [formData, setFormData] = useState(initialFormState);

  const categories = [
    { value: 'grooming', label: 'Grooming', icon: '✨' },
    { value: 'veterinary', label: 'Veterinary', icon: '🏥' },
    { value: 'training', label: 'Training', icon: '🎯' },
    { value: 'boarding', label: 'Boarding', icon: '🏠' },
    { value: 'walking', label: 'Walking', icon: '🚶' },
    { value: 'daycare', label: 'Daycare', icon: '☀️' },
    { value: 'health_check', label: 'Health Check', icon: '🩺' },
    { value: 'consultation', label: 'Consultation', icon: '💬' },
    { value: 'emergency', label: 'Emergency', icon: '🚨' },
    { value: 'other', label: 'Other', icon: '📦' }
  ];

  useEffect(() => { fetchServices(); }, []);

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
    setModalTab('core');
  };

  const handleEdit = (service) => {
    setFormData({
      ...initialFormState,
      ...service,
      requirements: typeof service.requirements === 'string' ? service.requirements : (Array.isArray(service.requirements) ? service.requirements.join(', ') : '')
    });
    setEditingService(service);
    setModalTab('core');
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

  const getCategoryIcon = (cat) => categories.find(c => c.value === cat)?.icon || '📦';

  const durationPresets = [15, 30, 45, 60, 90, 120, 180];

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
            Service <span className="text-indigo-600">List</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Manage your pet services and schedule
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/admin/bookings"
            className="px-8 py-3.5 bg-white border border-slate-100 text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-50 transition-all shadow-sm flex items-center gap-3"
          >
            <Calendar className="h-4 w-4 text-indigo-600" /> View Bookings
          </Link>
          <button onClick={() => { resetForm(); setShowModal(true); }}
            className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3 group">
            <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" /> Add New Service
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Services', value: services.filter(s => s.isActive).length, icon: Activity, color: 'emerald' },
          { label: 'Total Services', value: services.length, icon: Package, color: 'primary' },
          { label: 'Home Service', value: services.filter(s => s.homeServiceAvailable).length, icon: Home, color: 'indigo' },
          { label: 'Total Revenue', value: `₱${services.reduce((a, b) => a + (b.price || 0), 0).toLocaleString()}`, icon: PhilippinePeso, color: 'amber' }
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

      {/* Service HUD Filter - High Contrast & Always Visible */}
      <div className="bg-slate-900 p-2 rounded-[1.5rem] shadow-xl border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-6 relative group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
            </div>
            <input
              type="text" placeholder=""
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-4 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
            />
          </div>
          <div className="md:col-span-4 relative">
            <div className="absolute left-5 top-1/2 -translate-y-1/2">
              <Briefcase className="h-3.5 w-3.5 text-primary-500" />
            </div>
            <select
              value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-14 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
            >
              <option value="" className="bg-slate-900 text-white font-black">ALL SERVICES: VIEW ALL</option>
              {categories.map(c => (
                <option key={c.value} value={c.value} className="bg-slate-900 text-white font-black">{c.label.toUpperCase()}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Services List */}
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
                  {service.homeServiceAvailable && (
                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-500/90 text-white">
                      HOME
                    </span>
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
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Price</p>
                  <p className="text-[13px] font-black text-slate-900 tracking-tight truncate">₱{(service.price || 0).toLocaleString()}</p>
                </div>
                <div className="text-center border-x border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Duration</p>
                  <p className="text-[13px] font-black text-slate-900 tracking-tight">{service.duration}<span className="text-[9px] text-slate-400">m</span></p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Capacity</p>
                  <p className="text-[13px] font-black text-slate-900 tracking-tight">{service.maxPetsPerSession}<span className="text-[9px] text-slate-400">pts</span></p>
                </div>
              </div>

              {/* Action buttons — always visible */}
              <div className="flex gap-2 mt-3">
                <button onClick={() => handleEdit(service)}
                  className="flex-1 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-indigo-600 flex items-center justify-center gap-1.5">
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={() => handleDelete(service._id)}
                  className="px-3 py-2.5 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Service Form */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <header className="p-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-200">
                  <Settings className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-3 w-3 text-indigo-600" />
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em]">Action : {editingService ? 'Update' : 'Add'}</span>
                  </div>
                  <h3 className="text-3xl font-black uppercase text-slate-900 tracking-tighter leading-none">{editingService ? 'Edit Service' : 'Add New Service'}</h3>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"><X className="h-6 w-6" /></button>
            </header>

            {/* Tabs */}
            <nav className="px-8 py-3.5 border-b border-slate-50 flex gap-4 overflow-x-auto no-scrollbar shrink-0 bg-slate-50/50">
              {[
                { id: 'core', label: 'Basic Info', icon: Info },
                { id: 'operations', label: 'Details', icon: Settings },
                { id: 'media', label: 'Images', icon: ImageIcon }
              ].map(tab => (
                <button key={tab.id} onClick={() => setModalTab(tab.id)}
                  className={`px-6 py-3.5 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${modalTab === tab.id ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                  <tab.icon className="h-4 w-4" /> {tab.label}
                </button>
              ))}
            </nav>

            {/* Content Deck */}
            <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
              {/* STAGE 1: CORE DETAILS */}
              {modalTab === 'core' && (
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
                            <button key={c.value} type="button" onClick={() => setFormData(p => ({ ...p, category: c.value }))}
                              className={`p-4 rounded-2xl text-left transition-all border-2 flex items-center gap-3 ${formData.category === c.value ? 'bg-indigo-50 border-indigo-300 shadow-lg' : 'bg-slate-50 border-slate-50 hover:border-slate-200'}`}>
                              <span className="text-lg">{c.icon}</span>
                              <span className="text-[10px] font-black uppercase tracking-widest">{c.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Base Price (₱)</label>
                          <div className="relative">
                            <PhilippinePeso className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-600" />
                            <input type="number" required value={formData.price} onChange={e => setFormData(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                              className="w-full pl-14 pr-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black outline-none focus:ring-4 focus:ring-indigo-500/10" placeholder="0" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Session Capacity</label>
                          <div className="relative">
                            <Users className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                            <input type="number" value={formData.maxPetsPerSession} onChange={e => setFormData(p => ({ ...p, maxPetsPerSession: parseInt(e.target.value) || 1 }))}
                              className="w-full pl-14 pr-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black outline-none" placeholder="1" />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Duration</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {durationPresets.map(d => (
                            <button key={d} type="button" onClick={() => setFormData(p => ({ ...p, duration: d }))}
                              className={`px-4 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${formData.duration === d ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-indigo-200'}`}>
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
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Service Description</label>
                        <textarea required value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                          className="w-full px-8 py-6 bg-slate-50 border border-slate-100 rounded-2xl text-[13px] font-medium leading-relaxed outline-none h-40 resize-none shadow-inner" placeholder="WHAT DOES THIS SERVICE INCLUDE? DETAIL THE EXPERIENCE..." />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 2: OPERATIONS */}
              {modalTab === 'operations' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                  {/* Home Service Config */}
                  <div className="bg-indigo-600 rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl">
                    <Home className="absolute top-10 right-10 w-32 h-32 opacity-10 pointer-events-none" />
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center"><Home className="h-7 w-7" /></div>
                        <div>
                          <h4 className="text-[12px] font-black uppercase tracking-[0.4em]">Home Service</h4>
                          <p className="text-[9px] font-bold text-indigo-200/60 uppercase tracking-widest">Offer this service at the customer's home</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setFormData(p => ({ ...p, homeServiceAvailable: !p.homeServiceAvailable }))}
                        className={`w-16 h-8 rounded-full relative transition-all border-4 border-white/20 ${formData.homeServiceAvailable ? 'bg-white' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${formData.homeServiceAvailable ? 'left-9 bg-indigo-600' : 'left-1 bg-white/40'}`} />
                      </button>
                    </div>

                    {formData.homeServiceAvailable && (
                      <div className="bg-white/10 rounded-2xl p-6 border border-white/10 animate-in fade-in duration-300">
                        <label className="text-[10px] font-black text-indigo-200 uppercase tracking-[0.3em] block mb-3">Home Service Fee (₱)</label>
                        <input type="number" value={formData.homeServicePrice} onChange={e => setFormData(p => ({ ...p, homeServicePrice: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-6 py-3.5 bg-white/10 border border-white/10 rounded-2xl text-xl font-black text-white outline-none focus:bg-white/20" placeholder="0.00" />
                      </div>
                    )}
                  </div>

                  {/* Requirements */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" /> Requirements & Notes
                    </label>
                    <textarea value={formData.requirements} onChange={e => setFormData(p => ({ ...p, requirements: e.target.value }))}
                      className="w-full px-8 py-8 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-medium leading-relaxed h-44 resize-none outline-none shadow-inner"
                      placeholder="E.G. PET MUST HAVE UP-TO-DATE VACCINATIONS, BRING MEDICAL RECORDS, NO AGGRESSIVE PETS..." />
                  </div>
                </div>
              )}

              {/* STAGE 3: MEDIA & STATUS */}
              {modalTab === 'media' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                  {/* Gallery */}
                  <div className="p-10 bg-slate-900 rounded-[3rem] text-white relative overflow-hidden shadow-2xl border border-white/5">
                    <ImageIcon className="absolute -bottom-16 -right-16 w-64 h-64 opacity-10 pointer-events-none" />
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-indigo-600 rounded-2xl"><ImageIcon className="h-5 w-5" /></div>
                      <div>
                        <h4 className="text-[12px] font-black uppercase tracking-[0.4em]">Service Images</h4>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Upload photos of your service</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    <div className="mt-4 text-[9px] font-bold text-white/30 uppercase tracking-widest px-1">SLOTS: {formData.images.length}/6</div>
                  </div>

                  {/* Active Toggle */}
                  <div className="bg-emerald-500 p-8 rounded-2xl flex items-center justify-between shadow-xl shadow-emerald-100">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                        <CheckCircle className={`h-8 w-8 ${formData.isActive ? 'text-emerald-500' : 'text-slate-300'}`} />
                      </div>
                      <div>
                        <p className="text-[12px] font-black text-white uppercase tracking-widest mb-1">Service Active</p>
                        <p className="text-[10px] font-bold text-emerald-100/70 uppercase tracking-widest">Visible to customers & bookable</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setFormData(p => ({ ...p, isActive: !p.isActive }))}
                      className={`w-16 h-8 rounded-full relative transition-all border-4 border-white ${formData.isActive ? 'bg-emerald-900' : 'bg-emerald-600/30'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.isActive ? 'left-9' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="p-8 bg-white border-t border-slate-50 flex gap-4 shrink-0 relative z-20">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-10 py-3.5 bg-slate-50 text-slate-400 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-100 transition-all active:scale-95">
                Cancel
              </button>
              <button disabled={submitting} type="button"
                onClick={(e) => {
                  if (modalTab === 'core') setModalTab('operations');
                  else if (modalTab === 'operations') setModalTab('media');
                  else handleSubmit(e);
                }}
                className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] hover:bg-slate-900 hover:scale-[1.02] transition-all shadow-2xl shadow-indigo-200 flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50">
                {submitting ? 'SAVING...' : (
                  modalTab === 'core' ? 'Details' :
                    modalTab === 'operations' ? 'Images' :
                      editingService ? 'Save Changes' : 'Create Service'
                )}
                {modalTab !== 'media' ? <ChevronRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-[3rem] p-10 max-w-sm w-full shadow-2xl text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6"><Trash2 className="h-10 w-10" /></div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Delete Service?</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-8">This action will permanently remove the service from your store.</p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmDelete} className="w-full py-3.5 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-200">Delete Service</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-3.5 bg-slate-50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceManagement;
