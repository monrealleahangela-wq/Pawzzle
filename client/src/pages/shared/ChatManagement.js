import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Search, Trash2, Archive, ArrowLeft, 
  CheckCircle, Plus, MoreVertical, X, RotateCcw, 
  ShieldCheck, Loader2, ChevronRight, Filter
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { chatService } from '../../services/chatService';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

const ChatManagement = ({ initialView = 'active' }) => {
  const [view, setView] = useState(initialView); // 'active' or 'archived'
  const [conversations, setConversations] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const selectionTimerRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, [view]);

  const fetchConversations = async () => {
    try {
      setIsLoading(true);
      const response = view === 'active' 
        ? await chatService.getConversations() 
        : await chatService.getArchivedConversations();
      
      setConversations(response.data.conversations || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const isSelected = prev.includes(id);
      const newSelection = isSelected 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id];
      
      if (newSelection.length === 0) {
        setIsSelectionMode(false);
      } else {
        setIsSelectionMode(true);
      }
      
      return newSelection;
    });
  };

  const handleLongPress = (id) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds([id]);
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} conversation(s)?`)) {
      return;
    }

    try {
      setIsDeleting(true);
      await Promise.all(selectedIds.map(id => chatService.deleteConversation(id)));
      toast.success('Conversations deleted');
      fetchConversations();
      exitSelectionMode();
    } catch (error) {
      console.error('Error deleting conversations:', error);
      toast.error('Failed to delete some conversations');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchive = async () => {
    if (selectedIds.length === 0) return;

    try {
      await Promise.all(selectedIds.map(id => chatService.archiveConversation(id)));
      toast.success(view === 'active' ? 'Conversations archived' : 'Conversations moved to active');
      fetchConversations();
      exitSelectionMode();
    } catch (error) {
      console.error('Error archiving conversations:', error);
      toast.error('Failed to process request');
    }
  };

  const handleRestore = async () => {
    if (selectedIds.length === 0) return;

    try {
      await Promise.all(selectedIds.map(id => chatService.restoreConversation(id)));
      toast.success('Conversations restored to main inbox');
      fetchConversations();
      exitSelectionMode();
    } catch (error) {
      console.error('Error restoring conversations:', error);
      toast.error('Failed to restore some conversations');
    }
  };

  const getOtherParticipant = (conversation) => {
    if (!conversation?.participants) return null;
    return conversation.participants.find(
      p => (p.user?._id || p.user) !== (currentUser?._id || currentUser?.id)
    )?.user;
  };

  const filteredConversations = conversations.filter(conv => {
    const participantNames = conv.participants?.map(p => 
      `${p.user?.firstName} ${p.user?.lastName}`.toLowerCase()
    ).join(' ') || '';
    const petName = conv.pet?.name?.toLowerCase() || '';
    const query = searchTerm.toLowerCase();
    
    return participantNames.includes(query) || petName.includes(query);
  });

  const getFormatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      const today = new Date();
      if (date.toDateString() === today.toDateString()) {
        return format(date, 'h:mm a');
      }
      return format(date, 'MMM d');
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Dynamic Header / Action Bar */}
      <header className={`sticky top-0 z-50 transition-all duration-300 ${
        isSelectionMode ? 'bg-primary-900 text-white shadow-lg' : 'bg-white text-slate-900 border-b'
      }`}>
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          {isSelectionMode ? (
            <div className="flex items-center gap-4 animate-fade-in w-full">
              <button onClick={exitSelectionMode} className="p-2 hover:bg-white/10 rounded-full">
                <X className="h-6 w-6" />
              </button>
              <h2 className="text-lg font-black tracking-tight flex-1">{selectedIds.length} Selected</h2>
              <div className="flex items-center gap-2">
                {view === 'active' ? (
                  <button onClick={handleArchive} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all" title="Archive">
                    <Archive className="h-5 w-5" />
                  </button>
                ) : (
                  <button onClick={handleRestore} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all" title="Restore">
                    <RotateCcw className="h-5 w-5" />
                  </button>
                )}
                <button onClick={handleDelete} className="p-2.5 bg-rose-500/20 hover:bg-rose-500 text-rose-100 hover:text-white rounded-xl transition-all" title="Delete">
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 w-full">
              <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full">
                <ArrowLeft className="h-6 w-6" />
              </button>
              <h1 className="text-xl font-black tracking-tighter flex-1">
                {view === 'active' ? 'Messages' : 'Archived Messages'}
              </h1>
              <div className="flex items-center gap-2">
                {view === 'active' ? (
                  <button onClick={() => setView('archived')} className="p-2 text-slate-500 hover:text-primary-600 transition-colors" title="View Archived">
                    <Archive className="h-5 w-5" />
                  </button>
                ) : (
                  <button onClick={() => setView('active')} className="p-2 text-slate-500 hover:text-primary-600 transition-colors" title="View Active">
                    <MessageSquare className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full flex flex-col min-h-0">
        {/* Search Bar */}
        <div className="p-4 flex-shrink-0">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-3xl shadow-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all font-medium text-slate-700"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-4 pb-20 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <Loader2 className="h-10 w-10 text-primary-500 animate-spin mb-4" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading Conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <MessageSquare className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">
                {searchTerm ? 'No results found' : view === 'active' ? 'Your inbox is empty' : 'No archived messages'}
              </h3>
              <p className="text-slate-500 text-sm font-medium max-w-xs mx-auto">
                {searchTerm ? 'Try adjusting your search terms.' : 'Messages about pet inquiries or adoptions will appear here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-8">
              {filteredConversations.map((conv) => {
                const isSelected = selectedIds.includes(conv._id);
                const otherParticipant = getOtherParticipant(conv);
                const lastMsg = conv.lastMessage;
                
                return (
                  <div
                    key={conv._id}
                    onMouseDown={() => {
                      selectionTimerRef.current = setTimeout(() => handleLongPress(conv._id), 500);
                    }}
                    onMouseUp={() => clearTimeout(selectionTimerRef.current)}
                    onClick={() => isSelectionMode ? handleToggleSelect(conv._id) : null}
                    className={`relative group bg-white rounded-[2rem] border transition-all duration-300 active:scale-[0.98] ${
                      isSelected 
                        ? 'border-primary-500 ring-4 ring-primary-500/10 z-10' 
                        : 'border-slate-100 hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/50'
                    }`}
                  >
                    <div className="p-5 flex items-center gap-4">
                      {/* Selection Checkbox (Visible in Selection Mode) */}
                      {isSelectionMode && (
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all animate-pop ${
                          isSelected ? 'bg-primary-500 border-primary-500 text-white' : 'border-slate-200 bg-slate-50'
                        }`}>
                          {isSelected && <CheckCircle className="h-4 w-4" />}
                        </div>
                      )}

                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary-100 rotate-3 animate-slide-up">
                          {conv.pet?.name?.[0] || otherParticipant?.firstName?.[0] || 'C'}
                        </div>
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-md">
                            <CheckCircle className="h-4 w-4 text-primary-500 fill-white" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0" onClick={() => !isSelectionMode && navigate(`/messages/${conv._id}`)}>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-black text-slate-800 tracking-tight truncate leading-none">
                            {conv.pet?.name || 'Inquiry'}
                          </h4>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap ml-2">
                            {getFormatTime(lastMsg?.timestamp)}
                          </span>
                        </div>
                        <p className={`text-xs font-medium truncate ${conv.unreadCount > 0 ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                          {lastMsg?.type === 'image' ? '📷 Shared an image' : lastMsg?.content || 'Started a conversation'}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full inline-block">
                            {otherParticipant?.firstName || 'User'}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="bg-rose-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                         <ChevronRight className="h-5 w-5 text-slate-300" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* FAB for New Message? Or maybe just keep it simple */}
      {view === 'active' && !isSelectionMode && (
        <button 
          onClick={() => navigate('/find-shops')}
          className="fixed bottom-8 right-8 bg-primary-900 text-white p-5 rounded-[2rem] shadow-2xl shadow-primary-900/40 hover:scale-110 active:scale-95 transition-all z-40"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
};

export default ChatManagement;
