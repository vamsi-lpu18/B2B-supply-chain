import { Component, inject, signal, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentApiService } from '../../../core/api/payment-api.service';
import { NotificationApiService } from '../../../core/api/notification-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { InvoiceWorkflowService, InvoiceWorkflowState, InvoiceWorkflowStatus } from '../../../core/services/invoice-workflow.service';
import { InvoiceWorkflowActivity, InvoiceWorkflowActivityService } from '../../../core/services/invoice-workflow-activity.service';
import { InvoiceDto } from '../../../core/models/payment.models';
import { NotificationChannel, UserRole } from '../../../core/models/enums';

type InvoiceWorkflowComputedStatus = InvoiceWorkflowStatus | 'overdue';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-content feature-payments">
      <div class="page-header">
        <div>
          <a routerLink="/invoices" class="btn btn-ghost mb-2">← Invoices</a>
          <h1>{{ invoice()?.invoiceNumber ?? 'Invoice' }}</h1>
        </div>
        @if (invoice()) {
          <button class="btn btn-primary" (click)="download()" [disabled]="downloading()">
            @if (downloading()) { ⏳ } 📥 Download PDF  
          </button>
        }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:400px;border-radius:8px"></div>
      } @else if (invoice()) {
        <div class="card mb-4">
          <div class="invoice-header-grid">
            <div><span class="field-label">Invoice #</span><span class="fw-600">{{ invoice()!.invoiceNumber }}</span></div>
            <div><span class="field-label">Order ID</span><a [routerLink]="['/orders', invoice()!.orderId]" class="text-primary">View Order →</a></div>
            <div><span class="field-label">GST Type</span><span class="badge badge-info">{{ invoice()!.gstType }}</span></div>
            <div><span class="field-label">GST Rate</span><span>{{ invoice()!.gstRate }}%</span></div>
            <div><span class="field-label">Created</span><span>{{ invoice()!.createdAtUtc | date:'dd MMM yyyy' }}</span></div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <h2>Collection Workflow</h2>
            <span class="badge" [class]="workflowBadgeClass()">{{ workflowStatusLabel() }}</span>
          </div>

          <div class="invoice-header-grid mb-3">
            <div><span class="field-label">Due By</span><span>{{ dueDateLabel() }}</span></div>
            <div><span class="field-label">Aging</span><span>{{ agingLabel() }}</span></div>
            <div><span class="field-label">Reminders</span><span>{{ workflowState().reminderCount }}</span></div>
            <div><span class="field-label">Last Reminder</span><span>{{ lastReminderLabel() }}</span></div>
            <div><span class="field-label">Promise To Pay</span><span>{{ promiseToPayLabel() }}</span></div>
            <div><span class="field-label">Next Follow-up</span><span [class]="followUpDue() ? 'text-danger fw-600' : ''">{{ nextFollowUpLabel() }}</span></div>
          </div>

          @if (workflowState().internalNote) {
            <div class="mb-3">
              <span class="field-label">Ops Note</span>
              <p class="text-sm">{{ workflowState().internalNote }}</p>
            </div>
          }

          @if (isAdmin()) {
            <div class="form-grid">
              <div class="form-group">
                <label>Due Date</label>
                <input type="date" class="form-control" [(ngModel)]="workflowDueDate">
              </div>
              <div class="form-group">
                <label>Workflow Status</label>
                <select class="form-control" [(ngModel)]="workflowStatus">
                  <option value="pending">Pending</option>
                  <option value="reminder-sent">Reminder Sent</option>
                  <option value="promise-to-pay">Promise To Pay</option>
                  <option value="disputed">Disputed</option>
                  <option value="escalated">Escalated</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label>Promise To Pay Date</label>
                <input type="date" class="form-control" [(ngModel)]="promiseToPayDate">
              </div>
              <div class="form-group">
                <label>Next Follow-up</label>
                <input type="date" class="form-control" [value]="nextFollowUpInput()" readonly>
              </div>
            </div>

            <div class="form-group">
              <label>Internal Note</label>
              <textarea class="form-control" rows="3" maxlength="500" [(ngModel)]="workflowNote"></textarea>
            </div>

            <div class="d-flex gap-2 flex-wrap mt-3">
              <button class="btn btn-primary" (click)="saveWorkflow()" [disabled]="opsSaving()">Save Workflow</button>
              <button class="btn btn-secondary" (click)="setPromiseToPay()" [disabled]="opsActionLoading() || !promiseToPayDate.trim() || workflowComputedStatus() === 'paid'">Set Promise</button>
              <button class="btn btn-secondary" (click)="sendReminder()" [disabled]="opsActionLoading() || workflowComputedStatus() === 'paid'">Send Reminder</button>
              <button class="btn btn-success" (click)="markPaid()" [disabled]="workflowComputedStatus() === 'paid'">Mark Paid</button>
              <button class="btn btn-danger" (click)="escalate()" [disabled]="opsActionLoading() || workflowComputedStatus() === 'paid' || workflowComputedStatus() === 'escalated'">Escalate</button>
            </div>
          }
        </div>

        <div class="card mb-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <h2>Workflow Activity</h2>
            <span class="badge badge-primary">{{ activities().length }} event(s)</span>
          </div>

          @if (activities().length === 0) {
            <p class="text-sm text-secondary">No activity recorded yet.</p>
          } @else {
            <div class="timeline">
              @for (item of activities(); track item.activityId) {
                <div class="timeline-item">
                  <div class="timeline-time">{{ item.createdAtUtc | date:'dd MMM yyyy, HH:mm' }} · {{ item.createdByRole }}</div>
                  <div class="timeline-title"><span class="badge" [class]="activityBadge(item)">{{ activityLabel(item) }}</span></div>
                  <div class="timeline-body">{{ item.message }}</div>
                </div>
              }
            </div>
          }
        </div>

        <div class="card mb-4">
          <h2 class="mb-4">Line Items</h2>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Product</th><th>SKU</th><th>HSN</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
              <tbody>
                @for (l of invoice()!.lines; track l.invoiceLineId) {
                  <tr>
                    <td class="fw-600">{{ l.productName }}</td>
                    <td class="text-sm text-secondary">{{ l.sku }}</td>
                    <td class="text-sm">{{ l.hsnCode }}</td>
                    <td>{{ l.quantity }}</td>
                    <td>{{ l.unitPrice | currency:'INR':'symbol':'1.2-2' }}</td>
                    <td class="fw-600">{{ l.lineTotal | currency:'INR':'symbol':'1.2-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="max-width:300px;margin-left:auto">
          <div class="summary-row mb-2"><span>Subtotal</span><span>{{ invoice()!.subtotal | currency:'INR':'symbol':'1.2-2' }}</span></div>
          <div class="summary-row mb-2"><span>GST ({{ invoice()!.gstRate }}%)</span><span>{{ invoice()!.gstAmount | currency:'INR':'symbol':'1.2-2' }}</span></div>
          <div class="summary-divider"></div>
          <div class="summary-row fw-700" style="font-size:18px"><span>Grand Total</span><span class="text-primary">{{ invoice()!.grandTotal | currency:'INR':'symbol':'1.2-2' }}</span></div>
        </div>
      } @else {
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <div class="empty-title">Invoice not found</div>
          <a routerLink="/invoices" class="btn btn-primary mt-4">Back to Invoices</a>
        </div>
      }
    </div>
  `,
  styles: [`
    .invoice-header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .field-label { display: block; font-size: 11px; color: #616161; text-transform: uppercase; margin-bottom: 4px; }
    .summary-row { display: flex; justify-content: space-between; font-size: 14px; }
    .summary-divider { border-top: 1px solid #e0e0e0; margin: 8px 0; }
    @media (max-width: 700px) {
      .invoice-header-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .form-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class InvoiceDetailComponent implements OnInit {
  readonly id = input.required<string>();
  private readonly paymentApi = inject(PaymentApiService);
  private readonly notificationApi = inject(NotificationApiService);
  private readonly authStore = inject(AuthStore);
  private readonly toast      = inject(ToastService);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);
  private readonly workflowActivity = inject(InvoiceWorkflowActivityService);

  readonly loading    = signal(true);
  readonly downloading = signal(false);
  readonly opsSaving = signal(false);
  readonly opsActionLoading = signal(false);
  readonly invoice    = signal<InvoiceDto | null>(null);
  readonly activities = signal<InvoiceWorkflowActivity[]>([]);
  readonly workflowState = signal<InvoiceWorkflowState>({
    invoiceId: '',
    status: 'pending',
    dueAtUtc: new Date().toISOString(),
    internalNote: '',
    reminderCount: 0,
    updatedAtUtc: new Date().toISOString()
  });

  workflowDueDate = '';
  workflowStatus: InvoiceWorkflowStatus = 'pending';
  workflowNote = '';
  promiseToPayDate = '';
  readonly isAdmin = () => this.authStore.hasRole(UserRole.Admin);

  ngOnInit(): void {
    this.paymentApi.getInvoiceById(this.id()).subscribe({
      next: i => {
        this.invoice.set(i);
        this.loadWorkflow(i);
        this.loadActivities(i.invoiceId);
      },
      error: () => { this.invoice.set(null); this.loading.set(false); }
    });
  }

  dueDateLabel(): string {
    return new Date(this.workflowState().dueAtUtc).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  agingLabel(): string {
    const days = this.daysPastDue();
    return days === 0 ? 'Current' : `${days} day(s) overdue`;
  }

  lastReminderLabel(): string {
    const value = this.workflowState().lastReminderAtUtc;
    if (!value) {
      return 'Not sent';
    }

    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  promiseToPayLabel(): string {
    const value = this.workflowState().promiseToPayAtUtc;
    if (!value) {
      return 'Not set';
    }

    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  nextFollowUpLabel(): string {
    const value = this.workflowState().nextFollowUpAtUtc;
    if (!value) {
      return 'Not scheduled';
    }

    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  nextFollowUpInput(): string {
    const value = this.workflowState().nextFollowUpAtUtc;
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }

  followUpDue(): boolean {
    const value = this.workflowState().nextFollowUpAtUtc;
    if (!value) {
      return false;
    }

    const followUpAt = new Date(value).getTime();
    return Number.isFinite(followUpAt) && followUpAt <= Date.now();
  }

  workflowComputedStatus(): InvoiceWorkflowComputedStatus {
    const status = this.workflowState().status;
    if (status === 'paid' || status === 'disputed' || status === 'escalated') {
      return status;
    }

    return this.daysPastDue() > 0 ? 'overdue' : status;
  }

  workflowStatusLabel(): string {
    const status = this.workflowComputedStatus();
    if (status === 'pending') return 'Pending';
    if (status === 'reminder-sent') return 'Reminder Sent';
    if (status === 'promise-to-pay') return 'Promise To Pay';
    if (status === 'paid') return 'Paid';
    if (status === 'disputed') return 'Disputed';
    if (status === 'escalated') return 'Escalated';
    return 'Overdue';
  }

  workflowBadgeClass(): string {
    const status = this.workflowComputedStatus();
    if (status === 'paid') return 'badge badge-success';
    if (status === 'disputed') return 'badge badge-warning';
    if (status === 'escalated') return 'badge badge-error';
    if (status === 'reminder-sent' || status === 'promise-to-pay') return 'badge badge-info';
    if (status === 'overdue') return 'badge badge-error';
    return 'badge badge-neutral';
  }

  saveWorkflow(): void {
    const invoice = this.invoice();
    if (!invoice) {
      return;
    }

    this.opsSaving.set(true);
    this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, {
      status: this.workflowStatus,
      dueAtUtc: this.resolveDueAtUtc(invoice.createdAtUtc),
      internalNote: this.workflowNote
    }).subscribe({
      next: next => {
        this.applyWorkflow(next);
        this.recordActivity('workflow-saved', 'Collection workflow details were updated.');
        this.opsSaving.set(false);
        this.toast.success('Collection workflow updated');
      },
      error: () => {
        this.toast.error('Failed to update collection workflow');
        this.opsSaving.set(false);
      }
    });
  }

  setPromiseToPay(): void {
    const invoice = this.invoice();
    const promiseDate = this.promiseToPayDate.trim();
    if (!invoice || !promiseDate || this.workflowComputedStatus() === 'paid') {
      return;
    }

    const promiseUtc = this.resolvePromiseToPayAtUtc();
    this.opsActionLoading.set(true);
    this.invoiceWorkflow.setPromiseToPay(invoice.invoiceId, invoice.createdAtUtc, promiseUtc, this.workflowNote).subscribe({
      next: next => {
        this.applyWorkflow(next);
        this.recordActivity('promise-to-pay', `Promise to pay committed for ${this.promiseToPayLabel()}.`);
        this.toast.info('Promise-to-pay target set');
        this.opsActionLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to set promise-to-pay target');
        this.opsActionLoading.set(false);
      }
    });
  }

  sendReminder(): void {
    const invoice = this.invoice();
    if (!invoice || this.workflowComputedStatus() === 'paid') {
      return;
    }

    this.opsActionLoading.set(true);
    this.invoiceWorkflow.markReminderSent(invoice.invoiceId, invoice.createdAtUtc).subscribe({
      next: next => {
        this.applyWorkflow(next);

        this.notificationApi.createManual({
          channel: NotificationChannel.Email,
          title: `Payment reminder: ${invoice.invoiceNumber}`,
          body: `Invoice ${invoice.invoiceNumber} for ${this.formatCurrency(invoice.grandTotal)} is due by ${this.dueDateLabel()}. Please arrange payment at the earliest.`
        }).subscribe({
          next: () => {
            this.recordActivity('reminder-sent', 'Payment reminder sent to dealer.');
            this.toast.success('Reminder sent');
            this.opsActionLoading.set(false);
          },
          error: () => {
            this.toast.error('Reminder state saved, but notification dispatch failed');
            this.opsActionLoading.set(false);
          }
        });
      },
      error: () => {
        this.toast.error('Failed to update reminder workflow state');
        this.opsActionLoading.set(false);
      }
    });
  }

  markPaid(): void {
    const invoice = this.invoice();
    if (!invoice) {
      return;
    }

    this.opsActionLoading.set(true);
    this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, { status: 'paid' }).subscribe({
      next: next => {
        this.applyWorkflow(next);
        this.recordActivity('marked-paid', 'Invoice marked as paid.');
        this.toast.success('Invoice marked as paid');
        this.opsActionLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to mark invoice as paid');
        this.opsActionLoading.set(false);
      }
    });
  }

  escalate(): void {
    const invoice = this.invoice();
    if (!invoice || this.workflowComputedStatus() === 'paid') {
      return;
    }

    this.opsActionLoading.set(true);
    this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, { status: 'escalated' }).subscribe({
      next: next => {
        this.applyWorkflow(next);

        this.notificationApi.createManual({
          channel: NotificationChannel.InApp,
          title: `Invoice escalated: ${invoice.invoiceNumber}`,
          body: `Invoice ${invoice.invoiceNumber} has been escalated for collection follow-up. Aging: ${this.agingLabel()}.`
        }).subscribe({
          next: () => {
            this.recordActivity('escalated', 'Invoice escalated for collection follow-up.');
            this.toast.warning('Invoice escalated for collection follow-up');
            this.opsActionLoading.set(false);
          },
          error: () => {
            this.toast.error('Escalation state saved, but notification dispatch failed');
            this.opsActionLoading.set(false);
          }
        });
      },
      error: () => {
        this.toast.error('Failed to escalate invoice workflow');
        this.opsActionLoading.set(false);
      }
    });
  }

  download(): void {
    this.downloading.set(true);
    this.paymentApi.downloadInvoice(this.id()).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${this.invoice()?.invoiceNumber ?? this.id()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloading.set(false);
      },
      error: () => { this.toast.error('PDF not available'); this.downloading.set(false); }
    });
  }

  private applyWorkflow(state: InvoiceWorkflowState): void {
    this.workflowState.set(state);
    this.workflowStatus = state.status;
    this.workflowDueDate = this.toDateInput(state.dueAtUtc);
    this.workflowNote = state.internalNote;
    this.promiseToPayDate = this.toDateInput(state.promiseToPayAtUtc ?? '');
  }

  activityLabel(item: InvoiceWorkflowActivity): string {
    if (item.type === 'workflow-saved') return 'Workflow Updated';
    if (item.type === 'reminder-sent') return 'Reminder Sent';
    if (item.type === 'promise-to-pay') return 'Promise To Pay';
    if (item.type === 'marked-paid') return 'Marked Paid';
    if (item.type === 'marked-disputed') return 'Marked Disputed';
    if (item.type === 'escalated') return 'Escalated';
    return 'Auto Follow-up';
  }

  activityBadge(item: InvoiceWorkflowActivity): string {
    if (item.type === 'marked-paid') return 'badge badge-success';
    if (item.type === 'escalated' || item.type === 'auto-follow-up') return 'badge badge-error';
    if (item.type === 'promise-to-pay') return 'badge badge-info';
    if (item.type === 'reminder-sent') return 'badge badge-warning';
    return 'badge badge-neutral';
  }

  private resolvePromiseToPayAtUtc(): string {
    const fromInput = this.promiseToPayDate.trim();
    if (fromInput) {
      const date = new Date(fromInput);
      if (Number.isFinite(date.getTime())) {
        date.setHours(23, 59, 59, 999);
        return date.toISOString();
      }
    }

    return new Date().toISOString();
  }

  private resolveDueAtUtc(createdAtUtc: string): string {
    const fromInput = this.workflowDueDate.trim();
    if (fromInput) {
      const date = new Date(fromInput);
      if (Number.isFinite(date.getTime())) {
        date.setHours(23, 59, 59, 999);
        return date.toISOString();
      }
    }

    const fallback = new Date(createdAtUtc);
    if (Number.isFinite(fallback.getTime())) {
      fallback.setDate(fallback.getDate() + 7);
      return fallback.toISOString();
    }

    return new Date().toISOString();
  }

  private toDateInput(iso: string): string {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }

  private daysPastDue(): number {
    const dueAt = new Date(this.workflowState().dueAtUtc).getTime();
    if (!Number.isFinite(dueAt)) {
      return 0;
    }

    const diffMs = Date.now() - dueAt;
    if (diffMs <= 0) {
      return 0;
    }

    return Math.floor(diffMs / 86400000);
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  private loadWorkflow(invoice: InvoiceDto): void {
    this.invoiceWorkflow.get(invoice.invoiceId, invoice.createdAtUtc).subscribe({
      next: workflow => {
        const patch = this.invoiceWorkflow.computeAutomationPatch(workflow);
        if (!patch) {
          this.applyWorkflow(workflow);
          this.loading.set(false);
          return;
        }

        const autoFollowUpTriggered = workflow.status === 'promise-to-pay' && patch.status === 'reminder-sent';
        this.invoiceWorkflow.update(invoice.invoiceId, invoice.createdAtUtc, patch).subscribe({
          next: automated => {
            this.applyWorkflow(automated);
            if (autoFollowUpTriggered) {
              this.recordActivity(
                'auto-follow-up',
                'Promise-to-pay date elapsed. Follow-up reminder was auto-scheduled.'
              );
            }

            this.loading.set(false);
          },
          error: () => {
            this.applyWorkflow(workflow);
            this.loading.set(false);
          }
        });
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  private loadActivities(invoiceId: string): void {
    this.workflowActivity.list(invoiceId).subscribe({
      next: items => this.activities.set(items),
      error: () => this.activities.set([])
    });
  }

  private recordActivity(type: InvoiceWorkflowActivity['type'], message: string): void {
    const invoice = this.invoice();
    if (!invoice) {
      return;
    }

    this.workflowActivity.add(invoice.invoiceId, type, message, this.authStore.role() ?? 'System').subscribe({
      next: () => this.loadActivities(invoice.invoiceId),
      error: () => {
        // Ignore activity write failures; workflow state is already persisted.
      }
    });
  }
}
