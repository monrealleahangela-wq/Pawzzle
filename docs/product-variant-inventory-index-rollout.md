# Variant inventory index rollout

Phase 3 defines, but does not apply, the physical indexes required for exact-variant inventory.

## Preconditions

1. Use a backup and a maintenance window.
2. Run `scripts/reportVariantInventoryReadiness.js` against a disposable restored replica-set database by setting only `MONGODB_TRANSACTION_TEST_URI`.
3. Resolve every reported duplicate balance or lot and every null/invalid variant identity. Never merge quantities without reviewing the underlying inventory transactions and lots.
4. Confirm all legacy simple balances and lots omit `productVariant`; do not write `null` during rollout.
5. Run the receiving concurrency and idempotency integration tests against that disposable replica set.

## Controlled production migration (operator-run, separately approved)

1. Disable variant writes and receiving flags.
2. Re-run the dry-run collision report on a read-only production connection approved for the release.
3. Create `inventory_simple_balance_unique`, `inventory_variant_balance_unique`, `inventory_lot_simple_unique`, and `inventory_lot_variant_unique` using the definitions in the Mongoose schemas.
4. Remove the legacy `store_1_product_1` unique index only after both Inventory indexes exist and validation queries pass. This is necessary because that legacy index prevents two variants under one parent.
5. Verify index names, keys, partial filters, and uniqueness through the readiness endpoint.
6. Record seller variant concurrency and authorization verification, then enable flags in order: seller variant management, variant inventory, inventory concurrency verification, variant procurement, then variant receiving.

No application startup path runs these index operations automatically in production.

## Rollback

1. Disable all variant write and receiving flags first.
2. Preserve all variant balances, lots, and transactions for audit; do not copy them into a parent balance.
3. Restore the application version. Simple-product queries continue selecting only rows without `productVariant`.
4. Do not recreate the legacy unique index while more than one variant row exists for a `{store, product}` pair. Recreating it requires an independently reviewed data rollback.
