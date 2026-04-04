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
    xs: 'max-w-xs',
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
    full: 'max-w-full mx-2 sm:mx-4'
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
          "relative w-full bg-white/95 backdrop-blur-sm rounded-[1.5rem] shadow-strong border border-neutral-200/50 animate-scale-in z-10 flex flex-col max-h-[95vh] overflow-hidden sm:m-4 m-2",
          sizes[size],
          className
        )}
        {...props}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 sm:px-5 sm:py-3.5 border-b border-neutral-200/50 shrink-0">
            <div>
              {title && (
                <h3 className="text-lg font-black text-neutral-900 uppercase tracking-tighter leading-none">
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
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
});

Modal.displayName = "Modal";

const ModalHeader = ({ className, ...props }) => (
  <div className={cn("flex items-center justify-between p-4 sm:px-5 sm:py-3.5 border-b border-neutral-200/50", className)} {...props} />
);

const ModalTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-black text-neutral-900 uppercase tracking-tighter leading-none", className)}
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
  <div ref={ref} className={cn("p-4 sm:p-5", className)} {...props} />
));
ModalContent.displayName = "ModalContent";

const ModalFooter = ({ className, ...props }) => (
  <div className={cn("flex items-center justify-end gap-3 p-4 sm:px-5 sm:py-3.5 border-t border-neutral-200/50", className)} {...props} />
);
ModalFooter.displayName = "ModalFooter";

export { Modal, ModalHeader, ModalTitle, ModalDescription, ModalContent, ModalFooter };
export default Modal;
