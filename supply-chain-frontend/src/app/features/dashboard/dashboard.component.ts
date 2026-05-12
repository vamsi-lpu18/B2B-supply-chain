import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthStore } from '../../core/stores/auth.store';
import { CartStore } from '../../core/stores/cart.store';
import { UserRole, OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_BADGE, ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_BADGE } from '../../core/models/enums';
import { AdminApiService } from '../../core/api/admin-api.service';
import { OrderApiService, AdminOrderApiService } from '../../core/api/order-api.service';
import { LogisticsApiService } from '../../core/api/logistics-api.service';
import { CatalogApiService } from '../../core/api/catalog-api.service';
import { NotificationApiService } from '../../core/api/notification-api.service';
import { PaymentApiService } from '../../core/api/payment-api.service';
import { OrderListItemDto, OrderAnalyticsDto, DealerPurchaseStatDto, ProductPurchaseStatDto } from '../../core/models/order.models';
import { LogisticsChatbotResponseDto, ShipmentDto } from '../../core/models/logistics.models';
import { ProductListItemDto } from '../../core/models/catalog.models';
import { buildProductPlaceholderDataUrl, enterpriseProductFallbackImageUrl, resolveEnterpriseProductImageUrl } from '../../core/services/product-image.service';
import { InventoryAlertRulesService } from '../../core/services/inventory-alert-rules.service';
import { catchError, forkJoin, map, of } from 'rxjs';

interface PieSlice { label: string; value: number; color: string; pct: number; dashArray: string; dashOffset: number; }
interface StatCard  { label: string; value: string; sub: string; icon: SafeHtml; color: string; bg: string; trend?: string; trendDir?: 'up'|'down'|'neutral'; }
interface DealerInsight extends DealerPurchaseStatDto { displayName: string; }
interface DashboardChatMessage { sender: 'user' | 'bot'; text: string; intent?: string; createdAtUtc: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  readonly authStore = inject(AuthStore);
  readonly cartStore = inject(CartStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly adminApi      = inject(AdminApiService);
  private readonly orderApi      = inject(OrderApiService);
  private readonly adminOrderApi = inject(AdminOrderApiService);
  private readonly logisticsApi  = inject(LogisticsApiService);
  private readonly catalogApi    = inject(CatalogApiService);
  private readonly notifApi      = inject(NotificationApiService);
  private readonly paymentApi    = inject(PaymentApiService);
  private readonly inventoryAlertRules = inject(InventoryAlertRulesService);

  readonly UserRole = UserRole;

  // Loading states
  readonly ordersLoading    = signal(true);
  readonly productsLoading  = signal(true);
  readonly shipmentsLoading = signal(true);
  readonly analyticsLoading = signal(false);

  // Data
  readonly recentOrders    = signal<OrderListItemDto[]>([]);
  readonly recentProducts  = signal<ProductListItemDto[]>([]);
  readonly inventoryProducts = signal<ProductListItemDto[]>([]);
  readonly recentShipments = signal<ShipmentDto[]>([]);
  readonly dashboardChatOpen = signal(false);
  readonly dashboardChatLoading = signal(false);
  readonly dashboardChatMessages = signal<DashboardChatMessage[]>([
    {
      sender: 'bot',
      text: 'Hi, I can help with shipment status, delays, retries, and assignment gaps.',
      createdAtUtc: new Date().toISOString()
    }
  ]);
  readonly dashboardChatSuggestedPrompts = signal<string[]>([
    'Give me a shipment status summary.',
    'Show assignment gaps (missing agent/vehicle).',
    'How many active deliveries are in transit right now?',
    'Which shipments need retry handling?'
  ]);
  dashboardChatPrompt = '';
  readonly totalOrders     = signal(0);
  readonly creditAvail     = signal(0);
  readonly creditLimit     = signal(0);
  readonly lowStockThreshold = signal(10);
  readonly includeOutOfStock = signal(true);
  readonly thresholdDraft = signal('10');
  readonly orderAnalytics = signal<OrderAnalyticsDto | null>(null);
  readonly dealerNameMap = signal<Record<string, string>>({});
  readonly dashboardProductFallbackImageUrl = enterpriseProductFallbackImageUrl;

  private readonly pieRadius = 86;
  private readonly pieCircumference = 2 * Math.PI * this.pieRadius;

  // Pie chart data
  readonly orderCounts = signal<Record<number, number>>({});

  readonly pieSlices = computed<PieSlice[]>(() => {
    const counts = this.orderCounts();
    const data = [
      { label: 'Placed',     value: counts[0] ?? 0, color: '#3b82f6' },
      { label: 'Processing', value: counts[2] ?? 0, color: '#f59e0b' },
      { label: 'In Transit', value: counts[4] ?? 0, color: '#8b5cf6' },
      { label: 'Delivered',  value: counts[6] ?? 0, color: '#10b981' },
      { label: 'Cancelled',  value: counts[11] ?? 0, color: '#ef4444' },
    ].filter(d => d.value > 0);

    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let cumulativePercent = 0;

    return data.map(d => {
      const pct = (d.value / total) * 100;
      const dashLength = (pct / 100) * this.pieCircumference;
      const dashOffset = -(cumulativePercent / 100) * this.pieCircumference;
      cumulativePercent += pct;

      return {
        ...d,
        pct,
        dashArray: `${dashLength} ${this.pieCircumference}`,
        dashOffset
      };
    });
  });

  readonly lowStockItems = computed(() => {
    const threshold = this.lowStockThreshold();
    return this.inventoryProducts()
      .filter(product => product.isActive && product.availableStock > 0 && product.availableStock <= threshold)
      .sort((left, right) => left.availableStock - right.availableStock);
  });

  readonly outOfStockItems = computed(() =>
    this.inventoryProducts()
      .filter(product => product.isActive && product.availableStock === 0)
      .sort((left, right) => left.name.localeCompare(right.name))
  );

  readonly criticalLowStockCount = computed(() => {
    const criticalThreshold = Math.max(1, Math.floor(this.lowStockThreshold() / 2));
    return this.lowStockItems().filter(product => product.availableStock <= criticalThreshold).length;
  });

  readonly activeAlerts = computed(() => {
    const low = this.lowStockItems();
    if (!this.includeOutOfStock()) {
      return low.slice(0, 6);
    }

    return [...this.outOfStockItems(), ...low].slice(0, 6);
  });

  readonly topDealers = computed<DealerInsight[]>(() => {
    const analytics = this.orderAnalytics();
    if (!analytics) {
      return [];
    }

    const dealerNames = this.dealerNameMap();
    return analytics.topDealers.map(item => ({
      ...item,
      displayName: dealerNames[item.dealerId.toLowerCase()] ?? this._fallbackDealerName(item.dealerId)
    }));
  });

  readonly topProducts = computed<ProductPurchaseStatDto[]>(() => this.orderAnalytics()?.topProducts ?? []);

  readonly stats = computed<StatCard[]>(() => {
    const role = this.authStore.role();
    if (role === UserRole.Dealer) return [
      { label: 'Available Credit', value: '₹' + this.creditAvail().toLocaleString('en-IN'), sub: 'of ₹' + this.creditLimit().toLocaleString('en-IN'), icon: this._icon('credit'), color: '#3f6182', bg: '#093466' },
      { label: 'My Orders',        value: String(this.totalOrders()), sub: 'All time', icon: this._icon('orders'), color: '#4c6e8f', bg: '#e9f2fa' },
      { label: 'Cart Items',       value: String(this.cartStore.itemCount()), sub: '₹' + this.cartStore.total().toFixed(2) + ' total', icon: this._icon('cart'), color: '#597b9a', bg: '#ebf3fb' },
      { label: 'Shipments',        value: String(this.recentShipments().length), sub: 'Active', icon: this._icon('ship'), color: '#6486a5', bg: '#edf4fb' },
    ];
    if (role === UserRole.Admin) return [
      { label: 'Total Orders',    value: String(this.totalOrders()), sub: 'All time', icon: this._icon('orders'), color: '#3f6182', bg: '#e7f0fa', trend: '12.5%', trendDir: 'up' as const },
      { label: 'Active Shipments',value: String(this.recentShipments().filter(s => s.status < 5).length), sub: 'In transit', icon: this._icon('ship'), color: '#4f7294', bg: '#e9f2fa', trend: '3 new', trendDir: 'up' as const },
      { label: 'Products',        value: String(this.inventoryProducts().length), sub: 'In catalog', icon: this._icon('box'), color: '#5f819f', bg: '#ecf3fb', trend: 'Stable', trendDir: 'neutral' as const },
      { label: 'Active Dealers',  value: String(this.orderAnalytics()?.uniqueDealers ?? 0), sub: 'Buying in last 90 days', icon: this._icon('users'), color: '#6d8dad', bg: '#eef4fb', trend: '8.2%', trendDir: 'up' as const },
    ];

    if (role === UserRole.Warehouse) return [
      { label: 'Orders', value: String(this.totalOrders()), sub: 'Fulfillment queue', icon: this._icon('orders'), color: '#3f6182', bg: '#e7f0fa' },
      { label: 'Low Stock Alerts', value: String(this.lowStockItems().length), sub: `Threshold <= ${this.lowStockThreshold()}`, icon: this._icon('box'), color: '#4f7294', bg: '#e9f2fa' },
    ];

    return [
      { label: 'Orders',    value: String(this.totalOrders()), sub: 'Total', icon: this._icon('orders'), color: '#3f6182', bg: '#e7f0fa' },
      { label: 'Shipments', value: String(this.recentShipments().length), sub: 'Active', icon: this._icon('ship'), color: '#4f7294', bg: '#e9f2fa' },
    ];
  });

  readonly isAdmin     = () => this.authStore.hasRole(UserRole.Admin);
  readonly isDealer    = () => this.authStore.hasRole(UserRole.Dealer);
  readonly isWarehouse = () => this.authStore.hasRole(UserRole.Warehouse);
  readonly isLogistics = () => this.authStore.hasRole(UserRole.Logistics);
  readonly isAgent     = () => this.authStore.hasRole(UserRole.Agent);
  readonly canUseDashboardChatbot = () => false;
  readonly showInventoryAlerts = () => this.isAdmin() || this.isWarehouse();
  readonly showCommercialInsights = () => this.isAdmin() || this.isWarehouse() || this.isLogistics();

  greeting(): string { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
  firstName(): string { const n = this.authStore.user()?.fullName ?? ''; return n.split(' ')[0] ?? n; }
  today(): string { return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

  orderLabel(s: OrderStatus): string { return ORDER_STATUS_LABELS[s] ?? String(s); }
  orderBadge(s: OrderStatus): string { return 'chip ' + (ORDER_STATUS_BADGE[s] ?? 'badge-neutral'); }
  shipLabel(s: ShipmentStatus): string { return SHIPMENT_STATUS_LABELS[s] ?? String(s); }
  shipBadge(s: ShipmentStatus): string { return 'chip ' + (SHIPMENT_STATUS_BADGE[s] ?? 'badge-neutral'); }

  stockLabel(p: ProductListItemDto): string {
    if (!p.isActive) return 'Inactive';
    if (p.availableStock === 0) return 'Out of stock';
    if (p.availableStock < 10) return 'Low: ' + p.availableStock;
    return 'In stock';
  }
  stockChip(p: ProductListItemDto): string {
    if (!p.isActive) return 'chip badge-neutral';
    if (p.availableStock === 0) return 'chip badge-error';
    if (p.availableStock < 10) return 'chip badge-warning';
    return 'chip badge-success';
  }

  getDashboardProductImageUrl(product: ProductListItemDto): string {
    return product.imageUrl || resolveEnterpriseProductImageUrl(product.name, product.sku, 220, 220);
  }

  onDashboardProductImageError(event: Event): void {
    const imageElement = event.target as HTMLImageElement | null;
    if (!imageElement) {
      return;
    }

    if (imageElement.dataset['fallbackApplied'] === '1') {
      return;
    }

    imageElement.dataset['fallbackApplied'] = '1';
    const productName = imageElement.alt || 'Product';
    const sku = imageElement.dataset['sku'];
    imageElement.src = buildProductPlaceholderDataUrl(productName, sku, 220, 220);
  }

  onThresholdDraftInput(value: string): void {
    this.thresholdDraft.set(value);
  }

  saveLowStockThreshold(): void {
    const parsed = Number(this.thresholdDraft());
    const safeValue = Number.isFinite(parsed) ? Math.max(1, Math.min(999, Math.trunc(parsed))) : this.lowStockThreshold();
    this.lowStockThreshold.set(safeValue);
    this.thresholdDraft.set(String(safeValue));
    this.inventoryAlertRules.updateLowStockThreshold(safeValue);
  }

  toggleIncludeOutOfStock(include: boolean): void {
    this.includeOutOfStock.set(include);
    this.inventoryAlertRules.updateIncludeOutOfStock(include);
  }

  toggleDashboardChatbot(): void {
    this.dashboardChatOpen.update(open => !open);
  }

  sendDashboardChatbotQuestion(): void {
    if (!this.canUseDashboardChatbot()) {
      return;
    }

    const message = this.dashboardChatPrompt.trim();
    if (!message || this.dashboardChatLoading()) {
      return;
    }

    this.dashboardChatMessages.update(messages => [
      ...messages,
      {
        sender: 'user',
        text: message,
        createdAtUtc: new Date().toISOString()
      }
    ]);

    this.dashboardChatPrompt = '';
    this.dashboardChatLoading.set(true);

    this.logisticsApi.askChatbot({ message }).subscribe({
      next: (response: LogisticsChatbotResponseDto) => {
        this.dashboardChatMessages.update(messages => [
          ...messages,
          {
            sender: 'bot',
            text: response.reply,
            intent: response.intent,
            createdAtUtc: response.createdAtUtc
          }
        ]);

        if (response.suggestedPrompts.length > 0) {
          this.dashboardChatSuggestedPrompts.set(response.suggestedPrompts.slice(0, 5));
        }

        this.dashboardChatLoading.set(false);
      },
      error: () => {
        this.dashboardChatMessages.update(messages => [
          ...messages,
          {
            sender: 'bot',
            text: 'Unable to fetch chatbot response right now. Please try again in a moment.',
            createdAtUtc: new Date().toISOString()
          }
        ]);
        this.dashboardChatLoading.set(false);
      }
    });
  }

  useDashboardSuggestedPrompt(prompt: string): void {
    this.dashboardChatPrompt = prompt;
    this.sendDashboardChatbotQuestion();
  }

  formatDashboardChatTime(value: string): string {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      return '';
    }

    return parsed.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  ngOnInit(): void {
    const role = this.authStore.role();
    const rules = this.inventoryAlertRules.rules();

    this.lowStockThreshold.set(rules.lowStockThreshold);
    this.thresholdDraft.set(String(rules.lowStockThreshold));
    this.includeOutOfStock.set(rules.includeOutOfStock);
    this.loadOrderAnalytics(role);

    // Orders
    if (role === UserRole.Dealer) {
      this.orderApi.getMyOrders(1, 8).subscribe({
        next: r => { this.recentOrders.set(r.items); this.totalOrders.set(r.totalCount); this.ordersLoading.set(false); this._buildPie(r.items); },
        error: () => this.ordersLoading.set(false)
      });
      const uid = this.authStore.user()?.userId;
      if (uid) this.paymentApi.checkCredit(uid, 0).subscribe(r => { this.creditAvail.set(r.availableCredit); this.creditLimit.set(r.creditLimit); });
    } else if (role === UserRole.Admin || role === UserRole.Warehouse || role === UserRole.Logistics) {
      this.adminOrderApi.getAllOrders(1, 8).subscribe({
        next: r => { this.recentOrders.set(r.items); this.totalOrders.set(r.totalCount); this.ordersLoading.set(false); this._buildPie(r.items); },
        error: () => this.ordersLoading.set(false)
      });
    } else {
      // Agent role has no orders-list permission; keep order widgets empty.
      this.recentOrders.set([]);
      this.totalOrders.set(0);
      this.orderCounts.set({});
      this.ordersLoading.set(false);
    }

    // Products
    this.catalogApi.getProducts(1, 100).subscribe({
      next: r => {
        this.inventoryProducts.set(r.items);
        this.recentProducts.set(r.items.slice(0, 8));
        this.productsLoading.set(false);
      },
      error: () => this.productsLoading.set(false)
    });

    // Shipments
    if (role === UserRole.Warehouse) {
      this.recentShipments.set([]);
      this.shipmentsLoading.set(false);
    } else {
      const shipObs = role === UserRole.Dealer
        ? this.logisticsApi.getMyShipments()
        : role === UserRole.Agent
          ? this.logisticsApi.getAssignedShipments()
          : (role === UserRole.Admin || role === UserRole.Logistics)
            ? this.logisticsApi.getAllShipments()
            : null;

      if (!shipObs) {
        this.recentShipments.set([]);
        this.shipmentsLoading.set(false);
      } else {
        shipObs.subscribe({
          next: r => { this.recentShipments.set(r.slice(0, 8)); this.shipmentsLoading.set(false); },
          error: () => this.shipmentsLoading.set(false)
        });
      }
    }
  }

  private loadOrderAnalytics(role: UserRole | null): void {
    if (!(role === UserRole.Admin || role === UserRole.Warehouse || role === UserRole.Logistics)) {
      this.orderAnalytics.set(null);
      this.dealerNameMap.set({});
      this.analyticsLoading.set(false);
      return;
    }

    this.analyticsLoading.set(true);
    this.adminOrderApi.getOrderAnalytics(90, 5).subscribe({
      next: analytics => {
        this.orderAnalytics.set(analytics);

        if (role !== UserRole.Admin || analytics.topDealers.length === 0) {
          this.dealerNameMap.set({});
          this.analyticsLoading.set(false);
          return;
        }

        const dealerRequests = analytics.topDealers.map(item =>
          this.adminApi.getDealerById(item.dealerId).pipe(
            map(dealer => ({
              dealerId: item.dealerId,
              displayName: dealer.businessName?.trim() || dealer.fullName?.trim() || this._fallbackDealerName(item.dealerId)
            })),
            catchError(() => of({
              dealerId: item.dealerId,
              displayName: this._fallbackDealerName(item.dealerId)
            }))
          )
        );

        forkJoin(dealerRequests).subscribe({
          next: dealers => {
            const mapped: Record<string, string> = {};
            dealers.forEach(dealer => {
              mapped[dealer.dealerId.toLowerCase()] = dealer.displayName;
            });
            this.dealerNameMap.set(mapped);
            this.analyticsLoading.set(false);
          },
          error: () => {
            this.dealerNameMap.set({});
            this.analyticsLoading.set(false);
          }
        });
      },
      error: () => {
        this.orderAnalytics.set(null);
        this.dealerNameMap.set({});
        this.analyticsLoading.set(false);
      }
    });
  }

  private _fallbackDealerName(dealerId: string): string {
    const compact = dealerId.replace(/-/g, '').slice(0, 8).toUpperCase();
    return `Dealer ${compact}`;
  }

  private _buildPie(orders: OrderListItemDto[]): void {
    const counts: Record<number, number> = {};
    orders.forEach(o => { counts[o.status] = (counts[o.status] ?? 0) + 1; });
    this.orderCounts.set(counts);
  }

  private _icon(name: string): SafeHtml {
    const icons: Record<string, string> = {
      credit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
      orders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
      cart:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
      ship:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      box:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
      users:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    };
    return this.sanitizer.bypassSecurityTrustHtml(icons[name] ?? '');
  }
}
