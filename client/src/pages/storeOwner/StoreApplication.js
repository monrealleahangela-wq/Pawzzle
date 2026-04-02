import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import storeApplicationService from '../../services/storeApplicationService';
import { Upload, FileText, AlertCircle, Building, Phone, Mail, MapPin, Check, X, Shield, Users, ArrowRight, ChevronRight, Briefcase, Globe, Info, Wallet, Camera } from 'lucide-react';
import { getCitiesByProvince, getBarangaysByCity } from '../../constants/locationConstants';
import MapPicker from '../../components/MapPicker';

const StoreApplication = () => {
  const { user, updateUser } = useAuth();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // Start at 0 for Prerequisites
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [formData, setFormData] = useState({
    businessName: '',
    businessType: '',
    legalStructure: 'single_proprietorship',
    yearsInBusiness: 0,
    numberOfEmployees: 1,
    hasPhysicalStore: true,
    businessLicense: {
      number: '',
      issuingAuthority: '',
      issueDate: '',
      expiryDate: ''
    },
    taxId: '',
    contactInfo: {
      phone: '',
      email: user?.email || '',
      address: {
        street: '',
        city: '',
        barangay: '',
        state: 'cavite',
        zipCode: '',
        country: 'PH'
      }
    },
    paymentInfo: {
      bankName: '',
      bankAccountName: '',
      bankAccountNumber: '',
      alternativePaymentMethod: {
        provider: 'GCash',
        accountNumber: ''
      }
    },
    productsOffered: [],
    businessDescription: '',
    emergencyContact: {
      name: '',
      phone: '',
      relationship: ''
    },
    references: [
      { name: '', business: '', phone: '', email: '' },
      { name: '', business: '', phone: '', email: '' }
    ]
  });
  const [addressInputType, setAddressInputType] = useState('map'); // 'map' or 'manual'
  const [files, setFiles] = useState({
    licenseDocument: null,
    governmentId: null,
    businessRegistration: null,
    birRegistration: null,
    barangayClearance: null,
    storeLogo: null
  });

  useEffect(() => {
    checkExistingApplication();
  }, []);

  useEffect(() => {
    setCities(getCitiesByProvince('cavite'));
    if (formData.contactInfo.address.city) {
      setBarangays(getBarangaysByCity(formData.contactInfo.address.city));
    }
  }, [formData.contactInfo.address.city]);

  const checkExistingApplication = async () => {
    try {
      const data = await storeApplicationService.getUserApplication();
      if (data.application) {
        setApplication(data.application);
        if (data.application.status === 'approved' && user.role === 'customer') {
          try {
            const response = await fetch('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              }
            });
            const userData = await response.json();
            updateUser(userData.user);
            toast.success('Congratulations! Your application has been approved.');
          } catch (error) {
            console.error('Error updating user role:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error checking application:', error);
    }
  };

  const handleChange = (field, value) => {
    if (field.includes('.')) {
      const parts = field.split('.');
      if (parts.length === 3) {
        const [parent, child, grandChild] = parts;
        setFormData(prev => ({
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: {
              ...prev[parent][child],
              [grandChild]: value,
              ...(grandChild === 'city' ? { barangay: '' } : {})
            }
          }
        }));
      } else {
        const [parent, child] = parts;
        setFormData(prev => ({
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: value
          }
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleReferenceChange = (index, field, value) => {
    const newReferences = [...formData.references];
    newReferences[index][field] = value;
    setFormData(prev => ({ ...prev, references: newReferences }));
  };

  const handleFileChange = (fileType, file) => {
    setFiles(prev => ({ ...prev, [fileType]: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        if (typeof formData[key] === 'object') {
          formDataToSend.append(key, JSON.stringify(formData[key]));
        } else {
          formDataToSend.append(key, formData[key]);
        }
      });

      if (files.licenseDocument) formDataToSend.append('licenseDocument', files.licenseDocument);
      if (files.governmentId) formDataToSend.append('governmentId', files.governmentId);
      if (files.businessRegistration) formDataToSend.append('businessRegistration', files.businessRegistration);
      if (files.birRegistration) formDataToSend.append('birRegistration', files.birRegistration);
      if (files.barangayClearance) formDataToSend.append('barangayClearance', files.barangayClearance);
      if (files.storeLogo) formDataToSend.append('storeLogo', files.storeLogo);

      const data = await storeApplicationService.submitApplication(formDataToSend);
      toast.success('Application submitted successfully!');
      setApplication(data.application);
    } catch (error) {
      toast.error('Error submitting application');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-amber-100 text-amber-800',
      under_review: 'bg-primary-100 text-primary-800',
      approved: 'bg-emerald-100 text-emerald-800',
      rejected: 'bg-rose-100 text-rose-800',
      requires_more_info: 'bg-orange-100 text-orange-800'
    };
    return colors[status] || 'bg-slate-100 text-slate-800';
  };

  const handleReapply = () => {
    if (!application) return;

    // Pre-fill form from existing application
    setFormData({
      businessName: application.businessName || '',
      businessType: application.businessType || '',
      legalStructure: application.legalStructure || 'single_proprietorship',
      yearsInBusiness: application.yearsInBusiness || 0,
      numberOfEmployees: application.numberOfEmployees || 1,
      hasPhysicalStore: application.hasPhysicalStore ?? true,
      businessLicense: application.businessLicense || {
        number: '',
        issuingAuthority: '',
        issueDate: '',
        expiryDate: ''
      },
      taxId: application.taxId || '',
      contactInfo: {
        phone: application.contactInfo?.phone || '',
        email: application.contactInfo?.email || user?.email || '',
        address: {
          street: application.contactInfo?.address?.street || '',
          city: application.contactInfo?.address?.city || '',
          barangay: application.contactInfo?.address?.barangay || '',
          state: application.contactInfo?.address?.state || 'cavite',
          zipCode: application.contactInfo?.address?.zipCode || '',
          country: application.contactInfo?.address?.country || 'PH'
        }
      },
      paymentInfo: application.paymentInfo || {
        bankName: '',
        bankAccountName: '',
        bankAccountNumber: '',
        alternativePaymentMethod: {
          provider: 'GCash',
          accountNumber: ''
        }
      },
      productsOffered: application.productsOffered || [],
      businessDescription: application.businessDescription || '',
      emergencyContact: application.emergencyContact || {
        name: '',
        phone: '',
        relationship: ''
      },
      references: application.references?.length >= 2 ? application.references : [
        { name: '', business: '', phone: '', email: '' },
        { name: '', business: '', phone: '', email: '' }
      ]
    });

    // Store the old application for correction highlighting but go to form
    const oldApp = { ...application };
    setApplication(null);
    // Use a small timeout or state to ensure we show corrections
    setTimeout(() => {
      setPreviousApplicationToCorrect(oldApp);
    }, 100);
  };

  const [previousApplicationToCorrect, setPreviousApplicationToCorrect] = useState(null);

  const isFieldBroken = (fieldName) => {
    return previousApplicationToCorrect?.requiredCorrections?.includes(fieldName);
  };

  if (application) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div className="flex items-center justify-between bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full blur-3xl -translate-y-12 translate-x-12" />
          <div className="relative z-10">
            <p className="text-[10px] font-black text-primary-600 uppercase tracking-[0.3em] mb-2">Protocol Execution</p>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Application Protocol Status</h1>
            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">Ref: {application._id}</p>
          </div>
          <span className={`relative z-10 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm ${getStatusColor(application.status)}`}>
            {application.status.replace('_', ' ')}
          </span>
        </div>

        <div className="card p-10 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Building className="h-5 w-5 text-primary-600" />
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Business Identity</h3>
                  <p className="text-lg font-black text-slate-900 uppercase leading-none">{application.businessName}</p>
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Intelligence Summary</p>
                <p className="text-xs font-bold text-slate-600 leading-relaxed">"{application.businessDescription || 'No description provided.'}"</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Classification', value: application.businessType.replace('_', ' '), icon: Briefcase },
                { label: 'Trust Index', value: `${application.verificationScore}%`, icon: Shield, color: application.verificationScore >= 85 ? 'text-emerald-600' : 'text-amber-600' },
                { label: 'Frequency', value: `${application.yearsInBusiness || 0} Years`, icon: Check },
                { label: 'Employees', value: application.numberOfEmployees || 1, icon: Users }
              ].map((stat, i) => (
                <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                  <div className="flex items-center gap-2">
                    <stat.icon className="h-3 w-3 text-slate-400" />
                    <p className={`text-xs font-black uppercase ${stat.color || 'text-slate-900'}`}>{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(application.status === 'rejected' || application.status === 'requires_more_info') && (
            <div className={`p-8 rounded-[2rem] border animate-slide-up ${application.status === 'rejected' ? 'bg-rose-50 border-rose-100' : 'bg-orange-50 border-orange-100'}`}>
               <div className="flex items-center gap-3 mb-4">
                 <div className={`p-2 rounded-lg ${application.status === 'rejected' ? 'bg-rose-600 text-white' : 'bg-orange-600 text-white'}`}>
                   <AlertCircle className="h-5 w-5" />
                 </div>
                 <h4 className={`text-sm font-black uppercase tracking-widest ${application.status === 'rejected' ? 'text-rose-900' : 'text-orange-900'}`}>
                   {application.status === 'rejected' ? 'Application Rejected' : 'Additional Information Required'}
                 </h4>
               </div>
               
               {application.rejectionReason && (
                 <div className="space-y-2 mb-4">
                   <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest leading-none">Primary Reason</p>
                   <p className="text-sm font-bold text-slate-800 leading-relaxed bg-white/50 p-4 rounded-xl border border-rose-50">{application.rejectionReason}</p>
                 </div>
               )}

               {application.reviewNotes && (
                 <div className="space-y-2">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Reviewer Feedback</p>
                   <p className="text-xs font-bold text-slate-600 leading-relaxed bg-white/50 p-4 rounded-xl border border-slate-100">{application.reviewNotes}</p>
                 </div>
               )}

               {(application.status === 'rejected' || application.status === 'requires_more_info') && (
                 <button 
                   onClick={handleReapply}
                   className={`mt-6 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-lg ${application.status === 'rejected' ? 'bg-rose-600 hover:bg-slate-900' : 'bg-orange-600 hover:bg-slate-900'}`}
                 >
                   {application.status === 'rejected' ? 'Re-apply with Corrected Documents' : 'Submit Required Corrections'}
                 </button>
               )}
            </div>
          )}

          <div className="space-y-6 pt-10 border-t border-slate-50">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
              <Mail className="h-3 w-3 text-primary-500" /> Operational Hub
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Direct Line</p>
                <p className="text-sm font-black text-slate-900">{application.contactInfo?.phone}</p>
              </div>
              <div className="md:col-span-1 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Communication</p>
                <p className="text-sm font-black text-slate-900 truncate">{application.contactInfo?.email}</p>
              </div>
              <div className="md:col-span-1 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Site</p>
                <p className="text-sm font-black text-primary-600 truncate">{application.website || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Become an Elite Partner</h1>
          <p className="text-slate-500 font-bold text-[11px] uppercase tracking-widest mt-1">Initialize your business presence within our supreme fleet</p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${currentStep >= s ? 'bg-primary-600' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      {/* Progress Steps Header */}
      <div className="grid grid-cols-4 gap-4 p-2 bg-slate-50 rounded-2xl border border-slate-100">
        {[
          { icon: Building, label: 'Identity' },
          { icon: FileText, label: 'Legal/Tax' },
          { icon: Shield, label: 'Compliance' },
          { icon: Users, label: 'Network' }
        ].map((step, idx) => (
          <div key={idx} className={`flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${currentStep === idx + 1 ? 'bg-white shadow-sm border border-slate-100' : 'opacity-40'}`}>
            <step.icon className={`h-4 w-4 ${currentStep === idx + 1 ? 'text-primary-600' : 'text-slate-400'}`} />
            <span className="text-[9px] font-black uppercase tracking-widest">{step.label}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in">
        <div className="bg-primary-50 border border-primary-200 rounded-[2rem] p-6 mb-8 flex items-start gap-4">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
            <Info className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="text-[11px] font-black text-primary-900 uppercase tracking-widest mb-1">Prerequisites</p>
            <p className="text-[10px] text-primary-800 font-bold leading-relaxed uppercase opacity-70">
              Valid Business Permit · TIN · Liability Insurance (min. 100k PHP) · 2 Commercial References.
              <br />Score 85% for instant approval.
            </p>
          </div>
        </div>

        {currentStep === 0 && (
          <div className="card p-8 sm:p-12 space-y-10 animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-50 rounded-full blur-[100px] -translate-y-20 translate-x-20" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-primary-600 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-primary-200">
                  <Shield className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Application Requirements</h2>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Verification Protocol v2.1</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <h3 className="text-sm font-black text-primary-600 uppercase tracking-[0.2em] border-b border-primary-100 pb-2">Mandatory Documents</h3>
                  <ul className="space-y-4">
                    {[
                      'Valid Government-Issued ID',
                      'Business Registration Certificate (DTI/SEC)',
                      'Mayor\'s / Business Permit',
                      'BIR Certificate (Form 2303)',
                      'Barangay Clearance'
                    ].map((req, i) => (
                      <li key={i} className="flex items-start gap-3 group">
                        <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-emerald-500 group-hover:border-emerald-500 transition-all">
                          <Check className="h-3 w-3 text-emerald-600 group-hover:text-white" />
                        </div>
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide group-hover:text-slate-900 transition-colors">{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-6">
                  <h3 className="text-sm font-black text-primary-600 uppercase tracking-[0.2em] border-b border-primary-100 pb-2">Business Data Intel</h3>
                  <div className="space-y-4">
                    <div className="flex gap-2 flex-wrap">
                      {['Store Name', 'Logo', 'Description', 'Base Address', 'Contact', 'Product Index'].map((tag, i) => (
                        <span key={i} className="px-3 py-1.5 bg-slate-50 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-100">{tag}</span>
                      ))}
                    </div>
                    <div className="p-5 bg-primary-50 rounded-2xl border border-primary-100">
                      <p className="text-[10px] font-black text-primary-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Wallet className="h-3 w-3" /> Payout Channels
                      </p>
                      <p className="text-[9px] text-primary-600 font-medium leading-relaxed uppercase opacity-80">
                        Active Bank Account or alternative payment method (GCash/PayMaya) is required for store settlements.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-12 p-6 bg-slate-900 rounded-[2rem] text-white flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-primary-400" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed max-w-sm">
                    All submitted applications undergo verification. Once approved, you gain access to the <span className="text-primary-400">Owner Dashboard</span>.
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-10 py-4 bg-primary-600 hover:bg-white hover:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-xl shadow-primary-900/20 flex items-center gap-2 group shrink-0"
                >
                  Initiate Upload <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="card p-10 space-y-8 animate-slide-up">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  Store Name * {isFieldBroken('businessName') && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[7px] animate-pulse">ACTION REQUIRED</span>}
                </label>
                <input type="text" className={`input-premium ${isFieldBroken('businessName') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} placeholder="Official Business Title" value={formData.businessName} onChange={(e) => handleChange('businessName', e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  Store Logo * {isFieldBroken('storeLogo') && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[7px] animate-pulse">RESUBMIT REQUIRED</span>}
                </label>
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center relative overflow-hidden group transition-all ${isFieldBroken('storeLogo') ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                    {files.storeLogo ? (
                      <img src={URL.createObjectURL(files.storeLogo)} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="h-6 w-6 text-slate-300 group-hover:text-primary-500 transition-colors" />
                    )}
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileChange('storeLogo', e.target.files[0])} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hi-Res Recommended</p>
                    <p className="text-[7px] text-slate-400 uppercase">PNG, JPG up to 5MB</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                Business Description * {isFieldBroken('businessDescription') && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[7px] animate-pulse">NEEDS CLARIFICATION</span>}
              </label>
              <textarea className={`input-premium min-h-[120px] ${isFieldBroken('businessDescription') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} value={formData.businessDescription} onChange={(e) => handleChange('businessDescription', e.target.value)} placeholder="Experience, specialties, and vision..." required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Primary Services/Products *</label>
                <input type="text" className="input-premium" placeholder="e.g. Pet Care, Premium Feeds, Breeding" value={formData.productsOffered.join(', ')} onChange={(e) => handleChange('productsOffered', e.target.value.split(',').map(s => s.trim()))} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  Business Type * {isFieldBroken('businessType') && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[7px] animate-pulse">INVALID SELECTION</span>}
                </label>
                <select className={`input-premium ${isFieldBroken('businessType') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} value={formData.businessType} onChange={(e) => handleChange('businessType', e.target.value)} required>
                  <option value="">Select type</option>
                  <option value="pet_store">Pet Store</option>
                  <option value="breeder">Breeder</option>
                  <option value="shelter">Animal Shelter</option>
                  <option value="veterinary">Veterinary Clinic</option>
                  <option value="grooming">Pet Grooming</option>
                  <option value="training">Pet Training</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="card p-10 space-y-8 animate-slide-up">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  <FileText className="h-3 w-3 text-primary-500" /> Identity Verification
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      Tax ID (TIN) * {isFieldBroken('taxId') && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[7px] animate-pulse">VERIFICATION FAILED</span>}
                    </label>
                    <input type="text" className={`input-premium ${isFieldBroken('taxId') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} value={formData.taxId} onChange={(e) => handleChange('taxId', e.target.value)} required />
                  </div>
                  <div className={`p-6 rounded-2xl border border-dashed transition-all ${isFieldBroken('governmentId') ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-100' : 'bg-slate-50 border-slate-200'}`}>
                    <input type="file" onChange={(e) => handleFileChange('governmentId', e.target.files[0])} className="hidden" id="govIdFile" />
                    <label htmlFor="govIdFile" className="cursor-pointer flex flex-col items-center gap-2">
                      <Shield className="h-5 w-5 text-slate-400" />
                      <p className="text-[10px] font-black text-slate-900 uppercase">Valid Government ID</p>
                      {files.governmentId && <span className="text-[10px] text-emerald-600 font-black truncate max-w-[200px]">{files.governmentId.name}</span>}
                    </label>
                  </div>
                </div>
              </div>

                <div className="flex items-center justify-between gap-4 mb-4">
                  <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Building className="h-3 w-3 text-primary-500" /> Base Registry {isFieldBroken('address') && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[7px] animate-pulse ml-2">UPDATE LOCATION</span>}
                  </h3>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAddressInputType('map')}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${addressInputType === 'map' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      MAP GPS
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddressInputType('manual')}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${addressInputType === 'manual' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      MANUAL
                    </button>
                  </div>
                </div>

                {addressInputType === 'map' ? (
                  <MapPicker 
                    onLocationSelected={(location) => {
                      setFormData(prev => ({
                        ...prev,
                        contactInfo: {
                          ...prev.contactInfo,
                          address: {
                            ...prev.contactInfo.address,
                            street: location.street || location.full,
                            city: location.city.toLowerCase().replace(/\s+/g, '_').replace('municipality_of_', ''),
                            barangay: location.barangay.toLowerCase().replace(/\s+/g, '_'),
                            zipCode: location.zipCode || prev.contactInfo.address.zipCode
                          }
                        }
                      }));
                    }}
                    initialAddress={formData.contactInfo.address.street}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-4 animate-fade-in">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">City *</label>
                      <select className={`input-premium ${isFieldBroken('address') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} value={formData.contactInfo.address.city} onChange={(e) => handleChange('contactInfo.address.city', e.target.value)} required>
                        <option value="">Select City</option>
                        {cities.map(city => <option key={city.value} value={city.value}>{city.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Barangay *</label>
                      <select className={`input-premium ${isFieldBroken('address') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} value={formData.contactInfo.address.barangay} onChange={(e) => handleChange('contactInfo.address.barangay', e.target.value)} disabled={!formData.contactInfo.address.city} required>
                        <option value="">Select Barangay</option>
                        {barangays.map(bg => <option key={bg.value} value={bg.value}>{bg.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Street Address *</label>
                      <input type="text" className={`input-premium ${isFieldBroken('address') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} value={formData.contactInfo.address.street} onChange={(e) => handleChange('contactInfo.address.street', e.target.value)} required />
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="card p-10 space-y-10 animate-slide-up">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Compliance Vault</h3>
                <div className="space-y-4">
                    { [
                      { id: 'businessRegistration', label: 'DTI / SEC Certificate' },
                      { id: 'mayorsPermit', label: 'Mayor\'s / Business Permit' },
                      { id: 'birRegistration', label: 'BIR Form 2303' },
                      { id: 'barangayClearance', label: 'Barangay Clearance' }
                    ].map((doc) => (
                      <div key={doc.id} className={`p-4 rounded-2xl border flex items-center justify-between group transition-all ${isFieldBroken(doc.id) ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-100 shadow-lg' : 'bg-slate-50 border-slate-100 hover:border-primary-200'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isFieldBroken(doc.id) ? 'bg-rose-600 text-white' : files[doc.id] ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-slate-400'}`}>
                            {isFieldBroken(doc.id) ? <AlertCircle className="h-4 w-4" /> : files[doc.id] ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{doc.label}</p>
                            {isFieldBroken(doc.id) && <p className="text-[7px] text-rose-600 font-black uppercase mt-0.5">RESUBMISSION REQUIRED</p>}
                          </div>
                        </div>
                        <input type="file" className="hidden" id={doc.id} onChange={(e) => handleFileChange(doc.id, e.target.files[0])} />
                        <label htmlFor={doc.id} className={`cursor-pointer px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all shadow-sm ${isFieldBroken(doc.id) ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-white text-primary-600 border border-slate-100 hover:bg-primary-600 hover:text-white'}`}>
                          {isFieldBroken(doc.id) ? 'Redo Upload' : files[doc.id] ? 'Replace' : 'Upload'}
                        </label>
                      </div>
                    ))}
                </div>
              </div>

              <div className="space-y-8">
                <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  Settlement Information {isFieldBroken('paymentInfo') && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[7px] animate-pulse ml-2">DATA MISMATCH</span>}
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Bank Name</label>
                    <input type="text" className={`input-premium ${isFieldBroken('paymentInfo') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} placeholder="e.g. BDO, BPI, UnionBank" value={formData.paymentInfo.bankName} onChange={(e) => handleChange('paymentInfo.bankName', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Name</label>
                    <input type="text" className={`input-premium ${isFieldBroken('paymentInfo') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} value={formData.paymentInfo.bankAccountName} onChange={(e) => handleChange('paymentInfo.bankAccountName', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Number</label>
                    <input type="text" className={`input-premium ${isFieldBroken('paymentInfo') ? 'border-rose-500 ring-2 ring-rose-100' : ''}`} value={formData.paymentInfo.bankAccountNumber} onChange={(e) => handleChange('paymentInfo.bankAccountNumber', e.target.value)} />
                  </div>
                  
                  <div className="pt-4 mt-4 border-t border-slate-100">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block mb-3">Alternative Payment Method</label>
                    <div className="flex gap-4">
                      <select className="input-premium w-1/3" value={formData.paymentInfo.alternativePaymentMethod.provider} onChange={(e) => handleChange('paymentInfo.alternativePaymentMethod.provider', e.target.value)}>
                        <option value="GCash">GCash</option>
                        <option value="PayMaya">PayMaya</option>
                        <option value="Other">Other</option>
                      </select>
                      <input type="text" className="input-premium flex-1" placeholder="Account Number" value={formData.paymentInfo.alternativePaymentMethod.accountNumber} onChange={(e) => handleChange('paymentInfo.alternativePaymentMethod.accountNumber', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="card p-10 space-y-8 animate-slide-up">
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                <Users className="h-4 w-4 text-primary-500" /> Professional Network {isFieldBroken('references') && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-md text-[7px] animate-pulse ml-2">UNVERIFIED CONTACTS</span>}
              </h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-4">Verification requires two commercial character references.</p>
              {formData.references.map((ref, idx) => (
                <div key={idx} className={`p-6 rounded-2xl border grid grid-cols-2 gap-4 relative mt-4 transition-all ${isFieldBroken('references') ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                  <span className={`absolute -top-3 left-4 px-2 py-0.5 border rounded text-[7px] font-black uppercase ${isFieldBroken('references') ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-100 text-slate-400'}`}>Reference Protocol {idx + 1}</span>
                  <input type="text" className="input-premium bg-white" placeholder="Contact Name" value={ref.name} onChange={(e) => handleReferenceChange(idx, 'name', e.target.value)} required />
                  <input type="text" className="input-premium bg-white" placeholder="Business / Organization" value={ref.business} onChange={(e) => handleReferenceChange(idx, 'business', e.target.value)} required />
                  <input type="tel" className="input-premium bg-white" placeholder="Secure Line" value={ref.phone} onChange={(e) => handleReferenceChange(idx, 'phone', e.target.value)} required />
                  <input type="email" className="input-premium bg-white" placeholder="Email Communication" value={ref.email} onChange={(e) => handleReferenceChange(idx, 'email', e.target.value)} required />
                </div>
              ))}
            </div>

            <button type="submit" disabled={loading} className="w-full py-6 bg-primary-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.4em] hover:bg-slate-900 transition-all shadow-2xl shadow-primary-200 disabled:opacity-50 active:scale-95">
              {loading ? 'Transmitting Intelligence...' : 'Finalize Application Protocol'}
            </button>
          </div>
        )}

        {currentStep > 0 && (
          <div className="flex justify-between items-center bg-white/50 backdrop-blur-md p-2 rounded-full border border-slate-100">
            <button type="button" onClick={() => setCurrentStep(prev => prev - 1)} className="h-12 px-8 rounded-full text-[9px] font-black uppercase tracking-widest transition-all text-slate-500 hover:bg-slate-50">Back</button>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map(s => <div key={s} className={`w-2 h-2 rounded-full transition-all duration-300 ${currentStep === s ? 'bg-primary-600 w-6' : 'bg-slate-200'}`} />)}
            </div>
            {currentStep < 4 ? (
              <button type="button" onClick={() => setCurrentStep(prev => prev + 1)} className="h-12 px-8 bg-slate-900 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-xl hover:bg-primary-700 active:scale-95 transition-all flex items-center gap-2">
                Next Module <ArrowRight className="h-3 w-3" />
              </button>
            ) : <div className="w-32" />}
          </div>
        )}
      </form>
    </div>
  );
};

export default StoreApplication;
