import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import authService from '../../services/authService';
import {
  Mail, Lock, User, Eye, EyeOff, ArrowLeft, ArrowRight,
  ShieldCheck, RefreshCw, Sparkles, HeartHandshake, Store
} from 'lucide-react';

const registrationBenefits = [
  { icon: ShieldCheck, title: 'Secure registration', text: 'Email verification helps protect your account' },
  { icon: Store, title: 'One Pawzzle account', text: 'Shop, book services, and manage pet care' },
  { icon: HeartHandshake, title: 'Trusted community', text: 'Connect with verified stores and providers' }
];

const RegistrationShell = ({ children }) => (
  <div className="relative min-h-[100dvh] overflow-x-hidden bg-[#fbf7f4] px-3 py-6 sm:px-6 sm:py-10">
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary-100/60 blur-3xl" />
      <div className="absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-secondary-200/50 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-100/60" />
    </div>

    <main className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-primary-100/80 bg-white shadow-premium animate-fade-in lg:min-h-[43rem] lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-primary-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -right-24 -top-20 h-64 w-64 rounded-full border border-white/10" />
          <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-primary-700/40" />
          <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full border border-white/10" />
        </div>

        <div className="relative">
          <div className="mb-14 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
              <img src="/images/logo.png" alt="Pawzzle" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight !text-white">PAWZZLE</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] !text-[#e7c6aa]">Pet community</p>
            </div>
          </div>

          <p className="mb-4 text-xs font-black uppercase tracking-[0.28em] !text-[#f0b47f]">Join the community</p>
          <h1 className="max-w-sm text-4xl font-black leading-[1.08] tracking-tight !text-white">
            A better way to care for your pet starts here.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-6 !text-[#d8c6ba]">
            Create one secure account for trusted products, local pet services, and your growing Pawzzle community.
          </p>
        </div>

        <div className="relative space-y-3">
          {registrationBenefits.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/35 text-primary-200">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold !text-white">{title}</p>
                <p className="mt-0.5 text-xs !text-[#cdb8aa]">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="relative flex items-center justify-center px-5 py-8 sm:px-10 sm:py-10 lg:px-14">
        <div className="w-full max-w-md">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 p-2 ring-1 ring-primary-100">
              <img src="/images/logo.png" alt="Pawzzle" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="font-black tracking-tight text-slate-900">PAWZZLE</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-primary-600">Pet community</p>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  </div>
);

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
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // OTP state
  const [step, setStep] = useState(1); // 1: form, 2: OTP verification
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);

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

    setLoading(true);

    try {
      const { confirmPassword, ...registerData } = formData;
      // We send the simplified data. Backend fields like firstName/lastName are now optional.
      const result = await authService.sendRegisterOTP(registerData);

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
      <RegistrationShell>
        <div className="mb-8">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-primary-600">Email verification</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Check your inbox</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter the 6-digit code sent to <span className="font-bold text-slate-700">{formData.email}</span>.
          </p>
        </div>

        <div className="mb-7 flex justify-between gap-2" role="group" aria-label="Email verification code">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={el => otpRefs.current[index] = el}
                  type="text" inputMode="numeric" maxLength={1}
                  value={digit} onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  aria-label={`Verification digit ${index + 1}`}
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  className="h-14 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 text-center text-xl font-black text-slate-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10"
                />
              ))}
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-center">
          {resendCooldown > 0 ? (
            <p className="text-xs font-bold text-slate-500">You can request a new code in {resendCooldown}s</p>
          ) : (
            <button onClick={handleResendOTP} className="mx-auto flex items-center gap-2 text-sm font-bold text-primary-600 transition hover:text-primary-700">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Send a new code
            </button>
          )}
        </div>

        <button onClick={handleVerifyOTP} disabled={otpLoading} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 text-sm font-black text-white shadow-lg shadow-primary-200/70 transition hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/20 disabled:cursor-wait disabled:opacity-60">
          {otpLoading ? 'Verifying your code...' : 'Verify and continue'}
        </button>

        <button onClick={() => setStep(1)} className="mx-auto mt-6 flex items-center justify-center gap-2 text-sm font-bold text-slate-500 transition hover:text-primary-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Change account details
        </button>
      </RegistrationShell>
    );
  }

  return (
    <RegistrationShell>
      <div className="mb-8">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] !text-primary-700">Create account</p>
        <h2 className="text-4xl font-black tracking-tight !text-slate-950 sm:text-5xl">Join Pawzzle</h2>
        <p className="mt-3 text-base font-medium !text-slate-500">Create one account for shopping, pet care, and trusted local services.</p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-5">
              <div>
                <label htmlFor="register-username" className="mb-2 block text-sm font-bold !text-slate-700">Username</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input
                    id="register-username"
                    name="username"
                    type="text"
                    required
                    autoComplete="username"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-14 pr-5 text-base font-semibold !text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10"
                    placeholder="Choose a username"
                    value={formData.username}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="register-email" className="mb-2 block text-sm font-bold !text-slate-700">Email address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input
                    id="register-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-14 pr-5 text-base font-semibold !text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10"
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="register-password" className="mb-2 block text-sm font-bold !text-slate-700">Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                    <input
                      id="register-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      aria-describedby="password-guidance"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-14 pr-14 text-base font-semibold !text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10"
                      placeholder="Create password"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30">
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="register-confirm-password" className="mb-2 block text-sm font-bold !text-slate-700">Confirm password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                    <input
                      id="register-confirm-password"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-14 pr-14 text-base font-semibold !text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10"
                      placeholder="Repeat password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'} aria-pressed={showConfirmPassword} className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30">
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div id="password-guidance" className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/70 px-4 py-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
              <p className="text-sm font-medium leading-6 !text-slate-600">Use at least 8 characters with an uppercase letter, lowercase letter, number, and symbol.</p>
            </div>

            <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 text-sm font-black text-white shadow-lg shadow-primary-200/70 transition hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/20 disabled:cursor-wait disabled:opacity-60">
              {loading ? 'Creating your account...' : 'Create account'}
              {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </form>

      <div className="mt-8 border-t border-slate-200 pt-6 text-center">
        <p className="text-sm font-medium !text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-black text-primary-700 transition hover:text-primary-800 hover:underline hover:underline-offset-4">Sign in</Link>
        </p>
      </div>
    </RegistrationShell>
  );
};

export default Register;
