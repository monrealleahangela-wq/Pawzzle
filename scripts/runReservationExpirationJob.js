require('dotenv').config();
const mongoose = require('mongoose');
const { assertCapability } = require('../services/customerVariantLifecycleReadinessService');
const { processExpiredReservationBatch } = require('../services/reservationExpirationJobService');

const run = async () => {
  if (String(process.env.RESERVATION_EXPIRATION_WORKER_ENABLED || '').toLowerCase() !== 'true') {
    throw new Error('RESERVATION_EXPIRATION_WORKER_ENABLED must be true to run this separately scheduled worker.');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required. Use only the intended isolated or approved environment.');
  await mongoose.connect(process.env.MONGODB_URI);
  await assertCapability('expirationWorker');
  const summary = await processExpiredReservationBatch({
    limit: Number(process.env.RESERVATION_EXPIRATION_BATCH_SIZE || 50)
  });
  console.log(JSON.stringify({ job: 'reservation-expiration', ...summary }));
  if (summary.errors.length) process.exitCode = 1;
};

run()
  .catch(error => {
    console.error(`Reservation expiration job failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
