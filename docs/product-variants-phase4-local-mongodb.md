# Phase 4 local MongoDB replica-set verification

Phase 4 transaction and concurrency tests must run only against a disposable localhost database. The test rejects hosts other than `127.0.0.1`, ports other than `27018`, and replica-set names other than `pawzzleTestRS`. Every run replaces the URI database name with a random `pawzzle_variant_*` namespace and drops only that random database.

## Current workstation finding

At implementation time this workstation had no `mongod`, `mongosh`, Docker CLI, or repository-provided in-memory MongoDB package. No production or staging URI was used as a substitute.

## Safe local setup

After installing MongoDB Community Server locally, use a new empty directory that is not used by any other MongoDB instance:

```powershell
$phase4Db = Join-Path $env:TEMP 'pawzzle-phase4-mongodb'
New-Item -ItemType Directory -Force -Path $phase4Db | Out-Null
mongod --dbpath $phase4Db --port 27018 --bind_ip 127.0.0.1 --replSet pawzzleTestRS
```

In a second terminal, initialize only that local instance:

```powershell
mongosh 'mongodb://127.0.0.1:27018/admin' --eval "rs.initiate({_id:'pawzzleTestRS',members:[{_id:0,host:'127.0.0.1:27018'}]})"
$env:MONGODB_TRANSACTION_TEST_URI = 'mongodb://127.0.0.1:27018/pawzzle_variant_phase4_test?replicaSet=pawzzleTestRS'
node --test tests/productVariantPhase0.integration.test.js tests/supplierVariantsPhase1A.integration.test.js tests/productVariantsPhase2.integration.test.js tests/productVariantsPhase3.integration.test.js tests/productVariantsPhase4.integration.test.js
```

Confirm `rs.status().myState` is `1` before testing. Never replace this URI with Atlas, Render, production, staging, or a shared developer database. Stop the local `mongod` process after the run; remove the temporary directory only after resolving it and confirming it is the dedicated `%TEMP%\pawzzle-phase4-mongodb` directory.

Customer variant purchasing must remain disabled until all prior-phase suites and the Phase 4 integration suite pass, required indexes are physically verified, and the corresponding verification feature flags are deliberately enabled.
