# Supply Chain Platform Frontend Documentation

## 1. Overview
The frontend is an Angular 21 standalone SPA designed for five roles: Admin, Dealer, Warehouse, Logistics, and Agent.

Primary goals:
- Role-aware navigation and action access
- Unified gateway-backed API access
- Clear operational UX for catalog, orders, logistics, invoices, and notifications

## 2. Runtime and Build Stack
- Angular: `^21.2.0`
- TypeScript: `~5.9.2`
- RxJS: `~7.8.0`
- Test runner: Vitest via Angular test builder
- Styling: SCSS

## 3. Application Structure

## 3.1 Route architecture
Routes are defined in `src/app/app.routes.ts` and split into:
- Public pages: login, register, forgot-password, unauthorized
- Protected shell pages under root shell component with `authGuard`

Protected feature groups:
- Dashboard and profile
- Catalog and product administration
- Cart and checkout (Dealer)
- Orders and tracking
- Shipments
- Invoices
- Notifications
- Admin dealer management

## 3.2 Access control model
- `authGuard`: validates active auth state, attempts refresh-token flow, hydrates profile fallback if needed.
- `roleGuard`: validates route-level role metadata and redirects to unauthorized page on mismatch.

## 3.3 Core feature modules (standalone component groups)
- Auth: login/register/password reset
- Catalog: browse, detail, create/edit (admin), reviews
- Cart/Checkout: dealer purchasing flow
- Orders: list/detail/tracking and role-sensitive status operations
- Logistics: shipment list/detail and role-sensitive controls
- Payments: invoice list/detail and workflow actions
- Notifications: personal/admin notification views and status actions
- Admin: dealer review and credit operations

## 4. State Management

## 4.1 AuthStore
`AuthStore` uses Angular signals and localStorage persistence (`scp.auth.v1`) for:
- current user profile
- access token
- current role
- authentication state

Behavior highlights:
- role normalization to known enum values
- storage hydration on startup
- token update support after refresh

## 4.2 Additional stores
- `LoadingStore`: request-in-flight counter for global loading UI
- `CartStore`: dealer cart and checkout state

## 5. HTTP and Cross-Cutting Interceptors

## 5.1 Correlation and gateway identity
`correlation-id.interceptor.ts` adds:
- `X-Correlation-Id` UUID per request
- `Oc-Client: supply-chain-frontend` for gateway-compatible client identity

## 5.2 Auth header attachment
`auth.interceptor.ts` adds bearer token except for configured public paths:
- auth endpoints
- payment credit-check path
- notification ingest path

## 5.3 Global loading
`loading.interceptor.ts` increments/decrements `LoadingStore` around every request.

## 5.4 Error and refresh behavior
`error.interceptor.ts`:
- handles 401 by triggering refresh flow
- retries queued requests after refresh success
- clears auth and redirects to login on refresh failure
- maps common errors to toast messages (403/429/5xx/startup errors)

## 6. API Integration Pattern
Frontend domain API services call gateway paths:
- `/identity/...`
- `/catalog/...`
- `/orders/...`
- `/logistics/...`
- `/payments/...`
- `/notifications/...`

This keeps CORS/network surface centralized while preserving service separation behind gateway routing.

## 7. Role Experience Matrix (High Level)
- Admin: full governance across dealers, catalog, orders, logistics, payments, notifications
- Dealer: product browsing, cart/checkout, own orders/shipments/invoices/notifications
- Warehouse: restock + operational order/shipment views
- Logistics: shipment assignment/status operations and logistics visibility
- Agent: assigned shipment execution and status updates

## 8. Frontend Test Strategy

## 8.1 Current implementation
- Smoke test confirms test runner readiness: `src/app/smoke.spec.ts`
- SLA domain logic test coverage added: `src/app/core/services/order-sla.service.spec.ts`
  - closed state behavior
  - delayed state behavior
  - at-risk state behavior

## 8.2 Test execution
Run from `supply-chain-frontend`:
- `npm test -- --watch=false`

Validated state:
- 2 test files passed
- 4 tests passed

## 8.3 Recommended next frontend tests
- `InvoiceWorkflowService` normalization and automation patch behavior
- `authGuard` refresh + fallback profile handling
- `error.interceptor` concurrent 401 refresh queue behavior
- `roleGuard` access matrix tests by route data
- feature component interaction tests (order detail, shipment detail, invoice detail)

## 9. UX and Accessibility Notes
- Role-aware menu/actions reduce invalid operations.
- Correlation IDs improve support and issue triage traceability.
- Toast-based feedback is used for user-visible error guidance.
- Responsive shell enables usage across desktop and typical tablet/mobile widths.
