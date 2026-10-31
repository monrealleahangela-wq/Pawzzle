const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Inventory = require('../models/Inventory');
const { assertCustomerVariantPurchasingEnabled, getCustomerVariantReadiness } = require('./customerVariantReadinessService');

const withSession = (query, session) => session ? query.session(session) : query;
const selectionError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
const variantFilter = variantId => variantId ? { productVariant: variantId } : { productVariant: { $exists: false } };

const resolveCustomerProductSelection = async ({ productId, variantId, quantity = 1, session, requirePurchasable = true }) => {
  const requested = Number(quantity);
  if (!Number.isInteger(requested) || requested < 1) throw selectionError('INVALID_QUANTITY', 'Quantity must be a positive whole number.', 400);
  const product = await withSession(Product.findById(productId), session);
  if (!product || product.isDeleted || !product.isActive || ['draft', 'hidden'].includes(product.visibility)) {
    throw selectionError('PRODUCT_UNAVAILABLE', 'This product is unavailable.', 404);
  }

  let variant = null;
  if (product.productMode === 'variant') {
    if (requirePurchasable) await assertCustomerVariantPurchasingEnabled();
    if (!variantId) throw selectionError('VARIANT_SELECTION_REQUIRED', `Select an available variant for "${product.name}".`);
    variant = await withSession(ProductVariant.findOne({
      _id: variantId, product: product._id, store: product.store, isActive: true, isDiscontinued: false
    }).select('+store'), session);
    if (!variant) throw selectionError('VARIANT_MISMATCH', `The selected variant for "${product.name}" is unavailable.`);
  } else if (variantId) {
    throw selectionError('VARIANT_NOT_ALLOWED', `"${product.name}" is a simple product and does not accept a variant ID.`);
  }

  const inventory = variant ? await withSession(Inventory.findOne({
    store: product.store, product: product._id, ...variantFilter(variant._id), isActive: true
  }), session) : null;
  const legacySimpleQuantity = product.productMode !== 'variant' ? Number(product.stockQuantity || 0) : 0;
  const stockQuantity = inventory ? Number(inventory.quantity || 0) : legacySimpleQuantity;
  const reservedQuantity = inventory ? Number(inventory.reservedQuantity || 0) : 0;
  const availableQuantity = Math.max(0, stockQuantity - reservedQuantity);
  if (requirePurchasable && (availableQuantity < requested || (product.productMode === 'variant' && !inventory))) {
    throw selectionError('INSUFFICIENT_VARIANT_STOCK', `"${product.name}" does not have enough available stock.`);
  }
  return {
    product, variant, inventory, availableQuantity,
    price: Number(variant?.price ?? product.price),
    image: variant?.images?.[0] || product.images?.[0] || null
  };
};

const listCustomerVariants = async product => {
  const readiness = await getCustomerVariantReadiness();
  if (!readiness.browsingEnabled || product.productMode !== 'variant') {
    return { variants: [], browsingEnabled: false, purchasingEnabled: false, reasons: readiness.reasons };
  }
  const [variants, inventories] = await Promise.all([
    ProductVariant.find({ product: product._id, store: product.store, isActive: true, isDiscontinued: false }).lean(),
    Inventory.find({ store: product.store, product: product._id, productVariant: { $type: 'objectId' }, isActive: true }).lean()
  ]);
  const inventoryByVariant = new Map(inventories.map(row => [String(row.productVariant), row]));
  return {
    variants: variants.map(variant => {
      const inventory = inventoryByVariant.get(String(variant._id));
      const availableQuantity = Math.max(0, Number(inventory?.quantity || 0) - Number(inventory?.reservedQuantity || 0));
      return { ...variant, availableQuantity, inStock: availableQuantity > 0 };
    }),
    browsingEnabled: true,
    purchasingEnabled: readiness.purchasingEnabled,
    reasons: readiness.reasons
  };
};

module.exports = { listCustomerVariants, resolveCustomerProductSelection, selectionError, variantFilter };
