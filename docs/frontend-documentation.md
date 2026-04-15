# Frontend Structure - Complete Documentation

## Overview

The Supply Chain Management System frontend is built with **Angular 21.2** using modern standalone components, signals for state management, and a feature-based architecture. The application follows clean architecture principles with clear separation between core, features, and shared modules.

---

## 📁 Project Structure

```
supply-chain-frontend/
├── src/
│   ├── app/
│   │   ├── core/                    # Core functionality (singleton services)
│   │   │   ├── api/                 # API service layer
│   │   │   ├── guards/              # Route guards
│   │   │   ├── interceptors/        # HTTP interceptors
│   │   │   ├── models/              # TypeScript interfaces & enums
│   │   │   ├── services/            # Business logic services
│   │   │   └── stores/              # State management (signals)
│   │   ├── features/                # Feature modules (lazy-loaded)
│   │   │   ├── admin/               # Admin management
│   │   │   ├── auth/                # Authentication
│   │   │   ├── cart/                # Shopping cart
│   │   │   ├── catalog/             # Product catalog
│   │   │   ├── dashboard/           # Dashboard
│   │   │   ├── logistics/           # Shipment management
│   │   │   ├── notifications/       # Notifications
│   │   │   ├── orders/              # Order management
│   │   │   ├── payments/            # Invoice management
│   │   │   └── profile/             # User profile
│   │   ├── shared/                  # Shared components
│   │   │   └── components/          # Reusable UI components
│   │   ├── app.config.ts            # Application configuration
│   │   ├── app.routes.ts            # Route definitions
│   │   ├── app.ts                   # Root component
│   │   └── app.html                 # Root template
│   ├── assets/                      # Static assets
│   ├── environments/                # Environment configs
│   ├── index.html                   # HTML entry point
│   ├── main.ts                      # Application bootstrap
│   ├── main.server.ts               # SSR bootstrap
│   ├── server.ts                    # Express SSR server
│   └── styles.scss                  # Global styles
├── public/                          # Public assets
│   └── assets/
│       ├── login/                   # Login page images
│       └── product-images/          # Product images
├── angular.json                     # Angular CLI config
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── proxy.conf.json                  # Dev proxy config
└── vitest.config.ts                 # Test config
```

---

## 🏗️ Architecture Layers

### 1. Core Layer (`src/app/core/`)

**Purpose**: Singleton services, global state, and cross-cutting concerns

#### API Services (`core/api/`)

HTTP communication layer for each backend service:

| Service | File | Purpose |
|---------|------|---------|
| **AuthApiService** | `auth-api.service.ts` | Login, register, refresh, logout |
| **UsersApiService** | `auth-api.service.ts` | User profile management |
| **AdminApiService** | `admin-api.service.ts` | Dealer approval, agent creation |
| **CatalogApiService** | `catalog-api.service.ts` | Products, categories, inventory |
| **OrderApiService** | `order-api.service.ts` | Order CRUD, status updates |
| **PaymentApiService** | `payment-api.service.ts` | Invoices, credit accounts |
| **LogisticsApiService** | `logistics-api.service.ts` | Shipments, tracking |
| **NotificationApiService** | `notification-api.service.ts` | Notifications |

**Example**:
```typescript
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/identity/api/auth';

  login(req: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/login`, req, 
      { withCredentials: true });
  }
}
```

#### Guards (`core/guards/`)

Route protection:

| Guard | File | Purpose |
|-------|------|---------|
| **authGuard** | `auth.guard.ts` | Checks if user is authenticated |
| **roleGuard** | `role.guard.ts` | Checks if user has required role |

**Usage**:
```typescript
{
  path: 'admin/dealers',
  canActivate: [roleGuard],
  data: { roles: [UserRole.Admin] },
  loadComponent: () => import('./features/admin/dealer-list/...')
}
```

#### Interceptors (`core/interceptors/`)

HTTP request/response pipeline:

| Interceptor | File | Purpose | Order |
|-------------|------|---------|-------|
| **correlationIdInterceptor** | `correlation-id.interceptor.ts` | Adds X-Correlation-Id header | 1st |
| **authInterceptor** | `auth.interceptor.ts` | Adds Authorization header | 2nd |
| **utcDateNormalizationInterceptor** | `utc-date-normalization.interceptor.ts` | Converts dates to UTC | 3rd |
| **loadingInterceptor** | `loading.interceptor.ts` | Shows/hides loading indicator | 4th |
| **errorInterceptor** | `error.interceptor.ts` | Handles errors, shows toasts | 5th |

**Correlation ID Flow**:
```typescript
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  const correlationId = crypto.randomUUID();
  
  const headers: Record<string, string> = { 
    'X-Correlation-Id': correlationId,
    'Oc-Client': 'supply-chain-frontend'
  };

  const cloned = req.clone({ setHeaders: headers });
  
  return next(cloned).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.error && typeof error.error === 'object') {
        error.error.correlationId = correlationId;
      }
      return throwError(() => error);
    })
  );
};
```

#### Models (`core/models/`)

TypeScript interfaces and enums:

| File | Purpose |
|------|---------|
| `auth.models.ts` | Login, register, user profile DTOs |
| `catalog.models.ts` | Product, category, inventory DTOs |
| `order.models.ts` | Order, order line DTOs |
| `payment.models.ts` | Invoice, credit account DTOs |
| `logistics.models.ts` | Shipment, tracking DTOs |
| `notification.models.ts` | Notification DTOs |
| `shared.models.ts` | Common DTOs (CartItem, ApiError) |
| `enums.ts` | All enumerations |

**Key Enums**:
```typescript
export enum UserRole {
  Admin = 'Admin',
  Dealer = 'Dealer',
  Warehouse = 'Warehouse',
  Logistics = 'Logistics',
  Agent = 'Agent'
}

export enum OrderStatus {
  Placed = 0,
  OnHold = 1,
  Processing = 2,
  ReadyForDispatch = 3,
  InTransit = 4,
  Exception = 5,
  Delivered = 6,
  ReturnRequested = 7,
  ReturnApproved = 8,
  ReturnRejected = 9,
  Closed = 10,
  Cancelled = 11
}
```

#### Stores (`core/stores/`)

Signal-based state management:

| Store | File | Purpose |
|-------|------|---------|
| **AuthStore** | `auth.store.ts` | User authentication state |
| **CartStore** | `cart.store.ts` | Shopping cart state |
| **LoadingStore** | `loading.store.ts` | Global loading indicator |

**AuthStore Example**:
```typescript
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _state = signal<AuthState>({
    user: null,
    accessToken: null,
    role: null,
    isAuthenticated: false
  });

  // Public readonly signals
  readonly user = computed(() => this._state().user);
  readonly accessToken = computed(() => this._state().accessToken);
  readonly role = computed(() => this._state().role);
  readonly isAuthenticated = computed(() => this._state().isAuthenticated);

  setAuth(user: UserProfileDto, token: string): void {
    // Updates state and persists to localStorage
  }

  hasRole(...roles: UserRole[]): boolean {
    const r = this._state().role;
    return r !== null && roles.includes(r);
  }
}
```

**CartStore Features**:
- Quantity normalization (respects minOrderQty)
- Automatic localStorage persistence
- Computed totals and item counts
- Stock availability validation

#### Services (`core/services/`)

Business logic services:

| Service | Purpose |
|---------|---------|
| `toast.service.ts` | Toast notifications |
| `product-image.service.ts` | Product image URL generation |
| `order-sla.service.ts` | Order SLA calculations |
| `invoice-workflow.service.ts` | Invoice workflow logic |
| `shipment-eta.service.ts` | Shipment ETA calculations |
| And more... | Various business logic |

---

### 2. Features Layer (`src/app/features/`)

**Purpose**: Feature modules with lazy-loaded components

#### Admin (`features/admin/`)

Admin-only features:

| Component | Route | Purpose |
|-----------|-------|---------|
| **DealerListComponent** | `/admin/dealers` | List all dealers, approve/reject |
| **DealerDetailComponent** | `/admin/dealers/:id` | View dealer details |
| **AgentCreateComponent** | `/admin/agents/create` | Create delivery agent |

**Key Features**:
- Dealer approval workflow
- Credit limit management
- Agent creation

#### Auth (`features/auth/`)

Authentication pages:

| Component | Route | Purpose |
|-----------|-------|---------|
| **LoginComponent** | `/login` | User login |
| **RegisterComponent** | `/register` | Dealer registration |
| **ForgotPasswordComponent** | `/forgot-password` | Password reset request |
| **UnauthorizedComponent** | `/unauthorized` | Access denied page |

**Login Flow**:
```
User enters credentials
    ↓
AuthApiService.login()
    ↓
Receives JWT token + user profile
    ↓
AuthStore.setAuth()
    ↓
Persists to localStorage
    ↓
Navigate to /dashboard
```

#### Cart (`features/cart/`)

Shopping cart and checkout:

| Component | Route | Purpose |
|-----------|-------|---------|
| **CartComponent** | `/cart` | View cart, update quantities |
| **CheckoutComponent** | `/checkout` | Place order |

**Cart Features**:
- Add/remove items
- Update quantities (respects minOrderQty)
- Add notes to line items
- Payment mode selection (Cash/Credit)
- Stock availability validation

#### Catalog (`features/catalog/`)

Product management:

| Component | Route | Purpose |
|-----------|-------|---------|
| **ProductListComponent** | `/products` | Browse products, search, filter |
| **ProductDetailComponent** | `/products/:id` | View product details |
| **ProductFormComponent** | `/products/new` | Create product (Admin) |
| **ProductFormComponent** | `/products/:id/edit` | Edit product (Admin) |

**Features**:
- Product search and filtering
- Category navigation
- Stock subscription (dealers)
- Add to cart
- Product CRUD (Admin only)

#### Dashboard (`features/dashboard/`)

Role-based dashboard:

| Component | Route | Purpose |
|-----------|-------|---------|
| **DashboardComponent** | `/dashboard` | Role-specific dashboard |

**Dashboard Views**:
- **Admin**: Pending dealers, system stats
- **Dealer**: Recent orders, invoices
- **Warehouse**: Orders ready for dispatch
- **Logistics**: Shipments to assign
- **Agent**: Assigned shipments

#### Logistics (`features/logistics/`)

Shipment management:

| Component | Route | Purpose |
|-----------|-------|---------|
| **ShipmentListComponent** | `/shipments` | List shipments |
| **ShipmentDetailComponent** | `/shipments/:id` | Shipment details, tracking |

**Features**:
- Shipment assignment (Logistics)
- Accept/reject assignment (Agent)
- Update shipment status
- Add tracking events
- Delivery agent rating

#### Notifications (`features/notifications/`)

Notification center:

| Component | Route | Purpose |
|-----------|-------|---------|
| **NotificationListComponent** | `/notifications` | View all notifications |

**Features**:
- InApp notifications
- Mark as read
- Filter by type
- Real-time updates (polling)

#### Orders (`features/orders/`)

Order management:

| Component | Route | Purpose |
|-----------|-------|---------|
| **OrderListComponent** | `/orders` | List orders |
| **OrderDetailComponent** | `/orders/:id` | Order details |
| **OrderTrackingComponent** | `/orders/:id/tracking` | Track order status |

**Features**:
- Order creation (from cart)
- Order status updates
- Return requests
- Order cancellation
- Status history
- Role-based actions

#### Payments (`features/payments/`)

Invoice management:

| Component | Route | Purpose |
|-----------|-------|---------|
| **InvoiceListComponent** | `/invoices` | List invoices |
| **InvoiceDetailComponent** | `/invoices/:id` | Invoice details, download PDF |

**Features**:
- View invoices
- Download PDF
- Payment recording (Admin)
- Invoice workflow (Admin)
- Credit account overview

#### Profile (`features/profile/`)

User profile:

| Component | Route | Purpose |
|-----------|-------|---------|
| **ProfileComponent** | `/profile` | View/edit profile |

**Features**:
- View user details
- Update profile information
- Change password

---

### 3. Shared Layer (`src/app/shared/`)

**Purpose**: Reusable components used across features

#### Components (`shared/components/`)

| Component | Purpose |
|-----------|---------|
| **AppShellComponent** | Main layout with header, sidebar, footer |
| **PageBannerComponent** | Page title banner |
| **PaginationComponent** | Pagination controls |
| **ToastContainerComponent** | Toast notification display |
| **ConfirmDialogComponent** | Confirmation dialog |

**AppShellComponent**:
- Navigation sidebar (role-based menu)
- Header with user menu
- Notification bell
- Cart icon (dealers only)
- Responsive layout

---

## 🔄 Data Flow

### Request Flow

```
Component
    ↓
API Service (e.g., OrderApiService)
    ↓
HTTP Interceptors (in order):
  1. correlationIdInterceptor → Adds X-Correlation-Id
  2. authInterceptor → Adds Authorization header
  3. utcDateNormalizationInterceptor → Converts dates
  4. loadingInterceptor → Shows loading indicator
  5. errorInterceptor → Handles errors
    ↓
Gateway (http://localhost:5000)
    ↓
Backend Service
    ↓
Response flows back through interceptors
    ↓
Component receives data
```

### State Management Flow

```
User Action (e.g., Login)
    ↓
Component calls AuthApiService.login()
    ↓
Receives AuthResponse
    ↓
Updates AuthStore.setAuth(user, token)
    ↓
AuthStore persists to localStorage
    ↓
AuthStore signals update
    ↓
Components using authStore.user() react automatically
```

---

## 🛣️ Routing

### Route Structure

```typescript
export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },

  // Public routes
  { path: 'login', loadComponent: () => import('./features/auth/login/...') },
  { path: 'register', loadComponent: () => import('./features/auth/register/...') },

  // Protected routes (with AppShell layout)
  {
    path: '',
    loadComponent: () => import('./shared/components/app-shell/...'),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/...') },
      { path: 'products', loadComponent: () => import('./features/catalog/product-list/...') },
      // ... more routes
    ]
  }
];
```

### Route Guards

**authGuard**:
```typescript
export const authGuard: CanActivateFn = (route, state) => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (!authStore.isAuthenticated()) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  return true;
};
```

**roleGuard**:
```typescript
export const roleGuard: CanActivateFn = (route) => {
  const authStore = inject(AuthStore);
  const router = inject(Router);
  const requiredRoles = route.data['roles'] as UserRole[] | undefined;

  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  if (authStore.hasRole(...requiredRoles)) {
    return true;
  }

  router.navigate(['/unauthorized']);
  return false;
};
```

---

## 🎨 Styling

### Global Styles

**File**: `src/styles.scss`

- Tailwind CSS utility classes
- Custom component styles
- Theme variables
- Responsive breakpoints

### Component Styles

Each component has its own scoped styles:
```typescript
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']  // Scoped styles
})
```

---

## 🔧 Configuration

### Environment Configuration

**Development** (`src/environments/environment.ts`):
```typescript
export const environment = {
  production: false,
  apiBaseUrl: ''  // Uses proxy.conf.json
};
```

**Production** (`src/environments/environment.prod.ts`):
```typescript
export const environment = {
  production: true,
  apiBaseUrl: 'http://localhost:5000'  // Direct gateway URL
};
```

### Proxy Configuration

**File**: `proxy.conf.json`

```json
{
  "/identity/**": {
    "target": "http://localhost:5000",
    "secure": false,
    "changeOrigin": true
  },
  "/catalog/**": {
    "target": "http://localhost:5000",
    "secure": false,
    "changeOrigin": true
  }
  // ... more routes
}
```

**Purpose**: Proxies API requests to gateway during development to avoid CORS issues.

---

## 📦 Dependencies

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@angular/core` | 21.2.0 | Angular framework |
| `@angular/common` | 21.2.0 | Common Angular modules |
| `@angular/router` | 21.2.0 | Routing |
| `@angular/forms` | 21.2.0 | Forms (Reactive & Template-driven) |
| `@angular/platform-browser` | 21.2.0 | Browser platform |
| `@angular/ssr` | 21.2.5 | Server-side rendering |
| `rxjs` | 7.8.0 | Reactive programming |
| `express` | 5.1.0 | SSR server |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@angular/cli` | 21.2.5 | Angular CLI |
| `typescript` | 5.9.2 | TypeScript compiler |
| `vitest` | 4.1.2 | Testing framework |
| `prettier` | 3.8.1 | Code formatting |

---

## 🧪 Testing

### Test Framework

**Vitest** - Fast unit testing framework

**Configuration**: `vitest.config.ts`

### Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Files

Tests are co-located with components:
```
product-list.component.ts
product-list.component.spec.ts  ← Test file
```

---

## 🚀 Build & Deployment

### Development Server

```bash
npm start
# Runs on http://localhost:4200
# Uses proxy.conf.json for API calls
```

### Production Build

```bash
npm run build
# Outputs to dist/supply-chain-frontend/browser/
```

### SSR Build

```bash
npm run build
npm run serve:ssr:supply-chain-frontend
# Runs SSR server on http://localhost:4000
```

---

## 📝 Key Features Implementation

### 1. Authentication

**Flow**:
1. User enters credentials on `/login`
2. `LoginComponent` calls `AuthApiService.login()`
3. Backend returns JWT token + user profile
4. `AuthStore.setAuth()` stores token and user
5. Token persisted to localStorage
6. Navigate to `/dashboard`

**Token Refresh**:
- Automatic refresh on 401 errors
- Uses refresh token cookie
- Transparent to user

### 2. Shopping Cart

**Features**:
- Add products to cart
- Update quantities (respects minOrderQty)
- Add notes to line items
- Automatic localStorage persistence
- Stock availability validation

**Quantity Normalization**:
```typescript
normalizeQuantity(quantity: number, minOrderQty: number, availableStock: number): number {
  // Ensures quantity is:
  // 1. Multiple of minOrderQty
  // 2. Within available stock
  // 3. At least minOrderQty
}
```

### 3. Order Management

**Order Creation**:
1. Dealer adds products to cart
2. Proceeds to checkout
3. Selects payment mode (Cash/Credit)
4. Submits order
5. Backend creates order + saga
6. Frontend shows order confirmation

**Order Tracking**:
- Real-time status updates
- Status history timeline
- Shipment tracking link
- Return request option

### 4. Role-Based Access

**Roles**:
- **Admin**: Full access, dealer approval, system management
- **Dealer**: Browse products, place orders, view invoices
- **Warehouse**: View orders, update status to ReadyForDispatch
- **Logistics**: Assign shipments, manage delivery
- **Agent**: Accept/reject assignments, update delivery status

**Implementation**:
```typescript
// Route protection
{
  path: 'admin/dealers',
  canActivate: [roleGuard],
  data: { roles: [UserRole.Admin] }
}

// Component logic
if (authStore.hasRole(UserRole.Admin)) {
  // Show admin actions
}
```

### 5. Notifications

**Types**:
- InApp notifications (shown in notification center)
- Email notifications (sent by backend)
- SMS notifications (sent by backend)

**Implementation**:
- Polling for new notifications
- Unread count badge
- Mark as read functionality

---

## 🔍 Code Examples

### Component Example

```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderApiService } from '../../core/api/order-api.service';
import { OrderDto } from '../../core/models/order.models';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-list.component.html'
})
export class OrderListComponent {
  private readonly orderApi = inject(OrderApiService);
  
  readonly orders = signal<OrderDto[]>([]);
  readonly loading = signal(false);

  ngOnInit() {
    this.loadOrders();
  }

  loadOrders() {
    this.loading.set(true);
    this.orderApi.getOrders().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}
```

### Service Example

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OrderDto, CreateOrderRequest } from '../models/order.models';

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/orders/api/orders';

  getOrders(): Observable<OrderDto[]> {
    return this.http.get<OrderDto[]>(this.base);
  }

  getOrder(id: string): Observable<OrderDto> {
    return this.http.get<OrderDto>(`${this.base}/${id}`);
  }

  createOrder(req: CreateOrderRequest): Observable<OrderDto> {
    return this.http.post<OrderDto>(this.base, req);
  }
}
```

---

## 📊 Summary

The frontend is a modern Angular 21 application with:

- ✅ **Standalone components** (no NgModules)
- ✅ **Signal-based state management** (reactive, performant)
- ✅ **Lazy-loaded routes** (fast initial load)
- ✅ **Role-based access control** (secure)
- ✅ **HTTP interceptors** (correlation ID, auth, error handling)
- ✅ **Server-side rendering** (SEO, performance)
- ✅ **Clean architecture** (core, features, shared)
- ✅ **TypeScript strict mode** (type safety)
- ✅ **Vitest testing** (fast, modern)

**Total Components**: 30+ components across 10 feature modules

**Total Services**: 15+ services (API + business logic)

**Total Routes**: 25+ routes with lazy loading

---

**Document Version**: 1.0  
**Last Updated**: April 15, 2026  
**Created By**: Kiro AI Assistant
