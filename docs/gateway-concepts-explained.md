# Gateway Concepts - Complete Explanation

## Overview

This document explains all important concepts used in your Supply Chain Management System's API Gateway, including Load Balancing, Rate Limiting, Circuit Breaker, QoS, Caching, and more.

---

## 🌐 1. API Gateway (Ocelot)

### What is it?

An **API Gateway** is a single entry point for all client requests to your microservices. It acts as a reverse proxy that routes requests to appropriate backend services.

### Why use it?

- **Single Entry Point**: Clients only need to know one URL (gateway), not all microservice URLs
- **Cross-Cutting Concerns**: Authentication, rate limiting, logging handled in one place
- **Service Discovery**: Gateway knows where all services are located
- **Protocol Translation**: Can convert HTTP to gRPC, REST to SOAP, etc.
- **Request/Response Transformation**: Modify requests before forwarding

### Your Implementation

**Technology**: Ocelot (ASP.NET Core API Gateway)

**Configuration**: `gateway/OcelotGateway/ocelot.json`

```json
{
  "Routes": [
    {
      "Key": "order-route-get",
      "DownstreamPathTemplate": "/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [{ "Host": "localhost", "Port": 8003 }],
      "UpstreamPathTemplate": "/orders/{everything}",
      "UpstreamHttpMethod": ["GET"]
    }
  ],
  "GlobalConfiguration": {
    "BaseUrl": "http://localhost:5000"
  }
}
```

**How it works**:
```
Client Request: GET http://localhost:5000/orders/api/orders/123
                     ↓
Gateway receives at: /orders/api/orders/123
                     ↓
Matches route: "order-route-get"
                     ↓
Forwards to: http://localhost:8003/api/orders/123
                     ↓
Order Service processes request
                     ↓
Response flows back through gateway to client
```

---

## ⚖️ 2. Load Balancing

### What is it?

**Load Balancing** distributes incoming requests across multiple instances of the same service to:
- Improve performance
- Increase availability
- Enable horizontal scaling

### Load Balancing Algorithms

#### Round Robin (Your Implementation)

Distributes requests evenly in a circular pattern.

```
Request 1 → Instance A
Request 2 → Instance B
Request 3 → Instance A
Request 4 → Instance B
```

#### Other Algorithms (Not Used)

- **Least Connection**: Routes to instance with fewest active connections
- **Random**: Randomly selects an instance
- **Weighted**: Assigns more requests to more powerful instances

### Your Implementation

**Configuration**: `gateway/OcelotGateway/ocelot.json`

```json
{
  "Key": "identity-auth-public-lb-demo",
  "DownstreamPathTemplate": "/api/auth/{everything}",
  "DownstreamScheme": "http",
  "DownstreamHostAndPorts": [
    { "Host": "localhost", "Port": 8001 },  // Instance 1
    { "Host": "localhost", "Port": 8101 }   // Instance 2
  ],
  "UpstreamPathTemplate": "/identity-lb/api/auth/{everything}",
  "LoadBalancerOptions": {
    "Type": "RoundRobin",
    "Key": "identity-auth-lb-demo"
  }
}
```

**How it works**:

```
┌─────────────────────────────────────────────────────────────┐
│ Load Balancer Flow                                          │
└─────────────────────────────────────────────────────────────┘

Request 1: POST /identity-lb/api/auth/login
    ↓
Gateway (Round Robin)
    ↓
Routes to: localhost:8001 (Instance 1)
    ↓
Response from Instance 1

Request 2: POST /identity-lb/api/auth/login
    ↓
Gateway (Round Robin)
    ↓
Routes to: localhost:8101 (Instance 2)
    ↓
Response from Instance 2

Request 3: POST /identity-lb/api/auth/login
    ↓
Gateway (Round Robin)
    ↓
Routes to: localhost:8001 (Instance 1) ← Back to first
    ↓
Response from Instance 1
```

**Benefits**:
- If Instance 1 crashes, requests go to Instance 2
- Distributes load evenly across instances
- Enables zero-downtime deployments

**Your Services with Load Balancing**:
- Identity Service: Ports 8001, 8101
- Catalog Service: Ports 8002, 8102
- Order Service: Ports 8003, 8103
- Logistics Service: Ports 8004, 8104
- Payment Service: Ports 8005, 8105
- Notification Service: Ports 8006, 8106

---

## 🚦 3. Rate Limiting (Throttling)

### What is it?

**Rate Limiting** restricts the number of requests a client can make within a time window to:
- Prevent abuse
- Protect backend services from overload
- Ensure fair usage
- Prevent DDoS attacks

### Types of Rate Limiting

#### 1. Fixed Window (Your Implementation)

Allows N requests per fixed time window.

```
Window: 1 minute
Limit: 120 requests

00:00:00 - 00:00:59 → 120 requests allowed
00:01:00 - 00:01:59 → 120 requests allowed (counter resets)
```

**Problem**: Burst at window boundaries
```
00:00:50 → 120 requests
00:01:01 → 120 requests
Total: 240 requests in 11 seconds!
```

#### 2. Sliding Window (Not Used)

Tracks requests in a rolling time window.

```
At 00:00:30 → Counts requests from 23:59:30 to 00:00:30
At 00:00:31 → Counts requests from 23:59:31 to 00:00:31
```

#### 3. Token Bucket (Not Used)

Tokens are added at a fixed rate; each request consumes a token.

### Your Implementation

#### Global Rate Limiter (ASP.NET Core)

**File**: `gateway/OcelotGateway/Program.cs`

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    
    options.OnRejected = async (context, cancellationToken) =>
    {
        // Custom error response when rate limit exceeded
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            code = "throttle.too-many-requests",
            message = "Too many requests. Please retry after a short delay.",
            retryable = true,
            correlationId
        }, cancellationToken);
    };

    // Partition by client ID or IP address
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(
        httpContext =>
    {
        // Extract client identifier
        var clientId = httpContext.Request.Headers["Oc-Client"].FirstOrDefault();
        var remoteIp = httpContext.Connection.RemoteIpAddress?.ToString();
        
        // Create partition key
        var partitionKey = !string.IsNullOrWhiteSpace(clientId)
            ? $"client:{clientId}"
            : $"ip:{remoteIp ?? "unknown"}";

        // Fixed window rate limiter
        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,           // 120 requests
                Window = TimeSpan.FromMinutes(1),  // per 1 minute
                QueueLimit = 0,              // No queuing
                AutoReplenishment = true     // Auto-reset counter
            });
    });
});
```

**How it works**:

```
┌─────────────────────────────────────────────────────────────┐
│ Rate Limiting Flow                                          │
└─────────────────────────────────────────────────────────────┘

Request arrives with header: Oc-Client: supply-chain-frontend
    ↓
Extract partition key: "client:supply-chain-frontend"
    ↓
Check counter for this partition:
  - Current: 45 requests in current window
  - Limit: 120 requests per minute
    ↓
45 < 120 → Allow request
    ↓
Increment counter: 46
    ↓
Forward request to backend

---

Request 121 arrives (same client, same window)
    ↓
Check counter: 120 requests in current window
    ↓
120 >= 120 → Reject request
    ↓
Return 429 Too Many Requests:
{
  "code": "throttle.too-many-requests",
  "message": "Too many requests. Please retry after a short delay.",
  "retryable": true,
  "correlationId": "abc-123"
}
```

#### Per-Route Rate Limiting (Ocelot)

**Configuration**: `gateway/OcelotGateway/ocelot.json`

```json
{
  "Key": "identity-route-get",
  "RateLimitOptions": {
    "EnableRateLimiting": true,
    "Period": "1m",              // Time window
    "PeriodTimespan": 60,        // 60 seconds
    "Limit": 500,                // 500 requests per window
    "QuotaExceededMessage": "Gateway rate limit exceeded."
  }
}
```

**Global Configuration**:

```json
{
  "GlobalConfiguration": {
    "RateLimitOptions": {
      "DisableRateLimitHeaders": false,
      "QuotaExceededMessage": "Gateway rate limit exceeded.",
      "HttpStatusCode": 429,
      "ClientIdHeader": "Oc-Client",  // Header to identify client
      "Period": "1m",
      "PeriodTimespan": 60,
      "Limit": 500
    }
  }
}
```

### Rate Limiting Hierarchy

```
1. ASP.NET Core Global Rate Limiter (120 req/min per client)
   ↓ (if passed)
2. Ocelot Per-Route Rate Limiter (500 req/min per route)
   ↓ (if passed)
3. Request forwarded to backend service
```

### Client Identification

**Oc-Client Header** (Your Implementation):

```typescript
// Frontend interceptor
const headers: Record<string, string> = { 
  'X-Correlation-Id': correlationId,
  'Oc-Client': 'supply-chain-frontend'  // Client identifier
};
```

**Why use Oc-Client?**
- IP-based limiting doesn't work well with proxies/NAT
- Multiple users behind same IP would share limit
- Client ID allows per-application rate limiting

**Partition Keys**:
```
Frontend: client:supply-chain-frontend → 120 req/min
Mobile App: client:supply-chain-mobile → 120 req/min
Admin Tool: client:supply-chain-admin → 120 req/min
Unknown: ip:192.168.1.100 → 120 req/min
```

---

## 🔌 4. Circuit Breaker (QoS)

### What is it?

**Circuit Breaker** prevents cascading failures by stopping requests to a failing service, giving it time to recover.

### States

```
┌──────────────┐
│    CLOSED    │  ← Normal operation
│ (Requests OK)│
└──────┬───────┘
       │ Failures exceed threshold
       ↓
┌──────────────┐
│     OPEN     │  ← Service is failing
│ (Block all)  │
└──────┬───────┘
       │ After timeout period
       ↓
┌──────────────┐
│  HALF-OPEN   │  ← Testing if service recovered
│ (Try 1 req)  │
└──────┬───────┘
       │
       ├→ Success → CLOSED
       └→ Failure → OPEN
```

### Your Implementation (Ocelot + Polly)

**Configuration**: `gateway/OcelotGateway/ocelot.json`

```json
{
  "QoSOptions": {
    "ExceptionsAllowedBeforeBreaking": 3,  // Open after 3 failures
    "DurationOfBreak": 10,                 // Stay open for 10 seconds
    "TimeoutValue": 5000                   // Request timeout: 5 seconds
  }
}
```

**How it works**:

```
┌─────────────────────────────────────────────────────────────┐
│ Circuit Breaker Flow                                        │
└─────────────────────────────────────────────────────────────┘

State: CLOSED (Normal)
    ↓
Request 1 → Order Service → Timeout (5 seconds) → Failure (1/3)
    ↓
Request 2 → Order Service → 500 Error → Failure (2/3)
    ↓
Request 3 → Order Service → Connection Refused → Failure (3/3)
    ↓
Circuit OPENS (Service is down)
    ↓
Request 4 → Circuit Breaker → Immediate 503 (no call to service)
Request 5 → Circuit Breaker → Immediate 503 (no call to service)
Request 6 → Circuit Breaker → Immediate 503 (no call to service)
    ↓
Wait 10 seconds (DurationOfBreak)
    ↓
Circuit moves to HALF-OPEN
    ↓
Request 7 → Order Service → Success → Circuit CLOSES
    ↓
State: CLOSED (Normal operation resumed)
```

**Benefits**:
- Prevents wasting resources on failing service
- Gives failing service time to recover
- Fails fast instead of waiting for timeouts
- Prevents cascading failures

**Example Scenario**:

```
Order Service database is down
    ↓
First 3 requests timeout after 5 seconds each (15 seconds wasted)
    ↓
Circuit opens
    ↓
Next 100 requests fail immediately (0.1 seconds each)
    ↓
After 10 seconds, circuit tries again
    ↓
Database is back up → Circuit closes
```

### Polly Integration

**File**: `gateway/OcelotGateway/Program.cs`

```csharp
builder.Services.AddOcelot(builder.Configuration).AddPolly();
```

Polly provides:
- Circuit Breaker pattern
- Retry policies
- Timeout policies
- Bulkhead isolation

---

## ⏱️ 5. Timeout

### What is it?

**Timeout** limits how long the gateway waits for a response from a backend service.

### Your Implementation

```json
{
  "QoSOptions": {
    "TimeoutValue": 5000  // 5 seconds
  }
}
```

**How it works**:

```
Request arrives at gateway
    ↓
Gateway forwards to Order Service
    ↓
Start timer: 5 seconds
    ↓
Wait for response...
    ↓
If response arrives within 5 seconds → Success
If no response after 5 seconds → Timeout Error (counts as circuit breaker failure)
```

**Why use timeouts?**
- Prevent requests from hanging indefinitely
- Free up resources quickly
- Provide better user experience (fail fast)

---

## 💾 6. Caching

### What is it?

**Caching** stores responses temporarily to avoid repeated calls to backend services.

### Your Implementation

**Configuration**: `gateway/OcelotGateway/ocelot.json`

```json
{
  "Key": "identity-route-get",
  "FileCacheOptions": {
    "TtlSeconds": 15,      // Cache for 15 seconds
    "Region": "identity"   // Cache region/namespace
  }
}
```

**How it works**:

```
┌─────────────────────────────────────────────────────────────┐
│ Caching Flow                                                │
└─────────────────────────────────────────────────────────────┘

Request 1: GET /identity/api/users/123
    ↓
Check cache: MISS (not in cache)
    ↓
Forward to Identity Service
    ↓
Response: { userId: 123, name: "John" }
    ↓
Store in cache (TTL: 15 seconds)
    ↓
Return to client

---

Request 2: GET /identity/api/users/123 (5 seconds later)
    ↓
Check cache: HIT (found in cache)
    ↓
Return cached response (no backend call)
    ↓
Return to client

---

Request 3: GET /identity/api/users/123 (20 seconds later)
    ↓
Check cache: MISS (TTL expired)
    ↓
Forward to Identity Service
    ↓
Response: { userId: 123, name: "John Doe" } (updated)
    ↓
Store in cache (TTL: 15 seconds)
    ↓
Return to client
```

**Cache Key**:
```
Region: identity
Path: /api/users/123
Method: GET
Query: (none)

Cache Key: identity:/api/users/123:GET
```

**Benefits**:
- Reduces backend load
- Improves response time
- Reduces database queries

**Limitations**:
- Only caches GET requests
- Stale data for TTL duration
- Memory usage

**When to use caching**:
- ✅ Read-heavy endpoints (product catalog, user profiles)
- ✅ Data that doesn't change frequently
- ❌ Write operations (POST, PUT, DELETE)
- ❌ Real-time data
- ❌ User-specific sensitive data

---

## 🔐 7. Authentication & Authorization

### What is it?

**Authentication**: Verifying who the user is (login)
**Authorization**: Verifying what the user can do (permissions)

### Your Implementation

**JWT Bearer Authentication**:

**File**: `gateway/OcelotGateway/Program.cs`

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "SupplyChainPlatform",
            ValidateAudience = true,
            ValidAudiences = ["SupplyChainPlatform.Client", "SupplyChainPlatform.Gateway"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
    });
```

**Route Configuration**:

```json
{
  "Key": "order-route-get",
  "AuthenticationOptions": {
    "AuthenticationProviderKey": "Bearer",
    "AllowedScopes": []
  }
}
```

**How it works**:

```
┌─────────────────────────────────────────────────────────────┐
│ Authentication Flow                                         │
└─────────────────────────────────────────────────────────────┘

Request: GET /orders/api/orders/123
Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    ↓
Gateway extracts JWT token
    ↓
Validates token:
  ✓ Signature is valid (using secret key)
  ✓ Issuer is "SupplyChainPlatform"
  ✓ Audience is "SupplyChainPlatform.Client"
  ✓ Token is not expired
  ✓ Token has JTI (unique identifier)
    ↓
Token is valid → Extract claims (userId, role, etc.)
    ↓
Forward request to Order Service (with token)
    ↓
Order Service validates token again (defense in depth)
    ↓
Process request
```

**Public Routes** (No Authentication):

```json
{
  "Key": "identity-auth-public",
  "UpstreamPathTemplate": "/identity/api/auth/{everything}",
  // No AuthenticationOptions → Public access
}
```

---

## 🔄 8. Request/Response Transformation

### What is it?

Modifying requests before forwarding or responses before returning.

### Your Implementation

**Path Transformation**:

```json
{
  "UpstreamPathTemplate": "/orders/{everything}",
  "DownstreamPathTemplate": "/{everything}"
}
```

**Example**:
```
Client Request: GET /orders/api/orders/123
                     ↓
Gateway transforms to: GET /api/orders/123
                     ↓
Forwards to Order Service
```

**Header Transformation**:

```csharp
// Correlation ID is preserved
"RequestIdKey": "X-Correlation-Id"

// Client ID is used for rate limiting
"ClientIdHeader": "Oc-Client"
```

---

## 🎯 9. Priority Routing

### What is it?

When multiple routes match a request, priority determines which route is used.

### Your Implementation

```json
{
  "Key": "identity-auth-public",
  "UpstreamPathTemplate": "/identity/api/auth/{everything}",
  "Priority": 10  // Higher priority
},
{
  "Key": "identity-route-get",
  "UpstreamPathTemplate": "/identity/{everything}",
  "Priority": 11  // Lower priority (evaluated second)
}
```

**How it works**:

```
Request: POST /identity/api/auth/login
    ↓
Check routes in priority order:
  1. Priority 10: /identity/api/auth/{everything} → MATCH ✓
  2. Priority 11: /identity/{everything} → (not checked)
    ↓
Use route with Priority 10
```

**Why use priority?**
- Specific routes before generic routes
- Public routes before authenticated routes
- Special handling for certain paths

---

## 📊 10. Service Discovery

### What is it?

Automatically finding the network location of service instances.

### Your Implementation (Static Configuration)

```json
{
  "DownstreamHostAndPorts": [
    { "Host": "localhost", "Port": 8001 }
  ]
}
```

**Current**: Static configuration (hardcoded)
**Production**: Would use Consul, Eureka, or Kubernetes service discovery

---

## 🔍 11. Correlation ID

### What is it?

Unique identifier that tracks a request across all services.

### Your Implementation

```json
{
  "RequestIdKey": "X-Correlation-Id"
}
```

**How it works**:

```
Frontend generates: X-Correlation-Id: abc-123
    ↓
Gateway preserves header
    ↓
Forwards to all backend services
    ↓
All services log with same correlation ID
    ↓
Easy to trace request across services
```

---

## 📈 12. Monitoring & Logging

### What is it?

Tracking requests, errors, and performance metrics.

### Your Implementation

**Serilog Request Logging**:

```csharp
app.UseSerilogRequestLogging();
```

**Logs**:
```
2026-04-15 12:34:56 [INF] HTTP POST /orders/api/orders responded 201 in 234ms
2026-04-15 12:34:57 [WRN] HTTP GET /catalog/api/products/999 responded 404 in 12ms
2026-04-15 12:34:58 [ERR] HTTP POST /payments/api/payment responded 500 in 1234ms
```

---

## 🏗️ Complete Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Complete Gateway Flow                                       │
└─────────────────────────────────────────────────────────────┘

1. Client Request
   POST /orders/api/orders
   Headers:
     - Authorization: Bearer <token>
     - X-Correlation-Id: abc-123
     - Oc-Client: supply-chain-frontend
    ↓
2. CORS Check
   Origin: http://localhost:4200 → Allowed ✓
    ↓
3. Global Rate Limiter
   Partition: client:supply-chain-frontend
   Count: 45/120 → Allowed ✓
    ↓
4. Route Matching
   Match: "order-route-post" (Priority 11)
    ↓
5. Authentication
   Validate JWT token → Valid ✓
    ↓
6. Per-Route Rate Limiter (Ocelot)
   Count: 234/500 → Allowed ✓
    ↓
7. Circuit Breaker Check
   State: CLOSED → Allowed ✓
    ↓
8. Forward Request
   POST http://localhost:8003/api/orders
   Timeout: 5 seconds
    ↓
9. Order Service Response
   201 Created (in 189ms)
    ↓
10. Cache Response (if GET)
    (Skipped for POST)
    ↓
11. Return to Client
    201 Created
```

---

## 📋 Summary Table

| Concept | Purpose | Your Config | Benefits |
|---------|---------|-------------|----------|
| **Load Balancing** | Distribute requests across instances | Round Robin, 2 instances per service | High availability, scalability |
| **Rate Limiting** | Prevent abuse | 120 req/min global, 500 req/min per route | Protection, fair usage |
| **Circuit Breaker** | Stop calling failing services | 3 failures, 10s break | Fail fast, prevent cascading failures |
| **Timeout** | Limit wait time | 5 seconds | Free resources quickly |
| **Caching** | Store responses | 15 seconds TTL | Reduce load, faster responses |
| **Authentication** | Verify identity | JWT Bearer | Security |
| **Correlation ID** | Track requests | X-Correlation-Id | Distributed tracing |
| **Priority Routing** | Route selection | 10-11 priority levels | Flexible routing |
| **QoS** | Quality of Service | Circuit breaker + timeout | Resilience |

---

**Document Version**: 1.0  
**Last Updated**: April 15, 2026  
**Based On**: Actual Ocelot configuration and ASP.NET Core implementation
