import React from 'react';
import { cn } from '../../utils';
import { Button } from './Button';
import { X } from 'lucide-react';

const Modal = React.forwardRef(({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  className,
  ...props
}, ref) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={ref}
        className={cn(
          "relative w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-strong border border-neutral-200/50 animate-scale-in z-10 flex flex-col max-h-[90vh] overflow-hidden",
          sizes[size],
          className
        )}
        {...props}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-6 border-b border-neutral-200/50 shrink-0">
            <div>
              {title && (
                <h3 className="text-xl font-semibold text-neutral-900">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-sm text-neutral-600 mt-1">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-lg hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
});

Modal.displayName = "Modal";

const ModalHeader = ({ className, ...props }) => (
  <div className={cn("flex items-center justify-between p-6 border-b border-neutral-200/50", className)} {...props} />
);

const ModalTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-xl font-semibold text-neutral-900", className)}
    {...props}
  />
));
ModalTitle.displayName = "ModalTitle";

const ModalDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-neutral-600", className)}
    {...props}
  />
));
ModalDescription.displayName = "ModalDescription";

const ModalContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6", className)} {...props} />
));
ModalContent.displayName = "ModalContent";

const ModalFooter = ({ className, ...props }) => (
  <div className={cn("flex items-center justify-end gap-3 p-6 border-t border-neutral-200/50", className)} {...props} />
);
ModalFooter.displayName = "ModalFooter";

export { Modal, ModalHeader, ModalTitle, ModalDescription, ModalContent, ModalFooter };
export default Modal;
