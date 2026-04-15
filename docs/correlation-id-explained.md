# Correlation ID - Complete Explanation

## What is a Correlation ID?

A **Correlation ID** is a unique identifier (UUID/GUID) that is attached to every request as it flows through your distributed microservices system. It acts like a "tracking number" that follows a single user request across multiple services, allowing you to trace the entire journey of that request.

Think of it like a package tracking number - just as you can track a package from sender to recipient through multiple distribution centers, a correlation ID lets you track a request from the frontend through the gateway and across multiple backend services.

---

## Why is it Needed?

### 1. Distributed Tracing
In a microservices architecture, a single user action can trigger calls across multiple services:

```
User clicks "Place Order"
  ↓
Frontend → Gateway → Order Service → Inventory Service
                   ↓                ↓
                   Payment Service  Notification Service
                   ↓
                   Logistics Service
```

Without a correlation ID, if something goes wrong, you'd have to manually search through logs in 6+ different services to piece together what happened. With a correlation ID, you can instantly find all related log entries across all services.

### 2. Debugging & Troubleshooting
When a user reports an error, they can provide the correlation ID from the error message. You can then:
- Search logs across all services using that single ID
- See the exact sequence of events
- Identify which service failed and why
- Understand the complete context of the failure

### 3. Performance Monitoring
Track how long a request takes as it moves through different services:
- Frontend → Gateway: 50ms
- Gateway → Order Service: 200ms
- Order Service → Inventory Service: 150ms
- Total request time: 400ms

### 4. Error Correlation
When errors occur in multiple services due to a single root cause, the correlation ID helps you understand they're all related to the same original request.

---

## How is it Made?

### Frontend Generation (Angular)

**Location**: `supply-chain-frontend/src/app/core/interceptors/correlation-id.interceptor.ts`

```typescript
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  // Generate a new UUID for each request
  const correlationId = uuid();
  
  // Add it to the request headers
  const headers: Record<string, string> = { 
    'X-Correlation-Id': correlationId 
  };
  
  // Clone the request with the new header
  const cloned = req.clone({ setHeaders: headers });
  
  // Propagate correlation ID to error objects for frontend error handling
  return next(cloned).pipe(
    tap({ error: err => { err['correlationId'] = correlationId; } })
  );
};
```

**UUID Generation Function**:
```typescript
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
```

This generates a UUID v4 format like: `a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c`

---

## Where is it Made?

### Creation Point: Frontend Interceptor

The correlation ID is **created at the very beginning** of the request lifecycle:

1. **User Action**: User clicks a button or submits a form
2. **HTTP Request**: Angular HttpClient prepares to send a request
3. **Interceptor Execution**: `correlationIdInterceptor` runs BEFORE the request leaves the browser
4. **UUID Generation**: A new unique correlation ID is generated
5. **Header Injection**: The ID is added to the `X-Correlation-Id` header
6. **Request Sent**: The request with the correlation ID is sent to the backend

**Key Point**: Each new HTTP request gets its own unique correlation ID. This means:
- Placing an order: Gets correlation ID `abc-123`
- Viewing order details: Gets a different correlation ID `def-456`
- Updating profile: Gets another correlation ID `ghi-789`

---

## Where is it Sent?

The correlation ID flows through the entire system:

### 1. Frontend → Gateway
```http
POST /orders/api/orders HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGc...
X-Correlation-Id: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
Oc-Client: supply-chain-frontend
Content-Type: application/json

{
  "dealerId": "...",
  "items": [...]
}
```

### 2. Gateway → Backend Services
The Ocelot Gateway **preserves and forwards** the correlation ID to downstream services.

**Configuration** (`gateway/OcelotGateway/ocelot.json`):
```json
{
  "RequestIdKey": "X-Correlation-Id",
  "GlobalConfiguration": {
    "RequestIdKey": "X-Correlation-Id"
  }
}
```

This tells Ocelot to:
- Look for the `X-Correlation-Id` header in incoming requests
- Forward it to all downstream services
- Use it for internal request tracking

### 3. Service-to-Service Communication
When services make internal HTTP calls to each other, they should propagate the correlation ID:

```csharp
// Example: Order Service calling Inventory Service
var request = new HttpRequestMessage(HttpMethod.Post, "http://inventory-service/api/reserve");
request.Headers.Add("X-Correlation-Id", correlationId); // Propagate the ID
request.Headers.Add("X-Internal-Api-Key", internalApiKey);
```

### 4. Error Responses
When errors occur, the correlation ID is included in the error response:

```json
{
  "code": "business.conflict",
  "message": "Insufficient inventory for product SKU-123",
  "retryable": false,
  "correlationId": "a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c",
  "details": {
    "productId": "...",
    "requested": 100,
    "available": 50
  }
}
```

---

## What is the Role of Correlation ID?

### 1. Request Tracking Across Services

**Example Flow**: User places an order

```
[Frontend] correlationId: abc-123
  ↓ POST /orders/api/orders
[Gateway] correlationId: abc-123
  ↓ Forward to Order Service
[Order Service] correlationId: abc-123
  ├→ POST /catalog/internal/inventory/reserve (correlationId: abc-123)
  │  [Inventory Service] correlationId: abc-123
  │  └→ Returns: Stock reserved
  ├→ POST /payments/internal/payment/process (correlationId: abc-123)
  │  [Payment Service] correlationId: abc-123
  │  └→ Returns: Payment processed
  └→ POST /logistics/internal/shipments (correlationId: abc-123)
     [Logistics Service] correlationId: abc-123
     └→ Returns: Shipment created
```

All services log with the same correlation ID, making it easy to trace the entire flow.

### 2. Error Response Handling

**Backend Error Handler** (All services have similar code):

```csharp
static Task WriteErrorAsync(
    HttpContext context, 
    int statusCode, 
    string code, 
    string message, 
    bool retryable, 
    object? details = null)
{
    context.Response.StatusCode = statusCode;
    context.Response.ContentType = "application/json";

    // Extract correlation ID from request header
    var correlationId = context.Request.Headers
        .TryGetValue("X-Correlation-Id", out var header)
        && !string.IsNullOrWhiteSpace(header)
        ? header.ToString()
        : context.TraceIdentifier; // Fallback to ASP.NET Core's TraceIdentifier

    // Include correlation ID in error response
    return context.Response.WriteAsJsonAsync(new
    {
        code,
        message,
        retryable,
        correlationId, // ← Sent back to frontend
        details
    });
}
```

**Frontend Error Display**:
```typescript
// In error handler
this.errorService.showError({
  message: error.message,
  correlationId: error.correlationId // Display to user
});
```

User sees:
```
Error: Insufficient inventory
Correlation ID: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
Please contact support with this ID if the issue persists.
```

### 3. Log Aggregation & Search

**Scenario**: User reports an error with correlation ID `a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c`

**Search logs across all services**:
```bash
# Search in Order Service logs
grep "a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c" order-service.log

# Search in Inventory Service logs
grep "a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c" inventory-service.log

# Search in Payment Service logs
grep "a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c" payment-service.log
```

**Results**:
```
[Order Service] 2026-04-15 10:30:15 [a3f2b1c4] INFO: Order placement started for dealer D123
[Order Service] 2026-04-15 10:30:16 [a3f2b1c4] INFO: Calling inventory service to reserve stock
[Inventory Service] 2026-04-15 10:30:16 [a3f2b1c4] WARN: Insufficient stock for product P456
[Inventory Service] 2026-04-15 10:30:16 [a3f2b1c4] ERROR: Stock reservation failed
[Order Service] 2026-04-15 10:30:17 [a3f2b1c4] ERROR: Order placement failed due to inventory issue
```

You can now see the complete story of what happened!

### 4. Rate Limiting & Throttling

**Gateway Rate Limiter** (`gateway/OcelotGateway/Program.cs`):

```csharp
options.OnRejected = async (context, cancellationToken) =>
{
    var correlationId = context.HttpContext.Request.Headers
        .TryGetValue("X-Correlation-Id", out var header)
        && !string.IsNullOrWhiteSpace(header)
        ? header.ToString()
        : context.HttpContext.TraceIdentifier;

    await context.HttpContext.Response.WriteAsJsonAsync(new
    {
        code = "throttle.too-many-requests",
        message = "Too many requests. Please retry after a short delay.",
        retryable = true,
        correlationId // ← User knows which request was throttled
    }, cancellationToken);
};
```

### 5. Saga Orchestration Tracking

In the Order Saga, the correlation ID helps track the entire distributed transaction:

```
[Saga Start] correlationId: abc-123
  ├→ [Step 1] Reserve Inventory (correlationId: abc-123)
  ├→ [Step 2] Process Payment (correlationId: abc-123)
  ├→ [Step 3] Generate Invoice (correlationId: abc-123)
  └→ [Step 4] Create Shipment (correlationId: abc-123)

If Step 2 fails:
  ├→ [Compensate 1] Release Inventory (correlationId: abc-123)
  └→ [Saga Failed] (correlationId: abc-123)
```

All saga steps and compensations are tracked with the same correlation ID.

---

## Complete Request Flow Example

### Scenario: User places an order

**1. Frontend (Angular)**
```typescript
// User clicks "Place Order"
// Interceptor generates: correlationId = "a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c"

POST http://localhost:5000/orders/api/orders
Headers:
  X-Correlation-Id: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
  Oc-Client: supply-chain-frontend
  Authorization: Bearer eyJhbGc...
```

**2. Gateway (Ocelot)**
```
[Gateway] Received request with correlationId: a3f2b1c4
[Gateway] Forwarding to Order Service at http://order-service:8080
[Gateway] Preserving X-Correlation-Id header
```

**3. Order Service**
```csharp
[Order Service] correlationId: a3f2b1c4
[Order Service] Starting order placement for dealer D123
[Order Service] Initiating saga orchestration
```

**4. Order Service → Inventory Service**
```csharp
[Order Service] Calling Inventory Service to reserve stock
POST http://inventory-service:8081/api/internal/inventory/reserve
Headers:
  X-Correlation-Id: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
  X-Internal-Api-Key: shared-secret
```

**5. Inventory Service**
```csharp
[Inventory Service] correlationId: a3f2b1c4
[Inventory Service] Reserving stock for 3 products
[Inventory Service] Stock reserved successfully
```

**6. Order Service → Payment Service**
```csharp
[Order Service] Calling Payment Service to process payment
POST http://payment-service:8082/api/internal/payment/process
Headers:
  X-Correlation-Id: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
  X-Internal-Api-Key: shared-secret
```

**7. Payment Service**
```csharp
[Payment Service] correlationId: a3f2b1c4
[Payment Service] Processing credit payment for dealer D123
[Payment Service] Payment processed successfully
```

**8. Order Service → Logistics Service**
```csharp
[Order Service] Calling Logistics Service to create shipment
POST http://logistics-service:8083/api/internal/shipments
Headers:
  X-Correlation-Id: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
  X-Internal-Api-Key: shared-secret
```

**9. Logistics Service**
```csharp
[Logistics Service] correlationId: a3f2b1c4
[Logistics Service] Creating shipment for order O12345
[Logistics Service] Shipment created successfully
```

**10. Order Service → Frontend**
```json
HTTP 201 Created
{
  "orderId": "O12345",
  "orderNumber": "ORD-2026-001234",
  "status": "Placed",
  "totalAmount": 15000.00
}
```

**11. Frontend Success**
```typescript
// Order placed successfully
// If user needs support, they can reference: a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c
```

---

## Error Scenario with Correlation ID

### Scenario: Insufficient inventory

**1. Frontend Request**
```
correlationId: xyz-789
POST /orders/api/orders
```

**2. Order Service → Inventory Service**
```
correlationId: xyz-789
POST /catalog/internal/inventory/reserve
```

**3. Inventory Service Error**
```csharp
[Inventory Service] correlationId: xyz-789
[Inventory Service] ERROR: Insufficient stock for product P456
[Inventory Service] Requested: 100, Available: 50
```

**4. Inventory Service Response**
```json
HTTP 409 Conflict
{
  "code": "business.conflict",
  "message": "Insufficient inventory for product SKU-123",
  "retryable": false,
  "correlationId": "xyz-789",
  "details": {
    "productId": "P456",
    "requested": 100,
    "available": 50
  }
}
```

**5. Order Service Logs**
```
[Order Service] correlationId: xyz-789
[Order Service] ERROR: Saga step failed - Inventory reservation failed
[Order Service] Initiating compensation
```

**6. Order Service Response to Frontend**
```json
HTTP 409 Conflict
{
  "code": "business.conflict",
  "message": "Unable to place order: Insufficient inventory",
  "retryable": false,
  "correlationId": "xyz-789",
  "details": {
    "failedStep": "InventoryReservation",
    "reason": "Insufficient stock"
  }
}
```

**7. Frontend Error Display**
```
❌ Order Failed
Unable to place order: Insufficient inventory

Correlation ID: xyz-789
Please contact support if you need assistance.
```

**8. Support Investigation**
Support team searches logs with `xyz-789` and immediately sees:
- User attempted to order 100 units of product P456
- Only 50 units were available
- Order was rejected at the inventory reservation step
- No payment was processed (saga compensation worked correctly)

---

## Best Practices in Your System

### ✅ What Your System Does Right

1. **Generates at the Edge**: Correlation ID is created at the frontend, ensuring it covers the entire request lifecycle
2. **Propagates Through Gateway**: Ocelot is configured to preserve and forward the correlation ID
3. **Includes in Error Responses**: All services return the correlation ID in error responses
4. **Fallback Mechanism**: Uses ASP.NET Core's `TraceIdentifier` if correlation ID is missing
5. **Consistent Header Name**: Uses `X-Correlation-Id` across all services
6. **Frontend Error Handling**: Attaches correlation ID to error objects for display

### 🔧 Potential Enhancements

1. **Structured Logging**: Add correlation ID to all log entries using Serilog enrichers
2. **Service-to-Service Propagation**: Ensure internal HTTP calls propagate the correlation ID
3. **Event Publishing**: Include correlation ID in domain events published via OutboxMessage
4. **Database Logging**: Store correlation ID in audit tables for long-term traceability
5. **Monitoring Integration**: Send correlation ID to APM tools (Application Insights, Datadog, etc.)

---

## Summary

| Aspect | Details |
|--------|---------|
| **What** | Unique UUID that tracks a request across services |
| **Why** | Distributed tracing, debugging, performance monitoring, error correlation |
| **How** | Generated using UUID v4 algorithm in frontend interceptor |
| **Where Made** | Frontend Angular interceptor before request leaves browser |
| **Where Sent** | Frontend → Gateway → All Backend Services → Error Responses |
| **Role** | Request tracking, log correlation, error reporting, debugging, monitoring |
| **Header Name** | `X-Correlation-Id` |
| **Format** | UUID v4: `a3f2b1c4-5d6e-4f7a-8b9c-0d1e2f3a4b5c` |
| **Lifecycle** | Created per HTTP request, flows through entire system, returned in responses |

---

**Document Version**: 1.0  
**Last Updated**: April 15, 2026  
**Generated By**: Kiro AI Assistant
