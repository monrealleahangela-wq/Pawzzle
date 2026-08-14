const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DecisionSupportService = require('../services/decisionSupportService');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('inventory DSS explains depletion, trend, reorder quantity, evidence, action, and confidence', () => {
  const result = DecisionSupportService.explainInventoryPosition({
    product: { _id: 'p1', name: 'Dog Shampoo', sku: 'DS-1' },
    inventory: { quantity: 10, reorderLevel: 12, maxStock: 100, supplierProductRef: { deliveryLeadTimeDays: 5 } },
    unitsLast30: 30,
    unitsPrevious30: 15,
    observations: 20
  });
  assert.equal(result.inventoryPosition.daysRemaining, 10);
  assert.equal(result.usageTrend.direction, 'increasing');
  assert.equal(result.decision.shouldReorder, true);
  assert.ok(result.decision.suggestedReorderQuantity > 0);
  assert.ok(result.why.includes('days of stock'));
  assert.ok(result.basedOn.length >= 4);
  assert.match(result.recommendedAction, /purchase order/i);
  assert.ok(['limited', 'moderate', 'high'].includes(result.confidenceLabel));
});

test('inventory DSS does not fabricate depletion when there is no usage history', () => {
  const result = DecisionSupportService.explainInventoryPosition({
    product: { _id: 'p2', name: 'New Item' },
    inventory: { quantity: 20, reorderLevel: 5 },
    unitsLast30: 0,
    unitsPrevious30: 0,
    observations: 0
  });
  assert.equal(result.inventoryPosition.daysRemaining, null);
  assert.match(result.why, /not enough recent usage/i);
  assert.equal(result.confidenceLabel, 'limited');
});

test('booking demand forecast uses recorded days and hours with a disclosed sample size', () => {
  const now = new Date('2026-08-14T12:00:00.000Z');
  const bookings = [];
  for (let week = 1; week <= 6; week += 1) {
    const monday = new Date(now.getTime() - week * 7 * 86400000 - 3 * 86400000);
    bookings.push({ bookingDate: monday, startTime: '09:00', status: 'completed' });
    bookings.push({ bookingDate: monday, startTime: '09:00', status: 'completed' });
  }
  bookings.push({ bookingDate: new Date(now.getTime() - 86400000), startTime: '15:00', status: 'cancelled' });
  const forecast = DecisionSupportService.bookingDemandForecast(bookings, { now, activeSpecialists: 1 });
  assert.equal(forecast.sampleSize, 12);
  assert.equal(forecast.busiestHours[0].label, '09:00');
  assert.ok(forecast.busiestDays[0].bookings >= 12);
  assert.ok(forecast.basedOn.some(value => value.includes('12')));
  assert.ok(forecast.recommendedStaffing.specialists >= 2);
});

test('supplier DSS ranks actual purchase-order outcomes and explains the ranking', () => {
  const supplier = { _id: 's1', businessName: 'Reliable Supply' };
  const rows = [
    { supplier, status: 'delivered', createdAt: new Date('2026-01-01'), estimatedDeliveryDate: new Date('2026-01-05'), actualDeliveryDate: new Date('2026-01-04'), items: [{ unitPrice: 100 }] },
    { supplier, status: 'delivered', createdAt: new Date('2026-02-01'), estimatedDeliveryDate: new Date('2026-02-05'), actualDeliveryDate: new Date('2026-02-05'), items: [{ unitPrice: 102 }] }
  ];
  const result = DecisionSupportService.supplierInsights(rows)[0];
  assert.equal(result.supplier.name, 'Reliable Supply');
  assert.equal(result.evidence.delivered, 2);
  assert.ok(result.score > 80);
  assert.match(result.why, /delivery completion/i);
  assert.ok(result.basedOn.length >= 3);
});

test('store health score is a deterministic weighted result with strengths and attention areas', () => {
  const health = DecisionSupportService.storeHealthScore({
    revenueGrowth: 10,
    bookingTotal: 10,
    bookingCompleted: 8,
    bookingCancelled: 2,
    reviewCount: 5,
    averageRating: 4.5,
    inventoryTotal: 10,
    inventoryRiskCount: 1,
    supplierScore: 85,
    pendingPayouts: 0,
    serviceTotal: 10,
    serviceCompleted: 8
  });
  assert.equal(typeof health.overallScore, 'number');
  assert.ok(health.overallScore >= 70);
  assert.ok(health.components.every(component => component.evidence));
  assert.match(health.why, /weighted result/i);
});

test('risk indicators include reasons, evidence, action, severity, and stable ordering', () => {
  const inventory = DecisionSupportService.explainInventoryPosition({ product: { _id: 'p1', name: 'Item' }, inventory: { quantity: 0, reorderLevel: 5 }, observations: 0 });
  const risks = DecisionSupportService.riskIndicators({ inventory: [inventory], credentialsExpired: 1, credentialsExpiring: 0, cancellationRate: 25, cancelledBookings: 5, totalBookings: 20, pendingPayouts: 1, overdueProcurement: 2 });
  assert.equal(risks[0].severity, 'critical');
  assert.ok(risks.every(risk => risk.reason && risk.evidence && risk.suggestedAction));
});

test('customer recommendations use owned pet records and recorded vaccination evidence without medical diagnosis', () => {
  const source = read('controllers/serviceRecommendationController.js');
  assert.match(source, /PetProfile\.findOne\(\{ _id: req\.query\.petId, owner: req\.user\._id \}\)/);
  assert.match(source, /VaccinationRecord\.find\(\{ pet: pet\._id \}\)/);
  assert.match(source, /does not diagnose conditions/);
  assert.match(source, /why:/);
  assert.match(source, /basedOn:/);
  assert.match(source, /recommendedAction:/);
});

test('specialist DSS preserves eligibility and store checks while exposing explainable ranking', () => {
  const pricing = read('utils/pricingEngine.js');
  const booking = read('controllers/bookingController.js');
  assert.match(pricing, /String\(staff\.store\) !== String\(service\.store\?\._id \|\| service\.store\)/);
  assert.match(pricing, /isProfessionallyAssignable/);
  assert.match(pricing, /isWithinStaffSchedule/);
  assert.match(pricing, /matchScore/);
  assert.match(pricing, /matchExplanation/);
  assert.match(booking, /specialistRecommendation/);
});

test('DSS notifications reuse existing notifications and enforce a duplicate window', () => {
  const alerts = read('services/dssAlertService.js');
  const server = read('server.js');
  assert.match(alerts, /Notification\.findOne/);
  assert.match(alerts, /createdAt: \{ \$gte: since \}/);
  assert.match(alerts, /createNotification/);
  assert.match(server, /processDssAlerts/);
});

test('store and platform dashboards consume their scoped DSS response only', () => {
  const operations = read('services/operationsDashboardService.js');
  const storeController = read('controllers/storeController.js');
  const platform = read('controllers/dssController.js');
  assert.match(operations, /store: storeId/);
  assert.match(storeController, /buildStoreOperationsSnapshot\(store/);
  assert.match(platform, /platformDecisionSupport/);
  assert.match(read('routes/dss.js'), /superAdminOnly, getSuperAdminInsights/);
});
