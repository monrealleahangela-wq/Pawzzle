const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const StockSyncService = require('../services/stockSyncService');
const mongoose = require('mongoose');

// Helper: auto-find or auto-create a default store for an admin
const resolveAdminStore = async (user) => {
  const Store = require('../models/Store');
  const User = require('../models/User');

  if (user.store) return user.store;
  let store = await Store.findOne({ owner: user._id || user.id });

  try {
    if (!store) {
      const storeName = `${user.firstName || user.username || 'Admin'}'s Store`;
      store = new Store({
        name: storeName,
        slug: storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now(),
        description: `Default operational node for ${user.firstName || user.username || 'Admin'}`,
        businessType: 'pet_store',
        contactInfo: {
          phone: '000-000-0000',
          email: user.email,
          address: {
            street: '123 Nexus Way',
            barangay: 'Default District',
            city: 'Default Center',
            state: 'Default Sector',
            zipCode: '00000',
            country: 'Primary'
          }
        },
        owner: user._id || user.id,
        isActive: true
      });
      await store.save();
      console.log(`✅ Provisioned default store matrix for admin ${user.email}`);
    }

    user.store = store._id;
    await User.findByIdAndUpdate(user._id || user.id, { store: store._id });
    return store._id;
  } catch (error) {
    console.error('❌ Store resolution failure:', error);
    throw error;
  }
};

// Get all products with filtering
const getAllProducts = async (req, res) => {
  try {
    const { category, brand, suitableFor, minPrice, maxPrice, inStock, search, city, page = 1, limit = 10 } = req.query;

    const filter = { isActive: true, isDeleted: { $ne: true } };

    // Filter by City (if provided, we need to find stores in that city first)
    if (city) {
      const Store = require('../models/Store');
      const cityFilter = city.replace(/[nñ]/gi, '[nñ]');
      const storesInCity = await Store.find({
        'contactInfo.address.city': { $regex: new RegExp(cityFilter, 'i') }
      }).select('_id');
      const storeIds = storesInCity.map(s => s._id);
      filter.store = { $in: storeIds };
    }

    const isAdminRoute = req.originalUrl && req.originalUrl.includes('/admin');

    if (isAdminRoute) {
      if (req.user.role === 'staff' && req.user.store) {
        filter.store = req.user.store;
      } else if (req.user.role === 'admin') {
        // Multi-tenant isolation: check if they have a store or fallback to addedBy
        if (req.user.store) {
          filter.store = req.user.store;
        } else {
          filter.addedBy = req.user._id || req.user.id;
        }
      }
      // super_admin sees everything (no extra filter)
    }

    if (category) filter.category = category;
    if (brand) filter.brand = new RegExp(brand, 'i');
    if (suitableFor) filter.suitableFor = suitableFor;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true' || inStock === true) {
      filter.stockQuantity = { $gt: 0 };
    }

    if (search && search !== '') {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const products = await Product.find(filter)
      .populate('addedBy', 'username firstName lastName')
      .populate('store', 'name contactInfo.address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducts: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get product by ID
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('addedBy', 'username firstName lastName')
      .populate('store', 'name contactInfo.address phone email openingHours');

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new product (Admin only)
const createProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const storeId = await resolveAdminStore(req.user);

    const productData = {
      ...req.body,
      addedBy: req.user.id || req.user._id,
      store: storeId,
      stockQuantity: 0
    };

    const product = new Product(productData);
    await product.save();

    try {
      await StockSyncService.initializeInventoryForProduct(
        product._id,
        storeId,
        0
      );
    } catch (inventoryError) {
      console.warn('Failed to initialize inventory for product:', inventoryError.message);
    }

    const populatedProduct = await Product.findById(product._id).populate('addedBy', 'username firstName lastName');

    res.status(201).json({
      message: 'Product created successfully',
      product: populatedProduct
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update product (Admin only or owner)
const updateProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.findById(req.params.id);

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check permissions safely
    const userId = (req.user._id || req.user.id).toString();
    const isOwner = product.addedBy && product.addedBy.toString() === userId;
    const isStoreStaff = req.user.role === 'staff' && req.user.store && product.store && product.store.toString() === req.user.store.toString();
    
    let isStoreOwner = false;
    if (req.user.role === 'admin' && product.store) {
      const Store = require('../models/Store');
      const store = await Store.findById(product.store);
      isStoreOwner = store && store.owner && store.owner.toString() === userId;
    }

    if (req.user.role !== 'super_admin' && !isOwner && !isStoreStaff && !isStoreOwner) {
      return res.status(403).json({ message: 'Access denied. You do not have permission to update this asset.' });
    }

    // Protect immutable/critical fields
    const { stockQuantity, _id, id, store, addedBy, ...updateData } = req.body;
    
    // Explicitly update only mutable fields
    Object.assign(product, updateData);

    // Ensure store resolution if missing
    if (!product.store) {
      product.store = await resolveAdminStore(req.user);
    }

    await product.save();

    const updatedProduct = await Product.findById(product._id).populate('addedBy', 'username firstName lastName');

    res.json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Update product error:', error);
    
    // Specifically handle unique constraint violations (e.g., SKU already in use)
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Conflict: The provided SKU is already assigned to another product. Catalog identifiers must be unique.' 
      });
    }
    
    res.status(500).json({ message: 'Internal server error during asset synchronization' });
  }
};

// Delete product (Admin only or owner)
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check permissions: Owner, store staff, or super admin
    const isOwner = product.addedBy.toString() === (req.user.id || req.user._id).toString();
    const isStoreStaff = req.user.role === 'staff' && req.user.store && product.store && product.store.toString() === req.user.store.toString();
    const Store = require('../models/Store');
    const isStoreOwner = req.user.role === 'admin' && product.store && (await Store.findById(product.store))?.owner.toString() === req.user._id.toString();

    if (req.user.role !== 'super_admin' && !isOwner && !isStoreStaff && !isStoreOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    product.isDeleted = true;
    await product.save();

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update product stock
const updateStock = async (req, res) => {
  try {
    const { stockQuantity } = req.body;

    if (stockQuantity < 0) {
      return res.status(400).json({ message: 'Stock quantity cannot be negative' });
    }

    const product = await Product.findById(req.params.id);

    if (!product || product.isDeleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check permissions: Owner, store staff, or super admin
    const isOwner = product.addedBy.toString() === (req.user.id || req.user._id).toString();
    const isStoreStaff = req.user.role === 'staff' && req.user.store && product.store && product.store.toString() === req.user.store.toString();
    const Store = require('../models/Store');
    const isStoreOwner = req.user.role === 'admin' && product.store && (await Store.findById(product.store))?.owner.toString() === req.user._id.toString();

    if (req.user.role !== 'super_admin' && !isOwner && !isStoreStaff && !isStoreOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    product.stockQuantity = stockQuantity;
    await product.save();

    res.json({
      message: 'Stock updated successfully',
      stockQuantity: product.stockQuantity
    });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock
};
