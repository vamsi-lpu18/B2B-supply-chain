# Complete Tech Stack - Supply Chain Management System

## Overview

This document provides a comprehensive list of all technologies, frameworks, libraries, and tools used in the Supply Chain Management System, along with their purposes and locations.

---

## 🎯 Technology Stack Summary

| Category | Technologies |
|----------|-------------|
| **Backend Framework** | .NET 10.0, ASP.NET Core |
| **Frontend Framework** | Angular 21.2 |
| **Databases** | SQL Server, Redis |
| **Message Broker** | RabbitMQ |
| **API Gateway** | Ocelot |
| **ORM** | Entity Framework Core 10.0 |
| **Validation** | FluentValidation |
| **Logging** | Serilog |
| **Background Jobs** | Hangfire |
| **Caching** | Redis (StackExchange.Redis) |
| **Resilience** | Polly |
| **PDF Generation** | QuestPDF |
| **Payment Gateway** | Razorpay (simulated) |
| **Email** | Mailpit (development) |
| **Containerization** | Docker, Docker Compose |
| **Testing** | Vitest |

---

## 1. 🖥️ Backend Technologies

### 1.1 Core Framework

#### .NET 10.0
- **Version**: 10.0.104
- **Purpose**: Latest .NET runtime and SDK
- **Why**: 
  - Latest features and performance improvements
  - Long-term support
  - Cross-platform (Windows, Linux, macOS)
  - Modern C# 13 features
- **Where**: All backend services
- **Configuration**: `global.json`

```json
{
  "sdk": {
    "version": "10.0.104",
    "rollForward": "latestFeature"
  }
}
```

#### ASP.NET Core 10.0
- **Purpose**: Web framework for building APIs
- **Why**:
  - High performance
  - Built-in dependency injection
  - Middleware pipeline
  - Cross-platform
- **Where**: All 6 microservices + Gateway
- **Features Used**:
  - Controllers (MVC pattern)
  - Minimal APIs
  - Middleware
  - Authentication/Authorization
  - CORS

---

### 1.2 API Gateway

#### Ocelot 24.1.0
- **Purpose**: API Gateway for routing, load balancing, and cross-cutting concerns
- **Why**:
  - Single entry point for all services
  - Built-in load balancing
  - Rate limiting
  - Request aggregation
  - Service discovery
- **Where**: `gateway/OcelotGateway/`
- **Features Used**:
  - Route configuration
  - Load balancing (Round Robin)
  - Rate limiting
  - Authentication
  - QoS (Circuit Breaker)
  - Caching
  - Request ID tracking

**Configuration**: `gateway/OcelotGateway/ocelot.json`

#### Ocelot.Provider.Polly 24.1.0
- **Purpose**: Integrates Polly with Ocelot for resilience
- **Why**: Provides circuit breaker, timeout, and retry policies
- **Where**: Gateway
- **Features**:
  - Circuit Breaker (3 failures → 10s break)
  - Timeout (5 seconds)
  - Automatic retry

---

### 1.3 Database & ORM

#### SQL Server
- **Purpose**: Primary relational database
- **Why**:
  - ACID compliance
  - Strong consistency
  - Rich querying capabilities
  - Transaction support
  - Enterprise-grade
- **Where**: Each microservice has its own database
- **Databases**:
  - `IdentityAuthDB`
  - `CatalogInventoryDB`
  - `OrderDB`
  - `PaymentInvoiceDB`
  - `LogisticsTrackingDB`
  - `NotificationDB`

#### Entity Framework Core 10.0.5
- **Purpose**: Object-Relational Mapper (ORM)
- **Why**:
  - Type-safe database access
  - LINQ queries
  - Automatic migrations
  - Change tracking
  - Lazy/eager loading
- **Where**: All services (Infrastructure layer)
- **Packages**:
  - `Microsoft.EntityFrameworkCore` - Core ORM
  - `Microsoft.EntityFrameworkCore.SqlServer` - SQL Server provider
  - `Microsoft.EntityFrameworkCore.Design` - Migration tools

**Features Used**:
- Code-First migrations
- DbContext per service
- Fluent API configuration
- Query optimization
- Transaction management

---

### 1.4 Caching

#### Redis 7.4
- **Purpose**: In-memory data store for caching and distributed locking
- **Why**:
  - Extremely fast (in-memory)
  - Distributed caching across instances
  - Pub/Sub messaging
  - Atomic operations
  - TTL support
- **Where**: 
  - Docker container: `supplychain-redis`
  - Port: 6379
- **Use Cases**:
  - Response caching
  - Idempotency store (distributed locks)
  - Session storage
  - Rate limiting counters

#### StackExchange.Redis 2.12.8
- **Purpose**: .NET client for Redis
- **Why**: 
  - High performance
  - Async/await support
  - Connection multiplexing
  - Pub/Sub support
- **Where**: All services (via BuildingBlocks)
- **Implementation**: `BuildingBlocks/Extensions/RedisCacheService.cs`

**Features**:
```csharp
public interface ICacheService
{
    Task<T?> GetAsync<T>(string key);
    Task SetAsync<T>(string key, T value, TimeSpan ttl);
    Task DeleteAsync(string key);
}
```

---

### 1.5 Message Broker

#### RabbitMQ 4.1
- **Purpose**: Message broker for asynchronous communication between services
- **Why**:
  - Reliable message delivery
  - Pub/Sub pattern
  - Message persistence
  - Dead letter queues
  - Routing flexibility
- **Where**: 
  - Docker container: `supplychain-rabbitmq`
  - AMQP Port: 5673
  - Management UI: 15672
- **Use Cases**:
  - Domain event publishing
  - Integration events
  - Asynchronous workflows
  - Service decoupling

#### RabbitMQ.Client 7.2.1
- **Purpose**: .NET client for RabbitMQ
- **Why**: Official RabbitMQ client with full AMQP support
- **Where**: All services (Infrastructure layer)
- **Implementation**: Outbox pattern dispatchers

**Flow**:
```
Service → OutboxMessage (DB) → Background Job → RabbitMQ → Other Services
```

---

### 1.6 Background Jobs

#### Hangfire 1.8.23
- **Purpose**: Background job processing and scheduling
- **Why**:
  - Persistent job storage
  - Automatic retries
  - Job scheduling (cron)
  - Dashboard UI
  - Distributed processing
- **Where**: All services
- **Packages**:
  - `Hangfire.Core` - Core library
  - `Hangfire.AspNetCore` - ASP.NET Core integration
  - `Hangfire.SqlServer` - SQL Server storage

**Use Cases**:
- Outbox message dispatching
- Scheduled tasks (reminders, follow-ups)
- Retry failed operations
- Periodic cleanup jobs

**Example**:
```csharp
RecurringJob.AddOrUpdate<OrderOutboxDispatcher>(
    "order-outbox-dispatcher",
    job => job.DispatchAsync(),
    Cron.Minutely);
```

---

### 1.7 Validation

#### FluentValidation 12.1.1
- **Purpose**: Fluent interface for building validation rules
- **Why**:
  - Strongly-typed validation
  - Reusable validators
  - Complex validation logic
  - Clear error messages
  - Testable
- **Where**: All services (Application layer)
- **Integration**: MediatR pipeline behavior

**Example**:
```csharp
public class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.Lines)
            .NotEmpty()
            .WithMessage("Order must have at least one line item.");
        
        RuleFor(x => x.PaymentMode)
            .IsInEnum()
            .WithMessage("Invalid payment mode.");
    }
}
```

**Pipeline Integration**:
```
Request → ValidationBehavior → Run validators → If invalid: throw
                                              → If valid: continue
```

---

### 1.8 Logging

#### Serilog 10.0.0
- **Purpose**: Structured logging library
- **Why**:
  - Structured logging (JSON)
  - Multiple sinks (Console, File, Database)
  - Log levels
  - Contextual logging
  - Performance
- **Where**: All services + Gateway
- **Packages**:
  - `Serilog.AspNetCore` - ASP.NET Core integration
  - `Serilog.Sinks.File` - File logging

**Configuration**:
```json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning"
      }
    },
    "WriteTo": [
      { "Name": "Console" },
      { 
        "Name": "File",
        "Args": {
          "path": "logs/log-.txt",
          "rollingInterval": "Day"
        }
      }
    ]
  }
}
```

**Features**:
- Request logging middleware
- Structured properties
- Log enrichment
- Rolling file logs

---

### 1.9 Resilience & Retry

#### Polly 8.6.6
- **Purpose**: Resilience and transient-fault-handling library
- **Why**:
  - Circuit breaker pattern
  - Retry policies
  - Timeout policies
  - Bulkhead isolation
  - Fallback strategies
- **Where**: 
  - Gateway (via Ocelot.Provider.Polly)
  - Service-to-service calls (custom implementation)

**Custom Retry Implementation** (Order → Inventory):
```csharp
private const int _maxAttempts = 3;

for (var attempt = 1; attempt <= _maxAttempts; attempt++)
{
    try
    {
        var response = await httpClient.SendAsync(request);
        if (response.IsSuccessStatusCode) return true;
        
        if (!IsTransientStatusCode(response.StatusCode) || attempt == _maxAttempts)
            return false;
    }
    catch (HttpRequestException) when (attempt < _maxAttempts) { }
    catch (TaskCanceledException) when (attempt < _maxAttempts) { }
    
    await Task.Delay(TimeSpan.FromMilliseconds(150 * attempt)); // Exponential backoff
}
```

---

### 1.10 CQRS & Mediator

#### MediatR 14.1.0
- **Purpose**: Mediator pattern implementation for CQRS
- **Why**:
  - Decouples request/response
  - Pipeline behaviors
  - Single responsibility
  - Testability
  - Clean architecture
- **Where**: All services (Application layer)

**Pattern**:
```
Controller → MediatR → Pipeline Behaviors → Handler → Response
```

**Pipeline Behaviors** (in order):
1. LoggingBehavior - Log request/response
2. IdempotencyBehavior - Check duplicates
3. ValidationBehavior - Validate input
4. TransactionBehavior - Auto-save changes

**Example**:
```csharp
// Command
public sealed record CreateOrderCommand(CreateOrderRequest Request) 
    : IRequest<OrderDto>;

// Handler
public sealed class CreateOrderCommandHandler(IOrderService service)
    : IRequestHandler<CreateOrderCommand, OrderDto>
{
    public Task<OrderDto> Handle(CreateOrderCommand request, CancellationToken ct)
    {
        return service.CreateOrderAsync(request.Request, ct);
    }
}

// Usage in controller
var command = new CreateOrderCommand(request);
var result = await _sender.Send(command, cancellationToken);
```

---

### 1.11 Authentication & Authorization

#### JWT Bearer Authentication
- **Package**: `Microsoft.AspNetCore.Authentication.JwtBearer` 10.0.5
- **Purpose**: Token-based authentication
- **Why**:
  - Stateless authentication
  - Cross-domain support
  - Scalable
  - Standard (RFC 7519)
- **Where**: All services + Gateway

**Configuration**:
```csharp
services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "SupplyChainPlatform",
            ValidateAudience = true,
            ValidAudiences = ["SupplyChainPlatform.Client"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
    });
```

**Token Structure**:
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "Dealer",
  "jti": "unique-token-id",
  "exp": 1234567890,
  "iss": "SupplyChainPlatform",
  "aud": "SupplyChainPlatform.Client"
}
```

---

### 1.12 PDF Generation

#### QuestPDF 2026.2.4
- **Purpose**: Modern PDF generation library
- **Why**:
  - Fluent API
  - Layout engine
  - Cross-platform
  - No external dependencies
  - High performance
- **Where**: PaymentInvoice service
- **Use Case**: Generate invoice PDFs

**Implementation**: `PaymentInvoice.Infrastructure/Documents/QuestPdfInvoiceGenerator.cs`

**Example**:
```csharp
public Task<string> GenerateAsync(Invoice invoice, CancellationToken ct)
{
    QuestPDF.Settings.License = LicenseType.Community;
    
    var document = Document.Create(container =>
    {
        container.Page(page =>
        {
            page.Header().Text($"Invoice #{invoice.InvoiceNumber}");
            page.Content().Column(column =>
            {
                column.Item().Text($"Dealer: {invoice.DealerId}");
                column.Item().Text($"Total: ₹{invoice.GrandTotal}");
                // ... more content
            });
        });
    });
    
    var pdfPath = $"invoices/{invoice.InvoiceNumber}.pdf";
    document.GeneratePdf(pdfPath);
    return Task.FromResult(pdfPath);
}
```

---

### 1.13 Payment Gateway Integration

#### Razorpay (Simulated)
- **Purpose**: Payment processing integration
- **Why**: Popular payment gateway in India
- **Where**: PaymentInvoice service
- **Implementation**: `PaymentInvoice.Infrastructure/PaymentGateway/RazorpayPaymentGateway.cs`

**Note**: Currently simulated for development. In production, would integrate with actual Razorpay API.

---

### 1.14 API Documentation

#### Swagger/OpenAPI
- **Packages**:
  - `Microsoft.AspNetCore.OpenApi` 10.0.4
  - `Swashbuckle.AspNetCore` 10.1.7
- **Purpose**: API documentation and testing
- **Why**:
  - Interactive API documentation
  - API testing interface
  - OpenAPI specification
  - Client code generation
- **Where**: All services (Development only)
- **Access**: `http://localhost:800X/swagger`

---

## 2. 🎨 Frontend Technologies

### 2.1 Core Framework

#### Angular 21.2.0
- **Purpose**: Frontend framework for building SPAs
- **Why**:
  - Component-based architecture
  - TypeScript support
  - Reactive programming (RxJS)
  - Dependency injection
  - CLI tooling
  - Strong typing
- **Where**: `supply-chain-frontend/`

**Key Packages**:
- `@angular/core` - Core framework
- `@angular/common` - Common directives/pipes
- `@angular/router` - Routing
- `@angular/forms` - Form handling
- `@angular/platform-browser` - Browser platform

---

### 2.2 State Management & HTTP

#### RxJS 7.8.0
- **Purpose**: Reactive programming library
- **Why**:
  - Asynchronous data streams
  - Operators for data transformation
  - Observable pattern
  - Error handling
- **Where**: Throughout Angular app
- **Use Cases**:
  - HTTP requests
  - Event handling
  - State management
  - Real-time updates

#### HttpClient (Angular)
- **Purpose**: HTTP communication with backend
- **Why**:
  - Built-in Angular service
  - Observable-based
  - Interceptor support
  - Type-safe
- **Where**: Services layer
- **Interceptors**:
  - `AuthInterceptor` - Add JWT token
  - `CorrelationIdInterceptor` - Add correlation ID

---

### 2.3 Server-Side Rendering

#### Angular SSR 21.2.5
- **Purpose**: Server-side rendering for Angular
- **Why**:
  - SEO optimization
  - Faster initial load
  - Better performance
- **Where**: `supply-chain-frontend/`

#### Express 5.1.0
- **Purpose**: Node.js web server for SSR
- **Why**: Required for Angular Universal SSR
- **Where**: SSR server

---

### 2.4 Testing

#### Vitest 4.1.2
- **Purpose**: Unit testing framework
- **Why**:
  - Fast execution
  - Vite-powered
  - Jest-compatible API
  - TypeScript support
- **Where**: Frontend tests
- **Packages**:
  - `vitest` - Test runner
  - `@vitest/browser-preview` - Browser testing
  - `jsdom` - DOM simulation

---

### 2.5 Build Tools

#### Angular CLI 21.2.5
- **Purpose**: Command-line interface for Angular
- **Why**:
  - Project scaffolding
  - Build optimization
  - Development server
  - Code generation
- **Commands**:
  - `ng serve` - Development server
  - `ng build` - Production build
  - `ng test` - Run tests

#### TypeScript 5.9.2
- **Purpose**: Typed superset of JavaScript
- **Why**:
  - Static typing
  - Better IDE support
  - Compile-time error checking
  - Modern JavaScript features
- **Where**: All frontend code

---

## 3. 🐳 Infrastructure & DevOps

### 3.1 Containerization

#### Docker
- **Purpose**: Container platform
- **Why**:
  - Consistent environments
  - Easy deployment
  - Isolation
  - Portability
- **Where**: Infrastructure services

#### Docker Compose
- **Purpose**: Multi-container orchestration
- **Why**:
  - Define multi-container apps
  - Easy local development
  - Service dependencies
- **File**: `docker-compose.yml`

**Services**:
```yaml
services:
  rabbitmq:
    image: rabbitmq:4.1-management
    ports:
      - "5673:5672"
      - "15672:15672"
  
  redis:
    image: redis:7.4-alpine
    ports:
      - "6379:6379"
  
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI
```

---

### 3.2 Email (Development)

#### Mailpit
- **Purpose**: Email testing tool
- **Why**:
  - Captures all outgoing emails
  - Web UI for viewing emails
  - No actual email sending
  - Perfect for development
- **Where**: Docker container
- **Ports**:
  - SMTP: 1025
  - Web UI: 8025
- **Access**: `http://localhost:8025`

---

## 4. 📚 Shared Libraries

### 4.1 SharedKernel
- **Purpose**: Domain-driven design building blocks
- **Location**: `src/SharedKernel/`
- **Dependencies**: None (pure)
- **Components**:
  - `Entity` - Base class for entities with domain events
  - `ValueObject` - Base record for value objects
  - `IntegrationEvent` - Base for cross-service events

---

### 4.2 BuildingBlocks
- **Purpose**: Technical infrastructure components
- **Location**: `src/BuildingBlocks/`
- **Dependencies**: MediatR, FluentValidation, Redis, RabbitMQ, Polly, Hangfire
- **Components**:
  - **Behaviors**: Validation, Transaction, Idempotency, Logging
  - **Caching**: Redis cache service
  - **Persistence**: Outbox pattern, DbContext interface
  - **Extensions**: Service registration helpers

---

## 5. 🏗️ Architecture Patterns

### 5.1 Design Patterns Used

| Pattern | Technology | Where |
|---------|-----------|-------|
| **Microservices** | ASP.NET Core | All services |
| **API Gateway** | Ocelot | Gateway |
| **CQRS** | MediatR | All services |
| **Repository** | EF Core | Infrastructure layer |
| **Unit of Work** | DbContext | EF Core |
| **Outbox** | SQL Server + Hangfire | All services |
| **Saga** | Custom orchestration | Order service |
| **Circuit Breaker** | Polly | Gateway + Services |
| **Retry** | Polly + Custom | Service calls |
| **Mediator** | MediatR | Application layer |
| **Dependency Injection** | ASP.NET Core DI | All services |
| **Pipeline** | MediatR Behaviors | Cross-cutting concerns |

---

### 5.2 Architectural Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                      │
│  - Angular Frontend                                          │
│  - API Controllers                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                     Application Layer                        │
│  - MediatR Commands/Queries                                  │
│  - DTOs                                                      │
│  - Validators (FluentValidation)                            │
│  - Services                                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                       Domain Layer                           │
│  - Entities                                                  │
│  - Value Objects                                             │
│  - Domain Events                                             │
│  - Business Logic                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                   Infrastructure Layer                       │
│  - EF Core DbContext                                         │
│  - Repositories                                              │
│  - External Service Clients                                  │
│  - Background Jobs (Hangfire)                                │
│  - Message Publishing (RabbitMQ)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 📊 Technology Decision Matrix

| Requirement | Technology | Alternative Considered | Why Chosen |
|-------------|-----------|----------------------|------------|
| **Backend Framework** | .NET 10 | Node.js, Java Spring | Performance, type safety, ecosystem |
| **Frontend Framework** | Angular 21 | React, Vue | Enterprise features, TypeScript, structure |
| **Database** | SQL Server | PostgreSQL, MySQL | Enterprise support, ACID, tooling |
| **Cache** | Redis | Memcached | Rich data structures, persistence |
| **Message Broker** | RabbitMQ | Kafka, Azure Service Bus | Ease of use, reliability, features |
| **API Gateway** | Ocelot | Kong, YARP | .NET native, simple configuration |
| **ORM** | EF Core | Dapper, NHibernate | Productivity, migrations, LINQ |
| **Logging** | Serilog | NLog, Log4net | Structured logging, sinks |
| **Validation** | FluentValidation | Data Annotations | Flexibility, testability |
| **Background Jobs** | Hangfire | Quartz.NET | Dashboard, persistence, simplicity |
| **PDF Generation** | QuestPDF | iTextSharp, PdfSharp | Modern API, performance |
| **Testing** | Vitest | Jest, Jasmine | Speed, Vite integration |

---

## 7. 🔢 Version Summary

### Backend
- .NET SDK: 10.0.104
- ASP.NET Core: 10.0
- Entity Framework Core: 10.0.5
- Ocelot: 24.1.0
- MediatR: 14.1.0
- FluentValidation: 12.1.1
- Serilog: 10.0.0
- Hangfire: 1.8.23
- StackExchange.Redis: 2.12.8
- RabbitMQ.Client: 7.2.1
- Polly: 8.6.6
- QuestPDF: 2026.2.4

### Frontend
- Angular: 21.2.0
- TypeScript: 5.9.2
- RxJS: 7.8.0
- Vitest: 4.1.2

### Infrastructure
- SQL Server: Latest
- Redis: 7.4-alpine
- RabbitMQ: 4.1-management
- Mailpit: Latest

---

## 8. 📦 Package Management

### Backend
- **Tool**: NuGet
- **Configuration**: `.csproj` files
- **Restore**: `dotnet restore`

### Frontend
- **Tool**: npm 11.5.0
- **Configuration**: `package.json`
- **Install**: `npm install`

---

## 9. 🚀 Development Tools

### IDE/Editors
- Visual Studio 2024
- Visual Studio Code
- Rider

### CLI Tools
- .NET CLI (`dotnet`)
- Angular CLI (`ng`)
- Docker CLI (`docker`)
- npm/npx

### Database Tools
- SQL Server Management Studio (SSMS)
- Azure Data Studio
- Redis CLI
- RabbitMQ Management UI

---

## 10. 🎯 Summary

Your Supply Chain Management System uses a modern, enterprise-grade tech stack:

**Backend**: .NET 10 microservices with clean architecture, CQRS, event-driven communication

**Frontend**: Angular 21 SPA with TypeScript and reactive programming

**Infrastructure**: Docker-based development with SQL Server, Redis, and RabbitMQ

**Patterns**: Microservices, API Gateway, CQRS, Outbox, Saga, Circuit Breaker, Repository

**Quality**: Validation, logging, caching, resilience, background jobs, testing

This stack provides:
- ✅ High performance
- ✅ Scalability
- ✅ Maintainability
- ✅ Testability
- ✅ Enterprise-ready
- ✅ Modern development experience

---

**Document Version**: 1.0  
**Last Updated**: April 15, 2026  
**Total Technologies**: 40+
