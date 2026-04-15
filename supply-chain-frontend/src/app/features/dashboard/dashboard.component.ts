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
  template: `
<div class="dash page-content">

  <!-- ── Header ── -->
  <div class="dash-header page-header">
    <div>
      <div class="dash-kicker">Supply Chain Control Tower</div>
      <h1 class="dash-title">Welcome back, {{ firstName() }}.</h1>
      <p class="dash-sub">{{ today() }} · {{ authStore.role() }} workspace · Live operations overview</p>
    </div>
    <div class="dash-actions">
      @if (isDealer()) { <a routerLink="/products" class="btn btn-primary btn-sm">Browse Products</a> }
      @if (isAdmin())  { <a routerLink="/admin/dealers" class="btn btn-primary btn-sm">Manage Dealers</a> }
    </div>
  </div>

  <!-- ── Stat Cards ── -->
  <div class="stat-row">
    @for (s of stats(); track s.label) {
      <div class="sc">
        <div class="sc-icon" [style.background]="s.bg" [style.color]="s.color">
          <span [innerHTML]="s.icon"></span>
        </div>
        <div class="sc-body">
          <div class="sc-val-row">
            <span class="sc-val">{{ s.value }}</span>
            @if (s.trend) {
              <span class="trend" [class.trend-up]="s.trendDir==='up'" [class.trend-down]="s.trendDir==='down'" [class.trend-neutral]="s.trendDir==='neutral'">
                {{ s.trendDir === 'up' ? '▲' : s.trendDir === 'down' ? '▼' : '—' }} {{ s.trend }}
              </span>
            }
          </div>
          <div class="sc-lbl">{{ s.label }}</div>
          <div class="sc-sub">{{ s.sub }}</div>
        </div>
      </div>
    }
  </div>

  <!-- ── Main grid ── -->
  <div class="dash-grid">

    <!-- Left column: tables -->
    <div class="dash-left">

      <!-- Orders table -->
      @if (isDealer() || isAdmin() || isWarehouse() || isLogistics()) {
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">
              <span class="panel-icon">📋</span>
              {{ isDealer() ? 'My Recent Orders' : 'Recent Orders' }}
            </div>
            <a [routerLink]="'/orders'" class="view-all">View all →</a>
          </div>
          @if (ordersLoading()) {
            <div class="table-skeleton">
              @for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:44px;margin-bottom:4px"></div> }
            </div>
          } @else if (recentOrders().length === 0) {
            <div class="panel-empty">No orders yet</div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl">
                <thead><tr>
                  <th>Order #</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  @for (o of recentOrders(); track o.orderId) {
                    <tr>
                      <td class="mono fw">{{ o.orderNumber }}</td>
                      <td><span class="chip" [class]="orderBadge(o.status)">{{ orderLabel(o.status) }}</span></td>
                      <td class="fw">{{ o.totalAmount | currency:'INR':'₹':'1.2-2' }}</td>
                      <td class="muted">{{ o.placedAtUtc | date:'dd MMM yy' }}</td>
                      <td><a [routerLink]="['/orders', o.orderId]" class="row-link">View</a></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- Products table (Dealer / Admin / Warehouse) -->
      @if (isDealer() || isAdmin() || isWarehouse()) {
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title"><span class="panel-icon">📦</span>Products</div>
            <a routerLink="/products" class="view-all">Browse all →</a>
          </div>
          @if (productsLoading()) {
            <div class="table-skeleton">
              @for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:44px;margin-bottom:4px"></div> }
            </div>
          } @else if (recentProducts().length === 0) {
            <div class="panel-empty">No products found</div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl">
                <thead><tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  @for (p of recentProducts(); track p.productId) {
                    <tr>
                      <td>
                        <div class="product-cell">
                          <img class="product-thumb"
                               [src]="getDashboardProductImageUrl(p)"
                               [alt]="p.name"
                               [attr.data-sku]="p.sku"
                               (error)="onDashboardProductImageError($event)">
                          <span class="fw">{{ p.name }}</span>
                        </div>
                      </td>
                      <td class="mono muted">{{ p.sku }}</td>
                      <td class="fw brand">{{ p.unitPrice | currency:'INR':'₹':'1.2-2' }}</td>
                      <td>
                        <span class="chip" [class]="stockChip(p)">{{ stockLabel(p) }}</span>
                      </td>
                      <td>
                        <a [routerLink]="['/products', p.productId]" class="row-link">View</a>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- Shipments table (Logistics / Agent / Dealer) -->
      @if (isLogistics() || isAgent() || isDealer()) {
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title"><span class="panel-icon">🚚</span>Shipments</div>
            <a routerLink="/shipments" class="view-all">Track all →</a>
          </div>
          @if (shipmentsLoading()) {
            <div class="table-skeleton">
              @for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:44px;margin-bottom:4px"></div> }
            </div>
          } @else if (recentShipments().length === 0) {
            <div class="panel-empty">No shipments yet</div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl">
                <thead><tr>
                  <th>Shipment #</th>
                  <th>Status</th>
                  <th>City</th>
                  <th>Created</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  @for (s of recentShipments(); track s.shipmentId) {
                    <tr>
                      <td class="mono fw">{{ s.shipmentNumber }}</td>
                      <td><span class="chip" [class]="shipBadge(s.status)">{{ shipLabel(s.status) }}</span></td>
                      <td class="muted">{{ s.city }}</td>
                      <td class="muted">{{ s.createdAtUtc | date:'dd MMM yy' }}</td>
                      <td><a [routerLink]="['/shipments', s.shipmentId]" class="row-link">Track</a></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

    </div>

    <!-- Right column: pie chart + quick actions -->
    <div class="dash-right">

      <!-- Pie chart -->
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="panel-icon">📊</span>Order Status</div>
        </div>
        <div class="pie-wrap">
          <div class="pie-shell">
            <svg class="pie-svg" viewBox="0 0 240 240" aria-label="Order status distribution chart">
              <defs>
                <filter id="centerShadow" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#1f3550" flood-opacity="0.18"/>
                </filter>
              </defs>

              <circle cx="120" cy="120" r="86" fill="none" stroke="#e2e8f0" stroke-width="28"/>

              @for (sl of pieSlices(); track sl.label) {
                <circle cx="120" cy="120" r="86"
                        fill="none"
                        [attr.stroke]="sl.color"
                        stroke-width="28"
                        [attr.stroke-dasharray]="sl.dashArray"
                        [attr.stroke-dashoffset]="sl.dashOffset"
                        stroke-linecap="round"
                        transform="rotate(-90 120 120)"/>
              }

              <circle cx="120" cy="120" r="58" fill="white" filter="url(#centerShadow)"/>
              <text x="120" y="114" text-anchor="middle" class="pie-center-val">{{ totalOrders() }}</text>
              <text x="120" y="134" text-anchor="middle" class="pie-center-lbl">Total Orders</text>
            </svg>
          </div>

          <div class="pie-legend">
            @for (sl of pieSlices(); track sl.label) {
              <div class="legend-card">
                <div class="legend-top">
                  <span class="legend-dot" [style.background]="sl.color"></span>
                  <span class="legend-label">{{ sl.label }}</span>
                  <span class="legend-val">{{ sl.value }}</span>
                </div>
                <div class="legend-bar">
                  <span [style.width.%]="sl.pct" [style.background]="sl.color"></span>
                </div>
              </div>
            }
            @if (pieSlices().length === 0) {
              <div class="legend-empty">No order activity yet.</div>
            }
          </div>
        </div>
      </div>

      @if (showCommercialInsights()) {
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title"><span class="panel-icon">📈</span>Purchase Insights</div>
            <div class="muted" style="font-size:.72rem">Last 90 days</div>
          </div>

          @if (analyticsLoading()) {
            <div class="table-skeleton">
              @for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:38px;margin-bottom:6px"></div> }
            </div>
          } @else if (!orderAnalytics() || (orderAnalytics()?.totalOrders ?? 0) === 0) {
            <div class="panel-empty">No purchase activity in this period.</div>
          } @else {
            <div class="insights-wrap">
              <div class="insight-summary-grid">
                <div class="insight-summary-card">
                  <div class="insight-summary-label">Revenue</div>
                  <div class="insight-summary-value">{{ orderAnalytics()!.totalRevenue | currency:'INR':'₹':'1.0-0' }}</div>
                </div>
                <div class="insight-summary-card">
                  <div class="insight-summary-label">Avg Order</div>
                  <div class="insight-summary-value">{{ orderAnalytics()!.averageOrderValue | currency:'INR':'₹':'1.0-0' }}</div>
                </div>
                <div class="insight-summary-card">
                  <div class="insight-summary-label">Active Dealers</div>
                  <div class="insight-summary-value">{{ orderAnalytics()!.uniqueDealers }}</div>
                </div>
                <div class="insight-summary-card">
                  <div class="insight-summary-label">Units Sold</div>
                  <div class="insight-summary-value">{{ orderAnalytics()!.unitsSold }}</div>
                </div>
              </div>

              <div class="insight-list-grid">
                <div class="insight-list-card">
                  <div class="insight-list-title">Top Dealers</div>
                  @if (topDealers().length === 0) {
                    <div class="legend-empty" style="padding: 10px 0">No dealer data.</div>
                  } @else {
                    @for (dealer of topDealers(); track dealer.dealerId) {
                      <div class="insight-row">
                        <div class="insight-main">
                          <div class="insight-name">{{ dealer.displayName }}</div>
                          <div class="insight-meta">{{ dealer.orderCount }} orders</div>
                        </div>
                        <div class="insight-value">{{ dealer.totalAmount | currency:'INR':'₹':'1.0-0' }}</div>
                      </div>
                    }
                  }
                </div>

                <div class="insight-list-card">
                  <div class="insight-list-title">Top Products</div>
                  @if (topProducts().length === 0) {
                    <div class="legend-empty" style="padding: 10px 0">No product data.</div>
                  } @else {
                    @for (product of topProducts(); track product.productId) {
                      <div class="insight-row">
                        <div class="insight-main">
                          <div class="insight-name">{{ product.productName }}</div>
                          <div class="insight-meta">{{ product.unitsSold }} units · {{ product.sku }}</div>
                        </div>
                        <div class="insight-value">{{ product.revenue | currency:'INR':'₹':'1.0-0' }}</div>
                      </div>
                    }
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }

      @if (showInventoryAlerts()) {
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title"><span class="panel-icon">📦</span>Inventory Alerts</div>
            <a routerLink="/products" class="view-all">Manage →</a>
          </div>

          <div class="inventory-alerts">
            <div class="inventory-rule-row">
              <label class="inventory-rule-label" for="low-stock-threshold">Low stock threshold</label>
              <div class="inventory-rule-controls">
                <input id="low-stock-threshold"
                       type="number"
                       min="1"
                       max="999"
                       class="form-control inventory-threshold-input"
                       [value]="thresholdDraft()"
                       (input)="onThresholdDraftInput($any($event.target).value)"
                       (blur)="saveLowStockThreshold()">
                <button class="btn btn-secondary btn-sm" (click)="saveLowStockThreshold()">Save</button>
              </div>
              <label class="inventory-toggle">
                <input type="checkbox" [checked]="includeOutOfStock()" (change)="toggleIncludeOutOfStock($any($event.target).checked)">
                Include out-of-stock products
              </label>
            </div>

            <div class="inventory-summary-grid">
              <div class="inventory-summary-card">
                <div class="inventory-summary-label">Low Stock</div>
                <div class="inventory-summary-value">{{ lowStockItems().length }}</div>
              </div>
              <div class="inventory-summary-card">
                <div class="inventory-summary-label">Out of Stock</div>
                <div class="inventory-summary-value">{{ outOfStockItems().length }}</div>
              </div>
              <div class="inventory-summary-card">
                <div class="inventory-summary-label">Critical</div>
                <div class="inventory-summary-value">{{ criticalLowStockCount() }}</div>
              </div>
            </div>

            @if (activeAlerts().length === 0) {
              <div class="legend-empty">No inventory alerts for current rules.</div>
            } @else {
              <div class="inventory-alert-list">
                @for (item of activeAlerts(); track item.productId) {
                  <a [routerLink]="['/products', item.productId]" class="inventory-alert-row">
                    <div class="inventory-alert-name">{{ item.name }}</div>
                    <div class="inventory-alert-meta">
                      <span class="chip" [class]="stockChip(item)">{{ stockLabel(item) }}</span>
                    </div>
                  </a>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Quick actions -->
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><span class="panel-icon">⚡</span>Quick Actions</div>
        </div>
        <div class="qa-list">
          @if (isDealer()) {
            <a routerLink="/products" class="qa-row">
              <div class="qa-icon" style="background:#eff6ff;color:#2563eb">📦</div>
              <div class="qa-text"><div class="qa-name">Browse Products</div><div class="qa-desc">Explore catalog</div></div>
              <span class="qa-arrow">→</span>
            </a>
            <a routerLink="/cart" class="qa-row">
              <div class="qa-icon" style="background:#ecfdf5;color:#059669">🛒</div>
              <div class="qa-text"><div class="qa-name">View Cart</div><div class="qa-desc">{{ cartStore.itemCount() }} items</div></div>
              <span class="qa-arrow">→</span>
            </a>
            <a routerLink="/orders" class="qa-row">
              <div class="qa-icon" style="background:#fffbeb;color:#d97706">📋</div>
              <div class="qa-text"><div class="qa-name">My Orders</div><div class="qa-desc">Track purchases</div></div>
              <span class="qa-arrow">→</span>
            </a>
            <a routerLink="/shipments" class="qa-row">
              <div class="qa-icon" style="background:#f0f9ff;color:#0284c7">🚚</div>
              <div class="qa-text"><div class="qa-name">Track Shipments</div><div class="qa-desc">Live tracking</div></div>
              <span class="qa-arrow">→</span>
            </a>
            <a routerLink="/invoices" class="qa-row">
              <div class="qa-icon" style="background:#f5f3ff;color:#7c3aed">🧾</div>
              <div class="qa-text"><div class="qa-name">Invoices</div><div class="qa-desc">Download PDFs</div></div>
              <span class="qa-arrow">→</span>
            </a>
          }
          @if (isAdmin()) {
            <a routerLink="/admin/dealers" class="qa-row">
              <div class="qa-icon" style="background:#eff6ff;color:#2563eb">👥</div>
              <div class="qa-text"><div class="qa-name">Manage Dealers</div><div class="qa-desc">Approve / reject</div></div>
              <span class="qa-arrow">→</span>
            </a>
            <a routerLink="/products/new" class="qa-row">
              <div class="qa-icon" style="background:#ecfdf5;color:#059669">📦</div>
              <div class="qa-text"><div class="qa-name">Add Product</div><div class="qa-desc">Create listing</div></div>
              <span class="qa-arrow">→</span>
            </a>
            <a routerLink="/orders" class="qa-row">
              <div class="qa-icon" style="background:#fffbeb;color:#d97706">📋</div>
              <div class="qa-text"><div class="qa-name">All Orders</div><div class="qa-desc">Process queue</div></div>
              <span class="qa-arrow">→</span>
            </a>
            <a routerLink="/notifications" class="qa-row">
              <div class="qa-icon" style="background:#f0f9ff;color:#0284c7">🔔</div>
              <div class="qa-text"><div class="qa-name">Notifications</div><div class="qa-desc">Send alerts</div></div>
              <span class="qa-arrow">→</span>
            </a>
          }
          @if (isWarehouse()) {
            <a routerLink="/orders" class="qa-row">
              <div class="qa-icon" style="background:#eff6ff;color:#2563eb">📋</div>
              <div class="qa-text"><div class="qa-name">Process Orders</div><div class="qa-desc">Fulfillment queue</div></div>
              <span class="qa-arrow">→</span>
            </a>
            <a routerLink="/products" class="qa-row">
              <div class="qa-icon" style="background:#ecfdf5;color:#059669">📦</div>
              <div class="qa-text"><div class="qa-name">Inventory</div><div class="qa-desc">Restock products</div></div>
              <span class="qa-arrow">→</span>
            </a>
          }
          @if (isLogistics() || isAgent()) {
            <a routerLink="/shipments" class="qa-row">
              <div class="qa-icon" style="background:#eff6ff;color:#2563eb">🚚</div>
              <div class="qa-text"><div class="qa-name">My Deliveries</div><div class="qa-desc">Active shipments</div></div>
              <span class="qa-arrow">→</span>
            </a>
          }
          @if (isLogistics()) {
            <a routerLink="/orders" class="qa-row">
              <div class="qa-icon" style="background:#ecfdf5;color:#059669">📋</div>
              <div class="qa-text"><div class="qa-name">Orders</div><div class="qa-desc">View all orders</div></div>
              <span class="qa-arrow">→</span>
            </a>
          }
        </div>
      </div>

    </div>
  </div>

  @if (canUseDashboardChatbot()) {
    <button
      type="button"
      class="dash-chat-fab"
      (click)="toggleDashboardChatbot()"
      [attr.aria-expanded]="dashboardChatOpen()"
      [attr.aria-label]="dashboardChatOpen() ? 'Close chatbot' : 'Open chatbot'">
      {{ dashboardChatOpen() ? '×' : '💬' }}
    </button>

    @if (dashboardChatOpen()) {
      <section class="dash-chat-panel" role="dialog" aria-label="Dashboard chatbot">
        <div class="dash-chat-head">
          <div>
            <div class="dash-chat-title">Ops Chatbot</div>
            <div class="dash-chat-sub">Ask about shipment status, delays, retries, and assignment gaps.</div>
          </div>
        </div>

        <div class="dash-chat-body">
          @for (msg of dashboardChatMessages(); track $index) {
            <div class="dash-chat-msg" [class.dash-chat-msg-user]="msg.sender === 'user'" [class.dash-chat-msg-bot]="msg.sender === 'bot'">
              @if (msg.intent && msg.sender === 'bot') {
                <div class="dash-chat-intent">{{ msg.intent }}</div>
              }
              <div class="dash-chat-text">{{ msg.text }}</div>
              <div class="dash-chat-time">{{ formatDashboardChatTime(msg.createdAtUtc) }}</div>
            </div>
          }

          @if (dashboardChatLoading()) {
            <div class="dash-chat-msg dash-chat-msg-bot">
              <div class="dash-chat-text">Thinking...</div>
            </div>
          }
        </div>

        @if (dashboardChatSuggestedPrompts().length > 0) {
          <div class="dash-chat-suggest">
            @for (prompt of dashboardChatSuggestedPrompts(); track $index) {
              <button type="button" class="btn btn-ghost btn-sm" (click)="useDashboardSuggestedPrompt(prompt)">{{ prompt }}</button>
            }
          </div>
        }

        <div class="dash-chat-input">
          <input
            class="form-control"
            type="text"
            maxlength="500"
            [(ngModel)]="dashboardChatPrompt"
            placeholder="Ask a logistics question"
            (keyup.enter)="sendDashboardChatbotQuestion()">
          <button type="button" class="btn btn-primary btn-sm" (click)="sendDashboardChatbotQuestion()" [disabled]="dashboardChatLoading() || !dashboardChatPrompt.trim()">Ask</button>
        </div>
      </section>
    }
  }
</div>
  `,
  styles: [`
    .dash { padding: 0; max-width: 1460px; margin: 0 auto; width: 100%; background: transparent; }
    .dash > * { position: relative; z-index: 1; }

    .dash-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      flex-wrap: wrap; gap: 16px; margin-bottom: 24px;
      padding: 20px 24px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-xl); box-shadow: var(--shadow-sm);
    }
    .dash-kicker {
      display: inline-flex; margin-bottom: 8px; padding: 4px 12px;
      border-radius: 9999px; border: 1px solid var(--brand-200);
      background: var(--brand-50); color: var(--brand-700);
      font-size: .65rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
    }
    .dash-title {
      font-size: clamp(1.6rem, 2vw, 2rem); font-weight: 700;
      background: linear-gradient(120deg, #1b2d44, #4178ad 44%, #1b2d44);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      letter-spacing: -.025em; line-height: 1.15; font-family: var(--font-display); text-wrap: balance;
    }
    .dash-sub { font-size: .85rem; color: var(--text-secondary); margin-top: 4px; font-weight: 500; }
    .dash-actions { display: flex; gap: 8px; }

    .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    @media (max-width: 1200px) { .stat-row { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px)  { .stat-row { grid-template-columns: 1fr; } }

    .sc {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl);
      padding: 20px 22px; display: flex; align-items: center; gap: 0;
      transition: all 200ms cubic-bezier(.22,1,.36,1); box-shadow: var(--shadow-sm);
      position: relative; overflow: hidden;
    }
    .sc::before { content: none; }
    .sc:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); border-color: var(--border-2); }
    .sc-icon { display: none; }
    .sc-icon svg { width: 22px; height: 22px; }
    .sc-body { flex: 1; min-width: 0; }
    .sc-val-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
    .sc-val { font-size: 1.55rem; font-weight: 800; letter-spacing: -.03em; line-height: 1; color: var(--text-primary); font-variant-numeric: tabular-nums; }
    .sc-lbl { font-size: .78rem; color: var(--text-secondary); font-weight: 600; }
    .sc-sub { font-size: .7rem; color: var(--text-tertiary); margin-top: 3px; font-weight: 500; }

    .dash-grid { display: grid; grid-template-columns: 1.4fr .6fr; gap: 16px; align-items: start; }
    @media (max-width: 1060px) { .dash-grid { grid-template-columns: 1fr; } }
    .dash-left, .dash-right { display: flex; flex-direction: column; gap: 16px; }

    .panel {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl);
      box-shadow: var(--shadow-sm); overflow: hidden;
      transition: all 200ms cubic-bezier(.22,1,.36,1); animation: panelReveal .4s cubic-bezier(.22,1,.36,1) both;
    }
    .panel:hover { border-color: var(--border-2); box-shadow: var(--shadow-md); }
    .panel-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
    .panel-title { display: flex; align-items: center; gap: 8px; font-size: .9rem; font-weight: 700; color: var(--text-primary); }
    .panel-icon { width: 28px; height: 28px; background: var(--brand-50); border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; font-size: 14px; }
    .view-all { font-size: .8rem; font-weight: 600; color: var(--brand-600); text-decoration: none; transition: color 150ms; }
    .view-all:hover { color: var(--brand-700); }
    .panel-empty { padding: 40px 20px; text-align: center; font-size: .875rem; color: var(--text-tertiary); font-weight: 500; }
    .table-skeleton { padding: 16px; }

    .tbl-wrap { overflow-x: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: .85rem; }
    .tbl thead tr { background: var(--surface-2); border-bottom: 1px solid var(--border); }
    .tbl thead th { padding: 10px 16px; text-align: left; font-weight: 700; font-size: .65rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
    .tbl tbody tr { border-bottom: 1px solid var(--border); transition: all 150ms; }
    .tbl tbody tr:last-child { border-bottom: none; }
    .tbl tbody tr:hover { background: var(--brand-50); }
    .tbl tbody tr:hover td:first-child { box-shadow: inset 3px 0 0 var(--brand-400); }
    .tbl tbody td { padding: 10px 16px; color: var(--text-primary); vertical-align: middle; }
    .mono { font-family: var(--font-mono); font-size: .78rem; font-weight: 600; }
    .fw { font-weight: 700; }
    .muted { color: var(--text-secondary); }
    .brand { color: var(--brand-700); }

    .product-cell { display: flex; align-items: center; gap: 10px; }
    .product-thumb { width: 34px; height: 34px; border-radius: var(--r-md); object-fit: cover; border: 1px solid var(--border); background: var(--surface-2); }
    .chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 9999px; font-size: .68rem; font-weight: 700; letter-spacing: .02em; white-space: nowrap; border: 1px solid transparent; }
    .chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

    .pie-wrap { padding: 20px; }
    .pie-shell { display: flex; justify-content: center; margin-bottom: 16px; }
    .pie-svg { width: 180px; height: 180px; }
    .pie-center-val { font-size: 22px; font-weight: 800; fill: var(--text-primary); font-family: var(--font-sans); }
    .pie-center-lbl { font-size: 10px; fill: var(--text-tertiary); font-family: var(--font-sans); font-weight: 600; }
    .pie-legend { display: flex; flex-direction: column; gap: 8px; }
    .legend-card { padding: 8px 12px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2); }
    .legend-top { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .legend-label { flex: 1; font-size: .78rem; color: var(--text-secondary); font-weight: 600; }
    .legend-val { font-weight: 800; font-size: .8rem; color: var(--text-primary); }
    .legend-bar { height: 4px; border-radius: 9999px; background: var(--gray-200); overflow: hidden; }
    .legend-bar span { display: block; height: 100%; border-radius: 9999px; transition: width .6s; }
    .legend-empty { padding: 16px; text-align: center; font-size: .82rem; color: var(--text-tertiary); }

    .insights-wrap { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
    .insight-summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .insight-summary-card { padding: 10px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2); }
    .insight-summary-label { font-size: .68rem; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .04em; }
    .insight-summary-value { margin-top: 4px; font-size: 1.05rem; font-weight: 800; color: var(--text-primary); }
    .insight-list-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .insight-list-card { border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; background: var(--surface-2); }
    .insight-list-title { padding: 8px 10px; font-size: .72rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
    .insight-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
    .insight-row:last-child { border-bottom: none; }
    .insight-main { min-width: 0; }
    .insight-name { font-size: .8rem; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .insight-meta { font-size: .7rem; color: var(--text-tertiary); margin-top: 2px; }
    .insight-value { font-size: .78rem; font-weight: 800; color: var(--brand-700); white-space: nowrap; }

    .inventory-alerts { padding: 16px 20px; }
    .inventory-rule-row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
    .inventory-rule-label { font-size: .78rem; font-weight: 600; color: var(--text-secondary); }
    .inventory-rule-controls { display: flex; gap: 8px; align-items: center; }
    .inventory-threshold-input { width: 80px; min-height: 34px; padding: 4px 10px; text-align: center; font-weight: 700; }
    .inventory-toggle { font-size: .78rem; color: var(--text-secondary); font-weight: 500; display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .inventory-toggle input { cursor: pointer; accent-color: var(--brand-600); }
    .inventory-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .inventory-summary-card { padding: 10px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2); text-align: center; }
    .inventory-summary-label { font-size: .68rem; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .04em; }
    .inventory-summary-value { font-size: 1.2rem; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
    .inventory-alert-list { display: flex; flex-direction: column; gap: 4px; }
    .inventory-alert-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: var(--r-md); text-decoration: none; color: inherit; transition: all 150ms; }
    .inventory-alert-row:hover { background: var(--brand-50); }
    .inventory-alert-name { font-size: .8rem; font-weight: 600; color: var(--text-primary); }
    .inventory-alert-meta { display: flex; align-items: center; }

    .qa-list { display: flex; flex-direction: column; padding: 8px; }
    .qa-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--r-lg); text-decoration: none; color: inherit; font-weight: 600; transition: all 150ms; border: 1px solid transparent; }
    .qa-row:hover { background: var(--gray-50); border-color: var(--border); }
    .qa-row:hover .qa-icon { transform: scale(1.1); }
    .qa-row:hover .qa-arrow { transform: translateX(3px); }
    .qa-icon { width: 38px; height: 38px; border-radius: var(--r-lg); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; transition: transform 200ms cubic-bezier(.34,1.56,.64,1); box-shadow: var(--shadow-sm); }
    .qa-text { flex: 1; min-width: 0; }
    .qa-name { font-size: .85rem; font-weight: 700; color: var(--text-primary); }
    .qa-desc { font-size: .72rem; color: var(--text-secondary); margin-top: 1px; }
    .qa-arrow { color: var(--text-tertiary); font-size: 14px; font-weight: 700; transition: transform 150ms; }

    .row-link { font-size: .8rem; font-weight: 600; color: var(--brand-600); text-decoration: none; white-space: nowrap; transition: color 150ms; }
    .row-link:hover { color: var(--brand-700); }

    .dash-chat-fab {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 58px;
      height: 58px;
      border-radius: 9999px;
      border: 1px solid var(--brand-400);
      background: linear-gradient(145deg, #1f5d8e, #2f77ad);
      color: #fff;
      font-size: 24px;
      font-weight: 700;
      line-height: 1;
      box-shadow: var(--shadow-lg);
      z-index: 70;
      cursor: pointer;
      transition: transform 180ms cubic-bezier(.22,1,.36,1), box-shadow 180ms cubic-bezier(.22,1,.36,1);
    }
    .dash-chat-fab:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 30px rgba(20, 63, 97, 0.25);
    }

    .dash-chat-panel {
      position: fixed;
      right: 24px;
      bottom: 92px;
      width: min(400px, calc(100vw - 24px));
      max-height: min(70vh, 640px);
      display: flex;
      flex-direction: column;
      border-radius: var(--r-xl);
      border: 1px solid var(--border-2);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
      z-index: 70;
      animation: dashboardChatReveal 180ms cubic-bezier(.22,1,.36,1) both;
    }
    .dash-chat-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, #f9fcff, #f3f8fc);
    }
    .dash-chat-title { font-size: .86rem; font-weight: 800; color: var(--text-primary); }
    .dash-chat-sub { margin-top: 2px; font-size: .72rem; color: var(--text-secondary); }

    .dash-chat-body {
      flex: 1;
      min-height: 180px;
      max-height: 320px;
      overflow-y: auto;
      padding: 10px 12px;
      background: #fbfdff;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .dash-chat-msg {
      max-width: 86%;
      border-radius: 14px;
      border: 1px solid var(--border);
      padding: 8px 10px;
      box-shadow: var(--shadow-sm);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .dash-chat-msg-user {
      margin-left: auto;
      background: #e9f4ff;
      border-color: #b7d6f2;
    }
    .dash-chat-msg-bot {
      margin-right: auto;
      background: #ffffff;
    }
    .dash-chat-intent {
      align-self: flex-start;
      font-size: .62rem;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: #225b88;
      background: #ecf5fd;
      border: 1px solid #cde2f5;
      border-radius: 9999px;
      padding: 2px 7px;
    }
    .dash-chat-text { font-size: .79rem; line-height: 1.35; color: var(--text-primary); }
    .dash-chat-time { font-size: .65rem; color: var(--text-tertiary); text-align: right; }

    .dash-chat-suggest {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 12px;
      border-top: 1px solid var(--border);
      background: var(--surface-2);
      max-height: 120px;
      overflow-y: auto;
    }

    .dash-chat-input {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 10px 12px;
      border-top: 1px solid var(--border);
      background: #ffffff;
    }
    .dash-chat-input .form-control {
      min-height: 34px;
      padding: 6px 10px;
      font-size: .8rem;
    }

    @keyframes dashboardChatReveal {
      from { opacity: 0; transform: translateY(10px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes panelReveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { .dash-title, .stat-row .sc, .panel { animation: none !important; } }
    @media (max-width: 520px) { .insight-summary-grid { grid-template-columns: 1fr; } }
    @media (max-width: 680px) {
      .dash-chat-fab { right: 12px; bottom: 12px; }
      .dash-chat-panel { right: 12px; bottom: 82px; width: calc(100vw - 24px); }
      .dash-chat-msg { max-width: 92%; }
    }
  `]
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
      { label: 'Available Credit', value: '₹' + this.creditAvail().toLocaleString('en-IN'), sub: 'of ₹' + this.creditLimit().toLocaleString('en-IN'), icon: this._icon('credit'), color: '#3f6182', bg: '#e7f0fa' },
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
