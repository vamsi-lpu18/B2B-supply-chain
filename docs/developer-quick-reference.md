# Developer Quick Reference Guide

## 🚀 Quick Start

### Start Development Environment

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Apply migrations
cd scripts
./apply-migrations.ps1

# 3. Start Gateway
cd gateway/OcelotGateway
dotnet run

# 4. Start Services (in separate terminals)
cd services/IdentityAuth/IdentityAuth.API && dotnet run
cd services/CatalogInventory/CatalogInventory.API && dotnet run
cd services/Order/Order.API && dotnet run
cd services/PaymentInvoice/PaymentInvoice.API && dotnet run
cd services/LogisticsTracking/LogisticsTracking.API && dotnet run
cd services/Notification/Notification.API && dotnet run

# 5. Start Frontend
cd supply-chain-frontend
npm install
npm start
```

---

## 📍 Service Endpoints

| Service | Port(s) | Swagger | Hangfire |
|---------|---------|---------|----------|
| **Gateway** | 5000 | - | - |
| **IdentityAuth** | 8001, 8101 | http://localhost:8001/swagger | http://localhost:8001/hangfire |
| **CatalogInventory** | 8002, 8102 | http://localhost:8002/swagger | http://localhost:8002/hangfire |
| **Order** | 8003, 8103 | http://localhost:8003/swagger | http://localhost:8003/hangfire |
| **LogisticsTracking** | 8004, 8104 | http://localhost:8004/swagger | http://localhost:8004/hangfire |
| **PaymentInvoice** | 8005, 8105 | http://localhost:8005/swagger | http://localhost:8005/hangfire |
| **Notification** | 8006, 8106 | http://localhost:8006/swagger | http://localhost:8006/hangfire |
| **Frontend** | 4200 | - | - |

### Infrastructure

| Service | Port | URL |
|---------|------|-----|
| **RabbitMQ Management** | 15672 | http://localhost:15672 (guest/guest) |
| **Mailpit** | 8025 | http://localhost:8025 |
| **Redis** | 6379 | localhost:6379 |

---

## 🗂️ Project Structure

### Backend Service Structure

```
services/[ServiceName]/
├── [ServiceName].API/          # Controllers, Program.cs
├── [ServiceName].Application/  # Commands, Queries, Services
├── [ServiceName].Domain/       # Entities, ValueObjects, Events
└── [ServiceName].Infrastructure/ # DbContext, Repositories, Integrations
```

### Frontend Structure

```
supply-chain-frontend/src/app/
├── core/                       # Singleton services, state
│   ├── api/                   # HTTP services
│   ├── guards/                # Route guards
│   ├── interceptors/          # HTTP interceptors
│   ├── models/                # TypeScript interfaces
│   ├── services/              # Business logic
│   └── stores/                # State management
├── features/                   # Feature modules
│   ├── admin/
│   ├── auth/
│   ├── cart/
│   ├── catalog/
│   ├── dashboard/
│   ├── logistics/
│   ├── notifications/
│   ├── orders/
│   ├── payments/
│   └── profile/
└── shared/                     # Reusable components
```

---

## 🔑 Common Commands

### Backend

```bash
# Build solution
dotnet build

# Run tests
dotnet test

# Create migration
cd services/[Service]/[Service].Infrastructure
dotnet ef migrations add MigrationName --startup-project ../[Service].API

# Update database
dotnet ef database update --startup-project ../[Service].API

# Clean and rebuild
dotnet clean
dotnet build

# Run specific service
cd services/[Service]/[Service].API
dotnet run
```

### Frontend

```bash
# Install dependencies
npm install

# Start dev server
npm start

# Build for production
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate component
ng generate component features/[feature]/[component-name]

# Generate service
ng generate service core/services/[service-name]
```

### Database

```bash
# Apply all migrations
cd scripts
./apply-migrations.ps1

# Generate migration SQL
./generate-migration-sql.ps1

# Check specific service
./check-core-notification-email.ps1
```

---

## 🎯 User Roles & Access

| Role | Access |
|------|--------|
| **Admin** | Full system access, dealer approval, agent creation |
| **Dealer** | Browse products, place orders, view invoices |
| **Warehouse** | View orders, update to ReadyForDispatch |
| **Logistics** | Assign shipments, manage delivery |
| **Agent** | Accept/reject assignments, update delivery status |

### Default Test Users

```
Admin:
  Email: admin@supplychain.com
  Password: Admin@123

Dealer:
  Email: dealer@example.com
  Password: Dealer@123
```

---

## 📊 Database Quick Reference

### Connection Strings

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=[ServiceName]DB;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true"
  }
}
```

### Key Tables by Service

**IdentityAuth**: Users, DealerProfiles, RefreshTokens  
**CatalogInventory**: Products, Categories, StockTransactions  
**Order**: Orders, OrderLines, OrderSagaStates  
**PaymentInvoice**: Invoices, InvoiceLines, DealerCreditAccounts  
**LogisticsTracking**: Shipments, ShipmentEvents  
**Notification**: Notifications  

---

## 🔄 Common Workflows

### 1. Add New API Endpoint

**Backend**:
```csharp
// 1. Create DTO in Application/Abstractions
public sealed record GetProductRequest(string ProductId);
public sealed record ProductDto(string ProductId, string Name, decimal Price);

// 2. Create Query/Command
public sealed record GetProductQuery(string ProductId) : IRequest<ProductDto>;

// 3. Create Handler
public sealed class GetProductQueryHandler : IRequestHandler<GetProductQuery, ProductDto>
{
    public async Task<ProductDto> Handle(GetProductQuery request, CancellationToken ct)
    {
        // Implementation
    }
}

// 4. Add Controller endpoint
[HttpGet("{id}")]
public async Task<ActionResult<ProductDto>> GetProduct(string id)
{
    var query = new GetProductQuery(id);
    var result = await _sender.Send(query);
    return Ok(result);
}
```

**Frontend**:
```typescript
// 1. Add method to API service
getProduct(id: string): Observable<ProductDto> {
  return this.http.get<ProductDto>(`${this.base}/${id}`);
}

// 2. Use in component
this.catalogApi.getProduct(id).subscribe({
  next: (product) => this.product.set(product),
  error: (err) => console.error(err)
});
```

### 2. Add New Feature Module

**Frontend**:
```bash
# 1. Generate feature folder
mkdir -p src/app/features/new-feature

# 2. Generate component
ng generate component features/new-feature/new-feature-list --standalone

# 3. Add route
{
  path: 'new-feature',
  loadComponent: () => import('./features/new-feature/new-feature-list/...')
}
```

### 3. Add New Database Table

```bash
# 1. Add entity to Domain layer
public sealed class NewEntity : Entity
{
    public string Name { get; set; }
}

# 2. Add DbSet to DbContext
public DbSet<NewEntity> NewEntities => Set<NewEntity>();

# 3. Configure in OnModelCreating
builder.Entity<NewEntity>(entity =>
{
    entity.HasKey(e => e.Id);
    entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
});

# 4. Create migration
dotnet ef migrations add AddNewEntity --startup-project ../[Service].API

# 5. Apply migration
dotnet ef database update --startup-project ../[Service].API
```

---

## 🐛 Debugging Tips

### Backend

**Check logs**:
```bash
# Service logs
tail -f services/[Service]/[Service].API/logs/log-*.txt

# Gateway logs
tail -f gateway/OcelotGateway/logs/log-*.txt
```

**Common issues**:
- **Port already in use**: Change port in launchSettings.json
- **Database connection failed**: Check SQL Server is running
- **Migration error**: Delete migration and recreate
- **Hangfire error**: Check database connection

### Frontend

**Check console**: Open browser DevTools (F12)

**Common issues**:
- **CORS error**: Check proxy.conf.json
- **401 Unauthorized**: Token expired, login again
- **404 Not Found**: Check route configuration
- **API error**: Check backend service is running

### Infrastructure

**Redis**:
```bash
# Connect to Redis CLI
docker exec -it supplychain-redis redis-cli

# Check keys
KEYS *

# Get value
GET key_name
```

**RabbitMQ**:
- Check queues: http://localhost:15672
- Look for messages in queues
- Check bindings

**Mailpit**:
- View emails: http://localhost:8025
- Check SMTP logs

---

## 📝 Code Conventions

### Backend (C#)

```csharp
// Naming
public sealed class ProductService { }      // PascalCase for classes
private readonly ILogger _logger;           // _camelCase for private fields
public string ProductName { get; set; }     // PascalCase for properties
public void GetProduct() { }                // PascalCase for methods

// Records for DTOs
public sealed record ProductDto(string Id, string Name);

// Async methods
public async Task<ProductDto> GetProductAsync(string id, CancellationToken ct)
{
    // Always accept CancellationToken
}

// Dependency Injection
public ProductService(ILogger<ProductService> logger, IProductRepository repo)
{
    _logger = logger;
    _repo = repo;
}
```

### Frontend (TypeScript)

```typescript
// Naming
export class ProductService { }             // PascalCase for classes
private readonly http = inject(HttpClient); // camelCase for properties
public getProduct() { }                     // camelCase for methods

// Interfaces
export interface ProductDto {
  productId: string;
  name: string;
}

// Signals
readonly products = signal<ProductDto[]>([]);
readonly loading = signal(false);

// Observables
getProducts(): Observable<ProductDto[]> {
  return this.http.get<ProductDto[]>(this.base);
}
```

---

## 🔍 Useful Queries

### Check Order Status

```sql
SELECT o.OrderNumber, o.Status, o.PlacedAtUtc, u.Email
FROM Orders o
JOIN Users u ON o.DealerId = u.UserId
ORDER BY o.PlacedAtUtc DESC;
```

### Check Inventory

```sql
SELECT p.Name, p.TotalStock, p.ReservedStock, 
       (p.TotalStock - p.ReservedStock) AS AvailableStock
FROM Products p
WHERE p.IsActive = 1
ORDER BY p.Name;
```

### Check Pending Invoices

```sql
SELECT i.InvoiceNumber, i.GrandTotal, w.Status, w.DueAtUtc
FROM Invoices i
JOIN InvoiceWorkflowStates w ON i.InvoiceId = w.InvoiceId
WHERE w.Status IN ('Pending', 'FollowUp', 'Overdue')
ORDER BY w.DueAtUtc;
```

### Check Shipment Status

```sql
SELECT s.ShipmentNumber, s.Status, s.AssignedAgentId, s.CreatedAtUtc
FROM Shipments s
WHERE s.Status NOT IN ('Delivered', 'Returned')
ORDER BY s.CreatedAtUtc DESC;
```

---

## 🎨 UI Components

### Common Patterns

**Loading State**:
```typescript
readonly loading = signal(false);

loadData() {
  this.loading.set(true);
  this.api.getData().subscribe({
    next: (data) => {
      this.data.set(data);
      this.loading.set(false);
    },
    error: () => this.loading.set(false)
  });
}
```

**Error Handling**:
```typescript
this.api.getData().subscribe({
  error: (err: HttpErrorResponse) => {
    const message = err.error?.message || 'An error occurred';
    this.toast.error(message);
  }
});
```

**Form Validation**:
```typescript
this.form = new FormGroup({
  name: new FormControl('', [Validators.required, Validators.maxLength(200)]),
  email: new FormControl('', [Validators.required, Validators.email])
});
```

---

## 📚 Documentation Links

| Document | Description |
|----------|-------------|
| [Complete System Overview](./complete-system-overview.md) | High-level system architecture |
| [Frontend Documentation](./frontend-documentation.md) | Angular app structure |
| [Database Context](./database-complete-context.md) | Database schema and relationships |
| [Tech Stack](./tech-stack-complete.md) | All technologies used |
| [Gateway Concepts](./gateway-concepts-explained.md) | API Gateway features |
| [Correlation ID Flow](./correlation-id-exact-flow.md) | Request tracking |

---

## 🆘 Getting Help

### Common Resources

- **Swagger UI**: API documentation and testing
- **Hangfire Dashboard**: Background job monitoring
- **RabbitMQ Management**: Message queue monitoring
- **Mailpit**: Email testing
- **Logs**: Check service logs for errors

### Troubleshooting Checklist

- [ ] All infrastructure services running (Docker)
- [ ] Database migrations applied
- [ ] All backend services running
- [ ] Frontend dev server running
- [ ] Check browser console for errors
- [ ] Check service logs for errors
- [ ] Verify API endpoints in Swagger
- [ ] Check RabbitMQ for message processing
- [ ] Verify Redis connection
- [ ] Check Hangfire for background jobs

---

**Last Updated**: April 15, 2026  
**Version**: 1.0  
**Maintained By**: Development Team
