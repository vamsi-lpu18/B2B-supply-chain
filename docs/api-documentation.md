# Supply Chain Platform API Documentation

## 1. Purpose
This document is the implementation-aligned API contract reference for gateway routes and downstream service endpoints.

## 2. Base URLs
- Gateway base URL: `http://localhost:5000`
- Service direct URLs:
  - IdentityAuth: `http://localhost:8001`
  - CatalogInventory: `http://localhost:8002`
  - Order: `http://localhost:8003`
  - LogisticsTracking: `http://localhost:8004`
  - PaymentInvoice: `http://localhost:8005`
  - Notification: `http://localhost:8006`

## 3. Gateway Routing and Headers

### 3.1 Route families
- `/identity/{everything}` -> IdentityAuth
- `/catalog/{everything}` -> CatalogInventory
- `/orders/{everything}` -> Order
- `/logistics/{everything}` -> LogisticsTracking
- `/payments/{everything}` -> PaymentInvoice
- `/notifications/{everything}` -> Notification

### 3.2 Public gateway exceptions
These are explicitly public at gateway level:
- `POST /identity/api/auth/{everything}`
- `GET /payments/api/payment/dealers/{dealerId}/credit-check`
- `POST /notifications/api/notifications/ingest`

### 3.3 Required/important headers
- `Authorization: Bearer <accessToken>` for protected routes
- `X-Correlation-Id: <uuid>` for request traceability
- `Oc-Client: <client-id>` for Ocelot rate-limit identity key
- `X-Internal-Api-Key: <shared-secret>` for internal allow-anonymous endpoints

### 3.4 Gateway policy defaults
- JWT auth on protected routes
- QoS/circuit breaker options per route family
- Rate limit default: 500 requests/min per `Oc-Client`
- Global base URL: `http://localhost:5000`

### 3.5 Load balancer demo routes
Round-robin demo paths:
- `/identity-lb/api/auth/{everything}`
- `/catalog-lb/api/products/{everything}`
- `/orders-lb/{everything}`
- `/logistics-lb/{everything}`
- `/payments-lb/api/payment/dealers/{dealerId}/credit-check`
- `/notifications-lb/api/notifications/ingest`

## 4. Authentication and Token Lifecycle

### 4.1 Login flow
1. Client calls `POST /identity/api/auth/login`.
2. Response contains access token and sets `refreshToken` cookie.
3. Access token is used in `Authorization` header for protected APIs.

### 4.2 Refresh flow
1. Client calls `POST /identity/api/auth/refresh` with refresh cookie.
2. New access token is returned and refresh cookie is rotated.

### 4.3 Logout flow
- `POST /identity/api/auth/logout` revokes token context and clears refresh cookie.

## 5. API Endpoint Catalog

## 5.1 IdentityAuth API
Gateway prefix: `/identity`

| Method | Service Path | Gateway Path | Auth | Roles | Notes |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | `/identity/api/auth/register` | No | Public | Dealer self-registration |
| POST | `/api/auth/login` | `/identity/api/auth/login` | No | Public | Returns access token and refresh cookie |
| POST | `/api/auth/refresh` | `/identity/api/auth/refresh` | No | Public | Uses refresh cookie |
| POST | `/api/auth/forgot-password` | `/identity/api/auth/forgot-password` | No | Public | OTP/reset initiation |
| POST | `/api/auth/reset-password` | `/identity/api/auth/reset-password` | No | Public | OTP/reset completion |
| POST | `/api/auth/logout` | `/identity/api/auth/logout` | Yes | Any authenticated | Access token + optional refresh token body |
| GET | `/api/users/profile` | `/identity/api/users/profile` | Yes | Any authenticated | Returns current profile |
| GET | `/api/admin/dealers` | `/identity/api/admin/dealers` | Yes | Admin | Paged dealer list |
| GET | `/api/admin/dealers/{id}` | `/identity/api/admin/dealers/{id}` | Yes | Admin | Dealer detail |
| PUT | `/api/admin/dealers/{id}/approve` | `/identity/api/admin/dealers/{id}/approve` | Yes | Admin | Approves pending dealer |
| PUT | `/api/admin/dealers/{id}/reject` | `/identity/api/admin/dealers/{id}/reject` | Yes | Admin | Rejects pending dealer |
| PUT | `/api/admin/dealers/{id}/credit-limit` | `/identity/api/admin/dealers/{id}/credit-limit` | Yes | Admin | Syncs to Payment internal API |
| GET | `/api/internal/users/{id}/contact` | `/identity/api/internal/users/{id}/contact` | Internal key | Internal | `X-Internal-Api-Key` required |

## 5.2 CatalogInventory API
Gateway prefix: `/catalog`

| Method | Service Path | Gateway Path | Auth | Roles | Notes |
|---|---|---|---|---|---|
| POST | `/api/products` | `/catalog/api/products` | Yes | Admin | Create product |
| PUT | `/api/products/{id}` | `/catalog/api/products/{id}` | Yes | Admin | Update product |
| PUT | `/api/products/{id}/deactivate` | `/catalog/api/products/{id}/deactivate` | Yes | Admin | Soft deactivation |
| POST | `/api/products/{id}/restock` | `/catalog/api/products/{id}/restock` | Yes | Admin, Warehouse | Restock |
| GET | `/api/products` | `/catalog/api/products` | Optional | Public | Paging and optional inactive filter |
| GET | `/api/products/categories` | `/catalog/api/products/categories` | Optional | Public | Category list |
| GET | `/api/products/{id}` | `/catalog/api/products/{id}` | Optional | Public | Product detail |
| GET | `/api/products/search` | `/catalog/api/products/search` | Optional | Public | Search by q |
| GET | `/api/products/{id}/stock` | `/catalog/api/products/{id}/stock` | Yes | Admin, Warehouse | Stock level |
| GET | `/api/products/{id}/reviews` | `/catalog/api/products/{id}/reviews` | Optional | Public/Admin | Admin can include pending reviews |
| POST | `/api/products/{id}/reviews` | `/catalog/api/products/{id}/reviews` | Yes | Dealer | Dealer review creation |
| PUT | `/api/products/reviews/{reviewId}/approve` | `/catalog/api/products/reviews/{reviewId}/approve` | Yes | Admin | Moderation approve |
| PUT | `/api/products/reviews/{reviewId}/reject` | `/catalog/api/products/reviews/{reviewId}/reject` | Yes | Admin | Moderation reject |
| POST | `/api/inventory/soft-lock` | `/catalog/api/inventory/soft-lock` | Yes | Admin, Dealer, OrderService | Reserve stock |
| POST | `/api/inventory/hard-deduct` | `/catalog/api/inventory/hard-deduct` | Yes | Admin, Warehouse, Logistics | Final deduction |
| POST | `/api/inventory/release-soft-lock` | `/catalog/api/inventory/release-soft-lock` | Yes | Admin, OrderService | Release reservation |
| POST | `/api/inventory/subscriptions` | `/catalog/api/inventory/subscriptions` | Yes | Dealer | Subscribe low-stock alert |
| DELETE | `/api/inventory/subscriptions` | `/catalog/api/inventory/subscriptions` | Yes | Dealer | Unsubscribe low-stock alert |

## 5.3 Order API
Gateway prefix: `/orders`

| Method | Service Path | Gateway Path | Auth | Roles | Notes |
|---|---|---|---|---|---|
| POST | `/api/orders` | `/orders/api/orders` | Yes | Dealer | Create order |
| GET | `/api/orders/my` | `/orders/api/orders/my` | Yes | Dealer | Dealer orders |
| GET | `/api/orders/{id}` | `/orders/api/orders/{id}` | Yes | Role-scoped | Dealer ownership enforced |
| GET | `/api/orders/{id}/saga` | `/orders/api/orders/{id}/saga` | Yes | Role-scoped | Saga state view |
| PUT | `/api/orders/{id}/status` | `/orders/api/orders/{id}/status` | Yes | Admin, Warehouse, Logistics | Status transition |
| POST | `/api/orders/{id}/cancel` | `/orders/api/orders/{id}/cancel` | Yes | Dealer, Admin | Cancel with reason |
| POST | `/api/orders/{id}/returns` | `/orders/api/orders/{id}/returns` | Yes | Dealer | Return request |
| GET | `/api/admin/orders` | `/orders/api/admin/orders` | Yes | Admin, Warehouse, Logistics | Paged all-orders view |
| GET | `/api/admin/orders/analytics` | `/orders/api/admin/orders/analytics` | Yes | Admin, Warehouse, Logistics | Purchase KPIs, top dealers, top products |
| POST | `/api/admin/orders/bulk-status` | `/orders/api/admin/orders/bulk-status` | Yes | Admin, Warehouse, Logistics | Validate/apply bulk transition |
| PUT | `/api/admin/orders/{id}/approve-hold` | `/orders/api/admin/orders/{id}/approve-hold` | Yes | Admin, Warehouse, Logistics | Approve hold |
| PUT | `/api/admin/orders/{id}/reject-hold` | `/orders/api/admin/orders/{id}/reject-hold` | Yes | Admin, Warehouse, Logistics | Reject hold |
| PUT | `/api/admin/orders/{id}/approve-return` | `/orders/api/admin/orders/{id}/approve-return` | Yes | Admin | Approve return |
| PUT | `/api/admin/orders/{id}/reject-return` | `/orders/api/admin/orders/{id}/reject-return` | Yes | Admin | Reject return |

## 5.4 LogisticsTracking API
Gateway prefix: `/logistics`

| Method | Service Path | Gateway Path | Auth | Roles | Notes |
|---|---|---|---|---|---|
| POST | `/api/logistics/shipments` | `/logistics/api/logistics/shipments` | Yes | Admin, Warehouse, Logistics | Create shipment |
| GET | `/api/logistics/shipments/{shipmentId}` | `/logistics/api/logistics/shipments/{shipmentId}` | Yes | All authenticated | Dealer/Agent ownership checks |
| GET | `/api/logistics/shipments/my` | `/logistics/api/logistics/shipments/my` | Yes | Dealer | Dealer shipments |
| GET | `/api/logistics/shipments` | `/logistics/api/logistics/shipments` | Yes | Admin, Warehouse, Logistics | All shipments |
| GET | `/api/logistics/shipments/assigned` | `/logistics/api/logistics/shipments/assigned` | Yes | Agent | Agent-assigned shipments |
| PUT | `/api/logistics/shipments/{shipmentId}/assign-agent` | `/logistics/api/logistics/shipments/{shipmentId}/assign-agent` | Yes | Admin, Logistics | Assign agent |
| PUT | `/api/logistics/shipments/{shipmentId}/assign-vehicle` | `/logistics/api/logistics/shipments/{shipmentId}/assign-vehicle` | Yes | Admin, Logistics | Assign vehicle |
| PUT | `/api/logistics/shipments/{shipmentId}/status` | `/logistics/api/logistics/shipments/{shipmentId}/status` | Yes | Admin, Logistics, Agent | Agent limited to own assignments |
| GET | `/api/logistics/shipments/{shipmentId}/ops-state` | `/logistics/api/logistics/shipments/{shipmentId}/ops-state` | Yes | Admin, Warehouse, Logistics, Agent, Dealer | Access scope checks |
| POST | `/api/logistics/shipments/ops-states/batch` | `/logistics/api/logistics/shipments/ops-states/batch` | Yes | Admin, Warehouse, Logistics, Agent, Dealer | Dealer/Agent filtered by ownership |
| PUT | `/api/logistics/shipments/{shipmentId}/ops-state` | `/logistics/api/logistics/shipments/{shipmentId}/ops-state` | Yes | Admin, Logistics | Upsert ops state |
| POST | `/api/logistics/shipments/{shipmentId}/ai-recommendation` | `/logistics/api/logistics/shipments/{shipmentId}/ai-recommendation` | Yes | Admin, Warehouse, Logistics | Create AI recommendation |
| POST | `/api/logistics/shipments/ai-recommendations/{recommendationId}/approve` | `/logistics/api/logistics/shipments/ai-recommendations/{recommendationId}/approve` | Yes | Admin, Logistics | Approve AI recommendation |

## 5.5 PaymentInvoice API
Gateway prefix: `/payments`

| Method | Service Path | Gateway Path | Auth | Roles | Notes |
|---|---|---|---|---|---|
| POST | `/api/payment/gateway/orders` | `/payments/api/payment/gateway/orders` | Yes | Dealer | Creates Razorpay order |
| POST | `/api/payment/gateway/verify` | `/payments/api/payment/gateway/verify` | Yes | Dealer | Signature verification |
| POST | `/api/payment/dealers/{dealerId}/account` | `/payments/api/payment/dealers/{dealerId}/account` | Yes | Admin | Ensure dealer account |
| GET | `/api/payment/dealers/{dealerId}/credit-check` | `/payments/api/payment/dealers/{dealerId}/credit-check` | No | Public | Used by order placement path |
| PUT | `/api/payment/dealers/{dealerId}/credit-limit` | `/payments/api/payment/dealers/{dealerId}/credit-limit` | Yes | Admin | External/admin credit update |
| PUT | `/api/payment/internal/dealers/{dealerId}/credit-limit` | `/payments/api/payment/internal/dealers/{dealerId}/credit-limit` | Internal key | Internal | `X-Internal-Api-Key` required |
| POST | `/api/payment/dealers/{dealerId}/settlements` | `/payments/api/payment/dealers/{dealerId}/settlements` | Yes | Admin, Dealer | Dealer scope enforced |
| POST | `/api/payment/invoices` | `/payments/api/payment/invoices` | Yes | Admin | Generate invoice |
| GET | `/api/payment/invoices/{invoiceId}` | `/payments/api/payment/invoices/{invoiceId}` | Yes | Admin, Dealer | Invoice detail |
| GET | `/api/payment/dealers/{dealerId}/invoices` | `/payments/api/payment/dealers/{dealerId}/invoices` | Yes | Admin, Dealer | Dealer scope enforced |
| GET | `/api/payment/invoices/{invoiceId}/workflow` | `/payments/api/payment/invoices/{invoiceId}/workflow` | Yes | Admin, Dealer | Workflow state |
| GET | `/api/payment/dealers/{dealerId}/invoice-workflows` | `/payments/api/payment/dealers/{dealerId}/invoice-workflows` | Yes | Admin, Dealer | Dealer workflow list |
| PUT | `/api/payment/invoices/{invoiceId}/workflow` | `/payments/api/payment/invoices/{invoiceId}/workflow` | Yes | Admin, Dealer | Upsert workflow |
| GET | `/api/payment/invoices/{invoiceId}/workflow-activities` | `/payments/api/payment/invoices/{invoiceId}/workflow-activities` | Yes | Admin, Dealer | Activity timeline |
| POST | `/api/payment/invoices/{invoiceId}/workflow-activities` | `/payments/api/payment/invoices/{invoiceId}/workflow-activities` | Yes | Admin, Dealer | Add activity |
| GET | `/api/payment/invoices/{invoiceId}/download` | `/payments/api/payment/invoices/{invoiceId}/download` | Yes | Admin, Dealer | Returns PDF file |

## 5.6 Notification API
Gateway prefix: `/notifications`

| Method | Service Path | Gateway Path | Auth | Roles | Notes |
|---|---|---|---|---|---|
| POST | `/api/notifications/manual` | `/notifications/api/notifications/manual` | Yes | Admin | Manual notification |
| POST | `/api/notifications/ingest` | `/notifications/api/notifications/ingest` | No | Public integration | Event ingest endpoint |
| GET | `/api/notifications/my` | `/notifications/api/notifications/my` | Yes | Any authenticated | Recipient feed |
| GET | `/api/notifications` | `/notifications/api/notifications` | Yes | Admin | All notifications |
| GET | `/api/notifications/{notificationId}` | `/notifications/api/notifications/{notificationId}` | Yes | Admin or recipient | Recipient ownership enforced |
| PUT | `/api/notifications/{notificationId}/sent` | `/notifications/api/notifications/{notificationId}/sent` | Yes | Admin | Mark sent |
| PUT | `/api/notifications/{notificationId}/failed` | `/notifications/api/notifications/{notificationId}/failed` | Yes | Admin | Mark failed |
| PUT | `/api/notifications/{notificationId}/read` | `/notifications/api/notifications/{notificationId}/read` | Yes | Admin or recipient | Mark read |
| PUT | `/api/notifications/{notificationId}/unread` | `/notifications/api/notifications/{notificationId}/unread` | Yes | Admin or recipient | Mark unread |

## 6. Common Response Patterns
- `200 OK`: successful query or command
- `201 Created`: resource creation with location-style response in some controllers
- `400 Bad Request`: validation/domain rule failure
- `401 Unauthorized`: invalid or missing auth/internal key
- `403 Forbidden`: role/scope mismatch
- `404 Not Found`: missing entity or inaccessible scoped entity
- `409 Conflict`: inventory lock/deduct conflicts
- `429 Too Many Requests`: gateway rate limit exceeded
- `502 Bad Gateway`: upstream sync failure (for example dealer credit limit propagation)

## 7. Health and OpenAPI
Each service exposes:
- `GET /health`
- Development-only OpenAPI endpoints (`/openapi/v1.json` style from ASP.NET OpenAPI package)
- Swagger UI in development at `/swagger`

## 8. Notes for Consumers
- Always send `Oc-Client` to avoid accidental shared throttling profiles.
- Always send `X-Correlation-Id` so gateway and services can correlate logs.
- Internal endpoints are intentionally allow-anonymous but secured by `X-Internal-Api-Key`.
- For dealer-scoped resources, backend validates token user id against route dealer id where applicable.
