const crypto = require('crypto');
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const InventoryReservation = require('../models/InventoryReservation');

const variantFilter = productVariant => productVariant
  ? { productVariant }
  : { productVariant: { $exists: false } };

const claimExpiredReservation = ({ now, leaseMs }) => {
  const token = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  return InventoryReservation.findOneAndUpdate({
    status: 'active',
    expiresAt: { $lte: now },
    $or: [
      { 'expirationLease.expiresAt': { $exists: false } },
      { 'expirationLease.expiresAt': { $lte: now } }
    ]
  }, {
    $set: { expirationLease: { token, claimedAt: now, expiresAt: leaseExpiresAt } }
  }, { new: true, sort: { expiresAt: 1 } }).then(row => row ? { row, token } : null);
};

const expireClaim = async ({ reservationId, token, now }) => {
  let expired = false;
  await mongoose.connection.transaction(async session => {
    const row = await InventoryReservation.findOne({
      _id: reservationId,
      status: 'active',
      expiresAt: { $lte: now },
      'expirationLease.token': token
    }).session(session);
    if (!row) return;
    const inventory = await Inventory.findOneAndUpdate({
      store: row.store,
      product: row.product,
      ...variantFilter(row.productVariant),
      reservedQuantity: { $gte: row.quantity }
    }, { $inc: { reservedQuantity: -row.quantity } }, { new: true, session });
    if (!inventory) throw new Error('Expired reservation could not reconcile its exact inventory balance.');
    row.status = 'expired';
    row.releasedAt = now;
    row.releaseReason = 'Checkout reservation expired';
    row.expirationLease = undefined;
    await row.save({ session });
    expired = true;
  });
  return expired;
};

const processExpiredReservationBatch = async ({
  limit = 50,
  now = new Date(),
  leaseMs = 2 * 60 * 1000
} = {}) => {
  const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const summary = { claimed: 0, expired: 0, conflicts: 0, errors: [] };
  for (let index = 0; index < boundedLimit; index += 1) {
    const claim = await claimExpiredReservation({ now, leaseMs });
    if (!claim) break;
    summary.claimed += 1;
    try {
      if (await expireClaim({ reservationId: claim.row._id, token: claim.token, now })) summary.expired += 1;
      else summary.conflicts += 1;
    } catch (error) {
      summary.errors.push({ reservation: String(claim.row._id), message: error.message });
    }
  }
  return summary;
};

module.exports = { claimExpiredReservation, expireClaim, processExpiredReservationBatch };
