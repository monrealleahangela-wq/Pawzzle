# Supplier Partnership Slice B release gate

This is an operator checklist, not approval to access production or change an index. The Slice B server refuses production traffic until the SupplierProduct replacement index and the new SupplierPartnership indexes are present. Production Mongoose automatic index/collection creation is disabled for those two models only. Other pre-existing models retain their existing startup behavior.

## 1. Read-only preflight

Use an authorized read-only production connection. Do not print credentials or individual employee/customer records. Record the database and service identity, current deployed SHA, and sanitized results of:

```javascript
db.supplierproducts.getIndexes()
db.supplierproducts.aggregate([
  { $match: { pet: { $type: 'objectId' } } },
  { $group: { _id: { supplier: '$supplier', pet: '$pet' }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
  { $count: 'conflicts' }
])
db.supplierproducts.aggregate([
  { $group: { _id: { $type: '$pet' }, count: { $sum: 1 } } }
])
db.supplierpartnerships.getIndexes()
```

Verify the legacy `supplier_1_pet_1` has key `{ supplier: 1, pet: 1 }`, `unique: true`, and `sparse: true`. The replacement `supplier_live_pet_unique` must have the same key, `unique: true`, and exactly `partialFilterExpression: { pet: { $type: 'objectId' } }`, without sparse, hidden, or custom collation options. Verify the existing SupplierProduct `itemType_1`, `pet_1`, `supplier_1_sku_1` (unique), `category_1`, and `supplier_1_isActive_1` indexes. Investigate any unexpected index shape or duplicate live-pet pair; do not guess or auto-delete records.

## 2. Recovery and change authorization

Before any write, the database operator must attest to a recent *tested restorable* backup or PITR point, a documented restore procedure and recovery owner, an approved maintenance window, permission for index changes, and a verified way to pause Supplier-offer and partnership writes. Record the intended migration SHA, operator, approval, and before-index snapshot. If any prerequisite is missing, NO-GO.

## 3. Approved migration window

Pause affected writes and prevent an old application instance from restarting during the window; the old model declares the legacy index and might recreate it on initialization. Recheck index definitions and duplicate count. With separate production migration authorization, run the guarded SupplierProduct script from the reviewed release SHA using an explicit migration connection and its documented `--apply` approval flag. It creates `supplier_live_pet_unique` before dropping `supplier_1_pet_1`; if the build fails, the old index remains. Do not run it on application startup.

The new `supplierpartnerships` collection must also receive these indexes through an explicitly authorized database change before deployment:

```javascript
db.supplierpartnerships.createIndex({ store: 1, supplier: 1 }, { unique: true })
db.supplierpartnerships.createIndex({ supplier: 1, status: 1 })
db.supplierpartnerships.createIndex({ status: 1, 'versions.terms.effectiveUntil': 1 })
```

Do not treat these example commands as authorization. Check any pre-existing collection, duplicate Store/Supplier pair, or incompatible index first. These definitions are required for agreement uniqueness and query performance; the application will not create them implicitly in production.

## 4. Post-migration verification and deployment

While writes remain paused, re-run read-only index inspection and the duplicate/type aggregates. Require the exact replacement and all baseline SupplierProduct indexes, **absence of the legacy index**, and all three SupplierPartnership indexes. If any check fails, do not deploy. Only then deploy the reviewed Slice B SHA through the approved release path. Verify Render's deployed SHA, startup logs, `/api/health`, and that the server listened only after index readiness passed. Resume writes after authenticated Seller/Supplier checks confirm agreement creation, same-version dual acceptance, scoped visibility, procurement gating, and historical purchase-order snapshots. Do not initiate real procurement payments to smoke-test.

## 5. Rollback and incident decisions

- **Before dropping the legacy index:** stop on any replacement build or validation failure. Keep the legacy index and current application serving; resolve the conflict under a new approved plan.
- **After replacement creation but before legacy drop:** both indexes may coexist. Re-inspect; do not retry blindly if either shape differs.
- **After legacy drop but before Slice B deployment:** keep writes paused and deploy only if the complete readiness check passes. Do not restart the old release without rechecking indexes. Do not recreate the sparse index if multiple ordinary offers now exist.
- **If Slice B startup fails:** the new instance must not listen. Keep or restore the prior serving deployment only under an incident decision; suspend new partnership-dependent procurement, preserve offers, agreements, and order snapshots, and inspect indexes. Application rollback does not imply database-index rollback.
- **If production data is corrupted:** stop writes and invoke the verified PITR/restore procedure with the recovery owner. Never delete Supplier offers merely to make a legacy index rebuild.

No production preflight, migration, deployment, backup verification, or operator approval is recorded by this document.
