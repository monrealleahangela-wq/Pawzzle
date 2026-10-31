const express = require('express');
const { authenticate } = require('../middleware/auth');
const { create, inspect, listForOrder, refundResult, transition } = require('../controllers/orderReturnController');

const router = express.Router();
router.use(authenticate);
router.get('/order/:orderId', listForOrder);
router.post('/order/:orderId', create);
router.post('/:id/transition', transition);
router.post('/:id/inspect', inspect);
router.post('/:id/refund-result', refundResult);

module.exports = router;
