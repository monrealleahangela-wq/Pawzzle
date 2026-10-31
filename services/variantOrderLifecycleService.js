const mongoose = require('mongoose');
const InventoryReservation = require('../models/InventoryReservation');
const Order = require('../models/Order');
const InventoryLedgerService = require('./inventoryLedgerService');
const { assertCapability } = require('./customerVariantLifecycleReadinessService');

const hasNormalizedVariants = order => (order?.items || []).some(item => item.itemType === 'product' && item.variantId);
const idsEqual = (left, right) => String(left || '') === String(right || '');

const assertImmutableVariantItems = order => {
  for (const item of (order.items || []).filter(row => row.itemType === 'product' && row.variantId)) {
    if (!item.variantSnapshot?.sku || !Array.isArray(item.variantSnapshot?.attributes)
        || !Number.isFinite(Number(item.variantSnapshot?.retailUnitPrice))) {
      const error = new Error(`Order item "${item.name}" is missing its immutable variant snapshot.`);
      error.statusCode = 409;
      error.code = 'VARIANT_SNAPSHOT_REQUIRED';
      throw error;
    }
  }
};

const assertVariantFulfillmentEligible = async order => {
  if (!hasNormalizedVariants(order)) return { variantOrder: false };
  await assertCapability('fulfillment');
  assertImmutableVariantItems(order);
  if (order.paymentStatus !== 'paid' || order.paymentDetails?.fulfillmentStatus !== 'completed') {
    const error = new Error('Exact-variant fulfillment requires authoritative payment confirmation and completed stock commitment.');
    error.statusCode = 409;
    error.code = 'VARIANT_FULFILLMENT_PAYMENT_REQUIRED';
    throw error;
  }
  const reservations = await InventoryReservation.find({ order: order._id, status: 'consumed' }).lean();
  for (const item of order.items.filter(row => row.itemType === 'product' && row.variantId)) {
    const matching = reservations.find(row => idsEqual(row.product, item.itemId)
      && idsEqual(row.productVariant, item.variantId) && Number(row.quantity) === Number(item.quantity));
    if (!matching) {
      const error = new Error(`Committed stock for "${item.name}" cannot be verified.`);
      error.statusCode = 409;
      error.code = 'VARIANT_FULFILLMENT_COMMITMENT_REQUIRED';
      throw error;
    }
  }
  return { variantOrder: true, reservations };
};

const applyItemFulfillmentStage = (order, nextStatus, actor) => {
  const now = new Date();
  const stage = {
    confirmed: 'picking', preparing: 'picking', ready_for_pickup: 'packed',
    rider_assigned: 'packed', picked_up: 'fulfilled', in_transit: 'fulfilled',
    delivered: 'fulfilled', completed: 'fulfilled', cancelled: 'cancelled'
  }[nextStatus];
  if (!stage) return;
  for (const item of order.items || []) {
    item.fulfillment = item.fulfillment || {};
    item.fulfillment.status = stage;
    item.fulfillment.actor = actor;
    if (item.variantId && !item.fulfillment.exactVariantVerifiedAt) item.fulfillment.exactVariantVerifiedAt = now;
    if (stage === 'picking' && !item.fulfillment.pickedAt) item.fulfillment.pickedAt = now;
    if (stage === 'packed' && !item.fulfillment.packedAt) item.fulfillment.packedAt = now;
    if (stage === 'fulfilled' && !item.fulfillment.fulfilledAt) item.fulfillment.fulfilledAt = now;
  }
};

const restoreCancelledVariantStock = async ({ orderId, actorId, session: callerSession }) => {
  let outcome = { restored: 0, idempotent: true };
  const execute = async session => {
    const order = await Order.findById(orderId).session(session);
    if (!order || !hasNormalizedVariants(order)) return;
    await assertCapability('cancellation');
    assertImmutableVariantItems(order);
    let restored = 0;
    for (const item of order.items.filter(row => row.itemType === 'product' && row.variantId)) {
      const reservation = await InventoryReservation.findOne({
        order: order._id, product: item.itemId, productVariant: item.variantId,
        status: { $in: ['consumed', 'restored'] }
      }).session(session);
      if (!reservation) continue;
      const result = await InventoryLedgerService.restockVariantInSession({
        store: order.store,
        product: item.itemId,
        productVariant: item.variantId,
        quantity: item.quantity,
        order: order._id,
        orderItem: item._id,
        performedBy: actorId,
        idempotencyKey: `cancelled-order-variant-restock:${order._id}:${item._id}`,
        reason: `Refunded cancellation of order ${order.orderNumber}`,
        lotNumber: `CANCEL-${order.orderNumber}-${item._id}`
      }, session);
      if (!result.idempotent) restored += Number(item.quantity);
      if (reservation.status === 'consumed') {
        reservation.status = 'restored';
        reservation.restoredAt = new Date();
        await reservation.save({ session });
      }
    }
    applyItemFulfillmentStage(order, 'cancelled', actorId);
    await order.save({ session });
    outcome = { restored, idempotent: restored === 0 };
  };
  if (callerSession) await execute(callerSession);
  else await mongoose.connection.transaction(execute);
  return outcome;
};

const pickingInstructions = order => (order.items || []).map(item => ({
  orderItem: item._id,
  parentProduct: item.itemId,
  productVariant: item.variantId,
  name: item.name,
  sku: item.variantSnapshot?.sku,
  attributes: item.variantSnapshot?.attributes || [],
  image: item.variantSnapshot?.image || item.image,
  quantity: item.quantity,
  unitPrice: item.variantSnapshot?.retailUnitPrice ?? item.price,
  weight: item.variantSnapshot?.weight,
  weightUnit: item.variantSnapshot?.weightUnit,
  fulfillment: item.fulfillment
}));

module.exports = {
  applyItemFulfillmentStage,
  assertImmutableVariantItems,
  assertVariantFulfillmentEligible,
  hasNormalizedVariants,
  pickingInstructions,
  restoreCancelledVariantStock
};
