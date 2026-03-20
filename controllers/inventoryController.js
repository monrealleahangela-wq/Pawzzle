const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StockSyncService = require('../services/stockSyncService');

const User = require('../models/User');

// Helper: auto-find or auto-create a default store for an admin
const resolveAdminStore = async (user) => {
  // 1. Check if the user document already has a store linked
  if (user.store) return user.store;

  // 2. Try to find an existing store owned by this user (for admins)
  if (user.role === 'admin') {
    let store = await Store.findOne({ owner: user._id });

    try {
      if (!store) {
        // 3. Create a default store for the admin on-the-fly if none exists
        const storeName = `${user.firstName || user.username || 'Admin'}'s Store`;
        store = new Store({
          name: storeName,
          slug: storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now(),
          description: `Default store for ${user.firstName || user.username || 'Admin'}`,
          businessType: 'pet_store',
          contactInfo: {
            phone: '000-000-0000',
            email: user.email,
            address: {
              street: '123 Default Street',
              barangay: 'Default District',
              city: 'Default City',
              state: 'Default State',
              zipCode: '00000',
              country: 'Default Country'
            }
          },
          owner: user._id,
          isActive: true
        });
        await store.save();
        console.log(`✅ Auto-created default store for admin ${user.email}: ${store._id}`);
      }

      // 4. Attach and persist it to the User document for future use
      user.store = store._id;
      await User.findByIdAndUpdate(user._id, { store: store._id });

      return store._id;
    } catch (error) {
      console.error('❌ Error resolving admin store:', error);
      throw error;
    }
  }

  return user.store || null;
};

// Get inventory for a store
const getStoreInventory = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { page = 1, limit = 20, status, search, category } = req.query;

    // Validate storeId
    if (!storeId || storeId === 'undefined') {
      return res.status(400).json({ message: 'Store ID is required' });
    }

    // Verify store exists and user has access
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Build filter
    let filter = { store: storeId, isActive: true };

    if (status) {
      switch (status) {
        case 'out_of_stock':
          filter.quantity = 0;
          break;
        case 'low_stock':
          filter.$expr = { $lte: ['$quantity', '$reorderLevel'] };
          filter.quantity = { $gt: 0 };
          break;
        case 'in_stock':
          filter.$expr = { $gt: ['$quantity', '$reorderLevel'] };
          filter.quantity = { $gt: 0 };
          break;
      }
    }

    if (search) {
      const products = await Product.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } },
          { sku: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      filter.product = { $in: products.map(p => p._id) };
    }

    if (category) {
      const products = await Product.find({ category }).select('_id');
      filter.product = { $in: products.map(p => p._id) };
    }

    const skip = (page - 1) * limit;

    const inventory = await Inventory.find(filter)
      .populate('product', 'name brand category sku price images')
      .sort({ 'quantity': 1 }) // Low stock first
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Inventory.countDocuments(filter);

    // Calculate summary statistics
    const summary = await Inventory.aggregate([
      { $match: { store: mongoose.Types.ObjectId(storeId), isActive: true } },
      {
        $group: {
          _id: null,
          totalItems: { $sum: '$quantity' },
          lowStockItems: {
            $sum: {
              $cond: [{ $lte: ['$quantity', '$reorderLevel'] }, 1, 0]
            }
          },
          outOfStockItems: {
            $sum: {
              $cond: [{ $eq: ['$quantity', 0] }, 1, 0]
            }
          },
          totalValue: { $sum: { $multiply: ['$quantity', '$costPrice'] } }
        }
      }
    ]);

    res.json({
      inventory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      summary: summary[0] || {
        totalItems: 0,
        lowStockItems: 0,
        outOfStockItems: 0,
        totalValue: 0
      }
    });
  } catch (error) {
    console.error('Get store inventory error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update inventory quantity
const updateInventoryQuantity = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, operation = 'set', notes } = req.body;

    const inventory = await Inventory.findById(id).populate('product');
    if (!inventory) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Verify store access
    if (req.user.role === 'admin') {
      const adminStore = await resolveAdminStore(req.user);
      if (inventory.store.toString() !== adminStore.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const oldQuantity = inventory.quantity;

    switch (operation) {
      case 'add':
        inventory.quantity += quantity;
        break;
      case 'subtract':
        inventory.quantity = Math.max(0, inventory.quantity - quantity);
        break;
      case 'set':
      default:
        inventory.quantity = quantity;
        break;
    }

    if (notes) {
      inventory.notes = notes;
    }

    await inventory.save();

    // Sync with product stock
    await StockSyncService.updateProductStockFromInventory(inventory.product._id);

    // Log the inventory change
    console.log(`Inventory updated: ${inventory.product.name} - ${oldQuantity} → ${inventory.quantity}`);

    res.json({
      message: 'Inventory updated successfully',
      inventory: await Inventory.findById(id).populate('product', 'name brand category sku price images')
    });
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add product to inventory
const addToInventory = async (req, res) => {
  try {
    const { productId, quantity, reorderLevel, maxStock, location, supplier, costPrice, notes } = req.body;

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Resolve the admin's store (auto-create if needed)
    const storeId = await resolveAdminStore(req.user);

    // Check if inventory item already exists
    const existingInventory = await Inventory.findOne({
      store: storeId,
      product: productId
    });

    if (existingInventory) {
      return res.status(400).json({ message: 'Product already in inventory' });
    }

    const inventory = new Inventory({
      store: storeId,
      product: productId,
      quantity: quantity || 0,
      reorderLevel: reorderLevel || 10,
      maxStock: maxStock || 1000,
      location,
      supplier,
      costPrice: costPrice || product.price,
      notes
    });

    await inventory.save();

    // Sync with product stock
    await StockSyncService.updateProductStockFromInventory(productId);

    res.status(201).json({
      message: 'Product added to inventory successfully',
      inventory: await Inventory.findById(inventory._id).populate('product', 'name brand category sku price images')
    });
  } catch (error) {
    console.error('Add to inventory error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get low stock alerts
const getLowStockAlerts = async (req, res) => {
  try {
    const storeId = await resolveAdminStore(req.user);

    // Validate storeId
    if (!storeId) {
      return res.status(400).json({ message: 'Store ID is required' });
    }

    const lowStockItems = await Inventory.find({
      store: storeId,
      isActive: true,
      $expr: { $lte: ['$quantity', '$reorderLevel'] }
    })
      .populate('product', 'name brand category sku images')
      .sort({ quantity: 1 });

    res.json({
      alerts: lowStockItems.map(item => ({
        id: item._id,
        product: item.product,
        currentStock: item.quantity,
        reorderLevel: item.reorderLevel,
        recommendedOrder: item.getRecommendedOrderQuantity(),
        urgency: item.quantity === 0 ? 'critical' : 'warning'
      }))
    });
  } catch (error) {
    console.error('Get low stock alerts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete inventory item
const deleteInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Verify store access
    if (req.user.role === 'admin') {
      const adminStore = await resolveAdminStore(req.user);
      if (inventory.store.toString() !== adminStore.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Soft delete
    inventory.isActive = false;
    await inventory.save();

    res.json({ message: 'Inventory item removed successfully' });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Admin convenience wrappers (no storeId param needed) ───────────────────

// GET /api/inventory/admin — admin fetches their own store's inventory
const getAdminInventory = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search, category, storeId: queryStoreId } = req.query;
    const storeId = queryStoreId || await resolveAdminStore(req.user);

    // 1. Build Product filter (Multi-tenant isolation)
    let productFilter = {};
    
    if (req.user.role === 'super_admin') {
      if (storeId) productFilter.store = storeId;
    } else if (req.user.role === 'staff') {
      if (req.user.store) {
        productFilter.store = req.user.store;
      } else {
        return res.status(403).json({ message: 'Staff account not assigned to a store' });
      }
    } else {
      // Admin
      const adminStores = await Store.find({ owner: req.user._id }).select('_id');
      const storeIds = adminStores.map(s => s._id);
      
      if (storeId) {
          if (!storeIds.map(id => id.toString()).includes(storeId.toString()) && req.user.role !== 'super_admin') {
               // Allow if the resolveAdminStore returned it, but double check ownership
               const isOwner = await Store.findOne({ _id: storeId, owner: req.user._id });
               if (!isOwner) return res.status(403).json({ message: 'Access denied to this store' });
          }
          productFilter.store = storeId;
      } else {
          productFilter.addedBy = req.user._id;
      }
    }

    if (search) {
      productFilter.$or = [
        { name: new RegExp(search, 'i') },
        { brand: new RegExp(search, 'i') },
        { category: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }
    if (category) productFilter.category = category;

    // 2. We need to fetch ALL products for this admin to calculate global statistics accurately
    const allAdminProducts = await Product.find(productFilter).select('_id name category price brand images');
    const productIds = allAdminProducts.map(p => p._id);

    // 3. Fetch all inventory records for these products in this store
    const allInventoryMap = await Inventory.find({
      store: storeId,
      product: { $in: productIds },
      isActive: true
    });

    // Create a map for quick lookup
    const invMap = {};
    allInventoryMap.forEach(inv => {
      invMap[inv.product.toString()] = inv;
    });

    // 4. Calculate Global Summary Statistics
    const globalSummary = allAdminProducts.reduce((acc, prod) => {
      const inv = invMap[prod._id.toString()];
      const qty = inv ? inv.quantity : 0;
      const reorder = inv ? inv.reorderLevel : 0;
      const cost = inv ? inv.costPrice : 0;

      acc.totalProducts += 1;
      if (qty === 0) {
        acc.outOfStockProducts += 1;
      } else if (qty <= reorder) {
        acc.lowStockProducts += 1;
      }
      acc.totalValue += (qty * cost);
      return acc;
    }, {
      totalProducts: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
      totalValue: 0
    });

    // 5. Apply Status filtering on the combined data set
    let combinedList = allAdminProducts.map(prod => {
      const inv = invMap[prod._id.toString()];
      return {
        product: prod,
        quantity: inv ? inv.quantity : 0,
        reorderLevel: inv ? inv.reorderLevel : 0,
        costPrice: inv ? inv.costPrice : 0,
        location: inv ? inv.location : null,
        updatedAt: inv ? inv.updatedAt : prod.updatedAt,
        inventoryId: inv ? inv._id : null,
        isActive: inv ? inv.isActive : true
      };
    });

    if (status) {
      combinedList = combinedList.filter(item => {
        if (status === 'out_of_stock') return item.quantity === 0;
        if (status === 'low_stock') return item.quantity > 0 && item.quantity <= item.reorderLevel;
        if (status === 'in_stock') return item.quantity > item.reorderLevel;
        return true;
      });
    }

    // 6. Manual Pagination on the combined list
    const total = combinedList.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedInventory = combinedList.slice(skip, skip + parseInt(limit));

    res.json({
      inventory: paginatedInventory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      summary: {
        totalItems: globalSummary.totalProducts,
        lowStockItems: globalSummary.lowStockProducts,
        outOfStockItems: globalSummary.outOfStockProducts,
        totalValue: globalSummary.totalValue
      }
    });
  } catch (error) {
    console.error(`❌ FATAL Get ${req.user.role} inventory error:`, error);
    res.status(500).json({
      message: 'Server error while fetching inventory',
      error: error.message
    });
  }
};

// GET /api/inventory/admin/alerts
const getLowStockAlertsAdmin = async (req, res) => {
  try {
    const storeId = await resolveAdminStore(req.user);
    const lowStockItems = await Inventory.find({
      store: storeId,
      isActive: true,
      $expr: { $lte: ['$quantity', '$reorderLevel'] }
    })
      .populate('product', 'name brand category sku images')
      .sort({ quantity: 1 });

    res.json({
      alerts: lowStockItems.map(item => ({
        id: item._id,
        product: item.product,
        currentStock: item.quantity,
        reorderLevel: item.reorderLevel,
        recommendedOrder: item.getRecommendedOrderQuantity(),
        urgency: item.quantity === 0 ? 'critical' : 'warning'
      }))
    });
  } catch (error) {
    console.error('Get admin low stock alerts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/inventory/admin — admin adds to their store's inventory
const addToAdminInventory = async (req, res) => {
  try {
    const errors = require('express-validator').validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, quantity, reorderLevel, maxStock, location, supplier, costPrice, notes } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Security: Only allow admin to add their own products to their inventory
    // Super-admins can add any product to their store
    if (req.user.role !== 'super_admin' && product.addedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: 'Access denied. You can only add your own products to your inventory.'
      });
    }

    const storeId = await resolveAdminStore(req.user);

    const existingInventory = await Inventory.findOne({ store: storeId, product: productId });
    if (existingInventory) {
      // If it already exists, just treat this as an ADD operation to the existing stock
      console.log('🔄 Product already in inventory, transitioning to update for store:', storeId);
      const oldQuantity = existingInventory.quantity;
      existingInventory.quantity += (quantity || 0);

      // Update other fields if provided and not set
      if (reorderLevel) existingInventory.reorderLevel = reorderLevel;
      if (costPrice) existingInventory.costPrice = costPrice;
      if (notes) existingInventory.notes = notes;

      await existingInventory.save();
      await StockSyncService.updateProductStockFromInventory(productId);

      return res.status(200).json({
        message: `Added ${quantity} to existing stock`,
        inventory: await Inventory.findById(existingInventory._id).populate('product', 'name brand category price images')
      });
    }

    const inventory = new Inventory({
      store: storeId,
      product: productId,
      quantity: quantity || 0,
      reorderLevel: reorderLevel || 10,
      maxStock: maxStock || 1000,
      location,
      supplier,
      costPrice: costPrice || product.price,
      notes
    });

    await inventory.save();
    await StockSyncService.updateProductStockFromInventory(productId);

    res.status(201).json({
      message: 'Product added to inventory successfully',
      inventory: await Inventory.findById(inventory._id).populate('product', 'name brand category sku price images')
    });
  } catch (error) {
    console.error('Add to admin inventory error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getStoreInventory,
  updateInventoryQuantity,
  addToInventory,
  getLowStockAlerts,
  deleteInventoryItem,
  getAdminInventory,
  getLowStockAlertsAdmin,
  addToAdminInventory
};
