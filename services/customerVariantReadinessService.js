const mongoose = require('mongoose');
const InventoryReservation = require('../models/InventoryReservation');
const { getVariantInventoryReadiness } = require('./variantInventoryReadinessService');

const flagEnabled = name => String(process.env[name] || '').toLowerCase() === 'true';

const hasIndex = (indexes, name, key, unique) => indexes.some(index => index.name === name
  && Boolean(index.unique) === Boolean(unique)
  && JSON.stringify(index.key || {}) === JSON.stringify(key));

const getCustomerVariantReadiness = async () => {
  const browsingRequested = flagEnabled('CUSTOMER_VARIANT_BROWSING_ENABLED');
  const purchasingRequested = flagEnabled('CUSTOMER_VARIANT_PURCHASING_ENABLED');
  const reservationConcurrencyVerified = flagEnabled('CUSTOMER_VARIANT_RESERVATION_CONCURRENCY_VERIFIED');
  const paymentReconciliationVerified = flagEnabled('CUSTOMER_VARIANT_PAYMENT_RECONCILIATION_VERIFIED');
  const authorizationVerified = flagEnabled('CUSTOMER_VARIANT_AUTHORIZATION_VERIFIED');
  const reasons = [];
  if (!browsingRequested && !purchasingRequested) {
    return {
      browsingEnabled: false, purchasingEnabled: false, browsingRequested, purchasingRequested,
      reservationConcurrencyVerified, paymentReconciliationVerified, authorizationVerified,
      indexesReady: false,
      reasons: ['CUSTOMER_VARIANT_BROWSING_ENABLED and CUSTOMER_VARIANT_PURCHASING_ENABLED are not true.']
    };
  }
  if (!purchasingRequested) reasons.push('CUSTOMER_VARIANT_PURCHASING_ENABLED is not true.');
  if (!reservationConcurrencyVerified) reasons.push('Customer variant reservation concurrency verification has not been recorded.');
  if (!paymentReconciliationVerified) reasons.push('Customer variant payment reconciliation verification has not been recorded.');
  if (!authorizationVerified) reasons.push('Customer variant authorization verification has not been recorded.');
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return {
      browsingEnabled: false, purchasingEnabled: false, browsingRequested, purchasingRequested,
      reservationConcurrencyVerified, paymentReconciliationVerified, authorizationVerified,
      indexesReady: false, reasons: [...reasons, 'MongoDB is not connected.']
    };
  }
  const inventoryReadiness = await getVariantInventoryReadiness();
  if (!inventoryReadiness.enabled) reasons.push('Variant inventory readiness is not enabled.');
  let indexesReady = false;
  try {
    const indexes = await InventoryReservation.collection.indexes();
    indexesReady = hasIndex(indexes, 'inventory_reservation_key_unique', { reservationKey: 1 }, true)
      && hasIndex(indexes, 'inventory_reservation_expiry', { status: 1, expiresAt: 1 }, false);
  } catch (error) {
    reasons.push(`Inventory reservation index inspection failed: ${error.message}`);
  }
  if (!indexesReady) reasons.push('Required InventoryReservation indexes are missing or incompatible.');
  const browsingEnabled = browsingRequested && inventoryReadiness.enabled;
  const purchasingEnabled = browsingEnabled && purchasingRequested && reservationConcurrencyVerified
    && paymentReconciliationVerified && authorizationVerified && indexesReady && reasons.length === 0;
  return {
    browsingEnabled, purchasingEnabled, browsingRequested, purchasingRequested,
    reservationConcurrencyVerified, paymentReconciliationVerified, authorizationVerified,
    indexesReady, inventoryReadiness, reasons: [...new Set(reasons)]
  };
};

const assertCustomerVariantPurchasingEnabled = async () => {
  const readiness = await getCustomerVariantReadiness();
  if (!readiness.purchasingEnabled) {
    const error = new Error('Customer variant purchasing is disabled until inventory, reservation, payment, and authorization readiness are verified.');
    error.statusCode = 503;
    error.code = 'CUSTOMER_VARIANT_PURCHASING_NOT_READY';
    error.readiness = readiness;
    throw error;
  }
  return readiness;
};

module.exports = { assertCustomerVariantPurchasingEnabled, getCustomerVariantReadiness };
