# SupplyChain Platform Backend (Scaffold)

This repository contains a backend-first scaffold for a 6-service supply chain platform using .NET 10.

## Services

- IdentityAuth (port 8001)
- CatalogInventory (port 8002)
- Order (port 8003)
- LogisticsTracking (port 8004)
- PaymentInvoice (port 8005)
- Notification (port 8006)
- OcelotGateway (port 5000)

## Local Infrastructure

- SQL Server: local machine installation (outside Docker)
- Redis + RabbitMQ + Mailpit (SMTP capture): Docker

Start infra:

```powershell
docker compose --env-file .env.example up -d
```

Mailpit UI (captured emails):

```text
http://localhost:8025
```

## Run services

Use one terminal per service:

```powershell
dotnet run --project services/IdentityAuth/IdentityAuth.API
dotnet run --project services/CatalogInventory/CatalogInventory.API
dotnet run --project services/Order/Order.API
dotnet run --project services/LogisticsTracking/LogisticsTracking.API
dotnet run --project services/PaymentInvoice/PaymentInvoice.API
dotnet run --project services/Notification/Notification.API
dotnet run --project gateway/OcelotGateway
```

## Logistics chatbot (built-in)

The LogisticsTracking service now exposes a built-in deterministic chatbot for operations insights.

- No external provider setup is required.
- No API key is required.
- Endpoint: `POST /api/logistics/shipments/chatbot/ask`

Example request:

```json
{
  "message": "Show delayed shipments and retry worklist"
}
```

The chatbot answers from shipment and ops-state data that is already available in the platform, scoped by the caller role.

Gateway notes:

- All proxied service routes use Ocelot rate limiting.
- Send a client identity header for proxied calls: `Oc-Client: your-client-id`
- Send a correlation id header for tracing: `X-Correlation-Id: <guid>`
- Gateway is currently configured as a lean proxy/auth entry point and does not expose custom `/gateway/*` operational endpoints.
- Example passthrough request:

```powershell
Invoke-RestMethod -Headers @{ "Oc-Client" = "student-local"; "X-Correlation-Id" = [Guid]::NewGuid().ToString("N") } "http://localhost:5000/payments/api/payment/dealers/<dealer-id>/credit-check?amount=1000"
```

## Load Balancer demo (Ocelot RoundRobin)

A demo gateway route is configured for every backend service.

Configured LB demo routes:

```text
POST /identity-lb/api/auth/{everything}
GET  /catalog-lb/api/products/{everything}
ANY  /orders-lb/{everything}
ANY  /logistics-lb/{everything}
GET  /payments-lb/api/payment/dealers/{dealerId}/credit-check
POST /notifications-lb/api/notifications/ingest
```

Each route uses two downstream instances with Ocelot round-robin:

```text
IdentityAuth      : 8001 + 8101
CatalogInventory  : 8002 + 8102
Order             : 8003 + 8103
LogisticsTracking : 8004 + 8104
PaymentInvoice    : 8005 + 8105
Notification      : 8006 + 8106
```

Start first instances (800x) as you already do, then start second instances (810x), for example:

```powershell
dotnet run --project services/CatalogInventory/CatalogInventory.API --urls http://localhost:8102
dotnet run --project services/Order/Order.API --urls http://localhost:8103
dotnet run --project services/LogisticsTracking/LogisticsTracking.API --urls http://localhost:8104
dotnet run --project services/PaymentInvoice/PaymentInvoice.API --urls http://localhost:8105
dotnet run --project services/Notification/Notification.API --urls http://localhost:8106
```

IdentityAuth example:

```text
POST /identity-lb/api/auth/{everything}
```

It uses two downstream instances of IdentityAuth with Ocelot round-robin.

1. Start first IdentityAuth instance (port 8001):

```powershell
dotnet run --project services/IdentityAuth/IdentityAuth.API --urls http://localhost:8001
```

2. Start second IdentityAuth instance (port 8101):

```powershell
dotnet run --project services/IdentityAuth/IdentityAuth.API --urls http://localhost:8101
```

3. Run the demo traffic script:

```powershell
./scripts/demo-load-balancer.ps1 -Count 10
```

By default, this script calls `/identity-lb/api/auth/forgot-password` so no seeded login credentials are required.

Watch both IdentityAuth terminals. Requests sent via `/identity-lb/api/auth/{everything}` should be distributed between the two instances.

For secured LB demo routes (`/orders-lb/*` and `/logistics-lb/*`), send a valid bearer token.

## Backend unit tests (JUnit XML)

Backend unit tests are implemented using xUnit, and test reports are exported in JUnit XML format.

Current test projects:

- `tests/IdentityAuth.Domain.Tests`
- `tests/CatalogInventory.Domain.Tests`
- `tests/Order.Domain.Tests`
- `tests/LogisticsTracking.Domain.Tests`
- `tests/PaymentInvoice.Domain.Tests`
- `tests/Notification.Domain.Tests`

Run tests with JUnit output using script:

```powershell
./scripts/run-dotnet-junit-tests.ps1
```

Or run directly:

```powershell
dotnet test SupplyChainPlatform.slnx --logger "junit;LogFilePath=artifacts/test-results/{assembly}.xml;MethodFormat=Class;FailureBodyFormat=Verbose"
```

JUnit XML reports are generated under:

- `artifacts/test-results/`

## Database migrations

Each service now uses EF Core migrations at startup (via `Database.MigrateAsync`) with startup checks for pending/applied migrations.

Generate or regenerate idempotent SQL scripts:

```powershell
./scripts/generate-migration-sql.ps1
```

Apply migrations directly to local databases:

```powershell
./scripts/apply-migrations.ps1
```

Apply the simple index performance patch (idempotent):

```powershell
./scripts/apply-indexing-patch.ps1
```

Generated SQL files are stored under:

- `scripts/migrations/IdentityAuth.sql`
- `scripts/migrations/CatalogInventory.sql`
- `scripts/migrations/Order.sql`
- `scripts/migrations/LogisticsTracking.sql`
- `scripts/migrations/PaymentInvoice.sql`
- `scripts/migrations/Notification.sql`
- `scripts/migrations/IndexingPatch.sql`

## Notes

- This is a production-style scaffold with core patterns (Outbox model, idempotency contract, MediatR behaviors, service-level DbContexts).
- Domain-specific commands, handlers, saga workflows, and full event contracts can now be implemented module by module.

## Engineering standards

- Enterprise naming, API naming, and image policy guidance is documented in `docs/enterprise-standards.md`.
- Repository-wide formatting and C# naming conventions are enforced via `.editorconfig` at the repository root.

## Documentation index

- HLD: `docs/hld.md`
- LLD: `docs/lld.md`
- Project submission: `docs/project-submission-document.md`
- API documentation: `docs/api-documentation.md`
- Frontend documentation: `docs/frontend-documentation.md`
- Backend documentation: `docs/backend-documentation.md`
- UML diagrams: `docs/uml-diagrams.md`
- Email trigger matrix: `docs/email-trigger-matrix.md`
- Enterprise standards: `docs/enterprise-standards.md`
