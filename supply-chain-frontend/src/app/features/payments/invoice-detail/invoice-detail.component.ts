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
  templateUrl: './invoice-detail.component.html',
  styleUrl: './invoice-detail.component.scss'
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
