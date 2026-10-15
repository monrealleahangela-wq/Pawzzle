const ServiceSupply = require('../models/ServiceSupply');
const SupplyChainLog = require('../models/SupplyChainLog');
const { getSupplyOfferIssue } = require('../utils/procurementSupplyLinking');

const conflict = message => Object.assign(new Error(message), { statusCode: 409 });

const applyServiceSupplyReceipt = async ({ order, orderItem, supplierProduct, acceptedQuantity,
  previousQuantity, receivedQuantityTarget, userId, userRole, session, idempotencyKey }) => {
  if (!session || !idempotencyKey) throw new Error('Service supply receiving requires a transaction and idempotency key.');
  const increment = Number(receivedQuantityTarget) - Number(previousQuantity);
  if (!Number.isInteger(increment) || increment <= 0 || increment !== Number(acceptedQuantity)) {
    throw conflict('Service supply receipt quantity does not match the purchase order.');
  }
  const supply = await ServiceSupply.findOne({ _id: orderItem.serviceSupply, store: order.store,
    isActive: true, isDeleted: { $ne: true } }).session(session);
  const issue = getSupplyOfferIssue({ serviceSupply: supply, supplierProduct, storeId: order.store });
  if (issue) throw conflict(issue);
  if (Number(supply.currentStock) + increment > Number(supply.maximumStock)) {
    throw conflict(`Receiving would exceed the capacity of service supply "${supply.name}".`);
  }
  // The unique claim, stock update, and parent PO/report writes share one transaction.
  await SupplyChainLog.create([{
    action: 'supply_restocked', performedBy: userId, userRole,
    relatedEntity: { type: 'ServiceSupply', id: supply._id },
    description: `Accepted ${increment} ${supply.unitOfMeasure} of ${supply.name} from purchase order ${order.orderNumber}`,
    store: order.store, supplier: order.supplier, idempotencyKey,
    metadata: { purchaseOrder: order._id, purchaseOrderItem: orderItem._id, quantity: increment }
  }], { session });
  supply.currentStock += increment;
  supply.costPerUnit = Number(orderItem.unitPrice);
  supply.lastRestockedAt = new Date();
  if (!supply.supplierProduct) {
    supply.supplierProduct = supplierProduct._id;
    supply.supplier = order.supplier;
  }
  await supply.save({ session });
  return supply;
};

module.exports = { applyServiceSupplyReceipt };
