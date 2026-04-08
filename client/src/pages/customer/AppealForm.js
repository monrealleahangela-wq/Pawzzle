import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, Send, Image as ImageIcon, CheckCircle, Info, ArrowLeft, Loader2 } from 'lucide-react';
import { adminReportService, getImageUrl } from '../../services/apiService';
import { toast } from 'react-toastify';
import ImageUpload from '../../components/ImageUpload';

const AppealForm = () => {
    const { reportId } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        content: '',
        evidence: []
    });

    useEffect(() => {
        const fetchReportDetail = async () => {
            try {
                setLoading(true);
                const response = await adminReportService.getReportById(reportId);
                setReport(response.data.report);
                if (response.data.report.appeal && response.data.report.appeal.status !== 'none') {
                    setStep(3); // Already submitted
                }
            } catch (error) {
                toast.error('Failed to load report details');
                navigate('/profile');
            } finally {
                setLoading(false);
            }
        };

        if (reportId) fetchReportDetail();
    }, [reportId, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.content.trim()) {
            toast.error('Please provide details for your appeal');
            return;
        }

        try {
            setSubmitting(true);
            await adminReportService.submitAppeal(reportId, formData);
            setStep(3);
            toast.success('Appeal submitted successfully');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit appeal');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pt-12 pb-24 px-4">
            <div className="max-w-3xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button 
                        onClick={() => navigate('/profile')}
                        className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors group"
                    >
                        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Back to Profile</span>
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1 bg-secondary-100 text-primary-600 rounded-full">
                        <Shield className="h-3 w-3" />
                        <span className="text-[8px] font-black uppercase tracking-widest">Enforcement Dispute</span>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-slate-100">
                        <div 
                            className="h-full bg-primary-600 transition-all duration-500" 
                            style={{ width: `${(step / 3) * 100}%` }}
                        />
                    </div>

                    {step === 1 && (
                        <div className="p-8 sm:p-12 space-y-8 animate-in fade-in slide-in-from-bottom-8">
                            <div className="space-y-2">
                                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                                    Report <span className="text-rose-500 italic">Review</span>
                                </h1>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Case ID: {reportId.slice(-8)}</p>
                            </div>

                            <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 space-y-4">
                                <div className="flex items-center gap-3 text-rose-600">
                                    <AlertTriangle className="h-5 w-5" />
                                    <h3 className="text-xs font-black uppercase tracking-widest">Policy Violation Found</h3>
                                </div>
                                <div className="space-y-1 pl-8">
                                    <p className="text-[11px] font-black text-slate-900 uppercase">Reason: {report.reason.replace('_', ' ')}</p>
                                    <p className="text-sm text-slate-600 font-medium italic">"{report.details}"</p>
                                </div>
                                <div className="pl-8 pt-2">
                                    <div className="px-3 py-1 bg-white border border-rose-100 rounded-lg inline-block">
                                        <p className="text-[9px] font-black text-rose-500 uppercase">Status: {report.status.replace('_', ' ')}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">What happens now?</h3>
                                <div className="grid gap-3">
                                    {[
                                        { title: 'Information Review', desc: 'You can provide your side of the story and any evidence.' },
                                        { title: 'Admin Evaluation', desc: 'Our safety team will manually re-examine the case.' },
                                        { title: 'Final Decision', desc: 'The action may be upheld, modified, or completely reversed.' }
                                    ].map((item, i) => (
                                        <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex gap-4">
                                            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-[10px] font-black text-slate-300 shadow-sm">{i + 1}</div>
                                            <div>
                                                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{item.title}</h4>
                                                <p className="text-[11px] text-slate-500 font-medium">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={() => setStep(2)}
                                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl shadow-slate-200"
                            >
                                Start Formal Appeal
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleSubmit} className="p-8 sm:p-12 space-y-8 animate-in fade-in slide-in-from-right-8">
                            <div className="space-y-2">
                                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                                    Strategic <span className="text-primary-600 italic">Defense</span>
                                </h1>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Provide detailed justification for recovery</p>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Detailed Explanation</label>
                                    <textarea
                                        required
                                        className="w-full p-6 bg-slate-50 border border-slate-100 rounded-[2rem] outline-none focus:ring-2 focus:ring-primary-500/10 focus:bg-white font-medium text-slate-700 h-48 resize-none transition-all"
                                        placeholder="Explain why this report is incorrect or provides missing context..."
                                        value={formData.content}
                                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Supporting Evidence</label>
                                    <ImageUpload
                                        images={formData.evidence}
                                        onImagesChange={(newImages) => setFormData({ ...formData, evidence: newImages })}
                                        multiple={true}
                                        maxFiles={5}
                                    />
                                </div>
                            </div>

                            <div className="flex items-start gap-4 p-6 bg-blue-50 rounded-3xl border border-blue-100">
                                <Info className="h-6 w-6 text-blue-500 shrink-0" />
                                <p className="text-[10px] font-bold text-blue-700 leading-relaxed uppercase tracking-tight">
                                    The submission of this appeal marks it as 'Appealed' in the system. The Super Admin team will be notified immediately of your strategic rebuttal.
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="px-8 py-4 border-2 border-slate-100 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-inter"
                                >
                                    Review Case
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    Submit Appeal
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 3 && (
                        <div className="p-8 sm:p-20 text-center space-y-8 animate-in zoom-in-95 duration-500">
                            <div className="w-24 h-24 bg-emerald-50 rounded-[2.5rem] flex items-center justify-center mx-auto ring-8 ring-emerald-50/50">
                                <CheckCircle className="h-12 w-12 text-emerald-500" />
                            </div>
                            <div className="space-y-3">
                                <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                                    Appeal <span className="text-emerald-500 italic">Logged</span>
                                </h1>
                                <p className="max-w-xs mx-auto text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                                    Your strategic dispute has been successfully recorded in the Enforcement Registry. Our safety team will review it within 48 operational hours.
                                </p>
                            </div>

                            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-left">
                                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Current Status</h4>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-slate-900 uppercase">Awaiting Re-evaluation</span>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded-md text-[8px] font-black uppercase">Appealed</span>
                                </div>
                            </div>

                            <button
                                onClick={() => navigate('/profile')}
                                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl"
                            >
                                Back to Profile
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AppealForm;
