const express = require('express');
const { authenticate } = require('../middleware/auth');
const { uploadReturnEvidence, handleUploadError } = require('../middleware/upload');
const {
  adminDecision,
  confirmReceived,
  create,
  customerConfirm,
  decision,
  dispute,
  evidenceAccess,
  finalResolution,
  getOne,
  inspect,
  listForAdmin,
  listForOrder,
  listForStore,
  pickupCode,
  prepareReplacementShipment,
  processPayMongoRefund,
  refundResult,
  schedulePickup,
  transition
} = require('../controllers/orderReturnController');

const router = express.Router();
router.use(authenticate);

router.get('/store', listForStore);
router.get('/admin', listForAdmin);
router.get('/order/:orderId', listForOrder);
router.post('/order/:orderId', uploadReturnEvidence, handleUploadError, create);
router.get('/:id', getOne);
router.get('/:id/pickup-code', pickupCode);
router.get('/:id/evidence/:evidenceId/access', evidenceAccess);
router.post('/:id/decision', decision);
router.post('/:id/pickup/schedule', schedulePickup);
router.post('/:id/confirm-received', confirmReceived);
router.post('/:id/inspect', uploadReturnEvidence, handleUploadError, inspect);
router.post('/:id/final-resolution', finalResolution);
router.post('/:id/replacement/prepare', prepareReplacementShipment);
router.post('/:id/customer-confirm', customerConfirm);
router.post('/:id/dispute', dispute);
router.post('/:id/admin-decision', adminDecision);
router.post('/:id/process-refund', processPayMongoRefund);
router.post('/:id/refund-result', refundResult);

// Compatibility route for existing normalized-variant return clients.
router.post('/:id/transition', transition);

module.exports = router;
