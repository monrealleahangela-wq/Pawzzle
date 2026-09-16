import React from 'react';
import { Link } from 'react-router-dom';
import { Save, Truck, Zap } from 'lucide-react';
import { formatPeso } from '../../utils/paymentSummary';

const deliveryFields = [
  ['baseFee', 'Base delivery fee', 'PHP'],
  ['includedKilometers', 'Included distance', 'km'],
  ['ratePerKilometer', 'Additional distance rate', 'PHP / km'],
  ['additionalItemFee', 'Additional item fee', 'PHP / item'],
  ['minimumFee', 'Minimum delivery fee', 'PHP'],
  ['maximumFee', 'Maximum delivery fee (optional)', 'PHP'],
  ['maximumDistanceKm', 'Maximum delivery distance', 'km']
];

const statusLabel = status => ({
  active: 'Active',
  inactive: 'Inactive',
  origin_required: 'Location required',
  not_configured: 'Not configured'
}[status] || 'Not configured');

const DeliveryPricingSettings = ({
  pricing,
  setPricing,
  status,
  origin,
  hasMapLocation,
  preview,
  fieldErrors,
  loading,
  onSave
}) => (
  <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40"><Truck className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Delivery Pricing</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Rates used by new home-delivery quotes.</p>
        </div>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : status === 'origin_required' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
        {statusLabel(status)}
      </span>
    </div>

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Store delivery origin</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {[origin?.address?.street, origin?.address?.barangay, origin?.address?.city, origin?.address?.state, origin?.address?.zipCode].filter(Boolean).join(', ') || 'Store address is incomplete.'}
          </p>
          <p className={`mt-1 text-xs font-semibold ${hasMapLocation ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {hasMapLocation ? 'Map location confirmed' : 'Map location needs confirmation'}
          </p>
        </div>
        {!hasMapLocation && <Link to="/admin/store" className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 dark:text-amber-200">Confirm location</Link>}
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Home delivery</p>
        <p className="text-xs text-slate-500">Checkout uses only an active, saved rule.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={pricing.enabled}
        onClick={() => setPricing(current => ({ ...current, enabled: !current.enabled }))}
        className={`relative h-7 w-12 rounded-full transition ${pricing.enabled ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${pricing.enabled ? 'left-6' : 'left-1'}`} />
        <span className="sr-only">Enable home delivery</span>
      </button>
    </div>

    {pricing.enabled && (
      <>
        <div className="rounded-xl bg-primary-50 p-3 text-sm text-primary-900 dark:bg-primary-950/30 dark:text-primary-100">
          Delivery fee = base fee + distance beyond the included kilometers + each item after the first. Minimum and maximum limits apply when configured.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {deliveryFields.map(([field, label, suffix]) => (
            <label key={field} className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {label}
              <div className={`mt-1 flex h-10 items-center rounded-xl border bg-white px-3 dark:bg-slate-950 ${fieldErrors[field] ? 'border-red-400' : 'border-slate-300 dark:border-slate-700'}`}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricing[field] ?? ''}
                  onChange={(event) => setPricing(current => ({ ...current, [field]: event.target.value }))}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white"
                />
                <span className="ml-2 shrink-0 text-xs text-slate-400">{suffix}</span>
              </div>
              {fieldErrors[field] && <span className="mt-1 block text-xs font-normal text-red-600 dark:text-red-300">{fieldErrors[field]}</span>}
            </label>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Server-calculated example</p>
          <p className="text-xs text-slate-500">5 km delivery • 3 total items</p>
          {preview?.valid ? (
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <span>Base fee <strong className="float-right">{formatPeso(preview.breakdown?.baseFee)}</strong></span>
              <span>Distance charge <strong className="float-right">{formatPeso(preview.breakdown?.distanceCharge)}</strong></span>
              <span>Additional items <strong className="float-right">{formatPeso(preview.breakdown?.itemCharge)}</strong></span>
              <span className="font-bold text-primary-700 dark:text-primary-300">Estimated delivery fee <strong className="float-right">{formatPeso(preview.finalShippingFee)}</strong></span>
            </div>
          ) : <p className="mt-2 text-xs text-slate-500">Complete the required pricing fields to see an estimate.</p>}
        </div>
      </>
    )}

    {!hasMapLocation && pricing.enabled && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Confirm the Store map location before activating home delivery.</p>}
    <button
      onClick={onSave}
      disabled={loading || (pricing.enabled && !hasMapLocation) || (!pricing.enabled && ['not_configured', 'inactive'].includes(status))}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-primary-600 dark:hover:bg-primary-500"
    >
      {loading ? <Zap className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {pricing.enabled ? (status === 'active' ? 'Update Delivery Pricing' : 'Activate Delivery Pricing') : 'Disable Home Delivery'}
    </button>
  </div>
);

export default DeliveryPricingSettings;
