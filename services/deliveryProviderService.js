const MockDeliveryProvider = require('./deliveryProviders/mockDeliveryProvider');

const adapters = new Map([
  ['mock_delivery_provider', new MockDeliveryProvider()]
]);

class DeliveryProviderService {
  static get configuredProviderKey() {
    return String(process.env.THIRD_PARTY_DELIVERY_PROVIDER || 'mock_delivery_provider').trim().toLowerCase();
  }

  static getAdapter(providerKey = this.configuredProviderKey) {
    const key = String(providerKey || '').trim().toLowerCase();
    const adapter = adapters.get(key);
    if (!adapter) {
      const error = new Error('The selected third-party delivery provider is not configured.');
      error.statusCode = 503;
      error.code = 'PROVIDER_NOT_CONFIGURED';
      throw error;
    }
    return adapter;
  }

  static listProviders() {
    return [...adapters.values()].map(adapter => ({
      key: adapter.key,
      name: adapter.name,
      environment: adapter.environment,
      configured: adapter.key === this.configuredProviderKey
    }));
  }

  static async getDeliveryQuote(providerKey, payload) {
    return this.getAdapter(providerKey).getDeliveryQuote(payload);
  }

  static async createDeliveryRequest(providerKey, payload) {
    return this.getAdapter(providerKey).createDeliveryRequest(payload);
  }

  static async getDeliveryStatus(providerKey, payload) {
    return this.getAdapter(providerKey).getDeliveryStatus(payload);
  }

  static async cancelDelivery(providerKey, payload) {
    return this.getAdapter(providerKey).cancelDelivery(payload);
  }

  static handleWebhook(providerKey, payload) {
    return this.getAdapter(providerKey).handleWebhook(payload);
  }
}

module.exports = DeliveryProviderService;
