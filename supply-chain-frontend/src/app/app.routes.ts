import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { UserRole } from './core/models/enums';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },

  // Public routes
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'unauthorized',
    loadComponent: () => import('./features/auth/unauthorized/unauthorized.component').then(m => m.UnauthorizedComponent)
  },

  // Protected routes (shell layout)
  {
    path: '',
    loadComponent: () => import('./shared/components/app-shell/app-shell.component').then(m => m.AppShellComponent),
    canActivate: [authGuard],
    children: [
      // Dashboard (role-based redirect)
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },

      // Profile
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
      },

      // Products
      {
        path: 'products',
        loadComponent: () => import('./features/catalog/product-list/product-list.component').then(m => m.ProductListComponent)
      },
      {
        path: 'products/new',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin] },
        loadComponent: () => import('./features/catalog/product-form/product-form.component').then(m => m.ProductFormComponent)
      },
      {
        path: 'products/:id',
        loadComponent: () => import('./features/catalog/product-detail/product-detail.component').then(m => m.ProductDetailComponent)
      },
      {
        path: 'products/:id/edit',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin] },
        loadComponent: () => import('./features/catalog/product-form/product-form.component').then(m => m.ProductFormComponent)
      },

      // Cart & Checkout (Dealer only)
      {
        path: 'cart',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Dealer] },
        loadComponent: () => import('./features/cart/cart.component').then(m => m.CartComponent)
      },
      {
        path: 'checkout',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Dealer] },
        loadComponent: () => import('./features/cart/checkout/checkout.component').then(m => m.CheckoutComponent)
      },

      // Orders
      {
        path: 'orders',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin, UserRole.Dealer, UserRole.Warehouse, UserRole.Logistics] },
        loadComponent: () => import('./features/orders/order-list/order-list.component').then(m => m.OrderListComponent)
      },
      {
        path: 'orders/:id/tracking',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin, UserRole.Dealer, UserRole.Warehouse, UserRole.Logistics, UserRole.Agent] },
        loadComponent: () => import('./features/orders/order-tracking/order-tracking.component').then(m => m.OrderTrackingComponent)
      },
      {
        path: 'orders/:id',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin, UserRole.Dealer, UserRole.Warehouse, UserRole.Logistics] },
        loadComponent: () => import('./features/orders/order-detail/order-detail.component').then(m => m.OrderDetailComponent)
      },

      // Shipments
      {
        path: 'shipments',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin, UserRole.Warehouse, UserRole.Logistics, UserRole.Agent, UserRole.Dealer] },
        loadComponent: () => import('./features/logistics/shipment-list/shipment-list.component').then(m => m.ShipmentListComponent)
      },
      {
        path: 'shipments/:id',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin, UserRole.Warehouse, UserRole.Logistics, UserRole.Agent, UserRole.Dealer] },
        loadComponent: () => import('./features/logistics/shipment-detail/shipment-detail.component').then(m => m.ShipmentDetailComponent)
      },

      // Invoices
      {
        path: 'invoices',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin, UserRole.Dealer] },
        loadComponent: () => import('./features/payments/invoice-list/invoice-list.component').then(m => m.InvoiceListComponent)
      },
      {
        path: 'invoices/:id',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin, UserRole.Dealer] },
        loadComponent: () => import('./features/payments/invoice-detail/invoice-detail.component').then(m => m.InvoiceDetailComponent)
      },

      // Notifications
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notification-list/notification-list.component').then(m => m.NotificationListComponent)
      },

      // Admin routes
      {
        path: 'admin/dealers',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin] },
        loadComponent: () => import('./features/admin/dealer-list/dealer-list.component').then(m => m.DealerListComponent)
      },
      {
        path: 'admin/dealers/:id',
        canActivate: [roleGuard],
        data: { roles: [UserRole.Admin] },
        loadComponent: () => import('./features/admin/dealer-detail/dealer-detail.component').then(m => m.DealerDetailComponent)
      }
    ]
  },

  { path: '**', redirectTo: '/login' }
];
