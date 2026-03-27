import React, { useState, useEffect, useCallback } from 'react';
import {
    Star,
    MessageSquare,
    Reply,
    User,
    Calendar,
    Filter,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    Package,
    Heart,
    Store,
    ExternalLink,
    Eye,
    EyeOff
} from 'lucide-react';
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
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 bg-white p-8 sm:p-12 rounded-[3.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-40"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-slate-900 text-white rounded-xl">
                            <Star className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">CUSTOMER FEEDBACK</span>
                    </div>
                    <h1 className="text-4xl sm:text-6xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                        Reviews <br /> <span className="text-primary-600">Management</span>
                    </h1>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        Engagement Analytics & Response Hub
                    </p>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-6">
                {loading ? (
                    [...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white p-8 rounded-[3rem] animate-pulse border border-slate-100 h-64"></div>
                    ))
                ) : reviews.length === 0 ? (
                    <div className="bg-white p-24 rounded-[3rem] text-center border border-dashed border-slate-200">
                        <MessageSquare className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No Incoming transmissions</h3>
                    </div>
                ) : (
                    reviews.map((review) => {
                        const TargetIcon = getTargetTypeIcon(review.targetType);
                        return (
                            <div key={review._id} className="bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-500 group">
                                <div className="flex flex-col lg:flex-row gap-8">
                                    <div className="flex-1 space-y-6">
                                        <div className="flex items-center justify-between flex-wrap gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden">
                                                    {review.user?.avatar ? <img src={review.user.avatar} className="w-full h-full object-cover" /> : <User className="h-6 w-6 text-slate-300" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs sm:text-lg font-black text-slate-900 uppercase tracking-tight">{review.user?.firstName || review.user?.username}</p>
                                                    <div className="flex items-center gap-1">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star key={i} className={`h-2.5 w-2.5 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-100'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className="px-4 py-2 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-2">
                                                    <TargetIcon className="h-3 w-3 text-primary-600" />
                                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{review.targetType}: {review.targetId?.name}</span>
                                                </div>
                                                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{new Date(review.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>

                                        <p className="text-sm sm:text-xl font-bold text-slate-600 leading-relaxed italic pr-12">
                                            "{review.comment}"
                                        </p>

                                        {review.images && review.images.length > 0 && (
                                            <div className="flex gap-2 pb-2">
                                                {review.images.map((img, i) => (
                                                    <div key={i} className="w-16 h-16 sm:w-24 sm:h-24 rounded-3xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-500">
                                                        <img src={img} className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {review.reply ? (
                                            <div className="bg-primary-50/50 p-6 sm:p-8 rounded-[2rem] border border-primary-100/50 ml-6 relative">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-primary-600/20 rounded-full"></div>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Reply className="h-3 w-3 text-primary-600" />
                                                    <span className="text-[9px] font-black text-primary-600 uppercase tracking-widest">Shop Response</span>
                                                </div>
                                                <p className="text-[11px] sm:text-sm font-bold text-primary-900 leading-relaxed">
                                                    {review.reply.comment}
                                                </p>
                                                <p className="text-[8px] font-black text-primary-300 uppercase tracking-widest mt-3">
                                                    SENT {new Date(review.reply.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="pt-2">
                                                {replyingTo === review._id ? (
                                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-4">
                                                        <textarea
                                                            value={replyText[review._id] || ''}
                                                            onChange={(e) => setReplyText({ ...replyText, [review._id]: e.target.value })}
                                                            placeholder="Write your professional response..."
                                                            className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-primary-500 outline-none font-bold text-sm transition-all min-h-[120px]"
                                                        />
                                                        <div className="flex gap-3">
                                                            <button
                                                                onClick={() => handleReply(review._id)}
                                                                disabled={submittingReply || !replyText[review._id]?.trim()}
                                                                className="px-8 py-3 bg-slate-900 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-primary-600 transition-all disabled:opacity-50"
                                                            >
                                                                {submittingReply ? 'Sending...' : 'Transmit Reply'}
                                                            </button>
                                                            <button
                                                                onClick={() => setReplyingTo(null)}
                                                                className="px-8 py-3 bg-slate-100 text-slate-400 rounded-3xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <button
                                                            onClick={() => setReplyingTo(review._id)}
                                                            className="flex items-center gap-2 px-6 py-3 bg-slate-50 text-slate-500 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 hover:text-white transition-all shadow-sm"
                                                        >
                                                            <Reply className="h-4 w-4" /> Reply to Review
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleStatus(review._id)}
                                                            className={`flex items-center gap-2 px-6 py-3 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${review.isApproved ? 'bg-slate-50 text-slate-500 hover:bg-rose-500 hover:text-white' : 'bg-rose-50 text-rose-500 hover:bg-emerald-500 hover:text-white'}`}
                                                        >
                                                            {review.isApproved ? <><EyeOff className="h-4 w-4" /> Hide Review</> : <><Eye className="h-4 w-4" /> Show Review</>}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {pagination.totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 pt-10">
                    <button
                        disabled={filter.page === 1}
                        onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
                        className="p-4 bg-white rounded-3xl border border-slate-100 text-slate-400 disabled:opacity-30 hover:bg-primary-50 hover:text-primary-600 transition-all"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <div className="flex gap-3">
                        {[...Array(pagination.totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setFilter({ ...filter, page: i + 1 })}
                                className={`w-12 h-12 rounded-3xl text-[11px] font-black tracking-widest transition-all ${filter.page === i + 1 ? 'bg-slate-900 text-white shadow-2xl shadow-slate-200' : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <button
                        disabled={filter.page === pagination.totalPages}
                        onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
                        className="p-4 bg-white rounded-3xl border border-slate-100 text-slate-400 disabled:opacity-30 hover:bg-primary-50 hover:text-primary-600 transition-all"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ReviewManagement;
