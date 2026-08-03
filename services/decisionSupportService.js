const Order = require('../models/Order');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const DSSRecommendation = require('../models/DSSRecommendation');

const DAY_MS = 86400000;
const round = (value, places = 2) => Number(Number(value || 0).toFixed(places));

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
    const suppliers = await Supplier.find({ isDeleted: false, status: 'verified' }).lean();
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
        warning: own.length < 3 ? 'Insufficient completed orders for a stable ranking.' : null
      };
    }).sort((a, b) => b.score - a.score);
  }
}

module.exports = DecisionSupportService;
