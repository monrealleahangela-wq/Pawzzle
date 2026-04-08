import React, { useState } from 'react';
import {
    AlertTriangle,
    X,
    Upload,
    ShieldAlert,
    Info,
    CheckCircle,
    FileText
} from 'lucide-react';
import { toast } from 'react-toastify';
import { adminReportService as reportService } from '../services/apiService';
import ImageUpload from './ImageUpload';

const UserReportModal = ({ isOpen, onClose, reportedUser }) => {
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');
    const [evidence, setEvidence] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [step, setStep] = useState(1);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason || !description) return;

        if (evidence.length === 0) {
            toast.error('Supporting evidence (images/screenshots) is required to submit a report.');
            return;
        }

        try {
            setSubmitting(true);
            await reportService.createReport({
                reportedUserId: reportedUser.id || reportedUser._id,
                reason,
                description,
                evidence,
                reportType: 'customer_reporting_seller'
            });
            setStep(3); // Success step
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit report');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden relative border border-slate-100 animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">

                {/* Header */}
                <div className="bg-slate-900 p-8 sm:p-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-rose-600/10 rounded-full blur-3xl -mr-24 -mt-24"></div>

                    <button onClick={onClose} className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors">
                        <X className="h-6 w-6" />
                    </button>

                    <div className="relative z-10 flex items-center gap-4 mb-6">
                        <div className="p-3 bg-rose-600 text-white rounded-2xl shadow-xl shadow-rose-900/40">
                            <ShieldAlert className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-rose-400 text-[10px] font-black uppercase tracking-[0.4em]">Enforcement Protocol</p>
                            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter leading-none">Report <span className="text-rose-500 italic">User</span></h2>
                        </div>
                    </div>

                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden">
                            {reportedUser?.avatar ? <img src={reportedUser.avatar} className="w-full h-full object-cover" /> : <Info className="h-5 w-5 text-white/40" />}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-white uppercase tracking-widest">{reportedUser?.firstName || reportedUser?.username}</p>
                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest leading-none mt-1">Target Identity Confirmed</p>
                        </div>
                    </div>
                </div>

                {step === 1 ? (
                    <div className="p-8 sm:p-12 space-y-8 animate-in fade-in slide-in-from-right-8">
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Primary Breach Category</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Scamming', value: 'scam' },
                                    { label: 'Harassment', value: 'harassment' },
                                    { label: 'Fake Account', value: 'fake_account' },
                                    { label: 'Other', value: 'other' }
                                ].map((r) => (
                                    <button
                                        key={r.value}
                                        onClick={() => { setReason(r.value); setStep(2); }}
                                        className="p-5 text-left bg-slate-50 border-2 border-slate-50 rounded-2xl hover:border-rose-500 hover:bg-white transition-all group"
                                    >
                                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight group-hover:text-rose-600">{r.label}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                            <AlertTriangle className="h-10 w-10 text-secondary-500 shrink-0" />
                            <p className="text-[11px] font-bold text-slate-500 leading-relaxed italic uppercase tracking-tight">
                                Filing a false report is a violation of platform guidelines and may result in penalties to your shop account.
                            </p>
                        </div>
                    </div>
                ) : step === 2 ? (
                    <form onSubmit={handleSubmit} className="p-8 sm:p-12 space-y-8 animate-in fade-in slide-in-from-left-8">
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Breach Intel</h3>
                                <button type="button" onClick={() => setStep(1)} className="text-[9px] font-black text-primary-600 uppercase tracking-widest hover:underline">Change Category</button>
                            </div>
                            <textarea
                                required
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Provide specific details about the scamming or incident. Include order numbers if applicable..."
                                className="w-full p-6 bg-slate-50 border-2 border-slate-50 rounded-3xl focus:border-rose-500 focus:bg-white outline-none font-bold text-sm sm:text-base transition-all min-h-[140px]"
                            />
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Supporting Evidence <span className="text-rose-500 font-black">(REQUIRED)</span></h3>
                            <ImageUpload 
                                images={evidence}
                                onImagesChange={setEvidence}
                                multiple={true}
                                maxFiles={5}
                            />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-rose-600 transition-all shadow-2xl active:scale-95 disabled:opacity-50"
                            >
                                {submitting ? 'Transmitting...' : 'Execute Submission'}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-10 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                            >
                                Abort
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="p-16 sm:p-24 text-center animate-in zoom-in-95 duration-700">
                        <div className="w-24 h-24 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                            <CheckCircle className="h-12 w-12" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-4">Intel Logged</h3>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-relaxed max-w-xs mx-auto mb-10">
                            The enforcement team has received your report. Investigation will commence within 24 standard cycles.
                        </p>
                        <button
                            onClick={onClose}
                            className="px-12 py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-600 transition-all shadow-2xl active:scale-95"
                        >
                            Close Hub
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserReportModal;
