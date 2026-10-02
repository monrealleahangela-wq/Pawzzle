const Pet = require('../models/Pet');
const SupplierProduct = require('../models/SupplierProduct');

const transactionRequired = () => {
  const error = new Error('Supplier stock commitments require an active transaction.');
  error.statusCode = 500;
  return error;
};

const conflict = message => Object.assign(new Error(message), { statusCode: 409 });

/**
 * Commits the authoritative supplier availability for every PO line.
 * Ordinary products use an atomic decrement. Live pets retain their separate,
 * exact-document reservation and only use SupplierProduct as the catalog flag.
 * The caller owns the transaction and saves the mutated PurchaseOrder.
 */
const commitPurchaseOrderStock = async ({ order, session }) => {
  if (!session) throw transactionRequired();

  for (const item of order.items) {
    if (Number(item.supplierStockCommittedQuantity || 0) > 0
        && item.supplierStockCommitmentReleased !== true) continue;
    const quantity = Number(item.quantity);

    if (item.itemType === 'live_pet') {
      if (quantity !== 1 || !item.pet) {
        throw conflict(`Live pet "${item.productName}" must reference one exact Pet.`);
      }
      const reservedPet = await Pet.findOneAndUpdate({
        _id: item.pet,
        sourceSupplier: order.supplier,
        listingContext: 'supplier_catalog',
        status: 'available',
        isDeleted: { $ne: true },
        acquiredThroughPurchaseOrder: null,
        'procurementReservation.purchaseOrder': null
      }, {
        $set: {
          status: 'reserved',
          isAvailable: false,
          'procurementReservation.purchaseOrder': order._id,
          'procurementReservation.reservedAt': new Date()
        }
      }, { new: true, session });
      if (!reservedPet) throw conflict(`Live pet "${item.productName}" became unavailable during submission.`);

      const catalogReservation = await SupplierProduct.updateOne({
        _id: item.supplierProduct,
        supplier: order.supplier,
        itemType: 'live_pet',
        pet: item.pet,
        isActive: true,
        isDeleted: false,
        availableStock: 1
      }, { $set: { availableStock: 0 } }, { session });
      if (catalogReservation.modifiedCount !== 1) {
        throw conflict(`Live pet "${item.productName}" is no longer available in the supplier catalog.`);
      }
    } else {
      const stockCommitment = await SupplierProduct.updateOne({
        _id: item.supplierProduct,
        supplier: order.supplier,
        itemType: { $ne: 'live_pet' },
        isActive: true,
        isDeleted: false,
        availableStock: { $gte: quantity }
      }, { $inc: { availableStock: -quantity } }, { session });
      if (stockCommitment.modifiedCount !== 1) {
        throw conflict(`Supplier stock changed for "${item.productName}" during submission.`);
      }
    }

    item.supplierStockCommittedQuantity = quantity;
    item.supplierStockCommitmentReleased = false;
    item.supplierStockCommitmentReleasedAt = undefined;
  }
};

/**
 * Releases only commitments owned by this PO. Legacy ordinary-product lines
 * have no commitment marker and are intentionally not incremented. Legacy
 * live-pet lines remain safe because the exact Pet reservation proves ownership.
 */
const releasePurchaseOrderStock = async ({ order, session }) => {
  if (!session) throw transactionRequired();

  for (const item of order.items) {
    if (item.supplierStockCommitmentReleased === true) continue;

    if (item.itemType === 'live_pet' && item.pet) {
      const releasedPet = await Pet.findOneAndUpdate({
        _id: item.pet,
        sourceSupplier: order.supplier,
        listingContext: 'supplier_catalog',
        status: 'reserved',
        'procurementReservation.purchaseOrder': order._id,
        acquiredThroughPurchaseOrder: null
      }, {
        $set: { status: 'available', isAvailable: true },
        $unset: { procurementReservation: 1 }
      }, { new: true, session });
      if (!releasedPet) {
        throw conflict(`The exact live pet reserved by ${order.orderNumber} can no longer be released.`);
      }
      const catalogRelease = await SupplierProduct.updateOne({
        _id: item.supplierProduct,
        supplier: order.supplier,
        itemType: 'live_pet',
        pet: item.pet
      }, { $set: { availableStock: 1 } }, { session });
      if (catalogRelease.matchedCount !== 1) {
        throw conflict(`The supplier catalog record for "${item.productName}" no longer exists.`);
      }
      item.supplierStockCommittedQuantity = 1;
    } else {
      const committedQuantity = Number(item.supplierStockCommittedQuantity || 0);
      if (committedQuantity <= 0) continue;
      const catalogRelease = await SupplierProduct.updateOne({
        _id: item.supplierProduct,
        supplier: order.supplier,
        itemType: { $ne: 'live_pet' }
      }, { $inc: { availableStock: committedQuantity } }, { session });
      if (catalogRelease.matchedCount !== 1) {
        throw conflict(`The supplier catalog record for "${item.productName}" no longer exists.`);
      }
    }

    item.supplierStockCommitmentReleased = true;
    item.supplierStockCommitmentReleasedAt = new Date();
  }
};

module.exports = { commitPurchaseOrderStock, releasePurchaseOrderStock };
