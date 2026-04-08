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
        setDeliveryMethod(result.deliveryMethod || 'email');
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
      toast.error(error.response?.data?.message || 'Invalid verification code');
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
      <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-[#fafaf7]">
        <div className="max-w-md w-full animate-pop">
          <div className="card-paw-interactive p-8 md:p-12 text-center relative group">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-primary rounded-3xl flex items-center justify-center shadow-hover rotate-6">
              <ShieldCheck className="h-10 w-10 text-white" />
            </div>
            <div className="mt-8 mb-8 space-y-3">
              <h2 className="text-3xl font-black text-header tracking-tighter">Secure Access</h2>
              <p className="text-primary/50 font-medium text-sm">We sent a 6-digit code to <span className="text-primary font-black">{formData.email}</span></p>
            </div>
            <div className="flex justify-center gap-2 mb-8">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={el => otpRefs.current[index] = el}
                  type="text" inputMode="numeric" maxLength={1}
                  value={digit} onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  className="w-12 h-16 text-center text-2xl font-black rounded-2xl border-2 border-primary/10 focus:border-accent focus:ring-4 focus:ring-accent/10 outline-none transition-all"
                />
              ))}
            </div>
            <div className="mb-6">
              {resendCooldown > 0 ? (
                <p className="text-[10px] font-black text-primary/30 uppercase tracking-[0.2em]">Resend in {resendCooldown}s</p>
              ) : (
                <button onClick={handleResendOTP} className="text-[10px] font-black text-accent uppercase tracking-[0.2em] flex items-center gap-2 mx-auto">
                  <RefreshCw className="h-3 w-3" /> Resend Code
                </button>
              )}
            </div>
            <button onClick={handleVerifyOTP} disabled={otpLoading} className="btn-fun w-full py-5">
              {otpLoading ? 'Verifying...' : 'Complete Registration'}
            </button>
            <button onClick={() => setStep(1)} className="mt-6 text-xs text-primary/40 font-bold uppercase tracking-widest flex items-center justify-center gap-2 mx-auto">
               <ArrowLeft className="h-3 w-3" /> Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-[#fafaf7]">
      <div className="max-w-md w-full animate-slide-up">
        <div className="card-paw-interactive p-8 md:p-12 space-y-10 group">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 bg-primary rounded-3xl flex items-center justify-center text-white shadow-fun rotate-[-10deg] group-hover:rotate-0 transition-transform">
               <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C10.34 2 9 3.34 9 5c0 1.66 1.34 3 3 3s3-1.34 3-3c0-1.66-1.34-3-3-3zM5 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm14 0c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm12 11c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z"/></svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-black text-header tracking-tighter leading-none">Join the <span className="text-accent underline decoration-8 decoration-accent/20 underline-offset-4">Pack.</span></h1>
              <p className="text-sm text-primary/50 font-medium">Register in seconds with zero friction.</p>
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 ml-1">Username / Name</label>
              <div className="relative group/input">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/20 group-focus-within/input:text-accent transition-colors" />
                <input
                  name="username" type="text" required
                  className="w-full pl-12 pr-4 py-5 bg-primary/5 border border-transparent rounded-[1.5rem] focus:bg-white focus:border-accent focus:ring-4 focus:ring-accent/10 outline-none transition-all font-bold text-header"
                  placeholder="TheLuckyPaw"
                  value={formData.username}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 ml-1">Email Address</label>
              <div className="relative group/input">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/20 group-focus-within/input:text-accent transition-colors" />
                <input
                  name="email" type="email" required
                  className="w-full pl-12 pr-4 py-5 bg-primary/5 border border-transparent rounded-[1.5rem] focus:bg-white focus:border-accent focus:ring-4 focus:ring-accent/10 outline-none transition-all font-bold text-header"
                  placeholder="woof@example.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 ml-1">Passphrase</label>
                <div className="relative group/input">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/20" />
                  <input
                    name="password" type={showPassword ? 'text' : 'password'} required
                    className="w-full pl-12 pr-10 py-5 bg-primary/5 border border-transparent rounded-[1.5rem] focus:bg-white focus:border-accent focus:ring-4 focus:ring-accent/10 outline-none transition-all font-bold text-header"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/20 hover:text-accent">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 ml-1">Confirm</label>
                <div className="relative group/input">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/20" />
                  <input
                    name="confirmPassword" type={showPassword ? 'text' : 'password'} required
                    className="w-full pl-12 pr-4 py-5 bg-primary/5 border border-transparent rounded-[1.5rem] focus:bg-white focus:border-accent focus:ring-4 focus:ring-accent/10 outline-none transition-all font-bold text-header"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-2">
               <Sparkles className="h-3 w-3 text-accent" />
               <p className="text-[9px] font-black text-primary/30 uppercase tracking-widest">Passphrase must include Upper, Lower & Symbol</p>
            </div>

            {/* Premium Human Verification - No glitches, perfect alignment */}
            <div className="flex justify-center py-2">
               <PremiumCaptcha onVerify={(token) => setCaptchaToken(token)} />
            </div>

            <button type="submit" disabled={loading} className="btn-fun w-full py-6 text-sm shadow-hover">
              {loading ? 'Processing...' : 'Get Instant Access'}
            </button>
          </form>

          <div className="pt-8 border-t border-primary/5 text-center">
            <p className="text-xs text-primary/40 font-bold uppercase tracking-widest">
              Already have an account?{' '}
              <Link to="/login" className="text-accent hover:underline decoration-2 underline-offset-4 decoration-accent/30">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
