const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let CLIENT_URL = process.env.CLIENT_URL;
if (!CLIENT_URL || CLIENT_URL.includes('localhost')) {
    CLIENT_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

// Generate unique delivery links (Rider & Customer)
const generateDeliveryLinks = async (req, res) => {
  try {
    const { orderId, bookingId } = req.body;
    
    if (!orderId && !bookingId) {
      return res.status(400).json({ message: 'Order ID or Booking ID is required' });
    }
    
    const query = orderId ? { order: orderId } : { booking: bookingId };
    let delivery = await Delivery.findOne(query);
    
    if (delivery) {
      return res.json({ 
        message: 'Delivery links already exist', 
        riderLink: `${CLIENT_URL}/rider-track/${delivery.riderToken}`,
        customerLink: `${CLIENT_URL}/track/${delivery.trackingToken}`
      });
    }

    const order = orderId ? await Order.findById(orderId).populate('customer store') : null;
    const booking = bookingId ? await Booking.findById(bookingId).populate('customer store service') : null;
    
    if (!order && !booking) {
      return res.status(404).json({ message: 'Order or Booking not found' });
    }

    delivery = new Delivery({
      order: orderId || null,
      booking: bookingId || null,
      riderToken: crypto.randomBytes(32).toString('hex'),
      trackingToken: crypto.randomBytes(32).toString('hex'),
      status: 'pending'
    });

    await delivery.save();

    // Link delivery back to order/booking
    if (order) {
      order.delivery = delivery._id;
      await order.save();
    } else if (booking) {
      // Assuming Booking schema might eventually have a delivery field
      // but for now the link exists in Delivery model
    }

    res.status(201).json({
      message: 'Delivery links generated',
      riderLink: `${CLIENT_URL}/rider-track/${delivery.riderToken}`,
      customerLink: `${CLIENT_URL}/track/${delivery.trackingToken}`,
      delivery
    });
  } catch (error) {
    console.error('Error generating delivery links:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Public: Get delivery by token (Rider OR Customer)
const getDeliveryByToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Check if it's a rider token
    let delivery = await Delivery.findOne({ riderToken: token })
      .populate({
        path: 'order',
        populate: [
          { path: 'customer', select: 'firstName lastName phoneNumber' },
          { path: 'store', select: 'name contactInfo' }
        ]
      })
      .populate({
        path: 'booking',
        populate: [
          { path: 'customer', select: 'firstName lastName phoneNumber' },
          { path: 'store', select: 'name contactInfo' },
          { path: 'service', select: 'name duration' }
        ]
      });

    let role = 'rider';
    
    if (!delivery) {
      // Check if it's a customer tracking token
      delivery = await Delivery.findOne({ trackingToken: token })
        .populate({
          path: 'order',
          populate: [
            { path: 'customer', select: 'firstName lastName phoneNumber' },
            { path: 'store', select: 'name contactInfo' }
          ]
        })
        .populate({
          path: 'booking',
          populate: [
            { path: 'customer', select: 'firstName lastName phoneNumber' },
            { path: 'store', select: 'name contactInfo' },
            { path: 'service', select: 'name duration' }
          ]
        });
      role = 'customer';
    }

    if (!delivery) {
      return res.status(404).json({ message: 'Secure tracking link invalid or expired' });
    }

    res.json({ delivery, role });
  } catch (error) {
    console.error('Error fetching delivery:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Private: Get delivery metadata by Order ID (Regular portal access)
const getDeliveryByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const delivery = await Delivery.findOne({ order: orderId }).select('trackingToken riderToken status isLive');
    if (!delivery) return res.status(404).json({ message: 'No delivery active' });
    res.json({ delivery });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Private: Get delivery metadata by Booking ID (Regular portal access)
const getDeliveryByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const delivery = await Delivery.findOne({ booking: bookingId }).select('trackingToken riderToken status isLive');
    if (!delivery) return res.status(404).json({ message: 'No delivery active' });
    res.json({ delivery });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Rider: Update status
const updateDeliveryStatus = async (req, res) => {
  try {
    const { token } = req.params;
    const { status } = req.body;

    const delivery = await Delivery.findOne({ riderToken: token });
    if (!delivery) return res.status(404).json({ message: 'Unauthorized link' });

    if (!delivery.isLive && status !== 'delivered') {
      return res.status(403).json({ message: 'Delivery completed. Control link disabled.' });
    }

    delivery.status = status;
    if (status === 'picked_up') delivery.pickedUpAt = new Date();
    if (status === 'delivered') {
      delivery.deliveredAt = new Date();
      delivery.isLive = false;
      await Order.findByIdAndUpdate(delivery.order, { status: 'delivered' });
    }

    await delivery.save();
    
    // Trigger Socket emit for real-time status update
    const io = req.app.get('socketio');
    if (io) {
      io.to(`delivery_${delivery._id}`).emit('statusChanged', { deliveryId: delivery._id, status: delivery.status });
    }
    
    res.json({ success: true, status: delivery.status });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Rider: GPS Ping
const updateLocation = async (req, res) => {
  try {
    const { token } = req.params;
    const { lat, lng, heading, speed } = req.body;

    const delivery = await Delivery.findOne({ riderToken: token });
    if (!delivery || !delivery.isLive) return res.status(403).json({ message: 'Inactive' });

    delivery.riderLocation = { lat, lng, heading, speed, lastUpdated: new Date() };
    delivery.locationHistory.push({ lat, lng });

    await delivery.save();
    
    // Trigger Socket emit for real-time location update
    const io = req.app.get('socketio');
    if (io) {
      io.to(`delivery_${delivery._id}`).emit('locationUpdate', { deliveryId: delivery._id, lat, lng, heading, speed });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Shared: Chat message
const sendDeliveryMessage = async (req, res) => {
  try {
    const { token } = req.params;
    const { content, sender } = req.body;

    const delivery = await Delivery.findOne({
      $or: [{ riderToken: token }, { trackingToken: token }]
    });

    if (!delivery || !delivery.isLive) return res.status(403).json({ message: 'Chat disabled' });

    const message = { sender, content, timestamp: new Date() };
    delivery.chat.push(message);
    await delivery.save();

    // Trigger Socket emit for real-time chat message
    const io = req.app.get('socketio');
    if (io) {
      io.to(`delivery_${delivery._id}`).emit('newMessage', { deliveryId: delivery._id, ...message });
    }
    
    res.status(201).json({ message });
  } catch (error) {
    console.error('Message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  generateDeliveryLinks,
  getDeliveryByToken,
  getDeliveryByOrder,
  getDeliveryByBooking,
  updateDeliveryStatus,
  updateLocation,
  sendDeliveryMessage
};
