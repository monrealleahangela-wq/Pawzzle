# Finance Batch 4C — Leave Policy Approval Package

Status: **PENDING — no policy in this package is approved or active.** This document is a decision aid for Pawzzle Store Owners/Admins and a qualified Philippine labor/payroll reviewer. Reviewing it does not by itself establish legal compliance. No leave credits are granted, accrued, reserved, consumed, encashed, or connected to payroll by this package.

## Scope to approve

The proposed registry is Store-scoped and supports stable leave-type keys, Store-wide or employee-category scope, effective-dated versions, integer-minute units, paid/unpaid treatment, and explicit eligibility/accrual/carryover configuration. It is not yet connected to requests, balances, attendance calculations, or payroll. The policy owner must identify the covered Store(s), employee classifications, leave types, payroll frequencies in scope, and effective dates before a version can be activated.

Statutory leave obligations and optional employer benefits must be recorded separately. A Store policy must not describe an employer benefit as satisfying a statutory obligation unless qualified review confirms that treatment for the covered employees and period.

## Decision register

All items are **PENDING**. Recommendations below are operational safeguards, not legal conclusions.

| ID | Decision and available options | Basis / operational impact / risk if unresolved | Required approver | Status |
|---|---|---|---|---|
| LP-01 | Determine Service Incentive Leave (SIL) coverage and statutory exceptions for each employee category; options: include, exclude with cited exception, or defer pending classification. | Obtain current primary legal authority and assess actual coverage; incorrect inclusion/exclusion creates entitlement and compliance risk. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-02 | Define vacation leave: employer-provided, statutory category where applicable, or separate policies. | Classification controls eligibility, paid treatment, and reporting; conflation can misstate statutory compliance. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-03 | Define sick leave benefit and whether it is an employer benefit or another legally supported category. | No universal employer benefit is inferred by software; ambiguity can create inconsistent treatment. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-04 | Decide whether benefits are additive to statutory obligations or may satisfy an obligation where legally permitted. Options: additive; offset only with documented legal basis; separate account types. | Requires legal interpretation and clear employee-facing policy; wrong offsets can under-credit employees. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-05 | Define covered employment types, active statuses, employee categories, and minimum service rules. | Must match verified rules and actual employment records; missing classification must block calculation rather than infer eligibility. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-06 | Select leave year: calendar, employment anniversary, or another defined 12-month period. | Drives accrual, carryover, expiry, and reports; incompatible boundaries produce duplicate or missing credits. | Owner/Admin | PENDING |
| LP-07 | Select accrual start and frequency: immediate, after service threshold, monthly, annual, or manually posted. | Any schedule must be supported by policy and applicable law; activation defines future balance timing. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-08 | Define scheduled working minutes represented by one leave day. Options: date-effective roster minutes, contractual schedule, or separately approved policy units. | Do not assume 480 minutes/eight hours; affects part-time, shifts, half days, and consumption. | Owner/Admin + payroll professional | PENDING |
| LP-09 | Define part-time and variable-shift conversion, including schedule changes. | Requires date-effective schedule snapshots per leave date; otherwise historical units can change when schedules are edited. | Owner/Admin + payroll professional | PENDING |
| LP-10 | Define half-day treatment: half the scheduled minutes for that date, fixed minutes, or another explicit rule. | Must align with approved schedules and existing request precision; ambiguity makes balances irreproducible. | Owner/Admin + payroll professional | PENDING |
| LP-11 | Define whether holidays and rest days inside a request consume credits. Options: scheduled workdays only, calendar days, or explicitly enumerated dates. | Drives date expansion and schedule snapshot requirements; silent assumptions can over/under-consume. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-12 | Define carryover: none, capped, or uncapped; specify eligible units and period. | Requires explicit limits and legal/policy basis; no carryover is inferred from existing leave defaults. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-13 | Define expiration: none or a precise expiration schedule, including treatment of reserved units. | Expiry must use immutable ledger entries and cannot silently erase balances. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-14 | Define opening balances. Options: no opening balances; verified per-employee statements; audited migration. | Existing leave requests do not prove remaining credits; each opening amount needs source evidence and employee/Store validation. | Owner/Admin + payroll professional | PENDING |
| LP-15 | Define manual adjustments and reversals, including reason, evidence, independent approver, and limits. | Must be append-only, idempotent, and independently authorized; no silent balance editing. | Owner/Admin + payroll professional | PENDING |
| LP-16 | Define termination handling: stop accrual date, pending reservations, expiry, and unused leave treatment. | Final pay and encashment can have legal consequences; no automatic cash conversion is proposed. | Owner/Admin + qualified labor/payroll reviewer | PENDING |
| LP-17 | Decide whether any leave is encashable and under what circumstances. Options: none; only legally required cases; defined employer benefit. | Must not be inferred from unused balance; later payroll integration requires separate approval and computation rules. | Owner/Admin + qualified labor/payroll reviewer | PENDING |
| LP-18 | Define balance lifecycle: reserve on approval, consume on approval, consume after leave, or another explicit process; define cancellation release/reversal. | Must coordinate with the transactional leave workflow; reservations and reversals require idempotent ledger writes. | Owner/Admin + payroll professional | PENDING |
| LP-19 | Decide how historical employee balances are established and communicated. Options: no historic balance; individually verified opening entries; staged migration with conflict reports. | Existing approved leave is not a balance ledger; a blanket conversion risks fabricated credits. | Owner/Admin + payroll professional | PENDING |
| LP-20 | Set effective dates and versioning rules, including prospective versus any legally reviewed retroactive dates. | Effective dates are snapshotted and checksummed; retroactivity risks historical recalculation and must never rewrite ledger/payroll snapshots. | Owner/Admin + qualified labor reviewer | PENDING |
| LP-21 | Define insufficient-balance behavior: block request, allow unpaid leave, or permit separately approved exception without negative credits. | Must not silently create negative balances or convert paid/unpaid status. | Owner/Admin + payroll professional | PENDING |
| LP-22 | Define eligible paycheck timing only if leave later affects payroll; options must separately identify statutory obligations and internal deduction timing. | Payroll interaction is out of scope now and remains blocked pending policy/legal review and Batch 3 completion. | Owner/Admin + qualified payroll reviewer | PENDING |

## Approval governance and evidence

Before any policy version is activated, retain a signed decision record with: Store and covered employees; leave type and statutory/employer-provided classification; policy version; effective dates; final rule text; cited official legal/agency sources; Owner/Admin business approver; independent qualified labor/payroll reviewer and qualification evidence; approval reference; approval date; and effective date. The business approver and reviewer must be distinct. Finance users cannot self-approve, approve through custom permission payloads, or substitute for the independent compliance review.

The application activation service requires a same-Store Owner/Admin with effective `leave.approve` authority, a distinct same-Store non-Finance reviewer, a trusted backend verification callback for reviewer qualification, explicit effective date, approval reference, and HTTPS source references. There is no activation route or UI. No approval evidence is pre-populated.

## Acceptance before policy activation or ledger writers

- Resolve every applicable decision above and retain authorized sign-off.
- Independently verify current legal rules and employee coverage for the policy's effective dates.
- Approve the employee schedule-to-minute conversion and historical schedule snapshot rules.
- Complete role/Store authorization and audit integration for any future routes.
- Add and test a controlled policy drafting/review workflow and reviewer qualification registry.
- Keep activation transaction guard indexes present and concurrency tests passing on a transaction-capable test replica set.
- Implement later accrual/reservation/consumption writers only with idempotency, transaction boundaries, append-only reversals, reconciliation, and no negative available balances.
- Keep payroll calculations, salary deductions, leave encashment, final pay, and statutory readiness untouched until separately approved and verified.

## Review checklist

- [ ] Qualified reviewer verified the legal source, issuance, applicability, effective period, coverage and exceptions.
- [ ] Owner/Admin selected policy scope and confirmed statutory versus employer-provided treatment.
- [ ] Eligibility, leave year, accrual timing and effective date are explicit.
- [ ] Scheduled minutes, part-time/variable shifts, half-days, holidays/rest days and schedule changes are defined.
- [ ] Carryover, expiry, opening balances, adjustments, reversals, termination and encashment are decided.
- [ ] Approval reservation/consumption and cancellation behavior are decided.
- [ ] Historical balances are supported by evidence; no entitlement was inferred from existing requests or defaults.
- [ ] Payroll and statutory interaction remains separately approved and fail-closed.
- [ ] Business approver and qualified reviewer are different people; Finance did not self-approve.
- [ ] Policy version, source references, decision record, approval date and effective date are recorded.

Reviewer name/qualification evidence: ____________________  Store: ____________________

Owner/Admin approver: ____________________  Qualified reviewer: ____________________

Policy version: ____________________  Approval date: ____________________  Effective date: ____________________

Decision record/reference: ____________________  Signatures: ____________________
