const { getCustomerVariantReadiness } = require('./customerVariantReadinessService');

const enabled = name => String(process.env[name] || '').toLowerCase() === 'true';

const getCustomerVariantLifecycleReadiness = async () => {
  const customerVariant = await getCustomerVariantReadiness();
  const flags = {
    fulfillment: enabled('CUSTOMER_VARIANT_FULFILLMENT_ENABLED'),
    cancellation: enabled('CUSTOMER_VARIANT_CANCELLATION_ENABLED'),
    returns: enabled('CUSTOMER_VARIANT_RETURNS_ENABLED'),
    restockIdempotencyVerified: enabled('CUSTOMER_VARIANT_RESTOCK_IDEMPOTENCY_VERIFIED'),
    authorizationVerified: enabled('CUSTOMER_VARIANT_FULFILLMENT_AUTHORIZATION_VERIFIED'),
    expirationWorkerVerified: enabled('CUSTOMER_VARIANT_RESERVATION_EXPIRY_JOB_VERIFIED')
  };
  const commonReady = customerVariant.purchasingEnabled
    && flags.restockIdempotencyVerified
    && flags.authorizationVerified;
  const reasons = [...(customerVariant.reasons || [])];
  if (!flags.restockIdempotencyVerified) reasons.push('Variant restock idempotency has not been verified.');
  if (!flags.authorizationVerified) reasons.push('Variant fulfillment authorization has not been verified.');
  if (!flags.expirationWorkerVerified) reasons.push('Reservation expiration worker concurrency has not been verified.');
  return {
    enabled: commonReady && flags.fulfillment && flags.cancellation,
    fulfillmentEnabled: commonReady && flags.fulfillment,
    cancellationEnabled: commonReady && flags.cancellation,
    returnsEnabled: commonReady && flags.returns,
    expirationWorkerEnabled: customerVariant.purchasingEnabled && flags.expirationWorkerVerified,
    customerVariant,
    flags,
    reasons: [...new Set(reasons)]
  };
};

const assertCapability = async capability => {
  const readiness = await getCustomerVariantLifecycleReadiness();
  const key = `${capability}Enabled`;
  if (!readiness[key]) {
    const error = new Error(`Customer variant ${capability} is disabled until lifecycle safety checks are verified.`);
    error.statusCode = 503;
    error.code = `CUSTOMER_VARIANT_${capability.toUpperCase()}_NOT_READY`;
    error.readiness = readiness;
    throw error;
  }
  return readiness;
};

module.exports = { assertCapability, getCustomerVariantLifecycleReadiness };
