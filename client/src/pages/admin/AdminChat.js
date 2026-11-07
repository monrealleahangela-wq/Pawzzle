import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { MessageSquare, Search, RefreshCw, ArrowLeft, AlertTriangle, Inbox, UserRound } from 'lucide-react';
import { chatService } from '../../services/chatService';
import EnhancedChatMessenger from '../../components/EnhancedChatMessenger';
import UserReportModal from '../../components/UserReportModal';
import CustomerQuickViewModal from '../../components/CustomerQuickViewModal';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'sales', label: 'Pet purchases' }
];

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

    const params = new URLSearchParams(window.location.search);
    const convId = params.get('conversationId');
    if (convId) autoSelectConversation(convId);

    const interval = setInterval(() => {
      fetchConversations(false);
      fetchUnreadCount();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const autoSelectConversation = async (id) => {
    try {
      const response = await chatService.getConversationById(id);
      if (response.data.conversation) setSelectedConversation(response.data.conversation);
    } catch (error) {
      console.error('Failed to auto-select conversation:', error);
    }
  };

  const fetchConversations = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await chatService.getAdminChats();
      setConversations(response.data.conversations || []);
    } catch (error) {
      toast.error('Conversations could not be loaded. Please try again.');
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

  const getOtherParticipant = (conversation) => {
    const currentUserId = currentUser?._id || currentUser?.id;
    return conversation?.participants?.find(participant => {
      const participantId = participant.user?._id || participant.user;
      return participantId && participantId.toString() !== currentUserId?.toString();
    });
  };

  const handleSelectConversation = (conversation) => {
    if (!conversation) return;
    setSelectedConversation(conversation);
    const conversationUnread = Number(conversation.unreadCount || 0);
    if (conversationUnread > 0) {
      setConversations(current => current.map(item => item._id === conversation._id ? { ...item, unreadCount: 0 } : item));
      setUnreadCount(current => Math.max(0, current - conversationUnread));
    }
  };

  const getParticipantNames = (conversation) => {
    const currentUserId = currentUser?._id || currentUser?.id;
    return conversation?.participants
      ?.filter(participant => {
        const participantId = participant.user?._id || participant.user;
        return participantId && participantId.toString() !== currentUserId?.toString();
      })
      .map(participant => participant.user?.firstName || 'Customer')
      .join(', ') || 'Customer';
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredConversations = conversations.filter(conversation => {
    const names = getParticipantNames(conversation).toLowerCase();
    const petName = conversation.pet?.name?.toLowerCase() || '';
    const lastMessage = conversation.lastMessage?.content?.toLowerCase() || '';
    const matchesSearch = !normalizedSearch || names.includes(normalizedSearch) || petName.includes(normalizedSearch) || lastMessage.includes(normalizedSearch);
    const matchesFilter = filter === 'all'
      || (filter === 'unread' && conversation.unreadCount > 0)
      || (filter === 'sales' && conversation.type === 'adoption');
    return matchesSearch && matchesFilter;
  });

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return `${Math.floor(diffMins / 1440)}d`;
  };

  const openCustomerDetails = () => {
    const otherParticipant = getOtherParticipant(selectedConversation);
    if (otherParticipant?.user?._id) {
      setViewingCustomerId(otherParticipant.user._id);
      setShowCustomerDetails(true);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[32rem] flex-col items-center justify-center gap-4 bg-[#F8F7F4]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-primary-600" />
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Loading conversations...</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full bg-[#F8F7F4] p-2 sm:p-4 lg:p-5">
      <div className="mx-auto flex min-w-0 max-w-[1440px] flex-col">
        <header className="flex items-center justify-between gap-4 px-1 pb-3 sm:pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-black uppercase tracking-tight text-slate-950 sm:text-xl">Customer messages</h1>
                {unreadCount > 0 && <span className="rounded-full bg-primary-700 px-2 py-0.5 text-[8px] font-black text-white">{unreadCount} new</span>}
              </div>
              <p className="mt-0.5 hidden text-[10px] font-medium text-slate-500 sm:block">Reply to questions, purchase conversations, and customer updates.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchConversations()}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary-100 bg-white px-3 text-[9px] font-black uppercase tracking-wider text-primary-800 shadow-sm transition hover:bg-primary-50"
            title="Refresh conversations"
          >
            <RefreshCw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </header>

        <div className="flex h-[clamp(32rem,calc(100dvh-16rem),46rem)] min-w-0 overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-[0_18px_55px_rgba(76,38,13,0.08)]" data-testid="admin-chat-workspace">
          <aside className={`min-h-0 w-full flex-col border-r border-slate-100 bg-white md:w-[21rem] lg:w-[23rem] ${selectedConversation ? 'hidden md:flex' : 'flex'}`} aria-label="Conversations">
            <div className="space-y-2.5 border-b border-slate-100 p-3.5">
              <div className="group relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary-500" />
                <input
                  aria-label="Search conversations"
                  type="text"
                  placeholder="Search customers or messages"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Conversation filters">
                {FILTERS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    onClick={() => setFilter(id)}
                    className={`min-h-8 flex-1 rounded-lg px-2 text-[8px] font-black uppercase tracking-wide transition ${filter === id ? 'bg-white text-primary-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" data-testid="conversation-scroll-region">
              {filteredConversations.length > 0 ? filteredConversations.map(conversation => (
                <button
                  type="button"
                  key={conversation._id}
                  onClick={() => handleSelectConversation(conversation)}
                  className={`relative flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-3 text-left transition ${selectedConversation?._id === conversation._id ? 'bg-primary-50/70 shadow-[inset_3px_0_0_#8B4513]' : 'hover:bg-slate-50'}`}
                  aria-current={selectedConversation?._id === conversation._id ? 'true' : undefined}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black uppercase ${conversation.unreadCount > 0 ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {getParticipantNames(conversation)[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="truncate text-[11px] font-black uppercase tracking-tight text-slate-900">{getParticipantNames(conversation)}</h4>
                      <span className="shrink-0 text-[8px] font-bold text-slate-400">{formatTime(conversation.lastMessageAt || conversation.updatedAt)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate text-[10px] ${conversation.unreadCount > 0 ? 'font-bold text-slate-700' : 'font-medium text-slate-500'}`}>
                        {conversation.lastMessage?.type === 'image' ? 'Photo shared' : (conversation.lastMessage?.content || 'No messages yet')}
                      </p>
                      {conversation.unreadCount > 0 && selectedConversation?._id !== conversation._id && (
                        <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary-700 px-1.5 py-0.5 text-[7px] font-black text-white">{conversation.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </button>
              )) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                  <Inbox className="h-8 w-8 text-slate-300" />
                  <p className="text-xs font-black text-slate-700">{normalizedSearch || filter !== 'all' ? 'No matching conversations' : 'No conversations yet'}</p>
                  <p className="max-w-[15rem] text-[10px] leading-relaxed text-slate-400">{normalizedSearch || filter !== 'all' ? 'Try another search or conversation filter.' : 'New customer messages will appear here.'}</p>
                </div>
              )}
            </div>
          </aside>

          <main className={`relative min-w-0 flex-1 flex-col overflow-hidden bg-white ${!selectedConversation ? 'hidden md:flex' : 'flex'}`}>
            {selectedConversation ? (
              <>
                <header className="z-20 flex flex-shrink-0 items-center justify-between border-b border-slate-100 bg-white/95 px-3.5 py-3 backdrop-blur-md md:px-5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <button type="button" onClick={() => setSelectedConversation(null)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden" aria-label="Back to conversations">
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={openCustomerDetails} className="flex min-w-0 items-center gap-3 text-left transition-opacity hover:opacity-75">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900 text-xs font-black uppercase text-white">
                        {getOtherParticipant(selectedConversation)?.user?.avatar ? (
                          <img src={getOtherParticipant(selectedConversation).user.avatar} alt="" className="h-full w-full object-cover" />
                        ) : getParticipantNames(selectedConversation)[0]}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-xs font-black uppercase tracking-tight text-slate-900">{getParticipantNames(selectedConversation)}</h2>
                        <p className="mt-0.5 truncate text-[9px] font-medium text-slate-500">{selectedConversation.type === 'adoption' ? 'Pet purchase conversation' : 'Customer conversation'} · View customer profile</p>
                      </div>
                    </button>
                  </div>
                  <button type="button" onClick={() => setShowReportModal(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50" title="Report customer" aria-label="Report customer">
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                </header>

                <div className="relative min-h-0 flex-1">
                  <EnhancedChatMessenger
                    isOpen={true}
                    onClose={() => setSelectedConversation(null)}
                    pet={selectedConversation.pet}
                    seller={currentUser}
                    currentUser={currentUser}
                    isAdmin={true}
                    existingConversationId={selectedConversation._id}
                    isEmbedded={true}
                    showEmbeddedHeader={false}
                    onMessageUpdate={() => fetchConversations(false)}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-300">
                  <UserRound className="h-8 w-8" />
                </div>
                <h2 className="mb-2 text-lg font-black text-slate-900">Select a conversation</h2>
                <p className="max-w-sm text-xs font-medium leading-relaxed text-slate-500">Choose a customer conversation to review messages and reply.</p>
              </div>
            )}
          </main>
        </div>
      </div>

      {showReportModal && selectedConversation && (
        <UserReportModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} reportedUser={getOtherParticipant(selectedConversation)?.user} />
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
