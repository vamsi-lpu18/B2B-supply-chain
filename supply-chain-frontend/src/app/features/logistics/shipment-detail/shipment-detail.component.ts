import { Component, inject, signal, OnInit, OnDestroy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LogisticsApiService } from '../../../core/api/logistics-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { ShipmentDto } from '../../../core/models/logistics.models';
import { ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_BADGE, UserRole } from '../../../core/models/enums';
import { mockVehicleFleet, MockVehicleOption } from '../../../core/mocks/vehicle.mocks';

@Component({
  selector: 'app-shipment-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content">
      <div class="page-header">
        <div>
          <a routerLink="/shipments" class="btn btn-ghost mb-2">← Shipments</a>
          <h1>{{ shipment()?.shipmentNumber ?? 'Shipment Detail' }}</h1>
        </div>
        <div class="d-flex gap-2">
          @if (canAssignAgent()) {
            <button class="btn btn-secondary" (click)="showAssignDialog.set(true)">Assign Agent</button>
          }
          @if (canAssignVehicle()) {
            <button class="btn btn-secondary" (click)="openVehicleDialog()">Assign Vehicle</button>
          }
          @if (canUpdateStatus()) {
            <button class="btn btn-primary" (click)="showStatusDialog.set(true)">Update Status</button>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:400px;border-radius:8px"></div>
      } @else if (shipment()) {
        <!-- Header -->
        <div class="card mb-4">
          <div class="shipment-header-grid">
            <div><span class="field-label">Status</span><span class="badge" [class]="statusBadge(shipment()!.status)">{{ statusLabel(shipment()!.status) }}</span></div>
            <div><span class="field-label">Order</span><a [routerLink]="['/orders', shipment()!.orderId]" class="text-primary">View Order →</a></div>
            <div><span class="field-label">Agent</span><span>{{ shipment()!.assignedAgentId ? (shipment()!.assignedAgentId | slice:0:8) + '...' : 'Unassigned' }}</span></div>
            <div><span class="field-label">Vehicle</span><span>{{ shipment()!.vehicleNumber || 'Unassigned' }}</span></div>
            <div><span class="field-label">Created</span><span>{{ shipment()!.createdAtUtc | date:'dd MMM yyyy, HH:mm' }}</span></div>
            @if (shipment()!.deliveredAtUtc) {
              <div><span class="field-label">Delivered</span><span class="text-success fw-600">{{ shipment()!.deliveredAtUtc | date:'dd MMM yyyy, HH:mm' }}</span></div>
            }
          </div>
          <div class="mt-4">
            <span class="field-label">Delivery Address</span>
            <p>{{ shipment()!.deliveryAddress }}, {{ shipment()!.city }}, {{ shipment()!.state }} - {{ shipment()!.postalCode }}</p>
          </div>
        </div>

        <!-- Events Timeline -->
        <div class="card">
          <h2 class="mb-4">Tracking Events</h2>
          @if (shipment()!.events.length === 0) {
            <p class="text-secondary text-sm">No events yet</p>
          } @else {
            <div class="timeline">
              @for (e of shipment()!.events; track e.shipmentEventId) {
                <div class="timeline-item">
                  <div class="timeline-time">{{ e.createdAtUtc | date:'dd MMM yyyy, HH:mm' }} · {{ e.updatedByRole }}</div>
                  <div class="timeline-title"><span class="badge" [class]="statusBadge(e.status)">{{ statusLabel(e.status) }}</span></div>
                  @if (e.note) { <div class="timeline-body">{{ e.note }}</div> }
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <div class="empty-title">Shipment not found</div>
          <a routerLink="/shipments" class="btn btn-primary mt-4">Back to Shipments</a>
        </div>
      }

      <!-- Assign Agent Dialog -->
      @if (showAssignDialog()) {
        <div class="modal-backdrop" (click)="showAssignDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Assign Agent</h2><button class="btn btn-ghost btn-icon" (click)="showAssignDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Agent ID (UUID) *</label>
                <input type="text" class="form-control" [(ngModel)]="agentId" placeholder="Agent UUID">
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAssignDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="assignAgent()" [disabled]="!isValidUuid(agentId) || actionLoading()">Assign</button>
            </div>
          </div>
        </div>
      }

      <!-- Assign Vehicle Dialog -->
      @if (showVehicleDialog()) {
        <div class="modal-backdrop" (click)="showVehicleDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Assign Vehicle</h2><button class="btn btn-ghost btn-icon" (click)="showVehicleDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Choose From Mock Fleet</label>
                <select class="form-control" [(ngModel)]="selectedMockVehicle" (ngModelChange)="onVehiclePicked($event)">
                  <option [ngValue]="''">Select a mock vehicle</option>
                  @for (v of mockVehicles; track v.vehicleNumber) {
                    <option [ngValue]="v.vehicleNumber">{{ v.vehicleNumber }} · {{ v.vehicleType }} · {{ v.region }} · {{ v.driverName }}</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label>Vehicle Number *</label>
                <input type="text" class="form-control" [(ngModel)]="vehicleNumber" placeholder="KA-01-AB-1234" maxlength="32">
                <small class="text-xs text-secondary">Allowed: letters, numbers, spaces, hyphens</small>
              </div>
              @if (selectedVehicleInfo()) {
                <div class="vehicle-meta">
                  <div><strong>Driver:</strong> {{ selectedVehicleInfo()!.driverName }}</div>
                  <div><strong>Type:</strong> {{ selectedVehicleInfo()!.vehicleType }} ({{ selectedVehicleInfo()!.capacityKg }} kg)</div>
                  <div><strong>Region:</strong> {{ selectedVehicleInfo()!.region }}</div>
                </div>
              }
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showVehicleDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="assignVehicle()" [disabled]="!isValidVehicleNumber(vehicleNumber) || isSameVehicleAsAssigned(vehicleNumber) || actionLoading()">Assign</button>
            </div>
          </div>
        </div>
      }

      <!-- Update Status Dialog -->
      @if (showStatusDialog()) {
        <div class="modal-backdrop" (click)="showStatusDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Update Shipment Status</h2><button class="btn btn-ghost btn-icon" (click)="showStatusDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>New Status</label>
                <select class="form-control" [(ngModel)]="newStatus">
                  @for (s of statusOptions; track s.value) {
                    <option [ngValue]="s.value">{{ s.label }}</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label>Note *</label>
                <textarea class="form-control" [(ngModel)]="statusNote" rows="2" maxlength="500"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showStatusDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="updateStatus()" [disabled]="actionLoading() || !statusNote.trim()">Update</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .shipment-header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .field-label { display: block; font-size: 11px; color: #616161; text-transform: uppercase; margin-bottom: 4px; }
    .vehicle-meta {
      margin-top: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.5;
      color: #334155;
    }
    @media (max-width: 600px) { .shipment-header-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class ShipmentDetailComponent implements OnInit, OnDestroy {
  readonly id = input.required<string>();

  private readonly logisticsApi = inject(LogisticsApiService);
  private readonly authStore    = inject(AuthStore);
  private readonly toast        = inject(ToastService);

  readonly loading          = signal(true);
  readonly actionLoading    = signal(false);
  readonly shipment         = signal<ShipmentDto | null>(null);
  readonly showAssignDialog = signal(false);
  readonly showVehicleDialog = signal(false);
  readonly showStatusDialog = signal(false);
  readonly mockVehicles = mockVehicleFleet;

  agentId    = '';
  vehicleNumber = '';
  selectedMockVehicle = '';
  statusNote = '';
  newStatus: ShipmentStatus = ShipmentStatus.Assigned;
  private refreshTimer?: ReturnType<typeof setInterval>;

  readonly statusOptions = Object.entries(SHIPMENT_STATUS_LABELS).map(([v, l]) => ({ value: Number(v) as ShipmentStatus, label: l }));
  statusLabel(s: ShipmentStatus): string { return SHIPMENT_STATUS_LABELS[s] ?? String(s); }
  statusBadge(s: ShipmentStatus): string { return `badge ${SHIPMENT_STATUS_BADGE[s] ?? 'badge-neutral'}`; }

  readonly canAssignAgent  = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics) && !this.shipment()?.assignedAgentId;
  readonly canAssignVehicle = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics);
  readonly canUpdateStatus = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics, UserRole.Agent);
  readonly isValidUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

  isValidVehicleNumber(value: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9\- ]{4,31}$/.test(this.normalizeVehicleNumber(value));
  }

  isSameVehicleAsAssigned(value: string): boolean {
    const assigned = this.normalizeVehicleNumber(this.shipment()?.vehicleNumber ?? '');
    const next = this.normalizeVehicleNumber(value);
    return assigned.length > 0 && assigned === next;
  }

  selectedVehicleInfo(): MockVehicleOption | undefined {
    const current = this.normalizeVehicleNumber(this.vehicleNumber);
    return this.mockVehicles.find(v => v.vehicleNumber === current);
  }

  onVehiclePicked(vehicleNumber: string): void {
    if (!vehicleNumber) {
      return;
    }

    this.vehicleNumber = vehicleNumber;
  }

  private normalizeVehicleNumber(value: string): string {
    return value.trim().toUpperCase();
  }

  ngOnInit(): void {
    this.loadShipment();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  loadShipment(): void {
    this.logisticsApi.getShipmentById(this.id()).subscribe({
      next: s => {
        this.shipment.set(s);
        this.loading.set(false);
        // Auto-refresh when in transit
        if (s.status === ShipmentStatus.InTransit || s.status === ShipmentStatus.OutForDelivery) {
          if (!this.refreshTimer) {
            this.refreshTimer = setInterval(() => this.loadShipment(), 30000);
          }
        } else {
          if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = undefined; }
        }
      },
      error: () => { this.shipment.set(null); this.loading.set(false); }
    });
  }

  assignAgent(): void {
    const agentId = this.agentId.trim();
    if (!this.isValidUuid(agentId)) {
      this.toast.error('Enter a valid Agent UUID');
      return;
    }

    this.actionLoading.set(true);
    this.logisticsApi.assignAgent(this.id(), { agentId }).subscribe({
      next: () => { this.toast.success('Agent assigned'); this.showAssignDialog.set(false); this.loadShipment(); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to assign agent'));
        this.actionLoading.set(false);
      }
    });
  }

  openVehicleDialog(): void {
    this.vehicleNumber = this.normalizeVehicleNumber(this.shipment()?.vehicleNumber ?? '');
    this.selectedMockVehicle = this.mockVehicles.some(v => v.vehicleNumber === this.vehicleNumber)
      ? this.vehicleNumber
      : '';
    this.showVehicleDialog.set(true);
  }

  assignVehicle(): void {
    const vehicleNumber = this.normalizeVehicleNumber(this.vehicleNumber);
    if (!this.isValidVehicleNumber(vehicleNumber)) {
      this.toast.error('Enter a valid vehicle number');
      return;
    }

    if (this.isSameVehicleAsAssigned(vehicleNumber)) {
      this.toast.info('This vehicle is already assigned');
      return;
    }

    this.actionLoading.set(true);
    this.logisticsApi.assignVehicle(this.id(), { vehicleNumber }).subscribe({
      next: () => {
        this.toast.success('Vehicle assigned');
        this.showVehicleDialog.set(false);
        this.loadShipment();
        this.actionLoading.set(false);
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to assign vehicle'));
        this.actionLoading.set(false);
      }
    });
  }

  updateStatus(): void {
    const note = this.statusNote.trim();
    if (!note) {
      this.toast.error('Note is required');
      return;
    }

    this.actionLoading.set(true);
    this.logisticsApi.updateStatus(this.id(), { status: Number(this.newStatus) as ShipmentStatus, note }).subscribe({
      next: () => { this.toast.success('Status updated'); this.showStatusDialog.set(false); this.loadShipment(); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to update shipment status'));
        this.actionLoading.set(false);
      }
    });
  }

  private getErrorMessage(err: unknown, fallback: string): string {
    const candidate = err as { error?: { message?: string; title?: string } };
    return candidate?.error?.message ?? candidate?.error?.title ?? fallback;
  }
}
