import React from 'react';
import { Eye, Image as ImageIcon, Info, Package, SlidersHorizontal, Tag, Upload, X } from 'lucide-react';
import { getImageUrl } from '../../services/apiService';
import {
  CompactFormModal,
  CompactFormSection,
  CompactToggle,
  CompactUploadCard,
  RequiredMark,
  compactInputClass,
  compactTextareaClass
} from './CompactEntityForm';

const ProductFormModal = ({ editingProduct, form, setForm, onClose, onSubmit, onImageUpload, loading, onAdvanced }) => {
  const image = form.images?.[0];
  const priceValid = Number(form.price) > 0;
  const stockValid = form.stockQuantity !== '' && Number(form.stockQuantity) >= 0;
  const complete = Boolean(form.name?.trim() && form.category && priceValid && stockValid && form.description?.trim() && image);

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  return (
    <CompactFormModal
      title={editingProduct ? 'Edit Product' : 'Add Product'}
      subtitle="Required fields are marked with *"
      icon={Package}
      formId="compactProductForm"
      onClose={onClose}
      onSubmit={onSubmit}
      saveDisabled={!complete}
      loading={loading}
      saveLabel={editingProduct ? 'Save Changes' : 'Save Product'}
      secondaryAction={<button type="button" onClick={onAdvanced} className="h-9 rounded-xl px-3 text-[10px] font-black text-primary-700 hover:bg-primary-50"><SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" />Advanced options</button>}
    >
      <CompactFormSection step="1" icon={ImageIcon} title="Product Images" description="The first image is the customer-facing cover. Add up to 10 views.">
        <CompactUploadCard
          title="Product Image"
          required
          value={image}
          preview={image ? getImageUrl(image) : ''}
          loading={loading}
          onFiles={files => onImageUpload(files, true)}
          onRemove={() => set('images', (form.images || []).slice(1))}
        />
        {!image && <p className="mt-2 text-[11px] font-semibold text-rose-600">Product image is required.</p>}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(form.images || []).slice(1).map((item, index) => (
            <div key={`${item}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img src={getImageUrl(item)} alt={`Product view ${index + 2}`} className="h-full w-full object-cover" />
              <div className="absolute inset-x-1 bottom-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button type="button" onClick={() => set('images', [item, ...form.images.filter((_, itemIndex) => itemIndex !== index + 1)])} className="flex-1 rounded-lg bg-slate-950/80 py-1 text-[7px] font-black uppercase text-white">Cover</button>
                <button type="button" aria-label="Remove image" onClick={() => set('images', form.images.filter((_, itemIndex) => itemIndex !== index + 1))} className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-600/90 text-white"><X className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
          {(form.images || []).length < 10 && <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-[8px] font-black uppercase text-slate-500 hover:bg-primary-50"><Upload className="mb-1 h-4 w-4" />Add views<input type="file" multiple accept="image/*" className="sr-only" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) onImageUpload(files, false); event.target.value = ''; }} /></label>}
        </div>
      </CompactFormSection>

      <CompactFormSection step="2" icon={Info} title="Basic Information" description="Core catalog information appears on the customer product page.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Product Name<RequiredMark /><input value={form.name} onChange={event => set('name', event.target.value)} className={compactInputClass} placeholder="Product name" />{!form.name?.trim() && <span className="mt-1 block text-[10px] text-rose-600">Product name is required.</span>}</label>
          <label className="text-[11px] font-bold text-slate-700">Category<RequiredMark /><select value={form.category} onChange={event => set('category', event.target.value)} className={compactInputClass}><option value="Pet Food">Pet Food</option><option value="Pet Accessories">Pet Accessories</option><option value="Pet Clothing and Accessories">Pet Clothing and Accessories</option><option value="Pet Health Care">Pet Health Care</option><option value="Others">Others</option></select></label>
          <label className="text-[11px] font-bold text-slate-700">Brand <span className="font-normal text-slate-400">(optional)</span><input value={form.brand || ''} onChange={event => set('brand', event.target.value)} className={compactInputClass} placeholder="Brand" /></label>
          <label className="text-[11px] font-bold text-slate-700">SKU <span className="font-normal text-slate-400">(optional)</span><input value={form.sku || ''} onChange={event => set('sku', event.target.value)} className={compactInputClass} placeholder="Generated automatically if blank" /></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Barcode <span className="font-normal text-slate-400">(optional)</span><input value={form.barcode || ''} onChange={event => set('barcode', event.target.value)} className={compactInputClass} placeholder="UPC, EAN, or internal barcode" /></label>
        </div>
      </CompactFormSection>

      <CompactFormSection step="3" icon={Tag} title="Description" description="Keep the customer-facing description useful and concise.">
        <label className="text-[11px] font-bold text-slate-700">Product Description<RequiredMark /><textarea rows="4" value={form.description} onChange={event => set('description', event.target.value)} className={compactTextareaClass} placeholder="Describe the product, its intended use, and important details." />{!form.description?.trim() && <span className="mt-1 block text-[10px] text-rose-600">Product description is required.</span>}</label>
      </CompactFormSection>

      <CompactFormSection step="4" icon={Package} title="Pricing & Inventory" description="Set the selling price and current stock information.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Price (₱)<RequiredMark /><input type="number" min="0.01" step="0.01" value={form.price} onChange={event => set('price', event.target.value)} className={compactInputClass} placeholder="0.00" />{!priceValid && <span className="mt-1 block text-[10px] text-rose-600">Product price must be greater than zero.</span>}</label>
          <label className="text-[11px] font-bold text-slate-700">Stock Quantity<RequiredMark /><input type="number" min="0" step="1" value={form.stockQuantity} onChange={event => set('stockQuantity', event.target.value)} className={compactInputClass} placeholder="0" />{!stockValid && <span className="mt-1 block text-[10px] text-rose-600">Stock quantity must be zero or greater.</span>}</label>
          <label className="text-[11px] font-bold text-slate-700">Low Stock Threshold <span className="font-normal text-slate-400">(optional)</span><input type="number" min="0" value={form.lowStockThreshold ?? ''} onChange={event => set('lowStockThreshold', event.target.value)} className={compactInputClass} /></label>
          <label className="text-[11px] font-bold text-slate-700">Unit <span className="font-normal text-slate-400">(optional)</span><select value={form.unit || 'piece'} onChange={event => set('unit', event.target.value)} className={compactInputClass}><option value="piece">Piece</option><option value="pack">Pack</option><option value="box">Box</option><option value="bottle">Bottle</option><option value="bag">Bag</option><option value="kg">Kilogram</option></select></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Package Weight <span className="font-normal text-slate-400">(optional)</span><span className="grid grid-cols-[1fr_auto] gap-2"><input type="number" min="0.001" max="10000" step="0.001" value={form.weight ?? ''} onChange={event => set('weight', event.target.value)} className={compactInputClass} placeholder="Not specified" /><select value={form.weightUnit || 'kg'} onChange={event => set('weightUnit', event.target.value)} className={`${compactInputClass} w-24`}><option value="g">g</option><option value="kg">kg</option></select></span><span className="mt-1 block text-[9px] font-normal text-slate-400">Used as listing information; measured parcel weight remains authoritative for delivery capacity.</span></label>
        </div>
      </CompactFormSection>

      <CompactFormSection step="5" icon={Eye} title="Visibility" description="Control whether this product is available to customers.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Catalog Visibility<select value={form.visibility || 'published'} onChange={event => set('visibility', event.target.value)} className={compactInputClass}><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select></label>
          <CompactToggle checked={form.stockStatus !== 'out_of_stock'} onChange={checked => set('stockStatus', checked ? 'in_stock' : 'out_of_stock')} label="Available for sale" description="Existing stock rules remain authoritative." />
        </div>
      </CompactFormSection>
    </CompactFormModal>
  );
};

export default ProductFormModal;
