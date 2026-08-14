const express = require('express');
const router = express.Router();
const { getLandingPageData, getCaptchaConfig } = require('../controllers/publicController');

// @route   GET /api/public/captcha-config
// @desc    Provide the public reCAPTCHA site key at runtime
// @access  Public
router.get('/captcha-config', getCaptchaConfig);

// @route   GET /api/public/landing
// @desc    Get aggregated data for landing page
// @access  Public
router.get('/landing', getLandingPageData);

module.exports = router;
