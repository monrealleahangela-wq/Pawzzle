import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import authService from '../../services/authService';
import { toast } from 'react-toastify';
import { ShieldCheck, Lock, Eye, EyeOff, CheckCircle2, ArrowRight } from 'lucide-react';

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
            const result = await authService.changePassword({
                currentPassword: passwords.current,
                newPassword: passwords.new
            });
            
            toast.success('Password updated successfully! Welcome to the team.');
            
            // Update local user state to remove the flag
            const updatedUser = {
                ...user,
                requiresPasswordChange: result?.requiresPasswordChange ?? false
            };
            updateUser(updatedUser);
            
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update password. Please check your current password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/75 p-3 backdrop-blur-sm sm:p-4">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="password-change-title"
                className="w-full max-w-md max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)]"
            >
                <div className="p-5 sm:p-6">
                    <div className="mb-4 flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 id="password-change-title" className="text-xl font-black leading-tight text-slate-900">
                                Create a new password
                            </h2>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                                Required before you can continue to your staff account.
                            </p>
                        </div>
                    </div>

                    <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-3">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                        <p className="text-xs leading-relaxed text-primary-900">
                            You are using a temporary password. Replace it with a private password only you know.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-3">
                            {/* Current Password */}
                            <div>
                                <label htmlFor="current-temporary-password" className="mb-1.5 block text-xs font-bold text-slate-700">Temporary password</label>
                                <div className="relative group">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary-500">
                                        <Lock className="h-4 w-4" />
                                    </div>
                                    <input
                                        id="current-temporary-password"
                                        type={showCurrent ? "text" : "password"}
                                        value={passwords.current}
                                        onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-11 text-sm font-semibold text-slate-900 transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                                        placeholder="Enter the password given to you"
                                        autoComplete="current-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        aria-label={showCurrent ? 'Hide temporary password' : 'Show temporary password'}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-900"
                                    >
                                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* New Password */}
                            <div>
                                <label htmlFor="new-staff-password" className="mb-1.5 block text-xs font-bold text-slate-700">New password</label>
                                <div className="relative group">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-500">
                                        <CheckCircle2 className="h-4 w-4" />
                                    </div>
                                    <input
                                        id="new-staff-password"
                                        type={showNew ? "text" : "password"}
                                        value={passwords.new}
                                        onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-11 text-sm font-semibold text-slate-900 transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        placeholder="At least 6 characters"
                                        autoComplete="new-password"
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNew(!showNew)}
                                        aria-label={showNew ? 'Hide new password' : 'Show new password'}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-900"
                                    >
                                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label htmlFor="confirm-staff-password" className="mb-1.5 block text-xs font-bold text-slate-700">Confirm new password</label>
                                <div className="relative group">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-500">
                                        <Lock className="h-4 w-4" />
                                    </div>
                                    <input
                                        id="confirm-staff-password"
                                        type={showConfirm ? "text" : "password"}
                                        value={passwords.confirm}
                                        onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-11 text-sm font-semibold text-slate-900 transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                        placeholder="Enter the new password again"
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        aria-label={showConfirm ? 'Hide confirmed password' : 'Show confirmed password'}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-900"
                                    >
                                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <p className="text-[11px] leading-relaxed text-slate-500">
                            Use at least 6 characters. Do not reuse the temporary password.
                        </p>

                        <div className="flex flex-col gap-2 pt-1">
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? 'Saving new password...' : (
                                    <>
                                        Save new password <ArrowRight className="h-4 w-4" />
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={logout}
                                className="w-full py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-rose-600"
                            >
                                Sign out instead
                            </button>
                        </div>
                    </form>
                </div>
            </section>
        </div>
    );
};

export default PasswordChangeModal;
