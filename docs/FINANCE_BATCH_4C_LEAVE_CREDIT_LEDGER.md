# Finance Batch 4C — Leave Policy and Credit Ledger Foundation

Status: inactive foundation only. No approved policy is seeded, no routes are exposed, no leave credits are granted, and no accrual, reservation, consumption, payroll deduction, cash conversion, or balance migration runs in this batch. Existing `LeaveRequest` paid/unpaid snapshots and leave workflow behavior are unchanged.

## Models and scope

- `LeavePolicyVersion` is Store-scoped and versioned by Store, stable `leaveTypeKey`, scope, and integer version. It records classification (`statutory` or `employer_provided`), inclusive effective dates, eligibility inputs, integer `unitsPerDay` (default representation: 480 minutes/day), paid/unpaid treatment, explicit accrual and carryover parameters, author, independent approval evidence, an approved snapshot, and checksum.
- New policy versions default to `draft`; drafts are inactive and cannot affect existing requests or payroll. Activation requires distinct business and compliance reviewers, dated evidence, a reference, and a checksum-protected snapshot. This foundation does not provide activation APIs. `active` overlapping date ranges are rejected for the same Store and leave type when scopes intersect (a Store-wide scope intersects every category scope; two category scopes intersect when their keys match). Retired versions remain historical.
- Read-only date selection returns exactly one active checksummed policy by Store, leave type, applicable date, and optional employee category; it fails closed on missing or ambiguous matches.
- Active policy versions are immutable through the model's ordinary Mongoose update/delete operations. Draft-to-active transitions are rejected by ordinary Mongoose save/update paths; `bulkWrite` permits draft inserts only. The internal `activateLeavePolicyVersion` service is the only supported activation path and requires an explicit same-Store Owner/Admin business approver, a distinct same-Store non-Finance reviewer, a trusted backend callback returning verified qualification evidence, an explicit effective date, approval reference, and HTTPS source references. Reviewer ID and qualification-evidence reference are persisted with the approval record. There is no activation route or UI. Changes require a new version; historical versions cannot be deleted. Direct database/collection writes bypass Mongoose hooks and must not be used by application code.
- Activation runs inside a MongoDB transaction and claims a unique `LeavePolicyActivationGuard` document keyed by Store + stable leave type. The guard serializes all category scopes for that key because a Store-wide scope intersects every category. The service re-reads the draft, validates evidence and source references, rechecks all active intervals/scopes, and conditionally transitions only `status: draft`; overlap aborts the transaction, including its guard revision update. Same-evidence activation retries return the active version unchanged. The unique guard index coordinates concurrent service instances; a transaction-capable MongoDB deployment is required.
- `LeaveCreditLedgerEntry` is append-only. It stores Store, employee, leave type, policy version, exact signed/unsigned integer minutes, effective date, source, source reference, idempotency key, actor, reason, optional independent authorizer, optional reversal reference, and unit-scale snapshot. It deliberately has no leave reason or attachment URL fields.
- Ledger `bulkWrite` permits inserts only and rejects updates, replacements, and deletes. Raw driver or collection operations still bypass model middleware; this is not database-enforced immutability and DB write access must remain restricted.

## Accounting rules

Amounts use safe integer minutes; one policy day is represented by `unitsPerDay` (default 480), not floating-point days. Positive credit entries are opening balance, accrual, and carryover. Manual adjustment is signed and separately authorized. Reservation moves units out of available balance but not earned balance. Reservation release returns them to availability. Consumption reduces the associated reservation and moves the same units to consumed. Expiry reduces availability. Reversal exactly negates the referenced prior entry's accounting effect and is independently authorized. Request-level reservation reconciliation uses signed totals instead of timestamp order so concurrent timestamp ties cannot change results. Reservation, release, consumption, and reversal must use one policy version.

Projection reports earned, reserved, consumed, expired, net adjustments, available, and reconciled available units. The ledger is authoritative; there is no cached account balance. It reports duplicate keys/source entries, missing policy/request/reversal references, Store/employee/policy mismatches, policy date/unit-scale mismatches, cross-policy request accounting, over-release/over-consumption, and negative balances. Projection is read-only and never repairs data.

## Idempotency, indexes, and future transaction boundary

Policy identity has a unique index on Store + leave type + scope + version. Policy date overlap is checked at activation time because a normal unique index cannot enforce interval exclusion; activation must recheck under transaction-safe coordination.

Ledger indexes provide unique Store + employee + leave type + idempotency key, one accrual per source period, one reservation and consumption per leave request, one manual adjustment per reference, and one reversal per ledger entry. A future write workflow must transactionally call the read-only `validateLedgerReferences` check, validate the active policy and Store/employee/request state, enforce available units, append the ledger entry, and update any request/account projection. Unique-index conflicts are idempotency signals, not reasons to retry as a new credit. Concurrency tests must use an isolated transaction-capable MongoDB replica set.

## Authorization and policy decisions

`utils/leaveCreditAccess.js` is a deny-by-default authorization predicate only; it does not expose an endpoint. Employees may read their own Store-scoped balance; a Store Owner/Admin with effective leave approval authority may read employees in that Store. Finance and cross-Store access are denied. Any future manual adjustment requires an Owner/Admin actor plus a different Owner/Admin authorizer, both in the Store, a reason, and neither may be the target employee. Policy approval requires distinct Store Owner/Admin business and compliance reviewers. Finance cannot approve policies or adjust credits, regardless of custom permission payloads. No employee-facing balance controls are added.

Before activation, the authorized Owner/Admin and qualified Philippine labor/payroll reviewer must decide whether a policy is statutory or employer-provided, covered employee classes, legal eligibility, accrual amount/timing, paid treatment, units/working-day conversion, carryover and expiry, effective date, and correction/reversal rules. This code does not decide SIL eligibility or entitlement and does not infer entitlement from Store leave-type defaults or existing leave requests.

## Leave-unit conversion decisions still required

The current 480-minute `unitsPerDay` is a representation default only; it is not a claim that each employee works an eight-hour day or that a day of leave is always 480 minutes. Before any conversion is enabled, policy review must specify how the unit is derived from each employee's scheduled workday. Part-time employees need their contracted or approved roster duration; variable shifts need per-date schedule minutes. Half-day treatment must define whether it means half of that day's scheduled minutes or another explicit policy amount. Policies must state whether holidays and rest days consume credit or only scheduled workdays do.

Schedule changes require date-effective schedule versions. A future reservation/consumption record must snapshot the work schedule/version and resulting minutes at the time the leave is approved or consumed; later schedule edits must not rewrite prior ledger entries. Cancellation/reversal must use that historical snapshot. This foundation does not perform these conversions.

## Future Batch 4C.2 integration points

1. Add an authorized policy drafting/review UI and qualification/evidence registry around the existing internal transaction-safe activation service; do not expose activation until product/legal approvals and live authorization/audit behavior are reviewed.
2. Add isolated idempotent opening-balance/accrual writers only after policy approval; no automatic SIL until eligibility and source rules are reviewed.
3. Add reservation/release and consumption integration with the existing transactional leave workflow; do not change `LeaveRequest` paid/unpaid snapshots in this foundation.
4. Add reconciliation reporting and manual correction workflow with independent authorization.
5. Consider payroll integration only in a later approved batch. This batch does not change salary, payroll computation, statutory readiness, payslips, or historical payroll.

## Verification limits

The foundation tests use synthetic fixtures and in-memory Mongoose document validation/pure projections. The optional integration suite requires `MONGODB_TRANSACTION_TEST_URI`, verifies a local loopback primary named `pawzzleTestRS` on port 27018 and a database name containing an explicit `test` token, and drops only its own randomized collections. No employee ledger writes or production database access occur. Existing Batch 3 statutory readiness remains fail-closed.
