# Finance Batch 4B — Leave Workflow Foundation

This batch strengthens the existing leave-request workflow only. It does not add leave credits, accrual, encashment, salary deductions, statutory calculations, or payroll approval overrides.

## Lifecycle and transactions

- Submission validates the assigned Store employee and continuous employment coverage over the entire requested civil-date range. Dates are not shortened to fit an employment interval.
- An exact active duplicate submission is idempotent. The leave policy's explicit paid/unpaid value is snapshotted on the request; a missing Store policy value blocks new submissions.
- Submission, request audit, and per-day overlap claims are committed together.
- Approval/rejection claims the pending state, revalidates Store/employment/overlap, and (for approval) writes the employee schedule and reversible attendance overlays in one MongoDB transaction. Rejection releases claims in that transaction.
- `LeaveOverlapClaim` has a unique `(store, employee, workDate)` index. Claims remain for pending, approved, and cancellation-requested leave; rejection, immediate pending cancellation, and confirmed cancellation release them. This also serializes new requests against one another. A range is limited to 3,660 civil days to bound reservation work.
- Legacy pending, approved, and cancellation-requested requests created before this index are still checked by date-range queries during new submission and approval. `reconcileLegacyLeaveClaims` supports Store-scoped dry-run reporting and optional transactional backfill. Overlapping active requests, invalid ranges, and orphan claims are reported for manual resolution; they are never auto-approved/rejected/deleted, and conflicting requests receive no competing claims. Repeated dry-runs/backfills are idempotent. No backfill was run against live data.
- Notifications are sent only after transaction commit. Delivery is best-effort; failure is logged and does not turn a committed request/decision into an apparent API failure. The database request, schedule, attendance, and audit remain authoritative. No transactional outbox is introduced in this batch.

## Approved cancellation

- Employees can cancel their own pending request immediately. For an approved request they can only request cancellation; the Store reviewer must confirm or decline it.
- Confirmed cancellation releases the overlap claims, removes the linked schedule entry, and reverses only attendance records with known reversible provenance. A changed or previously corrected/reviewed attendance row, a legacy ambiguous `on_leave` row, or recorded work punches blocks reversal for authorized attendance correction/review.
- Cancellation is blocked if the employee has a payslip in an overlapping `approved` or `paid` payroll period. Draft computed/reviewed payroll with a payslip is marked for recomputation; `reviewed` returns to `computed`. No finalized payslip or payroll amount is mutated.
- Cancellation, review decision, and audit writes are transactional. A rejected cancellation request returns the leave to `approved` and retains its claims/schedule.

## Access and privacy

- `/me/leaves` and `/me/leaves/:id/cancel` derive the employee ID from the authenticated user. Store list/review routes resolve the caller's authorized Store and query within that Store.
- Store reviewers with `leave.approve` can receive leave reasons and review notes needed for review. Finance users remain restricted to redacted leave projections even if assigned `leave.approve`; attachment URLs are omitted from all Store list/review responses. Employee self-service remains self-only.
- A Finance account may submit a self-service cancellation request, but a Finance user cannot decide their own request. This preserves employee self-service without permitting self-approval.
- Newly approved schedule entries store dates and request identity, not the sensitive free-text reason.

## Compatibility and limitations

- Existing approved leave and historical request records are not rewritten. Legacy attendance rows with no reversal provenance are intentionally not guessed at during cancellation.
- The existing `isPaid` request snapshot remains the only paid/unpaid input used by attendance/payroll summaries. This batch does not grant statutory or employer leave entitlements and does not modify payroll calculations, finalized payroll, or Batch 3's fail-closed statutory readiness gate.
- Transactional guarantees require a MongoDB deployment supporting transactions. Pure and static tests run without MongoDB; integration verification is skipped unless `MONGODB_TRANSACTION_TEST_URI` points to an isolated transaction-capable test database. Do not point that variable at production.
