# Pawzzle Store HR and Payroll

Pawzzle's Store HR module is deliberately scoped to Store employees. It adds attendance, leave requests, payroll periods, payroll review, manual salary-payment records, and employee payslips without becoming a statutory payroll or banking system.

## Authority and tenant boundaries

- The backend resolves the Store from the authenticated user. Non-platform users cannot select another Store by changing a request value.
- Staff self-service routes derive the employee ID from the authenticated account.
- Store Owners can configure policy, manage compensation, prepare, approve, and record payroll payment.
- Finance Staff can view compensation and same-Store attendance, prepare/review payroll, and record an approved payroll as paid. They do not receive final approval by default.
- Managers receive attendance visibility and leave approval, but no salary access by default.
- Employees see only their own finalized payslips.

## Attendance

Time In and Time Out use the server timestamp. The browser supplies current coordinates and optional accuracy; the backend validates them and computes Haversine distance from the Store's saved map coordinates. The Store controls radius, accuracy threshold, and whether an invalid location is rejected or retained as a flagged exception.

Schedules come from the employee professional availability schedule when one exists, otherwise from Store defaults. Manual corrections append original value, corrected value, reason, actor, and timestamp rather than erasing the prior value.

GPS is evidence, not proof against spoofing. Pawzzle records accuracy, distance, basic request metadata, duplicates, invalid sequences, and correction history for review.

## Leave and specialist availability

The Store policy determines whether a leave type is paid. Employees cannot set this value. Approval creates `On Leave` attendance records for scheduled days and adds the approved interval to the existing professional leave schedule, so specialist assignment continues using its established availability checks.

Legacy professional leave blocks do not say whether leave was paid. Payroll therefore does not silently deduct or pay them; they are reported as unclassified days requiring HR review.

## Payroll

The Store configures weekly, fixed semi-monthly, or monthly cutoffs. A payroll period moves through Draft, Computed, Reviewed, Approved, and Paid. Computation is blocked until its attendance period ends.

Each payslip snapshots compensation, attendance totals, additions, deductions, and the Store policy. Approved/finalized periods cannot be recomputed, so later rate or policy changes do not rewrite history. Internal rider earnings can be claimed once either by payroll or the existing rider-payout process.

`Recorded as Paid` means an authorized person recorded a salary payment completed outside Pawzzle. Pawzzle does not initiate a bank transfer.

## Explicitly outside scope

Pawzzle does not fabricate Philippine income tax, SSS, PhilHealth, Pag-IBIG, legal leave entitlement balances, or bank-disbursement results. Those require verified legal rules and/or a real payroll payment integration before implementation.
