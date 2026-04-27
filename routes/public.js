const express = require('express');
const router = express.Router();
const { getLandingPageData } = require('../controllers/publicController');

// @route   GET /api/public/landing
// @desc    Get aggregated data for landing page
// @access  Public
router.get('/landing', getLandingPageData);

module.exports = router;
