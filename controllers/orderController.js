const { validationResult } = require('express-validator');
const Order = require('../models/Order');
const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StockSyncService = require('../services/stockSyncService');
const RevenueService = require('../services/revenueService');
const { createNotification } = require('./notificationController');
const User = require('../models/User');
const Voucher = require('../models/Voucher');

// Get all orders (Admin only) or user's own orders (Customer)
const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    let filter = {};

    // Check if this is an admin route (check full original URL)
    const isAdminRoute = req.originalUrl && req.originalUrl.includes('/admin');
    console.log('📦 Order request - Original URL:', req.originalUrl);
    console.log('📦 Order request - Is admin route:', isAdminRoute);

    // Customers can only see their own orders
    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    } else if (isAdminRoute && req.user.role === 'admin') {
      // Multi-tenant isolation: filter orders by admin user ID
      filter.addedBy = req.user._id;
      console.log('🔒 Multi-tenant isolation - showing orders for admin:', req.user._id);
    }

    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const orders = await Order.find(filter)
      .populate('customer', 'username firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get order by ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'username firstName lastName email phone address')
      .populate('store');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check permissions: customers can only see their own orders
    if (req.user.role === 'customer' && order.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!order.store) {
      const fallbackStore = await Store.findOne({ owner: order.addedBy });
      if (fallbackStore) {
        return res.json({
          order: {
            ...order.toObject(),
            store: fallbackStore
          }
        });
      }
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new order (Customer only)
const createOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, shippingAddress, paymentMethod, notes, deliveryMethod, phoneNumber, shippingFee, voucherCode } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }

    let totalAmount = 0;
    const processedItems = [];
    let adminOwner = null;
    let storeId = null;

    // Validate and process each item
    for (const item of items) {
      let itemDoc;

      if (item.itemType === 'pet') {
        itemDoc = await Pet.findById(item.itemId);
        if (!itemDoc || !itemDoc.isAvailable) {
          return res.status(400).json({ message: `Pet ${item.itemId} is not available` });
        }
      } else if (item.itemType === 'product') {
        itemDoc = await Product.findById(item.itemId);
        if (!itemDoc || !itemDoc.isActive || itemDoc.stockQuantity < item.quantity) {
          return res.status(400).json({ message: `Product ${item.itemId} is not available or insufficient stock` });
        }

        // Stock will be reduced only when the seller confirms the order in updateOrderStatus
        // This prevents stock from being held by unpaid or pending orders
        console.log(`📝 Order created for product ${item.itemId}. Stock will be deducted on confirmation.`);
      } else {
        return res.status(400).json({ message: 'Invalid item type' });
      }

      // Set adminOwner and storeId from the first item if not already set
      if (!adminOwner && itemDoc.addedBy) {
        adminOwner = itemDoc.addedBy;
      }
      if (!storeId && itemDoc.store) {
        storeId = itemDoc.store;
      }

      const itemTotal = itemDoc.price * item.quantity;
      totalAmount += itemTotal;

      processedItems.push({
        itemType: item.itemType,
        itemId: item.itemId,
        name: itemDoc.name,
        price: itemDoc.price,
        quantity: item.quantity,
        image: itemDoc.images?.[0] || null
      });

      // Pet availability will be updated to false only when the seller confirms the order
      // This allows multiple inquiries/orders until one is officially confirmed
      console.log(`📝 Order created for pet ${item.itemId}. Availability will be updated on confirmation.`);
    }

    // Safety check for adminOwner
    if (!adminOwner) {
      console.error('❌ Could not determine adminOwner for order items');
      // Fallback: try to find any admin in the system if this happens
      const firstAdmin = await User.findOne({ role: 'admin' });
      if (firstAdmin) {
        adminOwner = firstAdmin._id;
        console.log('ℹ️ Using fallback adminOwner:', adminOwner);
      } else {
        return res.status(400).json({ message: 'Could not determine store owner for these items' });
      }
    }

    // Process Voucher if provided
    let discountAmount = 0;
    let appliedVoucherId = null;

    if (voucherCode) {
      const voucher = await Voucher.findOne({
        code: voucherCode.toUpperCase(),
        isActive: true,
        store: storeId
      });

      if (voucher) {
        const now = new Date();
        const isValidDate = now >= voucher.startDate && now <= voucher.endDate;
        const isWithinLimit = voucher.usageLimit === null || voucher.usedCount < voucher.usageLimit;
        const meetsMinPurchase = totalAmount >= voucher.minPurchase;

        if (isValidDate && isWithinLimit && meetsMinPurchase) {
          if (voucher.discountType === 'percentage') {
            discountAmount = (totalAmount * (voucher.discountValue / 100));
          } else {
            discountAmount = voucher.discountValue;
          }

          discountAmount = Math.min(discountAmount, totalAmount);
          appliedVoucherId = voucher._id;

          // Increment used count
          voucher.usedCount += 1;
          await voucher.save();
        }
      }
    }

    const orderData = {
      customer: req.user._id,
      addedBy: adminOwner,
      store: storeId,
      items: processedItems,
      totalAmount: (totalAmount - discountAmount) + (deliveryMethod === 'pickup' ? 0 : (shippingFee || 0)),
      voucher: appliedVoucherId,
      discountAmount,
      shippingFee: deliveryMethod === 'pickup' ? 0 : (shippingFee || 0),
      deliveryMethod,
      shippingAddress: deliveryMethod === 'delivery' ? shippingAddress : {},
      phoneNumber,
      paymentMethod,
      notes,
      status: 'pending' // Orders start as pending and require admin confirmation
    };

    console.log('📝 Creating order with data:', JSON.stringify(orderData, null, 2));
    const order = new Order(orderData);
    await order.save();
    console.log('✅ Order saved successfully:', order._id);

    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'username firstName lastName email')
      .populate('store');

    res.status(201).json({
      message: 'Order created successfully',
      order: populatedOrder
    });

    // Notify store owner about new order
    await createNotification({
      recipient: adminOwner,
      sender: req.user._id,
      type: 'new_order',
      title: 'New Order Received',
      message: `You have received a new order for ${processedItems.length} item(s).`,
      relatedId: order._id,
      relatedModel: 'Order'
    });
  } catch (error) {
    console.error('❌ Create order error full details:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors: messages });
    }
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
};

// Update order status (Admin only)
const updateOrderStatus = async (req, res) => {
  try {
    const { status, trackingNumber } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const oldStatus = order.status;
    order.status = status || order.status;
    if (trackingNumber) order.trackingNumber = trackingNumber;

    // Bidirectional Stock Sync
    const activeStatuses = ['confirmed', 'processing', 'shipped', 'delivered'];
    const inactiveStatuses = ['pending', 'cancelled'];

    // 1. DEDUCT stock (Inactive -> Active)
    if (activeStatuses.includes(status) && inactiveStatuses.includes(oldStatus)) {
      console.log(`🔄 Order ${order._id} moving to ${status}. Deducting stock...`);
      for (const item of order.items) {
        if (item.itemType === 'product') {
          try {
            const product = await Product.findById(item.itemId);
            if (product) {
              const sellerStore = await Store.findOne({ owner: product.addedBy });
              if (sellerStore) {
                await StockSyncService.reduceStockOnOrder(item.itemId, item.quantity, sellerStore._id);
              } else {
                product.stockQuantity -= item.quantity;
                await product.save();
              }
            }
          } catch (stockError) {
            console.error(`❌ Stock deduction failed:`, stockError);
            order.status = oldStatus;
            await order.save();
            return res.status(400).json({ message: `Failed to update: ${stockError.message}` });
          }
        } else if (item.itemType === 'pet') {
          await Pet.findByIdAndUpdate(item.itemId, { isAvailable: false });
        }
      }
    }
      // 2. RESTORE stock (Active -> Inactive)
    else if (inactiveStatuses.includes(status) && activeStatuses.includes(oldStatus)) {
      console.log(`🔄 Order ${order._id} reverted to ${status}. Restoring stock...`);
      for (const item of order.items) {
        if (item.itemType === 'product') {
          try {
            const product = await Product.findById(item.itemId);
            if (product) {
              const sellerStore = await Store.findOne({ owner: product.addedBy });
              if (sellerStore) {
                await StockSyncService.addStockOnRestock(item.itemId, item.quantity, sellerStore._id);
              } else {
                product.stockQuantity += item.quantity;
                await product.save();
              }
            }
          } catch (restoreError) {
            console.error(`❌ Stock restoration failed:`, restoreError);
          }
        } else if (item.itemType === 'pet') {
          await Pet.findByIdAndUpdate(item.itemId, { isAvailable: true });
        }
      }
    }

    // 3. REVERSE revenue if cancelled after payment
    if (status === 'cancelled' && oldStatus !== 'cancelled' && order.isRevenueRecorded) {
      await RevenueService.reversePayment('order', order._id);
    }

    if (status === 'delivered') {
      order.deliveryDate = new Date();
    }

    await order.save();

    const updatedOrder = await Order.findById(order._id)
      .populate('customer', 'username firstName lastName email');

    res.json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });

    // Notify customer about order status update
    await createNotification({
      recipient: order.customer,
      sender: req.user._id,
      type: 'order_status',
      title: 'Order Status Updated',
      message: `Your order status has been updated to: ${status}.`,
      relatedId: order._id,
      relatedModel: 'Order'
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel order (Customer for own orders, Admin for any)
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check permissions
    if (req.user.role === 'customer' && order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if order can be cancelled
    if (['shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json({ message: 'Order cannot be cancelled in current status' });
    }

    // Restore product stock for cancelled orders ONLY if stock was already deducted (confirmed or beyond)
    // Pets are restored regardless of status since they are marked unavailable immediately on order
    const stockWasDeducted = ['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status);

    for (const item of order.items) {
      if (item.itemType === 'product' && stockWasDeducted) {
        try {
          const product = await Product.findById(item.itemId);
          if (product) {
            // Find the seller's store for this product to restore inventory
            const sellerStore = await Store.findOne({ owner: product.addedBy });

            if (sellerStore) {
              console.log(`🔄 Restoring stock for cancelled item: ${item.name} (${item.quantity} units) to store ${sellerStore._id}`);
              await StockSyncService.addStockOnRestock(item.itemId, item.quantity, sellerStore._id);
            } else {
              console.warn(`⚠️ No store found for seller ${product.addedBy}, restoring product-level stock only`);
              product.stockQuantity += item.quantity;
              await product.save();
            }
          }
        } catch (restoreError) {
          console.error(`❌ Failed to restore stock for item ${item.itemId}:`, restoreError);
          // Continue with other items even if one fails
        }
      } else if (item.itemType === 'pet' && stockWasDeducted) {
        const pet = await Pet.findById(item.itemId);
        if (pet) {
          pet.isAvailable = true;
          await pet.save();
          console.log(`✅ Pet ${pet.name} is now available again after cancellation`);
        }
      }
    }

    // REVERSE revenue if cancelled after payment
    if (order.isRevenueRecorded) {
      await RevenueService.reversePayment('order', order._id);
    }

    // Decrement voucher usage if order is cancelled
    if (order.voucher) {
      await Voucher.findByIdAndUpdate(order.voucher, { $inc: { usedCount: -1 } });
      console.log(`🎫 Voucher usage REVERSED for order #${order._id} due to cancellation.`);
    }

    order.status = 'cancelled';
    await order.save();

    res.json({ message: 'Order cancelled successfully' });

    // Notify the other party about cancellation
    const isCustomer = req.user.role === 'customer';
    await createNotification({
      recipient: isCustomer ? order.addedBy : order.customer,
      sender: req.user._id,
      type: 'order_status',
      title: 'Order Cancelled',
      message: `Order #${order._id.toString().slice(-6)} has been cancelled by the ${isCustomer ? 'customer' : 'store'}.`,
      relatedId: order._id,
      relatedModel: 'Order'
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Confirm order payment (Admin only)
const confirmOrderPayment = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot confirm payment for a canceled order' });
    }

    // Only allow for certain payment statuses to be updated manually
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Order is already marked as paid' });
    }

    const oldStatus = order.status;
    order.paymentStatus = 'paid';

    // If order was pending, automatically confirm it once paid
    if (order.status === 'pending') {
      order.status = 'confirmed';

      // DEDUCT stock if moving from pending to confirmed
      console.log(`🔄 Order ${order._id} paid and moving to confirmed. Deducting stock...`);
      for (const item of order.items) {
        if (item.itemType === 'product') {
          try {
            const product = await Product.findById(item.itemId);
            if (product) {
              const sellerStore = await Store.findOne({ owner: product.addedBy });
              if (sellerStore) {
                await StockSyncService.reduceStockOnOrder(item.itemId, item.quantity, sellerStore._id);
              } else {
                product.stockQuantity -= item.quantity;
                await product.save();
              }
            }
          } catch (stockError) {
            console.error(`❌ Stock deduction failed for order ${order._id}:`, stockError.message);
            // We continue as payment is already confirmed
          }
        } else if (item.itemType === 'pet') {
          await Pet.findByIdAndUpdate(item.itemId, { isAvailable: false });
        }
      }
    }

    // Record revenue and update store stats via central service
    await RevenueService.recordPayment('order', order._id);

    res.json({
      message: 'Payment confirmed successfully',
      order: await Order.findById(order._id).populate('customer', 'username firstName lastName email')
    });

    // Notify customer about payment confirmation
    await createNotification({
      recipient: order.customer,
      sender: req.user._id,
      type: 'order_status',
      title: 'Payment Confirmed',
      message: `Your payment for order #${order._id.toString().slice(-6)} has been confirmed.`,
      relatedId: order._id,
      relatedModel: 'Order'
    });
  } catch (error) {
    console.error('Confirm order payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  confirmOrderPayment,
  cancelOrder
};
