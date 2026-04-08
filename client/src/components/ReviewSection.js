import React, { useState, useEffect, useCallback } from 'react';
import { Star, MessageSquare, Image as ImageIcon, Send, User, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { reviewService, getImageUrl } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import ImageUpload from './ImageUpload';

const ReviewSection = ({ targetType, targetId }) => {
    const { user, isAuthenticated } = useAuth();
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        rating: 5,
        comment: '',
        images: [],
        isAnonymous: false
    });
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1
    });
    const [isEligible, setIsEligible] = useState(false);

    const fetchReviews = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await reviewService.getTargetReviews(targetType, targetId, { page, limit: 10 });
            setReviews(response.data.reviews);
            setPagination(response.data.pagination);

            // Check eligibility if authenticated
            if (isAuthenticated) {
                const eligibilityRes = await reviewService.checkReviewEligibility(targetType, targetId);
                setIsEligible(eligibilityRes.data.isEligible);
            }
        } catch (error) {
            console.error('Fetch reviews error:', error);
        } finally {
            setLoading(false);
        }
    }, [targetType, targetId, isAuthenticated]);

    useEffect(() => {
        fetchReviews();
    }, [fetchReviews]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isAuthenticated) {
            toast.error('Please login to submit a review');
            return;
        }

        try {
            await reviewService.createReview({
                targetType,
                targetId,
                ...formData
            });
            toast.success('Review submitted successfully!');
            setShowForm(false);
            setFormData({ rating: 5, comment: '', images: [], isAnonymous: false });
            fetchReviews();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit review');
        }
    };

    const renderStars = (rating, setRating = null) => {
        return (
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        className={`h-4 w-4 ${star <= rating ? 'fill-secondary-400 text-secondary-400' : 'text-slate-200'} ${setRating ? 'cursor-pointer hover:scale-110' : ''} transition-all`}
                        onClick={() => setRating && setRating(star)}
                    />
                ))}
            </div>
        );
    };

    return (
        <div className="mt-12 space-y-8">
            <div className="flex justify-between items-end border-b border-slate-100 pb-6">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                        Reviews <span className="text-primary-600 italic">& Feedback</span>
                    </h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">What our customers say</p>
                </div>
                {!showForm && isAuthenticated && (
                    isEligible ? (
                        <button
                            onClick={() => setShowForm(true)}
                            className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-lg"
                        >
                            Write Review
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl group hover:border-secondary-200 transition-all">
                            <AlertCircle className="h-3 w-3 text-secondary-500" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-primary-600 transition-colors">
                                Verified Buyers Only
                            </p>
                        </div>
                    )
                )}
            </div>

            {showForm && (
                <div className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-xl animate-scale-in">
                    <div className="flex justify-between items-start mb-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Submit Your Review</h3>
                        <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                            <MessageSquare className="h-5 w-5" />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Your Rating</label>
                            {renderStars(formData.rating, (val) => setFormData({ ...formData, rating: val }))}
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Your Feedback</label>
                            <textarea
                                required
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-1 focus:ring-primary-500 font-medium text-slate-700 h-32 resize-none"
                                placeholder="Share your experience with this item..."
                                value={formData.comment}
                                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Add Photos (Optional)</label>
                            <ImageUpload
                                images={formData.images}
                                onImagesChange={(newImages) => setFormData({ ...formData, images: newImages })}
                                multiple={true}
                                maxFiles={5}
                                label=""
                            />
                        </div>
                        <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <input
                                type="checkbox"
                                id="isAnonymous"
                                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                checked={formData.isAnonymous}
                                onChange={(e) => setFormData({ ...formData, isAnonymous: e.target.checked })}
                            />
                            <label htmlFor="isAnonymous" className="text-[10px] font-black text-slate-600 uppercase tracking-widest cursor-pointer select-none">
                                Post Anonymously <span className="text-[8px] opacity-40 font-bold ml-1 tracking-tight">(Hide my identity from public)</span>
                            </label>
                        </div>
                        <button
                            type="submit"
                            className="w-full py-4 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
                        >
                            <Send className="h-4 w-4" /> Submit Review
                        </button>
                    </form>
                </div>
            )}

            <div className="space-y-4">
                {loading ? (
                    <div className="py-20 text-center animate-pulse">
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-4" />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Loading reviews...</p>
                    </div>
                ) : reviews.length === 0 ? (
                    <div className="py-20 text-center bg-slate-50/50 rounded-[3rem] border border-dashed border-slate-200">
                        <MessageSquare className="h-10 w-10 text-slate-200 mx-auto mb-4" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No reviews yet. Be the first!</p>
                    </div>
                ) : (
                    reviews.map((review) => (
                        <div key={review._id} className="bg-white border border-slate-100 p-6 rounded-[2rem] hover:shadow-lg transition-all">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl ${review.isAnonymous ? 'bg-slate-100' : 'bg-primary-100'} flex items-center justify-center overflow-hidden transition-all duration-500`}>
                                        {(!review.isAnonymous && review.user?.avatar) ? (
                                            <img src={getImageUrl(review.user.avatar)} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className={`h-5 w-5 ${review.isAnonymous ? 'text-slate-400' : 'text-primary-600'}`} />
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight leading-none mb-1">
                                            {review.isAnonymous ? "Anonymous Customer" : `${review.user?.firstName || 'User'} ${review.user?.lastName || ''}`}
                                        </h4>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic leading-none opacity-60">
                                            {new Date(review.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                {renderStars(review.rating)}
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-600 font-medium leading-relaxed italic opacity-80 pl-1">
                                "{review.comment}"
                            </p>

                            {/* Review Images */}
                            {review.images && review.images.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2 px-1">
                                    {review.images.map((img, i) => (
                                        <div key={i} className="group relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-100 shadow-sm transition-all hover:shadow-md cursor-pointer">
                                            <img
                                                src={getImageUrl(img)}
                                                alt={`Review attachment ${i + 1}`}
                                                className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {review.reply && (
                                <div className="mt-4 ml-8 p-4 bg-primary-50 border-l-2 border-primary-200 rounded-r-2xl">
                                    <p className="text-[8px] font-black text-primary-600 uppercase tracking-widest mb-1">Response from seller</p>
                                    <p className="text-[10px] text-slate-600 font-medium">{review.reply.comment}</p>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                    {[...Array(pagination.totalPages)].map((_, i) => (
                        <button
                            key={i}
                            onClick={() => fetchReviews(i + 1)}
                            className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${pagination.currentPage === i + 1 ? 'bg-primary-600 text-white shadow-lg shadow-primary-100' : 'bg-white text-slate-400 hover:bg-slate-50'
                                }`}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ReviewSection;
