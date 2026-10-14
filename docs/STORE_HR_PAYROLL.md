# Pawzzle Store HR and Payroll

Pawzzle's Store HR module is deliberately scoped to Store employees. It adds attendance, leave requests, payroll periods, payroll review, manual salary-payment records, and employee payslips without becoming a statutory payroll or banking system.

## Authority and tenant boundaries

- The backend resolves the Store from the authenticated user. Non-platform users cannot select another Store by changing a request value.
- Staff self-service routes derive the employee ID from the authenticated account.
- Store Owners/Admins can configure policy, manage compensation, approve payroll, prepare external payment records, and independently confirm payments for other employees.
- Finance Staff can view compensation and same-Store attendance, prepare/review payroll, and record external payment attempts for another employee. `payroll_payment.confirm` is not part of the Finance default; a Store Owner may delegate it through the Store role-permissions matrix.
- Finance Staff cannot change their own employment/compensation, adjust their own payslip, review a period containing their salary, prepare or modify their own payment, or confirm their own payment. Store Owner/Admin retains the existing authority to record payroll that includes their own salary; this is audited and does not extend to Finance Staff.
- Managers receive attendance visibility, attendance-exception review, and leave approval, but no salary access by default.
- Employees see only their own finalized payslips.

## Attendance

Time In and Time Out use the server timestamp. The browser supplies current coordinates and optional accuracy; the backend validates them and computes Haversine distance from the Store's saved map coordinates. The Store controls radius, accuracy threshold, and whether an invalid location is rejected or retained as a flagged exception.

Schedules come from the employee professional availability schedule when one exists, otherwise from Store defaults. Manual corrections append original value, corrected value, reason, actor, and timestamp rather than erasing the prior value.

Time In is admitted only inside the employee's server-evaluated schedule window. Stores may configure minutes before and after shift start; legacy Stores use their existing grace-period value until explicit window values are saved. Overnight shifts use the following calendar day's end boundary.

When Store policy retains an out-of-area or low-accuracy punch, the employee must provide a reason. Pawzzle preserves the original punch evidence and creates a Pending location review. An authorized same-Store reviewer can approve or reject it, cannot review their own exception, and every decision is retained in the review history. Rejected or pending exceptions remain ineligible for payroll review.

Automatic clock-out is opt-in per Store and has no implicit twelve-hour rule. A Store Owner must configure a maximum shift duration. The retry-safe background sweep closes only still-open records, records the configured duration and generated timestamp, notifies the employee and reviewers, and leaves the record Pending until approved or corrected.

GPS is evidence, not proof against spoofing. Pawzzle records accuracy, distance, basic request metadata, duplicates, invalid sequences, and correction history for review.

## Leave and specialist availability

The Store policy determines whether a leave type is paid. Employees cannot set this value. Approval creates `On Leave` attendance records for scheduled days and adds the approved interval to the existing professional leave schedule, so specialist assignment continues using its established availability checks.

Legacy professional leave blocks do not say whether leave was paid. Payroll therefore does not silently deduct or pay them; they are reported as unclassified days requiring HR review.

## Payroll

The Store configures weekly, fixed semi-monthly, or monthly cutoffs. A payroll period moves through Draft, Computed, Reviewed, Approved, and Paid. Computation is blocked until its attendance period ends.

Each payslip snapshots compensation, attendance totals, additions, deductions, and the Store policy. Approved/finalized periods cannot be recomputed, so later rate or policy changes do not rewrite history. Internal rider earnings can be claimed once either by payroll or the existing rider-payout process.

Compensation revisions are effective-dated. A payroll period uses each revision only for the employment dates it covers. Monthly salary is normalized to one monthly amount for monthly payroll, one half for each semi-monthly period, or twelve fifty-seconds for a weekly period. Salary is prorated by eligible scheduled workdays when employment starts or ends inside the period. Daily rates pay present plus approved paid-leave days; hourly rates pay approved worked minutes plus the Store default-shift minutes for approved paid leave. Existing `salary` records without an explicit basis retain their prior one-amount-per-payroll-period meaning as `legacy_period` and create a review notice; Pawzzle never guesses that they are monthly.

Employment start and end dates bound payroll participation. Prior compensation and closed employment intervals remain in history for unfinalized historical recomputation, while a finalized payslip remains the immutable record of what was approved and paid.

Pending/rejected location reviews and pending/rejected auto clock-outs do not contribute approved worked time. They create blocking payroll issues; payroll must be recomputed after the attendance exception is resolved before it can move to Reviewed.

Approved payroll is paid per employee, not as one all-or-nothing Store transfer. Finance records an external payment as Processing or submits it For Confirmation after the transfer is reported complete; Pawzzle never initiates a transfer. An authorized Store Owner/Admin confirms the protected evidence before that employee's payslip becomes finalized and visible. Store Owners/Admins retain the established payroll authority, including recording their own salary; Finance users remain unable to prepare, alter, review, or confirm their own salary. Failed transfers can be retried as a new linked attempt; On Hold attempts must be deliberately resumed or failed. The Store payroll period becomes Paid only when every employee payslip in that period is confirmed.

Payment state changes, the payslip state, Rider earning settlement, period completion summary, audit entry, and employee notification are committed in one MongoDB transaction. State claims and unique active-attempt/idempotency/reference indexes prevent concurrent duplicate processing. Legacy approved/paid snapshots remain unchanged; the old period-wide “record Paid” endpoint now returns a conflict rather than falsely marking every employee paid from one reference.

External transfer references, payment destinations, and uploaded proofs are encrypted with AES-256-GCM before storage. The backend must have `PAYROLL_DATA_ENCRYPTION_KEY` configured as a managed 32-byte key (64 hexadecimal characters or base64 encoding of 32 bytes) in its secret manager before staff may record payment details. Do not put the key in source control, browser configuration, logs, or ordinary environment files. Payment references and destination accounts are masked in the HR view. Protected proof downloads require a same-Store payroll payment permission and are returned with no-store headers. No migration is performed on historical payment data.

## Explicitly outside scope

Pawzzle does not fabricate Philippine income tax, SSS, PhilHealth, Pag-IBIG, legal leave entitlement balances, or bank-disbursement results. Those require verified legal rules and/or a real payroll payment integration before implementation.
