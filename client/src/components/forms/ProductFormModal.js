import React from 'react';
import { Eye, Image as ImageIcon, Info, Package, Plus, SlidersHorizontal, Tag, Trash2, Upload, X } from 'lucide-react';
import { getImageUrl } from '../../services/apiService';
import { PRODUCT_CATEGORIES } from '../../constants/productCategories';
import {
  CompactFormModal,
  CompactFormSection,
  CompactToggle,
  CompactUploadCard,
  RequiredMark,
  compactInputClass,
  compactTextareaClass
} from './CompactEntityForm';

const ProductFormModal = ({ editingProduct, form, setForm, onClose, onSubmit, onImageUpload, onVariantImageUpload, loading, onAdvanced, variantCapabilities }) => {
  const image = form.images?.[0];
  const priceValid = Number(form.price) > 0;
  const variantMode = form.productMode === 'variant';
  const stockValid = variantMode || (form.stockQuantity !== '' && Number(form.stockQuantity) >= 0);
  const weightValid = editingProduct && (form.weight === '' || form.weight === undefined)
    ? true
    : Number(form.weight) > 0;
  const variantAttributes = variant => Array.isArray(variant.attributes) ? variant.attributes : [];
  const variantsValid = !variantMode || ((form.normalizedVariants || []).length > 0
    && form.normalizedVariants.every(variant => variantAttributes(variant).length > 0
      && variantAttributes(variant).every(attribute => attribute.label?.trim() && attribute.valueLabel?.trim())
      && variant.sku?.trim() && Number(variant.price) > 0));
  const complete = Boolean(form.name?.trim() && form.category && priceValid && stockValid && weightValid && variantsValid && form.description?.trim() && image);

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
        {!editingProduct && <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {[['simple', 'Simple Product', 'One price and one inventory balance.'], ['variant', 'Product With Variants', 'Separate combinations, prices, and inventory balances.']].map(([value, label, detail]) => (
            <button key={value} type="button" disabled={value === 'variant' && !variantCapabilities?.enabled}
              onClick={() => set('productMode', value)}
              className={`rounded-xl border p-3 text-left ${form.productMode === value ? 'border-primary-600 bg-primary-50' : 'border-slate-200 bg-white'} disabled:cursor-not-allowed disabled:opacity-50`}>
              <span className="block text-[11px] font-black text-slate-800">{label}</span><span className="mt-1 block text-[9px] text-slate-500">{detail}</span>
            </button>
          ))}
          {!variantCapabilities?.enabled && <p className="sm:col-span-2 rounded-xl bg-slate-100 p-3 text-[10px] text-slate-600">Variant creation is safely disabled until the database indexes and Store SKU registry are verified.</p>}
        </div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Product Name<RequiredMark /><input value={form.name} onChange={event => set('name', event.target.value)} className={compactInputClass} placeholder="Product name" />{!form.name?.trim() && <span className="mt-1 block text-[10px] text-rose-600">Product name is required.</span>}</label>
          <label className="text-[11px] font-bold text-slate-700">Category<RequiredMark /><select value={form.category} onChange={event => set('category', event.target.value)} className={compactInputClass}>{PRODUCT_CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
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
          {!variantMode && <label className="text-[11px] font-bold text-slate-700">Stock Quantity<RequiredMark /><input type="number" min="0" step="1" value={form.stockQuantity} onChange={event => set('stockQuantity', event.target.value)} className={compactInputClass} placeholder="0" />{!stockValid && <span className="mt-1 block text-[10px] text-rose-600">Stock quantity must be zero or greater.</span>}</label>}
          <label className="text-[11px] font-bold text-slate-700">Low Stock Threshold <span className="font-normal text-slate-400">(optional)</span><input type="number" min="0" value={form.lowStockThreshold ?? ''} onChange={event => set('lowStockThreshold', event.target.value)} className={compactInputClass} /></label>
          <label className="text-[11px] font-bold text-slate-700">Unit <span className="font-normal text-slate-400">(optional)</span><select value={form.unit || 'piece'} onChange={event => set('unit', event.target.value)} className={compactInputClass}><option value="piece">Piece</option><option value="pack">Pack</option><option value="box">Box</option><option value="bottle">Bottle</option><option value="bag">Bag</option><option value="kg">Kilogram</option></select></label>
          <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Unit Product / Package Weight{!editingProduct && <RequiredMark />}<span className="grid grid-cols-[1fr_auto] gap-2"><input required={!editingProduct} type="number" min="0.001" max="10000" step="0.001" value={form.weight ?? ''} onChange={event => set('weight', event.target.value)} className={compactInputClass} placeholder="Weight per sellable unit" /><select value={form.weightUnit || 'kg'} onChange={event => set('weightUnit', event.target.value)} className={`${compactInputClass} w-24`}><option value="g">g</option><option value="kg">kg</option></select></span><span className="mt-1 block text-[10px] font-normal text-slate-500">Used by the server for automatic parcel-weight and Rider-capacity estimates.</span>{!weightValid && <span className="mt-1 block text-[10px] text-rose-600">Unit weight is required.</span>}{editingProduct && !form.weight && <span className="mt-1 block text-[10px] font-normal text-amber-700">Legacy product: add a measured weight here before it can use automatic Rider assignment.</span>}</label>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 sm:col-span-2"><input type="checkbox" checked={form.weightIncludesPackaging !== false} onChange={event => set('weightIncludesPackaging', event.target.checked)}/>This unit weight already includes ordinary product packaging.</label>
          {form.weightIncludesPackaging === false && <label className="text-[11px] font-bold text-slate-700 sm:col-span-2">Additional Packaging Weight <span className="font-normal text-slate-400">(optional)</span><span className="grid grid-cols-[1fr_auto] gap-2"><input type="number" min="0.001" max="10000" step="0.001" value={form.packagingWeight ?? ''} onChange={event => set('packagingWeight', event.target.value)} className={compactInputClass} placeholder="Leave blank if not yet known"/><select value={form.packagingWeightUnit || 'g'} onChange={event => set('packagingWeightUnit', event.target.value)} className={`${compactInputClass} w-24`}><option value="g">g</option><option value="kg">kg</option></select></span></label>}
        </div>
      </CompactFormSection>

      {variantMode && <CompactFormSection step="5" icon={SlidersHorizontal} title="Sellable Variants" description="Add only combinations you actually sell. Stock is added later through exact-variant receiving.">
        <div className="space-y-3">
          {(form.normalizedVariants || []).map((variant, index) => <div key={variant._id || index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-bold text-slate-700">Option name<input className={compactInputClass} value={variant.attributes?.[0]?.label || ''} placeholder="Flavor, Size, Color" onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, attributes: row.attributes.map((item, itemIndex) => itemIndex === 0 ? { ...item, label: event.target.value } : item) } : row))} /></label>
              <label className="text-[10px] font-bold text-slate-700">Option value<input className={compactInputClass} value={variant.attributes?.[0]?.valueLabel || ''} placeholder="Chicken, 1 kg, Blue" onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, attributes: row.attributes.map((item, itemIndex) => itemIndex === 0 ? { ...item, valueLabel: event.target.value } : item) } : row))} /></label>
              {(variant.attributes || []).slice(1).map((attribute, attributeOffset) => {
                const attributeIndex = attributeOffset + 1;
                return <React.Fragment key={attributeIndex}>
                  <label className="text-[10px] font-bold text-slate-700">Additional option name<input className={compactInputClass} value={attribute.label || ''} placeholder="Size, Weight, Packaging" onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, attributes: row.attributes.map((item, itemIndex) => itemIndex === attributeIndex ? { ...item, label: event.target.value } : item) } : row))} /></label>
                  <label className="text-[10px] font-bold text-slate-700">Additional option value<span className="flex gap-1"><input className={compactInputClass} value={attribute.valueLabel || ''} placeholder="1 kg, 500 mL, Box" onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, attributes: row.attributes.map((item, itemIndex) => itemIndex === attributeIndex ? { ...item, valueLabel: event.target.value } : item) } : row))} /><button type="button" aria-label={`Remove option ${attributeIndex + 1}`} onClick={() => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, attributes: row.attributes.filter((_, itemIndex) => itemIndex !== attributeIndex) } : row))} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button></span></label>
                </React.Fragment>;
              })}
              <label className="text-[10px] font-bold text-slate-700">Variant SKU<input className={compactInputClass} value={variant.sku || ''} onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, sku: event.target.value } : row))} /></label>
              <label className="text-[10px] font-bold text-slate-700">Variant weight<span className="grid grid-cols-[1fr_auto] gap-1"><input type="number" min="0.001" max="10000" step="0.001" className={compactInputClass} value={variant.weight ?? ''} onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, weight: event.target.value } : row))} /><select className={`${compactInputClass} w-20`} value={variant.weightUnit || form.weightUnit || 'g'} onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, weightUnit: event.target.value } : row))}><option value="g">g</option><option value="kg">kg</option></select></span></label>
              <div className="text-[10px] font-bold text-slate-700">Variant image <span className="font-normal text-slate-400">(optional)</span><span className="mt-1 flex items-center gap-2">{variant.images?.[0] && <img src={getImageUrl(variant.images[0])} alt="Variant" className="h-9 w-9 rounded-lg border border-slate-200 object-cover" />}<label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 text-[9px] font-black text-slate-700"><Upload className="mr-1 h-3 w-3" />Upload<input type="file" accept="image/*" className="sr-only" onChange={event => { const files = Array.from(event.target.files || []); if (files.length) onVariantImageUpload?.(files, index); event.target.value = ''; }} /></label>{variant.images?.length > 0 && <button type="button" aria-label="Remove variant image" onClick={() => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, images: [] } : row))} className="text-rose-600"><X className="h-4 w-4" /></button>}</span></div>
              <label className="flex items-center gap-2 text-[10px] font-bold text-slate-700 sm:col-span-2"><input type="checkbox" checked={variant.isActive !== false} onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, isActive: event.target.checked } : row))} />Active in the seller catalog</label>
              <label className="text-[10px] font-bold text-slate-700">Retail price (₱)<input type="number" min="0.01" step="0.01" className={compactInputClass} value={variant.price || ''} onChange={event => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, price: event.target.value } : row))} /></label>
            </div>
            <button type="button" onClick={() => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, attributes: [...row.attributes, { label: '', valueLabel: '' }] } : row))} className="mt-2 mr-3 inline-flex items-center gap-1 text-[9px] font-black text-primary-700"><Plus className="h-3 w-3" />Add another option</button>
            {variant._id ? <button type="button" onClick={() => set('normalizedVariants', form.normalizedVariants.map((row, rowIndex) => rowIndex === index ? { ...row, markDiscontinued: !row.markDiscontinued } : row))} className="mt-2 inline-flex items-center gap-1 text-[9px] font-black text-rose-600"><Trash2 className="h-3 w-3" />{variant.markDiscontinued ? 'Keep variant' : 'Discontinue variant'}</button>
              : <button type="button" onClick={() => set('normalizedVariants', form.normalizedVariants.filter((_, rowIndex) => rowIndex !== index))} className="mt-2 inline-flex items-center gap-1 text-[9px] font-black text-rose-600"><Trash2 className="h-3 w-3" />Remove variant</button>}
          </div>)}
          <button type="button" onClick={() => set('normalizedVariants', [...(form.normalizedVariants || []), { attributes: [{ label: '', valueLabel: '' }], sku: '', price: '', images: [], unit: form.unit || 'piece', weight: form.weight, weightUnit: form.weightUnit, isActive: true }])} className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary-200 px-4 text-[10px] font-black text-primary-700"><Plus className="h-4 w-4" />Add explicit combination</button>
        </div>
      </CompactFormSection>}

      <CompactFormSection step={variantMode ? '6' : '5'} icon={Eye} title="Visibility" description="Control whether this product is available to customers.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-bold text-slate-700">Catalog Visibility<select disabled={variantMode} value={variantMode ? 'draft' : (form.visibility || 'published')} onChange={event => set('visibility', event.target.value)} className={compactInputClass}><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select>{variantMode && <span className="mt-1 block text-[10px] font-normal text-slate-500">Variant listings remain draft until customer variant selection is safely enabled.</span>}</label>
          {!variantMode && <CompactToggle checked={form.stockStatus !== 'out_of_stock'} onChange={checked => set('stockStatus', checked ? 'in_stock' : 'out_of_stock')} label="Available for sale" description="Existing stock rules remain authoritative." />}
        </div>
      </CompactFormSection>
    </CompactFormModal>
  );
};

export default ProductFormModal;
