const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let CLIENT_URL = process.env.CLIENT_URL;
if (!CLIENT_URL || CLIENT_URL.includes('localhost')) {
    CLIENT_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

// Internal: Create delivery record and link to order/booking
const internalCreateDelivery = async ({ orderId, bookingId }) => {
  const query = orderId ? { order: orderId } : { booking: bookingId };
  let delivery = await Delivery.findOne(query);
  
  if (delivery) return delivery;

  const order = orderId ? await Order.findById(orderId) : null;
  const booking = bookingId ? await Booking.findById(bookingId) : null;
  
  if (!order && !booking) return null;

  delivery = new Delivery({
    order: orderId || null,
    booking: bookingId || null,
    riderToken: crypto.randomBytes(32).toString('hex'),
    trackingToken: crypto.randomBytes(32).toString('hex'),
    status: 'pending'
  });

  await delivery.save();

  if (order) {
    order.delivery = delivery._id;
    await order.save();
  }
  
  return delivery;
};

// Generate unique delivery links (Rider & Customer)
const generateDeliveryLinks = async (req, res) => {
  try {
    const { orderId, bookingId } = req.body;
    
    if (!orderId && !bookingId) {
      return res.status(400).json({ message: 'Order ID or Booking ID is required' });
    }
    
    const delivery = await internalCreateDelivery({ orderId, bookingId });
    
    if (!delivery) {
      return res.status(404).json({ message: 'Order or Booking not found' });
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

// Rider: Verify Identity before starting
const verifyRider = async (req, res) => {
  try {
    const { token } = req.params;
    const { riderName, riderPhone, riderVehicleInfo } = req.body;

    const delivery = await Delivery.findOne({ riderToken: token });
    if (!delivery || !delivery.isLive) return res.status(403).json({ message: 'Unauthorized link' });

    delivery.riderName = riderName;
    delivery.riderPhone = riderPhone;
    delivery.riderVehicleInfo = riderVehicleInfo;
    delivery.isRiderVerified = true;
    
    await delivery.save();
    res.json({ success: true, message: 'Rider verified' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Customer: Submit Complaint
const submitComplaint = async (req, res) => {
  try {
    const { token } = req.params;
    const { content, type } = req.body;

    const delivery = await Delivery.findOne({ trackingToken: token });
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });

    delivery.complaints.push({ content, type, status: 'pending' });
    await delivery.save();
    res.status(201).json({ success: true, message: 'Complaint submitted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin/Seller: Resolve Complaint
const resolveComplaint = async (req, res) => {
  try {
    const { deliveryId, complaintId } = req.params;
    
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });

    const complaint = delivery.complaints.id(complaintId);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    complaint.status = 'resolved';
    complaint.resolvedAt = new Date();
    
    await delivery.save();
    res.json({ success: true, message: 'Complaint resolved' });
  } catch (error) {
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
  sendDeliveryMessage,
  verifyRider,
  submitComplaint,
  resolveComplaint,
  internalCreateDelivery
};
