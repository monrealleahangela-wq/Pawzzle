import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';
import { toast } from 'react-toastify';
import { ShieldAlert, Lock, Eye, EyeOff, CheckCircle2, ArrowRight } from 'lucide-react';

const PasswordChangeModal = () => {
    const { user, updateUser, logout } = useAuth();
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [loading, setLoading] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // If user doesn't need to change password, don't show anything
    if (!user?.requiresPasswordChange) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            return toast.error('Passwords do not match');
        }
        if (passwords.new.length < 6) {
            return toast.error('New password must be at least 6 characters');
        }

        setLoading(true);
        try {
            await authService.changePassword({
                currentPassword: passwords.current,
                newPassword: passwords.new
            });
            
            toast.success('Password updated successfully! Welcome to the team.');
            
            // Update local user state to remove the flag
            const updatedUser = { ...user, requiresPasswordChange: false };
            updateUser(updatedUser);
            
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update password. Please check your current password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 overflow-y-auto no-scrollbar">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative overflow-hidden border border-slate-200">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-bl-[4rem] -z-10" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-rose-50 rounded-tr-[3rem] -z-10" />

                <div className="p-8 sm:p-10 space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="inline-flex p-4 bg-primary-600 rounded-3xl shadow-xl shadow-primary-200 mb-2">
                            <ShieldAlert className="h-8 w-8 text-white animate-pulse" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                            Security <span className="text-primary-600 italic">Enforced</span>
                        </h2>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest text-center">
                            A password change is required on your first login
                        </p>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-4">
                        <div className="p-2 bg-white rounded-xl text-amber-500 shrink-0">
                            <Lock className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-[11px] font-black text-amber-900 uppercase tracking-widest leading-none mb-1">Temporary Credentials Detected</p>
                            <p className="text-[10px] font-medium text-amber-700 leading-relaxed">For your protection, you must replace the system-generated password with a secure personal one before proceeding.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-4">
                            {/* Current Password */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Current Temporary Password</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors">
                                        <Lock className="h-4 w-4" />
                                    </div>
                                    <input
                                        type={showCurrent ? "text" : "password"}
                                        value={passwords.current}
                                        onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-12 py-4 text-slate-900 font-bold focus:outline-none focus:border-primary-400 transition-all text-sm"
                                        placeholder="Enter current password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                                    >
                                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="h-px bg-slate-100 mx-4" />

                            {/* New Password */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">New Secure Password</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                                        <CheckCircle2 className="h-4 w-4" />
                                    </div>
                                    <input
                                        type={showNew ? "text" : "password"}
                                        value={passwords.new}
                                        onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-12 py-4 text-slate-900 font-bold focus:outline-none focus:border-emerald-400 transition-all text-sm"
                                        placeholder="Minimum 6 characters"
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNew(!showNew)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                                    >
                                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 px-1">Confirm New Password</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                                        <Lock className="h-4 w-4" />
                                    </div>
                                    <input
                                        type={showConfirm ? "text" : "password"}
                                        value={passwords.confirm}
                                        onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-12 py-4 text-slate-900 font-bold focus:outline-none focus:border-emerald-400 transition-all text-sm"
                                        placeholder="Confirm new password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                                    >
                                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex flex-col gap-3">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4.5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-primary-600 transition-all active:scale-[0.98] shadow-2xl flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {loading ? 'UPDATING SECURITY...' : (
                                    <>
                                        Update Password & Proceed <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={logout}
                                className="w-full py-3 text-slate-400 hover:text-rose-600 font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                            >
                                Not you? Sign out
                            </button>
                        </div>
                    </form>
                </div>

                {/* Footer Warning */}
                <div className="bg-slate-50 p-6 flex justify-center border-t border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 italic">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse" />
                        This session is locked until password verification
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PasswordChangeModal;
