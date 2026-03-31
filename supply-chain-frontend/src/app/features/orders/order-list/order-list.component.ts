import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OrderApiService, AdminOrderApiService } from '../../../core/api/order-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { OrderListItemDto } from '../../../core/models/order.models';
import { OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_BADGE, UserRole } from '../../../core/models/enums';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PaginationComponent],
  template: `
    <div class="page-content">
      <div class="page-header">
        <h1>{{ isDealer() ? 'My Orders' : 'All Orders' }}</h1>
      </div>

      <!-- Filters -->
      <div class="d-flex gap-3 mb-6 flex-wrap">
        <select class="form-control" style="width:200px" [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()">
          <option [value]="null">All Statuses</option>
          @for (s of statusOptions; track s.value) {
            <option [value]="s.value">{{ s.label }}</option>
          }
        </select>
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
                <th>Order #</th>
                @if (!isDealer()) { <th>Dealer ID</th> }
                <th>Status</th>
                <th>Total</th>
                <th>Placed At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (o of orders(); track o.orderId) {
                <tr [routerLink]="['/orders', o.orderId]">
                  <td class="fw-600">{{ o.orderNumber }}</td>
                  @if (!isDealer()) { <td class="text-xs text-secondary">{{ o.dealerId | slice:0:8 }}...</td> }
                  <td><span class="badge" [class]="statusBadge(o.status)">{{ statusLabel(o.status) }}</span></td>
                  <td class="fw-600">{{ o.totalAmount | currency:'INR':'symbol':'1.2-2' }}</td>
                  <td class="text-sm">{{ o.placedAtUtc | date:'dd MMM yyyy, HH:mm' }}</td>
                  <td><a [routerLink]="['/orders', o.orderId]" class="btn btn-ghost btn-sm">View →</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [currentPage]="page()" [totalCount]="totalCount()" [pageSize]="20" (pageChange)="loadPage($event)" />
      }
    </div>
  `
})
export class OrderListComponent implements OnInit {
  private readonly orderApi      = inject(OrderApiService);
  private readonly adminOrderApi = inject(AdminOrderApiService);
  private readonly authStore     = inject(AuthStore);

  readonly loading    = signal(true);
  readonly orders     = signal<OrderListItemDto[]>([]);
  readonly page       = signal(1);
  readonly totalCount = signal(0);
  statusFilter: OrderStatus | null = null;

  readonly isDealer = () => this.authStore.hasRole(UserRole.Dealer);

  readonly statusOptions = Object.entries(ORDER_STATUS_LABELS).map(([v, l]) => ({ value: Number(v) as OrderStatus, label: l }));

  statusLabel(s: OrderStatus): string { return ORDER_STATUS_LABELS[s] ?? String(s); }
  statusBadge(s: OrderStatus): string { return `badge ${ORDER_STATUS_BADGE[s] ?? 'badge-neutral'}`; }

  ngOnInit(): void { this.loadPage(1); }

  loadPage(p: number): void {
    this.page.set(p);
    this.loading.set(true);
    const obs = this.isDealer()
      ? this.orderApi.getMyOrders(p, 20, this.statusFilter ?? undefined)
      : this.adminOrderApi.getAllOrders(p, 20, this.statusFilter ?? undefined);

    obs.subscribe({
      next: r => { this.orders.set(r.items); this.totalCount.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  applyFilter(): void { this.loadPage(1); }
}
