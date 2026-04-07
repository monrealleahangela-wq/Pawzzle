import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  MessageSquare,
  Users,
  Search,
  Clock,
  CheckCircle,
  Shield,
  Zap,
  Filter,
  RefreshCw,
  MoreVertical,
  Activity,
  ArrowLeft,
  AlertTriangle
} from 'lucide-react';
import { chatService } from '../../services/chatService';
import EnhancedChatMessenger from '../../components/EnhancedChatMessenger';
import UserReportModal from '../../components/UserReportModal';
import CustomerQuickViewModal from '../../components/CustomerQuickViewModal';

const AdminChat = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [viewingCustomerId, setViewingCustomerId] = useState(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setCurrentUser(user);
    fetchConversations();
    fetchUnreadCount();

    const interval = setInterval(() => {
      fetchConversations(false);
      fetchUnreadCount();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const fetchConversations = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await chatService.getAdminChats();
      setConversations(response.data.conversations || []);
    } catch (error) {
      toast.error('Failed to load chats');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await chatService.getUnreadCount();
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      console.error('Chat count error:', error);
    }
  };

  const handleSelectConversation = (conversation) => {
    if (!conversation) return;
    setSelectedConversation(conversation);
  };

  const getParticipantNames = (conversation) => {
    const currentUserId = currentUser?._id || currentUser?.id;
    return conversation.participants
      ?.filter(p => {
        const pId = p.user?._id || p.user;
        return pId && pId.toString() !== currentUserId?.toString();
      })
      .map(p => p.user?.firstName || 'User')
      .join(', ') || 'Unknown User';
  };

  const filteredConversations = conversations.filter(conv => {
    const names = getParticipantNames(conv).toLowerCase();
    const petName = conv.pet?.name?.toLowerCase() || '';
    const lastMsg = conv.lastMessage?.content?.toLowerCase() || '';
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = names.includes(searchLower) || petName.includes(searchLower) || lastMsg.includes(searchLower);

    const matchesFilter = filter === 'all' ||
      (filter === 'unread' && conv.unreadCount > 0) ||
      (filter === 'sales' && conv.type === 'adoption');

    return matchesSearch && matchesFilter;
  });

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    if (diffMins < 1) return 'LIVE';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return `${Math.floor(diffMins / 1440)}d`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-slate-50/50">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Syncing Messages...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white md:bg-slate-50/30">
      <div className="max-w-[1600px] mx-auto min-h-screen flex flex-col md:p-4 lg:p-6">

        {/* Compact Header */}
        <header className="flex items-center justify-between px-4 py-3.5 md:px-0 md:pb-6">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-slate-900 text-white rounded-lg">
              <MessageSquare className="h-3.5 w-3.5" />
            </div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-widest">
              Messages {unreadCount > 0 && <span className="ml-2 px-1.5 py-0.5 bg-rose-500 text-[8px] rounded-full">{unreadCount}</span>}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchConversations()}
              className="p-2 text-slate-400 hover:text-slate-900 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden bg-white border border-slate-100 rounded-none md:rounded-2xl shadow-sm">
          {/* Sidebar - Conversation List */}
          <div className={`w-full md:w-80 lg:w-96 flex flex-col border-r border-slate-50 ${selectedConversation ? 'hidden md:flex' : 'flex'}`}>
            {/* Search & Filter - Compact */}
            <div className="p-3 border-b border-slate-50 space-y-3">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="find customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50/50 border border-slate-100 text-[10px] font-bold uppercase tracking-widest rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-primary-500/10 transition-all"
                />
              </div>

              <div className="flex gap-1 p-1 bg-slate-50 rounded-lg">
                {['all', 'unread', 'sales'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 py-1.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {filteredConversations.length > 0 ? (
                filteredConversations.map((conv) => (
                  <div
                    key={conv._id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`px-4 py-3.5 cursor-pointer transition-all border-b border-slate-50/50 flex items-center gap-4 relative ${selectedConversation?._id === conv._id ? 'bg-slate-50 border-l-4 border-l-primary-600' : 'hover:bg-slate-50/50 border-l-4 border-l-transparent'}`}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-sm shrink-0 uppercase">
                      {getParticipantNames(conv)[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-start">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase truncate tracking-tight">
                          {getParticipantNames(conv)}
                        </h4>
                        <span className="text-[8px] font-bold text-slate-300">
                          {formatTime(conv.lastMessageAt || conv.updatedAt)}
                        </span>
                      </div>
                      <p className="text-[10px] font-medium text-slate-400 truncate mt-0.5">
                        {conv.lastMessage?.type === 'image' ? '📷 Image shared' : (conv.lastMessage?.content || 'Start conversation')}
                      </p>
                    </div>
                    {conv.unreadCount > 0 && selectedConversation?._id !== conv._id && (
                      <div className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 p-8 opacity-30">
                  <MessageSquare className="h-8 w-8 text-slate-300" />
                  <p className="text-[9px] font-black uppercase tracking-widest">Empty</p>
                </div>
              )}
            </div>
          </div>

          {/* Chat Main Area */}
          <div className={`flex-1 flex flex-col bg-white overflow-hidden relative ${!selectedConversation ? 'hidden md:flex' : 'flex'}`}>
            {selectedConversation ? (
              <>
                {/* Minimalist Chat Header */}
                <header className="px-4 md:px-6 py-3.5 border-b border-slate-50 flex items-center justify-between bg-white/80 backdrop-blur-md z-10">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="md:hidden p-1.5 text-slate-400 hover:text-slate-900"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button 
                        onClick={() => {
                            const otherParticipant = selectedConversation.participants?.find(p => {
                                const pId = p.user?._id || p.user;
                                return pId?.toString() !== (currentUser?._id || currentUser?.id)?.toString();
                            });
                            if (otherParticipant?.user?._id) {
                                setViewingCustomerId(otherParticipant.user._id);
                                setShowCustomerDetails(true);
                            }
                        }}
                        className="flex items-center gap-3 hover:opacity-75 transition-opacity text-left"
                    >
                        <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white text-xs font-black uppercase overflow-hidden shrink-0">
                        {(selectedConversation.participants?.find(p => p.user?._id?.toString() !== (currentUser?._id || currentUser?.id)?.toString())?.user?.avatar) ? (
                            <img src={selectedConversation.participants?.find(p => p.user?._id?.toString() !== (currentUser?._id || currentUser?.id)?.toString())?.user?.avatar} alt="" className="w-full h-full object-cover" />
                        ) : getParticipantNames(selectedConversation)[0]}
                        </div>
                        <div>
                        <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight">{getParticipantNames(selectedConversation)}</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Online</span>
                            <div className="w-1 h-1 rounded-full bg-slate-200" />
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{selectedConversation.type === 'adoption' ? 'Pet Sale' : selectedConversation.type}</span>
                        </div>
                        </div>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => setShowReportModal(true)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                      title="Report Customer"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </button>
                    <button className="p-2 text-slate-300 hover:text-slate-600 transition-colors">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </header>

                <div className="flex-1 relative">
                  <EnhancedChatMessenger
                    isOpen={true}
                    onClose={() => setSelectedConversation(null)}
                    pet={selectedConversation.pet}
                    seller={currentUser}
                    currentUser={currentUser}
                    isAdmin={true}
                    existingConversationId={selectedConversation._id}
                    isEmbedded={true}
                    onMessageUpdate={() => fetchConversations(false)}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-40">
                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-6">
                  <MessageSquare className="h-10 w-10 text-slate-200" />
                </div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">Select a thread</h2>
                <p className="max-w-xs text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                  Choose a customer from the left to begin secure real-time communication.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      {showReportModal && selectedConversation && (
        <UserReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUser={selectedConversation.participants?.find(p => {
            const pId = p.user?._id || p.user;
            const currentId = currentUser?._id || currentUser?.id;
            return pId && pId.toString() !== currentId?.toString();
          })?.user}
        />
      )}
      {showCustomerDetails && viewingCustomerId && (
        <CustomerQuickViewModal
            isOpen={showCustomerDetails}
            onClose={() => {
                setShowCustomerDetails(false);
                setViewingCustomerId(null);
            }}
            customerId={viewingCustomerId}
        />
      )}
    </div>
  );
};

export default AdminChat;
