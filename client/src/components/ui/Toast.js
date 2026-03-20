import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../utils';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback(({ title, description, variant = 'default', duration = 5000 }) => {
    const id = Date.now();
    const newToast = { id, title, description, variant, duration };

    setToasts(prev => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clear = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss, clear }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem = ({ toast, onDismiss }) => {
  const variants = {
    default: {
      bg: 'bg-white border-neutral-200',
      icon: Info,
      iconColor: 'text-secondary-500',
      titleColor: 'text-neutral-900',
      descriptionColor: 'text-neutral-600'
    },
    success: {
      bg: 'bg-success-50 border-success-200',
      icon: CheckCircle,
      iconColor: 'text-success-600',
      titleColor: 'text-success-900',
      descriptionColor: 'text-success-700'
    },
    error: {
      bg: 'bg-error-50 border-error-200',
      icon: XCircle,
      iconColor: 'text-error-600',
      titleColor: 'text-error-900',
      descriptionColor: 'text-error-700'
    },
    warning: {
      bg: 'bg-warning-50 border-warning-200',
      icon: AlertCircle,
      iconColor: 'text-warning-600',
      titleColor: 'text-warning-900',
      descriptionColor: 'text-warning-700'
    }
  };

  const variant = variants[toast.variant] || variants.default;
  const Icon = variant.icon;

  return (
    <div
      className={`
        ${variant.bg} border rounded-xl p-4 shadow-medium backdrop-blur-sm
        animate-slide-up max-w-sm w-full
        hover:shadow-strong transition-all duration-200
      `}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${variant.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          {toast.title && (
            <p className={`font-medium ${variant.titleColor}`}>
              {toast.title}
            </p>
          )}
          {toast.description && (
            <p className={`text-sm ${variant.descriptionColor} mt-1`}>
              {toast.description}
            </p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors"
        >
          <X className={`h-4 w-4 ${variant.descriptionColor}`} />
        </button>
      </div>
    </div>
  );
};

// Convenience functions
export const toast = {
  success: (title, description, options) =>
    useContext(ToastContext)?.toast({ title, description, variant: 'success', ...options }),

  error: (title, description, options) =>
    useContext(ToastContext)?.toast({ title, description, variant: 'error', ...options }),

  warning: (title, description, options) =>
    useContext(ToastContext)?.toast({ title, description, variant: 'warning', ...options }),

  info: (title, description, options) =>
    useContext(ToastContext)?.toast({ title, description, variant: 'info', ...options }),

  default: (title, description, options) =>
    useContext(ToastContext)?.toast({ title, description, variant: 'default', ...options })
};
