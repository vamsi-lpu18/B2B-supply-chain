import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LogisticsApiService } from '../../../core/api/logistics-api.service';
import { OrderApiService } from '../../../core/api/order-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { ShipmentDto } from '../../../core/models/logistics.models';
import { OrderDto } from '../../../core/models/order.models';
import { OrderStatus, ORDER_STATUS_BADGE, ORDER_STATUS_LABELS, ShipmentStatus, SHIPMENT_STATUS_BADGE, SHIPMENT_STATUS_LABELS, UserRole } from '../../../core/models/enums';

@Component({
  selector: 'app-order-tracking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-content feature-orders">
      <div class="page-header">
        <div>
          <a [routerLink]="isAgent() ? '/shipments' : '/orders'" class="btn btn-ghost mb-2">← Back</a>
          <h1>Order Tracking</h1>
          <p class="text-sm text-secondary">{{ titleLabel() }}</p>
        </div>
        <div class="header-actions">
          <span class="live-pill">Live Tracking</span>
          <button class="btn btn-secondary" (click)="refresh()" [disabled]="loading()">Refresh</button>
          @if (order()) {
            <a [routerLink]="['/orders', id()]" class="btn btn-ghost">Open Order</a>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:320px;border-radius:8px"></div>
      } @else {
        <div class="tracking-kpis mb-4">
          <div class="tracking-kpi">
            <span class="kpi-label">Shipments Linked</span>
            <span class="kpi-value">{{ shipments().length }}</span>
          </div>
          <div class="tracking-kpi">
            <span class="kpi-label">Tracking Events</span>
            <span class="kpi-value">{{ trackingEventCount() }}</span>
          </div>
          <div class="tracking-kpi">
            <span class="kpi-label">Latest Update</span>
            <span class="kpi-value kpi-small">{{ latestUpdateLabel() }}</span>
          </div>
          <div class="tracking-kpi">
            <span class="kpi-label">Delivery Health</span>
            <span class="badge" [class]="deliveryHealthBadge()">{{ deliveryHealthLabel() }}</span>
          </div>
        </div>

        <div class="grid-2 mb-4">
          <div class="card">
            <h2 class="mb-3">Order Stage</h2>
            @if (order(); as currentOrder) {
              <div class="d-flex gap-2 align-center mb-3">
                <span class="badge" [class]="orderStatusBadge(currentOrder.status)">{{ orderStatusLabel(currentOrder.status) }}</span>
                <span class="text-sm text-secondary">{{ currentOrder.orderNumber }}</span>
              </div>
              <div class="stage-rail mb-3">
                @for (stage of orderStages; track stage; let idx = $index) {
                  <div class="stage-node" [class.reached]="isOrderStageReached(idx)" [class.current]="isOrderStageCurrent(idx)">
                    <span class="stage-dot"></span>
                    <span class="stage-label">{{ stage }}</span>
                  </div>
                }
              </div>
              <div class="progress-track mb-2">
                <div class="progress-fill progress-order" [style.width.%]="orderProgressPercent()"></div>
              </div>
              <p class="text-sm text-secondary">{{ orderProgressPercent() }}% complete</p>
            } @else {
              <p class="text-sm text-secondary">Order details are not available for this role. Shipment tracking remains active.</p>
            }
          </div>

          <div class="card">
            <h2 class="mb-3">Shipment Stage</h2>
            @if (selectedShipment(); as currentShipment) {
              <div class="d-flex gap-2 align-center mb-3 flex-wrap">
                <span class="badge" [class]="shipmentStatusBadge(currentShipment.status)">{{ shipmentStatusLabel(currentShipment.status) }}</span>
                <span class="text-sm text-secondary">{{ currentShipment.shipmentNumber }}</span>
              </div>
              <div class="stage-rail mb-3">
                @for (stage of shipmentStages; track stage; let idx = $index) {
                  <div class="stage-node" [class.reached]="isShipmentStageReached(currentShipment.status, idx)" [class.current]="isShipmentStageCurrent(currentShipment.status, idx)">
                    <span class="stage-dot"></span>
                    <span class="stage-label">{{ stage }}</span>
                  </div>
                }
              </div>
              <div class="progress-track mb-2">
                <div class="progress-fill progress-shipment" [style.width.%]="shipmentProgressPercent(currentShipment.status)"></div>
              </div>
              <p class="text-sm text-secondary">{{ shipmentProgressPercent(currentShipment.status) }}% complete</p>
            } @else {
              <p class="text-sm text-secondary">No shipment is linked to this order yet.</p>
            }
          </div>
        </div>

        <div class="card mb-4">
          <div class="d-flex justify-between align-center flex-wrap gap-2 mb-3">
            <h2>Shipment Tracker</h2>
            <span class="text-sm text-secondary">{{ shipments().length }} shipment(s)</span>
          </div>

          @if (shipments().length > 1) {
            <div class="form-group" style="max-width:360px">
              <label>Choose Shipment</label>
              <select class="form-control" [ngModel]="selectedShipmentId()" (ngModelChange)="onSelectShipment($event)">
                @for (shipment of shipments(); track shipment.shipmentId) {
                  <option [value]="shipment.shipmentId">{{ shipment.shipmentNumber }} · {{ shipmentStatusLabel(shipment.status) }}</option>
                }
              </select>
            </div>
          }

          @if (selectedShipment(); as currentShipment) {
            <div class="shipment-headline mb-3">
              <div><span class="field-label">Address</span><span>{{ currentShipment.deliveryAddress }}, {{ currentShipment.city }}, {{ currentShipment.state }} - {{ currentShipment.postalCode }}</span></div>
              <div><span class="field-label">Vehicle</span><span>{{ currentShipment.vehicleNumber || 'Not assigned' }}</span></div>
              <div><span class="field-label">Assigned Agent</span><span>{{ currentShipment.assignedAgentId ? (currentShipment.assignedAgentId | slice:0:8) + '...' : 'Not assigned' }}</span></div>
            </div>

            <div class="timeline">
              @for (event of currentShipment.events; track event.shipmentEventId) {
                <div class="timeline-item">
                  <div class="timeline-time">{{ event.createdAtUtc | date:'dd MMM yyyy, HH:mm' }} · {{ event.updatedByRole }}</div>
                  <div class="timeline-title">
                    <span class="badge" [class]="shipmentStatusBadge(event.status)">{{ shipmentStatusLabel(event.status) }}</span>
                  </div>
                  @if (event.note) {
                    <div class="timeline-body">{{ event.note }}</div>
                  }
                </div>
              }
            </div>
          } @else {
            <p class="text-sm text-secondary">No shipment events available.</p>
          }
        </div>

        @if (isAgent() && selectedShipment()) {
          <div class="card mb-4">
            <h2 class="mb-3">Delivery Agent Approval</h2>
            <p class="text-sm text-secondary mb-3">
              Keep this timeline accurate by moving the shipment to out-for-delivery and finally delivered.
            </p>
            <div class="form-group">
              <label>Delivery Note</label>
              <textarea
                class="form-control"
                rows="3"
                maxlength="500"
                [(ngModel)]="deliveryNote"
                placeholder="Add location/proof/receiver details"></textarea>
            </div>
            <div class="delivery-actions">
              <button
                class="btn btn-secondary"
                (click)="markOutForDelivery()"
                [disabled]="!canMarkOutForDelivery() || actionLoading()">
                Mark Out For Delivery
              </button>
              <button
                class="btn btn-primary"
                (click)="approveDelivery()"
                [disabled]="!canApproveDelivery() || actionLoading()">
                Approve Delivery
              </button>
            </div>
          </div>
        }

        @if (order()?.statusHistory?.length) {
          <div class="card">
            <h2 class="mb-3">Order Status Timeline</h2>
            <div class="timeline">
              @for (history of order()!.statusHistory; track history.historyId) {
                <div class="timeline-item">
                  <div class="timeline-time">{{ history.changedAtUtc | date:'dd MMM yyyy, HH:mm' }} · {{ history.changedByRole }}</div>
                  <div class="timeline-title">{{ orderStatusLabel(history.fromStatus) }} → {{ orderStatusLabel(history.toStatus) }}</div>
                </div>
              }
            </div>
          </div>
        }

        @if (!order() && shipments().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">📍</div>
            <div class="empty-title">Nothing to track yet</div>
            <div class="empty-desc">This order currently has no tracking data for your role.</div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .live-pill {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid #a9c1d8;
      background: linear-gradient(180deg, rgba(240, 247, 255, .82) 0%, rgba(223, 236, 249, .74) 100%);
      color: var(--brand-700);
      font-size: .75rem;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .header-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }

    .header-actions .btn {
      min-width: 108px;
      width: auto;
    }

    .header-actions .btn.btn-ghost {
      border-color: #bfd1e3;
      background: linear-gradient(180deg, rgba(247,252,255,.82) 0%, rgba(231,241,251,.70) 100%);
    }

    .tracking-kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .tracking-kpi {
      border: 1px solid #c3d4e5;
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(246,250,255,.82) 0%, rgba(234,243,252,.70) 100%);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: 0 8px 18px rgba(23, 39, 58, 0.12);
    }

    .kpi-label {
      font-size: .72rem;
      color: var(--text-secondary);
      letter-spacing: .04em;
      text-transform: uppercase;
      font-weight: 700;
    }

    .kpi-value {
      font-size: 1.35rem;
      color: var(--text-primary);
      font-weight: 800;
      letter-spacing: -.02em;
    }

    .kpi-small {
      font-size: .9rem;
      font-weight: 700;
    }

    .progress-track {
      width: 100%;
      height: 10px;
      border-radius: 999px;
      background: #c9d8e8;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 220ms ease;
    }

    .progress-order {
      background: linear-gradient(90deg, var(--brand-600) 0%, #4f86b7 100%);
    }

    .progress-shipment {
      background: linear-gradient(90deg, #5f7e9e 0%, #6a90b6 100%);
    }

    .shipment-headline {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .field-label {
      display: block;
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      margin-bottom: 4px;
      letter-spacing: .04em;
    }

    .stage-rail {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
      gap: 8px;
    }

    .stage-node {
      border: 1px solid #c3d4e5;
      border-radius: 10px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      background: linear-gradient(180deg, rgba(246,250,255,.78) 0%, rgba(234,243,252,.68) 100%);
      transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
    }

    .stage-node:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 14px rgba(23, 39, 58, 0.14);
    }

    .stage-node.reached {
      border-color: #9eb8d2;
      background: linear-gradient(180deg, rgba(234,243,252,.86) 0%, rgba(223,236,249,.78) 100%);
    }

    .stage-node.current {
      border-color: var(--brand-600);
      box-shadow: 0 0 0 2px rgba(81, 111, 143, 0.20);
      background: linear-gradient(180deg, rgba(224,236,249,.90) 0%, rgba(212,228,243,.82) 100%);
    }

    .stage-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #8ea5bf;
    }

    .stage-node.reached .stage-dot,
    .stage-node.current .stage-dot {
      background: var(--brand-600);
    }

    .stage-label {
      font-size: .66rem;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--text-secondary);
      letter-spacing: .03em;
      text-align: center;
    }

    .delivery-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .delivery-actions .btn {
      width: auto;
      min-width: 168px;
    }

    @media (max-width: 768px) {
      .tracking-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .stage-rail {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .page-header {
        align-items: stretch;
      }

      .header-actions {
        width: 100%;
        justify-content: flex-start;
      }

      .header-actions .btn {
        min-width: 0;
      }

      .delivery-actions {
        justify-content: flex-start;
      }

      .delivery-actions .btn {
        min-width: 138px;
        justify-content: center;
      }

      .shipment-headline {
        grid-template-columns: 1fr;
      }

      .shipment-headline > div {
        background: linear-gradient(180deg, rgba(246,250,255,.78) 0%, rgba(234,243,252,.68) 100%);
        border: 1px solid #c3d4e5;
        border-radius: 10px;
        padding: 10px;
      }

    }
  `]
})
export class OrderTrackingComponent implements OnInit {
  readonly id = input.required<string>();

  private readonly orderApi = inject(OrderApiService);
  private readonly logisticsApi = inject(LogisticsApiService);
  private readonly authStore = inject(AuthStore);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly actionLoading = signal(false);
  readonly order = signal<OrderDto | null>(null);
  readonly shipments = signal<ShipmentDto[]>([]);
  readonly selectedShipmentId = signal<string | null>(null);

  deliveryNote = '';
  private orderResolved = false;
  private shipmentsResolved = false;

  readonly isAgent = () => this.authStore.hasRole(UserRole.Agent);
  readonly isDealer = () => this.authStore.hasRole(UserRole.Dealer);
  readonly orderStages = ['Placed', 'Processing', 'Dispatch', 'Transit', 'Delivered'];
  readonly shipmentStages = ['Created', 'Assigned', 'Picked Up', 'In Transit', 'Out For Delivery', 'Delivered'];

  readonly selectedShipment = computed(() => {
    const selectedId = this.selectedShipmentId();
    if (!selectedId) {
      return null;
    }

    return this.shipments().find(item => item.shipmentId === selectedId) ?? null;
  });

  ngOnInit(): void {
    this.refresh();
  }

  titleLabel(): string {
    const currentOrder = this.order();
    if (currentOrder) {
      return `${currentOrder.orderNumber} · ${currentOrder.dealerId.slice(0, 8)}...`;
    }

    return `Order ID: ${this.id().slice(0, 8)}...`;
  }

  refresh(): void {
    this.loading.set(true);
    this.orderResolved = false;
    this.shipmentsResolved = false;
    this.loadOrder();
    this.loadShipments();
  }

  onSelectShipment(shipmentId: string): void {
    this.selectedShipmentId.set(shipmentId || null);
  }

  orderStatusLabel(status: OrderStatus): string {
    return ORDER_STATUS_LABELS[status] ?? String(status);
  }

  orderStatusBadge(status: OrderStatus): string {
    return `badge ${ORDER_STATUS_BADGE[status] ?? 'badge-neutral'}`;
  }

  shipmentStatusLabel(status: ShipmentStatus): string {
    return SHIPMENT_STATUS_LABELS[status] ?? String(status);
  }

  shipmentStatusBadge(status: ShipmentStatus): string {
    return `badge ${SHIPMENT_STATUS_BADGE[status] ?? 'badge-neutral'}`;
  }

  trackingEventCount(): number {
    return this.shipments().reduce((count, shipment) => count + shipment.events.length, 0);
  }

  latestUpdateLabel(): string {
    const latestShipment = this.shipments()
      .flatMap(shipment => shipment.events)
      .sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime())[0];

    if (latestShipment) {
      return new Date(latestShipment.createdAtUtc).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    const currentOrder = this.order();
    if (currentOrder?.placedAtUtc) {
      return new Date(currentOrder.placedAtUtc).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    return 'No updates yet';
  }

  deliveryHealthLabel(): string {
    const shipment = this.selectedShipment();
    if (!shipment) {
      return 'Pending';
    }

    if (shipment.status === ShipmentStatus.Delivered) {
      return 'On Time';
    }

    if (shipment.status === ShipmentStatus.DeliveryFailed || shipment.status === ShipmentStatus.Returned) {
      return 'Attention Needed';
    }

    if (shipment.status === ShipmentStatus.OutForDelivery) {
      return 'Final Mile';
    }

    return 'In Progress';
  }

  deliveryHealthBadge(): string {
    const label = this.deliveryHealthLabel();
    if (label === 'On Time') return 'badge-success';
    if (label === 'Attention Needed') return 'badge-error';
    if (label === 'Final Mile') return 'badge-warning';
    return 'badge-info';
  }

  isOrderStageReached(stageIndex: number): boolean {
    return stageIndex <= this.orderStageIndex();
  }

  isOrderStageCurrent(stageIndex: number): boolean {
    return stageIndex === this.orderStageIndex();
  }

  isShipmentStageReached(status: ShipmentStatus, stageIndex: number): boolean {
    return stageIndex <= this.shipmentStageIndex(status);
  }

  isShipmentStageCurrent(status: ShipmentStatus, stageIndex: number): boolean {
    return stageIndex === this.shipmentStageIndex(status);
  }

  orderProgressPercent(): number {
    const status = this.order()?.status;
    if (status === undefined) {
      return 0;
    }

    const map: Record<OrderStatus, number> = {
      [OrderStatus.Placed]: 10,
      [OrderStatus.OnHold]: 15,
      [OrderStatus.Processing]: 35,
      [OrderStatus.ReadyForDispatch]: 50,
      [OrderStatus.InTransit]: 70,
      [OrderStatus.Exception]: 60,
      [OrderStatus.Delivered]: 100,
      [OrderStatus.ReturnRequested]: 75,
      [OrderStatus.ReturnApproved]: 85,
      [OrderStatus.ReturnRejected]: 90,
      [OrderStatus.Closed]: 100,
      [OrderStatus.Cancelled]: 100
    };

    return map[status] ?? 0;
  }

  shipmentProgressPercent(status: ShipmentStatus): number {
    const map: Record<ShipmentStatus, number> = {
      [ShipmentStatus.Created]: 10,
      [ShipmentStatus.Assigned]: 25,
      [ShipmentStatus.PickedUp]: 45,
      [ShipmentStatus.InTransit]: 65,
      [ShipmentStatus.OutForDelivery]: 85,
      [ShipmentStatus.Delivered]: 100,
      [ShipmentStatus.DeliveryFailed]: 75,
      [ShipmentStatus.Returned]: 100
    };

    return map[status] ?? 0;
  }

  private orderStageIndex(): number {
    const status = this.order()?.status;
    if (status === undefined) {
      return 0;
    }

    if (status === OrderStatus.Placed || status === OrderStatus.OnHold) return 0;
    if (status === OrderStatus.Processing) return 1;
    if (status === OrderStatus.ReadyForDispatch) return 2;
    if (status === OrderStatus.InTransit || status === OrderStatus.Exception) return 3;
    return 4;
  }

  private shipmentStageIndex(status: ShipmentStatus): number {
    if (status === ShipmentStatus.Created) return 0;
    if (status === ShipmentStatus.Assigned) return 1;
    if (status === ShipmentStatus.PickedUp) return 2;
    if (status === ShipmentStatus.InTransit) return 3;
    if (status === ShipmentStatus.OutForDelivery) return 4;
    return 5;
  }

  canMarkOutForDelivery(): boolean {
    const shipment = this.selectedShipment();
    if (!shipment) {
      return false;
    }

    return shipment.status === ShipmentStatus.Assigned
      || shipment.status === ShipmentStatus.PickedUp
      || shipment.status === ShipmentStatus.InTransit;
  }

  canApproveDelivery(): boolean {
    const shipment = this.selectedShipment();
    if (!shipment) {
      return false;
    }

    return shipment.status === ShipmentStatus.OutForDelivery || shipment.status === ShipmentStatus.InTransit;
  }

  markOutForDelivery(): void {
    const shipment = this.selectedShipment();
    if (!shipment) {
      return;
    }

    this.updateShipmentStatus(
      shipment.shipmentId,
      ShipmentStatus.OutForDelivery,
      this.deliveryNote.trim() || 'Shipment moved to out-for-delivery by assigned agent.'
    );
  }

  approveDelivery(): void {
    const shipment = this.selectedShipment();
    if (!shipment) {
      return;
    }

    this.updateShipmentStatus(
      shipment.shipmentId,
      ShipmentStatus.Delivered,
      this.deliveryNote.trim() || 'Delivery approved by assigned delivery agent.'
    );
  }

  private loadOrder(): void {
    this.orderApi.getOrderById(this.id()).subscribe({
      next: order => {
        this.order.set(order);
        this.orderResolved = true;
        this.tryFinishLoading();
      },
      error: () => {
        this.order.set(null);
        this.orderResolved = true;
        this.tryFinishLoading();
      }
    });
  }

  private loadShipments(): void {
    const shipmentsRequest = this.isDealer()
      ? this.logisticsApi.getMyShipments()
      : this.isAgent()
        ? this.logisticsApi.getAssignedShipments()
        : this.logisticsApi.getAllShipments();

    shipmentsRequest.subscribe({
      next: allShipments => {
        const matching = allShipments
          .filter(shipment => shipment.orderId === this.id())
          .sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());

        this.shipments.set(matching);
        const currentSelection = this.selectedShipmentId();
        if (!currentSelection || !matching.some(shipment => shipment.shipmentId === currentSelection)) {
          this.selectedShipmentId.set(matching[0]?.shipmentId ?? null);
        }

        this.shipmentsResolved = true;
        this.tryFinishLoading();
      },
      error: () => {
        this.shipments.set([]);
        this.selectedShipmentId.set(null);
        this.shipmentsResolved = true;
        this.tryFinishLoading();
      }
    });
  }

  private tryFinishLoading(): void {
    if (!this.orderResolved || !this.shipmentsResolved) {
      return;
    }

    this.loading.set(false);
  }

  private updateShipmentStatus(shipmentId: string, status: ShipmentStatus, note: string): void {
    this.actionLoading.set(true);
    this.logisticsApi.updateStatus(shipmentId, { status, note }).subscribe({
      next: () => {
        this.toast.success('Shipment status updated');
        this.deliveryNote = '';
        this.actionLoading.set(false);
        this.refresh();
      },
      error: () => {
        this.toast.error('Failed to update shipment status');
        this.actionLoading.set(false);
      }
    });
  }
}
