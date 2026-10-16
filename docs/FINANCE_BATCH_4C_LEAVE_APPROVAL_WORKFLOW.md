# Finance Batch 4C — Leave Policy Approval Workflow and Integration Readiness

**Status: DESIGN ONLY — POLICY SIGN-OFF PENDING.** This document does not approve or activate leave policies, grant leave credits, or authorize accrual, reservation, consumption, encashment, salary deductions, or payroll integration. Finance Batch 3 remains compliance-blocked.

## 1. Current architecture and gap

`LeavePolicyVersion` currently supports only runtime `status` values `draft`, `active`, and `retired`. It stores Store/leave-type/scope/version, effective dates, policy fields, source references, final approval evidence, an approved snapshot, and a checksum. Active versions are protected against ordinary Mongoose edits; draft-to-active changes are intended to go only through the activation service. `LeavePolicyActivationGuard` serializes activation by Store and leave type. `activateLeavePolicyVersion` requires a same-Store Store Owner/Admin with effective `leave.approve`, a distinct non-Finance same-Store reviewer, an injected trusted reviewer-verification callback, an explicit effective date, approval reference, and HTTPS source references; it records the final approver/reviewer references and activates transactionally.

There is no policy API or UI, no submitted/reviewed/owner-approved state, no verified reviewer registry, and no append-only policy decision history. The current internal activation service accepts the business approver and reviewer in one call. It is not a complete operational approval process and must not be exposed directly as a public endpoint. The callback is an integration seam, not proof that a qualification system already exists.

`utils/leaveCreditAccess.js` contains deny-by-default helper predicates, not API authorization. `middleware/auth.js` `requirePermission` checks effective RBAC but does not by itself establish Store ownership or professional qualifications; controllers must independently enforce role, Store, target record and workflow-state constraints. Existing HR routes use `authenticate`, `requirePermission`, and controller Store scoping. Store Owner/Admin permissions are role-defined in `config/permissions.js`; a custom permission payload does not replace the role check required for policy activation.

`ActivityLog` supports Store, actor, category, action, details and optional before/after changes, and existing leave workflows write it in their transaction. It is useful for operational audit/search but is generic, its `changes` field is hidden by default, and it is not an immutable structured policy-approval ledger. It should complement—not substitute for—a policy-specific append-only event history.

## 2. Proposed lifecycle

Keep runtime activation state distinct from review workflow state. Proposed `reviewState` values are separate from the current `status` field so existing policy selection continues to use only `status: active`.

```text
draft ──submit──> submitted_for_review ──qualified reviewer approves──> compliance_reviewed
  ▲                         │                                               │
  │                         ├──request changes──> changes_requested ────────┘
  │                         └──withdraw──> withdrawn                         │
  │                                                                         ▼
  └──edit/new revision <──────────────────────────── owner approves ──> owner_approved
                                                                            │
                                        readiness checklist satisfied ──────▼
                                                              ready_for_activation
                                                                            │
                                              transaction-safe activation ──▼
                                                         active / runtime status
                                                                            │
                                       replacement activation ──> superseded/retired

Any review stage ──reject──> rejected (terminal for this version; create a new version to amend)
```

The arrows from `compliance_reviewed` to `owner_approved` and from `owner_approved` to `ready_for_activation` are separate recorded decisions/checks. An approver may not approve a checksum different from the submitted/reviewed checksum. A policy edit after submission increments a content revision and produces a new checksum; it returns the working revision to `draft` or `changes_requested`, makes prior approvals non-current, and retains prior events as history. Do not erase or rewrite an earlier decision.

Current model coverage: `draft`, `active`, and `retired` are represented by `status`; `retired` may serve as runtime history only after a separately approved supersession flow. `submitted_for_review`, `changes_requested`, `compliance_reviewed`, `owner_approved`, `ready_for_activation`, `rejected`, and `withdrawn` are not represented today. Add `reviewState` and a monotonic `contentRevision` (or immutable draft revisions) only in a later approved implementation. Do not put these workflow stages into `status` without confirming all current queries, indexes and active-policy selectors.

Activation must require `reviewState: ready_for_activation`, current approval events bound to the current content checksum, a still-valid reviewer qualification, a current decision/readiness checklist, and the already-tested Store/leave-type guard transaction. The activation transaction must persist the active snapshot and the final activation event atomically. The service should accept verified event identifiers/state rather than caller-supplied approval identities alone. No policy approval or activation is performed by this design task.

## 3. Reviewer qualification source

Create a centrally controlled, Store-scoped reviewer registry in a future batch (for example, `LeavePolicyReviewerCredential` plus append-only registry events). Do not treat `manager`, `HR`, `Finance`, `admin`, `store_owner`, or a `leave.approve` permission as a professional credential.

Suggested credential record:

- Reviewer account ID and Store scope(s); `active`, `suspended`, `revoked`, or `expired` state.
- Professional qualification category and review scope (statutory interpretation, employer leave policy, payroll unit conversion, and/or specified leave types).
- Credential issuer/type, protected credential identifier, secure evidence reference, verification source and verification timestamp.
- `validFrom`, `validThrough`, verified-by actor, revocation reason/reference and status history.
- Minimum necessary metadata in ordinary queries; credential documents and identifiers stay in private encrypted storage and are never copied to the policy or activity-log display payload.

The reviewer verifier must query this trusted registry server-side and require active, non-revoked qualification covering the policy's Store, decision scope, and relevant effective period. It must return a verified qualification record ID/reference that is persisted in the decision event and final activation evidence. A client-provided `verified: true`, URL, title, permission, or reviewer name is not evidence. Registry entry and qualification verification require an independently authorized reviewer/registry administrator, evidence, audit event, expiry monitoring, and revocation handling. Finance may not register, qualify, or self-approve its own review authority. Whether external professionals receive limited Pawzzle accounts, whether a central compliance account can review several Stores, and who operates/attests the registry are product/security decisions still required.

## 4. Approval audit model

Add a policy-specific append-only `LeavePolicyApprovalEvent` (name illustrative) rather than overwriting approval fields. Each event should contain:

- Store, `LeavePolicyVersion` ID, version and content revision.
- Event type/decision: submitted, changes requested, compliance approved/rejected, Owner/Admin approved/rejected, withdrawn, ready check passed/failed, activated, superseded/revoked.
- Actor ID, actor's effective role/authority snapshot, timestamp and request/correlation ID.
- Policy checksum and source-reference checksum at decision time; explicit effective date where relevant.
- For professional review: reviewer ID, qualification-registry record ID, verified scope and validity, evidence reference, and reviewer-verification result/version.
- Decision reason/comments with privacy limits; request-change/rejection reasons must be retained without exposing unrelated employee leave reasons or attachments.
- Idempotency key and optional `supersedesEvent`/`reversesEvent` relation for correction events.
- Optional previous-event hash/current event hash for tamper evidence, with signing/key governance decided separately.

Require a unique idempotency index for event key and indexes for Store + policy + sequence/time. Writers append; application paths cannot update/delete an event. Persist each state transition and its corresponding `ActivityLog` summary in the same MongoDB transaction. Log policy IDs, decision/checksum references, actor, Store and outcome—not reviewer document contents or sensitive credential identifiers. Restrict raw database write privileges: Mongoose middleware alone cannot prevent privileged raw-driver, bulk, or administrative database mutations.

Policy edits must create a new content revision/checksum. Every event records that checksum; submission, reviewer decision, Owner/Admin approval, and activation are usable only if their checksums match the current version. A prior review remains visible as a historical event but is stale for current activation. Active snapshots remain immutable; correction or supersession creates a new version/event, never a rewrite of the prior snapshot.

## 5. Proposed API and authorization plan (not implemented)

All endpoints should be authenticated, Store-scoped from the authenticated account and authorized backend context, and should query by both resource ID and Store ID. Never trust a Store ID, actor ID, permission, reviewer qualification, checksum, or approval state supplied by the browser. Platform Super Admin access should not imply authority to approve a Store's employment policy unless separately established by product/legal policy.

| Endpoint (proposed) | Purpose | Minimum server-side authorization and checks |
|---|---|---|
| `GET /hr/leave-policies` | List draft/history and source metadata for a Store | Store Owner/Admin; proposed `leave.policy.view`; Store scope. No reviewer documents. Employee-facing effective-policy display is a later separate read-only projection. |
| `GET /hr/leave-policies/:id` | Inspect one policy and current readiness | Owner/Admin `leave.policy.view`; Store-scoped lookup; redact private reviewer evidence. |
| `GET /hr/leave-policies/:id/history` | Read decision and revision events | Store Owner/Admin `leave.policy.view`; optionally the specifically assigned reviewer for its assigned review. Store-scoped event queries. |
| `POST /hr/leave-policies` | Create an inactive draft | Store Owner/Admin `leave.policy.manage`; force Store from authenticated context and `status: draft`; validate stable type/scope and reject client-supplied approval fields. |
| `PATCH /hr/leave-policies/:id` | Edit draft only | Store Owner/Admin `leave.policy.manage`; only draft revisions; immutable fields protected; increment revision/checksum and stale prior decisions atomically. No active edits. |
| `POST /hr/leave-policies/:id/submit` | Submit frozen revision for review | Store Owner/Admin `leave.policy.manage`; readiness precheck and checksum snapshot; conditional draft-to-submitted transition plus audit event. |
| `POST /hr/leave-policies/:id/compliance-review` | Approve, reject or request changes | Authenticated reviewer with narrow `leave.policy.review` authority plus active registry qualification covering Store/scope/date; reviewer distinct from Owner/Admin approver; decision reason required; checksum must match submitted revision. Finance role is denied regardless of custom permissions. |
| `POST /hr/leave-policies/:id/owner-approval` | Record business approval | Store Owner/Admin with `leave.policy.approve`; not Finance; not compliance reviewer; current compliance decision and same checksum required; decision record and audit event are atomic. |
| `POST /hr/leave-policies/:id/activate` | Activate approved version | Store Owner/Admin with `leave.policy.activate`; require `ready_for_activation`, complete current evidence, current qualification, explicit effective date and no unresolved readiness blockers; controller invokes the transaction-safe service with server-verified event IDs. No bypass endpoint. |

Permissions above are proposed names, not current grants. Add least-privilege role definitions and tests before any routes. Middleware `requirePermission` is necessary but insufficient: each controller must additionally enforce Store Owner/Admin or verified reviewer role, Store scope, workflow state, actor independence and self-dealing constraints. Do not grant these permissions to Finance or Managers by default. Any exception requires explicit policy approval and audit requirements.

## 6. Decision readiness by stage

The complete pending decision register is `docs/FINANCE_BATCH_4C_LEAVE_POLICY_APPROVAL_PACKAGE.md` (LP-01 through LP-22). None is approved by this design. “Resolved” below means a written decision for the applicable Store/employee category/policy; a decision may explicitly mark a feature out of scope rather than inventing a rule.

| Gate | Decisions/evidence required |
|---|---|
| Submission | LP-01–LP-05 (SIL coverage/exceptions, leave type classification/additive treatment, employee eligibility); LP-06–LP-13 (leave year, accrual, minute basis, schedules, half days, holidays/rest days, carryover and expiry); LP-14–LP-20 (opening balances, adjustments, termination, encashment, reservation/consumption, historical balances, effective dates); LP-21 insufficient-balance handling. LP-22 is explicitly marked “not in scope” until separate payroll approval. Attach authoritative sources, policy text, covered Store/classes, dates, and decision records. |
| Compliance review | Verify LP-01–LP-05 and LP-07–LP-13 against applicable current legal sources and classification; confirm any exception and whether benefits satisfy or add to statutory obligations; verify LP-16–LP-17 treatment; reviewer qualification must be active for scope and effective period. |
| Owner/Admin approval | Confirm the business choices LP-06–LP-21, operational capacity, employee communication, transition/opening-balance evidence, correction process and explicit effective dates. Separate business sign-off from professional review; LP-22 remains blocked/out of scope. |
| Activation | All applicable preceding gates signed for the exact checksum; source references/effective period complete; no contradictory active scope/date; explicit effective date; reviewer qualification remains current; immutable snapshot and audit writes succeed in one transaction. This enables policy status only, not credits. |
| First accrual/opening balance | Separately approve LP-07–LP-09, LP-12–LP-15, LP-19–LP-20 and LP-21; define schedule snapshots, exact integer-minute calculation, idempotent accrual periods, source evidence and transaction/ledger reconciliation. No automatic SIL grant. |
| First consumption/reservation | Separately approve LP-08–LP-11, LP-15–LP-16, LP-18–LP-21; bind leave dates to effective policy and historical scheduled minutes, specify reservation/release/consumption and cancellation treatment, prevent negative balance and preserve immutable leave/payroll history. |

Sick leave, vacation leave, SIL, carryover, expiry, opening credits and encashment remain undecided. No five-day SIL entitlement or other balance may be inferred or auto-granted.

## 7. Threat analysis and controls

- **Cross-Store IDOR / spoofed Store:** derive Store from authenticated identity; query all records/events with Store ID; reject reassignment/missing Store; test cross-Store list, inspect, review and activation denials.
- **Privilege escalation / Finance self-approval:** use role plus effective permission checks server-side; Finance cannot draft-review-approve-activate its own policy by custom permissions; reviewer and Owner/Admin decisions must be distinct. No permission based on button visibility.
- **False or expired credentials:** registry verification must be server-side, scope/date-specific and revocable; re-check at review and activation; persist the verifier result/reference; fail closed if registry is missing/unavailable/expired.
- **Stale or edited policy after approval:** checksum every revision and decision; conditional state transitions require current checksum; any edit stales earlier approvals; active snapshot cannot be changed through supported model paths.
- **Concurrent overlapping policy activation:** retain the existing Store/leave-type guard transaction, interval/scope recheck and conditional draft claim; test concurrent Store-wide versus category-scoped activations and disjoint periods.
- **Replay/duplicate decision:** unique idempotency key, actor/resource/state/checksum-bound events and conditional state updates; duplicate exact retries return prior result without duplicate history.
- **Forged sources or backdating:** require HTTPS source metadata and authoritative source review; explicit effective date and independent legal review; record source digest; retroactive effect needs specific documented approval, not merely an old effective date.
- **Sensitive credential/reason leakage:** private document store, least-privilege reviewer access, redacted API projections, no credential contents in ActivityLog or ordinary policy listing.
- **Audit tampering:** append-only application event model and transactional ActivityLog; least-privilege database roles and backups; Mongoose hooks do not stop raw database writes, so do not claim absolute immutability without database/operational controls.
- **Partial state transition:** policy revision, approval event, audit event, and activation must commit transactionally; if MongoDB transactions are unavailable, fail closed and do not create a partial approval/activation.

## 8. Implementation phases and acceptance tests

1. **Policy decision/sign-off:** resolve applicable LP decisions and retain Owner/Admin plus professional evidence. No runtime change. Tests: validate decision package completeness and checksum inputs.
2. **Reviewer registry and approval event models:** privacy-protected qualification records, revocation/expiry history, append-only policy event model, unique idempotency indexes. Tests: independent verification, expired/revoked/out-of-scope credential, no Finance/custom-permission escalation, append-only enforcement, redaction and Store isolation.
3. **Draft/revision and review services:** explicit review state, revision/checksum freeze, submission, request-change/reject, compliance review, Owner/Admin decision; transactional audit events. Tests: allowed/denied state matrix, changed-checksum invalidation, distinct actors, duplicate replay, concurrent decision, rollback on audit failure.
4. **Read-only API/UI:** Store-scoped list/detail/history, draft editor, checklist readiness display and separate review panels. Tests: backend endpoint authorization/IDOR and UI permission states; no credential documents in responses.
5. **Activation integration:** only `ready_for_activation` is accepted; re-check evidence/qualification and call `activateLeavePolicyVersion`; approval event, immutable snapshot and audit event in one transaction. Tests: overlapping concurrency (including Store/category scopes), disjoint dates, approval revoke/expiry race, rollback, idempotent retry, no direct endpoint bypass, history/snapshot immutability. No public route before these pass.
6. **Credit writer readiness (future, separately approved):** only after policy sign-off; add transactional idempotent opening/accrual writers, then reservation/release/consumption integration. Tests: exact-minute schedule conversion, duplicate accrual, concurrent reservations, cancellation/reversal, reconciliation, negative-balance prevention, legacy compatibility. This document does not authorize those writes.

All database concurrency tests use a dedicated transaction-capable isolated MongoDB replica set and synthetic fixtures. Historical leave requests, attendance, paid/unpaid snapshots, payroll revisions, finalized payroll, payment confirmation, and Batch 3's fail-closed statutory gate must remain unchanged.

## 9. Current behavior and operational boundary

No route/UI exposes policy drafting, review, approval or activation today. The internal transaction-safe activation service exists but does not implement the staged approval workflow in this document. Do not call it for live Store policies until a verified reviewer registry, persisted approval-event state machine, decision sign-off, Store-scoped API authorization and transactional audit integration exist. No credits or payroll effects are enabled; existing leave paid/unpaid snapshots, attendance and payroll revision safeguards remain separate.

## 10. Batch 4C.2C implementation status (inactive foundation)

This section describes backend-only workflow infrastructure added after the design above. It does not approve a Store policy, activate one, grant credits, or connect leave balances to payroll.

- `LeavePolicyVersion.reviewState` is separate from runtime `status`. New versions must be inactive `status: draft`, `reviewState: draft`, revision 1. Review states are service-managed; ordinary updates to existing drafts are rejected. Revisions increment `contentRevision`, return the draft to `draft`, and preserve old events as checksum-stale history.
- `LeavePolicyReviewerQualification` is Store-scoped and defaults to `pending`. Registration is Owner/Admin-controlled and stores only an opaque protected evidence reference. Verification uses an internal trusted verifier callback, requires a different Store Owner/Admin, writes a qualification event, and keeps evidence fields excluded from ordinary selection. Verified qualifications can be revoked with a reason; review actions transactionally claim a qualification revision so revocation and review cannot both commit on stale state. There is no route to register or verify qualifications and no credential-verification provider has been configured.
- `LeavePolicyDecision` and `LeavePolicyReviewerQualificationEvent` are append-only through supported Mongoose paths. Workflow services append them using an internal capability; direct ordinary inserts of policy decisions and qualification events are rejected. Event idempotency is unique per Store. Protected evidence references are excluded from ordinary query results. Database administrators/raw-driver access can still bypass Mongoose middleware; operational DB privileges and backups remain necessary.
- `leavePolicyApprovalWorkflowService` implements Store-scoped draft creation/revision, submission, changes requested, compliance review, Owner/Admin approval or rejection, withdrawal, qualification registration/verification/revocation, LP-01..LP-22 dispositions, and a read-only readiness evaluator. Every state/event/audit write runs in a MongoDB transaction; conditional workflow revisions serialize competing transitions. Finance is denied even with custom permissions; a Manager's `leave.approve` is not enough for policy Owner/Admin actions. Compliance and business approvers must be distinct.
- Readiness returns `not_ready` unless the current checksum/revision has submission, currently valid scoped qualification evidence for compliance review and each LP decision, distinct Owner/Admin approval, a complete source reference, matching effective date, and all 22 current documented `approved`/`not_applicable` decisions. Its positive result is named `ready_for_activation_review`; it is computed, not persisted, and does not call activation.
- No public route, UI, policy activation, leave accrual, reservation/consumption, balance display, or payroll integration was added. All LP decisions remain pending for real Stores. The pre-existing internal `activateLeavePolicyVersion` service is not wired to this evidence/readiness state machine; it must not be exposed or used on real policies until a separately reviewed integration makes it consume these persisted approvals atomically. The new workflow therefore is not a production policy-activation authorization boundary yet.

Verification for this foundation: 16/16 focused leave-credit/workflow unit tests passed; 3/3 isolated MongoDB replica-set suites passed (workflow approval race/rollback, prior leave-credit persistence, and existing leave transaction regression). The test replica set was loopback-only (`pawzzleTestRS`, port 27018), and fixtures were synthetic with randomized collections. No production data was read or written. Policy and credit activation remain unperformed. LP-01 through LP-22 remain `PENDING`; qualified Philippine labor/payroll review and Owner/Admin sign-off are still required.
