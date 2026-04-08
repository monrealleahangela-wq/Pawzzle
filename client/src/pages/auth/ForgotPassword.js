import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Mail, ArrowLeft, Eye, EyeOff, Lock, ShieldCheck, RefreshCw, KeyRound, CheckCircle } from 'lucide-react';
import authService from '../../services/authService';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(1); // 1: email, 2: otp + new password, 3: success
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState('email');
  const [phone, setPhone] = useState(''); // To store phone if fallback happened
  const otpRefs = useRef([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // ─── Step 1: Request OTP ──────────────────────────────────────────────────
  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authService.requestPasswordResetOTP({ email });
      const data = response.data || response;
      toast.success(data.message || 'Reset code sent!');
      setDeliveryMethod(data.deliveryMethod || 'email');
      setPhone(data.phone || '');
      setStep(2);
      setResendCooldown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 300);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  // ─── OTP Input handlers ──────────────────────────────────────────────────
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
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
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // ─── Step 2: Verify OTP + Reset Password ─────────────────────────────────
  const handleVerifyAndReset = async (e) => {
    e.preventDefault();
    const otp = otpDigits.join('');

    if (otp.length !== 6) {
      toast.error('Please enter the complete 6-digit code');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}[\]|:;"'<>,.?/~`]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      toast.error('Password must be at least 8 characters with uppercase, lowercase, numbers, and symbols');
      return;
    }

    setLoading(true);

    try {
      const response = await authService.verifyOTPAndResetPassword({ email, otp, newPassword });
      const data = response.data || response;
      toast.success(data.message || 'Password reset successful!');
      setStep(3);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend OTP ──────────────────────────────────────────────────────────
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;

    try {
      const response = await authService.resendPasswordResetOTP({ email });
      const data = response.data || response;
      toast.success(data.message || 'New reset code sent!');
      setDeliveryMethod(data.deliveryMethod || 'email');
      setResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to resend code');
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
        <div className="glass-morphism rounded-[40px] p-8 md:p-12 border border-white/40 shadow-2xl relative">
          {/* Header Icon */}
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-3xl flex items-center justify-center shadow-xl shadow-primary-200 rotate-6 group hover:rotate-12 transition-transform duration-500">
            {step === 3 ? (
              <CheckCircle className="h-12 w-12 text-white" />
            ) : (
              <KeyRound className="h-12 w-12 text-white" />
            )}
          </div>

          {/* ─── Step 1: Email Input ────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="text-center mt-10 mb-10 space-y-2">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Reset Password</h2>
                <p className="text-slate-500 font-medium text-sm">Enter your email to receive a reset code</p>
              </div>

              <form onSubmit={handleRequestOTP} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Email Address</label>
                  <div className="input-container group">
                    <Mail className="input-icon h-5 w-5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input input-with-icon w-full py-4 bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700"
                      placeholder="name@example.com"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100 relative overflow-hidden group"
                >
                  <span className="relative z-10">{loading ? 'Sending Code...' : 'Send Reset Code'}</span>
                </button>
              </form>
            </>
          )}

          {/* ─── Step 2: OTP + New Password ─────────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="text-center mt-10 mb-6 space-y-3">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                  {deliveryMethod === 'sms' ? 'Verify Your Phone' : 'Enter Code'}
                </h2>
                <p className="text-slate-500 font-medium text-sm">
                  We sent a 6-digit code to
                </p>
                <p className="text-primary-600 font-black text-sm tracking-wide">
                  {deliveryMethod === 'sms' ? phone || 'your phone' : email}
                </p>
              </div>

              <form onSubmit={handleVerifyAndReset} className="space-y-6">
                {/* OTP Grid */}
                <div className="flex justify-center gap-2 sm:gap-3">
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
                      className={`w-11 h-13 sm:w-13 sm:h-15 text-center text-xl sm:text-2xl font-black rounded-2xl border-2 outline-none transition-all duration-300
                        ${digit
                          ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-lg shadow-primary-100'
                          : 'border-slate-200 bg-white/50 text-slate-900 hover:border-slate-300'
                        }
                        focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10`}
                    />
                  ))}
                </div>

                {/* Timer & Resend */}
                <div className="text-center">
                  {resendCooldown > 0 ? (
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      Resend code in <span className="text-primary-600 font-black">{resendCooldown}s</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      className="text-[11px] font-black text-primary-600 uppercase tracking-widest hover:text-primary-700 flex items-center gap-1.5 mx-auto transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Resend Code
                    </button>
                  )}
                </div>

                {/* New Password Fields */}
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary-600 pt-2">New Password</h3>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                    <div className="input-container group">
                      <Lock className="input-icon h-5 w-5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="input input-with-both-icons w-full py-4 bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700"
                        placeholder="New password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="input-icon-right pointer-events-auto hover:text-primary-500 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirm Password</label>
                    <div className="input-container group">
                      <Lock className="input-icon h-5 w-5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="input input-with-both-icons w-full py-4 bg-white/50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700"
                        placeholder="Repeat new password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="input-icon-right pointer-events-auto hover:text-primary-500 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight px-1">
                    MIN 8 CHARS (14+ RECOMMENDED) • UPPER • LOWER • NUMBER • SYMBOL
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || otpDigits.join('').length !== 6}
                  className="btn btn-primary w-full py-5 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100 relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="relative z-10">{loading ? 'Resetting Password...' : 'Verify & Reset Password'}</span>
                </button>
              </form>
            </>
          )}

          {/* ─── Step 3: Success ─────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="text-center mt-10 space-y-6">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-100">
                <CheckCircle className="h-10 w-10 text-emerald-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Password Reset!</h2>
                <p className="text-slate-500 font-medium text-sm">Your password has been updated successfully. You can now log in with your new password.</p>
              </div>
              <Link
                to="/login"
                className="btn btn-primary inline-flex py-4 px-10 text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary-100"
              >
                Go to Login
              </Link>
            </div>
          )}

          {/* Back to Login link */}
          {step !== 3 && (
            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <Link
                to="/login"
                className="text-sm text-slate-500 font-medium hover:text-primary-600 flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
