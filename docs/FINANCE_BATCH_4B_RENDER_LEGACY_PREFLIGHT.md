# Finance Batch 4B — Read-Only Render and Legacy-Data Release Preflight

**Assessment timestamp:** 2026-10-15 00:03 Asia/Manila.

**Baseline:** `1c3d91715488ebd7b5bbe3dc63229e3fed09fdc7`.
**Decision:** release approval **PENDING**. This is a repository and access-availability assessment, not a production verification, legal opinion, migration authorization, or deployment approval.

## 1. Evidence register

| Area | Status | Evidence and limits |
|---|---|---|
| Source Git identity | VERIFIED | Read-only Git inspection on 2026-10-15: `main`, HEAD is the baseline SHA, `main...origin/main`; 61 unstaged paths (15 modified tracked, 46 untracked), none staged. `git diff --check` found no whitespace error (Git emitted LF-to-CRLF advisory messages). |
| Isolated candidate identity | VERIFIED | Detached HEAD at the same baseline SHA; before adding this report, 23 unstaged paths (13 modified tracked, 10 untracked), none staged. No branch pointer was changed. `git diff --check` passed with line-ending advisories only. |
| Render local configuration | VERIFIED (repository only) | `render.yaml` declares one Node web service named `pawzzle`, build `npm run install-all && npm run build`, start `npm start`, health check `/`. Root `package.json` starts `node server.js`; the server serves the built client when present and listens on `PORT` (fallback 5000). The manifest is configuration source, not evidence of current dashboard/service state. |
| Render live service/deployment | NOT VERIFIED | No Render-specific read-only connector was available. Existing browser/app inventory was empty. No dashboard login or deployment API was used. Service ID, repo/branch binding, current/latest successful deploy, deployed SHA, rollback, auto-deploy setting, live commands, and service events are unknown. |
| Production environment values/presence | NOT VERIFIED | No authorized Render environment metadata was available. No production values, local secret values, database URI, or token were read or recorded. Manifest-declared names do not prove dashboard presence. |
| Production MongoDB topology/indexes | NOT VERIFIED | No positively scoped read-only production database connection/credential was available. No production connection was attempted. Replica-set/sharded topology, account privileges, collection/index state, backups/PITR, and legacy records remain unknown. |
| Legacy leave data and payroll compatibility | NOT VERIFIED | Only candidate code and schemas were inspected. No production/staging employee or payroll records were accessed. |
| CI and payroll gates | BLOCKED / PENDING | The prior candidate report documents the strict `CI=true` failure on 77 baseline warnings in 41 unchanged files. CI policy remains PENDING. The candidate excludes Batch 3 statutory readiness, so its committed-baseline payroll approval behavior is not evidence of statutory compliance; Owner/Admin and qualified payroll review remain PENDING. |
| Tests | PRIOR REPORTED EVIDENCE ONLY | Candidate report records isolated transaction 1/1, backend focused regressions 65/65, syntax 15/15, frontend HR 8/8, and non-strict build compile. These were not rerun for this preflight. No production tests were run. |

The candidate itself is a detached, uncommitted worktree with B4B changes; it has no single candidate commit SHA to deploy. Baseline `1c3d917` is the Finance Batch 2 commit in local history. **Neither that fact nor the generic local health response proves what Render currently runs.** The server's repository health route is `/api/health` and returns a fixed label (`v3-stable`), not a commit SHA; the Render manifest checks `/`. Do not use either label/response as deployment identity.

## 2. Local Render and runtime configuration inventory

Repository inspection found one service entry in `render.yaml`, not distinct frontend/backend services. The Node service builds the React client and the Express server can serve that static build. The manifest does not declare a repository branch, auto-deploy policy, rollback target, or health route for `/api/health`; those require dashboard evidence. `CI` is not declared in the manifest. Do not infer the CI build mode or current environment from local files.

The manifest declares `NODE_ENV` and reCAPTCHA configuration names; one secret is marked `sync: false`, which means its value is supplied outside the manifest. Public site-key values are intentionally omitted from this report. Candidate code uses these runtime names:

| Name / group | Code-level role | Repository metadata | Live presence / readiness |
|---|---|---|---|
| `MONGODB_URI` | Required by `server.js` to connect to the application database | Not declared in `render.yaml` | **NOT VERIFIED**; do not test or print the value. |
| `JWT_SECRET` | Authentication token verification/signing | Not declared in `render.yaml` | **NOT VERIFIED**. |
| `PAYROLL_DATA_ENCRYPTION_KEY` | Batch 2 AES-256-GCM protection for external payment details; code fails closed if missing/invalid | Not declared in `render.yaml`; Batch 2 docs require 32 bytes (64 hex characters or base64 encoding of 32 bytes) | **NOT VERIFIED**. Presence alone would not establish payment workflow readiness; use approved secret-manager metadata/validation without revealing the value. |
| `NODE_ENV`, `PORT` | Production mode and HTTP listener; Render normally supplies the port | `NODE_ENV=production` declared; `PORT` is platform/runtime-supplied or falls back in code | Manifest fact only; live values **NOT VERIFIED**. |
| `FRONTEND_URL`, `CLIENT_URL`, `REACT_APP_API_URL` | Redirect/email links and optional client API endpoint; code has fallbacks, including same-origin API behavior | Not declared in `render.yaml` | **NOT VERIFIED**; verify expected public origins in dashboard. |
| `RECAPTCHA_SECRET_KEY`, site-key names | reCAPTCHA verification and browser configuration | Names are present in manifest; secret value is externally supplied | Actual secret presence/validity **NOT VERIFIED**. |
| `OTP_HASH_SECRET`, email/Resend, Cloudinary, Google OAuth, PayMongo names | Optional/feature-specific integrations found in code | Not declared or fully represented in manifest | Dashboard presence and feature readiness **NOT VERIFIED**. This is not an exhaustive feature configuration sign-off. |

No secret values, tokens, connection strings, or payment data were accessed, printed, or added to this document. Render operators must confirm names/presence and secret ownership through authorized metadata; application testing should validate behavior without revealing values. Any missing encryption key blocks protected Batch 2 payment recording by design. Environment changes/restarts are outside this preflight and require separate operator authorization.

## 3. MongoDB topology and read-only evidence plan

### Current conclusion

Production transaction readiness is **NOT VERIFIED**. Batch 4B relies on multi-document transaction support for leave submission/approval/cancellation, payroll calculation coordination, attendance/schedule/audit writes, and related payroll workflows. Do not enable the workflow until the actual production MongoDB endpoint is identified through authorized Render metadata and a read-only account/scope is confirmed. Never repurpose `MONGODB_TRANSACTION_TEST_URI` or a local test URI for production.

### Later authorized read-only plan

Only after the database owner confirms a read-only credential scoped to the identified production database, an authorized operator should:

1. Record the Render service identity, database name (redacted in reports), MongoDB server version, and credential role without revealing the URI or secret. Stop if the target database or privileges are ambiguous.
2. Run read-only topology metadata (`hello` or the provider's equivalent) to determine replica-set name/primary or `mongos`, topology compatibility, and transaction prerequisite. Inspect account roles; stop if the account can write or cannot be proven read-only.
3. Use `listCollections` / `listIndexes` only for the named HR collections. Return index names/key patterns/options and aggregate collection counts, not employee documents. No `createIndex`, `dropIndex`, write, migration, transaction test, or cleanup.
4. Compare observed indexes with the inventory below. Capture only redacted metadata, timestamp, operator, and query counts. Do not export leave reasons, attachments, bank information, or identifiable employee/payroll rows.

No such query was run here.

## 4. Batch 4B data/index and rollout inventory

| Collection/model | Candidate change or index | Uniqueness / behavior | Existing-data risk and rollout notes |
|---|---|---|---|
| `LeaveOverlapClaim` (new model/collection) | `{store:1, employee:1, workDate:1}` unique; `{leaveRequest:1}` non-unique | One active Store/employee/civil date claim prevents concurrent overlaps; active claim states cover pending, approved, and cancellation-requested leave. | If a prior partial rollout created claims, duplicate Store/employee/date values can make the unique build fail. Historical active LeaveRequests are not automatically represented in claims. Dry-run conflicts and duplicate claims must be assessed before any separately authorized index/backfill. The service explicitly calls `LeaveOverlapClaim.createIndexes()` through `ensureClaimIndex()` before new submission/review paths; first use can therefore attempt DDL. Production index presence must be verified/provisioned in an approved maintenance plan before enabling mutations. No index was created here. |
| `LeaveRequest` | Status enum adds `cancellation_requested`; cancellation request/review timestamps, actor, comment, and history actions are additive. Existing Store/employee/date index remains non-unique. | Stores durable request/review/cancellation history; no new unique index. | Existing records remain readable; old requests do not acquire claims automatically. Avoid rewriting history. Query and API compatibility must be confirmed before rollout/rollback. |
| `Attendance` | Optional `leaveOriginalStatus` and `leaveCreatedRecord` provenance fields | No new index; existing unique `{store:1, employee:1, workDate:1}` remains relevant. Provenance allows safe reversal only when known. | Legacy leave attendance without provenance is ambiguous; cancellation is blocked rather than guessed. Existing unique-index conflicts/attendance consistency should be checked read-only. No attendance backfill is authorized. |
| `PayrollPeriod` | `payrollInputRevision` and `computedInputRevision` fields, defaulting to zero in the application model | No new index; existing unique `{store:1, periodStart:1, periodEnd:1}` remains. Revision writes coordinate computations with leave changes. | Historical BSON documents can lack both fields and are treated as zero by the candidate checks. Do not mass-update periods. Before rollout, count missing/mismatched values by status and inspect affected overlapping leave periods using aggregate-only results. |
| `ActivityLog` | `leave` added to category enum | No new index; existing activity index behavior retained. | Additive schema change; verify old application compatibility with new category if rolling back. |

Mongoose index auto-creation settings were not explicitly set in the inspected server/config files. Independently, the candidate explicitly runs `createIndexes()` for `LeaveOverlapClaim` on first leave submission/decision in each process. This is a release concern: a user mutation path can trigger DDL if the index is absent. Deployment sequencing must establish index state before allowing those mutation routes; do not rely on a first employee request to create a production constraint. Any DDL/backfill requires separate written change approval, backup/restore readiness, duplicate preflight, and operator runbook. Existing indexes listed above are expected schema definitions, not verified production indexes.

## 5. Legacy leave-data query plan and stop conditions

The candidate's `services/leaveOverlapReconciliationService.js` provides `reconcileLegacyLeaveClaims({storeId, employeeId?, apply:false})`. Dry-run reads Store-scoped active requests (`pending`, `approved`, `cancellation_requested`) and Store-scoped claims, plans missing daily claims, and reports overlapping active requests, invalid ranges, and orphan claims. It returns request/employee/claim identifiers; do not export that raw response to a broad audience. Redact identifiers or aggregate counts before recording evidence. `apply:true` performs transactional writes and is expressly outside this task.

No production reconciliation was run. For a later separately authorized preflight, use a fixed Store and bounded date/window scope; return aggregate anomaly counts only. Minimum checks:

| Check | Read-only evidence to collect (counts only in shared report) | Stop condition |
|---|---|---|
| Overlapping pending/approved/cancellation-requested leave | Self-join active requests on same Store and employee with inclusive date-range overlap; compare with daily claims. Group by status pair and anomaly type. | Any conflict requires restricted human review; do not choose, auto-reject, or auto-approve either request. |
| Invalid/reversed/overlong dates | Count invalid start/end order, unparseable civil dates, and ranges beyond candidate's bounded supported range. | Any invalid range; resolve through authorized workflow before claim backfill. |
| Orphan or duplicate claims | Left-join claims to active request by ID; group by duplicate Store/employee/workDate key and claims pointing to no active request. | Any duplicate key, orphan, or request/claim Store/employee/date mismatch; do not delete or repair automatically. |
| Exact duplicate active requests | Count same employee/date/type submissions and exact duplicates separately from other overlaps. | Any duplicate is a human decision; preserve each request's history. |
| Store assignment/employment interval | Compare each request's Store against current authorized employee Store and employment start/end covering the entire request; count each mismatch class. | Any cross-Store, inactive, reassigned, or out-of-employment request; do not rewrite Store/employee association or shorten dates. |
| Attendance/provenance consistency | For approved and cancellation-requested leave, compare scheduled civil dates against `on_leave` attendance, linked `leaveRequest`, stored schedule, punches/corrections/review history, and reversal provenance. Report aggregate mismatch classes. | Work punches, changed/reviewed rows, ambiguous legacy provenance, missing/mismatched schedule or attendance; stop cancellation/backfill for affected cases. |
| Cancellation-requested leave | Count by Store and status; verify that claims/schedule remain held pending review. | Any row inconsistent with the pending cancellation state; resolve through normal reviewer workflow. |
| Historical compatibility | Count statuses/enum values outside current schema and active records lacking expected fields/claims; compare before/after dry-run totals. | Unknown status or unexplained count delta; pause migration. |

The reconciliation service's own report covers overlap pairs, invalid ranges, and orphan claims. Store/employment mismatch, duplicate classification, and attendance/schedule mismatch require additional read-only checks; do not imply the service already detects them. No reason text, attachment URL, or person-level listing belongs in the release report. If an authorized operator needs case-level resolution, use the minimum access in the HR interface and keep that evidence outside this package.

### Mandatory migration stop conditions

Do not proceed to index provisioning/backfill until: database identity and read-only scope are proven; transaction-capable topology is verified; a current restorable backup/PITR is proven; index duplicates are absent or resolved with explicit approvals; all legacy overlap/invalid/orphan cases have documented human resolutions; attendance/schedule provenance is understood; Store/employment mismatches are resolved; and no action would rewrite finalized payroll. Any unresolved anomaly leaves the migration BLOCKED. Backfill requires separate approval, a dry-run report, maintenance window, before/after counts, rollback plan, and post-check. Nothing in this preflight authorizes it.

## 6. Payroll revision compatibility plan

Candidate code evidence:

- `services/payrollComputationService.js` computes within a MongoDB transaction, reads `payrollInputRevision`, calculates the payslips, and saves the same `PayrollPeriod` with `computedInputRevision`. Leave approval/cancellation transactionally increments the overlapping mutable period's input revision. A shared period-document write creates the conflict/retry point so a stale computation cannot publish as current after a committed leave change.
- `controllers/hrController.js` rejects review/approval when computed and input revisions differ. Leave changes demote an affected reviewed period to computed when a payslip exists and attach a blocking review issue. Payroll computation is limited to `draft`/`computed` periods.
- Cancellation checks for a payslip in an overlapping `approved`/`paid` period and blocks reversal rather than mutating finalized history. No final payslip recomputation or salary adjustment is performed by leave cancellation.
- Historical records without revision fields read as zero in candidate comparisons; no bulk migration is intended. This compatibility is code-level, not confirmation of actual live data distribution.
- Rider earnings are claimed during payroll approval using a conditional transition; finalized/payment behavior remains the committed Batch 1/2 path. Live Rider settlement consistency has not been queried.

For an authorized read-only preflight, aggregate by Store (redacted), period status and date window:

1. Count periods with missing input/computed revision fields, mismatched revisions, and any blocking review issues; do not read names or salary amounts.
2. Count Draft/Computed/Reviewed periods whose range overlaps active/cancelled leave changes and whether affected employee payslips exist; use restricted joins, publish only totals.
3. Count Approved/Paid period/payslip coverage and verify no candidate operation would target them; historical finalized snapshots must remain unchanged.
4. Aggregate Rider earnings by settlement state and whether `payrollPayslip`/payout links are present; flag inconsistent or duplicate links without modifying records.
5. Compare counts before and after a non-production rehearsal; never recompute production payroll as a test.

These checks were not run against live data. Missing revision fields alone are not a reason to mutate old periods; any reviewed/mismatched or overlapping cases require controlled analysis. Batch 4B does not certify historical payroll accuracy or statutory completeness.

## 7. Release, deployment, and rollback checklist

All items remain **PENDING** and some require separate operational approval:

| Gate | Required evidence | Separate approval / stop rule |
|---|---|---|
| Exact release artifact | Approved commit SHA (candidate must first be reviewed and committed through its authorized process), API/UI compatibility, dependency/build artifact provenance | Owner/engineering approval; the detached uncommitted worktree is not a deployable SHA. |
| Render identity | Service ID/type, repo/branch, deploy ID/status, deployed SHA, build/start/health commands, auto-deploy state, event history; confirm no later rollback | Authorized Render release operator. No Render access was available for this audit. |
| CI gate | Strict CI pass or a separately authorized, explicit, time-bounded exception; known strict failure is 77 baseline warnings | Keep PENDING; do not set production `CI=false`, suppress warnings, or treat non-strict build as strict pass. |
| Payroll posture | Written Owner/Admin decision with qualified Philippine payroll/accounting/legal review for covered periods/employees; distinguish baseline payroll approval from Batch 3 statutory readiness | Keep PENDING. No statutory gate/calculator activation, compliance assertion, or payroll approval authorization is made. |
| Environment | Authorized non-secret metadata check for `MONGODB_URI`, `JWT_SECRET`, `PAYROLL_DATA_ENCRYPTION_KEY`, URLs, and required integrations; secret manager/operator evidence | Render/backend operator. Never disclose values. Encryption-key absence/invalidity blocks Batch 2 protected payment recording; config change/restart requires separate approval. |
| Database/backup | Verified production transaction topology and read-only account first; collection/index inventory; backup/PITR restore evidence | DB owner and release operator. Stop if target/role ambiguous, not transaction-capable, or backup is not restorable. No query or write occurred here. |
| Legacy leave/index | Bounded dry-run anomaly counts, human case resolution, duplicates absent/resolved, explicit approved index plan and backfill plan | Owner/Store HR and DB operator. Index creation/backfill are separate writes and were not authorized/performed. Note current service may call `createIndexes()` on first leave mutation. |
| Payroll compatibility | Aggregated revision/status/leave overlap and Rider settlement checks; confirm approved/paid snapshots untouched | Finance/HR and release operator; do not change live payroll during smoke test. |
| Non-production smoke test | Same approved artifact against isolated test data: employee self-service, Store-scoped review, overlap race, cancel/reversal, payroll recomputation blocking and finalization protection; test with configured transaction-capable isolated Mongo | QA approval. No production employee data or actual external payment. |
| Recovery and rollback | Verified previous deployed commit, backup/restore runbook, triggers/owner, monitoring and incident contact; retain new claims/revision writes rather than deleting them | Owner and SRE/DB operator. On rollback, pause leave mutations if old code ignores claims/revisions; reconcile before writes resume. Code rollback does not undo indexes or database writes. |
| Post-deploy observation | Health plus logs/metrics for transactions, leave/attendance consistency, payroll stale blockers, payment confirmation, and notification failures; health label is not commit identity | Release operator/QA; no actual salary transfer as verification. |

### Rollback triggers (proposed, not approved)

Stop or roll back the application if transaction failures prevent safe leave changes; an overlap/attendance/schedule invariant is violated; payroll computation can become reviewable with stale revisions; finalized periods/snapshots change; Store isolation or permission checks fail; or the approved artifact/service SHA differs. Before rollback, stop mutations as needed, preserve evidence and DB state, use the verified prior SHA, and reconcile all in-flight claims/revision blockers. Do not delete new collections/indexes to make an older application run. Re-enable leave/payroll writes only after the old/new schema interaction and data reconciliation are independently reviewed.

## 8. Pending approvals and outstanding access

| Decision/access item | Required party/evidence | Status |
|---|---|---|
| Live Render deployment and configuration metadata | Authorized Render operator supplies service/deploy identity and non-secret environment-presence evidence | **NOT VERIFIED / PENDING** |
| Read-only production DB inspection | DB owner provides explicitly read-only, database-scoped access through approved tooling; verify topology/role before query | **NOT VERIFIED / PENDING** |
| Legacy leave reconciliation readiness | Store HR/Owner reviews bounded anomaly counts and restricted case details, with explicit resolution record | **PENDING** |
| Index/backfill change | DB/release owner approves written index plan, backup, window, and idempotent backfill only after clean dry run | **PENDING; not authorized** |
| CI gate choice | Engineering/release owner and Owner/Admin choose strict remediation or a documented exception | **PENDING** |
| Payroll compliance posture | Pawzzle Owner/Admin plus qualified Philippine payroll/accounting/legal reviewer decide if baseline non-statutory approval behavior may be used | **PENDING** |
| Production release/rollback approval | Owner/Admin and authorized release operator sign exact artifact and runbook | **PENDING** |

No access request, credential creation, secret change, deployment, test write, index creation, migration, backfill, payroll recalculation, leave-credit grant, or production data modification was performed. No browser-level application verification was performed.
