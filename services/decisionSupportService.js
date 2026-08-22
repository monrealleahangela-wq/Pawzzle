const Order = require('../models/Order');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const DSSRecommendation = require('../models/DSSRecommendation');
const { getActiveSupplierFilter } = require('../utils/supplierLifecycle');

const DAY_MS = 86400000;
const round = (value, places = 2) => Number(Number(value || 0).toFixed(places));
const clamp = (value, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, Number(value || 0)));
const confidenceLabel = confidence => confidence >= 0.75 ? 'high' : confidence >= 0.45 ? 'moderate' : 'limited';

const dateKey = (date) => new Date(date).toISOString().slice(0, 10);

const buildDailySeries = (events, start, days) => {
  const totals = new Map();
  events.forEach(({ date, quantity }) => {
    const key = dateKey(date);
    totals.set(key, (totals.get(key) || 0) + Number(quantity || 0));
  });
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS);
    return { date, value: totals.get(dateKey(date)) || 0 };
  });
};

const movingAverageForecast = (values, horizon, window = 7) => {
  const history = [...values];
  const forecast = [];
  for (let i = 0; i < horizon; i += 1) {
    const sample = history.slice(-Math.min(window, history.length));
    const next = sample.length ? sample.reduce((a, b) => a + b, 0) / sample.length : 0;
    forecast.push(next);
    history.push(next);
  }
  return forecast;
};

const seasonalNaiveForecast = (values, horizon, season = 7) =>
  Array.from({ length: horizon }, (_, i) => values[values.length - season + (i % season)] || 0);

const crostonForecast = (values, horizon, alpha = 0.2) => {
  let demand = 0;
  let interval = 1;
  let gap = 1;
  let initialized = false;
  values.forEach((value) => {
    if (value > 0) {
      if (!initialized) {
        demand = value;
        interval = gap;
        initialized = true;
      } else {
        demand += alpha * (value - demand);
        interval += alpha * (gap - interval);
      }
      gap = 1;
    } else {
      gap += 1;
    }
  });
  const estimate = initialized ? (1 - alpha / 2) * demand / Math.max(interval, 1) : 0;
  return Array(horizon).fill(estimate);
};

const wape = (actual, forecast) => {
  const denominator = actual.reduce((sum, value) => sum + Math.abs(value), 0);
  if (denominator === 0) return null;
  return actual.reduce((sum, value, i) => sum + Math.abs(value - forecast[i]), 0) / denominator;
};

const backtest = (values, method) => {
  const holdout = Math.min(14, Math.max(3, Math.floor(values.length * 0.2)));
  if (values.length < 14) return { error: null, holdout: 0 };
  const train = values.slice(0, -holdout);
  const actual = values.slice(-holdout);
  return { error: wape(actual, method(train, holdout)), holdout };
};

const selectForecast = (values, horizon) => {
  const nonZeroRatio = values.filter((value) => value > 0).length / Math.max(values.length, 1);
  const candidates = nonZeroRatio < 0.3
    ? [{ name: 'croston-sba', run: crostonForecast }]
    : [
      { name: 'moving-average-7', run: (v, h) => movingAverageForecast(v, h, 7) },
      { name: 'seasonal-naive-7', run: seasonalNaiveForecast }
    ];
  const tested = candidates.map((candidate) => ({
    ...candidate,
    ...backtest(values, candidate.run)
  })).sort((a, b) => (a.error ?? Infinity) - (b.error ?? Infinity));
  const selected = tested[0];
  const forecast = selected.run(values, horizon);
  const mean = forecast.reduce((a, b) => a + b, 0) / Math.max(forecast.length, 1);
  const residualError = selected.error ?? 0.5;
  return {
    model: selected.name,
    forecast,
    wape: selected.error,
    holdout: selected.holdout,
    lowerDaily: Math.max(0, mean * (1 - residualError)),
    upperDaily: mean * (1 + residualError),
    confidence: selected.error === null
      ? Math.min(0.45, values.length / 60)
      : Math.max(0.1, Math.min(0.95, 1 - selected.error))
  };
};

class DecisionSupportService {
  static explainInventoryPosition({ product, inventory, unitsLast30 = 0, unitsPrevious30 = 0, observations = 0 }) {
    const onHand = Number(inventory?.quantity ?? product?.stockQuantity ?? 0);
    const reorderLevel = Number(inventory?.reorderLevel ?? product?.minStockThreshold ?? 10);
    const maxStock = Number(inventory?.maxStock || Math.max(reorderLevel * 4, onHand));
    const dailyUsage = Number(unitsLast30 || 0) / 30;
    const previousDailyUsage = Number(unitsPrevious30 || 0) / 30;
    const trendPercent = previousDailyUsage > 0
      ? round(((dailyUsage - previousDailyUsage) / previousDailyUsage) * 100, 1)
      : dailyUsage > 0 ? 100 : 0;
    const daysRemaining = dailyUsage > 0 ? round(onHand / dailyUsage, 1) : null;
    const leadTimeDays = Number(inventory?.supplierProductRef?.deliveryLeadTimeDays || 7);
    const safetyStock = Math.max(reorderLevel, Math.ceil(dailyUsage * 7));
    const targetStock = Math.max(reorderLevel * 2, Math.ceil(dailyUsage * (leadTimeDays + 30) + safetyStock));
    const suggestedReorderQuantity = Math.max(0, Math.min(maxStock, targetStock) - onHand);
    const shouldReorder = onHand <= reorderLevel || (daysRemaining !== null && daysRemaining <= leadTimeDays + 7);
    const confidence = round(Math.min(0.95, observations > 0 ? 0.3 + Math.min(observations, 30) / 50 : 0.2), 2);
    const trend = trendPercent > 10 ? 'increasing' : trendPercent < -10 ? 'decreasing' : 'stable';
    const productName = product?.name || 'This item';
    const why = daysRemaining === null
      ? `${productName} is at ${onHand} units, but there is not enough recent usage to estimate a depletion date.`
      : `${productName} has about ${daysRemaining} days of stock remaining at ${round(dailyUsage, 2)} units per day.`;
    return {
      product: { id: product?._id || product?.id, name: productName, sku: product?.sku },
      inventoryPosition: { onHand, reorderLevel, daysRemaining },
      usageTrend: { direction: trend, percent: trendPercent, unitsLast30, unitsPrevious30, dailyUsage: round(dailyUsage, 3) },
      decision: { shouldReorder, suggestedReorderQuantity: Math.ceil(suggestedReorderQuantity), reorderWithinDays: shouldReorder ? Math.max(0, Math.floor((daysRemaining ?? 0) - leadTimeDays)) : null },
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      why,
      basedOn: [`${onHand} units on hand`, `${unitsLast30} units used or sold in 30 days`, `${reorderLevel} unit reorder level`, `${leadTimeDays} day assumed or configured lead time`],
      recommendedAction: shouldReorder
        ? `Review a purchase order for ${Math.ceil(suggestedReorderQuantity)} units and confirm supplier lead time.`
        : 'Continue monitoring usage; no immediate reorder is indicated.',
      forecastReason: `${trend} 30-day usage with ${observations} recorded observation${observations === 1 ? '' : 's'}.`
    };
  }

  static bookingDemandForecast(bookings = [], { now = new Date(), activeSpecialists = 0 } = {}) {
    const historyStart = new Date(now.getTime() - 90 * DAY_MS);
    const valid = bookings.filter(row => {
      const date = new Date(row.bookingDate || row.createdAt);
      return date >= historyStart && date <= now && !['cancelled', 'rejected', 'no_show', 'confirmation_expired'].includes(row.status);
    });
    const dayCounts = Array(7).fill(0);
    const hourCounts = new Map();
    const dateHourCounts = new Map();
    valid.forEach(row => {
      const date = new Date(row.bookingDate || row.createdAt);
      const hour = Number(String(row.startTime || '0').split(':')[0]);
      dayCounts[date.getDay()] += 1;
      if (Number.isFinite(hour)) {
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        const key = `${dateKey(date)}-${hour}`;
        dateHourCounts.set(key, (dateHourCounts.get(key) || 0) + 1);
      }
    });
    const occurrences = 90 / 7;
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const busiestDays = dayCounts.map((count, day) => ({ day, label: weekdays[day], bookings: count, averagePerDay: round(count / occurrences, 1) })).sort((a, b) => b.bookings - a.bookings);
    const busiestHours = [...hourCounts.entries()].map(([hour, count]) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, bookings: count })).sort((a, b) => b.bookings - a.bookings);
    const topDay = busiestDays[0];
    const upcomingPeaks = Array.from({ length: 14 }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + index + 1))
      .filter(date => topDay && date.getDay() === topDay.day)
      .map(date => ({ date: dateKey(date), expectedBookings: topDay.averagePerDay, reason: `${topDay.label} has the highest observed 90-day booking volume.` }));
    const observedPeakConcurrency = Math.max(...dateHourCounts.values(), 0);
    const recommendedStaffing = valid.length ? Math.max(1, observedPeakConcurrency) : 0;
    const confidence = round(Math.min(0.95, valid.length / 60), 2);
    return {
      horizonDays: 14,
      historyDays: 90,
      sampleSize: valid.length,
      busiestDays: busiestDays.slice(0, 3),
      busiestHours: busiestHours.slice(0, 3),
      upcomingPeaks,
      recommendedStaffing: {
        specialists: recommendedStaffing,
        currentlyActive: activeSpecialists,
        gap: Math.max(0, recommendedStaffing - activeSpecialists)
      },
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      why: valid.length
        ? `${topDay.label} and ${busiestHours[0]?.label || 'the observed peak hour'} carry the highest recent booking load.`
        : 'There is not yet enough completed booking history to identify a peak.',
      basedOn: [`${valid.length} non-cancelled bookings from the last 90 days`, 'Recorded booking dates and start times'],
      recommendedAction: recommendedStaffing > activeSpecialists
        ? `Plan at least ${recommendedStaffing} available specialists during forecast peaks.`
        : 'Current active specialist coverage meets the observed peak concurrency.'
    };
  }

  static supplierInsights(purchaseOrders = []) {
    const groups = new Map();
    purchaseOrders.filter(order => order.supplier).forEach(order => {
      const id = String(order.supplier?._id || order.supplier);
      const supplier = order.supplier;
      const group = groups.get(id) || { id, name: supplier.businessName || 'Supplier', orders: [], prices: [] };
      group.orders.push(order);
      (order.items || []).forEach(item => group.prices.push(Number(item.unitPrice || 0)));
      groups.set(id, group);
    });
    return [...groups.values()].map(group => {
      const delivered = group.orders.filter(order => order.status === 'delivered');
      const onTime = delivered.filter(order => !order.estimatedDeliveryDate || (order.actualDeliveryDate && new Date(order.actualDeliveryDate) <= new Date(order.estimatedDeliveryDate))).length;
      const deliveryDays = delivered.filter(order => order.actualDeliveryDate).map(order => (new Date(order.actualDeliveryDate) - new Date(order.createdAt)) / DAY_MS).filter(value => value >= 0);
      const meanPrice = group.prices.length ? group.prices.reduce((a, b) => a + b, 0) / group.prices.length : 0;
      const priceVariance = group.prices.length ? group.prices.reduce((total, price) => total + ((price - meanPrice) ** 2), 0) / group.prices.length : 0;
      const priceConsistency = meanPrice ? clamp(100 - (Math.sqrt(priceVariance) / meanPrice) * 100) : 0;
      const reliability = group.orders.length ? (delivered.length / group.orders.length) * 100 : 0;
      const onTimeRate = delivered.length ? (onTime / delivered.length) * 100 : 0;
      const score = round(0.5 * reliability + 0.3 * onTimeRate + 0.2 * priceConsistency, 1);
      const confidence = round(Math.min(0.95, group.orders.length / 10), 2);
      return {
        supplier: { id: group.id, name: group.name },
        score,
        confidence,
        confidenceLabel: confidenceLabel(confidence),
        evidence: { orders: group.orders.length, delivered: delivered.length, onTime, averageDeliveryDays: deliveryDays.length ? round(deliveryDays.reduce((a, b) => a + b, 0) / deliveryDays.length, 1) : null, priceConsistency: round(priceConsistency, 1) },
        why: `${group.name} scored ${score}/100 from delivery completion, on-time performance, and observed price consistency.`,
        basedOn: [`${group.orders.length} purchase orders`, `${delivered.length} delivered`, `${round(priceConsistency, 1)}% price consistency`],
        recommendedAction: confidence < 0.45 ? 'Collect more completed purchase-order history before making this supplier the default.' : 'Prefer this supplier when its catalog, price, and lead time fit the required item.'
      };
    }).sort((a, b) => b.score - a.score);
  }

  static storeHealthScore(input = {}) {
    const components = [];
    const add = (key, label, weight, score, evidence) => {
      if (score === null || score === undefined || Number.isNaN(Number(score))) return;
      components.push({ key, label, weight, score: clamp(score), evidence });
    };
    add('sales', 'Sales momentum', 15, input.revenueGrowth === null || input.revenueGrowth === undefined ? null : 50 + clamp(input.revenueGrowth, -50, 50), `${round(input.revenueGrowth, 1)}% month-over-month growth`);
    add('bookings', 'Booking completion', 20, input.bookingTotal ? (input.bookingCompleted / input.bookingTotal) * 100 : null, `${input.bookingCompleted || 0} of ${input.bookingTotal || 0} bookings completed`);
    add('cancellations', 'Cancellation control', 15, input.bookingTotal ? 100 - (input.bookingCancelled / input.bookingTotal) * 100 : null, `${input.bookingCancelled || 0} cancelled bookings`);
    add('reviews', 'Customer reviews', 15, input.reviewCount ? (Number(input.averageRating || 0) / 5) * 100 : null, `${input.reviewCount || 0} reviews averaging ${round(input.averageRating, 1)}/5`);
    add('inventory', 'Inventory health', 15, input.inventoryTotal ? ((input.inventoryTotal - input.inventoryRiskCount) / input.inventoryTotal) * 100 : null, `${input.inventoryRiskCount || 0} of ${input.inventoryTotal || 0} items need attention`);
    add('suppliers', 'Supplier performance', 10, input.supplierScore ?? null, `${round(input.supplierScore, 1)} average supplier score`);
    add('payouts', 'Payout status', 5, input.pendingPayouts === null || input.pendingPayouts === undefined ? null : input.pendingPayouts > 0 ? 50 : 100, `${input.pendingPayouts || 0} pending payout requests`);
    add('services', 'Service completion', 5, input.serviceTotal ? (input.serviceCompleted / input.serviceTotal) * 100 : null, `${input.serviceCompleted || 0} completed services`);
    const evaluatedWeight = components.reduce((total, component) => total + component.weight, 0);
    const overallScore = evaluatedWeight ? round(components.reduce((total, component) => total + component.score * component.weight, 0) / evaluatedWeight, 0) : null;
    return {
      overallScore,
      rating: overallScore === null ? 'insufficient_data' : overallScore >= 80 ? 'healthy' : overallScore >= 60 ? 'monitor' : 'needs_attention',
      strengths: components.filter(component => component.score >= 75).sort((a, b) => b.score - a.score).slice(0, 3),
      areasNeedingAttention: components.filter(component => component.score < 60).sort((a, b) => a.score - b.score).slice(0, 3),
      components,
      why: overallScore === null ? 'Not enough recorded operational data is available.' : `The score is the weighted result of ${components.length} available operational indicators.`,
      basedOn: components.map(component => component.evidence),
      recommendedAction: overallScore === null ? 'Continue recording transactions and operational outcomes.' : overallScore < 60 ? 'Address the lowest-scoring operational area first.' : 'Maintain strong areas and monitor lower-scoring indicators.'
    };
  }

  static riskIndicators(input = {}) {
    const risks = [];
    const add = (key, severity, title, reason, evidence, suggestedAction, relatedId) => risks.push({ key, severity, title, reason, evidence, suggestedAction, relatedId });
    (input.inventory || []).filter(item => item.decision?.shouldReorder).forEach(item => add(`inventory:${item.product.id}`, item.inventoryPosition.onHand <= 0 || (item.inventoryPosition.daysRemaining !== null && item.inventoryPosition.daysRemaining <= 3) ? 'critical' : 'high', 'Inventory running low', item.why, item.basedOn, item.recommendedAction, item.product.id));
    if ((input.credentialsExpired || 0) > 0 || (input.credentialsExpiring || 0) > 0) add('credentials', input.credentialsExpired > 0 ? 'critical' : 'high', 'Professional credentials need attention', `${input.credentialsExpired || 0} credentials are expired and ${input.credentialsExpiring || 0} expire within 30 days.`, ['Current professional credential expiration dates'], 'Review verification documents and renew credentials before future assignment.', null);
    if (input.supplierDelayCount > 0) add('supplier-delays', 'high', 'Supplier delivery delays', `${input.supplierDelayCount} delivered purchase orders arrived after their estimated date.`, ['Estimated and actual purchase-order delivery dates'], 'Review affected suppliers and confirm lead times before the next reorder.', null);
    if (input.cancellationRate >= 20) add('booking-cancellations', input.cancellationRate >= 35 ? 'critical' : 'high', 'High booking cancellation rate', `${round(input.cancellationRate, 1)}% of recorded bookings were cancelled or rejected.`, [`${input.cancelledBookings} cancelled of ${input.totalBookings} bookings`], 'Review cancellation reasons, proposal response time, and schedule availability.', null);
    if (input.pendingPayouts > 0) add('pending-payouts', 'medium', 'Pending payouts', `${input.pendingPayouts} payout request${input.pendingPayouts === 1 ? ' is' : 's are'} pending.`, ['Current payout status records'], 'Review payout requests and resolve any held items.', null);
    if (input.overdueProcurement > 0) add('overdue-procurement', 'high', 'Overdue procurement', `${input.overdueProcurement} purchase order${input.overdueProcurement === 1 ? ' is' : 's are'} past the estimated delivery date.`, ['Open purchase-order status and estimated delivery dates'], 'Contact the supplier and update the delivery expectation.', null);
    if (input.bookingCongestion) add('booking-congestion', 'medium', 'Upcoming booking congestion', input.bookingCongestion.reason, input.bookingCongestion.evidence, input.bookingCongestion.action, null);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return risks.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }

  static async forecastProduct({ store, productId, horizon = 30, historyDays = 180 }) {
    horizon = Math.min(Math.max(Number(horizon), 7), 90);
    historyDays = Math.min(Math.max(Number(historyDays), 30), 730);
    const start = new Date(Date.now() - historyDays * DAY_MS);
    const orders = await Order.find({
      store, createdAt: { $gte: start }, paymentStatus: 'paid',
      status: { $nin: ['cancelled', 'refunded', 'returned'] },
      'items.itemId': productId, isDeleted: { $ne: true }
    }).select('items createdAt');
    const events = [];
    orders.forEach((order) => order.items
      .filter((item) => item.itemType === 'product' && item.itemId.toString() === productId.toString())
      .forEach((item) => events.push({ date: order.createdAt, quantity: item.quantity })));
    const series = buildDailySeries(events, start, historyDays);
    const values = series.map((row) => row.value);
    const result = selectForecast(values, horizon);
    const total = result.forecast.reduce((a, b) => a + b, 0);
    return {
      productId,
      horizonDays: horizon,
      historyDays,
      dataThrough: new Date(),
      modelVersion: `dss-${result.model}-v1`,
      forecastUnits: round(total),
      averageDailyUnits: round(total / horizon, 3),
      history: {
        observations: events.length,
        unitsLast30: round(values.slice(-30).reduce((a, b) => a + b, 0)),
        unitsPrevious30: round(values.slice(-60, -30).reduce((a, b) => a + b, 0))
      },
      interval: {
        lowerUnits: round(result.lowerDaily * horizon),
        upperUnits: round(result.upperDaily * horizon)
      },
      accuracy: { metric: 'WAPE', value: result.wape === null ? null : round(result.wape, 4), holdoutDays: result.holdout },
      confidence: round(result.confidence, 3),
      warnings: [
        ...(events.length < 10 ? ['Limited sales history; treat this forecast as preliminary.'] : []),
        ...(result.wape !== null && result.wape > 0.5 ? ['Historical forecast error is high.'] : [])
      ],
      daily: result.forecast.map((value, index) => ({
        date: dateKey(new Date(Date.now() + (index + 1) * DAY_MS)),
        units: round(value, 3)
      }))
    };
  }

  static async replenishment({ store, productId, horizon = 30, save = false, generatedBy }) {
    const [forecast, inventory, product] = await Promise.all([
      this.forecastProduct({ store, productId, horizon }),
      Inventory.findOne({ store, product: productId }),
      Product.findById(productId).select('name sku supplierProductRef')
    ]);
    if (!product) throw new Error('Product not found.');
    const onHand = inventory?.quantity || 0;
    const leadTimeDays = 7;
    const daily = forecast.averageDailyUnits;
    const leadTimeDemand = daily * leadTimeDays;
    const safetyStock = Math.max(
      daily * 3,
      Math.max(0, forecast.interval.upperUnits - forecast.forecastUnits) * leadTimeDays / horizon
    );
    const reorderPoint = leadTimeDemand + safetyStock;
    const targetStock = daily * (leadTimeDays + Number(horizon)) + safetyStock;
    const rawQuantity = Math.max(0, targetStock - onHand);
    const recommendedQuantity = Math.ceil(rawQuantity);
    const daysOfSupply = daily > 0 ? onHand / daily : null;
    const shouldReorder = onHand <= reorderPoint;
    const output = {
      product: { id: product._id, name: product.name, sku: product.sku },
      forecast,
      inventoryPosition: { onHand, daysOfSupply: daysOfSupply === null ? null : round(daysOfSupply, 1) },
      policy: {
        leadTimeDays,
        safetyStock: round(safetyStock),
        reorderPoint: round(reorderPoint),
        targetCoverageDays: leadTimeDays + Number(horizon)
      },
      decision: {
        shouldReorder,
        recommendedQuantity,
        estimatedReorderDate: shouldReorder
          ? dateKey(new Date())
          : dateKey(new Date(Date.now() + Math.max(0, daysOfSupply - leadTimeDays) * DAY_MS))
      },
      explanation: [
        `Expected lead-time demand is ${round(leadTimeDemand)} units.`,
        `Safety stock is ${round(safetyStock)} units based on forecast uncertainty.`,
        `Current stock of ${onHand} is ${shouldReorder ? 'at or below' : 'above'} the reorder point of ${round(reorderPoint)}.`
      ]
    };
    const enhanced = this.explainInventoryPosition({
      product,
      inventory,
      unitsLast30: forecast.history.unitsLast30,
      unitsPrevious30: forecast.history.unitsPrevious30,
      observations: forecast.history.observations
    });
    output.estimatedDaysRemaining = enhanced.inventoryPosition.daysRemaining;
    output.usageTrend = enhanced.usageTrend;
    output.confidenceIndicator = enhanced.confidenceLabel;
    output.forecastReason = enhanced.forecastReason;
    output.why = enhanced.why;
    output.basedOn = enhanced.basedOn;
    output.recommendedAction = enhanced.recommendedAction;
    if (save && recommendedQuantity > 0) {
      output.recommendation = await DSSRecommendation.create({
        store, decisionType: 'replenishment', subjectType: 'Product',
        subjectId: productId, dataThrough: forecast.dataThrough,
        modelVersion: forecast.modelVersion,
        inputsSnapshot: { onHand, leadTimeDays, horizon, forecast },
        recommendedAction: output.decision,
        alternatives: [
          { scenario: 'conservative', quantity: Math.ceil(Math.max(0, forecast.interval.lowerUnits - onHand)) },
          { scenario: 'high-demand', quantity: Math.ceil(Math.max(0, forecast.interval.upperUnits + safetyStock - onHand)) }
        ],
        confidence: forecast.confidence, explanation: output.explanation,
        expectedImpact: { target: 'reduce_stockout_risk' },
        generatedBy
      });
    }
    return output;
  }

  static async supplierScorecard({ store }) {
    const suppliers = await Supplier.find(getActiveSupplierFilter()).lean();
    const orders = await PurchaseOrder.find({
      store, isDeleted: false, status: { $in: ['delivered', 'returned', 'cancelled'] }
    }).lean();
    return suppliers.map((supplier) => {
      const own = orders.filter((order) => order.supplier.toString() === supplier._id.toString());
      const delivered = own.filter((order) => order.status === 'delivered');
      const onTime = delivered.filter((order) =>
        !order.estimatedDeliveryDate || (order.actualDeliveryDate && order.actualDeliveryDate <= order.estimatedDeliveryDate)
      ).length;
      const fillRates = own.flatMap((order) => order.items.map((item) =>
        item.quantity ? Math.min(1, (item.receivedQuantity || 0) / item.quantity) : 0
      ));
      const onTimeRate = delivered.length ? onTime / delivered.length : 0;
      const fillRate = fillRates.length ? fillRates.reduce((a, b) => a + b, 0) / fillRates.length : 0;
      const cancellationRate = own.length
        ? own.filter((order) => order.status === 'cancelled').length / own.length : 0;
      const score = 100 * (0.45 * onTimeRate + 0.4 * fillRate + 0.15 * (1 - cancellationRate));
      return {
        supplier: { id: supplier._id, name: supplier.businessName },
        evidence: { orders: own.length, delivered: delivered.length },
        criteria: {
          onTimeRate: round(onTimeRate, 3),
          fillRate: round(fillRate, 3),
          cancellationRate: round(cancellationRate, 3)
        },
        score: round(score, 1),
        confidence: round(Math.min(1, own.length / 10), 2),
        warning: own.length < 3 ? 'Insufficient completed orders for a stable ranking.' : null,
        why: `${supplier.businessName} scored ${round(score, 1)}/100 using delivery completion, fill rate, and cancellation history.`,
        basedOn: [`${own.length} purchase orders`, `${round(onTimeRate * 100, 1)}% on-time rate`, `${round(fillRate * 100, 1)}% fill rate`, `${round(cancellationRate * 100, 1)}% cancellation rate`],
        recommendedAction: own.length < 3 ? 'Collect more completed orders before relying on this ranking.' : 'Prefer this supplier when product availability, price, and lead time meet the purchase requirement.'
      };
    }).sort((a, b) => b.score - a.score);
  }
}

module.exports = DecisionSupportService;
