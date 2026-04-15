import { Component, inject, signal, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of } from 'rxjs';
import { OrderApiService, AdminOrderApiService } from '../../../core/api/order-api.service';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { CartStore } from '../../../core/stores/cart.store';
import { ToastService } from '../../../core/services/toast.service';
import { OrderOpsNote, OrderOpsNotesService } from '../../../core/services/order-ops-notes.service';
import { OrderDto } from '../../../core/models/order.models';
import { CreditHoldStatus, LOGISTICS_MANAGED_ORDER_STATUSES, ORDER_STATUS_BADGE, ORDER_STATUS_LABELS, ORDER_STATUS_TRANSITIONS, OrderStatus, PaymentMode, UserRole } from '../../../core/models/enums';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content feature-orders">
      <div class="page-header">
        <div>
          <a routerLink="/orders" class="btn btn-ghost mb-2">← Orders</a>
          <h1>{{ order()?.orderNumber ?? 'Order Detail' }}</h1>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          @if (canTrackDelivery()) {
            <a [routerLink]="['/orders', id(), 'tracking']" class="btn btn-secondary">Track Delivery</a>
          }
          @if (canUpdateStatus()) {
            <button class="btn btn-secondary" (click)="showStatusDialog.set(true)">Update Status</button>
          }
          @if (canCancel()) {
            <button class="btn btn-danger" (click)="showCancelDialog.set(true)">Cancel Order</button>
          }
          @if (canReturn()) {
            <button class="btn btn-secondary" (click)="openReturnDialog()">Request Return</button>
          }
          @if (showReturnExpiredNotice()) {
            <button class="btn btn-ghost" disabled title="Returns are allowed only within 48 hours after delivery.">Return Expired</button>
          }
          @if (canReorder()) {
            <button class="btn btn-secondary" (click)="reorderItems()" [disabled]="actionLoading()">Reorder Items</button>
          }
          @if (canApproveHold()) {
            <button class="btn btn-primary" (click)="approveHold()">Approve Hold</button>
            <button class="btn btn-danger" (click)="showRejectHoldDialog.set(true)">Reject Hold</button>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:400px;border-radius:8px"></div>
      } @else if (order()) {
        <!-- Header Card -->
        <div class="card mb-4">
          <div class="order-header-grid">
            <div><span class="field-label">Status</span><span class="badge" [class]="statusBadge(order()!.status)">{{ statusLabel(order()!.status) }}</span></div>
            <div><span class="field-label">Payment</span><span>{{ order()!.paymentMode === 0 ? 'COD' : 'PrePaid' }}</span></div>
            <div><span class="field-label">Credit Hold</span><span>{{ creditHoldLabel(order()!.creditHoldStatus) }}</span></div>
            <div><span class="field-label">Total</span><span class="fw-700 text-primary" style="font-size:18px">{{ order()!.totalAmount | currency:'INR':'symbol':'1.2-2' }}</span></div>
            <div><span class="field-label">Placed At</span><span>{{ order()!.placedAtUtc | date:'dd MMM yyyy, HH:mm' }}</span></div>
            <div><span class="field-label">Dealer ID</span><span class="text-xs text-secondary">{{ order()!.dealerId }}</span></div>
          </div>
          @if (order()!.cancellationReason) {
            <div class="alert-error mt-4">Cancelled: {{ order()!.cancellationReason }}</div>
          }
        </div>

        <!-- Order Lines -->
        <div class="card mb-4">
          <h2 class="mb-4">Order Items</h2>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
              <tbody>
                @for (line of order()!.lines; track line.orderLineId) {
                  <tr>
                    <td class="fw-600">{{ line.productName }}</td>
                    <td class="text-sm text-secondary">{{ line.sku }}</td>
                    <td>{{ line.quantity }}</td>
                    <td>{{ line.unitPrice | currency:'INR':'symbol':'1.2-2' }}</td>
                    <td class="fw-600">{{ line.lineTotal | currency:'INR':'symbol':'1.2-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Status History -->
        <div class="card mb-4">
          <h2 class="mb-4">Status History</h2>
          <div class="timeline">
            @for (h of order()!.statusHistory; track h.historyId) {
              <div class="timeline-item">
                <div class="timeline-time">{{ h.changedAtUtc | date:'dd MMM yyyy, HH:mm' }} · {{ h.changedByRole }}</div>
                <div class="timeline-title">{{ statusLabel(h.fromStatus) }} → {{ statusLabel(h.toStatus) }}</div>
              </div>
            }
          </div>
        </div>

        @if (canManageOpsNotes()) {
          <div class="card mb-4">
            <h2 class="mb-4">Operations Notes & Tags</h2>
            <div class="form-group">
              <label>Internal Note</label>
              <textarea class="form-control" [(ngModel)]="opsNoteText" rows="3" maxlength="500" placeholder="Add operational context, escalation details, or handling notes..."></textarea>
            </div>
            <div class="form-group">
              <label>Tags (comma separated)</label>
              <input class="form-control" [(ngModel)]="opsNoteTags" maxlength="200" placeholder="priority, fragile, vip">
            </div>
            <div class="d-flex gap-2 mb-3">
              <button class="btn btn-primary btn-sm" (click)="addOpsNote()" [disabled]="!opsNoteText.trim()">Add Note</button>
            </div>

            @if (opsNotes().length === 0) {
              <p class="text-sm text-secondary">No internal notes yet.</p>
            } @else {
              <div class="ops-note-list">
                @for (n of opsNotes(); track n.noteId) {
                  <div class="ops-note-item">
                    <div class="d-flex gap-2 align-center flex-wrap mb-1">
                      <span class="text-xs text-secondary">{{ n.createdAtUtc | date:'dd MMM yyyy, HH:mm' }} · {{ n.createdByRole }}</span>
                      @for (tag of n.tags; track tag) {
                        <span class="badge badge-info text-xs">{{ tag }}</span>
                      }
                    </div>
                    <div class="text-sm">{{ n.text }}</div>
                    <div class="mt-2">
                      <button class="btn btn-ghost btn-sm" (click)="removeOpsNote(n.noteId)">Remove</button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- Return Request -->
        @if (order()!.returnRequest) {
          <div class="card">
            <h2 class="mb-4">Return Request</h2>
            <p><strong>Reason:</strong> {{ order()!.returnRequest!.reason }}</p>
            <p><strong>Requested:</strong> {{ order()!.returnRequest!.requestedAtUtc | date:'dd MMM yyyy' }}</p>
            @if (order()!.returnRequest!.isApproved) { <span class="badge badge-success">Approved</span> }
            @if (order()!.returnRequest!.isRejected) { <span class="badge badge-error">Rejected</span> }
            @if (canReviewReturn()) {
              <div class="d-flex gap-2 mt-3">
                <button class="btn btn-primary" (click)="approveReturn()" [disabled]="actionLoading()">Approve Return</button>
                <button class="btn btn-danger" (click)="showRejectReturnDialog.set(true)" [disabled]="actionLoading()">Reject Return</button>
              </div>
            }
          </div>
        }
      } @else {
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <div class="empty-title">Order not found</div>
          <a routerLink="/orders" class="btn btn-primary mt-4">Back to Orders</a>
        </div>
      }

      <!-- Cancel Dialog -->
      @if (showCancelDialog()) {
        <div class="modal-backdrop" (click)="showCancelDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Cancel Order</h2><button class="btn btn-ghost btn-icon" (click)="showCancelDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Reason *</label>
                <textarea class="form-control" [(ngModel)]="cancelReason" rows="3" maxlength="500" placeholder="Reason for cancellation..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showCancelDialog.set(false)">Back</button>
              <button class="btn btn-danger" (click)="cancelOrder()" [disabled]="!cancelReason.trim() || actionLoading()">Cancel Order</button>
            </div>
          </div>
        </div>
      }

      <!-- Return Dialog -->
      @if (showReturnDialog()) {
        <div class="modal-backdrop" (click)="showReturnDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Request Return</h2><button class="btn btn-ghost btn-icon" (click)="showReturnDialog.set(false)">✕</button></div>
            <div class="modal-body">
              @if (isReturnWindowExpired()) {
                <div class="alert-error mb-3">Return window expired on {{ returnWindowExpiryLabel() }}.</div>
              }
              <div class="form-group">
                <label>Reason *</label>
                <textarea class="form-control" [(ngModel)]="returnReason" rows="3" maxlength="500" placeholder="Reason for return..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showReturnDialog.set(false)">Back</button>
              <button class="btn btn-primary" (click)="requestReturn()" [disabled]="!returnReason.trim() || actionLoading() || isReturnWindowExpired()">Submit Return</button>
            </div>
          </div>
        </div>
      }

      <!-- Update Status Dialog -->
      @if (showStatusDialog()) {
        <div class="modal-backdrop" (click)="showStatusDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Update Status</h2><button class="btn btn-ghost btn-icon" (click)="showStatusDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>New Status</label>
                <select class="form-control" [(ngModel)]="newStatus">
                  @for (s of nextStatuses(); track s) {
                    <option [ngValue]="s">{{ statusLabel(s) }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showStatusDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="updateStatus()" [disabled]="actionLoading() || nextStatuses().length === 0">Update</button>
            </div>
          </div>
        </div>
      }

      <!-- Reject Hold Dialog -->
      @if (showRejectHoldDialog()) {
        <div class="modal-backdrop" (click)="showRejectHoldDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Reject Hold</h2><button class="btn btn-ghost btn-icon" (click)="showRejectHoldDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Reason</label>
                <textarea class="form-control" [(ngModel)]="rejectHoldReason" rows="3"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showRejectHoldDialog.set(false)">Cancel</button>
              <button class="btn btn-danger" (click)="rejectHold()" [disabled]="actionLoading()">Reject</button>
            </div>
          </div>
        </div>
      }

      @if (showRejectReturnDialog()) {
        <div class="modal-backdrop" (click)="showRejectReturnDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header"><h2>Reject Return</h2><button class="btn btn-ghost btn-icon" (click)="showRejectReturnDialog.set(false)">✕</button></div>
            <div class="modal-body">
              <div class="form-group">
                <label>Reason</label>
                <textarea class="form-control" [(ngModel)]="rejectReturnReason" rows="3"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showRejectReturnDialog.set(false)">Cancel</button>
              <button class="btn btn-danger" (click)="rejectReturn()" [disabled]="actionLoading()">Reject Return</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .order-header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .field-label { display: block; font-size: 11px; color: #616161; text-transform: uppercase; margin-bottom: 4px; }
    .alert-error { background: #ffebee; color: #c62828; border-radius: 4px; padding: 10px 12px; font-size: 14px; }
    @media (max-width: 600px) { .order-header-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class OrderDetailComponent implements OnInit {
  readonly id = input.required<string>();
  private readonly returnWindowHours = 48;

  private readonly orderApi      = inject(OrderApiService);
  private readonly adminOrderApi = inject(AdminOrderApiService);
  private readonly catalogApi    = inject(CatalogApiService);
  private readonly cartStore     = inject(CartStore);
  private readonly authStore     = inject(AuthStore);
  private readonly toast         = inject(ToastService);
  private readonly orderOpsNotes = inject(OrderOpsNotesService);

  readonly loading             = signal(true);
  readonly actionLoading       = signal(false);
  readonly order               = signal<OrderDto | null>(null);
  readonly opsNotes            = signal<OrderOpsNote[]>([]);
  readonly showCancelDialog    = signal(false);
  readonly showReturnDialog    = signal(false);
  readonly showStatusDialog    = signal(false);
  readonly showRejectHoldDialog = signal(false);
  readonly showRejectReturnDialog = signal(false);

  cancelReason    = '';
  returnReason    = '';
  rejectHoldReason = '';
  rejectReturnReason = '';
  opsNoteText = '';
  opsNoteTags = '';
  newStatus: OrderStatus = OrderStatus.Processing;

  statusLabel(s: OrderStatus): string { return ORDER_STATUS_LABELS[s] ?? String(s); }
  statusBadge(s: OrderStatus): string { return `badge ${ORDER_STATUS_BADGE[s] ?? 'badge-neutral'}`; }
  creditHoldLabel(s: CreditHoldStatus): string {
    return ['Not Required', 'Pending Approval', 'Approved', 'Rejected'][s] ?? String(s);
  }

  readonly isDealer    = () => this.authStore.hasRole(UserRole.Dealer);
  readonly isAdmin     = () => this.authStore.hasRole(UserRole.Admin);
  readonly canManageOpsNotes = () => this.authStore.hasRole(UserRole.Admin, UserRole.Warehouse, UserRole.Logistics);
  readonly canManageOrderLifecycle = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics, UserRole.Warehouse);

  canCancel(): boolean {
    const o = this.order();
    if (!o) return false;
    if (this.isDealer()) return o.status === OrderStatus.Placed || o.status === OrderStatus.OnHold;
    if (this.isAdmin()) return o.status !== OrderStatus.Cancelled && o.status !== OrderStatus.Closed;
    return false;
  }
  canReturn(): boolean {
    const currentOrder = this.order();
    return this.isDealer() && !!currentOrder
      && currentOrder.status === OrderStatus.Delivered
      && !currentOrder.returnRequest
      && !this.isReturnWindowExpired();
  }

  showReturnExpiredNotice(): boolean {
    const currentOrder = this.order();
    return this.isDealer() && !!currentOrder
      && currentOrder.status === OrderStatus.Delivered
      && !currentOrder.returnRequest
      && this.isReturnWindowExpired();
  }
  canReorder(): boolean {
    const o = this.order();
    return this.isDealer() && !!o && o.lines.length > 0;
  }
  canUpdateStatus(): boolean {
    return this.canManageOrderLifecycle() && this.nextStatuses().length > 0;
  }

  canTrackDelivery(): boolean {
    return this.authStore.hasRole(UserRole.Admin, UserRole.Dealer, UserRole.Logistics, UserRole.Agent);
  }
  canApproveHold(): boolean { return this.isAdmin() && this.order()?.status === OrderStatus.OnHold; }
  canReviewReturn(): boolean {
    const currentOrder = this.order();
    if (!this.isAdmin() || !currentOrder?.returnRequest) {
      return false;
    }

    return currentOrder.status === OrderStatus.ReturnRequested
      && !currentOrder.returnRequest.isApproved
      && !currentOrder.returnRequest.isRejected;
  }

  nextStatuses(): OrderStatus[] {
    const cur = this.order()?.status;
    if (cur === undefined) return [];

    const candidates = ORDER_STATUS_TRANSITIONS[cur] ?? [];
    return candidates.filter(status => this.canManageStatusTarget(status));
  }

  private canManageStatusTarget(target: OrderStatus): boolean {
    if (this.authStore.hasRole(UserRole.Admin)) {
      return true;
    }

    if (this.authStore.hasRole(UserRole.Logistics)) {
      return LOGISTICS_MANAGED_ORDER_STATUSES.includes(target);
    }

    if (this.authStore.hasRole(UserRole.Warehouse)) {
      return target === OrderStatus.ReadyForDispatch;
    }

    return false;
  }

  ngOnInit(): void { this.loadOrder(); }

  loadOrder(): void {
    this.orderApi.getOrderById(this.id()).subscribe({
      next: o => {
        this.order.set(o);
        const nexts = ORDER_STATUS_TRANSITIONS[o.status] ?? [];
        if (nexts.length > 0) this.newStatus = nexts[0];
        this.loadOpsNotes();
        this.loading.set(false);
      },
      error: () => { this.order.set(null); this.loading.set(false); }
    });
  }

  addOpsNote(): void {
    const text = this.opsNoteText.trim();
    if (!text) {
      return;
    }

    const tags = this.opsNoteTags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    this.orderOpsNotes.add(this.id(), text, tags, this.currentRoleLabel());
    this.opsNoteText = '';
    this.opsNoteTags = '';
    this.loadOpsNotes();
    this.toast.success('Internal note added');
  }

  removeOpsNote(noteId: string): void {
    this.orderOpsNotes.remove(this.id(), noteId);
    this.loadOpsNotes();
    this.toast.info('Internal note removed');
  }

  cancelOrder(): void {
    if (!this.cancelReason.trim()) return;
    this.actionLoading.set(true);
    this.orderApi.cancelOrder(this.id(), { reason: this.cancelReason }).subscribe({
      next: () => { this.toast.success('Order cancelled'); this.showCancelDialog.set(false); this.loadOrder(); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to cancel order'));
        this.actionLoading.set(false);
      }
    });
  }

  requestReturn(): void {
    if (!this.returnReason.trim()) return;

    if (this.isReturnWindowExpired()) {
      this.toast.error(`Return window expired on ${this.returnWindowExpiryLabel()}.`);
      this.showReturnDialog.set(false);
      return;
    }

    this.actionLoading.set(true);
    this.orderApi.requestReturn(this.id(), { reason: this.returnReason }).subscribe({
      next: () => { this.toast.success('Return request submitted'); this.showReturnDialog.set(false); this.loadOrder(); this.actionLoading.set(false); },
      error: () => {
        this.actionLoading.set(false);
      }
    });
  }

  openReturnDialog(): void {
    if (this.isReturnWindowExpired()) {
      this.toast.error(`Return window expired on ${this.returnWindowExpiryLabel()}.`);
      return;
    }

    this.showReturnDialog.set(true);
  }

  updateStatus(): void {
    const allowed = this.nextStatuses();
    const nextStatus = Number(this.newStatus) as OrderStatus;
    if (allowed.length === 0 || !allowed.includes(nextStatus)) {
      this.toast.error('No valid status transition available for this order');
      return;
    }

    this.actionLoading.set(true);
    this.orderApi.updateStatus(this.id(), { newStatus: nextStatus }).subscribe({
      next: () => { this.toast.success('Status updated'); this.showStatusDialog.set(false); this.loadOrder(); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to update order status'));
        this.actionLoading.set(false);
      }
    });
  }

  reorderItems(): void {
    const currentOrder = this.order();
    if (!currentOrder || currentOrder.lines.length === 0) {
      return;
    }

    this.actionLoading.set(true);

    forkJoin(
      currentOrder.lines.map(line =>
        this.catalogApi.getProductById(line.productId).pipe(
          map(product => ({ line, product })),
          catchError(() => of({ line, product: null }))
        )
      )
    ).subscribe({
      next: rows => {
        let added = 0;
        let skipped = 0;

        for (const row of rows) {
          const product = row.product;
          if (!product || !product.isActive || product.availableStock <= 0) {
            skipped += 1;
            continue;
          }

          const normalizedQty = this.cartStore.normalizeQuantity(row.line.quantity, product.minOrderQty, product.availableStock);
          if (normalizedQty <= 0) {
            skipped += 1;
            continue;
          }

          this.cartStore.addItem({
            productId: product.productId,
            productName: product.name,
            sku: product.sku,
            quantity: normalizedQty,
            unitPrice: product.unitPrice,
            minOrderQty: product.minOrderQty,
            availableStock: product.availableStock
          });
          added += 1;
        }

        this.actionLoading.set(false);

        if (added > 0) {
          this.toast.success(`${added} item${added === 1 ? '' : 's'} added to cart`);
        }

        if (skipped > 0) {
          this.toast.warning(`${skipped} item${skipped === 1 ? '' : 's'} skipped due to stock or inactive status`);
        }
      },
      error: () => {
        this.actionLoading.set(false);
        this.toast.error('Failed to reorder items');
      }
    });
  }

  approveHold(): void {
    this.actionLoading.set(true);
    this.adminOrderApi.approveHold(this.id()).subscribe({
      next: () => { this.toast.success('Hold approved'); this.loadOrder(); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to approve hold'));
        this.actionLoading.set(false);
      }
    });
  }

  rejectHold(): void {
    this.actionLoading.set(true);
    this.adminOrderApi.rejectHold(this.id(), { reason: this.rejectHoldReason }).subscribe({
      next: () => { this.toast.success('Hold rejected'); this.showRejectHoldDialog.set(false); this.loadOrder(); this.actionLoading.set(false); },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to reject hold'));
        this.actionLoading.set(false);
      }
    });
  }

  approveReturn(): void {
    this.actionLoading.set(true);
    this.adminOrderApi.approveReturn(this.id()).subscribe({
      next: () => {
        this.toast.success('Return approved');
        this.loadOrder();
        this.actionLoading.set(false);
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to approve return'));
        this.actionLoading.set(false);
      }
    });
  }

  rejectReturn(): void {
    this.actionLoading.set(true);
    this.adminOrderApi.rejectReturn(this.id(), { reason: this.rejectReturnReason }).subscribe({
      next: () => {
        this.toast.success('Return rejected');
        this.showRejectReturnDialog.set(false);
        this.loadOrder();
        this.actionLoading.set(false);
      },
      error: err => {
        this.toast.error(this.getErrorMessage(err, 'Failed to reject return'));
        this.actionLoading.set(false);
      }
    });
  }

  private getErrorMessage(err: unknown, fallback: string): string {
    const candidate = err as { error?: { message?: string; title?: string } };
    return candidate?.error?.message ?? candidate?.error?.title ?? fallback;
  }

  private returnWindowExpiryDate(): Date | null {
    const order = this.order();
    if (!order) {
      return null;
    }

    const deliveredAtUtc = order.statusHistory
      .filter(history => history.toStatus === OrderStatus.Delivered)
      .map(history => Date.parse(history.changedAtUtc))
      .filter(timestamp => Number.isFinite(timestamp))
      .sort((a, b) => b - a)[0];

    const startTimestamp = deliveredAtUtc ?? Date.parse(order.placedAtUtc);
    if (!Number.isFinite(startTimestamp)) {
      return null;
    }

    return new Date(startTimestamp + this.returnWindowHours * 60 * 60 * 1000);
  }

  isReturnWindowExpired(): boolean {
    const expiryDate = this.returnWindowExpiryDate();
    return !!expiryDate && expiryDate.getTime() < Date.now();
  }

  returnWindowExpiryLabel(): string {
    const expiryDate = this.returnWindowExpiryDate();
    if (!expiryDate) {
      return 'N/A';
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(expiryDate);
  }

  private loadOpsNotes(): void {
    this.opsNotes.set(this.orderOpsNotes.list(this.id()));
  }

  private currentRoleLabel(): string {
    const role = this.authStore.role();
    return role ?? 'System';
  }
}
