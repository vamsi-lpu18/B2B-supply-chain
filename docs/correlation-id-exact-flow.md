# Correlation ID - Exact Flow in Your System

## Complete Technical Flow Analysis

This document provides the **exact, step-by-step flow** of how correlation ID works in your Supply Chain Management System, based on actual code implementation.

---

## 🔍 Current Implementation Status

### ✅ What's Implemented

1. **Frontend Generation**: Correlation ID is generated in Angular interceptor
2. **Gateway Forwarding**: Ocelot preserves and forwards correlation ID
3. **Backend Error Responses**: All services return correlation ID in error responses
4. **Serilog Request Logging**: Basic HTTP request logging with Serilog

### ⚠️ What's NOT Implemented (Yet)

1. **Service-to-Service Propagation**: Internal HTTP calls do NOT propagate correlation ID
2. **Structured Logging**: Correlation ID is NOT added to application logs
3. **Log Context Enrichment**: Serilog is NOT enriched with correlation ID
4. **Outbox Events**: Correlation ID is NOT stored in OutboxMessage table

---

## 📊 Exact Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: FRONTEND - Correlation ID Generation                            │
└─────────────────────────────────────────────────────────────────────────┘

User Action (e.g., Place Order)
    ↓
Angular HttpClient prepares request
    ↓
correlationIdInterceptor executes
    ↓
Generate UUID: "a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c"
    ↓
Add header: X-Correlation-Id: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
Add header: Oc-Client: supply-chain-frontend
    ↓
Attach correlationId to error object for frontend error handling
    ↓
Send HTTP request to Gateway


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: GATEWAY - Correlation ID Reception & Forwarding                 │
└─────────────────────────────────────────────────────────────────────────┘

Gateway receives request at http://localhost:5000/orders/api/orders
    ↓
Headers received:
  - X-Correlation-Id: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
  - Oc-Client: supply-chain-frontend
  - Authorization: Bearer eyJhbGc...
    ↓
Serilog Request Logging (UseSerilogRequestLogging)
  → Logs: HTTP POST /orders/api/orders responded 201 in 234ms
  → NOTE: Correlation ID is in HTTP context but NOT in log message
    ↓
Rate Limiter checks (uses Oc-Client header)
    ↓
Authentication/Authorization checks
    ↓
Ocelot Route Matching (ocelot.json)
  → Finds route with "RequestIdKey": "X-Correlation-Id"
  → This tells Ocelot to preserve the header
    ↓
Forward request to Order Service at http://localhost:8003/api/orders
Headers forwarded:
  - X-Correlation-Id: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c ✅
  - Authorization: Bearer eyJhbGc...
  - Other standard headers


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: ORDER SERVICE - Request Processing                              │
└─────────────────────────────────────────────────────────────────────────┘

Order Service receives request at http://localhost:8003/api/orders
    ↓
ASP.NET Core Pipeline starts
    ↓
Serilog Request Logging (UseSerilogRequestLogging)
  → Logs: HTTP POST /api/orders responded 201 in 189ms
  → NOTE: Correlation ID is in HTTP context but NOT in log message
    ↓
Authentication Middleware validates JWT
    ↓
Authorization Middleware checks permissions
    ↓
Request reaches OrdersController.CreateOrder()
    ↓
Controller extracts user claims (dealerId, role)
    ↓
Calls OrderService.CreateOrderAsync()
    ↓
Application logs (ILogger):
  → logger.LogInformation("Order saga started for order {OrderId}", orderId)
  → NOTE: Correlation ID is NOT in these logs ❌
    ↓
Business logic executes:
  1. Generate order number
  2. Create OrderAggregate
  3. Add order lines
  4. Call SoftLockOrderStockAsync()


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 4: ORDER → INVENTORY SERVICE (Internal Call)                       │
└─────────────────────────────────────────────────────────────────────────┘

OrderService calls inventoryGateway.SoftLockStockAsync()
    ↓
CatalogInventoryGateway.PostAsync() executes
    ↓
Creates HttpRequestMessage:
  POST http://localhost:8002/api/internal/inventory/soft-lock
    ↓
Headers added:
  - X-Internal-Api-Key: SupplyChainInternalApiKey_DevOnly_2026 ✅
  - Content-Type: application/json
  - NOTE: X-Correlation-Id is NOT propagated ❌
    ↓
HttpClient.SendAsync() sends request
    ↓
Retry logic (up to 3 attempts) with exponential backoff
    ↓
Logs on failure:
  → logger.LogWarning("Catalog inventory soft-lock failed...")
  → NOTE: Correlation ID is NOT in these logs ❌


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 5: INVENTORY SERVICE - Processing Internal Request                 │
└─────────────────────────────────────────────────────────────────────────┘

Inventory Service receives request
    ↓
InternalInventoryController.SoftLock() executes
    ↓
Validates X-Internal-Api-Key header
    ↓
NOTE: X-Correlation-Id header is NOT present in this request ❌
    ↓
Calls MediatR: sender.Send(new SoftLockStockCommand(...))
    ↓
Command handler executes business logic
    ↓
Application logs:
  → logger.LogInformation("Stock reserved for product {ProductId}")
  → NOTE: No correlation ID in logs ❌
    ↓
Database transaction:
  - Update Product.ReservedStock
  - Insert StockTransaction record
  - Insert OutboxMessage (for ProductStockReserved event)
    ↓
NOTE: OutboxMessage does NOT contain correlation ID ❌
    ↓
Returns 200 OK or 409 Conflict


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 6: ORDER → PAYMENT SERVICE (Credit Check)                          │
└─────────────────────────────────────────────────────────────────────────┘

OrderService calls creditCheckGateway.CheckCreditAsync()
    ↓
PaymentCreditCheckGateway executes
    ↓
Creates HttpRequestMessage:
  GET http://localhost:8005/api/payment/internal/dealers/{dealerId}/credit-check
    ↓
Headers added:
  - X-Internal-Api-Key: SupplyChainInternalApiKey_DevOnly_2026 ✅
  - NOTE: X-Correlation-Id is NOT propagated ❌
    ↓
HttpClient.SendAsync() sends request
    ↓
Payment Service processes credit check
    ↓
NOTE: Payment Service has NO correlation ID context ❌
    ↓
Returns CreditCheckResult


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 7: ORDER SERVICE - Saga Orchestration                              │
└─────────────────────────────────────────────────────────────────────────┘

OrderService continues after inventory and credit checks
    ↓
Calls sagaCoordinator.StartAsync()
    ↓
OrderSagaCoordinator creates/updates OrderSagaStateEntity
    ↓
Logs:
  → logger.LogInformation("Order saga started for order {OrderId}", orderId)
  → NOTE: No correlation ID in logs ❌
    ↓
Saves saga state to database
    ↓
Calls sagaCoordinator.MarkCreditCheckInProgressAsync()
    ↓
Updates saga state based on credit check result


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 8: ORDER SERVICE - Outbox Event Publishing                         │
└─────────────────────────────────────────────────────────────────────────┘

OrderService calls orderRepository.AddOutboxMessageAsync()
    ↓
Creates OutboxMessage:
  {
    MessageId: new Guid(),
    EventType: "OrderPlaced",
    Payload: JSON with order details,
    Status: Pending,
    CreatedAtUtc: DateTime.UtcNow
  }
    ↓
NOTE: OutboxMessage does NOT contain correlation ID ❌
    ↓
Saves to database in same transaction as order
    ↓
Background dispatcher (OrderOutboxDispatcher) will publish later
    ↓
When published to message broker (RabbitMQ):
  → Message does NOT contain correlation ID ❌
  → Downstream consumers have NO correlation context ❌


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 9: ORDER SERVICE - Success Response                                │
└─────────────────────────────────────────────────────────────────────────┘

OrderService returns OrderDto to controller
    ↓
Controller returns 201 Created with order details
    ↓
Response body:
  {
    "orderId": "...",
    "orderNumber": "ORD-2026-12345678",
    "status": "Placed",
    ...
  }
    ↓
NOTE: Correlation ID is NOT in success response body ❌
    ↓
ASP.NET Core pipeline completes
    ↓
Serilog logs request completion:
  → "HTTP POST /api/orders responded 201 in 189ms"
  → NOTE: Correlation ID is in HTTP context but not in log ❌


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 10: GATEWAY - Response Forwarding                                  │
└─────────────────────────────────────────────────────────────────────────┘

Gateway receives 201 response from Order Service
    ↓
Ocelot forwards response to frontend
    ↓
Response headers may include standard headers
    ↓
NOTE: X-Correlation-Id is NOT added to response headers ❌
    ↓
Serilog logs request completion:
  → "HTTP POST /orders/api/orders responded 201 in 234ms"


┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 11: FRONTEND - Success Handling                                    │
└─────────────────────────────────────────────────────────────────────────┘

Angular HttpClient receives 201 response
    ↓
correlationIdInterceptor does NOT modify success responses
    ↓
Component receives order data
    ↓
Displays success message to user
    ↓
Correlation ID is lost (not stored anywhere) ❌
```

---

## 🔴 Error Flow (With Correlation ID)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ERROR SCENARIO: Insufficient Inventory                                  │
└─────────────────────────────────────────────────────────────────────────┘

STEP 1-4: Same as success flow
    ↓
STEP 5: Inventory Service - Stock Check Fails
    ↓
InternalInventoryController.SoftLock()
    ↓
Command handler checks available stock
    ↓
Available: 50, Requested: 100
    ↓
Returns 409 Conflict:
  {
    "code": "business.conflict",
    "message": "Insufficient inventory",
    "retryable": false,
    "correlationId": null,  ❌ (because request didn't have it)
    "details": { ... }
  }
    ↓
Order Service receives 409 response
    ↓
CatalogInventoryGateway.PostAsync() returns false
    ↓
Logs warning:
  → logger.LogWarning("Catalog inventory soft-lock failed...")
  → NOTE: No correlation ID in log ❌
    ↓
OrderService.SoftLockOrderStockAsync() returns false
    ↓
OrderService.CreateOrderAsync() throws:
  → throw new InvalidOperationException("Unable to reserve stock...")
    ↓
Exception bubbles up to controller
    ↓
Global exception handler in Program.cs catches it
    ↓
WriteErrorAsync() executes:
  1. Extracts X-Correlation-Id from request headers ✅
  2. Falls back to TraceIdentifier if not found
  3. Creates error response:
     {
       "code": "business.rule-violation",
       "message": "Unable to reserve stock for one or more order lines.",
       "retryable": false,
       "correlationId": "a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c", ✅
       "details": null
     }
    ↓
Returns 400 Bad Request to Gateway
    ↓
Gateway forwards error response to Frontend
    ↓
Frontend correlationIdInterceptor attaches correlationId to error object
    ↓
Error handler displays:
  ❌ Order Failed
  Unable to reserve stock for one or more order lines.
  
  Correlation ID: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c ✅
  Please contact support if you need assistance.
```

---

## 📝 How Backend Uses Correlation ID (Current Implementation)

### 1. Gateway (OcelotGateway)

**File**: `gateway/OcelotGateway/Program.cs`

```csharp
// Configuration in ocelot.json
{
  "RequestIdKey": "X-Correlation-Id",  // Tells Ocelot to preserve this header
  "GlobalConfiguration": {
    "RequestIdKey": "X-Correlation-Id"
  }
}

// Rate Limiter Error Response
options.OnRejected = async (context, cancellationToken) =>
{
    // Extract correlation ID from request header
    var correlationId = context.HttpContext.Request.Headers
        .TryGetValue("X-Correlation-Id", out var header)
        && !string.IsNullOrWhiteSpace(header)
        ? header.ToString()
        : context.HttpContext.TraceIdentifier;  // Fallback

    // Include in error response
    await context.HttpContext.Response.WriteAsJsonAsync(new
    {
        code = "throttle.too-many-requests",
        message = "Too many requests. Please retry after a short delay.",
        retryable = true,
        correlationId  // ✅ Returned to frontend
    }, cancellationToken);
};

// Global Exception Handler
static Task WriteGatewayErrorAsync(HttpContext context, ...)
{
    // Extract correlation ID
    var correlationId = context.Request.Headers
        .TryGetValue("X-Correlation-Id", out var header)
        && !string.IsNullOrWhiteSpace(header)
        ? header.ToString()
        : context.TraceIdentifier;

    // Include in error response
    return context.Response.WriteAsJsonAsync(new
    {
        code,
        message,
        retryable,
        correlationId  // ✅ Returned to frontend
    });
}
```

**Usage**:
- ✅ Preserves X-Correlation-Id header when forwarding requests
- ✅ Includes correlation ID in rate limit error responses
- ✅ Includes correlation ID in global exception responses
- ❌ Does NOT log correlation ID in application logs
- ❌ Does NOT enrich Serilog context

---

### 2. Order Service

**File**: `services/Order/Order.API/Program.cs`

```csharp
// Global Exception Handler
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (ValidationException ex)
    {
        await WriteErrorAsync(
            context,
            StatusCodes.Status400BadRequest,
            "validation.failed",
            "Validation failed.",
            retryable: false,
            details: ex.Errors.Select(e => new { 
                field = e.PropertyName, 
                error = e.ErrorMessage 
            }));
    }
    catch (UnauthorizedAccessException ex) { ... }
    catch (KeyNotFoundException ex) { ... }
    catch (HttpRequestException ex) { ... }
    catch (TaskCanceledException ex) { ... }
    catch (InvalidOperationException ex) { ... }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, 
            "Unhandled Order API exception for {Method} {Path}", 
            context.Request.Method, 
            context.Request.Path);
        // NOTE: Correlation ID is NOT in this log ❌
        
        await WriteErrorAsync(
            context,
            StatusCodes.Status500InternalServerError,
            "internal.unexpected",
            "Unexpected server error.",
            retryable: true);
    }
});

// Error Response Helper
static Task WriteErrorAsync(
    HttpContext context, 
    int statusCode, 
    string code, 
    string message, 
    bool retryable, 
    object? details = null)
{
    if (context.Response.HasStarted)
    {
        return Task.CompletedTask;
    }

    context.Response.StatusCode = statusCode;
    context.Response.ContentType = "application/json";

    // Extract correlation ID from request header
    var correlationId = context.Request.Headers
        .TryGetValue("X-Correlation-Id", out var header)
        && !string.IsNullOrWhiteSpace(header)
        ? header.ToString()
        : context.TraceIdentifier;  // Fallback to ASP.NET Core's TraceIdentifier

    // Return error response with correlation ID
    return context.Response.WriteAsJsonAsync(new
    {
        code,
        message,
        retryable,
        correlationId,  // ✅ Returned to frontend
        details
    });
}
```

**Usage**:
- ✅ Extracts X-Correlation-Id from request headers in error handler
- ✅ Includes correlation ID in all error responses
- ✅ Falls back to TraceIdentifier if correlation ID is missing
- ❌ Does NOT propagate correlation ID to internal service calls
- ❌ Does NOT log correlation ID in application logs
- ❌ Does NOT store correlation ID in database

---

### 3. Service-to-Service Communication

**File**: `services/Order/Order.Infrastructure/Integrations/CatalogInventoryGateway.cs`

```csharp
private async Task<bool> PostAsync<TRequest>(
    string path,
    TRequest payload,
    string operation,
    Guid productId,
    Guid orderId,
    CancellationToken cancellationToken)
{
    var endpoint = new Uri(new Uri(_baseUrl), path);
    
    for (var attempt = 1; attempt <= _maxAttempts; attempt++)
    {
        try
        {
            // Create HTTP request
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload)
            };

            // Add internal API key for authentication
            if (!string.IsNullOrWhiteSpace(_internalApiKey))
            {
                request.Headers.TryAddWithoutValidation(
                    "X-Internal-Api-Key", 
                    _internalApiKey);  // ✅ Added
            }

            // NOTE: X-Correlation-Id is NOT added here ❌
            // This means downstream service has NO correlation context

            using var response = await httpClient.SendAsync(request, cancellationToken);
            
            if (response.IsSuccessStatusCode)
            {
                return true;
            }

            // Log failure
            logger.LogWarning(
                "Catalog inventory {Operation} failed for order {OrderId}, product {ProductId}...",
                operation,
                orderId,
                productId,
                attempt,
                _maxAttempts,
                (int)response.StatusCode,
                body);
            // NOTE: Correlation ID is NOT in this log ❌
        }
        catch (HttpRequestException ex) { ... }
        catch (TaskCanceledException ex) { ... }
    }
    
    return false;
}
```

**Current State**:
- ✅ Adds X-Internal-Api-Key for authentication
- ❌ Does NOT propagate X-Correlation-Id header
- ❌ Downstream services have NO correlation context
- ❌ Cannot trace requests across service boundaries

---

### 4. Logging (Serilog)

**File**: `services/Order/Order.API/appsettings.json`

```json
{
  "Serilog": {
    "Using": [ "Serilog.Sinks.Console", "Serilog.Sinks.File" ],
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "Microsoft.AspNetCore": "Warning"
      }
    },
    "WriteTo": [
      {
        "Name": "Console"
      },
      {
        "Name": "File",
        "Args": {
          "path": "logs/log-.txt",
          "rollingInterval": "Day",
          "shared": true
        }
      }
    ],
    "Enrich": [ "FromLogContext" ]  // ✅ Configured but NOT used
  }
}
```

**File**: `services/Order/Order.API/Program.cs`

```csharp
// Serilog configuration
builder.Host.UseSerilog((context, loggerConfiguration) =>
{
    loggerConfiguration.ReadFrom.Configuration(context.Configuration);
    // NOTE: No enricher for correlation ID ❌
});

// Request logging middleware
app.UseSerilogRequestLogging();
// This logs: "HTTP POST /api/orders responded 201 in 189ms"
// NOTE: Correlation ID is NOT in this log ❌
```

**Current Log Output**:
```
2026-04-11 00:00:05.882 +05:30 [INF] Hangfire heartbeat job executed at "2026-04-10T18:30:05.8821528Z"
2026-04-11 12:34:56.789 +05:30 [INF] Order saga started for order "abc-123-def-456"
2026-04-11 12:34:56.890 +05:30 [WRN] Catalog inventory soft-lock failed for order "abc-123-def-456"
```

**What's Missing**:
- ❌ No correlation ID in log entries
- ❌ Cannot search logs by correlation ID
- ❌ Cannot trace request flow through logs

---

### 5. Database Storage

**File**: `src/BuildingBlocks/Persistence/OutboxMessage.cs`

```csharp
public sealed class OutboxMessage
{
    public Guid MessageId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;  // JSON
    public OutboxStatus Status { get; set; } = OutboxStatus.Pending;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAtUtc { get; set; }
    public int RetryCount { get; set; }
    public string? Error { get; set; }
    
    // NOTE: No CorrelationId property ❌
}
```

**Current State**:
- ❌ OutboxMessage does NOT store correlation ID
- ❌ Published events do NOT contain correlation ID
- ❌ Event consumers have NO correlation context
- ❌ Cannot trace events back to original request

---

## 🎯 Summary: How Backend Currently Uses Correlation ID

### ✅ What Works

| Component | Usage | Status |
|-----------|-------|--------|
| Gateway | Preserves X-Correlation-Id header | ✅ Working |
| Gateway | Includes in rate limit errors | ✅ Working |
| Gateway | Includes in exception responses | ✅ Working |
| All Services | Extract from request headers | ✅ Working |
| All Services | Include in error responses | ✅ Working |
| All Services | Fallback to TraceIdentifier | ✅ Working |

### ❌ What's Missing

| Component | Missing Feature | Impact |
|-----------|----------------|--------|
| Service-to-Service | Correlation ID propagation | Cannot trace across services |
| Logging | Correlation ID in logs | Cannot search logs by ID |
| Serilog | Context enrichment | No structured logging |
| OutboxMessage | Correlation ID storage | Events lose context |
| Event Consumers | Correlation ID in events | Cannot trace async flows |
| Success Responses | Correlation ID in body | Lost after success |
| Database | Audit trail with correlation ID | No long-term traceability |

---

## 🔧 How to Improve (Recommendations)

### 1. Add Correlation ID to Service-to-Service Calls

**File**: `services/Order/Order.Infrastructure/Integrations/CatalogInventoryGateway.cs`

```csharp
// Add IHttpContextAccessor to access current request context
private readonly IHttpContextAccessor _httpContextAccessor;

private async Task<bool> PostAsync<TRequest>(...)
{
    using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
    {
        Content = JsonContent.Create(payload)
    };

    // Add internal API key
    if (!string.IsNullOrWhiteSpace(_internalApiKey))
    {
        request.Headers.TryAddWithoutValidation("X-Internal-Api-Key", _internalApiKey);
    }

    // ✅ Propagate correlation ID
    var correlationId = _httpContextAccessor.HttpContext?
        .Request.Headers["X-Correlation-Id"].ToString();
    
    if (!string.IsNullOrWhiteSpace(correlationId))
    {
        request.Headers.TryAddWithoutValidation("X-Correlation-Id", correlationId);
    }

    using var response = await httpClient.SendAsync(request, cancellationToken);
    // ...
}
```

### 2. Enrich Serilog with Correlation ID

**File**: `services/Order/Order.API/Program.cs`

```csharp
// Add middleware to enrich log context
app.Use(async (context, next) =>
{
    var correlationId = context.Request.Headers["X-Correlation-Id"].ToString();
    
    if (string.IsNullOrWhiteSpace(correlationId))
    {
        correlationId = context.TraceIdentifier;
    }

    using (Serilog.Context.LogContext.PushProperty("CorrelationId", correlationId))
    {
        await next();
    }
});

// Now all logs will include correlation ID:
// 2026-04-11 12:34:56.789 [INF] [CorrelationId: a3f2b1c4] Order saga started
```

### 3. Add Correlation ID to OutboxMessage

**File**: `src/BuildingBlocks/Persistence/OutboxMessage.cs`

```csharp
public sealed class OutboxMessage
{
    public Guid MessageId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public OutboxStatus Status { get; set; } = OutboxStatus.Pending;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAtUtc { get; set; }
    public int RetryCount { get; set; }
    public string? Error { get; set; }
    
    // ✅ Add correlation ID
    public string? CorrelationId { get; set; }
}
```

### 4. Include Correlation ID in Success Responses (Optional)

```csharp
// In controller
return Ok(new
{
    orderId = order.OrderId,
    orderNumber = order.OrderNumber,
    status = order.Status,
    correlationId = HttpContext.Request.Headers["X-Correlation-Id"].ToString()
});
```

---

## 📊 Complete Flow with Improvements

```
Frontend (correlationId: abc-123)
    ↓ X-Correlation-Id: abc-123
Gateway (logs with abc-123, forwards abc-123)
    ↓ X-Correlation-Id: abc-123
Order Service (logs with abc-123)
    ├→ X-Correlation-Id: abc-123 → Inventory Service (logs with abc-123)
    ├→ X-Correlation-Id: abc-123 → Payment Service (logs with abc-123)
    └→ OutboxMessage (stores abc-123) → Event (contains abc-123) → Consumers (log with abc-123)
    ↓ Response includes abc-123
Frontend (can display/store abc-123)
```

---

**Document Version**: 1.0  
**Last Updated**: April 15, 2026  
**Based On**: Actual code analysis of Supply Chain Management System
