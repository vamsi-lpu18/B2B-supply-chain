# Supply Chain Platform High Level Design (HLD)

## 1. Document Information
- Document: High Level Design
- System: Supply Chain Platform
- Version: 1.0
- Date: 2026-04-02
- Scope: End to end architecture of frontend, gateway, and backend microservices

## 2. Business Objective
The platform digitizes dealer onboarding, catalog and inventory visibility, order lifecycle, shipment tracking, invoice and collection workflows, and notification delivery across multiple enterprise roles.

## 3. In Scope
- Identity and access management
- Product catalog and inventory operations
- Order creation and lifecycle management
- Logistics shipment orchestration
- Payment, credit, invoice, and collection workflow
- Notification ingest, in-app feed, and email dispatch
- API gateway routing, rate limiting, metrics, and health
- Angular frontend with role based navigation and action gating

## 4. Out of Scope
- External ERP integration beyond current HTTP and event contracts
- Multi region active-active deployment
- Advanced fraud and anomaly ML models

## 5. User Roles
- Admin: Platform governance and cross-domain operations
- Dealer: Purchase, order tracking, and invoice consumption
- Warehouse: Stock and fulfillment operations
- Logistics: Shipment assignment and delivery orchestration
- Agent: Last mile shipment execution

## 6. Architecture Principles
- Microservice separation by business domain
- Database per service
- API contracts for synchronous calls
- Outbox pattern for reliable event publication
- Role based authorization for all protected operations
- Event driven notifications for cross-domain updates
- Idempotency and validation as common pipeline behaviors

## 7. Technology Stack
- Backend: .NET 10 Web APIs
- Frontend: Angular SPA
- Gateway: Ocelot Gateway
- Data stores: SQL Server per service database
- Messaging: RabbitMQ topic exchange
- Cache and idempotency store: Redis
- Logging: Serilog
- Validation: FluentValidation
- Application pipeline: MediatR behaviors
- Email transport: SMTP via MailKit
- Payment provider: Razorpay adapter
- PDF generation: QuestPDF

## 8. System Context View

Client channels:
- Browser client (Angular)

Entry point:
- Ocelot Gateway on port 5000

Core domain services:
- IdentityAuth on port 8001
- CatalogInventory on port 8002
- Order on port 8003
- LogisticsTracking on port 8004
- PaymentInvoice on port 8005
- Notification on port 8006

Shared infrastructure:
- SQL Server (local installation)
- RabbitMQ (Docker)
- Redis (Docker)
- SMTP server
- Razorpay API

## 9. Container View

### 9.1 Frontend Container
- Angular app for role based UI and workflow orchestration from user perspective
- Calls gateway upstream routes

### 9.2 Gateway Container
- Ocelot route mapping for identity, catalog, orders, logistics, payments, notifications
- JWT authentication pass through
- Global and route level rate limit with Oc-Client identity header
- Correlation ID injection and propagation
- Route inventory, health, and latency metrics endpoints

### 9.3 Service Containers
Each backend service follows layered architecture:
- API layer: Controllers and auth policies
- Application layer: Use cases, validators, DTOs
- Domain layer: Entities, enums, business rules
- Infrastructure layer: EF Core persistence, integrations, background workers

## 10. Domain Decomposition

### 10.1 IdentityAuth Domain
- User lifecycle and authentication
- Dealer onboarding and admin approval
- JWT token lifecycle and revocation support
- Password reset OTP lifecycle

### 10.2 CatalogInventory Domain
- Product and category management
- Stock transactions and subscriptions
- Soft lock and hard deduct operations

### 10.3 Order Domain
- Order aggregate with status transitions
- Credit hold path and admin decisioning
- Return request lifecycle
- Bulk status operations for staff roles

### 10.4 LogisticsTracking Domain
- Shipment creation, assignment, and progression
- Shipment event timeline
- Operational handover and retry state

### 10.5 PaymentInvoice Domain
- Dealer credit account management
- Gateway order and verification flow
- Invoice generation and PDF retrieval
- Invoice collection workflow and workflow activity timeline

### 10.6 Notification Domain
- Integration event ingest
- Manual notification creation
- Recipient scoped reads
- Email batching and branded rendering

## 11. Integration Architecture

### 11.1 Synchronous Integrations
- Order -> Payment: credit check
- Identity -> Payment: internal credit limit update
- Identity -> Notification: password reset event ingest fallback path
- Notification -> Identity: resolve recipient email for delivery
- Frontend -> all services via gateway routes

### 11.2 Asynchronous Integrations
- Identity, Catalog, Order, Logistics, Payment publish outbox events to RabbitMQ topic exchange supplychain.events
- Notification service consumes all routing keys from supplychain.events via notification.events.queue
- Notification service routes failed event processing to dead letter queue

### 11.3 Event Routing Pattern
- identity.<eventType>
- catalog.<eventType>
- order.<eventType>
- logistics.<eventType>
- payment.<eventType>

## 12. Data Architecture

### 12.1 Database Ownership
- IdentityAuth database: users, dealer profile, refresh token, otp, outbox
- CatalogInventory database: products, categories, stock transactions, stock subscriptions, outbox
- Order database: orders, order lines, status history, return request, outbox
- LogisticsTracking database: shipments, shipment events, shipment ops state, outbox
- PaymentInvoice database: dealer credit account, invoices, invoice lines, workflow state, workflow activities, payment records, outbox
- Notification database: notifications, outbox

### 12.2 Consistency Strategy
- Strong consistency inside service transaction boundaries
- Eventual consistency across services via outbox and RabbitMQ

### 12.3 Migration Strategy
- Each service executes EF Core migrations at startup
- Migration SQL scripts generated and applied per service through scripts

## 13. Security Architecture

### 13.1 Authentication
- JWT Bearer authentication across gateway and services
- Access token validation on issuer, audience, signature, and lifetime
- Identity service checks revocation store; other services validate token and JTI presence

### 13.2 Authorization
- Controller and endpoint level role checks
- Frontend route guard and role guard enforce UI level restrictions

### 13.3 Internal API Security
- Internal endpoints use X-Internal-Api-Key header
- Current internal endpoints are allow anonymous with header validation

### 13.4 Data Security
- Password hashes only, no clear password persistence
- Role and status controlled operational actions

## 14. Reliability and Failure Handling
- Outbox dispatchers retry publication and mark failed after max retries
- Notification consumer supports redelivery and dead letter fallback
- External HTTP integration failures are handled with safe defaults where required
- Validation failures produce structured 400 responses

## 15. Observability
- Serilog request and application logging
- Gateway audit logging with route, status, and duration
- Gateway latency metrics endpoint
- Service health endpoint per service

## 16. Non Functional Requirements

### 16.1 Availability
- Target 99.9% for core API workflows in single region setup

### 16.2 Performance
- p95 API read latency target under 300 ms for non-reporting endpoints under normal load
- p95 write latency target under 500 ms for standard commands

### 16.3 Scalability
- Stateless API nodes can scale horizontally
- RabbitMQ and Redis support shared cross-instance state and messaging

### 16.4 Security
- RBAC for all privileged endpoints
- Token and internal key verification for trusted paths
- Audit logging for sensitive administrative operations

### 16.5 Maintainability
- Domain bounded contexts and repository abstraction
- Shared behaviors for validation, idempotency, transaction, and logging

## 17. Deployment View

### 17.1 Local Development
- SQL Server local installation
- RabbitMQ and Redis through Docker compose
- Services launched independently via dotnet run
- Gateway launched independently

### 17.2 Runtime Ports
- Gateway 5000
- IdentityAuth 8001
- CatalogInventory 8002
- Order 8003
- LogisticsTracking 8004
- PaymentInvoice 8005
- Notification 8006

## 18. Risks and Design Considerations
- Some routes are broadly exposed in frontend while backend authorization remains source of truth
- Internal key protected endpoints should be monitored and eventually hardened further with network policies
- Notification service has outbox storage available but currently relies on event consumer and email dispatcher as primary async paths

## 19. Architectural Decisions Summary
- Chosen microservice architecture to isolate business domains
- Chosen outbox plus RabbitMQ for cross domain reliability
- Chosen gateway policy enforcement for rate limiting and route governance
- Chosen SQL Server per service for transactional integrity
- Chosen Redis for idempotency and cache primitives

## 20. HLD Sign Off Checklist
- Functional boundaries validated
- Security and RBAC validated
- NFR targets agreed
- Deployment architecture validated
- Open risks and mitigations documented
