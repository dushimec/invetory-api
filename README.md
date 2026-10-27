# Mwendo Traders Ltd Inventory and Trade Operations Backend

This repository provides the TypeScript/Express API for Mwendo Traders Ltd, backed by PostgreSQL and Prisma. New organizations default to **RWF** and `Africa/Kigali`, with cement, construction-material, heavy-vehicle, trailer, machinery, and spare-parts categories and relevant units. The development seed creates a Mwendo Traders sample workspace; replace sample inventory, contact, and price data with verified company records before use.

## Run locally

Requirements: Node.js 20+, npm, and Docker Compose (or a PostgreSQL 14+ server).

1. Copy `.env.example` to `.env`; replace both JWT secrets with distinct random values of at least 32 characters.
2. Start PostgreSQL with `docker compose up -d db`.
3. Install dependencies and generate the database client:

   ```powershell
   npm install
   npm run db:generate
   ```

4. Apply all committed database migrations:

   ```powershell
   npm run db:deploy
   ```

5. Start the development server with `npm run dev`. Production builds use `npm run build` then `npm start`.

### Render deployment

For a Render service using a custom build command, set the build command to `npm run build:render` and the start command to `npm start`. The build script installs the locked development dependencies explicitly (including TypeScript and `@types/*`) even when Render sets `NODE_ENV=production`, then generates Prisma Client, applies migrations, and compiles the API. Set `DATABASE_URL` and the other required production environment variables in Render's environment settings; do not commit secrets.

On Windows, stop any running local API process before running `npm run build:render` locally. `npm ci` replaces `node_modules`, and Prisma Client generation replaces its query-engine DLL; either can fail with `EPERM` while the API has the DLL loaded. In the API's terminal, press `Ctrl+C`, then rerun the command. Do not use the Render build command as a routine local development command.

The liveness endpoint is `GET /health`; `GET /ready` also checks the database. Swagger UI is at `/api-docs` and the OpenAPI document at `/api-docs/openapi.json`.

The default CORS allowlist includes `http://localhost:5173` (local frontend) and `http://localhost:8003` (API/Swagger on the configured local port). Set `CORS_ORIGINS` in `.env` to a comma-separated list of exact trusted origins when using other ports or hosts. Do not use `*` when credentials are enabled. Restart the server after changing `.env`.

## Development seed

Set `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` in the environment (the password must be at least 12 characters), apply migrations, and run `npm run db:seed`. The repeatable seed creates the `mwendo-traders` RWF workspace, owner, roles/permissions, a Kigali warehouse, trader-oriented units/categories and sample cement/vehicle products with zero prices, sample supplier/customer records, draft orders, opening balances, and ledger records. Replace all sample contacts and stock counts with verified company data. Do not run development seed credentials in production.

## Authentication and tenant isolation

`POST /api/v1/auth/register` registers a new organization and first owner when `ALLOW_ORG_REGISTRATION=true`. Registration creates the user, organization, membership, settings, initial RWF units and trader-oriented categories, permissions, session, and audit entry in a single transaction. Login accepts `email`, `password`, and `organizationSlug`. Access tokens are short-lived JWTs; refresh tokens are JWTs whose SHA-256 hashes are stored in PostgreSQL. Refresh rotates the stored hash; reuse revokes sessions for that user. Use `POST /api/v1/auth/logout` with a bearer access token and `POST /api/v1/auth/refresh` with `{ "refreshToken": "..." }`.

All protected data queries use the organization from the authenticated membership, not a client-provided organization ID. Permissions are checked in route middleware and are loaded from the user's current organization role on each authenticated request. The first owner receives the initial permission set.

## Implemented endpoints

All endpoints are rooted under `/api/v1`.

| Module       | Endpoints                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth         | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`                                                                                                                  |
| Organization | `GET/PATCH /organization/settings` for the business profile, timezone, and stock/procurement policy; updates are audited (base currency is read-only)                                                  |
| Catalog      | `GET/POST /categories`, `GET/POST /units`                                                                                                                                                              |
| Products     | `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `GET /products/barcode/:barcode`                                                                                                               |
| Warehouses   | `GET/POST /warehouses`, `GET /warehouses/:id/stock`                                                                                                                                                    |
| Inventory    | `GET /inventory/balances`, `/inventory/movements`; `POST /inventory/receive`, `/inventory/issue`, `/inventory/adjustments`; transfer lifecycle under `/inventory/transfers`                            |
| Purchasing   | `GET/POST /purchase-orders`, `GET /purchase-orders/:id`, submit/approve/reject/cancel and receipt lifecycle; import purchase orders support currency conversion, shipment references, and landed costs |
| Sales        | `GET/POST /sales-orders`, confirmation/reservation/dispatch/cancellation; per-dispatch delivery history at `/sales-orders/:id/deliveries`                                                                |
| Contacts     | `GET/POST /suppliers`, `GET/PATCH /suppliers/:id`, `GET /suppliers/:id/purchases`; equivalent customer CRUD and `GET /customers/:id/sales`                                                             |
| Reporting    | `GET /dashboard`, `/reports/inventory-valuation`, `/reports/inventory-movements`, `/reports/low-stock`, `/reports/imports`, `/reports/deliveries`                                                      |
| Adjustments  | Draft/submit/approve/post/cancel under `/inventory/adjustment-requests`                                                                                                                                |
| Returns      | Draft/submit/approve/post/cancel under `/returns` for customer and supplier returns                                                                                                                    |
| Users        | `GET/POST /users`, `PATCH /users/:id` for organization membership role/status; `GET/POST /roles`, `PATCH/DELETE /roles/:id` for custom sector roles |
| Audit        | `GET /audit-logs` with actor/entity/action/date filters                                                                                                                                                |

Product, inventory, purchase, sales, contact, and receipt list views are paginated or otherwise bounded (maximum page size 100). Archived products are preserved. Stock-changing endpoints require an `Idempotency-Key` header. Sales reservation, dispatch, and cancellation also require idempotency keys. Quantities and money are passed as decimal strings to avoid authoritative JavaScript floating-point arithmetic. Quantities are in the product's configured base unit. A warehouse is created with a `MAIN` location used when no location is passed. The `products.cost.update` and `products.price.update` permissions are checked separately from general product editing.

Product creation accepts an optional SKU. When omitted, the API assigns the next organization-scoped `SKU-000001`-style value; callers may still supply a manual SKU. To avoid collisions, product creation serializes on the organization record while selecting and storing generated SKUs.

Administrators can use `GET /roles` to review built-in role duties and available permissions, then create/edit/delete custom roles with their own duty descriptions and permission sets using `/roles`. Built-in roles cannot be changed or deleted, and a custom role cannot be deleted while assigned. `GET/POST /users` lists staff or creates an account with an assigned organization role. Admin-created accounts use a temporary password of at least 12 characters; the user must change it through `POST /auth/password/change` before accessing organization features. The temporary password is never returned by the API. Membership changes and role changes are audited.

Default department roles include Storekeeper/Warehouse Manager for receiving and stock operations, Purchasing Officer/Manager for order preparation/approval, Salesperson/Sales Manager for customer sales/order approval and dispatch, Accountant for read/report access, and Auditor for read-only access including audit logs. The owner and administrator roles retain organization-wide permissions.

Purchase orders start as drafts. Imported orders capture purchase currency, the base-currency exchange rate, origin/shipment details, and freight/customs/insurance/other charges in the purchase currency. Landed charges are allocated across order lines by purchase value and, with the exchange rate, included in the base-currency unit cost when receipts are posted. An exchange rate is required for foreign-currency orders; zero-value orders cannot carry allocatable landed charges. Submitting requires approval by default; approval/rejection is permission-gated and observes separation of duties. Goods receipt drafts are tied to purchase-order line IDs and do not affect stock. Posting locks the receipt and related purchase order, checks outstanding receipt quantities again, writes receipt movements and moving weighted-average costs, updates received totals and status, and records an audit event in the same transaction. Reposting an already-posted receipt returns the posted document without repeating stock changes.

Sales orders start as drafts and use current product selling prices. Confirmation does not issue stock. Reservation locks each relevant location balance and reserves only available units; dispatch consumes reservations and on-hand stock together and creates negative ledger movements in one transaction. Each dispatch creates a separate shipment record with its dispatched lines; use `GET /sales-orders/:id/deliveries` and `PATCH /sales-orders/:id/deliveries/:deliveryId` to track carrier/driver, reference, ETA, delivery state, and optional proof-of-delivery URL. Delivery updates are audited. Cancellation releases unfulfilled reservations. Available quantities are `onHand - reserved`. The current sales schema does not support taxes, discounts, payment collection, or multiple price overrides.

Transfers are submitted and approved before dispatch; the creator cannot approve their own transfer. Dispatch deducts source stock and writes immutable `TRANSFER_OUT` ledger movements in one transaction. The transfer remains in transit until receipt. Destination stock is increased only for quantities explicitly received, with partial receipts supported and over-receipts rejected. Every dispatch/receipt requires an idempotency key; each transition and stock movement is audited. Transfers use the active `MAIN` location in each warehouse.

## Mwendo trade workflows

- **Import and receive:** Create a `procurementType: "IMPORT"` purchase order with its supplier, expected arrival, source currency, exchange rate, shipment reference/origin, and freight/customs/insurance/other costs. Submit and approve it using the existing purchase controls. Create a receipt against its purchase-order lines and post the receipt; the service converts source unit costs and purchase-value-allocated landed charges into base currency before updating moving-average inventory cost.
- **Sell and deliver:** Create a sales order with customer, items, delivery address, and optional ETA. Confirm it, reserve available stock, then dispatch all or part of the reserved quantities. Each dispatch starts its own shipment in `IN_TRANSIT`; maintain that shipment through `/sales-orders/:id/deliveries/:deliveryId`, including carrier/driver/tracking details, status and optional proof-of-delivery URL.
- **Monitor operations:** `GET /dashboard` includes in-transit and overdue delivery counts. `/reports/imports` summarizes import orders by purchase currency and converted base-currency amount; `/reports/deliveries` lists delivery status and overdue ETAs.

Adjustment requests are drafts containing signed, non-zero deltas. They must be submitted and approved before posting; the creator cannot approve their own request when separation of duties is enabled. Posting serializes the request and each affected balance, refuses to reduce on-hand below reservations, observes the organization negative-stock policy, writes ledger entries, and marks the request posted atomically. The existing `/inventory/adjustments` endpoint remains the direct reasoned adjustment path for authorized users.

Returns require a fulfilled sales order (customer return) or received purchase order (supplier return) in the same organization and warehouse. Returns have a draft/submit/approve/post lifecycle with separation of duties. Posting locks the source order and stock balances, checks that total posted returns do not exceed quantities issued/received, then writes the appropriate return movement and adjusts moving-average stock valuation atomically. Returned customer goods are added to available inventory; supplier returns remove only unreserved stock.

Reports are tenant-filtered. Import reports show purchase totals by source currency and their converted base-currency totals; delivery reports show in-transit, delivered, failed, and overdue shipments. Valuation reports are current snapshots only; historical valuation is not supported. Low-stock rows compare each location balance's available quantity against the product reorder level. `inventory.adjust.direct` is restricted to the owner/administrator default roles; other adjustment permissions use the staged approval flow.

## Stock ledger and valuation behavior

Each stock write runs in a PostgreSQL transaction. The service ensures a balance row exists, locks it with `SELECT ... FOR UPDATE`, validates stock availability inside the lock, updates the denormalized balance, records an immutable movement, and writes an audit entry. Unique organization-scoped idempotency keys and movement request fingerprints prevent a retry from posting a second movement or replaying a different payload. Negative stock is rejected unless `organization_settings.allowNegativeStock` is explicitly enabled.

`InventoryBalance` is a denormalized current-state table. Its on-hand quantity should equal the sum of `InventoryMovement.quantityDelta` for the same organization/product/warehouse/location; reserved is tracked separately and available is `onHand - reserved`. `GET /api/v1/inventory/reconciliation` compares these records in a database aggregation, reports at most 100 mismatches, and never silently rewrites balances. The movement ledger is append-only through these APIs. Receipts update moving weighted-average unit cost; issues use the current average cost. Imported goods use the purchase-order exchange rate and purchase-value landed-cost allocation at receipt posting. This is inventory valuation support, not a complete accounting ledger; tax accounting and historical valuation reports are not implemented.

## Configuration and security

Configuration is validated on startup. Set explicit comma-separated CORS origins, use HTTPS and strong separate JWT secrets in production, and use a least-privilege PostgreSQL role. Helmet, request-body limits, structured Pino logs with sensitive-value redaction, request IDs, and rate limiting for authentication routes are enabled. The supplied Docker Compose database credentials are for local development only.

## Tests

Run `npm test`. Current automated tests cover request validation, basic API behavior, and default RBAC permission boundaries. Stock workflow integration tests—including multi-connection concurrency tests—still require a dedicated test PostgreSQL database and are not yet included.

## Known incomplete work

The current working API includes purchase approval and goods-receipt posting, import currency conversion and landed-cost allocation, sales confirmation/reservation/dispatch and delivery tracking, inter-warehouse transfers, approved adjustment requests, linked customer/supplier returns, summary and inventory/import/delivery reports, staff account creation with mandatory temporary-password change, custom sector-role management, audit-log search, and supplier/customer CRUD in addition to authentication, products, warehouses, and direct inventory movements. Still incomplete: sales payment/tax/discount handling, staged physical stock counts, FEFO/FIFO picking, password reset delivery, MFA/email verification, file uploads (proof of delivery accepts a URL only), notification delivery, CSV import/export, warehouse authorization assignments, complete OpenAPI schemas/examples, and database integration/concurrency/security tests. Do not treat these areas as implemented or the system as production-complete.

The configured local database credentials are examples only. Deployment has not been verified against a running PostgreSQL instance in this workspace; apply migrations in order on a dedicated database before using data-bearing endpoints.
