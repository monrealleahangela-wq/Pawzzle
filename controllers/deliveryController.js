const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const crypto = require('crypto');

// Generate unique delivery links (Rider & Customer)
const generateDeliveryLinks = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    let delivery = await Delivery.findOne({ order: orderId });
    
    if (delivery) {
      return res.json({ 
        message: 'Delivery links already exist', 
        riderLink: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rider-track/${delivery.riderToken}`,
        customerLink: `${process.env.CLIENT_URL || 'http://localhost:3000'}/track/${delivery.trackingToken}`
      });
    }

    const order = await Order.findById(orderId).populate('customer store');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    delivery = new Delivery({
      order: orderId,
      riderToken: crypto.randomBytes(32).toString('hex'),
      trackingToken: crypto.randomBytes(32).toString('hex'),
      status: 'pending'
    });

    await delivery.save();

    // Link delivery back to order
    order.delivery = delivery._id;
    await order.save();

    res.status(201).json({
      message: 'Delivery links generated',
      riderLink: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rider-track/${delivery.riderToken}`,
      customerLink: `${process.env.CLIENT_URL || 'http://localhost:3000'}/track/${delivery.trackingToken}`,
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
          { path: 'store', select: 'name address phoneNumber' }
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
            { path: 'store', select: 'name address phoneNumber' }
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
    
    // TODO: Socket emit statusUpdate
    
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
    
    // TODO: Socket emit locationUpdate
    
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

    // TODO: Socket emit newMessage
    
    res.status(201).json({ message });
  } catch (error) {
    console.error('Message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  generateDeliveryLinks,
  getDeliveryByToken,
  updateDeliveryStatus,
  updateLocation,
  sendDeliveryMessage
};
