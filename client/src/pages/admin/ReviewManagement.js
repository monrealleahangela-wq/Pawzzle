import React, { useState, useEffect, useCallback } from 'react';
import { Star, MessageSquare, Reply, User, ChevronLeft, ChevronRight, TrendingUp, Package, Heart, Store, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import { reviewService } from '../../services/apiService';

const ReviewManagement = () => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [replyText, setReplyText] = useState({});
    const [replyingTo, setReplyingTo] = useState(null);
    const [submittingReply, setSubmittingReply] = useState(false);
    const [filter, setFilter] = useState({
        page: 1,
        limit: 10
    });
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalReviews: 0
    });

    const fetchReviews = useCallback(async () => {
        try {
            setLoading(true);
            const response = await reviewService.getShopReviews(filter);
            setReviews(response.data.reviews);
            setPagination(response.data.pagination);
        } catch (error) {
            toast.error('Failed to load reviews');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchReviews();
    }, [fetchReviews]);

    const handleReply = async (reviewId) => {
        if (!replyText[reviewId]?.trim()) return;

        try {
            setSubmittingReply(true);
            await reviewService.replyToReview(reviewId, { comment: replyText[reviewId] });
            toast.success('Reply submitted');
            setReplyingTo(null);
            setReplyText({ ...replyText, [reviewId]: '' });
            fetchReviews();
        } catch (error) {
            toast.error('Failed to submit reply');
        } finally {
            setSubmittingReply(false);
        }
    };

    const handleToggleStatus = async (reviewId) => {
        try {
            await reviewService.toggleReviewStatus(reviewId);
            toast.success('Review visibility updated');
            fetchReviews();
        } catch (error) {
            toast.error('Failed to update review visibility');
        }
    };

    const getTargetTypeIcon = (type) => {
        switch (type) {
            case 'Product': return Package;
            case 'Pet': return Heart;
            case 'Store': return Store;
            default: return MessageSquare;
        }
    };

    return (
        <div className="space-y-4 animate-fade-in pb-12">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-primary-50 rounded-full blur-3xl -mr-24 -mt-24 opacity-40"></div>
                <div className="relative z-10 flex items-start gap-3">
                    <div className="p-2.5 bg-slate-900 text-white rounded-xl shrink-0">
                        <Star className="h-4 w-4" />
                    </div>
                    <div>
                        <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.3em]">Customer feedback</span>
                        <h1 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight leading-none">
                            Review Management
                        </h1>
                        <p className="text-xs sm:text-sm font-medium text-slate-500 mt-2">
                            Read customer feedback, reply, and manage review visibility.
                        </p>
                    </div>
                </div>
                <div className="relative z-10 flex items-center gap-2 self-start sm:self-auto px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                    <TrendingUp className="h-4 w-4 text-primary-600" />
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                        {pagination.totalReviews} {pagination.totalReviews === 1 ? 'Review' : 'Reviews'}
                    </span>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-3">
                {loading ? (
                    [...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white p-4 rounded-2xl animate-pulse border border-slate-100 h-32"></div>
                    ))
                ) : reviews.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl text-center border border-dashed border-slate-200">
                        <MessageSquare className="h-9 w-9 text-slate-200 mx-auto mb-3" />
                        <h3 className="text-sm font-black text-slate-500">No customer reviews yet</h3>
                        <p className="text-xs text-slate-400 mt-1">New reviews will appear here.</p>
                    </div>
                ) : (
                    reviews.map((review) => {
                        const TargetIcon = getTargetTypeIcon(review.targetType);
                        return (
                            <div key={review._id} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group">
                                <div className="flex-1 space-y-3">
                                        <div className="flex items-start justify-between flex-wrap gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                                    {review.user?.avatar ? <img src={review.user.avatar} alt="" loading="lazy" className="w-full h-full object-cover" /> : <User className="h-5 w-5 text-slate-300" />}
                                                </div>
                                                <div>
                                                    <p className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">{review.user?.firstName || review.user?.username}</p>
                                                    <div className="flex items-center gap-1">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star key={i} className={`h-3 w-3 ${i < review.rating ? 'fill-primary-500 text-primary-500' : 'text-slate-200'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center flex-wrap gap-2">
                                                <div className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                                                    <TargetIcon className="h-3 w-3 text-primary-600" />
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider">{review.targetType}: {review.targetId?.name || 'Unavailable'}</span>
                                                </div>
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{new Date(review.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        <p className="text-sm sm:text-base font-semibold text-slate-600 leading-relaxed italic bg-slate-50/70 border border-slate-100 rounded-xl px-3 py-2.5">
                                            "{review.comment}"
                                        </p>

                                        {review.images && review.images.length > 0 && (
                                            <div className="flex gap-2 overflow-x-auto pb-1">
                                                {review.images.map((img, i) => (
                                                    <div key={i} className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0">
                                                        <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {review.reply ? (
                                            <div className="bg-primary-50/50 p-3 sm:p-4 rounded-xl border border-primary-100/60 relative">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-primary-600/20 rounded-full"></div>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <Reply className="h-3 w-3 text-primary-600" />
                                                    <span className="text-[9px] font-black text-primary-600 uppercase tracking-wider">Your response</span>
                                                </div>
                                                <p className="text-xs sm:text-sm font-semibold text-primary-900 leading-relaxed">
                                                    {review.reply.comment}
                                                </p>
                                                <p className="text-[8px] font-black text-primary-400 uppercase tracking-wider mt-2">
                                                    Sent {new Date(review.reply.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                        ) : (
                                            <div>
                                                {replyingTo === review._id ? (
                                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-4">
                                                        <textarea
                                                            value={replyText[review._id] || ''}
                                                            onChange={(e) => setReplyText({ ...replyText, [review._id]: e.target.value })}
                                                            placeholder="Write a helpful response to this customer..."
                                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none font-medium text-sm transition-all min-h-[88px] resize-y"
                                                        />
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                onClick={() => handleReply(review._id)}
                                                                disabled={submittingReply || !replyText[review._id]?.trim()}
                                                                className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-primary-600 transition-all disabled:opacity-50"
                                                            >
                                                                {submittingReply ? 'Sending...' : 'Send Reply'}
                                                            </button>
                                                            <button
                                                                onClick={() => setReplyingTo(null)}
                                                                className="px-4 py-2.5 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-slate-200 transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <button
                                                            onClick={() => setReplyingTo(review._id)}
                                                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-primary-600 hover:text-white transition-all"
                                                        >
                                                            <Reply className="h-3.5 w-3.5" /> Reply
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleStatus(review._id)}
                                                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${review.isApproved ? 'bg-slate-50 text-slate-600 hover:bg-rose-500 hover:text-white' : 'bg-rose-50 text-rose-600 hover:bg-emerald-500 hover:text-white'}`}
                                                        >
                                                            {review.isApproved ? <><EyeOff className="h-3.5 w-3.5" /> Hide</> : <><Eye className="h-3.5 w-3.5" /> Show</>}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {pagination.totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 pt-3">
                    <button
                        disabled={filter.page === 1}
                        onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
                        className="p-2.5 bg-white rounded-xl border border-slate-100 text-slate-500 disabled:opacity-30 hover:bg-primary-50 hover:text-primary-600 transition-all"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>

                    <div className="flex gap-2">
                        {[...Array(pagination.totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setFilter({ ...filter, page: i + 1 })}
                                className={`w-9 h-9 rounded-xl text-[10px] font-black transition-all ${filter.page === i + 1 ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-100 hover:bg-slate-50'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <button
                        disabled={filter.page === pagination.totalPages}
                        onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
                        className="p-2.5 bg-white rounded-xl border border-slate-100 text-slate-500 disabled:opacity-30 hover:bg-primary-50 hover:text-primary-600 transition-all"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ReviewManagement;
