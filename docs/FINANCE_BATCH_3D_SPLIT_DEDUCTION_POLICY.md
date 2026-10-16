# Finance Batch 3D — proposed monthly statutory split allocation

**Status: proposal only; not an approved payroll policy.** This document and the pure allocator are design artifacts. They do not connect statutory calculations to payroll, reserve deductions, activate statutory rules, change readiness, or write database records. Compliance approval and the existing fail-closed statutory readiness gate remain required.

Research date for the official operational guidance linked below: 2026-10-14. This is an engineering review, not a legal opinion. The product owner's preference to split a verified monthly employee contribution across eligible paychecks is a product preference, not a finding that any agency requires or expressly endorses equal paycheck installments.

## Repository flow and boundary

- `utils/hrPolicy.js` generates weekly, semi-monthly, and monthly payroll periods. Each has `periodStart`, `periodEnd`, and `payDate`; these dates do not necessarily belong to one calendar month. In particular, the semi-monthly second period commonly has a pay date in the next month, and monthly/weekly schedules may also cross a month boundary.
- `controllers/hrController.js` creates a Store-scoped draft period, computes employee payslips, records the statutory assessment, and refuses review/approval if readiness is not `ready` with an accepted verified snapshot. The current assessment is intentionally blocked; no allocator in this document changes it.
- `models/PayrollPeriod.js` has a Store/frequency/period/pay-date snapshot and a unique `{store, periodStart, periodEnd}` index. It has no monthly contribution-obligation ledger.
- `models/Payslip.js` has a unique `{payrollPeriod, employee}` index and stores the period's computed pay/deductions; it has no monthly obligation/allocation identity.
- `services/payrollPaymentWorkflowService.js` uses Mongo transactions for per-employee external payment recording/confirmation. That transaction boundary is not a statutory contribution ledger and does not cover government remittance.
- Standalone calculators and `utils/statutoryMonthlyAllocation.js` remain isolated. The latter validates a caller-supplied allocation total and protects finalized amounts during reconciliation; it does not select eligible paychecks, calculate a split, persist monthly obligations, or provide database concurrency control.

## Government obligation versus proposed payroll operation

The official agency materials located describe monthly obligations and remittance, but do not set a general rule that an employer must allocate an equal share to every weekly or semi-monthly paycheck. They do not by themselves settle the legal/payroll treatment of equal installments, mid-month hiring/separation, zero earnings, insufficient net earnings, paycheck-period assignment, or cross-month pay dates. Obtain written review from a qualified Philippine payroll/accounting/compliance professional, and agency clarification if needed, before activation.

| Agency | Official source and directly supported timing statement | What it does not settle for this proposal |
| --- | --- | --- |
| SSS | [SSS Employer duties](https://www.sss.gov.ph/employer-er/) says the employer deducts the employee share from salaries/wages and remits it with the employer share and EC under the prescribed schedule. [SSS Pay Contributions](https://www.sss.gov.ph/pay-contribution) describes monthly contributions and states the regular employer deadline as the last day of the month following the applicable month. [SSS Circular 2024-006 table](https://www.sss.gov.ph/wp-content/uploads/2024/12/CI-2024-006-Publication.pdf) is the current published contribution table used by the isolated SSS calculator. | No equal per-paycheck split mandate or explicit installment allocation permission was established by those pages. Obtain confirmation that the proposed withholding timing is consistent with the applicable employer obligations, salary deductions, member class, and the employee's actual monthly remuneration. Employer-only EC is never an employee deduction. |
| PhilHealth | [PhilHealth Employer Payment and Reporting Procedures](https://www.philhealth.gov.ph/partners/employers/pay_procedures.php) instructs employers to deduct the employee's monthly premium share from basic monthly salary and remit it with the employer share by the due date; the page provides monthly due-date windows based on the employer PEN. [Circular 2020-0005](https://www.philhealth.gov.ph/circulars/2020/circ2020-0005.pdf) governs the published premium schedule and remittance/reporting framework. | The retrieved employer page does not establish an equal allocation over individual checks or resolve all 2026 employed-member application details. The existing Batch 3 source review still requires the original first-party 2026 premium advisory and authorized confirmation before activating a 2026 PhilHealth rule. Monthly basic-salary base, covered member category, partial-month treatment, and check-level deduction timing require explicit review. |
| Pag-IBIG | Official [Circular 275 employer contribution/remittance guidelines](https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/HDMF%20Circular%20275%20-%20Implementing%20Guidelines%20on%20Employer%20Registration%20Contribution%20and%20Remittance.pdf) describes employer collection of monthly contributions by salary deduction, monthly remittance of employee and employer shares, and a due-date schedule in the following month. [Circular 460 government-hosted copy](https://wcms.dmw.gov.ph/uploads/DMW_ADVISORY_37_2025_01225b9fec.pdf) states its Pag-IBIG I contribution changes apply from February 2024 onwards; this is not the employer remittance circular. | The reviewed text does not prescribe equal paycheck installments. Confirm the employee/member category, fund salary, salary-deduction timing, handling of leave without pay/separation, and compatibility of the proposed split with applicable rules before activation. A government-hosted copy is available, but first-party Pag-IBIG confirmation remains a prudent legal review item. |

The agency deadlines are remittance deadlines; they are not evidence that Pawzzle has made or should make government remittances. Pawzzle's salary payment attempt workflow records external employee salary payments only. It must not represent contributions as remitted or taxes as filed.

## Proposed policy for compliance decision

If approved, calculate each employee's legally applicable monthly obligation separately for each agency and contribution month. Keep the employee share and employer liability separate. For an approved policy-defined set of eligible, not-yet-finalized paychecks, allocate the employee share evenly in integer centavos; distribute residual centavos one-by-one to the earliest eligible paycheck in a stable chronological ordering. Reconcile the sum to the monthly employee obligation. This is one operational option for approval, not an agency requirement.

Eligibility must be supplied by a separately approved agency-specific mapping policy. It must not be inferred merely from the pay date being in the contribution month, the work period overlapping the month, or the payroll frequency. Retain all three dates and the contribution month in the audit record. If no authorized mapping resolves a period, block instead of assigning it heuristically.

For an obligation of PHP 200.01 (20,001 centavos):

| Eligible checks, in stable order | Proposed employee deductions | Sum |
| --- | --- | --- |
| Four | PHP 50.01, PHP 50.00, PHP 50.00, PHP 50.00 | PHP 200.01 |
| Five | PHP 40.01, PHP 40.00, PHP 40.00, PHP 40.00, PHP 40.00 | PHP 200.01 |

For each set, `floor(totalCentavos / checkCount)` goes to every check and the remainder centavos go to the earliest rows. Order is ascending `payDate`, then `periodStart`, then immutable payroll period ID. All amounts are integer centavos, never accumulated binary floating-point money.

The isolated function in `utils/proposedStatutorySplitAllocator.js` prototypes this arithmetic only. The caller must explicitly pass `eligible: true` after an approved policy determination and validated non-negative deductible capacity. It rejects duplicate IDs, invalid dates/amounts, an unconfirmed eligible period, or any proposed installment greater than that paycheck's supplied capacity. It returns `proposal_only` and has no payroll/model imports or side effects. Capacity must itself be computed from legally supported take-home/payroll rules; the prototype is not authority to reduce deductions, create arrears, or make net pay negative.

### Edge cases requiring explicit policy

- **Four/five weekly checks or semi-monthly/monthly payroll:** split only across checks that the approved mapping explicitly includes. Do not assume count based on calendar labels. A semi-monthly or monthly configuration may have fewer eligible checks than an operational month; a monthly check may be paid after the contribution month.
- **Cross-month period/pay date:** retain contribution month, period start/end, and pay date independently. Until approved mapping resolves which check bears which month's obligation, block; overlap or pay-date month alone is not a safe rule.
- **Mid-month start or separation:** calculate the statutory obligation only under a verified agency-specific coverage/base/proration rule. SSS guidance notes employer EC obligation can end at the end of the month of separation/contingency; that EC statement must not be generalized to every agency/share. A missing effective employment interval blocks calculation; do not prorate at application discretion.
- **Zero/insufficient earnings:** block affected payroll with the exact shortfall. Do not make negative net pay, silently reduce the obligation, silently carry it to another month, or call it exempt. A professional-approved lawful recovery/remittance policy is needed.
- **Recompute before finalization:** recompute draft proposals idempotently from the current verified obligation and approved mapping. Persisted but unfinalized reservations may be replaced only in a transaction with audit history.
- **A new paycheck after one was finalized:** preserve every finalized payslip allocation. Allocate only outstanding obligation to remaining eligible/unfinalized checks. If there is no remaining eligible check, or proposed installments exceed capacity, block for a documented authorized adjustment. Never rebalance by rewriting a finalized/paid payslip.
- **Voided or corrected period:** reverse a reservation only in a transaction and only if it is not attached to a finalized payslip. If finalized, append an auditable adjustment/reversal linked to the original; never delete or mutate the original finalized allocation. Apply the adjustment only under approved policy and leave historical payslips unchanged.

## Ledger design (not implemented)

Prefer a monthly obligation document plus separate allocation documents so uniqueness and contention can be enforced per allocation rather than relying on uniqueness within an array:

**Monthly obligation** fields: `store`, `employee`, `agency`, `contributionMonth` (`YYYY-MM`), covered-category/classification snapshot and version, effective rule version and checksum, verified monthly base and inputs, employee obligation centavos, employer liability centavos, allocation policy version/checksum, currency, calculation checksum, state (`draft`, `reserved`, `finalized`, `reversed`, `adjusted`), outstanding employee centavos, monotonically increasing revision, timestamps, and actor/audit references. Keep employee identifiers out of routine logs and API projections.

**Allocation/event** fields: obligation ID, Store, employee, agency, contribution month, payroll period ID, payslip ID, period start/end, pay date, employee deduction centavos, employer share centavos (reporting only, never employee deduction), status (`reserved`, `finalized`, `reversed`, `adjusted`), idempotency key, allocation policy/rule/checksum snapshots, revision, created/finalized/reversed timestamps and actors, and reason/reference to any superseded event. Finalized events are append-only.

Suggested indexes:

- Unique monthly obligation: `{store: 1, employee: 1, agency: 1, contributionMonth: 1}`. A rule/classification change must create an audited revision/adjustment to this key, not a second silently competing obligation.
- Unique allocation per paycheck: `{store: 1, employee: 1, agency: 1, contributionMonth: 1, payrollPeriod: 1}`. If the schema uses append-only event rows, use a unique reservation/final-allocation key for the active allocation and a separate immutable event sequence/index for reversals and corrections.
- Unique idempotency key per Store, with a canonical hash of obligation, paycheck, policy version, and operation. Reject a repeated key with a different request fingerprint.
- Supporting query indexes on `{store, contributionMonth, agency, status}` and `{store, employee, contributionMonth}`; do not treat non-unique indexes as correctness controls.

## Transaction and concurrency design (not implemented)

Use the repository's MongoDB replica-set transaction architecture. Payroll computation can produce a draft proposal, but approval/finalization must atomically claim the payroll period and every monthly obligation revision, reserve/consume the eligible allocation keys, write the immutable statutory calculation/allocation snapshot with the payslip, and transition the payroll state. Use compare-and-set preconditions on period status, obligation revision/outstanding cents, and allocation status. A unique index remains the last line of defense against concurrent duplicate allocations. On a write conflict, duplicate key, stale revision, insufficient capacity, or any later operation failure, abort the whole transaction and return a safe retry/refresh error; no payslip or monthly obligation may be partially finalized. A repeated identical request is idempotent; a different payload under the same key is rejected.

Do not combine employee salary-payment confirmation with government contribution remittance. The existing Batch 2 payment-attempt confirmation remains separate and unchanged. No agency remittance API/provider is in scope.

## BIR interaction

The amount actually withheld from a particular paycheck, the monthly SSS/PhilHealth/Pag-IBIG obligation, and the amount legally deductible in the compensation withholding base are distinct facts. The existing standalone Annex E calculator requires classified employee contributions for the pay period and supports a limited compensation-table calculation; it does not implement all supplementary compensation, year-to-date, prior-employer, annualization, or year-end reconciliation behavior. Equal-splitting a monthly social contribution does not itself prove how it must enter the BIR base for daily/weekly/semi-monthly withholding. Do not change `utils/birWithholding.js` based on this proposal. BIR/payroll review must define the applicable actual-contribution-per-period treatment and any cumulative adjustment before connecting this allocator to tax calculation; otherwise readiness remains blocked.

## Policy approval and activation workflow (not implemented)

Proposed lifecycle: `draft` → `compliance_reviewed` → `approved` → effective-dated `active` → `superseded`. Store Owner/Admin approval alone is insufficient unless the designated authority has documented payroll/compliance review. A policy record should capture covered Stores and employee categories, agency and contribution-month assignment rule, allocation method/version, effective dates, official source references, supporting written interpretation, blockers/exception treatment, reviewer/approver IDs and timestamps, and checksum. Finance users may view but must not unilaterally edit rates, approve the policy, override a blocked employee, or approve their own payroll. Activation must reject conflicting effective intervals and be audited. No policy was approved or activated in this batch.

## Implementation sequence and remaining gate

1. Obtain written payroll/compliance decisions on timing, eligible-check mapping, pay-date versus period attribution, partial employment, zero/insufficient earnings, and BIR interaction for each agency/category.
2. Complete agency rule and employee classification verification. Keep unverified agency rules inactive; missing identifiers are not exemptions.
3. Have the payroll authority approve an effective-dated allocation policy and its exception/adjustment handling.
4. Add the obligation/allocation models, indexes, transactional reservation/finalization, audit events, and read-only UI projections; test rollback and concurrent attempts against an isolated replica set.
5. Integrate only complete verified monthly agency obligations into draft payroll and statutory snapshots. `ready` must mean every included employee has all mandatory verified rules, classifications, obligations, allocations, and reconciliation; never create a manual ready shortcut.
6. Validate historical payslips and Batch 2 independent payment confirmation remain unchanged before any controlled deployment.

As of this proposal, no model/index/transaction path for monthly statutory obligations exists, no policy is approved, contribution calculators remain disconnected from payroll, no integration-test database is configured in this task, and the statutory readiness gate remains fail-closed. Therefore newly computed payroll remains blocked from Review/Approval; existing approved/paid payroll and historical payslips remain available and unchanged.
