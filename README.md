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
- Redis + RabbitMQ: Docker

Start infra:

```powershell
docker compose --env-file .env.example up -d
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

## Logistics AI (simple real provider)

The LogisticsTracking service supports a minimal real AI integration with Gemini.

1. Create a Gemini API key from Google AI Studio.
2. Set the key in your shell before starting LogisticsTracking:

```powershell
$env:AI_PROVIDER_API_KEY = "your-gemini-api-key"
```

3. Enable AI for LogisticsTracking in `services/LogisticsTracking/LogisticsTracking.API/appsettings.Development.json`:

```json
"Ai": {
	"Provider": "gemini",
	"Enabled": true
}
```

4. Start the LogisticsTracking API.

When enabled, `POST /api/logistics/shipments/{shipmentId}/ai-recommendation` first tries Gemini and automatically falls back to the built-in deterministic recommendation logic if the AI call fails.

Gateway notes:

- All proxied service routes use Ocelot rate limiting.
- Send a client identity header for proxied calls: `Oc-Client: your-client-id`
- Send a correlation id header for tracing: `X-Correlation-Id: <guid>`
- Gateway is currently configured as a lean proxy/auth entry point and does not expose custom `/gateway/*` operational endpoints.
- Example passthrough request:

```powershell
Invoke-RestMethod -Headers @{ "Oc-Client" = "student-local"; "X-Correlation-Id" = [Guid]::NewGuid().ToString("N") } "http://localhost:5000/payments/api/payment/dealers/<dealer-id>/credit-check?amount=1000"
```

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

Generated SQL files are stored under:

- `scripts/migrations/IdentityAuth.sql`
- `scripts/migrations/CatalogInventory.sql`
- `scripts/migrations/Order.sql`
- `scripts/migrations/LogisticsTracking.sql`
- `scripts/migrations/PaymentInvoice.sql`
- `scripts/migrations/Notification.sql`

## Notes

- This is a production-style scaffold with core patterns (Outbox model, idempotency contract, MediatR behaviors, service-level DbContexts).
- Domain-specific commands, handlers, saga workflows, and full event contracts can now be implemented module by module.

## Engineering standards

- Enterprise naming, API naming, and image policy guidance is documented in `docs/enterprise-standards.md`.
- Repository-wide formatting and C# naming conventions are enforced via `.editorconfig` at the repository root.
