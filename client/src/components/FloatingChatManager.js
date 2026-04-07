import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Minimize2, Maximize2, Send, Search, User, Clock, Check, Camera, Image as ImageIcon, ChevronLeft } from 'lucide-react';
import { chatService } from '../services/chatService';
import { toast } from 'react-toastify';
import { uploadService, storeService } from '../services/apiService';
import socket from '../utils/socket';

const FloatingChatManager = ({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [showChatWindow, setShowChatWindow] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [sellerStoreId, setSellerStoreId] = useState(null);
  const fileInputRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [typingUser, setTypingUser] = useState(null);
  const typingTimeoutRef = React.useRef(null);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      document.body.classList.add('chat-modal-open');
    } else {
      document.body.classList.remove('chat-modal-open');
    }
    return () => document.body.classList.remove('chat-modal-open');
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (currentUser) {
      fetchConversations();
      fetchUnreadCount();

      // Set up polling for new messages
      const interval = setInterval(() => {
        fetchUnreadCount();
        fetchConversations();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Listen for storage events to refresh conversations when new ones are created
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'newConversation') {
        fetchConversations();
        setLastRefresh(Date.now());
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const messagesContainerRef = React.useRef(null);

  // Scroll to bottom
  useEffect(() => {
    if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, showChatWindow]);

  // Refresh conversations periodically
  const refreshConversations = () => {
    fetchConversations();
    fetchUnreadCount();
    setLastRefresh(Date.now());
  };

  const fetchConversations = async () => {
    try {
      const response = await chatService.getConversations();
      setConversations(response.data.conversations || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await chatService.getUnreadCount();
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const fetchMessages = async (conversationId) => {
    try {
      const response = await chatService.getMessages(conversationId);
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleSelectConversation = async (conversation) => {
    setSelectedConversation(conversation);
    setShowChatWindow(true);
    setIsMinimized(false);
    setSellerStoreId(null);
    fetchMessages(conversation._id);
    chatService.markAsRead(conversation._id);

    // Resolve the seller's store for shop navigation
    const other = getOtherParticipant(conversation);
    if (other && (other.role === 'admin' || other.role === 'seller')) {
      try {
        const res = await storeService.getStoreByOwner(other._id || other.id);
        const storeId = res.data?.store?._id || res.data?._id || null;
        setSellerStoreId(storeId);
      } catch (e) {
        // Store lookup failed — navigation won't be available; that's OK
      }
    }
  };

  // Join room and listen for real-time events when chat is open
  useEffect(() => {
    if (!selectedConversation || !showChatWindow) return;

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('joinConversation', selectedConversation._id);

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

    const interval = setInterval(() => {
      fetchMessages(selectedConversation._id);
    }, 3000);

    return () => {
      clearInterval(interval);
      socket.off('userTyping');
      socket.off('userStopTyping');
    };
  }, [selectedConversation, showChatWindow, currentUser]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    const messageData = {
      content: newMessage.trim(),
      type: 'text'
    };

    setIsLoading(true);
    const savedMessage = newMessage;
    setNewMessage('');
    
    // Stop typing immediately when sending
    handleStopTyping();

    try {
      const response = await chatService.sendMessage(selectedConversation._id, messageData);
      setMessages(prev => [...prev, response.data.message]);
      fetchConversations();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      setNewMessage(savedMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTyping = () => {
    if (!selectedConversation || !currentUser) return;

    socket.emit('typing', {
      conversationId: selectedConversation._id,
      userId: currentUser._id || currentUser.id,
      userName: currentUser.firstName || 'Someone'
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 1500);
  };

  const handleStopTyping = () => {
    if (!selectedConversation || !currentUser) return;

    socket.emit('stopTyping', {
      conversationId: selectedConversation._id,
      userId: currentUser._id || currentUser.id
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedConversation) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size should be less than 2MB');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    setIsLoading(true);
    try {
      const uploadRes = await uploadService.uploadImage(formData);
      const imageUrl = uploadRes.data.url;

      const response = await chatService.sendMessage(selectedConversation._id, {
        content: imageUrl,
        type: 'image'
      });
      setMessages(prev => [...prev, response.data.message]);
      fetchConversations();
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to send image');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Dragging logic - Functional on mobile, disabled for desktop mouse events
  const handleDragStart = (e) => {
    // Only allow dragging via touch on mobile, or prevent if desktop mouse event
    if (e.type === 'mousedown' && window.innerWidth >= 640) return;
    
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    setStartY(clientY);
    setIsDragging(true);
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - startY;
    if (deltaY > 0) {
      setDragY(deltaY);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > 150) {
      setIsOpen(false);
      setShowChatWindow(false);
    }
    setDragY(0);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, dragY, startY]);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getOnlineStatus = (lastSeen) => {
    if (!lastSeen) return null;
    const now = new Date();
    const lastActive = new Date(lastSeen);
    const diffMs = now - lastActive;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 2) return { isOnline: true, text: 'Online' };
    if (diffMins < 60) return { isOnline: false, text: `Active ${diffMins}m ago` };
    if (diffMins < 1440) return { isOnline: false, text: `Active ${Math.floor(diffMins / 60)}h ago` };
    return { isOnline: false, text: `Active ${Math.floor(diffMins / 1440)}d ago` };
  };

  // Helper to get the other participant
  const getOtherParticipant = (conversation) => {
    if (!conversation?.participants) return null;
    return conversation.participants.find(
      p => (p.user?._id || p.user) !== (currentUser?._id || currentUser?.id)
    )?.user;
  };

  const filteredConversations = conversations.filter(conv =>
    conv.pet?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.participants?.some(p => p.user?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!currentUser) return null;

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-32 right-4 sm:bottom-6 sm:right-6 bg-primary-700 text-white rounded-full p-4 shadow-lg hover:bg-primary-800 transition-all duration-300 z-40 group"
        >
          <MessageSquare className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="absolute bottom-full right-0 mb-2 bg-amber-900 text-white text-sm px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Chat with Sellers
          </span>
        </button>
      )}

      {/* Chat Manager Window */}
      {isOpen && (
        <div 
          className={`fixed transition-all duration-300 ease-out sm:transition-none overflow-hidden
            ${isMinimized ? 'bottom-32 sm:bottom-6 h-14' : 'bottom-0 sm:bottom-6 sm:right-6 h-[70vh] sm:h-[600px] sm:w-96'}
            right-0 left-0 sm:left-auto bg-white rounded-t-3xl sm:rounded-lg shadow-2xl z-40 flex flex-col`}
          style={{ 
            transform: `translateY(${dragY}px)`,
            opacity: isDragging ? 0.9 : 1
          }}
        >

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-primary-800 text-white sm:rounded-t-lg">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <h3 className="font-semibold">Messages</h3>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">

              <button
                onClick={() => setIsOpen(false)}
                className="p-2 sm:p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 group"
                title="Close Chat"
              >
                <X className="h-5 w-5 sm:h-6 sm:w-6 text-white group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {!showChatWindow ? (
                /* Conversations List */
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {/* Search */}
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search conversations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  {/* Conversations */}
                  <div className="flex-1 overflow-y-auto">
                    {filteredConversations.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <MessageSquare className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                        <p>No conversations yet</p>
                        <p className="text-sm mt-1">Start chatting with sellers about pets!</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredConversations.map((conversation) => (
                          <div
                            key={conversation._id}
                            onClick={() => handleSelectConversation(conversation)}
                            className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <div className="flex items-start space-x-3">
                              <div className="relative flex-shrink-0">
                                <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold">
                                  {conversation.pet?.name?.[0]?.toUpperCase() || getOtherParticipant(conversation)?.firstName?.[0]?.toUpperCase() || 'C'}
                                </div>
                                {getOnlineStatus(getOtherParticipant(conversation)?.lastSeen)?.isOnline && (
                                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="font-semibold text-gray-900 truncate">
                                    {conversation.pet?.name || 'General Chat'}
                                  </p>
                                  <span className="text-xs text-gray-500">
                                    {formatTime(conversation.lastMessage?.timestamp || conversation.updatedAt)}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 truncate">
                                  {conversation.lastMessage?.type === 'image' ? '📷 Image shared' : (conversation.lastMessage?.content || 'No messages yet')}
                                </p>
                                <div className="flex items-center space-x-2 mt-1">
                                  <span className="text-xs text-gray-500">
                                    {getOtherParticipant(conversation)?.firstName || 'Unknown'}
                                  </span>
                                  {getOtherParticipant(conversation)?.lastSeen && (
                                    <span className="text-[10px] text-gray-400">• {getOnlineStatus(getOtherParticipant(conversation).lastSeen).text}</span>
                                  )}
                                  {conversation.unreadCount > 0 && (
                                    <span className="bg-primary-700 text-white text-xs px-2 py-0.5 rounded-full">
                                      {conversation.unreadCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Chat Window */
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {/* Chat Header */}
                  <div className="flex-shrink-0 p-3 border-b bg-gray-50 flex items-center justify-between z-10">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setShowChatWindow(false)}
                        className="p-2 sm:p-2.5 bg-gray-200 text-slate-700 rounded-xl hover:bg-gray-300 transition-all shadow-sm group"
                        title="Back to conversations"
                      >
                        <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                      </button>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 leading-none">
                            {selectedConversation?.pet?.name || 'Chat'}
                          </p>
                          {getOnlineStatus(getOtherParticipant(selectedConversation)?.lastSeen)?.isOnline && (
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          )}
                        </div>
                        {sellerStoreId ? (
                            <button
                              onClick={() => window.location.assign(`/stores/${sellerStoreId}`)}
                              className="text-[10px] text-primary-600 mt-1 uppercase font-black tracking-wider hover:underline text-left flex items-center gap-1"
                              title="Visit seller's shop"
                            >
                              <span className="w-1 h-1 rounded-full bg-primary-500 inline-block" />
                              {getOtherParticipant(selectedConversation)?.firstName || 'Seller'} · View Shop
                            </button>
                          ) : (
                            <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">
                              {getOtherParticipant(selectedConversation)?.firstName || 'User'}
                              {getOtherParticipant(selectedConversation)?.lastSeen && (
                                <span className="ml-1 opacity-60">• {getOnlineStatus(getOtherParticipant(selectedConversation).lastSeen).text}</span>
                              )}
                            </p>
                          )}
                      </div>
                    </div>
                    {/* Add Close Button */}
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 sm:p-2.5 bg-gray-200 text-slate-700 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm group"
                      title="Close Chat Bubble"
                    >
                      <X className="h-5 w-5 group-hover:rotate-90 transition-transform" />
                    </button>
                  </div>

                  {/* Messages */}
                  <div 
                    ref={messagesContainerRef}
                    className="flex-1 flex-grow basis-0 overflow-y-auto p-3 space-y-3 bg-gray-50/50 overscroll-contain touch-pan-y scroll-smooth"
                  >
                    {messages.map((message) => {
                      const senderId = message.sender?._id || message.sender;
                      const isOwnMessage = senderId === (currentUser?._id || currentUser?.id);
                      const isImage = message.type === 'image';
                      const isSystem = message.type === 'system';

                      return (
                        <div
                          key={message._id}
                          className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
                        >
                          <div className={`max-w-[85%] px-3 py-2 rounded-2xl shadow-sm ${isSystem
                            ? 'mx-auto bg-gray-100 text-gray-500 text-[10px] w-full text-center italic'
                            : isOwnMessage
                              ? 'bg-primary-700 text-white rounded-tr-none'
                              : 'bg-white border border-gray-100 text-gray-900 rounded-tl-none'
                            }`}>
                            {!isOwnMessage && !isSystem && (
                              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 text-gray-400`}>
                                {message.sender?.firstName || 'User'}
                              </p>
                            )}
                            {isImage ? (
                              <img
                                src={message.content}
                                alt="Sent"
                                className="rounded-lg max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(message.content, '_blank')}
                                onLoad={() => {
                                    if (messagesContainerRef.current) {
                                        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                                    }
                                }}
                              />
                            ) : (
                              <p className="text-sm leading-relaxed">{message.content}</p>
                            )}
                          </div>
                          {!isSystem && (
                            <p className={`text-[7px] mt-1 font-black uppercase tracking-widest ${isOwnMessage ? 'text-right pr-1' : 'text-left pl-1'} text-gray-400 opacity-60`}>
                              {formatTime(message.createdAt || message.timestamp)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                      <div ref={messagesEndRef} />
                    </div>

                    {typingUser && (
                      <div className="px-5 py-1 flex items-center gap-2 animate-fade-in transition-all">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 italic">
                          {typingUser} is typing...
                        </span>
                      </div>
                    )}

                    {/* Input */}
                  <div className="flex-shrink-0 p-3 border-t bg-white z-10">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-gray-400 hover:text-primary-700 hover:bg-gray-50 rounded-full transition-all"
                        title="Send Image"
                      >
                        <Camera className="h-5 w-5" />
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept="image/*"
                          onChange={handleImageUpload}
                        />
                      </button>
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => {
                          setNewMessage(e.target.value);
                          handleTyping();
                        }}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-2 bg-gray-50 border-none rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        disabled={isLoading}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={isLoading || !newMessage.trim()}
                        className="p-2.5 bg-primary-700 text-white rounded-full hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-primary-200"
                      >
                        {isLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
};

export default FloatingChatManager;
