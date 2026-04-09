import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { CartStore } from '../../core/stores/cart.store';
import { UserRole, OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_BADGE, ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_BADGE } from '../../core/models/enums';
import { AdminApiService } from '../../core/api/admin-api.service';
import { OrderApiService, AdminOrderApiService } from '../../core/api/order-api.service';
import { LogisticsApiService } from '../../core/api/logistics-api.service';
import { CatalogApiService } from '../../core/api/catalog-api.service';
import { NotificationApiService } from '../../core/api/notification-api.service';
import { PaymentApiService } from '../../core/api/payment-api.service';
import { OrderListItemDto } from '../../core/models/order.models';
import { ShipmentDto } from '../../core/models/logistics.models';
import { ProductListItemDto } from '../../core/models/catalog.models';
import { buildProductPlaceholderDataUrl, enterpriseProductFallbackImageUrl, resolveEnterpriseProductImageUrl } from '../../core/services/product-image.service';
import { InventoryAlertRulesService } from '../../core/services/inventory-alert-rules.service';

interface PieSlice { label: string; value: number; color: string; pct: number; dashArray: string; dashOffset: number; }
interface StatCard  { label: string; value: string; sub: string; icon: string; color: string; bg: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, CurrencyPipe, DatePipe],
  template: `
<div class="dash">

  <!-- ── Header ── -->
  <div class="dash-header">
    <div>
      <h1 class="dash-title">Good {{ greeting() }}, {{ firstName() }} 👋</h1>
      <p class="dash-sub">{{ today() }} · {{ authStore.role() }} Portal</p>
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
          <div class="sc-val">{{ s.value }}</div>
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
                  <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.12"/>
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

              <circle cx="120" cy="120" r="58" fill="#ffffff" filter="url(#centerShadow)"/>
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
            <a routerLink="/shipments" class="qa-row">
              <div class="qa-icon" style="background:#fffbeb;color:#d97706">🚚</div>
              <div class="qa-text"><div class="qa-name">Shipments</div><div class="qa-desc">Dispatch orders</div></div>
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
</div>
  `,
  styles: [`
    /* ── Layout ── */
    .dash {
      padding: 30px 34px;
      max-width: 1460px;
      position: relative;
    }
    .dash::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(620px 300px at 94% 2%, rgba(37, 99, 235, 0.10), transparent 60%),
        radial-gradient(560px 300px at -6% 24%, rgba(14, 165, 233, 0.08), transparent 58%);
      pointer-events: none;
    }
    .dash > * { position: relative; z-index: 1; }
    @media (max-width: 768px) { .dash { padding: 16px; } }

    .dash-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      flex-wrap: wrap; gap: 16px; margin-bottom: 26px;
    }
    .dash-title {
      font-size: clamp(1.7rem, 2vw, 2rem);
      font-weight: 700;
      color: #0f172a;
      background: linear-gradient(120deg, #0f172a 0%, #1d4ed8 38%, #0f172a 72%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      background-size: 220% auto;
      animation: titleSheen 11s linear infinite;
      letter-spacing: -.03em;
      line-height: 1.1;
      font-family: var(--font-display);
      text-wrap: balance;
    }
    .dash-sub {
      font-size: .9rem;
      color: #475569;
      margin-top: 6px;
      font-weight: 600;
      letter-spacing: .01em;
    }
    .dash-actions { display: flex; gap: 8px; }

    /* ── Stat row ── */
    .stat-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 18px;
      margin-bottom: 26px;
    }
    @media (max-width: 1200px) { .stat-row { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px)  { .stat-row { grid-template-columns: 1fr; } }

    .sc {
      background: linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(248,252,255,.94) 100%);
      border: 1px solid #d8e2ef;
      border-radius: 16px;
      padding: 22px 24px;
      display: flex;
      align-items: flex-start;
      gap: 16px;
      transition: box-shadow 180ms var(--ease), transform 180ms var(--ease), border-color 180ms var(--ease);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
      position: relative;
      overflow: hidden;
      &::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0) 60%, rgba(255,255,255,.4) 100%);
        pointer-events: none;
      }
      &:hover {
        box-shadow: 0 16px 34px rgba(15, 23, 42, 0.11);
        transform: translateY(-4px);
        border-color: #bfdbfe;
      }
    }
    .sc-icon {
      width: 46px; height: 46px;
      border-radius: 13px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; flex-shrink: 0;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.75), 0 8px 18px rgba(15, 23, 42, 0.10);
      svg { width: 22px; height: 22px; }
    }
    .sc-body { flex: 1; min-width: 0; }
    .sc-val  { font-size: 1.75rem; font-weight: 800; color: var(--text-primary); letter-spacing: -.04em; line-height: 1; margin-bottom: 4px; }
    .sc-lbl  { font-size: .84rem; font-weight: 700; color: var(--text-secondary); letter-spacing: .01em; }
    .sc-sub  { font-size: .75rem; color: var(--text-tertiary); margin-top: 3px; font-weight: 500; }

    /* ── Main grid ── */
    .dash-grid {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 22px;
      align-items: start;
    }
    @media (max-width: 1100px) { .dash-grid { grid-template-columns: 1fr; } }

    .dash-left  { display: flex; flex-direction: column; gap: 22px; }
    .dash-right { display: flex; flex-direction: column; gap: 22px; }

    .stat-row .sc,
    .dash-left .panel,
    .dash-right .panel {
      animation: panelReveal .42s var(--ease-out);
    }

    /* ── Panel ── */
    .panel {
      background: linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(251, 253, 255, .95) 100%);
      border: 1px solid #d9e3ef;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.09);
      transition: box-shadow 180ms var(--ease), border-color 180ms var(--ease);
    }
    .panel:hover {
      box-shadow: 0 16px 34px rgba(15, 23, 42, 0.11);
      border-color: #c6d8ee;
    }
    .panel-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #e6edf6;
      background: linear-gradient(180deg, rgba(248, 251, 255, .75) 0%, rgba(255,255,255,.5) 100%);
    }
    .panel-title {
      display: flex; align-items: center; gap: 8px;
      font-size: .96rem; font-weight: 800; color: var(--text-primary);
      letter-spacing: -.01em;
    }
    .panel-icon { display: none; }
    .view-all {
      font-size: .8125rem; font-weight: 700; color: var(--brand-600);
      text-decoration: none;
      transition: color 130ms var(--ease);
      &:hover { color: var(--brand-700); }
    }
    .panel-empty {
      padding: 32px; text-align: center;
      font-size: .875rem; color: var(--text-secondary);
      font-weight: 600;
    }
    .table-skeleton { padding: 14px 20px; }

    /* ── Table ── */
    .tbl-wrap { overflow-x: auto; }
    .tbl {
      width: 100%; border-collapse: collapse; font-size: .875rem;
      thead tr { background: #f7fbff; }
      thead th {
        padding: 12px 16px; text-align: left;
        font-size: .6875rem; font-weight: 700; color: var(--text-secondary);
        text-transform: uppercase; letter-spacing: .06em;
        border-bottom: 1px solid #e0e9f4; white-space: nowrap;
      }
      tbody tr {
        border-bottom: 1px solid #ecf1f7;
        transition: background 120ms var(--ease), box-shadow 120ms var(--ease);
        &:last-child { border-bottom: none; }
        &:hover {
          background: var(--brand-50);
          box-shadow: inset 3px 0 0 #93c5fd;
          td { color: var(--text-primary); }
        }
      }
      tbody td { padding: 14px 16px; color: var(--text-primary); vertical-align: middle; }
    }
    .fw    { font-weight: 700; }
    .mono  { font-family: var(--font-mono); font-size: .79rem; }
    .muted { color: var(--text-secondary); font-weight: 500; }
    .brand { color: var(--brand-700); }
    .product-cell { display: flex; align-items: center; gap: 10px; }
    .product-thumb {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      object-fit: cover;
      border: 1px solid #dbe5f0;
      box-shadow: 0 6px 14px rgba(15, 23, 42, 0.10);
      flex-shrink: 0;
    }

    /* ── Chip / badge ── */
    .chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 9px; border-radius: 9999px;
      font-size: .6875rem; font-weight: 600;
      letter-spacing: .02em; white-space: nowrap;
      &::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
    }
    .badge-primary { background: #eff6ff; color: #1d4ed8; }
    .badge-success { background: #ecfdf5; color: #065f46; }
    .badge-warning { background: #fffbeb; color: #92400e; }
    .badge-error   { background: #fef2f2; color: #991b1b; }
    .badge-info    { background: #ecfeff; color: #164e63; }
    .badge-neutral { background: #f1f5f9; color: #475569; }
    .badge-purple  { background: #f5f3ff; color: #5b21b6; }

    /* ── Pie chart ── */
    .pie-wrap {
      padding: 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }
    .pie-shell {
      width: 278px;
      height: 278px;
      border-radius: 28px;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at 30% 20%, #ffffff 0%, #eef4ff 44%, #deebfa 100%);
      border: 1px solid #cfe0f3;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 20px 38px rgba(15, 23, 42, 0.14);
    }
    .pie-svg { width: 246px; height: 246px; }
    .pie-center-val {
      font-size: 36px; font-weight: 800; fill: #0f172a;
      font-family: var(--font-display);
      letter-spacing: -.04em;
    }
    .pie-center-lbl {
      font-size: 11px;
      fill: #475569;
      font-weight: 700;
      font-family: var(--font-sans);
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .pie-legend { width: 100%; display: flex; flex-direction: column; gap: 10px; }
    .legend-card {
      background: linear-gradient(180deg, #f9fcff 0%, #f3f8ff 100%);
      border: 1px solid #d9e4f2;
      border-radius: 12px;
      padding: 9px 11px;
    }
    .legend-top { display: flex; align-items: center; gap: 8px; font-size: .8125rem; margin-bottom: 7px; }
    .legend-bar { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .legend-bar span { display: block; height: 100%; border-radius: inherit; }
    .legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
    .legend-label { flex: 1; color: #334155; font-weight: 700; }
    .legend-val { font-weight: 700; color: #0f172a; }
    .legend-empty {
      font-size: .8125rem;
      color: #64748b;
      text-align: center;
      padding: 12px 8px;
      border: 1px dashed #b4c6db;
      border-radius: 10px;
      background: #f4f9ff;
    }

    /* ── Inventory alerts ── */
    .inventory-alerts {
      padding: 16px 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .inventory-rule-row {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .inventory-rule-label {
      font-size: .75rem;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .inventory-rule-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .inventory-threshold-input {
      width: 120px;
      min-width: 120px;
    }
    .inventory-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: .8125rem;
      color: #334155;
      font-weight: 600;
    }
    .inventory-summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .inventory-summary-card {
      border: 1px solid #d7e3f1;
      border-radius: 10px;
      background: #f7fbff;
      padding: 10px;
      text-align: center;
    }
    .inventory-summary-label {
      font-size: .6875rem;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 3px;
    }
    .inventory-summary-value {
      font-size: 1.1rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -.02em;
    }
    .inventory-alert-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .inventory-alert-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      text-decoration: none;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #ffffff;
      transition: background 120ms var(--ease), border-color 120ms var(--ease), transform 120ms var(--ease);
    }
    .inventory-alert-row:hover {
      background: #f8fbff;
      border-color: #bfdbfe;
      transform: translateY(-1px);
    }
    .inventory-alert-name {
      color: #0f172a;
      font-size: .8125rem;
      font-weight: 700;
      line-height: 1.35;
    }
    .inventory-alert-meta {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ── Quick actions ── */
    .qa-list { display: flex; flex-direction: column; padding: 6px; }
    .qa-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px;
      text-decoration: none;
      border-bottom: 1px solid #ecf2f8;
      border-radius: 10px;
      transition: background 120ms var(--ease), transform 120ms var(--ease), box-shadow 120ms var(--ease);
      &:last-child { border-bottom: none; }
      &:hover {
        background: linear-gradient(180deg, #f5f9ff 0%, #edf5ff 100%);
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(37, 99, 235, 0.12);
      }
    }
    .qa-icon {
      width: 38px; height: 38px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.75), 0 6px 14px rgba(15, 23, 42, 0.08);
    }
    .qa-text { flex: 1; min-width: 0; }
    .qa-name { font-size: .88rem; font-weight: 800; color: var(--text-primary); letter-spacing: -.01em; }
    .qa-desc { font-size: .75rem; color: var(--text-secondary); margin-top: 1px; font-weight: 600; }
    .qa-arrow { color: #7aa2d6; font-size: 14px; font-weight: 700; }

    .row-link {
      font-size: .8125rem; font-weight: 700; color: var(--brand-600);
      text-decoration: none; white-space: nowrap;
      transition: color 120ms var(--ease);
      &:hover { color: var(--brand-700); }
    }

    @keyframes panelReveal {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes titleSheen {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }

    @media (prefers-reduced-motion: reduce) {
      .dash-title,
      .stat-row .sc,
      .dash-left .panel,
      .dash-right .panel {
        animation: none !important;
      }
    }
  `]
})
export class DashboardComponent implements OnInit {
  readonly authStore = inject(AuthStore);
  readonly cartStore = inject(CartStore);
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

  // Data
  readonly recentOrders    = signal<OrderListItemDto[]>([]);
  readonly recentProducts  = signal<ProductListItemDto[]>([]);
  readonly inventoryProducts = signal<ProductListItemDto[]>([]);
  readonly recentShipments = signal<ShipmentDto[]>([]);
  readonly totalOrders     = signal(0);
  readonly creditAvail     = signal(0);
  readonly creditLimit     = signal(0);
  readonly lowStockThreshold = signal(10);
  readonly includeOutOfStock = signal(true);
  readonly thresholdDraft = signal('10');
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

  readonly stats = computed<StatCard[]>(() => {
    const role = this.authStore.role();
    if (role === UserRole.Dealer) return [
      { label: 'Available Credit', value: '₹' + this.creditAvail().toLocaleString('en-IN'), sub: 'of ₹' + this.creditLimit().toLocaleString('en-IN'), icon: this._icon('credit'), color: '#2563eb', bg: '#eff6ff' },
      { label: 'My Orders',        value: String(this.totalOrders()), sub: 'All time', icon: this._icon('orders'), color: '#059669', bg: '#ecfdf5' },
      { label: 'Cart Items',       value: String(this.cartStore.itemCount()), sub: '₹' + this.cartStore.total().toFixed(2) + ' total', icon: this._icon('cart'), color: '#d97706', bg: '#fffbeb' },
      { label: 'Shipments',        value: String(this.recentShipments().length), sub: 'Active', icon: this._icon('ship'), color: '#0284c7', bg: '#f0f9ff' },
    ];
    if (role === UserRole.Admin) return [
      { label: 'Total Orders',    value: String(this.totalOrders()), sub: 'All time', icon: this._icon('orders'), color: '#2563eb', bg: '#eff6ff' },
      { label: 'Active Shipments',value: String(this.recentShipments().filter(s => s.status < 5).length), sub: 'In transit', icon: this._icon('ship'), color: '#059669', bg: '#ecfdf5' },
      { label: 'Products',        value: String(this.recentProducts().length), sub: 'In catalog', icon: this._icon('box'), color: '#d97706', bg: '#fffbeb' },
      { label: 'Pending Dealers', value: String(this.recentOrders().length), sub: 'Awaiting approval', icon: this._icon('users'), color: '#7c3aed', bg: '#f5f3ff' },
    ];
    return [
      { label: 'Orders',    value: String(this.totalOrders()), sub: 'Total', icon: this._icon('orders'), color: '#2563eb', bg: '#eff6ff' },
      { label: 'Shipments', value: String(this.recentShipments().length), sub: 'Active', icon: this._icon('ship'), color: '#059669', bg: '#ecfdf5' },
    ];
  });

  readonly isAdmin     = () => this.authStore.hasRole(UserRole.Admin);
  readonly isDealer    = () => this.authStore.hasRole(UserRole.Dealer);
  readonly isWarehouse = () => this.authStore.hasRole(UserRole.Warehouse);
  readonly isLogistics = () => this.authStore.hasRole(UserRole.Logistics);
  readonly isAgent     = () => this.authStore.hasRole(UserRole.Agent);
  readonly showInventoryAlerts = () => this.isAdmin() || this.isWarehouse();

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
    imageElement.src = buildProductPlaceholderDataUrl(productName, undefined, 220, 220);
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

  ngOnInit(): void {
    const role = this.authStore.role();
    const rules = this.inventoryAlertRules.rules();

    this.lowStockThreshold.set(rules.lowStockThreshold);
    this.thresholdDraft.set(String(rules.lowStockThreshold));
    this.includeOutOfStock.set(rules.includeOutOfStock);

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
    const shipObs = role === UserRole.Dealer ? this.logisticsApi.getMyShipments() : this.logisticsApi.getAllShipments();
    shipObs.subscribe({
      next: r => { this.recentShipments.set(r.slice(0, 8)); this.shipmentsLoading.set(false); },
      error: () => this.shipmentsLoading.set(false)
    });
  }

  private _buildPie(orders: OrderListItemDto[]): void {
    const counts: Record<number, number> = {};
    orders.forEach(o => { counts[o.status] = (counts[o.status] ?? 0) + 1; });
    this.orderCounts.set(counts);
  }

  private _icon(name: string): string {
    const icons: Record<string, string> = {
      credit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
      orders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
      cart:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
      ship:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      box:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
      users:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    };
    return icons[name] ?? '';
  }
}
