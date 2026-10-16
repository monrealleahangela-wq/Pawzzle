import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, PawPrint, ShieldAlert } from 'lucide-react';
import Modal from './Modal';
import { registerPawzzleDialogHost } from '../../utils/pawzzleDialog';

const toneStyles = {
  info: { icon: Info, badge: 'bg-primary/10 text-primary dark:bg-primary/20' },
  success: { icon: CheckCircle2, badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  warning: { icon: AlertTriangle, badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  danger: { icon: ShieldAlert, badge: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' }
};

const PawzzleDialogHost = () => {
  const [queue, setQueue] = useState([]);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const current = queue[0];

  useEffect(() => registerPawzzleDialogHost(request => {
    setQueue(previous => [...previous, request]);
  }), []);

  useEffect(() => {
    if (!current) return;
    setValue(String(current.defaultValue ?? ''));
    setError('');
    if (current.kind === 'prompt') {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [current]);

  const finish = result => {
    if (!current) return;
    current.resolve(result);
    setQueue(previous => previous.slice(1));
  };

  const cancel = () => {
    if (current?.kind === 'alert') finish(undefined);
    else if (current?.kind === 'confirm') finish(false);
    else finish(null);
  };

  const submit = event => {
    event.preventDefault();
    if (!current) return;

    if (current.kind === 'prompt') {
      const trimmed = value.trim();
      if (current.required && !trimmed) {
        setError(current.validationMessage || 'Please enter the required details.');
        inputRef.current?.focus();
        return;
      }
      if (current.minLength && trimmed.length < current.minLength) {
        setError(current.validationMessage || `Please enter at least ${current.minLength} characters.`);
        inputRef.current?.focus();
        return;
      }
      finish(value);
      return;
    }

    finish(current.kind === 'confirm' ? true : undefined);
  };

  if (!current) return null;

  const tone = toneStyles[current.tone] || toneStyles.info;
  const ToneIcon = tone.icon;
  const title = current.title || (current.kind === 'prompt'
    ? 'Details required'
    : current.kind === 'confirm' ? 'Please confirm' : 'Pawzzle notice');

  return (
    <Modal
      isOpen
      onClose={cancel}
      title={title}
      size="sm"
      showCloseButton={current.kind !== 'alert'}
      className="border-primary/20 shadow-[0_24px_70px_rgba(67,31,13,0.28)]"
      data-testid="pawzzle-dialog"
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="flex items-start gap-3">
          <div className={`relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.badge}`}>
            <ToneIcon aria-hidden="true" size={22} />
            <PawPrint aria-hidden="true" size={10} className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5 text-primary dark:bg-slate-900" />
          </div>
          <p className="whitespace-pre-line break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
            {current.message}
          </p>
        </div>

        {current.kind === 'prompt' && (
          <div>
            {current.inputLabel && (
              <label htmlFor={`pawzzle-dialog-input-${current.id}`} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {current.inputLabel}{current.required ? ' *' : ''}
              </label>
            )}
            {current.multiline ? (
              <textarea
                ref={inputRef}
                id={`pawzzle-dialog-input-${current.id}`}
                aria-label={current.inputLabel || title}
                aria-required={current.required || undefined}
                aria-invalid={!!error}
                aria-describedby={error ? `pawzzle-dialog-error-${current.id}` : undefined}
                value={value}
                onChange={event => { setValue(event.target.value); setError(''); }}
                rows={4}
                maxLength={current.maxLength}
                placeholder={current.placeholder}
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            ) : (
              <input
                ref={inputRef}
                id={`pawzzle-dialog-input-${current.id}`}
                aria-label={current.inputLabel || title}
                aria-required={current.required || undefined}
                aria-invalid={!!error}
                aria-describedby={error ? `pawzzle-dialog-error-${current.id}` : undefined}
                type={current.inputType || 'text'}
                step={current.step}
                value={value}
                onChange={event => { setValue(event.target.value); setError(''); }}
                maxLength={current.maxLength}
                placeholder={current.placeholder}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            )}
            {error && <p id={`pawzzle-dialog-error-${current.id}`} role="alert" className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:justify-end">
          {current.kind !== 'alert' && (
            <button type="button" onClick={cancel} className="min-h-11 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              {current.cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            type="submit"
            data-autofocus={current.kind === 'prompt' ? undefined : 'true'}
            className={`min-h-11 rounded-xl px-5 py-2.5 text-sm font-black uppercase tracking-wide text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${current.tone === 'danger' ? 'bg-red-700 hover:bg-red-800 focus:ring-red-500' : 'bg-primary hover:brightness-90 focus:ring-primary'}`}
          >
            {current.confirmLabel || (current.kind === 'alert' ? 'Got it' : current.kind === 'prompt' ? 'Continue' : 'Confirm')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PawzzleDialogHost;
