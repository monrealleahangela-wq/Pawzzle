import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';
import { Heart, Mail, Lock, User, Eye, EyeOff, ArrowLeft, ShieldCheck, RefreshCw, Sparkles } from 'lucide-react';
import PremiumCaptcha from '../../components/PremiumCaptcha';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    // Hidden/Defaults for now
    firstName: '',
    lastName: '',
    phone: '',
    address: {
      street: 'N/A',
      city: 'N/A',
      province: 'Cavite',
      barangay: 'N/A',
      zipCode: '',
      country: 'PH'
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);

  // OTP state
  const [step, setStep] = useState(1); // 1: form, 2: OTP verification
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState('email');
  const otpRefs = useRef([]);

  const navigate = useNavigate();

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

  // ─── STEP 1: Submit simplified registration form ────────────────────────────
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

    if (!captchaToken) {
      toast.error('Security check failed. Please verify you are not a robot.');
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...registerData } = formData;
      // We send the simplified data. Backend fields like firstName/lastName are now optional.
      const result = await authService.sendRegisterOTP({ ...registerData, captchaToken });

      if (result.success) {
        toast.success(result.message || 'Verification code sent!');
        setStep(2);
        setResendCooldown(60);
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

  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...otpDigits];
      digits.forEach((d, i) => { if (index + i < 6) newOtp[index + i] = d; });
      setOtpDigits(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }
    if (!/^\d?$/.test(value)) return;
    const newOtp = [...otpDigits];
    newOtp[index] = value;
    setOtpDigits(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleVerifyOTP = async () => {
    const otp = otpDigits.join('');
    if (otp.length !== 6) {
      toast.error('Please enter the complete 6-digit code');
      return;
    }
    setOtpLoading(true);
    try {
      const result = await authService.verifyRegisterOTP({ email: formData.email, otp });
      if (result.success && result.token && result.user) {
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        toast.success('Welcome to the Pack! Registration successful.');
        window.location.href = '/home?new_user=true';
      } else {
        toast.error(result.message || 'Verification failed');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.errors?.[0]?.msg || error.response?.data?.message || 'Invalid verification code';
      toast.error(errorMsg);
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    try {
      const result = await authService.resendRegisterOTP({ email: formData.email });
      toast.success(result.message || 'New code sent!');
      setResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to resend code');
    }
  };

  if (step === 2) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
        {/* Decorative Blobs */}
        <div className="fixed inset-0 z-[-1] pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-primary-50 rounded-full blur-[120px] animate-blob" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-secondary-50 rounded-full blur-[100px] animate-blob" style={{ animationDelay: '-3s' }} />
        </div>

        <div className="max-w-md w-full animate-fade-in">
          <div className="glass-morphism rounded-[40px] p-10 md:p-12 border border-white/40 shadow-2xl relative">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-3xl flex items-center justify-center shadow-xl shadow-primary-200 rotate-6 group hover:rotate-12 transition-transform duration-500 overflow-hidden p-4">
               <ShieldCheck className="h-12 w-12 text-white" />
            </div>

            <div className="text-center mt-8 mb-10 space-y-2">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Secure Verification</h2>
              <p className="text-slate-500 font-medium text-xs">A 6-digit code has been sent to <span className="text-primary-600 font-black">{formData.email}</span></p>
            </div>

            <div className="flex justify-center gap-2 mb-10">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={el => otpRefs.current[index] = el}
                  type="text" inputMode="numeric" maxLength={1}
                  value={digit} onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  className="w-11 h-16 text-center text-2xl font-black rounded-2xl border border-slate-100 bg-white/50 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all shadow-sm"
                />
              ))}
            </div>

            <div className="mb-8 text-center">
              {resendCooldown > 0 ? (
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 py-2 px-4 rounded-full inline-block">Resend available in {resendCooldown}s</p>
              ) : (
                <button onClick={handleResendOTP} className="text-[10px] font-black text-primary-600 uppercase tracking-widest flex items-center gap-2 mx-auto hover:text-primary-700 hover:scale-105 transition-all">
                  <RefreshCw className="h-3 w-3" /> Resend Verification Code
                </button>
              )}
            </div>

            <button onClick={handleVerifyOTP} disabled={otpLoading} className="btn btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100">
              {otpLoading ? 'Verifying...' : 'Complete Registration'}
            </button>

            <button onClick={() => setStep(1)} className="mt-8 text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center justify-center gap-2 mx-auto hover:text-slate-600">
               <ArrowLeft className="h-3 w-3" /> Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
      {/* Decorative Blobs */}
      <div className="fixed inset-0 z-[-1] pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-primary-50 rounded-full blur-[120px] animate-blob" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-secondary-50 rounded-full blur-[100px] animate-blob" style={{ animationDelay: '-3s' }} />
      </div>

      <div className="max-w-md w-full animate-fade-in">
        <div className="glass-morphism rounded-[40px] p-10 md:p-12 border border-white/40 shadow-2xl relative">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-3xl flex items-center justify-center shadow-xl shadow-primary-200 rotate-6 group hover:rotate-12 transition-transform duration-500 overflow-hidden p-4">
            <img src="/images/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>

          <div className="text-center mt-8 mb-10 space-y-2">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Join the Pack</h2>
            <p className="text-slate-500 font-medium">Create your premium pet profile</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Username / Name</label>
                <div className="input-container group">
                  <User className="input-icon h-5 w-5" />
                  <input
                    name="username" type="text" required
                    className="input input-with-icon bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4"
                    placeholder="TheLuckyPaw"
                    value={formData.username}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Email Address</label>
                <div className="input-container group">
                  <Mail className="input-icon h-5 w-5" />
                  <input
                    name="email" type="email" required
                    className="input input-with-icon bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4"
                    placeholder="woof@example.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Passphrase</label>
                  <div className="input-container group">
                    <Lock className="input-icon h-4 w-4" />
                    <input
                      name="password" type={showPassword ? 'text' : 'password'} required
                      className="input input-with-both-icons bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4 text-xs select-none [appearance:none] [&::-ms-reveal]:hidden [&::-ms-clear]:hidden [&::-webkit-credentials-store-indicator]:hidden"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="input-icon-right pointer-events-auto hover:text-primary-500">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Confirm</label>
                  <div className="input-container group">
                    <Lock className="input-icon h-4 w-4" />
                    <input
                      name="confirmPassword" type={showPassword ? 'text' : 'password'} required
                      className="input input-with-icon bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4 text-xs select-none [appearance:none] [&::-ms-reveal]:hidden [&::-ms-clear]:hidden [&::-webkit-credentials-store-indicator]:hidden"
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-1">
               <Sparkles className="h-3 w-3 text-primary-500" />
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upper, Lower, Number & Symbol</p>
            </div>

            {/* Premium Human Verification - No glitches, perfect alignment */}
            <div className="flex justify-center pt-2">
               <PremiumCaptcha onVerify={(token) => setCaptchaToken(token)} />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100">
              {loading ? 'Processing...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500 font-medium">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 font-black hover:underline underline-offset-4">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
