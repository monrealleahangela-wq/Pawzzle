# Pawzzle: Proposed Integrated Pet Store, Veterinary Service, Supply Chain, Logistics, and Decision Support System

## 1. Executive Summary

Pawzzle should be repositioned from a general pet-commerce platform into an **Integrated Pet Store and Pet Care Management System with Supply Chain, Logistics, Finance, and Decision Support**. Its central purpose is to maintain one reliable operational record from supplier purchase to inventory receipt, customer sale or pet service, payment, delivery, and management decision.

The revised system has nine bounded modules:

1. User, Role, and Security Management
2. Customer and Pet Care Management
3. Product, Supply, and Inventory Management
4. Procurement and Supplier Management
5. Sales and Service Operations
6. Finance and Compliance
7. Logistics and Rider Mobile Application
8. Communication and Notifications
9. Decision Support, Dashboard, and Reports

The capstone's distinguishing contribution should be the **Decision Support System (DSS)**. It must not merely display charts. It should transform historical transactions and current constraints into forecasts, ranked alternatives, replenishment quantities, supplier scores, and recommended actions, while preserving owner approval and an explanation of every recommendation.

### Recommended capstone boundary

The first release should support one business organization with one or more branches, but should avoid enterprise-level accounting, autonomous purchasing, advanced route optimization, IoT vaccine sensors, computer diagnosis, and unrestricted telemedicine. These can be future enhancements.

## 2. Evidence-Based Assessment of the Current Repository

This assessment is based on the current MongoDB/Mongoose, Express, and React repository, not only on feature labels.

### Existing strengths

- Core e-commerce flows already exist: products, carts, orders, payments, bookings, stores, customers, reviews, and notifications.
- Supplier, supplier-product, purchase-order, inventory, delivery, and pet-profile models give the redesign a useful starting point.
- Orders already have a detailed fulfillment timeline, payment status, delivery reference, shipping address, and store reference.
- Bookings already contain assigned staff, service photos, pet details, pricing breakdown, QR handling, payment status, and service status.
- Users already have a role, staff type, store association, professional specializations, and a free-form permissions object.
- Products already include an expiry date, supplier references, stock, price, variants, and store association.
- Inventory already includes reorder level, maximum stock, cost price, linked supplier, storage location, and a simple recommended-order method.
- Delivery already supports tracking tokens, rider location, location history, chat, proof of delivery, and complaints.
- The current DSS already aggregates sales, customers, stock, services, and store performance and generates basic threshold-based advice.

### Material weaknesses

1. **RBAC is not truly implemented.** Back-end authorization mainly checks broad roles. The `permissions` object is not consistently enforced, and the role-permission screen uses local component state with no demonstrated persistence or enforcement. A staff type is being used as a substitute for permissions.
2. **Roles do not match the proposed organization.** Current top-level roles are limited to `super_admin`, `admin`, `staff`, `supplier`, and `customer`. Store Owner, Manager, Cashier, Inventory Staff, Veterinarian, Groomer, and Delivery Rider are not first-class assignable roles.
3. **The DSS is largely descriptive and rule-based.** It computes historical totals, recent growth, sales velocity, fixed low-stock thresholds, and fixed 15%/20% recommendations. It has no trained or validated forecast, error metric, confidence interval, scenario comparison, or feedback loop.
4. **There are multiple sources of stock truth.** Stock occurs in `Product.stockQuantity`, product variants, and `Inventory.quantity`. A sale or receipt can update one without the others.
5. **Expiry is modeled at product level rather than lot level.** One product can have many vaccine or medicine batches with different lot numbers and expirations. A single `expiryDate` cannot support FEFO or recalls.
6. **Pet data is duplicated.** Pet attributes appear in both pet profiles and embedded booking snapshots; sale/adoption pets are modeled separately. Booking snapshots are useful historically, but the authoritative clinical pet record must be referenced.
7. **Finance is revenue-oriented, not accounting-oriented.** The current revenue service records gross amount, a fixed 10% platform fee, store balance, and payout. It does not maintain expenses, cost of goods sold, tax classification, VAT breakdown, journal-like transaction records, payables, or true profit.
8. **Supplier performance values are stored aggregates.** Stored counters may drift from purchase-order and receiving evidence. Scores should be derived from immutable receipts, rejections, lead times, and invoices or maintained through auditable jobs.
9. **Procurement starts at a purchase order.** It lacks internal purchase requests, approval rules, request-for-quotation or quotation comparison, goods receipt inspection, three-way matching, and supplier returns.
10. **Delivery lacks an accountable rider entity and fee basis.** Rider name and phone are embedded text instead of an assigned user; distance, rate per kilometer, fee breakdown, service zone, failed-attempt reason, and cash remittance are absent.
11. **Medical records are too shallow.** Current records do not provide structured encounters, diagnosis, treatment, prescriptions, vaccination dose history, administering veterinarian, lot used, next due date, attachments, or consent.
12. **Compliance documentation is incomplete.** A boolean pedigree field and generic files are insufficient for PCCI registration number, registered name, sire/dam, microchip/tattoo, ownership transfer, document validity, and verification history.
13. **Status vocabularies overlap.** Order and Delivery each maintain related delivery states. Without a state-transition service, they can disagree.
14. **Derived totals are stored in several locations.** Store statistics, supplier performance, product stock, inventory stock, order totals, and payout balances can become inconsistent without transaction boundaries and reconciliation.
15. **Auditability and privacy need strengthening.** Pet-owner conversations, customer records, identity documents, and payment evidence need least-privilege access, retention rules, consent, immutable audit events, and secure object storage.

## 3. Revised System Objectives

The system shall:

- provide a single, normalized operational record for products, stock lots, customers, pets, services, suppliers, purchases, sales, expenses, and deliveries;
- enforce least-privilege access by organization, branch, role, resource, and action;
- prevent stockouts and reduce expiry losses, especially for vaccines and medicines;
- support traceable procurement from request through receiving and payment;
- provide structured pet health and vaccination history;
- give owners timely pet-service updates without exposing other customers' information;
- calculate traceable sales, VAT, costs, expenses, gross profit, and net profit;
- calculate delivery fees consistently and assign accountable riders;
- generate explainable, testable, and actionable DSS recommendations;
- distinguish facts, forecasts, recommendations, and user-approved actions;
- support operational, tactical, and strategic decisions without automatically replacing human judgment.

## 4. Proposed Module Design

### 4.1 User, Role, and Security Management

Functions:

- organization, branch, user, staff profile, and supplier/customer account management;
- role templates plus optional per-user exceptions;
- permission format `resource.action.scope`, such as `inventory.adjust.branch`;
- actions: view, create, update, approve, cancel, receive, dispense, assign, export, manage;
- scopes: own, assigned, branch, organization, platform;
- separation of duties: requester cannot be the sole approver above a configured amount; cashier cannot edit product cost; rider cannot see clinical notes;
- branch assignment, staff specialization, license/certification data, working schedule, and account status;
- server-side enforcement on every protected API, not only hiding menu items;
- audit trail for sign-in, record view where sensitive, create/update/delete, status change, approval, export, and permission change;
- MFA for administrators and owners; password/session controls; account lock and revocation.

Recommended normalized collections: `organizations`, `branches`, `users`, `staff_profiles`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permission_overrides`, `audit_events`.

### 4.2 Customer and Pet Care Management

Functions:

- customer profile, contact preferences, consent, transaction history, loyalty information, and notes;
- one customer may own or be authorized for multiple pets; a pet can have controlled co-owner/delegate access;
- structured pet demographics, microchip/tattoo, allergies, conditions, temperament, feeding/grooming preferences, emergency contact;
- encounters with veterinarian, reason, observations, assessment, diagnosis, treatment, prescription, attachments, and follow-up;
- vaccination records with vaccine type, dose, lot, manufacturer, administration date, administering professional, next due date, and adverse reaction;
- booking eligibility checks based on vaccination or health rules;
- staff assignment by required specialization, branch, availability, workload, and conflict detection;
- service progress timeline: admitted, assessed, started, update sent, ready, released;
- owner updates containing text, approved pictures/video, timestamp, and staff author;
- reminders for vaccination, medication, appointment, grooming, and follow-up;
- customer portal for record summaries, bookings, updates, invoices, delivery tracking, and communication.

Important boundary: the system stores professional records and supports communication; it must not diagnose pets automatically.

### 4.3 Product, Supply, and Inventory Management

Functions:

- product master separate from branch listing and supplier offer;
- product variants/UOM and barcode/SKU;
- stock by branch, storage location, and lot/batch;
- vaccine/medicine lot: lot number, manufacturer, received date, expiry date, quantity received, quantity available, unit cost, supplier, purchase receipt, and recall/quarantine status;
- immutable inventory transactions: receipt, sale, service consumption, return, transfer, adjustment, damage, expiry, and quarantine;
- FEFO allocation for expiring products and vaccines; FIFO or weighted-average costing for other items;
- configurable reorder policy, safety stock, minimum/maximum level, supplier lead time, and pack size;
- cycle counts and variance approval;
- expiry warning bands (for example 90/60/30/7 days), low stock, stockout, near-expiry, and recalled-lot alerts;
- service-supply consumption, such as shampoo, vaccine dose, or medicine used by a completed booking;
- branch transfers and traceability from receipt to sale or clinical use;
- sustainability measures: expired/damaged units, waste reason, reusable/recyclable packaging flag, supplier environmental score, and optional energy/water entries.

Authoritative rule: current stock is the sum of posted inventory transactions per branch/lot. Cached balances may improve speed but must be reconcilable. Remove `Product.stockQuantity` as an independently editable truth.

### 4.4 Procurement and Supplier Management

End-to-end workflow:

`Replenishment signal or manual need -> Purchase Request -> Approval -> RFQ/Quotation (optional for low-value orders) -> Supplier comparison -> Purchase Order -> Supplier confirmation -> Shipment -> Goods Receipt and quality/expiry inspection -> Inventory posting -> Supplier invoice -> Three-way match -> Payment -> Supplier evaluation`

Functions:

- supplier onboarding, contact persons, tax/business information, documents, categories, payment terms, lead times, minimum order and status;
- supplier catalog with SKU mapping, prices, pack size, minimum quantity, availability, and effective dates;
- purchase request with requester, justification, suggested quantity, branch, urgency, and DSS reference;
- configurable approval limits;
- requests for quotation and comparable quotation lines;
- PO version, tax, freight, expected date, terms, approval, and status history;
- partial receiving, over/under-delivery tolerance, rejected quantity and reason;
- goods-receipt inspection for damaged packaging, wrong item, insufficient shelf life, cold-chain exception, and missing documents;
- supplier return/debit note;
- invoice and three-way match of PO, goods receipt, and invoice;
- supplier scorecard generated from evidence, not manually invented totals.

### 4.5 Sales and Service Operations

Functions:

- POS and online sale using a shared order/transaction service;
- quotations, cart, sales order, payment, receipt/invoice, refund, return, and cancellation;
- cash shift opening/closing, tender reconciliation, and cashier variance;
- service catalog, duration, required specialization, capacity, resource needs, pricing rules, and branch schedule;
- appointment calendar with double-booking prevention and waitlist;
- staff check-in/check-out and service progress;
- service package/add-ons, consumables, discounts, and customer approval for additional charges;
- sale and service item snapshots for historical price/tax integrity;
- loyalty or voucher support only after core accounting and controls are stable.

### 4.6 Finance and Compliance

Capstone-appropriate subledger functions:

- sales, service revenue, discounts, refunds, procurement expense, operating expense, COGS, accounts payable status, platform fee, and payouts;
- configurable tax code per item/service/supplier rather than blindly adding 12%;
- VAT-inclusive and VAT-exclusive price support;
- when VAT applies:
  - VAT-exclusive: `VAT = taxable base x 0.12`, `total = base + VAT`;
  - VAT-inclusive: `VAT = gross x 12/112`, `net of VAT = gross - VAT`;
- save `taxCode`, `vatRate`, `taxableBase`, `vatAmount`, `grossAmount`, exemption/zero-rating reason where relevant, and rounding result on every transaction line;
- sequential invoice/receipt number configuration, payment reference, tender, and payment status;
- expense categories, attachment, payee, date, branch, amount, VAT input field, approval, and recurrence;
- COGS from inventory issue cost; gross profit = net sales minus COGS; operating profit = gross profit minus operating expenses;
- daily sales summary, expense report, VAT sales summary, gross profit, net operating result, cash collection, receivables/payables status, and audit export;
- PCCI record management described below.

This is a management subledger, not a substitute for a certified accounting system or professional tax advice. BIR rules and registration status determine actual VAT treatment.

### 4.7 Logistics and Rider Mobile Application

Core entities: `delivery_jobs`, `delivery_status_events`, `rider_profiles`, `rider_assignments`, `rider_locations`, `delivery_attempts`, `proofs_of_delivery`, `delivery_fee_rules`, `cash_remittances`.

Delivery workflow:

`Ready for dispatch -> Unassigned -> Assigned -> Rider accepted -> Picked up -> In transit -> Arrived -> Delivered`

Exception states: `assignment declined`, `customer unavailable`, `failed attempt`, `returned to store`, `cancelled`.

Automatic fee:

1. Validate branch and customer coordinates.
2. Obtain road distance from an approved mapping/routing service; use straight-line Haversine distance only as a clearly labeled fallback.
3. Select the active zone/rule.
4. Compute `fee = base fee + max(0, billable km - included km) x rate/km + allowed surcharges - discount`.
5. Apply minimum/maximum fee and service-radius rules.
6. Round once using the stored currency rule.
7. Save the distance, rule version, component breakdown, calculation timestamp, and manual-override reason.

Rider app:

- secure rider login and device/session control;
- availability toggle and assigned job list;
- accept/decline with reason;
- navigation deep link, pickup checklist, QR/OTP verification;
- status updates with timestamp and optional geolocation;
- background location only during active delivery and with explicit notice/consent;
- offline queue and later synchronization;
- call/chat with masked or minimum required customer information;
- proof of delivery by OTP, signature, or photo;
- failed-attempt recording and COD collection/remittance;
- rider earnings/fee view if within business policy.

Assignment in the capstone can use a transparent score:

`assignment score = 0.45 proximity + 0.25 current workload + 0.20 successful-delivery rate + 0.10 vehicle suitability`

The dispatcher sees the reasons and confirms the assignment. Full multi-stop vehicle routing should remain future scope.

### 4.8 Communication and Notification

- one conversation linked to order, booking, pet, or delivery as appropriate;
- service progress updates and media visible only to the pet owner/delegate and assigned staff/managers;
- templates for appointment, vaccine due, low stock, PO, delivery, payment, and document expiry;
- in-app notifications as the baseline; email/SMS/push as adapters;
- read status, delivery attempt, retry, and preference/consent;
- escalation path for complaints and clinically urgent messages;
- media moderation, retention, and owner-download controls.

### 4.9 Dashboard and Reports

The dashboard is the presentation layer; the DSS is the decision layer. Do not call every chart a DSS.

Owner/Manager dashboard:

- net sales, gross sales, discounts, returns, VAT, COGS, gross profit, expenses, and operating result;
- daily/weekly/monthly revenue trend and target variance;
- orders, average transaction value, product/service mix, and channel;
- stock value, low/out-of-stock, inventory turnover, days of supply, slow/non-moving, expiring lots, and waste;
- vaccine stock by type/lot, next expiry, doses administered, doses due, and projected shortage;
- new/returning customers, repeat rate, recency-frequency-monetary segments, retention, and inactive customers;
- appointments, utilization, cancellation/no-show, revenue per service, staff workload, and average duration;
- DSS forecast with accuracy, interval, replenishment proposals, supplier ranking, and unresolved recommendations;
- PO cycle time, open commitments, late POs, receipt variance, rejection rate, and procurement spend by supplier/category;
- deliveries by status, on-time rate, average delivery time, fee vs cost, failed attempts, and rider workload;
- sustainability: expiry/damage waste, packaging classifications, supplier sustainability score, and selected resource measurements.

Role-specific dashboards should contain only information needed by that role. Cashiers do not need supplier costs; riders do not need pet medical records; suppliers do not need customer lists.

## 5. Role-Based Access Control and Responsibilities

Use configurable roles, but seed the following templates. “Manage” includes view/create/update only where stated; destructive and approval actions remain explicit.

| Role | Primary responsibility | Accessible features | Explicit restrictions |
|---|---|---|---|
| Platform Admin | Platform configuration and tenant support | Organizations, global settings, account recovery, platform audit/health | No routine editing of branch financial or clinical records; sensitive access audited |
| Store Owner | Business governance and final decisions | All own-organization modules, financials, DSS, role assignment, approval policies | Cannot cross into other organizations |
| Manager | Daily branch operations | Sales/service oversight, staff schedule, customers, inventory, procurement approvals within limit, logistics, reports | No owner/platform settings; financial approvals limited |
| Cashier | POS and collection | Product lookup, sale, allowed discount, receipt, tender, shift, controlled refund request, customer lookup | No cost prices, supplier ranking, clinical notes, stock adjustments, or role changes |
| Inventory Staff | Stock accuracy and receiving | Products, lots, counts, receipts, transfers, adjustments submitted for approval, expiry/waste, reorder proposals | Cannot approve own material adjustment or supplier payment |
| Procurement Officer | Source and order supplies | Purchase requests, RFQ, quotation comparison, supplier catalog, PO preparation, delivery follow-up | Cannot post supplier payment; approval limited by policy |
| Finance Staff | Financial control | Payments, expenses, tax fields, matching, payouts, reconciliation, financial reports | Cannot alter clinical records or physical quantities without authorized correction workflow |
| Veterinarian | Clinical care | Assigned appointments, pet medical/vaccination history, encounters, prescriptions, vaccine administration, owner clinical updates | No unrelated customer financials; clinical entries require signed amendments, not silent overwrite |
| Groomer | Grooming service delivery | Assigned pet profile safety summary, grooming preferences, booking progress, approved photos, consumable use | No diagnosis, prescriptions, full finance, supplier data, or unrelated medical details |
| Trainer/Boarding Staff | Assigned care service | Assigned bookings, care instructions, behavior notes, progress/photos, incident escalation | No unrelated records or financial configuration |
| Delivery Dispatcher | Fulfillment control | Ready jobs, fee calculation, rider assignment, status exceptions, delivery reports | No clinical records beyond delivery safety note |
| Delivery Rider | Safe delivery | Own accepted jobs, minimum customer contact/address, navigation, status, proof, COD record | No customer directory, product costs, finance reports, or other riders' jobs |
| Customer/Pet Owner | Self-service and consent | Own/delegated pets, bookings, medical summaries, service updates, purchases, invoices, delivery, messages | Cannot view internal notes, other customers, internal costs, or staff/private documents |
| Supplier | Fulfill procurement | Own profile/catalog, received RFQs/POs, confirmations, shipping documents, invoices, own score summary/disputes | No other suppliers' quotations, customers, retail margins, or branch-wide inventory |
| Auditor/Read-only | Assurance | Time-limited approved reports and audit records | No create/update/delete/approve |

Permission examples:

- `purchase_request.create.branch`
- `purchase_order.approve.branch` with amount limit
- `inventory_receipt.post.branch`
- `inventory_adjustment.approve.branch`
- `clinical_record.view.assigned`
- `clinical_record.sign.assigned`
- `expense.approve.organization`
- `delivery_job.update.own`
- `dss_recommendation.accept.organization`

## 6. A Real Decision Support System

### DSS architecture

1. **Data layer:** validated sales lines, booking lines, inventory events/lots, supplier receipts, expenses, calendars, prices/promotions, and delivery events.
2. **Feature layer:** daily demand, day/week/month, holiday/season, promotion flag, lead time, price, stockout censoring, capacity, cancellations, and weather only if a reliable source is later approved.
3. **Model layer:** simple baselines first; challenger models only when sufficient data exists.
4. **Decision engine:** turns forecasts into feasible actions using lead time, safety stock, shelf life, pack size, capacity, cash/budget, and supplier constraints.
5. **Explanation layer:** reason codes, important drivers, data period, confidence, assumptions, and limitations.
6. **Action layer:** owner approves, modifies, dismisses, or converts a recommendation into a purchase request/schedule/promotion.
7. **Evaluation layer:** forecast error, recommendation acceptance, realized outcome, overrides, and model version.

Every recommendation record should include `decisionType`, `scope`, `generatedAt`, `dataThrough`, `modelVersion`, `inputsSnapshot`, `recommendedAction`, `alternatives`, `confidence`, `explanation`, `expectedImpact`, `status`, `decidedBy`, `decisionReason`, and `actualOutcome`.

### DSS-1: Product sales forecasting

- **Decision problem:** How many units of each product/category are likely to sell in the next 7, 14, and 30 days?
- **Inputs:** posted non-cancelled sale lines, date, SKU/category/branch, price, promotion, stockout periods, returns, holidays/season, and optional events.
- **Processing:** aggregate daily demand; compare seasonal naïve and moving-average baselines with Holt-Winters/ETS. Use intermittent-demand Croston/SBA for sparse items. A gradient-boosting challenger may be added only with adequate observations. Use rolling-origin validation and select by WAPE/MAE; retain prediction intervals.
- **Outputs:** point forecast, lower/upper interval, expected peak dates, trend/season classification, model used, error score, and data-quality warning.
- **Decision benefit:** owners can plan purchases and campaigns using future demand rather than intuition or last-month totals.

### DSS-2: Service demand and capacity forecasting

- **Decision problem:** How many grooming, veterinary, training, or boarding slots and specialized staff hours are needed?
- **Inputs:** bookings by service/date/time, duration, cancellations/no-shows, walk-ins if captured, staff specialization, roster, room/table capacity, holidays, and promotions.
- **Processing:** seasonal daily/weekly count forecast; calculate effective demand including historical no-show rate; translate demand into required labor hours and compare with available qualified capacity.
- **Outputs:** forecast bookings and labor hours, utilization, shortage/surplus by day/slot/specialization, waitlist risk, and suggested roster/slot changes.
- **Decision benefit:** prevents overbooking, idle staff, and assigning an unqualified worker; supports schedule decisions one to four weeks ahead.

### DSS-3: Inventory replenishment prediction

- **Decision problem:** When will stock reach an unsafe level or stock out?
- **Inputs:** current available and reserved lot quantities, demand forecast, supplier lead-time distribution, open POs, safety-stock policy, service consumption, pack size, shelf life, and desired service level.
- **Processing:** projected inventory position by day; `reorder point = expected demand during lead time + safety stock`; safety stock can use demand and lead-time variability. Run scenario bands using forecast intervals.
- **Outputs:** projected stockout date/range, reorder date, risk probability/level, days of supply, and affected services/orders.
- **Decision benefit:** highlights urgency early and distinguishes a true future shortage from a simple static threshold.

### DSS-4: Reorder quantity recommendation

- **Decision problem:** How much should be ordered without creating excess, expiry, or cash-flow pressure?
- **Inputs:** forecast, on-hand/on-order/reserved stock, reorder point, target coverage, pack/minimum order, unit cost, supplier lead time, lot shelf life, storage capacity, budget, and vaccine expiry risk.
- **Processing:** constrained order-up-to calculation: `recommended quantity = target stock - inventory position`, rounded to pack size and bounded by budget, storage, MOQ, and expected consumption before expiry. Show conservative/base/high-demand scenarios. EOQ may be shown only when its assumptions are reasonable.
- **Outputs:** recommended quantity and date, alternative quantities, expected service level, expected ending stock, estimated cost, expiry risk, and rule constraints.
- **Decision benefit:** converts a forecast into an actionable purchase request while making trade-offs visible.

### DSS-5: Supplier performance evaluation and selection

- **Decision problem:** Which supplier best balances price, delivery, quality, availability, and sustainability for an item/order?
- **Inputs:** quoted price, on-time-in-full rate, actual lead time and variability, rejected/damaged/short-shelf-life rates, order cancellation, responsiveness, payment terms, distance, verified documents, and owner-set sustainability criteria.
- **Processing:** normalize evidence-based criteria and use transparent weighted scoring or AHP-derived weights with TOPSIS ranking. Run sensitivity analysis when weights change. Do not let a manually entered rating replace transaction evidence.
- **Outputs:** ranked suppliers, score by criterion, total score, price/lead-time trade-off, missing-data confidence, and reasons for rank.
- **Decision benefit:** prevents choosing solely on price and makes supplier selection defendable and auditable.

### DSS-6: Best-selling and assortment analysis

- **Decision problem:** Which products should be retained, expanded, bundled, repriced, or reviewed?
- **Inputs:** units, net sales, gross margin, returns, discount, stock availability, days stocked, views/conversions if reliable, category, and service attachment.
- **Processing:** rank separately by units, revenue, and gross-margin contribution; ABC analysis by annual consumption value; sales velocity normalized for days available; flag stockout-censored demand and cross-sell associations with minimum support/confidence.
- **Outputs:** top/declining products, ABC class, margin leaders, dead/slow stock, bundle candidates, and data cautions.
- **Decision benefit:** avoids the misleading assumption that highest revenue equals highest profitability and informs assortment and shelf-space choices.

### DSS-7: Seasonal demand prediction

- **Decision problem:** Which predictable periods create demand peaks or declines?
- **Inputs:** at least 12 months preferred (24+ better) of product/service demand, calendar month/week/day, Philippine holidays, promotions, and stockout/capacity constraints.
- **Processing:** seasonal decomposition and seasonal indices; year-over-year comparison; ETS when history supports seasonality. With insufficient history, label outputs “preliminary pattern,” not a validated seasonal forecast.
- **Outputs:** seasonal index by month/week, expected peak/low periods, affected categories/services, forecast intervals, and preparation lead time.
- **Decision benefit:** helps time purchases, staffing, marketing, and cash needs before peaks.

### DSS-8: Profitability and scenario analysis

- **Decision problem:** Which products, services, branches, and scenarios create sustainable profit?
- **Inputs:** net-of-VAT sales, discounts/returns, COGS, service consumables, direct labor estimate, delivery subsidy, payment/platform fees, allocated operating expenses, and capacity.
- **Processing:** contribution margin and gross-margin analysis; cost-volume-profit and break-even; “what-if” simulation for price, volume, supplier cost, wage/capacity, and delivery rate. Clearly distinguish directly measured cost from allocated cost.
- **Outputs:** profit/margin by dimension, break-even units/revenue, loss makers, scenario comparison, and key sensitivity drivers.
- **Decision benefit:** allows owners to act on profit rather than gross sales and test a change before applying it.

### DSS-9: Business performance recommendations

- **Decision problem:** Which few actions deserve management attention now?
- **Inputs:** validated outputs from DSS-1 to DSS-8, KPI targets, unresolved alerts, cash/budget, operational constraints, and prior recommendation outcomes.
- **Processing:** rule-based prescriptive layer over validated forecasts and scores; rank by `expected financial/operational impact x urgency x confidence`, remove mutually conflicting actions, and require human approval.
- **Outputs:** prioritized action cards with evidence, expected benefit, cost, owner, due date, confidence, alternatives, and convert-to-workflow button.
- **Decision benefit:** reduces information overload and connects analysis to purchase requests, schedules, pricing review, or supplier review.

### DSS evaluation protocol

- Backtest forecasts with rolling time splits; never train on future data.
- Compare every model with naïve baselines.
- Report MAE/WAPE and bias; avoid MAPE for zero-demand items.
- Do not display confident forecasts for insufficient or poor-quality data.
- Store model/data version and recommendation history.
- Measure decision usefulness: acceptance rate, override reason, avoided stockout/expiry, service utilization change, forecast error, and realized margin impact.
- Conduct adviser-approved user evaluation using task accuracy, decision time, usability (for example SUS), and perceived explanation usefulness.

## 7. Data Model and Normalization Strategy

MongoDB does not remove the need for normalization. Embed immutable transaction snapshots when historically necessary; reference reusable master data.

### Authoritative master data

- `organizations`, `branches`, `users`, `roles`, `permissions`
- `customers` linked to user when a login exists
- `pets`, `pet_owners`
- `products`, `product_variants`, `services`, `service_requirements`
- `suppliers`, `supplier_offers`
- `tax_codes`, `expense_categories`, `delivery_fee_rules`

### Operational transactions

- `appointments`, `service_events`, `pet_updates`
- `medical_encounters`, `vaccinations`, `prescriptions`
- `sales`, `sale_lines`, `payments`, `refunds`
- `purchase_requests`, `quotations`, `purchase_orders`, `goods_receipts`, `supplier_invoices`
- `inventory_lots`, `inventory_transactions`, cached `stock_balances`
- `expenses`, `payouts`
- `delivery_jobs`, `delivery_events`, `proofs_of_delivery`
- `documents`, `document_links`, `notifications`, `audit_events`
- `forecasts`, `recommendations`, `decision_actions`, `model_metrics`

### Redundancies to resolve

| Current overlap | Resolution |
|---|---|
| `Product.stockQuantity`, variant stock, and `Inventory.quantity` | Inventory ledger is authoritative; product availability is derived/cached |
| Product-level expiry | Move physical expiry to `inventory_lots`; product may retain default shelf-life metadata |
| Embedded inventory supplier contact plus Supplier reference | Keep supplier reference; use snapshots only on immutable PO/receipt |
| PetProfile and embedded booking pet | Booking references authoritative pet and keeps only a minimal immutable service snapshot |
| Order delivery statuses and Delivery status | One delivery state machine emits events; order derives fulfillment summary |
| Store revenue totals and transaction totals | Finance ledger/subledger is authoritative; store KPIs are recomputed/cacheable |
| Supplier stored performance counters | Calculate from receipts/POs; cache with last-calculated timestamp |
| Free-form user permissions and role checks | Normalized permission catalog and centralized policy middleware |
| Payout account details repeated across records | Tokenized/secured payment profile; transaction retains masked snapshot |

Use unique business keys per organization, foreign-key-like validation, indexes, schema validation, idempotency keys for payment/receipt posting, and database transactions for stock-and-finance postings.

## 8. PCCI, Purebred, Payment, VAT, and Business Compliance

### PCCI and purebred records

Create `dog_certifications` and document records with:

- pet, certification type (`PCCI registered`, `PCCI listed`, `other registry`, `unverified claim`);
- registered name, registration/listing number, issuing registry, issue date;
- kennel name/affix, litter registration number, sire and dam names/numbers;
- owner/member details where lawfully needed;
- microchip/tattoo identifier;
- local/imported classification; transfer-of-ownership status and dates;
- document scans, hash, version, verification state, verifier, verification date, rejection reason;
- expiry/renewal where the document type actually has one;
- access and download audit.

Never present “purebred” or “PCCI-certified” as verified merely because a seller selected a checkbox. Use visible statuses: unsubmitted, submitted, internally reviewed, registry evidence recorded, rejected/expired. Pawzzle should manage evidence, not claim to be PCCI.

### Payment records

Store gateway/provider, payment method, amount, currency, status, reference, payer/payee, transaction type, created/paid/refunded timestamps, fee, reconciliation status, and masked evidence. Use webhook/idempotency protection and never store raw card credentials.

### VAT

Support the 12% computation as a configurable tax rule only **where applicable**. Whether a business, item, or service is VATable depends on current Philippine tax law and the taxpayer's registration/circumstances. The system should store tax treatment and produce summaries; a qualified accountant or BIR guidance should validate production configuration.

### Privacy and records controls

- privacy notice and purpose-specific consent for customer accounts, service photos, marketing, and location tracking;
- minimum necessary access and role-based field masking;
- encryption in transit and at rest, signed URLs for documents/media, backups, restoration test, and incident log;
- correction/amendment workflow and retention/deletion schedule;
- customer data export/correction request workflow;
- pet medical content should receive clinical-grade confidentiality even though the animal itself is not a human data subject, because the record contains owner identity, communications, and professional information.

## 9. Additional Innovative but Practical Features

| Feature | Problem and need | Benefits and integration | Decision level | BSIT feasibility |
|---|---|---|---|---|
| Lot-level FEFO and recall traceability | Single expiry dates cannot prevent use/sale of an older or recalled vaccine lot | Owners reduce waste/liability; staff pick safest lot; customers gain confidence; integrates Inventory, Procurement, Veterinary, Notifications | Operational/tactical | High; standard CRUD, rules, and alerts |
| Appointment eligibility and safety checklist | Staff may miss vaccine, allergy, behavior, or consent requirements | Safer service intake and fewer cancellations; integrates Pet Care, Booking, RBAC | Operational | High; configurable checks, no AI diagnosis |
| Specialization-and-capacity scheduler | Manual assignment can double-book or use unqualified staff | Fair workload, higher utilization, safer care; integrates User, Service, DSS | Operational/tactical | High; constraint rules and calendar |
| Service update timeline with owner consent | Owners lack visibility while pets are in care | Trust, fewer status calls, incident traceability; integrates Booking, Media, Chat, Notifications | Operational | High |
| Digital vaccination card and due reminders | Paper records are lost and preventive care is missed | Customers receive continuity; vets view history; store gains repeat service; integrates Pet, Veterinary, Inventory | Operational | High |
| Procurement three-way matching | Paying an invoice without matching order and receipt causes loss | Owners control spend; finance gets evidence; suppliers get clearer disputes; integrates Procurement, Inventory, Finance | Operational/tactical | Medium-high |
| Supplier score with sensitivity analysis | Lowest-price selection ignores late/poor-quality supply | Transparent sourcing and resilience; integrates Procurement, DSS, Sustainability | Tactical/strategic | Medium; weighted TOPSIS can be implemented and explained |
| Cashier shift and payment reconciliation | Sales totals may not equal cash/e-wallet receipts | Detects discrepancies; integrates Sales, Finance, Audit | Operational | High |
| Expense and COGS attribution | Revenue dashboards overstate performance | True product/service profitability; integrates Inventory, Service, Finance, DSS | Tactical/strategic | Medium-high |
| Explainable forecasting with confidence | A black-box number is hard to defend or trust | Owners see reason, uncertainty, and accuracy; integrates DSS and Dashboard | Tactical | Medium; ETS/Croston plus evaluation is capstone-suitable |
| Recommendation approval and outcome feedback | Advice without action or evaluation is only a report | Demonstrates real DSS use and learning; integrates DSS with Procurement/Scheduling | Tactical/strategic | High |
| Inventory cycle counting | Full counts are disruptive and variances persist | Better stock accuracy with manageable counts; integrates Inventory and Audit | Operational | High |
| Customer RFM segmentation and consent-based reminders | All customers receive the same message | Useful retention actions without complex ML; integrates Customers, Sales, Notifications, DSS | Tactical | High |
| Delivery fee audit and offline rider queue | Unexplained fees and poor connectivity disrupt delivery | Fair fee, traceable overrides, robust rider use; integrates Logistics, Finance, Orders | Operational | Medium-high |
| Sustainability scorecard | “Sustainability” without measures is vague | Tracks expiry waste, packaging and supplier evidence; integrates Inventory, Procurement, Finance, DSS | Tactical/strategic | Medium if limited to measurable inputs |
| Incident and adverse-event record | Grooming, boarding, delivery, or vaccination incidents can be lost in chat | Timely escalation, evidence, corrective action; integrates Pet Care, Logistics, Audit | Operational/tactical | High |
| Optional QR/barcode receiving and dispensing | Manual entry causes SKU/lot errors | Faster, more accurate inventory movement; integrates Procurement and Inventory | Operational | Medium; camera-based scanning is feasible |

### Features to avoid or defer

- automated veterinary diagnosis, medication recommendation, or health-risk scoring without clinical governance and appropriate data;
- facial/breed recognition as proof of purebred status;
- blockchain for ordinary record integrity;
- autonomous purchase-order submission without human approval;
- complex multi-vehicle route optimization in the first release;
- always-on rider tracking outside active jobs;
- broad social-network features, adoption marketplace expansion, gamification, and decorative AI chatbots if they compete with inventory, finance, clinical records, or DSS quality;
- a separate “customer DSS” that merely recommends products based on pet type; this is a recommendation/CRM feature, not the management DSS contribution.

## 10. System Analysis Summary

### Missing features

- real permission enforcement and separation of duties;
- purchase requests, approval limits, quotation comparison, goods receipts, inspection, returns, invoice matching;
- lot/batch inventory, FEFO, stock ledger, cycle counts, recalls and service consumption;
- structured clinical encounter/vaccination/prescription records;
- proper rider accounts, assignment, distance/rate audit, attempts, COD remittance, offline support;
- expenses, COGS, VAT line details, profit, reconciliation and financial audit trail;
- validated forecasts, intervals, accuracy, scenario analysis, recommendation workflow and model monitoring;
- PCCI structured evidence and verification;
- consent, retention, secure media/document access, and field-level privacy;
- measurable sustainability indicators.

### Opportunities for improvement

- reuse current orders, bookings, suppliers, purchase orders, delivery tracking, and media features while replacing their duplicated fields with authoritative ledgers/references;
- turn the existing DSS aggregations into the data-quality and baseline layer for a real DSS;
- use one event/timeline pattern across order, service, procurement, inventory, and delivery;
- use recommendation-to-action links to demonstrate measurable capstone impact;
- scope forecasting to top products/categories and selected services first, where data quality is strongest.

### Remove or rename

- rename current DSS pages/outputs as **Analytics and Rule-Based Insights** until forecasting and decision workflow are present;
- remove editable duplicated stock fields after migration;
- remove fake/placeholder growth calculations such as deriving “balance growth” from the current balance multiplied by a constant;
- remove fixed “increase PO by 20%” and “discount by 15%” claims unless calculated from a stated scenario;
- remove broad `adminOrStaff` access that also treats suppliers like internal staff;
- replace generic `staff` plus optional type as the only access model;
- remove the claim that a pedigree checkbox means verified PCCI certification;
- de-emphasize unrelated marketplace/social features in the thesis scope.

## 11. Priority Classification

### Must-Have

- organization/branch-aware authentication, server-enforced RBAC, role templates, audit log;
- Store Owner, Manager, Cashier, Inventory Staff, Procurement, Finance, Veterinarian, Groomer/Care Staff, Rider, Customer, and Supplier access boundaries;
- customer and pet master records;
- structured appointments, specialization-based assignment, service progress and owner photo updates;
- pet medical encounters and vaccination history;
- product/variant master, inventory lot/batch, stock transaction ledger, low-stock and expiry/vaccine alerts;
- supplier profile/catalog and procurement workflow from request/approval to PO and goods receipt;
- sales/POS, service billing, payments, refunds, expenses, COGS, 12% VAT calculation where configured, and profit reports;
- delivery job, accountable rider assignment, distance-based fee breakdown, status events, proof of delivery;
- dashboard essentials and exportable sales, finance, inventory, vaccine, procurement, service, and delivery reports;
- DSS baselines for product sales, service demand, replenishment date/quantity, supplier scoring, and profitability;
- DSS backtesting, accuracy, confidence/data warnings, explanations, approval/override, and recommendation history;
- PCCI/purebred structured document records and verification status;
- privacy notice/consent, secure files, backups, validation, and transaction integrity.

### Should-Have

- RFQ and quotation comparison;
- partial receiving, quality/shelf-life inspection, supplier returns, three-way matching;
- cycle counting, branch transfers, barcode/QR scanning;
- capacity forecast and waitlist;
- seasonal analysis once sufficient history exists;
- ABC/slow-moving analysis and RFM customer analytics;
- cash-shift reconciliation and COD remittance;
- supplier sustainability and sensitivity analysis;
- digital vaccination card and due reminders;
- rider offline queue and delivery exception management;
- sustainability scorecard using expiry/damage/packaging metrics;
- model and recommendation outcome monitoring.

### Nice-to-Have

- loyalty tiers and voucher optimization;
- customer-approved teleconsultation scheduling (subject to professional policy; no automated diagnosis);
- automated promotion/bundle suggestions with owner approval;
- advanced notification channels beyond in-app/email;
- document OCR for data-entry assistance with human verification;
- what-if sliders for price, staffing, demand, and supplier cost;
- limited map heatmaps for demand and delivery;
- customer delegate/co-owner permissions.

### Future Enhancements

- multi-stop route optimization and dynamic dispatch;
- temperature/IoT cold-chain monitoring;
- advanced machine-learning ensemble after enough clean data;
- anomaly/fraud detection;
- integration with certified accounting/POS, e-invoicing, laboratory, pharmacy, insurer, or government/registry APIs where legally and technically available;
- cross-branch inventory optimization and automatic transfer proposal;
- native push/SMS service at production scale;
- computer vision only for non-clinical tasks such as barcode/document capture;
- anonymized multi-store benchmarking with strong privacy controls.

## 12. Recommended Capstone Implementation Roadmap

### Phase 1: Foundation

Freeze scope; define organization/branch model, permission catalog, process state machines, data dictionary, privacy policy, and migration plan. Fix authorization and single sources of truth first.

### Phase 2: Operational core

Implement customer/pet records, booking/staff assignment, inventory lots/ledger, procurement request-to-receipt, sales/finance subledger, and delivery job/rider workflow.

### Phase 3: DSS

Build the analytics dataset, data-quality checks, naïve baselines, ETS/Croston forecasts, replenishment engine, supplier score, profitability scenarios, explanations, recommendation approval, and backtesting.

### Phase 4: Integration and evaluation

Connect owner updates, alerts, dashboards, PCCI records, VAT summaries, and end-to-end audit. Test complete scenarios: vaccine purchase-to-dose, product purchase-to-sale, grooming booking-to-update/payment, and order-to-delivery.

### Phase 5: Capstone validation

- functional and authorization test matrix per role;
- unit tests for VAT, totals, stock posting, fees, and status transitions;
- forecast backtesting against baselines;
- usability testing with representative owner/staff/customer/rider tasks;
- performance and concurrency tests for stock posting and booking conflicts;
- security tests for tenant isolation, direct-object access, file URLs, and privilege escalation;
- backup restoration and audit-trail verification.

## 13. Suggested Research Questions and Evaluation Measures

Possible research framing:

1. How accurately can the proposed DSS forecast short-term demand for selected pet products and services compared with seasonal-naïve and moving-average baselines?
2. To what extent do forecast-based reorder recommendations reduce simulated stockout days and near-expiry excess compared with fixed reorder thresholds?
3. Does the explainable supplier-ranking model improve decision consistency and decision time compared with price-only selection?
4. How usable and useful do store owners and staff find the integrated workflows and recommendation explanations?

Measures:

- forecasting: MAE, WAPE, bias, interval coverage;
- inventory: stockout days, fill rate, expired quantity/value, inventory turnover;
- procurement: cycle time, on-time-in-full, rejection rate, purchase-price variance;
- service: utilization, wait time, cancellation/no-show, qualified-assignment rate;
- logistics: on-time delivery, first-attempt success, status latency, fee accuracy;
- finance: reconciliation variance, gross margin, expense completeness;
- usability: task success, time-on-task, SUS, explanation usefulness;
- DSS: acceptance/override rate and realized outcome versus expected impact.

## 14. Research and Industry Basis

The design follows several defensible findings and official requirements:

- Retail forecasting research emphasizes that forecasting must connect to inventory decisions and that low-volume items require methods and evaluation suited to intermittent demand. Fildes, Kolassa, and Ma's 2022 review also cautions that retail forecasting conditions and data structure matter: https://doi.org/10.1016/j.ijforecast.2021.09.012
- A 2023 retail study demonstrated that disaggregated gradient-boosting forecasts can improve accuracy and reduce stockouts/stock on hand, supporting a challenger model only after baselines and sufficient data are established: https://doi.org/10.1016/j.asoc.2023.110283
- Recent supplier-selection literature treats selection as a multi-criteria decision, not a lowest-price choice. A 2024 review of 101 papers identifies AHP, TOPSIS, VIKOR and related methods as common approaches: https://doi.org/10.3390/su16010125
- A 2022 supplier DSS specifically combines fuzzy AHP and TOPSIS, while a 2023 framework integrates economic, environmental, social, and resilience factors. These support a transparent, weighted, sensitivity-tested supplier score rather than an opaque rating: https://doi.org/10.3390/pr10081576 and https://doi.org/10.3390/su15075962
- A 2024 veterinary telemedicine study found that management leadership, professional competence, convenient hours, availability, and price influence successful digital service adoption. This supports practical owner communication and scheduling while keeping clinical decisions with qualified veterinarians: https://doi.org/10.3390/ani14131912
- The Philippine Data Privacy Act requires transparency, legitimate purpose, proportionality, accuracy, limited retention, and safeguards when processing personal information: https://privacy.gov.ph/data-privacy-act/
- PCCI describes the Certified Registration and Pedigree Certificate as official recognition and a document of ancestry/ownership transfer; its dog-registration guidance also lists lineage and microchip/tattoo-related requirements for relevant cases: https://www.pcci.org.ph/how-tos/register-your-dog/
- PCCI's official forms list shows that registration/document management has multiple distinct document types; Pawzzle should record and track them rather than use one generic checkbox: https://www.pcci.org.ph/forms/view-forms/
- BIR's official registration guidance includes authority/registration requirements for invoices, accounting systems, and POS/CRM. Production compliance should be verified against the business's registration and current BIR rules: https://www.bir.gov.ph/registration-requirements-details

## 15. Final Recommendation to the Thesis Team

The thesis should claim neither “AI” nor “DSS” merely because it displays charts or fixed alerts. Its defensible contribution is an integrated, explainable decision process:

`clean operational data -> validated forecast/score -> constrained alternatives -> explained recommendation -> owner decision -> workflow action -> measured outcome`

For a BSIT capstone, depth is more persuasive than breadth. The strongest demonstrable slice is:

1. purchase and receive vaccine/product lots;
2. monitor lot expiry and FEFO stock;
3. sell a product or administer a vaccine through a qualified appointment;
4. record payment, VAT configuration, cost, and profit;
5. forecast demand and generate a traceable reorder recommendation;
6. compare suppliers and convert the approved recommendation into a purchase request;
7. deliver an order with a calculated fee and accountable rider;
8. show the result in a role-appropriate dashboard and audit trail.

That end-to-end scenario directly addresses operations, customer/pet care, compliance, logistics, finance, and real decision support while remaining feasible to implement and evaluate.
