import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Heart, Clock, CheckCircle, XCircle, Package, Truck, MessageSquare, ArrowLeft } from 'lucide-react';
import { adoptionService } from '../../services/apiService';
import { formatTime12h } from '../../utils/timeFormatters';
import { useAuth } from '../../contexts/AuthContext';
import EnhancedChatMessenger from '../../components/EnhancedChatMessenger';

const Adoptions = ({ isSubcomponent = false }) => {
    const { user } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedChat, setSelectedChat] = useState(null);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const response = await adoptionService.getMyRequests();
            setRequests(response.data.requests || []);
        } catch (error) {
            console.error('Error fetching purchase inquiries:', error);
            toast.error('Failed to load purchase history');
        } finally {
            setLoading(false);
        }
    };

    const statusConfig = {
        inquiry_submitted: { color: 'bg-slate-100 text-slate-800', icon: <Clock className="h-4 w-4" />, label: 'Inquiry Submitted' },
        under_review: { color: 'bg-indigo-100 text-indigo-800', icon: <Clock className="h-4 w-4" />, label: 'Under Review' },
        reserved: { color: 'bg-amber-100 text-amber-800', icon: <Clock className="h-4 w-4" />, label: 'Reserved' },
        approved: { color: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle className="h-4 w-4" />, label: 'Approved' },
        pickup_scheduling: { color: 'bg-primary-100 text-primary-800', icon: <Clock className="h-4 w-4" />, label: 'Awaiting Schedule' },
        pickup_confirmed: { color: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle className="h-4 w-4" />, label: 'Pickup Confirmed' },
        completed: { color: 'bg-primary-600 text-white', icon: <Heart className="h-4 w-4" />, label: 'Purchased' },
        cancelled: { color: 'bg-gray-100 text-gray-800', icon: <XCircle className="h-4 w-4" />, label: 'Cancelled' },
        declined: { color: 'bg-rose-100 text-rose-800', icon: <XCircle className="h-4 w-4" />, label: 'Declined' }
    };

    const paymentConfig = {
        unpaid: { color: 'bg-slate-50 text-slate-400', label: 'Waiting' },
        payment_pending: { color: 'bg-amber-100 text-amber-700', label: 'Payment Requested' },
        deposit_paid: { color: 'bg-emerald-50 text-emerald-600', label: 'Deposit Settled' },
        paid_in_full: { color: 'bg-emerald-600 text-white', label: 'Fully Paid' }
    };

    const getStatusDisplay = (status) => {
        const config = statusConfig[status] || statusConfig.inquiry_submitted;
        return (
            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${config.color}`}>
                {config.icon}
                {config.label}
            </span>
        );
    };

    const handleCancel = async (requestId) => {
        if (!window.confirm('Are you sure you want to cancel this purchase inquiry?')) return;
        try {
            await adoptionService.cancelAdoptionRequest(requestId);
            toast.success('Inquiry cancelled');
            fetchRequests();
        } catch (error) {
            console.error('Error cancelling purchase inquiry:', error);
            toast.error(error.response?.data?.message || 'Failed to cancel inquiry');
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className={isSubcomponent ? "space-y-8" : "space-y-8 pb-20"}>
            {!isSubcomponent && (
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Heart className="h-4 w-4 text-primary-500" />
                            <span className="text-[10px] font-black text-primary-600 uppercase tracking-[0.4em]">Pet Purchase History</span>
                        </div>
                        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                            My <br />
                            <span className="text-primary-600 italic">Purchases</span>
                        </h1>
                    </div>
                    <Link to="/pets" className="group px-8 py-4 bg-slate-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-200 hover:bg-primary-600 transition-all flex items-center gap-3">
                        Buy More Pets <ArrowLeft className="h-4 w-4 rotate-180 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </header>
            )}

            {requests.length === 0 ? (
                <div className="bg-white rounded-[3rem] border-2 border-dashed border-slate-100 p-20 text-center">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Heart className="h-10 w-10 text-slate-200" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">No Purchases</h3>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-8">No active purchase inquiries detected</p>
                    <Link to="/pets" className="px-10 py-4 bg-primary-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary-100 hover:bg-primary-700 transition-all">Explore Pets</Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {requests.map((request, idx) => (
                        <div key={request._id}
                            className="group bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all flex flex-col relative animate-slide-up"
                            style={{ animationDelay: `${idx * 0.1}s` }}>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[4rem] -translate-y-16 translate-x-16 group-hover:bg-primary-50 transition-colors duration-500" />

                            <div className="h-48 bg-slate-50 relative overflow-hidden">
                                {request.pet?.images?.[0] ? (
                                    <img src={request.pet.images[0]} alt={request.pet.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-100"><Heart className="h-12 w-12 text-slate-300" /></div>
                                )}
                                <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
                                    <span className={`px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-xl backdrop-blur-md border border-white/20 ${statusConfig[request.status]?.color || 'bg-slate-900/90 text-white'}`}>
                                        {statusConfig[request.status]?.label || request.status.replace('_', ' ')}
                                    </span>
                                    {request.paymentDetails?.paymentStatus && request.paymentDetails.paymentStatus !== 'unpaid' && (
                                        <span className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border ${paymentConfig[request.paymentDetails.paymentStatus]?.color || 'bg-slate-50'}`}>
                                            {paymentConfig[request.paymentDetails.paymentStatus]?.label || request.paymentDetails.paymentStatus.replace('_', ' ')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="p-8 flex-1 flex flex-col relative z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 truncate">{request.pet?.breed || 'Biological Subject'}</p>
                                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none group-hover:text-primary-600 transition-colors truncate">
                                            {request.pet?.name || 'SUBJECT_ID'}
                                        </h3>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Fee</p>
                                        <p className="text-xl font-black text-slate-900 tracking-tighter leading-none">₱{request.pet?.price?.toLocaleString() || 0}</p>
                                    </div>
                                </div>

                                {request.paymentDetails?.paymentStatus === 'payment_pending' && (
                                    <button
                                        onClick={() => setSelectedChat({
                                            conversationId: request.conversation,
                                            pet: request.pet,
                                            seller: request.seller
                                        })}
                                        className="w-full mb-6 py-4 bg-emerald-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 animate-pulse"
                                    >
                                        <Heart className="h-4 w-4 fill-current" /> Complete Secure Payment
                                    </button>
                                )}

                                <div className="bg-slate-50/50 rounded-[2rem] p-5 mb-8 border border-slate-100 flex flex-col gap-3">
                                    <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                        <span className="flex items-center gap-2 italic opacity-60"><Clock className="h-3 w-3" /> Purchase Date</span>
                                        <span className="text-slate-900">{new Date(request.createdAt).toLocaleDateString()} {formatTime12h(new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                        <span className="flex items-center gap-2 italic opacity-60"><CheckCircle className="h-3 w-3" /> Identity Prime</span>
                                        <span className="text-slate-900 truncate max-w-[120px]">{request.seller?.firstName} {request.seller?.lastName}</span>
                                    </div>
                                </div>

                                <div className="mt-auto space-y-3">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setSelectedChat({
                                                conversationId: request.conversation,
                                                pet: request.pet,
                                                seller: request.seller
                                            })}
                                            className="flex-1 px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-primary-600 transition-all flex items-center justify-center gap-2 active:scale-95"
                                        >
                                            <MessageSquare className="h-4 w-4" /> Comm Link
                                        </button>
                                        <Link to={`/pets/${request.pet?._id}`} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-200 transition-all border border-slate-100 flex items-center justify-center">
                                            <Heart className="h-5 w-5" />
                                        </Link>
                                    </div>

                                    {request.status && ['pending', 'approved', 'ready_for_pickup'].includes(request.status) && (
                                        <button
                                            onClick={() => handleCancel(request._id)}
                                            className="w-full py-4 text-rose-500 text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 rounded-2xl transition-all border border-transparent hover:border-rose-100"
                                        >
                                            Cancel Inquiry
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selectedChat && (
                <EnhancedChatMessenger
                    isOpen={!!selectedChat}
                    onClose={() => setSelectedChat(null)}
                    pet={selectedChat.pet}
                    seller={selectedChat.seller}
                    currentUser={user}
                    existingConversationId={selectedChat.conversationId}
                />
            )}
        </div>
    );
};

export default Adoptions;
