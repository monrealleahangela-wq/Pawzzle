const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Store = require('../models/Store');

const REVIEWABLE_ORDER_STATUSES = new Set(['delivered', 'completed']);

class ProductReviewError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'ProductReviewError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const asObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ProductReviewError(400, `invalid_${fieldName}`, `A valid ${fieldName} is required.`);
  }
  return new mongoose.Types.ObjectId(String(value));
};

const productReviewMessage = reason => ({
  product_not_found: 'Product not found.',
  order_not_owned: 'This order does not belong to your account.',
  order_not_completed: 'You can review this product after the order is delivered.',
  order_item_not_found: 'The selected product is not part of this order.',
  store_mismatch: 'The selected product does not belong to the order Store.',
  own_product: 'You cannot review a product from your own Store.',
  already_reviewed: 'You have already reviewed this purchased product.'
}[reason] || 'This purchased product is not eligible for review.');

const resolveProductOrderReviewEligibility = async ({
  userId,
  orderId,
  productId,
  orderItemId,
  session
}) => {
  const customerObjectId = asObjectId(userId, 'customer');
  const orderObjectId = asObjectId(orderId, 'order');
  const productObjectId = asObjectId(productId, 'product');
  const itemObjectId = asObjectId(orderItemId, 'order item');
  const queryOptions = session ? { session } : {};

  const order = await Order.findOne({ _id: orderObjectId, customer: customerObjectId }, null, queryOptions);
  if (!order) return { isEligible: false, reason: 'order_not_owned' };
  if (!REVIEWABLE_ORDER_STATUSES.has(order.status)) {
    return { isEligible: false, reason: 'order_not_completed', order };
  }

  const orderItem = order.items.id(itemObjectId);
  if (!orderItem || orderItem.itemType !== 'product' || String(orderItem.itemId) !== String(productObjectId)) {
    return { isEligible: false, reason: 'order_item_not_found', order };
  }

  const product = await Product.findById(productObjectId, null, queryOptions);
  if (!product) return { isEligible: false, reason: 'product_not_found', order, orderItem };
  if (!order.store || !product.store || String(order.store) !== String(product.store)) {
    return { isEligible: false, reason: 'store_mismatch', order, orderItem, product };
  }

  const store = await Store.findById(order.store, 'owner', queryOptions);
  if (!store || String(store.owner) === String(customerObjectId)) {
    return { isEligible: false, reason: store ? 'own_product' : 'store_mismatch', order, orderItem, product };
  }

  const existingReview = await Review.findOne({
    user: customerObjectId,
    targetType: 'Product',
    targetId: productObjectId,
    orderId: orderObjectId,
    $or: [
      { orderItemId: itemObjectId },
      // A legacy review tied to this exact order/product is reliable enough to
      // preserve as the matching purchase. Unbound legacy records are not.
      { orderItemId: { $exists: false } },
      { orderItemId: null }
    ]
  }, null, queryOptions);

  if (existingReview || orderItem.reviewStatus?.isRated) {
    return {
      isEligible: false,
      reason: 'already_reviewed',
      order,
      orderItem,
      product,
      existingReview: existingReview || null
    };
  }

  return { isEligible: true, reason: null, order, orderItem, product, store };
};

const refreshProductRating = async (productId, session) => {
  const aggregate = Review.aggregate([
    {
      $match: {
        targetType: 'Product',
        targetId: new mongoose.Types.ObjectId(String(productId)),
        isApproved: true,
        isDeleted: { $ne: true }
      }
    },
    { $group: { _id: '$targetId', average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  if (session) aggregate.session(session);
  const [summary] = await aggregate;
  await Product.findByIdAndUpdate(productId, {
    'ratings.average': summary ? Number(summary.average.toFixed(2)) : 0,
    'ratings.count': summary?.count || 0
  }, session ? { session } : {});
};

const normalizeReviewImages = images => {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 5) {
    throw new ProductReviewError(400, 'invalid_images', 'Up to five review photos are allowed.');
  }
  const normalized = images.map(image => String(image || '').trim());
  if (normalized.some(image => !image || image.length > 2048)) {
    throw new ProductReviewError(400, 'invalid_images', 'One or more review photo references are invalid.');
  }
  return normalized;
};

const createProductOrderReview = async ({
  userId,
  orderId,
  orderItemId,
  productId,
  rating,
  comment,
  images,
  isAnonymous
}) => {
  const session = await mongoose.startSession();
  let createdReview;
  try {
    await session.withTransaction(async () => {
      const eligibility = await resolveProductOrderReviewEligibility({
        userId,
        orderId,
        productId,
        orderItemId,
        session
      });
      if (!eligibility.isEligible) {
        const statusCode = ['product_not_found'].includes(eligibility.reason) ? 404
          : eligibility.reason === 'already_reviewed' ? 409
            : eligibility.reason.startsWith('invalid_') ? 400 : 403;
        throw new ProductReviewError(statusCode, eligibility.reason, productReviewMessage(eligibility.reason));
      }

      const [review] = await Review.create([{
        user: userId,
        targetType: 'Product',
        targetId: productId,
        storeId: eligibility.order.store,
        orderId,
        orderItemId,
        rating,
        comment,
        images: normalizeReviewImages(images),
        isAnonymous: Boolean(isAnonymous)
      }], { session });

      const orderUpdate = await Order.updateOne(
        {
          _id: eligibility.order._id,
          customer: userId,
          items: {
            $elemMatch: {
              _id: eligibility.orderItem._id,
              'reviewStatus.isRated': { $ne: true }
            }
          }
        },
        {
          $set: {
            'items.$.reviewStatus.isRated': true,
            'items.$.reviewStatus.reviewId': review._id
          }
        },
        { session }
      );
      if (orderUpdate.modifiedCount !== 1) {
        throw new ProductReviewError(409, 'already_reviewed', productReviewMessage('already_reviewed'));
      }

      await refreshProductRating(productId, session);
      createdReview = review;
    });
    return createdReview;
  } catch (error) {
    if (error?.code === 11000) {
      throw new ProductReviewError(409, 'already_reviewed', productReviewMessage('already_reviewed'));
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const decorateOrdersWithProductReviewStatus = async (orders, userId) => {
  const normalizedOrders = (orders || []).map(order => order?.toObject ? order.toObject() : order);
  const orderIds = normalizedOrders.map(order => order?._id).filter(Boolean);
  if (!orderIds.length) return normalizedOrders;

  const reviews = await Review.find({
    user: userId,
    targetType: 'Product',
    orderId: { $in: orderIds },
    isDeleted: { $ne: true }
  }).select('_id orderId orderItemId targetId').lean();

  const exact = new Map();
  const legacy = new Map();
  for (const review of reviews) {
    if (review.orderItemId) exact.set(`${review.orderId}:${review.orderItemId}`, review);
    else legacy.set(`${review.orderId}:${review.targetId}`, review);
  }

  return normalizedOrders.map(order => ({
    ...order,
    items: (order.items || []).map(item => {
      if (item.itemType !== 'product') return item;
      const review = exact.get(`${order._id}:${item._id}`) || legacy.get(`${order._id}:${item.itemId}`);
      return {
        ...item,
        reviewStatus: review
          ? { isRated: true, reviewId: review._id }
          : { isRated: Boolean(item.reviewStatus?.isRated), reviewId: item.reviewStatus?.reviewId || null }
      };
    })
  }));
};

module.exports = {
  ProductReviewError,
  REVIEWABLE_ORDER_STATUSES,
  productReviewMessage,
  resolveProductOrderReviewEligibility,
  createProductOrderReview,
  refreshProductRating,
  decorateOrdersWithProductReviewStatus,
  __testing: { normalizeReviewImages }
};
