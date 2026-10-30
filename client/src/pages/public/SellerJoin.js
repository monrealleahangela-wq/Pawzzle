import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowRight, BadgeCheck, Eye, EyeOff, LockKeyhole, Mail, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';
import StoreApplicationJourney from '../../components/stores/StoreApplicationJourney';
import '../../components/stores/StoreApplicationFields.css';

const initialRegistration = {
  firstName: '', lastName: '', email: '', password: '', confirmPassword: ''
};

const SellerJoin = () => {
  const { isAuthenticated, completeOAuthLogin } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [registration, setRegistration] = useState(initialRegistration);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (isAuthenticated) navigate('/account-upgrade', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleRegistrationChange = event => {
    const { name, value } = event.target;
    setRegistration(previous => ({ ...previous, [name]: value }));
  };

  const handleAccountSubmit = async event => {
    event.preventDefault();
    if (registration.password !== registration.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { confirmPassword, ...payload } = registration;
      await authService.sendRegisterOTP(payload);
      setStep(2);
      setOtpDigits(['', '', '', '', '', '']);
      setResendCooldown(60);
      toast.success('Verification code sent. Check your email to continue.');
      window.requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch (error) {
      toast.error(error.response?.data?.errors?.[0]?.msg || error.response?.data?.message || 'We could not create the account. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  const updateOtpDigit = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtpDigits(previous => previous.map((current, digitIndex) => digitIndex === index ? digit : current));
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = event => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (!digits.length) return;
    event.preventDefault();
    setOtpDigits(Array.from({ length: 6 }, (_, index) => digits[index] || ''));
    otpRefs.current[Math.min(digits.length, 6) - 1]?.focus();
  };

  const handleVerifyOtp = async () => {
    const otp = otpDigits.join('');
    if (otp.length !== 6) {
      toast.error('Enter the complete 6-digit verification code.');
      return;
    }
    setOtpLoading(true);
    try {
      const result = await authService.verifyRegisterOTP({ email: registration.email, otp });
      if (!result.success || !result.token || !result.user) {
        toast.error(result.message || 'Email verification failed.');
        return;
      }
      completeOAuthLogin(result.user, result.token);
      toast.success('Account verified. Continue with your store application.');
      navigate('/account-upgrade', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'The verification code is invalid or expired.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      await authService.resendRegisterOTP({ email: registration.email });
      setResendCooldown(60);
      toast.success('A new verification code was sent.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'We could not resend the code. Please try again.');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary-50/60 via-white to-slate-50 px-4 py-6 sm:px-6 sm:py-10 lg:py-14">
      <div className="mx-auto max-w-6xl space-y-6">
        <StoreApplicationJourney activeStage={step === 1 ? 'account' : 'verify'} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-xl shadow-slate-200/40 sm:rounded-[2.5rem]">
            <div className="border-b border-slate-100 px-6 py-6 sm:px-9">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  {step === 1 ? <LockKeyhole className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                </span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary-700">Seller onboarding · Step {step} of 2</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{step === 1 ? 'Create your Pawzzle account' : 'Verify your email address'}</h2>
                  <p className="mt-1 text-sm text-slate-500">{step === 1 ? 'This account will own and manage your store application.' : 'Verification protects your application and saved business details.'}</p>
                </div>
              </div>
            </div>

            {step === 1 ? (
              <form onSubmit={handleAccountSubmit} className="store-application-fields space-y-6 p-6 sm:p-9">
                <div className="store-field-note" role="note">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Enter your personal account details below. Fields marked <strong>Required</strong> must be completed before we can send your verification code.</span>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="store-field-label">First name <span className="store-field-label__status">Required</span><span className="relative mt-2 block"><UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoComplete="given-name" type="text" name="firstName" required value={registration.firstName} onChange={handleRegistrationChange} className="input-premium store-field-with-icon" placeholder="Enter your first name" /></span><span className="store-field-help">Use the first name shown on your valid ID.</span></label>
                  <label className="store-field-label">Last name <span className="store-field-label__status">Required</span><span className="relative mt-2 block"><UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoComplete="family-name" type="text" name="lastName" required value={registration.lastName} onChange={handleRegistrationChange} className="input-premium store-field-with-icon" placeholder="Enter your last name" /></span><span className="store-field-help">Use the last name shown on your valid ID.</span></label>
                </div>

                <label className="store-field-label">Email address <span className="store-field-label__status">Required</span><span className="relative mt-2 block"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoComplete="email" type="email" name="email" required value={registration.email} onChange={handleRegistrationChange} className="input-premium store-field-with-icon" placeholder="name@example.com" /></span><span className="store-field-help">We will send a 6-digit verification code to this email.</span></label>

                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    { name: 'password', label: 'Password', shown: showPassword, toggle: () => setShowPassword(value => !value) },
                    { name: 'confirmPassword', label: 'Confirm password', shown: showConfirmPassword, toggle: () => setShowConfirmPassword(value => !value) }
                  ].map(field => (
                    <label key={field.name} className="store-field-label">{field.label} <span className="store-field-label__status">Required</span><span className="relative mt-2 block"><input autoComplete="new-password" type={field.shown ? 'text' : 'password'} name={field.name} required minLength={8} value={registration[field.name]} onChange={handleRegistrationChange} className="input-premium store-field-with-action" placeholder={field.name === 'password' ? 'Create a secure password' : 'Enter the same password again'} /><button type="button" onClick={field.toggle} aria-label={field.shown ? `Hide ${field.label.toLowerCase()}` : `Show ${field.label.toLowerCase()}`} aria-pressed={field.shown} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-primary-700">{field.shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span><span className="store-field-help">{field.name === 'password' ? 'Use at least 8 characters. A mix of letters, numbers, and symbols is recommended.' : 'This must exactly match the password you created.'}</span></label>
                  ))}
                </div>

                <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary-600 px-5 py-4 text-[10px] font-black uppercase tracking-[0.24em] text-white shadow-xl shadow-primary-200 transition hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Sending verification code…' : 'Create account & verify email'}{!loading && <ArrowRight className="h-4 w-4" />}</button>
                <p className="text-center text-xs font-semibold text-slate-500">Already have an account? <Link to="/login" className="font-black text-primary-700 hover:underline">Sign in to continue your application</Link></p>
              </form>
            ) : (
              <div className="space-y-7 p-6 sm:p-9">
                <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-900">We sent a 6-digit code to <strong>{registration.email}</strong>. Enter it below to unlock the complete store application.</div>
                <div className="flex justify-center gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, index) => (
                    <input key={index} ref={element => { otpRefs.current[index] = element; }} aria-label={`Verification digit ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={1} value={digit} onChange={event => updateOtpDigit(index, event.target.value)} onKeyDown={event => { if (event.key === 'Backspace' && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus(); }} className="h-14 w-11 rounded-xl border-2 border-slate-300 bg-white text-center text-xl font-black text-slate-950 shadow-sm outline-none transition focus:border-primary-600 focus:ring-4 focus:ring-primary-100 sm:h-16 sm:w-14" />
                  ))}
                </div>
                <button type="button" onClick={handleVerifyOtp} disabled={otpLoading} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary-600 px-5 py-4 text-[10px] font-black uppercase tracking-[0.24em] text-white shadow-xl shadow-primary-200 transition hover:bg-slate-950 disabled:opacity-60">{otpLoading ? 'Verifying account…' : 'Verify & continue to application'}{!otpLoading && <ArrowRight className="h-4 w-4" />}</button>
                <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-5 text-xs sm:flex-row"><button type="button" onClick={() => setStep(1)} className="font-bold text-slate-500 hover:text-slate-900">Change account details</button><button type="button" onClick={handleResendOtp} disabled={resendCooldown > 0} className="inline-flex items-center gap-2 font-black text-primary-700 disabled:text-slate-400"><RefreshCw className="h-3.5 w-3.5" /> {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification code'}</button></div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-lg shadow-slate-200/30"><BadgeCheck className="h-8 w-8 text-primary-600" /><h3 className="mt-4 text-lg font-black text-slate-950">One consistent application</h3><p className="mt-2 text-sm leading-relaxed text-slate-500">After email verification, you will continue to the same application used by existing Pawzzle customers upgrading to sellers.</p></div>
            <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">Before you begin</p><ul className="mt-4 space-y-3 text-xs font-semibold text-slate-300"><li>Prepare your DTI or SEC registration.</li><li>Know your exact store map location.</li><li>Have BIR details ready when registered.</li><li>Prepare two business references.</li></ul></div>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default SellerJoin;
