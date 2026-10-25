import React, { useEffect, useState } from 'react';
import { purchaseOrderService } from '../../services/apiService';
import { formatPeso } from '../../utils/paymentSummary';
import { pawzzleConfirm } from '../../utils/pawzzleDialog';

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
    purchaseOrderService.compareOffers(storeProductId, { page, search, targetType }).then(response => {
      if (active) setData(response.data);
    }).catch(requestError => {
      if (active) setError(requestError.response?.data?.message || 'Unable to load supplier offers.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storeProductId, targetType, page, search, refresh]);

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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-3" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="supplier-comparison-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
          <div><h2 id="supplier-comparison-title" className="text-lg font-bold">{restockMode ? 'Order new stock' : 'Compare supplier offers'}</h2><p className="text-sm text-slate-600">{restockMode ? 'Choose an approved supplier offer. The quantity will remain unchanged until delivery passes receiving inspection.' : 'Exact and equivalent labels require a Store review. Candidates are not automatically interchangeable.'}</p></div>
          <button type="button" onClick={onClose} aria-label="Close supplier comparison" className="rounded border px-3 py-1">Close</button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block text-sm font-semibold">Inventory destination
            <select aria-label="Inventory destination" className="mt-1 w-full rounded border p-2" value={targetType} onChange={event => {
              setTargetType(event.target.value); setStoreProductId(''); setProductOptions([]);
              setProductSearch(''); setProductPage(1); setData(null);
            }}>
              <option value="product">Store product</option>
              <option value="service_supply">Service supply</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">Find a {targetType === 'service_supply' ? 'service supply' : 'Store product'}
            <input className="mt-1 w-full rounded border p-2" value={productSearch} onChange={event => { setProductSearch(event.target.value); setProductPage(1); }} maxLength={80} />
          </label>
          <label className="block text-sm font-semibold">{targetType === 'service_supply' ? 'Service supply' : 'Store product'}
            <select className="mt-1 w-full rounded border p-2" value={storeProductId} onChange={event => { setStoreProductId(event.target.value); setPage(1); }}>
              <option value="">Select a {targetType === 'service_supply' ? 'service supply' : 'Store product'}</option>
              {[...productOptions, ...[data?.storeProduct, ...(targetType === 'product' ? storeProducts : [])].filter((product, index, candidates) => product
                && String(product._id) === String(storeProductId)
                && !productOptions.some(option => String(option._id) === String(storeProductId))
                && candidates.findIndex(candidate => String(candidate?._id) === String(product._id)) === index)]
                .map(product => <option key={product._id} value={product._id}>{product.name} ({product.sku})</option>)}
            </select>
          </label>
          {productPagination?.totalPages > 1 && <nav aria-label="Store product pages" className="flex items-center gap-3 text-sm">
            <button type="button" disabled={productPage <= 1} onClick={() => setProductPage(value => value - 1)}>Previous products</button>
            <span>{productPage} / {productPagination.totalPages}</span>
            <button type="button" disabled={productPage >= productPagination.totalPages} onClick={() => setProductPage(value => value + 1)}>Next products</button>
          </nav>}
          <label className="block text-sm font-semibold">Filter supplier offers by name
            <input className="mt-1 w-full rounded border p-2" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} maxLength={80} />
          </label>
          {loading && <p role="status">Loading supplier offers...</p>}
          {error && <div role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error} <button type="button" onClick={() => setRefresh(value => value + 1)} className="underline">Retry</button></div>}
          {data && !loading && <>
            <p className="text-sm text-slate-600">{data.pagination?.total ?? data.offers.length} authorized supplier offer{(data.pagination?.total ?? data.offers.length) === 1 ? '' : 's'} for {data.storeProduct.name}. Stock and price are refreshed when the purchase request is submitted.</p>
            {!data.offers.length && <p className="rounded border p-4 text-sm">No matching-unit supplier offers are currently available.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {data.offers.map(offer => <article key={offer.supplierProductId} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{offer.name}</h3><p className="text-sm">{offer.supplier.businessName} Â· SKU {offer.sku}</p></div><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{offer.matchType === 'unverified_candidate' ? 'Unverified candidate' : `${offer.matchType} match`}</span></div>
                <p className="mt-2 text-sm">{formatPeso(offer.unitPrice)} / {offer.unitOfMeasure} Â· {offer.availableStock} available Â· Min {offer.minimumOrderQuantity} Â· Lead {offer.deliveryLeadTimeDays} days</p>
                {!offer.available && <p className="mt-1 text-sm text-amber-700">This supplier cannot fulfill its minimum quantity. Compare another offer.</p>}
                {offer.matchType === 'unverified_candidate' ? <div className="mt-3 flex gap-2">
                  <select aria-label={`Match classification for ${offer.name} from ${offer.supplier.businessName}`} value={matchTypes[offer.supplierProductId] || 'equivalent'} onChange={event => setMatchTypes(previous => ({ ...previous, [offer.supplierProductId]: event.target.value }))} className="min-w-0 flex-1 rounded border p-2 text-sm"><option value="equivalent">Equivalent substitute</option><option value="exact">Exact match</option></select>
                  <button type="button" disabled={busyId === offer.supplierProductId} onClick={() => confirmMatch(offer)} className="rounded bg-slate-800 px-3 py-2 text-sm text-white">Review match</button>
                </div> : <div className="mt-3 flex gap-2">
                  <input aria-label={`Quantity from ${offer.supplier.businessName}`} type="number" min={offer.minimumOrderQuantity} max={offer.availableStock} step="1" value={quantities[offer.supplierProductId] ?? offer.minimumOrderQuantity} onChange={event => setQuantities(previous => ({ ...previous, [offer.supplierProductId]: event.target.value }))} className="w-24 rounded border p-2 text-sm" />
                  <button type="button" disabled={!offer.available || busyId === offer.supplierProductId} onClick={() => addOffer(offer)} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-40">Add this supplier</button>
                </div>}
              </article>)}
            </div>
            {data.pagination?.totalPages > 1 && <nav aria-label="Supplier offer pages" className="flex items-center justify-center gap-3 text-sm">
              <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded border px-3 py-2 disabled:opacity-40">Previous</button>
              <span>Page {page} of {data.pagination.totalPages}</span>
              <button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)} className="rounded border px-3 py-2 disabled:opacity-40">Next</button>
            </nav>}
          </>}
        </div>
      </section>
    </div>
  );
};

export default SupplierOfferComparison;
