require('dotenv').config();
const mongoose = require('mongoose');
const { runScheduledStoreReports } = require('../services/storeScheduledReportService');

const main = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(uri);
  const results = await runScheduledStoreReports({ limit: process.env.STORE_REPORT_BATCH_SIZE || 25 });
  console.log(JSON.stringify({ processed: results.length, results }, null, 2));
  await mongoose.disconnect();
};

main().catch(async error => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
