import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'react-toastify';
import { logisticsService } from '../../services/apiService';
import ModalViewport from '../ui/ModalViewport';
import DeliveryAddressInput from './DeliveryAddressInput';

const blankAddress = () => ({ formattedAddress: '' });
const requestKey = () => window.crypto?.randomUUID?.()
  || `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const initialForm = delivery => ({
  recipientName: delivery?.manualDelivery?.recipientName || '',
  recipientPhone: delivery?.manualDelivery?.recipientPhone || '',
  pickupAddress: delivery?.manualDelivery?.pickupAddress || blankAddress(),
  dropoffAddress: delivery?.manualDelivery?.dropoffAddress || blankAddress(),
  notes: delivery?.manualDelivery?.notes || '',
  idempotencyKey: delivery?.manualDelivery?.idempotencyKey || requestKey()
});

export default function ManualDeliveryForm({ delivery, onClose, onSaved, addressSuggestions = [] }) {
  const [form, setForm] = useState(() => initialForm(delivery));
  const [saving, setSaving] = useState(false);
  const editing = Boolean(delivery?._id);
  const titleId = useMemo(() => `manual-delivery-${editing ? 'edit' : 'create'}-title`, [editing]);
  const searchSuggestions = useMemo(() => async query => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return addressSuggestions.filter(address => String(address?.formattedAddress || '').toLowerCase().includes(needle)).slice(0, 8);
  }, [addressSuggestions]);

  const submit = async event => {
    event.preventDefault();
    if (form.pickupAddress.formattedAddress.trim().length < 5
      || form.dropoffAddress.formattedAddress.trim().length < 5) {
      toast.error('Enter complete pickup and drop-off addresses.');
      return;
    }
    setSaving(true);
    try {
      const response = editing
        ? await logisticsService.updateManualDelivery(delivery._id, form)
        : await logisticsService.createManualDelivery(form);
      toast.success(response.data.replayed ? 'Manual delivery already exists.' : `Manual delivery ${editing ? 'updated' : 'created'}.`);
      await onSaved(response.data.delivery);
    } catch (error) {
      toast.error(error.response?.data?.message || `Unable to ${editing ? 'update' : 'create'} the manual delivery.`);
    } finally {
      setSaving(false);
    }
  };

  return <ModalViewport onClose={() => !saving && onClose()} className="z-[2500] items-end p-0 sm:items-center sm:p-4">
    <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
      <header className="flex shrink-0 items-start justify-between border-b border-slate-200 p-4 dark:border-slate-700">
        <div><h2 id={titleId} className="text-lg font-black text-slate-900 dark:text-white">{editing ? 'Edit manual delivery' : 'New manual delivery'}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Addresses are saved exactly as entered; map data is stored only after a suggestion is selected.</p></div>
        <button type="button" aria-label="Close manual delivery form" onClick={onClose} disabled={saving} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X size={18}/></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Recipient name *<input required minLength={2} maxLength={160} value={form.recipientName} onChange={event => setForm(current => ({ ...current, recipientName: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Recipient phone *<input required minLength={7} maxLength={40} type="tel" value={form.recipientPhone} onChange={event => setForm(current => ({ ...current, recipientPhone: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        </div>
        <DeliveryAddressInput id="manual-pickup-address" label="Pickup address" required value={form.pickupAddress} searchSuggestions={searchSuggestions} onChange={pickupAddress => setForm(current => ({ ...current, pickupAddress }))}/>
        <DeliveryAddressInput id="manual-dropoff-address" label="Drop-off address" required value={form.dropoffAddress} searchSuggestions={searchSuggestions} onChange={dropoffAddress => setForm(current => ({ ...current, dropoffAddress }))}/>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Delivery notes<textarea maxLength={1000} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">Cancel</button>
        <button disabled={saving} className="h-11 rounded-xl bg-slate-900 px-5 text-xs font-black text-white disabled:opacity-50 dark:bg-primary-600">{saving ? 'Saving…' : editing ? 'Save changes' : 'Create delivery'}</button>
      </footer>
    </form>
  </ModalViewport>;
}
