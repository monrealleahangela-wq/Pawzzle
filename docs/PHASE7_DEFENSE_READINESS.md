# Pawzzle Phase 7 Defense Readiness

This document summarizes the verified application structure at the Phase 7 checkpoint. `PASS` means the complete code path and automated coverage were confirmed locally. `UNVERIFIED` means the path is present and protected, but its final behavior depends on a live database or third-party service and must be exercised in staging.

## Feature completion checklist

### Authentication and accounts

- ✅ Customer registration and OTP verification
- ✅ Login, logout, JWT session handling, and role redirects
- ✅ Forgot-password and password-reset flow
- ✅ Protected profile updates and customer-only public registration
- ✅ Google OAuth callback integration (live provider verification remains)

### Customer and pet care

- ✅ Customer profile and pet profiles
- ✅ Optional dog-only PCCI/pedigree information
- ✅ Marketplace, product catalog, cart, checkout, and orders
- ✅ Services, booking calendar, and pet-service recommendations
- ✅ Booking proposal, qualified specialist selection, and customer confirmation
- ✅ Care timeline, check-in, progress messages, aftercare, and service summary
- ✅ Completed-booking reviews and specialist rating aggregation
- ✅ Notifications, conversations, and delivery tracking paths

### Store operations

- ✅ Store dashboard and operational analytics
- ✅ Products, pets, services, orders, bookings, customers, and vouchers
- ✅ Inventory, service supplies, procurement, suppliers, and finance
- ✅ Staff onboarding, profiles, schedules, availability, verification, and archive
- ✅ Store-scoped role management with inherited permissions
- ✅ Logistics, dispatcher, rider, reports, reviews, and store settings
- ✅ Store-level refund policy and customer acknowledgement
- ✅ Explainable DSS recommendations, forecasts, risks, and health score

### Platform and supplier operations

- ✅ Platform dashboard, stores, users, reports, payouts, and platform insights
- ✅ Supplier onboarding, profile, catalog, purchase orders, and invoices
- ✅ Platform/store role aliases and tenant-scoped authorization

### Integrations and safeguards

- ✅ PayMongo-only payment lifecycle and idempotent status handling
- ✅ Authenticated and room-authorized Socket.IO events
- ✅ Cloudinary upload ownership controls
- ✅ Notification delivery with polling fallback
- ✅ Role-based and resource-level authorization

## End-to-end UAT classification

### Customer

| Journey | Result | Evidence / limitation |
| --- | --- | --- |
| Register, OTP, login, logout, forgot/reset password | PASS | Frontend, auth API, validation, controller, and security tests are connected. |
| Profile update and add pet | PASS | Ownership-scoped APIs and protected profile allowlist are covered. |
| Browse products and services | PASS | Public catalog routes and customer pages are mounted. |
| Book service and receive/accept proposal | PASS | Proposal state transitions, qualification, confirmation, and tests are connected. |
| Pay | UNVERIFIED | PayMongo-only path and webhook handling are present; live gateway credentials are required. |
| Timeline, check-in, care messages, and service summary | PASS | Booking lifecycle APIs, UI, authorization, and regression tests are connected. |
| Progress photos | UNVERIFIED | Authorized upload/timeline path is present; live Cloudinary must be exercised. |
| Review and notifications | PASS | Completion gate, duplicate prevention, notification routes, and tests are connected. |
| Delivery tracking | UNVERIFIED | Capability and room authorization are present; live Socket.IO/location infrastructure is required. |

### Store owner

| Journey | Result | Evidence / limitation |
| --- | --- | --- |
| Dashboard, products, pets, services, bookings, and orders | PASS | Frontend routes, scoped APIs, controllers, and role checks are connected. |
| Staff and role management | PASS | Store-scoped staff CRUD, archive, schedules, verification, and role-policy UI are connected. |
| Inventory, procurement, suppliers, and finance | PASS | Permission-gated routes and related models/controllers are connected. |
| Reports, DSS, refund policy, and settings | PASS | Store scoping and dashboard/settings integrations are connected. |
| Database persistence across all CRUD journeys | UNVERIFIED | Requires a staging MongoDB dataset and real store accounts. |

### Specialized staff

| Role | Authorized workflow | Result |
| --- | --- | --- |
| Manager | Configured same-store operational permissions | PASS |
| Cashier | Customer/product visibility, sales, and payments | PASS |
| Inventory Staff | Inventory operations, receiving, and inventory reporting | PASS |
| Procurement Officer | Procurement, suppliers, and related DSS | PASS |
| Finance Staff | Finance, payment administration, and finance reporting | PASS |
| Veterinarian | Assigned bookings, clinical records, vaccinations, and care updates | PASS |
| Groomer, Trainer, Boarding Staff | Assigned services, progress, and care updates | PASS |
| Delivery Dispatcher | Same-store assignment and logistics management | PASS |
| Delivery Rider | Assigned deliveries and rider-owned status updates | PASS |

Assigned-workflow execution against real records remains a staging UAT item.

## User roles matrix

| Role | Primary access | Scope |
| --- | --- | --- |
| Platform Admin (`super_admin`, `platform_admin`) | Platform dashboard, users, stores, reports, payouts, global oversight | Platform-wide |
| Store Owner (`admin`, `store_owner`) | All configured store operations, staff, roles, finance, reports, and settings | Own store |
| Manager | Broad operations according to the store's Manager role policy | Own store |
| Cashier | Customers, pets/products visibility, sales, and payment creation | Own store |
| Inventory Staff | Products, inventory, receiving, adjustments, and inventory reports | Own store |
| Procurement Officer | Inventory view, procurement, suppliers, and supplier DSS | Own store |
| Finance Staff | Sales/procurement view, finance, payment management, finance reports | Own store |
| Veterinarian | Assigned bookings, clinical care, vaccinations, and customer-safe updates | Assigned work / own store |
| Groomer | Assigned grooming services and progress updates | Assigned work / own store |
| Trainer | Assigned training services and progress updates | Assigned work / own store |
| Boarding Staff | Assigned boarding care and progress updates | Assigned work / own store |
| Delivery Dispatcher | Delivery assignment, tracking, and reporting | Own store |
| Delivery Rider | Own assigned deliveries and permitted status/location updates | Assigned deliveries |
| Customer | Own account, pets, orders, bookings, messages, and deliveries | Own records |
| Supplier | Own profile, catalog, purchase orders, and supplier invoices | Own supplier records |

Role permissions are inherited per role and can be configured per store. Explicit denial takes precedence; individual employee permission overrides are not used.

## Panel summary

Pawzzle is a multi-store pet commerce and service-management platform. Customers manage pets, shop, book services, review specialist proposals, pay through PayMongo, follow a real-time care timeline, receive aftercare, track deliveries, and review completed work. Store owners manage products, pets, services, bookings, orders, customers, staff, role policies, inventory, procurement, suppliers, finance, logistics, refunds, reports, and explainable decision support from one tenant-scoped workspace. Specialized professionals receive only their assigned workflows, suppliers manage their own procurement-facing records, and platform administrators oversee stores, users, payouts, reports, and platform health. Authentication, canonical role aliases, per-role RBAC, resource ownership, tenant isolation, authenticated real-time rooms, and upload ownership protect every layer.

## Remaining live verification items

- MongoDB: execute full CRUD and concurrency UAT with representative multi-store staging data.
- PayMongo: verify successful, failed, cancelled, pending, redirect, and webhook retry behavior using sandbox credentials.
- Cloudinary: upload, display, replace, and delete new and historical assets using staging credentials.
- Socket.IO: validate reconnects, room delivery, public delivery capabilities, and location events over deployed infrastructure.
- Google OAuth: verify provider consent, callback, canonical role redirect, and logout in the deployed origin.
- Email/OTP: verify sender configuration, delivery, expiry, resend throttling, and password-reset messages.
- Responsive UAT: perform keyboard, screen-reader, and representative-device checks in deployed Chromium, Firefox, and Safari/WebKit.

