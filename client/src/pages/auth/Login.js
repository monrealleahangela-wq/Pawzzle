import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { Heart, Mail, Lock, Eye, EyeOff, AlertCircle, Send, MessageSquare, X } from 'lucide-react';
import { supportService } from '../../services/apiService';
import ReCAPTCHA from 'react-google-recaptcha';

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
  const [captchaToken, setCaptchaToken] = useState(null);

  const { login, verify2FA } = useAuth();
  const navigate = useNavigate();

  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportData, setSupportData] = useState({ email: '', message: '' });
  const [sendingSupport, setSendingSupport] = useState(false);

  const getRedirectPath = () => {
    const params = new URLSearchParams(location.search);
    const redirect = params.get('redirect');
    if (redirect) return redirect;
    const savedRedirect = localStorage.getItem('redirectPath');
    if (savedRedirect) { localStorage.removeItem('redirectPath'); return savedRedirect; }
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role === 'super_admin') return '/superadmin/dashboard';
    if (user.role === 'admin' || user.role === 'staff') return '/admin/dashboard';
    return '/home';
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
    if (!captchaToken) {
      toast.error('Security check failed. Please verify you are not a robot.');
      return;
    }

    setLoading(true);
    setDeactivationInfo(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    try {
      const result = await login({ ...formData, captchaToken });
      if (result.twoFactorRequired) {
        setTwoFactorRequired(true);
        setLoginEmail(result.email);
        toast.info('Verification code sent to your email');
      } else if (result.success) {
        toast.success('Login successful!');
        const userRole = result.user?.role;
        if (userRole === 'super_admin') navigate('/superadmin/dashboard');
        else if (userRole === 'admin' || userRole === 'staff') navigate('/admin/dashboard');
        else navigate(getRedirectPath());
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
        toast.success('Verification successful!');
        const userRole = result.user?.role;
        if (userRole === 'super_admin') navigate('/superadmin/dashboard');
        else if (userRole === 'admin' || userRole === 'staff') navigate('/admin/dashboard');
        else navigate(getRedirectPath());
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
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Welcome Back</h2>
            <p className="text-slate-500 font-medium">Continue your premium pet experience</p>
          </div>

          {/* Deactivation Notice */}
          {deactivationInfo && (
            <div className="mb-8 p-6 bg-rose-50 border border-rose-100 rounded-[2rem] animate-slide-up">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-white rounded-2xl text-rose-500 shadow-sm">
                  <AlertCircle size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-rose-900 uppercase tracking-widest leading-none">Account Disabled</h3>
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
            <form className="space-y-6" onSubmit={handleSubmit} autoComplete="off">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Email or Username</label>
                  <div className="input-container group">
                    <Mail className="input-icon h-5 w-5" />
                    <input
                      name="email" type="text" required
                      className="input input-with-icon bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4"
                      placeholder="email@example.com or username"
                      value={formData.email}
                      onChange={handleChange}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Secret Key</label>
                  <div className="input-container group">
                    <Lock className="input-icon h-5 w-5" />
                    <input
                      name="password" type={showPassword ? 'text' : 'password'} required
                      className="input input-with-both-icons bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700 py-4"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={handleChange}
                      autoComplete="new-password"
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
              </div>

              <div className="flex items-center justify-between px-1">
                <Link to="/forgot-password" size="sm" className="text-xs font-bold text-primary-600 hover:text-primary-700">
                  Forgot password?
                </Link>
              </div>

              {/* reCAPTCHA - Real Functional Check */}
              <div className="flex justify-center pt-2">
                 <ReCAPTCHA
                   sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
                   onChange={(token) => setCaptchaToken(token)}
                   onExpired={() => setCaptchaToken(null)}
                   theme="light"
                 />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100 relative overflow-hidden group"
              >
                <span className="relative z-10">{loading ? 'Verifying...' : 'Access Account'}</span>
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleVerify2FA}>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary-600">
                  <Lock size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Two-Step Verification</h3>
                <p className="text-xs text-slate-500 font-bold mt-2">
                  We've sent a 6-digit code to <span className="text-primary-600">{loginEmail}</span>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Verification Code</label>
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
                className="btn btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100"
              >
                {verifyingOtp ? 'Verifying Code...' : 'Confirm Identity'}
              </button>

              <button
                type="button"
                onClick={() => setTwoFactorRequired(false)}
                className="w-full text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 py-2"
              >
                Back to Login
              </button>
            </form>
          )}

          <div className="mt-10 pt-8 border-t border-slate-100 text-center space-y-4">
            <p className="text-sm text-slate-500 font-medium">
              New to the community?{' '}
              <Link to="/register" className="text-primary-600 font-black hover:underline underline-offset-4">
                Create Profile
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
              <GoogleIcon />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Google</span>
            </button>
          </div>
        </div>
      </div>

      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 z-[100] animate-fade-in">
          <div className="bg-white rounded-[2rem] max-w-sm w-full shadow-2xl relative overflow-hidden font-sans border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <MessageSquare className="h-2.5 w-2.5 text-primary-600" />
                  <span className="text-[8px] font-black text-primary-600 uppercase tracking-[0.4em] leading-none">CUSTOMER SUPPORT</span>
                </div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">Account <span className="text-primary-600 italic">Recovery</span></h2>
              </div>
              <button 
                onClick={() => setShowSupportModal(false)}
                className="p-2 w-9 h-9 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6">
              <form onSubmit={handleSupportSubmit} className="space-y-5">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Your Email</label>
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
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">How can we help?</label>
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
        </div>
      )}
    </div>
  );
};

export default Login;
