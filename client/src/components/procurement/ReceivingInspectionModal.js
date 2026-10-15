import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, Link2, PackagePlus, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { purchaseOrderService } from '../../services/apiService';
import { PRODUCT_CATEGORIES } from '../../constants/productCategories';

const productId = value => String(value?._id || value || '');
const emptyCreation = { name: '', category: '', description: '', shortDescription: '', price: '', sku: '', unit: '', weight: '', weightUnit: 'kg' };

const ReceivingInspectionModal = ({
  order,
  form,
  setForm,
  submitting,
  resolution,
  onClose,
  onSubmit,
  onProductLinked
}) => {
  const [linksByItem, setLinksByItem] = useState({});
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [linkError, setLinkError] = useState('');
  const [savingLink, setSavingLink] = useState('');
  const [creation, setCreation] = useState(null);
  const [creationForm, setCreationForm] = useState(emptyCreation);
  const [creatingProduct, setCreatingProduct] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingLinks(true);
    setLinkError('');
    purchaseOrderService.getReceivingProductLinks(order._id)
      .then(response => {
        if (!active) return;
        setLinksByItem(Object.fromEntries((response.data.items || []).map(item => [String(item.purchaseOrderItem), item])));
      })
      .catch(error => {
        if (!active) return;
        setLinkError(error.response?.data?.message || 'Unable to load Store product linking options.');
      })
      .finally(() => active && setLoadingLinks(false));
    return () => { active = false; };
  }, [order._id]);

  const visibleItems = useMemo(() => (
    (order.items || []).filter(item => Object.prototype.hasOwnProperty.call(form.items, item._id))
  ), [form.items, order.items]);

  const updateItem = (itemId, key, value) => setForm(previous => ({
    ...previous,
    items: { ...previous.items, [itemId]: { ...previous.items[itemId], [key]: value } }
  }));

  const updateLinkedProduct = (itemId, product, source = 'explicit') => {
    setLinksByItem(previous => ({
      ...previous,
      [String(itemId)]: {
        ...(previous[String(itemId)] || {}),
        linkedProduct: product,
        linkSource: source,
        eligibleProducts: [
          product,
          ...((previous[String(itemId)]?.eligibleProducts || []).filter(candidate => productId(candidate) !== productId(product)))
        ]
      }
    }));
    onProductLinked?.(itemId, product);
  };

  const linkExistingProduct = async (itemId, storeProductId) => {
    if (!storeProductId) return;
    setSavingLink(String(itemId));
    try {
      const response = await purchaseOrderService.linkReceivingStoreProduct(order._id, itemId, storeProductId);
      updateLinkedProduct(itemId, response.data.product);
      toast.success('Store product linked. Your inspection draft was preserved.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to link this Store product.');
    } finally {
      setSavingLink('');
    }
  };

  const openProductCreation = item => {
    const link = linksByItem[String(item._id)] || {};
    const suggestions = link.suggestions || {};
    setCreation({ item, link });
    setCreationForm({
      ...emptyCreation,
      name: suggestions.name || item.productName || '',
      category: suggestions.category || '',
      description: suggestions.description || '',
      unit: suggestions.unit || ''
    });
  };

  const createProduct = async event => {
    event.preventDefault();
    setCreatingProduct(true);
    try {
      const response = await purchaseOrderService.createReceivingStoreProduct(order._id, creation.item._id, creationForm);
      updateLinkedProduct(creation.item._id, response.data.product, response.data.created ? 'created' : 'reused');
      setCreation(null);
      toast.success(response.data.message || 'Draft Store product linked for receiving.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to create the draft Store product.');
    } finally {
      setCreatingProduct(false);
    }
  };

  const missingLinkItems = visibleItems.filter(item => {
    if (item.itemType === 'live_pet' || item.serviceSupply) return false;
    const row = form.items[item._id] || {};
    const accepted = Number(row.receivedQuantity || 0) - Number(row.damagedQuantity || 0) - Number(row.incorrectQuantity || 0);
    const link = linksByItem[String(item._id)];
    return accepted > 0 && !link?.linkedProduct && !item.storeProduct;
  });
  const linkStateUnavailable = visibleItems.some(item => item.itemType !== 'live_pet') && (loadingLinks || Boolean(linkError));

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-900/70 p-2" role="dialog" aria-modal="true" aria-label={`Receiving inspection ${order.orderNumber}`}>
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b p-5">
          <div><h3 className="text-base font-black">Receiving inspection</h3><p className="mt-1 text-[10px] text-slate-500">{order.orderNumber} · {order.supplier?.businessName}</p></div>
          <button type="button" aria-label="Close receiving inspection" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {linkError && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700"><AlertTriangle className="h-4 w-4 shrink-0" />{linkError}</div>}
          {visibleItems.map(item => {
            const row = form.items[item._id] || {};
            const link = linksByItem[String(item._id)] || {};
            const linkedId = productId(link.linkedProduct || item.storeProduct);
            return (
              <section key={item._id} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-xs font-black">{item.productName}</p><p className="text-[9px] text-slate-500">Expected: {item.quantity} {item.itemType === 'live_pet' ? 'specific animal' : 'units'}</p></div>
                  {item.itemType === 'live_pet' && <span className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black uppercase text-amber-800">Live pet · max 1</span>}
                </div>
                {item.serviceSupply && <p className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">Accepted units will be added to service supply <strong>{link.serviceSupply?.name || item.serviceSupply?.name || 'selected supply'}</strong> in this Store.</p>}
                {item.itemType !== 'live_pet' && !item.serviceSupply && <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <div className="flex items-start gap-2"><Link2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><div><p className="text-[10px] font-black uppercase text-indigo-900">Inventory destination required</p><p className="mt-1 text-[10px] text-indigo-700">Accepted units need a compatible product in this Store. Link an existing product or create an unpublished draft without losing this inspection.</p></div></div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select aria-label={`Store product for ${item.productName}`} value={linkedId} disabled={loadingLinks || link.linkLocked || savingLink === String(item._id)} onChange={event => linkExistingProduct(item._id, event.target.value)} className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold disabled:opacity-60">
                      <option value="">{loadingLinks ? 'Loading eligible products...' : 'Select an eligible Store product'}</option>
                      {(link.eligibleProducts || []).map(product => <option key={product._id} value={product._id}>{product.name} · {product.sku} · Stock {product.stockQuantity}</option>)}
                    </select>
                    <button type="button" disabled={loadingLinks || link.linkLocked} onClick={() => openProductCreation(item)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"><PackagePlus className="h-4 w-4" />Create New Store Product</button>
                  </div>
                  {linkedId && <p className="mt-2 text-[9px] font-bold text-emerald-700">Linked to {link.linkedProduct?.name || item.storeProduct?.name || 'Store product'}{link.linkSource === 'sku_match' ? ' through an existing same-SKU match' : ''}.</p>}
                  {!loadingLinks && !linkedId && (link.eligibleProducts || []).length === 0 && <p className="mt-2 text-[9px] font-bold text-amber-700">No compatible active Store product exists yet. Create a draft product to continue.</p>}
                </div>}
                <div className="grid grid-cols-3 gap-2">{[['receivedQuantity','Received'],['damagedQuantity','Damaged'],['incorrectQuantity','Incorrect']].map(([key,label]) => <label key={key} className="text-[8px] font-black uppercase text-slate-500">{label}<input type="number" min="0" max={item.itemType === 'live_pet' ? 1 : item.quantity} value={row[key] ?? 0} onChange={event => updateItem(item._id, key, Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" /></label>)}</div>
                <textarea aria-label={`Notes for ${item.productName}`} placeholder="Item notes (optional)" value={row.notes || ''} onChange={event => updateItem(item._id, 'notes', event.target.value)} className="mt-3 min-h-16 w-full rounded-lg border border-slate-200 p-2 text-xs" />
              </section>
            );
          })}
          <label className="block text-[9px] font-black uppercase text-slate-500">Overall notes<textarea value={form.notes} onChange={event => setForm(previous => ({ ...previous, notes: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-xs" /></label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-xs font-bold text-slate-600"><Camera className="h-4 w-4" /> Attach receiving photos<input type="file" multiple accept="image/*" className="hidden" onChange={event => setForm(previous => ({ ...previous, photos: Array.from(event.target.files || []) }))} /></label>
          {form.photos.length > 0 && <p className="text-[9px] text-slate-500">{form.photos.length} photo{form.photos.length === 1 ? '' : 's'} selected</p>}
          {missingLinkItems.length > 0 && !loadingLinks && <p className="rounded-xl bg-amber-50 p-3 text-[10px] font-bold text-amber-800">Link or create a Store product for: {missingLinkItems.map(item => item.productName).join(', ')}.</p>}
        </div>
        <footer className="flex gap-2 border-t p-4"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500">Cancel</button><button type="button" disabled={submitting || linkStateUnavailable || missingLinkItems.length > 0} onClick={onSubmit} className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{submitting ? 'Recording...' : resolution ? 'Submit Reinspection Report' : 'Submit Inspection Report'}</button></footer>
      </div>

      {creation && <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/70 p-3" role="dialog" aria-modal="true" aria-label="Create New Store Product">
        <form onSubmit={createProduct} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3"><div><h4 className="text-base font-black">Create New Store Product</h4><p className="mt-1 text-xs text-slate-500">This creates an unpublished draft linked to {creation.item.productName}. Receiving adds stock, but customers cannot see or buy it until you explicitly publish it.</p></div><button type="button" aria-label="Back to receiving inspection" onClick={() => setCreation(null)}><X className="h-5 w-5" /></button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">Product name<input required value={creationForm.name} onChange={event => setCreationForm(current => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <label className="text-xs font-bold text-slate-700">Category<select required value={creationForm.category} onChange={event => setCreationForm(current => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Select category</option>{PRODUCT_CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-700">Store SKU<input required value={creationForm.sku} onChange={event => setCreationForm(current => ({ ...current, sku: event.target.value }))} placeholder="Enter your Store SKU" className="mt-1 w-full rounded-lg border px-3 py-2" /><span className="mt-1 block text-[9px] font-normal text-slate-500">Supplier SKU {creation.link.suggestions?.supplierSku || 'not provided'} is shown for reference and is not copied automatically.</span></label>
            <label className="text-xs font-bold text-slate-700">Selling price<input required type="number" min="0.01" step="0.01" value={creationForm.price} onChange={event => setCreationForm(current => ({ ...current, price: event.target.value }))} placeholder={creation.link.suggestions?.supplierRetailPrice ? `Supplier suggestion: ${creation.link.suggestions.supplierRetailPrice}` : 'Enter selling price'} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <label className="text-xs font-bold text-slate-700">Selling unit<select required value={creationForm.unit} onChange={event => setCreationForm(current => ({ ...current, unit: event.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Select unit</option>{['piece','pack','box','bottle','bag','kg'].map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-700">Package weight (optional)<span className="mt-1 grid grid-cols-[1fr_auto] gap-2"><input type="number" min="0.001" max="10000" step="0.001" value={creationForm.weight} onChange={event => setCreationForm(current => ({ ...current, weight: event.target.value }))} className="w-full rounded-lg border px-3 py-2" /><select value={creationForm.weightUnit} onChange={event => setCreationForm(current => ({ ...current, weightUnit: event.target.value }))} className="rounded-lg border px-3 py-2"><option value="g">g</option><option value="kg">kg</option></select></span></label>
            <label className="text-xs font-bold text-slate-700 sm:col-span-2">Short description<input required value={creationForm.shortDescription} onChange={event => setCreationForm(current => ({ ...current, shortDescription: event.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <label className="text-xs font-bold text-slate-700 sm:col-span-2">Description<textarea required value={creationForm.description} onChange={event => setCreationForm(current => ({ ...current, description: event.target.value }))} className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2" /></label>
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[10px] text-slate-600">{creation.link.suggestions?.supplierImageCount > 0 ? `${creation.link.suggestions.supplierImageCount} supplier-provided image(s) will be copied to the draft.` : 'The supplier did not provide images. Add Store product images before publishing.'}</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreation(null)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-500">Back to Inspection</button><button disabled={creatingProduct} className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-black text-white disabled:opacity-50">{creatingProduct ? 'Creating...' : 'Create Draft & Link'}</button></div>
        </form>
      </div>}
    </div>
  );
};

export default ReceivingInspectionModal;
