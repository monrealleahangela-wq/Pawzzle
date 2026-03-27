import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import storeApplicationService from '../../services/storeApplicationService';
import { getImageUrl } from '../../services/apiService';
import {
  Building,
  FileText,
  Check,
  X,
  Eye,
  AlertTriangle,
  TrendingUp,
  Target,
  Shield,
  Zap,
  Briefcase,
  ChevronRight,
  ShieldAlert,
  Search,
  Activity,
  ExternalLink,
  Wallet,
  Camera,
  MapPin,
  Phone
} from 'lucide-react';

const StoreApplications = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    search: ''
  });
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    status: '',
    reviewNotes: '',
    rejectionReason: '',
    requiredCorrections: []
  });

  const CORRECTION_OPTIONS = [
    { id: 'businessName', label: 'Business Name' },
    { id: 'businessType', label: 'Business Type' },
    { id: 'businessDescription', label: 'Description' },
    { id: 'storeLogo', label: 'Store Logo' },
    { id: 'taxId', label: 'Tax ID' },
    { id: 'governmentId', label: 'Gov ID' },
    { id: 'businessRegistration', label: 'DTI/SEC' },
    { id: 'licenseDocument', label: 'Mayor\'s Permit' },
    { id: 'birRegistration', label: 'BIR 2303' },
    { id: 'barangayClearance', label: 'Brgy Clearance' },
    { id: 'address', label: 'Address' },
    { id: 'paymentInfo', label: 'Payment/Bank' },
    { id: 'references', label: 'References' }
  ];

  const REJECTION_REASONS = [
    'Incomplete Documentation',
    'Invalid Business License',
    'Verification Failed',
    'Business Type Not Supported',
    'Duplicate Application',
    'Vague Business Description'
  ];

  useEffect(() => {
    fetchApplications();
  }, [filters]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const response = await storeApplicationService.getAllApplications(filters);
      setApplications(response.data.applications || []);
    } catch (error) {
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (applicationId, status, reviewNotes, rejectionReason, requiredCorrections) => {
    try {
      const reviewData = { status, reviewNotes, rejectionReason, requiredCorrections };
      await storeApplicationService.reviewApplication(applicationId, reviewData);
      toast.success(`Application ${status} successfully`);
      setShowReviewModal(false);
      setSelectedApplication(null);
      fetchApplications();
    } catch (error) {
      console.error('Process application error:', error);
      const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Failed to process application';
      toast.error(errorMsg);
    }
  };

  const getStatusProps = (status) => {
    const props = {
      pending: { color: 'primary', label: 'Under Review' },
      under_review: { color: 'primary', label: 'Under Review' },
      approved: { color: 'emerald', label: 'Approved' },
      rejected: { color: 'rose', label: 'Rejected' },
      requires_more_info: { color: 'blue', label: 'Need Info' }
    };
    return props[status] || { color: 'slate', label: 'UNKNOWN' };
  };

  const getScoreColor = (score) => {
    if (score >= 85) return 'text-emerald-500';
    if (score >= 60) return 'text-amber-500';
    return 'text-rose-500';
  };

  if (loading && applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2"></div>
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Applications...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Top HUD Filter - High Contrast & Always Visible */}
      <div className="bg-slate-900 p-2 rounded-2xl shadow-xl border border-white/5 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-8 relative group">
            <div className="absolute left-10 top-1/2 -translate-y-1/2 flex items-center">
              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder=""
              className="w-full pl-28 pr-4 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
          </div>
          <div className="md:col-span-4 relative">
             <div className="absolute left-10 top-1/2 -translate-y-1/2">
                <Activity className="h-4 w-4 text-primary-500" />
             </div>
             <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black tracking-widest rounded-2xl pl-28 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer"
             >
                <option value="" className="bg-slate-900 text-white font-black uppercase tracking-widest italic">ALL STATUSES</option>
                 <option value="pending" className="bg-slate-900 text-white font-black">PENDING</option>
                 <option value="under_review" className="bg-slate-900 text-white font-black">UNDER REVIEW</option>
                 <option value="requires_more_info" className="bg-slate-900 text-white font-black">NEED INFO</option>
                 <option value="approved" className="bg-slate-900 text-white font-black">APPROVED</option>
                 <option value="rejected" className="bg-slate-900 text-white font-black">REJECTED</option>
             </select>
             <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none rotate-90" />
          </div>
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-100 rounded-[3rem]">
          <Building className="h-12 w-12 text-slate-100 mx-auto mb-4" />
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter">No Applications Found</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">There are no store requests to review</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {applications.map((app) => {
            const status = getStatusProps(app.status);
            return (
              <div key={app._id} className="group bg-white border border-slate-100 rounded-2xl p-8 shadow-sm hover:shadow-2xl transition-all relative overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 p-8">
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest bg-${status.color}-50 text-${status.color}-600`}>
                    {status.label}
                  </span>
                </div>

                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-primary-600 group-hover:text-white transition-all shadow-inner">
                  <Building className="h-6 w-6" />
                </div>

                <div className="flex-1">
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">{app.businessName}</h3>
                  <div className="flex items-center gap-2 mb-6">
                    <span className="text-[9px] font-black text-primary-500 uppercase tracking-widest italic">{(app.businessType || 'other').replace('_', ' ')}</span>
                    <div className="w-1 h-1 rounded-full bg-slate-200" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">REF: {app._id.slice(-8).toUpperCase()}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex justify-between items-start mb-1.5">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Trust Index</p>
                        <span className="text-[8px] font-black text-primary-600 italic">Level {app.verificationLevel || 1}</span>
                      </div>
                      <div className="flex items-end gap-2">
                        <p className={`text-2xl font-black tracking-tighter leading-none ${getScoreColor(app.verificationScore)}`}>{app.verificationScore}%</p>
                        <TrendingUp className={`h-4 w-4 mb-1 ${getScoreColor(app.verificationScore)}`} />
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Applicant Name</p>
                      <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate leading-none mt-2">{app.applicant?.firstName} {app.applicant?.lastName}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectedApplication(app); setShowReviewModal(true); }}
                    className="flex-1 py-3.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-xl flex items-center justify-center gap-2"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {['approved', 'rejected', 'requires_more_info'].includes(app.status) ? 'View Application' : 'Review Application'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedApplication && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-[3rem] max-w-5xl w-full shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col font-sans">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldAlert className="h-3 w-3 text-primary-600" />
                  <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">REVIEW APPLICATION</span>
                </div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                  Review <span className="text-primary-600 italic">{selectedApplication.businessName}</span>
                </h2>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Application Review</p>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-10 no-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-8">
                  <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 flex flex-col items-center justify-center text-center">
                    <div className="w-32 h-32 bg-white rounded-2xl p-2 border-4 border-slate-100 shadow-inner mb-4 overflow-hidden">
                        {selectedApplication.storeLogoUrl ? (
                        <img 
                          src={getImageUrl(selectedApplication.storeLogoUrl)} 
                          alt="Store Logo" 
                          className="w-full h-full object-cover rounded-2xl"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                          <Camera className="h-10 w-10 text-slate-200" />
                        </div>
                      )}
                    </div>
                    <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">{selectedApplication.businessName}</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Primary Store Identity</p>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                       Business Identity & Legal
                    </h3>
                    <div className="space-y-6">
                      <div className="p-4 bg-white rounded-2xl border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">About the Store</p>
                        <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">"{selectedApplication.businessDescription}"</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Business Category</p>
                          <p className="text-[12px] font-black text-primary-600 uppercase italic">{(selectedApplication.businessType || 'other').replace('_', ' ')}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Legal Structure</p>
                          <p className="text-[12px] font-black text-slate-900 uppercase tracking-widest">{(selectedApplication.legalStructure || 'N/A').replace('_', ' ')}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tax ID (TIN)</p>
                          <p className="text-[12px] font-black text-slate-900">{selectedApplication.taxId || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">License No.</p>
                          <p className="text-[10px] font-black text-slate-900">{selectedApplication.businessLicense?.number || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                      Store Contact & Location
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-primary-600 mt-0.5" />
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Store Address</p>
                          <p className="text-[10px] font-bold text-slate-700">
                            {selectedApplication.contactInfo?.address?.street}, {selectedApplication.contactInfo?.address?.barangay}, {selectedApplication.contactInfo?.address?.city}, {selectedApplication.contactInfo?.address?.province} {selectedApplication.contactInfo?.address?.zipCode}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-primary-600" />
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Contact Number</p>
                          <p className="text-[10px] font-bold text-slate-700">{selectedApplication.contactInfo?.phone || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                      Applicant Information
                    </h3>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Full Name</p>
                        <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight">{selectedApplication.applicant?.firstName} {selectedApplication.applicant?.lastName}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email Address</p>
                        <p className="text-[12px] font-black text-slate-900 lowercase italic opacity-80">{selectedApplication.applicant?.email}</p>
                      </div>
                    </div>
                  </div>
                </div>


                {/* Business Info */}
                <div className="space-y-8">
                  <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                       Payment Profile
                    </h3>
                    <div className="space-y-4">
                      <div className="p-5 bg-slate-900 rounded-2xl text-white relative overflow-hidden">
                        <Wallet className="absolute -right-4 -bottom-4 h-20 w-20 opacity-10" />
                        <p className="text-[8px] font-black text-primary-400 uppercase tracking-[0.3em] mb-3">Bank Transfer Protocol</p>
                        <div className="space-y-1">
                          <p className="text-[12px] font-black uppercase">{selectedApplication.paymentInfo?.bankName || 'N/A'}</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{selectedApplication.paymentInfo?.bankAccountName || 'N/A'}</p>
                          <p className="text-[14px] font-black text-primary-500 tracking-[0.2em] mt-2">{selectedApplication.paymentInfo?.bankAccountNumber || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="p-5 bg-primary-50 border border-primary-100 rounded-2xl">
                        <p className="text-[8px] font-black text-primary-600 uppercase tracking-widest mb-2">Alternative Method</p>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-black text-slate-900 uppercase">{selectedApplication.paymentInfo?.alternativePaymentMethod?.provider || 'GCash'}</span>
                          <span className="text-[12px] font-black text-primary-600 tracking-widest">{selectedApplication.paymentInfo?.alternativePaymentMethod?.accountNumber || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 space-y-6">
                    <div>
                      <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        Professional Network
                      </h3>
                      <div className="space-y-3">
                        {selectedApplication.references?.map((ref, idx) => (
                          <div key={idx} className="p-4 bg-white rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-900 uppercase truncate">{ref.name}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2">{ref.business}</p>
                            <div className="flex justify-between text-[8px] font-black text-primary-600 uppercase italic">
                              <span>{ref.phone}</span>
                              <span className="lowercase">{ref.email}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                        Products Offered
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedApplication.productsOffered?.map((prod, i) => (
                          <span key={i} className="px-3 py-1 bg-primary-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest shadow-sm">{prod}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="bg-slate-900/5 rounded-2xl p-10 border border-slate-100 mt-4">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                       Verification Intelligence Vault
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* Mayor's Permit */}
                      {selectedApplication.mayorsPermitUrl && (
                        <a 
                          href={getImageUrl(selectedApplication.mayorsPermitUrl)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between p-6 bg-white rounded-2xl border border-slate-100 hover:border-primary-500 hover:shadow-xl transition-all group/doc"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-amber-100 text-amber-700 rounded-xl group-hover/doc:bg-amber-600 group-hover/doc:text-white transition-colors">
                              <Check className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Mayor's Permit</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Business License</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-slate-300 group-hover/doc:text-amber-600 transition-all" />
                        </a>
                      )}

                      {/* Government ID */}
                      {selectedApplication.governmentIdUrl && (
                        <a 
                          href={getImageUrl(selectedApplication.governmentIdUrl)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between p-6 bg-white rounded-2xl border border-slate-100 hover:border-primary-500 hover:shadow-xl transition-all group/doc"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover/doc:bg-emerald-600 group-hover/doc:text-white transition-colors">
                              <Shield className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Government ID</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Identity Verification</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-slate-300 group-hover/doc:text-emerald-600 transition-all" />
                        </a>
                      )}

                      {/* Business Registration */}
                      {selectedApplication.businessRegistrationUrl && (
                        <a 
                          href={getImageUrl(selectedApplication.businessRegistrationUrl)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between p-6 bg-white rounded-2xl border border-slate-100 hover:border-primary-500 hover:shadow-xl transition-all group/doc"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover/doc:bg-indigo-600 group-hover/doc:text-white transition-colors">
                              <Briefcase className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Registration</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">DTI / SEC Document</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-slate-300 group-hover/doc:text-indigo-600 transition-all" />
                        </a>
                      )}

                      {/* BIR Certificate */}
                      {selectedApplication.birRegistrationUrl && (
                        <a 
                          href={getImageUrl(selectedApplication.birRegistrationUrl)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between p-6 bg-white rounded-2xl border border-slate-100 hover:border-primary-500 hover:shadow-xl transition-all group/doc"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl group-hover/doc:bg-rose-600 group-hover/doc:text-white transition-colors">
                              <ShieldAlert className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">BIR Certificate</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Form 2303</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-slate-300 group-hover/doc:text-rose-600 transition-all" />
                        </a>
                      )}

                      {/* Barangay Clearance */}
                      {selectedApplication.barangayClearanceUrl && (
                        <a 
                          href={getImageUrl(selectedApplication.barangayClearanceUrl)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between p-6 bg-white rounded-2xl border border-slate-100 hover:border-primary-500 hover:shadow-xl transition-all group/doc"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover/doc:bg-amber-600 group-hover/doc:text-white transition-colors">
                              <MapPin className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Brgy Clearance</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Local Verification</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-slate-300 group-hover/doc:text-amber-600 transition-all" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {['approved', 'rejected'].includes(selectedApplication.status) ? (
              <div className="p-10 bg-slate-50 border-t border-slate-100 relative z-10 space-y-4">
                <div className="flex items-center justify-center gap-2 text-slate-400 mb-4">
                  <Shield className="h-4 w-4" />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em]">Review Complete</span>
                </div>
                {selectedApplication.rejectionReason && (
                  <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl">
                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2">Rejection Reason</p>
                    <p className="text-sm font-bold text-rose-900">{selectedApplication.rejectionReason}</p>
                  </div>
                )}
                {selectedApplication.reviewNotes && (
                  <div className="p-6 bg-white border border-slate-100 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Review Notes</p>
                    <p className="text-sm font-bold text-slate-900">{selectedApplication.reviewNotes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-10 bg-white border-t border-slate-100 relative z-10 space-y-8 shadow-[0_-20px_50px_rgba(0,0,0,0.05)]">
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100/50">
                   <div className="flex items-center gap-2 mb-3">
                     <AlertTriangle className="h-4 w-4 text-amber-600" />
                     <h4 className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Mark Corrections Needed</h4>
                   </div>
                   <div className="flex flex-wrap gap-2">
                     {CORRECTION_OPTIONS.map(opt => (
                       <button
                         key={opt.id}
                         onClick={() => {
                           setReviewForm(prev => {
                             const current = prev.requiredCorrections || [];
                             const next = current.includes(opt.id) 
                               ? current.filter(id => id !== opt.id)
                               : [...current, opt.id];
                             return { ...prev, requiredCorrections: next };
                           });
                         }}
                         className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${reviewForm.requiredCorrections?.includes(opt.id) ? 'bg-amber-600 border-amber-600 text-white shadow-lg' : 'bg-white border-amber-100 text-amber-600 hover:bg-amber-50'}`}
                       >
                         {opt.label}
                       </button>
                     ))}
                   </div>
                   <p className="text-[8px] font-bold text-amber-600 uppercase tracking-widest mt-3 italic opacity-60">* Selection will be highlighted for the applicant</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => handleReview(selectedApplication._id, 'approved', reviewForm.reviewNotes)}
                    className="py-6 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-emerald-600 transition-all shadow-xl flex items-center justify-center gap-2"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button
                    onClick={() => {
                      if (!reviewForm.requiredCorrections?.length) {
                        toast.warning('Please select at least one field requiring correction');
                        return;
                      }
                      handleReview(selectedApplication._id, 'requires_more_info', reviewForm.reviewNotes, '', reviewForm.requiredCorrections);
                    }}
                    className="py-6 bg-amber-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-amber-600 transition-all shadow-xl flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="h-4 w-4" /> Need Info
                  </button>
                  <button
                    onClick={() => {
                      if (!reviewForm.rejectionReason) {
                        toast.warning('Please select or specify a rejection reason');
                        return;
                      }
                      handleReview(selectedApplication._id, 'rejected', reviewForm.reviewNotes, reviewForm.rejectionReason, reviewForm.requiredCorrections);
                    }}
                    className="py-6 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-rose-700 transition-all shadow-xl flex items-center justify-center gap-2"
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>

                <div className="bg-rose-50/50 p-8 rounded-2xl border border-rose-100/50 mt-4">
                  <label className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-3 block">Final Decision Feedback (Optional for Approval)</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {REJECTION_REASONS.map(reason => (
                      <button 
                        key={reason}
                        onClick={() => setReviewForm(prev => ({ ...prev, rejectionReason: reason }))}
                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${reviewForm.rejectionReason === reason ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-rose-100 text-rose-600 hover:bg-rose-50'}`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <input 
                    type="text"
                    className="w-full bg-white border border-rose-100 rounded-2xl px-6 py-3.5 text-sm font-bold placeholder:text-rose-200 outline-none focus:border-rose-400"
                    placeholder=""
                    value={reviewForm.rejectionReason}
                    onChange={(e) => setReviewForm(prev => ({ ...prev, rejectionReason: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreApplications;
