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
                            className={`h-8 w-8 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                                }`}
                        />
                    </button>
                ))}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Review ${item.name}`}>
            <form onSubmit={handleSubmit} className="p-1 space-y-6">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col items-center">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 block">Rate this item</label>
                    {renderStars()}
                    <p className="text-sm font-bold text-slate-900 uppercase tracking-tighter italic">
                        {rating === 5 ? 'Excellent!' : rating === 4 ? 'Very Good!' : rating === 3 ? 'Good' : rating === 2 ? 'Fair' : 'Poor'}
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Your Feedback</label>
                        <textarea
                            required
                            rows={4}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-primary-500 focus:bg-white outline-none font-medium text-slate-700 transition-all resize-none"
                            placeholder="How was the quality? Did it meet your expectations?"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Add Photos (Optional)</label>
                        <ImageUpload
                            images={images}
                            onImagesChange={setImages}
                            multiple={true}
                            maxFiles={5}
                            label=""
                        />
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 group cursor-pointer" onClick={() => setIsAnonymous(!isAnonymous)}>
                        <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${isAnonymous ? 'bg-primary-600 border-primary-600' : 'border-slate-200 bg-white'}`}>
                            {isAnonymous && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Post Anonymously</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter opacity-60">Your name will be hidden from the public review list</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {submitting ? 'Submitting...' : (
                            <>
                                <Send className="h-4 w-4" /> Submit Review
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-8 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default OrderReviewModal;
