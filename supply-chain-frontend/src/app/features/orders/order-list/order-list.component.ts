import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { OrderApiService, AdminOrderApiService } from '../../../core/api/order-api.service';
import { OrderSlaService, OrderSlaState } from '../../../core/services/order-sla.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { BulkOrderStatusItemResultDto, BulkUpdateOrderStatusResultDto, OrderListItemDto } from '../../../core/models/order.models';
import { OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_BADGE, ORDER_STATUS_TRANSITIONS, UserRole } from '../../../core/models/enums';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PaginationComponent],
  template: `
    <div class="page-content">
      <div class="page-header">
        <h1>{{ isDealer() ? 'My Orders' : 'All Orders' }}</h1>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-secondary btn-sm" (click)="exportCsv()" [disabled]="orders().length === 0">Export CSV</button>
          @if (isStaff()) {
            <button class="btn btn-secondary btn-sm" (click)="selectAllMatchingAcrossPages()" [disabled]="!canSelectAllMatching() || selectAllMatchingLoading()">
              {{ selectAllMatchingLoading() ? 'Selecting...' : 'Select All Matching' }}
            </button>
            <button class="btn btn-ghost btn-sm" (click)="clearSelection()" [disabled]="selectedCount() === 0">Clear Selection</button>
          }
        </div>
      </div>

      @if (isStaff() && selectedCount() > 0) {
        <div class="card mb-4 d-flex gap-3 align-center flex-wrap" style="padding:12px 14px">
          <span class="text-sm fw-600">{{ selectedCount() }} selected</span>
          <select class="form-control" style="width:220px" [(ngModel)]="bulkStatus" (ngModelChange)="onBulkStatusChange()">
            <option [ngValue]="null">Select status</option>
            @for (s of bulkStatusOptions; track s.value) {
              <option [ngValue]="s.value">{{ s.label }}</option>
            }
          </select>
          <button class="btn btn-secondary btn-sm" (click)="runBulkPrecheck()" [disabled]="bulkStatus === null || precheckLoading()">Validate Selection</button>
          <button class="btn btn-primary btn-sm" (click)="applyBulkStatus()" [disabled]="!canApplyBulkStatus()">Apply Bulk Status</button>
          @if (transitionEstimate(); as estimate) {
            <span class="text-xs text-secondary">Estimated valid {{ estimate.valid }}, invalid {{ estimate.invalid }}</span>
            @if (estimate.unknown > 0) {
              <span class="text-xs text-secondary">({{ estimate.unknown }} not loaded)</span>
            }
          }
          @if (needsPrecheck()) {
            <span class="text-xs text-secondary">Run Validate Selection before applying.</span>
          }
        </div>

        @if (currentBulkPrecheck(); as precheck) {
          <div class="card mb-4" style="padding:12px 14px">
            <div class="d-flex gap-2 align-center flex-wrap">
              <span class="badge badge-success">Valid {{ precheck.validCount }}</span>
              <span class="badge badge-error">Invalid {{ precheck.invalidCount }}</span>
              @if (precheck.appliedCount > 0) {
                <span class="badge badge-primary">Applied {{ precheck.appliedCount }}</span>
              }
            </div>

            @if (invalidPrecheckItems().length > 0) {
              <div class="text-sm fw-600 mt-2">Invalid selections</div>
              <ul class="text-sm text-secondary" style="margin:4px 0 0; padding-left:16px">
                @for (item of invalidPrecheckItems(); track item.orderId) {
                  <li>{{ item.orderNumber ?? (item.orderId | slice:0:8) }}: {{ item.message ?? 'Invalid transition' }}</li>
                }
              </ul>
            }
          </div>
        }
      }

      <!-- Filters -->
      <div class="d-flex gap-3 mb-6 flex-wrap">
        <select class="form-control" style="width:190px" [(ngModel)]="statusFilter" (ngModelChange)="onStatusFilterChange()">
          <option [ngValue]="null">All Statuses</option>
          @for (s of statusOptions; track s.value) {
            <option [ngValue]="s.value">{{ s.label }}</option>
          }
        </select>

        <select class="form-control" style="width:170px" [(ngModel)]="slaFilter" (ngModelChange)="onClientFilterChange()">
          <option value="all">All SLA</option>
          <option value="on-track">On Track</option>
          <option value="at-risk">At Risk</option>
          <option value="delayed">Delayed</option>
          <option value="closed">Closed</option>
        </select>

        <input type="search"
               class="form-control"
               style="min-width:220px"
               placeholder="Search order number"
               [(ngModel)]="searchQuery"
               (ngModelChange)="onClientFilterChange()">

        @if (!isDealer()) {
          <input type="search"
                 class="form-control"
                 style="min-width:220px"
                 placeholder="Dealer ID contains..."
                 [(ngModel)]="dealerQuery"
                 (ngModelChange)="onClientFilterChange()">
        }

        <input type="date" class="form-control" style="width:180px" [(ngModel)]="fromDate" (ngModelChange)="onClientFilterChange()">
        <input type="date" class="form-control" style="width:180px" [(ngModel)]="toDate" (ngModelChange)="onClientFilterChange()">

        <button class="btn btn-ghost btn-sm" (click)="resetFilters()">Reset</button>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:300px;border-radius:8px"></div>
      } @else if (orders().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No orders found</div>
          @if (isDealer()) { <a routerLink="/products" class="btn btn-primary mt-4">Start Shopping</a> }
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                @if (isStaff()) {
                  <th style="width:40px"><input type="checkbox" [checked]="allVisibleSelected()" [indeterminate]="hasSomeVisibleSelected() && !allVisibleSelected()" (change)="toggleSelectAllVisible($any($event.target).checked)"></th>
                }
                <th>Order #</th>
                @if (!isDealer()) { <th>Dealer ID</th> }
                <th>Status</th>
                <th>SLA</th>
                <th>Expected</th>
                <th>Total</th>
                <th>Placed At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (o of orders(); track o.orderId) {
                <tr [routerLink]="['/orders', o.orderId]">
                  @if (isStaff()) {
                    <td>
                      <input type="checkbox"
                             [checked]="isSelected(o.orderId)"
                             (click)="$event.stopPropagation()"
                             (change)="toggleSelection(o.orderId, $any($event.target).checked)">
                    </td>
                  }
                  <td class="fw-600">{{ o.orderNumber }}</td>
                  @if (!isDealer()) { <td class="text-xs text-secondary">{{ o.dealerId | slice:0:8 }}...</td> }
                  <td><span class="badge" [class]="statusBadge(o.status)">{{ statusLabel(o.status) }}</span></td>
                  <td><span class="badge" [class]="slaBadgeClass(o)">{{ slaLabel(o) }}</span></td>
                  <td class="text-sm">{{ expectedLabel(o) }}</td>
                  <td class="fw-600">{{ o.totalAmount | currency:'INR':'symbol':'1.2-2' }}</td>
                  <td class="text-sm">{{ o.placedAtUtc | date:'dd MMM yyyy, HH:mm' }}</td>
                  <td><a [routerLink]="['/orders', o.orderId]" class="btn btn-ghost btn-sm">View →</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (showPagination()) {
          <app-pagination [currentPage]="page()" [totalCount]="totalCount()" [pageSize]="20" (pageChange)="loadPage($event)" />
        } @else {
          <div class="text-sm text-secondary mt-3">Showing {{ orders().length }} filtered result(s).</div>
        }
      }
    </div>
  `
})
export class OrderListComponent implements OnInit {
  private static readonly MAX_SERVER_SELECT = 1000;

  private readonly orderApi      = inject(OrderApiService);
  private readonly adminOrderApi = inject(AdminOrderApiService);
  private readonly orderSla      = inject(OrderSlaService);
  private readonly authStore     = inject(AuthStore);
  private readonly toast         = inject(ToastService);

  readonly loading    = signal(true);
  readonly bulkUpdating = signal(false);
  readonly precheckLoading = signal(false);
  readonly selectAllMatchingLoading = signal(false);
  readonly allOrders  = signal<OrderListItemDto[]>([]);
  readonly orders     = signal<OrderListItemDto[]>([]);
  readonly page       = signal(1);
  readonly serverTotalCount = signal(0);
  readonly totalCount = signal(0);
  readonly selectedOrderIds = signal<Record<string, true>>({});
  readonly bulkPrecheck = signal<BulkUpdateOrderStatusResultDto | null>(null);
  statusFilter: OrderStatus | null = null;
  slaFilter: 'all' | OrderSlaState = 'all';
  bulkStatus: OrderStatus | null = null;
  searchQuery = '';
  dealerQuery = '';
  fromDate = '';
  toDate = '';
  private bulkPrecheckStatus: OrderStatus | null = null;
  private bulkPrecheckSelectionKey = '';

  readonly isDealer = () => this.authStore.hasRole(UserRole.Dealer);
  readonly isStaff = () => this.authStore.hasRole(UserRole.Admin, UserRole.Warehouse, UserRole.Logistics);

  readonly selectedCount = computed(() => Object.keys(this.selectedOrderIds()).length);
  readonly currentBulkPrecheck = computed(() => this.isPrecheckCurrent() ? this.bulkPrecheck() : null);
  readonly invalidPrecheckItems = computed<BulkOrderStatusItemResultDto[]>(() =>
    (this.currentBulkPrecheck()?.results ?? []).filter(result => !result.canTransition).slice(0, 6)
  );
  readonly transitionEstimate = computed(() => {
    if (this.bulkStatus === null) {
      return null;
    }

    const selected = this.selectedOrderIds();
    const selectedOrders = this.allOrders().filter(order => !!selected[order.orderId]);
    const valid = selectedOrders.filter(order => (ORDER_STATUS_TRANSITIONS[order.status] ?? []).includes(this.bulkStatus!)).length;
    const invalid = selectedOrders.length - valid;
    const unknown = this.selectedCount() - selectedOrders.length;

    return { valid, invalid, unknown };
  });

  readonly statusOptions = Object.entries(ORDER_STATUS_LABELS).map(([v, l]) => ({ value: Number(v) as OrderStatus, label: l }));
  readonly bulkStatusOptions = this.statusOptions;

  statusLabel(s: OrderStatus): string { return ORDER_STATUS_LABELS[s] ?? String(s); }
  statusBadge(s: OrderStatus): string { return `badge ${ORDER_STATUS_BADGE[s] ?? 'badge-neutral'}`; }

  slaLabel(order: OrderListItemDto): string {
    return this.orderSla.getSlaInfo(order).label;
  }

  expectedLabel(order: OrderListItemDto): string {
    const expected = this.orderSla.getSlaInfo(order).expectedAtUtc;
    return new Date(expected).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  slaBadgeClass(order: OrderListItemDto): string {
    const state = this.orderSla.getSlaInfo(order).state;
    if (state === 'on-track') return 'badge badge-success';
    if (state === 'at-risk') return 'badge badge-warning';
    if (state === 'delayed') return 'badge badge-error';
    return 'badge badge-neutral';
  }

  ngOnInit(): void { this.loadPage(1); }

  loadPage(p: number): void {
    const withClientFilters = this.hasClientFilters();
    const pageSize = withClientFilters ? 200 : 20;
    const targetPage = withClientFilters ? 1 : p;

    this.page.set(targetPage);
    this.loading.set(true);
    this.clearSelection();

    const obs = this.isDealer()
      ? this.orderApi.getMyOrders(targetPage, pageSize, this.statusFilter ?? undefined)
      : this.adminOrderApi.getAllOrders(targetPage, pageSize, this.statusFilter ?? undefined);

    obs.subscribe({
      next: r => {
        this.allOrders.set(r.items);
        this.serverTotalCount.set(r.totalCount);
        this.applyClientFilters();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onStatusFilterChange(): void {
    this.loadPage(1);
  }

  onClientFilterChange(): void {
    this.loadPage(1);
  }

  showPagination(): boolean {
    return !this.hasClientFilters();
  }

  resetFilters(): void {
    this.statusFilter = null;
    this.slaFilter = 'all';
    this.searchQuery = '';
    this.dealerQuery = '';
    this.fromDate = '';
    this.toDate = '';
    this.loadPage(1);
  }

  onBulkStatusChange(): void {
    this.invalidateBulkPrecheck();
  }

  isSelected(orderId: string): boolean {
    return !!this.selectedOrderIds()[orderId];
  }

  toggleSelection(orderId: string, checked: boolean): void {
    this.selectedOrderIds.update(current => {
      const next = { ...current };
      if (checked) {
        next[orderId] = true;
      } else {
        delete next[orderId];
      }

      return next;
    });

    this.invalidateBulkPrecheck();
  }

  allVisibleSelected(): boolean {
    const visible = this.orders();
    if (visible.length === 0) {
      return false;
    }

    const selected = this.selectedOrderIds();
    return visible.every(order => !!selected[order.orderId]);
  }

  hasSomeVisibleSelected(): boolean {
    const selected = this.selectedOrderIds();
    return this.orders().some(order => !!selected[order.orderId]);
  }

  toggleSelectAllVisible(checked: boolean): void {
    if (!checked) {
      this.clearSelection();
      return;
    }

    const next: Record<string, true> = {};
    this.orders().forEach(order => {
      next[order.orderId] = true;
    });
    this.selectedOrderIds.set(next);
    this.invalidateBulkPrecheck();
  }

  clearSelection(): void {
    this.selectedOrderIds.set({});
    this.invalidateBulkPrecheck();
  }

  canSelectAllMatching(): boolean {
    return this.isStaff() && this.showPagination() && this.serverTotalCount() > 0 && !this.loading();
  }

  async selectAllMatchingAcrossPages(): Promise<void> {
    if (!this.canSelectAllMatching()) {
      return;
    }

    this.selectAllMatchingLoading.set(true);

    try {
      const pageSize = 100;
      const targetStatus = this.statusFilter ?? undefined;
      const ids: string[] = [];
      let page = 1;
      let totalCount = 0;

      while (ids.length < OrderListComponent.MAX_SERVER_SELECT) {
        const result = await firstValueFrom(this.adminOrderApi.getAllOrders(page, pageSize, targetStatus));
        totalCount = result.totalCount;

        if (result.items.length === 0) {
          break;
        }

        result.items.forEach(item => ids.push(item.orderId));

        if (page * pageSize >= result.totalCount) {
          break;
        }

        page += 1;
      }

      const uniqueIds = [...new Set(ids)].slice(0, OrderListComponent.MAX_SERVER_SELECT);
      const next: Record<string, true> = {};
      uniqueIds.forEach(id => {
        next[id] = true;
      });
      this.selectedOrderIds.set(next);
      this.invalidateBulkPrecheck();

      if (totalCount > uniqueIds.length) {
        this.toast.warning(`Selected ${uniqueIds.length} order(s). Refine filters to select beyond ${OrderListComponent.MAX_SERVER_SELECT}.`);
      } else {
        this.toast.success(`Selected ${uniqueIds.length} matching order(s)`);
      }
    } catch {
      this.toast.error('Failed to select matching orders');
    } finally {
      this.selectAllMatchingLoading.set(false);
    }
  }

  needsPrecheck(): boolean {
    return this.bulkStatus !== null && this.selectedCount() > 0 && !this.isPrecheckCurrent();
  }

  canApplyBulkStatus(): boolean {
    const precheck = this.currentBulkPrecheck();

    return (
      this.isStaff() &&
      this.bulkStatus !== null &&
      this.selectedCount() > 0 &&
      !this.bulkUpdating() &&
      !this.precheckLoading() &&
      !!precheck &&
      precheck.validCount > 0
    );
  }

  runBulkPrecheck(): void {
    if (this.bulkStatus === null || this.selectedCount() === 0 || !this.isStaff()) {
      return;
    }

    const targetStatus = this.bulkStatus;
    const ids = Object.keys(this.selectedOrderIds());
    const selectionKey = this.selectionKey(ids);

    this.precheckLoading.set(true);
    this.adminOrderApi.bulkUpdateStatus({ newStatus: targetStatus, orderIds: ids, validateOnly: true }).subscribe({
      next: result => {
        this.precheckLoading.set(false);
        this.bulkPrecheck.set(result);
        this.bulkPrecheckStatus = targetStatus;
        this.bulkPrecheckSelectionKey = selectionKey;

        if (result.invalidCount > 0) {
          this.toast.warning(`${result.invalidCount} order(s) cannot transition to the selected status`);
        } else {
          this.toast.success(`All ${result.validCount} selected order(s) are valid`);
        }
      },
      error: () => {
        this.precheckLoading.set(false);
        this.invalidateBulkPrecheck();
        this.toast.error('Failed to validate selected orders');
      }
    });
  }

  applyBulkStatus(): void {
    if (!this.canApplyBulkStatus()) {
      if (this.needsPrecheck()) {
        this.toast.warning('Run Validate Selection before applying bulk status');
      }
      return;
    }

    const targetStatus = this.bulkStatus!;
    const ids = Object.keys(this.selectedOrderIds());
    const selectionKey = this.selectionKey(ids);

    this.bulkUpdating.set(true);

    this.adminOrderApi.bulkUpdateStatus({ newStatus: targetStatus, orderIds: ids, validateOnly: false }).subscribe({
      next: result => {
        const successCount = result.appliedCount;
        const failedCount = result.requestedCount - successCount;

        this.bulkPrecheck.set(result);
        this.bulkPrecheckStatus = targetStatus;
        this.bulkPrecheckSelectionKey = selectionKey;

        if (successCount > 0) {
          this.toast.success(`Updated ${successCount} order(s)`);
        }

        if (failedCount > 0) {
          this.toast.warning(`${failedCount} order(s) were not updated`);
        }

        this.bulkUpdating.set(false);
        this.bulkStatus = null;
        this.loadPage(this.page());
      },
      error: () => {
        this.bulkUpdating.set(false);
        this.toast.error('Bulk update failed');
      }
    });
  }

  exportCsv(): void {
    if (this.orders().length === 0) {
      return;
    }

    const headers = ['Order Number', 'Order Id', 'Dealer Id', 'Status', 'Total Amount', 'Placed At UTC'];
    const lines = [headers.join(',')];

    this.orders().forEach(order => {
      const row = [
        this.escapeCsv(order.orderNumber),
        this.escapeCsv(order.orderId),
        this.escapeCsv(order.dealerId),
        this.escapeCsv(this.statusLabel(order.status)),
        order.totalAmount.toFixed(2),
        this.escapeCsv(order.placedAtUtc)
      ];
      lines.push(row.join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `orders-export-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);

    this.toast.success(`Exported ${this.orders().length} order(s)`);
  }

  private applyClientFilters(): void {
    let view = [...this.allOrders()];

    const query = this.searchQuery.trim().toLowerCase();
    if (query) {
      view = view.filter(order =>
        order.orderNumber.toLowerCase().includes(query) ||
        order.orderId.toLowerCase().includes(query)
      );
    }

    if (!this.isDealer()) {
      const dealerQuery = this.dealerQuery.trim().toLowerCase();
      if (dealerQuery) {
        view = view.filter(order => order.dealerId.toLowerCase().includes(dealerQuery));
      }
    }

    if (this.fromDate) {
      const from = new Date(this.fromDate);
      from.setHours(0, 0, 0, 0);
      view = view.filter(order => new Date(order.placedAtUtc) >= from);
    }

    if (this.toDate) {
      const to = new Date(this.toDate);
      to.setHours(23, 59, 59, 999);
      view = view.filter(order => new Date(order.placedAtUtc) <= to);
    }

    if (this.slaFilter !== 'all') {
      view = view.filter(order => this.orderSla.getSlaInfo(order).state === this.slaFilter);
    }

    this.orders.set(view);

    this.selectedOrderIds.update(current => {
      const visibleIds = new Set(view.map(order => order.orderId));
      const next: Record<string, true> = {};
      Object.keys(current).forEach(id => {
        if (visibleIds.has(id)) {
          next[id] = true;
        }
      });
      return next;
    });

    this.invalidateBulkPrecheck();

    if (this.showPagination()) {
      this.totalCount.set(this.serverTotalCount());
    } else {
      this.totalCount.set(view.length);
    }
  }

  private hasClientFilters(): boolean {
    return !!(
      this.searchQuery.trim() ||
      this.dealerQuery.trim() ||
      this.slaFilter !== 'all' ||
      this.fromDate ||
      this.toDate
    );
  }

  private escapeCsv(value: string): string {
    const normalized = value.replace(/"/g, '""');
    return `"${normalized}"`;
  }

  private invalidateBulkPrecheck(): void {
    this.bulkPrecheck.set(null);
    this.bulkPrecheckStatus = null;
    this.bulkPrecheckSelectionKey = '';
  }

  private isPrecheckCurrent(): boolean {
    if (this.bulkStatus === null || this.bulkPrecheckStatus !== this.bulkStatus) {
      return false;
    }

    return this.bulkPrecheckSelectionKey === this.selectionKey(Object.keys(this.selectedOrderIds()));
  }

  private selectionKey(orderIds: string[]): string {
    return [...orderIds].sort().join('|');
  }
}
