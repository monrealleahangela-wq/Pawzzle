import React from 'react';
import { X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const LoginModal = ({ isOpen, onClose, onLogin }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const handleLogin = () => {
    // Save current path to localStorage for redirect after login
    localStorage.setItem('redirectPath', location.pathname);
    console.log(' Saved redirect path:', location.pathname);
    
    onClose();
    onLogin();
  };
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Login Required</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p className="text-gray-600 text-center">
            Please log in to add items to your cart. You'll need an account to proceed with checkout.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleLogin}
            className="w-full btn btn-primary py-3 text-lg font-semibold"
          >
            Log In / Sign Up
          </button>
          
          <button
            onClick={onClose}
            className="w-full btn btn-outline py-3"
          >
            Maybe Later
          </button>
        </div>

        {/* Trust Indicators */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="ml-2">Secure</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
              <span className="ml-2">Fast</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
