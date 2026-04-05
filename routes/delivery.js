const express = require('express');
const router = express.Router();
const {
  generateDeliveryLinks,
  getDeliveryByToken,
  updateDeliveryStatus,
  updateLocation,
  sendDeliveryMessage
} = require('../controllers/deliveryController');
const { authenticate } = require('../middleware/auth');

// Private Routes: Admin/Staff
router.post('/generate', authenticate, generateDeliveryLinks);

// Public Routes: Rider / Customer (Secured by Token)
router.get('/track/:token', getDeliveryByToken);
router.patch('/status/:token', updateDeliveryStatus);
router.patch('/location/:token', updateLocation);
router.post('/chat/:token', sendDeliveryMessage);

module.exports = router;
