import React, { useMemo, useState } from 'react';
import { AlertTriangle, Camera, FileVideo, X } from 'lucide-react';
import { toast } from 'react-toastify';
import ModalViewport from '../ui/ModalViewport';
import { orderReturnService } from '../../services/apiService';

const ISSUE_TYPES = [
  ['damaged', 'Damaged'], ['wrong_item', 'Wrong Item'], ['missing_item', 'Missing Item'],
  ['defective', 'Defective'], ['not_as_described', 'Not as Described'],
  ['missing_parts', 'Missing Parts'], ['other', 'Other']
];

const RESOLUTIONS = [
  ['return_refund', 'Return & Refund'], ['replacement', 'Replacement'], ['refund_only', 'Refund Only']
];

export default function ReturnIssueModal({ orderId, item, onClose, onCreated }) {
  const [form, setForm] = useState({ issueType: 'damaged', requestedResolution: 'return_refund', description: '', quantity: 1 });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const previews = useMemo(() => files.map(file => ({ file, url: URL.createObjectURL(file) })), [files]);

  const chooseFiles = event => {
    const selected = Array.from(event.target.files || []);
    if (selected.length > 6) return toast.error('You can attach up to six photos or videos.');
    setFiles(selected);
  };

  const submit = async event => {
    event.preventDefault();
    if (form.description.trim().length < 3) return toast.error('Please describe the issue.');
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('itemId', item.orderItemId || item._id);
      body.append('quantity', String(form.quantity));
      body.append('issueType', form.issueType);
      body.append('requestedResolution', form.requestedResolution);
      body.append('description', form.description.trim());
      files.forEach(file => body.append('evidence', file));
      const response = await orderReturnService.request(orderId, body);
      toast.success(`Return case ${response.data.return?.caseId || ''} created.`);
      onCreated?.(response.data.return);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to report this issue.');
    } finally {
      setSubmitting(false);
    }
  };

  return <ModalViewport onClose={() => !submitting && onClose()} className="z-[1200] items-end p-0 sm:items-center sm:p-4">
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="return-issue-title" className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">
      <header className="flex shrink-0 items-start justify-between border-b border-slate-100 p-5">
        <div><p className="text-[10px] font-black uppercase tracking-[.25em] text-primary-700">Delivered item support</p><h2 id="return-issue-title" className="mt-1 text-xl font-black text-slate-900">Report an Issue</h2><p className="mt-1 text-sm text-slate-500">{item.name}</p></div>
        <button type="button" aria-label="Close issue report" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200"><X size={20}/></button>
      </header>
      <div className="space-y-4 overflow-y-auto p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">Issue type<select className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3" value={form.issueType} onChange={e=>setForm({...form,issueType:e.target.value})}>{ISSUE_TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-700">Requested resolution<select className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3" value={form.requestedResolution} onChange={e=>setForm({...form,requestedResolution:e.target.value})}>{RESOLUTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <label className="block text-xs font-bold text-slate-700">Quantity affected<input type="number" min="1" max={item.quantity} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3" value={form.quantity} onChange={e=>setForm({...form,quantity:Math.max(1,Math.min(item.quantity,Number(e.target.value)||1))})}/></label>
        <label className="block text-xs font-bold text-slate-700">What happened?<textarea required minLength="3" maxLength="2000" className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 p-3 text-sm" placeholder="Describe the condition, missing parts, or the item you received." value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/40 p-4 text-center"><div className="flex items-center justify-center gap-2 text-sm font-black text-primary-800"><Camera size={18}/><FileVideo size={18}/> Attach photos or videos</div><p className="mt-1 text-xs text-slate-500">Up to 6 JPG, PNG, WEBP, MP4, MOV, or WEBM files; 25 MB each.</p><input aria-label="Attach photos or videos" className="hidden" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" multiple onChange={chooseFiles}/></label>
        {previews.length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{previews.map(({file,url})=><div key={`${file.name}-${file.lastModified}`} className="aspect-square overflow-hidden rounded-xl border bg-slate-100">{file.type.startsWith('video/')?<video src={url} muted className="h-full w-full object-cover"/>:<img src={url} alt={file.name} className="h-full w-full object-cover"/>}</div>)}</div>}
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0"/><p>This request is subject to seller review and Pawzzle dispute rules. Reporting an issue does not create an immediate refund. You will see each approval, pickup, inspection, refund, or replacement step in the case timeline.</p></div>
      </div>
      <footer className="grid shrink-0 grid-cols-2 gap-3 border-t bg-white p-4"><button type="button" onClick={onClose} className="h-12 rounded-xl border border-slate-300 text-sm font-black">Cancel</button><button disabled={submitting} className="h-12 rounded-xl bg-primary-700 text-sm font-black text-white disabled:opacity-50">{submitting?'Submitting…':'Submit Issue'}</button></footer>
    </form>
  </ModalViewport>;
}
