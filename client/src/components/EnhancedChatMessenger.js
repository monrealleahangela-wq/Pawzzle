import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { Send, X, User, Clock, Check, Phone, Mail, MapPin, Heart, AlertCircle, ShoppingBag, Truck, CheckCircle, Camera, Shield } from 'lucide-react';
import { chatService } from '../services/chatService';
import { adoptionService, uploadService } from '../services/apiService';
import UserReportModal from './UserReportModal';

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
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);


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
    const interval = setInterval(() => {
      loadMessages(conversationId);
      fetchTransactionData(conversationId);
    }, 4000);
    return () => clearInterval(interval);
  }, [conversationId, isOpen, isEmbedded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Handle image load scroll
  const handleImageLoad = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
      toast.success('Reservation request submitted!');
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
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      toast.success('Reservation request cancelled');
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
      pending: { color: 'bg-primary-50 text-primary-800', icon: <Clock className="h-4 w-4" />, label: 'Purchase Pending' },
      reserved: { color: 'bg-amber-50 text-amber-800', icon: <Shield className="h-4 w-4" />, label: 'Pet Reserved' },
      approved: { color: 'bg-secondary-100 text-secondary-800', icon: <CheckCircle className="h-4 w-4" />, label: 'Sale Approved' },
      rejected: { color: 'bg-neutral-100 text-neutral-800', icon: <X className="h-4 w-4" />, label: 'Request Declined' },
      ready_for_pickup: { color: 'bg-secondary-50 text-secondary-800', icon: <ShoppingBag className="h-4 w-4" />, label: 'Ready for Pickup' },
      shipped: { color: 'bg-primary-50 text-primary-800', icon: <Truck className="h-4 w-4" />, label: 'Pet is Shipped' },
      delivered: { color: 'bg-primary-50 text-primary-800', icon: <Check className="h-4 w-4" />, label: 'Pet Delivered' },
      cancelled: { color: 'bg-neutral-50 text-neutral-600', icon: <X className="h-4 w-4" />, label: 'Cancelled' }
    };

    const config = statusConfig[transactionRequest.status] || statusConfig.pending;

    return (
      <div className={`px-6 py-3 border-b border-slate-100 flex items-center justify-between ${config.color}`}>
        <div className="flex items-center gap-2">
          {config.icon}
          <span className="text-xs font-black uppercase tracking-widest">{config.label}</span>
        </div>
        {isSeller && (
          <div className="flex gap-2">
            {transactionRequest.status === 'pending' && (
              <>
                <button onClick={() => handleStatusUpdate('reserved')} className="text-[10px] font-black uppercase tracking-widest bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600">Reserve</button>
                <button onClick={() => handleStatusUpdate('rejected')} className="text-[10px] font-black uppercase tracking-widest bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700">Decline</button>
              </>
            )}
            {transactionRequest.status === 'reserved' && (
              <>
                <button onClick={() => handleStatusUpdate('approved')} className="text-[10px] font-black uppercase tracking-widest bg-secondary-600 text-white px-3 py-1.5 rounded-lg hover:bg-secondary-700">Approve</button>
                <button onClick={() => handleStatusUpdate('rejected')} className="text-[10px] font-black uppercase tracking-widest bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700">Decline</button>
              </>
            )}
            {transactionRequest.status === 'approved' && (
              <>
                <button onClick={() => handleStatusUpdate('ready_for_pickup')} className="text-[10px] font-black uppercase tracking-widest bg-secondary-600 text-white px-3 py-1.5 rounded-lg">Ready</button>
                <button onClick={() => handleStatusUpdate('shipped')} className="text-[10px] font-black uppercase tracking-widest bg-primary-600 text-white px-3 py-1.5 rounded-lg">Ship</button>
              </>
            )}
            {(transactionRequest.status === 'shipped' || transactionRequest.status === 'ready_for_pickup') && (
              <button onClick={() => handleStatusUpdate('delivered')} className="text-[10px] font-black uppercase tracking-widest bg-primary-600 text-white px-3 py-1.5 rounded-lg">Delivered</button>
            )}
          </div>
        )}
        {!isSeller && !isAdmin && ['pending', 'approved', 'ready_for_pickup'].includes(transactionRequest.status) && (
          <button
            onClick={handleCancelRequest}
            className="text-[10px] font-black uppercase tracking-widest bg-primary-700 text-white px-3 py-1.5 rounded-lg hover:bg-primary-800 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    );
  };

  const renderMessage = (message) => {
    const senderId = message.sender?._id || message.sender;
    const isOwnMessage = senderId === (currentUser?._id || currentUser?.id);
    const isSystemMessage = message.type === 'system';
    const isImage = message.type === 'image';

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

          <div className={`relative px-4 py-3 rounded-2xl shadow-sm ${isSystemMessage
            ? 'bg-slate-50 text-slate-400 italic text-xs'
            : isOwnMessage
              ? 'bg-primary-600 text-white rounded-tr-sm'
              : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'
            }`}>
            {isImage ? (
              <img
                src={message.content}
                alt="Sent"
                className="rounded-xl max-h-60 object-cover cursor-pointer"
                onLoad={handleImageLoad}
                onClick={() => window.open(message.content, '_blank')}
              />
            ) : (
              <p className="text-sm font-medium leading-relaxed">{message.content}</p>
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
        ${!isEmbedded ? 'rounded-3xl shadow-2xl max-w-lg w-full h-[65vh] sm:h-[600px] overflow-hidden border border-white/20' : ''}`}
    >
      {!isEmbedded && (
        <div className="px-5 py-3 bg-neutral-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center font-black text-base shadow-lg rotate-3 uppercase">
              {pet?.name?.[0] || 'P'}
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">{pet?.name || 'Inquiry'}</h3>
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all">
                <div className={`w-1 h-1 rounded-full ${onlineStatus.isOnline ? 'bg-secondary-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className={onlineStatus.isOnline ? 'text-secondary-400 font-bold' : 'text-slate-400'}>
                  {onlineStatus.text}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSeller && (
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
              className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all border border-white/10 group"
              title="Close Chat"
            >
              <X className="h-5 w-5 text-white group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      )}

      {renderTransactionStatus()}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 no-scrollbar overscroll-contain touch-pan-y">
        {!transactionRequest && !isSeller && !isAdmin && conversationId && pet && (
          <div className="bg-white border border-primary-100 p-4 rounded-3xl text-center space-y-3 mx-2 shadow-sm mb-4">
            <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center mx-auto">
              <Heart className="h-6 w-6 text-primary-500" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Serious Inquiry?</h3>
              <p className="text-[10px] text-slate-500 font-medium">Initiate the premium acquisition protocol.</p>
            </div>
            <button onClick={handlePurchaseRequest} className="btn btn-primary w-full py-2.5 text-[9px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary-100">
              Buy this Pet
            </button>
          </div>
        )}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <div className="flex items-center gap-3 bg-slate-50 rounded-full p-1.5 pl-4 border border-slate-100">
          <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-primary-500 shadow-sm transition-colors shrink-0">
            <Camera className="h-4 w-4" />
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
          </button>
          <textarea
            rows="1"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
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
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4 sm:p-6 font-sans transition-colors duration-300">
      <div className="w-full max-w-lg">
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
