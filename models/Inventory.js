const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  reorderLevel: {
    type: Number,
    default: 10,
    min: 0
  },
  maxStock: {
    type: Number,
    default: 1000,
    min: 0
  },
  location: {
    aisle: String,
    shelf: String,
    bin: String
  },
  lastRestocked: {
    type: Date,
    default: Date.now
  },
  supplier: {
    name: String,
    contact: String,
    email: String,
    phone: String
  },
  // ── Linked Supplier (new) ─────────────────────────────
  supplierRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplierProductRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierProduct'
  },
  lastPurchaseOrderRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  },
  costPrice: {
    type: Number,
    min: 0
  },
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
inventorySchema.index({ store: 1, product: 1 }, { unique: true });
inventorySchema.index({ store: 1, quantity: 1 });
inventorySchema.index({ store: 1, 'quantity': 1, 'reorderLevel': 1 });

// Virtual for stock status
inventorySchema.virtual('stockStatus').get(function () {
  if (this.quantity === 0) return 'out_of_stock';
  if (this.quantity <= this.reorderLevel) return 'low_stock';
  return 'in_stock';
});

// Virtual for stock value
inventorySchema.virtual('stockValue').get(function () {
  return this.quantity * this.costPrice;
});

// Method to check if item needs reordering
inventorySchema.methods.needsReorder = function () {
  return this.quantity <= this.reorderLevel;
};

// Method to calculate recommended order quantity
inventorySchema.methods.getRecommendedOrderQuantity = function () {
  return Math.max(this.maxStock - this.quantity, this.reorderLevel * 2);
};

module.exports = mongoose.model('Inventory', inventorySchema);
