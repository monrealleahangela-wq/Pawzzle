const Store = require('../models/Store');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { ENTITLEMENTS } = require('../config/subscriptionPlans');
const { assertCanAddLocation, assertStoreEntitlement, getStoreSubscriptionSummary } = require('../services/storeSubscriptionService');
const { findCanonicalOwnedStore } = require('../services/storeAccessService');

const ownedStore = userId => findCanonicalOwnedStore(userId);
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sendError = (res, error) => res.status(error.statusCode || 500).json({ message: error.message || 'Unable to update plan features.', code: error.code, details: error.details });
const clean = (value, max) => String(value || '').trim().slice(0, max);
const cleanCoordinates = value => {
  if (value === undefined || value === null || value === '') return undefined;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw fail('Location coordinates must contain a valid latitude and longitude.');
  }
  return { lat: latitude, lng: longitude };
};
const cleanAddress = (value = {}, current = {}) => ({
  unitBuilding: value.unitBuilding === undefined ? current.unitBuilding : clean(value.unitBuilding, 120),
  street: value.street === undefined ? current.street : clean(value.street, 160),
  barangay: value.barangay === undefined ? current.barangay : clean(value.barangay, 120),
  city: value.city === undefined ? current.city : clean(value.city, 120),
  state: value.state === undefined ? current.state : clean(value.state, 120),
  zipCode: value.zipCode === undefined ? current.zipCode : clean(value.zipCode, 20),
  country: value.country === undefined ? (current.country || 'Philippines') : clean(value.country, 80),
  coordinates: value.coordinates === undefined ? current.coordinates : cleanCoordinates(value.coordinates)
});

const listLocations = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    const primary = {
      id: 'primary', name: `${store.name} - Main location`, code: 'MAIN', phone: store.contactInfo?.phone,
      address: store.contactInfo?.address, isPrimary: true, isActive: true
    };
    return res.json({ locations: [primary, ...(store.operatingLocations || []).map(row => ({ ...row.toObject(), id: row._id }))], subscription: await getStoreSubscriptionSummary(store) });
  } catch (error) { return sendError(res, error); }
};

const createLocation = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.MULTI_LOCATION);
    await assertCanAddLocation(store._id);
    const input = req.body || {};
    const address = input.address || {};
    const location = {
      name: clean(input.name, 120), code: clean(input.code, 20).toUpperCase(), phone: clean(input.phone, 40),
      address: cleanAddress(address)
    };
    if (!location.name || !location.code || !location.address.street || !location.address.barangay || !location.address.city || !location.address.state) {
      throw fail('Location name, code, street, barangay, city, and province are required.');
    }
    if ((store.operatingLocations || []).some(row => row.code === location.code)) throw fail('Use a unique location code.', 409);
    store.operatingLocations.push(location);
    await store.save();
    return res.status(201).json({ message: 'Store location added.', location: store.operatingLocations.at(-1) });
  } catch (error) { return sendError(res, error); }
};

const updateLocation = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.MULTI_LOCATION);
    const location = store.operatingLocations.id(req.params.locationId);
    if (!location) throw fail('Store location not found.', 404);
    if (req.body.name !== undefined) location.name = clean(req.body.name, 120);
    if (req.body.phone !== undefined) location.phone = clean(req.body.phone, 40);
    if (req.body.isActive !== undefined) location.isActive = Boolean(req.body.isActive);
    if (req.body.address) location.address = cleanAddress(req.body.address, location.address?.toObject?.() || location.address || {});
    if (!location.name || !location.address?.street || !location.address?.barangay || !location.address?.city || !location.address?.state) {
      throw fail('Location name, street, barangay, city, and province are required.');
    }
    await store.save();
    return res.json({ message: 'Store location updated.', location });
  } catch (error) { return sendError(res, error); }
};

const getStorefrontCustomization = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    return res.json({ storefrontCustomization: store.storefrontCustomization || {}, reportSchedule: store.reportSchedule || {}, subscription: await getStoreSubscriptionSummary(store) });
  } catch (error) { return sendError(res, error); }
};

const updateStorefrontCustomization = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.STOREFRONT_CUSTOMIZATION);
    store.storefrontCustomization = {
      announcement: clean(req.body.announcement, 180), welcomeMessage: clean(req.body.welcomeMessage, 500),
      accentStyle: ['classic', 'warm', 'minimal'].includes(req.body.accentStyle) ? req.body.accentStyle : 'classic',
      showFeaturedFirst: req.body.showFeaturedFirst !== false
    };
    await store.save();
    return res.json({ message: 'Storefront preferences saved.', storefrontCustomization: store.storefrontCustomization });
  } catch (error) { return sendError(res, error); }
};

const updateReportSchedule = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.SCHEDULED_REPORTS);
    const enabled = Boolean(req.body.enabled);
    const frequency = req.body.frequency === 'weekly' ? 'weekly' : 'monthly';
    const recipientEmail = clean(req.body.recipientEmail || store.contactInfo?.email, 180).toLowerCase();
    if (enabled && !/^\S+@\S+\.\S+$/.test(recipientEmail)) throw fail('Enter a valid report email address.');
    const now = Date.now();
    const intervalDays = frequency === 'weekly' ? 7 : 30;
    store.reportSchedule = { enabled, frequency, recipientEmail, nextRunAt: enabled ? new Date(now + intervalDays * 86400000) : null, lastRunAt: store.reportSchedule?.lastRunAt };
    await store.save();
    return res.json({ message: 'Report schedule saved.', reportSchedule: store.reportSchedule });
  } catch (error) { return sendError(res, error); }
};

const getConsolidatedInventory = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.CONSOLIDATED_INVENTORY);
    const rows = await Inventory.find({ store: store._id, isActive: true })
      .populate('product', 'name sku images').populate('productVariant', 'sku attributes').lean();
    const locations = new Map([['primary', `${store.name} - Main location`], ...(store.operatingLocations || []).map(row => [String(row._id), row.name])]);
    const grouped = {};
    rows.forEach(row => {
      const key = row.operatingLocation ? String(row.operatingLocation) : 'primary';
      if (!grouped[key]) grouped[key] = { id: key, name: locations.get(key) || 'Archived location', quantity: 0, items: [] };
      grouped[key].quantity += Number(row.quantity || 0);
      grouped[key].items.push(row);
    });
    return res.json({ locations: [...locations].map(([id, name]) => grouped[id] || { id, name, quantity: 0, items: [] }) });
  } catch (error) { return sendError(res, error); }
};

const assignInventoryLocation = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.CONSOLIDATED_INVENTORY);
    const requested = String(req.body.locationId || 'primary');
    const operatingLocation = requested === 'primary' ? null : store.operatingLocations.id(requested);
    if (requested !== 'primary' && (!operatingLocation || operatingLocation.isActive === false)) {
      throw fail('Choose an active location that belongs to this store.', 400);
    }
    const inventory = await Inventory.findOne({ _id: req.params.inventoryId, store: store._id, isActive: true });
    if (!inventory) throw fail('Inventory record not found.', 404);
    inventory.operatingLocation = operatingLocation?._id || undefined;
    await inventory.save();
    return res.json({ message: 'Inventory location updated.', inventory });
  } catch (error) { return sendError(res, error); }
};

const reportWindow = query => {
  const days = Math.min(366, Math.max(7, Number(query.days) || 30));
  return { days, since: new Date(Date.now() - days * 86400000) };
};

const buildOperationalReport = async (store, query = {}) => {
  const { days, since } = reportWindow(query);
  const paid = { store: store._id, paymentStatus: 'paid', createdAt: { $gte: since } };
  const [orders, bookings, inventory, customers] = await Promise.all([
    Order.find(paid).select('customer totalAmount status createdAt').lean(),
    Booking.find(paid).select('customer totalPrice status createdAt').lean(),
    Inventory.find({ store: store._id, isActive: true }).select('quantity reorderLevel').lean(),
    Promise.all([
      Order.distinct('customer', paid),
      Booking.distinct('customer', paid)
    ])
  ]);
  const revenue = orders.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)
    + bookings.reduce((sum, row) => sum + Number(row.totalPrice || 0), 0);
  const uniqueCustomers = new Set(customers.flat().filter(Boolean).map(String));
  return {
    generatedAt: new Date(), periodDays: days, since,
    sales: { orders: orders.length, bookings: bookings.length, revenue, averageValue: (orders.length + bookings.length) ? revenue / (orders.length + bookings.length) : 0 },
    customers: { unique: uniqueCustomers.size, repeat: 0 },
    inventory: {
      trackedItems: inventory.length,
      lowStock: inventory.filter(row => Number(row.quantity) <= Number(row.reorderLevel)).length,
      outOfStock: inventory.filter(row => Number(row.quantity) === 0).length
    }
  };
};

const getOperationalReport = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.ADVANCED_REPORTS);
    return res.json({ report: await buildOperationalReport(store, req.query) });
  } catch (error) { return sendError(res, error); }
};

const exportOperationalReport = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.CSV_EXPORTS);
    const report = await buildOperationalReport(store, req.query);
    const rows = [
      ['Metric', 'Value'], ['Period (days)', report.periodDays], ['Paid orders', report.sales.orders],
      ['Paid bookings', report.sales.bookings], ['Revenue (PHP)', report.sales.revenue.toFixed(2)],
      ['Average transaction (PHP)', report.sales.averageValue.toFixed(2)], ['Unique customers', report.customers.unique],
      ['Tracked inventory items', report.inventory.trackedItems], ['Low stock items', report.inventory.lowStock],
      ['Out of stock items', report.inventory.outOfStock]
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="pawzzle-${String(store.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) { return sendError(res, error); }
};

const getRetentionInsights = async (req, res) => {
  try {
    const store = await ownedStore(req.user._id);
    if (!store) throw fail('Store not found.', 404);
    await assertStoreEntitlement(store._id, ENTITLEMENTS.CUSTOMER_RETENTION_INSIGHTS);
    const [orders, bookings] = await Promise.all([
      Order.find({ store: store._id, paymentStatus: 'paid' }).select('customer totalAmount createdAt').lean(),
      Booking.find({ store: store._id, paymentStatus: 'paid' }).select('customer totalPrice createdAt').lean()
    ]);
    const ledger = new Map();
    [...orders.map(row => ({ customer: row.customer, amount: row.totalAmount, at: row.createdAt })),
      ...bookings.map(row => ({ customer: row.customer, amount: row.totalPrice, at: row.createdAt }))]
      .filter(row => row.customer).forEach(row => {
        const key = String(row.customer); const current = ledger.get(key) || { customer: key, interactions: 0, lifetimeValue: 0, lastActivityAt: null };
        current.interactions += 1; current.lifetimeValue += Number(row.amount || 0);
        if (!current.lastActivityAt || new Date(row.at) > new Date(current.lastActivityAt)) current.lastActivityAt = row.at;
        ledger.set(key, current);
      });
    const rows = [...ledger.values()].sort((a, b) => b.lifetimeValue - a.lifetimeValue);
    const profiles = await User.find({ _id: { $in: rows.slice(0, 50).map(row => row.customer) } }).select('firstName lastName email').lean();
    const profileMap = new Map(profiles.map(row => [String(row._id), row]));
    return res.json({
      insights: {
        totalCustomers: rows.length,
        repeatCustomers: rows.filter(row => row.interactions > 1).length,
        repeatRate: rows.length ? Math.round(rows.filter(row => row.interactions > 1).length / rows.length * 1000) / 10 : 0,
        customers: rows.slice(0, 50).map(row => ({ ...row, profile: profileMap.get(row.customer) || null }))
      }
    });
  } catch (error) { return sendError(res, error); }
};

module.exports = { listLocations, createLocation, updateLocation, getStorefrontCustomization,
  updateStorefrontCustomization, updateReportSchedule, getConsolidatedInventory, assignInventoryLocation,
  getOperationalReport, exportOperationalReport, getRetentionInsights, buildOperationalReport };
