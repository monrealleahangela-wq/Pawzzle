const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const Product = require('../models/Product');

const INBOUND_TYPES = new Set(['opening', 'receipt', 'return_in', 'transfer_in', 'adjustment_in', 'release']);

class InventoryLedgerService {
  static async receiveLot(data) {
    const {
      store, product, lotNumber, quantity, unitCost = 0, expiresAt,
      manufacturer, supplier, purchaseOrder, purchaseOrderItem,
      isVaccine = false, vaccineType, storageNotes, performedBy,
      idempotencyKey
    } = data;

    if (!lotNumber?.trim()) throw new Error('Lot number is required.');
    if (!(Number(quantity) > 0)) throw new Error('Received quantity must be greater than zero.');
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      throw new Error('Cannot receive an already expired lot.');
    }

    if (idempotencyKey) {
      const existing = await InventoryTransaction.findOne({ idempotencyKey });
      if (existing) return InventoryLot.findById(existing.lot);
    }

    let lot = await InventoryLot.findOne({ store, product, lotNumber: lotNumber.trim() });
    if (lot && ['recalled', 'quarantined', 'expired'].includes(lot.status)) {
      throw new Error(`Cannot receive into a ${lot.status} lot.`);
    }
    if (lot) {
      lot.quantityReceived += Number(quantity);
      lot.quantityAvailable += Number(quantity);
      if (lot.status === 'depleted') lot.status = 'available';
      if (expiresAt) lot.expiresAt = expiresAt;
      await lot.save();
    } else {
      lot = await InventoryLot.create({
        store, product, lotNumber: lotNumber.trim(), quantityReceived: quantity,
        quantityAvailable: quantity, unitCost, expiresAt, manufacturer, supplier,
        purchaseOrder, purchaseOrderItem, isVaccine, vaccineType, storageNotes,
        createdBy: performedBy
      });
    }

    await InventoryTransaction.create({
      store, product, lot: lot._id, type: 'receipt', quantity,
      signedQuantity: Number(quantity), unitCost, referenceType: 'PurchaseOrder',
      referenceId: purchaseOrder, performedBy, idempotencyKey
    });
    await this.refreshBalance(store, product);
    return lot;
  }

  static async issueFEFO({ store, product, quantity, type = 'sale', referenceType, referenceId, performedBy, reason }) {
    if (INBOUND_TYPES.has(type)) throw new Error('FEFO issue requires an outbound transaction type.');
    let remaining = Number(quantity);
    if (!(remaining > 0)) throw new Error('Issue quantity must be greater than zero.');

    const lots = await InventoryLot.find({
      store, product, status: 'available', quantityAvailable: { $gt: 0 },
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
        store, product, lot: lot._id, type, quantity: issued,
        signedQuantity: -issued, unitCost: lot.unitCost, referenceType,
        referenceId, performedBy, reason
      });
      movements.push(movement);
      remaining -= issued;
    }
    await this.refreshBalance(store, product);
    return movements;
  }

  static async issueFromLot({
    store, product, lotId, quantity, type = 'service_use',
    referenceType, referenceId, performedBy, reason
  }) {
    if (INBOUND_TYPES.has(type)) throw new Error('Lot issue requires an outbound transaction type.');
    const issued = Number(quantity);
    if (!(issued > 0)) throw new Error('Issue quantity must be greater than zero.');

    const lot = await InventoryLot.findOne({
      _id: lotId, store, product, status: 'available',
      quantityAvailable: { $gte: issued },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    });
    if (!lot) throw new Error('The selected lot is unavailable, expired, or has insufficient stock.');

    lot.quantityAvailable -= issued;
    await lot.save();
    const movement = await InventoryTransaction.create({
      store, product, lot: lot._id, type, quantity: issued,
      signedQuantity: -issued, unitCost: lot.unitCost, referenceType,
      referenceId, performedBy, reason
    });
    await this.refreshBalance(store, product);
    return movement;
  }

  static async refreshBalance(store, product) {
    const lots = await InventoryLot.find({
      store, product, status: { $in: ['available', 'depleted'] }
    }).select('quantityAvailable unitCost');
    const quantity = lots.reduce((sum, lot) => sum + lot.quantityAvailable, 0);
    const totalCost = lots.reduce((sum, lot) => sum + lot.quantityAvailable * lot.unitCost, 0);
    const costPrice = quantity > 0 ? totalCost / quantity : 0;

    await Inventory.findOneAndUpdate(
      { store, product },
      { $set: { quantity, costPrice, lastRestocked: new Date(), isActive: true } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    await Product.findByIdAndUpdate(product, {
      $set: { stockQuantity: quantity, stockStatus: quantity > 0 ? 'in_stock' : 'out_of_stock' }
    });
    return { quantity, costPrice };
  }
}

module.exports = InventoryLedgerService;
