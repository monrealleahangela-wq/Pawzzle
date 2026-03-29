const Store = require('../models/Store');
const Order = require('../models/Order');
const Booking = require('../models/Booking');

/**
 * Service to handle revenue recognition and store balance updates.
 * Only PAID transactions are recorded as revenue.
 */
class RevenueService {
  /**
   * Records revenue for a paid order or booking.
   * Only increments stats if isRevenueRecorded is false.
   * @param {string} type - 'order' or 'booking'
   * @param {string} id - The ID of the document
   * @returns {Promise<Object>} The updated document
   */
  static async recordPayment(type, id) {
    let Model = type === 'order' ? Order : Booking;
    const doc = await Model.findById(id);

    if (!doc) throw new Error(`${type} not found`);

    // Only proceed if not already recorded
    if (!doc.isRevenueRecorded) {
      const totalAmount = type === 'order' ? doc.totalAmount : doc.totalPrice;
      
      // Calculate 10% Platform Fee
      const platformFee = Number((totalAmount * 0.10).toFixed(2));
      const netAmount = Number((totalAmount - platformFee).toFixed(2));

      doc.platformFee = platformFee;
      doc.netAmount = netAmount;
      doc.paymentStatus = 'paid';
      doc.isRevenueRecorded = true;

      // Determine the store ID if missing from the document
      let storeId = doc.store;
      if (!storeId && doc.addedBy) {
        const store = await Store.findOne({ owner: doc.addedBy });
        if (store) {
          storeId = store._id;
          // Periodically fix the document too
          doc.store = storeId;
        }
      }

      if (storeId) {
        await Store.findByIdAndUpdate(storeId, {
          $inc: {
            'balance': netAmount,
            'stats.totalRevenue': totalAmount,
            'stats.totalPlatformFees': platformFee
          }
        });
        console.log(`💰 Revenue recorded for ${type} #${doc._id || id}. Seller: +${netAmount}, Platform: +${platformFee}`);
      }
      
      return await doc.save();
    }

    return doc;
  }

  /**
   * Reverses revenue when a transaction is cancelled or refunded.
   * Only reverses if isRevenueRecorded is true.
   * @param {string} type - 'order' or 'booking'
   * @param {string} id - The ID of the document
   * @returns {Promise<Object>} The updated document
   */
  static async reversePayment(type, id) {
    let Model = type === 'order' ? Order : Booking;
    const doc = await Model.findById(id);

    if (!doc) throw new Error(`${type} not found`);

    if (doc.isRevenueRecorded && doc.store) {
      const totalAmount = type === 'order' ? doc.totalAmount : doc.totalPrice;
      const platformFee = doc.platformFee || Number((totalAmount * 0.10).toFixed(2));
      const netAmount = doc.netAmount || (totalAmount - platformFee);

      await Store.findByIdAndUpdate(doc.store, {
        $inc: {
          'balance': -netAmount,
          'stats.totalRevenue': -totalAmount,
          'stats.totalPlatformFees': -platformFee
        }
      });
      
      console.log(`💰 Revenue reversed for ${type} #${doc._id || id}. Seller: -${netAmount}, Platform: -${platformFee}`);
      
      doc.isRevenueRecorded = false;
      // We don't reset netAmount/platformFee here to keep historical info of what WAS paid
      // but the flag ensures it won't be reversed twice.
      return await doc.save();
    }

    return doc;
  }
}

module.exports = RevenueService;
