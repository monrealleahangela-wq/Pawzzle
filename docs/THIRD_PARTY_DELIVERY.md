# Third-party delivery integration

Pawzzle uses a provider adapter boundary for external couriers:

`Store/Dispatcher UI -> Pawzzle API -> DeliveryProviderService -> Provider Adapter -> Courier API`

The courier provider is responsible for assigning and notifying its rider through its own rider app, SMS, push notifications, or dispatch system. External riders are not Pawzzle staff accounts and are not given Pawzzle rider-control links.

## Sandbox configuration

The repository currently includes only `mock_delivery_provider`. It is visibly labelled **Sandbox** in the UI and must not be represented as a live courier integration.

```text
THIRD_PARTY_DELIVERY_PROVIDER=mock_delivery_provider
MOCK_DELIVERY_BASE_FEE=120
MOCK_DELIVERY_PER_KM_FEE=15
MOCK_DELIVERY_WEBHOOK_SECRET=replace-with-a-random-development-secret
```

The webhook secret is required to exercise sandbox webhooks. It is backend-only and must never be added to client environment files.

## Adding a live provider

Implement the same adapter contract in `services/deliveryProviders/`:

- `getDeliveryQuote()`
- `createDeliveryRequest()`
- `getDeliveryStatus()`
- `cancelDelivery()`
- `getTrackingDetails()`
- `handleWebhook()` with provider-specific signature verification and status mapping

Register the adapter in `services/deliveryProviderService.js`, load credentials only from server environment variables, and never return credentials in API responses. A live adapter must use the provider's published API contract; placeholder URLs or invented credentials are not acceptable.

## Webhook contract used by the sandbox adapter

The sandbox signature is an HMAC-SHA256 hex digest in `x-delivery-signature`. It signs:

`eventId|jobId|status|occurredAt`

Pawzzle validates the signature before database lookup, scopes the update by provider key plus external job ID, and atomically records the event ID so replayed events do not duplicate history.
