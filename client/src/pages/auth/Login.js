import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, Send, MessageSquare, X,
  ArrowRight, HeartHandshake, ShieldCheck, Store
} from 'lucide-react';
import { supportService } from '../../services/apiService';
import { portalHomeForUser, professionalVerificationStatus, requiresProfessionalVerification } from '../../utils/authorization';
import ModalViewport from '../../components/ui/ModalViewport';

const BACKEND = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

// SVG icons for social buttons
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
);


const Login = () => {
  const location = useLocation();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login, verify2FA } = useAuth();
  const navigate = useNavigate();

  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportData, setSupportData] = useState({ email: '', message: '' });
  const [sendingSupport, setSendingSupport] = useState(false);

  const getRedirectPath = (authenticatedUser) => {
    const params = new URLSearchParams(location.search);
    const redirect = params.get('redirect');
    if (redirect) return redirect;
    const savedRedirect = localStorage.getItem('redirectPath');
    if (savedRedirect) { localStorage.removeItem('redirectPath'); return savedRedirect; }
    const user = authenticatedUser || JSON.parse(localStorage.getItem('user') || '{}');
    return portalHomeForUser(user);
  };

  const showAuthenticatedToast = currentUser => {
    if (requiresProfessionalVerification(currentUser) && professionalVerificationStatus(currentUser) !== 'verified') {
      toast.info('Signed in. Professional access is restricted until credential review is complete.');
      return;
    }
    toast.success('Login successful!');
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const [deactivationInfo, setDeactivationInfo] = useState(null);

  React.useEffect(() => {
    const savedInfo = sessionStorage.getItem('deactivationinfo');
    if (savedInfo) {
      setDeactivationInfo(JSON.parse(savedInfo));
      sessionStorage.removeItem('deactivationinfo');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setDeactivationInfo(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    try {
      const result = await login(formData);
      if (result.twoFactorRequired) {
        setTwoFactorRequired(true);
        setLoginEmail(result.email);
        toast.info('Verification code sent to your email');
      } else if (result.success) {
        showAuthenticatedToast(result.user);
        navigate(getRedirectPath(result.user));
      } else if (result.isDisabled) {
        setDeactivationInfo({
          reason: result.deactivationReason,
          contact: result.contactSupport
        });
        toast.error('Account Disabled', { autoClose: 5000 });
      } else {
        toast.error(result.error || 'Login failed');
      }
    } catch {
      toast.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    setVerifyingOtp(true);
    try {
      const result = await verify2FA({ email: loginEmail, otp });
      if (result.success) {
        showAuthenticatedToast(result.user);
        navigate(getRedirectPath(result.user));
      } else {
        toast.error(result.error || 'Verification failed');
      }
    } catch (error) {
      toast.error('Verification failed. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleGoogleLogin = () => { window.location.href = `${BACKEND}/api/auth/google`; };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    setSendingSupport(true);
    try {
      await supportService.sendGuestMessage({
        email: supportData.email,
        message: supportData.message,
        subject: 'Account Recovery Request'
      });
      toast.success('Support request sent! Super Admin will review it.');
      setShowSupportModal(false);
      setSupportData({ email: '', message: '' });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send support request');
    } finally {
      setSendingSupport(false);
    }
  };

  return (
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

            <p className="mb-4 text-xs font-black uppercase tracking-[0.28em] !text-[#f0b47f]">Welcome home</p>
            <h1 className="max-w-sm text-4xl font-black leading-[1.08] tracking-tight !text-white">
              Everything your pet needs, in one trusted place.
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-6 !text-[#d8c6ba]">
              Sign in to shop, book trusted pet care, and stay connected with verified stores in your community.
            </p>
          </div>

          <div className="relative space-y-3">
            {[
              { icon: ShieldCheck, title: 'Verified community', text: 'Trusted accounts and reviewed stores' },
              { icon: Store, title: 'Marketplace access', text: 'Products, pets, and local services' },
              { icon: HeartHandshake, title: 'Care made simpler', text: 'Bookings and orders in one account' }
            ].map(({ icon: Icon, title, text }) => (
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

            <div className="mb-8">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-primary-600">Account access</p>
              <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to continue to your Pawzzle account.</p>
            </div>

          {/* Deactivation Notice */}
          {deactivationInfo && (
            <div className="mb-6 rounded-2xl border border-rose-100 bg-rose-50 p-4 animate-slide-up">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white rounded-2xl text-rose-500 shadow-sm">
                  <AlertCircle size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-rose-900">Account disabled</h3>
                  <p className="text-xs text-rose-600 font-bold leading-relaxed pt-1">
                    {deactivationInfo.reason}
                  </p>
                  <div className="pt-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Need assistance?</p>
                    <button 
                      onClick={() => {
                        setSupportData({ ...supportData, email: formData.email });
                        setShowSupportModal(true);
                      }}
                      className="text-[11px] font-black text-rose-600 hover:text-rose-700 underline underline-offset-4"
                    >
                      Contact Support
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          {!twoFactorRequired ? (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="login-identifier" className="text-sm font-bold text-slate-700">Email or username</label>
                  <div className="relative group">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary-600" aria-hidden="true" />
                    <input
                      id="login-identifier" name="email" type="text" required
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10"
                      placeholder="Enter your email or username"
                      value={formData.email}
                      onChange={handleChange}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="login-password" className="text-sm font-bold text-slate-700">Password</label>
                    <Link to="/forgot-password" className="text-xs font-bold text-primary-600 transition hover:text-primary-700 hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative group">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary-600" aria-hidden="true" />
                    <input
                      id="login-password" name="password" type={showPassword ? 'text' : 'password'} required
                      className="h-14 w-full select-none rounded-2xl border border-slate-200 bg-slate-50/70 pl-12 pr-12 text-sm font-medium text-slate-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 [appearance:none] [&::-ms-clear]:hidden [&::-ms-reveal]:hidden [&::-webkit-credentials-store-indicator]:hidden"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition hover:bg-primary-50 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 text-sm font-black text-white shadow-lg shadow-primary-200/70 transition hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/20 disabled:cursor-wait disabled:opacity-60"
              >
                <span>{loading ? 'Signing you in...' : 'Sign in'}</span>
                {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleVerify2FA}>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary-600">
                  <Lock size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Two-step verification</h3>
                <p className="text-xs text-slate-500 font-bold mt-2">
                  We've sent a 6-digit code to <span className="text-primary-600">{loginEmail}</span>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Verification code</label>
                <input
                  type="text"
                  maxLength="6"
                  required
                  className="w-full bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-black text-center tracking-[1em] text-2xl text-slate-700 py-4"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <button
                type="submit"
                disabled={verifyingOtp}
                className="h-14 w-full rounded-2xl bg-primary-600 px-5 text-sm font-black text-white shadow-lg shadow-primary-200/70 transition hover:bg-primary-700 disabled:opacity-60"
              >
                {verifyingOtp ? 'Verifying Code...' : 'Confirm Identity'}
              </button>

              <button
                type="button"
                onClick={() => setTwoFactorRequired(false)}
                className="w-full py-2 text-sm font-bold text-slate-500 hover:text-primary-600"
              >
                Back to Login
              </button>
            </form>
          )}

            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">or continue with</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <button onClick={handleGoogleLogin} className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition hover:border-primary-200 hover:bg-primary-50/40 focus:outline-none focus:ring-4 focus:ring-primary-500/10">
              <GoogleIcon />
              <span className="text-sm font-bold text-slate-700">Continue with Google</span>
            </button>

            <p className="mt-7 text-center text-sm text-slate-500">
              New to Pawzzle?{' '}
              <Link to="/register" className="font-black text-primary-600 hover:text-primary-700 hover:underline underline-offset-4">
                Create an account
              </Link>
            </p>
          </div>
        </section>
      </main>

      {/* Support Modal */}
      {showSupportModal && (
        <ModalViewport onClose={() => !sendingSupport && setShowSupportModal(false)} className="z-[1000] p-3 sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="account-recovery-title" className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-[2rem] border border-slate-200 bg-white font-sans shadow-2xl">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <MessageSquare className="h-2.5 w-2.5 text-primary-600" />
                  <span className="text-[8px] font-black text-primary-600 uppercase tracking-[0.4em] leading-none">CUSTOMER SUPPORT</span>
                </div>
                <h2 id="account-recovery-title" className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">Account <span className="text-primary-600 italic">Recovery</span></h2>
              </div>
              <button 
                onClick={() => setShowSupportModal(false)}
                aria-label="Close account recovery"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 p-2 text-slate-600 transition-all hover:bg-rose-50 hover:text-rose-600 active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6">
              <form onSubmit={handleSupportSubmit} className="space-y-5">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-600">Your Email</label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                      <input 
                        type="email" required
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 text-xs"
                        placeholder="email@example.com"
                        value={supportData.email}
                        onChange={(e) => setSupportData({...supportData, email: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-600">How can we help?</label>
                    <textarea 
                      required rows="4"
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 resize-none text-xs"
                      placeholder="Tell us about your account recovery request..."
                      value={supportData.message}
                      onChange={(e) => setSupportData({...supportData, message: e.target.value})}
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={sendingSupport}
                  className="w-full py-4 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-primary-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
                >
                  {sendingSupport ? 'Sending Request...' : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Message Super Admin
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </ModalViewport>
      )}
    </div>
  );
};

export default Login;
