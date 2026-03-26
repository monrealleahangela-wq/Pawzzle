import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';
import { Heart, Mail, Lock, User, Phone, Eye, EyeOff, ArrowLeft, ShieldCheck, RefreshCw } from 'lucide-react';
import { getCitiesByProvince, getBarangaysByCity } from '../../constants/locationConstants';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    address: {
      street: '',
      city: '',
      province: 'cavite',
      barangay: '',
      zipCode: '',
      country: 'PH'
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  // OTP state
  const [step, setStep] = useState(1); // 1: form, 2: OTP verification
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState('email'); // 'email' or 'sms'
  const otpRefs = useRef([]);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setCities(getCitiesByProvince('cavite'));
    if (formData.address.city) {
      setBarangays(getBarangaysByCity(formData.address.city));
    }
  }, [formData.address.city]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value,
        ...(field === 'city' ? { barangay: '' } : {})
      }
    }));
  };

  // ─── STEP 1: Submit registration form → send OTP ────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}[\]|:;"'<>,.?/~`]).{8,}$/;
    if (!passwordRegex.test(formData.password)) {
      toast.error('Password must be at least 8 characters with uppercase, lowercase, numbers, and symbols');
      return;
    }

    if (formData.password.toLowerCase() === formData.username.toLowerCase() ||
      formData.password.toLowerCase() === formData.email.toLowerCase()) {
      toast.error('Password cannot be the same as your username or email');
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...registerData } = formData;
      const result = await authService.sendRegisterOTP(registerData);

      if (result.success) {
        toast.success(result.message || 'Verification code sent!');
        setDeliveryMethod(result.deliveryMethod || 'email');
        setStep(2);
        setResendCooldown(60);
        // Focus first OTP input
        setTimeout(() => otpRefs.current[0]?.focus(), 300);
      } else {
        toast.error(result.message || 'Failed to send verification code');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── OTP Input handlers ────────────────────────────────────────────────────
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...otpDigits];
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setOtpDigits(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }

    if (!/^\d?$/.test(value)) return;

    const newOtp = [...otpDigits];
    newOtp[index] = value;
    setOtpDigits(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // ─── STEP 2: Verify OTP → complete registration ────────────────────────────
  const handleVerifyOTP = async () => {
    const otp = otpDigits.join('');
    if (otp.length !== 6) {
      toast.error('Please enter the complete 6-digit code');
      return;
    }

    setOtpLoading(true);

    try {
      const result = await authService.verifyRegisterOTP({
        email: formData.email,
        otp
      });

      if (result.success && result.token && result.user) {
        // Store auth data
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));

        toast.success('Account verified successfully! Welcome to Pawzzle!');

        // Login the user
        window.location.href = '/home';
      } else {
        toast.error(result.message || 'Verification failed');
      }
    } catch (error) {
      const msg = error.response?.data?.message || 'Invalid verification code';
      toast.error(msg);
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── Resend OTP ────────────────────────────────────────────────────────────
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;

    try {
      const result = await authService.resendRegisterOTP({ email: formData.email });
      toast.success(result.message || 'New verification code sent!');
      setDeliveryMethod(result.deliveryMethod || 'email');
      setResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to resend code');
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER: OTP Verification Screen (Step 2)
  // ───────────────────────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
        <div className="fixed inset-0 z-[-1] pointer-events-none opacity-40">
          <div className="absolute top-20 right-[-10%] w-[500px] h-[500px] bg-primary-100 rounded-full blur-[120px] animate-blob" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-secondary-100 rounded-full blur-[100px] animate-blob" style={{ animationDelay: '-2s' }} />
        </div>

        <div className="max-w-md w-full animate-fade-in">
          <div className="glass-morphism rounded-[40px] p-8 md:p-12 border border-white/40 shadow-2xl relative">
            {/* Shield icon */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-gradient-to-br from-primary-500 to-emerald-500 rounded-3xl flex items-center justify-center shadow-xl shadow-primary-200 rotate-6 group hover:rotate-12 transition-transform duration-500">
              <ShieldCheck className="h-10 w-10 text-white" />
            </div>

            <div className="text-center mt-8 mb-8 space-y-3">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                {deliveryMethod === 'sms' ? 'Verify Your Phone' : 'Verify Your Email'}
              </h2>
              <p className="text-slate-500 font-medium text-sm">
                We sent a 6-digit code to
              </p>
              <p className="text-primary-600 font-black text-sm tracking-wide">
                {deliveryMethod === 'sms' ? formData.phone : formData.email}
              </p>
            </div>

            {/* OTP Input Grid */}
            <div className="flex justify-center gap-2 sm:gap-3 mb-8">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={el => otpRefs.current[index] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                    handleOtpChange(index, pasted);
                  }}
                  autoComplete="one-time-code"
                  className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-black rounded-2xl border-2 outline-none transition-all duration-300
                    ${digit
                      ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-lg shadow-primary-100'
                      : 'border-slate-200 bg-white/50 text-slate-900 hover:border-slate-300'
                    }
                    focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10`}
                />
              ))}
            </div>

            {/* Timer & Resend */}
            <div className="text-center mb-6">
              {resendCooldown > 0 ? (
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Resend code in <span className="text-primary-600 font-black">{resendCooldown}s</span>
                </p>
              ) : (
                <button
                  onClick={handleResendOTP}
                  className="text-[11px] font-black text-primary-600 uppercase tracking-widest hover:text-primary-700 flex items-center gap-1.5 mx-auto transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Resend Verification Code
                </button>
              )}
            </div>

            {/* Verify Button */}
            <button
              onClick={handleVerifyOTP}
              disabled={otpLoading || otpDigits.join('').length !== 6}
              className="btn btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100 relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="relative z-10">
                {otpLoading ? 'Verifying...' : 'Verify & Create Account'}
              </span>
            </button>

            {/* Back button */}
            <div className="mt-6 text-center">
              <button
                onClick={() => { setStep(1); setOtpDigits(['', '', '', '', '', '']); }}
                className="text-sm text-slate-500 font-medium hover:text-primary-600 flex items-center justify-center gap-1.5 mx-auto transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Registration
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER: Registration Form (Step 1)
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
      <div className="fixed inset-0 z-[-1] pointer-events-none opacity-40">
        <div className="absolute top-20 right-[-10%] w-[500px] h-[500px] bg-primary-100 rounded-full blur-[120px] animate-blob" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-secondary-100 rounded-full blur-[100px] animate-blob" style={{ animationDelay: '-2s' }} />
      </div>

      <div className="max-w-xl w-full animate-fade-in py-12">
        <div className="glass-morphism rounded-[40px] p-8 md:p-12 border border-white/40 shadow-2xl relative">
          <div className="absolute -top-10 left-10 w-20 h-20 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center shadow-xl shadow-primary-200 rotate-3 overflow-hidden p-3">
            <img src="/images/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>

          <div className="mt-6 mb-10 space-y-2">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">Join the Elite<br /><span className="text-primary-600">Community</span></h2>
            <p className="text-slate-500 font-medium">Create your premium pet-care profile</p>
          </div>

          <form className="space-y-8" onSubmit={handleSubmit} autoComplete="off">
            {/* Identity Grid */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">First Name</label>
                  <input
                    name="firstName" type="text" required
                    className="w-full px-4 py-4 bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700"
                    placeholder="Jane"
                    value={formData.firstName}
                    onChange={handleChange}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Last Name</label>
                  <input
                    name="lastName" type="text" required
                    className="w-full px-4 py-4 bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={handleChange}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Username / Identifier</label>
                <div className="input-container group">
                  <User className="input-icon h-5 w-5" />
                  <input
                    name="username" type="text" required
                    className="input input-with-icon bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4"
                    placeholder="janedoe_care"
                    value={formData.username}
                    onChange={handleChange}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email Address</label>
                <div className="input-container group">
                  <Mail className="input-icon h-5 w-5" />
                  <input
                    name="email" type="email" required
                    className="input input-with-icon bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4"
                    placeholder="jane@example.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Phone Number</label>
                <div className="input-container group">
                  <Phone className="input-icon h-5 w-5" />
                  <input
                    name="phone" type="tel" required
                    className="input input-with-icon bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4"
                    placeholder="09123456789"
                    value={formData.phone}
                    onChange={handleChange}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            {/* Location Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary-600 border-b border-primary-50 pb-2">Location Logistics</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Street Address</label>
                  <input
                    type="text"
                    value={formData.address.street}
                    onChange={(e) => handleAddressChange('street', e.target.value)}
                    className="w-full px-4 py-4 bg-white/50 border border-slate-100 rounded-2xl focus:border-primary-500 outline-none transition-all font-medium"
                    placeholder="123 Luxury Lane"
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">City</label>
                    <select
                      value={formData.address.city}
                      onChange={(e) => handleAddressChange('city', e.target.value)}
                      className="w-full px-4 py-4 bg-white/50 border border-slate-100 rounded-2xl focus:border-primary-500 outline-none transition-all font-medium"
                      required
                    >
                      <option value="">Select City</option>
                      {cities.map(city => <option key={city.value} value={city.value}>{city.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Barangay</label>
                    <select
                      value={formData.address.barangay}
                      onChange={(e) => handleAddressChange('barangay', e.target.value)}
                      className="w-full px-4 py-4 bg-white/50 border border-slate-100 rounded-2xl focus:border-primary-500 outline-none transition-all font-medium"
                      required
                      disabled={!formData.address.city}
                    >
                      <option value="">Select Barangay</option>
                      {barangays.map(barangay => <option key={barangay.value} value={barangay.value}>{barangay.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Province</label>
                    <div className="w-full px-4 py-4 bg-slate-100 border border-slate-100 rounded-2xl font-medium text-slate-500">
                      Cavite
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">ZIP Code</label>
                    <input
                      type="text"
                      value={formData.address.zipCode}
                      onChange={(e) => handleAddressChange('zipCode', e.target.value)}
                      className="w-full px-4 py-4 bg-white/50 border border-slate-100 rounded-2xl focus:border-primary-500 outline-none transition-all font-medium"
                      placeholder="4100"
                      required
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Security Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary-600 border-b border-primary-50 pb-2">Vault Access</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="input-container group">
                  <Lock className="input-icon h-5 w-5" />
                  <input
                    name="password" type={showPassword ? 'text' : 'password'} required
                    className="input input-with-both-icons bg-white/50 border border-slate-100 rounded-2xl focus:border-primary-500 outline-none font-medium py-4"
                    placeholder="Passphrase"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  <button
                    type="button"
                    className="input-icon-right pointer-events-auto hover:text-primary-500 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <div className="input-container group">
                  <Lock className="input-icon h-5 w-5" />
                  <input
                    name="confirmPassword" type={showPassword ? 'text' : 'password'} required
                    className="input input-with-both-icons bg-white/50 border border-slate-100 rounded-2xl focus:border-primary-500 outline-none font-medium py-4"
                    placeholder="Repeat Passphrase"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                  <button
                    type="button"
                    className="input-icon-right pointer-events-auto hover:text-primary-500 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col md:flex-row justify-between gap-2 px-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                  MIN 8 CHARS (14+ RECOMMENDED) • UPPER • LOWER • NUMBER • SYMBOL
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100"
            >
              {loading ? 'Sending Verification Code...' : 'Continue with Verification'}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500 font-medium">
              Already part of the network?{' '}
              <Link to="/login" className="text-primary-600 font-black hover:underline underline-offset-4">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
