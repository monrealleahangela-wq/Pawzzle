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

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchApplications();
  }, [filters]);

  // Debounce search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update filter if searchTerm has changed
      if (searchTerm !== filters.search) {
        setFilters(prev => ({ ...prev, search: searchTerm }));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, filters.search]);

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
      pending: { color: 'amber', label: 'PENDING OPS' },
      under_review: { color: 'amber', label: 'UNDER REVIEW' },
      approved: { color: 'emerald', label: 'VERIFIED' },
      rejected: { color: 'rose', label: 'REJECTED' },
      requires_more_info: { color: 'amber', label: 'ACTION REQ' }
    };
    return props[status] || { color: 'stone', label: 'UNKNOWN' };
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
    <div className="space-y-8 sm:space-y-12 pb-32 animate-fade-in font-['Outfit'] relative z-10">
      
      {/* ── Executive HUD Filter ── */}
      <div className="bg-[#211510] p-4 rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] border border-[#3D2B23] relative overflow-hidden group">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px] -translate-y-32 translate-x-32" />
        
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 relative group/input">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <Search className="h-5 w-5 text-amber-500/40 group-focus-within/input:text-amber-500 transition-colors" />
              <div className="w-px h-4 bg-white/10" />
            </div>
            <input
              type="text"
              placeholder="SEARCH BUSINESS NODES, TYPES, OR SELLING IDENTIFIERS..."
              className="w-full pl-20 pr-6 py-5 bg-white/5 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl outline-none border border-white/5 focus:border-amber-500/30 focus:bg-white/10 placeholder:text-white/20 transition-all font-['Outfit']"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="lg:col-span-4 relative group/select">
             <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
                <Activity className="h-5 w-5 text-amber-500/40" />
                <div className="w-px h-4 bg-white/10" />
             </div>
             <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full h-full bg-white/5 border border-white/5 text-white text-[10px] font-black tracking-[0.2em] rounded-2xl pl-20 pr-12 py-5 outline-none focus:border-amber-500/30 focus:bg-white/10 appearance-none transition-all cursor-pointer uppercase font-['Outfit']"
             >
                <option value="" className="bg-[#211510] text-white/40 italic">ALL OPERATIONAL STATUSES</option>
                 <option value="pending" className="bg-[#211510] text-white">PENDING REVIEW</option>
                 <option value="under_review" className="bg-[#211510] text-white">UNDER EVALUATION</option>
                 <option value="requires_more_info" className="bg-[#211510] text-white">ACTION REQUIRED</option>
                 <option value="approved" className="bg-[#211510] text-emerald-400">APPROVED NODES</option>
                 <option value="rejected" className="bg-[#211510] text-rose-400">REJECTED ENTRIES</option>
             </select>
             <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20 pointer-events-none rotate-90 group-hover/select:text-amber-500 transition-colors" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {applications.map((app) => {
            const status = getStatusProps(app.status);
            return (
              <div key={app._id} className="group bg-white border border-[#5D4037]/5 rounded-[2.5rem] p-10 transition-all duration-500 hover:shadow-[0_50px_100px_-20px_rgba(93,64,55,0.12)] hover:-translate-y-2 relative overflow-hidden flex flex-col font-['Outfit']">
                <div className="absolute top-0 right-0 p-10">
                  <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black tracking-[0.3em] uppercase backdrop-blur-xl border border-white/20 shadow-sm ${
                    app.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                    app.status === 'rejected' ? 'bg-rose-50 text-rose-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {status.label}
                  </span>
                </div>

                <div className="w-16 h-16 bg-[#FAF9F6] border border-[#5D4037]/5 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-[#211510] group-hover:text-amber-500 transition-all duration-500 shadow-sm">
                  <Building className="h-7 w-7" />
                </div>

                <div className="flex-1 space-y-6">
                  <div>
                    <h3 className="text-2xl font-black text-[#3D2B23] uppercase tracking-tight leading-none mb-3 group-hover:text-amber-600 transition-colors">{app.businessName}</h3>
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-black uppercase tracking-widest italic border border-amber-100/50">{(app.businessType || 'NODE').replace('_', ' ')}</div>
                      <div className="w-1.5 h-1.5 rounded-full bg-[#5D4037]/10" />
                      <span className="text-[10px] font-bold text-[#5D4037]/20 uppercase tracking-[0.2em]">IDENT: {app._id.slice(-8).toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-[#FAF9F6] rounded-[1.8rem] border border-[#5D4037]/5 relative group/score">
                      <div className="flex justify-between items-start mb-4">
                        <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-[0.3em]">Trust index</p>
                        <Zap className="h-3.5 w-3.5 text-amber-500/30 group-hover/score:text-amber-500 transition-colors" />
                      </div>
                      <div className="flex items-baseline gap-3">
                        <p className={`text-4xl font-black tracking-[-0.05em] leading-none ${getScoreColor(app.verificationScore)}`}>{app.verificationScore}%</p>
                        <span className="text-[9px] font-black text-[#5D4037]/20 uppercase tracking-widest">TI-LVL {app.verificationLevel || 1}</span>
                      </div>
                      <div className="absolute bottom-0 left-0 h-1 bg-amber-500 transition-all duration-700" style={{ width: `${app.verificationScore}%`, opacity: 0.2 }} />
                    </div>
                    
                    <div className="p-6 bg-[#FAF9F6] rounded-[1.8rem] border border-[#5D4037]/5">
                      <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-[0.3em] mb-4">Lead Executive</p>
                      <div className="space-y-1">
                        <p className="text-[12px] font-black text-[#3D2B23] uppercase tracking-tight truncate leading-none">{app.applicant?.firstName} {app.applicant?.lastName}</p>
                        <p className="text-[9px] font-bold text-[#5D4037]/20 uppercase tracking-[0.1em] truncate italic">{app.applicant?.email}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10 pt-8 border-t border-[#5D4037]/5 flex items-center justify-between">
                  <button
                    onClick={() => { setSelectedApplication(app); setShowReviewModal(true); }}
                    className="group/btn flex items-center gap-4 text-[10px] font-black text-[#5D4037]/60 uppercase tracking-[0.3em] hover:text-amber-600 transition-all"
                  >
                    {['approved', 'rejected', 'requires_more_info'].includes(app.status) ? 'OPEN DOSSIER' : 'INITIATE REVIEW'}
                    <div className="w-10 h-10 rounded-full border border-amber-500/10 flex items-center justify-center group-hover/btn:bg-amber-50 transition-all">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  </button>
                  <FileText className="h-5 w-5 text-[#5D4037]/5" />
                </div>
              </div>
            );
          })}
        </div>
      {/* Review Modal */}
    {showReviewModal && selectedApplication && (
      <div className="fixed inset-0 bg-[#211510]/80 backdrop-blur-xl flex items-center justify-center p-4 z-[100] animate-fade-in">
        <div className="bg-[#FAF9F6] rounded-[3.5rem] max-w-6xl w-full shadow-[0_60px_120px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden max-h-[92vh] flex flex-col font-['Outfit'] border border-white/20">
          
          <div className="p-10 border-b border-[#5D4037]/10 flex items-center justify-between bg-white/80 backdrop-blur-md relative z-10">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-[#211510] text-amber-500 rounded-2xl flex items-center justify-center shadow-2xl">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-[0.5em]">SECURE REVIEW PROTOCOL</span>
                </div>
                <h2 className="text-3xl font-black text-[#3D2B23] uppercase tracking-tighter leading-none mb-1">
                  Evaluating <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-amber-800 italic">{selectedApplication.businessName}</span>
                </h2>
                <p className="text-[10px] font-black text-[#5D4037]/30 uppercase tracking-[0.3em]">Operational Node: {selectedApplication._id.toUpperCase()}</p>
              </div>
            </div>
            <button
              onClick={() => setShowReviewModal(false)}
              className="w-14 h-14 bg-[#FAF9F6] text-[#5D4037]/40 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all flex items-center justify-center group"
            >
              <X className="h-6 w-6 group-hover:rotate-90 transition-transform" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-12 space-y-12 no-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-5 space-y-10">
                <div className="bg-white rounded-3xl p-10 border border-[#5D4037]/5 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-bl-[4rem] opacity-40 -translate-y-16 translate-x-16" />
                  <div className="w-40 h-40 bg-[#FAF9F6] rounded-[2.5rem] p-4 border border-[#5D4037]/10 shadow-inner mb-6 overflow-hidden relative z-10 transition-transform group-hover:scale-105 duration-700">
                      {selectedApplication.storeLogoUrl ? (
                      <img 
                        src={getImageUrl(selectedApplication.storeLogoUrl)} 
                        alt="Store Logo" 
                        className="w-full h-full object-cover rounded-[1.8rem]"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#FAF9F6] flex items-center justify-center">
                        <Camera className="h-12 w-12 text-[#5D4037]/10" />
                      </div>
                    )}
                  </div>
                  <h4 className="text-xl font-black text-[#3D2B23] uppercase tracking-tight">{selectedApplication.businessName}</h4>
                  <p className="text-[10px] font-black text-amber-600/40 uppercase tracking-[0.4em] mt-2">Primary Flagship Identity</p>
                </div>

                <div className="bg-white rounded-3xl p-10 border border-[#5D4037]/5 shadow-sm space-y-8">
                  <h3 className="text-[11px] font-black text-[#3D2B23] uppercase tracking-[0.4em] mb-2 flex items-center gap-3">
                     <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
                     LEGAL FOUNDATION
                  </h3>
                  <div className="space-y-8">
                    <div className="p-6 bg-[#FAF9F6] rounded-2xl border border-[#5D4037]/5 backdrop-blur-sm">
                      <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-[0.3em] mb-3">Executive Summary</p>
                      <p className="text-[13px] font-medium text-[#3D2B23] leading-relaxed italic opacity-80 font-['Inter']">"{selectedApplication.businessDescription}"</p>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-widest mb-2">Category</p>
                        <p className="text-[14px] font-black text-amber-700 uppercase italic">{(selectedApplication.businessType || 'NODE').replace('_', ' ')}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-widest mb-2">Structure</p>
                        <p className="text-[14px] font-black text-[#3D2B23] uppercase tracking-widest">{(selectedApplication.legalStructure || 'N/A').replace('_', ' ')}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-widest mb-2">Tax ID</p>
                        <p className="text-[14px] font-black text-[#3D2B23] tracking-widest">{selectedApplication.taxId || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-widest mb-2">License</p>
                        <p className="text-[14px] font-black text-[#3D2B23]">{selectedApplication.businessLicense?.number || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="bg-white rounded-3xl p-10 border border-[#5D4037]/5 shadow-sm space-y-8">
                    <h3 className="text-[11px] font-black text-[#3D2B23] uppercase tracking-[0.4em] mb-2 flex items-center gap-3">
                       <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                       LOGISTICS & COMMS
                    </h3>
                    <div className="space-y-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-[#FAF9F6] rounded-xl flex items-center justify-center shrink-0 border border-[#5D4037]/5">
                           <MapPin className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-widest mb-1">Operational GPS</p>
                          <p className="text-[11px] font-black text-[#3D2B23] uppercase leading-relaxed">
                            {selectedApplication.contactInfo?.address?.street}, {selectedApplication.contactInfo?.address?.barangay}, {selectedApplication.contactInfo?.address?.city}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#FAF9F6] rounded-xl flex items-center justify-center shrink-0 border border-[#5D4037]/5">
                           <Phone className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-[#5D4037]/30 uppercase tracking-widest mb-1">Secure Line</p>
                          <p className="text-[14px] font-black text-[#3D2B23]">{selectedApplication.contactInfo?.phone || 'UNKN'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#211510] rounded-3xl p-10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                    <h3 className="text-[11px] font-black text-amber-500/60 uppercase tracking-[0.4em] mb-8 relative z-10">PAYMENT ARCHITECTURE</h3>
                    <div className="space-y-6 relative z-10">
                      <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                        <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] mb-2">Node Settlement</p>
                        <p className="text-[14px] font-black text-white uppercase truncate">{selectedApplication.paymentInfo?.bankName || 'RESERVED'}</p>
                        <p className="text-[10px] font-black text-amber-500/80 tracking-[0.2em] mt-1">{selectedApplication.paymentInfo?.bankAccountNumber || '************'}</p>
                      </div>
                      <div className="p-4 bg-amber-500 text-[#211510] rounded-2xl shadow-[0_15px_30px_-5px_rgba(245,158,11,0.3)]">
                        <p className="text-[8px] font-black uppercase tracking-widest mb-1">Auxiliary Buffer</p>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-black uppercase">{selectedApplication.paymentInfo?.alternativePaymentMethod?.provider || 'UNSPEC'}</span>
                          <span className="text-[11px] font-black tracking-widest">{selectedApplication.paymentInfo?.alternativePaymentMethod?.accountNumber || 'PEND'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-10 border border-[#5D4037]/5 shadow-sm">
                   <h3 className="text-[11px] font-black text-[#3D2B23] uppercase tracking-[0.4em] mb-10 flex items-center gap-3">
                      <div className="w-1.5 h-4 bg-[#211510] rounded-full" />
                      VERIFICATION VAULT
                   </h3>
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      {[
                        { label: 'MAYOR PERMIT', field: 'mayorsPermitUrl', icon: Briefcase, sub: 'Logistics' },
                        { label: 'GOV ID', field: 'governmentIdUrl', icon: Shield, sub: 'Identity' },
                        { label: 'BIR 2303', field: 'birRegistrationUrl', icon: FileText, sub: 'Fiscal' }
                      ].map((doc, i) => (
                        selectedApplication[doc.field] && (
                          <a 
                            key={i}
                            href={getImageUrl(selectedApplication[doc.field])}
                            target="_blank" rel="noopener noreferrer"
                            className="p-6 bg-[#FAF9F6] border border-[#5D4037]/5 rounded-2xl hover:bg-[#211510] group/doc transition-all duration-500 text-center"
                          >
                             <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 border border-[#5D4037]/5 group-hover/doc:bg-amber-600 transition-all">
                                <doc.icon className="h-6 w-6 text-amber-600 group-hover/doc:text-white" />
                             </div>
                             <p className="text-[9px] font-black text-[#3D2B23] group-hover/doc:text-white uppercase tracking-widest mb-1">{doc.label}</p>
                             <p className="text-[8px] font-black text-[#5D4037]/20 uppercase tracking-tighter">{doc.sub}</p>
                          </a>
                                        ))}
                   </div>
                </div>
              </div>
            </div>
          </div>

          {['approved', 'rejected'].includes(selectedApplication.status) ? (
            <div className="p-10 bg-[#FAF9F6] border-t border-[#5D4037]/10 relative z-10 space-y-4">
              <div className="flex items-center justify-center gap-3 text-[#5D4037]/30 mb-6">
                <Shield className="h-5 w-5" />
                <span className="text-[10px] font-black uppercase tracking-[0.5em]">Executive Review Finalized</span>
              </div>
              {selectedApplication.rejectionReason && (
                <div className="p-8 bg-rose-50 border border-rose-100 rounded-3xl">
                  <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-3">REJECTION PROTOCOL REASON</p>
                  <p className="text-sm font-bold text-rose-950 font-['Inter']">{selectedApplication.rejectionReason}</p>
                </div>
              )}
              {selectedApplication.reviewNotes && (
                <div className="p-8 bg-white border border-[#5D4037]/5 rounded-3xl shadow-sm">
                  <p className="text-[10px] font-black text-[#5D4037]/30 uppercase tracking-widest mb-3">INTERNAL DOSSIER NOTES</p>
                  <p className="text-sm font-bold text-[#3D2B23] font-['Inter']">{selectedApplication.reviewNotes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 bg-white border-t border-[#5D4037]/10 relative z-20 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.05)]">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Left Column: Corrections Intelligence */}
                <div className="lg:col-span-5 bg-[#FAF9F6] rounded-[2.5rem] p-8 border border-[#5D4037]/5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-[3rem] -translate-y-8 translate-x-8" />
                  <div className="flex items-center gap-3 mb-6 relative z-10">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <h4 className="text-[10px] font-black uppercase text-[#3D2B23] tracking-widest">Mark Corrections Needed</h4>
                  </div>
                  <div className="flex flex-wrap gap-2 relative z-10">
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
                        className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all duration-300 ${reviewForm.requiredCorrections?.includes(opt.id) ? 'bg-[#211510] border-[#211510] text-amber-500 shadow-lg' : 'bg-white border-[#5D4037]/10 text-[#5D4037]/40 hover:border-amber-500/30'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Column: Feedback & Core Actions */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-white p-2 rounded-[2rem] border border-[#5D4037]/10 shadow-sm flex flex-col sm:flex-row gap-3">
                    <select 
                      className="sm:w-1/3 bg-[#FAF9F6] border-none rounded-xl px-6 py-4 text-[10px] font-black uppercase tracking-widest outline-none focus:bg-white transition-all appearance-none cursor-pointer text-[#3D2B23]"
                      value={reviewForm.rejectionReason}
                      onChange={(e) => setReviewForm(prev => ({ ...prev, rejectionReason: e.target.value }))}
                    >
                      <option value="">QUICK FEEDBACK...</option>
                      {REJECTION_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                    </select>
                    <input 
                      type="text"
                      className="flex-1 bg-[#FAF9F6] border-none rounded-xl px-6 py-4 text-[11px] font-black placeholder:text-[#5D4037]/20 outline-none focus:bg-white transition-all font-['Outfit'] uppercase tracking-widest"
                      placeholder="CUSTOM REASON OR REVIEW NOTES..."
                      value={reviewForm.rejectionReason}
                      onChange={(e) => setReviewForm(prev => ({ ...prev, rejectionReason: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      onClick={() => handleReview(selectedApplication._id, 'approved', reviewForm.reviewNotes)}
                      className="py-5 bg-[#211510] text-amber-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-emerald-600 hover:text-white transition-all shadow-xl group/btn"
                    >
                      <div className="flex items-center justify-center gap-3">
                        <Check className="h-4 w-4" /> Approve Node
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        if (!reviewForm.requiredCorrections?.length) {
                          toast.warning('Please select at least one field requiring correction');
                          return;
                        }
                        handleReview(selectedApplication._id, 'requires_more_info', reviewForm.reviewNotes, '', reviewForm.requiredCorrections);
                      }}
                      className="py-5 bg-amber-500 text-[#211510] rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-amber-600 transition-all shadow-xl"
                    >
                       <div className="flex items-center justify-center gap-3">
                        <AlertTriangle className="h-4 w-4" /> Need Intel
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        if (!reviewForm.rejectionReason) {
                          toast.warning('Please select or specify a rejection reason');
                          return;
                        }
                        handleReview(selectedApplication._id, 'rejected', reviewForm.reviewNotes, reviewForm.rejectionReason, reviewForm.requiredCorrections);
                      }}
                      className="py-5 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-rose-700 transition-all shadow-xl"
                    >
                       <div className="flex items-center justify-center gap-3">
                        <X className="h-4 w-4" /> Reject Node
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
};

export default StoreApplications;cations;
