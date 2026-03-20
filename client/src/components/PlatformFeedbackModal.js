import React, { useState } from 'react';
import { Heart, X, Send, Sparkles, Smile, Bug, Zap, Layout } from 'lucide-react';
import { toast } from 'react-toastify';
import { reviewService } from '../services/apiService';

const PlatformFeedbackModal = ({ isOpen, onClose }) => {
    const [rating, setRating] = useState(5);
    const [category, setCategory] = useState('General');
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const categories = [
        { name: 'General', icon: Smile, color: 'text-amber-500 bg-amber-50' },
        { name: 'UI/UX', icon: Layout, color: 'text-blue-500 bg-blue-50' },
        { name: 'Performance', icon: Zap, color: 'text-emerald-500 bg-emerald-50' },
        { name: 'Bug Report', icon: Bug, color: 'text-rose-500 bg-rose-50' },
        { name: 'Features', icon: Sparkles, color: 'text-purple-500 bg-purple-50' }
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (comment.length < 5) {
            toast.error('Please share a bit more detail');
            return;
        }

        setIsSubmitting(true);
        try {
            await reviewService.createPlatformFeedback({
                rating,
                category,
                comment,
                deviceInfo: {
                    browser: navigator.userAgent,
                    platform: navigator.platform
                }
            });
            toast.success('Your feedback makes us better. Thank you!');
            setComment('');
            onClose();
        } catch (error) {
            toast.error('Failed to send feedback');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl relative overflow-hidden animate-slide-up">
                {/* Header Decoration */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary-400 via-purple-400 to-rose-400" />

                <div className="p-8 sm:p-12">
                    <div className="flex justify-between items-start mb-8">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
                                <span className="text-[9px] font-black text-rose-500 uppercase tracking-[0.3em]">YOU ARE THE BEST</span>
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                                Help Us <span className="text-primary-600 italic">Grow</span>
                            </h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Your feedback fuels our progress</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                            <X className="h-5 w-5 text-slate-400" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Rating Section */}
                        <div className="space-y-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Your platform experience</p>
                            <div className="flex justify-center gap-4">
                                {[1, 2, 3, 4, 5].map((val) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setRating(val)}
                                        className={`transition-all duration-300 ${rating === val ? 'scale-125' : 'opacity-40 hover:opacity-100 grayscale hover:grayscale-0'}`}
                                    >
                                        <span className="text-3xl">{['😫', '😕', '😐', '😊', '😍'][val - 1]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category Section */}
                        <div className="grid grid-cols-3 gap-2">
                            {categories.map((cat) => (
                                <button
                                    key={cat.name}
                                    type="button"
                                    onClick={() => setCategory(cat.name)}
                                    className={`p-3 rounded-2xl flex flex-col items-center gap-1.5 transition-all text-center ${category === cat.name ? 'ring-2 ring-primary-500 bg-slate-50' : 'bg-transparent border border-slate-100 hover:border-primary-200'
                                        }`}
                                >
                                    <cat.icon className={`h-4 w-4 ${cat.color} p-1 rounded-lg box-content`} />
                                    <span className="text-[9px] font-black uppercase tracking-tight text-slate-600">{cat.name}</span>
                                </button>
                            ))}
                        </div>

                        {/* Comment Section */}
                        <div className="relative">
                            <textarea
                                required
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="What's bothering you? Or what do you love? We read everything."
                                className="w-full h-32 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] outline-none focus:ring-1 focus:ring-primary-500 font-medium text-slate-700 text-sm resize-none transition-all placeholder:text-slate-300 placeholder:italic"
                            />
                            <div className="absolute bottom-4 right-6 text-[8px] font-black text-slate-300 uppercase tracking-widest">
                                {comment.length}/2000
                            </div>
                        </div>

                        <button
                            disabled={isSubmitting}
                            type="submit"
                            className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-200 hover:bg-primary-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                        >
                            <Send className="h-4 w-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                            {isSubmitting ? 'Sending...' : 'Send Feedback'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PlatformFeedbackModal;
