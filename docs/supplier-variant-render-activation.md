# Supplier product variants: Render activation

Supplier variant authoring stays fail-closed until the new child indexes and
legacy supplier SKU claims are verified. Customer purchasing, seller variant
inventory, variant procurement, refunds, and reservation scheduling remain
separate and must not be enabled by this procedure.

## Required Render variables

Use the existing `MONGODB_URI` value as the source for the temporary migration
URI. Do not paste it into logs or source control.

- `SUPPLIER_VARIANTS_ENABLED=true`
- `SUPPLIER_VARIANT_MIGRATION_URI=<same secret value as MONGODB_URI>`
- `SUPPLIER_VARIANT_MIGRATION_EXPECTED_DB=<database name from the URI>`
- `SUPPLIER_VARIANT_MIGRATION_APPROVED=PREPARE_SUPPLIER_VARIANTS`

## Safe execution

1. Deploy the commit containing `prepare:supplier-variants` while leaving all
   customer, procurement, inventory, payment, and scheduler flags disabled.
2. In the Render service Shell, run the read-only preflight:

   `npm run prepare:supplier-variants`

3. Confirm `collisions` and `invalidLegacySkus` are empty. If either contains
   entries, stop and correct those records manually.
4. Run the guarded, idempotent apply command once:

   `npm run prepare:supplier-variants -- --apply`

5. Confirm the final JSON contains `"ready": true`.
6. Remove the three temporary `SUPPLIER_VARIANT_MIGRATION_*` variables from
   Render. Keep only `SUPPLIER_VARIANTS_ENABLED=true`.
7. Restart the web service and refresh the Supplier Dashboard. **Product With
   Variants** should now be selectable.

The command never drops an index, rewrites a SKU, or changes inventory. It
creates only the required SupplierProductVariant/SkuClaim indexes and missing
collision-free supplier SKU claims. It is safe to retry after an interruption.
