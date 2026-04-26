const mongoose = require('mongoose');

const supplyChainLogSchema = new mongoose.Schema({
  // ── Action Context ────────────────────────────────────
  action: {
    type: String,
    enum: [
      // Supplier actions
      'supplier_registered', 'supplier_verified', 'supplier_rejected', 'supplier_suspended',
      'supplier_product_added', 'supplier_product_updated', 'supplier_product_removed',
      // Purchase order actions
      'purchase_order_created', 'purchase_order_submitted', 'purchase_order_confirmed',
      'purchase_order_processing', 'purchase_order_shipped', 'purchase_order_delivered',
      'purchase_order_cancelled', 'purchase_order_returned',
      // Inventory actions
      'stock_added', 'stock_deducted', 'stock_adjusted', 'stock_expired',
      'restock_recommended', 'restock_completed',
      // Service supply actions
      'supply_added', 'supply_deducted', 'supply_restocked', 'supply_expired',
      'supply_linked', 'supply_unlinked',
      // Payment actions
      'payment_received', 'payment_refunded',
      // General
      'system_alert', 'admin_action'
    ],
    required: true
  },

  // ── Who ───────────────────────────────────────────────
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userRole: {
    type: String,
    enum: ['super_admin', 'admin', 'staff', 'supplier', 'customer', 'system'],
    required: true
  },

  // ── Related Entities ──────────────────────────────────
  relatedEntity: {
    type: { type: String, enum: ['Supplier', 'SupplierProduct', 'PurchaseOrder', 'ServiceSupply', 'Product', 'Inventory', 'Store'] },
    id: { type: mongoose.Schema.Types.ObjectId }
  },

  // ── Details ───────────────────────────────────────────
  description: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed },

  // ── Change Tracking ───────────────────────────────────
  previousValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },

  // ── Context ───────────────────────────────────────────
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  ipAddress: { type: String },

  // ── Timestamp ─────────────────────────────────────────
  createdAt: { type: Date, default: Date.now }
});

supplyChainLogSchema.index({ action: 1, createdAt: -1 });
supplyChainLogSchema.index({ performedBy: 1 });
supplyChainLogSchema.index({ store: 1, createdAt: -1 });
supplyChainLogSchema.index({ supplier: 1, createdAt: -1 });
supplyChainLogSchema.index({ 'relatedEntity.type': 1, 'relatedEntity.id': 1 });

module.exports = mongoose.model('SupplyChainLog', supplyChainLogSchema);
