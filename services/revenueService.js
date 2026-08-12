const Store = require('../models/Store');
const Order = require('../models/Order');
const Booking = require('../models/Booking');

class RevenueService {
  static modelFor(type) {
    if (!['order', 'booking'].includes(type)) throw new Error(`Unsupported revenue type: ${type}`);
    return type === 'order' ? Order : Booking;
  }

  static totalsFor(doc, type) {
    const totalAmount = Number(type === 'order' ? doc.totalAmount : doc.totalPrice);
    const vatAmount = Number(doc.pricingBreakdown?.vatAmount || 0);
    const recognizedRevenue = Number(Math.max(0, totalAmount - vatAmount).toFixed(2));
    const platformFee = Number((recognizedRevenue * 0.10).toFixed(2));
    const netAmount = Number((totalAmount - platformFee).toFixed(2));
    return { recognizedRevenue, platformFee, netAmount };
  }

  static async recordPayment(type, id) {
    const Model = this.modelFor(type);
    const doc = await Model.findById(id);
    if (!doc) throw new Error(`${type} not found`);
    if (doc.isRevenueRecorded) return doc;

    const { recognizedRevenue, platformFee, netAmount } = this.totalsFor(doc, type);
    let storeId = doc.store;
    if (!storeId && doc.addedBy) storeId = (await Store.findOne({ owner: doc.addedBy }).select('_id'))?._id;

    // The claim is atomic, so webhook delivery and redirect verification cannot
    // both increment the store aggregates for the same transaction.
    const claimed = await Model.findOneAndUpdate({ _id: id, isRevenueRecorded: { $ne: true } }, {
      $set: {
        platformFee,
        netAmount,
        paymentStatus: 'paid',
        isRevenueRecorded: true,
        ...(storeId ? { store: storeId } : {})
      }
    }, { new: true });
    if (!claimed) return Model.findById(id);

    try {
      if (storeId) {
        await Store.findByIdAndUpdate(storeId, {
          $inc: {
            balance: netAmount,
            'stats.totalRevenue': recognizedRevenue,
            'stats.totalPlatformFees': platformFee
          }
        });
      }
      return claimed;
    } catch (error) {
      await Model.findOneAndUpdate({ _id: id, isRevenueRecorded: true }, { $set: { isRevenueRecorded: false } });
      throw error;
    }
  }

  static async reversePayment(type, id) {
    const Model = this.modelFor(type);
    const doc = await Model.findById(id);
    if (!doc) throw new Error(`${type} not found`);
    if (!doc.isRevenueRecorded || !doc.store) return doc;

    const totals = this.totalsFor(doc, type);
    const platformFee = Number(doc.platformFee || totals.platformFee);
    const netAmount = Number(doc.netAmount || totals.netAmount);
    const claimed = await Model.findOneAndUpdate({ _id: id, isRevenueRecorded: true }, {
      $set: { isRevenueRecorded: false }
    }, { new: true });
    if (!claimed) return Model.findById(id);

    try {
      await Store.findByIdAndUpdate(doc.store, {
        $inc: {
          balance: -netAmount,
          'stats.totalRevenue': -totals.recognizedRevenue,
          'stats.totalPlatformFees': -platformFee
        }
      });
      return claimed;
    } catch (error) {
      await Model.findOneAndUpdate({ _id: id, isRevenueRecorded: false }, { $set: { isRevenueRecorded: true } });
      throw error;
    }
  }
}

module.exports = RevenueService;
