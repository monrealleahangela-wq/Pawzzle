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
  resolveComplaint,
  calculateDeliveryFee
} = require('../controllers/deliveryController');
const { authenticate, requirePermission } = require('../middleware/auth');
const Delivery = require('../models/Delivery');
const { uploadSingle, handleUploadError } = require('../middleware/upload');
const { uploadImage } = require('../controllers/uploadController');
const {
  listDeliveryProviders,
  quoteThirdPartyDelivery,
  requestThirdPartyDelivery,
  refreshThirdPartyDelivery,
  cancelThirdPartyDelivery,
  handleDeliveryProviderWebhook
} = require('../controllers/deliveryProviderController');

const validateActiveRiderToken = async (req, res, next) => {
  const delivery = await Delivery.findOne({ riderToken: req.params.token, assignmentType: 'internal' }).select('isLive isRiderVerified');
  if (!delivery || !delivery.isLive || !delivery.isRiderVerified) return res.status(403).json({ message: 'Rider delivery link is inactive or unverified.' });
  next();
};

// Provider callback: public network route, authenticated by adapter-specific signature.
router.post('/provider-webhooks/:provider', handleDeliveryProviderWebhook);
// Private Routes: authorized Store/Dispatcher operations.
router.get('/providers', authenticate, requirePermission('logistics.manage'), listDeliveryProviders);
router.post('/:id/provider/quote', authenticate, requirePermission('logistics.manage'), quoteThirdPartyDelivery);
router.post('/:id/provider/request', authenticate, requirePermission('logistics.manage'), requestThirdPartyDelivery);
router.post('/:id/provider/refresh', authenticate, requirePermission('logistics.manage'), refreshThirdPartyDelivery);
router.post('/:id/provider/cancel', authenticate, requirePermission('logistics.manage'), cancelThirdPartyDelivery);
router.post('/generate', authenticate, requirePermission('logistics.manage'), generateDeliveryLinks);
router.post('/calculate-fee', authenticate, calculateDeliveryFee);
router.get('/order/:orderId', authenticate, getDeliveryByOrder);
router.get('/booking/:bookingId', authenticate, getDeliveryByBooking);
router.patch('/resolve-complaint/:deliveryId/:complaintId', authenticate, requirePermission('logistics.manage'), resolveComplaint);

// Public Routes: Rider / Customer (Secured by Token)
router.get('/track/:token', getDeliveryByToken);
router.patch('/status/:token', updateDeliveryStatus);
router.patch('/location/:token', updateLocation);
router.post('/chat/:token', sendDeliveryMessage);
router.patch('/verify/:token', verifyRider);
router.post('/complaint/:token', submitComplaint);
router.post('/complete/:token', require('../controllers/deliveryController').completeDelivery);
router.post('/failed/:token', require('../controllers/deliveryController').reportFailedDelivery);
router.post('/proof-upload/:token', validateActiveRiderToken, uploadSingle, handleUploadError, uploadImage);

module.exports = router;
