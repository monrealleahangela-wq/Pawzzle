const axios = require('axios');
const Order = require('../models/Order');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const StockSyncService = require('../services/stockSyncService');
const RevenueService = require('../services/revenueService');
const { createNotification } = require('./notificationController');
const { internalCreateDelivery } = require('./deliveryController');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL || FRONTEND_URL.includes('localhost')) {
    FRONTEND_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

/**
 * Create a PayMongo Checkout Session
 */
const createCheckoutSession = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId).populate('customer');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot pay for a canceled order' });
        }

        if (order.customer._id.toString() !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        // PayMongo expects amount in centavos
        const amountInCentavos = Math.round(order.totalAmount * 100);

        const data = {
            data: {
                attributes: {
                    send_email_receipt: true,
                    show_description: true,
                    show_line_items: true,
                    description: `Payment for Order #${order.orderNumber}`,
                    line_items: order.items.map(item => ({
                        amount: Math.round(item.price * 100),
                        currency: 'PHP',
                        name: item.name,
                        quantity: item.quantity
                    })),
                    payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
                    success_url: `${FRONTEND_URL}/orders/${order._id}?payment=success`,
                    cancel_url: `${FRONTEND_URL}/checkout?payment=cancelled`,
                    reference_number: order.orderNumber
                }
            }
        };

        // Add shipping fee if applicable
        if (order.shippingFee > 0) {
            data.data.attributes.line_items.push({
                amount: Math.round(order.shippingFee * 100),
                currency: 'PHP',
                name: 'Shipping Fee',
                quantity: 1
            });
        }

        const response = await axios.post('https://api.paymongo.com/v1/checkout_sessions', data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
            }
        });

        const session = response.data.data;

        // Save session info to order
        order.paymentDetails = {
            sessionId: session.id,
            checkoutUrl: session.attributes.checkout_url
        };
        await order.save();

        res.json({
            checkoutUrl: session.attributes.checkout_url
        });
    } catch (error) {
        console.error('PayMongo Create Session Error:', error.response?.data || error.message);
        res.status(500).json({
            message: 'Failed to create payment session',
            error: error.response?.data?.errors?.[0]?.detail || error.message
        });
    }
};

/**
 * Create a PayMongo Checkout Session for a Booking
 */
const createBookingCheckoutSession = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const Booking = require('../models/Booking');
        const booking = await Booking.findById(bookingId).populate('customer').populate('service');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot pay for a canceled booking' });
        }

        const amountInCentavos = Math.round(booking.totalPrice * 100);
        const data = {
            data: {
                attributes: {
                    send_email_receipt: true,
                    show_description: true,
                    show_line_items: true,
                    description: `Booking for ${booking.service.name}`,
                    line_items: [{
                        amount: amountInCentavos,
                        currency: 'PHP',
                        name: booking.service.name,
                        quantity: 1
                    }],
                    payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
                    success_url: `${FRONTEND_URL}/bookings?payment=success&id=${booking._id}`,
                    cancel_url: `${FRONTEND_URL}/bookings?payment=cancelled`,
                    reference_number: `BK-${booking._id.toString().slice(-8).toUpperCase()}`
                }
            }
        };

        const response = await axios.post('https://api.paymongo.com/v1/checkout_sessions', data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
            }
        });

        const session = response.data.data;
        booking.paymentDetails = {
            sessionId: session.id,
            checkoutUrl: session.attributes.checkout_url
        };
        await booking.save();

        res.json({ checkoutUrl: session.attributes.checkout_url });
    } catch (error) {
        console.error('PayMongo Create Booking Session Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to create payment session' });
    }
};

/**
 * Handle PayMongo Webhook
 */
const handleWebhook = async (req, res) => {
    try {
        const event = req.body.data;
        const eventType = event.attributes.type;

        console.log('🔔 Received PayMongo Webhook Event:', eventType);

        if (eventType === 'checkout_session.payment.paid') {
            const checkoutSession = event.attributes.data;
            const ref = checkoutSession.attributes.reference_number;
            const paymentData = checkoutSession.attributes.payments[0];

            if (ref && ref.startsWith('BK-')) {
                // It's a booking
                const Booking = require('../models/Booking');
                // We stored the session ID in booking.paymentDetails.sessionId
                const booking = await Booking.findOne({ 'paymentDetails.sessionId': checkoutSession.id });
                if (booking) {
                    booking.paymentStatus = 'paid';
                    booking.paymentMethod = paymentData.attributes.source.type;
                    booking.paymentDetails.paymentId = paymentData.id;
                    
                    // Ensure the booking isn't cancelled if it was auto-cancelled while paying
                    // Status remains 'pending' (awaiting seller approval)
                    if (booking.status === 'cancelled') {
                        booking.status = 'pending';
                    }
                    
                    await booking.save();
                    
                    // Notify seller: payment received, approval needed
                    await createNotification({
                        recipient: booking.addedBy,
                        sender: booking.customer,
                        type: 'booking_status',
                        title: '💳 Payment Received – Approval Needed',
                        message: `A customer has paid for booking #${booking._id.toString().slice(-8).toUpperCase()}. Please review and approve to generate their QR entry code.`,
                        relatedId: booking._id,
                        relatedModel: 'Booking'
                    });

                    // Notify customer: payment received, waiting for approval
                    await createNotification({
                        recipient: booking.customer,
                        sender: booking.addedBy,
                        type: 'booking_status',
                        title: '✅ Payment Received – Awaiting Approval',
                        message: `Your payment for booking #${booking._id.toString().slice(-8).toUpperCase()} has been received! The seller will review and approve it shortly. Your QR entry code will be sent once approved.`,
                        relatedId: booking._id,
                        relatedModel: 'Booking'
                    });
                    
                    console.log(`✅ Booking ${booking._id} marked as PAID via webhook. Awaiting Seller Approval.`);
                }
                return res.sendStatus(200);
            }

            const orderNumber = checkoutSession.attributes.reference_number;
            const order = await Order.findOne({ orderNumber });

            if (order) {
                if (order.status === 'cancelled') {
                    console.log(`⚠️ Received payment for cancelled order #${order.orderNumber}. Marking as paid but keeping cancelled status.`);
                    order.paymentStatus = 'paid';
                    order.paymentMethod = paymentData.attributes.source.type;
                    order.paymentDetails = {
                        ...order.paymentDetails,
                        paymentId: paymentData.id,
                        amountPaid: paymentData.attributes.amount / 100,
                        transactionDate: new Date(paymentData.attributes.paid_at * 1000)
                    };
                    await order.save();
                    return res.sendStatus(200);
                }

                order.paymentStatus = 'paid';
                order.status = 'confirmed'; // Automatically confirm order on payment
                order.paymentMethod = paymentData.attributes.source.type; // e.g., 'gcash', 'card'
                order.paymentDetails = {
                    ...order.paymentDetails,
                    paymentId: paymentData.id,
                    amountPaid: paymentData.attributes.amount / 100,
                    transactionDate: new Date(paymentData.attributes.paid_at * 1000)
                };

                // Deduct stock and update pet availability
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
                        await Pet.findByIdAndUpdate(item.itemId, { isAvailable: false });
                    }
                }

                // Record revenue and update store stats via central service
                await RevenueService.recordPayment('order', order._id);

                // Notify store owner
                await createNotification({
                    recipient: order.addedBy,
                    sender: order.customer,
                    type: 'order_status',
                    title: 'Order Paid',
                    message: `Order #${order.orderNumber} has been paid via ${order.paymentMethod}.`,
                    relatedId: order._id,
                    relatedModel: 'Order'
                });

                // Auto-generate delivery links if it's a delivery order
                if (order.deliveryMethod === 'delivery') {
                    await internalCreateDelivery({ orderId: order._id });
                }

                console.log(`✅ Order #${orderNumber} marked as PAID`);
            }
        } else if (eventType === 'checkout_session.payment.failed' || eventType === 'payment.failed') {
            const checkoutSession = event.attributes.data;
            // The data structure for payment.failed might be slightly different, but PayMongo usually includes the reference or we can find it in the resource
            const orderNumber = checkoutSession.attributes.reference_number || (checkoutSession.attributes.external_id);

            const order = await Order.findOne({ orderNumber });
            if (order) {
                order.paymentStatus = 'failed';
                await order.save();
                console.log(`❌ Order #${orderNumber} marked as PAYMENT FAILED`);
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('PayMongo Webhook Error:', error.message);
        res.status(500).json({ message: 'Webhook processing failed' });
    }
};

/**
 * Verify payment directly with PayMongo API
 */
const verifyPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.paymentStatus === 'paid') {
            return res.json({ status: 'paid', order });
        }

        if (!order.paymentDetails || !order.paymentDetails.sessionId) {
            return res.status(400).json({ message: 'No payment session found for this order' });
        }

        const response = await axios.get(`https://api.paymongo.com/v1/checkout_sessions/${order.paymentDetails.sessionId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
            }
        });

        const session = response.data.data;
        const payments = session.attributes.payments;

        if (payments && payments.length > 0) {
            const successfulPayment = payments.find(p => p.attributes.status === 'paid');
            
            if (successfulPayment) {
                console.log(`🔍 Manual verification confirmed payment for order #${order.orderNumber}`);
                
                if (order.status === 'cancelled') {
                    order.paymentStatus = 'paid';
                    order.paymentMethod = successfulPayment.attributes.source.type;
                    order.paymentDetails = {
                        ...order.paymentDetails,
                        paymentId: successfulPayment.id,
                        amountPaid: successfulPayment.attributes.amount / 100,
                        transactionDate: new Date(successfulPayment.attributes.paid_at * 1000)
                    };
                    await order.save();
                    return res.json({ status: 'paid', message: 'Paid but order was already cancelled', order });
                }

                order.paymentStatus = 'paid';
                order.status = 'confirmed'; 
                order.paymentMethod = successfulPayment.attributes.source.type;
                order.paymentDetails = {
                    ...order.paymentDetails,
                    paymentId: successfulPayment.id,
                    amountPaid: successfulPayment.attributes.amount / 100,
                    transactionDate: new Date(successfulPayment.attributes.paid_at * 1000)
                };

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
                        await Pet.findByIdAndUpdate(item.itemId, { isAvailable: false });
                    }
                }

                // Record revenue and update store stats via central service
                await RevenueService.recordPayment('order', order._id);
                await createNotification({
                    recipient: order.addedBy,
                    sender: order.customer,
                    type: 'order_status',
                    title: 'Order Paid',
                    message: `Order #${order.orderNumber} has been paid via ${order.paymentMethod}.`,
                    relatedId: order._id,
                    relatedModel: 'Order'
                });

                // Auto-generate delivery links if it's a delivery order
                if (order.deliveryMethod === 'delivery') {
                    await internalCreateDelivery({ orderId: order._id });
                }

                return res.json({ status: 'paid', order });
            }
        }

        return res.json({ status: order.paymentStatus, message: 'Payment still pending on PayMongo' });

    } catch (error) {
        console.error('Verify Payment Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to verify payment with provider', error: error.message });
    }
};

module.exports = {
    createCheckoutSession,
    createBookingCheckoutSession,
    handleWebhook,
    verifyPayment
};
