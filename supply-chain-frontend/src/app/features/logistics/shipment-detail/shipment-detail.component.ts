import { Component, inject, signal, OnInit, OnDestroy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LogisticsApiService } from '../../../core/api/logistics-api.service';
import { NotificationApiService } from '../../../core/api/notification-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { ShipmentEtaService } from '../../../core/services/shipment-eta.service';
import { DeliveryAttemptOutcome, ShipmentDeliveryAttempt, ShipmentDeliveryAttemptsService } from '../../../core/services/shipment-delivery-attempts.service';
import { ShipmentOpsQueueService, ShipmentOpsState } from '../../../core/services/shipment-ops-queue.service';
import {
  ShipmentDto,
  ShipmentAiRecommendationDto,
  ApproveAiRecommendationResultDto,
  AiRecommendationExecutionStepDto
} from '../../../core/models/logistics.models';
import { NotificationChannel, ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_BADGE, UserRole } from '../../../core/models/enums';
import { mockVehicleFleet, MockVehicleOption } from '../../../core/mocks/vehicle.mocks';

@Component({
  selector: 'app-shipment-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content feature-logistics">
      <div class="page-header">
        <div>
          <a routerLink="/shipments" class="btn btn-ghost mb-2">← Shipments</a>
          <h1>{{ shipment()?.shipmentNumber ?? 'Shipment Detail' }}</h1>
        </div>
        <div class="d-flex gap-2">
          @if (canMarkOutForDeliveryQuick()) {
            <button class="btn btn-secondary" (click)="markOutForDeliveryQuick()" [disabled]="actionLoading()">Mark Out For Delivery</button>
          }
          @if (canApproveDeliveryQuick()) {
            <button class="btn btn-primary" (click)="approveDeliveryQuick()" [disabled]="actionLoading()">Approve Delivery</button>
          }
          @if (canEscalateDelay()) {
            <button class="btn btn-danger" (click)="escalateDelay()" [disabled]="actionLoading()">Escalate Delay</button>
          }
          @if (canManageOps() && canRaiseHandoverException()) {
            <button class="btn btn-danger" (click)="showHandoverExceptionDialog.set(true)">Raise Handover Exception</button>
          }
          @if (canManageOps() && canScheduleRetry()) {
            <button class="btn btn-secondary" (click)="showRetryDialog.set(true)">Schedule Retry</button>
          }
          @if (canManageOps() && canMarkHandoverCompleted()) {
            <button class="btn btn-secondary" (click)="markHandoverCompleted()">Mark Handover Complete</button>
          }
          @if (canLogAttempt()) {
            <button class="btn btn-secondary" (click)="showAttemptDialog.set(true)">Log Attempt</button>
          }
          @if (canAssignAgent()) {
            <button class="btn btn-secondary" (click)="showAssignDialog.set(true)">Assign Agent</button>
          }
          @if (canAssignVehicle()) {
            <button class="btn btn-secondary" (click)="openVehicleDialog()">Assign Vehicle</button>
          }
          @if (canUpdateStatus()) {
            <button class="btn btn-primary" (click)="openStatusDialog()">Update Status</button>
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
            <div>
              <span class="field-label">Order</span>
              @if (isAgent()) {
                <a [routerLink]="['/orders', shipment()!.orderId, 'tracking']" class="text-primary">Track Order →</a>
              } @else {
                <a [routerLink]="['/orders', shipment()!.orderId]" class="text-primary">View Order →</a>
              }
            </div>
            <div><span class="field-label">Agent</span><span>{{ shipment()!.assignedAgentId ? (shipment()!.assignedAgentId | slice:0:8) + '...' : 'Unassigned' }}</span></div>
            <div><span class="field-label">Vehicle</span><span>{{ shipment()!.vehicleNumber || 'Unassigned' }}</span></div>
            <div><span class="field-label">Created</span><span>{{ shipment()!.createdAtUtc | date:'dd MMM yyyy, HH:mm' }}</span></div>
            <div><span class="field-label">Expected Delivery</span><span>{{ etaDateLabel(shipment()!) }}</span></div>
            <div><span class="field-label">SLA</span><span class="badge" [class]="slaBadgeClass(shipment()!)">{{ etaStatusLabel(shipment()!) }}</span></div>
            <div><span class="field-label">ETA Window</span><span>{{ etaRemainingLabel(shipment()!) }}</span></div>
            @if (shipment()!.deliveredAtUtc) {
              <div><span class="field-label">Delivered</span><span class="text-success fw-600">{{ shipment()!.deliveredAtUtc | date:'dd MMM yyyy, HH:mm' }}</span></div>
            }
          </div>
          <div class="mt-4">
            <span class="field-label">Delivery Address</span>
            <p>{{ shipment()!.deliveryAddress }}, {{ shipment()!.city }}, {{ shipment()!.state }} - {{ shipment()!.postalCode }}</p>
          </div>
        </div>

        <div class="card mb-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <h2>Handover And Retry Ops</h2>
            <span class="badge" [class]="handoverStateBadge()">{{ handoverStateLabel() }}</span>
          </div>

          <div class="shipment-header-grid">
            <div><span class="field-label">Handover State</span><span>{{ handoverStateLabel() }}</span></div>
            <div><span class="field-label">Retry Required</span><span>{{ opsState().retryRequired ? 'Yes' : 'No' }}</span></div>
            <div><span class="field-label">Retry Count</span><span>{{ opsState().retryCount }}</span></div>
            <div><span class="field-label">Next Retry</span><span>{{ nextRetryLabel() }}</span></div>
            <div><span class="field-label">Last Retry Scheduled</span><span>{{ lastRetryScheduledLabel() }}</span></div>
            <div><span class="field-label">Updated</span><span>{{ opsState().updatedAtUtc | date:'dd MMM yyyy, HH:mm' }}</span></div>
          </div>

          @if (opsState().handoverExceptionReason) {
            <div class="mt-3">
              <span class="field-label">Handover Exception</span>
              <p class="text-sm text-danger">{{ opsState().handoverExceptionReason }}</p>
            </div>
          }

          @if (opsState().retryReason) {
            <div class="mt-3">
              <span class="field-label">Retry Reason</span>
              <p class="text-sm">{{ opsState().retryReason }}</p>
            </div>
          }

          @if (canManageOps() && opsState().retryRequired) {
            <div class="mt-3 d-flex gap-2">
              <button class="btn btn-ghost btn-sm" (click)="clearRetryRequirement()">Clear Retry Requirement</button>
            </div>
          }
        </div>

        <div class="card mb-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <h2>AI Exception Playbook</h2>
            <div class="d-flex gap-2">
              @if (canGenerateAiRecommendation()) {
                <button class="btn btn-secondary" (click)="generateAiRecommendation()" [disabled]="aiGenerating() || aiApproving()">{{ aiGenerating() ? 'Generating...' : 'Generate Recommendation' }}</button>
              }
              @if (canApproveAiRecommendation()) {
                <button class="btn btn-primary" (click)="approveAiRecommendation()" [disabled]="aiApproving() || aiGenerating()">{{ aiApproving() ? 'Approving...' : 'Approve Recommendation' }}</button>
              }
            </div>
          </div>

          @if (aiRecommendation()) {
            <div class="shipment-header-grid">
              <div><span class="field-label">Playbook</span><span>{{ aiRecommendation()!.playbookType }}</span></div>
              <div><span class="field-label">Confidence</span><span class="badge" [class]="aiConfidenceBadgeClass(aiRecommendation()!.confidenceScore)">{{ (aiRecommendation()!.confidenceScore * 100) | number:'1.0-0' }}%</span></div>
              <div><span class="field-label">Approval Required</span><span>{{ aiRecommendation()!.requiresHumanApproval ? 'Yes' : 'No' }}</span></div>
              <div><span class="field-label">Generated At</span><span>{{ aiRecommendation()!.createdAtUtc | date:'dd MMM yyyy, HH:mm' }}</span></div>
            </div>

            <div class="mt-3">
              <span class="field-label">Explanation</span>
              <p class="text-sm">{{ aiRecommendation()!.explanationText }}</p>
            </div>

            <div class="mt-3">
              <span class="field-label">Suggested Actions</span>
              <div class="timeline mt-2">
                @for (action of aiRecommendation()!.suggestedActions; track $index) {
                  <div class="timeline-item">
                    <div class="timeline-title"><span class="badge badge-info">{{ formatAiActionType(action.actionType) }}</span></div>
                    <div class="timeline-body">{{ action.description }}</div>
                    <div class="text-xs text-secondary">Proposed value: {{ action.proposedValue }}</div>
                  </div>
                }
              </div>
            </div>
          } @else {
            <p class="text-sm text-secondary">No AI recommendation generated for this shipment yet.</p>
          }

          @if (aiApprovalResult()) {
            <div class="mt-4">
              <span class="field-label">Last Execution Result</span>
              <p class="text-sm">Approved at {{ aiApprovalResult()!.approvedAtUtc | date:'dd MMM yyyy, HH:mm' }}</p>
              <div class="timeline mt-2">
                @for (step of aiApprovalResult()!.steps; track $index) {
                  <div class="timeline-item">
                    <div class="timeline-title"><span class="badge" [class]="formatAiExecutionBadge(step)">{{ formatAiActionType(step.actionType) }}</span></div>
                    <div class="timeline-body">{{ step.message }}</div>
                  </div>
                }
              </div>
            </div>
          }
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

        <div class="card mt-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <h2>Delivery Attempts</h2>
            <span class="badge badge-primary">{{ attempts().length }} attempt(s)</span>
          </div>
          @if (attempts().length === 0) {
            <p class="text-sm text-secondary">No delivery attempts recorded yet.</p>
          } @else {
            <div class="timeline">
              @for (a of attempts(); track a.attemptId) {
                <div class="timeline-item">
                  <div class="timeline-time">{{ a.createdAtUtc | date:'dd MMM yyyy, HH:mm' }} · {{ a.createdByRole }}</div>
                  <div class="timeline-title"><span class="badge" [class]="attemptOutcomeBadge(a.outcome)">{{ attemptOutcomeLabel(a.outcome) }}</span></div>
                  <div class="timeline-body">{{ a.reason }}</div>
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
                  @for (s of availableStatusOptions(); track s.value) {
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

      <!-- Handover Exception Dialog -->
      @if (showHandoverExceptionDialog()) {
        <div class="modal-backdrop" (click)="showHandoverExceptionDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Raise Handover Exception</h2><button class="btn btn-ghost btn-icon" (click)="showHandoverExceptionDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Reason *</label>
                <textarea class="form-control" rows="3" maxlength="300" [(ngModel)]="handoverExceptionReason" placeholder="Explain what blocked handover"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showHandoverExceptionDialog.set(false)">Cancel</button>
              <button class="btn btn-danger" (click)="raiseHandoverException()" [disabled]="!handoverExceptionReason.trim()">Raise Exception</button>
            </div>
          </div>
        </div>
      }

      <!-- Schedule Retry Dialog -->
      @if (showRetryDialog()) {
        <div class="modal-backdrop" (click)="showRetryDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Schedule Retry</h2><button class="btn btn-ghost btn-icon" (click)="showRetryDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Retry Date *</label>
                <input type="date" class="form-control" [(ngModel)]="retryDate">
              </div>
              <div class="form-group">
                <label>Reason *</label>
                <textarea class="form-control" rows="3" maxlength="300" [(ngModel)]="retryReason" placeholder="Retry context"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showRetryDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="scheduleRetry()" [disabled]="!retryDate.trim() || !retryReason.trim()">Schedule Retry</button>
            </div>
          </div>
        </div>
      }

      <!-- Delivery Attempt Dialog -->
      @if (showAttemptDialog()) {
        <div class="modal-backdrop" (click)="showAttemptDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Log Delivery Attempt</h2><button class="btn btn-ghost btn-icon" (click)="showAttemptDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Outcome</label>
                <select class="form-control" [(ngModel)]="attemptOutcome">
                  <option value="failed">Failed</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="no-response">No Response</option>
                  <option value="address-issue">Address Issue</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label>Reason *</label>
                <textarea class="form-control" [(ngModel)]="attemptReason" rows="3" maxlength="500" placeholder="Reason for this delivery attempt"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAttemptDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="logDeliveryAttempt()" [disabled]="!attemptReason.trim()">Save Attempt</button>
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
  private readonly notificationApi = inject(NotificationApiService);
  private readonly etaService   = inject(ShipmentEtaService);
  private readonly authStore    = inject(AuthStore);
  private readonly toast        = inject(ToastService);
  private readonly attemptsService = inject(ShipmentDeliveryAttemptsService);
  private readonly opsQueue = inject(ShipmentOpsQueueService);

  readonly loading          = signal(true);
  readonly actionLoading    = signal(false);
  readonly aiGenerating     = signal(false);
  readonly aiApproving      = signal(false);
  readonly shipment         = signal<ShipmentDto | null>(null);
  readonly attempts         = signal<ShipmentDeliveryAttempt[]>([]);
  readonly aiRecommendation = signal<ShipmentAiRecommendationDto | null>(null);
  readonly aiApprovalResult = signal<ApproveAiRecommendationResultDto | null>(null);
  readonly opsState         = signal<ShipmentOpsState>({
    shipmentId: '',
    handoverState: 'pending',
    retryRequired: false,
    retryCount: 0,
    updatedAtUtc: new Date().toISOString()
  });
  readonly showAssignDialog = signal(false);
  readonly showVehicleDialog = signal(false);
  readonly showStatusDialog = signal(false);
  readonly showAttemptDialog = signal(false);
  readonly showHandoverExceptionDialog = signal(false);
  readonly showRetryDialog = signal(false);
  readonly mockVehicles = mockVehicleFleet;

  agentId    = '';
  vehicleNumber = '';
  selectedMockVehicle = '';
  statusNote = '';
  attemptReason = '';
  handoverExceptionReason = '';
  retryDate = '';
  retryReason = '';
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

    return this.statusOptions.filter(option =>
      option.value === ShipmentStatus.InTransit
      || option.value === ShipmentStatus.OutForDelivery
      || option.value === ShipmentStatus.Delivered
      || option.value === ShipmentStatus.DeliveryFailed
    );
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
  readonly isAgent = () => this.authStore.hasRole(UserRole.Agent);
  readonly canUpdateStatus = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics, UserRole.Agent);
  readonly canLogAttempt = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics, UserRole.Agent);
  readonly canManageOps = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics);
  readonly canGenerateAiRecommendation = () => {
    return !!this.shipment() && this.authStore.hasRole(UserRole.Admin, UserRole.Warehouse, UserRole.Logistics);
  };
  readonly canApproveAiRecommendation = () => {
    return !!this.aiRecommendation() && this.authStore.hasRole(UserRole.Admin, UserRole.Logistics);
  };
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
  readonly canMarkOutForDeliveryQuick = () => {
    const shipment = this.shipment();
    if (!shipment || !this.isAgent()) {
      return false;
    }

    return shipment.status === ShipmentStatus.Assigned
      || shipment.status === ShipmentStatus.PickedUp
      || shipment.status === ShipmentStatus.InTransit;
  };
  readonly canApproveDeliveryQuick = () => {
    const shipment = this.shipment();
    if (!shipment || !this.isAgent()) {
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

  aiConfidenceBadgeClass(confidenceScore: number): string {
    if (confidenceScore >= 0.85) return 'badge badge-success';
    if (confidenceScore >= 0.7) return 'badge badge-info';
    if (confidenceScore >= 0.5) return 'badge badge-warning';
    return 'badge badge-error';
  }

  formatAiActionType(actionType: string): string {
    if (actionType === 'update-status') return 'Update Status';
    if (actionType === 'set-retry-state') return 'Set Retry State';
    if (actionType === 'no-action') return 'No Action';
    return actionType;
  }

  formatAiExecutionBadge(step: AiRecommendationExecutionStepDto): string {
    if (step.result === 'executed') return 'badge badge-success';
    if (step.result === 'skipped') return 'badge badge-warning';
    if (step.result === 'no-op') return 'badge badge-neutral';
    return 'badge badge-info';
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

  generateAiRecommendation(): void {
    const shipment = this.shipment();
    if (!shipment) {
      return;
    }

    this.aiGenerating.set(true);
    this.logisticsApi.generateAiRecommendation(shipment.shipmentId).subscribe({
      next: recommendation => {
        this.aiRecommendation.set(recommendation);
        this.aiApprovalResult.set(null);
        this.toast.info('AI recommendation generated');
        this.aiGenerating.set(false);
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to generate AI recommendation'));
        this.aiGenerating.set(false);
      }
    });
  }

  approveAiRecommendation(): void {
    const recommendation = this.aiRecommendation();
    if (!recommendation) {
      return;
    }

    this.aiApproving.set(true);
    this.logisticsApi.approveAiRecommendation(recommendation.recommendationId).subscribe({
      next: result => {
        this.aiApprovalResult.set(result);
        this.aiRecommendation.set(null);
        this.shipment.set(result.shipment);

        this.opsQueue.syncWithShipment(result.shipment.shipmentId, {
          assignedAgentId: result.shipment.assignedAgentId,
          vehicleNumber: result.shipment.vehicleNumber,
          status: result.shipment.status
        }).subscribe({
          next: state => this.opsState.set(state),
          error: () => {
            // Keep approval successful even if ops-state sync fails.
          }
        });

        this.toast.success('AI recommendation approved');
        this.aiApproving.set(false);
        this.loadShipment();
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to approve AI recommendation'));
        this.aiApproving.set(false);
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
