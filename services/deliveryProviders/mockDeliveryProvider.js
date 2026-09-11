const crypto = require('crypto');

const STATUS_MAP = Object.freeze({
  pending: 'pending',
  accepted: 'pending',
  rider_assigned: 'assigned',
  heading_to_pickup: 'assigned',
  arrived_at_pickup: 'assigned',
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  arrived: 'arrived',
  delivered: 'delivered',
  cancelled: 'cancelled',
  failed: 'failed_attempt'
});

const roundMoney = value => Math.round(Number(value || 0) * 100) / 100;
const stableSignaturePayload = payload => [
  payload.eventId,
  payload.jobId,
  payload.status,
  payload.occurredAt
].map(value => String(value || '')).join('|');

class MockDeliveryProvider {
  constructor() {
    this.key = 'mock_delivery_provider';
    this.name = 'Mock Delivery Provider';
    this.environment = 'sandbox';
  }

  mapStatus(status) {
    return STATUS_MAP[String(status || '').toLowerCase()] || null;
  }

  async getDeliveryQuote({ distanceKm }) {
    const baseFee = Number(process.env.MOCK_DELIVERY_BASE_FEE || 120);
    const perKm = Number(process.env.MOCK_DELIVERY_PER_KM_FEE || 15);
    const distanceCharge = roundMoney(Math.max(0, Number(distanceKm || 0)) * perKm);
    const now = new Date();
    return {
      quoteId: `mock-quote-${crypto.randomUUID()}`,
      amount: roundMoney(baseFee + distanceCharge),
      currency: 'PHP',
      breakdown: { baseFee, distanceCharge, distanceKm: Number(distanceKm || 0), perKm },
      quotedAt: now,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000)
    };
  }

  async createDeliveryRequest({ quote, reference }) {
    if (!quote?.quoteId || new Date(quote.expiresAt) <= new Date()) {
      const error = new Error('The sandbox courier quote is missing or expired. Request a new quote.');
      error.code = 'QUOTE_EXPIRED';
      error.statusCode = 409;
      error.retryable = true;
      throw error;
    }
    const jobId = `mock-job-${crypto.randomUUID()}`;
    return {
      jobId,
      trackingId: `MOCK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      status: 'pending',
      trackingUrl: null,
      estimatedPickupAt: new Date(Date.now() + 20 * 60 * 1000),
      estimatedDeliveryAt: new Date(Date.now() + 80 * 60 * 1000),
      metadata: { reference }
    };
  }

  async getDeliveryStatus({ jobId, currentStatus }) {
    if (!jobId) throw Object.assign(new Error('Provider delivery job has not been created.'), { statusCode: 409 });
    const next = { pending: 'rider_assigned', accepted: 'rider_assigned' }[currentStatus] || currentStatus || 'pending';
    return {
      jobId,
      status: next,
      rider: next === 'rider_assigned' ? {
        displayName: 'Sandbox Courier',
        phone: null,
        vehicleType: 'motorcycle',
        plateNumber: null
      } : undefined,
      syncedAt: new Date()
    };
  }

  async cancelDelivery({ jobId, currentStatus }) {
    if (!jobId) throw Object.assign(new Error('Provider delivery job has not been created.'), { statusCode: 409 });
    if (['delivered', 'cancelled'].includes(currentStatus)) {
      throw Object.assign(new Error(`A ${currentStatus} provider delivery cannot be cancelled.`), { statusCode: 409 });
    }
    return { jobId, status: 'cancelled', cancelledAt: new Date() };
  }

  getTrackingDetails(providerDelivery) {
    return {
      trackingId: providerDelivery?.trackingId,
      trackingUrl: providerDelivery?.trackingUrl,
      status: providerDelivery?.externalStatus,
      estimatedDeliveryAt: providerDelivery?.estimatedDeliveryAt
    };
  }

  verifyWebhook({ headers, payload }) {
    const secret = process.env.MOCK_DELIVERY_WEBHOOK_SECRET;
    if (!secret) return false;
    const supplied = String(headers['x-delivery-signature'] || '').replace(/^sha256=/i, '');
    const expected = crypto.createHmac('sha256', secret).update(stableSignaturePayload(payload)).digest('hex');
    if (!/^[a-f\d]{64}$/i.test(supplied)) return false;
    return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
  }

  handleWebhook({ headers, payload }) {
    if (!this.verifyWebhook({ headers, payload })) {
      throw Object.assign(new Error('Invalid delivery-provider webhook signature.'), { statusCode: 401 });
    }
    if (!payload?.eventId || !payload?.jobId || !payload?.status || !payload?.occurredAt) {
      throw Object.assign(new Error('Invalid delivery-provider webhook payload.'), { statusCode: 400 });
    }
    const pawzzleStatus = this.mapStatus(payload.status);
    if (!pawzzleStatus) throw Object.assign(new Error('Unknown delivery-provider status.'), { statusCode: 400 });
    const occurredAt = new Date(payload.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw Object.assign(new Error('Invalid delivery-provider event timestamp.'), { statusCode: 400 });
    return {
      eventId: String(payload.eventId),
      jobId: String(payload.jobId),
      status: String(payload.status).toLowerCase(),
      pawzzleStatus,
      occurredAt,
      rider: payload.rider,
      estimatedPickupAt: payload.estimatedPickupAt,
      estimatedDeliveryAt: payload.estimatedDeliveryAt,
      trackingUrl: payload.trackingUrl,
      proof: payload.proof ? { reference: payload.proof.reference, url: payload.proof.url } : undefined
    };
  }
}

module.exports = MockDeliveryProvider;
