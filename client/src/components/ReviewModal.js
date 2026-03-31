import React, { useState } from 'react';
import Modal from './ui/Modal';
import { Star, MessageSquare, Send, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { reviewService } from '../services/apiService';
import ImageUpload from './ImageUpload';

const ReviewModal = ({ 
    isOpen, 
    onClose, 
    targetType, // 'Product', 'Pet', 'Service', 'Store'
    targetId, 
    targetName,
    orderId, 
    bookingId,
    onReviewSubmitted 
}) => {
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [images, setImages] = useState([]);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    if (!targetId) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!comment.trim()) {
            toast.error('Please add a comment');
            return;
        }

        setSubmitting(true);
        try {
            await reviewService.createReview({
                targetType,
                targetId,
                orderId,
                bookingId,
                rating,
                comment,
                images,
                isAnonymous
            });
            toast.success('Review submitted successfully!');
            if (onReviewSubmitted) onReviewSubmitted();
            onClose();
            // Reset form
            setRating(5);
            setComment('');
            setImages([]);
            setIsAnonymous(false);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Rate ${targetName}`} size="sm">
            <form onSubmit={handleSubmit} className="p-1 space-y-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Overall Rating</label>
                    <div className="flex gap-2 mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                onClick={() => setRating(star)}
                                className="focus:outline-none transition-transform hover:scale-110 active:scale-95"
                            >
                                <Star
                                    className={`h-8 w-8 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                                        }`}
                                />
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tighter italic">
                        {rating === 5 ? 'Excellent!' : rating === 4 ? 'Very Good!' : rating === 3 ? 'Good' : rating === 2 ? 'Fair' : 'Poor'}
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Your detailed experience</label>
                        <textarea
                            required
                            rows={3}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-primary-500 focus:bg-white outline-none text-xs font-medium text-slate-700 transition-all resize-none shadow-inner"
                            placeholder="Tell us what you liked or what could be better..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Media Manifest (Optional)</label>
                        <ImageUpload
                            images={images}
                            onImagesChange={setImages}
                            multiple={true}
                            maxFiles={5}
                            label=""
                        />
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 group cursor-pointer active:scale-[0.98] transition-all" onClick={() => setIsAnonymous(!isAnonymous)}>
                        <div className={`w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center ${isAnonymous ? 'bg-primary-600 border-primary-600 shadow-lg shadow-primary-200' : 'border-slate-200 bg-white'}`}>
                            {isAnonymous && <div className="w-2 h-2 bg-white rounded-full translate-y-[0.5px]" />}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Stealth Mode (Anonymous)</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter opacity-70">Hide your identity from public view</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-50">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
                    >
                        {submitting ? 'Transmitting...' : (
                            <>
                                <Send className="h-4 w-4" /> Submit Report
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all active:scale-95"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default ReviewModal;
