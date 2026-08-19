import React, { useState } from 'react';
import { Check, Save, Upload, X } from 'lucide-react';

export const compactInputClass = 'mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-default outline-none transition placeholder:text-neutral-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
export const compactTextareaClass = 'mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-default outline-none transition placeholder:text-neutral-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10';

export const RequiredMark = () => <span className="text-rose-500" aria-hidden="true"> *</span>;

export const CompactFormSection = ({ step, icon: Icon, title, description, children }) => (
  <section className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-[10px] font-black text-primary-700">{step}</span>
      {Icon && <Icon className="mt-1 h-4 w-4 shrink-0 text-primary-600" />}
      <div>
        <h3 className="text-sm font-black text-default">{title}</h3>
        {description && <p className="mt-0.5 text-[11px] text-muted">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

const filenameFromValue = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value.name || fallback;
  try {
    return decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).pop() || '') || fallback;
  } catch {
    return value.split('/').filter(Boolean).pop() || fallback;
  }
};

export const CompactUploadCard = ({
  title,
  value,
  preview,
  required = false,
  roundPreview = false,
  accept = 'image/*',
  multiple = false,
  loading = false,
  helper,
  onFiles,
  onRemove
}) => {
  const [dragging, setDragging] = useState(false);
  const processFiles = files => {
    if (!files?.length || loading) return;
    onFiles?.(files);
  };

  return (
    <div
      className={`rounded-2xl border border-dashed p-4 transition ${dragging ? 'border-primary-400 bg-primary-50' : 'border-slate-300 bg-slate-50'}`}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); processFiles(Array.from(event.dataTransfer.files || [])); }}
    >
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <div className={`flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white ${roundPreview ? 'rounded-full' : 'rounded-2xl'}`}>
          {preview ? <img src={preview} alt={`${title} preview`} className="h-full w-full object-cover" /> : <Upload className="h-7 w-7 text-slate-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-default">{title}{required && <RequiredMark />}</p>
          <p className="mt-1 truncate text-[11px] text-muted">{filenameFromValue(value, helper || 'Choose a file or drop it here')}</p>
          {value && !loading && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><Check className="h-3 w-3" /> Uploaded</span>}
          {loading && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-primary-700"><span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" /> Uploading</span>}
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-3 text-[10px] font-black text-primary-700 hover:bg-primary-50">
              <Upload className="h-3.5 w-3.5" /> {value ? 'Replace' : 'Upload'}
              <input type="file" accept={accept} multiple={multiple} className="sr-only" disabled={loading} onChange={event => { processFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
            </label>
            {value && onRemove && <button type="button" onClick={onRemove} disabled={loading} className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-[10px] font-black text-rose-600 hover:bg-rose-50">Remove</button>}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CompactToggle = ({ checked, onChange, label, description }) => (
  <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
    <span><span className="block text-[11px] font-black text-default">{label}</span>{description && <span className="mt-0.5 block text-[10px] text-muted">{description}</span>}</span>
    <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-primary-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} /></span>
  </button>
);

export const CompactFormModal = ({
  title,
  subtitle,
  icon: Icon,
  formId,
  onClose,
  onSubmit,
  saveDisabled,
  loading,
  saveLabel,
  secondaryAction,
  children
}) => (
  <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">{Icon && <Icon className="h-4 w-4" />}</span>
          <div className="min-w-0"><h2 className="truncate text-base font-black text-default">{title}</h2><p className="truncate text-[10px] text-muted">{subtitle}</p></div>
        </div>
        <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`Close ${title}`}><X className="h-4 w-4" /></button>
      </header>

      <form id={formId} onSubmit={onSubmit} className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
        {children}
      </form>

      <footer className="sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div>{secondaryAction}</div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-xl border border-slate-200 px-4 text-[11px] font-black text-slate-600">Cancel</button>
          <button type="submit" form={formId} disabled={saveDisabled || loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
            {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Save className="h-3.5 w-3.5" />}{saveLabel}
          </button>
        </div>
      </footer>
    </div>
  </div>
);
