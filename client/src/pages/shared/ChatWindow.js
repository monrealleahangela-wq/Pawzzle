import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import EnhancedChatMessenger from '../../components/EnhancedChatMessenger';
import { chatService } from '../../services/chatService';
import { useAuth } from '../../contexts/AuthContext';

const ChatWindow = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchConversation();
  }, [id]);

  const fetchConversation = async () => {
    try {
      setIsLoading(true);
      const response = await chatService.getConversations();
      const conv = response.data.conversations?.find(c => c._id === id);
      
      // If not found in active, check archived
      if (!conv) {
        const archivedResponse = await chatService.getArchivedConversations();
        const archConv = archivedResponse.data.conversations?.find(c => c._id === id);
        setConversation(archConv || null);
      } else {
        setConversation(conv);
      }
    } catch (error) {
      console.error('Error fetching conversation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getOtherParticipant = (conv) => {
    if (!conv?.participants) return null;
    return conv.participants.find(
      p => (p.user?._id || p.user) !== (currentUser?._id || currentUser?.id)
    )?.user;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
        <Loader2 className="h-10 w-10 text-primary-500 animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Opening secure chat...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-6 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
          <MessageSquare className="h-12 w-12 text-slate-300" />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Chat not found</h2>
        <p className="text-slate-500 text-sm font-medium mb-8">This conversation may have been deleted or moved.</p>
        <button 
          onClick={() => navigate('/messages')}
          className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary-100 active:scale-95 transition-all"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Inbox
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <EnhancedChatMessenger
        isOpen={true}
        onClose={() => navigate('/messages')}
        pet={conversation.pet}
        seller={getOtherParticipant(conversation)}
        currentUser={currentUser}
        existingConversationId={conversation._id}
        isEmbedded={true}
      />
    </div>
  );
};

export default ChatWindow;
