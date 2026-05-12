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
import { AssignmentDecisionStatus, OrderStatus, ORDER_STATUS_BADGE, ORDER_STATUS_LABELS, ShipmentStatus, SHIPMENT_STATUS_BADGE, SHIPMENT_STATUS_LABELS, UserRole } from '../../../core/models/enums';

@Component({
  selector: 'app-order-tracking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './order-tracking.component.html',
  styleUrl: './order-tracking.component.scss'
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
  assignmentResponseNote = '';
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

  assignmentDecisionLabel(status: AssignmentDecisionStatus): string {
    if (status === AssignmentDecisionStatus.Accepted) return 'Accepted';
    if (status === AssignmentDecisionStatus.Rejected) return 'Rejected';
    return 'Pending';
  }

  assignmentDecisionBadge(status: AssignmentDecisionStatus): string {
    if (status === AssignmentDecisionStatus.Accepted) return 'badge-success';
    if (status === AssignmentDecisionStatus.Rejected) return 'badge-error';
    return 'badge-warning';
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
    if (!shipment || !this.canActAsAssignedAgent(shipment)) {
      return false;
    }

    if (shipment.assignmentDecisionStatus !== AssignmentDecisionStatus.Accepted) {
      return false;
    }

    return shipment.status === ShipmentStatus.Assigned
      || shipment.status === ShipmentStatus.PickedUp
      || shipment.status === ShipmentStatus.InTransit;
  }

  canApproveDelivery(): boolean {
    const shipment = this.selectedShipment();
    if (!shipment || !this.canActAsAssignedAgent(shipment)) {
      return false;
    }

    if (shipment.assignmentDecisionStatus !== AssignmentDecisionStatus.Accepted) {
      return false;
    }

    return shipment.status === ShipmentStatus.OutForDelivery || shipment.status === ShipmentStatus.InTransit;
  }

  canRespondToAssignment(): boolean {
    const shipment = this.selectedShipment();
    if (!shipment || !this.canActAsAssignedAgent(shipment)) {
      return false;
    }

    if (shipment.status === ShipmentStatus.Delivered || shipment.status === ShipmentStatus.Returned) {
      return false;
    }

    return shipment.assignmentDecisionStatus === AssignmentDecisionStatus.Pending;
  }

  acceptAssignment(): void {
    const shipment = this.selectedShipment();
    if (!shipment || !this.canRespondToAssignment()) {
      return;
    }

    this.actionLoading.set(true);
    this.logisticsApi.acceptAssignment(shipment.shipmentId).subscribe({
      next: () => {
        this.toast.success('Assignment accepted');
        this.assignmentResponseNote = '';
        this.actionLoading.set(false);
        this.refresh();
      },
      error: () => {
        this.toast.error('Failed to accept assignment');
        this.actionLoading.set(false);
      }
    });
  }

  rejectAssignment(): void {
    const shipment = this.selectedShipment();
    if (!shipment || !this.canRespondToAssignment()) {
      return;
    }

    const reason = this.assignmentResponseNote.trim();
    if (!reason) {
      this.toast.error('Rejection reason is required');
      return;
    }

    this.actionLoading.set(true);
    this.logisticsApi.rejectAssignment(shipment.shipmentId, { reason }).subscribe({
      next: () => {
        this.toast.success('Assignment rejected');
        this.assignmentResponseNote = '';
        this.deliveryNote = '';
        this.actionLoading.set(false);
        this.refresh();
      },
      error: () => {
        this.toast.error('Failed to reject assignment');
        this.actionLoading.set(false);
      }
    });
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
        : this.authStore.hasRole(UserRole.Admin, UserRole.Logistics)
          ? this.logisticsApi.getAllShipments()
          : null;

    if (!shipmentsRequest) {
      this.shipments.set([]);
      this.selectedShipmentId.set(null);
      this.shipmentsResolved = true;
      this.tryFinishLoading();
      return;
    }

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

  private canActAsAssignedAgent(shipment: ShipmentDto): boolean {
    const userId = this.authStore.user()?.userId;
    if (!this.isAgent() || !userId || !shipment.assignedAgentId) {
      return false;
    }

    return this.isSameGuid(userId, shipment.assignedAgentId);
  }

  private isSameGuid(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }
}
