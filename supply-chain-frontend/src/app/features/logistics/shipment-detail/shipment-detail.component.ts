import { Component, inject, signal, OnInit, OnDestroy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LogisticsApiService } from '../../../core/api/logistics-api.service';
import { AdminApiService } from '../../../core/api/admin-api.service';
import { NotificationApiService } from '../../../core/api/notification-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { ShipmentEtaService } from '../../../core/services/shipment-eta.service';
import { DeliveryAttemptOutcome, ShipmentDeliveryAttempt, ShipmentDeliveryAttemptsService } from '../../../core/services/shipment-delivery-attempts.service';
import { ShipmentOpsQueueService, ShipmentOpsState } from '../../../core/services/shipment-ops-queue.service';
import { AgentSummaryDto } from '../../../core/models/auth.models';
import {
  ShipmentDto,
  LogisticsChatbotResponseDto
} from '../../../core/models/logistics.models';
import { AssignmentDecisionStatus, NotificationChannel, ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_BADGE, UserRole } from '../../../core/models/enums';
import { mockVehicleFleet, MockVehicleOption } from '../../../core/mocks/vehicle.mocks';

@Component({
  selector: 'app-shipment-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './shipment-detail.component.html',
  styleUrl: './shipment-detail.component.scss'
})
export class ShipmentDetailComponent implements OnInit, OnDestroy {
  readonly id = input.required<string>();

  private readonly logisticsApi = inject(LogisticsApiService);
  private readonly adminApi = inject(AdminApiService);
  private readonly notificationApi = inject(NotificationApiService);
  private readonly etaService   = inject(ShipmentEtaService);
  private readonly authStore    = inject(AuthStore);
  private readonly toast        = inject(ToastService);
  private readonly attemptsService = inject(ShipmentDeliveryAttemptsService);
  private readonly opsQueue = inject(ShipmentOpsQueueService);

  readonly loading          = signal(true);
  readonly actionLoading    = signal(false);
  readonly agentsLoading    = signal(false);
  readonly chatLoading      = signal(false);
  readonly shipment         = signal<ShipmentDto | null>(null);
  readonly availableAgents  = signal<AgentSummaryDto[]>([]);
  readonly attempts         = signal<ShipmentDeliveryAttempt[]>([]);
  readonly chatResponse     = signal<LogisticsChatbotResponseDto | null>(null);
  readonly opsState         = signal<ShipmentOpsState>({
    shipmentId: '',
    handoverState: 'pending',
    retryRequired: false,
    retryCount: 0,
    updatedAtUtc: new Date().toISOString()
  });
  readonly showAssignDialog = signal(false);
  readonly showVehicleDialog = signal(false);
  readonly showRejectAssignmentDialog = signal(false);
  readonly showQuickChatbot = signal(false);
  readonly showStatusDialog = signal(false);
  readonly showAttemptDialog = signal(false);
  readonly showRatingDialog = signal(false);
  readonly showHandoverExceptionDialog = signal(false);
  readonly showRetryDialog = signal(false);
  readonly mockVehicles = mockVehicleFleet;

  agentId    = '';
  vehicleNumber = '';
  selectedMockVehicle = '';
  assignmentRejectReason = '';
  statusNote = '';
  attemptReason = '';
  handoverExceptionReason = '';
  retryDate = '';
  retryReason = '';
  ratingComment = '';
  chatPrompt = 'Give me a shipment status summary.';
  ratingScore = 5;
  attemptOutcome: DeliveryAttemptOutcome = 'failed';
  newStatus: ShipmentStatus = ShipmentStatus.Assigned;
  private refreshTimer?: ReturnType<typeof setInterval>;

  readonly statusOptions = Object.entries(SHIPMENT_STATUS_LABELS).map(([v, l]) => ({ value: Number(v) as ShipmentStatus, label: l }));
  statusLabel(s: ShipmentStatus): string { return SHIPMENT_STATUS_LABELS[s] ?? String(s); }
  statusBadge(s: ShipmentStatus): string { return `badge ${SHIPMENT_STATUS_BADGE[s] ?? 'badge-neutral'}`; }

  availableStatusOptions(): { value: ShipmentStatus; label: string }[] {
    if (!this.isAgent()) {
      return this.statusOptions;
    }

    const hasVehicle = this.hasAssignedVehicle();
    return this.statusOptions.filter(option => {
      if (option.value === ShipmentStatus.DeliveryFailed) {
        return true;
      }

      if (!hasVehicle) {
        return false;
      }

      return option.value === ShipmentStatus.InTransit
        || option.value === ShipmentStatus.OutForDelivery
        || option.value === ShipmentStatus.Delivered;
    });
  }

  hasAssignedVehicle(shipment: ShipmentDto | null = this.shipment()): boolean {
    return !!String(shipment?.vehicleNumber ?? '').trim();
  }

  etaDateLabel(shipment: ShipmentDto): string {
    const eta = this.etaService.getEtaInfo(shipment);
    return new Date(eta.expectedDeliveryAtUtc).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  etaStatusLabel(shipment: ShipmentDto): string {
    return this.etaService.getEtaInfo(shipment).slaLabel;
  }

  etaRemainingLabel(shipment: ShipmentDto): string {
    return this.etaService.getEtaInfo(shipment).remainingLabel;
  }

  slaBadgeClass(shipment: ShipmentDto): string {
    const state = this.etaService.getEtaInfo(shipment).slaState;
    if (state === 'on-track') return 'badge badge-success';
    if (state === 'at-risk') return 'badge badge-warning';
    if (state === 'delayed') return 'badge badge-error';
    if (state === 'exception') return 'badge badge-error';
    return 'badge badge-info';
  }

  readonly canAssignAgent  = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics) && !this.shipment()?.assignedAgentId;
  readonly canAssignVehicle = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics);
  readonly isDealer = () => this.authStore.hasRole(UserRole.Dealer);
  readonly isAgent = () => this.authStore.hasRole(UserRole.Agent);
  readonly canUpdateStatus = () => {
    if (this.authStore.hasRole(UserRole.Admin, UserRole.Logistics)) {
      return true;
    }

    if (!this.isAgent()) {
      return false;
    }

    return this.shipment()?.assignmentDecisionStatus === AssignmentDecisionStatus.Accepted;
  };
  readonly canLogAttempt = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics, UserRole.Agent);
  readonly canManageOps = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics);
  readonly canAskOpsChatbot = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics, UserRole.Agent, UserRole.Dealer);
  readonly canEscalateDelay = () => {
    const shipment = this.shipment();
    if (!shipment || !this.authStore.hasRole(UserRole.Admin)) {
      return false;
    }

    const slaState = this.etaService.getEtaInfo(shipment).slaState;
    return slaState === 'at-risk' || slaState === 'delayed' || slaState === 'exception';
  };
  readonly canRaiseHandoverException = () => {
    if (!this.canManageOps()) {
      return false;
    }

    return this.opsState().handoverState !== 'completed';
  };
  readonly canScheduleRetry = () => {
    const shipment = this.shipment();
    if (!shipment || !this.canManageOps()) {
      return false;
    }

    return shipment.status === ShipmentStatus.DeliveryFailed
      || shipment.status === ShipmentStatus.Returned
      || this.latestAttemptRequiresRetry();
  };
  readonly canMarkHandoverCompleted = () => this.canManageOps() && this.opsState().handoverState !== 'completed';
  readonly canRateDeliveryAgent = () => {
    const shipment = this.shipment();
    if (!shipment || !this.isDealer()) {
      return false;
    }

    return !!shipment.assignedAgentId && shipment.status === ShipmentStatus.Delivered;
  };

  hasDeliveryAgentRating(): boolean {
    const rating = this.shipment()?.deliveryAgentRating;
    return rating !== undefined && rating !== null;
  }

  readonly canAcceptAssignment = () => {
    const shipment = this.shipment();
    const currentUserId = this.authStore.user()?.userId;
    if (!shipment || !currentUserId || !this.isAgent()) {
      return false;
    }

    if (!shipment.assignedAgentId || !this.isSameGuid(shipment.assignedAgentId, currentUserId)) {
      return false;
    }

    if (shipment.status === ShipmentStatus.Delivered || shipment.status === ShipmentStatus.Returned) {
      return false;
    }

    return shipment.assignmentDecisionStatus === AssignmentDecisionStatus.Pending;
  };
  readonly canRejectAssignment = () => this.canAcceptAssignment();
  readonly canMarkOutForDeliveryQuick = () => {
    const shipment = this.shipment();
    if (!shipment || !this.isAgent() || shipment.assignmentDecisionStatus !== AssignmentDecisionStatus.Accepted) {
      return false;
    }

    if (!this.hasAssignedVehicle(shipment)) {
      return false;
    }

    return shipment.status === ShipmentStatus.Assigned
      || shipment.status === ShipmentStatus.PickedUp
      || shipment.status === ShipmentStatus.InTransit;
  };
  readonly canApproveDeliveryQuick = () => {
    const shipment = this.shipment();
    if (!shipment || !this.isAgent() || shipment.assignmentDecisionStatus !== AssignmentDecisionStatus.Accepted) {
      return false;
    }

    if (!this.hasAssignedVehicle(shipment)) {
      return false;
    }

    return shipment.status === ShipmentStatus.OutForDelivery || shipment.status === ShipmentStatus.InTransit;
  };
  readonly isValidUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

  handoverStateLabel(): string {
    const state = this.opsState().handoverState;
    if (state === 'pending') return 'Pending';
    if (state === 'ready') return 'Ready';
    if (state === 'exception') return 'Exception';
    return 'Completed';
  }

  assignmentDecisionLabel(status: AssignmentDecisionStatus): string {
    if (status === AssignmentDecisionStatus.Accepted) return 'Accepted';
    if (status === AssignmentDecisionStatus.Rejected) return 'Rejected';
    return 'Pending';
  }

  assignmentDecisionBadge(status: AssignmentDecisionStatus): string {
    if (status === AssignmentDecisionStatus.Accepted) return 'badge badge-success';
    if (status === AssignmentDecisionStatus.Rejected) return 'badge badge-error';
    return 'badge badge-warning';
  }

  handoverStateBadge(): string {
    const state = this.opsState().handoverState;
    if (state === 'completed') return 'badge badge-success';
    if (state === 'ready') return 'badge badge-info';
    if (state === 'exception') return 'badge badge-error';
    return 'badge badge-warning';
  }

  nextRetryLabel(): string {
    const value = this.opsState().nextRetryAtUtc;
    if (!value) {
      return 'Not scheduled';
    }

    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  lastRetryScheduledLabel(): string {
    const value = this.opsState().lastRetryScheduledAtUtc;
    if (!value) {
      return 'Not scheduled';
    }

    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  attemptOutcomeLabel(outcome: DeliveryAttemptOutcome): string {
    if (outcome === 'failed') return 'Failed';
    if (outcome === 'rescheduled') return 'Rescheduled';
    if (outcome === 'no-response') return 'No Response';
    if (outcome === 'address-issue') return 'Address Issue';
    return 'Other';
  }

  attemptOutcomeBadge(outcome: DeliveryAttemptOutcome): string {
    if (outcome === 'failed') return 'badge badge-error';
    if (outcome === 'rescheduled') return 'badge badge-warning';
    if (outcome === 'no-response') return 'badge badge-warning';
    if (outcome === 'address-issue') return 'badge badge-error';
    return 'badge badge-neutral';
  }

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
        this.attempts.set(this.attemptsService.list(s.shipmentId));
        this.opsQueue.syncWithShipment(s.shipmentId, {
          assignedAgentId: s.assignedAgentId,
          vehicleNumber: s.vehicleNumber,
          status: s.status
        }).subscribe({
          next: state => this.opsState.set(state),
          error: () => this.opsState.set(this.buildFallbackOpsState(s))
        });
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

  logDeliveryAttempt(): void {
    const shipment = this.shipment();
    const reason = this.attemptReason.trim();
    const outcome = this.attemptOutcome;
    if (!shipment || !reason) {
      return;
    }

    this.attemptsService.add(
      shipment.shipmentId,
      reason,
      outcome,
      this.authStore.role() ?? 'System'
    );

    this.attemptReason = '';
    this.attemptOutcome = 'failed';
    this.showAttemptDialog.set(false);
    this.attempts.set(this.attemptsService.list(shipment.shipmentId));

    if (this.attemptOutcomeSuggestsRetry(outcome)) {
      const autoRetryAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      this.opsQueue.scheduleRetry(
        shipment.shipmentId,
        autoRetryAt.toISOString(),
        `Auto retry suggested from attempt outcome: ${this.attemptOutcomeLabel(outcome)}.`
      ).subscribe({
        next: state => this.opsState.set(state),
        error: () => {
          // Ignore retry sync failures; attempt log was persisted locally.
        }
      });
    }

    this.toast.success('Delivery attempt logged');
  }

  openRatingDialog(): void {
    const shipment = this.shipment();
    this.ratingScore = shipment?.deliveryAgentRating ?? 5;
    this.ratingComment = shipment?.deliveryAgentRatingComment ?? '';
    this.showRatingDialog.set(true);
  }

  saveAgentRating(): void {
    if (!this.canRateDeliveryAgent()) {
      this.toast.error('Delivery agent details are missing for rating');
      return;
    }

    const shipment = this.shipment();
    if (!shipment) {
      return;
    }

    this.actionLoading.set(true);

    this.logisticsApi.rateDeliveryAgent(shipment.shipmentId, {
      rating: this.ratingScore,
      comment: this.ratingComment.trim() || undefined
    }).subscribe({
      next: () => {
        this.showRatingDialog.set(false);
        this.toast.success('Delivery agent rating saved');
        this.loadShipment();
        this.actionLoading.set(false);
      },
      error: err => {
        this.actionLoading.set(false);
        this.toast.error(this.getErrorMessage(err, 'Failed to save delivery agent rating'));
      }
    });
  }

  raiseHandoverException(): void {
    const shipment = this.shipment();
    const reason = this.handoverExceptionReason.trim();
    if (!shipment || !reason) {
      return;
    }

    this.opsQueue.markHandoverException(shipment.shipmentId, reason).subscribe({
      next: state => {
        this.opsState.set(state);
        this.notificationApi.createManual({
          channel: NotificationChannel.InApp,
          title: `Handover exception: ${shipment.shipmentNumber}`,
          body: `Handover exception raised for shipment ${shipment.shipmentNumber}: ${reason}`
        }).subscribe({
          next: () => {
            this.toast.warning('Handover exception raised');
          },
          error: () => {
            this.toast.error('Handover exception saved, but notification dispatch failed');
          }
        });

        this.handoverExceptionReason = '';
        this.showHandoverExceptionDialog.set(false);
      },
      error: () => {
        this.toast.error('Failed to save handover exception state');
      }
    });
  }

  markHandoverCompleted(): void {
    const shipment = this.shipment();
    if (!shipment) {
      return;
    }

    this.opsQueue.markHandoverCompleted(shipment.shipmentId).subscribe({
      next: state => {
        this.opsState.set(state);
        this.toast.success('Handover marked as completed');
      },
      error: () => {
        this.toast.error('Failed to update handover state');
      }
    });
  }

  scheduleRetry(): void {
    const shipment = this.shipment();
    const dateInput = this.retryDate.trim();
    const reason = this.retryReason.trim();
    if (!shipment || !dateInput || !reason) {
      return;
    }

    const retryAt = new Date(dateInput);
    if (!Number.isFinite(retryAt.getTime())) {
      this.toast.error('Select a valid retry date');
      return;
    }

    retryAt.setHours(10, 0, 0, 0);
    this.opsQueue.scheduleRetry(shipment.shipmentId, retryAt.toISOString(), reason).subscribe({
      next: state => {
        this.opsState.set(state);
        this.showRetryDialog.set(false);
        this.retryDate = '';
        this.retryReason = '';

        this.notificationApi.createManual({
          channel: NotificationChannel.InApp,
          title: `Retry scheduled: ${shipment.shipmentNumber}`,
          body: `Retry has been scheduled for ${shipment.shipmentNumber} on ${retryAt.toLocaleDateString('en-IN')}. Reason: ${reason}`
        }).subscribe({
          next: () => {
            this.toast.info('Retry scheduled');
          },
          error: () => {
            this.toast.error('Retry state saved, but notification dispatch failed');
          }
        });
      },
      error: () => {
        this.toast.error('Failed to schedule retry state');
      }
    });
  }

  clearRetryRequirement(): void {
    const shipment = this.shipment();
    if (!shipment) {
      return;
    }

    this.opsQueue.clearRetry(shipment.shipmentId).subscribe({
      next: state => {
        this.opsState.set(state);
        this.toast.success('Retry requirement cleared');
      },
      error: () => {
        this.toast.error('Failed to clear retry requirement');
      }
    });
  }

  askOpsChatbot(): void {
    const message = this.chatPrompt.trim();
    if (!message || !this.canAskOpsChatbot()) {
      return;
    }

    this.chatLoading.set(true);
    this.logisticsApi.askChatbot({ message }).subscribe({
      next: response => {
        this.chatResponse.set(response);
        this.chatLoading.set(false);
      },
      error: err => {
        this.chatLoading.set(false);
        this.toast.error(this.getErrorMessage(err, 'Failed to fetch chatbot response'));
      }
    });
  }

  useSuggestedPrompt(prompt: string): void {
    this.chatPrompt = prompt;
  }

  acceptAssignment(): void {
    if (!this.canAcceptAssignment()) {
      return;
    }

    this.actionLoading.set(true);
    this.logisticsApi.acceptAssignment(this.id()).subscribe({
      next: () => {
        this.toast.success('Assignment accepted');
        this.actionLoading.set(false);
        this.loadShipment();
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to accept assignment'));
        this.actionLoading.set(false);
      }
    });
  }

  rejectAssignment(): void {
    if (!this.canRejectAssignment()) {
      return;
    }

    const reason = this.assignmentRejectReason.trim();
    if (!reason) {
      this.toast.error('Rejection reason is required');
      return;
    }

    this.actionLoading.set(true);
    this.logisticsApi.rejectAssignment(this.id(), { reason }).subscribe({
      next: () => {
        this.toast.success('Assignment rejected');
        this.assignmentRejectReason = '';
        this.showRejectAssignmentDialog.set(false);
        this.actionLoading.set(false);
        this.loadShipment();
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to reject assignment'));
        this.actionLoading.set(false);
      }
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

  openAssignDialog(): void {
    this.agentId = '';
    this.loadAssignableAgents();
    this.showAssignDialog.set(true);
  }

  private loadAssignableAgents(): void {
    this.agentsLoading.set(true);
    this.adminApi.getAgents(1, 100).subscribe({
      next: result => {
        const activeAgents = result.items.filter(agent => (agent.status ?? '').toLowerCase() === 'active');
        this.availableAgents.set(activeAgents);
        this.agentsLoading.set(false);
      },
      error: err => {
        this.availableAgents.set([]);
        this.agentsLoading.set(false);

        const status = (err as { status?: number })?.status;
        if (status === 405) {
          this.toast.error('IdentityAuth API is running an older build. Restart IdentityAuth and retry.');
          return;
        }

        this.toast.error(this.getErrorMessage(err, 'Failed to load agents list'));
      }
    });
  }

  private isSameGuid(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
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

  openStatusDialog(): void {
    const available = this.availableStatusOptions();
    if (!available.some(option => option.value === this.newStatus)) {
      this.newStatus = available[0]?.value ?? this.newStatus;
    }

    this.showStatusDialog.set(true);
  }

  markOutForDeliveryQuick(): void {
    if (!this.canMarkOutForDeliveryQuick()) {
      return;
    }

    this.newStatus = ShipmentStatus.OutForDelivery;
    this.statusNote = 'Shipment moved to out-for-delivery by assigned agent.';
    this.updateStatus();
  }

  approveDeliveryQuick(): void {
    if (!this.canApproveDeliveryQuick()) {
      return;
    }

    this.newStatus = ShipmentStatus.Delivered;
    this.statusNote = 'Delivery approved by assigned delivery agent.';
    this.updateStatus();
  }

  updateStatus(): void {
    const note = this.statusNote.trim();
    if (!note) {
      this.toast.error('Note is required');
      return;
    }

    const nextStatus = Number(this.newStatus) as ShipmentStatus;
    if (!this.availableStatusOptions().some(option => option.value === nextStatus)) {
      this.toast.error('You are not allowed to set this shipment status');
      return;
    }

    if (this.isAgent() && this.requiresVehicleForAgentStatus(nextStatus) && !this.hasAssignedVehicle()) {
      this.toast.error('Assign a vehicle before moving to In Transit, Out For Delivery, or Delivered');
      return;
    }

    this.actionLoading.set(true);
    this.logisticsApi.updateStatus(this.id(), { status: nextStatus, note }).subscribe({
      next: () => {
        const shipment = this.shipment();
        if (shipment && this.newStatus === ShipmentStatus.Delivered) {
          this.opsQueue.update(shipment.shipmentId, {
            handoverState: 'completed',
            handoverExceptionReason: undefined,
            retryRequired: false,
            retryReason: undefined,
            nextRetryAtUtc: undefined
          }).subscribe({
            next: state => this.opsState.set(state),
            error: () => {
              // Keep status update successful even if ops-state follow-up fails.
            }
          });
        }

        this.toast.success('Status updated');
        this.showStatusDialog.set(false);
        this.loadShipment();
        this.actionLoading.set(false);
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to update shipment status'));
        this.actionLoading.set(false);
      }
    });
  }

  escalateDelay(): void {
    const shipment = this.shipment();
    if (!shipment) {
      return;
    }

    const eta = this.etaService.getEtaInfo(shipment);
    this.actionLoading.set(true);

    this.notificationApi.createManual({
      channel: NotificationChannel.InApp,
      title: `Shipment ${shipment.shipmentNumber} ${eta.slaLabel}`,
      body: `SLA escalation required for shipment ${shipment.shipmentNumber}. Status: ${this.statusLabel(shipment.status)}. ETA: ${this.etaDateLabel(shipment)}. Window: ${eta.remainingLabel}.`
    }).subscribe({
      next: () => {
        this.toast.success('Delay escalation notification created');
        this.actionLoading.set(false);
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to escalate shipment delay'));
        this.actionLoading.set(false);
      }
    });
  }

  private getErrorMessage(err: unknown, fallback: string): string {
    const candidate = err as { error?: { message?: string; title?: string } };
    return candidate?.error?.message ?? candidate?.error?.title ?? fallback;
  }

  private requiresVehicleForAgentStatus(status: ShipmentStatus): boolean {
    return status === ShipmentStatus.InTransit
      || status === ShipmentStatus.OutForDelivery
      || status === ShipmentStatus.Delivered;
  }

  private attemptOutcomeSuggestsRetry(outcome: DeliveryAttemptOutcome): boolean {
    return outcome === 'failed'
      || outcome === 'rescheduled'
      || outcome === 'no-response'
      || outcome === 'address-issue';
  }

  private latestAttemptRequiresRetry(): boolean {
    const latest = this.attempts()[0];
    if (!latest) {
      return false;
    }

    return this.attemptOutcomeSuggestsRetry(latest.outcome);
  }

  private buildFallbackOpsState(shipment: ShipmentDto): ShipmentOpsState {
    const base: ShipmentOpsState = {
      shipmentId: shipment.shipmentId,
      handoverState: 'pending',
      retryRequired: false,
      retryCount: 0,
      updatedAtUtc: new Date().toISOString()
    };

    if (shipment.status === ShipmentStatus.Delivered) {
      return { ...base, handoverState: 'completed' };
    }

    const hasAgent = !!String(shipment.assignedAgentId ?? '').trim();
    const hasVehicle = !!String(shipment.vehicleNumber ?? '').trim();
    if (hasAgent && hasVehicle) {
      return { ...base, handoverState: 'ready' };
    }

    return base;
  }
}
