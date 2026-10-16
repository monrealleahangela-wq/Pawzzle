# Finance Batch 4B — Release Gate Assessment and Approval Package

**Decision state: PENDING — not approved for release.**

**Candidate:** isolated detached worktree based on `1c3d91715488ebd7b5bbe3dc63229e3fed09fdc7`.

**Assessment date:** 2026-10-14.
This document records engineering evidence and decisions that authorized owners and reviewers must make. It is not a deployment authorization, statutory compliance opinion, or evidence of live deployment state.

## 1. Engineering evidence and worktree identity

The source checkout is `main` at `1c3d917` (`main...origin/main`). It has 61 unstaged paths (15 modified tracked, 46 untracked), none staged. The source checkout was not edited by this assessment. The isolated candidate is detached at the same full baseline SHA and has 22 unstaged paths (13 modified tracked, 9 untracked), none staged. The candidate inventory is the Batch 4B workbench plus its existing candidate report; this package is a new tenth untracked candidate document. Both worktrees pass `git diff --check`; Git emits LF-to-CRLF advisory messages only.

The candidate includes the focused B4B leave lifecycle, attendance provenance, and payroll input-revision coordination. The candidate report records prior verification: isolated replica-set transaction suite 1/1 passed, backend focused regressions 65/65 passed, backend/test syntax 15/15 passed, frontend HR tests 2 suites / 8 tests passed, and a non-strict production build compiled successfully with warnings. These are reported historical results, not rerun in this assessment. No browser-level verification, production/staging database reconciliation, or live Render deployment verification has been performed.

### Strict build and lint inventory

The candidate report records a strict `CI=true` production build failure: Create React App treats ESLint warnings as errors in CI. The compiler reported 77 warnings in 41 frontend files. The warnings comprise 31 `no-unused-vars`, 45 `react-hooks/exhaustive-deps`, and 1 `no-loop-func`; all are warning-severity findings elevated to build failure by CI mode. The warning-source files below are unchanged from the baseline in the candidate diff. Neither candidate-modified `HRManagement.js` nor `EmployeeHR.js` is a warning source. Therefore the available evidence attributes none of the 77 strict-build warnings to Batch 4B.

| File | Warning rule(s) and count | Severity / baseline | Potential runtime impact |
|---|---|---|---|
| `client/src/components/CustomerQuickViewModal.js` | `no-unused-vars` 1; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Unused binding usually has no runtime effect; missing dependency can cause stale UI/state. |
| `client/src/components/EnhancedChatMessenger.js` | `react-hooks/exhaustive-deps` 2 | Warning; unchanged baseline | Effect may use stale values or fail to refresh when dependencies change; inspect behavior. |
| `client/src/components/FloatingChatManager.js` | `no-unused-vars` 4; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Unused bindings usually neutral; effect dependency can cause stale state or missed updates. |
| `client/src/components/GoogleMap.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Map effect may not refresh for changed inputs. |
| `client/src/components/LoginModal.js` | `no-unused-vars` 1 | Warning; unchanged baseline | Usually no runtime effect; verify the unused binding is not evidence of incomplete logic. |
| `client/src/components/OrderReviewModal.js` | `no-unused-vars` 1 | Warning; unchanged baseline | Usually no runtime effect; verify intended review path independently. |
| `client/src/components/booking/ServiceCommunicationPanel.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Messaging effect may retain stale inputs; warrants a focused behavioral review. |
| `client/src/contexts/AuthContext.js` | `no-unused-vars` 1; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Unused binding usually neutral; auth effect dependency risk merits focused review. |
| `client/src/contexts/CartContext.js` | `react-hooks/exhaustive-deps` 2 | Warning; unchanged baseline | Cart effects may use stale state or miss a recalculation. |
| `client/src/pages/admin/DSS.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Recommendation effect may use stale filters/answers. |
| `client/src/pages/admin/Orders.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Orders effect may miss changed query inputs. |
| `client/src/pages/admin/Payouts.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Payout view may not refresh for changed inputs; not evidence of payment processing. |
| `client/src/pages/admin/Pets.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Pet list effect may use stale filters. |
| `client/src/pages/admin/ProductInventory.js` | `react-hooks/exhaustive-deps` 2 | Warning; unchanged baseline | Inventory effects may not refresh for changed dependencies. |
| `client/src/pages/admin/RoleManagement.js` | `react-hooks/exhaustive-deps` 2 | Warning; unchanged baseline | Permission UI effects may use stale role data; server authorization remains authoritative. |
| `client/src/pages/admin/ServiceManagement.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Service view may not refresh for changed inputs. |
| `client/src/pages/admin/StoreApplications.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Application list effect may retain stale filters. |
| `client/src/pages/admin/StoreManagement.js` | `no-unused-vars` 1 | Warning; unchanged baseline | Usually no runtime effect; verify the intended Store flow. |
| `client/src/pages/admin/SupplyManagement.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Supply view may not refresh for changed inputs. |
| `client/src/pages/admin/Users.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | User list effect may retain stale filters. |
| `client/src/pages/auth/OAuthCallback.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Callback effect dependency risk; verify authentication behavior in a separate auth review. |
| `client/src/pages/auth/Register.js` | `no-unused-vars` 3 | Warning; unchanged baseline | Usually no runtime effect; verify registration validation and submission paths. |
| `client/src/pages/customer/Adoptions.js` | `no-unused-vars` 1 | Warning; unchanged baseline | Usually no runtime effect. |
| `client/src/pages/customer/Bookings.js` | `no-loop-func` 1; `no-unused-vars` 6; `react-hooks/exhaustive-deps` 2 | Warning; unchanged baseline | Loop closure may capture unexpected values; hook dependencies can stale booking state. Review before relying on affected UI. |
| `client/src/pages/customer/Cart.js` | `no-unused-vars` 2; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Unused bindings usually neutral; cart effect may use stale state. |
| `client/src/pages/customer/Checkout.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Checkout effect may not refresh for changed inputs. |
| `client/src/pages/customer/FindShops.js` | `react-hooks/exhaustive-deps` 3 | Warning; unchanged baseline | Search/location effects may retain stale values; verify search behavior separately. |
| `client/src/pages/customer/OrderDetail.js` | `react-hooks/exhaustive-deps` 2 | Warning; unchanged baseline | Order detail effects may miss changes. |
| `client/src/pages/customer/Orders.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Order list effect may retain stale inputs. |
| `client/src/pages/customer/Pets.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Pet list effect may retain stale inputs. |
| `client/src/pages/customer/ProductDetail.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Detail effect may not refresh for changed product inputs. |
| `client/src/pages/customer/Products.js` | `no-unused-vars` 1; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Usually neutral unused binding; filtering effect may be stale. |
| `client/src/pages/customer/Profile.js` | `no-unused-vars` 2; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Usually neutral unused bindings; profile effect may use stale inputs. |
| `client/src/pages/customer/Services.js` | `no-unused-vars` 1; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Usually neutral unused binding; service effect may be stale. |
| `client/src/pages/customer/StoreDetail.js` | `no-unused-vars` 1; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Usually neutral unused binding; Store effect may be stale. |
| `client/src/pages/shared/ChatManagement.js` | `no-unused-vars` 1; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Usually neutral unused binding; chat effect may retain stale data. |
| `client/src/pages/shared/ChatWindow.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Chat effect may not refresh for changed conversation state. |
| `client/src/pages/storeOwner/StoreApplication.js` | `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Application effect may use stale inputs. |
| `client/src/pages/superadmin/AccountManagement.js` | `no-unused-vars` 2; `react-hooks/exhaustive-deps` 2 | Warning; unchanged baseline | Permission/account effects may retain stale values; review separately. |
| `client/src/pages/superadmin/ArchiveManagement.js` | `no-unused-vars` 1; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Usually neutral unused binding; archive effect may be stale. |
| `client/src/pages/superadmin/SupplierManagement.js` | `no-unused-vars` 1; `react-hooks/exhaustive-deps` 1 | Warning; unchanged baseline | Usually neutral unused binding; supplier effect may be stale. |

The strict-build numbers above are from the recorded CI build. A separate read-only ESLint scan of all candidate `src` files during this assessment found 92 warnings in 49 files: 39 `no-unused-vars`, 48 `react-hooks/exhaustive-deps`, 3 `no-template-curly-in-string`, 1 `no-dupe-keys`, and 1 `no-loop-func`. This broader scan includes files not linted in the production build's compiled module graph and is not substituted for the strict-build inventory. It confirms the same categories and no warning in the two modified HR UI files. Because candidate dependencies are absent, the diagnostic scan resolved packages through the source dependency tree and ESLint noted React was not installed in the candidate resolution context; treat it only as supplemental classification, not an independent build. The CI build itself was not rerun because preserving the pre-existing candidate `client/build` and avoiding writes through a dependency link into the source checkout was safer than reconstructing its build environment. A clean-baseline build was therefore not independently rerun; baseline attribution relies on warning-file unchanged status and the candidate diff, not a fresh baseline build.

No separate project lint-waiver or warning-acceptance policy was found in the reviewed project docs/package configuration. `client/package.json` uses `react-app` / `react-app/jest` ESLint configuration and `react-scripts build`; standard `CI=true` warning promotion is the observed gate.

### CI policy decision options

| Option | Meaning | Release consequence |
|---|---|---|
| A — strict CI required | Require `CI=true` build success for every release. | Candidate remains blocked until baseline warnings are remediated in a separately scoped lint effort and strict build passes. |
| B — documented exception | Owner/release authority explicitly accepts a `CI=false` build for this candidate, with evidence that no candidate warnings were introduced and a time-bounded remediation ticket. | This is a policy exception, not a green strict build; it must name approver, scope, expiry/review date, and compensating checks. It is not granted by this package. |
| C — clear baseline lint debt first | Remediate and review all baseline warnings, then require strict CI. | Strongest repeatable gate, but broader than Batch 4B and requires its own tests/review. |

**Recommendation:** prefer A/C; do not silently waive strict CI. If product/release leadership chooses B, record explicit written approval before considering release. No option is selected here.

## 2. Payroll posture decision record — PENDING

The candidate is based on committed baseline `1c3d917`. That baseline includes existing Batch 1/2 compensation history, payroll review/finalization, and per-employee manual external-payment confirmation. It does **not** include the uncommitted Batch 3 statutory readiness gate/calculators. Batch 3 remains separate, incomplete, and compliance-blocked. This candidate does not include those incomplete modules, and its removal of a stale HR warning does not add statutory safeguards.

The candidate therefore retains the baseline ability to compute/review/approve payroll without verified SSS, PhilHealth, Pag-IBIG, or BIR calculations. This is a description of software behavior, not a claim that the behavior is legally compliant or authorized for the intended payroll periods. Government remittance, tax filing, and employer contribution remittance are not provided. Batch 2 records a reported external salary transfer and independent confirmation; Pawzzle does not initiate bank transfers. No payment should be marked paid without the existing authorized proof/confirmation path.

| Decision | Owner/Admin options | Recommendation / authority | Status |
|---|---|---|---|
| P-01 Payroll posture | (1) Defer release until a complete, legally reviewed statutory implementation exists; (2) explicitly accept this candidate's baseline non-statutory-computing posture for a limited release after qualified payroll/legal review and operational controls; (3) reject release. | Prefer (1) unless the Owner/Admin and a qualified Philippine payroll/legal professional document why option (2) is lawful and appropriate for each covered employee/payroll period. A committed baseline or passing tests do not provide that basis. | **PENDING** |
| P-02 CI gate | Choose A, B, or C above; if B, identify approver, allowed build mode, expiry, and remediation owner. | Prefer strict CI; no exception is implied. | **PENDING** |
| P-03 Live deployment identity | Provide authorized evidence that the intended frontend and backend are on a known commit, and identify rollback target. | Verify in Render by a release operator; do not infer from `origin/main`. | **PENDING** |

### Salary payment and historical records

The committed Batch 2 design is per-employee external payment recording and independent confirmation; the encryption key `PAYROLL_DATA_ENCRYPTION_KEY` must be securely configured for protected payment details. A real disbursement provider is not part of this candidate. Legacy finalized/paid payroll snapshots are intended to remain immutable; do not retroactively add statutory values or recalculate finalized periods. Before release, verify the deployed Batch 2 key/configuration and data compatibility without disclosing the secret or accessing employee bank data in this review.

## 3. Legacy-data readiness checklist (no production access performed)

An authorized operator should execute a separately approved, read-only preflight against a protected, backed-up environment before scheduling any migration. This package does not authorize a production/staging query, index build, migration, or reconciliation.

1. Identify exact deployed commit, MongoDB topology/version, database name, backups/PITR status, and maintenance/rollback window. Stop if environment identity is ambiguous or database transactions are unavailable.
2. In a sanitized non-production clone, inventory LeaveRequests by Store/status/date and employment linkage; include `pending`, `approved`, and cancellation-requested states. Do not export leave reasons, attachments, or unnecessary personal data.
3. Run `reconcileLegacyLeaveClaims` with `apply:false`, Store-scoped (and employee-scoped where appropriate). Preserve its planned-claim, conflict, invalid-range, and orphan-claim report. Dry run is read-only. Resolve every overlapping active request, invalid range, and orphan claim through an authorized human review; never auto-approve, auto-reject, or discard requests.
4. Confirm a restorable backup, then review the unique `(store, employee, workDate)` `LeaveOverlapClaim` index build plan and duplicates. Stop if existing duplicate/conflicting claims prevent index creation. Do not drop records or bypass the unique index to force migration.
5. Have Store HR/Owner resolve conflicts under current policy, record decisions in normal review history, and rerun dry-run until no unresolved conflict remains. Only then request separate change approval for transaction-protected `apply:true` backfill. Repeated application should add no duplicate daily claims; retain before/after counts and logs without sensitive reasons.
6. Validate attendance provenance, current Store assignment, employment windows, `PayrollPeriod` input/computed revisions, pending/reviewed payroll, and finalized payroll. Stop if any reconciliation would require changing finalized payslips; use a separate authorized correction process.
7. Confirm transaction-capable MongoDB and required indexes before enabling writes. Review `LeaveOverlapClaim` unique index and existing PayrollPeriod unique `(store, periodStart, periodEnd)` index; verify application index initialization, lock/transaction behavior, and monitoring in the intended topology.
8. Preserve old/new code compatibility. If rollback occurs after claims are written, do not delete claims; pause leave mutations and reconcile them before re-enabling an older implementation that does not honor claims/revisions.

## 4. Deployment identity, environment, and rollback checklist

No Render access was used or authorized for this assessment. The deployed frontend/backend commits, current deployment status, and any rollback are **unknown**. The source branch being synchronized to `origin/main` is not deployment evidence. Before an approved release, the authorized release operator must record:

- Render frontend and backend service names/IDs, configured branch, latest successful deployment IDs, deployed commit SHAs, start/build commands, and proof both services contain the approved commit. Check for later rollback or failed deployment.
- Backend environment variable presence and secret-manager ownership for `PAYROLL_DATA_ENCRYPTION_KEY`; validate only presence/format in a controlled health/config check, never display, copy, generate, log, or commit the key. Batch 2 documentation requires 32 bytes: 64 hexadecimal characters or base64 encoding of 32 bytes. If absent/invalid, payment-detail recording must fail closed. Any environment change requires a controlled restart/redeploy by the release operator.
- The configured MongoDB service/topology supports multi-document transactions. Confirm the intended database identity, indexes, backup/PITR and recovery procedure through approved operations; do not use production data in tests.
- Frontend/backend API compatibility for routes and payloads, and that both services deploy from the same intended release candidate.
- Existing historical finalized payroll remains readable and unchanged; no migration mutates prior amounts, statuses, payment attempts, or payslips.
- The verified prior production commit (not assumed to be `1c3d917`) and a tested operational rollback plan. Rollback must preserve new leave requests/claims and payroll revisions, suspend conflicting writes if the old code cannot coordinate them, and include a controlled reconciliation before writes resume. A code rollback does not reverse database writes or indexes.
- Post-deployment monitoring and an owner for leave-request, overlap-claim, payroll recomputation, transaction, payment-confirmation, and notification failures. No actual salary payment is part of release verification.

## 5. Candidate metadata anomaly

`services/attendanceAutomationService.js` is reported `M` in candidate status, but the recorded read-only diagnostics found its worktree blob hash identical to HEAD (`11895a3e1cc2603d1adc015901798da3cfe0fe03`), empty text/raw diff, mode `100644`, LF line endings in index and worktree, and no relevant attributes. The cause is not established. A stale/racy Git stat-cache or filesystem metadata discrepancy is plausible, but not proven. Since content diff is empty, it contributes no patch content; it remains visible in status and must not be included in a staged change without a separate explanation. Do not normalize/rewrite it merely to clear status.

## 6. Release blockers and recommendation

The candidate is **not approved for production release**. Blocking items:

- Strict `CI=true` build fails on 77 baseline warnings. Resolve via the selected documented CI policy; do not suppress warnings or silently use a non-strict build.
- Owner/Admin payroll posture decision P-01 is pending. Batch 4B candidate excludes B3 and would retain baseline payroll approval without statutory calculation; this must not be represented as compliance.
- CI gate policy decision P-02 is pending.
- Frontend/backend Render deployment identity and rollback target are unverified; no live deployment claim is made.
- Browser-level verification is absent.
- Production legacy leave data/index readiness and approved dry-run reconciliation have not been performed; no production or staging records were accessed.
- Verify Batch 2 encryption configuration through authorized secret-manager procedures and verify the transaction-capable deployment database; neither is verified here.
- Investigate the status-only file anomaly without rewriting it if it remains relevant to final candidate assembly.

**Recommendation:** keep the candidate isolated and undeployed. First obtain written Owner/Admin and qualified payroll/legal review of P-01, decide and document P-02, remediate or explicitly resolve the strict-CI gate, then verify Render identity, database/index/legacy-data readiness, and browser workflows under a controlled release plan. No approval in this document may be treated as granted.

## 7. Approval form — all fields pending

| Required record | Approver / evidence | Status |
|---|---|---|
| Business scope and authorization for the payroll posture (P-01) | Pawzzle Owner/Admin; signed decision plus qualified Philippine payroll/accounting/legal assessment identifying covered payroll dates/employees | **PENDING** |
| CI policy selection (P-02) | Engineering/release owner and Owner/Admin; strict pass or explicit bounded exception record | **PENDING** |
| Legacy data/index readiness | Authorized database/release operator; dry-run report, conflict resolutions, backup/PITR confirmation, index and transaction preflight | **PENDING** |
| Encryption and service configuration | Authorized backend/Render operator; non-secret presence/format validation and successful controlled restart if changed | **PENDING** |
| Deployment identity and rollback | Authorized release operator; service IDs, commit SHAs, successful deployment evidence, prior commit and recovery plan | **PENDING** |
| Browser and post-deployment checks | Authorized tester; role-scoped leave/payroll scenarios and monitoring evidence; no fabricated assignments/payments | **PENDING** |
| Final release decision | Pawzzle Owner/Admin after all evidence above | **PENDING** |

No signatures, approvals, or live checks are represented as completed.
