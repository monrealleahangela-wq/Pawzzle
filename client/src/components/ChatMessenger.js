import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { Send, X, User, Clock, Check } from 'lucide-react';

const ChatMessenger = ({ isOpen, onClose, pet, seller, currentUser }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [adoptionStatus, setAdoptionStatus] = useState('pending');
  const messagesEndRef = useRef(null);

  const messagesContainerRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    // Initialize chat with welcome message
    if (isOpen && pet && seller) {
      setMessages([
        {
          id: 1,
          sender: 'seller',
          content: `Hi! I'm ${seller.firstName}, the seller of ${pet.name}. I'd be happy to tell you more about ${pet.name} and discuss the adoption process.`,
          timestamp: new Date(),
          isSystem: false
        },
        {
          id: 2,
          sender: 'system',
          content: `Pet Details: ${pet.name} - ${pet.breed} - ${pet.age} old - $${pet.price}`,
          timestamp: new Date(),
          isSystem: true
        }
      ]);
    }
  }, [isOpen, pet, seller]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageData = {
      id: Date.now(),
      sender: 'customer',
      content: newMessage.trim(),
      timestamp: new Date(),
      isSystem: false
    };

    setMessages(prev => [...prev, messageData]);
    setNewMessage('');
    setIsLoading(true);

    try {
      // TODO: Implement actual chat API call
      // For now, simulate sending message
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate seller response
      const sellerResponse = {
        id: Date.now() + 1,
        sender: 'seller',
        content: generateSellerResponse(newMessage),
        timestamp: new Date(),
        isSystem: false
      };

      setMessages(prev => [...prev, sellerResponse]);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const generateSellerResponse = (customerMessage) => {
    const responses = [
      "That's a great question! Let me tell you more about the pet's personality.",
      "Yes, ${pet.name} is fully vaccinated and has regular vet checkups.",
      "The adoption fee includes all medical records and a starter kit.",
      "We can arrange a meet-and-greet session this weekend if you're interested.",
      "What kind of home environment do you have for pets?",
      "Are you familiar with ${pet.breed} care requirements?",
      "I'd be happy to share more photos and videos of ${pet.name}."
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  };

  const handleConfirmAdoption = () => {
    setAdoptionStatus('confirmed');
    toast.success('Adoption confirmed! The seller will contact you soon.');
    // TODO: Call API to update pet status and create adoption record
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 h-[60vh] max-h-[60vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b z-10 bg-white rounded-t-lg">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-full flex items-center justify-center text-white font-bold">
              {pet?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Chat about {pet?.name}</h3>
              <p className="text-sm text-gray-600">with {seller?.firstName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Messages */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain bg-slate-50/30 scroll-smooth"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2 rounded-2xl shadow-sm ${message.isSystem
                    ? 'bg-gray-100 text-gray-700 text-[10px] uppercase font-bold tracking-widest'
                    : message.sender === 'customer'
                      ? 'bg-primary-600 text-white rounded-tr-none'
                      : 'bg-white text-gray-900 rounded-tl-none border border-slate-100'
                  }`}
              >
                {message.isSystem && (
                  <div className="flex items-center space-x-1 mb-1 opacity-60">
                    <Clock className="h-3 w-3" />
                    <span>Pet Info</span>
                  </div>
                )}
                {message.type === 'image' || (typeof message.content === 'string' && (message.content.startsWith('/uploads/') || message.content.startsWith('http'))) ? (
                  <img
                    src={message.content}
                    alt="Sent"
                    className="rounded-xl max-h-64 object-cover cursor-pointer hover:opacity-95 transition-all shadow-sm"
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
                <div className="flex items-center justify-end gap-1 mt-1 opacity-50">
                  <span className="text-[9px]">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Adoption Status */}
        {adoptionStatus === 'confirmed' && (
          <div className="bg-green-50 border border-green-200 p-3 m-4 rounded-lg">
            <div className="flex items-center space-x-2">
              <Check className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Adoption Confirmed!</p>
                <p className="text-sm text-green-700">The seller will contact you soon to arrange the adoption.</p>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex-shrink-0 p-4 border-t bg-white rounded-b-lg">
          {adoptionStatus === 'pending' ? (
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message about the adoption..."
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading || !newMessage.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={handleConfirmAdoption}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Confirm Adoption
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessenger;
