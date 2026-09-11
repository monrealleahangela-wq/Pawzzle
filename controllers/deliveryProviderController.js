const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Store = require('../models/Store');
const DeliveryProviderService = require('../services/deliveryProviderService');
const { isPlatformAdmin } = require('../config/permissions');
const { canOperateStore } = require('../utils/authorizationPolicy');

const PROVIDER_TO_ORDER_STATUS = Object.freeze({
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  arrived: 'in_transit',
  delivered: 'delivered',
  failed_attempt: 'delivery_failed'
});
const DELIVERY_PROGRESS = Object.freeze({ pending: 0, unassigned: 0, assigned: 1, accepted: 1, picked_up: 2, in_transit: 3, arrived: 4, delivered: 5 });

const publicProviderView = provider => provider ? {
  providerKey: provider.providerKey,
  providerName: provider.providerName,
  environment: provider.environment,
  trackingId: provider.trackingId,
  externalStatus: provider.externalStatus,
  requestState: provider.requestState,
  trackingUrl: provider.trackingUrl,
  rider: provider.rider,
  proof: provider.proof,
  estimatedPickupAt: provider.estimatedPickupAt,
  estimatedDeliveryAt: provider.estimatedDeliveryAt,
  lastSyncedAt: provider.lastSyncedAt,
  quote: provider.quote ? {
    amount: provider.quote.amount,
    currency: provider.quote.currency,
    quotedAt: provider.quote.quotedAt,
    expiresAt: provider.quote.expiresAt
  } : undefined
} : undefined;

const sourceForDelivery = async delivery => {
  if (delivery.order) return Order.findById(delivery.order).populate('store', 'name contactInfo owner');
  if (delivery.booking) return Booking.findById(delivery.booking).populate('store', 'name contactInfo owner');
  return null;
};

const authorizeDelivery = async (req, delivery) => {
  if (isPlatformAdmin(req.user)) return true;
  const source = await sourceForDelivery(delivery);
  const storeId = delivery.store || source?.store?._id || source?.store;
  if (!storeId) return false;
  return canOperateStore(req.user, storeId, ['logistics.manage']);
};

const loadAuthorizedDelivery = async req => {
  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) throw Object.assign(new Error('Delivery not found.'), { statusCode: 404 });
  if (!await authorizeDelivery(req, delivery)) {
    throw Object.assign(new Error('You cannot manage third-party delivery for this store.'), { statusCode: 403 });
  }
  if (delivery.assignmentType !== 'third_party') {
    throw Object.assign(new Error('This action is only available for third-party courier deliveries.'), { statusCode: 409 });
  }
  return delivery;
};

const ensureProviderDocument = (delivery, adapter) => {
  if (!delivery.providerDelivery) delivery.providerDelivery = {};
  delivery.providerDelivery.providerKey = adapter.key;
  delivery.providerDelivery.providerName = adapter.name;
  delivery.providerDelivery.environment = adapter.environment;
  return delivery.providerDelivery;
};

const providerPayload = async delivery => {
  const source = await sourceForDelivery(delivery);
  if (!source) throw Object.assign(new Error('The order or booking for this delivery no longer exists.'), { statusCode: 409 });
  const store = source.store || await Store.findById(delivery.store).select('name contactInfo');
  if (!source.customer || !store?._id) {
    throw Object.assign(new Error('A valid customer and store are required before requesting a courier.'), { statusCode: 409 });
  }
  if (delivery.store && String(delivery.store) !== String(store._id)) {
    throw Object.assign(new Error('The delivery store does not match its order or booking.'), { statusCode: 409 });
  }
  if (delivery.order && source.deliveryMethod !== 'delivery') {
    throw Object.assign(new Error('Pickup orders cannot be sent to a third-party courier.'), { statusCode: 409 });
  }
  if (delivery.booking && !source.isHomeService) {
    throw Object.assign(new Error('Only home-service bookings can request a third-party courier.'), { statusCode: 409 });
  }
  const pickup = store?.contactInfo?.address;
  const dropoff = source.shippingAddress || source.serviceAddress;
  if (!pickup || !dropoff) {
    throw Object.assign(new Error('Complete pickup and drop-off addresses are required before requesting a courier.'), { statusCode: 400 });
  }
  return {
    reference: source.orderNumber || `BOOKING-${String(source._id).slice(-8).toUpperCase()}`,
    pickup,
    dropoff,
    contactPhone: source.phoneNumber,
    distanceKm: delivery.feeCalculation?.distanceKm,
    notes: source.notes
  };
};

const emitProviderUpdate = (req, delivery) => {
  const io = req.app.get('socketio');
  if (!io) return;
  const update = {
    deliveryId: String(delivery._id),
    status: delivery.status,
    provider: publicProviderView(delivery.providerDelivery),
    timestamp: new Date()
  };
  io.to(`delivery_${delivery._id}`).emit('statusChanged', update);
  if (delivery.store) io.to(`store_${delivery.store}`).emit('dashboardUpdate', { type: 'delivery', ...update });
};

const applyProviderUpdate = async (delivery, update, source) => {
  const provider = delivery.providerDelivery;
  const timestamp = update.occurredAt || update.syncedAt || new Date();
  if (!update.pawzzleStatus) throw Object.assign(new Error('The courier returned an unsupported delivery status.'), { statusCode: 400 });
  if (['delivered', 'cancelled'].includes(delivery.status) && update.pawzzleStatus !== delivery.status) {
    return false;
  }
  const currentProgress = DELIVERY_PROGRESS[delivery.status];
  const nextProgress = DELIVERY_PROGRESS[update.pawzzleStatus];
  if (currentProgress != null && nextProgress != null && nextProgress < currentProgress) return false;
  provider.externalStatus = update.status;
  provider.lastSyncedAt = timestamp;
  if (update.trackingUrl !== undefined) provider.trackingUrl = update.trackingUrl;
  if (update.rider) {
    provider.rider = {
      displayName: update.rider.displayName,
      phone: update.rider.phone,
      vehicleType: update.rider.vehicleType,
      plateNumber: update.rider.plateNumber
    };
  }
  if (update.proof) provider.proof = { reference: update.proof.reference, url: update.proof.url, receivedAt: timestamp };
  if (update.estimatedPickupAt) provider.estimatedPickupAt = update.estimatedPickupAt;
  if (update.estimatedDeliveryAt) provider.estimatedDeliveryAt = update.estimatedDeliveryAt;
  provider.statusHistory.push({
    eventId: update.eventId,
    externalStatus: update.status,
    pawzzleStatus: update.pawzzleStatus,
    source,
    timestamp
  });

  const previous = delivery.status;
  delivery.status = update.pawzzleStatus;
  if (update.pawzzleStatus === 'picked_up' && !delivery.pickedUpAt) delivery.pickedUpAt = timestamp;
  if (update.pawzzleStatus === 'arrived' && !delivery.arrivedAt) delivery.arrivedAt = timestamp;
  if (update.pawzzleStatus === 'delivered') {
    delivery.deliveredAt = timestamp;
    delivery.isLive = false;
  }
  if (previous !== delivery.status) {
    delivery.statusHistory.push({
      status: delivery.status,
      timestamp,
      notes: `${provider.providerName} reported: ${String(update.status).replace(/_/g, ' ')}`
    });
  }
  await delivery.save();

  const orderStatus = PROVIDER_TO_ORDER_STATUS[update.pawzzleStatus];
  if (delivery.order && orderStatus) {
    await Order.findByIdAndUpdate(delivery.order, {
      status: orderStatus,
      ...(orderStatus === 'delivered' ? { deliveryDate: timestamp } : {}),
      $push: { fulfillmentTimeline: {
        status: orderStatus,
        timestamp,
        description: `Third-party courier update: ${String(update.status).replace(/_/g, ' ')}`
      } }
    });
  }
  return true;
};

const listDeliveryProviders = (_req, res) => {
  res.json({ providers: DeliveryProviderService.listProviders() });
};

const quoteThirdPartyDelivery = async (req, res) => {
  let delivery;
  try {
    delivery = await loadAuthorizedDelivery(req);
    const adapter = DeliveryProviderService.getAdapter(req.body.providerKey || delivery.providerDelivery?.providerKey);
    const provider = ensureProviderDocument(delivery, adapter);
    if (provider.jobId) return res.status(409).json({ message: 'A provider delivery job already exists. Refresh its status instead of requesting another quote.' });
    provider.requestState = 'quoting';
    provider.lastError = undefined;
    await delivery.save();
    const quote = await DeliveryProviderService.getDeliveryQuote(adapter.key, await providerPayload(delivery));
    provider.quote = quote;
    provider.requestState = 'quoted';
    provider.lastSyncedAt = new Date();
    await delivery.save();
    res.json({ message: 'Courier quote ready.', provider: publicProviderView(provider) });
  } catch (error) {
    if (delivery?.providerDelivery) {
      delivery.providerDelivery.requestState = 'failed';
      delivery.providerDelivery.lastError = { code: error.code || 'QUOTE_FAILED', message: 'The courier quote could not be retrieved.', retryable: true, at: new Date() };
      await delivery.save().catch(() => {});
    }
    res.status(error.statusCode || 502).json({ message: error.statusCode ? error.message : 'Unable to request a third-party delivery quote right now.' });
  }
};

const requestThirdPartyDelivery = async (req, res) => {
  let delivery;
  try {
    delivery = await loadAuthorizedDelivery(req);
    const adapter = DeliveryProviderService.getAdapter(delivery.providerDelivery?.providerKey);
    const provider = ensureProviderDocument(delivery, adapter);
    if (provider.jobId) return res.status(409).json({ message: 'A provider delivery job already exists for this delivery.' });
    if (!provider.quote?.quoteId || new Date(provider.quote.expiresAt) <= new Date()) {
      return res.status(409).json({ message: 'Request a current courier quote before confirming the delivery.' });
    }
    provider.requestState = 'requesting';
    provider.lastError = undefined;
    await delivery.save();
    const created = await DeliveryProviderService.createDeliveryRequest(adapter.key, {
      ...(await providerPayload(delivery)),
      quote: provider.quote.toObject ? provider.quote.toObject() : provider.quote
    });
    provider.jobId = created.jobId;
    provider.trackingId = created.trackingId;
    provider.trackingUrl = created.trackingUrl;
    provider.externalStatus = created.status;
    provider.requestState = 'requested';
    provider.estimatedPickupAt = created.estimatedPickupAt;
    provider.estimatedDeliveryAt = created.estimatedDeliveryAt;
    provider.lastSyncedAt = new Date();
    const pawzzleStatus = adapter.mapStatus(created.status);
    await applyProviderUpdate(delivery, { ...created, pawzzleStatus, syncedAt: new Date() }, 'request');
    emitProviderUpdate(req, delivery);
    res.status(201).json({
      message: `${adapter.name} delivery requested. The provider is responsible for notifying and assigning its rider.`,
      provider: publicProviderView(provider)
    });
  } catch (error) {
    if (delivery?.providerDelivery) {
      delivery.providerDelivery.requestState = 'failed';
      delivery.providerDelivery.lastError = {
        code: error.code || 'PROVIDER_REQUEST_FAILED',
        message: 'The courier request could not be completed.',
        retryable: error.retryable !== false,
        at: new Date()
      };
      await delivery.save().catch(() => {});
    }
    res.status(error.statusCode || 502).json({ message: error.statusCode ? error.message : 'Unable to request third-party delivery right now.' });
  }
};

const refreshThirdPartyDelivery = async (req, res) => {
  let delivery;
  try {
    delivery = await loadAuthorizedDelivery(req);
    const provider = delivery.providerDelivery;
    const adapter = DeliveryProviderService.getAdapter(provider?.providerKey);
    const update = await DeliveryProviderService.getDeliveryStatus(adapter.key, {
      jobId: provider?.jobId,
      currentStatus: provider?.externalStatus
    });
    const pawzzleStatus = adapter.mapStatus(update.status);
    if (!pawzzleStatus) return res.status(502).json({ message: 'The courier returned an unsupported delivery status.' });
    await applyProviderUpdate(delivery, { ...update, pawzzleStatus }, 'poll');
    emitProviderUpdate(req, delivery);
    res.json({ message: 'Courier status refreshed.', provider: publicProviderView(provider), status: delivery.status });
  } catch (error) {
    if (delivery?.providerDelivery) {
      delivery.providerDelivery.lastError = { code: error.code || 'STATUS_REFRESH_FAILED', message: 'The courier status could not be refreshed.', retryable: true, at: new Date() };
      await delivery.save().catch(() => {});
    }
    res.status(error.statusCode || 502).json({ message: error.statusCode ? error.message : 'Unable to refresh courier status right now.' });
  }
};

const cancelThirdPartyDelivery = async (req, res) => {
  let delivery;
  try {
    delivery = await loadAuthorizedDelivery(req);
    const provider = delivery.providerDelivery;
    const adapter = DeliveryProviderService.getAdapter(provider?.providerKey);
    provider.requestState = 'cancelling';
    await delivery.save();
    const update = await DeliveryProviderService.cancelDelivery(adapter.key, {
      jobId: provider?.jobId,
      currentStatus: provider?.externalStatus,
      reason: String(req.body.reason || '').trim()
    });
    provider.requestState = 'cancelled';
    await applyProviderUpdate(delivery, { ...update, pawzzleStatus: adapter.mapStatus(update.status) }, 'cancel');
    emitProviderUpdate(req, delivery);
    res.json({ message: 'Third-party courier request cancelled.', provider: publicProviderView(provider) });
  } catch (error) {
    if (delivery?.providerDelivery) {
      delivery.providerDelivery.requestState = delivery.providerDelivery.jobId ? 'requested' : 'failed';
      delivery.providerDelivery.lastError = { code: error.code || 'CANCEL_FAILED', message: 'The courier request could not be cancelled.', retryable: true, at: new Date() };
      await delivery.save().catch(() => {});
    }
    res.status(error.statusCode || 502).json({ message: error.statusCode ? error.message : 'Unable to cancel the courier request right now.' });
  }
};

const handleDeliveryProviderWebhook = async (req, res) => {
  try {
    const providerKey = String(req.params.provider || '').toLowerCase();
    const event = DeliveryProviderService.handleWebhook(providerKey, { headers: req.headers, payload: req.body });
    let delivery = await Delivery.findOneAndUpdate({
      'providerDelivery.providerKey': providerKey,
      'providerDelivery.jobId': event.jobId,
      'providerDelivery.processedWebhookEventIds': { $ne: event.eventId }
    }, { $push: { 'providerDelivery.processedWebhookEventIds': event.eventId } }, { new: true });
    if (!delivery) {
      const existing = await Delivery.exists({ 'providerDelivery.providerKey': providerKey, 'providerDelivery.jobId': event.jobId });
      if (existing) return res.json({ received: true, duplicate: true });
      return res.status(404).json({ message: 'Provider delivery job not found.' });
    }
    await applyProviderUpdate(delivery, event, 'webhook');
    emitProviderUpdate(req, delivery);
    res.json({ received: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to process delivery-provider webhook.' });
  }
};

module.exports = {
  publicProviderView,
  listDeliveryProviders,
  quoteThirdPartyDelivery,
  requestThirdPartyDelivery,
  refreshThirdPartyDelivery,
  cancelThirdPartyDelivery,
  handleDeliveryProviderWebhook
};
