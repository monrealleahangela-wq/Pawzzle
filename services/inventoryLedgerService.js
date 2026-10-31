const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const { assertVariantInventoryEnabled } = require('./variantInventoryReadinessService');

const INBOUND_TYPES = new Set(['opening', 'receipt', 'return_in', 'transfer_in', 'adjustment_in', 'release']);

const variantFilter = productVariant => (productVariant
  ? { productVariant }
  : { productVariant: { $exists: false } });

const resolveInventoryIdentity = async ({ store, product, productVariant, session, requireActive = true }) => {
  const productQuery = Product.findOne({ _id: product, store, isDeleted: { $ne: true } });
  if (session) productQuery.session(session);
  const parent = await productQuery;
  if (!parent) throw new Error('Inventory product does not belong to the selected store.');
  if (!productVariant) {
    if (parent.productMode === 'variant') {
      throw new Error('Variant products require an exact ProductVariant inventory destination.');
    }
    return { parent, variant: null };
  }
  if (parent.productMode !== 'variant') throw new Error('A simple product cannot use variant inventory.');
  const variantQuery = ProductVariant.findOne({
    _id: productVariant,
    product: parent._id,
    store,
    ...(requireActive ? { isActive: true, isDiscontinued: false } : {})
  }).select('+store');
  if (session) variantQuery.session(session);
  const variant = await variantQuery;
  if (!variant) throw new Error('The inventory variant is unavailable or belongs to another product or store.');
  return { parent, variant };
};

class InventoryLedgerService {
  static async issueReservedVariantInSession({
    store, product, productVariant, quantity, order, orderItem, performedBy, idempotencyKey
  }, session) {
    if (!session) throw new Error('Exact-variant fulfillment requires a MongoDB transaction.');
    if (!productVariant) throw new Error('Exact-variant fulfillment requires a ProductVariant identity.');
    if (!(Number(quantity) > 0) || !idempotencyKey) throw new Error('A quantity and idempotency key are required.');
    await assertVariantInventoryEnabled();
    await resolveInventoryIdentity({ store, product, productVariant, session });
    const existing = await InventoryTransaction.findOne({ idempotencyKey }).session(session);
    if (existing) return { idempotent: true, transaction: existing };

    let remaining = Number(quantity);
    const lots = await InventoryLot.find({
      store, product, ...variantFilter(productVariant), status: 'available', quantityAvailable: { $gt: 0 },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    }).sort({ expiresAt: 1, receivedAt: 1 }).session(session);
    const available = lots.reduce((sum, lot) => sum + Number(lot.quantityAvailable || 0), 0);
    if (available < remaining) throw new Error(`Insufficient exact-variant lot stock. Available: ${available}.`);
    for (const lot of lots) {
      if (remaining <= 0) break;
      const issued = Math.min(Number(lot.quantityAvailable), remaining);
      lot.quantityAvailable -= issued;
      await lot.save({ session });
      remaining -= issued;
    }
    const [movement] = await InventoryTransaction.create([{
      store, product, productVariant, type: 'sale', quantity: Number(quantity), signedQuantity: -Number(quantity),
      referenceType: 'OrderItem', referenceId: orderItem || order, performedBy,
      reason: `Exact-variant fulfillment for order ${order}`, idempotencyKey
    }], { session });
    await this.refreshBalance(store, product, { productVariant, session });
    return { idempotent: false, transaction: movement };
  }

  static async restockVariantInSession({
    store, product, productVariant, quantity, order, orderItem, performedBy,
    idempotencyKey, reason, lotNumber
  }, session) {
    if (!session) throw new Error('Exact-variant restocking requires a MongoDB transaction.');
    if (!productVariant) throw new Error('Exact-variant restocking requires a ProductVariant identity.');
    if (!(Number(quantity) > 0) || !idempotencyKey) throw new Error('A quantity and idempotency key are required.');
    await assertVariantInventoryEnabled();
    await resolveInventoryIdentity({ store, product, productVariant, session, requireActive: false });
    const existing = await InventoryTransaction.findOne({ idempotencyKey }).session(session);
    if (existing) return { idempotent: true, transaction: existing };

    const normalizedLotNumber = String(lotNumber || `RETURN-${order}-${orderItem}`).trim().slice(0, 120);
    let lot = await InventoryLot.findOne({
      store, product, ...variantFilter(productVariant), lotNumber: normalizedLotNumber
    }).session(session);
    if (lot && ['recalled', 'quarantined', 'expired'].includes(lot.status)) {
      throw new Error(`Cannot restore stock into a ${lot.status} lot.`);
    }
    if (lot) {
      lot.quantityReceived += Number(quantity);
      lot.quantityAvailable += Number(quantity);
      if (lot.status === 'depleted') lot.status = 'available';
      await lot.save({ session });
    } else {
      [lot] = await InventoryLot.create([{
        store, product, productVariant, lotNumber: normalizedLotNumber,
        quantityReceived: Number(quantity), quantityAvailable: Number(quantity),
        unitCost: 0, storageNotes: reason, createdBy: performedBy
      }], { session });
    }
    const [movement] = await InventoryTransaction.create([{
      store, product, productVariant, lot: lot._id, type: 'return_in', quantity: Number(quantity),
      signedQuantity: Number(quantity), referenceType: 'OrderItem', referenceId: orderItem || order,
      performedBy, reason, idempotencyKey
    }], { session });
    await this.refreshBalance(store, product, { productVariant, session });
    return { idempotent: false, transaction: movement, lot };
  }

  static async receiveLot(data, options = {}) {
    if (options.session) return this.receiveLotInSession(data, options.session);

    let receivedLot;
    try {
      await mongoose.connection.transaction(async session => {
        receivedLot = await this.receiveLotInSession(data, session);
      });
    } catch (error) {
      // A concurrent transaction may have committed the same idempotency key.
      // Its unique-index failure aborts this transaction, so no lot/balance
      // mutation from this attempt can survive. Resolve the committed result.
      if (error?.code === 11000 && data.idempotencyKey) {
        const existing = await InventoryTransaction.findOne({ idempotencyKey: data.idempotencyKey });
        if (existing?.lot) return InventoryLot.findById(existing.lot);
      }
      throw error;
    }
    return receivedLot;
  }

  static async receiveLotInSession(data, session) {
    const {
      store, product, productVariant, lotNumber, quantity, unitCost = 0, expiresAt,
      manufacturer, supplier, purchaseOrder, purchaseOrderItem,
      isVaccine = false, vaccineType, storageNotes, performedBy,
      idempotencyKey
    } = data;

    if (!lotNumber?.trim()) throw new Error('Lot number is required.');
    if (!(Number(quantity) > 0)) throw new Error('Received quantity must be greater than zero.');
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      throw new Error('Cannot receive an already expired lot.');
    }
    if (productVariant) await assertVariantInventoryEnabled();
    await resolveInventoryIdentity({ store, product, productVariant, session });

    if (idempotencyKey) {
      const existing = await InventoryTransaction.findOne({ idempotencyKey }).session(session);
      if (existing?.lot) return InventoryLot.findById(existing.lot).session(session);
      if (existing) throw new Error('Inventory receipt idempotency claim is incomplete.');
    }

    // Claim the operation before changing stock. The claim, lot mutation,
    // ledger entry and derived balances all commit (or abort) together.
    const [movement] = await InventoryTransaction.create([{
      store, product, ...(productVariant ? { productVariant } : {}), type: 'receipt', quantity,
      signedQuantity: Number(quantity), unitCost, referenceType: 'PurchaseOrder',
      referenceId: purchaseOrder, performedBy, idempotencyKey
    }], { session });

    let lot = await InventoryLot.findOne({
      store, product, ...variantFilter(productVariant), lotNumber: lotNumber.trim()
    }).session(session);
    if (lot && ['recalled', 'quarantined', 'expired'].includes(lot.status)) {
      throw new Error(`Cannot receive into a ${lot.status} lot.`);
    }
    if (lot) {
      lot.quantityReceived += Number(quantity);
      lot.quantityAvailable += Number(quantity);
      if (lot.status === 'depleted') lot.status = 'available';
      if (expiresAt) lot.expiresAt = expiresAt;
      await lot.save({ session });
    } else {
      [lot] = await InventoryLot.create([{
        store, product, ...(productVariant ? { productVariant } : {}), lotNumber: lotNumber.trim(), quantityReceived: quantity,
        quantityAvailable: quantity, unitCost, expiresAt, manufacturer, supplier,
        purchaseOrder, purchaseOrderItem, isVaccine, vaccineType, storageNotes,
        createdBy: performedBy
      }], { session });
    }

    movement.lot = lot._id;
    await movement.save({ session });
    await this.refreshBalance(store, product, { productVariant, session });
    return lot;
  }

  static async issueFEFO({ store, product, productVariant, quantity, type = 'sale', referenceType, referenceId, performedBy, reason }) {
    if (INBOUND_TYPES.has(type)) throw new Error('FEFO issue requires an outbound transaction type.');
    let remaining = Number(quantity);
    if (!(remaining > 0)) throw new Error('Issue quantity must be greater than zero.');
    if (productVariant) await assertVariantInventoryEnabled();
    await resolveInventoryIdentity({ store, product, productVariant });

    const lots = await InventoryLot.find({
      store, product, ...variantFilter(productVariant), status: 'available', quantityAvailable: { $gt: 0 },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    }).sort({ expiresAt: 1, receivedAt: 1 });

    const available = lots.reduce((sum, lot) => sum + lot.quantityAvailable, 0);
    if (available < remaining) throw new Error(`Insufficient lot stock. Available: ${available}.`);

    const movements = [];
    for (const lot of lots) {
      if (remaining <= 0) break;
      const issued = Math.min(lot.quantityAvailable, remaining);
      lot.quantityAvailable -= issued;
      await lot.save();
      const movement = await InventoryTransaction.create({
        store, product, ...(productVariant ? { productVariant } : {}), lot: lot._id, type, quantity: issued,
        signedQuantity: -issued, unitCost: lot.unitCost, referenceType,
        referenceId, performedBy, reason
      });
      movements.push(movement);
      remaining -= issued;
    }
    await this.refreshBalance(store, product, { productVariant });
    return movements;
  }

  static async issueFromLot({
    store, product, productVariant, lotId, quantity, type = 'service_use',
    referenceType, referenceId, performedBy, reason
  }) {
    if (INBOUND_TYPES.has(type)) throw new Error('Lot issue requires an outbound transaction type.');
    const issued = Number(quantity);
    if (!(issued > 0)) throw new Error('Issue quantity must be greater than zero.');
    if (productVariant) await assertVariantInventoryEnabled();
    await resolveInventoryIdentity({ store, product, productVariant });

    const lot = await InventoryLot.findOne({
      _id: lotId, store, product, ...variantFilter(productVariant), status: 'available',
      quantityAvailable: { $gte: issued },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    });
    if (!lot) throw new Error('The selected lot is unavailable, expired, or has insufficient stock.');

    lot.quantityAvailable -= issued;
    await lot.save();
    const movement = await InventoryTransaction.create({
      store, product, ...(productVariant ? { productVariant } : {}), lot: lot._id, type, quantity: issued,
      signedQuantity: -issued, unitCost: lot.unitCost, referenceType,
      referenceId, performedBy, reason
    });
    await this.refreshBalance(store, product, { productVariant });
    return movement;
  }

  static async refreshBalance(store, product, options = {}) {
    const { session, productVariant } = options;
    await resolveInventoryIdentity({ store, product, productVariant, session, requireActive: false });
    const lots = await InventoryLot.find({
      store, product, ...variantFilter(productVariant), status: { $in: ['available', 'depleted'] }
    }).select('quantityAvailable unitCost').session(session || null);
    const quantity = lots.reduce((sum, lot) => sum + lot.quantityAvailable, 0);
    const totalCost = lots.reduce((sum, lot) => sum + lot.quantityAvailable * lot.unitCost, 0);
    const costPrice = quantity > 0 ? totalCost / quantity : 0;

    await Inventory.findOneAndUpdate(
      { store, product, ...variantFilter(productVariant) },
      { $set: { quantity, costPrice, lastRestocked: new Date(), isActive: true } },
      { upsert: true, setDefaultsOnInsert: true, session }
    );
    // Parent stock remains authoritative only for legacy simple products.
    // Variant products derive availability exclusively from exact child balances.
    if (!productVariant) {
      await Product.findByIdAndUpdate(product, {
        $set: { stockQuantity: quantity, stockStatus: quantity > 0 ? 'in_stock' : 'out_of_stock' }
      }, { session });
    }
    return { quantity, costPrice };
  }
}

InventoryLedgerService.resolveInventoryIdentity = resolveInventoryIdentity;
InventoryLedgerService.variantFilter = variantFilter;

module.exports = InventoryLedgerService;
