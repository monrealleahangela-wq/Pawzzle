const express = require('express');
const router = express.Router();
const {
  generateDeliveryLinks,
  getDeliveryByToken,
  getDeliveryByOrder,
  getDeliveryByBooking,
  updateDeliveryStatus,
  updateLocation,
  sendDeliveryMessage,
  verifyRider,
  submitComplaint,
  resolveComplaint
} = require('../controllers/deliveryController');
const { authenticate } = require('../middleware/auth');

// Private Routes: Admin/Staff
router.post('/generate', authenticate, generateDeliveryLinks);
router.get('/order/:orderId', authenticate, getDeliveryByOrder);
router.get('/booking/:bookingId', authenticate, getDeliveryByBooking);
router.patch('/resolve-complaint/:deliveryId/:complaintId', authenticate, resolveComplaint);

// Public Routes: Rider / Customer (Secured by Token)
router.get('/track/:token', getDeliveryByToken);
router.patch('/status/:token', updateDeliveryStatus);
router.patch('/location/:token', updateLocation);
router.post('/chat/:token', sendDeliveryMessage);
router.patch('/verify/:token', verifyRider);
router.post('/complaint/:token', submitComplaint);

module.exports = router;
