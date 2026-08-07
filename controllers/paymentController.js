const axios = require('axios');
const crypto = require('crypto');
const Order = require('../models/Order');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const AdoptionRequest = require('../models/AdoptionRequest');
const StockSyncService = require('../services/stockSyncService');
const RevenueService = require('../services/revenueService');
const { createNotification } = require('./notificationController');
const { internalCreateDelivery } = require('./deliveryController');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
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
        if (!PAYMONGO_SECRET_KEY) return res.status(503).json({ message: 'PayMongo is not configured.' });
        const { orderId } = req.params;
        const order = await Order.findById(orderId).populate('customer');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot pay for a canceled order' });
        }
        if (order.paymentStatus === 'paid') return res.status(409).json({ message: 'This order is already paid.' });

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
                    line_items: [{
                        amount: amountInCentavos,
                        currency: 'PHP',
                        name: `Order ${order.orderNumber}`,
                        quantity: 1
                    }],
                    payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
                    success_url: `${FRONTEND_URL}/orders/${order._id}?payment=success`,
                    cancel_url: `${FRONTEND_URL}/checkout?payment=cancelled&type=order&id=${order._id}`,
                    reference_number: order.orderNumber
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

        // Save session info to order
        order.paymentDetails = {
            sessionId: session.id,
            checkoutUrl: session.attributes.checkout_url
        };
        order.paymentMethod = 'paymongo';
        order.paymentStatus = 'pending';
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
        if (!PAYMONGO_SECRET_KEY) return res.status(503).json({ message: 'PayMongo is not configured.' });
        const { bookingId } = req.params;
        const Booking = require('../models/Booking');
        const booking = await Booking.findById(bookingId).populate('customer').populate('service');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot pay for a canceled booking' });
        }
        if (booking.customer._id.toString() !== req.user.id && req.user.role !== 'super_admin') return res.status(403).json({ message: 'Access denied' });
        if (booking.paymentStatus === 'paid') return res.status(409).json({ message: 'This booking is already paid.' });

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
                    cancel_url: `${FRONTEND_URL}/bookings?payment=cancelled&type=booking&id=${booking._id}`,
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
        booking.paymentMethod = 'paymongo';
        booking.paymentStatus = 'pending';
        await booking.save();

        res.json({ checkoutUrl: session.attributes.checkout_url });
    } catch (error) {
        console.error('PayMongo Create Booking Session Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to create payment session' });
    }
};

/**
 * Create a PayMongo Checkout Session for an Adoption
 */
const createAdoptionCheckoutSession = async (req, res) => {
    try {
        if (!PAYMONGO_SECRET_KEY) return res.status(503).json({ message: 'PayMongo is not configured.' });
        const { requestId } = req.params;
        const adoption = await AdoptionRequest.findById(requestId).populate('customer').populate('pet');

        if (!adoption) {
            return res.status(404).json({ message: 'Adoption request not found' });
        }

        // Check if user is the customer or the seller/admin
        const isCustomer = adoption.customer._id.toString() === req.user.id;
        const isSeller = adoption.seller.toString() === req.user.id;
        const isAdmin = req.user.role === 'super_admin';

        if (!isCustomer && !isSeller && !isAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        if (adoption.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot pay for a canceled inquiry' });
        }

        // Determine amount: if deposit exists and balance is full, pay deposit. Otherwise pay total.
        const pricing = adoption.paymentDetails?.pricingBreakdown || {};
        const isInitialPayment = !adoption.paymentDetails?.paidAmount || adoption.paymentDetails.paidAmount === 0;
        
        const amountToPay = (pricing.depositAmount > 0 && isInitialPayment) 
            ? pricing.depositAmount 
            : (pricing.balanceDue || pricing.totalPrice);

        if (!amountToPay || amountToPay <= 0) {
            return res.status(400).json({ message: 'Invalid payment amount detected' });
        }

        const amountInCentavos = Math.round(amountToPay * 100);
        const data = {
            data: {
                attributes: {
                    send_email_receipt: true,
                    show_description: true,
                    show_line_items: true,
                    description: `Adoption Fee for ${adoption.pet.name}`,
                    line_items: [{
                        amount: amountInCentavos,
                        currency: 'PHP',
                        name: `Pet Purchase: ${adoption.pet.name}`,
                        quantity: 1
                    }],
                    payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
                    success_url: `${FRONTEND_URL}/pets/${adoption.pet._id}?payment=success&id=${adoption._id}`,
                    cancel_url: `${FRONTEND_URL}/pets/${adoption.pet._id}?payment=cancelled&type=adoption&id=${adoption._id}`,
                    reference_number: `AD-${adoption._id.toString().slice(-8).toUpperCase()}`
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
        
        // Save session info to adoption
        if (!adoption.paymentDetails) adoption.paymentDetails = { pricingBreakdown: {} };
        adoption.paymentDetails.sessionId = session.id;
        adoption.paymentDetails.checkoutUrl = session.attributes.checkout_url;
        adoption.paymentDetails.method = 'paymongo';
        adoption.paymentDetails.paymentStatus = 'payment_pending';
        await adoption.save();

        res.json({ checkoutUrl: session.attributes.checkout_url });
    } catch (error) {
        console.error('PayMongo Create Adoption Session Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to create payment session' });
    }
};

/**
 * Handle PayMongo Webhook
 */
const isValidWebhookSignature = (req) => {
    if (!PAYMONGO_WEBHOOK_SECRET) return !isProduction;
    const signatureHeader = req.get('Paymongo-Signature');
    if (!signatureHeader || !req.rawBody) return false;
    const parts = Object.fromEntries(signatureHeader.split(',').map(part => part.trim().split('=')));
    const timestamp = parts.t;
    const signature = PAYMONGO_SECRET_KEY?.startsWith('sk_live_') ? parts.li : parts.te;
    if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
    const expected = crypto.createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
        .update(`${timestamp}.${req.rawBody.toString('utf8')}`).digest('hex');
    const supplied = Buffer.from(signature, 'hex');
    const calculated = Buffer.from(expected, 'hex');
    return supplied.length === calculated.length && crypto.timingSafeEqual(supplied, calculated);
};

const handleWebhook = async (req, res) => {
    try {
        if (!isValidWebhookSignature(req)) return res.status(401).json({ message: 'Invalid PayMongo webhook signature.' });
        const event = req.body.data;
        if (!event?.attributes?.type || !event.attributes.data) return res.status(400).json({ message: 'Invalid webhook payload.' });
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
                    if (booking.paymentStatus === 'paid') return res.sendStatus(200);
                    booking.paymentStatus = 'paid';
                    booking.paymentMethod = 'paymongo';
                    booking.paymentDetails.paymentId = paymentData.id;
                    booking.paymentDetails.sourceType = paymentData.attributes.source?.type;
                    
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
                        message: `A customer has paid for booking #${booking._id.toString().slice(-8).toUpperCase()}. Please review and approve it.`,
                        relatedId: booking._id,
                        relatedModel: 'Booking'
                    });

                    // Notify customer: payment received, waiting for approval
                    await createNotification({
                        recipient: booking.customer,
                        sender: booking.addedBy,
                        type: 'booking_status',
                        title: '✅ Payment Received – Awaiting Approval',
                        message: `Your payment for booking #${booking._id.toString().slice(-8).toUpperCase()} has been received! The seller will review and approve it shortly.`,
                        relatedId: booking._id,
                        relatedModel: 'Booking'
                    });
                    
                    console.log(`✅ Booking ${booking._id} marked as PAID via webhook. Awaiting Seller Approval.`);
                }
                return res.sendStatus(200);
            }

            if (ref && ref.startsWith('AD-')) {
                // It's an adoption
                const adoption = await AdoptionRequest.findOne({ 'paymentDetails.sessionId': checkoutSession.id });
                if (adoption) {
                    if (['paid_in_full', 'deposit_paid'].includes(adoption.paymentDetails?.paymentStatus) && adoption.paymentDetails?.history?.some(row => row.paymentId === paymentData.id)) return res.sendStatus(200);
                    const pricing = adoption.paymentDetails.pricingBreakdown;
                    const paidAmountCentavos = paymentData.attributes.amount;
                    const paidAmount = paidAmountCentavos / 100;

                    adoption.paymentDetails.paidAmount = (adoption.paymentDetails.paidAmount || 0) + paidAmount;
                    adoption.paymentDetails.pricingBreakdown.paidAmount = adoption.paymentDetails.paidAmount;
                    adoption.paymentDetails.pricingBreakdown.balanceDue = Math.max(0, pricing.totalPrice - adoption.paymentDetails.paidAmount);
                    
                    // Determine status based on balance
                    if (adoption.paymentDetails.pricingBreakdown.balanceDue <= 0) {
                        adoption.paymentDetails.paymentStatus = 'paid_in_full';
                    } else if (pricing.depositAmount > 0 && adoption.paymentDetails.paidAmount >= pricing.depositAmount) {
                        adoption.paymentDetails.paymentStatus = 'deposit_paid';
                    } else {
                        adoption.paymentDetails.paymentStatus = 'partially_paid';
                    }

                    adoption.paymentDetails.method = 'paymongo';
                    adoption.paymentDetails.paidAt = new Date();
                    
                    // Add history
                    adoption.paymentDetails.history.push({
                        status: adoption.paymentDetails.paymentStatus,
                        amount: paidAmount,
                        paymentId: paymentData.id,
                        description: `Paid via PayMongo (${adoption.paymentDetails.method})`
                    });

                    // Auto-approve if paid
                    if (adoption.status === 'inquiry_submitted' || adoption.status === 'under_review') {
                        adoption.status = 'approved';
                    }

                    await adoption.save();

                    // Notify seller
                    await createNotification({
                        recipient: adoption.seller,
                        sender: adoption.customer,
                        type: 'adoption_status',
                        title: '💳 Adoption Payment Received',
                        message: `Customer paid ₱${paidAmount.toLocaleString()} for ${ref}. Status: ${adoption.paymentDetails.paymentStatus.replace('_', ' ')}.`,
                        relatedId: adoption._id,
                        relatedModel: 'AdoptionRequest'
                    });
                }
                return res.sendStatus(200);
            }

            const orderNumber = checkoutSession.attributes.reference_number;
            const order = await Order.findOne({ orderNumber });

            if (order) {
                if (order.paymentStatus === 'paid' && order.paymentDetails?.fulfilledAt) return res.sendStatus(200);
                if (order.status === 'cancelled') {
                    console.log(`⚠️ Received payment for cancelled order #${order.orderNumber}. Marking as paid but keeping cancelled status.`);
                    order.paymentStatus = 'paid';
                    order.paymentMethod = 'paymongo';
                    order.paymentDetails = {
                        ...order.paymentDetails,
                        paymentId: paymentData.id,
                        sourceType: paymentData.attributes.source?.type,
                        amountPaid: paymentData.attributes.amount / 100,
                        transactionDate: new Date(paymentData.attributes.paid_at * 1000)
                    };
                    await order.save();
                    return res.sendStatus(200);
                }

                order.paymentStatus = 'paid';
                order.status = 'confirmed'; // Automatically confirm order on payment
                order.paymentMethod = 'paymongo';
                order.paymentDetails = {
                    ...order.paymentDetails,
                    paymentId: paymentData.id,
                    sourceType: paymentData.attributes.source?.type,
                    amountPaid: paymentData.attributes.amount / 100,
                    transactionDate: new Date(paymentData.attributes.paid_at * 1000)
                };
                await order.save();

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

                order.paymentDetails.fulfilledAt = new Date();
                await order.save();

                console.log(`✅ Order #${orderNumber} marked as PAID`);
            }
        } else if (eventType === 'checkout_session.payment.failed' || eventType === 'payment.failed') {
            const checkoutSession = event.attributes.data;
            // The data structure for payment.failed might be slightly different, but PayMongo usually includes the reference or we can find it in the resource
            const orderNumber = checkoutSession.attributes.reference_number || checkoutSession.attributes.external_id;

            if (orderNumber?.startsWith('BK-')) {
                const Booking = require('../models/Booking');
                const booking = await Booking.findOne({ 'paymentDetails.sessionId': checkoutSession.id });
                if (booking && booking.paymentStatus !== 'paid') {
                    booking.paymentStatus = 'failed';
                    booking.paymentMethod = 'paymongo';
                    booking.paymentDetails.failureReason = 'PayMongo reported a failed payment';
                    await booking.save();
                }
                return res.sendStatus(200);
            }
            if (orderNumber?.startsWith('AD-')) {
                const adoption = await AdoptionRequest.findOne({ 'paymentDetails.sessionId': checkoutSession.id });
                if (adoption && adoption.paymentDetails.paymentStatus !== 'paid_in_full') {
                    adoption.paymentDetails.method = 'paymongo';
                    adoption.paymentDetails.paymentStatus = 'payment_failed';
                    await adoption.save();
                }
                return res.sendStatus(200);
            }

            const order = await Order.findOne({ orderNumber });
            if (order) {
                order.paymentStatus = 'failed';
                order.paymentMethod = 'paymongo';
                order.paymentDetails.failureReason = 'PayMongo reported a failed payment';
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
        const { orderId } = req.params; // Generic ID for both Order and Booking
        
        let target = await Order.findById(orderId);
        let type = 'order';

        if (!target) {
            const Booking = require('../models/Booking');
            target = await Booking.findById(orderId);
            type = 'booking';
        }

        if (!target) {
            target = await AdoptionRequest.findById(orderId);
            type = 'adoption';
        }

        if (!target) {
            return res.status(404).json({ message: 'Record not found' });
        }

        const customerId = target.customer?._id || target.customer;
        if (String(customerId) !== String(req.user._id) && req.user.role !== 'super_admin') return res.status(403).json({ message: 'Access denied.' });

        if (type === 'adoption' && ['paid_in_full', 'deposit_paid'].includes(target.paymentDetails?.paymentStatus)) {
            return res.json({ status: target.paymentDetails.paymentStatus, adoption: target });
        }
        if (target.paymentStatus === 'paid' && (type !== 'order' || target.paymentDetails?.fulfilledAt)) {
            return res.json({ status: 'paid', [type]: target });
        }

        if (!target.paymentDetails || !target.paymentDetails.sessionId) {
            return res.status(400).json({ message: 'No payment session found for this record' });
        }

        const response = await axios.get(`https://api.paymongo.com/v1/checkout_sessions/${target.paymentDetails.sessionId}`, {
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
                console.log(`🔍 Manual verification confirmed payment for ${type} #${target._id}`);
                
                if (type === 'adoption') {
                    const paidAmount = successfulPayment.attributes.amount / 100;
                    const pricing = target.paymentDetails.pricingBreakdown;
                    const alreadyRecorded = target.paymentDetails.history?.some(row => row.paymentId === successfulPayment.id);
                    if (!alreadyRecorded) {
                        target.paymentDetails.paidAmount = (target.paymentDetails.paidAmount || 0) + paidAmount;
                        pricing.paidAmount = target.paymentDetails.paidAmount;
                        pricing.balanceDue = Math.max(0, pricing.totalPrice - target.paymentDetails.paidAmount);
                        target.paymentDetails.paymentStatus = pricing.balanceDue <= 0 ? 'paid_in_full' : (pricing.depositAmount > 0 && target.paymentDetails.paidAmount >= pricing.depositAmount ? 'deposit_paid' : 'partially_paid');
                        target.paymentDetails.method = 'paymongo';
                        target.paymentDetails.paidAt = new Date();
                        target.paymentDetails.history.push({ status: target.paymentDetails.paymentStatus, amount: paidAmount, paymentId: successfulPayment.id, description: 'Paid via PayMongo' });
                        if (['inquiry_submitted', 'under_review'].includes(target.status)) target.status = 'approved';
                        await target.save();
                    }
                    return res.json({ status: target.paymentDetails.paymentStatus, adoption: target });
                }

                target.paymentStatus = 'paid';
                target.paymentMethod = 'paymongo';
                target.paymentDetails = {
                    ...target.paymentDetails,
                    paymentId: successfulPayment.id,
                    sourceType: successfulPayment.attributes.source?.type,
                };

                if (type === 'order') {
                    if (target.status !== 'cancelled') {
                        target.status = 'confirmed';
                        
                        // Deduct stock and update pet availability
                        for (const item of target.items) {
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
                                    console.error(`❌ Stock deduction failed for order ${target._id}:`, stockError.message);
                                }
                            } else if (item.itemType === 'pet') {
                                await Pet.findByIdAndUpdate(item.itemId, { isAvailable: false });
                            }
                        }

                        // Record revenue
                        await RevenueService.recordPayment('order', target._id);

                        // Auto-generate delivery links
                        if (target.deliveryMethod === 'delivery') {
                            await internalCreateDelivery({ orderId: target._id });
                        }
                        target.paymentDetails.fulfilledAt = new Date();
                    }
                } else {
                    // Booking specific updates
                    if (target.status === 'cancelled') {
                        target.status = 'pending';
                    }
                    // Notify seller and customer
                    await createNotification({
                        recipient: target.addedBy,
                        sender: target.customer,
                        type: 'booking_status',
                        title: '💳 Payment Received – Approval Needed',
                        message: `A customer has paid for booking #${target._id.toString().slice(-8).toUpperCase()}. Please review and approve it.`,
                        relatedId: target._id,
                        relatedModel: 'Booking'
                    });
                }

                await target.save();
                return res.json({ status: 'paid', [type]: target });
            }
        }

        return res.json({ status: target.paymentStatus, message: 'Payment still pending on PayMongo' });

    } catch (error) {
        console.error('Verify Payment Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to verify payment with provider', error: error.message });
    }
};

const cancelPayment = async (req, res) => {
    try {
        const { type, id } = req.params;
        let target;
        if (type === 'order') target = await Order.findById(id);
        else if (type === 'booking') target = await require('../models/Booking').findById(id);
        else if (type === 'adoption') target = await AdoptionRequest.findById(id);
        else return res.status(400).json({ message: 'Invalid payment record type.' });
        if (!target) return res.status(404).json({ message: 'Payment record not found.' });
        const customerId = target.customer?._id || target.customer;
        if (String(customerId) !== String(req.user._id) && req.user.role !== 'super_admin') return res.status(403).json({ message: 'Access denied.' });
        if (type === 'adoption') {
            if (!['paid_in_full', 'deposit_paid'].includes(target.paymentDetails?.paymentStatus)) target.paymentDetails.paymentStatus = 'payment_cancelled';
            target.paymentDetails.method = 'paymongo';
        } else if (target.paymentStatus !== 'paid') {
            target.paymentStatus = 'cancelled';
            target.paymentMethod = 'paymongo';
        }
        await target.save();
        res.json({ status: type === 'adoption' ? target.paymentDetails.paymentStatus : target.paymentStatus });
    } catch (error) { res.status(500).json({ message: 'Unable to update cancelled payment.' }); }
};

module.exports = {
    createCheckoutSession,
    createBookingCheckoutSession,
    createAdoptionCheckoutSession,
    handleWebhook,
    verifyPayment,
    cancelPayment
};
