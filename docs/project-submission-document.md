# Supply Chain Platform - Project Submission Document

## 1. Document Control
- Document Name: Project Submission Document
- System: Supply Chain Platform
- Version: 1.0
- Date: 2026-04-02
- Prepared For: Project submission and architecture preparation (HLD and LLD)

## 2. Executive Summary
Supply Chain Platform is an enterprise multi-role application that digitizes the full lifecycle from dealer onboarding to catalog browsing, ordering, fulfillment, shipment tracking, invoicing, collections, and notifications.

The solution uses:
- Angular frontend (role-aware SPA)
- Ocelot API Gateway (single entry point)
- 6 domain-aligned .NET microservices
- SQL Server per service database
- RabbitMQ event backbone with Outbox pattern
- Redis for cache and idempotency helpers

This architecture supports clear domain separation, independent service scaling, and reliable cross-service event delivery.

## 3. Business Problem and Goals
### 3.1 Business Problem
Manual or fragmented workflows in distribution operations create delays, reduced visibility, and inconsistent communication between operations teams and dealers.

### 3.2 Platform Goals
- Centralized identity and role-based access
- Accurate product and stock visibility
- Controlled order lifecycle with hold/approval flow
- Shipment assignment and timeline tracking
- Invoice and payment workflow management
- Reliable in-app/email notification delivery
- Operational observability through gateway metrics and logs

## 4. Users and Roles
The system supports 5 primary roles:
- Admin
- Dealer
- Warehouse
- Logistics
- Agent

### 4.1 Role Responsibilities (Brief)
- Admin: Governs the platform, approves dealers, manages products, supervises orders/shipments/payments/notifications.
- Dealer: Registers account, places orders, tracks orders and shipments, views invoices and notifications.
- Warehouse: Restocks inventory and drives fulfillment-side order and shipment operations.
- Logistics: Assigns agents/vehicles and controls shipment execution lifecycle.
- Agent: Executes assigned delivery operations and updates shipment statuses.

## 5. Functional Scope (What the Project Does)

### 5.1 Identity and Access
- Dealer self-registration
- Login/refresh/logout token lifecycle
- Forgot/reset password OTP flow
- Dealer approval/rejection by admin
- Dealer credit-limit update trigger
- Profile retrieval for authenticated users
- Internal user contact lookup for inter-service communication

### 5.2 Catalog and Inventory
- Product and category management
- Product activation/deactivation
- Restock operation for Admin/Warehouse
- Product browse/search/detail for user journeys
- Product reviews with admin moderation (approve/reject)
- Inventory soft lock, hard deduct, and release
- Stock subscription/unsubscription for alerts

### 5.3 Order Management
- Dealer order placement
- Dealer order list and order details
- Order saga state visibility per order
- Role-based order status updates
- Order cancel flow
- Return request flow
- Credit hold path with approval/rejection
- Admin return approval/rejection operations
- Bulk status transitions for staff/admin operations

### 5.4 Logistics Tracking
- Shipment creation
- Shipment list/detail by role
- Agent assigned-shipment view
- Agent and vehicle assignment
- Shipment status updates across delivery lifecycle
- Shipment ops-state read and upsert APIs
- Batch ops-state query for operational dashboards
- AI recommendation generation and approval for shipment handling

### 5.5 Payment and Invoice
- Dealer account seeding
- Credit check API by amount
- Credit-limit update API (admin + internal)
- Settlement operations
- Payment gateway order creation and verification
- Invoice generation, retrieval, list, and PDF download
- Invoice collection workflow state and activity timeline

### 5.6 Notification Management
- Manual notification creation
- Integration event ingest API
- Recipient-specific notification feed
- Admin view of all notifications
- Notification sent/failed/read/unread state updates
- Email dispatch and digest processing

## 6. Verified Technology Stack

### 6.1 Runtime and Languages
- .NET SDK: 10.0.104 (global.json)
- C#: net10.0 services and gateway
- TypeScript: ~5.9.2 (frontend)
- Node.js tooling via Angular CLI

### 6.2 Frontend Stack
- Angular: ^21.2.0
- Angular CLI: 21.2.5
- RxJS: ~7.8.0
- SCSS styling
- Standalone components and lazy route loading
- HTTP interceptors for auth, correlation, loading, and error handling
- Vitest-based unit test setup via Angular test builder

### 6.3 Backend Stack
- ASP.NET Core Web API (net10.0)
- Ocelot 24.1.0 + Ocelot.Provider.Polly
- JWT Bearer authentication (Microsoft.AspNetCore.Authentication.JwtBearer 10.0.5)
- Entity Framework Core 10.0.5 + SQL Server provider
- MediatR 14.1.0
- FluentValidation 12.1.1
- Serilog.AspNetCore 10.0.0
- Swashbuckle.AspNetCore 10.1.7
- OpenAPI support in services and gateway

### 6.4 Data and Messaging
- SQL Server (database per microservice)
- RabbitMQ 4.1 management image (topic exchange pattern)
- Redis 7.4 (cache and idempotency support)

### 6.5 Specialized Libraries
- MailKit 4.15.1 + MimeKit 4.15.1 (email transport)
- QuestPDF 2026.2.4 (invoice PDF generation)
- StackExchange.Redis 2.12.8
- RabbitMQ.Client 7.2.1
- Polly 8.6.6
- Hangfire.Core 1.8.23 (scheduled/background support in infrastructure)

## 7. System Architecture (High-Level)

### 7.1 Architecture Style
- Domain-oriented microservices
- API Gateway at edge
- Database per service
- Event-driven integration for cross-domain updates
- Outbox pattern for reliable publication

### 7.2 Core Runtime Components
- Frontend SPA: Angular app for all role-based user journeys
- API Gateway: Ocelot gateway, route governance, rate limiting, correlation propagation
- Core Services:
  - IdentityAuth (port 8001)
  - CatalogInventory (port 8002)
  - Order (port 8003)
  - LogisticsTracking (port 8004)
  - PaymentInvoice (port 8005)
  - Notification (port 8006)
- Supporting Infrastructure:
  - SQL Server
  - RabbitMQ
  - Redis
  - SMTP server
  - Razorpay payment provider

### 7.3 Gateway Design
Gateway is the single public backend entry point on port 5000 and provides:
- Route mapping to all downstream services
- JWT authentication for protected route families
- Correlation ID propagation (`X-Correlation-Id`)
- Client ID header based rate limiting key (`Oc-Client`)
- Rate limiting (global + per-route policies)
- Lean gateway runtime (no custom `/gateway/*` operational endpoints)

### 7.4 Route Families (Gateway)
- `/identity/*` -> IdentityAuth service
- `/catalog/*` -> CatalogInventory service
- `/orders/*` -> Order service
- `/logistics/*` -> LogisticsTracking service
- `/payments/*` -> PaymentInvoice service
- `/notifications/*` -> Notification service

Public exceptions are explicitly configured for selected routes such as auth POST endpoints, payment credit-check GET, and notification ingest POST.

## 8. Frontend Architecture (Detailed)

### 8.1 UI Composition
Frontend is a role-aware Angular SPA with:
- Public routes: login, register, forgot-password
- Protected shell route guarded by authentication
- Role-restricted pages enforced through route guard and component-level checks
- Sidebar/topbar shell with dynamic role-based navigation and cart/notification access points

### 8.2 Frontend Routing Model
Main route groups:
- Auth: login, register, forgot-password, unauthorized
- Dashboard and profile
- Catalog: products list/detail/create/edit
- Dealer flow: cart and checkout
- Orders: list/detail (Admin/Dealer/Warehouse/Logistics)
- Logistics: shipment list/detail
- Payments: invoice list/detail
- Notifications: notification list
- Admin: dealer list/detail

### 8.3 Frontend Data and State Handling
- HTTP services per domain (Auth/Admin/Catalog/Order/Logistics/Payment/Notification)
- Auth state stored in signal-based store with localStorage hydration
- Cart and loading stores for user experience control
- Interceptors:
  - Correlation ID + gateway client header
  - JWT token attachment (for protected APIs)
  - Global loading indicator
  - 401 refresh/retry and standardized error messaging

### 8.4 UI/UX Characteristics Used in This Project
- Standalone Angular components and lazy loading for modularity
- SCSS-based custom responsive shell and screens
- Role-sensitive action visibility (buttons/actions shown only for permitted roles)
- Toast-based user feedback and async operation indicators

## 9. Backend Architecture (Detailed)

### 9.1 Service Structure Pattern
Each service follows a layered model:
- API: controllers, endpoint authorization, request contracts
- Application: use-case services, DTOs, validators
- Domain: entities, enums, business rules
- Infrastructure: EF Core context, repositories, integrations, hosted workers

### 9.2 Cross-Cutting Behaviors and Standards
Shared building blocks include:
- Logging behavior
- Validation behavior
- Transaction behavior
- Idempotency behavior
- Shared Outbox model and status lifecycle

### 9.3 Domain Service Responsibilities
- IdentityAuth: identity, dealer onboarding, token lifecycle, password reset, internal user contact
- CatalogInventory: products, categories, stock operations, subscriptions
- Order: order lifecycle, hold approvals, cancellations, returns, bulk transitions
- LogisticsTracking: shipment lifecycle, assignment, ops-state management
- PaymentInvoice: credit account, payment gateway integration, invoices, collections workflow
- Notification: event ingestion, in-app feed, admin views, email dispatch/digest

### 9.4 Important State Models
- UserRole: Admin, Dealer, Warehouse, Logistics, Agent
- OrderStatus: Placed -> ... -> Closed/Cancelled (controlled transitions)
- ShipmentStatus: Created -> Assigned -> ... -> Delivered/Returned
- InvoiceWorkflowStatus: Pending, ReminderSent, PromiseToPay, Paid, Disputed, Escalated
- NotificationStatus: Pending, Sent, Failed
- NotificationChannel: InApp, Email, Sms, Push

## 10. Integration and Eventing Design

### 10.1 Synchronous APIs
Examples of service-to-service calls:
- Order -> Payment: credit check during order placement path
- Identity -> Payment: internal credit-limit synchronization
- Notification -> Identity: recipient email resolution for dispatch
- Frontend -> all services through gateway routes

### 10.2 Asynchronous Event Flow
- Producer services write integration events to service outbox table
- Per-service outbox dispatcher publishes to RabbitMQ exchange `supplychain.events`
- Routing key format: `<service>.<eventtype>`
- Notification service consumes all keys from `notification.events.queue`
- Failed repeated deliveries are routed to dead-letter queue

### 10.3 Notification Delivery Pattern
- Event consumer ingests and stores notifications
- Email dispatcher polls pending Email notifications
- Immediate send for critical identity events (password reset)
- Digest grouping for related workflow updates
- Status persisted as Sent/Failed with reason tracking

## 11. Data Architecture and Persistence

### 11.1 Database Ownership (Per Service)
- IdentityAuth DB: users, dealer profiles, refresh tokens, OTP records, outbox
- CatalogInventory DB: products, categories, stock transactions/subscriptions, outbox
- Order DB: orders, lines, history, return requests, outbox
- LogisticsTracking DB: shipments, shipment events, ops states, outbox
- PaymentInvoice DB: dealer accounts, invoices, workflow states/activities, payment records, outbox
- Notification DB: notifications and outbox

### 11.2 Consistency Model
- Strong consistency inside a single service transaction
- Eventual consistency across services via outbox + RabbitMQ

### 11.3 Migrations
- EF Core startup migrations per service
- SQL migration script generation and apply scripts available under scripts/migrations

## 12. Security and Access Control

### 12.1 Authentication
- JWT Bearer authentication in gateway and services
- Token validation includes issuer, audience, signature, and lifetime
- Identity service additionally supports token revocation checks

### 12.2 Authorization
- Backend endpoint-level role authorization is source of truth
- Frontend route guards and action checks provide UX-level role gating

### 12.3 Internal API Security
- Internal endpoints validated using `X-Internal-Api-Key`
- Used for trusted inter-service internal calls (for example contact/credit-limit paths)

## 13. Reliability, Observability, and Operations

### 13.1 Reliability Mechanisms
- Outbox retry and failure marking
- RabbitMQ consumer requeue and dead-letter handling
- Safe fallback/error handling for external integrations

### 13.2 Observability
- Serilog request/application logs
- Gateway structured audit logs with route and duration
- Gateway latency metrics endpoint
- Health endpoints for services and gateway

### 13.3 Local Run and Infra Model
- SQL Server installed locally
- RabbitMQ + Redis started with Docker Compose
- Services started individually through dotnet run
- Gateway started on port 5000

## 14. Major End-to-End Workflows

### 14.1 Dealer Onboarding and Activation
1. Dealer registers from frontend.
2. Identity creates pending dealer profile.
3. Admin reviews and approves/rejects dealer.
4. Approval enables login and dealer operations.

### 14.2 Order Placement and Hold Decision
1. Dealer adds products and checks out.
2. Order service validates and checks credit through payment service.
3. If credit is insufficient, order enters hold path.
4. Admin/Warehouse/Logistics can approve/reject hold.
5. Order status updates and events are published.

### 14.3 Shipment Execution
1. Shipment created from operational flow.
2. Logistics/Admin assigns agent and vehicle.
3. Agent/Logistics updates status through delivery stages.
4. Shipment state and events remain visible across roles.

### 14.4 Invoice and Collection Workflow
1. Admin generates invoice.
2. Workflow state starts (for example Pending with due date logic).
3. Team updates reminder, promise-to-pay, paid/disputed/escalated states.
4. Workflow activities and invoice details are tracked and available to authorized users.

### 14.5 Notification and Email
1. Services publish domain events.
2. Notification consumer ingests events.
3. In-app notifications are persisted.
4. Email dispatcher sends immediate or digest emails.
5. Delivery status is updated for traceability.

## 15. Submission-Ready Feature Checklist
- Multi-role authentication and authorization
- Dealer onboarding and admin governance
- Catalog and inventory management
- Order lifecycle and return management
- Logistics shipment tracking lifecycle
- Payment and invoice management with PDF generation
- Collection workflow and activities
- Notification center with email delivery
- API gateway with authentication/routing/rate limiting
- Event-driven architecture with outbox reliability

## 16. How This Document Supports HLD and LLD Preparation

### 16.1 HLD Preparation Support
Use sections 2, 3, 6, 7, 10, 11, 12, and 13 for:
- Architecture vision
- System decomposition
- Integration style
- Security and NFR discussion

### 16.2 LLD Preparation Support
Use sections 5, 8, 9, 10, 11, and 14 for:
- Module and endpoint responsibilities
- Component interactions
- State models and workflow rules
- Worker-level async details

## 17. Related Documents in Repository
- High Level Design: docs/hld.md
- Low Level Design: docs/lld.md

This submission document is intentionally written as a consolidated source so project evaluators can understand the full scope before reading detailed HLD and LLD artifacts.
