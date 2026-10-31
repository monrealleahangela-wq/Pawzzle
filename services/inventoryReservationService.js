const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const InventoryReservation = require('../models/InventoryReservation');
const Product = require('../models/Product');
const InventoryLedgerService = require('./inventoryLedgerService');
const { processExpiredReservationBatch } = require('./reservationExpirationJobService');
const { resolveCustomerProductSelection, variantFilter } = require('./customerProductVariantService');

const DEFAULT_TTL_MINUTES = 20;
const expiresAt = () => new Date(Date.now() + Math.max(5, Number(process.env.CHECKOUT_RESERVATION_MINUTES || DEFAULT_TTL_MINUTES)) * 60000);

const reserveOrderItems = async ({ order, customerId, checkoutBatch, session }) => {
  if (!session) throw new Error('Inventory reservations require an active MongoDB transaction.');
  const created = [];
  for (const item of order.items.filter(row => row.itemType === 'product')) {
    // Legacy simple products retain their existing post-payment stock flow.
    // Phase 4 reservations are authoritative only for normalized variants.
    if (!item.variantId) continue;
    const selection = await resolveCustomerProductSelection({
      productId: item.itemId, variantId: item.variantId, quantity: item.quantity, session, requirePurchasable: true
    });
    if (Number(selection.price) !== Number(item.price)) {
      throw Object.assign(new Error('A product or variant price changed before inventory could be reserved.'), { statusCode: 409, code: 'VARIANT_PRICE_CHANGED' });
    }
    const reservationKey = `order:${order._id}:item:${item._id}`;
    const inventory = await Inventory.findOneAndUpdate({
      _id: selection.inventory._id,
      $expr: { $gte: [{ $subtract: ['$quantity', { $ifNull: ['$reservedQuantity', 0] }] }, Number(item.quantity)] }
    }, { $inc: { reservedQuantity: Number(item.quantity) } }, { new: true, session });
    if (!inventory) throw Object.assign(new Error(`Insufficient stock for "${item.name}".`), { statusCode: 409, code: 'RESERVATION_STOCK_CONFLICT' });
    const [reservation] = await InventoryReservation.create([{
      reservationKey, customer: customerId, order: order._id, checkoutBatch,
      store: order.store, product: item.itemId, ...(item.variantId ? { productVariant: item.variantId } : {}),
      quantity: item.quantity, expiresAt: expiresAt()
    }], { session });
    created.push(reservation);
  }
  return created;
};

const releaseReservationRows = async ({ filter, reason, status = 'released', session }) => {
  const rows = await InventoryReservation.find({ ...filter, status: 'active' }).session(session);
  for (const row of rows) {
    const inventory = await Inventory.findOneAndUpdate({
      store: row.store, product: row.product, ...variantFilter(row.productVariant),
      reservedQuantity: { $gte: row.quantity }
    }, { $inc: { reservedQuantity: -row.quantity } }, { new: true, session });
    if (!inventory) throw new Error('Reservation release could not reconcile the inventory balance.');
    row.status = status;
    row.releasedAt = new Date();
    row.releaseReason = reason;
    await row.save({ session });
  }
  return rows;
};

const releaseOrderReservations = async ({ orderId, reason = 'Checkout cancelled' }) => mongoose.connection.transaction(
  session => releaseReservationRows({ filter: { order: orderId }, reason, session })
);

const releaseExpiredReservations = async () => processExpiredReservationBatch({ limit: 100 });

const assertOrderReservationsPayable = async (orderId, { requireReservation = false } = {}) => {
  await releaseExpiredReservations();
  const rows = await InventoryReservation.find({ order: orderId });
  if (!rows.length) {
    if (requireReservation) {
      throw Object.assign(new Error('This variant checkout has no active inventory reservation. Recreate checkout before paying.'), {
        statusCode: 409,
        code: 'VARIANT_RESERVATION_REQUIRED'
      });
    }
    return { legacy: true, rows: [] };
  }
  if (rows.some(row => row.status !== 'active' || row.expiresAt <= new Date())) {
    throw Object.assign(new Error('The inventory reservation expired. Recreate checkout before paying.'), { statusCode: 409, code: 'RESERVATION_EXPIRED' });
  }
  return { legacy: false, rows };
};

const consumeOrderReservations = async ({ orderId, paymentId }) => mongoose.connection.transaction(async session => {
  const rows = await InventoryReservation.find({ order: orderId }).session(session);
  if (!rows.length) return { handled: false };
  if (rows.every(row => row.status === 'consumed' && row.paymentId === paymentId)) return { handled: true, idempotent: true };
  if (rows.some(row => row.status !== 'active' || row.expiresAt <= new Date())) {
    for (const row of rows.filter(candidate => candidate.status === 'active')) {
      await Inventory.findOneAndUpdate({
        store: row.store, product: row.product, ...variantFilter(row.productVariant),
        reservedQuantity: { $gte: row.quantity }
      }, { $inc: { reservedQuantity: -row.quantity } }, { session });
    }
    await InventoryReservation.updateMany({ order: orderId, status: { $ne: 'consumed' } }, {
      $set: { status: 'payment_review', paymentId, releaseReason: 'Payment confirmed after reservation was no longer active' }
    }, { session });
    throw Object.assign(new Error('Payment arrived after inventory reservation expiry; refund or manual inventory review is required.'), {
      statusCode: 409, code: 'PAYMENT_AFTER_RESERVATION_EXPIRY'
    });
  }
  for (const row of rows) {
    const inventory = await Inventory.findOneAndUpdate({
      store: row.store, product: row.product, ...variantFilter(row.productVariant),
      quantity: { $gte: row.quantity }, reservedQuantity: { $gte: row.quantity }
    }, { $inc: { reservedQuantity: -row.quantity } }, { new: true, session });
    if (!inventory) throw new Error('Reserved inventory could not be consumed safely.');
    if (row.productVariant) {
      await InventoryLedgerService.issueReservedVariantInSession({
        store: row.store,
        product: row.product,
        productVariant: row.productVariant,
        quantity: row.quantity,
        order: row.order,
        performedBy: row.customer,
        idempotencyKey: `order-variant-sale:${row.order}:${row._id}`
      }, session);
    }
    row.status = 'consumed';
    row.consumedAt = new Date();
    row.paymentId = paymentId;
    await row.save({ session });
    if (!row.productVariant) {
      inventory.quantity -= row.quantity;
      await inventory.save({ session });
      await Product.findByIdAndUpdate(row.product, {
        $set: { stockQuantity: inventory.quantity, stockStatus: inventory.quantity > 0 ? 'in_stock' : 'out_of_stock' }
      }, { session });
    }
  }
  return { handled: true, idempotent: false };
});

module.exports = {
  assertOrderReservationsPayable,
  consumeOrderReservations,
  releaseExpiredReservations,
  releaseOrderReservations,
  reserveOrderItems
};
