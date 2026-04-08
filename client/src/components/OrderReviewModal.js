import React, { useState } from 'react';
import Modal from './ui/Modal';
import { Star, MessageSquare, Send, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { reviewService } from '../services/apiService';
import ImageUpload from './ImageUpload';

const OrderReviewModal = ({ isOpen, onClose, item, orderId, onReviewSubmitted }) => {
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [images, setImages] = useState([]);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    if (!item) return null;

    // Map itemType to Review targetType
    const targetType = item.itemType === 'pet' ? 'Pet' : 'Product';

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
                targetId: item.itemId,
                orderId,
                rating,
                comment,
                images,
                isAnonymous
            });
            toast.success('Review submitted successfully!');
            onReviewSubmitted();
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

    const renderStars = () => {
        return (
            <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="focus:outline-none transition-transform hover:scale-110"
                    >
                        <Star
                            className={`h-8 w-8 ${star <= rating ? 'fill-secondary-400 text-secondary-400' : 'text-slate-200'
                                }`}
                        />
                    </button>
                ))}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Review ${item.name}`} size="sm">
            <form onSubmit={handleSubmit} className="p-1 space-y-4">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col items-center">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Rate this item</label>
                    <div className="flex gap-1.5 mb-1.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                onClick={() => setRating(star)}
                                className="focus:outline-none transition-transform hover:scale-110"
                            >
                                <Star
                                    className={`h-6 w-6 ${star <= rating ? 'fill-secondary-400 text-secondary-400' : 'text-slate-200'
                                        }`}
                                />
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] font-bold text-slate-900 uppercase tracking-tighter italic">
                        {rating === 5 ? 'Excellent!' : rating === 4 ? 'Very Good!' : rating === 3 ? 'Good' : rating === 2 ? 'Fair' : 'Poor'}
                    </p>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Your Feedback</label>
                        <textarea
                            required
                            rows={2}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 focus:bg-white outline-none text-xs font-medium text-slate-700 transition-all resize-none"
                            placeholder="How was the quality?"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Add Photos (Optional)</label>
                        <ImageUpload
                            images={images}
                            onImagesChange={setImages}
                            multiple={true}
                            maxFiles={5}
                            label=""
                        />
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 group cursor-pointer" onClick={() => setIsAnonymous(!isAnonymous)}>
                        <div className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center ${isAnonymous ? 'bg-primary-600 border-primary-600' : 'border-slate-200 bg-white'}`}>
                            {isAnonymous && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest leading-none mb-1">Post Anonymously</p>
                            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter opacity-60">Your name will be hidden</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-[0.2em] text-[9px] hover:bg-primary-600 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {submitting ? 'Submitting...' : (
                            <>
                                <Send className="h-3.5 w-3.5" /> Submit Review
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 bg-slate-100 text-slate-400 rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-slate-200 transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default OrderReviewModal;
