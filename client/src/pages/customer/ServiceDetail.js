import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Home,
  MapPin,
  RefreshCcw,
  ShieldCheck,
  Store as StoreIcon
} from 'lucide-react';
import { getImageUrl, serviceService } from '../../services/apiService';
import { getCategoryLabel } from '../../constants/serviceCategories';
import { formatPeso } from '../../utils/paymentSummary';
import { normalizeServiceDetail } from '../../utils/customerServiceData';

const ServiceDetailSkeleton = () => (
  <div className="mx-auto max-w-5xl animate-pulse space-y-5" aria-label="Loading service details">
    <div className="h-5 w-28 rounded bg-slate-100 dark:bg-slate-800" />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
      <div className="h-80 rounded-2xl bg-slate-100 dark:bg-slate-800" />
      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="h-4 w-32 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-8 w-4/5 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-16 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  </div>
);

const ServiceDetail = () => {
  const { id } = useParams();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadService = useCallback(async () => {
    if (!id) {
      setError({ title: 'Service not found', message: 'This service link is incomplete.' });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await serviceService.getServiceById(id);
      const normalized = normalizeServiceDetail(response.data);
      if (!normalized?._id || !normalized.store || normalized.isDeleted || !normalized.isActive) {
        throw Object.assign(new Error('Service data is incomplete or unavailable.'), { customerUnavailable: true });
      }
      setService(normalized);
    } catch (requestError) {
      console.error('Unable to load customer service detail:', requestError);
      const unavailable = requestError.response?.status === 404 || requestError.customerUnavailable;
      setService(null);
      setError({
        title: unavailable ? 'Service unavailable' : 'Unable to load this service',
        message: unavailable
          ? 'This service may be inactive or no longer offered by the store.'
          : 'Please check your connection and try again.'
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadService();
  }, [loadService]);

  if (loading) return <ServiceDetailSkeleton />;

  if (error || !service) {
    return (
      <section className="mx-auto flex min-h-[55vh] max-w-lg items-center px-4 py-10">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <AlertCircle className="mx-auto h-10 w-10 text-primary-600" />
          <h1 className="mt-3 text-xl font-black text-slate-900 dark:text-slate-100">{error?.title || 'Service unavailable'}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error?.message || 'Unable to load this service right now.'}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={loadService} className="btn btn-primary inline-flex items-center justify-center gap-2">
              <RefreshCcw className="h-4 w-4" /> Retry
            </button>
            <Link to="/services" className="btn btn-outline inline-flex items-center justify-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Services
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const address = service.store?.contactInfo?.address;
  const location = [address?.branch, address?.street, address?.city].filter(Boolean).join(', ');
  const image = service.images[0];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-20">
      <Link to="/services" className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-primary-700 dark:text-slate-300">
        <ArrowLeft className="h-4 w-4" /> Back to Services
      </Link>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="relative flex min-h-64 items-center justify-center bg-primary-50 dark:bg-primary-950/30 sm:min-h-80">
            {image ? (
              <img src={getImageUrl(image)} alt={service.name} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <CalendarDays className="h-16 w-16 text-primary-300 dark:text-primary-700" aria-label="No service image" />
            )}
            <span className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-lg bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-primary-800 shadow-sm backdrop-blur dark:bg-slate-900/90 dark:text-primary-200">
              {getCategoryLabel(service.category)}
            </span>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <h1 className="break-words text-2xl font-black leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">{service.name}</h1>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {service.description || 'The store has not added a description for this service yet.'}
              </p>
            </div>

            {service.requirements.length > 0 && (
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Before your appointment</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {service.requirements.map((requirement, index) => (
                    <li key={`${requirement}-${index}`} className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                      <span>{requirement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:sticky lg:top-24">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Starting price</p>
            <p className="mt-1 text-2xl font-black text-primary-700 dark:text-primary-300">{formatPeso(service.price, 'Price unavailable')}</p>
          </div>

          <dl className="grid gap-3 text-sm">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <Clock className="h-5 w-5 shrink-0 text-primary-600" />
              <div><dt className="text-[9px] font-black uppercase text-slate-400">Duration</dt><dd className="font-bold text-slate-800 dark:text-slate-100">{service.duration ? `${service.duration} minutes` : 'Ask the store'}</dd></div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              {service.homeServiceAvailable ? <Home className="h-5 w-5 shrink-0 text-primary-600" /> : <StoreIcon className="h-5 w-5 shrink-0 text-primary-600" />}
              <div><dt className="text-[9px] font-black uppercase text-slate-400">Appointment type</dt><dd className="font-bold text-slate-800 dark:text-slate-100">{service.homeServiceAvailable ? 'Store or home service' : 'In-store service'}</dd></div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
              <div className="min-w-0"><dt className="text-[9px] font-black uppercase text-slate-400">Store and branch</dt><dd className="break-words font-bold text-slate-800 dark:text-slate-100">{service.store.name}</dd><dd className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{location || 'Location details unavailable'}</dd></div>
            </div>
          </dl>

          <Link to={`/bookings?service=${service._id}`} className="btn btn-primary flex w-full items-center justify-center gap-2 py-3">
            <CalendarDays className="h-4 w-4" /> Request an Appointment
          </Link>
          {service.store?._id && (
            <Link to={`/stores/${service.store._id}`} className="btn btn-outline flex w-full items-center justify-center gap-2 py-3">
              <StoreIcon className="h-4 w-4" /> View Store
            </Link>
          )}
          <p className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600" />
            The store reviews your request and sends the final schedule and assigned specialist before payment.
          </p>
        </aside>
      </div>
    </main>
  );
};

export default ServiceDetail;

