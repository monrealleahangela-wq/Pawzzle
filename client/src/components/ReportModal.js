import React, { useState } from 'react';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';
import { toast } from 'react-toastify';
import { adminReportService } from '../services/apiService';

const ReportModal = ({ isOpen, onClose, reportedUser }) => {
    const [formData, setFormData] = useState({
        reason: 'scam',
        details: ''
    });
    const [loading, setLoading] = useState(false);

    if (!isOpen || !reportedUser) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await adminReportService.createReport({
                reportedUserId: reportedUser._id,
                reason: formData.reason,
                details: formData.details
            });
            toast.success('Report submitted successfully');
            setFormData({ reason: 'scam', details: '' });
            onClose();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit report');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in">
            <div className="bg-white rounded-[3rem] max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up">
                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                            <ShieldAlert className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                                Report <span className="text-rose-600 italic">User</span>
                            </h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Submit a safety report</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-10 space-y-6">
                    <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex gap-4">
                        <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[11px] font-black text-rose-900 uppercase tracking-tight mb-1">Target User</p>
                            <p className="text-[13px] font-bold text-rose-700 uppercase">
                                {reportedUser.firstName} {reportedUser.lastName} (@{reportedUser.username})
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reason for Report</label>
                        <select
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-1 focus:ring-rose-500 font-bold text-slate-900"
                        >
                            <option value="scam">Scam / Fraudulent Activity</option>
                            <option value="spam">Spamming</option>
                            <option value="harassment">Harassment</option>
                            <option value="suspicious_activity">Suspicious Activity</option>
                            <option value="offensive_content">Offensive Content</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Details</label>
                        <textarea
                            required
                            rows="4"
                            placeholder="Provide specific details about the issue..."
                            value={formData.details}
                            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-1 focus:ring-rose-500 font-bold text-slate-900 resize-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-5 bg-rose-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-xl shadow-rose-100 disabled:opacity-50"
                    >
                        {loading ? 'Submitting...' : 'Submit Report'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ReportModal;
