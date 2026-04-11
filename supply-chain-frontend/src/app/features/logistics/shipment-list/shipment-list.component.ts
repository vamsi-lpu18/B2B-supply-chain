import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LogisticsApiService } from '../../../core/api/logistics-api.service';
import { ShipmentEtaService, ShipmentSlaState } from '../../../core/services/shipment-eta.service';
import { ShipmentOpsQueueService, ShipmentOpsState } from '../../../core/services/shipment-ops-queue.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ShipmentDto } from '../../../core/models/logistics.models';
import { ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_BADGE, UserRole } from '../../../core/models/enums';

type ShipmentOpsFilter = 'all' | 'handover-pending' | 'exception-queue' | 'retry-required';

@Component({
  selector: 'app-shipment-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content feature-logistics">
      <div class="page-header">
        <h1>Shipments</h1>
      </div>

      <div class="d-flex gap-3 mb-6">
        <select class="form-control" style="width:200px" [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()">
          <option [ngValue]="null">All Statuses</option>
          @for (s of statusOptions; track s.value) {
            <option [ngValue]="s.value">{{ s.label }}</option>
          }
        </select>

        <select class="form-control" style="width:180px" [(ngModel)]="slaFilter" (ngModelChange)="applyFilter()">
          <option value="all">All SLA States</option>
          <option value="on-track">On Track</option>
          <option value="at-risk">At Risk</option>
          <option value="delayed">Delayed</option>
          <option value="exception">Exception</option>
          <option value="delivered">Delivered</option>
        </select>

        <select class="form-control" style="width:220px" [(ngModel)]="opsFilter" (ngModelChange)="applyFilter()">
          <option value="all">All Ops Queues</option>
          <option value="handover-pending">Handover Pending</option>
          <option value="exception-queue">Exception Queue</option>
          <option value="retry-required">Retry Required</option>
        </select>
      </div>

      <div class="d-flex gap-3 mb-4 flex-wrap">
        <div class="card" style="min-width:160px">
          <div class="text-xs text-secondary">Visible Shipments</div>
          <div class="fw-700" style="font-size:20px">{{ filtered().length }}</div>
        </div>
        <div class="card" style="min-width:190px">
          <div class="text-xs text-secondary">Handover Pending</div>
          <div class="fw-700" style="font-size:20px">{{ handoverPendingCount() }}</div>
        </div>
        <div class="card" style="min-width:180px">
          <div class="text-xs text-secondary">Exceptions</div>
          <div class="fw-700 text-danger" style="font-size:20px">{{ exceptionQueueCount() }}</div>
        </div>
        <div class="card" style="min-width:180px">
          <div class="text-xs text-secondary">Retry Required</div>
          <div class="fw-700 text-warning" style="font-size:20px">{{ retryRequiredCount() }}</div>
        </div>
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
                <th>ETA</th>
                <th>SLA</th>
                <th>Ops Queue</th>
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
                  <td class="text-sm">{{ etaDateLabel(s) }}</td>
                  <td>
                    <span class="badge" [class]="slaBadgeClass(s)">{{ etaStatusLabel(s) }}</span>
                  </td>
                  <td>
                    <div class="d-flex gap-1 flex-wrap">
                      @if (isHandoverPending(s)) {
                        <span class="badge badge-warning">Handover Pending</span>
                      }
                      @if (isExceptionQueue(s)) {
                        <span class="badge badge-error">Exception</span>
                      }
                      @if (isRetryRequired(s)) {
                        <span class="badge badge-info">Retry Required</span>
                      }
                    </div>
                  </td>
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
  private readonly etaService   = inject(ShipmentEtaService);
  private readonly opsQueue     = inject(ShipmentOpsQueueService);
  private readonly authStore    = inject(AuthStore);

  readonly loading  = signal(true);
  readonly all      = signal<ShipmentDto[]>([]);
  readonly filtered = signal<ShipmentDto[]>([]);
  readonly opsMap   = signal<Record<string, ShipmentOpsState>>({});
  statusFilter: ShipmentStatus | null = null;
  slaFilter: 'all' | ShipmentSlaState = 'all';
  opsFilter: ShipmentOpsFilter = 'all';

  readonly isDealer = () => this.authStore.hasRole(UserRole.Dealer);
  readonly isAgent = () => this.authStore.hasRole(UserRole.Agent);
  readonly statusOptions = Object.entries(SHIPMENT_STATUS_LABELS).map(([v, l]) => ({ value: Number(v) as ShipmentStatus, label: l }));

  statusLabel(s: ShipmentStatus): string { return SHIPMENT_STATUS_LABELS[s] ?? String(s); }
  statusBadge(s: ShipmentStatus): string { return `badge ${SHIPMENT_STATUS_BADGE[s] ?? 'badge-neutral'}`; }

  etaDateLabel(shipment: ShipmentDto): string {
    const eta = this.etaService.getEtaInfo(shipment);
    return new Date(eta.expectedDeliveryAtUtc).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  etaStatusLabel(shipment: ShipmentDto): string {
    return this.etaService.getEtaInfo(shipment).slaLabel;
  }

  slaBadgeClass(shipment: ShipmentDto): string {
    const state = this.etaService.getEtaInfo(shipment).slaState;
    if (state === 'on-track') return 'badge badge-success';
    if (state === 'at-risk') return 'badge badge-warning';
    if (state === 'delayed') return 'badge badge-error';
    if (state === 'exception') return 'badge badge-error';
    return 'badge badge-info';
  }

  ngOnInit(): void {
    const obs = this.isDealer()
      ? this.logisticsApi.getMyShipments()
      : this.isAgent()
        ? this.logisticsApi.getAssignedShipments()
        : this.logisticsApi.getAllShipments();
    obs.subscribe({
      next: r => {
        const sorted = [...r].sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());
        this.all.set(sorted);
        this.hydrateOps(sorted);
      },
      error: () => this.loading.set(false)
    });
  }

  handoverPendingCount(): number {
    return this.filtered().filter(shipment => this.isHandoverPending(shipment)).length;
  }

  exceptionQueueCount(): number {
    return this.filtered().filter(shipment => this.isExceptionQueue(shipment)).length;
  }

  retryRequiredCount(): number {
    return this.filtered().filter(shipment => this.isRetryRequired(shipment)).length;
  }

  isHandoverPending(shipment: ShipmentDto): boolean {
    const state = this.opsState(shipment);
    return state.handoverState === 'pending';
  }

  isExceptionQueue(shipment: ShipmentDto): boolean {
    const state = this.opsState(shipment);
    const slaState = this.etaService.getEtaInfo(shipment).slaState;
    return state.handoverState === 'exception'
      || slaState === 'exception'
      || slaState === 'delayed'
      || shipment.status === ShipmentStatus.DeliveryFailed
      || shipment.status === ShipmentStatus.Returned;
  }

  isRetryRequired(shipment: ShipmentDto): boolean {
    const state = this.opsState(shipment);
    return state.retryRequired
      || shipment.status === ShipmentStatus.DeliveryFailed
      || shipment.status === ShipmentStatus.Returned;
  }

  applyFilter(): void {
    let view = [...this.all()];

    if (this.statusFilter !== null) {
      view = view.filter(s => s.status === this.statusFilter);
    }

    if (this.slaFilter !== 'all') {
      view = view.filter(s => this.etaService.getEtaInfo(s).slaState === this.slaFilter);
    }

    if (this.opsFilter !== 'all') {
      view = view.filter(shipment => this.matchesOpsFilter(shipment));
    }

    this.filtered.set(view);
  }

  private matchesOpsFilter(shipment: ShipmentDto): boolean {
    if (this.opsFilter === 'handover-pending') {
      return this.isHandoverPending(shipment);
    }

    if (this.opsFilter === 'exception-queue') {
      return this.isExceptionQueue(shipment);
    }

    if (this.opsFilter === 'retry-required') {
      return this.isRetryRequired(shipment);
    }

    return true;
  }

  private opsState(shipment: ShipmentDto): ShipmentOpsState {
    const cached = this.opsMap()[shipment.shipmentId];
    if (cached) {
      return cached;
    }

    return this.buildFallbackOpsState(shipment);
  }

  private hydrateOps(shipments: ShipmentDto[]): void {
    if (shipments.length === 0) {
      this.opsMap.set({});
      this.applyFilter();
      this.loading.set(false);
      return;
    }

    this.opsQueue.getBatch(shipments.map(shipment => shipment.shipmentId)).subscribe({
      next: states => {
        const next: Record<string, ShipmentOpsState> = { ...states };
        shipments.forEach(shipment => {
          if (!next[shipment.shipmentId]) {
            next[shipment.shipmentId] = this.buildFallbackOpsState(shipment);
          }
        });

        this.opsMap.set(next);
        this.applyFilter();
        this.loading.set(false);
      },
      error: () => {
        const fallback: Record<string, ShipmentOpsState> = {};
        shipments.forEach(shipment => {
          fallback[shipment.shipmentId] = this.buildFallbackOpsState(shipment);
        });

        this.opsMap.set(fallback);
        this.applyFilter();
        this.loading.set(false);
      }
    });
  }

  private buildFallbackOpsState(shipment: ShipmentDto): ShipmentOpsState {
    const created = {
      shipmentId: shipment.shipmentId,
      handoverState: 'pending' as const,
      retryRequired: false,
      retryCount: 0,
      updatedAtUtc: new Date().toISOString()
    };

    if (shipment.status === ShipmentStatus.Delivered) {
      return { ...created, handoverState: 'completed' };
    }

    const hasAgent = !!String(shipment.assignedAgentId ?? '').trim();
    const hasVehicle = !!String(shipment.vehicleNumber ?? '').trim();
    if (hasAgent && hasVehicle) {
      return { ...created, handoverState: 'ready' };
    }

    return created;
  }
}
