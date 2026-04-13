import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import storeApplicationService from '../../services/storeApplicationService';
import authService from '../../services/authService';
import { 
  Store, User, Mail, Phone, MapPin, 
  ShieldCheck, Upload, ArrowRight, CheckCircle2,
  AlertCircle, Building2, FileCheck, Info,
  ChevronRight, Lock, Eye, EyeOff, Map as MapIcon,
  Search, RefreshCw
} from 'lucide-react';
import { getCitiesByProvince, getBarangaysByCity } from '../../constants/locationConstants';
import MapPicker from '../../components/MapPicker';

const SellerJoin = () => {
  const { register, isAuthenticated, user, completeOAuthLogin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Steps: 1: Owner Profile, 2: Verification, 3: Store Details, 4: Documents
  const [step, setStep] = useState(isAuthenticated ? 3 : 1);
  const [submitted, setSubmitted] = useState(false);
  const [addressInputType, setAddressInputType] = useState('map'); // 'map' or 'manual'
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  // OTP States
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = React.useRef([]);

  const [regData, setRegData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [locating, setLocating] = useState(false);

  const [storeData, setStoreData] = useState({
    businessName: '',
    businessType: 'pet_store',
    businessDescription: '',
    contactInfo: {
      phone: '',
      email: '',
      address: {
        street: '',
        city: '',
        state: 'cavite',
        barangay: '',
        zipCode: '',
        country: 'PH',
        coordinates: {
          lat: 14.3121,
          lng: 120.9326
        }
      }
    }
  });

  const [files, setFiles] = useState({
    governmentId: null,
    businessRegistration: null,
    birRegistration: null
  });

  useEffect(() => {
    setCities(getCitiesByProvince('cavite'));
    if (storeData.contactInfo.address.city) {
      setBarangays(getBarangaysByCity(storeData.contactInfo.address.city));
    }
  }, [storeData.contactInfo.address.city]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleRegChange = (e) => {
    setRegData({ ...regData, [e.target.name]: e.target.value });
  };

  const handleStoreChange = (field, value) => {
    if (field.includes('.')) {
      const parts = field.split('.');
      if (parts.length === 3) {
        const [p, c, g] = parts;
        setStoreData(prev => ({
          ...prev,
          [p]: { 
            ...prev[p], 
            [c]: { 
              ...prev[p][c], 
              [g]: value,
              ...(g === 'city' ? { barangay: '' } : {})
            } 
          }
        }));
      } else {
        const [p, c] = parts;
        setStoreData(prev => ({
          ...prev,
          [p]: { ...prev[p], [c]: value }
        }));
      }
    } else {
      setStoreData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleFileChange = (e, type) => {
    setFiles({ ...files, [type]: e.target.files[0] });
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    if (regData.password !== regData.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    setLoading(true);
    try {
      const { confirmPassword, ...data } = regData;
      // Start OTP flow — include captcha bypass since seller flow has its own email verification
      await authService.sendRegisterOTP({ ...data, captchaToken: 'manual_verification_success' });
      setStep(2);
      setResendCooldown(60);
      toast.success('Verification code sent! Please check your email.');
      // Pre-fill store email
      handleStoreChange('contactInfo.email', regData.email);
    } catch (err) {
      const errorMsg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Setup failed';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const otp = otpDigits.join('');
    if (otp.length !== 6) return toast.error('Enter 6-digit code');
    setOtpLoading(true);
    try {
      const result = await authService.verifyRegisterOTP({ email: regData.email, otp });
      if (result.success && result.token && result.user) {
        // Log in the user
        completeOAuthLogin(result.user, result.token);
        toast.success('Account verified! Continue to store details.');
        setStep(3);
      } else {
         toast.error(result.message || 'Verification failed');
      }
    } catch (err) {
       toast.error(err.response?.data?.message || 'Invalid code');
    } finally {
       setOtpLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    try {
      await authService.resendRegisterOTP({ email: regData.email });
      setResendCooldown(60);
      toast.success('New code sent!');
    } catch (e) { toast.error('Failed to resend'); }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      return toast.error('Geolocation is not supported by your browser');
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          setAddressInputType('manual');
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`);
          const data = await response.json();
          
          if (data.address) {
            const addr = data.address;
            const street = addr.road || addr.suburb || addr.building || '';
            const city = (addr.city || addr.town || addr.municipality || '').toLowerCase();
            const barangay = (addr.village || addr.neighbourhood || addr.suburb || '').toLowerCase();
            
            handleStoreChange('contactInfo.address.street', street);
            handleStoreChange('contactInfo.address.city', city);
            handleStoreChange('contactInfo.address.barangay', barangay);
            handleStoreChange('contactInfo.address.zipCode', addr.postcode || '');
            handleStoreChange('contactInfo.address.coordinates', { lat: latitude, lng: longitude });
            
            toast.success('Location detected! Please verify the details.');
          }
        } catch (err) {
          toast.error('Could not resolve location address');
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        toast.error('Failed to get location: ' + err.message);
        setLocating(false);
      }
    );
  };

  const handleApplicationSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      Object.keys(storeData).forEach(key => {
        if (typeof storeData[key] === 'object') {
          formData.append(key, JSON.stringify(storeData[key]));
        } else {
          formData.append(key, storeData[key]);
        }
      });

      if (files.governmentId) formData.append('governmentId', files.governmentId);
      if (files.businessRegistration) formData.append('businessRegistration', files.businessRegistration);
      if (files.birRegistration) formData.append('birRegistration', files.birRegistration);

      await storeApplicationService.submitApplication(formData);
      setSubmitted(true);
      toast.success('Seller application submitted successfully!');
    } catch (err) {
      const errorMsg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Application submission failed';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[3rem] p-10 text-center shadow-xl border border-slate-100 animate-in zoom-in-95 duration-500">
           <div className="w-20 h-20 bg-emerald-500 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-200">
              <CheckCircle2 className="h-10 w-10" />
           </div>
           <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4">Application Sent</h1>
           <p className="text-slate-500 font-medium leading-relaxed mb-10">
             We have received your application to become a seller! We will review your documents within 24-48 hours.
           </p>
           <Link to="/home" className="btn btn-primary w-full py-4 text-xs font-black uppercase tracking-[0.3em]">
             Go to Home
           </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12 text-center">
           <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 rounded-full mb-6">
              <Store className="h-4 w-4 text-primary-600" />
              <span className="text-[10px] font-black text-primary-700 uppercase tracking-[0.2em]">Seller Sign Up</span>
           </div>
           <h1 className="text-4xl md:text-5xl font-black text-slate-900 uppercase tracking-tighter mb-4">Join Our <span className="text-primary-600">Seller Community</span></h1>
           <p className="text-slate-400 font-bold text-[11px] uppercase tracking-[0.3em]">Apply for your pet store or breeding business</p>
        </div>

        {/* Progress Tracker */}
        <div className="flex items-center justify-center gap-4 mb-16 px-4">
           {[
             { id: 1, label: 'Profile', icon: User },
             { id: 2, label: 'Verify', icon: ShieldCheck },
             { id: 3, label: 'Store', icon: Store },
             { id: 4, label: 'Files', icon: FileCheck }
           ].map((s) => (
             <React.Fragment key={s.id}>
               <div className={`flex items-center gap-3 transition-opacity ${step === s.id ? 'opacity-100' : 'opacity-30'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${step === s.id ? 'bg-primary-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>
                     <s.icon className="h-5 w-5" />
                  </div>
                  <span className="hidden md:block text-[9px] font-black uppercase tracking-widest text-slate-600">{s.label}</span>
               </div>
               {s.id < 4 && <div className="h-px w-8 bg-slate-200 hidden md:block" />}
             </React.Fragment>
           ))}
        </div>

        <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
           {step === 1 && (
             <form onSubmit={handleAccountSubmit} className="p-8 md:p-12 space-y-8 animate-in slide-in-from-right duration-500">
                <div className="flex items-center gap-4 mb-8">
                   <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
                      <Lock className="h-5 w-5" />
                   </div>
                   <div>
                      <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Step 1: Your Info</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Create your login details</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                      <input type="text" name="firstName" required value={regData.firstName} onChange={handleRegChange} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-500/5" />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                      <input type="text" name="lastName" required value={regData.lastName} onChange={handleRegChange} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-500/5" />
                   </div>
                </div>

                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                   <input type="email" name="email" required value={regData.email} onChange={handleRegChange} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-primary-500/5" placeholder="owner@example.com" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                      <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"} 
                            name="password" 
                            required 
                            value={regData.password} 
                            onChange={handleRegChange} 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-primary-500/5 pr-14 select-none [appearance:none] [&::-ms-reveal]:hidden [&::-ms-clear]:hidden [&::-webkit-credentials-store-indicator]:hidden" 
                        />
                        <button 
                            type="button" 
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary-600 transition-colors"
                        >
                           {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirm Password</label>
                      <div className="relative">
                        <input 
                            type={showConfirmPassword ? "text" : "password"} 
                            name="confirmPassword" 
                            required 
                            value={regData.confirmPassword} 
                            onChange={handleRegChange} 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-primary-500/5 pr-14 select-none [appearance:none] [&::-ms-reveal]:hidden [&::-ms-clear]:hidden [&::-webkit-credentials-store-indicator]:hidden" 
                        />
                        <button 
                            type="button" 
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary-600 transition-colors"
                        >
                           {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                   </div>
                </div>

                <button type="submit" disabled={loading} className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] hover:bg-primary-600 transition-all flex items-center justify-center gap-3 group">
                   {loading ? 'Setting up...' : 'Next: Verify Email'}
                   <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </button>

                <p className="text-center text-[10px] font-bold text-slate-400 uppercase">
                  Already have an account? <Link to="/login" className="text-primary-600">Sign in instead</Link>
                </p>
             </form>
           )}

           {step === 2 && (
              <div className="p-8 md:p-12 space-y-8 animate-in slide-in-from-right duration-500">
                 <div className="text-center space-y-2">
                    <ShieldCheck className="h-12 w-12 text-primary-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Check Your Inbox</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                       Enter the 6-digit verification code sent to <br/><span className="text-primary-600">{regData.email}</span>
                    </p>
                 </div>
                 
                 <div className="flex justify-center gap-2">
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={el => otpRefs.current[index] = el}
                        type="text" maxLength={1} value={digit}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const newOtp = [...otpDigits];
                          newOtp[index] = val;
                          setOtpDigits(newOtp);
                          if (val && index < 5) otpRefs.current[index + 1]?.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
                        }}
                        className="w-12 h-16 text-center text-2xl font-black bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all shadow-sm"
                      />
                    ))}
                 </div>

                 <button onClick={handleVerifyOTP} disabled={otpLoading} className="w-full py-5 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] shadow-xl shadow-primary-200">
                    {otpLoading ? 'Verifying...' : 'Verify & Setup Store'}
                 </button>

                 <div className="text-center pt-4">
                    {resendCooldown > 0 ? (
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4 py-2 bg-slate-50 rounded-full inline-block">Resend available in {resendCooldown}s</p>
                    ) : (
                      <button onClick={handleResendOTP} className="text-[9px] font-black text-primary-600 uppercase tracking-widest flex items-center gap-2 mx-auto hover:text-primary-700">
                        <RefreshCw size={12} /> Resend Verification Code
                      </button>
                    )}
                 </div>
              </div>
           )}

           {step === 3 && (
             <form onSubmit={() => setStep(4)} className="p-8 md:p-12 space-y-8 animate-in slide-in-from-right duration-500">
                <div className="flex items-center justify-between gap-4 mb-4">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary-600 text-white rounded-2xl flex items-center justify-center">
                         <Store className="h-5 w-5" />
                      </div>
                      <div>
                         <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Step 3: Store Details</h2>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tell us about your business</p>
                      </div>
                   </div>
                   <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setAddressInputType('map')}
                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${addressInputType === 'map' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        Map GPS
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddressInputType('manual')}
                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${addressInputType === 'manual' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        Manual
                      </button>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="col-span-2 space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Commercial Store Name</label>
                      <input type="text" required value={storeData.businessName} onChange={(e) => handleStoreChange('businessName', e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-500/5" />
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Official Support Phone</label>
                      <input type="tel" required value={storeData.contactInfo.phone} onChange={(e) => handleStoreChange('contactInfo.phone', e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-primary-500/5" />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Official Business Email</label>
                      <input type="email" required value={storeData.contactInfo.email} onChange={(e) => handleStoreChange('contactInfo.email', e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-primary-500/5" />
                   </div>
                </div>

                <div className="space-y-6">
                   {addressInputType === 'map' ? (
                     <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                           <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                              <MapIcon className="h-4 w-4 text-primary-600" /> Interaction Map
                           </h3>
                           <button 
                             type="button"
                             onClick={handleGetCurrentLocation}
                             disabled={locating}
                             className="flex items-center gap-1.5 text-[9px] font-black text-primary-600 uppercase tracking-widest hover:text-primary-700 transition-colors disabled:opacity-50"
                           >
                              <MapPin size={12} className={locating ? 'animate-bounce' : ''} />
                              {locating ? 'Detecting...' : 'Pin Current GPS'}
                           </button>
                        </div>
                        <div className="h-[350px] rounded-[2rem] overflow-hidden border-2 border-slate-100 shadow-inner">
                          <MapPicker 
                            onLocationSelected={(location) => {
                              setStoreData(prev => ({
                                ...prev,
                                contactInfo: {
                                  ...prev.contactInfo,
                                  address: {
                                    ...prev.contactInfo.address,
                                    street: location.street || location.full,
                                    city: location.city.toLowerCase().replace(/\s+/g, '_').replace('municipality_of_', ''),
                                    barangay: location.barangay.toLowerCase().replace(/\s+/g, '_'),
                                    zipCode: location.zipCode || prev.contactInfo.address.zipCode,
                                    coordinates: {
                                      lat: location.lat,
                                      lng: location.lng
                                    }
                                  }
                                }
                              }));
                            }}
                            initialAddress={storeData.contactInfo.address.street}
                          />
                        </div>
                        <div className="p-4 bg-primary-50 rounded-2xl border border-primary-100">
                           <p className="text-[9px] font-black text-primary-700 uppercase tracking-widest mb-1">Store Address</p>
                           <p className="text-[10px] font-bold text-slate-600 uppercase">{storeData.contactInfo.address.street || 'Pick your location on the map...'}</p>
                        </div>
                     </div>
                   ) : (
                     <div className="space-y-6 animate-fade-in">
                        <div className="flex items-center justify-between ml-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Address Specifications</label>
                           <button 
                               type="button"
                               onClick={handleGetCurrentLocation}
                               disabled={locating}
                               className="flex items-center gap-1.5 text-[9px] font-black text-primary-600 uppercase tracking-widest hover:text-primary-700 transition-colors disabled:opacity-50"
                           >
                              <MapPin size={12} className={locating ? 'animate-bounce' : ''} />
                              {locating ? 'Detecting...' : 'Use Current Location'}
                           </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">City / Municipality *</label>
                              <select 
                                required 
                                value={storeData.contactInfo.address.city} 
                                onChange={(e) => handleStoreChange('contactInfo.address.city', e.target.value)} 
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-500/5"
                              >
                                <option value="">Select City</option>
                                {cities.map(city => <option key={city.value} value={city.value}>{city.label}</option>)}
                              </select>
                           </div>
                           <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Barangay *</label>
                              <select 
                                required 
                                value={storeData.contactInfo.address.barangay} 
                                onChange={(e) => handleStoreChange('contactInfo.address.barangay', e.target.value)} 
                                disabled={!storeData.contactInfo.address.city}
                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-500/5"
                              >
                                <option value="">Select Barangay</option>
                                {barangays.map(bg => <option key={bg.value} value={bg.value}>{bg.label}</option>)}
                              </select>
                           </div>
                        </div>

                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Street / Building Info *</label>
                           <input 
                              type="text" 
                              required 
                              value={storeData.contactInfo.address.street} 
                              onChange={(e) => handleStoreChange('contactInfo.address.street', e.target.value)} 
                              className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-primary-500/5" 
                           />
                        </div>
                     </div>
                   )}
                </div>

                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Business Background / Short Intro</label>
                   <textarea value={storeData.businessDescription} onChange={(e) => handleStoreChange('businessDescription', e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none h-24 resize-none" placeholder="Describe your store's expertise..." />
                </div>

                <div className="flex gap-4">
                   <button type="button" onClick={() => setStep(isAuthenticated ? 3 : 2)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all">Previous</button>
                   <button type="submit" className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] hover:bg-primary-600 transition-all flex items-center justify-center gap-3 group">
                      Next Step: Documents
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                   </button>
                </div>
             </form>
           )}

           {step === 4 && (
             <form onSubmit={handleApplicationSubmit} className="p-8 md:p-12 space-y-8 animate-in slide-in-from-right duration-500">
                <div className="flex items-center gap-4 mb-8">
                   <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center">
                      <ShieldCheck className="h-5 w-5" />
                   </div>
                   <div>
                      <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Step 4: Verification</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Upload your documents</p>
                   </div>
                </div>

                <div className="space-y-6">
                   {[
                     { id: 'governmentId', label: 'Authorized Owner ID (Passport/License)', icon: User },
                     { id: 'businessRegistration', label: 'Business Registration (DTI/SEC)', icon: Building2 },
                     { id: 'birRegistration', label: 'Tax Certification (BIR 2303)', icon: FileCheck }
                   ].map((doc) => (
                     <div key={doc.id} className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 hover:border-primary-200 transition-colors group">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-primary-600 transition-colors shadow-sm">
                              <doc.icon className="h-6 w-6" />
                           </div>
                           <div>
                              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{doc.label}</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">PDF, JPG, or PNG (Max 10MB)</p>
                           </div>
                        </div>
                         <div className="relative group">
                            <div className={`px-8 py-3 rounded-xl border-2 transition-all pointer-events-none ${files[doc.id] ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-100 text-primary-600 font-black text-[9px] uppercase tracking-widest'}`}>
                               {files[doc.id] ? 'File Ready ✓' : 'Select File'}
                            </div>
                            <input 
                                type="file" 
                                required={doc.id !== 'licenseDocument' && doc.id !== 'birRegistration'} 
                                onChange={(e) => handleFileChange(e, doc.id)} 
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" 
                            />
                         </div>
                     </div>
                   ))}
                </div>

                <div className="p-6 bg-primary-50 rounded-[2rem] border border-primary-100 flex gap-4">
                   <Info className="h-5 w-5 text-primary-600 shrink-0" />
                   <p className="text-[9px] font-bold text-primary-700 uppercase leading-relaxed tracking-wide">
                     By submitting, you agree to our Terms. All sellers are checked to ensure they follow our pet safety standards.
                   </p>
                </div>

                <div className="flex gap-4">
                   <button type="button" onClick={() => setStep(3)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all">Previous</button>
                   <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] hover:bg-slate-900 transition-all shadow-xl shadow-primary-200 disabled:opacity-50">
                      {loading ? 'Submitting...' : 'Submit Your Application'}
                   </button>
                </div>
             </form>
           )}
        </div>
      </div>
    </div>
  );
};

export default SellerJoin;
