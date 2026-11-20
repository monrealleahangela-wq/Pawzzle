# Product variants in Pawzzle

## Seller workflow

A **Simple Product** has one SKU, one price, and one inventory balance. A
**Product With Variants** is a parent listing plus explicit sellable children.
For example, `Automatic Feeder` is the parent, while `Grey`, `Blue`, and
`Green` are variants. Every variant has its own:

- option combination (for example `Color = Blue` or `Flavor = Chicken` plus
  `Size = 1 kg`);
- unique Store SKU;
- retail price and optional image/weight override; and
- exact inventory balance.

The parent price shown on product cards is automatically kept equal to the
lowest active variant price. Customers choose one exact in-stock combination
before adding it to cart. Orders, reservations, fulfillment, cancellations,
and returns retain that exact variant and its immutable SKU/options snapshot.

## Supplier inventory linking

A supplier variant is not automatically assumed to be the same as a seller
variant. Before ordering, the store links the supplier's exact child to its
exact inventory destination. For example:

`Supplier Automatic Feeder / Blue` -> `Store Automatic Feeder / Blue`

This is why the supplier catalog can show **Inventory link required before
ordering**. Once variant mapping is active, use **Link inventory variant** and
select the matching Store variant. Receiving then increases only that balance;
it never falls back to the parent or another color/size.

## Safe activation on Render

Variant activation changes production indexes and must use a backup and a
maintenance window. A pushed application release does not perform these steps.

### 1. Seller variant authoring

Temporarily add the following Render environment variables. Use the same
secret value as `MONGODB_URI` for the migration URI; never commit it.

- `SELLER_VARIANT_MIGRATION_URI=<same secret as MONGODB_URI>`
- `SELLER_VARIANT_MIGRATION_EXPECTED_DB=<database name from the URI>`
- `SELLER_VARIANT_MIGRATION_APPROVED=PREPARE_SELLER_VARIANTS`

In the Render Shell, run the read-only preflight:

`npm run prepare:seller-variants`

Stop if `collisions` or `invalidLegacySkus` is not empty. After review, run:

`npm run prepare:seller-variants -- --apply`

Only after it reports `"ready": true`, set these to `true`:

- `SELLER_VARIANTS_ENABLED`
- `SELLER_VARIANTS_CONCURRENCY_VERIFIED`
- `SELLER_VARIANTS_AUTHORIZATION_VERIFIED`

Remove the three temporary `SELLER_VARIANT_MIGRATION_*` variables and restart
the service. The Product With Variants choice can now create Draft listings.

### 2. Exact-variant stock and customer publication

Follow [the inventory index rollout](./product-variant-inventory-index-rollout.md)
before enabling `SELLER_VARIANT_INVENTORY_ENABLED` and its concurrency flag.
Customer publication additionally requires the reservation indexes and the
`CUSTOMER_VARIANT_*` verification switches defined in `render.yaml`. Pawzzle
keeps the Visibility selector on Draft until browsing readiness is active.

### 3. Supplier variant ordering

Prepare supplier variants with
[the supplier activation procedure](./supplier-variant-render-activation.md),
then verify the mapping index and enable mapping/procurement/receiving in that
order. Do not enable receiving until exact-variant inventory readiness passes.

These stages are intentionally fail-closed: a missing index or unverified
concurrency check disables only the affected variant operation while simple
products continue to work.
