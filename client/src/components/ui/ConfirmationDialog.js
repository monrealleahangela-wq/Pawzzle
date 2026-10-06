import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

const ConfirmationDialog = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
  tone = 'warning'
}) => {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = document.activeElement;
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  const handleKeyDown = event => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])];
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

  return (
    <Modal
      ref={dialogRef}
      isOpen={isOpen}
      onClose={() => !busy && onCancel()}
      title={title}
      description={description}
      size="sm"
      showCloseButton={false}
      onKeyDown={handleKeyDown}
    >
      <div className="space-y-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone === 'danger' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 px-5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{cancelLabel}</button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={busy} className={`min-h-11 rounded-xl px-5 text-xs font-black text-white disabled:opacity-50 ${tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-primary-600 hover:bg-primary-700'}`}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationDialog;
