const ServiceSupply = require('../models/ServiceSupply');
const Service = require('../models/Service');
const Store = require('../models/Store');
const SupplyChainLog = require('../models/SupplyChainLog');
const { createNotification } = require('./notificationController');
const User = require('../models/User');

// ═══════════════════════════════════════════════════════════════
// SERVICE SUPPLY CRUD
// ═══════════════════════════════════════════════════════════════

const addSupply = async (req, res) => {
  try {
    let store = req.user.store;
    if (!store) {
      const s = await Store.findOne({ owner: req.user._id });
      if (s) store = s._id;
    }
    if (!store) return res.status(400).json({ message: 'No store found.' });

    const { name, sku, category, description, images, currentStock, minimumStock,
      maximumStock, unitOfMeasure, costPerUnit, usagePerService, linkedServices,
      supplier, supplierProduct, expirationDate } = req.body;

    if (!name || !category) return res.status(400).json({ message: 'Name and category are required.' });

    const supply = new ServiceSupply({
      store, addedBy: req.user._id,
      name, sku, category, description, images: images || [],
      currentStock: currentStock || 0, minimumStock: minimumStock || 5,
      maximumStock: maximumStock || 500, unitOfMeasure: unitOfMeasure || 'piece',
      costPerUnit: costPerUnit || 0, usagePerService: usagePerService || 1,
      linkedServices: linkedServices || [],
      supplier, supplierProduct, expirationDate
    });

    await supply.save();

    await SupplyChainLog.create({
      action: 'supply_added',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'ServiceSupply', id: supply._id },
      description: `Service supply "${name}" added (${currentStock || 0} ${unitOfMeasure || 'units'})`,
      store
    });

    res.status(201).json(supply);
  } catch (error) {
    console.error('Add supply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getSupplies = async (req, res) => {
  try {
    let store = req.user.store;
    if (!store) {
      const s = await Store.findOne({ owner: req.user._id });
      if (s) store = s._id;
    }
    if (!store) return res.status(400).json({ message: 'No store found.' });

    const { category, status, search, page = 1, limit = 20 } = req.query;
    let filter = { store, isDeleted: false };
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const supplies = await ServiceSupply.find(filter)
      .populate('linkedServices', 'name')
      .populate('supplier', 'businessName')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await ServiceSupply.countDocuments(filter);

    res.json({ supplies, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Get supplies error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateSupply = async (req, res) => {
  try {
    const supply = await ServiceSupply.findById(req.params.id);
    if (!supply) return res.status(404).json({ message: 'Supply not found.' });

    const prev = { currentStock: supply.currentStock, costPerUnit: supply.costPerUnit };
    const allowed = ['name', 'sku', 'category', 'description', 'images', 'currentStock',
      'minimumStock', 'maximumStock', 'unitOfMeasure', 'costPerUnit', 'usagePerService',
      'linkedServices', 'supplier', 'supplierProduct', 'expirationDate', 'isActive'];
    allowed.forEach(key => { if (req.body[key] !== undefined) supply[key] = req.body[key]; });

    await supply.save();

    await SupplyChainLog.create({
      action: 'stock_adjusted',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'ServiceSupply', id: supply._id },
      description: `Supply "${supply.name}" updated`,
      store: supply.store,
      previousValue: prev,
      newValue: { currentStock: supply.currentStock, costPerUnit: supply.costPerUnit }
    });

    res.json(supply);
  } catch (error) {
    console.error('Update supply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteSupply = async (req, res) => {
  try {
    const supply = await ServiceSupply.findById(req.params.id);
    if (!supply) return res.status(404).json({ message: 'Supply not found.' });

    supply.isDeleted = true;
    supply.isActive = false;
    await supply.save();

    res.json({ message: 'Supply deleted.' });
  } catch (error) {
    console.error('Delete supply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Restock a supply
const restockSupply = async (req, res) => {
  try {
    const supply = await ServiceSupply.findById(req.params.id);
    if (!supply) return res.status(404).json({ message: 'Supply not found.' });

    const { quantity, costPerUnit, notes } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ message: 'Quantity must be positive.' });

    const prev = supply.currentStock;
    supply.currentStock += quantity;
    if (costPerUnit) supply.costPerUnit = costPerUnit;
    supply.lastRestockedAt = new Date();
    await supply.save();

    await SupplyChainLog.create({
      action: 'supply_restocked',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'ServiceSupply', id: supply._id },
      description: `"${supply.name}" restocked: +${quantity} (${prev} → ${supply.currentStock})`,
      store: supply.store,
      previousValue: { stock: prev },
      newValue: { stock: supply.currentStock },
      metadata: { notes }
    });

    res.json(supply);
  } catch (error) {
    console.error('Restock supply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Deduct supply after service completion
const deductSupply = async (req, res) => {
  try {
    const supply = await ServiceSupply.findById(req.params.id);
    if (!supply) return res.status(404).json({ message: 'Supply not found.' });

    const quantity = req.body.quantity || 1;
    await supply.deduct(quantity);

    await SupplyChainLog.create({
      action: 'supply_deducted',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'ServiceSupply', id: supply._id },
      description: `"${supply.name}" deducted: -${supply.usagePerService * quantity}`,
      store: supply.store
    });

    res.json(supply);
  } catch (error) {
    console.error('Deduct supply error:', error);
    res.status(error.message.includes('Insufficient') ? 400 : 500).json({ message: error.message || 'Server error' });
  }
};

// Check supply availability for a booking
const checkAvailability = async (req, res) => {
  try {
    const { serviceId, quantity } = req.query;
    if (!serviceId) return res.status(400).json({ message: 'Service ID is required.' });

    const supplies = await ServiceSupply.find({
      linkedServices: serviceId,
      isActive: true,
      isDeleted: false
    });

    const results = supplies.map(s => ({
      _id: s._id,
      name: s.name,
      available: s.currentStock - s.reservedStock,
      needed: s.usagePerService * (parseInt(quantity) || 1),
      canSupport: s.canSupport(parseInt(quantity) || 1),
      status: s.status
    }));

    const allAvailable = results.every(r => r.canSupport);

    res.json({ available: allAvailable, supplies: results });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get alerts (low stock, expired, etc.)
const getAlerts = async (req, res) => {
  try {
    let store = req.user.store;
    if (!store) {
      const s = await Store.findOne({ owner: req.user._id });
      if (s) store = s._id;
    }
    if (!store) return res.status(400).json({ message: 'No store found.' });

    const lowStock = await ServiceSupply.find({
      store, isActive: true, isDeleted: false,
      status: { $in: ['low_stock', 'out_of_stock'] }
    }).populate('linkedServices', 'name');

    const expiring = await ServiceSupply.find({
      store, isActive: true, isDeleted: false,
      expirationDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    });

    const expired = await ServiceSupply.find({
      store, isActive: true, isDeleted: false,
      status: 'expired'
    });

    res.json({
      lowStock,
      expiringSoon: expiring.filter(s => s.status !== 'expired'),
      expired,
      totalAlerts: lowStock.length + expiring.length + expired.length
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════════
// SUPPLY CHAIN LOGS
// ═══════════════════════════════════════════════════════════════

const getLogs = async (req, res) => {
  try {
    let store = req.user.store;
    if (!store) {
      const s = await Store.findOne({ owner: req.user._id });
      if (s) store = s._id;
    }

    const { action, page = 1, limit = 50 } = req.query;
    let filter = {};

    // Admin sees all, others see their store/supplier
    if (req.user.role === 'super_admin') {
      // no filter
    } else if (store) {
      filter.store = store;
    } else {
      filter.performedBy = req.user._id;
    }

    if (action) filter.action = action;

    const skip = (page - 1) * limit;
    const logs = await SupplyChainLog.find(filter)
      .populate('performedBy', 'firstName lastName role')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await SupplyChainLog.countDocuments(filter);

    res.json({ logs, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  addSupply, getSupplies, updateSupply, deleteSupply,
  restockSupply, deductSupply, checkAvailability, getAlerts, getLogs
};
