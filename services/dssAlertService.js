const Store = require('../models/Store');
const Inventory = require('../models/Inventory');
const PurchaseOrder = require('../models/PurchaseOrder');
const Booking = require('../models/Booking');
const Order = require('../models/Order');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { createNotification } = require('../controllers/notificationController');
const { hasPermission, normalizeRole } = require('../config/permissions');

const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECTED_STOCKOUT_DAYS = 7;
const MINIMUM_DEMAND_OBSERVATIONS = 6;

const evaluateInventoryAlert = ({ quantity = 0, reorderLevel = 0, unitsLast30 = 0, observations = 0 } = {}) => {
  const onHand = Math.max(0, Number(quantity || 0));
  const threshold = Math.max(0, Number(reorderLevel || 0));
  const dailyUsage = Math.max(0, Number(unitsLast30 || 0)) / 30;
  const projectedDaysRemaining = dailyUsage > 0 ? Number((onHand / dailyUsage).toFixed(1)) : null;
  const projectionSupported = Number(observations || 0) >= MINIMUM_DEMAND_OBSERVATIONS;
  let severity = null;
  if (onHand === 0) severity = 'critical_stock';
  else if (projectionSupported && projectedDaysRemaining <= PROJECTED_STOCKOUT_DAYS) severity = 'projected_stockout';
  else if (onHand <= threshold) severity = 'low_stock';
  return {
    active: Boolean(severity),
    severity,
    onHand,
    threshold,
    dailyUsage: Number(dailyUsage.toFixed(3)),
    projectedDaysRemaining,
    projectionSupported
  };
};

const ALERT_SEVERITY_RANK = Object.freeze({ low_stock: 1, projected_stockout: 2, critical_stock: 3 });
const shouldNotifyInventoryTransition = (previous = {}, next = {}) => Boolean(
  next.active && (!previous.active
    || Number(ALERT_SEVERITY_RANK[next.severity] || 0) > Number(ALERT_SEVERITY_RANK[previous.severity] || 0))
);

const inventoryAlertRecipients = async store => {
  const recipients = new Set(store.owner ? [String(store.owner)] : []);
  const users = await User.find({ store: store._id, isActive: { $ne: false }, isDeleted: { $ne: true } })
    .select('_id role staffType permissions').lean();
  users.forEach(user => {
    const role = normalizeRole(user);
    const operationalRecipient = ['manager', 'inventory_staff', 'procurement_officer'].includes(role);
    const permitted = hasPermission(user, 'inventory.view')
      || hasPermission(user, 'inventory.manage')
      || hasPermission(user, 'inventory.adjust')
      || hasPermission(user, 'procurement.manage');
    if (operationalRecipient && permitted) recipients.add(String(user._id));
  });
  return [...recipients];
};

const inventoryAlertCopy = (productName, state) => {
  const stock = `${state.onHand} unit${state.onHand === 1 ? '' : 's'}`;
  if (state.severity === 'critical_stock') return {
    title: `Critical Stock: ${productName}`,
    message: `${productName} is out of stock (configured reorder point: ${state.threshold}). Review procurement before accepting further demand.`
  };
  if (state.severity === 'projected_stockout') return {
    title: `Projected Stockout: ${productName}`,
    message: `${productName} has ${stock} remaining and may run out in approximately ${state.projectedDaysRemaining} days based on sufficient recent paid-order history. Review procurement and supplier lead time.`
  };
  return {
    title: `Low Stock: ${productName}`,
    message: `${productName} has ${stock} remaining, at or below the configured reorder point of ${state.threshold}. Review replenishment needs.`
  };
};

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
    const [inventoryRows, recentOrders, overduePurchaseOrders, historicBookings, tomorrowBookings, recipients] = await Promise.all([
      Inventory.find({ store: store._id, isActive: { $ne: false } }).populate('product', 'name').lean(),
      Order.find({
        store: store._id,
        paymentStatus: 'paid',
        status: { $nin: ['cancelled', 'refunded', 'returned', 'payment_failed'] },
        createdAt: { $gte: historyStart },
        isDeleted: { $ne: true }
      }).select('items createdAt').lean(),
      PurchaseOrder.find({ store: store._id, isDeleted: { $ne: true }, status: { $nin: ['delivered', 'cancelled', 'returned'] }, estimatedDeliveryDate: { $lt: now } }).select('_id orderNumber estimatedDeliveryDate').lean(),
      Booking.countDocuments({ store: store._id, bookingDate: { $gte: historyStart, $lt: now }, status: { $nin: ['cancelled', 'rejected', 'no_show', 'confirmation_expired'] }, isDeleted: { $ne: true } }),
      Booking.countDocuments({ store: store._id, bookingDate: { $gte: tomorrow, $lt: dayAfterTomorrow }, status: { $nin: ['cancelled', 'rejected', 'no_show', 'confirmation_expired'] }, isDeleted: { $ne: true } }),
      inventoryAlertRecipients(store)
    ]);

    const usageByProduct = new Map();
    recentOrders.forEach(order => (order.items || []).filter(item => item.itemType === 'product').forEach(item => {
      const id = String(item.itemId);
      const usage = usageByProduct.get(id) || { units: 0, observations: 0 };
      usage.units += Number(item.quantity || 0);
      usage.observations += 1;
      usageByProduct.set(id, usage);
    }));

    for (const row of inventoryRows) {
      const usage = usageByProduct.get(String(row.product?._id || row.product)) || { units: 0, observations: 0 };
      const next = evaluateInventoryAlert({
        quantity: row.quantity,
        reorderLevel: row.reorderLevel,
        unitsLast30: usage.units,
        observations: usage.observations
      });
      const previous = row.operationalAlert || {};
      const notify = shouldNotifyInventoryTransition(previous, next);
      if (notify) {
        const productName = row.product?.name || 'An inventory item';
        const copy = inventoryAlertCopy(productName, next);
        for (const recipient of recipients) {
          const created = await createNotification({
            recipient,
            type: 'low_stock',
            title: copy.title,
            message: copy.message,
            relatedId: row._id,
            relatedModel: 'Inventory',
            targetUrl: '/admin/inventory'
          }, io);
          if (created) notificationsCreated += 1;
        }
      }
      const resolved = previous.active && !next.active;
      const update = {
        active: next.active,
        severity: next.severity,
        cycle: Number(previous.cycle || 0) + (next.active && !previous.active ? 1 : 0),
        triggeredAt: next.active && !previous.active ? now : previous.triggeredAt,
        lastNotifiedAt: notify ? now : previous.lastNotifiedAt,
        resolvedAt: resolved ? now : next.active ? null : previous.resolvedAt,
        projectedDaysRemaining: next.projectedDaysRemaining
      };
      await Inventory.updateOne({ _id: row._id, store: store._id }, { $set: { operationalAlert: update } });
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

module.exports = {
  DAY_MS,
  PROJECTED_STOCKOUT_DAYS,
  MINIMUM_DEMAND_OBSERVATIONS,
  ALERT_SEVERITY_RANK,
  evaluateInventoryAlert,
  shouldNotifyInventoryTransition,
  inventoryAlertRecipients,
  notifyOnce,
  processDssAlerts
};
