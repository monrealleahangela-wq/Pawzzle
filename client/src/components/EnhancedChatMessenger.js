import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { Send, X, User, Clock, Check, Phone, Mail, MapPin, Heart, AlertCircle, ShoppingBag, Truck, CheckCircle, Camera, Shield, ArrowLeft, ChevronDown, Calendar, CreditCard, Wallet, Banknote, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { chatService } from '../services/chatService';
import { adoptionService, uploadService } from '../services/apiService';
import UserReportModal from './UserReportModal';
import socket from '../utils/socket';
import { formatChatTime } from '../utils/timeFormatters';

const EnhancedChatMessenger = ({
  isOpen,
  onClose,
  pet,
  seller,
  currentUser,
  isAdmin = false,
  existingConversationId = null,
  isEmbedded = false,
  onMessageUpdate = null
}) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [transactionRequest, setTransactionRequest] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [onlineStatus, setOnlineStatus] = useState({ isOnline: false, text: 'Connecting...' });
  const [isSeller, setIsSeller] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const isFirstLoad = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);


  useEffect(() => {
    if (isOpen && !isEmbedded) {
      document.body.classList.add('chat-modal-open');
    } else {
      document.body.classList.remove('chat-modal-open');
    }
    return () => document.body.classList.remove('chat-modal-open');
  }, [isOpen, isEmbedded]);

  useEffect(() => {
    if ((isOpen || isEmbedded) && existingConversationId) {
      setConversationId(existingConversationId);
      loadMessages(existingConversationId);
      fetchTransactionData(existingConversationId);
    } else if ((isOpen || isEmbedded) && pet && seller) {
      initializeConversation();
    }
  }, [isOpen, isEmbedded, pet, seller, existingConversationId]);

  useEffect(() => {
    if (!conversationId || (!isOpen && !isEmbedded)) return;

    // Connect socket if not connected
    if (!socket.connected) {
      socket.connect();
    }

    // Join the conversation room
    socket.emit('joinConversation', conversationId);

    // Listen for real-time events
    socket.on('userTyping', (data) => {
      if (data.userId !== (currentUser?._id || currentUser?.id)) {
        setTypingUser(data.userName);
      }
    });

    socket.on('userStopTyping', (data) => {
      if (data.userId !== (currentUser?._id || currentUser?.id)) {
        setTypingUser(null);
      }
    });

    socket.on('newMessage', (message) => {
      if (message.conversation?.toString() === conversationId || message.conversation === conversationId) {
        setMessages(prev => {
          const exists = prev.some(m => m._id === message._id);
          if (exists) return prev;
          return [...prev, message];
        });
        if (onMessageUpdate) onMessageUpdate();
      }
    });

    // We keep polling as extra safety but with a longer interval
    const interval = setInterval(() => {
      loadMessages(conversationId);
      fetchTransactionData(conversationId);
    }, 10000);

    return () => {
      clearInterval(interval);
      socket.off('userTyping');
      socket.off('userStopTyping');
      socket.off('newMessage');
    };
  }, [conversationId, isOpen, isEmbedded, currentUser]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollButton(!isAtBottom);
  };

  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0) {
      if (isFirstLoad.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        isFirstLoad.current = false;
      } else {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 400;
        if (isAtBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle image load scroll
  const handleImageLoad = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 400;
      if (isAtBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const fetchTransactionData = async (convId) => {
    try {
      const response = await adoptionService.getAdoptionByConversation(convId);
      if (response.data.request) {
        setTransactionRequest(response.data.request);
        const currentUserId = currentUser?._id || currentUser?.id;
        const sellerId = seller?._id || seller?.id;
        const adminId = response.data.request.seller?._id || response.data.request.seller;

        if (currentUserId && (currentUserId === sellerId || currentUserId === adminId || isAdmin)) {
          setIsSeller(true);
        }
      }
    } catch (error) {
      console.error('Error fetching transaction data:', error);
    }
  };

  const initializeConversation = async () => {
    try {
      const response = await chatService.getConversationByPet(pet._id);
      let convId;
      if (response.data.conversation) {
        convId = response.data.conversation._id;
        setConversationId(convId);
        loadMessages(convId);
      } else {
        const sellerId = seller._id || seller.id;
        const newConvResponse = await chatService.createConversation({
          participantIds: [sellerId],
          petId: pet._id,
          type: 'adoption'
        });
        convId = newConvResponse.data.conversation._id;
        setConversationId(convId);
        setMessages([]);
      }
      if (convId) fetchTransactionData(convId);
    } catch (error) {
      console.error('Error initializing conversation:', error);
      toast.error('Failed to start chat');
    }
  };

  const loadMessages = async (convId) => {
    try {
      const response = await chatService.getMessages(convId);
      const messagesData = response.data.messages || [];
      setMessages(messagesData);
      
      // Update online status from the other participant
      if (messagesData.length > 0) {
        const otherParticipant = messagesData.find(m => {
          const sId = m.sender?._id || m.sender;
          const currentId = currentUser?._id || currentUser?.id;
          return sId !== currentId;
        })?.sender;
        
        if (otherParticipant?.lastSeen) {
          setOnlineStatus(getOnlineStatus(otherParticipant.lastSeen));
        }
      } else if (seller?.lastSeen) {
        setOnlineStatus(getOnlineStatus(seller.lastSeen));
      }

      await chatService.markAsRead(convId);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversationId) return;

    const messageData = { content: newMessage.trim(), type: 'text' };
    setIsLoading(true);
    const savedMessage = newMessage;
    setNewMessage('');
    
    // Stop typing immediately when sending
    handleStopTyping();

    try {
      const response = await chatService.sendMessage(conversationId, messageData);
      setMessages(prev => [...prev, response.data.message]);
      if (onMessageUpdate) onMessageUpdate();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      setNewMessage(savedMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTyping = () => {
    if (!conversationId || !currentUser) return;

    // Emit typing event
    socket.emit('typing', {
      conversationId,
      userId: currentUser._id || currentUser.id,
      userName: currentUser.firstName || 'Someone'
    });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator after 1.5s
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 1500);
  };

  const handleStopTyping = () => {
    if (!conversationId || !currentUser) return;
    
    socket.emit('stopTyping', {
      conversationId,
      userId: currentUser._id || currentUser.id
    });
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size should be less than 2MB');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      setIsLoading(true);
      const uploadResponse = await uploadService.uploadImage(formData);
      const imageUrl = uploadResponse.data.url;

      const messageData = { content: imageUrl, type: 'image' };
      const response = await chatService.sendMessage(conversationId, messageData);
      setMessages(prev => [...prev, response.data.message]);
      toast.success('Image sent!');
    } catch (error) {
      console.error('Error sending image:', error);
      toast.error('Failed to send image');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchaseRequest = async () => {
    try {
      setIsLoading(true);
      const response = await adoptionService.requestAdoption({
        petId: pet._id,
        conversationId: conversationId,
        notes: `Interest in purchasing ${pet.name}`
      });
      setTransactionRequest(response.data.request);
      toast.success('Inquiry submitted!');
      loadMessages(conversationId);
    } catch (error) {
      console.error('Error requesting purchase:', error);
      toast.error(error.response?.data?.message || 'Failed to submit request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusUpdate = async (status) => {
    try {
      setIsLoading(true);
      const response = await adoptionService.updateAdoptionStatus(transactionRequest._id, { status });
      setTransactionRequest(response.data.request);
      toast.success(`Status updated to ${status.replace(/_/g, ' ')}`);
      loadMessages(conversationId);
      if (onMessageUpdate) onMessageUpdate();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPaymentRequest = async () => {
    try {
      setIsLoading(true);
      const response = await adoptionService.sendPaymentRequest(transactionRequest._id);
      setTransactionRequest(response.data.request);
      toast.success('Payment request sent to customer');
      loadMessages(conversationId);
      if (onMessageUpdate) onMessageUpdate();
    } catch (error) {
      console.error('Error sending payment request:', error);
      toast.error('Failed to send payment request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualPaymentUpdate = async (status, amount) => {
    try {
       setIsLoading(true);
       const response = await adoptionService.updatePaymentStatus(transactionRequest._id, { 
         status, 
         amount,
         notes: `Seller manually updated payment to ${status}`
       });
       setTransactionRequest(response.data.request);
       toast.success('Payment status updated');
       loadMessages(conversationId);
       if (onMessageUpdate) onMessageUpdate();
    } catch (error) {
       console.error('Error updating payment:', error);
       toast.error('Update failed');
    } finally {
       setIsLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    return formatChatTime(timestamp);
  };



  const getOnlineStatus = (lastSeen) => {
    if (!lastSeen) return { isOnline: false, text: 'Last seen unknown' };
    const now = new Date();
    const lastActive = new Date(lastSeen);
    const diffMs = now - lastActive;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 2) return { isOnline: true, text: 'Online' };
    if (diffMins < 60) return { isOnline: false, text: `Active ${diffMins}m ago` };
    if (diffMins < 1440) return { isOnline: false, text: `Active ${Math.floor(diffMins / 60)}h ago` };
    return { isOnline: false, text: `Active ${Math.floor(diffMins / 1440)}d ago` };
  };

  const handleCancelRequest = async () => {
    if (!window.confirm('Are you sure you want to cancel your reservation request?')) return;
    try {
      setIsLoading(true);
      await adoptionService.cancelAdoptionRequest(transactionRequest._id);
      toast.success('Inquiry cancelled');
      fetchTransactionData(conversationId);
      loadMessages(conversationId);
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel request');
    } finally {
      setIsLoading(false);
    }
  };

  const renderTransactionStatus = () => {
    if (!transactionRequest) return null;

    const statusConfig = {
      inquiry_submitted: { color: 'bg-primary-50 text-primary-800', icon: <Clock className="h-4 w-4" />, label: 'Inquiry Submitted' },
      under_review: { color: 'bg-indigo-50 text-indigo-800', icon: <Clock className="h-4 w-4" />, label: 'Under Review' },
      reserved: { color: 'bg-amber-50 text-amber-800', icon: <Shield className="h-4 w-4" />, label: 'Reserved for You' },
      approved: { color: 'bg-emerald-50 text-emerald-800', icon: <CheckCircle className="h-4 w-4" />, label: 'Inquiry Approved' },
      pickup_scheduling: { color: 'bg-secondary-50 text-primary-800', icon: <Calendar className="h-4 w-4" />, label: 'Scheduling Pickup' },
      pickup_confirmed: { color: 'bg-secondary-100 text-primary-900', icon: <MapPin className="h-4 w-4" />, label: 'Pickup Confirmed' },
      completed: { color: 'bg-emerald-600 text-white', icon: <Heart className="h-4 w-4" />, label: 'Pet Handed Over' },
      cancelled: { color: 'bg-slate-100 text-slate-500', icon: <X className="h-4 w-4" />, label: 'Cancelled' },
      declined: { color: 'bg-rose-50 text-rose-800', icon: <X className="h-4 w-4" />, label: 'Inquiry Declined' },
      expired: { color: 'bg-slate-100 text-slate-400', icon: <Clock className="h-4 w-4" />, label: 'Reservation Expired' }
    };

    const config = statusConfig[transactionRequest.status] || statusConfig.inquiry_submitted;
    const payment = transactionRequest.paymentDetails || {};
    const pricing = payment.pricingBreakdown || {};

    return (
      <div className="flex-shrink-0 z-10">
        <div className={`px-6 py-3 border-b border-slate-100 flex items-center justify-between ${config.color} transition-colors duration-500`}>
          <div className="flex items-center gap-2">
            {config.icon}
            <span className="text-[10px] font-black uppercase tracking-widest">{config.label}</span>
          </div>
          
          <div className="flex gap-2">
            {isSeller && (
              <>
                {transactionRequest.status === 'inquiry_submitted' && (
                  <>
                    <button onClick={() => handleStatusUpdate('reserved')} className="text-[9px] font-black uppercase tracking-widest bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 shadow-sm">Reserve</button>
                    <button onClick={() => handleStatusUpdate('declined')} className="text-[9px] font-black uppercase tracking-widest bg-white/20 text-current px-3 py-1.5 rounded-lg border border-current hover:bg-white/10">Decline</button>
                  </>
                )}
                {transactionRequest.status === 'reserved' && (
                  <>
                    <button onClick={() => handleStatusUpdate('approved')} className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 shadow-sm">Approve Buyer</button>
                    <button onClick={() => handleStatusUpdate('inquiry_submitted')} className="text-[9px] font-black uppercase tracking-widest bg-white/20 text-current px-3 py-1.5 rounded-lg border border-current">Release</button>
                  </>
                )}
                {transactionRequest.status === 'approved' && payment.paymentStatus === 'unpaid' && (
                  <button onClick={handleSendPaymentRequest} className="text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
                    <Zap className="h-3 w-3 text-primary-400" /> Send Payment Request
                  </button>
                )}
                {transactionRequest.status === 'approved' && payment.paymentStatus === 'payment_pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleManualPaymentUpdate(pricing.depositAmount > 0 ? 'deposit_paid' : 'paid_in_full', pricing.depositAmount || pricing.totalPrice)} 
                      className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white px-3 py-1.5 rounded-lg shadow-sm">
                      Mark as Paid
                    </button>
                  </div>
                )}
                {(transactionRequest.status === 'approved' || transactionRequest.status === 'pickup_scheduling') && (payment.paymentStatus === 'paid_in_full' || payment.paymentStatus === 'deposit_paid') && (
                  <button onClick={() => handleStatusUpdate('pickup_scheduling')} className="text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white px-3 py-1.5 rounded-lg shadow-sm">Schedule Pickup</button>
                )}
                {transactionRequest.status === 'pickup_scheduling' && (
                  <button onClick={() => handleStatusUpdate('pickup_confirmed')} className="text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white px-3 py-1.5 rounded-lg shadow-sm">Confirm Schedule</button>
                )}
                {transactionRequest.status === 'pickup_confirmed' && (
                  <button onClick={() => handleStatusUpdate('completed')} className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white px-3 py-1.5 rounded-lg shadow-sm hover:bg-emerald-500 animate-pulse">Mark Handed Over</button>
                )}
              </>
            )}

            {!isSeller && !isAdmin && (
              <>
                {payment.paymentStatus === 'payment_pending' && (
                  <button onClick={() => handleManualPaymentUpdate(pricing.depositAmount > 0 ? 'deposit_paid' : 'paid_in_full', pricing.depositAmount || pricing.totalPrice)} 
                    className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" /> Settle Payment
                  </button>
                )}
                {['inquiry_submitted', 'reserved', 'approved'].includes(transactionRequest.status) && (
                  <button onClick={handleCancelRequest} className="text-[9px] font-black uppercase tracking-widest bg-white/20 border border-current px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">Cancel Inquiry</button>
                )}
                {['pickup_scheduling', 'pickup_confirmed'].includes(transactionRequest.status) && (
                  <button onClick={handleCancelRequest} className="text-[9px] font-black uppercase tracking-widest bg-rose-600 text-white px-3 py-1.5 rounded-lg shadow-sm">Request Cancellation</button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Payment Dashboard Mini-HUD */}
        {transactionRequest.status !== 'cancelled' && transactionRequest.status !== 'declined' && (
          <div className="bg-white border-b border-slate-100 p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <div className="flex items-center gap-4">
               <div className={`p-2 rounded-xl ${payment.paymentStatus === 'paid_in_full' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                 <Wallet className="h-4 w-4" />
               </div>
               <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Financial Status</span>
                    {payment.method && <span className="text-[8px] font-black text-primary-500 uppercase tracking-widest px-2 bg-primary-50 rounded-full border border-primary-100">{payment.method.replace('_', ' ')}</span>}
                  </div>
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    {payment.paymentStatus?.replace(/_/g, ' ') || 'Unpaid'}
                    {payment.paymentStatus === 'paid_in_full' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                  </h4>
               </div>
             </div>

             <div className="flex items-center gap-6 sm:px-4 sm:border-l border-slate-50">
                <div className="text-right">
                   <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Total Valuation</p>
                   <p className="text-xs font-black text-slate-900">₱{pricing.totalPrice?.toLocaleString()}</p>
                </div>
                {pricing.depositAmount > 0 && (
                  <div className="text-right">
                    <p className="text-[8px] font-black text-primary-400 uppercase tracking-widest mb-0.5">Deposit Req.</p>
                    <p className="text-xs font-black text-primary-600">₱{pricing.depositAmount?.toLocaleString()}</p>
                  </div>
                )}
                <div className="text-right">
                   <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-0.5">Remaining Balance</p>
                   <p className="text-xs font-black text-rose-600">₱{pricing.balanceDue?.toLocaleString()}</p>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  };

  const renderMessage = (message) => {
    const senderId = message.sender?._id || message.sender;
    const isOwnMessage = senderId === (currentUser?._id || currentUser?.id);
    const isSystemMessage = message.type === 'system';
    const isImage = message.type === 'image';

    // Scrub out legacy "adoption" terminology from older db records
    let displayContent = message.content;
    if (isSystemMessage && displayContent) {
      displayContent = displayContent.replace(/A new adoption request has been submitted/gi, 'A new purchase inquiry has been submitted');
      displayContent = displayContent.replace(/adoption request/gi, 'purchase inquiry');
      displayContent = displayContent.replace(/adoption/gi, 'purchase');
    }

    return (
      <div key={message._id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} animate-fade-in`}>
        <div className={`max-w-[80%] ${isSystemMessage ? 'mx-auto' : ''}`}>
          {!isSystemMessage && (
            <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {message.sender?.firstName || 'User'}
              </span>
            </div>
          )}

          <div className={`relative px-4 py-3 rounded-2xl shadow-sm break-words ${isSystemMessage
            ? 'bg-slate-50 text-slate-400 italic text-xs'
            : isOwnMessage
              ? 'bg-primary-600 text-white rounded-tr-sm'
              : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'
            }`}>
            {isImage ? (
              <div className="max-w-full">
                <img
                  src={message.content}
                  alt="Sent"
                  className="rounded-xl max-h-60 sm:max-h-80 w-auto max-w-full object-contain cursor-pointer"
                  onLoad={handleImageLoad}
                  onClick={() => window.open(message.content, '_blank')}
                />
              </div>
            ) : (
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{displayContent}</p>
            )}
          </div>
          {!isSystemMessage && (
            <p className={`text-[7px] mt-1 font-black uppercase tracking-widest ${isOwnMessage ? 'text-right pr-1' : 'text-left pl-1'} text-slate-400 opacity-60`}>
              {formatTime(message.createdAt)}
            </p>
          )}
        </div>
      </div>
    );
  };

  const messengerContent = (
    <div
      className={`flex flex-col h-full bg-white transition-transform duration-300 ease-out min-h-0
        ${!isEmbedded ? 'rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl max-w-lg w-full h-full sm:h-[85vh] sm:max-h-[600px] overflow-hidden border border-white/20' : ''}`}
    >
      {(!isEmbedded || window.innerWidth < 640) && (
        <div className={`flex-shrink-0 px-5 py-3 flex items-center justify-between z-10 ${
          isEmbedded ? 'bg-white border-b border-slate-100' : 'bg-neutral-900 text-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shadow-lg rotate-3 uppercase ${
              isEmbedded ? 'bg-primary-600 text-white' : 'bg-primary-500'
            }`}>
              {pet?.name?.[0] || 'P'}
            </div>
            <div>
              <h3 className={`text-base font-black tracking-tight ${isEmbedded ? 'text-slate-900' : 'text-white'}`}>
                {pet?.name || 'Inquiry'}
              </h3>
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all">
                <div className={`w-1 h-1 rounded-full ${onlineStatus.isOnline ? 'bg-secondary-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className={onlineStatus.isOnline ? (isEmbedded ? 'text-secondary-600 font-bold' : 'text-secondary-400 font-bold') : 'text-slate-400'}>
                  {onlineStatus.text}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEmbedded && isSeller && (
              <button
                onClick={() => setShowReportModal(true)}
                className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500/20 transition-colors"
                title="Report User"
              >
                <AlertCircle className="h-4 w-4" />
              </button>
            )}
            <button 
              onClick={onClose} 
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all group border ${
                isEmbedded ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
              }`}
              title="Close Chat"
            >
              <ArrowLeft className={`h-5 w-5 ${!isEmbedded ? 'group-hover:scale-110' : ''} transition-transform`} />
            </button>
          </div>
        </div>
      )}

      {renderTransactionStatus()}

      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 pb-24 space-y-4 bg-slate-50/50 no-scrollbar overscroll-contain touch-pan-y scroll-smooth min-h-0 relative"
      >
        {showScrollButton && (
          <button 
            onClick={scrollToBottom}
            className="fixed bottom-24 right-8 bg-white/90 backdrop-blur-sm text-primary-600 p-3 rounded-full shadow-lg border border-primary-100 hover:bg-primary-50 transition-all z-[60] animate-bounce"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
        {!transactionRequest && !isSeller && !isAdmin && conversationId && pet && (
          <div className="bg-white border border-secondary-100 p-4 rounded-3xl text-center space-y-3 mx-2 shadow-sm mb-4">
            <div className="w-12 h-12 bg-secondary-50 rounded-full flex items-center justify-center mx-auto">
              <Heart className="h-6 w-6 text-primary-500" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Serious Inquiry?</h3>
              <p className="text-[10px] text-slate-500 font-medium">Initiate the premium inquiry protocol.</p>
            </div>
            <button onClick={handlePurchaseRequest} className="btn btn-primary w-full py-2.5 text-[9px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary-100">
              Buy this Pet
            </button>
          </div>
        )}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} className="h-6" />
      </div>

      {typingUser && (
        <div className="px-6 py-1 flex items-center gap-2 animate-fade-in transition-all">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
            {typingUser} is typing...
          </span>
        </div>
      )}

      <div className="flex-shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 bg-white border-t border-slate-100 z-10">
        <div className="flex items-center gap-3 bg-slate-50 rounded-full p-1.5 pl-4 border border-slate-100">
          <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-primary-500 shadow-sm transition-colors shrink-0">
            <Camera className="h-4 w-4" />
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
          </button>
          <textarea
            rows="1"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            placeholder="Write a message..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 py-2 resize-none max-h-24"
            disabled={isLoading}
          />
          <button onClick={handleSendMessage} disabled={isLoading || !newMessage.trim()} className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-primary-700 disabled:opacity-50 shrink-0">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  if (isEmbedded) return messengerContent;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-[100] sm:p-6 font-sans transition-colors duration-300">
      <div className="w-full max-w-lg h-[92%] sm:h-auto">
        {messengerContent}
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <UserReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUser={isSeller ? {
            id: messages.find(m => m.sender?._id !== currentUser.id)?.sender?._id || messages.find(m => m.sender !== currentUser.id)?.sender,
            username: messages.find(m => m.sender?._id !== currentUser.id)?.sender?.username || 'User',
            firstName: messages.find(m => m.sender?._id !== currentUser.id)?.sender?.firstName || 'User'
          } : seller}
        />
      )}
    </div>
  );
};

export default EnhancedChatMessenger;
