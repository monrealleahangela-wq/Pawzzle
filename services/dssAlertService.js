const Store = require('../models/Store');
const Inventory = require('../models/Inventory');
const PurchaseOrder = require('../models/PurchaseOrder');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const { createNotification } = require('../controllers/notificationController');

const DAY_MS = 24 * 60 * 60 * 1000;

const notifyOnce = async ({ recipient, type, title, message, relatedId, relatedModel, targetUrl, io, now = new Date() }) => {
  const since = new Date(now.getTime() - DAY_MS);
  const duplicate = await Notification.findOne({
    recipient,
    type,
    title,
    ...(relatedId ? { relatedId } : {}),
    isDeleted: { $ne: true },
    createdAt: { $gte: since }
  }).select('_id').lean();
  if (duplicate) return false;
  const created = await createNotification({ recipient, type, title, message, relatedId, relatedModel, targetUrl }, io);
  return Boolean(created);
};

const processDssAlerts = async (io, now = new Date()) => {
  const stores = await Store.find({ isActive: true, isDeleted: { $ne: true } }).select('_id owner name').lean();
  let notificationsCreated = 0;
  for (const store of stores) {
    if (!store.owner) continue;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dayAfterTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const historyStart = new Date(now.getTime() - 30 * DAY_MS);
    const [criticalInventory, overduePurchaseOrders, historicBookings, tomorrowBookings] = await Promise.all([
      Inventory.find({ store: store._id, isActive: { $ne: false }, $expr: { $lte: ['$quantity', '$reorderLevel'] } }).populate('product', 'name').lean(),
      PurchaseOrder.find({ store: store._id, isDeleted: { $ne: true }, status: { $nin: ['delivered', 'cancelled', 'returned'] }, estimatedDeliveryDate: { $lt: now } }).select('_id orderNumber estimatedDeliveryDate').lean(),
      Booking.countDocuments({ store: store._id, bookingDate: { $gte: historyStart, $lt: now }, status: { $nin: ['cancelled', 'rejected', 'no_show', 'confirmation_expired'] }, isDeleted: { $ne: true } }),
      Booking.countDocuments({ store: store._id, bookingDate: { $gte: tomorrow, $lt: dayAfterTomorrow }, status: { $nin: ['cancelled', 'rejected', 'no_show', 'confirmation_expired'] }, isDeleted: { $ne: true } })
    ]);

    for (const row of criticalInventory) {
      const created = await notifyOnce({
        recipient: store.owner,
        type: 'restock_alert',
        title: 'Critical Inventory DSS Alert',
        message: `${row.product?.name || 'An inventory item'} has ${row.quantity} units, at or below its ${row.reorderLevel}-unit reorder level. Review usage history and supplier lead time before creating a purchase order.`,
        relatedId: row._id,
        relatedModel: 'Inventory',
        targetUrl: '/admin/inventory',
        io,
        now
      });
      if (created) notificationsCreated += 1;
    }

    for (const order of overduePurchaseOrders) {
      const created = await notifyOnce({
        recipient: store.owner,
        type: 'purchase_order',
        title: 'Overdue Procurement DSS Reminder',
        message: `${order.orderNumber} is still open after its estimated delivery date. Contact the supplier and update the expected delivery status.`,
        relatedId: order._id,
        relatedModel: 'PurchaseOrder',
        targetUrl: '/admin/purchase-orders',
        io,
        now
      });
      if (created) notificationsCreated += 1;
    }

    const historicalDailyAverage = historicBookings / 30;
    const peakThreshold = Math.max(3, Math.ceil(historicalDailyAverage * 1.5));
    if (tomorrowBookings >= peakThreshold) {
      const created = await notifyOnce({
        recipient: store.owner,
        type: 'schedule_change',
        title: 'Booking Peak Forecast',
        message: `${tomorrowBookings} bookings are scheduled tomorrow versus a ${historicalDailyAverage.toFixed(1)} daily 30-day average. Review specialist availability and workload coverage.`,
        targetUrl: '/admin/bookings',
        io,
        now
      });
      if (created) notificationsCreated += 1;
    }
  }
  return { storesChecked: stores.length, notificationsCreated };
};

module.exports = { DAY_MS, notifyOnce, processDssAlerts };
