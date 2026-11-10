const express = require('express');
const { requireCronSecret } = require('../middleware/cronSecret');
const { runStoreReportsJob } = require('../controllers/internalJobsController');

const router = express.Router();

router.post('/store-reports', requireCronSecret, runStoreReportsJob);

module.exports = router;
