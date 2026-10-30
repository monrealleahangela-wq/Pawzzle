# Supplier Product Variants Phase 1A activation

Supplier variant writes are disabled by default. The application enables them only when `SUPPLIER_VARIANTS_ENABLED=true` **and** the runtime readiness check confirms all of the following:

1. MongoDB is a writable replica set so SKU claims and variant writes can commit in one transaction.
2. `supplier_product_variant_combination_unique`, `supplier_product_variant_sku_unique`, and `sku_claim_active_namespace_unique` physically exist.
3. Every active legacy supplier parent SKU and every supplier variant SKU has the correct active claim.
4. The read-only report finds no invalid legacy SKUs or normalized parent/child collisions.

## Read-only preflight

Use an explicitly supplied database URI. The command performs no writes, index creation, or backfill:

```powershell
$env:MONGODB_VARIANT_READINESS_AUDIT_URI='<operator-supplied-uri>'
$env:VARIANT_READINESS_AUDIT_CONFIRM='READ_ONLY'
node scripts/auditVariantSkuReadiness.js
```

The report's `coverage.missingClaims` value is the proposed backfill plan. Do not apply it directly. A separately reviewed migration must first resolve `coverage.collisions` and `coverage.invalidLegacySkus`, then create claims transactionally and idempotently.

## Safe rollout order

1. Deploy the code with the feature flag absent or false on every application instance.
2. Run the required index maintenance and SKU-claim backfill under a separately approved migration and rollback plan.
3. Run the isolated replica-set integration suite with `MONGODB_TRANSACTION_TEST_URI` pointing only to a disposable database named `pawzzle_variant_phase1a_test_*`.
4. Re-run the read-only report and require a collision-free, fully covered result.
5. Ensure every running application instance includes the SKU-claim-aware parent write paths before enabling the flag.
6. Set `SUPPLIER_VARIANTS_ENABLED=true` and verify the capability endpoint reports `enabled: true`.

Do not expose supplier variants to procurement, receiving, seller inventory, customer catalog, cart, checkout, or payments during Phase 1A.
