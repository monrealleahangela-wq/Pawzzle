# Finance Batch 3E — Statutory Payroll Policy Approval Package

**Decision status: PENDING — no policy approved or activated.** This package is for authorized Philippine payroll/accounting/compliance review and Pawzzle Owner/Admin business decision. It is not a legal opinion, does not itself establish compliance, and does not enable deductions. The product owner's proposed equal paycheck split is an operational preference only.

Baseline: `1c3d917`

Prepared: 2026-10-14

Policy version proposed for review: `PH-STATUTORY-ALLOCATION-v1-draft` (not active)

Effective date: **TBD; no earlier than all required approvals and implementation acceptance**

Approval/signature record: **None**

## 1. Scope for decision

The initial design scope is Store-scoped Pawzzle payroll for explicitly classified employees whom qualified review confirms are covered private-sector employees. The payroll system supports weekly, semi-monthly, and monthly periods. The agencies under consideration are SSS, PhilHealth, and Pag-IBIG for monthly social contributions, plus BIR compensation withholding. Agency coverage, applicable employee classes, dates, inputs, and exemptions must be evaluated individually; this proposed policy does not make every account type or Store employee covered.

Statutory agencies define contribution/tax obligations and remittance/reporting duties. The proposed policy concerns only how an employee's verified monthly SSS, PhilHealth, or Pag-IBIG share might be withheld across payrolls. It does not change the employer share, statutory base, remittance due date, BIR rules, or the distinction between a salary payment and government remittance. No government remittance, return filing, bank transfer, or “remitted/filed” status is included.

Proposed coverage/effective dates remain **TBD** by agency and employee category. No policy may be backdated to recalculate or mutate approved/paid payroll. Historical finalized payslips remain as issued.

## 2. Proposed deduction timing — for approval only

For a verified monthly employee obligation, divide integer centavos equally among the paychecks expressly determined eligible by an approved agency-specific contribution-month mapping. Give each paycheck the integer quotient; distribute residual centavos one each to the earliest paycheck(s) under the fixed order: pay date, period start, then immutable payroll period ID. The eligible-check list must be explicit; calendar month, pay date, period overlap, or frequency alone cannot establish eligibility.

Examples for a monthly employee share of PHP 200.01:

| Pay frequency / eligible checks | Example split | Decision required |
| --- | --- | --- |
| Weekly, four eligible checks | PHP 50.01; PHP 50.00; PHP 50.00; PHP 50.00 | Confirm which weekly periods/pay dates belong to the obligation month. |
| Weekly, five eligible checks | PHP 40.01; PHP 40.00; PHP 40.00; PHP 40.00; PHP 40.00 | Confirm whether all five are eligible or whether a contribution-month boundary excludes one. |
| Semi-monthly | If two checks are eligible: PHP 100.01; PHP 100.00 | Specifically decide treatment of the second semi-monthly period, which commonly has a pay date in the following month. |
| Monthly | One explicitly eligible paycheck receives PHP 200.01 | Decide whether one paycheck paid after or spanning the contribution month is the intended collection point. |

`utils/proposedStatutorySplitAllocator.js` is a pure proposal prototype. It accepts only caller-confirmed eligible paychecks and centavo capacities, returns `proposal_only`, and is not imported by payroll. It is not a legal rule, persistent ledger, transaction, or authorization mechanism.

### Timing and exception principles proposed for decision

- **Cross-month periods:** store contribution month, period start/end, and pay date separately. A qualified reviewer must choose the mapping for each agency. Do not infer the month from just one date.
- **New hire / termination:** use the agency's applicable coverage, salary base, and month-of-coverage rule. Do not prorate or stop a contribution based on an application assumption. Any mid-month calculation must be supported for that agency/category.
- **Insufficient or zero earnings:** never create a negative net salary, silently deduct zero, silently reduce the statutory obligation, or carry a balance into another month without approved lawful handling. Block affected payroll and surface the exact amount and decision needed.
- **Voided or corrected unfinalized payroll:** reverse/replace only a reservation in an audited transaction. Prevent duplicate obligation/allocation keys.
- **Finalized allocation:** never rebalance or mutate finalized/paid payslips. Preserve the original, append a linked adjustment/reversal event if an approved correction process permits it, and block if the remaining amount cannot be reconciled lawfully.
- **Retroactive compensation change or contribution shortfall:** determine whether the agency rules require a corrected obligation and how it is reported/remitted. Require reason, effective date, source evidence, authorized review, and a non-destructive adjustment; do not silently rewrite prior snapshots.
- **Employer remittance reconciliation:** employer liability and employee amounts must be reconciled to the agency's monthly remittance report/payment records outside this salary payment workflow. Pawzzle currently records manual/external employee salary payment confirmations, not agency remittances.

## 3. Agency-specific decision records

### SSS — pending decision `SSS-TIMING-01`

| Topic | Current evidence and proposed handling |
| --- | --- |
| Monthly obligation / covered employees | The isolated calculator models the published private-sector employed-member/business-employer table in SSS Circular 2024-006. This does not establish coverage for every Pawzzle role or employment arrangement. Explicit employee coverage classification is required. |
| Compensation base | The calculator requires an explicit monthly SSS-assessable compensation input and uses the published MSC bands, MPF, employee/employer shares, and employer-only EC. It rejects zero compensation pending separate review. It is not integrated with payroll and does not decide how the monthly base is constructed from all payroll components. |
| Contribution-month assignment / paycheck eligibility | No approved mapping exists. Decide whether eligibility follows applicable-month earnings, period end, payday, or another agency-supported method for weekly/semi-monthly/monthly periods. Equal split is not established as mandated by the reviewed guidance. |
| Permitted withholding timing | [SSS employer guidance](https://www.sss.gov.ph/employer-er/) says employers deduct employee shares from salaries/wages and remit with employer share and EC on the prescribed schedule; [SSS contribution guidance](https://www.sss.gov.ph/pay-contribution) states a regular employer deadline of the last day of the month following the applicable month. Confirm whether equal deductions across Pawzzle paychecks are proper under the governing rules and employee wage-deduction requirements. |
| Partial month / separation | Obtain an agency-specific determination for employee SS/MPF. SSS material separately describes EC employer obligations ending at the end of the month of a contingency/separation; do not generalize that EC rule to other SSS shares or agencies. |
| Remittance responsibility | Employer remains responsible for the combined remittance/reporting and deadline regardless of internal paycheck splitting. Pawzzle does not remit. |
| Open interpretation | Is equal per-check withholding permitted and how should monthly assessable compensation and employee share be allocated for cross-month payrolls, hire/separation, unpaid absence, insufficient wages, and late/retroactive payroll? |

### PhilHealth — pending decision `PH-TIMING-01`

| Topic | Current evidence and proposed handling |
| --- | --- |
| Monthly obligation / covered employees | The candidate calculator represents private formal-economy employed members only. The 2026 first-party premium advisory was not obtained in the existing source review, so 2026 parameters remain inactive/unverified. Do not use the candidate as an active rule. |
| Compensation base | The candidate requires explicit monthly basic salary and cites the published circular's basic-salary framework. It does not determine classification, partial-month assessment, or integration into gross/net pay. |
| Contribution-month assignment / paycheck eligibility | No approved mapping exists. The agency's “monthly premium” terminology does not by itself define which Pawzzle check(s) collect it when pay periods and pay dates cross months. |
| Permitted withholding timing | [PhilHealth employer procedures](https://www.philhealth.gov.ph/partners/employers/pay_procedures.php) direct deduction of the employee's monthly premium share from basic monthly salary and remittance with the employer share by the applicable due date. [Circular 2020-0005](https://www.philhealth.gov.ph/circulars/2020/circ2020-0005.pdf) is an identified premium schedule source; first-party 2026 guidance remains required by the existing readiness blockers. Obtain written confirmation for split withholding and covered category. |
| Partial month / separation | No calculator behavior is active. Obtain a decision grounded in the applicable PhilHealth rule for covered salary, new hires, separation, unpaid periods, and zero/insufficient pay. |
| Remittance responsibility | Employer reports/remits monthly through the applicable PhilHealth process and due-date window. Pawzzle does not remit. |
| Open interpretation | Obtain the original 2026 advisory or written PhilHealth confirmation; verify rate/base/category and decide whether/how monthly employee premium may be split across actual eligible payroll checks, including cross-month paydays. |

### Pag-IBIG — pending decision `HDMF-TIMING-01`

| Topic | Current evidence and proposed handling |
| --- | --- |
| Monthly obligation / covered employees | Candidate code models employed Pag-IBIG I membership using Circular 460, effective February 2024 onward as stated in a government-hosted copy. It remains inactive; the member category and first-party confirmation require review. |
| Compensation base | Candidate code takes an explicit monthly fund-salary input and applies Circular 460 thresholds/cap. It does not classify all allowances or construct the fund salary from Pawzzle payroll components. Its half-up centavo rounding is an application convention with agency/payroll confirmation pending. |
| Contribution-month assignment / paycheck eligibility | No approved mapping exists. Determine the applicable month and eligible paycheck(s) independently of pay-date month or period overlap. |
| Permitted withholding timing | [Circular 275 employer guidelines](https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/HDMF%20Circular%20275%20-%20Implementing%20Guidelines%20on%20Employer%20Registration%20Contribution%20and%20Remittance.pdf) describes salary-deducted monthly employee contributions, employer counterpart, and following-month remittance dates. [Circular 460 government-hosted copy](https://wcms.dmw.gov.ph/uploads/DMW_ADVISORY_37_2025_01225b9fec.pdf) contains the contribution change text. Neither establishes equal per-paycheck allocation in the materials reviewed. Request Pag-IBIG/payroll-professional confirmation. |
| Partial month / leave / separation | Circular 275 addresses leave without pay/suspension and separation effects; implementation must map its exact application to verified employment/leave records. Do not infer exemption from missing payroll or salary data. |
| Remittance responsibility | Employer collects/remits employee and employer amounts with required reporting on the Circular 275 schedule. Pawzzle does not remit. |
| Open interpretation | Confirm current employed-member coverage, fund-salary elements, rounding, contribution month, leave/separation treatment, and lawful timing of split deductions, especially cross-month periods and insufficient wages. |

The agency records are intentionally separate. Approval for one agency does not approve timing or exceptions for another.

## 4. BIR withholding and benefit classification

The standalone `utils/birWithholding.js` uses the RR 11-2018 Annex E period tables and requires classified compensation components and verified employee-share outcomes for SSS, PhilHealth, and Pag-IBIG (or evidence-backed not-applicable status). It is not connected to payroll. The existing documentation says it does not provide a complete cumulative/year-to-date, prior-employer, supplementary-compensation, termination annualization, or year-end reconciliation process, and does not automatically evaluate the eligibility conditions or annual accumulation of de-minimis benefits under RR 4-2025 and RR 29-2025.

The compliance reviewer must decide/document, with BIR authority, at least:

- which actual employee statutory deductions are deductible in each daily, weekly, semi-monthly, or monthly withholding calculation when a monthly obligation was split across checks;
- taxable compensation components and the treatment of regular versus supplementary compensation;
- prior-employer income, cumulative/YTD withholding, annualized tax, refund/deficiency, separation, and year-end reconciliation procedures;
- benefit-by-benefit de-minimis qualification conditions, applicable annual/monthly limits, and accumulated use; and
- minimum-wage-earner status and any exemption basis from explicit supported records, not an inference from salary.

Do not assume that a contribution split automatically authorizes subtracting each installment from taxable compensation in the same paycheck's BIR table. Until validated BIR support and classifications exist, affected new payroll remains blocked. Do not mark tax as filed or withheld as remitted.

## 5. Decision matrix — all decisions PENDING

| ID | Area | Exact decision / available options | Recommendation if supported | Source/basis | Operational impact / risk if unresolved | Required approver | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SSS-TIMING-01 | SSS | May the employee monthly share be split evenly across eligible checks, or must collection use a different schedule? | Decide only after written qualified review; no default split activation. | SSS employer duties and monthly contribution/remittance guidance linked above; no equal installment instruction identified. | Blocks SSS allocation and statutory readiness; risk of unlawful/late/inaccurate deduction. | Qualified PH payroll/accounting/compliance reviewer plus Owner/Admin | PENDING |
| SSS-MONTH-02 | SSS | Which rule maps weekly/semi-monthly/monthly period dates and payday to contribution month? | Define agency-specific deterministic mapping and test all crossings. | Monthly SSS obligation and payroll period fields in `utils/hrPolicy.js`; agency guidance. | Wrong month can duplicate or omit deductions/remittances. | Compliance reviewer plus payroll owner | PENDING |
| SSS-EMP-03 | SSS | How treat mid-month hire/separation, zero pay, unpaid leave, and assessable salary components? | Use explicit effective employment/classification and written agency interpretation; do not application-prorate. | Circular 2024-006 table and relevant SSS employer/EC guidance; category-specific coverage review. | Employee amount/base may be wrong; readiness remains blocked. | Compliance reviewer | PENDING |
| PH-RULE-01 | PhilHealth | What first-party 2026 issuance confirms rate, floor/ceiling, sharing, effective dates, and category? | Obtain original 2026 advisory or written official confirmation before activation. | Existing source review has PIA-reported announcement but not first-party advisory; Circular 2020-0005/2025 advisory history. | Current 2026 candidate stays inactive; blocks all affected payroll. | Qualified compliance reviewer; authoritative PhilHealth confirmation | PENDING |
| PH-TIMING-02 | PhilHealth | Is equal split permitted, and how assign contribution month/checks across cross-month periods? | No inferred calendar rule; approve a sourced agency-specific mapping. | Employer instructions say monthly premium deducted from basic monthly salary and remitted monthly. | Risk of wrong deduction timing/base or remittance discrepancy. | Compliance reviewer and Owner/Admin | PENDING |
| PH-EMP-03 | PhilHealth | How determine basic salary and treatment of hire, separation, unpaid days, and insufficient wages? | Record required verified inputs; block unsupported categories. | Circular 2020-0005 and applicable 2026 official guidance. | Cannot safely calculate obligation or net pay. | Compliance reviewer | PENDING |
| HDMF-RULE-01 | Pag-IBIG | Confirm Circular 460 operative text/category and current applicability, salary components, ceiling, and rounding. | Obtain first-party confirmation; preserve inactive candidate until confirmed. | Circulars 274/460 and official employer Circular 275; 460 copy currently government-hosted elsewhere. | Blocks activation and accurate obligation construction. | Qualified reviewer plus Pag-IBIG confirmation if needed | PENDING |
| HDMF-TIMING-02 | Pag-IBIG | Is split per-check deduction permitted, and what assigns contribution month/paycheck? | Approve an agency-specific mapping only after written review. | Circular 275 monthly salary deduction/remittance schedule; does not state equal check installments. | Risk of duplicate/late collection or amount mismatch. | Compliance reviewer and Owner/Admin | PENDING |
| HDMF-EMP-03 | Pag-IBIG | How apply fund salary, unpaid leave, mid-month hire/separation, and insufficient pay? | Explicit inputs and documented exception treatment; never infer zero/exemption. | Circular 275 and Circular 460 coverage/text. | Incorrect member share or employer counterpart. | Compliance reviewer | PENDING |
| BIR-BASE-01 | BIR | Which actual contributions are deductible from each paycheck's withholding base under split allocation? | Obtain written tax/payroll interpretation and encode independently of split preference. | RR 11-2018 Annex E, later relevant regulations; existing calculator is limited. | Cannot accurately compute withholding; blocks payroll. | Qualified Philippine tax practitioner | PENDING |
| BIR-CUM-02 | BIR | Define supplementary pay, YTD/prior-employer, annualization and year-end/termination withholding. | Implement before claiming full BIR payroll; no extrapolation from Annex E period table. | BIR regulation/table and verified employer records. | Under/over-withholding, year-end deficiencies/refunds; blocks affected cases. | Qualified Philippine tax practitioner | PENDING |
| BIR-BEN-03 | BIR | Define benefit-by-benefit de-minimis eligibility and annual accumulation under applicable RR and effective dates. | Validate condition, evidence, and YTD accumulation for each benefit. | RR 4-2025/RR 29-2025 as documented in `STORE_HR_PAYROLL.md`; verify publication/effectivity dates. | Risk of treating taxable benefits as exempt. | Qualified tax practitioner | PENDING |
| EMP-COVER-01 | Payroll | Which explicit employee categories are covered/exempt for each agency and what evidence is mandatory? | Versioned, effective-dated classifications; no salary-based inference. | Agency category rules and existing protected classification fields. | Missing input must block, not default to exemption. | Compliance reviewer plus authorized Owner/Admin | PENDING |
| ALLOC-EXC-01 | Cross-agency | What is lawful treatment for zero/insufficient earnings, arrears, adjustment or employer-funded shortfall? | Block until a lawful, agency-specific recovery policy is approved. | Wage deduction law/agency rules require professional review; current code intentionally fails closed. | Could create negative pay, unlawful deduction, or unpaid agency liability. | Employment/payroll counsel or qualified reviewer plus Owner/Admin | PENDING |
| ALLOC-COR-02 | Cross-agency | What happens after a check is voided, period recomputed, or new check added after finalization? | Keep finalized snapshots immutable; append linked adjustment events only under approved policy. | Existing finalized payroll/payment snapshot invariants. | No safe reconciliation if past payslips are rewritten or double deducted. | Payroll owner + compliance reviewer | PENDING |
| REMIT-REC-01 | Cross-agency | Who records and independently reconciles agency remittance liabilities, reports and receipts? | Define owner/process outside salary-payment confirmation; do not claim Pawzzle remits. | Each agency remittance guidance; Batch 2 tracks salary transfers only. | Employer liability can differ from payroll ledger without detection. | Owner/Admin and accounting lead | PENDING |
| GOV-APP-01 | Governance | Who is the designated compliance reviewer and Owner/Admin approver; who may activate the effective-dated policy? | Require separate documented review and approval; Finance may not self-approve own affected policy/payroll. | Least-privilege and separation-of-duties controls; proposed lifecycle only. | Unreviewed policy could activate or self-dealing go undetected. | Pawzzle Owner/Admin and qualified compliance reviewer | PENDING |

## 6. Approval governance and sign-off record

Required before any policy activation:

1. **Qualified Philippine payroll/accounting/compliance review:** verify official rules, coverage, bases, deadlines, deduction timing, edge cases, BIR treatment, and exceptions. Attach references or written agency/legal advice for unresolved interpretations.
2. **Pawzzle Owner/Admin business approval:** select Store/category scope, operational method, responsibility for payroll exceptions and reconciliation, and effective date. Approval cannot waive mandatory legal requirements.
3. **Independent review of self-dealing:** a Finance user must not approve a policy or payroll affecting their own salary. The approver identity and affected-employee check must be enforced server-side and audited.
4. **Versioned activation after engineering acceptance:** create a new immutable policy version with source references, scope, date interval, algorithm version, exception rules, reviewer/approver IDs, timestamps, and integrity checksum. Reject contradictory effective intervals. No such policy management/activation is implemented in this package.

**Sign-off record (intentionally blank; do not treat this template as approval):**

| Role | Name / professional details | Decision | Signature / evidence reference | Date |
| --- | --- | --- | --- | --- |
| Qualified PH payroll/accounting/compliance reviewer |  | PENDING |  |  |
| Pawzzle Owner/Admin business approver |  | PENDING |  |  |
| Independent self-dealing / authorization reviewer |  | PENDING |  |  |
| Effective date and policy version activated by authorized service owner |  | NOT ACTIVATED |  |  |

## 7. Compliance reviewer checklist

- [ ] Verify each cited statute, regulation, circular, advisory, official table, effective date, amendment, and supersession with current primary government materials.
- [ ] Confirm SSS coverage, compensation base, contribution month, employee/employer/MPF/EC treatment, contribution timing, separation and unpaid-period rules.
- [ ] Confirm PhilHealth first-party 2026 rate/base/shares/category and due dates; accept or reject split collection in writing.
- [ ] Confirm Pag-IBIG Circular 460 scope/current force, fund salary, rates/cap, rounding, monthly treatment, exceptions, and split collection.
- [ ] Decide separately for each agency how eligible checks are assigned across weekly, semi-monthly, monthly, cross-month and late payroll periods.
- [ ] Approve or reject the exact centavo residual order and define treatment when new checks arise after finalized allocations.
- [ ] Confirm hire/separation, leave without pay, zero/insufficient earnings, corrections, arrears and employer remittance reconciliation without silent zero, negative net, or historical mutation.
- [ ] Validate BIR deductions, compensation classes, supplementary pay, de-minimis limits/conditions/accumulation, prior employer, YTD, termination and annual reconciliation.
- [ ] Confirm which employee classifications/evidence are required for each agency; do not infer exemption or minimum-wage-earner status from salary.
- [ ] Attach professional/agency evidence, record all decision IDs, assign Store/category scope and effective dates, and sign/date this package or a formally approved version.
- [ ] Confirm review alone does not establish compliance; implementation, access controls, testing, reconciliation and operational procedures must also be accepted.

## 8. Implementation acceptance criteria before payroll integration

Do not connect contribution calculations to new payroll or allow statutory readiness `ready` until all criteria are met:

- [ ] Agency-specific allocation policy approved, versioned, effective-dated, source-backed and activated through authorized controls; no manual ready override.
- [ ] Active verified effective-dated SSS, PhilHealth, Pag-IBIG, and BIR rule versions cover each included employee and applicable date; no fallback or unverified zero.
- [ ] Required employee coverage, contribution/tax classifications, compensation components and effective employment intervals are complete, validated and protected.
- [ ] Persistent monthly obligation ledger and allocation events have reviewed unique indexes, idempotency, correction/reversal history and employer-liability separation.
- [ ] Transaction-safe reservation/finalization covers payroll state, all obligation allocations, payslip snapshots, audit records and rollback; duplicate concurrent computation/finalization cannot double-deduct.
- [ ] BIR supplementary/YTD/prior-employer/annualization/year-end and supported de-minimis logic is sufficient for the intended cases; unsupported cases block clearly.
- [ ] Itemized statutory employee/employer snapshots include source/rule/policy checksums and become immutable on finalization; employer-only items never reduce employee net pay.
- [ ] Readiness transitions are derived from complete validated calculations; blocked states identify rules, employee inputs, calculation errors and allocation gaps; review/approval reject forged labels or incomplete snapshots.
- [ ] Isolated MongoDB replica-set tests cover concurrency, transaction rollback, unique conflicts, duplicate allocation, correction and no partial finalization; no production database is used.
- [ ] Historical approved/paid payroll, payslip visibility and Batch 2 per-employee external payment confirmation are regression-tested and unchanged.
- [ ] Store-scope authorization, employee self-only visibility, Finance least privilege and Finance self-dealing restrictions are verified server-side.
- [ ] HR/Finance and employee UI display explicit amounts, rule versions, employer shares, blockers and non-remittance disclaimers without exposing identifiers or draft salary data improperly.
- [ ] Operational owner is assigned for agency remittance/reporting reconciliation; Pawzzle UI does not say “remitted” or “filed” without independent evidence and an actual supported process.

## 9. Current architecture and gate status

The Batch 3D proposal is documented in `docs/FINANCE_BATCH_3D_SPLIT_DEDUCTION_POLICY.md`. `utils/proposedStatutorySplitAllocator.js` is an isolated pure prototype only. `models/StatutoryRuleVersion.js` defines version/integrity metadata, while standalone agency calculators and protected classification utilities exist; none of these artifacts alone constitute a production statutory payroll engine or an approved policy.

`controllers/hrController.js` records statutory blockers when computing new payroll, and review/approval uses `isStatutoryPayrollReady` to require `ready`, no blockers, and verified snapshot evidence. `utils/statutoryPayrollReadiness.js` includes unresolved agency rules, employee data, BIR and monthly allocation/snapshot blockers. No policy approval/activation route or monthly obligation ledger is implemented. The gate remains unchanged by this document and must remain fail-closed. Existing finalized payslips and external salary payment confirmation remain separate and unchanged.

## 10. Source and interpretation limits

Primary references already documented in the repository include [SSS Circular 2024-006 schedule](https://www.sss.gov.ph/wp-content/uploads/2024/12/CI-2024-006-Publication.pdf), [SSS employer guidance](https://www.sss.gov.ph/employer-er/), [PhilHealth Circular 2020-0005](https://www.philhealth.gov.ph/circulars/2020/circ2020-0005.pdf), [PhilHealth employer procedures](https://www.philhealth.gov.ph/partners/employers/pay_procedures.php), [Pag-IBIG Circular 275](https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/HDMF%20Circular%20275%20-%20Implementing%20Guidelines%20on%20Employer%20Registration%20Contribution%20and%20Remittance.pdf), [government-hosted Circular 460 copy](https://wcms.dmw.gov.ph/uploads/DMW_ADVISORY_37_2025_01225b9fec.pdf), [BIR RR 11-2018](https://bir-cdn.bir.gov.ph/local/pdf/RR%20No.%2011-2018.pdf), and [BIR Annex E](https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf). Further RR 4-2025 and RR 29-2025 references/effectivity caveats are in `docs/STORE_HR_PAYROLL.md`.

These links are source leads and documented evidence, not a substitute for the assigned qualified review of current law, applicability, amendments, member categories, deduction rules and effective dates. In particular, the 2026 first-party PhilHealth advisory, agency-specific split timing, monthly-to-paycheck mapping, several employment exceptions, and full BIR cumulative/annual workflows remain unresolved. This package is decision-ready in structure but still requires the named authoritative evidence and signed decisions; it is not a declaration of statutory compliance.
