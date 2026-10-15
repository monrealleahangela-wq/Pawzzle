const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/petInquiryController');

router.use(authenticate);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getOne);
router.post('/:id/actions', controller.act);

module.exports = router;
