import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { purchaseOrderService } from '../../services/apiService';
import { formatPeso } from '../../utils/paymentSummary';
import { pawzzleConfirm } from '../../utils/pawzzleDialog';
import ModalViewport from '../ui/ModalViewport';

const SupplierOfferComparison = ({ storeProducts, initialStoreProductId, onCartUpdated, onOfferAdded, onClose, restockMode = false }) => {
  const [targetType, setTargetType] = useState('product');
  const [storeProductId, setStoreProductId] = useState(initialStoreProductId || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [matchTypes, setMatchTypes] = useState({});
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productOptions, setProductOptions] = useState(storeProducts);
  const [productPagination, setProductPagination] = useState(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      purchaseOrderService.getProcurementStoreProducts({ search: productSearch, page: productPage, targetType })
        .then(response => {
          if (!active) return;
          setProductOptions(response.data.products || []);
          setProductPagination(response.data.pagination || null);
        }).catch(() => { if (active) setError('Unable to search Store products. Retry or choose a previously loaded product.'); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [productSearch, productPage, targetType]);

  useEffect(() => {
    if (!storeProductId) { setData(null); return undefined; }
    let active = true;
    setLoading(true);
    setError('');
    const loadOffers = restockMode ? purchaseOrderService.compareOffers : purchaseOrderService.compareSupplierOffers;
    loadOffers(storeProductId, { page, search, targetType }).then(response => {
      if (active) setData(response.data);
    }).catch(requestError => {
      if (active) setError(requestError.response?.data?.message || 'Unable to load supplier offers.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storeProductId, targetType, page, search, refresh, restockMode]);

  const confirmMatch = async offer => {
    const matchType = matchTypes[offer.supplierProductId] || 'equivalent';
    if (!await pawzzleConfirm(`Confirm that ${offer.supplier.businessName}'s ${offer.name} is an ${matchType} match for this Store product? This classification will be audited.`, {
      title: 'Confirm supplier match',
      confirmLabel: 'Confirm match',
      tone: 'warning'
    })) return;
    setBusyId(offer.supplierProductId);
    setError('');
    try {
      await purchaseOrderService.confirmOfferMatch({
        ...(targetType === 'service_supply' ? { serviceSupplyId: storeProductId } : { storeProductId }),
        targetType, supplierProductId: offer.supplierProductId, matchType, confirmMatch: true
      });
      setRefresh(value => value + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to confirm this supplier match.');
    } finally { setBusyId(null); }
  };

  const addOffer = async offer => {
    const quantity = Number(quantities[offer.supplierProductId] ?? offer.minimumOrderQuantity);
    if (!Number.isInteger(quantity) || quantity < offer.minimumOrderQuantity || quantity > offer.availableStock) {
      setError(`Enter a whole quantity between ${offer.minimumOrderQuantity} and ${offer.availableStock}.`);
      return;
    }
    if (!await pawzzleConfirm(`Add ${quantity} ${offer.unitOfMeasure} from ${offer.supplier.businessName} at ${formatPeso(offer.unitPrice)} each? This will not replace any other supplier's cart line.`, {
      title: 'Add supplier offer?',
      confirmLabel: 'Add to cart'
    })) return;
    setBusyId(offer.supplierProductId);
    setError('');
    try {
      const response = await purchaseOrderService.addCartItem(offer.supplierProductId, quantity, {
        ...(targetType === 'service_supply' ? { serviceSupplyId: storeProductId } : { storeProductId }),
        confirmSelection: true
      });
      onCartUpdated(response.data);
      onOfferAdded?.(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to add this supplier offer.');
    } finally { setBusyId(null); }
  };

  return (
    <ModalViewport onClose={onClose} className="z-[1300] items-end p-0 sm:items-center sm:p-3">
      <section role="dialog" aria-modal="true" aria-labelledby="supplier-comparison-title" className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-2xl">
        <header className="z-10 flex shrink-0 items-start justify-between gap-3 border-b bg-white px-4 py-3">
          <div className="min-w-0"><h2 id="supplier-comparison-title" className="text-base font-black text-slate-900 sm:text-lg">{restockMode ? 'Order new stock' : 'Compare supplier offers'}</h2><p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-slate-600">{restockMode ? 'Choose an approved supplier offer. The quantity will remain unchanged until delivery passes receiving inspection.' : 'Review exact and equivalent matches before adding a supplier offer.'}</p></div>
          <button type="button" onClick={onClose} aria-label="Close supplier comparison" title="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-bold text-slate-700">Add stock to
            <select aria-label="Inventory destination" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" value={targetType} onChange={event => {
              setTargetType(event.target.value); setStoreProductId(''); setProductOptions([]);
              setProductSearch(''); setProductPage(1); setData(null);
            }}>
              <option value="product">Store product</option>
              <option value="service_supply">Service supply</option>
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-700">Search your {targetType === 'service_supply' ? 'service supplies' : 'inventory'}
            <input aria-label={`Find a ${targetType === 'service_supply' ? 'service supply' : 'Store product'}`} placeholder="Type a product name or SKU" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={productSearch} onChange={event => { setProductSearch(event.target.value); setProductPage(1); }} maxLength={80} />
          </label>
          <label className="block text-xs font-bold text-slate-700">{targetType === 'service_supply' ? 'Supply to restock' : 'Product to restock'}
            <select aria-label={targetType === 'service_supply' ? 'Service supply' : 'Store product'} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" value={storeProductId} onChange={event => { setStoreProductId(event.target.value); setPage(1); }}>
              <option value="">Select a {targetType === 'service_supply' ? 'service supply' : 'Store product'}</option>
              {[...productOptions, ...[data?.storeProduct, ...(targetType === 'product' ? storeProducts : [])].filter((product, index, candidates) => product
                && String(product._id) === String(storeProductId)
                && !productOptions.some(option => String(option._id) === String(storeProductId))
                && candidates.findIndex(candidate => String(candidate?._id) === String(product._id)) === index)]
                .map(product => <option key={product._id} value={product._id}>{product.name} ({product.sku})</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-700">Search supplier offers
            <input aria-label="Filter supplier offers by name" placeholder="Type a supplier or product name" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} maxLength={80} />
          </label>
          </div>
          {productPagination?.totalPages > 1 && <nav aria-label="Store product pages" className="flex items-center justify-end gap-3 text-xs text-slate-600">
            <button type="button" disabled={productPage <= 1} onClick={() => setProductPage(value => value - 1)} className="font-bold disabled:opacity-40">Previous products</button>
            <span>{productPage} / {productPagination.totalPages}</span>
            <button type="button" disabled={productPage >= productPagination.totalPages} onClick={() => setProductPage(value => value + 1)} className="font-bold disabled:opacity-40">Next products</button>
          </nav>}
          {loading && <p role="status" className="text-xs text-slate-600">Loading supplier offers...</p>}
          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">{error} <button type="button" onClick={() => setRefresh(value => value + 1)} className="font-bold underline">Retry</button></div>}
          {data && !loading && <>
            <p className="text-xs text-slate-600"><b className="text-slate-800">{data.pagination?.total ?? data.offers.length} authorized offer{(data.pagination?.total ?? data.offers.length) === 1 ? '' : 's'}</b> for {data.storeProduct.name}. Stock and price are rechecked when you submit the purchase request.</p>
            {!data.offers.length && <p className="rounded-lg border p-3 text-xs">No matching supplier offers are currently available.</p>}
            <div className="grid gap-2.5 sm:grid-cols-2">
              {data.offers.map(offer => <article key={offer.supplierProductId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900">{offer.name}</h3><p className="text-xs text-slate-600">{offer.supplier.businessName} · SKU {offer.sku}</p></div><span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-700">{offer.matchType === 'unverified_candidate' ? 'Unverified candidate' : `${offer.matchType} match`}</span></div>
                <p className="mt-1.5 text-xs text-slate-700">{formatPeso(offer.unitPrice)} / {offer.unitOfMeasure} · {offer.availableStock} available · Min {offer.minimumOrderQuantity} · {offer.deliveryLeadTimeDays}-day lead</p>
                {!offer.available && <p className="mt-1 text-xs text-amber-700">This supplier cannot fulfill its minimum quantity. Compare another offer.</p>}
                {offer.matchType === 'unverified_candidate' ? <div className="mt-2.5 flex gap-2">
                  <select aria-label={`Match classification for ${offer.name} from ${offer.supplier.businessName}`} value={matchTypes[offer.supplierProductId] || 'equivalent'} onChange={event => setMatchTypes(previous => ({ ...previous, [offer.supplierProductId]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-xs"><option value="equivalent">Equivalent substitute</option><option value="exact">Exact match</option></select>
                  <button type="button" disabled={busyId === offer.supplierProductId} onClick={() => confirmMatch(offer)} className="h-9 shrink-0 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white disabled:opacity-40">Review match</button>
                </div> : <div className="mt-2.5 flex gap-2">
                  <input aria-label={`Quantity from ${offer.supplier.businessName}`} type="number" min={offer.minimumOrderQuantity} max={offer.availableStock} step="1" value={quantities[offer.supplierProductId] ?? offer.minimumOrderQuantity} onChange={event => setQuantities(previous => ({ ...previous, [offer.supplierProductId]: event.target.value }))} className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-xs" />
                  <button type="button" disabled={!offer.available || busyId === offer.supplierProductId} onClick={() => addOffer(offer)} className="h-9 flex-1 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-40">Add this supplier</button>
                </div>}
              </article>)}
            </div>
            {data.pagination?.totalPages > 1 && <nav aria-label="Supplier offer pages" className="flex items-center justify-center gap-3 text-xs">
              <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="h-9 rounded-lg border px-3 font-bold disabled:opacity-40">Previous</button>
              <span>Page {page} of {data.pagination.totalPages}</span>
              <button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)} className="h-9 rounded-lg border px-3 font-bold disabled:opacity-40">Next</button>
            </nav>}
          </>}
        </div>
      </section>
    </ModalViewport>
  );
};

export default SupplierOfferComparison;
