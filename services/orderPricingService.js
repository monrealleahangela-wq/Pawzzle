const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');
const DeliveryFeeRule = require('../models/DeliveryFeeRule');
const DeliveryFeeService = require('./deliveryFeeService');
const { calculateTransactionTax, resolveTransactionTaxConfiguration, roundMoney } = require('../utils/taxCalculator');
const { getPetAvailabilityIssue } = require('./petAvailabilityService');

const idsEqual = (a, b) => a && b && a.toString() === b.toString();

const resolveVoucher = async ({ voucherCode, storeId, subtotal }) => {
  if (!voucherCode) return { voucher: null, discountAmount: 0 };
  const voucher = await Voucher.findOne({
    code: String(voucherCode).trim().toUpperCase(),
    isActive: true,
    store: storeId
  });
  if (!voucher) throw new Error('Voucher is invalid for this store.');

  const now = new Date();
  if (now < voucher.startDate || now > voucher.endDate) throw new Error('Voucher is not currently valid.');
  if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) throw new Error('Voucher usage limit has been reached.');
  if (subtotal < voucher.minPurchase) throw new Error(`A minimum purchase of ₱${voucher.minPurchase.toFixed(2)} is required for this voucher.`);

  const rawDiscount = voucher.discountType === 'percentage'
    ? subtotal * (voucher.discountValue / 100)
    : voucher.discountValue;
  return { voucher, discountAmount: roundMoney(Math.min(subtotal, rawDiscount)) };
};

const calculateDelivery = async ({ store, deliveryMethod, shippingAddress }) => {
  if (deliveryMethod === 'pickup') return { fee: 0, calculation: null };
  const origin = store.contactInfo?.address?.coordinates;
  const destination = shippingAddress?.coordinates;
  if (!origin || !destination) throw new Error('Store and delivery address map coordinates are required.');

  const now = new Date();
  const hasRule = await DeliveryFeeRule.exists({
    store: store._id,
    isActive: true,
    effectiveFrom: { $lte: now },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: now } }]
  });
  // Existing stores without a rule retain their current free-delivery behavior.
  if (!hasRule) return { fee: 0, calculation: null };

  const calculation = await DeliveryFeeService.calculate({
    store: store._id,
    origin,
    destination
  });
  return { fee: calculation.totalFee, calculation };
};

const calculateOrderPricing = async ({ items, requestedDeliveryMethod, shippingAddress, voucherCode }) => {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Order must contain at least one item.');

  const processedItems = [];
  let subtotal = 0;
  let storeId = null;
  let hasPet = false;
  const petIds = new Set();

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Item quantity must be a positive whole number.');
    let itemDoc;
    if (item.itemType === 'pet') {
      hasPet = true;
      const petId = String(item.itemId);
      if (petIds.has(petId)) throw new Error('Each individual pet can appear only once in an order.');
      petIds.add(petId);
      itemDoc = await Pet.findById(item.itemId);
      const issue = getPetAvailabilityIssue(itemDoc, quantity);
      if (issue) throw new Error(issue);
    } else if (item.itemType === 'product') {
      itemDoc = await Product.findById(item.itemId);
      if (!itemDoc || !itemDoc.isActive || itemDoc.stockQuantity < quantity) {
        throw new Error(`Product "${itemDoc?.name || item.itemId}" is unavailable or has insufficient stock.`);
      }
    } else {
      throw new Error('Invalid item type.');
    }

    let itemStoreId = itemDoc.store;
    if (!itemStoreId && itemDoc.addedBy) {
      const fallbackStore = await Store.findOne({ owner: itemDoc.addedBy, isDeleted: { $ne: true } }).select('_id');
      itemStoreId = fallbackStore?._id;
    }
    if (!itemStoreId) throw new Error(`The store for "${itemDoc.name}" could not be resolved.`);
    if (storeId && !idsEqual(storeId, itemStoreId)) {
      throw new Error('Items from different stores must be checked out separately.');
    }
    storeId = itemStoreId;

    const price = roundMoney(itemDoc.price);
    subtotal = roundMoney(subtotal + price * quantity);
    processedItems.push({
      itemType: item.itemType,
      itemId: itemDoc._id,
      name: itemDoc.name,
      price,
      quantity,
      image: itemDoc.images?.[0] || itemDoc.image || null
    });
  }

  const store = await Store.findById(storeId);
  if (!store || !store.isActive || store.isDeleted) throw new Error('Store is unavailable.');
  const deliveryMethod = hasPet ? 'pickup' : requestedDeliveryMethod;
  if (!['delivery', 'pickup'].includes(deliveryMethod)) throw new Error('Invalid delivery method.');

  const [{ voucher, discountAmount }, delivery] = await Promise.all([
    resolveVoucher({ voucherCode, storeId, subtotal }),
    calculateDelivery({ store, deliveryMethod, shippingAddress })
  ]);
  // Stores created before tax settings were introduced retain checkout
  // compatibility through the calculator's explicit non-VAT fallback. A
  // configured store still uses its saved VAT treatment, and either result is
  // snapshotted on the order before a PayMongo session can be created.
  const pricingBreakdown = calculateTransactionTax({
    subtotal,
    discountAmount,
    deliveryFee: delivery.fee,
    taxConfiguration: resolveTransactionTaxConfiguration(store.taxConfiguration)
  });

  return {
    store,
    storeId,
    ownerId: store.owner,
    deliveryMethod,
    processedItems,
    voucher,
    pricingBreakdown,
    deliveryFeeCalculation: delivery.calculation
  };
};

module.exports = { calculateOrderPricing };
