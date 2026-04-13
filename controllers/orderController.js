const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Order = require('../models/Order');
const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StockSyncService = require('../services/stockSyncService');
const RevenueService = require('../services/revenueService');
const { createNotification, notifyStoreStaff } = require('./notificationController');
const User = require('../models/User');
const Voucher = require('../models/Voucher');
const { internalCreateDelivery } = require('./deliveryController');

// Get all orders (Admin only) or user's own orders (Customer)
const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search, dateRange } = req.query;

    let filter = { isDeleted: { $ne: true } };

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
    } else if (req.user.role === 'super_admin') {
      // Super admin sees all, no additional base filter unless searching
    }

    if (status && status !== '' && status !== 'all') {
      filter.status = status;
    }

    // Apply dateRange filter
    if (dateRange) {
      const now = new Date();
      let startDate;
      if (dateRange === 'today') {
        startDate = new Date(now.setHours(0, 0, 0, 0));
      } else if (dateRange === 'week') {
        startDate = new Date(now.setDate(now.getDate() - 7));
      } else if (dateRange === 'month') {
        startDate = new Date(now.setMonth(now.getMonth() - 1));
      }

      if (startDate) {
        filter.createdAt = { $gte: startDate };
      }
    }

    // Apply search filter (Super admin only for now)
    if (search && search !== '') {
      // Find matching users if searching by name/email
      const matchedUsers = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ]
      }, '_id');

      const userIds = matchedUsers.map(u => u._id);

      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { customer: { $in: userIds } }
      ];

      // Mongoose automatically converts _id if valid
      if (mongoose.Types.ObjectId.isValid(search)) {
        filter.$or.push({ _id: search });
      }
    }

    const skip = (page - 1) * limit;
    const orders = await Order.find(filter)
      .populate('customer', 'username firstName lastName email')
      .populate('store', 'name')
      .populate('delivery', 'status trackingToken isLive riderLocation')
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
      .populate('store')
      .populate('delivery');

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

    const { items, shippingAddress, paymentMethod, notes, deliveryMethod: requestedMethod, phoneNumber, shippingFee, voucherCode } = req.body;

    const hasPet = items.some(item => item.itemType === 'pet');
    const deliveryMethod = hasPet ? 'pickup' : requestedMethod;

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
          return res.status(400).json({ message: `Pet "${itemDoc?.name || item.itemId}" is not available` });
        }
      } else if (item.itemType === 'product') {
        itemDoc = await Product.findById(item.itemId);
        if (!itemDoc || !itemDoc.isActive || itemDoc.stockQuantity < item.quantity) {
          return res.status(400).json({ message: `Product "${itemDoc?.name || item.itemId}" is not available or has insufficient stock` });
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

    // Notify store staff (Order Staff) about new order
    await notifyStoreStaff(storeId, 'order_staff', {
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
    const activeStatuses = ['confirmed', 'processing', 'shipped', 'delivered', 'completed', 'finalized'];
    const inactiveStatuses = ['pending', 'cancelled'];

    // 1. DEDUCT stock (Inactive -> Active)
    if (activeStatuses.includes(status) && inactiveStatuses.includes(oldStatus)) {
      console.log(`🔄 Order ${order._id} moving to ${status}. Deducting stock...`);
      
      // Auto-generate delivery links if it's a delivery order and status is confirmed or beyond
      if (order.deliveryMethod === 'delivery' && (status === 'confirmed' || status === 'processing')) {
        await internalCreateDelivery({ orderId: order._id });
        
        // Notify Delivery Staff
        try {
          const { notifyStoreStaff } = require('./notificationController');
          await notifyStoreStaff(order.store, 'delivery_staff', {
            type: 'new_order', // Or 'delivery_alert'
            title: 'Package Ready for Dispatch',
            message: `Order #${order._id.toString().slice(-6)} is ready for delivery. Tracking links have been generated.`,
            relatedId: order._id,
            relatedModel: 'Order'
          });
        } catch (err) {
          console.error('⚠️ Delivery notification failed:', err.message);
        }
      }

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
          await Pet.findByIdAndUpdate(item.itemId, { 
            isAvailable: false,
            status: 'reserved'
          });
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
          await Pet.findByIdAndUpdate(item.itemId, { 
            isAvailable: true,
            status: 'available'
          });
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

    // Check if order can be cancelled - only pending orders can be cancelled by customers
    if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json({ message: 'Order cannot be cancelled once confirmed or processed' });
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
      
      // Auto-generate delivery links if it's a delivery order
      if (order.deliveryMethod === 'delivery') {
        await internalCreateDelivery({ orderId: order._id });
      }

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
          }
        } else if (item.itemType === 'pet') {
          await Pet.findByIdAndUpdate(item.itemId, { 
            isAvailable: false, 
            status: 'reserved' 
          });
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

// Confirm order pickup (Buyer confirming they received the pet/item)
const confirmOrderPickup = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Only buyer can confirm pickup for their own order
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. Only the buyer can confirm receipt' });
    }

    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ message: 'Order must be paid before confirming pickup' });
    }

    if (order.status === 'delivered') {
      return res.status(400).json({ message: 'Pickup has already been confirmed' });
    }

    order.status = 'delivered';
    order.payoutStatus = 'released';
    order.pickupSession.verifiedAt = new Date();

    // Mark pets as SOLD
    for (const item of order.items) {
      if (item.itemType === 'pet') {
        await Pet.findByIdAndUpdate(item.itemId, { 
          isAvailable: false, 
          status: 'sold' 
        });
      }
    }

    // Calculate Platform Commission (e.g., 10%)
    const commissionRate = 0.10;
    order.platformCommission = order.totalAmount * commissionRate;
    const netPayout = order.totalAmount - order.platformCommission;

    await order.save();

    // Update Store Balance
    if (order.store) {
      const store = await Store.findById(order.store);
      if (store) {
        store.balance = (store.balance || 0) + netPayout;
        store.stats.totalRevenue = (store.stats.totalRevenue || 0) + order.totalAmount;
        store.stats.totalPlatformFees = (store.stats.totalPlatformFees || 0) + order.platformCommission;
        await store.save();
      }
    }

    res.json({
      message: 'Pickup confirmed and payout released to seller',
      order: await Order.findById(order._id).populate('customer', 'username firstName lastName email')
    });

    // Notify seller about payout release
    await createNotification({
      recipient: order.addedBy,
      sender: req.user._id,
      type: 'payout_released',
      title: 'Payout Released',
      message: `Pickup confirmed for order #${order._id.toString().slice(-6)}. ₱${netPayout.toLocaleString()} has been added to your balance.`,
      relatedId: order._id,
      relatedModel: 'Order'
    });
  } catch (error) {
    console.error('Confirm pickup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Validate Order QR code (Seller scanning Buyer's order)
const validateOrderQR = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'Order protocol identifier required' });

    const order = await Order.findById(orderId)
      .populate('customer', 'firstName lastName email')
      .populate('items.productId'); // If products exist

    if (!order) return res.status(404).json({ message: 'Order protocol not found in mainframe' });

    // Verify scan ownership (Seller must own the store associated with this order or be super_admin)
    const isSuperAdmin = req.user.role === 'super_admin';
    const isStoreOwner = req.user.store && order.store && req.user.store.toString() === order.store.toString();

    if (!isSuperAdmin && !isStoreOwner) {
      return res.status(403).json({ 
        message: 'Access Denied: Protocol Mismatch', 
        details: 'You are not authorized to validate this specific order protocol.' 
      });
    }

    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ 
        message: 'Financial protocol incomplete. This order is UNPAID.',
        details: 'Escrow must be funded via Online Payment before physical pickup can proceed.'
      });
    }

    // Mark as validated/scanned
    order.isScanned = true;
    if (order.status === 'confirmed' || order.status === 'processing') {
      // order.status = 'delivered'; // Optionally auto-deliver or let seller hit continue
    }
    await order.save();

    res.json({
      message: 'Order protocol authenticated successfully!',
      order: order,
      protocolStatus: 'READY_FOR_PICKUP'
    });

  } catch (error) {
    console.error('Order QR Validation error:', error);
    res.status(500).json({ message: 'Internal protocol error' });
  }
};

module.exports = {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  confirmOrderPayment,
  confirmOrderPickup,
  cancelOrder,
  validateOrderQR
};
