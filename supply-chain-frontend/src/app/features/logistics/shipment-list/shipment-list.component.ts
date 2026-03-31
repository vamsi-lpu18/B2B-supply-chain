import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LogisticsApiService } from '../../../core/api/logistics-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ShipmentDto } from '../../../core/models/logistics.models';
import { ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_BADGE, UserRole } from '../../../core/models/enums';

@Component({
  selector: 'app-shipment-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content">
      <div class="page-header">
        <h1>Shipments</h1>
      </div>

      <div class="d-flex gap-3 mb-6">
        <select class="form-control" style="width:200px" [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()">
          <option [value]="null">All Statuses</option>
          @for (s of statusOptions; track s.value) {
            <option [value]="s.value">{{ s.label }}</option>
          }
        </select>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:300px;border-radius:8px"></div>
      } @else if (filtered().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">🚚</div>
          <div class="empty-title">No shipments found</div>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Shipment #</th>
                <th>Order ID</th>
                <th>Status</th>
                <th>Delivery Address</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (s of filtered(); track s.shipmentId) {
                <tr [routerLink]="['/shipments', s.shipmentId]">
                  <td class="fw-600">{{ s.shipmentNumber }}</td>
                  <td class="text-xs text-secondary">{{ s.orderId | slice:0:8 }}...</td>
                  <td><span class="badge" [class]="statusBadge(s.status)">{{ statusLabel(s.status) }}</span></td>
                  <td class="text-sm">{{ s.deliveryAddress }}, {{ s.city }}</td>
                  <td class="text-sm">{{ s.createdAtUtc | date:'dd MMM yyyy' }}</td>
                  <td><a [routerLink]="['/shipments', s.shipmentId]" class="btn btn-ghost btn-sm">Track →</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `
})
export class ShipmentListComponent implements OnInit {
  private readonly logisticsApi = inject(LogisticsApiService);
  private readonly authStore    = inject(AuthStore);

  readonly loading  = signal(true);
  readonly all      = signal<ShipmentDto[]>([]);
  readonly filtered = signal<ShipmentDto[]>([]);
  statusFilter: ShipmentStatus | null = null;

  readonly isDealer = () => this.authStore.hasRole(UserRole.Dealer);
  readonly statusOptions = Object.entries(SHIPMENT_STATUS_LABELS).map(([v, l]) => ({ value: Number(v) as ShipmentStatus, label: l }));

  statusLabel(s: ShipmentStatus): string { return SHIPMENT_STATUS_LABELS[s] ?? String(s); }
  statusBadge(s: ShipmentStatus): string { return `badge ${SHIPMENT_STATUS_BADGE[s] ?? 'badge-neutral'}`; }

  ngOnInit(): void {
    const obs = this.isDealer() ? this.logisticsApi.getMyShipments() : this.logisticsApi.getAllShipments();
    obs.subscribe({
      next: r => {
        const sorted = [...r].sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());
        this.all.set(sorted);
        this.filtered.set(sorted);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  applyFilter(): void {
    if (this.statusFilter === null) {
      this.filtered.set(this.all());
    } else {
      this.filtered.set(this.all().filter(s => s.status === this.statusFilter));
    }
  }
}
