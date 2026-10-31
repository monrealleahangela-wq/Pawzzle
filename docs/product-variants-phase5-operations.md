# Product variants Phase 5 operations

Phase 5 code is fail-closed. Do not enable customer variant lifecycle flags until the Phase 0–5 replica-set tests and physical index checks pass.

## Reservation expiration worker

The worker is separately invocable and is not registered as an in-memory web-server timer:

```powershell
$env:RESERVATION_EXPIRATION_WORKER_ENABLED='true'
$env:RESERVATION_EXPIRATION_BATCH_SIZE='50'
npm run jobs:expire-reservations
```

Schedule that command through one or more managed job runners. Database leases make concurrent runners safe. Each run processes a bounded batch and prints a JSON summary containing claimed, expired, conflict, and error counts. Do not enable it in production until `CUSTOMER_VARIANT_RESERVATION_EXPIRY_JOB_VERIFIED=true` is approved.

## Local replica set

Follow `docs/product-variants-phase4-local-mongodb.md`. Tests accept only `mongodb://127.0.0.1:27018/...?...replicaSet=pawzzleTestRS`. Use a new isolated test database and never substitute Atlas, staging, or production credentials.

Run all phases with:

```powershell
$env:MONGODB_TRANSACTION_TEST_URI='mongodb://127.0.0.1:27018/pawzzle_variant_tests?replicaSet=pawzzleTestRS'
node --test tests/productVariantPhase0.integration.test.js tests/supplierVariantsPhase1A.integration.test.js tests/productVariantsPhase2.integration.test.js tests/productVariantsPhase3.integration.test.js tests/productVariantsPhase4.integration.test.js tests/productVariantsPhase5.integration.test.js
```

No production index or data migration is performed by Phase 5.
