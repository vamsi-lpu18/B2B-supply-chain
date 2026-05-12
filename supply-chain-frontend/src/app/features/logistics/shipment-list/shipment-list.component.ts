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
  templateUrl: './shipment-list.component.html'
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
        : this.authStore.hasRole(UserRole.Admin, UserRole.Logistics)
          ? this.logisticsApi.getAllShipments()
          : null;

    if (!obs) {
      this.all.set([]);
      this.filtered.set([]);
      this.loading.set(false);
      return;
    }

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
