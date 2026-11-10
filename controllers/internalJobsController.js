const { runScheduledStoreReports } = require('../services/storeScheduledReportService');

const normalizeBatchSize = value => Math.min(100, Math.max(1, Number(value) || 25));

const createStoreReportsJobHandler = ({ runReports = runScheduledStoreReports } = {}) => async (_request, response) => {
  response.set?.('Cache-Control', 'no-store');
  try {
    const results = await runReports({
      limit: normalizeBatchSize(process.env.STORE_REPORT_BATCH_SIZE)
    });
    const sent = results.filter(result => result.status === 'sent').length;
    const failed = results.filter(result => result.status === 'failed').length;

    if (failed) {
      console.error('[StoreReportsCron] One or more scheduled reports failed.', {
        processed: results.length,
        sent,
        failed
      });
    }

    return response.status(failed ? 500 : 200).json({
      success: failed === 0,
      processed: results.length,
      sent,
      failed,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[StoreReportsCron] Scheduled report job failed:', error.message);
    return response.status(500).json({
      success: false,
      message: 'Scheduled report processing failed.'
    });
  }
};

module.exports = {
  normalizeBatchSize,
  createStoreReportsJobHandler,
  runStoreReportsJob: createStoreReportsJobHandler()
};
