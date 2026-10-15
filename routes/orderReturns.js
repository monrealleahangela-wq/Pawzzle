const express = require('express');
const { authenticate } = require('../middleware/auth');
const { uploadReturnEvidence } = require('../middleware/upload');
const {
  getOrderReturns, getMyRiderReturns, getStoreReturns, getReturnRiders, createReturn, updateReturn,
  authorizeReturnEvidenceUpload, uploadReturnEvidence: saveReturnEvidence, getReturnEvidenceAccess
} = require('../controllers/orderReturnController');

const router = express.Router();
router.use(authenticate);
const handleReturnUploadError = (error, req, res, next) => {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ code: 'RETURN_EVIDENCE_TOO_LARGE', message: 'Use an image smaller than 5 MB.' });
  if (error.message?.startsWith('Only image files')) return res.status(400).json({ code: 'INVALID_RETURN_EVIDENCE', message: 'Use a JPG, PNG, or WebP image.' });
  return res.status(503).json({ code: 'RETURN_EVIDENCE_UNAVAILABLE', message: 'Unable to attach this image right now.' });
};
router.get('/mine', getMyRiderReturns);
router.get('/store', getStoreReturns);
router.get('/order/:orderId/riders', getReturnRiders);
router.get('/order/:orderId', getOrderReturns);
router.post('/order/:orderId', createReturn);
router.get('/:id/evidence/:evidenceId/access', getReturnEvidenceAccess);
router.post('/:id/evidence', authorizeReturnEvidenceUpload, uploadReturnEvidence, handleReturnUploadError, saveReturnEvidence);
router.post('/:id/transition', updateReturn);
module.exports = router;
