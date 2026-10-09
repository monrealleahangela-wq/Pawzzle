import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils';

const modalStack = [];
let bodyLockCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';

const focusableSelector = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const lockDocumentScroll = () => {
  if (bodyLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    savedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  bodyLockCount += 1;
};

const unlockDocumentScroll = () => {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
    document.documentElement.style.overflow = savedHtmlOverflow;
  }
};

const ModalViewport = ({
  children,
  className,
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef
}) => {
  const viewportRef = useRef(null);
  const modalIdRef = useRef(Symbol('modal'));
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const initialFocusRefRef = useRef(initialFocusRef);
  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;
  initialFocusRefRef.current = initialFocusRef;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const modalId = modalIdRef.current;
    modalStack.push(modalId);
    lockDocumentScroll();

    const focusTimer = window.setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport || viewport.contains(document.activeElement)) return;
      const target = initialFocusRefRef.current?.current
        || viewport.querySelector('[data-autofocus="true"]')
        || viewport.querySelector(focusableSelector)
        || viewport.querySelector('[role="dialog"]');
      target?.focus?.();
    }, 0);

    const handleKeyDown = event => {
      if (modalStack[modalStack.length - 1] !== modalId || event.defaultPrevented) return;
      if (event.key === 'Escape' && closeOnEscapeRef.current && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(viewportRef.current?.querySelectorAll(focusableSelector) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = modalStack.lastIndexOf(modalId);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      unlockDocumentScroll();
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.();
    };
  }, []);

  const handleBackdropMouseDown = event => {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
  };

  return createPortal(
    <div
      ref={viewportRef}
      data-modal-viewport="true"
      className={cn(
        'fixed inset-0 z-[1000] flex h-[100dvh] max-h-[100dvh] items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/55 p-3 backdrop-blur-sm sm:p-4',
        className
      )}
      onMouseDown={handleBackdropMouseDown}
    >
      {children}
    </div>,
    document.body
  );
};

export default ModalViewport;
