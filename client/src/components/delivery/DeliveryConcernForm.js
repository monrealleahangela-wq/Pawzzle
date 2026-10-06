import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';

const INITIAL_CONCERN = { type: 'other', content: '' };

const DeliveryConcernForm = ({ onSubmit, onCancel, submitting = false }) => {
  const [concern, setConcern] = useState(INITIAL_CONCERN);

  const handleSubmit = async event => {
    event.preventDefault();
    const content = concern.content.trim();
    if (!content || submitting) return;
    await onSubmit({ ...concern, content });
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0 space-y-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-xs font-black text-slate-900 dark:text-white">Report delivery concern</h3>
          <p className="mt-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">Describe an issue that occurred after Rider pickup.</p>
        </div>
      </div>
      <div>
        <label htmlFor="delivery-concern-type" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Concern type</label>
        <select
          id="delivery-concern-type"
          value={concern.type}
          onChange={event => setConcern(current => ({ ...current, type: event.target.value }))}
          className="h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="suspicious_location">Location concern</option>
          <option value="damaged_items">Damaged items</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="delivery-concern-content" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">What happened?</label>
        <textarea
          id="delivery-concern-content"
          required
          maxLength={1000}
          value={concern.content}
          onChange={event => setConcern(current => ({ ...current, content: event.target.value }))}
          className="min-h-24 w-full min-w-0 resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          placeholder="Describe the concern"
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={submitting} className="min-h-11 rounded-xl border border-slate-300 px-4 text-xs font-black text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">Cancel</button>
        <button type="submit" disabled={submitting || !concern.content.trim()} className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-black text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit concern'}</button>
      </div>
    </form>
  );
};

export default DeliveryConcernForm;
