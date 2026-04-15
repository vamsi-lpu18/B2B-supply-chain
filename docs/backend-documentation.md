# Supply Chain Platform Backend Documentation

## 1. Overview
The backend is a .NET 10 microservice architecture with six domain services and one Ocelot gateway.

Services:
- IdentityAuth
- CatalogInventory
- Order
- LogisticsTracking
- PaymentInvoice
- Notification
- OcelotGateway (edge routing)

## 2. Common Service Architecture
Each service follows a layered pattern:
- API: controllers and endpoint security
- Application: use cases, validators, DTOs
- Domain: entities, enums, business rules
- Infrastructure: EF Core persistence, repositories, integrations, background workers

Cross-cutting building blocks:
- MediatR pipeline behaviors (validation, logging, transaction, idempotency)
- Structured logging (Serilog)
- OpenAPI + Swagger in development
- JWT bearer authentication
- Health endpoint (`/health`)

## 3. Startup and Runtime Behavior

## 3.1 Database migration policy
At startup each service:
1. resolves its DbContext
2. runs `Database.MigrateAsync()`
3. logs pending/applied migration status

## 3.2 Authentication model
- JWT validation on issuer/audience/signature/lifetime
- JTI presence check across services
- IdentityAuth additionally checks token revocation store on token validation

## 3.3 Error handling
A global middleware converts common exceptions to structured HTTP responses:
- validation exceptions -> 400
- domain/invalid operation exceptions -> 400
- unauthorized access -> 401 (where implemented)

## 3.4 Development tooling
In development environments services expose:
- OpenAPI docs
- Swagger UI under `/swagger`
- Hangfire dashboard under `/hangfire`

## 4. Service-Specific Notes

## 4.1 IdentityAuth
Key behaviors:
- dealer registration and approval lifecycle
- login/refresh/logout token lifecycle with refresh cookie
- forgot/reset password flow
- internal contact lookup endpoint secured with internal API key
- startup seeding for admin, dealer, warehouse, logistics, and agent demo users

Integrations:
- Payment internal credit-limit update call
- notification trigger paths for reset/dealer actions
- Redis-backed token revocation store

## 4.2 CatalogInventory
Key behaviors:
- product/category management and stock operations
- inventory soft-lock/hard-deduct/release paths
- stock subscriptions
- product review and moderation lifecycle
- startup category and product seed catalog for demo readiness

## 4.3 Order
Key behaviors:
- dealer order creation and scoped reads
- status transition enforcement
- hold approval/rejection flow
- return request and admin decisioning
- saga state lookup per order
- bulk status transition operation

## 4.4 LogisticsTracking
Key behaviors:
- shipment create/list/detail
- assign agent and vehicle
- shipment status lifecycle
- shipment ops-state query/upsert and batch retrieval
- role-scoped logistics chatbot endpoint for status and retry insights
- role/ownership checks for dealer and agent views

## 4.5 PaymentInvoice
Key behaviors:
- credit account lifecycle and credit checks
- external/internal credit-limit updates
- settlement operations
- gateway order + payment verification integration
- invoice generation and PDF download
- invoice workflow state/activity timeline APIs

## 4.6 Notification
Key behaviors:
- manual notification creation
- integration event ingest endpoint
- recipient feed and admin feed
- sent/failed/read/unread state updates
- recipient ownership checks for non-admin access

## 5. Gateway Architecture
Gateway implementation (`OcelotGateway`) provides:
- route-family mapping to downstream services
- JWT authentication on protected routes
- public route exceptions for selected flows
- per-route QoS and rate-limit policy
- `X-Correlation-Id` pass-through and client identity rate-limiting using `Oc-Client`
- load-balancer demo routes using round-robin strategy

## 6. Messaging and Asynchronous Processing

## 6.1 Outbox pattern
Domain services persist integration events in outbox tables and publish asynchronously.

## 6.2 RabbitMQ topology
- Exchange: `supplychain.events` (topic)
- Producer routing key pattern: `<source>.<eventType>`
- Notification consumer binds wildcard routes and processes cross-domain events

## 6.3 Notification worker behavior
- event consumer creates notification records from incoming messages
- email dispatcher resolves recipient addresses and sends immediate or digest emails
- dead-letter strategy handles repeated failures

## 7. Data Ownership Model
Database-per-service ownership:
- IdentityAuth DB
- CatalogInventory DB
- Order DB
- LogisticsTracking DB
- PaymentInvoice DB
- Notification DB

Consistency approach:
- strong consistency inside a service transaction boundary
- eventual consistency across services using outbox + RabbitMQ

## 8. Performance and Indexing

## 8.1 Added model-level indexes
Recent index updates in DbContexts:
- IdentityAuth users: `(Role, Status, CreatedAtUtc)`
- Order orders: `(DealerId, PlacedAtUtc)`, `(Status, PlacedAtUtc)`
- Logistics shipments: `(DealerId, CreatedAtUtc)`, `(AssignedAgentId, CreatedAtUtc)`, `(CreatedAtUtc)`
- Payment invoices: `(DealerId, CreatedAtUtc)`
- Notification messages: `(RecipientUserId, CreatedAtUtc)`

## 8.2 Operational patch path
For direct deployment of indexing changes, use:
- SQL patch: `scripts/migrations/IndexingPatch.sql`
- runner script: `scripts/apply-indexing-patch.ps1`

The patch is idempotent and safe to re-run.

## 9. Testing Status
Backend domain tests currently exist for:
- IdentityAuth
- CatalogInventory
- Order
- LogisticsTracking
- PaymentInvoice
- Notification

All test projects under `tests/` were executed successfully in this session.

## 10. Operational Commands
- Start RabbitMQ and Redis infra: `docker compose --env-file .env.example up -d`
- Run migration SQL generation: `./scripts/generate-migration-sql.ps1`
- Apply migrations: `./scripts/apply-migrations.ps1`
- Apply index patch: `./scripts/apply-indexing-patch.ps1`
- Run backend tests with JUnit reports: `./scripts/run-dotnet-junit-tests.ps1`
