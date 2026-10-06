const express = require('express');
const router = express.Router();
const {
  assignDeliveryAutomatically,
  getAssignedRiderDelivery,
  getDeliveryByToken,
  getDeliveryByOrder,
  getDeliveryByBooking,
  updateDeliveryStatus,
  updateLocation,
  sendDeliveryMessage,
  sendRiderDeliveryMessage,
  completeDelivery,
  reportFailedDelivery,
  submitComplaint,
  submitStoreConcern,
  resolveComplaint,
  calculateDeliveryFee
} = require('../controllers/deliveryController');
const { authenticate, requirePermission } = require('../middleware/auth');
const Delivery = require('../models/Delivery');
const { uploadSingle, handleUploadError } = require('../middleware/upload');
const { uploadImage } = require('../controllers/uploadController');

const validateAssignedRider = async (req, res, next) => {
  const delivery = await Delivery.findOne({ _id: req.params.deliveryId, assignedRider: req.user._id, assignmentType: 'internal', isLive: true }).select('_id');
  if (!delivery) return res.status(403).json({ message: 'Assigned delivery is inactive or unavailable.' });
  next();
};

// Private routes: store assignment and authenticated rider workspaces.
router.post('/assign', authenticate, requirePermission('logistics.manage'), assignDeliveryAutomatically);
router.post('/calculate-fee', authenticate, calculateDeliveryFee);
router.get('/order/:orderId', authenticate, getDeliveryByOrder);
router.get('/booking/:bookingId', authenticate, getDeliveryByBooking);
router.post('/:deliveryId/concerns', authenticate, requirePermission('logistics.manage'), submitStoreConcern);
router.patch('/resolve-complaint/:deliveryId/:complaintId', authenticate, requirePermission('logistics.manage'), resolveComplaint);
router.get('/rider/:deliveryId', authenticate, getAssignedRiderDelivery);
router.patch('/rider/:deliveryId/status', authenticate, updateDeliveryStatus);
router.patch('/rider/:deliveryId/location', authenticate, updateLocation);
router.post('/rider/:deliveryId/chat', authenticate, sendRiderDeliveryMessage);
router.post('/rider/:deliveryId/complete', authenticate, completeDelivery);
router.post('/rider/:deliveryId/failed', authenticate, reportFailedDelivery);
router.post('/rider/:deliveryId/proof-upload', authenticate, validateAssignedRider, uploadSingle, handleUploadError, uploadImage);

// Public customer tracking capability. Rider mutation requires an authenticated assigned account.
router.get('/track/:token', getDeliveryByToken);
router.post('/chat/:token', sendDeliveryMessage);
router.post('/complaint/:token', authenticate, submitComplaint);

module.exports = router;
