const express = require('express');
const router = express.Router();
const { getArchivedItems, restoreItem, permanentDelete } = require('../controllers/archiveController');
const { authenticate, superAdminOnly } = require('../middleware/auth');

// All archive routes require super admin
router.get('/', authenticate, superAdminOnly, getArchivedItems);
router.patch('/:type/:id/restore', authenticate, superAdminOnly, restoreItem);
router.delete('/:type/:id', authenticate, superAdminOnly, permanentDelete);

module.exports = router;
