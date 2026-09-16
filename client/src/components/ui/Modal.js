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
  const titleId = React.useId();
  if (!isOpen) return null;

  const sizes = {
    xs: 'max-w-xs',
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
    full: 'max-w-none'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "relative w-full min-w-0 max-w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-strong border border-neutral-200/50 dark:border-slate-700 animate-scale-in z-10 flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden",
          sizes[size],
          className
        )}
        {...props}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex min-w-0 items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-3.5 border-b border-neutral-200/50 shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 id={titleId} className="text-lg font-black text-default uppercase tracking-tight leading-tight break-normal">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-sm text-secondary mt-1 break-words">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close dialog"
                className="h-8 w-8 shrink-0 rounded-lg hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 p-3.5 sm:p-5 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
});

Modal.displayName = "Modal";

const ModalHeader = ({ className, ...props }) => (
  <div className={cn("flex min-w-0 items-center justify-between gap-3 p-4 sm:px-5 sm:py-3.5 border-b border-neutral-200/50", className)} {...props} />
);

const ModalTitle = React.forwardRef(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("min-w-0 flex-1 text-lg font-black text-default uppercase tracking-tighter leading-tight break-words", className)}
    {...props}
  >
    {children}
  </h3>
));
ModalTitle.displayName = "ModalTitle";

const ModalDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-secondary break-words", className)}
    {...props}
  />
));
ModalDescription.displayName = "ModalDescription";

const ModalContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 sm:p-5", className)} {...props} />
));
ModalContent.displayName = "ModalContent";

const ModalFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-wrap items-center justify-end gap-2 sm:gap-3 p-4 sm:px-5 sm:py-3.5 border-t border-neutral-200/50", className)} {...props} />
);
ModalFooter.displayName = "ModalFooter";

export { Modal, ModalHeader, ModalTitle, ModalDescription, ModalContent, ModalFooter };
export default Modal;
