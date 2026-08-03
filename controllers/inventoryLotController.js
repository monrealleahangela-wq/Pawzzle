const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const resolveStore = require('../utils/resolveStore');

const listLots = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const filter = { store };
    if (req.query.productId) filter.product = req.query.productId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.vaccine === 'true') filter.isVaccine = true;
    const lots = await InventoryLot.find(filter)
      .populate('product', 'name sku category images')
      .populate('supplier', 'businessName')
      .sort({ expiresAt: 1, createdAt: -1 });
    res.json({ lots });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getExpiryAlerts = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365);
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 86400000);
    const lots = await InventoryLot.find({
      store, quantityAvailable: { $gt: 0 }, expiresAt: { $lte: cutoff },
      status: { $in: ['available', 'expired'] }
    }).populate('product', 'name sku category').sort({ expiresAt: 1 });
    const alerts = lots.map((lot) => ({
      ...lot.toObject(),
      daysUntilExpiry: Math.ceil((new Date(lot.expiresAt) - now) / 86400000),
      severity: lot.expiresAt <= now ? 'expired'
        : (lot.expiresAt - now <= 7 * 86400000 ? 'critical'
          : (lot.expiresAt - now <= 30 * 86400000 ? 'high' : 'warning'))
    }));
    res.json({
      horizonDays: days,
      summary: {
        total: alerts.length,
        expired: alerts.filter((a) => a.severity === 'expired').length,
        critical: alerts.filter((a) => a.severity === 'critical').length,
        vaccines: alerts.filter((a) => a.isVaccine).length
      },
      alerts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const receiveLot = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const lot = await InventoryLedgerService.receiveLot({
      ...req.body, store, product: req.body.productId, performedBy: req.user._id
    });
    res.status(201).json({ message: 'Inventory lot received.', lot });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const listTransactions = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const filter = { store };
    if (req.query.productId) filter.product = req.query.productId;
    if (req.query.lotId) filter.lot = req.query.lotId;
    const transactions = await InventoryTransaction.find(filter)
      .populate('product', 'name sku').populate('lot', 'lotNumber expiresAt')
      .populate('performedBy', 'firstName lastName role')
      .sort({ occurredAt: -1 }).limit(Math.min(Number(req.query.limit) || 100, 500));
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { listLots, getExpiryAlerts, receiveLot, listTransactions };
