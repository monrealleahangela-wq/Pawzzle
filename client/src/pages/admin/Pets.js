import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminPetService, uploadService, adoptionService, getImageUrl } from '../../services/apiService';
import {
  Heart, Plus, Edit, Trash2, Filter, X, Save, Search, ChevronLeft, ChevronRight,
  Activity, Shield, Image as ImageIcon, Zap, Target, ArrowUpRight, Star, Info,
  AlertTriangle, CheckCircle, PawPrint, Home, Truck, Users2, History, ClipboardList,
  Clock, CheckCircle2, XCircle, MessageSquare, ArrowRight, UserCheck, Minus
} from 'lucide-react';

const AdminPets = () => {
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [modalTab, setModalTab] = useState('identity');
  const [activeTab, setActiveTab] = useState('inventory');
  const [adoptionRequests, setAdoptionRequests] = useState([]);
  const [fetchingAdoptions, setFetchingAdoptions] = useState(false);
  const [adoptionSearch, setAdoptionSearch] = useState('');

  const [filters, setFilters] = useState({ species: '', size: '', gender: '', isAvailable: '', search: '' });

  const initialPetState = {
    name: '', species: 'dog', breed: '', age: '', ageUnit: 'years',
    ageYears: '', ageMonths: '', birthday: '',
    gender: 'male', size: 'medium', weight: '', color: '', description: '', price: '',
    vaccinationStatus: 'none', healthStatus: 'good',
    healthCondition: 'healthy',
    isNegotiable: false,
    dewormed: false,
    spayedNeutered: false,
    listingType: 'sale',
    quantity: 1,
    specialNeeds: '', images: [], isAvailable: true,
    pedigreePapers: false,
    vaccinationRecords: [],
    dewormingRecords: [],
    vetRecords: [],
    permits: [],
    proofOfOwnership: [],
    temperament: '',
    videos: [],
    location: '',
    pickupAvailability: 'scheduled',
    pickupInstructions: '',
    fulfillmentType: 'pickup_only',
    paymentType: 'online_only',
    approvalStatus: 'pending',
    adoptionDetails: {
      requirements: '', trialPeriod: '', homeCheck: false,
      rescuePartner: '', transportAvailable: false,
      isKidFriendly: true, isPetFriendly: true
    },
    status: 'available'
  };

  const handleApprove = async (id) => {
    const notes = window.prompt('Admin Notes (Internal):');
    try {
      await adminPetService.approvePet(id, notes || '');
      toast.success('Listing Approved');
      fetchPets();
      setShowAddForm(false);
    } catch (error) {
      toast.error('Approval failed');
    }
  };

  const handleReject = async (id) => {
    const notes = window.prompt('Reason for Rejection (Required):');
    if (!notes) return;
    try {
      await adminPetService.rejectPet(id, notes);
      toast.success('Listing Rejected');
      fetchPets();
      setShowAddForm(false);
    } catch (error) {
      toast.error('Rejection failed');
    }
  };

  const [petForm, setPetForm] = useState(initialPetState);
  const [editingPet, setEditingPet] = useState(null);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false });

  useEffect(() => {
    if (searchParams.get('action') === 'new') setShowAddForm(true);
    const petId = searchParams.get('edit');
    if (petId) handleEditPet(petId);

    if (activeTab === 'inventory') {
      fetchPets();
    } else {
      fetchAdoptionRequests();
    }
  }, [filters, pagination.currentPage, searchParams, activeTab]);

  const fetchAdoptionRequests = async () => {
    try {
      setFetchingAdoptions(true);
      const response = await adoptionService.getMyRequests();
      setAdoptionRequests(response.data.requests || []);
    } catch (error) {
      console.error('Error fetching pet sales history:', error);
      toast.error('Failed to load pet sales history');
    } finally {
      setFetchingAdoptions(false);
    }
  };

  const handleUpdateAdoptionStatus = async (requestId, newStatus) => {
    try {
      await adoptionService.updateAdoptionStatus(requestId, { status: newStatus });
      toast.success(`Request marked as ${newStatus}`);
      fetchAdoptionRequests();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update request status');
    }
  };

  const fetchPets = async () => {
    try {
      const params = { ...filters, page: pagination.currentPage, limit: 16 };
      const response = await adminPetService.getAllPets(params);
      setPets(response.data.pets || []);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      toast.error('Failed to load pets');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handleDeletePet = async (petId) => {
    if (window.confirm('Are you sure you want to delete this pet?')) {
      try {
        await adminPetService.deletePet(petId);
        toast.success('Pet deleted');
        fetchPets();
      } catch (error) {
        toast.error('Delete failed');
      }
    }
  };

  const handleEditPet = async (petId) => {
    try {
      const response = await adminPetService.getPetById(petId);
      const pet = response.data.pet;
      setEditingPet(pet);
      // Pre-process age for the dual-field UI
      let years = '', months = '';
      if (pet.ageUnit === 'years') {
        years = pet.age;
        months = 0;
      } else {
        years = 0;
        months = pet.age;
      }

      setPetForm({
        ...initialPetState,
        ...pet,
        price: pet.price || '',
        age: pet.age || '',
        ageYears: years,
        ageMonths: months,
        birthday: pet.birthday ? new Date(pet.birthday).toISOString().split('T')[0] : '',
        adoptionDetails: {
          ...initialPetState.adoptionDetails,
          ...(pet.adoptionDetails || {})
        }
      });
      setModalTab('identity');
      setShowAddForm(true);
    } catch (error) {
      toast.error('Error loading pet details');
    }
  };

  const handleOpenModal = () => {
    setEditingPet(null);
    setPetForm(initialPetState);
    setModalTab('identity');
    setShowAddForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Validate Future Date
      if (petForm.birthday && new Date(petForm.birthday) > new Date()) {
        toast.error('Birth date cannot be in the future.');
        setSubmitting(false);
        return;
      }

      // Validate Age
      const years = parseInt(petForm.ageYears) || 0;
      const months = parseInt(petForm.ageMonths) || 0;

      if (years === 0 && months === 0) {
        toast.error('Age cannot be 0 years and 0 months');
        setSubmitting(false);
        return;
      }
      if (years < 0 || months < 0) {
        toast.error('Age values cannot be negative');
        setSubmitting(false);
        return;
      }
      if (years > 25) { // Common realistic limit for most pets we handle
        toast.error('Please enter a realistic age (max 25 years)');
        setSubmitting(false);
        return;
      }

      // Convert back to single fields for backend
      let finalAge = years;
      let finalUnit = 'years';
      if (years === 0) {
        finalAge = months;
        finalUnit = 'months';
      }

      if (petForm.listingType === 'sale' && (parseFloat(petForm.price) <= 0 || !petForm.price)) {
        toast.error('Selling price must be greater than 0');
        setSubmitting(false);
        return;
      }

      if (petForm.description.length < 50) {
        toast.error('Description must be at least 50 characters');
        setSubmitting(false);
        return;
      }

      // Enforce strict system defaults for this flow
      const payload = { 
        ...petForm, 
        age: finalAge, 
        ageUnit: finalUnit,
        price: parseFloat(petForm.price) || 0,
        weight: parseFloat(petForm.weight) || 0,
        quantity: parseInt(petForm.quantity) || 1,
        fulfillmentType: 'pickup_only',
        paymentType: 'online_only'
      };
      if (editingPet) {
        await adminPetService.updatePet(editingPet._id, payload);
        toast.success('Pet updated');
      } else {
        await adminPetService.createPet(payload);
        toast.success('Pet added');
      }
      setShowAddForm(false);
      setEditingPet(null);
      navigate('/admin/pets');
      fetchPets();
    } catch (error) {
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        const errorMsg = error.response.data.errors.map(err => err.msg || err.message).join(', ');
        toast.error(`Validation Error: ${errorMsg}`);
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to save');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const calculateAge = (birthDate) => {
    if (!birthDate) return;
    const birth = new Date(birthDate);
    const today = new Date();

    if (birth > today) {
      toast.error('Birth date cannot be in the future');
      return;
    }

    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    
    if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
      years--;
      months += 12;
    }
    
    setPetForm(prev => ({
      ...prev,
      ageYears: years,
      ageMonths: months,
      birthday: birthDate
    }));
  };

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSubmitting(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append('images', files[i]);
    try {
      const response = await uploadService.uploadMultipleImages(formData);
      const newUrls = response.data.urls || response.data.imageUrls || [];
      setPetForm(prev => ({ ...prev, images: [...prev.images, ...newUrls] }));
      toast.success('Images uploaded');
    } catch (error) {
      console.error('Upload Error:', error);
      toast.error('Upload failed. Please ensure file is valid JPG or PNG.');
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleFileUpload = async (e, field) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSubmitting(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append('images', files[i]);
    try {
      const response = await uploadService.uploadMultipleImages(formData);
      const newUrls = response.data.urls || response.data.imageUrls || [];
      setPetForm(prev => ({ ...prev, [field]: [...prev[field], ...newUrls] }));
      toast.success('Documents uploaded successfully');
    } catch (error) {
      console.error('Upload Error:', error);
      toast.error('Upload failed. Check file types (Images/PDF only).');
    } finally {
      setSubmitting(false);
    }
  };

  const getHealthColor = (status) => {
    const map = { excellent: 'emerald', good: 'primary', fair: 'amber', needs_attention: 'rose' };
    return map[status] || 'slate';
  };
  const getVaccColor = (status) => {
    const map = { fully_vaccinated: 'emerald', partially_vaccinated: 'amber', not_vaccinated: 'rose' };
    return map[status] || 'slate';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2"></div>
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Pets...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-500 text-white rounded-2xl shadow-lg shadow-rose-200">
              <Heart className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em]">ADMIN PANEL : PETS</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 uppercase tracking-tighter leading-[0.9] mb-3">
            Manage <span className="text-rose-500">Pets</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Track and manage your pet inventory and sales
          </p>
        </div>
        <button onClick={handleOpenModal} className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-rose-500 transition-all shadow-xl shadow-slate-200 flex items-center gap-3 group">
          <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" /> Add New Pet
        </button>
      </div>

      {/* View Switcher */}
      <div className="flex gap-4 p-1.5 bg-white rounded-2xl border border-slate-100 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${activeTab === 'inventory' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <PawPrint className="h-4 w-4" /> Pet Inventory
        </button>
        <button
          onClick={() => setActiveTab('adoptions')}
          className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${activeTab === 'adoptions' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <History className="h-4 w-4" /> Sold Pets
        </button>
      </div>

      {activeTab === 'inventory' ? (
        <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Filters */}
          <aside className="lg:w-72 shrink-0 space-y-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                <div className="p-2 bg-slate-900 text-white rounded-2xl"><Filter className="h-4 w-4" /></div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Filters</span>
              </div>

              <div className="relative group">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                   <Search className="h-4 w-4 text-slate-400 group-focus-within:text-primary-600 transition-colors" />
                </div>
                <input
                  type="text" 
                  placeholder="SEARCH PETS..." 
                  value={filters.search} 
                  onChange={e => handleFilterChange('search', e.target.value)}
                  className="w-full pl-16 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary-600/10 placeholder:text-slate-300 transition-all font-sans"
                />
              </div>

              {[
                { field: 'species', label: 'Species', options: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile'] },
                { field: 'size', label: 'Size', options: ['small', 'medium', 'large', 'extra_large'] },
                { field: 'gender', label: 'Gender', options: ['male', 'female'] },
                { field: 'isAvailable', label: 'Availability', options: [{ v: 'true', l: 'AVAILABLE' }, { v: 'false', l: 'RESERVED' }] }
              ].map(({ field, label, options }) => (
                <div key={field} className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">{label}</label>
                  <select value={filters[field]} onChange={e => handleFilterChange(field, e.target.value)}
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none appearance-none focus:ring-2 focus:ring-primary-600/10">
                    <option value="">ALL</option>
                    {options.map(o => typeof o === 'string'
                      ? <option key={o} value={o}>{o.toUpperCase()}</option>
                      : <option key={o.v} value={o.v}>{o.l}</option>
                    )}
                  </select>
                </div>
              ))}

              <button onClick={() => setFilters({ species: '', size: '', gender: '', isAvailable: '', search: '' })}
                className="w-full py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-colors border border-slate-100">
                Reset Filters
              </button>
            </div>
          </aside>

          {/* Pets List */}
          <div className="flex-1 space-y-6">
            {pets.length === 0 ? (
              <div className="py-20 text-center bg-white rounded-[3rem] border border-dashed border-slate-200">
                <Heart className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">No pets found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {pets.map((pet) => (
                  <div key={pet._id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col">
                    {/* Image */}
                    <div className="relative w-full aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                      {pet.images?.[0] ? (
                        <img src={getImageUrl(pet.images[0])} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      ) : (
                        <Heart className="h-10 w-10 text-slate-200" />
                      )}
                      {/* Overlay gradient with health on hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase bg-${getHealthColor(pet.healthStatus)}-500/90 text-white`}>
                          {pet.healthStatus?.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
                        <span className={`px-2.5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-wider shadow-sm ${pet.status === 'available' ? 'bg-emerald-500 text-white' :
                          pet.status === 'reserved' ? 'bg-secondary-500 text-white' :
                            'bg-rose-500 text-white'
                          }`}>
                          {pet.status?.toUpperCase() || (pet.isAvailable ? 'AVAILABLE' : 'RESERVED')}
                        </span>
                        <span className={`px-2.5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-wider shadow-sm ${
                          pet.approvalStatus === 'approved' ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' :
                          pet.approvalStatus === 'rejected' ? 'bg-rose-100 text-rose-600 border border-rose-200' :
                          'bg-secondary-100 text-primary-600 border border-secondary-200'
                        }`}>
                          {pet.approvalStatus?.toUpperCase() || 'PENDING'}
                        </span>
                        <span className={`px-2.5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-wider shadow-sm bg-${getVaccColor(pet.vaccinationStatus)}-500 text-white`}>
                          {pet.vaccinationStatus === 'fully_vaccinated' ? 'FULLY VAX' : pet.vaccinationStatus === 'partially_vaccinated' ? 'PARTIAL VAX' : 'NO VAX'}
                        </span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex-1 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest leading-none mb-1.5">{pet.species} · {pet.gender}</p>
                          <h3 className="text-[16px] font-black text-slate-900 uppercase leading-none truncate mb-2">{pet.name}</h3>
                          <p className="text-[11px] font-bold text-slate-400 uppercase truncate tracking-tight">{pet.breed} · {pet.age} {pet.ageUnit}</p>
                        </div>
                      </div>

                      {/* Price + Action row */}
                      <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between gap-2">
                        <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tighter truncate">
                          ₱{(pet.price || 0).toLocaleString()}
                        </span>
                        <div className="flex gap-1.5 shrink-0">
                          <button 
                            onClick={() => handleEditPet(pet._id)}
                            className="p-2 sm:p-3 bg-slate-900 text-white rounded-2xl hover:bg-rose-500 transition-all shadow-lg active:scale-95"
                            title="Edit Pet"
                          >
                            <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                          <button 
                            onClick={() => handleDeletePet(pet._id)}
                            className="p-2 sm:p-3 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all border border-rose-100 active:scale-95"
                            title="Delete Pet"
                          >
                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pagination.totalPages > 1 && (
              <div className="flex justify-center items-center gap-6 bg-white border border-slate-100 p-4 rounded-2xl w-fit mx-auto shadow-sm">
                <button onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))} disabled={!pagination.hasPrev} className="px-5 py-3.5 bg-slate-50 text-slate-500 rounded-2xl disabled:opacity-20 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Page <span className="text-primary-600 italic px-1">{pagination.currentPage}</span> / {pagination.totalPages}</span>
                <button onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))} disabled={!pagination.hasNext} className="px-5 py-3.5 bg-slate-900 text-white rounded-2xl disabled:opacity-20 text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all"><ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-1">Transaction History</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monitor and manage all pet sales transactions</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative group">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400 group-focus-within:text-primary-600 transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="SEARCH TRANSACTIONS..."
                  value={adoptionSearch}
                  onChange={(e) => setAdoptionSearch(e.target.value)}
                  className="w-64 pl-16 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-primary-600/10 placeholder:text-slate-300 transition-all font-sans"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Biological Subject</th>
                  <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Customer Profile</th>
                  <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Status / Lifecycle</th>
                  <th className="px-8 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                  <th className="px-8 py-3.5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {fetchingAdoptions ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-8 py-6"><div className="h-12 bg-slate-50 rounded-2xl w-full" /></td>
                    </tr>
                  ))
                ) : adoptionRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <ClipboardList className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No transactions found</p>
                    </td>
                  </tr>
                ) : (
                  adoptionRequests.filter(req =>
                    req.pet?.name?.toLowerCase().includes(adoptionSearch.toLowerCase()) ||
                    req.customer?.firstName?.toLowerCase().includes(adoptionSearch.toLowerCase()) ||
                    req.customer?.lastName?.toLowerCase().includes(adoptionSearch.toLowerCase())
                  ).map((req) => (
                    <tr key={req._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-100 rounded-2xl overflow-hidden shrink-0">
                            {req.pet?.images?.[0] ? (
                              <img src={getImageUrl(req.pet.images[0])} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><PawPrint className="h-5 w-5 text-slate-300" /></div>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 uppercase">{req.pet?.name || 'Unknown'}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{req.pet?.species} · {req.pet?.breed}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center">
                            <UserCheck className="h-4 w-4 text-rose-500" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 uppercase">{req.customer?.firstName} {req.customer?.lastName}</p>
                            <p className="text-[9px] font-bold text-slate-400 tracking-tight lowercase">{req.customer?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-1.5">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest w-fit border ${req.status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                            req.status === 'rejected' ? 'bg-rose-50 border-rose-100 text-rose-600' :
                              req.status === 'pending' ? 'bg-secondary-50 border-secondary-100 text-primary-600' :
                                'bg-slate-50 border-slate-100 text-slate-600'
                            }`}>
                            {req.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {new Date(req.createdAt).toLocaleDateString()} <br />
                        <span className="opacity-50 italic">{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/admin/chat?conversation=${req.conversation}`} className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all">
                            <MessageSquare className="h-4 w-4" />
                          </Link>
                          {req.status === 'pending' && (
                            <>
                              <button onClick={() => handleUpdateAdoptionStatus(req._id, 'approved')} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all">
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleUpdateAdoptionStatus(req._id, 'rejected')} className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-500 hover:text-white transition-all">
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {req.status === 'approved' && (
                            <button onClick={() => handleUpdateAdoptionStatus(req._id, 'ready_for_pickup')} className="px-4 py-2 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 transition-all">
                              Ready for Pickup
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 overflow-hidden animate-fade-in">
          <div className="bg-white w-full max-w-4xl rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh] border border-slate-200">
            <header className="p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-500 rounded-xl flex items-center justify-center shadow-xl shadow-rose-200">
                  <Heart className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Shield className="h-2.5 w-2.5 text-rose-500" />
                    <span className="text-[9px] font-black text-rose-500 uppercase tracking-[0.4em] leading-none">Action : {editingPet ? 'Update' : 'Add'}</span>
                  </div>
                  <h3 className="text-xl font-black uppercase text-slate-900 tracking-tighter leading-none">{editingPet ? 'Edit Pet' : 'New Pet'}</h3>
                </div>
              </div>
              <button onClick={() => { setShowAddForm(false); setEditingPet(null); }} className="p-2 w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95 flex items-center justify-center">
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Tabs */}
            <nav className="px-5 py-2 border-b border-slate-50 flex gap-3 overflow-x-auto no-scrollbar shrink-0 bg-slate-50/50">
              {[
                { id: 'identity', label: '1. Basic Info', icon: Info },
                { id: 'health', label: '2. Health', icon: Activity },
                { id: 'commerce', label: '3. Pricing & Docs', icon: ClipboardList },
                { id: 'pickup', label: '4. Pickup', icon: Home },
                { id: 'gallery', label: '5. Photos', icon: ImageIcon }
              ].map(tab => (
                <button key={tab.id} onClick={() => setModalTab(tab.id)}
                  className={`px-5 py-2.5 rounded-xl flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${modalTab === tab.id ? 'bg-white text-rose-500 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                  <tab.icon className="h-3.5 w-3.5" /> {tab.label}
                </button>
              ))}
            </nav>

            {/* Content Deck */}
            <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
              {/* STAGE 1: CORE IDENTITY */}
              {modalTab === 'identity' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  {/* Row 0: Profile Image Upload */}
                  <div className="flex flex-col md:flex-row gap-8 items-center bg-slate-900 p-8 rounded-[3rem] text-white relative overflow-hidden border border-white/5">
                    <div className="relative shrink-0 group">
                      <div className="w-40 h-40 rounded-3xl bg-white/5 border-2 border-white/10 overflow-hidden flex items-center justify-center relative shadow-2xl transition-all group-hover:border-rose-500">
                        {petForm.images[0] ? (
                          <img src={getImageUrl(petForm.images[0])} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-2 opacity-30 text-center">
                            <ImageIcon className="h-8 w-8" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Select Image</span>
                          </div>
                        )}
                        <label className="absolute inset-0 bg-rose-600/90 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus className="h-10 w-10 text-white" />
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                        </label>
                      </div>
                      {petForm.images[0] && (
                        <button type="button" onClick={() => setPetForm(p => ({ ...p, images: p.images.slice(1) }))}
                          className="absolute -top-3 -right-3 w-10 h-10 bg-rose-500 text-white rounded-xl flex items-center justify-center shadow-lg hover:bg-slate-900 transition-all border-2 border-white/20">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    <div className="text-center md:text-left">
                      <h4 className="text-[12px] font-black uppercase tracking-[0.4em] mb-2 text-rose-400">Pet Profile Image</h4>
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest leading-relaxed max-w-xs mx-auto md:mx-0">
                        Upload a primary display photo. This is the first image potential buyers will see.
                      </p>
                      <label className="mt-6 inline-flex items-center gap-3 px-8 py-3 bg-white/10 hover:bg-rose-500 hover:text-white border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all cursor-pointer">
                         Update Highlight Photo
                        <input type="file" accept="image/png, image/jpeg, image/jpg" className="hidden" onChange={handleImageUpload} />
                      </label>
                    </div>
                  </div>

                  {/* Row 1: Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 underline decoration-rose-500/30 underline-offset-4">Pet Alias / Name</label>
                    <input type="text" required value={petForm.name} onChange={e => setPetForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[14px] font-black uppercase outline-none focus:ring-4 focus:ring-rose-500/5 transition-all" placeholder="Enter Pet Name..." />
                  </div>

                  {/* Row 2: Species + Breed */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Species</label>
                      <select value={petForm.species} onChange={e => setPetForm(p => ({ ...p, species: e.target.value }))}
                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none appearance-none cursor-pointer">
                        {['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'other'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Breed</label>
                      <input type="text" required value={petForm.breed} onChange={e => setPetForm(p => ({ ...p, breed: e.target.value }))}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none" placeholder="E.G. GOLDEN RETRIEVER" />
                    </div>
                  </div>

                  {/* Row 3: Birthday + Age Units */}
                  <div className="bg-slate-50/50 border border-slate-100 rounded-[2.5rem] p-8">
                    <div className="flex items-center gap-2 mb-6">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Age & Chronology Information</h4>
                    </div>
                    <div className="grid grid-cols-12 gap-6">
                      <div className="col-span-12 md:col-span-4 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Birth Date</label>
                        <input type="date" value={petForm.birthday} max={new Date().toISOString().split('T')[0]} onChange={e => calculateAge(e.target.value)}
                          className="w-full px-4 py-3.5 bg-white border border-slate-100 rounded-2xl text-[11px] font-black outline-none focus:ring-4 focus:ring-primary-500/5 cursor-pointer transition-all" />
                      </div>
                      <div className="col-span-6 md:col-span-4 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 block opacity-60">Age in Years</label>
                        <div className="flex items-center bg-white border border-slate-100 rounded-2xl overflow-hidden focus-within:ring-4 focus-within:ring-rose-500/5 transition-all">
                          <button type="button" onClick={() => setPetForm(p => ({ ...p, ageYears: Math.max(0, (parseInt(p.ageYears) || 0) - 1) }))} className="px-4 py-3.5 hover:bg-slate-50 text-slate-400 transition-colors">
                            <Minus className="h-3 w-3" />
                          </button>
                          <input type="number" value={petForm.ageYears} onChange={e => setPetForm(p => ({ ...p, ageYears: e.target.value }))}
                            className="w-full bg-transparent text-center font-black text-lg outline-none py-3" placeholder="0" />
                          <button type="button" onClick={() => setPetForm(p => ({ ...p, ageYears: (parseInt(p.ageYears) || 0) + 1 }))} className="px-4 py-3.5 hover:bg-slate-50 text-slate-400 transition-colors">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="col-span-6 md:col-span-4 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 block opacity-60">Extra Months</label>
                        <div className="flex items-center bg-white border border-slate-100 rounded-2xl overflow-hidden focus-within:ring-4 focus-within:ring-rose-500/5 transition-all">
                          <button type="button" onClick={() => setPetForm(p => ({ ...p, ageMonths: Math.max(0, (parseInt(p.ageMonths) || 0) - 1) }))} className="px-4 py-3.5 hover:bg-slate-50 text-slate-400 transition-colors">
                            <Minus className="h-3 w-3" />
                          </button>
                          <input type="number" value={petForm.ageMonths} onChange={e => {
                            let val = parseInt(e.target.value) || 0;
                            if (val > 11) {
                              setPetForm(p => ({ ...p, ageYears: (parseInt(p.ageYears) || 0) + Math.floor(val / 12), ageMonths: val % 12 }));
                            } else {
                              setPetForm(p => ({ ...p, ageMonths: e.target.value }));
                            }
                          }}
                            className="w-full bg-transparent text-center font-black text-lg outline-none py-3" placeholder="0" />
                          <button type="button" onClick={() => {
                            setPetForm(p => {
                              let m = (parseInt(p.ageMonths) || 0) + 1;
                              if (m > 11) return { ...p, ageYears: (parseInt(p.ageYears) || 0) + 1, ageMonths: 0 };
                              return { ...p, ageMonths: m };
                            });
                          }} className="px-4 py-3.5 hover:bg-slate-50 text-slate-400 transition-colors">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Weight & Color */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Weight (KG)</label>
                      <input type="number" value={petForm.weight} onChange={e => setPetForm(p => ({ ...p, weight: e.target.value }))}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black outline-none transition-all focus:ring-4 focus:ring-rose-500/5" placeholder="Optional" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Color / Markings</label>
                      <input type="text" required value={petForm.color} onChange={e => setPetForm(p => ({ ...p, color: e.target.value }))}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none transition-all focus:ring-4 focus:ring-rose-500/5" placeholder="E.G. BRINDLE, SPOTTED..." />
                    </div>
                  </div>

                  {/* Row 5: Gender + Size */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Gender</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['male', 'female'].map(g => (
                          <button key={g} type="button" onClick={() => setPetForm(p => ({ ...p, gender: g }))}
                            className={`py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border-2 ${petForm.gender === g ? 'bg-rose-500 border-rose-400 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-rose-200'}`}>
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Pet Size</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[{ v: 'small', l: 'S' }, { v: 'medium', l: 'M' }, { v: 'large', l: 'L' }, { v: 'extra_large', l: 'XL' }].map(s => (
                          <button key={s.v} type="button" onClick={() => setPetForm(p => ({ ...p, size: s.v }))}
                            className={`py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border-2 ${petForm.size === s.v ? 'bg-slate-900 border-slate-800 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                            {s.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row 6: Description */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Description</label>
                    <textarea required value={petForm.description} onChange={e => setPetForm(p => ({ ...p, description: e.target.value }))}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-medium leading-relaxed outline-none h-28 resize-none focus:ring-4 focus:ring-rose-500/5 transition-all" placeholder="Enter pet description..." />
                  </div>
                </div>
              )}

              {/* STAGE 2: HEALTH PROTOCOLS */}
              {modalTab === 'health' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Vaccination Status */}
                    <div className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
                      <Shield className="absolute top-6 right-6 w-24 h-24 opacity-10 pointer-events-none" />
                      <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-6">Vaccination Status</h4>
                      <div className="space-y-3">
                        {[
                          { v: 'complete', l: 'Protocol Complete ✓' },
                          { v: 'partial', l: 'Partially Vaccinated ~' },
                          { v: 'none', l: 'No Immunization Records ✗' }
                        ].map(opt => (
                          <button key={opt.v} type="button" onClick={() => setPetForm(p => ({ ...p, vaccinationStatus: opt.v }))}
                            className={`w-full p-4 rounded-xl text-left transition-all border-2 ${petForm.vaccinationStatus === opt.v ? 'bg-white/10 border-rose-500 shadow-lg' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                            <p className="text-[10px] font-black uppercase tracking-widest">{opt.l}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick Toggles */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Medical Flags</label>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { id: 'dewormed', label: 'Dewormed', icon: CheckCircle },
                          { id: 'spayedNeutered', label: 'Spayed/Neutered', icon: Shield }
                        ].map(item => (
                          <button key={item.id} type="button" onClick={() => setPetForm(p => ({ ...p, [item.id]: !p[item.id] }))}
                            className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${petForm[item.id] ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                            <item.icon className="h-6 w-6" />
                            <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Current Condition</label>
                        <select value={petForm.healthCondition} onChange={e => setPetForm(p => ({ ...p, healthCondition: e.target.value }))}
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase appearance-none outline-none">
                          <option value="healthy">Healthy (Clear Bill)</option>
                          <option value="needs_monitoring">Needs Monitoring</option>
                          <option value="condition_present">With Existing Condition</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Vet Records Upload */}
                  <div className="bg-slate-50 border border-slate-100 rounded-[2.5rem] p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-900 text-white rounded-xl"><Activity className="h-4 w-4" /></div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Veterinary / Health Records</h4>
                      </div>
                      <label className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer hover:bg-rose-500 transition-all">
                        Upload Record
                        <input type="file" multiple accept="image/*, application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'vetRecords')} />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {petForm.vetRecords.map((url, i) => (
                        <div key={i} className="aspect-[4/3] bg-white rounded-xl border border-slate-200 overflow-hidden relative group">
                          {url.endsWith('.pdf') ? (
                            <div className="w-full h-full flex items-center justify-center bg-slate-100 text-[8px] font-black text-slate-400 uppercase tracking-widest">PDF DOC</div>
                          ) : (
                            <img src={getImageUrl(url)} alt="" className="w-full h-full object-cover" />
                          )}
                          <button onClick={() => setPetForm(p => ({ ...p, vetRecords: p.vetRecords.filter((_, idx) => idx !== i) }))}
                            className="absolute inset-0 bg-rose-500/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Trash2 className="h-6 w-6 text-white" />
                          </button>
                        </div>
                      ))}
                      {petForm.vetRecords.length === 0 && (
                        <div className="col-span-full py-8 text-center bg-white/50 border border-dashed border-slate-200 rounded-2xl">
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">No health records uploaded yet</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 3: PRICING & COMMERCE */}
              {modalTab === 'commerce' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="p-8 bg-slate-900 rounded-[2.5rem] border border-white/5 text-white">
                        <div className="flex items-center gap-3 mb-6">
                          <Zap className="h-4 w-4 text-rose-500" />
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary-500">Sales Configuration</h4>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Selling Price (PHP)</label>
                             <input type="number" required value={petForm.price} onChange={e => setPetForm(p => ({ ...p, price: e.target.value }))}
                               className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-xl font-black outline-none focus:ring-4 focus:ring-rose-500/20" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-widest">Price Negotiable?</span>
                            <button type="button" onClick={() => setPetForm(p => ({ ...p, isNegotiable: !p.isNegotiable }))}
                              className={`w-12 h-6 rounded-full relative transition-all ${petForm.isNegotiable ? 'bg-primary-600' : 'bg-white/10'}`}>
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${petForm.isNegotiable ? 'left-7' : 'left-1'}`} />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100">
                         <div className="flex items-center gap-3 mb-4">
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Inventory Status</h4>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                               <label className="text-[9px] font-black text-emerald-900/40 uppercase tracking-widest">Stock Quantity</label>
                               <input type="number" value={petForm.quantity} onChange={e => setPetForm(p => ({ ...p, quantity: e.target.value }))}
                                 className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-[11px] font-black outline-none" />
                            </div>
                            <div className="space-y-1.5">
                               <label className="text-[9px] font-black text-emerald-900/40 uppercase tracking-widest">Current Status</label>
                               <select value={petForm.status} onChange={e => setPetForm(p => ({ ...p, status: e.target.value }))}
                                 className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-[11px] font-black uppercase outline-none">
                                  <option value="available">Available</option>
                                  <option value="reserved">Reserved</option>
                                  <option value="sold">Sold</option>
                               </select>
                            </div>
                         </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2.5rem]">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 block mb-4">Breeder / Store Documents</label>
                          <div className="space-y-4">
                             <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                <div>
                                   <p className="text-[10px] font-black uppercase">Selling Permits</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">REQUIRED FOR STORES/BREEDERS</p>
                                </div>
                                <label className="p-2 bg-slate-900 text-white rounded-xl cursor-pointer hover:bg-rose-500 transition-colors">
                                   <Plus className="h-4 w-4" />
                                   <input type="file" multiple className="hidden" onChange={e => handleFileUpload(e, 'permits')} />
                                </label>
                             </div>
                             <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                <div>
                                   <p className="text-[10px] font-black uppercase">Proof of Ownership</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">RECOMMENDED FOR ALL SELLERS</p>
                                </div>
                                <label className="p-2 bg-slate-900 text-white rounded-xl cursor-pointer hover:bg-rose-500 transition-colors">
                                   <Plus className="h-4 w-4" />
                                   <input type="file" multiple className="hidden" onChange={e => handleFileUpload(e, 'proofOfOwnership')} />
                                </label>
                             </div>
                          </div>
                       </div>

                       <div className="p-6 bg-rose-50 rounded-[2.5rem] border border-rose-100">
                          <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2 mb-3">
                             <Shield className="h-3 w-3" /> System Enforced Policy
                          </h4>
                          <ul className="space-y-2">
                             <li className="flex items-center gap-2 text-[8px] font-black text-rose-400 uppercase tracking-widest">
                                <CheckCircle className="h-2.5 w-2.5" /> Online Payment Only
                             </li>
                             <li className="flex items-center gap-2 text-[8px] font-black text-rose-400 uppercase tracking-widest">
                                <CheckCircle className="h-2.5 w-2.5" /> Store Pickup Fulfilment
                             </li>
                             <li className="flex items-center gap-2 text-[8px] font-black text-rose-400 uppercase tracking-widest opacity-50">
                                <XCircle className="h-2.5 w-2.5 text-slate-300" /> No Delivery / No COD
                             </li>
                          </ul>
                       </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 4: PICKUP DETAILS */}
              {modalTab === 'pickup' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Pickup Availability</label>
                       <select value={petForm.pickupAvailability} onChange={e => setPetForm(p => ({ ...p, pickupAvailability: e.target.value }))}
                         className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none transition-all focus:ring-4 focus:ring-rose-500/5">
                          <option value="scheduled">By Appointment / Scheduled</option>
                          <option value="same_day">Same Day Pickup Available</option>
                          <option value="next_day">Next Day Pickup Available</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Pickup Location (Store Info)</label>
                       <div className="p-4 bg-slate-900 rounded-2xl border border-white/5 text-white">
                          <div className="flex items-center gap-3">
                             <Home className="h-4 w-4 text-rose-500" />
                             <div>
                                <p className="text-[10px] font-black uppercase tracking-widest">Verified Multi-Vendor Hub</p>
                                <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest italic">Calculated from seller profile</p>
                             </div>
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 underline decoration-rose-500/30 underline-offset-4">Specific Pickup Instructions</label>
                    <textarea
                      value={petForm.pickupInstructions}
                      onChange={e => setPetForm(p => ({ ...p, pickupInstructions: e.target.value }))}
                      className="w-full px-8 py-6 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] h-40 resize-none outline-none focus:ring-4 focus:ring-rose-500/5 shadow-inner"
                      placeholder="E.g. Please bring a carry crate, visit us between 10AM-5PM, entrance near the park..."
                    />
                  </div>
                </div>
              )}

              {/* STAGE 4: VISUAL GALLERY */}
              {modalTab === 'gallery' && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="p-10 bg-slate-900 rounded-[3rem] text-white relative overflow-hidden shadow-2xl border border-white/5">
                    <ImageIcon className="absolute -bottom-16 -right-16 w-64 h-64 opacity-10 pointer-events-none" />
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-rose-500 rounded-2xl"><ImageIcon className="h-5 w-5" /></div>
                      <div>
                        <h4 className="text-[12px] font-black uppercase tracking-[0.4em]">Pet Images</h4>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Upload high-quality pictures of the pet</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {petForm.images.map((img, i) => (
                        <div key={i} className="aspect-square bg-white/5 rounded-2xl overflow-hidden border border-white/10 relative group">
                          <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setPetForm(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))}
                            className="absolute inset-0 bg-rose-600/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Trash2 className="h-6 w-6 text-white" />
                          </button>
                        </div>
                      ))}
                      {petForm.images.length < 10 && (
                        <label className="aspect-square bg-white/5 rounded-2xl border-2 border-white/10 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all hover:border-rose-500 group">
                          <Plus className="h-8 w-8 text-rose-500 mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Add Image</span>
                          <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                        </label>
                      )}
                    </div>
                    <div className="mt-6 flex justify-between items-center px-1">
                      <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">SLOTS: {petForm.images.length}/10</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="p-5 bg-white border-t border-slate-50 flex gap-3 shrink-0 relative z-20">
              <button type="button" onClick={() => { setShowAddForm(false); setEditingPet(null); }}
                className="px-8 py-3 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95">
                Cancel
              </button>
              <button disabled={submitting} type="button"
                onClick={(e) => {
                  if (modalTab === 'identity') setModalTab('health');
                  else if (modalTab === 'health') setModalTab('commerce');
                  else if (modalTab === 'commerce') setModalTab('pickup');
                  else if (modalTab === 'pickup') setModalTab('gallery');
                  else handleSubmit(e);
                }}
                className="flex-1 py-3.5 bg-rose-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 hover:scale-[1.02] transition-all shadow-2xl shadow-rose-200 flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50">
                {submitting ? 'Saving...' : (
                  modalTab === 'identity' ? 'Next: Health Protocols' :
                    modalTab === 'health' ? 'Next: Pricing & Docs' :
                      modalTab === 'commerce' ? 'Next: Pickup Details' :
                        modalTab === 'pickup' ? 'Next: Pet Gallery' :
                          editingPet ? 'Save Changes' : 'Add Pet'
                )}
                {modalTab !== 'gallery' ? <ChevronRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPets;
