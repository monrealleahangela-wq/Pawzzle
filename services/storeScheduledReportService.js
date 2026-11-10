const Store = require('../models/Store');
const { buildOperationalReport } = require('../controllers/storePlanFeaturesController');
const { assertStoreEntitlement } = require('./storeSubscriptionService');
const { ENTITLEMENTS } = require('../config/subscriptionPlans');
const { deliverHtmlEmail, wrapInTemplate } = require('../utils/emailService');

const frequencyDays = value => value === 'weekly' ? 7 : 30;

const runScheduledStoreReports = async ({ now = new Date(), limit = 25 } = {}) => {
  const candidates = await Store.find({
    isActive: true, isDeleted: { $ne: true }, 'reportSchedule.enabled': true,
    'reportSchedule.nextRunAt': { $lte: now }
  }).sort({ 'reportSchedule.nextRunAt': 1 }).limit(Math.min(100, Math.max(1, Number(limit) || 25)));
  const results = [];
  for (const candidate of candidates) {
    const claimUntil = new Date(now.getTime() + 30 * 60000);
    const store = await Store.findOneAndUpdate({
      _id: candidate._id, 'reportSchedule.enabled': true,
      'reportSchedule.nextRunAt': { $lte: now }
    }, { $set: { 'reportSchedule.nextRunAt': claimUntil } }, { new: true });
    if (!store) continue;
    try {
      await assertStoreEntitlement(store._id, ENTITLEMENTS.SCHEDULED_REPORTS);
      const report = await buildOperationalReport(store, { days: store.reportSchedule.frequency === 'weekly' ? 7 : 30 });
      const money = Number(report.sales.revenue || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
      const html = wrapInTemplate(`${store.name} performance report`, `
        <p>Here is your ${store.reportSchedule.frequency} Pawzzle store summary.</p>
        <ul><li>Paid orders: <strong>${report.sales.orders}</strong></li><li>Paid bookings: <strong>${report.sales.bookings}</strong></li>
        <li>Revenue: <strong>${money}</strong></li><li>Unique customers: <strong>${report.customers.unique}</strong></li>
        <li>Low-stock items: <strong>${report.inventory.lowStock}</strong></li></ul>`);
      const delivery = await deliverHtmlEmail({ email: store.reportSchedule.recipientEmail, subject: `${store.name} Pawzzle performance report`, html });
      if (!delivery?.success) throw new Error(delivery?.errorMessage || 'Email delivery failed.');
      const nextRunAt = new Date(now.getTime() + frequencyDays(store.reportSchedule.frequency) * 86400000);
      await Store.updateOne({ _id: store._id, 'reportSchedule.nextRunAt': claimUntil }, {
        $set: { 'reportSchedule.lastRunAt': now, 'reportSchedule.nextRunAt': nextRunAt }
      });
      results.push({ store: store._id, status: 'sent', nextRunAt });
    } catch (error) {
      const retryAt = new Date(now.getTime() + 6 * 3600000);
      await Store.updateOne({ _id: store._id, 'reportSchedule.nextRunAt': claimUntil }, { $set: { 'reportSchedule.nextRunAt': retryAt } });
      results.push({ store: store._id, status: 'failed', error: error.message, retryAt });
    }
  }
  return results;
};

module.exports = { runScheduledStoreReports };
