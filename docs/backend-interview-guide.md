# Supply Chain Platform - Complete Backend Interview Guide

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Infrastructure & Tech Stack](#2-infrastructure--tech-stack)
3. [Architecture & Design Patterns](#3-architecture--design-patterns)
4. [Shared Building Blocks](#4-shared-building-blocks)
5. [Service-by-Service Deep Dive](#5-service-by-service-deep-dive)
6. [Integration Patterns](#6-integration-patterns)
7. [Data Management](#7-data-management)
8. [Security & Authentication](#8-security--authentication)
9. [Observability & Operations](#9-observability--operations)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Project Overview

### 1.1 Business Context
The Supply Chain Platform is an enterprise-grade microservices system that digitizes the complete supply chain workflow for a B2B dealer network. It handles:
- Dealer onboarding and identity management
- Product catalog and inventory operations
- Order lifecycle from placement to delivery
- Logistics and shipment tracking
- Payment processing, invoicing, and credit management
- Cross-domain notifications via in-app and email channels

### 1.2 System Scope
**In Scope:**
- 6 domain microservices + 1 API gateway
- Role-based access control (Admin, Dealer, Warehouse, Logistics, Agent)
- Event-driven architecture for cross-service communication
- Saga pattern for distributed transactions
- Outbox pattern for reliable event publishing
- AI-augmented logistics recommendations

**Out of Scope:**
- Multi-region active-active deployment
- External ERP deep integration
- Advanced ML fraud detection

### 1.3 Key Metrics & NFRs
- **Availability:** 99.9% target for core workflows
- **Performance:** p95 read latency <300ms, write latency <500ms
- **Scalability:** Horizontal scaling via stateless API nodes
- **Security:** JWT-based authentication, RBAC authorization, audit logging

---

## 2. Infrastructure & Tech Stack

### 2.1 Core Technology Stack

**Backend Framework:**
- **.NET 10** (latest LTS) - All microservices
- **ASP.NET Core Web API** - REST endpoints
- **C# 13** - Language features

**Data Layer:**
- **SQL Server** (local installation) - Primary data store
- **Entity Framework Core 10** - ORM with code-first migrations
- **Redis 7.4** - Caching and idempotency store
- **RabbitMQ 4.1** - Message broker for async events

**Application Patterns:**
- **MediatR** - CQRS and pipeline behaviors
- **FluentValidation** - Request validation
- **Serilog** - Structured logging
- **Hangfire** - Background job processing

**API Gateway:**
- **Ocelot** - API gateway with routing, rate limiting, QoS

**External Integrations:**
- **Razorpay** - Payment gateway
- **Gemini AI** - Logistics recommendations
- **MailKit** - SMTP email delivery
- **QuestPDF** - Invoice PDF generation

**Development Tools:**
- **Swagger/OpenAPI** - API documentation
- **Docker Compose** - Local infrastructure
- **Mailpit** - Email testing (SMTP capture)
- **xUnit** - Unit testing with JUnit XML reports

### 2.2 Infrastructure Components

**Docker Compose Services:**
```yaml
- RabbitMQ: Port 5673 (AMQP), 15672 (Management UI)
- Redis: Port 6379
- Mailpit: Port 1025 (SMTP), 8025 (Web UI)
```

**SQL Server:**
- Local installation (outside Docker)
- 6 separate databases (one per service)
- Connection string pattern: `Server=localhost;Database={ServiceName}DB;...`

**Service Ports:**
```
Gateway:          5000
IdentityAuth:     8001 (LB: 8101)
CatalogInventory: 8002 (LB: 8102)
Order:            8003 (LB: 8103)
LogisticsTracking:8004 (LB: 8104)
PaymentInvoice:   8005 (LB: 8105)
Notification:     8006 (LB: 8106)
```

### 2.3 Development Workflow

**Starting the System:**
1. Start infrastructure: `docker compose --env-file .env.example up -d`
2. Start each service: `dotnet run --project services/{ServiceName}/{ServiceName}.API`
3. Start gateway: `dotnet run --project gateway/OcelotGateway`

**Database Migrations:**
- Auto-applied at startup via `Database.MigrateAsync()`
- Manual generation: `./scripts/generate-migration-sql.ps1`
- Manual apply: `./scripts/apply-migrations.ps1`

**Testing:**
- Run all tests: `./scripts/run-dotnet-junit-tests.ps1`
- Reports: `artifacts/test-results/*.xml`

---

## 3. Architecture & Design Patterns

### 3.1 Microservices Architecture

**Service Decomposition Strategy:**
- **Domain-Driven Design (DDD)** - Each service owns a bounded context
- **Database per Service** - No shared databases
- **API-first** - RESTful contracts between services
- **Event-driven** - Async communication via RabbitMQ

**Service Boundaries:**
```
IdentityAuth       → User management, authentication, dealer onboarding
CatalogInventory   → Products, categories, stock operations
Order              → Order lifecycle, saga orchestration
LogisticsTracking  → Shipments, agent assignment, delivery tracking
PaymentInvoice     → Credit accounts, payments, invoicing
Notification       → Event ingestion, in-app feed, email dispatch
```

### 3.2 Layered Architecture (Per Service)

Each service follows Clean Architecture principles:

```
┌─────────────────────────────────────┐
│         API Layer                   │  Controllers, Middleware, Auth
├─────────────────────────────────────┤
│      Application Layer              │  Use Cases, DTOs, Validators
├─────────────────────────────────────┤
│        Domain Layer                 │  Entities, Enums, Business Rules
├─────────────────────────────────────┤
│    Infrastructure Layer             │  DbContext, Repositories, Workers
└─────────────────────────────────────┘
```

**Dependency Flow:** API → Application → Domain ← Infrastructure

### 3.3 Key Design Patterns

**1. Outbox Pattern**
- **Problem:** Ensure reliable event publishing after database commit
- **Solution:** Store events in outbox table within same transaction
- **Implementation:** Background worker polls outbox and publishes to RabbitMQ
- **Status:** Pending → Published / Failed

**2. Saga Pattern (Order Service)**
- **Problem:** Coordinate distributed transaction across services
- **Solution:** Orchestration-based saga with state machine
- **States:** Started → CreditCheckInProgress → AwaitingManualApproval / CompletedApproved
- **Storage:** OrderSagaStates table tracks saga progress

**3. Idempotency Pattern**
- **Problem:** Prevent duplicate command execution
- **Solution:** Redis-based idempotency store with TTL
- **Key:** `idempotency:{requestId}`
- **Behavior:** MediatR pipeline behavior checks before execution

**4. Repository Pattern**
- **Problem:** Abstract data access from business logic
- **Solution:** IRepository interfaces in Application, implementations in Infrastructure
- **Benefits:** Testability, separation of concerns

**5. CQRS (Command Query Responsibility Segregation)**
- **Implementation:** MediatR commands and queries
- **Commands:** Modify state, return void or simple result
- **Queries:** Read-only, return DTOs

**6. Circuit Breaker / Retry (Polly)**
- **Usage:** External HTTP calls (Payment gateway, AI provider)
- **Configuration:** Retry 3 times with exponential backoff
- **Fallback:** Deterministic logic when external service fails

---

## 4. Shared Building Blocks

### 4.1 BuildingBlocks Project

**Location:** `src/BuildingBlocks/`

**Purpose:** Cross-cutting concerns shared across all services

**Components:**

**A. MediatR Pipeline Behaviors**

1. **LoggingBehavior**
   - Logs request/response for all commands and queries
   - Includes execution time and correlation ID

2. **ValidationBehavior**
   - Executes FluentValidation validators
   - Returns 400 with validation errors if failed

3. **IdempotencyBehavior**
   - Checks Redis idempotency store before execution
   - Only applies to requests implementing `IIdempotentRequest`
   - TTL: 24 hours

4. **TransactionBehavior**
   - Wraps command execution in database transaction
   - Auto-commits on success, rolls back on exception

**B. Persistence Abstractions**

```csharp
// Outbox message model
public class OutboxMessage
{
    public Guid MessageId { get; set; }
    public string EventType { get; set; }
    public string Payload { get; set; }  // JSON
    public OutboxStatus Status { get; set; }  // Pending/Published/Failed
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? PublishedAtUtc { get; set; }
    public int RetryCount { get; set; }
    public string? Error { get; set; }
}

// Repository interface
public interface IOutboxRepository
{
    Task AddAsync(OutboxMessage message);
    Task<IReadOnlyList<OutboxMessage>> GetPendingAsync(int take);
    Task MarkPublishedAsync(Guid messageId);
    Task MarkFailedAsync(Guid messageId, string error);
}
```

**C. Application Contracts**

```csharp
public interface ICacheService
{
    Task<T?> GetAsync<T>(string key);
    Task SetAsync<T>(string key, T value, TimeSpan ttl);
    Task DeleteAsync(string key);
}

public interface IIdempotencyStore
{
    Task<bool> TryBeginAsync(string key, TimeSpan ttl);
}

public interface IIdempotentRequest
{
    string IdempotencyKey { get; }
}
```

### 4.2 SharedKernel Project

**Location:** `src/SharedKernel/`

**Purpose:** Domain-level abstractions and messaging contracts

**Components:**

**A. Domain Abstractions**

```csharp
public abstract class Entity
{
    private readonly List<object> _domainEvents = new();
    public IReadOnlyList<object> DomainEvents => _domainEvents;
    
    protected void RaiseDomainEvent(object domainEvent)
    {
        _domainEvents.Add(domainEvent);
    }
    
    public void ClearDomainEvents()
    {
        _domainEvents.Clear();
    }
}

public abstract class ValueObject
{
    protected abstract IEnumerable<object?> GetEqualityComponents();
    // Equality and hash code implementation
}
```

**B. Messaging Contracts**

- Integration event base classes
- RabbitMQ routing key patterns
- Event serialization helpers

### 4.3 Configuration & Conventions

**EditorConfig (.editorconfig):**
- Enforces C# naming conventions
- PascalCase for classes, methods, properties
- _camelCase for private fields
- Async suffix for async methods

**Enterprise Standards:**
- Resource-oriented API routes (plural nouns)
- Event names: `{domain}.{eventType}` (e.g., `order.orderPlaced`)
- DTO naming: Explicit and scoped (e.g., `CreateOrderRequest`)

---

